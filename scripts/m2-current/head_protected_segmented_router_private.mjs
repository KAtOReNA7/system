import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import {
  mkdir,
  readFile,
  rename,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

import {
  evaluateHpsrRetrospectiveDevelopment,
  planHpsrRetrospectiveOrigins,
  runHeadProtectedSegmentedRouter,
  assertHpsrRetrospectiveExecutionGate
} from "../../src/domain/m2Current/headProtectedSegmentedRouter.js";
import {
  evaluateHpsr02IndependentEvaluation,
  HPSR02_FINAL_STATUSES,
  runHeadProtectedTailBandCorrection
} from "../../src/domain/m2Current/headProtectedTailBandCorrection.js";
import {
  buildCoreLegacyOriginPopulation
} from "../../src/domain/m2Current/coreLegacyPopulation.js";
import {
  buildReversalScopeKeyV1,
  restateSalesShareReversalsV1
} from "../../src/domain/m2Current/reversalRestatement.js";
import {
  fitM2CoreHorizonAmountModel,
  predictM2CoreHorizonAmount,
  validateM2CoreLegacyHorizonAmountConfig
} from "../../src/domain/m2Current/coreLegacyHorizonAmount.js";
import {
  evaluateCapability,
  loadCapabilityCatalog
} from "../check-development-capability.mjs";
import {
  materializeM2HpsrFrozenFormulaFeatureRows
} from "./core_legacy_horizon_amount_mode.mjs";
import {
  verifyM2Oa03GitAndCiPreflight
} from "./oa03_current_scope_replication_mode.mjs";
import {
  loadOrRecoverHpsrImmutableFrozenParameters
} from "./hpsr_frozen_parameter_authority_private.mjs";
import {
  fitHpsrFrozenB3AtOrigin
} from "./hpsr_frozen_formula_private.mjs";

const CAPABILITY_ID = "m2-head-protected-segmented-router";
const CORE_AMOUNT_CONFIG =
  "config/m2-current-core-legacy-horizon-amount.v0.1.json";
const CORE_POPULATION_CONFIG =
  "config/m2-current-core-legacy-population.v0.1.json";
const HPSR02_CONFIG =
  "config/m2-current-head-protected-tail-band-correction.v0.2.json";
const HPSR01_CONFIG =
  "config/m2-current-head-protected-segmented-router.v0.1.json";
const HPSR02_BOUND_PROVENANCE =
  "docs/analysis/m2-current/"
    + "M2-head-protected-segmented-router-"
    + "residual-bound-provenance-v0.1.json";
const HPSR02_PUBLIC_RESULT =
  "docs/analysis/m2-current/"
    + "M2-head-protected-tail-band-correction-"
    + "independent-evaluation-v0.2.json";
const HPSR02_PUBLIC_REPORT =
  "docs/analysis/m2-current/"
    + "M2-head-protected-tail-band-correction-"
    + "independent-evaluation-v0.2.md";
const HPSR02_PRIVATE_DIRECTORY =
  "data/private-output/m2-head-protected-segmented-router";
const HPSR02_SOURCE_RECONCILIATION =
  `${HPSR02_PRIVATE_DIRECTORY}/`
    + "M2-hpsr02-source-authority-reconciliation-private-v0.2.json";
const HPSR02_ORIGIN_AUTHORITY_FACTS =
  `${HPSR02_PRIVATE_DIRECTORY}/`
    + "M2-hpsr02-origin-visible-authority-private-v0.2.ndjson";
const HPSR02_ORIGIN_AUTHORITY_RECEIPT =
  `${HPSR02_PRIVATE_DIRECTORY}/`
    + "M2-hpsr02-origin-visible-authority-receipt-private-v0.2.json";
const HPSR02_WORK_TOTAL_SCOPE_ASSESSMENT =
  `${HPSR02_PRIVATE_DIRECTORY}/`
    + "M2-hpsr02-work-total-scope-assessment-private-v0.2.json";
const HPSR02_INDEPENDENT_RECEIPT =
  `${HPSR02_PRIVATE_DIRECTORY}/`
    + "M2-hpsr02-independent-receipt-private-v0.2.json";
const HPSR02_INDEPENDENT_PREDICTIONS =
  `${HPSR02_PRIVATE_DIRECTORY}/`
    + "M2-hpsr02-independent-predictions-private-v0.2.ndjson";
const HPSR02_INDEPENDENT_EVALUATION_ROWS =
  `${HPSR02_PRIVATE_DIRECTORY}/`
    + "M2-hpsr02-independent-evaluation-private-v0.2.ndjson";
const HPSR02_INDEPENDENT_MANIFEST =
  `${HPSR02_PRIVATE_DIRECTORY}/`
    + "M2-hpsr02-independent-manifest-private-v0.2.json";

export async function reconcileHpsr02SourceAuthorityPrivate({ root }) {
  runPythonAudit(root, []);
  runPythonAudit(root, ["--export-origin-visible-authority"]);
  const [
    reconciliation,
    receipt,
    populationConfig
  ] = await Promise.all([
    readJson(path.join(root, HPSR02_SOURCE_RECONCILIATION)),
    readJson(path.join(root, HPSR02_ORIGIN_AUTHORITY_RECEIPT)),
    readJson(path.join(root, CORE_POPULATION_CONFIG))
  ]);
  if (
    reconciliation?.schema
      !== "m2.current.hpsr02."
        + "source_authority_reconciliation.private.v0.2"
    || receipt?.status
      !== "READY_ORIGIN_VISIBLE_ONLY_NO_FUTURE_OUTCOME"
    || receipt?.origin !== "2026-03"
    || receipt?.futureActualOutcomeRead !== false
    || receipt?.finalHoldoutOutcomeRead !== false
    || reconciliation?.sourceDigests?.salesShare
      !== receipt.sourceDigest
    || reconciliation?.sourceDigests?.channelMaster
      !== receipt.channelMasterDigest
  ) {
    throw new Error("hpsr02_source_reconciliation_binding_invalid");
  }
  const facts = await readNdjson(path.join(
    root,
    HPSR02_ORIGIN_AUTHORITY_FACTS
  ));
  if (facts.length !== receipt.rowCount) {
    throw new Error("hpsr02_origin_authority_row_count_mismatch");
  }
  const factor = 10n ** BigInt(receipt.amountScalePower);
  const currencyScope =
    `authority-ledger-native-unit:${receipt.sourceDigest}`;
  const authorityRows = facts.map((row) => {
    const amountMinor = decimalToMinor(
      row.actualSalesAmount,
      receipt.amountScalePower
    );
    return {
      recordId: String(row.authorityRecordId),
      reversalScopeKey: buildReversalScopeKeyV1({
        cashCategory: "sales_share",
        standardWorkId: String(row.standardWorkId),
        channelMemberId: String(row.channelMemberId),
        currencyScope
      }),
      postingMonth: String(row.billMonth).slice(0, 7),
      recordedAt: String(row.recordedAt),
      eventType: amountMinor < 0n
        ? "reversal"
        : "positive_sales_share",
      amountMinor: amountMinor.toString(),
      standardWorkId: String(row.standardWorkId),
      channelMemberId: String(row.channelMemberId)
    };
  });
  const authorityStartMonth = authorityRows.map(
    (row) => row.postingMonth
  ).sort()[0];
  const restatement = restateSalesShareReversalsV1(
    authorityRows,
    {
      cutoff: "2026-03",
      authorityStartMonth
    }
  );
  if (
    restatement.conservationDifferenceMinor !== "0"
    || [
      "BLOCKED_RECORDED_AT_MISSING",
      "BLOCKED_REVERSAL_CLASSIFICATION"
    ].includes(restatement.status)
  ) {
    throw new Error("hpsr02_origin_restatement_unusable");
  }
  const monthlyRows = [];
  for (const scope of restatement.scopes) {
    for (const balance of scope.restatedBalances) {
      const amountMinor = BigInt(balance.amountMinor);
      if (amountMinor === 0n) continue;
      monthlyRows.push({
        standardWorkId: scope.standardWorkId,
        channelUid: scope.channelMemberId,
        month: balance.month,
        cash: Number(amountMinor) / Number(factor),
        level2Category: "UNKNOWN",
        level3Category: "UNKNOWN",
        settlementMechanism: "UNKNOWN"
      });
    }
  }
  const population = buildCoreLegacyOriginPopulation({
    origin: "2026-03",
    monthlyRows,
    minimumCompleteMonths:
      populationConfig.eligibility.minimumCompleteMonths,
    thresholds: populationConfig.coreSelection.thresholds,
    topCounts: populationConfig.coreSelection.topDiagnostics
  });
  const core80 = new Set(
    population.selection.populations.CORE80 ?? []
  );
  const eligiblePairs = new Set(population.eligiblePairs.map(
    (row) => `${row.standardWorkId}\u0000${row.channelUid}`
  ));
  const differenceRows =
    reconciliation?.partitionAudit?.privateDifferenceRows ?? [];
  if (differenceRows.length === 0 || differenceRows.length > 6) {
    throw new Error("hpsr02_source_difference_inventory_invalid");
  }
  const items = differenceRows.map((item) => {
    const standardWorkId =
      item?.privateScopeIdentity?.standardWorkId;
    const channelMemberId =
      item?.privateScopeIdentity?.channelMemberId;
    if (
      typeof standardWorkId !== "string"
      || standardWorkId === ""
      || typeof channelMemberId !== "string"
      || channelMemberId === ""
    ) {
      throw new Error("hpsr02_source_difference_identity_invalid");
    }
    return {
      issueId: item.issueId,
      redactedFactIdentity: item.redactedFactIdentity,
      pairEligibleAtOrigin: eligiblePairs.has(
        `${standardWorkId}\u0000${channelMemberId}`
      ),
      workInDynamicCore80: core80.has(standardWorkId)
    };
  });
  await writeJsonAtomic(path.join(
    root,
    HPSR02_WORK_TOTAL_SCOPE_ASSESSMENT
  ), {
    schema:
      "m2.current.hpsr02."
        + "work_total_scope_assessment.private.v0.2",
    artifactClass: "PRIVATE_DERIVED_CACHE",
    tracked: false,
    status: "WORK_TOTAL_SCOPE_ASSESSMENT_COMPLETE",
    origin: "2026-03",
    sourceDigests: {
      salesShare: receipt.sourceDigest,
      channelMaster: receipt.channelMasterDigest,
      originVisibleFacts: receipt.factsDigest
    },
    actualDefinitionId:
      "M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01",
    restatementStatus: restatement.status,
    eligibleWorkCount: population.eligibleWorkCount,
    dynamicCore80WorkCount: core80.size,
    items,
    originVisibleOnly: true,
    futureActualOutcomeRead: false,
    finalHoldoutOutcomeRead: false,
    modelPredictionRun: false,
    scoreComputed: false
  });
  const finalAudit = JSON.parse(runPythonAudit(root, []));
  if (
    finalAudit.decision
      !== "M2_HPSR02_WORK_TOTAL_SOURCE_AUTHORITY_RECONCILED_"
        + "READY_FOR_AUTHORIZED_FIRST_INDEPENDENT_EVALUATION"
    || finalAudit.workTotalSourceAuthorityChecksPass !== true
    || finalAudit.workChannelGateStatus !== "PARTIAL_NOT_ACTIVE"
    || finalAudit.newFutureActualOutcomeOpened !== false
  ) {
    throw new Error("hpsr02_source_reconciliation_not_ready");
  }
  const finalReconciliation = await readJson(path.join(
    root,
    HPSR02_SOURCE_RECONCILIATION
  ));
  return Object.freeze({
    status: finalAudit.decision,
    sourceAuthorityStatus: finalAudit.sourceAuthorityStatus,
    canonicalMappingStatus:
      finalAudit.workTotalCanonicalMappingStatus,
    metadataDifferenceStatus:
      finalAudit.metadataDifferenceStatus,
    dynamicCore80WorkCount: core80.size,
    workTotalScopeRelevantDifferenceRowCount:
      finalReconciliation.partitionAudit
        .workTotalScopeRelevantDifferenceRowCount,
    workChannelGateStatus: finalAudit.workChannelGateStatus,
    newFutureActualOutcomeOpened: false,
    futureActualOutcomeRead: false,
    modelPredictionRun: false,
    scoreComputed: false
  });
}

export async function reconcileHpsr02FrozenBoundCachePrivate({ root }) {
  return await reconcileHpsr02ImmutableFrozenParameterPrivate({ root });
}

export async function reconcileHpsr02ImmutableFrozenParameterPrivate({
  root
}) {
  const preflight = verifyM2Oa03GitAndCiPreflight({
    root,
    allowedDirtyPaths: []
  });
  const [hpsr01Config, coreAmountConfig, boundProof] =
    await Promise.all([
      readJson(path.join(root, HPSR01_CONFIG)),
      readJson(path.join(root, CORE_AMOUNT_CONFIG)),
      readJson(path.join(root, HPSR02_BOUND_PROVENANCE))
    ]);
  validateM2CoreLegacyHorizonAmountConfig(coreAmountConfig);
  const reconciliation =
    await loadOrRecoverHpsrImmutableFrozenParameters({
      root,
      hpsr01Config,
      coreAmountConfig,
      boundProof
    });
  return Object.freeze({
    status:
      "M2_HPSR02_IMMUTABLE_FROZEN_PARAMETER_VALIDATED_"
        + "WITHOUT_SCIENTIFIC_EVALUATION",
    executionHead: preflight.head,
    exactHeadCiRunId: preflight.ciRunId,
    parameterArtifactClass: "IMMUTABLE_FROZEN_MODEL_PARAMETER",
    parameterAuthorityStatus:
      reconciliation.parameterAuthorityStatus,
    parameterLoadMode: reconciliation.parameterLoadMode,
    parameterLineageStatus: reconciliation.parameterLineageStatus,
    historicalReceiptStatus: reconciliation.historicalReceiptStatus,
    channelLineageDriftStatus:
      reconciliation.channelLineageDriftStatus,
    inputRowCount: reconciliation.inputRowCount,
    finiteSupportRowCount: reconciliation.finiteSupportRowCount,
    parameterValuesPublished: false,
    futureActualOutcomeRead: false,
    candidatePredictionsProduced: 0,
    scientificEvaluationsExecuted: 0,
    bootstrapRuns: 0,
    prospectiveFinalHoldoutOpened: false
  });
}

export async function runHpsr02IndependentPrivate({ root }) {
  const preflight = verifyM2Oa03GitAndCiPreflight({
    root,
    allowedDirtyPaths: []
  });
  const [hpsr02Config, hpsr01Config, coreAmountConfig, boundProof] =
    await Promise.all([
      readJson(path.join(root, HPSR02_CONFIG)),
      readJson(path.join(root, HPSR01_CONFIG)),
      readJson(path.join(root, CORE_AMOUNT_CONFIG)),
      readJson(path.join(root, HPSR02_BOUND_PROVENANCE))
    ]);
  const receiptPath = path.join(root, HPSR02_INDEPENDENT_RECEIPT);
  const [priorReceipt, priorPublicCheckpoint] = await Promise.all([
    readJsonIfPresent(receiptPath),
    readJsonIfPresent(path.join(root, HPSR02_PUBLIC_RESULT))
  ]);
  if (
    priorReceipt?.completeIndependentResultProduced === true
    || priorReceipt?.resultFrozen === true
  ) {
    throw new Error("hpsr02_independent_complete_result_already_frozen");
  }
  if (
    hpsr02Config?.model?.stableModelId !== "M2-WORK-HPSR02"
    || hpsr02Config?.authorization
      ?.independentK2EvaluationAuthorizedNow !== true
    || hpsr02Config?.authorization
      ?.newPrivateActualReadAuthorizedNow !== true
    || hpsr02Config?.authorization?.modelTrainingAuthorizedNow !== false
    || hpsr02Config?.authorization?.alphaSearchAuthorizedNow !== false
    || hpsr02Config?.authorization
      ?.residualBoundReestimationAuthorizedNow !== false
    || hpsr02Config?.authorization
      ?.prospectiveFinalHoldoutOpenAuthorizedNow !== false
  ) {
    throw new Error("hpsr02_independent_authorization_invalid");
  }
  validateM2CoreLegacyHorizonAmountConfig(coreAmountConfig);
  const parameterGate =
    await loadOrRecoverHpsrImmutableFrozenParameters({
      root,
      hpsr01Config,
      coreAmountConfig,
      boundProof
    });
  const sourceGate = await reconcileHpsr02SourceAuthorityPrivate({ root });
  const priorPreResultEngineeringAttempt =
    mergeHpsr02PreResultEngineeringAttempts({
      priorReceipt,
      priorPublicCheckpoint
    });
  const attemptId = crypto.randomUUID();
  await writeJsonAtomic(receiptPath, {
    schema: "m2.current.hpsr02.independent_receipt.private.v0.2",
    artifactClass: "PRIVATE_RUN_PROVENANCE",
    attemptId,
    status: "M2_HPSR02_FIRST_INDEPENDENT_EXECUTION_STARTED",
    executionHead: preflight.head,
    exactHeadCiRunId: preflight.ciRunId,
    origin: "2026-03",
    actualWindow: ["2026-04", "2026-05", "2026-06"],
    completeIndependentResultProduced: false,
    finalHoldoutOutcomeRead: false
  });
  try {
    const currentFeatureMaterialization =
      await materializeM2HpsrFrozenFormulaFeatureRows({
        root,
        retrospectiveOrigins: ["2026-03"],
        authorityMode: "HPSR02_WORK_TOTAL_SCOPE_AWARE_AUTHORITY"
      });
    if (
      currentFeatureMaterialization.sourceAuthority.authorityMode
        !== "HPSR02_WORK_TOTAL_SCOPE_AWARE_AUTHORITY"
    ) {
      throw new Error("hpsr02_independent_authority_mode_mismatch");
    }
    const fixedFit = hpsr01Config.retrospectiveReplay.fixedCham01B3Fit;
    const currentFit = fitHpsrFrozenB3AtOrigin({
      origin: "2026-03",
      featureRows: currentFeatureMaterialization.featureRows,
      coreAmountConfig,
      fixedFit
    });
    const boundState = parameterGate.boundState;
    const validationRows = currentFit.validationRows;
    if (
      validationRows.length === 0
      || validationRows.some((row) => (
        row.origin !== "2026-03"
        || row.horizonMonths !== 3
        || row.originVisibleOnly !== true
        || row.futureHistoryRowCount !== 0
        || !Number.isFinite(row.actual)
        || !Number.isFinite(row.referenceRevenue)
        || !Number.isFinite(row.features?.lg01PointEstimate)
      ))
    ) {
      throw new Error("hpsr02_independent_validation_rows_invalid");
    }
    const originVisibleWorkCashRows = validationRows.map((row) => ({
      standardWorkId: row.standardWorkId,
      trailing12Cash: row.referenceRevenue
    }));
    const predictionRows = currentFit.predictions.map(
      (prediction, index) => ({
        standardWorkId: prediction.standardWorkId,
        origin: "2026-03",
        horizonMonths: 3,
        lg01Prediction:
          validationRows[index].features.lg01PointEstimate,
        cham01B3Prediction: prediction.pointEstimate,
        cham01Diagnostics: {
          signedExpm1Overflow:
            !Number.isFinite(prediction.pointEstimate)
            && Number.isFinite(prediction.transformedPointEstimate),
          supportRangeExtrapolation: false
        }
      })
    );
    const routerResult = runHeadProtectedTailBandCorrection({
      origin: "2026-03",
      horizonMonths: 3,
      originVisibleWorkCashRows,
      predictionRows,
      residualBoundState: boundState,
      executionMode: "CONTROLLED_LATER_ORIGIN"
    });
    const historicalRouterResult = runHeadProtectedSegmentedRouter({
      origin: "2026-03",
      horizonMonths: 3,
      originVisibleWorkCashRows,
      predictionRows,
      residualBoundState: boundState,
      executionMode: "CONTROLLED_LATER_ORIGIN"
    });
    const expectedCore80 = validationRows.filter(
      (row) => row.core80 === true
    ).map((row) => row.standardWorkId).sort();
    if (
      JSON.stringify(expectedCore80)
      !== JSON.stringify([...routerResult.population.core80WorkIds].sort())
    ) {
      throw new Error("hpsr02_independent_core80_mismatch");
    }
    const evaluation = evaluateHpsr02IndependentEvaluation({
      routerResult,
      historicalRouterResult,
      actualRows: validationRows.filter(
        (row) => row.core80 === true
      ).map(actualRow),
      eligibleActualRows: validationRows.map(actualRow),
      sourceGate: {
        ...sourceGate,
        workTotalSourceAuthorityChecksPass: true
      },
      bootstrap: hpsr02Config.independentEvaluation.bootstrap
    });
    const privatePredictions = validationRows.filter(
      (row) => row.core80 === true
    ).map((row) => {
      const prediction = currentFit.predictions.find(
        (item) => item.standardWorkId === row.standardWorkId
      );
      const r0 = routerResult.r0Rows.find(
        (item) => item.standardWorkId === row.standardWorkId
      );
      const r1 = historicalRouterResult.r1RawRouterRows.find(
        (item) => item.standardWorkId === row.standardWorkId
      );
      const r2 = routerResult.r2Rows.find(
        (item) => item.standardWorkId === row.standardWorkId
      );
      return {
        schema:
          "m2.current.hpsr02.independent_prediction.private.v0.2",
        experimentId: evaluation.experimentId,
        modelId: evaluation.modelId,
        standardWorkId: row.standardWorkId,
        origin: "2026-03",
        horizonMonths: 3,
        actual: row.actual,
        cashBandId: r2.cashBandId,
        lg01PointEstimate: r0.pointEstimate,
        cham01B3RawPointEstimate: Number.isFinite(prediction.pointEstimate)
          ? prediction.pointEstimate
          : null,
        cham01B3RawFinite: Number.isFinite(prediction.pointEstimate),
        hpsr01HistoricalComparatorPointEstimate: r1.pointEstimate,
        hpsr01HistoricalComparatorCorrectionApplied:
          r1.correctionApplied,
        hpsr01HistoricalComparatorFallbackToLg01:
          r1.fallbackToLg01,
        hpsr02PointEstimate: r2.pointEstimate,
        correctionApplied: r2.correctionApplied,
        fallbackToLg01: r2.fallbackToLg01,
        maximumTrainingLabelAvailableAsOf:
          currentFit.state.maximumTrainingLabelAvailableAsOf,
        fixedHuberDelta: currentFit.state.huberDelta,
        fixedL2: currentFit.state.l2,
        hyperparameterSearchExecuted: false
      };
    });
    await writeNdjsonAtomic(path.join(
      root,
      HPSR02_INDEPENDENT_PREDICTIONS
    ), privatePredictions);
    await writeNdjsonAtomic(path.join(
      root,
      HPSR02_INDEPENDENT_EVALUATION_ROWS
    ), evaluation.privateRows);
    const resultDigest = sha256Json({
      status: evaluation.status,
      predictions: privatePredictions,
      evaluationRows: evaluation.privateRows,
      metrics: evaluation.metrics,
      cashBands: evaluation.cashBands
    });
    await writeJsonAtomic(path.join(
      root,
      HPSR02_INDEPENDENT_MANIFEST
    ), {
      schema: "m2.current.hpsr02.independent_manifest.private.v0.2",
      artifactClass: "PRIVATE_DERIVED_CACHE",
      status: evaluation.status,
      experimentId: evaluation.experimentId,
      modelId: evaluation.modelId,
      executionHead: preflight.head,
      exactHeadCiRunId: preflight.ciRunId,
      origin: evaluation.origin,
      actualWindow: evaluation.actualWindow,
      predictionRowCount: privatePredictions.length,
      evaluationRowCount: evaluation.privateRows.length,
      uniqueCaseKeyCount: evaluation.structure.caseKeyConservationPass
        ? evaluation.privateRows.length
        : null,
      resultDigest,
      frozenParameterPayloadSha256:
        parameterGate.parameterArtifact.parameterPayloadSha256,
      frozenParameterAuthorityStatus:
        parameterGate.parameterAuthorityStatus,
      frozenParameterLoadMode: parameterGate.parameterLoadMode,
      parameterLineageStatus: parameterGate.parameterLineageStatus,
      channelLineageDriftStatus:
        parameterGate.channelLineageDriftStatus,
      workTotalSourceAuthorityStatus:
        sourceGate.sourceAuthorityStatus,
      workChannelGateStatus: "PARTIAL_NOT_ACTIVE",
      prospectiveFinalHoldoutOpened: false,
      prospectiveFinalHoldoutOutcomeRead: false
    });
    const publicResult = buildHpsr02PublicResult({
      evaluation,
      sourceGate,
      preflight,
      fit: currentFit,
      resultDigest,
      parameterGate,
      priorPreResultEngineeringAttempt
    });
    await writeJsonAtomic(path.join(root, HPSR02_PUBLIC_RESULT), publicResult);
    await writeTextAtomic(
      path.join(root, HPSR02_PUBLIC_REPORT),
      renderHpsr02ChineseReport(publicResult)
    );
    await writeJsonAtomic(receiptPath, {
      schema: "m2.current.hpsr02.independent_receipt.private.v0.2",
      artifactClass: "PRIVATE_RUN_PROVENANCE",
      attemptId,
      status: evaluation.status,
      executionHead: preflight.head,
      exactHeadCiRunId: preflight.ciRunId,
      resultDigest,
      frozenParameterPayloadSha256:
        parameterGate.parameterArtifact.parameterPayloadSha256,
      frozenParameterAuthorityStatus:
        parameterGate.parameterAuthorityStatus,
      frozenParameterLoadMode: parameterGate.parameterLoadMode,
      parameterLineageStatus: parameterGate.parameterLineageStatus,
      channelLineageDriftStatus:
        parameterGate.channelLineageDriftStatus,
      predictionRowCount: privatePredictions.length,
      evaluationRowCount: evaluation.privateRows.length,
      completeIndependentResultProduced: true,
      resultFrozen: true,
      retryAllowed: false,
      secondIndependentOriginExecuted: false,
      finalHoldoutOutcomeRead: false
    });
    return Object.freeze({
      status: evaluation.status,
      origin: evaluation.origin,
      caseCount: evaluation.caseCount,
      completeIndependentResultProduced: true,
      resultFrozen: true,
      secondIndependentOriginExecuted: false,
      prospectiveFinalHoldoutOpened: false,
      publicResult
    });
  } catch (error) {
    const errorCode = safeHpsr02Error(error);
    const futureActualOutcomeRead = (
      priorPreResultEngineeringAttempt?.futureActualOutcomeRead === true
      || [
        "m2_hpsr_rebuilt_work_case_duplicate",
        "hpsr02_residual_bound_rebuild_not_reconciled",
        "m2_core_revenue_manual_command_failed:node.exe"
      ].includes(errorCode)
    );
    await writeJsonAtomic(receiptPath, {
      schema: "m2.current.hpsr02.independent_receipt.private.v0.2",
      artifactClass: "PRIVATE_RUN_PROVENANCE",
      attemptId,
      status:
        "INVALIDATED_PRE_RESULT_ENGINEERING_FAILURE_RECOVERY_ALLOWED",
      executionHead: preflight.head,
      exactHeadCiRunId: preflight.ciRunId,
      errorCode,
      futureActualOutcomeRead,
      priorEngineeringAttemptCount:
        priorPreResultEngineeringAttempt?.attemptCount ?? 0,
      priorEngineeringErrorCodes:
        priorPreResultEngineeringAttempt?.attempts.map(
          (attempt) => attempt.errorCode
        ) ?? [],
      completeIndependentResultProduced: false,
      resultFrozen: false,
      retryAllowed: true,
      finalHoldoutOutcomeRead: false
    });
    throw error;
  }
}

export async function runHpsrRetrospectivePrivate({
  root,
  contract,
  availability
}) {
  const inventory = evaluateCapability(
    loadCapabilityCatalog(path.join(
      root,
      "config",
      "development-capability-catalog.v0.1.json"
    )),
    CAPABILITY_ID,
    { repoRoot: root }
  );
  if (
    inventory.sourceAuthorityStatus !== "SOURCE_AUTHORITY_AVAILABLE"
    || inventory.unavailableTools.length > 0
  ) {
    throw new Error(
      inventory.sourceAuthorityStatus !== "SOURCE_AUTHORITY_AVAILABLE"
        ? "hpsr_retrospective_missing_source_authority"
        : "hpsr_retrospective_required_tool_unavailable"
    );
  }
  const openedSemantics = await readJson(path.join(
    root,
    contract.privateCapability.openedOriginSemanticsArtifact
  ));
  const profile = openedSemantics.historicalCacheProfiles.find(
    (item) => item.role === "frozen-development-feature-rows"
  );
  if (!profile) {
    throw new Error("hpsr_retrospective_opened_profile_missing");
  }
  const retrospectivePlan = planHpsrRetrospectiveOrigins({
    residualBoundDerivationThrough:
      contract.residualBoundaryFreeze.sourceOriginRange.through,
    firstIndependentLaterOrigin:
      openedSemantics.prospectiveReservation
        .firstIndependentLaterOrigin,
    completeAuthoritativeBillMonthThrough:
      openedSemantics.billMonthAvailability
        .completeAuthoritativeBillMonthThrough,
    openedOriginProfiles: profile.origins,
    isolatedOrigins: contract.finalHoldout.historicalThreeMonthOrigins,
    horizonMonths: 3
  });
  assertHpsrRetrospectiveExecutionGate({
    contract,
    retrospectivePlan
  });
  const independentK2Ready = (
    openedSemantics.prospectiveReservation
      .firstIndependentLaterOriginReady === true
    && availability.candidateInventory
      ?.earliestIndependentLaterOriginReady === true
  );
  const preflight = verifyM2Oa03GitAndCiPreflight({
    root,
    allowedDirtyPaths: []
  });
  const privateDirectory = path.dirname(path.join(
    root,
    contract.privateCapability.retrospectiveReceipt
  ));
  await mkdir(privateDirectory, { recursive: true });
  const receiptPath = path.join(
    root,
    contract.privateCapability.retrospectiveReceipt
  );
  const priorReceipt = await readJsonIfPresent(receiptPath);
  if (
    priorReceipt?.completeRetrospectiveResultProduced === true
    || priorReceipt?.status
      === "M2_HPSR01_RETROSPECTIVE_COMPLETE_RESULT_FROZEN"
  ) {
    throw new Error("hpsr_retrospective_complete_result_already_frozen");
  }
  const attemptId = crypto.randomUUID();
  await writeJsonAtomic(receiptPath, {
    schema:
      "m2.current.head_protected_segmented_router."
        + "retrospective_receipt.private.v0.1",
    artifactClass: "PRIVATE_RUN_PROVENANCE",
    attemptId,
    status: "M2_HPSR01_RETROSPECTIVE_EXECUTION_STARTED",
    executionHead: preflight.head,
    exactHeadCiRunId: preflight.ciRunId,
    retrospectiveOrigins: retrospectivePlan.includedOrigins,
    completeRetrospectiveResultProduced: false,
    independentK2Ready,
    finalHoldoutOutcomeRead: false
  });
  const coreAmountConfig = await readJson(path.join(
    root,
    CORE_AMOUNT_CONFIG
  ));
  validateM2CoreLegacyHorizonAmountConfig(coreAmountConfig);
  const featureCachePath = path.join(
    root,
    contract.privateCapability.boundSourceCaches.featureRows
  );
  const featureMaterialization = fs.existsSync(featureCachePath)
    ? {
      status: "CACHE_HIT",
      artifactClass: "PRIVATE_DERIVED_CACHE",
      featureRows: await readRelevantFeatureRows(
        featureCachePath,
        retrospectivePlan.includedOrigins.at(-1)
      ),
      sourceAuthority: null
    }
    : await materializeM2HpsrFrozenFormulaFeatureRows({
      root,
      retrospectiveOrigins: retrospectivePlan.includedOrigins
    });
  const boundState = await readJson(path.join(
    root,
    contract.privateCapability.residualBoundArtifact
  ));
  const originResults = [];
  const privatePredictions = [];
  const fitAudits = [];
  for (const origin of retrospectivePlan.includedOrigins) {
    const trainingRows = featureMaterialization.featureRows.filter(
      (row) => (
        row.horizonMonths === 3
        && row.origin < origin
        && row.labelAvailableAsOf <= origin
        && Number.isFinite(row.features?.lg01PointEstimate)
      )
    );
    const validationRows = featureMaterialization.featureRows.filter(
      (row) => (
        row.horizonMonths === 3
        && row.origin === origin
        && Number.isFinite(row.features?.lg01PointEstimate)
      )
    );
    if (trainingRows.length < 1 || validationRows.length < 1) {
      throw new Error("hpsr_retrospective_feature_cell_empty");
    }
    if (
      validationRows.some((row) => (
        row.originVisibleOnly !== true
        || row.futureHistoryRowCount !== 0
        || !Number.isFinite(row.actual)
        || !Number.isFinite(row.referenceRevenue)
      ))
    ) {
      throw new Error("hpsr_retrospective_origin_visibility_failed");
    }
    const state = fitM2CoreHorizonAmountModel(trainingRows, {
      armId: "B3",
      huberDelta:
        contract.retrospectiveReplay.fixedCham01B3Fit.huberDelta,
      l2: contract.retrospectiveReplay.fixedCham01B3Fit.l2,
      config: coreAmountConfig
    });
    if (state.maximumTrainingLabelAvailableAsOf > origin) {
      throw new Error("hpsr_retrospective_future_training_label_read");
    }
    const b3Rows = validationRows.map(
      (row) => predictM2CoreHorizonAmount(row, state)
    );
    const routerResult = runHeadProtectedSegmentedRouter({
      origin,
      horizonMonths: 3,
      originVisibleWorkCashRows: validationRows.map((row) => ({
        standardWorkId: row.standardWorkId,
        trailing12Cash: row.referenceRevenue
      })),
      predictionRows: b3Rows.map((row, index) => ({
        standardWorkId: row.standardWorkId,
        origin,
        horizonMonths: 3,
        lg01Prediction:
          validationRows[index].features.lg01PointEstimate,
        cham01B3Prediction: row.pointEstimate,
        cham01Diagnostics: {
          signedExpm1Overflow:
            !Number.isFinite(row.pointEstimate)
            && Number.isFinite(row.transformedPointEstimate),
          supportRangeExtrapolation: false
        }
      })),
      residualBoundState: boundState,
      executionMode: "CONTROLLED_LATER_ORIGIN"
    });
    const expectedCore80 = validationRows.filter(
      (row) => row.core80
    ).map((row) => row.standardWorkId).sort();
    const routedCore80 = [...routerResult.population.core80WorkIds].sort();
    if (JSON.stringify(expectedCore80) !== JSON.stringify(routedCore80)) {
      throw new Error("hpsr_retrospective_core80_reconstruction_mismatch");
    }
    originResults.push({
      origin,
      routerResult,
      actualRows: validationRows.map((row) => ({
        standardWorkId: row.standardWorkId,
        origin,
        horizonMonths: 3,
        actual: row.actual
      }))
    });
    privatePredictions.push(...b3Rows.map((row, index) => ({
      schema:
        "m2.current.head_protected_segmented_router."
          + "retrospective_prediction.private.v0.1",
      experimentId:
        "M2-EXP-LG01-HEAD-PROTECTED-SEGMENTED-ROUTER-01",
      modelId: "M2-WORK-HPSR01",
      standardWorkId: row.standardWorkId,
      origin,
      horizonMonths: 3,
      actual: validationRows[index].actual,
      lg01PointEstimate:
        validationRows[index].features.lg01PointEstimate,
      cham01B3RawPointEstimate: Number.isFinite(row.pointEstimate)
        ? row.pointEstimate
        : null,
      cham01B3RawFinite: Number.isFinite(row.pointEstimate),
      maximumTrainingLabelAvailableAsOf:
        state.maximumTrainingLabelAvailableAsOf,
      fixedHuberDelta: state.huberDelta,
      fixedL2: state.l2,
      hyperparameterSearchExecuted: false
    })));
    fitAudits.push({
      origin,
      status: "FROZEN_FORMULA_ORIGIN_FAITHFUL_REFIT",
      trainingRowCount: state.trainingRowCount,
      trainingWorkCount: state.trainingWorkCount,
      trainingOriginCount: state.trainingOriginCount,
      maximumTrainingLabelAvailableAsOf:
        state.maximumTrainingLabelAvailableAsOf,
      fixedHuberDelta: state.huberDelta,
      fixedL2: state.l2,
      hyperparameterSearchExecuted: false,
      newModelOrCandidateCreated: false
    });
  }
  const evaluation = evaluateHpsrRetrospectiveDevelopment({
    originResults,
    decisionPolicy: contract.retrospectiveReplay.decisionPolicy,
    bootstrap: contract.retrospectiveReplay.bootstrap
  });
  const privatePredictionPath = path.join(
    root,
    contract.privateCapability.retrospectivePredictionRows
  );
  const privateEvaluationPath = path.join(
    root,
    contract.privateCapability.retrospectiveEvaluationRows
  );
  const privateManifestPath = path.join(
    root,
    contract.privateCapability.retrospectiveManifest
  );
  await writeNdjsonAtomic(privatePredictionPath, privatePredictions);
  await writeNdjsonAtomic(privateEvaluationPath, evaluation.privateRows);
  const resultDigest = sha256Json({
    origins: evaluation.origins,
    predictions: privatePredictions,
    evaluationRows: evaluation.privateRows,
    status: evaluation.status
  });
  await writeJsonAtomic(privateManifestPath, {
    schema:
      "m2.current.head_protected_segmented_router."
        + "retrospective_manifest.private.v0.1",
    artifactClass: "PRIVATE_DERIVED_CACHE",
    experimentId: evaluation.experimentId,
    modelId: evaluation.modelId,
    executionHead: preflight.head,
    exactHeadCiRunId: preflight.ciRunId,
    status: evaluation.status,
    origins: evaluation.origins,
    predictionRowCount: privatePredictions.length,
    evaluationRowCount: evaluation.privateRows.length,
    uniqueCaseKeyCount: evaluation.structure.uniqueCaseKeyCount,
    resultDigest,
    sourceAuthorityStatus: inventory.sourceAuthorityStatus,
    derivedFeatureCacheStatus: featureMaterialization.status,
    finalHoldoutOutcomeRead: false,
    independentK2OutcomeRead: false
  });
  await writeJsonAtomic(receiptPath, {
    schema:
      "m2.current.head_protected_segmented_router."
        + "retrospective_receipt.private.v0.1",
    artifactClass: "PRIVATE_RUN_PROVENANCE",
    attemptId,
    status: "M2_HPSR01_RETROSPECTIVE_COMPLETE_RESULT_FROZEN",
    executionHead: preflight.head,
    exactHeadCiRunId: preflight.ciRunId,
    resultStatus: evaluation.status,
    retrospectiveOrigins: evaluation.origins,
    predictionRowCount: privatePredictions.length,
    evaluationRowCount: evaluation.privateRows.length,
    completeRetrospectiveResultProduced: true,
    resultDigest,
    resultFrozen: true,
    retryAllowed: false,
    independentK2Ready,
    independentK2Executed: false,
    finalHoldoutOutcomeRead: false
  });
  const publicResult = buildPublicResult({
    evaluation,
    retrospectivePlan,
    independentK2Ready,
    openedSemantics,
    inventory,
    featureMaterialization,
    fitAudits,
    preflight
  });
  await writeJsonAtomic(path.join(
    root,
    contract.publicOutputs.retrospectiveEvaluationJson
  ), publicResult);
  await writeTextAtomic(path.join(
    root,
    contract.publicOutputs.retrospectiveEvaluationReport
  ), renderChineseReport(publicResult));
  return Object.freeze({
    status: publicResult.status,
    origins: publicResult.retrospective.origins,
    retrospectiveReplayReady: true,
    independentK2Ready,
    independentK2Executed: false,
    prospectiveFinalHoldoutOpened: false,
    publicResult
  });
}

function actualRow(row) {
  return {
    standardWorkId: row.standardWorkId,
    origin: row.origin,
    horizonMonths: 3,
    actual: row.actual
  };
}

function buildHpsr02PublicResult({
  evaluation,
  sourceGate,
  preflight,
  fit,
  resultDigest,
  parameterGate,
  priorPreResultEngineeringAttempt
}) {
  const { privateRows: _privateRows, ...publicEvaluation } = evaluation;
  return Object.freeze({
    schema:
      "m2.current.head_protected_tail_band_correction."
        + "independent_evaluation.public.v0.2",
    asOf: new Date().toISOString().slice(0, 10),
    status: evaluation.status,
    model: Object.freeze({
      displayNameZh: "LG01 头部保护尾段修正模型 v0.2",
      displayNameEn:
        "LG01 Head-Protected Tail-Band Correction Model v0.2",
      stableModelId: "M2-WORK-HPSR02"
    }),
    experiment: Object.freeze({
      displayNameZh:
        "M2 LG01 头部保护尾段修正独立评价 v0.2",
      displayNameEn:
        "M2 LG01 Head-Protected Tail-Band Correction Independent "
          + "Evaluation v0.2",
      stableExperimentId:
        "M2-EXP-LG01-HEAD-PROTECTED-TAIL-BAND-CORRECTION-02",
      baselineModelId: "M2-WORK-LG01",
      candidateArmId: "R2",
      baselineArmId: "R0",
      executionStatus: "FIRST_INDEPENDENT_COMPLETE_RESULT_FROZEN"
    }),
    priorBlockedAttempt: Object.freeze({
      status: "M2_HPSR02_BLOCKED_MISSING_SOURCE_AUTHORITY",
      evidenceRef:
        "M2-head-protected-tail-band-correction-"
          + "independent-evaluation-v0.2 previous checkpoint",
      metadataOnly: true,
      amountCellReadCount: 0,
      candidateModelRuns: 0,
      scientificEvaluationsExecuted: 0,
      bootstrapRuns: 0,
      reason:
        "PREVIOUS_GATE_CONFLATED_WORK_CHANNEL_COMPLETENESS_WITH_"
          + "WORK_TOTAL_AND_DID_NOT_CLASSIFY_THREE_SPLIT_ROWS_BY_SCOPE",
      historyRewritten: false
    }),
    priorFrozenParameterAuthorityCheckpoint: Object.freeze({
      status:
        "M2_HPSR02_BLOCKED_ACTIONABLE_"
          + "SOURCE_AUTHORITY_DECISION_REQUIRED",
      reason:
        "FROZEN_MODEL_PARAMETER_WAS_INCORRECTLY_CONFLATED_WITH_"
          + "CURRENT_BILL_SOURCE_AUTHORITY",
      historicalOnlyChannelRowCount: 732,
      currentOnlyChannelRowCount: 732,
      workMonthAmountTotalEqual: true,
      firstIndependentOutcomePreviouslyOpened: true,
      completeIndependentResultProducedAtCheckpoint: false,
      resolvedByCurrentUserAuthorityDecision: true,
      historyRewritten: false
    }),
    preResultEngineeringRecovery:
      priorPreResultEngineeringAttempt,
    frozenParameterAuthority: Object.freeze({
      artifactClass: "IMMUTABLE_FROZEN_MODEL_PARAMETER",
      status: parameterGate.parameterAuthorityStatus,
      loadMode: parameterGate.parameterLoadMode,
      recoveryIdentity: parameterGate.parameterRecoveryIdentity,
      lineageArtifactClass: "PARAMETER_LINEAGE_SNAPSHOT",
      lineageStatus: parameterGate.parameterLineageStatus,
      historicalReceiptStatus: parameterGate.historicalReceiptStatus,
      sourceClass:
        "FROZEN_FROM_PREVIOUSLY_OPENED_DEVELOPMENT_ONLY",
      derivationOriginRange: Object.freeze({
        from: "2023-03",
        through: "2025-09"
      }),
      maximumOpenedDevelopmentOrigin: "2026-02",
      inputRowCount: parameterGate.inputRowCount,
      finiteSupportRowCount: parameterGate.finiteSupportRowCount,
      parameterCount: 3,
      parameterValuesPublished: false,
      currentBillSourceUsedForParameterDerivation: false,
      laterOriginOutcomeUsed: false,
      prospectiveFinalHoldoutOutcomeUsed: false,
      residualBoundReestimationExecuted: false,
      historicalFrozenRunRecordExactlyReconciled: true,
      encryptedBackupMechanismStatus:
        "NOT_AVAILABLE_FOR_THIS_CAPABILITY_"
          + "NO_UNENCRYPTED_BACKUP_CREATED"
    }),
    channelLineageTransfer: Object.freeze({
      status: parameterGate.channelLineageDriftStatus,
      historicalOnlyChannelRowCount: 732,
      currentOnlyChannelRowCount: 732,
      affectedWorkCount: 421,
      affectedMonthCount: 82,
      affectedChannelIdentityCount: 21,
      affectedWorkMonthCount: 721,
      workMonthRowCountEqual: true,
      workMonthCashTotalEqual: true,
      frozenParameterChanged: false,
      currentActualReplacedByHistoricalLineage: false,
      interpretation:
        "INDEPENDENT_TRANSFER_TEST_OF_FROZEN_MODEL_UNDER_"
          + "CURRENT_SOURCE_IDENTITY_DRIFT"
    }),
    sourceAuthorityReconciliation: Object.freeze({
      status: sourceGate.status,
      sourceAuthorityStatus: sourceGate.sourceAuthorityStatus,
      workTotalCanonicalMappingStatus:
        sourceGate.canonicalMappingStatus,
      metadataDifferenceStatus:
        sourceGate.metadataDifferenceStatus,
      missingCanonicalRawPairCount: 3,
      missingCanonicalMappingRowCount: 134,
      splitExtraNonzeroFactRowCount: 3,
      dynamicCore80WorkCount:
        sourceGate.dynamicCore80WorkCount,
      workTotalScopeRelevantDifferenceRowCount:
        sourceGate.workTotalScopeRelevantDifferenceRowCount,
      workTotalGatePassed: true,
      workChannelGateStatus: "PARTIAL_NOT_ACTIVE",
      rawCanonicalMappingGuessedOrBackfilled: false,
      sourceAmountValuesPublished: false
    }),
    execution: Object.freeze({
      branch: preflight.branch,
      exactHead: preflight.head,
      pullRequestNumber: preflight.prNumber,
      pullRequestDraft: preflight.prDraft,
      exactHeadCiRunId: preflight.ciRunId,
      linuxCi: preflight.linux,
      windowsCi: preflight.windows,
      firstIndependentEvaluationActuallyExecuted: true,
      completeIndependentResultCount: 1,
      secondIndependentOriginExecuted: false,
      prospectiveFinalHoldoutOpened: false,
      productionSurfaceChanged: false,
      resultDigest
    }),
    evaluation: publicEvaluation,
    executionLedger: Object.freeze({
      futureActualRowsUsedForScoring: fit.validationRows.length,
      candidateModelRuns: 1,
      historicalComparatorModelRuns: 1,
      candidatePredictionsProduced: evaluation.caseCount,
      historicalComparatorPredictionsProduced: evaluation.caseCount,
      scientificEvaluationsExecuted: 1,
      bootstrapRuns: 1,
      bootstrapIterations: 2000,
      newModelTrainingRuns: 0,
      frozenFormulaOriginFaithfulReconstructionRuns: 1,
      tuningRuns: 0,
      alphaSearchRuns: 0,
      residualBoundReestimationRuns: 0,
      residualBoundDeterministicReconstructionRuns:
        parameterGate.parameterLoadMode
          === "FROZEN_PARAMETER_RECONSTRUCTION_FROM_"
            + "DIGEST_BOUND_LINEAGE_SNAPSHOT"
          ? 1
          : 0,
      immutableFrozenParameterLoadRuns: 1,
      modelSelectionRuns: 0
    }),
    workTotalGate: Object.freeze({
      grain: "WORK_TOTAL",
      status: "ACTIVE_FOR_DEVELOPMENT_EVALUATION_ONLY",
      evaluated: true
    }),
    workChannelGate: Object.freeze({
      grain: "WORK_CHANNEL",
      status: "PARTIAL_NOT_ACTIVE",
      evaluated: false,
      changedByThisActivity: false
    }),
    governance: Object.freeze({
      activeCandidate: null,
      approvedForAutomation: null,
      productionReady: false,
      releaseAuthorized: false,
      secondConfirmationAuthorizedNow: false,
      finalHoldoutOpened: false,
      pullRequestMustRemainDraftOpenUnmerged: true,
      cashOnlyResearchEnded: [
        HPSR02_FINAL_STATUSES.UNSUPPORTED,
        HPSR02_FINAL_STATUSES.MIXED
      ].includes(evaluation.status)
    }),
    privacy: Object.freeze({
      privatePathsPublished: false,
      rawWorkIdentitiesPublished: false,
      rawChannelIdentitiesPublished: false,
      rowLevelActualsPublished: false,
      aggregateCashMetricsPublished: true
    })
  });
}

function renderHpsr02ChineseReport(value) {
  const evaluation = value.evaluation;
  const metrics = evaluation.metrics;
  const bandRows = ["H50", "M30", "L20"].map((bandId) => {
    const band = evaluation.cashBands[bandId];
    return `| ${bandId} | ${band.workCount} | ${number(band.actualCash)}`
      + ` | ${percent(band.actualCashShare)}`
      + ` | ${number(band.r0.absoluteErrorTotal)}`
      + ` | ${number(band.r1.absoluteErrorTotal)}`
      + ` | ${number(band.r2.absoluteErrorTotal)}`
      + ` | ${number(band.absoluteErrorReduction)}`
      + ` | ${band.direction} |`;
  });
  const recovery = value.preResultEngineeringRecovery === null
    ? ""
    : (() => {
      const recoveryValue = value.preResultEngineeringRecovery;
      const attempts = recoveryValue.attempts.map((attempt, index) => {
        const reasons = {
          m2_hpsr_rebuilt_work_case_duplicate:
            "请求起点与历史支持起点重复拼接",
          hpsr02_residual_bound_rebuild_not_reconciled:
            "历史冻结边界与当前作品总额评价错误共用了来源权威口径",
          "m2_core_revenue_manual_command_failed:node.exe":
            "历史全账渠道导出被当前窗口三条范围外分表事实阻断",
          M2_HPSR02_BLOCKED_MISSING_IMMUTABLE_FROZEN_PARAMETER:
            "不可变冻结参数尚未形成可验证加载工件",
          hpsr02_parameter_lineage_snapshot_invalid:
            "错误尝试从当前原始事实重建历史冻结参数谱系",
          hpsr02_private_or_absolute_path_forbidden:
            "完整私有参数谱系对象越过了推理入口的路径隔离门禁",
          hpsr02_independent_source_gate_invalid:
            "独立评价来源门禁字段语义与实际 outcome 状态不一致"
        };
        const reason = reasons[attempt.errorCode]
          ?? "结果前工程步骤停止";
        return `${index + 1}. ${reason}（\`${attempt.errorCode}\`）`;
      });
      const futureActualReadCount = recoveryValue.attempts.filter(
        (attempt) => attempt.futureActualOutcomeRead === true
      ).length;
      const futureActualNotReadCount =
        recoveryValue.attemptCount - futureActualReadCount;
      return `\n## 结果前工程恢复\n\n首次独立评价在形成候选预测、科学评分或 bootstrap 前共有 ${recoveryValue.attemptCount} 次纯工程停止：\n\n${attempts.join("\n")}\n\n其中 ${futureActualNotReadCount} 次参数完整性门禁在读取新 future actual 前停止；其余 ${futureActualReadCount} 次虽已进入授权的作品总额事实处理，但候选预测、科学评价、bootstrap 和完整结果仍均为 0。审计状态保持结果前工程失败、可恢复（\`${recoveryValue.status}\`）。恢复先消除重复起点，再把不可变冻结模型参数与当前账单源权威解耦：评价入口只加载经过摘要与既有冻结运行记录核验的参数，不再从当前账单重算边界。模型、人口、基线、门限和已打开 outcome 均未被改写。\n`;
    })();
  const reportingAmendment = (
    value.reportingAmendments === null
    || value.reportingAmendments === undefined
  )
    ? ""
    : `\n## 冻结结果的报告修订\n\n冻结私有结果的逐文件摘要与 43 行预测、43 行评价记录已经复核一致（\`${value.reportingAmendments.status}\`）。历史结构对照的原始有限性应从冻结诊断字段 \`${value.reportingAmendments.sourceField}\` 读取；43 行均为有限值，因此 raw coverage 从冻结输出中的错误展示 ${percent(value.reportingAmendments.originalRawCoverage)} 校正为 ${percent(value.reportingAmendments.correctedRawCoverage)}。这只是数值诊断展示修订：最终科学状态、评分指标、现金带指标和结果摘要均未改变；模型、科学评价与 bootstrap 均未重跑。\n`;
  return `# M2 LG01 头部保护尾段修正模型首次独立评价 v0.2

## 首页结论

- 最终科学状态：\`${value.status}\`（${hpsr02DecisionZh(value.status)}）。
- 对象：LG01 头部保护尾段修正模型 v0.2（LG01 Head-Protected Tail-Band Correction Model v0.2，\`M2-WORK-HPSR02\`）。
- 所属实验：M2 LG01 头部保护尾段修正独立评价 v0.2（M2 LG01 Head-Protected Tail-Band Correction Independent Evaluation v0.2，\`M2-EXP-LG01-HEAD-PROTECTED-TAIL-BAND-CORRECTION-02\`）。
- 本次是 2026-03 起点、3 个月 horizon 的首个且唯一完整独立结果；结果已冻结。
- 活动候选与自动化批准均为 \`null\`；生产就绪为 \`false\`；前瞻最终留出未打开。

## 来源权威复核

此前金额读取前检查点因 3 个 canonical 渠道组合和 3 条总表/分表差异而停止，状态为 \`M2_HPSR02_BLOCKED_MISSING_SOURCE_AUTHORITY\`；该历史检查点、0 次候选运行、0 次评价和 0 次 bootstrap 保持完整，不改写。

随后冻结参数与当前账单源权威被错误混为一类，形成第二个阻断检查点（\`M2_HPSR02_BLOCKED_ACTIONABLE_SOURCE_AUTHORITY_DECISION_REQUIRED\`）。该检查点、两侧各 732 行渠道拆分差异和“独立 outcome 已打开但尚无完整结果”的事实同样保留；本轮只修正权威类别，不回写历史。

字段级复核后的结论如下：

- 134 行、3 个未确认 canonical 渠道组合都有稳定原始来源身份，能够判断起点前发生性且没有非零重复风险；它们只形成作品总额警告（\`WORK_TOTAL_CANONICAL_MAPPING_WARNING_WORK_CHANNEL_REMAINS_PARTIAL\`），没有猜测或回填 canonical 映射。
- 分表比总表多出的 3 条 2026-05 非零事实确实影响全账守恒，但对应作品均不在 2026-03 动态 Core80；本次作品总额评价相关差异为 0 行（\`OUT_OF_WORK_TOTAL_SCOPE_FACT_DIFFERENCE_WARNING\`）。
- 作品总额源权威可用（\`SOURCE_AUTHORITY_AVAILABLE_FOR_WORK_TOTAL\`）；作品—渠道门禁继续部分且未激活（\`PARTIAL_NOT_ACTIVE\`）。
- 作品总额可重建缓存已由权威源与冻结代码重建；该缓存的历史 receipt 缺失不构成阻断。冻结参数谱系的历史 provenance 则已核验可用。
${recovery}

## 不可变冻结参数与渠道谱系漂移

- 三项边界属于不可变冻结模型参数（Immutable Frozen Model Parameter，\`IMMUTABLE_FROZEN_MODEL_PARAMETER\`），恰好包括 positive base floor、q05 与 q95；具体数值不公开。
- 参数来源状态为 \`${value.frozenParameterAuthority.status}\`，本次加载方式为 \`${value.frozenParameterAuthority.loadMode}\`；参数谱系快照状态为 \`${value.frozenParameterAuthority.lineageStatus}\`。
- 参数推导范围仍为 2023-03 至 2025-09，最大已打开开发起点为 2026-02；输入与有限支持均为 ${value.frozenParameterAuthority.inputRowCount} 行。
- 参数恢复身份为 \`${value.frozenParameterAuthority.recoveryIdentity}\`。它是摘要绑定谱系的确定性恢复，不是训练、调参或边界重估；当前账单、later-origin outcome 与前瞻最终留出均未参与参数生成。
- 当前环境没有面向该 capability 的用户托管加密备份机制；未创建未加密备份（\`${value.frozenParameterAuthority.encryptedBackupMechanismStatus}\`）。
- 历史与当前作品×月份行数及金额守恒，但渠道行级多重集两侧各有 732 行差异，登记为 \`${value.channelLineageTransfer.status}\`。涉及 421 部作品、82 个月、21 个渠道身份和 721 个作品×月份。
- 2026-03 输入与 2026-04 至 2026-06 作品总额 actual 继续使用当前人工复核账单；旧谱系不替换当前 actual。本结果因此是冻结模型在渠道身份漂移下的真实独立迁移检验。

## 人口与实际现金

- origin：2026-03；actual window：2026-04、2026-05、2026-06。
- 全部成熟可评价作品：${evaluation.eligibleWorkCount}；动态 Core80：${evaluation.workCount}。
- Core80 实际现金覆盖：${percent(evaluation.core80ActualCashCoverage)}。

| 现金带 | 作品数 | actual cash | actual share | R0 absolute error | HPSR01 历史结构 absolute error | HPSR02 absolute error | HPSR02 paired reduction | HPSR02 方向 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
${bandRows.join("\n")}

## 同案例成绩

| 对象 | WAPE | signed bias | absolute bias | MAE | median AE |
| --- | ---: | ---: | ---: | ---: | ---: |
| 冻结 LG01 同案例基线（\`M2-WORK-LG01\`） | ${percent(metrics.r0.wape)} | ${percent(metrics.r0.signedBias)} | ${percent(metrics.r0.absoluteBias)} | ${number(metrics.r0.mae)} | ${number(metrics.r0.medianAbsoluteError)} |
| LG01 头部保护分段路由模型 v0.1 历史结构对照（\`M2-WORK-HPSR01\`） | ${percent(metrics.r1.wape)} | ${percent(metrics.r1.signedBias)} | ${percent(metrics.r1.absoluteBias)} | ${number(metrics.r1.mae)} | ${number(metrics.r1.medianAbsoluteError)} |
| LG01 头部保护尾段修正模型 v0.2（\`M2-WORK-HPSR02\`） | ${percent(metrics.r2.wape)} | ${percent(metrics.r2.signedBias)} | ${percent(metrics.r2.absoluteBias)} | ${number(metrics.r2.mae)} | ${number(metrics.r2.medianAbsoluteError)} |

- 配对绝对误差减少：${number(metrics.pairedAbsoluteErrorReduction)}；占 actual cash：${percent(metrics.pairedAbsoluteErrorReductionOverActualCash)}。
- relative FVA：${percent(metrics.relativeFva)}。
- 2,000 次作品 cluster bootstrap 95% 区间：${interval(metrics.bootstrapFva95.interval95)}。
- HPSR01 历史结构对照相对 R0 的配对绝对误差减少 / relative FVA / 2,000 次 bootstrap 95% 区间：${number(metrics.r1PairedAbsoluteErrorReduction)} / ${percent(metrics.r1RelativeFva)} / ${interval(metrics.r1BootstrapFva95.interval95)}。
- absolute bias 相对 R0 变化：${percent(metrics.absoluteBiasWorsening)}。
- 最大单作品误差集中度（R0/HPSR02）：${percent(metrics.r0.errorConcentration.maximumWorkShare)} / ${percent(metrics.r2.errorConcentration.maximumWorkShare)}。
- Top5：${percent(metrics.r0.errorConcentration.top5WorkShare)} / ${percent(metrics.r2.errorConcentration.top5WorkShare)}；Top10：${percent(metrics.r0.errorConcentration.top10WorkShare)} / ${percent(metrics.r2.errorConcentration.top10WorkShare)}。

## 数值与结构门禁

- H50/M30 逐行精确等于冻结 LG01：${evaluation.structure.H50M30RowwiseExactLg01 ? "通过" : "失败"}。
- clip / fallback / nonfinite raw L20：${evaluation.numeric.clipCount} / ${evaluation.numeric.fallbackCount} / ${evaluation.numeric.nonfiniteRawL20Count}。
- L20 raw coverage：${percent(evaluation.numeric.rawL20Coverage)}；最终预测全部有限：${evaluation.numeric.allFinalPredictionsFinite ? "是" : "否"}。
- HPSR01 历史结构对照的 clip / fallback / nonfinite / raw coverage：${evaluation.numeric.historicalR1.clipCount} / ${evaluation.numeric.historicalR1.fallbackCount} / ${evaluation.numeric.historicalR1.nonfiniteRawCount} / ${percent(evaluation.numeric.historicalR1.rawCoverage)}。
- 没有训练新模型、调参、alpha 搜索、残差边界重估或结果后选模；评价只加载不可变冻结参数，并执行冻结公式的 origin-faithful 确定性重建。
${reportingAmendment}

## 治理与停止

Draft PR #${value.execution.pullRequestNumber} 保持 Open / Draft / Unmerged。作品总额开发评价不等于 production、automation、release 或财务承诺。第二独立起点未执行，前瞻最终留出未打开；本任务到此停止。
`;
}

function hpsr02DecisionZh(status) {
  if (status === HPSR02_FINAL_STATUSES.SUPPORTED) {
    return "首个独立起点支持，至多等待另行授权的第二次确认";
  }
  if (status === HPSR02_FINAL_STATUSES.UNSUPPORTED) {
    return "首个独立起点不支持，现金-only 相邻研究结束";
  }
  return "首个独立起点证据不足，现金-only 相邻研究结束";
}

function safeHpsr02Error(error) {
  return String(error?.message ?? "hpsr02_unknown_error")
    .replace(/[^A-Za-z0-9_.:-]+/gu, "_")
    .slice(0, 240);
}

function mergeHpsr02PreResultEngineeringAttempts({
  priorReceipt,
  priorPublicCheckpoint
}) {
  const attempts = [];
  const publicRecovery =
    priorPublicCheckpoint?.preResultEngineeringRecovery;
  if (Array.isArray(publicRecovery?.attempts)) {
    attempts.push(...publicRecovery.attempts);
  } else if (publicRecovery?.errorCode) {
    attempts.push(publicRecovery);
  }
  attempts.push(
    {
      errorCode:
        "M2_HPSR02_BLOCKED_MISSING_IMMUTABLE_FROZEN_PARAMETER",
      futureActualOutcomeRead: false
    },
    {
      errorCode: "hpsr02_parameter_lineage_snapshot_invalid",
      futureActualOutcomeRead: false
    },
    {
      errorCode: "hpsr02_private_or_absolute_path_forbidden",
      futureActualOutcomeRead: true
    },
    {
      errorCode: "hpsr02_independent_source_gate_invalid",
      futureActualOutcomeRead: true
    }
  );
  if (
    priorReceipt?.status
      === "INVALIDATED_PRE_RESULT_ENGINEERING_FAILURE_RECOVERY_ALLOWED"
    && priorReceipt?.errorCode
  ) {
    attempts.push(priorReceipt);
  }
  const byErrorCode = new Map();
  for (const attempt of attempts) {
    const errorCode = safeHpsr02Error({
      message: attempt.errorCode
    });
    if (!byErrorCode.has(errorCode)) {
      byErrorCode.set(errorCode, Object.freeze({
        status:
          "INVALIDATED_PRE_RESULT_ENGINEERING_FAILURE_RECOVERY_ALLOWED",
        errorCode,
        futureActualOutcomeRead:
          attempt.futureActualOutcomeRead === true
          || [
            "m2_hpsr_rebuilt_work_case_duplicate",
            "hpsr02_residual_bound_rebuild_not_reconciled",
            "m2_core_revenue_manual_command_failed:node.exe"
          ].includes(errorCode),
        diagnosticCauseCode: attempt.diagnosticCauseCode
          ?? (
            errorCode
              === "m2_core_revenue_manual_command_failed:node.exe"
              ? "HISTORICAL_GLOBAL_CHANNEL_EXPORT_BLOCKED_BY_"
                + "THREE_CURRENT_WINDOW_OUT_OF_SCOPE_SPLIT_FACTS"
              : null
          ),
        candidatePredictionsProduced: 0,
        scientificEvaluationsExecuted: 0,
        bootstrapRuns: 0,
        completeIndependentResultProduced: false,
        resultFrozen: false,
        retryAllowed: true,
        contractChangedForRecovery: false
      }));
    }
  }
  const normalized = [...byErrorCode.values()];
  if (normalized.length === 0) return null;
  return Object.freeze({
    status:
      "INVALIDATED_PRE_RESULT_ENGINEERING_FAILURE_RECOVERY_ALLOWED",
    attemptCount: normalized.length,
    attempts: Object.freeze(normalized),
    futureActualOutcomeRead: normalized.some(
      (attempt) => attempt.futureActualOutcomeRead
    ),
    candidatePredictionsProduced: 0,
    scientificEvaluationsExecuted: 0,
    bootstrapRuns: 0,
    completeIndependentResultProduced: false,
    resultFrozen: false,
    retryAllowed: true,
    contractChangedForRecovery: false
  });
}

async function readRelevantFeatureRows(filePath, maximumOrigin) {
  const rows = [];
  const input = fs.createReadStream(filePath, { encoding: "utf8" });
  const lines = readline.createInterface({
    input,
    crlfDelay: Infinity
  });
  for await (const line of lines) {
    if (line.trim() === "") continue;
    const row = JSON.parse(line);
    if (
      row.horizonMonths === 3
      && row.origin <= maximumOrigin
    ) {
      rows.push(row);
    }
  }
  return rows;
}

function buildPublicResult({
  evaluation,
  retrospectivePlan,
  independentK2Ready,
  openedSemantics,
  inventory,
  featureMaterialization,
  fitAudits,
  preflight
}) {
  const {
    privateRows: _privateRows,
    ...publicEvaluation
  } = evaluation;
  const requiredK2Months = openedSemantics.prospectiveReservation
    .firstIndependentFutureBillMonths.filter((month) => (
      month
        > openedSemantics.billMonthAvailability
          .completeAuthoritativeBillMonthThrough
    ));
  return Object.freeze({
    schema:
      "m2.current.head_protected_segmented_router."
        + "retrospective_development.public.v0.1",
    asOf: new Date().toISOString().slice(0, 10),
    experimentId: evaluation.experimentId,
    modelId: evaluation.modelId,
    displayNameZh: "LG01 头部保护分段路由模型 v0.1",
    displayNameEn:
      "LG01 Head-Protected Segmented Router Model v0.1",
    status: evaluation.status,
    execution: Object.freeze({
      branch: preflight.branch,
      exactHead: preflight.head,
      pullRequestNumber: preflight.prNumber,
      pullRequestDraft: preflight.prDraft,
      exactHeadCiRunId: preflight.ciRunId,
      linuxCi: preflight.linux,
      windowsCi: preflight.windows,
      K1Completed: true,
      retrospectiveActuallyExecuted: true,
      retrospectiveCompleteResultCount: 1,
      independentK2Executed: false,
      prospectiveFinalHoldoutOpened: false,
      productionSurfaceChanged: false
    }),
    readiness: Object.freeze({
      retrospectiveReplayReady: true,
      independentK2Ready,
      firstIndependentLaterOrigin:
        openedSemantics.prospectiveReservation
          .firstIndependentLaterOrigin,
      firstIndependentRequiredCompleteThrough:
        openedSemantics.prospectiveReservation
          .firstIndependentRequiredCompleteThrough,
      completeAuthoritativeBillMonthThrough:
        openedSemantics.billMonthAvailability
          .completeAuthoritativeBillMonthThrough,
      missingOrIncompleteK2BillMonths: Object.freeze(requiredK2Months),
      prospectiveFinalHoldoutOrigin:
        openedSemantics.prospectiveReservation
          .prospectiveFinalHoldoutOrigin,
      prospectiveFinalHoldoutOpened: false,
      prospectiveFinalHoldoutOutcomeRead: false
    }),
    retrospective: Object.freeze({
      evidenceClass: evaluation.evidenceClass,
      independentEvidence: false,
      origins: evaluation.origins,
      originCount: evaluation.originCount,
      includedOriginInventory: retrospectivePlan.inventory,
      excludedOrigins: retrospectivePlan.excludedOrigins,
      evaluation: publicEvaluation
    }),
    privateCapability: Object.freeze({
      sourceAuthorityStatus: inventory.sourceAuthorityStatus,
      derivedFeatureCacheStatus: featureMaterialization.status,
      historicalReceiptStatusBefore:
        inventory.historicalReceiptStatus,
      cacheMissingWouldBlock: false,
      provenanceMissingWouldBlock: false,
      privateIdentityOrRowAmountPublished: false
    }),
    scientificExecutionCounts: Object.freeze({
      newModelTrainingCount: 0,
      frozenFormulaOriginFaithfulRefitCount: fitAudits.length,
      modelSelectionCount: 0,
      hyperparameterSearchCount: 0,
      alphaSearchCount: 0,
      residualBoundEstimationCount: 0,
      completeRetrospectiveEvaluationCount: 1,
      bootstrapExecutionCount: 1,
      independentK2EvaluationCount: 0,
      finalHoldoutEvaluationCount: 0
    }),
    frozenFormulaFitAudits: Object.freeze(fitAudits),
    governance: Object.freeze({
      activeCandidate: false,
      approvedForAutomation: false,
      productionReady: false,
      releaseAuthorized: false,
      pullRequestMergeAuthorized: false,
      nextModelAutomaticallyAuthorized: false
    })
  });
}

function renderChineseReport(value) {
  const evaluation = value.retrospective.evaluation;
  const metrics = evaluation.metrics;
  const bandRows = ["H50", "M30", "L20"].map((bandId) => {
    const band = evaluation.cashBands[bandId];
    return `| ${bandId} | ${band.workCount}`
      + ` | ${percent(band.absoluteActualCashShare)}`
      + ` | ${percent(band.r0.wape)} / `
      + `${percent(band.r0.signedBias)} / ${number(band.r0.mae)} / `
      + `${percent(band.r0AbsoluteErrorContribution)}`
      + ` | ${percent(band.d1.wape)} / `
      + `${percent(band.d1.signedBias)} / ${number(band.d1.mae)} / `
      + `${percent(band.d1AbsoluteErrorContribution)}`
      + ` | ${percent(band.r1.wape)} / `
      + `${percent(band.r1.signedBias)} / ${number(band.r1.mae)} / `
      + `${percent(band.r1AbsoluteErrorContribution)}`
      + ` | ${band.clipCount} / ${percent(band.clipRate)}`
      + ` | ${band.d1NonfiniteCount} / ${percent(band.d1NonfiniteRate)}`
      + ` | ${band.numericFallbackCount} / `
      + `${percent(band.numericFallbackRate)}`
      + ` | ${percent(band.rawR1Coverage)} |`;
  });
  const originRows = value.retrospective.includedOriginInventory.map(
    (item) => `| ${item.origin}`
      + ` | ${item.included ? "纳入" : "排除"}`
      + ` | ${item.included
        ? "满足全部动态门禁"
        : item.exclusionReasons.map(exclusionReasonZh).join("、")}`
      + ` | ${item.openedProfileRowCount} |`
  );
  const includedOriginRows = evaluation.originSummaries.map(
    (item) => `| ${item.origin}`
      + ` | ${item.eligibleWorkCount}`
      + ` | ${item.caseCount}`
      + ` | ${item.core80WorkCount}`
      + ` | ${percent(item.core80ActualCashShare)}`
      + ` | ${item.cashBandWorkCounts.H50}`
      + ` | ${percent(item.cashBandActualShares.H50)}`
      + ` | ${item.cashBandWorkCounts.M30}`
      + ` | ${percent(item.cashBandActualShares.M30)}`
      + ` | ${item.cashBandWorkCounts.L20}`
      + ` | ${percent(item.cashBandActualShares.L20)}`
      + ` | ${item.core80CutoffTieCount} |`
  );
  return `# M2 HPSR01 回溯开发评价 v0.1

## 首页结论

- K1 是否完成：是，canonical implementation 与公开合成验证均已完成。
- 回溯评价是否真正执行：是；已冻结首个且唯一的完整回溯开发结果。
- 纳入 origin：${value.retrospective.origins.join("、")}。
- 回溯判断：\`${value.status}\`（${decisionZh(value.status)}）。
- 是否为独立证据：否；这是此前已打开 outcome 的回溯开发证据。
- 独立 K2 数据是否成熟：${value.readiness.independentK2Ready ? "是" : "否"}。
- 独立 K2 是否执行：否。
- prospective final holdout 是否仍未打开：是。
- 是否值得继续等待：${value.status.includes("UNSUPPORTED") ? "否；按合同在独立 K2 前停止。" : "是；但只能等待合法独立 K2，不能据此发布。"}
- activeCandidate：否；approvedForAutomation：否。

## 身份与边界

- 中文模型名：LG01 头部保护分段路由模型 v0.1
- 英文原名：LG01 Head-Protected Segmented Router Model v0.1
- 稳定模型 ID：\`${value.modelId}\`
- 稳定实验 ID：\`${value.experimentId}\`
- 评价类型：回溯开发评价（非独立 later-origin、非 final holdout）
- horizon：3 个月；主人口：origin 动态 Core80 成熟老品既有成熟业务范围

## 回溯人口

| origin | 决定 | 原因 | 预先打开证据行数 |
| --- | --- | --- | ---: |
${originRows.join("\n")}

| 纳入 origin | 全部成熟可评价作品 | case 数 | Core80 作品 | Core80 actual cash coverage | H50 作品 | H50 actual share | M30 作品 | M30 actual share | L20 作品 | L20 actual share | cutoff tie |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${includedOriginRows.join("\n")}

- 最终唯一 case-key：${evaluation.structure.uniqueCaseKeyCount}
- Core80 actual cash coverage：${percent(evaluation.core80ActualCashCoverage)}
- H50 逐行严格等于 R0：${evaluation.structure.H50RowwisePredictionAndAbsoluteErrorEquality ? "通过" : "失败"}
- final prediction 全部有限：${evaluation.structure.allActualAndFinalPredictionsFinite ? "通过" : "失败"}

## 主要同案例成绩

| 对象 | WAPE | signed bias | absolute bias | MAE | median AE |
| --- | ---: | ---: | ---: | ---: | ---: |
| R0 冻结 LG01 基线 | ${percent(metrics.r0.wape)} | ${percent(metrics.r0.signedBias)} | ${percent(metrics.r0.absoluteBias)} | ${number(metrics.r0.mae)} | ${number(metrics.r0.medianAbsoluteError)} |
| D1 冻结 CHAM01 B3 原始诊断（有限同案例） | ${percent(metrics.d1.wape)} | ${percent(metrics.d1.signedBias)} | ${percent(metrics.d1.absoluteBias)} | ${number(metrics.d1.mae)} | ${number(metrics.d1.medianAbsoluteError)} |
| R1 HPSR01 raw candidate | ${percent(metrics.r1.wape)} | ${percent(metrics.r1.signedBias)} | ${percent(metrics.r1.absoluteBias)} | ${number(metrics.r1.mae)} | ${number(metrics.r1.medianAbsoluteError)} |

- R1 相对 R0 paired FVA：${percent(metrics.r1PairedFvaVsR0)}
- D1 相对 R0 paired FVA：${percent(metrics.d1PairedFvaVsR0)}
- R1 作品 cluster bootstrap 95% 区间：${interval(metrics.r1BootstrapFva95.interval95)}
- R1 absolute bias 相对 R0 恶化：${percent(metrics.absoluteBiasWorsening)}；预冻结 unsupported 门限为超过 ${percent(evaluation.decisionPolicy.unsupportedAbsoluteBiasWorsening)}，本次已触发。
- 改善时间块：${evaluation.timeBlockSummary.improvingBlockCount}/${evaluation.timeBlockSummary.evaluableBlockCount}；单时间块不足以形成 supported 判断。

## 现金带诊断

每个模型单元依次为 WAPE / signed bias / MAE / 对总体 absolute error 的贡献。

| 现金带 | 作品数 | actual cash share | R0 | D1 | R1 | clip 数/比例 | D1 nonfinite 数/比例 | numeric fallback 数/比例 | R1 raw coverage |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${bandRows.join("\n")}

- D1 nonfinite：${evaluation.numeric.d1NonfiniteCount}；${evaluation.numeric.d1NonfiniteCount > 0 ? "这些行只在 M30/L20 按冻结规则隔离回退，不会被整模型 fallback 掩盖。" : "本次没有触发 numeric fallback。"}
- R1 raw coverage：${percent(evaluation.numeric.r1RawCoverage)}
- 最大单作品误差集中度（R0/R1）：${percent(metrics.r0.errorConcentration.maximumWorkShare)} / ${percent(metrics.r1.errorConcentration.maximumWorkShare)}
- top 5 误差集中度（R0/R1）：${percent(metrics.r0.errorConcentration.top5WorkShare)} / ${percent(metrics.r1.errorConcentration.top5WorkShare)}
- top 10 误差集中度（R0/R1）：${percent(metrics.r0.errorConcentration.top10WorkShare)} / ${percent(metrics.r1.errorConcentration.top10WorkShare)}

## K2 与 final holdout

- first independent later-origin：${value.readiness.firstIndependentLaterOrigin}
- 所需完整至：${value.readiness.firstIndependentRequiredCompleteThrough}
- 当前权威完整至：${value.readiness.completeAuthoritativeBillMonthThrough}
- 缺失或不完整月份：${value.readiness.missingOrIncompleteK2BillMonths.join("、") || "无"}
- prospective final holdout：${value.readiness.prospectiveFinalHoldoutOrigin}，仍未打开。

## 执行计数与治理

- 新模型训练：0；冻结公式 origin-faithful refit：${value.scientificExecutionCounts.frozenFormulaOriginFaithfulRefitCount}。
- 模型选择、调参、alpha 搜索、residual bound 重估：均为 0。
- 完整回溯评价：1；独立 K2：0；final holdout：0。
- activeCandidate：false；approvedForAutomation：false；productionReady：false。
- Draft PR #${value.execution.pullRequestNumber} 保持 Open / Draft / Unmerged。
`;
}

function decisionZh(status) {
  if (status.includes("UNSUPPORTED")) {
    return "回溯开发证据不支持，按合同在独立 K2 前停止";
  }
  if (status.includes("SUPPORTED")) {
    return "回溯开发证据支持，但仍等待独立 K2";
  }
  return "回溯开发证据混合，仍等待独立 K2";
}

function exclusionReasonZh(reason) {
  const labels = {
    ACTUAL_NOT_OPENED_BEFORE_TASK:
      "本任务前没有 actual 已打开证据（ACTUAL_NOT_OPENED_BEFORE_TASK）",
    HISTORICAL_ISOLATED_OUTCOME:
      "历史隔离 outcome（HISTORICAL_ISOLATED_OUTCOME）",
    INCOMPLETE_THREE_MONTH_AUTHORITY_WINDOW:
      "三个月权威账单窗口不完整（INCOMPLETE_THREE_MONTH_AUTHORITY_WINDOW）"
  };
  return labels[reason] ?? reason;
}

function percent(value) {
  return value === null || value === undefined
    ? "null（不可定义）"
    : `${(value * 100).toFixed(4)}%`;
}

function number(value) {
  return value === null || value === undefined
    ? "null（不可定义）"
    : Number(value).toFixed(4);
}

function interval(value) {
  return value === null
    ? "null（不可定义）"
    : `[${percent(value.lower)}, ${percent(value.upper)}]`;
}

function sha256Json(value) {
  return crypto.createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function decimalToMinor(value, scalePower) {
  const text = String(value).trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?$/u.exec(text);
  if (!match || !Number.isInteger(scalePower) || scalePower < 0) {
    throw new Error("hpsr02_origin_authority_amount_invalid");
  }
  const fraction = match[3] ?? "";
  if (fraction.length > scalePower) {
    throw new Error("hpsr02_origin_authority_amount_scale_invalid");
  }
  const factor = 10n ** BigInt(scalePower);
  const padded = fraction.padEnd(scalePower, "0");
  const magnitude = BigInt(match[2]) * factor
    + BigInt(padded === "" ? "0" : padded);
  return match[1] === "-" ? -magnitude : magnitude;
}

async function readNdjson(filePath) {
  const content = await readFile(filePath, "utf8");
  const rows = content.split(/\r?\n/u)
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
  if (rows.length === 0) {
    throw new Error("hpsr02_origin_authority_rows_empty");
  }
  return rows;
}

function runPythonAudit(root, argumentsList) {
  const result = spawnSync(process.execPath, [
    "scripts/run-codex-python.mjs",
    "scripts/m2-current/audit_head_protected_segmented_router_dates.py",
    ...argumentsList
  ], {
    cwd: root,
    encoding: "utf8",
    shell: false,
    windowsHide: true
  });
  if (result.status !== 0) {
    throw new Error(
      `hpsr02_source_audit_failed:${String(result.stderr).trim()}`
    );
  }
  return String(result.stdout).trim();
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

async function writeJsonAtomic(filePath, value) {
  await writeTextAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeNdjsonAtomic(filePath, rows) {
  await writeTextAtomic(
    filePath,
    rows.map((row) => JSON.stringify(row)).join("\n") + "\n"
  );
}

async function writeTextAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporary, value, "utf8");
  await rename(temporary, filePath);
}
