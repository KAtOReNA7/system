import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  assertM2CoreHorizonAmountPublicSafe,
  attachM2TrainingFoldWeights,
  bootstrapM2HorizonAmountSameCase,
  buildM2CoreHorizonAmountFeatureRow,
  coreHorizonCaseKey,
  fitM2CoreHorizonAmountModel,
  intersectM2HorizonAmountRawArmCases,
  pairM2HorizonAmountSameCaseRows,
  predictM2CoreHorizonAmount,
  scoreM2HorizonAmountIndependentTimeBlocks,
  selectM2CoreHorizonAmountHyperparameters,
  signedExpm1,
  signedLog1p,
  summarizeM2Oa03Lg01Attribution,
  validateM2CoreLegacyHorizonAmountConfig
} from "../src/domain/m2Current/coreLegacyHorizonAmount.js";
import {
  classifyM2CoreHorizonAmountFailure,
  runM2CoreLegacyHorizonAmountPublicDiagnostic,
  validateM2CoreHorizonAmountRecoveryPolicy
} from "../scripts/m2-current/core_legacy_horizon_amount_mode.mjs";

const root = path.resolve(import.meta.dirname, "..");
const config = JSON.parse(await readFile(path.join(
  root,
  "config",
  "m2-current-core-legacy-horizon-amount.v0.1.json"
), "utf8"));
const recoveryPolicy = JSON.parse(await readFile(path.join(
  root,
  "config",
  "m2-current-core-legacy-horizon-amount-recovery.v0.1.json"
), "utf8"));

test("CHAM01 preregistration freezes scope, B0-B3 and no promotion", () => {
  const validation = validateM2CoreLegacyHorizonAmountConfig(config);
  assert.equal(validation.valid, true);
  assert.equal(validation.modelId, "M2-WORK-CHAM01");
  assert.equal(
    validation.experimentId,
    "M2-EXP-CORE-HORIZON-AMOUNT-01"
  );
  assert.deepEqual(config.scope.horizonsMonths, [3, 6, 12]);
  assert.equal(config.scope.primaryPopulationId, "CORE80");
  assert.equal(config.scope.sensitivityPopulationId, "CORE90");
  assert.equal(config.scope.hardCoreOnlyTrainingAllowed, false);
  assert.deepEqual(
    config.arms.map((arm) => arm.armId),
    ["B0", "B1", "B2", "B3"]
  );
  assert.deepEqual(config.training.grid, {
    huberDelta: [1, 1.5],
    l2: [0.1, 1, 10]
  });
  assert.equal(config.authorization.channelAllocation, false);
  assert.equal(config.authorization.thirtySixMonth, false);
  assert.equal(config.authorization.production, false);
  assert.equal(config.authorization.automation, false);
  assert.equal(config.authorization.pullRequestMerge, false);
});

test("feature construction is origin-safe and future perturbation invariant", () => {
  const row = caseRow({
    workId: "fixture-work",
    origin: "2022-12",
    horizonMonths: 3,
    actual: 100
  });
  const history = monthlyHistory("2021-01", 24, (index) => index + 1);
  const baseline = buildM2CoreHorizonAmountFeatureRow({
    row,
    monthlyHistory: history,
    lg01PointEstimate: 90
  });
  const perturbed = buildM2CoreHorizonAmountFeatureRow({
    row,
    monthlyHistory: [
      ...history,
      { month: "2023-01", cash: 999999999 }
    ],
    lg01PointEstimate: 90
  });
  assert.deepEqual(perturbed.features, baseline.features);
  assert.equal(baseline.futureHistoryRowCount, 0);
  assert.equal(perturbed.futureHistoryRowCount, 1);
  assert.equal(baseline.originVisibleOnly, true);
  assert.equal(baseline.features.trailing12Cash, 222);
  assert.equal(baseline.features.trailing6Cash, 129);
});

test("missing windows remain null with indicators rather than becoming zero", () => {
  const row = caseRow({
    workId: "short-history",
    origin: "2022-06",
    horizonMonths: 3,
    actual: 20
  });
  const feature = buildM2CoreHorizonAmountFeatureRow({
    row: {
      ...row,
      observedSalesAgeMonths: 3
    },
    monthlyHistory: monthlyHistory("2022-04", 3, () => 5),
    lg01PointEstimate: null
  });
  assert.equal(feature.features.trailing3Cash, 15);
  assert.equal(feature.features.trailing6Cash, null);
  assert.equal(feature.features.trailing12Cash, null);
  assert.equal(feature.features.trailing6ToPrevious6Ratio, null);
  assert.equal(feature.features.lg01PointEstimate, null);
});

test("signed amount transform is reversible and preserves negative actuals", () => {
  for (const value of [-100000, -1, 0, 1, 100000]) {
    assert.ok(Math.abs(signedExpm1(signedLog1p(value)) - value) < 1e-8);
  }
});

test("B2 and B3 weights use only train-fold origin-visible percentiles", () => {
  const rows = [
    featureFixture("w1", "2022-01", 3, 10, 1),
    featureFixture("w2", "2022-01", 3, 20, 2),
    featureFixture("w3", "2022-01", 3, 30, 3),
    featureFixture("w4", "2022-01", 3, 40, 4),
    featureFixture("w5", "2022-04", 3, 1000, 5)
  ];
  const weighted = attachM2TrainingFoldWeights(rows, "B2");
  const firstOrigin = weighted.filter((row) => row.origin === "2022-01");
  assert.deepEqual(
    firstOrigin.map((row) => row.trainingWeightPercentile),
    [0, 1 / 3, 2 / 3, 1]
  );
  assert.equal(
    firstOrigin.every((row, index) => (
      Math.abs(
        row.trainingWeight
          - (1 + 3 * [0, 1 / 3, 2 / 3, 1][index] ** 2)
      ) < 1e-12
    )),
    true
  );
  assert.equal(weighted.at(-1).trainingWeight, 4);
  assert.equal(
    weighted.every(
      (row) => row.trainingWeight >= 1 && row.trainingWeight <= 4
    ),
    true
  );
});

test("3, 6 and 12 month states are independently fitted and not reusable", () => {
  const syntheticConfig = relaxedConfig();
  const three = trainingFixtures(3, 1);
  const twelve = trainingFixtures(12, 8);
  const state3 = fitM2CoreHorizonAmountModel(three, {
    armId: "B1",
    huberDelta: 1,
    l2: 1,
    config: syntheticConfig
  });
  const state12 = fitM2CoreHorizonAmountModel(twelve, {
    armId: "B1",
    huberDelta: 1,
    l2: 1,
    config: syntheticConfig
  });
  assert.equal(state3.horizonMonths, 3);
  assert.equal(state12.horizonMonths, 12);
  assert.notDeepEqual(state3.coefficients, state12.coefficients);
  assert.throws(
    () => predictM2CoreHorizonAmount(twelve.at(-1), state3),
    /cross_horizon_state_use/u
  );
  const prediction = predictM2CoreHorizonAmount(three.at(-1), state3);
  assert.equal(prediction.nativeAmountPrediction, true);
  assert.equal(prediction.selectedFallbackApplied, false);
  assert.equal(prediction.rawCandidatePreserved, true);
});

test("inner rolling selection reads only earlier matured labels", () => {
  const syntheticConfig = relaxedConfig();
  const rows = trainingFixtures(3, 2, 8);
  const selection = selectM2CoreHorizonAmountHyperparameters({
    rows,
    outerOrigin: "2023-01",
    armId: "B2",
    config: syntheticConfig
  });
  assert.equal(
    selection.status,
    "SELECTED_ON_EARLIER_MATURE_INNER_ORIGINS"
  );
  assert.equal(selection.outerOutcomeRead, false);
  assert.equal(
    selection.candidates.every((candidate) => (
      candidate.audits.every(
        (audit) => audit.maximumTrainingLabelAvailableAsOf <= audit.innerOrigin
      )
    )),
    true
  );
  assert.deepEqual(
    [
      selection.selected.huberDelta,
      selection.selected.l2
    ].every(Number.isFinite),
    true
  );
});

test("same-case pairing rejects actual mismatch and never invents null as zero", () => {
  const candidate = predictionFixture({
    workId: "work-a",
    origin: "2022-01",
    horizonMonths: 3,
    actual: 10,
    pointEstimate: 9,
    armId: "B1"
  });
  const baseline = {
    ...candidate,
    modelId: "M2-WORK-LG01",
    pointEstimate: 8
  };
  const paired = pairM2HorizonAmountSameCaseRows([candidate], [baseline]);
  assert.equal(paired.sameCaseCount, 1);
  assert.equal(paired.exactSameCase, true);
  assert.equal(paired.rows[0].actual, 10);
  const mismatch = pairM2HorizonAmountSameCaseRows(
    [candidate],
    [{ ...baseline, actual: 11 }]
  );
  assert.equal(mismatch.sameCaseCount, 0);
  assert.equal(mismatch.actualMismatchCount, 1);
});

test("B1-B3 and frozen B0 are ranked only on one common same-case intersection", () => {
  const baseline = ["a", "b", "c", "d"].map((workId) => ({
    ...predictionFixture({
      workId,
      origin: "2022-01",
      horizonMonths: 3,
      actual: 10,
      pointEstimate: 8,
      armId: "B0"
    }),
    modelId: "M2-WORK-LG01"
  }));
  const byArm = {
    B1: baseline.slice(0, 4).map((row) => ({
      ...row,
      modelId: "M2-WORK-CHAM01",
      armId: "B1"
    })),
    B2: baseline.slice(1, 4).map((row) => ({
      ...row,
      modelId: "M2-WORK-CHAM01",
      armId: "B2"
    })),
    B3: baseline.slice(2, 4).map((row) => ({
      ...row,
      modelId: "M2-WORK-CHAM01",
      armId: "B3"
    }))
  };
  const common = intersectM2HorizonAmountRawArmCases({
    candidateRowsByArm: byArm,
    baselineRows: baseline
  });
  assert.equal(
    common.status,
    "COMMON_RAW_ARMS_AND_B0_SAME_CASE_INTERSECTION"
  );
  assert.equal(common.commonCaseCount, 2);
  assert.deepEqual(common.candidateCaseCounts, {
    B1: 4,
    B2: 3,
    B3: 2
  });
  assert.equal(common.baselineRows.length, 2);
  assert.equal(
    Object.values(common.candidateRowsByArm).every(
      (rows) => rows.length === 2
    ),
    true
  );
  for (const armId of ["B1", "B2", "B3"]) {
    const paired = pairM2HorizonAmountSameCaseRows(
      common.candidateRowsByArm[armId],
      common.baselineRows
    );
    assert.equal(paired.exactSameCase, true);
    assert.equal(paired.sameCaseCount, 2);
  }
});

test("2,000-work bootstrap and non-overlapping blocks replay deterministically", () => {
  const rows = [];
  for (const origin of ["2022-01", "2022-07", "2023-01", "2023-07"]) {
    for (let work = 0; work < 12; work += 1) {
      rows.push({
        standardWorkId: `work-${work}`,
        origin,
        horizonMonths: 6,
        actual: 100 + work,
        candidatePointEstimate: 95 + work,
        baselinePointEstimate: 85 + work
      });
    }
  }
  const left = bootstrapM2HorizonAmountSameCase(rows, {
    iterations: 2000,
    seed: 17
  });
  const right = bootstrapM2HorizonAmountSameCase(
    [...rows].reverse(),
    { iterations: 2000, seed: 17 }
  );
  assert.deepEqual(right, left);
  assert.equal(left.iterations, 2000);
  const blocks = scoreM2HorizonAmountIndependentTimeBlocks(rows);
  assert.equal(blocks.length, 4);
  assert.equal(
    blocks.every((block) => block.candidateWins === true),
    true
  );
});

test("K1 attribution groups only on origin-visible fields", () => {
  const rows = Array.from({ length: 12 }, (_, index) => {
    const feature = featureFixture(
      `work-${index}`,
      "2022-01",
      3,
      10 + index,
      index + 1
    );
    return {
      ...feature,
      evaluationFamily: "STRICT_ROLLING",
      populationId: "CORE80",
      oa03PointEstimate: 80,
      lg01PointEstimate: 95,
      oa03Error: -20,
      lg01Error: -5,
      oa03AbsoluteError: 20,
      lg01AbsoluteError: 5,
      actual: 100
    };
  });
  const summary = summarizeM2Oa03Lg01Attribution(rows);
  assert.equal(
    summary.status,
    "COMPUTED_ORIGIN_VISIBLE_SAME_CASE_ATTRIBUTION"
  );
  assert.equal(summary.futureOutcomeUsedForGrouping, false);
  assert.equal(summary.systematicUnderpredictionShare, 1);
  assert.equal(
    summary.dimensions.some(
      (item) => item.dimension === "trailing12_origin_percentile"
    ),
    true
  );
});

test("public contract is portable and aggregate payload guard blocks identities", () => {
  const serialized = JSON.stringify(config);
  assert.doesNotMatch(serialized, /[A-Z]:[\\/]/u);
  assert.doesNotMatch(serialized, /\b[0-9a-f]{40}\b/iu);
  assert.equal(assertM2CoreHorizonAmountPublicSafe({
    status: "M2_CORE_HORIZON_AMOUNT_DEVELOPMENT_FAIL",
    caseCount: 100,
    WAPE: 0.4,
    signedBias: -0.1,
    value: null
  }), true);
  assert.throws(
    () => assertM2CoreHorizonAmountPublicSafe({
      standardWorkId: "forbidden"
    }),
    /public_payload_unsafe/u
  );
});

test("pre-outcome infrastructure failures do not consume the science window", () => {
  assert.deepEqual(
    classifyM2CoreHorizonAmountFailure({
      failureClass: "WIRING",
      completeMetricsProduced: false
    }),
    {
      retryAllowed: true,
      status:
        "INVALIDATED_PRE_OUTCOME_INFRASTRUCTURE_FAILURE_RECOVERY_ALLOWED"
    }
  );
  assert.deepEqual(
    classifyM2CoreHorizonAmountFailure({
      failureClass: "CAPABILITY_DIRECTORY",
      completeMetricsProduced: false
    }),
    {
      retryAllowed: true,
      status:
        "INVALIDATED_PRE_OUTCOME_INFRASTRUCTURE_FAILURE_RECOVERY_ALLOWED"
    }
  );
});

test("first complete outcome and contract changes block recovery", () => {
  assert.deepEqual(
    classifyM2CoreHorizonAmountFailure({
      failureClass: "SERIALIZATION",
      completeMetricsProduced: true
    }),
    {
      retryAllowed: false,
      status:
        "FIRST_VALID_COMPLETE_OUTCOME_BOUNDARY_REACHED_RETRY_NOT_ALLOWED"
    }
  );
  assert.deepEqual(
    classifyM2CoreHorizonAmountFailure({
      failureClass: "CONTRACT_CHANGE",
      completeMetricsProduced: false,
      scientificContractChanged: true
    }),
    {
      retryAllowed: false,
      status: "BLOCKED_RECOVERY_BOUNDARY_RETRY_NOT_ALLOWED"
    }
  );
  const validation = validateM2CoreHorizonAmountRecoveryPolicy({
    recoveryPolicy,
    scientificConfig: config
  });
  const changed = structuredClone(config);
  changed.training.grid.l2.push(100);
  assert.throws(
    () => validateM2CoreHorizonAmountRecoveryPolicy({
      recoveryPolicy,
      scientificConfig: changed,
      expectedScientificContractDigest:
        validation.scientificContractDigest
    }),
    /scientific_contract_changed/u
  );
});

test("canonical dispatcher exposes diagnostics, recovery smoke and restricted execution", async () => {
  const packageJson = JSON.parse(await readFile(path.join(
    root,
    "package.json"
  ), "utf8"));
  assert.match(
    packageJson.scripts["diagnose:m2:core-legacy-horizon-amount"],
    /--core-legacy-horizon-amount-public$/u
  );
  assert.match(
    packageJson.scripts["develop:m2:current:core-legacy-horizon-amount"],
    /--core-legacy-horizon-amount$/u
  );
  assert.match(
    packageJson.scripts[
      "smoke:m2:current:core-legacy-horizon-amount-recovery"
    ],
    /--core-legacy-horizon-amount --synthetic-recovery-smoke$/u
  );
  assert.match(
    packageJson.scripts["verify:m2:current"],
    /--core-legacy-horizon-amount-public --verify/u
  );
  const privateRunnerSource = await readFile(path.join(
    root,
    "scripts",
    "m2-current",
    "core_legacy_horizon_amount_mode.mjs"
  ), "utf8");
  assert.match(
    privateRunnerSource,
    /const featureMonthlyRowsForOrigin = \(origin\) =>/u
  );
  assert.match(
    privateRunnerSource,
    /buildCoreLegacyWorkCases\(\{[\s\S]*?featureMonthlyRowsForOrigin,/u
  );
  assert.match(
    privateRunnerSource,
    /"--capability-id",\s+CAPABILITY_ID/u
  );
  assert.doesNotMatch(
    privateRunnerSource,
    /m2_core_horizon_amount_retry_exhausted/u
  );
  assert.doesNotMatch(
    privateRunnerSource,
    /\bfeatureRowsForOrigin\b/u
  );
  const diagnostic = await runM2CoreLegacyHorizonAmountPublicDiagnostic({
    root,
    verify: true
  });
  assert.equal([
    "M2_CORE_HORIZON_AMOUNT_PUBLIC_IMPLEMENTATION_READY_"
      + "RECOVERY_AUTHORIZED_AWAITING_R0",
    "M2_CORE_HORIZON_AMOUNT_PUBLIC_RECOVERY_READY_R0_PASS",
    "M2_CORE_HORIZON_AMOUNT_PUBLIC_RESULT_VALID"
  ].includes(diagnostic.status), true);
  assert.equal(diagnostic.privateSourceReadByDiagnostic, false);
  assert.equal(
    diagnostic.privateEvaluationPerformed,
    diagnostic.status === "M2_CORE_HORIZON_AMOUNT_PUBLIC_RESULT_VALID"
  );
  assert.equal(diagnostic.privateExecutionAttempted, true);
  assert.equal(diagnostic.historicalExecutionClosureOnly, true);
  assert.equal(
    diagnostic.recoveryBoundaryId,
    "FIRST_VALID_COMPLETE_OUTCOME_BOUNDARY"
  );
  assert.equal(
    diagnostic.privateExecutionClosureStatus,
    "M2_CORE_HORIZON_AMOUNT_PRIVATE_EXECUTION_"
      + "INVALIDATED_RETRY_EXHAUSTED"
  );
  assert.equal(diagnostic.originSafeFeatureProof, true);
  assert.equal(diagnostic.horizonParameterIsolationProof, true);
  assert.equal(diagnostic.deterministicBootstrap2000Proof, true);
});

function relaxedConfig() {
  const value = structuredClone(config);
  value.rolling.minimumTrainingRows = 4;
  value.rolling.minimumTrainingWorks = 2;
  value.rolling.minimumInnerValidationOrigins = 2;
  value.training.maximumIrlsIterations = 8;
  return value;
}

function trainingFixtures(horizonMonths, multiplier, originCount = 6) {
  const origins = Array.from(
    { length: originCount },
    (_, index) => `${2021 + Math.floor(index / 4)}-${
      String(index % 4 * 3 + 1).padStart(2, "0")
    }`
  );
  return origins.flatMap((origin, originIndex) => (
    Array.from({ length: 5 }, (_, workIndex) => {
      const trailing12 = 20 + originIndex * 5 + workIndex;
      return featureFixture(
        `work-${workIndex}`,
        origin,
        horizonMonths,
        trailing12,
        multiplier * trailing12 + originIndex
      );
    })
  )).map((row) => ({
    ...row,
    labelAvailableAsOf: row.origin
  }));
}

function featureFixture(
  workId,
  origin,
  horizonMonths,
  trailing12Cash,
  actual
) {
  const row = caseRow({ workId, origin, horizonMonths, actual });
  return buildM2CoreHorizonAmountFeatureRow({
    row,
    monthlyHistory: monthlyHistory(
      addMonths(origin, -11),
      12,
      (index) => trailing12Cash / 12 + index / 100
    ),
    lg01PointEstimate: Math.max(0, actual * 0.9)
  });
}

function predictionFixture({
  workId,
  origin,
  horizonMonths,
  actual,
  pointEstimate,
  armId
}) {
  return {
    evaluationFamily: "STRICT_ROLLING",
    populationId: "CORE80",
    modelId: "M2-WORK-CHAM01",
    armId,
    standardWorkId: workId,
    origin,
    horizonMonths,
    actual,
    pointEstimate,
    nativeAmountPrediction: true,
    selectedFallbackApplied: false,
    caseKey: coreHorizonCaseKey({
      standardWorkId: workId,
      origin,
      horizonMonths
    })
  };
}

function caseRow({ workId, origin, horizonMonths, actual }) {
  return {
    standardWorkId: workId,
    origin,
    horizonMonths,
    labelAvailableAsOf: addMonths(origin, horizonMonths),
    actual,
    observedSalesAgeMonths: 24,
    eligibleChannelCount: 2,
    core80: true,
    core90: true,
    referenceRank: 1,
    referenceRevenue: 100,
    revenueDecile: 1
  };
}

function monthlyHistory(start, count, valueOf) {
  return Array.from({ length: count }, (_, index) => ({
    month: addMonths(start, index),
    cash: valueOf(index)
  }));
}

function addMonths(month, offset) {
  const [year, value] = month.split("-").map(Number);
  const serial = year * 12 + value - 1 + offset;
  return `${Math.floor(serial / 12)}-${
    String(serial % 12 + 1).padStart(2, "0")
  }`;
}
