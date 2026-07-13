import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const summaryPath =
  "docs/analysis/m2-real-data/M2-post-foundation-review-bucket-attribution-summary-v1.json";
const reportPath =
  "docs/analysis/m2-real-data/M2-post-foundation-review-bucket-attribution-summary-v1.md";
const runnerPath =
  "scripts/m2-real-data/run_m2_post_foundation_review_bucket_attribution.py";

test("review bucket attribution rules stay deterministic and do not auto-approve", () => {
  const output = execFileSync("python", [runnerPath, "--fixture-self-test"], {
    encoding: "utf8"
  });
  const result = JSON.parse(output);

  assert.equal(result.fixtureSelfTest, true);
  assert.equal(result.expiredBranches, 3);
  assert.equal(result.sparseBranches, 3);
  assert.equal(result.noAutomaticFinalDecision, true);
  assert.equal(result.automaticOperatingSuggestionsEnabled, false);
});

test("public attribution summary contains only aggregate counts", async () => {
  const summary = JSON.parse(await readFile(summaryPath, "utf8"));

  assert.equal(
    summary.schema,
    "m2.post_foundation_review_bucket_attribution_summary.v1"
  );
  assert.equal(summary.scope.workCount, 3053);
  assert.equal(summary.scope.expiredWithRevenueReviewCount, 146);
  assert.equal(summary.scope.activeRightsSparseRevenueReviewCount, 92);
  assert.equal(summary.scope.totalReviewCount, 238);
  assert.equal(summary.userConfirmation.confirmedCount, 0);
  assert.equal(summary.userConfirmation.remainingCount, 238);
  assert.equal(summary.productDecision.automaticOperatingSuggestionsEnabled, false);
  assert.equal(summary.formalAuthorization.m2FormalOperationsGranted, true);
  assert.equal(summary.formalAuthorization.m3FormalExecutionGranted, false);
});

test("public attribution artifacts contain no private row fields", async () => {
  const contents = await Promise.all([
    readFile(summaryPath, "utf8"),
    readFile(reportPath, "utf8")
  ]);
  for (const content of contents) {
    for (const forbidden of [
      "standardWorkId",
      "workDisplayName",
      "authorName",
      "rawBillingRows",
      "data/private-output",
      "postgres://",
      "postgresql://",
      "PGPASSWORD"
    ]) {
      assert.equal(content.includes(forbidden), false, `public artifact includes ${forbidden}`);
    }
  }
});

test("review bucket runner remains a private no-database export", async () => {
  const source = await readFile(runnerPath, "utf8");
  assert.match(source, /private-output/);
  for (const forbidden of [
    "psycopg",
    "new Pool",
    "new Client",
    "switch_mapping_version",
    "CREATE TABLE",
    "ALTER TABLE",
    "db\/migrations"
  ]) {
    assert.equal(source.includes(forbidden), false, `runner includes ${forbidden}`);
  }
});
