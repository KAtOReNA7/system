export const M3_FIXTURE_ALGORITHM_VERSION = "fixture-new-product-v1";

const RATINGS = ["S+", "S", "A", "B", "C", "D", "E"];

const TOPIC_BLUEPRINTS = [
  {
    topicId: "SYN-TOPIC-0001",
    title: "SYN-TITLE-PUBLICATION-GROWTH",
    authorName: "SYN-AUTHOR-ALPHA",
    source: "publication",
    classificationPath: ["SYN-CLASS-L1-A", "SYN-CLASS-L2-A", "SYN-CLASS-L3-A"],
    wordCount: 580000,
    completionStatus: "completed",
    targetChannels: ["SYN-CHANNEL-AUDIO-PRIMARY", "SYN-CHANNEL-AUDIO-SECONDARY"],
    status: "evaluation_ready",
    readiness: "ready",
    materialTypes: ["pdf", "manual"],
    readingSignals: { reads: 1800000, collections: 86000, rating: 8.7 },
    comparableRevenue: 760000,
    heatMultiplier: 1.08,
    authorMultiplier: 1.12,
    yearCurve: [0.32, 0.24, 0.18, 0.15, 0.11],
    topicWorkLink: { status: "not_linked_pre_sales", standardWorkId: null },
    backtest: { checkpoint: "not_started_pre_launch", outcome: "pending" }
  },
  {
    topicId: "SYN-TOPIC-0002",
    title: "SYN-TITLE-WEB-STABLE",
    authorName: "SYN-AUTHOR-BETA",
    source: "web_original",
    classificationPath: ["SYN-CLASS-L1-B", "SYN-CLASS-L2-B", "SYN-CLASS-L3-B"],
    wordCount: 1250000,
    completionStatus: "serializing",
    targetChannels: ["SYN-CHANNEL-AUDIO-PRIMARY"],
    status: "input_confirmed",
    readiness: "ready",
    materialTypes: ["word"],
    readingSignals: { reads: 960000, collections: 52000, rating: 8.1 },
    comparableRevenue: 430000,
    heatMultiplier: 1.02,
    authorMultiplier: 0.96,
    yearCurve: [0.3, 0.25, 0.2, 0.14, 0.11],
    topicWorkLink: { status: "not_linked_pre_sales", standardWorkId: null },
    backtest: { checkpoint: "not_started_pre_launch", outcome: "pending" }
  },
  {
    topicId: "SYN-TOPIC-0003",
    title: "SYN-TITLE-INCOMPLETE-CLASSIFICATION",
    authorName: "SYN-AUTHOR-GAMMA",
    source: "publication",
    classificationPath: ["SYN-CLASS-L1-C", "", ""],
    wordCount: 420000,
    completionStatus: "completed",
    targetChannels: ["SYN-CHANNEL-AUDIO-SECONDARY"],
    status: "readiness_blocked",
    readiness: "blocked",
    materialTypes: ["ppt"],
    readingSignals: { reads: 220000, collections: 12000, rating: 7.6 },
    comparableRevenue: 160000,
    heatMultiplier: 0.9,
    authorMultiplier: 1,
    yearCurve: [0.34, 0.24, 0.17, 0.14, 0.11],
    topicWorkLink: { status: "not_linked_pre_sales", standardWorkId: null },
    backtest: { checkpoint: "not_started_pre_launch", outcome: "pending" }
  },
  {
    topicId: "SYN-TOPIC-0004",
    title: "SYN-TITLE-MATERIAL-PENDING",
    authorName: "SYN-AUTHOR-DELTA",
    source: "web_original",
    classificationPath: ["SYN-CLASS-L1-D", "SYN-CLASS-L2-D", "SYN-CLASS-L3-D"],
    wordCount: 0,
    completionStatus: "unknown",
    targetChannels: [],
    status: "material_parse_pending",
    readiness: "draft",
    materialTypes: ["pdf", "ppt"],
    readingSignals: { reads: 0, collections: 0, rating: null },
    comparableRevenue: 0,
    heatMultiplier: 1,
    authorMultiplier: 1,
    yearCurve: [0.3, 0.25, 0.2, 0.14, 0.11],
    topicWorkLink: { status: "not_linked_pre_sales", standardWorkId: null },
    backtest: { checkpoint: "not_started_pre_launch", outcome: "pending" }
  },
  {
    topicId: "SYN-TOPIC-0005",
    title: "SYN-TITLE-LINKED-OLD-PRODUCT",
    authorName: "SYN-AUTHOR-EPSILON",
    source: "publication",
    classificationPath: ["SYN-CLASS-L1-A", "SYN-CLASS-L2-E", "SYN-CLASS-L3-E"],
    wordCount: 690000,
    completionStatus: "completed",
    targetChannels: ["SYN-CHANNEL-AUDIO-PRIMARY"],
    status: "linked_after_sales",
    readiness: "ready",
    materialTypes: ["manual"],
    readingSignals: { reads: 650000, collections: 34000, rating: 8.4 },
    comparableRevenue: 520000,
    heatMultiplier: 1.04,
    authorMultiplier: 1.07,
    yearCurve: [0.31, 0.24, 0.19, 0.15, 0.11],
    topicWorkLink: { status: "linked_to_standard_work", standardWorkId: "SYN-WORK-LINK-0005" },
    backtest: { checkpoint: "first_year", outcome: "within_interval_near_base" }
  }
];

export function buildM3NewProductFixtureDataset() {
  const topics = TOPIC_BLUEPRINTS.map(buildTopic);
  return {
    topics,
    algorithmVersions: [
      {
        id: "SYN-ALG-NEW-PRODUCT-0001",
        versionKey: M3_FIXTURE_ALGORITHM_VERSION,
        status: "fixture_only",
        effectiveFrom: "2026-06-28",
        retiredAt: null,
        usesAiModel: false,
        fixtureOnly: true,
        nonFormal: true,
        description: "Synthetic fixture-only M3 new-product evaluation prototype."
      }
    ],
    backtests: buildBacktests(topics),
    engineSummary: summarizeTopics(topics)
  };
}

function buildTopic(blueprint) {
  const readinessGaps = buildReadinessGaps(blueprint);
  const forecast = buildForecast(blueprint, readinessGaps);
  const rating = buildRating(forecast, blueprint, readinessGaps);
  const risks = buildRisks(blueprint, readinessGaps);
  const comparators = buildComparators(blueprint);
  return {
    topicId: blueprint.topicId,
    title: blueprint.title,
    authorName: blueprint.authorName,
    source: blueprint.source,
    status: blueprint.status,
    classificationPath: blueprint.classificationPath,
    targetChannels: blueprint.targetChannels,
    createdAt: "2026-06-28T00:00:00.000Z",
    updatedAt: "2026-06-28T00:00:00.000Z",
    syntheticOnly: true,
    notForFormalDecision: true,
    inputSnapshot: {
      id: `${blueprint.topicId}-INPUT-0001`,
      source: "synthetic_fixture",
      readiness: readinessGaps.length ? blueprint.readiness : "ready",
      requiredFields: buildRequiredFields(blueprint),
      gaps: readinessGaps,
      publicationOrWebModel: blueprint.source,
      confirmedByOperator: blueprint.readiness === "ready"
    },
    material: {
      fileMetadataOnly: true,
      rawMaterialStored: false,
      confirmedStructuredFieldsOnly: blueprint.readiness !== "draft",
      materialTypes: blueprint.materialTypes,
      chunkingPlan: blueprint.materialTypes.map((type, index) => ({
        chunkId: `${blueprint.topicId}-CHUNK-${String(index + 1).padStart(2, "0")}`,
        type,
        splitBy: type === "ppt" ? "slide" : type === "word" ? "chapter" : "page",
        syntheticOnly: true
      }))
    },
    contentFit: {
      wordCount: blueprint.wordCount,
      estimatedAudioHours: blueprint.wordCount ? Math.round(blueprint.wordCount / 7800) : null,
      completionStatus: blueprint.completionStatus,
      audioAdaptationRisks: blueprint.wordCount < 300000 && blueprint.wordCount > 0
        ? ["short_length_revenue_limit"]
        : []
    },
    comparators,
    authorRanking: buildAuthorRanking(blueprint),
    externalSignals: buildExternalSignals(blueprint),
    forecast,
    rating,
    risks,
    topicWorkLink: {
      ...blueprint.topicWorkLink,
      oneTopicOneWork: true,
      oneWorkOneFormalTopic: true,
      createPendingIncomeRecord: false
    },
    backtestPlan: {
      baseline: "last_formal_pre_launch_evaluation",
      checkpoints: ["first_year", "third_year", "fifth_year"],
      currentCheckpoint: blueprint.backtest.checkpoint,
      currentOutcome: blueprint.backtest.outcome
    },
    warnings: [
      {
        code: "fixture_only_non_formal",
        message: "Synthetic M3 fixture; not a formal new-product evaluation."
      }
    ]
  };
}

function buildRequiredFields(blueprint) {
  return {
    title: Boolean(blueprint.title),
    author: Boolean(blueprint.authorName),
    source: Boolean(blueprint.source),
    completeClassification: blueprint.classificationPath.every(Boolean),
    synopsis: blueprint.status !== "material_parse_pending",
    wordCount: blueprint.wordCount > 0,
    completionStatus: blueprint.completionStatus !== "unknown",
    readingCollectionRating: blueprint.readingSignals.reads > 0,
    sameNameAudio: true,
    filmOrAnimation: true,
    externalHeat: blueprint.readingSignals.reads > 0,
    targetChannel: blueprint.targetChannels.length > 0,
    copyrightTermRange: blueprint.status !== "material_parse_pending",
    operatorRecommendationReason: blueprint.status !== "material_parse_pending"
  };
}

function buildReadinessGaps(blueprint) {
  const fields = buildRequiredFields(blueprint);
  const gaps = [];
  for (const [field, present] of Object.entries(fields)) {
    if (!present) {
      gaps.push({
        gapCode: `missing_${field}`,
        field,
        severity: ["completeClassification", "wordCount", "targetChannel"].includes(field)
          ? "high"
          : "medium",
        blocksFormalEvaluation: true,
        suggestedOwnerAction: `${field} must be confirmed before formal M3 evaluation.`
      });
    }
  }
  return gaps;
}

function buildComparators(blueprint) {
  if (blueprint.comparableRevenue <= 0) {
    return [];
  }
  const base = Math.round(blueprint.comparableRevenue);
  return [1, 2, 3].map((index) => ({
    comparatorId: `${blueprint.topicId}-CMP-${String(index).padStart(2, "0")}`,
    comparatorWorkId: `SYN-COMPARATOR-${String(index).padStart(4, "0")}`,
    title: `SYN-COMPARATOR-TITLE-${index}`,
    authorName: index === 1 ? blueprint.authorName : `SYN-COMPARATOR-AUTHOR-${index}`,
    source: blueprint.source,
    classificationPath: blueprint.classificationPath,
    launchYear: 2021 + index,
    historicalRevenue: Math.round(base * (0.88 + index * 0.08)),
    adjustedReferenceRevenue: Math.round(base * (0.92 + index * 0.06)),
    selectedAsFinal: index <= 2,
    sameAuthor: index === 1,
    reason: index === 1 ? "same author and comparable category" : "category and heat signal match",
    differences: index === 3 ? ["excluded_by_lower_similarity"] : ["different launch year"],
    buyoutRevenueSeparated: true
  }));
}

function buildAuthorRanking(blueprint) {
  const comparableWorks = blueprint.source === "web_original" ? 2 : 4;
  return {
    enabled: comparableWorks >= 3,
    comparableWorks,
    rankBand: comparableWorks >= 3 ? "upper_mid" : "insufficient_samples",
    rationale: comparableWorks >= 3
      ? "Author has at least three synthetic comparable audio-income samples."
      : "Author ranking is disabled until at least three comparable samples exist.",
    amountOutput: false
  };
}

function buildExternalSignals(blueprint) {
  return {
    platformSignals: [
      {
        platform: "SYN-READING-PLATFORM",
        metric: "relative_category_position",
        value: blueprint.readingSignals.reads > 900000 ? "top_quartile" : "mid_or_unknown",
        collectedAt: "2026-06-28T00:00:00.000Z"
      },
      {
        platform: "SYN-SOCIAL-HEAT",
        metric: "trend_direction",
        value: blueprint.heatMultiplier > 1 ? "upward" : "neutral",
        collectedAt: "2026-06-28T00:00:00.000Z"
      }
    ],
    compositeConclusion: blueprint.readingSignals.reads > 0 ? "usable_non_formal_signal" : "missing_signal",
    staleAfterDays: 30
  };
}

function buildForecast(blueprint, readinessGaps) {
  if (readinessGaps.length) {
    return {
      outputType: "readiness_blocked",
      fiveYearBase: null,
      firstYearForecast: null,
      range: null,
      annualBreakdown: [],
      channelStructure: [],
      methodWeights: [],
      explanation: "Readiness gaps block formal-style forecast output in fixture prototype."
    };
  }

  const fiveYearBase = Math.round(
    blueprint.comparableRevenue * blueprint.heatMultiplier * blueprint.authorMultiplier
  );
  const annualBreakdown = blueprint.yearCurve.map((share, index) => ({
    year: index + 1,
    revenue: Math.round(fiveYearBase * share),
    share
  }));
  return {
    outputType: "five_year_interval_forecast",
    fiveYearBase,
    firstYearForecast: annualBreakdown[0].revenue,
    range: {
      pessimistic: Math.round(fiveYearBase * 0.72),
      base: fiveYearBase,
      optimistic: Math.round(fiveYearBase * 1.28)
    },
    annualBreakdown,
    channelStructure: blueprint.targetChannels.map((channel, index) => ({
      channel,
      share: index === 0 ? 0.72 : 0.28,
      revenue: Math.round(fiveYearBase * (index === 0 ? 0.72 : 0.28))
    })),
    methodWeights: [
      { method: "precise_comparator", weight: 0.42 },
      { method: "same_author_adjustment", weight: 0.22 },
      { method: "category_curve", weight: 0.2 },
      { method: "external_heat_mapping", weight: 0.16 }
    ],
    explanation: "Synthetic forecast combines comparators, author rank, category curve and external heat."
  };
}

function buildRating(forecast, blueprint, readinessGaps) {
  if (readinessGaps.length) {
    return {
      value: "blocked",
      basis: "input_readiness_blocked",
      supportFactors: [],
      limitingFactors: readinessGaps.slice(0, 3).map((gap) => gap.gapCode),
      risks: ["readiness_gap"],
      noDevelopDecisionOutput: true,
      noResourceInvestmentLevel: true
    };
  }

  const value = ratingForAmount(forecast.fiveYearBase);
  return {
    value,
    basis: "five_year_forecast_base",
    baseRating: value,
    adjusted: blueprint.authorMultiplier !== 1,
    adjustmentReasons: blueprint.authorMultiplier > 1 ? ["author_rank_positive"] : ["author_rank_limited"],
    supportFactors: ["final_comparator_available", "external_heat_signal_available"].slice(0, 3),
    limitingFactors: blueprint.completionStatus === "serializing" ? ["serialization_not_finished"] : [],
    risks: blueprint.completionStatus === "serializing" ? ["completion_status_risk"] : [],
    noDevelopDecisionOutput: true,
    noResourceInvestmentLevel: true
  };
}

function ratingForAmount(amount) {
  if (amount >= 900000) return "S";
  if (amount >= 650000) return "A";
  if (amount >= 420000) return "B";
  if (amount >= 220000) return "C";
  if (amount >= 100000) return "D";
  return "E";
}

function buildRisks(blueprint, readinessGaps) {
  const risks = readinessGaps.map((gap) => ({
    riskCode: gap.gapCode,
    severity: gap.severity,
    message: gap.suggestedOwnerAction
  }));
  if (blueprint.completionStatus === "serializing") {
    risks.push({
      riskCode: "serialization_not_finished",
      severity: "medium",
      message: "Serializing status may change forecast confidence."
    });
  }
  if (!risks.length) {
    risks.push({
      riskCode: "fixture_non_formal",
      severity: "low",
      message: "Synthetic fixture cannot be used as a formal business decision."
    });
  }
  return risks.slice(0, 3);
}

function buildBacktests(topics) {
  return [
    {
      id: "SYN-M3-BACKTEST-0001",
      batchNo: "M3-FIXTURE-BACKTEST-001",
      algorithmVersion: M3_FIXTURE_ALGORITHM_VERSION,
      checkpoints: ["first_year", "third_year", "fifth_year"],
      status: "fixture_only",
      syntheticOnly: true,
      summary: "Synthetic M3 backtest shape only; not a real post-launch backtest.",
      metrics: {
        total: topics.length,
        pending: topics.filter((topic) => topic.backtestPlan.currentOutcome === "pending").length,
        withinInterval: topics.filter((topic) => topic.backtestPlan.currentOutcome.includes("within_interval")).length,
        aboveInterval: 0,
        belowInterval: 0
      },
      items: topics.map((topic) => ({
        topicId: topic.topicId,
        checkpoint: topic.backtestPlan.currentCheckpoint,
        outcome: topic.backtestPlan.currentOutcome,
        syntheticOnly: true
      }))
    }
  ];
}

function summarizeTopics(topics) {
  return {
    totalTopics: topics.length,
    readyTopics: topics.filter((topic) => topic.inputSnapshot.readiness === "ready").length,
    blockedTopics: topics.filter((topic) => topic.inputSnapshot.readiness === "blocked").length,
    draftTopics: topics.filter((topic) => topic.inputSnapshot.readiness === "draft").length,
    linkedTopics: topics.filter((topic) => topic.topicWorkLink.status === "linked_to_standard_work").length,
    ratings: Object.fromEntries(RATINGS.map((rating) => [
      rating,
      topics.filter((topic) => topic.rating.value === rating).length
    ]))
  };
}
