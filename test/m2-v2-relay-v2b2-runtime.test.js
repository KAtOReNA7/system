import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  CANARY_SLOT_RULES,
  buildCanaryTasks,
  selectCanarySubset,
} from "../src/domain/m2V2EvidencePilot/canaryCore.js";
import { sha256 } from "../src/domain/m2V2EvidencePilot/pilotCore.js";
import {
  V2B2_BENCHMARK_PHYSICAL_REQUEST_CAP,
  V2B2_CANARY_PHYSICAL_REQUEST_CAP,
  V2B2_MODELS,
  assertV2B2BenchmarkManifest,
  assertV2B2CanaryManifest,
  auditLegacyV2B2Receipts,
  buildV2B2BenchmarkPhysicalPlan,
  buildV2B2CanaryPhysicalPlan,
  deriveV2B2BenchmarkManifest,
  deriveV2B2CanaryManifest,
  evaluateV2B2Benchmark,
  executeV2B2PhysicalPlan,
  freezeV2B2ModelDecision,
} from "../src/domain/m2V2EvidencePilot/v2b2Runtime.js";

test("V2-B.2 benchmark reuses the exact frozen ten works without resampling and isolates model/stage keys", () => {
  const { parent, canary } = syntheticFrozenBinding();
  const parentBefore = structuredClone(parent);
  const canaryBefore = structuredClone(canary);
  const manifest = deriveV2B2BenchmarkManifest(parent, canary, bindingOptions(parent));
  const plan = buildV2B2BenchmarkPhysicalPlan(manifest);

  assert.equal(manifest.sampleCount, 10);
  assert.equal(manifest.workIntentCount, 10);
  assert.equal(manifest.logicalTaskCount, 10);
  assert.equal(manifest.modelArmCount, 20);
  assert.equal(manifest.plannedPhysicalRequestCount, V2B2_BENCHMARK_PHYSICAL_REQUEST_CAP);
  assert.equal(manifest.retryPolicy.maxRetries, 0);
  assert.deepEqual(manifest.sample, canary.sample);
  assert.deepEqual(parent, parentBefore);
  assert.deepEqual(canary, canaryBefore);
  assert.equal(plan.length, 40);
  assert.equal(new Set(plan.map((item) => item.requestKey)).size, 40);
  for (const model of V2B2_MODELS) {
    assert.equal(manifest.arms.filter((item) => item.model === model && item.modelOrder === 1).length, 5);
  }

  for (const task of manifest.logicalTasks) {
    const arms = plan.filter((item) => item.logicalTaskKey === task.logicalTaskKey);
    assert.deepEqual(new Set(arms.map((item) => item.model)), new Set(V2B2_MODELS));
    for (const model of V2B2_MODELS) {
      const modelStages = arms.filter((item) => item.model === model).map((item) => item.stage).sort();
      assert.deepEqual(modelStages, ["extraction", "search"]);
    }
  }
  assert.equal(assertV2B2BenchmarkManifest(manifest, parent, canary, bindingOptions(parent)), true);

  const changed = structuredClone(manifest);
  changed.sample[0].identityDigest = "f".repeat(64);
  changed.benchmarkManifestDigest = digestWithout(changed, "benchmarkManifestDigest");
  assert.throws(
    () => assertV2B2BenchmarkManifest(changed, parent, canary, bindingOptions(parent)),
    /v2b2_benchmark_sample_changed/u,
  );
});

test("physical execution checkpoints and resumes without a second dispatch", async (context) => {
  const directory = mkdtempSync(join(tmpdir(), "m2-v2b2-runtime-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const { parent, canary } = syntheticFrozenBinding();
  const manifest = deriveV2B2BenchmarkManifest(parent, canary, bindingOptions(parent));
  const plan = buildV2B2BenchmarkPhysicalPlan(manifest);
  let dispatchCount = 0;
  const stageExecutor = async ({ item }) => {
    dispatchCount += 1;
    return successfulStageResult(item);
  };
  const paths = executionPaths(directory, "benchmark");
  const first = await executeV2B2PhysicalPlan({
    root: directory,
    namespace: "benchmark",
    manifestDigest: manifest.benchmarkManifestDigest,
    plan,
    physicalRequestCap: 40,
    ...paths,
    stageExecutor,
    now: monotonicClock(),
  });
  assert.equal(dispatchCount, 40);
  assert.equal(first.receipts.length, 40);
  assert.equal(first.state.dispatchedPhysicalRequestCount, 40);
  assert.equal(first.receipts.every((item) => item.retryCount === 0), true);
  assert.equal(first.receipts.every((item) => item.fullPilotAuthorized === false), true);

  const second = await executeV2B2PhysicalPlan({
    root: directory,
    namespace: "benchmark",
    manifestDigest: manifest.benchmarkManifestDigest,
    plan,
    physicalRequestCap: 40,
    ...paths,
    stageExecutor,
    now: monotonicClock(),
    resume: true,
  });
  assert.equal(dispatchCount, 40);
  assert.deepEqual(second.receipts.map((item) => item.receiptDigest), first.receipts.map((item) => item.receiptDigest));
  assert.equal(Object.keys(second.cache.entries).length, 40);
});

test("Terra/Luna gate requires paired >=8, per-stage >=80%, citation-bound >=80%, and exact model binding", async (context) => {
  const directory = mkdtempSync(join(tmpdir(), "m2-v2b2-gate-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const { parent, canary } = syntheticFrozenBinding();
  const manifest = deriveV2B2BenchmarkManifest(parent, canary, bindingOptions(parent));
  const plan = buildV2B2BenchmarkPhysicalPlan(manifest);
  const execution = await executeV2B2PhysicalPlan({
    root: directory,
    namespace: "benchmark",
    manifestDigest: manifest.benchmarkManifestDigest,
    plan,
    physicalRequestCap: 40,
    ...executionPaths(directory, "valid"),
    stageExecutor: async ({ item }) => successfulStageResult(item),
    now: monotonicClock(),
  });
  const evaluation = evaluateV2B2Benchmark({
    manifest,
    plan,
    receipts: execution.receipts,
    sourceAllowlist: { approvedDomainEntries: [] },
  });
  assert.equal(evaluation.providerConnectivity.status, "PASS");
  assert.equal(evaluation.providerContractCompatibility.status, "PASS");
  assert.equal(evaluation.modelEvidenceQuality.status, "EVALUATED");
  assert.equal(evaluation.modelEvidenceQuality.pairedEvaluableWorkCount, 10);
  assert.equal(evaluation.modelQualityGate.passed, true);
  assert.equal(evaluation.sourceGovernance.status, "BLOCKED_EMPTY_ALLOWLIST");
  for (const model of V2B2_MODELS) {
    assert.equal(evaluation.models[model].searchContractRate, 1);
    assert.equal(evaluation.models[model].extractionContractRate, 1);
    assert.equal(evaluation.models[model].citationBoundWorkRate, 1);
    assert.equal(evaluation.models[model].modelBindingMismatchCount, 0);
  }

  const badExecution = await executeV2B2PhysicalPlan({
    root: directory,
    namespace: "benchmark_bad_binding",
    manifestDigest: manifest.benchmarkManifestDigest,
    plan,
    physicalRequestCap: 40,
    ...executionPaths(directory, "bad"),
    stageExecutor: async ({ item }) => ({
      ...successfulStageResult(item),
      returnedModelId: item.model === "gpt-5.6-luna" ? "gpt-5.6-terra" : item.model,
      modelBindingVerified: item.model !== "gpt-5.6-luna",
    }),
    now: monotonicClock(),
  });
  const bad = evaluateV2B2Benchmark({
    manifest,
    plan,
    receipts: badExecution.receipts,
    sourceAllowlist: { approvedDomainEntries: [] },
  });
  assert.equal(bad.providerContractCompatibility.status, "FAIL");
  assert.equal(bad.modelEvidenceQuality.status, "NOT_EVALUATED");
  assert.equal(bad.modelQualityGate.passed, false);
});

test("quality-first decision freezes a default, requires two complementary upgrade wins, and never authorizes full 160", async (context) => {
  const directory = mkdtempSync(join(tmpdir(), "m2-v2b2-decision-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const { parent, canary } = syntheticFrozenBinding();
  const manifest = deriveV2B2BenchmarkManifest(parent, canary, bindingOptions(parent));
  const plan = buildV2B2BenchmarkPhysicalPlan(manifest);
  const execution = await executeV2B2PhysicalPlan({
    root: directory,
    namespace: "decision",
    manifestDigest: manifest.benchmarkManifestDigest,
    plan,
    physicalRequestCap: 40,
    ...executionPaths(directory, "decision"),
    stageExecutor: async ({ item }) => ({
      ...successfulStageResult(item),
      usableEvidenceCount: item.stage === "extraction" && item.model === "gpt-5.6-terra" ? 2 : item.stage === "extraction" ? 1 : 0,
    }),
    now: monotonicClock(),
  });
  const evaluation = evaluateV2B2Benchmark({ manifest, plan, receipts: execution.receipts, sourceAllowlist: { approvedDomainEntries: [] } });
  const decision = freezeV2B2ModelDecision(directory, evaluation, { frozenAt: "2026-07-17T00:00:00.000Z" });
  assert.equal(decision.status, "FROZEN");
  assert.equal(decision.defaultModel, "gpt-5.6-terra");
  assert.equal(decision.upgradeModel, null);
  assert.equal(decision.fullPilotAuthorized, false);
  assert.equal(decision.canaryRerunAuthorized, true);
});

test("blocked decision is immutable and persisted, while relay-binding changes cannot reuse cache", async (context) => {
  const directory = mkdtempSync(join(tmpdir(), "m2-v2b2-blocked-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const blockedEvaluation = {
    evaluationDigest: "e".repeat(64),
    compatibilityGate: { passed: false },
    modelQualityGate: { passed: false },
  };
  const blocked = freezeV2B2ModelDecision(directory, blockedEvaluation, { frozenAt: "2026-07-17T00:00:00.000Z" });
  assert.equal(blocked.status, "BLOCKED");
  assert.equal(blocked.privateOnly, true);
  assert.equal(blocked.immutable, true);
  assert.equal(blocked.defaultModel, null);
  assert.equal(blocked.canaryRerunAuthorized, false);
  assert.equal(blocked.fullPilotAuthorized, false);
  assert.equal(blocked.decisionDigest, digestWithout(blocked, "decisionDigest"));
  const persisted = JSON.parse(readFileSync(join(directory, "terra-luna-model-decision-private-v0.1.json"), "utf8"));
  assert.deepEqual(persisted, blocked);

  const { parent, canary } = syntheticFrozenBinding();
  const manifest = deriveV2B2BenchmarkManifest(parent, canary, bindingOptions(parent));
  const plan = buildV2B2BenchmarkPhysicalPlan(manifest).filter((item) => item.stage === "search").slice(0, 1);
  const paths = executionPaths(directory, "binding");
  await executeV2B2PhysicalPlan({
    root: directory,
    namespace: "binding",
    manifestDigest: manifest.benchmarkManifestDigest,
    plan,
    physicalRequestCap: 1,
    ...paths,
    runtimeBindingDigest: "a".repeat(64),
    stageExecutor: async ({ item }) => successfulStageResult(item),
    now: monotonicClock(),
  });
  await assert.rejects(
    executeV2B2PhysicalPlan({
      root: directory,
      namespace: "binding",
      manifestDigest: manifest.benchmarkManifestDigest,
      plan,
      physicalRequestCap: 1,
      ...paths,
      runtimeBindingDigest: "b".repeat(64),
      stageExecutor: async ({ item }) => successfulStageResult(item),
      now: monotonicClock(),
    }),
    /v2b2_cache_relay_binding_mismatch/u,
  );
});

test("unresolved entity candidates never count as paired usable work", async (context) => {
  const directory = mkdtempSync(join(tmpdir(), "m2-v2b2-unresolved-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const { parent, canary } = syntheticFrozenBinding();
  const manifest = deriveV2B2BenchmarkManifest(parent, canary, bindingOptions(parent));
  const plan = buildV2B2BenchmarkPhysicalPlan(manifest);
  const execution = await executeV2B2PhysicalPlan({
    root: directory,
    namespace: "unresolved",
    manifestDigest: manifest.benchmarkManifestDigest,
    plan,
    physicalRequestCap: 40,
    ...executionPaths(directory, "unresolved"),
    stageExecutor: async ({ item }) => ({
      ...successfulStageResult(item),
      entityResolved: false,
      usableEvidenceCount: item.stage === "extraction" ? 1 : 0,
    }),
    now: monotonicClock(),
  });
  const evaluation = evaluateV2B2Benchmark({ manifest, plan, receipts: execution.receipts, sourceAllowlist: { approvedDomainEntries: [] } });
  assert.equal(evaluation.modelEvidenceQuality.status, "NOT_EVALUATED");
  assert.equal(evaluation.modelQualityGate.passed, false);
  assert.equal(evaluation.modelEvidenceQuality.pairedEvaluableWorkCount, 0);
});

test("canary v0.2 copies all original 60 logical tasks, expands to exactly 120 two-stage calls, and rejects a blocked model decision", () => {
  const { parent, canary } = syntheticFrozenBinding();
  const benchmark = deriveV2B2BenchmarkManifest(parent, canary, bindingOptions(parent));
  const blocked = {
    schema: "m2.v2.v2b2.model-decision-blocked.v0.1",
    status: "BLOCKED",
    canaryRerunAuthorized: false,
    defaultModel: null,
    fullPilotAuthorized: false,
  };
  assert.throws(
    () => deriveV2B2CanaryManifest(parent, canary, benchmark, blocked, bindingOptions(parent)),
    /v2b2_canary_model_decision_not_authorized/u,
  );

  const decisionPayload = {
    schema: "m2.v2.v2b2.model-decision.v0.1",
    privateOnly: true,
    immutable: true,
    status: "FROZEN",
    frozenAt: "2026-07-17T00:00:00.000Z",
    evaluationDigest: "e".repeat(64),
    qualityRuleVersion: "m2-v2-v2b2-quality-first-lexicographic-v0.1",
    qualityOrder: [],
    defaultModel: "gpt-5.6-terra",
    upgradeModel: null,
    upgradeReason: "none",
    complementaryIncrementalWorkCount: 0,
    canaryRerunAuthorized: true,
    canaryModelPolicy: "single_frozen_default_model",
    fullPilotAuthorized: false,
  };
  const decision = { ...decisionPayload, decisionDigest: sha256(decisionPayload) };
  const manifest = deriveV2B2CanaryManifest(parent, canary, benchmark, decision, bindingOptions(parent));
  const plan = buildV2B2CanaryPhysicalPlan(manifest);
  assert.equal(buildCanaryTasks(canary).length, 60);
  assert.equal(manifest.logicalTaskCount, 60);
  assert.equal(manifest.plannedPhysicalRequestCount, V2B2_CANARY_PHYSICAL_REQUEST_CAP);
  assert.equal(plan.length, 120);
  assert.equal(new Set(plan.map((item) => item.requestKey)).size, 120);
  assert.equal(new Set(plan.map((item) => item.model)).size, 1);
  assert.equal(manifest.retryPolicy.maxRetries, 0);
  assert.equal(manifest.fullPilotAuthorized, false);
  assert.equal(assertV2B2CanaryManifest(manifest, parent, canary, benchmark, decision, bindingOptions(parent)), true);
});

test("legacy audit records 12/37/11 while declaring raw paths and returned model not reconstructable", (context) => {
  const root = mkdtempSync(join(tmpdir(), "m2-v2b2-audit-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const relative = "legacy/receipts.ndjson";
  const source = join(root, relative);
  mkdirSync(join(root, "legacy"), { recursive: true });
  const receipts = [
    ...Array.from({ length: 12 }, (_, index) => legacyReceipt(index, "strict")),
    ...Array.from({ length: 37 }, (_, index) => legacyReceipt(index + 12, "schema")),
    ...Array.from({ length: 11 }, (_, index) => legacyReceipt(index + 49, "failure")),
  ];
  writeFileSync(source, `${receipts.map((item) => JSON.stringify(item)).join("\n")}\n`, "utf8");
  const result = auditLegacyV2B2Receipts(root, {
    receiptsRelative: relative,
    privateRelative: "private",
    skipIgnoreCheck: true,
    generatedAt: "2026-07-17T00:00:00.000Z",
  });
  assert.deepEqual(result.aggregate.classificationCounts, {
    local_strict_success: 12,
    relay_success_local_schema_failure: 37,
    provider_or_request_failure: 11,
  });
  assert.equal(result.aggregate.legacyRawShapeUnobservable, true);
  assert.equal(result.aggregate.returnedModelIdentityVerifiable, false);
  const matrix = JSON.parse(readFileSync(join(root, "private/relay-response-shape-matrix-private-v0.1.json"), "utf8"));
  assert.equal(matrix.rows.length, 60);
  assert.ok(matrix.rows.every((item) => item.returnedModelId === "not_reconstructable"));
  assert.ok(matrix.rows.every((item) => item.notReconstructable.includes("annotation_paths")));
});

function successfulStageResult(item) {
  const extraction = item.stage === "extraction";
  return {
    returnedModelId: item.model,
    modelBindingVerified: true,
    dispatched: true,
    providerConnectivityPassed: true,
    providerContractCompatible: true,
    status: "success",
    structuredValid: extraction,
    validationIssues: [],
    citationCount: item.stage === "search" ? 1 : 0,
    entityResolved: extraction,
    entityIdentityErrorCount: 0,
    usableEvidenceCount: extraction ? 1 : 0,
    availableAtCount: extraction ? 1 : 0,
    eventTimeCount: extraction ? 1 : 0,
    lineage: extraction ? { valid: true, allCandidatesBound: true, unsupportedReferenceCount: 0, boundCandidateCount: 1 } : null,
    normalizedResponse: item.stage === "search" ? { valid: true, citationRegistry: [{ citationId: "cit_synthetic" }] } : { valid: true },
    usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    latencyMs: item.model === "gpt-5.6-luna" ? 10 : 20,
    capturedAt: "2026-07-17T00:00:00.000Z",
  };
}

function executionPaths(root, prefix) {
  return {
    cachePath: join(root, `${prefix}-cache.json`),
    statePath: join(root, `${prefix}-state.json`),
    receiptsPath: join(root, `${prefix}-receipts.ndjson`),
  };
}

function monotonicClock() {
  let tick = 0;
  return () => new Date(Date.parse("2026-07-17T00:00:00.000Z") + tick++).toISOString();
}

function bindingOptions(parent) {
  return {
    expectedParentManifestDigest: parent.manifestDigest,
    createdAt: "2026-07-17T00:00:00.000Z",
  };
}

function syntheticFrozenBinding() {
  const sample = CANARY_SLOT_RULES.map((slot, index) => syntheticWork(index, slot));
  for (let index = sample.length; index < 160; index += 1) {
    sample.push(syntheticWork(index, {
      sourceType: index % 2 ? "publication" : "web_original",
      revenueModel: ["pure_sales_share", "pure_buyout", "buyout_plus_sales"][index % 3],
      highValue: index % 4 === 0,
      ambiguityRisk: index % 3 === 0 ? "high" : "low",
      evidencePrior: index % 2 ? "rich" : "sparse",
    }));
  }
  const parentPayload = {
    schema: "m2.v2.evidence-pilot-private-manifest.v0.1",
    privateOnly: true,
    immutable: true,
    status: "frozen_before_retrieval",
    createdAt: "2026-07-17T00:00:00.000Z",
    seed: "20260717",
    targetSampleSize: 160,
    populationCount: 3053,
    sample,
  };
  const parent = { ...parentPayload, manifestDigest: sha256(parentPayload) };
  const selection = selectCanarySubset(parent);
  const canaryPayload = {
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
    parentSampleCount: 160,
    sampleCount: 10,
    coverage: selection.coverage,
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
    sample: selection.selected.map((item) => ({ ...item })),
    repeatSample: selection.repeatWorks.map((item) => ({ standardWorkId: item.standardWorkId, identityDigest: item.identityDigest })),
  };
  const canary = { ...canaryPayload, canaryManifestDigest: sha256(canaryPayload) };
  return { parent, canary };
}

function syntheticWork(index, overrides) {
  return {
    standardWorkId: `synthetic-work-${String(index).padStart(3, "0")}`,
    title: `合成作品${index}`,
    author: `合成作者${index}`,
    identityDigest: sha256(["synthetic", index]),
    sourceType: overrides.sourceType,
    revenueBand: overrides.highValue ? "top10" : "long_tail",
    revenueModel: overrides.revenueModel,
    activity: index % 2 ? "dense" : "intermittent",
    ambiguityRisk: overrides.ambiguityRisk,
    evidencePrior: overrides.evidencePrior,
    highValue: overrides.highValue,
    sameNameCount: overrides.ambiguityRisk === "high" ? 2 : 1,
  };
}

function legacyReceipt(index, kind) {
  const success = kind !== "failure";
  const strict = kind === "strict";
  return {
    receiptDigest: sha256(["legacy", index]),
    runKind: index % 3 === 0 ? "repeat" : "primary",
    status: success ? "success" : "transport_error",
    httpStatus: success ? 200 : null,
    responseContentType: success ? "text/plain" : null,
    rawResponsePersisted: false,
    model: "gpt-5.6-terra",
    structuredResponse: success ? legacyStructuredResponse(kind) : null,
    outputTextDigest: success ? sha256(["output", index]) : null,
    citations: index === 12 ? [{ url: "https://example.invalid", title: "synthetic" }] : [],
    semanticChecks: {
      responsesShapeValid: success,
      webSearchObserved: success,
      strictJsonValid: strict,
      validationIssues: strict ? [] : kind === "schema" ? ["structured_value_inactive_field_non_null"] : [],
    },
    usage: success ? { inputTokens: 10, outputTokens: 5, totalTokens: 15 } : {},
  };
}

function legacyStructuredResponse(kind) {
  const value = {
    queryOutcome: "no_result",
    workIdentity: { status: "unresolved", matchedTitle: null, matchedAuthor: null, basis: null },
    authorIdentity: { status: "unresolved", matchedAuthor: null, basis: null },
    authorWorkRelationshipConfirmed: false,
    evidenceCandidates: [],
  };
  if (kind === "schema") value.unexpected = true;
  return value;
}

function digestWithout(value, key) {
  const clone = structuredClone(value);
  delete clone[key];
  return sha256(clone);
}
