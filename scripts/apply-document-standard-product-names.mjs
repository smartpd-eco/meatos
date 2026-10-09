import { readFile } from "node:fs/promises";
import { Client } from "pg";

const env = await loadEnv();
const connectionString = normalizeConnectionString(env.DATABASE_URL ?? "");
const dryRun = process.argv.includes("--dry-run");
if (!connectionString) throw new Error("Missing DATABASE_URL in .env");

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const sql = await readFile(
    "supabase/migrations/202608030057_document_standard_product_names.sql",
    "utf8"
  );
  await client.query("begin");
  try {
    await client.query(sql);
    const { rows } = await client.query(`
      select dictionary.dictionary_code,
             dictionary.standard_name,
             master.product_code,
             master.product_name,
             count(distinct alias.id)::int as verified_aliases
        from public.product_dictionary dictionary
        left join public.product_master master
          on master.dictionary_id = dictionary.id
         and master.product_code = 'PROD-0001'
        left join public.product_alias alias
          on alias.dictionary_id = dictionary.id
         and alias.verified = true
         and alias.is_active = true
       where dictionary.dictionary_code = 'DICT-0001'
       group by dictionary.dictionary_code, dictionary.standard_name,
                master.product_code, master.product_name
    `);
    const verified = rows[0];
    if (verified?.standard_name !== "오겹살" || verified?.product_name !== "오겹살") {
      throw new Error("Document standard-name verification failed for DICT-0001 / PROD-0001");
    }
    await client.query(dryRun ? "rollback" : "commit");
    console.log(JSON.stringify({ applied: !dryRun, dryRun, verified }, null, 2));
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
    result[trimmed.slice(0, splitAt).trim()] = trimmed
      .slice(splitAt + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
  }
  return result;
}

function normalizeConnectionString(value) {
  if (!value) return "";
  const url = new URL(value);
  url.searchParams.delete("sslmode");
  return url.toString();
}

