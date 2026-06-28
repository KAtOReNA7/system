import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync
} from "node:fs";
import path from "node:path";
import { inflateRawSync } from "node:zlib";

const TEXT_EXTENSIONS = new Set([".txt", ".md"]);
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png"]);
const DEFAULT_CONVERTER_TIMEOUT_MS = 60000;

export function extractPrivateMaterialContent(group, options = {}) {
  const companionText = readCompanionText(group);
  if (companionText !== null && IMAGE_EXTENSIONS.has(group.extension)) {
    return textExtractionResult({
      group,
      text: companionText,
      parseStatus: "parsed_from_image_manual_transcript",
      extractionStatus: "extracted_from_manual_transcript",
      extractionProvider: "manual_transcript",
      extractionProviderAvailable: true,
      extractionAttempted: true,
      manualTranscriptProvided: true,
      warnings: ["image_manual_transcript_used"],
      limitations: ["Image OCR is not called; same-stem text is treated as a manual transcript."]
    });
  }

  if (companionText !== null && !TEXT_EXTENSIONS.has(group.extension)) {
    return textExtractionResult({
      group,
      text: companionText,
      parseStatus: "parsed_from_companion_text_enhanced",
      extractionStatus: "extracted_from_companion_text",
      extractionProvider: "companion_text",
      extractionProviderAvailable: true,
      extractionAttempted: true,
      manualTranscriptProvided: true,
      warnings: ["companion_text_used_as_enhancement"],
      limitations: ["Companion text is an enhancement, not a requirement for accepting this primary material."]
    });
  }

  if (TEXT_EXTENSIONS.has(group.extension)) {
    return textExtractionResult({
      group,
      text: readFileSync(group.absolutePath, "utf8"),
      parseStatus: "parsed_from_text",
      extractionStatus: "extracted_from_text",
      extractionProvider: "plain_text",
      extractionProviderAvailable: true,
      extractionAttempted: true
    });
  }

  if (group.extension === ".docx") {
    return extractDocxText(group);
  }

  if (group.extension === ".doc") {
    return extractLegacyDocText(group, options);
  }

  if (IMAGE_EXTENSIONS.has(group.extension)) {
    return metadataOnlyResult(group, {
      parseStatus: "accepted_image_metadata_only",
      extractionStatus: "metadata_only",
      extractionProvider: "image_metadata_only",
      extractionProviderAvailable: true,
      extractionAttempted: false,
      visualExtractionRequired: true,
      limitations: ["Image extraction is metadata-only in this runner; OCR is not called."]
    });
  }

  if (group.extension === ".pdf") {
    return metadataOnlyResult(group, {
      parseStatus: "accepted_pdf_metadata_only",
      extractionStatus: "metadata_only",
      extractionProvider: "pdf_metadata_only",
      extractionProviderAvailable: true,
      extractionAttempted: false,
      limitations: ["PDF extraction is metadata-only unless a safe local text parser is added later.", "OCR is not called."]
    });
  }

  if (group.extension === ".pptx") {
    return metadataOnlyResult(group, {
      parseStatus: "accepted_pptx_metadata_only",
      extractionStatus: "metadata_only",
      extractionProvider: "pptx_metadata_only",
      extractionProviderAvailable: true,
      extractionAttempted: false,
      limitations: ["PPTX extraction is metadata-only in this version."]
    });
  }

  if (group.extension === ".xlsx") {
    return metadataOnlyResult(group, {
      parseStatus: "accepted_spreadsheet_metadata_only",
      extractionStatus: "metadata_only",
      extractionProvider: "spreadsheet_metadata_only",
      extractionProviderAvailable: true,
      extractionAttempted: false,
      limitations: ["Spreadsheet cell extraction is deferred until a safe local parser is added."]
    });
  }

  return metadataOnlyResult(group, {
    parseStatus: "unsupported_extension",
    extractionStatus: "unsupported",
    extractionProvider: "none",
    extractionProviderAvailable: false,
    extractionAttempted: false,
    extractionFailureReason: "unsupported_extension",
    limitations: ["Unsupported extension."]
  });
}

export function detectLegacyDocConverter() {
  for (const command of ["soffice", "libreoffice"]) {
    if (commandExists(command)) {
      return { name: command, command, type: "libreoffice" };
    }
  }
  for (const command of ["antiword", "catdoc"]) {
    if (commandExists(command)) {
      return { name: command, command, type: command };
    }
  }
  return null;
}

export function extractTextFromDocxBuffer(buffer) {
  const entries = readZipEntries(buffer);
  const documentXml = entries.get("word/document.xml");
  if (!documentXml) {
    throw new Error("docx document.xml missing");
  }
  return extractWordDocumentText(documentXml.toString("utf8"));
}

export function extractWordDocumentText(xml) {
  const paragraphs = String(xml)
    .split(/<\/w:p>/)
    .map((paragraphXml) => {
      const runs = [];
      for (const match of paragraphXml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)) {
        runs.push(decodeXmlEntities(match[1]));
      }
      return runs.join("");
    })
    .map((text) => text.trim())
    .filter(Boolean);
  return paragraphs.join("\n").trim();
}

export function readZipEntries(buffer) {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries = new Map();
  let offset = centralDirectoryOffset;
  const end = centralDirectoryOffset + centralDirectorySize;

  while (offset < end) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error("invalid zip central directory");
    }
    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const fileName = buffer.toString("utf8", offset + 46, offset + 46 + fileNameLength);
    const localFileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    entries.set(fileName, inflateZipPayload(compressed, compressionMethod));
    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function extractLegacyDocText(group, options) {
  const converter = Object.hasOwn(options, "legacyDocConverter") && options.legacyDocConverter !== undefined
    ? options.legacyDocConverter
    : detectLegacyDocConverter();

  if (!converter) {
    return metadataOnlyResult(group, {
      parseStatus: "legacy_doc_converter_unavailable",
      extractionStatus: "metadata_only",
      extractionProvider: "legacy_doc_converter",
      extractionProviderAvailable: false,
      extractionAttempted: false,
      extractionFailureReason: "legacy_doc_converter_unavailable",
      legacyDocExtractionRequired: true,
      limitations: ["No local legacy .doc converter was found; fallback is metadata-only."]
    });
  }

  try {
    const converted = convertLegacyDocToText(group, converter, options);
    const text = typeof converted === "string" ? converted : converted.text;
    if (!String(text ?? "").trim()) {
      return metadataOnlyResult(group, {
        parseStatus: "legacy_doc_conversion_failed",
        extractionStatus: "metadata_only",
        extractionProvider: "legacy_doc_converter",
        extractionProviderAvailable: true,
        extractionAttempted: true,
        extractionFailureReason: "legacy_doc_empty_output",
        converterUsed: converter.name,
        privateTempFileCreated: converted.privateTempFileCreated === true,
        privateTempFileCleaned: converted.privateTempFileCleaned === true,
        legacyDocExtractionRequired: true,
        warnings: ["legacy_doc_empty_output"],
        limitations: ["Legacy .doc converter produced no usable text."]
      });
    }

    return textExtractionResult({
      group,
      text,
      parseStatus: "parsed_from_legacy_doc_text",
      extractionStatus: "extracted_from_legacy_doc_text",
      extractionProvider: "legacy_doc_converter",
      extractionProviderAvailable: true,
      extractionAttempted: true,
      converterUsed: converter.name,
      privateTempFileCreated: converted.privateTempFileCreated === true,
      privateTempFileCleaned: converted.privateTempFileCleaned === true,
      warnings: converted.warnings ?? [],
      limitations: ["Legacy .doc text was extracted by a local optional converter."]
    });
  } catch (error) {
    return metadataOnlyResult(group, {
      parseStatus: "legacy_doc_conversion_failed",
      extractionStatus: "metadata_only",
      extractionProvider: "legacy_doc_converter",
      extractionProviderAvailable: true,
      extractionAttempted: true,
      extractionFailureReason: "legacy_doc_conversion_failed",
      converterUsed: converter.name,
      legacyDocExtractionRequired: true,
      warnings: ["legacy_doc_conversion_failed"],
      limitations: ["Legacy .doc conversion failed and fell back to metadata-only mode.", error.message]
    });
  }
}

function extractDocxText(group) {
  try {
    const text = extractTextFromDocxBuffer(readFileSync(group.absolutePath));
    if (!text) {
      return metadataOnlyResult(group, {
        parseStatus: "accepted_docx_metadata_only",
        extractionStatus: "metadata_only",
        extractionProvider: "docx_xml",
        extractionProviderAvailable: true,
        extractionAttempted: true,
        extractionFailureReason: "docx_text_empty",
        warnings: ["docx_text_empty"],
        limitations: ["DOCX contained no extractable document.xml text."]
      });
    }
    return textExtractionResult({
      group,
      text,
      parseStatus: "parsed_from_docx_text",
      extractionStatus: "extracted_from_docx_text",
      extractionProvider: "docx_xml",
      extractionProviderAvailable: true,
      extractionAttempted: true
    });
  } catch (error) {
    return metadataOnlyResult(group, {
      parseStatus: "accepted_docx_metadata_only",
      extractionStatus: "metadata_only",
      extractionProvider: "docx_xml",
      extractionProviderAvailable: true,
      extractionAttempted: true,
      extractionFailureReason: "docx_text_extraction_failed",
      warnings: ["docx_text_extraction_failed"],
      limitations: ["DOCX text extraction failed and fell back to metadata-only mode.", error.message]
    });
  }
}

function convertLegacyDocToText(group, converter, options) {
  if (typeof converter.convertToText === "function") {
    const converted = converter.convertToText({
      inputPath: group.absolutePath,
      anonymousMaterialId: group.anonymousMaterialId,
      privateTempDir: options.privateTempDir
    });
    return typeof converted === "string" ? { text: converted } : converted;
  }

  if (converter.type === "libreoffice") {
    return convertLegacyDocWithLibreOffice(group, converter, options);
  }
  if (converter.type === "antiword" || converter.type === "catdoc") {
    const text = execFileSync(converter.command, [group.absolutePath], {
      encoding: "utf8",
      timeout: options.converterTimeoutMs ?? DEFAULT_CONVERTER_TIMEOUT_MS,
      stdio: ["ignore", "pipe", "ignore"]
    });
    return { text };
  }
  throw new Error(`unsupported legacy doc converter ${converter.name ?? "unknown"}`);
}

function convertLegacyDocWithLibreOffice(group, converter, options) {
  const privateTempDir = options.privateTempDir;
  if (!privateTempDir) {
    throw new Error("privateTempDir is required for LibreOffice conversion");
  }
  mkdirSync(privateTempDir, { recursive: true });
  const runTempDir = path.join(
    privateTempDir,
    `${safeTempName(group.anonymousMaterialId)}-${Date.now()}-${process.pid}`
  );
  mkdirSync(runTempDir, { recursive: true });
  let privateTempFileCreated = true;
  let privateTempFileCleaned = false;
  let text = "";
  try {
    execFileSync(converter.command, [
      "--headless",
      "--convert-to",
      "txt:Text",
      "--outdir",
      runTempDir,
      group.absolutePath
    ], {
      timeout: options.converterTimeoutMs ?? DEFAULT_CONVERTER_TIMEOUT_MS,
      stdio: ["ignore", "ignore", "ignore"]
    });
    const txtFile = readdirSync(runTempDir)
      .filter((name) => path.extname(name).toLowerCase() === ".txt")
      .sort()[0];
    if (!txtFile) {
      throw new Error("LibreOffice produced no txt output");
    }
    text = readFileSync(path.join(runTempDir, txtFile), "utf8");
  } finally {
    if (existsSync(runTempDir)) {
      rmSync(runTempDir, { recursive: true, force: true });
      privateTempFileCleaned = true;
    }
  }
  return { text, privateTempFileCreated, privateTempFileCleaned };
}

function textExtractionResult({
  group,
  text,
  parseStatus,
  extractionStatus,
  extractionProvider,
  extractionProviderAvailable,
  extractionAttempted,
  extractionFailureReason = null,
  manualTranscriptProvided = false,
  converterUsed = null,
  privateTempFileCreated = false,
  privateTempFileCleaned = false,
  warnings = [],
  limitations = []
}) {
  const safeText = String(text ?? "");
  return {
    anonymousMaterialId: group.anonymousMaterialId,
    extension: group.extension,
    parseStatus,
    extractionStatus,
    extractionProvider,
    extractionProviderAvailable,
    extractionAttempted,
    extractionFailureReason,
    manualTranscriptProvided,
    converterUsed,
    privateTempFileCreated,
    privateTempFileCleaned,
    extractedTextAvailable: safeText.trim().length > 0,
    extractedText: safeText,
    extractedTextLengthBucket: textLengthBucket(safeText),
    extractedFieldCandidates: fieldCandidatesFromText(safeText),
    extractionWarnings: warnings,
    extractionLimitations: limitations,
    manualExtractionRequired: safeText.trim().length === 0,
    visualExtractionRequired: false,
    legacyDocExtractionRequired: false,
    hasCompanionText: group.hasCompanionText
  };
}

function metadataOnlyResult(group, {
  parseStatus,
  extractionStatus,
  extractionProvider,
  extractionProviderAvailable,
  extractionAttempted,
  extractionFailureReason = null,
  manualTranscriptProvided = false,
  converterUsed = null,
  privateTempFileCreated = false,
  privateTempFileCleaned = false,
  warnings = [],
  limitations = [],
  visualExtractionRequired = false,
  legacyDocExtractionRequired = false
}) {
  return {
    anonymousMaterialId: group.anonymousMaterialId,
    extension: group.extension,
    parseStatus,
    extractionStatus,
    extractionProvider,
    extractionProviderAvailable,
    extractionAttempted,
    extractionFailureReason,
    manualTranscriptProvided,
    converterUsed,
    privateTempFileCreated,
    privateTempFileCleaned,
    extractedTextAvailable: false,
    extractedText: "",
    extractedTextLengthBucket: "none",
    extractedFieldCandidates: [],
    extractionWarnings: warnings,
    extractionLimitations: limitations,
    manualExtractionRequired: true,
    visualExtractionRequired,
    legacyDocExtractionRequired,
    hasCompanionText: group.hasCompanionText
  };
}

function readCompanionText(group) {
  if (!group.hasCompanionText) return null;
  return readFileSync(group.companionTextFiles[0].absolutePath, "utf8");
}

function commandExists(command) {
  const locator = process.platform === "win32" ? "where.exe" : "which";
  try {
    execFileSync(locator, [command], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function findEndOfCentralDirectory(buffer) {
  const minOffset = Math.max(0, buffer.length - 65557);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }
  throw new Error("zip end of central directory missing");
}

function inflateZipPayload(buffer, compressionMethod) {
  if (compressionMethod === 0) return buffer;
  if (compressionMethod === 8) return inflateRawSync(buffer);
  throw new Error(`unsupported zip compression method ${compressionMethod}`);
}

function decodeXmlEntities(value) {
  return String(value)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function textLengthBucket(text) {
  const length = String(text ?? "").trim().length;
  if (length === 0) return "none";
  if (length < 500) return "short";
  if (length < 3000) return "medium";
  return "long";
}

function fieldCandidatesFromText(text) {
  const candidates = [];
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const match = line.match(/^\s*([^:\uFF1A]{1,48})\s*[:\uFF1A]\s*(.+?)\s*$/u);
    if (!match) continue;
    candidates.push({
      key: normalizeCandidateKey(match[1]),
      valueState: "present",
      source: "extracted_text",
      valueLengthBucket: textLengthBucket(match[2])
    });
  }
  return candidates;
}

function normalizeCandidateKey(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 64);
}

function safeTempName(value) {
  return String(value ?? "legacy-doc")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .slice(0, 80);
}
