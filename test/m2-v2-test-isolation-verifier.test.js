import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  evaluateIsolationOrdering,
  parseTapSkipEvidence,
  resolveDefaultNpmTestCommand,
} from "../scripts/m2-v2-evidence-pilot/m2_v2_pr7_s0_contract.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const verifierPath = join(
  repositoryRoot,
  "scripts/m2-v2-evidence-pilot/verify_m2_v2_test_isolation.mjs",
);
const fixtures = new Set();

test.afterEach(() => {
  for (const fixture of fixtures) {
    if (existsSync(fixture)) rmSync(fixture, { recursive: true, force: true });
  }
  fixtures.clear();
});

test("synthetic isolation proof passes when every observed state is unchanged", () => {
  const fixture = createFixture();
  const result = runVerifier(fixture, [process.execPath, "-e", "process.exit(0)"]);

  assert.equal(result.status, 0);
  assert.equal(result.payload.passed, true);
  assert.equal(result.payload.proofScope, "synthetic_fixture");
  assert.equal(result.payload.childPassed, true);
  assert.equal(result.payload.defaultTestCommand.actualExecutable, process.execPath);
  assert.deepEqual(result.payload.defaultTestCommand.argv, ["<synthetic-command-redacted>"]);
  assert.equal(result.payload.defaultTestCommand.argvCount, 2);
  assert.equal(result.payload.defaultTestCommand.syntheticArgvRedacted, true);
  assertAllComparisons(result.payload, true);
});

test("synthetic isolation proof detects tracked content and metadata mutation", () => {
  const fixture = createFixture();
  const command = [
    process.execPath,
    "-e",
    "require('node:fs').appendFileSync('tracked.txt', 'changed')",
  ];
  const result = runVerifier(fixture, command);

  assert.equal(result.status, 1);
  assert.equal(result.payload.passed, false);
  assert.equal(result.payload.childPassed, true);
  assert.equal(result.payload.trackedContentUnchanged, false);
  assert.equal(result.payload.trackedMetadataUnchanged, false);
  assert.equal(result.payload.gitStatusUnchanged, false);
});

test("synthetic isolation proof detects governed private mutation without disclosing content", () => {
  const fixture = createFixture();
  const privateCanary = "PRIVATE_CANARY_MUST_NOT_APPEAR";
  const command = [
    process.execPath,
    "-e",
    `require('node:fs').appendFileSync('data/private-output/state.json', '${privateCanary}')`,
  ];
  const result = runVerifier(fixture, command);

  assert.equal(result.status, 1);
  assert.equal(result.payload.governedPrivateContentUnchanged, false);
  assert.equal(result.payload.governedPrivateMetadataUnchanged, false);
  assert.equal(result.combinedOutput.includes(privateCanary), false);
  assert.equal(result.combinedOutput.includes("state.json"), false);
});

test("synthetic isolation proof detects governed private-input mutation", () => {
  const fixture = createFixture();
  const command = [
    process.execPath,
    "-e",
    "require('node:fs').appendFileSync('data/private-input/input.json', 'changed')",
  ];
  const result = runVerifier(fixture, command);

  assert.equal(result.status, 1);
  assert.equal(result.payload.governedPrivateContentUnchanged, false);
  assert.equal(result.payload.governedPrivateMetadataUnchanged, false);
});

test("synthetic isolation proof detects content mutation of an existing nonignored untracked file", () => {
  const fixture = createFixture({ withUntrackedFile: true });
  const command = [
    process.execPath,
    "-e",
    "require('node:fs').appendFileSync('untracked.txt', 'changed')",
  ];
  const result = runVerifier(fixture, command);

  assert.equal(result.status, 1);
  assert.equal(result.payload.gitStatusUnchanged, true);
  assert.equal(result.payload.nonIgnoredUntrackedContentUnchanged, false);
  assert.equal(result.payload.nonIgnoredUntrackedMetadataUnchanged, false);
});

test("child failure output is suppressed and the verifier fails closed", () => {
  const fixture = createFixture();
  const childCanary = "CHILD_OUTPUT_PRIVATE_CANARY";
  const command = [
    process.execPath,
    "-e",
    `process.stdout.write('${childCanary}'); process.stderr.write('${childCanary}'); process.exit(7)`,
  ];
  const result = runVerifier(fixture, command);

  assert.equal(result.status, 1);
  assert.equal(result.payload.passed, false);
  assert.equal(result.payload.childExitCode, 7);
  assert.equal(result.payload.childFailureEvidence.stdoutBytes > 0, true);
  assert.match(result.payload.childFailureEvidence.stdoutSha256, /^[0-9a-f]{64}$/u);
  assert.equal(result.combinedOutput.includes(childCanary), false);
});

test("runtime skip evidence requires TAP summary and exact identities", () => {
  const zero = parseTapSkipEvidence("TAP version 13\n1..1\n# tests 1\n# pass 1\n# fail 0\n# skipped 0\n");
  assert.equal(zero.summaryPresent, true);
  assert.equal(zero.totalSkips, 0);
  assert.equal(zero.identityCountMatchesSummary, true);

  const skipped = parseTapSkipEvidence("TAP version 13\nok 1 - dynamic case # SKIP synthetic reason\n1..1\n# skipped 1\n");
  assert.equal(skipped.totalSkips, 1);
  assert.deepEqual(skipped.identities, [{ name: "dynamic case", reason: "synthetic reason" }]);
  assert.equal(skipped.identityCountMatchesSummary, true);

  const specReporter = parseTapSkipEvidence("﹣ dynamic case (synthetic reason)\nℹ skipped 1\n");
  assert.equal(specReporter.summaryPresent, false);
  assert.equal(specReporter.totalSkips, 0);
});

test("Windows default test command resolves npm through Node without shell or npm.cmd", () => {
  const explicit = resolveDefaultNpmTestCommand({
    platform: "win32",
    nodeExecutable: "C:\\Node\\node.exe",
    npmExecPath: "C:\\npm\\npm-cli.js",
    pathExists: (path) => path === "C:\\npm\\npm-cli.js",
  });
  assert.deepEqual(explicit, ["C:\\Node\\node.exe", "C:\\npm\\npm-cli.js", "test"]);

  const bundled = resolveDefaultNpmTestCommand({
    platform: "win32",
    nodeExecutable: "C:\\Node\\node.exe",
    npmExecPath: "",
    pathExists: (path) => path.endsWith("node_modules\\npm\\bin\\npm-cli.js"),
  });
  assert.equal(bundled[0], "C:\\Node\\node.exe");
  assert.match(bundled[1], /node_modules\\npm\\bin\\npm-cli\.js$/u);
  assert.equal(bundled.includes("npm.cmd"), false);

  assert.throws(
    () => resolveDefaultNpmTestCommand({
      platform: "win32",
      nodeExecutable: "C:\\Node\\node.exe",
      npmExecPath: "",
      pathExists: () => false,
    }),
    /windows_npm_cli_unavailable_without_shell/u,
  );
});

test("synthetic isolation proof detects full user-ref mutation", () => {
  const fixture = createFixture();
  const command = [
    process.execPath,
    "-e",
    "require('node:child_process').execFileSync('git', ['tag', 'isolation-ref-mutation'])",
  ];
  const result = runVerifier(fixture, command);

  assert.equal(result.status, 1);
  assert.equal(result.payload.userRefsUnchanged, false);
  assert.equal(result.payload.systemRefsUnchanged, true);
});

test("synthetic isolation proof detects provider counter mutation", () => {
  const fixture = createFixture();
  const command = [
    process.execPath,
    "-e",
    "require('node:fs').writeFileSync(process.env.M2_V2_S0_PROVIDER_COUNTER_FILE, '1\\n')",
  ];
  const result = runVerifier(fixture, command);

  assert.equal(result.status, 1);
  assert.equal(result.payload.providerCounterBefore, 0);
  assert.equal(result.payload.providerCounterAfter, 1);
  assert.equal(result.payload.providerRequestDelta, 1);
});

test("isolation CLI rejects a nonempty inherited provider environment without echoing its value", () => {
  const fixture = createFixture();
  const secretCanary = "S0_ENV_VALUE_MUST_NOT_APPEAR";
  const result = runVerifier(
    fixture,
    [process.execPath, "-e", "process.exit(0)"],
    [],
    {
      OPENAI_API_KEY: secretCanary,
      // Exercise the isolation CLI's own fail-closed preflight even when the
      // parent default chain is already protected by the preload sentinel.
      M2_V2_S0_SENTINEL_AUTO_INSTALL: "0",
    },
  );

  assert.equal(result.status, 1);
  assert.equal(result.payload.failureStage, "preflight_failed");
  assert.equal(result.combinedOutput.includes(secretCanary), false);
});

test("isolation ordering rejects a before snapshot recorded after test start", () => {
  assert.throws(() => evaluateIsolationOrdering({
    defaultTestChainInvocationCount: 1,
    events: [
      { eventId: "default_test_start", sequence: 1 },
      { eventId: "before_snapshot_complete", sequence: 2 },
      { eventId: "default_test_finish", sequence: 3 },
      { eventId: "after_snapshot_complete", sequence: 4 },
    ],
  }), /before_snapshot_does_not_precede_default_test/u);
});

test("isolation ordering rejects two default test chain invocations", () => {
  assert.throws(() => evaluateIsolationOrdering({
    defaultTestChainInvocationCount: 2,
    events: [
      { eventId: "before_snapshot_complete", sequence: 1 },
      { eventId: "default_test_start", sequence: 2 },
      { eventId: "default_test_finish", sequence: 3 },
      { eventId: "after_snapshot_complete", sequence: 4 },
    ],
  }), /default_test_chain_invocation_count_must_equal_one/u);
});

test("optional ignored receipt is written only after a successful comparison", () => {
  const fixture = createFixture();
  const receipt = "data/private-output/m2-v2-pr7-p1-remediation/isolation-proof.json";
  const result = runVerifier(
    fixture,
    [process.execPath, "-e", "process.exit(0)"],
    ["--receipt", receipt],
  );

  assert.equal(result.status, 0);
  assert.equal(result.payload.passed, true);
  assert.equal(result.payload.receiptWrittenAfterComparison, true);
  assert.equal(existsSync(join(fixture, receipt)), true);
  const receiptPayload = JSON.parse(readFileSync(join(fixture, receipt), "utf8"));
  assert.equal(receiptPayload.passed, true);
  assert.equal(receiptPayload.receiptWrittenAfterComparison, true);
  assert.equal(
    receiptPayload.before.governedPrivateContentDigest,
    receiptPayload.after.governedPrivateContentDigest,
  );
});

function createFixture({ withUntrackedFile = false } = {}) {
  const fixture = mkdtempSync(join(tmpdir(), "m2-v2-isolation-synthetic-"));
  fixtures.add(fixture);
  mkdirSync(join(fixture, "data/private-input"), { recursive: true });
  mkdirSync(join(fixture, "data/private-output"), { recursive: true });
  writeFileSync(join(fixture, ".gitignore"), "data/private-input/\ndata/private-output/\n", "utf8");
  writeFileSync(join(fixture, "tracked.txt"), "tracked\n", "utf8");
  writeFileSync(join(fixture, "data/private-input/input.json"), "{\"input\":\"synthetic\"}\n", "utf8");
  writeFileSync(join(fixture, "data/private-output/state.json"), "{\"state\":\"synthetic\"}\n", "utf8");
  git(fixture, ["init", "--quiet"]);
  git(fixture, ["config", "user.name", "Isolation Test"]);
  git(fixture, ["config", "user.email", "isolation@example.invalid"]);
  git(fixture, ["add", "--", ".gitignore", "tracked.txt"]);
  git(fixture, ["commit", "--quiet", "-m", "synthetic fixture"]);
  if (withUntrackedFile) writeFileSync(join(fixture, "untracked.txt"), "untracked\n", "utf8");
  return fixture;
}

function runVerifier(fixture, command, extraArgs = [], environment = {}) {
  const child = spawnSync(process.execPath, [
    verifierPath,
    "--synthetic-fixture",
    "--root",
    fixture,
    "--private-root",
    "data/private-input",
    "--private-root",
    "data/private-output",
    "--command-json",
    JSON.stringify(command),
    ...extraArgs,
  ], {
    cwd: repositoryRoot,
    env: { ...process.env, ...environment },
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
  });
  const combinedOutput = `${child.stdout ?? ""}${child.stderr ?? ""}`;
  assert.doesNotThrow(() => JSON.parse(child.stdout), combinedOutput);
  return {
    status: child.status,
    payload: JSON.parse(child.stdout),
    combinedOutput,
  };
}

function assertAllComparisons(payload, expected) {
  for (const field of [
    "trackedContentUnchanged",
    "trackedMetadataUnchanged",
    "governedPrivateContentUnchanged",
    "governedPrivateMetadataUnchanged",
    "gitStatusUnchanged",
    "nonIgnoredUntrackedContentUnchanged",
    "nonIgnoredUntrackedMetadataUnchanged",
    "userRefsUnchanged",
    "systemRefsUnchanged",
  ]) {
    assert.equal(payload[field], expected, field);
  }
}

function git(cwd, args) {
  execFileSync("git", args, { cwd, stdio: "ignore", windowsHide: true });
}
