import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  M2_EVALUATION_RESULT_STATUSES,
  M2_EVALUATION_REVIEW_STATUSES,
  M2_EVALUATION_RISK_TYPES,
  M2_FORMAL_PERSISTENCE_CANDIDATE_VERSION,
  M2_FORMAL_PERSISTENCE_NONFORMAL_BOUNDARY,
  M2_FORMAL_PERSISTENCE_REQUIRED_FIELDS,
  M2_FORMAL_PERSISTENCE_REQUIRED_INDEX_FIELDS,
  M2_FORMAL_PERSISTENCE_TABLES
} from "../src/domain/oldProductEvaluation/formalPersistenceSchema.js";

const schemaSourcePath = "src/domain/oldProductEvaluation/formalPersistenceSchema.js";
const migrationCandidatePath =
  "docs/technical-design/sql-candidates/M2-FR-1-formal-persistence-migration-candidate-v0.1.sql";

test("M2-FR-1 formal persistence schema constants exist", () => {
  assert.equal(M2_FORMAL_PERSISTENCE_TABLES.results, "m2_evaluation_results");
  assert.equal(M2_FORMAL_PERSISTENCE_TABLES.inputSnapshots, "m2_evaluation_input_snapshots");
  assert.equal(M2_FORMAL_PERSISTENCE_TABLES.risks, "m2_evaluation_risks");
  assert.equal(M2_FORMAL_PERSISTENCE_TABLES.suggestions, "m2_evaluation_suggestions");
  assert.equal(M2_FORMAL_PERSISTENCE_TABLES.reviewItems, "m2_evaluation_review_items");
  assert.equal(M2_FORMAL_PERSISTENCE_TABLES.algorithmVersions, "m2_evaluation_algorithm_versions");
  assert.equal(M2_FORMAL_PERSISTENCE_REQUIRED_FIELDS.results.includes("standard_work_id"), true);
  assert.equal(M2_FORMAL_PERSISTENCE_REQUIRED_FIELDS.inputSnapshots.includes("input_hash"), true);
});

test("M2-FR-1 candidate version remains candidate-a", () => {
  assert.equal(
    M2_FORMAL_PERSISTENCE_CANDIDATE_VERSION,
    "m2-c3-cleaned-bill-nonformal-v0.2/candidate-a"
  );
  assert.equal(M2_FORMAL_PERSISTENCE_NONFORMAL_BOUNDARY.notForFormalDecision, true);
  assert.equal(M2_FORMAL_PERSISTENCE_NONFORMAL_BOUNDARY.formalEvaluationAllowed, false);
});

test("M2-FR-1 review status enum covers required states", () => {
  for (const status of [
    "pending",
    "approved",
    "data_fix_required",
    "waiver_granted",
    "rejected_for_formal",
    "no_action_required"
  ]) {
    assert.equal(M2_EVALUATION_REVIEW_STATUSES.includes(status), true, status);
  }
});

test("M2-FR-1 result status enum covers required states", () => {
  for (const status of ["current", "historical", "invalidated", "failed"]) {
    assert.equal(M2_EVALUATION_RESULT_STATUSES.includes(status), true, status);
  }
});

test("M2-FR-1 risk type enum distinguishes blocking advisory and warning", () => {
  assert.deepEqual(M2_EVALUATION_RISK_TYPES, ["blocking", "advisory", "warning"]);
});

test("M2-FR-1 persistence schema is constant-only and has no database connection behavior", async () => {
  const source = await readFile(schemaSourcePath, "utf8");

  for (const token of [
    "new Pool",
    "new Client",
    "connect(",
    "pg",
    "postgres://",
    "jdbc:",
    "fetch(",
    "http.request",
    "https.request",
    "child_process",
    "execFile",
    "spawn("
  ]) {
    assert.equal(source.includes(token), false, `schema source should not include ${token}`);
  }
});

test("M2-FR-1 persistence schema does not execute SQL or add runtime capabilities", async () => {
  const source = await readFile(schemaSourcePath, "utf8");

  for (const token of [
    "INSERT ",
    "UPDATE ",
    "DELETE ",
    "CREATE TABLE",
    "ALTER TABLE",
    "DROP TABLE",
    "/export",
    "evaluation-tasks",
    "local_dry_run",
    "switch_mapping_version"
  ]) {
    assert.equal(source.includes(token), false, `schema source should not include ${token}`);
  }
});

test("M2-FR-1 migration candidate is outside db migrations and covers required index fields", async () => {
  assert.equal(migrationCandidatePath.startsWith("db/migrations/"), false);
  const sql = await readFile(migrationCandidatePath, "utf8");

  assert.equal(sql.includes("MIGRATION CANDIDATE ONLY"), true);
  for (const tableName of Object.values(M2_FORMAL_PERSISTENCE_TABLES)) {
    assert.equal(sql.includes(`CREATE TABLE ${tableName}`), true, tableName);
  }
  for (const field of M2_FORMAL_PERSISTENCE_REQUIRED_INDEX_FIELDS) {
    assert.equal(sql.includes(field), true, `migration candidate should include ${field}`);
  }
});

test("M2-FR-1 migration candidate does not include real names or per-work amount samples", async () => {
  const sql = await readFile(migrationCandidatePath, "utf8");

  for (const token of [
    "SYN-WORK",
    "SYN-AUTHOR",
    "SYN-CHANNEL",
    "真实作品",
    "真实作者",
    "真实渠道",
    "作品名",
    "作者名",
    "渠道名",
    "单作品金额",
    "data/real-bills",
    "data\\\\real-bills"
  ]) {
    assert.equal(sql.includes(token), false, `migration candidate should not include ${token}`);
  }
});
