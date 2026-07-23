import { evaluateM2CurrentDiagnosticGate } from "./gate.js";

export function buildM2CurrentPublicDiagnosticReport(evidence) {
  const gate = evaluateM2CurrentDiagnosticGate(evidence);
  return {
    schema: "m2.current.public_diagnostic_report.v0.1",
    decisionStatus: "not_for_formal_decision",
    directionAssessment: {
      businessProblemWrong: false,
      governanceWrong: false,
      engineeringSequenceDrifted: true,
      nextPriority: "coverage_and_runtime_contract_before_model_complexity"
    },
    evidence,
    gate,
    nextDiagnostics: [
      "preserve_same_7851_case_and_B4_comparator_identity",
      "measure_3_6_12_18_24_month_horizons",
      "measure_dense_intermittent_dormant_slices",
      "measure_full_library_top1_top5_top10_cash_coverage",
      "require_paired_origin_horizon_confidence_intervals"
    ]
  };
}
