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
    schema: config.schema === "m2.current.config.v0.3"
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
        "human_numeric_baseline_and_120_work_business_sample",
      nextPriority:
        "business_cash_observability_and_separately_authorized_holdout"
    },
    evaluationPolicy: contract.evaluationPolicy,
    evidence,
    candidate,
    gate,
    nextDiagnostics: [
      "keep_monthly_rolling_origin_and_simple_baselines_as_mandatory_regression_checks",
      "improve_cash_observability_without_moving_the_frozen_model_population",
      "keep_occurrence_and_positive_amount_diagnostics_separate",
      "accept_only_real_auditable_commitment_snapshots",
      "keep_final_holdout_sealed_until_separate_authorization",
      "use_humans_only_for_post_gate_quality_assurance"
    ]
  };
}
