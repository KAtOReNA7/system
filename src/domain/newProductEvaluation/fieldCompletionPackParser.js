export const FIELD_COMPLETION_PACK_FORMATS = Object.freeze(["json", "markdown", "xlsx"]);

export function inferFieldCompletionPackFormat(filePath = "") {
  const lower = String(filePath).toLowerCase();
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "markdown";
  if (lower.endsWith(".xlsx")) return "xlsx";
  return "unknown";
}

export function parseFieldCompletionPack(content, options = {}) {
  const format = options.format ?? inferFieldCompletionPackFormat(options.filePath);
  if (format === "json") return parseJsonCompletionPack(content);
  if (format === "markdown") return parseMarkdownCompletionPack(content);
  if (format === "xlsx") return parseXlsxCompletionPack();
  throw new Error(`unsupported field completion pack format: ${format}`);
}

export function parseJsonCompletionPack(content) {
  const pack = typeof content === "string" ? JSON.parse(content) : content;
  const rows = normalizeRows(pack?.rows ?? []);
  return {
    format: "json",
    version: pack?.version ?? "unknown",
    materialCount: rows.length,
    rows,
    xlsxSupported: false
  };
}

export function parseMarkdownCompletionPack(content) {
  const table = findCompletionTable(String(content ?? ""));
  if (!table) {
    throw new Error("markdown completion pack table is missing anonymousMaterialId and user field columns");
  }

  const rows = table.rows.map((row) => rowFromMarkdown(table.headers, row));
  return {
    format: "markdown",
    version: findMarkdownVersion(content),
    materialCount: rows.length,
    rows: normalizeRows(rows),
    xlsxSupported: false
  };
}

export function parseXlsxCompletionPack() {
  const error = new Error("xlsx completion pack parsing is not enabled because this project has no xlsx/exceljs dependency");
  error.code = "xlsx_completion_pack_not_supported";
  throw error;
}

function findCompletionTable(markdown) {
  const lines = markdown.split(/\r?\n/);
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (!lines[index].trim().startsWith("|") || !isMarkdownDivider(lines[index + 1])) continue;
    const headers = splitMarkdownRow(lines[index]).map(normalizeHeader);
    if (!headers.includes("anonymousMaterialId")) continue;
    if (!headers.includes("title") && !headers.includes("userFieldsToFill")) continue;
    const rows = [];
    for (let rowIndex = index + 2; rowIndex < lines.length; rowIndex += 1) {
      if (!lines[rowIndex].trim().startsWith("|")) break;
      rows.push(splitMarkdownRow(lines[rowIndex]));
    }
    if (rows.length === 0) {
      throw new Error("markdown completion pack table has no rows");
    }
    return { headers, rows };
  }
  return null;
}

function rowFromMarkdown(headers, values) {
  const byHeader = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  return {
    anonymousMaterialId: byHeader.anonymousMaterialId,
    inputExtension: byHeader.inputExtension,
    parseStatus: byHeader.parseStatus,
    readinessStatus: byHeader.readinessStatus,
    hardBlockerCodes: splitList(byHeader.hardBlockerCodes),
    missingCoreFields: splitList(byHeader.missingCoreFields),
    warningCodes: splitList(byHeader.warningCodes),
    completionPackRecommended: parseBoolean(byHeader.completionPackRecommended),
    userFields: {
      title: byHeader.title ?? "",
      author: byHeader.author ?? "",
      source: byHeader.source ?? "",
      classification: byHeader.classification ?? "",
      wordCount: byHeader.wordCount ?? "",
      audioVolumeEstimate: byHeader.audioVolumeEstimate ?? "",
      heatSignalType: byHeader.heatSignalType ?? "",
      heatSignalValue: byHeader.heatSignalValue ?? "",
      copyrightTermRange: byHeader.copyrightTermRange ?? "",
      targetChannels: byHeader.targetChannels ?? "",
      sameNameAudioStatusCheckStatus: byHeader.sameNameAudioStatusCheckStatus ?? "",
      sameNameAudioStatus: byHeader.sameNameAudioStatus ?? "",
      completionStatus: byHeader.completionStatus ?? "",
      notes: byHeader.notes ?? ""
    }
  };
}

function normalizeRows(rows) {
  if (!Array.isArray(rows)) {
    throw new Error("field completion pack rows must be an array");
  }
  return rows.map((row) => ({
    anonymousMaterialId: String(row.anonymousMaterialId ?? "").trim(),
    inputExtension: row.inputExtension ?? "",
    parseStatus: row.parseStatus ?? "",
    readinessStatus: row.readinessStatus ?? "",
    hardBlockerCodes: normalizeList(row.hardBlockerCodes),
    missingCoreFields: normalizeList(row.missingCoreFields),
    warningCodes: normalizeList(row.warningCodes),
    extractedCandidateSummary: row.extractedCandidateSummary ?? {},
    researchQuestions: Array.isArray(row.researchQuestions) ? row.researchQuestions : [],
    completionPackRecommended: row.completionPackRecommended === true,
    userFields: normalizeUserFieldsForPack(row.userFields ?? {})
  }));
}

function normalizeUserFieldsForPack(fields) {
  return {
    title: stringValue(fields.title),
    author: stringValue(fields.author),
    source: stringValue(fields.source),
    classification: stringValue(fields.classification ?? fields.confirmedClassification),
    wordCount: stringValue(fields.wordCount),
    audioVolumeEstimate: stringValue(fields.audioVolumeEstimate),
    heatSignalType: normalizeHeatSignalType(fields.heatSignalType),
    heatSignalValue: stringValue(fields.heatSignalValue),
    copyrightTermRange: stringValue(fields.copyrightTermRange),
    targetChannels: normalizeDelimitedList(fields.targetChannels),
    sameNameAudioStatusCheckStatus: stringValue(fields.sameNameAudioStatusCheckStatus),
    sameNameAudioStatus: stringValue(fields.sameNameAudioStatus),
    completionStatus: stringValue(fields.completionStatus),
    notes: stringValue(fields.notes)
  };
}

function splitMarkdownRow(line) {
  const text = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells = [];
  let current = "";
  let escaping = false;
  for (const char of text) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = true;
      continue;
    }
    if (char === "|") {
      cells.push(unescapeMarkdownCell(current));
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(unescapeMarkdownCell(current));
  return cells;
}

function isMarkdownDivider(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function normalizeHeader(value) {
  const normalized = String(value ?? "").trim().replace(/^userFields\./, "");
  const aliases = {
    materialId: "anonymousMaterialId",
    anonymousId: "anonymousMaterialId",
    ext: "inputExtension",
    missing: "missingCoreFields",
    blockers: "hardBlockerCodes",
    warnings: "warningCodes",
    fillTitle: "title",
    fillAuthor: "author"
  };
  return aliases[normalized] ?? normalized;
}

function unescapeMarkdownCell(value) {
  return String(value ?? "").trim().replace(/\\\|/g, "|").replace(/<br\s*\/?>/gi, "\n");
}

function findMarkdownVersion(content) {
  const match = String(content ?? "").match(/#\s*(M3 private material field completion pack[^\n]*)/i);
  return match?.[1]?.trim() ?? "markdown_completion_pack";
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map(stringValue).filter(Boolean);
  return splitList(value);
}

function normalizeDelimitedList(value) {
  if (Array.isArray(value)) return value.map(stringValue).filter(Boolean).join(", ");
  return stringValue(value);
}

function splitList(value) {
  return String(value ?? "").split(/[,\n;]/).map((item) => item.trim()).filter(Boolean);
}

function parseBoolean(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["true", "yes", "1"].includes(normalized);
}

function normalizeHeatSignalType(value) {
  const normalized = String(value ?? "").trim();
  if (normalized === "rating") return "ratingScore";
  if (normalized === "ranking") return "rankings";
  if (normalized === "manualHeat") return "externalHeat";
  return normalized;
}

function stringValue(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}
