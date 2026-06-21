import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const privateRoot = path.join(root, "data", "m1-master-data-private");
const opsRoot = path.join(privateRoot, "ops-confirmation");
const inputPath = path.join(opsRoot, "ops-confirmation-workbook-data.json");
const outputPath = path.join(opsRoot, "M1-运营确认包.xlsx");
const previewPath = path.join(opsRoot, "M1-运营确认包-preview.png");

const payload = JSON.parse(await fs.readFile(inputPath, "utf8"));
const workbook = Workbook.create();

const readme = workbook.worksheets.add("README");
readme.showGridLines = false;
readme.getRange("A1:F1").merge();
readme.getRange("A1:F1").values = [["M1 运营确认包"]];
readme.getRange("A1:F1").format = {
  fill: "#2E4780",
  font: { bold: true, color: "#FFFFFF", size: 15 },
};
readme.getRange("A3:F10").values = [
  ["生成时间", payload.generated_at, "", "", "", ""],
  ["填写方式", "每个工作表按冲突组填写，不需要逐行确认账单明细。", "", "", "", ""],
  ["确认结果建议值", "确认采用 / 确认为异常 / 需补充资料 / 不适用", "", "", "", ""],
  ["是否解除阻断建议值", "是 / 否", "", "", "", ""],
  ["注意", "本工作簿包含作品级敏感信息，仅保存在本地 Git 忽略目录。", "", "", "", ""],
  ["输出目录", opsRoot, "", "", "", ""],
  ["业务规则", "不自动选择出现次数最多或收入最高的名称；不凭书名相似自动关联。", "", "", "", ""],
  ["后续处理", "确认结果应形成版本化映射或基础信息变更记录，并应用于组内全部相关收入投影。", "", "", "", ""],
];
readme.getRange("A3:A10").format = { fill: "#EAF1FE", font: { bold: true } };
readme.getRange("A1:F10").format.wrapText = true;
readme.getRange("A1:F10").format.autofitColumns();

function truncateSheetName(name) {
  return name.replace(/^\d+-/, "").slice(0, 31);
}

function columnLetter(index) {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

for (const sheetSpec of payload.sheets) {
  const sheet = workbook.worksheets.add(truncateSheetName(sheetSpec.name));
  sheet.showGridLines = false;
  const rows = sheetSpec.rows ?? [];
  const headers = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!headers.includes(key)) headers.push(key);
    }
  }
  if (headers.length === 0) {
    headers.push("confirmation_group_id", "system_candidate_explanation", "运营确认结果", "是否解除阻断", "运营备注");
  }
  const matrix = [headers, ...rows.map((row) => headers.map((header) => row[header] ?? ""))];
  const endCell = `${columnLetter(headers.length - 1)}${Math.max(1, matrix.length)}`;
  sheet.getRange(`A1:${endCell}`).values = matrix;
  sheet.getRange(`A1:${columnLetter(headers.length - 1)}1`).format = {
    fill: "#5477C4",
    font: { bold: true, color: "#FFFFFF" },
    wrapText: true,
  };
  sheet.getRange(`A1:${endCell}`).format.borders = { preset: "all", style: "thin", color: "#D7DBE7" };
  sheet.freezePanes.freezeRows(1);
  const table = sheet.tables.add(`A1:${endCell}`, true, `T${sheetSpec.name.replace(/[^A-Za-z0-9]/g, "").slice(0, 20)}`);
  table.showFilterButton = true;
  table.showBandedRows = true;
  const used = sheet.getRange(`A1:${endCell}`);
  used.format.wrapText = true;
  used.format.autofitColumns();
  const resultCol = headers.indexOf("运营确认结果");
  const unblockCol = headers.indexOf("是否解除阻断");
  if (resultCol >= 0 && rows.length > 0) {
    const col = columnLetter(resultCol);
    sheet.getRange(`${col}2:${col}${rows.length + 1}`).dataValidation = {
      rule: { type: "list", values: ["确认采用", "确认为异常", "需补充资料", "不适用"] },
    };
  }
  if (unblockCol >= 0 && rows.length > 0) {
    const col = columnLetter(unblockCol);
    sheet.getRange(`${col}2:${col}${rows.length + 1}`).dataValidation = {
      rule: { type: "list", values: ["是", "否"] },
    };
  }
}

const preview = await workbook.render({ sheetName: "README", autoCrop: "all", scale: 1, format: "png" });
await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

const inspect = await workbook.inspect({
  kind: "sheet,table",
  maxChars: 6000,
  tableMaxRows: 3,
  tableMaxCols: 8,
});
await fs.writeFile(path.join(opsRoot, "workbook-inspect.ndjson"), inspect.ndjson, "utf8");
