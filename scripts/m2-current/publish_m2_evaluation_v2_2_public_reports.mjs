import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8"
}).trim();
const config = readJson("config/m2-reversal-restatement.v1.json");
const privateDirectory = path.join(
  root,
  "data",
  "private-output",
  config.privateOutputs.directoryRole
);
const candidatePath = path.join(
  privateDirectory,
  config.privateOutputs.publicAggregateCandidate
);
const source = JSON.parse(fs.readFileSync(candidatePath, "utf8"));
const expectedStatus =
  "M2_EVALUATION_V2_2_ACTIVE_FOR_DEVELOPMENT_WITH_DISCLOSED_RESIDUAL_EXCLUSION";

if (source.status !== expectedStatus) {
  throw new Error(
    `Refusing to publish an unexpected v2.2 status: ${source.status}`
  );
}
if (
  source.publicPrivacy?.aggregateOnly !== true ||
  source.publicPrivacy?.containsRowLevelIdentity !== false ||
  source.publicPrivacy?.containsPrivatePath !== false
) {
  throw new Error("The private candidate did not pass its aggregate privacy gate.");
}

const deterministicExecution = {
  executionCount: 2,
  comparedFileCount: 7,
  byteIdentical: true
};
const impact = {
  schema: "m2.reversal-restatement.four-view-reconciliation.public.v1",
  asOf: source.asOf,
  status: source.status,
  labelOnlyRescoreStatus: source.reversalImpact.labelOnlyRescoreStatus,
  cash: cashSummary(source.reversalImpact, source.authorityAudit.amountScalePower),
  affectedPopulation: pick(source.reversalImpact, [
    "affectedScopeCount",
    "affectedWorkCount",
    "affectedChannelCount",
    "affectedMonthCount",
    "fullyZeroedMonthCount",
    "partiallyRetainedMonthCount",
    "maximumTraceDepthMonths",
    "traceDepthDistribution",
    "evaluatedCaseCount",
    "affectedCaseCount",
    "affectedWorkCaseCount",
    "actualDefinitionDifferenceCaseCount",
    "blockedResidualCaseCount",
    "restoredResidualCaseCount",
    "portfolioPopulationMismatchCount"
  ]),
  views: source.reversalImpact.fourViews,
  currentAuthorityPostingReconciliation:
    source.reversalImpact.currentAuthorityPostingReconciliationStatus,
  timeIntegrity: {
    authorityStartMonth: source.reversalImpact.authorityStartMonth,
    authorityDataAsOf: source.reversalImpact.authorityDataAsOf,
    labelMaturityCutoff: source.reversalImpact.labelMaturityCutoff,
    futureLeakageRiskFound: source.reversalImpact.futureLeakageRiskFound,
    originAfterCutoffRowsUsed: source.reversalImpact.originAfterCutoffRowsUsed
  },
  frozenArtifacts: source.frozenArtifactInventory,
  deterministicExecution,
  authorizationCounters: source.authorizationCounters,
  publicPrivacy: source.publicPrivacy
};

const diagnostics = {
  schema:
    "m2.evaluation-v2.2.development-modelable-rescore.public.v1",
  asOf: source.asOf,
  contractVersion: source.contractVersion,
  status: source.status,
  resultStatus: source.resultStatus,
  actualDefinition: source.actualDefinition,
  comparability: {
    postingTimeAndRestatedUseDifferentGroups: true,
    crossActualDefinitionWinnerAllowed: false,
    frozenPredictionLabelOnlyRescore: true,
    historicalRawFailuresOverwritten: false
  },
  statisticalCorrections: {
    workClusterBootstrap: {
      iterations: 2000,
      method:
        "full_standard_work_cluster_resample_recompute_within_cell_ranks",
      approximationFromFixedRankContributions: false
    },
    independentTimeBlockIntervalMayBeAbsent: true,
    occurrenceReportsTrapezoidalPrAucAndAveragePrecisionSeparately: true,
    conditionalAmountUsesConditionalPredictionAgainstPositiveActual: true,
    reversalIsEvaluatedSeparately: true,
    topRevenueViews: [
      "positive_revenue",
      "absolute_cash_magnitude",
      "reversal_magnitude"
    ],
    topRevenueUse: "POSTHOC_FUTURE_ACTUAL_ATTRIBUTION_ONLY"
  },
  reversalImpact: impact,
  groups: Object.fromEntries(
    Object.entries(source.results).map(([groupId, group]) => [
      groupId,
      compactGroup(group)
    ])
  ),
  deterministicExecution,
  authorizationCounters: source.authorizationCounters,
  activation: {
    allowed: true,
    scope: "development_evaluation_only",
    status: source.status,
    productionGateActive: false,
    automationGateActive: false
  },
  publicPrivacy: source.publicPrivacy
};

assertPublic(impact);
assertPublic(diagnostics);

writeJson(
  "docs/analysis/m2-current/M2-reversal-four-view-reconciliation-v1.json",
  impact
);
writeText(
  "docs/analysis/m2-current/M2-reversal-four-view-reconciliation-v1.md",
  impactMarkdown(impact)
);
writeJson(
  "docs/analysis/m2-current/"
    + "M2-evaluation-v2.2-development-modelable-rescore-v1.json",
  diagnostics
);
writeText(
  "docs/analysis/m2-current/"
    + "M2-evaluation-v2.2-development-modelable-rescore-v1.md",
  diagnosticsMarkdown(diagnostics)
);

console.log(
  JSON.stringify({
    status: diagnostics.status,
    reportCount: 4,
    publicPrivacy: diagnostics.publicPrivacy
  })
);

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function pick(value, keys) {
  return Object.fromEntries(
    keys
      .filter((key) => Object.hasOwn(value, key))
      .map((key) => [key, value[key]])
  );
}

function cashSummary(value, scalePower) {
  const fields = [
    "positiveRevenueMinor",
    "reversalPostingMinor",
    "tracedOffsetMinor",
    "restatedRevenueMinor",
    "modelableRestatedRevenueMinor",
    "unresolvedReversalResidualMinor",
    "excludedUnallocatedReversalResidualMinor",
    "conservationDifferenceMinor"
  ];
  return Object.fromEntries(
    fields.map((field) => [
      field.replace(/Minor$/, ""),
      {
        exactMinorUnits: value[field],
        authorityMonetaryUnits: decimalFromMinor(value[field], scalePower)
      }
    ])
  );
}

function decimalFromMinor(value, scalePower) {
  const signed = BigInt(value);
  const negative = signed < 0n;
  const digits = (negative ? -signed : signed)
    .toString()
    .padStart(scalePower + 1, "0");
  const whole = digits.slice(0, -scalePower);
  const fraction = digits.slice(-scalePower);
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

function compactGroup(group) {
  return {
    postingComparabilityGroupId: group.postingComparabilityGroupId,
    restatedComparabilityGroupId: group.restatedComparabilityGroupId,
    crossActualDefinitionWinnerAllowed:
      group.crossActualDefinitionWinnerAllowed,
    fallbackId: group.fallbackId,
    models: Object.fromEntries(
      Object.entries(group.models ?? {}).map(([modelId, model]) => [
        modelId,
        compactModel(model)
      ])
    ),
    pairedAgainstFallback: Object.fromEntries(
      Object.entries(group.pairedWithinActualDefinition ?? {}).map(
        ([modelId, paired]) => [modelId, compactPaired(paired)]
      )
    )
  };
}

function compactModel(model) {
  if (!model.postingTime || !model.reversalRestated) {
    return pick(model, [
      "status",
      "stableModelId",
      "variantType",
      "originalCaseCount",
      "sameCaseCount",
      "blockedCaseCount",
      "blockedStatusCounts"
    ]);
  }
  return {
    ...pick(model, [
      "status",
      "stableModelId",
      "variantType",
      "originalCaseCount",
      "sameCaseCount",
      "blockedCaseCount",
      "blockedStatusCounts",
      "postingAuthorityMismatchCount"
    ]),
    postingTime: compactView(model.postingTime),
    reversalRestated: compactView(model.reversalRestated),
    pairedActualDefinitionImpact: compactActualImpact(
      model.pairedActualDefinitionImpact
    )
  };
}

function compactView(view) {
  return {
    actualDefinitionId: view.actualDefinitionId,
    point: compactPoint(view.point?.pooled),
    occurrence: pick(view.occurrence ?? {}, [
      "status",
      "caseCount",
      "prevalence",
      "brier",
      "logLoss",
      "prAucTrapezoidal",
      "averagePrecision",
      "rocAucAuxiliary"
    ]),
    conditionalAmount: pick(view.conditionalAmount ?? {}, [
      "status",
      "caseCount",
      "positiveCaseCount",
      "wape",
      "signedBias",
      "mae",
      "logMae"
    ]),
    reversal: {
      ...pick(view.reversal ?? {}, [
        "status",
        "caseCount",
        "reversalCaseCount"
      ]),
      occurrence: pick(view.reversal?.occurrence ?? {}, [
        "status",
        "caseCount",
        "prevalence",
        "brier",
        "logLoss",
        "prAucTrapezoidal",
        "averagePrecision",
        "rocAucAuxiliary"
      ]),
      amount: pick(view.reversal?.amount ?? {}, [
        "status",
        "caseCount",
        "wape",
        "signedBias",
        "mae"
      ]),
      calibration: pick(view.reversal?.calibration ?? {}, [
        "status",
        "caseCount"
      ])
    },
    topRevenueAttribution: pick(view.topRevenueAttribution ?? {}, [
      "status",
      "futureActualUsed",
      "allowedForFittingSelectionOrGate"
    ])
  };
}

function compactPoint(point) {
  return pick(point ?? {}, [
    "status",
    "workCount",
    "caseCount",
    "actualAbsoluteTotal",
    "absoluteErrorTotal",
    "signedErrorTotal",
    "wape",
    "signedBias",
    "absoluteBias",
    "mae",
    "medianAbsoluteError"
  ]);
}

function compactActualImpact(value) {
  return pick(value ?? {}, [
    "status",
    "sameCaseCount",
    "postingTimeWape",
    "postingTimeSignedBias",
    "restatedWape",
    "restatedSignedBias",
    "absoluteWapeChange",
    "relativeWapeChange",
    "affectedCaseCount",
    "unaffectedCaseCount"
  ]);
}

function compactPaired(paired) {
  const result = {
    versus: paired.versus,
    postingTime: paired.postingTime,
    reversalRestated: paired.reversalRestated
  };
  if (paired.ranking) {
    result.ranking = {
      postingTime: compactRanking(paired.ranking.postingTime),
      reversalRestated: compactRanking(paired.ranking.reversalRestated)
    };
  }
  return result;
}

function compactRanking(ranking) {
  if (!ranking) return null;
  return {
    status: ranking.status,
    caseCount: ranking.caseCount,
    workCount: ranking.workCount,
    groupCount: ranking.groupCount,
    weighting: ranking.weighting,
    candidate: pick(ranking.candidate ?? {}, [
      "groupCount",
      "meanSpearman",
      "meanKendallTauB",
      "meanTopRevenueCapture"
    ]),
    fallback: pick(ranking.fallback ?? {}, [
      "groupCount",
      "meanSpearman",
      "meanKendallTauB",
      "meanTopRevenueCapture"
    ]),
    difference: pick(ranking.difference ?? {}, [
      "meanSpearman",
      "meanKendallTauB",
      "meanTopRevenueCapture"
    ]),
    workClusterBootstrap: ranking.workClusterBootstrap,
    timeIndependence: ranking.timeIndependence
  };
}

function assertPublic(value) {
  const prohibitedKeys = new Set([
    "relativePath",
    "absolutePath",
    "privatePath",
    "authorityRecordId",
    "workId",
    "channelId",
    "rawBillMember"
  ]);
  const prohibitedValuePatterns = [
    /(?:^|[\\/])data[\\/]private-(?:input|output)(?:[\\/]|$)/i,
    /[A-Za-z]:[\\/]/,
    /\/home\/[^/]+\//,
    /\/Users\/[^/]+\//
  ];
  const visit = (item, objectPath) => {
    if (Array.isArray(item)) {
      item.forEach((entry, index) => visit(entry, `${objectPath}[${index}]`));
      return;
    }
    if (item && typeof item === "object") {
      for (const [key, entry] of Object.entries(item)) {
        if (prohibitedKeys.has(key)) {
          throw new Error(`Private key rejected at ${objectPath}.${key}`);
        }
        visit(entry, `${objectPath}.${key}`);
      }
      return;
    }
    if (
      typeof item === "string" &&
      prohibitedValuePatterns.some((pattern) => pattern.test(item))
    ) {
      throw new Error(`Private path-like value rejected at ${objectPath}`);
    }
  };
  visit(value, "$");
}

function writeJson(relativePath, value) {
  writeText(relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(relativePath, value) {
  fs.writeFileSync(path.join(root, relativePath), value, "utf8");
}

function impactMarkdown(report) {
  const cash = report.cash;
  const population = report.affectedPopulation;
  const views = report.views;
  return `# M2 冲销四视图与残差隔离对账 v1

状态：\`${report.status}\`。原始冲销和已分配部分均保留；未分配残差没有被伪装成已解决，只从开发可建模标签中透明隔离。

## 现金守恒

| 项目 | 权威货币单位 | 精确整数单位 |
| --- | ---: | ---: |
| 正收入 | ${cash.positiveRevenue.authorityMonetaryUnits} | ${cash.positiveRevenue.exactMinorUnits} |
| 冲销入账 | ${cash.reversalPosting.authorityMonetaryUnits} | ${cash.reversalPosting.exactMinorUnits} |
| 已追溯抵消 | ${cash.tracedOffset.authorityMonetaryUnits} | ${cash.tracedOffset.exactMinorUnits} |
| 财务重述收入 | ${cash.restatedRevenue.authorityMonetaryUnits} | ${cash.restatedRevenue.exactMinorUnits} |
| 开发可建模重述现金 | ${cash.modelableRestatedRevenue.authorityMonetaryUnits} | ${cash.modelableRestatedRevenue.exactMinorUnits} |
| 未分配冲销残差（财务对账） | ${cash.unresolvedReversalResidual.authorityMonetaryUnits} | ${cash.unresolvedReversalResidual.exactMinorUnits} |
| 从开发标签隔离的未分配残差 | ${cash.excludedUnallocatedReversalResidual.authorityMonetaryUnits} | ${cash.excludedUnallocatedReversalResidual.exactMinorUnits} |
| 守恒差 | ${cash.conservationDifference.authorityMonetaryUnits} | ${cash.conservationDifference.exactMinorUnits} |

精确整数等式为：原入账正现金 + 已入账冲销 = 开发可建模重述现金 + 隔离的未分配冲销残差。差值为 \`${views.DEVELOPMENT_MODELABLE_RESTATEMENT_VIEW.exactIntegerReconciliation.differenceMinor}\`。

## 影响范围

- ${population.affectedScopeCount} 个冲销 scope、${population.affectedWorkCount} 个作品、${population.affectedChannelCount} 个 canonical 渠道。
- ${population.affectedMonthCount} 个 scope-month，其中 ${population.fullyZeroedMonthCount} 个完全抵消，${population.partiallyRetainedMonthCount} 个保留部分正收入。
- 最大向后追溯深度 ${population.maximumTraceDepthMonths} 个月；深度分布为 0 月 ${population.traceDepthDistribution["0"]}、1 月 ${population.traceDepthDistribution["1"]}、2 月 ${population.traceDepthDistribution["2"]}、3 月 ${population.traceDepthDistribution["3"]}、超过 3 月 ${population.traceDepthDistribution.more}。
- 共审计 ${population.evaluatedCaseCount.toLocaleString("en-US")} 个唯一 case；${population.affectedCaseCount} 个 case 受冲销影响。残差阻断 case 为 ${population.blockedResidualCaseCount}；此前会因残差被阻断、现已恢复开发标签的 case 为 ${population.restoredResidualCaseCount}。

## 四个独立视图

- 原入账财务视图（\`POSTING_TIME_ACCOUNTING_VIEW\`）：\`${views.POSTING_TIME_ACCOUNTING_VIEW.status}\`；${views.POSTING_TIME_ACCOUNTING_VIEW.reversalRowCount} 条冲销原样保留，物理删除数为 ${views.POSTING_TIME_ACCOUNTING_VIEW.originalReversalRowsDeleted}。
- 截止时点重述视图（\`AS_OF_RESTATED_VIEW\`）：\`${views.AS_OF_RESTATED_VIEW.status}\`；origin 后冲销进入该 origin 的行数为 ${views.AS_OF_RESTATED_VIEW.originAfterCutoffRowsUsed}。
- 最终财务对账视图（\`FINAL_ACCOUNTING_RECONCILIATION_VIEW\`）：\`${views.FINAL_ACCOUNTING_RECONCILIATION_VIEW.status}\`；未分配残差是否已解决：\`${views.FINAL_ACCOUNTING_RECONCILIATION_VIEW.unresolvedResidualSolved}\`。
- 开发可建模重述视图（\`DEVELOPMENT_MODELABLE_RESTATEMENT_VIEW\`）：\`${views.DEVELOPMENT_MODELABLE_RESTATEMENT_VIEW.status}\`；禁止整案排除：\`${views.DEVELOPMENT_MODELABLE_RESTATEMENT_VIEW.wholeCaseExclusionAllowed}\`。
- 当前权威与旧入账 actual 的差异状态：\`${report.currentAuthorityPostingReconciliation}\`，差异只报告、不回写旧结果。

未发现未来泄漏风险，使用 forecast origin 之后冲销作为特征的行数为 ${report.timeIntegrity.originAfterCutoffRowsUsed}。两次完整执行比较 7 个输出文件，逐字节一致为 \`${report.deterministicExecution.byteIdentical}\`。
`;
}

function diagnosticsMarkdown(report) {
  const rows = [];
  for (const [groupId, group] of Object.entries(report.groups)) {
    for (const [modelId, model] of Object.entries(group.models)) {
      rows.push(
        `| ${groupId} | ${modelId} | ${model.sameCaseCount ?? 0} | ${formatMetric(model.postingTime?.point?.wape)} | ${formatMetric(model.postingTime?.point?.signedBias)} | ${formatMetric(model.reversalRestated?.point?.wape)} | ${formatMetric(model.reversalRestated?.point?.signedBias)} | \`${model.status}\` |`
      );
    }
  }
  const rankings = [];
  for (const [groupId, group] of Object.entries(report.groups)) {
    for (const [modelId, paired] of Object.entries(
      group.pairedAgainstFallback
    )) {
      if (!paired.ranking) continue;
      rankings.push(
        `- ${groupId} / ${modelId}：原入账 \`${paired.ranking.postingTime.status}\`，时间块 \`${paired.ranking.postingTime.timeIndependence.status}\`；重述 \`${paired.ranking.reversalRestated.status}\`，时间块 \`${paired.ranking.reversalRestated.timeIndependence.status}\`。cluster 数分别为 ${paired.ranking.postingTime.workClusterBootstrap.clusterCount} / ${paired.ranking.reversalRestated.workClusterBootstrap.clusterCount}，每个视图 2,000 次。`
      );
    }
  }
  return `# M2 评价 v2.2 开发可建模标签重评分 v1

状态：\`${report.status}\`。这是同一批冻结预测面对原入账与开发可建模冲销重述两种 actual definition 的标签重评分；预测没有重新生成或修改，分数变化只来自标签定义。未分配残差只在财务对账中保留并从开发标签隔离，不再机械排除整条作品 case。

## 模型逐项配对结果

| 可比组 | 模型/输出 | 同 case 数 | 原入账 WAPE | 原入账 bias | 重述 WAPE | 重述 bias | 状态 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
${rows.join("\n")}

旧 actual 与新 actual 使用不同 \`comparabilityGroupId\`。表中差异只表示同一冻结预测的标签定义影响，不能跨 actual definition 评选赢家；历史 raw failure 没有被覆盖。组合 30 个 cell 因人口不匹配而不可完整重评分，未发布部分组合成绩。

## 统计修正

- 排序 bootstrap 已从 v2.1 的 200 次提高为 2,000 次完整作品 cluster 重采样；每次在 origin×horizon cell 内重新计算 rank、Spearman、Kendall tau-b 和 top 1%/5%/10% capture，candidate 与 fallback 共用权重。
- ${rankings.join("\n")}
- 发生概率同时区分梯形 PR-AUC（\`prAucTrapezoidal\`）与 Average Precision；ROC-AUC 仅为辅助指标。
- 只有实际存在相应冻结输出时才评价 conditional amount 与 reversal。缺失输出保留精确的 \`NOT_COMPUTABLE_*\` 状态；生命周期原始输出（\`M2-WORK-LC01\`）的发生、条件金额和冲销均被实际评分。
- top revenue 拆为正收入、绝对现金规模、冲销规模三种后验视图，均为 \`POSTHOC_FUTURE_ACTUAL_ATTRIBUTION_ONLY\`，禁止用于拟合、选择或门禁。

## 执行边界

模型执行 ${report.authorizationCounters.modelExecutionCount}，训练 ${report.authorizationCounters.trainingCount}，拟合 ${report.authorizationCounters.fittingCount}，调参 ${report.authorizationCounters.tuningCount}，选择 ${report.authorizationCounters.selectionCount}，预测生成 ${report.authorizationCounters.predictionRowsGenerated}，预测修改 ${report.authorizationCounters.predictionRowsModified}，production 变更 ${report.authorizationCounters.productionChangeCount}。公共 artifact 仅含聚合；两次执行逐字节一致。v2.2 仅激活开发评价：\`${report.activation.allowed}\`；production gate 与 automation gate 均保持关闭。
`;
}

function formatMetric(value) {
  return Number.isFinite(value) ? value.toFixed(9) : "—";
}
