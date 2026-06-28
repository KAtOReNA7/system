import assert from "node:assert/strict";
import test from "node:test";

import {
  applyFieldCompletionRow,
  applyFieldCompletionRows,
  deriveMissingCoreFields,
  normalizeUserFields
} from "../src/domain/newProductEvaluation/fieldCompletion.js";
import {
  M3_FIELD_COMPLETION_FIXTURE_BEFORE_RESULTS,
  M3_FIELD_COMPLETION_FIXTURE_ROWS
} from "../src/domain/newProductEvaluation/fixtures/newProductFieldCompletion.fixture.js";

test("synthetic completion fixture covers hard blockers without private files", () => {
  assert.equal(M3_FIELD_COMPLETION_FIXTURE_ROWS.length, 3);
  assert.equal(M3_FIELD_COMPLETION_FIXTURE_BEFORE_RESULTS.every((item) => item.readinessStatus === "blocked"), true);
  assert.equal(M3_FIELD_COMPLETION_FIXTURE_ROWS.some((row) => row.userFields.source === "publication"), true);
  assert.equal(M3_FIELD_COMPLETION_FIXTURE_ROWS.some((row) => row.userFields.source === "web_original"), true);
  assert.equal(M3_FIELD_COMPLETION_FIXTURE_ROWS.every((row) => row.missingCoreFields.includes("title")), true);
  assert.equal(JSON.stringify(M3_FIELD_COMPLETION_FIXTURE_ROWS).includes("data/private"), false);
});

test("deriveMissingCoreFields maps readiness blockers to completion fields", () => {
  assert.deepEqual(
    deriveMissingCoreFields([
      "missing_title",
      "missing_volume_estimate",
      "missing_heat_signal",
      "same_name_audio_not_checked",
      "not_a_core_blocker"
    ]),
    ["title", "wordCountOrAudioVolumeEstimate", "heatSignal", "sameNameAudioStatusCheckStatus"]
  );
});

test("normalizeUserFields supports source, classification, heat and channel fields", () => {
  const fields = normalizeUserFields({
    title: "SYN-TITLE",
    author: "SYN-AUTHOR",
    source: "publication",
    classification: "A, B",
    wordCount: "300,000",
    heatSignalType: "platformHeat",
    heatSignalValue: "strong",
    targetChannels: "channel-a, channel-b",
    sameNameAudioStatusCheckStatus: "checked"
  });

  assert.equal(fields.wordCount, 300000);
  assert.deepEqual(fields.confirmedClassification, ["A", "B"]);
  assert.deepEqual(fields.targetChannels, ["channel-a", "channel-b"]);
  assert.deepEqual(fields.platformHeat, { summary: "strong" });
});

test("synthetic field completion apply moves blocked samples to warning_only or ready", () => {
  const applied = applyFieldCompletionRows(M3_FIELD_COMPLETION_FIXTURE_ROWS);

  assert.equal(applied.ok, true);
  assert.equal(applied.aggregate.materialCount, 3);
  assert.equal(applied.aggregate.readinessDistribution.blocked, undefined);
  assert.equal(applied.aggregate.forecastGeneratedCount, 3);
  assert.equal(applied.aggregate.ratingGeneratedCount, 3);
  assert.equal(applied.aggregate.workflowCompletedCount, 3);
  assert.equal(applied.aggregate.backtestAnchorCandidateCount, 3);
  assert.equal(applied.materialResults.every((item) => item.missingCoreFields.length === 0), true);
  assert.equal(applied.materialResults.every((item) => item.researchQuestionCount >= 0), true);
  assert.equal(applied.materialResults.every((item) => item.comparablesSummary.systemComparableCount >= 0), true);
  assert.equal(applied.materialResults.every((item) => Object.hasOwn(item.authorRankingSummary, "enabled")), true);
});

test("field completion apply does not expose titles authors recommendations resources or forecast ranges", () => {
  const applied = applyFieldCompletionRow(M3_FIELD_COMPLETION_FIXTURE_ROWS[0]);
  const text = JSON.stringify(applied);

  assert.equal(text.includes("SYN-M3-COMPLETED-TITLE"), false);
  assert.equal(text.includes("SYN-M3-AUTHOR"), false);
  assert.equal(text.includes("developmentRecommendation"), false);
  assert.equal(text.includes("resourceInvestmentLevel"), false);
  assert.equal(text.includes("forecastRange"), false);
  assert.equal(applied.rawMaterialStored, false);
  assert.equal(applied.rawTextPersisted, false);
});
