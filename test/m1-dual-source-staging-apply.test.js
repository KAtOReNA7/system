import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

test("dual-source limited staging apply plan keeps only approved local fields", () => {
  const plan = readJson("docs/analysis/m1-master-data/M1-dual-source-limited-staging-apply-plan-v1.json").payload;
  const counts = plan.counts;

  assert.equal(plan.applyScope.formalMasterDataWritten, false);
  assert.equal(plan.applyScope.databaseWritten, false);
  assert.equal(plan.applyScope.m3Entered, false);
  assert.deepEqual(plan.applyScope.allowedFields, [
    "authorName",
    "copyrightEndDate",
    "copyrightStartDate",
    "standardWorkName"
  ]);
  assert.equal(counts.safeAutoApplyRecords, 7780);
  assert.equal(counts.userConfirmedOverrideRecords, 2);
  assert.equal(counts.totalStagingRecords, 7782);
  assert.equal(counts.fieldCounts.classificationLevel1, undefined);
  assert.equal(counts.fieldCounts.requiredTags, undefined);
});

test("dual-source limited staging dry-run blocks forbidden apply patterns", () => {
  const dryRun = readJson("docs/analysis/m1-master-data/M1-dual-source-limited-staging-apply-dry-run-v1.json").payload;
  const checks = dryRun.dryRunSafetyChecks;

  assert.equal(dryRun.dryRunResult, "pass");
  assert.equal(checks.onlyAllowedFields, true);
  assert.equal(checks.classificationAndTagsApplied, false);
  assert.equal(checks.nonEmptyAuthoritativeOverwriteCount, 0);
  assert.equal(checks.weakMatchAppliedCount, 0);
  assert.equal(checks.unresolvedDualSourceConflictAppliedCount, 0);
  assert.equal(checks.formalMasterDataWritten, false);
  assert.equal(checks.databaseWritten, false);
});

test("dual-source staging result is file-level and rollbackable", () => {
  const result = readJson("docs/analysis/m1-master-data/M1-dual-source-limited-staging-apply-result-v1.json").payload;

  assert.equal(result.applyResult, "file_level_staging_written");
  assert.equal(result.safeOutputBoundary.formalMasterDataWritten, false);
  assert.equal(result.safeOutputBoundary.databaseWritten, false);
  assert.equal(result.rollback.clearMethod.includes("delete the private file-level staging JSON"), true);
  assert.equal(result.prohibitedActionsConfirmed.gitAddDotUsed, false);
  assert.equal(result.prohibitedActionsConfirmed.stashTouched, false);
});

test("M1 gap after local staging changes only allowed master-data gaps", () => {
  const gap = readJson("docs/analysis/m1-master-data/M1-gap-after-dual-source-staging-apply-v1.json").payload;
  const fields = gap.fieldGapResults;

  assert.equal(fields.missingAuthor.localStagingReduction, 2369);
  assert.equal(fields.missingCopyrightStart.localStagingReduction, 2969);
  assert.equal(fields.missingCopyrightEnd.localStagingReduction, 2444);
  assert.equal(fields.missingClassification1.localStagingReduction, 0);
  assert.equal(fields.missingRequiredTags.localStagingReduction, 0);
  assert.equal(gap.formalMasterDataWritten, false);
  assert.equal(gap.databaseWritten, false);
});
