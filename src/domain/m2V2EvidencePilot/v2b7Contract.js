import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { canonicalJson, sha256 } from "./pilotCore.js";
import { V2B6_ADAPTER_VERSION } from "./relayExtractionAdapterV2B6.js";
import { V2B5_EXTRACTION_OUTPUT_SCHEMA_VERSION } from "./extractionV2B5.js";
import {
  V2B5_SOURCE_RECORD_SCHEMA,
} from "./sourceRecordV2B5.js";

export const V2B7_START_SHA = "19f6ae871be90785710d42c385234ba8b3cc7a49";
export const V2B7_NAMESPACE = "v2b7-canary-v3";
export const V2B7_MODEL_ID = "gpt-5.6-terra";
export const V2B7_TIMEOUT_MS = 120_000;
export const V2B7_MAX_OUTPUT_TOKENS = 1_600;
export const V2B7_TAVILY_REQUEST_CAP = 24;
export const V2B7_RELAY_REQUEST_CAP = 20;
export const V2B7_MAX_REPAIRS = 5;
export const V2B7_CANARY_MANIFEST_DIGEST = "4288ad6130fe34da6f56f361604d44f1124313b3b3f4fc98b870570333d65f23";
export const V2B7_PARENT_CANARY_MANIFEST_DIGEST = "883a0c8054d71029e2f1d385e9bc98ff4dbcccfc8659ee3764cc128e1a640248";
export const V2B7_REPEAT_DIGEST = "e3be6282451c02d6a630aeec322951d62fc477ca9e27d0f9cc2db0fc68e471fc";
export const V2B7_SOURCE_BUNDLE_DIGEST = "d68896763b2a7b63afd3580c623e06cd72eaa9432b396dd3e9e62b6a50f643df";
export const V2B7_OVERLAP_MAPPING_DIGEST = "47dc97f3d066c9f0a188f30d0670bb6a6e790b4fb0811560b00d2bf074567ab8";

export const V2B7_PRIVATE_RELATIVE = "data/private-output/m2-v2-evidence-pilot/v2b7-canary-v3";
export const V2B7_ORIGINAL_MANIFEST_RELATIVE = "data/private-output/m2-v2-evidence-pilot/canary-v0.1/canary-manifest-private-v0.1.json";
export const V2B7_MANIFEST_RELATIVE = "data/private-output/m2-v2-evidence-pilot/v2-b5-independent-search-canary/canary-v3-manifest-private-v0.1.json";
export const V2B7_BUNDLE_RELATIVE = "data/private-output/m2-v2-evidence-pilot/v2-b6-extraction-remediation/benchmark-source-bundle-private-v0.2.json";
export const V2B7_B5_STATE_RELATIVE = "data/private-output/m2-v2-evidence-pilot/v2-b5-independent-search-canary/v2b5-execution-state-private-v0.1.json";
export const V2B7_B6_STATE_RELATIVE = "data/private-output/m2-v2-evidence-pilot/v2-b6-extraction-remediation/v2b6-execution-state-private-v0.1.json";

export const V2B7_PUBLIC_CONTRACT_JSON = "docs/prd/m2-v2/M2-v2-canary-v3-execution-contract-v0.2.json";
export const V2B7_PUBLIC_CONTRACT_MARKDOWN = "docs/prd/m2-v2/M2-v2-canary-v3-execution-contract-v0.2.md";

export const V2B7_QUERY_TEMPLATES = Object.freeze({
  identity: '"<title>" "<author>" 作品 作者',
  publicationEvidence: '"<title>" "<author>" 原作 平台 评分 榜单 热度 改编 出版 出版社 出版',
  webOriginalEvidence: '"<title>" "<author>" 原作 平台 评分 榜单 热度 改编 出版 原作 连载 完结',
});

export const V2B7_GATE_THRESHOLDS = Object.freeze({
  logicalTavilySuccessRate: 0.8,
  sourceRecordWorkCoverage: 0.8,
  primarySchemaPassRate: 0.9,
  workResolvedRate: 0.8,
  pilotUsableWorkCoverage: 0.6,
  highValueCoverage: 0.75,
  repeatClaimAgreement: 0.8,
  repeatSourceOverlap: 0.7,
  noTimeoutRate: 0.9,
  modelBindingMismatchCount: 0,
});

const PRIVATE_FILES = Object.freeze({
  contract: "v2b7-execution-contract-private-v0.1.json",
  state: "v2b7-execution-state-private-v0.1.json",
  pretest: "v2b7-pretest-receipt-private-v0.1.json",
});

export function buildV2B7WorkQueries(work, runKind) {
  if (!["primary", "repeat"].includes(runKind)) throw new Error("v2b7_run_kind_invalid");
  const title = cleanIdentity(work?.title);
  const author = cleanIdentity(work?.author);
  const slot = cleanSlot(work?.canarySlotId);
  const sourceType = work?.sourceType === "publication" ? "publication" : "web_original";
  if (!title || !author || !slot) throw new Error("v2b7_query_work_invalid");
  const plans = [
    { intent: "identity", queryText: `"${title}" "${author}" 作品 作者` },
    {
      intent: "public_evidence",
      queryText: sourceType === "publication"
        ? `"${title}" "${author}" 原作 平台 评分 榜单 热度 改编 出版 出版社 出版`
        : `"${title}" "${author}" 原作 平台 评分 榜单 热度 改编 出版 原作 连载 完结`,
    },
  ];
  return plans.map((plan) => ({
    schema: "m2.v2.v2b7-tavily-query-plan.v0.1",
    queryId: `qry_${sha256({ namespace: V2B7_NAMESPACE, slot, runKind, ...plan }).slice(0, 32)}`,
    executionNamespace: `${V2B7_NAMESPACE}-${runKind}`,
    canarySlotId: slot,
    runKind,
    sourceType,
    ...plan,
  }));
}

export function validateV2B7OutboundQueryPlans(plans) {
  const issues = [];
  if (!Array.isArray(plans) || plans.length !== 2) return { valid: false, issues: ["query_count_invalid"] };
  const serialized = canonicalJson(plans.map((plan) => plan.queryText));
  if (/(?:standardWorkId|identityDigest|canarySlotId|收入|账单|revenue|forecast|B4|评级|rating|版权|合同|渠道|备注)/iu.test(serialized)) {
    issues.push("private_or_prohibited_outbound_field");
  }
  if (plans.some((plan) => plan.executionNamespace !== `${V2B7_NAMESPACE}-${plan.runKind}`)) issues.push("namespace_invalid");
  if (new Set(plans.map((plan) => plan.queryId)).size !== 2) issues.push("query_id_duplicate");
  return { valid: issues.length === 0, issues };
}

export function checkAndFreezeV2B7Contract(root, options = {}) {
  const privateStore = join(root, V2B7_PRIVATE_RELATIVE);
  const existingContractPath = join(privateStore, PRIVATE_FILES.contract);
  const now = existsSync(existingContractPath)
    ? readJson(existingContractPath).frozenAt
    : options.now?.() ?? new Date().toISOString();
  const original = readJson(join(root, V2B7_ORIGINAL_MANIFEST_RELATIVE));
  const manifest = readJson(join(root, V2B7_MANIFEST_RELATIVE));
  const bundle = readJson(join(root, V2B7_BUNDLE_RELATIVE));
  const b5State = readJson(join(root, V2B7_B5_STATE_RELATIVE));
  const b6State = readJson(join(root, V2B7_B6_STATE_RELATIVE));
  const invariant = evaluateV2B7FreezeInvariants({ original, manifest, bundle, b5State, b6State });
  if (!invariant.allPassed) throw new Error(`v2b7_freeze_invariant_failed:${invariant.issues.join(",")}`);

  const overlapMapping = buildOverlapMapping(manifest, bundle);
  const publicContract = buildPublicContract({ now, invariant, b5State, b6State });
  const privateContractPayload = {
    schema: "m2.v2.v2b7-execution-contract-private.v0.1",
    privateOnly: true,
    immutable: true,
    frozenAt: now,
    startSha: V2B7_START_SHA,
    manifestDigest: V2B7_CANARY_MANIFEST_DIGEST,
    parentCanaryManifestDigest: V2B7_PARENT_CANARY_MANIFEST_DIGEST,
    repeatDigest: V2B7_REPEAT_DIGEST,
    sourceBundleDigest: V2B7_SOURCE_BUNDLE_DIGEST,
    overlapMappingDigest: V2B7_OVERLAP_MAPPING_DIGEST,
    overlapMapping,
    queryTemplates: V2B7_QUERY_TEMPLATES,
    routing: publicContract.routing,
    requestBudgets: publicContract.requestBudgets,
    gateThresholds: V2B7_GATE_THRESHOLDS,
    priorPhysicalRequestCounts: {
      v2b5Tavily: b5State.tavily.physicalRequestCount,
      v2b5Relay: b5State.relay.physicalRequestCount,
      v2b6Relay: b6State.physicalRelayRequestCount,
      cumulativeTavily: b5State.tavily.physicalRequestCount,
      cumulativeRelay: b5State.relay.physicalRequestCount + b6State.physicalRelayRequestCount,
    },
    publicBoundary: publicContract.outputBoundary,
    full160Authorized: false,
  };
  const privateContract = { ...privateContractPayload, contractDigest: sha256(privateContractPayload) };
  mkdirSync(privateStore, { recursive: true });
  persistImmutable(join(privateStore, PRIVATE_FILES.contract), privateContract, "contractDigest");
  const statePath = join(privateStore, PRIVATE_FILES.state);
  const state = existsSync(statePath)
    ? readJson(statePath)
    : newExecutionState(privateContract, b5State, b6State, now);
  assertExecutionState(state, privateContract, b5State, b6State);
  atomicWriteJson(statePath, state);
  atomicWriteText(join(root, V2B7_PUBLIC_CONTRACT_JSON), `${JSON.stringify(publicContract, null, 2)}\n`);
  atomicWriteText(join(root, V2B7_PUBLIC_CONTRACT_MARKDOWN), renderPublicContractMarkdown(publicContract));
  assertPublicV2B7Sanitized(readFileSync(join(root, V2B7_PUBLIC_CONTRACT_JSON), "utf8"));
  assertPublicV2B7Sanitized(readFileSync(join(root, V2B7_PUBLIC_CONTRACT_MARKDOWN), "utf8"));
  return { original, manifest, bundle, privateStore, privateContract, state, publicContract, invariant };
}

export function evaluateV2B7FreezeInvariants(input) {
  const issues = [];
  const original = input.original;
  const manifest = input.manifest;
  const bundle = input.bundle;
  if (original?.sampleCount !== 10 || original?.sample?.length !== 10 || original?.repeatSample?.length !== 5) issues.push("original_canary_population_invalid");
  if (digestWithout(original, "canaryManifestDigest") !== original?.canaryManifestDigest
    || original?.canaryManifestDigest !== V2B7_PARENT_CANARY_MANIFEST_DIGEST) issues.push("original_canary_digest_invalid");
  if (manifest?.sampleCount !== 10 || manifest?.sample?.length !== 10 || manifest?.repeatSample?.length !== 5) issues.push("canary_v3_population_invalid");
  if (digestWithout(manifest, "manifestDigest") !== manifest?.manifestDigest
    || manifest?.manifestDigest !== V2B7_CANARY_MANIFEST_DIGEST) issues.push("canary_v3_digest_invalid");
  const originalIdentities = new Set(original?.sample?.map((work) => work.identityDigest));
  const manifestIdentities = new Set(manifest?.sample?.map((work) => work.identityDigest));
  if (originalIdentities.size !== 10 || manifestIdentities.size !== 10
    || [...originalIdentities].some((identity) => !manifestIdentities.has(identity))) issues.push("canary_sample_replaced");
  const repeatProjection = (manifest?.repeatSample ?? [])
    .map((item) => ({ canarySlotId: item.canarySlotId, identityDigest: item.identityDigest }))
    .sort((left, right) => left.canarySlotId.localeCompare(right.canarySlotId));
  if (sha256(repeatProjection) !== V2B7_REPEAT_DIGEST) issues.push("repeat_digest_invalid");
  if (bundle?.workCount !== 4 || bundle?.sourceRecordCount !== 24
    || bundle?.sourceBundleDigest !== V2B7_SOURCE_BUNDLE_DIGEST) issues.push("source_bundle_contract_invalid");
  const overlap = buildOverlapMapping(manifest, bundle);
  if (overlap.length !== 4 || sha256(overlap) !== V2B7_OVERLAP_MAPPING_DIGEST) issues.push("benchmark_overlap_invalid");
  if (input.b5State?.tavily?.physicalRequestCount !== 14 || input.b5State?.relay?.physicalRequestCount !== 25) issues.push("v2b5_prior_counter_changed");
  if (input.b6State?.physicalRelayRequestCount !== 19 || input.b6State?.newTavilyPhysicalRequestCount !== 0) issues.push("v2b6_prior_counter_changed");
  if ([original, manifest, bundle, input.b5State, input.b6State].some((item) => item?.full160Authorized === true)) issues.push("full160_authorized");
  return {
    allPassed: issues.length === 0,
    issues,
    failedSamplesReplaced: false,
    sampleCount: 10,
    repeatCount: 5,
    overlapCount: overlap.length,
    sourceRecordCount: bundle?.sourceRecordCount ?? 0,
  };
}

export function recordV2B7Pretest(root, input) {
  const result = checkAndFreezeV2B7Contract(root, { now: input.now });
  const payload = {
    schema: "m2.v2.v2b7-pretest-receipt-private.v0.1",
    privateOnly: true,
    completedAt: input.now?.() ?? new Date().toISOString(),
    command: "node --test test/m2-v2-v2b7-contract.test.js",
    exitCode: input.exitCode,
    allPassed: input.exitCode === 0,
    stdoutDigest: input.stdoutDigest,
    stderrDigest: input.stderrDigest,
    newTavilyPhysicalRequestCount: 0,
    newRelayPhysicalRequestCount: 0,
    rawOutputPersisted: false,
    full160Authorized: false,
  };
  const receipt = { ...payload, receiptDigest: sha256(payload) };
  atomicWriteJson(join(result.privateStore, PRIVATE_FILES.pretest), receipt);
  result.state.pretestsPassed = receipt.allPassed;
  result.state.phase = receipt.allPassed ? "phase_a_frozen" : "phase_a_pretest_failed";
  atomicWriteJson(join(result.privateStore, PRIVATE_FILES.state), result.state);
  return receipt;
}

export function assertPublicV2B7Sanitized(content) {
  const forbidden = [
    "data/private-output",
    '"title"',
    '"author"',
    '"queryText"',
    '"url"',
    '"domain"',
    '"snippet"',
    '"canarySlotId"',
    '"identityDigest"',
    "OPENAI_API_KEY",
    "TAVILY_API_KEY",
    "Authorization",
    "sk-",
    "tvly-",
  ];
  for (const token of forbidden) if (content.includes(token)) throw new Error(`v2b7_public_privacy_token:${token}`);
  if (/https?:\/\//iu.test(content)) throw new Error("v2b7_public_url_forbidden");
  if (/[A-Za-z]:[\\/]/u.test(content)) throw new Error("v2b7_public_absolute_path_forbidden");
  return true;
}

function buildPublicContract({ now, invariant, b5State, b6State }) {
  return {
    schema: "m2.v2.canary-v3-execution-contract-public.v0.2",
    status: "not_for_formal_decision",
    frozenAt: now,
    startSha: V2B7_START_SHA,
    executionNamespace: V2B7_NAMESPACE,
    population: {
      manifestDigest: V2B7_CANARY_MANIFEST_DIGEST,
      parentCanaryManifestDigest: V2B7_PARENT_CANARY_MANIFEST_DIGEST,
      sampleCount: invariant.sampleCount,
      repeatCount: invariant.repeatCount,
      repeatDigest: V2B7_REPEAT_DIGEST,
      failedSamplesReplaced: false,
    },
    frozenSourceBundle: {
      bundleDigest: V2B7_SOURCE_BUNDLE_DIGEST,
      workCount: 4,
      sourceRecordCount: 24,
      benchmarkCanaryOverlapCount: invariant.overlapCount,
      overlapMappingDigest: V2B7_OVERLAP_MAPPING_DIGEST,
      primarySearchReusedWithoutDispatch: true,
    },
    search: {
      provider: "tavily_structured_search",
      queryTemplates: V2B7_QUERY_TEMPLATES,
      topic: "general",
      searchDepth: "basic",
      country: "china",
      maxResultsPerQuery: 6,
      maxSourceRecordsPerWork: 6,
      includeAnswer: false,
      includeRawContent: false,
      autoParameters: false,
      repeatSearchIndependent: true,
    },
    routing: {
      defaultModel: V2B7_MODEL_ID,
      escalationModel: V2B7_MODEL_ID,
      lunaStatus: "blocked_not_used",
      extractionMode: "full",
      structuredMode: "server_strict",
      adapterVersion: V2B6_ADAPTER_VERSION,
      extractionSchemaVersion: V2B5_EXTRACTION_OUTPUT_SCHEMA_VERSION,
      sourceRecordSchemaVersion: V2B5_SOURCE_RECORD_SCHEMA,
      timeoutMs: V2B7_TIMEOUT_MS,
      maxOutputTokens: V2B7_MAX_OUTPUT_TOKENS,
      reasoningParameterIncluded: false,
      store: false,
      toolsIncluded: false,
      relaySearchUsed: false,
    },
    repairPolicy: {
      maximumRepairsPerLogicalRequest: 1,
      maximumRepairsTotal: V2B7_MAX_REPAIRS,
      allowedTriggers: ["schema_parse", "exact_field", "enum", "missing_required", "source_id_format"],
      forbiddenTriggers: ["unresolved_entity", "evidence_conflict", "prohibited_source", "unsupported_claim", "missing_time"],
      sameSourceRecordsModelAndSchemaRequired: true,
    },
    requestBudgets: {
      tavilyNewPhysicalRequestCap: V2B7_TAVILY_REQUEST_CAP,
      tavilyPrimaryReuseCount: 4,
      tavilyRemainingPrimaryCap: 12,
      tavilyRepeatCap: 10,
      tavilyCompatibilityReserve: 2,
      relayNewPhysicalRequestCap: V2B7_RELAY_REQUEST_CAP,
      relayPrimaryLogicalCount: 10,
      relayRepeatLogicalCount: 5,
      relayRepairCap: V2B7_MAX_REPAIRS,
      priorCountersPreserved: true,
      priorCumulativeTavilyPhysicalRequestCount: b5State.tavily.physicalRequestCount,
      priorCumulativeRelayPhysicalRequestCount: b5State.relay.physicalRequestCount + b6State.physicalRelayRequestCount,
      reservationPersistedBeforeDispatch: true,
    },
    gateThresholds: V2B7_GATE_THRESHOLDS,
    safetyGate: {
      allRequired: true,
      itemCount: 14,
      full160AuthorizedOnPass: false,
    },
    outputBoundary: {
      publicSanitizedAggregateOnly: true,
      publicWorksAuthorsQueriesUrlsDomainsSnippetsForbidden: true,
      providerReceiptsAndEvidencePrivateOnly: true,
      rawResponsesPersisted: false,
    },
    modelTrainingPerformed: false,
    b4Changed: false,
    finalHoldoutOpened: false,
    enteredV2COrV2D: false,
    enteredC4OrM3: false,
    released: false,
    full160Authorized: false,
  };
}

function renderPublicContractMarkdown(contract) {
  const g = contract.gateThresholds;
  return `# M2 v2 固定 Canary v3 执行合同 v0.2\n\n## 结论\n\n本合同冻结固定 10-work、5-work repeat 与 4-work Benchmark overlap。执行仅使用 Tavily 结构化 Search 与 Terra full/server_strict Extraction；所有结果均为 \`not_for_formal_decision\`，且 \`full160Authorized=false\`。\n\n## 冻结对象\n\n- Canary v3 manifest digest：\`${contract.population.manifestDigest}\`\n- 原始 Canary parent digest：\`${contract.population.parentCanaryManifestDigest}\`\n- repeat digest：\`${contract.population.repeatDigest}\`\n- Frozen Bundle digest：\`${contract.frozenSourceBundle.bundleDigest}\`\n- overlap：${contract.frozenSourceBundle.benchmarkCanaryOverlapCount} works；映射 digest：\`${contract.frozenSourceBundle.overlapMappingDigest}\`\n- 失败样本替换：false\n\n## 路由与预算\n\n- 默认/升级模型：\`${contract.routing.defaultModel}\`\n- 模式：\`${contract.routing.extractionMode}/${contract.routing.structuredMode}\`\n- adapter：\`${contract.routing.adapterVersion}\`\n- timeout：${contract.routing.timeoutMs} ms；max output：${contract.routing.maxOutputTokens}\n- reasoning：省略；tools/search：禁用；store：false\n- 新 Tavily 上限：${contract.requestBudgets.tavilyNewPhysicalRequestCap}\n- 新 relay 上限：${contract.requestBudgets.relayNewPhysicalRequestCap}；repair 总上限：${contract.requestBudgets.relayRepairCap}\n- 每次请求在 dispatch 前持久化 reservation；旧计数不重置、不减少。\n\n## Search 合同\n\n- identity 模板：\`${contract.search.queryTemplates.identity}\`\n- publication evidence 模板：\`${contract.search.queryTemplates.publicationEvidence}\`\n- web-original evidence 模板：\`${contract.search.queryTemplates.webOriginalEvidence}\`\n- 每个 query 最多 ${contract.search.maxResultsPerQuery} 条；每个 work 最多 ${contract.search.maxSourceRecordsPerWork} 条 Source Records。\n- 4 个 overlap primary 复用冻结 Bundle，物理 Tavily 请求为 0；repeat 必须独立检索。\n\n## Gate 阈值\n\n| 指标 | 阈值 |\n|---|---:|\n| logical Tavily success | ${g.logicalTavilySuccessRate} |\n| Source Record work coverage | ${g.sourceRecordWorkCoverage} |\n| primary schema pass | ${g.primarySchemaPassRate} |\n| work resolved | ${g.workResolvedRate} |\n| pilotUsable work coverage | ${g.pilotUsableWorkCoverage} |\n| high-value coverage | ${g.highValueCoverage} |\n| repeat claim agreement | ${g.repeatClaimAgreement} |\n| repeat source overlap | ${g.repeatSourceOverlap} |\n| no-timeout | ${g.noTimeoutRate} |\n| model binding mismatch | ${g.modelBindingMismatchCount} |\n\n14 项 safety gate 必须全部通过；任何 safety 失败均为 \`CANARY_FAIL\`。即使 Canary 通过，本合同也不授权 full160。\n\n## 输出边界\n\n公共产物只包含脱敏聚合；作品、作者、query、URL、域名、snippet、密钥、原始响应与 provider receipts 禁止进入公共产物。未训练模型、未修改 B4、未打开 holdout、未进入 V2-C/V2-D/C4/M3、未 release。\n`;
}

function buildOverlapMapping(manifest, bundle) {
  const manifestIdentities = new Set(manifest?.sample?.map((work) => work.identityDigest));
  return (bundle?.works ?? [])
    .filter((work) => manifestIdentities.has(work.identityDigest))
    .map((work) => ({
      canarySlotId: work.canarySlotId,
      identityDigest: work.identityDigest,
      sourceRecordSetDigest: work.sourceRecordSetDigest,
    }))
    .sort((left, right) => left.canarySlotId.localeCompare(right.canarySlotId));
}

function newExecutionState(contract, b5State, b6State, createdAt) {
  return {
    schema: "m2.v2.v2b7-execution-state-private.v0.1",
    privateOnly: true,
    createdAt,
    phase: "phase_a_contract_created",
    contractDigest: contract.contractDigest,
    manifestDigest: contract.manifestDigest,
    repeatDigest: contract.repeatDigest,
    sourceBundleDigest: contract.sourceBundleDigest,
    priorCounters: contract.priorPhysicalRequestCounts,
    tavily: { cap: V2B7_TAVILY_REQUEST_CAP, physicalRequestCount: 0, reservations: {} },
    relay: { cap: V2B7_RELAY_REQUEST_CAP, physicalRequestCount: 0, repairCount: 0, reservations: {} },
    pretestsPassed: false,
    canaryExecuted: false,
    full160Authorized: false,
    priorStateDigests: { b5: sha256(b5State), b6: sha256(b6State) },
  };
}

function assertExecutionState(state, contract, b5State, b6State) {
  if (state.contractDigest !== contract.contractDigest || state.manifestDigest !== V2B7_CANARY_MANIFEST_DIGEST
    || state.repeatDigest !== V2B7_REPEAT_DIGEST || state.sourceBundleDigest !== V2B7_SOURCE_BUNDLE_DIGEST) {
    throw new Error("v2b7_state_contract_mismatch");
  }
  if (state.tavily?.cap !== V2B7_TAVILY_REQUEST_CAP || state.relay?.cap !== V2B7_RELAY_REQUEST_CAP) throw new Error("v2b7_state_cap_changed");
  if (state.tavily.physicalRequestCount < 0 || state.relay.physicalRequestCount < 0 || state.relay.repairCount < 0) throw new Error("v2b7_state_counter_invalid");
  if (state.tavily.physicalRequestCount > V2B7_TAVILY_REQUEST_CAP || state.relay.physicalRequestCount > V2B7_RELAY_REQUEST_CAP
    || state.relay.repairCount > V2B7_MAX_REPAIRS) throw new Error("v2b7_state_cap_exceeded");
  if (state.priorCounters.v2b5Tavily !== b5State.tavily.physicalRequestCount
    || state.priorCounters.v2b5Relay !== b5State.relay.physicalRequestCount
    || state.priorCounters.v2b6Relay !== b6State.physicalRelayRequestCount) throw new Error("v2b7_prior_counter_mismatch");
  if (state.full160Authorized !== false) throw new Error("v2b7_full160_invariant_changed");
}

function persistImmutable(path, candidate, digestKey) {
  if (!existsSync(path)) {
    atomicWriteJson(path, candidate);
    return candidate;
  }
  const current = readJson(path);
  if (current[digestKey] !== candidate[digestKey] || digestWithout(current, digestKey) !== current[digestKey]) {
    throw new Error("v2b7_immutable_contract_changed");
  }
  return current;
}

function digestWithout(value, key) {
  const copy = { ...value };
  delete copy[key];
  return sha256(copy);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function atomicWriteJson(path, value) {
  atomicWriteText(path, `${JSON.stringify(value, null, 2)}\n`);
}

function atomicWriteText(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temporary, value, "utf8");
  renameSync(temporary, path);
}

function cleanIdentity(value) {
  return typeof value === "string" ? [...value.normalize("NFKC").replace(/\s+/gu, " ").trim()].slice(0, 240).join("") : "";
}

function cleanSlot(value) {
  const text = String(value ?? "");
  return /^slot\d{2}$/u.test(text) ? text : "";
}

export const __test = Object.freeze({
  buildOverlapMapping,
  digestWithout,
  renderPublicContractMarkdown,
});
