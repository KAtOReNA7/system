import { applyFieldCompletionRows } from "./fieldCompletion.js";
import {
  M3_FIELD_COMPLETION_FIXTURE_BEFORE_RESULTS,
  M3_FIELD_COMPLETION_FIXTURE_ROWS
} from "./fixtures/newProductFieldCompletion.fixture.js";

export function buildSyntheticCompletionDryRunReview() {
  const afterCompletion = applyFieldCompletionRows(M3_FIELD_COMPLETION_FIXTURE_ROWS);
  return buildM3DryRunReview({
    beforeResults: M3_FIELD_COMPLETION_FIXTURE_BEFORE_RESULTS,
    afterResults: afterCompletion.materialResults,
    mode: "synthetic_completion_fixture"
  });
}

export function buildM3DryRunReview({ beforeResults = [], afterResults = [], mode = "dry_run_review" } = {}) {
  const beforeById = new Map(beforeResults.map((item) => [item.anonymousMaterialId, item]));
  const afterById = new Map(afterResults.map((item) => [item.anonymousMaterialId, item]));
  const materialIds = [...new Set([...beforeById.keys(), ...afterById.keys()])].sort();
  const beforeAfterComparison = materialIds.map((materialId) => {
    const before = beforeById.get(materialId) ?? {};
    const after = afterById.get(materialId) ?? {};
    return {
      anonymousMaterialId: materialId,
      beforeReadiness: before.readinessStatus ?? "unknown",
      afterReadiness: after.readinessStatus ?? "unknown",
      beforeMissingCoreFields: before.missingCoreFields ?? [],
      afterMissingCoreFields: after.missingCoreFields ?? [],
      completionApplied: after.completionApplied === true,
      forecastGeneratedAfterCompletion: after.forecastSummary?.forecastStatus === "generated",
      ratingGeneratedAfterCompletion: after.candidateRatingGenerated === true,
      workflowCompletedAfterCompletion: ["fixture_evaluation_completed", "backtest_anchor_candidate", "backtest_anchor_locked_fixture"].includes(
        after.workflowState?.currentState
      ),
      backtestAnchorAfterCompletion: after.backtestAnchorStatus ?? "not_created"
    };
  });

  return {
    version: "m3-dry-run-review-prototype-v0.1",
    mode,
    fixtureOnly: true,
    nonFormal: true,
    notForFormalDecision: true,
    overview: {
      materialCount: materialIds.length,
      parseStatusDistribution: countBy(beforeResults, "parseStatus"),
      beforeReadinessDistribution: countBy(beforeResults, "readinessStatus"),
      afterReadinessDistribution: countBy(afterResults, "readinessStatus"),
      completionNeededCount: beforeResults.filter((item) => (item.missingCoreFields ?? []).length > 0).length,
      completionAppliedCount: afterResults.filter((item) => item.completionApplied === true).length,
      forecastGeneratedCount: afterResults.filter((item) => item.forecastSummary?.forecastStatus === "generated").length,
      ratingGeneratedCount: afterResults.filter((item) => item.candidateRatingGenerated === true).length,
      workflowCompletedCount: afterResults.filter((item) =>
        ["fixture_evaluation_completed", "backtest_anchor_candidate", "backtest_anchor_locked_fixture"].includes(
          item.workflowState?.currentState
        )
      ).length,
      backtestAnchorCount: afterResults.filter((item) => ["candidate", "locked_fixture", "eligible_anchor_candidate"].includes(item.backtestAnchorStatus)).length
    },
    beforeAfterComparison,
    humanAcceptanceChecklist: buildHumanAcceptanceChecklist(),
    guardrails: {
      rawMaterialStored: false,
      rawTextPersisted: false,
      realTitlePrinted: false,
      realAuthorPrinted: false,
      databaseConnected: false,
      migrationExecuted: false,
      ocrCalled: false,
      realSearchCalled: false,
      chatGptWebCalled: false,
      chromePluginCalled: false,
      browserAutomationCalled: false,
      developmentRecommendationEmitted: false,
      resourceLevelEmitted: false,
      forecastRangeEmitted: false,
      formalExecution: false
    }
  };
}

function buildHumanAcceptanceChecklist() {
  return [
    "field_extraction_accuracy",
    "completed_fields_sufficient",
    "research_questions_useful",
    "comparables_reasonable",
    "channel_forecast_understandable",
    "rating_explanation_useful",
    "workflow_clear",
    "backtest_anchor_complete",
    "no_development_recommendation",
    "no_resource_investment_level"
  ].map((item) => ({
    item,
    reviewStatus: "pending_human_review",
    fixtureOnly: true
  }));
}

function countBy(values, key) {
  return values.reduce((counts, value) => {
    const group = value?.[key] ?? "unknown";
    counts[group] = (counts[group] ?? 0) + 1;
    return counts;
  }, {});
}
