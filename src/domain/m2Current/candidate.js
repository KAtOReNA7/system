import { buildM2CurrentCaseKey } from "./case.js";
import {
  scoreM2CurrentPointRows,
  scoreM2CurrentSlices
} from "./metrics.js";

export function buildM2CurrentSegmentedCandidate(
  comparatorRows,
  segmentRows,
  contract
) {
  const comparators = indexComparators(comparatorRows, contract);
  const segments = indexSegments(segmentRows, contract);
  if (comparators.size !== segments.size) {
    throw new Error("m2_current_candidate_segment_population_mismatch");
  }
  const sourceRows = [...comparators.values()].map((row) => {
    const key = buildM2CurrentCaseKey(row, contract);
    const segment = segments.get(key);
    if (!segment) {
      throw new Error("m2_current_candidate_segment_case_missing");
    }
    return { ...row, segment };
  });
  sourceRows.sort(compareCases);

  const origins = [...new Set(sourceRows.map((row) => row.origin))].sort();
  const candidateRows = [];
  const selections = [];
  for (const origin of origins) {
    for (const segment of contract.activitySegmentValues) {
      const trainingRows = sourceRows.filter((row) => (
        row.segment === segment
        && row.origin < origin
        && requireMonth(row.labelAvailableAsOf, "label_available_as_of") <= origin
      ));
      const outerRows = sourceRows.filter((row) => (
        row.segment === segment && row.origin === origin
      ));
      const selection = selectSegmentRule(
        segment,
        origin,
        trainingRows,
        contract
      );
      selections.push(selection.publicEvidence);
      for (const row of outerRows) {
        candidateRows.push({
          ...row,
          pointEstimate: selection.predict(row),
          selectedCandidateId: selection.publicEvidence.selectedCandidateId
        });
      }
    }
  }
  candidateRows.sort(compareCases);
  return {
    candidateId: contract.candidate.id,
    rows: candidateRows,
    selections,
    bySegment: scoreM2CurrentSlices(candidateRows, "segment"),
    byOrigin: scoreM2CurrentSlices(candidateRows, "origin"),
    byHorizon: scoreM2CurrentSlices(candidateRows, "horizonMonths")
  };
}

export function buildM2CurrentReliableCandidate(
  comparatorRows,
  featureRows,
  contract
) {
  if (!contract?.candidate?.groupCalibration) {
    throw new Error("m2_current_reliable_candidate_contract_required");
  }
  const comparators = indexComparators(comparatorRows, contract);
  const features = indexReliableFeatures(featureRows, contract);
  if (comparators.size !== features.size) {
    throw new Error("m2_current_reliable_candidate_feature_population_mismatch");
  }
  const sourceRows = [...comparators.values()].map((row) => {
    const key = buildM2CurrentCaseKey(row, contract);
    const feature = features.get(key);
    if (!feature) {
      throw new Error("m2_current_reliable_candidate_feature_case_missing");
    }
    return { ...row, ...feature };
  });
  sourceRows.sort(compareCases);

  const origins = [...new Set(sourceRows.map((row) => row.origin))].sort();
  const candidateRows = [];
  const selections = [];
  for (const origin of origins) {
    for (const segment of contract.activitySegmentValues) {
      const trainingRows = sourceRows.filter((row) => (
        row.segment === segment
        && row.origin < origin
        && requireMonth(row.labelAvailableAsOf, "label_available_as_of") <= origin
      ));
      const outerRows = sourceRows.filter((row) => (
        row.segment === segment && row.origin === origin
      ));
      const selected = selectReliableRules(
        segment,
        origin,
        trainingRows,
        outerRows,
        contract
      );
      selections.push(...selected.publicEvidence);
      for (const row of outerRows) {
        const rule = selected.ruleFor(row);
        candidateRows.push({
          ...row,
          pointEstimate: row.pointEstimate * rule.factor,
          selectedCandidateId: rule.selectedCandidateId,
          selectedFactor: rule.factor
        });
      }
    }
  }
  candidateRows.sort(compareCases);
  return {
    candidateId: contract.candidate.id,
    rows: candidateRows,
    selections,
    bySegment: scoreM2CurrentSlices(candidateRows, "segment"),
    byOrigin: scoreM2CurrentSlices(candidateRows, "origin"),
    byHorizon: scoreM2CurrentSlices(candidateRows, "horizonMonths")
  };
}

export function buildM2CurrentOccurrenceAmountCandidate(
  baseCandidateRows,
  contract
) {
  const policy = contract?.candidate?.occurrenceAmount;
  if (!policy) {
    throw new Error("m2_current_occurrence_amount_contract_required");
  }
  const rows = [...baseCandidateRows].map((row) => ({
    ...row,
    pointEstimate: Number(row.pointEstimate),
    actual: Number(row.actual)
  })).sort(compareCases);
  if (rows.length === 0) {
    throw new Error("m2_current_occurrence_amount_rows_required");
  }
  const candidateRows = [];
  const selections = [];
  const origins = [...new Set(rows.map((row) => row.origin))].sort();
  for (const origin of origins) {
    for (const segment of contract.activitySegmentValues) {
      const trainingRows = rows.filter((row) => (
        row.segment === segment
        && row.origin < origin
        && requireMonth(row.labelAvailableAsOf, "label_available_as_of")
          <= origin
      ));
      const outerRows = rows.filter((row) => (
        row.segment === segment && row.origin === origin
      ));
      const selection = selectOccurrenceAmountRule(
        segment,
        origin,
        trainingRows,
        policy
      );
      selections.push(selection.evidence);
      for (const row of outerRows) {
        candidateRows.push({
          ...row,
          baseCandidatePointEstimate: row.pointEstimate,
          pointEstimate: row.pointEstimate * selection.factor,
          occurrenceProbability: selection.occurrenceProbability,
          conditionalAmountScale: selection.conditionalAmountScale,
          selectedCandidateId: selection.selectedCandidateId,
          selectedFactor: selection.factor
        });
      }
    }
  }
  candidateRows.sort(compareCases);
  return {
    candidateId: contract.candidate.id,
    baseCandidateId: policy.baseCandidateId,
    rows: candidateRows,
    selections,
    bySegment: scoreM2CurrentSlices(candidateRows, "segment"),
    byOrigin: scoreM2CurrentSlices(candidateRows, "origin"),
    byHorizon: scoreM2CurrentSlices(candidateRows, "horizonMonths")
  };
}

function selectOccurrenceAmountRule(segment, origin, rows, policy) {
  const baseMetrics = rows.length > 0
    ? scoreM2CurrentPointRows(rows)
    : null;
  const fallback = {
    factor: 1,
    occurrenceProbability: null,
    conditionalAmountScale: null,
    selectedCandidateId: policy.baseCandidateId
  };
  if (!policy.eligibleSegments.includes(segment)) {
    return occurrenceAmountSelection(
      segment,
      origin,
      rows,
      fallback,
      baseMetrics,
      null,
      "segment_uses_base_candidate_fallback"
    );
  }
  if (rows.length < policy.minimumEarlierCaseCount) {
    return occurrenceAmountSelection(
      segment,
      origin,
      rows,
      fallback,
      baseMetrics,
      null,
      "mature_earlier_evidence_below_minimum"
    );
  }
  const positiveRows = rows.filter((row) => row.actual > 0);
  const occurrenceProbability = (
    positiveRows.length
    + policy.priorStrength * policy.priorOccurrenceProbability
  ) / (rows.length + policy.priorStrength);
  const positivePrediction = positiveRows.reduce(
    (sum, row) => sum + row.pointEstimate,
    0
  );
  if (positiveRows.length === 0 || positivePrediction <= 0) {
    return occurrenceAmountSelection(
      segment,
      origin,
      rows,
      fallback,
      baseMetrics,
      null,
      "positive_amount_calibration_unavailable"
    );
  }
  const conditionalAmountScale = positiveRows.reduce(
    (sum, row) => sum + row.actual,
    0
  ) / positivePrediction;
  const factor = clamp(
    occurrenceProbability * conditionalAmountScale,
    policy.minimumFactor,
    policy.maximumFactor
  );
  const challengerMetrics = scoreM2CurrentPointRows(rows.map((row) => ({
    ...row,
    pointEstimate: row.pointEstimate * factor
  })));
  const relativeWape = challengerMetrics.wape / baseMetrics.wape - 1;
  if (
    relativeWape > -policy.minimumRelativeWapeImprovement
    || Math.abs(challengerMetrics.signedBias)
      > policy.trainingAbsoluteBiasMaximum
  ) {
    return occurrenceAmountSelection(
      segment,
      origin,
      rows,
      {
        ...fallback,
        occurrenceProbability,
        conditionalAmountScale
      },
      baseMetrics,
      relativeWape,
      "two_part_rule_did_not_clear_training_improvement_and_bias_gates"
    );
  }
  return occurrenceAmountSelection(
    segment,
    origin,
    rows,
    {
      factor,
      occurrenceProbability,
      conditionalAmountScale,
      selectedCandidateId: `${segment}__two_part_occurrence_amount`
    },
    challengerMetrics,
    relativeWape,
    "two_part_rule_improved_mature_earlier_wape_and_is_bias_safe"
  );
}

function occurrenceAmountSelection(
  segment,
  origin,
  rows,
  rule,
  metrics,
  relativeWape,
  reason
) {
  return {
    ...rule,
    evidence: {
      outerOrigin: origin,
      segment,
      matureEarlierCaseCount: rows.length,
      matureEarlierOriginCount: new Set(rows.map((row) => row.origin)).size,
      positiveEarlierCaseCount: rows.filter((row) => row.actual > 0).length,
      maximumLabelAvailableAsOf:
        rows.map((row) => row.labelAvailableAsOf).sort().at(-1) ?? null,
      selectedCandidateId: rule.selectedCandidateId,
      selectionReason: reason,
      selectedFactor: rule.factor,
      occurrenceProbability: rule.occurrenceProbability,
      conditionalAmountScale: rule.conditionalAmountScale,
      trainingMetrics: metrics,
      relativeWapeToBaseCandidate: relativeWape,
      sameOrLaterOuterTruthRead: false,
      postHocFeatureRead: false
    }
  };
}

function selectReliableRules(
  segment,
  origin,
  trainingRows,
  outerRows,
  contract
) {
  if (segment === "dormant") {
    const rule = {
      factor: 1,
      selectedCandidateId: "B4"
    };
    return {
      ruleFor: () => rule,
      publicEvidence: [
        reliableEvidence({
          segment,
          origin,
          groupFeature: null,
          groupValue: "all",
          rows: trainingRows,
          rule,
          selectionReason:
            "dormant_reactivation_signal_not_identifiable_from_allowed_as_of_features",
          metrics: trainingRows.length > 0
            ? scoreM2CurrentPointRows(trainingRows)
            : null,
          relativeWapeToSegmentFallback: null
        })
      ]
    };
  }
  const feature = contract.candidate.groupCalibration
    .featureBySegment[segment];
  if (!feature) {
    throw new Error("m2_current_reliable_candidate_group_feature_missing");
  }
  const segmentSelection = selectReliableScale(trainingRows, contract);
  const segmentRule = {
    factor: segmentSelection.factor,
    selectedCandidateId: segmentSelection.factor === 1
      ? "B4"
      : `${segment}__segment_scale_${factorId(segmentSelection.factor)}`
  };
  const groupValues = [...new Set(outerRows.map(
    (row) => reliableGroupValue(row, feature, contract)
  ))].sort();
  const rules = new Map();
  const publicEvidence = [];
  for (const groupValue of groupValues) {
    const groupRows = trainingRows.filter(
      (row) => reliableGroupValue(row, feature, contract) === groupValue
    );
    const fallbackMetrics = groupRows.length > 0
      ? scoreM2CurrentPointRows(groupRows.map((row) => ({
        ...row,
        pointEstimate: row.pointEstimate * segmentRule.factor
      })))
      : null;
    let rule = segmentRule;
    let metrics = fallbackMetrics;
    let relativeWapeToSegmentFallback = null;
    let selectionReason = trainingRows.length === 0
      ? "no_mature_earlier_labels"
      : "group_uses_segment_fallback";
    if (
      groupRows.length
        >= contract.candidate.groupCalibration.minimumEarlierCaseCount
    ) {
      const groupSelection = selectReliableScale(groupRows, contract);
      const groupMetrics = groupSelection.metrics;
      relativeWapeToSegmentFallback = (
        groupMetrics.wape / fallbackMetrics.wape - 1
      );
      if (
        relativeWapeToSegmentFallback
          <= -contract.candidate.groupCalibration
            .minimumRelativeWapeImprovement
      ) {
        rule = {
          factor: groupSelection.factor,
          selectedCandidateId: `${segment}__${feature}__${safeId(groupValue)}`
            + `__scale_${factorId(groupSelection.factor)}`
        };
        metrics = groupMetrics;
        selectionReason =
          "group_scale_improves_mature_earlier_wape_and_is_bias_safe";
      } else {
        selectionReason =
          "group_scale_does_not_improve_segment_fallback_enough";
      }
    } else if (trainingRows.length > 0) {
      selectionReason = "group_evidence_below_minimum";
    }
    rules.set(groupValue, rule);
    publicEvidence.push(reliableEvidence({
      segment,
      origin,
      groupFeature: feature,
      groupValue,
      rows: groupRows,
      rule,
      selectionReason,
      metrics,
      relativeWapeToSegmentFallback
    }));
  }
  return {
    ruleFor: (row) => (
      rules.get(reliableGroupValue(row, feature, contract)) ?? segmentRule
    ),
    publicEvidence
  };
}

function selectReliableScale(rows, contract) {
  if (rows.length === 0) {
    return { factor: 1, metrics: null };
  }
  const feasible = contract.candidate.scaleFactors
    .map((factor) => ({
      factor,
      metrics: scoreM2CurrentPointRows(rows.map((row) => ({
        ...row,
        pointEstimate: row.pointEstimate * factor
      })))
    }))
    .filter(({ metrics }) => (
      Math.abs(metrics.signedBias)
        <= contract.candidate.trainingAbsoluteBiasMaximum
    ))
    .sort((a, b) => (
      a.metrics.wape - b.metrics.wape
      || Math.abs(a.metrics.signedBias) - Math.abs(b.metrics.signedBias)
      || b.factor - a.factor
    ));
  return feasible[0] ?? {
    factor: 1,
    metrics: scoreM2CurrentPointRows(rows)
  };
}

function reliableEvidence({
  segment,
  origin,
  groupFeature,
  groupValue,
  rows,
  rule,
  selectionReason,
  metrics,
  relativeWapeToSegmentFallback
}) {
  return {
    outerOrigin: origin,
    segment,
    groupFeature,
    groupValue,
    matureEarlierCaseCount: rows.length,
    matureEarlierOriginCount: new Set(rows.map((row) => row.origin)).size,
    maximumLabelAvailableAsOf:
      rows.map((row) => row.labelAvailableAsOf).sort().at(-1) ?? null,
    selectedCandidateId: rule.selectedCandidateId,
    selectionReason,
    selectedFactor: rule.factor,
    trainingMetrics: metrics,
    relativeWapeToSegmentFallback,
    sameOrLaterOuterTruthRead: false,
    postHocFeatureRead: false
  };
}

function indexReliableFeatures(rows, contract) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("m2_current_reliable_candidate_features_required");
  }
  const indexed = new Map();
  for (const row of rows) {
    const key = buildM2CurrentCaseKey(row, contract);
    if (!contract.activitySegments.has(row.segment)) {
      throw new Error("m2_current_reliable_candidate_segment_invalid");
    }
    if (
      row.historicalFeaturePolicy !== "as_of_only"
      || row.sourceShelfRightsTermPolicy !== "post_hoc_only"
    ) {
      throw new Error("m2_current_reliable_candidate_feature_policy_invalid");
    }
    if (typeof row.spikeCandidate !== "boolean") {
      throw new Error("m2_current_reliable_candidate_spike_invalid");
    }
    if (
      typeof row.valueBand !== "string"
      || !contract.candidate.groupCalibration.allowedValueBands
        .includes(row.valueBand)
    ) {
      throw new Error("m2_current_reliable_candidate_value_band_invalid");
    }
    if (indexed.has(key)) {
      throw new Error("m2_current_reliable_candidate_duplicate_feature_case");
    }
    indexed.set(key, {
      segment: row.segment,
      spikeCandidate: row.spikeCandidate,
      valueBand: row.valueBand,
      historicalFeaturePolicy: row.historicalFeaturePolicy,
      sourceShelfRightsTermPolicy: row.sourceShelfRightsTermPolicy
    });
  }
  return indexed;
}

function reliableGroupValue(row, feature, contract) {
  if (feature === "spike_candidate") {
    return row.spikeCandidate ? "true" : "false";
  }
  if (feature === "value_band") {
    if (
      !contract.candidate.groupCalibration.allowedValueBands
        .includes(row.valueBand)
    ) {
      throw new Error("m2_current_reliable_candidate_value_band_invalid");
    }
    return row.valueBand;
  }
  throw new Error("m2_current_reliable_candidate_group_feature_invalid");
}

function safeId(value) {
  return String(value).replaceAll(/[^a-z0-9]+/giu, "_").replaceAll(/^_|_$/gu, "");
}

function selectSegmentRule(segment, origin, rows, contract) {
  if (rows.length === 0) {
    return fallback(segment, origin, rows, "no_mature_earlier_labels");
  }
  if (segment === "dormant") {
    return selectDormantRule(origin, rows, contract);
  }
  return selectDownwardScale(segment, origin, rows, contract);
}

function selectDownwardScale(segment, origin, rows, contract) {
  const candidates = contract.candidate.scaleFactors.map((factor) => {
    const metrics = scoreM2CurrentPointRows(rows.map((row) => ({
      ...row,
      pointEstimate: row.pointEstimate * factor
    })));
    return { factor, metrics };
  });
  const feasible = candidates
    .filter(({ metrics }) => (
      Math.abs(metrics.signedBias)
        <= contract.candidate.trainingAbsoluteBiasMaximum
    ))
    .sort(compareScaleCandidates);
  if (feasible.length === 0) {
    return fallback(
      segment,
      origin,
      rows,
      "no_bias_feasible_downward_scale"
    );
  }
  const selected = feasible[0];
  return {
    predict: (row) => row.pointEstimate * selected.factor,
    publicEvidence: evidence({
      segment,
      origin,
      rows,
      selectedCandidateId: `${segment}__b4_scale_${factorId(selected.factor)}`,
      selectionReason: "best_wape_among_bias_feasible_mature_earlier_labels",
      factor: selected.factor,
      metrics: selected.metrics
    })
  };
}

function selectDormantRule(origin, rows, contract) {
  const policy = contract.candidate.dormantReactivation;
  const earlierOriginCount = new Set(rows.map((row) => row.origin)).size;
  if (
    earlierOriginCount < policy.minimumEarlierOriginCount
    || rows.length < policy.minimumEarlierCaseCount
  ) {
    return fallback(
      "dormant",
      origin,
      rows,
      "dormant_reactivation_evidence_below_minimum"
    );
  }
  const means = horizonActualMeans(rows);
  const comparator = scoreM2CurrentPointRows(rows);
  const feasible = policy.blendFactors
    .filter((blend) => blend > 0)
    .map((blend) => {
      const metrics = scoreM2CurrentPointRows(rows.map((row) => ({
        ...row,
        pointEstimate: dormantPoint(row, blend, means)
      })));
      return {
        blend,
        metrics,
        relativeWape: metrics.wape / comparator.wape - 1
      };
    })
    .filter(({ metrics, relativeWape }) => (
      Math.abs(metrics.signedBias)
        <= contract.candidate.trainingAbsoluteBiasMaximum
      && relativeWape
        <= -policy.minimumRelativeWapeImprovement
    ))
    .sort((a, b) => (
      a.metrics.wape - b.metrics.wape
      || Math.abs(a.metrics.signedBias) - Math.abs(b.metrics.signedBias)
      || a.blend - b.blend
    ));
  if (feasible.length === 0) {
    return fallback(
      "dormant",
      origin,
      rows,
      "dormant_reactivation_not_bias_safe_and_better"
    );
  }
  const selected = feasible[0];
  return {
    predict: (row) => dormantPoint(row, selected.blend, means),
    publicEvidence: evidence({
      segment: "dormant",
      origin,
      rows,
      selectedCandidateId:
        `dormant__earlier_reactivation_blend_${factorId(selected.blend)}`,
      selectionReason: "bias_safe_reactivation_improved_mature_earlier_wape",
      factor: selected.blend,
      metrics: selected.metrics,
      relativeWape: selected.relativeWape
    })
  };
}

function fallback(segment, origin, rows, selectionReason) {
  const metrics = rows.length > 0 ? scoreM2CurrentPointRows(rows) : null;
  return {
    predict: (row) => row.pointEstimate,
    publicEvidence: evidence({
      segment,
      origin,
      rows,
      selectedCandidateId: "B4",
      selectionReason,
      factor: segment === "dormant" ? 0 : 1,
      metrics
    })
  };
}

function evidence({
  segment,
  origin,
  rows,
  selectedCandidateId,
  selectionReason,
  factor,
  metrics,
  relativeWape = null
}) {
  return {
    outerOrigin: origin,
    segment,
    matureEarlierCaseCount: rows.length,
    matureEarlierOriginCount: new Set(rows.map((row) => row.origin)).size,
    maximumLabelAvailableAsOf:
      rows.map((row) => row.labelAvailableAsOf).sort().at(-1) ?? null,
    selectedCandidateId,
    selectionReason,
    selectedFactor: factor,
    trainingMetrics: metrics,
    relativeWape,
    sameOrLaterOuterTruthRead: false
  };
}

function horizonActualMeans(rows) {
  const totals = new Map();
  for (const row of rows) {
    const current = totals.get(row.horizonMonths) ?? { total: 0, count: 0 };
    current.total += Number(row.actual);
    current.count += 1;
    totals.set(row.horizonMonths, current);
  }
  return new Map([...totals].map(([horizon, value]) => [
    horizon,
    value.total / value.count
  ]));
}

function dormantPoint(row, blend, means) {
  const mean = means.get(row.horizonMonths) ?? 0;
  return Math.max(0, row.pointEstimate * (1 - blend) + mean * blend);
}

function indexComparators(rows, contract) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("m2_current_candidate_comparator_rows_required");
  }
  const indexed = new Map();
  for (const row of rows) {
    requireMonth(row.labelAvailableAsOf, "label_available_as_of");
    const key = buildM2CurrentCaseKey(row, contract);
    if (indexed.has(key)) {
      throw new Error("m2_current_candidate_duplicate_comparator_case");
    }
    indexed.set(key, row);
  }
  return indexed;
}

function indexSegments(rows, contract) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("m2_current_candidate_segment_rows_required");
  }
  const indexed = new Map();
  for (const row of rows) {
    const key = buildM2CurrentCaseKey(row, contract);
    if (!contract.activitySegments.has(row.segment)) {
      throw new Error("m2_current_candidate_activity_segment_invalid");
    }
    if (indexed.has(key)) {
      throw new Error("m2_current_candidate_duplicate_segment_case");
    }
    indexed.set(key, row.segment);
  }
  return indexed;
}

function requireMonth(value, name) {
  if (typeof value !== "string" || !/^\d{4}-(?:0[1-9]|1[0-2])$/u.test(value)) {
    throw new Error(`m2_current_candidate_${name}_invalid`);
  }
  return value;
}

function compareScaleCandidates(a, b) {
  return (
    a.metrics.wape - b.metrics.wape
    || Math.abs(a.metrics.signedBias) - Math.abs(b.metrics.signedBias)
    || b.factor - a.factor
  );
}

function compareCases(a, b) {
  return (
    a.origin.localeCompare(b.origin)
    || a.standardWorkId.localeCompare(b.standardWorkId)
    || a.horizonMonths - b.horizonMonths
    || a.route.localeCompare(b.route)
  );
}

function factorId(value) {
  return String(Math.round(value * 100)).padStart(3, "0");
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}
