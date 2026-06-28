const SYNTHETIC_TIMESTAMP = "2026-06-28T00:00:00Z";

export function buildBacktestAnchorPrototype(evaluation = {}, options = {}) {
  const materialId = evaluation.materialId ?? "SYN-M3-MATERIAL-UNKNOWN";
  const forecastGenerated = evaluation.forecast?.forecastStatus === "generated";
  const ratingGenerated = evaluation.candidateRating?.ratingType === "new_product_candidate_rating";
  const eligible = forecastGenerated && ratingGenerated;
  const locked = options.lockFixture === true && eligible;

  return {
    anchorId: `SYN-M3-ANCHOR-${materialId}`,
    topicId: topicIdFor(evaluation, materialId),
    materialId,
    evaluationId: `SYN-M3-EVAL-${materialId}`,
    anchorType: locked ? "locked_fixture_snapshot" : "fixture_backtest_anchor_candidate",
    anchorStatus: locked ? "locked_fixture" : eligible ? "candidate" : "not_eligible_readiness_blocked",
    lockedAtSynthetic: locked ? SYNTHETIC_TIMESTAMP : null,
    forecastSnapshot: forecastSnapshot(evaluation.forecast),
    ratingSnapshot: ratingSnapshot(evaluation.candidateRating),
    inputSnapshot: inputSnapshot(evaluation.parsedMaterial),
    evidenceSnapshot: evidenceSnapshot(evaluation.externalEvidence, evaluation.evidenceSummary),
    comparableSnapshot: comparableSnapshot(evaluation.comparableWorks, evaluation.authorRanking),
    limitations: [
      "Fixture anchor prototype only.",
      "No real backtest is executed.",
      "No post-launch revenue is read.",
      "No database write is performed.",
      "Not for formal decision."
    ],
    futureBacktestWindows: {
      year1: { windowCode: "year1", monthsAfterLaunch: 12, status: "future_fixture_window" },
      year3: { windowCode: "year3", monthsAfterLaunch: 36, status: "future_fixture_window" },
      year5: { windowCode: "year5", monthsAfterLaunch: 60, status: "future_fixture_window" }
    },
    realBacktestExecuted: false,
    postLaunchRevenueRead: false,
    databaseWritten: false,
    nonFormal: true,
    fixtureOnly: true,
    notForFormalDecision: true
  };
}

function forecastSnapshot(forecast = {}) {
  return {
    forecastStatus: forecast.forecastStatus ?? "not_generated",
    forecastShape: forecast.forecastShape ?? "point_estimate_only",
    pointEstimateOnly: forecast.pointEstimateOnly === true,
    channelForecastCount: forecast.channelForecasts?.length ?? 0,
    totalForecast: clone(forecast.totalForecast ?? null),
    contributionCodes: (forecast.forecastContributions ?? []).map((item) => item.signalCode),
    blockedBy: clone(forecast.blockedBy ?? []),
    nonFormal: true
  };
}

function ratingSnapshot(candidateRating = {}) {
  return {
    ratingType: candidateRating.ratingType ?? "new_product_candidate_rating",
    rating: candidateRating.rating ?? candidateRating.value ?? null,
    ratingBasis: candidateRating.ratingBasis ?? null,
    supportFactorCount: candidateRating.supportFactors?.length ?? 0,
    warningFactorCount: candidateRating.warningFactors?.length ?? 0,
    limitingFactorCount: candidateRating.limitingFactors?.length ?? 0,
    nonFormal: true
  };
}

function inputSnapshot(parsedMaterial = {}) {
  const fields = parsedMaterial.normalizedFields ?? {};
  return {
    inputMode: parsedMaterial.inputMode ?? "material_first",
    source: fields.source ?? null,
    extractedFieldKeys: (parsedMaterial.extractedFields ?? []).map((field) => field.key),
    missingFields: clone(parsedMaterial.missingFields ?? []),
    manualFillRequired: clone(parsedMaterial.manualFillRequired ?? []),
    rawMaterialStored: false,
    privateFileRead: false,
    nonFormal: true
  };
}

function evidenceSnapshot(externalEvidence = [], evidenceSummary = {}) {
  return {
    evidenceIds: externalEvidence.map((item) => item.evidenceId),
    evidenceTypes: [...new Set(externalEvidence.map((item) => item.evidenceType))],
    evidenceSummary: clone(evidenceSummary),
    webpageFullTextStored: false,
    realSearchCalled: false,
    chatGptWebCalled: false,
    browserAutomationCalled: false,
    nonFormal: true
  };
}

function comparableSnapshot(comparableWorks = {}, authorRanking = {}) {
  return {
    systemComparableIds: (comparableWorks.systemSelected ?? []).map((item) => item.comparableWorkId),
    operatorComparatorIds: (comparableWorks.operatorSpecified ?? []).map((item) => item.operatorComparatorId),
    sameAuthorReferenceIds: (comparableWorks.sameAuthorReferenceWorks ?? []).map((item) => item.authorWorkId),
    authorRankingEnabled: authorRanking.enabled === true,
    authorTier: authorRanking.authorTier ?? null,
    nonFormal: true
  };
}

function topicIdFor(evaluation, materialId) {
  return evaluation.externalEvidence?.find((item) => item.topicId)?.topicId ?? `SYN-M3-TOPIC-${materialId.replace(/^SYN-M3-MATERIAL-/, "")}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
