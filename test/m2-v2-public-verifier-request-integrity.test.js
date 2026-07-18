import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  buildClosedAtomicTransactionManifest,
  commitAtomicRequestCheckpoint,
  createClosedAtomicRequestBinding,
  createReceiptEnvelope,
  CURRENT_CLOSED_REQUEST_STATE_BINDING_RELATIVE,
  CURRENT_REQUEST_STATE_BINDING_RELATIVE,
  validateVerifierRequestIntegrity,
} from "../src/domain/m2V2EvidencePilot/integrityState.js";
import { sha256 } from "../src/domain/m2V2EvidencePilot/pilotCore.js";
import {
  appendRequestEvent,
  replayRequestEventLedger,
} from "../src/domain/m2V2EvidencePilot/requestEventLedger.js";
import {
  V2B5_PRIVATE_RELATIVE,
  verifyV2B5,
} from "../src/domain/m2V2EvidencePilot/v2b5Runtime.js";
import {
  V2B6_PRIVATE_RELATIVE,
  verifyV2B6,
} from "../src/domain/m2V2EvidencePilot/v2b6Runtime.js";
import { V2B7_PRIVATE_RELATIVE } from "../src/domain/m2V2EvidencePilot/v2b7Contract.js";
import { verifyV2B7 } from "../src/domain/m2V2EvidencePilot/v2b7Runtime.js";

const CREATED_AT = "2026-07-19T00:00:00.000Z";
const BASE_ROLES = Object.freeze([
  "state",
  "cacheIndex",
  "receiptIndex",
  "requestLedger",
  "counters",
  "receiptEnvelopes",
  "recoveredDerivedState",
]);
const STAGES = Object.freeze([
  {
    name: "B5",
    scope: "v2b5",
    verify: verifyV2B5,
    requiredRoles: BASE_ROLES,
    legacyStateRelativePath: `${V2B5_PRIVATE_RELATIVE}/v2b5-execution-state-private-v0.1.json`,
    makeState: (ledger, counters) => ({
      schema: "synthetic-v2b5-state",
      requestEventLedger: ledger,
      requestCounters: counters,
      tavily: { physicalRequestCount: 1, reservations: {} },
      relay: { physicalRequestCount: 0, reservations: {} },
    }),
  },
  {
    name: "B6",
    scope: "v2b6",
    verify: verifyV2B6,
    requiredRoles: BASE_ROLES,
    legacyStateRelativePath: `${V2B6_PRIVATE_RELATIVE}/v2b6-execution-state-private-v0.1.json`,
    makeState: (ledger, counters) => ({
      schema: "synthetic-v2b6-state",
      requestEventLedger: ledger,
      requestCounters: counters,
      physicalRelayRequestCount: 1,
      reservations: {},
    }),
  },
  {
    name: "B7",
    scope: "v2b7",
    verify: verifyV2B7,
    requiredRoles: Object.freeze([...BASE_ROLES, "effectiveReceipts", "recoveredEvaluation"]),
    legacyStateRelativePath: `${V2B7_PRIVATE_RELATIVE}/v2b7-execution-state-private-v0.1.json`,
    makeState: (ledger, counters) => ({
      schema: "synthetic-v2b7-state",
      requestEventLedger: ledger,
      requestCounters: counters,
      tavily: { physicalRequestCount: 1, reservations: {} },
      relay: { physicalRequestCount: 0, reservations: {} },
    }),
  },
]);

const roots = [];
test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

for (const stage of STAGES) {
  test(`${stage.name} public verifier rejects a missing current closed binding`, () => {
    const fixture = makeFixture(stage);
    rmSync(join(fixture.root, CURRENT_CLOSED_REQUEST_STATE_BINDING_RELATIVE), { force: true });

    assertPublicFailure(stage.verify(fixture.root), "request_integrity:current_closed_binding_missing");
  });

  test(`${stage.name} public verifier rejects legacy-only state when atomic binding is missing`, () => {
    const fixture = makeFixture(stage);
    rmSync(join(fixture.root, CURRENT_REQUEST_STATE_BINDING_RELATIVE), { force: true });

    assertPublicFailure(stage.verify(fixture.root), "request_integrity:request_state_binding_missing");
  });

  test(`${stage.name} public verifier rejects an extra atomic member`, () => {
    const fixture = makeFixture(stage);
    const extraPath = `synthetic/${stage.scope}/unexpected-member.json`;
    writeJson(join(fixture.root, extraPath), { unexpected: true });
    rewriteBinding(fixture, (binding) => {
      binding.scopeMembers[stage.scope].unexpectedMember = {
        path: extraPath,
        byteDigest: digestFile(join(fixture.root, extraPath)),
      };
    });

    assertPublicFailure(stage.verify(fixture.root), "request_integrity:request_state_roles_extra:unexpectedMember");
  });

  test(`${stage.name} public verifier rejects a stale legacy state mirror`, () => {
    const fixture = makeFixture(stage);
    writeJson(join(fixture.root, stage.legacyStateRelativePath), { ...fixture.state, stale: true });

    assertPublicFailure(stage.verify(fixture.root), "request_integrity:legacy_state_mirror_stale");
  });

  test(`${stage.name} public verifier independently rejects request-ledger semantic tampering`, () => {
    const fixture = makeFixture(stage);
    rewriteBoundMember(fixture, "requestLedger", (ledger) => {
      ledger[0].requestDigest = "f".repeat(64);
      return ledger;
    });

    const verdict = stage.verify(fixture.root);
    assert.equal(verdict.allPassed, false);
    assert.ok(verdict.issues.some((issue) => issue.startsWith("request_integrity:request_event_ledger:")), verdict.issues.join(","));
  });

  test(`${stage.name} public verifier independently rejects a stale counter projection`, () => {
    const fixture = makeFixture(stage);
    rewriteBoundMember(fixture, "counters", (counters) => ({
      ...counters,
      completed: counters.completed + 1,
    }));

    assertPublicFailure(stage.verify(fixture.root), "request_integrity:request_counters:counter_replay_mismatch");
  });
}

function makeFixture(stage) {
  const root = mkdtempSync(join(tmpdir(), `m2-v2-${stage.scope}-public-verifier-`));
  roots.push(root);
  const ledger = buildLedger(stage.scope);
  const counters = replayRequestEventLedger(ledger, { stage: stage.scope }).counters;
  const state = stage.makeState(ledger, counters);
  const checkpoint = commitAtomicRequestCheckpoint(root, {
    scope: stage.scope,
    createdAt: CREATED_AT,
    state,
    caches: {},
    receipts: [],
    requestLedger: ledger,
    counters,
    adapterVersion: "synthetic-verifier-v1",
    manifestBindings: {},
  });
  const fixture = { root, stage, state, checkpoint };
  addRequiredDerivedMembers(fixture);
  writeJson(join(root, stage.legacyStateRelativePath), state);
  addCurrentClosedBinding(fixture);

  const baseline = validateVerifierRequestIntegrity(root, {
    scope: stage.scope,
    eventStage: stage.scope,
    requiredAtomicRoles: stage.requiredRoles,
    legacyStateRelativePath: stage.legacyStateRelativePath,
    requireClosedBinding: true,
  });
  assert.equal(baseline.valid, true, baseline.issues.join(","));
  assert.equal(baseline.requestEventLedgerVerified, true);
  assert.equal(baseline.requestCounterReplayVerified, true);
  return fixture;
}

function addCurrentClosedBinding(fixture) {
  const { root } = fixture;
  const transactionId = "synthetic-current-closed-transaction-v0.2";
  const scope = "v2b8";
  const receiptPath = "synthetic/current-closed/receipt.json";
  const upstreamPath = "synthetic/current-closed/upstream.json";
  const immutablePath = "synthetic/current-closed/immutable.json";
  const publicReportPath = "synthetic/current-closed/public-report.json";
  const restatementPath = "synthetic/current-closed/current-restatement.json";
  const authorityPath = "synthetic/current-closed/current-authority.json";

  const receiptPayload = {
    synthetic: true,
    requestStartedAt: "2026-07-19T00:00:00.000Z",
    responseReceivedAt: "2026-07-19T00:00:01.000Z",
  };
  const envelope = createReceiptEnvelope(receiptPayload);
  writeJson(join(root, receiptPath), envelope);
  writeJson(join(root, upstreamPath), { frozen: true });
  writeJson(join(root, immutablePath), { immutable: true });
  writeJson(join(root, publicReportPath), { sanitized: true });

  const requestDigest = sha256({ syntheticCurrentRequest: true });
  const eventBase = {
    timestamp: "2026-07-19T00:00:00.000Z",
    provider: "synthetic",
    stage: scope,
    logicalKey: "current-logical-1",
    physicalKey: "current-physical-1",
    requestDigest,
    receiptDigest: null,
  };
  let ledger = appendRequestEvent([], { ...eventBase, eventType: "planned" });
  ledger = appendRequestEvent(ledger, { ...eventBase, eventType: "reserved" });
  ledger = appendRequestEvent(ledger, { ...eventBase, eventType: "dispatched" });
  ledger = appendRequestEvent(ledger, {
    ...eventBase,
    timestamp: "2026-07-19T00:00:01.000Z",
    eventType: "completed",
    receiptDigest: envelope.receiptDigest,
  });
  const counters = replayRequestEventLedger(ledger, { stage: scope }).counters;

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
    currentAuthority: {
      currentRestatementArtifact: restatementPath,
      currentRestatementDigest: digestFile(join(root, restatementPath)),
    },
    entries: [],
  };

  const documents = {
    state: { schema: "synthetic-current-state", requestCounters: counters },
    cache_index: {
      schema: "synthetic-current-cache-index",
      entries: [{
        adapterVersion: "synthetic-v1",
        logicalKey: "current-logical-1",
        physicalKey: "current-physical-1",
        receiptDigest: envelope.receiptDigest,
        transactionId,
      }],
    },
    receipt_index: {
      schema: "synthetic-current-receipt-index",
      entries: [{ path: receiptPath, receiptDigest: envelope.receiptDigest }],
    },
    request_event_ledger: ledger,
    counter_projection: { schema: "synthetic-current-counters", counters },
    execution_contract: { schema: "synthetic-current-contract", providerRequestDelta: 0 },
    immutable_manifests: {
      entries: [{ path: immutablePath, byteDigest: digestFile(join(root, immutablePath)) }],
    },
    frozen_upstream_digests: {
      entries: [{ path: upstreamPath, byteDigest: digestFile(join(root, upstreamPath)) }],
    },
    derived_evaluation: { schema: "synthetic-current-evaluation", decision: "CANARY_FAIL" },
    effective_receipt_index: { entries: [{ receiptDigest: envelope.receiptDigest }] },
    current_authority: authority,
    current_restatement: restatement,
    contract_bound_public_report_digests: {
      entries: [{ path: publicReportPath, byteDigest: digestFile(join(root, publicReportPath)) }],
    },
  };

  const rolePaths = {};
  for (const [role, document] of Object.entries(documents)) {
    const path = role === "current_authority"
      ? authorityPath
      : role === "current_restatement"
        ? restatementPath
        : `synthetic/current-closed/${role}.json`;
    rolePaths[role] = path;
    writeJson(join(root, path), document);
  }
  const memberDescriptors = Object.entries(rolePaths).map(([role, path]) => ({
    role,
    path,
    byteDigest: digestFile(join(root, path)),
  }));
  const manifest = buildClosedAtomicTransactionManifest({
    scope,
    transactionId,
    createdAt: "2026-07-19T00:00:02.000Z",
    members: memberDescriptors,
  });
  const manifestPath = "synthetic/current-closed/transaction-manifest.json";
  writeJson(join(root, manifestPath), manifest);
  const binding = createClosedAtomicRequestBinding({
    scope,
    transactionId,
    members: [
      ...memberDescriptors,
      { role: "transaction_manifest", path: manifestPath, byteDigest: digestFile(join(root, manifestPath)) },
    ],
  });
  writeJson(join(root, CURRENT_CLOSED_REQUEST_STATE_BINDING_RELATIVE), binding);
}

function buildLedger(stage) {
  const requestDigest = sha256({ synthetic: true, stage });
  const base = {
    timestamp: CREATED_AT,
    provider: "synthetic",
    stage,
    logicalKey: `${stage}-logical-1`,
    physicalKey: `${stage}-physical-1`,
    requestDigest,
    receiptDigest: null,
  };
  let ledger = appendRequestEvent([], { ...base, eventType: "planned" });
  ledger = appendRequestEvent(ledger, { ...base, eventType: "reserved" });
  ledger = appendRequestEvent(ledger, { ...base, eventType: "dispatched" });
  return appendRequestEvent(ledger, {
    ...base,
    eventType: "completed",
    receiptDigest: sha256({ syntheticReceipt: true, stage }),
  });
}

function addRequiredDerivedMembers(fixture) {
  rewriteBinding(fixture, (binding) => {
    for (const role of fixture.stage.requiredRoles.filter((candidate) => !BASE_ROLES.slice(0, 5).includes(candidate))) {
      const relativePath = `synthetic/${fixture.stage.scope}/${role}.json`;
      writeJson(join(fixture.root, relativePath), { privateOnly: true, role, synthetic: true });
      binding.scopeMembers[fixture.stage.scope][role] = {
        path: relativePath,
        byteDigest: digestFile(join(fixture.root, relativePath)),
      };
    }
  });
}

function rewriteBoundMember(fixture, role, mutate) {
  const bindingPath = join(fixture.root, CURRENT_REQUEST_STATE_BINDING_RELATIVE);
  const binding = JSON.parse(readFileSync(bindingPath, "utf8"));
  const descriptor = binding.scopeMembers[fixture.stage.scope][role];
  const memberPath = join(fixture.root, descriptor.path);
  const document = JSON.parse(readFileSync(memberPath, "utf8"));
  writeJson(memberPath, mutate(document));
  descriptor.byteDigest = digestFile(memberPath);
  const digestField = role === "requestLedger" ? "requestLedgerDigest" : "counterDigest";
  binding.stageTransactions[fixture.stage.scope][digestField] = descriptor.byteDigest;
  updateBindingDigest(binding);
  writeJson(bindingPath, binding);
}

function rewriteBinding(fixture, mutate) {
  const bindingPath = join(fixture.root, CURRENT_REQUEST_STATE_BINDING_RELATIVE);
  const binding = JSON.parse(readFileSync(bindingPath, "utf8"));
  mutate(binding);
  updateBindingDigest(binding);
  writeJson(bindingPath, binding);
}

function updateBindingDigest(binding) {
  const { bindingDigest: _discarded, ...payload } = binding;
  binding.bindingDigest = sha256(payload);
}

function assertPublicFailure(verdict, issue) {
  assert.equal(verdict.allPassed, false);
  assert.ok(verdict.issues.includes(issue), verdict.issues.join(","));
  assert.equal(verdict.requestStateBindingVerified, false);
  assert.equal(verdict.full160Authorized, false);
}

function digestFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
