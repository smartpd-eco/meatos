export function buildSelectiveOcrRegions(primaryResult, options = {}) {
  const lines = Array.isArray(primaryResult?.rawJson?.lines) ? primaryResult.rawJson.lines : [];
  const maxRegions = Number(options.maxRegions ?? 4);
  const confidenceThreshold = Number(options.confidenceThreshold ?? 88);
  const candidates = lines
    .map((line, index) => ({
      regionId: `line-${Number(line.rowNo ?? index + 1)}`,
      sourceRowNo: Number(line.rowNo ?? index + 1),
      text: String(line.text ?? "").trim(),
      confidence: Number(line.score ?? line.confidence ?? 0),
      bounds: normalizeBounds(line.bounds)
    }))
    .filter((line) => line.text && line.bounds.width > 0 && line.bounds.height > 0)
    .filter((line) => isLikelyInvoiceDataRow(line.text) || line.confidence < confidenceThreshold)
    .sort((left, right) => regionPriority(right, confidenceThreshold) - regionPriority(left, confidenceThreshold))
    .slice(0, maxRegions)
    .sort((left, right) => left.bounds.minY - right.bounds.minY);

  const templateColumns = Array.isArray(options.templateProfile?.columnLayout?.columns)
    ? options.templateProfile.columnLayout.columns
    : [];
  return candidates.map((region) => ({
    ...region,
    bounds: expandBounds(region.bounds, options.paddingRatio ?? 0.3),
    fieldRegions: buildTemplateFields(
      region.bounds,
      templateColumns,
      options.selectiveFieldTypes ?? ["description"]
    )
  }));
}

export function summarizeSelectiveRegions(regions = []) {
  return {
    regionCount: regions.length,
    averageConfidence: regions.length
      ? Math.round(regions.reduce((sum, region) => sum + Number(region.confidence ?? 0), 0) / regions.length)
      : 0,
    sourceRows: regions.map((region) => region.sourceRowNo)
  };
}

function isLikelyInvoiceDataRow(text) {
  const numericTokens = String(text ?? "").match(/\d[\d,.]*/g) ?? [];
  return numericTokens.length >= 3 || /Box|kg|g|EA|국내산|냉장|냉동/i.test(text);
}

function regionPriority(region, threshold) {
  const numericTokens = region.text.match(/\d[\d,.]*/g) ?? [];
  const confidencePenalty = Math.max(0, threshold - region.confidence);
  return (numericTokens.length * 10) + confidencePenalty + (/Box|kg|EA/i.test(region.text) ? 12 : 0);
}

function normalizeBounds(bounds = {}) {
  const minX = Number(bounds.minX ?? 0);
  const minY = Number(bounds.minY ?? 0);
  const maxX = Number(bounds.maxX ?? minX);
  const maxY = Number(bounds.maxY ?? minY);
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY)
  };
}

function expandBounds(bounds, paddingRatio) {
  const horizontalPadding = Math.max(8, bounds.height * Number(paddingRatio));
  const verticalPadding = Math.max(5, bounds.height * Number(paddingRatio) * 0.5);
  return {
    minX: Math.max(0, Math.floor(bounds.minX - horizontalPadding)),
    minY: Math.max(0, Math.floor(bounds.minY - verticalPadding)),
    maxX: Math.ceil(bounds.maxX + horizontalPadding),
    maxY: Math.ceil(bounds.maxY + verticalPadding),
    width: Math.ceil(bounds.width + (horizontalPadding * 2)),
    height: Math.ceil(bounds.height + (verticalPadding * 2))
  };
}

function buildTemplateFields(rowBounds, columns, selectedFieldTypes) {
  const fieldTypeByColumn = {
    productName: "description",
    unit: "unit",
    quantity: "quantity",
    unitPrice: "unitPrice",
    supplyAmount: "amount",
    amount: "amount",
    totalAmount: "amount",
    traceOrImportNo: "traceNumber"
  };
  const allowed = new Set(Array.isArray(selectedFieldTypes) ? selectedFieldTypes : ["description"]);
  return columns
    .filter((column) => fieldTypeByColumn[column.key])
    .map((column) => ({
      columnKey: column.key,
      fieldType: fieldTypeByColumn[column.key],
      bounds: {
        minX: Math.max(0, Math.floor(Number(column.minX ?? 0))),
        maxX: Math.ceil(Number(column.maxX ?? 0)),
        minY: Math.max(0, Math.floor(rowBounds.minY)),
        maxY: Math.ceil(rowBounds.maxY)
      }
    }))
    .filter((field) => allowed.has(field.fieldType) && field.bounds.maxX > field.bounds.minX);
}
