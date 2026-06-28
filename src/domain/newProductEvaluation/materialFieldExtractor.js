export const M3_SOURCE_VALUES = Object.freeze(["publication", "web_original"]);
export const M3_SAME_NAME_AUDIO_STATUSES = Object.freeze(["has", "none", "unknown"]);
export const M3_SAME_NAME_AUDIO_CHECK_STATUSES = Object.freeze(["checked", "unchecked"]);

export const M3_AUTO_CONFIRM_FIELDS = Object.freeze([
  "title",
  "author",
  "source",
  "wordCount",
  "audioVolumeEstimate",
  "completionStatus",
  "sameNameAudioStatusCheckStatus"
]);

export const M3_MANUAL_CONFIRM_FIELDS = Object.freeze([
  "classificationCandidate",
  "confirmedClassification",
  "copyrightTermRange",
  "externalHeat",
  "targetChannels",
  "operatorComparators"
]);

const MATERIAL_FIELD_KEYS = Object.freeze([
  "title",
  "author",
  "source",
  "classificationCandidate",
  "confirmedClassification",
  "synopsis",
  "wordCount",
  "audioVolumeEstimate",
  "completionStatus",
  "reads",
  "collections",
  "ratingScore",
  "commentCount",
  "rankings",
  "searchHeat",
  "socialHeat",
  "platformHeat",
  "sameNameAudioStatus",
  "sameNameAudioStatusCheckStatus",
  "adaptationSignals",
  "externalHeat",
  "targetChannels",
  "copyrightTermRange",
  "operatorRecommendationReason",
  "operatorComparators",
  "materialSource",
  "materialUpdatedAt",
  "inputConfirmedBy"
]);

const RAW_PAYLOAD_KEYS = Object.freeze([
  "rawMaterial",
  "rawText",
  "rawContent",
  "filePath",
  "fileBytes",
  "document",
  "upload",
  "privateFile",
  "fullText",
  "webpageFullText",
  "pageHtml",
  "browserDump",
  "searchResultHtml"
]);

export function assertNoRawMaterialPayload(payload = {}) {
  const keys = Object.keys(payload ?? {});
  const forbiddenKey = keys.find((key) => RAW_PAYLOAD_KEYS.includes(key));
  if (forbiddenKey) {
    const error = new Error(`raw material payload is not accepted: ${forbiddenKey}`);
    error.code = "raw_material_not_accepted";
    throw error;
  }
}

export function extractMaterialFields(material) {
  const fields = material?.fields ?? {};
  const confidenceByField = material?.confidenceByField ?? {};
  const sourceSpanSummary = material?.sourceSpanSummary ?? {};
  const extractedFields = [];
  const missingFields = [];
  const manualFillRequired = [];
  const normalizedFields = {};
  const defaultedFields = [];

  for (const key of MATERIAL_FIELD_KEYS) {
    const value = normalizeFieldValue(key, fields[key]);
    if (!hasValue(value)) {
      missingFields.push(key);
      continue;
    }

    normalizedFields[key] = value;
    const confidence = confidenceByField[key] ?? defaultConfidenceFor(key);
    const confirmationStatus = resolveConfirmationStatus(key, confidence);
    if (confirmationStatus === "manual_required") {
      manualFillRequired.push(key);
    }
    extractedFields.push({
      key,
      value,
      confidence,
      confirmationStatus,
      sourceSpanSummary: sourceSpanSummary[key] ?? `synthetic ${material?.materialType ?? "material"} field summary for ${key}`
    });
  }

  applySourceDefaults(normalizedFields, missingFields, defaultedFields, extractedFields, material);
  applySameNameAudioDefaults(normalizedFields, missingFields, defaultedFields, extractedFields, material);

  const invalidFields = validateNormalizedFields(normalizedFields);
  for (const invalid of invalidFields) {
    manualFillRequired.push(invalid.key);
  }

  return {
    materialId: material?.materialId ?? null,
    inputMode: material?.inputMode ?? "material_first",
    materialType: material?.materialType ?? "unknown",
    nonFormal: true,
    syntheticOnly: true,
    rawMaterialStored: false,
    rawTextPersisted: false,
    extractedFields,
    missingFields,
    invalidFields,
    confidence: summarizeConfidence(extractedFields),
    sourceSpanSummary: Object.fromEntries(
      extractedFields.map((field) => [field.key, field.sourceSpanSummary])
    ),
    manualFillRequired: [...new Set(manualFillRequired)],
    defaultedFields,
    normalizedFields
  };
}

export function hasUsableHeatSignal(fields = {}) {
  return usableHeatSignals(fields).length > 0;
}

export function usableHeatSignals(fields = {}) {
  const signals = [];
  addNumericSignal(signals, "reads", fields.reads);
  addNumericSignal(signals, "collections", fields.collections);
  addNumericSignal(signals, "ratingScore", fields.ratingScore);
  addNumericSignal(signals, "commentCount", fields.commentCount);
  addObjectSignal(signals, "rankings", fields.rankings);
  addObjectSignal(signals, "searchHeat", fields.searchHeat);
  addObjectSignal(signals, "socialHeat", fields.socialHeat);
  addObjectSignal(signals, "platformHeat", fields.platformHeat);
  addObjectSignal(signals, "externalHeat", fields.externalHeat);
  return signals;
}

function addNumericSignal(signals, key, value) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    signals.push({ key, value });
  }
}

function addObjectSignal(signals, key, value) {
  if (Array.isArray(value) && value.length > 0) {
    signals.push({ key, value });
    return;
  }
  if (value && typeof value === "object" && Object.keys(value).length > 0) {
    signals.push({ key, value });
    return;
  }
  if (typeof value === "string" && value.trim()) {
    signals.push({ key, value });
  }
}

function normalizeFieldValue(key, value) {
  if (key === "source" && typeof value === "string") {
    return normalizeSource(value);
  }
  if (key === "sameNameAudioStatus" && typeof value === "string") {
    return normalizeSameNameAudioStatus(value);
  }
  if (key === "sameNameAudioStatusCheckStatus" && typeof value === "string") {
    return normalizeSameNameAudioCheckStatus(value);
  }
  if (["reads", "collections", "ratingScore", "commentCount", "wordCount", "audioVolumeEstimate"].includes(key)) {
    return normalizeNumber(value);
  }
  if (["classificationCandidate", "confirmedClassification", "adaptationSignals", "targetChannels", "operatorComparators"].includes(key)) {
    return normalizeList(value);
  }
  return value;
}

function normalizeSource(value) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "出版物" || normalized === "publication") {
    return "publication";
  }
  if (normalized === "原创网文" || normalized === "web_original" || normalized === "original_web") {
    return "web_original";
  }
  return normalized;
}

function normalizeSameNameAudioStatus(value) {
  const normalized = value.trim().toLowerCase();
  if (["has", "yes", "true", "已有", "有"].includes(normalized)) return "has";
  if (["none", "no", "false", "无", "没有"].includes(normalized)) return "none";
  return "unknown";
}

function normalizeSameNameAudioCheckStatus(value) {
  const normalized = value.trim().toLowerCase();
  if (["checked", "yes", "true", "confirmed"].includes(normalized)) return "checked";
  if (["unchecked", "not_checked", "no", "false", "pending"].includes(normalized)) return "unchecked";
  return normalized;
}

function applySourceDefaults(normalizedFields, missingFields, defaultedFields, extractedFields, material) {
  if (normalizedFields.source !== "publication" || hasValue(normalizedFields.completionStatus)) {
    return;
  }
  normalizedFields.completionStatus = "completed";
  defaultedFields.push("completionStatus");
  removeValue(missingFields, "completionStatus");
  extractedFields.push(defaultedField("completionStatus", "completed", material));
}

function applySameNameAudioDefaults(normalizedFields, missingFields, defaultedFields, extractedFields, material) {
  if (normalizedFields.sameNameAudioStatusCheckStatus !== "checked" || hasValue(normalizedFields.sameNameAudioStatus)) {
    return;
  }
  normalizedFields.sameNameAudioStatus = "unknown";
  defaultedFields.push("sameNameAudioStatus");
  removeValue(missingFields, "sameNameAudioStatus");
  extractedFields.push(defaultedField("sameNameAudioStatus", "unknown", material));
}

function defaultedField(key, value, material) {
  return {
    key,
    value,
    confidence: 0.65,
    confirmationStatus: "source_default",
    sourceSpanSummary: `source default for ${material?.materialType ?? "material"} field ${key}`
  };
}

function removeValue(values, value) {
  const index = values.indexOf(value);
  if (index >= 0) {
    values.splice(index, 1);
  }
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === "") {
    return value;
  }
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : value;
}

function normalizeList(value) {
  if (Array.isArray(value)) {
    return value.filter(hasValue);
  }
  if (typeof value === "string" && value.trim()) {
    return value.split(/[;,\n]/).map((item) => item.trim()).filter(Boolean);
  }
  return value;
}

function validateNormalizedFields(fields) {
  const invalid = [];
  if (hasValue(fields.source) && !M3_SOURCE_VALUES.includes(fields.source)) {
    invalid.push({
      key: "source",
      code: "unsupported_source",
      message: "source must be publication or web_original"
    });
  }
  if (hasValue(fields.sameNameAudioStatus) && !M3_SAME_NAME_AUDIO_STATUSES.includes(fields.sameNameAudioStatus)) {
    invalid.push({
      key: "sameNameAudioStatus",
      code: "unsupported_same_name_audio_status",
      message: "sameNameAudioStatus must be has, none or unknown"
    });
  }
  if (
    hasValue(fields.sameNameAudioStatusCheckStatus) &&
    !M3_SAME_NAME_AUDIO_CHECK_STATUSES.includes(fields.sameNameAudioStatusCheckStatus)
  ) {
    invalid.push({
      key: "sameNameAudioStatusCheckStatus",
      code: "unsupported_same_name_audio_check_status",
      message: "sameNameAudioStatusCheckStatus must be checked or unchecked"
    });
  }
  return invalid;
}

function resolveConfirmationStatus(key, confidence) {
  if (M3_MANUAL_CONFIRM_FIELDS.includes(key)) {
    return "manual_required";
  }
  if (M3_AUTO_CONFIRM_FIELDS.includes(key) && confidence >= 0.85) {
    return "auto_confirmed";
  }
  return "candidate";
}

function defaultConfidenceFor(key) {
  if (M3_AUTO_CONFIRM_FIELDS.includes(key)) return 0.9;
  if (M3_MANUAL_CONFIRM_FIELDS.includes(key)) return 0.72;
  return 0.78;
}

function summarizeConfidence(fields) {
  if (fields.length === 0) {
    return "none";
  }
  const average = fields.reduce((total, field) => total + field.confidence, 0) / fields.length;
  if (average >= 0.85) return "strong";
  if (average >= 0.65) return "usable";
  return "limited";
}

function hasValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}
