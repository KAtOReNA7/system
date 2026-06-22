import assert from "node:assert/strict";
import test from "node:test";
import {
  assertSanitizedClosureReport,
  buildGroupDecisionPolicy,
  buildGroupDecisionTemplateRows,
  buildReviewPackRow,
  classifyBlockingReviewItem,
  planGroupDecisionApplication,
  planDecisionApplication,
  summarizeBusinessClosure,
  summarizeReadinessClosure,
  validateDecisionRows,
  validateGroupDecisionRows,
  validateGroupDecisionTemplateSchema,
  validateGroupPolicy,
  validateResetConfirmation,
  validateReviewPackSchema
} from "../src/domain/oldProductEvaluation/reviewDecisionClosure.js";
import { syntheticGroupDecisionTemplateRows } from "./fixtures/m2CandidateBGroupDecision.fixture.js";

const CANDIDATE_VERSION = "m2-realdata-dev-candidate-b-v0.1";

function syntheticItem(overrides = {}) {
  return {
    reviewItemId: 101,
    candidateVersion: CANDIDATE_VERSION,
    stableWorkReference: "m2dev-work-001",
    reasonCode: "high_value_with_data_gap",
    priority: 10,
    currentStatus: "pending",
    rating: "S",
    lifecycle: "stable",
    riskLevel: "high",
    primarySuggestion: "manual_review_required",
    riskCodes: ["metadata_gap"],
    riskTypes: ["blocking"],
    suggestionCodes: ["data_fix_required"],
    ...overrides
  };
}

function decisionRow(overrides = {}) {
  return {
    ...buildReviewPackRow(syntheticItem()),
    reviewerDecision: "approved",
    reviewerReason: "business confirmation based on aggregate local review",
    reviewerName: "reviewer",
    reviewedAt: "2026-06-22T00:00:00.000Z",
    ...overrides
  };
}

test("review pack schema validation accepts generated candidate-b closure rows", () => {
  const rows = [buildReviewPackRow(syntheticItem())];
  const result = validateReviewPackSchema(rows);

  assert.equal(result.valid, true);
  assert.equal(result.rowCount, 1);
  assert.equal(rows[0].groupDecisionId, "GROUP-DATA-GAP-HIGH-VALUE");
});

test("proposed decision classification keeps blocking review items out of automatic approval", () => {
  assert.equal(classifyBlockingReviewItem(syntheticItem()).proposedDecision, "data_fix_required");
  assert.equal(
    classifyBlockingReviewItem(syntheticItem({ reasonCode: "high_value_with_expiry" })).proposedDecision,
    "waiver_granted"
  );
  assert.equal(
    classifyBlockingReviewItem(syntheticItem({ reasonCode: "abnormal_spike" })).proposedDecision,
    "pending"
  );
  assert.equal(
    classifyBlockingReviewItem(syntheticItem({ reasonCode: "insufficient_history" })).proposedDecision,
    "pending"
  );

  const summary = summarizeBusinessClosure([
    buildReviewPackRow(syntheticItem()),
    buildReviewPackRow(syntheticItem({ reasonCode: "high_value_with_expiry" })),
    buildReviewPackRow(syntheticItem({ reasonCode: "abnormal_spike" })),
    buildReviewPackRow(syntheticItem({ reasonCode: "insufficient_history" }))
  ]);
  assert.deepEqual(summary.proposedDecisionDistribution, {
    data_fix_required: 1,
    pending: 2,
    waiver_granted: 1
  });
});

test("invalid decision file rows are rejected before any apply step", () => {
  const result = validateDecisionRows(
    [decisionRow({ reviewerDecision: "ship_it", candidateVersion: "wrong-candidate" })],
    { candidateVersion: CANDIDATE_VERSION }
  );

  assert.equal(result.valid, false);
  assert.equal(result.errors.some((error) => error.field === "reviewerDecision"), true);
  assert.equal(result.errors.some((error) => error.field === "candidateVersion"), true);
});

test("waiver_granted requires reviewer reason and waiver scope", () => {
  const result = validateDecisionRows(
    [decisionRow({ reviewerDecision: "waiver_granted", reviewerReason: "", waiverScope: "" })],
    { candidateVersion: CANDIDATE_VERSION }
  );

  assert.equal(result.valid, false);
  assert.equal(result.errors.some((error) => error.field === "reviewerReason"), true);
  assert.equal(result.errors.some((error) => error.field === "waiverScope"), true);
});

test("data_fix_required requires audit reason, data-fix flag, and reimport flag", () => {
  const result = validateDecisionRows(
    [
      decisionRow({
        reviewerDecision: "data_fix_required",
        reviewerReason: "",
        dataFixRequiredFlag: "false",
        reimportRequiredFlag: ""
      })
    ],
    { candidateVersion: CANDIDATE_VERSION }
  );

  assert.equal(result.valid, false);
  assert.equal(result.errors.some((error) => error.field === "reviewerReason"), true);
  assert.equal(result.errors.some((error) => error.field === "dataFixRequiredFlag"), true);
  assert.equal(result.errors.some((error) => error.field === "reimportRequiredFlag"), true);
});

test("dry-run planning computes next distribution without mutating current rows", () => {
  const currentRows = [buildReviewPackRow(syntheticItem({ reviewItemId: 1 }))];
  const validation = validateDecisionRows(
    [decisionRow({ reviewItemId: "1", reviewerDecision: "no_action_required" })],
    { candidateVersion: CANDIDATE_VERSION }
  );
  const plan = planDecisionApplication(currentRows, validation.decisions);

  assert.equal(validation.valid, true);
  assert.equal(plan.valid, true);
  assert.deepEqual(plan.nextStatusDistribution, { no_action_required: 1 });
  assert.equal(currentRows[0].currentStatus, "pending");
});

test("group policy schema validation summarizes candidate-b closure groups", () => {
  const rows = [
    buildReviewPackRow(syntheticItem({ reviewItemId: 1 })),
    buildReviewPackRow(syntheticItem({ reviewItemId: 2, reasonCode: "high_value_with_expiry" }))
  ];
  const policy = buildGroupDecisionPolicy(rows);
  const validation = validateGroupPolicy(policy);

  assert.equal(validation.valid, true);
  assert.equal(policy.groupCount, 2);
  assert.deepEqual(policy.groupDistribution, {
    "GROUP-DATA-GAP-HIGH-VALUE": 1,
    "GROUP-EXPIRY-HIGH-VALUE": 1
  });
});

test("group decision template generation shape is stable and no-DB", () => {
  const rows = [
    buildReviewPackRow(syntheticItem({ reviewItemId: 1 })),
    buildReviewPackRow(syntheticItem({ reviewItemId: 2, reasonCode: "high_value_with_expiry" }))
  ];
  const templateRows = buildGroupDecisionTemplateRows(rows);
  const schema = validateGroupDecisionTemplateSchema(templateRows);

  assert.equal(schema.valid, true);
  assert.equal(templateRows.length, 2);
  assert.equal(templateRows[0].appliesToAllItemsInGroup, "true");
  assert.equal(templateRows[0].remediationStatus, "not_evaluated");
  assert.equal(templateRows[0].recommendedGroupDecisionAfterRemediation, "data_fix_required");
});

test("invalid group decision is rejected before any apply step", () => {
  const currentRows = [buildReviewPackRow(syntheticItem({ reviewItemId: 1 }))];
  const validation = validateGroupDecisionRows(
    [
      {
        ...syntheticGroupDecisionTemplateRows[0],
        groupDecisionId: "GROUP-UNKNOWN",
        reviewerDecision: "ship_it"
      }
    ],
    { currentRows }
  );

  assert.equal(validation.valid, false);
  assert.equal(validation.errors.some((error) => error.field === "groupDecisionId"), true);
});

test("group waiver_granted requires reviewer reason waiver scope and waiver expiry", () => {
  const currentRows = [
    buildReviewPackRow(syntheticItem({ reviewItemId: 1, reasonCode: "high_value_with_expiry" }))
  ];
  const validation = validateGroupDecisionRows(
    [
      {
        ...syntheticGroupDecisionTemplateRows[1],
        reviewerDecision: "waiver_granted",
        reviewerReason: "",
        reviewerName: "reviewer",
        waiverScope: "",
        waiverExpiry: ""
      }
    ],
    { currentRows }
  );

  assert.equal(validation.valid, false);
  assert.equal(validation.errors.some((error) => error.field === "reviewerReason"), true);
  assert.equal(validation.errors.some((error) => error.field === "waiverScope"), true);
  assert.equal(validation.errors.some((error) => error.field === "waiverExpiry"), true);
});

test("group data_fix_required requires reviewer reason and data-fix flag", () => {
  const currentRows = [buildReviewPackRow(syntheticItem({ reviewItemId: 1 }))];
  const validation = validateGroupDecisionRows(
    [
      {
        ...syntheticGroupDecisionTemplateRows[0],
        reviewerDecision: "data_fix_required",
        reviewerReason: "",
        dataFixRequiredFlag: "false"
      }
    ],
    { currentRows }
  );

  assert.equal(validation.valid, false);
  assert.equal(validation.errors.some((error) => error.field === "reviewerReason"), true);
  assert.equal(validation.errors.some((error) => error.field === "dataFixRequiredFlag"), true);
});

test("group apply dry-run expands confirmed group without mutating current rows", () => {
  const currentRows = [
    buildReviewPackRow(syntheticItem({ reviewItemId: 1 })),
    buildReviewPackRow(syntheticItem({ reviewItemId: 2 })),
    buildReviewPackRow(syntheticItem({ reviewItemId: 3, reasonCode: "high_value_with_expiry" }))
  ];
  const validation = validateGroupDecisionRows(syntheticGroupDecisionTemplateRows, { currentRows });
  const plan = planGroupDecisionApplication(currentRows, validation.decisions);

  assert.equal(validation.valid, true);
  assert.equal(plan.valid, true);
  assert.equal(plan.affectedItemCount, 2);
  assert.deepEqual(plan.nextStatusDistribution, { data_fix_required: 2, pending: 1 });
  assert.equal(currentRows[0].currentStatus, "pending");
});

test("unconfirmed group remains pending", () => {
  const currentRows = [
    buildReviewPackRow(syntheticItem({ reviewItemId: 3, reasonCode: "high_value_with_expiry" }))
  ];
  const validation = validateGroupDecisionRows([syntheticGroupDecisionTemplateRows[1]], { currentRows });
  const plan = planGroupDecisionApplication(currentRows, validation.decisions);

  assert.equal(validation.valid, true);
  assert.deepEqual(plan.confirmedGroups, []);
  assert.deepEqual(plan.unconfirmedGroups, ["GROUP-EXPIRY-HIGH-VALUE"]);
  assert.deepEqual(plan.nextStatusDistribution, { pending: 1 });
});

test("local development reset requires explicit confirmation", () => {
  assert.equal(
    validateResetConfirmation({ resetDevDecisions: true, confirmLocalDevReset: false }),
    false
  );
  assert.equal(
    validateResetConfirmation({ resetDevDecisions: true, confirmLocalDevReset: true }),
    true
  );
});

test("sanitized report guard rejects sensitive fields", () => {
  assert.equal(assertSanitizedClosureReport({ totals: { blocking: 85 } }).sanitized, true);
  const result = assertSanitizedClosureReport({ rawRows: [{ channelName: "private" }] });
  assert.equal(result.sanitized, false);
  assert.equal(result.detected.includes("rawRows"), true);
});

test("readiness closure uses blocking status distribution instead of advisory pending items", () => {
  const readiness = summarizeReadinessClosure({
    finalDecisionsApplied: false,
    proposedDecisionsGenerated: true,
    reviewSummary: {
      statusDistribution: { pending: 2844 },
      blockingStatusDistribution: { pending: 85 },
      pendingCount: 2844,
      auditEventCount: 2844
    }
  });

  assert.equal(readiness.remainingBlockingCount, 85);
  assert.equal(readiness.candidateCanMoveToNextLocalReadinessStage, false);
});
