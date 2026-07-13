import { normalizeTenantContext } from "./tenant-context.js";

export function createTenantRepositoryHelper(repository, tenantContext) {
  const context = normalizeTenantContext(tenantContext);

  return {
    context,
    async listSuppliers() {
      return filterTenantRows(await repository.listSuppliers(), context);
    },
    async listProductMaster() {
      return filterTenantRows(await repository.listProductMaster(), context);
    },
    async listSupplierAlias() {
      return filterTenantRows(await repository.listSupplierAlias(), context);
    },
    async listImportQueue() {
      return filterTenantRows(await repository.listImportQueue(), context);
    },
    async listReviewQueue() {
      return filterTenantRows(await repository.listReviewQueue(), context);
    },
    async listLearningHistory() {
      return filterTenantRows(await repository.listLearningHistory(), context);
    },
    async listOcrDocuments() {
      return filterTenantRows(await repository.listOcrDocuments(), context);
    },
    async listOcrLineItems(documentId) {
      return filterTenantRows(await repository.listOcrLineItems(documentId), context);
    },
    async listOcrProcessingHistory() {
      return filterTenantRows(await repository.listOcrProcessingHistory(), context);
    },
    async listAuditEvents() {
      return filterTenantRows(await repository.listAuditEvents(), context);
    }
  };
}

export function filterTenantRows(rows = [], tenantContext) {
  const context = normalizeTenantContext(tenantContext);
  const tenantId = context.tenantId;
  if (!tenantId) return Array.isArray(rows) ? [...rows] : [];

  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const rowTenantId = String(row?.tenant_id ?? row?.tenantId ?? "").trim();
    if (!rowTenantId) return true;
    return rowTenantId === tenantId;
  });
}
