import { readFile } from "node:fs/promises";
import { Client } from "pg";

await import("../src/data/product-name-substitution.js");

const env = await loadEnv();
const connectionString = normalizeConnectionString(env.DATABASE_URL ?? "");
if (!connectionString) throw new Error("Missing DATABASE_URL in .env");

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

await client.connect();
let movements;
let learningRows;
try {
  ({ rows: learningRows } = await client.query(`
    select pattern.source_pattern, pattern.target_pattern, pattern.sample_count,
           pattern.success_count, pattern.confidence, pattern.last_used_at,
           pattern.is_active, pattern.supplier_id, pattern.match_metadata,
           pattern.approval_source as source_type,
           supplier.supplier_name
      from public.ocr_pattern_learning pattern
      left join public.supplier_master supplier on supplier.id = pattern.supplier_id
     where pattern.pattern_type = 'PRODUCT_NAME_SUBSTITUTION'
       and pattern.is_active = true
       and pattern.confidence >= 90
       and pattern.success_count >= 1
  `));
  ({ rows: movements } = await client.query(`
    select raw_product_name, supplier_name, movement_type, movement_date,
           slaughter_date, expiry_date, created_at
      from public.inventory_movement
     where movement_date is not null
       and (slaughter_date is not null or expiry_date is not null)
     order by movement_date desc
     limit 5000
  `));
} finally {
  await client.end();
}

const names = globalThis.MEATOS_PRODUCT_NAMES;
names.configureLearnedPatterns(learningRows);

const classified = movements.map((movement) => ({
  movement,
  result: names.classify(movement.raw_product_name, {
    supplierName: movement.supplier_name,
    movementDate: movement.movement_date,
    slaughterDate: movement.slaughter_date,
    expiryDate: movement.expiry_date,
    createdAt: movement.created_at
  })
}));

const sourceCounts = countBy(classified, ({ result }) => result.storageSource);
const storageCounts = countBy(classified, ({ result }) => result.storage);
const unmarkedSimulation = movements.map((movement) => {
  const unmarkedName = String(movement.raw_product_name ?? "")
    .replace(/(?:냉장|냉동)/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return names.classify(unmarkedName, {
    supplierName: movement.supplier_name,
    movementDate: movement.movement_date,
    slaughterDate: movement.slaughter_date,
    expiryDate: movement.expiry_date,
    createdAt: movement.created_at
  });
});
const suspicious = classified
  .filter(({ movement, result }) =>
    result.storageSource === "explicit_name"
    && result.storage === "냉장"
    && movement.expiry_date
    && new Date(movement.movement_date) > new Date(movement.expiry_date)
  )
  .slice(0, 20)
  .map(({ movement, result }) => ({
    rawProductName: movement.raw_product_name,
    movementDate: dateOnly(movement.movement_date),
    expiryDate: dateOnly(movement.expiry_date),
    effective: result.storage,
    source: result.storageSource
  }));

console.log(JSON.stringify({
  auditedMovements: movements.length,
  sourceCounts,
  storageCounts,
  explicitNameOverridesDate: classified.filter(({ result }) => result.storageSource === "explicit_name").length,
  dateInferences: classified.filter(({ result }) =>
    result.storageSource === "expiry_date" || result.storageSource === "slaughter_age"
  ).length,
  unmarkedDateSimulation: {
    samples: unmarkedSimulation.length,
    sourceCounts: countBy(unmarkedSimulation, (result) => result.storageSource),
    storageCounts: countBy(unmarkedSimulation, (result) => result.storage)
  },
  suspiciousExplicitChilledPastExpiry: suspicious
}, null, 2));

function countBy(rows, selector) {
  const counts = {};
  for (const row of rows) {
    const key = selector(row) || "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function dateOnly(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : null;
}

async function loadEnv() {
  const text = await readFile(new URL("../.env", import.meta.url), "utf8");
  return Object.fromEntries(
    text.split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
      })
  );
}

function normalizeConnectionString(value) {
  return String(value).replace(/[?&]sslmode=[^&]+/i, "");
}
