import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { promisify } from "node:util";
import {
  M2_FORMAL_READINESS_ADVISORY_REASON_CODES,
  M2_FORMAL_READINESS_BLOCKING_REASON_CODES,
  M2_FORMAL_READINESS_WARNING_CODES,
  evaluateFormalReadiness,
  summarizeFormalReadiness
} from "../src/domain/oldProductEvaluation/formalReadinessGate.js";
import {
  M2_FORMAL_READINESS_FIXTURE_ITEMS,
  getM2FormalReadinessFixture
} from "../src/fixtures/m2FormalReadinessGate.fixture.js";

const execFileAsync = promisify(execFile);
const cliScript = "scripts/check-m2-formal-readiness-fixture.mjs";
const domainSource = "src/domain/oldProductEvaluation/formalReadinessGate.js";

function resultFor(caseId) {
  return evaluateFormalReadiness(getM2FormalReadinessFixture(caseId));
}

function codes(reasons) {
  return reasons.map((item) => item.code);
}

test("M2-FR-2 fully ready synthetic work outputs ready", () => {
  const result = resultFor("fully_ready");

  assert.equal(result.readinessStatus, "ready");
  assert.equal(result.formalEvaluationAllowed, true);
  assert.deepEqual(result.blockingReasons, []);
  assert.deepEqual(result.advisoryReasons, []);
});

test("M2-FR-2 mapping version missing outputs blocked", () => {
  const result = resultFor("mapping_version_missing");

  assert.equal(result.readinessStatus, "blocked");
  assert.equal(codes(result.blockingReasons).includes("mapping_version_missing"), true);
});

test("M2-FR-2 mapping version inactive outputs blocked", () => {
  const result = resultFor("mapping_version_inactive");

  assert.equal(result.readinessStatus, "blocked");
  assert.equal(codes(result.blockingReasons).includes("mapping_version_not_active"), true);
});

test("M2-FR-2 basic info missing outputs blocked", () => {
  const result = resultFor("basic_info_missing");

  assert.equal(result.readinessStatus, "blocked");
  assert.equal(codes(result.blockingReasons).includes("basic_info_version_missing"), true);
});

test("M2-FR-2 copyright end missing outputs blocked", () => {
  const result = resultFor("copyright_end_missing");

  assert.equal(result.readinessStatus, "blocked");
  assert.equal(codes(result.blockingReasons).includes("copyright_end_missing"), true);
});

test("M2-FR-2 copyright conflict outputs blocked", () => {
  const result = resultFor("copyright_conflict");

  assert.equal(result.readinessStatus, "blocked");
  assert.equal(codes(result.blockingReasons).includes("copyright_date_conflict"), true);
});

test("M2-FR-2 blocking review pending outputs blocked", () => {
  const result = resultFor("blocking_review_pending");

  assert.equal(result.readinessStatus, "blocked");
  assert.equal(codes(result.blockingReasons).includes("blocking_review_pending"), true);
});

test("M2-FR-2 blocking review rejected outputs blocked", () => {
  const result = resultFor("blocking_review_rejected");

  assert.equal(result.readinessStatus, "blocked");
  assert.equal(codes(result.blockingReasons).includes("blocking_review_rejected"), true);
});

test("M2-FR-2 advisory-only review outputs warning_only", () => {
  const result = resultFor("advisory_only_review");

  assert.equal(result.readinessStatus, "warning_only");
  assert.equal(result.formalEvaluationAllowed, true);
  assert.equal(codes(result.advisoryReasons).includes("advisory_review_present"), true);
});

test("M2-FR-2 missing income facts outputs blocked", () => {
  const result = resultFor("missing_income_facts");

  assert.equal(result.readinessStatus, "blocked");
  assert.equal(codes(result.blockingReasons).includes("income_facts_missing"), true);
});

test("M2-FR-2 missing input snapshot outputs blocked", () => {
  const result = resultFor("missing_input_snapshot");

  assert.equal(result.readinessStatus, "blocked");
  assert.equal(codes(result.blockingReasons).includes("input_snapshot_missing"), true);
});

test("M2-FR-2 cutoff month invalid outputs blocked", () => {
  const result = resultFor("cutoff_month_invalid");

  assert.equal(result.readinessStatus, "blocked");
  assert.equal(codes(result.blockingReasons).includes("cutoff_month_invalid"), true);
});

test("M2-FR-2 candidate version mismatch outputs blocked", () => {
  const result = resultFor("candidate_version_mismatch");

  assert.equal(result.readinessStatus, "blocked");
  assert.equal(codes(result.blockingReasons).includes("candidate_version_mismatch"), true);
});

test("M2-FR-2 summarizeFormalReadiness outputs distributions", () => {
  const results = M2_FORMAL_READINESS_FIXTURE_ITEMS.map(evaluateFormalReadiness);
  const summary = summarizeFormalReadiness(results);

  assert.equal(summary.total, 15);
  assert.equal(summary.ready, 1);
  assert.equal(summary.blocked, 13);
  assert.equal(summary.warningOnly, 1);
  assert.equal(summary.formalEvaluationAllowed, false);
  assert.equal(summary.blockingReasonDistribution.mapping_version_missing, 2);
  assert.equal(summary.blockingReasonDistribution.mapping_version_not_active, 2);
  assert.equal(summary.advisoryReasonDistribution.advisory_review_present, 1);
  assert.equal(summary.requiredActionDistribution.provide_active_mapping_version, 2);
});

test("M2-FR-2 CLI outputs parseable JSON", async () => {
  const { stdout, stderr } = await execFileAsync(process.execPath, [cliScript]);
  const body = JSON.parse(stdout);

  assert.equal(stderr, "");
  assert.equal(body.status, "pass");
  assert.equal(body.mode, "fixture");
  assert.equal(body.formalEvaluationExecuted, false);
  assert.equal(body.formalEvaluationAllowed, false);
  assert.equal(body.databaseConnected, false);
  assert.equal(body.migrationExecuted, false);
  assert.equal(body.mappingVersionActivated, false);
  assert.equal(body.switchMappingVersionCalled, false);
  assert.equal(body.summary.total, 15);
  assert.equal(Array.isArray(body.examples), true);
});

test("M2-FR-2 readiness gate does not connect to a database", async () => {
  const source = await readFile(domainSource, "utf8");

  for (const token of ["new Pool", "new Client", "connect(", "postgres://", "jdbc:", "pg"]) {
    assert.equal(source.includes(token), false, `domain source should not include ${token}`);
  }
});

test("M2-FR-2 readiness gate does not read data or execute migrations", async () => {
  const source = await readFile(domainSource, "utf8");

  for (const token of ["readFile", "writeFile", "data/", "data\\\\", "db/migrations", "CREATE TABLE", "ALTER TABLE"]) {
    assert.equal(source.includes(token), false, `domain source should not include ${token}`);
  }
});

test("M2-FR-2 readiness gate does not add formal write export task or local dry-run ability", async () => {
  const source = await readFile(domainSource, "utf8");

  for (const token of ["/export", "evaluation-tasks", "local_dry_run", "switch_mapping_version"]) {
    assert.equal(source.includes(token), false, `domain source should not include ${token}`);
  }
  assert.deepEqual(M2_FORMAL_READINESS_BLOCKING_REASON_CODES, [
    "mapping_version_not_active",
    "mapping_version_missing",
    "basic_info_version_missing",
    "copyright_end_missing",
    "copyright_date_conflict",
    "blocking_review_pending",
    "blocking_review_rejected",
    "income_facts_missing",
    "input_snapshot_missing",
    "cutoff_month_invalid",
    "candidate_version_mismatch"
  ]);
  assert.equal(M2_FORMAL_READINESS_ADVISORY_REASON_CODES.includes("advisory_review_present"), true);
  assert.equal(M2_FORMAL_READINESS_WARNING_CODES.includes("export_api_not_enabled"), true);
});
