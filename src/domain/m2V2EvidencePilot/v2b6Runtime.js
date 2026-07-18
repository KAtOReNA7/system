import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { canonicalJson, sha256 } from "./pilotCore.js";
import {
  buildV2B5SourceRecordSet,
  validateV2B5SourceRecord,
} from "./sourceRecordV2B5.js";
import {
  V2B5_DEFAULT_SOURCE_GOVERNANCE_POLICY,
  classifyV2B5ProhibitedSource,
} from "./sourceGovernanceV2B5.js";
import { compareV2B5ClaimSets } from "./extractionV2B5.js";
import {
  V2B6_ADAPTER_VERSION,
  V2B6_DEFAULT_TIMEOUT_MS,
  buildV2B6CapabilityPayload,
  buildV2B6ClaimsPayload,
  buildV2B6EntityPayload,
  buildV2B6FullPayload,
  buildV2B6Receipt,
  dispatchV2B6RelayRequest,
  evaluateV2B6CapabilityResponse,
  mergeV2B6SplitOutput,
  normalizeV2B6BenchmarkResponse,
  parseV2B6StructuredResponse,
  resolveV2B6TimeoutMs,
} from "./relayExtractionAdapterV2B6.js";

export const V2B6_PRIVATE_RELATIVE = "data/private-output/m2-v2-evidence-pilot/v2-b6-extraction-remediation";
export const V2B6_SOURCE_RELATIVE = "data/private-output/m2-v2-evidence-pilot/v2-b5-independent-search-canary";
export const V2B6_RELAY_REQUEST_CAP = 40;
export const V2B6_MODELS = Object.freeze(["gpt-5.6-luna", "gpt-5.6-terra"]);

const FILES = Object.freeze({
  state: "v2b6-execution-state-private-v0.1.json",
  cache: "v2b6-request-cache-private-v0.1.json",
  failureMatrix: "extraction-failure-matrix-private-v0.1.json",
  shapeSkeleton: "response-shape-skeleton-private-v0.1.json",
  sourceBundle: "benchmark-source-bundle-private-v0.2.json",
  profile: "relay-capability-profile-private-v0.1.json",
  receipts: "benchmark-v2-relay-receipts-private-v0.1.ndjson",
  evaluation: "benchmark-v2-evaluation-private-v0.1.json",
  usage: "v2b6-usage-ledger-private-v0.1.json",
  verification: "v2b6-verification-receipt-private-v0.1.json",
});

const PUBLIC = Object.freeze({
  forensic: "docs/analysis/m2-v2/M2-v2-extraction-failure-forensic-v0.1",
  capability: "docs/analysis/m2-v2/M2-v2-relay-extraction-capability-matrix-v0.1",
  bundle: "docs/analysis/m2-v2/M2-v2-benchmark-source-bundle-audit-v0.1",
  benchmark: "docs/analysis/m2-v2/M2-v2-luna-terra-extraction-benchmark-v0.2",
  decision: "docs/analysis/m2-v2/M2-v2-v2b6-terminal-decision-v0.1",
  adapter: "docs/technical-design/m2-v2/M2-v2-relay-extraction-adapter-v0.2",
  receipt: "docs/technical-design/m2-v2/M2-v2-extraction-effective-receipt-contract-v0.1",
});

export function checkAndFreezeV2B6(root, options = {}) {
  const privateStore = join(root, V2B6_PRIVATE_RELATIVE);
  mkdirSync(privateStore, { recursive: true });
  const sourceStore = join(root, V2B6_SOURCE_RELATIVE);
  const sourceState = readJson(join(sourceStore, "v2b5-execution-state-private-v0.1.json"));
  const oldReceipts = readNdjson(join(sourceStore, "relay-extraction-receipts-private-v0.1.ndjson"));
  const oldSearch = readJson(join(sourceStore, "luna-terra-benchmark-search-private-v0.1.json"));
  const oldManifest = readJson(join(sourceStore, "luna-terra-benchmark-manifest-private-v0.1.json"));
  const bundle = persistImmutableBundle(join(privateStore, FILES.sourceBundle), buildFrozenBundle(oldSearch, oldManifest, options.now?.() ?? new Date().toISOString()));
  const forensic = buildFailureForensic(oldReceipts, sourceState, options.now?.() ?? new Date().toISOString());
  atomicWriteJson(join(privateStore, FILES.failureMatrix), forensic.failureMatrix);
  const shapePath = join(privateStore, FILES.shapeSkeleton);
  const priorShape = existsSync(shapePath) ? readJson(shapePath) : null;
  atomicWriteJson(shapePath, {
    ...forensic.shapeSkeleton,
    ...(priorShape?.currentCapabilityShapeSkeletons ? {
      currentCapabilityShapeSkeletons: priorShape.currentCapabilityShapeSkeletons,
      currentCapabilityRawResponsePersisted: false,
    } : {}),
  });
  const config = loadConfig(root, options.env);
  const statePath = join(privateStore, FILES.state);
  const state = existsSync(statePath) ? readJson(statePath) : newState(sourceState, bundle, config);
  assertState(state, sourceState, bundle, config);
  atomicWriteJson(statePath, state);
  if (!existsSync(join(privateStore, FILES.cache))) atomicWriteJson(join(privateStore, FILES.cache), { schema: "m2.v2.v2b6-request-cache.v0.1", privateOnly: true, entries: {} });
  return {
    privateStore,
    sourceStore,
    bundle,
    forensic,
    state,
    config: publicConfig(config),
  };
}

export async function runV2B6(root, options = {}) {
  const frozen = checkAndFreezeV2B6(root, options);
  const config = loadConfig(root, options.env);
  const context = {
    root,
    ...frozen,
    config,
    now: options.now ?? (() => new Date().toISOString()),
    fetchImpl: options.fetchImpl,
    onProgress: options.onProgress ?? (() => {}),
    statePath: join(frozen.privateStore, FILES.state),
    cachePath: join(frozen.privateStore, FILES.cache),
    cache: readJson(join(frozen.privateStore, FILES.cache)),
    receipts: readNdjson(join(frozen.privateStore, FILES.receipts)),
  };
  reconcileInProgress(context);
  const profile = await runCapabilityMatrix(context);
  atomicWriteJson(join(context.privateStore, FILES.profile), profile);
  atomicWriteJson(join(context.privateStore, FILES.shapeSkeleton), {
    ...context.forensic.shapeSkeleton,
    currentCapabilityShapeSkeletons: Object.fromEntries(V2B6_MODELS.map((model) => [
      model,
      profile.models[model].tests.map((test) => ({
        testId: test.testId,
        probe: test.probe,
        structuredMode: test.structuredMode,
        responseShapeSkeleton: test.responseShapeSkeleton,
      })),
    ])),
    currentCapabilityRawResponsePersisted: false,
  });
  const benchmarkReceipts = await runBenchmark(context, profile);
  const evaluation = evaluateV2B6Benchmark({ bundle: context.bundle, profile, receipts: benchmarkReceipts, evaluatedAt: context.now() });
  atomicWriteJson(join(context.privateStore, FILES.evaluation), evaluation);
  const usage = buildUsageLedger(context, profile, benchmarkReceipts);
  atomicWriteJson(join(context.privateStore, FILES.usage), usage);
  checkpoint(context);
  writeV2B6PublicReports(root, { forensic: context.forensic, bundle: context.bundle, profile, evaluation, usage });
  return { profile, evaluation, usage, state: context.state };
}

export function readV2B6Results(root) {
  const frozen = checkAndFreezeV2B6(root);
  const readOptional = (name) => existsSync(join(frozen.privateStore, name)) ? readJson(join(frozen.privateStore, name)) : null;
  return {
    forensic: frozen.forensic,
    bundle: frozen.bundle,
    profile: readOptional(FILES.profile),
    evaluation: readOptional(FILES.evaluation),
    usage: readOptional(FILES.usage),
    state: readJson(join(frozen.privateStore, FILES.state)),
  };
}

export function verifyV2B6(root) {
  const results = readV2B6Results(root);
  const issues = [];
  if (results.bundle.workCount !== 4 || results.bundle.repeatWorkCount !== 2) issues.push("source_bundle_population_invalid");
  if (results.bundle.newTavilyPhysicalRequestCount !== 0) issues.push("new_tavily_request_detected");
  if (!results.profile) issues.push("capability_profile_missing");
  if (!results.evaluation) issues.push("benchmark_evaluation_missing");
  if (results.state.physicalRelayRequestCount > V2B6_RELAY_REQUEST_CAP) issues.push("relay_request_cap_exceeded");
  if (results.state.tavilyPhysicalRequestCountBefore !== results.state.tavilyPhysicalRequestCountAfter) issues.push("tavily_count_changed");
  if (results.state.canaryExecuted !== false) issues.push("canary_executed");
  if (results.state.full160Authorized !== false) issues.push("full160_authorized");
  if (results.evaluation?.sameSourceBundleVerified !== true) issues.push("benchmark_fairness_failed");
  if (results.evaluation?.logicalDenominatorPerModel !== 6) issues.push("logical_denominator_invalid");
  for (const model of V2B6_MODELS) {
    if (results.evaluation?.models?.[model]?.logicalReceiptCount !== 6) issues.push(`logical_receipts_invalid:${model}`);
  }
  const publicPaths = Object.values(PUBLIC).flatMap((base) => [`${base}.json`, `${base}.md`]);
  for (const relative of publicPaths) if (!existsSync(join(root, relative))) issues.push(`public_report_missing:${relative}`);
  const publicLeakCount = publicPaths.filter((relative) => existsSync(join(root, relative)))
    .map((relative) => readFileSync(join(root, relative), "utf8"))
    .filter((content) => !isPublicSafe(content, results.bundle)).length;
  if (publicLeakCount) issues.push("public_private_token_leak");
  const receipt = {
    schema: "m2.v2.v2b6-verification-receipt.v0.1",
    privateOnly: true,
    verifiedAt: new Date().toISOString(),
    allPassed: issues.length === 0,
    issues,
    publicLeakCount,
    sourceBundleDigest: results.bundle.sourceBundleDigest,
    tavilyPhysicalRequestCountBefore: results.state.tavilyPhysicalRequestCountBefore,
    tavilyPhysicalRequestCountAfter: results.state.tavilyPhysicalRequestCountAfter,
    newTavilyPhysicalRequestCount: 0,
    relayPhysicalRequestCount: results.state.physicalRelayRequestCount,
    canaryExecuted: false,
    full160Authorized: false,
  };
  atomicWriteJson(join(root, V2B6_PRIVATE_RELATIVE, FILES.verification), receipt);
  return receipt;
}

export function writeV2B6PublicReports(root, supplied = null) {
  const r = supplied ?? readV2B6Results(root);
  const reports = buildPublicReports(r);
  for (const [key, report] of Object.entries(reports)) {
    const base = PUBLIC[key];
    mkdirSync(dirname(join(root, `${base}.json`)), { recursive: true });
    atomicWriteJson(join(root, `${base}.json`), report);
    writeFileSync(join(root, `${base}.md`), renderMarkdown(key, report), "utf8");
  }
  return { publicReports: Object.values(PUBLIC).flatMap((base) => [`${base}.json`, `${base}.md`]) };
}

async function runCapabilityMatrix(context) {
  const existing = existsSync(join(context.privateStore, FILES.profile)) ? readJson(join(context.privateStore, FILES.profile)) : null;
  if (existing?.sourceBundleDigest === context.bundle.sourceBundleDigest && existing?.complete === true) return existing;
  const tests = {};
  for (const model of V2B6_MODELS) {
    const rows = [];
    rows.push(await capabilityRequest(context, model, "E0", "plain"));
    const strictMinimal = await capabilityRequest(context, model, "E1", "server_strict");
    rows.push(strictMinimal);
    const structuredMode = strictMinimal.passed ? "server_strict" : "local_json";
    if (!strictMinimal.passed) rows.push(await capabilityRequest(context, model, "E1", "local_json"));
    rows.push(await capabilityRequest(context, model, "E2", structuredMode));
    rows.push(await capabilityRequest(context, model, "E3", structuredMode));
    rows.push(await capabilityRequest(context, model, "E4", structuredMode, "probe_1"));
    rows.push(await capabilityRequest(context, model, "E4", structuredMode, "probe_2"));
    const e4 = rows.filter((row) => row.testId === "E4" && row.structuredMode === structuredMode);
    const e2 = rows.find((row) => row.testId === "E2" && row.structuredMode === structuredMode);
    const e3 = rows.find((row) => row.testId === "E3" && row.structuredMode === structuredMode);
    const extractionMode = e4.length === 2 && e4.every((row) => row.passed) ? "full"
      : e2?.passed && e3?.passed ? "split" : "blocked";
    tests[model] = {
      requestedModelId: model,
      structuredMode,
      extractionMode,
      modelBindingStatuses: unique(rows.map((row) => row.modelBindingStatus)),
      tests: rows,
    };
  }
  const payload = {
    schema: "m2.v2.relay-capability-profile.v0.1",
    privateOnly: true,
    complete: true,
    createdAt: context.now(),
    adapterVersion: V2B6_ADAPTER_VERSION,
    timeoutMs: context.config.timeoutMs,
    sourceBundleDigest: context.bundle.sourceBundleDigest,
    models: tests,
    syntheticPhysicalRequestCount: Object.values(tests).flatMap((item) => item.tests).filter((item) => item.dispatched).length,
    tavilyRequestUsed: false,
    canaryExecuted: false,
    full160Authorized: false,
  };
  payload.capabilityProfileDigest = sha256({ ...payload, createdAt: null });
  return payload;
}

async function capabilityRequest(context, model, testId, structuredMode, suffix = "probe") {
  const mode = structuredMode === "plain" ? "server_strict" : structuredMode;
  const payload = buildV2B6CapabilityPayload(testId, model, mode);
  const keyPayload = {
    adapterVersion: V2B6_ADAPTER_VERSION,
    phase: "capability",
    testId,
    suffix,
    model,
    structuredMode,
    timeoutMs: context.config.timeoutMs,
    payloadDigest: sha256(payload),
  };
  const { response, receipt, cacheHit } = await dispatchCached(context, keyPayload, payload);
  const result = evaluateV2B6CapabilityResponse(testId, response.json);
  return {
    testId,
    probe: suffix,
    structuredMode,
    dispatched: true,
    cacheHit,
    httpStatus: response.httpStatus,
    timedOut: response.timedOut,
    latencyMs: response.latencyMs,
    passed: response.httpOk && result.passed,
    carrier: result.carrier,
    issues: result.issues,
    modelBindingStatus: receipt.modelBindingStatus,
    usage: receipt.usage,
    responseShapeSkeleton: receipt.responseShapeSkeleton,
  };
}

async function runBenchmark(context, profile) {
  const existingEvaluation = existsSync(join(context.privateStore, FILES.evaluation));
  if (existingEvaluation) {
    const existing = readJson(join(context.privateStore, FILES.evaluation));
    if (existing.sourceBundleDigest === context.bundle.sourceBundleDigest) {
      return readNdjson(join(context.privateStore, FILES.receipts)).filter((item) => item.phase === "benchmark_effective");
    }
  }
  const effective = [];
  const logicalRuns = [
    ...context.bundle.works.map((work) => ({ work, runKind: "primary" })),
    ...context.bundle.repeatSlotIds.map((slot) => ({ work: context.bundle.works.find((item) => item.canarySlotId === slot), runKind: "repeat" })),
  ];
  for (const [index, logical] of logicalRuns.entries()) {
    const order = index % 2 === 0 ? V2B6_MODELS : [...V2B6_MODELS].reverse();
    for (const model of order) {
      const modelProfile = profile.models[model];
      if (modelProfile.extractionMode === "blocked") {
        effective.push(blockedEffectiveReceipt(context, profile, model, logical));
      } else if (modelProfile.extractionMode === "full") {
        effective.push(await executeFullLogical(context, profile, model, modelProfile, logical));
      } else {
        effective.push(await executeSplitLogical(context, profile, model, modelProfile, logical));
      }
      writeNdjson(join(context.privateStore, FILES.receipts), context.receipts);
    }
  }
  return effective;
}

async function executeFullLogical(context, profile, model, modelProfile, logical) {
  const payload = buildV2B6FullPayload({
    model,
    mode: modelProfile.structuredMode,
    work: logical.work,
    sourceRecords: logical.work.sourceRecords,
    maxOutputTokens: 1_200,
  });
  const key = logicalDescriptor(context, profile, model, modelProfile, logical, "full");
  const { response, receipt } = await dispatchCached(context, key, payload);
  const normalizedResponse = normalizeV2B6BenchmarkResponse(response.json, extractionContext(logical.work));
  const effective = effectiveReceipt(context, profile, model, modelProfile, logical, [receipt], normalizedResponse);
  context.receipts.push(effective);
  return effective;
}

async function executeSplitLogical(context, profile, model, modelProfile, logical) {
  const entityPayload = buildV2B6EntityPayload({
    model, mode: modelProfile.structuredMode, work: logical.work, sourceRecords: logical.work.sourceRecords,
  });
  const entityKey = logicalDescriptor(context, profile, model, modelProfile, logical, "entity");
  const entityPhysical = await dispatchCached(context, entityKey, entityPayload);
  const entityParsed = parseV2B6StructuredResponse(entityPhysical.response.json);
  const claimsPayload = buildV2B6ClaimsPayload({
    model,
    mode: modelProfile.structuredMode,
    work: logical.work,
    sourceRecords: logical.work.sourceRecords,
    entityResolution: entityParsed.value?.entityResolution ?? unresolvedEntities(),
  });
  const claimsKey = logicalDescriptor(context, profile, model, modelProfile, logical, "claims");
  const claimsPhysical = await dispatchCached(context, claimsKey, claimsPayload);
  const claimsParsed = parseV2B6StructuredResponse(claimsPhysical.response.json);
  const merged = mergeV2B6SplitOutput(entityParsed.value, claimsParsed.value);
  const normalizedResponse = normalizeV2B6BenchmarkResponse({ output_parsed: merged }, extractionContext(logical.work));
  const effective = effectiveReceipt(context, profile, model, modelProfile, logical, [entityPhysical.receipt, claimsPhysical.receipt], normalizedResponse);
  context.receipts.push(effective);
  return effective;
}

async function dispatchCached(context, descriptor, payload) {
  const cacheKey = sha256(descriptor);
  const cached = context.cache.entries[cacheKey];
  if (cached) return { response: cached.response, receipt: cached.receipt, cacheHit: true };
  if (context.state.physicalRelayRequestCount >= V2B6_RELAY_REQUEST_CAP) throw new Error("v2b6_relay_request_cap_exhausted");
  context.state.physicalRelayRequestCount += 1;
  context.state.reservations[cacheKey] = { status: "in_progress", reservedAt: context.now(), descriptor };
  checkpoint(context);
  context.onProgress({ phase: descriptor.phase, model: descriptor.model, testId: descriptor.testId ?? null, stage: descriptor.stage ?? null, physicalRequestCount: context.state.physicalRelayRequestCount });
  const response = await dispatchV2B6RelayRequest({
    fetchImpl: context.fetchImpl,
    baseUrl: context.config.baseUrl,
    apiKey: context.config.apiKey,
    timeoutMs: context.config.timeoutMs,
    payload,
  });
  const receipt = buildV2B6Receipt({
    response,
    requestPayload: payload,
    requestedModelId: descriptor.model,
    phase: descriptor.phase,
    testId: descriptor.testId,
    logicalExtractionKey: cacheKey,
    attemptKind: descriptor.attemptKind,
    runKind: descriptor.runKind,
    canarySlotId: descriptor.canarySlotId,
    sourceBundleDigest: context.bundle.sourceBundleDigest,
    sourceRecordSetDigest: descriptor.sourceRecordSetDigest,
    capabilityProfileDigest: descriptor.capabilityProfileDigest,
    extractionMode: descriptor.extractionMode,
    structuredMode: descriptor.structuredMode,
    approvedAliases: context.config.approvedAliases,
  });
  const stored = { response, receipt };
  context.cache.entries[cacheKey] = stored;
  context.state.reservations[cacheKey] = { ...context.state.reservations[cacheKey], status: "completed", completedAt: context.now(), receiptDigest: receipt.receiptDigest };
  context.receipts.push(receipt);
  checkpoint(context);
  return { ...stored, cacheHit: false };
}

export function evaluateV2B6Benchmark(input) {
  const perModel = Object.fromEntries(V2B6_MODELS.map((model) => [model, evaluateModel(model, input.bundle, input.profile, input.receipts)]));
  const sameSourceBundleVerified = V2B6_MODELS.every((model) => perModel[model].sourceBundleDigest === input.bundle.sourceBundleDigest)
    && Object.values(perModel).every((row) => row.logicalReceiptCount === 6 && row.sameSourceRecordsWithinModel);
  const luna = perModel[V2B6_MODELS[0]];
  const terra = perModel[V2B6_MODELS[1]];
  const lunaPassed = luna.safetyGate.allPassed && luna.qualityGate.allPassed;
  const terraPassed = terra.safetyGate.allPassed && terra.qualityGate.allPassed;
  let decision = "BENCHMARK_FAIL";
  let defaultExtractionModel = null;
  let escalationModel = null;
  const reasons = [];
  if (!sameSourceBundleVerified) reasons.push("same_source_bundle_not_verified");
  else if (!lunaPassed && !terraPassed) reasons.push("both_models_failed_v2b6_gates");
  else if (!lunaPassed && terraPassed) {
    if (terra.bindingStatus === "unreported") {
      decision = "BENCHMARK_CONDITIONAL";
      reasons.push("terra_quality_passed_but_terra_binding_unreported");
    } else {
      decision = "BENCHMARK_PASS";
      defaultExtractionModel = V2B6_MODELS[1];
      escalationModel = V2B6_MODELS[1];
      reasons.push("terra_only_model_passing_all_gates");
    }
  } else if (lunaPassed && !terraPassed) {
    if (luna.bindingStatus === "unreported") {
      decision = "BENCHMARK_CONDITIONAL";
      reasons.push("luna_quality_passed_but_luna_binding_unreported");
    } else {
      decision = "BENCHMARK_PASS";
      defaultExtractionModel = V2B6_MODELS[0];
      reasons.push("luna_only_model_passing_all_gates");
    }
  } else if ([luna, terra].some((row) => row.bindingStatus === "unreported")) {
    decision = "BENCHMARK_CONDITIONAL";
    reasons.push("both_quality_gates_passed_but_model_binding_unreported");
  } else {
    const qualityNoninferior = luna.resolvedWorkCount >= terra.resolvedWorkCount - 1
      && luna.pilotUsableWorkCoverage >= terra.pilotUsableWorkCoverage - 0.10
      && (luna.repeatClaimAgreement ?? 0) >= (terra.repeatClaimAgreement ?? 0) - 0.10;
    const latencyImprovement = finite(luna.p50QualityLatencyMs) && finite(terra.p50QualityLatencyMs)
      && luna.p50QualityLatencyMs <= terra.p50QualityLatencyMs * 0.70;
    const tokenImprovement = finite(luna.totalQualityTokens) && finite(terra.totalQualityTokens)
      && luna.totalQualityTokens <= terra.totalQualityTokens * 0.70;
    decision = "BENCHMARK_PASS";
    if (qualityNoninferior && (latencyImprovement || tokenImprovement)) {
      defaultExtractionModel = V2B6_MODELS[0];
      escalationModel = V2B6_MODELS[1];
      reasons.push("luna_quality_noninferior_and_efficiency_gain_at_least_30_percent");
    } else {
      defaultExtractionModel = V2B6_MODELS[1];
      escalationModel = V2B6_MODELS[1];
      reasons.push("quality_first_rule_retains_terra");
    }
  }
  return {
    schema: "m2.v2.luna-terra-extraction-benchmark-evaluation.v0.2",
    privateOnly: true,
    evaluatedAt: input.evaluatedAt,
    sourceBundleDigest: input.bundle.sourceBundleDigest,
    capabilityProfileDigest: input.profile.capabilityProfileDigest,
    sameSourceBundleVerified,
    logicalDenominatorPerModel: 6,
    models: perModel,
    benchmarkDecision: decision,
    defaultExtractionModel,
    escalationModel,
    selectionReasons: reasons,
    nextStep: "CANARY_V3_RETRY_REQUIRES_SEPARATE_AUTHORIZATION",
    canaryExecuted: false,
    full160Authorized: false,
    notForFormalDecision: true,
  };
}

function evaluateModel(model, bundle, profile, receipts) {
  const rows = receipts.filter((item) => item.phase === "benchmark_effective" && item.requestedModelId === model);
  const primary = rows.filter((item) => item.runKind === "primary");
  const repeat = rows.filter((item) => item.runKind === "repeat");
  const normalized = rows.map((item) => item.normalizedResponse).filter(Boolean);
  const claims = normalized.flatMap((item) => item.claims ?? []);
  const referenceCount = sum(normalized.map((item) => item.sourceIdReferenceCount));
  const mappedCount = sum(normalized.map((item) => item.mappedSourceIdReferenceCount));
  const schemaPassCount = rows.filter((item) => item.normalizedResponse?.structuredValid).length;
  const noTimeoutCount = rows.filter((item) => item.physicalRequestCount > 0 && item.timedOut !== true).length;
  const resolvedWorkCount = primary.filter((item) => ["high", "medium"].includes(item.normalizedResponse?.entityResolution?.work?.status)).length;
  const usableSlots = new Set(primary.filter((item) => item.normalizedResponse?.pilotUsableClaimCount > 0).map((item) => item.canarySlotId));
  const repeatSchemaPassCount = repeat.filter((item) => item.normalizedResponse?.structuredValid).length;
  const repeatPairs = bundle.repeatSlotIds.map((slot) => {
    const a = primary.find((item) => item.canarySlotId === slot);
    const b = repeat.find((item) => item.canarySlotId === slot);
    return a?.normalizedResponse?.structuredValid && b?.normalizedResponse?.structuredValid
      ? compareV2B5ClaimSets(a.normalizedResponse.claims, b.normalizedResponse.claims) : null;
  });
  const bindingStatuses = unique(rows.map((item) => item.modelBindingStatus));
  const bindingStatus = bindingStatuses.includes("mismatch") ? "mismatch"
    : bindingStatuses.every((item) => ["exact", "approved_alias"].includes(item)) ? "verified" : "unreported";
  const allTimesComplete = rows.length === 6 && normalized.length === 6
    && normalized.every((item) => item.capturedAtCompleteness === 1 && item.availableAtCompleteness === 1);
  const safetyItems = [
    gate("private_leak_zero", sum(normalized.map((item) => item.privateLeakCount)), 0, (a) => a === 0),
    gate("fabricated_source_id_zero", sum(normalized.map((item) => item.fabricatedSourceIdCount)), 0, (a) => a === 0),
    gate("model_generated_url_zero", sum(normalized.map((item) => item.modelGeneratedUrlCount)), 0, (a) => a === 0),
    gate("source_id_integrity", referenceCount ? mappedCount / referenceCount : rows.length === 6 ? 1 : 0, 1, (a) => a === 1),
    gate("unresolved_conflicted_accepted_zero", claims.filter((item) => item.accepted && (!item.entityResolution || !["high", "medium"].includes(item.entityResolution.work?.status) || !["none", "resolved"].includes(item.contradictionStatus))).length, 0, (a) => a === 0),
    gate("historical_backfill_zero", sum(normalized.map((item) => item.historicalBackfillCount)), 0, (a) => a === 0),
    gate("schema_pass_rate", ratio(schemaPassCount, 6), 0.75, (a, b) => a >= b),
    gate("source_time_pipeline_complete", allTimesComplete, true, (a) => a === true),
    gate("no_timeout_rate", ratio(noTimeoutCount, 6), 0.75, (a, b) => a >= b),
    gate("model_binding_not_mismatch", bindingStatus, "not_mismatch", (a) => a !== "mismatch"),
  ];
  const qualityItems = [
    gate("resolved_work_count", resolvedWorkCount, 3, (a, b) => a >= b),
    gate("pilot_usable_work_count", usableSlots.size, 2, (a, b) => a >= b),
    gate("repeat_schema_pass_count", repeatSchemaPassCount, 1, (a, b) => a >= b),
    gate("repeat_claim_agreement_evaluable", repeatPairs.some(finite), true, (a) => a === true),
  ];
  const qualityRows = rows.filter((item) => item.timedOut !== true && item.normalizedResponse?.structuredValid);
  return {
    model,
    sourceBundleDigest: bundle.sourceBundleDigest,
    logicalReceiptCount: rows.length,
    physicalRequestCount: sum(rows.map((item) => item.physicalRequestCount)),
    sameSourceRecordsWithinModel: rows.every((item) => bundle.works.some((work) => work.canarySlotId === item.canarySlotId && work.sourceRecordSetDigest === item.sourceRecordSetDigest)),
    extractionMode: profile.models[model].extractionMode,
    structuredMode: profile.models[model].structuredMode,
    bindingStatus,
    schemaPassCount,
    schemaPassRate: ratio(schemaPassCount, 6),
    noTimeoutCount,
    noTimeoutRate: ratio(noTimeoutCount, 6),
    resolvedWorkCount,
    acceptedClaimCount: claims.filter((item) => item.accepted).length,
    pilotUsableClaimCount: claims.filter((item) => item.pilotUsable).length,
    rejectedClaimCount: claims.filter((item) => !item.accepted).length,
    rejectionReasons: countMany(claims.flatMap((item) => item.rejectionReasons ?? [])),
    pilotUsableWorkCount: usableSlots.size,
    pilotUsableWorkCoverage: ratio(usableSlots.size, 4),
    sourceIdIntegrityRate: referenceCount ? mappedCount / referenceCount : rows.length === 6 ? 1 : 0,
    capturedAtCompleteness: allTimesComplete ? 1 : average(normalized.map((item) => item.capturedAtCompleteness)) ?? 0,
    availableAtCompleteness: allTimesComplete ? 1 : average(normalized.map((item) => item.availableAtCompleteness)) ?? 0,
    eventTimeCompleteness: ratio(claims.filter((item) => isIsoTimestamp(item.eventTime)).length, claims.length),
    repeatSchemaPassCount,
    repeatClaimAgreement: average(repeatPairs.filter(finite)),
    repeatAgreementPerPair: repeatPairs,
    p50QualityLatencyMs: percentile(qualityRows.map((item) => item.latencyMs), 0.5),
    p90QualityLatencyMs: percentile(qualityRows.map((item) => item.latencyMs), 0.9),
    totalQualityTokens: nullableSum(qualityRows.map((item) => item.usage?.totalTokens)),
    totalPhysicalTokens: nullableSum(rows.map((item) => item.usage?.totalTokens)),
    safetyGate: gateGroup(safetyItems),
    qualityGate: gateGroup(qualityItems),
  };
}

function effectiveReceipt(context, profile, model, modelProfile, logical, physicalReceipts, normalizedResponse) {
  const bindingStatuses = unique(physicalReceipts.map((item) => item.modelBindingStatus));
  const modelBindingStatus = bindingStatuses.includes("mismatch") ? "mismatch"
    : bindingStatuses.every((item) => ["exact", "approved_alias"].includes(item)) ? "exact" : "unreported";
  const timedOut = physicalReceipts.some((item) => item.timedOut);
  const payload = {
    schema: "m2.v2.extraction-effective-receipt.v0.1",
    privateOnly: true,
    phase: "benchmark_effective",
    runKind: logical.runKind,
    canarySlotId: logical.work.canarySlotId,
    requestedModelId: model,
    modelBindingStatus,
    adapterVersion: V2B6_ADAPTER_VERSION,
    capabilityProfileDigest: profile.capabilityProfileDigest,
    extractionMode: modelProfile.extractionMode,
    structuredMode: modelProfile.structuredMode,
    timeoutMs: context.config.timeoutMs,
    sourceBundleDigest: context.bundle.sourceBundleDigest,
    sourceRecordSetDigest: logical.work.sourceRecordSetDigest,
    schemaVersion: "m2.v2.evidence-extraction-output.v0.2",
    physicalRequestCount: physicalReceipts.length,
    physicalReceiptDigests: physicalReceipts.map((item) => item.receiptDigest),
    effectiveSelectionRule: "successful_repair_then_successful_primary_then_latest_explicit_failure_then_indeterminate_then_missing",
    timedOut,
    latencyMs: timedOut ? null : sum(physicalReceipts.map((item) => item.latencyMs)),
    usage: sumUsage(physicalReceipts.map((item) => item.usage)),
    normalizedResponse,
    searchToolUsed: false,
    tavilyRequestUsed: false,
    canaryExecuted: false,
    full160Authorized: false,
  };
  return { ...payload, receiptDigest: sha256(payload) };
}

function blockedEffectiveReceipt(context, profile, model, logical) {
  const payload = {
    schema: "m2.v2.extraction-effective-receipt.v0.1",
    privateOnly: true,
    phase: "benchmark_effective",
    runKind: logical.runKind,
    canarySlotId: logical.work.canarySlotId,
    requestedModelId: model,
    modelBindingStatus: "unreported",
    adapterVersion: V2B6_ADAPTER_VERSION,
    capabilityProfileDigest: profile.capabilityProfileDigest,
    extractionMode: "blocked",
    structuredMode: profile.models[model].structuredMode,
    timeoutMs: context.config.timeoutMs,
    sourceBundleDigest: context.bundle.sourceBundleDigest,
    sourceRecordSetDigest: logical.work.sourceRecordSetDigest,
    schemaVersion: "m2.v2.evidence-extraction-output.v0.2",
    physicalRequestCount: 0,
    physicalReceiptDigests: [],
    effectiveSelectionRule: "missing",
    timedOut: false,
    latencyMs: null,
    usage: { inputTokens: null, outputTokens: null, totalTokens: null },
    normalizedResponse: null,
    status: "capability_profile_blocked",
    searchToolUsed: false,
    tavilyRequestUsed: false,
    canaryExecuted: false,
    full160Authorized: false,
  };
  const result = { ...payload, receiptDigest: sha256(payload) };
  context.receipts.push(result);
  return result;
}

function logicalDescriptor(context, profile, model, modelProfile, logical, stage) {
  return {
    phase: "benchmark",
    runKind: logical.runKind,
    canarySlotId: logical.work.canarySlotId,
    model,
    stage,
    attemptKind: "primary",
    adapterVersion: V2B6_ADAPTER_VERSION,
    capabilityProfileDigest: profile.capabilityProfileDigest,
    extractionMode: modelProfile.extractionMode,
    structuredMode: modelProfile.structuredMode,
    timeoutMs: context.config.timeoutMs,
    sourceBundleDigest: context.bundle.sourceBundleDigest,
    sourceRecordSetDigest: logical.work.sourceRecordSetDigest,
    schemaVersion: "m2.v2.evidence-extraction-output.v0.2",
  };
}

function extractionContext(work) {
  return {
    sourceRecords: work.sourceRecords,
    work,
    privateTokens: [work.identityDigest].filter(Boolean),
    governancePolicy: V2B5_DEFAULT_SOURCE_GOVERNANCE_POLICY,
  };
}

function buildFrozenBundle(oldSearch, oldManifest, frozenAt) {
  if (!Array.isArray(oldSearch?.runs) || oldSearch.runs.length !== 4) throw new Error("v2b6_existing_benchmark_search_invalid");
  const repeatSlotIds = (oldManifest?.repeatSample ?? []).map((item) => item.canarySlotId);
  if (repeatSlotIds.length !== 2) throw new Error("v2b6_repeat_population_invalid");
  const works = oldSearch.runs.map((run) => {
    const records = run.sourceRecords;
    if (!Array.isArray(records) || records.length < 1 || records.length > 6) throw new Error("v2b6_source_bundle_record_count_invalid");
    for (const record of records) {
      const validation = validateV2B5SourceRecord(record);
      if (!validation.valid) throw new Error(`v2b6_source_bundle_record_invalid:${validation.issues.join(",")}`);
      if (classifyV2B5ProhibitedSource(record).prohibited) throw new Error("v2b6_source_bundle_prohibited_source");
    }
    const sourceSet = buildV2B5SourceRecordSet(records);
    if (sourceSet.sourceRecordSetDigest !== run.sourceRecordSetDigest) throw new Error("v2b6_source_bundle_digest_mismatch");
    return {
      canarySlotId: run.canarySlotId,
      workReference: run.workReference,
      identityDigest: run.identityDigest,
      title: manifestWork(oldManifest, run.canarySlotId).title,
      author: manifestWork(oldManifest, run.canarySlotId).author,
      sourceType: run.sourceType,
      highValue: run.highValue,
      sourceRecords: records,
      sourceRecordCount: records.length,
      sourceRecordSetDigest: sourceSet.sourceRecordSetDigest,
      sourceOrigin: "existing_contract_valid_tavily_result_only",
    };
  });
  const immutable = {
    schema: "m2.v2.benchmark-source-bundle-private.v0.2",
    privateOnly: true,
    workCount: 4,
    repeatWorkCount: 2,
    repeatSlotIds,
    works,
    sourceRecordCount: sum(works.map((item) => item.sourceRecordCount)),
    prohibitedSourceCount: 0,
    newTavilyPhysicalRequestCount: 0,
    immutable: true,
    searchReexecuted: false,
    canaryExecuted: false,
    full160Authorized: false,
  };
  return { ...immutable, frozenAt, sourceBundleDigest: sha256(immutable) };
}

function persistImmutableBundle(path, candidate) {
  if (!existsSync(path)) {
    atomicWriteJson(path, candidate);
    return candidate;
  }
  const existing = readJson(path);
  if (existing.sourceBundleDigest !== candidate.sourceBundleDigest) throw new Error("v2b6_source_bundle_immutable_mismatch");
  return existing;
}

function buildFailureForensic(receipts, sourceState, createdAt) {
  const rows = receipts.map((receipt, index) => ({
    receiptIndex: index + 1,
    requestedModelId: receipt.requestedModelId,
    attemptKind: receipt.attemptKind,
    category: classifyOldFailure(receipt),
    dispatched: receipt.dispatched === true,
    httpStatusObserved: Number.isInteger(receipt.httpStatus),
    timeoutBoundary25000: finite(receipt.latencyMs) && Math.abs(receipt.latencyMs - 25_000) <= 250 && !Number.isInteger(receipt.httpStatus),
    latencyEligibleForModelQuality: !(finite(receipt.latencyMs) && Math.abs(receipt.latencyMs - 25_000) <= 250 && !Number.isInteger(receipt.httpStatus)),
    responseContentTypeClass: receipt.responseContentTypeClass ?? "unreported",
    returnedModelObserved: Boolean(receipt.returnedModelId),
    modelBindingStatus: receipt.modelBindingVerified ? "exact" : receipt.returnedModelId ? "mismatch" : "unreported",
    normalizedIssueCodes: receipt.normalizedResponse?.issues ?? [],
    rawResponsePersisted: false,
  }));
  const categories = countMany(rows.map((item) => item.category));
  const skeletonRows = receipts.filter((item) => item.httpStatus || item.responseDigest).map((receipt) => ({
    requestedModelId: receipt.requestedModelId,
    status: receipt.status,
    httpStatus: receipt.httpStatus ?? null,
    responseContentTypeClass: receipt.responseContentTypeClass ?? "unreported",
    responseStatusObserved: Boolean(receipt.responseStatus),
    returnedModelObserved: Boolean(receipt.returnedModelId),
    usageObserved: finite(receipt.usage?.totalTokens),
    normalizedResponseObserved: Boolean(receipt.normalizedResponse),
    rawResponsePersisted: false,
  }));
  return {
    failureMatrix: {
      schema: "m2.v2.extraction-failure-matrix-private.v0.1",
      privateOnly: true,
      createdAt,
      oldAdapterVersion: "m2-v2-relay-extraction-adapter-v0.1",
      receiptCount: rows.length,
      categoryCounts: categories,
      timeoutBoundaryRule: "25000_plus_or_minus_250_ms_without_http_excluded_from_model_latency_and_schema_quality",
      rows,
      tavilyPhysicalRequestCountObserved: sourceState.tavily?.physicalRequestCount ?? null,
      relayPhysicalRequestCountObserved: sourceState.relay?.physicalRequestCount ?? null,
      rawResponsePersisted: false,
    },
    shapeSkeleton: {
      schema: "m2.v2.response-shape-skeleton-private.v0.1",
      privateOnly: true,
      createdAt,
      receiptCountWithHttpOrResponseDigest: skeletonRows.length,
      rows: skeletonRows,
      limitation: "legacy_v2b5_raw_response_not_persisted; only auditable receipt metadata is classified",
      rawResponsePersisted: false,
    },
  };
}

function classifyOldFailure(receipt) {
  if (receipt.status === "source_records_missing") return "input_or_bundle_missing";
  if (finite(receipt.latencyMs) && Math.abs(receipt.latencyMs - 25_000) <= 250 && !Number.isInteger(receipt.httpStatus)) return "timeout_at_25000ms";
  if (["transport_error", "prior_reservation_indeterminate"].includes(receipt.status)) return receipt.status;
  if (receipt.status === "http_error") return "http_error";
  const issues = receipt.normalizedResponse?.issues ?? [];
  if (issues.includes("strict_json_parse_failed")) return "response_shape_or_json_parse_failure";
  if (issues.some((item) => /id_invalid|keys_invalid|must_be_null|limitations_invalid|event_time_invalid/u.test(item))) return "strict_schema_validation_failure";
  if (issues.some((item) => /entity|claim|conflict/u.test(item))) return "entity_claim_semantic_failure";
  if (receipt.providerContractCompatible === true) return "contract_success";
  return "indeterminate_contract_failure";
}

function buildUsageLedger(context, profile, receipts) {
  const physical = context.receipts.filter((item) => item.phase !== "benchmark_effective" && item.dispatched === true);
  return {
    schema: "m2.v2.v2b6-usage-ledger-private.v0.1",
    privateOnly: true,
    adapterVersion: V2B6_ADAPTER_VERSION,
    sourceBundleDigest: context.bundle.sourceBundleDigest,
    syntheticPhysicalRequestCount: profile.syntheticPhysicalRequestCount,
    benchmarkPhysicalRequestCount: sum(receipts.map((item) => item.physicalRequestCount)),
    totalPhysicalRequestCount: context.state.physicalRelayRequestCount,
    relayRequestCap: V2B6_RELAY_REQUEST_CAP,
    inputTokens: nullableSum(physical.map((item) => item.usage?.inputTokens)),
    outputTokens: nullableSum(physical.map((item) => item.usage?.outputTokens)),
    totalTokens: nullableSum(physical.map((item) => item.usage?.totalTokens)),
    estimatedRelayCost: null,
    estimatedRelayCostStatus: "third_party_relay_price_not_proven",
    newTavilyPhysicalRequestCount: 0,
    canaryExecuted: false,
    full160Authorized: false,
  };
}

function buildPublicReports(r) {
  const modelPublic = Object.fromEntries(V2B6_MODELS.map((model) => {
    const row = r.evaluation?.models?.[model] ?? {};
    return [model, {
      extractionMode: row.extractionMode ?? r.profile?.models?.[model]?.extractionMode ?? null,
      structuredMode: row.structuredMode ?? r.profile?.models?.[model]?.structuredMode ?? null,
      bindingStatus: row.bindingStatus ?? null,
      logicalReceiptCount: row.logicalReceiptCount ?? 0,
      physicalRequestCount: row.physicalRequestCount ?? 0,
      schemaPassCount: row.schemaPassCount ?? 0,
      schemaPassRate: row.schemaPassRate ?? 0,
      noTimeoutRate: row.noTimeoutRate ?? 0,
      resolvedWorkCount: row.resolvedWorkCount ?? 0,
      acceptedClaimCount: row.acceptedClaimCount ?? 0,
      pilotUsableClaimCount: row.pilotUsableClaimCount ?? 0,
      rejectedClaimCount: row.rejectedClaimCount ?? 0,
      rejectionReasons: row.rejectionReasons ?? {},
      pilotUsableWorkCoverage: row.pilotUsableWorkCoverage ?? 0,
      sourceIdIntegrityRate: row.sourceIdIntegrityRate ?? 0,
      capturedAtCompleteness: row.capturedAtCompleteness ?? 0,
      availableAtCompleteness: row.availableAtCompleteness ?? 0,
      eventTimeCompleteness: row.eventTimeCompleteness ?? 0,
      repeatSchemaPassCount: row.repeatSchemaPassCount ?? 0,
      repeatClaimAgreement: row.repeatClaimAgreement ?? null,
      p50QualityLatencyMs: row.p50QualityLatencyMs ?? null,
      p90QualityLatencyMs: row.p90QualityLatencyMs ?? null,
      totalQualityTokens: row.totalQualityTokens ?? null,
      safetyGate: row.safetyGate ?? null,
      qualityGate: row.qualityGate ?? null,
    }];
  }));
  const common = { status: "not_for_formal_decision", canaryExecuted: false, full160Authorized: false };
  return {
    forensic: {
      schema: "m2.v2.extraction-failure-forensic-public.v0.1", ...common,
      legacyReceiptCount: r.forensic.failureMatrix.receiptCount,
      categoryCounts: r.forensic.failureMatrix.categoryCounts,
      timeoutBoundaryRule: r.forensic.failureMatrix.timeoutBoundaryRule,
      rawResponsePersisted: false,
      conclusion: "legacy_25s_timeout_and_contract_shape_failures_are_separated_from_model_quality",
    },
    capability: {
      schema: "m2.v2.relay-extraction-capability-matrix-public.v0.1", ...common,
      adapterVersion: V2B6_ADAPTER_VERSION,
      timeoutMs: r.profile?.timeoutMs ?? V2B6_DEFAULT_TIMEOUT_MS,
      syntheticPhysicalRequestCount: r.profile?.syntheticPhysicalRequestCount ?? 0,
      models: Object.fromEntries(V2B6_MODELS.map((model) => [model, {
        extractionMode: r.profile?.models?.[model]?.extractionMode ?? null,
        structuredMode: r.profile?.models?.[model]?.structuredMode ?? null,
        modelBindingStatuses: r.profile?.models?.[model]?.modelBindingStatuses ?? [],
        tests: (r.profile?.models?.[model]?.tests ?? []).map((item) => ({ testId: item.testId, probe: item.probe, structuredMode: item.structuredMode, httpStatus: item.httpStatus, timedOut: item.timedOut, passed: item.passed, carrier: item.carrier, modelBindingStatus: item.modelBindingStatus })),
      } ])),
      tavilyRequestUsed: false,
    },
    bundle: {
      schema: "m2.v2.benchmark-source-bundle-audit-public.v0.1", ...common,
      sourceBundleDigest: r.bundle.sourceBundleDigest,
      workCount: r.bundle.workCount,
      repeatWorkCount: r.bundle.repeatWorkCount,
      sourceRecordCount: r.bundle.sourceRecordCount,
      perWorkSourceRecordCounts: r.bundle.works.map((item) => item.sourceRecordCount),
      prohibitedSourceCount: r.bundle.prohibitedSourceCount,
      newTavilyPhysicalRequestCount: 0,
      searchReexecuted: false,
      immutable: true,
    },
    benchmark: {
      schema: "m2.v2.luna-terra-extraction-benchmark-public-report.v0.2", ...common,
      sourceBundleDigest: r.bundle.sourceBundleDigest,
      sameSourceBundleVerified: r.evaluation?.sameSourceBundleVerified ?? false,
      logicalDenominatorPerModel: 6,
      models: modelPublic,
      benchmarkDecision: r.evaluation?.benchmarkDecision ?? "NOT_EXECUTED",
      defaultExtractionModel: r.evaluation?.defaultExtractionModel ?? null,
      escalationModel: r.evaluation?.escalationModel ?? null,
      selectionReasons: r.evaluation?.selectionReasons ?? [],
      newTavilyPhysicalRequestCount: 0,
    },
    decision: {
      schema: "m2.v2.v2b6-terminal-decision-public.v0.1", ...common,
      benchmarkDecision: r.evaluation?.benchmarkDecision ?? "NOT_EXECUTED",
      defaultExtractionModel: r.evaluation?.defaultExtractionModel ?? null,
      escalationModel: r.evaluation?.escalationModel ?? null,
      nextStep: "CANARY_V3_RETRY_REQUIRES_SEPARATE_AUTHORIZATION",
      canaryAuthorized: false,
      modelTrainingPerformed: false,
      b4Changed: false,
      formalCashChanged: false,
      finalHoldoutOpened: false,
      sealsChanged: false,
      v2cEntered: false,
      v2dEntered: false,
      c4Entered: false,
      m3Entered: false,
      releasePerformed: false,
    },
    adapter: {
      schema: "m2.v2.relay-extraction-adapter-design.v0.2", ...common,
      adapterVersion: V2B6_ADAPTER_VERSION,
      timeoutEnvironmentVariable: "M2_V2_RELAY_EXTRACTION_TIMEOUT_MS",
      timeoutDefaultMs: 120000,
      timeoutRangeMs: [30000, 180000],
      reasoningDefault: "omitted",
      supportedCarriers: ["output_parsed", "output_text", "output_content_text", "choices_message_content", "nested_response_root", "single_fenced_json_with_whitespace_only_outside"],
      structuredModes: ["server_strict", "local_json"],
      extractionModes: ["full", "split"],
      bindingStatuses: ["exact", "approved_alias", "unreported", "mismatch"],
      repairLimitPerStage: 1,
      searchToolsAllowed: false,
      rawResponsePersisted: false,
    },
    receipt: {
      schema: "m2.v2.extraction-effective-receipt-contract-public.v0.1", ...common,
      logicalDenominator: { primaryPerModel: 4, repeatPerModel: 2, totalPerModel: 6 },
      selectionPrecedence: ["successful_repair", "successful_primary", "latest_explicit_failure", "indeterminate", "missing"],
      cacheKeyFields: ["adapterVersion", "capabilityProfileDigest", "extractionMode", "structuredMode", "timeoutMs", "sourceBundleDigest", "model", "phase", "runKind", "attemptKind", "schemaVersion"],
      timeoutQualityRule: "timeout_attempts_are_not_included_in_model_quality_latency_or_schema_denominators_except_explicit_no-timeout_gate",
      cumulativeLegacyAttemptPollutionAllowed: false,
      rawResponsePersisted: false,
    },
  };
}

function renderMarkdown(key, report) {
  const title = {
    forensic: "M2 v2 V2-B.6 Extraction Failure Forensic v0.1",
    capability: "M2 v2 Relay Extraction Capability Matrix v0.1",
    bundle: "M2 v2 Benchmark Source Bundle Audit v0.1",
    benchmark: "M2 v2 Luna/Terra Extraction Benchmark v0.2",
    decision: "M2 v2 V2-B.6 Terminal Decision v0.1",
    adapter: "M2 v2 Relay Extraction Adapter v0.2",
    receipt: "M2 v2 Extraction Effective Receipt Contract v0.1",
  }[key];
  return `# ${title}\n\nStatus: \`${report.status}\`\n\nThis artifact is a sanitized, prospective pilot checkpoint. It contains no work title, author, query, URL, snippet, raw response body, private identifier, or credential.\n\n\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\`\n`;
}

function loadConfig(root, suppliedEnv) {
  const env = { ...readEnvFile(join(root, ".env.local")), ...process.env, ...(suppliedEnv ?? {}) };
  const baseUrl = String(env.OPENAI_BASE_URL ?? "").trim().replace(/\/+$/u, "");
  const apiKey = String(env.OPENAI_API_KEY ?? "").trim();
  if (!baseUrl || !apiKey) throw new Error("v2b6_relay_configuration_incomplete");
  const approvedAliases = {};
  const oldPath = join(root, V2B6_SOURCE_RELATIVE, "relay-extraction-receipts-private-v0.1.ndjson");
  for (const receipt of readNdjson(oldPath)) {
    if (!receipt.requestedModelId || !receipt.returnedModelId || receipt.modelBindingVerified !== true) continue;
    const rows = approvedAliases[receipt.requestedModelId] ?? [];
    if (receipt.returnedModelId !== receipt.requestedModelId) rows.push(receipt.returnedModelId);
    approvedAliases[receipt.requestedModelId] = unique(rows);
  }
  return {
    baseUrl,
    apiKey,
    timeoutMs: resolveV2B6TimeoutMs(env.M2_V2_RELAY_EXTRACTION_TIMEOUT_MS),
    relayBindingDigest: sha256({ baseUrl, apiKeyDigest: sha256(apiKey) }),
    approvedAliases,
  };
}

function publicConfig(config) {
  return { timeoutMs: config.timeoutMs, relayConfigured: Boolean(config.baseUrl && config.apiKey), relayBindingDigest: config.relayBindingDigest, approvedAliasCount: sum(Object.values(config.approvedAliases).map((item) => item.length)) };
}

function newState(sourceState, bundle, config) {
  return {
    schema: "m2.v2.v2b6-execution-state.v0.1",
    privateOnly: true,
    createdAt: new Date().toISOString(),
    sourceBundleDigest: bundle.sourceBundleDigest,
    relayBindingDigest: config.relayBindingDigest,
    timeoutMs: config.timeoutMs,
    relayRequestCap: V2B6_RELAY_REQUEST_CAP,
    physicalRelayRequestCount: 0,
    reservations: {},
    tavilyPhysicalRequestCountBefore: sourceState.tavily?.physicalRequestCount ?? null,
    tavilyPhysicalRequestCountAfter: sourceState.tavily?.physicalRequestCount ?? null,
    newTavilyPhysicalRequestCount: 0,
    canaryExecuted: false,
    full160Authorized: false,
  };
}

function assertState(state, sourceState, bundle, config) {
  if (state.sourceBundleDigest !== bundle.sourceBundleDigest) throw new Error("v2b6_state_bundle_mismatch");
  if (state.relayBindingDigest !== config.relayBindingDigest) throw new Error("v2b6_state_relay_binding_mismatch");
  if (state.timeoutMs !== config.timeoutMs) throw new Error("v2b6_state_timeout_mismatch");
  const currentTavily = sourceState.tavily?.physicalRequestCount ?? null;
  if (state.tavilyPhysicalRequestCountBefore !== currentTavily) throw new Error("v2b6_tavily_count_changed");
  state.tavilyPhysicalRequestCountAfter = currentTavily;
  if (state.canaryExecuted !== false || state.full160Authorized !== false) throw new Error("v2b6_forbidden_execution_state");
}

function reconcileInProgress(context) {
  for (const reservation of Object.values(context.state.reservations)) {
    if (reservation.status === "in_progress") reservation.status = "indeterminate_after_crash";
  }
  checkpoint(context);
}

function checkpoint(context) {
  atomicWriteJson(context.statePath, context.state);
  atomicWriteJson(context.cachePath, context.cache);
  writeNdjson(join(context.privateStore, FILES.receipts), context.receipts);
}

function manifestWork(manifest, slot) {
  const work = manifest?.sample?.find((item) => item.canarySlotId === slot);
  if (!work?.title || !work?.author) throw new Error("v2b6_manifest_work_missing");
  return work;
}

function unresolvedEntities() {
  return {
    work: { status: "unresolved", confidence: 0, supportingSourceIds: [] },
    author: { status: "unresolved", confidence: 0, supportingSourceIds: [] },
  };
}

function sumUsage(rows) {
  return {
    inputTokens: nullableSum(rows.map((item) => item?.inputTokens)),
    outputTokens: nullableSum(rows.map((item) => item?.outputTokens)),
    totalTokens: nullableSum(rows.map((item) => item?.totalTokens)),
  };
}

function gate(id, actual, threshold, predicate) {
  return { id, actual, threshold, passed: predicate(actual, threshold) };
}

function gateGroup(items) {
  return { items, passedCount: items.filter((item) => item.passed).length, totalCount: items.length, allPassed: items.every((item) => item.passed) };
}

function ratio(numerator, denominator) {
  return denominator ? numerator / denominator : 0;
}

function average(values) {
  const rows = values.filter(finite);
  return rows.length ? sum(rows) / rows.length : null;
}

function percentile(values, p) {
  const rows = values.filter(finite).sort((a, b) => a - b);
  if (!rows.length) return null;
  return rows[Math.min(rows.length - 1, Math.floor(p * rows.length))];
}

function nullableSum(values) {
  const rows = values.filter(finite);
  return rows.length === values.length && rows.length ? sum(rows) : null;
}

function sum(values) {
  return values.filter(finite).reduce((total, value) => total + value, 0);
}

function countMany(values) {
  return values.reduce((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function finite(value) {
  return Number.isFinite(value);
}

function isIsoTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function unique(values) {
  return [...new Set(values)];
}

function readEnvFile(path) {
  if (!existsSync(path)) return {};
  const values = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/u)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/u);
    if (!match || match[1].startsWith("#")) continue;
    values[match[1]] = match[2].replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/u, "$1$2");
  }
  return values;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readNdjson(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split(/\r?\n/u).filter((line) => line.trim()).map((line) => JSON.parse(line));
}

function writeNdjson(path, rows) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, rows.length ? `${rows.map((row) => JSON.stringify(row)).join("\n")}\n` : "", "utf8");
}

function atomicWriteJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporary, path);
}

function isPublicSafe(content, bundle) {
  const privateTokens = bundle.works.flatMap((work) => [work.title, work.author, work.workReference, work.identityDigest])
    .filter((item) => typeof item === "string" && item.length >= 4);
  if (privateTokens.some((token) => content.includes(token))) return false;
  return !/(?:https?:\/\/|"url"\s*:|"snippet"\s*:|OPENAI_API_KEY|sk-[A-Za-z0-9])/iu.test(content);
}
