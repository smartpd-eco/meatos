import { readFile } from "node:fs/promises";
import { Client } from "pg";

const APPLY = process.argv.includes("--apply");
const GOOD_CHUKSAN = process.argv.includes("--good-chuksan");
const BEEF_NECK_CORRECTION = process.argv.includes("--beef-neck-correction");
const TENANT_ID = "881f6cc1-b552-468c-b9b4-152edb464e61";
const SUPPLIER_NAME = GOOD_CHUKSAN ? "좋은축산" : "대산축산";
const SUPPLIER_CODE = GOOD_CHUKSAN ? "SUP-GOOD-CHUKSAN" : "DAESAN_CHUKSAN";
const APPROVAL_SOURCE = BEEF_NECK_CORRECTION
  ? "USER_CONFIRMED_BEEF_NECK_20260728"
  : GOOD_CHUKSAN
  ? "AUTO_REVIEWED_GOOD_CHUKSAN_20260728"
  : "USER_CONFIRMED_DAESAN_20260728";
const CANDIDATE_FILE = GOOD_CHUKSAN
  ? "outputs/good-chuksan-learning-20260728/good-chuksan-learning-candidates.json"
  : "outputs/daesan-learning-20260728/daesan-learning-candidates.json";
const DICTIONARY_PREFIX = GOOD_CHUKSAN ? "GOOD-" : "DAESAN-";
const VERIFY_SOURCE_PATTERN = BEEF_NECK_CORRECTION
  ? "우목심(티스)"
  : (GOOD_CHUKSAN ? "냉동 미후지(황금)" : "통정육(닭)");
const SUPPLIER_NAME_ALIASES = GOOD_CHUKSAN
  ? ["좋은축산", "좋은축산유통", "(주)좋은축산유통", "(주) 좋은축산유통"]
  : ["대산축산"];

const env = await loadEnv();
const connectionString = normalizeConnectionString(env.DATABASE_URL ?? "");
if (!connectionString) throw new Error("Missing DATABASE_URL in .env");

const payload = JSON.parse(await readFile(CANDIDATE_FILE, "utf8"));
const sourceCandidates = BEEF_NECK_CORRECTION
  ? (payload.candidates ?? []).filter((candidate) =>
      /한우목심|우목심|알목심.*와규|목심.*한우\/(?:거세|암소)/.test(candidate.source_pattern ?? "")
    )
  : (payload.candidates ?? []);
const { candidates, conflicts } = deduplicateCandidates(sourceCandidates);
if (!candidates.length) throw new Error("No approved candidates found.");

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

await client.connect();
try {
  await client.query("begin");
  await requireLearningMetadata(client);

  const tenant = await client.query(
    "select id, tenant_code, tenant_name, status from public.tenant_master where id = $1",
    [TENANT_ID]
  );
  if (tenant.rowCount !== 1) throw new Error(`Tenant not found: ${TENANT_ID}`);

  const supplier = await ensureSupplier(client);
  await upsertSupplierNameAliases(client, supplier.id);
  await stageCandidates(client, candidates);
  const before = await learningCounts(client, supplier.id);

  await upsertDictionaries(client);
  await upsertSupplierAliases(client, supplier.id);
  await upsertOcrPatterns(client, supplier.id);
  await appendLearningHistory(client, supplier.id);
  await refreshDictionaryAliasCounts(client);

  const after = await learningCounts(client, supplier.id);
  const finalRule = await client.query(
    `select opl.source_pattern, opl.target_pattern, opl.match_metadata,
            opl.confidence, opl.success_count, opl.approval_source,
            sm.supplier_name
       from public.ocr_pattern_learning opl
       join public.supplier_master sm on sm.id = opl.supplier_id
      where opl.tenant_id = $1
        and opl.supplier_id = $2
        and lower(opl.source_pattern) = lower($3)
        and opl.is_active = true
      order by opl.confidence desc, opl.success_count desc, opl.updated_at desc`,
    [TENANT_ID, supplier.id, VERIFY_SOURCE_PATTERN]
  );

  if (APPLY) await client.query("commit");
  else await client.query("rollback");

  console.log(JSON.stringify({
    mode: APPLY ? "APPLIED" : "DRY_RUN_ROLLED_BACK",
    tenant: tenant.rows[0],
    supplier,
    candidateCount: candidates.length,
    excludedConflicts: {
      count: conflicts.length,
      samples: conflicts.slice(0, 20)
    },
    before,
    after,
    finalRule: finalRule.rows
  }, null, 2));
} catch (error) {
  await client.query("rollback").catch(() => {});
  throw error;
} finally {
  await client.end();
}

function deduplicateCandidates(rows) {
  const bySource = new Map();
  const conflicts = new Map();
  for (const row of rows) {
    const sourcePattern = clean(row.source_pattern);
    const targetPattern = clean(row.target_pattern);
    if (!sourcePattern || !targetPattern) continue;
    const normalizedName = fingerprint(sourcePattern);
    const candidate = {
      source_pattern: sourcePattern,
      target_pattern: targetPattern,
      normalized_name: normalizedName,
      category: clean(row.category),
      standard_cut: clean(row.standard_cut) || targetPattern,
      storage: clean(row.storage) || "미확인",
      confidence: Math.max(90, Math.min(100, Number(row.confidence) || 0)),
      occurrence_count: Math.max(1, Number(row.occurrence_count) || 1),
      origin: clean(row.origin)
    };
    const existing = bySource.get(normalizedName);
    if (existing && fingerprint(existing.target_pattern) !== fingerprint(targetPattern)) {
      const targets = conflicts.get(normalizedName) ?? new Set([existing.target_pattern]);
      targets.add(targetPattern);
      conflicts.set(normalizedName, targets);
      bySource.delete(normalizedName);
      continue;
    }
    if (conflicts.has(normalizedName)) {
      conflicts.get(normalizedName).add(targetPattern);
      continue;
    }
    if (!existing || candidate.confidence > existing.confidence
      || candidate.occurrence_count > existing.occurrence_count) {
      bySource.set(normalizedName, candidate);
    }
  }
  return {
    candidates: [...bySource.values()],
    conflicts: [...conflicts.entries()].map(([normalizedName, targets]) => ({
      normalizedName,
      targets: [...targets]
    }))
  };
}

async function requireLearningMetadata(db) {
  const { rows } = await db.query(
    `select count(*)::int as count
       from information_schema.columns
      where table_schema = 'public'
        and table_name = 'ocr_pattern_learning'
        and column_name = any($1::text[])`,
    [["match_metadata", "approval_source", "approved_at"]]
  );
  if (rows[0]?.count !== 3) {
    throw new Error("Learning metadata migration is not applied. Run npm run db:apply first.");
  }
  const aliasTable = await db.query("select to_regclass('public.supplier_name_alias') as table_name");
  if (!aliasTable.rows[0]?.table_name) {
    throw new Error("Supplier name alias migration is not applied. Run npm run db:apply first.");
  }
}

async function ensureSupplier(db) {
  const existing = await db.query(
    `select id, supplier_code, supplier_name
       from public.supplier_master
      where tenant_id = $1
        and (supplier_code = $2 or supplier_name = $3)
      order by case when supplier_code = $2 then 0 else 1 end
      limit 1`,
    [TENANT_ID, SUPPLIER_CODE, SUPPLIER_NAME]
  );
  if (existing.rowCount) return existing.rows[0];

  const inserted = await db.query(
    `insert into public.supplier_master
       (tenant_id, supplier_code, supplier_name, is_active)
     values ($1, $2, $3, true)
     returning id, supplier_code, supplier_name`,
    [TENANT_ID, SUPPLIER_CODE, SUPPLIER_NAME]
  );
  return inserted.rows[0];
}

async function upsertSupplierNameAliases(db, supplierId) {
  const aliasMap = new Map();
  for (const aliasName of SUPPLIER_NAME_ALIASES) {
    const normalizedAlias = fingerprint(aliasName);
    if (!aliasMap.has(normalizedAlias)) {
      aliasMap.set(normalizedAlias, {
        alias_name: aliasName,
        normalized_alias: normalizedAlias
      });
    }
  }
  const aliases = [...aliasMap.values()];
  await db.query(`
    insert into public.supplier_name_alias (
      tenant_id, supplier_id, alias_name, normalized_alias,
      confidence, verified, is_active
    )
    select $1, $2, alias_name, normalized_alias, 100, true, true
      from jsonb_to_recordset($3::jsonb) as x(alias_name text, normalized_alias text)
    on conflict (tenant_id, normalized_alias) do update
      set supplier_id = excluded.supplier_id,
          alias_name = excluded.alias_name,
          confidence = 100,
          verified = true,
          is_active = true
  `, [TENANT_ID, supplierId, JSON.stringify(aliases)]);
}

async function stageCandidates(db, rows) {
  await db.query(`
    create temp table temp_daesan_learning (
      source_pattern text not null,
      target_pattern text not null,
      normalized_name text not null,
      category text,
      standard_cut text,
      storage text,
      confidence numeric(5,2) not null,
      occurrence_count integer not null,
      origin text
    ) on commit drop
  `);
  await db.query(
    `insert into temp_daesan_learning
       (source_pattern, target_pattern, normalized_name, category, standard_cut,
        storage, confidence, occurrence_count, origin)
     select source_pattern, target_pattern, normalized_name, category, standard_cut,
            storage, confidence, occurrence_count, origin
       from jsonb_to_recordset($1::jsonb) as x(
         source_pattern text,
         target_pattern text,
         normalized_name text,
         category text,
         standard_cut text,
         storage text,
         confidence numeric,
         occurrence_count integer,
         origin text
       )`,
    [JSON.stringify(rows)]
  );
}

async function upsertDictionaries(db) {
  await db.query(`
    insert into public.product_dictionary (
      dictionary_code, standard_name, confidence, source_count, alias_count,
      review_status, effective_from, is_active
    )
    select $1 || upper(substr(md5(target_pattern), 1, 16)),
           target_pattern,
           max(confidence),
           sum(occurrence_count)::integer,
           0,
           'APPROVED',
           current_date,
           true
      from temp_daesan_learning staged
     where not exists (
       select 1
         from public.product_dictionary dictionary
        where dictionary.is_active = true
          and lower(dictionary.standard_name) = lower(staged.target_pattern)
     )
     group by target_pattern
    on conflict (dictionary_code) do nothing
  `, [DICTIONARY_PREFIX]);
}

async function upsertSupplierAliases(db, supplierId) {
  await db.query(`
    insert into public.supplier_alias (
      tenant_id, supplier_id, dictionary_id, raw_name, normalized_name,
      confidence, learning_count, verified, auto_apply, last_used_at, is_active
    )
    select $1, $2, dictionary.id, staged.source_pattern, staged.normalized_name,
           staged.confidence, staged.occurrence_count, true, true, now(), true
      from temp_daesan_learning staged
      join lateral (
        select id
          from public.product_dictionary
         where is_active = true
           and lower(standard_name) = lower(staged.target_pattern)
         order by review_status = 'APPROVED' desc, confidence desc, updated_at desc
         limit 1
      ) dictionary on true
    on conflict (tenant_id, supplier_id, normalized_name) do update
      set dictionary_id = excluded.dictionary_id,
          raw_name = excluded.raw_name,
          confidence = greatest(public.supplier_alias.confidence, excluded.confidence),
          learning_count = greatest(public.supplier_alias.learning_count, excluded.learning_count),
          verified = true,
          auto_apply = true,
          last_used_at = now(),
          is_active = true
  `, [TENANT_ID, supplierId]);
}

async function upsertOcrPatterns(db, supplierId) {
  await db.query(`
    update public.ocr_pattern_learning existing
       set is_active = false,
           last_used_at = now()
      from temp_daesan_learning staged
     where existing.tenant_id = $1
       and existing.supplier_id = $2
       and existing.pattern_type = 'PRODUCT_NAME_SUBSTITUTION'
       and lower(existing.source_pattern) = lower(staged.source_pattern)
       and lower(existing.target_pattern) <> lower(staged.target_pattern)
       and existing.is_active = true
  `, [TENANT_ID, supplierId]);

  await db.query(`
    update public.ocr_pattern_learning existing
       set sample_count = greatest(existing.sample_count, staged.occurrence_count),
           success_count = greatest(existing.success_count, staged.occurrence_count),
           confidence = greatest(existing.confidence, staged.confidence),
           match_metadata = jsonb_build_object(
             'category', staged.category,
             'standard_cut', staged.standard_cut,
             'storage', staged.storage,
             'origin', staged.origin,
             'normalized_name', staged.normalized_name
           ),
           approval_source = $3,
           approved_at = coalesce(existing.approved_at, now()),
           last_used_at = now(),
           is_active = true
      from temp_daesan_learning staged
     where existing.tenant_id = $1
       and existing.supplier_id = $2
       and existing.pattern_type = 'PRODUCT_NAME_SUBSTITUTION'
       and lower(existing.source_pattern) = lower(staged.source_pattern)
       and lower(existing.target_pattern) = lower(staged.target_pattern)
  `, [TENANT_ID, supplierId, APPROVAL_SOURCE]);

  await db.query(`
    insert into public.ocr_pattern_learning (
      tenant_id, supplier_id, pattern_type, source_pattern, target_pattern,
      sample_count, success_count, confidence, last_used_at, is_active,
      match_metadata, approval_source, approved_at
    )
    select $1, $2, 'PRODUCT_NAME_SUBSTITUTION',
           staged.source_pattern, staged.target_pattern,
           staged.occurrence_count, staged.occurrence_count, staged.confidence,
           now(), true,
           jsonb_build_object(
             'category', staged.category,
             'standard_cut', staged.standard_cut,
             'storage', staged.storage,
             'origin', staged.origin,
             'normalized_name', staged.normalized_name
           ),
           $3, now()
      from temp_daesan_learning staged
     where not exists (
       select 1
         from public.ocr_pattern_learning existing
        where existing.tenant_id = $1
          and existing.supplier_id = $2
          and existing.pattern_type = 'PRODUCT_NAME_SUBSTITUTION'
          and lower(existing.source_pattern) = lower(staged.source_pattern)
          and lower(existing.target_pattern) = lower(staged.target_pattern)
          and existing.is_active = true
     )
  `, [TENANT_ID, supplierId, APPROVAL_SOURCE]);
}

async function appendLearningHistory(db, supplierId) {
  await db.query(`
    update public.learning_history existing
       set is_active = false
      from temp_daesan_learning staged
      join lateral (
        select id
          from public.product_dictionary
         where is_active = true
           and lower(standard_name) = lower(staged.target_pattern)
         order by review_status = 'APPROVED' desc, confidence desc, updated_at desc
         limit 1
      ) dictionary on true
     where existing.tenant_id = $1
       and existing.supplier_id = $2
       and existing.raw_name = staged.source_pattern
       and existing.dictionary_id <> dictionary.id
       and existing.source_type = 'IMPORT'
       and existing.decision_type = 'MANUAL_APPROVAL'
       and existing.is_active = true
  `, [TENANT_ID, supplierId]);

  await db.query(`
    insert into public.learning_history (
      tenant_id, supplier_id, raw_name, normalized_name, dictionary_id,
      source_type, previous_confidence, new_confidence, learning_count,
      decision_type, is_active
    )
    select $1, $2, staged.source_pattern, staged.normalized_name, dictionary.id,
           'IMPORT', 0, staged.confidence, staged.occurrence_count,
           'MANUAL_APPROVAL', true
      from temp_daesan_learning staged
      join lateral (
        select id
          from public.product_dictionary
         where is_active = true
           and lower(standard_name) = lower(staged.target_pattern)
         order by review_status = 'APPROVED' desc, confidence desc, updated_at desc
         limit 1
      ) dictionary on true
     where not exists (
       select 1
         from public.learning_history existing
        where existing.tenant_id = $1
          and existing.supplier_id = $2
          and existing.raw_name = staged.source_pattern
          and existing.dictionary_id = dictionary.id
          and existing.source_type = 'IMPORT'
          and existing.decision_type = 'MANUAL_APPROVAL'
          and existing.is_active = true
     )
  `, [TENANT_ID, supplierId]);
}

async function refreshDictionaryAliasCounts(db) {
  await db.query(`
    update public.product_dictionary dictionary
       set alias_count = counts.alias_count,
           source_count = greatest(dictionary.source_count, counts.source_count),
           confidence = greatest(dictionary.confidence, counts.confidence),
           review_status = 'APPROVED',
           is_active = true
      from (
        select alias.dictionary_id,
               count(*)::integer as alias_count,
               sum(alias.learning_count)::integer as source_count,
               max(alias.confidence) as confidence
          from public.supplier_alias alias
         where alias.is_active = true
         group by alias.dictionary_id
      ) counts
     where dictionary.id = counts.dictionary_id
  `);
}

async function learningCounts(db, supplierId) {
  const { rows } = await db.query(`
    select
      (select count(*)::int
         from public.supplier_alias
        where tenant_id = $1 and supplier_id = $2 and is_active = true) as supplier_aliases,
      (select count(*)::int
         from public.ocr_pattern_learning
        where tenant_id = $1 and supplier_id = $2
          and pattern_type = 'PRODUCT_NAME_SUBSTITUTION' and is_active = true) as ocr_patterns,
      (select count(*)::int
         from public.learning_history
        where tenant_id = $1 and supplier_id = $2 and is_active = true) as learning_history
  `, [TENANT_ID, supplierId]);
  return rows[0];
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

function clean(value) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

function fingerprint(value) {
  return clean(value).toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

function supplierFingerprint(value) {
  return fingerprint(value)
    .replace(/^(주식회사|농업회사법인|유한회사)/, "")
    .replace(/^주/, "")
    .replace(/유통$/, "");
}
