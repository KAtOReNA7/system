export const CLEANED_LEDGER_MINIMAL_FIELDS = Object.freeze([
  "作品ID",
  "出版书名",
  "合同书名",
  "作者署名",
  "签订日期",
  "到期时间",
  "产品线"
]);

export const MINIMAL_BACKFILL_FIELDS = Object.freeze([
  "standardWorkName",
  "authorName",
  "copyrightStartDate",
  "copyrightEndDate",
  "classificationLevel1",
  "classificationLevel2"
]);

export const MINIMAL_AUTO_APPLY_FIELDS = Object.freeze([
  "standardWorkName",
  "authorName",
  "copyrightStartDate",
  "copyrightEndDate"
]);

export const OBSOLETE_V2_FIELDS = Object.freeze([
  "publisherName",
  "firstPublicationDate",
  "audioRightsStatus",
  "classificationLevel3",
  "isbn",
  "cip",
  "contractNo",
  "contractType",
  "audioUseRight",
  "audioAdaptationRight",
  "audioSublicenseRight"
]);

const STRICT_MATCH_METHODS = new Set(["exact_work_id", "mapping_work_id"]);
const ALLOWED_FIELDS = new Set(MINIMAL_BACKFILL_FIELDS);
const AUTO_FIELDS = new Set(MINIMAL_AUTO_APPLY_FIELDS);

export function auditMinimalLedgerHeaders(headers = []) {
  const normalized = headers.map((header) => String(header ?? "").trim()).filter(Boolean);
  const missing = CLEANED_LEDGER_MINIMAL_FIELDS.filter((field) => !normalized.includes(field));
  const extra = normalized.filter((field) => !CLEANED_LEDGER_MINIMAL_FIELDS.includes(field));
  const exact =
    normalized.length === CLEANED_LEDGER_MINIMAL_FIELDS.length &&
    CLEANED_LEDGER_MINIMAL_FIELDS.every((field, index) => normalized[index] === field);

  return {
    exact,
    fieldCount: normalized.length,
    expectedFieldCount: CLEANED_LEDGER_MINIMAL_FIELDS.length,
    fields: normalized,
    missing,
    extra,
    obsoleteV2ParsingDisabled: true
  };
}

export function isSupportedMinimalBackfillField(fieldName) {
  return ALLOWED_FIELDS.has(fieldName);
}

export function isObsoleteV2Field(fieldName) {
  return OBSOLETE_V2_FIELDS.includes(fieldName);
}

export function classifyProductLine(productLine) {
  const text = String(productLine ?? "").trim();
  if (!text) {
    return {
      classificationLevel1: null,
      classificationLevel2: null,
      parserStatus: "missing",
      valueConfidence: 0,
      requiresManualReview: true
    };
  }

  const parts = text
    .split(/\s*[>\/\\|｜-]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  const [level1, level2] = parts.length >= 2 ? parts : [text, null];

  return {
    classificationLevel1: level1,
    classificationLevel2: level2,
    parserStatus: "parsed",
    valueConfidence: 0.9,
    requiresManualReview: true
  };
}

export function evaluateMinimalAutoApplyCandidate(candidate = {}) {
  const reasons = [];
  const fieldName = candidate.fieldName ?? "";
  const matchMethod = candidate.matchMethod ?? "";
  const matchConfidence = confidenceScore(candidate.matchConfidence);
  const valueConfidence = confidenceScore(candidate.valueConfidence);
  const current = normalizeComparable(candidate.currentValue);
  const proposed = normalizeComparable(candidate.proposedValueNormalized ?? candidate.proposedValue);
  const raw = String(candidate.sourceRawValue ?? "");

  if (!ALLOWED_FIELDS.has(fieldName)) {
    reasons.push("field_not_supported_by_minimal_ledger_v3");
  }
  if (!AUTO_FIELDS.has(fieldName)) {
    reasons.push("field_not_auto_applyable_in_minimal_ledger_v3");
  }
  if (!(STRICT_MATCH_METHODS.has(matchMethod) || (matchMethod === "title_author_exact" && matchConfidence >= 0.99))) {
    reasons.push("match_not_strict_enough");
  }
  if (matchMethod === "title_author_fuzzy") {
    reasons.push("title_author_fuzzy_never_auto_apply");
  }
  if (valueConfidence < 0.97) {
    reasons.push("value_confidence_below_0_97");
  }
  if (candidate.conflictStatus && candidate.conflictStatus !== "none") {
    reasons.push("conflict_status_not_none");
  }
  if (candidate.requiresManualReview === true) {
    reasons.push("requires_manual_review");
  }
  if (current && current !== proposed) {
    reasons.push("current_authoritative_value_not_empty");
  }
  if (isRelativeExpiryWithoutAnchor(raw, candidate.parserStatus)) {
    reasons.push("relative_expiry_without_anchor_not_auto_apply");
  }
  if (isAutomaticRenewal(raw)) {
    reasons.push("automatic_renewal_not_extended");
  }
  if (isIndefiniteDate(raw, candidate.parserStatus)) {
    reasons.push("indefinite_expiry_not_concrete_date");
  }

  return {
    autoApplyEligibleV3: reasons.length === 0,
    autoApplyExclusionReasonsV3: [...new Set(reasons)],
    recommendedBucketV3: reasons.length === 0 ? "auto_apply_v3" : "manual_review_or_dry_run_only"
  };
}

export function assertNoObsoleteV2Candidates(candidates = []) {
  const invalidFields = candidates
    .map((candidate) => candidate.fieldName)
    .filter((fieldName) => isObsoleteV2Field(fieldName));
  return {
    ok: invalidFields.length === 0,
    invalidFields: [...new Set(invalidFields)]
  };
}

function confidenceScore(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (value === "high") {
    return 1;
  }
  if (value === "medium") {
    return 0.8;
  }
  if (value === "low") {
    return 0.5;
  }
  return 0;
}

function normalizeComparable(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase();
}

function isRelativeExpiryWithoutAnchor(raw, parserStatus) {
  return parserStatus === "pending_anchor" || /出版之日起|签订之日起|上线之日起|最后一部/.test(raw);
}

function isAutomaticRenewal(raw) {
  return /自动续|顺延|续约/.test(raw);
}

function isIndefiniteDate(raw, parserStatus) {
  return parserStatus === "indefinite" || /永久|长期|无期限|至版权保护期满/.test(raw);
}
