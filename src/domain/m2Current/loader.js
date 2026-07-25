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
  if (config.schema === "m2.current.config.v0.6") {
    requireSchema(
      sources?.signalGap,
      "m2.current.signal_gap_diagnostic.public.v0.1"
    );
    requireSchema(
      sources?.signalSourceInventory,
      "m2.current.as_of_source_inventory.public.v0.1"
    );
  }
  const currentCandidateSchema = config.schema === "m2.current.config.v0.6"
    ? "m2.current.sales_share_candidate.public.v0.6"
    : config.schema === "m2.current.config.v0.5"
    ? "m2.current.multi_resolution_candidate.public.v0.5"
    : config.schema === "m2.current.config.v0.4"
      ? "m2.current.global_distributional_candidate.public.v0.4"
    : config.schema === "m2.current.config.v0.3"
      ? "m2.current.occurrence_amount_candidate.public.v0.3"
      : config.schema === "m2.current.config.v0.2"
        ? "m2.current.reliable_candidate.public.v0.2"
        : "m2.current.segmented_candidate.public.v0.1";
  requireSchema(sources?.candidate, currentCandidateSchema);
  if (config.schema !== "m2.current.config.v0.1") {
    requireSchema(
      sources?.previousCandidate,
      config.schema === "m2.current.config.v0.6"
        ? "m2.current.multi_resolution_candidate.public.v0.5"
        : config.schema === "m2.current.config.v0.5"
        ? "m2.current.global_distributional_candidate.public.v0.4"
        : config.schema === "m2.current.config.v0.4"
          ? "m2.current.occurrence_amount_candidate.public.v0.3"
        : config.schema === "m2.current.config.v0.3"
          ? "m2.current.reliable_candidate.public.v0.2"
          : "m2.current.segmented_candidate.public.v0.1"
    );
  }
  if (config.schema === "m2.current.config.v0.2") {
    requireSchema(
      sources?.businessSample,
      "m2.current.business_sample.public.v0.2"
    );
  }
  if (
    [
      "m2.current.config.v0.3",
      "m2.current.config.v0.4",
      "m2.current.config.v0.5",
      "m2.current.config.v0.6"
    ]
      .includes(config.schema)
  ) {
    requireSchema(
      sources?.automatedEvaluation,
      config.schema === "m2.current.config.v0.6"
        ? "m2.current.automated_evaluation.public.v0.4"
        : config.schema === "m2.current.config.v0.5"
        ? "m2.current.automated_evaluation.public.v0.3"
        : config.schema === "m2.current.config.v0.4"
          ? "m2.current.automated_evaluation.public.v0.2"
        : "m2.current.automated_evaluation.public.v0.1"
    );
  }

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
  const candidateCaseCount = Number(
    [
      "m2.current.config.v0.4",
      "m2.current.config.v0.5",
      "m2.current.config.v0.6"
    ]
      .includes(config.schema)
      ? sources.candidate.scope.frozenDecisionCaseCount
      : sources.candidate.scope.caseCount
  );
  const candidateWorkCount = Number(
    [
      "m2.current.config.v0.4",
      "m2.current.config.v0.5",
      "m2.current.config.v0.6"
    ]
      .includes(config.schema)
      ? sources.candidate.scope.frozenDecisionWorkCount
      : sources.candidate.scope.uniqueWorkCount
  );
  if (
    candidateCaseCount !== contract.population.modelCaseCount
    || candidateWorkCount !== contract.population.modelWorkCount
    || sources.candidate.scope.populationMoved !== false
  ) {
    throw new Error("m2_current_candidate_population_drift");
  }
  if (config.schema === "m2.current.config.v0.6") {
    const frozenSignalGap =
      sources.signalGap.coverageInventory.frozenAuthorityPopulation;
    const denseSignalGap =
      sources.signalGap.coverageInventory.denseMonthlyDiagnosticPopulation;
    if (
      Number(frozenSignalGap.inputCaseCount)
        !== contract.population.modelCaseCount
      || Number(frozenSignalGap.uniqueWorkCount)
        !== contract.population.modelWorkCount
      || Number(denseSignalGap.uniqueWorkCount)
        !== contract.population.modelWorkCount
      || sources.signalGap.sourceBoundary.aggregateOnly !== true
      || sources.signalGap.sourceBoundary.rowIdentifiersIncluded !== false
      || sources.signalGap.invariants.populationRowsDropped !== false
      || sources.signalGap.invariants.nullImputedAsZero !== false
      || sources.signalGap.invariants.currentStateBackfillUsed !== false
      || sources.signalSourceInventory.auditedSourceRoleCount !== 4
      || Object.keys(sources.signalSourceInventory.sourceRoles ?? {})
        .length !== sources.signalSourceInventory.auditedSourceRoleCount
      || sources.signalSourceInventory
        .eligibleObservedAsOfSourceRoleCount !== 0
      || Object.values(
        sources.signalSourceInventory.sourceRoles ?? {}
      ).some((sourceRole) => sourceRole?.observedAsOfEligible !== false)
      || sources.signalSourceInventory
        .readiness.existingAuthorityCanPopulateObservedSnapshots !== false
      || sources.signalSourceInventory
        .readiness.portableIntakeImplemented !== true
      || sources.signalSourceInventory
        .readiness.twoPartDevelopmentReady !== false
      || sources.signalSourceInventory
        .acceptedInputContract.currentStateBackfillAllowed !== false
      || sources.signalSourceInventory
        .acceptedInputContract.unknownAtOriginRequiredWhenAuthorityMissing
          !== true
      || sources.signalSourceInventory
        .acceptedInputContract.canonicalCasePopulationFingerprintBound
          !== true
      || sources.signalSourceInventory
        .acceptedInputContract.singleTargetCurrencyRequiredPerBundle
          !== true
      || sources.signalSourceInventory
        .boundaries.rowIdentifiersPublished !== false
    ) {
      throw new Error("m2_current_signal_gap_population_or_boundary_drift");
    }
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
    config.schema !== "m2.current.config.v0.6"
    && (
      observedCoverageThreshold
        !== contract.thresholds.fullLibraryForecastableCashCoverageMinimum
      || observedTop10Threshold
        !== contract.thresholds.top10ForecastableCashCoverageMinimum
    )
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
    schema: config.schema === "m2.current.config.v0.6"
      ? "m2.current.public_evidence.v0.6"
      : config.schema === "m2.current.config.v0.5"
      ? "m2.current.public_evidence.v0.5"
      : config.schema === "m2.current.config.v0.4"
        ? "m2.current.public_evidence.v0.4"
      : config.schema === "m2.current.config.v0.3"
        ? "m2.current.public_evidence.v0.3"
        : config.schema === "m2.current.config.v0.2"
          ? "m2.current.public_evidence.v0.2"
          : "m2.current.public_evidence.v0.1",
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
          config.schema === "m2.current.config.v0.6"
            ? null
            : contract.thresholds.fullLibraryForecastableCashCoverageMinimum,
        top10Required:
          config.schema === "m2.current.config.v0.6"
            ? null
            : contract.thresholds.top10ForecastableCashCoverageMinimum,
        uncommittedCashShare:
          sources.coverage.cashCoverage.classifierExposureShareOfLedgerCash
      },
      targetClassification: config.schema === "m2.current.config.v0.6"
        ? {
          frozenClassificationUncertainCashShare:
            sources.candidate.targetMigration.frozenTargetIsolation
              .classificationUncertainCashShare,
          denseClassificationUncertainCashShare:
            sources.candidate.targetMigration.denseTargetIsolation
              .classificationUncertainCashShare,
          maximumAllowed:
            contract.thresholds.maximumClassificationUncertainCashShare,
          passed:
            sources.candidate.acceptance.targetClassificationPassed
        }
        : null,
      workLevelSignals: config.schema === "m2.current.config.v0.6"
        ? {
          contractStatus: "IMPLEMENTED",
          frozen:
            sources.signalGap.coverageInventory.frozenAuthorityPopulation,
          denseMonthly:
            sources.signalGap.coverageInventory
              .denseMonthlyDiagnosticPopulation,
          missingReason:
            sources.signalGap.coverageInventory.missingReason,
          readiness:
            sources.signalGap.coverageInventory.readiness,
          currentStateBackfillUsed:
            sources.signalGap.invariants.currentStateBackfillUsed,
          sourceInventory: {
            auditedSourceRoleCount:
              sources.signalSourceInventory.auditedSourceRoleCount,
            eligibleObservedAsOfSourceRoleCount:
              sources.signalSourceInventory
                .eligibleObservedAsOfSourceRoleCount,
            existingAuthorityCanPopulateObservedSnapshots:
              sources.signalSourceInventory.readiness
                .existingAuthorityCanPopulateObservedSnapshots,
            portableIntakeImplemented:
              sources.signalSourceInventory.readiness
                .portableIntakeImplemented,
            nextAction:
              sources.signalSourceInventory.readiness.nextAction
          }
        }
        : null,
      economicScope: config.schema === "m2.current.config.v0.6"
        ? {
          fullLibraryHistoricalForecastableShareOfLedgerCash:
            sources.coverage.cashCoverage.forecastableCashShareOfLedgerCash,
          modelTarget:
            "sales_share_cash_only",
          allCompanyCashCoverageClaimed: false
        }
        : null,
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
        caseCount: candidateCaseCount,
        caseShareOfFrozenModelPopulation: 1,
        workCount: candidateWorkCount,
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
      comparison: [
        "m2.current.config.v0.4",
        "m2.current.config.v0.5",
        "m2.current.config.v0.6"
      ].includes(config.schema)
        ? sources.candidate.pointComparisonToPrevious.comparison
        : sources.candidate.comparison,
      byHorizon: sources.candidate.byHorizon,
      pairedCi: [
        "m2.current.config.v0.4",
        "m2.current.config.v0.5",
        "m2.current.config.v0.6"
      ].includes(config.schema)
        ? sources.candidate.pointComparisonToPrevious.pairedCi
        : sources.candidate.pairedCi,
      acceptance: sources.candidate.acceptance
    },
    previousCandidate: sources.previousCandidate
      ? {
        candidateId: sources.previousCandidate.candidateId,
        comparison: [
          "m2.current.config.v0.4",
          "m2.current.config.v0.5",
          "m2.current.config.v0.6"
        ].includes(config.schema)
          ? sources.candidate.pointComparisonToPrevious
          : sources.candidate.previousCandidateComparison
      }
      : null,
    automatedEvaluation: sources.automatedEvaluation ?? null,
    retiredBusinessSample:
      [
        "m2.current.config.v0.3",
        "m2.current.config.v0.4",
        "m2.current.config.v0.5",
        "m2.current.config.v0.6"
      ]
        .includes(config.schema)
      ? {
        currentDependency: false,
        historicalArtifactOnly: true,
        path: contract.evaluationPolicy.retiredArtifacts[0]
      }
      : null,
    businessSample: config.schema === "m2.current.config.v0.2"
      ? sources.businessSample
      : null,
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
