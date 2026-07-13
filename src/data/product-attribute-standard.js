export const PRODUCT_ATTRIBUTE_FIELDS = [
  "species",
  "category",
  "part",
  "processing",
  "skin",
  "bone",
  "storage",
  "origin",
  "grade",
  "unit"
];

export function normalizeProductAttributes(input = {}) {
  const attributes = {
    species: clean(input.species ?? input.attributes?.species),
    category: clean(input.category ?? input.attributes?.category),
    part: clean(input.part ?? input.attributes?.part ?? input.cutName),
    processing: clean(input.processing ?? input.processingType ?? input.attributes?.processing),
    skin: clean(input.skin ?? input.skinType ?? input.attributes?.skin),
    bone: clean(input.bone ?? input.boneType ?? input.attributes?.bone),
    storage: clean(input.storage ?? input.storageType ?? input.attributes?.storage),
    origin: clean(input.origin ?? input.attributes?.origin),
    grade: clean(input.grade ?? input.attributes?.grade),
    unit: clean(input.unit ?? input.baseUnit ?? input.attributes?.unit)
  };

  return attributes;
}

export function summarizeProductAttributes(attributes = {}) {
  const normalized = normalizeProductAttributes({ attributes });
  return [
    normalized.species,
    normalized.category,
    normalized.part,
    normalized.processing,
    normalized.skin,
    normalized.bone,
    normalized.storage,
    normalized.origin,
    normalized.grade,
    normalized.unit
  ].filter(Boolean).join(" · ");
}

export function buildAttributeSignature(attributes = {}) {
  const normalized = normalizeProductAttributes({ attributes });
  return PRODUCT_ATTRIBUTE_FIELDS.map((field) => `${field}:${normalized[field] || "-"}`).join("|");
}

function clean(value) {
  return String(value ?? "").trim();
}
