import { badRequest } from "../errors.js";
import {
  M2_OLD_PRODUCT_ALGORITHM_VERSIONS,
  M2_OLD_PRODUCT_BACKTESTS,
  M2_OLD_PRODUCT_DATASET,
  M2_OLD_PRODUCT_EVALUATIONS
} from "../fixtures/m2OldProductEvaluationFixture.js";

const ALLOWED_QUERY_KEYS = new Set([
  "page",
  "pageSize",
  "sort",
  "query",
  "rating",
  "lifecycle",
  "risk",
  "classification1",
  "classification2",
  "classification3",
  "businessForm",
  "readiness",
  "resultStatus",
  "algorithmVersion",
  "cutoffMonth"
]);

const ALLOWED_GAP_QUERY_KEYS = new Set([...ALLOWED_QUERY_KEYS, "gapCode", "severity"]);

const ALLOWED_BACKTEST_QUERY_KEYS = new Set([
  "page",
  "pageSize",
  "algorithmVersion",
  "cutoffMonth",
  "horizonMonths",
  "lifecycle",
  "classification1"
]);

const ALLOWED_SORTS = new Set([
  "forecastTotal.desc",
  "forecastTotal.asc",
  "last12MonthSales.desc",
  "rating.asc",
  "riskSeverity.desc",
  "updatedAt.desc"
]);

const RATINGS = ["S+", "S", "A", "B", "C", "D", "E"];
const LIFECYCLES = [
  "growth",
  "stable",
  "declining",
  "long_tail",
  "inactive",
  "rebound",
  "insufficient_history"
];
const RISKS = ["high", "medium", "low"];
const BUSINESS_FORMS = ["audio_copyright", "audio_product"];
const READINESS = ["ready", "blocked"];
const RESULT_STATUSES = ["current", "historical", "invalidated"];
const GAP_CODES = [
  "missing_income_fact",
  "mapping_not_active",
  "missing_standard_work_name",
  "missing_author",
  "missing_classification",
  "missing_required_tags",
  "missing_copyright_start",
  "missing_copyright_end",
  "copyright_expired",
  "pending_tag_configuration",
  "unresolved_data_issue",
  "incomplete_month_only"
];
const GAP_SEVERITIES = ["high", "medium", "low"];

export function getM2OldProductDataset() {
  return clone(M2_OLD_PRODUCT_DATASET);
}

export async function getM2OldProductEvaluationOverview() {
  const items = M2_OLD_PRODUCT_EVALUATIONS;
  const readyWorks = items.filter((item) => item.readiness.status === "ready").length;
  const blockedWorks = items.length - readyWorks;

  return withDataset({
    summary: {
      eligibleWorks: items.length,
      evaluatedWorks: items.filter((item) => item.resultStatus === "current").length,
      blockedWorks,
      readyWorks,
      currentResults: countBy(items, "resultStatus", "current"),
      historicalResults: countBy(items, "resultStatus", "historical"),
      invalidatedResults: countBy(items, "resultStatus", "invalidated"),
      latestCutoffMonth: M2_OLD_PRODUCT_DATASET.cutoffMonth
    },
    distribution: {
      rating: distribution(items, (item) => item.rating.value, RATINGS),
      lifecycle: distribution(items, (item) => item.lifecycle.type, LIFECYCLES),
      readiness: distribution(items, (item) => item.readiness.status, READINESS),
      resultStatus: distribution(items, (item) => item.resultStatus, RESULT_STATUSES),
      riskSeverity: distribution(items, (item) => highestRiskSeverity(item), RISKS)
    },
    notices: [
      {
        code: "fixture_only",
        message: "M2-B-1 exposes fixture-only synthetic old-product evaluation data."
      },
      {
        code: "incomplete_month_excluded",
        message: "Synthetic month 2026-05 is marked incomplete and excluded from the cutoff."
      },
      {
        code: "formal_data_blocked",
        message: "Formal evaluation remains blocked until M1 formal data readiness is complete."
      }
    ]
  });
}

export async function listM2OldProductEvaluations(_config, { pagination, searchParams }) {
  validateQueryKeys(searchParams, ALLOWED_QUERY_KEYS);
  const sort = searchParams.get("sort") ?? "updatedAt.desc";
  if (!ALLOWED_SORTS.has(sort)) {
    throw badRequest("sort is not supported");
  }

  const filtered = applyEvaluationFilters(M2_OLD_PRODUCT_EVALUATIONS, searchParams);
  const sorted = sortEvaluations(filtered, sort);

  return withDataset({
    items: paginate(sorted.map(toEvaluationSummary), pagination),
    pagination: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total: sorted.length
    }
  });
}

export async function getM2OldProductEvaluationById(_config, standardWorkId) {
  const item = M2_OLD_PRODUCT_EVALUATIONS.find(
    (evaluation) => evaluation.standardWorkId === standardWorkId
  );
  if (!item) {
    return null;
  }

  return withDataset(toEvaluationDetail(item));
}

export async function listM2OldProductReadinessGaps(_config, { pagination, searchParams }) {
  validateQueryKeys(searchParams, ALLOWED_GAP_QUERY_KEYS);
  const gapCode = searchParams.get("gapCode");
  const severity = searchParams.get("severity");
  validateAllowedValue(gapCode, GAP_CODES, "gapCode");
  validateAllowedValue(severity, GAP_SEVERITIES, "severity");

  const rows = applyEvaluationFilters(M2_OLD_PRODUCT_EVALUATIONS, searchParams)
    .flatMap((item) =>
      item.readiness.gaps.map((gap) => ({
        standardWorkId: item.standardWorkId,
        workName: item.workName,
        readiness: item.readiness.status,
        gapCode: gap.code,
        severity: gap.severity,
        message: gap.message,
        cutoffMonth: item.cutoffMonth,
        blocksFormalEvaluation: item.readiness.status === "blocked",
        suggestedOwnerAction: gap.message
      }))
    )
    .filter((row) =>
      (!gapCode || row.gapCode === gapCode) &&
      (!severity || row.severity === severity)
    );

  return withDataset({
    items: paginate(rows, pagination),
    pagination: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total: rows.length
    }
  });
}

export async function listM2OldProductAlgorithmVersions() {
  return withDataset({
    items: clone(M2_OLD_PRODUCT_ALGORITHM_VERSIONS)
  });
}

export async function listM2OldProductBacktests(_config, { pagination, searchParams }) {
  validateQueryKeys(searchParams, ALLOWED_BACKTEST_QUERY_KEYS);
  const filtered = applyBacktestFilters(M2_OLD_PRODUCT_BACKTESTS, searchParams);
  return withDataset({
    items: paginate(filtered.map(toBacktestSummary), pagination),
    pagination: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total: filtered.length
    }
  });
}

export async function getM2OldProductBacktestById(_config, backtestBatchId) {
  const batch = M2_OLD_PRODUCT_BACKTESTS.find((item) => item.id === backtestBatchId);
  if (!batch) {
    return null;
  }

  return withDataset({
    batch: toBacktestSummary(batch),
    metrics: clone(batch.metrics),
    items: clone(batch.items)
  });
}

function withDataset(body) {
  return {
    dataset: getM2OldProductDataset(),
    ...clone(body)
  };
}

function toEvaluationSummary(item) {
  const baseScenario = item.forecast.scenarios.base;
  return {
    standardWorkId: item.standardWorkId,
    workName: item.workName,
    authorName: item.authorName,
    classificationPath: item.classificationPath,
    businessForms: item.businessForms,
    cutoffMonth: item.cutoffMonth,
    lifecycle: item.lifecycle.type,
    lifecycleConfidence: item.lifecycle.confidence,
    rating: item.rating.value,
    ratingScore: item.rating.ratingScore,
    forecastTotal: item.forecast.scenarios.base.forecastTotal,
    forecastRange: clone(baseScenario.range),
    remainingCopyrightMonths: baseScenario.remainingMonths,
    last12MonthSales: item.incomeSummary.last12MonthSales,
    incompleteMonthExcluded: item.incomeSummary.incompleteMonthExcluded,
    riskLevel: highestRiskSeverity(item),
    riskSeverityScore: highestRiskScore(item),
    primarySuggestion: item.suggestions[0]?.suggestionCode ?? null,
    resultStatus: item.resultStatus,
    readiness: item.readiness.status,
    algorithmVersion: item.algorithmVersion,
    warningCount: item.warnings.length,
    syntheticOnly: item.syntheticOnly,
    notForFormalDecision: item.notForFormalDecision,
    updatedAt: item.updatedAt
  };
}

function toEvaluationDetail(item) {
  return {
    oldProductEvaluationResult: clone(item),
    resultId: item.resultId,
    status: item.status,
    invalidationState: clone(item.invalidationState),
    warnings: clone(item.warnings),
    generatedAt: item.generatedAt,
    syntheticOnly: item.syntheticOnly,
    notForFormalDecision: item.notForFormalDecision,
    work: {
      standardWorkId: item.standardWorkId,
      workName: item.workName,
      authorName: item.authorName,
      classificationPath: item.classificationPath,
      tags: item.tags,
      channels: item.channels,
      businessForms: item.businessForms
    },
    readiness: clone(item.readiness),
    incomeSummary: clone(item.incomeSummary),
    lifecycle: clone(item.lifecycle),
    forecast: clone(item.forecast),
    rating: clone(item.rating),
    risks: clone(item.risks),
    suggestions: clone(item.suggestions),
    backtestSummary: clone(item.backtestSummary),
    inputSnapshot: clone(item.inputSnapshot),
    algorithmVersion: M2_OLD_PRODUCT_ALGORITHM_VERSIONS.find(
      (version) => version.versionKey === item.algorithmVersion
    ),
    history: [
      {
        resultStatus: item.resultStatus,
        cutoffMonth: item.cutoffMonth,
        updatedAt: item.updatedAt
      }
    ]
  };
}

function toBacktestSummary(batch) {
  return {
    id: batch.id,
    batchNo: batch.batchNo,
    algorithmVersion: batch.algorithmVersion,
    cutoffMonth: batch.cutoffMonth,
    horizonMonths: batch.horizonMonths,
    status: batch.status,
    summary: batch.summary,
    syntheticOnly: batch.syntheticOnly,
    covered: batch.covered,
    missed: batch.missed,
    over: batch.over,
    under: batch.under,
    metrics: batch.metrics,
    createdAt: batch.createdAt,
    finishedAt: batch.finishedAt
  };
}

function applyEvaluationFilters(items, searchParams) {
  const filters = {
    query: searchParams.get("query"),
    rating: searchParams.get("rating"),
    lifecycle: searchParams.get("lifecycle"),
    risk: searchParams.get("risk"),
    classification1: searchParams.get("classification1"),
    classification2: searchParams.get("classification2"),
    classification3: searchParams.get("classification3"),
    businessForm: searchParams.get("businessForm"),
    readiness: searchParams.get("readiness"),
    resultStatus: searchParams.get("resultStatus"),
    algorithmVersion: searchParams.get("algorithmVersion"),
    cutoffMonth: searchParams.get("cutoffMonth")
  };

  validateAllowedValue(filters.rating, RATINGS, "rating");
  validateAllowedValue(filters.lifecycle, LIFECYCLES, "lifecycle");
  validateAllowedValue(filters.risk, RISKS, "risk");
  validateAllowedValue(filters.businessForm, BUSINESS_FORMS, "businessForm");
  validateAllowedValue(filters.readiness, READINESS, "readiness");
  validateAllowedValue(filters.resultStatus, RESULT_STATUSES, "resultStatus");
  validateAllowedValue(
    filters.algorithmVersion,
    M2_OLD_PRODUCT_ALGORITHM_VERSIONS.map((item) => item.versionKey),
    "algorithmVersion"
  );
  validateCutoffMonth(filters.cutoffMonth);

  return items.filter((item) => {
    const query = filters.query?.toLowerCase();
    return (
      (!query ||
        item.standardWorkId.toLowerCase().includes(query) ||
        item.workName.toLowerCase().includes(query) ||
        item.authorName.toLowerCase().includes(query)) &&
      (!filters.rating || item.rating.value === filters.rating) &&
      (!filters.lifecycle || item.lifecycle.type === filters.lifecycle) &&
      (!filters.risk || highestRiskSeverity(item) === filters.risk) &&
      (!filters.classification1 || item.classificationPath[0] === filters.classification1) &&
      (!filters.classification2 || item.classificationPath[1] === filters.classification2) &&
      (!filters.classification3 || item.classificationPath[2] === filters.classification3) &&
      (!filters.businessForm || item.businessForms.includes(filters.businessForm)) &&
      (!filters.readiness || item.readiness.status === filters.readiness) &&
      (!filters.resultStatus || item.resultStatus === filters.resultStatus) &&
      (!filters.algorithmVersion || item.algorithmVersion === filters.algorithmVersion) &&
      (!filters.cutoffMonth || item.cutoffMonth === filters.cutoffMonth)
    );
  });
}

function applyBacktestFilters(items, searchParams) {
  const algorithmVersion = searchParams.get("algorithmVersion");
  const cutoffMonth = searchParams.get("cutoffMonth");
  const horizonMonths = searchParams.get("horizonMonths");
  const lifecycle = searchParams.get("lifecycle");
  const classification1 = searchParams.get("classification1");

  validateAllowedValue(
    algorithmVersion,
    M2_OLD_PRODUCT_ALGORITHM_VERSIONS.map((item) => item.versionKey),
    "algorithmVersion"
  );
  validateCutoffMonth(cutoffMonth);
  validateAllowedValue(lifecycle, LIFECYCLES, "lifecycle");
  if (horizonMonths && !/^[0-9]+$/.test(horizonMonths)) {
    throw badRequest("horizonMonths must be a positive integer");
  }

  return items.filter((item) => {
    const batchItems = item.items
      .map((row) =>
        M2_OLD_PRODUCT_EVALUATIONS.find((evaluation) => evaluation.standardWorkId === row.standardWorkId)
      )
      .filter(Boolean);

    return (
      (!algorithmVersion || item.algorithmVersion === algorithmVersion) &&
      (!cutoffMonth || item.cutoffMonth === cutoffMonth) &&
      (!horizonMonths || item.horizonMonths === Number(horizonMonths)) &&
      (!lifecycle || batchItems.some((evaluation) => evaluation.lifecycle.type === lifecycle)) &&
      (!classification1 ||
        batchItems.some((evaluation) => evaluation.classificationPath[0] === classification1))
    );
  });
}

function sortEvaluations(items, sort) {
  const sorted = [...items];
  const comparators = {
    "forecastTotal.desc": (a, b) =>
      numeric(b.forecast.scenarios.base.forecastTotal) - numeric(a.forecast.scenarios.base.forecastTotal),
    "forecastTotal.asc": (a, b) =>
      numeric(a.forecast.scenarios.base.forecastTotal) - numeric(b.forecast.scenarios.base.forecastTotal),
    "last12MonthSales.desc": (a, b) =>
      numeric(b.incomeSummary.last12MonthSales) - numeric(a.incomeSummary.last12MonthSales),
    "rating.asc": (a, b) => RATINGS.indexOf(a.rating.value) - RATINGS.indexOf(b.rating.value),
    "riskSeverity.desc": (a, b) => highestRiskScore(b) - highestRiskScore(a),
    "updatedAt.desc": (a, b) => b.updatedAt.localeCompare(a.updatedAt)
  };
  return sorted.sort(comparators[sort]);
}

function validateQueryKeys(searchParams, allowedKeys) {
  for (const key of searchParams.keys()) {
    if (!allowedKeys.has(key)) {
      throw badRequest(`filter ${key} is not supported`);
    }
  }
}

function validateAllowedValue(value, allowed, name) {
  if (value && !allowed.includes(value)) {
    throw badRequest(`${name} is not supported`);
  }
}

function validateCutoffMonth(value) {
  if (value && !/^[0-9]{4}-[0-9]{2}$/.test(value)) {
    throw badRequest("cutoffMonth must use YYYY-MM format");
  }
}

function countBy(items, key, value) {
  return items.filter((item) => item[key] === value).length;
}

function distribution(items, accessor, keys) {
  return Object.fromEntries(keys.map((key) => [key, items.filter((item) => accessor(item) === key).length]));
}

function highestRiskSeverity(item) {
  return [...item.risks].sort((a, b) => b.score - a.score)[0]?.severity ?? "low";
}

function highestRiskScore(item) {
  return [...item.risks].sort((a, b) => b.score - a.score)[0]?.score ?? 0;
}

function paginate(items, pagination) {
  const start = (pagination.page - 1) * pagination.pageSize;
  return items.slice(start, start + pagination.pageSize);
}

function numeric(value) {
  return Number.parseFloat(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
