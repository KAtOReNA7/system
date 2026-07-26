import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile
} from "node:fs/promises";
import path from "node:path";

import {
  buildM2HumanAnchoredTsbSyntheticDiagnostic,
  crossFitM2HumanAnchoredTsb,
  finalizeM2HumanAnchoredTsbDevelopment,
  strictRollingM2HumanAnchoredTsb
} from "../../src/domain/m2Current/humanAnchoredTsb.js";
import {
  scoreM2CurrentEvaluationRows
} from "../../src/domain/m2Current/metrics.js";

const CONFIG_PATH =
  "config/m2-current-human-anchored-tsb-occurrence.v0.1.json";

export async function runM2HumanAnchoredTsbPublicDiagnostic({
  root,
  verify
}) {
  const config = await readJson(path.join(root, CONFIG_PATH));
  validateConfig(config);
  const fixture = await readJson(path.join(root, config.syntheticFixture));
  const diagnostic = buildM2HumanAnchoredTsbSyntheticDiagnostic(
    fixture,
    config
  );
  const output = `${JSON.stringify(diagnostic, null, 2)}\n`;
  const outputPath = path.join(root, config.publicDiagnosticOutput);
  if (verify) {
    const tracked = (await readFile(outputPath, "utf8"))
      .replaceAll("\r\n", "\n");
    if (tracked !== output) {
      throw new Error(
        "m2_human_anchored_tsb_public_diagnostic_output_drift"
      );
    }
    process.stdout.write(
      "M2 human-anchored TSB public diagnostic verified.\n"
    );
    return diagnostic;
  }
  await writeFile(outputPath, output, "utf8");
  process.stdout.write(
    "M2 human-anchored TSB public diagnostic written.\n"
  );
  return diagnostic;
}

export async function runM2HumanAnchoredTsbPrivateDevelopment({
  root,
  baseConfig,
  manifest,
  primaryCases,
  auxiliaryCases,
  privateDirectory
}) {
  const config = await readJson(path.join(root, CONFIG_PATH));
  validateConfig(config);
  validatePrivateManifest(manifest, baseConfig);
  const primary = crossFitM2HumanAnchoredTsb(
    primaryCases,
    auxiliaryCases,
    baseConfig,
    config
  );
  const strict = strictRollingM2HumanAnchoredTsb(
    auxiliaryCases,
    baseConfig,
    config
  );
  const development = finalizeM2HumanAnchoredTsbDevelopment(
    primary,
    strict,
    config
  );
  const exactV03Cases = auxiliaryCases.filter(
    (row) => row.v03ExactOverlap === true
  );
  const exactV03Result = crossFitM2HumanAnchoredTsb(
    exactV03Cases,
    auxiliaryCases,
    baseConfig,
    config,
    { foldSelections: primary.folds }
  );
  const exactV03Rows = exactV03Result.rows.map((row) => ({
    ...row,
    selectedPipelinePointEstimate: development.developmentAccepted
      ? row.blendCandidatePointEstimate
      : row.learnedGlobalCommonReversalPointEstimate
  }));
  const exactV03 = scoreExactV03Overlap(
    exactV03Rows
  );
  const publicResult = buildPublicResult({
    manifest,
    config,
    development,
    exactV03
  });
  const publicJson = `${JSON.stringify(publicResult, null, 2)}\n`;
  const report = renderReport(publicResult);
  await Promise.all([
    writeFile(path.join(root, config.publicOutput), publicJson, "utf8"),
    writeFile(path.join(root, config.publicReport), report, "utf8")
  ]);
  await writePrivateEvaluation({
    privateDirectory,
    config,
    development
  });
  process.stdout.write(
    `M2 human-anchored TSB development: ${publicResult.decision}.\n`
  );
  return publicResult;
}

export async function writeM2HumanAnchoredTsbBlockedDevelopment({
  root,
  reason
}) {
  const config = await readJson(path.join(root, CONFIG_PATH));
  validateConfig(config);
  const result = {
    schema: "m2.current.human_anchored_tsb_development_public.v0.1",
    candidateId: config.candidateId,
    target: config.target,
    decision: "PRIVATE_DEVELOPMENT_BLOCKED",
    privateCapability: {
      status: "BLOCKED",
      reason: String(reason),
      privateRowsPublished: false,
      privateIdentifiersPublished: false
    },
    publicCore: {
      diagnostic: config.publicDiagnosticOutput,
      status: "AVAILABLE_PRIVATE_INDEPENDENT"
    },
    metrics: null,
    boundaries: {
      frozenV10Modified: false,
      exactV03FallbackRetained: true,
      independentLaterOriginExists: false,
      earliestPossibleIndependentOrigin: "2026-01",
      completeLabelsRequiredThrough: "2029-01",
      originalFrozenV10StateRequired: true,
      finalHoldoutOpened: false,
      currentDecision: "CANARY_FAIL",
      automationDecision: "AUTOMATION_BLOCKED",
      releaseAuthorized: false
    }
  };
  await Promise.all([
    writeFile(
      path.join(root, config.publicOutput),
      `${JSON.stringify(result, null, 2)}\n`,
      "utf8"
    ),
    writeFile(
      path.join(root, config.publicReport),
      renderBlockedReport(result),
      "utf8"
    )
  ]);
  process.stdout.write(
    "M2 human-anchored TSB private development BLOCKED.\n"
  );
  return result;
}

function buildPublicResult({
  manifest,
  config,
  development,
  exactV03
}) {
  const primary = development.primary;
  const strict = development.strictAuxiliary;
  return {
    schema: "m2.current.human_anchored_tsb_development_public.v0.1",
    candidateId: config.candidateId,
    target: config.target,
    role: "one_variable_local_development_challenger_only",
    authorization: config.authorization,
    preregistration: {
      file: config.preregistration,
      baseCommit: "e75a327f2133afac32a6e6dcbac8e86c9a2ad781",
      metricsReadBeforePreregistration: false,
      parameterGridFrozen: true,
      outerMetricsChangedGridOrFormula: false
    },
    population: {
      authorityWorkCount: manifest.authorityWorkCount,
      modernWindowWorkWithFactCount:
        manifest.modernWindowWorkWithFactCount,
      modernWindowFactRowCount: manifest.modernWindowFactRowCount,
      primaryIndependentWorkCount:
        manifest.primary.independentWorkCount,
      primaryCaseCount: manifest.primary.caseRowCount,
      auxiliaryIndependentWorkCount:
        manifest.auxiliary.independentWorkCount,
      auxiliaryCaseCount: manifest.auxiliary.caseRowCount
    },
    dataQuality: {
      mappingCoverage: manifest.dataQuality.mappingCoverage,
      amountConservationDifference:
        manifest.dataQuality.amountConservationDifference,
      signedCashSeparatedBeforeAggregation:
        manifest.dataQuality.signedCashSeparatedBeforeAggregation,
      unmaturedLabelZeroImputationCount:
        manifest.dataQuality.unmaturedLabelZeroImputationCount,
      buyoutCashUsed: manifest.dataQuality.buyoutCashUsed,
      pre2021CashAmountUsed:
        manifest.dataQuality.pre2021CashAmountUsed,
      post2025CashAmountUsed:
        manifest.dataQuality.post2025CashAmountUsed,
      observedZeroMonthsIncluded: true,
      unobservedMonthsZeroFilled: false
    },
    modelContract: {
      learnedGlobalHumanFormulaFrozen: true,
      learnedGlobalParameterSpaceFrozen: true,
      fourExpertLayerEnabled: false,
      hierarchyLayerEnabled: false,
      canonicalTsbHelperReused: true,
      occurrenceUpdatedOnEveryObservedMonth: true,
      positiveAmountUpdatedOnlyOnPositiveCash: true,
      reversalsSeparatedAndCommonAcrossComparatorAndCandidate: true,
      lambdaZeroFallbackRecoverable: true,
      parameterSpace: config.parameterSpace
    },
    primary: {
      design: primary.design,
      independentLaterOrigin: false,
      foldCount: primary.folds.length,
      parameterSelectionDistribution:
        selectionDistribution(primary.folds),
      preFallbackMetrics: primary.preFallbackMetrics,
      selectedPipelineMetrics: primary.selectedPipelineMetrics,
      bootstrap: primary.bootstrap
    },
    strictAuxiliary: {
      design: strict.design,
      independentLaterOrigin: false,
      selectionCount: strict.selections.length,
      parameterSelectionDistribution:
        selectionDistribution(strict.selections),
      preFallbackMetrics: strict.preFallbackMetrics,
      selectedPipelineMetrics: strict.selectedPipelineMetrics,
      timeBlockAudit: strict.timeBlockAudit
    },
    exactV03Overlap: exactV03,
    gates: development.gates,
    developmentAccepted: development.developmentAccepted,
    decision: development.decision,
    fvaSemantics: development.fvaSemantics,
    failureAttribution: development.developmentAccepted
      ? null
      : buildFailureAttribution(development),
    privateCapability: {
      status: "EXECUTED_AUTHENTICATED_LOCAL_DEVELOPMENT",
      privateRowsPublished: false,
      workIdentifiersPublished: false,
      channelIdentifiersPublished: false,
      privateDigestValuesPublished: false
    },
    boundaries: {
      ...development.boundaries,
      frozenV10Modified: false,
      v10ResultUsedToTuneCandidate: false,
      prohibited202301Through202304BlockOpened: false,
      finalHoldoutOpened: false,
      providerUsed: false,
      databaseRead: false,
      canaryAuthorized: false,
      full160Authorized: false,
      codeMergeEqualsModelRelease: false
    }
  };
}

function buildFailureAttribution(development) {
  const metrics = development.primary.preFallbackMetrics;
  return {
    allowedScopeOnly: true,
    occurrence: metrics.component.occurrence,
    positiveAmount: metrics.component.positiveAmountConditional,
    reversal: metrics.component.reversal,
    lifecycle: metrics.bySegment,
    dataCoverage: {
      workCaseCount: metrics.point.caseCount,
      originCount:
        metrics.resolutions.portfolioOrigin.groupCount,
      originHorizonCellCount:
        metrics.resolutions.portfolioOriginHorizon
          .groupCount
    },
    secondCandidateDeveloped: false,
    parameterGridExpanded: false,
    alternativeModelFamilyOpened: false
  };
}

function scoreExactV03Overlap(rows) {
  const overlap = rows.filter(
    (row) => row.v03ExactOverlap === true
      && Number.isFinite(Number(row.v03PointEstimate))
  );
  if (overlap.length === 0) {
    return {
      caseCount: 0,
      available: false,
      design: "same_work_fold_selection_reused_without_outer_metric_tuning",
      selectedPipeline: null,
      blendCandidate: null,
      rawTsbCandidate: null,
      learnedGlobalCommonReversal: null,
      exactV03: null,
      relativeWapeToExactV03: null
    };
  }
  const selected = scoreField(
    overlap,
    "selectedPipelinePointEstimate"
  );
  const blend = scoreField(overlap, "blendCandidatePointEstimate");
  const rawTsb = scoreField(overlap, "rawTsbPointEstimate");
  const learnedGlobalCommonReversal = scoreField(
    overlap,
    "learnedGlobalCommonReversalPointEstimate"
  );
  const v03 = scoreField(overlap, "v03PointEstimate");
  return {
    caseCount: overlap.length,
    available: true,
    design: "same_work_fold_selection_reused_without_outer_metric_tuning",
    selectedPipeline: selected,
    blendCandidate: blend,
    rawTsbCandidate: rawTsb,
    learnedGlobalCommonReversal,
    exactV03: v03,
    relativeWapeToExactV03: blend.wape / v03.wape - 1
  };
}

function scoreField(rows, field) {
  return scoreM2CurrentEvaluationRows(rows.map((row) => ({
    actual: row.actual,
    pointEstimate: Number(row[field])
  })));
}

function selectionDistribution(values) {
  const counts = {};
  const statuses = {};
  for (const value of values) {
    const status = String(value.selectionStatus ?? value.status);
    statuses[status] = (statuses[status] ?? 0) + 1;
    if (!value.parameters) continue;
    const key = [
      `occurrence=${value.parameters.occurrenceSmoothing}`,
      `positive=${value.parameters.positiveAmountSmoothing}`,
      `lambda=${value.parameters.lambda}`
    ].join(",");
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return {
    choices: Object.fromEntries(
      Object.entries(counts).sort(([left], [right]) => (
        left.localeCompare(right)
      ))
    ),
    statuses: Object.fromEntries(
      Object.entries(statuses).sort(([left], [right]) => (
        left.localeCompare(right)
      ))
    )
  };
}

async function writePrivateEvaluation({
  privateDirectory,
  config,
  development
}) {
  const rows = [
    ...development.primary.rows.map(
      (row) => compactPrivateRow(row, "primary_36_month")
    ),
    ...development.strictAuxiliary.rows.map(
      (row) => compactPrivateRow(row, "strict_auxiliary")
    )
  ];
  const text = rows.map((row) => JSON.stringify(row)).join("\n") + "\n";
  const manifest = {
    schema:
      "m2.current.human_anchored_tsb.private_evaluation_manifest.v0.1",
    tracked: false,
    candidateId: config.candidateId,
    rowCount: rows.length,
    sha256: createHash("sha256").update(text).digest("hex"),
    publicDecision: development.decision
  };
  await mkdir(privateDirectory, { recursive: true });
  await Promise.all([
    writeFile(
      path.join(privateDirectory, config.privateOutputs.evaluation),
      text,
      "utf8"
    ),
    writeFile(
      path.join(
        privateDirectory,
        config.privateOutputs.evaluationManifest
      ),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8"
    )
  ]);
}

function compactPrivateRow(row, evaluationFamily) {
  return {
    evaluationFamily,
    standardWorkId: row.standardWorkId,
    origin: row.origin,
    horizonMonths: row.horizonMonths,
    actualPositive: row.actualPositive,
    actualReversal: row.actualReversal,
    actual: row.actual,
    segment: row.segment,
    dominantRevenueMode: row.dominantRevenueMode,
    secondLevelCategoryReportingOnly:
      row.secondLevelCategoryReportingOnly,
    manualFaithfulPointEstimate: row.manualFaithfulPointEstimate,
    learnedGlobalPointEstimate: row.learnedGlobalPointEstimate,
    learnedGlobalCommonReversalPointEstimate:
      row.learnedGlobalCommonReversalPointEstimate,
    independentTsbBaselinePointEstimate:
      row.independentTsbBaselinePointEstimate,
    rawTsbPointEstimate: row.rawTsbPointEstimate,
    blendCandidatePointEstimate: row.blendCandidatePointEstimate,
    selectedPipelinePointEstimate:
      row.selectedPipelinePointEstimate,
    occurrenceProbability: row.occurrenceProbability,
    reversalRate: row.reversalRate,
    selectedTsbParameters: row.selectedTsbParameters,
    selectedPipelineLayer: row.selectedPipelineLayer,
    outerOrigin: row.outerOrigin ?? null,
    trainingReadOwnWork: row.trainingReadOwnWork ?? null,
    sameOrLaterOuterTruthRead:
      row.sameOrLaterOuterTruthRead ?? null
  };
}

function renderReport(result) {
  const primary = result.primary.preFallbackMetrics;
  const selected = result.primary.selectedPipelineMetrics;
  const rawFva = primary.fva.rawTsbCandidate;
  const blendFva = primary.fva.blendCandidate;
  const selectedFva = selected.fva.selectedPipeline;
  const gateRows = Object.entries(result.gates).map(
    ([gate, passed]) => `| ${gate} | ${passed ? "PASS" : "FAIL"} |`
  ).join("\n");
  return `# M2 learnedGlobal + TSB occurrence development v0.1

## 结论

- 候选：\`${result.candidateId}\`
- development 决策：\`${result.decision}\`
- 该结果不是独立 later-origin 验证，不得替换 exact v0.3。
- exact v0.3、\`CANARY_FAIL\`、\`AUTOMATION_BLOCKED\` 与 release 封印保持不变。

## 单变量合同

冻结 learnedGlobal 人工公式及原参数空间，关闭四专家与 hierarchy 层。唯一新增量是
canonical TSB 的逐月发生概率和正向金额过程；零发生月更新概率，正向金额只在
正向分成现金发生时更新。冲销在 comparator 与 candidate 间使用同一训练折状态。

## 主要指标

| 视图 | WAPE | bias | MAE | business loss |
|---|---:|---:|---:|---:|
| pre-fallback blend | ${number(primary.point.wape)} | ${number(primary.point.signedBias)} | ${number(primary.point.mae)} | ${number(primary.businessLoss)} |
| selected pipeline | ${number(selected.point.wape)} | ${number(selected.point.signedBias)} | ${number(selected.point.mae)} | ${number(selected.businessLoss)} |
| learnedGlobal + common reversal | ${number(primary.comparators.learnedGlobalCommonReversal.wape)} | ${number(primary.comparators.learnedGlobalCommonReversal.signedBias)} | ${number(primary.comparators.learnedGlobalCommonReversal.mae)} | — |

## FVA 语义

| 层 | absolute WAPE FVA | relative WAPE |
|---|---:|---:|
| raw TSB candidate | ${number(rawFva.valueAdded)} | ${percent(rawFva.relativeWape)} |
| pre-fallback blend candidate | ${number(blendFva.valueAdded)} | ${percent(blendFva.relativeWape)} |
| selected pipeline | ${number(selectedFva.valueAdded)} | ${percent(selectedFva.relativeWape)} |

候选被拒绝时 selected pipeline 会恢复 \`lambda=0\`，因此 selected FVA 可以为 0；
raw/blend FVA 始终保留回退前真实变化，不能用 selected FVA 冒充候选无变化。

## 预注册门禁

| 门禁 | 结果 |
|---|---|
${gateRows}

## 时间与权限边界

- 相邻 calendar origin 只算一个时间证据块；作品数和 case 数不能替代时间块数。
- 2023-01 至 2023-04 连续 later-origin 块未打开、未拆分。
- 最早可能独立 origin 仍为 2026-01，需要完整标签到 2029-01，并恢复原始 frozen v1 state。
- provider、数据库、final holdout、Canary/full160、release 与 M3 formal 均未授权。
`;
}

function renderBlockedReport(result) {
  return `# M2 learnedGlobal + TSB occurrence development v0.1

受控 private capability 未通过，因此 private development 标记为
\`${result.decision}\`。公开 core、synthetic fixture、公共诊断和预注册仍可独立运行；
没有伪造账单、作品、模型状态或指标。

exact v0.3、\`CANARY_FAIL\`、\`AUTOMATION_BLOCKED\`、later-origin 与 final holdout
边界保持不变。
`;
}

function validateConfig(config) {
  if (
    config?.schema
      !== "m2.current.human_anchored_tsb_occurrence_development.v0.1"
    || config.candidateId
      !== "M2-current-human-anchored-tsb-occurrence-challenger-v0.1"
    || config.target !== "future_sales_share_cash"
    || config.authorization?.oneCandidateOnly !== true
    || config.authorization?.v10Retuning !== false
    || config.authorization?.independentLaterOrigin !== false
    || config.authorization?.finalHoldout !== false
    || config.authorization?.provider !== false
    || config.authorization?.database !== false
    || config.authorization?.release !== false
  ) {
    throw new Error("m2_human_anchored_tsb_config_invalid");
  }
}

function validatePrivateManifest(manifest, baseConfig) {
  if (
    manifest?.schema
      !== "m2.current.human_anchored.private_manifest.v0.1"
    || manifest.candidateId !== baseConfig.candidateId
    || manifest.target !== "future_sales_share_cash"
    || manifest.dataQuality?.mappingCoverage !== 1
    || Number(manifest.dataQuality?.amountConservationDifference) !== 0
    || manifest.dataQuality?.unmaturedLabelZeroImputationCount !== 0
    || manifest.dataQuality?.buyoutCashUsed !== false
    || manifest.independentLaterOriginOpened !== false
    || manifest.finalHoldoutOpened !== false
    || manifest.providerUsed !== false
    || manifest.databaseRead !== false
  ) {
    throw new Error(
      "m2_human_anchored_tsb_private_manifest_invalid"
    );
  }
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function number(value) {
  return Number(value).toFixed(8);
}

function percent(value) {
  return `${(Number(value) * 100).toFixed(4)}%`;
}
