import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  parseZipCentralDirectory,
  readZipEntryData,
} from "./helpers/m2V2ZipCentralDirectory.js";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const GENERATOR = join(
  REPO_ROOT,
  "scripts",
  "m2-v2-evidence-pilot",
  "build_m2_v2_ooxml_corpus.py",
);
const TOOLCHAIN = join(REPO_ROOT, "config", "m2-v2-pr7-python-toolchain.v0.1.json");

const POSITIVE_CASE_IDS = [
  "positive_legitimate_utf8_metadata",
  "positive_minimal_valid_workbook",
  "positive_valid_core_app_properties",
  "positive_valid_formula_cached_value",
  "positive_valid_inline_strings",
  "positive_valid_shared_strings",
];

const NEGATIVE_CASE_IDS = [
  "negative_activex",
  "negative_backslash_path",
  "negative_case_collision",
  "negative_chart",
  "negative_comments",
  "negative_content_type_mismatch",
  "negative_custom_properties_secret_shape",
  "negative_drawing",
  "negative_dtd",
  "negative_embedding",
  "negative_encrypted_member",
  "negative_entity",
  "negative_external_link",
  "negative_external_relationship",
  "negative_high_compression_ratio",
  "negative_media",
  "negative_nfc_collision",
  "negative_ole",
  "negative_per_entry_oversize",
  "negative_printer_settings",
  "negative_relationship_mismatch",
  "negative_threaded_comments_persons",
  "negative_total_oversize",
  "negative_unknown_orphan_part",
  "negative_unknown_reachable_part",
  "negative_vml",
  "negative_wrapper_receipt_forge",
  "negative_xml_depth_bomb",
  "negative_xml_element_bomb",
  "negative_xml_text_bomb",
  "negative_zip_slip",
  "negative_duplicate_normalized_path",
].sort();

test("S0-06 Python toolchain contract is minimal, stdlib-only, and schema-exact", () => {
  const contract = JSON.parse(readFileSync(TOOLCHAIN, "utf8"));
  assertExactKeys(contract, [
    "canonicalRuntime",
    "determinismContract",
    "generator",
    "governance",
    "metadataInventory",
    "schema",
    "scope",
  ]);
  assert.equal(contract.schema, "m2.v2.pr7.s0.python-toolchain.v0.1");
  assert.equal(contract.scope, "S0-06_SYNTHETIC_OOXML_CORPUS_ONLY");
  assertExactKeys(contract.canonicalRuntime, [
    "ciLinuxMinorVersion",
    "ciWindowsMinorVersion",
    "implementation",
    "openpyxlRequired",
    "requiredStandardLibraryModules",
    "stdlibOnly",
    "supportedMinorVersions",
    "supportedPythonRange",
  ]);
  assert.equal(contract.canonicalRuntime.implementation, "CPython");
  assert.equal(contract.canonicalRuntime.supportedPythonRange, ">=3.11,<3.14");
  assert.deepEqual(contract.canonicalRuntime.supportedMinorVersions, ["3.11", "3.12", "3.13"]);
  assert.equal(contract.canonicalRuntime.ciLinuxMinorVersion, "3.13");
  assert.equal(contract.canonicalRuntime.ciWindowsMinorVersion, "3.13");
  assert.equal(contract.canonicalRuntime.stdlibOnly, true);
  assert.equal(contract.canonicalRuntime.openpyxlRequired, false);
  assert.equal(contract.canonicalRuntime.requiredStandardLibraryModules.includes("openpyxl"), false);
  assertExactKeys(contract.generator, [
    "expectedCaseCount",
    "expectedCorpusDigest",
    "expectedNegativeCaseCount",
    "expectedPositiveCaseCount",
    "governedWorkbookReadByGenerator",
    "path",
    "seed",
    "trackedBinaryFixtures",
  ]);
  assert.match(contract.generator.expectedCorpusDigest, /^[0-9a-f]{64}$/u);
  assert.equal(contract.generator.trackedBinaryFixtures, false);
  assert.equal(contract.generator.governedWorkbookReadByGenerator, false);
  assert.deepEqual(contract.metadataInventory, {
    mode: "--inventory-workbook <path> --inventory-output <private-json-path>",
    outputSchema: "m2.v2.pr7.s0.current-workbook-opc-inventory.private.v0.1",
    partDigestRole: "compressed-payload-sha256",
    policyDecisionMade: false,
    relationshipTargetsPersisted: false,
    sharedStringsPayloadDecompressed: false,
    worksheetPayloadDecompressed: false,
  });
  assert.deepEqual(contract.governance, {
    databaseAllowed: false,
    networkAllowed: false,
    policyDecisionMade: false,
    privateBusinessContentAllowed: false,
    productVerifierModified: false,
    providerAllowed: false,
    supportOnly: true,
  });
});

test("S0-06 builds a byte-identical 38-case OOXML/OPC corpus and verifies every ZIP member", () => {
  const contract = JSON.parse(readFileSync(TOOLCHAIN, "utf8"));
  const firstRoot = mkdtempSync(join(tmpdir(), "m2-v2-s0-ooxml-a-"));
  const secondRoot = mkdtempSync(join(tmpdir(), "m2-v2-s0-ooxml-b-"));
  try {
    const firstBuild = runPython([
      GENERATOR,
      "--output-dir",
      firstRoot,
      "--seed",
      contract.generator.seed,
    ]);
    const secondBuild = runPython([
      GENERATOR,
      "--output-dir",
      secondRoot,
      "--seed",
      contract.generator.seed,
    ]);
    assert.equal(firstBuild.status, "PASS");
    assert.equal(secondBuild.status, "PASS");
    assert.equal(firstBuild.runtime.implementation, "cpython");
    const runtimeMinor = firstBuild.runtime.version.split(".").slice(0, 2).join(".");
    assert.equal(contract.canonicalRuntime.supportedMinorVersions.includes(runtimeMinor), true);
    assert.equal(firstBuild.runtime.stdlibOnly, true);
    assert.equal(firstBuild.corpusDigest, contract.generator.expectedCorpusDigest);
    assert.equal(secondBuild.corpusDigest, contract.generator.expectedCorpusDigest);

    const firstManifestBytes = readFileSync(join(firstRoot, "corpus-manifest.json"));
    const secondManifestBytes = readFileSync(join(secondRoot, "corpus-manifest.json"));
    assert.equal(firstManifestBytes.equals(secondManifestBytes), true);
    assert.equal(firstBuild.manifestSha256, sha256(firstManifestBytes));
    assert.equal(secondBuild.manifestSha256, firstBuild.manifestSha256);

    const verifyReceipt = runPython([
      GENERATOR,
      "--verify-manifest",
      join(firstRoot, "corpus-manifest.json"),
    ]);
    assert.equal(verifyReceipt.status, "PASS");
    assert.equal(verifyReceipt.corpusDigest, contract.generator.expectedCorpusDigest);
    assert.equal(verifyReceipt.manifestSha256, firstBuild.manifestSha256);

    const manifest = JSON.parse(firstManifestBytes.toString("utf8"));
    validateManifestSchema(manifest);
    assert.equal(manifest.caseCount, contract.generator.expectedCaseCount);
    assert.equal(manifest.positiveCaseCount, contract.generator.expectedPositiveCaseCount);
    assert.equal(manifest.negativeCaseCount, contract.generator.expectedNegativeCaseCount);
    assert.equal(manifest.corpusDigest, contract.generator.expectedCorpusDigest);
    assert.deepEqual(
      manifest.cases.filter((item) => item.expectedPolicyResult === "ALLOW").map((item) => item.caseId),
      POSITIVE_CASE_IDS,
    );
    assert.deepEqual(
      manifest.cases.filter((item) => item.expectedPolicyResult === "DENY").map((item) => item.caseId),
      NEGATIVE_CASE_IDS,
    );

    const caseMap = new Map(manifest.cases.map((item) => [item.caseId, item]));
    for (const record of manifest.cases) {
      validateArchive(firstRoot, record);
      const counterpart = readFileSync(join(secondRoot, record.relativePath));
      assert.equal(sha256(counterpart), record.sha256);
    }
    validatePositiveCases(firstRoot, caseMap);
    validateNegativeCases(firstRoot, caseMap, manifest.policyLimits);
  } finally {
    rmSync(firstRoot, { recursive: true, force: true });
    rmSync(secondRoot, { recursive: true, force: true });
    assert.equal(existsSync(firstRoot), false, "first OOXML fixture root left system-temp residue");
    assert.equal(existsSync(secondRoot), false, "second OOXML fixture root left system-temp residue");
  }
});

function validateManifestSchema(manifest) {
  assertExactKeys(manifest, [
    "caseCount",
    "cases",
    "corpusDigest",
    "determinism",
    "generator",
    "negativeCaseCount",
    "policyLimits",
    "positiveCaseCount",
    "runtimeContract",
    "schema",
    "seed",
  ]);
  assert.equal(manifest.schema, "m2.v2.pr7.s0.synthetic-ooxml-corpus.v0.1");
  assert.equal(manifest.runtimeContract.stdlibOnly, true);
  assert.equal(manifest.runtimeContract.openpyxlRequired, false);
  assert.equal(manifest.runtimeContract.supportedPythonRange, ">=3.11,<3.14");
  assert.deepEqual(
    manifest.cases.map((item) => item.caseId),
    [...manifest.cases.map((item) => item.caseId)].sort(),
  );
  assert.equal(new Set(manifest.cases.map((item) => item.caseId)).size, manifest.cases.length);
  for (const item of manifest.cases) {
    assertExactKeys(item, [
      "caseId",
      "compressedBytes",
      "contentTypes",
      "expectedPolicyResult",
      "expectedReason",
      "parts",
      "platforms",
      "purpose",
      "relationships",
      "relativePath",
      "sha256",
      "uncompressedBytes",
    ]);
    assert.match(item.caseId, /^(?:positive|negative)_[a-z0-9_]+$/u);
    assert.equal(["ALLOW", "DENY"].includes(item.expectedPolicyResult), true);
    assert.match(item.expectedReason, /^[A-Z0-9_]+$/u);
    assert.deepEqual(item.platforms, ["linux", "windows"]);
    assert.match(item.sha256, /^[0-9a-f]{64}$/u);
    for (const part of item.parts) {
      assertExactKeys(part, [
        "compressedBytes",
        "compressionMethod",
        "encrypted",
        "partName",
        "sha256",
        "uncompressedBytes",
      ]);
      assert.match(part.sha256, /^[0-9a-f]{64}$/u);
    }
    for (const relationship of item.relationships) {
      assertExactKeys(
        relationship,
        relationship.targetMode
          ? ["id", "source", "target", "targetMode", "type"]
          : ["id", "source", "target", "type"],
      );
    }
    assertExactKeys(item.contentTypes, ["defaults", "overrides"]);
    for (const row of item.contentTypes.defaults) {
      assertExactKeys(row, ["contentType", "extension"]);
    }
    for (const row of item.contentTypes.overrides) {
      assertExactKeys(row, ["contentType", "partName"]);
    }
  }
}

function validateArchive(root, record) {
  const archiveBytes = readFileSync(join(root, record.relativePath));
  assert.equal(archiveBytes.length, record.compressedBytes);
  assert.equal(sha256(archiveBytes), record.sha256);
  const parsed = parseZipCentralDirectory(archiveBytes);
  assert.equal(parsed.commentBytes, 0);
  assert.deepEqual(parsed.entries.map((entry) => entry.name), record.parts.map((part) => part.partName));
  assert.equal(
    parsed.entries.reduce((sum, entry) => sum + entry.uncompressedSize, 0),
    record.uncompressedBytes,
  );
  parsed.entries.forEach((entry, index) => {
    const part = record.parts[index];
    assert.equal(entry.madeByVersion, (3 << 8) | 20);
    assert.equal(entry.requiredVersion, 20);
    assert.equal(entry.dosTime, 0);
    assert.equal(entry.dosDate, 33);
    assert.equal(entry.extraBytes, 0);
    assert.equal(entry.localExtraBytes, 0);
    assert.equal(entry.commentBytes, 0);
    assert.equal(entry.externalAttributes, 0o100644 * 65536);
    assert.equal((entry.flags & 0x0800) !== 0, true);
    assert.equal(entry.compressionMethod, part.compressionMethod);
    assert.equal(entry.compressedSize, part.compressedBytes);
    assert.equal(entry.uncompressedSize, part.uncompressedBytes);
    assert.equal((entry.flags & 0x0001) !== 0, part.encrypted);
    if (!part.encrypted) {
      assert.equal(
        sha256(readZipEntryData(entry)),
        part.sha256,
        `independent part digest mismatch: ${record.caseId}:${part.partName}`,
      );
    }
  });
}

function validatePositiveCases(root, caseMap) {
  assert.match(readPartText(root, caseMap, "positive_valid_shared_strings", "xl/sharedStrings.xml"), /<si><t>Synthetic<\/t><\/si>/u);
  assert.match(readPartText(root, caseMap, "positive_valid_inline_strings", "xl/worksheets/sheet1.xml"), /t="inlineStr"/u);
  assert.match(readPartText(root, caseMap, "positive_valid_formula_cached_value", "xl/worksheets/sheet1.xml"), /<f>1\+1<\/f><v>2<\/v>/u);
  assert.equal(caseMap.get("positive_valid_core_app_properties").parts.some((part) => part.partName === "docProps/app.xml"), true);
  assert.match(readPartText(root, caseMap, "positive_legitimate_utf8_metadata", "docProps/core.xml"), /合法 UTF-8 元数据/u);
}

function validateNegativeCases(root, caseMap, limits) {
  const custom = readPartText(root, caseMap, "negative_custom_properties_secret_shape", "docProps/custom.xml");
  assert.match(custom, /sk-S0SYNTHETICX{32}/u);

  const requiredParts = new Map([
    ["negative_comments", "xl/comments1.xml"],
    ["negative_threaded_comments_persons", "xl/persons/person.xml"],
    ["negative_drawing", "xl/drawings/drawing1.xml"],
    ["negative_chart", "xl/charts/chart1.xml"],
    ["negative_vml", "xl/drawings/vmlDrawing1.vml"],
    ["negative_media", "xl/media/image1.png"],
    ["negative_ole", "xl/oleObjects/oleObject1.bin"],
    ["negative_activex", "xl/activeX/activeX1.bin"],
    ["negative_embedding", "xl/embeddings/embedded1.bin"],
    ["negative_printer_settings", "xl/printerSettings/printerSettings1.bin"],
    ["negative_external_link", "xl/externalLinks/externalLink1.xml"],
  ]);
  for (const [caseId, partName] of requiredParts) {
    assert.equal(caseMap.get(caseId).parts.some((part) => part.partName === partName), true);
  }

  const external = caseMap.get("negative_external_relationship");
  assert.equal(external.relationships.some((row) => row.targetMode === "External"), true);
  assert.equal(caseMap.get("negative_unknown_reachable_part").relationships.some((row) => row.type === "urn:m2-v2:s0:unknown"), true);
  assert.equal(caseMap.get("negative_unknown_orphan_part").relationships.some((row) => row.target.includes("orphan")), false);
  assert.equal(caseMap.get("negative_content_type_mismatch").contentTypes.overrides.find((row) => row.partName === "/xl/workbook.xml").contentType.includes("worksheet"), true);
  assert.equal(caseMap.get("negative_relationship_mismatch").relationships.some((row) => row.target === "worksheets/missing.xml"), true);

  const normalized = partNames(caseMap, "negative_duplicate_normalized_path").map(normalizeOpcPath);
  assert.equal(new Set(normalized).size < normalized.length, true);
  const caseFolded = partNames(caseMap, "negative_case_collision").map((name) => name.toLocaleLowerCase("en-US"));
  assert.equal(new Set(caseFolded).size < caseFolded.length, true);
  const nfc = partNames(caseMap, "negative_nfc_collision").map((name) => name.normalize("NFC"));
  assert.equal(new Set(nfc).size < nfc.length, true);
  assert.equal(partNames(caseMap, "negative_backslash_path").some((name) => name.includes("\\")), true);
  assert.equal(partNames(caseMap, "negative_zip_slip").some((name) => name.startsWith("../")), true);

  const encrypted = archiveEntry(root, caseMap, "negative_encrypted_member", "xl/encrypted.bin");
  assert.equal((encrypted.flags & 0x0001) !== 0, true);
  const highRatio = archiveEntry(root, caseMap, "negative_high_compression_ratio", "xl/high-ratio.bin");
  assert.equal(highRatio.uncompressedSize / highRatio.compressedSize > limits.maxCompressionRatio, true);
  assert.equal(readZipEntryData(highRatio).length, 262144);
  assert.equal(caseMap.get("negative_per_entry_oversize").parts.some((part) => part.uncompressedBytes > limits.maxEntryUncompressedBytes), true);
  assert.equal(caseMap.get("negative_total_oversize").uncompressedBytes > limits.maxTotalUncompressedBytes, true);

  assert.match(readPartText(root, caseMap, "negative_dtd", "xl/customXml/dtd.xml"), /<!DOCTYPE/u);
  assert.match(readPartText(root, caseMap, "negative_entity", "xl/customXml/entity.xml"), /<!ENTITY/u);
  assert.equal((readPartText(root, caseMap, "negative_xml_depth_bomb", "xl/customXml/xml_depth_bomb.xml").match(/<n>/gu) ?? []).length > limits.maxXmlDepth, true);
  assert.equal((readPartText(root, caseMap, "negative_xml_element_bomb", "xl/customXml/xml_element_bomb.xml").match(/<e\/>/gu) ?? []).length > limits.maxXmlElements, true);
  assert.equal(readPartText(root, caseMap, "negative_xml_text_bomb", "xl/customXml/xml_text_bomb.xml").length > limits.maxXmlTextBytes, true);

  const forged = JSON.parse(readPartText(root, caseMap, "negative_wrapper_receipt_forge", "_s0/verification-receipt.json"));
  assert.equal(forged.status, "PASS");
  assert.equal(forged.verified, true);
}

function readPartText(root, caseMap, caseId, partName) {
  return readPart(root, caseMap, caseId, partName).toString("utf8");
}

function readPart(root, caseMap, caseId, partName) {
  const entry = archiveEntry(root, caseMap, caseId, partName);
  return readZipEntryData(entry);
}

function archiveEntry(root, caseMap, caseId, partName) {
  const record = caseMap.get(caseId);
  assert.ok(record, `missing case ${caseId}`);
  const parsed = parseZipCentralDirectory(readFileSync(join(root, record.relativePath)));
  const entry = parsed.entries.find((item) => item.name === partName);
  assert.ok(entry, `missing part ${caseId}:${partName}`);
  return entry;
}

function partNames(caseMap, caseId) {
  return caseMap.get(caseId).parts.map((part) => part.partName);
}

function normalizeOpcPath(path) {
  const result = [];
  for (const segment of path.replaceAll("\\", "/").split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") result.pop();
    else result.push(segment);
  }
  return result.join("/");
}

function runPython(argv) {
  const result = spawnSync("python", argv, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, sanitizePythonFailure(result));
  assert.equal(result.stderr.trim(), "", sanitizePythonFailure(result));
  return JSON.parse(result.stdout);
}

function sanitizePythonFailure(result) {
  return [result.error?.message, result.stderr, result.stdout]
    .filter(Boolean)
    .join("\n")
    .replaceAll(REPO_ROOT, "<repo>")
    .replaceAll(tmpdir(), "<system-temp>");
}

function assertExactKeys(value, keys) {
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort());
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
