import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateStrictAutoApplyCandidate,
  evaluateStrictAutoApplyCandidateV2,
  summarizeStrictAutoApply,
  summarizeStrictAutoApplyV2
} from "../src/domain/oldProductEvaluation/ledgerBackfillVerification.js";

function baseCandidate(overrides = {}) {
  return {
    standardWorkId: "1001",
    fieldName: "copyrightEndDate",
    proposedValue: "2030-12-31",
    proposedValueNormalized: "2030-12-31",
    sourceRawValue: "2030/12/31",
    parserStatus: "parsed",
    matchMethod: "exact_work_id",
    matchConfidence: "high",
    valueConfidence: "high",
    conflictStatus: "none",
    requiresManualReview: false,
    ...overrides
  };
}

test("strict auto apply allows exact ID high confidence non-conflict candidate", () => {
  const result = evaluateStrictAutoApplyCandidate(baseCandidate());

  assert.equal(result.strictAutoApplyEligible, true);
  assert.deepEqual(result.strictAutoExclusionReasons, []);
  assert.equal(result.strictRecommendedBucket, "auto_apply");
});

test("title author exact needs numeric-equivalent match confidence", () => {
  assert.equal(
    evaluateStrictAutoApplyCandidate(baseCandidate({ matchMethod: "title_author_exact", matchConfidence: 0.99 }))
      .strictAutoApplyEligible,
    true
  );

  const result = evaluateStrictAutoApplyCandidate(baseCandidate({ matchMethod: "title_author_exact", matchConfidence: "medium" }));
  assert.equal(result.strictAutoApplyEligible, false);
  assert.ok(result.strictAutoExclusionReasons.includes("match_method_or_confidence_not_strict"));
});

test("fuzzy match is never strict auto apply", () => {
  const result = evaluateStrictAutoApplyCandidate(baseCandidate({ matchMethod: "title_author_fuzzy" }));

  assert.equal(result.strictAutoApplyEligible, false);
  assert.ok(result.strictAutoExclusionReasons.includes("match_method_or_confidence_not_strict"));
});

test("conflict candidates are never strict auto apply", () => {
  const result = evaluateStrictAutoApplyCandidate(baseCandidate({ conflictStatus: "conflict" }));

  assert.equal(result.strictAutoApplyEligible, false);
  assert.ok(result.strictAutoExclusionReasons.includes("conflict_status_not_none"));
});

test("perpetual copyright terms are not converted into concrete dates automatically", () => {
  const result = evaluateStrictAutoApplyCandidate(
    baseCandidate({
      proposedValue: "无限期",
      proposedValueNormalized: "infinite",
      sourceRawValue: "永久授权/无期限"
    })
  );

  assert.equal(result.strictAutoApplyEligible, false);
  assert.ok(result.strictAutoExclusionReasons.includes("perpetual_or_infinite_requires_business_confirmation"));
});

test("relative expiry pending anchor cannot auto apply", () => {
  const result = evaluateStrictAutoApplyCandidate(
    baseCandidate({
      proposedValue: "publication_date+5y",
      proposedValueNormalized: "publication_date+5y",
      sourceRawValue: "出版之日起5年"
    })
  );

  assert.equal(result.strictAutoApplyEligible, false);
  assert.ok(result.strictAutoExclusionReasons.includes("date_pending_anchor"));
});

test("automatic renewal is not auto-extended", () => {
  const result = evaluateStrictAutoApplyCandidate(baseCandidate({ sourceRawValue: "2030/12/31 到期后自动续约一年" }));

  assert.equal(result.strictAutoApplyEligible, false);
  assert.ok(result.strictAutoExclusionReasons.includes("automatic_renewal_not_auto_extended"));
});

test("classification level 3 is never auto applied", () => {
  const result = evaluateStrictAutoApplyCandidate(
    baseCandidate({
      fieldName: "classificationLevel3",
      proposedValue: "细分类",
      proposedValueNormalized: "细分类",
      sourceRawValue: "CIP 文本"
    })
  );

  assert.equal(result.strictAutoApplyEligible, false);
  assert.ok(result.strictAutoExclusionReasons.includes("classification_level3_never_auto_apply"));
});

test("audio limited_or_conflict requires manual review", () => {
  const result = evaluateStrictAutoApplyCandidate(
    baseCandidate({
      fieldName: "audioRightsStatus",
      proposedValue: "limited_or_conflict",
      proposedValueNormalized: "limited_or_conflict",
      sourceRawValue: "有声权利存在冲突"
    })
  );

  assert.equal(result.strictAutoApplyEligible, false);
  assert.ok(result.strictAutoExclusionReasons.includes("audio_rights_limited_or_conflict"));
});

test("strict summary reports automatic rows, works, revenue coverage and exclusions", () => {
  const summary = summarizeStrictAutoApply(
    [
      baseCandidate({ standardWorkId: "1001", fieldName: "authorName" }),
      baseCandidate({ standardWorkId: "1002", matchMethod: "title_author_fuzzy" })
    ],
    { 1001: 100, 1002: 300 }
  );

  assert.equal(summary.candidateRows, 2);
  assert.equal(summary.automaticFieldCandidates, 1);
  assert.equal(summary.automaticStandardWorks, 1);
  assert.equal(summary.automaticRevenueCoverage, 0.25);
  assert.deepEqual(summary.byField, { authorName: 1 });
  assert.equal(summary.exclusionReasons.match_method_or_confidence_not_strict, 1);
});

test("v2 auto apply requires empty current value and allowed fields only", () => {
  const accepted = evaluateStrictAutoApplyCandidateV2(baseCandidate({ currentValue: "" }));
  assert.equal(accepted.strictAutoApplyEligibleV2, true);

  const nonEmpty = evaluateStrictAutoApplyCandidateV2(baseCandidate({ currentValue: "2030-12-31" }));
  assert.equal(nonEmpty.strictAutoApplyEligibleV2, false);
  assert.ok(nonEmpty.strictAutoExclusionReasonsV2.includes("current_value_same_or_format_only"));

  const classification = evaluateStrictAutoApplyCandidateV2(
    baseCandidate({
      fieldName: "classificationLevel1",
      proposedValue: "出版物",
      proposedValueNormalized: "出版物"
    })
  );
  assert.equal(classification.strictAutoApplyEligibleV2, false);
  assert.ok(classification.strictAutoExclusionReasonsV2.includes("field_not_allowed_for_v2_auto_apply"));
});

test("v2 auto apply blocks fuzzy and multi-date text", () => {
  const fuzzy = evaluateStrictAutoApplyCandidateV2(baseCandidate({ matchMethod: "title_author_fuzzy" }));
  assert.equal(fuzzy.strictAutoApplyEligibleV2, false);
  assert.ok(fuzzy.strictAutoExclusionReasonsV2.includes("title_author_fuzzy_never_auto_apply_v2"));

  const multiDate = evaluateStrictAutoApplyCandidateV2(baseCandidate({ sourceRawValue: "电子2028/01/01，有声2030/12/31" }));
  assert.equal(multiDate.strictAutoApplyEligibleV2, false);
  assert.ok(multiDate.strictAutoExclusionReasonsV2.includes("multiple_date_text_requires_manual_review"));
});

test("v2 summary is stricter than v1 when current authoritative value exists", () => {
  const candidates = [
    baseCandidate({ standardWorkId: "1001", currentValue: "" }),
    baseCandidate({ standardWorkId: "1002", currentValue: "2030-12-31" })
  ];
  const v1 = summarizeStrictAutoApply(candidates, { 1001: 100, 1002: 300 });
  const v2 = summarizeStrictAutoApplyV2(candidates, { 1001: 100, 1002: 300 });

  assert.equal(v1.automaticFieldCandidates, 2);
  assert.equal(v2.automaticFieldCandidates, 1);
  assert.equal(v2.automaticRevenueCoverage, 0.25);
});
