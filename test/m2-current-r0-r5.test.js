import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildM2CurrentAutomatedBaselineEvaluation,
  buildM2CurrentHistoryFeatures
} from "../src/domain/m2Current/baselines.js";
import {
  buildM2CurrentContract
} from "../src/domain/m2Current/contract.js";
import {
  buildM2CurrentDenseOriginSchedule,
  partitionM2CurrentLabels,
  validateM2CurrentCommitmentSnapshot
} from "../src/domain/m2Current/dataContract.js";
import {
  reconcileM2CurrentMinT
} from "../src/domain/m2Current/hierarchy.js";
import {
  scoreM2CurrentProbabilisticRows
} from "../src/domain/m2Current/metrics.js";
import {
  fitM2CurrentGlobalModel
} from "../src/domain/m2Current/models.js";
import {
  attachM2CurrentConformalQuantiles
} from "../src/domain/m2Current/probabilistic.js";

const config = readJson("config/m2-current.v0.4.json");
const contract = buildM2CurrentContract(config);

test("v0.4 permits exact replay but closes further new-family scope", () => {
  assert.equal(contract.schema, "m2.current.config.v0.4");
  assert.equal(contract.authorizations.modelTraining, true);
  assert.equal(contract.authorizations.newCandidateFamilyDevelopment, false);
  assert.equal(contract.authorizations.provider, false);
  assert.equal(contract.authorizations.database, false);
  assert.equal(contract.authorizations.holdout, false);
  assert.equal(contract.authorizations.release, false);
  assert.equal(contract.evaluationPolicy.businessSampleRequired, false);
  assert.equal(contract.businessSample, null);
  assert.ok(
    contract.evaluationPolicy.automatedComparators.includes("Croston")
  );
});

test("dense schedule is monthly and censors cells beyond label availability", () => {
  const schedule = buildM2CurrentDenseOriginSchedule({
    firstOrigin: "2022-01",
    lastOrigin: "2022-03",
    stepMonths: 1,
    horizons: [3, 6],
    labelAvailableThrough: "2022-06"
  });

  assert.deepEqual(schedule.origins, ["2022-01", "2022-02", "2022-03"]);
  assert.equal(schedule.cadence, "monthly");
  assert.equal(schedule.eligibleCellCount, 3);
  assert.equal(schedule.rightCensoredCellCount, 3);
});

test("mature, censored, excluded and invalid labels are separated", () => {
  const rows = [
    labelRow(),
    labelRow({
      standardWorkId: "CENSORED",
      targetEnd: "2023-07",
      labelAvailableAsOf: "2023-07"
    }),
    labelRow({
      standardWorkId: "EXCLUDED",
      exclusionReason: "route_not_forecastable"
    }),
    labelRow({
      standardWorkId: "INVALID",
      actual: null
    })
  ];
  const result = partitionM2CurrentLabels(rows, "2023-06");

  assert.deepEqual(result.counts, {
    observed: 1,
    right_censored: 1,
    excluded: 1,
    invalid: 1
  });
  assert.equal(result.observedRows.length, 1);
});

test("commitment snapshot is exact-work, ordered as-of and horizon bounded", () => {
  const snapshot = {
    commitmentId: "SYN-C1",
    standardWorkId: "SYN-WORK",
    signedAsOf: "2022-09",
    confirmedAsOf: "2022-10",
    availableAsOf: "2022-11",
    expectedPostingMonth: "2023-02",
    confirmedAmount: 5000,
    outstandingAmount: 3000,
    status: "confirmed",
    signed: true,
    auditable: true,
    evidenceReferences: ["synthetic-contract"]
  };
  const result = validateM2CurrentCommitmentSnapshot(snapshot, {
    standardWorkId: "SYN-WORK",
    origin: "2022-12",
    horizonMonths: 3
  });

  assert.equal(result.outstandingAmount, 3000);
  assert.throws(
    () => validateM2CurrentCommitmentSnapshot(
      { ...snapshot, evidenceReferences: [] },
      {
        standardWorkId: "SYN-WORK",
        origin: "2022-12",
        horizonMonths: 3
      }
    ),
    /evidence_references_required/u
  );
  assert.throws(
    () => validateM2CurrentCommitmentSnapshot(
      { ...snapshot, availableAsOf: "2023-01" },
      {
        standardWorkId: "SYN-WORK",
        origin: "2022-12",
        horizonMonths: 3
      }
    ),
    /as_of_order_invalid/u
  );
  assert.throws(
    () => validateM2CurrentCommitmentSnapshot(
      { ...snapshot, availableAsOf: "2022-11-invalid" },
      {
        standardWorkId: "SYN-WORK",
        origin: "2022-12",
        horizonMonths: 3
      }
    ),
    /available_as_of_invalid/u
  );
});

test("v0.4 baseline bundle includes classic Croston", () => {
  const history = Array.from({ length: 24 }, (_, index) => ({
    standardWorkId: "SYN-WORK",
    month: `${2021 + Math.floor(index / 12)}-${String(
      index % 12 + 1
    ).padStart(2, "0")}`,
    amount: index % 4 === 0 ? 20 : 0
  }));
  const result = buildM2CurrentAutomatedBaselineEvaluation(
    [{
      standardWorkId: "SYN-WORK",
      origin: "2022-12",
      horizonMonths: 3,
      route: "pure_sales_share",
      revenueModel: "pure_sales_share",
      segment: "intermittent",
      actual: 20,
      labelAvailableAsOf: "2023-03"
    }],
    history,
    contract
  );

  assert.ok(result.baselines.Croston);
  assert.equal(result.baselines.Croston.overall.caseCount, 1);
});

test("global hurdle GLM returns bounded occurrence and nonnegative cash", () => {
  const rows = Array.from({ length: 80 }, (_, index) => {
    const history = Array.from(
      { length: 24 },
      (_, month) => month % (index % 3 + 2) === 0 ? 10 + index : 0
    );
    return {
      features: buildM2CurrentHistoryFeatures(history, {
        horizonMonths: 3,
        basePointEstimate: 30,
        segment: index % 2 === 0 ? "dense" : "intermittent",
        route: "pure_sales_share"
      }),
      actual: index % 5 === 0 ? 0 : 25 + index
    };
  });
  const model = fitM2CurrentGlobalModel(
    "regularized_hurdle_glm",
    rows,
    { ridge: 1 }
  );
  const prediction = model.predict(rows[0].features);

  assert.ok(prediction.pointEstimate >= 0);
  assert.ok(prediction.occurrenceProbability >= 0);
  assert.ok(prediction.occurrenceProbability <= 1);
});

test("rolling conformal output is monotone and scores WIS/CRPS", () => {
  const rows = Array.from({ length: 100 }, (_, index) => ({
    standardWorkId: `SYN-${index}`,
    origin: index < 50 ? "2021-01" : "2021-02",
    horizonMonths: 3,
    route: "pure_sales_share",
    segment: "dense",
    actual: 90 + index % 20,
    pointEstimate: 100,
    occurrenceProbability: 0.9,
    labelAvailableAsOf: index < 50 ? "2021-02" : "2021-05"
  }));
  const result = attachM2CurrentConformalQuantiles(rows, {
    probabilities: [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95],
    minimumCalibrationRows: 20
  });
  const scored = scoreM2CurrentProbabilisticRows(result.rows);

  assert.ok(scored.wis >= 0);
  assert.ok(scored.crpsApproximation >= 0);
  assert.ok(
    result.rows.every((row) => (
      row.quantiles["0.05"] <= row.quantiles["0.5"]
      && row.quantiles["0.5"] <= row.quantiles["0.95"]
    ))
  );
});

test("MinT reconciliation is coherent and nonnegative", () => {
  const result = reconcileM2CurrentMinT(
    [120, 60, 40, 10],
    [
      [4, 0, 0, 0],
      [0, 2, 0, 0],
      [0, 0, 3, 0],
      [0, 0, 0, 5]
    ]
  );

  assert.equal(result.coherent, true);
  assert.ok(result.reconciled.slice(1).every((value) => value >= 0));
  assert.ok(
    Math.abs(
      result.reconciled[0]
        - result.reconciled.slice(1).reduce((sum, value) => sum + value, 0)
    ) < 1e-9
  );
});

test("tracked v0.4 evidence is aggregate-only and skips the retired 120 sample", () => {
  const candidate = readJson(
    "docs/analysis/m2-current/M2-current-global-distributional-candidate-v0.4.json"
  );
  const evaluation = readJson(
    "docs/analysis/m2-current/M2-current-automated-evaluation-v0.2.json"
  );
  const text = JSON.stringify({ candidate, evaluation });

  assert.equal(candidate.scope.denseDiagnosticOriginCount, 25);
  assert.equal(evaluation.retiredHumanPredictionSample.replayed, false);
  assert.equal(
    evaluation.retiredHumanPredictionSample.skippedByUserDecision,
    true
  );
  assert.equal(evaluation.boundaries.finalHoldoutOpened, false);
  assert.doesNotMatch(text, /standardWorkId/u);
  assert.doesNotMatch(text, /data\/private-/u);
});

function labelRow(overrides = {}) {
  return {
    standardWorkId: "OBSERVED",
    targetEnd: "2023-03",
    labelAvailableAsOf: "2023-03",
    actual: 10,
    ...overrides
  };
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(relativePath, "utf8"));
}
