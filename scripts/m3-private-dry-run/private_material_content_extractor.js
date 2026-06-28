import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

const TEXT_EXTENSIONS = new Set([".txt", ".md"]);
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png"]);

export function extractPrivateMaterialContent(group) {
  const companionText = readCompanionText(group);
  if (companionText !== null && !TEXT_EXTENSIONS.has(group.extension)) {
    return textExtractionResult({
      group,
      text: companionText,
      parseStatus: "parsed_from_companion_text_enhanced",
      extractionStatus: "extracted_from_companion_text",
      warnings: ["companion_text_used_as_enhancement"],
      limitations: ["Companion text is an enhancement, not a requirement for accepting this primary material."]
    });
  }

  if (TEXT_EXTENSIONS.has(group.extension)) {
    return textExtractionResult({
      group,
      text: readFileSync(group.absolutePath, "utf8"),
      parseStatus: "parsed_from_text",
      extractionStatus: "extracted_from_text"
    });
  }

  if (group.extension === ".docx") {
    return extractDocxText(group);
  }

  if (group.extension === ".doc") {
    return metadataOnlyResult(group, {
      parseStatus: "accepted_legacy_doc_metadata_only",
      extractionStatus: "metadata_only",
      legacyDocExtractionRequired: true,
      limitations: ["Legacy binary Word .doc extraction is not attempted by this local runner."]
    });
  }

  if (IMAGE_EXTENSIONS.has(group.extension)) {
    return metadataOnlyResult(group, {
      parseStatus: "accepted_image_metadata_only",
      extractionStatus: "metadata_only",
      visualExtractionRequired: true,
      limitations: ["Image extraction is metadata-only in this runner; OCR is not called."]
    });
  }

  if (group.extension === ".pdf") {
    return metadataOnlyResult(group, {
      parseStatus: "accepted_pdf_metadata_only",
      extractionStatus: "metadata_only",
      limitations: ["PDF extraction is metadata-only unless a safe local text parser is added later.", "OCR is not called."]
    });
  }

  if (group.extension === ".pptx") {
    return metadataOnlyResult(group, {
      parseStatus: "accepted_pptx_metadata_only",
      extractionStatus: "metadata_only",
      limitations: ["PPTX extraction is metadata-only in this version."]
    });
  }

  if (group.extension === ".xlsx") {
    return metadataOnlyResult(group, {
      parseStatus: "accepted_spreadsheet_metadata_only",
      extractionStatus: "metadata_only",
      limitations: ["Spreadsheet cell extraction is deferred until a safe local parser is added."]
    });
  }

  return metadataOnlyResult(group, {
    parseStatus: "unsupported_extension",
    extractionStatus: "unsupported",
    limitations: ["Unsupported extension."]
  });
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

function extractDocxText(group) {
  try {
    const text = extractTextFromDocxBuffer(readFileSync(group.absolutePath));
    if (!text) {
      return metadataOnlyResult(group, {
        parseStatus: "accepted_docx_metadata_only",
        extractionStatus: "metadata_only",
        warnings: ["docx_text_empty"],
        limitations: ["DOCX contained no extractable document.xml text."]
      });
    }
    return textExtractionResult({
      group,
      text,
      parseStatus: "parsed_from_docx_text",
      extractionStatus: "extracted_from_docx_text"
    });
  } catch (error) {
    return metadataOnlyResult(group, {
      parseStatus: "accepted_docx_metadata_only",
      extractionStatus: "metadata_only",
      warnings: ["docx_text_extraction_failed"],
      limitations: ["DOCX text extraction failed and fell back to metadata-only mode.", error.message]
    });
  }
}

function textExtractionResult({
  group,
  text,
  parseStatus,
  extractionStatus,
  warnings = [],
  limitations = []
}) {
  const safeText = String(text ?? "");
  return {
    anonymousMaterialId: group.anonymousMaterialId,
    extension: group.extension,
    parseStatus,
    extractionStatus,
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
