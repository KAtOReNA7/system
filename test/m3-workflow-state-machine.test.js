import assert from "node:assert/strict";
import test from "node:test";
import { evaluateNewProductMaterial } from "../src/domain/newProductEvaluation/newProductEvaluationEngine.js";
import { M3_NEW_PRODUCT_MATERIAL_FIXTURES } from "../src/domain/newProductEvaluation/fixtures/newProductMaterials.fixture.js";

test("material-first workflow starts at material_received and parses material", () => {
  const result = evaluateNewProductMaterial(M3_NEW_PRODUCT_MATERIAL_FIXTURES[0]);

  assert.equal(result.workflow.completedSteps[0], "material_received");
  assert.equal(result.workflow.transitionLog[0].fromState, "material_received");
  assert.equal(result.workflow.transitionLog[0].toState, "material_parsed");
  assert.equal(result.workflow.nonFormal, true);
  assert.equal(result.workflow.fixtureOnly, true);
});

test("workflow generates research questions after material parsing", () => {
  const result = evaluateNewProductMaterial(M3_NEW_PRODUCT_MATERIAL_FIXTURES[1]);

  assert.ok(result.workflow.completedSteps.includes("research_questions_generated"));
  assert.ok(result.researchQuestions.length > 0);
  assert.ok(result.workflow.transitionLog.some((item) => item.toState === "research_questions_generated"));
});

test("workflow enters evidence_pending when no evidence is attached", () => {
  const result = evaluateNewProductMaterial(M3_NEW_PRODUCT_MATERIAL_FIXTURES[0], {
    externalEvidence: []
  });

  assert.equal(result.workflow.currentState, "evidence_pending");
  assert.ok(result.workflow.blockedReasons.includes("external_evidence_pending"));
  assert.ok(result.workflow.pendingSteps.includes("evidence_attached"));
});

test("workflow enters readiness_blocked when hard blockers remain", () => {
  const result = evaluateNewProductMaterial(M3_NEW_PRODUCT_MATERIAL_FIXTURES[2]);

  assert.equal(result.workflow.currentState, "readiness_blocked");
  assert.ok(result.workflow.blockedReasons.includes("missing_heat_signal"));
  assert.ok(result.workflow.pendingSteps.includes("ready_for_fixture_evaluation"));
});

test("workflow records warning-only readiness before completing fixture evaluation", () => {
  const result = evaluateNewProductMaterial(M3_NEW_PRODUCT_MATERIAL_FIXTURES[1]);

  assert.ok(result.workflow.completedSteps.includes("readiness_warning_only"));
  assert.ok(result.workflow.completedSteps.includes("ready_for_fixture_evaluation"));
  assert.equal(result.workflow.currentState, "backtest_anchor_candidate");
  assert.ok(result.workflow.warnings.length > 0);
});

test("ready workflow chains comparables author ranking forecast rating and anchor candidate", () => {
  const result = evaluateNewProductMaterial(M3_NEW_PRODUCT_MATERIAL_FIXTURES[0]);

  for (const step of [
    "comparables_selected",
    "author_ranking_evaluated",
    "forecast_generated",
    "rating_explained",
    "fixture_evaluation_completed",
    "backtest_anchor_candidate"
  ]) {
    assert.ok(result.workflow.completedSteps.includes(step), `${step} should be completed`);
  }
  assert.equal(result.workflow.currentState, "backtest_anchor_candidate");
  assert.ok(result.workflow.transitionLog.every((item) => item.nonFormal === true));
});
