import { readFile } from "node:fs/promises";
import { Client } from "pg";
await import("../src/data/product-name-substitution.js");

const TENANT_ID = "881f6cc1-b552-468c-b9b4-152edb464e61";
const env = await loadEnv();
const connectionString = normalizeConnectionString(env.DATABASE_URL ?? "");
if (!connectionString) throw new Error("Missing DATABASE_URL in .env");

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

await client.connect();
try {
  const suppliers = await client.query(`
    select supplier.id, supplier.supplier_code, supplier.supplier_name,
           (
             select count(*)::int
               from public.supplier_alias alias
              where alias.tenant_id = supplier.tenant_id
                and alias.supplier_id = supplier.id
                and alias.is_active = true
           ) as supplier_aliases,
           (
             select count(*)::int
               from public.ocr_pattern_learning pattern
              where pattern.tenant_id = supplier.tenant_id
                and pattern.supplier_id = supplier.id
                and pattern.pattern_type = 'PRODUCT_NAME_SUBSTITUTION'
                and pattern.is_active = true
           ) as learned_patterns,
           (
             select count(*)::int
               from public.learning_history history
              where history.tenant_id = supplier.tenant_id
                and history.supplier_id = supplier.id
                and history.is_active = true
           ) as learning_history
      from public.supplier_master supplier
     where supplier.tenant_id = $1
     order by supplier.supplier_name
  `, [TENANT_ID]);

  const aliases = await client.query(`
    select supplier.supplier_name, alias.raw_name, alias.normalized_name,
           dictionary.standard_name, alias.confidence, alias.learning_count
      from public.supplier_alias alias
      join public.supplier_master supplier on supplier.id = alias.supplier_id
      join public.product_dictionary dictionary on dictionary.id = alias.dictionary_id
     where alias.tenant_id = $1
       and supplier.supplier_name ilike '%좋은%'
       and alias.is_active = true
     order by alias.confidence desc, alias.raw_name
  `, [TENANT_ID]);

  const inventory = await client.query(`
    select coalesce(nullif(trim(supplier_name), ''), '(공급처 없음)') as supplier_name,
           raw_product_name,
           count(*)::int as movement_count,
           round(sum(case when movement_type = 'OUT' then -quantity else quantity end)::numeric, 2) as net_quantity
      from public.inventory_movement
     where tenant_id = $1
     group by coalesce(nullif(trim(supplier_name), ''), '(공급처 없음)'), raw_product_name
     order by supplier_name, movement_count desc, raw_product_name
  `, [TENANT_ID]);

  const goodLearning = await client.query(`
    select pattern.source_pattern, pattern.target_pattern, pattern.sample_count,
           pattern.success_count, pattern.confidence, pattern.last_used_at,
           pattern.is_active, pattern.supplier_id, pattern.match_metadata,
           pattern.approval_source as source_type, supplier.supplier_name
      from public.ocr_pattern_learning pattern
      join public.supplier_master supplier on supplier.id = pattern.supplier_id
     where pattern.tenant_id = $1
       and supplier.supplier_name = '좋은축산'
       and pattern.pattern_type = 'PRODUCT_NAME_SUBSTITUTION'
       and pattern.is_active = true
  `, [TENANT_ID]);

  const names = globalThis.MEATOS_PRODUCT_NAMES;
  names.configureLearnedPatterns(goodLearning.rows);
  const goodInventory = inventory.rows
    .filter((row) => String(row.supplier_name).includes("좋은축산"))
    .map((row) => {
      const classification = names.classify(row.raw_product_name, {
        supplierName: row.supplier_name
      });
      return {
        supplier_name: row.supplier_name,
        raw_product_name: row.raw_product_name,
        movement_count: row.movement_count,
        net_quantity: row.net_quantity,
        standard_name: classification.displayName,
        category: classification.category,
        storage: classification.storage,
        cut: classification.cut,
        learning_match: classification.learningMatch,
        learning_source: classification.learningSource,
        group_key: classification.key
      };
    });

  const goodInventoryGroups = [...goodInventory.reduce((groups, row) => {
    const existing = groups.get(row.group_key) ?? {
      group_key: row.group_key,
      standard_name: row.standard_name,
      category: row.category,
      storage: row.storage,
      source_names: [],
      net_quantity: 0
    };
    existing.source_names.push(row.raw_product_name);
    existing.net_quantity += Number(row.net_quantity || 0);
    groups.set(row.group_key, existing);
    return groups;
  }, new Map()).values()];

  const supplierNameAliases = await client.query(`
    select alias.alias_name, alias.normalized_alias, supplier.supplier_name
      from public.supplier_name_alias alias
      join public.supplier_master supplier on supplier.id = alias.supplier_id
     where alias.tenant_id = $1
       and supplier.supplier_name = '좋은축산'
       and alias.is_active = true
     order by alias.alias_name
  `, [TENANT_ID]);

  console.log(JSON.stringify({
    suppliers: suppliers.rows,
    goodChuksanSupplierNameAliases: supplierNameAliases.rows,
    goodChuksanAliasCount: aliases.rowCount,
    goodChuksanAliasSample: aliases.rows.slice(0, 10),
    goodChuksanInventoryClassifications: goodInventory,
    goodChuksanInventoryGroups: goodInventoryGroups,
    totalInventoryRawNames: inventory.rowCount
  }, null, 2));
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
