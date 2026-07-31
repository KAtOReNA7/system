import {
  scoreCoreLegacyPointRows
} from "./coreLegacyPopulation.js";
import {
  assignLg01HeadCashBands
} from "./lg01HeadCashResidual.js";

export const M2_BUSINESS_ACCEPTANCE_CONTRACT_SCHEMA =
  "m2.business_acceptance_contract.v1";
export const M2_BUSINESS_ACCEPTANCE_ACTIVE_STATUS =
  "M2_BUSINESS_ACCEPTANCE_CONTRACT_V1_ACTIVE_FOR_DEVELOPMENT_ONLY";

const REQUIRED_HORIZONS = Object.freeze([
  Object.freeze({
    horizonMonths: 3,
    maximumWape: 0.30,
    maximumAbsoluteSignedBias: 0.10
  }),
  Object.freeze({
    horizonMonths: 6,
    maximumWape: 0.32,
    maximumAbsoluteSignedBias: 0.10
  }),
  Object.freeze({
    horizonMonths: 12,
    maximumWape: 0.35,
    maximumAbsoluteSignedBias: 0.12
  }),
  Object.freeze({
    horizonMonths: 36,
    maximumWape: 0.40,
    maximumAbsoluteSignedBias: 0.12
  })
]);

const REQUIRED_SUPERIORITY_RULES = Object.freeze([
  "PAIRED_ABSOLUTE_ERROR_REDUCTION_OVER_PAIRED_ACTUAL_AT_LEAST_ONE_PERCENT",
  "WHOLE_WORK_CLUSTER_BOOTSTRAP_2000_LOWER_BOUND_ABOVE_ZERO",
  "ABSOLUTE_SIGNED_BIAS_WITHIN_HORIZON_CAP",
  "CORE80_H50_ABSOLUTE_ERROR_NOT_WORSE_THAN_HEALTHY_BASELINE",
  "MAXIMUM_WORK_ERROR_SHARE_NOT_WORSE",
  "TOP10_WORK_ERROR_SHARE_NOT_WORSE",
  "L20_IMPROVEMENT_CANNOT_MASK_H50_LOSS",
  "PER_ORIGIN_ABSOLUTE_ERROR_REDUCTION_MEDIAN_ABOVE_ZERO",
  "NON_OVERLAPPING_TIME_EVIDENCE_REQUIREMENTS_MET"
]);

export function validateM2BusinessAcceptanceContract(contract) {
  const failures = [];
  if (contract?.schema !== M2_BUSINESS_ACCEPTANCE_CONTRACT_SCHEMA) {
    failures.push("schema");
  }
  if (
    contract?.scope?.actualDefinitionId
      !== "M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01"
    || contract?.scope?.target
      !== "future_sales_share_development_modelable_cash"
  ) {
    failures.push("target");
  }
  if (
    contract?.populations?.primary?.populationId !== "CORE80"
    || contract?.populations?.primary?.role !== "HARD_GATE"
    || contract?.populations?.sensitivity?.populationId !== "CORE90"
    || contract?.populations?.sensitivity?.role
      !== "DISCLOSED_SENSITIVITY_NOT_A_VETO"
  ) {
    failures.push("population_roles");
  }
  if (
    JSON.stringify(contract?.businessUsability?.horizons)
      !== JSON.stringify(REQUIRED_HORIZONS.map((expected) => ({
        ...expected,
        status: expected.horizonMonths === 36
          ? contract?.businessUsability?.horizons?.find(
            (row) => row.horizonMonths === 36
          )?.status
          : "ACTIVE_FOR_DEVELOPMENT_EVALUATION_ONLY"
      })))
  ) {
    failures.push("horizon_caps");
  }
  const h36 = contract?.businessUsability?.horizons?.find(
    (row) => row.horizonMonths === 36
  );
  if (
    ![
      "ACTIVE_FOR_DEVELOPMENT_EVALUATION_ONLY_WITH_HISTORICAL_NON_PROSPECTIVE_CAVEAT",
      "PROVISIONAL_NOT_ACTIVE"
    ].includes(h36?.status)
  ) {
    failures.push("h36_status");
  }
  if (
    contract?.candidateSuperiority?.combinationRule !== "AND"
    || JSON.stringify(contract?.candidateSuperiority?.requirements)
      !== JSON.stringify(REQUIRED_SUPERIORITY_RULES)
    || contract?.candidateSuperiority?.bootstrap?.iterations !== 2000
    || contract?.candidateSuperiority?.bootstrap
      ?.improvementIntervalLowerBoundExclusive !== 0
    || contract?.candidateSuperiority?.materiality
      ?.minimumPairedAbsoluteErrorReductionOverPairedActual !== 0.01
    || contract?.candidateSuperiority?.relativeFvaRole
      !== "DIAGNOSTIC_ONLY"
  ) {
    failures.push("candidate_superiority_and_rule");
  }
  if (
    contract?.timeEvidence?.overlappingOriginsIndependent !== false
    || contract?.timeEvidence?.minimumNonOverlappingWindows !== 2
    || contract?.timeEvidence
      ?.minimumActualCashWeightedPassingShare !== 2 / 3
    || contract?.timeEvidence
      ?.perOriginAbsoluteErrorReductionMedianMustBeAboveZero !== true
    || contract?.timeEvidence?.insufficientStatus
      !== "INDEPENDENT_TIME_EVIDENCE_INSUFFICIENT"
  ) {
    failures.push("time_evidence");
  }
  if (
    contract?.cashBands?.populationId !== "CORE80"
    || contract?.cashBands?.rankingCash
      !== "origin_visible_trailing_12_sales_share_cash"
    || contract?.cashBands?.futureActualUsed !== false
    || contract?.cashBands?.boundaryWorkPolicy
      !== "WHOLE_WORK_STAYS_IN_HIGHER_CASH_BAND"
    || contract?.cashBands?.core90DefinesSeparateBands !== false
    || JSON.stringify(contract?.cashBands?.bands) !== JSON.stringify([
      {
        bandId: "H50",
        cumulativeCashUpperInclusive: 0.5
      },
      {
        bandId: "M30",
        cumulativeCashUpperInclusive: 0.8
      },
      {
        bandId: "L20",
        cumulativeCashUpperInclusive: 1
      }
    ])
  ) {
    failures.push("cash_bands");
  }
  if (
    contract?.h36Evidence?.baselineModel?.modelId !== "M2-WORK-LG01"
    || contract?.h36Evidence?.baselineModel?.role
      !== "HEALTHY_FROZEN_SAME_CASE_BASELINE"
    || contract?.h36Evidence?.historicalEvidenceCaveat
      !== "HISTORICAL_MULTI_ORIGIN_NOT_PROSPECTIVE_VALIDATION"
    || contract?.h60?.role
      !== "M3_ONLY_LOW_CONFIDENCE_MATURE_CATALOG_SCENARIO_REFERENCE"
    || contract?.h60?.currentM2Gate !== false
  ) {
    failures.push("h36_h60_roles");
  }
  if (
    contract?.privateEvidence?.sourceAuthorityMissingBlocks !== true
    || contract?.privateEvidence?.derivedCacheMissingBlocks !== false
    || contract?.privateEvidence?.historicalProvenanceMissingBlocks
      !== false
    || contract?.privateEvidence?.derivedCacheClass
      !== "PRIVATE_DERIVED_CACHE"
    || contract?.privateEvidence?.historicalProvenanceClass
      !== "PRIVATE_RUN_PROVENANCE"
  ) {
    failures.push("private_artifact_policy");
  }
  if (
    contract?.authorization?.developmentEvaluationOnly !== true
    || contract?.authorization?.training !== false
    || contract?.authorization?.fitting !== false
    || contract?.authorization?.tuning !== false
    || contract?.authorization?.modelSelection !== false
    || contract?.authorization?.production !== false
    || contract?.authorization?.automation !== false
    || contract?.authorization?.release !== false
    || contract?.authorization?.laterOrigin !== false
    || contract?.authorization?.finalHoldout !== false
  ) {
    failures.push("authorization");
  }
  if (failures.length > 0) {
    throw new Error(
      `m2_business_acceptance_contract_invalid:${failures.join(",")}`
    );
  }
  return true;
}

export function assignM2BusinessAcceptanceCashBands(rows, contract) {
  validateM2BusinessAcceptanceContract(contract);
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("m2_business_acceptance_core80_rows_required");
  }
  if (rows.some((row) => (
    row.populationId !== "CORE80"
    || row.grain !== "WORK_TOTAL"
    || row.horizonMonths !== 36
    || row.originVisibleOnly !== true
    || !Number.isFinite(Number(row.trailing12Cash))
  ))) {
    throw new Error(
      "m2_business_acceptance_cash_band_input_contract_invalid"
    );
  }
  const assignments = [];
  const origins = [...new Set(rows.map((row) => row.origin))].sort();
  for (const origin of origins) {
    const originRows = rows.filter((row) => row.origin === origin);
    assignments.push(...assignLg01HeadCashBands(originRows, {
      cashBands: {
        nonpositiveOriginCashPolicy:
          contract.cashBands.nonpositiveOriginCashPolicy
      }
    }));
  }
  const bandByCase = new Map(assignments.map((row) => [
    `${row.origin}\u0000${row.standardWorkId}`,
    row
  ]));
  return Object.freeze(rows.map((row) => {
    const assignment = bandByCase.get(
      `${row.origin}\u0000${row.standardWorkId}`
    );
    if (!assignment) {
      throw new Error(
        "m2_business_acceptance_cash_band_assignment_missing"
      );
    }
    return Object.freeze({
      ...row,
      cashBandId: assignment.bandId,
      cashBandRankingValue: assignment.rankingValue,
      cashBandCumulativeCashBefore:
        assignment.cumulativeCashBefore,
      cashBandCumulativeCashAfter:
        assignment.cumulativeCashAfter,
      cashBandCumulativeCashShareAfter:
        assignment.cumulativeCashShareAfter,
      cashBandStatus: assignment.status
    });
  }));
}

export function summarizeM2BusinessAcceptanceBaselineRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("m2_business_acceptance_baseline_rows_required");
  }
  const invalid = rows.filter((row) => (
    !Number.isFinite(Number(row.actual))
    || !Number.isFinite(Number(row.pointEstimate))
  ));
  if (invalid.length > 0) {
    throw new Error(
      "m2_business_acceptance_nonfinite_baseline_row"
    );
  }
  const scored = scoreCoreLegacyPointRows(rows);
  const actualAbsoluteTotal = sum(rows.map(
    (row) => Math.abs(Number(row.actual))
  ));
  const signedErrorTotal = sum(rows.map(
    (row) => Number(row.pointEstimate) - Number(row.actual)
  ));
  const origins = [...new Set(rows.map((row) => row.origin))].sort();
  const perOrigin = origins.map((origin) => {
    const values = rows.filter((row) => row.origin === origin);
    return {
      origin,
      ...scoreCoreLegacyPointRows(values),
      errorConcentration: errorConcentration(values)
    };
  });
  return Object.freeze({
    originCount: origins.length,
    caseCount: scored.caseCount,
    workCount: scored.workCount,
    actualTotalRmb: scored.actualTotal,
    actualAbsoluteTotalRmb: actualAbsoluteTotal,
    predictionTotalRmb: scored.predictionTotal,
    absoluteErrorTotalRmb: scored.absoluteErrorTotal,
    signedErrorTotalRmb: signedErrorTotal,
    wape: scored.wape,
    signedBias: scored.signedBias,
    mae: scored.mae,
    medianAbsoluteError: scored.medianAbsoluteError,
    errorConcentration: errorConcentration(rows),
    perOriginWapeP10P50P90: quantileTriple(
      perOrigin.map((row) => row.wape)
    ),
    perOriginSignedBiasP10P50P90: quantileTriple(
      perOrigin.map((row) => row.signedBias)
    ),
    numericStability: Object.freeze({
      nonfinitePredictionCount: 0,
      negativePredictionCount: rows.filter(
        (row) => Number(row.pointEstimate) < 0
      ).length
    }),
    perOrigin: Object.freeze(perOrigin)
  });
}

export function summarizeM2BusinessAcceptanceCashBands(rows) {
  const output = {};
  for (const bandId of ["H50", "M30", "L20"]) {
    const bandRows = rows.filter((row) => row.cashBandId === bandId);
    if (bandRows.length === 0) {
      throw new Error(
        `m2_business_acceptance_cash_band_empty:${bandId}`
      );
    }
    output[bandId] = summarizeM2BusinessAcceptanceBaselineRows(
      bandRows
    );
  }
  return Object.freeze(output);
}

export function compareM2BusinessAcceptanceAggregate({
  actual,
  expected,
  tolerance
}) {
  const fields = [
    "originCount",
    "caseCount",
    "workCount",
    "actualAbsoluteTotalRmb",
    "absoluteErrorTotalRmb",
    "signedErrorTotalRmb",
    "wape",
    "signedBias",
    "mae",
    "medianAbsoluteError",
    "errorConcentration.maximumWorkShare",
    "errorConcentration.top5WorkShare",
    "errorConcentration.top10WorkShare",
    "perOriginWapeP10P50P90.p10",
    "perOriginWapeP10P50P90.p50",
    "perOriginWapeP10P50P90.p90",
    "perOriginSignedBiasP10P50P90.p10",
    "perOriginSignedBiasP10P50P90.p50",
    "perOriginSignedBiasP10P50P90.p90"
  ];
  const mismatches = [];
  for (const field of fields) {
    const actualValue = nestedValue(actual, field);
    const expectedValue = nestedValue(expected, field);
    if (
      ["originCount", "caseCount", "workCount"].includes(field)
      ? actualValue !== expectedValue
      : !withinTolerance(
        actualValue,
        expectedValue,
        tolerance
      )
    ) {
      mismatches.push(Object.freeze({
        field,
        actual: actualValue,
        expected: expectedValue,
        absoluteDifference: (
          Number.isFinite(actualValue)
          && Number.isFinite(expectedValue)
        )
          ? Math.abs(actualValue - expectedValue)
          : null
      }));
    }
  }
  return Object.freeze({
    status: mismatches.length === 0
      ? "EXACT_AGGREGATE_REPRODUCED_WITHIN_FIXED_TOLERANCE"
      : "AGGREGATE_REPRODUCTION_MISMATCH",
    matched: mismatches.length === 0,
    mismatches: Object.freeze(mismatches)
  });
}

function errorConcentration(rows) {
  const byWork = new Map();
  for (const row of rows) {
    const error = Math.abs(
      Number(row.pointEstimate) - Number(row.actual)
    );
    byWork.set(
      String(row.standardWorkId),
      (byWork.get(String(row.standardWorkId)) ?? 0) + error
    );
  }
  const errors = [...byWork.values()].sort((left, right) => (
    right - left
  ));
  const total = sum(errors);
  return Object.freeze({
    maximumWorkShare: total > 0 ? (errors[0] ?? 0) / total : null,
    top5WorkShare: total > 0 ? sum(errors.slice(0, 5)) / total : null,
    top10WorkShare: total > 0
      ? sum(errors.slice(0, 10)) / total
      : null
  });
}

function quantileTriple(values) {
  const sorted = values.filter(Number.isFinite).sort(
    (left, right) => left - right
  );
  return Object.freeze({
    p10: quantileLinear(sorted, 0.10),
    p50: quantileLinear(sorted, 0.50),
    p90: quantileLinear(sorted, 0.90)
  });
}

function quantileLinear(sorted, probability) {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function nestedValue(value, path) {
  return path.split(".").reduce(
    (current, key) => current?.[key],
    value
  );
}

function withinTolerance(actual, expected, tolerance) {
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) {
    return false;
  }
  const absolute = Number(tolerance?.absolute);
  const relative = Number(tolerance?.relative);
  if (
    !Number.isFinite(absolute)
    || absolute < 0
    || !Number.isFinite(relative)
    || relative < 0
  ) {
    throw new Error(
      "m2_business_acceptance_aggregate_tolerance_invalid"
    );
  }
  return Math.abs(actual - expected) <= Math.max(
    absolute,
    relative * Math.max(1, Math.abs(expected))
  );
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value), 0);
}
