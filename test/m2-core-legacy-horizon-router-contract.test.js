import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildM2CoreLegacyCapabilityMatrix,
  buildM2CoreLegacyK0CapabilityReport,
  buildM2CoreLegacySameCaseEvaluation,
  capabilityCellKey,
  validateM2CoreLegacyHorizonRouterConfig
} from "../src/domain/m2Current/coreLegacyHorizonRouter.js";

const config = JSON.parse(readFileSync(
  "config/m2-current-core-legacy-horizon-router.v0.1.json",
  "utf8"
));

test("horizon-router K0 freezes scope, roles and decision thresholds", () => {
  assert.equal(validateM2CoreLegacyHorizonRouterConfig(config), true);
  assert.equal(
    config.experiment.stableExperimentId,
    "M2-EXP-CORE-LEGACY-HORIZON-ROUTER-01"
  );
  assert.equal(config.scope.minimumCompleteMonths, 3);
  assert.equal(config.scope.immaturePolicy, "ABSTAIN_NOT_ZERO");
  assert.deepEqual(config.scope.horizonsMonths, [3, 6, 12, 36]);
  assert.equal(config.sameCaseEvaluation.bootstrap.iterations, 2000);
  assert.equal(config.horizonRouter.minimumMatureSelectionOrigins, 3);
  assert.equal(config.horizonRouter.absoluteBiasExclusionThreshold, 0.1);
  assert.equal(config.horizonRouter.wapeTieThreshold, 0.01);
  assert.equal(config.channelAllocation.equalSplitAllowed, false);
  assert.equal(config.channelAllocation.futureRevenueAllowed, false);
  assert.equal(config.roles.operationalWorkFallback, "M2-WORK-OA03");
  assert.equal(config.roles.researchWorkBaseline, "M2-WORK-LG01");
  assert.equal(config.roles.activeCandidate, null);
  assert.equal(config.roles.approvedForAutomation, null);
});

test("capability matrix explicitly classifies all 48 cells", () => {
  const matrix = buildM2CoreLegacyCapabilityMatrix(config);
  assert.equal(matrix.length, 48);
  assert.equal(new Set(matrix.map((cell) => [
    cell.modelId,
    cell.evaluationFamily,
    cell.horizonMonths,
    cell.grain
  ].join("|"))).size, 48);
  assert.deepEqual(
    [...new Set(matrix.map((cell) => cell.status))].sort(),
    [
      "FROZEN_AVAILABLE",
      "NOT_RECONSTRUCTABLE",
      "UNSUPPORTED_BY_MODEL_CONTRACT"
    ]
  );
  assert.equal(
    findCell(matrix, "M2-WORK-OA03", "PRIMARY_ROLLING", 3, "WORK_TOTAL")
      .status,
    "FROZEN_AVAILABLE"
  );
  assert.equal(
    findCell(matrix, "M2-WORK-OA03", "STRICT_ROLLING", 3, "WORK_TOTAL")
      .status,
    "NOT_RECONSTRUCTABLE"
  );
  assert.equal(
    findCell(matrix, "M2-WORK-OA03", "PRIMARY_ROLLING", 36, "WORK_TOTAL")
      .status,
    "UNSUPPORTED_BY_MODEL_CONTRACT"
  );
  assert.equal(
    findCell(matrix, "M2-WORK-OA03", "PRIMARY_ROLLING", 3, "WORK_CHANNEL")
      .status,
    "UNSUPPORTED_BY_MODEL_CONTRACT"
  );
  assert.equal(
    findCell(matrix, "M2-WORK-LG01", "PRIMARY_ROLLING", 6, "WORK_TOTAL")
      .status,
    "NOT_RECONSTRUCTABLE"
  );
  assert.equal(
    findCell(matrix, "M2-WORK-LG01", "STRICT_ROLLING", 36, "WORK_CHANNEL")
      .status,
    "NOT_RECONSTRUCTABLE"
  );
  assert.equal(
    findCell(matrix, "M2-WORK-CRMR01", "PRIMARY_ROLLING", 36, "WORK_CHANNEL")
      .status,
    "FROZEN_AVAILABLE"
  );
  assert.equal(
    findCell(matrix, "M2-WORK-CRMR01", "STRICT_ROLLING", 36, "WORK_TOTAL")
      .status,
    "NOT_RECONSTRUCTABLE"
  );
  assert.equal(matrix.every(
    (cell) => cell.missingOutputImputedAsZero === false
  ), true);
});

test("frozen cache replay remains exact and forbids horizon copying", () => {
  const contract = config.deterministicReplayContract;
  assert.equal(contract.maximumNumericDifference, 0);
  assert.equal(contract.cacheAbsenceIsBlocking, false);
  assert.equal(contract.historicalReceiptAbsenceIsBlocking, false);
  assert.ok(contract.forbidden.includes("cross_horizon_parameter_copy"));
  assert.ok(contract.forbidden.includes(
    "row_level_prediction_inference_from_public_aggregate"
  ));
  const matrix = buildM2CoreLegacyCapabilityMatrix(config);
  assert.equal(
    findCell(matrix, "M2-WORK-LG01", "PRIMARY_ROLLING", 36, "WORK_TOTAL")
      .replayIfCacheMissing,
    "DETERMINISTIC_FROZEN_REPLAY_AVAILABLE"
  );
});

test("K0 report separates evaluation and final documentation heads", () => {
  const report = buildM2CoreLegacyK0CapabilityReport(config);
  assert.equal(
    report.status,
    "K0_CAPABILITY_MATRIX_AND_FROZEN_REPLAY_CONTRACT_COMPLETE"
  );
  assert.equal(report.heads.evaluationHead, null);
  assert.equal(report.heads.finalDocumentationHead, null);
  assert.notEqual(
    report.heads.evaluationHeadStatus,
    report.heads.finalDocumentationHeadStatus
  );
  assert.equal(report.boundaries.privateEvaluationPerformed, false);
  assert.equal(report.boundaries.modelTrainingPerformed, false);
  assert.equal(report.boundaries.crossHorizonParameterCopyPerformed, false);
});

test("capability cell key is stable and typed", () => {
  assert.equal(capabilityCellKey({
    evaluationFamily: "STRICT_ROLLING",
    horizonMonths: 12,
    grain: "WORK_CHANNEL"
  }), "STRICT_ROLLING|12|WORK_CHANNEL");
});

test("K1 same-case evaluation intersects cases before ranking", () => {
  const rows = [
    ...syntheticModelRows("M2-WORK-OA03", [100, 100, 100, 100]),
    ...syntheticModelRows("M2-WORK-CRMR01", [200, 200, 200, 200]),
    {
      ...syntheticModelRows("M2-WORK-CRMR01", [200])[0],
      standardWorkId: "EXTRA",
      caseKey: "EXTRA",
      pointEstimate: 0
    }
  ];
  const result = buildM2CoreLegacySameCaseEvaluation(rows, config, {
    evaluationHead: "synthetic-head",
    exactHeadCiRunId: 1
  });
  const cell = result.publicResult.comparisonSets.find((item) => (
    item.evaluationFamily === "PRIMARY_ROLLING"
    && item.populationId === "CORE80"
    && item.grain === "WORK_TOTAL"
    && item.horizonMonths === 3
  ));
  assert.equal(cell.caseCount, 4);
  assert.equal(cell.workCount, 4);
  assert.equal(cell.winnerDecision.status, "CLEAR_WINNER");
  assert.equal(cell.winnerDecision.winnerModelId, "M2-WORK-OA03");
  assert.equal(cell.pairedBootstrap.iterations, 2000);
  assert.equal(result.privateRows.length, 8);
  assert.equal(result.publicResult.boundaries.differentCaseIndependentWapeRanked, false);
  assert.doesNotMatch(
    JSON.stringify(result.publicResult),
    /"standardWorkId":|"channelUid":|"caseKey":|"W1"/u
  );
});

test("K1 marks material WAPE gains with worse bias as a tradeoff", () => {
  const candidate = syntheticModelRows(
    "M2-WORK-OA03",
    [120, 120, 120, 120]
  );
  const balanced = syntheticModelRows(
    "M2-WORK-CRMR01",
    [70, 130, 70, 130]
  );
  const result = buildM2CoreLegacySameCaseEvaluation(
    [...candidate, ...balanced],
    config
  );
  const cell = result.publicResult.comparisonSets.find((item) => (
    item.evaluationFamily === "PRIMARY_ROLLING"
    && item.populationId === "CORE80"
    && item.grain === "WORK_TOTAL"
    && item.horizonMonths === 3
  ));
  assert.equal(
    cell.winnerDecision.status,
    "WAPE_WIN_BIAS_TRADEOFF"
  );
  assert.equal(cell.winnerDecision.pointWapeLeaderModelId, "M2-WORK-OA03");
  assert.equal(cell.winnerDecision.absoluteBiasWorsening > 0.02, true);
});

test("K1 does not declare a winner below one percent improvement", () => {
  const result = buildM2CoreLegacySameCaseEvaluation([
    ...syntheticModelRows(
      "M2-WORK-OA03",
      [110, 110, 110, 110]
    ),
    ...syntheticModelRows(
      "M2-WORK-CRMR01",
      [110.05, 110.05, 110.05, 110.05]
    )
  ], config);
  const cell = result.publicResult.comparisonSets.find((item) => (
    item.evaluationFamily === "PRIMARY_ROLLING"
    && item.populationId === "CORE80"
    && item.grain === "WORK_TOTAL"
    && item.horizonMonths === 3
  ));
  assert.equal(cell.winnerDecision.status, "NO_STABLE_WINNER");
  assert.equal(cell.winnerDecision.winnerModelId, null);
});

function findCell(matrix, modelId, family, horizon, grain) {
  const cell = matrix.find((item) => (
    item.modelId === modelId
    && item.evaluationFamily === family
    && item.horizonMonths === horizon
    && item.grain === grain
  ));
  assert.ok(cell);
  return cell;
}

function syntheticModelRows(modelId, predictions) {
  const origins = ["2021-06", "2021-12", "2022-06", "2022-12"];
  return predictions.map((pointEstimate, index) => ({
    schema: "synthetic",
    modelId,
    evaluationFamily: "PRIMARY_ROLLING",
    populationId: "CORE80",
    grain: "WORK_TOTAL",
    standardWorkId: `W${index + 1}`,
    channelUid: null,
    origin: origins[index],
    horizonMonths: 3,
    pointEstimate,
    actual: 100,
    caseKey: `CASE_${index + 1}`,
    frozenSourceStatus: "SYNTHETIC"
  }));
}
