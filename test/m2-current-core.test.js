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
  buildM2CurrentAutomatedBaselineEvaluation
} from "../src/domain/m2Current/baselines.js";
import {
  resolveM2CurrentCashRoute
} from "../src/domain/m2Current/route.js";
import {
  buildM2CurrentFormalCashTarget,
  serveM2CurrentPointForecast
} from "../src/domain/m2Current/target.js";

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
const reliableConfig = readJson("config/m2-current.v0.2.json");

function currentPublicSources() {
  return Object.fromEntries(
    Object.entries(currentConfig.publicSources)
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
    revenueModel: "pure_buyout",
    origin: "2022-12",
    commitment: {
      confirmedAsOf: "2022-11",
      outstandingAmount: 2500,
      signed: true,
      confirmed: true,
      auditable: true
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
  assert.equal(gate.releaseAuthorized, false);
});

test("public diagnostic CLI is reproducible and aggregate-only", () => {
  execFileSync(
    process.execPath,
    ["scripts/m2-current/run_m2_current_public_diagnostics.mjs"],
    { encoding: "utf8", windowsHide: true }
  );
  const report = readJson(currentConfig.publicOutput);
  const text = JSON.stringify(report);

  assert.equal(report.schema, "m2.current.public_diagnostic_report.v0.4");
  assert.equal(report.directionAssessment.engineeringSequenceDrifted, false);
  assert.equal(
    report.directionAssessment.retiredSequence,
    "human_numeric_baseline_and_120_work_business_sample"
  );
  assert.equal(report.evaluationPolicy.humanNumericBaselineRequired, false);
  assert.equal(
    report.evidence.currentCandidate.candidateId,
    "M2-current-occurrence-amount-calibration-v0.3"
  );
  assert.equal(
    report.evidence.currentCandidate.comparison.candidate.wape,
    0.50557140186362
  );
  assert.equal(
    report.evidence.retiredBusinessSample.currentDependency,
    false
  );
  assert.equal(report.evidence.businessSample, null);
  assert.equal(
    report.evidence.automatedEvaluation.design.monthlyRollingOrigin,
    true
  );
  assert.equal(report.gate.candidateOverallGatesPassed, true);
  assert.equal(report.gate.candidateDevelopmentQualityPassed, false);
  assert.equal(report.gate.status, "CANDIDATE_DEVELOPMENT_PARTIAL_BLOCKED");
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

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}
