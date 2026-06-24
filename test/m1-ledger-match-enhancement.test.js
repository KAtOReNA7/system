import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyEnhancedMatch,
  evaluateStrictAutoApplyCandidateV2,
  normalizeAuthorForMatch,
  normalizeTitleForMatch,
  normalizeWorkIdForMatch
} from "../src/domain/oldProductEvaluation/ledgerBackfillVerification.js";

test("normalizes numeric string Excel decimal leading zero and Y-prefixed IDs", () => {
  assert.equal(normalizeWorkIdForMatch(12345), "12345");
  assert.equal(normalizeWorkIdForMatch("12345.0"), "12345");
  assert.equal(normalizeWorkIdForMatch("  0012345 "), "12345");
  assert.equal(normalizeWorkIdForMatch("Y12345"), "12345");
  assert.equal(normalizeWorkIdForMatch("Ｙ１２３４５"), "12345");
});

test("normalizes title punctuation edition flags and full-width characters", () => {
  assert.equal(normalizeTitleForMatch("《 示例书名：修订版 》"), "示例书名:");
  assert.equal(normalizeTitleForMatch("示例 书名:新版"), "示例书名:");
});

test("normalizes author aliases separators translator and editor suffixes", () => {
  assert.deepEqual(normalizeAuthorForMatch("张三 著、李四 译 / 王五主编"), ["张三", "李四", "王五"]);
});

test("enhanced match treats Y-prefixed ledger ID as the same standard work body", () => {
  const match = classifyEnhancedMatch({
    standardWorkId: "12345",
    ledgerWorkId: "Y12345",
    standardTitle: "不同标题",
    ledgerTitle: "另一个标题"
  });

  assert.equal(match.matchMethod, "exact_work_id");
  assert.equal(match.matchConfidence, "high");
});

test("enhanced match accepts exact title and author after normalization", () => {
  const match = classifyEnhancedMatch({
    standardWorkId: "12345",
    ledgerWorkId: "",
    standardTitle: "《示例书名：修订版》",
    ledgerTitle: "示例书名:",
    standardAuthor: "张三 著",
    ledgerAuthor: "张三"
  });

  assert.equal(match.matchMethod, "title_author_exact");
  assert.equal(match.matchConfidence, 0.99);
});

test("fuzzy-style match result cannot be v2 auto applied", () => {
  const result = evaluateStrictAutoApplyCandidateV2({
    standardWorkId: "1001",
    fieldName: "standardWorkName",
    currentValue: "",
    proposedValue: "候选书名",
    proposedValueNormalized: "候选书名",
    sourceRawValue: "候选书名",
    matchMethod: "title_author_fuzzy",
    matchConfidence: "high",
    valueConfidence: "high",
    conflictStatus: "none",
    requiresManualReview: false
  });

  assert.equal(result.strictAutoApplyEligibleV2, false);
  assert.ok(result.strictAutoExclusionReasonsV2.includes("title_author_fuzzy_never_auto_apply_v2"));
});
