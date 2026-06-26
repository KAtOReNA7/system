import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

test("rating/suggestion calibration summary reports aggregate improvement only", () => {
  const report = readJson("docs/analysis/m2-real-data/M2-rating-suggestion-calibration-v1-summary.json").payload;

  assert.equal(report.candidateVersion, "m2-realdata-dev-rating-suggestion-calibrated-v1.0");
  assert.equal(report.forecastModelChanged, false);
  assert.equal(report.formalMasterDataWritten, false);
  assert.equal(report.databaseConnected, false);
  assert.equal(report.m3Entered, false);
  assert.ok(report.rating.changedRows > 0);
  assert.ok(report.suggestion.changedRows > 0);
  assert.equal(report.expectedImprovement.stillNeedsUserValidation, true);
  assert.equal(report.safeOutputBoundary.realWorkNamesIncluded, false);
  assert.equal(report.safeOutputBoundary.authorNamesIncluded, false);
});

test("post-calibration operator task pack summary keeps standard id and private boundary", () => {
  const summary = readJson("docs/analysis/m2-real-data/M2-operator-task-pack-after-rating-suggestion-calibration-v1-summary.json").payload;

  assert.equal(summary.candidateVersion, "m2-realdata-dev-rating-suggestion-calibrated-v1.0");
  assert.equal(summary.taskRows, 30);
  assert.equal(summary.reviewableRows, 25);
  assert.equal(summary.hasStandardWorkIdColumn, true);
  assert.equal(summary.keepsUserFeedbackFields, true);
  assert.equal(summary.showsOldAndNewRating, true);
  assert.equal(summary.showsOldAndNewSuggestion, true);
  assert.equal(summary.privateWorkbookGitignored, true);
  assert.equal(summary.formalMasterDataWritten, false);
  assert.equal(summary.m3Entered, false);
});
