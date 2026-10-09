import { readFile } from "node:fs/promises";
import { Client } from "pg";

const env = await loadEnv();
const connectionString = normalizeConnectionString(env.DATABASE_URL ?? "");
const dryRun = process.argv.includes("--dry-run");
if (!connectionString) throw new Error("Missing DATABASE_URL in .env");

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

await client.connect();
try {
  const sql = await readFile(
    "supabase/migrations/202607290049_skin_on_belly_typo_learning.sql",
    "utf8"
  );
  await client.query("begin");
  try {
    await client.query(sql);
    const { rows } = await client.query(`
      select dictionary.id as dictionary_id,
             dictionary.dictionary_code,
             dictionary.standard_name,
             count(distinct alias.id)::int as global_aliases,
             count(distinct supplier_alias.id)::int as supplier_aliases,
             count(distinct learning.id)::int as active_learning_rules
        from public.product_dictionary dictionary
        left join public.product_alias alias
          on alias.dictionary_id = dictionary.id
         and alias.verified = true
         and alias.is_active = true
        left join public.supplier_alias supplier_alias
          on supplier_alias.dictionary_id = dictionary.id
         and supplier_alias.verified = true
         and supplier_alias.auto_apply = true
         and supplier_alias.is_active = true
        left join public.ocr_pattern_learning learning
          on learning.pattern_type = 'PRODUCT_NAME_SUBSTITUTION'
         and learning.is_active = true
         and learning.match_metadata->>'dictionary_code' = 'DICT-0001'
       where dictionary.dictionary_code = 'DICT-0001'
       group by dictionary.id, dictionary.dictionary_code, dictionary.standard_name
    `);
    await client.query(dryRun ? "rollback" : "commit");
    console.log(JSON.stringify({
      applied: !dryRun,
      dryRun,
      verification: rows[0] ?? null
    }, null, 2));
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  }
} finally {
  await client.end();
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
