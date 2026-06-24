const CONFIDENCE_ORDER = Object.freeze({
  high: 3,
  medium: 2,
  low: 1,
  missing: 0
});

export function classifyCandidateConfidence(input = {}) {
  if (input.conflictStatus && input.conflictStatus !== "none") {
    return {
      valueConfidence: "low",
      autoApplyEligible: false,
      requiresManualReview: true,
      reason: "候选值存在冲突，不能自动补全"
    };
  }

  const matchConfidence = input.matchConfidence ?? "low";
  const parserStatus = input.parserStatus ?? "parsed";
  const sourceCompleteness = input.sourceCompleteness ?? "present";
  const base =
    matchConfidence === "high" && parserStatus === "parsed" && sourceCompleteness === "present"
      ? "high"
      : matchConfidence === "medium" || parserStatus === "parsed_with_condition"
        ? "medium"
        : "low";

  return {
    valueConfidence: base,
    autoApplyEligible: base === "high" && input.allowAutoApply !== false,
    requiresManualReview: base !== "high" || input.requiresManualReview === true,
    reason: reasonFor(base, parserStatus, matchConfidence)
  };
}

export function buildBackfillCandidate(input = {}) {
  const confidence = classifyCandidateConfidence(input);
  return {
    standardWorkId: input.standardWorkId ?? null,
    rawWorkId: input.rawWorkId ?? null,
    ledgerRowIds: input.ledgerRowIds ?? [],
    fieldName: input.fieldName,
    currentValue: input.currentValue ?? null,
    proposedValue: input.proposedValue ?? null,
    proposedValueNormalized: input.proposedValueNormalized ?? input.proposedValue ?? null,
    sourceField: input.sourceField ?? null,
    sourceRawValue: input.sourceRawValue ?? null,
    parserStatus: input.parserStatus ?? "parsed",
    matchMethod: input.matchMethod ?? "unknown",
    matchConfidence: input.matchConfidence ?? "low",
    valueConfidence: confidence.valueConfidence,
    conflictStatus: input.conflictStatus ?? "none",
    requiresManualReview: confidence.requiresManualReview,
    autoApplyEligible: confidence.autoApplyEligible,
    reason: input.reason ?? confidence.reason,
    auditMetadata: {
      generatedBy: "masterDataBackfillCandidate",
      source: "digital_copyright_ledger",
      ...input.auditMetadata
    }
  };
}

export function summarizeCandidates(candidates = []) {
  const byConfidence = countBy(candidates, "valueConfidence");
  const byField = countBy(candidates, "fieldName");
  const byConflict = countBy(candidates, "conflictStatus");
  const total = candidates.length;
  const autoApplyEligible = candidates.filter((item) => item.autoApplyEligible === true).length;
  const manualReview = candidates.filter((item) => item.requiresManualReview === true).length;

  return {
    total,
    autoApplyEligible,
    manualReview,
    byConfidence,
    byField,
    byConflict
  };
}

export function mergeConfidence(left, right) {
  return CONFIDENCE_ORDER[right] > CONFIDENCE_ORDER[left] ? right : left;
}

function countBy(items, field) {
  return items.reduce((counts, item) => {
    const key = item[field] ?? "missing";
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function reasonFor(confidence, parserStatus, matchConfidence) {
  if (confidence === "high") {
    return "高置信匹配且字段解析明确";
  }
  if (parserStatus !== "parsed") {
    return "字段解析需要人工确认";
  }
  if (matchConfidence !== "high") {
    return "匹配置信度不足，需要人工复核";
  }
  return "候选需人工确认";
}
