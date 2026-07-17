import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { performance } from "node:perf_hooks";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  DEFAULT_V2B3_SOURCE_GOVERNANCE_POLICY,
  V2B3_EXTRACTION_SCHEMA,
  V2B3_PIPELINE_VERSION,
  V2B3_SOURCE_GOVERNANCE_SCHEMA,
  V2B3_SOURCE_RECORD_SCHEMA,
  buildV2B3ExtractionPayload,
  buildV2B3SearchPayload,
  createV2B3SourceGovernancePolicy,
  normalizeV2B3ExtractionResponse,
  normalizeV2B3SearchResponse,
  planV2B3SearchQueries,
  validateV2B3SourceGovernancePolicy,
} from "./evidencePipelineV2B3.js";
import { canonicalJson, normalizeEntityText, sha256 } from "./pilotCore.js";

export const V2B4_MODELS = Object.freeze(["gpt-5.6-luna", "gpt-5.6-terra"]);
export const V2B4_PRIVATE_RELATIVE = "data/private-output/m2-v2-evidence-pilot/v2-b4-real-evidence-canary";
export const V2B4_CANARY_RELATIVE = "data/private-output/m2-v2-evidence-pilot/canary-v0.1/canary-manifest-private-v0.1.json";
export const V2B4_BENCHMARK_RELATIVE = "data/private-output/m2-v2-evidence-pilot/v2-b2-relay-remediation/terra-luna-benchmark-manifest-private-v0.1.json";
export const V2B4_GOVERNANCE_RELATIVE = "docs/technical-design/m2-v2/M2-v2-source-governance-policy-v0.2.json";
export const V2B4_REQUEST_CAP = 60;
export const V2B4_SEARCH_TIMEOUT_MS = 45_000;
export const V2B4_EXTRACTION_TIMEOUT_MS = 25_000;
export const V2B4_SEARCH_MAX_OUTPUT_TOKENS = 700;
export const V2B4_EXTRACTION_MAX_OUTPUT_TOKENS = 1_200;
export const V2B4_MAX_RETRIES = 0;
export const V2B4_MAX_TOTAL_TOKENS = 1_800_000;
export const V2B4_MAX_AVERAGE_TOKENS_PER_DISPATCH = 30_000;

const RESPONSE_LIMIT_BYTES = 2 * 1024 * 1024;

export const V2B4_PRIVATE_FILES = Object.freeze({
  manifest: "canary-v2-manifest-private-v0.1.json",
  cache: "canary-v2-cache-private-v0.1.json",
  state: "canary-v2-state-private-v0.1.json",
  queryLogs: "canary-v2-query-logs-private-v0.1.ndjson",
  receipts: "canary-v2-provider-receipts-private-v0.1.ndjson",
  evidence: "canary-v2-evidence-records-private-v0.1.ndjson",
  evaluation: "canary-v2-evaluation-private-v0.1.json",
  reviewSource: "canary-v2-review-workbook-source-private-v0.1.json",
  reviewWorkbook: "canary-v2-review-workbook-private-v0.1.xlsx",
  verification: "canary-v2-verification-private-v0.1.json",
});

export const V2B4_PUBLIC_REPORTS = Object.freeze({
  executionJson: "docs/analysis/m2-v2/M2-v2-canary-v2-execution-summary-v0.1.json",
  executionMarkdown: "docs/analysis/m2-v2/M2-v2-canary-v2-execution-summary-v0.1.md",
  qualityJson: "docs/analysis/m2-v2/M2-v2-canary-v2-quality-report-v0.1.json",
  qualityMarkdown: "docs/analysis/m2-v2/M2-v2-canary-v2-quality-report-v0.1.md",
  decisionJson: "docs/analysis/m2-v2/M2-v2-canary-v2-decision-v0.1.json",
  decisionMarkdown: "docs/analysis/m2-v2/M2-v2-canary-v2-decision-v0.1.md",
});

export const V2B4_BOUNDARIES = Object.freeze({
  full160Executed: false,
  v2CStarted: false,
  v2DStarted: false,
  modelTrainingPerformed: false,
  b4Changed: false,
  finalHoldoutOpened: false,
  c4Started: false,
  m3Started: false,
  released: false,
  pullRequest7MustRemainDraftOpen: true,
});

export function checkAndFreezeV2B4(root, options = {}) {
  const absoluteRoot = resolve(root);
  const privateStore = ensurePrivateStore(absoluteRoot, options);
  const canary = options.canaryManifest ?? readJson(join(absoluteRoot, options.canaryRelative ?? V2B4_CANARY_RELATIVE));
  const benchmark = options.benchmarkManifest ?? readJson(join(absoluteRoot, options.benchmarkRelative ?? V2B4_BENCHMARK_RELATIVE));
  const policyArtifact = options.governancePolicy ?? readJson(join(absoluteRoot, options.governanceRelative ?? V2B4_GOVERNANCE_RELATIVE));
  const policy = policyFromArtifact(policyArtifact);
  assertFrozenInputs(canary, benchmark, policyArtifact);
  const relay = loadRelayConfiguration(absoluteRoot, options.env);
  const candidate = buildV2B4Manifest({
    canary,
    benchmark,
    policy,
    relayBindingDigest: relay.bindingDigest,
    createdAt: options.createdAt ?? new Date().toISOString(),
  });
  const manifestPath = join(privateStore, V2B4_PRIVATE_FILES.manifest);
  const manifest = persistImmutable(manifestPath, candidate, "v2b4_manifest_changed");
  writeQueryLogs(join(privateStore, V2B4_PRIVATE_FILES.queryLogs), manifest);
  return {
    privateStore,
    manifest,
    policy,
    relayBindingDigest: relay.bindingDigest,
    apiConfigurationPresent: true,
  };
}

export function buildV2B4Manifest({ canary, benchmark, policy, relayBindingDigest, createdAt }) {
  if (!isIsoTimestamp(createdAt)) throw new Error("v2b4_created_at_invalid");
  const sampleByIdentity = new Map(canary.sample.map((work) => [work.identityDigest, work]));
  const primaryTasks = benchmark.logicalTasks
    .map((task) => buildLogicalTask(task, sampleByIdentity.get(task.identityDigest), "primary"))
    .sort((left, right) => left.workOrdinal - right.workOrdinal);
  const primaryByIdentity = new Map(primaryTasks.map((task) => [task.identityDigest, task]));
  const repeatTasks = canary.repeatSample.map((repeat, index) => {
    const primary = primaryByIdentity.get(repeat.identityDigest);
    if (!primary || repeat.standardWorkId !== sampleByIdentity.get(repeat.identityDigest)?.standardWorkId) {
      throw new Error("v2b4_repeat_identity_binding_invalid");
    }
    return {
      ...primary,
      runKind: "repeat",
      workOrdinal: index + 1,
      logicalTaskKey: sha256([primary.logicalTaskKey, "repeat", repeat.identityDigest]),
    };
  });
  const logicalTasks = [...primaryTasks, ...repeatTasks].map((task) => ({
    ...task,
    queryPlan: planV2B3SearchQueries({
      title: task.title,
      author: task.author,
      sourceType: task.sourceType,
      intent: task.combinedIntent,
    }),
  }));
  const physicalPlan = [];
  for (const task of logicalTasks) {
    for (const stage of ["search", "extraction"]) {
      for (const model of V2B4_MODELS) {
        physicalPlan.push({
          requestKey: sha256([
            "m2-v2-v2b4-request-v0.1",
            canary.canaryManifestDigest,
            task.logicalTaskKey,
            task.runKind,
            stage,
            model,
            V2B3_PIPELINE_VERSION,
          ]),
          logicalTaskKey: task.logicalTaskKey,
          identityDigest: task.identityDigest,
          workReference: task.workReference,
          runKind: task.runKind,
          workOrdinal: task.workOrdinal,
          model,
          stage,
          queryId: task.queryPlan[0].queryId,
        });
      }
    }
  }
  if (primaryTasks.length !== 10 || repeatTasks.length !== 5 || physicalPlan.length !== V2B4_REQUEST_CAP) {
    throw new Error("v2b4_frozen_population_or_request_count_invalid");
  }
  if (new Set(physicalPlan.map((item) => item.requestKey)).size !== physicalPlan.length) {
    throw new Error("v2b4_request_key_collision");
  }
  const payload = {
    schema: "m2.v2.canary-v2-execution-manifest.v0.1",
    privateOnly: true,
    immutable: true,
    status: "frozen_before_v2b4_dispatch",
    createdAt,
    parentManifestDigest: canary.parentManifestDigest,
    canaryManifestDigest: canary.canaryManifestDigest,
    sourceBenchmarkManifestDigest: benchmark.benchmarkManifestDigest,
    sourcePipelineVersion: V2B3_PIPELINE_VERSION,
    sourceRecordSchema: V2B3_SOURCE_RECORD_SCHEMA,
    extractionSchema: V2B3_EXTRACTION_SCHEMA,
    governanceSchema: V2B3_SOURCE_GOVERNANCE_SCHEMA,
    governancePolicyDigest: sha256(policy),
    relayBindingDigest,
    models: [...V2B4_MODELS],
    sampleCount: primaryTasks.length,
    repeatSampleCount: repeatTasks.length,
    logicalTaskCount: logicalTasks.length,
    plannedPhysicalRequestCount: physicalPlan.length,
    physicalRequestCap: V2B4_REQUEST_CAP,
    retryCount: V2B4_MAX_RETRIES,
    requestPolicy: {
      searchTimeoutMs: V2B4_SEARCH_TIMEOUT_MS,
      extractionTimeoutMs: V2B4_EXTRACTION_TIMEOUT_MS,
      searchMaxOutputTokens: V2B4_SEARCH_MAX_OUTPUT_TOKENS,
      extractionMaxOutputTokens: V2B4_EXTRACTION_MAX_OUTPUT_TOKENS,
      pairedModelConcurrency: 2,
      automaticRetry: false,
    },
    fairness: {
      sameWorks: true,
      sameQueries: true,
      samePromptTemplates: true,
      sameTokenLimits: true,
      sameTimeouts: true,
      sameExtractionSchema: true,
      failuresRemainInDenominator: true,
      failedSamplesMayBeReplaced: false,
      speedDoesNotSelectModel: true,
    },
    gateThresholds: {
      resolvedRateMinimum: 0.8,
      acceptedEvidenceCoverageMinimum: 0.6,
      highValueCoverageMinimum: 0.75,
      citationAlignmentMinimum: 1,
      availableAtCompletenessMinimum: 0.8,
      prohibitedSourceMaximum: 0,
      historicalBackfillMaximum: 0,
      repeatClaimAgreementMinimum: 0.8,
      maxTotalTokens: V2B4_MAX_TOTAL_TOKENS,
      maxAverageTokensPerDispatchedRequest: V2B4_MAX_AVERAGE_TOKENS_PER_DISPATCH,
      tokenUsageCompletenessRequired: true,
      repositoryTestsRequired: true,
    },
    logicalTasks,
    physicalPlan,
    boundaries: { ...V2B4_BOUNDARIES },
  };
  return withDigest(payload, "manifestDigest");
}

export async function runV2B4Canary(root, options = {}) {
  const absoluteRoot = resolve(root);
  const frozen = checkAndFreezeV2B4(absoluteRoot, options);
  const { privateStore, manifest, policy } = frozen;
  const cachePath = join(privateStore, V2B4_PRIVATE_FILES.cache);
  const statePath = join(privateStore, V2B4_PRIVATE_FILES.state);
  const receiptsPath = join(privateStore, V2B4_PRIVATE_FILES.receipts);
  const existing = existsSync(statePath);
  if (existing && options.resume !== true) throw new Error("v2b4_existing_execution_requires_resume");
  const cache = existsSync(cachePath) ? readJson(cachePath) : newCache(manifest);
  const state = existsSync(statePath) ? readJson(statePath) : newState(manifest);
  assertExecutionContainers(cache, state, manifest);
  const relay = loadRelayConfiguration(absoluteRoot, options.env);
  if (relay.bindingDigest !== manifest.relayBindingDigest) throw new Error("v2b4_relay_binding_changed");
  const taskByKey = new Map(manifest.logicalTasks.map((task) => [task.logicalTaskKey, task]));
  const planByTaskStage = groupPlan(manifest.physicalPlan);
  if (state.executionStatus !== "completed") for (const task of manifest.logicalTasks) {
    await executePair({
      task,
      stage: "search",
      items: planByTaskStage.get(`${task.logicalTaskKey}:search`),
      manifest,
      policy,
      relay,
      cache,
      state,
      cachePath,
      statePath,
      receiptsPath,
      fetchImpl: options.fetchImpl ?? globalThis.fetch,
      now: options.now ?? (() => new Date().toISOString()),
    });
    options.onProgress?.({
      runKind: task.runKind,
      stage: "search",
      completedPhysicalReceiptCount: state.completedPhysicalReceiptCount,
      dispatchedPhysicalRequestCount: state.dispatchedPhysicalRequestCount,
      physicalRequestCap: manifest.physicalRequestCap,
    });
    await executePair({
      task,
      stage: "extraction",
      items: planByTaskStage.get(`${task.logicalTaskKey}:extraction`),
      manifest,
      policy,
      relay,
      cache,
      state,
      cachePath,
      statePath,
      receiptsPath,
      fetchImpl: options.fetchImpl ?? globalThis.fetch,
      now: options.now ?? (() => new Date().toISOString()),
    });
    options.onProgress?.({
      runKind: task.runKind,
      stage: "extraction",
      completedPhysicalReceiptCount: state.completedPhysicalReceiptCount,
      dispatchedPhysicalRequestCount: state.dispatchedPhysicalRequestCount,
      physicalRequestCap: manifest.physicalRequestCap,
    });
  }
  const receipts = manifest.physicalPlan.map((item) => cache.entries[item.requestKey]);
  if (receipts.some((receipt) => !receipt)) throw new Error("v2b4_receipt_population_incomplete");
  state.executionStatus = "completed";
  state.completedPhysicalReceiptCount = receipts.length;
  state.dispatchedPhysicalRequestCount = receipts.filter((receipt) => receipt.dispatched).length;
  state.updatedAt = (options.now ?? (() => new Date().toISOString()))();
  checkpoint(cachePath, statePath, receiptsPath, cache, state, manifest);
  const evaluation = evaluateV2B4Canary({ manifest, receipts, policy });
  atomicWriteJson(join(privateStore, V2B4_PRIVATE_FILES.evaluation), evaluation);
  const evidenceRecords = buildEvidenceRecords(manifest, receipts, taskByKey);
  atomicWriteNdjson(join(privateStore, V2B4_PRIVATE_FILES.evidence), evidenceRecords);
  const reviewSource = buildReviewSource(manifest, evaluation, evidenceRecords, receipts, taskByKey);
  atomicWriteJson(join(privateStore, V2B4_PRIVATE_FILES.reviewSource), reviewSource);
  const reports = writeV2B4PublicReports(absoluteRoot, evaluation);
  return { manifest, state: readJson(statePath), receipts, evaluation, reports, privateStore };
}

export function evaluateV2B4Canary({ manifest, receipts, policy }) {
  if (manifest?.plannedPhysicalRequestCount !== V2B4_REQUEST_CAP || receipts?.length !== V2B4_REQUEST_CAP) {
    throw new Error("v2b4_evaluation_population_invalid");
  }
  const taskByKey = new Map(manifest.logicalTasks.map((task) => [task.logicalTaskKey, task]));
  const perModel = Object.fromEntries(V2B4_MODELS.map((model) => [model, evaluateModel(model, manifest, receipts, taskByKey, policy)]));
  const prohibitedDomains = unique(receipts
    .filter((receipt) => receipt.stage === "search")
    .flatMap((receipt) => receipt.normalizedResponse?.sourceRecords ?? [])
    .map((source) => source.domain)
    .filter((domain) => !(policy.researchAllowlist.approvedDomainEntries ?? []).includes(domain)));
  const historicalBackfillCount = sum(Object.values(perModel).map((metrics) => metrics.time.historicalBackfillCount));
  const gateItems = [
    gateForModels("resolved_rate", perModel, (metrics) => metrics.entity.resolvedRate, manifest.gateThresholds.resolvedRateMinimum, (value, threshold) => value >= threshold),
    gateForModels("accepted_evidence_coverage", perModel, (metrics) => metrics.evidence.acceptedEvidenceCoverage, manifest.gateThresholds.acceptedEvidenceCoverageMinimum, (value, threshold) => value >= threshold),
    gateForModels("high_value_coverage", perModel, (metrics) => metrics.evidence.highValueCoverage, manifest.gateThresholds.highValueCoverageMinimum, (value, threshold) => value >= threshold),
    gateForModels("citation_alignment", perModel, (metrics) => metrics.citation.alignmentRate, manifest.gateThresholds.citationAlignmentMinimum, (value, threshold) => value >= threshold),
    gateForModels("available_at_completeness", perModel, (metrics) => metrics.time.availableAtCompleteness, manifest.gateThresholds.availableAtCompletenessMinimum, (value, threshold) => value >= threshold),
    {
      id: "prohibited_source",
      threshold: manifest.gateThresholds.prohibitedSourceMaximum,
      observed: prohibitedDomains.length,
      passed: prohibitedDomains.length <= manifest.gateThresholds.prohibitedSourceMaximum,
    },
    {
      id: "historical_backfill",
      threshold: manifest.gateThresholds.historicalBackfillMaximum,
      observed: historicalBackfillCount,
      passed: historicalBackfillCount <= manifest.gateThresholds.historicalBackfillMaximum,
    },
    gateForModels("repeat_claim_agreement", perModel, (metrics) => metrics.reproducibility.claimAgreementRate, manifest.gateThresholds.repeatClaimAgreementMinimum, (value, threshold) => value >= threshold),
    {
      id: "token_cost_acceptable",
      threshold: {
        maxTotalTokens: manifest.gateThresholds.maxTotalTokens,
        maxAverageTokensPerDispatchedRequest: manifest.gateThresholds.maxAverageTokensPerDispatchedRequest,
        tokenUsageCompletenessRequired: true,
      },
      observed: Object.fromEntries(V2B4_MODELS.map((model) => [model, {
        tokenUsageComplete: perModel[model].cost.tokenUsageComplete,
        totalTokens: perModel[model].cost.totalTokens,
        averageTokensPerDispatchedRequest: perModel[model].cost.averageTokensPerDispatchedRequest,
      }])),
      passed: V2B4_MODELS.every((model) => perModel[model].cost.tokenBudgetAcceptable),
    },
    {
      id: "repository_tests",
      threshold: "all_required_commands_pass",
      observed: "pending_post_execution_validation",
      passed: false,
      postExecution: true,
    },
  ];
  const nonTestGatePassed = gateItems.filter((item) => item.id !== "repository_tests").every((item) => item.passed);
  const integrityIssues = validateIntegrity(manifest, receipts);
  const preliminaryDecision = integrityIssues.length
    ? "CANARY_FAIL"
    : nonTestGatePassed
      ? "CANARY_CONDITIONAL_PENDING_TESTS"
      : "CANARY_CONDITIONAL";
  const payload = {
    schema: "m2.v2.canary-v2-evaluation.v0.1",
    privateOnly: true,
    evaluatedAt: latestTimestamp(receipts.map((receipt) => receipt.capturedAt)),
    manifestDigest: manifest.manifestDigest,
    canaryManifestDigest: manifest.canaryManifestDigest,
    population: {
      primaryWorkCount: manifest.sampleCount,
      repeatWorkCount: manifest.repeatSampleCount,
      modelCount: V2B4_MODELS.length,
      plannedPhysicalRequestCount: manifest.plannedPhysicalRequestCount,
      failedSamplesReplaced: false,
    },
    perModel,
    governance: {
      policySchema: policy.schema,
      researchAllowlistStatus: policy.researchAllowlist.approvedDomainEntries.length ? "populated" : "empty_fail_closed",
      researchApprovedDomainCount: policy.researchAllowlist.approvedDomainEntries.length,
      modelAllowlistStatus: policy.modelAllowlist.approvedDomainEntries.length ? "populated" : "empty_by_default",
      modelApprovedDomainCount: policy.modelAllowlist.approvedDomainEntries.length,
      prohibitedSourceDomainCount: prohibitedDomains.length,
      prohibitedSourceDomainsPrivate: prohibitedDomains,
      implicitPromotionUsed: false,
    },
    gate: {
      items: gateItems,
      passedCount: gateItems.filter((item) => item.passed).length,
      totalCount: gateItems.length,
      nonTestGatePassed,
      integrityIssues,
      preliminaryDecision,
      full160Authorized: false,
    },
    costPolicy: {
      relayCostMode: "request_cap_only",
      monetaryPricingAvailable: false,
      estimatedRelayCost: null,
      estimatedRelayCostStatus: "not_estimable_no_provider_pricing",
      officialOpenAIPricingUsedForRelay: false,
    },
    boundaries: { ...V2B4_BOUNDARIES },
  };
  return withDigest(payload, "evaluationDigest");
}

export function finalizeV2B4Decision(root, validation, options = {}) {
  const absoluteRoot = resolve(root);
  const privateStore = ensurePrivateStore(absoluteRoot, options);
  const evaluationPath = join(privateStore, V2B4_PRIVATE_FILES.evaluation);
  const evaluation = readJson(evaluationPath);
  const required = ["checkNoRealData", "lint", "build", "npmTest", "smoke", "e2e"];
  const testsPassed = required.every((key) => validation?.[key]?.status === "PASS");
  const items = evaluation.gate.items.map((item) => item.id === "repository_tests"
    ? { ...item, observed: validation, passed: testsPassed }
    : item);
  const integrityIssues = evaluation.gate.integrityIssues;
  const allPassed = items.every((item) => item.passed);
  const finalDecision = integrityIssues.length
    ? "CANARY_FAIL"
    : allPassed
      ? "CANARY_PASS"
      : "CANARY_CONDITIONAL";
  const updatedPayload = {
    ...evaluation,
    gate: {
      ...evaluation.gate,
      items,
      passedCount: items.filter((item) => item.passed).length,
      totalCount: items.length,
      nonTestGatePassed: items.filter((item) => item.id !== "repository_tests").every((item) => item.passed),
      testsPassed,
      finalDecision,
      full160Authorized: finalDecision === "CANARY_PASS",
    },
    validation,
  };
  const updated = withReplacedDigest(updatedPayload, "evaluationDigest");
  atomicWriteJson(evaluationPath, updated);
  const reviewSourcePath = join(privateStore, V2B4_PRIVATE_FILES.reviewSource);
  if (existsSync(reviewSourcePath)) {
    const reviewSource = readJson(reviewSourcePath);
    atomicWriteJson(reviewSourcePath, {
      ...reviewSource,
      evaluationDigest: updated.evaluationDigest,
      generatedAt: updated.evaluatedAt,
      decision: finalDecision,
      perModel: updated.perModel,
      gateItems: updated.gate.items,
    });
  }
  writeV2B4PublicReports(absoluteRoot, updated);
  return updated;
}

export function writeV2B4PublicReports(root, evaluation) {
  const bundle = buildPublicBundle(evaluation);
  const documents = {
    [V2B4_PUBLIC_REPORTS.executionJson]: `${JSON.stringify(bundle.execution, null, 2)}\n`,
    [V2B4_PUBLIC_REPORTS.executionMarkdown]: renderExecutionMarkdown(bundle.execution),
    [V2B4_PUBLIC_REPORTS.qualityJson]: `${JSON.stringify(bundle.quality, null, 2)}\n`,
    [V2B4_PUBLIC_REPORTS.qualityMarkdown]: renderQualityMarkdown(bundle.quality),
    [V2B4_PUBLIC_REPORTS.decisionJson]: `${JSON.stringify(bundle.decision, null, 2)}\n`,
    [V2B4_PUBLIC_REPORTS.decisionMarkdown]: renderDecisionMarkdown(bundle.decision),
  };
  for (const [relative, content] of Object.entries(documents)) {
    assertPublicSanitized(content);
    atomicWriteText(join(root, relative), content);
  }
  return { bundle, publicReports: Object.keys(documents) };
}

export function verifyV2B4(root, options = {}) {
  const absoluteRoot = resolve(root);
  const privateStore = ensurePrivateStore(absoluteRoot, options);
  const issues = [];
  const manifest = readJson(join(privateStore, V2B4_PRIVATE_FILES.manifest));
  const evaluation = readJson(join(privateStore, V2B4_PRIVATE_FILES.evaluation));
  const receipts = readNdjson(join(privateStore, V2B4_PRIVATE_FILES.receipts));
  if (manifest.manifestDigest !== digestWithout(manifest, "manifestDigest")) issues.push("manifest_digest_invalid");
  if (evaluation.evaluationDigest !== digestWithout(evaluation, "evaluationDigest")) issues.push("evaluation_digest_invalid");
  issues.push(...validateIntegrity(manifest, receipts));
  if (evaluation.gate.full160Authorized !== (evaluation.gate.finalDecision === "CANARY_PASS")) issues.push("full160_authorization_decision_mismatch");
  for (const relative of Object.values(V2B4_PUBLIC_REPORTS)) {
    if (!existsSync(join(absoluteRoot, relative))) issues.push(`public_report_missing:${basename(relative)}`);
    else {
      try { assertPublicSanitized(readFileSync(join(absoluteRoot, relative), "utf8")); } catch (error) { issues.push(String(error.message)); }
    }
  }
  const workbookPath = join(privateStore, V2B4_PRIVATE_FILES.reviewWorkbook);
  if (!existsSync(workbookPath)) issues.push("review_workbook_missing");
  else if (!isXlsxContainer(workbookPath)) issues.push("review_workbook_invalid_xlsx_container");
  const result = withDigest({
    schema: "m2.v2.canary-v2-verification.v0.1",
    privateOnly: true,
    verifiedAt: options.verifiedAt ?? new Date().toISOString(),
    manifestDigest: manifest.manifestDigest,
    evaluationDigest: evaluation.evaluationDigest,
    allPassed: issues.length === 0,
    issues: unique(issues),
    privateArtifactsIgnoredAndUntracked: privateStoreIgnoredAndUntracked(absoluteRoot),
    reviewWorkbookPresentAndXlsxContainerValid: existsSync(workbookPath) && isXlsxContainer(workbookPath),
    boundaries: { ...V2B4_BOUNDARIES },
  }, "verificationDigest");
  atomicWriteJson(join(privateStore, V2B4_PRIVATE_FILES.verification), result);
  return result;
}

export function readV2B4Evaluation(root, options = {}) {
  const privateStore = ensurePrivateStore(resolve(root), options);
  return readJson(join(privateStore, V2B4_PRIVATE_FILES.evaluation));
}

function buildLogicalTask(task, work, runKind) {
  if (!work || task.title !== work.title || task.author !== work.author || task.sourceType !== work.sourceType) {
    throw new Error("v2b4_benchmark_canary_identity_mismatch");
  }
  return {
    logicalTaskKey: task.logicalTaskKey,
    workReference: task.workReference,
    identityDigest: task.identityDigest,
    workOrdinal: task.workOrdinal,
    runKind,
    title: task.title,
    author: task.author,
    sourceType: task.sourceType,
    combinedIntent: task.combinedIntent,
    highValue: work.highValue === true,
    canarySlotId: work.canarySlotId,
  };
}

async function executePair(context) {
  const { items, cache, state, manifest, now } = context;
  if (!Array.isArray(items) || items.length !== 2) throw new Error("v2b4_pair_population_invalid");
  const dispatch = [];
  for (const item of items) {
    if (cache.entries[item.requestKey]) continue;
    const reservation = state.reservations[item.requestKey];
    if (reservation) {
      cache.entries[item.requestKey] = buildSyntheticReceipt(item, manifest, {
        status: "indeterminate_after_crash_no_retry",
        dispatched: false,
        providerConnectivityPassed: false,
        providerContractCompatible: false,
        modelBindingVerified: false,
        validationIssues: ["prior_budget_reservation_without_receipt"],
        capturedAt: now(),
      });
      reservation.status = "indeterminate_after_crash";
      reservation.completedAt = now();
      reservation.receiptDigest = cache.entries[item.requestKey].receiptDigest;
      continue;
    }
    if (item.stage === "extraction") {
      const searchItem = manifest.physicalPlan.find((candidate) => candidate.logicalTaskKey === item.logicalTaskKey && candidate.model === item.model && candidate.stage === "search");
      const searchReceipt = cache.entries[searchItem?.requestKey];
      if (!searchReceiptAllowsExtraction(searchReceipt)) {
        cache.entries[item.requestKey] = buildSyntheticReceipt(item, manifest, {
          status: "blocked_search_dependency",
          dispatched: false,
          providerConnectivityPassed: false,
          providerContractCompatible: false,
          modelBindingVerified: false,
          validationIssues: [searchReceipt ? `search_dependency:${searchReceipt.status}` : "search_dependency_missing"],
          capturedAt: now(),
        });
        state.reservations[item.requestKey] = completedReservation(item, cache.entries[item.requestKey], now());
        continue;
      }
    }
    state.reservations[item.requestKey] = {
      requestKey: item.requestKey,
      model: item.model,
      stage: item.stage,
      status: "reserved",
      reservedAt: now(),
      completedAt: null,
      receiptDigest: null,
      retryCount: 0,
    };
    dispatch.push(item);
  }
  checkpoint(context.cachePath, context.statePath, context.receiptsPath, cache, state, manifest);
  const results = await Promise.all(dispatch.map(async (item) => {
    try {
      return await executePhysicalRequest(item, context);
    } catch (error) {
      return buildSyntheticReceipt(item, manifest, {
        status: "executor_error",
        dispatched: true,
        providerConnectivityPassed: false,
        providerContractCompatible: false,
        modelBindingVerified: false,
        validationIssues: [safeErrorToken(error?.message) ?? "executor_error"],
        capturedAt: now(),
      });
    }
  }));
  for (const receipt of results) {
    cache.entries[receipt.requestKey] = receipt;
    state.reservations[receipt.requestKey] = completedReservation(
      items.find((item) => item.requestKey === receipt.requestKey),
      receipt,
      now(),
      state.reservations[receipt.requestKey]?.reservedAt,
    );
  }
  checkpoint(context.cachePath, context.statePath, context.receiptsPath, cache, state, manifest);
}

async function executePhysicalRequest(item, context) {
  const { task, manifest, policy, relay, cache, fetchImpl } = context;
  let payload;
  let sourceRecords = [];
  if (item.stage === "search") {
    payload = buildV2B3SearchPayload({
      model: item.model,
      plan: task.queryPlan,
      maxOutputTokens: manifest.requestPolicy.searchMaxOutputTokens,
    });
  } else {
    const searchItem = manifest.physicalPlan.find((candidate) => candidate.logicalTaskKey === item.logicalTaskKey && candidate.model === item.model && candidate.stage === "search");
    sourceRecords = cache.entries[searchItem.requestKey].normalizedResponse.sourceRecords;
    payload = buildV2B3ExtractionPayload({
      model: item.model,
      sourceRecords,
      maxOutputTokens: manifest.requestPolicy.extractionMaxOutputTokens,
    });
  }
  const response = await dispatchRelayResponse({
    fetchImpl,
    baseUrl: relay.baseUrl,
    apiKey: relay.apiKey,
    payload,
    timeoutMs: item.stage === "search" ? manifest.requestPolicy.searchTimeoutMs : manifest.requestPolicy.extractionTimeoutMs,
  });
  const root = responseRoot(response.json);
  const returnedModelId = safeModelId(root?.model);
  const modelBindingVerified = returnedModelId === item.model;
  const normalized = item.stage === "search"
    ? normalizeV2B3SearchResponse(response.json, {
        capturedAt: response.capturedAt,
        providerId: "openai_compatible_relay",
        requestedModelId: item.model,
        responseId: root?.id,
        receiptDigest: response.responseDigest,
      })
    : normalizeV2B3ExtractionResponse(response.json, { sourceRecords, governancePolicy: policy });
  const entity = item.stage === "extraction" ? classifyEntity(normalized, task) : null;
  const contractCompatible = response.connectivityPassed && normalized.contractValid === true;
  const status = !response.connectivityPassed
    ? response.status
    : !modelBindingVerified
      ? "model_binding_mismatch"
      : contractCompatible
        ? "success"
        : `${item.stage}_contract_failure`;
  const usage = extractUsage(response.json);
  return finalizeReceipt({
    schema: "m2.v2.canary-v2-physical-receipt.v0.1",
    privateOnly: true,
    manifestDigest: manifest.manifestDigest,
    relayBindingDigest: manifest.relayBindingDigest,
    requestKey: item.requestKey,
    logicalTaskKey: item.logicalTaskKey,
    identityDigest: item.identityDigest,
    workReference: item.workReference,
    runKind: item.runKind,
    stage: item.stage,
    requestedModelId: item.model,
    returnedModelId,
    modelBindingVerified,
    pipelineVersion: V2B3_PIPELINE_VERSION,
    sourceRecordSchema: V2B3_SOURCE_RECORD_SCHEMA,
    extractionSchema: V2B3_EXTRACTION_SCHEMA,
    dispatched: true,
    retryCount: 0,
    httpStatus: response.httpStatus,
    providerConnectivityPassed: response.connectivityPassed,
    providerContractCompatible: contractCompatible,
    status,
    responseContentTypeClass: contentTypeClass(response.contentType),
    responseDigest: response.responseDigest,
    responseByteLength: response.rawByteLength,
    normalizedResponse: normalized,
    entity,
    inputSourceRecords: sourceRecords,
    usage,
    latencyMs: response.latencyMs,
    capturedAt: response.capturedAt,
    validationIssues: normalized.issues ?? [],
    rawResponsePersisted: false,
    authorizationHeaderPersisted: false,
    apiKeyPersisted: false,
    full160Authorized: false,
  });
}

async function dispatchRelayResponse({ fetchImpl, baseUrl, apiKey, payload, timeoutMs }) {
  if (typeof fetchImpl !== "function") throw new Error("v2b4_fetch_unavailable");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  const capturedAt = new Date().toISOString();
  let response = null;
  let bytes = Buffer.alloc(0);
  let json = null;
  let transportError = null;
  try {
    response = await fetchImpl(`${baseUrl}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "m2-v2-v2b4-real-evidence-canary/0.1",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length <= RESPONSE_LIMIT_BYTES) {
      try { json = JSON.parse(bytes.toString("utf8")); } catch { json = null; }
    }
  } catch (error) {
    transportError = safeErrorToken(error?.name ?? error?.message) ?? "transport_error";
  } finally {
    clearTimeout(timeout);
  }
  const httpStatus = response?.status ?? null;
  const contentType = response?.headers?.get?.("content-type") ?? null;
  const connectivityPassed = response?.ok === true && isObject(json);
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
    connectivityPassed: Boolean(connectivityPassed),
    status,
    latencyMs: Math.round(performance.now() - started),
    capturedAt,
  };
}

function evaluateModel(model, manifest, receipts, taskByKey, policy) {
  const modelReceipts = receipts.filter((receipt) => receipt.requestedModelId === model);
  const primarySearch = modelReceipts.filter((receipt) => receipt.runKind === "primary" && receipt.stage === "search");
  const repeatSearch = modelReceipts.filter((receipt) => receipt.runKind === "repeat" && receipt.stage === "search");
  const allSearch = [...primarySearch, ...repeatSearch];
  const primaryExtraction = modelReceipts.filter((receipt) => receipt.runKind === "primary" && receipt.stage === "extraction");
  const allSearchSources = primarySearch.flatMap((receipt) => receipt.normalizedResponse?.sourceRecords ?? []);
  const extracted = primaryExtraction.map((receipt) => ({ receipt, task: taskByKey.get(receipt.logicalTaskKey) }));
  const evidenceItems = extracted.flatMap(({ receipt, task }) => (receipt.normalizedResponse?.evaluatedEvidence ?? []).map((item) => ({ ...item, task, receipt })));
  const accepted = evidenceItems.filter((item) => item.accepted);
  const rejected = evidenceItems.filter((item) => !item.accepted);
  const worksWithAccepted = unique(accepted.map((item) => item.task.identityDigest));
  const highValueTasks = manifest.logicalTasks.filter((task) => task.runKind === "primary" && task.highValue);
  const highValueWithAccepted = unique(accepted.filter((item) => item.task.highValue).map((item) => item.task.identityDigest));
  const entityRows = extracted.map(({ receipt, task }) => receipt.entity ?? { classification: "unresolved", confidence: null, identityDigest: task.identityDigest });
  const alignedCount = accepted.filter((item) => citationAligned(item, item.receipt)).length;
  const mappedCount = accepted.filter((item) => sourceMapped(item, item.receipt)).length;
  const availableAtCount = accepted.filter((item) => isIsoTimestamp(item.evidence?.availableAt)).length;
  const eventTimeCount = accepted.filter((item) => isIsoTimestamp(item.evidence?.eventTime)).length;
  const capturedAtCount = allSearchSources.filter((source) => isIsoTimestamp(source.capturedAt)).length;
  const historicalBackfillCount = accepted.filter((item) => {
    const availableAt = item.evidence?.availableAt;
    return isIsoTimestamp(availableAt) && Date.parse(availableAt) > Date.parse(item.receipt.capturedAt);
  }).length;
  const unresolvedConflictCount = evidenceItems.filter((item) => item.evidence?.contradictionStatus !== "none").length;
  const prohibitedSources = unique(allSearchSources.filter((source) => !(policy.researchAllowlist.approvedDomainEntries ?? []).includes(source.domain)).map((source) => source.domain));
  const dispatched = modelReceipts.filter((receipt) => receipt.dispatched);
  const usageObserved = dispatched.filter((receipt) => Number.isFinite(receipt.usage?.totalTokens));
  const tokenUsageComplete = dispatched.length > 0 && usageObserved.length === dispatched.length;
  const observedInputTokens = sum(usageObserved.map((receipt) => receipt.usage.inputTokens));
  const observedOutputTokens = sum(usageObserved.map((receipt) => receipt.usage.outputTokens));
  const observedTotalTokens = sum(usageObserved.map((receipt) => receipt.usage.totalTokens));
  const totalTokens = tokenUsageComplete ? observedTotalTokens : null;
  const averageTokensPerDispatchedRequest = tokenUsageComplete ? ratio(totalTokens, dispatched.length) : null;
  const tokenBudgetAcceptable = tokenUsageComplete
    && totalTokens <= manifest.gateThresholds.maxTotalTokens / V2B4_MODELS.length
    && averageTokensPerDispatchedRequest <= manifest.gateThresholds.maxAverageTokensPerDispatchedRequest;
  return {
    model,
    search: {
      plannedQueries: primarySearch.length,
      dispatchedQueries: primarySearch.filter((receipt) => receipt.dispatched).length,
      providerResponseCount: primarySearch.filter((receipt) => receipt.providerConnectivityPassed).length,
      providerConnectivityRate: ratio(primarySearch.filter((receipt) => receipt.providerConnectivityPassed).length, primarySearch.length),
      webSearchObservedCount: primarySearch.filter((receipt) => receipt.normalizedResponse?.webSearchObserved === true).length,
      successCount: primarySearch.filter((receipt) => receipt.status === "success").length,
      successRate: ratio(primarySearch.filter((receipt) => receipt.status === "success").length, primarySearch.length),
      providerErrorCount: primarySearch.filter((receipt) => receipt.dispatched && !receipt.providerConnectivityPassed).length,
      modelBindingMismatchCount: primarySearch.filter((receipt) => receipt.dispatched && !receipt.modelBindingVerified).length,
      resultCount: allSearchSources.length,
      resultWorkCount: unique(primarySearch.filter((receipt) => (receipt.normalizedResponse?.sourceRecordCount ?? 0) > 0).map((receipt) => receipt.identityDigest)).length,
      sourceRecordMissingCount: primarySearch.filter((receipt) => (receipt.normalizedResponse?.sourceRecordCount ?? 0) === 0).length,
      repeatPlannedQueries: repeatSearch.length,
      repeatDispatchedQueries: repeatSearch.filter((receipt) => receipt.dispatched).length,
      repeatProviderErrorCount: repeatSearch.filter((receipt) => receipt.dispatched && !receipt.providerConnectivityPassed).length,
      allRunProviderErrorCount: allSearch.filter((receipt) => receipt.dispatched && !receipt.providerConnectivityPassed).length,
      allRunWebSearchObservedCount: allSearch.filter((receipt) => receipt.normalizedResponse?.webSearchObserved === true).length,
      allRunSuccessCount: allSearch.filter((receipt) => receipt.status === "success").length,
      allRunResultCount: sum(allSearch.map((receipt) => receipt.normalizedResponse?.sourceRecordCount ?? 0)),
      failureReasonCounts: countBy(primarySearch.filter((receipt) => receipt.status !== "success"), (receipt) => receipt.status),
    },
    extraction: {
      plannedRequests: primaryExtraction.length,
      dispatchedRequests: primaryExtraction.filter((receipt) => receipt.dispatched).length,
      providerResponseCount: primaryExtraction.filter((receipt) => receipt.providerConnectivityPassed).length,
      dependencyBlockedCount: primaryExtraction.filter((receipt) => receipt.status === "blocked_search_dependency").length,
      contractSuccessCount: primaryExtraction.filter((receipt) => receipt.status === "success").length,
      contractSuccessRate: ratio(primaryExtraction.filter((receipt) => receipt.status === "success").length, primaryExtraction.length),
      failureReasonCounts: countBy(primaryExtraction.filter((receipt) => receipt.status !== "success"), (receipt) => receipt.status),
    },
    entity: {
      resolved: entityRows.filter((row) => row.classification === "resolved").length,
      unresolved: entityRows.filter((row) => row.classification === "unresolved").length,
      ambiguous: entityRows.filter((row) => row.classification === "ambiguous").length,
      resolvedRate: ratio(entityRows.filter((row) => row.classification === "resolved").length, manifest.sampleCount),
      confidenceObservedCount: entityRows.filter((row) => Number.isFinite(row.confidence)).length,
      meanConfidence: average(entityRows.map((row) => row.confidence).filter(Number.isFinite)),
      medianConfidence: percentile(entityRows.map((row) => row.confidence).filter(Number.isFinite), 0.5),
    },
    evidence: {
      candidateCount: evidenceItems.length,
      acceptedCount: accepted.length,
      rejectedCount: rejected.length,
      rejectionReasonCounts: countMany(rejected.flatMap((item) => item.rejectionReasons ?? [])),
      acceptedEvidenceWorkCount: worksWithAccepted.length,
      acceptedEvidenceCoverage: ratio(worksWithAccepted.length, manifest.sampleCount),
      highValueWorkCount: highValueTasks.length,
      highValueAcceptedWorkCount: highValueWithAccepted.length,
      highValueCoverage: ratio(highValueWithAccepted.length, highValueTasks.length),
      researchEligibleCount: accepted.filter((item) => item.researchEligible).length,
      modelEligibleCount: accepted.filter((item) => item.modelEligible).length,
    },
    citation: {
      acceptedEvidenceCount: accepted.length,
      alignedCount,
      alignmentRate: accepted.length ? ratio(alignedCount, accepted.length) : 0,
      alignmentEvaluable: accepted.length > 0,
      sourceMappedCount: mappedCount,
      sourceMappingRate: accepted.length ? ratio(mappedCount, accepted.length) : 0,
      sourceMappingEvaluable: accepted.length > 0,
    },
    time: {
      sourceRecordCount: allSearchSources.length,
      capturedAtCount,
      capturedAtCompleteness: ratio(capturedAtCount, allSearchSources.length),
      receiptCount: modelReceipts.length,
      receiptCapturedAtCount: modelReceipts.filter((receipt) => isIsoTimestamp(receipt.capturedAt)).length,
      receiptCapturedAtCompleteness: ratio(modelReceipts.filter((receipt) => isIsoTimestamp(receipt.capturedAt)).length, modelReceipts.length),
      acceptedEvidenceCount: accepted.length,
      availableAtCount,
      availableAtCompleteness: accepted.length ? ratio(availableAtCount, accepted.length) : 0,
      eventTimeCount,
      eventTimeCompleteness: accepted.length ? ratio(eventTimeCount, accepted.length) : 0,
      historicalBackfillCount,
    },
    governance: {
      researchAllowlistStatus: policy.researchAllowlist.approvedDomainEntries.length ? "populated" : "empty_fail_closed",
      prohibitedSourceDomainCount: prohibitedSources.length,
      unresolvedConflictCount,
      implicitPromotionUsed: false,
    },
    reproducibility: evaluateRepeatAgreement(model, manifest, receipts, taskByKey),
    cost: {
      plannedRequestCount: modelReceipts.length,
      dispatchedRequestCount: dispatched.length,
      usageObservedRequestCount: usageObserved.length,
      usageMissingRequestCount: dispatched.length - usageObserved.length,
      tokenUsageComplete,
      observedInputTokens,
      observedOutputTokens,
      observedTotalTokens,
      totalTokens,
      averageTokensPerDispatchedRequest,
      tokenBudgetAcceptable,
      latencyP50Ms: percentile(dispatched.map((receipt) => receipt.latencyMs).filter(Number.isFinite), 0.5),
      latencyP90Ms: percentile(dispatched.map((receipt) => receipt.latencyMs).filter(Number.isFinite), 0.9),
      estimatedRelayCost: null,
      estimatedRelayCostStatus: "not_estimable_no_provider_pricing",
    },
  };
}

function evaluateRepeatAgreement(model, manifest, receipts, taskByKey) {
  const pairs = [];
  const repeatTasks = manifest.logicalTasks.filter((task) => task.runKind === "repeat");
  for (const repeat of repeatTasks) {
    const primary = manifest.logicalTasks.find((task) => task.runKind === "primary" && task.identityDigest === repeat.identityDigest);
    const primaryReceipt = receipts.find((receipt) => receipt.requestedModelId === model && receipt.stage === "extraction" && receipt.logicalTaskKey === primary.logicalTaskKey);
    const repeatReceipt = receipts.find((receipt) => receipt.requestedModelId === model && receipt.stage === "extraction" && receipt.logicalTaskKey === repeat.logicalTaskKey);
    const primaryClaims = claimSignatures(primaryReceipt);
    const repeatClaims = claimSignatures(repeatReceipt);
    const evaluable = primaryClaims.length > 0 && repeatClaims.length > 0;
    const union = new Set([...primaryClaims, ...repeatClaims]);
    const intersection = primaryClaims.filter((claim) => repeatClaims.includes(claim));
    const similarity = evaluable ? ratio(intersection.length, union.size) : null;
    pairs.push({
      identityDigest: repeat.identityDigest,
      primaryLogicalTaskKey: primary.logicalTaskKey,
      repeatLogicalTaskKey: repeat.logicalTaskKey,
      evaluable,
      similarity,
      agreed: evaluable && similarity >= manifest.gateThresholds.repeatClaimAgreementMinimum,
      primaryClaimCount: primaryClaims.length,
      repeatClaimCount: repeatClaims.length,
    });
  }
  return {
    repeatWorkCount: repeatTasks.length,
    evaluableWorkCount: pairs.filter((pair) => pair.evaluable).length,
    agreedWorkCount: pairs.filter((pair) => pair.agreed).length,
    claimAgreementRate: ratio(pairs.filter((pair) => pair.agreed).length, repeatTasks.length),
    meanJaccardAmongEvaluable: average(pairs.map((pair) => pair.similarity).filter(Number.isFinite)),
    pairs,
  };
}

function classifyEntity(normalized, task) {
  const accepted = (normalized.evaluatedEvidence ?? []).filter((item) => item.accepted);
  const rows = accepted.map((item) => item.evidence).filter(Boolean);
  const exactResolved = rows.filter((evidence) => (
    ["high", "medium"].includes(evidence.entityResolution?.status)
      && normalizeEntityText(evidence.entityResolution?.matchedTitle) === normalizeEntityText(task.title)
      && normalizeEntityText(evidence.entityResolution?.matchedAuthor) === normalizeEntityText(task.author)
  ));
  const ambiguous = rows.some((evidence) => (
    evidence.entityResolution?.status === "low"
      || evidence.contradictionStatus !== "none"
      || (["high", "medium"].includes(evidence.entityResolution?.status)
        && (normalizeEntityText(evidence.entityResolution?.matchedTitle) !== normalizeEntityText(task.title)
          || normalizeEntityText(evidence.entityResolution?.matchedAuthor) !== normalizeEntityText(task.author)))
  ));
  return {
    classification: exactResolved.length ? "resolved" : ambiguous ? "ambiguous" : "unresolved",
    confidence: exactResolved.length
      ? Math.max(...exactResolved.map((evidence) => evidence.confidence).filter(Number.isFinite))
      : rows.length ? Math.max(...rows.map((evidence) => evidence.confidence).filter(Number.isFinite), 0) : null,
    exactMatchEvidenceCount: exactResolved.length,
    evaluatedEvidenceCount: rows.length,
  };
}

function claimSignatures(receipt) {
  return unique((receipt?.normalizedResponse?.evaluatedEvidence ?? [])
    .filter((item) => item.accepted)
    .map((item) => sha256({
      claimType: item.evidence.claimType,
      structuredValue: item.evidence.structuredValue,
      claim: normalizeEntityText(item.evidence.claim),
    })))
    .sort();
}

function citationAligned(item, receipt) {
  const sourceIds = item.evidence?.sourceIds ?? [];
  const sources = sourceRecordsForExtraction(receipt);
  return sourceIds.length > 0 && sourceIds.every((sourceId) => {
    const source = sources.find((candidate) => candidate.sourceId === sourceId);
    return source?.citation?.type === "url_citation" && /^cit_[a-f0-9]{20}$/u.test(source.citation.citationId);
  });
}

function sourceMapped(item, receipt) {
  const sources = sourceRecordsForExtraction(receipt);
  return (item.evidence?.sourceIds ?? []).length > 0
    && item.evidence.sourceIds.every((sourceId) => sources.some((source) => source.sourceId === sourceId));
}

function sourceRecordsForExtraction(receipt) {
  return receipt?.inputSourceRecords ?? receipt?.normalizedResponse?.inputSourceRecords ?? [];
}

function buildEvidenceRecords(manifest, receipts, taskByKey) {
  const records = [];
  for (const receipt of receipts.filter((item) => item.stage === "extraction")) {
    const task = taskByKey.get(receipt.logicalTaskKey);
    const searchReceipt = receipts.find((item) => item.stage === "search" && item.logicalTaskKey === receipt.logicalTaskKey && item.requestedModelId === receipt.requestedModelId);
    for (const [index, evaluated] of (receipt.normalizedResponse?.evaluatedEvidence ?? []).entries()) {
      records.push({
        schema: "m2.v2.canary-v2-evidence-record-private.v0.1",
        privateOnly: true,
        manifestDigest: manifest.manifestDigest,
        identityDigest: receipt.identityDigest,
        workReference: receipt.workReference,
        title: task.title,
        author: task.author,
        highValue: task.highValue,
        runKind: receipt.runKind,
        model: receipt.requestedModelId,
        evidenceOrdinal: index + 1,
        evidence: evaluated.evidence,
        accepted: evaluated.accepted,
        rejectionReasons: evaluated.rejectionReasons,
        researchEligible: evaluated.researchEligible,
        modelEligible: evaluated.modelEligible,
        modelEligibilityReasons: evaluated.modelEligibilityReasons,
        entityClassification: receipt.entity?.classification ?? "unresolved",
        sourceRecords: (searchReceipt?.normalizedResponse?.sourceRecords ?? []).filter((source) => evaluated.evidence?.sourceIds?.includes(source.sourceId)),
        capturedAt: receipt.capturedAt,
      });
    }
  }
  return records;
}

function buildReviewSource(manifest, evaluation, evidenceRecords, receipts, taskByKey) {
  const requestReviewRows = receipts.map((receipt) => {
    const task = taskByKey.get(receipt.logicalTaskKey);
    return {
      workReference: receipt.workReference,
      title: task.title,
      author: task.author,
      highValue: task.highValue,
      runKind: receipt.runKind,
      model: receipt.requestedModelId,
      stage: receipt.stage,
      dispatched: receipt.dispatched,
      status: receipt.status,
      providerConnectivityPassed: receipt.providerConnectivityPassed,
      modelBindingVerified: receipt.modelBindingVerified,
      providerContractCompatible: receipt.providerContractCompatible,
      sourceRecordCount: receipt.stage === "search" ? receipt.normalizedResponse?.sourceRecordCount ?? 0 : null,
      candidateCount: receipt.stage === "extraction" ? receipt.normalizedResponse?.evaluatedEvidence?.length ?? 0 : null,
      acceptedCount: receipt.stage === "extraction" ? receipt.normalizedResponse?.acceptedEvidenceCount ?? 0 : null,
      validationIssues: receipt.validationIssues,
      inputTokens: receipt.usage?.inputTokens,
      outputTokens: receipt.usage?.outputTokens,
      totalTokens: receipt.usage?.totalTokens,
      latencyMs: receipt.latencyMs,
      capturedAt: receipt.capturedAt,
    };
  });
  return {
    schema: "m2.v2.canary-v2-review-workbook-source.v0.1",
    privateOnly: true,
    manifestDigest: manifest.manifestDigest,
    evaluationDigest: evaluation.evaluationDigest,
    generatedAt: evaluation.evaluatedAt,
    decision: evaluation.gate.preliminaryDecision,
    perModel: evaluation.perModel,
    requestReviewRows,
    evidenceRecords,
    gateItems: evaluation.gate.items,
    boundaries: { ...V2B4_BOUNDARIES },
  };
}

function buildPublicBundle(evaluation) {
  const finalDecision = evaluation.gate.finalDecision ?? evaluation.gate.preliminaryDecision;
  const generatedAt = evaluation.evaluatedAt;
  const modelAggregates = Object.fromEntries(V2B4_MODELS.map((model) => [model, publicModelMetrics(evaluation.perModel[model])]));
  const common = {
    status: "not_for_formal_decision",
    generatedAt,
    immutableBindings: {
      canaryManifestDigest: evaluation.canaryManifestDigest,
      executionManifestDigest: evaluation.manifestDigest,
      failedSamplesReplaced: false,
    },
    boundaries: { ...V2B4_BOUNDARIES },
  };
  return {
    execution: {
      schema: "m2.v2.canary-v2-execution-summary.v0.1",
      ...common,
      population: evaluation.population,
      modelAggregates,
      providerDispatchCount: sum(Object.values(evaluation.perModel).map((value) => value.cost.dispatchedRequestCount)),
      privateArtifacts: {
        queryLogs: true,
        providerReceipts: true,
        evidenceRecords: true,
        reviewWorkbook: true,
        committed: false,
      },
    },
    quality: {
      schema: "m2.v2.canary-v2-quality-report.v0.1",
      ...common,
      modelAggregates,
      governance: {
        policySchema: evaluation.governance.policySchema,
        researchAllowlistStatus: evaluation.governance.researchAllowlistStatus,
        researchApprovedDomainCount: evaluation.governance.researchApprovedDomainCount,
        modelAllowlistStatus: evaluation.governance.modelAllowlistStatus,
        modelApprovedDomainCount: evaluation.governance.modelApprovedDomainCount,
        prohibitedSourceDomainCount: evaluation.governance.prohibitedSourceDomainCount,
        implicitPromotionUsed: false,
      },
      costPolicy: evaluation.costPolicy,
    },
    decision: {
      schema: "m2.v2.canary-v2-decision.v0.1",
      ...common,
      gateItems: evaluation.gate.items,
      passedCount: evaluation.gate.passedCount,
      totalCount: evaluation.gate.totalCount,
      finalDecision,
      full160Authorized: evaluation.gate.full160Authorized === true,
      blockers: evaluation.gate.items.filter((item) => !item.passed).map((item) => item.id),
      modelSelectionPerformed: false,
      modelTrainingPerformed: false,
    },
  };
}

function publicModelMetrics(value) {
  return {
    search: value.search,
    extraction: value.extraction,
    entity: value.entity,
    evidence: value.evidence,
    citation: value.citation,
    time: value.time,
    governance: value.governance,
    reproducibility: {
      repeatWorkCount: value.reproducibility.repeatWorkCount,
      evaluableWorkCount: value.reproducibility.evaluableWorkCount,
      agreedWorkCount: value.reproducibility.agreedWorkCount,
      claimAgreementRate: value.reproducibility.claimAgreementRate,
      meanJaccardAmongEvaluable: value.reproducibility.meanJaccardAmongEvaluable,
    },
    cost: value.cost,
  };
}

function renderExecutionMarkdown(report) {
  return `# M2 v2 Canary v2 Execution Summary\n\n## 结论\n\n固定 10-work canary 已按 V2-B.3 两阶段合同执行；失败样本未替换，seed 与 manifest 未修改。Terra/Luna 使用相同 works、queries、prompt templates、token limits、timeout 与 extraction schema。\n\n${renderModelTable(report.modelAggregates)}\n\n## Stage execution\n\n${renderExecutionTable(report.modelAggregates)}\n\n- provider dispatched requests: ${report.providerDispatchCount}/${report.population.plannedPhysicalRequestCount}; 30 个 Extraction 计划因缺少 source records fail-closed blocked，未调用 provider\n- private query logs / receipts / evidence / review workbook: generated, Git ignored, not committed\n- full160: not executed\n- model training: not performed\n- V2-C/V2-D/C4/M3: not started\n- final holdout: sealed\n- status: \`not_for_formal_decision\`\n`;
}

function renderQualityMarkdown(report) {
  return `# M2 v2 Canary v2 Quality Report\n\n## Model results\n\n${renderModelTable(report.modelAggregates)}\n\n## Search and Extraction\n\n${renderExecutionTable(report.modelAggregates)}\n\n两模型的 primary Search provider response 与 web-search observation 均为 10/10，但可信 citation/source records 为 0，因此 Search contract 为 0/10，Extraction 依赖全部阻断。该结果是 source-bearing contract failure，不是连接失败，也不能用于模型质量选择。\n\n## Entity, Evidence, Citation and Time\n\n${renderQualityDetailTable(report.modelAggregates)}\n\nCitation alignment 与 source mapping 因 accepted evidence=0 不可评估；gate 按 fail-closed 记为未通过。Receipt capturedAt 完整，source-record capturedAt、availableAt、eventTime 因无 source/evidence 不可形成有效覆盖。\n\n## Governance and cost\n\n- research allowlist: ${report.governance.researchAllowlistStatus}; approved domains=${report.governance.researchApprovedDomainCount}\n- model allowlist: ${report.governance.modelAllowlistStatus}; approved domains=${report.governance.modelApprovedDomainCount}\n- prohibited source domains: ${report.governance.prohibitedSourceDomainCount}（无 source records，不能解释为 allowlist 已通过）\n- estimated relay cost: ${report.costPolicy.estimatedRelayCostStatus}; official OpenAI pricing was not used for the third-party relay\n- implicit research-to-model promotion: false\n\nAll public metrics are aggregate-only. Titles, authors, queries, URLs, snippets, source domains, receipts, and evidence rows remain private.\n`;
}

function renderDecisionMarkdown(report) {
  return `# M2 v2 Canary v2 Decision\n\n## Decision\n\n**${report.finalDecision}**\n\n- gate passed: ${report.passedCount}/${report.totalCount}\n- blockers: ${report.blockers.length ? report.blockers.join(", ") : "none"}\n- full160 authorized: ${report.full160Authorized}\n- model selection performed: false\n- model training performed: false\n- V2-C entered: false\n- PR #7 must remain Draft/open; do not merge\n- status: \`not_for_formal_decision\`\n`;
}

function renderModelTable(models) {
  const header = "| Model | Search success | Resolved | Evidence coverage | High-value | Citation | availableAt | Repeat agreement | Tokens observed | p50/p90 ms |";
  const separator = "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|";
  const rows = V2B4_MODELS.map((model) => {
    const value = models[model];
    return `| ${model} | ${rate(value.search.successRate)} | ${rate(value.entity.resolvedRate)} | ${rate(value.evidence.acceptedEvidenceCoverage)} | ${rate(value.evidence.highValueCoverage)} | ${rate(value.citation.alignmentRate)} | ${rate(value.time.availableAtCompleteness)} | ${rate(value.reproducibility.claimAgreementRate)} | ${nullable(value.cost.observedTotalTokens)} | ${nullable(value.cost.latencyP50Ms)}/${nullable(value.cost.latencyP90Ms)} |`;
  });
  return [header, separator, ...rows].join("\n");
}

function renderExecutionTable(models) {
  const header = "| Model | Primary Search dispatched | Provider response | Web search observed | Search contract | Source records | Repeat provider errors | Extraction dispatched | Extraction blocked |";
  const separator = "|---|---:|---:|---:|---:|---:|---:|---:|---:|";
  const rows = V2B4_MODELS.map((model) => {
    const value = models[model];
    return `| ${model} | ${value.search.dispatchedQueries}/${value.search.plannedQueries} | ${value.search.providerResponseCount}/${value.search.plannedQueries} | ${value.search.webSearchObservedCount}/${value.search.plannedQueries} | ${value.search.successCount}/${value.search.plannedQueries} | ${value.search.resultCount} | ${value.search.repeatProviderErrorCount} | ${value.extraction.dispatchedRequests}/${value.extraction.plannedRequests} | ${value.extraction.dependencyBlockedCount} |`;
  });
  return [header, separator, ...rows].join("\n");
}

function renderQualityDetailTable(models) {
  const header = "| Model | Entity R/U/A | Candidate/A/R | Citation evaluable | Receipt capturedAt | source capturedAt | availableAt | eventTime | Token complete | Observed tokens |";
  const separator = "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|";
  const rows = V2B4_MODELS.map((model) => {
    const value = models[model];
    return `| ${model} | ${value.entity.resolved}/${value.entity.unresolved}/${value.entity.ambiguous} | ${value.evidence.candidateCount}/${value.evidence.acceptedCount}/${value.evidence.rejectedCount} | ${value.citation.alignmentEvaluable} | ${rate(value.time.receiptCapturedAtCompleteness)} | ${rate(value.time.capturedAtCompleteness)} | ${rate(value.time.availableAtCompleteness)} | ${rate(value.time.eventTimeCompleteness)} | ${value.cost.tokenUsageComplete} | ${value.cost.observedTotalTokens} |`;
  });
  return [header, separator, ...rows].join("\n");
}

function gateForModels(id, perModel, selector, threshold, predicate) {
  const observed = Object.fromEntries(V2B4_MODELS.map((model) => [model, selector(perModel[model])]));
  return {
    id,
    threshold,
    observed,
    passed: V2B4_MODELS.every((model) => Number.isFinite(observed[model]) && predicate(observed[model], threshold)),
  };
}

function validateIntegrity(manifest, receipts) {
  const issues = [];
  if (manifest.manifestDigest !== digestWithout(manifest, "manifestDigest")) issues.push("manifest_digest_invalid");
  if (manifest.physicalPlan.length !== V2B4_REQUEST_CAP || receipts.length !== V2B4_REQUEST_CAP) issues.push("request_population_invalid");
  if (new Set(receipts.map((receipt) => receipt.requestKey)).size !== receipts.length) issues.push("receipt_key_collision");
  for (const [index, item] of manifest.physicalPlan.entries()) {
    const receipt = receipts[index];
    if (!receipt || receipt.requestKey !== item.requestKey || receipt.manifestDigest !== manifest.manifestDigest) issues.push("receipt_plan_binding_invalid");
    if (receipt?.retryCount !== 0 || receipt?.full160Authorized !== false) issues.push("retry_or_full160_boundary_invalid");
    if (receipt?.rawResponsePersisted !== false || receipt?.authorizationHeaderPersisted !== false || receipt?.apiKeyPersisted !== false) issues.push("receipt_security_boundary_invalid");
    if (receipt?.receiptDigest !== digestWithout(receipt, "receiptDigest")) issues.push("receipt_digest_invalid");
  }
  return unique(issues);
}

function sourceRecordInputs(searchReceipt) {
  return searchReceipt?.normalizedResponse?.sourceRecords ?? [];
}

function searchReceiptAllowsExtraction(receipt) {
  return Boolean(receipt
    && receipt.stage === "search"
    && receipt.status === "success"
    && receipt.dispatched === true
    && receipt.providerConnectivityPassed === true
    && receipt.providerContractCompatible === true
    && receipt.modelBindingVerified === true
    && sourceRecordInputs(receipt).length > 0);
}

function buildSyntheticReceipt(item, manifest, overrides) {
  return finalizeReceipt({
    schema: "m2.v2.canary-v2-physical-receipt.v0.1",
    privateOnly: true,
    manifestDigest: manifest.manifestDigest,
    relayBindingDigest: manifest.relayBindingDigest,
    requestKey: item.requestKey,
    logicalTaskKey: item.logicalTaskKey,
    identityDigest: item.identityDigest,
    workReference: item.workReference,
    runKind: item.runKind,
    stage: item.stage,
    requestedModelId: item.model,
    returnedModelId: null,
    modelBindingVerified: false,
    pipelineVersion: V2B3_PIPELINE_VERSION,
    sourceRecordSchema: V2B3_SOURCE_RECORD_SCHEMA,
    extractionSchema: V2B3_EXTRACTION_SCHEMA,
    dispatched: false,
    retryCount: 0,
    httpStatus: null,
    providerConnectivityPassed: false,
    providerContractCompatible: false,
    status: "unknown",
    responseContentTypeClass: "unavailable",
    responseDigest: null,
    responseByteLength: 0,
    normalizedResponse: null,
    entity: null,
    inputSourceRecords: [],
    usage: { inputTokens: null, outputTokens: null, totalTokens: null },
    latencyMs: null,
    capturedAt: new Date().toISOString(),
    validationIssues: [],
    rawResponsePersisted: false,
    authorizationHeaderPersisted: false,
    apiKeyPersisted: false,
    full160Authorized: false,
    ...overrides,
  });
}

function finalizeReceipt(value) {
  return withDigest({
    ...value,
    inputSourceRecords: value.stage === "extraction"
      ? value.inputSourceRecords ?? []
      : [],
  }, "receiptDigest");
}

function completedReservation(item, receipt, completedAt, reservedAt = null) {
  return {
    requestKey: item.requestKey,
    model: item.model,
    stage: item.stage,
    status: receipt.status === "indeterminate_after_crash_no_retry" ? "indeterminate_after_crash" : "completed",
    reservedAt: reservedAt ?? receipt.capturedAt,
    completedAt,
    receiptDigest: receipt.receiptDigest,
    retryCount: 0,
  };
}

function newCache(manifest) {
  return {
    schema: "m2.v2.canary-v2-cache.v0.1",
    privateOnly: true,
    manifestDigest: manifest.manifestDigest,
    relayBindingDigest: manifest.relayBindingDigest,
    retryCount: 0,
    entries: {},
  };
}

function newState(manifest) {
  const now = new Date().toISOString();
  return withDigest({
    schema: "m2.v2.canary-v2-state.v0.1",
    privateOnly: true,
    manifestDigest: manifest.manifestDigest,
    relayBindingDigest: manifest.relayBindingDigest,
    executionStatus: "in_progress",
    createdAt: now,
    updatedAt: now,
    physicalRequestCap: manifest.physicalRequestCap,
    plannedPhysicalRequestCount: manifest.plannedPhysicalRequestCount,
    completedPhysicalReceiptCount: 0,
    dispatchedPhysicalRequestCount: 0,
    retryCount: 0,
    reservations: {},
    full160Authorized: false,
  }, "stateDigest");
}

function assertExecutionContainers(cache, state, manifest) {
  if (cache.schema !== "m2.v2.canary-v2-cache.v0.1" || state.schema !== "m2.v2.canary-v2-state.v0.1") throw new Error("v2b4_execution_container_schema_invalid");
  if (cache.manifestDigest !== manifest.manifestDigest || state.manifestDigest !== manifest.manifestDigest) throw new Error("v2b4_execution_container_manifest_mismatch");
  if (cache.relayBindingDigest !== manifest.relayBindingDigest || state.relayBindingDigest !== manifest.relayBindingDigest) throw new Error("v2b4_execution_container_relay_mismatch");
  if (cache.retryCount !== 0 || state.retryCount !== 0 || state.full160Authorized !== false) throw new Error("v2b4_execution_container_boundary_invalid");
  if (state.stateDigest !== digestWithout(state, "stateDigest")) throw new Error("v2b4_state_digest_invalid");
}

function checkpoint(cachePath, statePath, receiptsPath, cache, state, manifest) {
  const receipts = manifest.physicalPlan.map((item) => cache.entries[item.requestKey]).filter(Boolean);
  state.completedPhysicalReceiptCount = receipts.length;
  state.dispatchedPhysicalRequestCount = receipts.filter((receipt) => receipt.dispatched).length;
  const nextState = withReplacedDigest(state, "stateDigest");
  Object.assign(state, nextState);
  atomicWriteJson(cachePath, cache);
  atomicWriteJson(statePath, state);
  atomicWriteNdjson(receiptsPath, receipts);
}

function groupPlan(plan) {
  const grouped = new Map();
  for (const item of plan) {
    const key = `${item.logicalTaskKey}:${item.stage}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  }
  return grouped;
}

function writeQueryLogs(path, manifest) {
  const rows = manifest.logicalTasks.map((task) => ({
    schema: "m2.v2.canary-v2-query-log-private.v0.1",
    privateOnly: true,
    manifestDigest: manifest.manifestDigest,
    logicalTaskKey: task.logicalTaskKey,
    workReference: task.workReference,
    identityDigest: task.identityDigest,
    runKind: task.runKind,
    title: task.title,
    author: task.author,
    sourceType: task.sourceType,
    queryPlan: task.queryPlan,
    models: [...V2B4_MODELS],
    stages: ["search", "extraction"],
  }));
  if (existsSync(path) && canonicalJson(readNdjson(path)) !== canonicalJson(rows)) throw new Error("v2b4_query_logs_changed");
  atomicWriteNdjson(path, rows);
}

function policyFromArtifact(artifact) {
  return createV2B3SourceGovernancePolicy({
    effectiveDate: artifact.effectiveDate,
    researchDomains: artifact.researchAllowlist?.approvedDomainEntries ?? [],
    modelDomains: artifact.modelAllowlist?.approvedDomainEntries ?? [],
  });
}

function assertFrozenInputs(canary, benchmark, policyArtifact) {
  if (canary?.canaryManifestDigest !== digestWithout(canary, "canaryManifestDigest")) throw new Error("v2b4_canary_manifest_digest_invalid");
  if (benchmark?.benchmarkManifestDigest !== digestWithout(benchmark, "benchmarkManifestDigest")) throw new Error("v2b4_benchmark_manifest_digest_invalid");
  if (canary.sampleCount !== 10 || canary.repeatSample?.length !== 5 || canary.seed !== benchmark.canarySeed) throw new Error("v2b4_frozen_canary_binding_invalid");
  if (benchmark.canaryManifestDigest !== canary.canaryManifestDigest || benchmark.sampleCount !== 10 || benchmark.logicalTaskCount !== 10) throw new Error("v2b4_benchmark_canary_binding_invalid");
  if (canonicalJson(canary.sample.map(identityProjection)) !== canonicalJson(benchmark.sample.map(identityProjection))) throw new Error("v2b4_frozen_sample_changed");
  if (benchmark.requestPolicy?.searchTimeoutMs !== V2B4_SEARCH_TIMEOUT_MS
    || benchmark.requestPolicy?.extractionTimeoutMs !== V2B4_EXTRACTION_TIMEOUT_MS
    || benchmark.requestPolicy?.searchMaxOutputTokens !== V2B4_SEARCH_MAX_OUTPUT_TOKENS
    || benchmark.requestPolicy?.extractionMaxOutputTokens !== V2B4_EXTRACTION_MAX_OUTPUT_TOKENS) throw new Error("v2b4_request_policy_changed");
  if (policyArtifact?.schema !== V2B3_SOURCE_GOVERNANCE_SCHEMA || !validateV2B3SourceGovernancePolicy(policyArtifact).valid) throw new Error("v2b4_governance_policy_invalid");
}

function identityProjection(value) {
  return { standardWorkId: value.standardWorkId, identityDigest: value.identityDigest };
}

function loadRelayConfiguration(root, suppliedEnv = null) {
  const env = suppliedEnv ?? { ...readEnvLocal(join(root, ".env.local")), ...process.env };
  const baseUrl = String(env.OPENAI_BASE_URL ?? env.M2_V2_EVIDENCE_API_BASE_URL ?? "").trim().replace(/\/+$/u, "");
  const apiKey = String(env.OPENAI_API_KEY ?? "");
  if (env.M2_V2_EVIDENCE_PROVIDER && env.M2_V2_EVIDENCE_PROVIDER !== "openai_compatible_relay") throw new Error("v2b4_provider_mode_invalid");
  if (!/^https:\/\//u.test(baseUrl) || !apiKey) throw new Error("v2b4_relay_configuration_incomplete");
  const bindingDigest = sha256({
    providerId: "openai_compatible_relay",
    endpointPath: "/responses",
    baseUrlDigest: sha256(baseUrl),
    models: [...V2B4_MODELS],
    pipelineVersion: V2B3_PIPELINE_VERSION,
    sourceRecordSchema: V2B3_SOURCE_RECORD_SCHEMA,
    extractionSchema: V2B3_EXTRACTION_SCHEMA,
  });
  return { baseUrl, apiKey, bindingDigest };
}

function extractUsage(json) {
  const roots = [json, json?.response, json?.data].filter(isObject);
  const usage = roots.map((root) => root.usage).find(isObject) ?? {};
  const inputTokens = finiteNonnegative(usage.input_tokens ?? usage.prompt_tokens ?? usage.inputTokens);
  const outputTokens = finiteNonnegative(usage.output_tokens ?? usage.completion_tokens ?? usage.outputTokens);
  const totalTokens = finiteNonnegative(usage.total_tokens ?? usage.totalTokens)
    ?? (inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null);
  return { inputTokens, outputTokens, totalTokens };
}

function responseRoot(json) {
  const roots = [json, json?.response, json?.data].filter(isObject);
  return roots.find((root) => root.model || Array.isArray(root.output) || Array.isArray(root.choices))
    ?? roots.find((root) => root.id)
    ?? json;
}

function buildReviewSourceWorkRows(evaluation) {
  return V2B4_MODELS.map((model) => ({ model, ...publicModelMetrics(evaluation.perModel[model]) }));
}

function validateReviewSource(value) {
  return Boolean(value?.privateOnly === true && Array.isArray(value?.evidenceRecords) && Array.isArray(value?.gateItems));
}

function assertPublicSanitized(content) {
  const forbidden = [
    "private-work-",
    '"standardWorkId":',
    '"workReference":',
    '"identityDigest":',
    '"logicalTaskKey":',
    '"queryText":',
    '"sourceId":',
    '"citationId":',
    '"snippet":',
    '"providerReceipt":',
    '"prohibitedSourceDomainsPrivate":',
    "data/private-output",
    "OPENAI_API_KEY",
    "sk-",
  ];
  for (const token of forbidden) if (content.includes(token)) throw new Error(`v2b4_public_privacy_token:${token}`);
  if (/https?:\/\/(?!github\.com\/KAtOReNA7\/system)/iu.test(content)) throw new Error("v2b4_public_external_url_forbidden");
}

function privateStoreIgnoredAndUntracked(root) {
  const ignored = spawnSync("git", ["check-ignore", "-q", "--", V2B4_PRIVATE_RELATIVE], { cwd: root, windowsHide: true }).status === 0;
  const tracked = spawnSync("git", ["ls-files", "--", V2B4_PRIVATE_RELATIVE], { cwd: root, encoding: "utf8", windowsHide: true });
  return ignored && !String(tracked.stdout ?? "").trim();
}

function ensurePrivateStore(root, options = {}) {
  const relative = options.privateRelative ?? V2B4_PRIVATE_RELATIVE;
  const privateStore = join(root, relative);
  mkdirSync(privateStore, { recursive: true });
  if (options.skipIgnoreCheck !== true) {
    if (!privateStoreIgnoredAndUntracked(root)) throw new Error("v2b4_private_store_not_ignored_or_is_tracked");
  }
  return privateStore;
}

function isXlsxContainer(path) {
  const bytes = readFileSync(path);
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function persistImmutable(path, candidate, changedError) {
  if (!existsSync(path)) {
    atomicWriteJson(path, candidate);
    return candidate;
  }
  const existing = readJson(path);
  if (existing.manifestDigest !== digestWithout(existing, "manifestDigest")) throw new Error("v2b4_existing_manifest_digest_invalid");
  const comparable = { ...candidate, createdAt: existing.createdAt };
  const regenerated = withReplacedDigest(comparable, "manifestDigest");
  if (canonicalJson(existing) !== canonicalJson(regenerated)) throw new Error(changedError);
  return existing;
}

function withDigest(value, key) {
  return { ...value, [key]: sha256(value) };
}

function withReplacedDigest(value, key) {
  const { [key]: _ignored, ...payload } = value;
  return withDigest(payload, key);
}

function digestWithout(value, key) {
  const { [key]: _ignored, ...payload } = value;
  return sha256(payload);
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

function countBy(values, selector) {
  const result = {};
  for (const value of values) {
    const key = selector(value) ?? "unknown";
    result[key] = (result[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

function countMany(values) {
  return countBy(values, (value) => String(value));
}

function latestTimestamp(values) {
  const valid = values.filter(isIsoTimestamp).map(Date.parse);
  if (!valid.length) throw new Error("v2b4_evaluation_timestamp_missing");
  return new Date(Math.max(...valid)).toISOString();
}

function percentile(values, probability) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.ceil(probability * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

function average(values) {
  return values.length ? sum(values) / values.length : null;
}

function ratio(numerator, denominator) {
  return denominator ? numerator / denominator : 0;
}

function sum(values) {
  return values.reduce((total, value) => total + (Number(value) || 0), 0);
}

function unique(values) {
  return [...new Set(values)];
}

function finiteNonnegative(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function isIsoTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeModelId(value) {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,100}$/u.test(value) ? value : null;
}

function safeErrorToken(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  return /^[A-Za-z0-9_.:-]{1,100}$/u.test(value) ? value : `sha256:${sha256(value)}`;
}

function contentTypeClass(value) {
  const text = String(value ?? "").toLocaleLowerCase("en-US");
  if (text.includes("json")) return "json";
  if (text.includes("html")) return "html";
  if (text.includes("text/plain")) return "text_plain";
  return text ? "other" : "unavailable";
}

function rate(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : "n/a";
}

function nullable(value) {
  return Number.isFinite(value) ? String(value) : "n/a";
}

export const __test = Object.freeze({
  claimSignatures,
  classifyEntity,
  extractUsage,
  validateIntegrity,
  validateReviewSource,
  buildReviewSourceWorkRows,
});
