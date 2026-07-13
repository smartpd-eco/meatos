const DEFAULT_SCHEMA = "public";

export function createSupabaseDatabaseAdapter(client, options = {}) {
  const schema = options.schema ?? DEFAULT_SCHEMA;

  return {
    isConfigured: Boolean(client),
    schema,
    async listSourceRegistry() {
      return runList(client, schema, "source_registry");
    },
    async listSuppliers() {
      return runList(client, schema, "supplier_master");
    },
    async listProductDictionary() {
      return runList(client, schema, "product_dictionary");
    },
    async listProductMaster() {
      return runList(client, schema, "product_master");
    },
    async listProductAlias() {
      return runList(client, schema, "product_alias");
    },
    async listSupplierAlias() {
      return runList(client, schema, "supplier_alias");
    },
    async listImportQueue() {
      return runList(client, schema, "import_queue");
    },
    async listReviewQueue() {
      return runList(client, schema, "review_queue");
    },
    async listLearningHistory() {
      return runList(client, schema, "learning_history");
    },
    async listOcrDocuments() {
      return runList(client, schema, "ocr_document");
    },
    async listOcrProductCandidates() {
      return runList(client, schema, "ocr_product_candidate");
    },
    async listTenantMaster() {
      return runList(client, schema, "tenant_master");
    },
    async listTenantUser() {
      return runList(client, schema, "tenant_user");
    },
    async listTenantSetting() {
      return runList(client, schema, "tenant_setting");
    },
    async listTenantRouting() {
      return runList(client, schema, "tenant_routing");
    },
    async listTenantUsageDaily() {
      return runList(client, schema, "tenant_usage_daily");
    },
    async listOcrProviders() {
      return runList(client, schema, "ocr_provider_registry");
    },
    async listOcrProcessingHistory() {
      return runList(client, schema, "ocr_processing_history");
    },
    async listSupplierDocumentTemplates() {
      return runList(client, schema, "supplier_document_template");
    },
    async listOcrFailureCases() {
      return runList(client, schema, "ocr_failure_case");
    },
    async listOcrCorrectionHistory() {
      return runList(client, schema, "ocr_correction_history");
    },
    async listOcrPatternLearning() {
      return runList(client, schema, "ocr_pattern_learning");
    },
    async listOcrLineItems(documentId) {
      if (!client) return [];
      const scoped = typeof client.schema === "function" ? client.schema(schema) : client;
      return scoped.from("ocr_line_item").select("*").eq("ocr_document_id", documentId).order("line_no", { ascending: true });
    },
    async listAuditEvents() {
      return runList(client, schema, "audit_event");
    }
  };
}

async function runList(client, schema, tableName) {
  if (!client) return [];
  const scoped = typeof client.schema === "function" ? client.schema(schema) : client;
  const { data, error } = await scoped.from(tableName).select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export function mapSourceRegistryRow(row) {
  return {
    source_code: row.sourceId ?? row.source_code ?? "",
    source_name: row.sourceName ?? row.source_name ?? "",
    source_type: row.sourceType ?? row.source_type ?? "supplier",
    organization_name: row.organization ?? row.organization_name ?? row.sourceName ?? "",
    authority_level: row.authorityLevel ?? row.authority_level ?? "L5",
    source_url: row.sourceUrl ?? row.source_url ?? "",
    description: row.description ?? "",
    collected_at: row.collectedAt ?? row.collected_at ?? null,
    collector_name: row.collector ?? row.collector_name ?? "",
    status: row.status ?? "active"
  };
}

export function mapOcrDocumentRow(row) {
  return {
    document_code: row.documentId ?? row.document_code ?? "",
    source_id: row.sourceId ?? row.source_id ?? null,
    supplier_id: row.supplierId ?? row.supplier_id ?? null,
    original_file_path: row.originalImage?.filePath ?? row.original_file_path ?? "",
    original_file_hash: row.originalImageHash ?? row.original_file_hash ?? row.fileHash ?? "",
    file_name: row.fileName ?? row.file_name ?? "",
    mime_type: row.originalImage?.mimeType ?? row.mime_type ?? "image/jpeg",
    document_status: row.status ?? row.document_status ?? "CAPTURED",
    ocr_provider_id: row.ocrProviderId ?? row.ocr_provider_id ?? null,
    ocr_raw_json: row.ocrRawJson ?? row.ocr_raw_json ?? null,
    parsed_json: row.parsedJson ?? row.parsed_json ?? null,
    meatos_score: row.meatosScore ?? row.meatos_score ?? 0,
    provider_confidence: row.providerConfidence ?? row.provider_confidence ?? 0,
    retry_count: row.retryCount ?? row.retry_count ?? 0,
    next_retry_at: row.nextRetryAt ?? row.next_retry_at ?? null,
    invoice_date: row.documentFields?.invoiceDate ?? row.invoice_date ?? null,
    total_amount: row.documentFields?.totalAmount ?? row.total_amount ?? null
  };
}
