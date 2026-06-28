import { M3_NEW_PRODUCT_COMPARABLE_WORK_FIXTURES } from "./fixtures/newProductComparableWorks.fixture.js";

const SYSTEM_COMPARABLE_LIMIT = 3;

export function buildComparableWorks(fields, options = {}) {
  const candidates = options.candidates ?? M3_NEW_PRODUCT_COMPARABLE_WORK_FIXTURES;
  const operatorComparatorIds = normalizeOperatorComparatorIds(fields.operatorComparators);
  const scoredCandidates = candidates.map((candidate) =>
    scoreComparableCandidate(candidate, fields, operatorComparatorIds)
  );
  const sameAuthorReferenceWorks = scoredCandidates
    .filter((candidate) => candidate.isSameAuthor)
    .map(toSameAuthorReferenceWork);
  const selectedIds = new Set(
    scoredCandidates
      .filter((candidate) => candidate.isSystemEligible)
      .sort((a, b) => b.similarityScore - a.similarityScore)
      .slice(0, SYSTEM_COMPARABLE_LIMIT)
      .map((candidate) => candidate.workId)
  );
  const systemSelected = scoredCandidates
    .filter((candidate) => selectedIds.has(candidate.workId))
    .map(toSystemComparable);
  const operatorSpecified = operatorComparatorIds.map((operatorComparatorId) => {
    const matched = scoredCandidates.find((candidate) => candidate.operatorComparatorId === operatorComparatorId);
    return {
      operatorComparatorId,
      reasonFromOperator: "Synthetic operator-specified comparator retained beside system comparables.",
      matchedToSyntheticFixture: matched?.workId ?? null,
      notCountedAgainstSystemLimit: true,
      nonFormal: true,
      fixtureOnly: true,
      notForFormalDecision: true
    };
  });
  const excluded = scoredCandidates
    .filter((candidate) => !selectedIds.has(candidate.workId))
    .map((candidate) => toExcludedComparable(candidate, operatorComparatorIds));

  return {
    systemSelected,
    operatorSpecified,
    sameAuthorReferenceWorks,
    excluded,
    selectionRules: [
      "System comparables are capped at 3 works.",
      "Operator-specified comparators are displayed beside system comparables and do not override them.",
      "Same-author works are separated into sameAuthorReferenceWorks and do not use system comparable slots.",
      "Pure buyout works are separated from sales-curve comparables.",
      "Buyout plus sales works use the sales component for sales-curve comparison and report buyout separately."
    ],
    limitations: [
      "Synthetic fixture comparables only.",
      "No private material, real author detail, raw bill rows, or database reads are used.",
      "M3-2 comparables are explanation inputs for later M3 stages, not formal forecast calibration."
    ],
    nonFormal: true,
    fixtureOnly: true,
    notForFormalDecision: true
  };
}

function scoreComparableCandidate(candidate, fields, operatorComparatorIds) {
  const classification = fields.confirmedClassification ?? fields.classificationCandidate ?? [];
  const sourceMatch = candidate.source === fields.source;
  const classificationSimilarity = overlapRatio(classification, candidate.classification);
  const volumeSimilarity = scoreVolumeSimilarity(fields, candidate);
  const completionStatusMatch = Boolean(fields.completionStatus && candidate.completionStatus === fields.completionStatus);
  const heatSimilarity = scoreHeatSimilarity(fields, candidate);
  const channelSimilarity = overlapRatio(normalizeChannelIds(fields.targetChannels), normalizeChannelIds(candidate.targetChannels));
  const isSameAuthor = Boolean(fields.author && candidate.authorToken === fields.author);
  const isOperatorSpecified = operatorComparatorIds.includes(candidate.operatorComparatorId);
  const buyoutTreatment = describeBuyoutTreatment(candidate);
  const revenueBasis = buildRevenueBasis(candidate);
  const similarityReasons = [];

  if (sourceMatch) similarityReasons.push("source matched");
  if (classificationSimilarity > 0) similarityReasons.push(`classification overlap ${round(classificationSimilarity)}`);
  if (volumeSimilarity > 0) similarityReasons.push(`volume similarity ${round(volumeSimilarity)}`);
  if (completionStatusMatch) similarityReasons.push("completion status matched");
  if (heatSimilarity > 0) similarityReasons.push(`heat similarity ${round(heatSimilarity)}`);
  if (channelSimilarity > 0) similarityReasons.push(`channel overlap ${round(channelSimilarity)}`);
  if (candidate.revenueModel === "buyout_plus_sales") similarityReasons.push("buyout plus sales separated");
  if (candidate.revenueModel === "pure_buyout") similarityReasons.push("pure buyout separated");
  if (isSameAuthor) similarityReasons.push("same author reference only");
  if (isOperatorSpecified) similarityReasons.push("operator specified");

  const similarityScore = round(
    (sourceMatch ? 20 : 0) +
      classificationSimilarity * 28 +
      volumeSimilarity * 14 +
      (completionStatusMatch ? 8 : 0) +
      heatSimilarity * 12 +
      channelSimilarity * 12 +
      (candidate.revenueModel === "pure_sales_share" ? 4 : 0) +
      (candidate.revenueModel === "buyout_plus_sales" ? 2 : 0)
  );

  return {
    ...candidate,
    sourceMatch,
    classificationSimilarity,
    volumeSimilarity,
    completionStatusMatch,
    heatSimilarity,
    channelSimilarity,
    isSameAuthor,
    isOperatorSpecified,
    similarityScore,
    similarityReasons,
    revenueBasis,
    buyoutTreatment,
    isSystemEligible: !isSameAuthor && candidate.revenueModel !== "pure_buyout"
  };
}

function toSystemComparable(candidate) {
  return {
    comparableWorkId: candidate.workId,
    syntheticTitle: candidate.syntheticTitle,
    source: candidate.source,
    classification: candidate.classification,
    similarityScore: candidate.similarityScore,
    similarityReasons: candidate.similarityReasons,
    revenueBasis: candidate.revenueBasis,
    buyoutTreatment: candidate.buyoutTreatment,
    includedReason: "Selected by synthetic source, classification, volume, heat and channel similarity.",
    nonFormal: true,
    fixtureOnly: true,
    notForFormalDecision: true
  };
}

function toSameAuthorReferenceWork(candidate) {
  return {
    authorWorkId: candidate.workId,
    monthlyEquivalent: monthlyEquivalentForReference(candidate),
    revenueBasis: candidate.revenueBasis,
    notCountedAgainstComparableLimit: true,
    nonFormal: true,
    fixtureOnly: true,
    notForFormalDecision: true
  };
}

function toExcludedComparable(candidate, operatorComparatorIds) {
  const reason = exclusionReason(candidate, operatorComparatorIds);
  return {
    candidateId: candidate.workId,
    excludedReason: reason.message,
    excludedReasonCode: reason.code,
    nonFormal: true,
    fixtureOnly: true,
    notForFormalDecision: true
  };
}

function exclusionReason(candidate, operatorComparatorIds) {
  if (candidate.isSameAuthor) {
    return {
      code: "same_author_reference_separated",
      message: "Same-author work is displayed as a reference and does not consume a system comparable slot."
    };
  }
  if (candidate.revenueModel === "pure_buyout") {
    return {
      code: "pure_buyout_historical_value_only",
      message: "Pure buyout revenue is separated as historical value reference, not direct sales-curve comparable."
    };
  }
  if (operatorComparatorIds.includes(candidate.operatorComparatorId)) {
    return {
      code: "operator_specified_displayed_separately",
      message: "Operator-specified comparator is retained separately and does not consume a system slot."
    };
  }
  return {
    code: "lower_similarity_not_in_top_three",
    message: "Candidate was below the top three system similarity scores."
  };
}

function buildRevenueBasis(candidate) {
  if (candidate.revenueModel === "pure_buyout") {
    return {
      type: "buyout_historical_value_reference",
      monthlyEquivalent: candidate.buyoutMonthlyEquivalent,
      salesCurveEligible: false
    };
  }
  if (candidate.revenueModel === "buyout_plus_sales") {
    return {
      type: "sales_component_monthly_equivalent",
      monthlyEquivalent: candidate.salesMonthlyEquivalent,
      separatedBuyoutMonthlyEquivalent: candidate.buyoutMonthlyEquivalent,
      salesCurveEligible: true
    };
  }
  return {
    type: "sales_monthly_equivalent",
    monthlyEquivalent: candidate.salesMonthlyEquivalent,
    salesCurveEligible: true
  };
}

function describeBuyoutTreatment(candidate) {
  if (candidate.revenueModel === "pure_buyout") {
    return "pure_buyout_separated_not_sales_curve";
  }
  if (candidate.revenueModel === "buyout_plus_sales") {
    return "sales_component_used_buyout_component_reported_separately";
  }
  return "not_buyout_sales_curve_eligible";
}

function normalizeOperatorComparatorIds(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function normalizeChannelIds(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === "string") return item;
    return item.channelId ?? item.channelName ?? "";
  }).filter(Boolean);
}

function scoreVolumeSimilarity(fields, candidate) {
  const fieldVolume = fields.wordCount ?? fields.audioVolumeEstimate;
  const candidateVolume = candidate.wordCount ?? candidate.audioVolumeEstimate;
  if (!isPositiveNumber(fieldVolume) || !isPositiveNumber(candidateVolume)) {
    return 0;
  }
  const ratio = Math.min(fieldVolume, candidateVolume) / Math.max(fieldVolume, candidateVolume);
  return Math.max(0, Math.min(1, ratio));
}

function scoreHeatSimilarity(fields, candidate) {
  const fieldHeat = heatScore(fields);
  const candidateHeat = heatScore(candidate.heatSignals);
  if (!isPositiveNumber(fieldHeat) || !isPositiveNumber(candidateHeat)) {
    return 0;
  }
  return Math.min(fieldHeat, candidateHeat) / Math.max(fieldHeat, candidateHeat);
}

function heatScore(fields = {}) {
  const numeric =
    Math.min(100000, fields.reads ?? 0) * 0.08 +
    Math.min(20000, fields.collections ?? 0) * 0.45 +
    Math.max(0, (fields.ratingScore ?? 0) - 6) * 1600 +
    Math.min(8000, fields.commentCount ?? 0) * 0.3;
  const objectBonus = ["rankings", "searchHeat", "socialHeat", "platformHeat", "externalHeat"]
    .filter((key) => hasValue(fields[key])).length * 1200;
  return numeric + objectBonus;
}

function overlapRatio(left, right) {
  const leftValues = new Set(Array.isArray(left) ? left : []);
  const rightValues = new Set(Array.isArray(right) ? right : []);
  if (leftValues.size === 0 || rightValues.size === 0) return 0;
  const overlap = [...leftValues].filter((value) => rightValues.has(value)).length;
  return overlap / Math.max(leftValues.size, rightValues.size);
}

function monthlyEquivalentForReference(candidate) {
  if (candidate.revenueModel === "pure_buyout") {
    return candidate.buyoutMonthlyEquivalent;
  }
  return candidate.salesMonthlyEquivalent;
}

function isPositiveNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function hasValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function round(value) {
  return Math.round(value * 100) / 100;
}
