export const SOURCE_TYPES = Object.freeze({
  DIGITAL: "digital_copyright_ledger",
  ORIGINAL: "original_library",
  BOTH_CONSISTENT: "both_sources_consistent",
  BOTH_CONFLICT: "both_sources_conflict"
});

export const COHORTS = Object.freeze({
  PUBLICATION: "publication_cohort",
  WEB_ORIGINAL: "web_original_cohort",
  MIXED: "mixed_or_uncertain_cohort"
});

const STRICT_ORIGINAL_METHODS = new Set(["exact_original_id", "mapping_original_id", "title_author_exact"]);
const STRICT_DIGITAL_METHODS = new Set(["exact_work_id", "mapping_work_id", "title_author_exact"]);
const AUTO_FIELDS = new Set(["standardWorkName", "authorName", "copyrightStartDate", "copyrightEndDate"]);
const MANUAL_ONLY_FIELDS = new Set([
  "classificationLevel1",
  "classificationLevel2",
  "requiredTags",
  "workStatus",
  "audioRightsStatus"
]);

const FIELD_PATTERNS = Object.freeze({
  id: [/作品ID/u, /书号/u, /内容ID/u, /项目ID/u, /原创ID/u],
  title: [/作品名/u, /书名/u, /标题/u],
  author: [/作者/u, /笔名/u, /署名/u],
  licensor: [/签约主体/u, /授权方/u, /版权方/u],
  startDate: [/版权开始/u, /签约日期/u, /授权开始/u, /授权时间/u],
  endDate: [/版权结束/u, /到期/u, /结束时间/u, /授权到期/u],
  status: [/作品状态/u, /状态/u],
  category: [/分类/u, /频道/u, /题材/u],
  tags: [/标签/u, /三级分类/u],
  audioRights: [/有声/u, /音频权/u, /授权范围/u, /音频/u],
  contractStatus: [/合同状态/u, /授权状态/u]
});

export function recognizeOriginalLibraryFields(headers = []) {
  const fields = headers.map((header) => String(header ?? "").trim()).filter(Boolean);
  const roles = Object.fromEntries(
    Object.entries(FIELD_PATTERNS).map(([role, patterns]) => [
      role,
      fields.filter((field) => patterns.some((pattern) => pattern.test(field)))
    ])
  );

  return {
    fieldCount: fields.length,
    fields,
    roles,
    supportedBackfillFields: supportedBackfillFieldsFromRoles(roles)
  };
}

export function supportedBackfillFieldsFromRoles(roles = {}) {
  const supported = [];
  if ((roles.title ?? []).length > 0) supported.push("standardWorkName");
  if ((roles.author ?? []).length > 0) supported.push("authorName");
  if ((roles.startDate ?? []).length > 0) supported.push("copyrightStartDate");
  if ((roles.endDate ?? []).length > 0) supported.push("copyrightEndDate");
  if ((roles.category ?? []).length > 0) {
    supported.push("classificationLevel1", "classificationLevel2");
  }
  if ((roles.tags ?? []).length > 0) supported.push("requiredTags");
  if ((roles.status ?? []).length > 0) supported.push("workStatus");
  if ((roles.audioRights ?? []).length > 0) supported.push("audioRightsStatus");
  return [...new Set(supported)];
}

export function classifyM2SourceCohort({ digitalMatched = false, originalMatched = false } = {}) {
  if (digitalMatched && !originalMatched) {
    return {
      cohort: COHORTS.PUBLICATION,
      reason: "digital_ledger_only_match"
    };
  }
  if (!digitalMatched && originalMatched) {
    return {
      cohort: COHORTS.WEB_ORIGINAL,
      reason: "original_library_only_match"
    };
  }
  return {
    cohort: COHORTS.MIXED,
    reason: digitalMatched && originalMatched ? "dual_source_match_requires_boundary_check" : "no_strong_source_match"
  };
}

export function combineDualSourceCandidates({ digitalCandidate = null, originalCandidate = null } = {}) {
  if (digitalCandidate && originalCandidate) {
    const digitalValue = normalizeComparable(digitalCandidate.proposedValueNormalized ?? digitalCandidate.proposedValue);
    const originalValue = normalizeComparable(originalCandidate.proposedValueNormalized ?? originalCandidate.proposedValue);
    const consistent = digitalValue && originalValue && digitalValue === originalValue;
    const base = consistent ? digitalCandidate : originalCandidate;
    return {
      ...base,
      source: consistent ? SOURCE_TYPES.BOTH_CONSISTENT : SOURCE_TYPES.BOTH_CONFLICT,
      conflictStatus: consistent ? "none" : "dual_source_value_conflict",
      requiresManualReview: !consistent || Boolean(digitalCandidate.requiresManualReview || originalCandidate.requiresManualReview),
      matchMethod: `${digitalCandidate.matchMethod}+${originalCandidate.matchMethod}`,
      matchConfidence: Math.max(confidenceScore(digitalCandidate.matchConfidence), confidenceScore(originalCandidate.matchConfidence)),
      valueConfidence: consistent
        ? Math.max(confidenceScore(digitalCandidate.valueConfidence), confidenceScore(originalCandidate.valueConfidence))
        : Math.min(confidenceScore(digitalCandidate.valueConfidence), confidenceScore(originalCandidate.valueConfidence)),
      reason: consistent
        ? "dual sources agree on the proposed value"
        : "dual sources propose different values; manual review required"
    };
  }
  if (digitalCandidate) {
    return { ...digitalCandidate, source: SOURCE_TYPES.DIGITAL };
  }
  if (originalCandidate) {
    return { ...originalCandidate, source: SOURCE_TYPES.ORIGINAL };
  }
  return null;
}

export function evaluateDualSourceAutoApply(candidate = {}) {
  const reasons = [];
  const fieldName = candidate.fieldName ?? "";
  const source = candidate.source ?? "";
  const current = normalizeComparable(candidate.currentValue);
  const proposed = normalizeComparable(candidate.proposedValueNormalized ?? candidate.proposedValue);
  const matchMethod = String(candidate.matchMethod ?? "");
  const parserStatus = candidate.parserStatus ?? "parsed";

  if (!AUTO_FIELDS.has(fieldName)) {
    reasons.push(MANUAL_ONLY_FIELDS.has(fieldName) ? "field_requires_manual_review" : "field_not_supported");
  }
  if (source === SOURCE_TYPES.BOTH_CONFLICT || candidate.conflictStatus === "dual_source_value_conflict") {
    reasons.push("dual_source_conflict_never_auto_apply");
  }
  if (/fuzzy|title_only/.test(matchMethod)) {
    reasons.push("weak_match_never_auto_apply");
  }
  if (source === SOURCE_TYPES.ORIGINAL && !hasStrictOriginalMethod(matchMethod)) {
    reasons.push("original_match_not_strict_enough");
  }
  if (source === SOURCE_TYPES.DIGITAL && !hasStrictDigitalMethod(matchMethod)) {
    reasons.push("digital_match_not_strict_enough");
  }
  if (source === SOURCE_TYPES.BOTH_CONSISTENT && !(hasStrictOriginalMethod(matchMethod) && hasStrictDigitalMethod(matchMethod))) {
    reasons.push("dual_source_consistency_without_strict_match");
  }
  if (candidate.requiresManualReview === true) {
    reasons.push("requires_manual_review");
  }
  if (parserStatus !== "parsed") {
    reasons.push(`parser_status_${parserStatus}`);
  }
  if (confidenceScore(candidate.valueConfidence) < 0.97) {
    reasons.push("value_confidence_below_0_97");
  }
  if (current && current !== proposed) {
    reasons.push("current_authoritative_value_not_empty");
  }

  return {
    autoApplyEligibleDualSource: reasons.length === 0,
    autoApplyExclusionReasonsDualSource: [...new Set(reasons)],
    recommendedBucketDualSource: reasons.length === 0 ? "auto_apply_dual_source_dry_run" : "manual_review_or_dry_run_only"
  };
}

export function summarizeDualSourceDryRun(candidates = []) {
  const auto = candidates.filter((candidate) => candidate.autoApplyEligibleDualSource);
  const manual = candidates.filter((candidate) => !candidate.autoApplyEligibleDualSource);
  const autoByField = countBy(auto, (candidate) => candidate.fieldName);
  return {
    totalCandidateRows: candidates.length,
    autoApplyEligibleRows: auto.length,
    manualReviewRows: manual.length,
    autoApplyEligibleWorks: new Set(auto.map((candidate) => candidate.standardWorkId)).size,
    matchedWorks: new Set(candidates.map((candidate) => candidate.standardWorkId)).size,
    copyrightEndFillableWorks: new Set(
      auto.filter((candidate) => candidate.fieldName === "copyrightEndDate").map((candidate) => candidate.standardWorkId)
    ).size,
    authorOrWorkNameFillableWorks: new Set(
      auto
        .filter((candidate) => ["standardWorkName", "authorName"].includes(candidate.fieldName))
        .map((candidate) => candidate.standardWorkId)
    ).size,
    classOrTagCandidateWorks: new Set(
      candidates
        .filter((candidate) => ["classificationLevel1", "classificationLevel2", "requiredTags"].includes(candidate.fieldName))
        .map((candidate) => candidate.standardWorkId)
    ).size,
    bySource: countBy(candidates, (candidate) => candidate.source),
    autoByField
  };
}

function hasStrictOriginalMethod(matchMethod) {
  return String(matchMethod)
    .split("+")
    .some((method) => STRICT_ORIGINAL_METHODS.has(method));
}

function hasStrictDigitalMethod(matchMethod) {
  return String(matchMethod)
    .split("+")
    .some((method) => STRICT_DIGITAL_METHODS.has(method));
}

function confidenceScore(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value === "high") return 1;
  if (value === "medium") return 0.8;
  if (value === "low") return 0.5;
  return 0;
}

function normalizeComparable(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase();
}

function countBy(items, getKey) {
  return items.reduce((accumulator, item) => {
    const key = getKey(item) || "unknown";
    accumulator[key] = (accumulator[key] ?? 0) + 1;
    return accumulator;
  }, {});
}
