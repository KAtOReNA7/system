import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGroupDecisionPolicy,
  buildGroupDecisionTemplateRows,
  buildReviewPackRow,
  validateGroupDecisionTemplateSchema
} from "../src/domain/oldProductEvaluation/reviewDecisionClosure.js";
import {
  assertSanitizedRemediationReport,
  buildDataGapRemediationSummary,
  buildExpiryWaiverPolicyDraft,
  buildManualExceptionBrief,
  buildReadinessRemediationPatch,
  buildRemediatedGroupDecisionTemplateRows,
  validateDataGapRemediationSummary,
  validateExpiryWaiverPolicyDraft,
  validateManualExceptionBrief
} from "../src/domain/oldProductEvaluation/reviewRemediationPlan.js";

const CANDIDATE_VERSION = "m2-realdata-dev-candidate-b-v0.1";

function syntheticItem(overrides = {}) {
  return {
    reviewItemId: 201,
    candidateVersion: CANDIDATE_VERSION,
    stableWorkReference: "m2dev-work-201",
    reasonCode: "high_value_with_data_gap",
    priority: 20,
    currentStatus: "pending",
    rating: "S",
    lifecycle: "stable",
    riskLevel: "high",
    primarySuggestion: "manual_review_required",
    riskCodes: ["aggregate_projection_gap", "missing_basic_info", "missing_copyright_end"],
    riskTypes: ["blocking"],
    suggestionCodes: ["manual_review_required"],
    ...overrides
  };
}

function groupPolicy() {
  const rows = [
    buildReviewPackRow(syntheticItem({ reviewItemId: 1 })),
    buildReviewPackRow(syntheticItem({ reviewItemId: 2 })),
    buildReviewPackRow(
      syntheticItem({
        reviewItemId: 3,
        reasonCode: "high_value_with_expiry",
        riskCodes: ["copyright_expiry"],
        suggestionCodes: ["manual_review_required", "renewal_review"]
      })
    ),
    buildReviewPackRow(
      syntheticItem({
        reviewItemId: 4,
        reasonCode: "insufficient_history",
        riskCodes: ["insufficient_history", "insufficient_revenue_history"],
        suggestionCodes: ["manual_review_required", "observe_only"]
      })
    ),
    buildReviewPackRow(
      syntheticItem({
        reviewItemId: 5,
        reasonCode: "abnormal_spike",
        riskCodes: ["abnormal_spike"],
        suggestionCodes: ["manual_review_required"]
      })
    )
  ];
  return { rows, policy: buildGroupDecisionPolicy(rows) };
}

test("data-gap remediation summary validates aggregate no-auto-fix diagnosis", () => {
  const { policy } = groupPolicy();
  const summary = buildDataGapRemediationSummary({
    candidateVersion: CANDIDATE_VERSION,
    groupPolicy: policy,
    diagnostics: {
      dataGapItemCount: 2,
      localDbInputSnapshotsChecked: true,
      inputSnapshotCount: 2,
      missingBasicInfoRiskCount: 2,
      missingCopyrightEndRiskCount: 2,
      aggregateProjectionGapRiskCount: 2,
      copyrightEndNullCount: 2,
      autoFixableCount: 0,
      autoFixedCount: 0,
      needsSourceDataFixCount: 2,
      shouldRemainBlockingCount: 2,
      remainingBlockingCount: 2
    }
  });
  const validation = validateDataGapRemediationSummary(summary);

  assert.equal(validation.valid, true);
  assert.equal(summary.classification.autoFixableCount, 0);
  assert.equal(summary.classification.needsSourceDataFixCount, 2);
  assert.equal(summary.remediationDecision.recommendedGroupDecisionAfterRemediation, "data_fix_required");
  assert.equal(summary.autoFixApplied, false);
  assert.equal(summary.finalDecisionsApplied, false);
});

test("expiry waiver policy remains a draft and requires audit fields", () => {
  const { policy } = groupPolicy();
  const waiver = buildExpiryWaiverPolicyDraft({ candidateVersion: CANDIDATE_VERSION, groupPolicy: policy });
  const validation = validateExpiryWaiverPolicyDraft(waiver);

  assert.equal(validation.valid, true);
  assert.equal(waiver.itemCount, 1);
  assert.equal(waiver.recommendedDecision, "waiver_granted");
  assert.equal(waiver.finalDecisionApplied, false);
  assert.equal(waiver.requiredFields.includes("waiverScope"), true);
  assert.equal(waiver.requiredFields.includes("waiverExpiry"), true);
});

test("manual exception brief keeps insufficient-history and spike groups pending", () => {
  const { policy } = groupPolicy();
  const brief = buildManualExceptionBrief({ candidateVersion: CANDIDATE_VERSION, groupPolicy: policy });
  const validation = validateManualExceptionBrief(brief);

  assert.equal(validation.valid, true);
  assert.equal(brief.totalManualExceptionItems, 2);
  assert.deepEqual(
    brief.groups.map((group) => group.recommendedDecision),
    ["pending", "pending"]
  );
  assert.equal(brief.finalDecisionApplied, false);
});

test("remediated group decision template adds aggregate remediation fields", () => {
  const { rows, policy } = groupPolicy();
  const dataGapSummary = buildDataGapRemediationSummary({
    candidateVersion: CANDIDATE_VERSION,
    groupPolicy: policy,
    diagnostics: {
      dataGapItemCount: 2,
      localDbInputSnapshotsChecked: true,
      inputSnapshotCount: 2,
      missingBasicInfoRiskCount: 2,
      missingCopyrightEndRiskCount: 2,
      aggregateProjectionGapRiskCount: 2,
      copyrightEndNullCount: 2,
      needsSourceDataFixCount: 2,
      shouldRemainBlockingCount: 2,
      remainingBlockingCount: 2
    }
  });
  const expiryWaiverPolicy = buildExpiryWaiverPolicyDraft({ candidateVersion: CANDIDATE_VERSION, groupPolicy: policy });
  const manualExceptionBrief = buildManualExceptionBrief({ candidateVersion: CANDIDATE_VERSION, groupPolicy: policy });
  const templateRows = buildRemediatedGroupDecisionTemplateRows({
    templateRows: buildGroupDecisionTemplateRows(rows),
    dataGapSummary,
    expiryWaiverPolicy,
    manualExceptionBrief
  });
  const schema = validateGroupDecisionTemplateSchema(templateRows);

  assert.equal(schema.valid, true);
  assert.equal(templateRows[0].remediationStatus, "diagnosed_no_safe_auto_fix");
  assert.equal(templateRows[0].remainingBlockingCount, "2");
  assert.equal(templateRows[1].recommendedGroupDecisionAfterRemediation, "waiver_granted");
  assert.equal(templateRows[2].recommendedGroupDecisionAfterRemediation, "pending");
});

test("readiness remediation patch preserves local-candidate boundary", () => {
  const { policy } = groupPolicy();
  const dataGapSummary = buildDataGapRemediationSummary({
    candidateVersion: CANDIDATE_VERSION,
    groupPolicy: policy,
    diagnostics: {
      dataGapItemCount: 2,
      needsSourceDataFixCount: 2,
      shouldRemainBlockingCount: 2,
      remainingBlockingCount: 2
    }
  });
  const expiryWaiverPolicy = buildExpiryWaiverPolicyDraft({ candidateVersion: CANDIDATE_VERSION, groupPolicy: policy });
  const manualExceptionBrief = buildManualExceptionBrief({ candidateVersion: CANDIDATE_VERSION, groupPolicy: policy });
  const patched = buildReadinessRemediationPatch({
    currentReadiness: {
      finalDecisionsApplied: false,
      proposedDecisionsGenerated: true,
      readiness: {
        remainingBlockingCount: 5,
        pendingCount: 5,
        candidateCanMoveToNextLocalReadinessStage: false
      }
    },
    dataGapSummary,
    expiryWaiverPolicy,
    manualExceptionBrief
  });

  assert.equal(patched.remediation.afterRemediationBlockingCount, 5);
  assert.equal(patched.remediation.candidateCanMoveToNextLocalReadinessStage, false);
  assert.equal(patched.conclusion.includes("final decisions were not applied"), true);
});

test("sanitized remediation report rejects secret-like payloads", () => {
  const result = assertSanitizedRemediationReport({
    schema: "synthetic",
    nested: {
      connectionString: "postgres://example"
    }
  });

  assert.equal(result.sanitized, false);
  assert.equal(result.detected.includes("connectionString"), true);
  assert.equal(result.detected.includes("postgres://"), true);
});
