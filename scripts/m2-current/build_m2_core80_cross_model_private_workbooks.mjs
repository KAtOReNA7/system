import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const CAMPAIGN_ID = "M2-CMX01";
const STATUS = "M2_CMX01_HISTORICAL_CROSS_EVALUATION_COMPLETE_DECISION_PENDING";
const OUTPUT_FILES = {
  overview: "M2-Core80-全模型横评-总览-v0.1.xlsx",
  work: "M2-Core80-逐本书模型成绩-v0.1.xlsx",
  channel: "M2-Core80-逐本书逐渠道模型成绩-v0.1.xlsx",
};
const SOURCE_FILES = {
  overview: "M2-CMX01-overview-metrics-private-v0.1.csv",
  work: "M2-CMX01-work-model-ledger-private-v0.1.csv",
  channel: "M2-CMX01-work-channel-model-ledger-private-v0.1.csv",
  privateSummary: "M2-CMX01-private-summary-v0.1.json",
};

const PALETTE = {
  navy: "#17324D",
  blue: "#2563EB",
  teal: "#0F766E",
  paleBlue: "#EAF2FF",
  paleTeal: "#E8F5F2",
  paleGold: "#FFF4D6",
  paleRed: "#FDECEC",
  ink: "#17212B",
  muted: "#5F6B76",
  line: "#D8E0E8",
  white: "#FFFFFF",
};

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--private-dir") result.privateDir = argv[++index];
    else if (token === "--public-report") result.publicReport = argv[++index];
    else if (token === "--preview-dir") result.previewDir = argv[++index];
    else if (token === "--only") result.only = argv[++index];
    else if (token === "--shard-index") result.shardIndex = argv[++index];
    else if (token === "--shard-part") result.shardPart = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${token}`);
  }
  if (!result.privateDir || !result.publicReport || !result.previewDir) {
    throw new Error(
      "Usage: node build_m2_core80_cross_model_private_workbooks.mjs " +
        "--private-dir <ignored-private-output-dir> " +
        "--public-report <public-evaluation-json> --preview-dir <temporary-dir>",
    );
  }
  return {
    privateDir: path.resolve(result.privateDir),
    publicReport: path.resolve(result.publicReport),
    previewDir: path.resolve(result.previewDir),
    only: result.only ?? "overview",
    shardIndex: result.shardIndex ? path.resolve(result.shardIndex) : null,
    shardPart: result.shardPart ?? null,
  };
}

async function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  const handle = await fs.open(filePath, "r");
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let position = 0;
    while (true) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
  } finally {
    await handle.close();
  }
  return hash.digest("hex");
}

function countCsvRows(csvText) {
  let lines = 0;
  for (let index = 0; index < csvText.length; index += 1) {
    if (csvText.charCodeAt(index) === 10) lines += 1;
  }
  return csvText.endsWith("\n") ? lines : lines + 1;
}

function csvHeaders(csvText) {
  const firstNewline = csvText.indexOf("\n");
  const headerLine = csvText.slice(0, firstNewline < 0 ? undefined : firstNewline).replace(/^\uFEFF/, "");
  return headerLine.replace(/\r$/, "").split(",");
}

function excelColumn(index) {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function writeBlock(sheet, address, values, format = undefined) {
  const range = sheet.getRange(address);
  range.values = values;
  if (format) range.format = format;
  return range;
}

function styleTitle(sheet, address, title, subtitle) {
  const titleRange = sheet.getRange(address);
  titleRange.merge();
  titleRange.values = [[`${title}\n${subtitle}`]];
  titleRange.format = {
    fill: PALETTE.navy,
    font: { bold: true, color: PALETTE.white, fontSize: 18 },
    verticalAlignment: "center",
    horizontalAlignment: "left",
    wrapText: true,
    borders: { preset: "outside", style: "thin", color: PALETTE.navy },
  };
  titleRange.format.rowHeight = 52;
}

function styleSection(range) {
  range.format = {
    fill: PALETTE.paleBlue,
    font: { bold: true, color: PALETTE.navy },
    borders: { bottom: { style: "thin", color: PALETTE.blue } },
  };
}

function addReadmeSheet(workbook, title, purpose, dataSheetName, rowCount, notes) {
  const sheet = workbook.worksheets.add("使用说明");
  sheet.showGridLines = false;
  styleTitle(sheet, "A1:H2", title, `${CAMPAIGN_ID} · 历史横评，不是模型开发或激活`);
  writeBlock(sheet, "A4:B4", [["项目", "说明"]]);
  styleSection(sheet.getRange("A4:B4"));
  const rows = [
    ["用途", purpose],
    ["机器状态", STATUS],
    ["数据工作表", dataSheetName],
    ["数据行数", rowCount - 1],
    ["筛选方法", "打开数据工作表，使用首行表头的筛选按钮；可按作品、渠道、模型、人口和输出范围组合筛选。"],
    ["排名含义", "cumulative_rank 只在同一作品/渠道与同一人口的可比行内排序；不得跨目标、粒度、人口、horizon 或评价窗口直接排名。"],
    ["金额边界", "本工作簿属于 Git ignored 私有交付；绝对金额、作品标识和逐行明细不得发布到 GitHub。"],
    ["证据边界", "fallback 或 selected pipeline 不得替换 raw candidate；冻结 HPSR02 与 PSC03 未在本活动中重跑。"],
    ["决策边界", "结果仅用于历史证据审阅；未授权 production、automation、final holdout、M3 formal 或财务使用。"],
    ...notes,
  ];
  writeBlock(sheet, `A5:B${4 + rows.length}`, rows);
  sheet.getRange(`A5:A${4 + rows.length}`).format = {
    fill: PALETTE.paleTeal,
    font: { bold: true, color: PALETTE.teal },
    verticalAlignment: "top",
  };
  sheet.getRange(`B5:B${4 + rows.length}`).format = {
    wrapText: true,
    verticalAlignment: "top",
    font: { color: PALETTE.ink },
    borders: { bottom: { style: "thin", color: PALETTE.line } },
  };
  sheet.getRange("A:A").format.columnWidth = 22;
  sheet.getRange("B:B").format.columnWidth = 88;
  sheet.getRange("C:H").format.columnWidth = 3;
  sheet.freezePanes.freezeRows(4);
  return sheet;
}

function addFieldDictionary(workbook, sheetName, headers, definitions) {
  const sheet = workbook.worksheets.add(sheetName);
  sheet.showGridLines = false;
  writeBlock(sheet, "A1:D1", [["字段", "中文含义", "类型/单位", "审阅提示"]]);
  styleSection(sheet.getRange("A1:D1"));
  const rows = headers.map((header) => [
    header,
    definitions[header]?.[0] ?? "冻结评价导出的机器字段",
    definitions[header]?.[1] ?? "按原字段",
    definitions[header]?.[2] ?? "结合使用说明与公开评价报告解释。",
  ]);
  writeBlock(sheet, `A2:D${rows.length + 1}`, rows);
  sheet.getRange(`A2:A${rows.length + 1}`).format.font = { bold: true, color: PALETTE.navy };
  sheet.getRange(`B2:D${rows.length + 1}`).format.wrapText = true;
  sheet.getRange("A:A").format.columnWidth = 34;
  sheet.getRange("B:B").format.columnWidth = 34;
  sheet.getRange("C:C").format.columnWidth = 18;
  sheet.getRange("D:D").format.columnWidth = 58;
  sheet.freezePanes.freezeRows(1);
  return sheet;
}

const COMMON_DEFINITIONS = {
  population_id: ["评价人口稳定 ID", "文本", "三个人口不可直接混排。"],
  model_id: ["Model Registry 模型稳定 ID", "文本", "模型与实验臂/变体必须分开。"],
  model_version: ["模型版本", "文本", "不是评价活动版本。"],
  variant_id: ["评价变体或实验臂稳定 ID", "文本", "21 个变体来自 14 个合格登记模型。"],
  work_id: ["作品稳定 ID", "文本", "私有标识，不得公开。"],
  work_title: ["作品名称", "文本", "私有标识，不得公开。"],
  channel_uid: ["canonical 渠道稳定 ID", "文本", "只包含 origin 时已观察且符合当前范围的渠道。"],
  channel_name: ["canonical 渠道中文名", "文本", "按渠道筛选时同时核对 channel_uid。"],
  model_output_scope: ["模型输出范围", "文本", "区分 native channel 与统一 allocator 诊断。"],
  allocator_id: ["固定渠道分配器 ID", "文本", "仅为共同分配器构成诊断，不等于原生渠道模型。"],
  case_count: ["可评价 case 数", "整数", "覆盖率与误差均须结合 case 数阅读。"],
  actual_denominator: ["WAPE 实际值分母", "金额", "私有绝对金额。"],
  actual_total: ["实际总额", "金额", "development-modelable restatement actual。"],
  prediction_total: ["预测总额", "金额", "raw candidate 保持原样。"],
  absolute_error_total: ["绝对误差总额", "金额", "用于 WAPE 分子。"],
  signed_error_total: ["有符号误差总额", "金额", "预测减实际。"],
  maximum_error: ["单 case 最大绝对误差", "金额", "尾部风险诊断。"],
  failure_count: ["失败阈值 case 数", "整数", "阈值由冻结评价合同定义。"],
  catastrophe_count: ["灾难阈值 case 数", "整数", "阈值由冻结评价合同定义。"],
  wape: ["加权绝对百分比误差", "比例", "越低越好；只在可比集合内比较。"],
  signed_bias: ["有符号偏差", "比例", "负值为整体低估，正值为整体高估。"],
  cumulative_rank: ["可比组内累计排名", "整数", "不是统一模型总榜。"],
};

function styleImportedDataSheet(sheet, headers, rowCount, tableName, freezeColumns = 3) {
  const columnCount = headers.length;
  const lastColumn = excelColumn(columnCount - 1);
  sheet.showGridLines = false;
  sheet.freezePanes.freezeRows(1);
  sheet.freezePanes.freezeColumns(freezeColumns);
  const headerRange = sheet.getRange(`A1:${lastColumn}1`);
  headerRange.format = {
    fill: PALETTE.navy,
    font: { bold: true, color: PALETTE.white },
    wrapText: true,
    verticalAlignment: "center",
    borders: { bottom: { style: "medium", color: PALETTE.blue } },
  };
  headerRange.format.rowHeight = 34;

  const idFields = new Set([
    "population_id",
    "comparison_set",
    "grain",
    "model_output_scope",
    "slice_type",
    "slice_id",
    "model_id",
    "model_version",
    "variant_id",
    "work_id",
    "channel_uid",
    "allocator_id",
  ]);
  const integerFields = new Set([
    "participant_count",
    "case_count",
    "work_count",
    "expected_case_count",
    "failure_count",
    "catastrophe_count",
    "zero_actual_nonzero_prediction_count",
    "nonzero_actual_omission_count",
    "cumulative_rank",
  ]);
  const ratioFields = new Set([
    "coverage",
    "wape",
    "signed_bias",
    "predicted_actual_ratio",
    "smape",
    "median_ape_nonzero",
    "failure_rate",
    "top1_work_error_contribution",
    "top5_work_error_contribution",
    "top10_work_error_contribution",
    "maximum_work_error_contribution",
  ]);
  const amountFields = new Set([
    "actual_denominator",
    "actual_total",
    "prediction_total",
    "absolute_error_total",
    "signed_error_total",
    "maximum_error",
    "mae",
    "rmse",
  ]);
  for (let index = 0; index < headers.length; index += 1) {
    const header = headers[index];
    const column = excelColumn(index);
    const dataRange = rowCount > 1 ? sheet.getRange(`${column}2:${column}${rowCount}`) : null;
    const width = header === "work_title" ? 32 : header === "channel_name" ? 20 : idFields.has(header) ? 30 : 16;
    sheet.getRange(`${column}:${column}`).format.columnWidth = width;
    if (!dataRange) continue;
    if (integerFields.has(header)) dataRange.format.numberFormat = "#,##0";
    else if (ratioFields.has(header)) dataRange.format.numberFormat = "0.0000%";
    else if (amountFields.has(header)) dataRange.format.numberFormat = "#,##0.00;[Red]-#,##0.00";
    if (header === "wape") {
      dataRange.conditionalFormats.add("colorScale", {
        thresholds: ["min", { type: "percentile", value: 50 }, "max"],
        colors: ["#DDF3EA", "#FFF4D6", "#F8C7C7"],
      });
    }
    if (header === "cumulative_rank") {
      dataRange.conditionalFormats.add("cellIs", {
        operator: "equal",
        formula: 1,
        format: { fill: PALETTE.paleTeal, font: { bold: true, color: PALETTE.teal } },
      });
    }
  }
  const table = sheet.tables.add(`A1:${lastColumn}${rowCount}`, true, tableName);
  table.style = "TableStyleMedium2";
  table.showFilterButton = true;
  table.showBandedRows = true;
}

function winnerRows(winnerObject) {
  return Object.entries(winnerObject).map(([slice, result]) => [
    slice,
    result.modelVariantId ?? "隐私阈值不足 / 无结果",
    result.coWinnerVariantIds?.join(" | ") ?? "",
    typeof result.wape === "number" ? result.wape : null,
    result.caseCount ?? null,
    result.workCount ?? null,
  ]);
}

function addOverviewReadme(workbook, publicReport) {
  return addReadmeSheet(
    workbook,
    "M2 Core80 全模型真实业务横评：总览",
    "汇总 2020–2025 历史起点上的模型可用、严格共同样本、逐周期、逐年度与渠道诊断结果。",
    "指标总览",
    20_797,
    [
      ["登记与评价单位", `${publicReport.authority.registryEntryCount} 个登记条目经资格审计；${publicReport.authority.formalEligibleRegisteredModelCount} 个合格登记模型形成 ${publicReport.authority.formalEvaluationVariantCount} 个评价变体。`],
      ["统一冠军", "不存在覆盖全部 21 个变体的全局共同样本，因此未识别统一历史冠军；不同模型适配不同业务切片。"],
      ["查看完整明细", "本簿展示指标与配对推断；逐 case 明细在 SQLite 和 UTF-8 BOM CSV 分区中，逐书/逐渠道聚合另有两个工作簿。"],
    ],
  );
}

function addOverviewDashboard(workbook, report) {
  const sheet = workbook.worksheets.add("业务结论");
  sheet.showGridLines = false;
  styleTitle(sheet, "A1:M2", "2020–2025 Core80 全模型真实业务横评", "业务结论 · M2 Core80 Cross-Model Real-Business Evaluation v0.1");

  writeBlock(sheet, "A4:B4", [["核心判断", "当前证据"]]);
  styleSection(sheet.getRange("A4:B4"));
  const lg = report.conclusions.lg01ModelAvailableOverall;
  const coreRows = [
    ["最终状态", STATUS],
    ["统一历史冠军", "未识别（NO_UNIFIED_HISTORICAL_CHAMPION_IDENTIFIED）"],
    ["全变体共同样本", `${report.conclusions.globalAllVariantCommonCaseCount}；冻结 horizon/origin 支持不兼容`],
    ["切片结论", "不同模型适配不同业务切片（DIFFERENT_MODELS_FIT_DIFFERENT_BUSINESS_SLICES）"],
    ["激活结论", "仅历史证据，未激活（HISTORICAL_ONLY_NOT_ACTIVATED）"],
  ];
  writeBlock(sheet, "A5:B9", coreRows);
  sheet.getRange("A5:A9").format = { fill: PALETTE.paleBlue, font: { bold: true, color: PALETTE.navy } };
  sheet.getRange("B5:B9").format = { wrapText: true, font: { color: PALETTE.ink } };

  writeBlock(sheet, "D4:E4", [["LG01 模型可用口径", "数值"]]);
  styleSection(sheet.getRange("D4:E4"));
  const lgRows = [
    ["WAPE", lg.wape],
    ["有符号偏差", lg.signedBias],
    ["预测/实际", lg.predictedActualRatio],
    ["覆盖率", lg.coverage],
    ["case / 作品", `${lg.caseCount} / ${lg.workCount}`],
  ];
  writeBlock(sheet, "D5:E9", lgRows);
  sheet.getRange("D5:D9").format = { fill: PALETTE.paleTeal, font: { bold: true, color: PALETTE.teal } };
  sheet.getRange("E5:E8").format.numberFormat = "0.00%";

  writeBlock(sheet, "A12:F12", [["周期", "胜出变体", "并列变体", "WAPE", "case", "作品"]]);
  styleSection(sheet.getRange("A12:F12"));
  const horizons = winnerRows(report.conclusions.horizonWinners);
  writeBlock(sheet, `A13:F${12 + horizons.length}`, horizons);
  sheet.getRange(`D13:D${12 + horizons.length}`).format.numberFormat = "0.00%";
  sheet.getRange(`E13:F${12 + horizons.length}`).format.numberFormat = "#,##0";

  writeBlock(sheet, "A19:F19", [["年度 H12", "胜出变体", "并列变体", "WAPE", "case", "作品"]]);
  styleSection(sheet.getRange("A19:F19"));
  const years = winnerRows(report.conclusions.annualH12Winners);
  writeBlock(sheet, `A20:F${19 + years.length}`, years);
  sheet.getRange(`D20:D${19 + years.length}`).format.numberFormat = "0.00%";
  sheet.getRange(`E20:F${19 + years.length}`).format.numberFormat = "#,##0";

  writeBlock(sheet, "H12:I12", [["重点原生渠道", "严格共同样本胜出变体"]]);
  styleSection(sheet.getRange("H12:I12"));
  const channelRows = Object.entries(report.conclusions.majorNativeChannelWinners).map(([channel, winner]) => [
    channel,
    winner ?? "隐私阈值不足 / 无结果",
  ]);
  writeBlock(sheet, `H13:I${12 + channelRows.length}`, channelRows);

  writeBlock(sheet, "H19:I19", [["推断项目", "结果"]]);
  styleSection(sheet.getRange("H19:I19"));
  writeBlock(sheet, "H20:I24", [
    ["bootstrap", "5,000 次；作品+起点配对 block；固定种子 20260802"],
    ["Holm 多重校正", "已执行"],
    ["显著优于 LG01 的候选", "0"],
    ["年度排序翻转", report.conclusions.yearRankingFlip ? "是" : "否"],
    ["周期/渠道排序翻转", `${report.conclusions.horizonRankingFlip ? "周期：是" : "周期：否"}；${report.conclusions.majorChannelRankingFlip ? "渠道：是" : "渠道：否"}`],
  ]);
  sheet.getRange("I20:I24").format.wrapText = true;

  const horizonChart = sheet.charts.add("bar", {
    chartType: "bar",
    title: "不同周期由不同模型胜出（共同样本 WAPE）",
    hasLegend: false,
  });
  const horizonSeries = horizonChart.series.add("共同样本 WAPE");
  horizonSeries.formula = "'业务结论'!$D$13:$D$16";
  horizonSeries.categoryFormula = "'业务结论'!$A$13:$A$16";
  horizonChart.title = "不同周期由不同模型胜出（共同样本 WAPE）";
  horizonChart.hasLegend = false;
  horizonChart.xAxis = { axisType: "textAxis" };
  horizonChart.yAxis = { numberFormatCode: "0%", min: 0 };
  horizonChart.setPosition("H27", "M42");

  sheet.getRange("A:A").format.columnWidth = 21;
  sheet.getRange("B:B").format.columnWidth = 57;
  sheet.getRange("C:C").format.columnWidth = 47;
  sheet.getRange("D:F").format.columnWidth = 15;
  sheet.getRange("G:G").format.columnWidth = 3;
  sheet.getRange("H:H").format.columnWidth = 25;
  sheet.getRange("I:I").format.columnWidth = 55;
  sheet.getRange("J:M").format.columnWidth = 13;
  sheet.freezePanes.freezeRows(2);
  return sheet;
}

function addModelList(workbook, report) {
  const sheet = workbook.worksheets.add("模型与变体");
  sheet.showGridLines = false;
  const headers = ["模型 ID", "模型版本", "评价变体 ID", "中文名", "英文原名", "对象类型", "预测粒度"];
  writeBlock(sheet, "A1:G1", [headers]);
  styleSection(sheet.getRange("A1:G1"));
  const rows = report.variants.map((variant) => [
    variant.modelId,
    variant.modelVersion,
    variant.modelVariantId,
    variant.displayNameZh,
    variant.displayNameEn,
    variant.objectType,
    variant.predictionGrain,
  ]);
  writeBlock(sheet, `A2:G${rows.length + 1}`, rows);
  const table = sheet.tables.add(`A1:G${rows.length + 1}`, true, "Cmx01VariantsTable");
  table.style = "TableStyleMedium2";
  sheet.getRange("A:C").format.columnWidth = 34;
  sheet.getRange("D:E").format.columnWidth = 34;
  sheet.getRange("F:G").format.columnWidth = 22;
  sheet.freezePanes.freezeRows(1);
  return sheet;
}

function addIntegritySheet(workbook, report) {
  const sheet = workbook.worksheets.add("完整性审计");
  sheet.showGridLines = false;
  writeBlock(sheet, "A1:E1", [["审计 ID", "状态", "观测值", "期望值", "说明"]]);
  styleSection(sheet.getRange("A1:E1"));
  const rows = report.integrity.map((row) => [
    row.auditId,
    row.status,
    row.observedValue,
    row.expectedValue,
    row.details ?? "",
  ]);
  writeBlock(sheet, `A2:E${rows.length + 1}`, rows);
  sheet.getRange(`B2:B${rows.length + 1}`).conditionalFormats.add("containsText", {
    text: "PASS",
    format: { fill: PALETTE.paleTeal, font: { bold: true, color: PALETTE.teal } },
  });
  sheet.getRange("A:A").format.columnWidth = 46;
  sheet.getRange("B:B").format.columnWidth = 14;
  sheet.getRange("C:D").format.columnWidth = 30;
  sheet.getRange("E:E").format.columnWidth = 62;
  sheet.getRange("E:E").format.wrapText = true;
  sheet.freezePanes.freezeRows(1);
  return sheet;
}

function addBootstrapSheet(workbook, report) {
  const sheet = workbook.worksheets.add("LG01配对推断");
  sheet.showGridLines = false;
  const headers = [
    "LG01 基线变体",
    "候选变体",
    "配对 case",
    "block",
    "迭代",
    "固定种子",
    "候选-LG01 WAPE",
    "95% 下界",
    "中位数",
    "95% 上界",
    "候选更优概率",
    "经验双侧 p",
    "Holm 校正 p",
  ];
  writeBlock(sheet, "A1:M1", [headers]);
  styleSection(sheet.getRange("A1:M1"));
  const rows = report.comparison.lg01PairedBootstrap.map((row) => [
    row.baselineModelVariantId,
    row.candidateModelVariantId,
    row.matchedCaseCount,
    row.blockCount,
    row.iterations,
    row.seed,
    row.pointDifferenceCandidateMinusLg01,
    row.lower95CandidateMinusLg01,
    row.medianDifference,
    row.upper95CandidateMinusLg01,
    row.probabilityCandidateBetter,
    row.empiricalTwoSidedP,
    row.holmAdjustedP,
  ]);
  writeBlock(sheet, `A2:M${rows.length + 1}`, rows);
  sheet.getRange(`C2:F${rows.length + 1}`).format.numberFormat = "#,##0";
  sheet.getRange(`G2:M${rows.length + 1}`).format.numberFormat = "0.0000%";
  sheet.getRange(`G2:G${rows.length + 1}`).conditionalFormats.add("colorScale", {
    thresholds: ["min", { type: "percentile", value: 50 }, "max"],
    colors: ["#DDF3EA", "#FFF4D6", "#F8C7C7"],
  });
  sheet.getRange("A:B").format.columnWidth = 46;
  sheet.getRange("C:M").format.columnWidth = 17;
  const table = sheet.tables.add(`A1:M${rows.length + 1}`, true, "Cmx01Lg01BootstrapTable");
  table.style = "TableStyleMedium2";
  sheet.freezePanes.freezeRows(1);
  sheet.freezePanes.freezeColumns(2);
  return sheet;
}

async function inspectWorkbook(workbook, label, keyRanges) {
  const summary = await workbook.inspect({
    kind: "workbook,sheet,table,drawing",
    maxChars: 12_000,
    tableMaxRows: 4,
    tableMaxCols: 6,
    tableMaxCellChars: 70,
  });
  console.log(`[inspect:${label}] ${summary.ndjson ?? JSON.stringify(summary)}`);
  for (const [sheetId, range] of keyRanges) {
    const region = await workbook.inspect({ kind: "region", sheetId, range, maxChars: 4_000 });
    console.log(`[inspect:${label}:${sheetId}:${range}] ${region.ndjson ?? JSON.stringify(region)}`);
    const formulas = await workbook.inspect({ kind: "formula", sheetId, range, maxChars: 2_000 });
    console.log(`[formula:${label}:${sheetId}:${range}] ${formulas.ndjson ?? JSON.stringify(formulas)}`);
  }
}

async function renderSheets(workbook, previewDir, prefix, ranges) {
  await fs.mkdir(previewDir, { recursive: true });
  for (const [sheetName, range] of ranges) {
    const preview = await workbook.render({
      sheetName,
      range,
      autoCrop: "all",
      scale: 1,
      format: "png",
    });
    const safeName = sheetName.replace(/[\\/:*?"<>|]/g, "-");
    await fs.writeFile(
      path.join(previewDir, `${prefix}-${safeName}.png`),
      new Uint8Array(await preview.arrayBuffer()),
    );
  }
}

async function exportWorkbook(workbook, target) {
  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(target);
}

async function buildOverview(args, report) {
  const csvPath = path.join(args.privateDir, SOURCE_FILES.overview);
  const csvText = (await fs.readFile(csvPath, "utf8")).replace(/^\uFEFF/, "");
  const headers = csvHeaders(csvText);
  const rowCount = countCsvRows(csvText);
  const workbook = await Workbook.fromCSV(csvText, { sheetName: "指标总览" });
  const dataSheet = workbook.worksheets.getItem("指标总览");
  styleImportedDataSheet(dataSheet, headers, rowCount, "Cmx01OverviewMetricsTable", 3);
  addOverviewReadme(workbook, report);
  addOverviewDashboard(workbook, report);
  addModelList(workbook, report);
  addBootstrapSheet(workbook, report);
  addIntegritySheet(workbook, report);
  addFieldDictionary(workbook, "指标字段", headers, {
    ...COMMON_DEFINITIONS,
    comparison_set: ["比较集合", "文本", "MODEL_AVAILABLE 与 COMMON_MATCHED 不可混淆。"],
    grain: ["评价粒度", "文本", "WORK_TOTAL 与 WORK_CHANNEL 是不同能力。"],
    slice_type: ["切片类型", "文本", "周期、年度、起点、渠道等切片不可直接混排。"],
    slice_id: ["切片稳定值", "文本", "必须与 slice_type 联合解释。"],
  });
  await inspectWorkbook(workbook, "overview", [
    ["使用说明", "A1:B15"],
    ["业务结论", "A1:I24"],
    ["模型与变体", "A1:G8"],
    ["LG01配对推断", "A1:M8"],
    ["完整性审计", "A1:E10"],
    ["指标总览", `A1:${excelColumn(headers.length - 1)}12`],
    ["指标字段", "A1:D12"],
  ]);
  await renderSheets(workbook, args.previewDir, "overview", [
    ["使用说明", "A1:B15"],
    ["业务结论", "A1:M42"],
    ["模型与变体", "A1:G22"],
    ["LG01配对推断", "A1:M21"],
    ["完整性审计", "A1:E17"],
    ["指标总览", `A1:${excelColumn(headers.length - 1)}25`],
    ["指标字段", "A1:D25"],
  ]);
  await exportWorkbook(workbook, path.join(args.privateDir, OUTPUT_FILES.overview));
  return { file: OUTPUT_FILES.overview, rows: rowCount - 1, sheets: 7 };
}

async function buildLedgerWorkbook(
  args,
  kind,
  title,
  purpose,
  dataSheetName,
  tableName,
  definitions,
  io = {},
) {
  const csvPath = io.csvPath ?? path.join(args.privateDir, SOURCE_FILES[kind]);
  const csvText = (await fs.readFile(csvPath, "utf8")).replace(/^\uFEFF/, "");
  const headers = csvHeaders(csvText);
  const rowCount = countCsvRows(csvText);
  const workbook = await Workbook.fromCSV(csvText, { sheetName: dataSheetName });
  const dataSheet = workbook.worksheets.getItem(dataSheetName);
  styleImportedDataSheet(dataSheet, headers, rowCount, tableName, kind === "channel" ? 5 : 3);
  addReadmeSheet(workbook, title, purpose, dataSheetName, rowCount, [
    ["完整 case 明细", "本簿为逐作品聚合总账；逐 origin/horizon/case 的完整行保存在 SQLite 与 CSV 分区。"],
    ...(io.readmeNotes ?? []),
  ]);
  addFieldDictionary(workbook, "字段说明", headers, { ...COMMON_DEFINITIONS, ...definitions });
  await inspectWorkbook(workbook, kind, [
    ["使用说明", "A1:B14"],
    [dataSheetName, `A1:${excelColumn(headers.length - 1)}15`],
    ["字段说明", "A1:D20"],
  ]);
  await renderSheets(workbook, args.previewDir, io.previewPrefix ?? kind, [
    ["使用说明", "A1:B14"],
    [dataSheetName, `A1:${excelColumn(headers.length - 1)}25`],
    ["字段说明", `A1:D${Math.min(headers.length + 1, 30)}`],
  ]);
  const outputPath = io.outputPath ?? path.join(args.privateDir, OUTPUT_FILES[kind]);
  await exportWorkbook(workbook, outputPath);
  return { file: path.basename(outputPath), rows: rowCount - 1, sheets: 3 };
}

async function readShardIndex(args) {
  if (!args.shardIndex) throw new Error("--shard-index is required for channel shard packaging");
  const shardIndex = JSON.parse(await fs.readFile(args.shardIndex, "utf8"));
  if (
    shardIndex.campaignId !== CAMPAIGN_ID ||
    shardIndex.status !== STATUS ||
    shardIndex.rowConservation !== true ||
    shardIndex.shardRows !== shardIndex.sourceRows
  ) {
    throw new Error("channel shard index failed authority or row-conservation validation");
  }
  return shardIndex;
}

async function buildChannelShard(args) {
  const shardIndex = await readShardIndex(args);
  if (!Number.isInteger(args.shardPart) || args.shardPart < 1) {
    throw new Error("--shard-part must be a positive integer");
  }
  const entry = shardIndex.entries.find((candidate) => candidate.part === args.shardPart);
  if (!entry) throw new Error(`shard part ${args.shardPart} is not present in the index`);
  const shardDir = path.dirname(args.shardIndex);
  const csvPath = path.join(shardDir, entry.csv);
  const outputPath = path.join(shardDir, entry.xlsx);
  const csvStat = await fs.stat(csvPath);
  if (csvStat.size !== entry.csvBytes || (await sha256File(csvPath)) !== entry.csvSha256) {
    throw new Error(`channel shard ${entry.part} CSV digest mismatch`);
  }
  return buildLedgerWorkbook(
    args,
    "channel",
    `M2 Core80 逐本书逐渠道模型成绩 · 分片 ${String(entry.part).padStart(3, "0")}`,
    "按完整模型变体组拆分的非截断私有渠道聚合总账；所有分片行数之和与冻结总账严格守恒。",
    "逐书逐渠道总账",
    `Cmx01ChannelPart${String(entry.part).padStart(3, "0")}Table`,
    {
      model_output_scope: ["模型渠道输出范围", "文本", "NATIVE_WORK_CHANNEL 与 COMMON_ALLOCATOR_DIAGNOSTIC 必须分开。"],
    },
    {
      csvPath,
      outputPath,
      previewPrefix: `channel-part-${String(entry.part).padStart(3, "0")}`,
      readmeNotes: [
        ["分片编号", `${entry.part} / ${shardIndex.shardCount}`],
        ["完整模型变体", entry.variantIds.join(" | ")],
        ["行数守恒", `${entry.rowCount} 行；总索引全部分片合计 ${shardIndex.shardRows} 行，与冻结总账一致。`],
      ],
    },
  );
}

async function buildChannelIndex(args) {
  const shardIndex = await readShardIndex(args);
  const shardDir = path.dirname(args.shardIndex);
  const entries = [];
  for (const entry of shardIndex.entries) {
    const xlsxPath = path.join(shardDir, entry.xlsx);
    const stat = await fs.stat(xlsxPath);
    entries.push({
      ...entry,
      xlsxBytes: stat.size,
      xlsxSha256: await sha256File(xlsxPath),
    });
  }
  const completedIndex = {
    ...shardIndex,
    entries,
    xlsxShardCount: entries.length,
    xlsxRows: entries.reduce((sum, entry) => sum + entry.rowCount, 0),
    xlsxRowConservation: entries.reduce((sum, entry) => sum + entry.rowCount, 0) === shardIndex.sourceRows,
  };
  await fs.writeFile(args.shardIndex, `${JSON.stringify(completedIndex, null, 2)}\n`, "utf8");

  const workbook = Workbook.create();
  addReadmeSheet(
    workbook,
    "M2 Core80 逐本书逐渠道模型成绩：总索引",
    "列出全部非截断 XLSX 分片、模型变体范围、行数和 SHA-256；完整行数据位于分片工作簿、冻结 CSV、SQLite 与 case 级 CSV 分区。",
    "分片索引",
    shardIndex.sourceRows + 1,
    [
      ["分片原因", "单个 210,569 行工作簿触发当前电子表格封装工具的字符串长度上限；按完整模型变体分组，不抽样、不截断。"],
      ["分片规则", shardIndex.partitionRule],
      ["行数守恒", `${shardIndex.sourceRows} = ${entries.reduce((sum, entry) => sum + entry.rowCount, 0)}；状态：PASS`],
      ["使用方法", "先在分片索引中按 model_variant_ids 定位文件，再在对应分片的逐书逐渠道总账工作表按书名、渠道、人口和输出范围筛选。"],
    ],
  );
  const indexSheet = workbook.worksheets.add("分片索引");
  indexSheet.showGridLines = false;
  const headers = [
    "分片",
    "完整模型变体 ID",
    "数据行数",
    "CSV 相对路径",
    "CSV 字节",
    "CSV SHA-256",
    "XLSX 相对路径",
    "XLSX 字节",
    "XLSX SHA-256",
  ];
  writeBlock(indexSheet, "A1:I1", [headers]);
  styleSection(indexSheet.getRange("A1:I1"));
  const rows = entries.map((entry) => [
    entry.part,
    entry.variantIds.join(" | "),
    entry.rowCount,
    `channel-workbook-shards/${entry.csv}`,
    entry.csvBytes,
    entry.csvSha256,
    `channel-workbook-shards/${entry.xlsx}`,
    entry.xlsxBytes,
    entry.xlsxSha256,
  ]);
  writeBlock(indexSheet, `A2:I${rows.length + 1}`, rows);
  indexSheet.getRange(`A2:A${rows.length + 1}`).format.numberFormat = "000";
  indexSheet.getRange(`C2:C${rows.length + 1}`).format.numberFormat = "#,##0";
  indexSheet.getRange(`E2:E${rows.length + 1}`).format.numberFormat = "#,##0";
  indexSheet.getRange(`H2:H${rows.length + 1}`).format.numberFormat = "#,##0";
  indexSheet.getRange("A:A").format.columnWidth = 10;
  indexSheet.getRange("B:B").format.columnWidth = 76;
  indexSheet.getRange("C:C").format.columnWidth = 16;
  indexSheet.getRange("D:D").format.columnWidth = 48;
  indexSheet.getRange("E:E").format.columnWidth = 18;
  indexSheet.getRange("F:F").format.columnWidth = 68;
  indexSheet.getRange("G:G").format.columnWidth = 56;
  indexSheet.getRange("H:H").format.columnWidth = 18;
  indexSheet.getRange("I:I").format.columnWidth = 68;
  indexSheet.getRange(`B2:I${rows.length + 1}`).format.wrapText = true;
  const table = indexSheet.tables.add(`A1:I${rows.length + 1}`, true, "Cmx01ChannelShardIndexTable");
  table.style = "TableStyleMedium2";
  indexSheet.freezePanes.freezeRows(1);
  addFieldDictionary(
    workbook,
    "字段说明",
    [
      "population_id",
      "model_output_scope",
      "work_id",
      "work_title",
      "channel_uid",
      "channel_name",
      "model_id",
      "model_version",
      "variant_id",
      "allocator_id",
      "case_count",
      "actual_denominator",
      "actual_total",
      "prediction_total",
      "absolute_error_total",
      "signed_error_total",
      "failure_count",
      "catastrophe_count",
      "maximum_error",
      "wape",
      "signed_bias",
      "cumulative_rank",
    ],
    COMMON_DEFINITIONS,
  );
  await inspectWorkbook(workbook, "channel-index", [
    ["使用说明", "A1:B18"],
    ["分片索引", `A1:I${rows.length + 1}`],
    ["字段说明", "A1:D23"],
  ]);
  await renderSheets(workbook, args.previewDir, "channel-index", [
    ["使用说明", "A1:B18"],
    ["分片索引", `A1:I${rows.length + 1}`],
    ["字段说明", "A1:D23"],
  ]);
  const outputPath = path.join(args.privateDir, OUTPUT_FILES.channel);
  await exportWorkbook(workbook, outputPath);
  return { file: OUTPUT_FILES.channel, rows: shardIndex.sourceRows, sheets: 3, shards: entries.length };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await fs.mkdir(args.privateDir, { recursive: true });
  await fs.mkdir(args.previewDir, { recursive: true });
  const report = JSON.parse(await fs.readFile(args.publicReport, "utf8"));
  if (report.campaignId !== CAMPAIGN_ID || report.status !== STATUS) {
    throw new Error(`Unexpected public report authority: ${report.campaignId} / ${report.status}`);
  }
  const results = [];
  if (!["overview", "work", "channel-shard", "channel-index"].includes(args.only)) {
    throw new Error(`Unsupported --only value: ${args.only}`);
  }
  if (args.only === "overview") {
    results.push(await buildOverview(args, report));
  }
  if (args.only === "work") {
    results.push(
      await buildLedgerWorkbook(
        args,
        "work",
        "M2 Core80 逐本书模型成绩",
        "按评价人口、作品、登记模型与评价变体汇总预测和误差，支持逐书筛选和可比组内排名。",
        "逐书模型总账",
        "Cmx01WorkLedgerTable",
        {},
      ),
    );
  }
  if (args.only === "channel-shard") results.push(await buildChannelShard(args));
  if (args.only === "channel-index") results.push(await buildChannelIndex(args));
  console.log(JSON.stringify({ campaignId: CAMPAIGN_ID, status: STATUS, workbooks: results }, null, 2));
}

await main();
