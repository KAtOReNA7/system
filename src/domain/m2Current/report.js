import { evaluateM2CurrentDiagnosticGate } from "./gate.js";

export function buildM2CurrentPublicDiagnosticReport(
  evidence,
  candidate,
  config
) {
  const gate = evaluateM2CurrentDiagnosticGate(evidence, candidate, config);
  return {
    schema: "m2.current.public_diagnostic_report.v0.2",
    decisionStatus: "not_for_formal_decision",
    directionAssessment: {
      businessProblemWrong: false,
      governanceWrong: false,
      engineeringSequenceDrifted: true,
      nextPriority:
        "business_sample_current_candidate_and_resolve_cash_observability"
    },
    evidence,
    candidate,
    gate,
    nextDiagnostics: [
      "run_deidentified_business_sample_for_current_candidate",
      "prepare_auditable_commitment_snapshot_role_for_cash_observability",
      "keep_final_holdout_sealed_until_separate_authorization",
      "do_not_expand_candidate_family_before_business_sample"
    ]
  };
}
