import { readFile } from "node:fs/promises";
import { Client } from "pg";

const env = await loadEnv();
const client = new Client({
  connectionString: normalizeConnectionString(env.DATABASE_URL || ""),
  ssl: { rejectUnauthorized: false }
});

await client.connect();
let memberships;
try {
  ({ rows: memberships } = await client.query(`
    select account.auth_user_id, account.company_id, account.member_status,
           tenant_user.tenant_id, tenant_user.status, tenant_user.is_active
      from public.account account
      left join public.tenant_user tenant_user
        on tenant_user.user_id = account.auth_user_id
       and tenant_user.status = 'ACTIVE'
     where account.auth_user_id is not null
     order by account.created_at
  `));

  const results = [];
  for (const membership of memberships) {
    const tenantId = membership.tenant_id || membership.company_id;
    if (!tenantId) continue;
    await client.query("begin");
    try {
      await client.query("set local role authenticated");
      await client.query("select set_config('request.jwt.claim.sub', $1, true)", [membership.auth_user_id]);
      await client.query("select set_config('request.jwt.claim.role', 'authenticated', true)");
      await client.query("set local statement_timeout = '5000ms'");
      const queryChecks = [
        ["stock", `
          select raw_product_name, origin, unit, quantity, unit_price, amount,
                 movement_type, movement_date, supplier_name, slaughter_date,
                 expiry_date, memo, created_at
            from public.inventory_movement
           where tenant_id = $1
           limit 5000
        `],
        ["purchases", `
          select id, invoice_date, total_amount, parsed_json, created_at
            from public.ocr_document
           where tenant_id = $1
             and document_status = 'POSTED'
           order by created_at desc
           limit 500
        `],
        ["alerts", `
          select raw_product_name, quantity, unit, movement_date, slaughter_date,
                 expiry_date, supplier_name, trace_no
            from public.inventory_movement
           where tenant_id = $1
             and expiry_date is not null
           order by expiry_date asc
           limit 1000
        `],
        ["sanitation", `
          select id, worker_name
            from public.daily_sanitation_logs
           where tenant_id = $1
           order by work_date desc
           limit 1
        `]
      ];
      const queryResults = [];
      for (const [name, sql] of queryChecks) {
        const startedAt = performance.now();
        const { rows } = await client.query(sql, [tenantId]);
        queryResults.push({
          name,
          rows: rows.length,
          elapsedMs: Math.round(performance.now() - startedAt)
        });
      }
      results.push({
        tenantId,
        memberStatus: membership.member_status,
        membershipStatus: membership.status,
        queries: queryResults
      });
    } catch (error) {
      results.push({
        tenantId,
        memberStatus: membership.member_status,
        membershipStatus: membership.status,
        errorCode: error.code || "",
        errorMessage: error.message
      });
    } finally {
      await client.query("rollback");
    }
  }
  console.log(JSON.stringify(results, null, 2));
} finally {
  await client.end();
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
