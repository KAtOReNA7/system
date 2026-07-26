import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildM2CurrentCaseKey,
  summarizeM2CurrentCaseUniverse
} from "../src/domain/m2Current/case.js";
import {
  pairedWorkOriginBootstrap
} from "../src/domain/m2Current/bootstrap.js";
import {
  buildM2CurrentOccurrenceAmountCandidate,
  buildM2CurrentReliableCandidate,
  buildM2CurrentSegmentedCandidate
} from "../src/domain/m2Current/candidate.js";
import {
  compareM2CurrentCandidateToB4
} from "../src/domain/m2Current/comparator.js";
import {
  buildM2CurrentContract
} from "../src/domain/m2Current/contract.js";
import {
  buildM2CurrentAvailabilitySnapshot,
  buildM2CurrentUnknownAvailabilitySnapshot
} from "../src/domain/m2Current/availabilitySnapshot.js";
import {
  evaluateM2CurrentDiagnosticGate
} from "../src/domain/m2Current/gate.js";
import {
  loadM2CurrentPublicEvidence
} from "../src/domain/m2Current/loader.js";
import {
  scoreM2CurrentEvaluationRows,
  scoreM2CurrentPointRows,
  scoreM2CurrentSlices
} from "../src/domain/m2Current/metrics.js";
import {
  forecastM2CurrentManualChannelRule
} from "../src/domain/m2Current/manualChannel.js";
import {
  buildM2CurrentAutomatedBaselineEvaluation,
  buildM2CurrentHistoryRegimeChallenger
} from "../src/domain/m2Current/baselines.js";
import {
  resolveM2CurrentCashRoute,
  resolveM2CurrentSalesShareRoute
} from "../src/domain/m2Current/route.js";
import {
  buildM2CurrentRevenueShareFact,
  selectM2CurrentRevenueShareFactsAsOf,
  validateM2CurrentRevenueShareFacts
} from "../src/domain/m2Current/revenueShareFact.js";
import {
  buildM2CurrentSignalGapLedger,
  summarizeM2CurrentSignalGapLedger
} from "../src/domain/m2Current/signalGapLedger.js";
import {
  buildM2CurrentFormalCashTarget,
  buildM2CurrentSalesShareTarget,
  serveM2CurrentPointForecast,
  serveM2CurrentSalesSharePointForecast
} from "../src/domain/m2Current/target.js";
import {
  loadM2CurrentConfigSync
} from "../scripts/m2-current/load_m2_current_config.mjs";

function publicSources() {
  return Object.fromEntries(
    Object.entries(config.publicSources)
      .map(([role, file]) => [role, readJson(file)])
  );
}

const config = readJson("config/m2-current.v0.1.json");
const contract = buildM2CurrentContract(config);
const currentConfig = readJson("config/m2-current.v0.3.json");
const currentContract = buildM2CurrentContract(currentConfig);
const nextConfig = readJson("config/m2-current.v0.5.json");
const salesShareConfig = loadM2CurrentConfigSync(
  process.cwd(),
  "config/m2-current.v0.6.json"
);
const reliableConfig = readJson("config/m2-current.v0.2.json");

function currentPublicSources() {
  return Object.fromEntries(
    Object.entries(currentConfig.publicSources)
      .map(([role, file]) => [role, readJson(file)])
  );
}

function salesSharePublicSources() {
  return Object.fromEntries(
    Object.entries(salesShareConfig.publicSources)
      .map(([role, file]) => [role, readJson(file)])
  );
}

function row(overrides = {}) {
  return {
    standardWorkId: "SYN-WORK-1",
    origin: "2022-12",
    horizonMonths: 3,
    route: "sales_share",
    actual: 100,
    pointEstimate: 90,
    segment: "dense",
    ...overrides
  };
}

test("public loader freezes population, coverage, segments, decisions and seals", () => {
  const evidence = loadM2CurrentPublicEvidence(publicSources(), config);

  assert.deepEqual(evidence.population, {
    libraryWorkCount: 3053,
    modelWorkCount: 824,
    modelCaseCount: 7851,
    modelWorkShare: 824 / 3053
  });
  assert.equal(
    evidence.coverage.cashObservability.fullLibrary,
    0.7396468495203204
  );
  assert.equal(
    evidence.coverage.cashObservability.top10,
    0.7594125279899511
  );
  assert.deepEqual(evidence.coverage.modelEligibility, {
    eligibleWorkCount: 824,
    excludedWorkCount: 2229,
    totalWorkCount: 3053,
    workShare: 824 / 3053,
    reasonLedgerStatus: "AVAILABLE",
    reasons: {
      notObservableAtAnyFrozenDevelopmentOrigin: 1610,
      insufficientHistoryAtEveryEligibleOrigin: 399,
      formalCashRouteExcluded: 220
    },
    reasonsExhaustive: true,
    reasonsMutuallyExclusive: true,
    routeReasonBreakdownSuppressed: true
  });
  assert.equal(evidence.coverage.served.status, "MEASURED");
  assert.equal(evidence.coverage.served.caseCount, 7851);
  assert.equal(evidence.coverage.served.workCount, 824);
  assert.equal(evidence.coverage.served.workShareOfFrozenModelPopulation, 1);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(evidence.segments).map(([key, value]) => [key, value.caseCount])
    ),
    { dense: 5174, dormant: 833, intermittent: 1844 }
  );
  assert.equal(evidence.modelQualityDecision, "FAIL");
  assert.equal(evidence.businessCoverageDecision, "CONDITIONAL");
  assert.equal(Object.values(evidence.seals).some(Boolean), false);
});

test("case universe is unique and limited to frozen horizons", () => {
  assert.equal(
    buildM2CurrentCaseKey(row(), contract),
    "SYN-WORK-1|2022-12|3|sales_share"
  );
  assert.deepEqual(
    summarizeM2CurrentCaseUniverse([
      row(),
      row({
        standardWorkId: "SYN-WORK-2",
        horizonMonths: 24
      })
    ], contract),
    {
      caseCount: 2,
      uniqueWorkCount: 2,
      horizons: { 3: 1, 24: 1 }
    }
  );
  assert.throws(
    () => buildM2CurrentCaseKey(row({ horizonMonths: 60 }), contract),
    /horizon_not_allowed/u
  );
  assert.throws(
    () => summarizeM2CurrentCaseUniverse([row(), row()], contract),
    /duplicate_case_key/u
  );
});

test("formal cash target conserves three actual roles", () => {
  assert.deepEqual(
    buildM2CurrentFormalCashTarget({
      salesCashActual: 80,
      committedCashActual: 20,
      uncommittedBuyoutSurpriseActual: 15
    }),
    {
      forecastableCashActual: 100,
      uncommittedBuyoutSurpriseActual: 15,
      totalLedgerCashActual: 115
    }
  );
});

test("current sales-share target isolates all buyout and non-sales cash", () => {
  assert.deepEqual(
    buildM2CurrentSalesShareTarget({
      salesShareCashActual: 80,
      isolatedBuyoutCashActual: 20,
      isolatedOtherCashActual: 15
    }),
    {
      salesShareCashActual: 80,
      isolatedBuyoutCashActual: 20,
      isolatedOtherCashActual: 15,
      totalLedgerCashActual: 115,
      allBuyoutExcludedFromForecast: true,
      commitmentCashExcludedFromForecast: true,
      targetPolicy: "sales_share_cash_only"
    }
  );
});

test("pure buyout without an as-of commitment abstains instead of serving zero", () => {
  const forecast = serveM2CurrentPointForecast({
    businessForm: "pure_buyout",
    commitmentKnownAsOfCutoff: false
  });

  assert.equal(forecast.pointEstimate, null);
  assert.equal(forecast.abstained, true);
  assert.equal(forecast.pointEstimateOnly, true);
  assert.equal(forecast.scenarioFieldsIncluded, false);
  assert.equal(forecast.predictionIntervalEndpointsIncluded, false);
});

test("point metrics and slice metrics do not use zero imputation", () => {
  const rows = [
    row(),
    row({
      standardWorkId: "SYN-WORK-2",
      actual: 50,
      pointEstimate: 60,
      segment: "intermittent"
    })
  ];
  const metrics = scoreM2CurrentPointRows(rows);
  const slices = scoreM2CurrentSlices(rows, "segment");

  assert.equal(metrics.wape, 20 / 150);
  assert.equal(metrics.signedBias, 0);
  assert.equal(metrics.zeroImputationUsed, false);
  assert.deepEqual(Object.keys(slices), ["dense", "intermittent"]);
  assert.throws(
    () => scoreM2CurrentPointRows([row({ pointEstimate: null })]),
    /point_estimate_invalid/u
  );
});

test("extended metrics separate occurrence, positive amount and scale quality", () => {
  const result = scoreM2CurrentEvaluationRows([
    row({
      actual: 100,
      pointEstimate: 80,
      occurrenceProbability: 0.8,
      scaleAbsoluteError: 20,
      scaleSquaredError: 400
    }),
    row({
      standardWorkId: "SYN-WORK-2",
      actual: 0,
      pointEstimate: 10,
      occurrenceProbability: 0.2,
      scaleAbsoluteError: 10,
      scaleSquaredError: 100
    })
  ]);

  assert.equal(result.wape, 0.3);
  assert.equal(result.mase, 1);
  assert.equal(result.rmsse, 1);
  assert.equal(result.cashOccurrence.observedRate, 0.5);
  assert.ok(Math.abs(result.cashOccurrence.brier - 0.04) < 1e-12);
  assert.equal(result.positiveAmount.caseCount, 1);
});

test("pure buyout is outside numeric modeling without cutoff evidence", () => {
  const abstention = resolveM2CurrentCashRoute({
    revenueModel: "pure_buyout",
    origin: "2022-12"
  });
  const committed = resolveM2CurrentCashRoute({
    standardWorkId: "SYN-WORK-1",
    revenueModel: "pure_buyout",
    origin: "2022-12",
    horizonMonths: 3,
    commitment: {
      commitmentId: "SYN-COMMITMENT-1",
      standardWorkId: "SYN-WORK-1",
      signedAsOf: "2022-10",
      confirmedAsOf: "2022-11",
      availableAsOf: "2022-11",
      expectedPostingMonth: "2023-01",
      confirmedAmount: 3000,
      outstandingAmount: 2500,
      status: "confirmed",
      signed: true,
      auditable: true,
      evidenceReferences: ["synthetic-evidence-1"]
    }
  });

  assert.equal(abstention.pointEstimate, null);
  assert.equal(abstention.abstained, true);
  assert.equal(
    abstention.abstentionReason,
    "uncommitted_future_buyout_not_forecastable"
  );
  assert.equal(abstention.buyoutMonthlyEquivalentAllowed, false);
  assert.equal(committed.pointEstimate, 2500);
  assert.equal(committed.forecastScope, "cutoff_confirmed_commitment_only");
});

test("sales-share-only policy excludes even confirmed buyout cash", () => {
  const route = resolveM2CurrentSalesShareRoute({
    standardWorkId: "SYN-WORK-1",
    revenueModel: "pure_buyout",
    origin: "2022-12",
    horizonMonths: 3,
    commitment: {
      outstandingAmount: 2500
    }
  });
  const forecast = serveM2CurrentSalesSharePointForecast({
    businessForm: "pure_buyout",
    commitmentKnownAsOfCutoff: true,
    committedFutureCashPoint: 2500
  });
  const mixed = resolveM2CurrentSalesShareRoute({
    revenueModel: "buyout_plus_sales"
  });

  assert.equal(route.pointEstimate, null);
  assert.equal(route.abstentionReason, "buyout_outside_m2_forecast_scope");
  assert.equal(forecast.pointEstimate, null);
  assert.equal(forecast.abstentionReason, "buyout_outside_m2_forecast_scope");
  assert.equal(mixed.forecastScope, "sales_share_cash_only");
  assert.equal(mixed.served, true);
});

test("automated evaluator runs rolling-origin intermittent baselines", () => {
  const histories = Array.from({ length: 30 }, (_, index) => ({
    standardWorkId: "SYN-WORK-1",
    month: `${2020 + Math.floor(index / 12)}-${String(
      index % 12 + 1
    ).padStart(2, "0")}`,
    amount: index % 3 === 0 ? 30 : 0
  }));
  const result = buildM2CurrentAutomatedBaselineEvaluation(
    [row({
      origin: "2022-06",
      route: "pure_sales_share",
      revenueModel: "pure_sales_share",
      actual: 60
    })],
    histories,
    currentContract
  );

  assert.deepEqual(Object.keys(result.baselines), [
    "zero",
    "seasonal_naive",
    "SBA",
    "TSB",
    "ADIDA"
  ]);
  assert.equal(result.rollingOrigin.futureActualUsedForPrediction, false);
  assert.equal(result.routePolicy.scoredCaseCount, 1);
  assert.equal(result.baselines.TSB.overall.caseCount, 1);
  assert.equal(result.baselines.TSB.overall.mase !== null, true);
});

test("history-regime challenger selects only from mature earlier labels", () => {
  const template = [
    row({
      origin: "2021-01",
      actual: 100,
      pointEstimate: 0,
      labelAvailableAsOf: "2021-02",
      historySeries: Array(24).fill(0),
      occurrenceProbability: 0,
      scaleAbsoluteError: 1,
      scaleSquaredError: 1
    }),
    row({
      origin: "2021-02",
      actual: 500,
      pointEstimate: 0,
      labelAvailableAsOf: "2021-03",
      historySeries: Array(25).fill(0),
      occurrenceProbability: 0,
      scaleAbsoluteError: 1,
      scaleSquaredError: 1
    })
  ];
  const rowsByBaseline = Object.fromEntries(
    ["zero", "seasonal_naive", "Croston", "SBA", "TSB", "ADIDA"]
      .map((baselineId) => [
        baselineId,
        template.map((item) => ({
          ...item,
          pointEstimate: baselineId === "seasonal_naive" ? 100 : (
            baselineId === "zero" ? 0 : 200
          )
        }))
      ])
  );
  const result = buildM2CurrentHistoryRegimeChallenger(
    rowsByBaseline,
    {
      minimumTrainingRows: 1,
      trainingOriginWindow: 1
    }
  );

  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].selectedBaselineId, "zero");
  assert.equal(result.rows[1].selectedBaselineId, "seasonal_naive");
  assert.equal(result.rows[1].pointEstimate, 100);
  assert.equal(result.selections[1].latestMatureTrainingOrigin, "2021-01");
  assert.equal(result.selections[1].sameOrLaterOuterTruthRead, false);
  assert.equal(result.design.promotionEligible, false);
  assert.equal(result.design.finalHoldoutOpened, false);
});

test("two-part candidate activates only from mature earlier labels", () => {
  const training = Array.from({ length: 100 }, (_, index) => row({
    standardWorkId: `TRAIN-${index}`,
    origin: "2020-12",
    actual: index < 80 ? 100 : 0,
    pointEstimate: 120,
    labelAvailableAsOf: "2021-03"
  }));
  const outer = row({
    standardWorkId: "OUTER",
    origin: "2021-06",
    actual: 100,
    pointEstimate: 120,
    labelAvailableAsOf: "2021-09"
  });
  const result = buildM2CurrentOccurrenceAmountCandidate(
    [...training, outer],
    currentContract
  );
  const selected = result.rows.find(
    (entry) => entry.standardWorkId === "OUTER"
  );

  assert.equal(selected.selectedCandidateId.includes("two_part"), true);
  assert.ok(selected.pointEstimate < selected.baseCandidatePointEstimate);
  assert.equal(
    result.selections.every(
      (selection) => selection.sameOrLaterOuterTruthRead === false
    ),
    true
  );
});

test("candidate comparison requires exact case and actual parity", () => {
  const comparison = compareM2CurrentCandidateToB4(
    [row({ pointEstimate: 90 })],
    [row({ pointEstimate: 80 })],
    contract
  );

  assert.equal(comparison.caseKeyParity, true);
  assert.equal(comparison.actualParity, true);
  assert.equal(comparison.candidate.wape, 0.1);
  assert.equal(comparison.b4.wape, 0.2);
  assert.equal(comparison.relativeWape, -0.5);
  assert.throws(
    () => compareM2CurrentCandidateToB4(
      [row({ actual: 99 })],
      [row({ actual: 100 })],
      contract
    ),
    /actual_mismatch/u
  );
});

test("candidate comparison rejects duplicate and non-identical case sets", () => {
  const candidate = [
    row({ standardWorkId: "SYN-WORK-1" }),
    row({ standardWorkId: "SYN-WORK-1" })
  ];
  const comparator = [
    row({ standardWorkId: "SYN-WORK-1" }),
    row({ standardWorkId: "SYN-WORK-2" })
  ];
  assert.throws(
    () => compareM2CurrentCandidateToB4(candidate, comparator, contract),
    /duplicate_candidate_case/u
  );
  assert.throws(
    () => compareM2CurrentCandidateToB4(
      [
        row({ standardWorkId: "SYN-WORK-1" }),
        row({ standardWorkId: "SYN-WORK-3" })
      ],
      comparator,
      contract
    ),
    /case_set_mismatch/u
  );
});

test("paired work-origin bootstrap is deterministic and requires exact parity", () => {
  const candidate = [
    row({
      standardWorkId: "SYN-WORK-1",
      origin: "2022-06",
      pointEstimate: 95
    }),
    row({
      standardWorkId: "SYN-WORK-1",
      origin: "2022-12",
      pointEstimate: 105
    }),
    row({
      standardWorkId: "SYN-WORK-2",
      origin: "2022-06",
      pointEstimate: 50,
      actual: 50
    }),
    row({
      standardWorkId: "SYN-WORK-2",
      origin: "2022-12",
      pointEstimate: 50,
      actual: 50
    })
  ];
  const comparator = candidate.map((entry) => ({
    ...entry,
    pointEstimate: entry.actual * 0.8
  }));
  const first = pairedWorkOriginBootstrap(
    candidate,
    comparator,
    contract,
    { iterations: 200, seed: 42 }
  );
  const second = pairedWorkOriginBootstrap(
    candidate,
    comparator,
    contract,
    { iterations: 200, seed: 42 }
  );

  assert.deepEqual(first, second);
  assert.equal(first.method, "paired_work_origin_pigeonhole");
  assert.equal(first.workCount, 2);
  assert.equal(first.originCount, 2);
  assert.equal(first.caseCount, 4);
  assert.ok(first.upper95 < 0);
});

test("segmented candidate uses only labels mature before the outer origin", () => {
  const comparators = [
    row({
      standardWorkId: "SYN-DENSE",
      origin: "2020-12",
      actual: 100,
      pointEstimate: 200,
      labelAvailableAsOf: "2021-06"
    }),
    row({
      standardWorkId: "SYN-INTERMITTENT",
      origin: "2020-12",
      actual: 100,
      pointEstimate: 200,
      labelAvailableAsOf: "2021-06"
    }),
    row({
      standardWorkId: "SYN-DORMANT",
      origin: "2020-12",
      actual: 100,
      pointEstimate: 0,
      labelAvailableAsOf: "2021-06"
    }),
    row({
      standardWorkId: "SYN-DENSE",
      origin: "2021-06",
      actual: 100,
      pointEstimate: 200,
      labelAvailableAsOf: "2021-12"
    }),
    row({
      standardWorkId: "SYN-INTERMITTENT",
      origin: "2021-06",
      actual: 100,
      pointEstimate: 200,
      labelAvailableAsOf: "2021-12"
    }),
    row({
      standardWorkId: "SYN-DORMANT",
      origin: "2021-06",
      actual: 100,
      pointEstimate: 0,
      labelAvailableAsOf: "2021-12"
    })
  ];
  const segmentByWork = new Map([
    ["SYN-DENSE", "dense"],
    ["SYN-INTERMITTENT", "intermittent"],
    ["SYN-DORMANT", "dormant"]
  ]);
  const segments = comparators.map((entry) => ({
    ...entry,
    segment: segmentByWork.get(entry.standardWorkId)
  }));
  const result = buildM2CurrentSegmentedCandidate(
    comparators,
    segments,
    contract
  );
  const secondOrigin = result.rows.filter(
    (entry) => entry.origin === "2021-06"
  );

  assert.equal(
    secondOrigin.find((entry) => entry.segment === "dense").pointEstimate,
    100
  );
  assert.equal(
    secondOrigin.find(
      (entry) => entry.segment === "intermittent"
    ).pointEstimate,
    100
  );
  assert.equal(
    secondOrigin.find((entry) => entry.segment === "dormant").pointEstimate,
    0
  );
  assert.equal(
    result.selections.every(
      (selection) => selection.sameOrLaterOuterTruthRead === false
    ),
    true
  );

  const futureLabeled = comparators.map((entry) => (
    entry.origin === "2020-12" && entry.standardWorkId === "SYN-DENSE"
      ? { ...entry, labelAvailableAsOf: "2021-07" }
      : entry
  ));
  const futureSegments = futureLabeled.map((entry) => ({
    ...entry,
    segment: segmentByWork.get(entry.standardWorkId)
  }));
  const guarded = buildM2CurrentSegmentedCandidate(
    futureLabeled,
    futureSegments,
    contract
  );
  assert.equal(
    guarded.rows.find((entry) => (
      entry.origin === "2021-06" && entry.segment === "dense"
    )).pointEstimate,
    200
  );
});

test("reliable candidate learns group scales only from mature as-of features", () => {
  const testContract = buildM2CurrentContract({
    ...reliableConfig,
    candidate: {
      ...reliableConfig.candidate,
      scaleFactors: [0.5, 0.75, 1],
      groupCalibration: {
        ...reliableConfig.candidate.groupCalibration,
        minimumEarlierCaseCount: 2
      }
    }
  });
  const comparators = [];
  const features = [];
  function addCase({
    work,
    origin,
    segment,
    spikeCandidate = false,
    valueBand = "other_positive",
    actual = 100,
    pointEstimate = 100,
    labelAvailableAsOf = "2021-06"
  }) {
    const comparator = row({
      standardWorkId: work,
      origin,
      segment,
      actual,
      pointEstimate,
      labelAvailableAsOf
    });
    comparators.push(comparator);
    features.push({
      ...comparator,
      spikeCandidate,
      valueBand,
      historicalFeaturePolicy: "as_of_only",
      sourceShelfRightsTermPolicy: "post_hoc_only"
    });
  }

  for (let index = 0; index < 2; index += 1) {
    addCase({
      work: `DENSE-SPIKE-${index}`,
      origin: "2020-12",
      segment: "dense",
      spikeCandidate: true,
      pointEstimate: 200
    });
    addCase({
      work: `INTERMITTENT-TOP-${index}`,
      origin: "2020-12",
      segment: "intermittent",
      valueBand: "top_1_percent",
      pointEstimate: 200
    });
  }
  for (let index = 0; index < 4; index += 1) {
    addCase({
      work: `DENSE-REGULAR-${index}`,
      origin: "2020-12",
      segment: "dense"
    });
    addCase({
      work: `INTERMITTENT-REGULAR-${index}`,
      origin: "2020-12",
      segment: "intermittent"
    });
  }
  addCase({
    work: "DORMANT-TRAIN",
    origin: "2020-12",
    segment: "dormant",
    actual: 25,
    pointEstimate: 0
  });
  addCase({
    work: "DENSE-OUTER",
    origin: "2021-06",
    segment: "dense",
    spikeCandidate: true,
    pointEstimate: 200,
    labelAvailableAsOf: "2021-12"
  });
  addCase({
    work: "INTERMITTENT-OUTER",
    origin: "2021-06",
    segment: "intermittent",
    valueBand: "top_1_percent",
    pointEstimate: 200,
    labelAvailableAsOf: "2021-12"
  });
  addCase({
    work: "DORMANT-OUTER",
    origin: "2021-06",
    segment: "dormant",
    actual: 25,
    pointEstimate: 0,
    labelAvailableAsOf: "2021-12"
  });

  const result = buildM2CurrentReliableCandidate(
    comparators,
    features,
    testContract
  );
  const outerRows = result.rows.filter((entry) => entry.origin === "2021-06");

  assert.equal(
    outerRows.find((entry) => entry.segment === "dense").selectedFactor,
    0.5
  );
  assert.equal(
    outerRows.find(
      (entry) => entry.segment === "intermittent"
    ).selectedFactor,
    0.5
  );
  assert.equal(
    outerRows.find((entry) => entry.segment === "dormant").selectedFactor,
    1
  );
  assert.equal(
    result.selections.every(
      (selection) => (
        selection.sameOrLaterOuterTruthRead === false
        && selection.postHocFeatureRead === false
      )
    ),
    true
  );

  assert.throws(
    () => buildM2CurrentReliableCandidate(
      comparators,
      features.map((entry, index) => (
        index === 0
          ? { ...entry, historicalFeaturePolicy: "post_hoc_only" }
          : entry
      )),
      testContract
    ),
    /feature_policy_invalid/u
  );
});

test("120-work prediction sample is retired from the current contract", () => {
  assert.equal(currentContract.evaluationPolicy.businessSampleRequired, false);
  assert.equal(
    currentContract.evaluationPolicy.humanRole,
    "post_gate_quality_assurance_only"
  );
  assert.equal(currentContract.businessSample, null);
  assert.deepEqual(
    currentContract.evaluationPolicy.retiredArtifacts,
    [
      "docs/analysis/m2-current/M2-current-business-sample-diagnostic-v0.2.json"
    ]
  );
  assert.equal("businessSample" in currentConfig.publicSources, false);
});

test("current config is the runtime authority for population and horizons", () => {
  assert.throws(
    () => loadM2CurrentPublicEvidence(publicSources(), {
      ...config,
      frozenPopulation: {
        ...config.frozenPopulation,
        modelWorkCount: 825
      }
    }),
    /frozen_population_drift/u
  );
  assert.throws(
    () => buildM2CurrentCaseKey(row(), buildM2CurrentContract({
      ...config,
      allowedHorizons: [6, 12, 18, 24]
    })),
    /horizon_not_allowed/u
  );
});

test("baseline diagnostic is blocked by coverage, failed quality and sealed holdout", () => {
  const gate = evaluateM2CurrentDiagnosticGate(
    loadM2CurrentPublicEvidence(publicSources(), config),
    null,
    config
  );

  assert.equal(gate.status, "BASELINE_ONLY_BLOCKED");
  assert.ok(
    gate.blockers.includes(
      "full_library_cash_observability_below_threshold"
    )
  );
  assert.ok(
    gate.blockers.includes("top10_cash_observability_below_threshold")
  );
  assert.equal(
    gate.blockers.includes("model_eligibility_reason_ledger_missing"),
    false
  );
  assert.equal(
    gate.blockers.includes("served_model_coverage_not_measured"),
    false
  );
  assert.ok(gate.blockers.includes("latest_model_quality_failed"));
  assert.ok(gate.blockers.includes("final_holdout_sealed"));
  assert.equal(gate.modelTrainingAuthorized, true);
  assert.equal(gate.developmentReplayAuthorized, true);
  assert.equal(gate.newCandidateFamilyDevelopmentAuthorized, true);
  assert.equal(gate.releaseAuthorized, false);
});

test("public diagnostic CLI is reproducible and aggregate-only", () => {
  execFileSync(
    process.execPath,
    ["scripts/m2-current/run_m2_current_public_diagnostics.mjs"],
    { encoding: "utf8", windowsHide: true }
  );
  const report = readJson(salesShareConfig.publicOutput);
  const authorityAudit = readJson(
    "docs/analysis/m2-current/M2-current-authority-source-audit-v0.2.json"
  );
  const text = JSON.stringify(report);

  assert.equal(report.schema, "m2.current.public_diagnostic_report.v0.12");
  assert.equal(report.directionAssessment.engineeringSequenceDrifted, true);
  assert.equal(
    report.directionAssessment.retiredSequence,
    "human_numeric_baseline_and_120_work_business_sample_skipped"
  );
  assert.equal(report.evaluationPolicy.humanNumericBaselineRequired, false);
  assert.equal(
    report.evidence.currentCandidate.candidateId,
    "M2-current-sales-share-revenue-service-v0.6"
  );
  assert.ok(report.evidence.currentCandidate.comparison.candidate.wape > 0);
  assert.equal(
    report.evidence.retiredBusinessSample.currentDependency,
    false
  );
  assert.equal(report.evidence.businessSample, null);
  assert.equal(
    report.evidence.automatedEvaluation
      .denseMonthlyDevelopmentDiagnostic.originCount,
    25
  );
  assert.equal(report.gate.candidateOverallGatesPassed, false);
  assert.equal(report.gate.candidateDevelopmentQualityPassed, false);
  assert.equal(report.gate.developmentReplayAuthorized, true);
  assert.equal(
    report.gate.newCandidateFamilyDevelopmentAuthorized,
    false
  );
  assert.equal(report.gate.candidateSelectionAuthorized, false);
  assert.equal(report.gate.modelTrainingAuthorized, false);
  assert.equal(
    authorityAudit.currentAuthorityAfterExecution.developmentReplayAuthorized,
    report.gate.developmentReplayAuthorized
  );
  assert.equal(
    authorityAudit.currentAuthorityAfterExecution
      .newCandidateFamilyDevelopmentAuthorized,
    report.gate.newCandidateFamilyDevelopmentAuthorized
  );
  assert.equal(
    authorityAudit.currentAuthorityAfterExecution
      .candidateSelectionAuthorized,
    report.gate.candidateSelectionAuthorized
  );
  assert.equal(
    authorityAudit.currentAuthorityAfterExecution.modelTrainingAuthorized,
    report.gate.modelTrainingAuthorized
  );
  assert.equal(authorityAudit.privacy.aggregateOnly, true);
  assert.equal(authorityAudit.privacy.requiredForPublicDevelopment, false);
  assert.equal(
    report.evidence.canonicalChannelDevelopment.status,
    "CANONICAL_CHANNEL_DEVELOPMENT_FAIL_KEEP_V0_3"
  );
  assert.equal(
    report.evidence.canonicalChannelDevelopment
      .dataQuality.mapping.mappingCoverage,
    1
  );
  assert.equal(
    report.evidence.canonicalChannelDevelopment
      .decision.promotionDecision,
    "REJECT_KEEP_V0_3_WORK_LEVEL_FALLBACK"
  );
  assert.equal(
    report.evidence.humanAnchoredDevelopment.candidateId,
    "M2-current-human-anchored-hierarchical-probabilistic-v1.0"
  );
  assert.equal(
    report.evidence.humanAnchoredDevelopment.population.authorityWorkCount,
    3053
  );
  assert.equal(
    report.evidence.humanAnchoredDevelopment.population
      .primaryIndependentWorkCount,
    1125
  );
  assert.equal(
    report.evidence.humanAnchoredDevelopment.population.fixed300BookSampleUsed,
    false
  );
  assert.equal(
    report.evidence.humanAnchoredDevelopment.decision.developmentDecision,
    "HUMAN_ANCHORED_DEVELOPMENT_FAIL"
  );
  assert.equal(
    report.evidence.humanAnchoredDevelopment.primary
      .developmentLayerSelection.hierarchyAccepted,
    false
  );
  assert.equal(
    report.evidence.humanAnchoredDevelopment.primary
      .developmentLayerSelection.occurrenceReversalAccepted,
    false
  );
  assert.equal(
    report.evidence.humanAnchoredDevelopment
      .dataQuality.unmaturedLabelZeroImputationCount,
    0
  );
  assert.equal(
    report.evidence.humanAnchoredDevelopment
      .dataQuality.signedCashSeparatedBeforeAggregation,
    true
  );
  assert.equal(
    report.evidence.humanAnchoredDevelopment
      .dataQuality.peerTrendExcludesTargetWork,
    true
  );
  assert.equal(
    report.evidence.humanAnchoredDevelopment
      .temporalMaturity.independentLaterOriginOpened,
    false
  );
  assert.equal(
    report.evidence.humanAnchoredLaterOriginReadiness.decision,
    "NO_QUALIFIED_INDEPENDENT_MATURE_LATER_ORIGIN"
  );
  assert.equal(
    report.evidence.humanAnchoredLaterOriginReadiness
      .candidateBlock.timeBlockCount,
    1
  );
  assert.equal(
    report.evidence.humanAnchoredLaterOriginReadiness
      .frozenModel.stateArtifactPresent,
    false
  );
  assert.equal(
    report.evidence.humanAnchoredLaterOriginReadiness
      .validation.metricsRead,
    false
  );
  assert.equal(
    report.gate.status,
    "CANDIDATE_DEVELOPMENT_FAIL_BLOCKED"
  );
  assert.equal(
    report.evidence.coverage.economicScope.modelTarget,
    "sales_share_cash_only"
  );
  assert.equal(
    report.evidence.coverage.economicScope.allCompanyCashCoverageClaimed,
    false
  );
  assert.equal(report.evidence.coverage.targetClassification.passed, true);
  assert.equal(
    report.gate.blockers.includes(
      "sales_share_target_classification_uncertainty_unresolved"
    ),
    false
  );
  assert.equal(
    report.gate.developmentDirection,
    "later_origin_not_qualified_wait_for_2029_01_complete_labels_and_original_frozen_v1_state"
  );
  assert.ok(
    report.gate.blockers.includes(
      "candidate_absolute_wape_above_development_threshold"
    )
  );
  assert.equal(report.gate.releaseAuthorized, false);
  assert.doesNotMatch(text, /data\/private-/u);
  assert.doesNotMatch(text, /postgres(?:ql)?:\/\//u);
  assert.doesNotMatch(text, /standardWorkId/u);

  assert.equal(
    execFileSync(
      process.execPath,
      ["scripts/m2-current/run_m2_current_public_diagnostics.mjs", "--verify"],
      { encoding: "utf8", windowsHide: true }
    ).trim(),
    "M2 current public diagnostic output verified."
  );
});

test("sales-share evidence treats historical total-cash coverage as disclosure", () => {
  const sources = salesSharePublicSources();
  sources.coverage.observationGates
    .fullLibraryForecastableCashCoverageMinimum = 0.123;
  sources.coverage.observationGates
    .top10ForecastableCashCoverageMinimum = 0.456;

  const evidence = loadM2CurrentPublicEvidence(sources, salesShareConfig);

  assert.equal(evidence.coverage.cashObservability.fullLibraryRequired, null);
  assert.equal(evidence.coverage.cashObservability.top10Required, null);
  assert.equal(
    evidence.coverage.economicScope.allCompanyCashCoverageClaimed,
    false
  );
  assert.equal(
    evidence.coverage.workLevelSignals.contractStatus,
    "IMPLEMENTED"
  );
  assert.equal(
    evidence.coverage.workLevelSignals.frozen.workOriginSegmentCount,
    2402
  );
  assert.equal(
    evidence.coverage.workLevelSignals.frozen.occurrenceCoverage,
    0
  );
  assert.equal(
    evidence.coverage.workLevelSignals.readiness.authorizesNewCandidateFamily,
    false
  );
  assert.deepEqual(
    evidence.coverage.workLevelSignals.sourceInventory,
    {
      auditedSourceRoleCount: 4,
      eligibleObservedAsOfSourceRoleCount: 0,
      existingAuthorityCanPopulateObservedSnapshots: false,
      portableIntakeImplemented: true,
      nextAction:
        "obtain_versioned_complete_historical_snapshots_with_record_level_economic_posting_and_available_at_times"
    }
  );
});

test("sales-share evidence rejects source-inventory eligibility drift", () => {
  const sources = salesSharePublicSources();
  sources.signalSourceInventory = structuredClone(
    sources.signalSourceInventory
  );
  sources.signalSourceInventory.sourceRoles.formalIncomeFactExtract
    .observedAsOfEligible = true;
  sources.signalSourceInventory.eligibleObservedAsOfSourceRoleCount = 1;

  assert.throws(
    () => loadM2CurrentPublicEvidence(sources, salesShareConfig),
    /m2_current_signal_gap_population_or_boundary_drift/
  );
});

test("revenue-share facts preserve event, three-time and lineage semantics", () => {
  const sale = revenueFact();
  const refund = revenueFact({
    factId: "SYN-FACT-REFUND",
    eventType: "refund",
    cashAmount: -20,
    economicTime: "2022-01-10T00:00:00Z",
    postingTime: "2022-01-11T00:00:00Z",
    availableAt: "2022-01-12T00:00:00Z",
    source: syntheticFactSource("refund")
  });
  const reversal = revenueFact({
    factId: "SYN-FACT-REVERSAL",
    eventType: "reversal",
    cashAmount: 10,
    economicTime: "2022-01-13T00:00:00Z",
    postingTime: "2022-01-14T00:00:00Z",
    availableAt: "2022-01-15T00:00:00Z",
    source: syntheticFactSource("reversal"),
    lineage: {
      transformId: "synthetic-transform",
      transformVersion: "v0.1",
      parentFactIds: ["SYN-FACT-REFUND"]
    },
    reversesFactId: "SYN-FACT-REFUND"
  });
  const facts = validateM2CurrentRevenueShareFacts([
    sale,
    refund,
    reversal
  ]);
  const asOf = selectM2CurrentRevenueShareFactsAsOf(
    facts,
    "2022-01-12T23:59:59.999Z"
  );

  assert.deepEqual(
    facts.map((fact) => fact.eventType),
    ["sale", "refund", "reversal"]
  );
  assert.equal(facts.every((fact) => fact.buyoutIncluded === false), true);
  assert.equal(facts[0].source.version, "synthetic-v0.1");
  assert.deepEqual(
    facts[2].lineage.parentFactIds,
    ["SYN-FACT-REFUND"]
  );
  assert.deepEqual(
    asOf.map((fact) => fact.factId),
    ["SYN-FACT-SALE", "SYN-FACT-REFUND"]
  );
  assert.throws(
    () => buildM2CurrentRevenueShareFact(revenueFact({
      factId: "SYN-BAD-TIME",
      postingTime: "2022-01-09T00:00:00Z",
      availableAt: "2022-01-08T00:00:00Z",
      source: syntheticFactSource("bad-time")
    })),
    /time_order_invalid/u
  );
  assert.throws(
    () => buildM2CurrentRevenueShareFact(revenueFact({
      factId: "SYN-BAD-REFUND",
      eventType: "refund",
      cashAmount: 20,
      source: syntheticFactSource("bad-refund")
    })),
    /refund_amount_not_negative/u
  );
  assert.throws(
    () => buildM2CurrentRevenueShareFact(revenueFact({
      factId: "SYN-BAD-DATE",
      economicTime: "2022-02-31T00:00:00Z",
      postingTime: "2022-02-31T00:00:00Z",
      availableAt: "2022-02-31T00:00:00Z",
      source: syntheticFactSource("bad-date")
    })),
    /economic_time_invalid/u
  );
  assert.throws(
    () => validateM2CurrentRevenueShareFacts([
      revenueFact({
        factId: "SYN-CYCLE-A",
        eventType: "reversal",
        cashAmount: 10,
        source: syntheticFactSource("cycle-a"),
        lineage: {
          transformId: "synthetic-transform",
          transformVersion: "v0.1",
          parentFactIds: ["SYN-CYCLE-B"]
        },
        reversesFactId: "SYN-CYCLE-B"
      }),
      revenueFact({
        factId: "SYN-CYCLE-B",
        eventType: "reversal",
        cashAmount: -10,
        source: syntheticFactSource("cycle-b"),
        lineage: {
          transformId: "synthetic-transform",
          transformVersion: "v0.1",
          parentFactIds: ["SYN-CYCLE-A"]
        },
        reversesFactId: "SYN-CYCLE-A"
      })
    ]),
    /reversal_cycle/u
  );
});

test("availability snapshots require historical authority or remain unknown", () => {
  const observed = buildM2CurrentAvailabilitySnapshot({
    snapshotId: "SYN-SNAPSHOT-OBSERVED",
    standardWorkId: "SYN-WORK-D1",
    currency: "CNY",
    origin: "2022-01",
    segment: "dense",
    status: "observed_as_of",
    facts: [revenueFact()],
    authority: syntheticSnapshotAuthority("observed")
  });
  const unknown = buildM2CurrentUnknownAvailabilitySnapshot({
    snapshotId: "SYN-SNAPSHOT-UNKNOWN",
    standardWorkId: "SYN-WORK-UNKNOWN",
    currency: "CNY",
    origin: "2022-01",
    segment: "intermittent",
    missingReason: "historical_snapshot_absent"
  });

  assert.equal(observed.signals.occurrence.value, true);
  assert.equal(observed.signals.positiveAmount.value, 100);
  assert.equal(
    observed.signals.occurrence.semantic,
    "historical_net_sales_share_cash_positive_as_of_snapshot"
  );
  assert.equal(
    observed.signals.positiveAmount.semantic,
    "historical_net_sales_share_cash_as_of_snapshot"
  );
  assert.equal(observed.amounts.netSalesShareCash, 100);
  assert.equal(observed.currentStateBackfillUsed, false);
  assert.equal(unknown.status, "unknown_at_origin");
  assert.equal(unknown.signals.occurrence.value, null);
  assert.equal(unknown.signals.positiveAmount.value, null);
  assert.throws(
    () => buildM2CurrentAvailabilitySnapshot({
      snapshotId: "SYN-SNAPSHOT-BACKFILL",
      standardWorkId: "SYN-WORK-D1",
      currency: "CNY",
      origin: "2022-01",
      segment: "dense",
      status: "observed_as_of",
      facts: [revenueFact()],
      authority: syntheticSnapshotAuthority("backfill"),
      currentStateBackfillUsed: true
    }),
    /current_state_backfill_forbidden/u
  );
  assert.throws(
    () => buildM2CurrentAvailabilitySnapshot({
      snapshotId: "SYN-SNAPSHOT-FUTURE",
      standardWorkId: "SYN-WORK-D1",
      currency: "CNY",
      origin: "2022-01",
      segment: "dense",
      status: "observed_as_of",
      facts: [revenueFact()],
      authority: {
        ...syntheticSnapshotAuthority("future"),
        availableAt: "2022-02-01T00:00:00Z"
      }
    }),
    /authority_not_available_at_origin/u
  );
  assert.throws(
    () => buildM2CurrentAvailabilitySnapshot({
      snapshotId: "SYN-SNAPSHOT-CURRENCY",
      standardWorkId: "SYN-WORK-D1",
      currency: "USD",
      origin: "2022-01",
      segment: "dense",
      status: "observed_as_of",
      facts: [revenueFact()],
      authority: syntheticSnapshotAuthority("currency")
    }),
    /fact_currency_mismatch/u
  );
});

test("signal gap ledger measures work-origin-segment two-part readiness", () => {
  const cases = [
    signalCase("SYN-DENSE", "dense", 3),
    signalCase("SYN-DENSE", "dense", 6),
    signalCase("SYN-INTERMITTENT", "intermittent", 3),
    signalCase("SYN-DORMANT", "dormant", 3)
  ];
  const ledger = buildM2CurrentSignalGapLedger(cases, [
    {
      snapshotId: "SYN-DENSE-SNAPSHOT",
      standardWorkId: "SYN-DENSE",
      currency: "CNY",
      origin: "2022-01",
      segment: "dense",
      status: "observed_as_of",
      facts: [revenueFact({ standardWorkId: "SYN-DENSE" })],
      authority: syntheticSnapshotAuthority("dense")
    },
    {
      snapshotId: "SYN-INTERMITTENT-SNAPSHOT",
      standardWorkId: "SYN-INTERMITTENT",
      currency: "CNY",
      origin: "2022-01",
      segment: "intermittent",
      status: "unknown_at_origin",
      facts: [],
      authority: null,
      missingReason: "historical_snapshot_absent"
    },
    {
      snapshotId: "SYN-DORMANT-SNAPSHOT",
      standardWorkId: "SYN-DORMANT",
      currency: "CNY",
      origin: "2022-01",
      segment: "dormant",
      status: "observed_as_of",
      facts: [],
      authority: syntheticSnapshotAuthority("dormant")
    }
  ]);
  const summary = summarizeM2CurrentSignalGapLedger(ledger);

  assert.equal(ledger.inputCaseCount, 4);
  assert.equal(ledger.workOriginSegmentCount, 3);
  assert.equal(ledger.overall.occurrence.availableCount, 2);
  assert.equal(ledger.overall.occurrence.coverage, 2 / 3);
  assert.equal(ledger.overall.positiveAmount.availableCount, 1);
  assert.equal(ledger.overall.positiveAmount.notApplicableCount, 1);
  assert.equal(
    ledger.overall.positiveAmount.twoPartReadinessCoverage,
    2 / 3
  );
  assert.equal(
    ledger.bySegment.intermittent.occurrence.missingCount,
    1
  );
  assert.deepEqual(
    ledger.missingReasons,
    { historical_snapshot_absent: 1 }
  );
  assert.equal(
    ledger.readiness.status,
    "AS_OF_SIGNAL_COVERAGE_GAPS_PRESENT"
  );
  assert.equal(ledger.readiness.authorizesNewCandidateFamily, false);
  assert.equal(summary.aggregateOnly, true);
  assert.equal(summary.rowIdentifiersIncluded, false);
  assert.equal("rows" in summary, false);
  assert.equal(ledger.invariants.nullImputedAsZero, false);
});

test("missing snapshots become unknown_at_origin without zero imputation", () => {
  const ledger = buildM2CurrentSignalGapLedger(
    [signalCase("SYN-MISSING", "dormant", 3)],
    []
  );

  assert.equal(ledger.rows[0].availabilityStatus, "unknown_at_origin");
  assert.equal(ledger.rows[0].occurrenceValue, null);
  assert.equal(ledger.rows[0].positiveAmountValue, null);
  assert.equal(
    ledger.rows[0].missingReason,
    "availability_snapshot_missing"
  );
  assert.equal(ledger.overall.occurrence.coverage, 0);
  assert.equal(ledger.overall.positiveAmount.twoPartReadinessCoverage, 0);
});

test("current config grants candidate development but no downstream authority", () => {
  assert.deepEqual(
    currentConfig.archiveOnlyDevelopmentRoutes,
    ["C1", "C2-R", "C2-R.1", "C2", "C3"]
  );
  assert.equal(currentConfig.authorizations.modelTraining, true);
  assert.equal(currentConfig.authorizations.provider, false);
  assert.equal(currentConfig.authorizations.database, false);
  assert.equal(currentConfig.authorizations.holdout, false);
  assert.equal(currentConfig.authorizations.release, false);
  assert.equal(currentConfig.authorizations.m3Formal, false);
  assert.equal(
    currentContract.evaluationPolicy.nextDevelopmentReadiness,
    "BUSINESS_COVERAGE_AND_ABSOLUTE_QUALITY_REQUIRED"
  );
  assert.equal(
    currentContract.evaluationPolicy.humanNumericBaselineRequired,
    false
  );
  assert.equal(
    currentConfig.primaryComparator,
    "M2-current-hierarchical-robust-calibration-v0.2"
  );
  assert.equal(
    currentConfig.publicOutput,
    "docs/analysis/m2-current/M2-current-public-diagnostic-v0.4.json"
  );
  assert.equal(currentContract.schema, "m2.current.config.v0.3");
  assert.equal(
    loadM2CurrentPublicEvidence(currentPublicSources(), currentConfig)
      .retiredBusinessSample.currentDependency,
    false
  );
});

test("manual channel rule separates stable main and edge channel forecasts", () => {
  const result = forecastM2CurrentManualChannelRule({
    origin: "2020-12",
    horizonMonths: 36,
    rightsStartMonth: "2018-01",
    channels: [
      manualChannel("MAIN", Array(12).fill(100)),
      manualChannel("EDGE", Array(12).fill(10))
    ]
  }, manualChannelPolicy({ mainChannelMaximum: 1 }));

  assert.equal(result.lifecycleAgeMonths, 36);
  assert.equal(result.lifecycleContributionShare, 0.5);
  assert.equal(result.mainChannelCount, 1);
  assert.equal(result.edgeChannelCount, 1);
  assert.equal(result.stableMainChannelCount, 1);
  assert.equal(result.decliningMainChannelCount, 0);
  assert.equal(result.mainForecast, 2400);
  assert.equal(result.edgeForecast, 60);
  assert.equal(result.pointEstimate, 2460);
  assert.equal(result.top1TrailingRevenueShare, 1200 / 1320);
  assert.equal(result.top2TrailingRevenueShare, 1);
});

test("manual channel rule annualizes a declining latest month", () => {
  const result = forecastM2CurrentManualChannelRule({
    origin: "2020-12",
    horizonMonths: 36,
    rightsStartMonth: "2018-01",
    channels: [
      manualChannel("DECLINING", [
        100, 100, 100, 100, 100, 100,
        100, 100, 100, 100, 100, 20
      ])
    ]
  }, manualChannelPolicy());

  assert.equal(result.stableMainChannelCount, 0);
  assert.equal(result.decliningMainChannelCount, 1);
  assert.equal(result.mainForecast, 480);
  assert.equal(result.pointEstimate, 480);
  assert.equal(
    result.components[0].branch,
    "main_declining_latest_month_annualized"
  );
});

test("manual channel lifecycle share reaches 40 percent at month 60", () => {
  const result = forecastM2CurrentManualChannelRule({
    origin: "2020-12",
    horizonMonths: 36,
    rightsStartMonth: "2016-01",
    channels: [manualChannel("LONG-LIVED", Array(12).fill(100))]
  }, manualChannelPolicy());

  assert.equal(result.lifecycleAgeMonths, 60);
  assert.equal(result.lifecycleContributionShare, 0.4);
  assert.equal(result.pointEstimate, 3000);
});

test("manual channel rule rejects a horizon outside its business contract", () => {
  assert.throws(
    () => forecastM2CurrentManualChannelRule({
      origin: "2020-12",
      horizonMonths: 12,
      rightsStartMonth: "2018-01",
      channels: [manualChannel("MAIN", Array(12).fill(100))]
    }, manualChannelPolicy()),
    /m2_current_manual_channel_horizon_mismatch/u
  );
});

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function manualChannelPolicy(overrides = {}) {
  return {
    horizonMonths: 36,
    recentMonths: 12,
    mainChannelMaximum: 3,
    latestToAverageFloor: 0.8,
    edgeHistoricalShare: 0.5,
    annualLevelMultiplier: 1,
    lifecycleContribution: {
      year3Month: 36,
      year3Share: 0.5,
      year5Month: 60,
      year5Share: 0.4
    },
    ...overrides
  };
}

function manualChannel(channelId, values) {
  const months = [];
  for (let index = 0; index < values.length; index += 1) {
    const month = index + 1;
    months.push(`2020-${String(month).padStart(2, "0")}`);
  }
  return { channelId, months, values };
}

function revenueFact(overrides = {}) {
  return {
    factId: "SYN-FACT-SALE",
    standardWorkId: "SYN-WORK-D1",
    channelId: "SYN-CHANNEL",
    currency: "CNY",
    eventType: "sale",
    cashAmount: 100,
    economicTime: "2022-01-01T00:00:00Z",
    postingTime: "2022-01-02T00:00:00Z",
    availableAt: "2022-01-03T00:00:00Z",
    source: syntheticFactSource("sale"),
    lineage: {
      transformId: "synthetic-transform",
      transformVersion: "v0.1",
      parentFactIds: []
    },
    ...overrides
  };
}

function syntheticFactSource(recordId) {
  return {
    system: "synthetic-system",
    dataset: "synthetic-revenue-share-facts",
    version: "synthetic-v0.1",
    recordId,
    contentHashSha256: "a".repeat(64)
  };
}

function syntheticSnapshotAuthority(recordId) {
  return {
    system: "synthetic-system",
    dataset: "synthetic-availability-snapshots",
    version: "synthetic-v0.1",
    recordId,
    availableAt: "2022-01-20T00:00:00Z",
    contentHashSha256: "b".repeat(64),
    completeness: "complete_as_of_snapshot"
  };
}

function signalCase(standardWorkId, segment, horizonMonths) {
  return {
    standardWorkId,
    origin: "2022-01",
    horizonMonths,
    route: "pure_sales_share",
    segment
  };
}

test("human-reviewed ledger membership is the only current cash-category authority", () => {
  const config = JSON.parse(readFileSync(
    "config/m2-current-human-ledger-partition.v0.1.json",
    "utf8"
  ));
  assert.equal(
    config.authorityMode,
    "user_reviewed_workbook_membership"
  );
  assert.equal(
    config.cashCategoryContract.machineClassificationAllowed,
    false
  );
  assert.equal(
    config.cashCategoryContract.salesShare.forecastFeatureAllowed,
    true
  );
  assert.equal(
    config.cashCategoryContract.buyout.forecastFeatureAllowed,
    false
  );
  assert.equal(
    config.cashCategoryContract.buyout.ratingHistoricalContextAllowed,
    true
  );
  assert.equal(
    config.cashCategoryContract.buyout.notCashForecast,
    true
  );

  const output = execFileSync(
    process.execPath,
    ["scripts/run-codex-python.mjs", "-"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      input: `
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path.cwd() / "scripts" / "m2-real-data"))
import m2_formal_cash_target_v1 as kernel
spec = {
    "authority": {"firstBillMonth": "2020-01"},
    "revenueRouting": {"classifierParameters": {}},
}
share = kernel.classify_channel_as_of(
    {"cash_category": "sales_share", "monthly": {"2020-01": 100}},
    "2020-01",
    spec,
)
buyout = kernel.classify_channel_as_of(
    {"cash_category": "buyout", "monthly": {"2020-01": -20}},
    "2020-01",
    spec,
)
print(json.dumps({"share": share, "buyout": buyout}))
`
    }
  );
  const result = JSON.parse(output);
  assert.equal(result.share.label, "sales_share_channel");
  assert.equal(result.share.machineClassificationUsed, false);
  assert.deepEqual(result.share.buyoutEventMonths, []);
  assert.equal(result.buyout.label, "buyout_channel");
  assert.equal(result.buyout.machineClassificationUsed, false);
  assert.deepEqual(result.buyout.buyoutEventMonths, ["2020-01"]);
});
