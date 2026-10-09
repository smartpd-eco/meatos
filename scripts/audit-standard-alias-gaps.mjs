import { readFile } from "node:fs/promises";
import { Client } from "pg";

const TARGETS = [
  "이겹살", "갈매기살", "볼살", "우삼겹", "우목심", "차돌박이", "도가니",
  "채끝", "안심", "등심", "사태", "우족", "사골", "스지"
];

const env = await loadEnv();
const connectionString = normalizeConnectionString(env.DATABASE_URL || "");
if (!connectionString) throw new Error("Missing DATABASE_URL in .env");
const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const { rows } = await client.query(`
    select dictionary.dictionary_code,
           dictionary.standard_name,
           species.species_code,
           dictionary.review_status,
           dictionary.is_active,
           array_remove(array_agg(distinct alias.raw_name order by alias.raw_name), null) as aliases
      from public.product_dictionary dictionary
      left join public.product_species species on species.id = dictionary.species_id
      left join public.product_alias alias
        on alias.dictionary_id = dictionary.id
       and alias.is_active = true
     where dictionary.standard_name = any($1::text[])
     group by dictionary.dictionary_code, dictionary.standard_name,
              species.species_code, dictionary.review_status, dictionary.is_active
     order by dictionary.standard_name, dictionary.dictionary_code
  `, [TARGETS]);
  console.log(JSON.stringify(rows, null, 2));
} finally {
  await client.end();
}

async function loadEnv() {
  const raw = await readFile(".env", "utf8");
  return Object.fromEntries(raw.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
    const index = line.indexOf("=");
    return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
  }));
}

function normalizeConnectionString(value) {
  if (!value) return "";
  const url = new URL(value);
  url.searchParams.delete("sslmode");
  return url.toString();
}
