import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  buildClosedAtomicTransactionManifest,
  createClosedAtomicRequestBinding,
  createReceiptEnvelope,
  CURRENT_CLOSED_REQUEST_STATE_BINDING_RELATIVE,
} from "../../src/domain/m2V2EvidencePilot/integrityState.js";
import { sha256 } from "../../src/domain/m2V2EvidencePilot/pilotCore.js";
import { appendRequestEvent, replayRequestEventLedger } from "../../src/domain/m2V2EvidencePilot/requestEventLedger.js";
import {
  buildV2B6SafeCacheEntry,
  newV2B6SafeCache,
} from "../../src/domain/m2V2EvidencePilot/v2b6SafeCache.js";

export const B3_SAFE_CACHE_RELATIVE = "data/private-output/m2-v2-evidence-pilot/v2-b6-extraction-remediation/v2b6-request-cache-private-v0.3.json";

export function makeB3ProviderFixture(options = {}) {
  const root = mkdtempSync(join(tmpdir(), "m2-v2-b3-provider-"));
  return populateB3ProviderFixture(root, options);
}

export function populateB3ProviderFixture(root, options = {}) {
  const phase = options.phase ?? "v2b8";
  const marker = options.marker ?? "primary";
  const transactionId = `synthetic-b3-${phase}-${marker}`;
  const receiptPath = "receipts/receipt-1.json";
  const upstreamPath = "artifacts/upstream.json";
  const immutablePath = "artifacts/immutable.json";
  const publicReportPath = "artifacts/public-report.json";
  const restatementPath = "tx/current-restatement.json";
  const authorityPath = "tx/current-authority.json";

  const envelope = createReceiptEnvelope({
    synthetic: true,
    requestStartedAt: "2026-07-20T00:00:00.000Z",
    responseReceivedAt: "2026-07-20T00:00:01.000Z",
  });
  writeJson(join(root, receiptPath), envelope);
  writeJson(join(root, upstreamPath), { frozen: true, marker });
  writeJson(join(root, immutablePath), { immutable: true, marker });
  writeJson(join(root, publicReportPath), { sanitized: true, marker });

  const requestDigest = sha256({ syntheticRequest: true, phase, marker });
  let ledger = appendRequestEvent([], {
    timestamp: "2026-07-20T00:00:00.000Z", provider: "synthetic", stage: phase,
    logicalKey: "logical-1", physicalKey: "physical-1", eventType: "planned",
    requestDigest, receiptDigest: null,
  });
  for (const eventType of ["reserved", "dispatched", "completed"]) {
    ledger = appendRequestEvent(ledger, {
      timestamp: "2026-07-20T00:00:01.000Z", provider: "synthetic", stage: phase,
      logicalKey: "logical-1", physicalKey: "physical-1", eventType,
      requestDigest, receiptDigest: eventType === "completed" ? envelope.receiptDigest : null,
    });
  }
  const counters = replayRequestEventLedger(ledger).counters;
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
    state: { schema: "synthetic-state", requestCounters: counters },
    cache_index: { schema: "synthetic-cache-index", entries: [{
      adapterVersion: "synthetic-v1", logicalKey: "logical-1", physicalKey: "physical-1",
      receiptDigest: envelope.receiptDigest, transactionId,
    }] },
    receipt_index: { schema: "synthetic-receipt-index", entries: [{ path: receiptPath, receiptDigest: envelope.receiptDigest }] },
    request_event_ledger: ledger,
    counter_projection: { schema: "synthetic-counters", counters },
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
    const path = role === "current_authority" ? authorityPath
      : role === "current_restatement" ? restatementPath : `tx/${role}.json`;
    rolePaths[role] = path;
    writeJson(join(root, path), document);
  }
  const members = Object.entries(rolePaths).map(([role, path]) => ({
    role, path, byteDigest: digestFile(join(root, path)),
  }));
  const manifest = buildClosedAtomicTransactionManifest({
    scope: phase,
    transactionId,
    createdAt: "2026-07-20T00:00:02.000Z",
    members,
  });
  rolePaths.transaction_manifest = "tx/transaction-manifest.json";
  writeJson(join(root, rolePaths.transaction_manifest), manifest);
  const allMembers = [...members, {
    role: "transaction_manifest",
    path: rolePaths.transaction_manifest,
    byteDigest: digestFile(join(root, rolePaths.transaction_manifest)),
  }];
  writeJson(join(root, CURRENT_CLOSED_REQUEST_STATE_BINDING_RELATIVE), createClosedAtomicRequestBinding({
    scope: phase,
    transactionId,
    members: allMembers,
  }));
  writeB3SafeCache(root, options.cacheMarker ?? null);
  return { root, phase, transactionId, rolePaths };
}

export function writeB3SafeCache(root, marker = null) {
  const cache = newV2B6SafeCache();
  if (marker !== null) {
    const entry = buildV2B6SafeCacheEntry({
      json: null,
      requestStartedAt: "2026-07-20T00:00:00.000Z",
      responseReceivedAt: "2026-07-20T00:00:01.000Z",
      latencyMs: 1,
      timeoutMs: 1000,
      timedOut: false,
      httpStatus: 200,
      httpOk: true,
      status: "provider_response_received",
      contentTypeClass: "application_json",
      responseDigest: sha256(`synthetic-response-${marker}`),
      responseByteLength: 2,
    }, {
      schema: "synthetic-receipt",
      receiptDigest: sha256(`synthetic-receipt-${marker}`),
      modelBindingStatus: "synthetic",
      timedOut: false,
      latencyMs: 1,
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    });
    cache.entries[sha256(`synthetic-cache-key-${marker}`)] = entry;
  }
  writeJson(join(root, B3_SAFE_CACHE_RELATIVE), cache);
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function digestFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
