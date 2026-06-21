import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { promisify } from "node:util";
import {
  READ_ALLOWLIST,
  runReadinessCheck
} from "../scripts/check-m2-b3-no-db-readiness.mjs";

const execFileAsync = promisify(execFile);

const checkerScript = "scripts/check-m2-b3-no-db-readiness.mjs";

function assertNoSensitiveOutput(output) {
  const forbidden = [
    ["postgres", "://"].join(""),
    ["jdbc", ":"].join(""),
    ["password", "="].join(""),
    ["passwd", "="].join(""),
    "stack",
    " at ",
    ["D", ":\\\\"].join(""),
    "data/real-bills",
    "mapping_import_stage-v0.1.json",
    "mapping_import_stage-v0.2.json",
    ".env.local"
  ];

  for (const token of forbidden) {
    assert.equal(
      output.includes(token),
      false,
      `checker output must not contain sensitive token: ${token}`
    );
  }
}

test("M2-B-3.1 no-db readiness checker passes with public inputs only", async () => {
  const { stdout, stderr } = await execFileAsync(process.execPath, [checkerScript]);
  assert.equal(stderr, "");

  const body = JSON.parse(stdout);
  assert.equal(body.status, "pass");
  assert.equal(body.mode, "no-db");
  assert.equal(body.stage, "M2-B-3.1");
  assert.equal(body.readiness.designOnly, true);
  assert.equal(body.readiness.implementationAllowed, false);
  assert.equal(body.readiness.m2B32DesignValidationAllowed, true);
  assert.equal(body.readiness.m2B33PersistenceAllowed, false);
  assert.equal(body.readiness.m2CReady, false);
  assert.equal(body.readiness.m2DReady, false);
  assert.equal(body.guards.databaseConnected, false);
  assert.equal(body.guards.dockerExecuted, false);
  assert.equal(body.guards.dataDirectoryRead, false);
  assert.equal(body.guards.stageJsonRead, false);
  assert.equal(body.guards.operationsConfirmationRead, false);
  assert.equal(body.guards.dbConnectionStringRead, false);
  assert.deepEqual(body.findings, []);
  assertNoSensitiveOutput(stdout);
});

test("M2-B-3.1 no-db readiness checker allowlist excludes private inputs", async () => {
  assert.equal(READ_ALLOWLIST.some((file) => file.startsWith("data/")), false);
  assert.equal(READ_ALLOWLIST.some((file) => file.includes("/data/")), false);
  assert.equal(READ_ALLOWLIST.some((file) => file.includes("mapping_import_stage")), false);
  assert.equal(READ_ALLOWLIST.some((file) => file.endsWith(".env")), false);
  assert.equal(READ_ALLOWLIST.some((file) => file.endsWith(".env.local")), false);
  assert.equal(READ_ALLOWLIST.some((file) => file.endsWith(".pgpass")), false);

  const source = await readFile(checkerScript, "utf8");
  assert.equal(source.includes("connect("), false);
  assert.equal(source.includes("node:child_process"), false);
  assert.equal(source.includes("execFile"), false);
  assert.equal(source.includes("fetch("), false);
  assert.equal(source.includes("http.request"), false);
});

test("M2-B-3.1 no-db readiness checker reports fail with non-zero exit code", async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [checkerScript, "--simulate-failure"]),
    (error) => {
      assert.equal(error.code, 1);
      const body = JSON.parse(error.stdout);
      assert.equal(body.status, "fail");
      assert.equal(body.mode, "no-db");
      assert.equal(body.findings.length > 0, true);
      assert.equal(body.findings[0].code, "simulated_readiness_failure");
      assertNoSensitiveOutput(error.stdout);
      assert.equal(error.stderr, "");
      return true;
    }
  );
});

test("M2-B-3.1 no-db readiness checker direct API returns pass", async () => {
  const body = await runReadinessCheck();
  assert.equal(body.status, "pass");
  assert.equal(body.guards.realDataRead, false);
  assert.equal(body.guards.localDryRunModeAdded, false);
  assert.equal(body.blockedNext.includes("M2-C formal readiness"), true);
});
