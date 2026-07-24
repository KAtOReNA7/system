import { createHash } from "node:crypto";

import { scoreM2CurrentPointRows } from "./metrics.js";

export function buildM2CurrentBusinessSample(candidateRows, contract) {
  if (!Array.isArray(candidateRows) || candidateRows.length === 0) {
    throw new Error("m2_current_business_sample_candidate_rows_required");
  }
  if (!contract?.businessSample) {
    throw new Error("m2_current_business_sample_contract_required");
  }
  const selected = [];
  const selectedWorks = new Set();
  for (const segment of contract.activitySegmentValues) {
    const segmentRows = candidateRows.filter((row) => row.segment === segment);
    const byWork = groupByWork(segmentRows);
    selectRepresentativeWorks({
      segment,
      byWork,
      selected,
      selectedWorks,
      count: contract.businessSample.representativeWorkCountPerSegment,
      seed: contract.businessSample.seed
    });
    selectStressWorks({
      segment,
      byWork,
      selected,
      selectedWorks,
      count:
        contract.businessSample.largestUnderpredictionWorkCountPerSegment,
      selectionClass: "largest_underprediction",
      error: (row) => Number(row.actual) - Number(row.pointEstimate)
    });
    selectStressWorks({
      segment,
      byWork,
      selected,
      selectedWorks,
      count:
        contract.businessSample.largestOverpredictionWorkCountPerSegment,
      selectionClass: "largest_overprediction",
      error: (row) => Number(row.pointEstimate) - Number(row.actual)
    });
  }
  const expectedCount = contract.activitySegmentValues.length * (
    contract.businessSample.representativeWorkCountPerSegment
    + contract.businessSample.largestUnderpredictionWorkCountPerSegment
    + contract.businessSample.largestOverpredictionWorkCountPerSegment
  );
  if (
    selected.length !== expectedCount
    || new Set(selected.map((row) => row.standardWorkId)).size !== expectedCount
  ) {
    throw new Error("m2_current_business_sample_population_incomplete");
  }
  selected.sort((a, b) => a.sampleId.localeCompare(b.sampleId));
  return {
    privateRows: selected,
    publicReport: buildPublicReport(selected, candidateRows, contract)
  };
}

function selectRepresentativeWorks({
  segment,
  byWork,
  selected,
  selectedWorks,
  count,
  seed
}) {
  const ranked = [...byWork.entries()]
    .sort(([a], [b]) => (
      hash(`${seed}|${segment}|representative|${a}`)
        .localeCompare(hash(`${seed}|${segment}|representative|${b}`))
      || a.localeCompare(b)
    ));
  for (const [workId, rows] of ranked) {
    if (selectedWorks.has(workId)) {
      continue;
    }
    const row = [...rows].sort((a, b) => (
      hash(`${seed}|${segment}|case|${caseIdentity(a)}`)
        .localeCompare(hash(`${seed}|${segment}|case|${caseIdentity(b)}`))
    ))[0];
    selectedWorks.add(workId);
    selected.push(toSampleRow(row, "representative", seed));
    if (
      selected.filter(
        (item) => (
          item.segment === segment
          && item.selectionClass === "representative"
        )
      ).length === count
    ) {
      return;
    }
  }
}

function selectStressWorks({
  segment,
  byWork,
  selected,
  selectedWorks,
  count,
  selectionClass,
  error
}) {
  const ranked = [...byWork.entries()]
    .map(([workId, rows]) => ({
      workId,
      row: [...rows].sort((a, b) => (
        error(b) - error(a)
        || caseIdentity(a).localeCompare(caseIdentity(b))
      ))[0]
    }))
    .filter(({ row }) => error(row) > 0)
    .sort((a, b) => (
      error(b.row) - error(a.row)
      || a.workId.localeCompare(b.workId)
    ));
  let added = 0;
  for (const { workId, row } of ranked) {
    if (selectedWorks.has(workId)) {
      continue;
    }
    selectedWorks.add(workId);
    selected.push(toSampleRow(row, selectionClass, 0));
    added += 1;
    if (added === count) {
      return;
    }
  }
}

function toSampleRow(row, selectionClass, seed) {
  return {
    sampleId: `S-${hash(
      `${seed}|${selectionClass}|${caseIdentity(row)}`
    ).slice(0, 16)}`,
    standardWorkId: row.standardWorkId,
    origin: row.origin,
    horizonMonths: row.horizonMonths,
    route: row.route,
    segment: row.segment,
    selectionClass,
    b4PointEstimate: row.comparatorPointEstimate,
    previousCandidatePointEstimate: row.previousCandidatePointEstimate,
    candidatePointEstimate: row.pointEstimate,
    actual: row.actual,
    selectedCandidateId: row.selectedCandidateId,
    selectedFactor: row.selectedFactor,
    reviewOutcome: "",
    reviewReasonCode: "",
    reviewerNote: ""
  };
}

function buildPublicReport(rows, fullPopulation, contract) {
  const dormantPositive = fullPopulation
    .filter((row) => row.segment === "dormant" && Number(row.actual) > 0)
    .map((row) => Number(row.actual))
    .sort((a, b) => b - a);
  const dormantCash = dormantPositive.reduce((sum, value) => sum + value, 0);
  const metrics = scoreM2CurrentPointRows(rows.map((row) => ({
    actual: row.actual,
    pointEstimate: row.candidatePointEstimate
  })));
  return {
    schema: "m2.current.business_sample.public.v0.2",
    decisionStatus: "not_for_formal_decision",
    sampleDesign: {
      seed: contract.businessSample.seed,
      workCount: rows.length,
      caseCount: rows.length,
      uniqueWorkRequired: true,
      representativeSelectionUsesActual: false,
      stressSelectionUsesActualForDiagnosticOnly: true,
      selectedBeforeHumanReview: true
    },
    distribution: {
      bySegment: countBy(rows, (row) => row.segment),
      bySelectionClass: countBy(rows, (row) => row.selectionClass),
      byHorizon: countBy(rows, (row) => String(row.horizonMonths)),
      byOrigin: countBy(rows, (row) => row.origin)
    },
    sampledMetrics: metrics,
    dormantReactivationDiagnostic: {
      positiveCaseCount: dormantPositive.length,
      top1PositiveCashShare: shareOfFirst(dormantPositive, dormantCash, 1),
      top3PositiveCashShare: shareOfFirst(dormantPositive, dormantCash, 3),
      top5PositiveCashShare: shareOfFirst(dormantPositive, dormantCash, 5),
      interpretation:
        "a_few_large_reactivations_dominate_and_are_not_identifiable_from_allowed_features"
    },
    humanReview: {
      status: "NOT_REQUIRED_BY_USER_DECISION",
      numericForecastRequired: false,
      privateWorkbookRequired: false,
      sampleRole: contract.evaluationPolicy.businessSampleRole,
      suitableForRepresentativeAcceptance: false,
      reason:
        "stress_rows_are_selected_with_actuals_and_the_sample_is_for_error_diagnosis",
      finalAcceptance: {
        status: "DEFERRED_UNTIL_TECHNICAL_GATES_PASS",
        mode: contract.evaluationPolicy.finalHumanAcceptanceMode,
        allowedOutcomes: ["accept", "accept_with_limits", "reject"]
      }
    },
    boundaries: {
      aggregateOnly: true,
      identifiersPresent: false,
      privateRowsTracked: false,
      finalHoldoutOpened: false,
      releaseAuthorized: false
    }
  };
}

function groupByWork(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const workId = String(row.standardWorkId);
    const values = grouped.get(workId) ?? [];
    values.push(row);
    grouped.set(workId, values);
  }
  return grouped;
}

function countBy(rows, selector) {
  const counts = {};
  for (const row of rows) {
    const key = selector(row);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))
  );
}

function shareOfFirst(values, denominator, count) {
  if (denominator === 0) {
    return null;
  }
  return values.slice(0, count).reduce((sum, value) => sum + value, 0)
    / denominator;
}

function caseIdentity(row) {
  return [
    row.standardWorkId,
    row.origin,
    row.horizonMonths,
    row.route
  ].join("|");
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}
