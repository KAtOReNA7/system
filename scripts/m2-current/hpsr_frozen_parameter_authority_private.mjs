import crypto from "node:crypto";
import fs from "node:fs";
import {
  mkdir,
  readFile,
  rename,
  writeFile
} from "node:fs/promises";
import path from "node:path";

import {
  deriveHpsrResidualBounds,
  evaluateHpsrRetrospectiveDevelopment,
  runHeadProtectedSegmentedRouter
} from "../../src/domain/m2Current/headProtectedSegmentedRouter.js";
import {
  materializeM2HpsrFrozenFormulaFeatureRows
} from "./core_legacy_horizon_amount_mode.mjs";
import {
  fitHpsrFrozenB3AtOrigin
} from "./hpsr_frozen_formula_private.mjs";

const RECOVERY_ALGORITHM_VERSION =
  "M2_HPSR_FROZEN_PARAMETER_RECOVERY_V0_2";
const RECOVERY_IDENTITY =
  "FROZEN_PARAMETER_RECONSTRUCTION_FROM_"
    + "DIGEST_BOUND_LINEAGE_SNAPSHOT";
const FROZEN_SOURCE_CLASS =
  "FROZEN_FROM_PREVIOUSLY_OPENED_DEVELOPMENT_ONLY";
const LINEAGE_AUTHORITY_MODE =
  "HPSR_FROZEN_PARAMETER_LINEAGE_SNAPSHOT";
const HISTORICAL_FACTS =
  "data/private-output/m2-evaluation-v2-2-reversal-rescore/"
    + "M2-reversal-authority-facts-private-v1.ndjson";
const HISTORICAL_RECEIPT =
  "data/private-output/m2-evaluation-v2-2-reversal-rescore/"
    + "M2-reversal-authority-export-receipt-private-v1.json";
const STATIC_METADATA =
  "data/private-output/m2-core-revenue-manual/"
    + "M2-core-revenue-manual-static-metadata-private-v0.1.json";
const HCRC_LINEAGE_DIRECTORY =
  "data/private-output/m2-lg01-head-cash-residual";
const HCRC_LINEAGE_INPUT =
  `${HCRC_LINEAGE_DIRECTORY}/`
    + "M2-lg01-head-cash-residual-input-rows-private-v0.1.ndjson";
const HCRC_LINEAGE_MANIFEST =
  `${HCRC_LINEAGE_DIRECTORY}/`
    + "M2-lg01-head-cash-residual-manifest-private-v0.1.json";
const HCRC_LINEAGE_RECEIPT =
  `${HCRC_LINEAGE_DIRECTORY}/`
    + "M2-lg01-head-cash-residual-attempt-receipt-private-v0.1.json";
const HCRC_LINEAGE_FILES = Object.freeze({
  inputRows:
    "M2-lg01-head-cash-residual-input-rows-private-v0.1.ndjson",
  predictions:
    "M2-lg01-head-cash-residual-predictions-private-v0.1.ndjson",
  selections:
    "M2-lg01-head-cash-residual-selections-private-v0.1.ndjson",
  evaluation:
    "M2-lg01-head-cash-residual-evaluation-private-v0.1.ndjson",
  bootstrap:
    "M2-lg01-head-cash-residual-bootstrap-private-v0.1.ndjson"
});
const HISTORICAL_FROZEN_RESULT =
  "docs/analysis/m2-current/"
    + "M2-head-protected-segmented-router-"
    + "retrospective-development-v0.1.json";

export async function loadOrRecoverHpsrImmutableFrozenParameters({
  root,
  hpsr01Config,
  coreAmountConfig,
  boundProof
}) {
  const paths = resolveParameterPaths(hpsr01Config);
  const artifactPath = path.join(root, paths.parameterArtifact);
  const snapshotPath = path.join(root, paths.lineageSnapshot);
  const manifestPath = path.join(root, paths.recoveryManifest);
  const [artifact, snapshotPresent, manifest] = await Promise.all([
    readJsonIfPresent(artifactPath),
    fileExists(snapshotPath),
    readJsonIfPresent(manifestPath)
  ]);

  if (artifact !== null && snapshotPresent && manifest !== null) {
    const snapshotRows = await readNdjson(snapshotPath);
    const validation = await validateParameterBundle({
      root,
      paths,
      artifact,
      snapshotRows,
      manifest,
      hpsr01Config,
      boundProof
    });
    return Object.freeze({
      boundState: Object.freeze(artifact),
      parameterArtifact: Object.freeze(artifact),
      parameterAuthorityStatus:
        "IMMUTABLE_FROZEN_MODEL_PARAMETER_VALIDATED",
      parameterLoadMode: "DIRECT_VALIDATED_ARTIFACT_LOAD",
      parameterRecoveryIdentity: artifact.recoveryIdentity,
      parameterLineageStatus: validation.parameterLineageStatus,
      historicalReceiptStatus: validation.historicalReceiptStatus,
      channelLineageDriftStatus:
        "HISTORICAL_CHANNEL_LINEAGE_DRIFT_WITH_"
          + "WORK_MONTH_CASH_CONSERVED",
      inputRowCount: artifact.inputRowCount,
      finiteSupportRowCount: artifact.finiteSupportRowCount,
      publicParameterValuesPublished: false
    });
  }

  if (artifact === null && snapshotPresent && manifest !== null) {
    const snapshotRows = await readNdjson(snapshotPath);
    validateLineageSnapshotRows(snapshotRows, {
      hpsr01Config,
      boundProof
    });
    const derived = deriveFromSnapshot({
      snapshotRows,
      hpsr01Config,
      boundProof
    });
    const rebuiltArtifact = buildParameterArtifact({
      boundState: derived,
      snapshotDigest: await sha256File(snapshotPath),
      bindings: manifest.bindings,
      hpsr01Config
    });
    if (
      manifest.parameterPayloadSha256
        !== rebuiltArtifact.parameterPayloadSha256
    ) {
      throw missingImmutableParameterError(
        "hpsr02_frozen_parameter_snapshot_payload_digest_mismatch"
      );
    }
    await writeJsonAtomic(artifactPath, rebuiltArtifact);
    const updatedManifest = {
      ...manifest,
      parameterArtifactSha256: await sha256File(artifactPath),
      lastRecoveryMode: RECOVERY_IDENTITY
    };
    await writeJsonAtomic(manifestPath, updatedManifest);
    const validation = await validateParameterBundle({
      root,
      paths,
      artifact: rebuiltArtifact,
      snapshotRows,
      manifest: updatedManifest,
      hpsr01Config,
      boundProof
    });
    return Object.freeze({
      boundState: Object.freeze(rebuiltArtifact),
      parameterArtifact: Object.freeze(rebuiltArtifact),
      parameterAuthorityStatus:
        "IMMUTABLE_FROZEN_MODEL_PARAMETER_VALIDATED",
      parameterLoadMode: RECOVERY_IDENTITY,
      parameterRecoveryIdentity: RECOVERY_IDENTITY,
      parameterLineageStatus: validation.parameterLineageStatus,
      historicalReceiptStatus: validation.historicalReceiptStatus,
      channelLineageDriftStatus:
        "HISTORICAL_CHANNEL_LINEAGE_DRIFT_WITH_"
          + "WORK_MONTH_CASH_CONSERVED",
      inputRowCount: rebuiltArtifact.inputRowCount,
      finiteSupportRowCount: rebuiltArtifact.finiteSupportRowCount,
      publicParameterValuesPublished: false
    });
  }

  if (!historicalLineageInputsPresent(root)) {
    throw missingImmutableParameterError(
      "hpsr02_immutable_parameter_and_lineage_snapshot_missing"
    );
  }

  const reconstruction = await reconstructFromHistoricalLineage({
    root,
    paths,
    hpsr01Config,
    coreAmountConfig,
    boundProof
  });
  if (artifact !== null) {
    assertParameterArtifactsEqual(artifact, reconstruction.artifact);
  } else {
    await writeJsonAtomic(artifactPath, reconstruction.artifact);
  }
  await writeTextAtomic(snapshotPath, reconstruction.snapshotText);
  const parameterArtifactSha256 = await sha256File(artifactPath);
  const recoveryManifest = {
    ...reconstruction.manifest,
    parameterArtifactSha256
  };
  await writeJsonAtomic(manifestPath, recoveryManifest);
  await validateParameterBundle({
    root,
    paths,
    artifact: reconstruction.artifact,
    snapshotRows: reconstruction.snapshotRows,
    manifest: recoveryManifest,
    hpsr01Config,
    boundProof
  });
  return Object.freeze({
    boundState: Object.freeze(reconstruction.artifact),
    parameterArtifact: Object.freeze(reconstruction.artifact),
    parameterAuthorityStatus:
      "IMMUTABLE_FROZEN_MODEL_PARAMETER_VALIDATED",
    parameterLoadMode: RECOVERY_IDENTITY,
    parameterRecoveryIdentity: RECOVERY_IDENTITY,
    parameterLineageStatus: "PARAMETER_LINEAGE_SNAPSHOT_VALIDATED",
    historicalReceiptStatus: "PROVENANCE_AVAILABLE",
    channelLineageDriftStatus:
      "HISTORICAL_CHANNEL_LINEAGE_DRIFT_WITH_"
        + "WORK_MONTH_CASH_CONSERVED",
    inputRowCount: reconstruction.artifact.inputRowCount,
    finiteSupportRowCount:
      reconstruction.artifact.finiteSupportRowCount,
    publicParameterValuesPublished: false
  });
}

export function validateImmutableHpsrFrozenParameterArtifact(
  artifact,
  { hpsr01Config, boundProof }
) {
  const expectedKeys = [
    "frozenDevelopmentPositiveBaseFloor",
    "frozenDevelopmentQ05",
    "frozenDevelopmentQ95"
  ];
  const parameterValues = artifact?.parameterValues;
  const actualKeys = parameterValues && typeof parameterValues === "object"
    ? Object.keys(parameterValues).sort()
    : [];
  const expectedRange = hpsr01Config
    .residualBoundaryFreeze.sourceOriginRange;
  if (
    artifact?.schema
      !== "m2.current.hpsr.immutable_frozen_parameters.private.v0.2"
    || artifact?.artifactClass !== "IMMUTABLE_FROZEN_MODEL_PARAMETER"
    || artifact?.status !== FROZEN_SOURCE_CLASS
    || artifact?.sourceClass !== FROZEN_SOURCE_CLASS
    || artifact?.modelIds?.length !== 2
    || artifact.modelIds[0] !== "M2-WORK-HPSR01"
    || artifact.modelIds[1] !== "M2-WORK-HPSR02"
    || JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)
    || !Number.isFinite(
      parameterValues?.frozenDevelopmentPositiveBaseFloor
    )
    || parameterValues.frozenDevelopmentPositiveBaseFloor <= 0
    || !Number.isFinite(parameterValues?.frozenDevelopmentQ05)
    || !Number.isFinite(parameterValues?.frozenDevelopmentQ95)
    || parameterValues.frozenDevelopmentQ05
      > parameterValues.frozenDevelopmentQ95
    || artifact?.derivationOriginRange?.from !== expectedRange.from
    || artifact?.derivationOriginRange?.through !== expectedRange.through
    || artifact?.maximumOpenedDevelopmentOrigin
      !== hpsr01Config.residualBoundaryFreeze
        .maximumOpenedDevelopmentOrigin
    || artifact?.inputRowCount !== boundProof.inputRowCount
    || artifact?.finiteSupportRowCount
      !== boundProof.finiteSupportRowCount
    || artifact?.excludedNonfiniteRowCount
      !== boundProof.excludedNonfiniteRowCount
    || artifact?.positiveBaseSupportRowCount
      !== boundProof.positiveBaseSupportRowCount
    || artifact?.laterOriginOutcomeUsed !== false
    || artifact?.prospectiveFinalHoldoutOutcomeUsed !== false
    || artifact?.actualFieldConsumedForBoundDerivation !== false
    || artifact?.currentBillSourceUsedForParameterDerivation !== false
    || artifact?.publicParameterValuesPublished !== false
    || artifact?.recoveryIdentity !== RECOVERY_IDENTITY
    || artifact?.recoveryAlgorithmVersion !== RECOVERY_ALGORITHM_VERSION
  ) {
    throw missingImmutableParameterError(
      "hpsr02_immutable_frozen_parameter_artifact_invalid"
    );
  }
  const payloadDigest = computeHpsrFrozenParameterPayloadDigest(artifact);
  if (artifact.parameterPayloadSha256 !== payloadDigest) {
    throw missingImmutableParameterError(
      "hpsr02_immutable_frozen_parameter_payload_digest_mismatch"
    );
  }
  return Object.freeze({
    valid: true,
    parameterPayloadSha256: payloadDigest
  });
}

async function reconstructFromHistoricalLineage({
  root,
  paths,
  hpsr01Config,
  coreAmountConfig,
  boundProof
}) {
  const hcrcLineage = await loadFrozenHcrcParameterLineage({
    root,
    hpsr01Config,
    boundProof
  });
  const receipt = await readJson(path.join(root, HISTORICAL_RECEIPT));
  const factsDigest = await sha256File(path.join(root, HISTORICAL_FACTS));
  if (
    receipt?.schema !== "m2.reversal-authority-export.private.v1"
    || receipt?.status !== "READY"
    || receipt?.authorityFactsSha256 !== factsDigest
  ) {
    throw missingImmutableParameterError(
      "hpsr02_historical_parameter_lineage_receipt_invalid"
    );
  }
  const historicalCutoff = hpsr01Config.residualBoundaryFreeze
    .maximumOpenedDevelopmentOrigin;
  const replayOrigin = "2025-11";
  const materialization =
    await materializeM2HpsrFrozenFormulaFeatureRows({
      root,
      retrospectiveOrigins: [replayOrigin],
      authorityMode: LINEAGE_AUTHORITY_MODE,
      labelMaturityCutoff: historicalCutoff
    });
  if (
    materialization.sourceAuthority.authorityMode
      !== LINEAGE_AUTHORITY_MODE
    || materialization.sourceAuthority.labelMaturityCutoff
      !== historicalCutoff
    || materialization.futureIndependentOutcomeRead !== false
    || materialization.finalHoldoutOutcomeRead !== false
  ) {
    throw missingImmutableParameterError(
      "hpsr02_historical_parameter_lineage_cutoff_invalid"
    );
  }
  const snapshotRows = hcrcLineage.snapshotRows;
  const boundState = deriveFromSnapshot({
    snapshotRows,
    hpsr01Config,
    boundProof
  });
  const snapshotText = ndjsonText(snapshotRows);
  const snapshotDigest = sha256Text(snapshotText);
  const bindings = Object.freeze({
    historicalAuthorityFacts: Object.freeze({
      path: HISTORICAL_FACTS,
      sha256: factsDigest
    }),
    historicalAuthorityReceipt: Object.freeze({
      path: HISTORICAL_RECEIPT,
      sha256: await sha256File(path.join(root, HISTORICAL_RECEIPT))
    }),
    staticMetadata: Object.freeze({
      path: STATIC_METADATA,
      sha256: await sha256File(path.join(root, STATIC_METADATA))
    }),
    historicalParameterLineageInput: Object.freeze({
      path: HCRC_LINEAGE_INPUT,
      sha256: hcrcLineage.inputSha256
    }),
    historicalParameterLineageManifest: Object.freeze({
      path: HCRC_LINEAGE_MANIFEST,
      sha256: hcrcLineage.manifestSha256
    }),
    historicalParameterLineageReceipt: Object.freeze({
      path: HCRC_LINEAGE_RECEIPT,
      sha256: hcrcLineage.receiptSha256
    }),
    publicProvenance: Object.freeze({
      path: paths.publicProvenance,
      sha256: await sha256File(path.join(root, paths.publicProvenance))
    }),
    historicalFrozenRunRecord: Object.freeze({
      path: HISTORICAL_FROZEN_RESULT,
      sha256: await sha256File(path.join(root, HISTORICAL_FROZEN_RESULT))
    })
  });
  const artifact = buildParameterArtifact({
    boundState,
    snapshotDigest,
    bindings,
    hpsr01Config
  });
  const historicalReplay = await reconcileHistoricalFrozenRun({
    root,
    materialization,
    artifact,
    hpsr01Config,
    coreAmountConfig,
    replayOrigin
  });
  const manifest = Object.freeze({
    schema: "m2.current.hpsr.parameter_recovery_manifest.private.v0.2",
    artifactClass: "PARAMETER_LINEAGE_SNAPSHOT",
    role: "IMMUTABLE_FROZEN_MODEL_PARAMETER_RECOVERY_MANIFEST",
    status: "FROZEN_PARAMETER_LINEAGE_AND_RUN_RECORD_RECONCILED",
    recoveryIdentity: RECOVERY_IDENTITY,
    recoveryAlgorithmVersion: RECOVERY_ALGORITHM_VERSION,
    parameterArtifactPath: paths.parameterArtifact,
    lineageSnapshotPath: paths.lineageSnapshot,
    recoveryManifestPath: paths.recoveryManifest,
    recoveryCommand:
      "npm run execute:m2:head-protected-segmented-router -- "
        + "--hpsr02-parameter-authority",
    inputRowCount: boundProof.inputRowCount,
    finiteSupportRowCount: boundProof.finiteSupportRowCount,
    derivationOriginRange:
      hpsr01Config.residualBoundaryFreeze.sourceOriginRange,
    maximumOpenedDevelopmentOrigin: historicalCutoff,
    lineageSnapshotSha256: snapshotDigest,
    parameterPayloadSha256: artifact.parameterPayloadSha256,
    parameterArtifactSha256: null,
    bindings,
    historicalFrozenRunReconciliation: historicalReplay,
    currentBillSourceUsedForParameterDerivation: false,
    laterOriginOutcomeUsed: false,
    prospectiveFinalHoldoutOutcomeUsed: false,
    privateParameterValuesPublished: false,
    repositoryRelativePathsOnly: true,
    encryptedBackupMechanismStatus:
      "NOT_AVAILABLE_FOR_THIS_CAPABILITY_NO_UNENCRYPTED_BACKUP_CREATED",
    lastRecoveryMode: RECOVERY_IDENTITY
  });
  return Object.freeze({ artifact, snapshotRows, snapshotText, manifest });
}

async function loadFrozenHcrcParameterLineage({
  root,
  hpsr01Config,
  boundProof
}) {
  const [manifest, receipt, inputRows] = await Promise.all([
    readJson(path.join(root, HCRC_LINEAGE_MANIFEST)),
    readJson(path.join(root, HCRC_LINEAGE_RECEIPT)),
    readNdjson(path.join(root, HCRC_LINEAGE_INPUT))
  ]);
  if (
    manifest?.schema
      !== "m2.current.lg01_head_cash_residual.manifest.private.v0.1"
    || manifest?.experimentId
      !== "M2-EXP-LG01-HEAD-CASH-RESIDUAL-01"
    || manifest?.modelId !== "M2-WORK-HCRC01"
    || manifest?.resultStatus !== "M2_LG01_HEAD_CASH_RESIDUAL_FAIL"
    || manifest?.completeResultFrozen !== true
    || manifest?.frozenInputReconciliation
      !== "EXACT_FROZEN_H3_B3_AGGREGATE_RECONCILIATION"
    || manifest?.secondEvaluationAuthorized !== false
    || !Array.isArray(manifest?.files)
    || manifest.files.length !== Object.keys(HCRC_LINEAGE_FILES).length
  ) {
    throw missingImmutableParameterError(
      "hpsr02_historical_parameter_lineage_manifest_invalid"
    );
  }
  if (
    receipt?.schema
      !== "m2.current.lg01_head_cash_residual."
        + "attempt_receipt.private.v0.1"
    || receipt?.experimentId
      !== "M2-EXP-LG01-HEAD-CASH-RESIDUAL-01"
    || receipt?.modelId !== "M2-WORK-HCRC01"
    || receipt?.status !== "COMPLETE_RESULT_FROZEN"
    || receipt?.resultStatus !== "M2_LG01_HEAD_CASH_RESIDUAL_FAIL"
    || receipt?.completeMetricsProduced !== true
    || receipt?.validCompleteInterpretableResultProduced !== true
    || receipt?.scientificWindowConsumed !== true
    || receipt?.secondEvaluationAuthorized !== false
    || receipt?.outerOutcomeInspectedBeforeCompleteBoundary !== false
    || receipt?.scientificContractChanged !== false
    || receipt?.inputCaseCount !== inputRows.length
  ) {
    throw missingImmutableParameterError(
      "hpsr02_historical_parameter_lineage_receipt_invalid"
    );
  }
  const fileEntries = new Map(manifest.files.map(
    (entry) => [entry?.role, entry]
  ));
  if (
    fileEntries.size !== Object.keys(HCRC_LINEAGE_FILES).length
    || Object.keys(HCRC_LINEAGE_FILES).some(
      (role) => !fileEntries.has(role)
    )
  ) {
    throw missingImmutableParameterError(
      "hpsr02_historical_parameter_lineage_file_roles_invalid"
    );
  }
  for (const [role, fileName] of Object.entries(HCRC_LINEAGE_FILES)) {
    const repositoryPath = `${HCRC_LINEAGE_DIRECTORY}/${fileName}`;
    const absolutePath = path.join(root, repositoryPath);
    const entry = fileEntries.get(role);
    if (
      !Number.isInteger(entry?.byteCount)
      || entry.byteCount <= 0
      || !/^[a-f0-9]{64}$/u.test(String(entry?.sha256 ?? ""))
      || !await fileExists(absolutePath)
      || fs.statSync(absolutePath).size !== entry.byteCount
      || await sha256File(absolutePath) !== entry.sha256
    ) {
      throw missingImmutableParameterError(
        "hpsr02_historical_parameter_lineage_file_digest_mismatch"
      );
    }
  }
  const sourceRange = hpsr01Config
    .residualBoundaryFreeze.sourceOriginRange;
  const selectedRows = inputRows.filter((row) => (
    row?.schema
      === "m2.current.lg01_head_cash_residual.input.private.v0.1"
    && row?.evaluationFamily === "STRICT_ROLLING"
    && row?.populationId === "CORE80"
    && Number(row?.horizonMonths) === 3
    && row?.origin >= sourceRange.from
    && row?.origin <= sourceRange.through
  ));
  const caseKeys = selectedRows.map((row) => (
    `${row.standardWorkId}\u0000${row.origin}\u0000${row.horizonMonths}`
  ));
  if (
    selectedRows.length !== boundProof.inputRowCount
    || new Set(caseKeys).size !== selectedRows.length
    || selectedRows.some((row) => (
      row.frozenLg01Reconstructed !== true
      || row.frozenCham01B3Reconstructed !== true
      || row.frozenAggregateReconciled !== true
      || row.originVisibleOnly !== true
      || row.labelAvailableAsOf
        > hpsr01Config.residualBoundaryFreeze
          .maximumOpenedDevelopmentOrigin
    ))
  ) {
    throw missingImmutableParameterError(
      "hpsr02_historical_parameter_lineage_filter_invalid"
    );
  }
  const snapshotRows = selectedRows.map((row) => Object.freeze({
    schema: "m2.current.hpsr.parameter_lineage_row.private.v0.2",
    origin: row.origin,
    basePointEstimate: row.basePointEstimate,
    rawPointEstimate: row.rawPointEstimate
  }));
  validateLineageSnapshotRows(snapshotRows, {
    hpsr01Config,
    boundProof
  });
  return Object.freeze({
    snapshotRows: Object.freeze(snapshotRows),
    inputSha256: fileEntries.get("inputRows").sha256,
    manifestSha256: await sha256File(path.join(
      root,
      HCRC_LINEAGE_MANIFEST
    )),
    receiptSha256: await sha256File(path.join(
      root,
      HCRC_LINEAGE_RECEIPT
    ))
  });
}

function deriveFromSnapshot({ snapshotRows, hpsr01Config, boundProof }) {
  const state = deriveHpsrResidualBounds(snapshotRows, {
    maximumOpenedDevelopmentOrigin:
      hpsr01Config.residualBoundaryFreeze.maximumOpenedDevelopmentOrigin,
    positiveBaseQuantile:
      hpsr01Config.residualBoundaryFreeze.positiveBaseFloor.quantile,
    lowerResidualQuantile:
      hpsr01Config.residualBoundaryFreeze
        .normalizedResidualBounds.lowerQuantile,
    upperResidualQuantile:
      hpsr01Config.residualBoundaryFreeze
        .normalizedResidualBounds.upperQuantile
  });
  if (
    state.inputRowCount !== boundProof.inputRowCount
    || state.finiteSupportRowCount !== boundProof.finiteSupportRowCount
    || state.excludedNonfiniteRowCount
      !== boundProof.excludedNonfiniteRowCount
    || state.positiveBaseSupportRowCount
      !== boundProof.positiveBaseSupportRowCount
    || JSON.stringify(state.derivationOriginRange)
      !== JSON.stringify(boundProof.derivationOriginRange)
  ) {
    throw missingImmutableParameterError(
      "hpsr02_frozen_parameter_lineage_snapshot_not_reconciled"
    );
  }
  return state;
}

function buildParameterArtifact({
  boundState,
  snapshotDigest,
  bindings,
  hpsr01Config
}) {
  const artifact = {
    schema: "m2.current.hpsr.immutable_frozen_parameters.private.v0.2",
    artifactClass: "IMMUTABLE_FROZEN_MODEL_PARAMETER",
    tracked: false,
    status: FROZEN_SOURCE_CLASS,
    sourceClass: FROZEN_SOURCE_CLASS,
    experimentId:
      "M2-EXP-LG01-HEAD-PROTECTED-SEGMENTED-ROUTER-01",
    modelIds: ["M2-WORK-HPSR01", "M2-WORK-HPSR02"],
    sourcePopulation:
      "STRICT_ROLLING_CORE80_H3_B3_JOIN_FROZEN_LG01",
    derivationOriginRange: boundState.derivationOriginRange,
    maximumOpenedDevelopmentOrigin:
      boundState.maximumOpenedDevelopmentOrigin,
    inputRowCount: boundState.inputRowCount,
    finiteSupportRowCount: boundState.finiteSupportRowCount,
    excludedNonfiniteRowCount: boundState.excludedNonfiniteRowCount,
    positiveBaseSupportRowCount: boundState.positiveBaseSupportRowCount,
    quantileMethod: boundState.quantileMethod,
    quantiles: boundState.quantiles,
    parameterValues: {
      frozenDevelopmentPositiveBaseFloor: boundState.positiveBaseFloor,
      frozenDevelopmentQ05: boundState.lowerBound,
      frozenDevelopmentQ95: boundState.upperBound
    },
    parameterPayloadSha256: null,
    lineageSnapshotSha256: snapshotDigest,
    lineageBindings: bindings,
    recoveryIdentity: RECOVERY_IDENTITY,
    recoveryAlgorithmVersion: RECOVERY_ALGORITHM_VERSION,
    actualFieldConsumedForBoundDerivation: false,
    currentBillSourceUsedForParameterDerivation: false,
    laterOriginOutcomeUsed: false,
    prospectiveFinalHoldoutOutcomeUsed: false,
    publicParameterValuesPublished: false,
    privateDigestIsCrossComputerGate: false,
    immutableAfterIndependentOutcomeOpened: true,
    originalFreezeConfirmedBeforeIndependentOutcome: true,
    configuredQuantiles: {
      positiveBaseFloor:
        hpsr01Config.residualBoundaryFreeze.positiveBaseFloor.quantile,
      lower: hpsr01Config.residualBoundaryFreeze
        .normalizedResidualBounds.lowerQuantile,
      upper: hpsr01Config.residualBoundaryFreeze
        .normalizedResidualBounds.upperQuantile
    }
  };
  artifact.parameterPayloadSha256 =
    computeHpsrFrozenParameterPayloadDigest(artifact);
  return Object.freeze(artifact);
}

async function reconcileHistoricalFrozenRun({
  root,
  materialization,
  artifact,
  hpsr01Config,
  coreAmountConfig,
  replayOrigin
}) {
  const fit = fitHpsrFrozenB3AtOrigin({
    origin: replayOrigin,
    featureRows: materialization.featureRows,
    coreAmountConfig,
    fixedFit: hpsr01Config.retrospectiveReplay.fixedCham01B3Fit
  });
  const routerResult = runHeadProtectedSegmentedRouter({
    origin: replayOrigin,
    horizonMonths: 3,
    originVisibleWorkCashRows: fit.validationRows.map((row) => ({
      standardWorkId: row.standardWorkId,
      trailing12Cash: row.referenceRevenue
    })),
    predictionRows: fit.predictions.map((prediction, index) => ({
      standardWorkId: prediction.standardWorkId,
      origin: replayOrigin,
      horizonMonths: 3,
      lg01Prediction:
        fit.validationRows[index].features.lg01PointEstimate,
      cham01B3Prediction: prediction.pointEstimate,
      cham01Diagnostics: {
        signedExpm1Overflow:
          !Number.isFinite(prediction.pointEstimate)
          && Number.isFinite(prediction.transformedPointEstimate),
        supportRangeExtrapolation: false
      }
    })),
    residualBoundState: artifact,
    executionMode: "CONTROLLED_LATER_ORIGIN"
  });
  const evaluation = evaluateHpsrRetrospectiveDevelopment({
    originResults: [{
      origin: replayOrigin,
      routerResult,
      actualRows: fit.validationRows.map((row) => ({
        standardWorkId: row.standardWorkId,
        origin: replayOrigin,
        horizonMonths: 3,
        actual: row.actual
      }))
    }],
    decisionPolicy: hpsr01Config.retrospectiveReplay.decisionPolicy,
    bootstrap: hpsr01Config.retrospectiveReplay.bootstrap
  });
  const publicRecord = await readJson(path.join(
    root,
    HISTORICAL_FROZEN_RESULT
  ));
  const expected = historicalEvaluationProjection(
    publicRecord?.retrospective?.evaluation
  );
  const actual = historicalEvaluationProjection(evaluation);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw missingImmutableParameterError(
      "hpsr02_frozen_parameter_historical_run_record_mismatch"
    );
  }
  return Object.freeze({
    status: "EXACT_HISTORICAL_FROZEN_RUN_RECORD_RECONCILED",
    origin: replayOrigin,
    publicRecordPath: HISTORICAL_FROZEN_RESULT,
    publicRecordProjectionSha256: sha256Json(expected),
    replayProjectionSha256: sha256Json(actual),
    parameterValuesPublished: false,
    historicalResultRewritten: false
  });
}

function historicalEvaluationProjection(value) {
  return {
    status: value?.status,
    origins: value?.origins,
    caseCount: value?.caseCount,
    workCount: value?.workCount,
    metrics: value?.metrics,
    numeric: value?.numeric,
    structure: value?.structure,
    timeBlockSummary: value?.timeBlockSummary
  };
}

async function validateParameterBundle({
  root,
  paths,
  artifact,
  snapshotRows,
  manifest,
  hpsr01Config,
  boundProof
}) {
  validateImmutableHpsrFrozenParameterArtifact(artifact, {
    hpsr01Config,
    boundProof
  });
  validateLineageSnapshotRows(snapshotRows, {
    hpsr01Config,
    boundProof
  });
  const snapshotDigest = await sha256File(path.join(
    root,
    paths.lineageSnapshot
  ));
  const artifactDigest = await sha256File(path.join(
    root,
    paths.parameterArtifact
  ));
  if (
    manifest?.schema
      !== "m2.current.hpsr.parameter_recovery_manifest.private.v0.2"
    || manifest?.artifactClass !== "PARAMETER_LINEAGE_SNAPSHOT"
    || manifest?.recoveryIdentity !== RECOVERY_IDENTITY
    || manifest?.recoveryAlgorithmVersion !== RECOVERY_ALGORITHM_VERSION
    || manifest?.parameterArtifactPath !== paths.parameterArtifact
    || manifest?.lineageSnapshotPath !== paths.lineageSnapshot
    || manifest?.recoveryManifestPath !== paths.recoveryManifest
    || manifest?.lineageSnapshotSha256 !== snapshotDigest
    || artifact.lineageSnapshotSha256 !== snapshotDigest
    || manifest?.parameterPayloadSha256
      !== artifact.parameterPayloadSha256
    || manifest?.parameterArtifactSha256 !== artifactDigest
    || JSON.stringify(artifact.lineageBindings)
      !== JSON.stringify(manifest.bindings)
    || manifest?.currentBillSourceUsedForParameterDerivation !== false
    || manifest?.laterOriginOutcomeUsed !== false
    || manifest?.prospectiveFinalHoldoutOutcomeUsed !== false
    || manifest?.repositoryRelativePathsOnly !== true
  ) {
    throw missingImmutableParameterError(
      "hpsr02_frozen_parameter_recovery_manifest_invalid"
    );
  }
  assertRepositoryRelativeBindings(manifest.bindings);
  const provenanceBinding = manifest.bindings?.publicProvenance;
  if (
    provenanceBinding?.path !== paths.publicProvenance
    || !await optionalFileDigestMatches(root, provenanceBinding)
  ) {
    throw missingImmutableParameterError(
      "hpsr02_frozen_parameter_public_provenance_digest_mismatch"
    );
  }
  const historicalRunBinding =
    manifest.bindings?.historicalFrozenRunRecord;
  if (
    historicalRunBinding?.path !== HISTORICAL_FROZEN_RESULT
    || !await optionalFileDigestMatches(root, historicalRunBinding)
  ) {
    throw missingImmutableParameterError(
      "hpsr02_frozen_parameter_historical_run_digest_mismatch"
    );
  }
  const historicalRun = await readJson(path.join(
    root,
    HISTORICAL_FROZEN_RESULT
  ));
  const projectionDigest = sha256Json(historicalEvaluationProjection(
    historicalRun?.retrospective?.evaluation
  ));
  if (
    manifest?.historicalFrozenRunReconciliation?.status
      !== "EXACT_HISTORICAL_FROZEN_RUN_RECORD_RECONCILED"
    || manifest.historicalFrozenRunReconciliation
      .publicRecordProjectionSha256 !== projectionDigest
    || manifest.historicalFrozenRunReconciliation
      .replayProjectionSha256 !== projectionDigest
  ) {
    throw missingImmutableParameterError(
      "hpsr02_frozen_parameter_historical_run_reconciliation_invalid"
    );
  }
  let historicalReceiptStatus = "OPTIONAL_PROVENANCE_MISSING";
  const factsExists = await fileExists(path.join(root, HISTORICAL_FACTS));
  const receiptExists = await fileExists(path.join(root, HISTORICAL_RECEIPT));
  if (factsExists !== receiptExists) {
    throw missingImmutableParameterError(
      "hpsr02_frozen_parameter_partial_historical_lineage"
    );
  }
  if (factsExists && receiptExists) {
    const receipt = await readJson(path.join(root, HISTORICAL_RECEIPT));
    const factsDigest = await sha256File(path.join(root, HISTORICAL_FACTS));
    if (
      receipt?.authorityFactsSha256 !== factsDigest
      || !await optionalFileDigestMatches(
        root,
        manifest.bindings.historicalAuthorityFacts
      )
      || !await optionalFileDigestMatches(
        root,
        manifest.bindings.historicalAuthorityReceipt
      )
    ) {
      throw missingImmutableParameterError(
        "hpsr02_frozen_parameter_historical_lineage_digest_mismatch"
      );
    }
    historicalReceiptStatus = "PROVENANCE_AVAILABLE";
  }
  const historicalLineageInputExists = await fileExists(path.join(
    root,
    HCRC_LINEAGE_INPUT
  ));
  const historicalLineageManifestExists = await fileExists(path.join(
    root,
    HCRC_LINEAGE_MANIFEST
  ));
  const historicalLineageReceiptExists = await fileExists(path.join(
    root,
    HCRC_LINEAGE_RECEIPT
  ));
  if (historicalLineageInputExists !== historicalLineageManifestExists) {
    throw missingImmutableParameterError(
      "hpsr02_frozen_parameter_partial_historical_parameter_lineage"
    );
  }
  if (historicalLineageInputExists) {
    for (const role of [
      "historicalParameterLineageInput",
      "historicalParameterLineageManifest"
    ]) {
      if (!await optionalFileDigestMatches(root, manifest.bindings[role])) {
        throw missingImmutableParameterError(
          "hpsr02_frozen_parameter_historical_parameter_lineage_"
            + "digest_mismatch"
        );
      }
    }
  }
  if (
    historicalLineageReceiptExists
    && !await optionalFileDigestMatches(
      root,
      manifest.bindings.historicalParameterLineageReceipt
    )
  ) {
    throw missingImmutableParameterError(
      "hpsr02_frozen_parameter_historical_parameter_lineage_"
        + "receipt_digest_mismatch"
    );
  }
  if (historicalLineageReceiptExists) {
    historicalReceiptStatus = "PROVENANCE_AVAILABLE";
  }
  const staticBinding = manifest.bindings?.staticMetadata;
  if (
    await fileExists(path.join(root, staticBinding.path))
    && !await optionalFileDigestMatches(root, staticBinding)
  ) {
    throw missingImmutableParameterError(
      "hpsr02_frozen_parameter_static_metadata_digest_mismatch"
    );
  }
  return Object.freeze({
    valid: true,
    parameterLineageStatus: "PARAMETER_LINEAGE_SNAPSHOT_VALIDATED",
    historicalReceiptStatus
  });
}

function validateLineageSnapshotRows(
  rows,
  { hpsr01Config, boundProof }
) {
  const expectedRange = hpsr01Config
    .residualBoundaryFreeze.sourceOriginRange;
  const expectedKeys = [
    "basePointEstimate",
    "origin",
    "rawPointEstimate",
    "schema"
  ];
  if (!Array.isArray(rows)) {
    throw missingImmutableParameterError(
      "hpsr02_parameter_lineage_snapshot_not_an_array"
    );
  }
  if (rows.length !== boundProof.inputRowCount) {
    throw missingImmutableParameterError(
      "hpsr02_parameter_lineage_snapshot_row_count_mismatch"
    );
  }
  if (rows.some((row) => (
    JSON.stringify(Object.keys(row).sort())
      !== JSON.stringify(expectedKeys)
    || row.schema
      !== "m2.current.hpsr.parameter_lineage_row.private.v0.2"
  ))) {
    throw missingImmutableParameterError(
      "hpsr02_parameter_lineage_snapshot_schema_mismatch"
    );
  }
  if (rows.some((row) => (
    row.origin < expectedRange.from
    || row.origin > expectedRange.through
  ))) {
    throw missingImmutableParameterError(
      "hpsr02_parameter_lineage_snapshot_origin_range_mismatch"
    );
  }
  if (rows.some((row) => !Number.isFinite(row.basePointEstimate))) {
    throw missingImmutableParameterError(
      "hpsr02_parameter_lineage_snapshot_nonfinite_base"
    );
  }
  if (rows.some((row) => !Number.isFinite(row.rawPointEstimate))) {
    throw missingImmutableParameterError(
      "hpsr02_parameter_lineage_snapshot_nonfinite_raw"
    );
  }
}

export function computeHpsrFrozenParameterPayloadDigest(artifact) {
  return sha256Json({
    status: artifact.status,
    sourceClass: artifact.sourceClass,
    experimentId: artifact.experimentId,
    modelIds: artifact.modelIds,
    sourcePopulation: artifact.sourcePopulation,
    derivationOriginRange: artifact.derivationOriginRange,
    maximumOpenedDevelopmentOrigin:
      artifact.maximumOpenedDevelopmentOrigin,
    inputRowCount: artifact.inputRowCount,
    finiteSupportRowCount: artifact.finiteSupportRowCount,
    excludedNonfiniteRowCount: artifact.excludedNonfiniteRowCount,
    positiveBaseSupportRowCount: artifact.positiveBaseSupportRowCount,
    quantileMethod: artifact.quantileMethod,
    quantiles: artifact.quantiles,
    parameterValues: artifact.parameterValues,
    lineageSnapshotSha256: artifact.lineageSnapshotSha256,
    recoveryIdentity: artifact.recoveryIdentity,
    recoveryAlgorithmVersion: artifact.recoveryAlgorithmVersion,
    actualFieldConsumedForBoundDerivation:
      artifact.actualFieldConsumedForBoundDerivation,
    currentBillSourceUsedForParameterDerivation:
      artifact.currentBillSourceUsedForParameterDerivation,
    laterOriginOutcomeUsed: artifact.laterOriginOutcomeUsed,
    prospectiveFinalHoldoutOutcomeUsed:
      artifact.prospectiveFinalHoldoutOutcomeUsed
  });
}

function resolveParameterPaths(hpsr01Config) {
  const capability = hpsr01Config?.privateCapability;
  const paths = {
    parameterArtifact: capability?.immutableFrozenParameterArtifact,
    lineageSnapshot: capability?.parameterLineageSnapshot,
    recoveryManifest: capability?.parameterRecoveryManifest,
    publicProvenance:
      hpsr01Config?.publicOutputs?.residualBoundProvenanceJson
  };
  for (const [role, repositoryPath] of Object.entries(paths)) {
    if (
      typeof repositoryPath !== "string"
      || repositoryPath === ""
      || path.isAbsolute(repositoryPath)
      || repositoryPath.replaceAll("\\", "/").includes("../")
    ) {
      throw new Error(`hpsr02_parameter_path_invalid:${role}`);
    }
  }
  return Object.freeze(paths);
}

function assertRepositoryRelativeBindings(bindings) {
  if (!bindings || typeof bindings !== "object") {
    throw missingImmutableParameterError(
      "hpsr02_parameter_lineage_bindings_missing"
    );
  }
  for (const binding of Object.values(bindings)) {
    if (
      typeof binding?.path !== "string"
      || binding.path === ""
      || path.isAbsolute(binding.path)
      || binding.path.replaceAll("\\", "/").includes("../")
      || !/^[a-f0-9]{64}$/u.test(String(binding.sha256 ?? ""))
    ) {
      throw missingImmutableParameterError(
        "hpsr02_parameter_lineage_binding_invalid"
      );
    }
  }
}

function assertParameterArtifactsEqual(existing, rebuilt) {
  if (JSON.stringify(existing) !== JSON.stringify(rebuilt)) {
    throw missingImmutableParameterError(
      "hpsr02_immutable_frozen_parameter_value_mismatch"
    );
  }
}

function historicalLineageInputsPresent(root) {
  return [
    HISTORICAL_FACTS,
    HISTORICAL_RECEIPT,
    STATIC_METADATA,
    HCRC_LINEAGE_INPUT,
    HCRC_LINEAGE_MANIFEST,
    HCRC_LINEAGE_RECEIPT,
    ...Object.values(HCRC_LINEAGE_FILES).map(
      (fileName) => `${HCRC_LINEAGE_DIRECTORY}/${fileName}`
    )
  ].every((repositoryPath) => (
    fs.existsSync(path.join(root, repositoryPath))
  ));
}

function missingImmutableParameterError(reason) {
  const error = new Error(
    "M2_HPSR02_BLOCKED_MISSING_IMMUTABLE_FROZEN_PARAMETER"
  );
  error.cause = reason;
  error.parameterBlockerReason = reason;
  return error;
}

async function optionalFileDigestMatches(root, binding) {
  if (!binding?.path || !binding?.sha256) return false;
  const absolutePath = path.join(root, binding.path);
  if (!await fileExists(absolutePath)) return false;
  return await sha256File(absolutePath) === binding.sha256;
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

async function readNdjson(filePath) {
  const text = await readFile(filePath, "utf8");
  return text.split(/\r?\n/u)
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
}

function ndjsonText(rows) {
  return `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
}

async function writeJsonAtomic(filePath, value) {
  await writeTextAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeTextAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporaryPath, value, "utf8");
  await rename(temporaryPath, filePath);
}

async function fileExists(filePath) {
  return fs.existsSync(filePath);
}

async function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  const input = fs.createReadStream(filePath);
  for await (const chunk of input) hash.update(chunk);
  return hash.digest("hex");
}

function sha256Text(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sha256Json(value) {
  return sha256Text(JSON.stringify(value));
}
