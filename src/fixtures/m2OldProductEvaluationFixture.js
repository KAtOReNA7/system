export const M2_OLD_PRODUCT_DATASET = Object.freeze({
  mode: "fixture",
  source: "m2-b-static-synthetic-fixture",
  formalDataAuthorized: false,
  formalEvaluationAllowed: false,
  syntheticValue: true,
  cutoffMonth: "2026-04",
  incompleteMonths: ["2026-05"]
});

export const M2_OLD_PRODUCT_ALGORITHM_VERSIONS = Object.freeze([
  {
    id: "SYN-ALG-OLD-PRODUCT-0001",
    versionKey: "fixture-old-product-v1",
    status: "fixture_only",
    effectiveFrom: "2026-04-01",
    retiredAt: null,
    usesAiModel: false,
    fixtureOnly: true,
    description: "Synthetic fixture-only old-product evaluation rules for M2-B-1."
  }
]);

const commonInputSnapshot = {
  mappingVersion: "SYN-MAPPING-VERSION-NOT-ACTIVE",
  basicInfoVersion: "SYN-BASIC-INFO-VERSION-0001",
  classificationRelease: "SYN-CLASSIFICATION-RELEASE-0001",
  tagRelease: "SYN-TAG-RELEASE-0001",
  cutoffMonth: "2026-04",
  excludedMonths: ["2026-05"],
  source: "synthetic_fixture"
};

function forecast(base, optimistic, pessimistic) {
  return {
    scenarios: {
      base: {
        forecastTotal: base,
        remainingMonths: 12,
        methodKey: "synthetic_base_curve",
        assumptionSummary: "Synthetic base scenario for fixture-only API tests."
      },
      optimistic: {
        forecastTotal: optimistic,
        remainingMonths: 12,
        methodKey: "synthetic_optimistic_curve",
        assumptionSummary: "Synthetic optimistic scenario for fixture-only API tests."
      },
      pessimistic: {
        forecastTotal: pessimistic,
        remainingMonths: 12,
        methodKey: "synthetic_pessimistic_curve",
        assumptionSummary: "Synthetic pessimistic scenario for fixture-only API tests."
      }
    }
  };
}

function risk(code, severity, score) {
  return {
    riskCode: code,
    severity,
    score,
    rationale: `Synthetic ${severity} risk rationale for ${code}.`,
    mitigation: `Synthetic mitigation for ${code}.`
  };
}

function suggestion(code, rank) {
  return {
    suggestionCode: code,
    rank,
    title: `Synthetic suggestion ${rank}`,
    rationale: `Synthetic rationale for ${code}.`,
    expectedEffect: "Synthetic expected effect only.",
    requiresManualReview: false
  };
}

export const M2_OLD_PRODUCT_EVALUATIONS = Object.freeze([
  {
    standardWorkId: "SYN-WORK-0001",
    workName: "SYN-WORK-NAME-0001",
    authorName: "SYN-AUTHOR-0001",
    classificationPath: ["SYN-CLASS-L1-A", "SYN-CLASS-L2-A", "SYN-CLASS-L3-A"],
    tags: ["SYN-TAG-READY", "SYN-TAG-BOTH-FORMS"],
    channels: ["SYN-CHANNEL-ALPHA", "SYN-CHANNEL-BETA"],
    businessForms: ["audio_copyright", "audio_product"],
    readiness: { status: "ready", gaps: [] },
    resultStatus: "current",
    cutoffMonth: "2026-04",
    lifecycle: {
      type: "growth",
      confidence: "high",
      rationale: "Synthetic growth lifecycle fixture with incomplete 2026-05 excluded."
    },
    rating: {
      value: "S+",
      resourceInvestmentLevel: "synthetic_priority",
      requiresConfirmation: true,
      basis: "Synthetic S+ rating fixture."
    },
    incomeSummary: {
      historicalTotal: "960000.000000000000000000",
      last12MonthSales: "360000.000000000000000000",
      last24MonthSales: "720000.000000000000000000",
      firstPositiveMonth: "2024-05",
      latestIncomeMonth: "2026-04",
      incompleteMonthExcluded: true
    },
    forecast: forecast(
      "420000.000000000000000000",
      "520000.000000000000000000",
      "310000.000000000000000000"
    ),
    risks: [risk("synthetic_market_concentration", "medium", 40)],
    suggestions: [suggestion("synthetic_increase_distribution", 1)],
    backtestSummary: {
      latestBatchId: "SYN-BACKTEST-0001",
      coverage: "covered",
      absoluteError: "12000.000000000000000000"
    },
    inputSnapshot: commonInputSnapshot,
    algorithmVersion: "fixture-old-product-v1",
    updatedAt: "2026-06-01T00:00:00Z"
  },
  {
    standardWorkId: "SYN-WORK-0002",
    workName: "SYN-WORK-NAME-0002",
    authorName: "SYN-AUTHOR-0002",
    classificationPath: ["SYN-CLASS-L1-A", "SYN-CLASS-L2-B", "SYN-CLASS-L3-B"],
    tags: ["SYN-TAG-READY", "SYN-TAG-SINGLE-FORM"],
    channels: ["SYN-CHANNEL-GAMMA"],
    businessForms: ["audio_product"],
    readiness: { status: "ready", gaps: [] },
    resultStatus: "current",
    cutoffMonth: "2026-04",
    lifecycle: {
      type: "stable",
      confidence: "medium",
      rationale: "Synthetic stable lifecycle fixture."
    },
    rating: {
      value: "S",
      resourceInvestmentLevel: "synthetic_high",
      requiresConfirmation: false,
      basis: "Synthetic S rating fixture."
    },
    incomeSummary: {
      historicalTotal: "640000.000000000000000000",
      last12MonthSales: "240000.000000000000000000",
      last24MonthSales: "480000.000000000000000000",
      firstPositiveMonth: "2024-06",
      latestIncomeMonth: "2026-04",
      incompleteMonthExcluded: true
    },
    forecast: forecast(
      "250000.000000000000000000",
      "300000.000000000000000000",
      "210000.000000000000000000"
    ),
    risks: [risk("synthetic_decay_watch", "low", 20)],
    suggestions: [suggestion("synthetic_maintain_operation", 1)],
    backtestSummary: {
      latestBatchId: "SYN-BACKTEST-0001",
      coverage: "covered",
      absoluteError: "8000.000000000000000000"
    },
    inputSnapshot: commonInputSnapshot,
    algorithmVersion: "fixture-old-product-v1",
    updatedAt: "2026-05-30T00:00:00Z"
  },
  {
    standardWorkId: "SYN-WORK-0003",
    workName: "SYN-WORK-NAME-0003",
    authorName: "SYN-AUTHOR-0003",
    classificationPath: ["SYN-MISSING", "SYN-MISSING", "SYN-MISSING"],
    tags: ["SYN-TAG-BLOCKED"],
    channels: ["SYN-CHANNEL-DELTA"],
    businessForms: ["audio_copyright", "audio_product"],
    readiness: {
      status: "blocked",
      gaps: [{ code: "missing_classification", severity: "high", message: "Synthetic missing classification gap." }]
    },
    resultStatus: "current",
    cutoffMonth: "2026-04",
    lifecycle: {
      type: "declining",
      confidence: "medium",
      rationale: "Synthetic declining lifecycle fixture blocked by classification gap."
    },
    rating: {
      value: "A",
      resourceInvestmentLevel: "synthetic_medium",
      requiresConfirmation: false,
      basis: "Synthetic A rating fixture."
    },
    incomeSummary: {
      historicalTotal: "410000.000000000000000000",
      last12MonthSales: "150000.000000000000000000",
      last24MonthSales: "360000.000000000000000000",
      firstPositiveMonth: "2024-07",
      latestIncomeMonth: "2026-04",
      incompleteMonthExcluded: true
    },
    forecast: forecast(
      "130000.000000000000000000",
      "170000.000000000000000000",
      "90000.000000000000000000"
    ),
    risks: [risk("synthetic_classification_gap", "high", 90)],
    suggestions: [suggestion("synthetic_complete_classification", 1)],
    backtestSummary: {
      latestBatchId: "SYN-BACKTEST-0001",
      coverage: "missed",
      absoluteError: "45000.000000000000000000"
    },
    inputSnapshot: commonInputSnapshot,
    algorithmVersion: "fixture-old-product-v1",
    updatedAt: "2026-05-29T00:00:00Z"
  },
  {
    standardWorkId: "SYN-WORK-0004",
    workName: "SYN-WORK-NAME-0004",
    authorName: "SYN-AUTHOR-0004",
    classificationPath: ["SYN-CLASS-L1-B", "SYN-CLASS-L2-C", "SYN-CLASS-L3-C"],
    tags: ["SYN-TAG-BLOCKED"],
    channels: ["SYN-CHANNEL-EPSILON"],
    businessForms: ["audio_copyright"],
    readiness: {
      status: "blocked",
      gaps: [{ code: "missing_copyright_end", severity: "high", message: "Synthetic missing copyright end gap." }]
    },
    resultStatus: "current",
    cutoffMonth: "2026-04",
    lifecycle: {
      type: "long_tail",
      confidence: "medium",
      rationale: "Synthetic long-tail lifecycle fixture."
    },
    rating: {
      value: "B",
      resourceInvestmentLevel: "synthetic_standard",
      requiresConfirmation: false,
      basis: "Synthetic B rating fixture."
    },
    incomeSummary: {
      historicalTotal: "220000.000000000000000000",
      last12MonthSales: "72000.000000000000000000",
      last24MonthSales: "160000.000000000000000000",
      firstPositiveMonth: "2024-08",
      latestIncomeMonth: "2026-04",
      incompleteMonthExcluded: true
    },
    forecast: forecast(
      "68000.000000000000000000",
      "91000.000000000000000000",
      "43000.000000000000000000"
    ),
    risks: [risk("synthetic_rights_gap", "high", 85)],
    suggestions: [suggestion("synthetic_confirm_rights_period", 1)],
    backtestSummary: {
      latestBatchId: "SYN-BACKTEST-0001",
      coverage: "under",
      absoluteError: "16000.000000000000000000"
    },
    inputSnapshot: commonInputSnapshot,
    algorithmVersion: "fixture-old-product-v1",
    updatedAt: "2026-05-28T00:00:00Z"
  },
  {
    standardWorkId: "SYN-WORK-0005",
    workName: "SYN-WORK-NAME-0005",
    authorName: "SYN-AUTHOR-0005",
    classificationPath: ["SYN-CLASS-L1-C", "SYN-CLASS-L2-D", "SYN-CLASS-L3-D"],
    tags: ["SYN-TAG-HISTORICAL"],
    channels: ["SYN-CHANNEL-ZETA"],
    businessForms: ["audio_product"],
    readiness: { status: "ready", gaps: [] },
    resultStatus: "historical",
    cutoffMonth: "2026-04",
    lifecycle: {
      type: "inactive",
      confidence: "high",
      rationale: "Synthetic inactive historical result fixture."
    },
    rating: {
      value: "C",
      resourceInvestmentLevel: "synthetic_low",
      requiresConfirmation: false,
      basis: "Synthetic C rating fixture."
    },
    incomeSummary: {
      historicalTotal: "130000.000000000000000000",
      last12MonthSales: "12000.000000000000000000",
      last24MonthSales: "52000.000000000000000000",
      firstPositiveMonth: "2024-09",
      latestIncomeMonth: "2026-04",
      incompleteMonthExcluded: true
    },
    forecast: forecast(
      "9000.000000000000000000",
      "18000.000000000000000000",
      "3000.000000000000000000"
    ),
    risks: [risk("synthetic_inactive_tail", "medium", 55)],
    suggestions: [suggestion("synthetic_reduce_resource", 1)],
    backtestSummary: {
      latestBatchId: "SYN-BACKTEST-0001",
      coverage: "over",
      absoluteError: "22000.000000000000000000"
    },
    inputSnapshot: commonInputSnapshot,
    algorithmVersion: "fixture-old-product-v1",
    updatedAt: "2026-05-27T00:00:00Z"
  },
  {
    standardWorkId: "SYN-WORK-0006",
    workName: "SYN-WORK-NAME-0006",
    authorName: "SYN-AUTHOR-0006",
    classificationPath: ["SYN-CLASS-L1-C", "SYN-CLASS-L2-E", "SYN-CLASS-L3-E"],
    tags: ["SYN-TAG-INVALIDATED"],
    channels: ["SYN-CHANNEL-ETA"],
    businessForms: ["audio_copyright"],
    readiness: { status: "ready", gaps: [] },
    resultStatus: "invalidated",
    cutoffMonth: "2026-04",
    lifecycle: {
      type: "rebound",
      confidence: "medium",
      rationale: "Synthetic rebound invalidated result fixture."
    },
    rating: {
      value: "D",
      resourceInvestmentLevel: "synthetic_watch",
      requiresConfirmation: false,
      basis: "Synthetic D rating fixture."
    },
    incomeSummary: {
      historicalTotal: "175000.000000000000000000",
      last12MonthSales: "54000.000000000000000000",
      last24MonthSales: "95000.000000000000000000",
      firstPositiveMonth: "2024-10",
      latestIncomeMonth: "2026-04",
      incompleteMonthExcluded: true
    },
    forecast: forecast(
      "60000.000000000000000000",
      "88000.000000000000000000",
      "36000.000000000000000000"
    ),
    risks: [risk("synthetic_rebound_uncertainty", "medium", 60)],
    suggestions: [suggestion("synthetic_monitor_rebound", 1)],
    backtestSummary: {
      latestBatchId: "SYN-BACKTEST-0001",
      coverage: "covered",
      absoluteError: "6000.000000000000000000"
    },
    inputSnapshot: commonInputSnapshot,
    algorithmVersion: "fixture-old-product-v1",
    updatedAt: "2026-05-26T00:00:00Z"
  },
  {
    standardWorkId: "SYN-WORK-0007",
    workName: "SYN-WORK-NAME-0007",
    authorName: "SYN-AUTHOR-0007",
    classificationPath: ["SYN-CLASS-L1-D", "SYN-CLASS-L2-F", "SYN-CLASS-L3-F"],
    tags: ["SYN-TAG-INSUFFICIENT-HISTORY"],
    channels: ["SYN-CHANNEL-THETA"],
    businessForms: ["audio_product"],
    readiness: {
      status: "blocked",
      gaps: [{ code: "missing_income_fact", severity: "medium", message: "Synthetic insufficient history gap." }]
    },
    resultStatus: "current",
    cutoffMonth: "2026-04",
    lifecycle: {
      type: "insufficient_history",
      confidence: "low",
      rationale: "Synthetic insufficient-history fixture."
    },
    rating: {
      value: "E",
      resourceInvestmentLevel: "synthetic_minimal",
      requiresConfirmation: false,
      basis: "Synthetic E rating fixture."
    },
    incomeSummary: {
      historicalTotal: "24000.000000000000000000",
      last12MonthSales: "24000.000000000000000000",
      last24MonthSales: "24000.000000000000000000",
      firstPositiveMonth: "2026-01",
      latestIncomeMonth: "2026-04",
      incompleteMonthExcluded: true
    },
    forecast: forecast(
      "21000.000000000000000000",
      "30000.000000000000000000",
      "12000.000000000000000000"
    ),
    risks: [risk("synthetic_short_history", "medium", 50)],
    suggestions: [suggestion("synthetic_wait_for_history", 1)],
    backtestSummary: {
      latestBatchId: "SYN-BACKTEST-0001",
      coverage: "missed",
      absoluteError: "9000.000000000000000000"
    },
    inputSnapshot: commonInputSnapshot,
    algorithmVersion: "fixture-old-product-v1",
    updatedAt: "2026-05-25T00:00:00Z"
  }
]);

export const M2_OLD_PRODUCT_BACKTESTS = Object.freeze([
  {
    id: "SYN-BACKTEST-0001",
    batchNo: "SYN-BACKTEST-BATCH-0001",
    algorithmVersion: "fixture-old-product-v1",
    cutoffMonth: "2025-04",
    horizonMonths: 12,
    status: "succeeded",
    metrics: {
      totalRows: 4,
      covered: 1,
      missed: 1,
      over: 1,
      under: 1,
      meanAbsoluteError: "13750.000000000000000000"
    },
    items: [
      {
        standardWorkId: "SYN-WORK-0001",
        outcome: "covered",
        predictedTotalBase: "400000.000000000000000000",
        predictedTotalOptimistic: "520000.000000000000000000",
        predictedTotalPessimistic: "300000.000000000000000000",
        actualTotal: "412000.000000000000000000",
        absoluteError: "12000.000000000000000000",
        lifecycle: "growth",
        ratingAtCutoff: "S+"
      },
      {
        standardWorkId: "SYN-WORK-0003",
        outcome: "missed",
        predictedTotalBase: "180000.000000000000000000",
        predictedTotalOptimistic: "220000.000000000000000000",
        predictedTotalPessimistic: "140000.000000000000000000",
        actualTotal: "135000.000000000000000000",
        absoluteError: "45000.000000000000000000",
        lifecycle: "declining",
        ratingAtCutoff: "A"
      },
      {
        standardWorkId: "SYN-WORK-0005",
        outcome: "over",
        predictedTotalBase: "34000.000000000000000000",
        predictedTotalOptimistic: "52000.000000000000000000",
        predictedTotalPessimistic: "21000.000000000000000000",
        actualTotal: "12000.000000000000000000",
        absoluteError: "22000.000000000000000000",
        lifecycle: "inactive",
        ratingAtCutoff: "C"
      },
      {
        standardWorkId: "SYN-WORK-0004",
        outcome: "under",
        predictedTotalBase: "52000.000000000000000000",
        predictedTotalOptimistic: "70000.000000000000000000",
        predictedTotalPessimistic: "38000.000000000000000000",
        actualTotal: "68000.000000000000000000",
        absoluteError: "16000.000000000000000000",
        lifecycle: "long_tail",
        ratingAtCutoff: "B"
      }
    ],
    createdAt: "2026-05-01T00:00:00Z",
    finishedAt: "2026-05-01T00:05:00Z"
  }
]);
