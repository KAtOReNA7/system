import { badRequest } from "../errors.js";
import {
  blocksFormalEntry,
  canEnterFormalAfterReview,
  summarizeReviewItems,
  transitionReviewItem
} from "../domain/oldProductEvaluation/blockingReviewWorkflow.js";
import {
  buildAdvisoryDisplayModel,
  M2_ADVISORY_REVIEW_FIXTURE_AGGREGATE,
  summarizeAdvisoryReviews
} from "../domain/oldProductEvaluation/advisoryReviewDisplay.js";
import {
  M2_BLOCKING_REVIEW_DATASET,
  M2_BLOCKING_REVIEW_FIXTURE_ITEMS
} from "../fixtures/m2BlockingReviewWorkflow.fixture.js";

const ALLOWED_QUERY_KEYS = new Set([
  "page",
  "pageSize",
  "reviewStatus",
  "reviewType",
  "reasonCode",
  "isBlocking"
]);

const REVIEW_STATUSES = [
  "pending",
  "approved",
  "data_fix_required",
  "waiver_granted",
  "rejected_for_formal",
  "no_action_required"
];

const REVIEW_TYPES = ["blocking_manual_review", "advisory_review"];

export async function listM2BlockingReviewItems(_config, { pagination, searchParams }) {
  validateQueryKeys(searchParams);
  const filtered = applyFilters(M2_BLOCKING_REVIEW_FIXTURE_ITEMS, searchParams);
  return withDataset({
    items: paginate(filtered.map(toReviewSummary), pagination),
    pagination: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total: filtered.length
    },
    aggregate: clone(M2_BLOCKING_REVIEW_DATASET.reviewAggregate),
    workflowSummary: summarizeReviewItems(filtered),
    canEnterFormalAfterReview: canEnterFormalAfterReview(filtered)
  });
}

export async function getM2BlockingReviewItemById(_config, reviewItemId) {
  const item = M2_BLOCKING_REVIEW_FIXTURE_ITEMS.find(
    (candidate) => candidate.reviewItemId === reviewItemId
  );
  if (!item) {
    return null;
  }
  return withDataset({
    item: toReviewDetail(item),
    workflowImpact: {
      blocksFormalEntry: blocksFormalEntry(item),
      canEnterFormalAfterSingleItemReview: canEnterFormalAfterReview([item])
    }
  });
}

export async function simulateM2BlockingReviewAction(_config, reviewItemId, payload) {
  const item = M2_BLOCKING_REVIEW_FIXTURE_ITEMS.find(
    (candidate) => candidate.reviewItemId === reviewItemId
  );
  if (!item) {
    return null;
  }
  const action = requireString(payload?.action, "action");
  const actor = requireString(payload?.actor ?? "SYN-FIXTURE-OPERATOR", "actor");
  const reason = requireString(payload?.reason ?? "Fixture-only review workflow simulation", "reason");
  const result = transitionReviewItem(item, action, actor, reason, {
    transitionedAt: "2026-06-05T00:00:00.000Z"
  });

  return withDataset({
    ...result,
    formalEvaluationAllowed: false,
    databaseWritten: false,
    notForFormalDecision: true,
    mode: "fixture"
  });
}

export async function getM2AdvisoryReviewSummaryFixture() {
  const summary = summarizeAdvisoryReviews(M2_BLOCKING_REVIEW_FIXTURE_ITEMS, {
    aggregate: M2_ADVISORY_REVIEW_FIXTURE_AGGREGATE
  });
  return withDataset({
    advisorySummary: summary,
    advisoryReviewCount: summary.advisoryReviewCount,
    advisoryReasonDistribution: summary.advisoryReasonDistribution,
    blockingReviewCount: summary.blockingReviewCount,
    displayOnlyCount: summary.displayOnlyCount,
    requiresManualConfirmationBeforeExportCount:
      summary.requiresManualConfirmationBeforeExportCount,
    renewalReviewDisplayCount: summary.renewalReviewDisplayCount,
    downlistDisplayCount: summary.downlistDisplayCount
  });
}

export function getM2BlockingReviewDataset() {
  return clone(M2_BLOCKING_REVIEW_DATASET);
}

function withDataset(body) {
  return {
    dataset: getM2BlockingReviewDataset(),
    mode: "fixture",
    formalEvaluationAllowed: false,
    formalEvaluationExecuted: false,
    notForFormalDecision: true,
    databaseWritten: false,
    ...clone(body)
  };
}

function applyFilters(items, searchParams) {
  const reviewStatus = searchParams.get("reviewStatus");
  const reviewType = searchParams.get("reviewType");
  const reasonCode = searchParams.get("reasonCode");
  const isBlocking = parseOptionalBoolean(searchParams.get("isBlocking"), "isBlocking");

  validateAllowedValue(reviewStatus, REVIEW_STATUSES, "reviewStatus");
  validateAllowedValue(reviewType, REVIEW_TYPES, "reviewType");

  return items.filter((item) =>
    (!reviewStatus || item.reviewStatus === reviewStatus) &&
    (!reviewType || item.reviewType === reviewType) &&
    (!reasonCode || item.reasonCode === reasonCode) &&
    (isBlocking === undefined || item.isBlocking === isBlocking)
  );
}

function validateQueryKeys(searchParams) {
  for (const key of searchParams.keys()) {
    if (!ALLOWED_QUERY_KEYS.has(key)) {
      throw badRequest(`filter ${key} is not supported`);
    }
  }
}

function validateAllowedValue(value, allowed, name) {
  if (value && !allowed.includes(value)) {
    throw badRequest(`${name} is not supported`);
  }
}

function parseOptionalBoolean(value, name) {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  throw badRequest(`${name} must be true or false`);
}

function requireString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw badRequest(`${name} is required`);
  }
  return value.trim();
}

function paginate(items, pagination) {
  const start = (pagination.page - 1) * pagination.pageSize;
  return items.slice(start, start + pagination.pageSize);
}

function toReviewSummary(item) {
  return {
    reviewItemId: item.reviewItemId,
    standardWorkId: item.standardWorkId,
    workLabel: item.workLabel,
    reviewType: item.reviewType,
    reviewStatus: item.reviewStatus,
    reasonCode: item.reasonCode,
    reasonLabel: item.reasonLabel,
    isBlocking: item.isBlocking,
    blocksFormalEntry: blocksFormalEntry(item),
    displayModel: buildAdvisoryDisplayModel(item),
    suggestedAction: item.suggestedAction,
    updatedAt: item.updatedAt,
    syntheticOnly: true,
    notForFormalDecision: true
  };
}

function toReviewDetail(item) {
  return {
    ...toReviewSummary(item),
    createdAt: item.createdAt,
    advisoryFlags: clone(item.advisoryFlags ?? []),
    fixtureOnly: true,
    databaseWritten: false,
    formalEvaluationAllowed: false
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
