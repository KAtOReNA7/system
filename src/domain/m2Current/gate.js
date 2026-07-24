import { buildM2CurrentContract } from "./contract.js";

export function evaluateM2CurrentDiagnosticGate(
  evidence,
  candidate = null,
  config
) {
  const contract = buildM2CurrentContract(config);
  const blockers = [];
  const observability = evidence.coverage.cashObservability;
  if (observability.fullLibrary < observability.fullLibraryRequired) {
    blockers.push("full_library_cash_observability_below_threshold");
  }
  if (observability.top10 < observability.top10Required) {
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
  if (evidence.businessCoverageDecision !== "PASS") {
    blockers.push("business_coverage_not_passed");
  }
  if (!candidate) {
    blockers.push("current_candidate_not_evaluated");
  } else {
    const comparison = candidate.comparison;
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
    if (
      contract.thresholds.pairedCiRequired
      && !pairedCiPasses(candidate.pairedCi, contract)
    ) {
      blockers.push("paired_confidence_interval_failed");
    }
    if (candidate.acceptance?.dormantSegmentImproved !== true) {
      blockers.push("candidate_dormant_segment_not_improved");
    }
  }
  blockers.push("final_holdout_sealed");
  blockers.push("business_sampling_and_approval_missing");
  const candidateOverallGatesPassed = candidate !== null && !blockers.some(
    (blocker) => (
      (
        blocker.startsWith("candidate_")
        && blocker !== "candidate_dormant_segment_not_improved"
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
    status: candidateDevelopmentQualityPassed
      ? "CANDIDATE_DEVELOPMENT_PASS_BLOCKED"
      : candidateOverallGatesPassed
        ? "CANDIDATE_DEVELOPMENT_PARTIAL_BLOCKED"
      : candidate
        ? "CANDIDATE_DEVELOPMENT_FAIL_BLOCKED"
        : "BASELINE_ONLY_BLOCKED",
    blockers: [...new Set(blockers)],
    developmentDirection:
      "candidate_business_sampling_then_separate_cash_observability_resolution",
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
