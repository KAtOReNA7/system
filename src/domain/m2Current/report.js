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
    schema: config.publicDiagnosticSchema
      ?? (config.schema === "m2.current.config.v0.6"
      ? "m2.current.public_diagnostic_report.v0.12"
      : config.schema === "m2.current.config.v0.5"
      ? "m2.current.public_diagnostic_report.v0.6"
      : config.schema === "m2.current.config.v0.4"
        ? "m2.current.public_diagnostic_report.v0.5"
      : config.schema === "m2.current.config.v0.3"
        ? "m2.current.public_diagnostic_report.v0.4"
        : config.schema === "m2.current.config.v0.2"
          ? "m2.current.public_diagnostic_report.v0.3"
          : "m2.current.public_diagnostic_report.v0.2"),
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
          ? "buyout_isolation_canonical_channel_governance_and_human_anchored_modeling_were_directionally_correct; frozen_v1.0_and_the_one_variable_TSB_occurrence_challenger_both_failed_their_preregistered_development_gates"
          : config.schema === "m2.current.config.v0.5"
          ? "directionally_correct_evaluation_but_over_specified_algorithm_families_before_signal_and_decision_grain"
          : "not_reassessed",
      retiredSequence:
        "human_numeric_baseline_and_120_work_business_sample_skipped",
      nextPriority: config.schema === "m2.current.config.v0.6"
        ? "wait_for_2029_01_complete_labels_and_recover_the_original_frozen_v1_state_before_any_later_origin_metrics"
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
      config.schema === "m2.current.config.v0.6"
        ? "keep_v1_0_rejected_and_do_not_read_later_origin_metrics_before_2029_01_complete_labels_and_original_frozen_state"
        : "keep_channel_identity_auditable",
      config.schema === "m2.current.config.v0.6"
        ? "freeze_the_failed_learnedGlobal_plus_TSB_parameter_space_and_do_not_open_a_second_candidate_without_new_authorization"
        : "keep_failed_candidate_spaces_frozen",
      "use_humans_only_for_post_gate_quality_assurance"
    ]
  };
}

function compactEvidence(evidence) {
  const automated = evidence.automatedEvaluation;
  return {
    ...evidence,
    recalibration: evidence.recalibration
      ? {
        schema: evidence.recalibration.schema,
        candidateId: evidence.recalibration.candidateId,
        decisionStatus: evidence.recalibration.decisionStatus,
        role: evidence.recalibration.role,
        target: evidence.recalibration.target,
        scope: evidence.recalibration.scope,
        realBillReplay: {
          deterministicReplayPassed:
            evidence.recalibration.realBillReplay
              .deterministicReplayPassed,
          targetClassificationPassed:
            evidence.recalibration.realBillReplay
              .targetClassificationPassed,
          targetPartitionConservationPassed:
            evidence.recalibration.realBillReplay
              .targetPartitionConservationPassed,
          existingWorkLevel:
            evidence.recalibration.realBillReplay.existingWorkLevel,
          existingDenseMonthlyChampion: {
            overall:
              evidence.recalibration.realBillReplay
                .existingDenseMonthlyChampion.overall
          },
          existingPortfolioDevelopment:
            evidence.recalibration.realBillReplay
              .existingPortfolioDevelopment
        },
        challenger: {
          design: evidence.recalibration.challenger.design,
          overall: evidence.recalibration.challenger.overall,
          byHorizon: evidence.recalibration.challenger.byHorizon,
          bySegment: evidence.recalibration.challenger.bySegment,
          relativeWapeImprovementToDenseMonthlyChampion:
            evidence.recalibration.challenger
              .relativeWapeImprovementToDenseMonthlyChampion
        },
        gates: evidence.recalibration.gates,
        decision: evidence.recalibration.decision,
        boundaries: evidence.recalibration.boundaries
      }
      : null,
    manualChannelBacktest: evidence.manualChannelBacktest
      ? {
        schema: evidence.manualChannelBacktest.schema,
        candidateId: evidence.manualChannelBacktest.candidateId,
        target: evidence.manualChannelBacktest.target,
        role: evidence.manualChannelBacktest.role,
        status: evidence.manualChannelBacktest.status,
        scope: evidence.manualChannelBacktest.scope,
        manualRuleSpecification:
          evidence.manualChannelBacktest.manualRuleSpecification,
        dataQuality: {
          channelIdentity:
            evidence.manualChannelBacktest.dataQuality.channelIdentity,
          classifierBuyoutIsolation:
            evidence.manualChannelBacktest.dataQuality
              .classifierBuyoutIsolation,
          channelCount:
            evidence.manualChannelBacktest.dataQuality.channelCount
        },
        evaluation: {
          trailingAnnualFlat:
            evidence.manualChannelBacktest.evaluation
              .trailingAnnualFlat.overall,
          manualFaithful:
            evidence.manualChannelBacktest.evaluation.manualFaithful,
          manualAnnual80Percent:
            evidence.manualChannelBacktest.evaluation
              .manualAnnual80Percent.overall,
          manualFixed50PercentLifecycle:
            evidence.manualChannelBacktest.evaluation
              .manualFixed50PercentLifecycle.overall
        },
        diagnosticPopulation:
          evidence.manualChannelBacktest.diagnosticPopulation,
        gates: evidence.manualChannelBacktest.gates,
        decision: evidence.manualChannelBacktest.decision,
        boundaries: evidence.manualChannelBacktest.boundaries
      }
      : null,
    canonicalChannelDevelopment: evidence.canonicalChannelDevelopment
      ? {
        schema: evidence.canonicalChannelDevelopment.schema,
        candidateId: evidence.canonicalChannelDevelopment.candidateId,
        target: evidence.canonicalChannelDevelopment.target,
        status: evidence.canonicalChannelDevelopment.status,
        dataQuality: evidence.canonicalChannelDevelopment.dataQuality,
        featureBoundary:
          evidence.canonicalChannelDevelopment.featureBoundary,
        model: evidence.canonicalChannelDevelopment.model,
        dense25OriginDiagnostic:
          evidence.canonicalChannelDevelopment.dense25OriginDiagnostic,
        frozenCurrentServedDiagnostic:
          evidence.canonicalChannelDevelopment
            .frozenCurrentServedDiagnostic,
        gates: evidence.canonicalChannelDevelopment.gates,
        decision: evidence.canonicalChannelDevelopment.decision,
        boundaries: evidence.canonicalChannelDevelopment.boundaries
      }
      : null,
    humanAnchoredDevelopment: evidence.humanAnchoredDevelopment
      ? {
        schema: evidence.humanAnchoredDevelopment.schema,
        candidateId: evidence.humanAnchoredDevelopment.candidateId,
        target: evidence.humanAnchoredDevelopment.target,
        decision: evidence.humanAnchoredDevelopment.decision,
        population: evidence.humanAnchoredDevelopment.population,
        dataQuality: evidence.humanAnchoredDevelopment.dataQuality,
        modelContract: evidence.humanAnchoredDevelopment.modelContract,
        primary: {
          design: evidence.humanAnchoredDevelopment.primary.design,
          caveat: evidence.humanAnchoredDevelopment.primary.caveat,
          point: evidence.humanAnchoredDevelopment.primary.metrics.point,
          fva: evidence.humanAnchoredDevelopment.primary.metrics.fva,
          probabilistic:
            evidence.humanAnchoredDevelopment.primary.metrics.probabilistic,
          developmentLayerSelection:
            evidence.humanAnchoredDevelopment.primary
              .developmentLayerSelection,
          bySegment:
            evidence.humanAnchoredDevelopment.primary.metrics.bySegment,
          byRevenueMode:
            evidence.humanAnchoredDevelopment.primary.metrics.byRevenueMode,
          relativeWapeToManual:
            evidence.humanAnchoredDevelopment.primary.relativeWapeToManual,
          bootstrap: evidence.humanAnchoredDevelopment.primary.bootstrap
        },
        strictAuxiliary: {
          design: evidence.humanAnchoredDevelopment.strictAuxiliary.design,
          point:
            evidence.humanAnchoredDevelopment.strictAuxiliary.metrics.point,
          fva:
            evidence.humanAnchoredDevelopment.strictAuxiliary.metrics.fva,
          byHorizon:
            evidence.humanAnchoredDevelopment.strictAuxiliary.metrics.byHorizon
        },
        v03ExactOverlap: {
          design: evidence.humanAnchoredDevelopment.v03ExactOverlap.design,
          caseCount: evidence.humanAnchoredDevelopment.v03ExactOverlap.caseCount,
          newModel: evidence.humanAnchoredDevelopment.v03ExactOverlap.newModel,
          v03: evidence.humanAnchoredDevelopment.v03ExactOverlap.v03,
          relativeWapeToV03:
            evidence.humanAnchoredDevelopment.v03ExactOverlap
              .relativeWapeToV03
        },
        temporalMaturity:
          evidence.humanAnchoredDevelopment.temporalMaturity,
        boundaries: evidence.humanAnchoredDevelopment.boundaries
      }
      : null,
    humanAnchoredTsbOccurrence:
      evidence.humanAnchoredTsbOccurrence
        ? {
          schema: evidence.humanAnchoredTsbOccurrence.schema,
          candidateId:
            evidence.humanAnchoredTsbOccurrence.candidateId,
          target: evidence.humanAnchoredTsbOccurrence.target,
          role: evidence.humanAnchoredTsbOccurrence.role,
          decision: evidence.humanAnchoredTsbOccurrence.decision,
          developmentAccepted:
            evidence.humanAnchoredTsbOccurrence.developmentAccepted,
          population: evidence.humanAnchoredTsbOccurrence.population,
          dataQuality: evidence.humanAnchoredTsbOccurrence.dataQuality,
          modelContract:
            evidence.humanAnchoredTsbOccurrence.modelContract,
          primary: {
            design:
              evidence.humanAnchoredTsbOccurrence.primary.design,
            parameterSelectionDistribution:
              evidence.humanAnchoredTsbOccurrence.primary
                .parameterSelectionDistribution,
            preFallbackMetrics:
              evidence.humanAnchoredTsbOccurrence.primary
                .preFallbackMetrics,
            selectedPipelineMetrics:
              evidence.humanAnchoredTsbOccurrence.primary
                .selectedPipelineMetrics,
            bootstrap:
              evidence.humanAnchoredTsbOccurrence.primary.bootstrap
          },
          strictAuxiliary: {
            design:
              evidence.humanAnchoredTsbOccurrence.strictAuxiliary
                .design,
            preFallbackMetrics:
              evidence.humanAnchoredTsbOccurrence.strictAuxiliary
                .preFallbackMetrics,
            selectedPipelineMetrics:
              evidence.humanAnchoredTsbOccurrence.strictAuxiliary
                .selectedPipelineMetrics,
            timeBlockAudit:
              evidence.humanAnchoredTsbOccurrence.strictAuxiliary
                .timeBlockAudit
          },
          exactV03Overlap:
            evidence.humanAnchoredTsbOccurrence.exactV03Overlap,
          gates: evidence.humanAnchoredTsbOccurrence.gates,
          fvaSemantics:
            evidence.humanAnchoredTsbOccurrence.fvaSemantics,
          failureAttribution:
            evidence.humanAnchoredTsbOccurrence.failureAttribution,
          privateCapability:
            evidence.humanAnchoredTsbOccurrence.privateCapability,
          boundaries: evidence.humanAnchoredTsbOccurrence.boundaries
        }
        : null,
    humanAnchoredLaterOriginReadiness:
      evidence.humanAnchoredLaterOriginReadiness
        ? evidence.humanAnchoredLaterOriginReadiness
        : null,
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
