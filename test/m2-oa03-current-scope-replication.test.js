import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  allocateM2Oa03Trailing12,
  assessM2Oa03WorkEvidence,
  buildM2Oa03PopulationRows,
  compareM2Oa03FrozenOverlap,
  decimalToMinor,
  pairM2Oa03SameCaseRows,
  resolveM2Oa03CurrentScopeSchedules,
  runM2Oa03CurrentScopeFamily,
  scoreM2Oa03OccurrenceRows,
  scoreM2Oa03PairedBootstrap,
  scoreM2Oa03PointRows,
  validateM2Oa03CurrentScopeConfig
} from "../src/domain/m2Current/oa03CurrentScopeReplication.js";
import {
  buildCoreLegacyOriginPopulation
} from "../src/domain/m2Current/coreLegacyPopulation.js";

const experimentConfig = readJson(
  "config/m2-current-oa03-replication.v0.1.json"
);
const baseCandidateConfig = readJson("config/m2-current.v0.2.json");
const occurrenceAmountConfig = readJson("config/m2-current.v0.3.json");
const canonicalAllocationConfig = readJson(
  "config/m2-current-core-legacy-horizon-router.v0.1.json"
);
const actualDefinitionId =
  "M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01";

test("OA03 current-scope schedules are frozen, legal and right-censored", () => {
  assert.equal(validateM2Oa03CurrentScopeConfig(experimentConfig), true);
  const schedules = resolveM2Oa03CurrentScopeSchedules({
    config: experimentConfig,
    authorityStartMonth: "2020-01",
    labelMaturityCutoff: "2025-12"
  });
  assert.deepEqual(
    schedules.PRIMARY_ROLLING.origins,
    ["2020-12", "2021-06", "2021-12", "2022-06", "2022-12"]
  );
  assert.equal(
    schedules.STRICT_ROLLING.legalCells.some((row) => (
      row.origin === "2025-09" && row.horizonMonths === 3
    )),
    true
  );
  assert.equal(
    schedules.STRICT_ROLLING.legalCells.some((row) => (
      row.origin === "2025-09" && row.horizonMonths === 6
    )),
    false
  );
  assert.throws(
    () => resolveM2Oa03CurrentScopeSchedules({
      config: experimentConfig,
      authorityStartMonth: "2026-01",
      labelMaturityCutoff: "2026-02"
    }),
    /m2_oa03_current_scope_no_legal_origin/u
  );
});

test("dynamic Core80/Core90 is origin-safe and enforces three mature months", () => {
  const visible = [
    ...monthly("WORK_A", "CHANNEL_A", "2022-01", [80, 80, 80, 80, 80, 80]),
    ...monthly("WORK_B", "CHANNEL_B", "2022-01", [20, 20, 20, 20, 20, 20]),
    ...monthly("WORK_C", "CHANNEL_C", "2022-06", [100])
  ];
  const result = buildCoreLegacyOriginPopulation({
    origin: "2022-06",
    monthlyRows: visible,
    minimumCompleteMonths: 3,
    thresholds: {CORE80: 0.8, CORE90: 0.9},
    topCounts: [20, 50]
  });
  assert.deepEqual(result.selection.populations.CORE80, ["WORK_A"]);
  assert.deepEqual(
    result.selection.populations.CORE90,
    ["WORK_A", "WORK_B"]
  );
  assert.equal(
    result.immatureObservedPairs.some(
      (row) => row.standardWorkId === "WORK_C"
    ),
    true
  );

  const futurePerturbed = buildCoreLegacyOriginPopulation({
    origin: "2022-06",
    monthlyRows: [
      ...visible,
      ...monthly("WORK_FUTURE", "CHANNEL_FUTURE", "2022-07", [1_000_000])
    ],
    minimumCompleteMonths: 3,
    thresholds: {CORE80: 0.8, CORE90: 0.9},
    topCounts: [20, 50]
  });
  assert.deepEqual(
    futurePerturbed.selection.populations,
    result.selection.populations
  );
});

test("Primary and Strict folds fit independently without future-label leakage", () => {
  const primaryRows = syntheticFamilyRows("PRIMARY_ROLLING");
  const original = runFamily("PRIMARY_ROLLING", primaryRows);
  const futureChanged = runFamily(
    "PRIMARY_ROLLING",
    primaryRows.map((row) => (
      row.origin === "2022-12"
        ? {...row, actual: row.actual + 1_000_000}
        : row
    ))
  );
  const originBeforePerturbation = (result) => result.fitRows
    .filter((row) => row.origin < "2022-12")
    .map(compactPrediction);
  assert.deepEqual(
    originBeforePerturbation(futureChanged),
    originBeforePerturbation(original)
  );
  assert.equal(
    original.oa03Selections.every(
      (row) => row.maximumLabelAvailableAsOf === null
        || row.maximumLabelAvailableAsOf <= row.outerOrigin
    ),
    true
  );

  const strict = runFamily(
    "STRICT_ROLLING",
    syntheticFamilyRows("STRICT_ROLLING", 5_000)
  );
  assert.equal(
    strict.fitRows.every(
      (row) => row.evaluationFamily === "STRICT_ROLLING"
    ),
    true
  );
  assert.equal(
    original.fitRows.every(
      (row) => row.evaluationFamily === "PRIMARY_ROLLING"
    ),
    true
  );
  assert.equal(original.boundaries.familyFitIndependent, true);
  assert.equal(strict.boundaries.familyFitIndependent, true);
});

test("canonical joint 3/6/12 fit remains explicit without horizon copying", () => {
  const result = runFamily(
    "PRIMARY_ROLLING",
    syntheticFamilyRows("PRIMARY_ROLLING")
  );
  const selection = result.oa03Selections.find((row) => (
    row.outerOrigin === "2021-12"
    && row.segment === "dense"
  ));
  assert.ok(selection);
  assert.ok(selection.matureEarlierCaseCount >= 80);
  assert.equal(selection.maximumLabelAvailableAsOf <= "2021-12", true);
  assert.equal(
    experimentConfig.formula.originalJointHorizonFitSemantics.enabled,
    true
  );
  assert.equal(
    experimentConfig.formula.originalJointHorizonFitSemantics.notParameterCopy,
    true
  );
  assert.equal(
    result.boundaries.formulaChanged,
    false
  );
  assert.throws(
    () => runFamily("PRIMARY_ROLLING", [
      {
        ...syntheticFamilyRows("PRIMARY_ROLLING")[0],
        origin: "2021-01"
      }
    ]),
    /m2_oa03_current_scope_base_row_invalid/u
  );
});

test("occurrence diagnostics use native stored probabilities and retain reversals", () => {
  const rows = syntheticFamilyRows("PRIMARY_ROLLING");
  rows[0] = {...rows[0], actual: -25};
  const result = runFamily("PRIMARY_ROLLING", rows);
  const reversal = result.fitRows.find((row) => (
    row.standardWorkId === rows[0].standardWorkId
    && row.origin === rows[0].origin
    && row.horizonMonths === rows[0].horizonMonths
  ));
  assert.equal(reversal.actual, -25);
  const native = result.evaluationRows.filter(
    (row) => Number.isFinite(row.occurrenceProbability)
  );
  assert.ok(native.length > 0);
  const metrics = scoreM2Oa03OccurrenceRows(native);
  assert.equal(metrics.status, "COMPUTED_ON_NATIVE_STORED_PROBABILITIES");
  assert.equal(metrics.probabilityCaseCount, native.length);
  assert.ok(metrics.brier >= 0);
  assert.equal(
    experimentConfig.formula.nativeStoredOutputs
      .conditionalPositiveAmountPredictionStatus,
    "CAPABILITY_NOT_STORED"
  );
});

test("population filtering keeps Core80 and Core90 separate", () => {
  const result = runFamily(
    "PRIMARY_ROLLING",
    syntheticFamilyRows("PRIMARY_ROLLING")
  );
  const core80 = buildM2Oa03PopulationRows(
    result.evaluationRows,
    "CORE80"
  );
  const core90 = buildM2Oa03PopulationRows(
    result.evaluationRows,
    "CORE90"
  );
  assert.ok(core90.length > core80.length);
  assert.equal(core80.every((row) => row.populationId === "CORE80"), true);
  assert.equal(core90.every((row) => row.populationId === "CORE90"), true);
});

test("trailing-12 allocation conserves exact cents and excludes future-first channels", () => {
  const result = allocateM2Oa03Trailing12({
    totalPointEstimateMinor: "1001",
    canonicalConfig: canonicalAllocationConfig,
    channels: [
      matureChannel("CHANNEL_B", [1, ...Array(11).fill(0)]),
      {
        channelUid: "CHANNEL_FUTURE",
        originObservedMature: false,
        eligibilityStatus: "ABSTAIN_FUTURE_FIRST_AT_ORIGIN"
      },
      matureChannel("CHANNEL_A", [2, ...Array(11).fill(0)])
    ]
  });
  assert.equal(result.status, "ALLOCATED");
  assert.deepEqual(
    result.allocations.map((row) => [
      row.channelUid,
      row.pointEstimateMinor
    ]),
    [["CHANNEL_A", "667"], ["CHANNEL_B", "334"]]
  );
  assert.equal(result.conservationDifferenceMinor, "0");
  assert.deepEqual(
    result.channelAbstentions,
    [{
      channelUid: "CHANNEL_FUTURE",
      pointEstimate: null,
      pointEstimateMinor: null,
      reason: "ABSTAIN_FUTURE_FIRST_AT_ORIGIN"
    }]
  );

  const tied = allocateM2Oa03Trailing12({
    totalPointEstimateMinor: "1",
    canonicalConfig: canonicalAllocationConfig,
    channels: [
      matureChannel("CHANNEL_B", Array(12).fill(1)),
      matureChannel("CHANNEL_A", Array(12).fill(1))
    ]
  });
  assert.deepEqual(
    tied.allocations.map((row) => [
      row.channelUid,
      row.pointEstimateMinor
    ]),
    [["CHANNEL_A", "1"], ["CHANNEL_B", "0"]]
  );
});

test("zero denominators and Core-tail cases are legal null abstentions", () => {
  const zero = allocateM2Oa03Trailing12({
    totalPointEstimateMinor: "900",
    canonicalConfig: canonicalAllocationConfig,
    channels: [
      matureChannel("CHANNEL_A", Array(12).fill(0)),
      matureChannel("CHANNEL_B", Array(12).fill(0))
    ]
  });
  assert.equal(zero.status, "ABSTAIN_CHANNEL_ALLOCATION");
  assert.equal(zero.reason, "ABSTAIN_CHANNEL_ALLOCATION");
  assert.deepEqual(zero.allocations, []);
  assert.equal(
    zero.channelAbstentions.every(
      (row) => row.pointEstimate === null
    ),
    true
  );

  const tail = allocateM2Oa03Trailing12({
    totalPointEstimateMinor: "900",
    isCore: false,
    canonicalConfig: canonicalAllocationConfig,
    channels: [matureChannel("CHANNEL_A", Array(12).fill(1))]
  });
  assert.equal(tail.status, "ABSTAIN_CHANNEL_ALLOCATION");
  assert.equal(tail.reason, "ABSTAIN_OUTSIDE_CORE_NOT_ZERO");
  assert.equal(tail.channelAbstentions[0].pointEstimate, null);
});

test("paired scoring and 2,000-work bootstrap replay deterministically", () => {
  const candidate = [];
  const baseline = [];
  for (let work = 1; work <= 24; work += 1) {
    for (const origin of ["2022-03", "2022-06", "2022-09"]) {
      const shared = {
        standardWorkId: `WORK_${work}`,
        origin,
        horizonMonths: 3,
        evaluationFamily: "PRIMARY_ROLLING",
        populationId: "CORE80",
        actual: 100 + work
      };
      candidate.push({...shared, pointEstimate: 100 + work * 0.9});
      baseline.push({...shared, pointEstimate: 90 + work * 0.7});
    }
  }
  const paired = pairM2Oa03SameCaseRows(candidate, baseline);
  assert.equal(paired.sameCaseCount, candidate.length);
  const first = scoreM2Oa03PairedBootstrap(paired.rows, {
    iterations: 2000,
    seed: 20260728
  });
  const second = scoreM2Oa03PairedBootstrap(paired.rows, {
    iterations: 2000,
    seed: 20260728
  });
  assert.deepEqual(first, second);
  assert.equal(first.status, "COMPUTED");
  assert.equal(first.iterations, 2000);

  const evidence = assessM2Oa03WorkEvidence({
    pairedRows: paired.rows,
    config: experimentConfig
  });
  assert.ok(
    experimentConfig.decisionPolicy.workTotalStatesByHorizon
      .includes(evidence.status)
  );
  assert.ok(evidence.timeBlocks.length >= 2);
});

test("point metrics handle zero denominators without inventing a pass", () => {
  const empty = scoreM2Oa03PointRows([]);
  assert.equal(empty.status, "NOT_COMPUTABLE_EMPTY");
  const zero = scoreM2Oa03PointRows([
    {standardWorkId: "W1", actual: 0, pointEstimate: 10}
  ]);
  assert.equal(zero.status, "NOT_COMPUTABLE_ZERO_DENOMINATOR");
  assert.equal(zero.wape, null);
  assert.equal(zero.signedBias, null);
});

test("frozen overlap is exact only under an identical contract", () => {
  const currentRows = [{
    standardWorkId: "WORK_1",
    origin: "2022-03",
    horizonMonths: 3,
    actual: 100,
    pointEstimate: 12.345
  }];
  const frozenRows = [{
    caseKey: {
      standardWorkId: "WORK_1",
      origin: "2022-03",
      horizonMonths: 3
    },
    candidatePointEstimate: 12.345
  }];
  assert.equal(
    compareM2Oa03FrozenOverlap({
      currentRows,
      frozenRows,
      sameActualDefinition: false,
      sameTrainingSupport: true,
      sameFormulaVersion: true
    }).status,
    "NOT_COMPARABLE_DIFFERENT_CONTRACT"
  );
  assert.equal(
    compareM2Oa03FrozenOverlap({
      currentRows,
      frozenRows,
      sameActualDefinition: true,
      sameTrainingSupport: true,
      sameFormulaVersion: true
    }).status,
    "EXACT_REPLAY_MATCH"
  );
  assert.equal(decimalToMinor("12.345"), 1235n);
});

function runFamily(evaluationFamily, baseRows) {
  return runM2Oa03CurrentScopeFamily({
    evaluationFamily,
    baseRows,
    baseCandidateConfig,
    occurrenceAmountConfig,
    experimentConfig
  });
}

function syntheticFamilyRows(evaluationFamily, offset = 0) {
  const origins = experimentConfig.rollingEvaluation
    .schedules[evaluationFamily].trainingAndEvaluationOrigins;
  const rows = [];
  for (const [originIndex, origin] of origins.entries()) {
    for (let work = 1; work <= 30; work += 1) {
      for (const horizonMonths of [3, 6, 12]) {
        const positive = (work + originIndex + horizonMonths) % 3 !== 0;
        rows.push({
          evaluationFamily,
          standardWorkId: `WORK_${offset + work}`,
          origin,
          horizonMonths,
          labelAvailableAsOf: addMonths(origin, horizonMonths),
          actualDefinitionId,
          basePointEstimate: 100 + work + horizonMonths,
          actual: positive ? 50 + work : 0,
          segment: work % 10 === 0 ? "intermittent" : "dense",
          spikeCandidate: work % 7 === 0,
          valueBand: work <= 2 ? "top_1_percent" : "other_positive",
          route: "pure_sales_share",
          historicalFeaturePolicy: "as_of_only",
          sourceShelfRightsTermPolicy: "post_hoc_only",
          core80: work <= 20,
          core90: work <= 26
        });
      }
    }
  }
  return rows;
}

function compactPrediction(row) {
  return {
    standardWorkId: row.standardWorkId,
    origin: row.origin,
    horizonMonths: row.horizonMonths,
    pointEstimate: row.pointEstimate,
    selectedCandidateId: row.selectedCandidateId
  };
}

function matureChannel(channelUid, values) {
  return {
    channelUid,
    originObservedMature: true,
    historyNonnegativeMinorByLag: values.map(String)
  };
}

function monthly(standardWorkId, channelUid, start, values) {
  return values.map((cash, index) => ({
    standardWorkId,
    channelUid,
    month: addMonths(start, index),
    cash,
    level2Category: "CATEGORY",
    level3Category: "SUBCATEGORY",
    settlementMechanism: "membership_subscription"
  }));
}

function addMonths(value, offset) {
  const [year, month] = value.split("-").map(Number);
  const serial = year * 12 + month - 1 + offset;
  return `${Math.floor(serial / 12)}-${String(serial % 12 + 1).padStart(
    2,
    "0"
  )}`;
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}
