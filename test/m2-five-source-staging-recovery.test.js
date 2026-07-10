import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readinessReport =
  "docs/analysis/m2-real-data/M2-post-foundation-readiness-rerun-v1.json";

test("five-source staging contract rejects presence-only and incomplete artifacts", () => {
  const output = execFileSync(
    "python",
    [
      "scripts/m2-real-data/m2_five_source_staging_contract.py",
      "--fixture-self-test"
    ],
    { encoding: "utf8" }
  );
  const result = JSON.parse(output);

  assert.equal(result.fixtureSelfTest, true);
  assert.equal(result.incompleteArtifactRejected, true);
  assert.equal(result.declarationGuardPresent, true);
  assert.equal(result.distributionGuardPresent, true);
  assert.equal(result.noDatabaseWrite, true);
  assert.equal(result.noFormalMasterDataWrite, true);
});

test("post-foundation gate requires a contract-verified private input", async () => {
  const report = JSON.parse(await readFile(readinessReport, "utf8"));
  const privateInput = report.evaluationInputSnapshot.fiveSourcePrivateInput;

  assert.equal(privateInput.providedForThisRun, true);
  assert.equal(privateInput.contractVerified, false);
  assert.equal(privateInput.usedByEvaluation, false);
  assert.ok(privateInput.contractIssues.length > 0);
  assert.ok(
    report.gate.hardBlockers.includes(
      "verified_private_per_work_input_snapshot_not_available"
    )
  );
  assert.equal(report.gate.m2FormalComplete, false);
  assert.equal(report.gate.m3FormalExecutionAllowed, false);
});

test("five-source recovery stays private and adds no formal write capability", async () => {
  const sources = await Promise.all([
    readFile("scripts/m2-real-data/run_m2_five_source_staging_recovery.py", "utf8"),
    readFile("scripts/m2-real-data/m2_five_source_staging_contract.py", "utf8")
  ]);

  for (const source of sources) {
    for (const forbidden of [
      "psycopg",
      "postgres://",
      "postgresql://",
      "switch_mapping_version",
      "CREATE TABLE",
      "ALTER TABLE",
      "db/migrations"
    ]) {
      assert.equal(source.includes(forbidden), false, `source includes ${forbidden}`);
    }
  }
  assert.match(sources[0], /private-output/);
  assert.match(sources[0], /write-incomplete-candidate/);
  assert.match(sources[1], /artifact_not_declared_verified/);
});
