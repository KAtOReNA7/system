import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  extractPrivateMaterialContent,
  extractTextFromDocxBuffer
} from "../scripts/m3-private-dry-run/private_material_content_extractor.js";

test("private material content extractor parses txt and md as text", () => {
  withTempDir((dir) => {
    const txt = writeFixture(dir, "material-a.txt", "title: Secret Synthetic TXT");
    const md = writeFixture(dir, "material-b.md", "title: Secret Synthetic MD");

    const txtResult = extractPrivateMaterialContent(groupFor(txt));
    const mdResult = extractPrivateMaterialContent(groupFor(md));

    assert.equal(txtResult.parseStatus, "parsed_from_text");
    assert.equal(mdResult.parseStatus, "parsed_from_text");
    assert.equal(txtResult.extractionStatus, "extracted_from_text");
    assert.equal(mdResult.extractionStatus, "extracted_from_text");
    assert.equal(txtResult.extractedTextAvailable, true);
    assert.equal(mdResult.extractedTextAvailable, true);
  });
});

test("private material content extractor parses synthetic docx text", () => {
  const docx = makeDocxBuffer([
    "title: Secret Synthetic DOCX",
    "author: Secret Synthetic Author",
    "source: publication"
  ].join("\n"));

  const text = extractTextFromDocxBuffer(docx);
  assert.ok(text.includes("title: Secret Synthetic DOCX"));
  assert.ok(text.includes("author: Secret Synthetic Author"));

  withTempDir((dir) => {
    const file = writeFixture(dir, "material.docx", docx);
    const result = extractPrivateMaterialContent(groupFor(file));

    assert.equal(result.parseStatus, "parsed_from_docx_text");
    assert.equal(result.extractionStatus, "extracted_from_docx_text");
    assert.equal(result.extractedTextAvailable, true);
    assert.deepEqual(result.extractedFieldCandidates.map((item) => item.key), ["title", "author", "source"]);
  });
});

test("private material content extractor falls back on invalid docx", () => {
  withTempDir((dir) => {
    const file = writeFixture(dir, "broken.docx", "not-a-zip", "utf8");
    const result = extractPrivateMaterialContent(groupFor(file));

    assert.equal(result.parseStatus, "accepted_docx_metadata_only");
    assert.equal(result.extractionStatus, "metadata_only");
    assert.equal(result.extractedTextAvailable, false);
    assert.ok(result.extractionWarnings.includes("docx_text_extraction_failed"));
  });
});

test("private material content extractor keeps legacy doc metadata-only", () => {
  withTempDir((dir) => {
    const file = writeFixture(dir, "legacy.doc", "binary-placeholder", "utf8");
    const result = extractPrivateMaterialContent(groupFor(file), { legacyDocConverter: null });

    assert.equal(result.parseStatus, "legacy_doc_converter_unavailable");
    assert.equal(result.extractionStatus, "metadata_only");
    assert.equal(result.extractionProvider, "legacy_doc_converter");
    assert.equal(result.extractionProviderAvailable, false);
    assert.equal(result.extractionAttempted, false);
    assert.equal(result.extractionFailureReason, "legacy_doc_converter_unavailable");
    assert.equal(result.legacyDocExtractionRequired, true);
    assert.equal(result.manualExtractionRequired, true);
  });
});

test("private material content extractor parses legacy doc text through mock converter", () => {
  withTempDir((dir) => {
    const file = writeFixture(dir, "legacy.doc", "binary-placeholder", "utf8");
    const privateTempDir = path.join(dir, "data", "private-output", "m3-dry-run", "tmp");
    const result = extractPrivateMaterialContent(groupFor(file), {
      privateTempDir,
      legacyDocConverter: {
        name: "mock-converter",
        convertToText({ privateTempDir: actualTempDir }) {
          assert.equal(actualTempDir, privateTempDir);
          return {
            text: "title: Secret Synthetic Legacy Doc\nauthor: Secret Synthetic Author",
            privateTempFileCreated: true,
            privateTempFileCleaned: true
          };
        }
      }
    });

    assert.equal(result.parseStatus, "parsed_from_legacy_doc_text");
    assert.equal(result.extractionStatus, "extracted_from_legacy_doc_text");
    assert.equal(result.extractionProviderAvailable, true);
    assert.equal(result.extractionAttempted, true);
    assert.equal(result.converterUsed, "mock-converter");
    assert.equal(result.privateTempFileCreated, true);
    assert.equal(result.privateTempFileCleaned, true);
    assert.equal(result.extractedTextAvailable, true);
    assert.deepEqual(result.extractedFieldCandidates.map((item) => item.key), ["title", "author"]);
  });
});

test("private material content extractor falls back when legacy doc converter fails", () => {
  withTempDir((dir) => {
    const file = writeFixture(dir, "legacy.doc", "binary-placeholder", "utf8");
    const result = extractPrivateMaterialContent(groupFor(file), {
      legacyDocConverter: {
        name: "mock-failing-converter",
        convertToText() {
          throw new Error("synthetic conversion failure");
        }
      }
    });

    assert.equal(result.parseStatus, "legacy_doc_conversion_failed");
    assert.equal(result.extractionStatus, "metadata_only");
    assert.equal(result.extractionProviderAvailable, true);
    assert.equal(result.extractionAttempted, true);
    assert.equal(result.extractionFailureReason, "legacy_doc_conversion_failed");
    assert.equal(result.converterUsed, "mock-failing-converter");
    assert.equal(result.legacyDocExtractionRequired, true);
  });
});

test("private material content extractor keeps images metadata-only with visual flag", () => {
  for (const extension of [".jpg", ".png", ".jpeg"]) {
    withTempDir((dir) => {
      const file = writeFixture(dir, `image${extension}`, "binary-placeholder", "utf8");
      const result = extractPrivateMaterialContent(groupFor(file));

      assert.equal(result.parseStatus, "accepted_image_metadata_only");
      assert.equal(result.extractionStatus, "metadata_only");
      assert.equal(result.visualExtractionRequired, true);
      assert.equal(result.manualExtractionRequired, true);
    });
  }
});

test("private material content extractor keeps pdf metadata-only without parser", () => {
  withTempDir((dir) => {
    const file = writeFixture(dir, "material.pdf", "binary-placeholder", "utf8");
    const result = extractPrivateMaterialContent(groupFor(file));

    assert.equal(result.parseStatus, "accepted_pdf_metadata_only");
    assert.equal(result.extractionStatus, "metadata_only");
    assert.equal(result.extractedTextAvailable, false);
    assert.equal(result.manualExtractionRequired, true);
  });
});

test("private material content extractor uses image manual transcript without OCR or external service", () => {
  withTempDir((dir) => {
    const image = writeFixture(dir, "material.jpg", "binary-placeholder", "utf8");
    const companion = writeFixture(dir, "material.txt", "title: Secret Companion Text", "utf8");
    const result = extractPrivateMaterialContent({
      ...groupFor(image),
      hasCompanionText: true,
      companionTextFiles: [groupFor(companion)]
    });

    assert.equal(result.parseStatus, "parsed_from_image_manual_transcript");
    assert.equal(result.extractionStatus, "extracted_from_manual_transcript");
    assert.equal(result.visualExtractionRequired, false);
    assert.equal(result.manualTranscriptProvided, true);
    assert.equal(result.extractedTextAvailable, true);
  });
});

test("private material content extractor uses png md manual transcript", () => {
  withTempDir((dir) => {
    const image = writeFixture(dir, "material.png", "binary-placeholder", "utf8");
    const companion = writeFixture(dir, "material.md", "title: Secret Companion Markdown", "utf8");
    const result = extractPrivateMaterialContent({
      ...groupFor(image),
      hasCompanionText: true,
      companionTextFiles: [groupFor(companion)]
    });

    assert.equal(result.parseStatus, "parsed_from_image_manual_transcript");
    assert.equal(result.visualExtractionRequired, false);
    assert.equal(result.manualTranscriptProvided, true);
    assert.equal(result.extractionProvider, "manual_transcript");
  });
});

function groupFor(filePath) {
  return {
    anonymousMaterialId: "material-001",
    extension: path.extname(filePath).toLowerCase(),
    absolutePath: filePath,
    hasCompanionText: false,
    companionTextFiles: []
  };
}

function writeFixture(dir, name, content, encoding) {
  const file = path.join(dir, name);
  writeFileSync(file, content, encoding);
  return file;
}

function withTempDir(callback) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "m3-private-material-content-extractor-"));
  try {
    callback(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function makeDocxBuffer(text) {
  const escaped = String(text)
    .split(/\r?\n/)
    .map((line) => `<w:p><w:r><w:t>${escapeXml(line)}</w:t></w:r></w:p>`)
    .join("");
  const documentXml = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${escaped}</w:body></w:document>`;
  return makeStoredZip([{ name: "word/document.xml", data: Buffer.from(documentXml, "utf8") }]);
}

function makeStoredZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    localParts.push(local, data);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centralParts.push(central);
    offset += local.length + data.length;
  }

  const centralDirectoryOffset = offset;
  const centralDirectory = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(centralDirectoryOffset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, eocd]);
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
