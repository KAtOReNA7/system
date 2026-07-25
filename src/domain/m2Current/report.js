import { evaluateM2CurrentDiagnosticGate } from "./gate.js";
import { buildM2CurrentContract } from "./contract.js";

export function buildM2CurrentPublicDiagnosticReport(
  evidence,
  candidate,
  config
) {
  const contract = buildM2CurrentContract(config);
  const gate = evaluateM2CurrentDiagnosticGate(evidence, candidate, config);
  const compact = [
    "m2.current.config.v0.4",
    "m2.current.config.v0.5",
    "m2.current.config.v0.6"
  ].includes(config.schema);
  return {
    schema: config.schema === "m2.current.config.v0.6"
      ? "m2.current.public_diagnostic_report.v0.7"
      : config.schema === "m2.current.config.v0.5"
      ? "m2.current.public_diagnostic_report.v0.6"
      : config.schema === "m2.current.config.v0.4"
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
      engineeringSequenceDrifted:
        [
          "m2.current.config.v0.5",
          "m2.current.config.v0.6"
        ].includes(config.schema),
      priorInstructionAssessment:
        config.schema === "m2.current.config.v0.6"
          ? "buyout_isolation_was_directionally_correct_but_current_labels_were_already_equivalent_so_accuracy_did_not_change"
          : config.schema === "m2.current.config.v0.5"
          ? "directionally_correct_evaluation_but_over_specified_algorithm_families_before_signal_and_decision_grain"
          : "not_reassessed",
      retiredSequence:
        "human_numeric_baseline_and_120_work_business_sample_skipped",
      nextPriority: config.schema === "m2.current.config.v0.6"
        ? evidence.coverage.targetClassification?.passed === true
          ? "materialize_versioned_historical_as_of_work_signals"
          : "resolve_tiny_target_classification_uncertainty_then_materialize_versioned_historical_as_of_work_signals"
        : config.schema === "m2.current.config.v0.5"
        ? "independent_portfolio_validation_then_auditable_work_level_signals"
        : config.schema === "m2.current.config.v0.4"
          ? "auditable_as_of_signals_and_absolute_quality_before_holdout"
        : "business_cash_observability_and_separately_authorized_holdout"
    },
    evaluationPolicy: contract.evaluationPolicy,
    evidence: compact ? compactEvidence(evidence) : evidence,
    candidate: compact ? compactCandidate(candidate) : candidate,
    gate,
    nextDiagnostics: [
      "keep_dense_monthly_rolling_origin_and_strong_baselines_as_mandatory_regression_checks",
      config.schema === "m2.current.config.v0.6"
        ? evidence.coverage.targetClassification?.passed === true
          ? "preserve_digest_bound_user_confirmation_without_generalizing_to_other_cash_cells"
          : "resolve_sales_share_target_classification_uncertainty_without_moving_the_frozen_population"
        : "improve_cash_observability_without_moving_the_frozen_model_population",
      "keep_occurrence_and_positive_amount_diagnostics_separate",
      config.schema === "m2.current.config.v0.6"
        ? "materialize_contract_conforming_historical_availability_snapshots_without_current_state_backfill"
        : "keep_historical_signal_availability_auditable",
      config.schema === "m2.current.config.v0.6"
        ? "use_digest_bound_portable_signal_intake_and_publish_only_aggregate_gap_diagnostics"
        : "keep_signal_intake_private_independent",
      "keep_all_buyout_cash_outside_training_backtest_and_forecast_output",
      "report_sales_share_target_completeness_and_company_cash_economic_scope_separately",
      "report_work_portfolio_origin_and_origin_horizon_resolution_separately",
      "require_dense_monthly_results_to_confirm_sparse_authority_results",
      "treat_portfolio_development_pass_as_distinct_from_full_M2_maturity",
      "keep_commitments_in_the_non_model_billing_audit_layer",
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
          automated.authoritativeFrozenEvaluation.comparisonToB4,
        multiResolution:
          automated.authoritativeFrozenEvaluation.multiResolution,
        cashAndErrorConcentration:
          automated.authoritativeFrozenEvaluation.cashAndErrorConcentration,
        interpretation:
          automated.authoritativeFrozenEvaluation.interpretation
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
            .rollingBaselineChampion.overall,
        existingChampionMultiResolution:
          automated.denseMonthlyDevelopmentDiagnostic
            .existingChampionMultiResolution,
        portfolioReconstruction:
          automated.denseMonthlyDevelopmentDiagnostic
            .portfolioReconstruction
      },
      automation: {
        decision: automated.automation.decision,
        gates: automated.automation.gates,
        automationAuthorized: automated.automation.automationAuthorized,
        releaseAuthorized: automated.automation.releaseAuthorized
      },
      retiredHumanPredictionSample:
        automated.retiredHumanPredictionSample,
      maturityAssessment: automated.maturityAssessment,
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
    probabilistic: candidate.probabilistic
      ? {
        overall: candidate.probabilistic.overall,
        bySegment: candidate.probabilistic.bySegment
      }
      : null,
    hierarchy: candidate.hierarchy,
    denseMonthlyDiagnostic: candidate.denseMonthlyDiagnostic,
    multiResolution: candidate.multiResolution,
    maturityAssessment: candidate.maturityAssessment,
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
