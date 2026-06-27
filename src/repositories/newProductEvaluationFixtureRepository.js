import { badRequest } from "../errors.js";
import {
  M3_NEW_PRODUCT_ALGORITHM_VERSIONS,
  M3_NEW_PRODUCT_BACKTESTS,
  M3_NEW_PRODUCT_DATASET,
  M3_NEW_PRODUCT_ENGINE_SUMMARY,
  M3_NEW_PRODUCT_M4_CALIBRATION_CANDIDATES,
  M3_NEW_PRODUCT_TOPICS
} from "../fixtures/m3NewProductEvaluationFixture.js";

const ALLOWED_TOPIC_QUERY_KEYS = new Set([
  "page",
  "pageSize",
  "query",
  "source",
  "readiness",
  "status",
  "rating",
  "sort"
]);

const ALLOWED_GAP_QUERY_KEYS = new Set([
  "page",
  "pageSize",
  "gapCode",
  "severity",
  "readiness"
]);

const ALLOWED_BACKTEST_QUERY_KEYS = new Set(["page", "pageSize", "checkpoint", "outcome"]);
const ALLOWED_M4_QUERY_KEYS = new Set(["page", "pageSize", "trigger", "status"]);

const SOURCES = ["publication", "web_original"];
const READINESS = ["ready", "blocked", "draft"];
const STATUSES = [
  "evaluation_ready",
  "input_confirmed",
  "readiness_blocked",
  "material_parse_pending",
  "linked_after_sales"
];
const RATINGS = ["S+", "S", "A", "B", "C", "D", "E", "blocked"];
const SORTS = ["createdAt.desc", "fiveYearBase.desc", "firstYearForecast.desc", "rating.asc"];
const SEVERITIES = ["high", "medium", "low"];
const M4_TRIGGERS = ["above_interval", "below_interval"];
const M4_STATUSES = ["candidate_entry_only"];

export function getM3NewProductDataset() {
  return clone(M3_NEW_PRODUCT_DATASET);
}

export async function getM3NewProductOverview() {
  const topics = M3_NEW_PRODUCT_TOPICS;
  return withDataset({
    summary: {
      totalTopics: topics.length,
      readyTopics: M3_NEW_PRODUCT_ENGINE_SUMMARY.readyTopics,
      blockedTopics: M3_NEW_PRODUCT_ENGINE_SUMMARY.blockedTopics,
      draftTopics: M3_NEW_PRODUCT_ENGINE_SUMMARY.draftTopics,
      linkedTopics: M3_NEW_PRODUCT_ENGINE_SUMMARY.linkedTopics,
      finalComparatorCap: 3,
      backtestCheckpoints: ["first_year", "third_year", "fifth_year"],
      m4CalibrationCandidateCount: M3_NEW_PRODUCT_ENGINE_SUMMARY.m4CalibrationCandidateCount
    },
    distribution: {
      source: distribution(topics, (topic) => topic.source, SOURCES),
      readiness: distribution(topics, (topic) => topic.inputSnapshot.readiness, READINESS),
      status: distribution(topics, (topic) => topic.status, STATUSES),
      rating: distribution(topics, (topic) => topic.rating.value, RATINGS)
    },
    notices: [
      {
        code: "fixture_only",
        message: "M3 new-product evaluation is implemented as a synthetic fixture/prototype."
      },
      {
        code: "formal_m3_blocked",
        message: "M3 formal execution remains blocked until M2 formal readiness and user authorization."
      },
      {
        code: "no_raw_material",
        message: "Fixture material objects contain metadata and structured fields only."
      }
    ]
  });
}

export async function listM3NewProductTopics(_config, { pagination, searchParams }) {
  validateQueryKeys(searchParams, ALLOWED_TOPIC_QUERY_KEYS);
  const sort = searchParams.get("sort") ?? "createdAt.desc";
  if (!SORTS.includes(sort)) {
    throw badRequest("sort is not supported");
  }
  const filtered = applyTopicFilters(M3_NEW_PRODUCT_TOPICS, searchParams);
  const sorted = sortTopics(filtered, sort);
  return withDataset({
    items: paginate(sorted.map(toTopicSummary), pagination),
    pagination: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total: sorted.length
    }
  });
}

export async function getM3NewProductTopicById(_config, topicId) {
  const topic = M3_NEW_PRODUCT_TOPICS.find((item) => item.topicId === topicId);
  if (!topic) {
    return null;
  }
  return withDataset(toTopicDetail(topic));
}

export async function listM3NewProductReadinessGaps(_config, { pagination, searchParams }) {
  validateQueryKeys(searchParams, ALLOWED_GAP_QUERY_KEYS);
  const gapCode = searchParams.get("gapCode");
  const severity = searchParams.get("severity");
  const readiness = searchParams.get("readiness");
  validateAllowedValue(severity, SEVERITIES, "severity");
  validateAllowedValue(readiness, READINESS, "readiness");

  const rows = M3_NEW_PRODUCT_TOPICS.flatMap((topic) =>
    topic.inputSnapshot.gaps.map((gap) => ({
      topicId: topic.topicId,
      title: topic.title,
      readiness: topic.inputSnapshot.readiness,
      gapCode: gap.gapCode,
      field: gap.field,
      severity: gap.severity,
      blocksFormalEvaluation: gap.blocksFormalEvaluation,
      suggestedOwnerAction: gap.suggestedOwnerAction
    }))
  ).filter((row) =>
    (!gapCode || row.gapCode === gapCode) &&
    (!severity || row.severity === severity) &&
    (!readiness || row.readiness === readiness)
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

export async function listM3NewProductComparatorCandidates(_config, { pagination, searchParams }) {
  validateQueryKeys(searchParams, new Set(["page", "pageSize", "topicId", "selectedAsFinal"]));
  const topicId = searchParams.get("topicId");
  const selectedAsFinal = searchParams.get("selectedAsFinal");
  if (selectedAsFinal && !["true", "false"].includes(selectedAsFinal)) {
    throw badRequest("selectedAsFinal must be true or false");
  }
  const rows = M3_NEW_PRODUCT_TOPICS.flatMap((topic) =>
    topic.comparators.map((item) => ({
      topicId: topic.topicId,
      ...item
    }))
  ).filter((row) =>
    (!topicId || row.topicId === topicId) &&
    (!selectedAsFinal || String(row.selectedAsFinal) === selectedAsFinal)
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

export async function listM3NewProductAlgorithmVersions() {
  return withDataset({
    items: clone(M3_NEW_PRODUCT_ALGORITHM_VERSIONS)
  });
}

export async function listM3NewProductBacktests(_config, { pagination, searchParams }) {
  validateQueryKeys(searchParams, ALLOWED_BACKTEST_QUERY_KEYS);
  const checkpoint = searchParams.get("checkpoint");
  const outcome = searchParams.get("outcome");
  const rows = M3_NEW_PRODUCT_BACKTESTS.filter((batch) =>
    (!checkpoint || batch.checkpoints.includes(checkpoint)) &&
    (!outcome || batch.items.some((item) => item.outcome === outcome))
  );
  return withDataset({
    items: paginate(rows.map(toBacktestSummary), pagination),
    pagination: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total: rows.length
    }
  });
}

export async function getM3NewProductBacktestById(_config, backtestBatchId) {
  const batch = M3_NEW_PRODUCT_BACKTESTS.find((item) => item.id === backtestBatchId);
  if (!batch) {
    return null;
  }
  return withDataset({
    batch: toBacktestSummary(batch),
    metrics: clone(batch.metrics),
    items: clone(batch.items)
  });
}

export async function listM3NewProductM4CalibrationCandidates(_config, { pagination, searchParams }) {
  validateQueryKeys(searchParams, ALLOWED_M4_QUERY_KEYS);
  const trigger = searchParams.get("trigger");
  const status = searchParams.get("status");
  validateAllowedValue(trigger, M4_TRIGGERS, "trigger");
  validateAllowedValue(status, M4_STATUSES, "status");

  const rows = M3_NEW_PRODUCT_M4_CALIBRATION_CANDIDATES.filter((item) =>
    (!trigger || item.trigger === trigger) &&
    (!status || item.status === status)
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

function withDataset(body) {
  return {
    dataset: getM3NewProductDataset(),
    ...clone(body)
  };
}

function toTopicSummary(topic) {
  return {
    topicId: topic.topicId,
    title: topic.title,
    authorName: topic.authorName,
    source: topic.source,
    classificationPath: topic.classificationPath,
    status: topic.status,
    readiness: topic.inputSnapshot.readiness,
    rating: topic.rating.value,
    fiveYearBase: topic.forecast.fiveYearBase,
    firstYearForecast: topic.forecast.firstYearForecast,
    targetChannels: topic.targetChannels,
    finalComparatorCount: topic.comparators.filter(
      (item) => item.selectedAsFinal && item.countsAgainstFinalComparatorCap
    ).length,
    sameAuthorReferenceCount: topic.comparators.filter(
      (item) => item.sameAuthor && item.selectedAsFinal
    ).length,
    authorRankingEnabled: topic.authorRanking.enabled,
    topicWorkLinkStatus: topic.topicWorkLink.status,
    syntheticOnly: topic.syntheticOnly,
    notForFormalDecision: topic.notForFormalDecision,
    createdAt: topic.createdAt,
    updatedAt: topic.updatedAt
  };
}

function toTopicDetail(topic) {
  return {
    topic: {
      topicId: topic.topicId,
      title: topic.title,
      authorName: topic.authorName,
      source: topic.source,
      classificationPath: topic.classificationPath,
      targetChannels: topic.targetChannels,
      status: topic.status
    },
    inputSnapshot: clone(topic.inputSnapshot),
    material: clone(topic.material),
    contentFit: clone(topic.contentFit),
    comparators: clone(topic.comparators),
    authorRanking: clone(topic.authorRanking),
    externalSignals: clone(topic.externalSignals),
    forecast: clone(topic.forecast),
    rating: clone(topic.rating),
    risks: clone(topic.risks),
    topicWorkLink: clone(topic.topicWorkLink),
    backtestPlan: clone(topic.backtestPlan),
    warnings: clone(topic.warnings),
    syntheticOnly: topic.syntheticOnly,
    notForFormalDecision: topic.notForFormalDecision
  };
}

function toBacktestSummary(batch) {
  return {
    id: batch.id,
    batchNo: batch.batchNo,
    algorithmVersion: batch.algorithmVersion,
    checkpoints: batch.checkpoints,
    status: batch.status,
    syntheticOnly: batch.syntheticOnly,
    summary: batch.summary,
    metrics: batch.metrics
  };
}

function applyTopicFilters(items, searchParams) {
  const filters = {
    query: searchParams.get("query"),
    source: searchParams.get("source"),
    readiness: searchParams.get("readiness"),
    status: searchParams.get("status"),
    rating: searchParams.get("rating")
  };
  validateAllowedValue(filters.source, SOURCES, "source");
  validateAllowedValue(filters.readiness, READINESS, "readiness");
  validateAllowedValue(filters.status, STATUSES, "status");
  validateAllowedValue(filters.rating, RATINGS, "rating");
  return items.filter((topic) => {
    const query = filters.query?.toLowerCase();
    return (
      (!query ||
        topic.topicId.toLowerCase().includes(query) ||
        topic.title.toLowerCase().includes(query) ||
        topic.authorName.toLowerCase().includes(query)) &&
      (!filters.source || topic.source === filters.source) &&
      (!filters.readiness || topic.inputSnapshot.readiness === filters.readiness) &&
      (!filters.status || topic.status === filters.status) &&
      (!filters.rating || topic.rating.value === filters.rating)
    );
  });
}

function sortTopics(items, sort) {
  const sorted = [...items];
  const comparators = {
    "createdAt.desc": (a, b) => b.createdAt.localeCompare(a.createdAt),
    "fiveYearBase.desc": (a, b) => numeric(b.forecast.fiveYearBase) - numeric(a.forecast.fiveYearBase),
    "firstYearForecast.desc": (a, b) =>
      numeric(b.forecast.firstYearForecast) - numeric(a.forecast.firstYearForecast),
    "rating.asc": (a, b) => RATINGS.indexOf(a.rating.value) - RATINGS.indexOf(b.rating.value)
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

function distribution(items, accessor, keys) {
  return Object.fromEntries(keys.map((key) => [key, items.filter((item) => accessor(item) === key).length]));
}

function paginate(items, pagination) {
  const start = (pagination.page - 1) * pagination.pageSize;
  return items.slice(start, start + pagination.pageSize);
}

function numeric(value) {
  return Number.parseFloat(value ?? 0);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
