import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  M2_PSC02_ANCHOR_AVAILABLE,
  M2_PSC02_ANCHOR_UNAVAILABLE,
  aggregateM2Psc02HorizonReference,
  assertM2Psc02OccurrenceParity,
  buildM2Psc02OriginVisibleCashAnchor,
  canonicalM2Psc02AnchorInputDigest,
  fitM2Psc02AnchoredGammaOffsetReference,
  fitM2Psc02AnchoredLogRatioRidgeReference,
  m2Psc02ReferenceArmIds,
  predictM2Psc02MonthlyReference,
  predictM2Psc02ResidualReference,
  validateM2Psc02Preregistration
} from "../src/domain/m2Current/publishingScaleCashAnchorPreregistration.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = await readJson(
  "config/m2-current-publishing-scale-channel-origin-visible-cash-anchor-preregistration.v0.1.json"
);
const psc01Config = await readJson(
  "config/m2-current-publishing-scale-channel.v0.1.json"
);
const baseConfig = await readJson("config/m2-current-human-anchored.v0.1.json");
const evaluationContract = await readJson("config/m2-evaluation-contract.v2.2.json");
const businessAcceptanceContract = await readJson(
  "config/m2-business-acceptance-contract.v1.json"
);
const armIds = m2Psc02ReferenceArmIds();

test("PSC02 preregistration binds frozen PSC01 occurrence and current evaluation authorities", () => {
  assert.equal(validateM2Psc02Preregistration(config, {
    psc01Config,
    baseConfig,
    evaluationContract,
    businessAcceptanceContract
  }), true);
  assert.equal(config.modelId, null);
  assert.equal(config.identityBoundary.activeCandidate, null);
  assert.equal(config.identityBoundary.approvedForAutomation, null);
  assert.equal(config.identityBoundary.productionReady, false);
  assert.equal(config.identityBoundary.finalHoldoutOpened, false);
});

test("PSC02 preregistration rejects any frozen occurrence algorithm drift", () => {
  const drifted = structuredClone(config);
  drifted.occurrenceFreeze.algorithm = "DIFFERENT_OCCURRENCE_ALGORITHM";
  assert.throws(() => validateM2Psc02Preregistration(drifted, {
    psc01Config,
    baseConfig,
    evaluationContract,
    businessAcceptanceContract
  }), /occurrence_algorithm/u);
});

test("cash scaling by k scales the anchor and monthly prediction by k", () => {
  const rows = targetRows([10, 20, 30]);
  const scaledRows = rows.map((row) => ({...row, positiveCash: row.positiveCash * 7}));
  const anchor = buildAnchor(rows);
  const scaledAnchor = buildAnchor(scaledRows);
  const prediction = predictM2Psc02MonthlyReference({
    armId: armIds.D0,
    occurrenceProbability: 0.4,
    anchor,
    residualLogMultiplier: 0
  });
  const scaledPrediction = predictM2Psc02MonthlyReference({
    armId: armIds.D0,
    occurrenceProbability: 0.4,
    anchor: scaledAnchor,
    residualLogMultiplier: 0
  });
  assert.equal(scaledAnchor.value, anchor.value * 7);
  assert.equal(scaledPrediction.positivePoint, prediction.positivePoint * 7);
  const training = [
    referenceFitRow("w1", 20, 10, [-1]),
    referenceFitRow("w2", 20, 20, [0]),
    referenceFitRow("w3", 20, 30, [1])
  ];
  const scaledTraining = training.map((row) => ({
    ...row,
    anchor: row.anchor * 7,
    actualPositive: row.actualPositive * 7
  }));
  const primary = fitM2Psc02AnchoredGammaOffsetReference(training);
  const scaledPrimary = fitM2Psc02AnchoredGammaOffsetReference(scaledTraining);
  const residual = predictM2Psc02ResidualReference(primary, [0.5]);
  const scaledResidual = predictM2Psc02ResidualReference(
    scaledPrimary,
    [0.5]
  );
  assert.ok(Math.abs(residual - scaledResidual) < 1e-12);
  const primaryPrediction = predictM2Psc02MonthlyReference({
    armId: armIds.P,
    occurrenceProbability: 0.4,
    anchor,
    residualLogMultiplier: residual
  });
  const scaledPrimaryPrediction = predictM2Psc02MonthlyReference({
    armId: armIds.P,
    occurrenceProbability: 0.4,
    anchor: scaledAnchor,
    residualLogMultiplier: scaledResidual
  });
  assert.ok(Math.abs(
    scaledPrimaryPrediction.positivePoint
      - primaryPrediction.positivePoint * 7
  ) < 1e-10);
});

test("constant positive cash recovers the arithmetic cash scale", () => {
  const anchor = buildAnchor(targetRows([42, 42, 42]));
  assert.equal(anchor.value, 42);
  const state = fitM2Psc02AnchoredGammaOffsetReference([
    referenceFitRow("w1", 42, 42, [0]),
    referenceFitRow("w2", 42, 42, [1]),
    referenceFitRow("w3", 42, 42, [2])
  ]);
  assert.equal(state.status, "CONVERGED");
  const residual = predictM2Psc02ResidualReference(state, [1]);
  assert.ok(Math.abs(residual) < 1e-12);
  const prediction = predictM2Psc02MonthlyReference({
    armId: armIds.P,
    occurrenceProbability: 1,
    anchor: 42,
    residualLogMultiplier: residual
  });
  assert.ok(Math.abs(prediction.conditionalPositiveAmount - 42) < 1e-10);
});

test("a high cash observation stays on the arithmetic scale instead of a geometric center", () => {
  const anchor = buildAnchor(targetRows([1, 1, 1000]));
  assert.equal(anchor.value, 334);
  assert.ok(anchor.value > Math.exp((Math.log(1) + Math.log(1) + Math.log(1000)) / 3) * 30);
});

test("post-origin rows and revisions cannot change a past-origin anchor", () => {
  const rows = targetRows([10, 20, 30]);
  const futureRevision = {
    ...rows[2],
    revisionId: "r-future",
    positiveCash: 3000,
    effectiveAt: "2024-12-20T00:00:00+08:00",
    availableAt: "2025-01-02T00:00:00+08:00"
  };
  const futureMonth = makeRow({
    cashMonth: "2025-01",
    positiveCash: 9000,
    revisionId: "r-2025-01",
    effectiveAt: "2025-01-10T00:00:00+08:00",
    availableAt: "2025-01-10T00:00:00+08:00"
  });
  assert.deepEqual(
    buildAnchor([...rows, futureRevision, futureMonth]),
    buildAnchor(rows)
  );
});

test("latest visible revision is selected by instant rather than timezone text", () => {
  const rows = targetRows([10, 20, 30]);
  rows[2] = {
    ...rows[2],
    revisionId: "r-older-instant",
    availableAt: "2024-12-20T23:00:00+08:00"
  };
  const laterRevision = {
    ...rows[2],
    revisionId: "r-later-instant",
    positiveCash: 90,
    availableAt: "2024-12-20T15:30:00Z"
  };
  const anchor = buildAnchor([laterRevision, ...rows]);
  assert.equal(anchor.value, 40);
  assert.deepEqual(buildAnchor([...rows, laterRevision]), anchor);
});

test("frozen PSC01 occurrence is bit-for-bit identical and passed through unchanged", () => {
  const probability = 0.12345678901234566;
  assert.equal(assertM2Psc02OccurrenceParity(
    [{caseKey: "a", occurrenceProbability: probability}],
    [{caseKey: "a", occurrenceProbability: probability}]
  ), true);
  assert.throws(() => assertM2Psc02OccurrenceParity(
    [{caseKey: "a", occurrenceProbability: probability}],
    [{caseKey: "a", occurrenceProbability: probability + Number.EPSILON}]
  ), /occurrence_parity_failed/u);
  const prediction = predictM2Psc02MonthlyReference({
    armId: armIds.P,
    occurrenceProbability: probability,
    anchor: 100,
    residualLogMultiplier: 0
  });
  assert.ok(Object.is(prediction.occurrenceProbability, probability));
});

test("occurrence probability is multiplied exactly once", () => {
  const prediction = predictM2Psc02MonthlyReference({
    armId: armIds.P,
    occurrenceProbability: 0.25,
    anchor: 100,
    residualLogMultiplier: 0
  });
  assert.equal(prediction.positivePoint, 25);
  assert.equal(prediction.occurrenceMultiplyCount, 1);
});

test("the anchor offset is applied exactly once", () => {
  const prediction = predictM2Psc02MonthlyReference({
    armId: armIds.P,
    occurrenceProbability: 1,
    anchor: 100,
    residualLogMultiplier: Math.log(2)
  });
  assert.ok(Math.abs(prediction.positivePoint - 200) < 1e-12);
  assert.equal(prediction.anchorApplyCount, 1);
});

test("monthly predictions are summed into a horizon exactly once", () => {
  const monthly = [1, 2, 3].map((futureMonthIndex) => ({
    futureMonthIndex,
    ...predictM2Psc02MonthlyReference({
      armId: armIds.D0,
      occurrenceProbability: 0.5,
      anchor: 20,
      residualLogMultiplier: 0
    })
  }));
  const horizon = aggregateM2Psc02HorizonReference(monthly, 3);
  assert.equal(horizon.positivePoint, 30);
  assert.equal(horizon.monthlyRowCount, 3);
});

test("cold start abstains and every anchor fallback is deterministic and finite", () => {
  const cases = [
    ["WORK_CHANNEL", targetRows([10, 20, 30])],
    ["WORK_MECHANISM", workMechanismFallbackRows()],
    ["WORK", workFallbackRows()],
    ["CHANNEL_POOL", channelPoolFallbackRows()],
    ["MECHANISM_POOL", mechanismPoolFallbackRows()],
    ["GLOBAL_POOL", globalPoolFallbackRows()]
  ];
  for (const [expectedLevel, rows] of cases) {
    const first = buildAnchor(rows);
    const second = buildAnchor([...rows].reverse());
    assert.equal(first.status, M2_PSC02_ANCHOR_AVAILABLE);
    assert.equal(first.level, expectedLevel);
    assert.ok(Number.isFinite(first.value));
    assert.ok(first.value > 0);
    assert.deepEqual(second, first);
  }
  const cold = buildM2Psc02OriginVisibleCashAnchor(
    targetRows([10, 20, 30]),
    anchorQuery({originObservedPositiveChannel: false}),
    config
  );
  assert.equal(cold.status, M2_PSC02_ANCHOR_UNAVAILABLE);
  assert.equal(cold.value, null);
  const prediction = predictM2Psc02MonthlyReference({
    armId: armIds.P,
    occurrenceProbability: 0.3,
    anchor: cold,
    residualLogMultiplier: 0
  });
  assert.equal(prediction.positivePoint, null);
  assert.equal(prediction.abstained, true);
});

test("zero cash, reversal cash, and as-of restatement retain the positive target contract", () => {
  const original = targetRows([10, 20, 30]);
  const zero = makeRow({
    cashMonth: "2024-09",
    positiveCash: 0,
    reversalCash: -500,
    excludedUnallocatedReversalResidual: -25,
    revisionId: "r-zero"
  });
  const visibleRevision = {
    ...original[2],
    revisionId: "r-visible-restatement",
    positiveCash: 60,
    reversalCash: -40,
    availableAt: "2024-12-25T00:00:00+08:00"
  };
  const anchor = buildAnchor([...original, zero, visibleRevision]);
  assert.equal(anchor.value, 30);
  assert.equal(anchor.support.positiveObservationCount, 3);
  assert.equal(anchor.evaluationActualUsed, false);
});

test("taxonomy changes do not alter the anchor or prediction", () => {
  const rows = targetRows([10, 20, 30]);
  const changed = rows.map((row, index) => ({
    ...row,
    taxonomyLevel1: "changed",
    taxonomyLevel2: `changed-${index}`
  }));
  const left = buildAnchor(rows);
  const right = buildAnchor(changed);
  assert.deepEqual(right, left);
  assert.equal(config.amountDesign.taxonomy, "REPORT_ONLY");
  assert.equal(config.amountDesign.taxonomyUsedByFeature, false);
});

test("LG01 predictions are absent from allowed model inputs", () => {
  assert.equal(
    config.dependencyBoundary.allowedModelInputs.some((value) => /LG01/u.test(value)),
    false
  );
  assert.ok(config.dependencyBoundary.forbiddenModelInputs.includes("LG01_PREDICTION"));
  const predictionWithoutLg01 = predictM2Psc02MonthlyReference({
    armId: armIds.P,
    occurrenceProbability: 0.5,
    anchor: 20,
    residualLogMultiplier: 0.1
  });
  assert.ok(Number.isFinite(predictionWithoutLg01.positivePoint));
});

test("quasi-Gamma primary design is distinguishable from the log-ratio ridge diagnostic", () => {
  const training = [
    referenceFitRow("w1", 10, 1, [-2]),
    referenceFitRow("w2", 10, 2, [-1]),
    referenceFitRow("w3", 10, 10, [0]),
    referenceFitRow("w4", 10, 100, [1]),
    referenceFitRow("w5", 10, 1000, [2])
  ];
  const gamma = fitM2Psc02AnchoredGammaOffsetReference(training, {lambda: 1});
  const logRatio = fitM2Psc02AnchoredLogRatioRidgeReference(training, {lambda: 1});
  assert.equal(gamma.status, "CONVERGED");
  assert.equal(logRatio.status, "CONVERGED");
  const gammaResidual = predictM2Psc02ResidualReference(gamma, [2]);
  const logResidual = predictM2Psc02ResidualReference(logRatio, [2]);
  assert.ok(Math.abs(gammaResidual - logResidual) > 0.05);
});

test("input order changes neither anchor output nor canonical input digest", () => {
  const rows = [...targetRows([10, 20, 30]), ...poolRows({
    channelUid: "other-channel",
    mechanism: "advertising"
  })];
  const reversed = [...rows].reverse();
  assert.deepEqual(buildAnchor(rows), buildAnchor(reversed));
  assert.equal(
    canonicalM2Psc02AnchorInputDigest(rows, "2024-12", config),
    canonicalM2Psc02AnchorInputDigest(reversed, "2024-12", config)
  );
});

function buildAnchor(rows) {
  return buildM2Psc02OriginVisibleCashAnchor(
    rows,
    anchorQuery(),
    config
  );
}

function anchorQuery(overrides = {}) {
  return {
    origin: "2024-12",
    standardWorkId: "target-work",
    channelUid: "target-channel",
    mechanism: "membership",
    originObservedPositiveChannel: true,
    ...overrides
  };
}

function targetRows(amounts) {
  return ["2024-10", "2024-11", "2024-12"].map((cashMonth, index) => (
    makeRow({cashMonth, positiveCash: amounts[index], revisionId: `r-${index}`})
  ));
}

function workMechanismFallbackRows() {
  return [
    makeRow({cashMonth: "2024-12", positiveCash: 10}),
    ...["2024-10", "2024-11", "2024-12"].map((cashMonth, index) => makeRow({
      cashMonth,
      channelUid: "second-membership-channel",
      positiveCash: 20 + index,
      revisionId: `wm-${index}`
    }))
  ];
}

function workFallbackRows() {
  return [
    makeRow({cashMonth: "2024-12", positiveCash: 10}),
    ...["2024-10", "2024-11", "2024-12"].map((cashMonth, index) => makeRow({
      cashMonth,
      channelUid: "advertising-channel",
      mechanism: "advertising",
      positiveCash: 30 + index,
      revisionId: `w-${index}`
    }))
  ];
}

function channelPoolFallbackRows() {
  return [
    makeRow({cashMonth: "2024-12", positiveCash: 10}),
    ...poolRows({channelUid: "target-channel", mechanism: "advertising"})
  ];
}

function mechanismPoolFallbackRows() {
  return [
    makeRow({cashMonth: "2024-12", positiveCash: 10}),
    ...poolRows({channelUid: "pooled-channel", mechanism: "membership"})
  ];
}

function globalPoolFallbackRows() {
  return [
    makeRow({cashMonth: "2024-12", positiveCash: 10}),
    ...poolRows({channelUid: "pooled-channel", mechanism: "advertising"})
  ];
}

function poolRows({channelUid, mechanism}) {
  return Array.from({length: 8}, (_, index) => makeRow({
    standardWorkId: `pool-work-${index}`,
    channelUid: `${channelUid}-${index}`.replace(/target-channel-\d+/u, "target-channel"),
    mechanism,
    cashMonth: "2024-12",
    positiveCash: 100 + index,
    revisionId: `pool-${index}`
  }));
}

function makeRow(overrides = {}) {
  const cashMonth = overrides.cashMonth ?? "2024-12";
  return {
    standardWorkId: "target-work",
    channelUid: "target-channel",
    mechanism: "membership",
    cashMonth,
    cashCategory: "sales_share",
    currency: "CNY",
    effectiveAt: `${cashMonth}-10T00:00:00+08:00`,
    availableAt: `${cashMonth}-15T00:00:00+08:00`,
    revisionId: `r-${cashMonth}`,
    positiveCash: 0,
    reversalCash: 0,
    excludedUnallocatedReversalResidual: 0,
    ...overrides
  };
}

function referenceFitRow(standardWorkId, anchor, actualPositive, features) {
  return {standardWorkId, anchor, actualPositive, features};
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
}
