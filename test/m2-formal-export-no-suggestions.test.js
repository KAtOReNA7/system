import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validateFormalExecutionPayload } from "../scripts/m2-real-data/run_m2_formal_local_execution.mjs";

function syntheticPayload() {
  return {
    schema: "m2.formal_execution_private_payload.v1",
    privateOnly: true,
    notForCommit: true,
    formalEvaluationAuthorized: true,
    finalReleaseApproved: false,
    operatingSuggestionsIncluded: false,
    candidateVersion: "synthetic-conditional",
    factImport: { factRowCount: 192872 },
    scopeReconciliation: { scopeFullyAligned: true },
    reviewDecisionSummary: { pending: 0 },
    summary: {
      operatingSuggestionCount: 0,
      modelValidation: { verdict: "CONDITIONAL PASS" }
    },
    records: Array.from({ length: 3053 }, (_, index) => ({
      standardWorkId: `SYN-${String(index + 1).padStart(4, "0")}`,
      standardWorkName: "synthetic work",
      authorName: "synthetic author",
      copyrightStart: "2020-01-01",
      copyrightEndType: "perpetual",
      copyrightEndValue: "perpetual",
      workStatus: "listed",
      audioRightsStatus: "perpetual",
      rating: "B",
      lifecycle: "stable",
      inputHash: `hash-${index + 1}`
    }))
  };
}

test("formal M2 export omits automatic operating suggestions", async () => {
  const source = await readFile(
    "src/repositories/m2EvaluationExportRepository.js",
    "utf8"
  );

  assert.doesNotMatch(source, /primary_suggestion/);
  assert.doesNotMatch(source, /m2_evaluation_suggestions/);
  assert.doesNotMatch(source, /primarySuggestion/);
  assert.doesNotMatch(source, /suggestions:\s*row/);
  assert.doesNotMatch(source, /m2-realdata-dev-candidate-b-v0\.1/);
  assert.match(source, /m2_formal_export_packages/);
  assert.match(source, /m2_formal_export_items/);
  assert.match(source, /operatingSuggestionsIncluded:\s*false/);
});

test("formal local payload accepts the authorized 3053-work boundary", () => {
  const result = validateFormalExecutionPayload(syntheticPayload());
  assert.equal(result.valid, true);
  assert.equal(result.workCount, 3053);
  assert.equal(result.finalReleaseApproved, false);
  assert.equal(result.operatingSuggestionsIncluded, false);
});

test("formal local payload rejects release approval and operating suggestions", () => {
  const payload = syntheticPayload();
  payload.finalReleaseApproved = true;
  payload.operatingSuggestionsIncluded = true;
  payload.summary.operatingSuggestionCount = 1;
  payload.records[0].operatingSuggestion = "synthetic action";

  const result = validateFormalExecutionPayload(payload);
  assert.equal(result.valid, false);
  assert.ok(result.issues.includes("final_release_must_remain_unapproved"));
  assert.ok(result.issues.includes("operating_suggestions_must_be_absent"));
  assert.ok(result.issues.includes("operating_suggestion_count_nonzero"));
  assert.ok(result.issues.includes("record_operating_suggestion_present"));
});

test("formal local payload rejects copyright end before copyright start", () => {
  const payload = syntheticPayload();
  payload.records[0].copyrightEndType = "exact_date";
  payload.records[0].copyrightStart = "2021-07-22";
  payload.records[0].copyrightEnd = "2021-06-23";
  payload.records[0].copyrightEndValue = "2021-06-23";
  const result = validateFormalExecutionPayload(payload);
  assert.equal(result.valid, false);
  assert.ok(result.issues.includes("record_copyright_chronology_invalid"));
});

test("formal export migration enforces prepared state, audit, and no suggestions", async () => {
  const migration = await readFile(
    "db/migrations/V0071_010__m2_formal_task_export_release_audit.sql",
    "utf8"
  );
  assert.match(migration, /CREATE TABLE m2_formal_export_packages/);
  assert.match(migration, /CREATE TABLE m2_formal_export_items/);
  assert.match(migration, /CREATE TABLE m2_formal_audit_events/);
  assert.match(migration, /contains_operating_suggestions = false/);
  assert.match(migration, /'prepared'/);
});

test("rights term and current status remain independent audited facts", async () => {
  const migration = await readFile(
    "db/migrations/V0071_020__m2_rights_term_status_independence.sql",
    "utf8"
  );
  assert.match(migration, /DROP CONSTRAINT ck_basic_info_perpetual_consistency/);
  assert.match(migration, /DROP CONSTRAINT ck_basic_info_expired_unknown_consistency/);
  assert.match(migration, /independent from the current audio-rights status/);
});
