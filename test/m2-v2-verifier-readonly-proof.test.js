import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import {
  buildAuthorityPhysicalMapping,
  deriveCanonicalAuthorityGraphV0_3,
} from "../src/domain/m2V2EvidencePilot/authorityGraph.js";
import {
  compareReadonlySnapshotsV0_2,
  deriveReadonlyScopeV0_2,
  runReadonlyProofV0_2,
  snapshotHostNativeReadonlyScopeV0_2ForTests,
  snapshotReadonlyScopeV0_2,
  runSyntheticReadonlyProofV0_2ForTests,
  snapshotSyntheticReadonlyScopeV0_2ForTests,
} from "../scripts/m2-v2-evidence-pilot/prove_m2_v2_verifier_readonly.mjs";
import {
  advanceReadonlyScenario,
  buildReadonlyProofFixture,
  mutateReadonlyCase,
} from "./helpers/m2V2Pr7B1ReadonlyFixture.js";
import {
  assertAcceptedByBoth,
  assertRejectedByBoth,
  casesForFinding,
} from "./helpers/m2V2Pr7B1CaseRegistry.js";

const registeredCases = casesForFinding("PR7-P2-009");
const casesById = new Map(registeredCases.map((entry) => [entry.caseId, entry]));
const expectedCaseIds = [
  "PR7-P2-009-scope-member",
  "PR7-P2-009-scope-transaction",
  "PR7-P2-009-scope-authority",
  "PR7-P2-009-scope-report",
  "PR7-P2-009-path-drift",
  "PR7-P2-009-metadata-drift",
  "PR7-P2-009-link-alias",
  "PR7-P2-009-self-reference",
  "PR7-P2-009-stable-pass",
];

test("PR7-P2-009 registry exact set is fully exercised with no skip path", () => {
  assert.deepEqual([...casesById.keys()].sort(), [...expectedCaseIds].sort());
  assert.equal(registeredCases.some((entry) => entry.expectedResult === "SKIP"), false);
});

for (const caseId of expectedCaseIds) {
  test(`${caseId} is checked through the lowest proof runner and secondary exact-set path`, () => {
    const registered = casesById.get(caseId);
    assert.ok(registered, `${caseId}:registry_missing`);
    const publicResult = runPublicCase(caseId);
    const secondaryResult = runSecondaryCase(caseId);
    if (registered.expectedResult === "PASS") {
      assertAcceptedByBoth(caseId, publicResult, secondaryResult);
      assert.equal(publicResult.invocationCount, 2, `${caseId}:exactly_two_invocations`);
      assert.equal(publicResult.providerRequestDelta, 0, `${caseId}:provider_delta`);
      assert.equal(publicResult.databaseConnectionDelta, 0, `${caseId}:database_delta`);
      assert.deepEqual(
        publicResult.snapshots.before.memberIdentities,
        publicResult.snapshots.after_invocation_2.memberIdentities,
        `${caseId}:exact_member_set_stable`,
      );
      return;
    }
    assertRejectedByBoth(
      caseId,
      registered.expectedErrorOrReason,
      publicResult,
      secondaryResult,
    );
  });
}

function runPublicCase(caseId) {
  const fixture = buildFixture();
  const scenario = mutateReadonlyCase(caseId, fixture);
  return capture(() => runSyntheticReadonlyProofV0_2ForTests(scenario.request));
}

function runSecondaryCase(caseId) {
  const fixture = buildFixture();
  const scenario = mutateReadonlyCase(caseId, fixture);
  return capture(() => {
    const scope = deriveReadonlyScopeV0_2(scenario.request);
    const before = snapshotSyntheticReadonlyScopeV0_2ForTests(scope, scenario.snapshotOptions);
    advanceReadonlyScenario(scenario.state, 1);
    const after1 = snapshotSyntheticReadonlyScopeV0_2ForTests(scope, scenario.snapshotOptions);
    advanceReadonlyScenario(scenario.state, 2);
    const after2 = snapshotSyntheticReadonlyScopeV0_2ForTests(scope, scenario.snapshotOptions);
    const checkedMemberIds = before.memberIdentities;
    return compareReadonlySnapshotsV0_2(before, after1, after2, {
      invocations: [1, 2].map((invocation) => ({
        invocation,
        passed: true,
        checkedMemberIds,
        exitStatus: 0,
        verdictDigestSha256: "a".repeat(64),
      })),
      providerRequestDelta: 0,
      databaseConnectionDelta: 0,
    });
  });
}

test("claimable public proof rejects injected observers and verifier callbacks", () => {
  const scenario = mutateReadonlyCase("PR7-P2-009-stable-pass", buildFixture());
  const result = runReadonlyProofV0_2(scenario.request);
  assert.equal(result.allPassed, false);
  assert.equal(result.claimable, false);
  assert.equal(
    result.issues.some((entry) => entry.reason === "readonly_claimable_injection_forbidden"),
    true,
  );
});

test("logic-level scope derivation rejects forged incomplete control registries", () => {
  for (const mutate of [
    (request) => {
      request.contractRegistry = { contracts: [], historicalBaselines: { trackedArtifacts: [] } };
    },
    (request) => {
      request.taskManifest = { schema: "m2.v2.pr7.s1-task.v0.1", registries: {} };
    },
    (request) => {
      request.commandRegistry = { schema: "m2.v2.pr7.s1-command-registry.v0.1", commands: [] };
    },
    (request) => {
      request.packageManifest.scripts["m2:v2:v2b5:verify"] = "node forged.mjs";
    },
  ]) {
    const request = buildFixture();
    mutate(request);
    assert.throws(
      () => deriveReadonlyScopeV0_2(request),
      (error) => error.reason === "readonly_scope_role_set_mismatch",
    );
  }
});

test("duplicate required-control and verifier-source members reject conflicting graph digests", () => {
  for (const collisionPath of [
    "config/m2-v2-pr7-s1-task.v0.1.json",
    "scripts/m2-v2-evidence-pilot/prove_m2_v2_verifier_readonly.mjs",
  ]) {
    const request = buildFixture();
    replacePhysicalMapping(request, "execution_contract", {
      repositoryRelativePath: collisionPath,
      contentDigestSha256: "1".repeat(64),
    });
    request.formalContentDigests = { [collisionPath]: "2".repeat(64) };
    assert.throws(
      () => deriveReadonlyScopeV0_2(request),
      (error) =>
        error.reason === "readonly_scope_role_set_mismatch"
        && /conflicting declaredContentDigestSha256/u.test(error.message),
      collisionPath,
    );
  }
});

test("compatible required-control collision upgrades HEAD enforcement and changes full spec digest", () => {
  const collisionPath = "config/m2-v2-pr7-s1-task.v0.1.json";
  const contentDigestSha256 = "3".repeat(64);
  const graphOnlyRequest = buildFixture();
  replacePhysicalMapping(graphOnlyRequest, "execution_contract", {
    repositoryRelativePath: collisionPath,
    contentDigestSha256,
  });
  const graphOnlyScope = deriveReadonlyScopeV0_2(graphOnlyRequest);

  const headBoundRequest = buildFixture();
  replacePhysicalMapping(headBoundRequest, "execution_contract", {
    repositoryRelativePath: collisionPath,
    contentDigestSha256,
  });
  headBoundRequest.formalContentDigests = { [collisionPath]: contentDigestSha256 };
  const headBoundScope = deriveReadonlyScopeV0_2(headBoundRequest);
  const headBoundMember = headBoundScope.members.find((member) =>
    member.authorityRole === "execution_contract"
    && member.scopeMemberClass === "required_v0_2_and_vnext_paths"
    && member.repositoryRelativePath === collisionPath
  );

  assert.ok(headBoundMember);
  assert.equal(headBoundMember.declaredContentDigestSha256, contentDigestSha256);
  assert.equal(headBoundMember.enforceDeclaredContentDigest, true);
  assert.notEqual(
    graphOnlyScope.memberSpecificationSetDigestSha256,
    headBoundScope.memberSpecificationSetDigestSha256,
  );
});

test("full member specification digest binds declared and physical identities", () => {
  const controlPath = "config/m2-v2-pr7-s1-task.v0.1.json";
  const declaredA = buildFixture();
  declaredA.formalContentDigests = { [controlPath]: "4".repeat(64) };
  const declaredB = buildFixture();
  declaredB.formalContentDigests = { [controlPath]: "5".repeat(64) };
  assert.notEqual(
    deriveReadonlyScopeV0_2(declaredA).memberSpecificationSetDigestSha256,
    deriveReadonlyScopeV0_2(declaredB).memberSpecificationSetDigestSha256,
  );

  const physicalA = buildFixture();
  const physicalB = buildFixture();
  replacePhysicalMapping(physicalB, "immutable_inputs", {
    contentDigestSha256: "6".repeat(64),
  });
  assert.notEqual(
    physicalA.graph.physicalMappings.find((entry) => entry.nodeId === "immutable_inputs")
      .physicalObjectIdSha256,
    physicalB.graph.physicalMappings.find((entry) => entry.nodeId === "immutable_inputs")
      .physicalObjectIdSha256,
  );
  assert.notEqual(
    deriveReadonlyScopeV0_2(physicalA).memberSpecificationSetDigestSha256,
    deriveReadonlyScopeV0_2(physicalB).memberSpecificationSetDigestSha256,
  );
});

test("logic-level scope and native snapshots cannot be presented as claimable", () => {
  const scope = deriveReadonlyScopeV0_2(buildFixture());
  assert.equal(scope.claimable, false);
  assert.throws(
    () => snapshotReadonlyScopeV0_2(scope, { repositoryRoot: process.cwd() }),
    (error) => error.reason === "readonly_claimable_injection_forbidden",
  );
});

test("formal request rejects inline controls and caller-selected executable commands", () => {
  const fixture = buildFixture();
  const result = runReadonlyProofV0_2({
    schema: "m2.v2.verifier-readonly-formal-request.v0.2",
    graphPath: "synthetic.json",
    proofOutputPath: fixture.proofOutputPath,
    verifierCommandId: "m2:v2:v2b5:verify",
    graph: fixture.graph,
    readonlyContract: fixture.readonlyContract,
    contractRegistry: fixture.contractRegistry,
    taskManifest: fixture.taskManifest,
    commandRegistry: fixture.commandRegistry,
    verifierCommand: { executable: process.execPath, argv: ["forged.mjs"] },
  });
  assert.equal(result.allPassed, false);
  assert.equal(result.claimable, false);
  assert.equal(
    result.issues.some((entry) => entry.reason === "readonly_claimable_injection_forbidden"),
    true,
  );
});

test("formal CLI rejects duplicate and unknown request arguments", () => {
  const script = "scripts/m2-v2-evidence-pilot/prove_m2_v2_verifier_readonly.mjs";
  for (const argv of [
    ["--request=a.json", "--request=b.json"],
    ["--request=a.json", "--unknown=b.json"],
  ]) {
    const child = spawnSync(process.execPath, [script, ...argv], {
      cwd: process.cwd(),
      encoding: "utf8",
      shell: false,
      windowsHide: true,
    });
    assert.notEqual(child.status, 0);
    const failure = JSON.parse(child.stderr);
    assert.equal(failure.allPassed, false);
  }
});

test("formal child sentinel emits non-injectable native install and zero counters", () => {
  const auditRoot = mkdtempSync(path.join(tmpdir(), "m2-v2-readonly-sentinel-"));
  try {
    const providerCounter = path.join(auditRoot, "provider.txt");
    const databaseCounter = path.join(auditRoot, "database.txt");
    const installCounter = path.join(auditRoot, "install.txt");
    for (const counterPath of [providerCounter, databaseCounter, installCounter]) {
      writeFileSync(counterPath, "0\n", { encoding: "utf8", flag: "wx" });
    }
    const environment = { ...process.env };
    for (const name of [
      "OPENAI_API_KEY", "OPENAI_BASE_URL", "TAVILY_API_KEY",
      "M2_V2_EVIDENCE_API_BASE_URL", "M2_V2_EVIDENCE_APPROVED_HOST",
      "M2_V2_APPROVED_RELAY_HOST", "M2_V2_EVIDENCE_PROVIDER",
      "M2_V2_SEARCH_PROVIDER", "M2_V2_TAVILY_BASE_URL",
      "M1_DATABASE_URL", "M1_DATABASE_READONLY_URL", "M1_DATABASE_BACKGROUND_URL",
      "DATABASE_URL", "PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD",
    ]) environment[name] = "";
    const sentinelPath = path.resolve("test/helpers/m2V2NoExternalSentinel.js");
    const child = spawnSync(process.execPath, ["-e", "process.stdout.write('sentinel-ready')"], {
      cwd: process.cwd(),
      encoding: "utf8",
      shell: false,
      windowsHide: true,
      env: {
        ...environment,
        NODE_OPTIONS: `--import=${pathToFileURL(sentinelPath).href}`,
        M2_V2_S0_SENTINEL_AUTO_INSTALL: "1",
        M2_V2_S0_PROVIDER_COUNTER_FILE: providerCounter,
        M2_V2_S0_DATABASE_COUNTER_FILE: databaseCounter,
        M2_V2_S0_SENTINEL_INSTALL_COUNTER_FILE: installCounter,
      },
    });
    assert.equal(child.status, 0, child.stderr);
    assert.equal(child.stdout, "sentinel-ready");
    assert.equal(readCounter(providerCounter), 0);
    assert.equal(readCounter(databaseCounter), 0);
    assert.equal(readCounter(installCounter), 1);
  } finally {
    rmSync(auditRoot, { recursive: true, force: true });
  }
});

test("declared formal source digest mismatch fails before a snapshot can pass", () => {
  const scope = {
    sourceGraphDigestSha256: "a".repeat(64),
    members: [{
      authorityRole: "execution_contract",
      scopeMemberClass: "tracked_verifier_sources",
      memberKind: "FILE",
      repositoryRelativePath: "synthetic.txt",
      memberIdentity: "b".repeat(64),
      declaredContentDigestSha256: "c".repeat(64),
      enforceDeclaredContentDigest: true,
    }],
  };
  assert.throws(
    () => snapshotSyntheticReadonlyScopeV0_2ForTests(scope, {
      observer(member) {
        return {
          contentSha256: "d".repeat(64),
          byteLength: 1,
          memberSetDigestSha256: "e".repeat(64),
          metadata: {
            platform: "POSIX_NATIVE",
            device: "1", inode: "1", mode: "33188", uid: "0", gid: "0",
            size: "1", mtimeNs: "1", ctimeNs: "1", mountId: "1",
            resolvedPathDigestSha256: "f".repeat(64),
          },
          objectIdentity: member.memberIdentity,
          linkOrReparseType: "NONE",
          referenceTargetDigestSha256: null,
        };
      },
    }),
    (error) => error.reason === "readonly_metadata_changed_or_unsupported",
  );
});

test("claimable snapshot rejects inherited, proxied, and accessor injection options", () => {
  const scope = {
    sourceGraphDigestSha256: "a".repeat(64),
    members: [{
      authorityRole: "immutable_inputs",
      scopeMemberClass: "transaction_roots",
      memberKind: "FILE",
      repositoryRelativePath: "does-not-exist.txt",
      memberIdentity: "b".repeat(64),
    }],
  };
  const fakeObserver = () => ({ objectIdentity: "forged" });
  const accessorOptions = {};
  Object.defineProperty(accessorOptions, "repositoryRoot", {
    enumerable: true,
    get() {
      return process.cwd();
    },
  });
  const hostileOptions = [
    Object.create({ observer: fakeObserver }),
    Object.create({ gitRefObserver: fakeObserver }),
    new Proxy({ repositoryRoot: process.cwd() }, {
      get(target, key, receiver) {
        if (key === "observer") return fakeObserver;
        return Reflect.get(target, key, receiver);
      },
    }),
    accessorOptions,
  ];
  for (const options of hostileOptions) {
    assert.throws(
      () => snapshotReadonlyScopeV0_2(scope, options),
      (error) => error.reason === "readonly_claimable_injection_forbidden",
    );
  }
  const scenario = mutateReadonlyCase("PR7-P2-009-stable-pass", buildFixture());
  scenario.request.snapshotOptions = Object.create({ observer: fakeObserver });
  delete scenario.request.verifierCallback;
  scenario.request.verifierCommand = { executable: process.execPath, argv: ["--version"] };
  const result = runReadonlyProofV0_2(scenario.request);
  assert.equal(result.allPassed, false);
  assert.equal(result.claimable, false);
  assert.equal(
    result.issues.some((entry) => entry.reason === "readonly_claimable_injection_forbidden"),
    true,
  );
});

test("synthetic proof output is permanently marked non-claimable", () => {
  const scenario = mutateReadonlyCase("PR7-P2-009-stable-pass", buildFixture());
  const result = runSyntheticReadonlyProofV0_2ForTests(scenario.request);
  assert.equal(result.allPassed, true);
  assert.equal(result.claimable, false);
  assert.equal(result.schema, "m2.v2.verifier-readonly-proof-synthetic-test-only.v0.2");
  assert.equal(result.claim, "SYNTHETIC_LOGIC_ONLY_NOT_A_READONLY_PROOF");
});

for (const [label, invocations] of [
  ["zero", []],
  ["one", [{ invocation: 1 }]],
  ["three", [{ invocation: 1 }, { invocation: 2 }, { invocation: 3 }]],
  ["out-of-order", [{ invocation: 2 }, { invocation: 1 }]],
]) {
  test(`readonly comparison rejects ${label} verifier invocation sequence`, () => {
    const snapshot = minimalSnapshot();
    const normalizedInvocations = invocations.map((entry) => ({
      invocation: entry.invocation,
      passed: true,
      checkedMemberIds: snapshot.memberIdentities,
      exitStatus: 0,
      verdictDigestSha256: "a".repeat(64),
    }));
    const result = compareReadonlySnapshotsV0_2(snapshot, snapshot, snapshot, {
      invocations: normalizedInvocations,
      providerRequestDelta: 0,
      databaseConnectionDelta: 0,
    });
    assert.equal(result.allPassed, false);
    assert.equal(
      result.issues.some((entry) => entry.code === "VERIFIER_INVOCATION_SEQUENCE_MISMATCH"),
      true,
    );
  });
}

test("readonly comparison rejects non-exact invocation record shape", () => {
  const snapshot = minimalSnapshot();
  const invocations = [1, 2].map((invocation) => ({
    invocation,
    passed: true,
    checkedMemberIds: snapshot.memberIdentities,
    exitStatus: 0,
    verdictDigestSha256: "a".repeat(64),
    undeclared: true,
  }));
  const result = compareReadonlySnapshotsV0_2(snapshot, snapshot, snapshot, {
    invocations,
    providerRequestDelta: 0,
    databaseConnectionDelta: 0,
  });
  assert.equal(result.allPassed, false);
  assert.equal(
    result.issues.some((entry) => entry.code === "VERIFIER_INVOCATION_RECORD_SHAPE_MISMATCH"),
    true,
  );
});

test("readonly comparison rejects divergent checked sets and verdicts", () => {
  const snapshot = minimalSnapshot();
  const invocations = [1, 2].map((invocation) => ({
    invocation,
    passed: true,
    checkedMemberIds: invocation === 1 ? snapshot.memberIdentities : [],
    exitStatus: 0,
    verdictDigestSha256: (invocation === 1 ? "a" : "d").repeat(64),
  }));
  const result = compareReadonlySnapshotsV0_2(snapshot, snapshot, snapshot, {
    invocations,
    providerRequestDelta: 0,
    databaseConnectionDelta: 0,
  });
  assert.equal(result.allPassed, false);
  assert.equal(result.issues.some((entry) => entry.code === "VERIFIER_CHECKED_MEMBER_SET_MISMATCH"), true);
  assert.equal(result.issues.some((entry) => entry.code === "VERIFIER_VERDICT_MISMATCH"), true);
});

test("default observer emits exact native metadata for a system-temp directory and file", () => {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), "m2-v2-readonly-native-"));
  try {
    mkdirSync(path.join(temporaryRoot, "scope"));
    writeFileSync(path.join(temporaryRoot, "scope", "member.txt"), "native-smoke", "utf8");
    const scope = {
      sourceGraphDigestSha256: "a".repeat(64),
      members: [{
        authorityRole: "immutable_inputs",
        scopeMemberClass: "transaction_roots",
        memberKind: "DIRECTORY",
        repositoryRelativePath: "scope",
        memberIdentity: "b".repeat(64),
      }],
    };
    const snapshot = snapshotHostNativeReadonlyScopeV0_2ForTests(
      scope,
      { repositoryRoot: temporaryRoot },
    );
    assert.equal(snapshot.claimable, false);
    assert.deepEqual(
      snapshot.observations.map((entry) => entry.repositoryRelativePath),
      ["scope", "scope/member.txt"],
    );
    const metadataSchemas = buildFixture().readonlyContract.scopeDerivation.metadataSchemas;
    const metadataContract = process.platform === "win32"
      ? metadataSchemas.windows
      : metadataSchemas.posix;
    const expectedPlatform = metadataContract.platform;
    const expectedFields = [...metadataContract.exactFields].sort();
    for (const observation of snapshot.observations) {
      assert.equal(observation.metadata.platform, expectedPlatform);
      assert.deepEqual(Object.keys(observation.metadata).sort(), expectedFields);
      if (process.platform === "win32") {
        assert.match(observation.metadata.fileId128, /^[0-9a-f]{32}$/u);
        assert.equal(observation.metadata.reparseTag, "0x00000000");
      } else {
        assert.match(observation.metadata.mountId, /^\d+$/u);
      }
    }
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("injected observer metadata rejects unknown fields and non-contract platforms", () => {
  const scope = {
    sourceGraphDigestSha256: "a".repeat(64),
    members: [{
      authorityRole: "immutable_inputs",
      scopeMemberClass: "transaction_roots",
      memberKind: "FILE",
      repositoryRelativePath: "synthetic.txt",
      memberIdentity: "b".repeat(64),
    }],
  };
  const invalidMetadata = [
    { platform: "synthetic" },
    {
      platform: "POSIX_NATIVE",
      device: "1",
      inode: "1",
      mode: "33188",
      uid: "0",
      gid: "0",
      size: "1",
      mtimeNs: "1",
      ctimeNs: "1",
      mountId: "1",
      resolvedPathDigestSha256: "e".repeat(64),
      undeclared: true,
    },
  ];
  for (const metadata of invalidMetadata) {
    assert.throws(
      () => snapshotSyntheticReadonlyScopeV0_2ForTests(scope, {
        observer() {
          return {
            contentSha256: "c".repeat(64),
            byteLength: 1,
            memberSetDigestSha256: "d".repeat(64),
            metadata,
            objectIdentity: "synthetic",
            linkOrReparseType: "NONE",
            referenceTargetDigestSha256: null,
          };
        },
      }),
      (error) => error.reason === "readonly_metadata_changed_or_unsupported",
    );
  }
});

function minimalSnapshot() {
  const identity = "b".repeat(64);
  return {
    memberIdentities: [identity],
    memberSetDigestSha256: "c".repeat(64),
    observations: [{ memberIdentity: identity }],
  };
}

function buildFixture() {
  return buildReadonlyProofFixture({
    deriveGraph: deriveCanonicalAuthorityGraphV0_3,
    buildPhysicalMapping: buildAuthorityPhysicalMapping,
  });
}

function replacePhysicalMapping(request, nodeId, overrides) {
  const physicalMappings = request.graph.physicalMappings.map((mapping) => {
    if (mapping.nodeId !== nodeId) return mapping;
    const rebuilt = buildAuthorityPhysicalMapping({
      nodeId,
      repositoryRelativePath:
        overrides.repositoryRelativePath ?? mapping.repositoryRelativePath,
      contentDigestSha256: overrides.contentDigestSha256 ?? mapping.contentDigestSha256,
      objectType: overrides.objectType ?? mapping.objectType,
    });
    return Object.freeze(rebuilt);
  });
  request.graph = deriveCanonicalAuthorityGraphV0_3({
    physicalMappings,
    selectionDecisions: request.graph.selectionDecisions,
  });
}

function capture(callback) {
  try {
    return callback();
  } catch (error) {
    return {
      allPassed: false,
      issues: [{ reason: error.reason, message: error.message, details: error.details }],
    };
  }
}

function readCounter(counterPath) {
  return Number.parseInt(readFileSync(counterPath, "utf8").trim(), 10);
}
