import { TENANT_CONTEXTS } from "./tenant-context.js";

export const TENANT_TEST_FIXTURES = {
  contexts: TENANT_CONTEXTS,
  sampleRecords: [
    {
      tenantCode: "SMARTPD_DEV",
      supplierName: "좋은축산 DEV",
      productName: "삼겹살 DEV",
      ocrDocumentCode: "DOC-SMARTPD-001"
    },
    {
      tenantCode: "TEST_TENANT_B",
      supplierName: "테스트거래처 B",
      productName: "목전지 B",
      ocrDocumentCode: "DOC-TEST-B-001"
    }
  ]
};

export function listTenantTestTenants() {
  return [...TENANT_TEST_FIXTURES.contexts];
}
