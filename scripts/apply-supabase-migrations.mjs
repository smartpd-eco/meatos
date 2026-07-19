import { readFile } from "node:fs/promises";
import { Client } from "pg";

const MIGRATIONS = [
  "supabase/migrations/202607110001_extensions.sql",
  "supabase/migrations/202607110002_common_functions.sql",
  "supabase/migrations/202607110003_source_registry.sql",
  "supabase/migrations/202607110004_supplier_master.sql",
  "supabase/migrations/202607110005_product_reference.sql",
  "supabase/migrations/202607110006_product_dictionary.sql",
  "supabase/migrations/202607110007_product_master.sql",
  "supabase/migrations/202607110008_alias.sql",
  "supabase/migrations/202607110009_import_pipeline.sql",
  "supabase/migrations/202607110010_review_learning.sql",
  "supabase/migrations/202607110011_ocr_pipeline.sql",
  "supabase/migrations/202607110012_audit_indexes.sql",
  "supabase/migrations/202607110013_seed_reference.sql",
  "supabase/migrations/202607110014_ocr_product_candidate.sql",
  "supabase/migrations/202607120015_tenant_foundation.sql",
  "supabase/migrations/202607120016_tenant_columns.sql",
  "supabase/migrations/202607120017_tenant_constraints_indexes.sql",
  "supabase/migrations/202607120018_tenant_seed_backfill.sql",
  "supabase/migrations/202607120019_tenant_alignment.sql",
  "supabase/migrations/202607120020_tenant_rls_draft.sql",
  "supabase/migrations/202607120021_ocr_failure_learning.sql"
];

const env = await loadEnv();
const connectionString = normalizeConnectionString(env.DATABASE_URL ?? "");

if (!connectionString) {
  throw new Error("Missing DATABASE_URL in .env");
}

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

await client.connect();

try {
  const { rows } = await client.query("SELECT current_database(), current_user, now();");
  console.log(
    JSON.stringify(
      {
        connected: true,
        currentDatabase: rows[0]?.current_database ?? null,
        currentUser: rows[0]?.current_user ?? null,
        currentTime: rows[0]?.now ?? null
      },
      null,
      2
    )
  );

  const existingTenantSchema = await hasTenantFoundation(client);
  const tenantReplayStart = MIGRATIONS.findIndex((migration) => migration.endsWith("202607120019_tenant_alignment.sql"));
  const migrationsToApply = existingTenantSchema ? MIGRATIONS.slice(Math.max(tenantReplayStart, 0)) : MIGRATIONS;

  if (existingTenantSchema) {
    console.log("tenant foundation detected; replaying alignment and draft migrations only");
  }

  for (const migration of migrationsToApply) {
    const sql = await readFile(migration, "utf8");
    console.log(`applying ${migration}`);
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("commit");
      console.log(`applied ${migration}`);
    } catch (error) {
      await client.query("rollback").catch(() => {});
      throw new Error(`${migration}: ${error.message}`);
    }
  }

  const summary = await verifySchema(client);
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await client.end();
}

async function loadEnv() {
  const raw = await readFile(".env", "utf8");
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    env[key] = value;
  }
  return env;
}

function normalizeConnectionString(value) {
  if (!value) return "";
  const url = new URL(value);
  url.searchParams.delete("sslmode");
  return url.toString();
}

async function verifySchema(client) {
  const tableNames = [
    "source_registry",
    "supplier_master",
    "product_species",
    "product_category",
    "product_attribute_value",
    "product_dictionary",
    "product_master",
    "product_alias",
    "supplier_alias",
    "import_batch",
    "product_source_row",
    "import_queue",
    "review_queue",
    "learning_history",
    "ocr_provider_registry",
    "ocr_document",
    "ocr_product_candidate",
    "supplier_document_template",
    "ocr_failure_case",
    "ocr_correction_history",
    "ocr_pattern_learning",
    "ocr_line_item",
    "ocr_processing_history",
    "tenant_master",
    "tenant_user",
    "tenant_setting",
    "tenant_routing",
    "tenant_usage_daily",
    "audit_event"
  ];

  const tables = {};
  for (const tableName of tableNames) {
    const { rows } = await client.query(
      "select to_regclass($1) as regclass",
      [`public.${tableName}`]
    );
    tables[tableName] = rows[0]?.regclass ?? null;
  }

  const counts = {};
  for (const tableName of ["source_registry", "supplier_master", "product_dictionary", "product_master", "product_alias", "supplier_alias", "ocr_provider_registry", "ocr_product_candidate", "supplier_document_template", "ocr_failure_case", "ocr_correction_history", "ocr_pattern_learning", "tenant_master", "tenant_user", "tenant_setting", "tenant_routing", "tenant_usage_daily"]) {
    const { rows } = await client.query(`select count(*)::int as count from public.${tableName}`);
    counts[tableName] = rows[0]?.count ?? 0;
  }

  return { tables, counts };
}

async function hasTenantFoundation(client) {
  const { rows } = await client.query("select to_regclass('public.tenant_master') as tenant_master");
  return Boolean(rows[0]?.tenant_master);
}
