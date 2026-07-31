import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  HPSR_ARM_IDS,
  HPSR_EXPERIMENT_ID,
  HPSR_MODEL_ID,
  HPSR_WAITING_STATUS,
  forecastWindowsOverlap,
  planHpsrLaterOrigins,
  validateHeadProtectedSegmentedRouterContract,
  validateHpsrLaterOriginAvailability,
  validateHpsrSelectionAttribution
} from "../src/domain/m2Current/headProtectedSegmentedRouter.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = await readJson(
  "config/m2-current-head-protected-segmented-router.v0.1.json"
);
const attribution = await readJson(
  config.publicOutputs.selectionAttributionJson
);
const availability = await readJson(config.publicOutputs.availabilityJson);
const availabilityReport = await readText(
  config.publicOutputs.availabilityReport
);
const preregistration = await readText(config.publicOutputs.preregistration);

test("K0B freezes identities and stops K1/K2 while no origin exists", () => {
  const result = validateHeadProtectedSegmentedRouterContract(config);
  assert.equal(result.valid, true, result.errors.join("\n"));
  assert.equal(config.model.stableModelId, HPSR_MODEL_ID);
  assert.equal(
    config.experiment.stableExperimentId,
    HPSR_EXPERIMENT_ID
  );
  assert.deepEqual(
    config.identities.map(({ armId }) => armId),
    HPSR_ARM_IDS
  );
  assert.equal(config.experiment.status, HPSR_WAITING_STATUS);
  assert.equal(config.execution.K1ImplementationAuthorizedNow, false);
  assert.equal(config.execution.K2PrivateEvaluationAuthorizedNow, false);
  assert.equal(config.authorization.modelTrainingNow, false);
  assert.equal(config.authorization.modelSelectionNow, false);
});

test("current date evidence has no qualified later-origin", () => {
  const result = validateHpsrLaterOriginAvailability(availability);
  assert.equal(result.valid, true, result.errors.join("\n"));
  const plan = planHpsrLaterOrigins({
    maxPreviouslyOpenedOrigin:
      availability.openedOriginLedger.maxPreviouslyOpenedOrigin,
    openedFutureActualThrough:
      availability.openedOriginLedger.openedFutureActualThrough,
    latestCompleteMonth:
      availability.billAvailability.latestCompleteMonth
  });
  assert.deepEqual(plan.eligibleOrigins, []);
  assert.deepEqual(plan.laterOrigins, []);
  assert.equal(plan.reservedFinalHoldoutOrigin, null);
  assert.equal(plan.waiting, true);
});

test("one mature unopened window is reserved as final holdout", () => {
  const plan = planHpsrLaterOrigins({
    maxPreviouslyOpenedOrigin: "2026-02",
    openedFutureActualThrough: "2026-05",
    latestCompleteMonth: "2026-08"
  });
  assert.deepEqual(
    plan.nonoverlappingOrigins.map(({ origin }) => origin),
    ["2026-05"]
  );
  assert.deepEqual(plan.laterOrigins, []);
  assert.equal(plan.reservedFinalHoldoutOrigin, "2026-05");
  assert.equal(plan.waiting, true);
});

test("later-origin selection preserves a disjoint holdout", () => {
  const single = planHpsrLaterOrigins({
    maxPreviouslyOpenedOrigin: "2026-02",
    openedFutureActualThrough: "2026-05",
    latestCompleteMonth: "2026-11"
  });
  assert.deepEqual(
    single.laterOrigins.map(({ origin }) => origin),
    ["2026-05"]
  );
  assert.equal(single.reservedFinalHoldoutOrigin, "2026-08");
  assert.equal(
    single.availabilityClass,
    "SINGLE_ORIGIN_DIRECTIONAL_VALIDATION_AVAILABLE"
  );

  const multi = planHpsrLaterOrigins({
    maxPreviouslyOpenedOrigin: "2026-02",
    openedFutureActualThrough: "2026-05",
    latestCompleteMonth: "2027-02"
  });
  assert.deepEqual(
    multi.laterOrigins.map(({ origin }) => origin),
    ["2026-05", "2026-08"]
  );
  assert.equal(multi.reservedFinalHoldoutOrigin, "2026-11");
  assert.equal(
    multi.availabilityClass,
    "MULTI_ORIGIN_VALIDATION_AVAILABLE"
  );
  assert.equal(forecastWindowsOverlap("2026-05", "2026-08", 3), false);
  assert.equal(forecastWindowsOverlap("2026-05", "2026-07", 3), true);
});

test("Core and cash bands are origin-visible without generic SKU floors", () => {
  assert.equal(
    config.scope.corePopulationSource,
    "ORIGIN_VISIBLE_SALES_SHARE_CASH_ONLY"
  );
  assert.equal(config.scope.corePopulationRecomputedAtEveryOrigin, true);
  assert.equal(config.cashBands.futureActualUsed, false);
  assert.equal(config.cashBands.fixedMinimumWorkCountAllowed, false);
  assert.equal(config.cashBands.minimum50Or100WorksRequired, false);
  assert.equal(config.cashBands.smallPublishingPopulationAllowed, true);
  assert.deepEqual(
    config.cashBands.bands.map(({ bandId }) => bandId),
    ["H50", "M30", "L20"]
  );
});

test("H50 is exact architecture while M30 and L20 are independent", () => {
  const formula = config.routerFormula;
  assert.equal(formula.H50.predictionFormula, "base");
  assert.equal(formula.H50.rowwiseExactEqualityToR0Required, true);
  assert.equal(formula.H50.fallback, false);
  assert.equal(formula.H50.abstain, false);
  for (const bandId of ["M30", "L20"]) {
    assert.equal(formula[bandId].alpha, 1);
    assert.equal(formula[bandId].globalAlphaDependencyAllowed, false);
    assert.equal(formula[bandId].otherBandDependencyAllowed, false);
    assert.equal(
      formula[bandId].boundedNormalizedResidualFormula,
      "clip(normalizedResidual,frozenDevelopmentQ05,frozenDevelopmentQ95)"
    );
  }
  assert.equal(formula.alphaSelectionAllowed, false);
  assert.equal(formula.additionalArmAllowed, false);
});

test("residual bounds exclude later-origin outcomes", () => {
  const bounds = config.residualBoundaryFreeze;
  assert.equal(
    bounds.source,
    "PREVIOUSLY_OPENED_HCRC01_DEVELOPMENT_ROWS_ONLY"
  );
  assert.equal(bounds.laterOriginRowsOrOutcomeAllowed, false);
  assert.equal(bounds.positiveBaseFloor.quantile, 0.1);
  assert.equal(bounds.normalizedResidualBounds.lowerQuantile, 0.05);
  assert.equal(bounds.normalizedResidualBounds.upperQuantile, 0.95);
  assert.equal(bounds.boundValuesMustFreezeBeforeLaterOutcome, true);
  assert.equal(bounds.boundValuesPresentAtK0B, false);
});

test("numeric and reporting contracts separate raw router from fallback", () => {
  assert.equal(
    config.numericSafety.finiteExtremeRawB3Policy,
    "PRESERVE_D1_RAW_AND_CLIP_NORMALIZED_RESIDUAL_BEFORE_R1"
  );
  assert.equal(
    config.numericSafety.nonfiniteFallbackStatus,
    "NUMERIC_INPUT_INVALID_FALLBACK_LG01"
  );
  assert.equal(config.numericSafety.allFinalR1PredictionsFiniteRequired, true);
  assert.equal(config.evaluation.rawRouterReported, true);
  assert.equal(config.evaluation.correctedOnlySubsetReported, true);
  assert.equal(config.evaluation.fallbackOnlySubsetReported, true);
  assert.equal(config.evaluation.selectedPipelineMayReplaceRawRouter, false);
});

test("same-case conservation and no-future-leakage are fail-closed", () => {
  assert.equal(config.caseAndConservation.exactSameCaseRequired, true);
  assert.equal(config.caseAndConservation.duplicatePolicy, "FAIL_CLOSED");
  assert.equal(config.caseAndConservation.amountConservationRequired, true);
  assert.equal(config.caseAndConservation.caseKeyConservationRequired, true);
  assert.equal(config.caseAndConservation.futureLeakageAllowed, false);
  assert.equal(
    config.originFaithfulFit.postOriginBillClassificationRankingOrActualAllowed,
    false
  );
  assert.equal(
    config.originFaithfulFit.laterOriginOutcomeMayReselectHyperparameters,
    false
  );
});

test("HCRC01 unknown per-alpha counts stay null without a rerun", () => {
  const result = validateHpsrSelectionAttribution(attribution);
  assert.equal(result.valid, true, result.errors.join("\n"));
  assert.equal(attribution.auditMode.oldModelRerun, false);
  assert.equal(attribution.auditMode.oldBootstrapRerun, false);
  assert.equal(
    attribution.recoverableFrozenAggregates.outerSelectionCount,
    16
  );
  assert.equal(
    attribution.dependencyAttribution.classification,
    "PREREGISTERED_AND_IMPLEMENTED_GLOBAL_DEPENDENCY_"
      + "NOT_A_NEWLY_DISCOVERED_ENGINEERING_ERROR"
  );
});

test("public Chinese reports match machine waiting status and leak no private path", () => {
  for (const report of [availabilityReport, preregistration]) {
    assert.match(report, /等待/u);
    assert.ok(report.includes(HPSR_WAITING_STATUS));
    assert.doesNotMatch(report, /data\/private-(?:input|output)\//u);
    assert.doesNotMatch(report, /[A-Z]:[\\/]/u);
  }
  assert.equal(availability.status, HPSR_WAITING_STATUS);
  assert.equal(availability.auditBoundary.newFutureActualAmountsRead, false);
  assert.equal(availability.auditBoundary.newModelMetricsRead, false);
});

test("portable cache classification never turns cache or receipt into authority", () => {
  assert.equal(
    config.authority.missingDerivedCachePolicy,
    "CACHE_MISS_REBUILDABLE"
  );
  assert.equal(
    config.authority.missingRunProvenancePolicy,
    "OPTIONAL_PROVENANCE_MISSING_WARNING_ONLY"
  );
  assert.equal(config.authority.historicalReceiptMayGrantExecution, false);
  assert.equal(config.execution.runtimeRepositoryRootResolved, true);
  assert.equal(config.execution.runtimeGitIdentityResolved, true);
  assert.equal(
    config.execution.absoluteMachinePathInLongLivedArtifactAllowed,
    false
  );
  assert.equal(config.execution.fixedExecutionShaInContractAllowed, false);
});

async function readJson(repositoryRelativePath) {
  return JSON.parse(await readText(repositoryRelativePath));
}

async function readText(repositoryRelativePath) {
  return (await readFile(
    path.join(root, repositoryRelativePath),
    "utf8"
  )).replaceAll("\r\n", "\n");
}
