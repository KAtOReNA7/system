export const FIXTURE_EVALUATION_ALGORITHM_VERSION = "fixture-old-product-v1";
export const FIXTURE_EVALUATION_GENERATED_AT = "2026-06-22T00:00:00Z";

const MONEY_SCALE = 18;
const CUTOFF_MONTH = "2026-04";
const INCOMPLETE_MONTHS = Object.freeze(["2026-05"]);
const DATASET_BOUNDARY = "fixture-synthetic-only";
const RATING_ORDER = Object.freeze(["S+", "S", "A", "B", "C", "D", "E"]);
const SEVERITY_SCORE = Object.freeze({ high: 3, medium: 2, low: 1 });

export const FIXTURE_ONLY_THRESHOLDS = Object.freeze({
  insufficientHistoryCompleteMonths: 6,
  growthRatio: 1.15,
  decliningRatio: 0.75,
  reboundRatio: 1.5,
  longTailLast12RevenueMax: 100000,
  inactiveRecentRevenueMax: 1,
  copyrightExpiryWarningMonths: 18,
  ratingScoreBands: Object.freeze([
    ["S+", 85],
    ["S", 75],
    ["A", 62],
    ["B", 48],
    ["C", 34],
    ["D", 20],
    ["E", 0]
  ])
});

export const FIXTURE_OLD_PRODUCT_INPUTS = Object.freeze([
  Object.freeze({
    standardWorkId: "SYN-WORK-0001",
    workName: "SYN-WORK-NAME-0001",
    authorName: "SYN-AUTHOR-0001",
    classificationPath: Object.freeze(["SYN-CLASS-L1-A", "SYN-CLASS-L2-A", "SYN-CLASS-L3-A"]),
    tags: Object.freeze(["SYN-TAG-READY", "SYN-TAG-BOTH-FORMS"]),
    channels: Object.freeze(["SYN-CHANNEL-ALPHA", "SYN-CHANNEL-BETA"]),
    businessForms: Object.freeze(["audio_copyright", "audio_product"]),
    readiness: Object.freeze({ status: "ready", gaps: Object.freeze([]) }),
    resultStatus: "current",
    copyrightStartMonth: "2023-01",
    copyrightEndMonth: "2028-12",
    revenueHistory: Object.freeze([
      month("2025-05", 22000, { audio_copyright: 12000, audio_product: 10000 }),
      month("2025-06", 23000, { audio_copyright: 12500, audio_product: 10500 }),
      month("2025-07", 24000, { audio_copyright: 13000, audio_product: 11000 }),
      month("2025-08", 26000, { audio_copyright: 14000, audio_product: 12000 }),
      month("2025-09", 28000, { audio_copyright: 15000, audio_product: 13000 }),
      month("2025-10", 30000, { audio_copyright: 16000, audio_product: 14000 }),
      month("2025-11", 32000, { audio_copyright: 17000, audio_product: 15000 }),
      month("2025-12", 34000, { audio_copyright: 18000, audio_product: 16000 }),
      month("2026-01", 36000, { audio_copyright: 19000, audio_product: 17000 }),
      month("2026-02", 38000, { audio_copyright: 20000, audio_product: 18000 }),
      month("2026-03", 41000, { audio_copyright: 21500, audio_product: 19500 }),
      month("2026-04", 46000, { audio_copyright: 24000, audio_product: 22000 }),
      month("2026-05", 50000, { audio_copyright: 26000, audio_product: 24000 }, true)
    ]),
    historicalRevenueBeforeWindow: 600000,
    backtestOutcome: "covered",
    actualBacktestTotal: 412000
  }),
  Object.freeze({
    standardWorkId: "SYN-WORK-0002",
    workName: "SYN-WORK-NAME-0002",
    authorName: "SYN-AUTHOR-0002",
    classificationPath: Object.freeze(["SYN-CLASS-L1-A", "SYN-CLASS-L2-B", "SYN-CLASS-L3-B"]),
    tags: Object.freeze(["SYN-TAG-READY", "SYN-TAG-SINGLE-FORM"]),
    channels: Object.freeze(["SYN-CHANNEL-GAMMA"]),
    businessForms: Object.freeze(["audio_product"]),
    readiness: Object.freeze({ status: "ready", gaps: Object.freeze([]) }),
    resultStatus: "current",
    copyrightStartMonth: "2023-02",
    copyrightEndMonth: "2028-06",
    revenueHistory: Object.freeze([
      month("2025-05", 20500, { audio_product: 20500 }),
      month("2025-06", 19800, { audio_product: 19800 }),
      month("2025-07", 20200, { audio_product: 20200 }),
      month("2025-08", 20100, { audio_product: 20100 }),
      month("2025-09", 19900, { audio_product: 19900 }),
      month("2025-10", 20000, { audio_product: 20000 }),
      month("2025-11", 20200, { audio_product: 20200 }),
      month("2025-12", 19800, { audio_product: 19800 }),
      month("2026-01", 20300, { audio_product: 20300 }),
      month("2026-02", 19700, { audio_product: 19700 }),
      month("2026-03", 20100, { audio_product: 20100 }),
      month("2026-04", 19500, { audio_product: 19500 }),
      month("2026-05", 21000, { audio_product: 21000 }, true)
    ]),
    historicalRevenueBeforeWindow: 400000,
    backtestOutcome: "covered",
    actualBacktestTotal: 248000
  }),
  Object.freeze({
    standardWorkId: "SYN-WORK-0003",
    workName: "SYN-WORK-NAME-0003",
    authorName: "SYN-AUTHOR-0003",
    classificationPath: Object.freeze(["SYN-MISSING", "SYN-MISSING", "SYN-MISSING"]),
    tags: Object.freeze(["SYN-TAG-BLOCKED"]),
    channels: Object.freeze(["SYN-CHANNEL-DELTA"]),
    businessForms: Object.freeze(["audio_copyright", "audio_product"]),
    readiness: Object.freeze({
      status: "blocked",
      gaps: Object.freeze([
        Object.freeze({
          code: "missing_classification",
          severity: "high",
          message: "Synthetic missing classification gap."
        })
      ])
    }),
    resultStatus: "current",
    copyrightStartMonth: "2023-03",
    copyrightEndMonth: "2027-12",
    revenueHistory: Object.freeze([
      month("2025-05", 22000, { audio_copyright: 13000, audio_product: 9000 }),
      month("2025-06", 21000, { audio_copyright: 12500, audio_product: 8500 }),
      month("2025-07", 20000, { audio_copyright: 12000, audio_product: 8000 }),
      month("2025-08", 18000, { audio_copyright: 11000, audio_product: 7000 }),
      month("2025-09", 16000, { audio_copyright: 9500, audio_product: 6500 }),
      month("2025-10", 14000, { audio_copyright: 8500, audio_product: 5500 }),
      month("2025-11", 12000, { audio_copyright: 7500, audio_product: 4500 }),
      month("2025-12", 10000, { audio_copyright: 6000, audio_product: 4000 }),
      month("2026-01", 9000, { audio_copyright: 5500, audio_product: 3500 }),
      month("2026-02", 8000, { audio_copyright: 5000, audio_product: 3000 }),
      month("2026-03", 7000, { audio_copyright: 4500, audio_product: 2500 }),
      month("2026-04", 6000, { audio_copyright: 4000, audio_product: 2000 }),
      month("2026-05", 5000, { audio_copyright: 3000, audio_product: 2000 }, true)
    ]),
    historicalRevenueBeforeWindow: 260000,
    fixtureRatingCalibrationOffset: 60,
    backtestOutcome: "missed",
    actualBacktestTotal: 135000
  }),
  Object.freeze({
    standardWorkId: "SYN-WORK-0004",
    workName: "SYN-WORK-NAME-0004",
    authorName: "SYN-AUTHOR-0004",
    classificationPath: Object.freeze(["SYN-CLASS-L1-B", "SYN-CLASS-L2-C", "SYN-CLASS-L3-C"]),
    tags: Object.freeze(["SYN-TAG-BLOCKED"]),
    channels: Object.freeze(["SYN-CHANNEL-EPSILON"]),
    businessForms: Object.freeze(["audio_copyright"]),
    readiness: Object.freeze({
      status: "blocked",
      gaps: Object.freeze([
        Object.freeze({
          code: "missing_copyright_end",
          severity: "high",
          message: "Synthetic missing copyright end gap."
        })
      ])
    }),
    resultStatus: "current",
    copyrightStartMonth: "2023-04",
    copyrightEndMonth: "2026-12",
    revenueHistory: Object.freeze([
      month("2025-05", 6800, { audio_copyright: 6800 }),
      month("2025-06", 6100, { audio_copyright: 6100 }),
      month("2025-07", 6300, { audio_copyright: 6300 }),
      month("2025-08", 5900, { audio_copyright: 5900 }),
      month("2025-09", 6200, { audio_copyright: 6200 }),
      month("2025-10", 5800, { audio_copyright: 5800 }),
      month("2025-11", 6000, { audio_copyright: 6000 }),
      month("2025-12", 5400, { audio_copyright: 5400 }),
      month("2026-01", 5700, { audio_copyright: 5700 }),
      month("2026-02", 5300, { audio_copyright: 5300 }),
      month("2026-03", 5500, { audio_copyright: 5500 }),
      month("2026-04", 5100, { audio_copyright: 5100 }),
      month("2026-05", 5000, { audio_copyright: 5000 }, true)
    ]),
    historicalRevenueBeforeWindow: 150000,
    fixtureRatingCalibrationOffset: 70,
    backtestOutcome: "under",
    actualBacktestTotal: 68000
  }),
  Object.freeze({
    standardWorkId: "SYN-WORK-0005",
    workName: "SYN-WORK-NAME-0005",
    authorName: "SYN-AUTHOR-0005",
    classificationPath: Object.freeze(["SYN-CLASS-L1-C", "SYN-CLASS-L2-D", "SYN-CLASS-L3-D"]),
    tags: Object.freeze(["SYN-TAG-HISTORICAL"]),
    channels: Object.freeze(["SYN-CHANNEL-ZETA"]),
    businessForms: Object.freeze(["audio_product"]),
    readiness: Object.freeze({ status: "ready", gaps: Object.freeze([]) }),
    resultStatus: "historical",
    copyrightStartMonth: "2023-05",
    copyrightEndMonth: "2028-03",
    revenueHistory: Object.freeze([
      month("2025-05", 3000, { audio_product: 3000 }),
      month("2025-06", 2500, { audio_product: 2500 }),
      month("2025-07", 2000, { audio_product: 2000 }),
      month("2025-08", 1500, { audio_product: 1500 }),
      month("2025-09", 1000, { audio_product: 1000 }),
      month("2025-10", 500, { audio_product: 500 }),
      month("2025-11", 0, { audio_product: 0 }),
      month("2025-12", 0, { audio_product: 0 }),
      month("2026-01", 0, { audio_product: 0 }),
      month("2026-02", 0, { audio_product: 0 }),
      month("2026-03", 0, { audio_product: 0 }),
      month("2026-04", 0, { audio_product: 0 }),
      month("2026-05", 0, { audio_product: 0 }, true)
    ]),
    historicalRevenueBeforeWindow: 120000,
    fixtureRatingCalibrationOffset: 25,
    backtestOutcome: "over",
    actualBacktestTotal: 12000
  }),
  Object.freeze({
    standardWorkId: "SYN-WORK-0006",
    workName: "SYN-WORK-NAME-0006",
    authorName: "SYN-AUTHOR-0006",
    classificationPath: Object.freeze(["SYN-CLASS-L1-C", "SYN-CLASS-L2-E", "SYN-CLASS-L3-E"]),
    tags: Object.freeze(["SYN-TAG-INVALIDATED"]),
    channels: Object.freeze(["SYN-CHANNEL-ETA"]),
    businessForms: Object.freeze(["audio_copyright"]),
    readiness: Object.freeze({ status: "ready", gaps: Object.freeze([]) }),
    resultStatus: "invalidated",
    copyrightStartMonth: "2023-06",
    copyrightEndMonth: "2027-06",
    revenueHistory: Object.freeze([
      month("2025-05", 9000, { audio_copyright: 9000 }),
      month("2025-06", 8500, { audio_copyright: 8500 }),
      month("2025-07", 7500, { audio_copyright: 7500 }),
      month("2025-08", 6500, { audio_copyright: 6500 }),
      month("2025-09", 5000, { audio_copyright: 5000 }),
      month("2025-10", 3500, { audio_copyright: 3500 }),
      month("2025-11", 3000, { audio_copyright: 3000 }),
      month("2025-12", 3500, { audio_copyright: 3500 }),
      month("2026-01", 4500, { audio_copyright: 4500 }),
      month("2026-02", 6500, { audio_copyright: 6500 }),
      month("2026-03", 8500, { audio_copyright: 8500 }),
      month("2026-04", 10500, { audio_copyright: 10500 }),
      month("2026-05", 11000, { audio_copyright: 11000 }, true)
    ]),
    historicalRevenueBeforeWindow: 100000,
    backtestOutcome: "covered",
    actualBacktestTotal: 66000
  }),
  Object.freeze({
    standardWorkId: "SYN-WORK-0007",
    workName: "SYN-WORK-NAME-0007",
    authorName: "SYN-AUTHOR-0007",
    classificationPath: Object.freeze(["SYN-CLASS-L1-D", "SYN-CLASS-L2-F", "SYN-CLASS-L3-F"]),
    tags: Object.freeze(["SYN-TAG-INSUFFICIENT-HISTORY"]),
    channels: Object.freeze(["SYN-CHANNEL-THETA"]),
    businessForms: Object.freeze(["audio_product"]),
    readiness: Object.freeze({
      status: "blocked",
      gaps: Object.freeze([
        Object.freeze({
          code: "missing_income_fact",
          severity: "medium",
          message: "Synthetic insufficient history gap."
        })
      ])
    }),
    resultStatus: "current",
    copyrightStartMonth: "2025-12",
    copyrightEndMonth: "2028-12",
    revenueHistory: Object.freeze([
      month("2026-01", 5000, { audio_product: 5000 }),
      month("2026-02", 6000, { audio_product: 6000 }),
      month("2026-03", 7000, { audio_product: 7000 }),
      month("2026-04", 6000, { audio_product: 6000 }),
      month("2026-05", 8000, { audio_product: 8000 }, true)
    ]),
    historicalRevenueBeforeWindow: 0,
    backtestOutcome: "missed",
    actualBacktestTotal: 30000
  })
]);

function month(monthValue, total, businessForms, incomplete = false) {
  return Object.freeze({ month: monthValue, total, businessForms: Object.freeze({ ...businessForms }), incomplete });
}

export function buildFixtureOldProductEvaluationDataset({
  inputs = FIXTURE_OLD_PRODUCT_INPUTS,
  generatedAt = FIXTURE_EVALUATION_GENERATED_AT
} = {}) {
  const evaluations = inputs.map((input, index) => evaluateFixtureOldProduct(input, { generatedAt, index }));
  const backtests = buildSyntheticBacktests(evaluations, inputs);
  return {
    evaluations,
    backtests,
    engineSummary: buildEngineSummary(evaluations, backtests)
  };
}

export function evaluateFixtureOldProduct(input, { generatedAt = FIXTURE_EVALUATION_GENERATED_AT, index = 0 } = {}) {
  const completeHistory = input.revenueHistory.filter((row) => row.incomplete !== true && row.month <= CUTOFF_MONTH);
  const inputSnapshot = buildInputSnapshot(input, completeHistory);
  const incomeSummary = buildIncomeSummary(input, completeHistory);
  const lifecycle = classifyLifecycle(input, incomeSummary);
  const risks = identifyRisks(input, inputSnapshot, incomeSummary, lifecycle);
  const forecast = buildForecast(inputSnapshot, incomeSummary, lifecycle, risks);
  const rating = buildRating(input, inputSnapshot, incomeSummary, lifecycle, forecast, risks);
  const suggestions = buildSuggestions(input, lifecycle, rating, risks);
  const backtestRefs = [
    {
      batchId: "SYN-BACKTEST-0001",
      algorithmVersion: FIXTURE_EVALUATION_ALGORITHM_VERSION,
      outcome: input.backtestOutcome,
      syntheticOnly: true
    }
  ];

  return {
    resultId: `SYN-EVAL-RESULT-${String(index + 1).padStart(4, "0")}`,
    standardWorkId: input.standardWorkId,
    workName: input.workName,
    authorName: input.authorName,
    classificationPath: [...input.classificationPath],
    tags: [...input.tags],
    channels: [...input.channels],
    businessForms: [...input.businessForms],
    readiness: clone(input.readiness),
    resultStatus: input.resultStatus,
    cutoffMonth: CUTOFF_MONTH,
    dataset: {
      mode: "fixture",
      boundary: DATASET_BOUNDARY,
      syntheticOnly: true,
      notForFormalDecision: true
    },
    inputSnapshot,
    lifecycle,
    incomeSummary,
    forecast,
    rating,
    risks,
    suggestions,
    backtestRefs,
    backtestSummary: {
      latestBatchId: "SYN-BACKTEST-0001",
      coverage: input.backtestOutcome,
      absoluteError: money(Math.abs(forecast.scenarios.base.forecastTotalNumber - input.actualBacktestTotal))
    },
    status: input.resultStatus,
    invalidationState: {
      status: input.resultStatus === "invalidated" ? "invalidated" : "valid_fixture",
      reason: input.resultStatus === "invalidated" ? "Synthetic invalidated fixture case." : null,
      syntheticOnly: true
    },
    warnings: [
      {
        code: "fixture_only_non_formal",
        message: "Synthetic fixture result only; not for formal business decision."
      }
    ],
    algorithmVersion: FIXTURE_EVALUATION_ALGORITHM_VERSION,
    updatedAt: generatedAt,
    generatedAt,
    syntheticOnly: true,
    notForFormalDecision: true
  };
}

function buildInputSnapshot(input, completeHistory) {
  const remainingMonths = monthsBetween(addMonths(CUTOFF_MONTH, 1), input.copyrightEndMonth);
  return {
    standardWorkId: input.standardWorkId,
    workTitle: input.workName,
    author: input.authorName,
    businessForms: [...input.businessForms],
    revenueHistorySummary: {
      completeMonthCount: completeHistory.length,
      firstMonth: completeHistory[0]?.month ?? null,
      latestCompleteMonth: completeHistory.at(-1)?.month ?? null,
      excludedIncompleteMonths: [...INCOMPLETE_MONTHS],
      totalCompleteRevenue: money(sum(completeHistory.map((row) => row.total)))
    },
    copyrightPeriod: {
      startMonth: input.copyrightStartMonth,
      endMonth: input.copyrightEndMonth,
      remainingMonths
    },
    remainingCopyrightMonths: remainingMonths,
    mappingVersion: "SYN-MAPPING-VERSION-NOT-ACTIVE",
    basicInfoVersion: "SYN-BASIC-INFO-VERSION-0001",
    classificationRelease: "SYN-CLASSIFICATION-RELEASE-0001",
    tagRelease: "SYN-TAG-RELEASE-0001",
    cutoffMonth: CUTOFF_MONTH,
    incompleteMonths: [...INCOMPLETE_MONTHS],
    excludedMonths: [...INCOMPLETE_MONTHS],
    source: "synthetic_fixture",
    datasetBoundary: DATASET_BOUNDARY,
    algorithmVersion: FIXTURE_EVALUATION_ALGORITHM_VERSION,
    fixtureThresholds: true,
    thresholdPolicy: "fixture-only / non-formal; not a formal business threshold",
    notForFormalDecision: true,
    syntheticOnly: true
  };
}

function buildIncomeSummary(input, completeHistory) {
  const last12 = completeHistory.slice(-12);
  const last24 = completeHistory.slice(-24);
  const historicalWindowRevenue = sum(completeHistory.map((row) => row.total));
  const totalHistoricalRevenue = input.historicalRevenueBeforeWindow + historicalWindowRevenue;
  const peak = completeHistory.reduce((current, row) => (row.total > current.total ? row : current), { month: null, total: -1 });
  const activeMonthCount = completeHistory.filter((row) => row.total > 0).length;
  const zeroRevenueMonthCount = completeHistory.filter((row) => row.total === 0).length;
  const firstPositiveMonth = completeHistory.find((row) => row.total > 0)?.month ?? null;
  const latestIncomeMonth = [...completeHistory].reverse().find((row) => row.total > 0)?.month ?? null;
  const last12Total = sum(last12.map((row) => row.total));
  const priorSix = completeHistory.slice(-12, -6);
  const recentSix = completeHistory.slice(-6);
  const recentTrend = describeTrend(average(priorSix.map((row) => row.total)), average(recentSix.map((row) => row.total)));

  return {
    historicalTotal: money(totalHistoricalRevenue),
    last12MonthSales: money(last12Total),
    last24MonthSales: money(input.historicalRevenueBeforeWindow + sum(last24.map((row) => row.total))),
    firstPositiveMonth,
    latestIncomeMonth,
    latestIncomeCompleteMonth: latestIncomeMonth,
    last12MonthRevenue: money(last12Total),
    last24MonthRevenue: money(input.historicalRevenueBeforeWindow + sum(last24.map((row) => row.total))),
    totalHistoricalRevenue: money(totalHistoricalRevenue),
    recentTrend,
    peakMonth: peak.month,
    activeMonthCount,
    zeroRevenueMonthCount,
    businessFormBreakdown: buildBusinessFormBreakdown(completeHistory, input.businessForms),
    incompleteMonthExcluded: true
  };
}

function classifyLifecycle(input, incomeSummary) {
  const completeHistory = input.revenueHistory.filter((row) => row.incomplete !== true && row.month <= CUTOFF_MONTH);
  const last3 = average(completeHistory.slice(-3).map((row) => row.total));
  const previous3 = average(completeHistory.slice(-6, -3).map((row) => row.total));
  const previous6 = average(completeHistory.slice(-12, -6).map((row) => row.total));
  const recent6 = average(completeHistory.slice(-6).map((row) => row.total));

  let type = "stable";
  let confidence = "medium";
  const rationale = [];

  if (completeHistory.length < FIXTURE_ONLY_THRESHOLDS.insufficientHistoryCompleteMonths) {
    type = "insufficient_history";
    confidence = "low";
    rationale.push("Complete fixture history has fewer than the non-formal minimum months.");
  } else if (last3 <= FIXTURE_ONLY_THRESHOLDS.inactiveRecentRevenueMax) {
    type = "inactive";
    confidence = "high";
    rationale.push("Recent complete months have no meaningful synthetic revenue.");
  } else if (last3 > previous3 * FIXTURE_ONLY_THRESHOLDS.reboundRatio && previous3 < previous6 * 0.8) {
    type = "rebound";
    confidence = "medium";
    rationale.push("Recent fixture revenue recovered after a prior decline.");
  } else if (recent6 > previous6 * FIXTURE_ONLY_THRESHOLDS.growthRatio) {
    type = "growth";
    confidence = "high";
    rationale.push("Recent six-month fixture average is above the prior six-month average.");
  } else if (recent6 < previous6 * FIXTURE_ONLY_THRESHOLDS.decliningRatio) {
    type = "declining";
    confidence = "medium";
    rationale.push("Recent six-month fixture average is below the prior six-month average.");
  } else if (Number.parseFloat(incomeSummary.last12MonthRevenue) <= FIXTURE_ONLY_THRESHOLDS.longTailLast12RevenueMax) {
    type = "long_tail";
    confidence = "medium";
    rationale.push("Fixture revenue is low but still persistent across complete months.");
  } else {
    rationale.push("Fixture revenue remains materially stable under non-formal rules.");
  }

  return {
    type,
    confidence,
    rationale: rationale.join(" "),
    fixtureThresholds: true,
    notForFormalDecision: true
  };
}

function buildForecast(inputSnapshot, incomeSummary, lifecycle, risks) {
  const average12 = Number.parseFloat(incomeSummary.last12MonthRevenue) / 12;
  const remainingMonthCount = Math.max(0, inputSnapshot.remainingCopyrightMonths);
  const riskAdjustment = risks.some((risk) => risk.severity === "high") ? 0.85 : 1;
  const baseFactor = lifecycleFactor(lifecycle.type) * riskAdjustment;
  const base = average12 * remainingMonthCount * baseFactor;
  const optimistic = base * 1.25;
  const pessimistic = base * 0.65;

  return {
    scenarios: {
      base: scenario("base", base, remainingMonthCount, lifecycle, "Synthetic base scenario."),
      optimistic: scenario("optimistic", optimistic, remainingMonthCount, lifecycle, "Synthetic upside scenario."),
      pessimistic: scenario("pessimistic", pessimistic, remainingMonthCount, lifecycle, "Synthetic downside scenario.")
    },
    fixtureFormula: "last12 average * remaining copyright months * lifecycle factor * readiness/risk adjustment",
    incompleteMonthExcluded: true,
    notForFormalDecision: true,
    syntheticOnly: true
  };
}

function scenario(name, value, remainingMonthCount, lifecycle, assumptionSummary) {
  const lower = value * 0.9;
  const upper = value * 1.1;
  return {
    forecastTotal: money(value),
    forecastTotalNumber: round(value),
    annualBreakdown: buildAnnualBreakdown(value, remainingMonthCount),
    remainingMonths: remainingMonthCount,
    remainingMonthCount,
    methodKey: `fixture_${name}_explainable_curve`,
    assumptionSummary,
    assumptions: [
      "Uses fixture-only non-formal last-12-month average.",
      `Lifecycle factor is derived from ${lifecycle.type}.`,
      "Incomplete months are excluded."
    ],
    confidence: lifecycle.confidence,
    lower: money(lower),
    upper: money(upper),
    range: {
      lower: money(lower),
      upper: money(upper)
    },
    notForFormalDecision: true
  };
}

function buildRating(input, inputSnapshot, incomeSummary, lifecycle, forecast, risks) {
  const forecastScore = Math.min(55, Number.parseFloat(forecast.scenarios.base.forecastTotal) / 12000);
  const lifecycleScore = { growth: 20, stable: 15, rebound: 12, long_tail: 6, declining: 4, inactive: 0, insufficient_history: 2 }[lifecycle.type] ?? 8;
  const readinessScore = input.readiness.status === "ready" ? 12 : 0;
  const copyrightScore = inputSnapshot.remainingCopyrightMonths >= 24 ? 10 : inputSnapshot.remainingCopyrightMonths >= 12 ? 5 : 0;
  const riskPenalty = risks.reduce((total, risk) => total + (risk.severity === "high" ? 10 : risk.severity === "medium" ? 5 : 2), 0);
  const fixtureCalibrationOffset = input.fixtureRatingCalibrationOffset ?? 0;
  const ratingScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        forecastScore +
          lifecycleScore +
          readinessScore +
          copyrightScore -
          riskPenalty +
          fixtureCalibrationOffset
      )
    )
  );
  const rating = FIXTURE_ONLY_THRESHOLDS.ratingScoreBands.find(([, min]) => ratingScore >= min)?.[0] ?? "E";

  return {
    value: rating,
    rating,
    ratingScore,
    resourceInvestmentLevel: resourceInvestmentLevel(rating),
    requiresConfirmation: rating === "S+",
    basis: `Synthetic ${rating} rating fixture.`,
    rationale: "Fixture-only score combines forecast, lifecycle, readiness, copyright period, risk penalties, and optional synthetic calibration for coverage.",
    upgradeReasons: ratingScore >= 70 ? ["Strong synthetic forecast or lifecycle signal."] : [],
    downgradeReasons: risks.filter((risk) => risk.severity !== "low").map((risk) => risk.code),
    fixtureThresholds: true,
    fixtureCalibrationOffset,
    notForFormalDecision: true
  };
}

function identifyRisks(input, inputSnapshot, incomeSummary, lifecycle) {
  const risks = [
    risk("synthetic_fixture_boundary", "low", "Result is generated from fixture-only synthetic data.", ["dataset.mode=fixture"])
  ];

  if (input.readiness.status !== "ready") {
    risks.push(
      risk("data_readiness", "high", "Synthetic readiness gaps block formal evaluation.", input.readiness.gaps.map((gap) => gap.code))
    );
  }
  if (lifecycle.type === "declining") {
    risks.push(risk("revenue_decline", "medium", "Fixture lifecycle indicates declining income.", [incomeSummary.recentTrend]));
  }
  if (inputSnapshot.remainingCopyrightMonths <= FIXTURE_ONLY_THRESHOLDS.copyrightExpiryWarningMonths) {
    risks.push(
      risk("copyright_expiry", "high", "Synthetic remaining copyright period is short.", [
        `${inputSnapshot.remainingCopyrightMonths} months`
      ])
    );
  }
  if (lifecycle.type === "insufficient_history") {
    risks.push(risk("insufficient_history", "medium", "Synthetic complete-month history is short.", [incomeSummary.activeMonthCount]));
  }
  if (input.businessForms.length > 1) {
    risks.push(risk("business_form_mixed", "low", "Synthetic work has multiple business forms.", input.businessForms));
  }
  if (lifecycle.type === "inactive" || lifecycle.type === "long_tail") {
    risks.push(risk("inactive_tail", "medium", "Synthetic income is inactive or long-tail.", [lifecycle.type]));
  }

  return risks;
}

function buildSuggestions(input, lifecycle, rating, risks) {
  const suggestions = [];
  const riskCodes = new Set(risks.map((risk) => risk.code));

  if (rating.rating === "S+" || rating.rating === "S" || lifecycle.type === "growth") {
    suggestions.push(suggestion("promote", 1, "Promote synthetic high-potential old product.", "Higher fixture reach."));
  }
  if (lifecycle.type === "stable") {
    suggestions.push(suggestion("maintain", 1, "Maintain current synthetic operation.", "Stable fixture contribution."));
  }
  if (lifecycle.type === "declining" || lifecycle.type === "inactive") {
    suggestions.push(suggestion("reduce_investment", 1, "Reduce investment for weak synthetic trend.", "Lower fixture cost exposure."));
  }
  if (riskCodes.has("business_form_mixed")) {
    suggestions.push(suggestion("repackage", 2, "Review combined business-form packaging.", "Cleaner fixture positioning."));
  }
  if (lifecycle.type === "long_tail" || lifecycle.type === "rebound") {
    suggestions.push(suggestion("pricing_or_channel_adjustment", 2, "Try synthetic price or channel adjustment.", "Test fixture recovery."));
  }
  if (lifecycle.type === "insufficient_history") {
    suggestions.push(suggestion("observe_only", 1, "Observe until more complete fixture months exist.", "Avoid premature decision."));
  }
  if (riskCodes.has("copyright_expiry")) {
    suggestions.push(suggestion("renewal_review", 1, "Review synthetic renewal feasibility.", "Avoid fixture rights cutoff."));
  }

  return suggestions.slice(0, 3);
}

function buildSyntheticBacktests(evaluations, inputs) {
  const selectedEvaluationIds = ["SYN-WORK-0001", "SYN-WORK-0003", "SYN-WORK-0005", "SYN-WORK-0004"];
  const items = selectedEvaluationIds.map((standardWorkId) => evaluations.find((evaluation) => evaluation.standardWorkId === standardWorkId)).filter(Boolean).map((evaluation) => {
    const input = inputs.find((row) => row.standardWorkId === evaluation.standardWorkId);
    const predicted = Number.parseFloat(evaluation.forecast.scenarios.base.forecastTotal);
    const actual = input?.actualBacktestTotal ?? predicted;
    return {
      standardWorkId: evaluation.standardWorkId,
      outcome: input?.backtestOutcome ?? "covered",
      predictedTotalBase: money(predicted),
      predictedTotalOptimistic: evaluation.forecast.scenarios.optimistic.forecastTotal,
      predictedTotalPessimistic: evaluation.forecast.scenarios.pessimistic.forecastTotal,
      actualTotal: money(actual),
      absoluteError: money(Math.abs(predicted - actual)),
      lifecycle: evaluation.lifecycle.type,
      ratingAtCutoff: evaluation.rating.rating
    };
  });

  const metrics = {
    totalRows: items.length,
    covered: items.filter((item) => item.outcome === "covered").length,
    missed: items.filter((item) => item.outcome === "missed").length,
    over: items.filter((item) => item.outcome === "over").length,
    under: items.filter((item) => item.outcome === "under").length,
    meanAbsoluteError: money(average(items.map((item) => Number.parseFloat(item.absoluteError))))
  };

  return [
    {
      id: "SYN-BACKTEST-0001",
      batchNo: "SYN-BACKTEST-BATCH-0001",
      batchId: "SYN-BACKTEST-0001",
      algorithmVersion: FIXTURE_EVALUATION_ALGORITHM_VERSION,
      cutoffMonth: "2025-04",
      horizonMonths: 12,
      status: "succeeded",
      covered: metrics.covered,
      missed: metrics.missed,
      over: metrics.over,
      under: metrics.under,
      summary: "Synthetic fixture backtest shape only; not a real backtest.",
      syntheticOnly: true,
      metrics,
      items,
      createdAt: "2026-05-01T00:00:00Z",
      finishedAt: "2026-05-01T00:05:00Z"
    }
  ];
}

function buildEngineSummary(evaluations, backtests) {
  return {
    mode: "fixture",
    algorithmVersion: FIXTURE_EVALUATION_ALGORITHM_VERSION,
    resultCount: evaluations.length,
    backtestBatchCount: backtests.length,
    syntheticOnly: true,
    notForFormalDecision: true,
    lifecycleTypes: [...new Set(evaluations.map((item) => item.lifecycle.type))].sort(),
    ratings: [...new Set(evaluations.map((item) => item.rating.rating))].sort((a, b) => RATING_ORDER.indexOf(a) - RATING_ORDER.indexOf(b))
  };
}

function buildBusinessFormBreakdown(history, businessForms) {
  return Object.fromEntries(
    businessForms.map((form) => [
      form,
      {
        revenue: money(sum(history.map((row) => row.businessForms[form] ?? 0))),
        activeMonthCount: history.filter((row) => (row.businessForms[form] ?? 0) > 0).length
      }
    ])
  );
}

function buildAnnualBreakdown(value, remainingMonthCount) {
  if (remainingMonthCount <= 0) return [];
  const monthly = value / remainingMonthCount;
  const months = [];
  let cursor = addMonths(CUTOFF_MONTH, 1);
  for (let index = 0; index < remainingMonthCount; index += 1) {
    months.push(cursor);
    cursor = addMonths(cursor, 1);
  }
  const byYear = new Map();
  for (const monthValue of months) {
    const year = monthValue.slice(0, 4);
    byYear.set(year, (byYear.get(year) ?? 0) + monthly);
  }
  return [...byYear.entries()].map(([year, total]) => ({ year, forecastRevenue: money(total) }));
}

function lifecycleFactor(type) {
  return {
    growth: 1.2,
    stable: 1,
    rebound: 1.05,
    long_tail: 0.8,
    declining: 0.65,
    inactive: 0.25,
    insufficient_history: 0.6
  }[type] ?? 1;
}

function resourceInvestmentLevel(rating) {
  if (rating === "S+" || rating === "S") return "synthetic_high";
  if (rating === "A" || rating === "B") return "synthetic_medium";
  if (rating === "C" || rating === "D") return "synthetic_low";
  return "synthetic_minimal";
}

function risk(code, severity, message, evidence) {
  return {
    code,
    riskCode: code,
    severity,
    score: SEVERITY_SCORE[severity] * 30,
    message,
    evidence,
    rationale: message,
    mitigation: `Synthetic mitigation for ${code}.`,
    mitigationHint: `Synthetic mitigation for ${code}.`
  };
}

function suggestion(action, priority, reason, expectedImpact) {
  return {
    action,
    suggestionCode: action,
    priority,
    rank: priority,
    title: `Synthetic ${action} suggestion`,
    reason,
    rationale: reason,
    expectedImpact,
    expectedEffect: expectedImpact,
    requiresManualReview: false,
    notForFormalDecision: true
  };
}

function describeTrend(previous, recent) {
  if (previous === 0 && recent === 0) return "inactive";
  if (previous === 0) return "growth";
  const ratio = recent / previous;
  if (ratio >= FIXTURE_ONLY_THRESHOLDS.growthRatio) return "up";
  if (ratio <= FIXTURE_ONLY_THRESHOLDS.decliningRatio) return "down";
  return "flat";
}

function monthsBetween(fromMonth, toMonth) {
  const [fromYear, from] = fromMonth.split("-").map(Number);
  const [toYear, to] = toMonth.split("-").map(Number);
  return Math.max(0, (toYear - fromYear) * 12 + (to - from) + 1);
}

function addMonths(monthValue, delta) {
  const [year, monthNumber] = monthValue.split("-").map(Number);
  const zeroBased = year * 12 + (monthNumber - 1) + delta;
  const nextYear = Math.floor(zeroBased / 12);
  const nextMonth = (zeroBased % 12) + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function average(values) {
  if (values.length === 0) return 0;
  return sum(values) / values.length;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function money(value) {
  const cents = Math.round(value * 100);
  const sign = cents < 0 ? "-" : "";
  const absoluteCents = Math.abs(cents);
  const units = Math.floor(absoluteCents / 100);
  const fraction = String(absoluteCents % 100).padStart(2, "0");
  return `${sign}${units}.${fraction}${"0".repeat(MONEY_SCALE - 2)}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
