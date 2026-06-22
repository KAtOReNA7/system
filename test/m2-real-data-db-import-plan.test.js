import assert from "node:assert/strict";
import test from "node:test";
import {
  REVIEW_ACTIONS,
  allowedActionsForStatus,
  assertLocalDatabaseTarget,
  compareDistribution,
  summarizeReconciliation,
  summarizeReviewWorkflow
} from "../src/domain/oldProductEvaluation/realDataDbImportPlan.js";

test("local database target guard accepts only local non-formal targets", () => {
  assert.equal(
    assertLocalDatabaseTarget({
      host: "127.0.0.1",
      databaseName: "m1_local_dev",
      environmentName: "m1-local-dev"
    }).localOnly,
    true
  );

  assert.equal(
    assertLocalDatabaseTarget({
      host: "db.example.com",
      databaseName: "m1_local_dev",
      environmentName: "m1-local-dev"
    }).localOnly,
    false
  );

  assert.equal(
    assertLocalDatabaseTarget({
      host: "localhost",
      databaseName: "m1_staging",
      environmentName: "m1-local-dev"
    }).localOnly,
    false
  );
});

test("distribution comparison reports exact aggregate mismatches", () => {
  assert.equal(compareDistribution({ S: 2, A: 1 }, { A: 1, S: 2 }).matches, true);
  const comparison = compareDistribution({ S: 2, A: 1 }, { A: 2, S: 2 });
  assert.equal(comparison.matches, false);
  assert.deepEqual(comparison.mismatches, ["A"]);
});

test("reconciliation summary requires candidate version and aggregate counts to match", () => {
  const result = summarizeReconciliation({
    fileSummary: {
      candidateVersion: "m2-realdata-dev-candidate-b-v0.1",
      evaluatedWorkCount: 3054,
      latestCompleteMonth: "2026-04",
      ratingDistribution: { S: 54, A: 136 },
      lifecycleDistribution: { growth: 540 },
      manualReviewRequiredCount: 85,
      advisoryOnlyCount: 2759
    },
    dbSummary: {
      candidateVersion: "m2-realdata-dev-candidate-b-v0.1",
      evaluationResults: 3054,
      latestCompleteMonth: "2026-04",
      ratingDistribution: { A: 136, S: 54 },
      lifecycleDistribution: { growth: 540 },
      blockingReviewItems: 85,
      advisoryReviewItems: 2759
    }
  });

  assert.equal(result.passed, true);
});

test("review workflow summary keeps pending blocking reviews auditable", () => {
  const summary = summarizeReviewWorkflow([
    {
      reviewType: "blocking_manual_review",
      reviewStatus: "pending",
      reviewReasonCode: "high_value_with_data_gap",
      reviewPriority: 10,
      auditEventCount: 1
    },
    {
      reviewType: "advisory_review",
      reviewStatus: "pending",
      reviewReasonCode: "copyright_missing",
      reviewPriority: 80,
      auditEventCount: 1
    }
  ]);

  assert.equal(summary.totalReviewItems, 2);
  assert.equal(summary.blockingReviewItems, 1);
  assert.equal(summary.pendingCount, 2);
  assert.equal(summary.auditEventCount, 2);
});

test("review action defaults do not allow automatic bulk approval", () => {
  assert.deepEqual(allowedActionsForStatus("approved"), []);
  assert.deepEqual(allowedActionsForStatus("pending"), Object.keys(REVIEW_ACTIONS));
});
