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
    "supabase/migrations/202607300051_product_risk_pair_dictionary.sql",
    "utf8"
  );
  await client.query("begin");
  try {
    await client.query(sql);
    const { rows } = await client.query(`
      select dictionary.dictionary_code,
             dictionary.standard_name,
             species.species_code,
             category.category_code,
             skin.attribute_code as skin_code,
             skin.attribute_name as skin_name,
             count(distinct alias.id)::int as verified_aliases
        from public.product_dictionary dictionary
        left join public.product_species species on species.id = dictionary.species_id
        left join public.product_category category on category.id = dictionary.category_id
        left join public.product_attribute_value skin on skin.id = dictionary.skin_attribute_id
        left join public.product_alias alias
          on alias.dictionary_id = dictionary.id
         and alias.verified = true
         and alias.is_active = true
       where dictionary.dictionary_code in (
         'DICT-0001',
         'DICT-0003',
         'DICT-PORK-GABURI',
         'DICT-PORK-RIB',
         'DICT-PORK-BACK-RIB',
         'DICT-PORK-SIDE-RIB',
         'DICT-PORK-BELLY-SKINLESS'
       )
       group by dictionary.dictionary_code, dictionary.standard_name,
                species.species_code, category.category_code,
                skin.attribute_code, skin.attribute_name
       order by dictionary.dictionary_code
    `);
    const byCode = new Map(rows.map((row) => [row.dictionary_code, row]));
    const requiredCodes = [
      "DICT-0001",
      "DICT-0003",
      "DICT-PORK-GABURI",
      "DICT-PORK-RIB",
      "DICT-PORK-BACK-RIB",
      "DICT-PORK-SIDE-RIB",
      "DICT-PORK-BELLY-SKINLESS"
    ];
    if (requiredCodes.some((code) => !byCode.has(code))) {
      throw new Error("Risk-pair dictionary verification failed: missing standard code.");
    }
    if (byCode.get("DICT-0001")?.skin_code !== "PORK_SKIN_ON") {
      throw new Error("Risk-pair dictionary verification failed: 미박 skin state.");
    }
    if (byCode.get("DICT-PORK-BELLY-SKINLESS")?.skin_code !== "PORK_SKINLESS") {
      throw new Error("Risk-pair dictionary verification failed: 박피 skin state.");
    }
    await client.query(dryRun ? "rollback" : "commit");
    console.log(JSON.stringify({ applied: !dryRun, dryRun, dictionaries: rows }, null, 2));
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
