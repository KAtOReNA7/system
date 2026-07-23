#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

import { buildV2B5PrivateWorkbookRows } from "../../src/domain/m2V2EvidencePilot/v2b5Runtime.js";
import {
  WORKBOOK_PACKAGE_COMPLETE_PROFILE,
  verifyIndependentWorkbookObject,
} from "../../src/domain/m2V2EvidencePilot/workbookIndependentVerifier.js";

const OUTPUT_ROOT = "data/private-output/m2-v2-pr7-s1-remediation-badbf45/b6-workbook-v0.4";
const SOURCE_RELATIVE =
  "data/private-output/m2-v2-evidence-pilot/v2b7-canary-v3/canary-v3-source-records-private-v0.2.ndjson";
const EVIDENCE_RELATIVE =
  "data/private-output/m2-v2-evidence-pilot/v2b7-canary-v3/canary-v3-evidence-records-private-v0.2.ndjson";

const root = resolve(process.cwd());
const outputRoot = join(root, ...OUTPUT_ROOT.split("/"));
const inputPath = join(outputRoot, "workbook-input-private-v0.1.json");
const workbookPath = join(outputRoot, "M2-v2-private-review-workbook-v0.4.xlsx");
const repeatPath = join(outputRoot, "M2-v2-private-review-workbook-v0.4.repeat.xlsx");
const receiptPath = join(outputRoot, "workbook-verification-receipt-private-v0.2.json");

try {
  if (existsSync(workbookPath) || existsSync(repeatPath) || existsSync(receiptPath)) {
    throw new Error("b6_workbook_versioned_output_exists");
  }
  const sources = readNdjson(SOURCE_RELATIVE);
  const evidence = readNdjson(EVIDENCE_RELATIVE);
  const rows = buildV2B5PrivateWorkbookRows(evidence, sources);
  if (rows.length === 0) throw new Error("b6_workbook_rows_missing");
  const sourceById = new Map(sources.map((record) => [record?.sourceId, record]));
  const usable = evidence.filter((record) => record?.pilotUsable === true);
  if (usable.length !== rows.length) throw new Error("b6_workbook_row_lineage_mismatch");
  const enrichedRows = rows.map((row, index) => ({
    ...row,
    sourceUrl: firstSafeUrl(
      (usable[index]?.supportingSourceIds ?? []).map((id) => sourceById.get(id)?.url),
    ),
  }));
  mkdirSync(outputRoot, { recursive: true });
  writeJson(inputPath, {
    schema: "m2.v2.b6-private-review-workbook-input.v0.1",
    privateOnly: true,
    sourceRecordSetDigestSha256: sha256Json(sources),
    evidenceRecordSetDigestSha256: sha256Json(evidence),
    rowCount: enrichedRows.length,
    rows: enrichedRows,
  });
  runBuilder(inputPath, workbookPath);
  runBuilder(inputPath, repeatPath);
  const firstDigest = sha256Bytes(readFileSync(workbookPath));
  const repeatDigest = sha256Bytes(readFileSync(repeatPath));
  if (firstDigest !== repeatDigest) throw new Error("b6_workbook_nondeterministic");
  const workbookRelative = `${OUTPUT_ROOT}/M2-v2-private-review-workbook-v0.4.xlsx`;
  const verification = verifyIndependentWorkbookObject(root, workbookRelative, {
    profile: WORKBOOK_PACKAGE_COMPLETE_PROFILE,
    expectedSheets: ["Priority Review", "All Evidence"],
  });
  if (!verification.passed || verification.workbookSha256 !== firstDigest) {
    throw new Error("b6_workbook_strict_verification_failed");
  }
  writeJson(receiptPath, {
    schema: "m2.v2.b6-private-review-workbook-generation-receipt.v0.1",
    privateOnly: true,
    workbookRelativePath: workbookRelative,
    workbookSha256: firstDigest,
    deterministicRepeatSha256: repeatDigest,
    rowCount: enrichedRows.length,
    policyDigestSha256: verification.policyDigestSha256,
    packageMemberSetDigestSha256: verification.packageMemberSetDigestSha256,
    contentTypeGraphDigestSha256: verification.contentTypeGraphDigestSha256,
    relationshipGraphDigestSha256: verification.relationshipGraphDigestSha256,
    partDecisionDigestSha256: verification.partDecisionDigestSha256,
    hyperlinkTargetDigestCount: verification.hyperlinkLineage.length,
    visualReviewAttested: false,
    providerRequestDelta: 0,
    databaseConnections: 0,
    actualExternalFetchCount: 0,
  });
  rmSync(repeatPath, { force: false });
  process.stdout.write(`${JSON.stringify({
    status: "BUILT_AND_STRICTLY_VERIFIED",
    workbookRelativePath: workbookRelative,
    workbookSha256: firstDigest,
    rowCount: enrichedRows.length,
    hyperlinkTargetDigestCount: verification.hyperlinkLineage.length,
    providerRequestDelta: 0,
    actualExternalFetchCount: 0,
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({
    status: "FAILED_CLOSED",
    issue: String(error?.message ?? "b6_workbook_generation_failed").replace(/[^A-Za-z0-9_.:+-]/gu, "_"),
    providerRequestDelta: 0,
    actualExternalFetchCount: 0,
  })}\n`);
  process.exitCode = 1;
}

function readNdjson(relativePath) {
  return readFileSync(join(root, ...relativePath.split("/")), "utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function firstSafeUrl(values) {
  for (const value of values) {
    try {
      const url = new URL(String(value ?? ""));
      if (["http:", "https:"].includes(url.protocol) && !url.username && !url.password) {
        return url.toString();
      }
    } catch {
      // Ignore malformed source URLs; the workbook remains evidence-complete without a link.
    }
  }
  return null;
}

function runBuilder(input, output) {
  const script = join(root, "scripts", "m2-v2-evidence-pilot", "build_m2_v2_b6_review_workbook.py");
  let last;
  for (const executable of ["python", "python3"]) {
    const result = spawnSync(executable, [script, "--input", input, "--output", output], {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
      timeout: 120_000,
    });
    if (result.error?.code === "ENOENT") continue;
    last = result;
    if (result.status === 0) return;
    break;
  }
  throw new Error(`b6_workbook_builder_failed:${last?.status ?? "unavailable"}`);
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
}

function sha256Json(value) {
  return sha256Bytes(Buffer.from(JSON.stringify(value), "utf8"));
}

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}
