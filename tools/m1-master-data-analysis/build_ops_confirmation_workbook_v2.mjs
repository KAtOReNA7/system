import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const opsRoot = path.join(root, "data", "m1-master-data-private", "ops-confirmation");
const inputPath = path.join(opsRoot, "ops-confirmation-v2-data.json");
const outputPath = path.join(opsRoot, "M1-运营确认包-v2.xlsx");
const previewPath = path.join(opsRoot, "M1-运营确认包-v2-preview.png");
const inspectPath = path.join(opsRoot, "M1-运营确认包-v2-inspect.ndjson");

const payload = JSON.parse(await fs.readFile(inputPath, "utf8"));

const workbook = Workbook.create();

const COLORS = {
  header: "#2E4780",
  subHeader: "#5477C4",
  fill: "#EAF1FE",
  warn: "#FFF4C2",
  danger: "#FFEDDE",
  ok: "#D8ECBD",
  border: "#D7DBE7",
  ink: "#1F2430",
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

function sheetName(name) {
  return name.slice(0, 31);
}

function sanitizeTableName(name, index) {
  return `T${index}_${name.replace(/[^A-Za-z0-9]/g, "").slice(0, 18) || "Sheet"}`;
}

function matrixFromRows(rows) {
  const headers = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!headers.includes(key)) headers.push(key);
    }
  }
  return { headers, matrix: [headers, ...rows.map((row) => headers.map((header) => row[header] ?? ""))] };
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
  } catch {
    // Conditional formatting is usability-only; workbook content remains valid without it.
  }
}

function formatTableSheet(sheet, rows, index, options = {}) {
  sheet.showGridLines = false;
  const { headers, matrix } = matrixFromRows(rows);
  const rowCount = Math.max(rows.length + 1, 1);
  const colCount = Math.max(headers.length, 1);
  const end = `${colLetter(colCount - 1)}${rowCount}`;
  sheet.getRange(`A1:${end}`).values = matrix.length ? matrix : [[""]];
  sheet.getRange(`A1:${colLetter(colCount - 1)}1`).format = {
    fill: COLORS.subHeader,
    font: { bold: true, color: "#FFFFFF" },
    wrapText: true,
  };
  sheet.getRange(`A1:${end}`).format.borders = { preset: "all", style: "thin", color: COLORS.border };
  sheet.getRange(`A1:${end}`).format.wrapText = true;
  if (rows.length > 0) {
    const table = sheet.tables.add(`A1:${end}`, true, sanitizeTableName(sheet.name ?? `S${index}`, index));
    table.showFilterButton = true;
    table.showBandedRows = true;
  }
  sheet.freezePanes.freezeRows(1);
  sheet.freezePanes.freezeColumns(options.freezeColumns ?? 1);

  for (let c = 0; c < colCount; c++) {
    const header = headers[c] ?? "";
    const colRange = sheet.getRangeByIndexes(0, c, rowCount, 1);
    if (header.includes("完整精度")) {
      colRange.format.columnWidth = 2;
      colRange.format.font = { color: "#FFFFFF" };
    } else if (header.includes("说明") || header.includes("候选") || header.includes("名称") || header.includes("备注") || header.includes("字段")) {
      colRange.format.columnWidth = 28;
    } else if (header.includes("金额") || header.includes("实销")) {
      colRange.format.columnWidth = 14;
    } else if (header.includes("日期")) {
      colRange.format.columnWidth = 14;
    } else {
      colRange.format.columnWidth = 16;
    }
  }

  for (const header of headers) {
    const col = headers.indexOf(header);
    if (header === "累计实销" || header === "金额") {
      sheet.getRangeByIndexes(1, col, Math.max(rows.length, 1), 1).format.numberFormat = [["#,##0.00"]];
    }
    if (header.includes("确认版权") || header.includes("日期")) {
      sheet.getRangeByIndexes(1, col, Math.max(rows.length, 1), 1).format.numberFormat = [["yyyy-mm-dd"]];
    }
  }
  return headers;
}

function buildOverview() {
  const sheet = workbook.worksheets.add("确认进度总览");
  sheet.showGridLines = false;
  sheet.getRange("A1:J1").merge();
  sheet.getRange("A1:J1").values = [["M1 运营确认包 v2 - 确认进度总览"]];
  sheet.getRange("A1:J1").format = { fill: COLORS.header, font: { bold: true, color: "#FFFFFF", size: 15 } };
  sheet.getRange("A2:J2").merge();
  sheet.getRange("A2:J2").values = [[
    "本包将正式导入阻断、M2基础信息补全、台账真实冲突和非阻断观察分离；同一标准作品基础信息只在“标准作品基础信息补全”填写。生成时间：",
  ]];
  sheet.getRange("A3:B3").values = [["生成时间", new Date(payload.generated_at)]];
  sheet.getRange("B3").format.numberFormat = "yyyy-mm-dd hh:mm:ss";

  const headers = [
    "任务类型",
    "任务总数",
    "已确认",
    "待确认",
    "需补充资料",
    "未解除阻断",
    "正式导入阻断数量",
    "M2基础信息缺失数量",
    "完成率",
    "填写说明",
  ];
  const startRow = 5;
  sheet.getRange(`A${startRow}:J${startRow}`).values = [headers];
  sheet.getRange(`A${startRow}:J${startRow}`).format = { fill: COLORS.subHeader, font: { bold: true, color: "#FFFFFF" }, wrapText: true };

  const configs = [
    ["正式导入阻断确认", "运营确认结果", "是否解除阻断", "正式导入前必须处理。"],
    ["多ID归并候选", "是否归并", "是否解除阻断", "只包含两个及以上标准作品ID候选。"],
    ["标准作品基础信息补全", "补全状态", "", "M2评估前补齐；不要求首次迁移前全部完成。"],
    ["台账真实冲突", "运营确认值", "是否解除冲突", "只包含台账同ID关键字段冲突。"],
    ["版权期限反例", "确认版权开始日期", "是否解除阻断", "签订日期=版权开始日期；到期时间=版权到期日期。"],
    ["非阻断观察", "是否标记为异常", "是否升级为阻断", "默认不阻断收入事实入库。"],
  ];

  const rows = [];
  for (const [name, statusHeader, unblockHeader, note] of configs) {
    const spec = payload.sheets.find((s) => s.name === name);
    const total = spec?.rows?.length ?? 0;
    const rowNumber = startRow + 1 + rows.length;
    const headersInSheet = spec?.rows?.length ? Object.keys(spec.rows[0]) : [];
    const statusCol = headersInSheet.indexOf(statusHeader) >= 0 ? colLetter(headersInSheet.indexOf(statusHeader)) : "";
    const unblockCol = unblockHeader && headersInSheet.indexOf(unblockHeader) >= 0 ? colLetter(headersInSheet.indexOf(unblockHeader)) : "";
    const last = total + 1;
    rows.push([
      name,
      total,
      statusCol ? `=COUNTIF('${name}'!${statusCol}2:${statusCol}${last},"<>")-COUNTIF('${name}'!${statusCol}2:${statusCol}${last},"需补充资料")` : 0,
      statusCol ? `=COUNTBLANK('${name}'!${statusCol}2:${statusCol}${last})` : 0,
      statusCol ? `=COUNTIF('${name}'!${statusCol}2:${statusCol}${last},"需补充资料")` : 0,
      unblockCol ? `=COUNTIF('${name}'!${unblockCol}2:${unblockCol}${last},"否")+COUNTBLANK('${name}'!${unblockCol}2:${unblockCol}${last})` : "",
      name === "正式导入阻断确认" ? total : "",
      name === "标准作品基础信息补全" ? payload.metrics.m2_basic_info_missing_count : "",
      `=IF(B${rowNumber}=0,1,C${rowNumber}/B${rowNumber})`,
      note,
    ]);
  }
  sheet.getRange(`A${startRow + 1}:J${startRow + rows.length}`).values = rows.map((row) =>
    row.map((value) => (typeof value === "string" && value.startsWith("=") ? null : value)),
  );
  sheet.getRange(`C${startRow + 1}:I${startRow + rows.length}`).formulas = rows.map((row) =>
    row.slice(2, 9).map((value) => (typeof value === "string" && value.startsWith("=") ? value : null)),
  );
  sheet.getRange(`A${startRow}:J${startRow + rows.length}`).format.borders = { preset: "all", style: "thin", color: COLORS.border };
  sheet.getRange(`I${startRow + 1}:I${startRow + rows.length}`).format.numberFormat = "0.0%";
  sheet.getRange(`A1:J${startRow + rows.length + 6}`).format.wrapText = true;
  sheet.freezePanes.freezeRows(startRow);
  sheet.getRange("A:J").format.autofitColumns();
  sheet.getRange("J:J").format.columnWidth = 42;

  const notesStart = startRow + rows.length + 3;
  sheet.getRange(`A${notesStart}:J${notesStart}`).merge();
  sheet.getRange(`A${notesStart}:J${notesStart}`).values = [[
    "填写说明：1）正式导入阻断表只处理账单入库前必须确认的问题；2）基础信息只在“标准作品基础信息补全”填写；3）非阻断观察默认不影响收入事实入库；4）不得根据出现频率、金额或日期长短自动选择标准名称、作者、分类或版权期限。",
  ]];
  sheet.getRange(`A${notesStart}:J${notesStart}`).format = { fill: COLORS.fill, wrapText: true };
  return sheet;
}

function addAllSheets() {
  buildOverview();
  payload.sheets
    .filter((spec) => spec.name !== "确认进度总览")
    .forEach((spec, i) => {
      const sheet = workbook.worksheets.add(sheetName(spec.name));
      const freezeColumns = spec.name === "标准作品基础信息补全" ? 2 : 1;
      const headers = formatTableSheet(sheet, spec.rows, i + 1, { freezeColumns });
      if (spec.name === "正式导入阻断确认") {
        addValidation(sheet, headers, spec.rows.length, "运营确认结果", [
          "确认为同一作品的历史更名",
          "确认为账单错配，需修改源文件",
          "确认为合集或打包产品",
          "确认为历史分册映射",
          "需补充资料",
          "不适用",
        ]);
        addValidation(sheet, headers, spec.rows.length, "是否解除阻断", ["是", "否"]);
        addConditional(sheet, headers, spec.rows.length, "运营确认结果");
        addConditional(sheet, headers, spec.rows.length, "是否解除阻断");
      }
      if (spec.name === "多ID归并候选") {
        addValidation(sheet, headers, spec.rows.length, "是否归并", ["是", "否", "需补充资料", "不适用"]);
        addValidation(sheet, headers, spec.rows.length, "其他ID处理方式", ["历史分册映射", "保留独立作品", "账单错配待修正", "需补充资料", "不适用"]);
        addValidation(sheet, headers, spec.rows.length, "是否解除阻断", ["是", "否"]);
      }
      if (spec.name === "标准作品基础信息补全") {
        addValidation(sheet, headers, spec.rows.length, "补全状态", ["已补齐", "需补充资料", "暂不处理"]);
      }
      if (spec.name === "台账真实冲突") {
        addValidation(sheet, headers, spec.rows.length, "是否解除冲突", ["是", "否", "需补充资料"]);
      }
      if (spec.name === "版权期限反例") {
        addValidation(sheet, headers, spec.rows.length, "是否解除阻断", ["是", "否", "需补充资料"]);
      }
      if (spec.name === "非阻断观察") {
        addValidation(sheet, headers, spec.rows.length, "是否标记为异常", ["否", "是", "需补充资料"]);
        addValidation(sheet, headers, spec.rows.length, "是否升级为阻断", ["否", "是"]);
      }
      ["是否解除阻断", "是否解除冲突", "补全状态", "是否标记为异常", "是否升级为阻断"].forEach((header) =>
        addConditional(sheet, headers, spec.rows.length, header),
      );
    });
}

addAllSheets();

const overviewPreview = await workbook.render({ sheetName: "确认进度总览", autoCrop: "all", scale: 1, format: "png" });
await fs.writeFile(previewPath, new Uint8Array(await overviewPreview.arrayBuffer()));

const inspect = await workbook.inspect({
  kind: "sheet,table",
  maxChars: 8000,
  tableMaxRows: 4,
  tableMaxCols: 8,
});
await fs.writeFile(inspectPath, inspect.ndjson, "utf8");

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

