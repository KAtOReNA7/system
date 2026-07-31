import crypto from "node:crypto";
import fs from "node:fs";
import {
  mkdir,
  readFile,
  rename,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

import {
  evaluateHpsrRetrospectiveDevelopment,
  planHpsrRetrospectiveOrigins,
  runHeadProtectedSegmentedRouter,
  assertHpsrRetrospectiveExecutionGate
} from "../../src/domain/m2Current/headProtectedSegmentedRouter.js";
import {
  fitM2CoreHorizonAmountModel,
  predictM2CoreHorizonAmount,
  validateM2CoreLegacyHorizonAmountConfig
} from "../../src/domain/m2Current/coreLegacyHorizonAmount.js";
import {
  evaluateCapability,
  loadCapabilityCatalog
} from "../check-development-capability.mjs";
import {
  materializeM2HpsrFrozenFormulaFeatureRows
} from "./core_legacy_horizon_amount_mode.mjs";
import {
  verifyM2Oa03GitAndCiPreflight
} from "./oa03_current_scope_replication_mode.mjs";

const CAPABILITY_ID = "m2-head-protected-segmented-router";
const CORE_AMOUNT_CONFIG =
  "config/m2-current-core-legacy-horizon-amount.v0.1.json";

export async function runHpsrRetrospectivePrivate({
  root,
  contract,
  availability
}) {
  const inventory = evaluateCapability(
    loadCapabilityCatalog(path.join(
      root,
      "config",
      "development-capability-catalog.v0.1.json"
    )),
    CAPABILITY_ID,
    { repoRoot: root }
  );
  if (
    inventory.sourceAuthorityStatus !== "SOURCE_AUTHORITY_AVAILABLE"
    || inventory.unavailableTools.length > 0
  ) {
    throw new Error(
      inventory.sourceAuthorityStatus !== "SOURCE_AUTHORITY_AVAILABLE"
        ? "hpsr_retrospective_missing_source_authority"
        : "hpsr_retrospective_required_tool_unavailable"
    );
  }
  const openedSemantics = await readJson(path.join(
    root,
    contract.privateCapability.openedOriginSemanticsArtifact
  ));
  const profile = openedSemantics.historicalCacheProfiles.find(
    (item) => item.role === "frozen-development-feature-rows"
  );
  if (!profile) {
    throw new Error("hpsr_retrospective_opened_profile_missing");
  }
  const retrospectivePlan = planHpsrRetrospectiveOrigins({
    residualBoundDerivationThrough:
      contract.residualBoundaryFreeze.sourceOriginRange.through,
    firstIndependentLaterOrigin:
      openedSemantics.prospectiveReservation
        .firstIndependentLaterOrigin,
    completeAuthoritativeBillMonthThrough:
      openedSemantics.billMonthAvailability
        .completeAuthoritativeBillMonthThrough,
    openedOriginProfiles: profile.origins,
    isolatedOrigins: contract.finalHoldout.historicalThreeMonthOrigins,
    horizonMonths: 3
  });
  assertHpsrRetrospectiveExecutionGate({
    contract,
    retrospectivePlan
  });
  const independentK2Ready = (
    openedSemantics.prospectiveReservation
      .firstIndependentLaterOriginReady === true
    && availability.candidateInventory
      ?.earliestIndependentLaterOriginReady === true
  );
  const preflight = verifyM2Oa03GitAndCiPreflight({
    root,
    allowedDirtyPaths: []
  });
  const privateDirectory = path.dirname(path.join(
    root,
    contract.privateCapability.retrospectiveReceipt
  ));
  await mkdir(privateDirectory, { recursive: true });
  const receiptPath = path.join(
    root,
    contract.privateCapability.retrospectiveReceipt
  );
  const priorReceipt = await readJsonIfPresent(receiptPath);
  if (
    priorReceipt?.completeRetrospectiveResultProduced === true
    || priorReceipt?.status
      === "M2_HPSR01_RETROSPECTIVE_COMPLETE_RESULT_FROZEN"
  ) {
    throw new Error("hpsr_retrospective_complete_result_already_frozen");
  }
  const attemptId = crypto.randomUUID();
  await writeJsonAtomic(receiptPath, {
    schema:
      "m2.current.head_protected_segmented_router."
        + "retrospective_receipt.private.v0.1",
    artifactClass: "PRIVATE_RUN_PROVENANCE",
    attemptId,
    status: "M2_HPSR01_RETROSPECTIVE_EXECUTION_STARTED",
    executionHead: preflight.head,
    exactHeadCiRunId: preflight.ciRunId,
    retrospectiveOrigins: retrospectivePlan.includedOrigins,
    completeRetrospectiveResultProduced: false,
    independentK2Ready,
    finalHoldoutOutcomeRead: false
  });
  const coreAmountConfig = await readJson(path.join(
    root,
    CORE_AMOUNT_CONFIG
  ));
  validateM2CoreLegacyHorizonAmountConfig(coreAmountConfig);
  const featureCachePath = path.join(
    root,
    contract.privateCapability.boundSourceCaches.featureRows
  );
  const featureMaterialization = fs.existsSync(featureCachePath)
    ? {
      status: "CACHE_HIT",
      artifactClass: "PRIVATE_DERIVED_CACHE",
      featureRows: await readRelevantFeatureRows(
        featureCachePath,
        retrospectivePlan.includedOrigins.at(-1)
      ),
      sourceAuthority: null
    }
    : await materializeM2HpsrFrozenFormulaFeatureRows({
      root,
      retrospectiveOrigins: retrospectivePlan.includedOrigins
    });
  const boundState = await readJson(path.join(
    root,
    contract.privateCapability.residualBoundArtifact
  ));
  const originResults = [];
  const privatePredictions = [];
  const fitAudits = [];
  for (const origin of retrospectivePlan.includedOrigins) {
    const trainingRows = featureMaterialization.featureRows.filter(
      (row) => (
        row.horizonMonths === 3
        && row.origin < origin
        && row.labelAvailableAsOf <= origin
        && Number.isFinite(row.features?.lg01PointEstimate)
      )
    );
    const validationRows = featureMaterialization.featureRows.filter(
      (row) => (
        row.horizonMonths === 3
        && row.origin === origin
        && Number.isFinite(row.features?.lg01PointEstimate)
      )
    );
    if (trainingRows.length < 1 || validationRows.length < 1) {
      throw new Error("hpsr_retrospective_feature_cell_empty");
    }
    if (
      validationRows.some((row) => (
        row.originVisibleOnly !== true
        || row.futureHistoryRowCount !== 0
        || !Number.isFinite(row.actual)
        || !Number.isFinite(row.referenceRevenue)
      ))
    ) {
      throw new Error("hpsr_retrospective_origin_visibility_failed");
    }
    const state = fitM2CoreHorizonAmountModel(trainingRows, {
      armId: "B3",
      huberDelta:
        contract.retrospectiveReplay.fixedCham01B3Fit.huberDelta,
      l2: contract.retrospectiveReplay.fixedCham01B3Fit.l2,
      config: coreAmountConfig
    });
    if (state.maximumTrainingLabelAvailableAsOf > origin) {
      throw new Error("hpsr_retrospective_future_training_label_read");
    }
    const b3Rows = validationRows.map(
      (row) => predictM2CoreHorizonAmount(row, state)
    );
    const routerResult = runHeadProtectedSegmentedRouter({
      origin,
      horizonMonths: 3,
      originVisibleWorkCashRows: validationRows.map((row) => ({
        standardWorkId: row.standardWorkId,
        trailing12Cash: row.referenceRevenue
      })),
      predictionRows: b3Rows.map((row, index) => ({
        standardWorkId: row.standardWorkId,
        origin,
        horizonMonths: 3,
        lg01Prediction:
          validationRows[index].features.lg01PointEstimate,
        cham01B3Prediction: row.pointEstimate,
        cham01Diagnostics: {
          signedExpm1Overflow:
            !Number.isFinite(row.pointEstimate)
            && Number.isFinite(row.transformedPointEstimate),
          supportRangeExtrapolation: false
        }
      })),
      residualBoundState: boundState,
      executionMode: "CONTROLLED_LATER_ORIGIN"
    });
    const expectedCore80 = validationRows.filter(
      (row) => row.core80
    ).map((row) => row.standardWorkId).sort();
    const routedCore80 = [...routerResult.population.core80WorkIds].sort();
    if (JSON.stringify(expectedCore80) !== JSON.stringify(routedCore80)) {
      throw new Error("hpsr_retrospective_core80_reconstruction_mismatch");
    }
    originResults.push({
      origin,
      routerResult,
      actualRows: validationRows.map((row) => ({
        standardWorkId: row.standardWorkId,
        origin,
        horizonMonths: 3,
        actual: row.actual
      }))
    });
    privatePredictions.push(...b3Rows.map((row, index) => ({
      schema:
        "m2.current.head_protected_segmented_router."
          + "retrospective_prediction.private.v0.1",
      experimentId:
        "M2-EXP-LG01-HEAD-PROTECTED-SEGMENTED-ROUTER-01",
      modelId: "M2-WORK-HPSR01",
      standardWorkId: row.standardWorkId,
      origin,
      horizonMonths: 3,
      actual: validationRows[index].actual,
      lg01PointEstimate:
        validationRows[index].features.lg01PointEstimate,
      cham01B3RawPointEstimate: Number.isFinite(row.pointEstimate)
        ? row.pointEstimate
        : null,
      cham01B3RawFinite: Number.isFinite(row.pointEstimate),
      maximumTrainingLabelAvailableAsOf:
        state.maximumTrainingLabelAvailableAsOf,
      fixedHuberDelta: state.huberDelta,
      fixedL2: state.l2,
      hyperparameterSearchExecuted: false
    })));
    fitAudits.push({
      origin,
      status: "FROZEN_FORMULA_ORIGIN_FAITHFUL_REFIT",
      trainingRowCount: state.trainingRowCount,
      trainingWorkCount: state.trainingWorkCount,
      trainingOriginCount: state.trainingOriginCount,
      maximumTrainingLabelAvailableAsOf:
        state.maximumTrainingLabelAvailableAsOf,
      fixedHuberDelta: state.huberDelta,
      fixedL2: state.l2,
      hyperparameterSearchExecuted: false,
      newModelOrCandidateCreated: false
    });
  }
  const evaluation = evaluateHpsrRetrospectiveDevelopment({
    originResults,
    decisionPolicy: contract.retrospectiveReplay.decisionPolicy,
    bootstrap: contract.retrospectiveReplay.bootstrap
  });
  const privatePredictionPath = path.join(
    root,
    contract.privateCapability.retrospectivePredictionRows
  );
  const privateEvaluationPath = path.join(
    root,
    contract.privateCapability.retrospectiveEvaluationRows
  );
  const privateManifestPath = path.join(
    root,
    contract.privateCapability.retrospectiveManifest
  );
  await writeNdjsonAtomic(privatePredictionPath, privatePredictions);
  await writeNdjsonAtomic(privateEvaluationPath, evaluation.privateRows);
  const resultDigest = sha256Json({
    origins: evaluation.origins,
    predictions: privatePredictions,
    evaluationRows: evaluation.privateRows,
    status: evaluation.status
  });
  await writeJsonAtomic(privateManifestPath, {
    schema:
      "m2.current.head_protected_segmented_router."
        + "retrospective_manifest.private.v0.1",
    artifactClass: "PRIVATE_DERIVED_CACHE",
    experimentId: evaluation.experimentId,
    modelId: evaluation.modelId,
    executionHead: preflight.head,
    exactHeadCiRunId: preflight.ciRunId,
    status: evaluation.status,
    origins: evaluation.origins,
    predictionRowCount: privatePredictions.length,
    evaluationRowCount: evaluation.privateRows.length,
    uniqueCaseKeyCount: evaluation.structure.uniqueCaseKeyCount,
    resultDigest,
    sourceAuthorityStatus: inventory.sourceAuthorityStatus,
    derivedFeatureCacheStatus: featureMaterialization.status,
    finalHoldoutOutcomeRead: false,
    independentK2OutcomeRead: false
  });
  await writeJsonAtomic(receiptPath, {
    schema:
      "m2.current.head_protected_segmented_router."
        + "retrospective_receipt.private.v0.1",
    artifactClass: "PRIVATE_RUN_PROVENANCE",
    attemptId,
    status: "M2_HPSR01_RETROSPECTIVE_COMPLETE_RESULT_FROZEN",
    executionHead: preflight.head,
    exactHeadCiRunId: preflight.ciRunId,
    resultStatus: evaluation.status,
    retrospectiveOrigins: evaluation.origins,
    predictionRowCount: privatePredictions.length,
    evaluationRowCount: evaluation.privateRows.length,
    completeRetrospectiveResultProduced: true,
    resultDigest,
    resultFrozen: true,
    retryAllowed: false,
    independentK2Ready,
    independentK2Executed: false,
    finalHoldoutOutcomeRead: false
  });
  const publicResult = buildPublicResult({
    evaluation,
    retrospectivePlan,
    independentK2Ready,
    openedSemantics,
    inventory,
    featureMaterialization,
    fitAudits,
    preflight
  });
  await writeJsonAtomic(path.join(
    root,
    contract.publicOutputs.retrospectiveEvaluationJson
  ), publicResult);
  await writeTextAtomic(path.join(
    root,
    contract.publicOutputs.retrospectiveEvaluationReport
  ), renderChineseReport(publicResult));
  return Object.freeze({
    status: publicResult.status,
    origins: publicResult.retrospective.origins,
    retrospectiveReplayReady: true,
    independentK2Ready,
    independentK2Executed: false,
    prospectiveFinalHoldoutOpened: false,
    publicResult
  });
}

async function readRelevantFeatureRows(filePath, maximumOrigin) {
  const rows = [];
  const input = fs.createReadStream(filePath, { encoding: "utf8" });
  const lines = readline.createInterface({
    input,
    crlfDelay: Infinity
  });
  for await (const line of lines) {
    if (line.trim() === "") continue;
    const row = JSON.parse(line);
    if (
      row.horizonMonths === 3
      && row.origin <= maximumOrigin
    ) {
      rows.push(row);
    }
  }
  return rows;
}

function buildPublicResult({
  evaluation,
  retrospectivePlan,
  independentK2Ready,
  openedSemantics,
  inventory,
  featureMaterialization,
  fitAudits,
  preflight
}) {
  const {
    privateRows: _privateRows,
    ...publicEvaluation
  } = evaluation;
  const requiredK2Months = openedSemantics.prospectiveReservation
    .firstIndependentFutureBillMonths.filter((month) => (
      month
        > openedSemantics.billMonthAvailability
          .completeAuthoritativeBillMonthThrough
    ));
  return Object.freeze({
    schema:
      "m2.current.head_protected_segmented_router."
        + "retrospective_development.public.v0.1",
    asOf: new Date().toISOString().slice(0, 10),
    experimentId: evaluation.experimentId,
    modelId: evaluation.modelId,
    displayNameZh: "LG01 头部保护分段路由模型 v0.1",
    displayNameEn:
      "LG01 Head-Protected Segmented Router Model v0.1",
    status: evaluation.status,
    execution: Object.freeze({
      branch: preflight.branch,
      exactHead: preflight.head,
      pullRequestNumber: preflight.prNumber,
      pullRequestDraft: preflight.prDraft,
      exactHeadCiRunId: preflight.ciRunId,
      linuxCi: preflight.linux,
      windowsCi: preflight.windows,
      K1Completed: true,
      retrospectiveActuallyExecuted: true,
      retrospectiveCompleteResultCount: 1,
      independentK2Executed: false,
      prospectiveFinalHoldoutOpened: false,
      productionSurfaceChanged: false
    }),
    readiness: Object.freeze({
      retrospectiveReplayReady: true,
      independentK2Ready,
      firstIndependentLaterOrigin:
        openedSemantics.prospectiveReservation
          .firstIndependentLaterOrigin,
      firstIndependentRequiredCompleteThrough:
        openedSemantics.prospectiveReservation
          .firstIndependentRequiredCompleteThrough,
      completeAuthoritativeBillMonthThrough:
        openedSemantics.billMonthAvailability
          .completeAuthoritativeBillMonthThrough,
      missingOrIncompleteK2BillMonths: Object.freeze(requiredK2Months),
      prospectiveFinalHoldoutOrigin:
        openedSemantics.prospectiveReservation
          .prospectiveFinalHoldoutOrigin,
      prospectiveFinalHoldoutOpened: false,
      prospectiveFinalHoldoutOutcomeRead: false
    }),
    retrospective: Object.freeze({
      evidenceClass: evaluation.evidenceClass,
      independentEvidence: false,
      origins: evaluation.origins,
      originCount: evaluation.originCount,
      includedOriginInventory: retrospectivePlan.inventory,
      excludedOrigins: retrospectivePlan.excludedOrigins,
      evaluation: publicEvaluation
    }),
    privateCapability: Object.freeze({
      sourceAuthorityStatus: inventory.sourceAuthorityStatus,
      derivedFeatureCacheStatus: featureMaterialization.status,
      historicalReceiptStatusBefore:
        inventory.historicalReceiptStatus,
      cacheMissingWouldBlock: false,
      provenanceMissingWouldBlock: false,
      privateIdentityOrRowAmountPublished: false
    }),
    scientificExecutionCounts: Object.freeze({
      newModelTrainingCount: 0,
      frozenFormulaOriginFaithfulRefitCount: fitAudits.length,
      modelSelectionCount: 0,
      hyperparameterSearchCount: 0,
      alphaSearchCount: 0,
      residualBoundEstimationCount: 0,
      completeRetrospectiveEvaluationCount: 1,
      bootstrapExecutionCount: 1,
      independentK2EvaluationCount: 0,
      finalHoldoutEvaluationCount: 0
    }),
    frozenFormulaFitAudits: Object.freeze(fitAudits),
    governance: Object.freeze({
      activeCandidate: false,
      approvedForAutomation: false,
      productionReady: false,
      releaseAuthorized: false,
      pullRequestMergeAuthorized: false,
      nextModelAutomaticallyAuthorized: false
    })
  });
}

function renderChineseReport(value) {
  const evaluation = value.retrospective.evaluation;
  const metrics = evaluation.metrics;
  const bandRows = ["H50", "M30", "L20"].map((bandId) => {
    const band = evaluation.cashBands[bandId];
    return `| ${bandId} | ${band.workCount}`
      + ` | ${percent(band.absoluteActualCashShare)}`
      + ` | ${percent(band.r0.wape)} / `
      + `${percent(band.r0.signedBias)} / ${number(band.r0.mae)} / `
      + `${percent(band.r0AbsoluteErrorContribution)}`
      + ` | ${percent(band.d1.wape)} / `
      + `${percent(band.d1.signedBias)} / ${number(band.d1.mae)} / `
      + `${percent(band.d1AbsoluteErrorContribution)}`
      + ` | ${percent(band.r1.wape)} / `
      + `${percent(band.r1.signedBias)} / ${number(band.r1.mae)} / `
      + `${percent(band.r1AbsoluteErrorContribution)}`
      + ` | ${band.clipCount} / ${percent(band.clipRate)}`
      + ` | ${band.d1NonfiniteCount} / ${percent(band.d1NonfiniteRate)}`
      + ` | ${band.numericFallbackCount} / `
      + `${percent(band.numericFallbackRate)}`
      + ` | ${percent(band.rawR1Coverage)} |`;
  });
  const originRows = value.retrospective.includedOriginInventory.map(
    (item) => `| ${item.origin}`
      + ` | ${item.included ? "纳入" : "排除"}`
      + ` | ${item.included
        ? "满足全部动态门禁"
        : item.exclusionReasons.map(exclusionReasonZh).join("、")}`
      + ` | ${item.openedProfileRowCount} |`
  );
  const includedOriginRows = evaluation.originSummaries.map(
    (item) => `| ${item.origin}`
      + ` | ${item.eligibleWorkCount}`
      + ` | ${item.caseCount}`
      + ` | ${item.core80WorkCount}`
      + ` | ${percent(item.core80ActualCashShare)}`
      + ` | ${item.cashBandWorkCounts.H50}`
      + ` | ${percent(item.cashBandActualShares.H50)}`
      + ` | ${item.cashBandWorkCounts.M30}`
      + ` | ${percent(item.cashBandActualShares.M30)}`
      + ` | ${item.cashBandWorkCounts.L20}`
      + ` | ${percent(item.cashBandActualShares.L20)}`
      + ` | ${item.core80CutoffTieCount} |`
  );
  return `# M2 HPSR01 回溯开发评价 v0.1

## 首页结论

- K1 是否完成：是，canonical implementation 与公开合成验证均已完成。
- 回溯评价是否真正执行：是；已冻结首个且唯一的完整回溯开发结果。
- 纳入 origin：${value.retrospective.origins.join("、")}。
- 回溯判断：\`${value.status}\`（${decisionZh(value.status)}）。
- 是否为独立证据：否；这是此前已打开 outcome 的回溯开发证据。
- 独立 K2 数据是否成熟：${value.readiness.independentK2Ready ? "是" : "否"}。
- 独立 K2 是否执行：否。
- prospective final holdout 是否仍未打开：是。
- 是否值得继续等待：${value.status.includes("UNSUPPORTED") ? "否；按合同在独立 K2 前停止。" : "是；但只能等待合法独立 K2，不能据此发布。"}
- activeCandidate：否；approvedForAutomation：否。

## 身份与边界

- 中文模型名：LG01 头部保护分段路由模型 v0.1
- 英文原名：LG01 Head-Protected Segmented Router Model v0.1
- 稳定模型 ID：\`${value.modelId}\`
- 稳定实验 ID：\`${value.experimentId}\`
- 评价类型：回溯开发评价（非独立 later-origin、非 final holdout）
- horizon：3 个月；主人口：origin 动态 Core80 成熟老品既有成熟业务范围

## 回溯人口

| origin | 决定 | 原因 | 预先打开证据行数 |
| --- | --- | --- | ---: |
${originRows.join("\n")}

| 纳入 origin | 全部成熟可评价作品 | case 数 | Core80 作品 | Core80 actual cash coverage | H50 作品 | H50 actual share | M30 作品 | M30 actual share | L20 作品 | L20 actual share | cutoff tie |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${includedOriginRows.join("\n")}

- 最终唯一 case-key：${evaluation.structure.uniqueCaseKeyCount}
- Core80 actual cash coverage：${percent(evaluation.core80ActualCashCoverage)}
- H50 逐行严格等于 R0：${evaluation.structure.H50RowwisePredictionAndAbsoluteErrorEquality ? "通过" : "失败"}
- final prediction 全部有限：${evaluation.structure.allActualAndFinalPredictionsFinite ? "通过" : "失败"}

## 主要同案例成绩

| 对象 | WAPE | signed bias | absolute bias | MAE | median AE |
| --- | ---: | ---: | ---: | ---: | ---: |
| R0 冻结 LG01 基线 | ${percent(metrics.r0.wape)} | ${percent(metrics.r0.signedBias)} | ${percent(metrics.r0.absoluteBias)} | ${number(metrics.r0.mae)} | ${number(metrics.r0.medianAbsoluteError)} |
| D1 冻结 CHAM01 B3 原始诊断（有限同案例） | ${percent(metrics.d1.wape)} | ${percent(metrics.d1.signedBias)} | ${percent(metrics.d1.absoluteBias)} | ${number(metrics.d1.mae)} | ${number(metrics.d1.medianAbsoluteError)} |
| R1 HPSR01 raw candidate | ${percent(metrics.r1.wape)} | ${percent(metrics.r1.signedBias)} | ${percent(metrics.r1.absoluteBias)} | ${number(metrics.r1.mae)} | ${number(metrics.r1.medianAbsoluteError)} |

- R1 相对 R0 paired FVA：${percent(metrics.r1PairedFvaVsR0)}
- D1 相对 R0 paired FVA：${percent(metrics.d1PairedFvaVsR0)}
- R1 作品 cluster bootstrap 95% 区间：${interval(metrics.r1BootstrapFva95.interval95)}
- R1 absolute bias 相对 R0 恶化：${percent(metrics.absoluteBiasWorsening)}；预冻结 unsupported 门限为超过 ${percent(evaluation.decisionPolicy.unsupportedAbsoluteBiasWorsening)}，本次已触发。
- 改善时间块：${evaluation.timeBlockSummary.improvingBlockCount}/${evaluation.timeBlockSummary.evaluableBlockCount}；单时间块不足以形成 supported 判断。

## 现金带诊断

每个模型单元依次为 WAPE / signed bias / MAE / 对总体 absolute error 的贡献。

| 现金带 | 作品数 | actual cash share | R0 | D1 | R1 | clip 数/比例 | D1 nonfinite 数/比例 | numeric fallback 数/比例 | R1 raw coverage |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${bandRows.join("\n")}

- D1 nonfinite：${evaluation.numeric.d1NonfiniteCount}；${evaluation.numeric.d1NonfiniteCount > 0 ? "这些行只在 M30/L20 按冻结规则隔离回退，不会被整模型 fallback 掩盖。" : "本次没有触发 numeric fallback。"}
- R1 raw coverage：${percent(evaluation.numeric.r1RawCoverage)}
- 最大单作品误差集中度（R0/R1）：${percent(metrics.r0.errorConcentration.maximumWorkShare)} / ${percent(metrics.r1.errorConcentration.maximumWorkShare)}
- top 5 误差集中度（R0/R1）：${percent(metrics.r0.errorConcentration.top5WorkShare)} / ${percent(metrics.r1.errorConcentration.top5WorkShare)}
- top 10 误差集中度（R0/R1）：${percent(metrics.r0.errorConcentration.top10WorkShare)} / ${percent(metrics.r1.errorConcentration.top10WorkShare)}

## K2 与 final holdout

- first independent later-origin：${value.readiness.firstIndependentLaterOrigin}
- 所需完整至：${value.readiness.firstIndependentRequiredCompleteThrough}
- 当前权威完整至：${value.readiness.completeAuthoritativeBillMonthThrough}
- 缺失或不完整月份：${value.readiness.missingOrIncompleteK2BillMonths.join("、") || "无"}
- prospective final holdout：${value.readiness.prospectiveFinalHoldoutOrigin}，仍未打开。

## 执行计数与治理

- 新模型训练：0；冻结公式 origin-faithful refit：${value.scientificExecutionCounts.frozenFormulaOriginFaithfulRefitCount}。
- 模型选择、调参、alpha 搜索、residual bound 重估：均为 0。
- 完整回溯评价：1；独立 K2：0；final holdout：0。
- activeCandidate：false；approvedForAutomation：false；productionReady：false。
- Draft PR #${value.execution.pullRequestNumber} 保持 Open / Draft / Unmerged。
`;
}

function decisionZh(status) {
  if (status.includes("UNSUPPORTED")) {
    return "回溯开发证据不支持，按合同在独立 K2 前停止";
  }
  if (status.includes("SUPPORTED")) {
    return "回溯开发证据支持，但仍等待独立 K2";
  }
  return "回溯开发证据混合，仍等待独立 K2";
}

function exclusionReasonZh(reason) {
  const labels = {
    ACTUAL_NOT_OPENED_BEFORE_TASK:
      "本任务前没有 actual 已打开证据（ACTUAL_NOT_OPENED_BEFORE_TASK）",
    HISTORICAL_ISOLATED_OUTCOME:
      "历史隔离 outcome（HISTORICAL_ISOLATED_OUTCOME）",
    INCOMPLETE_THREE_MONTH_AUTHORITY_WINDOW:
      "三个月权威账单窗口不完整（INCOMPLETE_THREE_MONTH_AUTHORITY_WINDOW）"
  };
  return labels[reason] ?? reason;
}

function percent(value) {
  return value === null || value === undefined
    ? "null（不可定义）"
    : `${(value * 100).toFixed(4)}%`;
}

function number(value) {
  return value === null || value === undefined
    ? "null（不可定义）"
    : Number(value).toFixed(4);
}

function interval(value) {
  return value === null
    ? "null（不可定义）"
    : `[${percent(value.lower)}, ${percent(value.upper)}]`;
}

function sha256Json(value) {
  return crypto.createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
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

async function writeJsonAtomic(filePath, value) {
  await writeTextAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeNdjsonAtomic(filePath, rows) {
  await writeTextAtomic(
    filePath,
    rows.map((row) => JSON.stringify(row)).join("\n") + "\n"
  );
}

async function writeTextAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporary, value, "utf8");
  await rename(temporary, filePath);
}
