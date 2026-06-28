import assert from "node:assert/strict";
import test from "node:test";

import {
  buildM3DryRunReview,
  buildSyntheticCompletionDryRunReview
} from "../src/domain/newProductEvaluation/dryRunReview.js";
import {
  M3_FIELD_COMPLETION_FIXTURE_BEFORE_RESULTS,
  M3_FIELD_COMPLETION_FIXTURE_ROWS
} from "../src/domain/newProductEvaluation/fixtures/newProductFieldCompletion.fixture.js";
import { applyFieldCompletionRows } from "../src/domain/newProductEvaluation/fieldCompletion.js";

test("dry-run review summarizes before and after completion", () => {
  const after = applyFieldCompletionRows(M3_FIELD_COMPLETION_FIXTURE_ROWS);
  const review = buildM3DryRunReview({
    beforeResults: M3_FIELD_COMPLETION_FIXTURE_BEFORE_RESULTS,
    afterResults: after.materialResults
  });

  assert.equal(review.overview.materialCount, 3);
  assert.equal(review.overview.completionNeededCount, 3);
  assert.equal(review.overview.completionAppliedCount, 3);
  assert.equal(review.overview.forecastGeneratedCount, 3);
  assert.equal(review.overview.ratingGeneratedCount, 3);
  assert.equal(review.overview.workflowCompletedCount, 3);
  assert.equal(review.overview.backtestAnchorCount, 3);
  assert.equal(review.beforeAfterComparison.every((item) => item.beforeReadiness === "blocked"), true);
  assert.equal(review.beforeAfterComparison.every((item) => item.afterReadiness !== "blocked"), true);
  assert.equal(review.beforeAfterComparison.every((item) => item.afterMissingCoreFields.length === 0), true);
});

test("synthetic dry-run review exposes human acceptance checklist and formal guardrails", () => {
  const review = buildSyntheticCompletionDryRunReview();

  assert.equal(review.fixtureOnly, true);
  assert.equal(review.nonFormal, true);
  assert.equal(review.notForFormalDecision, true);
  assert.ok(review.humanAcceptanceChecklist.some((item) => item.item === "field_extraction_accuracy"));
  assert.ok(review.humanAcceptanceChecklist.some((item) => item.item === "no_development_recommendation"));
  assert.equal(review.guardrails.databaseConnected, false);
  assert.equal(review.guardrails.migrationExecuted, false);
  assert.equal(review.guardrails.formalExecution, false);
});

test("dry-run review stays sanitized and does not emit forbidden output concepts", () => {
  const review = buildSyntheticCompletionDryRunReview();
  const text = JSON.stringify(review);

  assert.equal(text.includes("SYN-M3-COMPLETED-TITLE"), false);
  assert.equal(text.includes("SYN-M3-AUTHOR"), false);
  assert.equal(text.includes("raw material body"), false);
  assert.equal(review.guardrails.developmentRecommendationEmitted, false);
  assert.equal(review.guardrails.resourceLevelEmitted, false);
  assert.equal(review.guardrails.forecastRangeEmitted, false);
  assert.equal(text.includes("data/private-input"), false);
  assert.equal(text.includes("data/private-output"), false);
});
