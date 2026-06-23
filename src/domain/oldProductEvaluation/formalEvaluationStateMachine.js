export const M2_FORMAL_EVALUATION_STATES = Object.freeze([
  "candidate_b_raw",
  "evaluation_baseline_ready",
  "evaluation_baseline_validated",
  "formal_ready",
  "release_ready"
]);

export const M2_FORMAL_EVALUATION_GATES = Object.freeze({
  export: "export",
  mappingActivation: "mapping_activation",
  m3: "m3"
});

const BASE_PRD_SCORE = 35;

export function evaluateM2FormalEvaluationState(input = {}) {
  const evidence = normalizeEvidence(input);
  const stages = {
    candidate_b_raw: evaluateCandidateRaw(evidence),
    evaluation_baseline_ready: null,
    evaluation_baseline_validated: null,
    formal_ready: null,
    release_ready: null
  };

  stages.evaluation_baseline_ready = evaluateBaselineReady(evidence, stages.candidate_b_raw.passed);
  stages.evaluation_baseline_validated = evaluateBaselineValidated(
    evidence,
    stages.evaluation_baseline_ready.passed
  );
  stages.formal_ready = evaluateFormalReady(evidence, stages.evaluation_baseline_validated.passed);
  stages.release_ready = evaluateReleaseReady(evidence, stages.formal_ready.passed);

  const currentState = highestPassedState(stages);
  const gates = buildGates(stages);
  const riskFlags = buildRiskFlags(evidence, stages);

  return {
    schema: "m2.formal_evaluation_state_machine.v0.1",
    stateModel: M2_FORMAL_EVALUATION_STATES,
    currentState,
    stages,
    gates,
    riskFlags,
    prdScoreBefore: evidence.prdScoreBefore,
    prdScoreAfterStateMachineIntegration: scoreAfterIntegration(stages, riskFlags),
    m3Blocked: gates.m3.status === "BLOCKED"
  };
}

function normalizeEvidence(input) {
  const reviewBlockingRemaining = nonNegativeNumber(input.reviewBlockingRemaining);
  const reviewPendingBlocking = nonNegativeNumber(input.reviewPendingBlocking);
  const advisoryPending = nonNegativeNumber(input.advisoryPending);
  const totalBlockingReviewItems = nonNegativeNumber(input.totalBlockingReviewItems);

  return {
    candidateVersion: stringOrNull(input.candidateVersion),
    expectedCandidateVersion: stringOrNull(input.expectedCandidateVersion),
    candidateGenerated: Boolean(input.candidateGenerated),
    dbBackedImportComplete: Boolean(input.dbBackedImportComplete),
    importReconciliationPassed: Boolean(input.importReconciliationPassed),
    lifecycleRatingRuntimeAvailable: Boolean(input.lifecycleRatingRuntimeAvailable),
    forecastRuntimeAvailable: Boolean(input.forecastRuntimeAvailable),
    forecastValidationPassed: Boolean(input.forecastValidationPassed),
    reviewBlockingRemaining,
    reviewPendingBlocking,
    totalBlockingReviewItems,
    advisoryPending,
    reviewClosureBusinessComplete: Boolean(input.reviewClosureBusinessComplete),
    finalDecisionsApplied: Boolean(input.finalDecisionsApplied),
    dbBackedExportAvailable: Boolean(input.dbBackedExportAvailable),
    formalEvaluationAllowed: Boolean(input.formalEvaluationAllowed),
    mappingActivationPrepared: Boolean(input.mappingActivationPrepared),
    mappingActivationExecuted: Boolean(input.mappingActivationExecuted),
    switchMappingVersionCalled: Boolean(input.switchMappingVersionCalled),
    mappingVersionActive: Boolean(input.mappingVersionActive),
    mappingVersionValidated: Boolean(input.mappingVersionValidated),
    algorithmVersionFrozen: Boolean(input.algorithmVersionFrozen),
    algorithmVersionFormal: Boolean(input.algorithmVersionFormal),
    notFinalReleaseApproved: input.notFinalReleaseApproved !== false,
    prdScoreBefore: Number.isFinite(Number(input.prdScoreBefore))
      ? Number(input.prdScoreBefore)
      : BASE_PRD_SCORE
  };
}

function evaluateCandidateRaw(evidence) {
  const checks = {
    candidateGenerated: evidence.candidateGenerated,
    candidateVersionMatches:
      !evidence.expectedCandidateVersion ||
      evidence.candidateVersion === evidence.expectedCandidateVersion
  };
  return stage("candidate_b_raw", checks);
}

function evaluateBaselineReady(evidence, previousPassed) {
  const checks = {
    previousStatePassed: previousPassed,
    dbBackedImportComplete: evidence.dbBackedImportComplete,
    importReconciliationPassed: evidence.importReconciliationPassed,
    lifecycleRatingRuntimeAvailable: evidence.lifecycleRatingRuntimeAvailable,
    algorithmVersionFrozen: evidence.algorithmVersionFrozen
  };
  return stage("evaluation_baseline_ready", checks);
}

function evaluateBaselineValidated(evidence, previousPassed) {
  const checks = {
    previousStatePassed: previousPassed,
    forecastRuntimeAvailable: evidence.forecastRuntimeAvailable,
    forecastValidationPassed: evidence.forecastValidationPassed,
    noPendingBlockingReviews: evidence.reviewPendingBlocking === 0,
    noRemainingBlockingReviews: evidence.reviewBlockingRemaining === 0,
    businessDecisionClosureComplete: evidence.reviewClosureBusinessComplete
  };
  return stage("evaluation_baseline_validated", checks);
}

function evaluateFormalReady(evidence, previousPassed) {
  const checks = {
    previousStatePassed: previousPassed,
    dbBackedExportAvailable: evidence.dbBackedExportAvailable,
    formalEvaluationAllowed: evidence.formalEvaluationAllowed,
    notFinalReleaseApprovedCleared: evidence.notFinalReleaseApproved === false
  };
  return stage("formal_ready", checks);
}

function evaluateReleaseReady(evidence, previousPassed) {
  const destructiveActivationComplete =
    evidence.mappingActivationExecuted &&
    evidence.switchMappingVersionCalled &&
    evidence.mappingVersionActive;
  const localActivationPrepared =
    evidence.mappingActivationPrepared && evidence.mappingVersionValidated;
  const checks = {
    previousStatePassed: previousPassed,
    mappingActivationReady: destructiveActivationComplete || localActivationPrepared,
    algorithmVersionFormal: evidence.algorithmVersionFormal
  };
  return stage("release_ready", checks);
}

function stage(name, checks) {
  const failedChecks = Object.entries(checks)
    .filter(([, passed]) => passed !== true)
    .map(([key]) => key);
  return {
    name,
    passed: failedChecks.length === 0,
    checks,
    failedChecks
  };
}

function highestPassedState(stages) {
  let current = "candidate_b_raw";
  for (const stateName of M2_FORMAL_EVALUATION_STATES) {
    if (stages[stateName]?.passed === true) {
      current = stateName;
    }
  }
  return current;
}

function buildGates(stages) {
  return {
    export: gate(
      "export",
      stages.evaluation_baseline_validated.passed,
      "evaluation_baseline_validated_required"
    ),
    mappingActivation: gate("mapping_activation", stages.formal_ready.passed, "formal_ready_required"),
    m3: gate("m3", stages.release_ready.passed, "release_ready_required")
  };
}

function gate(name, passed, blockedReason) {
  return {
    name,
    status: passed ? "OPEN" : "BLOCKED",
    blockedReason: passed ? null : blockedReason
  };
}

function buildRiskFlags(evidence, stages) {
  const reviewClosedByStatus =
    evidence.totalBlockingReviewItems > 0 &&
    evidence.reviewBlockingRemaining === 0 &&
    evidence.reviewPendingBlocking === 0;
  return {
    softClosure:
      reviewClosedByStatus &&
      (evidence.formalEvaluationAllowed !== true || stages.release_ready.passed !== true),
    fakeClosure:
      reviewClosedByStatus &&
      (evidence.reviewClosureBusinessComplete !== true || evidence.finalDecisionsApplied !== true),
    missingBusinessExecutionLayer:
      evidence.reviewClosureBusinessComplete !== true ||
      evidence.dbBackedExportAvailable !== true ||
      (evidence.mappingActivationExecuted !== true && evidence.mappingActivationPrepared !== true),
    exportBlockedByStateMachine: stages.evaluation_baseline_validated.passed !== true,
    mappingActivationBlockedByStateMachine: stages.formal_ready.passed !== true,
    m3BlockedByStateMachine: stages.release_ready.passed !== true
  };
}

function scoreAfterIntegration(stages, riskFlags) {
  let score = BASE_PRD_SCORE + 10;
  if (stages.evaluation_baseline_ready.passed) {
    score += 10;
  }
  if (stages.evaluation_baseline_validated.passed) {
    score += 10;
  }
  if (stages.formal_ready.passed) {
    score += 15;
  }
  if (stages.release_ready.passed) {
    score += 20;
  }
  if (riskFlags.fakeClosure) {
    score -= 10;
  }
  return Math.max(0, Math.min(100, score));
}

function nonNegativeNumber(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function stringOrNull(value) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}
