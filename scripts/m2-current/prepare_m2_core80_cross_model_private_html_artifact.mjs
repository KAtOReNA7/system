import fs from "node:fs/promises";
import path from "node:path";

const CAMPAIGN_ID = "M2-CMX01";
const STATUS = "M2_CMX01_HISTORICAL_CROSS_EVALUATION_COMPLETE_DECISION_PENDING";

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--public-report") result.publicReport = argv[++index];
    else if (token === "--output") result.output = argv[++index];
    else throw new Error(`Unknown argument: ${token}`);
  }
  if (!result.publicReport || !result.output) {
    throw new Error("Usage: node prepare_m2_core80_cross_model_private_html_artifact.mjs --public-report <json> --output <artifact.json>");
  }
  return { publicReport: path.resolve(result.publicReport), output: path.resolve(result.output) };
}

function winnersToRows(winners, dimension) {
  return Object.entries(winners).map(([slice, value]) => ({
    [dimension]: slice,
    status: value.status,
    winnerVariantId: value.modelVariantId,
    coWinnerVariantIds: value.coWinnerVariantIds?.join(" | ") ?? null,
    wape: value.wape ?? null,
    caseCount: value.caseCount ?? null,
    workCount: value.workCount ?? null,
  }));
}

function flattenNativeChannels(report) {
  return report.comparison.channelLeaderboards.native.flatMap((channel) => {
    if (!channel.leaderboard.length) {
      return [
        {
          businessChannel: channel.businessChannel,
          status: channel.status,
          rank: null,
          modelVariantId: null,
          caseCount: channel.commonCaseCount,
          workCount: channel.commonWorkCount,
          wape: null,
          signedBias: null,
          coverage: null,
        },
      ];
    }
    return channel.leaderboard.map((row) => ({
      businessChannel: channel.businessChannel,
      status: channel.status,
      rank: row.rank,
      modelLabel:
        row.modelId === "M2-WORK-CRMR01"
          ? "CRMR01"
          : row.modelId === "M2-CHAN-SCL01"
            ? "SCL01/A6"
            : row.modelId === "M2-CHAN-PSC01"
              ? "PSC01 raw"
              : row.modelId,
      modelVariantId: row.modelVariantId,
      caseCount: row.caseCount,
      workCount: row.workCount,
      wape: row.wape,
      signedBias: row.signedBias,
      coverage: row.coverage,
    }));
  });
}

function buildArtifact(report) {
  if (report.campaignId !== CAMPAIGN_ID || report.status !== STATUS) {
    throw new Error(`Unexpected public evaluation authority: ${report.campaignId} / ${report.status}`);
  }
  const generatedAt = new Date().toISOString();
  const title = "2020–2025 Core80 全模型真实业务横评 v0.1";
  const lg = report.conclusions.lg01ModelAvailableOverall;
  const horizonWinners = winnersToRows(report.conclusions.horizonWinners, "horizon");
  const annualWinners = winnersToRows(report.conclusions.annualH12Winners, "year");
  const nativeChannels = flattenNativeChannels(report);
  const overallModels = report.comparison.modelAvailable
    .filter(
      (row) =>
        row.populationId === "ORIGIN_VISIBLE_DYNAMIC_CORE80" &&
        row.sliceType === "OVERALL" &&
        row.sliceId === "ALL",
    )
    .sort((left, right) => left.wape - right.wape);
  const modelAvailableSlices = report.comparison.modelAvailable
    .filter((row) => row.sliceType !== "ORIGIN")
    .map((row) => ({
      populationId: row.populationId,
      sliceType: row.sliceType,
      sliceId: row.sliceId,
      modelId: row.modelId,
      modelVariantId: row.modelVariantId,
      caseCount: row.caseCount,
      workCount: row.workCount,
      coverage: row.coverage,
      wape: row.wape,
      signedBias: row.signedBias,
      predictedActualRatio: row.predictedActualRatio,
      failureRate: row.failureRate,
      catastropheCount: row.catastropheCount,
    }));
  const modelAvailableDynamic = modelAvailableSlices.filter(
    (row) => row.populationId === "ORIGIN_VISIBLE_DYNAMIC_CORE80",
  );
  const modelAvailableHindsight = modelAvailableSlices.filter(
    (row) => row.populationId === "ANNUAL_ACTUAL_CORE80_HINDSIGHT_DIAGNOSTIC",
  );
  const modelAvailableAll = modelAvailableSlices.filter(
    (row) => row.populationId === "ALL_ELIGIBLE_WORKS_DIAGNOSTIC",
  );
  const sliceDatasets = [
    "model_available_dynamic",
    "model_available_hindsight",
    "model_available_all",
  ];
  const pairwise = report.comparison.lg01PairedBootstrap.map((row) => ({
    candidateModelVariantId: row.candidateModelVariantId,
    matchedCaseCount: row.matchedCaseCount,
    blockCount: row.blockCount,
    pointDifferenceCandidateMinusLg01: row.pointDifferenceCandidateMinusLg01,
    lower95CandidateMinusLg01: row.lower95CandidateMinusLg01,
    upper95CandidateMinusLg01: row.upper95CandidateMinusLg01,
    probabilityCandidateBetter: row.probabilityCandidateBetter,
    empiricalTwoSidedP: row.empiricalTwoSidedP,
    holmAdjustedP: row.holmAdjustedP,
  }));
  const headline = [
    {
      registryEntries: report.authority.registryEntryCount,
      eligibleModels: report.authority.formalEligibleRegisteredModelCount,
      evaluationVariants: report.authority.formalEvaluationVariantCount,
      globalCommonCases: report.conclusions.globalAllVariantCommonCaseCount,
      lgWape: lg.wape,
      lgCoverage: lg.coverage,
    },
  ];
  const deliverables = [
    { purpose: "横评总览", path: "M2-Core80-全模型横评-总览-v0.1.xlsx", usage: "查看总体指标、周期/年度结论和配对 bootstrap。" },
    { purpose: "逐本书比较", path: "M2-Core80-逐本书模型成绩-v0.1.xlsx", usage: "在逐书模型总账按 work_title 筛选，再比较全部 model_id / variant_id。" },
    { purpose: "逐本书逐渠道比较", path: "M2-Core80-逐本书逐渠道模型成绩-v0.1.xlsx", usage: "先按总索引定位模型分片，再按 work_title、channel_name 和 model_output_scope 筛选。" },
    { purpose: "程序查询", path: "M2-CMX01-complete-private-v0.1.sqlite", usage: "用于完整 case 级 SQL 查询。" },
    { purpose: "逐书 case 分区", path: "full-work-prediction-detail/", usage: "UTF-8 BOM CSV；完整、不抽样。" },
    { purpose: "逐书逐渠道 case 分区", path: "full-work-channel-prediction-detail/", usage: "UTF-8 BOM CSV；完整、不抽样。" },
    { purpose: "数据字典", path: "M2-CMX01-data-dictionary-private-v0.1.md", usage: "字段、口径和查询示例。" },
    { purpose: "文件完整性", path: "M2-CMX01-file-manifest-private-v0.1.json", usage: "逐文件字节数、行数和 SHA-256。" },
  ];
  const modelSliceColumns = [
    { field: "sliceType", label: "切片类型", type: "text" },
    { field: "sliceId", label: "年份/周期/分段", type: "text" },
    { field: "modelVariantId", label: "模型变体", type: "text" },
    { field: "coverage", label: "覆盖率", format: "percent" },
    { field: "wape", label: "WAPE", format: "percent" },
  ];
  const modelSliceTables = [
    {
      id: "model_available_dynamic_table",
      title: "模型可用口径：动态起点可见 Core80",
      subtitle: "正式评价人口；可按模型、切片类型和年份/周期/分段筛选，逐月 origin 留在 Excel/SQLite。",
      dataset: "model_available_dynamic",
      sourceId: "cmx01_metrics_sql",
      defaultSort: { field: "wape", direction: "asc" },
      columns: modelSliceColumns,
    },
    {
      id: "model_available_hindsight_table",
      title: "模型可用口径：年度实际 Core80 事后诊断",
      subtitle: "事后人口，不得与动态 Core80 直接排名。",
      dataset: "model_available_hindsight",
      sourceId: "cmx01_metrics_sql",
      defaultSort: { field: "wape", direction: "asc" },
      columns: modelSliceColumns,
    },
    {
      id: "model_available_all_table",
      title: "模型可用口径：全部合格作品诊断",
      subtitle: "诊断人口，不属于当前 M2 服务人口。",
      dataset: "model_available_all",
      sourceId: "cmx01_metrics_sql",
      defaultSort: { field: "wape", direction: "asc" },
      columns: modelSliceColumns,
    },
  ];

  const publicSource = "cmx01_public_evaluation";
  const registrySource = "m2_model_registry";
  const privateDeliverySource = "cmx01_private_delivery";
  const headlineSqlSource = "cmx01_headline_sql";
  const metricsSqlSource = "cmx01_metrics_sql";
  const bootstrapSqlSource = "cmx01_bootstrap_sql";
  const deliverablesSqlSource = "cmx01_deliverables_sql";
  const headlineSql = `WITH model_counts AS (
  SELECT COUNT(DISTINCT model_id) AS eligibleModels, COUNT(*) AS evaluationVariants
  FROM model_variants
), global_common AS (
  SELECT common_case_count AS globalCommonCases
  FROM common_set_audit
  WHERE grain = 'WORK_TOTAL'
    AND model_output_scope = 'NATIVE_WORK_TOTAL'
    AND population_id = 'ORIGIN_VISIBLE_DYNAMIC_CORE80'
    AND slice_type = 'OVERALL'
    AND slice_id = 'ALL'
    AND participant_count = 21
), lg01 AS (
  SELECT wape AS lgWape, coverage AS lgCoverage
  FROM metric_summary
  WHERE comparison_set = 'MODEL_AVAILABLE'
    AND grain = 'WORK_TOTAL'
    AND model_output_scope = 'NATIVE_WORK_TOTAL'
    AND population_id = 'ORIGIN_VISIBLE_DYNAMIC_CORE80'
    AND slice_type = 'OVERALL'
    AND slice_id = 'ALL'
    AND variant_id = 'M2-WORK-LG01/LEARNED_GLOBAL_COMMON_REVERSAL'
)
SELECT model_counts.eligibleModels, model_counts.evaluationVariants,
       global_common.globalCommonCases, lg01.lgWape, lg01.lgCoverage
FROM model_counts CROSS JOIN global_common CROSS JOIN lg01`;
  const metricsSql = `WITH canonical_channels AS (
  SELECT channel_uid, MIN(channel_name) AS channel_name
  FROM channel_cases
  GROUP BY channel_uid
)
SELECT m.comparison_set, m.grain, m.model_output_scope, m.population_id,
       m.slice_type, m.slice_id, m.model_id, m.variant_id,
       m.participant_count, m.case_count, m.work_count, m.expected_case_count,
       m.coverage, m.wape, m.signed_bias, m.predicted_actual_ratio,
       m.failure_rate, m.catastrophe_count, c.channel_name
FROM metric_summary AS m
LEFT JOIN canonical_channels AS c
  ON m.slice_type = 'CHANNEL' AND m.slice_id = c.channel_uid
WHERE (
    m.comparison_set = 'MODEL_AVAILABLE'
    AND m.grain = 'WORK_TOTAL'
    AND m.model_output_scope = 'NATIVE_WORK_TOTAL'
  ) OR (
    m.comparison_set = 'COMMON_MATCHED'
    AND m.population_id = 'ORIGIN_VISIBLE_DYNAMIC_CORE80'
    AND (
      (m.grain = 'WORK_TOTAL' AND m.model_output_scope = 'NATIVE_WORK_TOTAL'
       AND m.slice_type IN ('HORIZON', 'ANNUAL_H12_YEAR'))
      OR
      (m.grain = 'WORK_CHANNEL' AND m.model_output_scope = 'NATIVE_WORK_CHANNEL'
       AND m.slice_type = 'CHANNEL')
    )
  )`;
  const bootstrapSql = `SELECT population_id, baseline_variant_id, candidate_variant_id,
       matched_case_count, block_count, iterations, seed,
       point_difference_candidate_minus_baseline, lower95, median_difference,
       upper95, probability_candidate_better, probability_candidate_noninferior,
       empirical_two_sided_p, holm_adjusted_p
FROM bootstrap_comparison
WHERE population_id = 'ORIGIN_VISIBLE_DYNAMIC_CORE80'
  AND baseline_variant_id = 'M2-WORK-LG01/LEARNED_GLOBAL_COMMON_REVERSAL'
ORDER BY point_difference_candidate_minus_baseline ASC`;
  const deliverablesSql = `SELECT '横评总览' AS purpose, 'M2-Core80-全模型横评-总览-v0.1.xlsx' AS path,
       '查看总体指标、周期/年度结论和配对 bootstrap。' AS usage
UNION ALL SELECT '逐本书比较', 'M2-Core80-逐本书模型成绩-v0.1.xlsx',
       '按 work_title 筛选后比较全部 model_id 与 variant_id。'
UNION ALL SELECT '逐本书逐渠道比较', 'M2-Core80-逐本书逐渠道模型成绩-v0.1.xlsx',
       '先由总索引定位模型分片，再按 work_title、channel_name 与 model_output_scope 筛选。'
UNION ALL SELECT '程序查询', 'M2-CMX01-complete-private-v0.1.sqlite', '用于完整 case 级 SQL 查询。'
UNION ALL SELECT '逐书 case 分区', 'full-work-prediction-detail/', 'UTF-8 BOM CSV；完整、不抽样。'
UNION ALL SELECT '逐书逐渠道 case 分区', 'full-work-channel-prediction-detail/', 'UTF-8 BOM CSV；完整、不抽样。'
UNION ALL SELECT '数据字典', 'M2-CMX01-data-dictionary-private-v0.1.md', '字段、口径和查询示例。'
UNION ALL SELECT '文件完整性', 'M2-CMX01-file-manifest-private-v0.1.json', '逐文件字节数、行数和 SHA-256。'`;
  return {
    surface: "report",
    manifest: {
      version: 1,
      surface: "report",
      title,
      description: "2020–2025 历史起点上的 M2 Core80 登记模型、评价变体、周期、年度、渠道和配对推断横评。",
      generatedAt,
      filters: [
        {
          id: "model_filter",
          label: "模型 ID",
          dataset: "model_available_dynamic",
          field: "modelId",
          includeAll: true,
          targets: sliceDatasets.map((dataset) => ({ dataset, field: "modelId" })),
        },
        {
          id: "slice_filter",
          label: "年份 / 周期 / 分段",
          dataset: "model_available_dynamic",
          field: "sliceId",
          includeAll: true,
          targets: sliceDatasets.map((dataset) => ({ dataset, field: "sliceId" })),
        },
        {
          id: "channel_filter",
          label: "重点渠道",
          dataset: "native_channels",
          field: "businessChannel",
          includeAll: true,
          targets: [{ dataset: "native_channels", field: "businessChannel" }],
        },
      ],
      cards: [
        { id: "eligible_models", dataset: "headline", sourceId: headlineSqlSource, description: "通过预注册资格审计的登记模型，不含重复实验臂。", metrics: [{ label: "合格登记模型", field: "eligibleModels", format: "number" }] },
        { id: "evaluation_variants", dataset: "headline", sourceId: headlineSqlSource, description: "由合格模型形成的评价变体与实验臂数量。", metrics: [{ label: "评价变体", field: "evaluationVariants", format: "number" }] },
        { id: "global_common", dataset: "headline", sourceId: headlineSqlSource, description: "21 个冻结变体在同一 case 上的全局交集。", metrics: [{ label: "全变体共同 case", field: "globalCommonCases", format: "number" }] },
        { id: "lg_wape", dataset: "headline", sourceId: headlineSqlSource, description: "动态起点可见 Core80、模型可用口径；不是统一共同样本冠军分数。", metrics: [{ label: "LG01 WAPE", field: "lgWape", format: "percent" }] },
      ],
      charts: [
        {
          id: "horizon_wape",
          title: "严格共同样本：各周期最低 WAPE",
          subtitle: "H3、H6、H12、H36 的胜出模型发生翻转；只在各自共同样本内解释。",
          type: "bar",
          dataset: "horizon_winners",
          sourceId: metricsSqlSource,
          valueFormat: "percent",
          encodings: {
            x: { field: "horizon", type: "nominal", label: "预测周期" },
            y: { field: "wape", type: "quantitative", label: "WAPE" },
            tooltip: [
              { field: "winnerVariantId", type: "nominal", label: "胜出变体" },
              { field: "caseCount", type: "quantitative", label: "case" },
              { field: "workCount", type: "quantitative", label: "作品" },
            ],
          },
        },
        {
          id: "annual_wape",
          title: "严格共同样本：年度 H12 最低 WAPE",
          subtitle: "2020 年因隐私阈值不足不发布；2021–2025 的胜出模型并不稳定。",
          type: "bar",
          dataset: "annual_winners",
          sourceId: metricsSqlSource,
          valueFormat: "percent",
          encodings: {
            x: { field: "year", type: "nominal", label: "目标年度" },
            y: { field: "wape", type: "quantitative", label: "WAPE" },
            tooltip: [{ field: "winnerVariantId", type: "nominal", label: "胜出变体" }],
          },
        },
        {
          id: "native_channel_wape",
          title: "重点原生渠道共同样本 WAPE",
          subtitle: "只展示通过隐私阈值的原生渠道共同样本；猫耳和漫播没有可发布排名。",
          type: "bar",
          dataset: "native_channels",
          sourceId: metricsSqlSource,
          valueFormat: "percent",
          encodings: {
            x: { field: "businessChannel", type: "nominal", label: "渠道" },
            y: { field: "wape", type: "quantitative", label: "WAPE" },
            color: { field: "modelLabel", type: "nominal", label: "模型" },
            tooltip: [
              { field: "rank", type: "quantitative", label: "渠道内排名" },
              { field: "caseCount", type: "quantitative", label: "case" },
            ],
          },
        },
      ],
      tables: [
        {
          id: "horizon_table",
          title: "周期共同样本胜出明细",
          subtitle: "每行仅在相同周期的严格共同样本内比较。",
          dataset: "horizon_winners",
          sourceId: metricsSqlSource,
          defaultSort: { field: "horizon", direction: "asc" },
          columns: [
            { field: "horizon", label: "周期", type: "text" },
            { field: "winnerVariantId", label: "胜出变体", type: "text" },
            { field: "wape", label: "WAPE", format: "percent" },
            { field: "caseCount", label: "case", format: "number" },
            { field: "workCount", label: "作品", format: "number" },
          ],
        },
        {
          id: "annual_table",
          title: "年度 H12 共同样本胜出明细",
          subtitle: "2020–2025；隐私阈值不足的年度保留为空，不补 0。",
          dataset: "annual_winners",
          sourceId: metricsSqlSource,
          defaultSort: { field: "year", direction: "asc" },
          columns: [
            { field: "year", label: "年度", type: "text" },
            { field: "winnerVariantId", label: "胜出变体", type: "text" },
            { field: "wape", label: "WAPE", format: "percent" },
            { field: "caseCount", label: "case", format: "number" },
            { field: "workCount", label: "作品", format: "number" },
          ],
        },
        {
          id: "overall_models_table",
          title: "动态 Core80 模型可用口径总览",
          subtitle: "覆盖率不同，不等于严格共同样本排名；按 WAPE 升序仅作描述。",
          dataset: "overall_models",
          sourceId: metricsSqlSource,
          defaultSort: { field: "wape", direction: "asc" },
          columns: [
            { field: "modelVariantId", label: "模型变体", type: "text" },
            { field: "caseCount", label: "case", format: "number" },
            { field: "coverage", label: "覆盖率", format: "percent" },
            { field: "wape", label: "WAPE", format: "percent" },
            { field: "signedBias", label: "有符号偏差", format: "percent" },
          ],
        },
        ...modelSliceTables,
        {
          id: "native_channels_table",
          title: "重点原生渠道共同样本排名",
          subtitle: "原生渠道能力与统一 allocator 诊断分开；raw candidate 不被 fallback 替换。",
          dataset: "native_channels",
          sourceId: metricsSqlSource,
          defaultSort: { field: "wape", direction: "asc" },
          columns: [
            { field: "businessChannel", label: "渠道", type: "text" },
            { field: "rank", label: "排名", format: "number" },
            { field: "modelVariantId", label: "模型变体", type: "text" },
            { field: "wape", label: "WAPE", format: "percent" },
            { field: "signedBias", label: "偏差", format: "percent" },
          ],
        },
        {
          id: "pairwise_table",
          title: "相对 LG01 的配对 block bootstrap",
          subtitle: "5,000 次、作品+起点 block、固定种子 20260802，并执行 Holm 多重校正。",
          dataset: "pairwise",
          sourceId: bootstrapSqlSource,
          defaultSort: { field: "pointDifferenceCandidateMinusLg01", direction: "asc" },
          columns: [
            { field: "candidateModelVariantId", label: "候选变体", type: "text" },
            { field: "pointDifferenceCandidateMinusLg01", label: "候选-LG01 WAPE", format: "percent" },
            { field: "lower95CandidateMinusLg01", label: "95% 下界", format: "percent" },
            { field: "upper95CandidateMinusLg01", label: "95% 上界", format: "percent" },
            { field: "holmAdjustedP", label: "Holm p", format: "percent" },
          ],
        },
        {
          id: "deliverables_table",
          title: "逐书与逐渠道完整证据入口",
          subtitle: "HTML 保持聚合且有界；完整作品标识、金额和 case 行在 Git ignored 私有交付中。",
          dataset: "deliverables",
          sourceId: deliverablesSqlSource,
          defaultSort: { field: "purpose", direction: "asc" },
          columns: [
            { field: "purpose", label: "用途", type: "text" },
            { field: "path", label: "私有目录内路径", type: "text" },
          ],
        },
      ],
      sources: [
        { id: publicSource, label: "M2-CMX01 公开冻结评价", path: "docs/analysis/m2-current/M2-core80-cross-model-real-business-evaluation-v0.1.json" },
        { id: registrySource, label: "M2 Model Registry", path: "config/m2-model-registry.v1.json" },
        { id: privateDeliverySource, label: "M2-CMX01 Git ignored 私有交付", path: "data/private-output/m2-core80-cross-model-real-business-evaluation-v0.1/" },
        { id: headlineSqlSource, label: "M2-CMX01 私有 SQLite 头部指标查询", path: "data/private-output/m2-core80-cross-model-real-business-evaluation-v0.1/M2-CMX01-complete-private-v0.1.sqlite" },
        { id: metricsSqlSource, label: "M2-CMX01 私有 SQLite 指标切片查询", path: "data/private-output/m2-core80-cross-model-real-business-evaluation-v0.1/M2-CMX01-complete-private-v0.1.sqlite" },
        { id: bootstrapSqlSource, label: "M2-CMX01 私有 SQLite 配对 bootstrap 查询", path: "data/private-output/m2-core80-cross-model-real-business-evaluation-v0.1/M2-CMX01-complete-private-v0.1.sqlite" },
        { id: deliverablesSqlSource, label: "M2-CMX01 私有交付入口查询", path: "data/private-output/m2-core80-cross-model-real-business-evaluation-v0.1/" },
      ],
      blocks: [
        { id: "title", type: "markdown", body: `# ${title}\n\n历史横评（historical cross-model evaluation），不是模型开发、激活或生产授权。` },
        { id: "executive_summary", type: "markdown", sourceId: publicSource, body: "## 结论先行\n\n不存在覆盖全部 21 个冻结评价变体的全局共同样本，因此不能宣布统一历史冠军。周期、年度和重点渠道均出现排名翻转；当前证据只支持“不同模型适合不同业务切片”。动态起点可见 Core80 的 LG01 模型可用口径 WAPE 为 32.23%，但该值不能替代严格共同样本比较。" },
        { id: "headline_metrics", type: "metric-strip", cardIds: ["eligible_models", "evaluation_variants", "global_common", "lg_wape"] },
        { id: "horizon_narrative", type: "markdown", sourceId: publicSource, body: "## 周期结论\n\nH3 由 CHAM01/B3 胜出，H6 与 H12 由 LG01 胜出，H36 由 HR01 与 LG01 并列。每个周期的共同样本集合不同，图表用于显示方向翻转，不构成跨周期统一排名。" },
        { id: "horizon_chart", type: "chart", chartId: "horizon_wape" },
        { id: "horizon_detail", type: "table", tableId: "horizon_table" },
        { id: "annual_narrative", type: "markdown", sourceId: publicSource, body: "## 年度结论\n\n2021–2025 年度 H12 的共同样本胜出模型依次发生变化；2020 年只有 8 部共同作品，低于公开隐私阈值，因此保留为空而不是补 0。" },
        { id: "annual_chart", type: "chart", chartId: "annual_wape" },
        { id: "annual_detail", type: "table", tableId: "annual_table" },
        { id: "model_scope_narrative", type: "markdown", sourceId: publicSource, body: "## 模型可用口径与公开切片\n\n模型可用口径保留各模型真实覆盖率，不能当作严格共同样本总榜。下方有界 HTML 表保留年度、周期、现金分段、目标年度和总体切片；逐月 origin 明细留在 Excel/SQLite。" },
        { id: "overall_models", type: "table", tableId: "overall_models_table" },
        { id: "model_available_dynamic", type: "table", tableId: "model_available_dynamic_table" },
        { id: "model_available_hindsight", type: "table", tableId: "model_available_hindsight_table" },
        { id: "model_available_all", type: "table", tableId: "model_available_all_table" },
        { id: "channel_narrative", type: "markdown", sourceId: publicSource, body: "## 渠道能力\n\n喜马拉雅与微信读书由 CRMR01 胜出，番茄畅听由 SCL01 完整臂胜出；猫耳和漫播未达到公开共同样本阈值。原生渠道输出与统一 allocator 构成诊断是两种不同能力。" },
        { id: "channel_chart", type: "chart", chartId: "native_channel_wape" },
        { id: "channel_table", type: "table", tableId: "native_channels_table" },
        { id: "inference_narrative", type: "markdown", sourceId: publicSource, body: "## 配对推断\n\n相对 LG01 的 5,000 次配对作品+起点 block bootstrap 与 Holm 校正没有识别出显著更优的候选。该结论不授权激活；冻结 HPSR02 与 PSC03 只作附录引用，均未重跑。" },
        { id: "pairwise", type: "table", tableId: "pairwise_table" },
        { id: "lookup_narrative", type: "markdown", body: "## 如何查某一本书或某个渠道\n\n本 HTML 为有界聚合报告，不嵌入私有作品名和绝对金额。要比较某一本书，打开逐本书工作簿，在 `work_title` 过滤后保留全部 `model_id` 与 `variant_id`；要比较某个渠道，先在渠道总索引按模型变体定位分片，再在分片中按 `channel_name`、`work_title` 和 `model_output_scope` 组合筛选。SQLite 与 CSV 分区提供完整 case 级查询。" },
        { id: "deliverables", type: "table", tableId: "deliverables_table" },
        { id: "boundaries", type: "markdown", body: "## 边界与下一步\n\n状态为 `M2_CMX01_HISTORICAL_CROSS_EVALUATION_COMPLETE_DECISION_PENDING`。未训练、调参或创建模型；未重跑 HPSR02/PSC03；未打开 final holdout；未授权 production、automation、财务使用或 M3 formal。下一步只能提出决策建议，不能在本活动内自行激活模型。" },
      ],
    },
    snapshot: {
      version: 1,
      generatedAt,
      status: "ready",
      datasets: {
        headline,
        horizon_winners: horizonWinners,
        annual_winners: annualWinners,
        overall_models: overallModels,
        model_available_dynamic: modelAvailableDynamic,
        model_available_hindsight: modelAvailableHindsight,
        model_available_all: modelAvailableAll,
        native_channels: nativeChannels,
        pairwise,
        deliverables,
      },
      accessIssues: [],
    },
    sources: [
      { id: publicSource, label: "M2-CMX01 公开冻结评价", path: "docs/analysis/m2-current/M2-core80-cross-model-real-business-evaluation-v0.1.json" },
      { id: registrySource, label: "M2 Model Registry", path: "config/m2-model-registry.v1.json" },
      { id: privateDeliverySource, label: "M2-CMX01 Git ignored 私有交付", path: "data/private-output/m2-core80-cross-model-real-business-evaluation-v0.1/" },
      {
        id: headlineSqlSource,
        label: "M2-CMX01 私有 SQLite 头部指标查询",
        path: "data/private-output/m2-core80-cross-model-real-business-evaluation-v0.1/M2-CMX01-complete-private-v0.1.sqlite",
        query: {
          engine: "sqlite",
          language: "sql",
          sql: headlineSql,
          description: "从冻结 CMX01 SQLite 的模型变体、共同样本审计和指标汇总表读取头部指标。",
          executed_at: generatedAt,
          tables_used: ["model_variants", "common_set_audit", "metric_summary"],
          filters: {
            population_id: "ORIGIN_VISIBLE_DYNAMIC_CORE80",
            grain: "WORK_TOTAL",
            comparison_set: "MODEL_AVAILABLE",
          },
          metric_definitions: {
            eligibleModels: "model_variants 中 distinct model_id 数量。",
            evaluationVariants: "model_variants 行数。",
            globalCommonCases: "21 个评价变体在动态 Core80、作品总额、OVERALL 切片上的共同 case 数。",
            lgWape: "LG01 在动态 Core80、作品总额、模型可用口径 OVERALL 切片上的 absolute_error_total / actual_denominator。",
          },
        },
      },
      {
        id: metricsSqlSource,
        label: "M2-CMX01 私有 SQLite 指标切片查询",
        path: "data/private-output/m2-core80-cross-model-real-business-evaluation-v0.1/M2-CMX01-complete-private-v0.1.sqlite",
        query: {
          engine: "sqlite",
          language: "sql",
          sql: metricsSql,
          description: "读取模型可用、严格共同样本、周期、年度和原生渠道指标；报告层再按隐私阈值和最低 WAPE 形成公开聚合。",
          executed_at: generatedAt,
          tables_used: ["metric_summary", "channel_cases"],
          filters: {
            public_minimum_case_count: 30,
            public_minimum_work_count: 20,
            actual_definition: "M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01",
          },
          metric_definitions: {
            wape: "absolute_error_total / actual_denominator。",
            signedBias: "(prediction_total - actual_total) / actual_denominator。",
            coverage: "可评价 case_count / expected_case_count。",
          },
        },
      },
      {
        id: bootstrapSqlSource,
        label: "M2-CMX01 私有 SQLite 配对 bootstrap 查询",
        path: "data/private-output/m2-core80-cross-model-real-business-evaluation-v0.1/M2-CMX01-complete-private-v0.1.sqlite",
        query: {
          engine: "sqlite",
          language: "sql",
          sql: bootstrapSql,
          description: "读取冻结的 LG01 配对作品+起点 block bootstrap 与 Holm 校正结果。",
          executed_at: generatedAt,
          tables_used: ["bootstrap_comparison"],
          filters: {
            population_id: "ORIGIN_VISIBLE_DYNAMIC_CORE80",
            baseline_variant_id: "M2-WORK-LG01/LEARNED_GLOBAL_COMMON_REVERSAL",
            iterations: 5000,
            seed: 20260802,
          },
        },
      },
      {
        id: deliverablesSqlSource,
        label: "M2-CMX01 私有交付入口查询",
        path: "data/private-output/m2-core80-cross-model-real-business-evaluation-v0.1/",
        query: {
          engine: "sqlite",
          language: "sql",
          sql: deliverablesSql,
          description: "生成私有交付目录内的稳定相对路径与用途清单。",
          executed_at: generatedAt,
          tables_used: [],
        },
      },
    ],
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = JSON.parse(await fs.readFile(args.publicReport, "utf8"));
  const artifact = buildArtifact(report);
  await fs.mkdir(path.dirname(args.output), { recursive: true });
  await fs.writeFile(args.output, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(
    JSON.stringify(
      {
        campaignId: CAMPAIGN_ID,
        status: STATUS,
        output: args.output,
        datasets: Object.fromEntries(Object.entries(artifact.snapshot.datasets).map(([key, rows]) => [key, rows.length])),
      },
      null,
      2,
    ),
  );
}

await main();
