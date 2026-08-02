import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  M2Psc03ContractError,
  M2Psc03NumericalError,
  M2Psc03OccurrenceProjectionBuilder,
  M2_PSC03_ARMS,
  buildM2Psc03SyntheticDiagnostic,
  crossFitM2Psc03Arm,
  evaluateM2Psc03QuasiObjective,
  fitM2Psc03AmountHierarchy,
  fitM2Psc03QuasiLikelihood,
  m2Psc03Binary64Hex,
  m2Psc03CaseBalancedWeights,
  m2Psc03MonthlyKey,
  predictM2Psc03Monthly,
  selectM2Psc03Lambda,
  validateM2Psc03DevelopmentConfig,
  verifyM2Psc03OccurrenceProjection,
  verifyM2Psc03PopulationCoverage
} from "../src/domain/m2Current/publishingScaleDirectCashDevelopment.js";
import {
  validateM2Psc03Preregistration
} from "../src/domain/m2Current/publishingScaleDirectCashPreregistration.js";

const preregistration = json(
  "config/m2-current-publishing-scale-channel-direct-cash-preregistration.v0.1.json"
);
const developmentBase = json(
  "config/m2-current-publishing-scale-channel-direct-cash-development.v0.1.json"
);
const schema = json(
  "config/m2-current-publishing-scale-channel-direct-cash-schema.v0.1.json"
);
const psc01 = json("config/m2-current-publishing-scale-channel.v0.1.json");
const support = json("config/m2-publishing-scale-statistical-support.v1.json");
const businessAcceptance = json("config/m2-business-acceptance-contract.v1.json");
const development = fixtureConfig();
const fixture = syntheticRows();

test("PSC03 preregistration validates before private outcome", () => {
  const result = validateM2Psc03Preregistration({
    preregistration,
    development: developmentBase,
    schema,
    psc01,
    support,
    businessAcceptance
  });
  assert.equal(
    result.status,
    "M2_PSC03_PREREGISTRATION_SEMANTIC_VALIDATION_PASSED"
  );
  assert.equal(result.privateArtifactRead, false);
});

test("PSC03 development contract binds PSC01 and closed boundaries", () => {
  assert.equal(
    validateM2Psc03DevelopmentConfig(developmentBase, psc01, support),
    true
  );
  assert.equal(developmentBase.closedBoundaries.productionReady, false);
  assert.equal(developmentBase.closedBoundaries.activeCandidate, null);
});

test("quasi-Poisson objective gradient matches finite differences", () => {
  finiteDifferenceGradient("POISSON");
});

test("quasi-Poisson Hessian matches finite differences", () => {
  finiteDifferenceHessian("POISSON");
});

test("quasi-Gamma objective, gradient and Hessian are consistent", () => {
  finiteDifferenceGradient("GAMMA");
  finiteDifferenceHessian("GAMMA");
});

test("quasi-Poisson intercept-only optimum is weighted arithmetic mean", () => {
  const fit = interceptOnly("POISSON", [2, 5, 17], [0.2, 0.3, 0.5]);
  assert.ok(Math.abs(Math.exp(fit.coefficients[0]) - 10.4) < 1e-9);
  assert.equal(fit.interceptPenalized, false);
});

test("quasi-Gamma intercept-only optimum is weighted arithmetic mean", () => {
  const fit = interceptOnly("GAMMA", [2, 5, 17], [0.2, 0.3, 0.5]);
  assert.ok(Math.abs(Math.exp(fit.coefficients[0]) - 10.4) < 1e-9);
});

test("unpenalized direct log-link likelihood is equivariant to cash scale", () => {
  const design = [[1, -1], [1, 0], [1, 1], [1, 2]];
  const targets = [2, 4, 8, 16];
  const weights = [0.25, 0.25, 0.25, 0.25];
  const first = fitM2Psc03QuasiLikelihood({
    family: "POISSON",
    design,
    targets,
    weights,
    offsets: [0, 0, 0, 0],
    lambda: 0,
    numerical: development.numerical
  });
  const second = fitM2Psc03QuasiLikelihood({
    family: "POISSON",
    design,
    targets: targets.map((value) => 7 * value),
    weights,
    offsets: [0, 0, 0, 0],
    lambda: 0,
    numerical: development.numerical
  });
  for (const vector of design) {
    const left = Math.exp(dot(vector, first.coefficients));
    const right = Math.exp(dot(vector, second.coefficients));
    assert.ok(Math.abs(right / left - 7) < 1e-8);
  }
});

test("frozen-lambda intercept contract preserves arithmetic cash scale", () => {
  const targets = [2, 4, 8, 16];
  const weights = [0.25, 0.25, 0.25, 0.25];
  const first = interceptOnly("POISSON", targets, weights);
  const second = interceptOnly(
    "POISSON",
    targets.map((value) => value * 7),
    weights
  );
  assert.ok(Math.abs(Math.exp(second.coefficients[0])
    / Math.exp(first.coefficients[0]) - 7) < 1e-9);
});

test("case-balanced weights normalize to one", () => {
  const rows = fixture.primary.slice(0, 7);
  const weights = m2Psc03CaseBalancedWeights(rows);
  assert.ok(Math.abs(weights.reduce((a, b) => a + b, 0) - 1) < 1e-15);
  assert.equal(new Set(weights).size, 1);
});

test("case-balanced weighting rejects duplicate monthly keys", () => {
  const row = fixture.primary[0];
  assert.throws(
    () => m2Psc03CaseBalancedWeights([row, { ...row }]),
    /m2_psc03_weight_duplicate_key/u
  );
});

test("occurrence joins on full key with exact binary64 parity", () => {
  const expected = fixture.primary.slice(0, 8);
  const occurrenceRows = expected.map((row, index) => ({
    ...row,
    occurrenceProbability: 0.125 + index / 64
  }));
  const result = verifyM2Psc03OccurrenceProjection({
    expectedRows: expected,
    occurrenceRows
  });
  for (const row of occurrenceRows) {
    const key = m2Psc03MonthlyKey(row);
    assert.equal(
      result.bitPatterns.get(key),
      m2Psc03Binary64Hex(row.occurrenceProbability)
    );
  }
});

test("occurrence projection rejects source-side duplicates", () => {
  const builder = new M2Psc03OccurrenceProjectionBuilder();
  const row = { ...fixture.primary[0], occurrenceProbability: 0.5 };
  builder.add(row);
  assert.throws(() => builder.add(row), /occurrence_projection_duplicate/u);
});

test("occurrence projection rejects prediction-side duplicates", () => {
  const row = fixture.primary[0];
  assert.throws(
    () => verifyM2Psc03OccurrenceProjection({
      expectedRows: [row, { ...row }],
      occurrenceRows: [{ ...row, occurrenceProbability: 0.5 }]
    }),
    /prediction_population_duplicate/u
  );
});

test("exact population coverage rejects one missing row", () => {
  assert.throws(
    () => verifyM2Psc03PopulationCoverage({
      expectedRows: fixture.primary.slice(0, 5),
      actualRows: fixture.primary.slice(0, 4)
    }),
    /population_not_exact/u
  );
});

test("exact population coverage rejects one extra row", () => {
  assert.throws(
    () => verifyM2Psc03PopulationCoverage({
      expectedRows: fixture.primary.slice(0, 4),
      actualRows: fixture.primary.slice(0, 5)
    }),
    /population_not_exact/u
  );
});

test("global, mechanism and platform child offsets are coefficient-one", () => {
  const state = fitM2Psc03AmountHierarchy(
    fixture.primary,
    development,
    psc01,
    support,
    { arm: "P", lambda: 3 }
  );
  assert.equal(state.global.offsetCoefficient, null);
  assert.equal(state.mechanisms.membership.offsetCoefficient, 1);
  assert.equal(
    state.platforms[psc01.nodes.namedPlatforms[0].channelUid].offsetCoefficient,
    1
  );
});

test("support-insufficient child deterministically uses its parent", () => {
  const state = fitM2Psc03AmountHierarchy(
    fixture.primary,
    development,
    psc01,
    support,
    { arm: "P", lambda: 3 }
  );
  const missevan = psc01.nodes.namedPlatforms.find(
    (row) => row.platformId === "missevan"
  );
  const node = state.platforms[missevan.channelUid];
  assert.equal(node.model, null);
  assert.equal(node.parentNodeId, "transactional");
  assert.match(node.fallbackReason, /support_insufficient/u);
});

test("global numerical failure fails closed without diagnostic switch", () => {
  assert.throws(
    () => fitM2Psc03AmountHierarchy(
      fixture.primary,
      development,
      psc01,
      support,
      { arm: "P", lambda: 3, failureInjection: new Set(["globalPooledParent"]) }
    ),
    M2Psc03NumericalError
  );
});

test("child numerical failure returns only to same-estimator parent with receipt", () => {
  const state = fitM2Psc03AmountHierarchy(
    fixture.primary,
    development,
    psc01,
    support,
    { arm: "P", lambda: 3, failureInjection: new Set(["membership"]) }
  );
  assert.equal(state.mechanisms.membership.model, null);
  assert.match(
    state.mechanisms.membership.fallbackReason,
    /same_estimator_parent_after_numerical_failure/u
  );
  assert.equal(state.estimator, "POISSON");
});

test("solver objective is monotonic and deterministic", () => {
  const args = {
    family: "POISSON",
    design: [[1, -1], [1, 0], [1, 1]],
    targets: [3, 5, 11],
    weights: [1 / 3, 1 / 3, 1 / 3],
    offsets: [0, 0, 0],
    lambda: 3,
    numerical: development.numerical
  };
  const first = fitM2Psc03QuasiLikelihood(args);
  const second = fitM2Psc03QuasiLikelihood(args);
  assert.deepEqual(first.coefficients, second.coefficients);
  assert.ok(first.objectiveHistory.every(
    (value, index, values) => index === 0 || value <= values[index - 1] + 1e-12
  ));
});

test("lambda exact tie chooses the larger regularization", () => {
  const constant = fixture.primary.map((row) => ({
    ...row,
    actualPositive: 10,
    actual: 10,
    features: Object.fromEntries(psc01.featureOrder.map((field) => [field, 0]))
  }));
  const selection = selectM2Psc03Lambda({
    rows: constant,
    config: development,
    psc01Config: psc01,
    support,
    arm: "P",
    selectionFamily: "primary",
    selectionId: "tie"
  });
  assert.equal(selection.selectedLambda, 3);
});

test("nested selection receipt states outer outcome was not used", () => {
  const selection = selectM2Psc03Lambda({
    rows: fixture.primary,
    config: development,
    psc01Config: psc01,
    support,
    arm: "P",
    selectionFamily: "primary",
    selectionId: "no-outer"
  });
  assert.equal(selection.outerOutcomeUsedForSelection, false);
  assert.equal(JSON.stringify(selection).includes("outerActual"), false);
});

test("final eta clip is absent from training objective", () => {
  const result = evaluateM2Psc03QuasiObjective({
    family: "POISSON",
    design: [[1]],
    targets: [1],
    weights: [1],
    offsets: [0],
    coefficients: [31],
    lambda: 1
  });
  assert.ok(Math.abs(result.objective - (Math.exp(31) - 31)) < 1);
  assert.notEqual(result.objective, Math.exp(30) - 30);
});

test("occurrence and horizon application counters begin at exactly one and zero", () => {
  const state = fitM2Psc03AmountHierarchy(
    fixture.primary,
    development,
    psc01,
    support,
    { arm: "P", lambda: 3 }
  );
  const row = fixture.primary[0];
  const prediction = predictM2Psc03Monthly(row, state, 0.625, development, psc01);
  assert.equal(prediction.occurrenceApplicationCount, 1);
  assert.equal(prediction.horizonAggregationCount, 0);
  assert.equal(
    prediction.positivePoint,
    prediction.occurrenceProbability * prediction.conditionalPositiveAmount
  );
});

test("taxonomy mutation cannot change a PSC03 prediction", () => {
  const state = fitM2Psc03AmountHierarchy(
    fixture.primary,
    development,
    psc01,
    support,
    { arm: "P", lambda: 3 }
  );
  const altered = structuredClone(psc01);
  altered.nodes.taxonomy = { frozenTier: "REPORT_ONLY", arbitrary: "changed" };
  const row = fixture.primary[0];
  const first = predictM2Psc03Monthly(row, state, 0.5, development, psc01);
  const second = predictM2Psc03Monthly(row, state, 0.5, development, altered);
  assert.deepEqual(first, second);
  assert.equal(first.taxonomyFeatureUsed, false);
});

test("LG01 is absent from fit, offset and prediction dependencies", () => {
  const source = readFileSync(
    "src/domain/m2Current/publishingScaleDirectCashDevelopment.js",
    "utf8"
  );
  assert.equal(source.includes("M2-WORK-LG01"), false);
  const state = fitM2Psc03AmountHierarchy(
    fixture.primary,
    development,
    psc01,
    support,
    { arm: "P", lambda: 3 }
  );
  assert.equal(state.lg01Dependency, false);
});

test("diagnostic arms cannot replace the sole raw candidate", () => {
  assert.deepEqual(M2_PSC03_ARMS, {
    D0: "ARITHMETIC_HIERARCHY_ONLY",
    D1: "DIRECT_QUASI_GAMMA_HIERARCHY",
    P: "DIRECT_QUASI_POISSON_HIERARCHY"
  });
  assert.equal(preregistration.arms.D0.mayBecomeFallbackCandidate, false);
  assert.equal(preregistration.arms.D1.mayReplacePrimary, false);
  assert.equal(preregistration.arms.P.rawCandidateId, "M2-CHAN-PSC03-RAW");
});

test("binary64 serialization is deterministic across path conventions", () => {
  assert.equal(m2Psc03Binary64Hex(0.1), "3fb999999999999a");
  assert.equal(
    m2Psc03MonthlyKey(fixture.primary[0]).includes("\\"),
    false
  );
});

test("primary outer cross-fit preserves exact prediction coverage", () => {
  const occurrence = occurrenceMap(fixture.primary);
  const result = crossFitM2Psc03Arm({
    rows: fixture.primary,
    occurrence,
    config: development,
    psc01Config: psc01,
    support,
    arm: "D0",
    evaluationFamily: "primary"
  });
  assert.equal(result.predictions.size, fixture.primary.length);
  assert.equal(result.receipts.length, 5);
});

test("full no-private synthetic campaign executes D0, D1 and P", () => {
  const occurrenceRows = [
    ...fixture.primary,
    ...fixture.strict.filter((row) => row.origin === "2022-12")
  ].map((row) => ({
    ...row,
    occurrenceProbability: row.observedAtOrigin ? 0.625 : 0
  }));
  const result = buildM2Psc03SyntheticDiagnostic({
    primaryRows: fixture.primary,
    strictRows: fixture.strict,
    occurrenceRows,
    config: development,
    psc01Config: psc01,
    support
  });
  assert.equal(result.status, "PSC03_PUBLIC_SYNTHETIC_FULL_PATH_PASSED");
  assert.ok(result.arms.P.primaryPredictionCount > 0);
  assert.ok(result.arms.P.strictPredictionCount > 0);
  assert.equal(result.boundaries.privateArtifactRead, false);
});

function finiteDifferenceGradient(family) {
  const args = objectiveArgs(family);
  const analytic = evaluateM2Psc03QuasiObjective(args);
  const epsilon = 1e-6;
  for (let index = 0; index < args.coefficients.length; index += 1) {
    const plus = [...args.coefficients];
    const minus = [...args.coefficients];
    plus[index] += epsilon;
    minus[index] -= epsilon;
    const numerical = (
      evaluateM2Psc03QuasiObjective({ ...args, coefficients: plus }).objective
      - evaluateM2Psc03QuasiObjective({ ...args, coefficients: minus }).objective
    ) / (2 * epsilon);
    assert.ok(Math.abs(numerical - analytic.gradient[index]) < 1e-6);
  }
}

function finiteDifferenceHessian(family) {
  const args = objectiveArgs(family);
  const analytic = evaluateM2Psc03QuasiObjective(args);
  const epsilon = 1e-6;
  for (let column = 0; column < args.coefficients.length; column += 1) {
    const plus = [...args.coefficients];
    const minus = [...args.coefficients];
    plus[column] += epsilon;
    minus[column] -= epsilon;
    const plusGradient = evaluateM2Psc03QuasiObjective({
      ...args,
      coefficients: plus
    }).gradient;
    const minusGradient = evaluateM2Psc03QuasiObjective({
      ...args,
      coefficients: minus
    }).gradient;
    for (let row = 0; row < args.coefficients.length; row += 1) {
      const numerical = (plusGradient[row] - minusGradient[row]) / (2 * epsilon);
      assert.ok(Math.abs(numerical - analytic.hessian[row][column]) < 1e-5);
    }
  }
}

function objectiveArgs(family) {
  return {
    family,
    design: [[1, -0.5], [1, 0.25], [1, 1.25]],
    targets: [2, 7, 11],
    weights: [0.2, 0.3, 0.5],
    offsets: [0.1, -0.2, 0.05],
    coefficients: [0.4, -0.15],
    lambda: 3
  };
}

function interceptOnly(family, targets, weights) {
  return fitM2Psc03QuasiLikelihood({
    family,
    design: targets.map(() => [1]),
    targets,
    weights,
    offsets: targets.map(() => 0),
    lambda: 3,
    numerical: development.numerical
  });
}

function fixtureConfig() {
  const value = structuredClone(developmentBase);
  value.selection.strictOrigins = ["2022-12"];
  return value;
}

function syntheticRows() {
  const primary = [];
  const strict = [];
  const origins = [
    "2021-12", "2022-03", "2022-06", "2022-09", "2022-12"
  ];
  const platformByMechanism = {
    membership: psc01.nodes.namedPlatforms[0],
    advertising: psc01.nodes.namedPlatforms[2],
    transactional: psc01.nodes.namedPlatforms[3]
  };
  for (const [mechanismIndex, mechanism] of [
    "membership", "advertising", "transactional"
  ].entries()) {
    for (let work = 0; work < 30; work += 1) {
      for (const [originIndex, origin] of origins.entries()) {
        for (let month = 1; month <= 2; month += 1) {
          const platform = platformByMechanism[mechanism];
          const amount = month === 2 && work % 11 === 0
            ? 0
            : (mechanismIndex + 1) * (work + 2) * (month + originIndex + 1);
          const row = {
            schema: "m2.current.channel_generative_monthly_row.v0.2",
            actualDefinitionId:
              "M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01",
            labelView: "DEVELOPMENT_MODELABLE_RESTATEMENT_VIEW",
            evaluationFamily: origin === "2022-12" ? "strict" : "primary",
            standardWorkId: `SYN-${mechanism}-${String(work).padStart(2, "0")}`,
            channelUid: platform.channelUid,
            mechanism,
            origin,
            futureMonthIndex: month,
            futureMonth: origin,
            labelAvailableAsOf: origin,
            includedHorizons: [3, 6, 12].filter((horizon) => horizon >= month),
            observedAtOrigin: true,
            features: Object.fromEntries(psc01.featureOrder.map(
              (field, index) => [field, (work + originIndex + month + index) / 50]
            )),
            actualPositive: amount,
            actualReversal: 0,
            actual: amount,
            postingTimeActualPositive: amount,
            postingTimeActualReversal: 0,
            postingTimeActual: amount,
            reversalRateByHorizon: { "3": 0, "6": 0, "12": 0 },
            trainingWeight: 1,
            futureFirstSeenIdentityUsedAsFeature: false,
            unmaturedLabelZeroImputed: false,
            buyoutCashUsed: false
          };
          strict.push({ ...row, evaluationFamily: "strict" });
          if (origin !== "2022-12") primary.push({ ...row, evaluationFamily: "primary" });
        }
      }
    }
  }
  return { primary, strict };
}

function occurrenceMap(rows) {
  return new Map(rows.map((row) => [m2Psc03MonthlyKey(row), 0.625]));
}

function dot(left, right) {
  return left.reduce((total, value, index) => total + value * right[index], 0);
}

function json(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}
