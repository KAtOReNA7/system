import assert from "node:assert/strict";
import test from "node:test";
import {
  CANARY_REQUEST_CAP,
  CANARY_SLOT_RULES,
  buildCanaryTasks,
  evaluateCanaryCoverage,
  selectCanarySubset,
} from "../src/domain/m2V2EvidencePilot/canaryCore.js";
import {
  assertCanaryManifest,
  buildTaskRequestAccountingFromReceipt,
  deriveCanaryBundle,
  reconcileCachedReceiptReservation,
  validateCanaryRuntimeIntegrity,
  validateCompatibilityReceipt,
  validateDerivedBundleIntegrity,
} from "../src/domain/m2V2EvidencePilot/canaryRuntime.js";
import { canonicalJson, sha256 } from "../src/domain/m2V2EvidencePilot/pilotCore.js";

const BASE_URL = "https://relay.example/v1";

test("compatibility receipt is digest-, capability-, model- and base-url-bound", () => {
  const receipt = compatibilityReceipt();
  const env = compatibilityEnv();
  const binding = validateCompatibilityReceipt(receipt, env);
  assert.equal(binding.model, "synthetic-model");
  assert.equal(binding.baseUrlDigest, sha256(BASE_URL));
  assert.equal(binding.compatibilityReceiptDigest, receipt.receiptDigest);

  const tampered = structuredClone(receipt);
  tampered.modelCapabilities["synthetic-model"].webSearchSupported = false;
  tampered.receiptDigest = digestWithout(tampered, "receiptDigest");
  assert.throws(
    () => validateCompatibilityReceipt(tampered, env),
    /canary_compatibility_capability_contract_invalid/u,
  );

  const digestTampered = structuredClone(receipt);
  digestTampered.responses.compatibleModelCount = 2;
  assert.throws(
    () => validateCompatibilityReceipt(digestTampered, env),
    /canary_compatibility_receipt_digest_invalid/u,
  );
  assert.throws(
    () => validateCompatibilityReceipt(receipt, { ...env, OPENAI_BASE_URL: "https://other.example/v1" }),
    /canary_compatibility_base_url_binding_mismatch/u,
  );
});

test("frozen canary manifest must exactly match parent-derived and replayed selection fields", () => {
  const parent = syntheticParentManifest();
  const manifest = syntheticCanaryManifest(parent);
  assert.doesNotThrow(() => assertCanaryManifest(manifest, parent, {
    expectedParentManifestDigest: parent.manifestDigest,
  }));

  const changed = structuredClone(manifest);
  changed.sample[0].title = "different-title";
  changed.canaryManifestDigest = digestWithout(changed, "canaryManifestDigest");
  assert.throws(
    () => assertCanaryManifest(changed, parent, { expectedParentManifestDigest: parent.manifestDigest }),
    /canary_selection_replay_mismatch/u,
  );
});

test("cached concrete receipt reconciles a crash-window reservation without inventing dispatch", () => {
  const task = syntheticRuntime().tasks[0];
  const receipt = syntheticReceipt(task, runtimeBinding());
  const reservation = {
    ordinal: 1,
    status: "dispatch_started",
    requestKey: task.requestKey,
    runKind: task.runKind,
    identityDigest: task.identityDigest,
    reservedAt: "2026-07-17T00:00:00.000Z",
  };
  const result = reconcileCachedReceiptReservation({
    task,
    receipt,
    reservation,
    reconciledAt: "2026-07-17T00:02:00.000Z",
  });
  assert.equal(result.changed, true);
  assert.equal(result.reservation.status, "completed");
  assert.equal(result.reservation.completedAt, receipt.capturedAt);
  assert.equal(result.reservation.receiptDigest, receipt.receiptDigest);
  assert.equal(result.reservation.reconciledFromCache, true);
  assert.equal(result.reservation.reconciledAt, "2026-07-17T00:02:00.000Z");
});

test("runtime integrity verifies exact task-query-receipt-cache-reservation parity and digests", () => {
  const fixture = syntheticRuntime();
  const result = validateCanaryRuntimeIntegrity(fixture);
  assert.deepEqual(result, {
    taskCount: 60,
    receiptCount: 60,
    stateDigestValid: true,
    runtimeBindingMode: "explicit",
  });

  const queryTampered = structuredClone(fixture);
  queryTampered.queryLog[0].queryHash = "tampered";
  assert.throws(() => validateCanaryRuntimeIntegrity(queryTampered), /canary_query_task_field_parity_mismatch/u);

  const receiptTampered = structuredClone(fixture);
  receiptTampered.receipts[0].queryHash = "tampered";
  receiptTampered.receipts[0].receiptDigest = digestWithout(receiptTampered.receipts[0], "receiptDigest");
  receiptTampered.cache.entries[receiptTampered.tasks[0].requestKey] = structuredClone(receiptTampered.receipts[0]);
  receiptTampered.state.reservations[receiptTampered.tasks[0].requestKey].receiptDigest = receiptTampered.receipts[0].receiptDigest;
  receiptTampered.state = withDigest(receiptTampered.state, "stateDigest");
  assert.throws(() => validateCanaryRuntimeIntegrity(receiptTampered), /canary_receipt_task_parity_mismatch/u);

  const stateTampered = structuredClone(fixture);
  stateTampered.state.successCount -= 1;
  assert.throws(() => validateCanaryRuntimeIntegrity(stateTampered), /canary_state_digest_invalid/u);
});

test("legacy completed receipts remain verifiable only through an otherwise exact current binding", () => {
  const fixture = syntheticRuntime();
  delete fixture.state.runtimeBinding;
  delete fixture.cache.runtimeBinding;
  for (const receipt of fixture.receipts) {
    delete receipt.baseUrlDigest;
    delete receipt.compatibilityReceiptDigest;
    receipt.receiptDigest = digestWithout(receipt, "receiptDigest");
    fixture.cache.entries[receipt.requestKey] = structuredClone(receipt);
    fixture.state.reservations[receipt.requestKey].receiptDigest = receipt.receiptDigest;
  }
  fixture.state = withDigest(fixture.state, "stateDigest");
  assert.equal(validateCanaryRuntimeIntegrity({ ...fixture, allowLegacyBinding: true }).runtimeBindingMode, "legacy_inferred");
  assert.throws(
    () => validateCanaryRuntimeIntegrity({ ...fixture, allowLegacyBinding: false }),
    /canary_runtime_binding_missing/u,
  );
});

test("derived bundle is deterministic from frozen manifest and receipts and rejects stale disk artifacts", () => {
  const fixture = syntheticRuntime();
  const derived = deriveCanaryBundle({
    manifest: fixture.manifest,
    receipts: fixture.receipts,
    sourceAllowlist: { approvedDomainEntries: [] },
  });
  const stored = Object.fromEntries(
    ["entity", "evidence", "contradictions", "reproducibility", "cost"]
      .map((field) => [field, structuredClone(derived[field])]),
  );
  assert.deepEqual(validateDerivedBundleIntegrity({ derived, stored }), {
    valid: true,
    bundleDigest: derived.bundleDigest,
  });
  assert.equal(derived.cost.usageObservedRequestCount, 0);
  assert.equal(derived.cost.usageMissingRequestCount, 60);
  assert.equal(derived.cost.tokenUsageComplete, false);
  assert.equal(derived.cost.totalTokens, null);

  stored.cost.requestCount -= 1;
  assert.throws(
    () => validateDerivedBundleIntegrity({ derived, stored }),
    /canary_derived_cost_parity_mismatch/u,
  );
});

test("supplemental receipt is content-audited but cannot retroactively prove provider binding", () => {
  const canaryCost = {
    requestCount: 60,
    usageObservedRequestCount: 51,
    usageMissingRequestCount: 9,
    tokenUsageComplete: false,
    observedInputTokens: 1000,
    observedOutputTokens: 200,
    observedTotalTokens: 1200,
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
  };
  const results = Array.from({ length: 3 }, (_, index) => ({
    ordinal: index + 1,
    inputTokens: 10,
    outputTokens: 2,
    totalTokens: 12,
  }));
  const payload = {
    schema: "m2.v2.luna-synthetic-capability-receipt.v0.1",
    privateOnly: true,
    syntheticOnly: true,
    realWorkDataTransmitted: false,
    requestCount: 3,
    results,
    rawResponsesPersisted: false,
    apiKeyPersisted: false,
    authorizationHeaderPersisted: false,
  };
  const receipt = { ...payload, receiptDigest: sha256(JSON.stringify(payload)) };
  const accounting = buildTaskRequestAccountingFromReceipt(canaryCost, receipt);
  assert.equal(accounting.totalProviderRequestCountThisTask, 63);
  assert.equal(accounting.contentIntegrityPassed, true);
  assert.equal(accounting.providerBindingProven, false);
  assert.equal(accounting.supplementalProviderBindingProven, false);
  assert.equal(accounting.eligibleForModelDecision, false);
  assert.equal(accounting.taskUsageObservedRequestCount, 54);
  assert.equal(accounting.taskUsageMissingRequestCount, 9);
  assert.equal(accounting.taskTokenUsageComplete, false);
  assert.equal(accounting.taskObservedTotalTokens, 1236);
  assert.equal(accounting.taskTotalTokens, null);

  receipt.results.pop();
  receipt.receiptDigest = digestWithout(receipt, "receiptDigest");
  assert.equal(buildTaskRequestAccountingFromReceipt(canaryCost, receipt).contentIntegrityPassed, false);
});

function compatibilityEnv() {
  return {
    OPENAI_BASE_URL: BASE_URL,
    M2_V2_EVIDENCE_API_BASE_URL: BASE_URL,
    M2_V2_APPROVED_RELAY_HOST: new URL(BASE_URL).host,
    M2_V2_EVIDENCE_PROVIDER: "openai_compatible_relay",
  };
}

function compatibilityReceipt() {
  const capabilities = {
    responsesHttpAccepted: true,
    responsesShapeCompatible: true,
    responsesOutputTextObserved: true,
    basicResponsesCompatible: true,
    webSearchHttpAccepted: true,
    webSearchToolCallObserved: true,
    webSearchSupported: true,
    urlCitationAnnotationCount: 1,
    urlCitationAnnotationSupported: true,
    citationAnnotationTypes: ["url_citation"],
    strictJsonSchemaRequestAccepted: true,
    strictJsonOutputParseable: true,
    strictJsonOutputValid: true,
  };
  const payload = {
    schema: "m2.v2.openai-compatible-relay-compatibility-receipt.v0.1",
    privateOnly: true,
    thirdPartyRelay: true,
    officialOpenAIService: false,
    baseUrl: BASE_URL,
    scope: "synthetic_capability_probe_only",
    rawResponsesPersisted: false,
    authorizationHeaderPersisted: false,
    apiKeyPersistedInReceipt: false,
    models: {
      endpointSupported: true,
      returnedModelIds: ["synthetic-model"],
      probedModelIds: ["synthetic-model"],
    },
    responses: { endpointObserved: true, compatibleModelCount: 1 },
    modelCapabilities: { "synthetic-model": capabilities },
    selectedModel: "synthetic-model",
    readiness: "READY",
    blockers: [],
  };
  return { ...payload, receiptDigest: sha256(canonicalJson(payload)) };
}

function runtimeBinding() {
  const compatibility = compatibilityReceipt();
  return validateCompatibilityReceipt(compatibility, compatibilityEnv());
}

function syntheticRuntime() {
  const parent = syntheticParentManifest();
  const manifest = syntheticCanaryManifest(parent);
  const tasks = buildCanaryTasks(manifest);
  const binding = runtimeBinding();
  const queryLog = tasks.map((task, index) => ({
    schema: "m2.v2.canary-query-log.v0.1",
    privateOnly: true,
    ordinal: index + 1,
    canaryManifestDigest: manifest.canaryManifestDigest,
    requestKey: task.requestKey,
    runKind: task.runKind,
    workReference: task.workReference,
    identityDigest: task.identityDigest,
    workTitle: task.title,
    authorByline: task.author,
    sourceType: task.sourceType,
    queryId: task.queryId,
    queryHash: task.queryHash,
    queryCategory: task.queryCategory,
    queryText: task.queryText,
    queryTemplateVersion: task.queryTemplateVersion,
    outboundDataFields: task.outboundDataFields,
    prohibitedFieldsTransmitted: false,
    automaticRetry: false,
  }));
  const receipts = tasks.map((task) => syntheticReceipt(task, binding));
  const entries = Object.fromEntries(receipts.map((receipt) => [receipt.requestKey, structuredClone(receipt)]));
  const reservations = Object.fromEntries(tasks.map((task, index) => [task.requestKey, {
    ordinal: index + 1,
    status: "completed",
    requestKey: task.requestKey,
    runKind: task.runKind,
    identityDigest: task.identityDigest,
    reservedAt: "2026-07-17T00:00:00.000Z",
    completedAt: receipts[index].capturedAt,
    receiptDigest: receipts[index].receiptDigest,
  }]));
  const state = withDigest({
    schema: "m2.v2.canary-execution-state.v0.1",
    privateOnly: true,
    executionStatus: "completed",
    canaryManifestDigest: manifest.canaryManifestDigest,
    providerId: binding.providerId,
    providerVersion: binding.providerVersion,
    providerMode: binding.providerMode,
    selectedModel: binding.model,
    runtimeBinding: binding,
    requestCap: CANARY_REQUEST_CAP,
    plannedRequestCount: tasks.length,
    requestCount: receipts.length,
    completedReceiptCount: receipts.length,
    successCount: receipts.length,
    reservations,
  }, "stateDigest");
  const cache = {
    schema: "m2.v2.canary-cache.v0.1",
    privateOnly: true,
    canaryManifestDigest: manifest.canaryManifestDigest,
    runtimeBinding: binding,
    entries,
  };
  return { manifest, tasks, state, cache, queryLog, receipts, binding };
}

function syntheticReceipt(task, binding) {
  const payload = {
    schema: "m2.v2.canary-provider-receipt.v0.1",
    privateOnly: true,
    requestKey: task.requestKey,
    runKind: task.runKind,
    workReference: task.workReference,
    identityDigest: task.identityDigest,
    queryId: task.queryId,
    queryHash: task.queryHash,
    queryCategory: task.queryCategory,
    providerId: binding.providerId,
    providerVersion: binding.providerVersion,
    providerMode: binding.providerMode,
    model: binding.model,
    baseUrlDigest: binding.baseUrlDigest,
    compatibilityReceiptDigest: binding.compatibilityReceiptDigest,
    capturedAt: "2026-07-17T00:01:00.000Z",
    dispatched: true,
    status: "success",
  };
  return { ...payload, receiptDigest: sha256(canonicalJson(payload)) };
}

function syntheticParentManifest() {
  const sample = CANARY_SLOT_RULES.map((slot, index) => syntheticWork(index, slot));
  for (let index = sample.length; index < 160; index += 1) {
    sample.push(syntheticWork(index, {
      sourceType: index % 2 ? "publication" : "web_original",
      revenueModel: "pure_sales_share",
      highValue: false,
      ambiguityRisk: "medium",
      evidencePrior: "mixed",
    }));
  }
  const payload = {
    schema: "m2.v2.evidence-pilot-private-manifest.v0.1",
    privateOnly: true,
    immutable: true,
    status: "frozen_before_retrieval",
    sample,
  };
  return { ...payload, manifestDigest: sha256(payload) };
}

function syntheticCanaryManifest(parent) {
  const selection = selectCanarySubset(parent);
  const payload = {
    schema: "m2.v2.evidence-canary-private-manifest.v0.1",
    privateOnly: true,
    immutable: true,
    derivedSubset: true,
    status: "frozen_before_canary_retrieval",
    selectedBeforeRetrieval: true,
    retrievalObservedBeforeFreeze: false,
    createdAt: "2026-07-17T00:00:00.000Z",
    seed: selection.seed,
    selectionVersion: "m2-v2-canary-fixed-slot-hash-v0.1",
    parentManifestDigest: parent.manifestDigest,
    parentSampleCount: parent.sample.length,
    sampleCount: 10,
    coverage: evaluateCanaryCoverage(selection.selected),
    requestBudget: {
      maxQueriesPerWork: 8,
      maxTotalRequests: 100,
      plannedPrimaryRequests: 40,
      plannedRepeatRequests: 20,
      plannedTotalRequests: 60,
      automaticRetry: false,
    },
    repeatPolicy: {
      workCount: 5,
      selection: "first_5_by_sha256(seed+repeat5+identity_digest)",
      cacheSharedWithPrimary: false,
      claimAgreementThreshold: 0.8,
    },
    sample: selection.selected,
    repeatSample: selection.repeatWorks.map((work) => ({
      standardWorkId: work.standardWorkId,
      identityDigest: work.identityDigest,
    })),
  };
  return { ...payload, canaryManifestDigest: sha256(payload) };
}

function syntheticWork(index, overrides) {
  return {
    standardWorkId: `synthetic-work-${String(index).padStart(3, "0")}`,
    title: `Synthetic Work ${index}`,
    author: `Synthetic Author ${index}`,
    identityDigest: sha256(`identity-${index}`),
    sourceType: "publication",
    revenueBand: overrides.highValue ? "top10" : "middle",
    revenueModel: "pure_sales_share",
    activity: "dense",
    ambiguityRisk: "medium",
    evidencePrior: "mixed",
    highValue: false,
    sameNameCount: 1,
    ...overrides,
  };
}

function digestWithout(value, digestKey) {
  const clone = structuredClone(value);
  delete clone[digestKey];
  return sha256(canonicalJson(clone));
}

function withDigest(value, digestKey) {
  const clone = structuredClone(value);
  delete clone[digestKey];
  return { ...clone, [digestKey]: sha256(clone) };
}
