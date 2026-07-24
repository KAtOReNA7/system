import { evaluateM2CurrentDiagnosticGate } from "./gate.js";

export function buildM2CurrentPublicDiagnosticReport(
  evidence,
  candidate,
  config
) {
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
      nextPriority:
        "human_review_current_business_sample_and_acquire_commitment_snapshots"
    },
    evidence,
    candidate,
    gate,
    nextDiagnostics: [
      "complete_human_review_of_frozen_current_business_sample",
      "prepare_auditable_commitment_snapshot_role_for_cash_observability",
      "keep_final_holdout_sealed_until_separate_authorization",
      "do_not_use_post_hoc_status_to_predict_dormant_reactivation"
    ]
  };
}
