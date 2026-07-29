import crypto from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile
} from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

import {
  buildM2CoreLegacySameCaseEvaluation,
  validateM2CoreLegacyHorizonRouterConfig
} from "../../src/domain/m2Current/coreLegacyHorizonRouter.js";
import {
  buildCoreLegacyWorkCases,
  validateM2CoreLegacyPopulationConfig
} from "../../src/domain/m2Current/coreLegacyPopulation.js";
import {
  materializeM2CoreRevenueAuthority
} from "./core_revenue_manual_private.mjs";
import {
  deduplicateFrozenRows,
  rebuildFrozenCoreRevenueManualRows,
  rebuildFrozenLearnedGlobalRows,
  rebuildFrozenOccurrenceAmountRows,
  verifyCoreLegacyStagePreflight
} from "./core_legacy_population_private.mjs";
import {
  renderM2CoreLegacySameCaseReport
} from "./core_legacy_horizon_router_mode.mjs";

const CONFIG_PATH =
  "config/m2-current-core-legacy-horizon-router.v0.1.json";
const BASE_CONFIG_PATH =
  "config/m2-current-core-legacy-population.v0.1.json";
const HUMAN_HISTORIES =
  "data/private-output/m2-current-human-anchored/"
  + "M2-current-human-anchored-histories-private-v0.1.ndjson";
const HUMAN_EVALUATION =
  "data/private-output/m2-current-human-anchored/"
  + "M2-current-human-anchored-evaluation-private-v0.1.ndjson";
const HUMAN_PUBLIC_EVALUATION =
  "docs/analysis/m2-current/"
  + "M2-current-human-anchored-development-v0.1.json";
const OCCURRENCE_AMOUNT_EVALUATION =
  "data/private-output/m2-current-quality/"
  + "M2-current-occurrence-amount-candidate-cases-private-v0.3.ndjson";

export async function runM2CoreLegacyFullHorizonSameCaseRescore({
  root
}) {
  const [config, baseConfig] = await Promise.all([
    readJson(path.join(root, CONFIG_PATH)),
    readJson(path.join(root, BASE_CONFIG_PATH))
  ]);
  validateM2CoreLegacyHorizonRouterConfig(config);
  validateM2CoreLegacyPopulationConfig(baseConfig);
  const privateDirectory = path.join(
    root,
    config.privateOutputs.directory
  );
  await mkdir(privateDirectory, { recursive: true });
  const receiptPath = path.join(
    privateDirectory,
    config.privateOutputs.receipt
  );
  const priorReceipt = await readJsonIfPresent(receiptPath);
  if (
    priorReceipt?.status
      === "VALID_K1_FULL_HORIZON_SAME_CASE_RESCORE_COMPLETE"
    || priorReceipt?.validSameCaseEvaluationProduced === true
  ) {
    throw new Error(
      "m2_core_legacy_horizon_router_k1_already_executed"
    );
  }
  let preflight = null;
  let validEvaluationProduced = false;
  try {
    preflight = verifyCoreLegacyStagePreflight(root, {
      stage: "HORIZON_ROUTER_K1_SAME_CASE_RESCORE",
      allowedDirtyPaths: []
    });
    await writeFile(receiptPath, `${JSON.stringify({
      schema:
        "m2.current.core_legacy_horizon_router.run_receipt.private.v0.1",
      stage: "K1_FULL_HORIZON_SAME_CASE_FROZEN_RESCORE",
      status: "K1_EXECUTION_STARTED",
      evaluationHead: preflight.head,
      exactHeadCiRunId: preflight.ciRunId,
      validSameCaseEvaluationProduced: false,
      retryAllowed: true
    }, null, 2)}\n`, "utf8");

    const rebuilt = await rebuildAndVerifyFrozenRows({
      root,
      config,
      baseConfig
    });
    const evaluation = buildM2CoreLegacySameCaseEvaluation(
      rebuilt.rows,
      config,
      {
        evaluationHead: preflight.head,
        exactHeadCiRunId: preflight.ciRunId
      }
    );
    const publicResult = {
      ...evaluation.publicResult,
      replayVerification: rebuilt.audit
    };
    assertK1PublicSafe(publicResult);
    validEvaluationProduced = true;

    const privateRowsPath = path.join(
      privateDirectory,
      config.privateOutputs.sameCaseRows
    );
    await writeNdjson(privateRowsPath, evaluation.privateRows);
    const manifestPath = path.join(
      privateDirectory,
      config.privateOutputs.manifest
    );
    await writeFile(manifestPath, `${JSON.stringify({
      schema:
        "m2.current.core_legacy_horizon_router.manifest.private.v0.1",
      status: "VALID_K1_FULL_HORIZON_SAME_CASE_RESCORE_COMPLETE",
      experimentId: config.experiment.stableExperimentId,
      evaluationHead: preflight.head,
      exactHeadCiRunId: preflight.ciRunId,
      finalDocumentationHead: null,
      stages: {
        K0_CAPABILITY_MATRIX: "COMPLETE",
        K1_FULL_HORIZON_SAME_CASE_RESCORE: "COMPLETE",
        K2_HORIZON_ROUTER: "NOT_EXECUTED",
        K3_CHANNEL_ALLOCATION: "NOT_EXECUTED"
      },
      replayVerification: rebuilt.audit,
      privateSameCaseRowCount: evaluation.privateRows.length,
      outputBindings: {
        sameCaseRows: await fileBinding(privateRowsPath)
      },
      privateIdentityPublished: false
    }, null, 2)}\n`, "utf8");
    await writePublicK1Outputs({ root, config, publicResult });
    await writeFile(receiptPath, `${JSON.stringify({
      schema:
        "m2.current.core_legacy_horizon_router.run_receipt.private.v0.1",
      stage: "K1_FULL_HORIZON_SAME_CASE_FROZEN_RESCORE",
      status: "VALID_K1_FULL_HORIZON_SAME_CASE_RESCORE_COMPLETE",
      evaluationHead: preflight.head,
      exactHeadCiRunId: preflight.ciRunId,
      exactHeadCiUrl: preflight.ciUrl,
      linuxCi: preflight.linux,
      windowsCi: preflight.windows,
      command:
        "npm run rescore:m2:current:core-legacy-horizon-router",
      validSameCaseEvaluationProduced: true,
      executionCount: 1,
      modelTrainingPerformed: false,
      modelParametersChanged: false,
      parameterGridChanged: false,
      crossHorizonParameterCopyPerformed: false,
      fallbackChanged: false,
      laterOriginRead: false,
      finalHoldoutRead: false,
      productionChanged: false,
      manifestSha256: await sha256File(manifestPath)
    }, null, 2)}\n`, "utf8");
    return publicResult;
  } catch (error) {
    if (!validEvaluationProduced) {
      await writeFile(receiptPath, `${JSON.stringify({
        schema:
          "m2.current.core_legacy_horizon_router.run_receipt.private.v0.1",
        stage: "K1_FULL_HORIZON_SAME_CASE_FROZEN_RESCORE",
        status: "INVALIDATED_K1_EXECUTION_RETRY_ALLOWED",
        evaluationHead: preflight?.head ?? null,
        exactHeadCiRunId: preflight?.ciRunId ?? null,
        errorCode: safeErrorCode(error),
        validSameCaseEvaluationProduced: false,
        retryAllowed: true,
        modelTrainingPerformed: false
      }, null, 2)}\n`, "utf8");
    }
    throw error;
  }
}

async function rebuildAndVerifyFrozenRows({
  root,
  config,
  baseConfig
}) {
  const authority = await materializeM2CoreRevenueAuthority({ root });
  const featureCache = new Map();
  const featureRows = (origin) => {
    if (!featureCache.has(origin)) {
      featureCache.set(
        origin,
        authority.featureMonthlyRowsForOrigin(origin)
      );
    }
    return featureCache.get(origin);
  };
  const cases = buildCoreLegacyWorkCases({
    origins: authority.legalOrigins,
    horizons: baseConfig.evaluation.horizonsMonths,
    finalMonthlyRows: authority.finalMonthlyRows,
    featureMonthlyRowsForOrigin: featureRows,
    config: baseConfig
  });
  const workCaseIndex = new Map(cases.workCases.map((row) => [
    frozenWorkKey(row),
    row
  ]));
  const channelCasesByWork = groupByValues(
    cases.channelCases,
    frozenWorkKey
  );
  const channelCaseIndex = new Map(cases.channelCases.map((row) => [
    frozenChannelKey(row),
    row
  ]));
  const [humanPublic, humanHistories, humanEvaluations, occurrenceRows] =
    await Promise.all([
      readJson(path.join(root, HUMAN_PUBLIC_EVALUATION)),
      readNdjson(path.join(root, HUMAN_HISTORIES)),
      readNdjson(path.join(root, HUMAN_EVALUATION)),
      readNdjson(path.join(root, OCCURRENCE_AMOUNT_EVALUATION))
    ]);
  const filteredHumanEvaluations = humanEvaluations.filter(
    (row) => ["primary", "strict_auxiliary"].includes(
      row.evaluationFamily
    )
  );
  const historyIndex = new Map(humanHistories.map((row) => [
    `${row.origin}\u0000${row.standardWorkId}`,
    row
  ]));
  const strictKeys = new Set(filteredHumanEvaluations
    .filter((row) => row.evaluationFamily === "strict_auxiliary")
    .map(frozenWorkKey));
  const learnedGlobal = rebuildFrozenLearnedGlobalRows({
    config: baseConfig,
    humanPublic,
    humanEvaluations: filteredHumanEvaluations,
    historyIndex,
    workCaseIndex,
    channelCasesByWork
  });
  const occurrence = rebuildFrozenOccurrenceAmountRows({
    config: baseConfig,
    occurrenceRows,
    strictKeys,
    workCaseIndex
  });
  const primaryKeys = new Set([
    ...occurrence.sourceKeys,
    ...learnedGlobal.primarySourceKeys
  ]);
  const coreRevenueManual = rebuildFrozenCoreRevenueManualRows({
    config: baseConfig,
    origins: authority.legalOrigins,
    featureRows,
    authorityStartMonth: authority.authorityStartMonth,
    primaryKeys,
    strictKeys,
    channelCaseIndex
  });
  const rebuiltRows = deduplicateFrozenRows([
    ...occurrence.rows,
    ...learnedGlobal.rows,
    ...coreRevenueManual.rows
  ]);
  const cachePath = path.join(
    root,
    baseConfig.privateOutputs.directory,
    baseConfig.privateOutputs.frozenRescoreRows
  );
  let cacheRows;
  let cacheStatus;
  try {
    cacheRows = await readNdjson(cachePath);
    cacheStatus = "FROZEN_AVAILABLE";
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    cacheRows = null;
    cacheStatus = "CACHE_MISS_REBUILT";
  }
  let comparison = {
    rowCountDifference: 0,
    missingRebuiltRowCount: 0,
    extraRebuiltRowCount: 0,
    maximumAbsolutePredictionDifference: 0,
    maximumAbsoluteActualDifference: 0
  };
  if (cacheRows !== null) {
    comparison = compareFrozenRows(cacheRows, rebuiltRows);
    if (
      comparison.rowCountDifference !== 0
      || comparison.missingRebuiltRowCount !== 0
      || comparison.extraRebuiltRowCount !== 0
      || comparison.maximumAbsolutePredictionDifference !== 0
      || comparison.maximumAbsoluteActualDifference !== 0
    ) {
      throw new Error(
        "m2_core_legacy_horizon_router_frozen_replay_mismatch"
      );
    }
  } else {
    await mkdir(path.dirname(cachePath), { recursive: true });
    await writeNdjson(cachePath, rebuiltRows);
  }
  return {
    rows: rebuiltRows,
    audit: {
      status: cacheStatus === "FROZEN_AVAILABLE"
        ? "FROZEN_CACHE_VERIFIED_BY_EXACT_DETERMINISTIC_REPLAY"
        : "MISSING_DERIVED_CACHE_AUTOMATICALLY_REBUILT",
      sourceStatus: "SOURCE_AUTHORITY_AVAILABLE",
      cacheStatus,
      rowCount: rebuiltRows.length,
      ...comparison,
      maximumAllowedNumericDifference:
        config.deterministicReplayContract.maximumNumericDifference,
      originalFormulaOnly: true,
      originalParametersOnly: true,
      parameterGridChanged: false,
      crossHorizonParameterCopyPerformed: false,
      publicAggregateInferencePerformed: false
    }
  };
}

function compareFrozenRows(cachedRows, rebuiltRows) {
  const cached = new Map(cachedRows.map((row) => [
    frozenRowIdentity(row),
    row
  ]));
  const rebuilt = new Map(rebuiltRows.map((row) => [
    frozenRowIdentity(row),
    row
  ]));
  let missingRebuiltRowCount = 0;
  let extraRebuiltRowCount = 0;
  let maximumAbsolutePredictionDifference = 0;
  let maximumAbsoluteActualDifference = 0;
  for (const [key, row] of cached) {
    const other = rebuilt.get(key);
    if (!other) {
      missingRebuiltRowCount += 1;
      continue;
    }
    maximumAbsolutePredictionDifference = Math.max(
      maximumAbsolutePredictionDifference,
      Math.abs(Number(row.pointEstimate) - Number(other.pointEstimate))
    );
    maximumAbsoluteActualDifference = Math.max(
      maximumAbsoluteActualDifference,
      Math.abs(Number(row.actual) - Number(other.actual))
    );
  }
  for (const key of rebuilt.keys()) {
    if (!cached.has(key)) extraRebuiltRowCount += 1;
  }
  return {
    rowCountDifference: rebuiltRows.length - cachedRows.length,
    missingRebuiltRowCount,
    extraRebuiltRowCount,
    maximumAbsolutePredictionDifference,
    maximumAbsoluteActualDifference
  };
}

function frozenRowIdentity(row) {
  return [
    row.modelId,
    row.evaluationFamily,
    row.populationId,
    row.grain,
    row.caseKey
  ].join("\u0000");
}

function frozenWorkKey(row) {
  return [
    String(row.origin),
    String(row.standardWorkId),
    String(Number(row.horizonMonths))
  ].join("\u0000");
}

function frozenChannelKey(row) {
  return `${frozenWorkKey(row)}\u0000${String(row.channelUid)}`;
}

function groupByValues(values, keyOf) {
  const result = new Map();
  for (const value of values) {
    const key = keyOf(value);
    const group = result.get(key) ?? [];
    group.push(value);
    result.set(key, group);
  }
  return result;
}

async function writePublicK1Outputs({ root, config, publicResult }) {
  const jsonPath = path.join(root, config.publicOutputs.sameCaseJson);
  const reportPath = path.join(
    root,
    config.publicOutputs.sameCaseReport
  );
  await Promise.all([
    writeFile(jsonPath, `${JSON.stringify(publicResult, null, 2)}\n`, "utf8"),
    writeFile(
      reportPath,
      renderM2CoreLegacySameCaseReport(publicResult),
      "utf8"
    )
  ]);
}

function assertK1PublicSafe(value) {
  const serialized = JSON.stringify(value);
  for (const forbidden of [
    "\"standardWorkId\":",
    "\"channelUid\":",
    "\"caseKey\":",
    "data/private-input",
    "data/private-output"
  ]) {
    if (serialized.includes(forbidden)) {
      throw new Error(
        `m2_core_legacy_horizon_router_k1_privacy_boundary:${forbidden}`
      );
    }
  }
}

async function readNdjson(filePath) {
  const rows = [];
  const input = fs.createReadStream(filePath, { encoding: "utf8" });
  const lines = readline.createInterface({
    input,
    crlfDelay: Number.POSITIVE_INFINITY
  });
  for await (const line of lines) {
    if (line.trim() !== "") rows.push(JSON.parse(line));
  }
  return rows;
}

async function writeNdjson(filePath, rows) {
  await writeFile(
    filePath,
    rows.length > 0
      ? `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`
      : "",
    "utf8"
  );
}

async function fileBinding(filePath) {
  const stats = await fs.promises.stat(filePath);
  return {
    relativePath: path.basename(filePath),
    byteCount: stats.size,
    sha256: await sha256File(filePath)
  };
}

async function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  const input = fs.createReadStream(filePath);
  for await (const chunk of input) hash.update(chunk);
  return hash.digest("hex");
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readJsonIfPresent(filePath) {
  try {
    return await readJson(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function safeErrorCode(error) {
  return String(error?.code ?? error?.message ?? "UNKNOWN")
    .replace(/[^A-Za-z0-9_.:-]/gu, "_")
    .slice(0, 200);
}
