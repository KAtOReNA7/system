import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import {
  GENERATED_REPORT_PATH,
  GENERATED_SUMMARY_PATH,
  GENERATOR_READ_ALLOWLIST,
  generateNoDbValidationReport
} from "../scripts/generate-m2-b3-no-db-validation-report.mjs";

const execFileAsync = promisify(execFile);
const generatorScript = "scripts/generate-m2-b3-no-db-validation-report.mjs";

function forbiddenOutputTokens() {
  return [
    ["postgres", "://"].join(""),
    ["jdbc", ":"].join(""),
    ["password", "="].join(""),
    ["passwd", "="].join(""),
    "stack trace:",
    " at ",
    ["D", ":\\\\"].join(""),
    "data/real-bills",
    "mapping_import_stage-v0.1.json body",
    "mapping_import_stage-v0.2.json body",
    ".env.local="
  ];
}

function assertNoSensitiveOutput(output) {
  for (const token of forbiddenOutputTokens()) {
    assert.equal(output.includes(token), false, `output must not contain ${token}`);
  }
}

test("M2-B-3.2a generator writes report and summary to a target directory", async () => {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), "m2-b3-report-"));
  const generatedAt = "2026-06-22T00:00:00.000Z";
  const { stdout, stderr } = await execFileAsync(process.execPath, [
    generatorScript,
    "--output-root",
    outputRoot,
    "--generated-at",
    generatedAt
  ]);

  assert.equal(stderr, "");
  const body = JSON.parse(stdout);
  assert.equal(body.status, "pass");
  assert.equal(body.mode, "no-db");
  assert.equal(body.stage, "M2-B-3.2a");
  assert.equal(body.checkerExecuted, true);
  assert.equal(body.checkerPassed, true);
  assert.equal(body.localDryRunExecuted, false);
  assert.equal(body.databaseConnected, false);
  assert.equal(body.dockerExecuted, false);
  assert.equal(body.stageJsonRead, false);
  assert.equal(body.realDataRead, false);
  assert.equal(body.m2CReady, false);
  assert.equal(body.m2DReady, false);
  assertNoSensitiveOutput(stdout);

  const report = await readFile(path.join(outputRoot, ...GENERATED_REPORT_PATH.split("/")), "utf8");
  const summary = JSON.parse(
    await readFile(path.join(outputRoot, ...GENERATED_SUMMARY_PATH.split("/")), "utf8")
  );

  assert.match(report, /no-db/);
  assert.match(report, /fixture\/synthetic/);
  assert.match(report, /local dry-run executed: false/);
  assert.match(report, /not for formal business decision: true/);
  assert.equal(summary.status, "pass");
  assert.equal(summary.mode, "no-db");
  assert.equal(summary.localDryRunExecuted, false);
  assertNoSensitiveOutput(report);
});

test("M2-B-3.2a generator API can run without writing output", async () => {
  const body = await generateNoDbValidationReport({
    dryRun: true,
    generatedAt: "2026-06-22T00:00:00.000Z"
  });
  assert.equal(body.status, "pass");
  assert.equal(body.checkerExecuted, true);
  assert.equal(body.checkerPassed, true);
  assert.equal(body.m2B32bRecommended, true);
  assert.equal(body.m2B33Recommended, false);
});

test("M2-B-3.2a generator allowlist excludes private inputs", () => {
  assert.equal(GENERATOR_READ_ALLOWLIST.some((file) => file.startsWith("data/")), false);
  assert.equal(GENERATOR_READ_ALLOWLIST.some((file) => file.includes("/data/")), false);
  assert.equal(GENERATOR_READ_ALLOWLIST.some((file) => file.includes("mapping_import_stage")), false);
  assert.equal(GENERATOR_READ_ALLOWLIST.some((file) => file.endsWith(".env")), false);
  assert.equal(GENERATOR_READ_ALLOWLIST.some((file) => file.endsWith(".env.local")), false);
  assert.equal(GENERATOR_READ_ALLOWLIST.some((file) => file.endsWith(".pgpass")), false);
});

test("M2-B-3.2a generator fails when readiness checker fails", async () => {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), "m2-b3-report-fail-"));
  await assert.rejects(
    execFileAsync(process.execPath, [
      generatorScript,
      "--simulate-checker-failure",
      "--output-root",
      outputRoot
    ]),
    (error) => {
      assert.equal(error.code, 1);
      const body = JSON.parse(error.stdout);
      assert.equal(body.status, "fail");
      assert.equal(body.checkerExecuted, true);
      assert.equal(body.checkerPassed, false);
      assert.equal(body.generatedReportPath, null);
      assert.equal(body.generatedSummaryPath, null);
      assert.equal(body.findings.length > 0, true);
      assertNoSensitiveOutput(error.stdout);
      assert.equal(error.stderr, "");
      return true;
    }
  );
});
