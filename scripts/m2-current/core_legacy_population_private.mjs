import crypto from "node:crypto";
import fs from "node:fs";
import {
  mkdir,
  readFile,
  stat,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { spawnSync } from "node:child_process";

import {
  buildCoreLegacyOriginPopulation,
  validateM2CoreLegacyPopulationConfig
} from "../../src/domain/m2Current/coreLegacyPopulation.js";
import {
  materializeM2CoreRevenueAuthority
} from "./core_revenue_manual_private.mjs";

const CONFIG_PATH =
  "config/m2-current-core-legacy-population.v0.1.json";
const HUMAN_HISTORIES =
  "data/private-output/m2-current-human-anchored/"
  + "M2-current-human-anchored-histories-private-v0.1.ndjson";
const HUMAN_EVALUATION =
  "data/private-output/m2-current-human-anchored/"
  + "M2-current-human-anchored-evaluation-private-v0.1.ndjson";

export async function runM2CoreLegacyPopulationK0Audit({ root }) {
  const config = await readJson(path.join(root, CONFIG_PATH));
  validateM2CoreLegacyPopulationConfig(config);
  const privateDirectory = path.join(
    root,
    config.privateOutputs.directory
  );
  await mkdir(privateDirectory, { recursive: true });
  const authority = await materializeM2CoreRevenueAuthority({ root });
  const histories = [];
  await forEachNdjson(path.join(root, HUMAN_HISTORIES), (row) => {
    histories.push(row);
  });
  const evaluations = [];
  await forEachNdjson(path.join(root, HUMAN_EVALUATION), (row) => {
    if (["primary", "strict_auxiliary"].includes(row.evaluationFamily)) {
      evaluations.push(row);
    }
  });
  const origins = [...new Set([
    ...histories.map((row) => row.origin),
    ...evaluations.map((row) => row.origin)
  ])].sort();
  const populations = new Map();
  for (const origin of origins) {
    const result = buildCoreLegacyOriginPopulation({
      origin,
      monthlyRows: authority.featureMonthlyRowsForOrigin(origin),
      minimumCompleteMonths: config.eligibility.minimumCompleteMonths,
      thresholds: config.coreSelection.thresholds,
      topCounts: config.coreSelection.topDiagnostics
    });
    populations.set(origin, result);
  }
  const assignments = buildAssignments(populations);
  const audit = buildTrainingAudit({
    config,
    authority,
    histories,
    evaluations,
    populations,
    assignments
  });
  const populationPath = path.join(
    privateDirectory,
    config.privateOutputs.populationRows
  );
  await writeNdjson(populationPath, buildPrivatePopulationRows(populations));
  const manifestPath = path.join(
    privateDirectory,
    config.privateOutputs.manifest
  );
  const receiptPath = path.join(
    privateDirectory,
    config.privateOutputs.receipt
  );
  const executionHead = git(root, ["rev-parse", "HEAD"]);
  await writeFile(manifestPath, `${JSON.stringify({
    schema: "m2.current.core_legacy_population.manifest.private.v0.1",
    status: "VALID_K0_AUDIT_COMPLETE",
    experimentId: config.experiment.stableExperimentId,
    actualDefinitionId: config.target.actualDefinitionId,
    executionHeadAtAudit: executionHead,
    sourceAuthority: {
      rowCount: authority.authority.rowCount,
      workCount: authority.authority.workCount,
      channelCount: authority.authority.channelCount,
      reversalRowCount: authority.authority.reversalRowCount
    },
    counts: {
      auditedOriginCount: origins.length,
      humanHistoryRowCount: histories.length,
      frozenEvaluationRowCount: evaluations.length,
      populationRowCount: [...populations.values()].reduce(
        (sum, item) => sum + item.eligiblePairs.length,
        0
      )
    },
    outputBindings: {
      populationRows: await fileBinding(populationPath)
    },
    privateIdentityPublished: false
  }, null, 2)}\n`, "utf8");
  await writeFile(receiptPath, `${JSON.stringify({
    schema: "m2.current.core_legacy_population.run_receipt.private.v0.1",
    stage: "K0_SCOPE_GOVERNANCE_AND_TRAINING_SEMANTICS_AUDIT",
    status: "VALID_K0_AUDIT_COMPLETE",
    executionHeadAtAudit: executionHead,
    command: "npm run prepare:m2:current:core-legacy-population",
    modelTrainingPerformed: false,
    modelParametersChanged: false,
    frozenPredictionModified: false,
    laterOriginRead: false,
    finalHoldoutRead: false,
    productionChanged: false,
    manifestSha256: await sha256File(manifestPath)
  }, null, 2)}\n`, "utf8");
  await writePublicK0Outputs({ root, config, audit });
  return audit;
}

function buildAssignments(populations) {
  const output = new Map();
  for (const [origin, population] of populations) {
    const core80 = new Set(
      population.selection.populations.CORE80 ?? []
    );
    const core90 = new Set(
      population.selection.populations.CORE90 ?? []
    );
    const ranks = new Map(population.selection.ranked.map((row) => [
      row.standardWorkId,
      row
    ]));
    const eligibleWorks = new Set(
      population.eligiblePairs.map((row) => row.standardWorkId)
    );
    const allWorks = new Set([
      ...eligibleWorks,
      ...ranks.keys()
    ]);
    for (const standardWorkId of allWorks) {
      const group = !eligibleWorks.has(standardWorkId)
        ? "INELIGIBLE_AT_ORIGIN"
        : core80.has(standardWorkId)
          ? "CORE80"
          : core90.has(standardWorkId)
            ? "CORE80_TO_CORE90"
            : "OUTSIDE_CORE90";
      output.set(`${origin}\u0000${standardWorkId}`, {
        group,
        revenueDecile: ranks.get(standardWorkId)?.revenueDecile ?? null
      });
    }
  }
  return output;
}

function buildTrainingAudit({
  config,
  authority,
  histories,
  evaluations,
  populations,
  assignments
}) {
  const historyByKey = new Map(histories.map((row) => [
    `${row.origin}\u0000${row.standardWorkId}`,
    row
  ]));
  const enrichedEvaluations = evaluations.map((row) => {
    const assignment = assignments.get(
      `${row.origin}\u0000${row.standardWorkId}`
    ) ?? {
      group: "INELIGIBLE_AT_ORIGIN",
      revenueDecile: null
    };
    const point = Number(row.learnedGlobalPointEstimate);
    const actual = Number(row.actual);
    const actualPositive = Number(row.actualPositive);
    return {
      ...assignment,
      standardWorkId: String(row.standardWorkId),
      origin: row.origin,
      evaluationFamily: row.evaluationFamily,
      actual,
      actualPositive,
      point,
      trainingLoss: actualPositive > 0
        ? Math.abs(point - actualPositive)
        : 0,
      absoluteError: Math.abs(point - actual),
      falsePositiveError:
        actual === 0 && point > 0 ? point : 0
    };
  });
  const enrichedHistories = histories.map((row) => {
    const assignment = assignments.get(
      `${row.origin}\u0000${row.standardWorkId}`
    ) ?? {
      group: "INELIGIBLE_AT_ORIGIN",
      revenueDecile: null
    };
    const positive = row.salesShareMonthlyHistory.positiveSeries.map(Number);
    const reversal = row.salesShareMonthlyHistory.reversalSeries.map(Number);
    const net = positive.map((value, index) => (
      value - (reversal[index] ?? 0)
    ));
    const mean = average(net);
    const deviation = standardDeviation(net);
    return {
      ...assignment,
      standardWorkId: String(row.standardWorkId),
      origin: row.origin,
      segment: row.segment,
      monthCount: net.length,
      positiveMonthCount: positive.filter((value) => value > 0).length,
      zeroMonthCount: positive.filter((value) => value === 0).length,
      netCash: sum(net),
      coefficientOfVariation:
        Math.abs(mean) > 1e-12 ? deviation / Math.abs(mean) : null
    };
  });
  const pairRows = [...populations.values()].flatMap(
    (population) => population.eligiblePairs.map((row) => ({
      origin: row.origin,
      standardWorkId: row.standardWorkId,
      channelUid: row.channelUid,
      group: row.core80
        ? "CORE80"
        : row.core90
          ? "CORE80_TO_CORE90"
          : "OUTSIDE_CORE90"
    }))
  );
  const groupOrder = [
    "CORE80",
    "CORE80_TO_CORE90",
    "OUTSIDE_CORE90",
    "INELIGIBLE_AT_ORIGIN"
  ];
  const groupAudit = Object.fromEntries(groupOrder.map((group) => [
    group,
    aggregateAuditGroup({
      evaluationRows: enrichedEvaluations.filter(
        (row) => row.group === group
      ),
      historyRows: enrichedHistories.filter(
        (row) => row.group === group
      ),
      pairRows: pairRows.filter((row) => row.group === group),
      evaluationDenominator: enrichedEvaluations,
      historyDenominator: enrichedHistories
    })
  ]));
  const deciles = Object.fromEntries(
    Array.from({ length: 10 }, (_, index) => index + 1).map((decile) => [
      String(decile),
      aggregateAuditGroup({
        evaluationRows: enrichedEvaluations.filter(
          (row) => row.revenueDecile === decile
        ),
        historyRows: enrichedHistories.filter(
          (row) => row.revenueDecile === decile
        ),
        pairRows: [],
        evaluationDenominator: enrichedEvaluations,
        historyDenominator: enrichedHistories
      })
    ])
  );
  const populationSummaries = [...populations.values()].map((item) => ({
    core80WorkCount:
      item.selection.populations.CORE80?.length ?? 0,
    core90WorkCount:
      item.selection.populations.CORE90?.length ?? 0,
    eligibleWorkCount: item.eligibleWorkCount,
    eligiblePairCount: item.eligiblePairCount,
    immatureObservedPairCount: item.immatureObservedPairs.length,
    core80ReferenceCapture:
      item.selection.populationDiagnostics.CORE80
        ?.referenceRevenueCapture ?? null,
    core90ReferenceCapture:
      item.selection.populationDiagnostics.CORE90
        ?.referenceRevenueCapture ?? null
  }));
  return {
    schema:
      "m2.current.core_legacy_population.training_semantics_audit.public.v0.1",
    asOf: config.asOf,
    experiment: config.experiment,
    status: "K0_SCOPE_GOVERNANCE_AND_TRAINING_SEMANTICS_AUDIT_COMPLETE",
    scope: {
      currentM2Target:
        "core_legacy_work_origin_observed_mature_channel_future_sales_share_cash",
      predictionGrain: config.target.predictionGrain,
      actualDefinitionId: config.target.actualDefinitionId,
      minimumCompleteMonths:
        config.eligibility.minimumCompleteMonths,
      tailPoolAllowed: false,
      futureNewWorkIncluded: false,
      futureFirstChannelIncluded: false,
      companyTotalTarget: false,
      buyoutIncluded: false
    },
    implementationAudit: modelImplementationAudit(),
    sourcePopulationAudit: {
      sourceModelId: "M2-WORK-LG01",
      sourceModelNameZh: "人工锚定可学习全局模型",
      sourceModelNameEn: "Human-Anchored Learned Global",
      semantics:
        "audit_of_frozen_historical_training_and_evaluation_rows_before_scope_correction",
      evaluationRowCount: enrichedEvaluations.length,
      historyRowCount: enrichedHistories.length,
      originCount: populations.size,
      groupAudit,
      revenueDeciles: deciles
    },
    dynamicCore: {
      originCount: populationSummaries.length,
      meanCore80WorkCount: average(
        populationSummaries.map((row) => row.core80WorkCount)
      ),
      meanCore90WorkCount: average(
        populationSummaries.map((row) => row.core90WorkCount)
      ),
      meanEligibleWorkCount: average(
        populationSummaries.map((row) => row.eligibleWorkCount)
      ),
      meanEligiblePairCount: average(
        populationSummaries.map((row) => row.eligiblePairCount)
      ),
      meanImmatureObservedPairCount: average(
        populationSummaries.map(
          (row) => row.immatureObservedPairCount
        )
      ),
      meanCore80ReferenceCapture: averageNonNull(
        populationSummaries.map(
          (row) => row.core80ReferenceCapture
        )
      ),
      meanCore90ReferenceCapture: averageNonNull(
        populationSummaries.map(
          (row) => row.core90ReferenceCapture
        )
      )
    },
    authority: {
      sourceAuthorityAvailable: true,
      salesShareRowCount: authority.authority.rowCount,
      workCount: authority.authority.workCount,
      channelCount: authority.authority.channelCount,
      reversalRowCount: authority.authority.reversalRowCount,
      originalReversalRowsDeleted: 0,
      actualDefinitionId: config.target.actualDefinitionId
    },
    finding: {
      existingLearnedGlobalTrainingUsesAllAvailableWorks: true,
      nativeRevenueSampleWeightsSupported: false,
      tailCanDominateCaseCount: (
        groupAudit.OUTSIDE_CORE90.trainingRowShare
        > groupAudit.OUTSIDE_CORE90.actualMagnitudeShare
      ),
      k2RequiredToTestCausality: true
    },
    privacy: {
      privateRowIdentityIncluded: false,
      privatePathIncluded: false,
      aggregateOnly: true
    },
    boundaries: {
      modelTrainingPerformed: false,
      modelParametersChanged: false,
      frozenPredictionsModified: false,
      productionChanged: false,
      laterOriginRead: false,
      finalHoldoutRead: false,
      portfolioModelRankedAgainstWorkModels: false
    }
  };
}

function aggregateAuditGroup({
  evaluationRows,
  historyRows,
  pairRows,
  evaluationDenominator,
  historyDenominator
}) {
  const totalActualMagnitude = sum(
    evaluationDenominator.map((row) => Math.abs(row.actual))
  );
  const totalTrainingLoss = sum(
    evaluationDenominator.map((row) => row.trainingLoss)
  );
  const totalAbsoluteError = sum(
    evaluationDenominator.map((row) => row.absoluteError)
  );
  const totalFalsePositive = sum(
    evaluationDenominator.map((row) => row.falsePositiveError)
  );
  const totalMonths = sum(
    historyDenominator.map((row) => row.monthCount)
  );
  return {
    trainingRowCount: evaluationRows.length,
    trainingRowShare: ratio(
      evaluationRows.length,
      evaluationDenominator.length
    ),
    independentWorkCount: new Set(
      evaluationRows.map((row) => row.standardWorkId)
    ).size,
    workChannelPairCount: pairRows.length,
    distinctWorkChannelOriginCount: new Set(pairRows.map(
      (row) => `${row.origin}|${row.standardWorkId}|${row.channelUid}`
    )).size,
    actualMagnitudeShare: ratio(
      sum(evaluationRows.map((row) => Math.abs(row.actual))),
      totalActualMagnitude
    ),
    positiveTargetRowShare: ratio(
      evaluationRows.filter((row) => row.actualPositive > 0).length,
      evaluationRows.length
    ),
    zeroTargetRowShare: ratio(
      evaluationRows.filter((row) => row.actual === 0).length,
      evaluationRows.length
    ),
    positiveMonthShare: ratio(
      sum(historyRows.map((row) => row.positiveMonthCount)),
      sum(historyRows.map((row) => row.monthCount))
    ),
    zeroMonthShare: ratio(
      sum(historyRows.map((row) => row.zeroMonthCount)),
      sum(historyRows.map((row) => row.monthCount))
    ),
    positiveMonthContribution: ratio(
      sum(historyRows.map((row) => row.positiveMonthCount)),
      totalMonths
    ),
    zeroMonthContribution: ratio(
      sum(historyRows.map((row) => row.zeroMonthCount)),
      totalMonths
    ),
    intermittentOrDormantHistoryShare: ratio(
      historyRows.filter(
        (row) => ["intermittent", "dormant"].includes(row.segment)
      ).length,
      historyRows.length
    ),
    medianMonthlyCoefficientOfVariation: median(
      historyRows.map((row) => row.coefficientOfVariation)
        .filter((value) => value !== null)
    ),
    trainingLossContribution: ratio(
      sum(evaluationRows.map((row) => row.trainingLoss)),
      totalTrainingLoss
    ),
    absoluteErrorContribution: ratio(
      sum(evaluationRows.map((row) => row.absoluteError)),
      totalAbsoluteError
    ),
    zeroActualFalsePositiveErrorContribution: ratio(
      sum(evaluationRows.map((row) => row.falsePositiveError)),
      totalFalsePositive
    )
  };
}

function modelImplementationAudit() {
  return [
    {
      modelId: "M2-WORK-OA03",
      displayNameZh: "作品发生—金额校准模型 v0.3",
      displayNameEn: "Occurrence-Amount Calibration v0.3",
      trulyTrained: true,
      targetAtHistoricalFit:
        "future_work_level_sales_share_cash_on_historical_population",
      loss: "WAPE_and_bias_gated_factor_selection",
      weighting: "case_rows_with_amount_denominator_implicit_revenue_weight",
      zeroMonths: "retained_for_occurrence_and_amount_error",
      occurrenceAndAmountSeparated: true,
      allWorksUsed: true,
      explicitRevenueSampleWeights: false,
      fallbackCanMaskRawCandidate: true,
      deterministicFrozenPredictionRebuild:
        "WORK_TOTAL_ONLY_CHANNEL_DECOMPOSITION_UNAVAILABLE",
      sourceRefs: [
        "scripts/m2-current/run_m2_current_candidate.mjs",
        "src/domain/m2Current/candidate.js"
      ]
    },
    {
      modelId: "M2-WORK-LG01",
      displayNameZh: "人工锚定可学习全局模型",
      displayNameEn: "Human-Anchored Learned Global",
      trulyTrained: true,
      targetAtHistoricalFit:
        "positive_sales_share_cash_with_net_evaluation",
      loss: "positive_row_WAPE_plus_absolute_bias_and_prior_distance",
      weighting: "each_training_case_contributes_absolute_error_no_native_sample_weight",
      zeroMonths: "dense_zero_months_retained_in_origin_visible_history",
      occurrenceAndAmountSeparated: false,
      allWorksUsed: true,
      explicitRevenueSampleWeights: false,
      fallbackCanMaskRawCandidate: true,
      deterministicFrozenPredictionRebuild:
        "AVAILABLE_FROM_FROZEN_ROWS_AND_FOLD_PARAMETERS",
      sourceRefs: [
        "src/domain/m2Current/humanAnchored.js",
        "scripts/m2-current/run_m2_human_anchored_development.mjs"
      ]
    },
    {
      modelId: "M2-WORK-CRMR01",
      displayNameZh: "核心收入人工规则基线 v0.1",
      displayNameEn: "Core-Revenue Manual Rule Baseline v0.1",
      trulyTrained: false,
      targetAtHistoricalFit:
        "development_modelable_sales_share_cash",
      loss: "none_fixed_formula",
      weighting: "not_applicable",
      zeroMonths: "structural_zero_after_first_positive",
      occurrenceAndAmountSeparated: false,
      allWorksUsed: false,
      explicitRevenueSampleWeights: false,
      fallbackCanMaskRawCandidate: false,
      deterministicFrozenPredictionRebuild:
        "AVAILABLE_FROM_FROZEN_FORMULA_AND_AUTHORITY",
      sourceRefs: [
        "src/domain/m2Current/coreRevenueManual.js",
        "scripts/m2-current/core_revenue_manual_private.mjs"
      ]
    },
    {
      modelId: "M2-WORK-TSB01",
      displayNameZh: "人工锚定 TSB 发生模型",
      displayNameEn: "Human-Anchored TSB Occurrence",
      trulyTrained: true,
      targetAtHistoricalFit:
        "historical_work_level_sales_share_cash",
      loss: "nested_occurrence_and_point_error",
      weighting: "case_level_without_native_revenue_sample_weight",
      zeroMonths: "retained_for_occurrence",
      occurrenceAndAmountSeparated: true,
      allWorksUsed: true,
      explicitRevenueSampleWeights: false,
      fallbackCanMaskRawCandidate: true,
      deterministicFrozenPredictionRebuild: "FROZEN_ROWS_IDENTIFIABLE",
      sourceRefs: [
        "src/domain/m2Current/humanAnchoredTsb.js"
      ]
    },
    {
      modelId: "M2-WORK-LC01",
      displayNameZh: "生命周期感知挑战模型 v0.1",
      displayNameEn: "Lifecycle-Aware Challenger v0.1",
      trulyTrained: true,
      targetAtHistoricalFit:
        "historical_work_level_sales_share_cash",
      loss: "occurrence_and_log_amount_outer_development_score",
      weighting: "case_level_without_native_revenue_sample_weight",
      zeroMonths: "retained_for_occurrence",
      occurrenceAndAmountSeparated: true,
      allWorksUsed: true,
      explicitRevenueSampleWeights: false,
      fallbackCanMaskRawCandidate: true,
      deterministicFrozenPredictionRebuild: "FROZEN_ROWS_IDENTIFIABLE",
      sourceRefs: [
        "src/domain/m2Current/lifecycleAware.js"
      ]
    }
  ];
}

function buildPrivatePopulationRows(populations) {
  return [...populations.values()].flatMap((population) => (
    population.eligiblePairs.map((row) => ({
      rowType: "ORIGIN_ELIGIBLE_WORK_CHANNEL",
      experimentId: "M2-EXP-CORE-LEGACY-POPULATION-01",
      origin: row.origin,
      standardWorkId: row.standardWorkId,
      channelUid: row.channelUid,
      firstPositiveMonth: row.firstPositiveMonth,
      workFirstPositiveMonth: row.workFirstPositiveMonth,
      completeMonthCount: row.completeMonthCount,
      workCompleteMonthCount: row.workCompleteMonthCount,
      core80: row.core80,
      core90: row.core90,
      top20: row.top20,
      top50: row.top50,
      referenceRank: row.referenceRank,
      revenueDecile: row.revenueDecile,
      level2Category: row.level2Category,
      level3Category: row.level3Category,
      settlementMechanism: row.settlementMechanism
    }))
  ));
}

async function writePublicK0Outputs({ root, config, audit }) {
  const jsonPath = path.join(
    root,
    config.publicOutputs.trainingAuditJson
  );
  const reportPath = path.join(
    root,
    config.publicOutputs.trainingAuditReport
  );
  await mkdir(path.dirname(jsonPath), { recursive: true });
  await writeFile(
    jsonPath,
    `${JSON.stringify(audit, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    reportPath,
    renderTrainingAudit(audit),
    "utf8"
  );
}

function renderTrainingAudit(result) {
  const groups = result.sourcePopulationAudit.groupAudit;
  const rows = Object.entries(groups).map(([id, value]) => (
    `| ${groupName(id)}（\`${id}\`） | ${value.trainingRowCount} | `
    + `${percent(value.trainingRowShare)} | ${value.independentWorkCount} | `
    + `${value.workChannelPairCount} | ${percent(value.actualMagnitudeShare)} | `
    + `${percent(value.zeroMonthShare)} | `
    + `${percent(value.trainingLossContribution)} | `
    + `${percent(value.absoluteErrorContribution)} |`
  )).join("\n");
  const models = result.implementationAudit.map((item) => (
    `| ${item.displayNameZh}（${item.displayNameEn}，\`${item.modelId}\`） | `
    + `${item.trulyTrained ? "是" : "否"} | ${item.loss} | `
    + `${item.explicitRevenueSampleWeights ? "是" : "否"} | `
    + `${item.deterministicFrozenPredictionRebuild} |`
  )).join("\n");
  return `# M2 训练人口与损失权重审计 v0.1

> 实验：M2 核心老品—已有渠道范围纠偏、冻结重评分与尾部干扰验证 v0.1（M2 Core Legacy Work–Observed Channel Scope Correction, Frozen Rescore and Tail Interference Test v0.1，\`${result.experiment.stableExperimentId}\`）
>
> 阶段状态：范围治理与训练语义审计已完成（\`${result.status}\`）。本阶段没有训练模型、修改冻结预测或读取最终留出集。

## 结论先行

当前 M2 目标已经在新合同中收敛为：预测起点时至少积累 3 个完整账单月的老作品，在同一起点时至少积累 3 个完整账单月的已有 canonical 渠道上，预测未来 3、6、12、36 个月开发可建模分成收入。

现有人工锚定可学习全局模型（Human-Anchored Learned Global，\`M2-WORK-LG01\`）的训练入口使用全部可用作品，没有原生样本权重；因此“尾部在行数上占比高于金额占比”可以被审计，但它是否造成因果性干扰仍须由预注册的固定训练人口消融验证，不能在本阶段提前下结论。

## 当前范围

- 属于 M2：动态 Core80/Core90 老作品 × 起点已有成熟渠道 × 未来分成收入。
- 不属于 M2：未来新增作品、老作品未来首次进入的新渠道、Core 外尾部、买断及其他非分成现金、公司总收入补差。
- 不足 3 个完整月的作品或渠道是“不预测/弃权”，不是“预测为 0”。
- Core80/Core90 是训练、服务和评价人口筛选器，不是公司组合分量。

## 训练人口量化

| 动态人口 | 训练/评价行 | 行占比 | 独立作品 | 作品×渠道-origin 行 | actual 绝对金额占比 | 零收入月占比 | 训练损失贡献 | 绝对误差贡献 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
${rows}

动态 Core80 平均包含 ${number(result.dynamicCore.meanCore80WorkCount)} 部作品，动态 Core90 平均包含 ${number(result.dynamicCore.meanCore90WorkCount)} 部作品。参考窗平均覆盖率分别为 ${percent(result.dynamicCore.meanCore80ReferenceCapture)} 与 ${percent(result.dynamicCore.meanCore90ReferenceCapture)}。这些是起点可见参考窗覆盖，不是未来收入覆盖；未来正确分母覆盖率将在冻结重评分阶段单独计算。

## 现有作品模型训练语义

| 模型 | 真正训练 | 目标/损失 | 原生收入样本权重 | 冻结预测可重建性 |
|---|---|---|---|---|
${models}

## 边界与解释

- 本表审计的是既有冻结训练/评价行的历史语义，未把历史 actual 改写成当前合同。
- 三级分类只用于报告诊断，没有进入 Core 资格或金额倍率。
- 分层收入组合模型 v0.1（Layered Revenue Composition Model v0.1，\`M2-PORT-LRC01\`）属于当前 M2 范围外组合研究（\`OUT_OF_CURRENT_M2_SCOPE_PORTFOLIO_RESEARCH\`），不得进入作品模型排名。
- 下一阶段只对可合法获得的冻结作品预测按正确人口重评分；无法重建的模型/粒度会明确标记不可比较（\`NOT_COMPARABLE\`），不会阻断其他模型。
`;
}

function groupName(id) {
  return ({
    CORE80: "动态 Core80",
    CORE80_TO_CORE90: "动态 Core80 至 Core90",
    OUTSIDE_CORE90: "动态 Core90 以外尾部",
    INELIGIBLE_AT_ORIGIN: "起点不满足成熟资格"
  })[id] ?? id;
}

async function writeNdjson(filePath, rows) {
  const stream = fs.createWriteStream(filePath, {
    encoding: "utf8",
    flags: "w"
  });
  for (const row of rows) {
    if (!stream.write(`${JSON.stringify(row)}\n`)) {
      await new Promise((resolve) => stream.once("drain", resolve));
    }
  }
  await new Promise((resolve, reject) => {
    stream.on("error", reject);
    stream.end(resolve);
  });
}

async function forEachNdjson(filePath, callback) {
  const input = fs.createReadStream(filePath, { encoding: "utf8" });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    if (line.trim() !== "") callback(JSON.parse(line));
  }
}

async function fileBinding(filePath) {
  return {
    sha256: await sha256File(filePath),
    bytes: (await stat(filePath)).size
  };
}

async function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

function git(root, args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true
  });
  if (result.status !== 0) {
    throw new Error(`m2_core_legacy_git_failed:${args.join("_")}`);
  }
  return result.stdout.trim();
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value), 0);
}

function average(values) {
  return values.length === 0 ? null : sum(values) / values.length;
}

function averageNonNull(values) {
  return average(values.filter((value) => value !== null));
}

function standardDeviation(values) {
  if (values.length === 0) return 0;
  const center = average(values);
  return Math.sqrt(average(values.map((value) => (
    (value - center) ** 2
  ))));
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = (sorted.length - 1) / 2;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return (sorted[lower] + sorted[upper]) / 2;
}

function ratio(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : null;
}

function percent(value) {
  return value === null || !Number.isFinite(value)
    ? "不可计算"
    : `${(value * 100).toFixed(2)}%`;
}

function number(value) {
  return value === null || !Number.isFinite(value)
    ? "不可计算"
    : value.toFixed(2);
}
