import { evaluateM2CurrentDiagnosticGate } from "./gate.js";
import { buildM2CurrentContract } from "./contract.js";

export function buildM2CurrentPublicDiagnosticReport(
  evidence,
  candidate,
  config
) {
  const contract = buildM2CurrentContract(config);
  const gate = evaluateM2CurrentDiagnosticGate(evidence, candidate, config);
  return {
    schema: config.schema === "m2.current.config.v0.2"
      ? "m2.current.public_diagnostic_report.v0.3"
      : "m2.current.public_diagnostic_report.v0.2",
    decisionStatus: "not_for_formal_decision",
    directionAssessment: {
      businessProblemWrong: false,
      governanceWrong: false,
      engineeringSequenceDrifted: false,
      retiredSequence:
        "human_numeric_baseline_and_mandatory_business_sample_review",
      nextPriority:
        "automated_backtest_baselines_and_business_coverage"
    },
    evaluationPolicy: contract.evaluationPolicy,
    evidence,
    candidate,
    gate,
    nextDiagnostics: [
      "implement_monthly_rolling_origin_evaluation",
      "compare_zero_seasonal_naive_sba_tsb_and_adida_baselines",
      "separate_cash_occurrence_from_positive_cash_amount_diagnostics",
      "report_wape_bias_mase_rmsse_by_horizon_segment_and_route",
      "report_eligibility_observability_served_coverage_and_abstention_separately",
      "accept_only_real_auditable_commitment_snapshots",
      "keep_final_holdout_sealed_until_separate_authorization",
      "defer_small_human_result_acceptance_until_technical_gates_pass"
    ]
  };
}
