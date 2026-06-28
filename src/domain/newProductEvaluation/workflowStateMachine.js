export const M3_WORKFLOW_STATES = Object.freeze([
  "material_received",
  "material_parsed",
  "research_questions_generated",
  "evidence_pending",
  "evidence_attached",
  "readiness_blocked",
  "readiness_warning_only",
  "ready_for_fixture_evaluation",
  "comparables_selected",
  "author_ranking_evaluated",
  "forecast_generated",
  "rating_explained",
  "fixture_evaluation_completed",
  "backtest_anchor_candidate",
  "backtest_anchor_locked_fixture"
]);

const SYNTHETIC_TIMESTAMP = "2026-06-28T00:00:00Z";

export function buildM3WorkflowTimeline({
  parsedMaterial,
  researchQuestions = [],
  externalEvidence = [],
  readiness = {},
  comparableWorks,
  authorRanking,
  forecast,
  candidateRating,
  backtestAnchorLocked = false
} = {}) {
  const completedSteps = ["material_received"];
  const transitionLog = [];
  let currentState = "material_received";

  currentState = transition(transitionLog, completedSteps, currentState, "material_parsed", "Material-first fixture fields parsed.");
  currentState = transition(
    transitionLog,
    completedSteps,
    currentState,
    "research_questions_generated",
    `${researchQuestions.length} research question(s) generated from missing or weak evidence.`
  );

  if (externalEvidence.length === 0) {
    currentState = transition(
      transitionLog,
      completedSteps,
      currentState,
      "evidence_pending",
      "No fixture external evidence is attached yet."
    );
    return workflowResult({
      currentState,
      completedSteps,
      transitionLog,
      blockedReasons: ["external_evidence_pending"],
      warnings: warningCodes(readiness),
      parsedMaterial
    });
  }

  currentState = transition(
    transitionLog,
    completedSteps,
    currentState,
    "evidence_attached",
    `${externalEvidence.length} fixture evidence record(s) attached.`
  );

  if (readiness.readinessStatus === "blocked") {
    currentState = transition(
      transitionLog,
      completedSteps,
      currentState,
      "readiness_blocked",
      "Readiness hard blockers prevent numeric fixture forecast."
    );
    return workflowResult({
      currentState,
      completedSteps,
      transitionLog,
      blockedReasons: hardBlockerCodes(readiness),
      warnings: warningCodes(readiness),
      parsedMaterial
    });
  }

  if (readiness.readinessStatus === "warning_only") {
    currentState = transition(
      transitionLog,
      completedSteps,
      currentState,
      "readiness_warning_only",
      "Readiness warnings exist, but fixture numeric evaluation may continue."
    );
  }

  currentState = transition(
    transitionLog,
    completedSteps,
    currentState,
    "ready_for_fixture_evaluation",
    "No readiness hard blocker remains for fixture evaluation."
  );

  if (comparableWorks) {
    currentState = transition(
      transitionLog,
      completedSteps,
      currentState,
      "comparables_selected",
      "System, operator and same-author comparable contexts selected."
    );
  }
  if (authorRanking) {
    currentState = transition(
      transitionLog,
      completedSteps,
      currentState,
      "author_ranking_evaluated",
      "Synthetic author ranking context evaluated."
    );
  }
  if (forecast?.forecastStatus === "generated") {
    currentState = transition(
      transitionLog,
      completedSteps,
      currentState,
      "forecast_generated",
      "Channel-level point forecast generated."
    );
  }
  if (candidateRating?.ratingType === "new_product_candidate_rating") {
    currentState = transition(
      transitionLog,
      completedSteps,
      currentState,
      "rating_explained",
      "Candidate rating explanation generated."
    );
  }

  currentState = transition(
    transitionLog,
    completedSteps,
    currentState,
    "fixture_evaluation_completed",
    "Fixture evaluation chain completed without formal execution."
  );

  currentState = transition(
    transitionLog,
    completedSteps,
    currentState,
    backtestAnchorLocked ? "backtest_anchor_locked_fixture" : "backtest_anchor_candidate",
    backtestAnchorLocked ? "Fixture backtest anchor locked in memory only." : "Fixture backtest anchor candidate prepared."
  );

  return workflowResult({
    currentState,
    completedSteps,
    transitionLog,
    blockedReasons: [],
    warnings: warningCodes(readiness),
    parsedMaterial
  });
}

function workflowResult({ currentState, completedSteps, transitionLog, blockedReasons, warnings, parsedMaterial }) {
  return {
    currentState,
    completedSteps,
    pendingSteps: M3_WORKFLOW_STATES.filter((state) => !completedSteps.includes(state)),
    blockedReasons,
    warnings,
    transitionLog,
    materialFieldCount: parsedMaterial?.extractedFields?.length ?? 0,
    nonFormal: true,
    fixtureOnly: true,
    notForFormalDecision: true
  };
}

function transition(log, completedSteps, fromState, toState, reason) {
  log.push({
    fromState,
    toState,
    reason,
    triggeredBy: "fixtureWorkflowStateMachine",
    timestampSynthetic: SYNTHETIC_TIMESTAMP,
    nonFormal: true
  });
  if (!completedSteps.includes(toState)) {
    completedSteps.push(toState);
  }
  return toState;
}

function hardBlockerCodes(readiness = {}) {
  return readiness.hardBlockerCodes ?? [];
}

function warningCodes(readiness = {}) {
  return readiness.warningCodes ?? [];
}
