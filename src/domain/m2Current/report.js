import { evaluateM2CurrentDiagnosticGate } from "./gate.js";
import { buildM2CurrentContract } from "./contract.js";

export function buildM2CurrentPublicDiagnosticReport(
  evidence,
  candidate,
  config
) {
  const contract = buildM2CurrentContract(config);
  const gate = evaluateM2CurrentDiagnosticGate(evidence, candidate, config);
  const compact = config.schema === "m2.current.config.v0.4";
  return {
    schema: config.schema === "m2.current.config.v0.4"
      ? "m2.current.public_diagnostic_report.v0.5"
      : config.schema === "m2.current.config.v0.3"
        ? "m2.current.public_diagnostic_report.v0.4"
        : config.schema === "m2.current.config.v0.2"
          ? "m2.current.public_diagnostic_report.v0.3"
          : "m2.current.public_diagnostic_report.v0.2",
    decisionStatus: "not_for_formal_decision",
    directionAssessment: {
      businessProblemWrong: false,
      governanceWrong: false,
      engineeringSequenceDrifted: false,
      retiredSequence:
        "human_numeric_baseline_and_120_work_business_sample_skipped",
      nextPriority: config.schema === "m2.current.config.v0.4"
        ? "auditable_as_of_signals_and_absolute_quality_before_holdout"
        : "business_cash_observability_and_separately_authorized_holdout"
    },
    evaluationPolicy: contract.evaluationPolicy,
    evidence: compact ? compactEvidence(evidence) : evidence,
    candidate: compact ? compactCandidate(candidate) : candidate,
    gate,
    nextDiagnostics: [
      "keep_dense_monthly_rolling_origin_and_strong_baselines_as_mandatory_regression_checks",
      "improve_cash_observability_without_moving_the_frozen_model_population",
      "keep_occurrence_and_positive_amount_diagnostics_separate",
      "accept_only_real_auditable_commitment_snapshots",
      "do_not_promote_global_or_distributional_families_that_fail_nested_gates",
      "use_risk_coverage_business_loss_and_FVA_before_any_automation_claim",
      "keep_final_holdout_sealed_until_separate_authorization",
      "use_humans_only_for_post_gate_quality_assurance"
    ]
  };
}

function compactEvidence(evidence) {
  const automated = evidence.automatedEvaluation;
  return {
    ...evidence,
    automatedEvaluation: {
      schema: automated.schema,
      targetContract: automated.targetContract,
      authoritativeFrozenEvaluation: {
        caseCount: automated.authoritativeFrozenEvaluation.caseCount,
        workCount: automated.authoritativeFrozenEvaluation.workCount,
        originCount: automated.authoritativeFrozenEvaluation.originCount,
        originCadence:
          automated.authoritativeFrozenEvaluation.originCadence,
        finalHoldoutOpened:
          automated.authoritativeFrozenEvaluation.finalHoldoutOpened,
        comparisonToPrevious:
          automated.authoritativeFrozenEvaluation.comparisonToPrevious,
        comparisonToB4:
          automated.authoritativeFrozenEvaluation.comparisonToB4
      },
      denseMonthlyDevelopmentDiagnostic: {
        role: automated.denseMonthlyDevelopmentDiagnostic.role,
        decisionPopulationMoved:
          automated.denseMonthlyDevelopmentDiagnostic.decisionPopulationMoved,
        workCount:
          automated.denseMonthlyDevelopmentDiagnostic.workCount,
        originCount:
          automated.denseMonthlyDevelopmentDiagnostic.originCount,
        materializedCaseCount:
          automated.denseMonthlyDevelopmentDiagnostic.materializedCaseCount,
        labelStatusCounts:
          automated.denseMonthlyDevelopmentDiagnostic.labelStatusCounts,
        abstention:
          automated.denseMonthlyDevelopmentDiagnostic.abstention,
        rollingBaselineChampion:
          automated.denseMonthlyDevelopmentDiagnostic
            .rollingBaselineChampion.overall
      },
      automation: {
        decision: automated.automation.decision,
        gates: automated.automation.gates,
        automationAuthorized: automated.automation.automationAuthorized,
        releaseAuthorized: automated.automation.releaseAuthorized
      },
      retiredHumanPredictionSample:
        automated.retiredHumanPredictionSample,
      boundaries: automated.boundaries
    }
  };
}

function compactCandidate(candidate) {
  return {
    schema: candidate.schema,
    candidateId: candidate.candidateId,
    decisionStatus: candidate.decisionStatus,
    status: candidate.status,
    scope: candidate.scope,
    pointComparisonToPrevious: candidate.pointComparisonToPrevious,
    pointComparisonToB4: candidate.pointComparisonToB4,
    byHorizon: candidate.byHorizon,
    bySegment: candidate.bySegment,
    probabilistic: {
      overall: candidate.probabilistic.overall,
      bySegment: candidate.probabilistic.bySegment
    },
    hierarchy: candidate.hierarchy,
    denseMonthlyDiagnostic: candidate.denseMonthlyDiagnostic,
    automation: {
      decision: candidate.automation.decision,
      gates: candidate.automation.gates,
      automationAuthorized: candidate.automation.automationAuthorized,
      releaseAuthorized: candidate.automation.releaseAuthorized
    },
    acceptance: candidate.acceptance,
    developmentAuthorization: candidate.developmentAuthorization,
    humanEvaluation: candidate.humanEvaluation,
    privacy: candidate.privacy
  };
}
