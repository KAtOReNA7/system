import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runReadinessCheck } from "./check-m2-b3-no-db-readiness.mjs";

export const GENERATED_REPORT_PATH =
  "docs/analysis/m1-master-data/M2-B-3.2a-no-db-validation-generated-report-v0.1.md";
export const GENERATED_SUMMARY_PATH =
  "docs/analysis/m1-master-data/M2-B-3.2a-no-db-validation-generated-summary-v0.1.json";

export const GENERATOR_READ_ALLOWLIST = Object.freeze([
  "docs/technical-design/M2-B-3.2-local-dry-run-design-validation-report-v0.1.md",
  "docs/analysis/m1-master-data/M2-B-3.2-local-dry-run-design-validation-summary-v0.1.json",
  "docs/technical-design/M2-B-3.1-no-db-readiness-checker-implementation-report-v0.1.md",
  "docs/analysis/m1-master-data/M2-B-3.1-no-db-readiness-checker-summary-v0.1.json",
  "docs/technical-design/M2-B-3-fixture-local-dry-run-readiness-design-v0.1.md",
  "docs/analysis/m1-master-data/M2-B-3-fixture-local-dry-run-readiness-design-summary-v0.1.json",
  "docs/analysis/m1-master-data/M2-B-3-preauthorization-and-data-gate-report-v0.1.md",
  "docs/analysis/m1-master-data/M2-B-3-preauthorization-and-data-gate-summary-v0.1.json",
  "docs/technical-design/M2-B-fixture-old-product-evaluation-stage-closeout-report-v0.1.md",
  "docs/analysis/m1-master-data/M2-B-fixture-old-product-evaluation-stage-closeout-summary-v0.1.json",
  "docs/api/M2-old-product-evaluation-api-contract-v0.1.md",
  "docs/api/M2-old-product-evaluation-api-contract-addendum-v0.1.md",
  "docs/prd/20-evaluation/M2-old-product-evaluation-prd-v0.1.md",
  "src/fixtures/m2OldProductEvaluationFixture.js",
  "test/fixtures/m2OldProductEvaluationFixtureCases.js",
  "package.json"
]);

function fail(message) {
  throw Object.assign(new Error(message), { code: "GENERATOR_USAGE_ERROR" });
}

function parseArgs(argv) {
  const options = {
    rootDir: process.cwd(),
    outputRoot: process.cwd(),
    generatedAt: new Date().toISOString(),
    simulateCheckerFailure: false,
    dryRun: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--simulate-checker-failure") {
      options.simulateCheckerFailure = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--output-root") {
      const value = argv[index + 1];
      if (!value) fail("--output-root requires a value");
      options.outputRoot = path.resolve(value);
      index += 1;
    } else if (arg === "--generated-at") {
      const value = argv[index + 1];
      if (!value) fail("--generated-at requires a value");
      options.generatedAt = value;
      index += 1;
    } else {
      fail(`unsupported argument: ${arg}`);
    }
  }

  return options;
}

function sanitizeFailure(error) {
  if (error?.code) return `generator failure: ${error.code}`;
  return "generator failure";
}

function resolveAllowlistedPath(rootDir, relativePath) {
  const normalized = relativePath.replaceAll("\\", "/");
  if (!GENERATOR_READ_ALLOWLIST.includes(normalized)) {
    throw Object.assign(new Error("path is not allowlisted"), {
      code: "PATH_NOT_ALLOWLISTED"
    });
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

async function readAllowedText(rootDir, relativePath) {
  return readFile(resolveAllowlistedPath(rootDir, relativePath), "utf8");
}

async function readAllowedJson(rootDir, relativePath) {
  return JSON.parse(await readAllowedText(rootDir, relativePath));
}

function formatBool(value) {
  return value ? "true" : "false";
}

function renderList(items) {
  return items.map((item) => `- ${item}`).join("\n");
}

function buildGeneratedSummary({ generatedAt, checkerResult, designValidation }) {
  return {
    status: "pass",
    mode: "no-db",
    stage: "M2-B-3.2a",
    generatedAt,
    checkerExecuted: true,
    checkerPassed: checkerResult.status === "pass",
    designValidationPassed: designValidation.designValidationPassed === true,
    noDbOnly: true,
    localDryRunExecuted: false,
    databaseConnected: false,
    dockerExecuted: false,
    realDataRead: false,
    dataDirectoryRead: false,
    stageJsonRead: false,
    operationsConfirmationRead: false,
    dbConnectionStringRead: false,
    envLocalRead: false,
    migrationModified: false,
    apiModified: false,
    pageModified: false,
    formalModeAdded: false,
    localDryRunModeAdded: false,
    exportApiAdded: false,
    evaluationTaskApiAdded: false,
    generatedReportPath: GENERATED_REPORT_PATH,
    generatedSummaryPath: GENERATED_SUMMARY_PATH,
    recommendedNextLine: "technical",
    recommendedNextTask: "M2-B-3.2b local dry-run input manifest validator, subject to explicit authorization and without reading stage JSON body by default",
    m2B32bRecommended: true,
    m2B32cRecommended: true,
    m2B33Recommended: false,
    m2B34Recommended: false,
    m2CReady: false,
    m2DReady: false,
    blockedNext: [
      "M2-B-3.3 local non-formal persistence prototype",
      "M2-B-3.4 local dry-run report page/API",
      "M2-C formal readiness",
      "M2-D formal evaluation"
    ],
    prohibitedActionsConfirmed: {
      databaseConnected: false,
      dockerExecuted: false,
      dataDirectoryRead: false,
      realDataRead: false,
      stageJsonRead: false,
      operationsConfirmationRead: false,
      dbConnectionStringRead: false,
      envLocalRead: false,
      realDataImported: false,
      mappingVersionActivated: false,
      switchMappingVersionCalled: false,
      formalDataMigrationExecuted: false,
      dbMigrationsModified: false,
      apiModified: false,
      pageModified: false,
      writeApiAdded: false,
      formalModeAdded: false,
      localDryRunModeAdded: false,
      exportApiAdded: false,
      evaluationTaskApiAdded: false
    }
  };
}

function buildGeneratedReport({ generatedAt, checkerResult, b31, b32, closeout }) {
  const allowed = [
    "公开文档与公开 summary 的 no-db 校验",
    "fixture / synthetic 状态延续",
    "M2-B-3.2b / B-3.2c 的设计前置讨论"
  ];
  const blocked = [
    "local dry-run 实现",
    "数据库连接或写入",
    "Docker 执行",
    "stage JSON 读取",
    "运营确认结果读取",
    "真实数据读取或导入",
    "migration 修改",
    "API / 页面 / task / export / write 能力",
    "formal 评估",
    "M2-B-3.3 / B-3.4 / M2-C / M2-D"
  ];
  const authorizationNeeded = [
    "stage JSON manifest 或 body 的读取边界",
    "运营确认结果读取边界",
    "m1-local / m2-local dry-run 环境使用",
    "本地写入、rollback、reset、teardown 策略",
    "非正式 dry-run 报告输出范围",
    "任何 migration、task、export、API 或页面变更"
  ];

  return `# M2-B-3.2a no-db validation generated report v0.1

Generated at: ${generatedAt}

## 1. Report status

- status: pass
- mode: no-db
- stage: M2-B-3.2a
- dataset boundary: fixture/synthetic only
- local dry-run executed: false
- not for formal business decision: true
- M2-B-3.3 / B-3.4 / M2-C / M2-D blocked: true

## 2. Checker execution summary

- checker executed: true
- checker status: ${checkerResult.status}
- checker findings: ${checkerResult.findings.length}
- M2-B-3.2 design validation allowed: ${formatBool(checkerResult.readiness.m2B32DesignValidationAllowed)}
- M2-B-3.3 persistence allowed: ${formatBool(checkerResult.readiness.m2B33PersistenceAllowed)}
- M2-C ready: ${formatBool(checkerResult.readiness.m2CReady)}
- M2-D ready: ${formatBool(checkerResult.readiness.m2DReady)}

## 3. M2-B fixture closeout status

- M2-B-1 complete: ${formatBool(closeout.m2B1Complete)}
- M2-B-2 complete: ${formatBool(closeout.m2B2Complete)}
- M2-B-2.1 complete: ${formatBool(closeout.m2B21Complete)}
- fixture API complete: ${formatBool(closeout.fixtureApiComplete)}
- fixture admin complete: ${formatBool(closeout.fixtureAdminComplete)}
- fixture interaction complete: ${formatBool(closeout.fixtureInteractionComplete)}

## 4. M2-B-3.1 readiness checker status

- checker passed: ${formatBool(b31.checkerPassed)}
- checker status: ${b31.checkerStatus}
- no real data check passed: ${formatBool(b31.noRealDataCheckPassed)}
- database connected: false
- Docker executed: false
- stage JSON read: false
- DB connection string read: false

## 5. M2-B-3.2 design validation status

- design validation passed: ${formatBool(b32.designValidationPassed)}
- input matrix complete: ${formatBool(b32.inputMatrixComplete)}
- environment matrix complete: ${formatBool(b32.environmentMatrixComplete)}
- failure recovery defined: ${formatBool(b32.failureRecoveryDefined)}
- rollback defined: ${formatBool(b32.rollbackDefined)}
- dry-run report shape defined: ${formatBool(b32.dryRunReportShapeDefined)}

## 6. Input matrix summary

- fixture/synthetic: allowed for no-db and non-formal validation only.
- public summary/report: allowed for design and generated report evidence.
- stage JSON: blocked unless separately authorized.
- operations confirmation result: blocked unless separately authorized.
- real bills / ledger / Excel / data directory: blocked.
- local environment file and DB connection string: blocked.
- none of the blocked inputs may enter Git, fixture data, pages, or generated reports as details.

## 7. Environment matrix summary

- no-db fixture mode: allowed.
- m1-local-dev / m1-local-dry-run / m2-local-dry-run: require separate authorization.
- formal DB / staging / production / shared development / shared test: blocked.
- reset and rollback are mandatory for any later authorized local write path.
- current/historical/invalidated formal results remain blocked.

## 8. Failure recovery summary

- if checker fails: stop and do not generate pass report.
- if environment is unauthorized: stop.
- if stage JSON is unauthorized: stop.
- if DB connection configuration is unauthorized: stop.
- if migration is unauthorized: stop.
- if rollback is missing for future writes: stop.
- if leakage risk is detected: stop and report only a sanitized finding.

## 9. Rollback summary

- no-db stage does not require rollback.
- any future local write must have transaction rollback or disposable environment teardown.
- formal/shared environments are not rollback targets for M2-B-3.
- local non-formal outputs cannot be published as formal current/historical/invalidated results.

## 10. Dry-run report shape summary

- only public summary is allowed.
- real details, real amounts, private paths, DB connection information, and stage JSON body are prohibited.
- report must label local non-formal status.
- report must state it is not for formal business decision.

## 11. Current allowed items

${renderList(allowed)}

## 12. Current prohibited items

${renderList(blocked)}

## 13. Separately authorized items needed later

${renderList(authorizationNeeded)}

## 14. Recommended next step

Recommended: M2-B-3.2b local dry-run input manifest validator.

This recommendation does not authorize reading stage JSON body, connecting to a database, executing Docker, writing local dry-run data, or adding API/page/task/export/formal/local_dry_run capabilities.

## 15. Blocked stages

- M2-B-3.3 local non-formal persistence prototype: blocked.
- M2-B-3.4 local dry-run report page/API: blocked.
- M2-C formal readiness: blocked.
- M2-D formal evaluation: blocked.
`;
}

async function writeOutput(outputRoot, relativePath, content) {
  const target = path.join(outputRoot, ...relativePath.split("/"));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}

export async function generateNoDbValidationReport({
  rootDir = process.cwd(),
  outputRoot = process.cwd(),
  generatedAt = new Date().toISOString(),
  simulateCheckerFailure = false,
  dryRun = false
} = {}) {
  const checkerResult = await runReadinessCheck({
    rootDir,
    simulateFailure: simulateCheckerFailure
  });
  if (checkerResult.status !== "pass") {
    return {
      status: "fail",
      mode: "no-db",
      stage: "M2-B-3.2a",
      generatedAt,
      checkerExecuted: true,
      checkerPassed: false,
      findings: checkerResult.findings,
      generatedReportPath: null,
      generatedSummaryPath: null
    };
  }

  const b31 = await readAllowedJson(
    rootDir,
    "docs/analysis/m1-master-data/M2-B-3.1-no-db-readiness-checker-summary-v0.1.json"
  );
  const b32 = await readAllowedJson(
    rootDir,
    "docs/analysis/m1-master-data/M2-B-3.2-local-dry-run-design-validation-summary-v0.1.json"
  );
  const closeout = await readAllowedJson(
    rootDir,
    "docs/analysis/m1-master-data/M2-B-fixture-old-product-evaluation-stage-closeout-summary-v0.1.json"
  );

  const generatedSummary = buildGeneratedSummary({
    generatedAt,
    checkerResult,
    designValidation: b32
  });
  const generatedReport = buildGeneratedReport({
    generatedAt,
    checkerResult,
    b31,
    b32,
    closeout
  });

  if (!dryRun) {
    await writeOutput(outputRoot, GENERATED_REPORT_PATH, generatedReport);
    await writeOutput(
      outputRoot,
      GENERATED_SUMMARY_PATH,
      `${JSON.stringify(generatedSummary, null, 2)}\n`
    );
  }

  return {
    ...generatedSummary,
    reportBytes: Buffer.byteLength(generatedReport, "utf8"),
    summaryBytes: Buffer.byteLength(JSON.stringify(generatedSummary, null, 2), "utf8")
  };
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await generateNoDbValidationReport(options);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status !== "pass") {
      process.exitCode = 1;
    }
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify(
        {
          status: "fail",
          mode: "no-db",
          stage: "M2-B-3.2a",
          generatedAt: new Date().toISOString(),
          checkerExecuted: false,
          checkerPassed: false,
          findings: [
            {
              code: "generator_failed",
              severity: "error",
              message: sanitizeFailure(error)
            }
          ]
        },
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
