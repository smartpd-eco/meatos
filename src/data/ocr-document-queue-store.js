const STORAGE_KEY = "meatos.ocr-document-queue.v2";

export const OCR_STATUS_FLOW = [
  "CAPTURED",
  "UPLOADED",
  "OCR_PENDING",
  "OCR_COMPLETED",
  "PARSE_COMPLETED",
  "REVIEW_REQUIRED",
  "APPROVED",
  "POSTED"
];

export const OCR_FAILURE_STATUSES = ["OCR_FAILED", "PARSE_FAILED"];

export const OCR_RETRY_DELAYS_MS = [5000, 30000];

const STATUS_TRANSITIONS = {
  CAPTURED: ["UPLOADED"],
  UPLOADED: ["OCR_PENDING"],
  OCR_PENDING: ["OCR_COMPLETED", "OCR_FAILED"],
  OCR_COMPLETED: ["PARSE_COMPLETED", "PARSE_FAILED"],
  PARSE_COMPLETED: ["REVIEW_REQUIRED"],
  REVIEW_REQUIRED: ["APPROVED"],
  APPROVED: ["POSTED"],
  OCR_FAILED: ["REVIEW_REQUIRED", "OCR_PENDING"],
  PARSE_FAILED: ["REVIEW_REQUIRED", "OCR_PENDING"],
  POSTED: []
};

export class OcrDocumentQueueStore {
  constructor(seed = []) {
    this.entries = this.load(seed);
  }

  list(filters = {}) {
    const normalizedQuery = normalize(filters.query);
    return this.entries.filter((entry) => {
      const matchesQuery = !normalizedQuery
        || normalize(entry.documentId).includes(normalizedQuery)
        || normalize(entry.sourceName).includes(normalizedQuery)
        || normalize(entry.supplierName).includes(normalizedQuery)
        || normalize(entry.reviewStatus).includes(normalizedQuery)
        || normalize(entry.status).includes(normalizedQuery)
        || normalize(entry.rawText).includes(normalizedQuery)
        || normalize(entry.fileName).includes(normalizedQuery);
      const matchesStatus = !filters.status || entry.status === filters.status;
      const matchesReview = !filters.reviewStatus || entry.reviewStatus === filters.reviewStatus;
      const matchesProvider = !filters.providerId || entry.ocrProviderId === filters.providerId;
      const matchesStage = !filters.stage || entry.failureStage === filters.stage;
      const matchesDuplicate = !filters.duplicateOnly || Boolean(entry.isDuplicate);
      return matchesQuery && matchesStatus && matchesReview && matchesProvider && matchesStage && matchesDuplicate;
    });
  }

  create(input) {
    const now = nowIso();
    const entry = normalizeEntry({
      documentId: input.documentId ?? `doc-${String(this.entries.length + 1).padStart(4, "0")}`,
      sourceId: String(input.sourceId ?? ""),
      sourceName: String(input.sourceName ?? "").trim(),
      supplierName: String(input.supplierName ?? "").trim(),
      fileName: String(input.fileName ?? "").trim(),
      status: input.status ?? "CAPTURED",
      reviewStatus: input.reviewStatus ?? "PENDING",
      qualityScore: Number(input.qualityScore ?? 0),
      meatosScore: Number(input.meatosScore ?? 0),
      providerConfidence: Number(input.providerConfidence ?? 0),
      ocrProviderId: String(input.ocrProviderId ?? "").trim(),
      rawText: String(input.rawText ?? "").trim(),
      fileHash: String(input.fileHash ?? input.originalImageHash ?? "").trim(),
      originalImage: normalizeObject(input.originalImage),
      originalImageHash: String(input.originalImageHash ?? input.fileHash ?? "").trim(),
      originalImageDataUrl: String(input.originalImageDataUrl ?? "").trim(),
      preprocessedImage: normalizeObject(input.preprocessedImage),
      preprocessedImageHash: String(input.preprocessedImageHash ?? "").trim(),
      preprocessedImageDataUrl: String(input.preprocessedImageDataUrl ?? "").trim(),
      imageAnalysis: normalizeObject(input.imageAnalysis),
      pipelineTrace: normalizeArray(input.pipelineTrace),
      ocrRawJson: normalizeObject(input.ocrRawJson),
      parsedJson: normalizeObject(input.parsedJson),
      reviewResult: normalizeObject(input.reviewResult),
      documentFields: normalizeObject(input.documentFields),
      lineItems: normalizeArray(input.lineItems),
      validation: normalizeObject(input.validation),
      retryCount: Number(input.retryCount ?? 0),
      nextRetryAt: input.nextRetryAt ?? null,
      duplicateKey: String(input.duplicateKey ?? "").trim(),
      duplicateOf: String(input.duplicateOf ?? "").trim(),
      failureStage: String(input.failureStage ?? "").trim(),
      failureReason: String(input.failureReason ?? "").trim(),
      createdAt: input.createdAt ?? now,
      updatedAt: input.updatedAt ?? now
    });

    this.entries.unshift(this.decorateEntry(entry, this.entries));
    this.persist();
    return this.entries[0];
  }

  update(documentId, patch) {
    const entry = this.getById(documentId);
    if (!entry) throw new Error(`OCR document not found: ${documentId}`);
    const merged = normalizeEntry({ ...entry, ...patch, documentId });
    this.assignEntry(entry, this.decorateEntry(merged, this.entries.filter((item) => item.documentId !== documentId)));
    this.persist();
    return entry;
  }

  transition(documentId, nextStatus, patch = {}) {
    const entry = this.getById(documentId);
    if (!entry) throw new Error(`OCR document not found: ${documentId}`);
    if (entry.status === nextStatus) {
      return this.update(documentId, patch);
    }
    const allowed = STATUS_TRANSITIONS[entry.status] ?? [];
    if (!allowed.includes(nextStatus)) {
      throw new Error(`Invalid OCR status transition: ${entry.status} -> ${nextStatus}`);
    }
    return this.update(documentId, {
      ...patch,
      status: nextStatus,
      updatedAt: nowIso()
    });
  }

  markUploaded(documentId, metadata = {}) {
    return this.transition(documentId, "UPLOADED", {
      originalImage: normalizeObject(metadata.originalImage),
      originalImageHash: String(metadata.originalImageHash ?? "").trim() || undefined,
      fileHash: String(metadata.fileHash ?? "").trim() || undefined
    });
  }

  queueOcr(documentId, providerId = "clova-general", providerConfidence = 0) {
    return this.transition(documentId, "OCR_PENDING", {
      ocrProviderId: providerId,
      providerConfidence,
      failureStage: "",
      failureReason: "",
      nextRetryAt: null
    });
  }

  runMockOcr(documentId, provider = "clova-general") {
    const entry = this.getById(documentId);
    if (!entry) throw new Error(`OCR document not found: ${documentId}`);

    const queued = entry.status === "UPLOADED" ? entry : this.transition(documentId, "UPLOADED");
    this.queueOcr(documentId, provider, 93);

    const parsed = parseMockDocument(queued.rawText, {
      supplierName: queued.supplierName || queued.sourceName
    });
    const ocrRawJson = buildMockOcrRawJson(queued, provider, parsed);
    const parsedJson = buildParsedJson(parsed);
    const reviewResult = buildReviewResult(parsed);

    this.transition(documentId, "OCR_COMPLETED", {
      ocrRawJson,
      providerConfidence: 93,
      qualityScore: parsed.qualityScore
    });

    this.transition(documentId, "PARSE_COMPLETED", {
      parsedJson,
      documentFields: parsed.documentFields,
      lineItems: parsed.lineItems,
      validation: parsed.validation,
      meatosScore: parsed.meatosScore,
      reviewResult,
      parsedAt: nowIso(),
      reviewStatus: "PENDING"
    });

    return this.transition(documentId, "REVIEW_REQUIRED", {
      reviewStatus: "PENDING",
      reviewResult,
      meatosScore: parsed.meatosScore,
      qualityScore: parsed.qualityScore
    });
  }

  registerFailure(documentId, stage, reason = "") {
    const entry = this.getById(documentId);
    if (!entry) throw new Error(`OCR document not found: ${documentId}`);

    const nextRetryCount = Number(entry.retryCount ?? 0) + 1;
    const failureStatus = stage === "parse" ? "PARSE_FAILED" : "OCR_FAILED";
    const retryLimitReached = nextRetryCount > OCR_RETRY_DELAYS_MS.length;
    const nextRetryAt = retryLimitReached
      ? null
      : new Date(Date.now() + OCR_RETRY_DELAYS_MS[nextRetryCount - 1]).toISOString();

    return this.update(documentId, {
      status: retryLimitReached ? "REVIEW_REQUIRED" : failureStatus,
      reviewStatus: "PENDING",
      retryCount: nextRetryCount,
      nextRetryAt,
      failureStage: stage,
      failureReason: String(reason ?? "").trim(),
      reviewResult: {
        ...(entry.reviewResult ?? {}),
        outcome: retryLimitReached ? "ESCALATED_TO_REVIEW" : "RETRY_SCHEDULED",
        reason: String(reason ?? "").trim(),
        stage,
        retryCount: nextRetryCount
      },
      updatedAt: nowIso()
    });
  }

  moveToReview(documentId, reviewResult = {}, note = "") {
    return this.transition(documentId, "REVIEW_REQUIRED", {
      reviewStatus: "PENDING",
      reviewResult: {
        ...normalizeObject(reviewResult),
        note: String(note ?? "").trim()
      }
    });
  }

  approve(documentId, reviewer = "user") {
    const entry = this.getById(documentId);
    if (!entry) throw new Error(`OCR document not found: ${documentId}`);
    const base = entry.status === "REVIEW_REQUIRED" ? entry : this.moveToReview(documentId);
    return this.transition(base.documentId, "APPROVED", {
      reviewStatus: "APPROVED",
      reviewer,
      reviewedAt: nowIso(),
      reviewResult: {
        ...(base.reviewResult ?? {}),
        outcome: "APPROVED",
        reviewer
      }
    });
  }

  post(documentId, poster = "system") {
    return this.transition(documentId, "POSTED", {
      poster,
      postedAt: nowIso(),
      reviewResult: {
        ...(this.getById(documentId)?.reviewResult ?? {}),
        outcome: "POSTED",
        poster
      }
    });
  }

  reject(documentId, reviewer = "user", note = "반려") {
    return this.transition(documentId, "REVIEW_REQUIRED", {
      reviewStatus: "REJECTED",
      reviewer,
      reviewNote: note,
      reviewedAt: nowIso(),
      reviewResult: {
        outcome: "REJECTED",
        reviewer,
        note
      }
    });
  }

  hold(documentId, reviewer = "user", note = "보류") {
    return this.transition(documentId, "REVIEW_REQUIRED", {
      reviewStatus: "HOLD",
      reviewer,
      reviewNote: note,
      reviewedAt: nowIso(),
      reviewResult: {
        outcome: "HOLD",
        reviewer,
        note
      }
    });
  }

  canRetry(documentId) {
    const entry = this.getById(documentId);
    if (!entry) return false;
    if (!OCR_FAILURE_STATUSES.includes(entry.status)) return false;
    if (!entry.nextRetryAt) return false;
    return Date.parse(entry.nextRetryAt) <= Date.now();
  }

  getById(documentId) {
    return this.entries.find((entry) => entry.documentId === documentId);
  }

  getMetrics() {
    const total = this.entries.length;
    const parsed = this.entries.filter((entry) => ["PARSE_COMPLETED", "REVIEW_REQUIRED", "APPROVED", "POSTED"].includes(entry.status)).length;
    const reviewRequired = this.entries.filter((entry) => entry.status === "REVIEW_REQUIRED" || entry.reviewStatus === "PENDING").length;
    const recaptureRecommended = this.entries.filter((entry) => Number(entry.qualityScore ?? 0) < 70).length;
    const avgConfidence = average(
      this.entries.map((entry) => Number(entry.meatosScore ?? entry.providerConfidence ?? entry.qualityScore ?? 0))
    );
    const avgProcessingTime = average(
      this.entries
        .map((entry) => processingDurationMs(entry))
        .filter((value) => Number.isFinite(value) && value >= 0)
    );
    const duplicateCount = this.entries.filter((entry) => entry.isDuplicate).length;

    return {
      total,
      successRate: total ? Math.round((parsed / total) * 100) : 0,
      avgConfidence: Math.round(avgConfidence),
      reviewRatio: total ? Math.round((reviewRequired / total) * 100) : 0,
      recaptureRatio: total ? Math.round((recaptureRecommended / total) * 100) : 0,
      avgProcessingTime: Math.round(avgProcessingTime),
      duplicateCount
    };
  }

  load(seed) {
    let source = [...seed];

    if (typeof localStorage !== "undefined") {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            source = parsed;
          }
        }
      } catch {
        source = [...seed];
      }
    }

    const normalized = source.map(normalizeEntry);
    const prepared = [];
    for (const entry of normalized) {
      prepared.push(this.decorateEntry(entry, prepared));
    }
    return prepared;
  }

  persist() {
    if (typeof localStorage === "undefined") return;
    const snapshot = this.entries.map((entry) => sanitizeForPersistence(entry));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  }

  decorateEntry(entry, entries = this.entries ?? []) {
    const duplicate = findDuplicateEntry(entries, entry);
    const duplicateKey = buildDuplicateKey(entry);
    const updated = {
      ...entry,
      duplicateKey,
      duplicateOf: duplicate?.documentId ?? entry.duplicateOf ?? "",
      isDuplicate: Boolean(duplicate),
      processingMs: processingDurationMs(entry),
      meatosScore: Number(entry.meatosScore ?? computeMeatosScore(entry)),
      providerConfidence: Number(entry.providerConfidence ?? 0)
    };

    if (!updated.parsedJson && Object.keys(updated.documentFields ?? {}).length) {
      updated.parsedJson = {
        documentFields: updated.documentFields,
        lineItems: updated.lineItems,
        validation: updated.validation,
        meatosScore: updated.meatosScore
      };
    }

    return updated;
  }

  assignEntry(target, source) {
    for (const key of Object.keys(target)) {
      delete target[key];
    }
    Object.assign(target, source);
  }
}

function buildMockOcrRawJson(entry, provider, parsed) {
  return {
    providerId: provider,
    capturedAt: entry.createdAt ?? nowIso(),
    sourceFileName: entry.fileName ?? "",
    rawText: entry.rawText ?? "",
    providerConfidence: 93,
    lineCount: parsed.lineItems.length
  };
}

function buildParsedJson(parsed) {
  return {
    documentFields: parsed.documentFields,
    lineItems: parsed.lineItems,
    validation: parsed.validation,
    meatosScore: parsed.meatosScore,
    signals: parsed.signals
  };
}

function buildReviewResult(parsed) {
  return {
    outcome: parsed.validation.calculationOk && parsed.meatosScore >= 85 ? "FAST_REVIEW" : "REVIEW_REQUIRED",
    confidence: parsed.meatosScore,
    issues: parsed.validation.issues,
    action: parsed.validation.calculationOk && parsed.meatosScore >= 85 ? "approve" : "review"
  };
}

function parseMockDocument(rawText, context = {}) {
  const lines = String(rawText ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const supplierLine = context.supplierName || lines[0] || "";
  const totalLine = [...lines].reverse().find((line) => /(합계|총액|공급가액|세액)/i.test(line)) ?? "";
  const totalAmount = extractNumber(totalLine);

  const lineItems = lines
    .filter((line) => !/(합계|총액|공급가액|세액)/i.test(line))
    .slice(2)
    .map((line, index) => {
      const tokens = line.split(/\s+/);
      const rawProductName = tokens[0] ?? `품목${index + 1}`;
      const quantity = firstNumber(tokens.slice(1), 1);
      const unitPrice = firstNumber(tokens.slice(1).reverse(), 0);
      const amount = quantity * unitPrice;
      return {
        rowNo: index + 1,
        rawProductName,
        normalizedProductName: rawProductName,
        specification: tokens.slice(1, Math.max(1, tokens.length - 2)).join(" "),
        quantity,
        unit: "kg",
        unitPrice,
        amount,
        origin: "",
        grade: "",
        storageType: "",
        dictionaryCandidateId: "",
        productMasterId: "",
        confidence: 78,
        reviewStatus: "PENDING"
      };
    });

  const validation = validateCalculations(lineItems, totalAmount);
  const textScore = supplierLine ? 90 : 60;
  const tableScore = lineItems.length ? Math.min(100, 65 + lineItems.length * 5) : 40;
  const calculationScore = validation.calculationOk ? 100 : 35;
  const dictionaryScore = Math.min(100, 60 + lineItems.filter((item) => item.rawProductName).length * 6);
  const supplierAliasScore = supplierLine ? 90 : 50;
  const meatosScore = computeMeatosScore({
    textScore,
    tableScore,
    calculationScore,
    dictionaryScore,
    supplierAliasScore
  });

  return {
    qualityScore: Math.min(95, Math.max(50, meatosScore)),
    meatosScore,
    signals: {
      textScore,
      tableScore,
      calculationScore,
      dictionaryScore,
      supplierAliasScore
    },
    documentFields: {
      supplierName: supplierLine,
      supplierBusinessNo: extractBusinessNo(rawText),
      invoiceNo: extractInvoiceNo(rawText),
      invoiceDate: extractDate(rawText),
      supplyAmount: totalAmount,
      taxAmount: Math.round(totalAmount * 0.1),
      totalAmount: Math.round(totalAmount * 1.1),
      livestockTraceNo: "",
      slaughterCertificateReference: ""
    },
    lineItems,
    validation
  };
}

function validateCalculations(lineItems, totalAmount) {
  const issues = [];
  const lineItemErrors = lineItems.filter((item) => Number(item.quantity ?? 0) * Number(item.unitPrice ?? 0) !== Number(item.amount ?? 0));
  if (lineItemErrors.length) {
    issues.push("LINE_ITEM_AMOUNT_MISMATCH");
  }

  const lineSum = lineItems.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
  const supplyAmount = Number(totalAmount ?? 0);
  const taxAmount = Math.round(supplyAmount * 0.1);
  const totalWithTax = supplyAmount + taxAmount;

  if (lineSum !== supplyAmount && supplyAmount !== 0) {
    issues.push("SUPPLY_AMOUNT_MISMATCH");
  }

  if (totalWithTax !== supplyAmount + taxAmount) {
    issues.push("TOTAL_AMOUNT_MISMATCH");
  }

  return {
    totalMatched: supplyAmount > 0,
    lineCount: lineItems.length,
    calculationOk: issues.length === 0,
    issues
  };
}

function buildDuplicateKey(entry) {
  const fileHash = entry.fileHash || entry.originalImageHash || fingerprint(entry.rawText || entry.fileName || "");
  const supplier = entry.supplierName || entry.sourceName || "";
  const invoiceDate = entry.documentFields?.invoiceDate || entry.parsedJson?.documentFields?.invoiceDate || "";
  const totalAmount = Number(entry.documentFields?.totalAmount ?? entry.parsedJson?.documentFields?.totalAmount ?? 0);
  return [fileHash, supplier, invoiceDate, totalAmount].join("|");
}

function sanitizeForPersistence(entry) {
  const preprocessedImage = normalizeObject(entry.preprocessedImage);
  if (preprocessedImage?.dataUrl) {
    preprocessedImage.dataUrl = "";
  }

  return {
    ...entry,
    originalImageDataUrl: "",
    preprocessedImageDataUrl: "",
    preprocessedImage
  };
}

function findDuplicateEntry(entries, target) {
  const key = buildDuplicateKey(target);
  if (!key || key === "|||0") return null;
  return entries.find((entry) => entry.documentId !== target.documentId && buildDuplicateKey(entry) === key) ?? null;
}

function computeMeatosScore(signals = {}) {
  const textScore = clampNumber(signals.textScore, 0, 100);
  const tableScore = clampNumber(signals.tableScore, 0, 100);
  const calculationScore = clampNumber(signals.calculationScore, 0, 100);
  const dictionaryScore = clampNumber(signals.dictionaryScore, 0, 100);
  const supplierAliasScore = clampNumber(signals.supplierAliasScore, 0, 100);
  return Math.round(
    (textScore * 0.2)
      + (tableScore * 0.2)
      + (calculationScore * 0.25)
      + (dictionaryScore * 0.2)
      + (supplierAliasScore * 0.15)
  );
}

function processingDurationMs(entry) {
  const start = Date.parse(entry.createdAt ?? "");
  const end = Date.parse(entry.postedAt ?? entry.reviewedAt ?? entry.parsedAt ?? entry.updatedAt ?? "");
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, end - start);
}

function extractNumber(text) {
  const value = String(text ?? "").match(/(\d[\d,]*)/);
  return value ? Number(value[1].replaceAll(",", "")) : 0;
}

function extractBusinessNo(text) {
  const value = String(text ?? "").match(/\d{3}-\d{2}-\d{5}/);
  return value ? value[0] : "";
}

function extractInvoiceNo(text) {
  const value = String(text ?? "").match(/[A-Z]{2,}-?\d{4,}/i);
  return value ? value[0] : "";
}

function extractDate(text) {
  const value = String(text ?? "").match(/\d{4}[.-]\d{2}[.-]\d{2}/);
  return value ? value[0].replaceAll(".", "-") : "";
}

function firstNumber(tokens, fallback = 0) {
  for (const token of tokens) {
    if (/^\d+(\.\d+)?$/.test(token)) {
      return Number(token);
    }
  }
  return fallback;
}

function normalizeEntry(entry) {
  return {
    ...entry,
    documentId: String(entry.documentId ?? "").trim(),
    sourceId: String(entry.sourceId ?? "").trim(),
    sourceName: String(entry.sourceName ?? "").trim(),
    supplierName: String(entry.supplierName ?? "").trim(),
    fileName: String(entry.fileName ?? "").trim(),
    status: String(entry.status ?? "CAPTURED").trim(),
    reviewStatus: String(entry.reviewStatus ?? "PENDING").trim(),
    qualityScore: Number(entry.qualityScore ?? 0),
    meatosScore: Number(entry.meatosScore ?? 0),
    providerConfidence: Number(entry.providerConfidence ?? 0),
    ocrProviderId: String(entry.ocrProviderId ?? "").trim(),
    rawText: String(entry.rawText ?? "").trim(),
    fileHash: String(entry.fileHash ?? "").trim(),
    originalImageHash: String(entry.originalImageHash ?? entry.fileHash ?? "").trim(),
    originalImage: normalizeObject(entry.originalImage),
    originalImageDataUrl: String(entry.originalImageDataUrl ?? "").trim(),
    preprocessedImage: normalizeObject(entry.preprocessedImage),
    preprocessedImageHash: String(entry.preprocessedImageHash ?? "").trim(),
    preprocessedImageDataUrl: String(entry.preprocessedImageDataUrl ?? "").trim(),
    imageAnalysis: normalizeObject(entry.imageAnalysis),
    pipelineTrace: normalizeArray(entry.pipelineTrace),
    ocrRawJson: normalizeObject(entry.ocrRawJson),
    parsedJson: normalizeObject(entry.parsedJson),
    reviewResult: normalizeObject(entry.reviewResult),
    documentFields: normalizeObject(entry.documentFields),
    lineItems: normalizeArray(entry.lineItems),
    validation: normalizeObject(entry.validation),
    reviewNote: String(entry.reviewNote ?? "").trim(),
    reviewer: String(entry.reviewer ?? "").trim(),
    failureStage: String(entry.failureStage ?? "").trim(),
    failureReason: String(entry.failureReason ?? "").trim(),
    retryCount: Number(entry.retryCount ?? 0),
    nextRetryAt: entry.nextRetryAt ?? null,
    duplicateKey: String(entry.duplicateKey ?? "").trim(),
    duplicateOf: String(entry.duplicateOf ?? "").trim(),
    isDuplicate: Boolean(entry.isDuplicate),
    processingMs: Number(entry.processingMs ?? 0),
    createdAt: entry.createdAt ?? nowIso(),
    updatedAt: entry.updatedAt ?? entry.createdAt ?? nowIso(),
    parsedAt: entry.parsedAt ?? null,
    reviewedAt: entry.reviewedAt ?? null,
    postedAt: entry.postedAt ?? null
  };
}

function normalizeObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return { ...value };
}

function normalizeArray(value) {
  return Array.isArray(value) ? [...value] : [];
}

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, "").toLowerCase();
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + Number(value ?? 0), 0) / values.length;
}

function clampNumber(value, min, max) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function nowIso() {
  return new Date().toISOString();
}

function fingerprint(value) {
  const text = String(value ?? "");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }
  return `fp-${Math.abs(hash).toString(36)}`;
}
