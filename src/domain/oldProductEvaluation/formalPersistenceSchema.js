export const M2_FORMAL_PERSISTENCE_CANDIDATE_VERSION =
  "m2-c3-cleaned-bill-nonformal-v0.2/candidate-a";

export const M2_FORMAL_PERSISTENCE_NONFORMAL_BOUNDARY = Object.freeze({
  stage: "M2-FR-1",
  candidateVersion: M2_FORMAL_PERSISTENCE_CANDIDATE_VERSION,
  notForFormalDecision: true,
  formalEvaluationAllowed: false,
  migrationExecuted: false,
  databaseConnected: false,
  databaseWritten: false,
  mappingVersionActivated: false,
  switchMappingVersionCalled: false,
  apiRuntimeAdded: false
});

export const M2_FORMAL_PERSISTENCE_TABLES = Object.freeze({
  algorithmVersions: "m2_evaluation_algorithm_versions",
  results: "m2_evaluation_results",
  inputSnapshots: "m2_evaluation_input_snapshots",
  risks: "m2_evaluation_risks",
  suggestions: "m2_evaluation_suggestions",
  reviewItems: "m2_evaluation_review_items"
});

export const M2_EVALUATION_RESULT_STATUSES = Object.freeze([
  "current",
  "historical",
  "invalidated",
  "failed"
]);

export const M2_EVALUATION_REVIEW_STATUSES = Object.freeze([
  "pending",
  "approved",
  "data_fix_required",
  "waiver_granted",
  "rejected_for_formal",
  "no_action_required"
]);

export const M2_EVALUATION_RISK_TYPES = Object.freeze([
  "blocking",
  "advisory",
  "warning"
]);

export const M2_EVALUATION_ALGORITHM_VERSION_STATUSES = Object.freeze([
  "draft",
  "frozen",
  "released",
  "retired",
  "failed"
]);

export const M2_EVALUATION_RATINGS = Object.freeze([
  "S+",
  "S",
  "A",
  "B",
  "C",
  "D",
  "E",
  "not_rated"
]);

export const M2_EVALUATION_LIFECYCLES = Object.freeze([
  "growth",
  "stable",
  "rebound",
  "declining",
  "long_tail",
  "inactive",
  "insufficient_history",
  "unknown"
]);

export const M2_FORMAL_PERSISTENCE_REQUIRED_FIELDS = Object.freeze({
  results: Object.freeze([
    "id",
    "standard_work_id",
    "candidate_version",
    "algorithm_version",
    "parameter_version",
    "mapping_version_id",
    "basic_info_version_id",
    "cutoff_month",
    "result_status",
    "rating",
    "rating_score",
    "lifecycle",
    "lifecycle_confidence",
    "forecast_base_total",
    "forecast_optimistic_total",
    "forecast_pessimistic_total",
    "forecast_range_lower",
    "forecast_range_upper",
    "risk_level",
    "primary_suggestion",
    "not_for_formal_decision",
    "formal_evaluation_allowed",
    "generated_at",
    "invalidated_at",
    "invalidation_reason",
    "created_at",
    "updated_at"
  ]),
  inputSnapshots: Object.freeze([
    "id",
    "evaluation_result_id",
    "standard_work_id",
    "cutoff_month",
    "latest_complete_month",
    "income_fact_version",
    "source_batch_ids",
    "mapping_version_id",
    "basic_info_version_id",
    "copyright_start",
    "copyright_end",
    "remaining_copyright_months",
    "last3_revenue",
    "last6_revenue",
    "last12_revenue",
    "last24_revenue",
    "total_historical_revenue",
    "active_month_count",
    "zero_revenue_month_count",
    "business_form_breakdown",
    "channel_concentration_summary",
    "incomplete_months_excluded",
    "input_hash",
    "created_at"
  ]),
  risks: Object.freeze([
    "id",
    "evaluation_result_id",
    "risk_code",
    "severity",
    "risk_type",
    "is_blocking",
    "is_advisory",
    "evidence_json",
    "mitigation_hint",
    "created_at"
  ]),
  suggestions: Object.freeze([
    "id",
    "evaluation_result_id",
    "suggestion_code",
    "priority",
    "reason",
    "expected_impact",
    "requires_manual_confirmation",
    "created_at"
  ]),
  reviewItems: Object.freeze([
    "id",
    "evaluation_result_id",
    "standard_work_id",
    "review_type",
    "review_reason_code",
    "review_status",
    "review_priority",
    "is_blocking",
    "assigned_to",
    "reviewed_by",
    "reviewed_at",
    "decision",
    "decision_reason",
    "audit_metadata_json",
    "created_at",
    "updated_at"
  ]),
  algorithmVersions: Object.freeze([
    "id",
    "version_key",
    "candidate_version",
    "parameter_version",
    "status",
    "is_formal",
    "source_candidate",
    "description",
    "frozen_at",
    "released_at",
    "retired_at",
    "audit_metadata_json",
    "created_at"
  ])
});

export const M2_FORMAL_PERSISTENCE_REQUIRED_INDEX_FIELDS = Object.freeze([
  "standard_work_id",
  "cutoff_month",
  "candidate_version",
  "algorithm_version",
  "mapping_version_id",
  "result_status",
  "rating",
  "lifecycle",
  "risk_code",
  "review_status",
  "is_blocking",
  "created_at"
]);
