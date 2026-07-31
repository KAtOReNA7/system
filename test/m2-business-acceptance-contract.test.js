import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  assignM2BusinessAcceptanceCashBands,
  compareM2BusinessAcceptanceAggregate,
  summarizeM2BusinessAcceptanceBaselineRows,
  validateM2BusinessAcceptanceContract
} from "../src/domain/m2Current/businessAcceptanceContract.js";

const contract = JSON.parse(readFileSync(
  new URL(
    "../config/m2-business-acceptance-contract.v1.json",
    import.meta.url
  ),
  "utf8"
));

const report = readFileSync(
  new URL(
    "../docs/analysis/m2-current/M2-business-acceptance-contract-v1.md",
    import.meta.url
  ),
  "utf8"
);

test("M2 business acceptance v1 freezes scope, caps and roles", () => {
  assert.equal(validateM2BusinessAcceptanceContract(contract), true);
  assert.equal(
    contract.status,
    "M2_BUSINESS_ACCEPTANCE_CONTRACT_V1_ACTIVE_FOR_DEVELOPMENT_ONLY"
  );
  assert.deepEqual(
    contract.businessUsability.horizons.map((row) => [
      row.horizonMonths,
      row.maximumWape,
      row.maximumAbsoluteSignedBias
    ]),
    [
      [3, 0.30, 0.10],
      [6, 0.32, 0.10],
      [12, 0.35, 0.12],
      [36, 0.40, 0.12]
    ]
  );
  assert.equal(contract.populations.primary.role, "HARD_GATE");
  assert.equal(
    contract.populations.sensitivity.role,
    "DISCLOSED_SENSITIVITY_NOT_A_VETO"
  );
  assert.equal(
    contract.h36Evidence.historicalEvidenceCaveat,
    "HISTORICAL_MULTI_ORIGIN_NOT_PROSPECTIVE_VALIDATION"
  );
  assert.equal(
    contract.businessUsability.horizons[3].status,
    "ACTIVE_FOR_DEVELOPMENT_EVALUATION_ONLY_WITH_HISTORICAL_NON_PROSPECTIVE_CAVEAT"
  );
  assert.equal(
    contract.h36Evidence.reproductionStatus,
    "EXACT_AGGREGATE_REPRODUCED_WITHIN_FIXED_TOLERANCE"
  );
  assert.equal(contract.h36Evidence.h36Activated, true);
  assert.equal(
    contract.h36Evidence.h50M30L20ExactlyMeasurable,
    true
  );
  assert.equal(contract.h60.currentM2Gate, false);
});

test("work-total and work-channel gates are independently queryable", () => {
  const { workTotalGate, workChannelGate } = contract.grainGates;
  assert.equal(
    contract.grainGates.contractStatusDoesNotCollapseGrains,
    true
  );
  assert.deepEqual(
    [workTotalGate.grain, workTotalGate.status],
    ["WORK_TOTAL", "ACTIVE_FOR_DEVELOPMENT_EVALUATION_ONLY"]
  );
  assert.deepEqual(workTotalGate.horizonMonths, [3, 6, 12, 36]);
  assert.equal(
    workTotalGate.h36HistoricalEvidenceCaveat,
    contract.h36Evidence.historicalEvidenceCaveat
  );
  assert.equal(workTotalGate.workChannelCompletenessRequired, false);
  assert.deepEqual(
    [workChannelGate.grain, workChannelGate.status],
    ["WORK_CHANNEL", "PARTIAL_NOT_ACTIVE"]
  );
  assert.equal(
    workChannelGate.reason,
    "MISSING_ELIGIBLE_CHANNEL_COMPONENTS"
  );
  assert.equal(workChannelGate.completeH36ValidationClaimAllowed, false);
  assert.equal(workChannelGate.workTotalBaselineAffected, false);
});

test("work-channel gap counts are anchored to frozen machine evidence", () => {
  const reconstruction = contract.h36Evidence.firstLegalReconstruction;
  const channelGate = contract.grainGates.workChannelGate;
  assert.equal(reconstruction.partialChannelDecompositionCaseCount, 633);
  assert.equal(reconstruction.missingEligibleChannelComponentCount, 914);
  assert.equal(
    channelGate.missingCaseCount,
    reconstruction.partialChannelDecompositionCaseCount
  );
  assert.equal(
    channelGate.missingComponentCount,
    reconstruction.missingEligibleChannelComponentCount
  );
  assert.equal(
    channelGate.missingCaseCountAuthorityPath,
    "h36Evidence.firstLegalReconstruction.partialChannelDecompositionCaseCount"
  );
  assert.equal(
    channelGate.missingComponentCountAuthorityPath,
    "h36Evidence.firstLegalReconstruction.missingEligibleChannelComponentCount"
  );
});

test("public contract report does not claim complete channel validation", () => {
  assert.match(report, /作品总额门禁（`WORK_TOTAL`）/u);
  assert.match(report, /作品×渠道门禁（`WORK_CHANNEL`）/u);
  assert.match(report, /`PARTIAL_NOT_ACTIVE`/u);
  assert.match(report, /633 个 case[^\n]*914 个 eligible-channel 组件/u);
  assert.match(report, /不得解释为[^\n]*作品×渠道[^\n]*完整验证/u);
});

test("candidate superiority is an AND rule with head protection", () => {
  assert.equal(contract.candidateSuperiority.combinationRule, "AND");
  assert.equal(contract.candidateSuperiority.requirements.length, 9);
  assert.ok(contract.candidateSuperiority.requirements.includes(
    "CORE80_H50_ABSOLUTE_ERROR_NOT_WORSE_THAN_HEALTHY_BASELINE"
  ));
  assert.ok(contract.candidateSuperiority.requirements.includes(
    "L20_IMPROVEMENT_CANNOT_MASK_H50_LOSS"
  ));
  assert.equal(
    contract.candidateSuperiority.materiality
      .minimumPairedAbsoluteErrorReductionOverPairedActual,
    0.01
  );
  assert.equal(
    contract.candidateSuperiority.bootstrap.iterations,
    2000
  );
  assert.equal(
    contract.candidateSuperiority.relativeFvaRole,
    "DIAGNOSTIC_ONLY"
  );
});

test("overlapping origins do not manufacture independent evidence", () => {
  assert.equal(contract.timeEvidence.overlappingOriginsIndependent, false);
  assert.equal(contract.timeEvidence.minimumNonOverlappingWindows, 2);
  assert.equal(
    contract.timeEvidence.minimumActualCashWeightedPassingShare,
    2 / 3
  );
  assert.equal(
    contract.timeEvidence.insufficientStatus,
    "INDEPENDENT_TIME_EVIDENCE_INSUFFICIENT"
  );
});

test("origin-visible Core80 cash bands retain boundary works higher", () => {
  const rows = [
    syntheticRow("WORK-A", 50),
    syntheticRow("WORK-B", 30),
    syntheticRow("WORK-C", 20)
  ];
  const banded = assignM2BusinessAcceptanceCashBands(rows, contract);
  assert.deepEqual(
    banded.map((row) => [row.standardWorkId, row.cashBandId]),
    [
      ["WORK-A", "H50"],
      ["WORK-B", "M30"],
      ["WORK-C", "L20"]
    ]
  );
  assert.ok(banded.every((row) => row.originVisibleOnly));
  assert.equal(contract.cashBands.futureActualUsed, false);
  assert.equal(contract.cashBands.core90DefinesSeparateBands, false);
});

test("baseline aggregation exposes RMB, bias and Top10 concentration", () => {
  const rows = [
    syntheticRow("WORK-A", 50, 80, 100),
    syntheticRow("WORK-B", 30, 90, 100),
    syntheticRow("WORK-C", 20, 120, 100)
  ];
  const summary = summarizeM2BusinessAcceptanceBaselineRows(rows);
  assert.equal(summary.actualAbsoluteTotalRmb, 300);
  assert.equal(summary.absoluteErrorTotalRmb, 50);
  assert.equal(summary.signedErrorTotalRmb, -10);
  assert.equal(summary.wape, 1 / 6);
  assert.equal(summary.signedBias, -1 / 30);
  assert.equal(summary.errorConcentration.top10WorkShare, 1);
  assert.equal(summary.numericStability.nonfinitePredictionCount, 0);
  assert.equal(summary.numericStability.negativePredictionCount, 0);
});

test("aggregate reconciliation uses fixed absolute and relative tolerance", () => {
  const actual = summarizeM2BusinessAcceptanceBaselineRows([
    syntheticRow("WORK-A", 50, 100, 100),
    syntheticRow("WORK-B", 30, 80, 100)
  ]);
  const result = compareM2BusinessAcceptanceAggregate({
    actual,
    expected: structuredClone(actual),
    tolerance: {
      absolute: 1e-7,
      relative: 1e-9
    }
  });
  assert.equal(result.matched, true);
  assert.equal(
    result.status,
    "EXACT_AGGREGATE_REPRODUCED_WITHIN_FIXED_TOLERANCE"
  );
});

test("cache recovery and language boundaries are explicit", () => {
  assert.equal(contract.privateEvidence.sourceAuthorityMissingBlocks, true);
  assert.equal(contract.privateEvidence.derivedCacheMissingBlocks, false);
  assert.equal(
    contract.privateEvidence.historicalProvenanceMissingBlocks,
    false
  );
  assert.equal(
    contract.candidateSuperiority.rmbReductionCanonicalNameEn,
    "aggregated forecast-decision error reduction"
  );
  assert.ok(
    contract.candidateSuperiority.rmbReductionForbiddenInterpretations
      .includes("company_actual_savings")
  );
  assert.equal(contract.authorization.training, false);
  assert.equal(contract.authorization.fitting, false);
  assert.equal(contract.authorization.newCandidateExecution, false);
  assert.equal(
    contract.h36Evidence.firstLegalReconstruction
      .scientificResultFrozen,
    true
  );
  assert.equal(
    contract.h36Evidence.firstLegalReconstruction.retryAllowed,
    false
  );
  assert.equal(
    contract.h36Evidence.firstLegalReconstruction.modelTrainingCount,
    0
  );
  assert.equal(
    contract.h36Evidence.firstLegalReconstruction
      .hpsr02IndependentEvaluationCount,
    0
  );
  assert.equal(
    contract.h36Evidence.firstLegalReconstruction.laterOriginRead,
    false
  );
  assert.equal(
    contract.h36Evidence.firstLegalReconstruction.finalHoldoutRead,
    false
  );
  assert.equal(
    contract.h36Evidence.firstLegalReconstruction
      .workTotalEvidenceStatus,
    "COMPLETE_EXACT_FROZEN_PRIMARY_LG01_ROWS"
  );
  assert.equal(
    contract.h36Evidence.firstLegalReconstruction
      .workChannelEvidenceStatus,
    "PARTIAL_DISCLOSED_NOT_USED_TO_DEFINE_WORK_TOTAL_BASELINE"
  );
  assert.equal(
    contract.h36Evidence.core80BusinessUsability.wapePass,
    true
  );
  assert.equal(
    contract.h36Evidence.core80BusinessUsability
      .absoluteSignedBiasPass,
    true
  );
  assert.equal(
    contract.h36Evidence.cashBandEvidence.status,
    "EXACTLY_MEASURABLE_FROM_PRIVATE_SAME_CASE_ROWS"
  );
  assert.equal(
    hasObjectKey(contract, "standardWorkId"),
    false
  );
});

function syntheticRow(
  standardWorkId,
  trailing12Cash,
  pointEstimate = 100,
  actual = 100
) {
  return {
    populationId: "CORE80",
    grain: "WORK_TOTAL",
    horizonMonths: 36,
    origin: "2022-01",
    standardWorkId,
    trailing12Cash,
    originVisibleOnly: true,
    pointEstimate,
    actual
  };
}

function hasObjectKey(value, targetKey) {
  if (Array.isArray(value)) {
    return value.some((item) => hasObjectKey(item, targetKey));
  }
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) => (
    key === targetKey || hasObjectKey(child, targetKey)
  ));
}
