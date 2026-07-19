import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { performance } from "node:perf_hooks";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  V2B2_ADAPTER_VERSION,
  V2B2_PROMPT_VERSION,
  V2B2_SCHEMA_VERSION,
  buildV2B2ExtractionPayload,
  buildV2B2PhysicalRequestKey,
  buildV2B2SearchPayload,
  classifyLegacyCanaryReceipts,
  joinV2B2CitationLineage,
  normalizeV2B2ExtractionResponse,
  normalizeV2B2SearchResponse,
  profileV2B2ResponseShape,
  validateV2B2StructuredOutput,
} from "./relayV2B2Core.js";
import { buildCanaryTasks } from "./canaryCore.js";
import {
  EXPECTED_PARENT_MANIFEST_DIGEST,
  assertCanaryManifest,
} from "./canaryRuntime.js";
import {
  assertPublicSanitized,
  canonicalJson,
  normalizeEntityText,
  sha256,
} from "./pilotCore.js";
import {
  assertNoProviderRedirect,
  assertResponsesRetention,
  bindProviderTransport,
} from "./providerTransportSecurity.js";
import { rejectRetiredProviderRoute } from "./providerDispatchCapability.js";

export const V2B2_PRIVATE_RELATIVE = "data/private-output/m2-v2-evidence-pilot/v2-b2-relay-remediation";
export const V2B2_PARENT_MANIFEST_RELATIVE = "data/private-output/m2-v2-evidence-pilot/pilot-manifest-private-v0.1.json";
export const V2B2_CANARY_V01_MANIFEST_RELATIVE = "data/private-output/m2-v2-evidence-pilot/canary-v0.1/canary-manifest-private-v0.1.json";
export const V2B2_LEGACY_RECEIPTS_RELATIVE = "data/private-output/m2-v2-evidence-pilot/canary-v0.1/canary-provider-receipts-private-v0.1.ndjson";
export const V2B2_SOURCE_ALLOWLIST_RELATIVE = "docs/technical-design/m2-v2/M2-v2-source-allowlist-v0.1.json";

export const V2B2_MODELS = Object.freeze(["gpt-5.6-luna", "gpt-5.6-terra"]);
export const V2B2_BENCHMARK_LOGICAL_TASK_COUNT = 10;
export const V2B2_BENCHMARK_MODEL_ARM_COUNT = 20;
export const V2B2_BENCHMARK_PHYSICAL_REQUEST_CAP = 40;
export const V2B2_CANARY_LOGICAL_TASK_COUNT = 60;
export const V2B2_CANARY_PHYSICAL_REQUEST_CAP = 120;
export const V2B2_MAX_RETRIES = 0;

const SEARCH_TIMEOUT_MS = 45_000;
const EXTRACTION_TIMEOUT_MS = 25_000;
const SEARCH_MAX_OUTPUT_TOKENS = 700;
const EXTRACTION_MAX_OUTPUT_TOKENS = 1_200;
const MODEL_CONTRACT_RATE_MINIMUM = 0.8;
const RESPONSE_LIMIT_BYTES = 2 * 1024 * 1024;
const BENCHMARK_QUALITY_SCOPE = "pre_governance_local_citation_span_and_exact_entity_support_not_independent_source_truth";
const EXPECTED_LEGACY_CLASSIFICATION_COUNTS = Object.freeze({
  local_strict_success: 12,
  relay_success_local_schema_failure: 37,
  provider_or_request_failure: 11,
});

export const V2B2_BOUNDARIES = Object.freeze({
  fullPilotAuthorized: false,
  full160ExecutionAuthorizedByThisRun: false,
  full160Executed: false,
  v2CStarted: false,
  v2DStarted: false,
  incomeModelTrainingPerformed: false,
  b4Changed: false,
  finalHoldoutOpened: false,
  c4Started: false,
  m3Started: false,
  released: false,
  pullRequest7MustRemainDraftOpen: true,
});

export const V2B2_PRIVATE_FILES = Object.freeze({
  responseShapeMatrix: "relay-response-shape-matrix-private-v0.1.json",
  benchmarkManifest: "terra-luna-benchmark-manifest-private-v0.1.json",
  benchmarkCache: "terra-luna-benchmark-cache-private-v0.1.json",
  benchmarkState: "terra-luna-benchmark-state-private-v0.1.json",
  benchmarkReceipts: "terra-luna-benchmark-receipts-private-v0.1.ndjson",
  benchmarkEvaluation: "terra-luna-benchmark-evaluation-private-v0.1.json",
  modelDecision: "terra-luna-model-decision-private-v0.1.json",
  canaryManifest: "canary-v0.2-execution-manifest-private-v0.1.json",
  canaryCache: "canary-v0.2-cache-private-v0.1.json",
  canaryState: "canary-v0.2-state-private-v0.1.json",
  canaryReceipts: "canary-v0.2-receipts-private-v0.1.ndjson",
  canaryEvaluation: "canary-v0.2-evaluation-private-v0.1.json",
  verification: "v2-b2-verification-private-v0.1.json",
});

export const V2B2_PUBLIC_REPORTS = Object.freeze({
  remediationJson: "docs/analysis/m2-v2/M2-v2-v2b2-relay-remediation-summary-v0.1.json",
  remediationMarkdown: "docs/analysis/m2-v2/M2-v2-v2b2-relay-remediation-summary-v0.1.md",
  benchmarkJson: "docs/analysis/m2-v2/M2-v2-v2b2-terra-luna-benchmark-v0.1.json",
  benchmarkMarkdown: "docs/analysis/m2-v2/M2-v2-v2b2-terra-luna-benchmark-v0.1.md",
  routingJson: "docs/analysis/m2-v2/M2-v2-v2b2-model-routing-decision-v0.1.json",
  routingMarkdown: "docs/analysis/m2-v2/M2-v2-v2b2-model-routing-decision-v0.1.md",
  canaryJson: "docs/analysis/m2-v2/M2-v2-v2b2-canary-rerun-v0.2.json",
  canaryMarkdown: "docs/analysis/m2-v2/M2-v2-v2b2-canary-rerun-v0.2.md",
  terminalJson: "docs/analysis/m2-v2/M2-v2-v2b2-terminal-decision-v0.1.json",
  terminalMarkdown: "docs/analysis/m2-v2/M2-v2-v2b2-terminal-decision-v0.1.md",
});

const LEGACY_NOT_RECONSTRUCTABLE = Object.freeze([
  "output_item_types",
  "content_item_types",
  "output_text_paths",
  "tool_invocation_paths",
  "annotation_paths",
  "annotation_original_shapes",
  "strict_json_paths",
  "provider_usage_original_path",
  "provider_error_envelope",
  "returned_model_id",
  "finish_and_status_paths",
]);

const COMBINED_INTENT = [
  "verify_work_and_author_identity",
  "find_publication_or_original_platform_evidence",
  "find_public_adaptation_or_award_events",
  "find_public_ranking_or_market_signals",
].join(";");

export function auditLegacyV2B2Receipts(root, options = {}) {
  const absoluteRoot = resolve(root);
  const privateStore = ensurePrivateStore(absoluteRoot, options);
  const sourcePath = join(absoluteRoot, options.receiptsRelative ?? V2B2_LEGACY_RECEIPTS_RELATIVE);
  const receipts = readNdjson(sourcePath);
  if (receipts.length !== 60) throw new Error("v2b2_legacy_receipt_count_must_equal_60");

  const classified = normalizeLegacyClassification(classifyLegacyCanaryReceipts(receipts), receipts);
  const rows = receipts.map((receipt, index) => {
    const category = classified.byIndex[index] ?? classifyLegacyFallback(receipt);
    const citations = Array.isArray(receipt?.citations) ? receipt.citations : [];
    return {
      ordinal: index + 1,
      sourceReceiptDigest: safeDigest(receipt?.receiptDigest),
      classification: category,
      runKind: safeEnum(receipt?.runKind, ["primary", "repeat"], "unknown"),
      responseObjectType: receipt?.httpStatus === null || receipt?.httpStatus === undefined
        ? "not_observed"
        : receipt?.semanticChecks?.responsesShapeValid === true
          ? "json_object"
          : "not_reconstructable",
      responseContentTypeClass: contentTypeClass(receipt?.responseContentType),
      outputArrayObserved: receipt?.semanticChecks?.responsesShapeValid === true,
      webSearchObserved: receipt?.semanticChecks?.webSearchObserved === true,
      outputTextDigestPresent: safeDigest(receipt?.outputTextDigest) !== null,
      usageObserved: finiteNonnegative(receipt?.usage?.totalTokens) !== null,
      citationCount: citations.length,
      citationFieldPresence: {
        url: citations.filter((item) => typeof item?.url === "string" && item.url.length > 0).length,
        title: citations.filter((item) => typeof item?.title === "string" && item.title.length > 0).length,
        startIndex: citations.filter((item) => Number.isInteger(item?.startIndex)).length,
        endIndex: citations.filter((item) => Number.isInteger(item?.endIndex)).length,
      },
      requestedModelId: safeModelId(receipt?.model),
      returnedModelId: "not_reconstructable",
      rawResponsePersisted: receipt?.rawResponsePersisted === true,
      htmlOrNonJson: receipt?.httpStatus == null
        ? "not_observed"
        : receipt?.semanticChecks?.responsesShapeValid === true
          ? false
          : "not_reconstructable",
      notReconstructable: [...LEGACY_NOT_RECONSTRUCTABLE],
    };
  });

  const matrixPayload = {
    schema: "m2.v2.v2b2.legacy-response-shape-matrix.v0.1",
    privateOnly: true,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    sourceReceiptCount: receipts.length,
    sourceReceiptFileDigest: sha256(readFileSync(sourcePath)),
    rawResponseAvailableCount: rows.filter((item) => item.rawResponsePersisted).length,
    legacyRawShapeUnobservable: rows.every((item) => item.rawResponsePersisted === false),
    classificationCounts: countBy(rows, (item) => item.classification),
    runKindCounts: countBy(rows, (item) => item.runKind),
    annotationResponseCount: rows.filter((item) => item.citationCount > 0).length,
    annotationCount: sum(rows.map((item) => item.citationCount)),
    citationFieldPresence: {
      url: sum(rows.map((item) => item.citationFieldPresence.url)),
      title: sum(rows.map((item) => item.citationFieldPresence.title)),
      startIndex: sum(rows.map((item) => item.citationFieldPresence.startIndex)),
      endIndex: sum(rows.map((item) => item.citationFieldPresence.endIndex)),
    },
    requestedModelCounts: countBy(rows, (item) => item.requestedModelId ?? "unavailable"),
    returnedModelIdentityVerifiable: false,
    notReconstructableFields: [...LEGACY_NOT_RECONSTRUCTABLE],
    rows,
  };
  const matrix = withDigest(matrixPayload, "matrixDigest");
  atomicWriteJson(join(privateStore, V2B2_PRIVATE_FILES.responseShapeMatrix), matrix);
  return {
    matrix,
    aggregate: {
      receiptCount: receipts.length,
      classificationCounts: matrix.classificationCounts,
      annotationResponseCount: matrix.annotationResponseCount,
      annotationCount: matrix.annotationCount,
      rawResponseAvailableCount: matrix.rawResponseAvailableCount,
      legacyRawShapeUnobservable: matrix.legacyRawShapeUnobservable,
      returnedModelIdentityVerifiable: false,
    },
  };
}

export function checkAndFreezeV2B2(root, options = {}) {
  const absoluteRoot = resolve(root);
  const privateStore = ensurePrivateStore(absoluteRoot, options);
  const binding = loadFrozenBinding(absoluteRoot, options);
  const relayBindingDigest = options.relayBindingDigest ?? loadRelayConfiguration(absoluteRoot, options.env).bindingDigest;
  const benchmark = freezeBenchmarkManifest(privateStore, binding, { ...options, relayBindingDigest });
  return {
    parentManifestDigest: binding.parent.manifestDigest,
    canaryManifestDigest: binding.canary.canaryManifestDigest,
    benchmarkManifest: benchmark.manifest,
    benchmarkManifestCreated: benchmark.created,
    sampleCount: benchmark.manifest.sampleCount,
    logicalTaskCount: benchmark.manifest.logicalTaskCount,
    plannedPhysicalRequestCount: benchmark.manifest.plannedPhysicalRequestCount,
    fullPilotAuthorized: false,
  };
}

export function deriveV2B2BenchmarkManifest(parent, canary, options = {}) {
  assertFrozenBinding(parent, canary, options);
  const createdAt = options.createdAt ?? new Date().toISOString();
  const relayBindingDigest = options.relayBindingDigest ?? sha256({
    providerId: "injected_test_relay",
    endpointPath: "/responses",
    models: V2B2_MODELS,
    adapterVersion: V2B2_ADAPTER_VERSION,
  });
  const logicalTasks = canary.sample.map((work, workIndex) => ({
    logicalTaskKey: sha256([
      canary.canaryManifestDigest,
      work.identityDigest,
      "v2b2_combined_intent",
      V2B2_PROMPT_VERSION,
      V2B2_SCHEMA_VERSION,
    ]),
    workOrdinal: workIndex + 1,
    workReference: work.standardWorkId,
    identityDigest: work.identityDigest,
    title: work.title,
    author: work.author,
    sourceType: work.sourceType,
    combinedIntent: COMBINED_INTENT,
  }));
  const balancedTaskOrder = [...logicalTasks]
    .sort((left, right) => sha256([canary.canaryManifestDigest, left.logicalTaskKey, "balanced_arm_order"])
      .localeCompare(sha256([canary.canaryManifestDigest, right.logicalTaskKey, "balanced_arm_order"])));
  const firstModelByTask = new Map(balancedTaskOrder.map((task, index) => [
    task.logicalTaskKey,
    V2B2_MODELS[index % V2B2_MODELS.length],
  ]));
  const arms = logicalTasks.flatMap((task) => {
    const firstModel = firstModelByTask.get(task.logicalTaskKey);
    const orderedModels = [firstModel, ...V2B2_MODELS.filter((model) => model !== firstModel)];
    return orderedModels.map((model, modelOrder) => ({
      logicalTaskKey: task.logicalTaskKey,
      workReference: task.workReference,
      identityDigest: task.identityDigest,
      model,
      modelOrder: modelOrder + 1,
      searchRequestKey: physicalRequestKey({
        parentManifestDigest: parent.manifestDigest,
        canaryManifestDigest: canary.canaryManifestDigest,
        logicalTaskKey: task.logicalTaskKey,
        model,
        stage: "search",
        relayBindingDigest,
      }),
      extractionRequestKey: physicalRequestKey({
        parentManifestDigest: parent.manifestDigest,
        canaryManifestDigest: canary.canaryManifestDigest,
        logicalTaskKey: task.logicalTaskKey,
        model,
        stage: "extraction",
        relayBindingDigest,
      }),
    }));
  });
  const payload = {
    schema: "m2.v2.v2b2.terra-luna-benchmark-manifest.v0.1",
    privateOnly: true,
    immutable: true,
    status: "frozen_before_benchmark",
    createdAt,
    derivedWithoutResampling: true,
    parentManifestDigest: parent.manifestDigest,
    parentManifestSeed: parent.seed,
    parentSampleCount: parent.sample.length,
    canaryManifestDigest: canary.canaryManifestDigest,
    canarySeed: canary.seed,
    originalCanarySampleCount: canary.sample.length,
    sampleCount: canary.sample.length,
    sampleIdentityDigest: sha256(canary.sample.map((item) => item.identityDigest)),
    sample: canary.sample.map((item) => ({ ...item })),
    modelIds: [...V2B2_MODELS],
    relayBindingDigest,
    adapterVersion: V2B2_ADAPTER_VERSION,
    promptVersion: V2B2_PROMPT_VERSION,
    schemaVersion: V2B2_SCHEMA_VERSION,
    taskPlanVersion: "m2-v2-v2b2-one-combined-intent-per-work-v0.1",
    logicalTaskCount: logicalTasks.length,
    modelArmCount: arms.length,
    workIntentCount: logicalTasks.length,
    plannedPhysicalRequestCount: arms.length * 2,
    physicalRequestCap: V2B2_BENCHMARK_PHYSICAL_REQUEST_CAP,
    stages: ["search", "extraction"],
    retryPolicy: { maxRetries: V2B2_MAX_RETRIES, retryableContractFailures: false },
    requestPolicy: {
      searchTimeoutMs: SEARCH_TIMEOUT_MS,
      extractionTimeoutMs: EXTRACTION_TIMEOUT_MS,
      searchMaxOutputTokens: SEARCH_MAX_OUTPUT_TOKENS,
      extractionMaxOutputTokens: EXTRACTION_MAX_OUTPUT_TOKENS,
    },
    fairness: {
      sameWorks: true,
      sameLogicalTasks: true,
      samePromptSchemaTokenTimeoutAndRetry: true,
      deterministicHashInterleaving: true,
      independentModelAndStageCache: true,
      failuresRemainInDenominator: true,
      failedSamplesMayBeReplaced: false,
    },
    logicalTasks,
    arms,
    fullPilotAuthorized: false,
  };
  if (
    payload.workIntentCount !== V2B2_BENCHMARK_LOGICAL_TASK_COUNT
    || payload.logicalTaskCount !== V2B2_BENCHMARK_LOGICAL_TASK_COUNT
    || payload.modelArmCount !== V2B2_BENCHMARK_MODEL_ARM_COUNT
  ) {
    throw new Error("v2b2_benchmark_logical_task_count_invalid");
  }
  if (payload.plannedPhysicalRequestCount !== V2B2_BENCHMARK_PHYSICAL_REQUEST_CAP) {
    throw new Error("v2b2_benchmark_physical_request_count_invalid");
  }
  const manifest = withDigest(payload, "benchmarkManifestDigest");
  assertV2B2BenchmarkManifest(manifest, parent, canary, options);
  return manifest;
}

export function assertV2B2BenchmarkManifest(manifest, parent, canary, options = {}) {
  assertFrozenBinding(parent, canary, options);
  if (manifest?.schema !== "m2.v2.v2b2.terra-luna-benchmark-manifest.v0.1") throw new Error("v2b2_benchmark_manifest_schema_invalid");
  if (manifest?.privateOnly !== true || manifest?.immutable !== true || manifest?.derivedWithoutResampling !== true) {
    throw new Error("v2b2_benchmark_manifest_not_immutable");
  }
  if (manifest.parentManifestDigest !== parent.manifestDigest || manifest.canaryManifestDigest !== canary.canaryManifestDigest) {
    throw new Error("v2b2_benchmark_manifest_binding_mismatch");
  }
  if (
    manifest.sampleCount !== 10
    || manifest.workIntentCount !== 10
    || manifest.logicalTaskCount !== 10
    || manifest.modelArmCount !== 20
  ) {
    throw new Error("v2b2_benchmark_manifest_count_invalid");
  }
  if (manifest.plannedPhysicalRequestCount !== 40 || manifest.physicalRequestCap !== 40 || manifest.retryPolicy?.maxRetries !== 0) {
    throw new Error("v2b2_benchmark_budget_invalid");
  }
  if (canonicalJson(manifest.sample) !== canonicalJson(canary.sample)) throw new Error("v2b2_benchmark_sample_changed");
  if (manifest.sampleIdentityDigest !== sha256(canary.sample.map((item) => item.identityDigest))) {
    throw new Error("v2b2_benchmark_sample_digest_invalid");
  }
  if (canonicalJson(manifest.modelIds) !== canonicalJson(V2B2_MODELS)) throw new Error("v2b2_benchmark_models_invalid");
  if (!/^[a-f0-9]{64}$/u.test(manifest.relayBindingDigest)) throw new Error("v2b2_relay_binding_digest_invalid");
  if (options.relayBindingDigest && manifest.relayBindingDigest !== options.relayBindingDigest) {
    throw new Error("v2b2_relay_binding_changed");
  }
  const keys = manifest.arms.flatMap((item) => [item.searchRequestKey, item.extractionRequestKey]);
  if (keys.length !== 40 || new Set(keys).size !== 40) throw new Error("v2b2_benchmark_physical_keys_not_isolated");
  for (const arm of manifest.arms) {
    if (!V2B2_MODELS.includes(arm.model)) throw new Error("v2b2_benchmark_arm_model_invalid");
    if (arm.searchRequestKey === arm.extractionRequestKey) throw new Error("v2b2_benchmark_stage_cache_collision");
  }
  for (const model of V2B2_MODELS) {
    if (manifest.arms.filter((item) => item.model === model && item.modelOrder === 1).length !== 5) {
      throw new Error("v2b2_benchmark_arm_order_not_balanced");
    }
  }
  assertDigest(manifest, "benchmarkManifestDigest", "v2b2_benchmark_manifest_digest_invalid");
  if (manifest.fullPilotAuthorized !== false) throw new Error("v2b2_full_pilot_must_remain_unauthorized");
  return true;
}

export function buildV2B2BenchmarkPhysicalPlan(manifest) {
  const taskByKey = new Map(manifest.logicalTasks.map((item) => [item.logicalTaskKey, item]));
  const plan = [];
  for (const arm of manifest.arms) {
    const task = taskByKey.get(arm.logicalTaskKey);
    if (!task) throw new Error("v2b2_benchmark_arm_task_missing");
    for (const [stage, requestKey] of [["search", arm.searchRequestKey], ["extraction", arm.extractionRequestKey]]) {
      plan.push({
        requestKey,
        stage,
        model: arm.model,
        modelOrder: arm.modelOrder,
        logicalTaskKey: arm.logicalTaskKey,
        workReference: task.workReference,
        identityDigest: task.identityDigest,
        title: task.title,
        author: task.author,
        sourceType: task.sourceType,
        queryText: task.combinedIntent,
        queryId: `v2b2_combined_${task.workOrdinal}`,
        runKind: "benchmark",
      });
    }
  }
  plan.sort((left, right) => {
    const leftTask = taskByKey.get(left.logicalTaskKey);
    const rightTask = taskByKey.get(right.logicalTaskKey);
    const workOrder = leftTask.workOrdinal - rightTask.workOrdinal;
    if (workOrder) return workOrder;
    const modelOrder = left.modelOrder - right.modelOrder;
    if (modelOrder) return modelOrder;
    return stageRank(left.stage) - stageRank(right.stage);
  });
  assertPhysicalPlan(plan, {
    physicalRequestCap: V2B2_BENCHMARK_PHYSICAL_REQUEST_CAP,
    expectedCount: V2B2_BENCHMARK_PHYSICAL_REQUEST_CAP,
    models: V2B2_MODELS,
  });
  return plan;
}

export async function runV2B2Benchmark(root, options = {}) {
  const absoluteRoot = resolve(root);
  const checked = checkAndFreezeV2B2(absoluteRoot, options);
  const manifest = checked.benchmarkManifest;
  const runtimeBindingDigest = options.runtimeBindingDigest
    ?? (options.stageExecutor ? manifest.relayBindingDigest : loadRelayConfiguration(absoluteRoot, options.env).bindingDigest);
  if (runtimeBindingDigest !== manifest.relayBindingDigest) throw new Error("v2b2_relay_binding_changed_after_freeze");
  const privateStore = ensurePrivateStore(absoluteRoot, options);
  const plan = buildV2B2BenchmarkPhysicalPlan(manifest);
  const execution = await executeV2B2PhysicalPlan({
    root: absoluteRoot,
    namespace: "benchmark",
    manifestDigest: manifest.benchmarkManifestDigest,
    plan,
    physicalRequestCap: V2B2_BENCHMARK_PHYSICAL_REQUEST_CAP,
    cachePath: join(privateStore, V2B2_PRIVATE_FILES.benchmarkCache),
    statePath: join(privateStore, V2B2_PRIVATE_FILES.benchmarkState),
    receiptsPath: join(privateStore, V2B2_PRIVATE_FILES.benchmarkReceipts),
    stageExecutor: options.stageExecutor,
    fetchImpl: options.fetchImpl,
    env: options.env,
    resume: options.resume === true,
    now: options.now,
    runtimeBindingDigest,
  });
  const evaluationCandidate = evaluateV2B2Benchmark({
    manifest,
    plan,
    receipts: execution.receipts,
    sourceAllowlist: readSourceAllowlist(absoluteRoot, options),
  });
  const evaluation = persistImmutableEvaluation(
    join(privateStore, V2B2_PRIVATE_FILES.benchmarkEvaluation),
    evaluationCandidate,
    "v2b2_benchmark_evaluation_digest_invalid",
    "v2b2_benchmark_evaluation_changed_after_completion",
  );
  const decision = freezeV2B2ModelDecision(privateStore, evaluation, options);
  return { manifest, ...execution, evaluation, decision };
}

export async function resumeV2B2Benchmark(root, options = {}) {
  return runV2B2Benchmark(root, { ...options, resume: true });
}

export async function executeV2B2PhysicalPlan(options) {
  const {
    root,
    namespace,
    manifestDigest,
    plan,
    physicalRequestCap,
    cachePath,
    statePath,
    receiptsPath,
  } = options;
  const runtimeBindingDigest = options.runtimeBindingDigest ?? sha256(["injected_stage_executor", manifestDigest]);
  assertPhysicalPlan(plan, { physicalRequestCap, expectedCount: plan.length });
  if (plan.length > physicalRequestCap) throw new Error("v2b2_physical_plan_exceeds_cap");
  const now = options.now ?? (() => new Date().toISOString());
  const stageExecutor = options.stageExecutor ?? createRelayStageExecutor({
    root,
    fetchImpl: options.fetchImpl,
    env: options.env,
  });
  const cache = existsSync(cachePath)
    ? readJson(cachePath)
    : {
        schema: "m2.v2.v2b2.physical-cache.v0.1",
        privateOnly: true,
        namespace,
        manifestDigest,
        adapterVersion: V2B2_ADAPTER_VERSION,
        runtimeBindingDigest,
        retryCount: V2B2_MAX_RETRIES,
        entries: {},
      };
  const stateExisted = existsSync(statePath);
  const state = stateExisted
    ? readJson(statePath)
    : withDigest({
        schema: "m2.v2.v2b2.execution-state.v0.1",
        privateOnly: true,
        namespace,
        manifestDigest,
        executionStatus: "not_started",
        physicalRequestCap,
        retryCount: V2B2_MAX_RETRIES,
        plannedPhysicalRequestCount: plan.length,
        reservations: {},
        createdAt: now(),
        updatedAt: now(),
        fullPilotAuthorized: false,
        runtimeBindingDigest,
      }, "stateDigest");
  assertExecutionContainerBinding(cache, state, { namespace, manifestDigest, physicalRequestCap, plan, runtimeBindingDigest });
  if (stateExisted) assertDigest(state, "stateDigest", "v2b2_execution_state_digest_invalid");
  if (stateExisted && options.resume !== true) throw new Error("v2b2_execution_state_exists_use_resume");
  const planKeySet = new Set(plan.map((item) => item.requestKey));
  if (Object.keys(cache.entries).some((key) => !planKeySet.has(key))) throw new Error("v2b2_cache_contains_unknown_request");
  const taskByPhysicalKey = new Map(plan.map((item) => [item.requestKey, item]));
  if (stateExisted && state.executionStatus === "completed") {
    const receipts = assertCompletedExecutionParity({
      cache,
      state,
      plan,
      receiptsPath,
      manifestDigest,
      runtimeBindingDigest,
    });
    return { cache, state, receipts, taskByPhysicalKey };
  }

  for (const item of plan) {
    const cached = cache.entries[item.requestKey];
    if (cached) {
      assertPhysicalReceipt(cached, item, manifestDigest, runtimeBindingDigest);
      reconcileReservationFromCache(state, item, cached, now());
      checkpointExecution(cachePath, statePath, receiptsPath, cache, state, plan, now);
      continue;
    }
    const prior = state.reservations[item.requestKey];
    if (prior?.status === "dispatch_started") {
      const receipt = buildIndeterminateReceipt(item, manifestDigest, prior, now(), runtimeBindingDigest);
      cache.entries[item.requestKey] = receipt;
      state.reservations[item.requestKey] = {
        ...prior,
        status: "indeterminate_after_crash",
        completedAt: receipt.capturedAt,
        receiptDigest: receipt.receiptDigest,
      };
      checkpointExecution(cachePath, statePath, receiptsPath, cache, state, plan, now);
      continue;
    }
    if (prior) throw new Error("v2b2_reservation_without_cache_receipt");

    if (Object.keys(state.reservations).length >= physicalRequestCap) throw new Error("v2b2_physical_request_cap_reached");
    const dependency = item.stage === "extraction"
      ? cache.entries[findSearchRequestKey(plan, item)]
      : null;
    if (item.stage === "extraction" && !searchReceiptAllowsExtraction(dependency)) {
      const receipt = buildDependencyBlockedReceipt(item, manifestDigest, dependency, now(), runtimeBindingDigest);
      cache.entries[item.requestKey] = receipt;
      state.reservations[item.requestKey] = {
        ordinal: Object.keys(state.reservations).length + 1,
        requestKey: item.requestKey,
        status: "blocked_dependency",
        reservedAt: receipt.capturedAt,
        completedAt: receipt.capturedAt,
        receiptDigest: receipt.receiptDigest,
      };
      checkpointExecution(cachePath, statePath, receiptsPath, cache, state, plan, now);
      continue;
    }

    const reservation = {
      ordinal: Object.keys(state.reservations).length + 1,
      requestKey: item.requestKey,
      logicalTaskKey: item.logicalTaskKey,
      model: item.model,
      stage: item.stage,
      status: "dispatch_started",
      reservedAt: now(),
      retryCount: 0,
    };
    state.reservations[item.requestKey] = reservation;
    state.executionStatus = "running";
    state.updatedAt = now();
    atomicWriteJson(statePath, withReplacedDigest(state, "stateDigest"));

    let receipt;
    try {
      const supplied = await stageExecutor({
        item: { ...item },
        priorSearchReceipt: dependency ? structuredClone(dependency) : null,
        manifestDigest,
        retryCount: 0,
      });
      receipt = finalizeSuppliedReceipt(supplied, item, manifestDigest, now(), runtimeBindingDigest);
    } catch (error) {
      receipt = buildExecutorErrorReceipt(item, manifestDigest, error, now(), runtimeBindingDigest);
    }
    assertPhysicalReceipt(receipt, item, manifestDigest, runtimeBindingDigest);
    cache.entries[item.requestKey] = receipt;
    state.reservations[item.requestKey] = {
      ...reservation,
      status: "completed",
      completedAt: now(),
      receiptDigest: receipt.receiptDigest,
    };
    checkpointExecution(cachePath, statePath, receiptsPath, cache, state, plan, now);
  }

  const receipts = plan.map((item) => cache.entries[item.requestKey]);
  if (receipts.some((item) => !item)) throw new Error("v2b2_execution_receipt_missing");
  state.executionStatus = "completed";
  state.updatedAt = now();
  state.completedPhysicalReceiptCount = receipts.length;
  state.dispatchedPhysicalRequestCount = receipts.filter((item) => item.dispatched === true).length;
  state.cacheEntryCount = Object.keys(cache.entries).length;
  state.fullPilotAuthorized = false;
  checkpointExecution(cachePath, statePath, receiptsPath, cache, state, plan, now);
  return { cache, state: readJson(statePath), receipts, taskByPhysicalKey };
}

export function createRelayStageExecutor(options = {}) {
  const configuration = loadRelayConfiguration(options.root, options.env);
  const fetchImpl = options.fetchImpl;
  if (typeof fetchImpl !== "function") throw new Error("v2b2_fetch_unavailable");
  return async ({ item, priorSearchReceipt, manifestDigest }) => {
    const payload = item.stage === "search"
      ? buildSearchPayload(item)
      : buildExtractionPayload(item, priorSearchReceipt);
    const timeoutMs = item.stage === "search" ? SEARCH_TIMEOUT_MS : EXTRACTION_TIMEOUT_MS;
    const response = await dispatchRelayResponse({
      fetchImpl,
      baseUrl: configuration.baseUrl,
      approvedHost: configuration.approvedHost,
      apiKey: configuration.apiKey,
      payload,
      timeoutMs,
    });
    const profile = profileV2B2ResponseShape(response.json, {
      contentType: response.contentType,
      httpStatus: response.httpStatus,
      rawByteLength: response.rawByteLength,
      parseStatus: response.parseStatus,
      transportError: response.transportError,
    });
    const requestedModelId = item.model;
    const returnedModelId = safeModelId(response.json?.model);
    const modelBindingVerified = Boolean(returnedModelId && returnedModelId === requestedModelId);
    const normalized = item.stage === "search"
      ? normalizeV2B2SearchResponse(response.json)
      : normalizeV2B2ExtractionResponse(response.json);
    const normalizedContract = normalizeCoreContract(normalized, item.stage, item);
    const lineage = item.stage === "extraction"
      ? normalizeLineage(joinV2B2CitationLineage({
          search: priorSearchReceipt?.normalizedResponse ?? null,
          extraction: normalized,
        }))
      : null;
    const contractCompatible = response.connectivityPassed
      && normalizedContract.valid
      && (item.stage === "search" || lineage.valid);
    return {
      schema: "m2.v2.v2b2.physical-receipt.v0.1",
      privateOnly: true,
      manifestDigest,
      requestKey: item.requestKey,
      logicalTaskKey: item.logicalTaskKey,
      workReference: item.workReference,
      identityDigest: item.identityDigest,
      runKind: item.runKind,
      queryId: item.queryId,
      stage: item.stage,
      requestedModelId,
      returnedModelId,
      modelBindingVerified,
      adapterVersion: V2B2_ADAPTER_VERSION,
      promptVersion: V2B2_PROMPT_VERSION,
      schemaVersion: V2B2_SCHEMA_VERSION,
      dispatched: true,
      retryCount: 0,
      httpStatus: response.httpStatus,
      providerConnectivityPassed: response.connectivityPassed,
      providerContractCompatible: contractCompatible,
      status: contractCompatible && modelBindingVerified
        ? "success"
        : !response.connectivityPassed
          ? response.status
          : !modelBindingVerified
            ? "model_binding_mismatch"
            : item.stage === "search"
              ? "search_contract_failure"
              : lineage?.valid !== true
                ? "citation_lineage_failure"
                : "extraction_contract_failure",
      responseContentTypeClass: contentTypeClass(response.contentType),
      responseDigest: response.responseDigest,
      responseByteLength: response.rawByteLength,
      responseShapeProfile: profile,
      normalizedResponse: normalized,
      lineage,
      structuredValid: normalizedContract.structuredValid,
      validationIssues: normalizedContract.issues,
      citationCount: normalizedContract.citationCount,
      entityResolved: normalizedContract.entityResolved,
      entityIdentityErrorCount: normalizedContract.entityIdentityErrorCount,
      claimSupportUnverifiedCount: item.stage === "extraction" ? lineage.claimSupportUnverifiedCount : 0,
      usableEvidenceCount: item.stage === "extraction" && normalizedContract.entityResolved
        ? lineage.supportedCandidateCount
        : 0,
      availableAtCount: normalizedContract.availableAtCount,
      eventTimeCount: normalizedContract.eventTimeCount,
      usage: normalizedContract.usage,
      latencyMs: response.latencyMs,
      capturedAt: response.capturedAt,
      rawResponsePersisted: false,
      authorizationHeaderPersisted: false,
      apiKeyPersisted: false,
      fullPilotAuthorized: false,
    };
  };
}

export function evaluateV2B2Benchmark({ manifest, plan, receipts, sourceAllowlist, evaluatedAt = null }) {
  if (manifest.plannedPhysicalRequestCount !== plan.length || receipts.length !== plan.length) {
    throw new Error("v2b2_benchmark_evaluation_population_mismatch");
  }
  for (const [index, item] of plan.entries()) {
    assertPhysicalReceipt(receipts[index], item, manifest.benchmarkManifestDigest, manifest.relayBindingDigest);
  }
  const perModel = Object.fromEntries(V2B2_MODELS.map((model) => {
    const armReceipts = receipts.filter((item) => item.requestedModelId === model);
    const search = armReceipts.filter((item) => item.stage === "search");
    const extraction = armReceipts.filter((item) => item.stage === "extraction");
    const usableWorkKeys = unique(extraction.filter((item) => (
      item.usableEvidenceCount > 0
      && item.providerContractCompatible === true
      && item.entityResolved === true
      && item.entityIdentityErrorCount === 0
      && item.claimSupportUnverifiedCount === 0
      && lineageUnsupportedCount(item.lineage) === 0
    )).map((item) => item.logicalTaskKey));
    const resolvedWorkKeys = unique(extraction.filter((item) => item.entityResolved === true).map((item) => item.logicalTaskKey));
    const dispatched = armReceipts.filter((item) => item.dispatched === true);
    const connected = dispatched.filter((item) => item.providerConnectivityPassed === true);
    const dependencyBlockedCount = armReceipts.filter((item) => (
      item.dispatched === false && item.status === "blocked_search_dependency"
    )).length;
    const contract = armReceipts.filter((item) => item.providerContractCompatible === true);
    const bindingMismatchCount = armReceipts.filter((item) => item.dispatched === true && item.modelBindingVerified !== true).length;
    const unsupportedCitationReferenceCount = sum(extraction.map((item) => lineageUnsupportedCount(item.lineage)));
    const claimSupportUnverifiedCount = sum(extraction.map((item) => Number(item.claimSupportUnverifiedCount) || 0));
    const entityIdentityErrorCount = sum(extraction.map((item) => Number(item.entityIdentityErrorCount) || 0));
    const validationIssueCount = sum(extraction.map((item) => item.validationIssues?.length ?? 0));
    const citationBoundEvidenceCount = sum(extraction.map((item) => Number(item.usableEvidenceCount) || 0));
    const availableAtCount = sum(extraction.map((item) => Number(item.availableAtCount) || 0));
    const eventTimeCount = sum(extraction.map((item) => Number(item.eventTimeCount) || 0));
    const extractionContractSuccessCount = extraction.filter((item) => item.providerContractCompatible === true).length;
    const searchContractSuccessCount = search.filter((item) => item.providerContractCompatible === true).length;
    const searchContractRate = ratio(searchContractSuccessCount, search.length);
    const extractionContractRate = ratio(extractionContractSuccessCount, extraction.length);
    const citationBoundWorkRate = ratio(usableWorkKeys.length, manifest.sampleCount);
    const endToEndSuccessCount = extraction.filter((item) => (
      item.providerContractCompatible === true && item.modelBindingVerified === true
    )).length;
    const timestampCompleteness = citationBoundEvidenceCount > 0
      ? (availableAtCount + eventTimeCount) / (citationBoundEvidenceCount * 2)
      : null;
    const usageObserved = armReceipts.filter((item) => Number.isFinite(item.usage?.totalTokens));
    const usageObservedRequestCount = usageObserved.length;
    const usageMissingRequestCount = armReceipts.length - usageObservedRequestCount;
    const observedInputTokens = sum(usageObserved.map((item) => item.usage.inputTokens));
    const observedOutputTokens = sum(usageObserved.map((item) => item.usage.outputTokens));
    const observedTotalTokens = sum(usageObserved.map((item) => item.usage.totalTokens));
    const tokenUsageComplete = usageMissingRequestCount === 0;
    const totalTokens = tokenUsageComplete ? observedTotalTokens : null;
    const latencyTotalMs = sum(dispatched.map((item) => Number(item.latencyMs) || 0));
    const latencyP90Ms = percentile(dispatched.map((item) => Number(item.latencyMs)).filter(Number.isFinite), 0.9);
    const latencyP50Ms = percentile(dispatched.map((item) => Number(item.latencyMs)).filter(Number.isFinite), 0.5);
    const latencyObservedRequestCount = dispatched.filter((item) => Number.isFinite(item.latencyMs)).length;
    const latencyComplete = latencyObservedRequestCount === dispatched.length;
    const connectivityRate = ratio(connected.length, dispatched.length);
    const contractRate = ratio(contract.length, armReceipts.length);
    const compatibleEligible = armReceipts.length === 20
      && bindingMismatchCount === 0
      && searchContractRate >= MODEL_CONTRACT_RATE_MINIMUM
      && extractionContractRate >= MODEL_CONTRACT_RATE_MINIMUM;
    const eligible = compatibleEligible
      && citationBoundWorkRate >= MODEL_CONTRACT_RATE_MINIMUM
      && unsupportedCitationReferenceCount === 0
      && claimSupportUnverifiedCount === 0
      && entityIdentityErrorCount === 0;
    const metrics = {
      model,
      plannedPhysicalRequestCount: armReceipts.length,
      dispatchedPhysicalRequestCount: dispatched.length,
      providerConnectivityCount: connected.length,
      providerConnectivityRate: connectivityRate,
      dependencyBlockedCount,
      providerContractCompatibleCount: contract.length,
      providerContractCompatibleRate: contractRate,
      searchContractSuccessCount,
      searchContractRate,
      extractionContractSuccessCount,
      extractionContractRate,
      modelBindingMismatchCount: bindingMismatchCount,
      unsupportedCitationReferenceCount,
      claimSupportUnverifiedCount,
      entityIdentityErrorCount,
      validationIssueCount,
      usableWorkCount: usableWorkKeys.length,
      validEvidenceWorkCount: usableWorkKeys.length,
      citationBoundWorkRate,
      entityResolvedWorkCount: resolvedWorkKeys.length,
      citationBoundEvidenceCount,
      availableAtCount,
      eventTimeCount,
      timestampCompleteness,
      endToEndSuccessCount,
      totalTokens,
      observedInputTokens,
      observedOutputTokens,
      observedTotalTokens,
      usageObservedRequestCount,
      usageMissingRequestCount,
      tokenUsageComplete,
      latencyTotalMs,
      latencyP50Ms,
      latencyP90Ms,
      latencyObservedRequestCount,
      latencyComplete,
      eligibleForCompatibilityGate: compatibleEligible,
      eligibleForQualityDecision: eligible,
      usableWorkKeys,
      resolvedWorkKeys,
    };
    return [model, metrics];
  }));
  const pairedEvaluableWorkKeys = perModel[V2B2_MODELS[0]].usableWorkKeys.filter((key) => (
    perModel[V2B2_MODELS[1]].usableWorkKeys.includes(key)
  ));
  const compatibilityPassed = V2B2_MODELS.every((model) => perModel[model].eligibleForCompatibilityGate);
  const connectivityPassed = V2B2_MODELS.every((model) => perModel[model].providerConnectivityRate >= MODEL_CONTRACT_RATE_MINIMUM);
  const contractPassed = V2B2_MODELS.every((model) => (
    perModel[model].searchContractRate >= MODEL_CONTRACT_RATE_MINIMUM
      && perModel[model].extractionContractRate >= MODEL_CONTRACT_RATE_MINIMUM
      && perModel[model].modelBindingMismatchCount === 0
  ));
  const qualityEvaluable = compatibilityPassed
    && pairedEvaluableWorkKeys.length >= 8
    && V2B2_MODELS.every((model) => perModel[model].eligibleForQualityDecision);
  const approvedEntries = Array.isArray(sourceAllowlist?.approvedDomainEntries) ? sourceAllowlist.approvedDomainEntries : [];
  const governance = {
    status: approvedEntries.length ? "ALLOWLIST_PRESENT_NOT_USED_FOR_MODEL_SELECTION" : "BLOCKED_EMPTY_ALLOWLIST",
    approvedDomainEntryCount: approvedEntries.length,
    acceptedEvidenceCount: 0,
    modelQualityIndependentOfGovernance: true,
  };
  const payload = {
    schema: "m2.v2.v2b2.terra-luna-benchmark-evaluation.v0.1",
    privateOnly: true,
    benchmarkManifestDigest: manifest.benchmarkManifestDigest,
    evaluatedAt: resolveEvaluationTimestamp(evaluatedAt, receipts),
    population: {
      workCount: manifest.sampleCount,
      modelArmCount: manifest.logicalTaskCount,
      plannedPhysicalRequestCount: plan.length,
      failedSamplesReplaced: false,
    },
    receiptSetDigest: receiptSetDigest(receipts),
    providerConnectivity: {
      status: connectivityPassed ? "PASS" : "FAIL",
      threshold: MODEL_CONTRACT_RATE_MINIMUM,
      dispatchedCount: sum(Object.values(perModel).map((item) => item.dispatchedPhysicalRequestCount)),
      connectedCount: sum(Object.values(perModel).map((item) => item.providerConnectivityCount)),
      dependencyBlockedCount: sum(Object.values(perModel).map((item) => item.dependencyBlockedCount)),
    },
    providerContractCompatibility: { status: contractPassed ? "PASS" : "FAIL", threshold: MODEL_CONTRACT_RATE_MINIMUM },
    compatibilityGate: { passed: compatibilityPassed },
    modelEvidenceQuality: {
      status: qualityEvaluable ? "EVALUATED" : "NOT_EVALUATED",
      pairedEvaluableWorkCount: pairedEvaluableWorkKeys.length,
      pairedEvaluableWorkMinimum: 8,
    },
    modelQualityGate: {
      passed: qualityEvaluable,
      pairedEvaluableWorkCount: pairedEvaluableWorkKeys.length,
      pairedEvaluableWorkMinimum: 8,
    },
    sourceGovernance: governance,
    models: perModel,
    fullPilotAuthorized: false,
  };
  return withDigest(payload, "evaluationDigest");
}

export function freezeV2B2ModelDecision(privateStore, evaluation, options = {}) {
  const path = join(privateStore, V2B2_PRIVATE_FILES.modelDecision);
  if (existsSync(path)) {
    const existing = readJson(path);
    assertDigest(existing, "decisionDigest", "v2b2_model_decision_digest_invalid");
    const expected = deriveV2B2ModelDecision(evaluation, { frozenAt: existing.frozenAt });
    if (canonicalJson(existing) !== canonicalJson(expected)) throw new Error("v2b2_model_decision_content_mismatch");
    return existing;
  }
  const decision = deriveV2B2ModelDecision(evaluation, options);
  atomicWriteJson(path, decision);
  return decision;
}

export function deriveV2B2ModelDecision(evaluation, options = {}) {
  const frozenAt = options.frozenAt ?? new Date().toISOString();
  if (!isIsoTimestamp(frozenAt)) throw new Error("v2b2_model_decision_frozen_at_invalid");
  if (evaluation.compatibilityGate?.passed !== true || evaluation.modelQualityGate?.passed !== true) {
    const blockedPayload = {
      schema: "m2.v2.v2b2.model-decision-blocked.v0.1",
      privateOnly: true,
      immutable: true,
      status: "BLOCKED",
      frozenAt,
      evaluationDigest: evaluation.evaluationDigest,
      defaultModel: null,
      upgradeModel: null,
      canaryRerunAuthorized: false,
      fullPilotAuthorized: false,
      blockers: [
        ...(evaluation.compatibilityGate?.passed ? [] : ["compatibility_gate_failed"]),
        ...(evaluation.modelQualityGate?.passed ? [] : ["model_quality_gate_failed"]),
      ],
    };
    return withDigest(blockedPayload, "decisionDigest");
  }
  const left = evaluation.models[V2B2_MODELS[0]];
  const right = evaluation.models[V2B2_MODELS[1]];
  const comparison = compareQualityFirst(left, right);
  const defaultMetrics = comparison >= 0 ? left : right;
  const alternateMetrics = comparison >= 0 ? right : left;
  const incrementalWorks = alternateMetrics.usableWorkKeys.filter((key) => !defaultMetrics.usableWorkKeys.includes(key));
  const upgradeEligible = incrementalWorks.length >= 2
    && alternateMetrics.unsupportedCitationReferenceCount === 0
    && alternateMetrics.claimSupportUnverifiedCount === 0
    && alternateMetrics.entityIdentityErrorCount === 0
    && alternateMetrics.validationIssueCount <= defaultMetrics.validationIssueCount;
  const payload = {
    schema: "m2.v2.v2b2.model-decision.v0.1",
    privateOnly: true,
    immutable: true,
    status: "FROZEN",
    frozenAt,
    evaluationDigest: evaluation.evaluationDigest,
    qualityRuleVersion: "m2-v2-v2b2-quality-first-lexicographic-v0.1",
    qualityOrder: [
      "claimSupportUnverifiedCount:ascending",
      "unsupportedCitationReferenceCount:ascending",
      "entityIdentityErrorCount:ascending",
      "validationIssueCount:ascending",
      "validEvidenceWorkCount:descending",
      "entityResolvedWorkCount:descending",
      "citationBoundEvidenceCount:descending",
      "timestampCompleteness:descending",
      "endToEndSuccessCount:descending",
      "totalTokens:ascending_tiebreak_only",
      "latencyP90Ms:ascending_tiebreak_only",
      "luna:deterministic_final_tiebreak",
    ],
    defaultModel: defaultMetrics.model,
    upgradeModel: upgradeEligible ? alternateMetrics.model : null,
    upgradeReason: upgradeEligible ? "at_least_two_verified_complementary_usable_works_without_added_error" : "fewer_than_two_verified_complementary_wins_or_added_error",
    complementaryIncrementalWorkCount: incrementalWorks.length,
    canaryRerunAuthorized: true,
    canaryModelPolicy: "single_frozen_default_model",
    fullPilotAuthorized: false,
  };
  return withDigest(payload, "decisionDigest");
}

export function deriveV2B2CanaryManifest(parent, canary, benchmarkManifest, modelDecision, options = {}) {
  assertFrozenBinding(parent, canary, options);
  assertV2B2BenchmarkManifest(benchmarkManifest, parent, canary, options);
  if (
    modelDecision?.schema !== "m2.v2.v2b2.model-decision.v0.1"
    || modelDecision?.status !== "FROZEN"
    || modelDecision?.canaryRerunAuthorized !== true
    || !V2B2_MODELS.includes(modelDecision?.defaultModel)
  ) throw new Error("v2b2_canary_model_decision_not_authorized");
  assertDigest(modelDecision, "decisionDigest", "v2b2_model_decision_digest_invalid");
  const originalTasks = buildCanaryTasks(canary);
  if (originalTasks.length !== V2B2_CANARY_LOGICAL_TASK_COUNT) throw new Error("v2b2_original_canary_task_count_invalid");
  const logicalTasks = originalTasks.map((task, ordinal) => ({
    logicalTaskKey: task.requestKey,
    ordinal: ordinal + 1,
    runKind: task.runKind,
    workReference: task.workReference,
    identityDigest: task.identityDigest,
    title: task.title,
    author: task.author,
    sourceType: task.sourceType,
    queryId: task.queryId,
    queryHash: task.queryHash,
    queryCategory: task.queryCategory,
    queryText: task.queryText,
  }));
  const physicalRequests = logicalTasks.flatMap((task) => ["search", "extraction"].map((stage) => ({
    requestKey: physicalRequestKey({
      parentManifestDigest: parent.manifestDigest,
      canaryManifestDigest: canary.canaryManifestDigest,
      benchmarkManifestDigest: benchmarkManifest.benchmarkManifestDigest,
      modelDecisionDigest: modelDecision.decisionDigest,
      logicalTaskKey: task.logicalTaskKey,
      model: modelDecision.defaultModel,
      stage,
      namespace: "canary_v0.2",
      relayBindingDigest: benchmarkManifest.relayBindingDigest,
    }),
    logicalTaskKey: task.logicalTaskKey,
    stage,
    model: modelDecision.defaultModel,
  })));
  const payload = {
    schema: "m2.v2.v2b2.canary-v0.2-execution-manifest.v0.1",
    privateOnly: true,
    immutable: true,
    status: "frozen_before_canary_v0.2_rerun",
    createdAt: options.createdAt ?? new Date().toISOString(),
    derivedWithoutResampling: true,
    parentManifestDigest: parent.manifestDigest,
    canaryV01ManifestDigest: canary.canaryManifestDigest,
    benchmarkManifestDigest: benchmarkManifest.benchmarkManifestDigest,
    relayBindingDigest: benchmarkManifest.relayBindingDigest,
    modelDecisionDigest: modelDecision.decisionDigest,
    sampleCount: canary.sample.length,
    sampleIdentityDigest: sha256(canary.sample.map((item) => item.identityDigest)),
    sample: canary.sample.map((item) => ({ ...item })),
    seed: canary.seed,
    defaultModel: modelDecision.defaultModel,
    singleFrozenDefaultModel: true,
    adapterVersion: V2B2_ADAPTER_VERSION,
    promptVersion: V2B2_PROMPT_VERSION,
    schemaVersion: V2B2_SCHEMA_VERSION,
    originalLogicalTaskCount: originalTasks.length,
    logicalTaskCount: logicalTasks.length,
    plannedPhysicalRequestCount: physicalRequests.length,
    physicalRequestCap: V2B2_CANARY_PHYSICAL_REQUEST_CAP,
    stages: ["search", "extraction"],
    retryPolicy: { maxRetries: 0, retryableContractFailures: false },
    namespaceIndependentFromV01: true,
    logicalTasks,
    physicalRequests,
    fullPilotAuthorized: false,
  };
  const manifest = withDigest(payload, "canaryV02ManifestDigest");
  assertV2B2CanaryManifest(manifest, parent, canary, benchmarkManifest, modelDecision, options);
  return manifest;
}

export function assertV2B2CanaryManifest(manifest, parent, canary, benchmarkManifest, modelDecision, options = {}) {
  assertFrozenBinding(parent, canary, options);
  if (manifest?.schema !== "m2.v2.v2b2.canary-v0.2-execution-manifest.v0.1") throw new Error("v2b2_canary_manifest_schema_invalid");
  if (manifest?.privateOnly !== true || manifest?.immutable !== true || manifest?.derivedWithoutResampling !== true) {
    throw new Error("v2b2_canary_manifest_not_immutable");
  }
  if (
    manifest.parentManifestDigest !== parent.manifestDigest
    || manifest.canaryV01ManifestDigest !== canary.canaryManifestDigest
    || manifest.benchmarkManifestDigest !== benchmarkManifest.benchmarkManifestDigest
    || manifest.modelDecisionDigest !== modelDecision.decisionDigest
  ) throw new Error("v2b2_canary_manifest_binding_mismatch");
  if (manifest.relayBindingDigest !== benchmarkManifest.relayBindingDigest) throw new Error("v2b2_canary_relay_binding_mismatch");
  if (canonicalJson(manifest.sample) !== canonicalJson(canary.sample)) throw new Error("v2b2_canary_sample_changed");
  if (manifest.seed !== canary.seed) throw new Error("v2b2_canary_seed_changed");
  if (manifest.sampleCount !== 10 || manifest.logicalTaskCount !== 60 || manifest.originalLogicalTaskCount !== 60) {
    throw new Error("v2b2_canary_logical_population_invalid");
  }
  if (manifest.plannedPhysicalRequestCount !== 120 || manifest.physicalRequestCap !== 120 || manifest.retryPolicy?.maxRetries !== 0) {
    throw new Error("v2b2_canary_budget_invalid");
  }
  if (manifest.defaultModel !== modelDecision.defaultModel || manifest.singleFrozenDefaultModel !== true) {
    throw new Error("v2b2_canary_model_binding_invalid");
  }
  const keys = manifest.physicalRequests.map((item) => item.requestKey);
  if (keys.length !== 120 || new Set(keys).size !== 120) throw new Error("v2b2_canary_physical_keys_not_isolated");
  if (manifest.physicalRequests.some((item) => item.model !== manifest.defaultModel)) throw new Error("v2b2_canary_multiple_models_detected");
  assertDigest(manifest, "canaryV02ManifestDigest", "v2b2_canary_manifest_digest_invalid");
  if (manifest.fullPilotAuthorized !== false) throw new Error("v2b2_full_pilot_must_remain_unauthorized");
  return true;
}

export function buildV2B2CanaryPhysicalPlan(manifest) {
  const taskByKey = new Map(manifest.logicalTasks.map((item) => [item.logicalTaskKey, item]));
  const plan = manifest.physicalRequests.map((physical) => {
    const task = taskByKey.get(physical.logicalTaskKey);
    if (!task) throw new Error("v2b2_canary_physical_task_missing");
    return {
      requestKey: physical.requestKey,
      stage: physical.stage,
      model: physical.model,
      modelOrder: 1,
      logicalTaskKey: task.logicalTaskKey,
      workReference: task.workReference,
      identityDigest: task.identityDigest,
      title: task.title,
      author: task.author,
      sourceType: task.sourceType,
      queryText: task.queryText,
      queryId: task.queryId,
      queryHash: task.queryHash,
      queryCategory: task.queryCategory,
      runKind: task.runKind,
      ordinal: task.ordinal,
    };
  }).sort((left, right) => left.ordinal - right.ordinal || stageRank(left.stage) - stageRank(right.stage));
  assertPhysicalPlan(plan, { expectedCount: 120, physicalRequestCap: 120, models: [manifest.defaultModel] });
  return plan;
}

function loadVerifiedV2B2BenchmarkCheckpoint(absoluteRoot, privateStore, binding, options = {}) {
  const benchmarkManifest = readJson(join(privateStore, V2B2_PRIVATE_FILES.benchmarkManifest));
  assertV2B2BenchmarkManifest(benchmarkManifest, binding.parent, binding.canary, options);
  const plan = buildV2B2BenchmarkPhysicalPlan(benchmarkManifest);
  const receipts = readNdjson(join(privateStore, V2B2_PRIVATE_FILES.benchmarkReceipts));
  const benchmarkEvaluation = readJson(join(privateStore, V2B2_PRIVATE_FILES.benchmarkEvaluation));
  assertDigest(benchmarkEvaluation, "evaluationDigest", "v2b2_benchmark_evaluation_digest_invalid");
  if (
    benchmarkEvaluation.schema !== "m2.v2.v2b2.terra-luna-benchmark-evaluation.v0.1"
    || benchmarkEvaluation.privateOnly !== true
    || benchmarkEvaluation.benchmarkManifestDigest !== benchmarkManifest.benchmarkManifestDigest
    || benchmarkEvaluation.fullPilotAuthorized !== false
  ) throw new Error("v2b2_benchmark_evaluation_contract_invalid");
  const recomputedEvaluation = evaluateV2B2Benchmark({
    manifest: benchmarkManifest,
    plan,
    receipts,
    sourceAllowlist: readSourceAllowlist(absoluteRoot, options),
    evaluatedAt: benchmarkEvaluation.evaluatedAt,
  });
  if (canonicalJson(benchmarkEvaluation) !== canonicalJson(recomputedEvaluation)) {
    throw new Error("v2b2_benchmark_receipt_evaluation_parity_failed");
  }
  const modelDecision = readJson(join(privateStore, V2B2_PRIVATE_FILES.modelDecision));
  assertDigest(modelDecision, "decisionDigest", "v2b2_model_decision_digest_invalid");
  const recomputedDecision = deriveV2B2ModelDecision(benchmarkEvaluation, { frozenAt: modelDecision.frozenAt });
  if (canonicalJson(modelDecision) !== canonicalJson(recomputedDecision)) {
    throw new Error("v2b2_model_decision_evaluation_parity_failed");
  }
  return { benchmarkManifest, benchmarkEvaluation, modelDecision, plan, receipts };
}

export async function runV2B2Canary(root, options = {}) {
  const absoluteRoot = resolve(root);
  const privateStore = ensurePrivateStore(absoluteRoot, options);
  const binding = loadFrozenBinding(absoluteRoot, options);
  const checkpoint = loadVerifiedV2B2BenchmarkCheckpoint(absoluteRoot, privateStore, binding, options);
  const { benchmarkManifest, benchmarkEvaluation, modelDecision } = checkpoint;
  const runtimeBindingDigest = options.runtimeBindingDigest
    ?? (options.stageExecutor ? benchmarkManifest.relayBindingDigest : loadRelayConfiguration(absoluteRoot, options.env).bindingDigest);
  if (runtimeBindingDigest !== benchmarkManifest.relayBindingDigest) throw new Error("v2b2_relay_binding_changed_after_freeze");
  if (
    benchmarkEvaluation.compatibilityGate?.passed !== true
    || benchmarkEvaluation.modelQualityGate?.passed !== true
    || modelDecision.canaryRerunAuthorized !== true
  ) throw new Error("v2b2_canary_rerun_gate_failed");
  const frozen = freezeCanaryManifest(privateStore, binding, benchmarkManifest, modelDecision, options);
  const manifest = frozen.manifest;
  const plan = buildV2B2CanaryPhysicalPlan(manifest);
  const execution = await executeV2B2PhysicalPlan({
    root: absoluteRoot,
    namespace: "canary_v0.2",
    manifestDigest: manifest.canaryV02ManifestDigest,
    plan,
    physicalRequestCap: V2B2_CANARY_PHYSICAL_REQUEST_CAP,
    cachePath: join(privateStore, V2B2_PRIVATE_FILES.canaryCache),
    statePath: join(privateStore, V2B2_PRIVATE_FILES.canaryState),
    receiptsPath: join(privateStore, V2B2_PRIVATE_FILES.canaryReceipts),
    stageExecutor: options.stageExecutor,
    fetchImpl: options.fetchImpl,
    env: options.env,
    resume: options.resume === true,
    now: options.now,
    runtimeBindingDigest,
  });
  const evaluationCandidate = evaluateV2B2Canary({
    manifest,
    plan,
    receipts: execution.receipts,
    sourceAllowlist: readSourceAllowlist(absoluteRoot, options),
  });
  const evaluation = persistImmutableEvaluation(
    join(privateStore, V2B2_PRIVATE_FILES.canaryEvaluation),
    evaluationCandidate,
    "v2b2_canary_evaluation_digest_invalid",
    "v2b2_canary_evaluation_changed_after_completion",
  );
  return { manifest, ...execution, evaluation, fullPilotAuthorized: false };
}

export async function resumeV2B2Canary(root, options = {}) {
  return runV2B2Canary(root, { ...options, resume: true });
}

export function evaluateV2B2Canary({ manifest, plan, receipts, sourceAllowlist, evaluatedAt = null }) {
  if (plan.length !== 120 || receipts.length !== 120) throw new Error("v2b2_canary_evaluation_population_invalid");
  for (const [index, item] of plan.entries()) {
    assertPhysicalReceipt(receipts[index], item, manifest.canaryV02ManifestDigest, manifest.relayBindingDigest);
  }
  const dispatched = receipts.filter((item) => item.dispatched === true);
  const connected = dispatched.filter((item) => item.providerConnectivityPassed === true);
  const dependencyBlockedCount = receipts.filter((item) => (
    item.dispatched === false && item.status === "blocked_search_dependency"
  )).length;
  const compatible = receipts.filter((item) => item.providerContractCompatible === true);
  const extraction = receipts.filter((item) => item.stage === "extraction");
  const search = receipts.filter((item) => item.stage === "search");
  const modelMismatchCount = dispatched.filter((item) => item.modelBindingVerified !== true).length;
  const usableWorks = unique(extraction.filter((item) => (
    item.usableEvidenceCount > 0
    && item.providerContractCompatible === true
    && item.entityResolved === true
    && item.entityIdentityErrorCount === 0
    && item.claimSupportUnverifiedCount === 0
    && lineageUnsupportedCount(item.lineage) === 0
  )).map((item) => item.workReference));
  const approvedEntries = Array.isArray(sourceAllowlist?.approvedDomainEntries) ? sourceAllowlist.approvedDomainEntries : [];
  const contractRate = ratio(compatible.length, receipts.length);
  const searchContractRate = ratio(search.filter((item) => item.providerContractCompatible === true).length, search.length);
  const extractionContractRate = ratio(extraction.filter((item) => item.providerContractCompatible === true).length, extraction.length);
  const citationBoundWorkRate = ratio(usableWorks.length, manifest.sampleCount);
  const unsupportedCitationReferenceCount = sum(extraction.map((item) => lineageUnsupportedCount(item.lineage)));
  const claimSupportUnverifiedCount = sum(extraction.map((item) => Number(item.claimSupportUnverifiedCount) || 0));
  const entityIdentityErrorCount = sum(extraction.map((item) => Number(item.entityIdentityErrorCount) || 0));
  const technicalPassed = searchContractRate >= MODEL_CONTRACT_RATE_MINIMUM
    && extractionContractRate >= MODEL_CONTRACT_RATE_MINIMUM
    && citationBoundWorkRate >= MODEL_CONTRACT_RATE_MINIMUM
    && modelMismatchCount === 0
    && unsupportedCitationReferenceCount === 0
    && claimSupportUnverifiedCount === 0
    && entityIdentityErrorCount === 0;
  const payload = {
    schema: "m2.v2.v2b2.canary-v0.2-evaluation.v0.1",
    privateOnly: true,
    canaryV02ManifestDigest: manifest.canaryV02ManifestDigest,
    evaluatedAt: resolveEvaluationTimestamp(evaluatedAt, receipts),
    population: {
      workCount: manifest.sampleCount,
      logicalTaskCount: manifest.logicalTaskCount,
      plannedPhysicalRequestCount: manifest.plannedPhysicalRequestCount,
      failedSamplesReplaced: false,
    },
    receiptSetDigest: receiptSetDigest(receipts),
    providerConnectivity: {
      status: ratio(connected.length, dispatched.length) >= MODEL_CONTRACT_RATE_MINIMUM ? "PASS" : "FAIL",
      connectedCount: connected.length,
      dispatchedCount: dispatched.length,
      denominator: dispatched.length,
      plannedPhysicalRequestCount: receipts.length,
      dependencyBlockedCount,
    },
    providerContractCompatibility: {
      status: searchContractRate >= MODEL_CONTRACT_RATE_MINIMUM
        && extractionContractRate >= MODEL_CONTRACT_RATE_MINIMUM
        && modelMismatchCount === 0
        ? "PASS"
        : "FAIL",
      compatibleCount: compatible.length,
      denominator: receipts.length,
      searchContractRate,
      extractionContractRate,
      modelBindingMismatchCount: modelMismatchCount,
    },
    modelEvidenceQuality: {
      status: technicalPassed ? "EVALUATED" : "NOT_EVALUATED",
      usableWorkCount: usableWorks.length,
      citationBoundWorkRate,
      citationBoundEvidenceCount: sum(extraction.map((item) => Number(item.usableEvidenceCount) || 0)),
      unsupportedCitationReferenceCount,
      claimSupportUnverifiedCount,
      entityIdentityErrorCount,
    },
    sourceGovernance: {
      status: approvedEntries.length ? "ALLOWLIST_PRESENT" : "BLOCKED_EMPTY_ALLOWLIST",
      approvedDomainEntryCount: approvedEntries.length,
      acceptedEvidenceCount: 0,
      modelQualityIndependentOfGovernance: true,
    },
    canaryTechnicalStatus: technicalPassed ? "TECHNICAL_PASS" : "TECHNICAL_FAIL",
    fullPilotAuthorized: false,
    full160ExecutionAuthorizedByThisRun: false,
    full160Executed: false,
  };
  return withDigest(payload, "evaluationDigest");
}

export function verifyV2B2(root, options = {}) {
  const absoluteRoot = resolve(root);
  const privateStore = ensurePrivateStore(absoluteRoot, options);
  const binding = loadFrozenBinding(absoluteRoot, options);
  const sourceAllowlist = readSourceAllowlist(absoluteRoot, options);
  const issues = [];
  let benchmarkManifest = null;
  let benchmarkEvaluation = null;
  let modelDecision = null;
  let canaryManifest = null;
  let canaryEvaluation = null;
  let responseShapeMatrix = null;
  let responseShapeMatrixVerified = false;
  let benchmarkManifestVerified = false;
  let benchmarkEvaluationVerified = false;
  let modelDecisionVerified = false;
  let canaryManifestVerified = false;
  let canaryEvaluationVerified = false;
  try {
    const candidate = readJson(join(privateStore, V2B2_PRIVATE_FILES.responseShapeMatrix));
    assertDigest(candidate, "matrixDigest", "v2b2_response_shape_matrix_digest_invalid");
    const legacySourcePath = join(absoluteRoot, options.receiptsRelative ?? V2B2_LEGACY_RECEIPTS_RELATIVE);
    const legacyReceipts = readNdjson(legacySourcePath);
    const classified = normalizeLegacyClassification(classifyLegacyCanaryReceipts(legacyReceipts), legacyReceipts);
    const derivedClassificationCounts = countBy(classified.byIndex, (item) => item);
    const rowClassificationCounts = countBy(candidate.rows ?? [], (item) => item.classification);
    if (
      candidate.sourceReceiptCount !== 60
      || legacyReceipts.length !== 60
      || candidate.sourceReceiptFileDigest !== sha256(readFileSync(legacySourcePath))
      || candidate.legacyRawShapeUnobservable !== true
      || candidate.rawResponseAvailableCount !== 0
      || candidate.returnedModelIdentityVerifiable !== false
      || candidate.annotationResponseCount !== 1
      || candidate.annotationCount !== 4
      || !Array.isArray(candidate.rows)
      || candidate.rows.length !== 60
      || candidate.rows.filter((row) => row.citationCount > 0).length !== candidate.annotationResponseCount
      || sum(candidate.rows.map((row) => row.citationCount)) !== candidate.annotationCount
      || canonicalJson(candidate.classificationCounts) !== canonicalJson(EXPECTED_LEGACY_CLASSIFICATION_COUNTS)
      || canonicalJson(derivedClassificationCounts) !== canonicalJson(EXPECTED_LEGACY_CLASSIFICATION_COUNTS)
      || canonicalJson(rowClassificationCounts) !== canonicalJson(EXPECTED_LEGACY_CLASSIFICATION_COUNTS)
      || candidate.rows.some((row, index) => (
        row.ordinal !== index + 1
        || row.sourceReceiptDigest !== safeDigest(legacyReceipts[index]?.receiptDigest)
        || row.citationCount !== (Array.isArray(legacyReceipts[index]?.citations) ? legacyReceipts[index].citations.length : 0)
      ))
    ) {
      throw new Error("v2b2_response_shape_matrix_contract_invalid");
    }
    responseShapeMatrix = candidate;
    responseShapeMatrixVerified = true;
  } catch (error) {
    issues.push(errorMessage(error, "v2b2_response_shape_matrix_unverifiable"));
  }
  try {
    const candidate = readJson(join(privateStore, V2B2_PRIVATE_FILES.benchmarkManifest));
    assertV2B2BenchmarkManifest(candidate, binding.parent, binding.canary, options);
    if (buildV2B2BenchmarkPhysicalPlan(candidate).length !== 40) throw new Error("v2b2_benchmark_plan_count_invalid");
    benchmarkManifest = candidate;
    benchmarkManifestVerified = true;
  } catch (error) {
    issues.push(errorMessage(error, "v2b2_benchmark_manifest_unverifiable"));
  }
  if (existsSync(join(privateStore, V2B2_PRIVATE_FILES.benchmarkEvaluation))) {
    try {
      if (!benchmarkManifest) throw new Error("v2b2_benchmark_evaluation_without_valid_manifest");
      const candidate = readJson(join(privateStore, V2B2_PRIVATE_FILES.benchmarkEvaluation));
      assertDigest(candidate, "evaluationDigest", "v2b2_benchmark_evaluation_digest_invalid");
      if (
        candidate.schema !== "m2.v2.v2b2.terra-luna-benchmark-evaluation.v0.1"
        || candidate.privateOnly !== true
        || candidate.benchmarkManifestDigest !== benchmarkManifest.benchmarkManifestDigest
        || candidate.fullPilotAuthorized !== false
      ) throw new Error("v2b2_benchmark_evaluation_contract_invalid");
      const plan = buildV2B2BenchmarkPhysicalPlan(benchmarkManifest);
      const receipts = readNdjson(join(privateStore, V2B2_PRIVATE_FILES.benchmarkReceipts));
      const recomputed = evaluateV2B2Benchmark({
        manifest: benchmarkManifest,
        plan,
        receipts,
        sourceAllowlist,
        evaluatedAt: candidate.evaluatedAt,
      });
      if (canonicalJson(candidate) !== canonicalJson(recomputed)) throw new Error("v2b2_benchmark_receipt_evaluation_parity_failed");
      benchmarkEvaluation = candidate;
      benchmarkEvaluationVerified = true;
    } catch (error) {
      issues.push(errorMessage(error, "v2b2_benchmark_evaluation_unverifiable"));
    }
  } else {
    issues.push("v2b2_benchmark_evaluation_missing");
  }
  if (existsSync(join(privateStore, V2B2_PRIVATE_FILES.modelDecision))) {
    try {
      if (!benchmarkEvaluation) throw new Error("v2b2_model_decision_without_verified_evaluation");
      const candidate = readJson(join(privateStore, V2B2_PRIVATE_FILES.modelDecision));
      assertDigest(candidate, "decisionDigest", "v2b2_model_decision_digest_invalid");
      if (candidate.privateOnly !== true || candidate.immutable !== true || !["FROZEN", "BLOCKED"].includes(candidate.status)) {
        throw new Error("v2b2_model_decision_contract_invalid");
      }
      const recomputed = deriveV2B2ModelDecision(benchmarkEvaluation, { frozenAt: candidate.frozenAt });
      if (canonicalJson(candidate) !== canonicalJson(recomputed)) throw new Error("v2b2_model_decision_evaluation_parity_failed");
      modelDecision = candidate;
      modelDecisionVerified = true;
    } catch (error) {
      issues.push(errorMessage(error, "v2b2_model_decision_unverifiable"));
    }
  } else {
    issues.push("v2b2_model_decision_missing");
  }
  if (existsSync(join(privateStore, V2B2_PRIVATE_FILES.canaryManifest))) {
    try {
      if (!benchmarkManifest || !modelDecision) throw new Error("v2b2_canary_missing_parent_decision");
      const candidate = readJson(join(privateStore, V2B2_PRIVATE_FILES.canaryManifest));
      assertV2B2CanaryManifest(candidate, binding.parent, binding.canary, benchmarkManifest, modelDecision, options);
      if (buildV2B2CanaryPhysicalPlan(candidate).length !== 120) throw new Error("v2b2_canary_plan_count_invalid");
      canaryManifest = candidate;
      canaryManifestVerified = true;
    } catch (error) {
      issues.push(errorMessage(error, "v2b2_canary_manifest_unverifiable"));
    }
  }
  if (existsSync(join(privateStore, V2B2_PRIVATE_FILES.canaryEvaluation))) {
    try {
      if (!canaryManifest) throw new Error("v2b2_canary_evaluation_without_valid_manifest");
      const candidate = readJson(join(privateStore, V2B2_PRIVATE_FILES.canaryEvaluation));
      assertDigest(candidate, "evaluationDigest", "v2b2_canary_evaluation_digest_invalid");
      if (
        candidate.schema !== "m2.v2.v2b2.canary-v0.2-evaluation.v0.1"
        || candidate.privateOnly !== true
        || candidate.canaryV02ManifestDigest !== canaryManifest.canaryV02ManifestDigest
      ) throw new Error("v2b2_canary_evaluation_contract_invalid");
      for (const field of ["fullPilotAuthorized", "full160ExecutionAuthorizedByThisRun", "full160Executed"]) {
        if (candidate[field] !== false) throw new Error(`v2b2_${field}_must_be_false`);
      }
      const plan = buildV2B2CanaryPhysicalPlan(canaryManifest);
      const receipts = readNdjson(join(privateStore, V2B2_PRIVATE_FILES.canaryReceipts));
      const recomputed = evaluateV2B2Canary({
        manifest: canaryManifest,
        plan,
        receipts,
        sourceAllowlist,
        evaluatedAt: candidate.evaluatedAt,
      });
      if (canonicalJson(candidate) !== canonicalJson(recomputed)) throw new Error("v2b2_canary_receipt_evaluation_parity_failed");
      canaryEvaluation = candidate;
      canaryEvaluationVerified = true;
    } catch (error) {
      issues.push(errorMessage(error, "v2b2_canary_evaluation_unverifiable"));
    }
  }
  if (modelDecision?.status === "FROZEN" && (!canaryManifest || !canaryEvaluation)) {
    issues.push("v2b2_authorized_canary_rerun_incomplete");
  }
  const anyCanaryArtifact = [
    V2B2_PRIVATE_FILES.canaryManifest,
    V2B2_PRIVATE_FILES.canaryCache,
    V2B2_PRIVATE_FILES.canaryState,
    V2B2_PRIVATE_FILES.canaryReceipts,
    V2B2_PRIVATE_FILES.canaryEvaluation,
  ].some((name) => existsSync(join(privateStore, name)));
  if (modelDecision?.status === "BLOCKED" && anyCanaryArtifact) {
    issues.push("v2b2_canary_artifact_present_after_blocked_gate");
  }
  const resultPayload = {
    schema: "m2.v2.v2b2.verification.v0.1",
    privateOnly: true,
    verifiedAt: options.verifiedAt ?? new Date().toISOString(),
    parentManifestDigest: binding.parent.manifestDigest,
    canaryV01ManifestDigest: binding.canary.canaryManifestDigest,
    originalManifestAndSeedUnchanged: true,
    responseShapeMatrixVerified,
    benchmarkManifestVerified,
    benchmarkEvaluationVerified,
    modelDecisionVerified,
    canaryManifestVerified,
    canaryEvaluationVerified,
    benchmarkPhysicalRequestCap: 40,
    canaryPhysicalRequestCap: 120,
    retryCount: 0,
    fullPilotAuthorized: false,
    issues,
    allPassed: issues.length === 0,
  };
  const result = withDigest(resultPayload, "verificationDigest");
  atomicWriteJson(join(privateStore, V2B2_PRIVATE_FILES.verification), result);
  return result;
}

export function buildV2B2AggregateReport(root, options = {}) {
  const absoluteRoot = resolve(root);
  const privateStore = ensurePrivateStore(absoluteRoot, options);
  const binding = loadFrozenBinding(absoluteRoot, options);
  const matrix = readOptionalJson(join(privateStore, V2B2_PRIVATE_FILES.responseShapeMatrix));
  const benchmark = readOptionalJson(join(privateStore, V2B2_PRIVATE_FILES.benchmarkEvaluation));
  const decision = readOptionalJson(join(privateStore, V2B2_PRIVATE_FILES.modelDecision));
  const canary = readOptionalJson(join(privateStore, V2B2_PRIVATE_FILES.canaryEvaluation));
  const report = {
    schema: "m2.v2.v2b2.aggregate-report.v0.1",
    status: "not_for_formal_decision",
    terminalEvidenceAt: canary?.evaluatedAt ?? decision?.frozenAt ?? benchmark?.evaluatedAt ?? null,
    historicalCanaryReclassification: {
      providerConnectivity: "PASS",
      providerContractCompatibility: "FAIL",
      modelEvidenceQuality: "NOT_EVALUATED",
      relayDeclaredSuccessCount: (matrix?.classificationCounts?.local_strict_success ?? 0)
        + (matrix?.classificationCounts?.relay_success_local_schema_failure ?? 0),
      localStrictSuccessCount: matrix?.classificationCounts?.local_strict_success ?? 0,
      relaySuccessLocalContractFailureCount: matrix?.classificationCounts?.relay_success_local_schema_failure ?? 0,
      providerOrRequestFailureCount: matrix?.classificationCounts?.provider_or_request_failure ?? 0,
      annotationResponseCount: matrix?.annotationResponseCount ?? 0,
      annotationObjectCount: matrix?.annotationCount ?? 0,
      legacyRawShapeUnobservable: matrix?.legacyRawShapeUnobservable === true,
    },
    immutableBindings: {
      parentManifestDigest: binding.parent.manifestDigest,
      canaryV01ManifestDigest: binding.canary.canaryManifestDigest,
      sampleCount: 10,
      sampleChanged: false,
      seedChanged: false,
      failedSamplesReplaced: false,
    },
    benchmark: benchmark ? {
      providerConnectivity: publicBenchmarkConnectivity(benchmark.providerConnectivity),
      providerContractCompatibility: publicBenchmarkContractCompatibility(benchmark.providerContractCompatibility),
      modelEvidenceQuality: publicBenchmarkModelEvidenceQuality(benchmark.modelEvidenceQuality),
      qualityScope: BENCHMARK_QUALITY_SCOPE,
      sourceGovernance: publicSourceGovernance(benchmark.sourceGovernance, "benchmark"),
      modelAggregates: Object.fromEntries(V2B2_MODELS.map((model) => [model, publicModelMetrics(benchmark.models?.[model])])),
    } : { status: "NOT_RUN" },
    modelDecision: decision?.status === "FROZEN" ? {
      status: decision.status,
      defaultModel: requireV2B2ModelOrNull(decision.defaultModel, false),
      upgradeModel: requireV2B2ModelOrNull(decision.upgradeModel, true),
      qualityRuleVersion: requireExactString(
        decision.qualityRuleVersion,
        "m2-v2-v2b2-quality-first-lexicographic-v0.1",
        "v2b2_public_model_decision_quality_rule_invalid",
      ),
      canaryRerunAuthorized: decision.canaryRerunAuthorized === true,
    } : {
      status: decision?.status ?? "NOT_FROZEN",
      defaultModel: null,
      upgradeModel: null,
      canaryRerunAuthorized: false,
      blockers: publicDecisionBlockers(decision?.blockers),
    },
    canaryV02: canary ? {
      providerConnectivity: publicCanaryConnectivity(canary.providerConnectivity),
      providerContractCompatibility: publicCanaryContractCompatibility(canary.providerContractCompatibility),
      modelEvidenceQuality: publicCanaryModelEvidenceQuality(canary.modelEvidenceQuality),
      sourceGovernance: publicSourceGovernance(canary.sourceGovernance, "canary"),
      qualityScope: BENCHMARK_QUALITY_SCOPE,
      canaryTechnicalStatus: requireEnum(canary.canaryTechnicalStatus, ["TECHNICAL_PASS", "TECHNICAL_FAIL"], "v2b2_public_canary_status_invalid"),
    } : { status: "NOT_RUN" },
    boundaries: { ...V2B2_BOUNDARIES },
  };
  assertPublicSanitized(report);
  return report;
}

export function deriveV2B2PublicReportBundle(aggregate, options = {}) {
  assertPublicSanitized(aggregate);
  assertV2B2PublicAggregateContract(aggregate);
  if (aggregate?.benchmark?.status === "NOT_RUN" || !aggregate?.benchmark?.providerConnectivity) {
    throw new Error("v2b2_public_report_benchmark_not_complete");
  }
  if (!["FROZEN", "BLOCKED"].includes(aggregate?.modelDecision?.status)) {
    throw new Error("v2b2_public_report_model_decision_not_terminal");
  }
  if (aggregate.modelDecision.status === "FROZEN" && aggregate?.canaryV02?.status === "NOT_RUN") {
    throw new Error("v2b2_public_report_authorized_canary_not_complete");
  }
  if (aggregate.modelDecision.status === "FROZEN" && aggregate.modelDecision.canaryRerunAuthorized !== true) {
    throw new Error("v2b2_public_report_frozen_decision_not_canary_authorized");
  }
  if (aggregate.modelDecision.status === "BLOCKED" && aggregate?.canaryV02?.status !== "NOT_RUN") {
    throw new Error("v2b2_public_report_blocked_decision_has_canary");
  }
  if (canonicalJson(aggregate.boundaries) !== canonicalJson(V2B2_BOUNDARIES)) {
    throw new Error("v2b2_public_report_boundaries_invalid");
  }
  const generatedAt = options.generatedAt ?? aggregate.terminalEvidenceAt;
  if (typeof generatedAt !== "string" || !Number.isFinite(Date.parse(generatedAt))) {
    throw new Error("v2b2_public_report_terminal_evidence_timestamp_missing");
  }
  const common = {
    status: "not_for_formal_decision",
    generatedAt,
    immutableBindings: aggregate.immutableBindings,
    boundaries: aggregate.boundaries,
  };
  const remediation = {
    schema: "m2.v2.v2b2.relay-remediation-summary.v0.1",
    ...common,
    historicalCanaryReclassification: aggregate.historicalCanaryReclassification,
    adapterContract: {
      adapterVersion: V2B2_ADAPTER_VERSION,
      promptVersion: V2B2_PROMPT_VERSION,
      schemaVersion: V2B2_SCHEMA_VERSION,
      searchAndExtractionSeparated: true,
      searchMaximumOutputTokens: SEARCH_MAX_OUTPUT_TOKENS,
      extractionMaximumOutputTokens: EXTRACTION_MAX_OUTPUT_TOKENS,
      automaticRetryCount: 0,
      citationJoin: "citation_id_plus_bounded_span_claim_support",
      requestedReturnedModelBindingRequired: true,
      rawResponsePersisted: false,
    },
    benchmarkGate: {
      providerConnectivity: aggregate.benchmark.providerConnectivity,
      providerContractCompatibility: aggregate.benchmark.providerContractCompatibility,
      modelEvidenceQuality: aggregate.benchmark.modelEvidenceQuality,
      qualityScope: aggregate.benchmark.qualityScope,
    },
  };
  const benchmark = {
    schema: "m2.v2.v2b2.terra-luna-fair-benchmark.v0.1",
    ...common,
    fairness: {
      sameFrozenTenWorks: true,
      sameSeed: true,
      failedSamplesReplaced: false,
      firstModelOrderBalanced: "5/5",
      physicalRequestCap: 40,
      automaticRetryCount: 0,
    },
    result: aggregate.benchmark,
  };
  const routing = {
    schema: "m2.v2.v2b2.model-routing-decision.v0.1",
    ...common,
    decision: aggregate.modelDecision,
    policy: {
      qualityFirst: true,
      upgradeMinimumComplementaryWins: 2,
      upgradeMayAddErrors: false,
      telemetryOnlyBreaksQualityTies: true,
    },
  };
  const canaryExecuted = aggregate?.canaryV02?.status !== "NOT_RUN";
  const canary = {
    schema: "m2.v2.v2b2.canary-rerun.v0.2",
    ...common,
    executed: canaryExecuted,
    executionBasis: canaryExecuted ? "compatibility_and_model_gates_passed" : "benchmark_gate_blocked",
    result: aggregate.canaryV02,
    originalFixedTenWorksReused: true,
    originalSixtyLogicalTasksReused: canaryExecuted,
    physicalRequestCap: 120,
    automaticRetryCount: 0,
  };
  const terminalStatus = aggregate.modelDecision.status === "BLOCKED"
    ? "STOPPED_BENCHMARK_GATE_BLOCKED"
    : aggregate.canaryV02.canaryTechnicalStatus === "TECHNICAL_PASS"
      ? "STOPPED_CANARY_TECHNICAL_PASS_FULL_PILOT_UNAUTHORIZED"
      : "STOPPED_CANARY_TECHNICAL_FAIL";
  const terminal = {
    schema: "m2.v2.v2b2.terminal-decision.v0.1",
    ...common,
    terminalStatus,
    benchmarkGate: {
      providerConnectivity: aggregate.benchmark.providerConnectivity,
      providerContractCompatibility: aggregate.benchmark.providerContractCompatibility,
      modelEvidenceQuality: aggregate.benchmark.modelEvidenceQuality,
      qualityScope: aggregate.benchmark.qualityScope,
      sourceGovernance: aggregate.benchmark.sourceGovernance,
    },
    modelRouting: aggregate.modelDecision,
    canaryOutcome: {
      executed: canaryExecuted,
      technicalStatus: canaryExecuted ? aggregate.canaryV02.canaryTechnicalStatus : "NOT_RUN_GATE_BLOCKED",
      providerConnectivity: canaryExecuted ? aggregate.canaryV02.providerConnectivity : null,
      providerContractCompatibility: canaryExecuted ? aggregate.canaryV02.providerContractCompatibility : null,
      modelEvidenceQuality: canaryExecuted ? aggregate.canaryV02.modelEvidenceQuality : null,
      sourceGovernance: canaryExecuted ? aggregate.canaryV02.sourceGovernance : null,
      qualityScope: canaryExecuted ? aggregate.canaryV02.qualityScope : null,
    },
    fullPilotAuthorized: false,
    nextStep: "stop_no_full_160_no_v2c_v2d_c4_m3_release",
  };
  const bundle = { remediation, benchmark, routing, canary, terminal };
  assertPublicSanitized(bundle);
  return bundle;
}

export function writeV2B2PublicReports(root, options = {}) {
  const absoluteRoot = resolve(root);
  const verification = verifyV2B2(absoluteRoot, options);
  if (verification.allPassed !== true) {
    throw new Error(`v2b2_public_report_verification_failed:${verification.issues.join(",")}`);
  }
  const aggregate = buildV2B2AggregateReport(absoluteRoot, options);
  const bundle = deriveV2B2PublicReportBundle(aggregate, options);
  const markdown = {
    remediation: renderRemediationMarkdown(bundle.remediation),
    benchmark: renderBenchmarkMarkdown(bundle.benchmark),
    routing: renderRoutingMarkdown(bundle.routing),
    canary: renderCanaryMarkdown(bundle.canary),
    terminal: renderTerminalMarkdown(bundle.terminal),
  };
  for (const value of Object.values(bundle)) assertPublicSanitized(value);
  for (const value of Object.values(markdown)) assertV2B2PublicMarkdownSafe(value);
  const documents = [
    [V2B2_PUBLIC_REPORTS.remediationJson, `${JSON.stringify(bundle.remediation, null, 2)}\n`],
    [V2B2_PUBLIC_REPORTS.benchmarkJson, `${JSON.stringify(bundle.benchmark, null, 2)}\n`],
    [V2B2_PUBLIC_REPORTS.routingJson, `${JSON.stringify(bundle.routing, null, 2)}\n`],
    [V2B2_PUBLIC_REPORTS.canaryJson, `${JSON.stringify(bundle.canary, null, 2)}\n`],
    [V2B2_PUBLIC_REPORTS.terminalJson, `${JSON.stringify(bundle.terminal, null, 2)}\n`],
    [V2B2_PUBLIC_REPORTS.remediationMarkdown, markdown.remediation],
    [V2B2_PUBLIC_REPORTS.benchmarkMarkdown, markdown.benchmark],
    [V2B2_PUBLIC_REPORTS.routingMarkdown, markdown.routing],
    [V2B2_PUBLIC_REPORTS.canaryMarkdown, markdown.canary],
    [V2B2_PUBLIC_REPORTS.terminalMarkdown, markdown.terminal],
  ].map(([relative, value]) => [join(absoluteRoot, relative), value]);
  atomicWriteBundle(documents);
  return { aggregate, bundle, markdown, publicReports: V2B2_PUBLIC_REPORTS };
}

function renderRemediationMarkdown(value) {
  const historical = value.historicalCanaryReclassification;
  return `# M2 v2 V2-B.2 Relay Remediation Summary v0.1

- status: \`${value.status}\`
- provider connectivity: \`${historical.providerConnectivity}\` (${historical.relayDeclaredSuccessCount}/60)
- provider contract compatibility: \`${historical.providerContractCompatibility}\` (${historical.localStrictSuccessCount}/60 locally strict)
- model evidence quality: \`${historical.modelEvidenceQuality}\`
- annotation-bearing responses observed: ${historical.annotationResponseCount}
- normalized annotation objects observed: ${historical.annotationObjectCount}
- legacy raw response shape observable: \`${historical.legacyRawShapeUnobservable ? "false" : "true"}\`
- search/extraction separated: \`${value.adapterContract.searchAndExtractionSeparated}\`
- output token caps: search ${value.adapterContract.searchMaximumOutputTokens}, extraction ${value.adapterContract.extractionMaximumOutputTokens}
- automatic retries: ${value.adapterContract.automaticRetryCount}
- full pilot authorized: \`false\`

37 relay-success/local-schema failures are contract failures, not evidence that Terra search quality failed. Empty source governance acceptance cannot be interpreted as no external signal.
`;
}

function renderBenchmarkMarkdown(value) {
  const models = value.result.modelAggregates ?? {};
  const rows = V2B2_MODELS.map((model) => {
    const metric = models[model] ?? {};
    return `| ${model} | ${formatMetric(metric.searchContractRate)} | ${formatMetric(metric.extractionContractRate)} | ${metric.validEvidenceWorkCount ?? 0} | ${metric.claimSupportUnverifiedCount ?? 0} | ${metric.entityIdentityErrorCount ?? 0} | ${metric.totalTokens ?? "n/a"} | ${metric.latencyP90Ms ?? "n/a"} |`;
  }).join("\n");
  return `# M2 v2 V2-B.2 Terra/Luna Fair Benchmark v0.1

- status: \`${value.status}\`
- provider connectivity: \`${value.result.providerConnectivity.status}\`
- provider contract compatibility: \`${value.result.providerContractCompatibility.status}\`
- model evidence quality: \`${value.result.modelEvidenceQuality.status}\`
- quality scope: ${value.result.qualityScope}
- frozen same-work benchmark: 10 works, 20 model arms, at most 40 physical requests, zero retries

| model | search contract | extraction contract | valid works | unsupported claim spans | entity errors | total tokens | p90 ms |
|---|---:|---:|---:|---:|---:|---:|---:|
${rows}

Source allowlist governance is evaluated separately and cannot be used to relabel model quality. All results remain \`not_for_formal_decision\`.
`;
}

function renderRoutingMarkdown(value) {
  const decision = value.decision;
  return `# M2 v2 V2-B.2 Model Routing Decision v0.1

- status: \`${decision.status}\`
- default model: \`${decision.defaultModel ?? "null"}\`
- upgrade model: \`${decision.upgradeModel ?? "null"}\`
- canary rerun authorized: \`${decision.canaryRerunAuthorized}\`
- blockers: ${(decision.blockers ?? []).map((item) => `\`${item}\``).join(", ") || "none"}
- full pilot authorized: \`false\`

Selection is quality-first. Token and latency may only break a quality tie, and missing telemetry never counts as zero.
`;
}

function renderCanaryMarkdown(value) {
  return `# M2 v2 V2-B.2 Canary Rerun v0.2

- executed: \`${value.executed}\`
- execution basis: \`${value.executionBasis}\`
- fixed 10-work sample reused: \`${value.originalFixedTenWorksReused}\`
- original 60 logical tasks reused: \`${value.originalSixtyLogicalTasksReused}\`
- physical request cap: ${value.physicalRequestCap}
- automatic retries: ${value.automaticRetryCount}
- technical status: \`${value.result.canaryTechnicalStatus ?? value.result.status}\`
- quality scope: ${value.result.qualityScope ?? "not evaluated"}
- full pilot authorized: \`false\`
`;
}

function renderTerminalMarkdown(value) {
  return `# M2 v2 V2-B.2 Terminal Decision v0.1

- terminal status: \`${value.terminalStatus}\`
- benchmark provider connectivity: \`${value.benchmarkGate.providerConnectivity.status}\`
- benchmark provider contract compatibility: \`${value.benchmarkGate.providerContractCompatibility.status}\`
- benchmark model evidence quality: \`${value.benchmarkGate.modelEvidenceQuality.status}\`
- benchmark quality scope: ${value.benchmarkGate.qualityScope}
- default model: \`${value.modelRouting.defaultModel ?? "null"}\`
- upgrade model: \`${value.modelRouting.upgradeModel ?? "null"}\`
- canary executed: \`${value.canaryOutcome.executed}\`
- canary technical status: \`${value.canaryOutcome.technicalStatus}\`
- canary quality scope: ${value.canaryOutcome.qualityScope ?? "not evaluated"}
- full pilot authorized: \`false\`
- next step: \`${value.nextStep}\`

No full 160, V2-C/V2-D, income-model training, B4 change, final holdout, C4/M3, release, or PR merge is authorized by this result.
`;
}

function formatMetric(value) {
  return Number.isFinite(value) ? Number(value).toFixed(4) : "n/a";
}

function freezeBenchmarkManifest(privateStore, binding, options) {
  const path = join(privateStore, V2B2_PRIVATE_FILES.benchmarkManifest);
  if (existsSync(path)) {
    const existing = readJson(path);
    assertV2B2BenchmarkManifest(existing, binding.parent, binding.canary, options);
    return { manifest: existing, created: false };
  }
  const manifest = deriveV2B2BenchmarkManifest(binding.parent, binding.canary, options);
  atomicWriteJson(path, manifest);
  return { manifest, created: true };
}

function freezeCanaryManifest(privateStore, binding, benchmarkManifest, modelDecision, options) {
  const path = join(privateStore, V2B2_PRIVATE_FILES.canaryManifest);
  if (existsSync(path)) {
    const existing = readJson(path);
    assertV2B2CanaryManifest(existing, binding.parent, binding.canary, benchmarkManifest, modelDecision, options);
    return { manifest: existing, created: false };
  }
  const manifest = deriveV2B2CanaryManifest(binding.parent, binding.canary, benchmarkManifest, modelDecision, options);
  atomicWriteJson(path, manifest);
  return { manifest, created: true };
}

function loadFrozenBinding(root, options = {}) {
  const parent = options.parentManifest ?? readJson(join(root, options.parentManifestRelative ?? V2B2_PARENT_MANIFEST_RELATIVE));
  const canary = options.canaryManifest ?? readJson(join(root, options.canaryManifestRelative ?? V2B2_CANARY_V01_MANIFEST_RELATIVE));
  assertFrozenBinding(parent, canary, options);
  return { parent, canary };
}

function assertFrozenBinding(parent, canary, options = {}) {
  const expectedParentManifestDigest = options.expectedParentManifestDigest ?? EXPECTED_PARENT_MANIFEST_DIGEST;
  assertCanaryManifest(canary, parent, { expectedParentManifestDigest });
  if (parent.manifestDigest !== expectedParentManifestDigest) throw new Error("v2b2_parent_manifest_binding_mismatch");
  if (parent.immutable !== true || parent.status !== "frozen_before_retrieval" || parent.sample.length !== 160) {
    throw new Error("v2b2_parent_manifest_not_frozen_160");
  }
  if (canary.immutable !== true || canary.sample.length !== 10 || canary.seed !== "20260717:canary-v0.1") {
    throw new Error("v2b2_canary_manifest_not_fixed_10");
  }
  return true;
}

function buildSearchPayload(item) {
  return buildV2B2SearchPayload({
    model: item.model,
    workTitle: item.title,
    authorByline: item.author,
    sourceType: item.sourceType,
    queryIntent: item.queryText,
    maxOutputTokens: SEARCH_MAX_OUTPUT_TOKENS,
    promptVersion: V2B2_PROMPT_VERSION,
  });
}

function buildExtractionPayload(item, priorSearchReceipt) {
  return buildV2B2ExtractionPayload({
    model: item.model,
    workTitle: item.title,
    authorByline: item.author,
    sourceType: item.sourceType,
    queryIntent: item.queryText,
    search: priorSearchReceipt?.normalizedResponse,
    citationRegistry: priorSearchReceipt?.normalizedResponse?.citationRegistry
      ?? priorSearchReceipt?.normalizedResponse?.citations
      ?? [],
    maxOutputTokens: EXTRACTION_MAX_OUTPUT_TOKENS,
    promptVersion: V2B2_PROMPT_VERSION,
    schemaVersion: V2B2_SCHEMA_VERSION,
  });
}

async function dispatchRelayResponse({ fetchImpl, baseUrl, approvedHost, apiKey, payload, timeoutMs }) {
  rejectRetiredProviderRoute();
  const transport = bindProviderTransport({ baseUrl, approvedHost });
  assertResponsesRetention(payload);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  const capturedAt = new Date().toISOString();
  let response = null;
  let bytes = Buffer.alloc(0);
  let json = null;
  let transportError = null;
  try {
    response = await fetchImpl(transport.endpointUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "m2-v2-v2b2-relay-remediation/0.1",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
      redirect: transport.redirect,
    });
    assertNoProviderRedirect(response, transport.endpointUrl);
    bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length <= RESPONSE_LIMIT_BYTES) {
      try {
        json = JSON.parse(bytes.toString("utf8"));
      } catch {
        json = null;
      }
    }
  } catch (error) {
    transportError = { name: safeErrorToken(error?.name), code: safeErrorToken(error?.code ?? error?.cause?.code) };
  } finally {
    clearTimeout(timeout);
  }
  const httpStatus = response?.status ?? null;
  const contentType = response?.headers?.get?.("content-type") ?? null;
  const connectivityPassed = response?.ok === true && json && typeof json === "object" && !Array.isArray(json);
  const status = transportError
    ? "transport_error"
    : !response?.ok
      ? "http_error"
      : bytes.length > RESPONSE_LIMIT_BYTES
        ? "response_oversize"
        : !json
          ? contentTypeClass(contentType) === "html" ? "html_error" : "non_json_error"
          : "provider_response_received";
  return {
    json,
    httpStatus,
    contentType,
    rawByteLength: bytes.length,
    responseDigest: bytes.length ? sha256(bytes.toString("base64")) : null,
    parseStatus: json ? "json" : bytes.length ? "non_json" : "no_body",
    connectivityPassed: Boolean(connectivityPassed),
    status,
    transportError,
    latencyMs: Math.round(performance.now() - started),
    capturedAt,
  };
}

function normalizeCoreContract(normalized, stage, item = {}) {
  const validation = stage === "extraction"
    ? validateV2B2StructuredOutput(
        normalized?.structuredOutput
          ?? normalized?.structured
          ?? normalized?.value
          ?? normalized?.output
      )
    : null;
  const citations = normalized?.citationRegistry ?? normalized?.citations ?? [];
  const structured = normalized?.structuredOutput ?? normalized?.structured ?? normalized?.value ?? normalized?.output ?? null;
  const explicitValid = normalized?.valid === true
    || normalized?.contractValid === true
    || normalized?.status === "success";
  const valid = stage === "search"
    ? explicitValid && Array.isArray(citations)
    : explicitValid && (validation?.valid === true || normalized?.structuredValid === true);
  const candidates = structured?.evidenceCandidates ?? normalized?.evidenceCandidates ?? [];
  const identities = [structured?.workIdentity?.status, structured?.authorIdentity?.status];
  const expectedTitle = normalizeEntityText(item.title);
  const expectedAuthor = normalizeEntityText(item.author);
  let derivedEntityIdentityErrorCount = 0;
  if (stage === "extraction" && ["high", "medium"].includes(structured?.workIdentity?.status)) {
    if (normalizeEntityText(structured?.workIdentity?.matchedTitle) !== expectedTitle) derivedEntityIdentityErrorCount += 1;
    if (normalizeEntityText(structured?.workIdentity?.matchedAuthor) !== expectedAuthor) derivedEntityIdentityErrorCount += 1;
    if (structured?.authorWorkRelationshipConfirmed !== true) derivedEntityIdentityErrorCount += 1;
  }
  if (stage === "extraction" && ["high", "medium"].includes(structured?.authorIdentity?.status)) {
    if (normalizeEntityText(structured?.authorIdentity?.matchedAuthor) !== expectedAuthor) derivedEntityIdentityErrorCount += 1;
  }
  const identityStatusResolved = identities.every((identity) => ["high", "medium"].includes(identity));
  const identityCitationBound = (structured?.workIdentity?.citationIds?.length ?? 0) > 0
    && (structured?.authorIdentity?.citationIds?.length ?? 0) > 0;
  const entityResolved = stage === "extraction"
    && identityStatusResolved
    && derivedEntityIdentityErrorCount === 0
    && identityCitationBound;
  const usableCandidates = entityResolved && Array.isArray(candidates) ? candidates : [];
  return {
    valid,
    structuredValid: stage === "extraction" ? Boolean(validation?.valid ?? normalized?.structuredValid) : false,
    issues: unique([
      ...(normalized?.issues ?? normalized?.validationIssues ?? []),
      ...(validation?.issues ?? []),
    ].map(String)),
    citationCount: Array.isArray(citations) ? citations.length : 0,
    entityResolved,
    entityIdentityErrorCount: finiteNonnegative(
      normalized?.entityIdentityErrorCount
        ?? normalized?.quality?.entityIdentityErrorCount
    ) ?? derivedEntityIdentityErrorCount,
    usableEvidenceCount: usableCandidates.length,
    availableAtCount: stage === "extraction"
      ? usableCandidates.filter((candidate) => validTimestamp(candidate?.availableAt)).length
      : 0,
    eventTimeCount: stage === "extraction"
      ? usableCandidates.filter((candidate) => validTimestamp(candidate?.eventTime)).length
      : 0,
    usage: normalizeUsage(normalized?.usage),
  };
}

function normalizeLineage(lineage) {
  const unsupportedCount = finiteNonnegative(
    lineage?.unsupportedReferenceCount
      ?? lineage?.unknownCitationIdCount
      ?? lineage?.unboundCandidateCount
  ) ?? 0;
  const valid = lineage?.valid === true
    || lineage?.allCandidatesBound === true
    || (unsupportedCount === 0 && lineage?.status === "success");
  return {
    valid,
    allCandidatesBound: Boolean(lineage?.allCandidatesBound ?? valid),
    unsupportedReferenceCount: unsupportedCount,
    boundCandidateCount: finiteNonnegative(lineage?.boundCandidateCount) ?? 0,
    supportedCandidateCount: finiteNonnegative(lineage?.supportedCandidateCount) ?? 0,
    claimSupportUnverifiedCount: finiteNonnegative(lineage?.claimSupportUnverifiedCount) ?? 0,
    issueCodes: unique((lineage?.issues ?? lineage?.issueCodes ?? []).map(String)),
  };
}

function normalizeLegacyClassification(value, receipts) {
  if (Array.isArray(value)) {
    return { byIndex: value.map((item) => typeof item === "string" ? item : item?.classification ?? item?.category) };
  }
  if (Array.isArray(value?.rows)) {
    return { byIndex: value.rows.map((item) => item?.classification ?? item?.category) };
  }
  if (Array.isArray(value?.classifications)) return { byIndex: value.classifications };
  return { byIndex: receipts.map(classifyLegacyFallback) };
}

function classifyLegacyFallback(receipt) {
  if (receipt?.status !== "success") return "provider_or_request_failure";
  const issues = receipt?.semanticChecks?.validationIssues ?? [];
  if (receipt?.semanticChecks?.strictJsonValid === true && issues.length === 0) return "local_strict_success";
  return "relay_success_local_schema_failure";
}

function physicalRequestKey(input) {
  const value = buildV2B2PhysicalRequestKey({
    ...input,
    adapterVersion: V2B2_ADAPTER_VERSION,
    promptVersion: V2B2_PROMPT_VERSION,
    schemaVersion: V2B2_SCHEMA_VERSION,
  });
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) throw new Error("v2b2_physical_request_key_invalid");
  return value;
}

function assertPhysicalPlan(plan, options = {}) {
  if (!Array.isArray(plan)) throw new Error("v2b2_physical_plan_invalid");
  if (Number.isInteger(options.expectedCount) && plan.length !== options.expectedCount) throw new Error("v2b2_physical_plan_count_invalid");
  if (Number.isInteger(options.physicalRequestCap) && plan.length > options.physicalRequestCap) throw new Error("v2b2_physical_plan_cap_exceeded");
  if (new Set(plan.map((item) => item.requestKey)).size !== plan.length) throw new Error("v2b2_physical_plan_key_collision");
  for (const item of plan) {
    if (!['search', 'extraction'].includes(item.stage)) throw new Error("v2b2_physical_plan_stage_invalid");
    if (options.models && !options.models.includes(item.model)) throw new Error("v2b2_physical_plan_model_invalid");
    if (!/^[a-f0-9]{64}$/u.test(item.requestKey)) throw new Error("v2b2_physical_plan_request_key_invalid");
  }
  for (const item of plan.filter((entry) => entry.stage === "extraction")) {
    const search = plan.find((entry) => entry.stage === "search" && entry.logicalTaskKey === item.logicalTaskKey && entry.model === item.model);
    if (!search) throw new Error("v2b2_extraction_search_dependency_missing");
  }
  return true;
}

function assertExecutionContainerBinding(cache, state, { namespace, manifestDigest, physicalRequestCap, plan, runtimeBindingDigest }) {
  if (cache?.schema !== "m2.v2.v2b2.physical-cache.v0.1" || cache?.privateOnly !== true) throw new Error("v2b2_cache_schema_invalid");
  if (cache.namespace !== namespace || cache.manifestDigest !== manifestDigest) throw new Error("v2b2_cache_binding_mismatch");
  if (cache.adapterVersion !== V2B2_ADAPTER_VERSION || cache.retryCount !== 0) throw new Error("v2b2_cache_version_or_retry_invalid");
  if (cache.runtimeBindingDigest !== runtimeBindingDigest) throw new Error("v2b2_cache_relay_binding_mismatch");
  if (state?.schema !== "m2.v2.v2b2.execution-state.v0.1" || state?.privateOnly !== true) throw new Error("v2b2_state_schema_invalid");
  if (state.namespace !== namespace || state.manifestDigest !== manifestDigest) throw new Error("v2b2_state_binding_mismatch");
  if (state.runtimeBindingDigest !== runtimeBindingDigest) throw new Error("v2b2_state_relay_binding_mismatch");
  if (state.physicalRequestCap !== physicalRequestCap || state.plannedPhysicalRequestCount !== plan.length || state.retryCount !== 0) {
    throw new Error("v2b2_state_budget_binding_mismatch");
  }
  if (state.fullPilotAuthorized !== false) throw new Error("v2b2_full_pilot_must_remain_unauthorized");
}

function assertCompletedExecutionParity({ cache, state, plan, receiptsPath, manifestDigest, runtimeBindingDigest }) {
  const cacheKeys = Object.keys(cache.entries);
  if (
    state.completedPhysicalReceiptCount !== plan.length
    || state.cacheEntryCount !== plan.length
    || cacheKeys.length !== plan.length
    || Object.keys(state.reservations ?? {}).length !== plan.length
    || !existsSync(receiptsPath)
  ) throw new Error("v2b2_completed_state_cache_parity_invalid");
  const receipts = plan.map((item) => {
    const receipt = cache.entries[item.requestKey];
    if (!receipt) throw new Error("v2b2_completed_state_cache_parity_invalid");
    assertPhysicalReceipt(receipt, item, manifestDigest, runtimeBindingDigest);
    const reservation = state.reservations[item.requestKey];
    if (
      !reservation
      || reservation.receiptDigest !== receipt.receiptDigest
      || !["completed", "blocked_dependency", "indeterminate_after_crash"].includes(reservation.status)
    ) throw new Error("v2b2_completed_state_reservation_parity_invalid");
    return receipt;
  });
  if (state.dispatchedPhysicalRequestCount !== receipts.filter((item) => item.dispatched === true).length) {
    throw new Error("v2b2_completed_state_dispatch_count_invalid");
  }
  const persisted = readNdjson(receiptsPath);
  if (canonicalJson(persisted) !== canonicalJson(receipts)) throw new Error("v2b2_completed_receipt_file_parity_invalid");
  return receipts;
}

function finalizeSuppliedReceipt(value, item, manifestDigest, capturedAt, runtimeBindingDigest) {
  const payload = {
    schema: "m2.v2.v2b2.physical-receipt.v0.1",
    privateOnly: true,
    manifestDigest,
    runtimeBindingDigest,
    requestKey: item.requestKey,
    logicalTaskKey: item.logicalTaskKey,
    workReference: item.workReference,
    identityDigest: item.identityDigest,
    runKind: item.runKind,
    queryId: item.queryId,
    stage: item.stage,
    requestedModelId: item.model,
    returnedModelId: safeModelId(value?.returnedModelId),
    modelBindingVerified: value?.modelBindingVerified === true,
    adapterVersion: V2B2_ADAPTER_VERSION,
    promptVersion: V2B2_PROMPT_VERSION,
    schemaVersion: V2B2_SCHEMA_VERSION,
    dispatched: value?.dispatched !== false,
    retryCount: 0,
    httpStatus: Number.isInteger(value?.httpStatus) ? value.httpStatus : null,
    providerConnectivityPassed: value?.providerConnectivityPassed === true,
    providerContractCompatible: value?.providerContractCompatible === true,
    status: safeStatus(value?.status),
    responseContentTypeClass: safeStatus(value?.responseContentTypeClass),
    responseDigest: safeDigest(value?.responseDigest),
    responseByteLength: finiteNonnegative(value?.responseByteLength),
    responseShapeProfile: value?.responseShapeProfile ?? null,
    normalizedResponse: value?.normalizedResponse ?? null,
    lineage: value?.lineage ?? null,
    structuredValid: value?.structuredValid === true,
    validationIssues: unique((value?.validationIssues ?? []).map(String)),
    citationCount: finiteNonnegative(value?.citationCount) ?? 0,
    entityResolved: value?.entityResolved === true,
    entityIdentityErrorCount: finiteNonnegative(value?.entityIdentityErrorCount) ?? 0,
    claimSupportUnverifiedCount: finiteNonnegative(value?.claimSupportUnverifiedCount) ?? 0,
    usableEvidenceCount: finiteNonnegative(value?.usableEvidenceCount) ?? 0,
    availableAtCount: finiteNonnegative(value?.availableAtCount) ?? 0,
    eventTimeCount: finiteNonnegative(value?.eventTimeCount) ?? 0,
    usage: normalizeUsage(value?.usage),
    latencyMs: finiteNonnegative(value?.latencyMs),
    capturedAt: value?.capturedAt ?? capturedAt,
    rawResponsePersisted: false,
    authorizationHeaderPersisted: false,
    apiKeyPersisted: false,
    fullPilotAuthorized: false,
  };
  return withDigest(payload, "receiptDigest");
}

function assertPhysicalReceipt(receipt, item, manifestDigest, runtimeBindingDigest = null) {
  if (receipt?.schema !== "m2.v2.v2b2.physical-receipt.v0.1" || receipt?.privateOnly !== true) throw new Error("v2b2_physical_receipt_schema_invalid");
  if (receipt.manifestDigest !== manifestDigest || receipt.requestKey !== item.requestKey || receipt.logicalTaskKey !== item.logicalTaskKey) {
    throw new Error("v2b2_physical_receipt_task_binding_mismatch");
  }
  if (!/^[a-f0-9]{64}$/u.test(receipt.runtimeBindingDigest)) throw new Error("v2b2_physical_receipt_relay_binding_missing");
  if (runtimeBindingDigest && receipt.runtimeBindingDigest !== runtimeBindingDigest) throw new Error("v2b2_physical_receipt_relay_binding_mismatch");
  if (receipt.stage !== item.stage || receipt.requestedModelId !== item.model) throw new Error("v2b2_physical_receipt_model_stage_binding_mismatch");
  if (receipt.adapterVersion !== V2B2_ADAPTER_VERSION || receipt.promptVersion !== V2B2_PROMPT_VERSION || receipt.schemaVersion !== V2B2_SCHEMA_VERSION) {
    throw new Error("v2b2_physical_receipt_version_binding_mismatch");
  }
  if (receipt.retryCount !== 0 || receipt.fullPilotAuthorized !== false) throw new Error("v2b2_physical_receipt_retry_or_authorization_invalid");
  if (
    typeof receipt.dispatched !== "boolean"
    || typeof receipt.providerConnectivityPassed !== "boolean"
    || typeof receipt.providerContractCompatible !== "boolean"
    || typeof receipt.modelBindingVerified !== "boolean"
    || !isIsoTimestamp(receipt.capturedAt)
  ) throw new Error("v2b2_physical_receipt_observation_contract_invalid");
  if (!receipt.dispatched && (receipt.providerConnectivityPassed || receipt.providerContractCompatible || receipt.modelBindingVerified)) {
    throw new Error("v2b2_undispatched_receipt_cannot_observe_provider");
  }
  if (receipt.providerContractCompatible && !receipt.providerConnectivityPassed) {
    throw new Error("v2b2_contract_compatible_without_connectivity");
  }
  if (receipt.modelBindingVerified !== Boolean(receipt.returnedModelId && receipt.returnedModelId === receipt.requestedModelId)) {
    throw new Error("v2b2_physical_receipt_model_binding_flag_invalid");
  }
  if (receipt.rawResponsePersisted !== false || receipt.authorizationHeaderPersisted !== false || receipt.apiKeyPersisted !== false) {
    throw new Error("v2b2_physical_receipt_security_contract_invalid");
  }
  assertDigest(receipt, "receiptDigest", "v2b2_physical_receipt_digest_invalid");
  return true;
}

function findSearchRequestKey(plan, extractionItem) {
  const search = plan.find((item) => (
    item.stage === "search"
      && item.logicalTaskKey === extractionItem.logicalTaskKey
      && item.model === extractionItem.model
  ));
  if (!search) throw new Error("v2b2_search_dependency_not_found");
  return search.requestKey;
}

function searchReceiptAllowsExtraction(receipt) {
  return Boolean(
    receipt
      && receipt.stage === "search"
      && receipt.dispatched === true
      && receipt.providerConnectivityPassed === true
      && receipt.providerContractCompatible === true
      && receipt.modelBindingVerified === true
  );
}

function buildDependencyBlockedReceipt(item, manifestDigest, dependency, capturedAt, runtimeBindingDigest) {
  return finalizeSuppliedReceipt({
    returnedModelId: null,
    modelBindingVerified: false,
    dispatched: false,
    providerConnectivityPassed: false,
    providerContractCompatible: false,
    status: "blocked_search_dependency",
    validationIssues: [dependency ? `search_dependency_status:${safeStatus(dependency.status)}` : "search_dependency_missing"],
    capturedAt,
  }, item, manifestDigest, capturedAt, runtimeBindingDigest);
}

function buildIndeterminateReceipt(item, manifestDigest, reservation, capturedAt, runtimeBindingDigest) {
  return finalizeSuppliedReceipt({
    returnedModelId: null,
    modelBindingVerified: false,
    dispatched: false,
    providerConnectivityPassed: false,
    providerContractCompatible: false,
    status: "indeterminate_after_crash_no_retry",
    validationIssues: [`prior_reservation_ordinal:${Number(reservation?.ordinal) || 0}`],
    capturedAt,
  }, item, manifestDigest, capturedAt, runtimeBindingDigest);
}

function buildExecutorErrorReceipt(item, manifestDigest, error, capturedAt, runtimeBindingDigest) {
  return finalizeSuppliedReceipt({
    returnedModelId: null,
    modelBindingVerified: false,
    dispatched: true,
    providerConnectivityPassed: false,
    providerContractCompatible: false,
    status: "executor_error",
    validationIssues: [safeErrorToken(error?.message) ?? "executor_error"],
    capturedAt,
  }, item, manifestDigest, capturedAt, runtimeBindingDigest);
}

function reconcileReservationFromCache(state, item, receipt, reconciledAt) {
  const existing = state.reservations[item.requestKey];
  if (existing?.receiptDigest && existing.receiptDigest !== receipt.receiptDigest) throw new Error("v2b2_reservation_receipt_digest_mismatch");
  state.reservations[item.requestKey] = {
    ordinal: existing?.ordinal ?? Object.keys(state.reservations).length + 1,
    requestKey: item.requestKey,
    logicalTaskKey: item.logicalTaskKey,
    model: item.model,
    stage: item.stage,
    status: receipt.status === "indeterminate_after_crash_no_retry" ? "indeterminate_after_crash" : "completed",
    reservedAt: existing?.reservedAt ?? receipt.capturedAt,
    completedAt: existing?.completedAt ?? reconciledAt,
    receiptDigest: receipt.receiptDigest,
    retryCount: 0,
  };
}

function checkpointExecution(cachePath, statePath, receiptsPath, cache, state, plan, now) {
  const receipts = plan.map((item) => cache.entries[item.requestKey]).filter(Boolean);
  state.updatedAt = now();
  state.completedPhysicalReceiptCount = receipts.length;
  state.dispatchedPhysicalRequestCount = receipts.filter((item) => item.dispatched === true).length;
  state.cacheEntryCount = Object.keys(cache.entries).length;
  state.fullPilotAuthorized = false;
  const nextState = withReplacedDigest(state, "stateDigest");
  Object.assign(state, nextState);
  atomicWriteJson(cachePath, cache);
  atomicWriteNdjson(receiptsPath, receipts);
  atomicWriteJson(statePath, state);
}

function compareQualityFirst(left, right) {
  const comparisons = [
    [right.claimSupportUnverifiedCount, left.claimSupportUnverifiedCount],
    [right.unsupportedCitationReferenceCount, left.unsupportedCitationReferenceCount],
    [right.entityIdentityErrorCount, left.entityIdentityErrorCount],
    [right.validationIssueCount, left.validationIssueCount],
    [left.validEvidenceWorkCount, right.validEvidenceWorkCount],
    [left.entityResolvedWorkCount, right.entityResolvedWorkCount],
    [left.citationBoundEvidenceCount, right.citationBoundEvidenceCount],
    [higherScore(left.timestampCompleteness), higherScore(right.timestampCompleteness)],
    [left.endToEndSuccessCount, right.endToEndSuccessCount],
    [lowerScore(left.totalTokens), lowerScore(right.totalTokens)],
    [lowerScore(left.latencyP90Ms), lowerScore(right.latencyP90Ms)],
  ];
  for (const [leftValue, rightValue] of comparisons) {
    if (leftValue > rightValue) return 1;
    if (leftValue < rightValue) return -1;
  }
  return left.model === "gpt-5.6-luna" ? 1 : -1;
}

function lineageUnsupportedCount(lineage) {
  return finiteNonnegative(
    lineage?.unsupportedReferenceCount
      ?? lineage?.unknownCitationIdCount
      ?? lineage?.unboundCandidateCount
  ) ?? 0;
}

function resolveEvaluationTimestamp(supplied, receipts) {
  const timestamps = receipts.map((item) => {
    if (!isIsoTimestamp(item?.capturedAt)) throw new Error("v2b2_receipt_captured_at_invalid");
    return Date.parse(item.capturedAt);
  });
  if (!timestamps.length) throw new Error("v2b2_evaluation_receipts_empty");
  const derived = new Date(Math.max(...timestamps)).toISOString();
  if (supplied !== null && supplied !== undefined) {
    if (!isIsoTimestamp(supplied) || new Date(supplied).toISOString() !== derived) {
      throw new Error("v2b2_evaluated_at_not_receipt_bound");
    }
  }
  return derived;
}

function receiptSetDigest(receipts) {
  return sha256(receipts.map((item) => ({
    requestKey: item.requestKey,
    receiptDigest: item.receiptDigest,
  })));
}

function persistImmutableEvaluation(path, candidate, digestError, changedError) {
  if (!existsSync(path)) {
    atomicWriteJson(path, candidate);
    return candidate;
  }
  const existing = readJson(path);
  assertDigest(existing, "evaluationDigest", digestError);
  if (canonicalJson(existing) !== canonicalJson(candidate)) throw new Error(changedError);
  return existing;
}

function assertV2B2PublicAggregateContract(value) {
  assertExactObjectKeys(value, [
    "schema",
    "status",
    "terminalEvidenceAt",
    "historicalCanaryReclassification",
    "immutableBindings",
    "benchmark",
    "modelDecision",
    "canaryV02",
    "boundaries",
  ], "v2b2_public_aggregate_unknown_field");
  if (value?.schema !== "m2.v2.v2b2.aggregate-report.v0.1" || value?.status !== "not_for_formal_decision") {
    throw new Error("v2b2_public_aggregate_schema_invalid");
  }
  if (!isIsoTimestamp(value.terminalEvidenceAt)) throw new Error("v2b2_public_aggregate_terminal_time_invalid");
  const historical = value.historicalCanaryReclassification;
  assertExactObjectKeys(historical, [
    "providerConnectivity",
    "providerContractCompatibility",
    "modelEvidenceQuality",
    "relayDeclaredSuccessCount",
    "localStrictSuccessCount",
    "relaySuccessLocalContractFailureCount",
    "providerOrRequestFailureCount",
    "annotationResponseCount",
    "annotationObjectCount",
    "legacyRawShapeUnobservable",
  ], "v2b2_public_historical_unknown_field");
  if (
    historical?.providerConnectivity !== "PASS"
    || historical?.providerContractCompatibility !== "FAIL"
    || historical?.modelEvidenceQuality !== "NOT_EVALUATED"
    || historical?.relayDeclaredSuccessCount !== 49
    || historical?.localStrictSuccessCount !== 12
    || historical?.relaySuccessLocalContractFailureCount !== 37
    || historical?.providerOrRequestFailureCount !== 11
    || historical?.annotationResponseCount !== 1
    || historical?.annotationObjectCount !== 4
    || historical?.legacyRawShapeUnobservable !== true
  ) throw new Error("v2b2_public_aggregate_historical_reclassification_invalid");
  if (value.benchmark?.status !== "NOT_RUN") {
    assertExactObjectKeys(value.benchmark, [
      "providerConnectivity",
      "providerContractCompatibility",
      "modelEvidenceQuality",
      "qualityScope",
      "sourceGovernance",
      "modelAggregates",
    ], "v2b2_public_benchmark_unknown_field");
    if (value.benchmark?.qualityScope !== BENCHMARK_QUALITY_SCOPE) throw new Error("v2b2_public_aggregate_quality_scope_invalid");
    requireEnum(value.benchmark?.providerConnectivity?.status, ["PASS", "FAIL"], "v2b2_public_benchmark_connectivity_status_invalid");
    requireEnum(value.benchmark?.providerContractCompatibility?.status, ["PASS", "FAIL"], "v2b2_public_benchmark_contract_status_invalid");
    requireEnum(value.benchmark?.modelEvidenceQuality?.status, ["EVALUATED", "NOT_EVALUATED"], "v2b2_public_benchmark_quality_status_invalid");
  }
  if (value.modelDecision?.status === "FROZEN") {
    assertExactObjectKeys(value.modelDecision, [
      "status",
      "defaultModel",
      "upgradeModel",
      "qualityRuleVersion",
      "canaryRerunAuthorized",
    ], "v2b2_public_model_decision_unknown_field");
    requireV2B2ModelOrNull(value.modelDecision.defaultModel, false);
    requireV2B2ModelOrNull(value.modelDecision.upgradeModel, true);
  } else if (value.modelDecision?.status === "BLOCKED") {
    assertExactObjectKeys(value.modelDecision, [
      "status",
      "defaultModel",
      "upgradeModel",
      "canaryRerunAuthorized",
      "blockers",
    ], "v2b2_public_model_decision_unknown_field");
    publicDecisionBlockers(value.modelDecision.blockers);
  }
  if (value.canaryV02?.status === "NOT_RUN") {
    assertExactObjectKeys(value.canaryV02, ["status"], "v2b2_public_canary_unknown_field");
  } else {
    assertExactObjectKeys(value.canaryV02, [
      "providerConnectivity",
      "providerContractCompatibility",
      "modelEvidenceQuality",
      "sourceGovernance",
      "qualityScope",
      "canaryTechnicalStatus",
    ], "v2b2_public_canary_unknown_field");
    if (value.canaryV02?.qualityScope !== BENCHMARK_QUALITY_SCOPE) {
      throw new Error("v2b2_public_canary_quality_scope_invalid");
    }
  }
  return true;
}

function assertExactObjectKeys(value, expected, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (canonicalJson(actual) !== canonicalJson(required)) throw new Error(message);
  return true;
}

function publicBenchmarkConnectivity(value = {}) {
  return {
    status: requireEnum(value.status, ["PASS", "FAIL"], "v2b2_public_benchmark_connectivity_status_invalid"),
    threshold: requireExactNumber(value.threshold, MODEL_CONTRACT_RATE_MINIMUM, "v2b2_public_benchmark_connectivity_threshold_invalid"),
    dispatchedCount: requireNonnegativeInteger(value.dispatchedCount, "v2b2_public_benchmark_dispatched_count_invalid"),
    connectedCount: requireNonnegativeInteger(value.connectedCount, "v2b2_public_benchmark_connected_count_invalid"),
    dependencyBlockedCount: requireNonnegativeInteger(value.dependencyBlockedCount, "v2b2_public_benchmark_dependency_count_invalid"),
  };
}

function publicBenchmarkContractCompatibility(value = {}) {
  return {
    status: requireEnum(value.status, ["PASS", "FAIL"], "v2b2_public_benchmark_contract_status_invalid"),
    threshold: requireExactNumber(value.threshold, MODEL_CONTRACT_RATE_MINIMUM, "v2b2_public_benchmark_contract_threshold_invalid"),
  };
}

function publicBenchmarkModelEvidenceQuality(value = {}) {
  return {
    status: requireEnum(value.status, ["EVALUATED", "NOT_EVALUATED"], "v2b2_public_benchmark_quality_status_invalid"),
    pairedEvaluableWorkCount: requireNonnegativeInteger(value.pairedEvaluableWorkCount, "v2b2_public_benchmark_paired_count_invalid"),
    pairedEvaluableWorkMinimum: requireExactNumber(value.pairedEvaluableWorkMinimum, 8, "v2b2_public_benchmark_paired_minimum_invalid"),
  };
}

function publicCanaryConnectivity(value = {}) {
  return {
    status: requireEnum(value.status, ["PASS", "FAIL"], "v2b2_public_canary_connectivity_status_invalid"),
    connectedCount: requireNonnegativeInteger(value.connectedCount, "v2b2_public_canary_connected_count_invalid"),
    dispatchedCount: requireNonnegativeInteger(value.dispatchedCount, "v2b2_public_canary_dispatched_count_invalid"),
    denominator: requireNonnegativeInteger(value.denominator, "v2b2_public_canary_connectivity_denominator_invalid"),
    plannedPhysicalRequestCount: requireExactNumber(value.plannedPhysicalRequestCount, 120, "v2b2_public_canary_planned_count_invalid"),
    dependencyBlockedCount: requireNonnegativeInteger(value.dependencyBlockedCount, "v2b2_public_canary_dependency_count_invalid"),
  };
}

function publicCanaryContractCompatibility(value = {}) {
  return {
    status: requireEnum(value.status, ["PASS", "FAIL"], "v2b2_public_canary_contract_status_invalid"),
    compatibleCount: requireNonnegativeInteger(value.compatibleCount, "v2b2_public_canary_compatible_count_invalid"),
    denominator: requireExactNumber(value.denominator, 120, "v2b2_public_canary_contract_denominator_invalid"),
    searchContractRate: requireNullableRate(value.searchContractRate, "v2b2_public_canary_search_rate_invalid"),
    extractionContractRate: requireNullableRate(value.extractionContractRate, "v2b2_public_canary_extraction_rate_invalid"),
    modelBindingMismatchCount: requireNonnegativeInteger(value.modelBindingMismatchCount, "v2b2_public_canary_binding_mismatch_count_invalid"),
  };
}

function publicCanaryModelEvidenceQuality(value = {}) {
  return {
    status: requireEnum(value.status, ["EVALUATED", "NOT_EVALUATED"], "v2b2_public_canary_quality_status_invalid"),
    usableWorkCount: requireNonnegativeInteger(value.usableWorkCount, "v2b2_public_canary_usable_work_count_invalid"),
    citationBoundWorkRate: requireNullableRate(value.citationBoundWorkRate, "v2b2_public_canary_citation_rate_invalid"),
    citationBoundEvidenceCount: requireNonnegativeInteger(value.citationBoundEvidenceCount, "v2b2_public_canary_evidence_count_invalid"),
    unsupportedCitationReferenceCount: requireNonnegativeInteger(value.unsupportedCitationReferenceCount, "v2b2_public_canary_unsupported_reference_count_invalid"),
    claimSupportUnverifiedCount: requireNonnegativeInteger(value.claimSupportUnverifiedCount, "v2b2_public_canary_claim_support_count_invalid"),
    entityIdentityErrorCount: requireNonnegativeInteger(value.entityIdentityErrorCount, "v2b2_public_canary_entity_error_count_invalid"),
  };
}

function publicSourceGovernance(value = {}, mode) {
  const statuses = mode === "benchmark"
    ? ["ALLOWLIST_PRESENT_NOT_USED_FOR_MODEL_SELECTION", "BLOCKED_EMPTY_ALLOWLIST"]
    : ["ALLOWLIST_PRESENT", "BLOCKED_EMPTY_ALLOWLIST"];
  return {
    status: requireEnum(value.status, statuses, "v2b2_public_source_governance_status_invalid"),
    approvedDomainEntryCount: requireNonnegativeInteger(value.approvedDomainEntryCount, "v2b2_public_allowlist_count_invalid"),
    acceptedEvidenceCount: requireExactNumber(value.acceptedEvidenceCount, 0, "v2b2_public_accepted_evidence_count_invalid"),
    modelQualityIndependentOfGovernance: value.modelQualityIndependentOfGovernance === true,
  };
}

function publicDecisionBlockers(value) {
  const allowed = new Set(["compatibility_gate_failed", "model_quality_gate_failed"]);
  const blockers = Array.isArray(value) ? unique(value.map(String)) : [];
  if (blockers.some((item) => !allowed.has(item))) throw new Error("v2b2_public_model_decision_blocker_invalid");
  return blockers;
}

function requireV2B2ModelOrNull(value, allowNull) {
  if (allowNull && value === null) return null;
  if (!V2B2_MODELS.includes(value)) throw new Error("v2b2_public_model_id_invalid");
  return value;
}

function requireEnum(value, allowed, message) {
  if (!allowed.includes(value)) throw new Error(message);
  return value;
}

function requireExactString(value, expected, message) {
  if (value !== expected) throw new Error(message);
  return value;
}

function requireExactNumber(value, expected, message) {
  if (value !== expected) throw new Error(message);
  return value;
}

function requireNonnegativeInteger(value, message) {
  if (!Number.isInteger(value) || value < 0) throw new Error(message);
  return value;
}

function requireNullableRate(value, message) {
  if (value === null) return null;
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(message);
  return value;
}

function assertV2B2PublicMarkdownSafe(value) {
  if (typeof value !== "string") throw new Error("v2b2_public_markdown_not_string");
  if (/(?:https?:\/\/|www\.|data[\\/]private-output|\.env|[A-Za-z]:\\)/iu.test(value)) {
    throw new Error("v2b2_public_markdown_sensitive_value_detected");
  }
  for (const token of ["standardWorkId", "sourceUrl", "queryText", "workTitle", "authorByline"]) {
    if (value.includes(token)) throw new Error("v2b2_public_markdown_private_token_detected");
  }
  return true;
}

function publicModelMetrics(value = {}) {
  return {
    plannedPhysicalRequestCount: value.plannedPhysicalRequestCount ?? 0,
    dispatchedPhysicalRequestCount: value.dispatchedPhysicalRequestCount ?? 0,
    providerConnectivityCount: value.providerConnectivityCount ?? 0,
    providerConnectivityRate: value.providerConnectivityRate ?? null,
    dependencyBlockedCount: value.dependencyBlockedCount ?? 0,
    providerContractCompatibleCount: value.providerContractCompatibleCount ?? 0,
    providerContractCompatibleRate: value.providerContractCompatibleRate ?? null,
    searchContractSuccessCount: value.searchContractSuccessCount ?? 0,
    searchContractRate: value.searchContractRate ?? null,
    extractionContractSuccessCount: value.extractionContractSuccessCount ?? 0,
    extractionContractRate: value.extractionContractRate ?? null,
    modelBindingMismatchCount: value.modelBindingMismatchCount ?? 0,
    unsupportedCitationReferenceCount: value.unsupportedCitationReferenceCount ?? 0,
    claimSupportUnverifiedCount: value.claimSupportUnverifiedCount ?? 0,
    entityIdentityErrorCount: value.entityIdentityErrorCount ?? 0,
    validationIssueCount: value.validationIssueCount ?? 0,
    usableWorkCount: value.usableWorkCount ?? 0,
    validEvidenceWorkCount: value.validEvidenceWorkCount ?? 0,
    citationBoundWorkRate: value.citationBoundWorkRate ?? null,
    entityResolvedWorkCount: value.entityResolvedWorkCount ?? 0,
    citationBoundEvidenceCount: value.citationBoundEvidenceCount ?? 0,
    availableAtCount: value.availableAtCount ?? 0,
    eventTimeCount: value.eventTimeCount ?? 0,
    timestampCompleteness: value.timestampCompleteness ?? null,
    endToEndSuccessCount: value.endToEndSuccessCount ?? 0,
    totalTokens: value.totalTokens ?? null,
    observedInputTokens: value.observedInputTokens ?? 0,
    observedOutputTokens: value.observedOutputTokens ?? 0,
    observedTotalTokens: value.observedTotalTokens ?? 0,
    usageObservedRequestCount: value.usageObservedRequestCount ?? 0,
    usageMissingRequestCount: value.usageMissingRequestCount ?? 0,
    tokenUsageComplete: value.tokenUsageComplete === true,
    latencyP50Ms: value.latencyP50Ms ?? null,
    latencyP90Ms: value.latencyP90Ms ?? null,
    latencyObservedRequestCount: value.latencyObservedRequestCount ?? 0,
    latencyComplete: value.latencyComplete === true,
    eligibleForCompatibilityGate: value.eligibleForCompatibilityGate === true,
    eligibleForQualityDecision: value.eligibleForQualityDecision === true,
  };
}

function loadRelayConfiguration(root, suppliedEnv = null) {
  const env = suppliedEnv ?? { ...readEnvLocal(join(root, ".env.local")), ...process.env };
  const baseUrl = normalizeBaseUrl(env.OPENAI_BASE_URL ?? env.M2_V2_EVIDENCE_API_BASE_URL);
  const approvedHost = String(env.M2_V2_APPROVED_RELAY_HOST ?? "").trim().toLocaleLowerCase("en-US");
  const apiKey = String(env.OPENAI_API_KEY ?? "");
  if (env.M2_V2_EVIDENCE_PROVIDER && env.M2_V2_EVIDENCE_PROVIDER !== "openai_compatible_relay") {
    throw new Error("v2b2_provider_mode_invalid");
  }
  if (!baseUrl || !approvedHost || !apiKey) throw new Error("v2b2_relay_configuration_incomplete");
  const transport = bindProviderTransport({ baseUrl, approvedHost });
  const bindingDigest = sha256({
    providerId: "openai_compatible_relay",
    endpointPath: "/responses",
    baseUrlDigest: sha256(transport.baseUrl),
    models: V2B2_MODELS,
    adapterVersion: V2B2_ADAPTER_VERSION,
    promptVersion: V2B2_PROMPT_VERSION,
    schemaVersion: V2B2_SCHEMA_VERSION,
  });
  return { baseUrl: transport.baseUrl, approvedHost: transport.approvedHost, apiKey, bindingDigest };
}

function readSourceAllowlist(root, options = {}) {
  return options.sourceAllowlist ?? readJson(join(root, options.sourceAllowlistRelative ?? V2B2_SOURCE_ALLOWLIST_RELATIVE));
}

function ensurePrivateStore(root, options = {}) {
  const privateStore = join(root, options.privateRelative ?? V2B2_PRIVATE_RELATIVE);
  mkdirSync(privateStore, { recursive: true });
  if (options.skipIgnoreCheck !== true) {
    const relative = (options.privateRelative ?? V2B2_PRIVATE_RELATIVE).replaceAll("\\", "/");
    const result = spawnSync("git", ["check-ignore", "-q", "--", relative], { cwd: root, windowsHide: true });
    if (result.status !== 0) throw new Error("v2b2_private_store_not_git_ignored");
    const tracked = spawnSync("git", ["ls-files", "--error-unmatch", "--", relative], { cwd: root, encoding: "utf8", windowsHide: true });
    if (tracked.status === 0 && String(tracked.stdout ?? "").trim()) throw new Error("v2b2_private_store_is_tracked");
  }
  return privateStore;
}

function readEnvLocal(path) {
  if (!existsSync(path)) return {};
  const result = {};
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/u)) {
    const line = rawLine.trim();
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

function normalizeBaseUrl(value) {
  return String(value ?? "").trim().replace(/\/+$/u, "");
}

function normalizeUsage(value) {
  const inputTokens = finiteNonnegative(value?.inputTokens ?? value?.input_tokens ?? value?.prompt_tokens);
  const outputTokens = finiteNonnegative(value?.outputTokens ?? value?.output_tokens ?? value?.completion_tokens);
  const totalTokens = finiteNonnegative(value?.totalTokens ?? value?.total_tokens)
    ?? (inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null);
  return { inputTokens, outputTokens, totalTokens };
}

function contentTypeClass(value) {
  const normalized = String(value ?? "").toLocaleLowerCase("en-US");
  if (!normalized) return "unavailable";
  if (normalized.includes("html")) return "html";
  if (normalized.includes("json")) return "json";
  if (normalized.includes("text/plain")) return "text_plain";
  return "other";
}

function safeStatus(value) {
  const text = String(value ?? "unknown");
  return /^[a-z0-9_.:-]{1,100}$/iu.test(text) ? text : `sha256:${sha256(text)}`;
}

function safeErrorToken(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  return /^[A-Za-z0-9_.:-]{1,100}$/u.test(value) ? value : `sha256:${sha256(value)}`;
}

function safeModelId(value) {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,100}$/u.test(value) ? value : null;
}

function safeDigest(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value) ? value : null;
}

function safeEnum(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function validTimestamp(value) {
  return typeof value === "string" && value.trim() && Number.isFinite(Date.parse(value));
}

function finiteNonnegative(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function higherScore(value) {
  return Number.isFinite(value) ? Number(value) : Number.NEGATIVE_INFINITY;
}

function lowerScore(value) {
  return Number.isFinite(value) ? -Number(value) : Number.NEGATIVE_INFINITY;
}

function percentile(values, probability) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return null;
  const index = Math.ceil(probability * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

function stageRank(stage) {
  return stage === "search" ? 0 : 1;
}

function ratio(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : null;
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}

function countBy(values, selector) {
  const result = {};
  for (const value of values) {
    const key = String(selector(value));
    result[key] = (result[key] ?? 0) + 1;
  }
  return result;
}

function unique(values) {
  return [...new Set(values)];
}

function withDigest(payload, key) {
  return { ...payload, [key]: sha256(payload) };
}

function withReplacedDigest(value, key) {
  const payload = { ...value };
  delete payload[key];
  return withDigest(payload, key);
}

function assertDigest(value, key, message) {
  const payload = { ...value };
  const actual = payload[key];
  delete payload[key];
  if (typeof actual !== "string" || actual !== sha256(payload)) throw new Error(message);
}

function isIsoTimestamp(value) {
  return typeof value === "string"
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value;
}

function atomicWriteJson(path, value) {
  atomicWriteText(path, `${JSON.stringify(value, null, 2)}\n`);
}

function atomicWriteNdjson(path, values) {
  atomicWriteText(path, values.length ? `${values.map((value) => JSON.stringify(value)).join("\n")}\n` : "");
}

function atomicWriteText(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temporary, value, "utf8");
  if (existsSync(path)) {
    const backup = `${path}.replace-${process.pid}-${Date.now()}`;
    renameSync(path, backup);
    try {
      renameSync(temporary, path);
      rmSync(backup, { force: true });
    } catch (error) {
      if (existsSync(path)) rmSync(path, { force: true });
      renameSync(backup, path);
      throw error;
    } finally {
      if (existsSync(temporary)) rmSync(temporary, { force: true });
      if (existsSync(backup)) rmSync(backup, { force: true });
    }
  } else {
    renameSync(temporary, path);
  }
}

function atomicWriteBundle(documents) {
  const nonce = `${process.pid}-${Date.now()}`;
  const entries = documents.map(([path, value], index) => ({
    path,
    value,
    temporary: `${path}.bundle-tmp-${nonce}-${index}`,
    backup: `${path}.bundle-backup-${nonce}-${index}`,
    backedUp: false,
    installed: false,
  }));
  let committed = false;
  try {
    for (const entry of entries) {
      mkdirSync(dirname(entry.path), { recursive: true });
      writeFileSync(entry.temporary, entry.value, "utf8");
    }
    for (const entry of entries) {
      if (existsSync(entry.path)) {
        renameSync(entry.path, entry.backup);
        entry.backedUp = true;
      }
    }
    for (const entry of entries) {
      renameSync(entry.temporary, entry.path);
      entry.installed = true;
    }
    committed = true;
  } catch (error) {
    for (const entry of [...entries].reverse()) {
      if (entry.installed && existsSync(entry.path)) rmSync(entry.path, { force: true });
      if (entry.backedUp && existsSync(entry.backup)) renameSync(entry.backup, entry.path);
    }
    throw error;
  } finally {
    for (const entry of entries) {
      removeFileBestEffort(entry.temporary);
      if (committed) removeFileBestEffort(entry.backup);
    }
  }
}

function removeFileBestEffort(path) {
  try {
    if (existsSync(path)) rmSync(path, { force: true });
  } catch {
    return false;
  }
  return true;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readOptionalJson(path) {
  return existsSync(path) ? readJson(path) : null;
}

function readNdjson(path) {
  return readFileSync(path, "utf8").split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
}

function errorMessage(error, fallback) {
  return error instanceof Error ? error.message : fallback;
}
