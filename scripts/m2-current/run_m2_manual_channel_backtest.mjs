import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { forecastM2CurrentManualChannelRule } from
  "../../src/domain/m2Current/manualChannel.js";
import {
  scoreM2CurrentPointRows,
  scoreM2CurrentSlices
} from "../../src/domain/m2Current/metrics.js";


const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);
const config = JSON.parse(await readFile(
  path.join(root, "config/m2-current-manual-channel.v0.1.json"),
  "utf8"
));
assertAuthorizationBoundary(config);

const materialization = spawnSync(
  process.execPath,
  [
    path.join(root, "scripts/run-codex-python.mjs"),
    path.join(
      root,
      "scripts/m2-current/materialize_manual_channel_cases.py"
    )
  ],
  {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024
  }
);
if (materialization.status !== 0) {
  throw new Error(
    `m2_current_manual_channel_materialization_failed:`
    + `${materialization.stderr}`
  );
}

const privateDirectory = path.join(
  root,
  config.privateOutputDirectory
);
const privateText = await readFile(
  path.join(
    privateDirectory,
    "M2-current-manual-channel-cases-private-v0.1.ndjson"
  ),
  "utf8"
);
const manifest = JSON.parse(await readFile(
  path.join(
    privateDirectory,
    "M2-current-manual-channel-manifest-private-v0.1.json"
  ),
  "utf8"
));
const cases = parseNdjson(privateText);
verifyPrivateManifest(manifest, privateText, cases, config);

const policies = {
  trailingAnnualFlat: null,
  manualFaithful: structuredClone(config.rule),
  manualAnnual80Percent: {
    ...structuredClone(config.rule),
    annualLevelMultiplier:
      config.sensitivityRules.annualLevel80Percent.annualLevelMultiplier
  },
  manualFixed50PercentLifecycle: {
    ...structuredClone(config.rule),
    lifecycleContribution: structuredClone(
      config.sensitivityRules.fixed50PercentLifecycle
        .lifecycleContribution
    )
  }
};
const rowsByModel = Object.fromEntries(
  Object.keys(policies).map((id) => [id, []])
);
const diagnostics = [];
for (const row of cases) {
  const faithful = forecastM2CurrentManualChannelRule(
    row,
    policies.manualFaithful
  );
  rowsByModel.trailingAnnualFlat.push(evaluationRow(
    row,
    Math.max(0, faithful.trailingAnnual) * 3,
    faithful
  ));
  rowsByModel.manualFaithful.push(evaluationRow(
    row,
    faithful.pointEstimate,
    faithful
  ));
  for (const id of [
    "manualAnnual80Percent",
    "manualFixed50PercentLifecycle"
  ]) {
    const result = forecastM2CurrentManualChannelRule(row, policies[id]);
    rowsByModel[id].push(evaluationRow(
      row,
      result.pointEstimate,
      result
    ));
  }
  diagnostics.push({
    origin: row.origin,
    segment: row.segment,
    specialCategory: row.specialCategory,
    channelBand: channelBand(
      faithful.mainChannelCount + faithful.edgeChannelCount
    ),
    concentrationBand: concentrationBand(
      faithful.top2TrailingRevenueShare
    ),
    mainDecisionBand: mainDecisionBand(faithful),
    mainForecast: faithful.mainForecast,
    edgeForecast: faithful.edgeForecast,
    top1Share: faithful.top1TrailingRevenueShare,
    top2Share: faithful.top2TrailingRevenueShare
  });
}

const evaluation = Object.fromEntries(
  Object.entries(rowsByModel).map(([id, rows]) => [id, {
    overall: scoreM2CurrentPointRows(rows),
    byOrigin: scoreM2CurrentSlices(rows, "origin"),
    bySegment: scoreM2CurrentSlices(rows, "segment"),
    byChannelBand: scoreM2CurrentSlices(rows, "channelBand"),
    byConcentrationBand: scoreM2CurrentSlices(
      rows,
      "concentrationBand"
    )
  }])
);
const faithfulMetrics = evaluation.manualFaithful.overall;
const gates = {
  developmentWapePassed:
    faithfulMetrics.wape <= config.gates.maximumWape,
  overallAbsoluteBiasPassed:
    Math.abs(faithfulMetrics.signedBias)
      <= config.gates.maximumAbsoluteBias,
  channelNormalizationPassed:
    manifest.channelNormalizationComplete === true,
  manualBuyoutTruthPassed:
    manifest.manualBuyoutTruthAvailable === true,
  historicalFeatureAvailableAtPassed:
    manifest.historicalFeatureAvailableAtProven === true,
  specialCategoryBacktestAvailable:
    manifest.specialCategoryCaseCount > 0,
  independentHoldoutPassed: false
};
gates.allPromotionGatesPassed = Object.values(gates).every(Boolean);
const publicArtifact = {
  schema: "m2.current.manual_channel_backtest.public.v0.1",
  version: "M2-current-manual-channel-backtest-v0.1",
  candidateId: config.candidateId,
  target: config.target,
  role: config.role,
  status:
    "POSTHOC_MANUAL_RULE_REJECTED_CHANNEL_GOVERNANCE_REQUIRED",
  scope: {
    frozenWorkCount: config.population.frozenWorkCount,
    representedWorkCount: manifest.workCount,
    caseCount: cases.length,
    origins: config.population.origins,
    horizonMonths: config.population.horizonMonths,
    labelAvailableThrough:
      config.population.labelAvailableThrough,
    originCounts: manifest.originCounts,
    segmentCounts: manifest.segmentCounts,
    specialCategoryCaseCount: manifest.specialCategoryCaseCount
  },
  currentM2Summary: {
    workLevelChampion:
      "M2-current-occurrence-amount-calibration-v0.3",
    workLevelLogic:
      "aggregate sales-share history, segment activity, calibrate occurrence and positive amount",
    rejectedHistoryRegimeCandidate:
      "M2-current-history-regime-recalibration-v0.7",
    portfolioDevelopmentCandidate:
      "M2-current-multi-resolution-revenue-service-v0.5",
    portfolioResultMustNotBeAllocatedToWorks: true
  },
  manualRuleSpecification: {
    mainChannels:
      "top three current raw channel components by trailing-12 sales-share cash",
    stableMain:
      "trailing_12_cash / lifecycle_contribution_share",
    decliningMain:
      "latest_month_cash * 12 / lifecycle_contribution_share",
    declineBoundary:
      "latest_month_cash < 0.8 * trailing_12_monthly_average",
    edge:
      "0.5 * nonnegative_net_sales_share_cash_since_rights_start",
    lifecycleContributionShare:
      "0.50 through month 36, linearly decreasing to 0.40 at month 60",
    targetHorizonMonths: 36,
    channelAliasesUnified: false,
    platformBranchImplemented: false,
    specialCategoryUnitSalesBranchImplemented: false
  },
  dataQuality: {
    channelIdentity: manifest.channelIdentityAudit,
    classificationCoverage: manifest.classificationCoverage,
    humanReviewedBuyoutIsolation: manifest.classifierAudit,
    buyoutEventMonthsExcludedFromHistory:
      manifest.buyoutEventMonthsExcludedFromHistory,
    rightsStartSourceCounts: manifest.rightsStartSourceCounts,
    channelCount: manifest.channelCount,
    findings: [
      {
        severity: "high",
        code: "canonical_channel_master_missing",
        effect:
          "main-channel ranking and platform concentration may be fragmented"
      },
      {
        severity: "high",
        code: "historical_feature_available_at_not_proven",
        effect:
          "the result is posthoc development evidence only"
      }
    ]
  },
  evaluation,
  diagnosticPopulation: {
    topTwoShareAtLeast60: countWhere(
      diagnostics,
      (row) => row.top2Share >= 0.6
    ),
    topTwoShareAtLeast70: countWhere(
      diagnostics,
      (row) => row.top2Share >= 0.7
    ),
    topTwoShareAtLeast80: countWhere(
      diagnostics,
      (row) => row.top2Share >= 0.8
    ),
    channelBands: countBy(diagnostics, (row) => row.channelBand),
    concentrationBands: countBy(
      diagnostics,
      (row) => row.concentrationBand
    ),
    mainDecisionBands: countBy(
      diagnostics,
      (row) => row.mainDecisionBand
    ),
    forecastComposition: {
      main: sum(diagnostics, "mainForecast"),
      edge: sum(diagnostics, "edgeForecast")
    }
  },
  sensitivityInterpretation: {
    annual80PercentHasLowestObservedWape: (
      evaluation.manualAnnual80Percent.overall.wape
      < evaluation.manualFaithful.overall.wape
    ),
    annual80PercentAbsoluteBiasPassed: (
      Math.abs(
        evaluation.manualAnnual80Percent.overall.signedBias
      ) <= config.gates.maximumAbsoluteBias
    ),
    parameterSelectionAuthorized: false,
    interpretation:
      "sensitivity results describe instability and must not be used for same-window tuning"
  },
  gates,
  decision: {
    promotionDecision:
      "REJECT_KEEP_V0_3_WORK_LEVEL_FALLBACK",
    automationDecision: "AUTOMATION_BLOCKED",
    platformBranchDecision:
      "BLOCKED_PENDING_CANONICAL_CHANNEL_AND_PLATFORM_TYPE",
    specialCategoryDecision:
      "BLOCKED_NO_MATURE_36_MONTH_DANMEI_CASES_IN_SAFE_WINDOW",
    nextAction:
      "build a finance-reviewed canonical channel and platform-type master, then rerun a platform-category hierarchical challenger on an unseen origin",
    reasonCodes: [
      gates.developmentWapePassed
        ? null
        : "manual_rule_WAPE_above_0_30",
      gates.overallAbsoluteBiasPassed
        ? null
        : "overall_absolute_bias_above_0_10",
      "origin_performance_unstable",
      "canonical_channel_master_missing",
      "no_safe_window_danmei_cases",
      "historical_feature_available_at_not_proven",
      "independent_holdout_sealed"
    ].filter(Boolean)
  },
  authorization: config.authorization,
  boundaries: {
    aggregateOnly: true,
    identifiersPresent: false,
    privateRowsPresent: false,
    databaseConnected: false,
    providerCalled: false,
    finalHoldoutOpened: false,
    deferredLabelsOpened: false,
    releaseAuthorized: false
  }
};

const publicPath = path.join(root, config.publicOutput);
const reportPath = path.join(root, config.publicReport);
await mkdir(path.dirname(publicPath), { recursive: true });
await writeFile(
  publicPath,
  `${JSON.stringify(publicArtifact, null, 2)}\n`,
  "utf8"
);
await writeFile(reportPath, buildMarkdown(publicArtifact), "utf8");
process.stdout.write(`${JSON.stringify({
  status: publicArtifact.status,
  caseCount: cases.length,
  evaluation: Object.fromEntries(
    Object.entries(evaluation).map(([id, value]) => [
      id,
      value.overall
    ])
  ),
  gates,
  decision: publicArtifact.decision,
  publicOutput: config.publicOutput,
  publicReport: config.publicReport
}, null, 2)}\n`);

function assertAuthorizationBoundary(value) {
  if (
    value?.authorization?.newCandidateFamilyDevelopment !== true
    || value.authorization.candidateSelection !== false
    || value.authorization.finalHoldout !== false
    || value.authorization.deferredLabels !== false
    || value.authorization.release !== false
    || value?.boundaries?.promotionEligible !== false
  ) {
    throw new Error("m2_current_manual_channel_authorization_differs");
  }
}

function verifyPrivateManifest(value, text, rows, contract) {
  if (
    value?.schema
      !== "m2.current.manual_channel_backtest.private_manifest.v0.1"
    || value.tracked !== false
    || value.candidateId !== contract.candidateId
    || value.privateCaseRowCount !== rows.length
    || value.privateCaseSha256 !== sha256(text)
    || value.labelAvailableThrough
      !== contract.population.labelAvailableThrough
    || value.finalHoldoutOpened !== false
    || value.deferredLabelsOpened !== false
    || value.databaseRead !== false
    || value.providerUsed !== false
    || rows.some((row) => (
      row.targetEnd > contract.population.labelAvailableThrough
      || row.finalHoldoutOpened !== false
      || row.deferredLabelsOpened !== false
      || row.channelNormalizationComplete !== false
      || row.manualBuyoutTruthAvailable !== true
      || row.historicalFeatureAvailableAtProven !== false
    ))
  ) {
    throw new Error("m2_current_manual_channel_private_manifest_differs");
  }
}

function evaluationRow(row, pointEstimate, result) {
  const totalChannels = result.mainChannelCount + result.edgeChannelCount;
  return {
    actual: Number(row.actual),
    pointEstimate,
    origin: row.origin,
    segment: row.segment,
    specialCategory: row.specialCategory,
    channelBand: channelBand(totalChannels),
    concentrationBand: concentrationBand(
      result.top2TrailingRevenueShare
    ),
    mainDecisionBand: mainDecisionBand(result)
  };
}

function channelBand(value) {
  return value <= 1 ? "one" : value <= 3 ? "two_to_three" : "four_plus";
}

function concentrationBand(value) {
  return value >= 0.8
    ? "top2_at_least_80pct"
    : value >= 0.6
      ? "top2_60_to_80pct"
      : "top2_below_60pct";
}

function mainDecisionBand(result) {
  if (result.decliningMainChannelCount > 0) {
    return "has_declining_main";
  }
  if (result.stableMainChannelCount > 0) {
    return "stable_main_only";
  }
  return "no_positive_main";
}

function parseNdjson(value) {
  return value.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
}

function countWhere(rows, predicate) {
  return rows.filter(predicate).length;
}

function countBy(rows, selector) {
  const counts = {};
  for (const row of rows) {
    const key = selector(row);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => (
      left.localeCompare(right)
    ))
  );
}

function sum(rows, field) {
  return rows.reduce((total, row) => total + Number(row[field]), 0);
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function percent(value) {
  return `${(100 * Number(value)).toFixed(2)}%`;
}

function metricRow(name, metrics, conclusion) {
  return `| ${name} | ${metrics.caseCount} | `
    + `${metrics.wape.toFixed(6)} | `
    + `${metrics.signedBias.toFixed(6)} | ${conclusion} |`;
}

function buildMarkdown(artifact) {
  const primary = artifact.evaluation.manualFaithful.overall;
  const flat = artifact.evaluation.trailingAnnualFlat.overall;
  const annual80 =
    artifact.evaluation.manualAnnual80Percent.overall;
  const fixed50 =
    artifact.evaluation.manualFixed50PercentLifecycle.overall;
  const byOrigin = artifact.evaluation.manualFaithful.byOrigin;
  return `# M2 现有算法与人工渠道规则回测 v0.1

日期：2026-07-25

状态：\`${artifact.status}\`

## 结论

人工渠道规则已经被抽象成可执行的 36 个月分成收入模型，并在不打开 final holdout、
不使用 2023-06 之后标签的前提下，用真实账单完成回测。它比“把最近一年收入直接
乘 3”明显更好，但仍未达到可用门槛：

- 人工规则 WAPE 为 \`${primary.wape.toFixed(6)}\`，高于 \`0.30\` 门槛；
- signed bias 为 \`${primary.signedBias.toFixed(6)}\`，绝对值高于 \`0.10\` 门槛，
  且不同 origin 的低估程度不稳定；
- ${primary.caseCount} 个可评分安全窗口 case 中，没有可用于 36 个月回测的耽美 case；
- ${artifact.diagnosticPopulation.topTwoShareAtLeast80} 个 case 的前两大渠道收入占比
  不低于 80%，证明“平台主导”不是少数例外；
- 当前渠道只按原始 ID＋名称组合区分，没有完成真实平台归一；
- 买断已由人工复核后的拆分账单成员关系隔离，买断真值门禁已经通过。

因此，本轮没有替换现有 v0.3 作品级 fallback，也没有开放自动化或发布。

## 当前 M2 用通俗语言怎么工作

当前 M2 可以理解成五步：

1. **先决定哪些钱可以预测。** 只预测分成收入；买断移到模型外账单层。纯买断作品
   返回空值，不用 0 假装预测。
2. **把一部作品所有可预测渠道的月收入加在一起。** 只读取人工分成账单；人工买断
   账单中的月份不会进入预测矩阵。
3. **判断作品属于哪种收入状态。** dense 是经常有收入，intermittent 是断断续续，
   dormant 是长期沉寂。
4. **让多个简单模型比赛。** 包括去年同期、近期均值、指数加权，以及 Croston、
   SBA、TSB、ADIDA 等间歇需求模型。它们只允许读取预测时点之前的账单月份。
5. **严格门禁。** 不只看平均误差，还看偏差、分群、覆盖、风险和数据在历史时点
   是否真的可得。v0.7 虽有改善但门禁失败，所以当前作品级仍保留 v0.3。

v0.3 本身是在旧的层级稳健预测上，把“未来会不会继续产生收入”和“产生收入时金额
有多大”分开估计，再用过去已经成熟的 case 校准 dense/intermittent；dormant 不强行
套新规则。v0.5 在旧机器现金路由下的组合层 PASS 已被人工分区复验推翻，不能继续
解释为总盘子已经可预测，更不能拆回每部作品。

## 人工规则的数学形式

令 \\(x_{w,c,t}\\) 表示作品 \\(w\\)、渠道 \\(c\\)、月份 \\(t\\) 的分成现金，买断已经剔除。
最近一年收入和月均收入为：

\\[
A_{w,c,t}=\\sum_{j=0}^{11}x_{w,c,t-j},\\qquad
\\bar{x}_{w,c,t}=A_{w,c,t}/12
\\]

按 \\(A\\) 排序，最多前三个渠道为主力渠道，其余为边缘渠道。作品上线月龄为 \\(a\\)，
生命周期贡献比例为：

\\[
q(a)=
\\begin{cases}
0.50,&a\\le36\\\\
0.50-(a-36)\\times0.10/24,&36<a<60\\\\
0.40,&a\\ge60
\\end{cases}
\\]

主力渠道预测：

\\[
F^{main}_{w,c}=
\\begin{cases}
A_{w,c,t}/q(a),&x_{w,c,t}\\ge0.8\\bar{x}_{w,c,t}\\\\
12\\max(0,x_{w,c,t})/q(a),&x_{w,c,t}<0.8\\bar{x}_{w,c,t}
\\end{cases}
\\]

边缘渠道预测：

\\[
F^{edge}_{w,c}=0.5\\max\\left(0,
\\sum_{m=rightsStart}^{t}x_{w,c,m}\\right)
\\]

作品未来三年预测为全部渠道预测之和：

\\[
F_w=\\sum_{c\\in main}F^{main}_{w,c}
+\\sum_{c\\in edge}F^{edge}_{w,c}
\\]

## 真实账单回测结果

回测限定为当前冻结的 824 部模型作品，使用 2019-06、2019-12、2020-06 三个 origin，
预测未来 36 个月，最晚标签截止 2023-06。只有当时已经存在且属于分成/混合路线的
作品进入评分，共 ${artifact.scope.caseCount} 个 case。

| 模型 | case | WAPE | signed bias | 结论 |
|---|---:|---:|---:|---|
${metricRow("最近一年收入×3", flat, "FAIL")}
${metricRow("人工规则原式", primary, "FAIL")}
${metricRow("主力年度水平再乘80%", annual80, "FAIL；偏差恶化")}
${metricRow("生命周期固定50%", fixed50, "FAIL")}

人工原式相对简单外推的 WAPE 改善
\`${percent(1 - primary.wape / flat.wape)}\`，说明业务规则确有信息；但绝对误差仍然
过大，不能直接替换统计模型。

按 origin 看，人工原式：

| origin | case | WAPE | signed bias |
|---|---:|---:|---:|
${Object.entries(byOrigin).map(([origin, metrics]) => (
    `| ${origin} | ${metrics.caseCount} | `
    + `${metrics.wape.toFixed(6)} | ${metrics.signedBias.toFixed(6)} |`
  )).join("\n")}

三个 origin 都出现低估，且低估程度明显不同，说明 40%/50% 这种固定生命周期比例
不能稳定代表不同年份、平台和作品组合。

## 两个基础数据隐患的影响

### 渠道尚未形成 canonical 主表

当前账单字段中有 ${artifact.dataQuality.channelIdentity.distinctRawIdNamePairCount}
个原始 ID＋名称组合，精确字段是一一对应，但没有证据证明它们就是
${artifact.dataQuality.channelIdentity.distinctRawIdNamePairCount} 个不同真实平台。
因此同一平台的别名可能被拆成多个边缘渠道，也可能把本应触发的平台模型的作品误判
为非集中作品。这个问题不能靠字符串模糊匹配自动定案。

### 买断已按人工账单拆分隔离

当前人工复核买断账单隔离的正向买断现金约占全部正向现金
\`${percent(
    artifact.dataQuality.humanReviewedBuyoutIsolation
      .humanReviewedIsolatedShareOfPositiveCash
  )}\`。比例足以显著改变最近月、最近一年和平台曲线。现金类型仅取人工拆分
账单成员关系，不再使用金额形态或渠道规则推断；买断只保留为评级历史背景，
不进入预测特征、标签、回测实际值或预测输出。

## 平台与耽美规则应如何建模

若前两大渠道收入占比 \\(D_w\\) 超过阈值 \\(\\tau\\)，普通全局规则应退居 fallback：

\\[
D_w=\\frac{A_{w,(1),t}+A_{w,(2),t}}
{\\sum_c\\max(0,A_{w,c,t})}
\\]

会员平台使用“同平台×同三级分类×同级别×相近上线月龄”的收入曲线：

\\[
F_{w,c}=A_{w,c,t}\\times
g_{platform,category,grade}(age,36)
\\]

单购平台应先转为销量。若定价 30 元、我方分成 50%，净单价为 15 元：

\\[
units_{w,c,t}=revenue_{w,c,t}/15,\\qquad
F_{w,c}=15\\sum_{h=1}^{36}\\widehat{units}_{w,c,t+h}
\\]

把金额除以 15 再乘回 15 本身不会提高精度；真正的提升来自单购平台独立的首年爆发、
快速衰减和寒暑假季节曲线。当前安全窗口没有耽美 36 个月 case，且没有版本化的平台
类型和级别历史，因此这部分只完成了数学合同，没有伪造回测结果。

## 根据结果对 M2 的调整

1. 人工公式进入自动回归基线，但状态固定为 comparator，不晋升 champion。
2. 下一模型从“作品总收入曲线”升级为
   “作品×canonical 渠道×平台类型×三级分类×级别”的分层结构。
3. 人工收入分区已经完成并通过逐行、逐月守恒；不得再运行机器买断判定。下一张受控
   表只剩渠道主表：原始渠道 ID/名称 → canonical channel → 会员/单购/其他。
4. 完成渠道主表后，先回放本报告的三个 origin，验证映射影响；随后只能在未参与设计的
   later origin 或另行授权的 final holdout 做选模。
5. 在 WAPE、偏差、普通/平台主导/耽美等分群以及历史 available-at 同时通过前，
   保持 \`REJECT_KEEP_V0_3_WORK_LEVEL_FALLBACK\` 和
   \`AUTOMATION_BLOCKED\`。

## 证据边界

本报告只公开聚合结果。原始作品、渠道、账单和分类明细仍保留在 Git ignored private
capability；公共 clone、测试和启动不依赖这些文件。本次没有连接数据库、没有调用
provider、没有打开 final holdout 或 deferred labels。
`;
}
