import { buildM2CurrentContract } from "./contract.js";

export function loadM2CurrentPublicEvidence(sources, config) {
  const contract = buildM2CurrentContract(config);
  requireSchema(sources?.limitation, "m2.v2.b4-limitation-analysis.v1");
  requireSchema(
    sources?.coverage,
    "m2.formal_cash_population_business_coverage.public.v1"
  );
  requireSchema(sources?.terminal, "m2.terminal_model_route_summary.v1");
  requireSchema(sources?.modelDecision, "m2.c3_model_quality_decision.v1");
  requireSchema(sources?.businessDecision, "m2.c3_business_coverage_decision.v1");
  requireSchema(sources?.segments, "m2.c2_activity_segment_route_manifest.v1");
  requireSchema(sources?.development, "m2.c3_development_validation.v1");
  requireSchema(sources?.population, "m2.calibration_population_coverage.v1");
  requireSchema(
    sources?.candidate,
    "m2.current.segmented_candidate.public.v0.1"
  );

  const segmentCaseCount = Object.values(sources.segments.segments)
    .reduce((sum, segment) => sum + Number(segment.caseCount), 0);
  if (segmentCaseCount !== contract.population.modelCaseCount) {
    throw new Error("m2_current_segment_case_population_drift");
  }
  const actualSegmentNames = Object.keys(sources.segments.segments).sort();
  const expectedSegmentNames = [...contract.activitySegmentValues].sort();
  if (JSON.stringify(actualSegmentNames) !== JSON.stringify(expectedSegmentNames)) {
    throw new Error("m2_current_activity_segment_set_drift");
  }
  const technical = sources.development.technicalSummary;
  const sourcePopulation = {
    libraryWorkCount: Number(sources.coverage.scope.standardWorkCount),
    modelWorkCount: Number(technical.modelPopulationWorkCount),
    modelCaseCount: Number(technical.modelPopulationCaseCount)
  };
  if (
    Object.entries(contract.population)
      .some(([key, value]) => sourcePopulation[key] !== value)
  ) {
    throw new Error("m2_current_frozen_population_drift");
  }
  const reasonDistribution = sources.population.unscoreableReasons.distribution;
  const notObservableCount = Number(
    reasonDistribution
      .not_observable_at_any_frozen_development_origin.count
  );
  const insufficientHistoryCount = Number(
    reasonDistribution
      .insufficient_observed_calendar_history_at_every_eligible_origin.count
  );
  const scoreableWorkCount = Number(
    sources.population.population.scoreableWorkCount
  );
  const formalCashRouteExcludedWorkCount =
    scoreableWorkCount - contract.population.modelWorkCount;
  if (
    notObservableCount + insufficientHistoryCount
      !== Number(sources.population.population.unscoreableWorkCount)
    || notObservableCount + insufficientHistoryCount
      + formalCashRouteExcludedWorkCount
      + contract.population.modelWorkCount
      !== contract.population.libraryWorkCount
  ) {
    throw new Error("m2_current_model_eligibility_reason_ledger_drift");
  }
  if (
    Number(sources.candidate.scope.caseCount)
      !== contract.population.modelCaseCount
    || Number(sources.candidate.scope.uniqueWorkCount)
      !== contract.population.modelWorkCount
    || sources.candidate.scope.populationMoved !== false
  ) {
    throw new Error("m2_current_candidate_population_drift");
  }
  const actualHorizons = Object.keys(sources.development.metrics.byHorizon)
    .map(Number)
    .sort((a, b) => a - b);
  const expectedHorizons = [...contract.allowedHorizonValues]
    .sort((a, b) => a - b);
  if (JSON.stringify(actualHorizons) !== JSON.stringify(expectedHorizons)) {
    throw new Error("m2_current_horizon_set_drift");
  }
  const observedCoverageThreshold = Number(
    sources.coverage.observationGates.forecastableCashShareMinimumRecommended
  );
  const observedTop10Threshold = Number(
    sources.coverage.observationGates.top10ForecastableCashCoverageMinimum
  );
  if (
    observedCoverageThreshold
      !== contract.thresholds.fullLibraryForecastableCashCoverageMinimum
    || observedTop10Threshold
      !== contract.thresholds.top10ForecastableCashCoverageMinimum
  ) {
    throw new Error("m2_current_coverage_threshold_drift");
  }
  const seals = [
    sources.coverage.seals,
    sources.terminal.seals,
    sources.modelDecision.seals,
    sources.businessDecision.seals,
    sources.segments.seals
  ];
  if (seals.some((item) => Object.values(item).some(Boolean))) {
    throw new Error("m2_current_seal_opened");
  }

  return {
    schema: "m2.current.public_evidence.v0.1",
    decisionStatus: "not_for_formal_decision",
    population: {
      libraryWorkCount: contract.population.libraryWorkCount,
      modelWorkCount: contract.population.modelWorkCount,
      modelCaseCount: segmentCaseCount,
      modelWorkShare:
        contract.population.modelWorkCount / contract.population.libraryWorkCount
    },
    coverage: {
      cashObservability: {
        fullLibrary:
          sources.coverage.cashCoverage.forecastableCashShareOfLedgerCash,
        top1: sources.coverage.topBands.top1.forecastableCashCoverage,
        top5: sources.coverage.topBands.top5.forecastableCashCoverage,
        top10: sources.coverage.topBands.top10.forecastableCashCoverage,
        fullLibraryRequired:
          contract.thresholds.fullLibraryForecastableCashCoverageMinimum,
        top10Required:
          contract.thresholds.top10ForecastableCashCoverageMinimum,
        uncommittedCashShare:
          sources.coverage.cashCoverage.classifierExposureShareOfLedgerCash
      },
      modelEligibility: {
        eligibleWorkCount: contract.population.modelWorkCount,
        excludedWorkCount:
          contract.population.libraryWorkCount - contract.population.modelWorkCount,
        totalWorkCount: contract.population.libraryWorkCount,
        workShare:
          contract.population.modelWorkCount / contract.population.libraryWorkCount,
        reasonLedgerStatus: "AVAILABLE",
        reasons: {
          notObservableAtAnyFrozenDevelopmentOrigin: notObservableCount,
          insufficientHistoryAtEveryEligibleOrigin: insufficientHistoryCount,
          formalCashRouteExcluded: formalCashRouteExcludedWorkCount
        },
        reasonsExhaustive: true,
        reasonsMutuallyExclusive: true,
        routeReasonBreakdownSuppressed: true
      },
      served: {
        status: "MEASURED",
        caseCount: sources.candidate.scope.caseCount,
        caseShareOfFrozenModelPopulation: 1,
        workCount: sources.candidate.scope.uniqueWorkCount,
        workShareOfFrozenModelPopulation: 1,
        workShareOfLibrary:
          contract.population.modelWorkCount / contract.population.libraryWorkCount,
        cashShareOfFrozenModelPopulation: 1,
        fullLibraryCashShare: null,
        fullLibraryCashShareReason:
          "overlapping_development_cases_are_not_a_full_library_cash_denominator"
      }
    },
    segments: Object.fromEntries(
      Object.entries(sources.segments.segments).map(([name, segment]) => [
        name,
        {
          caseCount: segment.caseCount,
          workCount: segment.workCount,
          wape: segment.metrics.wape,
          signedBias: segment.metrics.signedAggregateBias
        }
      ])
    ),
    b4: sources.terminal.routeResults.B4,
    historicalLastCandidate: sources.terminal.routeResults.C3,
    currentCandidate: {
      candidateId: sources.candidate.candidateId,
      comparison: sources.candidate.comparison,
      byHorizon: sources.candidate.byHorizon,
      pairedCi: sources.candidate.pairedCi,
      acceptance: sources.candidate.acceptance
    },
    modelQualityDecision: sources.modelDecision.modelQualityDecision,
    businessCoverageDecision: sources.businessDecision.businessCoverageDecision,
    seals: {
      finalHoldoutOpened: false,
      embargoShadowOpened: false,
      deferred60MonthLabelsOpened: false
    },
    sourceBoundary: {
      aggregateOnly: true,
      privateRowsRead: false,
      databaseConnected: false,
      providerCalled: false
    }
  };
}

function requireSchema(document, expected) {
  if (document?.schema !== expected) {
    throw new Error(`m2_current_source_schema_mismatch:${expected}`);
  }
}
