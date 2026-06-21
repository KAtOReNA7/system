import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import {
  DEFAULT_MANIFEST_PATH,
  validateLocalDryRunManifest
} from "../scripts/validate-m2-local-dry-run-manifest.mjs";

const execFileAsync = promisify(execFile);
const validatorScript = "scripts/validate-m2-local-dry-run-manifest.mjs";

function forbiddenOutputTokens() {
  return [
    ["postgres", "://"].join(""),
    ["postgresql", "://"].join(""),
    ["jdbc", ":"].join(""),
    ["pass", "word", "="].join(""),
    "stack trace",
    " at ",
    ["D", ":", "\\"].join(""),
    "data/real-bills",
    "mapping_import_stage-v0.1.json",
    "mapping_import_stage-v0.2.json",
    ".env.local",
    "host="
  ];
}

function assertNoSensitiveOutput(output) {
  for (const token of forbiddenOutputTokens()) {
    assert.equal(output.toLowerCase().includes(token.toLowerCase()), false, `output leaked ${token}`);
  }
}

async function readFixtureManifest() {
  return JSON.parse(await readFile(DEFAULT_MANIFEST_PATH, "utf8"));
}

async function writeManifest(manifest) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "m2-manifest-validator-"));
  const file = path.join(dir, "manifest.fixture.json");
  await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return file;
}

async function runValidator(args = []) {
  const { stdout, stderr } = await execFileAsync(process.execPath, [validatorScript, ...args]);
  assert.equal(stderr, "");
  assertNoSensitiveOutput(stdout);
  return JSON.parse(stdout);
}

async function runValidatorExpectFailure(args = []) {
  await assert.rejects(
    execFileAsync(process.execPath, [validatorScript, ...args]),
    (error) => {
      assert.equal(error.code, 1);
      assert.equal(error.stderr, "");
      assertNoSensitiveOutput(error.stdout);
      const body = JSON.parse(error.stdout);
      assert.equal(body.status, "fail");
      assert.equal(body.mode, "no-db");
      assert.equal(body.stage, "M2-B-3.2b");
      assert.equal(Array.isArray(body.findings), true);
      assert.equal(body.findings.length > 0, true);
      return true;
    }
  );
}

test("M2-B-3.2b validator default sanitized manifest passes", async () => {
  const body = await runValidator();
  assert.equal(body.status, "pass");
  assert.equal(body.mode, "no-db");
  assert.equal(body.stage, "M2-B-3.2b");
  assert.equal(body.manifestPathType, "sanitized-fixture");
  assert.equal(body.sourceCount, 2);
  assert.equal(body.metadataOnly, true);
  assert.equal(body.sourceFileBodyRead, false);
  assert.equal(body.stageJsonBodyRead, false);
  assert.equal(body.operationsConfirmationBodyRead, false);
  assert.equal(body.databaseConnected, false);
  assert.equal(body.dockerExecuted, false);
  assert.equal(body.realDataRead, false);
  assert.equal(body.dataDirectoryRead, false);
  assert.equal(body.envLocalRead, false);
  assert.equal(body.dbConnectionStringRead, false);
  assert.equal(body.localDryRunExecuted, false);
  assert.equal(body.m2CReady, false);
  assert.equal(body.m2DReady, false);
  assert.deepEqual(body.findings, []);
});

test("M2-B-3.2b validator direct API passes without source file reads", async () => {
  const manifest = await readFixtureManifest();
  manifest.sources[0].sourcePath = "synthetic-source-body.json";
  const file = await writeManifest(manifest);

  const body = await validateLocalDryRunManifest({ manifest: file });
  assert.equal(body.status, "pass");
  assert.equal(body.manifestPathType, "provided-manifest");
  assert.equal(body.sourceFileBodyRead, false);
  assert.equal(body.localDryRunExecuted, false);
});

test("M2-B-3.2b validator fails for sourcePath pointing at data", async () => {
  const manifest = await readFixtureManifest();
  manifest.sources[0].sourcePath = "data/private-stage-summary.json";
  await runValidatorExpectFailure(["--manifest", await writeManifest(manifest)]);
});

test("M2-B-3.2b validator fails for absolute path metadata", async () => {
  const manifest = await readFixtureManifest();
  manifest.sources[0].sourcePath = ["D", ":", "\\", "private", "\\", "stage.json"].join("");
  await runValidatorExpectFailure(["--manifest", await writeManifest(manifest)]);
});

test("M2-B-3.2b validator fails for stage body or row payload fields", async () => {
  const stageBodyManifest = await readFixtureManifest();
  stageBodyManifest.stageJsonBody = { sample: "not allowed" };
  await runValidatorExpectFailure(["--manifest", await writeManifest(stageBodyManifest)]);

  for (const key of ["records", "rows", "sampleRows"]) {
    const manifest = await readFixtureManifest();
    manifest[key] = [];
    await runValidatorExpectFailure(["--manifest", await writeManifest(manifest)]);
  }
});

test("M2-B-3.2b validator fails for connection strings and secrets", async () => {
  const manifest = await readFixtureManifest();
  manifest.connectionString = ["postgres", "://", "example.invalid"].join("");
  manifest.databaseUrl = ["jdbc", ":", "example"].join("");
  manifest.password = "redacted";
  manifest.token = "redacted";
  await runValidatorExpectFailure(["--manifest", await writeManifest(manifest)]);
});

test("M2-B-3.2b validator fails for invalid content hash", async () => {
  const manifest = await readFixtureManifest();
  manifest.sources[0].contentHashSha256 = "ABC";
  await runValidatorExpectFailure(["--manifest", await writeManifest(manifest)]);
});

test("M2-B-3.2b validator fails when rangeSummary declares real data", async () => {
  const manifest = await readFixtureManifest();
  manifest.sources[0].rangeSummary.containsRealAmounts = true;
  await runValidatorExpectFailure(["--manifest", await writeManifest(manifest)]);
});

test("M2-B-3.2b validator simulate failure returns non-zero", async () => {
  await runValidatorExpectFailure(["--simulate-failure"]);
});

test("M2-B-3.2b validator source has no DB Docker network or subprocess entrypoint", async () => {
  const source = await readFile(validatorScript, "utf8");
  assert.equal(source.includes("node:child_process"), false);
  assert.equal(source.includes("execFile"), false);
  assert.equal(source.includes("spawn("), false);
  assert.equal(source.includes("connect("), false);
  assert.equal(source.includes("new Pool"), false);
  assert.equal(source.includes("new Client"), false);
  assert.equal(source.includes("fetch("), false);
  assert.equal(source.includes("http.request"), false);
  assert.equal(source.includes("https.request"), false);
});
