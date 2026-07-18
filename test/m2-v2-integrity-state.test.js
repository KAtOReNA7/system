import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  ATOMIC_BINDING_SCHEMA,
  buildAtomicTransaction,
  commitAtomicRequestCheckpoint,
  createAtomicRequestBinding,
  createReceiptEnvelope,
  evaluateGitBoundaryCommandResult,
  hashGovernedPrivateState,
  migrateLegacyReceiptToEnvelopeV02,
  receiptRuntimeView,
  receiptWasCacheHit,
  readCurrentRequestStateSnapshot,
  recomputeRequestCounters,
  updateReceiptEnvelopeRuntimeView,
  validateCurrentRequestStateBinding,
  validateFrozenSourceBundleDigest,
  validateReceiptEnvelope,
  validateRuntimeOnlyStaleDigest,
  verifyAtomicTransaction,
  withReceiptRuntimeView,
} from "../src/domain/m2V2EvidencePilot/integrityState.js";
import { canonicalJson, sha256 } from "../src/domain/m2V2EvidencePilot/pilotCore.js";

test("receipt envelope keeps immutable identity separate from runtime observation", () => {
  const payload = {
    requestIdentity: "synthetic-request-001",
    requestPayloadDigest: sha256("synthetic-request"),
    responsePayloadDigest: sha256("synthetic-response"),
    providerStatus: "completed",
    providerRequestId: "synthetic-provider-request-001",
    usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  const first = createReceiptEnvelope(payload, { cacheHit: false });
  const second = updateReceiptEnvelopeRuntimeView(first, {
    cacheHit: true,
    readAt: "2026-01-02T00:00:00.000Z",
    selectedAsEffective: true,
  });

  assert.equal(first.schema, "receipt-envelope-v0.2");
  assert.equal(validateReceiptEnvelope(first).valid, true);
  assert.equal(validateReceiptEnvelope(second).valid, true);
  assert.equal(first.receiptDigest, second.receiptDigest);
  assert.notEqual(first.runtimeViewDigest, second.runtimeViewDigest);
});

test("runtime-only stale legacy digest is migratable without rewriting history", () => {
  const originalPayload = {
    schema: "synthetic.legacy-receipt.v0.1",
    requestKey: "synthetic-request-002",
    status: "completed",
    cacheHit: false,
  };
  const originalDigest = sha256(originalPayload);
  const stale = { ...originalPayload, cacheHit: true, receiptDigest: originalDigest };
  const validation = validateRuntimeOnlyStaleDigest(stale);
  assert.equal(validation.valid, true);
  assert.equal(validation.classification, "runtime_only_stale_digest");

  const migrated = migrateLegacyReceiptToEnvelopeV02(stale, {
    migratedAt: "2026-01-03T00:00:00.000Z",
  });
  assert.equal(validateReceiptEnvelope(migrated.envelope).valid, true);
  assert.equal(migrated.envelope.runtimeView.cacheHit, true);
  assert.equal(Object.hasOwn(migrated.envelope.receiptPayload, "cacheHit"), false);
  assert.equal(migrated.migration.oldDigest, originalDigest);
  assert.equal(migrated.migration.newDigest, migrated.envelope.receiptDigest);
});

test("non-runtime receipt tampering is not eligible for migration", () => {
  const originalPayload = {
    schema: "synthetic.legacy-receipt.v0.1",
    requestKey: "synthetic-request-003",
    status: "completed",
    cacheHit: false,
  };
  const tampered = {
    ...originalPayload,
    status: "provider_failed",
    receiptDigest: sha256(originalPayload),
  };
  assert.equal(validateRuntimeOnlyStaleDigest(tampered).valid, false);
  assert.throws(() => migrateLegacyReceiptToEnvelopeV02(tampered, {
    migratedAt: "2026-01-03T00:00:00.000Z",
  }), /legacy_receipt_migration_invalid/u);
});

test("legacy cache-hit sidecar preserves canonical receipt bytes and digest", () => {
  const payload = {
    schema: "synthetic.flat-receipt.v0.1",
    requestKey: "synthetic-request-004",
    status: "completed",
    cacheHit: false,
  };
  const receipt = { ...payload, receiptDigest: sha256(payload) };
  const observed = withReceiptRuntimeView(receipt, { cacheHit: true });
  assert.equal(canonicalJson(observed), canonicalJson(receipt));
  assert.equal(observed.receiptDigest, receipt.receiptDigest);
  assert.equal(receiptWasCacheHit(observed), true);
  assert.deepEqual(receiptRuntimeView(observed), {
    cacheHit: true,
    readAt: null,
    selectedAsEffective: false,
  });
});

test("atomic binding is derived from the append-only request ledger", () => {
  const requestLedger = [
    { requestId: "synthetic-1", planned: true, reserved: true, dispatched: true, completed: true },
    { requestId: "synthetic-2", planned: true, cacheHit: true, completed: true },
  ];
  const counters = recomputeRequestCounters(requestLedger);
  assert.equal(recomputeRequestCounters([
    { event: "planned" },
    { eventType: "provider_failed" },
    { status: "cache-hit" },
  ]).providerFailed, 1);
  const members = {
    state: { phase: "complete" },
    cacheIndex: { entries: { synthetic: "sha256:receipt" } },
    receiptIndex: [{ receiptRef: "sha256:receipt" }],
    requestLedger,
    counters,
    manifestBindings: { sampleManifestDigest: sha256("synthetic-manifest") },
  };
  const binding = buildAtomicTransaction({
    transactionId: "synthetic-transaction-001",
    createdAt: "2026-01-04T00:00:00.000Z",
    ...members,
  });
  assert.equal(verifyAtomicTransaction(binding, members).valid, true);
  assert.equal(verifyAtomicTransaction(binding, {
    ...members,
    state: { phase: "tampered" },
  }).valid, false);
  assert.throws(() => buildAtomicTransaction({
    transactionId: "synthetic-transaction-002",
    createdAt: "2026-01-04T00:00:00.000Z",
    ...members,
    counters: { ...counters, dispatched: 99 },
  }), /counter_ledger_mismatch/u);
});

test("frozen source-bundle digest is independently recomputed", () => {
  const immutable = {
    schema: "synthetic.source-bundle.v0.2",
    privateOnly: true,
    workCount: 4,
    sourceRecordCount: 24,
    immutable: true,
    full160Authorized: false,
  };
  const bundle = {
    ...immutable,
    frozenAt: "2026-01-05T00:00:00.000Z",
    sourceBundleDigest: sha256(immutable),
  };
  assert.equal(validateFrozenSourceBundleDigest(bundle).valid, true);
  assert.equal(validateFrozenSourceBundleDigest({ ...bundle, sourceRecordCount: 23 }).valid, false);
});

test("git boundary command failures fail closed", () => {
  assert.deepEqual(evaluateGitBoundaryCommandResult({ status: 128, stdout: "", error: null }), {
    auditSucceeded: false,
    b4Unchanged: false,
    holdoutSealed: false,
    paths: [],
    issue: "git_boundary_audit_failed",
  });
  const changed = evaluateGitBoundaryCommandResult({
    status: 0,
    stdout: "src/domain/oldProductEvaluation/model.js\ndocs/holdout-status.md\n",
    error: null,
  });
  assert.equal(changed.auditSucceeded, true);
  assert.equal(changed.b4Unchanged, false);
  assert.equal(changed.holdoutSealed, false);
});

test("current atomic binding validates every scoped raw-file digest", () => {
  const root = mkdtempSync(join(tmpdir(), "m2-v2-current-binding-"));
  try {
    const memberRoot = join(root, "governed");
    const bindingRoot = join(root, "binding");
    mkdirSync(memberRoot, { recursive: true });
    mkdirSync(bindingRoot, { recursive: true });
    const roles = ["state", "cacheIndex", "receiptIndex", "requestLedger", "counters"];
    const descriptors = {};
    for (const role of roles) {
      const path = `governed/${role}.json`;
      const content = `${JSON.stringify({ role })}\n`;
      writeFileSync(join(root, path), content, "utf8");
      descriptors[role] = { path, byteDigest: sha256Buffer(content) };
    }
    const stage = {
      transactionId: "synthetic-current-v2b7",
      stateDigest: descriptors.state.byteDigest,
      cacheIndexDigest: descriptors.cacheIndex.byteDigest,
      receiptIndexDigest: descriptors.receiptIndex.byteDigest,
      requestLedgerDigest: descriptors.requestLedger.byteDigest,
      counterDigest: descriptors.counters.byteDigest,
      manifestBindings: { manifestDigest: sha256("synthetic-manifest") },
      createdAt: "2026-01-06T00:00:00.000Z",
    };
    const binding = createAtomicRequestBinding({
      currentTransactionId: "synthetic-current",
      stages: [{ scope: "v2b7", transaction: stage, members: descriptors }],
      members: [],
    });
    assert.equal(binding.schema, ATOMIC_BINDING_SCHEMA);
    writeFileSync(join(bindingRoot, "current.json"), `${JSON.stringify(binding)}\n`, "utf8");
    const options = { bindingRelativePath: "binding/current.json", scope: "v2b7" };
    assert.equal(validateCurrentRequestStateBinding(root, options).valid, true);
    writeFileSync(join(root, descriptors.state.path), "{\"tampered\":true}\n", "utf8");
    assert.equal(validateCurrentRequestStateBinding(root, options).valid, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("atomic checkpoint commits immutable members and current binding round-trips through the loader", () => {
  const root = mkdtempSync(join(tmpdir(), "m2-v2-atomic-checkpoint-"));
  try {
    const input = {
      scope: "v2b8",
      createdAt: "2026-01-07T00:00:00.000Z",
      state: {
        phase: "completed",
        tavily: {
          reservations: {
            "tavily:synthetic": {
              status: "completed",
              reservedAt: "2026-01-06T23:59:58.000Z",
              dispatchStartedAt: "2026-01-06T23:59:59.000Z",
            },
          },
        },
        relay: { reservations: {} },
      },
      caches: {
        tavily: {
          entries: {
            synthetic: {
              receiptDigest: sha256("synthetic-receipt"),
              adapterVersion: "synthetic-adapter-v1",
            },
          },
        },
      },
      receipts: [{ receiptDigest: sha256("synthetic-receipt"), schema: "synthetic-receipt-v1" }],
      manifestBindings: { manifestDigest: sha256("synthetic-manifest") },
    };
    const first = commitAtomicRequestCheckpoint(root, input);
    const second = commitAtomicRequestCheckpoint(root, input);
    assert.equal(second.transactionId, first.transactionId);
    assert.equal(second.binding.bindingDigest, first.binding.bindingDigest);
    const snapshot = readCurrentRequestStateSnapshot(root, { scope: "v2b8" });
    assert.equal(snapshot.valid, true);
    assert.equal(snapshot.members.state.phase, "completed");
    assert.equal(snapshot.members.cacheIndex.entries.length, 1);
    assert.equal(snapshot.members.cacheIndex.entries[0].transactionId, first.transactionId);
    assert.deepEqual(snapshot.members.counters, {
      planned: 1,
      reserved: 1,
      dispatched: 1,
      completed: 1,
      indeterminate: 0,
      providerFailed: 0,
      contractFailed: 0,
      cacheHit: 0,
    });
    assert.equal(existsSync(join(root, first.descriptors.state.path)), true);
    assert.equal(validateCurrentRequestStateBinding(root, { scope: "v2b8" }).valid, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("governed private-state hashing is deterministic and content-sensitive", () => {
  const root = mkdtempSync(join(tmpdir(), "m2-v2-governed-state-"));
  try {
    mkdirSync(join(root, "governed", "nested"), { recursive: true });
    mkdirSync(join(root, "data", "private-output", "m2-v2-integrity-remediation", "recovery-staging-v0.1"), { recursive: true });
    writeFileSync(join(root, "governed", "a.json"), "{\"a\":1}\n", "utf8");
    writeFileSync(join(root, "governed", "nested", "b.ndjson"), "{\"b\":2}\n", "utf8");
    writeFileSync(join(root, "data", "private-output", "m2-v2-integrity-remediation", "recovery-staging-v0.1", "staged.json"), "{}\n", "utf8");
    const relativePaths = ["governed", "data/private-output/m2-v2-integrity-remediation/recovery-staging-v0.1"];
    const first = hashGovernedPrivateState(root, { relativePaths });
    const second = hashGovernedPrivateState(root, { relativePaths });
    assert.deepEqual(second, first);
    assert.equal(first.memberCount, 2);
    writeFileSync(join(root, "governed", "a.json"), "{\"a\":3}\n", "utf8");
    const changed = hashGovernedPrivateState(root, { relativePaths });
    assert.notEqual(changed.aggregateDigest, first.aggregateDigest);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("default B5-B8 verifier functions contain no mutation, freeze, validation, rebuild, or report path", () => {
  const definitions = [
    ["src/domain/m2V2EvidencePilot/v2b5Runtime.js", "verifyV2B5"],
    ["src/domain/m2V2EvidencePilot/v2b6Runtime.js", "verifyV2B6"],
    ["src/domain/m2V2EvidencePilot/v2b7Runtime.js", "verifyV2B7"],
    ["src/domain/m2V2EvidencePilot/v2b8Runtime.js", "verifyV2B8"],
  ];
  for (const [relativePath, functionName] of definitions) {
    const source = readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
    const body = exportedFunctionSource(source, functionName);
    assert.doesNotMatch(body, /atomicWrite|writeFile|mkdir|rename|checkAndFreeze|run[A-Za-z0-9]*FullValidation|rebuildV2B|writeV2B[0-9]*PublicReports|new Date/gu, relativePath);
  }
  const b7Script = readFileSync(new URL("../scripts/m2-v2-evidence-pilot/run_m2_v2_b7.mjs", import.meta.url), "utf8");
  const b8Script = readFileSync(new URL("../scripts/m2-v2-evidence-pilot/run_m2_v2_b8.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(verifyCommandBranch(b7Script), /onProgress|runFullValidation|skipFullValidation/gu);
  assert.doesNotMatch(verifyCommandBranch(b8Script), /onProgress|runFullValidation|rebuild|report|resume/gu);
});

test("integrity full validation cannot execute provider run, resume, check, or report commands", () => {
  const relativePath = "src/domain/m2V2EvidencePilot/v2b8Runtime.js";
  const source = readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
  const body = exportedFunctionSource(source, "runV2B8FullValidation");
  assert.doesNotMatch(body, /m2:v2:v2b[5-8]:(?:run|resume|check|report)/gu);
  for (const command of ["m2:v2:v2b5:verify", "m2:v2:v2b6:verify", "m2:v2:v2b7:verify", "m2:v2:v2b8:verify"]) {
    assert.equal(body.includes(command), true, command);
  }
  assert.match(source, /m2-v2-integrity-remediation\/full-validation-receipt-private-v0\.1\.json/u);
  assert.doesNotMatch(body, /V2B8_FILES\.validation/u);
});

function sha256Buffer(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function exportedFunctionSource(source, name) {
  const start = source.indexOf(`export function ${name}`);
  assert.notEqual(start, -1, `${name} missing`);
  const tail = source.slice(start);
  const boundary = tail.search(/\r?\n\}\r?\n\r?\n(?:export )?function /u);
  assert.notEqual(boundary, -1, `${name} boundary missing`);
  return tail.slice(0, boundary + 2);
}

function verifyCommandBranch(source) {
  const start = source.indexOf('command === "verify"');
  assert.notEqual(start, -1, "verify command missing");
  const end = source.indexOf("  } else {", start);
  return source.slice(start, end === -1 ? source.length : end);
}
