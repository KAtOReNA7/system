import {
  scoreM2CurrentEvaluationRows,
  scoreM2CurrentProbabilisticRows
} from "./metrics.js";

export function evaluateM2CurrentAutomationPolicy({
  rows,
  comparators,
  policy,
  stableImprovement
}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("m2_current_automation_rows_required");
  }
  const scored = rows.map((row) => ({
    ...row,
    automationRiskScore: riskScore(row)
  })).sort((a, b) => (
    a.automationRiskScore - b.automationRiskScore
    || caseKey(a).localeCompare(caseKey(b))
  ));
  const riskCoverage = policy.coverageLevels.map((coverage) => {
    const count = Math.max(1, Math.floor(scored.length * Number(coverage)));
    const selected = scored.slice(0, count);
    const point = scoreM2CurrentEvaluationRows(selected);
    const probability = scoreM2CurrentProbabilisticRows(
      selected,
      policy.quantileProbabilities
    );
    return {
      requestedCaseCoverage: Number(coverage),
      servedCaseCount: selected.length,
      servedCaseCoverage: selected.length / scored.length,
      servedActualCashCoverage: actualCashCoverage(selected, scored),
      wape: point.wape,
      signedBias: point.signedBias,
      wis: probability.wis,
      central80Coverage:
        probability.intervalCoverage.central_80?.observed ?? null,
      businessLoss: businessLoss(selected, policy.businessLoss)
    };
  });
  const overallPoint = scoreM2CurrentEvaluationRows(scored);
  const overallProbability = scoreM2CurrentProbabilisticRows(
    scored,
    policy.quantileProbabilities
  );
  const modelLoss = businessLoss(scored, policy.businessLoss);
  const fva = Object.fromEntries(Object.entries(comparators).map(
    ([name, comparatorRows]) => {
      const comparatorByKey = new Map(
        comparatorRows.map((row) => [caseKey(row), row])
      );
      if (
        comparatorByKey.size !== scored.length
        || scored.some((row) => !comparatorByKey.has(caseKey(row)))
      ) {
        throw new Error("m2_current_fva_comparator_case_parity_failed");
      }
      const aligned = scored.map((row) => ({
        ...row,
        pointEstimate: comparatorByKey.get(caseKey(row)).pointEstimate
      }));
      const comparatorLoss = businessLoss(aligned, policy.businessLoss);
      const comparatorWape = scoreM2CurrentEvaluationRows(aligned).wape;
      return [name, {
        businessLoss: comparatorLoss,
        businessLossFva: comparatorLoss === 0
          ? null
          : (comparatorLoss - modelLoss) / comparatorLoss,
        wape: comparatorWape,
        wapeFva: (comparatorWape - overallPoint.wape) / comparatorWape
      }];
    }
  ));
  const segmentWapes = Object.fromEntries(
    [...new Set(scored.map((row) => row.segment))].sort()
      .map((segment) => [
        segment,
        scoreM2CurrentEvaluationRows(
          scored.filter((row) => row.segment === segment)
        ).wape
      ])
  );
  const central80Error = overallProbability.intervalCoverage.central_80
    ?.absoluteCalibrationError ?? Infinity;
  const gates = {
    absoluteWapePassed:
      overallPoint.wape <= Number(policy.maximumAutomationWape),
    eachSegmentWapePassed: Object.values(segmentWapes).every(
      (value) => value <= Number(policy.maximumSegmentWape)
    ),
    central80CalibrationPassed:
      central80Error <= Number(policy.maximumCentral80CalibrationError),
    stableImprovementPassed: stableImprovement === true,
    fullCaseCoverageEvaluated: riskCoverage.some(
      (row) => row.requestedCaseCoverage === 1
    )
  };
  return {
    schema: "m2.current.automation_policy_evaluation.v0.1",
    overall: {
      point: overallPoint,
      probabilistic: overallProbability,
      businessLoss: modelLoss,
      segmentWapes
    },
    riskCoverage,
    forecastValueAdded: fva,
    gates,
    automationAuthorized: Object.values(gates).every(Boolean),
    decision: Object.values(gates).every(Boolean)
      ? "TECHNICAL_AUTOMATION_GATE_PASS_RELEASE_STILL_SEPARATE"
      : "AUTOMATION_BLOCKED",
    humanRole: "post_gate_quality_assurance_only",
    releaseAuthorized: false
  };
}

function riskScore(row) {
  const quantiles = row.quantiles;
  if (quantiles === null || typeof quantiles !== "object") {
    throw new Error("m2_current_automation_quantiles_required");
  }
  const lower = Number(quantiles["0.05"] ?? quantiles["0.1"]);
  const upper = Number(quantiles["0.95"] ?? quantiles["0.9"]);
  const point = Math.max(0, Number(row.pointEstimate));
  const probability = clamp(Number(row.occurrenceProbability), 1e-6, 1 - 1e-6);
  const entropy = -probability * Math.log(probability)
    - (1 - probability) * Math.log(1 - probability);
  return Math.max(0, upper - lower) / (1 + point) + entropy;
}

function actualCashCoverage(selected, full) {
  const denominator = full.reduce(
    (sum, row) => sum + Math.max(0, Number(row.actual)),
    0
  );
  if (denominator === 0) {
    return null;
  }
  return selected.reduce(
    (sum, row) => sum + Math.max(0, Number(row.actual)),
    0
  ) / denominator;
}

function businessLoss(rows, policy) {
  const underWeight = Number(policy.underForecastWeight);
  const overWeight = Number(policy.overForecastWeight);
  const abstentionWeight = Number(policy.abstentionWeight);
  return rows.reduce((sum, row) => {
    if (row.pointEstimate === null || row.pointEstimate === undefined) {
      return sum + abstentionWeight * Math.abs(Number(row.actual));
    }
    const error = Number(row.pointEstimate) - Number(row.actual);
    return sum + (error < 0 ? underWeight * -error : overWeight * error);
  }, 0) / rows.length;
}

function caseKey(row) {
  return [
    row.standardWorkId,
    row.origin,
    row.horizonMonths,
    row.route
  ].join("|");
}

function clamp(value, minimum, maximum) {
  if (!Number.isFinite(value)) {
    throw new Error("m2_current_automation_probability_invalid");
  }
  return Math.max(minimum, Math.min(maximum, value));
}
