import crypto from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  evaluateCapability,
  loadCapabilityCatalog
} from "../check-development-capability.mjs";
import {
  assertM2Lg01HeadCashResidualPublicSafe,
  LG01_HEAD_CASH_RESIDUAL_ARM_IDS,
  LG01_HEAD_CASH_RESIDUAL_EXPERIMENT_ID,
  LG01_HEAD_CASH_RESIDUAL_MODEL_ID,
  runLg01HeadCashResidualExperiment,
  validateLg01HeadCashResidualContract
} from "../../src/domain/m2Current/lg01HeadCashResidual.js";
import {
  rebuildM2CoreHorizonAmountFrozenH3B3Inputs
} from "./core_legacy_horizon_amount_mode.mjs";
import {
  verifyM2Oa03GitAndCiPreflight
} from "./oa03_current_scope_replication_mode.mjs";

const CONFIG_PATH =
  "config/m2-current-lg01-head-cash-residual.v0.1.json";
const PREREGISTRATION_PATH =
  "docs/analysis/m2-current/"
    + "M2-lg01-head-cash-residual-preregistration-v0.1.md";
const K1_REPORT_PATH =
  "docs/analysis/m2-current/"
    + "M2-lg01-head-cash-residual-implementation-readiness-v0.1.md";
const CAPABILITY_ID = "m2-lg01-head-cash-residual";
const FINAL_STATUSES = Object.freeze([
  "M2_LG01_HEAD_CASH_RESIDUAL_CONFIRMED_DEVELOPMENT_PASS",
  "M2_LG01_HEAD_CASH_RESIDUAL_PROMISING_UNCONFIRMED",
  "M2_LG01_HEAD_CASH_RESIDUAL_FAIL",
  "M2_LG01_HEAD_CASH_RESIDUAL_BLOCKED_MISSING_PRIVATE_AUTHORITY",
  "M2_LG01_HEAD_CASH_RESIDUAL_INVALIDATED_CONTRACT_BREACH"
]);

export async function runM2Lg01HeadCashResidualPublicDiagnostic({
  root,
  verify = false
}) {
  const config = await readJson(path.join(root, CONFIG_PATH));
  const validation = validateLg01HeadCashResidualContract(config);
  if (!validation.valid) {
    throw new Error(validation.errors.join(","));
  }
  const [preregistration, k1Report, development] = await Promise.all([
    readFile(path.join(root, PREREGISTRATION_PATH), "utf8"),
    readTextIfPresent(path.join(root, K1_REPORT_PATH)),
    readJsonIfPresent(path.join(
      root,
      config.publicOutputs.developmentJson
    ))
  ]);
  assertPreregistration(preregistration);
  if (verify && k1Report === null) {
    throw new Error("hcrc_k1_implementation_readiness_report_missing");
  }
  if (k1Report !== null) assertK1Report(k1Report);
  if (development !== null) assertPublicDevelopment(development);
  const result = Object.freeze({
    schema: "m2.current.lg01_head_cash_residual.diagnostic.public.v0.1",
    experimentId: LG01_HEAD_CASH_RESIDUAL_EXPERIMENT_ID,
    modelId: LG01_HEAD_CASH_RESIDUAL_MODEL_ID,
    status: development?.status
      ?? (k1Report === null
        ? "M2_LG01_HEAD_CASH_RESIDUAL_PREREGISTERED_NOT_EXECUTED"
        : "M2_LG01_HEAD_CASH_RESIDUAL_IMPLEMENTED_SYNTHETIC_VERIFIED_OUTER_UNREAD"),
    preregistrationPresent: true,
    implementationReadinessPresent: k1Report !== null,
    firstCompletePrivateOutcomePresent: development !== null,
    activeCandidate: null,
    approvedForAutomation: null,
    productionChanged: false
  });
  assertM2Lg01HeadCashResidualPublicSafe(result);
  return result;
}

export async function runM2Lg01HeadCashResidualSyntheticSmoke({
  root
}) {
  const config = await readJson(path.join(root, CONFIG_PATH));
  const validation = validateLg01HeadCashResidualContract(config);
  if (!validation.valid) {
    throw new Error(validation.errors.join(","));
  }
  const rows = buildSyntheticRows();
  const temporaryDirectory = await mkdtemp(path.join(
    os.tmpdir(),
    "m2-hcrc-cache-smoke-"
  ));
  const cachePath = path.join(temporaryDirectory, "input.ndjson");
  let rebuildCount = 0;
  try {
    const first = await loadOrRebuildLg01HeadCashResidualInputCache({
      cachePath,
      rebuild: async () => {
        rebuildCount += 1;
        return { inputRows: rows };
      }
    });
    const second = await loadOrRebuildLg01HeadCashResidualInputCache({
      cachePath,
      rebuild: async () => {
        rebuildCount += 1;
        return { inputRows: [] };
      }
    });
    if (
      first.cacheStatus !== "CACHE_MISS_REBUILT"
      || second.cacheStatus !== "CACHE_HIT"
      || rebuildCount !== 1
      || sha256Json(first.inputRows) !== sha256Json(second.inputRows)
    ) {
      throw new Error("hcrc_synthetic_cache_rebuild_contract_failed");
    }
    const firstRun = runLg01HeadCashResidualExperiment(
      first.inputRows,
      config
    );
    const reverseRun = runLg01HeadCashResidualExperiment(
      [...first.inputRows].reverse(),
      config
    );
    const deterministicDigest = experimentDigest(firstRun);
    if (deterministicDigest !== experimentDigest(reverseRun)) {
      throw new Error("hcrc_synthetic_prediction_not_deterministic");
    }
    const targetOrigin = "2024-01";
    const perturbedRows = first.inputRows.map((row) => (
      row.origin === targetOrigin
        ? { ...row, actual: row.actual * 17 + 12345 }
        : row
    ));
    const perturbedRun = runLg01HeadCashResidualExperiment(
      perturbedRows,
      config
    );
    if (
      outerPredictionDigest(firstRun, targetOrigin)
        !== outerPredictionDigest(perturbedRun, targetOrigin)
      || outerSelectionDigest(firstRun, targetOrigin)
        !== outerSelectionDigest(perturbedRun, targetOrigin)
    ) {
      throw new Error("hcrc_synthetic_outer_outcome_leakage_detected");
    }
    const candidates = firstRun.predictions.filter(
      (row) => ["C2", "C3"].includes(row.armId)
    );
    if (
      candidates.length === 0
      || candidates.some((row) => (
        row.rawCandidatePreserved !== true
        || row.selectedFallbackCannotCreatePass !== true
        || (
          row.selectedStatus === "FALLBACK_TO_C0"
          && !Object.is(
            row.selectedPointEstimate,
            row.basePointEstimate
          )
        )
      ))
    ) {
      throw new Error("hcrc_synthetic_raw_selected_contract_failed");
    }
    const output = Object.freeze({
      schema:
        "m2.current.lg01_head_cash_residual.synthetic_smoke.public.v0.1",
      experimentId: LG01_HEAD_CASH_RESIDUAL_EXPERIMENT_ID,
      modelId: LG01_HEAD_CASH_RESIDUAL_MODEL_ID,
      status:
        "M2_LG01_HEAD_CASH_RESIDUAL_SYNTHETIC_VERIFIED_OUTER_UNREAD",
      inputCaseCount: rows.length,
      predictionCount: firstRun.predictions.length,
      selectionCount: firstRun.selections.length,
      armIds: LG01_HEAD_CASH_RESIDUAL_ARM_IDS,
      deterministic: true,
      outerOutcomeLeakageDetected: false,
      missingCacheAutomaticallyRebuilt: true,
      secondCacheReadWasHit: true,
      fixedWorkCountThresholdUsed: false,
      rawAndSelectedSeparated: true,
      privateSourceRead: false,
      productionChanged: false,
      activeCandidate: null,
      approvedForAutomation: null,
      deterministicDigest
    });
    assertM2Lg01HeadCashResidualPublicSafe(output);
    return output;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

export async function loadOrRebuildLg01HeadCashResidualInputCache({
  cachePath,
  rebuild,
  forceRebuild = false
}) {
  if (!forceRebuild && await fileExists(cachePath)) {
    const inputRows = await readNdjson(cachePath);
    if (inputRows.length === 0) {
      throw new Error("hcrc_input_cache_empty");
    }
    return Object.freeze({
      cacheStatus: "CACHE_HIT",
      inputRows: Object.freeze(inputRows),
      rebuildEvidence: null
    });
  }
  const rebuilt = await rebuild();
  if (
    !rebuilt
    || !Array.isArray(rebuilt.inputRows)
    || rebuilt.inputRows.length === 0
  ) {
    throw new Error("hcrc_input_cache_rebuild_empty");
  }
  await writeNdjsonAtomic(cachePath, rebuilt.inputRows);
  return Object.freeze({
    cacheStatus: "CACHE_MISS_REBUILT",
    inputRows: Object.freeze(rebuilt.inputRows),
    rebuildEvidence: rebuilt
  });
}

export async function runM2Lg01HeadCashResidualPrivateDevelopment({
  root
}) {
  const config = await readJson(path.join(root, CONFIG_PATH));
  const validation = validateLg01HeadCashResidualContract(config);
  if (!validation.valid) {
    throw new Error(validation.errors.join(","));
  }
  const preflight = verifyM2Oa03GitAndCiPreflight({
    root,
    allowedDirtyPaths: []
  });
  const inventoryBefore = capabilityInventory(root);
  if (
    inventoryBefore.sourceAuthorityStatus
      !== "SOURCE_AUTHORITY_AVAILABLE"
    || inventoryBefore.unavailableTools.length > 0
  ) {
    throw new Error(
      inventoryBefore.sourceAuthorityStatus
        !== "SOURCE_AUTHORITY_AVAILABLE"
        ? "hcrc_source_authority_blocked"
        : "hcrc_required_tool_blocked"
    );
  }
  const privateDirectory = resolvePrivateDirectory(
    root,
    config.privateOutputs.directory
  );
  await mkdir(privateDirectory, { recursive: true });
  const receiptPath = path.join(
    privateDirectory,
    config.privateOutputs.attemptReceipt
  );
  const priorReceipt = await readJsonIfPresent(receiptPath);
  if (
    priorReceipt?.completeMetricsProduced === true
    || priorReceipt?.validCompleteInterpretableResultProduced === true
    || [
      "FIRST_VALID_COMPLETE_OUTCOME_BOUNDARY_REACHED",
      "COMPLETE_RESULT_FROZEN"
    ].includes(priorReceipt?.status)
  ) {
    throw new Error("hcrc_complete_result_already_frozen");
  }
  if (priorReceipt !== null) {
    await archivePriorReceipt({
      privateDirectory,
      config,
      priorReceipt,
      receiptPath
    });
  }
  const attempt = {
    schema:
      "m2.current.lg01_head_cash_residual.attempt_receipt.private.v0.1",
    attemptId: crypto.randomUUID(),
    experimentId: LG01_HEAD_CASH_RESIDUAL_EXPERIMENT_ID,
    modelId: LG01_HEAD_CASH_RESIDUAL_MODEL_ID,
    capabilityId: CAPABILITY_ID,
    status: "EXECUTION_STARTED",
    stage: "EXACT_HEAD_PREFLIGHT_COMPLETE",
    executionHead: preflight.head,
    exactHeadCiRunId: preflight.ciRunId,
    sourceAuthorityStatus: inventoryBefore.sourceAuthorityStatus,
    derivedCacheStatusBefore: inventoryBefore.derivedCacheStatus,
    historicalReceiptStatusBefore:
      inventoryBefore.historicalReceiptStatus,
    completeMetricsProduced: false,
    validCompleteInterpretableResultProduced: false,
    scientificContractChanged: false,
    outerOutcomeInspectedBeforeCompleteBoundary: false,
    retryAllowed: true
  };
  await writeJsonAtomic(receiptPath, attempt);
  let stage = "FROZEN_INPUT_CACHE_RECONSTRUCTION";
  let completeMetricsProduced = false;
  try {
    const inputCachePath = path.join(
      privateDirectory,
      config.privateOutputs.inputRows
    );
    const cached = await loadOrRebuildLg01HeadCashResidualInputCache({
      cachePath: inputCachePath,
      forceRebuild: true,
      rebuild: async () => (
        await rebuildM2CoreHorizonAmountFrozenH3B3Inputs({ root })
      )
    });
    const reconstruction = cached.rebuildEvidence;
    if (reconstruction?.reconciliation?.exact !== true) {
      throw new Error("hcrc_frozen_input_reconciliation_not_exact");
    }
    stage = "SINGLE_PRIVATE_DEVELOPMENT_EVALUATION";
    await writeJsonAtomic(receiptPath, {
      ...attempt,
      status: "EXECUTION_IN_PROGRESS",
      stage,
      inputCaseCount: cached.inputRows.length,
      cacheStatus: cached.cacheStatus
    });
    const outcome = runLg01HeadCashResidualExperiment(
      cached.inputRows,
      config
    );
    completeMetricsProduced = true;
    const outcomeDigest = experimentDigest(outcome);
    stage = "FIRST_VALID_COMPLETE_OUTCOME_BOUNDARY";
    await writeJsonAtomic(receiptPath, {
      ...attempt,
      status: "FIRST_VALID_COMPLETE_OUTCOME_BOUNDARY_REACHED",
      stage,
      inputCaseCount: cached.inputRows.length,
      predictionRowsProduced: outcome.predictions.length,
      selectionRowsProduced: outcome.selections.length,
      evaluationCellsProduced: outcome.evaluation.cells.length,
      completeMetricsProduced: true,
      validCompleteInterpretableResultProduced: true,
      scientificWindowConsumed: true,
      resultStatus: outcome.evaluation.decision.status,
      outcomeDigest,
      retryAllowed: false
    });
    stage = "PRIVATE_OUTPUT_FREEZE";
    const privatePaths = privateOutputPaths(privateDirectory, config);
    await Promise.all([
      writeNdjsonAtomic(privatePaths.predictions, outcome.predictions),
      writeNdjsonAtomic(privatePaths.selections, outcome.selections),
      writeNdjsonAtomic(
        privatePaths.evaluation,
        outcome.evaluation.cells
      ),
      writeNdjsonAtomic(
        privatePaths.bootstrap,
        buildBootstrapRows(outcome.evaluation.cells)
      )
    ]);
    const manifest = await buildManifest({
      preflight,
      inputCachePath,
      privatePaths,
      outcome,
      reconstruction
    });
    await writeJsonAtomic(privatePaths.manifest, manifest);
    const development = buildPublicDevelopment({
      preflight,
      inventoryBefore,
      cached,
      reconstruction,
      outcome,
      manifest
    });
    assertPublicDevelopment(development);
    await Promise.all([
      writeJsonAtomic(
        path.join(root, config.publicOutputs.developmentJson),
        development
      ),
      writeFileAtomic(
        path.join(root, config.publicOutputs.developmentReport),
        renderDevelopmentReport(development)
      )
    ]);
    stage = "COMPLETE_RESULT_FROZEN";
    await writeJsonAtomic(receiptPath, {
      ...attempt,
      status: "COMPLETE_RESULT_FROZEN",
      stage,
      inputCaseCount: cached.inputRows.length,
      predictionRowsProduced: outcome.predictions.length,
      selectionRowsProduced: outcome.selections.length,
      evaluationCellsProduced: outcome.evaluation.cells.length,
      completeMetricsProduced: true,
      validCompleteInterpretableResultProduced: true,
      scientificWindowConsumed: true,
      resultStatus: development.status,
      outcomeDigest,
      publicResultDigest: sha256Json(development),
      retryAllowed: false
    });
    return Object.freeze({
      status: development.status,
      executionHead: preflight.head,
      exactHeadCiRunId: preflight.ciRunId,
      inputCaseCount: cached.inputRows.length,
      predictionRowsProduced: outcome.predictions.length,
      selectionRowsProduced: outcome.selections.length,
      evaluationCellsProduced: outcome.evaluation.cells.length,
      frozenInputAggregateReconciliation:
        reconstruction.reconciliation.status,
      completeResultFrozen: true,
      secondEvaluationAuthorized: false,
      activeCandidate: null,
      approvedForAutomation: null
    });
  } catch (error) {
    await writeJsonAtomic(receiptPath, {
      ...attempt,
      status: completeMetricsProduced
        ? "POST_OUTCOME_INFRASTRUCTURE_FAILURE_RESULT_REMAINS_FROZEN"
        : "PRE_OUTCOME_INFRASTRUCTURE_FAILURE_RETRY_ALLOWED",
      stage,
      completeMetricsProduced,
      validCompleteInterpretableResultProduced: completeMetricsProduced,
      scientificWindowConsumed: completeMetricsProduced,
      failureName: error?.name ?? "Error",
      failureMessage: String(error?.message ?? error),
      retryAllowed: !completeMetricsProduced
    });
    throw error;
  }
}

function buildPublicDevelopment({
  preflight,
  inventoryBefore,
  cached,
  reconstruction,
  outcome,
  manifest
}) {
  const result = {
    schema:
      "m2.current.lg01_head_cash_residual.development.public.v0.1",
    asOf: "2026-07-30",
    experimentId: LG01_HEAD_CASH_RESIDUAL_EXPERIMENT_ID,
    modelId: LG01_HEAD_CASH_RESIDUAL_MODEL_ID,
    displayNameZh: "LG01 头部现金残差校准模型 v0.1",
    displayNameEn: "LG01 Head-Cash Residual Calibration Model v0.1",
    status: outcome.evaluation.decision.status,
    evidenceClassification:
      "EXPLORATORY_DEVELOPMENT_EVIDENCE_NOT_INDEPENDENT_CONFIRMATION",
    executionEvidence: {
      executionHead: preflight.head,
      exactHeadCiRunId: preflight.ciRunId,
      linux: preflight.linux,
      windows: preflight.windows,
      draftPrNumber: preflight.prNumber,
      draftPrUrl: preflight.prUrl
    },
    sourceAndCache: {
      sourceAuthorityStatus: inventoryBefore.sourceAuthorityStatus,
      derivedCacheStatusBefore: inventoryBefore.derivedCacheStatus,
      historicalReceiptStatusBefore:
        inventoryBefore.historicalReceiptStatus,
      inputCacheStatus: cached.cacheStatus,
      frozenInputReconciliation:
        reconstruction.reconciliation,
      sourceAuthorityRowCount:
        reconstruction.sourceAuthority.rowCount,
      sourceAuthorityWorkCount:
        reconstruction.sourceAuthority.workCount,
      privateInputRowCount: cached.inputRows.length,
      privatePredictionRowCount: outcome.predictions.length,
      privateSelectionRowCount: outcome.selections.length,
      privateManifestEntryCount: manifest.files.length,
      privateRowsPublished: false
    },
    arms: [
      {
        armId: "C0",
        displayNameZh: "冻结 LG01 三个月同案例基线",
        displayNameEn: "Frozen LG01 Three-Month Same-Case Baseline",
        role: "FROZEN_RESEARCH_BASELINE"
      },
      {
        armId: "C1",
        displayNameZh: "冻结 CHAM01 B3 三个月原始诊断参考",
        displayNameEn:
          "Frozen CHAM01 B3 Three-Month Raw Diagnostic Reference",
        role: "FROZEN_DIAGNOSTIC_REFERENCE"
      },
      {
        armId: "C2",
        displayNameZh: "全局有界残差混合",
        displayNameEn: "Global Bounded Residual Blend",
        role: "RAW_EXPLORATORY_CANDIDATE"
      },
      {
        armId: "C3",
        displayNameZh: "头部现金带保护的有界残差混合",
        displayNameEn:
          "Head-Cash-Band Protected Bounded Residual Blend",
        role: "RAW_EXPLORATORY_CANDIDATE"
      }
    ],
    evaluation: outcome.evaluation,
    selectionSummary: summarizeSelections(outcome.selections),
    roles: {
      operationalFallback: "M2-WORK-OA03",
      operationalFallbackChanged: false,
      activeCandidate: null,
      approvedForAutomation: null
    },
    boundaries: {
      threeMonthWorkTotalOnly: true,
      sixMonthExecuted: false,
      twelveMonthExecuted: false,
      thirtySixMonthExecuted: false,
      newWorkExecuted: false,
      futureFirstChannelExecuted: false,
      channelAllocationExecuted: false,
      taxonomyExecuted: false,
      productionChanged: false,
      providerUsed: false,
      databaseUsed: false,
      laterOriginOpened: false,
      finalHoldoutOpened: false,
      canaryOrFull160Executed: false,
      releaseAuthorized: false,
      m3FormalExecuted: false,
      pullRequestMergeAuthorized: false,
      completeResultFrozen: true,
      secondEvaluationAuthorized: false
    }
  };
  assertM2Lg01HeadCashResidualPublicSafe(result);
  return Object.freeze(result);
}

function summarizeSelections(selections) {
  const global = new Map();
  const bands = new Map();
  for (const selection of selections) {
    const globalKey = selection.global.selectedAlpha === null
      ? selection.global.status
      : String(selection.global.selectedAlpha);
    global.set(globalKey, (global.get(globalKey) ?? 0) + 1);
    for (const bandId of ["H50", "M30", "L20"]) {
      const value = selection.bands[bandId];
      const bandKey = [
        bandId,
        value.effectiveAlpha === null
          ? value.status
          : String(value.effectiveAlpha)
      ].join(":");
      bands.set(bandKey, (bands.get(bandKey) ?? 0) + 1);
    }
  }
  return {
    outerSelectionCount: selections.length,
    globalAlphaCounts: countMap(global),
    bandEffectiveAlphaCounts: countMap(bands),
    outerOutcomeUsedForSelection: false,
    fixedWorkCountThresholdUsed: false
  };
}

function renderDevelopmentReport(value) {
  const selectedArm = value.evaluation.decision.selectedRawArmId;
  const primary = findCell(
    value,
    "STRICT_ROLLING",
    "CORE80",
    selectedArm
  )?.raw;
  const sensitivity = findCell(
    value,
    "STRICT_ROLLING",
    "CORE90",
    selectedArm
  )?.raw;
  const primaryDiagnostic = findCell(
    value,
    "PRIMARY_ROLLING",
    "CORE90",
    selectedArm
  )?.raw;
  const signal = Number.isFinite(primary?.pairedFvaVsC0)
    && primary.pairedFvaVsC0 >= 0.01;
  const headProtected = Number.isFinite(
    primary?.cashBands?.H50?.relativeAbsoluteErrorImprovementVsC0
  ) && (
    primary.cashBands.H50.relativeAbsoluteErrorImprovementVsC0 >= 0.01
  );
  const biasEliminated = (
    Number.isFinite(primary?.signedBias)
    && Number.isFinite(primary?.baseOnSameCases?.signedBias)
    && primary.signedBias >= 0
  );
  const primaryStable =
    primaryDiagnostic?.numericStabilityStatus
      === "NUMERIC_STABILITY_PASS";
  const nextStep = value.status ===
    "M2_LG01_HEAD_CASH_RESIDUAL_FAIL"
    ? "停止在同一现金特征和同一评价窗内继续做残差微调。"
    : "仅建议另行预注册独立 later-origin 验证；本轮不执行。";
  const lines = [
    "# M2 LG01 头部现金残差校准开发评价 v0.1",
    "",
    "LG01 头部现金残差校准模型 v0.1（LG01 Head-Cash Residual "
      + `Calibration Model v0.1，\`${value.modelId}\`）最终机器状态为`
      + ` \`${value.status}\`。这是阅读既有 CHAM01 结果后形成的探索性开发`
      + "证据，不是独立确认，不改变现行运行回退。",
    "",
    "## 一页结论",
    "",
    `1. 三个月小幅信号：${signal ? "仍存在" : "未达到 1% 门槛"}；`
      + `主候选原始配对 FVA 为 ${percent(primary?.pairedFvaVsC0)}。`,
    `2. H50 头部现金：${headProtected ? "达到保护门禁" : "未达到保护门禁"}；`
      + `绝对误差相对 LG01 变化为 ${percent(
        primary?.cashBands?.H50?.relativeAbsoluteErrorImprovementVsC0
      )}。`,
    `3. 系统性低估：${biasEliminated ? "已消除" : "未被证明消除"}；`
      + `候选 signed bias 为 ${metric(primary?.signedBias)}，`
      + `同案例 LG01 为 ${metric(primary?.baseOnSameCases?.signedBias)}。`,
    `4. Primary/Core90 极端外推：${primaryStable
      ? "未复现，数值稳定性通过"
      : "未彻底避免或证据不足"}。`,
    `5. 证据等级：${statusZh(value.status)}（\`${value.status}\`）。`,
    `6. 下一步：${nextStep}`,
    "",
    "## 实验臂",
    "",
    "| 实验臂（experiment arm） | 中文名称 | 作用 |",
    "|---|---|---|",
    ...value.arms.map((arm) => (
      `| ${arm.armId} | ${arm.displayNameZh}`
      + `（${arm.displayNameEn}） | ${roleZh(arm.role)} |`
    )),
    "",
    "## Strict Core80 三个月主评价",
    "",
    "| 实验臂 | 结果版本 | cases | WAPE | signed bias | MAE | "
      + "median AE | 配对 FVA | bootstrap 95% | time-block 改善 | "
      + "数值状态 |",
    "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|",
    ...evaluationRows(value, "STRICT_ROLLING", "CORE80"),
    "",
    "## Strict Core90 三个月敏感性",
    "",
    "| 实验臂 | 结果版本 | cases | WAPE | signed bias | 配对 FVA | "
      + "fallback | 非有限/稳定性失败 | 数值状态 |",
    "|---|---|---:|---:|---:|---:|---:|---:|---|",
    ...sensitivityRows(value),
    "",
    "## 起点可见现金带",
    "",
    "| 现金带 | cases / works | 起点现金覆盖 | WAPE | signed bias | "
      + "绝对误差 | 相对 LG01 改善 | 隐私状态 |",
    "|---|---:|---:|---:|---:|---:|---:|---|",
    ...bandRows(primary),
    "",
    "## 关键护栏",
    "",
    `- 作品聚类 bootstrap（2,000 次）：[${percent(
      primary?.bootstrap?.lower
    )}, ${percent(primary?.bootstrap?.upper)}]。`,
    `- 独立时间块：${primary?.independentTimeBlocks?.wins ?? 0} 胜 / `
      + `${primary?.independentTimeBlocks?.lossesOrTies ?? 0} 负或平，`
      + `改善占比 ${percent(
        primary?.independentTimeBlocks?.improvingShare
      )}。`,
    `- 最大单作品误差占比：候选 ${percent(
      primary?.errorConcentration?.maximumSingleWorkAbsoluteErrorShare
    )}，LG01 ${percent(
      primary?.baseOnSameCases?.errorConcentration
        ?.maximumSingleWorkAbsoluteErrorShare
    )}。`,
    `- top 10 作品误差集中度：候选 ${percent(
      primary?.errorConcentration?.top10WorkAbsoluteErrorShare
    )}，LG01 ${percent(
      primary?.baseOnSameCases?.errorConcentration
        ?.top10WorkAbsoluteErrorShare
    )}。`,
    `- Core90 配对 FVA：${percent(sensitivity?.pairedFvaVsC0)}；`
      + `Primary/Core90 比较状态保持 \`NOT_COMPARABLE\`，没有补造 FVA。`,
    "",
    "## 原始候选与回退后结果",
    "",
    "原始候选（raw candidate）决定是否通过；回退后结果（selected "
      + "pipeline）只说明运行时如何回到冻结 LG01。任何回退都不能覆盖原始"
      + "数值失败，也不能创造通过。上表分别列出 raw 与 selected，二者未混合。",
    "",
    "## 私有能力与边界",
    "",
    `- 权威源：\`${value.sourceAndCache.sourceAuthorityStatus}\`；`
      + `派生缓存起始状态：\`${value.sourceAndCache.derivedCacheStatusBefore}\`；`
      + `历史收据状态：\`${value.sourceAndCache.historicalReceiptStatusBefore}\`。`,
    `- 冻结输入缓存：\`${value.sourceAndCache.inputCacheStatus}\`；`
      + `冻结 B3 三个月公开聚合核对：`
      + `\`${value.sourceAndCache.frozenInputReconciliation.status}\`。`,
    "- 行级作品、actual、预测、选择、bootstrap 和运行收据只写入 Git ignored "
      + "capability 目录；公开报告只含达到合同要求的聚合。",
    "- 未执行 6/12/36 个月新候选、新作品、未来首次渠道、渠道分配、taxonomy、"
      + "production、provider、数据库、later-origin、final holdout、"
      + "Canary/full160、release、M3 formal 或 PR 合并。",
    ""
  ];
  return `${lines.join("\n")}\n`;
}

function evaluationRows(value, family, populationId) {
  return value.evaluation.cells.filter((cell) => (
    cell.evaluationFamily === family
    && cell.populationId === populationId
  )).flatMap((cell) => ["raw", "selected"].map((variant) => {
    const row = cell[variant];
    return `| ${cell.armId} | ${variantZh(variant)} | ${row.caseCount}`
      + ` | ${metric(row.wape)} | ${metric(row.signedBias)}`
      + ` | ${metric(row.mae)} | ${metric(row.medianAbsoluteError)}`
      + ` | ${percent(row.pairedFvaVsC0)}`
      + ` | [${percent(row.bootstrap?.lower)}, `
      + `${percent(row.bootstrap?.upper)}]`
      + ` | ${percent(row.independentTimeBlocks?.improvingShare)}`
      + ` | ${row.numericStabilityStatus} |`;
  }));
}

function sensitivityRows(value) {
  return value.evaluation.cells.filter((cell) => (
    cell.evaluationFamily === "STRICT_ROLLING"
    && cell.populationId === "CORE90"
  )).flatMap((cell) => ["raw", "selected"].map((variant) => {
    const row = cell[variant];
    return `| ${cell.armId} | ${variantZh(variant)} | ${row.caseCount}`
      + ` | ${metric(row.wape)} | ${metric(row.signedBias)}`
      + ` | ${percent(row.pairedFvaVsC0)} | ${row.fallbackCount}`
      + ` | ${row.nonfiniteCount}/${row.numericFailureCount}`
      + ` | ${row.numericStabilityStatus} |`;
  }));
}

function bandRows(primary) {
  return ["H50", "M30", "L20"].map((bandId) => {
    const row = primary?.cashBands?.[bandId] ?? {};
    return `| ${bandId} | ${row.caseCount ?? 0} / ${row.workCount ?? 0}`
      + ` | ${percent(row.originVisibleCashShare)}`
      + ` | ${metric(row.wape)} | ${metric(row.signedBias)}`
      + ` | ${metric(row.absoluteError)}`
      + ` | ${percent(row.relativeAbsoluteErrorImprovementVsC0)}`
      + ` | ${row.privacyStatus ?? "NOT_AVAILABLE"} |`;
  });
}

function buildSyntheticRows() {
  const origins = [
    "2022-01",
    "2022-04",
    "2022-07",
    "2022-10",
    "2023-01",
    "2023-04",
    "2023-07",
    "2023-10",
    "2024-01"
  ];
  const rows = [];
  for (const family of ["PRIMARY_ROLLING", "STRICT_ROLLING"]) {
    for (let originIndex = 0; originIndex < origins.length; originIndex += 1) {
      const origin = origins[originIndex];
      for (let workIndex = 0; workIndex < 18; workIndex += 1) {
        const base = 8000 + (18 - workIndex) * 650 + originIndex * 110;
        const pattern = ((workIndex * 7 + originIndex * 3) % 9) - 4;
        const actual = base * (1 + pattern * 0.012);
        const raw = base + (actual - base) * 0.82
          + ((workIndex + originIndex) % 3 - 1) * 15;
        for (const populationId of (
          workIndex < 12 ? ["CORE80", "CORE90"] : ["CORE90"]
        )) {
          rows.push({
            evaluationFamily: family,
            populationId,
            standardWorkId: `SYNTH-WORK-${String(
              workIndex + 1
            ).padStart(3, "0")}`,
            origin,
            horizonMonths: 3,
            actual,
            basePointEstimate: base,
            rawPointEstimate: raw,
            trailing12Cash: (18 - workIndex) ** 2 * 1000
              + originIndex,
            labelAvailableAsOf: addMonths(origin, 3),
            originVisibleOnly: true
          });
        }
      }
    }
  }
  return rows;
}

function experimentDigest(outcome) {
  return sha256Json({
    predictions: outcome.predictions,
    selections: outcome.selections,
    evaluation: outcome.evaluation
  });
}

function outerPredictionDigest(outcome, origin) {
  return sha256Json(outcome.predictions.filter(
    (row) => row.origin === origin
  ).map((row) => ({
    armId: row.armId,
    evaluationFamily: row.evaluationFamily,
    populationId: row.populationId,
    standardWorkId: row.standardWorkId,
    rawPointEstimate: row.rawPointEstimate,
    selectedPointEstimate: row.selectedPointEstimate,
    alpha: row.alpha,
    cashBandId: row.cashBandId,
    rawNumericStatus: row.rawNumericStatus,
    selectedStatus: row.selectedStatus
  })));
}

function outerSelectionDigest(outcome, origin) {
  return sha256Json(outcome.selections.filter(
    (row) => row.outerOrigin === origin
  ));
}

function buildBootstrapRows(cells) {
  return cells.flatMap((cell) => ["raw", "selected"].map((variant) => ({
    schema:
      "m2.current.lg01_head_cash_residual.bootstrap.private.v0.1",
    experimentId: LG01_HEAD_CASH_RESIDUAL_EXPERIMENT_ID,
    evaluationFamily: cell.evaluationFamily,
    populationId: cell.populationId,
    horizonMonths: cell.horizonMonths,
    armId: cell.armId,
    variant: variant.toUpperCase(),
    bootstrap: cell[variant].bootstrap
  })));
}

async function buildManifest({
  preflight,
  inputCachePath,
  privatePaths,
  outcome,
  reconstruction
}) {
  const files = [];
  for (const [role, filePath] of Object.entries({
    inputRows: inputCachePath,
    predictions: privatePaths.predictions,
    selections: privatePaths.selections,
    evaluation: privatePaths.evaluation,
    bootstrap: privatePaths.bootstrap
  })) {
    const details = await stat(filePath);
    files.push({
      role,
      byteCount: details.size,
      sha256: await sha256File(filePath)
    });
  }
  return {
    schema:
      "m2.current.lg01_head_cash_residual.manifest.private.v0.1",
    experimentId: LG01_HEAD_CASH_RESIDUAL_EXPERIMENT_ID,
    modelId: LG01_HEAD_CASH_RESIDUAL_MODEL_ID,
    executionHead: preflight.head,
    exactHeadCiRunId: preflight.ciRunId,
    resultStatus: outcome.evaluation.decision.status,
    completeResultFrozen: true,
    secondEvaluationAuthorized: false,
    frozenInputReconciliation:
      reconstruction.reconciliation.status,
    files
  };
}

function privateOutputPaths(privateDirectory, config) {
  return Object.freeze({
    predictions: path.join(
      privateDirectory,
      config.privateOutputs.predictionRows
    ),
    selections: path.join(
      privateDirectory,
      config.privateOutputs.selectionRows
    ),
    evaluation: path.join(
      privateDirectory,
      config.privateOutputs.evaluationRows
    ),
    bootstrap: path.join(
      privateDirectory,
      config.privateOutputs.bootstrapRows
    ),
    manifest: path.join(
      privateDirectory,
      config.privateOutputs.manifest
    )
  });
}

async function archivePriorReceipt({
  privateDirectory,
  config,
  priorReceipt,
  receiptPath
}) {
  const attempts = path.join(
    privateDirectory,
    config.privateOutputs.attemptDirectory
  );
  await mkdir(attempts, { recursive: true });
  const id = String(
    priorReceipt.attemptId ?? crypto.randomUUID()
  ).replaceAll(/[^a-zA-Z0-9_-]/gu, "_");
  await rename(receiptPath, path.join(
    attempts,
    `attempt-${id}.json`
  ));
}

function capabilityInventory(root) {
  const catalog = loadCapabilityCatalog(path.join(
    root,
    "config/development-capability-catalog.v0.1.json"
  ));
  return evaluateCapability(catalog, CAPABILITY_ID, { repoRoot: root });
}

function resolvePrivateDirectory(root, relativePath) {
  if (
    path.isAbsolute(relativePath)
    || !relativePath.replaceAll("\\", "/")
      .startsWith("data/private-output/")
  ) {
    throw new Error("hcrc_private_directory_invalid");
  }
  const directory = path.resolve(root, relativePath);
  const privateRoot = path.resolve(root, "data/private-output");
  if (!directory.startsWith(`${privateRoot}${path.sep}`)) {
    throw new Error("hcrc_private_directory_outside_capability_root");
  }
  return directory;
}

function assertPreregistration(value) {
  for (const marker of [
    "M2-WORK-HCRC01",
    "M2-EXP-LG01-HEAD-CASH-RESIDUAL-01",
    "q05",
    "q95",
    "0.25",
    "0.50",
    "0.75",
    "1.00"
  ]) {
    if (!value.includes(marker)) {
      throw new Error("hcrc_preregistration_marker_missing");
    }
  }
}

function assertK1Report(value) {
  for (const marker of [
    "M2-WORK-HCRC01",
    "OUTER_OUTCOME_UNREAD",
    "CACHE_MISS_REBUILDABLE",
    "synthetic"
  ]) {
    if (!value.includes(marker)) {
      throw new Error("hcrc_k1_report_marker_missing");
    }
  }
}

function assertPublicDevelopment(value) {
  if (
    value?.schema
      !== "m2.current.lg01_head_cash_residual.development.public.v0.1"
    || !FINAL_STATUSES.includes(value.status)
    || value.modelId !== LG01_HEAD_CASH_RESIDUAL_MODEL_ID
    || value.experimentId !== LG01_HEAD_CASH_RESIDUAL_EXPERIMENT_ID
    || value.roles?.activeCandidate !== null
    || value.roles?.approvedForAutomation !== null
    || value.boundaries?.productionChanged !== false
    || value.boundaries?.completeResultFrozen !== true
    || value.boundaries?.secondEvaluationAuthorized !== false
  ) {
    throw new Error("hcrc_public_development_invalid");
  }
  assertM2Lg01HeadCashResidualPublicSafe(value);
}

function findCell(value, family, populationId, armId) {
  return value.evaluation.cells.find((cell) => (
    cell.evaluationFamily === family
    && cell.populationId === populationId
    && cell.armId === armId
  )) ?? null;
}

function countMap(value) {
  return [...value.entries()].sort(([left], [right]) => (
    left.localeCompare(right)
  )).map(([key, count]) => ({ key, count }));
}

function addMonths(month, delta) {
  const [year, value] = month.split("-").map(Number);
  const serial = year * 12 + value - 1 + delta;
  return `${Math.floor(serial / 12)}-${String(
    serial % 12 + 1
  ).padStart(2, "0")}`;
}

function statusZh(status) {
  return new Map([
    [
      "M2_LG01_HEAD_CASH_RESIDUAL_CONFIRMED_DEVELOPMENT_PASS",
      "确认级开发通过"
    ],
    [
      "M2_LG01_HEAD_CASH_RESIDUAL_PROMISING_UNCONFIRMED",
      "有希望但未确认"
    ],
    ["M2_LG01_HEAD_CASH_RESIDUAL_FAIL", "开发失败"],
    [
      "M2_LG01_HEAD_CASH_RESIDUAL_BLOCKED_MISSING_PRIVATE_AUTHORITY",
      "缺少不可替代私有权威源而阻断"
    ],
    [
      "M2_LG01_HEAD_CASH_RESIDUAL_INVALIDATED_CONTRACT_BREACH",
      "科学合同违约而失效"
    ]
  ]).get(status) ?? status;
}

function roleZh(role) {
  return new Map([
    ["FROZEN_RESEARCH_BASELINE", "冻结研究比较基线"],
    ["FROZEN_DIAGNOSTIC_REFERENCE", "冻结诊断参考"],
    ["RAW_EXPLORATORY_CANDIDATE", "原始探索性候选"]
  ]).get(role) ?? role;
}

function variantZh(variant) {
  return variant === "raw"
    ? "原始候选（raw）"
    : "回退后管线（selected）";
}

function metric(value) {
  return Number.isFinite(value) ? Number(value).toPrecision(6) : "—";
}

function percent(value) {
  return Number.isFinite(value)
    ? `${(Number(value) * 100).toFixed(2)}%`
    : "—";
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readJsonIfPresent(filePath) {
  try {
    return await readJson(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function readTextIfPresent(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function readNdjson(filePath) {
  const value = await readFile(filePath, "utf8");
  return value.split(/\r?\n/u).filter(Boolean).map(JSON.parse);
}

async function writeNdjsonAtomic(filePath, rows) {
  await writeFileAtomic(
    filePath,
    rows.map((row) => JSON.stringify(row)).join("\n") + "\n"
  );
}

async function writeJsonAtomic(filePath, value) {
  await writeFileAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeFileAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporary, value, "utf8");
  await rename(temporary, filePath);
}

async function fileExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function sha256File(filePath) {
  return crypto.createHash("sha256")
    .update(await readFile(filePath))
    .digest("hex");
}

function sha256Json(value) {
  return crypto.createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}
