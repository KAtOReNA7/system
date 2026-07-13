import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const summaryPath =
  "docs/analysis/m2-real-data/M2-post-foundation-readiness-rerun-v1.json";
const reportPath =
  "docs/analysis/m2-real-data/M2-post-foundation-readiness-rerun-v1.md";
const recoveryScript =
  "scripts/m2-real-data/run_m2_classification_tag_foundation_recovery.py";
const rerunScript =
  "scripts/m2-real-data/run_m2_post_foundation_readiness.py";

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

test("post-foundation rerun reconciles the M2 population without dropping facts", async () => {
  const summary = await readJson(summaryPath);
  const scope = summary.scopeReconciliation;

  assert.equal(summary.schema, "m2.post_foundation_readiness_rerun.v1");
  assert.equal(scope.beforeWorkCount, 3054);
  assert.equal(scope.afterWorkCount, 3053);
  assert.equal(scope.foundationWorkCount, 3053);
  assert.equal(scope.billRowsBefore, scope.billRowsAfter);
  assert.equal(scope.rowCountConserved, true);
  assert.equal(scope.incomeAmountConserved, true);
  assert.equal(scope.scopeFullyAligned, true);
});

test("post-foundation rerun preserves the stabilized revenue and front-rating baseline", async () => {
  const summary = await readJson(summaryPath);
  const candidate = summary.candidateRerun;

  assert.deepEqual(candidate.revenueModelDistribution, {
    pure_sales_share: 2578,
    pure_buyout: 287,
    buyout_plus_sales: 183,
    unknown_revenue_model: 5
  });
  assert.deepEqual(candidate.frontRatingDistribution, {
    E: 1948,
    B: 358,
    D: 356,
    S: 117,
    C: 152,
    A: 84,
    "S+": 38
  });
  assert.equal(
    candidate.regressionAgainst3054Checkpoint.unexpectedRevenueModelRegression,
    false
  );
  assert.equal(
    candidate.regressionAgainst3054Checkpoint.unexpectedFrontRatingRegression,
    false
  );
});

test("post-foundation review decisions are applied while formal execution remains blocked", async () => {
  const summary = await readJson(summaryPath);
  const buckets = summary.candidateRerun.reviewBucketDistribution;
  const review = summary.postFoundationBusinessReview;

  assert.deepEqual(buckets, {});
  assert.equal(review.expiredWithRevenueReviewed, 146);
  assert.equal(review.activeRightsSparseRevenueReviewed, 92);
  assert.equal(review.totalPending, 0);
  assert.equal(review.decisionsApplied, true);
  assert.match(
    summary.candidateRerun.reviewBucketComparison.precisionRule,
    /full underlying bill precision/
  );
  assert.equal(summary.gate.m2FormalComplete, false);
  assert.equal(summary.gate.m3FormalExecutionAllowed, false);
  assert.equal(summary.prohibitedActionsConfirmed.wroteFormalMasterData, false);
  assert.equal(summary.prohibitedActionsConfirmed.activatedMappingVersion, false);
});

test("post-foundation public artifacts stay aggregate-only", async () => {
  const [summary, report] = await Promise.all([
    readFile(summaryPath, "utf8"),
    readFile(reportPath, "utf8")
  ]);

  for (const content of [summary, report]) {
    for (const forbidden of [
      "rawBillingRows",
      "channelDisplayName",
      "workDisplayName",
      "authorName",
      "data/private-output",
      "M2-five-source-local-staging",
      "本机缺少",
      "当前机器",
      "missing_on_current_machine",
      "postgres://",
      "postgresql://",
      "PGPASSWORD"
    ]) {
      assert.equal(content.includes(forbidden), false, `public artifact includes ${forbidden}`);
    }
  }
});

test("foundation recovery and rerun scripts do not connect to a database or activate mapping", async () => {
  const sources = await Promise.all([
    readFile(recoveryScript, "utf8"),
    readFile(rerunScript, "utf8")
  ]);

  for (const source of sources) {
    for (const forbidden of [
      "psycopg",
      "new Pool",
      "new Client",
      "postgres://",
      "postgresql://",
      "switch_mapping_version",
      "CREATE TABLE",
      "ALTER TABLE"
    ]) {
      assert.equal(source.includes(forbidden), false, `script source includes ${forbidden}`);
    }
  }
});
