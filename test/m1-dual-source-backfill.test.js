import assert from "node:assert/strict";
import test from "node:test";

import {
  COHORTS,
  SOURCE_TYPES,
  buildUserConfirmedOverride,
  classifyM2SourceCohort,
  combineDualSourceCandidates,
  evaluateDualSourceAutoApply,
  evaluateDualSourceAutoApplyV2,
  summarizeDualSourceDryRun,
  summarizeDualSourceDryRunV2
} from "../src/domain/oldProductEvaluation/dualSourceMasterDataBackfill.js";

function candidate(overrides = {}) {
  return {
    standardWorkId: "S001",
    fieldName: "copyrightEndDate",
    currentValue: "",
    proposedValue: "2030-12-31",
    proposedValueNormalized: "2030-12-31",
    parserStatus: "parsed",
    matchMethod: "exact_original_id",
    matchConfidence: 1,
    valueConfidence: 0.99,
    conflictStatus: "none",
    requiresManualReview: false,
    ...overrides
  };
}

test("source cohort classification separates publication and web original works", () => {
  assert.equal(classifyM2SourceCohort({ digitalMatched: true, originalMatched: false }).cohort, COHORTS.PUBLICATION);
  assert.equal(classifyM2SourceCohort({ digitalMatched: false, originalMatched: true }).cohort, COHORTS.WEB_ORIGINAL);
  assert.equal(classifyM2SourceCohort({ digitalMatched: true, originalMatched: true }).cohort, COHORTS.MIXED);
  assert.equal(classifyM2SourceCohort({ digitalMatched: false, originalMatched: false }).cohort, COHORTS.MIXED);
});

test("consistent dual-source candidates increase confidence without creating a conflict", () => {
  const combined = combineDualSourceCandidates({
    digitalCandidate: candidate({ source: SOURCE_TYPES.DIGITAL, matchMethod: "exact_work_id", valueConfidence: 0.98 }),
    originalCandidate: candidate({ source: SOURCE_TYPES.ORIGINAL, matchMethod: "exact_original_id", valueConfidence: 0.99 })
  });

  assert.equal(combined.source, SOURCE_TYPES.BOTH_CONSISTENT);
  assert.equal(combined.conflictStatus, "none");
  assert.equal(combined.valueConfidence, 0.99);
});

test("conflicting dual-source candidates are never auto applied", () => {
  const combined = combineDualSourceCandidates({
    digitalCandidate: candidate({ source: SOURCE_TYPES.DIGITAL, matchMethod: "exact_work_id", proposedValue: "2030-12-31" }),
    originalCandidate: candidate({
      source: SOURCE_TYPES.ORIGINAL,
      matchMethod: "exact_original_id",
      proposedValue: "2031-12-31",
      proposedValueNormalized: "2031-12-31"
    })
  });
  const result = evaluateDualSourceAutoApply(combined);

  assert.equal(combined.source, SOURCE_TYPES.BOTH_CONFLICT);
  assert.equal(result.autoApplyEligibleDualSource, false);
  assert.equal(result.autoApplyExclusionReasonsDualSource.includes("dual_source_conflict_never_auto_apply"), true);
});

test("fuzzy and title-only matches remain manual review only", () => {
  const fuzzy = evaluateDualSourceAutoApply(
    candidate({ source: SOURCE_TYPES.ORIGINAL, matchMethod: "title_author_fuzzy", matchConfidence: 0.94 })
  );
  const titleOnly = evaluateDualSourceAutoApply(
    candidate({ source: SOURCE_TYPES.ORIGINAL, matchMethod: "title_only_high_confidence", matchConfidence: 0.88 })
  );

  assert.equal(fuzzy.autoApplyEligibleDualSource, false);
  assert.equal(fuzzy.autoApplyExclusionReasonsDualSource.includes("weak_match_never_auto_apply"), true);
  assert.equal(titleOnly.autoApplyEligibleDualSource, false);
  assert.equal(titleOnly.autoApplyExclusionReasonsDualSource.includes("weak_match_never_auto_apply"), true);
});

test("non-empty authoritative current values are not overwritten", () => {
  const result = evaluateDualSourceAutoApply(
    candidate({ source: SOURCE_TYPES.ORIGINAL, currentValue: "2029-12-31", proposedValue: "2030-12-31" })
  );

  assert.equal(result.autoApplyEligibleDualSource, false);
  assert.equal(result.autoApplyExclusionReasonsDualSource.includes("current_authoritative_value_not_empty"), true);
});

test("manual-only fields are excluded from automatic apply", () => {
  const result = evaluateDualSourceAutoApply(
    candidate({ source: SOURCE_TYPES.ORIGINAL, fieldName: "requiredTags", proposedValue: "tag-a", valueConfidence: 0.99 })
  );

  assert.equal(result.autoApplyEligibleDualSource, false);
  assert.equal(result.autoApplyExclusionReasonsDualSource.includes("field_requires_manual_review"), true);
});

test("dual-source dry-run statistics count auto and manual rows", () => {
  const auto = { ...candidate({ source: SOURCE_TYPES.ORIGINAL }), autoApplyEligibleDualSource: true };
  const manual = {
    ...candidate({ standardWorkId: "S002", source: SOURCE_TYPES.BOTH_CONFLICT, fieldName: "classificationLevel1" }),
    autoApplyEligibleDualSource: false
  };
  const summary = summarizeDualSourceDryRun([auto, manual]);

  assert.equal(summary.totalCandidateRows, 2);
  assert.equal(summary.autoApplyEligibleRows, 1);
  assert.equal(summary.manualReviewRows, 1);
  assert.equal(summary.matchedWorks, 2);
  assert.equal(summary.copyrightEndFillableWorks, 1);
  assert.equal(summary.classOrTagCandidateWorks, 1);
});

test("v2 dual-source conflict is never safe auto apply", () => {
  const result = evaluateDualSourceAutoApplyV2(
    candidate({
      source: SOURCE_TYPES.BOTH_CONFLICT,
      conflictStatus: "dual_source_value_conflict",
      matchMethod: "exact_work_id+exact_original_id"
    })
  );

  assert.equal(result.safeAutoApplyEligibleV2, false);
  assert.equal(result.autoApplyExclusionReasonsV2.includes("dual_source_conflict_never_auto_apply_v2"), true);
});

test("v2 classification and tags are never safe auto apply", () => {
  for (const fieldName of ["classificationLevel1", "classificationLevel2", "classificationLevel3", "requiredTags"]) {
    const result = evaluateDualSourceAutoApplyV2(
      candidate({
        source: SOURCE_TYPES.ORIGINAL,
        fieldName,
        matchMethod: "exact_original_id",
        proposedValue: "candidate"
      })
    );

    assert.equal(result.safeAutoApplyEligibleV2, false);
    assert.equal(result.autoApplyExclusionReasonsV2.includes("classification_or_tag_never_auto_apply_v2"), true);
  }
});

test("v2 safe auto apply requires single-source exact or mapping ID match", () => {
  const exact = evaluateDualSourceAutoApplyV2(candidate({ source: SOURCE_TYPES.ORIGINAL, matchMethod: "exact_original_id" }));
  const titleAuthor = evaluateDualSourceAutoApplyV2(candidate({ source: SOURCE_TYPES.ORIGINAL, matchMethod: "title_author_exact" }));

  assert.equal(exact.safeAutoApplyEligibleV2, true);
  assert.equal(titleAuthor.safeAutoApplyEligibleV2, false);
  assert.equal(titleAuthor.autoApplyExclusionReasonsV2.includes("original_match_must_be_exact_or_mapping_id_v2"), true);
});

test("v2 complex date signals and non-empty authoritative values are blocked", () => {
  const renewal = evaluateDualSourceAutoApplyV2(
    candidate({
      source: SOURCE_TYPES.DIGITAL,
      matchMethod: "exact_work_id",
      sourceRawValue: "automatic renewal"
    })
  );
  const nonEmpty = evaluateDualSourceAutoApplyV2(
    candidate({
      source: SOURCE_TYPES.DIGITAL,
      matchMethod: "exact_work_id",
      currentValue: "2029-12-31",
      proposedValue: "2030-12-31"
    })
  );

  assert.equal(renewal.safeAutoApplyEligibleV2, false);
  assert.equal(renewal.autoApplyExclusionReasonsV2.includes("complex_date_signal_never_auto_apply_v2"), true);
  assert.equal(nonEmpty.safeAutoApplyEligibleV2, false);
  assert.equal(nonEmpty.autoApplyExclusionReasonsV2.includes("current_authoritative_value_not_empty_v2"), true);
});

test("user-confirmed overrides never generalize beyond reviewed candidate", () => {
  const accepted = buildUserConfirmedOverride(candidate(), { candidateId: "DS-001", userDecision: "接受" });
  const modified = buildUserConfirmedOverride(candidate(), {
    candidateId: "DS-002",
    userDecision: "需修改",
    userCorrectedValue: "2031-12-31"
  });
  const missingCorrection = buildUserConfirmedOverride(candidate(), { candidateId: "DS-003", userDecision: "需修改" });
  const rejected = buildUserConfirmedOverride(candidate(), { candidateId: "DS-004", userDecision: "拒绝" });

  assert.equal(accepted.userConfirmedAction, "acceptCandidate");
  assert.equal(modified.userConfirmedAction, "applyCorrectedValue");
  assert.equal(missingCorrection.canApplyToStaging, false);
  assert.equal(rejected.userConfirmedAction, "rejectCandidate");
  assert.equal(modified.canGeneralize, false);
});

test("v2 dry-run summary separates safe auto apply and user-confirmed overrides", () => {
  const safe = {
    ...candidate({ source: SOURCE_TYPES.ORIGINAL }),
    ...evaluateDualSourceAutoApplyV2(candidate({ source: SOURCE_TYPES.ORIGINAL }))
  };
  const blockedCandidate = candidate({ source: SOURCE_TYPES.BOTH_CONFLICT, fieldName: "classificationLevel1" });
  const blocked = {
    ...blockedCandidate,
    ...evaluateDualSourceAutoApplyV2(blockedCandidate)
  };
  const override = buildUserConfirmedOverride(blocked, { candidateId: "DS-001", userDecision: "接受" });
  const summary = summarizeDualSourceDryRunV2([safe, blocked], [override]);

  assert.equal(summary.safeAutoApplyRows, 1);
  assert.equal(summary.userConfirmedOverrideRows, 1);
  assert.equal(summary.manualReviewRows, 1);
  assert.equal(summary.rejectedOrRuleBlockedRows, 1);
});
