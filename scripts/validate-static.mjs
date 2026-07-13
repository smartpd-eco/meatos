import { readFile } from "node:fs/promises";

const runtimeRequiredFiles = [
  "index.html",
  "styles.css",
  "app.js",
  "manifest.webmanifest",
  "sw.js",
  "icons/icon.svg",
  "src/core/product-engine.js",
  "services/product/product-catalog-service.js",
  "src/data/alias-memory-store.js",
  "src/data/data-collection-plan.js",
  "src/data/import-queue-store.js",
  "src/data/learning-table-store.js",
  "src/data/ocr-dictionary-candidate-engine.js",
  "src/data/ocr-dictionary-history-store.js",
  "src/data/ocr-document-queue-store.js",
  "src/data/ocr-product-candidate-store.js",
  "src/data/ocr-provider-registry.js",
  "src/data/ocr-image-pipeline.js",
  "src/data/ocr-intake-policy.js",
  "src/data/ocr-provider-adapter.js",
  "src/data/ocr-cloud-provider-adapter.js",
  "src/data/ocr-provider-routing-policy.js",
  "src/data/ocr-structural-learning.js",
  "src/data/meatos-standard-invoice.js",
  "src/data/ocr-evidence-validator.js",
  "src/data/meat-tax-policy.js",
  "src/data/ocr-document-completeness-policy.js",
  "src/data/ocr-evidence-mapper.js",
  "src/data/ocr-provider-health-log-store.js",
  "src/data/ocr-operation-log-store.js",
  "src/data/ocr-failure-learning-store.js",
  "src/data/ocr-supplier-template-store.js",
  "src/data/supabase-health-check.js",
  "src/data/supabase-health-log-store.js",
  "src/data/supabase-db-adapter.js",
  "src/data/supabase-public-config.js",
  "src/data/supabase-rest-client.js",
  "src/data/tenant-context.js",
  "src/data/tenant-repository-helper.js",
  "src/data/tenant-test-fixtures.js",
  "src/data/product-attribute-standard.js",
  "src/data/source-registry-store.js",
  "src/data/source-registry.js",
  "src/data/good-chuksan-seed.js",
  "src/data/good-chuksan-source-store.js",
  "src/data/mock-data.js"
];

const developmentRequiredFiles = [
  ".env.example",
  "database/GOOD_CHUKSAN_SEED_DB.sql",
  "docs/03_DATABASE/SUPABASE_DB_MAPPING.md",
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
  "supabase/migrations/202607120021_ocr_failure_learning.sql",
  "supabase/functions/analyze-ocr/index.ts",
  "docs/07_PRD/SPRINT_001_PRODUCT_ENGINE_PRD.md"
];

const isDeployBuild = process.env.MEATOS_DEPLOY_BUILD === "1";
const requiredFiles = isDeployBuild
  ? runtimeRequiredFiles
  : [...runtimeRequiredFiles, ...developmentRequiredFiles];

for (const file of requiredFiles) {
  const content = await readFile(file, "utf8");
  if (!content.trim()) {
    throw new Error(`${file} is empty`);
  }
}

const html = await readFile("index.html", "utf8");
const js = await readFile("app.js", "utf8");
const productEngine = await readFile("src/core/product-engine.js", "utf8");
const service = await readFile("services/product/product-catalog-service.js", "utf8");
const manifest = JSON.parse(await readFile("manifest.webmanifest", "utf8"));

for (const check of ["app.js", "manifest.webmanifest", "mobile-tabbar"]) {
  if (!html.includes(check)) {
    throw new Error(`index.html missing ${check}`);
  }
}

for (const check of [
  "ProductCatalogService",
  "renderProductManagement",
  "renderGoodChuksan",
  "renderOcr",
  "renderSales",
  "renderMore",
  "home-card",
  "ocr-realworld-file",
  "ocr-realworld-health-check",
  "ocr-realworld-analyze",
  "OCR Provider Health",
  "OCR Operation Log",
  "Confidence HeatMap",
  "Success Rate (24h)",
  "Average OCR Time",
  "Today's OCR Count",
  "Review Rate",
  "Failure Rate",
  "renderOcrFlowTrack",
  "formatDuration",
  "Tenant Context"
]) {
  if (!js.includes(check)) {
    throw new Error(`app.js missing ${check}`);
  }
}

if (!isDeployBuild) {
  const edgeFunction = await readFile("supabase/functions/analyze-ocr/index.ts", "utf8");
  for (const check of [
    "CLOVA_OCR_API_URL",
    "CLOVA_OCR_SECRET_KEY",
    "CLOVA_OCR_PROVIDER",
    "X-OCR-SECRET",
    "Deno.serve"
  ]) {
    if (!edgeFunction.includes(check)) {
      throw new Error(`analyze-ocr/index.ts missing ${check}`);
    }
  }
}

const tenantContext = await readFile("src/data/tenant-context.js", "utf8");
for (const check of ["SMARTPD_DEV", "TEST_TENANT_B", "createTenantContext", "normalizeTenantContext"]) {
  if (!tenantContext.includes(check)) {
    throw new Error(`tenant-context.js missing ${check}`);
  }
}

for (const check of [
  "listProducts",
  "createProduct",
  "createSupplier",
  "createAlias",
  "updateProduct",
  "updateSupplier",
  "matchAlias",
  "hydrateProduct",
  "attributeSignature"
]) {
  if (!productEngine.includes(check)) {
    throw new Error(`product-engine.js missing ${check}`);
  }
}

for (const check of [
  "getCatalogSnapshot",
  "createCategory",
  "createStandardProduct",
  "createSupplier",
  "createProductAlias",
  "recommendAlias",
  "updateStandardProduct",
  "updateSupplier",
  "updateProductAlias",
  "recordAliasMemory"
]) {
  if (!service.includes(check)) {
    throw new Error(`product-catalog-service.js missing ${check}`);
  }
}

for (const check of ["start_url", "icons", "icons/icon.svg"]) {
  if (!String(JSON.stringify(manifest)).includes(check)) {
    throw new Error(`manifest.webmanifest missing ${check}`);
  }
}

for (const file of [
  "app.js",
  "styles.css",
  "index.html",
  "sw.js",
  "src/core/product-engine.js",
  "services/product/product-catalog-service.js"
]) {
  await readFile(file, "utf8");
}

console.log("Static PWA validation passed.");
