import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

test("M2 forecast output type report reflects local staging impact without formal evaluation", () => {
  const report = readJson("docs/analysis/m2-real-data/M2-forecast-output-type-after-dual-source-staging-v1.json").payload;

  assert.equal(report.scope, "estimated_after_local_file_level_staging");
  assert.equal(report.requiresForecastOutputTypeRerun, true);
  assert.equal(report.copyrightTermForecastIncreaseWorks, 2444);
  assert.equal(report.afterDistribution.copyright_term_forecast, 2444);
  assert.equal(report.formalEvaluationAllowed, false);
  assert.equal(report.formalMasterDataWritten, false);
  assert.equal(report.databaseWritten, false);
});

test("M2 forecast output type v2 separates copyright-term and operating-window forecasts", () => {
  const report = readJson("docs/analysis/m2-real-data/M2-forecast-output-type-after-dual-source-staging-v2.json").payload;

  assert.equal(report.totalWorks, 3054);
  assert.equal(report.after.copyright_term_forecast, 2444);
  assert.equal(report.after.operating_window_forecast_pending_expiry, 610);
  assert.equal(report.after.missingCopyrightEnd, 610);
  assert.equal(report.after.remainingCopyrightMonthAvailable, 2444);
  assert.equal(report.delta.newCopyrightTermForecastWorks, 2444);
  assert.equal(report.notes.modelParametersChanged, false);
  assert.equal(report.safeOutputBoundary.formalMasterDataWritten, false);
  assert.equal(report.safeOutputBoundary.realWorkNamesIncluded, false);
});

test("M2 business readiness remains blocked for formal use after local staging", () => {
  const readiness = readJson("docs/analysis/m2-real-data/M2-business-readiness-after-dual-source-staging-v1.json").payload;

  assert.equal(readiness.m2ForecastOutputTypeRerunRecommended, true);
  assert.equal(readiness.operatorTaskPackRefreshRecommended, true);
  assert.equal(readiness.random20BusinessReviewRefreshRecommended, true);
  assert.equal(readiness.formalEvaluationStillBlocked, true);
  assert.equal(readiness.prohibitedActionsConfirmed.enteredM3, false);
  assert.equal(readiness.prohibitedActionsConfirmed.formalMasterDataWritten, false);
});

test("M2 refreshed task-pack summaries expose only sanitized aggregate counts", () => {
  const operator = readJson("docs/analysis/m2-real-data/M2-operator-task-pack-after-dual-source-staging-summary-v1.json").payload;
  const random20 = readJson("docs/analysis/m2-real-data/M2-random-20-year-evaluation-after-dual-source-staging-summary-v1.json").payload;

  assert.equal(operator.privateWorkbookGitignored, true);
  assert.equal(operator.safeOutputBoundary.realWorkNamesIncluded, false);
  assert.equal(operator.safeOutputBoundary.authorNamesIncluded, false);
  assert.equal(random20.privateWorkbookGitignored, true);
  assert.equal(random20.rowCount, 20);
  assert.equal(random20.safeOutputBoundary.realWorkNamesIncluded, false);
});
