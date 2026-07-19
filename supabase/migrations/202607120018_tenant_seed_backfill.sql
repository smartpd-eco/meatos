-- Impact: default tenant seed and usage snapshot for multi-tenant baseline.

insert into public.tenant_usage_daily (
  tenant_id, usage_date, active_users, api_requests, write_transactions, ocr_documents, storage_bytes, database_rows, error_count, p95_latency_ms
)
select t.id, current_date, 0, 0, 0, 0, 0, 0, 0, 0
from public.tenant_master t
where t.tenant_code = 'TENANT-DEFAULT'
on conflict (tenant_id, usage_date) do update
  set active_users = excluded.active_users,
      api_requests = excluded.api_requests,
      write_transactions = excluded.write_transactions,
      ocr_documents = excluded.ocr_documents,
      storage_bytes = excluded.storage_bytes,
      database_rows = excluded.database_rows,
      error_count = excluded.error_count,
      p95_latency_ms = excluded.p95_latency_ms,
      updated_at = now();
