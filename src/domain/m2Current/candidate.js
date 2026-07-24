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
