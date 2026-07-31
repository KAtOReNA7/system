import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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
  assertHpsrControlledExecutionGate,
  assertHpsrRetrospectiveExecutionGate,
  buildHpsrOriginCashBands,
  buildHpsrOriginCashBandsFromWorkCash,
  deriveHpsrResidualBounds,
  evaluateHpsrRetrospectiveDevelopment,
  HPSR_ARM_IDS,
  HPSR_EXPERIMENT_ID,
  HPSR_IMPLEMENTED_STATUS,
  HPSR_K1_EXECUTION_STATUS,
  HPSR_K2_WAITING_STATUS,
  HPSR_MODEL_ID,
  HPSR_RETROSPECTIVE_MIXED_STATUS,
  HPSR_RETROSPECTIVE_UNSUPPORTED_STATUS,
  forecastWindowsOverlap,
  planHpsrRetrospectiveOrigins,
  planHpsrProspectiveReservation,
  runHeadProtectedSegmentedRouter,
  summarizeHpsrOpenedEvidence,
  validateHeadProtectedSegmentedRouterContract,
  validateHpsrImplementationReadiness,
  validateHpsrLaterOriginAvailability,
  validateHpsrOpenedOriginSemantics,
  validateHpsrResidualBoundProvenance,
  validateHpsrSelectionAttribution
} from "../src/domain/m2Current/headProtectedSegmentedRouter.js";
import {
  loadOrRebuildHpsrResidualBoundCache
} from "../scripts/m2-current/materialize_head_protected_segmented_router_bounds.mjs";
import {
  runHpsrSyntheticFixture
} from "../scripts/m2-current/run_m2_head_protected_segmented_router_synthetic.mjs";

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
const implementationReadiness = await readJson(
  config.publicOutputs.implementationReadinessJson
);
const retrospectiveReadiness = await readJson(
  config.publicOutputs.retrospectiveReadinessJson
);
const retrospectiveDevelopment = await readJson(
  config.publicOutputs.retrospectiveEvaluationJson
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
const implementationReadinessReport = await readText(
  config.publicOutputs.implementationReadinessReport
);
const retrospectiveReadinessReport = await readText(
  config.publicOutputs.retrospectiveReadinessReport
);
const retrospectiveDevelopmentReport = await readText(
  config.publicOutputs.retrospectiveEvaluationReport
);
const synthetic = await runHpsrSyntheticFixture();

test("K1 and one retrospective result are frozen while K2 is stopped", () => {
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
  assert.equal(
    config.experiment.status,
    HPSR_RETROSPECTIVE_UNSUPPORTED_STATUS
  );
  assert.equal(config.experiment.K1, HPSR_K1_EXECUTION_STATUS);
  assert.equal(
    config.experiment.K2,
    "NOT_EXECUTED_STOPPED_BY_RETROSPECTIVE_UNSUPPORTED"
  );
  assert.equal(config.execution.K1ImplementationAuthorizedNow, true);
  assert.equal(
    config.execution.K1SemanticAndBoundPreparationCompleted,
    true
  );
  assert.equal(config.execution.K1CanonicalImplementationCompleted, true);
  assert.equal(config.execution.K1PublicSyntheticValidationCompleted, true);
  assert.equal(config.execution.K2PrivateEvaluationAuthorizedNow, false);
  assert.equal(
    config.execution
      .singleQualifiedLaterOriginEvaluationConditionallyAuthorizedByUser,
    true
  );
  assert.equal(
    config.execution.retrospectiveDevelopmentEvaluationAuthorizedNow,
    true
  );
  assert.equal(
    config.execution.retrospectiveDevelopmentEvaluationCompleted,
    true
  );
  assert.equal(config.authorization.modelTrainingNow, false);
  assert.equal(config.authorization.modelSelectionNow, false);
  assert.equal(config.authorization.retrospectiveDevelopmentEvaluation, true);
  assert.equal(config.authorization.qualifiedLaterOriginValidation, true);
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

test("retrospective origin inventory is dynamic and excludes isolation or incomplete windows", () => {
  const plan = planHpsrRetrospectiveOrigins({
    residualBoundDerivationThrough: "2025-09",
    firstIndependentLaterOrigin: "2026-03",
    completeAuthoritativeBillMonthThrough: "2026-04",
    openedOriginProfiles: [
      {
        origin: "2025-11",
        rowCount: 20,
        nonNullExistingActualCount: 20,
        horizonsMonths: [3, 6]
      },
      {
        origin: "2026-02",
        rowCount: 10,
        nonNullExistingActualCount: 10,
        horizonsMonths: [3]
      }
    ],
    isolatedOrigins: ["2025-12"]
  });
  assert.equal(plan.retrospectiveReplayReady, true);
  assert.deepEqual(plan.includedOrigins, ["2025-11"]);
  assert.deepEqual(
    plan.inventory.map((row) => row.origin),
    ["2025-10", "2025-11", "2025-12", "2026-01", "2026-02"]
  );
  assert.ok(
    plan.inventory.find(
      (row) => row.origin === "2025-12"
    ).exclusionReasons.includes("HISTORICAL_ISOLATED_OUTCOME")
  );
  assert.ok(
    plan.inventory.find(
      (row) => row.origin === "2026-02"
    ).exclusionReasons.includes(
      "INCOMPLETE_THREE_MONTH_AUTHORITY_WINDOW"
    )
  );
  const gate = assertHpsrRetrospectiveExecutionGate({
    contract: config,
    retrospectivePlan: plan
  });
  assert.equal(gate.authorized, true);
  assert.deepEqual(gate.origins, ["2025-11"]);
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

test("work-total trailing-12 adapter preserves the canonical cash bands", () => {
  const cashByWork = new Map();
  for (const row of synthetic.input.originVisibleMonthlyCashRows) {
    cashByWork.set(
      row.standardWorkId,
      (cashByWork.get(row.standardWorkId) ?? 0) + row.cash
    );
  }
  const direct = buildHpsrOriginCashBandsFromWorkCash({
    origin: synthetic.input.origin,
    originVisibleWorkCashRows: [...cashByWork].map(
      ([standardWorkId, trailing12Cash]) => ({
        standardWorkId,
        trailing12Cash
      })
    )
  });
  assert.deepEqual(
    direct.cashBandRows.map(
      ({ standardWorkId, bandId }) => ({ standardWorkId, bandId })
    ),
    synthetic.result.population.cashBandRows.map(
      ({ standardWorkId, bandId }) => ({ standardWorkId, bandId })
    )
  );
  assert.equal(direct.workCashAggregationOnly, true);
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

test("public synthetic fixture executes dynamic Core80 and 5/3/2 cash bands", () => {
  const { result, summary } = synthetic;
  assert.equal(result.population.core80WorkCount, 10);
  assert.equal(result.population.core80CutoffTieCount, 10);
  assert.deepEqual(result.population.bandCounts, {
    H50: 5,
    M30: 3,
    L20: 2
  });
  assert.equal(result.population.fixedMinimumWorkCountRequired, false);
  assert.equal(summary.H50RowwiseExactLg01, true);
  assert.equal(summary.H50FallbackRowCount, 0);
  assert.equal(summary.privateDataAccessed, false);
  assert.equal(summary.realScoreProduced, false);
  assert.equal(summary.realBootstrapExecuted, false);
});

test("synthetic H50 is rowwise exact LG01 and never a fallback", () => {
  const baselineByWork = new Map(synthetic.result.r0Rows.map((row) => [
    row.standardWorkId,
    row.pointEstimate
  ]));
  const h50 = synthetic.result.r1RawRouterRows.filter(
    (row) => row.cashBandId === "H50"
  );
  assert.equal(h50.length, 5);
  for (const row of h50) {
    assert.equal(row.pointEstimate, baselineByWork.get(row.standardWorkId));
    assert.equal(row.fallbackToLg01, false);
    assert.equal(row.numericStatus, "H50_EXACT_LG01_ARCHITECTURE");
  }
});

test("M30 and L20 use fixed alpha one with no cross-band dependency", () => {
  const candidateRows = synthetic.result.r1RawRouterRows.filter(
    (row) => row.cashBandId !== "H50"
  );
  assert.equal(candidateRows.every((row) => row.alpha === 1), true);
  assert.equal(candidateRows.every((row) => row.globalAlpha === null), true);
  assert.equal(synthetic.result.invariants.alphaSearchExecuted, false);
  assert.equal(synthetic.result.invariants.otherBandDependency, false);

  const mutate = (standardWorkId, cham01B3Prediction) => (
    runHeadProtectedSegmentedRouter({
      ...synthetic.input,
      predictionRows: synthetic.input.predictionRows.map((row) => (
        row.standardWorkId === standardWorkId
          ? { ...row, cham01B3Prediction }
          : row
      ))
    })
  );
  const changedM30 = mutate("SYN-HPSR-W06", 51);
  const originalL20 = synthetic.result.r1RawRouterRows.filter(
    (row) => row.cashBandId === "L20"
  ).map((row) => row.pointEstimate);
  const changedL20 = changedM30.r1RawRouterRows.filter(
    (row) => row.cashBandId === "L20"
  ).map((row) => row.pointEstimate);
  assert.deepEqual(changedL20, originalL20);

  const changedL20Run = mutate("SYN-HPSR-W09", 19);
  const originalM30 = synthetic.result.r1RawRouterRows.filter(
    (row) => row.cashBandId === "M30"
  ).map((row) => row.pointEstimate);
  const changedM30Rows = changedL20Run.r1RawRouterRows.filter(
    (row) => row.cashBandId === "M30"
  ).map((row) => row.pointEstimate);
  assert.deepEqual(changedM30Rows, originalM30);
});

test("finite extremes are clipped and nonfinite B3 falls back to LG01", () => {
  const { result } = synthetic;
  const extremes = result.d1RawDiagnosticRows.filter(
    (row) => row.finiteExtreme
  );
  assert.equal(extremes.length, 2);
  for (const diagnostic of extremes) {
    const candidate = result.r1RawRouterRows.find(
      (row) => row.standardWorkId === diagnostic.standardWorkId
    );
    assert.equal(candidate.boundTriggered, true);
    assert.equal(candidate.fallbackToLg01, false);
    assert.equal(Number.isFinite(candidate.pointEstimate), true);
  }
  const nonfinite = result.d1RawDiagnosticRows.find(
    (row) => !row.rawPredictionFinite
  );
  const fallback = result.r1RawRouterRows.find(
    (row) => row.standardWorkId === nonfinite.standardWorkId
  );
  const baseline = result.r0Rows.find(
    (row) => row.standardWorkId === nonfinite.standardWorkId
  );
  assert.equal(fallback.numericStatus, "NUMERIC_INPUT_INVALID_FALLBACK_LG01");
  assert.equal(fallback.pointEstimate, baseline.pointEstimate);
  assert.equal(result.coverage.correctedRowCount, 4);
  assert.equal(result.coverage.numericFallbackRowCount, 1);
  assert.equal(result.coverage.boundTriggeredRowCount, 2);
});

test("nonfinite raw and residual paths preserve finite LG01 fallback", () => {
  const withInfinity = runHeadProtectedSegmentedRouter({
    ...synthetic.input,
    predictionRows: synthetic.input.predictionRows.map((row) => (
      row.standardWorkId === "SYN-HPSR-W10"
        ? { ...row, cham01B3Prediction: Number.POSITIVE_INFINITY }
        : row
    ))
  });
  const infinityRow = withInfinity.r1RawRouterRows.find(
    (row) => row.standardWorkId === "SYN-HPSR-W10"
  );
  assert.equal(infinityRow.fallbackToLg01, true);
  assert.equal(Number.isFinite(infinityRow.pointEstimate), true);

  const withOverflowResidual = runHeadProtectedSegmentedRouter({
    ...synthetic.input,
    predictionRows: synthetic.input.predictionRows.map((row) => (
      row.standardWorkId === "SYN-HPSR-W10"
        ? {
          ...row,
          lg01Prediction: Number.MAX_VALUE,
          cham01B3Prediction: -Number.MAX_VALUE
        }
        : row
    ))
  });
  const overflowRow = withOverflowResidual.r1RawRouterRows.find(
    (row) => row.standardWorkId === "SYN-HPSR-W10"
  );
  assert.equal(overflowRow.fallbackReason, "NONFINITE_RESIDUAL");
  assert.equal(overflowRow.pointEstimate, Number.MAX_VALUE);
  assert.equal(Number.isFinite(overflowRow.pointEstimate), true);
});

test("raw B3 diagnostics and raw HPSR rows remain separate", () => {
  assert.notEqual(
    synthetic.result.d1RawDiagnosticRows,
    synthetic.result.r1RawRouterRows
  );
  assert.equal(
    synthetic.result.r1RawRouterRows.every(
      (row) => !Object.hasOwn(row, "rawPointEstimate")
    ),
    true
  );
  assert.equal(synthetic.result.invariants.rawB3AndR1StoredSeparately, true);
});

test("one-origin retrospective produces a real mixed result rather than no result", () => {
  const controlled = runHeadProtectedSegmentedRouter({
    ...synthetic.input,
    residualBoundState: {
      ...synthetic.input.residualBoundState,
      sourceClass: "FROZEN_FROM_PREVIOUSLY_OPENED_DEVELOPMENT_ONLY"
    },
    executionMode: "CONTROLLED_LATER_ORIGIN"
  });
  const candidateByWork = new Map(
    controlled.r1RawRouterRows.map((row) => [
      row.standardWorkId,
      row.pointEstimate
    ])
  );
  const result = evaluateHpsrRetrospectiveDevelopment({
    originResults: [{
      origin: controlled.origin,
      routerResult: controlled,
      actualRows: synthetic.fixture.works.map((work) => ({
        standardWorkId: work.standardWorkId,
        origin: controlled.origin,
        horizonMonths: 3,
        actual: candidateByWork.get(work.standardWorkId)
      }))
    }],
    decisionPolicy: config.retrospectiveReplay.decisionPolicy,
    bootstrap: config.retrospectiveReplay.bootstrap
  });
  assert.equal(result.status, HPSR_RETROSPECTIVE_MIXED_STATUS);
  assert.equal(result.rawCandidateEvaluationCount, 1);
  assert.equal(result.bootstrapExecutionCount, 1);
  assert.equal(result.caseCount, 10);
  assert.equal(result.metrics.r1.wape, 0);
  assert.equal(result.timeBlockSummary.evaluableBlockCount, 1);
  assert.equal(result.decision.insufficientStableTimeBlocks, true);
  assert.equal(result.decision.independentEvidence, false);
});

test("clear one-origin degradation stops before independent K2", () => {
  const extremeInput = {
    ...synthetic.input,
    predictionRows: synthetic.input.predictionRows.map((row) => ({
      ...row,
      cham01B3Prediction: row.lg01Prediction * 10,
      cham01Diagnostics: {
        signedExpm1Overflow: false,
        supportRangeExtrapolation: true
      }
    })),
    residualBoundState: {
      ...synthetic.input.residualBoundState,
      sourceClass: "FROZEN_FROM_PREVIOUSLY_OPENED_DEVELOPMENT_ONLY"
    },
    executionMode: "CONTROLLED_LATER_ORIGIN"
  };
  const controlled = runHeadProtectedSegmentedRouter(extremeInput);
  const baselineByWork = new Map(
    controlled.r0Rows.map((row) => [
      row.standardWorkId,
      row.pointEstimate
    ])
  );
  const result = evaluateHpsrRetrospectiveDevelopment({
    originResults: [{
      origin: controlled.origin,
      routerResult: controlled,
      actualRows: synthetic.fixture.works.map((work) => ({
        standardWorkId: work.standardWorkId,
        origin: controlled.origin,
        horizonMonths: 3,
        actual: baselineByWork.get(work.standardWorkId) * 0.9
      }))
    }],
    decisionPolicy: config.retrospectiveReplay.decisionPolicy,
    bootstrap: config.retrospectiveReplay.bootstrap
  });
  assert.equal(
    result.status,
    HPSR_RETROSPECTIVE_UNSUPPORTED_STATUS
  );
  assert.equal(
    result.decision.unsupportedTriggers
      .overallWapeDegradedAtLeastOnePercent
      || result.decision.unsupportedTriggers
        .majorityTimeBlocksDegraded,
    true
  );
});

test("post-origin cash and outcome fields fail closed before routing", () => {
  assert.throws(
    () => buildHpsrOriginCashBands({
      origin: synthetic.input.origin,
      originVisibleMonthlyCashRows: [
        ...synthetic.input.originVisibleMonthlyCashRows,
        {
          standardWorkId: "SYN-HPSR-W01",
          channelUid: "SYN-HPSR-CHANNEL",
          month: "2026-04",
          cash: 999999
        }
      ]
    }),
    /hpsr_post_origin_cash_row_forbidden/u
  );
  assert.throws(
    () => runHeadProtectedSegmentedRouter({
      ...synthetic.input,
      predictionRows: synthetic.input.predictionRows.map((row, index) => (
        index === 0 ? { ...row, futureActual: 1 } : row
      ))
    }),
    /outcome_field_forbidden/u
  );
});

test("bill completeness changes readiness but not the actual-opened boundary", () => {
  const waiting = planHpsrProspectiveReservation({
    maxActualValueOpenedOrigin: "2026-02",
    completeAuthoritativeBillMonthThrough: "2026-04"
  });
  const ready = planHpsrProspectiveReservation({
    maxActualValueOpenedOrigin: "2026-02",
    completeAuthoritativeBillMonthThrough: "2026-06"
  });
  assert.equal(waiting.firstIndependentLaterOrigin, "2026-03");
  assert.equal(ready.firstIndependentLaterOrigin, "2026-03");
  assert.equal(waiting.firstIndependentLaterOriginReady, false);
  assert.equal(ready.firstIndependentLaterOriginReady, true);
  assert.equal(ready.prospectiveFinalHoldoutOrigin, "2026-06");
  assert.equal(ready.prospectiveFinalHoldoutOutcomeRead, false);
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

test("frozen retrospective public result preserves the real unsupported outcome", () => {
  assert.equal(
    retrospectiveDevelopment.status,
    HPSR_RETROSPECTIVE_UNSUPPORTED_STATUS
  );
  assert.equal(
    retrospectiveDevelopment.execution.retrospectiveActuallyExecuted,
    true
  );
  assert.equal(
    retrospectiveDevelopment.retrospective.independentEvidence,
    false
  );
  assert.deepEqual(
    retrospectiveDevelopment.retrospective.origins,
    ["2025-11"]
  );
  const evaluation = retrospectiveDevelopment.retrospective.evaluation;
  assert.equal(evaluation.caseCount, 57);
  assert.equal(evaluation.workCount, 57);
  assert.equal(evaluation.structure.uniqueCaseKeyCount, 57);
  assert.equal(
    evaluation.metrics.r1PairedFvaVsR0,
    0.00847712522619727
  );
  assert.equal(
    evaluation.metrics.absoluteBiasWorsening,
    0.020358292834892863
  );
  assert.equal(
    evaluation.metrics.r1BootstrapFva95.interval95.lower,
    -0.1834407271166846
  );
  assert.equal(
    evaluation.decision.unsupportedTriggers
      .absoluteBiasWorsenedMoreThanTwoPoints,
    true
  );
  assert.equal(
    evaluation.structure.H50RowwisePredictionAndAbsoluteErrorEquality,
    true
  );
  assert.deepEqual(
    evaluation.originSummaries[0].cashBandWorkCounts,
    { H50: 5, M30: 19, L20: 33 }
  );
  assert.equal(evaluation.numeric.numericFallbackCount, 0);
  assert.equal(evaluation.numeric.r1RawCoverage, 1);
  assert.equal(
    retrospectiveDevelopment.scientificExecutionCounts
      .newModelTrainingCount,
    0
  );
  assert.equal(
    retrospectiveDevelopment.scientificExecutionCounts
      .completeRetrospectiveEvaluationCount,
    1
  );
  assert.equal(
    retrospectiveDevelopment.scientificExecutionCounts
      .independentK2EvaluationCount,
    0
  );
  assert.equal(
    retrospectiveDevelopment.readiness.prospectiveFinalHoldoutOpened,
    false
  );
  assert.equal(retrospectiveDevelopment.governance.activeCandidate, false);
  assert.equal(
    retrospectiveDevelopment.governance.approvedForAutomation,
    false
  );
});

test("public Chinese reports preserve history and leak no private path", () => {
  const semantics = validateHpsrOpenedOriginSemantics(openedSemantics);
  assert.equal(semantics.valid, true, semantics.errors.join("\n"));
  for (const report of [
    availabilityReport,
    preregistration,
    openedSemanticsReport,
    prospectiveFinalHoldoutReport,
    residualBoundReport,
    implementationReadinessReport,
    retrospectiveReadinessReport,
    retrospectiveDevelopmentReport
  ]) {
    assert.doesNotMatch(report, /data\/private-(?:input|output)\//u);
    assert.doesNotMatch(report, /[A-Z]:[\\/]/u);
  }
  assert.ok(availabilityReport.includes(HPSR_IMPLEMENTED_STATUS));
  assert.ok(preregistration.includes(HPSR_IMPLEMENTED_STATUS));
  assert.ok(implementationReadinessReport.includes(HPSR_IMPLEMENTED_STATUS));
  assert.equal(availability.status, HPSR_IMPLEMENTED_STATUS);
  assert.equal(availability.auditBoundary.newFutureActualAmountsRead, false);
  assert.equal(availability.auditBoundary.newModelMetricsRead, false);
  assert.equal(retrospectiveReadiness.retrospectiveReplayReady, true);
  assert.equal(retrospectiveReadiness.independentK2Ready, false);
  assert.deepEqual(retrospectiveReadiness.includedOrigins, ["2025-11"]);
  assert.equal(
    retrospectiveReadiness.auditBoundary.newFutureActualAmountsRead,
    false
  );
  assert.ok(
    retrospectiveDevelopmentReport.includes(
      HPSR_RETROSPECTIVE_UNSUPPORTED_STATUS
    )
  );
  assert.doesNotMatch(
    JSON.stringify(retrospectiveDevelopment),
    /standardWorkId|channelUid|data[\\/]+private-(?:input|output)|[A-Z]:[\\/]/u
  );
});

test("K1 readiness records implementation without publishing a real score", () => {
  const validation = validateHpsrImplementationReadiness(
    implementationReadiness
  );
  assert.equal(validation.valid, true, validation.errors.join("\n"));
  assert.equal(
    implementationReadiness.implementation.productionSurfaceChangeCount,
    0
  );
  assert.equal(
    implementationReadiness.syntheticValidation
      .dynamicCore80WorkCount,
    synthetic.summary.dynamicCore80WorkCount
  );
  assert.deepEqual(
    implementationReadiness.syntheticValidation.cashBandWorkCounts,
    synthetic.summary.bandCounts
  );
  assert.equal(
    implementationReadiness.auditBoundary.newLaterOriginFutureActualRead,
    false
  );
  assert.equal(implementationReadiness.auditBoundary.realWapeProduced, false);
  assert.equal(implementationReadiness.auditBoundary.realBiasProduced, false);
  assert.equal(implementationReadiness.auditBoundary.realFvaProduced, false);
  assert.equal(
    implementationReadiness.auditBoundary.realBootstrapExecuted,
    false
  );
});

test("future controlled execute is denied before any private adapter runs", async () => {
  assert.throws(
    () => assertHpsrControlledExecutionGate({
      contract: config,
      availability,
      authorization: null
    }),
    /hpsr_k2_not_authorized_current_task_fail_closed/u
  );
  const runnerPath = path.join(
    root,
    "scripts",
    "m2-current",
    "run_m2_head_protected_segmented_router_controlled.mjs"
  );
  const executed = spawnSync(process.execPath, [runnerPath], {
    cwd: root,
    encoding: "utf8"
  });
  assert.notEqual(executed.status, 0);
  assert.equal(executed.stdout, "");
  assert.match(
    executed.stderr,
    /hpsr_k2_not_authorized_current_task_fail_closed/u
  );
  const source = await readText(
    "scripts/m2-current/"
      + "run_m2_head_protected_segmented_router_controlled.mjs"
  );
  assert.doesNotMatch(source, /data[\\/]+private-(?:input|output)/iu);
});

test("public entrypoints are portable and production surfaces stay untouched", async () => {
  const sources = await Promise.all([
    readText(
      "scripts/m2-current/"
        + "run_m2_head_protected_segmented_router_synthetic.mjs"
    ),
    readText(
      "scripts/m2-current/"
        + "run_m2_head_protected_segmented_router_controlled.mjs"
    ),
    readText(
      "scripts/m2-current/"
        + "run_m2_head_protected_segmented_router_readiness.mjs"
    )
  ]);
  for (const source of sources) {
    assert.doesNotMatch(source, /[A-Z]:[\\/]/u);
    assert.doesNotMatch(source, /5d7a40d|48d5e3b/u);
  }
  assert.equal(
    config.implementation.productionLoaderRouteOrApiChanged,
    false
  );
  assert.equal(config.implementation.productionSurfaceChangeCount, 0);
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
