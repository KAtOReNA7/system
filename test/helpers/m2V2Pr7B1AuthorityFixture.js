import { readFileSync } from "node:fs";

import { createReceiptEnvelope } from "../../src/domain/m2V2EvidencePilot/integrityState.js";
import { sha256 } from "../../src/domain/m2V2EvidencePilot/pilotCore.js";
import { appendRequestEvent, replayRequestEventLedger } from "../../src/domain/m2V2EvidencePilot/requestEventLedger.js";

const authorityContract = JSON.parse(readFileSync(
  new URL("../../docs/technical-design/m2-v2/M2-v2-verifier-authority-binding-v0.3.json", import.meta.url),
  "utf8",
));

export const AUTHORITY_SOURCE_HEAD = "badbf453e1e99ba87cc3064601e480a09ff1b149";
export const REQUIRED_DERIVED_INPUT_ROLES = Object.freeze([
  "immutable_inputs",
  "request_event_ledger",
  "effective_receipt_index",
  "event_semantics_profile",
]);

const PUBLIC_NODE_BY_ROLE = Object.freeze({
  remediation_summary: "public_remediation_summary",
  merge_readiness: "public_merge_readiness",
  current_integrity_restatement: "current_integrity_restatement",
  current_state_index: "current_state_index",
});

export function buildAuthorityGraphFixture({
  deriveGraph,
  buildCommitment,
  buildPhysicalMapping,
  buildSelectionDecision,
  buildDerivedInputBindings,
}) {
  const publicReportPathByNode = new Map(authorityContract.canonicalAuthorityGraph.publicReportRegistry.map((entry) => [
    PUBLIC_NODE_BY_ROLE[entry.role],
    entry.repositoryRelativePath,
  ]));
  const physicalMappings = authorityContract.canonicalAuthorityGraph.nodes.map((node) => buildPhysicalMapping({
    nodeId: node.nodeId,
    repositoryRelativePath: publicReportPathByNode.get(node.nodeId)
      ?? `synthetic-authority/${node.nodeId}.json`,
    contentDigestSha256: sha256(`synthetic-content:${node.nodeId}`),
    objectType: "FILE",
  }));
  const tavilyA = {
    runKind: "fresh_repeat",
    canarySlotId: "synthetic-slot-a",
    queryId: "synthetic-query-a",
    intent: "identity",
    queryText: "synthetic authority query",
    country: "CN",
  };
  const request = {
    logicalA: sha256({
      provider: "tavily_structured_search",
      observationKind: "physical_dispatch",
      runKind: tavilyA.runKind,
      canarySlotId: tavilyA.canarySlotId,
      queryId: tavilyA.queryId,
      intent: tavilyA.intent,
    }),
    logicalB: sha256("synthetic-logical-b"),
    physicalA1: sha256("synthetic-physical-a-1"),
    physicalA2: sha256("synthetic-physical-a-2"),
    physicalB1: sha256("synthetic-physical-b-1"),
  };
  const receiptA1 = tavilyReceipt(tavilyA, request.logicalA, request.physicalA1, "a1");
  const receiptA2 = tavilyReceipt(tavilyA, request.logicalA, request.physicalA2, "a2");
  const receiptB1 = relayReceipt(request.logicalB, request.physicalB1, "b1");
  const receipts = [receiptA1, receiptA2, receiptB1];
  const requestEventLedger = completedLedger(receipts);
  const projectionProfileDigestSha256 = sha256("synthetic-projection-profile-v0.1");
  const selectionDecisions = [
    buildSelectionDecision({
      logicalKey: request.logicalA,
      candidatePhysicalKeys: [request.physicalA1, request.physicalA2],
      selectedPhysicalKey: request.physicalA1,
      decision: "SELECTED",
      reason: "UNIQUE_PERMITTED_RECEIPT",
    }),
    buildSelectionDecision({
      logicalKey: request.logicalB,
      candidatePhysicalKeys: [request.physicalB1],
      selectedPhysicalKey: request.physicalB1,
      decision: "SELECTED",
      reason: "UNIQUE_PERMITTED_RECEIPT",
    }),
  ];
  const graph = deriveGraph({ physicalMappings, selectionDecisions });
  const evidence = {
    requestEventLedger,
    receiptEnvelopes: receipts.map((entry) => ({
      envelope: entry.envelope,
      logicalKey: entry.logicalKey,
      physicalKey: entry.physicalKey,
      replayableSuccessful: true,
      projectionProfileDigestSha256,
    })),
    receiptIndexEntries: receipts.map(tuple),
    safeCacheEntries: receipts.map((entry) => ({ ...tuple(entry), projectionProfileDigestSha256 })),
    effectiveReceiptIndexEntries: [tuple(receiptA1), tuple(receiptB1)],
    counterProjection: replayRequestEventLedger(requestEventLedger).counters,
    immutableInputsDigestSha256: sha256("synthetic-immutable-input-set-v0.1"),
    eventSemanticsProfileDigestSha256: sha256("synthetic-event-semantics-profile-v0.1"),
    consumedPhysicalObjectIds: physicalMappings.map((entry) => entry.physicalObjectIdSha256),
  };
  evidence.derivedInputBindings = buildDerivedInputBindings(evidence);
  const trackedCoreCommitment = buildCommitment({
    graph,
    sourceExactHead: AUTHORITY_SOURCE_HEAD,
    supersessionLineage: [{
      role: "authority_graph",
      predecessorPath: "docs/synthetic-authority-v0.2.json",
      predecessorDigestSha256: sha256("synthetic-v0.2-authority"),
      successorPath: "docs/synthetic-authority-v0.3.json",
    }],
  });
  return {
    graph,
    evidence,
    physicalMappings,
    request,
    receipts,
    selectionDecisions,
    trackedCoreCommitment,
  };
}

export function buildAlternateGraph(fixture) {
  const graph = JSON.parse(JSON.stringify(fixture.graph));
  graph.edges[0].semanticKey = "alternate_self_consistent_physical_request_identity";
  delete graph.graphDigestSha256;
  return { ...graph, graphDigestSha256: sha256(graph) };
}

export function duplicatePhysicalGraph(fixture, deriveGraph, buildPhysicalMapping) {
  const mappings = fixture.physicalMappings.map((entry) => ({ ...entry }));
  const source = mappings.find((entry) => entry.nodeId === "safe_cache");
  const index = mappings.findIndex((entry) => entry.nodeId === "receipt_index");
  mappings[index] = buildPhysicalMapping({
    nodeId: "receipt_index",
    repositoryRelativePath: source.repositoryRelativePath,
    contentDigestSha256: source.contentDigestSha256,
    objectType: source.objectType,
  });
  return deriveGraph({ physicalMappings: mappings, selectionDecisions: fixture.selectionDecisions });
}

export function buildFullyReboundReceiptPayloadIdentityBypass(
  fixture,
  { field, value, targetIndex = 0, buildDerivedInputBindings },
) {
  const evidence = JSON.parse(JSON.stringify(fixture.evidence));
  const receipts = fixture.receipts.map((entry) => ({
    ...entry,
    envelope: JSON.parse(JSON.stringify(entry.envelope)),
  }));
  const target = receipts[targetIndex];
  const mutatedPayload = { ...target.envelope.receiptPayload, [field]: value };
  target.envelope = createReceiptEnvelope(mutatedPayload, target.envelope.runtimeView);
  target.receiptDigest = target.envelope.receiptDigest;

  evidence.requestEventLedger = completedLedger(receipts);
  evidence.receiptEnvelopes[targetIndex].envelope = target.envelope;
  for (const collection of [
    evidence.receiptIndexEntries,
    evidence.safeCacheEntries,
    evidence.effectiveReceiptIndexEntries,
  ]) {
    const entry = collection.find((candidate) => (
      candidate.logicalKey === target.logicalKey && candidate.physicalKey === target.physicalKey
    ));
    if (entry) entry.receiptDigest = target.receiptDigest;
  }
  evidence.counterProjection = replayRequestEventLedger(evidence.requestEventLedger).counters;
  evidence.derivedInputBindings = buildDerivedInputBindings(evidence);
  return {
    graph: JSON.parse(JSON.stringify(fixture.graph)),
    evidence,
    trackedCoreCommitment: JSON.parse(JSON.stringify(fixture.trackedCoreCommitment)),
  };
}

function tavilyReceipt(identity, logicalKey, physicalKey, marker) {
  const provider = "tavily_structured_search";
  const stage = "v2b8";
  const requestDigest = sha256({
    provider,
    queryId: identity.queryId,
    queryText: identity.queryText,
    intent: identity.intent,
    country: identity.country,
    runKind: identity.runKind,
    canarySlotId: identity.canarySlotId,
  });
  const envelope = createReceiptEnvelope({
    schema: "m2.v2.v2b8-tavily-query-execution.v0.1",
    ...identity,
    cacheKey: physicalKey,
    providerReceipt: {
      schema: "m2.v2.tavily-provider-receipt.v0.1",
      provider,
      queryId: identity.queryId,
      cacheKey: physicalKey,
    },
    marker,
    status: "completed",
  });
  return {
    logicalKey,
    physicalKey,
    requestDigest,
    provider,
    stage,
    receiptDigest: envelope.receiptDigest,
    envelope,
  };
}

function relayReceipt(logicalKey, physicalKey, marker) {
  const provider = "openai_compatible_relay_extraction";
  const stage = "v2b8";
  const requestDigest = sha256({ logicalKey, physicalKey });
  const envelope = createReceiptEnvelope({
    schema: "m2.v2.relay-extraction-receipt.v0.2",
    provider,
    logicalExtractionKey: logicalKey,
    cacheKey: physicalKey,
    requestPayloadDigest: requestDigest,
    marker,
    status: "completed",
  });
  return {
    logicalKey,
    physicalKey,
    requestDigest,
    provider,
    stage,
    receiptDigest: envelope.receiptDigest,
    envelope,
  };
}

function completedLedger(receipts) {
  let ledger = [];
  let sequence = 0;
  const plannedLogicalKeys = new Set();
  for (const entry of receipts) {
    const eventTypes = [];
    if (!plannedLogicalKeys.has(entry.logicalKey)) {
      eventTypes.push("planned");
      plannedLogicalKeys.add(entry.logicalKey);
    }
    eventTypes.push(
      receipts.find((candidate) => candidate.logicalKey === entry.logicalKey) === entry
        ? "reserved"
        : "compatibility_retry_reserved",
      "dispatched",
      "completed",
    );
    for (const eventType of eventTypes) {
      sequence += 1;
      ledger = appendRequestEvent(ledger, {
        timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, sequence)).toISOString(),
        provider: entry.provider,
        stage: entry.stage,
        logicalKey: entry.logicalKey,
        physicalKey: entry.physicalKey,
        eventType,
        requestDigest: entry.requestDigest,
        receiptDigest: eventType === "completed" ? entry.receiptDigest : null,
      });
    }
  }
  return ledger;
}

function tuple(entry) {
  return {
    logicalKey: entry.logicalKey,
    physicalKey: entry.physicalKey,
    receiptDigest: entry.receiptDigest,
  };
}
