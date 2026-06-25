import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

test("dual-source spotcheck feedback report captures completed user review without private details", () => {
  const report = readJson("docs/analysis/m1-master-data/M1-dual-source-spotcheck-feedback-analysis-v1.json");
  const payload = report.payload;

  assert.equal(payload.totalRows, 80);
  assert.equal(payload.completedRows, 80);
  assert.equal(payload.decisionDistribution.accept, 38);
  assert.equal(payload.decisionDistribution.needs_modify, 42);
  assert.equal(payload.readyForLocalStagingApply, false);
  assert.equal(payload.safeOutputBoundary.realWorkNamesIncluded, false);
  assert.equal(JSON.stringify(payload).includes("standardWorkId"), false);
});

test("dual-source auto-apply v2 removes conflict and classification patterns from automatic apply", () => {
  const rule = readJson("docs/analysis/m1-master-data/M1-dual-source-auto-apply-rule-v2.json").payload;

  assert.equal(rule.rules.dualSourceConflict.autoApply, false);
  assert.equal(rule.rules.classificationAndTags.autoApply, false);
  assert.equal(rule.rules.userCorrectedValues.generalizeAutomatically, false);
  assert.equal(rule.neverAutoApplyFields.includes("classificationLevel1"), true);
  assert.equal(rule.neverAutoApplyFields.includes("requiredTags"), true);
});

test("user-confirmed overrides are staging-scoped and not generalized", () => {
  const overrides = readJson("docs/analysis/m1-master-data/M1-dual-source-user-confirmed-overrides-v1.json").payload;

  assert.equal(overrides.totalRows, 80);
  assert.equal(overrides.byAction.acceptCandidate, 38);
  assert.equal(overrides.byAction.applyCorrectedValue, 42);
  assert.equal(overrides.canApplyToStagingRows, 80);
  assert.equal(overrides.canGeneralizeRows, 0);
});

test("dual-source dry-run v2 preserves safety guards and v2 bucket counts", () => {
  const dryRun = readJson("docs/analysis/m1-master-data/M1-dual-source-masterdata-backfill-dry-run-v2.json").payload;

  assert.equal(dryRun.safetyGuards.dualSourceConflictAutoApplyBlocked, true);
  assert.equal(dryRun.safetyGuards.classificationAndTagsAutoApplyBlocked, true);
  assert.equal(dryRun.safetyGuards.nonEmptyAuthoritativeValueNotOverwritten, true);
  assert.equal(dryRun.v2Buckets.user_confirmed_override_candidates, 80);
  assert.ok(dryRun.v2Buckets.safe_auto_apply_candidates > 0);
});

test("M2 dual-source impact v2 is explicit about conservative accuracy protection", () => {
  const impact = readJson("docs/analysis/m2-real-data/M2-dual-source-backfill-impact-on-evaluation-v2.json").payload;

  assert.equal(impact.status, "local_dry_run_only_no_formal_write_no_m3");
  assert.equal(typeof impact.copyrightTermForecast.decreaseIsAccuracyProtection, "boolean");
  assert.equal(impact.ratingRemainingCopyrightAdjustment.requiresForecastOutputTypeRerun, true);
  assert.equal(impact.safeOutputBoundary.formalMasterDataWritten, false);
});
