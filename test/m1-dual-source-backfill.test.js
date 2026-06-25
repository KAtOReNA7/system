import assert from "node:assert/strict";
import test from "node:test";

import {
  COHORTS,
  SOURCE_TYPES,
  classifyM2SourceCohort,
  combineDualSourceCandidates,
  evaluateDualSourceAutoApply,
  summarizeDualSourceDryRun
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
