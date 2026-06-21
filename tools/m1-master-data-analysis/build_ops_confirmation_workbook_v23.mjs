import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const opsRoot = path.join(root, "data", "m1-master-data-private", "ops-confirmation");
const inputPath = path.join(opsRoot, "ops-confirmation-v2.3-data.json");
const outputPath = path.join(opsRoot, "M1-运营确认包-v2.3.xlsx");
const previewPath = path.join(opsRoot, "M1-运营确认包-v2.3-overview-preview.png");
const inspectPath = path.join(opsRoot, "M1-运营确认包-v2.3-inspect.ndjson");

const payload = JSON.parse(await fs.readFile(inputPath, "utf8"));
const workbook = Workbook.create();

const COLORS = {
  header: "#1F4E79",
  subHeader: "#5B9BD5",
  note: "#EAF2F8",
  warn: "#FFF4C2",
  danger: "#FCE4D6",
  ok: "#E2F0D9",
  border: "#D9E2F3",
  text: "#1F1F1F",
};

function colLetter(index) {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function sheetByName(name) {
  return payload.sheets.find((sheet) => sheet.name === name);
}

function tableName(name, index) {
  return `T${index}_${name.replace(/[^A-Za-z0-9]/g, "").slice(0, 18) || "Sheet"}`;
}

function matrixFromRows(rows) {
  const headers = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!headers.includes(key)) headers.push(key);
    }
  }
  return {
    headers,
    matrix: [headers, ...rows.map((row) => headers.map((header) => row[header] ?? ""))],
  };
}

function addValidation(sheet, headers, rowCount, header, values) {
  const index = headers.indexOf(header);
  if (index < 0 || rowCount < 1) return;
  const col = colLetter(index);
  sheet.getRange(`${col}2:${col}${rowCount + 1}`).dataValidation = {
    rule: { type: "list", values },
  };
}

function addConditional(sheet, headers, rowCount, header) {
  const index = headers.indexOf(header);
  if (index < 0 || rowCount < 1) return;
  const col = colLetter(index);
  const range = sheet.getRange(`${col}2:${col}${rowCount + 1}`);
  try {
    range.conditionalFormats.add("containsText", { text: "需补充资料", format: { fill: COLORS.warn } });
    range.conditionalFormats.add("containsText", { text: "否", format: { fill: COLORS.danger } });
    range.conditionalFormats.add("containsText", { text: "是", format: { fill: COLORS.ok } });
    range.conditionalFormats.add("containsText", { text: "已解除", format: { fill: COLORS.ok } });
  } catch {
    // Conditional formatting is a usability aid; content remains valid if unsupported by the renderer.
  }
}

function formatByHeader(sheet, headers, rowCount) {
  const totalRows = Math.max(rowCount + 1, 1);
  for (let c = 0; c < headers.length; c++) {
    const header = headers[c] ?? "";
    const range = sheet.getRangeByIndexes(0, c, totalRows, 1);
    if (header.includes("完整精度")) {
      range.format.columnWidth = 3;
      range.format.font = { color: "#FFFFFF" };
    } else if (header.includes("名称") || header.includes("说明") || header.includes("候选") || header.includes("备注") || header.includes("分类") || header.includes("授权")) {
      range.format.columnWidth = 28;
    } else if (header.includes("任务ID") || header.includes("观察ID")) {
      range.format.columnWidth = 24;
    } else if (header.includes("金额") || header.includes("实销")) {
      range.format.columnWidth = 14;
    } else if (header.includes("日期")) {
      range.format.columnWidth = 14;
    } else {
      range.format.columnWidth = 16;
    }
    if (header === "累计实销" || header === "金额") {
      sheet.getRangeByIndexes(1, c, Math.max(rowCount, 1), 1).format.numberFormat = [["#,##0.00"]];
    }
    if (header.includes("确认版权") || (header.includes("日期") && !header.includes("候选"))) {
      sheet.getRangeByIndexes(1, c, Math.max(rowCount, 1), 1).format.numberFormat = [["yyyy-mm-dd"]];
    }
  }
}

function createTableSheet(spec, index) {
  const sheet = workbook.worksheets.add(spec.name);
  sheet.showGridLines = false;
  const rows = spec.rows ?? [];
  const { headers, matrix } = matrixFromRows(rows);
  const rowCount = rows.length;
  const colCount = Math.max(headers.length, 1);
  const end = `${colLetter(colCount - 1)}${Math.max(rowCount + 1, 1)}`;
  sheet.getRange(`A1:${end}`).values = matrix.length ? matrix : [[""]];
  sheet.getRange(`A1:${colLetter(colCount - 1)}1`).format = {
    fill: COLORS.subHeader,
    font: { bold: true, color: "#FFFFFF" },
    wrapText: true,
  };
  sheet.getRange(`A1:${end}`).format.borders = { preset: "all", style: "thin", color: COLORS.border };
  sheet.getRange(`A1:${end}`).format.wrapText = true;
  if (rowCount > 0) {
    const table = sheet.tables.add(`A1:${end}`, true, tableName(spec.name, index));
    table.showFilterButton = true;
    table.showBandedRows = true;
  }
  sheet.freezePanes.freezeRows(1);
  sheet.freezePanes.freezeColumns(spec.name === "标准作品基础信息补全" ? 2 : spec.name === "非阻断观察" ? 3 : 1);
  formatByHeader(sheet, headers, rowCount);
  return { sheet, headers, rowCount };
}

function addSheetValidations(spec, sheet, headers, rowCount) {
  if (spec.name === "正式导入阻断确认") {
    addValidation(sheet, headers, rowCount, "运营确认结果", [
      "确认为同一作品的历史更名",
      "确认为账单错配，需修改源文件",
      "确认为合集或打包产品",
      "确认为历史分册映射",
      "需补充资料",
      "不适用",
    ]);
    addValidation(sheet, headers, rowCount, "是否解除阻断", ["是", "否", "需补充资料"]);
    addConditional(sheet, headers, rowCount, "运营确认结果");
    addConditional(sheet, headers, rowCount, "是否解除阻断");
  }
  if (spec.name === "多ID归并候选") {
    addValidation(sheet, headers, rowCount, "是否归并", ["是", "否", "需补充资料", "不适用"]);
    addValidation(sheet, headers, rowCount, "其他ID处理方式", ["历史分册映射", "保留独立作品", "账单错配待修正", "需补充资料", "不适用"]);
    addValidation(sheet, headers, rowCount, "是否解除阻断", ["是", "否", "需补充资料"]);
  }
  if (spec.name === "标准作品基础信息补全") {
    addValidation(sheet, headers, rowCount, "补全状态", ["已补齐", "需补充资料", "暂不处理"]);
  }
  if (spec.name === "台账真实冲突") {
    addValidation(sheet, headers, rowCount, "是否解除冲突", ["是", "否", "需补充资料"]);
  }
  if (spec.name === "版权期限反例") {
    addValidation(sheet, headers, rowCount, "是否解除阻断", ["是", "否", "需补充资料"]);
  }
  if (spec.name === "非阻断观察") {
    addValidation(sheet, headers, rowCount, "是否需要统一标准作品名称", ["是", "否", "需补充资料"]);
    addValidation(sheet, headers, rowCount, "是否标记为异常", ["是", "否", "需补充资料"]);
    addValidation(sheet, headers, rowCount, "是否升级为阻断", ["是", "否"]);
    addValidation(sheet, headers, rowCount, "阻断解除状态", ["处理中", "已解除", "需补充资料", "不适用"]);
  }
  ["是否解除阻断", "是否解除冲突", "补全状态", "是否归并", "是否标记为异常", "是否升级为阻断", "阻断解除状态", "是否需要统一标准作品名称"].forEach((header) =>
    addConditional(sheet, headers, rowCount, header),
  );
}

function buildOverview() {
  const sheet = workbook.worksheets.add("确认进度总览");
  sheet.showGridLines = false;
  sheet.getRange("A1:J1").merge();
  sheet.getRange("A1:J1").values = [["M1 运营确认包 v2.3 - 确认进度总览"]];
  sheet.getRange("A1:J1").format = { fill: COLORS.header, font: { bold: true, color: "#FFFFFF", size: 15 } };
  sheet.getRange("A2:J2").merge();
  sheet.getRange("A2:J2").values = [[
    "本版重建正式导入阻断与非阻断观察：正常双业务形态不作为导入阻断；授权分类不决定业务形态；所有任务ID均为稳定语义ID。",
  ]];
  sheet.getRange("A2:J2").format = { fill: COLORS.note, wrapText: true };
  sheet.getRange("A3:B3").values = [["生成时间", new Date(payload.generated_at)]];
  sheet.getRange("B3").format.numberFormat = "yyyy-mm-dd hh:mm:ss";

  const ruleStart = 5;
  const ruleLines = [
    ["原始作品ID", "按账单文本完整识别，12345 与 Y12345 是两个不同原始作品ID。"],
    ["标准作品ID", "使用数字主体，12345 与 Y12345 均对应标准作品ID 12345。"],
    ["业务形态", "^[0-9]+$ 为有声版权；^Y[0-9]+$ 为有声成品。"],
    ["授权分类", "授权分类不得反向覆盖业务形态。"],
    ["正常双业务形态", "同一标准作品同时存在纯数字ID和Y前缀ID不构成导入阻断。"],
  ];
  sheet.getRange(`A${ruleStart}:B${ruleStart + ruleLines.length - 1}`).values = ruleLines;
  sheet.getRange(`A${ruleStart}:A${ruleStart + ruleLines.length - 1}`).format = { fill: COLORS.subHeader, font: { bold: true, color: "#FFFFFF" } };
  sheet.getRange(`B${ruleStart}:B${ruleStart + ruleLines.length - 1}`).format = { fill: COLORS.note, wrapText: true };

  const tableStart = 12;
  const headers = ["任务类型", "任务总数", "已确认", "待确认", "需补充资料", "未解除阻断", "正式导入阻断数量", "M2基础信息缺失数量", "完成率", "填写说明"];
  sheet.getRange(`A${tableStart}:J${tableStart}`).values = [headers];
  sheet.getRange(`A${tableStart}:J${tableStart}`).format = { fill: COLORS.subHeader, font: { bold: true, color: "#FFFFFF" }, wrapText: true };

  const configs = [
    ["正式导入阻断确认", "运营确认结果", "是否解除阻断", "正式导入前必须处理；正常双业务形态不在此表。"],
    ["多ID归并候选", "是否归并", "是否解除阻断", "只包含两个及以上标准作品ID的候选组。"],
    ["标准作品基础信息补全", "补全状态", "", "M2评估前补齐；不阻断物理结构设计。"],
    ["台账真实冲突", "运营确认值", "是否解除冲突", "只处理台账同ID关键字段真实冲突。"],
    ["版权期限反例", "确认版权开始日期", "是否解除阻断", "版权开始日期只在本表填写。"],
    ["非阻断观察", "是否标记为异常", "是否升级为阻断", "默认不阻断；空值不表示待解除阻断。"],
  ];
  const rows = [];
  configs.forEach((config, index) => {
    const [name, statusHeader, unblockHeader, note] = config;
    const spec = sheetByName(name);
    const total = spec?.rows?.length ?? 0;
    const headersInSheet = spec?.rows?.length ? Object.keys(spec.rows[0]) : [];
    const statusCol = headersInSheet.indexOf(statusHeader) >= 0 ? colLetter(headersInSheet.indexOf(statusHeader)) : "";
    const unblockCol = unblockHeader && headersInSheet.indexOf(unblockHeader) >= 0 ? colLetter(headersInSheet.indexOf(unblockHeader)) : "";
    const last = total + 1;
    const rowNo = tableStart + 1 + index;
    if (name === "非阻断观察") {
      const releaseCol = headersInSheet.indexOf("阻断解除状态") >= 0 ? colLetter(headersInSheet.indexOf("阻断解除状态")) : "";
      rows.push([
        name,
        total,
        statusCol ? `=COUNTIF('${name}'!${statusCol}2:${statusCol}${last},"是")` : 0,
        unblockCol ? `=COUNTIFS('${name}'!${unblockCol}2:${unblockCol}${last},"是",'${name}'!${releaseCol}2:${releaseCol}${last},"")` : 0,
        statusCol ? `=COUNTIF('${name}'!${statusCol}2:${statusCol}${last},"需补充资料")` : 0,
        unblockCol ? `=COUNTIFS('${name}'!${unblockCol}2:${unblockCol}${last},"是",'${name}'!${releaseCol}2:${releaseCol}${last},"<>已解除")` : 0,
        "",
        "",
        `=IF(B${rowNo}=0,1,C${rowNo}/B${rowNo})`,
        note,
      ]);
      return;
    }
    rows.push([
      name,
      total,
      statusCol ? `=COUNTIF('${name}'!${statusCol}2:${statusCol}${last},"<>")-COUNTIF('${name}'!${statusCol}2:${statusCol}${last},"需补充资料")` : 0,
      statusCol ? `=COUNTBLANK('${name}'!${statusCol}2:${statusCol}${last})` : 0,
      statusCol ? `=COUNTIF('${name}'!${statusCol}2:${statusCol}${last},"需补充资料")` : 0,
      unblockCol ? `=COUNTIF('${name}'!${unblockCol}2:${unblockCol}${last},"否")+COUNTBLANK('${name}'!${unblockCol}2:${unblockCol}${last})` : "",
      name === "正式导入阻断确认" ? total : "",
      name === "标准作品基础信息补全" ? payload.metrics.m2_basic_info_missing_count : "",
      `=IF(B${rowNo}=0,1,C${rowNo}/B${rowNo})`,
      note,
    ]);
  });

  const valueRows = rows.map((row) => row.map((value) => (typeof value === "string" && value.startsWith("=") ? null : value)));
  const formulaRows = rows.map((row) => row.map((value) => (typeof value === "string" && value.startsWith("=") ? value : null)));
  sheet.getRange(`A${tableStart + 1}:J${tableStart + rows.length}`).values = valueRows;
  sheet.getRange(`A${tableStart + 1}:J${tableStart + rows.length}`).formulas = formulaRows;
  sheet.getRange(`A${tableStart}:J${tableStart + rows.length}`).format.borders = { preset: "all", style: "thin", color: COLORS.border };
  sheet.getRange(`I${tableStart + 1}:I${tableStart + rows.length}`).format.numberFormat = "0.0%";
  sheet.getRange("A:J").format.wrapText = true;
  sheet.getRange("A:A").format.columnWidth = 22;
  sheet.getRange("B:I").format.columnWidth = 14;
  sheet.getRange("J:J").format.columnWidth = 42;
  sheet.freezePanes.freezeRows(tableStart);
}

buildOverview();
payload.sheets
  .filter((spec) => spec.name !== "确认进度总览")
  .forEach((spec, index) => {
    const { sheet, headers, rowCount } = createTableSheet(spec, index + 1);
    addSheetValidations(spec, sheet, headers, rowCount);
  });

const overviewPreview = await workbook.render({ sheetName: "确认进度总览", autoCrop: "all", scale: 1, format: "png" });
await fs.writeFile(previewPath, new Uint8Array(await overviewPreview.arrayBuffer()));

const inspect = await workbook.inspect({
  kind: "sheet,table",
  maxChars: 10000,
  tableMaxRows: 3,
  tableMaxCols: 8,
});
await fs.writeFile(inspectPath, inspect.ndjson, "utf8");

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
