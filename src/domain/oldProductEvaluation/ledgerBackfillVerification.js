const STRICT_MATCH_METHODS = new Set(["exact_work_id", "mapping_work_id"]);
const DATE_FIELDS = new Set(["copyrightStartDate", "copyrightEndDate", "firstPublicationDate"]);
const V2_AUTO_FIELDS = new Set([
  "standardWorkName",
  "authorName",
  "copyrightStartDate",
  "copyrightEndDate",
  "publisherName",
  "firstPublicationDate",
  "audioRightsStatus"
]);

const CONFIDENCE_SCORE = Object.freeze({
  high: 1,
  medium: 0.8,
  low: 0.5,
  missing: 0
});

export function confidenceScore(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return CONFIDENCE_SCORE[value] ?? 0;
}

export function evaluateStrictAutoApplyCandidate(candidate = {}) {
  const exclusionReasons = [];
  const matchConfidence = confidenceScore(candidate.matchConfidence);
  const valueConfidence = confidenceScore(candidate.valueConfidence);
  const fieldName = candidate.fieldName ?? "";
  const proposed = stringify(candidate.proposedValueNormalized ?? candidate.proposedValue);
  const raw = stringify(candidate.sourceRawValue);

  const matchAllowed =
    STRICT_MATCH_METHODS.has(candidate.matchMethod) ||
    (candidate.matchMethod === "title_author_exact" && matchConfidence >= 0.98);
  if (!matchAllowed) {
    exclusionReasons.push("match_method_or_confidence_not_strict");
  }
  if (valueConfidence < 0.95) {
    exclusionReasons.push("value_confidence_below_0_95");
  }
  if (candidate.conflictStatus && candidate.conflictStatus !== "none") {
    exclusionReasons.push("conflict_status_not_none");
  }
  if (candidate.requiresManualReview === true) {
    exclusionReasons.push("requires_manual_review");
  }
  if (fieldName === "classificationLevel3") {
    exclusionReasons.push("classification_level3_never_auto_apply");
  }
  if (isPendingAnchor(candidate, proposed, raw)) {
    exclusionReasons.push("date_pending_anchor");
  }
  if (isPerpetualOrInfinite(candidate, proposed, raw)) {
    exclusionReasons.push("perpetual_or_infinite_requires_business_confirmation");
  }
  if (isAutomaticRenewal(candidate, raw)) {
    exclusionReasons.push("automatic_renewal_not_auto_extended");
  }
  if (fieldName === "audioRightsStatus" && /limited_or_conflict/.test(proposed)) {
    exclusionReasons.push("audio_rights_limited_or_conflict");
  }

  return {
    strictAutoApplyEligible: exclusionReasons.length === 0,
    strictAutoExclusionReasons: exclusionReasons,
    strictRecommendedBucket: exclusionReasons.length === 0 ? "auto_apply" : recommendedBucket(candidate, exclusionReasons)
  };
}

export function normalizeWorkIdForMatch(value) {
  let text = stringify(value)
    .replace(/[\uFF01-\uFF5E]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, " ")
    .trim()
    .toUpperCase();
  text = text.replace(/[：:，,;；\s]+/g, "");
  if (/^\d+\.0$/.test(text)) {
    text = text.slice(0, -2);
  }
  if (/^Y\d+$/.test(text)) {
    text = text.slice(1);
  }
  if (/^\d+$/.test(text)) {
    text = String(Number.parseInt(text, 10));
  }
  return text;
}

export function normalizeTitleForMatch(value) {
  return stringify(value)
    .replace(/[\uFF01-\uFF5E]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, " ")
    .replace(/[《》“”"']/g, "")
    .replace(/[：:]/g, ":")
    .replace(/[（(].*?[）)]/g, "")
    .replace(/新版|修订版|珍藏版|套装|全集|增订版|纪念版|典藏版/g, "")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
}

export function normalizeAuthorForMatch(value) {
  return [
    ...new Set(
      stringify(value)
        .replace(/[\uFF01-\uFF5E]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
        .replace(/[（）()［］\[\]]/g, " ")
        .split(/[、，,;；/／&]|\s+and\s+|\s+和\s+|\s+及\s+/i)
        .map((item) => item.replace(/译|编|著|作者|主编/g, "").replace(/\s+/g, "").toLowerCase())
        .filter(Boolean)
    )
  ];
}

export function classifyEnhancedMatch({
  standardWorkId,
  ledgerWorkId,
  standardTitle,
  ledgerTitle,
  standardAuthor,
  ledgerAuthor
} = {}) {
  const standardId = normalizeWorkIdForMatch(standardWorkId);
  const ledgerId = normalizeWorkIdForMatch(ledgerWorkId);
  if (standardId && ledgerId && standardId === ledgerId) {
    return {
      matchMethod: "exact_work_id",
      matchConfidence: "high",
      matchReason: "ID 规范化后完全一致"
    };
  }

  const titleEqual = normalizeTitleForMatch(standardTitle) && normalizeTitleForMatch(standardTitle) === normalizeTitleForMatch(ledgerTitle);
  const standardAuthors = normalizeAuthorForMatch(standardAuthor);
  const ledgerAuthors = normalizeAuthorForMatch(ledgerAuthor);
  const authorOverlap = standardAuthors.some((author) => ledgerAuthors.includes(author));
  if (titleEqual && authorOverlap) {
    return {
      matchMethod: "title_author_exact",
      matchConfidence: 0.99,
      matchReason: "标题和作者规范化后精确一致"
    };
  }
  if (titleEqual) {
    return {
      matchMethod: "title_author_exact",
      matchConfidence: "medium",
      matchReason: "标题一致但作者不足或未重叠"
    };
  }

  return {
    matchMethod: "unmatched",
    matchConfidence: "missing",
    matchReason: "未命中 ID 或标题作者增强规则"
  };
}

export function evaluateStrictAutoApplyCandidateV2(candidate = {}) {
  const base = evaluateStrictAutoApplyCandidate(candidate);
  const exclusionReasons = [...base.strictAutoExclusionReasons];
  const matchConfidence = confidenceScore(candidate.matchConfidence);
  const valueConfidence = confidenceScore(candidate.valueConfidence);
  const fieldName = candidate.fieldName ?? "";
  const current = stringify(candidate.currentValue);
  const proposed = stringify(candidate.proposedValueNormalized ?? candidate.proposedValue);
  const raw = stringify(candidate.sourceRawValue);

  if (current && normalizeComparableValue(current) !== normalizeComparableValue(proposed)) {
    exclusionReasons.push("current_authoritative_value_not_empty");
  }
  if (current && normalizeComparableValue(current) === normalizeComparableValue(proposed)) {
    exclusionReasons.push("current_value_same_or_format_only");
  }
  if (!V2_AUTO_FIELDS.has(fieldName)) {
    exclusionReasons.push("field_not_allowed_for_v2_auto_apply");
  }
  const matchAllowed =
    STRICT_MATCH_METHODS.has(candidate.matchMethod) ||
    (candidate.matchMethod === "title_author_exact" && matchConfidence >= 0.99);
  if (!matchAllowed && !exclusionReasons.includes("match_method_or_confidence_not_strict")) {
    exclusionReasons.push("match_method_or_confidence_not_strict");
  }
  if (valueConfidence < 0.97 && !exclusionReasons.includes("value_confidence_below_0_95")) {
    exclusionReasons.push("value_confidence_below_0_97");
  }
  if (candidate.matchMethod === "title_author_fuzzy") {
    exclusionReasons.push("title_author_fuzzy_never_auto_apply_v2");
  }
  if (hasMultipleDateText(fieldName, raw)) {
    exclusionReasons.push("multiple_date_text_requires_manual_review");
  }

  const uniqueReasons = [...new Set(exclusionReasons)];
  return {
    strictAutoApplyEligibleV2: uniqueReasons.length === 0,
    strictAutoExclusionReasonsV2: uniqueReasons,
    strictRecommendedBucketV2: uniqueReasons.length === 0 ? "auto_apply_v2" : recommendedBucket(candidate, uniqueReasons)
  };
}

export function enrichCandidatesWithStrictRulesV2(candidates = []) {
  return candidates.map((candidate) => ({
    ...candidate,
    ...evaluateStrictAutoApplyCandidateV2(candidate)
  }));
}

export function summarizeStrictAutoApplyV2(candidates = [], revenueByStandard = {}) {
  const enriched = enrichCandidatesWithStrictRulesV2(candidates);
  const autoCandidates = enriched.filter((candidate) => candidate.strictAutoApplyEligibleV2);
  const autoStandards = new Set(autoCandidates.map((candidate) => candidate.standardWorkId).filter(Boolean));
  const totalRevenue = sumRevenue(Object.values(revenueByStandard));
  const autoRevenue = sumRevenue([...autoStandards].map((standardWorkId) => revenueByStandard[standardWorkId]));

  return {
    candidateRows: enriched.length,
    automaticFieldCandidates: autoCandidates.length,
    automaticStandardWorks: autoStandards.size,
    automaticRevenueCoverage: totalRevenue ? round(autoRevenue / totalRevenue) : 0,
    byField: countBy(autoCandidates, "fieldName"),
    exclusionReasons: enriched.reduce((counts, candidate) => {
      for (const reason of candidate.strictAutoExclusionReasonsV2 ?? []) {
        counts[reason] = (counts[reason] ?? 0) + 1;
      }
      return counts;
    }, {})
  };
}

export function buildLedgerBackfillDryRunV2({
  beforeGaps = {},
  candidates = [],
  gapFieldMap = DEFAULT_GAP_FIELD_MAP
} = {}) {
  const enriched = enrichCandidatesWithStrictRulesV2(candidates);
  const reductions = {};

  for (const [candidateField, gapField] of Object.entries(gapFieldMap)) {
    const standards = new Set(
      enriched
        .filter((candidate) => candidate.fieldName === candidateField && candidate.strictAutoApplyEligibleV2)
        .map((candidate) => candidate.standardWorkId)
        .filter(Boolean)
    );
    reductions[gapField] = Math.min(Number(beforeGaps[gapField] ?? 0), standards.size);
  }

  const fieldResults = {};
  for (const [field, before] of Object.entries(beforeGaps)) {
    const reduction = reductions[field] ?? 0;
    fieldResults[field] = {
      before,
      after: Math.max(0, Number(before) - reduction),
      reduction
    };
  }

  return {
    fieldResults,
    automaticCandidateRows: enriched.filter((candidate) => candidate.strictAutoApplyEligibleV2).length,
    remainingManualCandidateRows: enriched.filter((candidate) => !candidate.strictAutoApplyEligibleV2).length
  };
}

export function enrichCandidatesWithStrictRules(candidates = []) {
  return candidates.map((candidate) => ({
    ...candidate,
    ...evaluateStrictAutoApplyCandidate(candidate)
  }));
}

export function summarizeStrictAutoApply(candidates = [], revenueByStandard = {}) {
  const enriched = enrichCandidatesWithStrictRules(candidates);
  const autoCandidates = enriched.filter((candidate) => candidate.strictAutoApplyEligible);
  const autoStandards = new Set(autoCandidates.map((candidate) => candidate.standardWorkId).filter(Boolean));
  const totalRevenue = sumRevenue(Object.values(revenueByStandard));
  const autoRevenue = sumRevenue([...autoStandards].map((standardWorkId) => revenueByStandard[standardWorkId]));

  return {
    candidateRows: enriched.length,
    automaticFieldCandidates: autoCandidates.length,
    automaticStandardWorks: autoStandards.size,
    automaticRevenueCoverage: totalRevenue ? round(autoRevenue / totalRevenue) : 0,
    byField: countBy(autoCandidates, "fieldName"),
    exclusionReasons: countReasons(enriched),
    recommendedBucket: countBy(enriched, "strictRecommendedBucket")
  };
}

export function buildLedgerBackfillDryRun({
  beforeGaps = {},
  candidates = [],
  gapFieldMap = DEFAULT_GAP_FIELD_MAP
} = {}) {
  const enriched = enrichCandidatesWithStrictRules(candidates);
  const reductions = {};
  const autoByGap = {};

  for (const [candidateField, gapField] of Object.entries(gapFieldMap)) {
    const standards = new Set(
      enriched
        .filter((candidate) => candidate.fieldName === candidateField && candidate.strictAutoApplyEligible)
        .map((candidate) => candidate.standardWorkId)
        .filter(Boolean)
    );
    autoByGap[gapField] = standards.size;
    reductions[gapField] = Math.min(Number(beforeGaps[gapField] ?? 0), standards.size);
  }

  const fieldResults = {};
  for (const [field, before] of Object.entries(beforeGaps)) {
    const reduction = reductions[field] ?? 0;
    fieldResults[field] = {
      before,
      after: Math.max(0, Number(before) - reduction),
      reduction
    };
  }

  return {
    fieldResults,
    autoByGap,
    automaticCandidateRows: enriched.filter((candidate) => candidate.strictAutoApplyEligible).length,
    remainingManualCandidateRows: enriched.filter((candidate) => !candidate.strictAutoApplyEligible).length
  };
}

export function summarizeForecastOutputImpact({ before = {}, dryRun = {} } = {}) {
  const copyrightTermIncrease = dryRun.fieldResults?.missingCopyrightEnd?.reduction ?? 0;
  const manualReviewReduction =
    (dryRun.fieldResults?.missingCopyrightStart?.reduction ?? 0) +
    (dryRun.fieldResults?.missingCopyrightEnd?.reduction ?? 0);
  return {
    before,
    after: {
      copyright_term_forecast: (before.copyright_term_forecast ?? 0) + copyrightTermIncrease,
      operating_window_forecast_pending_expiry: Math.max(
        0,
        (before.operating_window_forecast_pending_expiry ?? 0) - copyrightTermIncrease
      ),
      relative_expiry_pending_anchor: Math.max(0, before.relative_expiry_pending_anchor ?? 0),
      copyright_conflict_manual_review: Math.max(
        0,
        (before.copyright_conflict_manual_review ?? 0) - manualReviewReduction
      ),
      no_numeric_forecast: Math.max(0, before.no_numeric_forecast ?? 0)
    },
    transitions: {
      operatingWindowPendingExpiryToCopyrightTermForecast: copyrightTermIncrease,
      renewalReviewBecameReviewable: copyrightTermIncrease,
      ratingRemainingCopyrightAdjustmentEnabled: copyrightTermIncrease,
      manualReviewReduced: manualReviewReduction
    }
  };
}

export const DEFAULT_GAP_FIELD_MAP = Object.freeze({
  standardWorkName: "missingWorkName",
  authorName: "missingAuthor",
  copyrightStartDate: "missingCopyrightStart",
  copyrightEndDate: "missingCopyrightEnd",
  publisherName: "missingPublisher",
  classificationLevel1: "missingClassification1",
  classificationLevel2: "missingClassification2",
  classificationLevel3: "missingClassification3",
  audioRightsStatus: "missingAudioRights",
  firstPublicationDate: "missingFirstPublicationDate"
});

function recommendedBucket(candidate, exclusionReasons) {
  if (candidate.conflictStatus && candidate.conflictStatus !== "none") {
    return "conflict_manual_review";
  }
  if (exclusionReasons.some((reason) => reason.includes("pending_anchor") || reason.includes("automatic_renewal"))) {
    return "date_manual_review";
  }
  if (candidate.valueConfidence === "medium" && candidate.matchMethod !== "title_author_fuzzy") {
    return "suggested_quick_review";
  }
  return "manual_review";
}

function isPendingAnchor(candidate, proposed, raw) {
  if (!DATE_FIELDS.has(candidate.fieldName)) {
    return false;
  }
  return (
    candidate.parserStatus === "relative" ||
    /\b(?:publication_date|last_publication_date)\+\d+y\b/.test(proposed) ||
    /出版之日|最后一部出版/.test(raw)
  );
}

function isPerpetualOrInfinite(candidate, proposed, raw) {
  if (!DATE_FIELDS.has(candidate.fieldName)) {
    return false;
  }
  return proposed === "infinite" || /无限期|无期限|永久|长期有效/.test(raw);
}

function isAutomaticRenewal(candidate, raw) {
  return DATE_FIELDS.has(candidate.fieldName) && /自动续约|自动延续|顺延/.test(raw);
}

function hasMultipleDateText(fieldName, raw) {
  return (
    DATE_FIELDS.has(fieldName) &&
    (raw.match(/(?:20\d{2}|19\d{2})[/-]\d{1,2}[/-]\d{1,2}|(?:20\d{2}|19\d{2})年\d{1,2}月\d{1,2}/g) ?? []).length > 1
  );
}

function normalizeComparableValue(value) {
  return stringify(value).replace(/\s+/g, "").toLowerCase();
}

function countReasons(candidates) {
  return candidates.reduce((counts, candidate) => {
    for (const reason of candidate.strictAutoExclusionReasons ?? []) {
      counts[reason] = (counts[reason] ?? 0) + 1;
    }
    return counts;
  }, {});
}

function countBy(items, field) {
  return items.reduce((counts, item) => {
    const key = item[field] ?? "missing";
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function sumRevenue(values) {
  return values.reduce((total, value) => total + (Number.isFinite(Number(value)) ? Number(value) : 0), 0);
}

function round(value) {
  return Math.round(value * 10000) / 10000;
}

function stringify(value) {
  return value == null ? "" : String(value).trim();
}
