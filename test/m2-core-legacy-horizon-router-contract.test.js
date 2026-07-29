import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildM2CoreLegacyCapabilityMatrix,
  buildM2CoreLegacyK0CapabilityReport,
  buildM2CoreLegacyRollingHorizonRouter,
  buildM2CoreLegacySameCaseEvaluation,
  capabilityCellKey,
  selectM2CoreLegacyHorizonModel,
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

test("K2 early origins use only the frozen OA03 to LG01 fallback chain", () => {
  const oaAndManual = syntheticRouterOriginRows({
    origin: "2020-04",
    models: {
      "M2-WORK-OA03": [100],
      "M2-WORK-CRMR01": [100]
    }
  });
  const oaFallback = selectM2CoreLegacyHorizonModel({
    outerOrigin: "2020-04",
    horizonMonths: 3,
    currentRows: oaAndManual,
    historicalRows: [],
    config
  });
  assert.equal(oaFallback.selectedModelId, "M2-WORK-OA03");
  assert.equal(oaFallback.fallbackUsed, true);

  const lgAndManual = syntheticRouterOriginRows({
    origin: "2020-04",
    models: {
      "M2-WORK-LG01": [100],
      "M2-WORK-CRMR01": [100]
    }
  });
  const lgFallback = selectM2CoreLegacyHorizonModel({
    outerOrigin: "2020-04",
    horizonMonths: 3,
    currentRows: lgAndManual,
    historicalRows: [],
    config
  });
  assert.equal(lgFallback.selectedModelId, "M2-WORK-LG01");
  assert.equal(
    lgFallback.selectionReason,
    "OA03_UNSUPPORTED_FOR_CELL_LG01_FALLBACK"
  );

  const manualOnly = syntheticRouterOriginRows({
    origin: "2020-04",
    models: {"M2-WORK-CRMR01": [100]}
  });
  const abstain = selectM2CoreLegacyHorizonModel({
    outerOrigin: "2020-04",
    horizonMonths: 3,
    currentRows: manualOnly,
    historicalRows: [],
    config
  });
  assert.equal(abstain.selectedModelId, null);
  assert.equal(
    abstain.selectionReason,
    "NO_SUPPORTED_FROZEN_FALLBACK_ABSTAIN"
  );
});

test("K2 selection reads only fully matured prior pseudo-origins", () => {
  const history = ["2020-01", "2020-04", "2020-07"].flatMap(
    (origin) => syntheticRouterOriginRows({
      origin,
      models: {
        "M2-WORK-OA03": [130, 130],
        "M2-WORK-CRMR01": [105, 105]
      }
    })
  );
  const current = syntheticRouterOriginRows({
    origin: "2020-10",
    models: {
      "M2-WORK-OA03": [1, 1],
      "M2-WORK-CRMR01": [999, 999]
    },
    actual: 777777
  });
  const selected = selectM2CoreLegacyHorizonModel({
    outerOrigin: "2020-10",
    horizonMonths: 3,
    currentRows: current,
    historicalRows: [...history, ...current],
    config
  });
  assert.equal(selected.matureHistoricalOriginCount, 3);
  assert.equal(selected.selectedModelId, "M2-WORK-CRMR01");
  assert.equal(selected.fallbackUsed, false);
  assert.equal(selected.currentOuterActualReadForSelection, false);

  const poisonedCurrent = current.map((row) => ({
    ...row,
    actual: -999999999,
    pointEstimate: row.modelId === "M2-WORK-OA03" ? 0 : 1e12
  }));
  const poisoned = selectM2CoreLegacyHorizonModel({
    outerOrigin: "2020-10",
    horizonMonths: 3,
    currentRows: poisonedCurrent,
    historicalRows: [...history, ...poisonedCurrent],
    config
  });
  assert.equal(poisoned.selectedModelId, selected.selectedModelId);
  assert.deepEqual(
    poisoned.candidateHistoricalMetrics,
    selected.candidateHistoricalMetrics
  );
  const unreadableCurrent = current.map((row) => {
    const guarded = {...row};
    Object.defineProperty(guarded, "actual", {
      enumerable: true,
      get() {
        throw new Error("outer_actual_must_not_be_read");
      }
    });
    return guarded;
  });
  const guarded = selectM2CoreLegacyHorizonModel({
    outerOrigin: "2020-10",
    horizonMonths: 3,
    currentRows: unreadableCurrent,
    historicalRows: [...history, ...unreadableCurrent],
    config
  });
  assert.equal(guarded.selectedModelId, selected.selectedModelId);
});

test("K2 WAPE near-tie rule selects lower absolute bias", () => {
  const history = ["2020-01", "2020-04", "2020-07"].flatMap(
    (origin) => syntheticRouterOriginRows({
      origin,
      models: {
        "M2-WORK-OA03": [105, 105],
        "M2-WORK-CRMR01": [94.96, 105.04]
      }
    })
  );
  const current = syntheticRouterOriginRows({
    origin: "2020-10",
    models: {
      "M2-WORK-OA03": [100, 100],
      "M2-WORK-CRMR01": [100, 100]
    }
  });
  const selected = selectM2CoreLegacyHorizonModel({
    outerOrigin: "2020-10",
    horizonMonths: 3,
    currentRows: current,
    historicalRows: history,
    config
  });
  assert.equal(selected.selectedModelId, "M2-WORK-CRMR01");
  assert.equal(
    selected.selectionReason,
    "WAPE_WITHIN_ONE_PERCENT_LOWER_ABSOLUTE_BIAS_SELECTED"
  );
});

test("K2 preserves raw routing, comparator evidence and public privacy", () => {
  const rows = ["2020-01", "2020-04", "2020-07", "2020-10"].flatMap(
    (origin, index) => syntheticRouterOriginRows({
      origin,
      models: {
        "M2-WORK-OA03": index < 3 ? [130, 130] : [120, 120],
        "M2-WORK-CRMR01": [105, 105]
      }
    })
  );
  const result = buildM2CoreLegacyRollingHorizonRouter(
    rows,
    config,
    {
      evaluationHead: "synthetic-evaluation-head",
      routerExecutionHead: "synthetic-router-head",
      exactHeadCiRunId: 1
    }
  );
  const cell = result.publicResult.evaluationSets.find((row) => (
    row.evaluationFamily === "PRIMARY_ROLLING"
    && row.populationId === "CORE80"
    && row.horizonMonths === 3
  ));
  assert.equal(cell.selectionSummary.fallbackSelectionCount, 3);
  assert.equal(
    cell.selectionSummary.bySelectedModelId["M2-WORK-OA03"],
    3
  );
  assert.equal(
    cell.selectionSummary.bySelectedModelId["M2-WORK-CRMR01"],
    1
  );
  assert.equal(cell.currentFallbackComparison.status, "COMPUTED_SAME_CASE_INTERSECTION");
  assert.equal(cell.posthocReferenceComparison.status, "COMPUTED_SAME_CASE_INTERSECTION");
  assert.equal(result.selectionRows.length, 4);
  assert.equal(result.predictionRows.length, 8);
  assert.equal(
    result.publicResult.boundaries.currentOuterActualReadForSelection,
    false
  );
  assert.doesNotMatch(
    JSON.stringify(result.publicResult),
    /"standardWorkId":|"channelUid":|"caseKey":|"outerOrigin":/u
  );
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

function syntheticRouterOriginRows({
  origin,
  models,
  actual = 100
}) {
  return Object.entries(models).flatMap(([modelId, predictions]) => (
    predictions.map((pointEstimate, index) => ({
      schema: "synthetic",
      modelId,
      evaluationFamily: "PRIMARY_ROLLING",
      populationId: "CORE80",
      grain: "WORK_TOTAL",
      standardWorkId: `ROUTER_WORK_${index + 1}`,
      channelUid: null,
      origin,
      horizonMonths: 3,
      pointEstimate,
      actual,
      caseKey: `${origin}|ROUTER_CASE_${index + 1}`,
      frozenSourceStatus: "SYNTHETIC"
    }))
  ));
}
