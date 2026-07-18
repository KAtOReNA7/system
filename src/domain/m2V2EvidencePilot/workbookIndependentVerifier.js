import { lstatSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { canonicalJson, sha256 } from "./pilotCore.js";

const VERIFIER_RELATIVE = "scripts/m2-v2-evidence-pilot/verify_m2_v2_workbook.py";
const REQUIRED_COUNT_FIELDS = Object.freeze([
  "formulaCount",
  "formulaErrorCount",
  "hyperlinkCount",
  "validationCount",
  "forbiddenValueCount",
  "internalIdCount",
  "incomeValueCount",
  "secretCount",
  "externalLinkCount",
]);
const SHA256 = /^[a-f0-9]{64}$/u;
export const WORKBOOK_HYPERLINK_LINEAGE_SCHEMA = "m2.v2.workbook-hyperlink-lineage-private.v0.1";

export function verifyIndependentWorkbookObject(root, workbookRelative, options = {}) {
  const absoluteRoot = resolve(root);
  const workbookPath = resolve(absoluteRoot, workbookRelative);
  const relativePath = relative(absoluteRoot, workbookPath);
  if (isAbsolute(relativePath) || relativePath.startsWith("..")) throw new Error("workbook_verifier_path_outside_root");
  try {
    if (lstatSync(workbookPath).isSymbolicLink()) throw new Error("workbook_verifier_symlink_forbidden");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const verifierPath = join(absoluteRoot, VERIFIER_RELATIVE);
  try {
    if (lstatSync(verifierPath).isSymbolicLink()) throw new Error("workbook_verifier_script_symlink_forbidden");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const args = [verifierPath, workbookPath];
  if (options.profile) args.push("--profile", options.profile);
  for (const sheet of options.expectedSheets ?? []) args.push("--expect-sheet", String(sheet));
  for (const token of options.forbiddenValues ?? options.forbiddenTokens ?? []) {
    args.push("--forbidden-token", String(token));
  }
  let last = null;
  for (const executable of ["python", "python3"]) {
    const result = spawnSync(executable, args, {
      cwd: absoluteRoot,
      encoding: "utf8",
      windowsHide: true,
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    if (result.error?.code === "ENOENT") continue;
    last = result;
    try {
      const parsed = JSON.parse(String(result.stdout ?? ""));
      assertIndependentWorkbookVerification(parsed);
      return parsed;
    } catch {
      // Try the next interpreter only when the verifier did not emit its contract.
    }
  }
  const code = last?.status === null || last?.status === undefined ? "unavailable" : String(last.status);
  throw new Error(`workbook_independent_verifier_failed:${code}`);
}

export function assertIndependentWorkbookVerification(value) {
  if (value?.schema !== "m2.v2.independent-workbook-verification.v0.1") {
    throw new Error("workbook_verifier_schema_invalid");
  }
  if (value.verificationBasis !== "xlsx_zip_xml_actual_object" || value.generatorAssertionsTrusted !== false) {
    throw new Error("workbook_verifier_independence_contract_invalid");
  }
  // A missing or invalid ZIP can legitimately return before object counts are
  // available.  Any parsed workbook must expose the complete 18.2 contract.
  if (value.workbookSha256 === undefined) {
    if (value.passed !== false || !Array.isArray(value.issues) || value.issues.length === 0) {
      throw new Error("workbook_verifier_early_failure_contract_invalid");
    }
    return true;
  }
  if (!SHA256.test(value.workbookSha256) || typeof value.passed !== "boolean" || !Array.isArray(value.issues)) {
    throw new Error("workbook_verifier_verdict_contract_invalid");
  }
  if (!Array.isArray(value.sheetNames) || !Array.isArray(value.rowCounts)
    || value.sheetNames.length !== value.rowCounts.length
    || value.sheetNames.some((item) => typeof item !== "string")
    || value.rowCounts.some((item) => !Number.isInteger(item) || item < 0)) {
    throw new Error("workbook_verifier_sheet_contract_invalid");
  }
  for (const field of REQUIRED_COUNT_FIELDS) {
    if (!Number.isInteger(value[field]) || value[field] < 0) {
      throw new Error(`workbook_verifier_count_invalid:${field}`);
    }
  }
  if (!Array.isArray(value.cachedFormulaErrors)
    || value.cachedFormulaErrors.some((item) => !isSafeCachedFormulaError(item))) {
    throw new Error("workbook_verifier_cached_error_contract_invalid");
  }
  if (!Array.isArray(value.hyperlinkTargets)
    || value.hyperlinkTargets.some((item) => !isSafeHyperlinkTarget(item))) {
    throw new Error("workbook_verifier_hyperlink_target_contract_invalid");
  }
  return true;
}

/**
 * Preserve only independently parsed, hostless OOXML relationship facts.
 * The original URL/target is never returned. Duplicate facts are aggregated
 * before hashing so the lineage is stable across parser traversal order.
 */
export function deriveIndependentWorkbookHyperlinkLineage(value) {
  assertIndependentWorkbookVerification(value);
  if (value.workbookSha256 === undefined) throw new Error("workbook_hyperlink_lineage_workbook_missing");
  const grouped = new Map();
  for (const target of value.hyperlinkTargets) {
    const identity = canonicalJson({
      protocol: target.protocol,
      targetMode: target.targetMode,
      relationshipType: target.relationshipType,
      targetDigest: target.targetDigest,
    });
    const current = grouped.get(identity);
    if (current) current.occurrenceCount += target.occurrenceCount;
    else grouped.set(identity, {
      protocol: target.protocol,
      targetMode: target.targetMode,
      relationshipType: target.relationshipType,
      targetDigest: target.targetDigest,
      occurrenceCount: target.occurrenceCount,
    });
  }
  const targetFacts = [...grouped.values()].sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));
  const payload = {
    schema: WORKBOOK_HYPERLINK_LINEAGE_SCHEMA,
    derivationBasis: "independent_xlsx_relationship_parse",
    rawTargetsPersisted: false,
    hostValuesPersisted: false,
    uniqueTargetFactCount: targetFacts.length,
    occurrenceCount: targetFacts.reduce((total, fact) => total + fact.occurrenceCount, 0),
    targetFacts,
  };
  if (payload.occurrenceCount !== value.hyperlinkCount) {
    throw new Error("workbook_hyperlink_lineage_occurrence_mismatch");
  }
  return { ...payload, lineageDigest: sha256(payload) };
}

export function assertIndependentWorkbookHyperlinkLineage(value, options = {}) {
  if (!isPlainObject(value)) throw new Error("workbook_hyperlink_lineage_invalid");
  const expectedKeys = [
    "derivationBasis",
    "hostValuesPersisted",
    "lineageDigest",
    "occurrenceCount",
    "rawTargetsPersisted",
    "schema",
    "targetFacts",
    "uniqueTargetFactCount",
  ].sort();
  if (canonicalJson(Object.keys(value).sort()) !== canonicalJson(expectedKeys)) {
    throw new Error("workbook_hyperlink_lineage_shape_invalid");
  }
  if (value.schema !== WORKBOOK_HYPERLINK_LINEAGE_SCHEMA
    || value.derivationBasis !== "independent_xlsx_relationship_parse"
    || value.rawTargetsPersisted !== false
    || value.hostValuesPersisted !== false
    || !Array.isArray(value.targetFacts)
    || !Number.isInteger(value.uniqueTargetFactCount)
    || value.uniqueTargetFactCount !== value.targetFacts.length
    || !Number.isInteger(value.occurrenceCount)
    || value.occurrenceCount < 0
    || value.targetFacts.some((item) => !isSafeHyperlinkTarget(item))) {
    throw new Error("workbook_hyperlink_lineage_contract_invalid");
  }
  const ordered = [...value.targetFacts].sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));
  if (canonicalJson(ordered) !== canonicalJson(value.targetFacts)) {
    throw new Error("workbook_hyperlink_lineage_order_invalid");
  }
  const identities = new Set(value.targetFacts.map((item) => canonicalJson({
    protocol: item.protocol,
    targetMode: item.targetMode,
    relationshipType: item.relationshipType,
    targetDigest: item.targetDigest,
  })));
  if (identities.size !== value.targetFacts.length) throw new Error("workbook_hyperlink_lineage_duplicate_fact");
  if (value.targetFacts.reduce((total, fact) => total + fact.occurrenceCount, 0) !== value.occurrenceCount) {
    throw new Error("workbook_hyperlink_lineage_occurrence_mismatch");
  }
  if (options.expectedOccurrenceCount !== undefined && value.occurrenceCount !== options.expectedOccurrenceCount) {
    throw new Error("workbook_hyperlink_lineage_expected_count_mismatch");
  }
  const { lineageDigest, ...payload } = value;
  if (!SHA256.test(lineageDigest) || lineageDigest !== sha256(payload)) {
    throw new Error("workbook_hyperlink_lineage_digest_invalid");
  }
  if (/https?:\/\//iu.test(JSON.stringify(value))) throw new Error("workbook_hyperlink_lineage_raw_target_detected");
  return true;
}

function isSafeCachedFormulaError(value) {
  const allowed = new Set(["sheetName", "sheetIndex", "cellRef", "errorClass", "errorDigest"]);
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).every((key) => allowed.has(key))
    && typeof value.sheetName === "string"
    && Number.isInteger(value.sheetIndex) && value.sheetIndex > 0
    && typeof value.cellRef === "string"
    && ["excel_error_token", "implementation_error"].includes(value.errorClass)
    && SHA256.test(value.errorDigest);
}

function isSafeHyperlinkTarget(value) {
  const allowed = new Set(["protocol", "targetMode", "relationshipType", "targetDigest", "occurrenceCount"]);
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).every((key) => allowed.has(key))
    && typeof value.protocol === "string" && !value.protocol.includes(":")
    && typeof value.targetMode === "string"
    && typeof value.relationshipType === "string" && !value.relationshipType.includes(":")
    && SHA256.test(value.targetDigest)
    && Number.isInteger(value.occurrenceCount) && value.occurrenceCount > 0;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
