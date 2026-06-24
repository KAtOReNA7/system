import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBackfillCandidate,
  classifyCandidateConfidence,
  mergeConfidence,
  summarizeCandidates
} from "../src/domain/oldProductEvaluation/masterDataBackfillCandidate.js";

test("high confidence parsed exact match can be auto-apply eligible candidate", () => {
  const candidate = buildBackfillCandidate({
    standardWorkId: "1001",
    rawWorkId: "1001",
    ledgerRowIds: ["L000001"],
    fieldName: "copyrightEndDate",
    proposedValue: "2030-12-31",
    parserStatus: "parsed",
    matchMethod: "exact_work_id",
    matchConfidence: "high"
  });

  assert.equal(candidate.valueConfidence, "high");
  assert.equal(candidate.autoApplyEligible, true);
  assert.equal(candidate.requiresManualReview, false);
});

test("relative parser status is suggested but not auto apply", () => {
  const result = classifyCandidateConfidence({
    matchConfidence: "high",
    parserStatus: "parsed_with_condition"
  });

  assert.equal(result.valueConfidence, "medium");
  assert.equal(result.autoApplyEligible, false);
  assert.equal(result.requiresManualReview, true);
});

test("conflict candidates never auto apply", () => {
  const candidate = buildBackfillCandidate({
    standardWorkId: "1001",
    fieldName: "authorName",
    proposedValue: "Author A",
    parserStatus: "parsed",
    matchConfidence: "high",
    conflictStatus: "conflict"
  });

  assert.equal(candidate.valueConfidence, "low");
  assert.equal(candidate.autoApplyEligible, false);
  assert.equal(candidate.requiresManualReview, true);
});

test("summarizes candidate distribution", () => {
  const candidates = [
    buildBackfillCandidate({
      fieldName: "authorName",
      parserStatus: "parsed",
      matchConfidence: "high"
    }),
    buildBackfillCandidate({
      fieldName: "copyrightEndDate",
      parserStatus: "parsed_with_condition",
      matchConfidence: "high"
    })
  ];
  const summary = summarizeCandidates(candidates);

  assert.equal(summary.total, 2);
  assert.equal(summary.autoApplyEligible, 1);
  assert.equal(summary.manualReview, 1);
  assert.deepEqual(summary.byField, { authorName: 1, copyrightEndDate: 1 });
});

test("confidence merge keeps stronger confidence", () => {
  assert.equal(mergeConfidence("low", "medium"), "medium");
  assert.equal(mergeConfidence("high", "medium"), "high");
});
