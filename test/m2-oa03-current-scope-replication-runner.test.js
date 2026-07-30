import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  resolveM2Oa03RuntimeAuthorizationRecovery,
  runM2Oa03CurrentScopePublicDiagnostic,
  suppressM2Oa03BootstrapForPublic,
  verifyM2Oa03GitAndCiPreflight
} from "../scripts/m2-current/oa03_current_scope_replication_mode.mjs";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, "..");
const HEAD = "1234567890abcdef1234567890abcdef12345678";

test("OA03 public diagnostic is portable and does not read private outcomes", async () => {
  const result = await runM2Oa03CurrentScopePublicDiagnostic({
    root: REPO_ROOT,
    verify: true
  });
  assert.equal(
    [
      "OA03_P1_PUBLIC_IMPLEMENTATION_READY",
      "OA03_PUBLIC_AGGREGATES_VALID"
    ].includes(result.status),
    true
  );
  assert.equal(result.privateSourceReadByDiagnostic, false);
  assert.equal(
    result.privateEvaluationPerformed,
    result.status === "OA03_PUBLIC_AGGREGATES_VALID"
  );
  assert.equal(result.deterministicReplay, true);
  assert.equal(result.exactCentAllocation, true);
});

test("OA03 runtime authorization resolves PR, SHA and dual CI dynamically", () => {
  const result = verifyM2Oa03GitAndCiPreflight({
    root: REPO_ROOT,
    command: (_root, executable, args) => {
      const key = `${executable} ${args.join(" ")}`;
      const outputs = new Map([
        ["git status --porcelain --untracked-files=all", ""],
        ["git rev-parse HEAD", `${HEAD}\n`],
        ["git rev-parse @{upstream}", `${HEAD}\n`],
        [
          "git branch --show-current",
          "codex/m2-oa03-current-scope-replication-v0-1\n"
        ],
        [
          "gh pr view --json number,state,isDraft,mergedAt,headRefOid,baseRefName,url",
          JSON.stringify({
            number: 987,
            state: "OPEN",
            isDraft: true,
            mergedAt: null,
            headRefOid: HEAD,
            baseRefName: "main",
            url: "https://example.invalid/pull/987"
          })
        ],
        [
          `gh run list --commit ${HEAD} --event pull_request --limit 20 --json databaseId,headSha,status,conclusion,workflowName,url`,
          JSON.stringify([{
            databaseId: 654,
            headSha: HEAD,
            status: "completed",
            conclusion: "success",
            workflowName: "CI",
            url: "https://example.invalid/actions/runs/654"
          }])
        ],
        [
          "gh run view 654 --json headSha,status,conclusion,jobs,url",
          JSON.stringify({
            headSha: HEAD,
            status: "completed",
            conclusion: "success",
            url: "https://example.invalid/actions/runs/654",
            jobs: [
              {name: "verify", conclusion: "success"},
              {name: "verify-windows", conclusion: "success"}
            ]
          })
        ]
      ]);
      assert.equal(outputs.has(key), true, key);
      return {stdout: outputs.get(key)};
    }
  });
  assert.equal(result.head, HEAD);
  assert.equal(result.prNumber, 987);
  assert.equal(result.ciRunId, 654);
  assert.equal(result.linux, "success");
  assert.equal(result.windows, "success");
});

test("OA03 runtime authorization rejects an unexpected dirty path", () => {
  assert.throws(
    () => verifyM2Oa03GitAndCiPreflight({
      root: REPO_ROOT,
      command: () => ({stdout: " M unrelated-user-file.txt\n"})
    }),
    /m2_oa03_unexpected_dirty_worktree/u
  );
});

test("OA03 public bootstrap suppression preserves a legal null", () => {
  assert.equal(suppressM2Oa03BootstrapForPublic(undefined), null);
  assert.deepEqual(
    suppressM2Oa03BootstrapForPublic({
      status: "COMPUTED",
      iterations: 2000,
      seed: 20260728,
      workCount: 42,
      relativeWapeImprovement95: {lower: -0.1, upper: 0.2}
    }),
    {
      status: "COMPUTED",
      iterations: 2000,
      seed: 20260728,
      workCount: 42,
      intervals: null
    }
  );
});

test("OA03 authorization rotates only after a result-free technical failure", () => {
  const priorAuthorization = {
    schema: "m2.current.oa03_runtime_authorization.private.v0.1",
    status: "AUTHORIZED_FOR_ONE_LOGICAL_EXECUTION",
    experimentId: "M2-EXP-OA03-CURRENT-SCOPE-REPLICATION-01",
    capabilityId: "m2-oa03-current-scope-replication",
    executionHead: HEAD,
    branch: "codex/m2-oa03-current-scope-replication-v0-1",
    prNumber: 987,
    exactHeadCiRunId: 654
  };
  const priorReceipt = {
    schema: "m2.current.oa03_attempt_receipt.private.v0.1",
    experimentId: "M2-EXP-OA03-CURRENT-SCOPE-REPLICATION-01",
    attemptId: "attempt-001",
    status: "INFRASTRUCTURE_FAILURE_BEFORE_RESULT_RETRY_ALLOWED",
    technicalStatus:
      "OA03_CURRENT_SCOPE_REPLICATION_INFRASTRUCTURE_FAILURE_BEFORE_RESULT",
    executionHead: HEAD,
    exactHeadCiRunId: 654,
    validCompleteInterpretableResultProduced: false,
    retryAllowed: true,
    formulaOrParameterChangeAllowedOnRetry: false
  };
  const preflight = {
    branch: priorAuthorization.branch,
    prNumber: priorAuthorization.prNumber
  };
  assert.deepEqual(
    resolveM2Oa03RuntimeAuthorizationRecovery({
      priorAuthorization,
      priorReceipt,
      preflight
    }),
    {
      priorAttemptId: "attempt-001",
      priorExecutionHead: HEAD,
      priorExactHeadCiRunId: 654
    }
  );
  assert.throws(
    () => resolveM2Oa03RuntimeAuthorizationRecovery({
      priorAuthorization,
      priorReceipt: {
        ...priorReceipt,
        validCompleteInterpretableResultProduced: true,
        retryAllowed: false
      },
      preflight
    }),
    /m2_oa03_runtime_authorization_conflict/u
  );
});

test("OA03 commands are registered once with public and restricted lifecycles", () => {
  const packageJson = readJson("package.json");
  const lifecycle = readJson("config/command-lifecycle.v0.1.json");
  assert.equal(
    packageJson.scripts["diagnose:m2:oa03-current-scope-replication"],
    "node scripts/m2-current/run_m2_human_anchored_development.mjs "
      + "--oa03-current-scope-public"
  );
  assert.match(
    packageJson.scripts[
      "prepare:m2:current:oa03-current-scope-replication"
    ],
    /--oa03-current-scope-prepare$/u
  );
  assert.match(
    packageJson.scripts[
      "develop:m2:current:oa03-current-scope-replication"
    ],
    /--oa03-current-scope-replication$/u
  );
  assert.equal(
    lifecycle.currentPublicCommands.includes(
      "diagnose:m2:oa03-current-scope-replication"
    ),
    true
  );
  assert.equal(
    lifecycle.restrictedPrefixes.some((prefix) => (
      "prepare:m2:current:oa03-current-scope-replication"
        .startsWith(prefix)
    )),
    true
  );
  assert.equal(
    lifecycle.restrictedPrefixes.some((prefix) => (
      "develop:m2:current:oa03-current-scope-replication"
        .startsWith(prefix)
    )),
    true
  );
});

test("OA03 implementation contains no machine path, fixed execution SHA or fixed PR gate", () => {
  const files = [
    "config/m2-current-oa03-replication.v0.1.json",
    "scripts/m2-current/oa03_current_scope_replication_mode.mjs",
    "scripts/m2-current/materialize_human_anchored_cases.py",
    "src/domain/m2Current/oa03CurrentScopeReplication.js"
  ];
  for (const file of files) {
    const source = readFileSync(path.join(REPO_ROOT, file), "utf8");
    assert.doesNotMatch(
      source.replaceAll("https://", ""),
      /[A-Za-z]:[\\/]/u,
      file
    );
    assert.doesNotMatch(
      source,
      /\/(?:home|Users|private|tmp|var)(?:\/|\\)/u,
      file
    );
  }
  const mode = readFileSync(
    path.join(
      REPO_ROOT,
      "scripts/m2-current/oa03_current_scope_replication_mode.mjs"
    ),
    "utf8"
  );
  assert.doesNotMatch(mode, /["'][0-9a-f]{40}["']/u);
  assert.doesNotMatch(mode, /pr\.number\s*!==\s*\d+/u);
});

test("OA03 Python materializer exposes deterministic fixture and private rebuild modes", () => {
  const source = readFileSync(
    path.join(
      REPO_ROOT,
      "scripts/m2-current/materialize_human_anchored_cases.py"
    ),
    "utf8"
  );
  assert.match(source, /--oa03-base-self-test/u);
  assert.match(source, /--oa03-base-materialize/u);
  assert.match(source, /OA03_BASE_MATERIALIZATION_SELF_TEST_PASSED/u);
  assert.match(source, /OA03_BASE_MATERIALIZATION_COMPLETE/u);
});

test("OA03 trailing-12 uses the existing canonical allocation implementation", () => {
  const source = readFileSync(
    path.join(
      REPO_ROOT,
      "src/domain/m2Current/oa03CurrentScopeReplication.js"
    ),
    "utf8"
  );
  assert.match(source, /allocateM2CoreLegacyChannelShares/u);
  assert.doesNotMatch(source, /function largestRemainderAllocation/u);
  const config = readJson(
    "config/m2-current-oa03-replication.v0.1.json"
  );
  assert.deepEqual(
    {
      implementation:
        config.channelAllocation.canonicalImplementation,
      function: config.channelAllocation.canonicalFunction,
      armId: config.channelAllocation.canonicalArmId
    },
    {
      implementation:
        "src/domain/m2Current/coreLegacyChannelAllocation.js",
      function: "allocateM2CoreLegacyChannelShares",
      armId: "C3_TRAILING_12"
    }
  );
});

function readJson(file) {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, file), "utf8"));
}
