const VALID_STATUSES = new Set([
  "pending",
  "approved",
  "data_fix_required",
  "waiver_granted",
  "rejected_for_formal",
  "no_action_required"
]);

const VALID_REVIEW_TYPES = new Set([
  "blocking_manual_review",
  "advisory_review"
]);

const ACTION_TO_STATUS = Object.freeze({
  approve: "approved",
  request_data_fix: "data_fix_required",
  grant_waiver: "waiver_granted",
  reject_for_formal: "rejected_for_formal",
  mark_no_action_required: "no_action_required"
});

const FORMAL_BLOCKING_STATUSES = new Set([
  "pending",
  "data_fix_required",
  "rejected_for_formal"
]);

export const BLOCKING_REVIEW_STATUSES = Object.freeze([...VALID_STATUSES]);
export const BLOCKING_REVIEW_TYPES = Object.freeze([...VALID_REVIEW_TYPES]);
export const BLOCKING_REVIEW_ACTIONS = Object.freeze(Object.keys(ACTION_TO_STATUS));

export function transitionReviewItem(item, action, actor, reason, options = {}) {
  validateReviewItem(item);
  validateAction(action);

  const normalizedActor = requireNonEmptyString(actor, "actor");
  const normalizedReason = requireNonEmptyString(reason, "reason");
  const nextStatus = ACTION_TO_STATUS[action];
  const transitionedAt = options.transitionedAt ?? new Date().toISOString();
  const nextItem = {
    ...clone(item),
    reviewStatus: nextStatus,
    updatedAt: transitionedAt,
    lastReviewedBy: normalizedActor,
    lastReviewReason: normalizedReason
  };

  return {
    item: nextItem,
    auditEvent: {
      eventId: `SYN-FR-AUDIT-${item.reviewItemId}-${action}`,
      reviewItemId: item.reviewItemId,
      action,
      actor: normalizedActor,
      reason: normalizedReason,
      previousStatus: item.reviewStatus,
      nextStatus,
      occurredAt: transitionedAt,
      fixtureOnly: true,
      databaseWritten: false,
      notForFormalDecision: true
    },
    before: clone(item),
    after: clone(nextItem),
    databaseWritten: false,
    fixtureOnly: true,
    notForFormalDecision: true,
    formalEvaluationAllowed: false
  };
}

export function summarizeReviewItems(items) {
  const normalized = assertArray(items);
  const statusDistribution = Object.fromEntries(BLOCKING_REVIEW_STATUSES.map((status) => [status, 0]));
  const typeDistribution = Object.fromEntries(BLOCKING_REVIEW_TYPES.map((type) => [type, 0]));
  const reasonDistribution = {};
  let blockingCount = 0;
  let advisoryCount = 0;
  let unresolvedBlockingCount = 0;

  for (const item of normalized) {
    validateReviewItem(item);
    statusDistribution[item.reviewStatus] += 1;
    typeDistribution[item.reviewType] += 1;
    reasonDistribution[item.reasonCode] = (reasonDistribution[item.reasonCode] ?? 0) + 1;
    if (isBlockingReviewItem(item)) {
      blockingCount += 1;
      if (blocksFormalEntry(item)) {
        unresolvedBlockingCount += 1;
      }
    } else {
      advisoryCount += 1;
    }
  }

  return {
    total: normalized.length,
    blockingCount,
    advisoryCount,
    unresolvedBlockingCount,
    readyForFormalAfterReview: unresolvedBlockingCount === 0,
    statusDistribution,
    typeDistribution,
    reasonDistribution
  };
}

export function canEnterFormalAfterReview(items) {
  return summarizeReviewItems(items).readyForFormalAfterReview;
}

export function blocksFormalEntry(item) {
  validateReviewItem(item);
  return isBlockingReviewItem(item) && FORMAL_BLOCKING_STATUSES.has(item.reviewStatus);
}

export function isBlockingReviewItem(item) {
  validateReviewItem(item);
  return item.reviewType === "blocking_manual_review" && item.isBlocking === true;
}

export function validateReviewItem(item) {
  if (!item || typeof item !== "object") {
    throw new Error("review item must be an object");
  }
  requireNonEmptyString(item.reviewItemId, "reviewItemId");
  requireNonEmptyString(item.reasonCode, "reasonCode");
  if (!VALID_STATUSES.has(item.reviewStatus)) {
    throw new Error(`unknown review status: ${item.reviewStatus}`);
  }
  if (!VALID_REVIEW_TYPES.has(item.reviewType)) {
    throw new Error(`unknown review type: ${item.reviewType}`);
  }
}

function validateAction(action) {
  if (!Object.hasOwn(ACTION_TO_STATUS, action)) {
    throw new Error(`unknown review action: ${action}`);
  }
}

function requireNonEmptyString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function assertArray(items) {
  if (!Array.isArray(items)) {
    throw new Error("review items must be an array");
  }
  return items;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
