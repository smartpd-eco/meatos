import { readFile } from "node:fs/promises";
import { Client } from "pg";

await import("../src/data/product-name-substitution.js");

const SUPPLIERS = [
  { code: "DAESAN_CHUKSAN", stride: 53 },
  { code: "SUP-GOOD-CHUKSAN", stride: 37 }
];
const TYPES = ["original", "origin_suffix", "spacing_punctuation", "vendor_tail", "storage_ocr_typo"];
const BASES_PER_SUPPLIER = 100;
const COMPACT = process.argv.includes("--compact");

const env = await loadEnv();
const connectionString = normalizeConnectionString(env.DATABASE_URL ?? "");
if (!connectionString) throw new Error("Missing DATABASE_URL in .env");

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

await client.connect();
let rows;
let verifiedCorrection;
try {
  ({ rows } = await client.query(`
    select pattern.source_pattern, pattern.target_pattern, pattern.sample_count,
           pattern.success_count, pattern.confidence, pattern.last_used_at,
           pattern.is_active, pattern.supplier_id, pattern.match_metadata,
           pattern.approval_source as source_type,
           supplier.supplier_name, supplier.supplier_code
      from public.ocr_pattern_learning pattern
      join public.supplier_master supplier on supplier.id = pattern.supplier_id
     where supplier.supplier_code = any($1::text[])
       and pattern.pattern_type = 'PRODUCT_NAME_SUBSTITUTION'
       and pattern.is_active = true
     order by supplier.supplier_code, pattern.source_pattern
  `, [SUPPLIERS.map((supplier) => supplier.code)]));

  ({ rows: verifiedCorrection } = await client.query(`
    select supplier.supplier_name, pattern.source_pattern, pattern.target_pattern,
           pattern.match_metadata, pattern.confidence, pattern.is_active
      from public.ocr_pattern_learning pattern
      join public.supplier_master supplier on supplier.id = pattern.supplier_id
     where supplier.supplier_code = 'SUP-GOOD-CHUKSAN'
       and lower(pattern.source_pattern) = lower($1)
     order by pattern.is_active desc, pattern.updated_at desc
  `, ["우목심(티스)"]));
} finally {
  await client.end();
}

const names = globalThis.MEATOS_PRODUCT_NAMES;
names.configureLearnedPatterns(rows);
const supplierGroups = Object.groupBy(rows, (row) => row.supplier_code);
const simulationRows = [];

for (const supplier of SUPPLIERS) {
  const learnedRows = supplierGroups[supplier.code] ?? [];
  if (learnedRows.length < BASES_PER_SUPPLIER) {
    throw new Error(`Insufficient active rules for ${supplier.code}`);
  }
  const bases = Array.from(
    { length: BASES_PER_SUPPLIER },
    (_, index) => learnedRows[(index * supplier.stride) % learnedRows.length]
  );
  for (let index = 0; index < bases.length; index += 1) {
    const row = bases[index];
    for (const type of TYPES) {
      const input = mutate(row.source_pattern, type, index);
      const supplierName = supplierContextName(row, index);
      const classification = names.classify(input, {
        supplierName,
        category: row.match_metadata?.category ?? ""
      });
      const expected = expectedStandardName(row, names);
      const success = Boolean(classification.learningMatch)
        && names.fingerprint(classification.displayName) === names.fingerprint(expected);
      const safeAbstention = !classification.learningMatch && type === "vendor_tail";
      simulationRows.push({
        supplier: row.supplier_name,
        supplierCode: row.supplier_code,
        type,
        source: row.source_pattern,
        input,
        expected,
        actual: classification.displayName,
        success,
        safeAbstention,
        passed: success || safeAbstention,
        matchType: classification.learningMatch ?? "none",
        category: row.match_metadata?.category ?? "미확인",
        storage: row.match_metadata?.storage ?? "미확인"
      });
    }
  }
}

const audit = auditRules(rows, names);
console.log(JSON.stringify({
  activeRules: Object.fromEntries(
    SUPPLIERS.map((supplier) => [supplier.code, (supplierGroups[supplier.code] ?? []).length])
  ),
  verifiedCorrection,
  simulation: {
    total: summarize(simulationRows),
    bySupplier: Object.fromEntries(
      SUPPLIERS.map((supplier) => [
        supplier.code,
        summarize(simulationRows.filter((row) => row.supplierCode === supplier.code))
      ])
    ),
    byType: Object.fromEntries(
      TYPES.map((type) => [type, summarize(simulationRows.filter((row) => row.type === type))])
    ),
    bySupplierType: Object.fromEntries(
      SUPPLIERS.map((supplier) => [
        supplier.code,
        Object.fromEntries(TYPES.map((type) => [
          type,
          summarize(simulationRows.filter(
            (row) => row.supplierCode === supplier.code && row.type === type
          ))
        ]))
      ])
    ),
    matchTypes: countBy(simulationRows, (row) => row.matchType),
    qualityGate: summarizeQuality(simulationRows),
    safeAbstentions: simulationRows.filter((row) => row.safeAbstention).slice(0, COMPACT ? 10 : 50),
    failures: simulationRows.filter((row) => !row.passed).slice(0, COMPACT ? 10 : 50)
  },
  audit: COMPACT ? {
    ...audit,
    crossSupplierConflicts: audit.crossSupplierConflicts.slice(0, 10),
    sameSupplierConflicts: audit.sameSupplierConflicts.slice(0, 10),
    semanticSuspects: audit.semanticSuspects.slice(0, 20)
  } : audit
}, null, 2));

const qualityGate = summarizeQuality(simulationRows);
if (qualityGate.incorrect > 0 || qualityGate.qualityRate < 99) {
  throw new Error(`Merged supplier simulation failed: ${JSON.stringify(qualityGate)}`);
}

function mutate(source, type, index) {
  if (type === "original") return source;
  if (type === "origin_suffix") return `${source} 국내산`;
  if (type === "spacing_punctuation") {
    return [...source].join(" ").replace(/\(/g, " [ ").replace(/\)/g, " ] ");
  }
  if (type === "vendor_tail") return `${source} 국내산 대전충남양돈농협`;

  const coldVariants = ["넥장", "넹장", "냉쟝"];
  const frozenVariants = ["넥동", "넹동", "냉돔"];
  if (source.includes("냉장")) return source.replace("냉장", coldVariants[index % coldVariants.length]);
  if (source.includes("냉동")) return source.replace("냉동", frozenVariants[index % frozenVariants.length]);
  return source;
}

function supplierContextName(row, index) {
  if (row.supplier_code !== "SUP-GOOD-CHUKSAN") return row.supplier_name;
  return index % 2 ? "(주) 좋은축산유통" : "(주)좋은축산유통";
}

function summarize(items) {
  const success = items.filter((row) => row.success).length;
  return {
    total: items.length,
    success,
    fail: items.length - success,
    rate: Number((success / items.length * 100).toFixed(1))
  };
}

function summarizeQuality(items) {
  const autoCorrect = items.filter((row) => row.success).length;
  const safeAbstention = items.filter((row) => row.safeAbstention).length;
  const incorrect = items.length - autoCorrect - safeAbstention;
  return {
    total: items.length,
    autoCorrect,
    safeAbstention,
    incorrect,
    autoApplyRate: Number((autoCorrect / items.length * 100).toFixed(1)),
    qualityRate: Number(((autoCorrect + safeAbstention) / items.length * 100).toFixed(1)),
    passed: incorrect === 0
  };
}

function expectedStandardName(row, productNames) {
  const text = String(row?.target_pattern ?? "");
  if (/(미전지|미젼지|미전쥐|미전디|미박\s*전지|미\s*앞다리살|미박\s*앞다리살?|앞다리살?\s*미박)/.test(text)) {
    const standardName = productNames.classify(text).displayName;
    const storage = String(row?.match_metadata?.storage ?? "");
    if (["냉장", "냉동"].includes(storage) && !/^(냉장|냉동)(?=\s|$)/.test(standardName)) {
      return `${storage} ${standardName}`;
    }
    return standardName;
  }
  return text;
}

function countBy(items, selector) {
  const counts = new Map();
  for (const item of items) {
    const key = selector(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function auditRules(learnedRows, productNames) {
  const sourceGroups = new Map();
  for (const row of learnedRows) {
    const key = productNames.fingerprint(row.source_pattern);
    const group = sourceGroups.get(key) ?? [];
    group.push(row);
    sourceGroups.set(key, group);
  }

  const crossSupplierConflicts = [];
  const sameSupplierConflicts = [];
  for (const [key, items] of sourceGroups) {
    const identities = new Set(items.map((row) => [
      row.match_metadata?.category ?? "",
      row.match_metadata?.storage ?? "",
      productNames.fingerprint(row.target_pattern)
    ].join("|")));
    if (identities.size < 2) continue;
    const detail = {
      key,
      count: items.length,
      mappings: items.map((row) => ({
        supplier: row.supplier_name,
        source: row.source_pattern,
        target: row.target_pattern,
        category: row.match_metadata?.category ?? "",
        storage: row.match_metadata?.storage ?? ""
      }))
    };
    const supplierCodes = new Set(items.map((row) => row.supplier_code));
    (supplierCodes.size > 1 ? crossSupplierConflicts : sameSupplierConflicts).push(detail);
  }

  const semanticSuspects = learnedRows.flatMap((row) => {
    const category = row.match_metadata?.category ?? "";
    const categorySignal = categorySpecies(category);
    const sourceSignal = explicitSpecies(row.source_pattern);
    const targetSignal = explicitSpecies(row.target_pattern);
    const reasons = [];
    if (sourceSignal && categorySignal && sourceSignal !== categorySignal) reasons.push("source_vs_category");
    if (targetSignal && categorySignal && targetSignal !== categorySignal) reasons.push("target_vs_category");
    return reasons.length ? [{
      supplier: row.supplier_name,
      source: row.source_pattern,
      target: row.target_pattern,
      category,
      storage: row.match_metadata?.storage ?? "",
      reasons
    }] : [];
  });

  return {
    crossSupplierConflictCount: crossSupplierConflicts.length,
    crossSupplierConflicts: crossSupplierConflicts.slice(0, 30),
    sameSupplierConflictCount: sameSupplierConflicts.length,
    sameSupplierConflicts: sameSupplierConflicts.slice(0, 20),
    semanticSuspectCount: semanticSuspects.length,
    semanticSuspects: semanticSuspects.slice(0, 50)
  };
}

function explicitSpecies(value) {
  const text = String(value ?? "");
  const beefTokens = ["한우", "육우", "와규", "우삼겹", "우목심", "우목살", "차돌", "우육", "소고기", "쇠고기"];
  const porkTokens = ["돼지", "돈육", "돈피", "돈족", "돈뼈", "돈갈비", "삼겹", "목살", "항정", "가브리", "미박"];
  if (beefTokens.some((token) => text.includes(token))) return "beef";
  if (porkTokens.some((token) => text.includes(token))) return "pork";
  return "";
}

function categorySpecies(value) {
  const text = String(value ?? "");
  if (text.startsWith("소고기")) return "beef";
  if (text.startsWith("돼지고기")) return "pork";
  return "";
}

async function loadEnv() {
  const raw = await readFile(".env", "utf8");
  const result = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const splitAt = trimmed.indexOf("=");
    if (splitAt < 0) continue;
    result[trimmed.slice(0, splitAt).trim()] = trimmed.slice(splitAt + 1).trim();
  }
  return result;
}

function normalizeConnectionString(value) {
  if (!value) return "";
  const url = new URL(value);
  url.searchParams.delete("sslmode");
  return url.toString();
}
