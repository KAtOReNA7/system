import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { canonicalJson, sha256 } from "./pilotCore.js";
import {
  commitAtomicRequestCheckpoint,
  readCurrentRequestStateSnapshot,
  withReceiptRuntimeView,
} from "./integrityState.js";
import {
  V2B5_SOURCE_RECORD_SCHEMA,
  buildV2B5SourceRecordSet,
  mergeAndLimitV2B5SourceRecords,
  validateV2B5SourceRecord,
} from "./sourceRecordV2B5.js";
import {
  V2B5_DEFAULT_SOURCE_GOVERNANCE_POLICY,
  V2B5_SOURCE_GOVERNANCE_SCHEMA,
  buildV2B5ResearchCandidateRegistry,
  classifyV2B5ProhibitedSource,
  validateV2B5SourceGovernancePolicy,
} from "./sourceGovernanceV2B5.js";
import {
  V2B5_EXTRACTION_ADAPTER_VERSION,
  V2B5_EXTRACTION_SCHEMA,
} from "./extractionV2B5.js";
import {
  V2B5_TAVILY_ADAPTER_VERSION,
  V2B5_TAVILY_DEFAULTS,
  V2B5_TAVILY_PROVIDER_ID,
  V2B5_TAVILY_RECEIPT_SCHEMA,
  TavilyStructuredSearchProviderV2B5,
  buildV2B5TavilyCacheDescriptor,
  classifyV2B5TavilyProviderDecision,
  validateV2B5TavilyCapabilityState,
} from "./tavilySearchProviderV2B5.js";
import {
  OpenAICompatibleRelayExtractionProviderV2B5,
  V2B5_RELAY_EXTRACTION_PROVIDER_ID,
} from "./relayExtractionProviderV2B5.js";
import {
  V2B5_MODELS,
  buildV2B5BenchmarkManifest,
  buildV2B5WorkQueries,
  evaluateV2B5Canary,
  evaluateV2B5ExtractionBenchmark,
  shouldEscalateV2B5Extraction,
  validateV2B5WorkQueries,
} from "./v2b5Evaluation.js";

export const V2B5_START_SHA = "318fa636914629117c58479e0265606a1a3df3d9";
export const V2B5_FROZEN_CANARY_DIGEST = "883a0c8054d71029e2f1d385e9bc98ff4dbcccfc8659ee3764cc128e1a640248";
export const V2B5_TAVILY_REQUEST_CAP = 40;
export const V2B5_RELAY_REQUEST_CAP = 40;
export const V2B5_PRIVATE_RELATIVE = "data/private-output/m2-v2-evidence-pilot/v2-b5-independent-search-canary";
export const V2B5_FROZEN_CANARY_RELATIVE = "data/private-output/m2-v2-evidence-pilot/canary-v0.1/canary-manifest-private-v0.1.json";
export const V2B5_PRIVATE_WORKBOOK_RELATIVE = "data/private-output/m2-v2-evidence-pilot/canary-v3/M2-v2-canary-v3-private-review-workbook-v0.1.xlsx";

const FILES = Object.freeze({
  state: "v2b5-execution-state-private-v0.1.json",
  tavilyCache: "tavily-cache-private-v0.1.json",
  relayCache: "relay-extraction-cache-private-v0.1.json",
  capability: "tavily-capability-receipt-private-v0.1.json",
  capabilityHistory: "tavily-capability-history-private-v0.1.json",
  benchmarkManifest: "luna-terra-benchmark-manifest-private-v0.1.json",
  benchmarkSearch: "luna-terra-benchmark-search-private-v0.1.json",
  benchmarkEvaluation: "luna-terra-benchmark-evaluation-private-v0.1.json",
  canaryManifest: "canary-v3-manifest-private-v0.1.json",
  canarySearch: "canary-v3-search-private-v0.1.json",
  canaryEvaluation: "canary-v3-evaluation-private-v0.1.json",
  tavilyReceipts: "tavily-provider-receipts-private-v0.1.ndjson",
  relayReceipts: "relay-extraction-receipts-private-v0.1.ndjson",
  sourceRecords: "source-records-private-v0.2.ndjson",
  evidenceRecords: "evidence-records-private-v0.1.ndjson",
  registry: "research-candidate-registry-private-v0.3.json",
  usageLedger: "cost-usage-ledger-private-v0.1.json",
  workbookData: "private-review-workbook-data-v0.1.json",
  pretest: "pretest-receipt-private-v0.1.json",
  validation: "full-validation-receipt-private-v0.1.json",
  verifier: "verification-receipt-private-v0.1.json",
  egressDiagnostic: "egress-permission-diagnostic-private-v0.1.json",
});

const PUBLIC_REPORTS = Object.freeze({
  diagnosticJson: "docs/analysis/m2-v2/M2-v2-egress-permission-diagnostic-v0.1.json",
  diagnosticMarkdown: "docs/analysis/m2-v2/M2-v2-egress-permission-diagnostic-v0.1.md",
  capabilityJson: "docs/analysis/m2-v2/M2-v2-tavily-capability-report-v0.2.json",
  capabilityMarkdown: "docs/analysis/m2-v2/M2-v2-tavily-capability-report-v0.2.md",
  capabilityLegacyJson: "docs/analysis/m2-v2/M2-v2-tavily-capability-report-v0.1.json",
  capabilityLegacyMarkdown: "docs/analysis/m2-v2/M2-v2-tavily-capability-report-v0.1.md",
  benchmarkJson: "docs/analysis/m2-v2/M2-v2-luna-terra-extraction-benchmark-v0.1.json",
  benchmarkMarkdown: "docs/analysis/m2-v2/M2-v2-luna-terra-extraction-benchmark-v0.1.md",
  executionJson: "docs/analysis/m2-v2/M2-v2-canary-v3-execution-summary-v0.1.json",
  executionMarkdown: "docs/analysis/m2-v2/M2-v2-canary-v3-execution-summary-v0.1.md",
  qualityJson: "docs/analysis/m2-v2/M2-v2-canary-v3-quality-report-v0.1.json",
  qualityMarkdown: "docs/analysis/m2-v2/M2-v2-canary-v3-quality-report-v0.1.md",
  decisionJson: "docs/analysis/m2-v2/M2-v2-canary-v3-decision-v0.1.json",
  decisionMarkdown: "docs/analysis/m2-v2/M2-v2-canary-v3-decision-v0.1.md",
  resumeJson: "docs/analysis/m2-v2/M2-v2-v2b5-resume-summary-v0.1.json",
  resumeMarkdown: "docs/analysis/m2-v2/M2-v2-v2b5-resume-summary-v0.1.md",
  nextStepJson: "docs/analysis/m2-v2/M2-v2-v2b5-next-step-v0.2.json",
  nextStepMarkdown: "docs/analysis/m2-v2/M2-v2-v2b5-next-step-v0.2.md",
  nextStepLegacyJson: "docs/analysis/m2-v2/M2-v2-v2b5-next-step-v0.1.json",
  nextStepLegacyMarkdown: "docs/analysis/m2-v2/M2-v2-v2b5-next-step-v0.1.md",
});

export function checkAndFreezeV2B5(root, options = {}) {
  const privateStore = ensurePrivateStore(root);
  const frozenCanary = readJson(join(root, V2B5_FROZEN_CANARY_RELATIVE));
  assertFrozenCanaryManifest(frozenCanary);
  const benchmarkCandidate = buildV2B5BenchmarkManifest(frozenCanary, options.now?.() ?? new Date().toISOString());
  const benchmarkManifest = persistImmutable(
    join(privateStore, FILES.benchmarkManifest),
    benchmarkCandidate,
    "benchmarkManifestDigest",
    "v2b5_benchmark_manifest_changed",
    { digestExcludedKeys: ["createdAt"], allowLegacyDigestMigration: true },
  );
  const canaryCandidate = buildCanaryV3Manifest(frozenCanary, options.now?.() ?? new Date().toISOString());
  const canaryManifest = persistImmutable(
    join(privateStore, FILES.canaryManifest),
    canaryCandidate,
    "manifestDigest",
    "v2b5_canary_v3_manifest_changed",
  );
  const policyValidation = validateV2B5SourceGovernancePolicy(V2B5_DEFAULT_SOURCE_GOVERNANCE_POLICY);
  if (!policyValidation.valid) throw new Error(`v2b5_governance_invalid:${policyValidation.issues.join(",")}`);
  const config = loadV2B5Configuration(root, options.env);
  return {
    privateStore,
    frozenCanary,
    benchmarkManifest,
    canaryManifest,
    policy: V2B5_DEFAULT_SOURCE_GOVERNANCE_POLICY,
    config: publicConfigurationProjection(config),
  };
}

export function readV2B5FrozenState(root) {
  const privateStore = join(root, V2B5_PRIVATE_RELATIVE);
  const frozenCanary = readJson(join(root, V2B5_FROZEN_CANARY_RELATIVE));
  assertFrozenCanaryManifest(frozenCanary);
  const benchmarkManifest = readJson(join(privateStore, FILES.benchmarkManifest));
  const canaryManifest = readJson(join(privateStore, FILES.canaryManifest));
  const policyValidation = validateV2B5SourceGovernancePolicy(V2B5_DEFAULT_SOURCE_GOVERNANCE_POLICY);
  if (!policyValidation.valid) throw new Error(`v2b5_governance_invalid:${policyValidation.issues.join(",")}`);
  return {
    privateStore,
    frozenCanary,
    benchmarkManifest,
    canaryManifest,
    policy: V2B5_DEFAULT_SOURCE_GOVERNANCE_POLICY,
  };
}

export async function runV2B5(root, options = {}) {
  const frozen = checkAndFreezeV2B5(root, options);
  const privateStore = frozen.privateStore;
  const config = loadV2B5Configuration(root, options.env);
  const statePath = join(privateStore, FILES.state);
  const tavilyCachePath = join(privateStore, FILES.tavilyCache);
  const relayCachePath = join(privateStore, FILES.relayCache);
  const bindings = configurationBindings(config);
  const stateAlreadyExists = existsSync(statePath);
  let state = stateAlreadyExists ? readJson(statePath) : newExecutionState(frozen, bindings);
  if (stateAlreadyExists && options.resume !== true) throw new Error("v2b5_existing_execution_requires_resume");
  const tavilyCache = existsSync(tavilyCachePath) ? readJson(tavilyCachePath) : newCache("tavily", frozen, bindings);
  const relayCache = existsSync(relayCachePath) ? readJson(relayCachePath) : newCache("relay", frozen, bindings);
  const existingCapabilityPath = join(privateStore, FILES.capability);
  const existingCapability = existsSync(existingCapabilityPath) ? readJson(existingCapabilityPath) : null;
  const migration = migrateV2B5LegacyCapabilityState(
    state,
    existingCapability,
    options.now?.() ?? new Date().toISOString(),
  );
  state = migration.state;
  if (migration.migrated) {
    atomicWriteJson(statePath, state);
    atomicWriteJson(existingCapabilityPath, migration.capability);
  }
  assertExecutionContainers(state, tavilyCache, relayCache, frozen, bindings);
  reconcileIndeterminateReservations(state, tavilyCache, relayCache, options.now?.() ?? new Date().toISOString());
  checkpointExecution(root, privateStore, state, tavilyCache, relayCache);
  const tavily = new TavilyStructuredSearchProviderV2B5({
    baseUrl: config.tavily.baseUrl,
    apiKey: config.tavily.apiKey,
    topic: config.tavily.topic,
    searchDepth: config.tavily.searchDepth,
    maxResults: config.tavily.maxResults,
    country: config.tavily.country,
    projectId: config.tavily.projectId,
    timeoutMs: config.tavily.timeoutMs,
    fetchImpl: options.fetchImpl,
  });
  const relay = new OpenAICompatibleRelayExtractionProviderV2B5({
    baseUrl: config.relay.baseUrl,
    apiKey: config.relay.apiKey,
    timeoutMs: config.relay.timeoutMs,
    fetchImpl: options.fetchImpl,
  });
  const context = {
    root,
    privateStore,
    frozen,
    config,
    state,
    tavilyCache,
    relayCache,
    tavily,
    relay,
    bindings,
    resume: options.resume === true,
    now: options.now ?? (() => new Date().toISOString()),
    onProgress: options.onProgress ?? (() => {}),
  };

  if (options.resume === true && canReuseV2B5TerminalPreGateResult(state, privateStore)) {
    const existingResults = readV2B5Results(root);
    writeV2B5PublicReports(root, existingResults);
    return existingResults;
  }

  const pretest = runTargetedPretest(root);
  atomicWriteJson(join(privateStore, FILES.pretest), pretest);
  state.pretestsPassed = pretest.allPassed;
  checkpointExecution(root, privateStore, state, tavilyCache, relayCache);

  const capability = await runCapabilityProbe(context);
  atomicWriteJson(join(privateStore, FILES.capability), capability);
  state.tavilyProviderDecision = capability.tavilyProviderDecision;
  if (capability.tavilyProviderDecision !== "READY") {
    state.executionStatus = "blocked_provider_capability";
    state.canaryExecuted = false;
    checkpointExecution(root, privateStore, state, tavilyCache, relayCache);
    const result = finalizePrivateArtifacts(context, { capability, benchmarkEvaluation: null, searchRuns: [], canaryEvaluation: blockedCanaryEvaluation(frozen.canaryManifest, capability.tavilyProviderDecision) });
    writeV2B5PublicReports(root, result);
    return result;
  }

  const benchmarkSearchRuns = await runSearchPopulation(context, {
    phase: "benchmark",
    runKind: "primary",
    works: frozen.benchmarkManifest.sample,
    executionNamespace: "v2b5-benchmark-primary-v1",
  });
  atomicWriteJson(join(privateStore, FILES.benchmarkSearch), {
    schema: "m2.v2.benchmark-search-results.v0.1",
    privateOnly: true,
    runs: benchmarkSearchRuns,
  });
  await runBenchmarkExtractions(context, benchmarkSearchRuns);
  const benchmarkRelayReceipts = Object.values(context.relayCache.entries).filter((receipt) => receipt.phase === "benchmark");
  const benchmarkEvaluation = evaluateV2B5ExtractionBenchmark({
    manifest: frozen.benchmarkManifest,
    relayReceipts: benchmarkRelayReceipts,
    evaluatedAt: context.now(),
  });
  atomicWriteJson(join(privateStore, FILES.benchmarkEvaluation), benchmarkEvaluation);
  state.benchmarkDecision = benchmarkEvaluation.extractionBenchmarkDecision;
  state.defaultExtractionModel = benchmarkEvaluation.defaultExtractionModel;
  state.escalationModel = benchmarkEvaluation.escalationModel;
  checkpointExecution(root, privateStore, state, tavilyCache, relayCache);

  const preGate = evaluateCanaryPreGate(context, capability, benchmarkSearchRuns, benchmarkEvaluation);
  state.canaryPreGate = preGate;
  if (!preGate.allPassed) {
    state.executionStatus = "blocked_canary_pre_gate";
    state.canaryExecuted = false;
    checkpointExecution(root, privateStore, state, tavilyCache, relayCache);
    const result = finalizePrivateArtifacts(context, {
      capability,
      benchmarkEvaluation,
      searchRuns: benchmarkSearchRuns,
      canaryEvaluation: blockedCanaryEvaluation(frozen.canaryManifest, `pre_gate:${preGate.failedIds.join(",")}`),
    });
    writeV2B5PublicReports(root, result);
    return result;
  }

  const primarySearchRuns = await runSearchPopulation(context, {
    phase: "canary",
    runKind: "primary",
    works: frozen.canaryManifest.sample,
    executionNamespace: "v2b5-canary-primary-v1",
  });
  const repeatWorks = frozen.canaryManifest.repeatSample.map((item) => frozen.canaryManifest.sample.find((work) => work.canarySlotId === item.canarySlotId));
  const repeatSearchRuns = await runSearchPopulation(context, {
    phase: "canary",
    runKind: "repeat",
    works: repeatWorks,
    executionNamespace: "v2b5-canary-repeat-v1",
  });
  const canarySearchRuns = [...primarySearchRuns, ...repeatSearchRuns];
  atomicWriteJson(join(privateStore, FILES.canarySearch), {
    schema: "m2.v2.canary-v3-search-results.v0.1",
    privateOnly: true,
    runs: canarySearchRuns,
  });
  const canaryRelayReceipts = await runCanaryExtractions(context, canarySearchRuns, benchmarkEvaluation);
  state.canaryExecuted = true;
  state.executionStatus = "canary_completed_validation_pending";
  checkpointExecution(root, privateStore, state, tavilyCache, relayCache);
  const canaryEvaluation = evaluateV2B5Canary({
    manifest: frozen.canaryManifest,
    searchRuns: canarySearchRuns,
    relayReceipts: canaryRelayReceipts,
    executed: true,
    defaultExtractionModel: benchmarkEvaluation.defaultExtractionModel,
    escalationModel: benchmarkEvaluation.escalationModel,
    allTestsPassed: readValidationPassed(privateStore),
    evaluatedAt: context.now(),
  });
  atomicWriteJson(join(privateStore, FILES.canaryEvaluation), canaryEvaluation);
  const result = finalizePrivateArtifacts(context, {
    capability,
    benchmarkEvaluation,
    searchRuns: [...benchmarkSearchRuns, ...canarySearchRuns],
    canaryEvaluation,
  });
  writeV2B5PublicReports(root, result);
  return result;
}

export function canReuseV2B5TerminalPreGateResult(state, privateStore) {
  if (state?.executionStatus !== "blocked_canary_pre_gate"
    || state?.tavilyProviderDecision !== "READY"
    || state?.canaryExecuted !== false) return false;
  for (const name of [FILES.capability, FILES.benchmarkEvaluation, FILES.canaryEvaluation]) {
    if (!existsSync(join(privateStore, name))) return false;
  }
  try {
    const capability = readJson(join(privateStore, FILES.capability));
    const benchmark = readJson(join(privateStore, FILES.benchmarkEvaluation));
    const canary = readJson(join(privateStore, FILES.canaryEvaluation));
    return capability.tavilyProviderDecision === "READY"
      && benchmark.extractionBenchmarkDecision === "FAIL"
      && canary.executed === false
      && canary.decision === "CANARY_BLOCKED";
  } catch {
    return false;
  }
}

export async function runV2B5CapabilityAuditProbe(root, options = {}) {
  const frozen = checkAndFreezeV2B5(root, options);
  const privateStore = frozen.privateStore;
  const config = loadV2B5Configuration(root, options.env);
  const statePath = join(privateStore, FILES.state);
  const tavilyCachePath = join(privateStore, FILES.tavilyCache);
  const relayCachePath = join(privateStore, FILES.relayCache);
  const capabilityPath = join(privateStore, FILES.capability);
  if (!existsSync(statePath) || !existsSync(tavilyCachePath) || !existsSync(relayCachePath)) {
    throw new Error("v2b5_capability_audit_requires_existing_state");
  }
  let state = readJson(statePath);
  const tavilyCache = readJson(tavilyCachePath);
  const relayCache = readJson(relayCachePath);
  const bindings = configurationBindings(config);
  const priorCapability = existsSync(capabilityPath) ? readJson(capabilityPath) : null;
  const migration = migrateV2B5LegacyCapabilityState(
    state,
    priorCapability,
    options.now?.() ?? new Date().toISOString(),
  );
  state = migration.state;
  if (migration.migrated) atomicWriteJson(capabilityPath, migration.capability);
  assertExecutionContainers(state, tavilyCache, relayCache, frozen, bindings);
  reconcileIndeterminateReservations(state, tavilyCache, relayCache, options.now?.() ?? new Date().toISOString());
  checkpointExecution(root, privateStore, state, tavilyCache, relayCache);
  const tavily = new TavilyStructuredSearchProviderV2B5({
    baseUrl: config.tavily.baseUrl,
    apiKey: config.tavily.apiKey,
    topic: config.tavily.topic,
    searchDepth: config.tavily.searchDepth,
    maxResults: config.tavily.maxResults,
    country: config.tavily.country,
    projectId: config.tavily.projectId,
    timeoutMs: config.tavily.timeoutMs,
    fetchImpl: options.fetchImpl,
  });
  const context = {
    root,
    privateStore,
    frozen,
    config,
    state,
    tavilyCache,
    relayCache,
    tavily,
    relay: null,
    bindings,
    resume: true,
    now: options.now ?? (() => new Date().toISOString()),
    onProgress: options.onProgress ?? (() => {}),
  };
  const capability = await runCapabilityProbe(context, { forceAuditProbe: true });
  atomicWriteJson(capabilityPath, capability);
  appendCapabilityHistory(privateStore, [priorCapability, capability].filter(Boolean));
  state.tavilyProviderDecision = capability.tavilyProviderDecision;
  checkpointExecution(root, privateStore, state, tavilyCache, relayCache);
  return { capability, state };
}

export function recordV2B5ExecutionBlock(root, reason = "external_dispatch_not_permitted_by_execution_environment") {
  if (reason !== "external_dispatch_not_permitted_by_execution_environment") {
    throw new Error("v2b5_execution_block_reason_invalid");
  }
  const frozen = checkAndFreezeV2B5(root);
  const config = loadV2B5Configuration(root);
  const bindings = configurationBindings(config);
  const statePath = join(frozen.privateStore, FILES.state);
  if (existsSync(statePath)) throw new Error("v2b5_execution_state_already_exists");
  const state = newExecutionState(frozen, bindings);
  const tavilyCache = newCache("tavily", frozen, bindings);
  const relayCache = newCache("relay", frozen, bindings);
  const pretest = runTargetedPretest(root);
  state.pretestsPassed = pretest.allPassed;
  state.executionStatus = "blocked_provider_capability";
  state.tavilyProviderDecision = "BLOCKED_EGRESS_PERMISSION";
  state.canaryExecuted = false;
  state.externalDispatchBlockedBeforeExecution = true;
  const context = {
    root,
    privateStore: frozen.privateStore,
    frozen,
    config,
    state,
    tavilyCache,
    relayCache,
    bindings,
    resume: false,
    now: () => new Date().toISOString(),
    onProgress: () => {},
  };
  checkpointExecution(root, frozen.privateStore, state, tavilyCache, relayCache);
  atomicWriteJson(join(frozen.privateStore, FILES.pretest), pretest);
  const capability = buildV2B5ExecutionBlockCapability(bindings, reason);
  atomicWriteJson(join(frozen.privateStore, FILES.capability), capability);
  const canaryEvaluation = blockedCanaryEvaluation(frozen.canaryManifest, reason);
  const result = finalizePrivateArtifacts(context, {
    capability,
    benchmarkEvaluation: null,
    searchRuns: [],
    canaryEvaluation,
  });
  writeV2B5PublicReports(root, result);
  return result;
}

export function buildV2B5ExecutionBlockCapability(bindings, reason = "external_dispatch_not_permitted_by_execution_environment") {
  if (reason !== "external_dispatch_not_permitted_by_execution_environment") {
    throw new Error("v2b5_execution_block_reason_invalid");
  }
  const capability = {
    schema: "m2.v2.tavily-capability.v0.1",
    privateOnly: true,
    syntheticQueryOnly: true,
    includeUsageSupported: null,
    compatibilityRetryUsed: false,
    attemptCount: 0,
    tavilyProviderDecision: "BLOCKED_EGRESS_PERMISSION",
    tavilyBindingDigest: bindings?.tavily ?? null,
    executionBlockedBeforeDispatch: true,
    blockerReason: reason,
    finalResult: {
      schema: "m2.v2.tavily-query-execution.v0.1",
      privateOnly: true,
      phase: "capability",
      runKind: "synthetic",
      dispatched: false,
      httpSuccess: null,
      httpStatus: null,
      providerConnectivityPassed: null,
      providerContractCompatibility: "NOT_EVALUATED",
      contractValid: null,
      status: "blocked_before_dispatch",
      sourceRecords: [],
      sourceRecordCount: 0,
      candidateObservations: [],
      resultCount: 0,
      usageCredits: null,
      responseTimeMs: null,
      providerReceipt: null,
      issues: [reason],
      rawResponsePersisted: false,
      full160Authorized: false,
    },
    apiKeyPersisted: false,
    providerConnectivity: "NOT_EVALUATED",
    providerContract: "NOT_EVALUATED",
    providerContractCompatibility: "NOT_EVALUATED",
    full160Authorized: false,
  };
  const stateInvariantValidation = validateV2B5TavilyCapabilityState(capability);
  if (!stateInvariantValidation.valid) throw new Error("v2b5_execution_block_capability_invalid");
  return { ...capability, stateInvariantValidation };
}

async function runCapabilityProbe(context, options = {}) {
  const existingPath = join(context.privateStore, FILES.capability);
  if (options.forceAuditProbe !== true && existsSync(existingPath)) {
    const existing = readJson(existingPath);
    if (existing.schema === "m2.v2.tavily-capability.v0.1" && existing.finalResult
      && existing.tavilyBindingDigest === context.bindings.tavily
      && existing.tavilyProviderDecision === "READY") return existing;
  }
  context.state.capabilityAttemptCount = (context.state.capabilityAttemptCount ?? 0) + 1;
  const capabilityAttempt = context.state.capabilityAttemptCount;
  checkpointExecution(context.root, context.privateStore, context.state, context.tavilyCache, context.relayCache);
  const first = await executeTavilyQuery(context, {
    queryId: "synthetic_openai_api_documentation",
    queryText: "OpenAI API documentation",
    sourceTypeCandidate: "other",
    executionNamespace: `v2b5-capability-with-usage-v1-attempt-${capabilityAttempt}`,
    maxResults: 3,
    includeUsage: true,
    phase: "capability",
    runKind: "synthetic",
  });
  let finalResult = first;
  let includeUsageSupported = true;
  if (first.includeUsageUnsupported === true) {
    includeUsageSupported = false;
    finalResult = await executeTavilyQuery(context, {
      queryId: "synthetic_openai_api_documentation_retry",
      queryText: "OpenAI API documentation",
      sourceTypeCandidate: "other",
      executionNamespace: `v2b5-capability-without-usage-v1-attempt-${capabilityAttempt}`,
      maxResults: 3,
      includeUsage: false,
      phase: "capability",
      runKind: "synthetic",
      retryCount: 1,
    });
  }
  context.state.includeUsageSupported = includeUsageSupported;
  const capability = {
    schema: "m2.v2.tavily-capability.v0.1",
    privateOnly: true,
    syntheticQueryOnly: true,
    includeUsageSupported,
    compatibilityRetryUsed: finalResult !== first,
    capabilityAttempt,
    attemptCount: finalResult === first ? 1 : 2,
    tavilyProviderDecision: classifyV2B5TavilyProviderDecision(finalResult),
    tavilyBindingDigest: context.bindings.tavily,
    finalResult,
    apiKeyPersisted: false,
    full160Authorized: false,
  };
  const stateInvariantValidation = validateV2B5TavilyCapabilityState(capability);
  if (!stateInvariantValidation.valid) {
    throw new Error(`v2b5_capability_state_invalid:${stateInvariantValidation.issues.join(",")}`);
  }
  return { ...capability, stateInvariantValidation };
}

function appendCapabilityHistory(privateStore, capabilities) {
  const path = join(privateStore, FILES.capabilityHistory);
  const existing = existsSync(path) ? readJson(path) : {
    schema: "m2.v2.tavily-capability-history.v0.1",
    privateOnly: true,
    entries: [],
  };
  const seen = new Set(existing.entries.map((entry) => sha256(entry)));
  for (const capability of capabilities) {
    const digest = sha256(capability);
    if (!seen.has(digest)) {
      existing.entries.push(capability);
      seen.add(digest);
    }
  }
  atomicWriteJson(path, existing);
  return existing;
}

export function migrateV2B5LegacyCapabilityState(stateInput, capabilityInput, migratedAt = new Date().toISOString()) {
  const state = structuredClone(stateInput);
  const capability = capabilityInput ? structuredClone(capabilityInput) : null;
  const dispatchAttempted = capability?.finalResult?.dispatched === true;
  const legacyPreDispatchBlockedTransport = dispatchAttempted === false
    && capability?.tavilyProviderDecision === "BLOCKED_TRANSPORT"
    && (capability?.executionBlockedBeforeDispatch === true
      || state?.externalDispatchBlockedBeforeExecution === true);
  if (!legacyPreDispatchBlockedTransport) return { state, capability, migrated: false };
  const migration = {
    schema: "m2.v2.v2b5-capability-state-migration.v0.1",
    migrationVersion: "v2b5-egress-semantics-v0.1",
    migratedAt,
    reason: "legacy_pre_dispatch_blocked_transport_reclassified",
    oldValue: "BLOCKED_TRANSPORT",
    newValue: "BLOCKED_EGRESS_PERMISSION",
  };
  state.tavilyProviderDecision = "BLOCKED_EGRESS_PERMISSION";
  state.capabilityStateMigration = migration;
  capability.tavilyProviderDecision = "BLOCKED_EGRESS_PERMISSION";
  capability.legacyTavilyProviderDecision = "BLOCKED_TRANSPORT";
  capability.capabilityStateMigration = migration;
  capability.providerConnectivity = "NOT_EVALUATED";
  capability.providerContract = "NOT_EVALUATED";
  capability.providerContractCompatibility = "NOT_EVALUATED";
  capability.finalResult.httpStatus = null;
  capability.finalResult.httpSuccess = null;
  capability.finalResult.providerConnectivityPassed = null;
  capability.finalResult.providerContractCompatibility = "NOT_EVALUATED";
  capability.finalResult.contractValid = null;
  return { state, capability, migrated: true };
}

async function runSearchPopulation(context, input) {
  const runs = [];
  for (const work of input.works) {
    if (!work) continue;
    const queries = buildV2B5WorkQueries(work, input.runKind, input.executionNamespace);
    const validation = validateV2B5WorkQueries(queries);
    if (!validation.valid) throw new Error(`v2b5_query_plan_invalid:${validation.issues.join(",")}`);
    const queryResults = [];
    for (const query of queries) {
      context.onProgress({ phase: input.phase, stage: "search", runKind: input.runKind, canarySlotId: work.canarySlotId, intent: query.intent });
      queryResults.push(await executeTavilyQuery(context, {
        ...query,
        phase: input.phase,
        includeUsage: context.state.includeUsageSupported === true,
      }));
    }
    const observedSourceRecords = mergeAndLimitV2B5SourceRecords(
      queryResults.filter((result) => result.contractValid === true).flatMap((result) => result.sourceRecords ?? []),
      6,
    );
    const sourceRecords = observedSourceRecords.filter((record) => !classifyV2B5ProhibitedSource(record).prohibited);
    const candidateObservations = queryResults.flatMap((result) => result.candidateObservations ?? []);
    const sourceSet = buildV2B5SourceRecordSet(sourceRecords);
    runs.push({
      schema: "m2.v2.search-layer-run.v0.2",
      privateOnly: true,
      phase: input.phase,
      runKind: input.runKind,
      canarySlotId: work.canarySlotId,
      identityDigest: work.identityDigest,
      workReference: work.standardWorkId,
      sourceType: work.sourceType,
      highValue: work.highValue === true,
      queries: queryResults,
      observedSourceRecords,
      sourceRecords,
      candidateObservations,
      sourceRecordSetDigest: sourceSet.sourceRecordSetDigest,
    });
  }
  return runs;
}

async function executeTavilyQuery(context, input) {
  const queryDigest = sha256(input.queryText);
  const descriptor = buildV2B5TavilyCacheDescriptor({
    baseUrl: context.config.tavily.baseUrl,
    queryDigest,
    searchDepth: context.config.tavily.searchDepth,
    topic: context.config.tavily.topic,
    country: context.config.tavily.country,
    maxResults: input.maxResults ?? context.config.tavily.maxResults,
    includeUsage: input.includeUsage === true,
    executionNamespace: input.executionNamespace,
  });
  const cached = context.tavilyCache.entries[descriptor.cacheKey];
  if (cached) {
    if (context.resume === true && input.phase !== "capability" && cached.contractValid !== true
      && (cached.providerReceipt?.retryCount ?? 0) < 1 && !input.resumeRetryOf) {
      return executeTavilyQuery(context, {
        ...input,
        retryCount: 1,
        resumeRetryOf: descriptor.cacheKey,
        executionNamespace: `${input.executionNamespace}-resume-1`,
      });
    }
    return { ...cached, cacheHit: true };
  }
  const physicalKey = `tavily:${descriptor.cacheKey}`;
  if (context.state.tavily.reservations[physicalKey]) {
    const indeterminate = buildIndeterminateTavilyResult(input, descriptor, context.state.tavily.reservations[physicalKey]);
    context.tavilyCache.entries[descriptor.cacheKey] = indeterminate;
    checkpointExecution(context.root, context.privateStore, context.state, context.tavilyCache, context.relayCache);
    if (context.resume === true && input.phase !== "capability" && !input.resumeRetryOf) {
      return executeTavilyQuery(context, {
        ...input,
        retryCount: 1,
        resumeRetryOf: descriptor.cacheKey,
        executionNamespace: `${input.executionNamespace}-resume-1`,
      });
    }
    return indeterminate;
  }
  reservePhysicalRequest(context, "tavily", physicalKey, {
    cacheKey: descriptor.cacheKey,
    phase: input.phase,
    runKind: input.runKind,
    queryId: input.queryId,
  });
  let result;
  try {
    const providerResult = await context.tavily.search({
      queryId: input.queryId,
      queryText: input.queryText,
      sourceTypeCandidate: input.sourceTypeCandidate,
      includeUsage: input.includeUsage === true,
      maxResults: input.maxResults,
      cacheKey: descriptor.cacheKey,
      retryCount: input.retryCount ?? 0,
    });
    const providerHttpStatus = providerResult.providerReceipt?.httpStatus ?? null;
    const httpExchangeSucceeded = Number.isInteger(providerHttpStatus)
      && ((providerHttpStatus >= 200 && providerHttpStatus < 300)
        || (providerHttpStatus >= 400 && providerHttpStatus < 500
          && ![401, 403, 408, 429].includes(providerHttpStatus)));
    result = {
      schema: "m2.v2.tavily-query-execution.v0.1",
      privateOnly: true,
      phase: input.phase,
      runKind: input.runKind,
      queryId: input.queryId,
      queryText: input.queryText,
      intent: input.intent ?? "capability",
      executionNamespace: input.executionNamespace,
      cacheKey: descriptor.cacheKey,
      cacheHit: false,
      dispatched: providerResult.dispatched !== false,
      httpStatus: providerHttpStatus,
      httpSuccess: httpExchangeSucceeded,
      providerConnectivityPassed: providerResult.providerConnectivityPassed === true,
      contractValid: providerResult.contractValid === true,
      status: providerResult.status,
      sourceRecords: providerResult.sourceRecords,
      sourceRecordCount: providerResult.sourceRecordCount,
      candidateObservations: providerResult.candidateObservations ?? [],
      resultCount: providerResult.providerReceipt?.resultCount ?? 0,
      usageCredits: providerResult.providerReceipt?.usageCredits ?? null,
      responseTimeMs: providerResult.providerReceipt?.responseTimeMs ?? null,
      responseReceivedAt: providerResult.providerReceipt?.responseReceivedAt ?? context.now(),
      providerReceipt: providerResult.providerReceipt,
      includeUsageUnsupported: providerResult.includeUsageUnsupported === true,
      transportFailureCategory: providerResult.transportFailureCategory ?? null,
      dnsAttempted: providerResult.dnsAttempted ?? null,
      dnsSuccess: providerResult.dnsSuccess ?? null,
      tlsSuccess: providerResult.tlsSuccess ?? null,
      issues: providerResult.issues,
      rawResponsePersisted: false,
      full160Authorized: false,
    };
  } catch (error) {
    result = buildTavilyExceptionResult(input, descriptor, error, context.now());
  }
  context.tavilyCache.entries[descriptor.cacheKey] = result;
  if (result.dispatched === false) cancelPredispatchReservation(context, "tavily", physicalKey);
  else completePhysicalRequest(context, "tavily", physicalKey, result);
  return result;
}

async function runBenchmarkExtractions(context, searchRuns) {
  const receipts = [];
  for (const [index, run] of searchRuns.entries()) {
    const modelOrder = index % 2 === 0 ? V2B5_MODELS : [...V2B5_MODELS].reverse();
    for (const model of modelOrder) {
      receipts.push(await executeRelayExtraction(context, {
        phase: "benchmark",
        runKind: "primary",
        attemptKind: "primary",
        model,
        work: context.frozen.benchmarkManifest.sample.find((item) => item.canarySlotId === run.canarySlotId),
        searchRun: run,
      }));
    }
  }
  for (const [index, repeat] of context.frozen.benchmarkManifest.repeatSample.entries()) {
    const run = searchRuns.find((item) => item.canarySlotId === repeat.canarySlotId);
    const modelOrder = index % 2 === 0 ? [...V2B5_MODELS].reverse() : V2B5_MODELS;
    for (const model of modelOrder) {
      receipts.push(await executeRelayExtraction(context, {
        phase: "benchmark",
        runKind: "repeat",
        attemptKind: "primary",
        model,
        work: context.frozen.benchmarkManifest.sample.find((item) => item.canarySlotId === repeat.canarySlotId),
        searchRun: run,
      }));
    }
  }
  for (const failed of [...receipts]) {
    if (remainingBudget(context.state, "relay") <= 15) break;
    if (!isSchemaRepairable(failed)) continue;
    const run = searchRuns.find((item) => item.canarySlotId === failed.canarySlotId);
    const work = context.frozen.benchmarkManifest.sample.find((item) => item.canarySlotId === failed.canarySlotId);
    receipts.push(await executeRelayExtraction(context, {
      phase: "benchmark",
      runKind: failed.runKind,
      attemptKind: "repair",
      model: failed.requestedModelId,
      work,
      searchRun: run,
      repairIssues: failed.normalizedResponse?.issues ?? ["strict_schema_invalid"],
    }));
  }
  return receipts;
}

async function runCanaryExtractions(context, searchRuns, benchmarkEvaluation) {
  const receipts = [];
  const defaultModel = benchmarkEvaluation.defaultExtractionModel;
  const primaryQueue = searchRuns.map((run) => ({
    phase: "canary",
    runKind: run.runKind,
    attemptKind: "primary",
    model: defaultModel,
    work: context.frozen.canaryManifest.sample.find((item) => item.canarySlotId === run.canarySlotId),
    searchRun: run,
  }));
  for (const item of primaryQueue) receipts.push(await executeRelayExtraction(context, item));
  const repairQueue = receipts.filter(isSchemaRepairable);
  for (const failed of repairQueue) {
    if (remainingBudget(context.state, "relay") <= 0) break;
    const run = searchRuns.find((item) => item.canarySlotId === failed.canarySlotId && item.runKind === failed.runKind);
    const work = context.frozen.canaryManifest.sample.find((item) => item.canarySlotId === failed.canarySlotId);
    receipts.push(await executeRelayExtraction(context, {
      phase: "canary",
      runKind: failed.runKind,
      attemptKind: "repair",
      model: defaultModel,
      work,
      searchRun: run,
      repairIssues: failed.normalizedResponse?.issues ?? [failed.status],
    }));
  }
  if (defaultModel === "gpt-5.6-luna" && benchmarkEvaluation.escalationModel === "gpt-5.6-terra") {
    for (const primary of primaryQueue) {
      if (remainingBudget(context.state, "relay") <= 0) break;
      const candidates = receipts.filter((receipt) => receipt.canarySlotId === primary.work.canarySlotId && receipt.runKind === primary.runKind);
      const effective = candidates.find((receipt) => receipt.attemptKind === "repair" && receipt.normalizedResponse?.contractValid === true)
        ?? candidates.find((receipt) => receipt.attemptKind === "transport_retry")
        ?? candidates.find((receipt) => receipt.attemptKind === "primary");
      if (!shouldEscalateV2B5Extraction(effective, primary.work)) continue;
      receipts.push(await executeRelayExtraction(context, {
        ...primary,
        attemptKind: "escalation",
        model: "gpt-5.6-terra",
      }));
    }
  }
  return Object.values(context.relayCache.entries).filter((receipt) => receipt.phase === "canary");
}

async function executeRelayExtraction(context, input) {
  const sourceRecords = input.searchRun?.sourceRecords ?? [];
  const sourceRecordSetDigest = input.searchRun?.sourceRecordSetDigest ?? buildV2B5SourceRecordSet([]).sourceRecordSetDigest;
  const logical = {
    phase: input.phase,
    runKind: input.runKind,
    canarySlotId: input.work?.canarySlotId,
    model: input.model,
    attemptKind: input.attemptKind,
    sourceRecordSetDigest,
    adapterVersion: V2B5_EXTRACTION_ADAPTER_VERSION,
    relayBindingDigest: context.bindings.relay,
    reasoningParameterIncluded: context.state.reasoningSupported !== false,
    repairIssuesDigest: sha256(input.repairIssues ?? []),
  };
  const cacheKey = sha256(logical);
  if (context.relayCache.entries[cacheKey]) {
    const cached = context.relayCache.entries[cacheKey];
    if (context.resume === true && input.attemptKind === "primary" && cached.providerConnectivityPassed !== true) {
      return executeRelayExtraction(context, { ...input, attemptKind: "transport_retry" });
    }
    return withReceiptRuntimeView(cached, { cacheHit: true });
  }
  if (!sourceRecords.length) {
    const blocked = buildBlockedRelayReceipt(input, sourceRecordSetDigest, "source_records_missing", context.now());
    context.relayCache.entries[cacheKey] = blocked;
    checkpointExecution(context.root, context.privateStore, context.state, context.tavilyCache, context.relayCache);
    return blocked;
  }
  const physicalKey = `relay:${cacheKey}`;
  if (context.state.relay.reservations[physicalKey]) {
    const compatibilityReceipt = context.relayCache.entries[`compatibility_${cacheKey}`];
    if (compatibilityReceipt?.reasoningParameterUnsupported === true) {
      context.state.reasoningSupported = false;
      return executeReasoningCompatibilityRetry(context, input, sourceRecords, sourceRecordSetDigest, cacheKey);
    }
    const indeterminate = buildBlockedRelayReceipt(input, sourceRecordSetDigest, "prior_reservation_indeterminate", context.now());
    context.relayCache.entries[cacheKey] = indeterminate;
    checkpointExecution(context.root, context.privateStore, context.state, context.tavilyCache, context.relayCache);
    if (context.resume === true && input.attemptKind === "primary") {
      return executeRelayExtraction(context, { ...input, attemptKind: "transport_retry" });
    }
    return indeterminate;
  }
  reservePhysicalRequest(context, "relay", physicalKey, {
    cacheKey,
    phase: input.phase,
    runKind: input.runKind,
    canarySlotId: input.work?.canarySlotId,
    model: input.model,
    attemptKind: input.attemptKind,
  });
  context.onProgress({ phase: input.phase, stage: "extraction", runKind: input.runKind, canarySlotId: input.work?.canarySlotId, model: input.model, attemptKind: input.attemptKind });
  let receipt;
  try {
    receipt = await context.relay.extract({
      physicalRequestKey: physicalKey,
      logicalExtractionKey: cacheKey,
      phase: input.phase,
      runKind: input.runKind,
      attemptKind: input.attemptKind,
      model: input.model,
      work: input.work,
      sourceRecords,
      sourceRecordSetDigest,
      maxOutputTokens: 1_200,
      reasoningEffort: context.config.relay.reasoningEffort,
      includeReasoning: context.state.reasoningSupported !== false,
      repairIssues: input.repairIssues,
      retryCount: 0,
      privateTokens: [input.work?.identityDigest].filter(Boolean),
      governancePolicy: V2B5_DEFAULT_SOURCE_GOVERNANCE_POLICY,
    });
    receipt = enrichRelayReceipt(receipt, input, cacheKey);
  } catch (error) {
    receipt = buildRelayExceptionReceipt(input, sourceRecordSetDigest, error, context.now());
  }
  if (receipt.reasoningParameterUnsupported === true && context.state.reasoningSupported !== false
    && remainingBudget(context.state, "relay") > 0) {
    context.state.reasoningSupported = false;
    const compatibilityReceipt = {
      ...receipt,
      attemptKind: "compatibility_probe",
      runtimeReceiptDigest: sha256({ ...receipt, attemptKind: "compatibility_probe" }),
    };
    context.relayCache.entries[`compatibility_${cacheKey}`] = compatibilityReceipt;
    completePhysicalRequest(context, "relay", physicalKey, compatibilityReceipt);
    return executeReasoningCompatibilityRetry(context, input, sourceRecords, sourceRecordSetDigest, cacheKey);
  }
  if (receipt.providerConnectivityPassed === true && receipt.reasoningParameterUnsupported !== true) {
    context.state.reasoningSupported = context.state.reasoningSupported ?? true;
  }
  context.relayCache.entries[cacheKey] = receipt;
  completePhysicalRequest(context, "relay", physicalKey, receipt);
  return receipt;
}

async function executeReasoningCompatibilityRetry(context, input, sourceRecords, sourceRecordSetDigest, cacheKey) {
  const existing = context.relayCache.entries[cacheKey];
  if (existing) return withReceiptRuntimeView(existing, { cacheHit: true });
  const retryKey = `relay:${sha256({ cacheKey, reasoningParameterIncluded: false })}`;
  if (context.state.relay.reservations[retryKey]) {
    const indeterminate = buildBlockedRelayReceipt(input, sourceRecordSetDigest, "reasoning_retry_indeterminate_after_crash", context.now());
    context.relayCache.entries[cacheKey] = indeterminate;
    checkpointExecution(context.root, context.privateStore, context.state, context.tavilyCache, context.relayCache);
    return indeterminate;
  }
  reservePhysicalRequest(context, "relay", retryKey, {
    cacheKey,
    phase: input.phase,
    runKind: input.runKind,
    canarySlotId: input.work?.canarySlotId,
    model: input.model,
    attemptKind: "reasoning_compatibility_retry",
  });
  let receipt;
  try {
    receipt = await context.relay.extract({
      physicalRequestKey: retryKey,
      logicalExtractionKey: cacheKey,
      phase: input.phase,
      runKind: input.runKind,
      attemptKind: input.attemptKind,
      model: input.model,
      work: input.work,
      sourceRecords,
      sourceRecordSetDigest,
      maxOutputTokens: 1_200,
      reasoningEffort: context.config.relay.reasoningEffort,
      includeReasoning: false,
      repairIssues: input.repairIssues,
      retryCount: 1,
      privateTokens: [input.work?.identityDigest].filter(Boolean),
      governancePolicy: V2B5_DEFAULT_SOURCE_GOVERNANCE_POLICY,
    });
    receipt = enrichRelayReceipt(receipt, input, cacheKey);
  } catch (error) {
    receipt = buildRelayExceptionReceipt(input, sourceRecordSetDigest, error, context.now());
  }
  context.relayCache.entries[cacheKey] = receipt;
  completePhysicalRequest(context, "relay", retryKey, receipt);
  return receipt;
}

function isSchemaRepairable(receipt) {
  const normalized = receipt?.normalizedResponse;
  return receipt?.dispatched === true
    && receipt?.providerConnectivityPassed === true
    && receipt?.modelBindingVerified === true
    && normalized?.structuredValid !== true
    && (normalized?.privateLeakCount ?? 0) === 0
    && (normalized?.fabricatedSourceIdCount ?? 0) === 0
    && (normalized?.modelGeneratedUrlCount ?? 0) === 0
    && (normalized?.historicalBackfillCount ?? 0) === 0;
}

function evaluateCanaryPreGate(context, capability, benchmarkSearchRuns, benchmarkEvaluation) {
  const sourceRecords = benchmarkSearchRuns.flatMap((run) => run.sourceRecords ?? []);
  const sourceContractPassed = sourceRecords.length > 0
    && sourceRecords.every((record) => validateV2B5SourceRecord(record).valid);
  const manifest = readJson(join(context.root, V2B5_FROZEN_CANARY_RELATIVE));
  const immutableManifestPassed = manifest.canaryManifestDigest === context.frozen.frozenCanary.canaryManifestDigest
    && digestWithout(manifest, "canaryManifestDigest") === manifest.canaryManifestDigest;
  const items = [
    preGateItem("tavily_provider_ready", capability.tavilyProviderDecision === "READY"),
    preGateItem("tavily_source_record_contract", sourceContractPassed),
    preGateItem("provider_neutral_source_record_v0_2", sourceContractPassed && sourceRecords.every((record) => record.schema === V2B5_SOURCE_RECORD_SCHEMA)),
    preGateItem("source_governance_v0_3", validateV2B5SourceGovernancePolicy(V2B5_DEFAULT_SOURCE_GOVERNANCE_POLICY).valid),
    preGateItem("at_least_one_extraction_model_safe", benchmarkEvaluation.extractionBenchmarkDecision === "PASS"),
    preGateItem("default_escalation_frozen", Boolean(benchmarkEvaluation.defaultExtractionModel)),
    preGateItem("tavily_budget_for_canary", remainingBudget(context.state, "tavily") >= 30),
    preGateItem("relay_budget_for_canary", remainingBudget(context.state, "relay") >= 15),
    preGateItem("pretests_pass", context.state.pretestsPassed === true),
    preGateItem("immutable_canary_manifest", immutableManifestPassed),
  ];
  return {
    schema: "m2.v2.canary-v3-pre-gate.v0.1",
    items,
    passedCount: items.filter((item) => item.passed).length,
    totalCount: items.length,
    allPassed: items.every((item) => item.passed),
    failedIds: items.filter((item) => !item.passed).map((item) => item.id),
    full160Authorized: false,
  };
}

function finalizePrivateArtifacts(context, input) {
  const tavilyExecutions = Object.values(context.tavilyCache.entries);
  const relayReceipts = Object.values(context.relayCache.entries);
  const sourceRecords = tavilyExecutions.flatMap((item) => item.sourceRecords ?? []);
  const candidateObservations = tavilyExecutions.flatMap((item) => item.candidateObservations ?? []);
  const evidenceRecords = relayReceipts.flatMap((receipt) => (receipt.normalizedResponse?.claims ?? []).map((claim) => ({
    schema: "m2.v2.private-evidence-record.v0.1",
    privateOnly: true,
    phase: receipt.phase,
    runKind: receipt.runKind,
    canarySlotId: receipt.canarySlotId,
    requestedModelId: receipt.requestedModelId,
    sourceRecordSetDigest: receipt.sourceRecordSetDigest,
    ...claim,
  })));
  const registry = buildV2B5ResearchCandidateRegistry(sourceRecords, evidenceRecords, candidateObservations);
  const workbookRows = buildV2B5PrivateWorkbookRows(evidenceRecords, sourceRecords);
  atomicWriteNdjson(join(context.privateStore, FILES.tavilyReceipts), tavilyExecutions.map((item) => item.providerReceipt).filter(Boolean));
  atomicWriteNdjson(join(context.privateStore, FILES.relayReceipts), relayReceipts);
  atomicWriteNdjson(join(context.privateStore, FILES.sourceRecords), sourceRecords);
  atomicWriteNdjson(join(context.privateStore, FILES.evidenceRecords), evidenceRecords);
  atomicWriteJson(join(context.privateStore, FILES.registry), registry);
  if (workbookRows.length > 0) {
    atomicWriteJson(join(context.privateStore, FILES.workbookData), {
      schema: "m2.v2.private-review-workbook-data.v0.1",
      privateOnly: true,
      rowCount: workbookRows.length,
      rows: workbookRows,
    });
  }
  const usageLedger = buildUsageLedger(context.state, tavilyExecutions, relayReceipts);
  atomicWriteJson(join(context.privateStore, FILES.usageLedger), usageLedger);
  atomicWriteJson(join(context.privateStore, FILES.canaryEvaluation), input.canaryEvaluation);
  return {
    privateStore: context.privateStore,
    capability: input.capability,
    benchmarkEvaluation: input.benchmarkEvaluation,
    canaryEvaluation: input.canaryEvaluation,
    registry,
    sourceRecords,
    evidenceRecords,
    candidateObservations,
    privateWorkbookRequired: workbookRows.length > 0,
    privateWorkbookRelativePath: workbookRows.length > 0 ? V2B5_PRIVATE_WORKBOOK_RELATIVE : null,
    usageLedger,
    state: context.state,
    searchRuns: input.searchRuns,
    relayReceipts,
  };
}

export function buildV2B5PrivateWorkbookRows(evidenceRecords, sourceRecords) {
  const sourceById = new Map((Array.isArray(sourceRecords) ? sourceRecords : [])
    .map((record) => [record?.sourceId, record]));
  return (Array.isArray(evidenceRecords) ? evidenceRecords : [])
    .filter((record) => record?.pilotUsable === true)
    .map((record) => {
      const sources = (record.supportingSourceIds ?? []).map((sourceId) => sourceById.get(sourceId)).filter(Boolean);
      const capturedAt = latestIsoTimestamp(sources.map((source) => source.capturedAt));
      const availableAt = latestIsoTimestamp(sources.map((source) => source.availableAt));
      return {
        anonymousSampleId: cleanAnonymousSampleId(record.canarySlotId),
        evidenceCategory: record.claimType ?? "other",
        sourceType: unique(sources.map((source) => source.sourceTypeCandidate)).sort().join(" | ") || "other",
        claim: cleanWorkbookText(record.claim, 500),
        structuredValue: canonicalJson(record.structuredValue ?? null),
        sourceTitle: unique(sources.map((source) => cleanWorkbookText(source.title, 300)).filter(Boolean)).join(" | "),
        capturedAt,
        availableAt,
        availableAtBasis: availableAt ? "first_observed_by_system" : null,
        eventTime: isIsoTimestamp(record.eventTime) ? record.eventTime : null,
        workIdentityConfidence: finiteOrNull(record.entityResolution?.work?.confidence),
        authorIdentityConfidence: finiteOrNull(record.entityResolution?.author?.confidence),
        evidenceConfidence: finiteOrNull(record.confidence),
        conflictStatus: record.contradictionStatus ?? "none",
        rejectionOrLimitation: unique([...(record.rejectionReasons ?? []), ...(record.limitations ?? [])]).join(" | "),
        userDecision: "",
      };
    });
}

export function readV2B5Results(root) {
  const privateStore = join(root, V2B5_PRIVATE_RELATIVE);
  const atomicSnapshot = readCurrentRequestStateSnapshot(root, { scope: "v2b5" });
  if (atomicSnapshot.present && !atomicSnapshot.valid) {
    throw new Error(`v2b5_atomic_binding_invalid:${atomicSnapshot.issues.join(",")}`);
  }
  const capability = readJson(join(privateStore, FILES.capability));
  const benchmarkEvaluation = existsSync(join(privateStore, FILES.benchmarkEvaluation))
    ? readJson(join(privateStore, FILES.benchmarkEvaluation)) : null;
  const canaryEvaluation = readJson(join(privateStore, FILES.canaryEvaluation));
  const state = atomicSnapshot.present ? atomicSnapshot.members.state : readJson(join(privateStore, FILES.state));
  const registry = existsSync(join(privateStore, FILES.registry)) ? readJson(join(privateStore, FILES.registry)) : emptyRegistry();
  const usageLedger = existsSync(join(privateStore, FILES.usageLedger)) ? readJson(join(privateStore, FILES.usageLedger)) : null;
  const sourceRecords = readNdjson(join(privateStore, FILES.sourceRecords));
  const evidenceRecords = readNdjson(join(privateStore, FILES.evidenceRecords));
  const privateWorkbookPath = join(root, V2B5_PRIVATE_WORKBOOK_RELATIVE);
  const egressDiagnostic = existsSync(join(privateStore, FILES.egressDiagnostic))
    ? readJson(join(privateStore, FILES.egressDiagnostic)) : null;
  return {
    privateStore,
    capability,
    benchmarkEvaluation,
    canaryEvaluation,
    state,
    registry,
    usageLedger,
    sourceRecords,
    evidenceRecords,
    privateWorkbookExists: existsSync(privateWorkbookPath),
    privateWorkbookRelativePath: V2B5_PRIVATE_WORKBOOK_RELATIVE,
    egressDiagnostic,
    atomicBinding: atomicSnapshot,
  };
}

export function recordV2B5EgressDiagnostic(root, input) {
  const privateStore = ensurePrivateStore(root);
  const payload = {
    schema: "m2.v2.egress-permission-diagnostic.v0.1",
    privateOnly: true,
    checkedAt: isIsoTimestamp(input?.checkedAt) ? input.checkedAt : new Date().toISOString(),
    dnsSucceeded: input?.dnsSucceeded === true,
    dnsAddressCount: Number.isInteger(input?.dnsAddressCount) && input.dnsAddressCount >= 0 ? input.dnsAddressCount : 0,
    dnsErrorType: safeToken(input?.dnsErrorType ?? "none"),
    tcp443Succeeded: input?.tcp443Succeeded === true,
    tcpErrorType: safeToken(input?.tcpErrorType ?? "none"),
    proxyVariablePresence: Object.fromEntries(["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY"]
      .map((name) => [name, input?.proxyVariablePresence?.[name] === true])),
    clientEgressPermission: input?.clientEgressPermission === "BLOCKED" ? "BLOCKED" : "ALLOWED",
    fullIpPersisted: false,
    proxyValuePersisted: false,
    full160Authorized: false,
  };
  atomicWriteJson(join(privateStore, FILES.egressDiagnostic), payload);
  return payload;
}

export function writeV2B5PublicReports(root, supplied = null) {
  const results = supplied ?? readV2B5Results(root);
  const bundle = buildPublicReportBundle(results);
  const privateDenyTokens = collectPrivateDenyTokens(root, results);
  const outputs = {
    [PUBLIC_REPORTS.diagnosticJson]: `${JSON.stringify(bundle.diagnostic, null, 2)}\n`,
    [PUBLIC_REPORTS.diagnosticMarkdown]: renderDiagnosticMarkdown(bundle.diagnostic),
    [PUBLIC_REPORTS.capabilityJson]: `${JSON.stringify(bundle.capability, null, 2)}\n`,
    [PUBLIC_REPORTS.capabilityMarkdown]: renderCapabilityMarkdown(bundle.capability),
    [PUBLIC_REPORTS.capabilityLegacyJson]: `${JSON.stringify(bundle.capability, null, 2)}\n`,
    [PUBLIC_REPORTS.capabilityLegacyMarkdown]: renderCapabilityMarkdown(bundle.capability),
    [PUBLIC_REPORTS.benchmarkJson]: `${JSON.stringify(bundle.benchmark, null, 2)}\n`,
    [PUBLIC_REPORTS.benchmarkMarkdown]: `${renderBenchmarkMarkdown(bundle.benchmark).trimEnd()}\n- 模型证据质量: ${bundle.benchmark.modelEvidenceQuality}\n`,
    [PUBLIC_REPORTS.executionJson]: `${JSON.stringify(bundle.execution, null, 2)}\n`,
    [PUBLIC_REPORTS.executionMarkdown]: renderExecutionMarkdown(bundle.execution),
    [PUBLIC_REPORTS.qualityJson]: `${JSON.stringify(bundle.quality, null, 2)}\n`,
    [PUBLIC_REPORTS.qualityMarkdown]: renderQualityMarkdown(bundle.quality),
    [PUBLIC_REPORTS.decisionJson]: `${JSON.stringify(bundle.decision, null, 2)}\n`,
    [PUBLIC_REPORTS.decisionMarkdown]: renderDecisionMarkdown(bundle.decision),
    [PUBLIC_REPORTS.resumeJson]: `${JSON.stringify(bundle.resume, null, 2)}\n`,
    [PUBLIC_REPORTS.resumeMarkdown]: renderResumeMarkdown(bundle.resume),
    [PUBLIC_REPORTS.nextStepJson]: `${JSON.stringify(bundle.nextStep, null, 2)}\n`,
    [PUBLIC_REPORTS.nextStepMarkdown]: renderNextStepMarkdown(bundle.nextStep),
    [PUBLIC_REPORTS.nextStepLegacyJson]: `${JSON.stringify(bundle.nextStep, null, 2)}\n`,
    [PUBLIC_REPORTS.nextStepLegacyMarkdown]: renderNextStepMarkdown(bundle.nextStep),
  };
  for (const [relative, content] of Object.entries(outputs)) {
    assertPublicV2B5Sanitized(content, privateDenyTokens);
    atomicWriteText(join(root, relative), content);
  }
  return { publicReports: Object.keys(outputs), bundle };
}

export function runV2B5FullValidation(root, options = {}) {
  const privateStore = ensurePrivateStore(root);
  const commands = [
    ["npm", ["run", "check:no-real-data"]],
    ["npm", ["run", "lint"]],
    ["npm", ["run", "build"]],
    ["npm", ["test"]],
    ["npm", ["run", "smoke"]],
    ["npm", ["run", "test:e2e"]],
  ];
  const rows = [];
  for (const [program, args] of commands) {
    options.onProgress?.({ command: [program, ...args].join(" ") });
    const startedAt = new Date().toISOString();
    const started = Date.now();
    const npmExecPath = program === "npm" ? process.env.npm_execpath : null;
    const executable = process.platform === "win32" && program === "npm" ? process.execPath : program;
    const spawnArgs = process.platform === "win32" && program === "npm"
      ? [npmExecPath, ...args].filter(Boolean) : args;
    const result = spawnSync(executable, spawnArgs, {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
      timeout: options.timeoutMs ?? 15 * 60_000,
      maxBuffer: 20 * 1024 * 1024,
    });
    const stdout = String(result.stdout ?? "");
    const stderr = String(result.stderr ?? "");
    rows.push({
      command: [program, ...args].join(" "),
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      exitCode: result.status,
      signal: result.signal ?? null,
      launchErrorCode: safeToken(result.error?.code ?? "none"),
      passed: result.status === 0,
      stdoutDigest: sha256(stdout),
      stderrDigest: sha256(stderr),
      stdoutByteLength: Buffer.byteLength(stdout),
      stderrByteLength: Buffer.byteLength(stderr),
    });
    if (result.status !== 0 && options.stopOnFailure !== false) break;
  }
  const receiptPayload = {
    schema: "m2.v2.v2b5-full-validation-receipt.v0.1",
    privateOnly: true,
    completedAt: new Date().toISOString(),
    expectedCommandCount: commands.length,
    executedCommandCount: rows.length,
    allPassed: rows.length === commands.length && rows.every((row) => row.passed),
    commands: rows,
    rawOutputPersisted: false,
    full160Authorized: false,
  };
  const receipt = { ...receiptPayload, receiptDigest: sha256(receiptPayload) };
  atomicWriteJson(join(privateStore, FILES.validation), receipt);
  if (existsSync(join(privateStore, FILES.canarySearch)) && existsSync(join(privateStore, FILES.canaryEvaluation))) {
    const frozen = checkAndFreezeV2B5(root);
    const searchRuns = readJson(join(privateStore, FILES.canarySearch)).runs;
    const relayReceipts = readNdjson(join(privateStore, FILES.relayReceipts)).filter((item) => item.phase === "canary");
    const prior = readJson(join(privateStore, FILES.canaryEvaluation));
    const updated = evaluateV2B5Canary({
      manifest: frozen.canaryManifest,
      searchRuns,
      relayReceipts,
      executed: prior.executed === true,
      defaultExtractionModel: prior.defaultExtractionModel,
      escalationModel: prior.escalationModel,
      allTestsPassed: receipt.allPassed,
      evaluatedAt: receipt.completedAt,
    });
    atomicWriteJson(join(privateStore, FILES.canaryEvaluation), updated);
    const state = readJson(join(privateStore, FILES.state));
    state.executionStatus = receipt.allPassed ? "completed" : "validation_failed";
    state.finalDecision = updated.decision;
    atomicWriteJson(join(privateStore, FILES.state), state);
  }
  const results = readV2B5Results(root);
  writeV2B5PublicReports(root, results);
  return receipt;
}

export function verifyV2B5(root) {
  const issues = [];
  let results = null;
  let frozen = null;
  try { results = readV2B5Results(root); } catch (error) { issues.push(`private_results_unreadable:${safeToken(error?.message)}`); }
  try { frozen = readV2B5FrozenState(root); } catch (error) { issues.push(`frozen_state_unreadable:${safeToken(error?.message)}`); }
  if (results) {
    const capabilityValidation = validateV2B5TavilyCapabilityState(results.capability);
    if (!capabilityValidation.valid) issues.push(...capabilityValidation.issues.map((issue) => `capability_state:${issue}`));
    if (results.state?.tavily?.physicalRequestCount > V2B5_TAVILY_REQUEST_CAP) issues.push("tavily_request_cap_exceeded");
    if (results.state?.relay?.physicalRequestCount > V2B5_RELAY_REQUEST_CAP) issues.push("relay_request_cap_exceeded");
    if (results.canaryEvaluation?.full160Authorized !== false) issues.push("full160_authorization_invariant_failed");
    if (results.benchmarkEvaluation && results.benchmarkEvaluation.full160Authorized !== false) issues.push("benchmark_full160_invariant_failed");
    if (results.registry?.entries?.some((entry) => entry.researchApproved !== false || entry.modelEligible !== false)) issues.push("governance_promotion_detected");
    if (results.sourceRecords.some((record) => !validateV2B5SourceRecord(record).valid
      || record.researchOnly !== true || record.modelEligible !== false)) issues.push("source_record_qualification_invalid");
    if (results.evidenceRecords.some((record) => record.researchApproved !== false || record.modelEligible !== false || record.researchOnly !== true)) issues.push("evidence_promotion_or_qualification_invalid");
    for (const provider of ["tavily", "relay"]) {
      const reservations = Object.values(results.state?.[provider]?.reservations ?? {});
      const ordinals = reservations.map((item) => item.ordinal).sort((left, right) => left - right);
      if (results.state?.[provider]?.physicalRequestCount !== reservations.length
        || canonicalJson(ordinals) !== canonicalJson(Array.from({ length: reservations.length }, (_, index) => index + 1))) {
        issues.push(`${provider}_budget_reservation_parity_invalid`);
      }
    }
    const tavilyExecutions = Object.values(readJson(join(results.privateStore, FILES.tavilyCache)).entries);
    if (tavilyExecutions.some((item) => item.providerReceipt && (item.providerReceipt.apiKeyPersisted !== false
      || item.providerReceipt.authorizationHeaderPersisted !== false || item.providerReceipt.rawResponsePersisted !== false))) {
      issues.push("tavily_receipt_secret_or_raw_persistence_invalid");
    }
    if (results.canaryEvaluation?.executed === true) {
      const search = readJson(join(results.privateStore, FILES.canarySearch)).runs;
      if (search.length !== 15 || search.flatMap((run) => run.queries ?? []).length !== 30) issues.push("canary_search_population_invalid");
    }
    const pilotUsableEvidenceCount = results.evidenceRecords.filter((record) => record.pilotUsable === true).length;
    if (pilotUsableEvidenceCount > 0 && results.privateWorkbookExists !== true) issues.push("private_workbook_required_but_missing");
    if (pilotUsableEvidenceCount === 0 && results.privateWorkbookExists === true) issues.push("private_workbook_must_be_suppressed_for_zero_evidence");
    if (results.privateWorkbookExists === true && !privatePathIgnoredAndUntracked(root, V2B5_PRIVATE_WORKBOOK_RELATIVE)) {
      issues.push("private_workbook_not_ignored_or_is_tracked");
    }
  }
  if (frozen && digestWithExcludedKeys(frozen.benchmarkManifest, "benchmarkManifestDigest", ["createdAt"])
    !== frozen.benchmarkManifest.benchmarkManifestDigest) issues.push("benchmark_manifest_digest_invalid");
  if (frozen && digestWithout(frozen.canaryManifest, "manifestDigest") !== frozen.canaryManifest.manifestDigest) issues.push("canary_v3_manifest_digest_invalid");
  if (!privateStoreIgnoredAndUntracked(root)) issues.push("private_store_not_ignored_or_tracked");
  for (const relative of Object.values(PUBLIC_REPORTS)) {
    if (!existsSync(join(root, relative))) issues.push(`public_report_missing:${relative}`);
    else {
      try { assertPublicV2B5Sanitized(readFileSync(join(root, relative), "utf8"), collectPrivateDenyTokens(root, results ?? {})); } catch (error) { issues.push(safeToken(error?.message)); }
    }
  }
  const resultPayload = {
    schema: "m2.v2.v2b5-verification-verdict.v0.2",
    allPassed: issues.length === 0,
    issues: unique(issues),
    tavilyPhysicalRequestCount: results?.state?.tavily?.physicalRequestCount ?? null,
    relayPhysicalRequestCount: results?.state?.relay?.physicalRequestCount ?? null,
    finalDecision: results?.canaryEvaluation?.decision ?? null,
    full160Authorized: false,
  };
  const result = { ...resultPayload, receiptDigest: sha256(resultPayload) };
  return result;
}

function buildPublicReportBundle(results) {
  const capabilityResult = results.capability?.finalResult ?? {};
  const benchmark = results.benchmarkEvaluation;
  const canary = results.canaryEvaluation;
  const usage = results.usageLedger ?? {};
  const diagnostic = {
    schema: "m2.v2.egress-permission-diagnostic-public-report.v0.1",
    status: "not_for_formal_decision",
    checkedAt: results.egressDiagnostic?.checkedAt ?? null,
    dnsSucceeded: results.egressDiagnostic?.dnsSucceeded === true,
    dnsAddressCount: results.egressDiagnostic?.dnsAddressCount ?? 0,
    dnsErrorType: results.egressDiagnostic?.dnsErrorType ?? "none",
    tcp443Succeeded: results.egressDiagnostic?.tcp443Succeeded === true,
    tcpErrorType: results.egressDiagnostic?.tcpErrorType ?? "none",
    proxyVariablePresence: results.egressDiagnostic?.proxyVariablePresence ?? {},
    clientEgressPermission: results.egressDiagnostic?.clientEgressPermission ?? "NOT_EVALUATED",
    fullIpPersisted: false,
    proxyValuePersisted: false,
    full160Authorized: false,
  };
  const providerDecision = results.capability?.tavilyProviderDecision ?? "BLOCKED_CONTRACT";
  const httpStatus = Number.isInteger(capabilityResult.providerReceipt?.httpStatus)
    ? capabilityResult.providerReceipt.httpStatus : null;
  const capabilitySemantics = capabilityStatusSemantics(providerDecision);
  const capabilityReport = {
    schema: "m2.v2.tavily-capability-public-report.v0.2",
    status: "not_for_formal_decision",
    provider: V2B5_TAVILY_PROVIDER_ID,
    providerMode: "structured_search_only",
    relaySearchProviderStatus: "retired",
    tavilyProviderDecision: providerDecision,
    includeUsageSupported: results.capability?.includeUsageSupported ?? null,
    compatibilityRetryUsed: results.capability?.compatibilityRetryUsed === true,
    dispatchAttempted: capabilityResult.dispatched === true,
    dnsAttempted: capabilityResult.dnsAttempted ?? null,
    dnsSuccess: capabilityResult.dnsSuccess ?? null,
    tlsSuccess: capabilityResult.tlsSuccess ?? null,
    blockerCategory: results.capability?.executionBlockedBeforeDispatch === true
      ? "execution_environment_external_dispatch_blocked" : null,
    httpStatus,
    errorType: capabilityResult.providerReceipt?.errorCode ?? (capabilityResult.issues?.[0] ?? "none"),
    apiKeyAuthenticated: httpStatus !== null && ![401, 403].includes(httpStatus),
    providerConnectivity: results.capability?.providerConnectivity ?? capabilitySemantics.providerConnectivity,
    providerContract: results.capability?.providerContract ?? results.capability?.providerContractCompatibility
      ?? capabilitySemantics.providerContractCompatibility,
    providerContractCompatibility: results.capability?.providerContractCompatibility ?? capabilitySemantics.providerContractCompatibility,
    httpSuccess: capabilityResult.httpSuccess === true,
    contractValid: capabilityResult.contractValid === true,
    resultCount: capabilityResult.resultCount ?? 0,
    requestIdObserved: typeof capabilityResult.providerReceipt?.requestId === "string" && capabilityResult.providerReceipt.requestId.length > 0,
    responseTimeObserved: Number.isFinite(capabilityResult.responseTimeMs),
    usageCreditsStatus: Number.isFinite(capabilityResult.usageCredits) ? "observed" : "unavailable",
    apiKeyConfigured: true,
    apiKeyPersistedInReport: false,
    full160Authorized: false,
  };
  const benchmarkReport = {
    schema: "m2.v2.luna-terra-extraction-benchmark-public-report.v0.1",
    status: "not_for_formal_decision",
    executed: Boolean(benchmark),
    sampleCount: benchmark ? 4 : 0,
    repeatSampleCount: benchmark ? 2 : 0,
    sameSourceRecordsVerified: benchmark?.sameSourceRecordsVerified === true,
    extractionBenchmarkDecision: benchmark?.extractionBenchmarkDecision ?? "BLOCKED",
    modelEvidenceQuality: benchmark ? "EVALUATED" : "NOT_EVALUATED",
    models: benchmark ? Object.fromEntries(Object.entries(benchmark.perModel).map(([model, metrics]) => [model, publicBenchmarkMetrics(metrics)])) : {},
    defaultExtractionModel: benchmark?.defaultExtractionModel ?? null,
    escalationModel: benchmark?.escalationModel ?? null,
    lunaStatus: benchmark?.lunaStatus ?? "not_evaluated",
    selectionReasons: benchmark?.selectionReasons
      ?? (results.capability?.executionBlockedBeforeDispatch === true ? ["tavily_capability_blocked_before_dispatch"] : []),
    qualityBeforeSpeed: true,
    full160Authorized: false,
  };
  const execution = {
    schema: "m2.v2.canary-v3-execution-summary.v0.1",
    status: "not_for_formal_decision",
    canaryExecuted: canary?.executed === true,
    fixedManifestUnchanged: results.state?.canaryPreGate?.items?.find((item) => item.id === "immutable_canary_manifest")?.passed
      ?? (typeof results.state?.canaryManifestDigest === "string"
        && results.state.canaryManifestDigest === canary?.canaryManifestDigest),
    primaryWorkCount: canary?.executed ? 10 : 0,
    repeatWorkCount: canary?.executed ? 5 : 0,
    searchProvider: V2B5_TAVILY_PROVIDER_ID,
    extractionProvider: V2B5_RELAY_EXTRACTION_PROVIDER_ID,
    defaultExtractionModel: canary?.defaultExtractionModel ?? benchmark?.defaultExtractionModel ?? null,
    escalationModel: canary?.escalationModel ?? benchmark?.escalationModel ?? null,
    tavilyRequestCount: usage.tavily?.physicalRequestCount ?? results.state?.tavily?.physicalRequestCount ?? 0,
    relayRequestCount: usage.relay?.physicalRequestCount ?? results.state?.relay?.physicalRequestCount ?? 0,
    requestCaps: { tavily: V2B5_TAVILY_REQUEST_CAP, relay: V2B5_RELAY_REQUEST_CAP },
    noBrowserOrRelaySearchUsed: true,
    full160Authorized: false,
  };
  const quality = {
    schema: "m2.v2.canary-v3-quality-report.v0.1",
    status: "not_for_formal_decision",
    metrics: publicCanaryMetrics(canary?.metrics),
    safetyGates: canary?.safetyGates ?? [],
    usabilityGates: canary?.usabilityGates ?? [],
    researchCandidateRegistryCount: results.registry?.uniqueDomainCount ?? 0,
    realDomainsDisclosed: false,
    researchApprovedCount: canary?.metrics?.sourceGovernance?.researchApprovedCount ?? 0,
    modelEligibleCount: canary?.metrics?.sourceGovernance?.modelEligibleCount ?? 0,
    privateWorkbookGenerated: results.privateWorkbookExists === true,
    full160Authorized: false,
  };
  const decision = {
    schema: "m2.v2.canary-v3-decision.v0.1",
    status: "not_for_formal_decision",
    decision: canary?.decision ?? "CANARY_BLOCKED",
    safetyPassed: canary?.safetyPassed === true,
    usabilityPassed: canary?.usabilityPassed === true,
    blockerIds: canary?.executed
      ? [...(canary.safetyGates ?? []), ...(canary.usabilityGates ?? [])].filter((item) => item.passed !== true).map((item) => item.id)
      : results.state?.canaryPreGate?.failedIds
        ?? (results.capability?.executionBlockedBeforeDispatch === true
          ? ["external_dispatch_blocked_before_tavily_capability"] : ["provider_or_pre_gate_blocked"]),
    nextStep: canary?.nextStep ?? "resolve_provider_or_pre_gate_blocker",
    privateWorkbookGenerated: results.privateWorkbookExists === true,
    full160Authorized: false,
    modelTrainingPerformed: false,
    b4Changed: false,
    finalHoldoutOpened: false,
    enteredV2COrV2D: false,
    enteredC4OrM3: false,
    released: false,
  };
  const nextStep = {
    schema: "m2.v2.v2b5-next-step.v0.2",
    status: "not_for_formal_decision",
    currentDecision: decision.decision,
    instruction: decision.decision === "CANARY_PASS"
      ? "用户先审阅私有证据工作簿；任何 full160 仍需单独授权。"
      : results.capability?.executionBlockedBeforeDispatch === true
        ? "当前执行环境禁止第三方真实数据调度；未发送任何请求。更换获准执行环境后从同一冻结 manifest 继续，不得启动 full160。"
        : "先修复报告中的失败或条件门；不得启动 full160。",
    full160Authorized: false,
    prohibitedNextPhases: ["full160", "V2-C", "V2-D", "C4", "M3", "release"],
  };
  const resume = {
    schema: "m2.v2.v2b5-resume-summary.v0.1",
    status: "not_for_formal_decision",
    resumeAttempted: (results.state?.capabilityAttemptCount ?? 0) > 0,
    executionStatus: results.state?.executionStatus ?? "unknown",
    capabilityDecision: providerDecision,
    legacyStateMigrationApplied: Boolean(results.state?.capabilityStateMigration),
    manifestsPreserved: Boolean(results.state?.benchmarkManifestDigest && results.state?.canaryManifestDigest),
    tavilyPhysicalRequestCount: results.state?.tavily?.physicalRequestCount ?? 0,
    relayPhysicalRequestCount: results.state?.relay?.physicalRequestCount ?? 0,
    sourceRecordCount: results.sourceRecords?.length ?? 0,
    benchmarkExecuted: Boolean(benchmark),
    canaryExecuted: canary?.executed === true,
    canaryDecision: canary?.decision ?? "CANARY_BLOCKED",
    full160Authorized: false,
  };
  return { diagnostic, capability: capabilityReport, benchmark: benchmarkReport, execution, quality, decision, resume, nextStep };
}

function capabilityStatusSemantics(decision) {
  if (decision === "READY") return { providerConnectivity: "PASS", providerContractCompatibility: "PASS" };
  if (decision === "BLOCKED_CONTRACT") return { providerConnectivity: "PASS", providerContractCompatibility: "FAIL" };
  if (["BLOCKED_AUTH", "BLOCKED_RATE_LIMIT"].includes(decision)) {
    return { providerConnectivity: "PASS", providerContractCompatibility: "NOT_EVALUATED" };
  }
  if (["BLOCKED_DNS", "BLOCKED_TLS", "BLOCKED_TRANSPORT"].includes(decision)) {
    return { providerConnectivity: "FAIL", providerContractCompatibility: "NOT_EVALUATED" };
  }
  return { providerConnectivity: "NOT_EVALUATED", providerContractCompatibility: "NOT_EVALUATED" };
}

function publicCanaryMetrics(metrics) {
  if (!metrics) return null;
  return {
    search: {
      plannedRequestCount: metrics.search.plannedRequestCount,
      dispatchedRequestCount: metrics.search.dispatchedRequestCount,
      httpSuccessCount: metrics.search.httpSuccessCount,
      querySuccessRate: metrics.search.querySuccessRate,
      resultCount: metrics.search.resultCount,
      sourceRecordWorkCoverage: metrics.search.sourceRecordWorkCoverage,
      sourceRecordWorkCount: metrics.search.sourceRecordWorkCount,
      uniqueSourceCount: metrics.search.uniqueSourceCount,
      providerErrorCount: metrics.search.providerErrorCount,
      usageCredits: metrics.search.usageCredits,
      p50LatencyMs: metrics.search.p50LatencyMs,
      p90LatencyMs: metrics.search.p90LatencyMs,
      cacheHitCount: metrics.search.cacheHitCount,
    },
    entity: metrics.entity,
    evidence: metrics.evidence,
    sourceGovernance: metrics.sourceGovernance,
    time: metrics.time,
    sourceId: metrics.sourceId,
    reproducibility: {
      pairCount: metrics.reproducibility.pairCount,
      claimAgreement: metrics.reproducibility.claimAgreement,
      sourceOverlap: metrics.reproducibility.sourceOverlap,
      structuredValueAgreement: metrics.reproducibility.structuredValueAgreement,
      averageConfidenceDrift: metrics.reproducibility.averageConfidenceDrift,
      contradictionDriftCount: metrics.reproducibility.contradictionDriftCount,
    },
    extraction: {
      expectedPrimaryCount: metrics.extraction.expectedPrimaryCount,
      effectivePrimaryCount: metrics.extraction.effectivePrimaryCount,
      schemaPassCount: metrics.extraction.schemaPassCount,
      schemaPassRate: metrics.extraction.schemaPassRate,
      privateLeakCount: metrics.extraction.privateLeakCount,
      unresolvedOrConflictedAcceptedCount: metrics.extraction.unresolvedOrConflictedAcceptedCount,
      executionPopulationAndRouteValid: metrics.extraction.executionPopulationAndRouteValid,
      dispatchedModelBindingFailureCount: metrics.extraction.dispatchedModelBindingFailureCount,
      requestCountByModel: metrics.extraction.requestCountByModel,
      tokenTotalsByModel: metrics.extraction.tokenTotalsByModel,
      latencyByModel: metrics.extraction.latencyByModel,
      relayMonetaryCostStatus: metrics.extraction.relayMonetaryCostStatus,
    },
  };
}

function publicBenchmarkMetrics(metrics) {
  return {
    expectedRequestCount: metrics.expectedRequestCount,
    dispatchedCount: metrics.dispatchedCount,
    providerSuccessCount: metrics.providerSuccessCount,
    effectiveDispatchedCount: metrics.effectiveDispatchedCount,
    compatibilitySetupRequestCount: metrics.compatibilitySetupRequestCount,
    schemaPassCount: metrics.schemaPassCount,
    schemaPassRate: metrics.schemaPassRate,
    workResolvedCount: metrics.entity.workResolvedCount,
    authorResolvedCount: metrics.entity.authorResolvedCount,
    claimCount: metrics.evidence.claimCount,
    acceptedClaimCount: metrics.evidence.acceptedClaimCount,
    pilotUsableClaimCount: metrics.evidence.pilotUsableClaimCount,
    rejectedClaimCount: metrics.evidence.rejectedClaimCount,
    rejectionReasons: metrics.evidence.rejectionReasons,
    pilotUsableWorkCoverage: metrics.evidence.pilotUsableWorkCoverage,
    sourceIdIntegrityRate: metrics.source.sourceIdIntegrityRate,
    fabricatedSourceIdCount: metrics.source.fabricatedSourceIdCount,
    modelGeneratedUrlCount: metrics.source.modelGeneratedUrlCount,
    unresolvedOrConflictedAcceptedCount: metrics.contradiction.unresolvedOrConflictedAcceptedCount,
    eventTimeCompleteness: metrics.time.eventTimeCompleteness,
    historicalBackfillCount: metrics.time.historicalBackfillCount,
    repeatClaimAgreement: metrics.reproducibility.claimAgreement,
    p50LatencyMs: metrics.costLatency.p50LatencyMs,
    p90LatencyMs: metrics.costLatency.p90LatencyMs,
    inputTokens: metrics.costLatency.inputTokens,
    outputTokens: metrics.costLatency.outputTokens,
    totalTokens: metrics.costLatency.totalTokens,
    physicalRequestCount: metrics.costLatency.physicalRequestCount,
    physicalTotalTokens: metrics.costLatency.physicalTotalTokens,
    physicalP50LatencyMs: metrics.costLatency.physicalP50LatencyMs,
    physicalP90LatencyMs: metrics.costLatency.physicalP90LatencyMs,
    hardSafetyGate: metrics.hardSafetyGate,
  };
}

function renderCapabilityMarkdown(report) {
  return `# M2 v2 Tavily Capability Report v0.2\n\n## 结论\n\nTavily 独立 Search Provider 判定为 **${report.tavilyProviderDecision}**；relay 仅保留 Extraction。\n\n- dispatch attempted: ${report.dispatchAttempted}\n- HTTP status: ${report.httpStatus ?? "none"}\n- error type: ${report.errorType}\n- API Key authenticated: ${report.apiKeyAuthenticated}\n- provider connectivity: ${report.providerConnectivity}\n- provider contract compatibility: ${report.providerContractCompatibility}\n- structured result count: ${report.resultCount}\n- include_usage supported: ${String(report.includeUsageSupported)}\n- API Key persisted: false\n- full160Authorized: false\n- status: \`not_for_formal_decision\`\n`;
}

function renderDiagnosticMarkdown(report) {
  return `# M2 v2 Egress Permission Diagnostic v0.1\n\n- DNS succeeded: ${report.dnsSucceeded}\n- DNS address count: ${report.dnsAddressCount}\n- DNS error type: ${report.dnsErrorType}\n- TCP 443 succeeded: ${report.tcp443Succeeded}\n- TCP error type: ${report.tcpErrorType}\n- client egress permission: ${report.clientEgressPermission}\n- full IP persisted: false\n- proxy value persisted: false\n- full160Authorized: false\n- status: \`not_for_formal_decision\`\n`;
}

function renderBenchmarkMarkdown(report) {
  const rows = Object.entries(report.models).map(([model, value]) => `| ${model} | ${value.schemaPassCount}/${value.expectedRequestCount} | ${value.workResolvedCount}/4 | ${rate(value.pilotUsableWorkCoverage)} | ${rate(value.repeatClaimAgreement)} | ${nullable(value.p50LatencyMs)} | ${nullable(value.totalTokens)} | ${value.hardSafetyGate.allPassed} |`).join("\n");
  return `# M2 v2 Luna/Terra Extraction Benchmark v0.1\n\n## 结论\n\n同一批 Source Records 的公平 Extraction Benchmark 判定为 **${report.extractionBenchmarkDecision}**。默认模型为 \`${report.defaultExtractionModel ?? "none"}\`，升级模型为 \`${report.escalationModel ?? "none"}\`。\n\n| 模型 | schema | resolved | pilotUsable coverage | repeat agreement | p50 ms | tokens | hard gate |\n|---|---:|---:|---:|---:|---:|---:|---|\n${rows || "| 未执行 | 0/0 | 0/4 | 0% | 0% | n/a | n/a | false |"}\n\n- benchmark works: ${report.sampleCount}\n- repeat works: ${report.repeatSampleCount}\n- same Source Records verified: ${report.sameSourceRecordsVerified}\n- quality before speed: true\n- Luna status: ${report.lunaStatus}\n- full160Authorized: false\n- status: \`not_for_formal_decision\`\n`;
}

function renderExecutionMarkdown(report) {
  return `# M2 v2 Canary v3 Execution Summary v0.1\n\n## 结论\n\n固定 10-work Canary v3 ${report.canaryExecuted ? "已执行" : "未执行"}；样本、seed 和失败样本均未改变。Search 仅使用 Tavily，relay 仅执行同源结构化 Extraction。\n\n- primary works: ${report.primaryWorkCount}\n- repeat works: ${report.repeatWorkCount}\n- Tavily physical requests: ${report.tavilyRequestCount}/${report.requestCaps.tavily}\n- relay physical requests: ${report.relayRequestCount}/${report.requestCaps.relay}\n- default extraction model: ${report.defaultExtractionModel ?? "none"}\n- escalation model: ${report.escalationModel ?? "none"}\n- browser / relay search used: false\n- full160Authorized: false\n- status: \`not_for_formal_decision\`\n`;
}

function renderQualityMarkdown(report) {
  const metrics = report.metrics;
  if (!metrics) return `# M2 v2 Canary v3 Quality Report v0.1\n\nCanary 未执行，因此没有真实质量指标。\n\n- full160Authorized: false\n- status: \`not_for_formal_decision\`\n`;
  return `# M2 v2 Canary v3 Quality Report v0.1\n\n## 质量摘要\n\n- Tavily query success: ${rate(metrics.search.querySuccessRate)}\n- Source Record work coverage: ${metrics.search.sourceRecordWorkCount}/10\n- work entity resolution: ${rate(metrics.entity.workResolvedRate)}\n- Extraction schema pass: ${rate(metrics.extraction.schemaPassRate)}\n- pilotUsable evidence work coverage: ${rate(metrics.evidence.pilotUsableEvidenceWorkCoverage)}\n- high-value coverage: ${rate(metrics.evidence.highValueCoverage)}\n- evidence category count: ${metrics.evidence.categoryCount}\n- source type distribution: ${JSON.stringify(metrics.sourceGovernance.sourceTypeCandidateDistribution)}\n- sourceId integrity: ${rate(metrics.sourceId.integrityRate)}\n- capturedAt / availableAt: ${rate(metrics.time.capturedAtCompleteness)} / ${rate(metrics.time.availableAtCompleteness)}\n- repeat claim agreement: ${rate(metrics.reproducibility.claimAgreement)}\n- repeat source overlap: ${rate(metrics.reproducibility.sourceOverlap)}\n- prohibited accepted / historical backfill / private leak: ${metrics.sourceGovernance.prohibitedSourceAcceptedCount} / ${metrics.time.historicalBackfillCount} / ${metrics.extraction.privateLeakCount}\n- Research Candidate Registry entries: ${report.researchCandidateRegistryCount}\n- private review workbook generated: ${report.privateWorkbookGenerated}\n- researchApproved / modelEligible: 0 / 0\n- full160Authorized: false\n- status: \`not_for_formal_decision\`\n`;
}

function renderDecisionMarkdown(report) {
  return `# M2 v2 Canary v3 Decision v0.1\n\n## Decision\n\n**${report.decision}**\n\n- safety passed: ${report.safetyPassed}\n- usability passed: ${report.usabilityPassed}\n- next step: ${report.nextStep}\n- full160Authorized: false\n- model training performed: false\n- B4 changed: false\n- final holdout opened: false\n- V2-C/V2-D/C4/M3 entered: false\n- release: false\n- status: \`not_for_formal_decision\`\n`;
}

function renderNextStepMarkdown(report) {
  return `# M2 v2 V2-B.5 Next Step v0.2\n\n## 当前边界\n\n${report.instruction}\n\n- current decision: ${report.currentDecision}\n- full160Authorized: false\n- 禁止后续阶段: ${report.prohibitedNextPhases.join(", ")}\n- status: \`not_for_formal_decision\`\n`;
}

function renderResumeMarkdown(report) {
  return `# M2 v2 V2-B.5 Resume Summary v0.1\n\n- resume attempted: ${report.resumeAttempted}\n- execution status: ${report.executionStatus}\n- capability decision: ${report.capabilityDecision}\n- legacy state migration applied: ${report.legacyStateMigrationApplied}\n- manifests preserved: ${report.manifestsPreserved}\n- Tavily physical requests: ${report.tavilyPhysicalRequestCount}/40\n- relay physical requests: ${report.relayPhysicalRequestCount}/40\n- Source Record count: ${report.sourceRecordCount}\n- benchmark executed: ${report.benchmarkExecuted}\n- canary executed: ${report.canaryExecuted}\n- canary decision: ${report.canaryDecision}\n- full160Authorized: false\n- status: \`not_for_formal_decision\`\n`;
}

function buildCanaryV3Manifest(frozen, createdAt) {
  const repeatByDigest = new Set(frozen.repeatSample.map((item) => item.identityDigest));
  const sample = frozen.sample.map((item) => ({
    standardWorkId: item.standardWorkId,
    title: item.title,
    author: item.author,
    identityDigest: item.identityDigest,
    sourceType: item.sourceType,
    revenueBand: item.revenueBand,
    ambiguityRisk: item.ambiguityRisk,
    evidencePrior: item.evidencePrior,
    highValue: item.highValue,
    sameNameCount: item.sameNameCount,
    canarySlotId: item.canarySlotId,
  }));
  const payload = {
    schema: "m2.v2.canary-v3-execution-manifest.v0.1",
    privateOnly: true,
    immutable: true,
    createdAt,
    parentCanaryManifestDigest: frozen.canaryManifestDigest,
    seed: frozen.seed,
    sampleCount: 10,
    repeatSampleCount: 5,
    sample,
    repeatSample: sample.filter((item) => repeatByDigest.has(item.identityDigest)).map((item) => ({ canarySlotId: item.canarySlotId, identityDigest: item.identityDigest })),
    searchProvider: V2B5_TAVILY_PROVIDER_ID,
    sourceRecordSchema: V2B5_SOURCE_RECORD_SCHEMA,
    sourceGovernanceSchema: V2B5_SOURCE_GOVERNANCE_SCHEMA,
    extractionSchema: V2B5_EXTRACTION_SCHEMA,
    queryPolicy: { queriesPerWork: 2, maxResultsPerQuery: 6, maxSourceRecordsPerWork: 6 },
    requestCaps: { tavily: V2B5_TAVILY_REQUEST_CAP, relay: V2B5_RELAY_REQUEST_CAP },
    full160Authorized: false,
  };
  return { ...payload, manifestDigest: sha256(payload) };
}

function assertFrozenCanaryManifest(manifest) {
  if (manifest?.privateOnly !== true || manifest?.immutable !== true || manifest?.sampleCount !== 10
    || manifest?.sample?.length !== 10 || manifest?.repeatSample?.length !== 5) throw new Error("v2b5_frozen_canary_invalid");
  if (digestWithout(manifest, "canaryManifestDigest") !== manifest.canaryManifestDigest) throw new Error("v2b5_frozen_canary_digest_invalid");
  if (manifest.canaryManifestDigest !== V2B5_FROZEN_CANARY_DIGEST) throw new Error("v2b5_frozen_canary_known_digest_mismatch");
}

function loadV2B5Configuration(root, suppliedEnv = null) {
  const env = suppliedEnv ?? { ...readEnvLocal(join(root, ".env.local")), ...process.env };
  const tavily = {
    baseUrl: String(env.M2_V2_TAVILY_BASE_URL ?? "https://api.tavily.com").trim().replace(/\/+$/u, ""),
    apiKey: String(env.TAVILY_API_KEY ?? ""),
    topic: String(env.M2_V2_TAVILY_TOPIC ?? "general"),
    searchDepth: String(env.M2_V2_TAVILY_SEARCH_DEPTH ?? "basic"),
    maxResults: Number(env.M2_V2_TAVILY_MAX_RESULTS ?? 6),
    country: String(env.M2_V2_TAVILY_COUNTRY ?? "china"),
    projectId: String(env.M2_V2_TAVILY_PROJECT ?? "m2-v2-evidence-pilot"),
    timeoutMs: 30_000,
  };
  const relay = {
    baseUrl: String(env.OPENAI_BASE_URL ?? env.M2_V2_EVIDENCE_API_BASE_URL ?? "").trim().replace(/\/+$/u, ""),
    apiKey: String(env.OPENAI_API_KEY ?? ""),
    timeoutMs: 25_000,
    reasoningEffort: String(env.M2_V2_EXTRACTION_REASONING_EFFORT ?? "low"),
  };
  if (env.M2_V2_SEARCH_PROVIDER !== V2B5_TAVILY_PROVIDER_ID) throw new Error("v2b5_search_provider_config_invalid");
  if (!/^https:\/\/api\.tavily\.com$/u.test(tavily.baseUrl) || !tavily.apiKey) throw new Error("v2b5_tavily_configuration_incomplete");
  if (tavily.topic !== "general" || tavily.searchDepth !== "basic" || tavily.maxResults !== 6 || tavily.country !== "china") throw new Error("v2b5_tavily_parameter_config_invalid");
  if (!/^https:\/\//u.test(relay.baseUrl) || !relay.apiKey) throw new Error("v2b5_relay_configuration_incomplete");
  if (Number(env.M2_V2_TAVILY_MAX_REQUESTS ?? 40) !== V2B5_TAVILY_REQUEST_CAP
    || Number(env.M2_V2_RELAY_EXTRACTION_MAX_REQUESTS ?? 40) !== V2B5_RELAY_REQUEST_CAP) throw new Error("v2b5_request_cap_config_invalid");
  return { tavily, relay };
}

function publicConfigurationProjection(config) {
  return {
    tavilyApiKeyConfigured: Boolean(config.tavily.apiKey),
    relayApiKeyConfigured: Boolean(config.relay.apiKey),
    searchProvider: V2B5_TAVILY_PROVIDER_ID,
    extractionProvider: V2B5_RELAY_EXTRACTION_PROVIDER_ID,
    tavilyRequestCap: V2B5_TAVILY_REQUEST_CAP,
    relayRequestCap: V2B5_RELAY_REQUEST_CAP,
  };
}

function newExecutionState(frozen, bindings) {
  return {
    schema: "m2.v2.v2b5-execution-state.v0.1",
    privateOnly: true,
    createdAt: new Date().toISOString(),
    benchmarkManifestDigest: frozen.benchmarkManifest.benchmarkManifestDigest,
    canaryManifestDigest: frozen.canaryManifest.manifestDigest,
    tavilyBindingDigest: bindings.tavily,
    relayBindingDigest: bindings.relay,
    executionStatus: "initialized",
    includeUsageSupported: null,
    capabilityAttemptCount: 0,
    reasoningSupported: null,
    pretestsPassed: false,
    canaryExecuted: false,
    full160Authorized: false,
    tavily: budgetState(V2B5_TAVILY_REQUEST_CAP),
    relay: budgetState(V2B5_RELAY_REQUEST_CAP),
  };
}

function budgetState(cap) {
  return { cap, physicalRequestCount: 0, reservations: {} };
}

function newCache(kind, frozen, bindings) {
  return {
    schema: `m2.v2.v2b5-${kind}-cache.v0.1`,
    privateOnly: true,
    benchmarkManifestDigest: frozen.benchmarkManifest.benchmarkManifestDigest,
    canaryManifestDigest: frozen.canaryManifest.manifestDigest,
    providerBindingDigest: bindings[kind],
    entries: {},
  };
}

function assertExecutionContainers(state, tavilyCache, relayCache, frozen, bindings) {
  for (const item of [state, tavilyCache, relayCache]) {
    if (item.benchmarkManifestDigest !== frozen.benchmarkManifest.benchmarkManifestDigest
      || item.canaryManifestDigest !== frozen.canaryManifest.manifestDigest) throw new Error("v2b5_execution_container_manifest_mismatch");
  }
  if (state.tavily.cap !== V2B5_TAVILY_REQUEST_CAP || state.relay.cap !== V2B5_RELAY_REQUEST_CAP) throw new Error("v2b5_execution_cap_changed");
  if (state.tavilyBindingDigest !== bindings.tavily || state.relayBindingDigest !== bindings.relay
    || tavilyCache.providerBindingDigest !== bindings.tavily || relayCache.providerBindingDigest !== bindings.relay) {
    throw new Error("v2b5_provider_binding_changed");
  }
  if (state.full160Authorized !== false) throw new Error("v2b5_full160_invariant_changed");
}

function configurationBindings(config) {
  return {
    tavily: sha256({
      provider: V2B5_TAVILY_PROVIDER_ID,
      baseUrlDigest: sha256(config.tavily.baseUrl),
      adapterVersion: V2B5_TAVILY_ADAPTER_VERSION,
      sourceRecordSchema: V2B5_SOURCE_RECORD_SCHEMA,
      topic: config.tavily.topic,
      searchDepth: config.tavily.searchDepth,
      maxResults: config.tavily.maxResults,
      country: config.tavily.country,
    }),
    relay: sha256({
      provider: V2B5_RELAY_EXTRACTION_PROVIDER_ID,
      baseUrlDigest: sha256(config.relay.baseUrl),
      adapterVersion: V2B5_EXTRACTION_ADAPTER_VERSION,
      extractionSchema: V2B5_EXTRACTION_SCHEMA,
      models: [...V2B5_MODELS],
      maxOutputTokens: 1_200,
      reasoningEffort: config.relay.reasoningEffort,
    }),
  };
}

function reservePhysicalRequest(context, provider, physicalKey, metadata) {
  const budget = context.state[provider];
  if (budget.physicalRequestCount >= budget.cap) throw new Error(`v2b5_${provider}_request_cap_reached`);
  if (budget.reservations[physicalKey]) throw new Error(`v2b5_${provider}_request_already_reserved`);
  budget.physicalRequestCount += 1;
  budget.reservations[physicalKey] = {
    status: "reserved_before_dispatch",
    reservedAt: context.now(),
    ordinal: budget.physicalRequestCount,
    ...metadata,
  };
  checkpointExecution(context.root, context.privateStore, context.state, context.tavilyCache, context.relayCache);
}

function completePhysicalRequest(context, provider, physicalKey, result) {
  const reservation = context.state[provider].reservations[physicalKey];
  if (!reservation) throw new Error(`v2b5_${provider}_reservation_missing`);
  reservation.status = "completed";
  reservation.completedAt = context.now();
  reservation.resultDigest = sha256(result);
  checkpointExecution(context.root, context.privateStore, context.state, context.tavilyCache, context.relayCache);
}

function cancelPredispatchReservation(context, provider, physicalKey) {
  const budget = context.state[provider];
  const reservation = budget.reservations[physicalKey];
  if (!reservation || reservation.ordinal !== budget.physicalRequestCount) {
    throw new Error(`v2b5_${provider}_predispatch_reservation_order_invalid`);
  }
  delete budget.reservations[physicalKey];
  budget.physicalRequestCount -= 1;
  checkpointExecution(context.root, context.privateStore, context.state, context.tavilyCache, context.relayCache);
}

function reconcileIndeterminateReservations(state, tavilyCache, relayCache, timestamp) {
  for (const [provider, cache] of [["tavily", tavilyCache], ["relay", relayCache]]) {
    for (const reservation of Object.values(state[provider].reservations)) {
      if (reservation.status !== "reserved_before_dispatch") continue;
      const present = cache.entries[reservation.cacheKey];
      if (present) {
        reservation.status = "completed_recovered";
        reservation.completedAt = timestamp;
        reservation.resultDigest = sha256(present);
      } else {
        reservation.status = "indeterminate_after_crash";
        reservation.completedAt = timestamp;
      }
    }
  }
}

function remainingBudget(state, provider) {
  return state[provider].cap - state[provider].physicalRequestCount;
}

function checkpointExecution(root, privateStore, state, tavilyCache, relayCache) {
  commitAtomicRequestCheckpoint(root, {
    scope: "v2b5",
    state,
    caches: { tavily: tavilyCache, relay: relayCache },
    receipts: Object.values(relayCache?.entries ?? {}),
    adapterVersion: V2B5_EXTRACTION_ADAPTER_VERSION,
    manifestBindings: {
      benchmarkManifestDigest: state.benchmarkManifestDigest,
      canaryManifestDigest: state.canaryManifestDigest,
      tavilyBindingDigest: state.tavilyBindingDigest,
      relayBindingDigest: state.relayBindingDigest,
    },
  });
  atomicWriteJson(join(privateStore, FILES.state), state);
  atomicWriteJson(join(privateStore, FILES.tavilyCache), tavilyCache);
  atomicWriteJson(join(privateStore, FILES.relayCache), relayCache);
}

function buildIndeterminateTavilyResult(input, descriptor, reservation) {
  const timestamp = reservation.completedAt ?? reservation.reservedAt;
  const providerReceipt = buildSyntheticTavilyProviderReceipt(input, descriptor, {
    requestStartedAt: reservation.reservedAt,
    responseReceivedAt: timestamp,
    errorCode: "indeterminate_after_crash",
    validationIssues: ["prior_budget_reservation_without_result"],
  });
  return {
    schema: "m2.v2.tavily-query-execution.v0.1",
    privateOnly: true,
    phase: input.phase,
    runKind: input.runKind,
    queryId: input.queryId,
    queryText: input.queryText,
    intent: input.intent ?? "capability",
    executionNamespace: input.executionNamespace,
    cacheKey: descriptor.cacheKey,
    cacheHit: false,
    dispatched: false,
    httpSuccess: false,
    providerConnectivityPassed: false,
    contractValid: false,
    status: "indeterminate_after_crash",
    sourceRecords: [],
    sourceRecordCount: 0,
    candidateObservations: [],
    resultCount: 0,
    usageCredits: null,
    responseTimeMs: null,
    responseReceivedAt: timestamp,
    providerReceipt,
    includeUsageUnsupported: false,
    issues: ["prior_budget_reservation_without_result"],
    rawResponsePersisted: false,
    full160Authorized: false,
  };
}

function buildTavilyExceptionResult(input, descriptor, error, timestamp) {
  const errorCode = `provider_exception:${safeToken(error?.message)}`;
  const providerReceipt = buildSyntheticTavilyProviderReceipt(input, descriptor, {
    requestStartedAt: timestamp,
    responseReceivedAt: timestamp,
    errorCode,
    validationIssues: [errorCode],
  });
  return {
    schema: "m2.v2.tavily-query-execution.v0.1",
    privateOnly: true,
    phase: input.phase,
    runKind: input.runKind,
    queryId: input.queryId,
    queryText: input.queryText,
    intent: input.intent ?? "capability",
    executionNamespace: input.executionNamespace,
    cacheKey: descriptor.cacheKey,
    cacheHit: false,
    dispatched: true,
    httpSuccess: false,
    providerConnectivityPassed: false,
    contractValid: false,
    status: "provider_exception",
    sourceRecords: [],
    sourceRecordCount: 0,
    candidateObservations: [],
    resultCount: 0,
    usageCredits: null,
    responseTimeMs: null,
    responseReceivedAt: timestamp,
    providerReceipt,
    includeUsageUnsupported: false,
    issues: [errorCode],
    rawResponsePersisted: false,
    full160Authorized: false,
  };
}

function buildSyntheticTavilyProviderReceipt(input, descriptor, details = {}) {
  const payload = {
    schema: V2B5_TAVILY_RECEIPT_SCHEMA,
    privateOnly: true,
    provider: V2B5_TAVILY_PROVIDER_ID,
    providerVersion: V2B5_TAVILY_ADAPTER_VERSION,
    requestId: null,
    queryId: input.queryId,
    requestStartedAt: details.requestStartedAt ?? null,
    responseReceivedAt: details.responseReceivedAt ?? null,
    responseTimeMs: null,
    providerResponseTime: null,
    httpStatus: null,
    resultCount: 0,
    acceptedResultCount: 0,
    usageCredits: null,
    cacheKey: descriptor.cacheKey,
    retryCount: input.retryCount ?? 0,
    errorCode: details.errorCode ?? "unavailable",
    responseContentTypeClass: "unavailable",
    schemaVersion: V2B5_SOURCE_RECORD_SCHEMA,
    rawResponsePersisted: false,
    authorizationHeaderPersisted: false,
    apiKeyPersisted: false,
    validationIssues: details.validationIssues ?? [],
  };
  return { ...payload, receiptDigest: sha256(payload) };
}

function buildBlockedRelayReceipt(input, sourceRecordSetDigest, reason, timestamp) {
  return {
    schema: "m2.v2.relay-extraction-receipt.v0.1",
    privateOnly: true,
    provider: V2B5_RELAY_EXTRACTION_PROVIDER_ID,
    providerMode: "evidence_extraction_only",
    phase: input.phase,
    runKind: input.runKind,
    attemptKind: input.attemptKind,
    canarySlotId: input.work?.canarySlotId,
    requestedModelId: input.model,
    returnedModelId: null,
    modelBindingVerified: false,
    sourceRecordSetDigest,
    requestStartedAt: timestamp,
    responseReceivedAt: timestamp,
    latencyMs: null,
    dispatched: false,
    httpStatus: null,
    status: reason,
    providerConnectivityPassed: false,
    providerContractCompatible: false,
    normalizedResponse: emptyNormalizedExtraction(sourceRecordSetDigest, reason),
    usage: { inputTokens: null, outputTokens: null, totalTokens: null },
    rawResponsePersisted: false,
    searchToolUsed: false,
    full160Authorized: false,
  };
}

function buildRelayExceptionReceipt(input, sourceRecordSetDigest, error, timestamp) {
  return {
    ...buildBlockedRelayReceipt(input, sourceRecordSetDigest, `provider_exception:${safeToken(error?.message)}`, timestamp),
    dispatched: true,
  };
}

function emptyNormalizedExtraction(sourceRecordSetDigest, issue) {
  return {
    schema: "m2.v2.extraction-layer-result.v0.3",
    extractionSchema: V2B5_EXTRACTION_SCHEMA,
    adapterVersion: V2B5_EXTRACTION_ADAPTER_VERSION,
    sourceRecordSetDigest,
    contractValid: false,
    structuredValid: false,
    entityResolution: {
      work: { status: "unresolved", confidence: 0, supportingSourceIds: [] },
      author: { status: "unresolved", confidence: 0, supportingSourceIds: [] },
    },
    claims: [],
    contradictions: [],
    limitations: [],
    acceptedClaimCount: 0,
    pilotUsableClaimCount: 0,
    rejectedClaimCount: 0,
    sourceIdReferenceCount: 0,
    mappedSourceIdReferenceCount: 0,
    sourceIdIntegrityRate: 0,
    fabricatedSourceIdCount: 0,
    modelGeneratedUrlCount: 0,
    privateLeakCount: 0,
    historicalBackfillCount: 0,
    unresolvedOrConflictedEvidenceExcluded: true,
    capturedAtCompleteness: 0,
    availableAtCompleteness: 0,
    issues: [issue],
    rawResponsePersisted: false,
  };
}

function enrichRelayReceipt(receipt, input, cacheKey) {
  const enriched = {
    ...receipt,
    canarySlotId: input.work?.canarySlotId,
    identityDigest: input.work?.identityDigest,
    workReference: input.work?.standardWorkId,
    cacheKey,
    cacheHit: false,
  };
  return { ...enriched, runtimeReceiptDigest: sha256(enriched) };
}

function buildUsageLedger(state, tavilyExecutions, relayReceipts) {
  const relayModels = Object.fromEntries(V2B5_MODELS.map((model) => {
    const rows = relayReceipts.filter((receipt) => receipt.requestedModelId === model && receipt.dispatched === true);
    const tokens = rows.map((receipt) => receipt.usage?.totalTokens).filter(Number.isFinite);
    const latency = rows.map((receipt) => receipt.latencyMs).filter(Number.isFinite);
    return [model, {
      requestCount: rows.length,
      inputTokens: nullableSum(rows.map((receipt) => receipt.usage?.inputTokens)),
      outputTokens: nullableSum(rows.map((receipt) => receipt.usage?.outputTokens)),
      totalTokens: nullableSum(tokens),
      p50LatencyMs: percentile(latency, 0.50),
      p90LatencyMs: percentile(latency, 0.90),
    }];
  }));
  const tavilyLatency = tavilyExecutions.filter((item) => item.dispatched === true).map((item) => item.responseTimeMs).filter(Number.isFinite);
  return {
    schema: "m2.v2.v2b5-cost-usage-ledger.v0.1",
    privateOnly: true,
    tavily: {
      physicalRequestCount: state.tavily.physicalRequestCount,
      requestCap: state.tavily.cap,
      usageCredits: nullableSum(tavilyExecutions.map((item) => item.usageCredits)),
      p50LatencyMs: percentile(tavilyLatency, 0.50),
      p90LatencyMs: percentile(tavilyLatency, 0.90),
    },
    relay: {
      physicalRequestCount: state.relay.physicalRequestCount,
      requestCap: state.relay.cap,
      byModel: relayModels,
      monetaryCostStatus: "not_estimable_no_provider_pricing",
    },
    officialOpenAiPricingApplied: false,
    full160Authorized: false,
  };
}

function blockedCanaryEvaluation(manifest, reason) {
  return {
    schema: "m2.v2.canary-v3-evaluation.v0.1",
    privateOnly: true,
    evaluatedAt: new Date().toISOString(),
    canaryManifestDigest: manifest.manifestDigest,
    executed: false,
    defaultExtractionModel: null,
    escalationModel: null,
    metrics: null,
    safetyGates: [],
    usabilityGates: [],
    safetyPassed: false,
    usabilityPassed: false,
    decision: "CANARY_BLOCKED",
    blockerReason: reason,
    nextStep: "resolve_provider_or_pre_gate_blocker",
    full160Authorized: false,
    notForFormalDecision: true,
  };
}

function preGateItem(id, passed) {
  return { id, passed: passed === true };
}

function runTargetedPretest(root) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(process.execPath, ["--test", "test/m2-v2-v2b5.test.js"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    timeout: 120_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  const stdout = String(result.stdout ?? "");
  const stderr = String(result.stderr ?? "");
  return {
    schema: "m2.v2.v2b5-pretest-receipt.v0.1",
    privateOnly: true,
    startedAt,
    completedAt: new Date().toISOString(),
    command: "node --test targeted-v2b5-suite",
    exitCode: result.status,
    allPassed: result.status === 0,
    stdoutDigest: sha256(stdout),
    stderrDigest: sha256(stderr),
    rawOutputPersisted: false,
  };
}

function readValidationPassed(privateStore) {
  if (!existsSync(join(privateStore, FILES.validation))) return false;
  try { return readJson(join(privateStore, FILES.validation)).allPassed === true; } catch { return false; }
}

function emptyRegistry() {
  return {
    schema: "m2.v2.research-source-candidate-registry.v0.3",
    privateOnly: true,
    uniqueDomainCount: 0,
    entries: [],
  };
}

export function assertPublicV2B5Sanitized(content, privateDenyTokens = []) {
  const forbidden = [
    "data/private-output",
    '"standardWorkId"',
    '"workReference"',
    '"identityDigest"',
    '"canarySlotId"',
    '"queryText"',
    '"query"',
    '"sourceId"',
    '"title"',
    '"author"',
    '"url"',
    '"sourceTitle"',
    '"providerRequestId"',
    '"providerReceiptRef"',
    '"providerReceipt"',
    '"domain"',
    '"snippet"',
    "OPENAI_API_KEY",
    "TAVILY_API_KEY",
    "Authorization",
    "sk-",
    "tvly-",
  ];
  for (const token of forbidden) if (content.includes(token)) throw new Error(`v2b5_public_privacy_token:${token}`);
  if (/https?:\/\//iu.test(content)) throw new Error("v2b5_public_external_url_forbidden");
  if (/\b(?:[A-Za-z0-9-]+\.)+(?:com|cn|net|org|io|ai|co|gov|edu|xyz|top|info|me|app|dev)\b/iu.test(content)) throw new Error("v2b5_public_bare_domain_forbidden");
  if (/[A-Za-z]:[\\/]/u.test(content)) throw new Error("v2b5_public_absolute_path_forbidden");
  if (/(?:^|[\s"'])\/(?:home|Users|tmp|var|etc)(?:\/|\b)/u.test(content)) throw new Error("v2b5_public_absolute_path_forbidden");
  for (const token of privateDenyTokens) if (token && content.includes(token)) throw new Error(`v2b5_public_runtime_private_token:${sha256(token)}`);
  return true;
}

function collectPrivateDenyTokens(root, results) {
  const values = [];
  const manifestPath = join(root, V2B5_PRIVATE_RELATIVE, FILES.canaryManifest);
  if (existsSync(manifestPath)) {
    const manifest = readJson(manifestPath);
    for (const work of manifest.sample ?? []) values.push(work.title, work.author, work.identityDigest);
  }
  for (const record of results?.sourceRecords ?? []) values.push(record.sourceId, record.queryId, record.title, record.url, record.domain, record.snippet, record.providerRequestId, record.providerReceiptRef);
  for (const run of results?.searchRuns ?? []) {
    for (const query of run.queries ?? []) values.push(query.queryText);
  }
  for (const name of [FILES.benchmarkSearch, FILES.canarySearch]) {
    const path = join(root, V2B5_PRIVATE_RELATIVE, name);
    if (!existsSync(path)) continue;
    for (const run of readJson(path).runs ?? []) for (const query of run.queries ?? []) values.push(query.queryText, query.queryId);
  }
  return unique(values.filter((value) => typeof value === "string" && [...value].length >= 2));
}

function privateStoreIgnoredAndUntracked(root) {
  return privatePathIgnoredAndUntracked(root, V2B5_PRIVATE_RELATIVE);
}

function privatePathIgnoredAndUntracked(root, relativePath) {
  const ignored = spawnSync("git", ["check-ignore", "-q", "--", relativePath], { cwd: root, windowsHide: true }).status === 0;
  const tracked = spawnSync("git", ["ls-files", "--", relativePath], { cwd: root, encoding: "utf8", windowsHide: true });
  return ignored && !String(tracked.stdout ?? "").trim();
}

function ensurePrivateStore(root) {
  const privateStore = join(root, V2B5_PRIVATE_RELATIVE);
  mkdirSync(privateStore, { recursive: true });
  if (!privateStoreIgnoredAndUntracked(root)) throw new Error("v2b5_private_store_not_ignored_or_is_tracked");
  return privateStore;
}

function persistImmutable(path, candidate, digestKey, changedError, options = {}) {
  const digestExcludedKeys = Array.isArray(options.digestExcludedKeys) ? options.digestExcludedKeys : [];
  if (!existsSync(path)) {
    atomicWriteJson(path, candidate);
    return candidate;
  }
  const existing = readJson(path);
  const currentDigestValid = digestWithExcludedKeys(existing, digestKey, digestExcludedKeys) === existing[digestKey];
  const legacyDigestValid = options.allowLegacyDigestMigration === true && digestWithout(existing, digestKey) === existing[digestKey];
  if (!currentDigestValid && !legacyDigestValid) throw new Error("v2b5_existing_manifest_digest_invalid");
  const comparable = { ...candidate, createdAt: existing.createdAt };
  const { [digestKey]: _ignored, ...payload } = comparable;
  const regenerated = { ...payload, [digestKey]: digestWithExcludedKeys(payload, null, digestExcludedKeys) };
  const existingComparable = { ...existing, [digestKey]: regenerated[digestKey] };
  if (canonicalJson(existingComparable) !== canonicalJson(regenerated)) throw new Error(changedError);
  if (!currentDigestValid && legacyDigestValid) atomicWriteJson(path, regenerated);
  return regenerated;
}

function digestWithout(value, key) {
  const { [key]: _ignored, ...payload } = value;
  return sha256(payload);
}

function digestWithExcludedKeys(value, digestKey, excludedKeys = []) {
  const payload = { ...value };
  if (digestKey) delete payload[digestKey];
  for (const key of excludedKeys) delete payload[key];
  return sha256(payload);
}

function readEnvLocal(path) {
  if (!existsSync(path)) return {};
  const result = {};
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/u)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    result[key] = value;
  }
  return result;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readNdjson(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
}

function atomicWriteJson(path, value) {
  atomicWriteText(path, `${JSON.stringify(value, null, 2)}\n`);
}

function atomicWriteNdjson(path, values) {
  atomicWriteText(path, values.length ? `${values.map((value) => JSON.stringify(value)).join("\n")}\n` : "");
}

function atomicWriteText(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, value, "utf8");
  renameSync(temporary, path);
}

function uniqueBy(values, selector) {
  const map = new Map();
  for (const value of values) if (!map.has(selector(value))) map.set(selector(value), value);
  return [...map.values()];
}

function nullableSum(values) {
  const observed = values.filter(Number.isFinite);
  return observed.length ? observed.reduce((total, value) => total + value, 0) : null;
}

function percentile(values, probability) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(probability * sorted.length) - 1)];
}

function rate(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : "n/a";
}

function nullable(value) {
  return Number.isFinite(value) ? String(value) : "n/a";
}

function latestIsoTimestamp(values) {
  return (values ?? []).filter(isIsoTimestamp).sort().at(-1) ?? null;
}

function isIsoTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function finiteOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function cleanAnonymousSampleId(value) {
  const text = String(value ?? "").trim();
  return /^slot\d{2}$/u.test(text) ? text : "anonymous";
}

function cleanWorkbookText(value, limit) {
  if (typeof value !== "string") return "";
  return [...value.normalize("NFKC").replace(/[\u0000-\u001F\u007F]/gu, " ").replace(/\s+/gu, " ").trim()]
    .slice(0, limit).join("");
}

function safeToken(value) {
  const text = String(value ?? "").trim();
  if (!text) return "unknown";
  return /^[A-Za-z0-9_.:-]{1,160}$/u.test(text) ? text : `sha256:${sha256(text)}`;
}

function unique(values) {
  return [...new Set(values)];
}

export const __test = Object.freeze({
  buildCanaryV3Manifest,
  buildPublicReportBundle,
  buildUsageLedger,
  blockedCanaryEvaluation,
  digestWithout,
  loadV2B5Configuration,
  publicBenchmarkMetrics,
  migrateV2B5LegacyCapabilityState,
  buildV2B5ExecutionBlockCapability,
  canReuseV2B5TerminalPreGateResult,
});
