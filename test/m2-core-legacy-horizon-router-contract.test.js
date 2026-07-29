import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildM2CoreLegacyCapabilityMatrix,
  buildM2CoreLegacyK0CapabilityReport,
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
