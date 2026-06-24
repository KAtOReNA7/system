export const FORMAL_READINESS_STATUSES = Object.freeze({
  READY_FOR_LOCAL_ALGORITHM_VALIDATION: "ready_for_local_algorithm_validation",
  FORMAL_RELEASE_BLOCKED: "formal_release_blocked",
  WAIVER_REQUIRED: "waiver_required",
  DATA_FIX_REQUIRED: "data_fix_required",
  MAPPING_ACTIVATION_REQUIRED: "mapping_activation_required"
});

const DATA_FIX_RISKS = new Set([
  "copyright_date_conflict",
  "aggregate_projection_gap",
  "missing_basic_info",
  "metadata_gap"
]);

const WAIVER_RISKS = new Set(["missing_copyright_end", "copyright_expiry", "expiry_high_value"]);
const MAPPING_RISKS = new Set(["mapping_uncertainty", "mapping_not_active", "mapping_version_inactive"]);

function hasAny(values = [], targets) {
  return values.some((value) => targets.has(value));
}

export function classifyFormalReadiness(features = {}) {
  const risks = Array.isArray(features.riskCodes) ? features.riskCodes : [];
  const reasons = [];

  if (Boolean(features.mappingActivationRequired) || hasAny(risks, MAPPING_RISKS)) {
    reasons.push("mapping_activation_required");
    return buildFormalReadinessResult(
      FORMAL_READINESS_STATUSES.MAPPING_ACTIVATION_REQUIRED,
      reasons,
      "prepare_or_activate_mapping_version_before_formal_release"
    );
  }

  if (hasAny(risks, DATA_FIX_RISKS)) {
    reasons.push("formal_data_fix_required");
    return buildFormalReadinessResult(
      FORMAL_READINESS_STATUSES.DATA_FIX_REQUIRED,
      reasons,
      "fix_formal_source_or_metadata_before_release"
    );
  }

  if (Boolean(features.forecastFallbackUsed) || Boolean(features.waiverRequired) || hasAny(risks, WAIVER_RISKS)) {
    reasons.push("formal_waiver_required");
    return buildFormalReadinessResult(
      FORMAL_READINESS_STATUSES.WAIVER_REQUIRED,
      reasons,
      "record_formal_waiver_before_release"
    );
  }

  if (Boolean(features.releaseApprovalMissing) || Boolean(features.formalFlagsIncomplete)) {
    reasons.push("formal_release_approval_missing");
    return buildFormalReadinessResult(
      FORMAL_READINESS_STATUSES.FORMAL_RELEASE_BLOCKED,
      reasons,
      "complete_formal_release_approval"
    );
  }

  return buildFormalReadinessResult(
    FORMAL_READINESS_STATUSES.READY_FOR_LOCAL_ALGORITHM_VALIDATION,
    ["formal_readiness_not_blocking_local_algorithm_validation"],
    "local_algorithm_validation_allowed"
  );
}

function buildFormalReadinessResult(status, reasonCodes, requiredAction) {
  return {
    formalReadinessStatus: status,
    formalReadinessReasonCodes: reasonCodes,
    formalReadinessBlocksRelease:
      status !== FORMAL_READINESS_STATUSES.READY_FOR_LOCAL_ALGORITHM_VALIDATION,
    formalReadinessBlocksLocalForecast: false,
    requiredFormalAction: requiredAction
  };
}
