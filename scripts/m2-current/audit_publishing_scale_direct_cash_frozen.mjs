import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {
  createReadStream,
  existsSync
} from "node:fs";
import {
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile
} from "node:fs/promises";
import {Transform} from "node:stream";
import {fileURLToPath} from "node:url";
import path from "node:path";
import readline from "node:readline";
import {performance} from "node:perf_hooks";

import {
  accumulateM2Psc03FrozenRow,
  createM2Psc03FrozenAuditAccumulator,
  finalizeM2Psc03FrozenAudit,
  protectM2Psc03AuditForPublic
} from "../../src/domain/m2Current/publishingScaleDirectCashFrozenAudit.js";

const DEVELOPMENT_PATH =
  "config/m2-current-publishing-scale-channel-direct-cash-development.v0.1.json";
const PSC01_CONFIG_PATH = "config/m2-current-publishing-scale-channel.v0.1.json";
const PUBLIC_EVALUATION_PATH =
  "docs/analysis/m2-current/M2-publishing-scale-channel-direct-cash-development-evaluation-v0.1.json";
const IMPLEMENTATION_PATH =
  "src/domain/m2Current/publishingScaleDirectCashDevelopment.js";
const EVALUATION_SOURCE_PATH =
  "src/domain/m2Current/publishingScaleDirectCashEvaluation.js";
const RUNNER_PATH =
  "scripts/m2-current/publishing_scale_direct_cash_execution.mjs";
const PREREGISTRATION_PATH =
  "config/m2-current-publishing-scale-channel-direct-cash-preregistration.v0.1.json";
const SCHEMA_PATH =
  "config/m2-current-publishing-scale-channel-direct-cash-schema.v0.1.json";

export async function runM2Psc03FrozenTailAudit({
  root = defaultRoot(),
  outputDirectory = null,
  progressEvery = 250000
} = {}) {
  const startedAt = new Date().toISOString();
  const wallStarted = performance.now();
  const contracts = await readContracts(root);
  const privateRoot = path.join(
    root,
    contracts.development.privateOutputs.directory
  );
  const frozen = await locateFrozenArtifacts(privateRoot, contracts.development);
  const targetDirectory = outputDirectory ?? path.join(
    privateRoot,
    "frozen-tail-contract-audit-v0.1"
  );
  if (existsSync(targetDirectory)) {
    throw new Error("m2_psc03_frozen_audit_output_collision");
  }
  const rawBefore = await fileSnapshot(frozen.rawPath);
  const staticIntegrity = await verifyStaticIntegrity({
    root,
    contracts,
    frozen
  });
  const sourceAuthority = await verifyPsc01OccurrenceAuthority({
    root,
    expectedSha256: frozen.manifest.occurrenceAuthoritySha256
  });
  const lg01 = await verifyLg01Comparator({root, contracts});
  const accumulator = createM2Psc03FrozenAuditAccumulator({
    namedPlatforms: contracts.psc01.nodes.namedPlatforms
  });
  const scan = await scanFrozenRaw({
    filePath: frozen.rawPath,
    accumulator,
    progressEvery
  });
  const audit = finalizeM2Psc03FrozenAudit(accumulator);
  const reproduction = compareWithPublicEvaluation(
    audit,
    contracts.publicEvaluation
  );
  const rawAfter = await fileSnapshot(frozen.rawPath);
  const rawIntegrity = {
    rowCountMatchesManifest: scan.rowCount === frozen.manifest.rowCount,
    sha256MatchesManifest: scan.sha256 === frozen.manifest.sha256,
    populationDigestMatchesManifest:
      audit.summary.populationKeySha256 === frozen.manifest.populationKeySha256,
    occurrenceBinary64Parity:
      audit.summary.invariants.occurrenceBinary64 === 0,
    occurrenceAppliedExactlyOnce:
      audit.summary.invariants.occurrenceApplicationCount === 0,
    rawMetadataUnchanged: sameFileSnapshot(rawBefore, rawAfter),
    rawOpenedReadOnly: true,
    pRawFullScanCount: 1
  };
  const integrityPassed = Object.values(rawIntegrity).every((value) => (
    typeof value !== "boolean" || value
  )) && audit.summary.invariantStatus === "PASS"
    && staticIntegrity.status === "PASS"
    && sourceAuthority.status === "PASS"
    && lg01.status === "PASS"
    && reproduction.status === "PASS";
  const publicSafe = protectM2Psc03AuditForPublic(audit);
  const detail = {
    schema: "m2.current.psc03.frozen_tail_contract_audit.private.v0.1",
    tracked: false,
    status: integrityPassed
      ? "PSC03_FROZEN_AUDIT_INPUTS_AND_RECOMPUTATION_VERIFIED"
      : "PSC03_FROZEN_AUDIT_INTEGRITY_FAILURE",
    evidenceClass: "FROZEN_RAW_READ_ONLY_RECOMPUTATION_NOT_MODEL_EXECUTION",
    modelId: "M2-CHAN-PSC03",
    rawCandidateId: "M2-CHAN-PSC03-RAW",
    frozenArtifactIntegrity: {
      raw: rawIntegrity,
      static: staticIntegrity,
      occurrenceAuthority: sourceAuthority,
      lg01Comparator: lg01
    },
    reproduction,
    privateMetrics: audit.metrics,
    publicSafe,
    evidenceGaps: {
      separatePrivateEvaluationFile:
        "NOT_RECORDED_PUBLIC_TRACKED_EVALUATION_IS_FROZEN_AUTHORITY",
      foldCoefficientState:
        "NOT_RECORDED_CANNOT_RECOVER_WITHOUT_RERUN",
      foldStandardizers:
        "NOT_RECORDED_CANNOT_RECOVER_WITHOUT_RERUN",
      foldSelectedLambdas:
        "NOT_RECORDED_CANNOT_RECOVER_WITHOUT_RERUN",
      groupedCvStabilityReceipts:
        "NOT_RECORDED_CANNOT_RECOVER_WITHOUT_RERUN"
    }
  };
  const locator = {
    schema: "m2.current.psc03.frozen_tail_top_error_locator.private.v0.1",
    tracked: false,
    status: "PRIVATE_MINIMUM_LOCATOR_NOT_PUBLIC_REPORT",
    modelId: "M2-CHAN-PSC03",
    rawCandidateId: "M2-CHAN-PSC03-RAW",
    ...audit.privateLocator
  };
  await mkdir(targetDirectory, {recursive: false});
  const detailPath = path.join(targetDirectory, "audit-details-private-v0.1.json");
  const locatorPath = path.join(targetDirectory, "top-error-locator-private-v0.1.json");
  const detailText = `${JSON.stringify(detail, null, 2)}\n`;
  const locatorText = `${JSON.stringify(locator, null, 2)}\n`;
  await Promise.all([
    writeFile(detailPath, detailText, {encoding: "utf8", flag: "wx"}),
    writeFile(locatorPath, locatorText, {encoding: "utf8", flag: "wx"})
  ]);
  const completedAt = new Date().toISOString();
  const receipt = {
    schema: "m2.current.psc03.frozen_tail_contract_audit_receipt.private.v0.1",
    tracked: false,
    status: integrityPassed
      ? "PSC03_FROZEN_TAIL_CONTRACT_AUDIT_READ_ONLY_SCAN_COMPLETED"
      : "PSC03_FROZEN_TAIL_CONTRACT_AUDIT_INTEGRITY_FAILURE",
    evidenceClass: "FROZEN_RAW_READ_ONLY_RECOMPUTATION_NOT_MODEL_EXECUTION",
    modelId: "M2-CHAN-PSC03",
    rawCandidateId: "M2-CHAN-PSC03-RAW",
    startedAt,
    completedAt,
    wallClockSeconds: (performance.now() - wallStarted) / 1000,
    rawScan: {
      pRawFullScanCount: 1,
      rowCount: scan.rowCount,
      byteCount: scan.byteCount,
      sha256: scan.sha256,
      wallClockSeconds: scan.wallClockSeconds,
      peakRssBytesApproximate: scan.peakRssBytesApproximate,
      openMode: "READ_ONLY_CREATE_READ_STREAM"
    },
    auxiliaryAuthorityScans: {
      psc01OccurrenceAuthorityFullByteScanCount: 1,
      psc01OccurrenceAuthoritySha256: sourceAuthority.sha256,
      lg01ComparatorFullByteScanCount: 1,
      lg01ComparatorSha256: lg01.sha256
    },
    outputs: {
      detailsRelativePath: relative(root, detailPath),
      detailsSha256: sha256(detailText),
      locatorRelativePath: relative(root, locatorPath),
      locatorSha256: sha256(locatorText)
    },
    prohibitedActions: {
      fitExecuted: false,
      crossFitExecuted: false,
      lambdaSelectionExecuted: false,
      predictionExecuted: false,
      counterfactualScoreExecuted: false,
      rawWriteOpened: false,
      rawModified: false,
      modelAlgorithmModified: false
    }
  };
  const receiptPath = path.join(targetDirectory, "audit-receipt-private-v0.1.json");
  await writeFile(
    receiptPath,
    `${JSON.stringify(receipt, null, 2)}\n`,
    {encoding: "utf8", flag: "wx"}
  );
  if (!integrityPassed) {
    throw new Error("m2_psc03_frozen_audit_integrity_failed");
  }
  return {detail, locator, receipt, outputDirectory: targetDirectory};
}

export async function scanFrozenRaw({
  filePath,
  accumulator,
  progressEvery = 250000
}) {
  const started = performance.now();
  const hash = createHash("sha256");
  let byteCount = 0;
  let rowCount = 0;
  let peakRssBytesApproximate = process.memoryUsage().rss;
  const input = createReadStream(filePath, {flags: "r"});
  const tap = new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk);
      byteCount += chunk.length;
      callback(null, chunk);
    }
  });
  input.pipe(tap);
  const lines = readline.createInterface({input: tap, crlfDelay: Infinity});
  for await (const line of lines) {
    if (line === "") continue;
    accumulateM2Psc03FrozenRow(accumulator, JSON.parse(line));
    rowCount += 1;
    if (rowCount % progressEvery === 0) {
      peakRssBytesApproximate = Math.max(
        peakRssBytesApproximate,
        process.memoryUsage().rss
      );
      process.stdout.write(`${JSON.stringify({
        status: "PSC03_FROZEN_RAW_READ_ONLY_SCAN_PROGRESS",
        rowCount,
        elapsedSeconds: (performance.now() - started) / 1000,
        rssBytes: process.memoryUsage().rss
      })}\n`);
    }
  }
  peakRssBytesApproximate = Math.max(
    peakRssBytesApproximate,
    process.memoryUsage().rss
  );
  return {
    rowCount,
    byteCount,
    sha256: hash.digest("hex"),
    wallClockSeconds: (performance.now() - started) / 1000,
    peakRssBytesApproximate
  };
}

async function readContracts(root) {
  const paths = {
    development: DEVELOPMENT_PATH,
    psc01: PSC01_CONFIG_PATH,
    publicEvaluation: PUBLIC_EVALUATION_PATH
  };
  const values = await Promise.all(Object.values(paths).map(
    (value) => readFile(path.join(root, value), "utf8")
  ));
  return Object.fromEntries(Object.keys(paths).map(
    (key, index) => [key, JSON.parse(values[index])]
  ));
}

async function locateFrozenArtifacts(privateRoot, development) {
  const children = await readdir(privateRoot, {withFileTypes: true});
  const candidates = [];
  for (const child of children) {
    if (!child.isDirectory() || !child.name.startsWith("attempt-")) continue;
    const manifestPath = path.join(
      privateRoot,
      child.name,
      development.privateOutputs.PManifest
    );
    if (existsSync(manifestPath)) candidates.push(path.dirname(manifestPath));
  }
  if (candidates.length !== 1) {
    throw new Error("m2_psc03_frozen_manifest_authority_ambiguous");
  }
  const directory = candidates[0];
  const manifestPath = path.join(directory, development.privateOutputs.PManifest);
  const manifestText = await readFile(manifestPath, "utf8");
  const sealNames = (await readdir(directory)).filter((name) => (
    name.startsWith("M2-publishing-scale-direct-cash-P-seal-private-v0.1-")
    && name.endsWith(".json")
  ));
  if (sealNames.length !== 1) throw new Error("m2_psc03_atomic_seal_ambiguous");
  return {
    directory,
    manifestPath,
    manifestText,
    manifest: JSON.parse(manifestText),
    sealPath: path.join(directory, sealNames[0]),
    rawPath: path.join(directory, development.privateOutputs.PRaw),
    bootstrapPath: path.join(directory, development.privateOutputs.bootstrap),
    decisionPath: path.join(directory, development.privateOutputs.decisionReceipt)
  };
}

async function verifyStaticIntegrity({root, contracts, frozen}) {
  const [sealText, decisionText] = await Promise.all([
    readFile(frozen.sealPath, "utf8"),
    readFile(frozen.decisionPath, "utf8")
  ]);
  const seal = JSON.parse(sealText);
  const decision = JSON.parse(decisionText);
  const bootstrap = await inspectBootstrap(
    frozen.bootstrapPath,
    contracts.publicEvaluation.comparisons.bootstrap
  );
  const attempt = await inspectAttemptReceipts(root, path.dirname(frozen.directory));
  const checks = {
    manifestIdentity: (
      frozen.manifest.status === "FROZEN_FIRST_COMPLETE_RAW_PREDICTION"
      && frozen.manifest.modelId === "M2-CHAN-PSC03"
      && frozen.manifest.candidateId === "M2-CHAN-PSC03-RAW"
      && frozen.manifest.rawCandidatePreserved === true
      && frozen.manifest.candidatePredictionRepeated === false
    ),
    sealRawReference: (
      seal.rowCount === frozen.manifest.rowCount
      && seal.sha256 === frozen.manifest.sha256
      && seal.manifestSha256 === sha256(frozen.manifestText)
    ),
    decisionRawReference: (
      decision.status === "PSC03_DEVELOPMENT_NOT_SUPPORTED"
      && decision.primaryRawSha256 === frozen.manifest.sha256
      && decision.primaryRawRowCount === frozen.manifest.rowCount
      && decision.primaryRawRepeated === false
    ),
    bootstrap: bootstrap.status === "PASS",
    attempts: attempt.status === "PASS"
  };
  return {
    status: Object.values(checks).every(Boolean) ? "PASS" : "FAIL",
    checks,
    bootstrap,
    attempts: attempt,
    separatePrivateEvaluationFile: existsSync(path.join(
      frozen.directory,
      contracts.development.privateOutputs.evaluation
    ))
      ? "PRESENT"
      : "NOT_RECORDED_PUBLIC_TRACKED_EVALUATION_IS_FROZEN_AUTHORITY",
    publicEvaluationSha256: await sha256File(path.join(root, PUBLIC_EVALUATION_PATH))
  };
}

async function inspectBootstrap(filePath, expected) {
  const hash = createHash("sha256");
  let rowCount = 0;
  const summaries = {};
  const drawCounts = {};
  const input = createReadStream(filePath, {flags: "r"});
  const tap = new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk);
      callback(null, chunk);
    }
  });
  input.pipe(tap);
  const lines = readline.createInterface({input: tap, crlfDelay: Infinity});
  for await (const line of lines) {
    if (line === "") continue;
    const row = JSON.parse(line);
    rowCount += 1;
    if (row.schema === "m2.current.psc03.bootstrap_summary.private.v0.1") {
      summaries[row.comparisonId] = row;
    } else if (row.schema === "m2.current.psc03.bootstrap_draw.private.v0.1") {
      drawCounts[row.comparisonId] = (drawCounts[row.comparisonId] ?? 0) + 1;
    }
  }
  const comparisons = Object.keys(expected).map((key) => ({
    comparisonId: key,
    summaryPresent: summaries[key] !== undefined,
    drawCount: drawCounts[key] ?? 0,
    iterationsMatch: summaries[key]?.iterations === expected[key].iterations,
    seedMatches: summaries[key]?.seed === expected[key].seed,
    observedImprovementMatches: nearlyEqual(
      summaries[key]?.observedImprovement,
      expected[key].observedImprovement
    ),
    lower95Matches: nearlyEqual(summaries[key]?.lower95, expected[key].lower95),
    upper95Matches: nearlyEqual(summaries[key]?.upper95, expected[key].upper95)
  }));
  const passed = comparisons.every((row) => (
    row.summaryPresent
    && row.drawCount === 2000
    && row.iterationsMatch
    && row.seedMatches
    && row.observedImprovementMatches
    && row.lower95Matches
    && row.upper95Matches
  ));
  return {
    status: passed ? "PASS" : "FAIL",
    rowCount,
    sha256: hash.digest("hex"),
    comparisonCount: comparisons.length,
    comparisons
  };
}

async function inspectAttemptReceipts(root, privateRoot) {
  const names = await readdir(privateRoot);
  const receiptNames = names.filter((name) => (
    name.startsWith("M2-publishing-scale-direct-cash-attempt-receipt-private-v0.1-")
    && name.endsWith(".json")
    && !name.endsWith("-failure.json")
  )).sort();
  const receipts = await Promise.all(receiptNames.map(async (name) => ({
    name,
    value: JSON.parse(await readFile(path.join(privateRoot, name), "utf8"))
  })));
  const checks = [];
  for (const row of receipts) {
    const commit = row.value.implementationCommit;
    const implementation = gitShow(root, commit, IMPLEMENTATION_PATH)
      + gitShow(root, commit, EVALUATION_SOURCE_PATH)
      + gitShow(root, commit, RUNNER_PATH);
    checks.push({
      attemptNumber: row.value.attemptNumber,
      implementationCommit: commit,
      implementationDigestMatches:
        sha256(implementation) === row.value.implementationSha256,
      developmentDigestMatches: sha256(gitShow(
        root,
        commit,
        DEVELOPMENT_PATH
      )) === row.value.developmentConfigSha256,
      preregistrationDigestMatches: sha256(gitShow(
        root,
        commit,
        PREREGISTRATION_PATH
      )) === row.value.preregistrationSha256,
      schemaDigestMatches: sha256(gitShow(
        root,
        commit,
        SCHEMA_PATH
      )) === row.value.schemaSha256,
      failureReceiptExpected: row.value.attemptNumber < 3,
      failureReceiptPresent: row.value.attemptNumber < 3
        ? existsSync(path.join(
          privateRoot,
          row.name.replace(/\.json$/u, "-failure.json")
        ))
        : true
    });
  }
  const passed = receipts.length === 3
    && checks.every((row) => Object.entries(row).every(
      ([key, value]) => !key.endsWith("Matches") || value === true
    ))
    && checks.every((row) => row.failureReceiptPresent);
  return {
    status: passed ? "PASS" : "FAIL",
    receiptCount: receipts.length,
    checks
  };
}

async function verifyPsc01OccurrenceAuthority({root, expectedSha256}) {
  const directory = path.join(
    root,
    "data/private-output/m2-current-publishing-scale-channel"
  );
  const names = (await readdir(directory)).filter((name) => (
    name.startsWith("M2-current-publishing-scale-channel-run-receipt-private-v0.2-")
    && name.endsWith(".json")
  ));
  const completed = [];
  for (const name of names) {
    const value = JSON.parse(await readFile(path.join(directory, name), "utf8"));
    if (value.status === "COMPLETED") completed.push(value);
  }
  if (completed.length !== 1) throw new Error("m2_psc01_completed_receipt_ambiguous");
  const rowsPath = path.join(directory, path.basename(
    completed[0].outputFiles.evaluationRows
  ));
  const manifestPath = path.join(directory, path.basename(
    completed[0].outputFiles.evaluationManifest
  ));
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const before = await fileSnapshot(rowsPath);
  const sha = await sha256File(rowsPath);
  const after = await fileSnapshot(rowsPath);
  const passed = sha === expectedSha256
    && sha === manifest.sha256
    && sameFileSnapshot(before, after);
  return {
    status: passed ? "PASS" : "FAIL",
    sha256: sha,
    matchesPsc03ManifestAuthority: sha === expectedSha256,
    matchesPsc01Manifest: sha === manifest.sha256,
    fileMetadataUnchanged: sameFileSnapshot(before, after),
    openedReadOnly: true
  };
}

async function verifyLg01Comparator({root, contracts}) {
  const rowsPath = path.join(root, contracts.development.frozenLg01.directory,
    contracts.development.frozenLg01.rows);
  const manifestPath = path.join(root, contracts.development.frozenLg01.directory,
    contracts.development.frozenLg01.manifest);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const before = await fileSnapshot(rowsPath);
  const sha = await sha256File(rowsPath);
  const after = await fileSnapshot(rowsPath);
  const passed = sha === manifest.sha256 && sameFileSnapshot(before, after);
  return {
    status: passed ? "PASS" : "FAIL",
    sha256: sha,
    matchesManifest: sha === manifest.sha256,
    fileMetadataUnchanged: sameFileSnapshot(before, after),
    openedReadOnly: true
  };
}

function compareWithPublicEvaluation(audit, publicEvaluation) {
  const checks = [];
  const candidate = publicEvaluation.arms.P;
  for (const family of ["primary", "strict"]) {
    compareScore(checks, `${family}.workTotal`, audit.metrics.family[family],
      candidate[family].workTotal);
    compareConditional(checks, `${family}.conditionalAmount`,
      audit.metrics.conditional[family], candidate[family].conditionalAmount);
    for (const [name, field, rows] of [
      ["byHorizon", "horizonMonths", audit.metrics.byHorizon],
      ["byOrigin", "origin", audit.metrics.byOrigin],
      ["byMechanism", "mechanism", audit.metrics.byMechanism],
      ["byNamedPlatform", "platformId", audit.metrics.byNamedPlatform],
      ["bySupportTier", "supportTier", audit.metrics.bySupportTier]
    ]) {
      const expectedGroups = candidate[family][name];
      for (const [key, value] of Object.entries(expectedGroups)) {
        const actual = rows.find((row) => (
          row.family === family && String(row[field]) === String(key)
        ));
        const expected = value.metrics ?? value;
        if (value.status === "SUPPRESSED_PRIVACY_THRESHOLD") {
          checks.push({
            id: `${family}.${name}.${key}.suppressed`,
            passed: actual !== undefined
              && (
                actual.metrics.caseCount < 30
                || actual.metrics.workCount < 20
              )
          });
        } else {
          compareScore(checks, `${family}.${name}.${key}`, actual?.metrics, expected);
        }
      }
    }
  }
  const failed = checks.filter((row) => !row.passed);
  const numeric = checks.filter((row) => Number.isFinite(row.absoluteDelta));
  return {
    status: failed.length === 0 ? "PASS" : "FAIL",
    comparisonCount: checks.length,
    failureCount: failed.length,
    maximumAbsoluteDelta: numeric.length === 0
      ? null
      : Math.max(...numeric.map((row) => row.absoluteDelta)),
    maximumRelativeDelta: numeric.length === 0
      ? null
      : Math.max(...numeric.map((row) => row.relativeDelta)),
    failedChecks: failed,
    coreChecks: checks.filter((row) => (
      row.id.includes("workTotal")
      || row.id.includes("byHorizon")
      || row.id.includes("conditionalAmount")
    ))
  };
}

function compareScore(checks, id, actual, expected) {
  if (actual === undefined || expected === undefined) {
    checks.push({id, passed: false, reason: "MISSING_SCORE"});
    return;
  }
  for (const field of [
    "caseCount",
    "workCount",
    "predictionActualCashRatio",
    "wape",
    "signedBias"
  ]) {
    compareValue(checks, `${id}.${field}`, actual[field], expected[field]);
  }
  for (const field of ["maximumWorkShare", "top10WorkShare"]) {
    compareValue(
      checks,
      `${id}.errorConcentration.${field}`,
      actual.errorConcentration?.[field],
      expected.errorConcentration?.[field]
    );
  }
}

function compareConditional(checks, id, actual, expected) {
  for (const field of ["rowCount", "workCount", "wape", "signedBias", "logMae"]) {
    compareValue(checks, `${id}.${field}`, actual?.[field], expected?.[field]);
  }
}

function compareValue(checks, id, actual, expected) {
  if (actual === null || expected === null) {
    checks.push({id, passed: actual === expected, actual, expected});
    return;
  }
  const left = Number(actual);
  const right = Number(expected);
  const absoluteDelta = Math.abs(left - right);
  const relativeDelta = absoluteDelta / Math.max(1, Math.abs(right));
  checks.push({
    id,
    passed: Number.isFinite(left)
      && Number.isFinite(right)
      && (Number.isInteger(right) ? left === right : relativeDelta <= 1e-10),
    actual: left,
    expected: right,
    absoluteDelta,
    relativeDelta
  });
}

function gitShow(root, commit, file) {
  const result = spawnSync(
    "git",
    ["show", `${commit}:${file}`],
    {cwd: root, encoding: "utf8", windowsHide: true, maxBuffer: 16 * 1024 * 1024}
  );
  if (result.status !== 0) {
    throw new Error(`m2_psc03_git_show_failed:${commit}:${file}`);
  }
  return result.stdout;
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  const input = createReadStream(filePath, {flags: "r"});
  for await (const chunk of input) hash.update(chunk);
  return hash.digest("hex");
}

async function fileSnapshot(filePath) {
  const value = await stat(filePath);
  return {
    size: value.size,
    mtimeMs: value.mtimeMs,
    birthtimeMs: value.birthtimeMs
  };
}

function sameFileSnapshot(left, right) {
  return left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.birthtimeMs === right.birthtimeMs;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function nearlyEqual(left, right) {
  return Number.isFinite(Number(left))
    && Number.isFinite(Number(right))
    && Math.abs(Number(left) - Number(right)) <= 1e-10 * Math.max(
      1,
      Math.abs(Number(left)),
      Math.abs(Number(right))
    );
}

function relative(root, value) {
  return path.relative(root, value).replaceAll("\\", "/");
}

function defaultRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

function isDirectExecution() {
  return process.argv[1] !== undefined
    && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isDirectExecution()) {
  runM2Psc03FrozenTailAudit().then(({receipt}) => {
    process.stdout.write(`${JSON.stringify({
      status: receipt.status,
      rawScan: receipt.rawScan,
      prohibitedActions: receipt.prohibitedActions
    }, null, 2)}\n`);
  }).catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
