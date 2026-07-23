export function loadM2CurrentPublicEvidence(sources) {
  requireSchema(sources?.limitation, "m2.v2.b4-limitation-analysis.v1");
  requireSchema(
    sources?.coverage,
    "m2.formal_cash_population_business_coverage.public.v1"
  );
  requireSchema(sources?.terminal, "m2.terminal_model_route_summary.v1");
  requireSchema(sources?.modelDecision, "m2.c3_model_quality_decision.v1");
  requireSchema(sources?.businessDecision, "m2.c3_business_coverage_decision.v1");
  requireSchema(sources?.segments, "m2.c2_activity_segment_route_manifest.v1");

  const segmentCaseCount = Object.values(sources.segments.segments)
    .reduce((sum, segment) => sum + Number(segment.caseCount), 0);
  if (segmentCaseCount !== 7851) {
    throw new Error("m2_current_segment_case_population_drift");
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
      libraryWorkCount: sources.coverage.scope.standardWorkCount,
      modelWorkCount: 824,
      modelCaseCount: segmentCaseCount,
      modelWorkShare:
        824 / Number(sources.coverage.scope.standardWorkCount)
    },
    coverage: {
      fullLibrary: sources.coverage.cashCoverage.forecastableCashShareOfLedgerCash,
      top1: sources.coverage.topBands.top1.forecastableCashCoverage,
      top5: sources.coverage.topBands.top5.forecastableCashCoverage,
      top10: sources.coverage.topBands.top10.forecastableCashCoverage,
      required: sources.coverage.observationGates.forecastableCashShareMinimumRecommended
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
    lastCandidate: sources.terminal.routeResults.C3,
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
