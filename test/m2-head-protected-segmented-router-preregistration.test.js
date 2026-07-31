import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  rm
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  deriveHpsrResidualBounds,
  HPSR_ARM_IDS,
  HPSR_EXPERIMENT_ID,
  HPSR_MODEL_ID,
  HPSR_WAITING_STATUS,
  forecastWindowsOverlap,
  planHpsrProspectiveReservation,
  summarizeHpsrOpenedEvidence,
  validateHeadProtectedSegmentedRouterContract,
  validateHpsrLaterOriginAvailability,
  validateHpsrOpenedOriginSemantics,
  validateHpsrResidualBoundProvenance,
  validateHpsrSelectionAttribution
} from "../src/domain/m2Current/headProtectedSegmentedRouter.js";
import {
  loadOrRebuildHpsrResidualBoundCache
} from "../scripts/m2-current/materialize_head_protected_segmented_router_bounds.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = await readJson(
  "config/m2-current-head-protected-segmented-router.v0.1.json"
);
const attribution = await readJson(
  config.publicOutputs.selectionAttributionJson
);
const availability = await readJson(config.publicOutputs.availabilityJson);
const openedSemantics = await readJson(
  config.publicOutputs.openedOriginSemanticsJson
);
const residualBoundProvenance = await readJson(
  config.publicOutputs.residualBoundProvenanceJson
);
const availabilityReport = await readText(
  config.publicOutputs.availabilityReport
);
const preregistration = await readText(config.publicOutputs.preregistration);
const openedSemanticsReport = await readText(
  config.publicOutputs.openedOriginSemanticsReport
);
const prospectiveFinalHoldoutReport = await readText(
  config.publicOutputs.prospectiveFinalHoldoutReport
);
const residualBoundReport = await readText(
  config.publicOutputs.residualBoundProvenanceReport
);

test("K1A freezes semantics and bounds while K2 remains closed", () => {
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
  assert.equal(config.execution.K1ImplementationAuthorizedNow, true);
  assert.equal(
    config.execution.K1SemanticAndBoundPreparationCompleted,
    true
  );
  assert.equal(config.execution.K2PrivateEvaluationAuthorizedNow, false);
  assert.equal(config.authorization.modelTrainingNow, false);
  assert.equal(config.authorization.modelSelectionNow, false);
});

test("current date evidence has no qualified later-origin", () => {
  const result = validateHpsrLaterOriginAvailability(availability);
  assert.equal(result.valid, true, result.errors.join("\n"));
  const plan = planHpsrProspectiveReservation({
    maxActualValueOpenedOrigin:
      availability.openedSemantics.maxActualValueOpenedOrigin,
    completeAuthoritativeBillMonthThrough:
      availability.billAvailability
        .completeAuthoritativeBillMonthThrough
  });
  assert.equal(plan.firstIndependentLaterOrigin, "2026-03");
  assert.deepEqual(
    plan.firstIndependentFutureBillMonths,
    ["2026-04", "2026-05", "2026-06"]
  );
  assert.equal(plan.firstIndependentLaterOriginReady, false);
  assert.equal(plan.prospectiveFinalHoldoutOrigin, "2026-06");
  assert.deepEqual(
    plan.prospectiveFinalHoldoutFutureBillMonths,
    ["2026-07", "2026-08", "2026-09"]
  );
});

test("metadata-only evidence never advances actual-opened boundary", () => {
  const summary = summarizeHpsrOpenedEvidence([
    {
      accessClass: "ACTUAL_VALUE_OPENED",
      origin: "2026-02",
      throughMonth: "2026-05",
      evidenceRef: "frozen-complete-outcome",
      failedAttempt: false
    },
    {
      accessClass: "AVAILABILITY_METADATA_ONLY",
      origin: "2026-04",
      throughMonth: "2026-07",
      evidenceRef: "failed-metadata-audit",
      failedAttempt: true
    }
  ]);
  assert.equal(summary.maxAvailabilityInspectedOrigin, "2026-04");
  assert.equal(summary.availabilityInspectedThrough, "2026-07");
  assert.equal(summary.maxActualValueOpenedOrigin, "2026-02");
  assert.equal(summary.actualValueOpenedThrough, "2026-05");
  assert.equal(summary.failedAttemptTouchedMetadataOnly, true);
  assert.equal(summary.failedAttemptOpenedOutcome, false);
});

test("an amount read advances actual-opened boundary", () => {
  const summary = summarizeHpsrOpenedEvidence([
    {
      accessClass: "AVAILABILITY_METADATA_ONLY",
      origin: "2026-03",
      throughMonth: "2026-06",
      evidenceRef: "metadata"
    },
    {
      accessClass: "ACTUAL_VALUE_OPENED",
      origin: "2026-03",
      throughMonth: "2026-06",
      evidenceRef: "amount-read",
      failedAttempt: true
    }
  ]);
  assert.equal(summary.maxActualValueOpenedOrigin, "2026-03");
  assert.equal(summary.actualValueOpenedThrough, "2026-06");
  assert.equal(summary.failedAttemptOpenedOutcome, true);
});

test("prospective holdout is reserved even before its bills mature", () => {
  const plan = planHpsrProspectiveReservation({
    maxActualValueOpenedOrigin: "2026-02",
    completeAuthoritativeBillMonthThrough: "2026-06"
  });
  assert.equal(plan.firstIndependentLaterOrigin, "2026-03");
  assert.equal(plan.firstIndependentLaterOriginReady, true);
  assert.equal(plan.prospectiveFinalHoldoutOrigin, "2026-06");
  assert.equal(plan.prospectiveFinalHoldoutReady, false);
  assert.equal(plan.prospectiveFinalHoldoutOpened, false);
  assert.equal(plan.prospectiveFinalHoldoutOutcomeRead, false);
});

test("three-month development and prospective holdout windows do not overlap", () => {
  assert.equal(forecastWindowsOverlap("2026-03", "2026-06", 3), false);
  assert.equal(forecastWindowsOverlap("2026-03", "2026-05", 3), true);
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
  assert.equal(bounds.boundValuesFrozenAtK1A, true);
  assert.equal(bounds.privateDerivedArtifactMaterialized, true);
  assert.equal(bounds.publicNumericValuesPublished, false);
  assert.equal(
    bounds.provenanceStatus,
    "PROVEN_PREVIOUSLY_OPENED_DEVELOPMENT_ONLY"
  );
  const provenance = validateHpsrResidualBoundProvenance(
    residualBoundProvenance
  );
  assert.equal(
    provenance.valid,
    true,
    provenance.errors.join("\n")
  );
});

test("q10 q05 and q95 derive only from old development rows", () => {
  const bounds = deriveHpsrResidualBounds([
    {
      origin: "2025-01",
      basePointEstimate: 100,
      rawPointEstimate: 50
    },
    {
      origin: "2025-02",
      basePointEstimate: 200,
      rawPointEstimate: 250
    },
    {
      origin: "2025-03",
      basePointEstimate: 300,
      rawPointEstimate: 900
    }
  ], {
    maximumOpenedDevelopmentOrigin: "2026-02"
  });
  assert.equal(bounds.valid, true);
  assert.equal(bounds.inputRowCount, 3);
  assert.equal(bounds.finiteSupportRowCount, 3);
  assert.equal(bounds.laterOriginOutcomeUsed, false);
  assert.equal(bounds.finalHoldoutOutcomeUsed, false);
  assert.throws(
    () => deriveHpsrResidualBounds([
      {
        origin: "2026-03",
        basePointEstimate: 100,
        rawPointEstimate: 200
      }
    ], {
      maximumOpenedDevelopmentOrigin: "2026-02"
    }),
    /hpsr_residual_bound_later_origin_outcome_forbidden/u
  );
});

test("missing private bound cache is rebuilt without a historical receipt", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "hpsr-bound-"));
  const cachePath = path.join(directory, "bound.json");
  let rebuildCount = 0;
  const artifact = {
    schema:
      "m2.current.head_protected_segmented_router."
        + "residual_bounds.private.v0.1",
    artifactClass: "PRIVATE_DERIVED_CACHE",
    experimentId: HPSR_EXPERIMENT_ID,
    modelId: HPSR_MODEL_ID,
    status: "FROZEN_FROM_PREVIOUSLY_OPENED_DEVELOPMENT_ONLY",
    sourcePopulation:
      "STRICT_ROLLING_CORE80_H3_B3_JOIN_FROZEN_LG01",
    parameterValues: {
      frozenDevelopmentPositiveBaseFloor: 10,
      frozenDevelopmentQ05: -1,
      frozenDevelopmentQ95: 1
    },
    newLaterOriginActualValueRead: false,
    laterOriginOutcomeUsed: false,
    prospectiveFinalHoldoutOutcomeUsed: false,
    publicParameterValuesPublished: false,
    privateDigestIsCrossComputerGate: false
  };
  try {
    const rebuilt = await loadOrRebuildHpsrResidualBoundCache({
      cachePath,
      rebuild: async () => {
        rebuildCount += 1;
        return artifact;
      }
    });
    const cached = await loadOrRebuildHpsrResidualBoundCache({
      cachePath,
      rebuild: async () => {
        rebuildCount += 1;
        return artifact;
      }
    });
    assert.equal(rebuilt.cacheStatus, "CACHE_MISS_REBUILT");
    assert.equal(cached.cacheStatus, "CACHE_HIT");
    assert.equal(rebuildCount, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
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
  const semantics = validateHpsrOpenedOriginSemantics(openedSemantics);
  assert.equal(semantics.valid, true, semantics.errors.join("\n"));
  for (const report of [
    availabilityReport,
    preregistration,
    openedSemanticsReport,
    prospectiveFinalHoldoutReport,
    residualBoundReport
  ]) {
    assert.doesNotMatch(report, /data\/private-(?:input|output)\//u);
    assert.doesNotMatch(report, /[A-Z]:[\\/]/u);
  }
  assert.ok(availabilityReport.includes(HPSR_WAITING_STATUS));
  assert.ok(preregistration.includes(HPSR_WAITING_STATUS));
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
