import { buildM2CurrentContract } from "./contract.js";

export function evaluateM2CurrentDiagnosticGate(
  evidence,
  candidate = null,
  config
) {
  const contract = buildM2CurrentContract(config);
  const blockers = [];
  const observability = evidence.coverage.cashObservability;
  if (
    observability.fullLibraryRequired !== null
    && observability.fullLibrary < observability.fullLibraryRequired
  ) {
    blockers.push("full_library_cash_observability_below_threshold");
  }
  if (
    observability.top10Required !== null
    && observability.top10 < observability.top10Required
  ) {
    blockers.push("top10_cash_observability_below_threshold");
  }
  if (evidence.coverage.modelEligibility.reasonLedgerStatus !== "AVAILABLE") {
    blockers.push("model_eligibility_reason_ledger_missing");
  }
  if (evidence.coverage.served.status !== "MEASURED") {
    blockers.push("served_model_coverage_not_measured");
  }
  if (!candidate && evidence.modelQualityDecision !== "PASS") {
    blockers.push("latest_model_quality_failed");
  }
  if (
    contract.schema !== "m2.current.config.v0.6"
    && evidence.businessCoverageDecision !== "PASS"
  ) {
    blockers.push("business_coverage_not_passed");
  }
  if (
    contract.schema === "m2.current.config.v0.6"
    && evidence.coverage.targetClassification?.passed !== true
  ) {
    blockers.push("sales_share_target_classification_uncertainty_unresolved");
  }
  if (
    contract.schema === "m2.current.config.v0.6"
    && evidence.coverage.workLevelSignals?.readiness?.status
      !== "AS_OF_SIGNAL_COVERAGE_COMPLETE"
  ) {
    blockers.push("auditable_work_level_signal_coverage_incomplete");
  }
  if (!candidate) {
    blockers.push("current_candidate_not_evaluated");
  } else {
    const comparison = [
      "m2.current.config.v0.4",
      "m2.current.config.v0.5",
      "m2.current.config.v0.6"
    ].includes(contract.schema)
      ? candidate.pointComparisonToPrevious?.comparison
      : candidate.comparison;
    if (
      comparison?.caseKeyParity !== true
      || comparison?.actualParity !== true
    ) {
      blockers.push("candidate_comparator_parity_failed");
    }
    if (
      !comparison?.candidate
      || Math.abs(comparison.candidate.signedBias)
        > contract.thresholds.overallAbsoluteBiasMaximum
    ) {
      blockers.push("candidate_overall_bias_failed");
    }
    if (
      contract.thresholds.developmentWapeMaximum !== null
      && (
        !comparison?.candidate
        || comparison.candidate.wape
          > contract.thresholds.developmentWapeMaximum
      )
    ) {
      blockers.push("candidate_absolute_wape_above_development_threshold");
    }
    const horizonMetrics = candidate.byHorizon;
    if (!horizonMetrics) {
      blockers.push("candidate_horizon_metrics_missing");
    } else {
      for (const horizon of contract.allowedHorizonValues) {
        const metrics = horizonMetrics[horizon]?.candidate
          ?? horizonMetrics[horizon];
        if (
          !metrics
          || Math.abs(metrics.signedBias)
            > contract.thresholds.eachHorizonAbsoluteBiasMaximum
        ) {
          blockers.push(`candidate_horizon_${horizon}_bias_failed`);
        }
      }
    }
    if (contract.thresholds.eachSegmentWapeMaximum !== null) {
      const segmentMetrics = candidate.bySegment;
      if (!segmentMetrics) {
        blockers.push("candidate_segment_metrics_missing");
      } else {
        for (const segment of contract.activitySegmentValues) {
          const metrics = segmentMetrics[segment]?.candidate
            ?? segmentMetrics[segment];
          if (
            !metrics
            || metrics.wape > contract.thresholds.eachSegmentWapeMaximum
          ) {
            blockers.push(`candidate_segment_${segment}_wape_failed`);
          }
          if (
            !metrics
            || Math.abs(metrics.signedBias)
              > contract.thresholds.eachSegmentAbsoluteBiasMaximum
          ) {
            blockers.push(`candidate_segment_${segment}_bias_failed`);
          }
        }
      }
    }
    if (
      contract.thresholds.pairedCiRequired
      && !pairedCiPasses(candidate.pairedCi, contract)
    ) {
      blockers.push("paired_confidence_interval_failed");
    }
    if (
      [
        "m2.current.config.v0.4",
        "m2.current.config.v0.5",
        "m2.current.config.v0.6"
      ].includes(contract.schema)
      && candidate.acceptance?.allCurrentDevelopmentConditionsPassed !== true
    ) {
      blockers.push("candidate_r0_r5_development_conditions_failed");
    } else if (
      contract.schema === "m2.current.config.v0.3"
      && candidate.acceptance?.dormantFallbackPolicyPassed !== true
    ) {
      blockers.push("candidate_dormant_fallback_policy_failed");
    } else if (
      contract.schema !== "m2.current.config.v0.3"
      && candidate.acceptance?.dormantSegmentImproved !== true
    ) {
      blockers.push("candidate_dormant_segment_not_improved");
    }
    if (
      [
        "m2.current.config.v0.5",
        "m2.current.config.v0.6"
      ].includes(contract.schema)
      && candidate.acceptance?.portfolioDevelopmentBacktestPassed !== true
    ) {
      blockers.push("portfolio_development_backtest_failed");
    }
    if (
      [
        "m2.current.config.v0.5",
        "m2.current.config.v0.6"
      ].includes(contract.schema)
      && candidate.acceptance?.fullM2MaturityPassed !== true
    ) {
      blockers.push("full_m2_maturity_not_established");
    }
  }
  blockers.push("final_holdout_sealed");
  if (
    [
      "m2.current.config.v0.3",
      "m2.current.config.v0.4",
      "m2.current.config.v0.5",
      "m2.current.config.v0.6"
    ]
      .includes(contract.schema)
  ) {
    blockers.push("post_gate_quality_assurance_pending");
  } else {
    blockers.push("business_sampling_and_approval_missing");
  }
  const candidateOverallGatesPassed = candidate !== null && !blockers.some(
    (blocker) => (
      (
        blocker.startsWith("candidate_")
        && !(
          [
            "candidate_dormant_segment_not_improved",
            "candidate_absolute_wape_above_development_threshold"
          ].includes(blocker)
          || blocker.startsWith("candidate_segment_")
        )
      )
      || blocker === "paired_confidence_interval_failed"
    )
  );
  const candidateDevelopmentQualityPassed = candidate !== null && !blockers.some(
    (blocker) => blocker.startsWith("candidate_")
      || blocker === "paired_confidence_interval_failed"
  );

  return {
    schema: "m2.current.diagnostic_gate.v0.1",
    status: (
      [
        "m2.current.config.v0.5",
        "m2.current.config.v0.6"
      ].includes(contract.schema)
      && candidate?.acceptance?.portfolioDevelopmentBacktestPassed === true
      && !candidateDevelopmentQualityPassed
    )
      ? contract.schema === "m2.current.config.v0.6"
        ? "SALES_SHARE_TARGET_MIGRATED_PORTFOLIO_DEVELOPMENT_PASS_WORK_LEVEL_BLOCKED"
        : "PORTFOLIO_DEVELOPMENT_BACKTEST_PASS_WORK_LEVEL_BLOCKED"
      : candidateDevelopmentQualityPassed
      ? "CANDIDATE_DEVELOPMENT_PASS_BLOCKED"
      : candidateOverallGatesPassed
        ? "CANDIDATE_DEVELOPMENT_PARTIAL_BLOCKED"
      : candidate
        ? "CANDIDATE_DEVELOPMENT_FAIL_BLOCKED"
        : "BASELINE_ONLY_BLOCKED",
    blockers: [...new Set(blockers)],
    developmentDirection: contract.schema === "m2.current.config.v0.6"
      ? "sales_share_target_classification_then_auditable_work_level_signals_and_independent_validation"
      : contract.schema === "m2.current.config.v0.5"
      ? "independent_portfolio_validation_and_auditable_work_level_signals"
      : contract.schema === "m2.current.config.v0.4"
        ? "auditable_as_of_signal_and_cash_observability_before_new_model_work"
      : contract.schema === "m2.current.config.v0.3"
        ? "business_cash_observability_then_authorized_sealed_holdout"
      : "candidate_business_sampling_then_separate_cash_observability_resolution",
    candidateOverallGatesPassed,
    candidateDevelopmentQualityPassed,
    candidateSelectionAuthorized: contract.authorizations.modelTraining,
    modelTrainingAuthorized: contract.authorizations.modelTraining,
    holdoutAuthorized: contract.authorizations.holdout,
    releaseAuthorized: contract.authorizations.release,
    m3FormalAuthorized: contract.authorizations.m3Formal
  };
}

function pairedCiPasses(pairedCi, contract) {
  return (
    pairedCi?.schema === "m2.current.paired_bootstrap.v0.1"
    && pairedCi.method === contract.pairedBootstrap.method
    && pairedCi.confidence === contract.pairedBootstrap.confidence
    && pairedCi.iterations >= contract.pairedBootstrap.iterations
    && Number.isFinite(pairedCi.lower95)
    && Number.isFinite(pairedCi.upper95)
    && pairedCi.lower95 <= pairedCi.upper95
    && pairedCi.upper95
      < contract.thresholds.pairedRelativeWapeUpperMaximum
  );
}
