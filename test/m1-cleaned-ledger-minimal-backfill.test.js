import assert from "node:assert/strict";
import test from "node:test";

import {
  CLEANED_LEDGER_MINIMAL_FIELDS,
  assertNoObsoleteV2Candidates,
  auditMinimalLedgerHeaders,
  classifyProductLine,
  evaluateMinimalAutoApplyCandidate,
  isObsoleteV2Field,
  isSupportedMinimalBackfillField
} from "../src/domain/oldProductEvaluation/cleanedLedgerMinimalBackfill.js";

function candidate(overrides = {}) {
  return {
    fieldName: "copyrightEndDate",
    currentValue: "",
    proposedValue: "2030-12-31",
    proposedValueNormalized: "2030-12-31",
    sourceRawValue: "2030-12-31",
    parserStatus: "parsed",
    matchMethod: "exact_work_id",
    matchConfidence: 1,
    valueConfidence: 0.98,
    conflictStatus: "none",
    requiresManualReview: false,
    ...overrides
  };
}

test("minimal ledger v3 accepts exactly the seven cleaned ledger fields", () => {
  const result = auditMinimalLedgerHeaders(CLEANED_LEDGER_MINIMAL_FIELDS);

  assert.equal(result.exact, true);
  assert.equal(result.fieldCount, 7);
  assert.deepEqual(result.extra, []);
  assert.deepEqual(result.missing, []);
});

test("minimal ledger v3 rejects old 65-field parsing assumptions", () => {
  const result = auditMinimalLedgerHeaders([...CLEANED_LEDGER_MINIMAL_FIELDS, "出版社", "有声使用权"]);

  assert.equal(result.exact, false);
  assert.deepEqual(result.extra, ["出版社", "有声使用权"]);
  assert.equal(isObsoleteV2Field("audioRightsStatus"), true);
  assert.equal(isObsoleteV2Field("publisherName"), true);
  assert.equal(isObsoleteV2Field("firstPublicationDate"), true);
  assert.equal(isObsoleteV2Field("classificationLevel3"), true);
});

test("minimal backfill candidate fields exclude publisher, audio rights, first publication and class3", () => {
  assert.equal(isSupportedMinimalBackfillField("standardWorkName"), true);
  assert.equal(isSupportedMinimalBackfillField("classificationLevel2"), true);
  assert.equal(isSupportedMinimalBackfillField("publisherName"), false);
  assert.equal(isSupportedMinimalBackfillField("audioRightsStatus"), false);
  assert.equal(isSupportedMinimalBackfillField("firstPublicationDate"), false);
  assert.equal(isSupportedMinimalBackfillField("classificationLevel3"), false);
});

test("product line only produces classification level1 and level2 candidates", () => {
  const parsed = classifyProductLine("出版物/文学");

  assert.equal(parsed.classificationLevel1, "出版物");
  assert.equal(parsed.classificationLevel2, "文学");
  assert.equal(parsed.requiresManualReview, true);
  assert.equal(Object.hasOwn(parsed, "classificationLevel3"), false);
});

test("strict exact match high confidence empty current value can auto apply core fields", () => {
  const result = evaluateMinimalAutoApplyCandidate(candidate());

  assert.equal(result.autoApplyEligibleV3, true);
  assert.deepEqual(result.autoApplyExclusionReasonsV3, []);
});

test("fuzzy match is never auto applied", () => {
  const result = evaluateMinimalAutoApplyCandidate(
    candidate({ matchMethod: "title_author_fuzzy", matchConfidence: 0.96 })
  );

  assert.equal(result.autoApplyEligibleV3, false);
  assert.equal(result.autoApplyExclusionReasonsV3.includes("title_author_fuzzy_never_auto_apply"), true);
});

test("relative expiry without anchor, automatic renewal and indefinite expiry are not auto applied", () => {
  const relative = evaluateMinimalAutoApplyCandidate(
    candidate({ parserStatus: "pending_anchor", sourceRawValue: "出版之日起五年" })
  );
  const renewal = evaluateMinimalAutoApplyCandidate(candidate({ sourceRawValue: "到期后自动续约" }));
  const indefinite = evaluateMinimalAutoApplyCandidate(
    candidate({ parserStatus: "indefinite", sourceRawValue: "永久授权" })
  );

  assert.equal(relative.autoApplyExclusionReasonsV3.includes("relative_expiry_without_anchor_not_auto_apply"), true);
  assert.equal(renewal.autoApplyExclusionReasonsV3.includes("automatic_renewal_not_extended"), true);
  assert.equal(indefinite.autoApplyExclusionReasonsV3.includes("indefinite_expiry_not_concrete_date"), true);
});

test("classification fields default to manual review and are not auto applied", () => {
  const result = evaluateMinimalAutoApplyCandidate(
    candidate({ fieldName: "classificationLevel1", proposedValue: "出版物", valueConfidence: 0.99 })
  );

  assert.equal(result.autoApplyEligibleV3, false);
  assert.equal(result.autoApplyExclusionReasonsV3.includes("field_not_auto_applyable_in_minimal_ledger_v3"), true);
});

test("obsolete v2 spotcheck fields are detected as invalid for v3", () => {
  const result = assertNoObsoleteV2Candidates([
    candidate({ fieldName: "standardWorkName" }),
    candidate({ fieldName: "audioRightsStatus" }),
    candidate({ fieldName: "classificationLevel3" })
  ]);

  assert.equal(result.ok, false);
  assert.deepEqual(result.invalidFields.sort(), ["audioRightsStatus", "classificationLevel3"]);
});
