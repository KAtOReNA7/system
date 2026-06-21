import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_MANIFEST_PATH =
  "test/fixtures/m2LocalDryRunSanitizedManifest.fixture.json";

const STAGE = "M2-B-3.2b";
const ALLOWED_SOURCE_TYPES = new Set(["synthetic", "fixture", "stage-summary", "ops-summary"]);
const REQUIRED_RANGE_SUMMARY_FLAGS = Object.freeze([
  "containsRealAmounts",
  "containsRealWorkNames",
  "containsRealAuthorNames",
  "containsRealChannelNames",
  "containsStageJsonBody",
  "containsOperationsConfirmationBody"
]);
const PROHIBITED_FIELD_NAMES = new Set([
  "body",
  "rows",
  "records",
  "rawdata",
  "samplerows",
  "sourcebody",
  "stagejsonbody",
  "operationsconfirmationbody",
  "databaseurl",
  "connectionstring",
  ["pass", "word"].join(""),
  "secret",
  "token"
]);
const FIELD_LIST_ALLOWED_KEYS = new Set(["name", "type", "purpose"]);

function sensitiveValueTokens() {
  return [
    ["postgres", "://"].join(""),
    ["postgresql", "://"].join(""),
    ["mysql", "://"].join(""),
    ["jdbc", ":"].join(""),
    ["Server", "="].join(""),
    ["Host", "="].join(""),
    ["D", ":", "\\"].join(""),
    ["C", ":", "\\"].join(""),
    "/Users/",
    "/home/",
    "/mnt/",
    ["file", "://"].join(""),
    "data/",
    "data\\",
    ".env",
    ".env.local",
    ".pgpass",
    "real-bills",
    "master-data-private",
    "mapping_import_stage-v0.1.json",
    "mapping_import_stage-v0.2.json",
    "private-workbook",
    "source bill",
    "ledger"
  ];
}

function createFinding(code, message, severity = "error") {
  return { code, severity, message };
}

function addFinding(findings, code, message, severity = "error") {
  findings.push(createFinding(code, message, severity));
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseArgs(argv) {
  const options = {
    manifest: DEFAULT_MANIFEST_PATH,
    json: false,
    simulateFailure: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--simulate-failure") {
      options.simulateFailure = true;
    } else if (arg === "--manifest") {
      const value = argv[index + 1];
      if (!value) {
        throw Object.assign(new Error("missing manifest argument"), {
          code: "MISSING_MANIFEST_ARGUMENT"
        });
      }
      options.manifest = value;
      index += 1;
    } else {
      throw Object.assign(new Error("unsupported argument"), {
        code: "UNSUPPORTED_ARGUMENT"
      });
    }
  }

  return options;
}

function sanitizeFailure(error) {
  if (error?.code) return `manifest validation failure: ${error.code}`;
  return "manifest validation failure";
}

function normalizePathForCheck(value) {
  return String(value).replaceAll("\\", "/");
}

function manifestInputIsProhibited(rootDir, manifestPath) {
  const resolved = path.resolve(rootDir, manifestPath);
  const relative = normalizePathForCheck(path.relative(rootDir, resolved));
  const basename = path.basename(resolved).toLowerCase();

  return (
    relative === "data" ||
    relative.startsWith("data/") ||
    relative.includes("/data/") ||
    basename === ".env" ||
    basename.startsWith(".env.") ||
    basename === ".pgpass" ||
    basename === "mapping_import_stage-v0.1.json" ||
    basename === "mapping_import_stage-v0.2.json"
  );
}

function getManifestPathType(rootDir, manifestPath) {
  const defaultResolved = path.resolve(rootDir, DEFAULT_MANIFEST_PATH);
  const actualResolved = path.resolve(rootDir, manifestPath);
  if (actualResolved === defaultResolved) return "sanitized-fixture";
  return "provided-manifest";
}

async function readManifestText(rootDir, manifestPath) {
  if (manifestInputIsProhibited(rootDir, manifestPath)) {
    throw Object.assign(new Error("manifest path is prohibited"), {
      code: "MANIFEST_PATH_PROHIBITED"
    });
  }
  return readFile(path.resolve(rootDir, manifestPath), "utf8");
}

function walkJson(value, visit, jsonPath = "$") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkJson(item, visit, `${jsonPath}[${index}]`));
    return;
  }
  if (isPlainObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      visit(key, child, `${jsonPath}.${key}`);
      walkJson(child, visit, `${jsonPath}.${key}`);
    }
  }
}

function hasPathSeparatorOrDrive(value) {
  const text = String(value);
  const normalized = normalizePathForCheck(text);
  return (
    path.basename(text) !== text ||
    normalized.includes("/") ||
    text.includes("\\") ||
    text.includes(":") ||
    normalized.includes("../") ||
    normalized.includes("..\\") ||
    normalized.includes("data/") ||
    text.includes("data\\") ||
    text.includes(".env") ||
    text.includes(".pgpass")
  );
}

function containsSensitiveValue(value) {
  if (typeof value !== "string") return false;
  const lowered = value.toLowerCase();
  return sensitiveValueTokens().some((token) => lowered.includes(token.toLowerCase()));
}

function validateNoProhibitedKeysOrValues(findings, manifest) {
  walkJson(manifest, (key, value) => {
    const normalizedKey = key.toLowerCase();
    if (PROHIBITED_FIELD_NAMES.has(normalizedKey)) {
      addFinding(
        findings,
        "prohibited_manifest_field",
        "manifest contains a prohibited field name"
      );
    }

    if (["filename", "sourcepath", "path", "uri"].includes(normalizedKey)) {
      if (containsSensitiveValue(value)) {
        addFinding(
          findings,
          "unsafe_manifest_path_value",
          "manifest contains an unsafe path or URI value"
        );
      }
    } else if (containsSensitiveValue(value)) {
      addFinding(
        findings,
        "sensitive_manifest_value",
        "manifest contains a prohibited value pattern"
      );
    }
  });
}

function validateTopLevel(findings, manifest) {
  if (!isPlainObject(manifest)) {
    addFinding(findings, "manifest_not_object", "manifest must be a JSON object");
    return;
  }

  const expectedValues = {
    manifestKind: "m2-local-dry-run-input-manifest",
    datasetBoundary: "sanitized-metadata-only",
    localDryRunExecuted: false,
    sourceFileBodyReadAllowed: false,
    stageJsonBodyAllowed: false,
    operationsConfirmationBodyAllowed: false,
    databaseConnectionAllowed: false,
    dockerAllowed: false
  };

  if (typeof manifest.manifestVersion !== "string" || manifest.manifestVersion.length === 0) {
    addFinding(findings, "manifest_version_missing", "manifestVersion must be present");
  }

  for (const [key, expected] of Object.entries(expectedValues)) {
    if (manifest[key] !== expected) {
      addFinding(findings, `${key}_invalid`, `${key} must match the no-db authorization boundary`);
    }
  }

  if (!Array.isArray(manifest.sources) || manifest.sources.length === 0) {
    addFinding(findings, "sources_missing", "sources must be a non-empty array");
  }
}

function validateFileName(findings, source) {
  if (typeof source.fileName !== "string" || source.fileName.length === 0) {
    addFinding(findings, "source_file_name_invalid", "source fileName must be present");
    return;
  }
  if (hasPathSeparatorOrDrive(source.fileName)) {
    addFinding(findings, "source_file_name_not_basename", "source fileName must be a basename only");
  }
}

function validateSourcePathLikeValues(findings, source) {
  for (const key of ["sourcePath", "path", "uri"]) {
    if (Object.hasOwn(source, key) && containsSensitiveValue(source[key])) {
      addFinding(findings, "source_path_value_not_sanitized", "source path metadata is not sanitized");
    }
  }
}

function validateFieldList(findings, fieldList) {
  if (!Array.isArray(fieldList) || fieldList.length === 0) {
    addFinding(findings, "field_list_invalid", "fieldList must be a non-empty array");
    return;
  }

  fieldList.forEach((field) => {
    if (!isPlainObject(field)) {
      addFinding(findings, "field_list_item_invalid", "fieldList entries must be objects");
      return;
    }

    for (const key of Object.keys(field)) {
      if (!FIELD_LIST_ALLOWED_KEYS.has(key)) {
        addFinding(findings, "field_list_contains_values", "fieldList may only contain field metadata");
      }
    }

    for (const key of FIELD_LIST_ALLOWED_KEYS) {
      if (typeof field[key] !== "string" || field[key].length === 0) {
        addFinding(findings, "field_list_metadata_missing", "fieldList entries require name, type, and purpose");
      }
    }

    for (const value of Object.values(field)) {
      if (containsSensitiveValue(value)) {
        addFinding(findings, "field_list_sensitive_value", "fieldList contains a prohibited value");
      }
    }
  });
}

function validateRangeSummary(findings, rangeSummary) {
  if (!isPlainObject(rangeSummary)) {
    addFinding(findings, "range_summary_invalid", "rangeSummary must be an object");
    return;
  }

  for (const flag of REQUIRED_RANGE_SUMMARY_FLAGS) {
    if (rangeSummary[flag] !== false) {
      addFinding(findings, `${flag}_must_be_false`, `${flag} must be false`);
    }
  }
}

function validMonth(value) {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function validateMonthRange(findings, monthRange) {
  if (!isPlainObject(monthRange)) {
    addFinding(findings, "month_range_invalid", "monthRange must be an object");
    return;
  }
  if (!validMonth(monthRange.from) || !validMonth(monthRange.to)) {
    addFinding(findings, "month_range_format_invalid", "monthRange from/to must be YYYY-MM");
    return;
  }
  if (monthRange.from > monthRange.to) {
    addFinding(findings, "month_range_order_invalid", "monthRange from must not be after to");
  }
}

function validateSource(findings, source) {
  if (!isPlainObject(source)) {
    addFinding(findings, "source_invalid", "source entries must be objects");
    return;
  }

  for (const key of [
    "sourceId",
    "sourceType",
    "fileName",
    "contentHashSha256",
    "recordCount",
    "monthRange",
    "fieldList",
    "rangeSummary"
  ]) {
    if (!Object.hasOwn(source, key)) {
      addFinding(findings, "source_required_field_missing", "source is missing required metadata");
    }
  }

  if (typeof source.sourceId !== "string" || source.sourceId.length === 0) {
    addFinding(findings, "source_id_invalid", "sourceId must be present");
  }
  if (!ALLOWED_SOURCE_TYPES.has(source.sourceType)) {
    addFinding(findings, "source_type_invalid", "sourceType is not allowed");
  }
  validateFileName(findings, source);
  validateSourcePathLikeValues(findings, source);
  if (
    typeof source.contentHashSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(source.contentHashSha256)
  ) {
    addFinding(findings, "content_hash_invalid", "contentHashSha256 must be 64 lowercase hex characters");
  }
  if (!Number.isInteger(source.recordCount) || source.recordCount < 0) {
    addFinding(findings, "record_count_invalid", "recordCount must be a non-negative integer");
  }
  validateMonthRange(findings, source.monthRange);
  validateFieldList(findings, source.fieldList);
  validateRangeSummary(findings, source.rangeSummary);
}

function validateSources(findings, manifest) {
  if (!Array.isArray(manifest.sources)) return;
  manifest.sources.forEach((source) => validateSource(findings, source));
}

function buildOutput({ status, manifestPathType, sourceCount, findings }) {
  return {
    status,
    mode: "no-db",
    stage: STAGE,
    manifestPathType,
    sourceCount,
    metadataOnly: status === "pass",
    sourceFileBodyRead: false,
    stageJsonBodyRead: false,
    operationsConfirmationBodyRead: false,
    databaseConnected: false,
    dockerExecuted: false,
    realDataRead: false,
    dataDirectoryRead: false,
    envLocalRead: false,
    dbConnectionStringRead: false,
    localDryRunExecuted: false,
    formalModeAdded: false,
    localDryRunModeAdded: false,
    writeApiAdded: false,
    exportApiAdded: false,
    evaluationTaskApiAdded: false,
    m2CReady: false,
    m2DReady: false,
    findings
  };
}

export async function validateLocalDryRunManifest({
  rootDir = process.cwd(),
  manifest = DEFAULT_MANIFEST_PATH,
  simulateFailure = false
} = {}) {
  const findings = [];
  let parsed = {};
  let sourceCount = 0;
  const manifestPathType = getManifestPathType(rootDir, manifest);

  try {
    const content = await readManifestText(rootDir, manifest);
    try {
      parsed = JSON.parse(content);
    } catch {
      addFinding(findings, "manifest_json_invalid", "manifest must be valid JSON");
    }
  } catch (error) {
    addFinding(findings, "manifest_unavailable", sanitizeFailure(error));
  }

  if (findings.length === 0) {
    validateTopLevel(findings, parsed);
    validateNoProhibitedKeysOrValues(findings, parsed);
    validateSources(findings, parsed);
    sourceCount = Array.isArray(parsed.sources) ? parsed.sources.length : 0;
  }

  if (simulateFailure) {
    addFinding(findings, "simulated_manifest_validation_failure", "simulated validator failure");
  }

  return buildOutput({
    status: findings.length === 0 ? "pass" : "fail",
    manifestPathType,
    sourceCount,
    findings
  });
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await validateLocalDryRunManifest({
      manifest: options.manifest,
      simulateFailure: options.simulateFailure
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status !== "pass") {
      process.exitCode = 1;
    }
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify(
        buildOutput({
          status: "fail",
          manifestPathType: "unknown",
          sourceCount: 0,
          findings: [
            createFinding("validator_failed", sanitizeFailure(error))
          ]
        }),
        null,
        2
      )}\n`
    );
    process.exitCode = 1;
  }
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  await main();
}
