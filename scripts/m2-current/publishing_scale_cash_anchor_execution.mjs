import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  writeFile
} from "node:fs/promises";
import path from "node:path";

import {
  M2_PSC02_MODEL_ID,
  M2_PSC02_RAW_CANDIDATE_ID,
  buildM2Psc02SyntheticImplementationDiagnostic,
  validateM2Psc02DevelopmentConfig
} from "../../src/domain/m2Current/publishingScaleCashAnchorDevelopment.js";
import {
  verifyM2PublishingScaleGitAndCiPreflight
} from "./publishing_scale_channel_execution.mjs";

const IMPLEMENTATION_CONFIG =
  "config/m2-current-publishing-scale-channel-origin-visible-cash-anchor-development.v0.1.json";
const PREREGISTRATION_CONFIG =
  "config/m2-current-publishing-scale-channel-origin-visible-cash-anchor-preregistration.v0.1.json";
const ANCHOR_SCHEMA =
  "config/m2-current-publishing-scale-channel-origin-visible-cash-anchor-schema.v0.1.json";
const PSC01_CONFIG = "config/m2-current-publishing-scale-channel.v0.1.json";
const SUPPORT_CONFIG = "config/m2-publishing-scale-statistical-support.v1.json";
const EVALUATION_CONFIG = "config/m2-evaluation-contract.v2.2.json";
const BUSINESS_CONFIG = "config/m2-business-acceptance-contract.v1.json";
const IMPLEMENTATION_SOURCE =
  "src/domain/m2Current/publishingScaleCashAnchorDevelopment.js";
const MATERIALIZER = "scripts/m2-current/materialize_human_anchored_cases.py";
const READINESS_JSON =
  "docs/analysis/m2-current/M2-publishing-scale-channel-origin-visible-cash-anchor-implementation-readiness-v0.1.json";
const EVALUATION_JSON =
  "docs/analysis/m2-current/M2-publishing-scale-channel-origin-visible-cash-anchor-development-evaluation-v0.1.json";
const EVALUATION_MD =
  "docs/analysis/m2-current/M2-publishing-scale-channel-origin-visible-cash-anchor-development-evaluation-v0.1.md";
const DECISION_MD =
  "docs/analysis/m2-current/M2-publishing-scale-channel-origin-visible-cash-anchor-implementation-and-result-decision-v0.1.md";

export async function runM2Psc02PublicDiagnostic({root, verify = false}) {
  const contracts = await readContracts(root);
  validateM2Psc02DevelopmentConfig(contracts.implementation, contracts);
  const diagnostic = buildM2Psc02SyntheticImplementationDiagnostic({
    implementation: contracts.implementation,
    preregistration: contracts.preregistration,
    psc01Config: contracts.psc01Config,
    supportContract: contracts.supportContract,
    evaluationContract: contracts.evaluationContract,
    businessAcceptanceContract: contracts.businessAcceptanceContract
  });
  const result = Object.freeze({
    schema: "m2.current.psc02.implementation_readiness_public.v0.1",
    status: "M2_PSC02_IMPLEMENTED_AWAITING_EXACT_HEAD_CI_AND_CONTROLLED_DEVELOPMENT_REPLAY",
    modelId: M2_PSC02_MODEL_ID,
    rawCandidateId: M2_PSC02_RAW_CANDIDATE_ID,
    experimentId: contracts.implementation.experimentId,
    primaryArmId: contracts.implementation.primaryArmId,
    diagnosticArmIds: Object.freeze([
      ...contracts.implementation.diagnosticArmIds
    ]),
    evidenceClass: "DEVELOPMENT_REPLAY",
    syntheticDiagnostic: diagnostic,
    implementation: Object.freeze({
      frozenPsc01OccurrencePassThrough: true,
      originVisibleCashAnchor: true,
      anchorFallbackOrder: Object.freeze([
        ...contracts.preregistration.cashAnchor.fallbackOrder
      ]),
      residualFeatureCount:
        contracts.preregistration.occurrenceFreeze.featureOrder.length,
      residualBasisCopiedFromPsc01: true,
      nestedPrimaryWorkSelection: true,
      strictRollingTimeSelection: true,
      gammaFitLinearPredictorClipUsed: false,
      finalPredictionResidualClip: Object.freeze([
        ...contracts.preregistration.amountDesign.residualPredictionClip
      ]),
      diagnosticArmsMayReplacePrimary: false,
      taxonomy: "REPORT_ONLY",
      lg01PredictionDependency: false
    }),
    execution: Object.freeze({
      privateMetadataOnlyPrecheckAllowed: true,
      completePrimaryRawResultMaximum: 1,
      exactHeadLinuxWindowsCiRequiredBeforePrediction: true,
      realPredictionGenerated: false,
      outerOutcomeOpened: false,
      candidateMetricsComputed: false
    }),
    boundaries: Object.freeze({...contracts.implementation.boundaries})
  });
  if (verify) {
    const expected = JSON.parse(await readFile(
      path.join(root, READINESS_JSON),
      "utf8"
    ));
    if (stableJson(expected) !== stableJson(result)) {
      throw new Error("m2_psc02_implementation_readiness_artifact_drift");
    }
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result;
}

export async function runM2Psc02MetadataPrecheck({root}) {
  const contracts = await readContracts(root);
  validateM2Psc02DevelopmentConfig(contracts.implementation, contracts);
  const result = invokePython(root, "--psc02-metadata-precheck");
  assertMetadataPrecheck(result);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result;
}

export async function runM2Psc02ControlledDevelopmentReplay({root}) {
  const contracts = await readContracts(root);
  validateM2Psc02DevelopmentConfig(contracts.implementation, contracts);
  const gitPreflight = verifyM2PublishingScaleGitAndCiPreflight({root});
  const privateDirectory = resolvePrivateDirectory(
    root,
    contracts.implementation.privateOutputs.directory
  );
  await mkdir(privateDirectory, {recursive: true});
  const prefix = contracts.implementation.privateOutputs.runReceiptPrefix;
  const existing = (await readdir(privateDirectory)).filter(
    (name) => name.startsWith(`${prefix}-`) && name.endsWith(".json")
  );
  if (existing.length > 0) {
    throw new Error("m2_psc02_controlled_replay_attempt_already_recorded");
  }
  const receiptFile = `${prefix}-${gitPreflight.head.slice(0, 12)}-attempt-1.json`;
  const receiptPath = path.join(privateDirectory, receiptFile);
  const receipt = {
    schema: "m2.current.psc02.development_replay_receipt.private.v0.1",
    tracked: false,
    status: "PREPARED_BEFORE_PRIVATE_AUTHORITY_READ",
    modelId: M2_PSC02_MODEL_ID,
    rawCandidateId: M2_PSC02_RAW_CANDIDATE_ID,
    experimentId: contracts.implementation.experimentId,
    primaryArmId: contracts.implementation.primaryArmId,
    evidenceClass: "DEVELOPMENT_REPLAY",
    implementationCommit: gitPreflight.head,
    codeSha256: digest(contracts.texts.implementationSource),
    configSha256: digest(contracts.texts.implementation),
    preregistrationSha256: digest(contracts.texts.preregistration),
    anchorSchemaSha256: digest(contracts.texts.anchorSchema),
    frozenOccurrenceConfigSha256: digest(contracts.texts.psc01Config),
    supportContractSha256: digest(contracts.texts.supportContract),
    gitPreflight,
    attemptNumber: 1,
    candidateFitStarted: false,
    realPredictionGenerated: false,
    predictionRowsProduced: 0,
    outerOutcomeOpened: false,
    candidateMetricsComputed: false,
    bootstrapExecuted: false,
    completePrimaryRawResultFormed: false,
    finalHoldoutOpened: false,
    productionModified: false,
    automationAuthorized: false,
    activeCandidate: null,
    approvedForAutomation: null,
    startedAt: new Date().toISOString()
  };
  await writeFile(
    receiptPath,
    `${JSON.stringify(receipt, null, 2)}\n`,
    {encoding: "utf8", flag: "wx"}
  );
  let authority;
  try {
    authority = invokePython(root, "--psc02-authority-execution-precheck");
  } catch (error) {
    await closeReceipt(receiptPath, {
      status: "FAILED_CLOSED_PRIVATE_AUTHORITY_PREFLIGHT_INFRASTRUCTURE_ERROR",
      failureCode: error.message,
      infrastructureRecoveryEligible: true
    });
    throw error;
  }
  if (authority.readyForPrediction !== true) {
    const closed = await closeReceipt(receiptPath, {
      status: "FAILED_CLOSED_PRIVATE_SOURCE_AUTHORITY_BEFORE_PREDICTION",
      finalScientificStatus: "PSC02_DEVELOPMENT_NOT_SUPPORTED",
      decisionClass: "PRIVATE_SOURCE_AUTHORITY_BLOCKER_NOT_MODEL_FAILURE",
      authorityPrecheck: authority,
      infrastructureRecoveryEligible: false,
      candidateFitStarted: false,
      realPredictionGenerated: false,
      predictionRowsProduced: 0,
      outerOutcomeOpened: false,
      candidateMetricsComputed: false,
      bootstrapExecuted: false,
      completePrimaryRawResultFormed: false
    });
    const publicResult = buildAuthorityBlockedPublicResult({
      contracts,
      gitPreflight,
      authority,
      receiptFile,
      receipt: closed
    });
    await publishAuthorityBlockedResult(root, publicResult);
    process.stdout.write(`${JSON.stringify(publicResult)}\n`);
    return publicResult;
  }
  await closeReceipt(receiptPath, {
    status: "FAILED_CLOSED_AUTHORITY_READY_WITHOUT_COMPATIBLE_COMPONENT_ADAPTER",
    failureCode: "m2_psc02_component_authority_adapter_unreachable_contract_state",
    infrastructureRecoveryEligible: true
  });
  throw new Error(
    "m2_psc02_component_authority_adapter_unreachable_contract_state"
  );
}

function buildAuthorityBlockedPublicResult({
  contracts,
  gitPreflight,
  authority,
  receiptFile,
  receipt
}) {
  const armStatus = "NOT_EXECUTED_PRIVATE_SOURCE_AUTHORITY_BLOCKED";
  return Object.freeze({
    schema: "m2.current.psc02.development_evaluation_public.v0.1",
    asOf: "2026-08-01",
    status: "PSC02_DEVELOPMENT_NOT_SUPPORTED",
    decisionClass: "PRIVATE_SOURCE_AUTHORITY_BLOCKER_NOT_MODEL_FAILURE",
    modelId: M2_PSC02_MODEL_ID,
    rawCandidateId: M2_PSC02_RAW_CANDIDATE_ID,
    experimentId: contracts.implementation.experimentId,
    evidenceClass: "DEVELOPMENT_REPLAY",
    execution: Object.freeze({
      attemptCount: 1,
      resultBeforeEngineeringAttemptCount: 1,
      firstCompletePrimaryRawResultFormed: false,
      frozenPrimaryRawResultExists: false,
      receiptSchema: receipt.schema,
      receiptFilePublished: false,
      receiptIdentityRecordedPrivately: Boolean(receiptFile),
      candidateFitStarted: false,
      realPredictionGenerated: false,
      predictionRowsProduced: 0,
      outerOutcomeOpened: false,
      candidateMetricsComputed: false,
      bootstrapExecuted: false
    }),
    preExecution: Object.freeze({
      exactHead: gitPreflight.head,
      branch: gitPreflight.branch,
      pullRequestNumber: gitPreflight.prNumber,
      linuxCheck: gitPreflight.linuxCheck,
      windowsCheck: gitPreflight.windowsCheck,
      codeSha256: digest(contracts.texts.implementationSource),
      configSha256: digest(contracts.texts.implementation),
      preregistrationSha256: digest(contracts.texts.preregistration),
      anchorSchemaSha256: digest(contracts.texts.anchorSchema)
    }),
    privateAuthority: Object.freeze({
      sourceFilesPresent: authority.cashAuthority.sourceFilesPresent,
      componentRevisionTimeSchemaReady:
        authority.cashAuthority.schemaReady,
      missingNonDerivableFields: Object.freeze([
        ...authority.cashAuthority.nonDerivableRequiredFieldsMissing
      ]),
      ledgerPartitionReconciliationStatus:
        authority.cashAuthority.partitionReconciliationStatus,
      ledgerPartitionReconciliationError:
        authority.cashAuthority.partitionReconciliationError,
      frozenPsc01ReceiptCount:
        authority.frozenPsc01.completedFrozenReceiptCount,
      frozenPsc01ManifestValid: authority.frozenPsc01.manifestValid,
      frozenPsc01RowCount: authority.frozenPsc01.rowCount,
      frozenPsc01DigestPresent: authority.frozenPsc01.digestPresent,
      frozenLg01ComparatorPresent: authority.frozenLg01.ready,
      frozenLg01ScoresRead: false,
      rowLevelPrivateDataPublished: false,
      privateDigestPublished: false
    }),
    arms: Object.freeze({
      anchorOnlyDiagnostic: Object.freeze({
        armId: contracts.implementation.diagnosticArmIds[0],
        role: "MECHANISM_ATTRIBUTION_ONLY_NOT_CANDIDATE",
        status: armStatus,
        metrics: null
      }),
      logRatioDiagnostic: Object.freeze({
        armId: contracts.implementation.diagnosticArmIds[1],
        role: "MECHANISM_ATTRIBUTION_ONLY_NOT_CANDIDATE",
        status: armStatus,
        metrics: null
      }),
      primary: Object.freeze({
        armId: contracts.implementation.primaryArmId,
        candidateId: M2_PSC02_RAW_CANDIDATE_ID,
        status: armStatus,
        metrics: null,
        pairedBootstrap: null
      })
    }),
    correctnessGates: Object.freeze({
      cashAuthoritySchema: "FAILED_CLOSED",
      ledgerPartitionReconciliation: "FAILED_CLOSED",
      occurrenceBinary64Parity: "NOT_EXECUTED_BEFORE_PREDICTION",
      exactPsc01CaseCoverage: "NOT_EXECUTED_BEFORE_PREDICTION",
      noTimeLeakage: "NOT_EVALUABLE_WITHOUT_VALID_AUTHORITY",
      occurrenceAppliedOnce: "PUBLIC_SYNTHETIC_VERIFIED_ONLY",
      anchorAppliedOnce: "PUBLIC_SYNTHETIC_VERIFIED_ONLY",
      horizonSummedOnce: "PUBLIC_SYNTHETIC_VERIFIED_ONLY",
      taxonomyReportOnly: "PUBLIC_IMPLEMENTATION_VERIFIED",
      noLg01PredictionDependency: "PUBLIC_IMPLEMENTATION_VERIFIED",
      rawCandidatePreserved: "NO_RAW_CANDIDATE_RESULT_FORMED"
    }),
    metrics: Object.freeze({
      primary: null,
      strict: null,
      horizons: null,
      namedPlatforms: null,
      mechanisms: null,
      anchorFallbackTiers: null,
      topCashWorks: null,
      normalizedChannelComposition: null,
      psc01SameCase: null,
      lg01SameCase: null,
      bootstrap: null,
      suppressionReason: "NO_CANDIDATE_RESULT_SOURCE_AUTHORITY_BLOCKED"
    }),
    interpretation: Object.freeze({
      modelPerformanceEvaluated: false,
      candidateFailedOnMetrics: false,
      designDirectionSupportedByPrivateOutcome: false,
      independentEvaluationRequestSupported: false,
      nextAction: "RESTORE_OR_PROVIDE_AUTHENTIC_REVISIONED_COMPONENT_AUTHORITY_UNDER_SEPARATE_SCOPE_THEN_REQUIRE_NEW_EXACT_HEAD_CI_BEFORE_ANY_RETRY"
    }),
    boundaries: Object.freeze({
      activeCandidate: null,
      approvedForAutomation: null,
      productionReady: false,
      finalHoldoutOpened: false,
      independentEvaluationOpened: false,
      laterOriginOpened: false,
      productionModified: false,
      automationAuthorized: false,
      releaseAuthorized: false,
      databaseUsed: false,
      apiModified: false,
      providerUsed: false,
      financialUseAuthorized: false
    })
  });
}

async function publishAuthorityBlockedResult(root, result) {
  await writeFile(
    path.join(root, EVALUATION_JSON),
    `${JSON.stringify(result, null, 2)}\n`,
    "utf8"
  );
  await writeFile(path.join(root, EVALUATION_MD), renderEvaluation(result), "utf8");
  await writeFile(path.join(root, DECISION_MD), renderDecision(result), "utf8");
}

function renderEvaluation(result) {
  const missing = result.privateAuthority.missingNonDerivableFields
    .map((value) => `\`${value}\``).join("、");
  return `# M2 出版行业渠道起点可见现金锚开发重放评价 v0.1

状态：开发不支持（\`${result.status}\`）。这是一项私有源权威阻断，**不是模型性能失败**
（\`${result.decisionClass}\`）。

## 结论

唯一受控开发重放（\`${result.evidenceClass}\`）在任何真实 PSC02 预测、outer outcome、
候选 WAPE/FVA 或 bootstrap 形成前失败关闭。当前人工分成账本缺少不可事后推造的
${missing}，且人工拆分账本守恒复核状态为
\`${result.privateAuthority.ledgerPartitionReconciliationStatus}\`。因此不能把账单月或当前
缓存补写成合法历史 revision，也不能只在可锚定子集上评分。

冻结 PSC01 原始候选（\`M2-CHAN-PSC01-RAW\`）的 receipt、manifest 与
${result.privateAuthority.frozenPsc01RowCount} 行月度人口元数据存在；冻结 LG01 比较器也存在。
它们只证明比较器入口可用，不能弥补现金锚源权威缺口。

## 三个实验臂

| 所属实验与对象 | 角色 | 本次状态 | 结果 |
|---|---|---|---|
| 现金锚单独诊断（\`${result.arms.anchorOnlyDiagnostic.armId}\`） | 机制归因诊断 | \`${result.arms.anchorOnlyDiagnostic.status}\` | 未执行、无指标 |
| 锚定对数比率岭回归诊断（\`${result.arms.logRatioDiagnostic.armId}\`） | 机制归因诊断 | \`${result.arms.logRatioDiagnostic.status}\` | 未执行、无指标 |
| 锚定准 Gamma offset 主设计（\`${result.arms.primary.armId}\`；\`${result.rawCandidateId}\`） | 唯一 raw candidate | \`${result.arms.primary.status}\` | 未形成预测、评价或 bootstrap |

## 执行与边界

- pre-execution exact HEAD：\`${result.preExecution.exactHead}\`；Linux/Windows：
  \`${result.preExecution.linuxCheck}\` / \`${result.preExecution.windowsCheck}\`；
- 完整主设计原始结果：未形成；冻结候选结果：不存在；
- occurrence 逐位一致性和 exact-case coverage：因没有 PSC02 prediction，未执行；
- 真实 outcome、LG01 成绩、候选 WAPE/FVA、五平台、机制、fallback、top cash works、
  统一总额渠道构成和 bootstrap：均未打开或计算；
- \`activeCandidate=null\`、\`approvedForAutomation=null\`、\`productionReady=false\`、
  \`finalHoldoutOpened=false\`。

公共 synthetic 只验证实现合同，不是 private 模型证据。后续若取得真实、可审计、带
component/revision/effectiveAt/availableAt 的权威输入，仍需独立授权与新的 exact-head
双平台 CI；本报告不授权重试、独立评价、later-origin、final holdout、production、
automation、release、数据库、API、provider 或财务使用。
`;
}

function renderDecision(result) {
  return `# M2 PSC02 实现与首次结果决策记录 v0.1

对象：出版行业渠道起点可见现金锚金额模型 v0.1
（Publishing-Scale Channel Origin-Visible Cash-Anchor Amount Model v0.1，
\`${result.modelId}\`；raw variant \`${result.rawCandidateId}\`）。

## 决策

1. 预注册核心已经实现并通过公共 synthetic/contract 验证；这只证明公式与失败关闭路径
   可执行，不是候选成绩。
2. 唯一受控开发重放在源权威门禁停止；没有完整主设计原始结果可冻结，也没有发生
   outcome-driven 调整或第二次科学运行。
3. 最终状态登记为开发不支持（\`${result.status}\`），原因类别固定为
   \`${result.decisionClass}\`；不得写成“模型 WAPE 失败”。
4. 冻结 PSC01、LG01、历史 receipt、digest、预测与评价均只读，未被覆盖、重命名或回填。
5. 模型保持 inactive：\`activeCandidate=null\`、\`approvedForAutomation=null\`、
   \`productionReady=false\`、\`finalHoldoutOpened=false\`。

未授权事项包括独立评价、later-origin、prospective final holdout、重试、taxonomy 入模、
production、automation、release、API、数据库、provider 和财务使用。
`;
}

async function closeReceipt(receiptPath, updates) {
  const current = JSON.parse(await readFile(receiptPath, "utf8"));
  const closed = {
    ...current,
    ...updates,
    closedAt: new Date().toISOString()
  };
  await writeFile(
    receiptPath,
    `${JSON.stringify(closed, null, 2)}\n`,
    "utf8"
  );
  return closed;
}

async function readContracts(root) {
  const paths = {
    implementation: IMPLEMENTATION_CONFIG,
    preregistration: PREREGISTRATION_CONFIG,
    anchorSchema: ANCHOR_SCHEMA,
    psc01Config: PSC01_CONFIG,
    supportContract: SUPPORT_CONFIG,
    evaluationContract: EVALUATION_CONFIG,
    businessAcceptanceContract: BUSINESS_CONFIG,
    implementationSource: IMPLEMENTATION_SOURCE
  };
  const entries = await Promise.all(Object.entries(paths).map(async ([key, file]) => [
    key,
    await readFile(path.join(root, file), "utf8")
  ]));
  const texts = Object.fromEntries(entries);
  return {
    implementation: JSON.parse(texts.implementation),
    preregistration: JSON.parse(texts.preregistration),
    anchorSchema: JSON.parse(texts.anchorSchema),
    psc01Config: JSON.parse(texts.psc01Config),
    supportContract: JSON.parse(texts.supportContract),
    evaluationContract: JSON.parse(texts.evaluationContract),
    businessAcceptanceContract: JSON.parse(texts.businessAcceptanceContract),
    texts
  };
}

function invokePython(root, argument) {
  const result = spawnSync(process.execPath, [
    "scripts/run-codex-python.mjs",
    MATERIALIZER,
    argument
  ], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error(
      `m2_psc02_python_precheck_failed:${String(result.stderr).trim()}`
    );
  }
  return JSON.parse(result.stdout.trim());
}

function assertMetadataPrecheck(result) {
  if (
    result?.modelId !== M2_PSC02_MODEL_ID
    || result?.candidateFitStarted !== false
    || result?.realPredictionGenerated !== false
    || result?.outerOutcomeOpened !== false
    || result?.candidateMetricsComputed !== false
    || result?.privateOutputWrites !== 0
    || result?.frozenPsc01?.completedFrozenReceiptCount !== 1
    || result?.frozenPsc01?.manifestValid !== true
  ) {
    throw new Error("m2_psc02_private_metadata_precheck_invalid");
  }
}

function resolvePrivateDirectory(root, relative) {
  if (path.isAbsolute(relative)) {
    throw new Error("m2_psc02_private_directory_absolute");
  }
  const resolved = path.resolve(root, relative);
  const local = path.relative(path.resolve(root), resolved).replaceAll("\\", "/");
  if (!local.startsWith("data/private-output/") || local.includes("../")) {
    throw new Error("m2_psc02_private_directory_escape");
  }
  return resolved;
}

function digest(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map(
      (key) => `${JSON.stringify(key)}:${stableJson(value[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}
