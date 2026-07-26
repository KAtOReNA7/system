import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile
} from "node:fs/promises";
import path from "node:path";

import {
  buildM2LifecycleAwareSyntheticDiagnostic,
  crossFitM2LifecycleAware,
  scoreM2LifecycleAwareRows,
  strictRollingM2LifecycleAware
} from "../../src/domain/m2Current/lifecycleAware.js";
import { scoreM2CurrentPointRows } from
  "../../src/domain/m2Current/metrics.js";

const CONFIG_PATH = "config/m2-current-lifecycle-aware.v0.1.json";

export async function runM2LifecycleAwarePublicDiagnostic({
  root,
  verify
}) {
  const { config, baseConfig } = await loadConfigs(root);
  assertBoundary(config);
  const fixture = JSON.parse(await readFile(
    path.join(root, config.syntheticFixture),
    "utf8"
  ));
  const result = buildM2LifecycleAwareSyntheticDiagnostic(
    fixture,
    baseConfig,
    config
  );
  const outputPath = path.join(root, config.publicDiagnosticOutput);
  const text = JSON.stringify(result, null, 2) + "\n";
  if (verify) {
    const current = await readFile(outputPath, "utf8");
    if (current !== text) {
      throw new Error("m2_lifecycle_aware_public_diagnostic_drift");
    }
    process.stdout.write(
      "M2 lifecycle-aware public diagnostic verified.\n"
    );
    return result;
  }
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, text, "utf8");
  process.stdout.write(
    "M2 lifecycle-aware public diagnostic written.\n"
  );
  return result;
}

export async function runM2LifecycleAwarePrivateDevelopment({
  root,
  baseConfig,
  manifest,
  primaryCases,
  auxiliaryCases,
  privateDirectory
}) {
  const config = JSON.parse(await readFile(
    path.join(root, CONFIG_PATH),
    "utf8"
  ));
  assertBoundary(config);
  assertDatasetBoundary(manifest, baseConfig, config);

  const primary = crossFitM2LifecycleAware(
    primaryCases,
    baseConfig,
    config
  );
  const strict = strictRollingM2LifecycleAware(
    auxiliaryCases,
    baseConfig,
    config
  );
  const overlapCases = auxiliaryCases.filter(
    (row) => row.v03ExactOverlap === true
  );
  const overlapCrossFit = overlapCases.length > 0
    ? crossFitM2LifecycleAware(overlapCases, baseConfig, config)
    : null;
  const overlap = overlapCrossFit !== null
    ? Object.freeze({
      caseCount: overlapCrossFit.rows.length,
      candidate: overlapCrossFit.metrics.candidate,
      rawCandidate: overlapCrossFit.metrics.rawCandidate,
      baseline: overlapCrossFit.metrics.baseline,
      exactV03: scoreM2CurrentPointRows(overlapCrossFit.rows.map((row) => ({
        actual: row.actual,
        pointEstimate: row.v03PointEstimate
      })))
    })
    : null;
  const result = buildPublicResult({
    config,
    baseConfig,
    manifest,
    primary,
    strict,
    overlap
  });
  const privateRows = [
    ...primary.rows.map((row) => compactEvaluationRow(row, "primary")),
    ...strict.rows.map((row) => (
      compactEvaluationRow(row, "strict_rolling")
    )),
    ...(overlapCrossFit?.rows ?? []).map((row) => (
      compactEvaluationRow(row, "v03_overlap_cross_work")
    ))
  ];
  const privateText = privateRows.map(
    (row) => JSON.stringify(row)
  ).join("\n") + "\n";
  const configText = await readFile(path.join(root, CONFIG_PATH), "utf8");
  const privateManifest = {
    schema: "m2.current.lifecycle_aware.evaluation_private_manifest.v0.1",
    tracked: false,
    candidateId: config.candidateId,
    datasetVersion: config.datasetVersion,
    featureVersion: config.featureVersion,
    configSha256: digest(configText),
    sourceDatasetDigests: manifest.digests,
    rowCount: privateRows.length,
    sha256: digest(privateText),
    primaryRowCount: primary.rows.length,
    strictRollingRowCount: strict.rows.length,
    v03OverlapCrossWorkRowCount: overlapCrossFit?.rows.length ?? 0,
    primaryWorkCount: primary.metrics.workCount,
    finalHoldoutOpened: false,
    productionRouteModified: false,
    exactV03Modified: false,
    providerUsed: false,
    databaseRead: false
  };
  await Promise.all([
    mkdir(privateDirectory, { recursive: true }),
    mkdir(
      path.dirname(path.join(root, config.publicOutput)),
      { recursive: true }
    )
  ]);
  await Promise.all([
    writeFile(
      path.join(privateDirectory, config.privateOutputs.evaluation),
      privateText,
      "utf8"
    ),
    writeFile(
      path.join(
        privateDirectory,
        config.privateOutputs.evaluationManifest
      ),
      JSON.stringify(privateManifest, null, 2) + "\n",
      "utf8"
    ),
    writeFile(
      path.join(root, config.publicOutput),
      JSON.stringify(result, null, 2) + "\n",
      "utf8"
    ),
    writeFile(
      path.join(root, config.publicReport),
      renderReport(result),
      "utf8"
    )
  ]);
  process.stdout.write(JSON.stringify({
    candidateId: config.candidateId,
    decision: result.decision,
    primaryCandidateWape:
      result.experiments.challenger.evaluation.primary.wape,
    primaryBaselineWape:
      result.experiments.baseline.evaluation.primary.wape,
    primaryRelativeWape:
      result.comparison.primary.relativeWape,
    strictCandidateWape:
      result.experiments.challenger.evaluation.strictRolling.wape,
    strictBaselineWape:
      result.experiments.baseline.evaluation.strictRolling.wape,
    strictRelativeWape:
      result.comparison.strictRolling.relativeWape
  }) + "\n");
  return result;
}

function buildPublicResult({
  config,
  baseConfig,
  manifest,
  primary,
  strict,
  overlap
}) {
  const primaryCandidate = primary.metrics.candidate;
  const primaryRawCandidate = primary.metrics.rawCandidate;
  const primaryBaseline = primary.metrics.baseline;
  const strictCandidate = strict.metrics.candidate;
  const strictRawCandidate = strict.metrics.rawCandidate;
  const strictBaseline = strict.metrics.baseline;
  const primaryRelative = primaryCandidate.wape / primaryBaseline.wape - 1;
  const strictRelative = strictCandidate.wape / strictBaseline.wape - 1;
  const primaryImproved = primaryRelative < 0;
  const strictImproved = strictRelative < 0;
  const minimumMaterialImprovement = Number(
    config.evaluation.materialRelativeWapeImprovementMinimum
  );
  const materialImprovement = (
    primaryRelative <= -minimumMaterialImprovement
    && strictRelative <= -minimumMaterialImprovement
  );
  const stateSelectionPostHoc = String(
    config.model.stateSelectionSemantics
  ).startsWith("posthoc_");
  const decision = materialImprovement && !stateSelectionPostHoc
    ? "LIFECYCLE_AWARE_DEVELOPMENT_MATERIAL_IMPROVEMENT_NOT_RELEASE"
    : primaryImproved && strictImproved
      ? "LIFECYCLE_AWARE_DEVELOPMENT_FAIL_TRIVIAL_POSTHOC_GAIN"
      : "LIFECYCLE_AWARE_DEVELOPMENT_FAIL_NO_IMPROVEMENT";
  return Object.freeze({
    schema: "m2.current.lifecycle_aware_development.public.v0.1",
    candidateId: config.candidateId,
    status: "DEVELOPMENT_EXPERIMENT_ONLY",
    decision,
    objective: "improve_work_level_future_sales_share_cash_forecast",
    dataset: Object.freeze({
      datasetVersion: config.datasetVersion,
      authority: "user_reviewed_sales_share_workbook_membership",
      featureAndLabelWindow: Object.freeze({
        startsAt: baseConfig.dataContract.featureAndLabelWindowStart,
        endsAt: baseConfig.dataContract.featureAndLabelWindowEnd
      }),
      authorityWorkCount: manifest.authorityWorkCount,
      workWithModernSalesShareFactCount:
        manifest.modernWindowWorkWithFactCount,
      modernSalesShareFactRowCount: manifest.modernWindowFactRowCount,
      primary: publicPopulation(manifest.primary),
      strictAuxiliary: publicPopulation(manifest.auxiliary),
      dataQuality: Object.freeze({
        intendedGrain: manifest.dataQuality.intendedGrain,
        mappingCoverage: manifest.dataQuality.mappingCoverage,
        amountConservationDifference:
          manifest.dataQuality.amountConservationDifference,
        unmaturedLabelZeroImputationCount:
          manifest.dataQuality.unmaturedLabelZeroImputationCount,
        buyoutCashUsed: manifest.dataQuality.buyoutCashUsed,
        pre2021CashAmountUsed:
          manifest.dataQuality.pre2021CashAmountUsed,
        post2025CashAmountUsed:
          manifest.dataQuality.post2025CashAmountUsed,
        observedZeroMonthsIncluded: true,
        unobservedMonthsZeroFilled: false
      })
    }),
    featureSet: Object.freeze({
      featureVersion: config.featureVersion,
      source: "sales_share_monthly_history_available_at_origin_only",
      lifecycle: config.lifecycle,
      futureLabelsUsedForClassification: false,
      staticChannelAttributesUsed: false,
      categoryUsed: false
    }),
    completedRapidExperiments: Object.freeze(
      config.completedRapidExperiments
    ),
    experiments: Object.freeze({
      baseline: Object.freeze({
        experimentId: config.experiments[0].experimentId,
        kind: "baseline",
        datasetVersion: config.datasetVersion,
        featureVersion: "M2-human-anchored-frozen-features-v1.0",
        modelConfig: Object.freeze({
          source: config.baseConfig,
          model: "frozen_learnedGlobal_plus_common_reversal",
          humanPrior: baseConfig.humanPrior,
          learning: Object.freeze({
            crossWorkFoldCount: baseConfig.learning.crossWorkFoldCount,
            coordinatePasses: baseConfig.learning.coordinatePasses,
            parameterGrids: baseConfig.learning.parameterGrids,
            reversalPriorStrength:
              baseConfig.learning.reversalPriorStrength,
            reversalRateMaximum:
              baseConfig.learning.reversalRateMaximum
          }),
          retunedForLifecycleExperiment: false
        }),
        evaluation: Object.freeze({
          primary: primaryBaseline,
          strictRolling: strictBaseline
        })
      }),
      challenger: Object.freeze({
        experimentId: config.experiments[1].experimentId,
        kind: "challenger",
        datasetVersion: config.datasetVersion,
        featureVersion: config.featureVersion,
        modelConfig: Object.freeze({
          lifecycle: config.lifecycle,
          model: config.model,
          training: config.training
        }),
        evaluation: Object.freeze({
          primary: primaryCandidate,
          strictRolling: strictCandidate,
          rawPrimary: primaryRawCandidate,
          rawStrictRolling: strictRawCandidate
        })
      })
    }),
    comparison: Object.freeze({
      primary: Object.freeze({
        ...comparison(primaryCandidate, primaryBaseline),
        rawChallenger: primaryRawCandidate,
        rawRelativeWape:
          primaryRawCandidate.wape / primaryBaseline.wape - 1
      }),
      strictRolling: Object.freeze({
        ...comparison(strictCandidate, strictBaseline),
        rawChallenger: strictRawCandidate,
        rawRelativeWape:
          strictRawCandidate.wape / strictBaseline.wape - 1
      }),
      exactV03Overlap: overlap === null
        ? null
        : Object.freeze({
          caseCount: overlap.caseCount,
          challenger: overlap.candidate,
          rawChallenger: overlap.rawCandidate,
          baseline: overlap.baseline,
          exactV03: overlap.exactV03,
          relativeWapeToExactV03:
            overlap.candidate.wape / overlap.exactV03.wape - 1,
          rawRelativeWapeToExactV03:
            overlap.rawCandidate.wape / overlap.exactV03.wape - 1,
          exactV03UsedForTrainingOrSelection: false
        })
    }),
    interpretation: Object.freeze({
      primaryImproved,
      strictImproved,
      minimumMaterialRelativeWapeImprovement:
        minimumMaterialImprovement,
      materialImprovement,
      stateSelectionPostHoc,
      modelUpgradeSupported: false,
      exactV03ReplacementSupported: false
    }),
    evaluation: Object.freeze({
      primary: primary.metrics,
      strictRolling: strict.metrics,
      strictRollingOrigins: strict.origins,
      revenueWeightedWapeDefinition:
        config.evaluation.revenueWeightedWapeDefinition,
      lifecycleSegmentMetricsIncluded: true,
      topRevenueWorkErrorAnalysisIncluded: true,
      topRevenuePublicDetail:
        "aggregate_only; work identifiers remain in ignored private evaluation",
      selectedLifecycleStates: config.model.selectedLifecycleStates,
      stateSelectionSemantics:
        config.model.stateSelectionSemantics
    }),
    implementation: Object.freeze({
      canonicalCore:
        "src/domain/m2Current/lifecycleAware.js",
      runner:
        "existing run_m2_human_anchored_development.mjs lifecycle-aware mode",
      productionLoaderImported: false,
      productionRouteImported: false,
      exactV03CodeChanged: false,
      dataAuthorityCodeChanged: false,
      cashBoundaryCodeChanged: false,
      newReleaseGateAdded: false
    }),
    boundaries: Object.freeze({
      developmentOnly: true,
      independentLaterOrigin: false,
      finalHoldoutOpened: false,
      exactV03FallbackRetained: true,
      currentDecision: "CANARY_FAIL",
      automationDecision: "AUTOMATION_BLOCKED",
      providerAuthorized: false,
      databaseAuthorized: false,
      releaseAuthorized: false,
      m3FormalAuthorized: false
    })
  });
}

function compactEvaluationRow(row, evaluationFamily) {
  return {
    schema: "m2.current.lifecycle_aware.evaluation_private_row.v0.1",
    tracked: false,
    evaluationFamily,
    standardWorkId: row.standardWorkId,
    origin: row.origin,
    horizonMonths: row.horizonMonths,
    labelAvailableAsOf: row.labelAvailableAsOf,
    lifecycleState: row.lifecycleState,
    legacySegment: row.segment,
    actualPositive: row.actualPositive,
    actualReversal: row.actualReversal,
    actual: row.actual,
    occurrenceProbability: row.occurrenceProbability,
    conditionalPositiveAmount: row.conditionalPositiveAmount,
    positivePointEstimate: row.positivePointEstimate,
    reversalPointEstimate: row.reversalPointEstimate,
    pointEstimate: row.pointEstimate,
    rawLifecyclePointEstimate: row.rawLifecyclePointEstimate,
    baselinePointEstimate: row.baselinePointEstimate,
    lifecycleChallengerSelected: row.lifecycleChallengerSelected,
    selectedPointLayer: row.selectedPointLayer,
    v03PointEstimate: row.v03PointEstimate,
    v03ExactOverlap: row.v03ExactOverlap,
    evaluationFold: row.evaluationFold ?? null,
    sameOrLaterOuterTruthRead:
      row.sameOrLaterOuterTruthRead ?? false,
    trainingReadOwnWork: row.trainingReadOwnWork ?? false,
    unmaturedLabelZeroImputed: row.unmaturedLabelZeroImputed,
    buyoutCashUsed: row.buyoutCashUsed
  };
}

function renderReport(result) {
  const primary = result.comparison.primary;
  const strict = result.comparison.strictRolling;
  const primaryMetrics = result.evaluation.primary;
  const strictMetrics = result.evaluation.strictRolling;
  const overlap = result.comparison.exactV03Overlap;
  const lifecycleRows = Object.entries(
    primaryMetrics.byLifecycle
  ).map(([state, value]) => (
    `| ${state} | ${value.caseCount} | ${number(value.candidate?.wape)}`
    + ` | ${number(value.baseline?.wape)}`
    + ` | ${percent(value.relativeWapeToBaseline)}`
    + ` | ${number(value.candidate?.signedBias)} |`
  )).join("\n");
  const topRows = Object.values(
    primaryMetrics.topRevenue.cumulative
  ).map((value) => (
    `| top ${percent(value.fraction, 0)} | ${value.workCount}`
    + ` | ${percent(value.positiveRevenueShare)}`
    + ` | ${number(value.candidate.wape)}`
    + ` | ${number(value.baseline.wape)}`
    + ` | ${percent(value.relativeWapeToBaseline)}`
    + ` | ${percent(value.candidateAbsoluteErrorShare)} |`
  )).join("\n");
  return `# M2 lifecycle-aware revenue forecast challenger v0.1

## 结论

- 候选：\`${result.candidateId}\`
- 决策：\`${result.decision}\`
- 范围：算法 development 实验，不是发布、Canary、自动化或 exact v0.3 替换。
- exact v0.3 fallback、人工账单权威和 sales-share cash boundary 均未修改。

## baseline 与 challenger

| 评估 | learnedGlobal + common reversal | lifecycle-aware | 相对 WAPE |
|---|---:|---:|---:|
| 36 个月按作品外五折 | ${number(primary.baseline.wape)} | ${number(primary.challenger.wape)} | ${percent(primary.relativeWape)} |
| strict earlier-label rolling | ${number(strict.baseline.wape)} | ${number(strict.challenger.wape)} | ${percent(strict.relativeWape)} |

baseline 只精确重放冻结的 learnedGlobal + common reversal；challenger 使用
lifecycle-aware occurrence 与 log-amount 配置。当前 state routing 明确来自已完成
development 实验，不增加发布门禁，也不构成独立模型选择。

在当前结果之前完成的 rapid experiment 均保存在 public JSON 的
\`completedRapidExperiments\`，包含各自 dataset version、feature version、
model config、evaluation result 与失败归因。本报告主表对应当前 experiment
\`${result.experiments.challenger.experimentId}\`。

当前 selected pipeline 只在
\`${result.evaluation.selectedLifecycleStates.join(", ")}\` 状态使用 challenger；
其余状态回退 frozen baseline。该路由来自已见 development 实验，语义为
\`${result.evaluation.stateSelectionSemantics}\`。raw challenger 在 primary/strict
的 WAPE 分别为 \`${number(primary.rawChallenger.wape)}\` /
\`${number(strict.rawChallenger.wape)}\`，不会被 fallback 覆盖。

selected pipeline 在 primary/strict 的相对变化只有
\`${percent(primary.relativeWape, 4)}\` / \`${percent(strict.relativeWape, 4)}\`，
低于预先用于结果解释的 1% materiality，也来自 post-hoc state routing；因此最终
仍判为 development fail，不支持模型升级。

## 模型

1. 仅用 origin 当时已有的分成正向现金月序列，将作品互斥分类为
   \`active/stable/decline/dormant/revival\`。
2. 正则化 logistic 估计
   \(P(S_{w,o,h}>0\mid lifecycle, history)\)，再按 lifecycle 做收缩校准。
3. 最终 raw amount 使用 frozen learnedGlobal 正收入点预测作为 offset，学习
   lifecycle 条件的收缩 log-revenue ratio；直接 Huber \`log1p\` 与 capped
   版本作为已保存的失败快速实验，不进入当前 raw 候选。
4. 冲销继续使用既有独立 reversal 层；最终
   \`positive forecast - reversal forecast = net sales-share cash forecast\`。

## 生命周期指标（36 个月主评估）

| lifecycle | case | challenger WAPE | baseline WAPE | 相对变化 | challenger bias |
|---|---:|---:|---:|---:|---:|
${lifecycleRows}

Occurrence Brier/log loss 为
\`${number(primaryMetrics.occurrence.brier)} / ${number(primaryMetrics.occurrence.logLoss)}\`；
正金额条件 WAPE/log1p MAE 为
\`${number(primaryMetrics.conditionalPositiveAmount.wape)} / ${number(primaryMetrics.conditionalPositiveAmount.logMae)}\`。

## 高收入作品误差

| 累计作品层 | 作品数 | 正收入占比 | challenger WAPE | baseline WAPE | 相对变化 | challenger 绝对误差占比 |
|---|---:|---:|---:|---:|---:|---:|
${topRows}

公开结果只保留聚合；逐作品 lifecycle、实际值和误差只写入 Git ignored private
evaluation artifact。

## exact v0.3 重叠

${overlap === null ? "没有 exact v0.3 重叠 case。" : `
| case | raw lifecycle WAPE | selected WAPE | learnedGlobal WAPE | exact v0.3 WAPE | raw 相对 exact v0.3 |
|---:|---:|---:|---:|---:|---:|
| ${overlap.caseCount} | ${number(overlap.rawChallenger.wape)} | ${number(overlap.challenger.wape)} | ${number(overlap.baseline.wape)} | ${number(overlap.exactV03.wape)} | ${percent(overlap.rawRelativeWapeToExactV03)} |

该 overlap 沿用 deterministic work fold，但 raw/selected 比较均处于同一
development 窗口，不是独立 later-origin；exact v0.3 点值没有进入 lifecycle
参数拟合或 state-routing 选择。`}

## 可复现记录

两个 experiment 都在 JSON 中保存了：

- \`datasetVersion\`
- \`featureVersion\`
- 完整 \`modelConfig\`
- primary 与 strict rolling 的 \`evaluation\`

公开 synthetic 入口不读取 private：

\`\`\`bash
npm run diagnose:m2:lifecycle-aware
\`\`\`

本机受控 development：

\`\`\`bash
npm run doctor:capability -- m2-current-lifecycle-aware
npm run develop:m2:current:lifecycle-aware
\`\`\`

## 边界

- 没有修改 production loader、route 或 forecast API。
- 没有打开 independent later-origin、final holdout、provider、数据库、Canary、
  full160、release 或 M3 formal。
- 当前业务状态继续为 \`CANARY_FAIL\` / \`AUTOMATION_BLOCKED\`。
`;
}

function assertBoundary(config) {
  if (
    config.schema
      !== "m2.current.lifecycle_aware_revenue_forecast_development.v0.1"
    || config.candidateId
      !== "M2-lifecycle-aware-revenue-forecast-challenger-v0.1"
    || config.target !== "future_sales_share_cash"
    || config.authorization.algorithmReconstruction !== true
    || config.authorization.localDevelopment !== true
    || config.authorization.productionModelModification !== false
    || config.authorization.exactV03Replacement !== false
    || config.authorization.dataAuthorityChange !== false
    || config.authorization.cashBoundaryChange !== false
    || config.authorization.independentLaterOrigin !== false
    || config.authorization.finalHoldout !== false
    || config.authorization.provider !== false
    || config.authorization.database !== false
    || config.authorization.canary !== false
    || config.authorization.release !== false
    || config.lifecycle.futureLabelsUsedForClassification !== false
    || config.model.outerMetricsMayChangeConfig !== false
    || config.evaluation.modelSelectionGateAdded !== false
  ) {
    throw new Error("m2_lifecycle_aware_authorization_boundary_invalid");
  }
}

function assertDatasetBoundary(manifest, baseConfig, config) {
  if (
    manifest.schema
      !== "m2.current.human_anchored.private_manifest.v0.1"
    || manifest.target !== "future_sales_share_cash"
    || manifest.dataQuality.mappingCoverage !== 1
    || manifest.dataQuality.amountConservationDifference !== 0
    || manifest.dataQuality.unmaturedLabelZeroImputationCount !== 0
    || manifest.dataQuality.buyoutCashUsed !== false
    || manifest.dataQuality.pre2021CashAmountUsed !== false
    || manifest.dataQuality.post2025CashAmountUsed !== false
    || manifest.independentLaterOriginOpened !== false
    || manifest.finalHoldoutOpened !== false
    || baseConfig.dataContract.featureAndLabelWindowStart !== "2021-01"
    || baseConfig.dataContract.featureAndLabelWindowEnd !== "2025-12"
    || config.datasetVersion
      !== "M2-human-anchored-sales-share-development-2021-2025-v0.1"
  ) {
    throw new Error("m2_lifecycle_aware_dataset_boundary_invalid");
  }
}

async function loadConfigs(root) {
  const config = JSON.parse(await readFile(
    path.join(root, CONFIG_PATH),
    "utf8"
  ));
  const baseConfig = JSON.parse(await readFile(
    path.join(root, config.baseConfig),
    "utf8"
  ));
  return { config, baseConfig };
}

function publicPopulation(value) {
  return Object.freeze({
    caseRowCount: value.caseRowCount,
    independentWorkCount: value.independentWorkCount,
    originCount: value.originCount,
    positiveTargetCaseCount: value.positiveTargetCaseCount,
    reversalTargetCaseCount: value.reversalTargetCaseCount,
    evaluationDesign: value.evaluationDesign
  });
}

function comparison(challenger, baseline) {
  return Object.freeze({
    challenger,
    baseline,
    absoluteWapeChange: challenger.wape - baseline.wape,
    relativeWape: challenger.wape / baseline.wape - 1,
    absoluteBiasChange:
      Math.abs(challenger.signedBias) - Math.abs(baseline.signedBias),
    challengerImprovedWape: challenger.wape < baseline.wape
  });
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function number(value) {
  return value === null || value === undefined
    ? "—"
    : Number(value).toFixed(8);
}

function percent(value, digits = 2) {
  return value === null || value === undefined
    ? "—"
    : `${(Number(value) * 100).toFixed(digits)}%`;
}
