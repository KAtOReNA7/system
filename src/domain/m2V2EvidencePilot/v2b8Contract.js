import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { canonicalJson, sha256 } from "./pilotCore.js";
import { readCurrentRequestStateSnapshot } from "./integrityState.js";
import {
  V2B7_BUNDLE_RELATIVE,
  V2B7_CANARY_MANIFEST_DIGEST,
  V2B7_MANIFEST_RELATIVE,
  V2B7_REPEAT_DIGEST,
  V2B7_SOURCE_BUNDLE_DIGEST,
  evaluateV2B7FreezeInvariants,
} from "./v2b7Contract.js";
import {
  auditV2B8Conflicts,
  canonicalizeV2B8Claim,
  classifyV2B8QueryExecution,
  compareV2B8CanonicalClaims,
  decomposeV2B8ClaimDifferences,
} from "./v2b8Stability.js";

export const V2B8_START_SHA = "3feb2847824124e2f28437907b00a57394f09cac";
export const V2B8_NAMESPACE = "v2b8-canary-stability";
export const V2B8_MODEL_ID = "gpt-5.6-terra";
export const V2B8_TIMEOUT_MS = 120_000;
export const V2B8_MAX_OUTPUT_TOKENS = 1_600;
export const V2B8_TAVILY_REQUEST_CAP = 12;
export const V2B8_RELAY_REQUEST_CAP = 24;
export const V2B8_MAX_REPAIRS = 4;
export const V2B8_PRIVATE_RELATIVE = "data/private-output/m2-v2-evidence-pilot/v2b8-canary-stability";
export const V2B8_V2B7_PRIVATE_RELATIVE = "data/private-output/m2-v2-evidence-pilot/v2b7-canary-v3";
export const V2B8_WORKBOOK_RELATIVE = "data/private-output/m2-v2-evidence-pilot/canary-v3-1/M2-v2-canary-v3-private-review-workbook-v0.3.xlsx";

export const V2B8_GATE_THRESHOLDS = Object.freeze({
  querySuccessRate: 0.8,
  sourceRecordWorkCoverage: 1,
  meanRepeatSourceOverlap: 0.7,
  primarySchemaPassRate: 0.9,
  repeatSchemaPassRate: 0.9,
  noTimeoutRate: 0.9,
  workResolvedRate: 0.8,
  pilotUsableWorkCoverage: 0.8,
  highValueCoverage: 1,
  sameSourceClaimAgreement: 0.8,
  endToEndSemanticClaimAgreement: 0.8,
  unknownPublicWebClaimShare: 0.4,
});

export const V2B8_FILES = Object.freeze({
  contract: "v2b8-stability-contract-private-v0.1.json",
  state: "v2b8-execution-state-private-v0.1.json",
  pretest: "v2b8-pretest-receipt-private-v0.1.json",
  forensic: "v2b8-failure-forensic-private-v0.1.json",
  tavilyCache: "v2b8-tavily-cache-private-v0.1.json",
  relayCache: "v2b8-relay-cache-private-v0.1.json",
  fallbackSearch: "canary-v3-1-fallback-search-private-v0.1.json",
  primarySearch: "canary-v3-1-primary-source-sets-private-v0.1.json",
  repeatSearch: "canary-v3-1-repeat-search-private-v0.1.json",
  relayReceipts: "canary-v3-1-relay-receipts-private-v0.1.ndjson",
  evidenceRecords: "canary-v3-1-evidence-records-private-v0.1.ndjson",
  reproducibility: "canary-v3-1-reproducibility-private-v0.1.json",
  evaluation: "canary-v3-1-evaluation-private-v0.1.json",
  usage: "canary-v3-1-usage-ledger-private-v0.1.json",
  validation: "canary-v3-1-full-validation-receipt-private-v0.1.json",
  verification: "canary-v3-1-verification-receipt-private-v0.1.json",
  workbookVerification: "canary-v3-1-workbook-verification-private-v0.1.json",
});

const PUBLIC = Object.freeze({
  forensicJson: "docs/analysis/m2-v2/M2-v2-v2b8-failure-forensic-v0.1.json",
  forensicMarkdown: "docs/analysis/m2-v2/M2-v2-v2b8-failure-forensic-v0.1.md",
  canonicalJson: "docs/technical-design/m2-v2/M2-v2-claim-canonicalization-contract-v0.1.json",
  canonicalMarkdown: "docs/technical-design/m2-v2/M2-v2-claim-canonicalization-contract-v0.1.md",
  timeConflictJson: "docs/technical-design/m2-v2/M2-v2-event-time-conflict-contract-v0.2.json",
  timeConflictMarkdown: "docs/technical-design/m2-v2/M2-v2-event-time-conflict-contract-v0.2.md",
  selectionJson: "docs/technical-design/m2-v2/M2-v2-source-selection-contract-v0.1.json",
  selectionMarkdown: "docs/technical-design/m2-v2/M2-v2-source-selection-contract-v0.1.md",
});

export function checkAndFreezeV2B8Contract(root, options = {}) {
  const manifest = readJson(join(root, V2B7_MANIFEST_RELATIVE));
  const bundle = readJson(join(root, V2B7_BUNDLE_RELATIVE));
  const v2b7Store = join(root, V2B8_V2B7_PRIVATE_RELATIVE);
  const v2b7AtomicSnapshot = readCurrentRequestStateSnapshot(root, { scope: "v2b7" });
  if (v2b7AtomicSnapshot.present && !v2b7AtomicSnapshot.valid) {
    throw new Error(`v2b8_v2b7_atomic_binding_invalid:${v2b7AtomicSnapshot.issues.join(",")}`);
  }
  const v2b7State = v2b7AtomicSnapshot.present
    ? v2b7AtomicSnapshot.members.state
    : readJson(join(v2b7Store, "v2b7-execution-state-private-v0.1.json"));
  const b5State = readJson(join(root, "data/private-output/m2-v2-evidence-pilot/v2-b5-independent-search-canary/v2b5-execution-state-private-v0.1.json"));
  const b6State = readJson(join(root, "data/private-output/m2-v2-evidence-pilot/v2-b6-extraction-remediation/v2b6-execution-state-private-v0.1.json"));
  const original = readJson(join(root, "data/private-output/m2-v2-evidence-pilot/canary-v0.1/canary-manifest-private-v0.1.json"));
  const invariant = evaluateV2B7FreezeInvariants({ original, manifest, bundle, b5State, b6State });
  if (!invariant.allPassed || manifest.manifestDigest !== V2B7_CANARY_MANIFEST_DIGEST
    || manifest.repeatDigest && manifest.repeatDigest !== V2B7_REPEAT_DIGEST
    || bundle.sourceBundleDigest !== V2B7_SOURCE_BUNDLE_DIGEST) {
    throw new Error(`v2b8_frozen_inputs_invalid:${invariant.issues.join(",")}`);
  }
  if (v2b7State.canaryExecuted !== true || v2b7State.full160Authorized !== false
    || v2b7State.tavily.physicalRequestCount !== 22 || v2b7State.relay.physicalRequestCount !== 15) {
    throw new Error("v2b8_v2b7_state_invalid");
  }
  const v2b7 = readV2B7Private(v2b7Store);
  const forensic = buildV2B8Forensic(v2b7, manifest);
  const privateStore = join(root, V2B8_PRIVATE_RELATIVE);
  mkdirSync(privateStore, { recursive: true });
  const existingContractPath = join(privateStore, V2B8_FILES.contract);
  const frozenAt = existsSync(existingContractPath)
    ? readJson(existingContractPath).frozenAt
    : options.now?.() ?? new Date().toISOString();
  const contractPayload = {
    schema: "m2.v2.v2b8-stability-contract-private.v0.1",
    privateOnly: true,
    immutable: true,
    frozenAt,
    startSha: V2B8_START_SHA,
    executionNamespace: V2B8_NAMESPACE,
    manifestDigest: V2B7_CANARY_MANIFEST_DIGEST,
    repeatDigest: V2B7_REPEAT_DIGEST,
    sourceBundleDigest: V2B7_SOURCE_BUNDLE_DIGEST,
    v2b7StateDigest: sha256(v2b7State),
    v2b7PrimarySearchDigest: sha256(v2b7.primarySearch),
    v2b7RepeatSearchDigest: sha256(v2b7.repeatSearch),
    v2b7EvidenceDigest: sha256(v2b7.evidenceRecords),
    route: {
      model: V2B8_MODEL_ID,
      extractionMode: "full",
      structuredMode: "server_strict",
      timeoutMs: V2B8_TIMEOUT_MS,
      maxOutputTokens: V2B8_MAX_OUTPUT_TOKENS,
      reasoningIncluded: false,
      toolsIncluded: false,
      relaySearchUsed: false,
    },
    budgets: {
      tavilyNewPhysicalRequestCap: V2B8_TAVILY_REQUEST_CAP,
      fallbackCap: 5,
      repeatSearchCap: 5,
      recoveryCap: 2,
      relayNewPhysicalRequestCap: V2B8_RELAY_REQUEST_CAP,
      fixedSourceRepeatCap: 10,
      freshSourceCorrectedCap: 10,
      repairCap: V2B8_MAX_REPAIRS,
      priorV2B7TavilyNewCount: v2b7State.tavily.physicalRequestCount,
      priorV2B7RelayNewCount: v2b7State.relay.physicalRequestCount,
      priorCumulativeTavilyCount: v2b7State.priorCounters.cumulativeTavily + v2b7State.tavily.physicalRequestCount,
      priorCumulativeRelayCount: v2b7State.priorCounters.cumulativeRelay + v2b7State.relay.physicalRequestCount,
      countersReset: false,
    },
    rules: {
      fallbackVersion: "deterministic-fallback-v0.1",
      canonicalizationVersion: "claim-canonicalization-v0.1",
      eventTimeVersion: "event-time-v0.2",
      conflictVersion: "conflict-detection-v0.2",
      sourceClassificationVersion: "source-classification-v0.4",
      sourceSelectionVersion: "deterministic-source-selection-v0.1",
      extractionPromptVersion: "stable-core-extraction-v0.3",
    },
    gateThresholds: V2B8_GATE_THRESHOLDS,
    noSampleReplacement: true,
    modelTrainingPerformed: false,
    b4Changed: false,
    formalCashTargetChanged: false,
    holdoutOpened: false,
    full160Authorized: false,
  };
  const contract = { ...contractPayload, contractDigest: sha256(contractPayload) };
  persistImmutable(existingContractPath, contract);
  const statePath = join(privateStore, V2B8_FILES.state);
  const state = existsSync(statePath) ? readJson(statePath) : newState(contract, frozenAt);
  assertState(state, contract);
  atomicWriteJson(statePath, state);
  atomicWriteJson(join(privateStore, V2B8_FILES.forensic), { ...forensic.private, privateOnly: true, full160Authorized: false });
  writePhaseAPublicArtifacts(root, forensic.public);
  return { manifest, bundle, v2b7, v2b7State, privateStore, contract, state, forensic, invariant };
}

export function readV2B8FrozenContract(root) {
  const manifest = readJson(join(root, V2B7_MANIFEST_RELATIVE));
  const bundle = readJson(join(root, V2B7_BUNDLE_RELATIVE));
  const v2b7Store = join(root, V2B8_V2B7_PRIVATE_RELATIVE);
  const v2b7State = readJson(join(v2b7Store, "v2b7-execution-state-private-v0.1.json"));
  const b5State = readJson(join(root, "data/private-output/m2-v2-evidence-pilot/v2-b5-independent-search-canary/v2b5-execution-state-private-v0.1.json"));
  const b6State = readJson(join(root, "data/private-output/m2-v2-evidence-pilot/v2-b6-extraction-remediation/v2b6-execution-state-private-v0.1.json"));
  const original = readJson(join(root, "data/private-output/m2-v2-evidence-pilot/canary-v0.1/canary-manifest-private-v0.1.json"));
  const invariant = evaluateV2B7FreezeInvariants({ original, manifest, bundle, b5State, b6State });
  if (!invariant.allPassed || manifest.manifestDigest !== V2B7_CANARY_MANIFEST_DIGEST
    || manifest.repeatDigest && manifest.repeatDigest !== V2B7_REPEAT_DIGEST
    || bundle.sourceBundleDigest !== V2B7_SOURCE_BUNDLE_DIGEST) {
    throw new Error(`v2b8_frozen_inputs_invalid:${invariant.issues.join(",")}`);
  }
  if (v2b7State.canaryExecuted !== true || v2b7State.full160Authorized !== false
    || v2b7State.tavily.physicalRequestCount !== 22 || v2b7State.relay.physicalRequestCount !== 15) {
    throw new Error("v2b8_v2b7_state_invalid");
  }
  const v2b7 = readV2B7Private(v2b7Store);
  const forensic = buildV2B8Forensic(v2b7, manifest);
  const privateStore = join(root, V2B8_PRIVATE_RELATIVE);
  const contract = readJson(join(privateStore, V2B8_FILES.contract));
  if (digestWithout(contract, "contractDigest") !== contract.contractDigest) {
    throw new Error("v2b8_private_contract_digest_invalid");
  }
  const atomicSnapshot = readCurrentRequestStateSnapshot(root, { scope: "v2b8" });
  if (atomicSnapshot.present && !atomicSnapshot.valid) {
    throw new Error(`v2b8_atomic_binding_invalid:${atomicSnapshot.issues.join(",")}`);
  }
  const state = atomicSnapshot.present ? atomicSnapshot.members.state : readJson(join(privateStore, V2B8_FILES.state));
  assertState(state, contract);
  return { manifest, bundle, v2b7, v2b7State, privateStore, contract, state, forensic, invariant, atomicBinding: atomicSnapshot };
}

export function buildV2B8Forensic(v2b7, manifest) {
  const queries = [...v2b7.primarySearch.runs, ...v2b7.repeatSearch.runs].flatMap((run) => run.queries ?? []);
  const queryFailureClassification = countBy(queries, classifyV2B8QueryExecution);
  const sourceRows = v2b7.sourceRecords;
  const evidence = v2b7.evidenceRecords;
  const enrichedByRun = new Map();
  for (const run of [...v2b7.primarySearch.runs, ...v2b7.repeatSearch.runs]) {
    const work = manifest.sample.find((item) => item.canarySlotId === run.canarySlotId);
    const sources = sourceRows.filter((row) => row.runKind === run.runKind && row.canarySlotId === run.canarySlotId);
    const claims = evidence.filter((row) => row.runKind === run.runKind && row.canarySlotId === run.canarySlotId)
      .map((claim) => canonicalizeV2B8Claim(claim, { work, sourceRecords: sources }));
    enrichedByRun.set(`${run.runKind}:${run.canarySlotId}`, auditV2B8Conflicts(claims).claims);
  }
  const pairs = manifest.repeatSample.map((repeat, index) => {
    const slot = repeat.canarySlotId;
    const primaryRun = v2b7.primarySearch.runs.find((run) => run.canarySlotId === slot);
    const repeatRun = v2b7.repeatSearch.runs.find((run) => run.canarySlotId === slot);
    const primaryClaims = enrichedByRun.get(`primary:${slot}`) ?? [];
    const repeatClaims = enrichedByRun.get(`repeat:${slot}`) ?? [];
    const decomposition = decomposeV2B8ClaimDifferences({
      primaryClaims,
      freshClaims: repeatClaims,
      sameSourceClaims: [],
      primarySourceDigest: primaryRun.sourceRecordSetDigest,
      freshSourceDigest: repeatRun.sourceRecordSetDigest,
    });
    const primaryIds = new Set(primaryRun.sourceRecords.map((source) => source.sourceId));
    const repeatIds = new Set(repeatRun.sourceRecords.map((source) => source.sourceId));
    const overlap = jaccard(primaryIds, repeatIds);
    return {
      anonymousPairId: `pair_${index + 1}`,
      sourceOverlap: overlap,
      exactSourceSet: overlap === 1,
      canonicalUrlOverlap: overlap,
      intentSetEqual: canonicalJson((primaryRun.queries ?? []).map((query) => query.intent).sort())
        === canonicalJson((repeatRun.queries ?? []).map((query) => query.intent).sort()),
      rankAgreement: rankAgreement(primaryRun.sourceRecords, repeatRun.sourceRecords),
      ...decomposition,
    };
  });
  const contributions = {
    sourceSetChangedPairCount: pairs.filter((pair) => pair.sourceSetChanged).length,
    sameSourceExtractionChangedPairCount: null,
    canonicalizationOnlyPairCount: pairs.filter((pair) => pair.canonicalizationOnlyDifference).length,
    claimAdded: sum(pairs.map((pair) => pair.claimAdded)),
    claimMissing: sum(pairs.map((pair) => pair.claimMissing)),
    structuredValueChanged: sum(pairs.map((pair) => pair.structuredValueChanged)),
    confidenceOnlyChanged: sum(pairs.map((pair) => pair.confidenceOnlyChanged)),
    conflictStatusChanged: sum(pairs.map((pair) => pair.conflictStatusChanged)),
    eventTimeChanged: sum(pairs.map((pair) => pair.eventTimeChanged)),
  };
  const publicForensic = {
    schema: "m2.v2.v2b8-failure-forensic-public.v0.1",
    status: "not_for_formal_decision",
    queryCount: queries.length,
    queryFailureClassification,
    failedQueryCount: queries.filter((query) => query.contractValid !== true).length,
    repeatPairCount: pairs.length,
    meanSourceOverlap: average(pairs.map((pair) => pair.sourceOverlap)),
    medianSourceOverlap: percentile(pairs.map((pair) => pair.sourceOverlap), 0.5),
    exactSourceSetCount: pairs.filter((pair) => pair.exactSourceSet).length,
    currentSemanticClaimAgreement: average(pairs.map((pair) => pair.semanticAgreement).filter(Number.isFinite)),
    currentRawClaimAgreement: average(pairs.map((pair) => pair.rawAgreement).filter(Number.isFinite)),
    contributions,
    sameSourceExtractionStabilityStatus: "not_evaluated_before_v2b8_replay",
    primaryRepeatSourceInstabilityObserved: pairs.some((pair) => pair.sourceOverlap < 1),
    full160Authorized: false,
  };
  return {
    public: publicForensic,
    private: { schema: "m2.v2.v2b8-failure-forensic-private.v0.1", ...publicForensic, pairs },
  };
}

export function recordV2B8Pretest(root, input) {
  const frozen = checkAndFreezeV2B8Contract(root, { now: input.now });
  const payload = {
    schema: "m2.v2.v2b8-pretest-receipt-private.v0.1",
    privateOnly: true,
    completedAt: input.now?.() ?? new Date().toISOString(),
    exitCode: input.exitCode,
    allPassed: input.exitCode === 0,
    stdoutDigest: input.stdoutDigest,
    stderrDigest: input.stderrDigest,
    newTavilyPhysicalRequestCount: 0,
    newRelayPhysicalRequestCount: 0,
    full160Authorized: false,
  };
  const receipt = { ...payload, receiptDigest: sha256(payload) };
  atomicWriteJson(join(frozen.privateStore, V2B8_FILES.pretest), receipt);
  frozen.state.pretestsPassed = receipt.allPassed;
  if (!frozen.state.canaryExecuted) frozen.state.phase = receipt.allPassed ? "phase_a_frozen" : "phase_a_pretest_failed";
  atomicWriteJson(join(frozen.privateStore, V2B8_FILES.state), frozen.state);
  return receipt;
}

export function assertPublicV2B8Sanitized(content) {
  const forbidden = [
    "data/private-output",
    "OPENAI_API_KEY",
    "TAVILY_API_KEY",
    "Authorization",
    "sk-",
    "tvly-",
    "canarySlotId",
    "identityDigest",
    "providerReceipt",
  ];
  for (const token of forbidden) if (content.includes(token)) throw new Error(`v2b8_public_privacy_token:${token}`);
  if (/https?:\/\//iu.test(content)) throw new Error("v2b8_public_url_forbidden");
  if (/[A-Za-z]:[\\/]/u.test(content)) throw new Error("v2b8_public_absolute_path_forbidden");
  return true;
}

function writePhaseAPublicArtifacts(root, forensic) {
  const canonical = {
    schema: "m2.v2.claim-canonicalization-contract-public.v0.1",
    status: "not_for_formal_decision",
    deterministic: true,
    llmJudgeUsed: false,
    canonicalKeyFields: ["claimType", "normalizedStructuredValue", "normalizedEventTime", "eventTimePrecision", "normalizedEntityReference", "sourceSupportClass"],
    textNormalization: ["unicode_nfkc", "case", "width", "punctuation", "whitespace", "book_marks", "common_date", "numeric_string"],
    identityEditionAware: true,
    ratingRequiresPlatformScale: true,
    reviewSignalPilotUsableByDefault: false,
    completionStatuses: ["ongoing", "completed", "unknown", "contradictory"],
    maxClaimsPerWork: 10,
    full160Authorized: false,
  };
  const timeConflict = {
    schema: "m2.v2.event-time-conflict-contract-public.v0.2",
    status: "not_for_formal_decision",
    eventTimePrecisions: ["day", "month", "year", "range", "unknown"],
    eventTimeBases: ["explicit_structured_value", "explicit_source_snippet", "explicit_source_title", "unknown"],
    explicitTemporalClaimExtractionRequired: true,
    explicitTemporalClaimExtractionThreshold: 1,
    conflictTypes: ["publication_version", "publisher", "completion", "adaptation_stage", "rating_platform_scale", "identity_edition", "author_identity"],
    multiEditionAutoConflict: false,
    unresolvedConflictPilotUsable: false,
    full160Authorized: false,
  };
  const selection = {
    schema: "m2.v2.source-selection-contract-public.v0.1",
    status: "not_for_formal_decision",
    deterministic: true,
    maximumSourcesPerWorkQuery: 6,
    sortOrder: ["non_prohibited", "official_publisher_platform", "direct_identity_relevance", "provider_score", "canonical_resource_lexical", "source_id_lexical"],
    maximumPerSourceHost: 2,
    domainCapException: "insufficient_total_sources",
    categoryDiversityRequired: true,
    ratingReviewCannotDisplaceIdentityOfficial: true,
    sampleReplacementAllowed: false,
    full160Authorized: false,
  };
  const outputs = {
    [PUBLIC.forensicJson]: `${JSON.stringify(forensic, null, 2)}\n`,
    [PUBLIC.forensicMarkdown]: renderForensic(forensic),
    [PUBLIC.canonicalJson]: `${JSON.stringify(canonical, null, 2)}\n`,
    [PUBLIC.canonicalMarkdown]: renderCanonical(canonical),
    [PUBLIC.timeConflictJson]: `${JSON.stringify(timeConflict, null, 2)}\n`,
    [PUBLIC.timeConflictMarkdown]: renderTimeConflict(timeConflict),
    [PUBLIC.selectionJson]: `${JSON.stringify(selection, null, 2)}\n`,
    [PUBLIC.selectionMarkdown]: renderSelection(selection),
  };
  for (const [relative, content] of Object.entries(outputs)) {
    assertPublicV2B8Sanitized(content);
    atomicWriteText(join(root, relative), content);
  }
}

function renderForensic(report) {
  const q = report.queryFailureClassification;
  return `# M2 v2 V2-B.8 失败取证 v0.1\n\n- 旧逻辑请求：${report.queryCount}；失败：${report.failedQueryCount}\n- 合同成功：${q.success_contract_valid ?? 0}\n- HTTP 成功但零结果：${q.http_success_zero_result ?? 0}\n- HTTP 成功但合同无效：${q.http_success_contract_invalid ?? 0}\n- transport / auth-rate-limit / crash：${q.transport ?? 0} / ${q.auth_or_rate_limit ?? 0} / ${q.indeterminate_after_crash ?? 0}\n- repeat 来源 overlap mean/median：${percent(report.meanSourceOverlap)} / ${percent(report.medianSourceOverlap)}；exact：${report.exactSourceSetCount}/${report.repeatPairCount}\n- 旧 raw / canonical semantic agreement：${percent(report.currentRawClaimAgreement)} / ${percent(report.currentSemanticClaimAgreement)}\n- source-set changed pairs：${report.contributions.sourceSetChangedPairCount}/${report.repeatPairCount}\n- same-source stability：重放前未评估，不以 0 冒充。\n- 结论：需要 deterministic fallback、source selection、same-source extraction 与 canonical semantic comparison。\n- full160Authorized：false\n`;
}

function renderCanonical(contract) {
  return `# M2 v2 Claim Canonicalization 合同 v0.1\n\n- 本地确定性规则；不使用额外 LLM judge。\n- Canonical key：${contract.canonicalKeyFields.join("、")}。\n- Identity 保留 edition 差异；rating 缺 platform/scale 不可 pilotUsable；单人 review 默认弱信号。\n- completion 仅允许 ongoing/completed/unknown/contradictory。\n- 每部最多 ${contract.maxClaimsPerWork} 条 claim。\n- full160Authorized：false\n`;
}

function renderTimeConflict(contract) {
  return `# M2 v2 Event Time / Conflict 合同 v0.2\n\n- 时间精度：${contract.eventTimePrecisions.join("、")}。\n- 明确日期文本提取率必须 100%；不虚构月日。\n- 检测出版版本、出版社、完结、改编阶段、rating 平台/scale、identity edition 与作者冲突。\n- 多 edition 不自动判冲突；unresolved conflict 不可 pilotUsable。\n- full160Authorized：false\n`;
}

function renderSelection(contract) {
  return `# M2 v2 Deterministic Source Selection 合同 v0.1\n\n- 每个 work/query 最多 ${contract.maximumSourcesPerWorkQuery} 条。\n- 顺序：non-prohibited、official/publisher/platform、身份相关、provider score、canonical resource lexical、sourceId lexical。\n- 单一来源 host 最多 ${contract.maximumPerSourceHost} 条；仅来源不足时补足。\n- rating/review 不得挤掉 identity 官方来源；不允许替换样本。\n- full160Authorized：false\n`;
}

function readV2B7Private(store) {
  return {
    primarySearch: readJson(join(store, "canary-v3-primary-search-private-v0.2.json")),
    repeatSearch: readJson(join(store, "canary-v3-repeat-search-private-v0.2.json")),
    sourceRecords: readNdjson(join(store, "canary-v3-source-records-private-v0.2.ndjson")),
    evidenceRecords: readNdjson(join(store, "canary-v3-evidence-records-private-v0.2.ndjson")),
    relayReceipts: readNdjson(join(store, "canary-v3-relay-receipts-private-v0.2.ndjson")),
  };
}

function newState(contract, createdAt) {
  return {
    schema: "m2.v2.v2b8-execution-state-private.v0.1",
    privateOnly: true,
    createdAt,
    phase: "phase_a_contract_created",
    contractDigest: contract.contractDigest,
    manifestDigest: contract.manifestDigest,
    repeatDigest: contract.repeatDigest,
    sourceBundleDigest: contract.sourceBundleDigest,
    tavily: { cap: V2B8_TAVILY_REQUEST_CAP, physicalRequestCount: 0, reservations: {} },
    relay: { cap: V2B8_RELAY_REQUEST_CAP, physicalRequestCount: 0, repairCount: 0, reservations: {} },
    pretestsPassed: false,
    canaryExecuted: false,
    full160Authorized: false,
  };
}

function assertState(state, contract) {
  if (state.contractDigest !== contract.contractDigest || state.manifestDigest !== V2B7_CANARY_MANIFEST_DIGEST
    || state.repeatDigest !== V2B7_REPEAT_DIGEST || state.sourceBundleDigest !== V2B7_SOURCE_BUNDLE_DIGEST) throw new Error("v2b8_state_contract_mismatch");
  if (state.tavily?.cap !== V2B8_TAVILY_REQUEST_CAP || state.relay?.cap !== V2B8_RELAY_REQUEST_CAP) throw new Error("v2b8_state_cap_changed");
  if (state.tavily.physicalRequestCount > V2B8_TAVILY_REQUEST_CAP || state.relay.physicalRequestCount > V2B8_RELAY_REQUEST_CAP
    || state.relay.repairCount > V2B8_MAX_REPAIRS) throw new Error("v2b8_state_cap_exceeded");
  if (state.full160Authorized !== false) throw new Error("v2b8_full160_invariant_changed");
}

function persistImmutable(path, candidate) {
  if (!existsSync(path)) return atomicWriteJson(path, candidate);
  const current = readJson(path);
  if (current.contractDigest !== candidate.contractDigest || digestWithout(current, "contractDigest") !== current.contractDigest) {
    throw new Error("v2b8_immutable_contract_changed");
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

function readNdjson(path) {
  return readFileSync(path, "utf8").split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
}

function atomicWriteJson(path, value) {
  atomicWriteText(path, `${JSON.stringify(value, null, 2)}\n`);
  return value;
}

function atomicWriteText(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temporary, value, "utf8");
  renameSync(temporary, path);
}

function rankAgreement(primary, repeat) {
  const repeatRank = new Map(repeat.map((source, index) => [source.sourceId, index]));
  const differences = primary.map((source, index) => repeatRank.has(source.sourceId) ? Math.abs(index - repeatRank.get(source.sourceId)) : null).filter(Number.isFinite);
  if (!differences.length) return 0;
  return 1 - Math.min(1, average(differences) / Math.max(primary.length, repeat.length, 1));
}

function jaccard(left, right) {
  const union = new Set([...left, ...right]);
  return union.size ? [...left].filter((value) => right.has(value)).length / union.size : 0;
}

function countBy(values, keyFn) {
  return values.reduce((result, value) => {
    const key = keyFn(value);
    result[key] = (result[key] ?? 0) + 1;
    return result;
  }, {});
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value ?? 0), 0);
}

function average(values) {
  return values.length ? sum(values) / values.length : null;
}

function percentile(values, fraction) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return null;
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return lower === upper ? sorted[lower] : sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function percent(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : "N/A";
}

export const __test = Object.freeze({
  assertState,
  buildV2B8Forensic,
  digestWithout,
  readV2B7Private,
});
