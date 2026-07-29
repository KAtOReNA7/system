import {
  scorePointRowsV2
} from "./evaluationV2.js";

export function scoreCoreRevenuePointRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return Object.freeze({
      status: "NOT_COMPUTABLE_EMPTY_CELL",
      metrics: null
    });
  }
  const denominator = rows.reduce(
    (sum, row) => sum + Math.abs(Number(row.actual)),
    0
  );
  if (denominator === 0) {
    return Object.freeze({
      status: "NOT_COMPUTABLE_ZERO_ACTUAL_DENOMINATOR",
      metrics: null,
      caseCount: rows.length,
      workCount: distinctWorkCount(rows)
    });
  }
  return Object.freeze({
    status: "COMPUTED",
    metrics: Object.freeze(scorePointRowsV2(rows)),
    caseCount: rows.length,
    workCount: distinctWorkCount(rows)
  });
}

export function scoreCoreRevenuePublicCell(
  rows,
  {
    minimumCaseCount = 30,
    minimumWorkCount = 20,
    portfolio = false,
    minimumPortfolioOriginCount = 5
  } = {}
) {
  const caseCount = rows.length;
  const workCount = distinctWorkCount(rows);
  const originCount = new Set(rows.map((row) => row.origin)).size;
  const suppressed = portfolio
    ? originCount < minimumPortfolioOriginCount
    : caseCount < minimumCaseCount || workCount < minimumWorkCount;
  if (suppressed) {
    return Object.freeze({
      status: "SUPPRESSED_PRIVACY_THRESHOLD",
      caseCount,
      workCount,
      originCount,
      metrics: null
    });
  }
  return Object.freeze({
    ...scoreCoreRevenuePointRows(rows),
    originCount
  });
}

export function scoreCoreRevenueSlices(
  rows,
  field,
  options = {}
) {
  const groups = new Map();
  for (const row of rows) {
    const key = String(row[field] ?? "UNKNOWN");
    const values = groups.get(key) ?? [];
    values.push(row);
    groups.set(key, values);
  }
  return Object.freeze(Object.fromEntries(
    [...groups.entries()]
      .sort(([left], [right]) => stableTextCompare(left, right))
      .map(([key, values]) => [
        key,
        scoreCoreRevenuePublicCell(values, options)
      ])
  ));
}

export function scoreCoreRevenuePairedComparison(
  pairs,
  {
    iterations = 2000,
    seed = 20260728
  } = {}
) {
  if (!Array.isArray(pairs) || pairs.length === 0) {
    return Object.freeze({
      status: "NOT_COMPARABLE_NO_MATCHED_CASES",
      caseCount: 0,
      workCount: 0
    });
  }
  const candidateRows = pairs.map((row) => ({
    standardWorkId: row.standardWorkId,
    actual: row.actual,
    pointEstimate: row.candidatePointEstimate
  }));
  const baselineRows = pairs.map((row) => ({
    standardWorkId: row.standardWorkId,
    actual: row.actual,
    pointEstimate: row.baselinePointEstimate
  }));
  const candidate = scoreCoreRevenuePointRows(candidateRows);
  const baseline = scoreCoreRevenuePointRows(baselineRows);
  if (
    candidate.status !== "COMPUTED"
    || baseline.status !== "COMPUTED"
  ) {
    return Object.freeze({
      status: "NOT_COMPARABLE_ZERO_ACTUAL_DENOMINATOR",
      caseCount: pairs.length,
      workCount: distinctWorkCount(pairs)
    });
  }
  const relativeWapeFva = baseline.metrics.wape === 0
    ? null
    : 1 - candidate.metrics.wape / baseline.metrics.wape;
  return Object.freeze({
    status: "COMPUTED",
    caseCount: pairs.length,
    workCount: distinctWorkCount(pairs),
    candidate: candidate.metrics,
    baseline: baseline.metrics,
    candidateMinusBaselineWape:
      candidate.metrics.wape - baseline.metrics.wape,
    absoluteWapeFva: baseline.metrics.wape - candidate.metrics.wape,
    relativeWapeFva,
    absoluteBiasDelta:
      candidate.metrics.absoluteBias - baseline.metrics.absoluteBias,
    bootstrap: workClusterBootstrapPairs(pairs, {
      iterations,
      seed
    })
  });
}

export function workClusterBootstrapPairs(
  pairs,
  {
    iterations = 2000,
    seed = 20260728
  } = {}
) {
  const clusters = new Map();
  for (const row of pairs) {
    const workId = String(row.standardWorkId);
    const value = clusters.get(workId) ?? {
      candidateError: 0,
      baselineError: 0,
      denominator: 0
    };
    value.candidateError += Math.abs(
      Number(row.candidatePointEstimate) - Number(row.actual)
    );
    value.baselineError += Math.abs(
      Number(row.baselinePointEstimate) - Number(row.actual)
    );
    value.denominator += Math.abs(Number(row.actual));
    clusters.set(workId, value);
  }
  const values = [...clusters.entries()]
    .sort(([left], [right]) => stableTextCompare(left, right))
    .map(([, value]) => value);
  if (values.length === 0) {
    return null;
  }
  const random = mulberry32(seed);
  const deltas = [];
  const relativeFvas = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let candidateError = 0;
    let baselineError = 0;
    let denominator = 0;
    for (let index = 0; index < values.length; index += 1) {
      const value = values[Math.floor(random() * values.length)];
      candidateError += value.candidateError;
      baselineError += value.baselineError;
      denominator += value.denominator;
    }
    const candidateWape = denominator === 0
      ? 0
      : candidateError / denominator;
    const baselineWape = denominator === 0
      ? 0
      : baselineError / denominator;
    deltas.push(candidateWape - baselineWape);
    relativeFvas.push(baselineWape === 0
      ? 0
      : 1 - candidateWape / baselineWape);
  }
  deltas.sort((left, right) => left - right);
  relativeFvas.sort((left, right) => left - right);
  return Object.freeze({
    unit: "standardWorkId",
    clusterCount: values.length,
    iterations,
    seed,
    candidateMinusBaselineWape95: Object.freeze({
      lower: quantileType7(deltas, 0.025),
      upper: quantileType7(deltas, 0.975)
    }),
    candidateFva95: Object.freeze({
      lower: quantileType7(relativeFvas, 0.025),
      upper: quantileType7(relativeFvas, 0.975)
    })
  });
}

export function determineCoreRevenueManualDecision({
  populationComparisons,
  anyMaterialSliceImprovement,
  longTermUncontrolled
}) {
  if (longTermUncontrolled) {
    return Object.freeze({
      status: "M2_CORE_REVENUE_MANUAL_BASELINE_FAIL",
      reason:
        "valid_evaluation_completed_long_term_compounding_uncontrolled"
    });
  }
  for (const comparison of populationComparisons) {
    const primary = comparison.primary;
    const strict = comparison.strict;
    if (
      primary?.status === "COMPUTED"
      && strict?.status === "COMPUTED"
      && primary.relativeWapeFva >= 0.01
      && strict.relativeWapeFva >= 0.01
      && primary.absoluteBiasDelta <= 0.01
      && strict.absoluteBiasDelta <= 0.01
      && comparison.timeStability?.improvedYearCount >= 2
      && comparison.timeStability?.singleYearDriven !== true
    ) {
      return Object.freeze({
        status: "M2_CORE_REVENUE_MANUAL_BASELINE_PASS",
        reason:
          "primary_and_strict_lg01_improve_with_bias_and_time_stability"
      });
    }
  }
  if (anyMaterialSliceImprovement) {
    return Object.freeze({
      status: "M2_CORE_REVENUE_MANUAL_BASELINE_MIXED",
      reason:
        "valid_evaluation_has_material_partial_improvement_without_stable_gate"
    });
  }
  return Object.freeze({
    status: "M2_CORE_REVENUE_MANUAL_BASELINE_FAIL",
    reason:
      "valid_evaluation_completed_without_stable_material_improvement"
  });
}

export function quantiles(values, probabilities) {
  const sorted = values
    .map(Number)
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  if (sorted.length === 0) {
    return Object.freeze(Object.fromEntries(
      probabilities.map((probability) => [String(probability), null])
    ));
  }
  return Object.freeze(Object.fromEntries(
    probabilities.map((probability) => [
      String(probability),
      quantileType7(sorted, probability)
    ])
  ));
}

export function assertCoreRevenuePublicSafe(value) {
  const forbiddenFields = new Set([
    "standardWorkId",
    "channelUid",
    "channelMemberId",
    "authorityRecordId",
    "privatePath",
    "privateReceiptPath"
  ]);
  const visit = (item) => {
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    if (item !== null && typeof item === "object") {
      for (const [field, nested] of Object.entries(item)) {
        if (forbiddenFields.has(field)) {
          throw new Error(
            "m2_core_revenue_manual_public_artifact_private_field_found"
          );
        }
        visit(nested);
      }
      return;
    }
    if (
      typeof item === "string"
      && /^chn_[a-f0-9]+$/u.test(item)
    ) {
      throw new Error(
        "m2_core_revenue_manual_public_artifact_private_value_found"
      );
    }
  };
  visit(value);
  return true;
}

function distinctWorkCount(rows) {
  return new Set(
    rows.map((row, index) => (
      row.standardWorkId === undefined
        ? `__ROW_${index}`
        : String(row.standardWorkId)
    ))
  ).size;
}

function quantileType7(sorted, probability) {
  if (sorted.length === 1) return sorted[0];
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower]
    + (sorted[upper] - sorted[lower]) * (index - lower);
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function stableTextCompare(left, right) {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}
