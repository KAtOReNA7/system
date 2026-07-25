import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  mkdir,
  readFile,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildM2CurrentCanonicalChannelChallenger
} from "../../src/domain/m2Current/canonicalChannelModel.js";
import {
  scoreM2CurrentPointRows,
  scoreM2CurrentSlices
} from "../../src/domain/m2Current/metrics.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const config = JSON.parse(await readFile(path.join(
  root,
  "config/m2-current-canonical-channel.v0.1.json"
), "utf8"));
assertAuthorization(config);

const materializer = spawnSync(
  process.execPath,
  [
    path.join(root, "scripts/run-codex-python.mjs"),
    path.join(
      root,
      "scripts/m2-current/materialize_canonical_channel_cases.py"
    )
  ],
  {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024
  }
);
if (materializer.status !== 0) {
  throw new Error(
    `m2_current_canonical_channel_materialization_failed:`
    + `${materializer.stderr}`
  );
}

const outputDirectory = path.join(root, config.privateOutputs.directory);
const historyText = await readFile(
  path.join(outputDirectory, config.privateOutputs.channelHistory),
  "utf8"
);
const denseText = await readFile(
  path.join(outputDirectory, config.privateOutputs.denseCases),
  "utf8"
);
const frozenText = await readFile(
  path.join(outputDirectory, config.privateOutputs.frozenCases),
  "utf8"
);
const manifest = JSON.parse(await readFile(
  path.join(outputDirectory, config.privateOutputs.manifest),
  "utf8"
));
verifyManifest({ manifest, historyText, denseText, frozenText, config });
const histories = new Map(parseNdjson(historyText).map((row) => [
  row.historyKey,
  row
]));
const denseRows = joinHistories(parseNdjson(denseText), histories).map(
  (row) => ({
    ...row,
    basePointEstimate: seasonalNaivePoint(
      row.canonicalChannels,
      row.horizonMonths
    )
  })
);
const frozenRows = joinHistories(parseNdjson(frozenText), histories);

const model = config.model;
const policy = {
  weights: model.weights,
  minimumEarlierRows: model.minimumEarlierRows,
  minimumRelativeWapeImprovement:
    model.minimumRelativeWapeImprovement,
  maximumTrainingAbsoluteBias:
    model.maximumTrainingAbsoluteBias,
  postHocFeatureRead: true
};
const dense = buildM2CurrentCanonicalChannelChallenger(
  denseRows,
  policy
);
const frozen = buildM2CurrentCanonicalChannelChallenger(
  frozenRows,
  policy
);
const denseBaseRows = denseRows.map((row) => ({
  ...row,
  pointEstimate: row.basePointEstimate
}));
const frozenBaseRows = frozenRows.map((row) => ({
  ...row,
  pointEstimate: row.basePointEstimate
}));
const denseComparison = comparison(denseBaseRows, dense.rows);
const frozenComparison = comparison(frozenBaseRows, frozen.rows);
const denseMode = scoreM2CurrentSlices(
  dense.rows,
  "dominantRevenueMode"
);
const frozenMode = scoreM2CurrentSlices(
  frozen.rows,
  "dominantRevenueMode"
);
const selectedDense = dense.rows.filter(
  (row) => row.selectedChannelWeight > 0
);
const selectedFrozen = frozen.rows.filter(
  (row) => row.selectedChannelWeight > 0
);
const gates = {
  channelMasterComplete:
    manifest.channelMaster.confirmedRowCount
      === manifest.channelMaster.rawPairCount,
  canonicalAttributesConsistent:
    manifest.channelMaster.inconsistentCanonicalGroupCount === 0,
  mappingCoveragePassed:
    manifest.mapping.mappingCoverage
      === config.gates.mappingCoverageRequired,
  rowConservationPassed: manifest.mapping.rowConserved === true,
  amountConservationPassed: manifest.mapping.amountConserved === true,
  denseDevelopmentWapePassed:
    dense.overall.wape <= config.gates.developmentWapeMaximum,
  denseDevelopmentBiasPassed:
    Math.abs(dense.overall.signedBias)
      <= config.gates.overallAbsoluteBiasMaximum,
  frozenServedWapePassed:
    frozen.overall.wape <= config.gates.developmentWapeMaximum,
  frozenServedBiasPassed:
    Math.abs(frozen.overall.signedBias)
      <= config.gates.overallAbsoluteBiasMaximum,
  denseNestedImprovementPassed:
    denseComparison.relativeWape
      <= -config.gates.minimumNestedRelativeWapeImprovement,
  frozenNestedImprovementPassed:
    frozenComparison.relativeWape
      <= -config.gates.minimumNestedRelativeWapeImprovement,
  historicalLaunchMonthPassed:
    manifest.featureBoundary
      .verifiedHistoricalLaunchMonthAvailable === true,
  singlePurchaseUnitEconomicsPassed:
    manifest.featureBoundary.singlePurchaseNetUnitPriceAvailable === true,
  historicalChannelStatusPassed:
    manifest.featureBoundary
      .historicalChannelStatusSnapshotAvailable === true,
  independentValidationPassed: false
};
const promotionPassed = Object.values(gates).every(Boolean);
const publicReport = {
  schema: "m2.current.canonical_channel_development.public.v0.1",
  version: "M2-current-canonical-channel-development-v0.1",
  candidateId: config.candidateId,
  target: config.target,
  decisionStatus: "not_for_formal_decision",
  status: promotionPassed
    ? "CANDIDATE_DEVELOPMENT_PASS_INDEPENDENT_VALIDATION_BLOCKED"
    : "CANONICAL_CHANNEL_DEVELOPMENT_FAIL_KEEP_V0_3",
  authorization: {
    source: config.authorization.source,
    newCandidateFamilyDevelopment: true,
    developmentModelFitting: true,
    nestedDevelopmentSelection: true,
    laterOriginValidation: false,
    finalHoldout: false,
    release: false
  },
  dataQuality: {
    intendedGrain:
      "standard_work_x_month_x_canonical_channel_x_role_x_revenue_mode",
    channelMaster: {
      rawPairCount: manifest.channelMaster.rawPairCount,
      canonicalChannelCount:
        manifest.channelMaster.canonicalChannelCount,
      confirmedRowCount: manifest.channelMaster.confirmedRowCount,
      inconsistentCanonicalGroupCount:
        manifest.channelMaster.inconsistentCanonicalGroupCount,
      userMaintainedChannelUid:
        manifest.channelMaster.userMaintainedChannelUid,
      effectiveMonthCoverage:
        manifest.channelMaster.effectiveMonthCoverage,
      roleCounts: manifest.channelMaster.roleCounts,
      revenueModeCounts: manifest.channelMaster.revenueModeCounts
    },
    mapping: manifest.mapping,
    panel: manifest.panel,
    leakage: {
      historyThroughOriginOnly:
        manifest.histories.historyThroughOriginOnly,
      currentStateBackfillUsed:
        manifest.featureBoundary.currentStateBackfillUsed,
      labelsAfter2023_06Used: false,
      finalHoldoutOpened: false,
      postHocStaticChannelAttributesUsed:
        manifest.featureBoundary.postHocStaticChannelAttributesUsed
    }
  },
  featureBoundary: manifest.featureBoundary,
  model: {
    structure:
      "nested_blend_of_exact_fallback_and_canonical_terminal_platform_curves",
    membershipAndAdShareBranch:
      "nonnegative_seasonal_curve_with_damped_recent_trend",
    singlePurchaseBranch:
      "blocked_until_auditable_net_unit_price_exists",
    nonTerminalBranch: "fallback",
    reportingOnlyPostHocAttributes: [
      "third_level_category",
      "current_rating"
    ],
    predictionUsesPostHocCategoryOrRating: false,
    predictionUsesPostHocStaticChannelAttributes: true,
    predictionUsesBuyoutCash: false,
    commitmentSignalUsed: false
  },
  dense25OriginDiagnostic: {
    role: "secondary_development_diagnostic",
    originCount: new Set(dense.rows.map((row) => row.origin)).size,
    caseCount: dense.rows.length,
    baseline: denseComparison.base,
    candidate: denseComparison.candidate,
    relativeWape: denseComparison.relativeWape,
    byHorizon: dense.byHorizon,
    bySegment: dense.bySegment,
    byDominantRevenueMode: denseMode,
    selectedChannelCaseCount: selectedDense.length,
    selectedChannelCaseShare: selectedDense.length / dense.rows.length,
    sameOrLaterOuterTruthRead: false,
    postHocFeatureRead: true
  },
  frozenCurrentServedDiagnostic: {
    role: "nested_comparator_on_current_human_authority_served_population",
    machineRouteAuditCaseCount:
      manifest.frozenCases.machineRouteAuditCaseCount,
    servedWorkCount: manifest.frozenCases.servedWorkCount,
    servedCaseCount: frozen.rows.length,
    baseCandidate: "M2-current-occurrence-amount-calibration-v0.3",
    baseline: frozenComparison.base,
    candidate: frozenComparison.candidate,
    relativeWape: frozenComparison.relativeWape,
    byHorizon: frozen.byHorizon,
    bySegment: frozen.bySegment,
    byDominantRevenueMode: frozenMode,
    selectedChannelCaseCount: selectedFrozen.length,
    selectedChannelCaseShare:
      selectedFrozen.length / frozen.rows.length,
    sameOrLaterOuterTruthRead: false,
    postHocFeatureRead: true,
    populationMoved: true,
    populationChangeReason:
      "human_reviewed_buyout_workbook_membership"
  },
  gates,
  decision: {
    promotionPassed,
    promotionDecision: "REJECT_KEEP_V0_3_WORK_LEVEL_FALLBACK",
    reason: promotionPassed
      ? "independent_validation_is_still_required_before_any_promotion"
      : "absolute_quality_or_required_as_of_feature_gates_failed",
    nextAction:
      "collect_historical_channel_status_and_single_purchase_unit_economics_then_preregister_unseen_later_origin_validation"
  },
  boundaries: {
    aggregateOnly: true,
    identifiersPresent: false,
    rawChannelIdentitiesPresent: false,
    privateRowsPresent: false,
    providerCalled: false,
    databaseConnected: false,
    finalHoldoutOpened: false,
    embargoShadowOpened: false,
    deferredLabelsOpened: false,
    releaseAuthorized: false
  }
};
const privateEvaluationRows = [
  ...dense.rows.map((row) => privateEvaluationRow(row, "dense_25_origin")),
  ...frozen.rows.map((row) => privateEvaluationRow(row, "frozen_served"))
];
const privateEvaluationText = privateEvaluationRows
  .map((row) => JSON.stringify(row))
  .join("\n") + "\n";
const privateEvaluationPath = path.join(
  outputDirectory,
  "M2-current-canonical-channel-evaluation-private-v0.1.ndjson"
);
const privateEvaluationManifestPath = path.join(
  outputDirectory,
  "M2-current-canonical-channel-evaluation-manifest-private-v0.1.json"
);
const publicText = `${JSON.stringify(publicReport, null, 2)}\n`;
await writeFile(privateEvaluationPath, privateEvaluationText, "utf8");
await writeFile(
  privateEvaluationManifestPath,
  `${JSON.stringify({
    schema:
      "m2.current.canonical_channel_evaluation.private_manifest.v0.1",
    tracked: false,
    rowCount: privateEvaluationRows.length,
    sha256: sha256(privateEvaluationText),
    sourceManifestSha256: sha256(
      `${JSON.stringify(manifest, null, 2)}\n`
    ),
    publicReportSha256: sha256(publicText),
    providerCalled: false,
    databaseConnected: false,
    finalHoldoutOpened: false,
    deferredLabelsOpened: false,
    releaseAuthorized: false
  }, null, 2)}\n`,
  "utf8"
);
await mkdir(path.dirname(path.join(root, config.publicOutput)), {
  recursive: true
});
await writeFile(path.join(root, config.publicOutput), publicText, "utf8");
await writeFile(
  path.join(root, config.publicReport),
  renderMarkdown(publicReport),
  "utf8"
);
process.stdout.write(`${JSON.stringify({
  status: publicReport.status,
  mappingCoverage: publicReport.dataQuality.mapping.mappingCoverage,
  denseWape: publicReport.dense25OriginDiagnostic.candidate.wape,
  frozenServedWape:
    publicReport.frozenCurrentServedDiagnostic.candidate.wape,
  promotionDecision: publicReport.decision.promotionDecision,
  finalHoldoutOpened: false
}, null, 2)}\n`);

function seasonalNaivePoint(channels, horizonMonths) {
  let total = 0;
  for (const channel of channels) {
    const values = channel.historySeries.map(Number)
      .map((value) => Math.max(0, value));
    if (values.length === 0) continue;
    for (let offset = 1; offset <= horizonMonths; offset += 1) {
      const seasonalIndex = values.length - 12 + (offset - 1) % 12;
      total += seasonalIndex >= 0 && seasonalIndex < values.length
        ? values[seasonalIndex]
        : mean(values.slice(-Math.min(6, values.length)));
    }
  }
  return Math.max(0, total);
}

function joinHistories(rows, histories) {
  return rows.map((row) => {
    const history = histories.get(row.historyKey);
    if (!history) {
      throw new Error("m2_current_canonical_channel_history_join_failed");
    }
    return {
      ...row,
      canonicalChannels: history.canonicalChannels,
      dominantRevenueMode: history.dominantRevenueMode,
      observedSalesAgeMonths: history.observedSalesAgeMonths,
      thirdLevelCategoryReportingOnly:
        history.thirdLevelCategoryReportingOnly,
      currentRatingReportingOnly:
        history.currentRatingReportingOnly
    };
  });
}

function comparison(baseRows, candidateRows) {
  const base = scoreM2CurrentPointRows(baseRows);
  const candidate = scoreM2CurrentPointRows(candidateRows);
  return {
    base,
    candidate,
    relativeWape: candidate.wape / base.wape - 1
  };
}

function verifyManifest({
  manifest,
  historyText,
  denseText,
  frozenText,
  config
}) {
  if (
    manifest.schema
      !== "m2.current.canonical_channel.private_manifest.v0.1"
    || manifest.tracked !== false
    || manifest.mapping.mappingCoverage !== 1
    || manifest.mapping.rowConserved !== true
    || manifest.mapping.amountConserved !== true
    || manifest.histories.sha256 !== sha256(historyText)
    || manifest.denseCases.sha256 !== sha256(denseText)
    || manifest.frozenCases.sha256 !== sha256(frozenText)
    || manifest.denseCases.originCount
      !== config.dataContract.denseDevelopment.originCount
    || manifest.frozenCases.servedCaseCount
      !== config.dataContract.currentHumanAuthorityServed.caseCount
    || manifest.frozenCases.servedWorkCount
      !== config.dataContract.currentHumanAuthorityServed.workCount
    || manifest.providerCalled !== false
    || manifest.databaseConnected !== false
    || manifest.finalHoldoutOpened !== false
    || manifest.deferredLabelsOpened !== false
    || manifest.releaseAuthorized !== false
  ) {
    throw new Error("m2_current_canonical_channel_manifest_invalid");
  }
}

function assertAuthorization(value) {
  const authorization = value?.authorization;
  if (
    value?.schema
      !== "m2.current.canonical_channel_development.v0.1"
    || authorization?.newCandidateFamilyDevelopment !== true
    || authorization?.developmentModelFitting !== true
    || authorization?.nestedDevelopmentSelection !== true
    || authorization?.laterOriginValidation !== false
    || authorization?.finalHoldout !== false
    || authorization?.embargoShadow !== false
    || authorization?.deferredLabels !== false
    || authorization?.provider !== false
    || authorization?.database !== false
    || authorization?.release !== false
  ) {
    throw new Error(
      "m2_current_canonical_channel_authorization_invalid"
    );
  }
}

function privateEvaluationRow(row, population) {
  return {
    population,
    standardWorkId: row.standardWorkId,
    origin: row.origin,
    horizonMonths: row.horizonMonths,
    segment: row.segment,
    dominantRevenueMode: row.dominantRevenueMode,
    actual: row.actual,
    basePointEstimate: row.basePointEstimate,
    channelPointEstimate: row.channelPointEstimate,
    candidatePointEstimate: row.pointEstimate,
    selectedChannelWeight: row.selectedChannelWeight,
    labelAvailableAsOf: row.labelAvailableAsOf
  };
}

function parseNdjson(text) {
  return text.split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function mean(values) {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function percent(value) {
  return `${(value * 100).toFixed(2)}%`;
}

function metricLine(label, value) {
  return `| ${label} | ${value.caseCount.toLocaleString("zh-CN")} `
    + `| ${value.wape.toFixed(6)} | ${value.signedBias.toFixed(6)} |`;
}

function renderMarkdown(report) {
  const denseReport = report.dense25OriginDiagnostic;
  const frozenReport = report.frozenCurrentServedDiagnostic;
  return `# M2 canonical 渠道分层模型 development 结果 v0.1

日期：2026-07-26
性质：development evidence；不是 final holdout、Canary 或发布结论

## 结论

渠道治理本身通过：${report.dataQuality.channelMaster.rawPairCount} 个原始
ID/名称组合全部映射，归并为
${report.dataQuality.channelMaster.canonicalChannelCount} 个 canonical 渠道；
账单行数、金额和 100% 映射覆盖均守恒。

新候选仍维持 **${report.decision.promotionDecision}**。25-origin 诊断 WAPE 为
${denseReport.candidate.wape.toFixed(6)}，当前人工权威 served
${frozenReport.servedCaseCount.toLocaleString("zh-CN")} case 上 WAPE 为
${frozenReport.candidate.wape.toFixed(6)}。独立验证、历史渠道状态、真实上线月和
单购净单价仍未具备，因此不能把本轮结果表述为成熟模型。

## 数据质量门禁

- 意图粒度：作品 × 月 × canonical 渠道 × 渠道角色 × 收入模式。
- 原始映射：${report.dataQuality.channelMaster.rawPairCount}；canonical 渠道：
  ${report.dataQuality.channelMaster.canonicalChannelCount}。
- 分成账单：${report.dataQuality.mapping.salesShareFactCount.toLocaleString("zh-CN")}
  行；映射覆盖 ${percent(report.dataQuality.mapping.mappingCoverage)}。
- 完整月份截止：${report.dataQuality.panel.latestCompleteMonth}；
  不完整 2026-05 仍排除。
- 行数守恒：${report.gates.rowConservationPassed ? "PASS" : "FAIL"}；
  金额守恒：${report.gates.amountConservationPassed ? "PASS" : "FAIL"}。
- 买断现金、commitment、当前状态事后回填均未进入预测。

## 回测

| 人口 | case | WAPE | bias |
|---|---:|---:|---:|
${metricLine("25-origin seasonal-naive 基线", denseReport.baseline)}
${metricLine("25-origin canonical-channel 候选", denseReport.candidate)}
${metricLine("7,083-case exact v0.3 fallback", frozenReport.baseline)}
${metricLine("7,083-case canonical-channel 候选", frozenReport.candidate)}

25-origin 相对 WAPE：
${percent(denseReport.relativeWape)}；冻结 served 相对 WAPE：
${percent(frozenReport.relativeWape)}。被 nested selector 实际采用渠道权重的
case 占比分别为 ${percent(denseReport.selectedChannelCaseShare)} 和
${percent(frozenReport.selectedChannelCaseShare)}。

## 模型边界

会员/广告分成平台使用渠道级季节曲线和阻尼近期趋势；非终端合作方保持 fallback。
单购/点播没有可审计净单价，不能把现金反推为销量，因此本轮明确阻断销量曲线，
没有伪造 30 元定价或 50% 分成比例。三级分类和当前 rating 只用于结果分组，
没有作为 origin 时可得特征。

## 下一步

1. 收集带生效时间的历史渠道状态/合同可售 snapshot。
2. 为单购平台补充可审计的作品净单价或净收入/销量换算口径。
3. 预注册一个未参与 v0.5/v0.7/v0.8/v0.9 设计的 later-origin 验证窗口；
   未获独立验证授权前继续保持 v0.3 fallback。
4. final holdout、provider、数据库、Canary、release 与 M3 formal 继续封存。
`;
}
