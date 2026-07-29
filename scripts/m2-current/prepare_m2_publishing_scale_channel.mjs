import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  evaluateCapability,
  loadCapabilityCatalog,
} from "../check-development-capability.mjs";
import {
  verifyM2PublishingScaleGitAndCiPreflight,
} from "./publishing_scale_channel_execution.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), "../..");
const CAPABILITY_ID =
  "m2-current-publishing-scale-channel-controlled-retry-v2";
const CONFIG_PATH =
  "config/m2-current-publishing-scale-channel.v0.1.json";
const FROZEN_CONFIG_PATH =
  "config/m2-current-channel-experts.v0.1.json";
const RECONCILIATION_FILE =
  "M2-reversal-scope-reconciliation-private-v1.json";
const ALLOCATION_FILE =
  "M2-reversal-allocation-ledger-private-v1.ndjson";
const REVERSAL_RECEIPT_FILE =
  "M2-evaluation-v2.2-execution-receipt-private-v1.json";

export async function prepareM2PublishingScaleDerivedCaches({
  root = ROOT,
  gitPreflight = null,
} = {}) {
  const resolvedRoot = path.resolve(root);
  const preflight = gitPreflight
    ?? verifyM2PublishingScaleGitAndCiPreflight({ root: resolvedRoot });
  const catalog = loadCapabilityCatalog(path.join(
    resolvedRoot,
    "config/development-capability-catalog.v0.1.json",
  ));
  const inventoryBefore = evaluateCapability(catalog, CAPABILITY_ID, {
    repoRoot: resolvedRoot,
  });
  if (
    inventoryBefore.sourceAuthorityStatus === "MISSING_SOURCE_AUTHORITY"
    || inventoryBefore.unavailableTools.length > 0
  ) {
    const error = new Error(
      inventoryBefore.sourceAuthorityStatus === "MISSING_SOURCE_AUTHORITY"
        ? "m2_publishing_scale_missing_source_authority"
        : "m2_publishing_scale_missing_required_tool",
    );
    error.capability = inventoryBefore;
    throw error;
  }

  const [config, frozenConfig] = await Promise.all([
    readJson(path.join(resolvedRoot, CONFIG_PATH)),
    readJson(path.join(resolvedRoot, FROZEN_CONFIG_PATH)),
  ]);
  const runId = preparationRunId(preflight.head);
  const runRelativeDirectory = path.posix.join(
    config.privateOutputs.preparationDirectory.replaceAll("\\", "/"),
    runId,
  );
  const runDirectory = await createM2PublishingScalePreparationDirectory({
    root: resolvedRoot,
    preparationDirectory: config.privateOutputs.preparationDirectory,
    runId,
  });

  const v22 = runNode(resolvedRoot, [
    "--max-old-space-size=8192",
    "scripts/m2-current/run_m2_evaluation_v2_frozen_rescore.mjs",
    "--rescore-v2-2",
    `--private-output-directory=${runRelativeDirectory}`,
  ]);
  const v22Result = lastJsonLine(v22.stdout);
  if (
    v22Result.status
      !== "M2_EVALUATION_V2_2_ACTIVE_FOR_DEVELOPMENT_WITH_DISCLOSED_RESIDUAL_EXCLUSION"
  ) {
    throw new Error("m2_publishing_scale_v2_2_rebuild_incomplete");
  }

  const materializer = runNode(resolvedRoot, [
    "scripts/run-codex-python.mjs",
    "scripts/m2-current/materialize_human_anchored_cases.py",
    "--publishing-scale-prepare",
    "--output-directory",
    runRelativeDirectory,
  ]);
  lastJsonLine(materializer.stdout);

  const sourceDirectory = path.join(
    resolvedRoot,
    config.privateOutputs.historicalSourceDirectory,
  );
  const copiedFiles = {
    baseMaterializationManifest:
      "M2-current-human-anchored-manifest-private-v0.1.json",
    learnedGlobalEvaluation: frozenConfig.privateOutputs.evaluation,
    learnedGlobalEvaluationManifest:
      frozenConfig.privateOutputs.evaluationManifest,
  };
  await Promise.all(Object.values(copiedFiles).map((filename) =>
    copyFile(path.join(sourceDirectory, filename), path.join(runDirectory, filename))
  ));

  const preparedFiles = {
    primaryMonthlyCases: config.privateOutputs.primaryMonthlyCases,
    auxiliaryMonthlyCases: config.privateOutputs.auxiliaryMonthlyCases,
    materializationManifest: config.privateOutputs.materializationManifest,
    ...copiedFiles,
    reversalScopeReconciliation: RECONCILIATION_FILE,
    reversalAllocationLedger: ALLOCATION_FILE,
    reversalExecutionReceipt: REVERSAL_RECEIPT_FILE,
  };
  const normalizedContentDigests = Object.fromEntries(await Promise.all(
    Object.entries(preparedFiles).map(async ([role, filename]) => [
      role,
      await sha256File(path.join(runDirectory, filename)),
    ]),
  ));
  const materialization = await readJson(path.join(
    runDirectory,
    preparedFiles.materializationManifest,
  ));
  const reversalReceipt = await readJson(path.join(
    runDirectory,
    preparedFiles.reversalExecutionReceipt,
  ));
  const receipt = {
    schema:
      "m2.current.publishing_scale_channel_derived_rebuild_receipt.private.v0.1",
    tracked: false,
    status: "COMPLETE",
    runId,
    exactHead: preflight.head,
    modelId: config.modelId,
    experimentArmId: config.experimentArmId,
    candidateId: "M2-CHAN-PSC01-RAW",
    preparationCommand:
      "npm run prepare:m2:current:publishing-scale-channel",
    sourceAuthorityStatus: inventoryBefore.sourceAuthorityStatus,
    derivedCacheStatusBefore: inventoryBefore.derivedCacheStatus,
    historicalReceiptStatusBefore: inventoryBefore.historicalReceiptStatus,
    rebuildPlan: inventoryBefore.rebuildPlan,
    actualDefinitionId: reversalReceipt.actualDefinitionId,
    preparedFiles,
    normalizedContentDigests,
    materialization: {
      primaryPackedRowCount: materialization.primaryPackedRowCount,
      auxiliaryPackedRowCount: materialization.auxiliaryPackedRowCount,
      monthlyLabelRowCount: materialization.monthlyLabelRowCount,
    },
    reversal: {
      status: reversalReceipt.status,
      originAfterCutoffRowsUsed:
        reversalReceipt.labels.originAfterCutoffRowsUsed,
    },
    candidateFitStarted: false,
    predictionRowsProduced: 0,
    evaluationRowsProduced: 0,
    finalHoldoutOpened: false,
    productionModified: false,
  };
  const receiptPath = path.join(
    runDirectory,
    config.privateOutputs.preparationReceipt,
  );
  await writeFile(
    receiptPath,
    JSON.stringify(receipt, null, 2) + "\n",
    { encoding: "utf8", flag: "wx" },
  );
  await mirrorCurrentPreparedCache({
    root: resolvedRoot,
    config,
    runDirectory,
    preparedFiles,
    receiptPath,
  });

  const inventoryAfter = evaluateCapability(catalog, CAPABILITY_ID, {
    repoRoot: resolvedRoot,
  });
  if (
    inventoryAfter.sourceAuthorityStatus !== "SOURCE_AUTHORITY_AVAILABLE"
    || inventoryAfter.derivedCacheStatus !== "CACHE_READY"
    || inventoryAfter.safeToStartModelAfterRebuild !== true
  ) {
    throw new Error("m2_publishing_scale_rebuilt_capability_not_ready");
  }
  const result = {
    status: "DERIVED_CACHE_REBUILT_READY_FOR_MODEL",
    modelId: config.modelId,
    experimentArmId: config.experimentArmId,
    runId,
    sourceAuthorityStatus: inventoryAfter.sourceAuthorityStatus,
    derivedCacheStatus: inventoryAfter.derivedCacheStatus,
    historicalReceiptStatus: inventoryAfter.historicalReceiptStatus,
    safeToStartModelAfterRebuild:
      inventoryAfter.safeToStartModelAfterRebuild,
    primaryPackedRowCount: materialization.primaryPackedRowCount,
    strictPackedRowCount: materialization.auxiliaryPackedRowCount,
    candidateFitStarted: false,
    predictionRowsProduced: 0,
    evaluationRowsProduced: 0,
  };
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return { ...result, runDirectory, receipt };
}

export async function createM2PublishingScalePreparationDirectory({
  root,
  preparationDirectory,
  runId,
}) {
  if (
    typeof runId !== "string"
    || !/^[a-zA-Z0-9._-]+$/u.test(runId)
    || runId === "."
    || runId === ".."
  ) {
    throw new Error("m2_publishing_scale_preparation_run_id_invalid");
  }
  const directory = resolvePrivateOutputDirectory(
    root,
    path.posix.join(preparationDirectory.replaceAll("\\", "/"), runId),
  );
  await mkdir(path.dirname(directory), { recursive: true });
  await mkdir(directory, { recursive: false });
  return directory;
}

export async function findLatestM2PublishingScalePreparation({
  root = ROOT,
  exactHead,
} = {}) {
  const config = await readJson(path.join(root, CONFIG_PATH));
  const preparationRoot = resolvePrivateOutputDirectory(
    root,
    config.privateOutputs.preparationDirectory,
  );
  let entries;
  try {
    entries = await readdir(preparationRoot, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const directory = path.join(preparationRoot, entry.name);
    const receiptPath = path.join(
      directory,
      config.privateOutputs.preparationReceipt,
    );
    try {
      const receipt = await readJson(receiptPath);
      if (
        receipt.status === "COMPLETE"
        && receipt.exactHead === exactHead
        && receipt.modelId === "M2-CHAN-PSC01"
      ) {
        candidates.push({ directory, receipt, mtimeMs: (await stat(receiptPath)).mtimeMs });
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs);
  const selected = candidates[0] ?? null;
  if (selected === null) return null;
  await verifyPreparedFiles(selected.directory, selected.receipt);
  return selected;
}

async function verifyPreparedFiles(directory, receipt) {
  for (const [role, filename] of Object.entries(receipt.preparedFiles ?? {})) {
    if (path.basename(filename) !== filename) {
      throw new Error(`m2_publishing_scale_prepared_filename_invalid:${role}`);
    }
    const actual = await sha256File(path.join(directory, filename));
    if (actual !== receipt.normalizedContentDigests?.[role]) {
      throw new Error(`m2_publishing_scale_prepared_digest_mismatch:${role}`);
    }
  }
}

async function mirrorCurrentPreparedCache({
  root,
  config,
  runDirectory,
  preparedFiles,
  receiptPath,
}) {
  const currentDirectory = resolvePrivateOutputDirectory(
    root,
    config.privateOutputs.preparationCurrentDirectory,
  );
  await mkdir(currentDirectory, { recursive: true });
  await Promise.all([
    ...Object.values(preparedFiles).map((filename) =>
      copyFile(path.join(runDirectory, filename), path.join(currentDirectory, filename))
    ),
    copyFile(
      receiptPath,
      path.join(currentDirectory, config.privateOutputs.preparationReceipt),
    ),
  ]);
}

function preparationRunId(head) {
  const timestamp = new Date().toISOString().replaceAll(/[-:.TZ]/gu, "");
  return `${head.slice(0, 12)}-${timestamp}-${process.pid}`;
}

function resolvePrivateOutputDirectory(root, relativePath) {
  if (!relativePath || path.isAbsolute(relativePath)) {
    throw new Error("m2_publishing_scale_private_output_directory_invalid");
  }
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  const relative = path.relative(resolvedRoot, resolved).replaceAll("\\", "/");
  if (
    relative === ".."
    || relative.startsWith("../")
    || !relative.startsWith("data/private-output/")
  ) {
    throw new Error("m2_publishing_scale_private_output_directory_escapes_root");
  }
  return resolved;
}

function runNode(root, args) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const error = new Error(
      `${result.stderr || result.stdout || "private preparation failed"}`.trim(),
    );
    error.code = "m2_publishing_scale_cache_rebuild_failed";
    throw error;
  }
  return result;
}

function lastJsonLine(value) {
  const lines = String(value ?? "").trim().split(/\r?\n/u).reverse();
  for (const line of lines) {
    try {
      return JSON.parse(line);
    } catch {
      // Continue past progress messages.
    }
  }
  throw new Error("m2_publishing_scale_preparation_result_missing");
}

async function sha256File(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  try {
    await prepareM2PublishingScaleDerivedCaches();
  } catch (error) {
    process.stderr.write(
      `[M2_PUBLISHING_SCALE_PREPARE_ERROR] ${error.message}\n`,
    );
    process.exitCode = 1;
  }
}
