export function evaluateM2CurrentDiagnosticGate(evidence, candidate = null) {
  const blockers = [];
  if (evidence.coverage.fullLibrary < evidence.coverage.required) {
    blockers.push("full_library_cash_coverage_below_90pct");
  }
  if (evidence.coverage.top10 < evidence.coverage.required) {
    blockers.push("top10_cash_coverage_below_90pct");
  }
  if (evidence.modelQualityDecision !== "PASS") {
    blockers.push("latest_model_quality_failed");
  }
  if (evidence.businessCoverageDecision !== "PASS") {
    blockers.push("business_coverage_not_passed");
  }
  if (!candidate) {
    blockers.push("current_candidate_not_evaluated");
  } else {
    if (candidate.caseKeyParity !== true || candidate.actualParity !== true) {
      blockers.push("candidate_comparator_parity_failed");
    }
    if (!candidate.pairedCi) {
      blockers.push("paired_confidence_interval_missing");
    }
  }
  blockers.push("final_holdout_sealed");
  blockers.push("business_sampling_and_approval_missing");

  return {
    schema: "m2.current.diagnostic_gate.v0.1",
    status: candidate ? "CANDIDATE_BLOCKED" : "BASELINE_ONLY_BLOCKED",
    blockers: [...new Set(blockers)],
    developmentDirection: "coverage_first_then_constrained_candidate_comparison",
    candidateSelectionAuthorized: false,
    modelTrainingAuthorized: false,
    holdoutAuthorized: false,
    releaseAuthorized: false,
    m3FormalAuthorized: false
  };
}
