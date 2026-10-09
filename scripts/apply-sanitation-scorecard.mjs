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
    "supabase/migrations/202607300052_sanitation_scorecard.sql",
    "utf8"
  );
  await client.query("begin");
  try {
    await client.query(sql);
    const { rows: columns } = await client.query(`
      select column_name, data_type, is_nullable
        from information_schema.columns
       where table_schema = 'public'
         and table_name = 'daily_sanitation_logs'
         and column_name in (
           'evaluation_items', 'total_score', 'ai_advice',
           'score_version', 'finding_note', 'corrective_action'
         )
       order by column_name
    `);
    if (columns.length !== 6) {
      throw new Error("Sanitation scorecard verification failed: missing columns.");
    }
    const { rows: constraints } = await client.query(`
      select conname
        from pg_constraint
       where conrelid = 'public.daily_sanitation_logs'::regclass
         and conname = 'daily_sanitation_logs_total_score_check'
    `);
    if (constraints.length !== 1) {
      throw new Error("Sanitation scorecard verification failed: missing score constraint.");
    }
    await client.query(dryRun ? "rollback" : "commit");
    console.log(JSON.stringify({
      applied: !dryRun,
      dryRun,
      columns,
      constraints: constraints.map((row) => row.conname)
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
