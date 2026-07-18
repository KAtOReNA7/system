import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  buildClosedAtomicTransactionManifest,
  CLOSED_ATOMIC_MEMBER_ROLES,
  createClosedAtomicRequestBinding,
  createReceiptEnvelope,
  validateClosedAtomicRequestBinding,
} from "../src/domain/m2V2EvidencePilot/integrityState.js";
import { appendRequestEvent, replayRequestEventLedger } from "../src/domain/m2V2EvidencePilot/requestEventLedger.js";
import { sha256 } from "../src/domain/m2V2EvidencePilot/pilotCore.js";

const roots = [];
test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test("closed atomic binding replays ledger and verifies every exact role", () => {
  const fixture = makeFixture();
  const result = validateClosedAtomicRequestBinding(fixture.root, fixture.options);
  assert.equal(result.valid, true, result.issues.join(","));
  assert.equal(result.memberCount, CLOSED_ATOMIC_MEMBER_ROLES.length);
  assert.equal(result.historicalDecision, "CANARY_CONDITIONAL");
  assert.equal(result.currentRestatedDecision, "CANARY_FAIL");
  assert.equal(result.currentRestatementVerified, true);
  assert.equal(result.currentAuthorityDigestVerified, true);
  assert.equal(result.effectiveReceiptsVerified, true);
  assert.equal(result.full160Authorized, false);
  assert.equal(result.nextDevelopmentReadiness, "NOT_AUTHORIZED");
  assert.equal(result.replay.counters.completed, 1);
});

test("closed atomic binding fails closed when the binding is missing", () => {
  const root = mkdtempSync(join(tmpdir(), "m2-v2-closed-binding-missing-"));
  roots.push(root);
  const result = validateClosedAtomicRequestBinding(root, { bindingRelativePath: "missing.json", scope: "v2b8" });
  assert.equal(result.present, false);
  assert.equal(result.valid, false);
  assert.ok(result.issues.includes("closed_binding_missing"));
  assert.equal(result.full160Authorized, false);
});

for (const role of [
  "state",
  "cache_index",
  "receipt_index",
  "request_event_ledger",
  "counter_projection",
  "derived_evaluation",
  "current_restatement",
]) {
  test(`closed atomic binding fails when ${role} bytes are tampered`, () => {
    const fixture = makeFixture();
    writeFileSync(join(fixture.root, fixture.rolePaths[role]), "tampered\n");
    const result = validateClosedAtomicRequestBinding(fixture.root, fixture.options);
    assert.equal(result.valid, false);
    assert.ok(result.issues.includes(`closed_member_digest_mismatch:${role}`));
  });
}

test("closed binding recomputes stored receipt and frozen upstream bytes", () => {
  const receiptFixture = makeFixture();
  writeJson(join(receiptFixture.root, receiptFixture.receiptPath), { schema: "receipt-envelope-v0.2" });
  const receiptResult = validateClosedAtomicRequestBinding(receiptFixture.root, receiptFixture.options);
  assert.equal(receiptResult.valid, false);
  assert.ok(receiptResult.issues.some((issue) => issue.startsWith("receipt_index_entry_1:")));

  const upstreamFixture = makeFixture();
  writeFileSync(join(upstreamFixture.root, upstreamFixture.upstreamPath), "upstream tamper\n");
  const upstreamResult = validateClosedAtomicRequestBinding(upstreamFixture.root, upstreamFixture.options);
  assert.equal(upstreamResult.valid, false);
  assert.ok(upstreamResult.issues.some((issue) => issue.includes("frozen_upstream_digests_entry_1:digest_mismatch")));
});

test("closed binding rejects extra and missing roles even with recomputed binding digest", () => {
  const missing = makeFixture();
  rewriteBinding(missing, (binding) => {
    binding.members = binding.members.filter((member) => member.role !== "derived_evaluation");
  });
  const missingResult = validateClosedAtomicRequestBinding(missing.root, missing.options);
  assert.equal(missingResult.valid, false);
  assert.ok(missingResult.issues.some((issue) => issue.startsWith("closed_atomic_roles_missing:")));

  const extra = makeFixture();
  writeJson(join(extra.root, "tx/extra.json"), { extra: true });
  rewriteBinding(extra, (binding) => {
    binding.members.push({ role: "extra_role", path: "tx/extra.json", byteDigest: digestFile(join(extra.root, "tx/extra.json")) });
  });
  const extraResult = validateClosedAtomicRequestBinding(extra.root, extra.options);
  assert.equal(extraResult.valid, false);
  assert.ok(extraResult.issues.some((issue) => issue.startsWith("closed_atomic_roles_extra:")));
});

test("closed binding rejects cache-supplied and receipt-index-supplied digest claims", () => {
  const fakeDigest = "f".repeat(64);
  const cacheFixture = makeFixture({ cacheReceiptDigest: fakeDigest });
  const cacheResult = validateClosedAtomicRequestBinding(cacheFixture.root, cacheFixture.options);
  assert.equal(cacheResult.valid, false);
  assert.ok(cacheResult.issues.some((issue) => issue.endsWith(":receipt_not_recomputed")));

  const receiptFixture = makeFixture({ indexedReceiptDigest: fakeDigest });
  const receiptResult = validateClosedAtomicRequestBinding(receiptFixture.root, receiptFixture.options);
  assert.equal(receiptResult.valid, false);
  assert.ok(receiptResult.issues.some((issue) => issue.endsWith(":receipt_digest_mismatch")));
});

test("closed binding rejects state/counter projections not derived from replay", () => {
  const stateFixture = makeFixture({ stateCounterDelta: 1 });
  const stateResult = validateClosedAtomicRequestBinding(stateFixture.root, stateFixture.options);
  assert.equal(stateResult.valid, false);
  assert.ok(stateResult.issues.includes("state_request_counters_replay_mismatch"));

  const counterFixture = makeFixture({ counterDelta: 1 });
  const counterResult = validateClosedAtomicRequestBinding(counterFixture.root, counterFixture.options);
  assert.equal(counterResult.valid, false);
  assert.ok(counterResult.issues.includes("counter_projection_replay_mismatch"));
});

function makeFixture(options = {}) {
  const root = mkdtempSync(join(tmpdir(), "m2-v2-closed-binding-"));
  roots.push(root);
  const transactionId = "synthetic-transaction-v0.2";
  const scope = "v2b8";
  const receiptPath = "receipts/receipt-1.json";
  const upstreamPath = "artifacts/upstream.json";
  const immutablePath = "artifacts/immutable.json";
  const publicReportPath = "artifacts/public-report.json";
  const restatementPath = "tx/current-restatement.json";
  const authorityPath = "tx/current-authority.json";
  for (const path of [receiptPath, upstreamPath, immutablePath, publicReportPath]) mkdirSync(dirname(join(root, path)), { recursive: true });

  const receiptPayload = { synthetic: true, requestStartedAt: "2026-07-18T00:00:00.000Z", responseReceivedAt: "2026-07-18T00:00:01.000Z" };
  const envelope = createReceiptEnvelope(receiptPayload);
  writeJson(join(root, receiptPath), envelope);
  writeJson(join(root, upstreamPath), { frozen: true });
  writeJson(join(root, immutablePath), { immutable: true });
  writeJson(join(root, publicReportPath), { sanitized: true });

  const requestDigest = sha256({ syntheticRequest: true });
  let ledger = appendRequestEvent([], {
    timestamp: "2026-07-18T00:00:00.000Z", provider: "synthetic", stage: scope,
    logicalKey: "logical-1", physicalKey: "physical-1", eventType: "planned", requestDigest, receiptDigest: null,
  });
  for (const eventType of ["reserved", "dispatched", "completed"]) {
    ledger = appendRequestEvent(ledger, {
      timestamp: "2026-07-18T00:00:01.000Z", provider: "synthetic", stage: scope,
      logicalKey: "logical-1", physicalKey: "physical-1", eventType, requestDigest,
      receiptDigest: eventType === "completed" ? envelope.receiptDigest : null,
    });
  }
  const counters = replayRequestEventLedger(ledger).counters;
  const stateCounters = { ...counters, planned: counters.planned + (options.stateCounterDelta ?? 0) };
  const projectedCounters = { ...counters, completed: counters.completed + (options.counterDelta ?? 0) };

  const restatement = {
    schema: "m2.v2.canary-v3.1-integrity-restatement-public.v0.3",
    providerRequestDelta: 0,
    historicalContract: { decision: "CANARY_CONDITIONAL" },
    restatedContract: { decision: "CANARY_FAIL", full160Authorized: false },
    nextDevelopmentReadiness: "NOT_AUTHORIZED",
  };
  writeJson(join(root, restatementPath), restatement);
  const authority = {
    schemaVersion: "m2-v2-current-state-index-v0.2",
    status: "current",
    historicalV2B8Decision: "CANARY_CONDITIONAL",
    currentDecision: "CANARY_FAIL",
    full160Authorized: false,
    nextDevelopmentReadiness: "NOT_AUTHORIZED",
    currentAuthority: { currentRestatementArtifact: restatementPath, currentRestatementDigest: digestFile(join(root, restatementPath)) },
    entries: [],
  };

  const documents = {
    state: { schema: "synthetic-state", requestCounters: stateCounters },
    cache_index: {
      schema: "synthetic-cache-index", entries: [{
        adapterVersion: "synthetic-v1", logicalKey: "logical-1", physicalKey: "physical-1",
        receiptDigest: options.cacheReceiptDigest ?? envelope.receiptDigest, transactionId,
      }],
    },
    receipt_index: { schema: "synthetic-receipt-index", entries: [{ path: receiptPath, receiptDigest: options.indexedReceiptDigest ?? envelope.receiptDigest }] },
    request_event_ledger: ledger,
    counter_projection: { schema: "synthetic-counters", counters: projectedCounters },
    execution_contract: { schema: "synthetic-contract", providerRequestDelta: 0 },
    immutable_manifests: { entries: [{ path: immutablePath, byteDigest: digestFile(join(root, immutablePath)) }] },
    frozen_upstream_digests: { entries: [{ path: upstreamPath, byteDigest: digestFile(join(root, upstreamPath)) }] },
    derived_evaluation: { schema: "synthetic-evaluation", decision: "CANARY_FAIL" },
    effective_receipt_index: { entries: [{ receiptDigest: envelope.receiptDigest }] },
    current_authority: authority,
    current_restatement: restatement,
    contract_bound_public_report_digests: { entries: [{ path: publicReportPath, byteDigest: digestFile(join(root, publicReportPath)) }] },
  };

  const rolePaths = {};
  for (const [role, document] of Object.entries(documents)) {
    const path = role === "current_authority" ? authorityPath : role === "current_restatement" ? restatementPath : `tx/${role}.json`;
    rolePaths[role] = path;
    writeJson(join(root, path), document);
  }
  const memberDescriptors = Object.entries(rolePaths).map(([role, path]) => ({ role, path, byteDigest: digestFile(join(root, path)) }));
  const manifest = buildClosedAtomicTransactionManifest({
    scope, transactionId, createdAt: "2026-07-18T00:00:02.000Z", members: memberDescriptors,
  });
  rolePaths.transaction_manifest = "tx/transaction-manifest.json";
  writeJson(join(root, rolePaths.transaction_manifest), manifest);
  const allDescriptors = [...memberDescriptors, {
    role: "transaction_manifest",
    path: rolePaths.transaction_manifest,
    byteDigest: digestFile(join(root, rolePaths.transaction_manifest)),
  }];
  const binding = createClosedAtomicRequestBinding({ scope, transactionId, members: allDescriptors });
  const bindingRelativePath = "binding.json";
  writeJson(join(root, bindingRelativePath), binding);
  return {
    root,
    bindingRelativePath,
    rolePaths,
    receiptPath,
    upstreamPath,
    options: { bindingRelativePath, scope, eventStage: scope },
  };
}

function rewriteBinding(fixture, mutate) {
  const path = join(fixture.root, fixture.bindingRelativePath);
  const binding = JSON.parse(readFileSync(path, "utf8"));
  mutate(binding);
  const { bindingDigest: ignored, ...payload } = binding;
  void ignored;
  writeJson(path, { ...payload, bindingDigest: sha256(payload) });
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function digestFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
