const TABLE_PROBES = [
  { key: "source_registry", method: "listSourceRegistry" },
  { key: "supplier_master", method: "listSuppliers" },
  { key: "product_dictionary", method: "listProductDictionary" },
  { key: "product_master", method: "listProductMaster" },
  { key: "product_alias", method: "listProductAlias" },
  { key: "supplier_alias", method: "listSupplierAlias" },
  { key: "review_queue", method: "listReviewQueue" },
  { key: "learning_history", method: "listLearningHistory" },
  { key: "tenant_master", method: "listTenantMaster" },
  { key: "tenant_user", method: "listTenantUser" },
  { key: "tenant_setting", method: "listTenantSetting" },
  { key: "tenant_routing", method: "listTenantRouting" },
  { key: "tenant_usage_daily", method: "listTenantUsageDaily" },
  { key: "ocr_provider_registry", method: "listOcrProviders" },
  { key: "ocr_document", method: "listOcrDocuments" },
  { key: "ocr_product_candidate", method: "listOcrProductCandidates" },
  { key: "ocr_processing_history", method: "listOcrProcessingHistory" },
  { key: "supplier_document_template", method: "listSupplierDocumentTemplates" },
  { key: "ocr_failure_case", method: "listOcrFailureCases" },
  { key: "ocr_correction_history", method: "listOcrCorrectionHistory" },
  { key: "ocr_pattern_learning", method: "listOcrPatternLearning" },
  { key: "audit_event", method: "listAuditEvents" }
];

export async function runSupabaseHealthCheck({ adapter, config }) {
  const startedAt = performance.now();
  const result = {
    checkedAt: new Date().toISOString(),
    connection: "unknown",
    apiReachable: "unknown",
    latencyMs: 0,
    schema: "public",
    migrationStatus: "unknown",
    seedStatus: "unknown",
    readStatus: "unknown",
    tableStatus: {},
    errorCode: "",
    errorMessage: ""
  };

  if (!adapter) {
    result.connection = "missing";
    result.errorMessage = "Supabase adapter not configured";
    return result;
  }

  const apiProbe = await probeApiReachable(config);
  result.apiReachable = apiProbe.ok ? "yes" : "no";
  if (!apiProbe.ok && !result.errorMessage) {
    result.errorCode = apiProbe.code;
    result.errorMessage = apiProbe.message;
  }

  const probeResults = [];
  for (const tableProbe of TABLE_PROBES) {
    const probe = await probeTable(adapter, tableProbe.method, tableProbe.key);
    probeResults.push(probe);
    result.tableStatus[tableProbe.key] = probe;
  }

  const schemaProbe = probeResults.find((item) => item.ok === false);
  const allOk = probeResults.every((item) => item.ok);
  result.connection = allOk ? "connected" : "partial";
  result.readStatus = allOk ? "ok" : "failed";
  result.migrationStatus = allOk ? "applied" : "missing";
  result.seedStatus = allOk ? "present" : "partial";
  result.latencyMs = Math.round(performance.now() - startedAt);

  if (schemaProbe) {
    result.errorCode = schemaProbe.code;
    result.errorMessage = mapSupabaseError(schemaProbe);
  }

  return result;
}

async function probeApiReachable(config = {}) {
  const baseUrl = String(config.url ?? "").replace(/\/+$/, "");
  const anonKey = String(config.anonKey ?? "");
  const accessToken = String(
    typeof config.getAccessToken === "function"
      ? config.getAccessToken()
      : globalThis.localStorage?.getItem("meatos_access_token") ?? ""
  );
  if (!baseUrl || !anonKey || !accessToken) {
    return { ok: false, code: "CONFIG", message: "Supabase config is missing" };
  }

  try {
    const response = await fetch(`${baseUrl}/rest/v1/`, {
      method: "GET",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`
      }
    });
    return { ok: response.ok, code: response.status, message: response.statusText || "API probe completed" };
  } catch (error) {
    return {
      ok: false,
      code: error?.code ?? "NETWORK",
      message: mapSupabaseError({ code: error?.code, message: error?.message })
    };
  }
}

async function probeTable(adapter, methodName, tableName) {
  try {
    const method = adapter?.[methodName];
    if (typeof method !== "function") {
      return { tableName, ok: false, count: 0, code: "MISSING_METHOD", message: `Missing adapter method ${methodName}` };
    }

    const rows = await method.call(adapter);
    return { tableName, ok: true, count: Array.isArray(rows) ? rows.length : 0, code: "OK" };
  } catch (error) {
    return {
      tableName,
      ok: false,
      count: 0,
      code: error?.code ?? error?.status ?? "UNKNOWN",
      message: error?.message ?? "Unknown error"
    };
  }
}

function mapSupabaseError(probe) {
  const code = String(probe.code ?? "").toUpperCase();
  if (code === "PGRST205") return "Schema 또는 테이블이 아직 생성되지 않았습니다.";
  if (code === "401" || code === "PGRST301") return "권한 또는 API Key 문제입니다.";
  if (code === "403") return "접근 권한이 없습니다.";
  if (code === "404") return "테이블을 찾을 수 없습니다.";
  if (code === "ETIMEDOUT" || code === "TIMEOUT") return "네트워크 타임아웃입니다.";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN" || code === "EHOSTUNREACH") return "네트워크 연결 실패입니다.";
  return probe.message || "Supabase health check failed";
}
