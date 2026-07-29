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
  buildM2CoreLegacyRollingHorizonRouter,
  buildM2CoreLegacySameCaseEvaluation,
  validateM2CoreLegacyHorizonRouterConfig
} from "../../src/domain/m2Current/coreLegacyHorizonRouter.js";
import {
  buildCoreLegacyOriginPopulation,
  buildCoreLegacyWorkCases,
  validateM2CoreLegacyPopulationConfig
} from "../../src/domain/m2Current/coreLegacyPopulation.js";
import {
  buildM2CoreLegacyObservedChannelAllocation
} from "../../src/domain/m2Current/coreLegacyChannelAllocation.js";
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
  renderM2CoreLegacyChannelAllocationReport,
  renderM2CoreLegacyHorizonRouterReport,
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

export async function runM2CoreLegacyRollingHorizonRouter({ root }) {
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
  const manifestPath = path.join(
    privateDirectory,
    config.privateOutputs.manifest
  );
  const [priorReceipt, priorManifest, k1Public] = await Promise.all([
    readJsonIfPresent(receiptPath),
    readJsonIfPresent(manifestPath),
    readJson(path.join(root, config.publicOutputs.sameCaseJson))
  ]);
  if (
    priorReceipt?.status
      === "VALID_K2_ROLLING_HORIZON_ROUTER_COMPLETE"
    || priorReceipt?.validRouterEvaluationProduced === true
    || priorManifest?.stages?.K2_HORIZON_ROUTER === "COMPLETE"
  ) {
    throw new Error(
      "m2_core_legacy_horizon_router_k2_already_executed"
    );
  }
  if (
    k1Public?.status
      !== "K1_FULL_HORIZON_SAME_CASE_FROZEN_RESCORE_COMPLETE"
    || typeof k1Public?.evaluationHead !== "string"
    || k1Public.evaluationHead.length !== 40
    || priorManifest?.stages?.K1_FULL_HORIZON_SAME_CASE_RESCORE
      !== "COMPLETE"
  ) {
    throw new Error(
      "m2_core_legacy_horizon_router_k1_evidence_required"
    );
  }
  let preflight = null;
  let validRouterEvaluationProduced = false;
  try {
    preflight = verifyCoreLegacyStagePreflight(root, {
      stage: "HORIZON_ROUTER_K2_ROLLING_INNER_SELECTION",
      allowedDirtyPaths: []
    });
    await writeFile(receiptPath, `${JSON.stringify({
      schema:
        "m2.current.core_legacy_horizon_router.run_receipt.private.v0.1",
      stage: "K2_ROLLING_HORIZON_ROUTER",
      status: "K2_EXECUTION_STARTED",
      evaluationHead: k1Public.evaluationHead,
      routerExecutionHead: preflight.head,
      exactHeadCiRunId: preflight.ciRunId,
      k1ValidEvidencePreserved: true,
      validRouterEvaluationProduced: false,
      retryAllowed: true
    }, null, 2)}\n`, "utf8");

    const rebuilt = await rebuildAndVerifyFrozenRows({
      root,
      config,
      baseConfig
    });
    const evaluation = buildM2CoreLegacyRollingHorizonRouter(
      rebuilt.rows,
      config,
      {
        evaluationHead: k1Public.evaluationHead,
        routerExecutionHead: preflight.head,
        exactHeadCiRunId: preflight.ciRunId
      }
    );
    assertK2PublicSafe(evaluation.publicResult);
    validRouterEvaluationProduced = true;

    const routerRowsPath = path.join(
      privateDirectory,
      config.privateOutputs.routerRows
    );
    await writeNdjson(routerRowsPath, [
      ...evaluation.selectionRows,
      ...evaluation.predictionRows
    ]);
    await writeFile(manifestPath, `${JSON.stringify({
      ...priorManifest,
      schema:
        "m2.current.core_legacy_horizon_router.manifest.private.v0.1",
      status: "VALID_K2_ROLLING_HORIZON_ROUTER_COMPLETE",
      experimentId: config.experiment.stableExperimentId,
      evaluationHead: k1Public.evaluationHead,
      routerExecutionHead: preflight.head,
      routerExactHeadCiRunId: preflight.ciRunId,
      finalDocumentationHead: null,
      stages: {
        ...(priorManifest?.stages ?? {}),
        K0_CAPABILITY_MATRIX: "COMPLETE",
        K1_FULL_HORIZON_SAME_CASE_RESCORE: "COMPLETE",
        K2_HORIZON_ROUTER: "COMPLETE",
        K3_CHANNEL_ALLOCATION: "NOT_EXECUTED"
      },
      replayVerification: rebuilt.audit,
      privateRouterSelectionRowCount: evaluation.selectionRows.length,
      privateRouterPredictionRowCount: evaluation.predictionRows.length,
      outputBindings: {
        ...(priorManifest?.outputBindings ?? {}),
        routerRows: await fileBinding(routerRowsPath)
      },
      privateIdentityPublished: false
    }, null, 2)}\n`, "utf8");
    await writePublicK2Outputs({
      root,
      config,
      publicResult: evaluation.publicResult
    });
    await writeFile(receiptPath, `${JSON.stringify({
      schema:
        "m2.current.core_legacy_horizon_router.run_receipt.private.v0.1",
      stage: "K2_ROLLING_HORIZON_ROUTER",
      status: "VALID_K2_ROLLING_HORIZON_ROUTER_COMPLETE",
      evaluationHead: k1Public.evaluationHead,
      routerExecutionHead: preflight.head,
      exactHeadCiRunId: preflight.ciRunId,
      exactHeadCiUrl: preflight.ciUrl,
      linuxCi: preflight.linux,
      windowsCi: preflight.windows,
      command:
        "npm run develop:m2:current:core-legacy-horizon-router",
      k1ValidEvidencePreserved: true,
      validRouterEvaluationProduced: true,
      executionCount: 1,
      modelTrainingPerformed: false,
      modelParametersChanged: false,
      routingThresholdsChangedAfterResult: false,
      currentOuterActualReadForSelection: false,
      posthocReferenceUsedForSelection: false,
      fallbackChanged: false,
      laterOriginRead: false,
      finalHoldoutRead: false,
      productionChanged: false,
      manifestSha256: await sha256File(manifestPath)
    }, null, 2)}\n`, "utf8");
    return evaluation.publicResult;
  } catch (error) {
    if (!validRouterEvaluationProduced) {
      await writeFile(receiptPath, `${JSON.stringify({
        schema:
          "m2.current.core_legacy_horizon_router.run_receipt.private.v0.1",
        stage: "K2_ROLLING_HORIZON_ROUTER",
        status: "INVALIDATED_K2_EXECUTION_RETRY_ALLOWED",
        evaluationHead: k1Public.evaluationHead,
        routerExecutionHead: preflight?.head ?? null,
        exactHeadCiRunId: preflight?.ciRunId ?? null,
        errorCode: safeErrorCode(error),
        k1ValidEvidencePreserved: true,
        validRouterEvaluationProduced: false,
        retryAllowed: true,
        modelTrainingPerformed: false
      }, null, 2)}\n`, "utf8");
    }
    throw error;
  }
}

export async function runM2CoreLegacyObservedChannelAllocation({ root }) {
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
  const manifestPath = path.join(
    privateDirectory,
    config.privateOutputs.manifest
  );
  const [
    priorReceipt,
    priorManifest,
    k1Public,
    k2Public
  ] = await Promise.all([
    readJsonIfPresent(receiptPath),
    readJsonIfPresent(manifestPath),
    readJson(path.join(root, config.publicOutputs.sameCaseJson)),
    readJson(path.join(root, config.publicOutputs.routerJson))
  ]);
  if (
    priorReceipt?.status
      === "VALID_K3_OBSERVED_CHANNEL_ALLOCATION_COMPLETE"
    || priorReceipt?.validChannelAllocationEvaluationProduced === true
    || priorManifest?.stages?.K3_CHANNEL_ALLOCATION === "COMPLETE"
  ) {
    throw new Error(
      "m2_core_legacy_horizon_router_k3_already_executed"
    );
  }
  if (
    priorReceipt?.status !== "VALID_K2_ROLLING_HORIZON_ROUTER_COMPLETE"
    || priorReceipt?.validRouterEvaluationProduced !== true
    || priorManifest?.stages?.K1_FULL_HORIZON_SAME_CASE_RESCORE
      !== "COMPLETE"
    || priorManifest?.stages?.K2_HORIZON_ROUTER !== "COMPLETE"
    || k1Public?.status
      !== "K1_FULL_HORIZON_SAME_CASE_FROZEN_RESCORE_COMPLETE"
    || k2Public?.status !== "K2_ROLLING_HORIZON_ROUTER_COMPLETE"
    || priorManifest?.evaluationHead !== k1Public.evaluationHead
    || priorManifest?.routerExecutionHead
      !== k2Public.routerExecutionHead
  ) {
    throw new Error(
      "m2_core_legacy_horizon_router_k1_k2_evidence_required"
    );
  }
  let preflight = null;
  let validChannelAllocationEvaluationProduced = false;
  try {
    preflight = verifyCoreLegacyStagePreflight(root, {
      stage: "HORIZON_ROUTER_K3_OBSERVED_CHANNEL_ALLOCATION",
      allowedDirtyPaths: []
    });
    await writeFile(receiptPath, `${JSON.stringify({
      schema:
        "m2.current.core_legacy_horizon_router.run_receipt.private.v0.1",
      stage: "K3_OBSERVED_CHANNEL_ALLOCATION",
      status: "K3_EXECUTION_STARTED",
      evaluationHead: k1Public.evaluationHead,
      routerExecutionHead: k2Public.routerExecutionHead,
      allocationExecutionHead: preflight.head,
      exactHeadCiRunId: preflight.ciRunId,
      k1ValidEvidencePreserved: true,
      k2ValidEvidencePreserved: true,
      validChannelAllocationEvaluationProduced: false,
      retryAllowed: true
    }, null, 2)}\n`, "utf8");

    const rebuilt = await rebuildAndVerifyFrozenRows({
      root,
      config,
      baseConfig
    });
    const routerCache = await loadOrRebuildRouterRows({
      root,
      config,
      frozenRows: rebuilt.rows,
      k1Public,
      k2Public,
      priorManifest
    });
    const allocationCases = buildAllocationInputCases({
      frozenRows: rebuilt.rows,
      routerPredictionRows: routerCache.predictionRows,
      privateContext: rebuilt.privateContext,
      config,
      baseConfig
    });
    const evaluation = buildM2CoreLegacyObservedChannelAllocation(
      allocationCases,
      config,
      {
        evaluationHead: k1Public.evaluationHead,
        routerExecutionHead: k2Public.routerExecutionHead,
        allocationExecutionHead: preflight.head,
        exactHeadCiRunId: preflight.ciRunId,
        sameCaseEvidenceStatus: k1Public.sameCaseEvidenceStatus,
        horizonRouterStatus: k2Public.horizonRouterStatus
      }
    );
    assertK3PublicSafe(evaluation.publicResult);
    validChannelAllocationEvaluationProduced = true;

    const allocationRowsPath = path.join(
      privateDirectory,
      config.privateOutputs.allocationRows
    );
    await writeNdjson(allocationRowsPath, evaluation.privateRows);
    const attemptCount = evaluation.privateRows.filter(
      (row) => row.schema
        === "m2.current.core_legacy_channel_allocation_attempt.private.v0.1"
    ).length;
    const channelRowCount = evaluation.privateRows.length - attemptCount;
    await writeFile(manifestPath, `${JSON.stringify({
      ...priorManifest,
      schema:
        "m2.current.core_legacy_horizon_router.manifest.private.v0.1",
      status: "VALID_K3_OBSERVED_CHANNEL_ALLOCATION_COMPLETE",
      experimentId: config.experiment.stableExperimentId,
      evaluationHead: k1Public.evaluationHead,
      routerExecutionHead: k2Public.routerExecutionHead,
      allocationExecutionHead: preflight.head,
      allocationExactHeadCiRunId: preflight.ciRunId,
      finalDocumentationHead: null,
      stages: {
        ...(priorManifest?.stages ?? {}),
        K0_CAPABILITY_MATRIX: "COMPLETE",
        K1_FULL_HORIZON_SAME_CASE_RESCORE: "COMPLETE",
        K2_HORIZON_ROUTER: "COMPLETE",
        K3_CHANNEL_ALLOCATION: "COMPLETE"
      },
      replayVerification: rebuilt.audit,
      routerCacheVerification: routerCache.audit,
      privateAllocationAttemptCount: attemptCount,
      privateAllocationChannelRowCount: channelRowCount,
      outputBindings: {
        ...(priorManifest?.outputBindings ?? {}),
        routerRows: await fileBinding(routerCache.routerRowsPath),
        allocationRows: await fileBinding(allocationRowsPath)
      },
      privateIdentityPublished: false
    }, null, 2)}\n`, "utf8");
    await writePublicK3Outputs({
      root,
      config,
      publicResult: evaluation.publicResult
    });
    await writeFile(receiptPath, `${JSON.stringify({
      schema:
        "m2.current.core_legacy_horizon_router.run_receipt.private.v0.1",
      stage: "K3_OBSERVED_CHANNEL_ALLOCATION",
      status: "VALID_K3_OBSERVED_CHANNEL_ALLOCATION_COMPLETE",
      evaluationHead: k1Public.evaluationHead,
      routerExecutionHead: k2Public.routerExecutionHead,
      allocationExecutionHead: preflight.head,
      exactHeadCiRunId: preflight.ciRunId,
      exactHeadCiUrl: preflight.ciUrl,
      linuxCi: preflight.linux,
      windowsCi: preflight.windows,
      command:
        "npm run develop:m2:current:core-legacy-channel-allocation",
      k1ValidEvidencePreserved: true,
      k2ValidEvidencePreserved: true,
      validChannelAllocationEvaluationProduced: true,
      executionCount: 1,
      modelTrainingPerformed: false,
      modelParametersChanged: false,
      allocationWindowsChangedAfterResult: false,
      resultBasedWindowSelectionPerformed: false,
      workTotalPredictionChanged: false,
      futureChannelRevenueReadForShares: false,
      equalSplitFallbackUsed: false,
      operationalFallbackChanged: false,
      laterOriginRead: false,
      finalHoldoutRead: false,
      productionChanged: false,
      manifestSha256: await sha256File(manifestPath)
    }, null, 2)}\n`, "utf8");
    return evaluation.publicResult;
  } catch (error) {
    if (!validChannelAllocationEvaluationProduced) {
      await writeFile(receiptPath, `${JSON.stringify({
        schema:
          "m2.current.core_legacy_horizon_router.run_receipt.private.v0.1",
        stage: "K3_OBSERVED_CHANNEL_ALLOCATION",
        status: "INVALIDATED_K3_EXECUTION_RETRY_ALLOWED",
        evaluationHead: k1Public.evaluationHead,
        routerExecutionHead: k2Public.routerExecutionHead,
        allocationExecutionHead: preflight?.head ?? null,
        exactHeadCiRunId: preflight?.ciRunId ?? null,
        errorCode: safeErrorCode(error),
        k1ValidEvidencePreserved: true,
        k2ValidEvidencePreserved: true,
        validChannelAllocationEvaluationProduced: false,
        retryAllowed: true,
        modelTrainingPerformed: false
      }, null, 2)}\n`, "utf8");
    }
    throw error;
  }
}

async function loadOrRebuildRouterRows({
  root,
  config,
  frozenRows,
  k1Public,
  k2Public,
  priorManifest
}) {
  const routerRowsPath = path.join(
    root,
    config.privateOutputs.directory,
    config.privateOutputs.routerRows
  );
  const priorBinding = priorManifest?.outputBindings?.routerRows;
  try {
    const rows = await readNdjson(routerRowsPath);
    const digest = await sha256File(routerRowsPath);
    const predictionRows = rows.filter((row) => (
      row.schema
        === "m2.current.core_legacy_horizon_router_prediction.private.v0.1"
    ));
    if (
      predictionRows.length > 0
      && typeof priorBinding?.sha256 === "string"
      && digest === priorBinding.sha256
    ) {
      return {
        routerRowsPath,
        predictionRows,
        audit: {
          status: "FROZEN_ROUTER_CACHE_VERIFIED_BY_MANIFEST_DIGEST",
          cacheStatus: "FROZEN_AVAILABLE",
          rowCount: rows.length,
          predictionRowCount: predictionRows.length,
          sha256: digest
        }
      };
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const rebuilt = buildM2CoreLegacyRollingHorizonRouter(
    frozenRows,
    config,
    {
      evaluationHead: k1Public.evaluationHead,
      routerExecutionHead: k2Public.routerExecutionHead,
      exactHeadCiRunId: k2Public.exactHeadCiRunId
    }
  );
  if (
    JSON.stringify(rebuilt.publicResult) !== JSON.stringify(k2Public)
  ) {
    throw new Error(
      "m2_core_legacy_horizon_router_k2_deterministic_rebuild_mismatch"
    );
  }
  const rows = [
    ...rebuilt.selectionRows,
    ...rebuilt.predictionRows
  ];
  await writeNdjson(routerRowsPath, rows);
  return {
    routerRowsPath,
    predictionRows: rebuilt.predictionRows,
    audit: {
      status: "MISSING_OR_INVALID_DERIVED_ROUTER_CACHE_REBUILT",
      cacheStatus: "CACHE_MISS_REBUILT",
      rowCount: rows.length,
      predictionRowCount: rebuilt.predictionRows.length,
      sha256: await sha256File(routerRowsPath),
      frozenK2PublicResultMatchedExactly: true,
      routingThresholdsChanged: false,
      currentOuterActualReadForSelection: false
    }
  };
}

function buildAllocationInputCases({
  frozenRows,
  routerPredictionRows,
  privateContext,
  config,
  baseConfig
}) {
  const populationCache = new Map();
  const populationForOrigin = (origin) => {
    if (!populationCache.has(origin)) {
      const value = buildCoreLegacyOriginPopulation({
        origin,
        monthlyRows:
          privateContext.authority.featureMonthlyRowsForOrigin(origin),
        minimumCompleteMonths:
          baseConfig.eligibility.minimumCompleteMonths,
        thresholds: baseConfig.coreSelection.thresholds,
        topCounts: baseConfig.coreSelection.topDiagnostics
      });
      populationCache.set(origin, value);
    }
    return populationCache.get(origin);
  };
  const channelCasesByWork = groupByValues(
    privateContext.cases.channelCases,
    frozenWorkKey
  );
  const frozenChannelRows = frozenRows.filter((row) => (
    row.grain === "WORK_CHANNEL"
    && ["M2-WORK-LG01", "M2-WORK-CRMR01"].includes(row.modelId)
  ));
  const directChannelIndex = new Map(frozenChannelRows.map((row) => [
    allocationDirectKey(row),
    row
  ]));
  const grouped = new Map();
  for (const row of frozenRows.filter((item) => (
    item.grain === "WORK_TOTAL"
    && config.scope.evaluationFamilies.includes(item.evaluationFamily)
    && config.scope.populations.includes(item.populationId)
    && config.channelAllocation.totalSourceModelIds.includes(item.modelId)
  ))) {
    const key = allocationWorkCellKey(row);
    const value = grouped.get(key) ?? {
      evaluationFamily: row.evaluationFamily,
      populationId: row.populationId,
      origin: row.origin,
      horizonMonths: Number(row.horizonMonths),
      standardWorkId: String(row.standardWorkId),
      actualTotal: Number(row.actual),
      totalPredictions: []
    };
    if (Math.abs(value.actualTotal - Number(row.actual)) > 1e-7) {
      throw new Error(
        "m2_core_legacy_channel_allocation_frozen_actual_mismatch"
      );
    }
    value.totalPredictions.push({
      sourceModelId: row.modelId,
      pointEstimate: Number(row.pointEstimate)
    });
    grouped.set(key, value);
  }
  for (const row of routerPredictionRows.filter((item) => (
    item.grain === "WORK_TOTAL"
    && config.scope.evaluationFamilies.includes(item.evaluationFamily)
    && config.scope.populations.includes(item.populationId)
  ))) {
    const key = allocationWorkCellKey(row);
    const value = grouped.get(key);
    if (!value) {
      throw new Error(
        "m2_core_legacy_channel_allocation_router_case_not_frozen"
      );
    }
    if (Math.abs(value.actualTotal - Number(row.actual)) > 1e-7) {
      throw new Error(
        "m2_core_legacy_channel_allocation_router_actual_mismatch"
      );
    }
    value.totalPredictions.push({
      sourceModelId: config.horizonRouter.modelId,
      pointEstimate: Number(row.pointEstimate)
    });
  }
  const output = [];
  for (const value of grouped.values()) {
    const workKey = [
      value.standardWorkId,
      value.origin,
      String(value.horizonMonths)
    ].join("\u0000");
    const channelCases = channelCasesByWork.get(workKey) ?? [];
    const population = populationForOrigin(value.origin);
    const pairIndex = new Map(population.eligiblePairs.map((pair) => [
      `${pair.standardWorkId}\u0000${pair.channelUid}`,
      pair
    ]));
    const originSerial = monthToSerial(value.origin);
    const channels = channelCases.map((channelCase) => {
      const pair = pairIndex.get(
        `${channelCase.standardWorkId}\u0000${channelCase.channelUid}`
      );
      if (!pair) {
        throw new Error(
          "m2_core_legacy_channel_allocation_mature_pair_missing"
        );
      }
      const directForecasts = {};
      for (const modelId of [
        "M2-WORK-LG01",
        "M2-WORK-CRMR01"
      ]) {
        const direct = directChannelIndex.get(allocationDirectKey({
          ...value,
          modelId,
          channelUid: channelCase.channelUid
        }));
        if (direct) {
          if (Math.abs(Number(direct.actual) - channelCase.actual) > 1e-7) {
            throw new Error(
              "m2_core_legacy_channel_allocation_channel_actual_mismatch"
            );
          }
          directForecasts[modelId] = Number(direct.pointEstimate);
        }
      }
      return {
        channelUid: String(channelCase.channelUid),
        actual: Number(channelCase.actual),
        historyNonnegativeByLag: Array.from(
          {length: 12},
          (_, lag) => Math.max(
            0,
            Number(
              pair.monthlyCashBySerial.get(originSerial - lag) ?? 0
            )
          )
        ),
        directForecasts
      };
    });
    const channelActualTotal = channels.reduce(
      (sum, channel) => sum + channel.actual,
      0
    );
    if (
      channels.length === 0
      || Math.abs(channelActualTotal - value.actualTotal) > 1e-7
    ) {
      throw new Error(
        "m2_core_legacy_channel_allocation_work_actual_mismatch"
      );
    }
    output.push({
      ...value,
      totalPredictions: deduplicateTotalPredictions(
        value.totalPredictions
      ),
      channels
    });
  }
  return output.sort((left, right) => (
    left.evaluationFamily.localeCompare(right.evaluationFamily)
    || left.populationId.localeCompare(right.populationId)
    || left.origin.localeCompare(right.origin)
    || left.horizonMonths - right.horizonMonths
    || left.standardWorkId.localeCompare(right.standardWorkId)
  ));
}

function deduplicateTotalPredictions(rows) {
  const output = new Map();
  for (const row of rows) {
    const prior = output.get(row.sourceModelId);
    if (
      prior
      && Math.abs(prior.pointEstimate - row.pointEstimate) > 1e-12
    ) {
      throw new Error(
        "m2_core_legacy_channel_allocation_total_prediction_duplicate"
      );
    }
    output.set(row.sourceModelId, row);
  }
  return [...output.values()].sort((left, right) => (
    left.sourceModelId.localeCompare(right.sourceModelId)
  ));
}

function allocationWorkCellKey(row) {
  return [
    row.evaluationFamily,
    row.populationId,
    String(row.standardWorkId),
    String(row.origin),
    String(Number(row.horizonMonths))
  ].join("\u0000");
}

function allocationDirectKey(row) {
  return [
    allocationWorkCellKey(row),
    String(row.modelId),
    String(row.channelUid)
  ].join("\u0000");
}

function monthToSerial(value) {
  const match = /^(\d{4})-(\d{2})$/u.exec(String(value));
  if (!match) {
    throw new Error("m2_core_legacy_channel_allocation_month_invalid");
  }
  return Number(match[1]) * 12 + Number(match[2]) - 1;
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
    privateContext: {
      authority,
      cases
    },
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
    String(row.standardWorkId),
    String(row.origin),
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

async function writePublicK2Outputs({ root, config, publicResult }) {
  const jsonPath = path.join(root, config.publicOutputs.routerJson);
  const reportPath = path.join(
    root,
    config.publicOutputs.routerReport
  );
  await Promise.all([
    writeFile(jsonPath, `${JSON.stringify(publicResult, null, 2)}\n`, "utf8"),
    writeFile(
      reportPath,
      renderM2CoreLegacyHorizonRouterReport(publicResult),
      "utf8"
    )
  ]);
}

async function writePublicK3Outputs({ root, config, publicResult }) {
  const jsonPath = path.join(root, config.publicOutputs.allocationJson);
  const reportPath = path.join(
    root,
    config.publicOutputs.allocationReport
  );
  await Promise.all([
    writeFile(jsonPath, `${JSON.stringify(publicResult, null, 2)}\n`, "utf8"),
    writeFile(
      reportPath,
      renderM2CoreLegacyChannelAllocationReport(publicResult),
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

function assertK2PublicSafe(value) {
  const serialized = JSON.stringify(value);
  for (const forbidden of [
    "\"standardWorkId\":",
    "\"channelUid\":",
    "\"caseKey\":",
    "\"outerOrigin\":",
    "\"origin\":",
    "data/private-input",
    "data/private-output"
  ]) {
    if (serialized.includes(forbidden)) {
      throw new Error(
        `m2_core_legacy_horizon_router_k2_privacy_boundary:${forbidden}`
      );
    }
  }
}

function assertK3PublicSafe(value) {
  const serialized = JSON.stringify(value);
  for (const forbidden of [
    "\"standardWorkId\":",
    "\"channelUid\":",
    "\"caseKey\":",
    "\"workCaseKey\":",
    "\"channelCaseKey\":",
    "\"origin\":",
    "data/private-input",
    "data/private-output"
  ]) {
    if (serialized.includes(forbidden)) {
      throw new Error(
        `m2_core_legacy_horizon_router_k3_privacy_boundary:${forbidden}`
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
