export const DEFAULT_TENANT_CODE = "SMARTPD_DEV";

export const TENANT_CONTEXTS = [
  {
    tenantId: "tenant-smartpd-dev",
    tenantCode: "SMARTPD_DEV",
    tenantName: "SmartPD Labs DEV",
    roleCode: "OWNER",
    deploymentType: "SHARED",
    clusterCode: "SHARED_KR_01",
    status: "ACTIVE"
  },
  {
    tenantId: "tenant-test-b",
    tenantCode: "TEST_TENANT_B",
    tenantName: "Test Tenant B",
    roleCode: "VIEWER",
    deploymentType: "SHARED",
    clusterCode: "SHARED_KR_01",
    status: "ACTIVE"
  }
];

export function createTenantContext(overrides = {}) {
  return normalizeTenantContext({ ...TENANT_CONTEXTS[0], ...overrides });
}

export function listTenantContexts() {
  return TENANT_CONTEXTS.map(normalizeTenantContext);
}

export function findTenantContextByCode(tenantCode) {
  return listTenantContexts().find((tenant) => tenant.tenantCode === tenantCode) ?? null;
}

export function normalizeTenantContext(input = {}) {
  return {
    tenantId: String(input.tenantId ?? "").trim(),
    tenantCode: String(input.tenantCode ?? DEFAULT_TENANT_CODE).trim(),
    tenantName: String(input.tenantName ?? "SmartPD Labs DEV").trim(),
    roleCode: String(input.roleCode ?? "OWNER").trim(),
    deploymentType: String(input.deploymentType ?? "SHARED").trim(),
    clusterCode: String(input.clusterCode ?? "SHARED_KR_01").trim(),
    status: String(input.status ?? "ACTIVE").trim()
  };
}
