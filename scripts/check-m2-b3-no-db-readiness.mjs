import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const READ_ALLOWLIST = Object.freeze([
  "docs/analysis/m1-master-data/M2-B-3-preauthorization-and-data-gate-report-v0.1.md",
  "docs/analysis/m1-master-data/M2-B-3-preauthorization-and-data-gate-summary-v0.1.json",
  "docs/technical-design/M2-B-3-fixture-local-dry-run-readiness-design-v0.1.md",
  "docs/analysis/m1-master-data/M2-B-3-fixture-local-dry-run-readiness-design-summary-v0.1.json",
  "docs/technical-design/M2-B-fixture-old-product-evaluation-stage-closeout-report-v0.1.md",
  "docs/analysis/m1-master-data/M2-B-fixture-old-product-evaluation-stage-closeout-summary-v0.1.json",
  "docs/technical-design/M2-B-1-old-product-fixture-api-implementation-report-v0.1.md",
  "docs/technical-design/M2-B-2-old-product-fixture-admin-implementation-report-v0.1.md",
  "docs/technical-design/M2-B-2.1-old-product-fixture-admin-interaction-report-v0.1.md",
  "docs/api/M2-old-product-evaluation-api-contract-v0.1.md",
  "docs/api/M2-old-product-evaluation-api-contract-addendum-v0.1.md",
  "docs/prd/20-evaluation/M2-old-product-evaluation-prd-v0.1.md",
  "src/fixtures/m2OldProductEvaluationFixture.js",
  "src/repositories/oldProductEvaluationFixtureRepository.js",
  "test/fixtures/m2OldProductEvaluationFixtureCases.js",
  "package.json"
]);

const EXPECTED_TRUE = true;
const EXPECTED_FALSE = false;

const FORBIDDEN_FIXTURE_TOKENS = Object.freeze([
  "真实账单",
  "数字版权台账",
  "运营确认包",
  "运营确认 Excel",
  "身份证",
  "手机号",
  "银行卡",
  ["postgres", "://"].join(""),
  ["jdbc", ":"].join(""),
  ["password", "="].join(""),
  ["passwd", "="].join(""),
  "api_key",
  "apikey",
  ["secret", "="].join("")
]);

function createFinding(code, severity, message) {
  return { code, severity, message };
}

function sanitizeErrorMessage(error) {
  if (error && typeof error.code === "string") {
    return `readiness input failure: ${error.code}`;
  }
  return "readiness input failure";
}

function assertCondition(findings, condition, code, message, severity = "error") {
  if (!condition) {
    findings.push(createFinding(code, severity, message));
  }
}

function getByPath(object, dottedPath) {
  return dottedPath.split(".").reduce((value, key) => value?.[key], object);
}

function assertJsonFlag(findings, object, dottedPath, expected, code, label) {
  assertCondition(
    findings,
    getByPath(object, dottedPath) === expected,
    code,
    `${label} must be ${expected}`
  );
}

function parseJsonInput(findings, content, code, label) {
  try {
    return JSON.parse(content);
  } catch {
    findings.push(createFinding(code, "error", `${label} must be valid JSON`));
    return {};
  }
}

function resolveAllowlistedPath(rootDir, relativePath) {
  const normalized = relativePath.replaceAll("\\", "/");
  if (!READ_ALLOWLIST.includes(normalized)) {
    throw Object.assign(new Error("path is not allowlisted"), { code: "PATH_NOT_ALLOWLISTED" });
  }
  if (
    normalized.startsWith("data/") ||
    normalized.includes("/data/") ||
    normalized.endsWith(".env") ||
    normalized.endsWith(".env.local") ||
    normalized.endsWith(".pgpass") ||
    normalized.includes("mapping_import_stage-v0.1.json") ||
    normalized.includes("mapping_import_stage-v0.2.json")
  ) {
    throw Object.assign(new Error("path is prohibited"), { code: "PATH_PROHIBITED" });
  }
  return path.join(rootDir, ...normalized.split("/"));
}

async function readAllowedInputs(rootDir) {
  const entries = new Map();
  for (const relativePath of READ_ALLOWLIST) {
    const absolutePath = resolveAllowlistedPath(rootDir, relativePath);
    entries.set(relativePath, await readFile(absolutePath, "utf8"));
  }
  return entries;
}

function hasAllTokens(content, tokens) {
  return tokens.every((token) => content.includes(token));
}

function buildReadiness(findings, inputs) {
  const preauth = parseJsonInput(
    findings,
    inputs.get("docs/analysis/m1-master-data/M2-B-3-preauthorization-and-data-gate-summary-v0.1.json"),
    "preauthorization_json_invalid",
    "M2-B-3 preauthorization summary"
  );
  const design = parseJsonInput(
    findings,
    inputs.get(
      "docs/analysis/m1-master-data/M2-B-3-fixture-local-dry-run-readiness-design-summary-v0.1.json"
    ),
    "readiness_design_json_invalid",
    "M2-B-3 readiness design summary"
  );
  const closeout = parseJsonInput(
    findings,
    inputs.get(
      "docs/analysis/m1-master-data/M2-B-fixture-old-product-evaluation-stage-closeout-summary-v0.1.json"
    ),
    "m2_b_closeout_json_invalid",
    "M2-B fixture closeout summary"
  );
  const packageJson = parseJsonInput(
    findings,
    inputs.get("package.json"),
    "package_json_invalid",
    "package.json"
  );

  const preauthReport =
    inputs.get("docs/analysis/m1-master-data/M2-B-3-preauthorization-and-data-gate-report-v0.1.md") ??
    "";
  const designReport =
    inputs.get("docs/technical-design/M2-B-3-fixture-local-dry-run-readiness-design-v0.1.md") ??
    "";
  const fixtureSource = inputs.get("src/fixtures/m2OldProductEvaluationFixture.js") ?? "";
  const fixtureCases = inputs.get("test/fixtures/m2OldProductEvaluationFixtureCases.js") ?? "";
  const contractAddendum =
    inputs.get("docs/api/M2-old-product-evaluation-api-contract-addendum-v0.1.md") ?? "";
  const apiContract = inputs.get("docs/api/M2-old-product-evaluation-api-contract-v0.1.md") ?? "";

  const readiness = {
    m2BFixtureClosed: closeout.fixtureApiComplete === EXPECTED_TRUE,
    m2B1Complete: closeout.m2B1Complete === EXPECTED_TRUE,
    m2B2Complete: closeout.m2B2Complete === EXPECTED_TRUE,
    m2B21Complete: closeout.m2B21Complete === EXPECTED_TRUE,
    preauthorizationPresent: preauth.m2B3RecommendedScope?.allowLocalDryRunDesignOnly === EXPECTED_TRUE,
    readinessDesignPresent: design.designOnly === EXPECTED_TRUE,
    designOnly: design.designOnly === EXPECTED_TRUE,
    implementationAllowed: design.implementationAllowed === EXPECTED_TRUE,
    m2B32DesignValidationAllowed: design.m2B32Recommended === EXPECTED_TRUE,
    m2B33PersistenceAllowed: design.m2B33Recommended === EXPECTED_TRUE,
    m2CReady: design.m2CReady === EXPECTED_TRUE,
    m2DReady: design.m2DReady === EXPECTED_TRUE
  };

  assertJsonFlag(
    findings,
    closeout,
    "fixtureApiComplete",
    EXPECTED_TRUE,
    "m2_b_fixture_not_closed",
    "M2-B fixture API closeout"
  );
  assertJsonFlag(findings, closeout, "m2B1Complete", EXPECTED_TRUE, "m2_b1_incomplete", "M2-B-1");
  assertJsonFlag(findings, closeout, "m2B2Complete", EXPECTED_TRUE, "m2_b2_incomplete", "M2-B-2");
  assertJsonFlag(findings, closeout, "m2B21Complete", EXPECTED_TRUE, "m2_b21_incomplete", "M2-B-2.1");

  assertJsonFlag(
    findings,
    preauth,
    "m2B3ImplementationAllowed",
    EXPECTED_FALSE,
    "m2_b3_implementation_unexpectedly_allowed",
    "M2-B-3 implementation authorization"
  );
  assertJsonFlag(findings, preauth, "m2CReady", EXPECTED_FALSE, "m2_c_unexpectedly_ready", "M2-C");
  assertJsonFlag(findings, preauth, "m2DReady", EXPECTED_FALSE, "m2_d_unexpectedly_ready", "M2-D");
  assertCondition(
    findings,
    hasAllTokens(preauthReport, [
      "M2-B-3",
      "local_dry_run",
      "M2-C / M2-D",
      "db/migrations"
    ]),
    "preauthorization_report_missing_gate_language",
    "preauthorization report must describe design-only authorization and M2-C/M2-D blocking"
  );

  assertJsonFlag(findings, design, "designOnly", EXPECTED_TRUE, "design_not_marked_only", "readiness design");
  assertJsonFlag(
    findings,
    design,
    "implementationAllowed",
    EXPECTED_FALSE,
    "implementation_unexpectedly_allowed",
    "implementation authorization"
  );
  for (const [key, label] of [
    ["databaseConnected", "database connection"],
    ["dockerExecuted", "Docker execution"],
    ["realDataRead", "real data read"],
    ["dataDirectoryRead", "data directory read"],
    ["stageJsonRead", "stage JSON read"],
    ["operationsConfirmationRead", "operations confirmation read"],
    ["dbConnectionStringRead", "database connection string read"],
    ["migrationModified", "migration modification"],
    ["localDryRunModeAdded", "local_dry_run mode"],
    ["exportApiAdded", "export API"],
    ["evaluationTaskApiAdded", "evaluation task API"]
  ]) {
    assertJsonFlag(findings, design, key, EXPECTED_FALSE, `${key}_must_be_false`, label);
  }
  assertCondition(
    findings,
    hasAllTokens(designReport, [
      "M2-B-3 不是正式评估",
      "本轮不新增 mode",
      "本轮不新增 DB repository",
      "本轮不新增 migration",
      "硬阻断"
    ]),
    "readiness_design_missing_boundary_language",
    "readiness design must describe non-formal, no-mode, no-repository, no-migration boundaries"
  );

  assertCondition(
    findings,
    fixtureSource.includes('mode: "fixture"') || fixtureSource.includes('"mode": "fixture"'),
    "fixture_dataset_mode_missing",
    "fixture source must include dataset.mode=fixture"
  );
  assertCondition(
    findings,
    (fixtureSource.match(/SYN-/g) ?? []).length >= 20 && (fixtureCases.match(/SYN-/g) ?? []).length >= 5,
    "fixture_synthetic_marker_missing",
    "fixture files must use SYN-* synthetic markers"
  );
  const fixtureForbiddenHits = FORBIDDEN_FIXTURE_TOKENS.filter((token) =>
    fixtureSource.toLowerCase().includes(token.toLowerCase())
  );
  assertCondition(
    findings,
    fixtureForbiddenHits.length === 0,
    "fixture_contains_forbidden_token",
    "fixture source must not contain obvious real-data or secret markers"
  );

  assertCondition(
    findings,
    hasAllTokens(contractAddendum, [
      "formal mode",
      "`local_dry_run` mode",
      "export endpoints",
      "evaluation task",
      "write APIs"
    ]),
    "api_addendum_missing_out_of_scope",
    "API addendum must keep formal/local_dry_run/export/task/write APIs out of scope"
  );
  assertCondition(
    findings,
    apiContract.includes('dataset.mode') && apiContract.includes("M2-A only allows `fixture` and `synthetic`"),
    "api_contract_missing_fixture_boundary",
    "API contract must define fixture/synthetic dataset boundary"
  );
  assertCondition(
    findings,
    typeof packageJson.scripts?.test === "string" && packageJson.scripts.test.length > 0,
    "package_test_script_missing",
    "package.json must define a test command"
  );

  return readiness;
}

function buildOutput({ status, findings, readiness }) {
  return {
    status,
    mode: "no-db",
    stage: "M2-B-3.1",
    checkedAt: new Date().toISOString(),
    readiness,
    guards: {
      databaseConnected: false,
      dockerExecuted: false,
      realDataRead: false,
      dataDirectoryRead: false,
      stageJsonRead: false,
      operationsConfirmationRead: false,
      dbConnectionStringRead: false,
      migrationModified: false,
      apiModified: false,
      pageModified: false,
      formalModeAdded: false,
      localDryRunModeAdded: false,
      exportApiAdded: false,
      evaluationTaskApiAdded: false
    },
    allowedNext: ["M2-B-3.2 local dry-run design validation, design-only"],
    blockedNext: [
      "M2-B-3.3 local non-formal persistence prototype",
      "M2-B-3.4 local dry-run report page/API",
      "M2-C formal readiness",
      "M2-D formal evaluation"
    ],
    findings
  };
}

export async function runReadinessCheck({
  rootDir = process.cwd(),
  simulateFailure = false
} = {}) {
  const findings = [];
  let readiness = {
    m2BFixtureClosed: false,
    m2B1Complete: false,
    m2B2Complete: false,
    m2B21Complete: false,
    preauthorizationPresent: false,
    readinessDesignPresent: false,
    designOnly: false,
    implementationAllowed: false,
    m2B32DesignValidationAllowed: false,
    m2B33PersistenceAllowed: false,
    m2CReady: false,
    m2DReady: false
  };

  try {
    const inputs = await readAllowedInputs(rootDir);
    readiness = buildReadiness(findings, inputs);
  } catch (error) {
    findings.push(createFinding("readiness_input_unavailable", "error", sanitizeErrorMessage(error)));
  }

  if (simulateFailure) {
    findings.push(
      createFinding(
        "simulated_readiness_failure",
        "error",
        "simulated no-db readiness failure for test coverage"
      )
    );
  }

  const pass =
    findings.length === 0 &&
    readiness.m2BFixtureClosed === true &&
    readiness.m2B1Complete === true &&
    readiness.m2B2Complete === true &&
    readiness.m2B21Complete === true &&
    readiness.preauthorizationPresent === true &&
    readiness.readinessDesignPresent === true &&
    readiness.designOnly === true &&
    readiness.implementationAllowed === false &&
    readiness.m2B32DesignValidationAllowed === true &&
    readiness.m2B33PersistenceAllowed === false &&
    readiness.m2CReady === false &&
    readiness.m2DReady === false;

  return buildOutput({ status: pass ? "pass" : "fail", findings, readiness });
}

async function main() {
  const simulateFailure = process.argv.includes("--simulate-failure");
  const result = await runReadinessCheck({ simulateFailure });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status !== "pass") {
    process.exitCode = 1;
  }
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  await main();
}
