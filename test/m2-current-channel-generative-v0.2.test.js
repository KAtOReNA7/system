import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  applyM2DevelopmentModelableRestatementToPackedRows,
  buildM2ChannelGenerativeForecastabilityDiagnostic,
  buildM2ChannelGenerativeG1PooledDiagnosticPredictions,
  buildM2ChannelGenerativeSyntheticDiagnostic,
  buildM2ChannelGenerativeSyntheticRows,
  crossFitM2ChannelGenerativeG1,
  evaluateM2ChannelGenerativeG1Prerequisites,
  expandM2ChannelGenerativePackedRows,
  fitM2ChannelGenerativeCandidate,
  predictM2ChannelGenerativeMonthly,
  strictRollingM2ChannelGenerativeG1,
  verifyM2ChannelGenerativeG0
} from "../src/domain/m2Current/channelGenerative.js";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const [config, fixture, preregistration] = await Promise.all([
  readJson("config/m2-current-channel-generative.v0.2.json"),
  readJson("test/fixtures/m2-current-channel-generative.synthetic.v0.2.json"),
  readJson(
    "docs/analysis/m2-current/"
      + "M2-current-channel-generative-v0.2-preregistration.json"
  )
]);
let rows;
let diagnostic;

test("G0 verifier preserves frozen decomposition, reversal placement and overlap semantics", () => {
  const frozen = frozenG0Rows();
  const result = verifyM2ChannelGenerativeG0(frozen);
  assert.equal(result.status, "G0_SEMANTIC_EQUIVALENCE_PASS");
  assert.equal(result.maximumPositiveConservationDifference, 0);
  assert.equal(result.maximumReversalConservationDifference, 0);
  assert.equal(result.maximumNetConservationDifference, 0);
  assert.equal(result.maximumA0A1Difference, 0);
  assert.equal(result.maximumMonthlyOverlapDifference, 0);
  assert.equal(result.reversalPlacementDifference, 0);
  assert.equal(result.futureFirstSeenNonzeroPredictionCount, 0);
  assert.equal(result.learnedGlobalRetrained, false);
  assert.equal(result.commonReversalRetrained, false);

  const packed = [packedG0Row()];
  const expanded = expandM2ChannelGenerativePackedRows(
    packed,
    { frozenRows: frozen.filter((row) => row.standardWorkId === "W-S") }
  );
  assert.equal(expanded.length, 6);
  assert.equal(expanded[0].g0MonthlyPositive, 10);
  assert.deepEqual(
    expanded[0].reversalRateByHorizon,
    { "3": 0.1, "6": 0.2 }
  );

  const drift = structuredClone(frozen);
  drift.find((row) => (
    row.rowKind === "work_channel"
      && row.standardWorkId === "W-S"
      && row.horizonMonths === 6
      && row.observedAtOrigin
  )).ablationPositivePoints.A1 = 61;
  assert.throws(
    () => verifyM2ChannelGenerativeG0(drift),
    /CONTRACT_SEMANTIC_BLOCKER/u
  );
});

test("monthly materialization is unique across overlapping horizons and keeps as-of zeros", () => {
  rows ??= buildM2ChannelGenerativeSyntheticRows(fixture, config);
  const keys = new Set(rows.map(monthlyKey));
  assert.equal(keys.size, rows.length);
  assert.equal(rows.some((row) => (
    row.includedHorizons.length > 1
  )), true);
  assert.equal(rows.every((row) => row.trainingWeight === 1), true);
  assert.equal(rows.every((row) => (
    row.labelAvailableAsOf === row.futureMonth
  )), true);
  assert.equal(rows.every((row) => (
    row.unmaturedLabelZeroImputed === false
      && row.futureFirstSeenIdentityUsedAsFeature === false
  )), true);
  assert.equal(rows.some((row) => (
    row.observedAtOrigin && row.actualPositive === 0
  )), true);
  assert.equal(rows.some((row) => (
    !row.observedAtOrigin && row.actualPositive > 0
  )), true);
});

test("authorized G1 synthetic core covers three mechanisms without any G0 prerequisite", () => {
  diagnostic ??= buildM2ChannelGenerativeSyntheticDiagnostic(
    fixture,
    config
  );
  assert.equal(
    diagnostic.schema,
    "m2.current.channel_generative_G1_public_diagnostic.v0.1"
  );
  assert.deepEqual(config.candidateIds, ["G0", "G1"]);
  assert.deepEqual(diagnostic.boundaries.candidateIdsExecuted, ["G1"]);
  assert.equal(diagnostic.boundaries.G1UsesG0, false);
  assert.equal(
    diagnostic.boundaries.frozenG0ChannelOffsetRequiredForG1,
    false
  );
  assert.equal(diagnostic.boundaries.auxiliaryG0StateRequiredForG1, false);
  assert.equal(diagnostic.boundaries.frozenG0ReadBySyntheticDiagnostic, false);
  assert.equal(diagnostic.boundaries.G2Executed, false);
  assert.equal(diagnostic.boundaries.G3Executed, false);
  assert.equal(diagnostic.boundaries.platformFeatureUsed, false);
  assert.equal(diagnostic.boundaries.taxonomyFeatureUsed, false);
  assert.equal(diagnostic.boundaries.scalarFactorUsed, false);
  assert.equal(diagnostic.boundaries.G4Implemented, false);
  assert.equal(diagnostic.boundaries.G5Implemented, false);
  assert.equal(diagnostic.boundaries.G6Implemented, false);
  assert.equal(diagnostic.boundaries.futureFirstSeenPrediction, 0);
  assert.equal(diagnostic.boundaries.observedZeroMonthsIncluded, true);
  assert.equal(
    diagnostic.boundaries.unobservedPreStartMonthsZeroFilled,
    false
  );
  assert.equal(diagnostic.boundaries.immatureLabelsIncluded, false);
  assert.equal(Number.isFinite(diagnostic.evaluations.G1.workTotal.wape), true);
});

test("training-only standardization, smearing, deterministic IRLS and ridge are reproducible", () => {
  rows ??= buildM2ChannelGenerativeSyntheticRows(fixture, config);
  const training = rows.filter((row) => row.evaluationFamily === "primary");
  const options = {
    candidateId: "G1",
    occurrenceL2: 10,
    conditionalAmountL2: 10
  };
  const first = fitM2ChannelGenerativeCandidate(training, config, options);
  const second = fitM2ChannelGenerativeCandidate(training, config, options);
  assert.deepEqual(first, second);
  for (const mechanism of ["membership", "advertising", "transactional"]) {
    const state = first.stateByMechanism[mechanism];
    assert.equal(state.status, "FITTED");
    assert.equal(state.standardizer.fitOnlyOnTraining, true);
    assert.equal(state.standardizer.fitRowCount, state.trainingRowCount);
    assert.equal(state.amount.kind, "RIDGE");
    assert.equal(state.amount.smearing > 0, true);
    assert.equal(state.occurrence.converged, true);
  }
});

test("one-class and no-positive nodes follow frozen deterministic fallback rules", () => {
  rows ??= buildM2ChannelGenerativeSyntheticRows(fixture, config);
  const membership = rows.filter((row) => (
    row.evaluationFamily === "primary"
      && row.mechanism === "membership"
  ));
  const relaxed = structuredClone(config);
  relaxed.eligibility = {
    minimumDistinctTrainingWorks: 1,
    minimumMonthlyTrainingRows: 1,
    minimumPositiveTrainingMonths: 0
  };
  const allPositive = membership.map((row) => ({
    ...row,
    actualPositive: Math.max(1, row.actualPositive),
    actualReversal: 0,
    actual: Math.max(1, row.actualPositive)
  }));
  const oneClass = fitM2ChannelGenerativeCandidate(
    allPositive,
    relaxed,
    {
      candidateId: "G1",
      occurrenceL2: 1,
      conditionalAmountL2: 1
    }
  );
  assert.equal(
    oneClass.stateByMechanism.membership.occurrence.kind,
    "ONE_CLASS"
  );

  const noPositive = membership.map((row) => ({
    ...row,
    actualPositive: 0,
    actualReversal: 0,
    actual: 0
  }));
  const unsupported = fitM2ChannelGenerativeCandidate(
    noPositive,
    relaxed,
    {
      candidateId: "G1",
      occurrenceL2: 1,
      conditionalAmountL2: 1
    }
  );
  assert.equal(
    unsupported.stateByMechanism.membership.fallbackReason,
    "no_positive_amount_rows"
  );
});

test("numeric and timeout failures fail closed without an alternate family", () => {
  rows ??= buildM2ChannelGenerativeSyntheticRows(fixture, config);
  const training = rows.filter((row) => row.evaluationFamily === "primary");
  const badNumeric = structuredClone(config);
  badNumeric.numerical.pivotTolerance = 1e9;
  const failed = fitM2ChannelGenerativeCandidate(training, badNumeric, {
    candidateId: "G1",
    occurrenceL2: 1,
    conditionalAmountL2: 1
  });
  assert.equal(failed.status, "NUMERICAL_FAILURE");
  assert.equal(failed.candidateEligible, false);
  const timedOut = fitM2ChannelGenerativeCandidate(training, config, {
    candidateId: "G1",
    occurrenceL2: 1,
    conditionalAmountL2: 1,
    now: () => 2,
    deadlineMs: 1
  });
  assert.equal(timedOut.status, "TIMEOUT");
  assert.equal(timedOut.candidateEligible, false);
});

test("G1 fit and prediction remain byte-identical when missing or changed G0 fields are supplied", () => {
  rows ??= buildM2ChannelGenerativeSyntheticRows(fixture, config);
  const training = rows.filter((row) => row.evaluationFamily === "primary");
  const validation = rows.find((row) => (
    row.evaluationFamily === "strict"
      && row.observedAtOrigin
      && row.mechanism === "membership"
  ));
  const state = fitM2ChannelGenerativeCandidate(training, config, {
    candidateId: "G1",
    occurrenceL2: 1,
    conditionalAmountL2: 1
  });
  const stateWithoutG0 = fitM2ChannelGenerativeCandidate(
    training.map((row) => {
      const copy = { ...row };
      delete copy.g0MonthlyPositive;
      return copy;
    }),
    config,
    {
      candidateId: "G1",
      occurrenceL2: 1,
      conditionalAmountL2: 1
    }
  );
  const stateWithChangedG0 = fitM2ChannelGenerativeCandidate(
    training.map((row) => ({ ...row, g0MonthlyPositive: 1000 })),
    config,
    {
      candidateId: "G1",
      occurrenceL2: 1,
      conditionalAmountL2: 1
    }
  );
  assert.deepEqual(state, stateWithoutG0);
  assert.deepEqual(state, stateWithChangedG0);
  const changed = { ...validation, g0MonthlyPositive: 1000 };
  const missing = { ...validation };
  delete missing.g0MonthlyPositive;
  const g1 = predictM2ChannelGenerativeMonthly(validation, state, config);
  const changedG1 = predictM2ChannelGenerativeMonthly(
    changed,
    state,
    config
  );
  const missingG1 = predictM2ChannelGenerativeMonthly(
    missing,
    state,
    config
  );
  assert.equal(g1.positivePoint, changedG1.positivePoint);
  assert.equal(g1.positivePoint, missingG1.positivePoint);
  assert.equal(g1.frozenG0MonthlyOffset, null);
  assert.equal(g1.platformFeatureUsed, false);
  assert.equal(g1.taxonomyFeatureUsed, false);
  assert.notEqual(
    predictM2ChannelGenerativeMonthly(
      { ...validation, futureMonthIndex: 1 },
      state,
      config
    ).dynamicResidual,
    predictM2ChannelGenerativeMonthly(
      { ...validation, futureMonthIndex: 12 },
      state,
      config
    ).dynamicResidual
  );
});

test("monthly predictions are nonnegative and cumulative horizons are monotone", () => {
  rows ??= buildM2ChannelGenerativeSyntheticRows(fixture, config);
  const training = rows.filter((row) => row.evaluationFamily === "primary");
  const state = fitM2ChannelGenerativeCandidate(training, config, {
    candidateId: "G1",
    occurrenceL2: 1,
    conditionalAmountL2: 1
  });
  const selected = rows.filter((row) => (
    row.evaluationFamily === "strict"
      && row.standardWorkId === rows.find(
        (candidate) => candidate.evaluationFamily === "strict"
      ).standardWorkId
      && row.observedAtOrigin
  ));
  const predictions = selected.map(
    (row) => predictM2ChannelGenerativeMonthly(row, state, config).positivePoint
  );
  assert.equal(predictions.every((value) => value >= 0), true);
  const cumulative = predictions.reduce((values, value) => {
    values.push((values.at(-1) ?? 0) + value);
    return values;
  }, []);
  assert.equal(
    cumulative.every((value, index) => (
      index === 0 || value >= cumulative[index - 1]
    )),
    true
  );
});

test("G1 nested selection stays inside outer training and executes no other arm", () => {
  const smallFixture = {
    ...fixture,
    worksPerMechanism: 12,
    origins: ["2022-09", "2022-12"],
    horizons: [3]
  };
  const smallConfig = structuredClone(config);
  smallConfig.grid.occurrenceL2 = [1];
  smallConfig.grid.conditionalAmountL2 = [1];
  smallConfig.eligibility = {
    minimumDistinctTrainingWorks: 1,
    minimumMonthlyTrainingRows: 1,
    minimumPositiveTrainingMonths: 1
  };
  const output = crossFitM2ChannelGenerativeG1(
    buildM2ChannelGenerativeSyntheticRows(smallFixture, smallConfig),
    smallConfig
  );
  assert.equal(output.outerOutcomeUsedForSelection, false);
  assert.deepEqual(output.rawOutputsPreserved, ["G1"]);
  assert.equal(output.blendOverwroteRaw, false);
  assert.equal(output.G2Executed, false);
  assert.equal(output.G3Executed, false);
  assert.equal(output.receipts.length, 5);
  for (const receipt of output.receipts) {
    assert.equal(receipt.outerValidationUsedForSelection, false);
    assert.equal(
      receipt.selectedConfiguration.outerOutcomeUsedForSelection,
      false
    );
    assert.equal(receipt.frozenG0ChannelOffsetRead, false);
  }
});

test("public and production boundaries remain isolated and private rows stay ignored", async () => {
  diagnostic ??= buildM2ChannelGenerativeSyntheticDiagnostic(
    fixture,
    config
  );
  const serialized = JSON.stringify(diagnostic);
  const [loader, route, materializer, gitIgnore] = await Promise.all([
    readFile(path.join(root, "src/domain/m2Current/loader.js"), "utf8"),
    readFile(path.join(root, "src/domain/m2Current/route.js"), "utf8"),
    readFile(
      path.join(
        root,
        "scripts/m2-current/materialize_human_anchored_cases.py"
      ),
      "utf8"
    ),
    readFile(path.join(root, ".gitignore"), "utf8")
  ]);
  assert.doesNotMatch(loader, /channelGenerative/u);
  assert.doesNotMatch(route, /channelGenerative/u);
  assert.doesNotMatch(serialized, /SYN-membership-000/u);
  assert.doesNotMatch(serialized, /SYN-CHANNEL/u);
  assert.match(materializer, /--channel-generative/u);
  assert.match(
    gitIgnore,
    /^data\/$/mu
  );
  assert.equal(config.authorization.production, false);
  assert.equal(config.authorization.exactV03Replacement, false);
  assert.equal(config.authorization.finalHoldout, false);
  assert.equal(config.authorization.G4Platform, false);
  assert.equal(config.authorization.G5Taxonomy, false);
  assert.equal(config.authorization.G6Composition, false);
  assert.deepEqual(
    preregistration.nestedSelection.selectedInsideOuterTrainingOnly.slice(0, 4),
    [
      "occurrence L2",
      "conditional amount L2",
      "G3 raw-core identity",
      "G3 alpha"
    ]
  );
});

test("arm-specific prerequisites do not require strict auxiliary G0 state for G1 training", () => {
  rows ??= buildM2ChannelGenerativeSyntheticRows(fixture, config);
  const training = rows.filter((row) => (
    row.evaluationFamily === "primary"
  )).map((row) => ({ ...row, g0MonthlyPositive: null }));
  const result = evaluateM2ChannelGenerativeG1Prerequisites({
    phase: "training",
    rows: training,
    frozenComparatorRows: null
  });
  assert.equal(result.passed, true);
  assert.equal(result.checks.frozenG0ChannelOffsetRequired, false);
  assert.equal(result.checks.auxiliaryG0StateRequired, false);
  assert.equal(result.frozenComparatorRead, false);
  assert.throws(
    () => evaluateM2ChannelGenerativeG1Prerequisites({
      phase: "outer_evaluation",
      rows: training,
      frozenComparatorRows: null
    }),
    /frozen_comparator_rows_required/u
  );
});

test("v2.2 development-modelable binding preserves raw labels and delays later reversal availability", () => {
  const packed = [{
    evaluationFamily: "strict",
    standardWorkId: "W1",
    channelUid: "C1",
    origin: "2022-12",
    observedAtOrigin: true,
    mechanism: "membership",
    features: Object.fromEntries(
      config.featureOrder.map((field) => [field, 0])
    ),
    futureMonthlyLabels: [{
      futureMonthIndex: 1,
      futureMonth: "2023-01",
      labelAvailableAsOf: "2023-01",
      actualPositive: 10,
      actualReversal: 0,
      actual: 10,
      includedHorizons: [3]
    }]
  }];
  const reconciliation = {
    schema: "m2.reversal-restatement.scope-reconciliation.private.v1",
    developmentModelableActualDefinitionId:
      "M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01",
    authority: { scalePower: 2 },
    fourViews: {
      DEVELOPMENT_MODELABLE_RESTATEMENT_VIEW: {
        status:
          "UNALLOCATED_REVERSAL_RESIDUAL_EXCLUDED_FROM_MODELABLE_TARGET",
        excludedUnallocatedReversalResidualMinor: "-25",
        exactIntegerReconciliation: { differenceMinor: "0" }
      }
    },
    scopes: [{
      standardWorkId: "W1",
      channelMemberId: "C1",
      restatedBalances: [{ month: "2023-01", amountMinor: "750" }]
    }]
  };
  const allocation = [{
    standardWorkId: "W1",
    channelMemberId: "C1",
    revenueRecognitionMonth: "2023-01",
    reversalRecordedAt: "2023-03-01",
    consumedAmountMinor: "250"
  }];
  const result = applyM2DevelopmentModelableRestatementToPackedRows(
    packed,
    reconciliation,
    allocation
  );
  const label = result.rows[0].futureMonthlyLabels[0];
  assert.equal(label.postingTimeActualPositive, 10);
  assert.equal(label.actualPositive, 7.5);
  assert.equal(label.actual, 7.5);
  assert.equal(label.labelAvailableAsOf, "2023-03");
  assert.equal(
    result.audit.excludedUnallocatedReversalResidualAssignedToLabel,
    false
  );
  assert.equal(result.audit.originAfterCutoffReversalFeatureRowCount, 0);
  assert.equal(result.audit.canonicalWorkIdAliasPackedRowCount, 0);
  assert.equal(result.audit.packedStandardWorkIdPreserved, true);
});

test("v2.2 restatement binding resolves canonical work identity without changing frozen case identity", () => {
  const packed = [{
    evaluationFamily: "strict",
    standardWorkId: "Ｙ００１",
    channelUid: "C1",
    origin: "2022-12",
    observedAtOrigin: true,
    mechanism: "membership",
    features: Object.fromEntries(
      config.featureOrder.map((field) => [field, 0])
    ),
    futureMonthlyLabels: [{
      futureMonthIndex: 1,
      futureMonth: "2023-01",
      labelAvailableAsOf: "2023-01",
      actualPositive: 10,
      actualReversal: 0,
      actual: 10,
      includedHorizons: [3]
    }]
  }];
  const reconciliation = {
    schema: "m2.reversal-restatement.scope-reconciliation.private.v1",
    developmentModelableActualDefinitionId:
      "M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01",
    authority: { scalePower: 2 },
    fourViews: {
      DEVELOPMENT_MODELABLE_RESTATEMENT_VIEW: {
        status:
          "UNALLOCATED_REVERSAL_RESIDUAL_EXCLUDED_FROM_MODELABLE_TARGET",
        excludedUnallocatedReversalResidualMinor: "-25",
        exactIntegerReconciliation: { differenceMinor: "0" }
      }
    },
    scopes: [{
      standardWorkId: "1",
      channelMemberId: "C1",
      restatedBalances: [{ month: "2023-01", amountMinor: "750" }]
    }]
  };
  const result = applyM2DevelopmentModelableRestatementToPackedRows(
    packed,
    reconciliation,
    [{
      consumedAmountMinor: "0"
    }]
  );
  assert.equal(result.rows[0].standardWorkId, "Ｙ００１");
  assert.equal(result.rows[0].futureMonthlyLabels[0].actual, 7.5);
  assert.equal(result.audit.canonicalWorkIdAliasPackedRowCount, 1);
  assert.equal(result.audit.canonicalWorkIdAliasWorkCount, 1);
  assert.equal(result.audit.canonicalWorkIdAliasScopeCount, 1);
  assert.equal(result.audit.canonicalWorkIdAmbiguousScopeCount, 0);
  assert.equal(result.audit.unresolvedRestatementScopeCount, 0);
});

test("v2.2 restatement binding fails closed on ambiguous canonical work identity", () => {
  const packed = [{
    standardWorkId: "001",
    channelUid: "C1",
    futureMonthlyLabels: [{
      futureMonth: "2023-01",
      actualPositive: 1,
      actualReversal: 0,
      actual: 1
    }]
  }];
  const reconciliation = {
    schema: "m2.reversal-restatement.scope-reconciliation.private.v1",
    developmentModelableActualDefinitionId:
      "M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01",
    authority: { scalePower: 2 },
    fourViews: {
      DEVELOPMENT_MODELABLE_RESTATEMENT_VIEW: {
        status:
          "UNALLOCATED_REVERSAL_RESIDUAL_EXCLUDED_FROM_MODELABLE_TARGET",
        excludedUnallocatedReversalResidualMinor: "0",
        exactIntegerReconciliation: { differenceMinor: "0" }
      }
    },
    scopes: [
      {
        standardWorkId: "1",
        channelMemberId: "C1",
        restatedBalances: [{
          month: "2023-01",
          amountMinor: "100"
        }]
      },
      {
        standardWorkId: "Y1",
        channelMemberId: "C1",
        restatedBalances: [{
          month: "2023-01",
          amountMinor: "100"
        }]
      }
    ]
  };
  assert.throws(
    () => applyM2DevelopmentModelableRestatementToPackedRows(
      packed,
      reconciliation,
      [{
        consumedAmountMinor: "0"
      }]
    ),
    /restatement_scope_ambiguous/u
  );
});

test("strict G1 training reads only labels available before each outer origin and oracle runs after freeze", () => {
  const smallFixture = {
    ...fixture,
    worksPerMechanism: 12,
    origins: ["2022-09", "2022-12", "2023-03"],
    horizons: [3]
  };
  const smallConfig = structuredClone(config);
  smallConfig.grid.occurrenceL2 = [1];
  smallConfig.grid.conditionalAmountL2 = [1];
  smallConfig.grid.configurationCountPerRawCandidate = 1;
  smallConfig.selection.strictOrigins = ["2023-03"];
  smallConfig.eligibility = {
    minimumDistinctTrainingWorks: 1,
    minimumMonthlyTrainingRows: 1,
    minimumPositiveTrainingMonths: 1
  };
  const synthetic = buildM2ChannelGenerativeSyntheticRows(
    smallFixture,
    smallConfig
  ).map((row) => ({
    ...row,
    evaluationFamily: "strict"
  }));
  const output = strictRollingM2ChannelGenerativeG1(
    synthetic,
    smallConfig
  );
  const evaluated = output.receipts.find(
    (receipt) => receipt.status === "EVALUATED"
  );
  assert.ok(evaluated);
  assert.ok(evaluated.maximumTrainingLabelAvailableAsOf < "2023-03");
  assert.equal(evaluated.sameOrLaterOuterTruthRead, false);
  const pooled = buildM2ChannelGenerativeG1PooledDiagnosticPredictions(
    synthetic,
    smallConfig,
    output
  );
  assert.throws(
    () => buildM2ChannelGenerativeForecastabilityDiagnostic(
      output.rows,
      output.predictions,
      smallConfig,
      { candidateOutputsFrozen: false }
    ),
    /oracle_before_candidate_freeze/u
  );
  const oracle = buildM2ChannelGenerativeForecastabilityDiagnostic(
    output.rows,
    output.predictions,
    smallConfig,
    {
      pooledPredictions: pooled.predictions,
      candidateOutputsFrozen: true
    }
  );
  assert.equal(
    oracle.diagnostics.ORACLE_BOTH.labelAggregationValidationPassed,
    true
  );
  assert.equal(
    oracle.diagnostics.MECHANISM_INFORMATION_GAIN.participatesInGate,
    false
  );
});

function frozenG0Rows() {
  const rows = [];
  for (const spec of [
    {
      family: "primary",
      work: "W-P",
      horizons: [{ horizon: 6, positive: 60, actualPositive: 50, reversal: 0.1 }]
    },
    {
      family: "strict",
      work: "W-S",
      horizons: [
        { horizon: 3, positive: 30, actualPositive: 25, reversal: 0.1 },
        { horizon: 6, positive: 60, actualPositive: 50, reversal: 0.2 }
      ]
    }
  ]) {
    for (const item of spec.horizons) {
      const actualReversal = item.actualPositive * 0.1;
      rows.push({
        rowKind: "work",
        evaluationFamily: spec.family,
        standardWorkId: spec.work,
        origin: "2022-12",
        horizonMonths: item.horizon,
        actualPositive: item.actualPositive,
        actualReversal,
        actual: item.actualPositive - actualReversal,
        ablationPositivePoints: { A0: item.positive, A1: item.positive },
        ablationPoints: {
          A0: item.positive * (1 - item.reversal),
          A1: item.positive * (1 - item.reversal)
        },
        reversalRate: item.reversal
      });
      rows.push({
        rowKind: "work_channel",
        evaluationFamily: spec.family,
        standardWorkId: spec.work,
        origin: "2022-12",
        horizonMonths: item.horizon,
        channelUid: "C-OBS",
        observedAtOrigin: true,
        actualPositive: item.actualPositive - 5,
        actualReversal,
        actual: item.actualPositive - 5 - actualReversal,
        ablationPositivePoints: { A1: item.positive },
        ablationPoints: { A1: item.positive * (1 - item.reversal) }
      });
      rows.push({
        rowKind: "work_channel",
        evaluationFamily: spec.family,
        standardWorkId: spec.work,
        origin: "2022-12",
        horizonMonths: item.horizon,
        channelUid: "C-FUTURE",
        observedAtOrigin: false,
        actualPositive: 5,
        actualReversal: 0,
        actual: 5,
        ablationPositivePoints: { A1: 0 },
        ablationPoints: { A1: 0 }
      });
    }
  }
  return rows;
}

function packedG0Row() {
  return {
    evaluationFamily: "strict",
    standardWorkId: "W-S",
    channelUid: "C-OBS",
    origin: "2022-12",
    mechanism: "membership",
    observedAtOrigin: true,
    features: Object.fromEntries(
      config.featureOrder.map((field) => [field, 0])
    ),
    futureMonthlyLabels: Array.from({ length: 6 }, (_, index) => ({
      futureMonthIndex: index + 1,
      futureMonth: `2023-${String(index + 1).padStart(2, "0")}`,
      labelAvailableAsOf: `2023-${String(index + 1).padStart(2, "0")}`,
      actualPositive: 1,
      actualReversal: 0,
      actual: 1,
      includedHorizons: index < 3 ? [3, 6] : [6]
    }))
  };
}

function monthlyKey(row) {
  return [
    row.standardWorkId,
    row.channelUid,
    row.origin,
    row.futureMonthIndex
  ].join("|");
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
}
