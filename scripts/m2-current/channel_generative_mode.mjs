import { createHash } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  writeFile
} from "node:fs/promises";
import path from "node:path";

import {
  applyM2DevelopmentModelableRestatementToPackedRows,
  buildM2ChannelGenerativeG1PooledDiagnosticPredictions,
  buildM2ChannelGenerativeForecastabilityDiagnostic,
  buildM2ChannelGenerativeSyntheticDiagnostic,
  crossFitM2ChannelGenerativeG1,
  expandM2ChannelGenerativePackedRows,
  scoreM2ChannelGenerativeG1Predictions,
  scoreM2ChannelGenerativeFrozenG0Comparator,
  strictRollingM2ChannelGenerativeG1,
  verifyM2ChannelGenerativeG0
} from "../../src/domain/m2Current/channelGenerative.js";
import {
  buildM2PublishingScaleSyntheticDiagnostic,
  crossFitM2PublishingScaleChannel,
  M2_PUBLISHING_SCALE_ARM_ID,
  M2_PUBLISHING_SCALE_MODEL_ID,
  M2_PUBLISHING_SCALE_RAW_CANDIDATE_ID,
  strictRollingM2PublishingScaleChannel,
  validateM2PublishingScaleConfig
} from "../../src/domain/m2Current/publishingScaleChannelCore.js";

const CONFIG_PATH = "config/m2-current-channel-generative.v0.2.json";
const PUBLISHING_SCALE_CONFIG_PATH =
  "config/m2-current-publishing-scale-channel.v0.1.json";
const PUBLISHING_SCALE_SUPPORT_PATH =
  "config/m2-publishing-scale-statistical-support.v1.json";
const FROZEN_CONFIG_PATH = "config/m2-current-channel-experts.v0.1.json";
const PREREGISTRATION_PATH =
  "docs/analysis/m2-current/"
  + "M2-current-channel-generative-v0.2-preregistration.json";

export async function runM2ChannelGenerativePublicDiagnostic({
  root,
  verify
}) {
  const config = await readJson(path.join(root, CONFIG_PATH));
  assertBoundary(config);
  const fixture = await readJson(path.join(root, config.syntheticFixture));
  const result = buildM2ChannelGenerativeSyntheticDiagnostic(fixture, config);
  const outputPath = path.join(root, config.publicDiagnosticOutput);
  const text = JSON.stringify(result, null, 2) + "\n";
  if (verify) {
    if (await readFile(outputPath, "utf8") !== text) {
      throw new Error("m2_channel_generative_public_diagnostic_drift");
    }
    process.stdout.write(
      "M2 channel generative public diagnostic verified.\n"
    );
    return result;
  }
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, text, "utf8");
  process.stdout.write(
    "M2 channel generative public diagnostic written.\n"
  );
  return result;
}

export async function runM2PublishingScaleChannelPublicDiagnostic({
  root,
  verify
}) {
  const [config, support] = await Promise.all([
    readJson(path.join(root, PUBLISHING_SCALE_CONFIG_PATH)),
    readJson(path.join(root, PUBLISHING_SCALE_SUPPORT_PATH))
  ]);
  validateM2PublishingScaleConfig(config, support);
  const fixture = await readJson(path.join(root, config.syntheticFixture));
  const diagnostic = buildM2PublishingScaleSyntheticDiagnostic(
    fixture,
    config,
    support
  );
  const readiness = buildPublishingScaleReadiness({
    config,
    support,
    diagnostic
  });
  const executionClosure = buildPublishingScaleExecutionClosure({
    config,
    readiness
  });
  const outputs = [
    [
      path.join(root, config.publicDiagnosticOutput),
      JSON.stringify(diagnostic, null, 2) + "\n"
    ],
    [
      path.join(root, config.publicReadinessOutput),
      JSON.stringify(readiness, null, 2) + "\n"
    ],
    [
      path.join(root, config.publicReadinessReport),
      renderPublishingScaleReadiness(readiness)
    ],
    [
      path.join(root, config.publicExecutionClosureOutput),
      JSON.stringify(executionClosure, null, 2) + "\n"
    ],
    [
      path.join(root, config.publicExecutionClosureReport),
      renderPublishingScaleExecutionClosure(executionClosure)
    ]
  ];
  if (verify) {
    for (const [filePath, text] of outputs) {
      if (await readFile(filePath, "utf8") !== text) {
        throw new Error(
          `m2_publishing_scale_public_artifact_drift:${filePath}`
        );
      }
    }
    process.stdout.write(
      "M2 publishing-scale channel public diagnostic verified.\n"
    );
    return readiness;
  }
  for (const [filePath, text] of outputs) {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, text, "utf8");
  }
  process.stdout.write(
    "M2 publishing-scale channel public diagnostic written.\n"
  );
  return readiness;
}

export async function runM2PublishingScalePrivateDevelopment({
  root,
  privateDirectory,
  sourceDirectory,
  restatementDirectory,
  receiptPath
}) {
  const [
    config,
    support,
    frozenConfig,
    preregistration
  ] = await Promise.all([
    readJson(path.join(root, PUBLISHING_SCALE_CONFIG_PATH)),
    readJson(path.join(root, PUBLISHING_SCALE_SUPPORT_PATH)),
    readJson(path.join(root, FROZEN_CONFIG_PATH)),
    readJson(path.join(root, PREREGISTRATION_PATH))
  ]);
  validateM2PublishingScaleConfig(config, support);
  if (
    typeof receiptPath !== "string"
    || typeof sourceDirectory !== "string"
    || typeof restatementDirectory !== "string"
  ) {
    throw new Error("m2_publishing_scale_v0_2_execution_context_missing");
  }
  const receipt = await readJson(receiptPath);
  if (
    receipt?.status !== "PRIVATE_MATERIALIZATION_COMPLETE"
    || receipt?.implementationCommit !== receipt?.gitPreflight?.head
    || receipt?.modelId !== M2_PUBLISHING_SCALE_MODEL_ID
    || receipt?.experimentArmId !== M2_PUBLISHING_SCALE_ARM_ID
    || receipt?.candidateFitStarted !== false
    || receipt?.predictionRowsProduced !== 0
    || receipt?.evaluationRowsProduced !== 0
  ) {
    throw new Error("m2_publishing_scale_run_receipt_invalid");
  }
  const outputFiles = validatePublishingScaleOutputFiles(
    receipt.outputFiles,
    config
  );
  const [
    primaryText,
    auxiliaryText,
    materializationText,
    baseManifestText,
    frozenText,
    frozenManifestText,
    reconciliationText,
    allocationText,
    reversalReceiptText
  ] = await Promise.all([
    readFile(path.join(
      privateDirectory,
      outputFiles.primaryMonthlyCases
    ), "utf8"),
    readFile(path.join(
      privateDirectory,
      outputFiles.auxiliaryMonthlyCases
    ), "utf8"),
    readFile(path.join(
      privateDirectory,
      outputFiles.materializationManifest
    ), "utf8"),
    readFile(path.join(
      sourceDirectory,
      "M2-current-human-anchored-manifest-private-v0.1.json"
    ), "utf8"),
    readFile(path.join(
      sourceDirectory,
      frozenConfig.privateOutputs.evaluation
    ), "utf8"),
    readFile(path.join(
      sourceDirectory,
      frozenConfig.privateOutputs.evaluationManifest
    ), "utf8"),
    readFile(path.join(
      restatementDirectory,
      config.privateOutputs.reversalScopeReconciliation
    ), "utf8"),
    readFile(path.join(
      restatementDirectory,
      config.privateOutputs.reversalAllocationLedger
    ), "utf8"),
    readFile(path.join(
      restatementDirectory,
      config.privateOutputs.reversalExecutionReceipt
    ), "utf8")
  ]);
  const materialization = JSON.parse(materializationText);
  const baseManifest = JSON.parse(baseManifestText);
  const frozenManifest = JSON.parse(frozenManifestText);
  const reconciliation = JSON.parse(reconciliationText);
  const reversalReceipt = JSON.parse(reversalReceiptText);
  verifyPublishingScalePrivateBindings({
    config,
    preregistration,
    baseManifest,
    materialization,
    frozenManifest,
    primaryText,
    auxiliaryText,
    frozenText,
    reconciliationText,
    allocationText,
    reversalReceipt
  });
  const primaryRestatement =
    applyM2DevelopmentModelableRestatementToPackedRows(
      parseNdjson(primaryText),
      reconciliation,
      parseNdjson(allocationText)
    );
  const strictRestatement =
    applyM2DevelopmentModelableRestatementToPackedRows(
      parseNdjson(auxiliaryText),
      reconciliation,
      parseNdjson(allocationText)
    );
  await writeFile(
    receiptPath,
    JSON.stringify({
      ...await readJson(receiptPath),
      status:
        "RESTATEMENT_BINDING_PREFLIGHT_PASSED_BEFORE_CANDIDATE_FIT",
      restatementBindingPreflight: {
        primary: primaryRestatement.audit,
        strict: strictRestatement.audit
      },
      candidateOutcomeReadAtPreflight: false,
      evaluationStarted: false
    }, null, 2) + "\n",
    "utf8"
  );
  const primaryRows = expandM2ChannelGenerativePackedRows(
    primaryRestatement.rows
  );
  const strictRows = expandM2ChannelGenerativePackedRows(
    strictRestatement.rows
  );
  await writeFile(
    receiptPath,
    JSON.stringify({
      ...await readJson(receiptPath),
      status: "CANDIDATE_FIT_STARTED_AFTER_RESTATEMENT_PREFLIGHT",
      restatementBindingPreflight: {
        primary: primaryRestatement.audit,
        strict: strictRestatement.audit
      },
      candidateOutcomeReadAtFitStart: false,
      candidateFitStarted: true,
      candidateOutputFrozen: false,
      predictionRowsProduced: 0,
      evaluationStarted: false,
      evaluationRowsProduced: 0,
      evaluationComplete: false
    }, null, 2) + "\n",
    "utf8"
  );
  const primary = crossFitM2PublishingScaleChannel(
    primaryRows,
    config,
    support
  );
  const strict = strictRollingM2PublishingScaleChannel(
    strictRows,
    config,
    support
  );
  const predictionRowsProduced =
    primary.predictions.size + strict.predictions.size;
  await writeFile(
    receiptPath,
    JSON.stringify({
      ...await readJson(receiptPath),
      status: "RAW_CANDIDATE_OUTPUTS_FROZEN_BEFORE_EVALUATION_AND_ORACLE",
      candidateFitStarted: true,
      candidateOutputFrozen: true,
      predictionRowsProduced,
      evaluationStarted: false,
      evaluationRowsProduced: 0,
      evaluationComplete: false
    }, null, 2) + "\n",
    "utf8"
  );
  const frozenRows = parseNdjson(frozenText);
  const baselines = {
    primary: scoreM2ChannelGenerativeFrozenG0Comparator(
      primary.rows,
      frozenRows.filter(
        (row) => row.evaluationFamily === "primary"
      ),
      config,
      { channelPairingPolicy: "same_case_intersection" }
    ),
    strict: scoreM2ChannelGenerativeFrozenG0Comparator(
      strict.rows,
      frozenRows.filter(
        (row) => row.evaluationFamily === "strict_rolling"
      ),
      config,
      { channelPairingPolicy: "same_case_intersection" }
    )
  };
  const pairedResearchComparatorCandidate = {
    primary: scorePublishingScaleCandidateChannelIntersection(
      baselines.primary,
      primary.evaluation
    ),
    strict: scorePublishingScaleCandidateChannelIntersection(
      baselines.strict,
      strict.evaluation
    )
  };
  const operationalFallback = {
    primary: scorePublishingScaleOperationalFallbackIntersection(
      primary,
      "M2-WORK-OA03"
    ),
    strict: scorePublishingScaleOperationalFallbackIntersection(
      strict,
      "M2-WORK-OA03"
    )
  };
  const globalParentAblation = {
    primary: scoreM2ChannelGenerativeG1Predictions(
      primary.rows,
      primary.globalParentPredictions,
      config,
      { candidateId: `${M2_PUBLISHING_SCALE_RAW_CANDIDATE_ID}-GLOBAL-PARENT` }
    ),
    strict: scoreM2ChannelGenerativeG1Predictions(
      strict.rows,
      strict.globalParentPredictions,
      config,
      { candidateId: `${M2_PUBLISHING_SCALE_RAW_CANDIDATE_ID}-GLOBAL-PARENT` }
    )
  };
  const diagnostics = {
    primary: buildPublishingScaleDetailedEvaluation(primary, config),
    strict: buildPublishingScaleDetailedEvaluation(strict, config)
  };
  await writeFile(
    receiptPath,
    JSON.stringify({
      ...await readJson(receiptPath),
      status: "EVALUATION_STARTED_AFTER_RAW_CANDIDATE_FREEZE",
      evaluationStarted: true
    }, null, 2) + "\n",
    "utf8"
  );
  const bootstrap = {
    primary: pairedBootstrap(
      baselines.primary.cases,
      primary.evaluation.cases,
      config
    ),
    strict: pairedBootstrap(
      baselines.strict.cases,
      strict.evaluation.cases,
      config
    )
  };
  const gate = evaluatePublishingScaleGates({
    config,
    baselines,
    pairedResearchComparatorCandidate,
    primary: primary.evaluation,
    strict: strict.evaluation,
    bootstrap
  });
  const privateArtifact = await writePublishingScalePrivateRows(
    path.join(privateDirectory, outputFiles.evaluationRows),
    primary,
    strict
  );
  const candidateFreeze = {
    status: "RAW_CANDIDATE_OUTPUTS_FROZEN_BEFORE_ORACLE",
    rowCount: privateArtifact.rowCount,
    sha256: privateArtifact.sha256,
    predictionGeneratedAfterFreezeCount: 0,
    predictionModifiedAfterFreezeCount: 0
  };
  const forecastability = {
    primary: reidentifyPublishingScaleForecastability(
      buildM2ChannelGenerativeForecastabilityDiagnostic(
      primary.rows,
      primary.predictions,
      config,
      {
        pooledPredictions: primary.globalParentPredictions,
        candidateOutputsFrozen: true
      }
      )
    ),
    strict: reidentifyPublishingScaleForecastability(
      buildM2ChannelGenerativeForecastabilityDiagnostic(
      strict.rows,
      strict.predictions,
      config,
      {
        pooledPredictions: strict.globalParentPredictions,
        candidateOutputsFrozen: true
      }
      )
    )
  };
  const result = buildPublishingScalePublicResult({
    config,
    support,
    baselines,
    pairedResearchComparatorCandidate,
    operationalFallback,
    globalParentAblation,
    diagnostics,
    primary,
    strict,
    bootstrap,
    gate,
    forecastability,
    candidateFreeze,
    outputFiles,
    restatementBinding: {
      primary: primaryRestatement.audit,
      strict: strictRestatement.audit
    },
    receipt: await readJson(receiptPath)
  });
  const privateManifest = {
    schema:
      "m2.current.publishing_scale_channel_evaluation_private_manifest.v0.2",
    tracked: false,
    modelId: M2_PUBLISHING_SCALE_MODEL_ID,
    experimentArmId: M2_PUBLISHING_SCALE_ARM_ID,
    candidateId: M2_PUBLISHING_SCALE_RAW_CANDIDATE_ID,
    actualDefinitionId: config.actualDefinitionId,
    rowCount: privateArtifact.rowCount,
    sha256: privateArtifact.sha256,
    primaryMonthlyRowCount: primary.rows.length,
    strictMonthlyRowCount: strict.rows.length,
    primaryPackedSha256: materialization.primarySha256,
    auxiliaryPackedSha256: materialization.auxiliarySha256,
    frozenEvaluationSha256: frozenManifest.sha256,
    outputFiles,
    candidateFreeze,
    serialization: privateArtifact.serialization,
    maximumSerializationBufferBytes:
      privateArtifact.maximumBufferedBytes,
    rawCandidatePreserved: true,
    fallbackOverwroteRaw: false,
    finalHoldoutOpened: false,
    productionModified: false,
    exactV03Modified: false,
    providerUsed: false,
    databaseRead: false
  };
  await Promise.all([
    writeFile(
      path.join(
        privateDirectory,
        outputFiles.evaluationManifest
      ),
      JSON.stringify(privateManifest, null, 2) + "\n",
      { encoding: "utf8", flag: "wx" }
    ),
    writeFile(
      path.join(root, config.publicDevelopmentOutput),
      JSON.stringify(result, null, 2) + "\n",
      "utf8"
    ),
    writeFile(
      path.join(root, config.publicDevelopmentReport),
      renderPublishingScaleDevelopmentReportCurrent(result),
      "utf8"
    ),
    writeFile(
      path.join(root, config.publicForecastabilityOutput),
      JSON.stringify(
        publishingScalePublicForecastability(result),
        null,
        2
      ) + "\n",
      "utf8"
    ),
    writeFile(
      path.join(root, config.publicForecastabilityReport),
      renderPublishingScaleForecastabilityReportCurrent(result),
      "utf8"
    )
  ]);
  await writeFile(
    receiptPath,
    JSON.stringify({
      ...await readJson(receiptPath),
      status: "COMPLETED",
      completedAt: new Date().toISOString(),
      outputRowCount: privateManifest.rowCount,
      outputSha256: privateManifest.sha256,
      outputFiles,
      finalStatus: result.finalStatus,
      candidateFitStarted: true,
      candidateOutputFrozen: true,
      predictionRowsProduced,
      evaluationStarted: true,
      evaluationRowsProduced: privateManifest.rowCount,
      evaluationComplete: true,
      candidateExecuted: true,
      candidateOutcomeReadAfterReceipt: true,
      interpretableRawCandidateEvaluationProduced: true,
      predictionGeneratedAfterFreezeCount: 0,
      predictionModifiedAfterFreezeCount: 0
    }, null, 2) + "\n",
    "utf8"
  );
  process.stdout.write(JSON.stringify({
    finalStatus: result.finalStatus,
    modelId: M2_PUBLISHING_SCALE_MODEL_ID,
    primary: result.evaluation.rawCandidate.primary,
    strict: result.evaluation.rawCandidate.strict,
    privateRowCount: privateManifest.rowCount,
    privateSha256: privateManifest.sha256
  }) + "\n");
  return result;
}

export async function prepareM2ChannelGenerativeRunReceipt({
  root,
  privateDirectory,
  implementationCommit,
  command,
  environment
}) {
  const [configText, preregistrationText, amendmentText, sourceText,
    baseManifestText, frozenManifestText] = await Promise.all([
    readFile(path.join(root, CONFIG_PATH), "utf8"),
    readFile(path.join(root, PREREGISTRATION_PATH), "utf8"),
    readFile(
      path.join(
        root,
        "docs/analysis/m2-current/"
          + "M2-current-channel-generative-v0.2-"
          + "interpretation-amendment-v0.1.json"
      ),
      "utf8"
    ),
    readFile(
      path.join(root, "src/domain/m2Current/channelGenerative.js"),
      "utf8"
    ),
    readFile(
      path.join(
        privateDirectory,
        "M2-current-human-anchored-manifest-private-v0.1.json"
      ),
      "utf8"
    ),
    readFile(
      path.join(
        privateDirectory,
        "M2-current-channel-experts-evaluation-manifest-private-v0.1.json"
      ),
      "utf8"
    )
  ]);
  const config = JSON.parse(configText);
  const baseManifest = JSON.parse(baseManifestText);
  const frozenManifest = JSON.parse(frozenManifestText);
  assertBoundary(config);
  assertPrivateExecutionAuthorization(config);
  const receiptPath = path.join(
    privateDirectory,
    config.privateOutputs.runReceipt
  );
  const previousReceipt = await readOptionalJson(receiptPath);
  const attemptHistory = [
    ...normalizeAttemptHistory(previousReceipt?.attemptHistory),
    ...(previousReceipt === null
      ? []
      : [summarizePriorAttempt(previousReceipt)])
  ];
  if (
    previousReceipt?.status === "COMPLETED"
    || previousReceipt?.G1ExecutionStarted === true
    || previousReceipt?.G1Executed === true
    || attemptHistory.some((attempt) => (
      attempt.G1ExecutionStarted === true
      || attempt.G1Executed === true
    ))
  ) {
    throw new Error(
      "m2_channel_generative_one_time_private_execution_already_consumed"
    );
  }
  const receipt = {
    schema: "m2.current.channel_generative_run_receipt_private.v0.2",
    tracked: false,
    status: "PREPARED_BEFORE_PRIVATE_EVALUATION_ROW_READ",
    implementationCommit,
    codeSha256: digest(sourceText),
    preregistrationSha256: digest(preregistrationText),
    interpretationAmendmentSha256: digest(amendmentText),
    configSha256: digest(configText),
    datasetDigests: baseManifest.digests,
    frozenCaseDigest: frozenManifest.sha256,
    frozenEvaluationRowCount: frozenManifest.rowCount,
    bootstrapSeed: config.evaluation.bootstrapSeed,
    command,
    environment,
    nodeVersion: process.version,
    startTime: new Date().toISOString(),
    modelId: "M2-CHAN-GEN02",
    experimentArmId: "M2-EXP-CHANNEL-GENERATIVE-02/G1",
    expectedCandidateIds: ["G0", "G1"],
    expectedTrainedCandidateIds: ["G1"],
    expectedPrimaryOuterFolds:
      config.selection.outerPrimaryWorkFoldCount,
    expectedStrictOuterOrigins: config.selection.strictOrigins,
    expectedParameterGridCount:
      config.grid.configurationCountPerRawCandidate,
    attemptOrdinal: attemptHistory.length + 1,
    priorAttemptCount: attemptHistory.length,
    priorCompletedCandidateExecutionCount: 0,
    attemptHistory,
    G2Expected: false,
    G3Expected: false,
    G4Expected: false,
    G5Expected: false,
    G6Expected: false,
    candidateOutcomeReadAtReceipt: false
  };
  await mkdir(privateDirectory, { recursive: true });
  await writeFile(
    receiptPath,
    JSON.stringify(receipt, null, 2) + "\n",
    "utf8"
  );
  return receipt;
}

export async function runM2ChannelGenerativePrivateDevelopment({
  root,
  privateDirectory,
  baseManifest
}) {
  const [config, frozenConfig, preregistration, frozenPublic] =
    await Promise.all([
      readJson(path.join(root, CONFIG_PATH)),
      readJson(path.join(root, FROZEN_CONFIG_PATH)),
      readJson(path.join(root, PREREGISTRATION_PATH)),
      readJson(path.join(root, frozenConfigPublicPath()))
    ]);
  assertBoundary(config);
  assertPrivateExecutionAuthorization(config);
  const receipt = await readJson(path.join(
    privateDirectory,
    config.privateOutputs.runReceipt
  ));
  if (
    receipt?.status
      !== "PREPARED_BEFORE_PRIVATE_EVALUATION_ROW_READ"
    || receipt?.implementationCommit === undefined
    || receipt?.candidateOutcomeReadAtReceipt !== false
  ) {
    throw new Error("m2_channel_generative_run_receipt_invalid");
  }
  const restatementDirectory = path.join(
    root,
    config.privateOutputs.reversalRestatementDirectory
  );
  const [primaryText, auxiliaryText, materializationText,
    frozenText, frozenManifestText, reconciliationText,
    allocationText, reversalReceiptText] = await Promise.all([
    readFile(path.join(
      privateDirectory,
      config.privateOutputs.primaryMonthlyCases
    ), "utf8"),
    readFile(path.join(
      privateDirectory,
      config.privateOutputs.auxiliaryMonthlyCases
    ), "utf8"),
    readFile(path.join(
      privateDirectory,
      config.privateOutputs.materializationManifest
    ), "utf8"),
    readFile(path.join(
      privateDirectory,
      frozenConfig.privateOutputs.evaluation
    ), "utf8"),
    readFile(path.join(
      privateDirectory,
      frozenConfig.privateOutputs.evaluationManifest
    ), "utf8"),
    readFile(path.join(
      restatementDirectory,
      config.privateOutputs.reversalScopeReconciliation
    ), "utf8"),
    readFile(path.join(
      restatementDirectory,
      config.privateOutputs.reversalAllocationLedger
    ), "utf8"),
    readFile(path.join(
      restatementDirectory,
      config.privateOutputs.reversalExecutionReceipt
    ), "utf8")
  ]);
  const materialization = JSON.parse(materializationText);
  const frozenManifest = JSON.parse(frozenManifestText);
  const reconciliation = JSON.parse(reconciliationText);
  const reversalReceipt = JSON.parse(reversalReceiptText);
  verifyPrivateBindings({
    config,
    preregistration,
    baseManifest,
    materialization,
    frozenManifest,
    primaryText,
    auxiliaryText,
    frozenText,
    reconciliationText,
    allocationText,
    reversalReceipt
  });
  const frozenRows = parseNdjson(frozenText);
  const expected = {
    primary: frozenPublic.evaluation.primary.ablations.A0,
    strict: frozenPublic.evaluation.strictRolling.ablations.A0
  };
  const G0 = verifyM2ChannelGenerativeG0(
    frozenRows,
    { expected }
  );
  const primaryRestatement =
    applyM2DevelopmentModelableRestatementToPackedRows(
      parseNdjson(primaryText),
      reconciliation,
      parseNdjson(allocationText)
    );
  const strictRestatement =
    applyM2DevelopmentModelableRestatementToPackedRows(
      parseNdjson(auxiliaryText),
      reconciliation,
      parseNdjson(allocationText)
    );
  await writeFile(
    path.join(
      privateDirectory,
      config.privateOutputs.runReceipt
    ),
    JSON.stringify({
      ...receipt,
      status: "RESTATEMENT_BINDING_PREFLIGHT_PASSED_BEFORE_G1_FIT",
      restatementBindingPreflight: {
        primary: primaryRestatement.audit,
        strict: strictRestatement.audit
      },
      candidateOutcomeReadAtPreflight: false,
      G1Executed: false,
      G2Executed: false,
      G3Executed: false
    }, null, 2) + "\n",
    "utf8"
  );
  const primaryRows = expandM2ChannelGenerativePackedRows(
    primaryRestatement.rows
  );
  const strictRows = expandM2ChannelGenerativePackedRows(
    strictRestatement.rows
  );
  await writeFile(
    path.join(
      privateDirectory,
      config.privateOutputs.runReceipt
    ),
    JSON.stringify({
      ...receipt,
      status: "G1_FIT_STARTED_AFTER_RESTATEMENT_PREFLIGHT",
      restatementBindingPreflight: {
        primary: primaryRestatement.audit,
        strict: strictRestatement.audit
      },
      candidateOutcomeReadAtFitStart: false,
      G1ExecutionStarted: true,
      G2Executed: false,
      G3Executed: false
    }, null, 2) + "\n",
    "utf8"
  );
  const primary = crossFitM2ChannelGenerativeG1(primaryRows, config);
  const strict = strictRollingM2ChannelGenerativeG1(strictRows, config);
  const baselines = {
    primary: scoreM2ChannelGenerativeFrozenG0Comparator(
      primary.rows,
      frozenRows.filter(
        (row) => row.evaluationFamily === "primary"
      ),
      config
    ),
    strict: scoreM2ChannelGenerativeFrozenG0Comparator(
      strict.rows,
      frozenRows.filter(
        (row) => row.evaluationFamily === "strict_rolling"
      ),
      config
    )
  };
  const bootstrap = {
    G1: {
      primary: pairedBootstrap(
        baselines.primary.cases,
        primary.evaluations.G1.cases,
        config
      ),
      strict: pairedBootstrap(
        baselines.strict.cases,
        strict.evaluations.G1.cases,
        config
      )
    }
  };
  const gateMatrix = evaluateCoreGates({
    config,
    baselines,
    primary,
    strict,
    bootstrap
  });
  const privateRows = privateEvaluationRows(primary, strict);
  const privateText = privateRows.map(JSON.stringify).join("\n") + "\n";
  const candidateFreeze = {
    status: "G1_CANDIDATE_OUTPUTS_FROZEN_BEFORE_ORACLE",
    rowCount: privateRows.length,
    sha256: digest(privateText),
    predictionGeneratedAfterFreezeCount: 0,
    predictionModifiedAfterFreezeCount: 0
  };
  const primaryPooled =
    buildM2ChannelGenerativeG1PooledDiagnosticPredictions(
      primaryRows,
      config,
      primary
    );
  const strictPooled =
    buildM2ChannelGenerativeG1PooledDiagnosticPredictions(
      strictRows,
      config,
      strict
    );
  const forecastability = {
    primary: buildM2ChannelGenerativeForecastabilityDiagnostic(
      primary.rows,
      primary.predictions,
      config,
      {
        pooledPredictions: primaryPooled.predictions,
        candidateOutputsFrozen: true
      }
    ),
    strict: buildM2ChannelGenerativeForecastabilityDiagnostic(
      strict.rows,
      strict.predictions,
      config,
      {
        pooledPredictions: strictPooled.predictions,
        candidateOutputsFrozen: true
      }
    )
  };
  const result = buildPublicResult({
    config,
    preregistration,
    baseManifest,
    materialization,
    frozenManifest,
    G0,
    baselines,
    primary,
    strict,
    bootstrap,
    gateMatrix,
    forecastability,
    receipt,
    candidateFreeze,
    restatementBinding: {
      primary: primaryRestatement.audit,
      strict: strictRestatement.audit
    }
  });
  const privateManifest = {
    schema:
      "m2.current.channel_generative_G1_evaluation_private_manifest.v0.1",
    tracked: false,
    modelId: "M2-CHAN-GEN02",
    experimentArmId: "M2-EXP-CHANNEL-GENERATIVE-02/G1",
    candidateId: "G1",
    actualDefinitionId: config.actualDefinitionId,
    rowCount: privateRows.length,
    sha256: digest(privateText),
    primaryMonthlyRowCount: primary.rows.length,
    strictMonthlyRowCount: strict.rows.length,
    primaryPackedSha256: materialization.primarySha256,
    auxiliaryPackedSha256: materialization.auxiliarySha256,
    frozenEvaluationSha256: frozenManifest.sha256,
    reversalScopeReconciliationSha256: digest(reconciliationText),
    reversalAllocationLedgerSha256: digest(allocationText),
    candidateFreeze,
    rawCandidatesPreserved: ["G1"],
    G1Executed: true,
    G2Executed: false,
    G3Executed: false,
    blendDiagnosticPreserved: false,
    G4Executed: false,
    G5Executed: false,
    G6Executed: false,
    finalHoldoutOpened: false,
    productionModified: false,
    exactV03Modified: false,
    providerUsed: false,
    databaseRead: false
  };
  await Promise.all([
    writeFile(
      path.join(
        privateDirectory,
        config.privateOutputs.evaluationRows
      ),
      privateText,
      "utf8"
    ),
    writeFile(
      path.join(
        privateDirectory,
        config.privateOutputs.evaluationManifest
      ),
      JSON.stringify(privateManifest, null, 2) + "\n",
      "utf8"
    ),
    writeFile(
      path.join(root, config.publicDevelopmentOutput),
      JSON.stringify(result, null, 2) + "\n",
      "utf8"
    ),
    writeFile(
      path.join(root, config.publicDevelopmentReport),
      renderDevelopmentReport(result),
      "utf8"
    ),
    writeFile(
      path.join(root, config.publicForecastabilityOutput),
      JSON.stringify(publicForecastability(result), null, 2) + "\n",
      "utf8"
    ),
    writeFile(
      path.join(root, config.publicForecastabilityReport),
      renderForecastabilityReport(result),
      "utf8"
    )
  ]);
  await writeFile(
    path.join(
      privateDirectory,
      config.privateOutputs.runReceipt
    ),
    JSON.stringify({
      ...receipt,
      status: "COMPLETED",
      completedAt: new Date().toISOString(),
      outputRowCount: privateManifest.rowCount,
      outputSha256: privateManifest.sha256,
      finalStatus: result.finalStatus,
      G1ExecutionStarted: true,
      G1Executed: true,
      G2Executed: false,
      G3Executed: false,
      candidateOutcomeReadAfterReceipt: true,
      predictionGeneratedAfterFreezeCount: 0,
      predictionModifiedAfterFreezeCount: 0
    }, null, 2) + "\n",
    "utf8"
  );
  process.stdout.write(JSON.stringify({
    finalStatus: result.finalStatus,
    G0: result.evaluation.G0,
    G1: result.evaluation.G1,
    G2Executed: false,
    G3Executed: false,
    privateRowCount: privateManifest.rowCount,
    privateSha256: privateManifest.sha256
  }) + "\n");
  return result;
}

export async function recordM2ChannelGenerativeRunFailure({
  root,
  privateDirectory,
  error
}) {
  const config = await readJson(path.join(root, CONFIG_PATH));
  const receiptPath = path.join(
    privateDirectory,
    config.privateOutputs.runReceipt
  );
  const receipt = await readOptionalJson(receiptPath);
  if (receipt === null || receipt.status === "COMPLETED") return;
  const fitStarted = receipt.G1ExecutionStarted === true;
  const preflightPassed = fitStarted || receipt.status
    === "RESTATEMENT_BINDING_PREFLIGHT_PASSED_BEFORE_G1_FIT";
  await writeFile(
    receiptPath,
    JSON.stringify({
      ...receipt,
      status: fitStarted
        ? "FAILED_CLOSED_AFTER_G1_FIT_STARTED"
        : preflightPassed
          ? "FAILED_CLOSED_AFTER_RESTATEMENT_PREFLIGHT"
        : "FAILED_CLOSED_BEFORE_G1_FIT",
      failurePhase: fitStarted
        ? "G1_EXECUTION"
        : preflightPassed
          ? "PRE_FIT_EXPANSION_AFTER_RESTATEMENT_PREFLIGHT"
        : "DEVELOPMENT_MODELABLE_RESTATEMENT_SCOPE_BINDING",
      errorCode: String(error?.code ?? error?.message ?? "unknown_error"),
      candidateOutcomeReadAtFailure:
        fitStarted ? null : false,
      G1ExecutionStarted: fitStarted,
      G1Executed: fitStarted,
      G2Executed: false,
      G3Executed: false
    }, null, 2) + "\n",
    "utf8"
  );
}

function buildPublicResult({
  config,
  preregistration,
  baseManifest,
  materialization,
  frozenManifest,
  G0,
  baselines,
  primary,
  strict,
  bootstrap,
  gateMatrix,
  forecastability,
  receipt,
  candidateFreeze,
  restatementBinding
}) {
  const evaluation = {
    G0: publicCandidate(baselines.primary, baselines.strict, null),
    G1: publicCandidate(
      primary.evaluations.G1,
      strict.evaluations.G1,
      bootstrap.G1,
      baselines
    )
  };
  const g1 = gateMatrix.G1.allPassed;
  const finalStatus = g1
    ? "M2_CHANNEL_GENERATIVE_G1_CORE_PASS"
    : "M2_CHANNEL_GENERATIVE_G1_CORE_FAIL_CASH_ONLY_SIGNAL_INSUFFICIENT";
  return {
    schema: "m2.current.channel_generative_G1_development.v0.1",
    displayNameZh:
      "渠道时间生成模型 v0.2——独立渠道月度发生—条件金额核心",
    displayNameEn:
      "Channel Generative v0.2 — Independent Monthly Occurrence × Conditional Amount Core",
    modelId: "M2-CHAN-GEN02",
    experimentArmId: "M2-EXP-CHANNEL-GENERATIVE-02/G1",
    candidateId: "G1",
    finalStatus,
    evidenceClass:
      "STRICTLY_CONTROLLED_REUSED_DEVELOPMENT_WINDOW_EVIDENCE",
    sourceBindings: {
      preregistrationSha256:
        config.preregistration.sha256,
      implementationCommit: receipt.implementationCommit,
      frozenEvaluationSha256: frozenManifest.sha256,
      baseDatasetDigests: baseManifest.digests
    },
    actualDefinition: {
      stableId: config.actualDefinitionId,
      comparabilityGroupId: config.comparabilityGroupId,
      labelView: "DEVELOPMENT_MODELABLE_RESTATEMENT_VIEW",
      residualPolicyStatus:
        "UNALLOCATED_REVERSAL_RESIDUAL_EXCLUDED_FROM_MODELABLE_TARGET"
    },
    population: {
      primaryCaseCount: baselines.primary.workTotal.caseCount,
      strictCaseCount: baselines.strict.workTotal.caseCount,
      primaryMonthlyRowCount: primary.rows.length,
      strictMonthlyRowCount: strict.rows.length,
      materializedMonthlyLabelRowCount:
        materialization.monthlyLabelRowCount
    },
    G0SemanticEquivalence: G0,
    restatementBinding,
    candidateFreeze,
    evaluation,
    gateMatrix,
    selection: {
      primaryOuterFolds: primary.receipts,
      strictOuterOrigins: strict.receipts,
      rawOutputsPreserved: ["G1"],
      candidateIdsExecuted: ["G1"],
      G2Executed: false,
      G3Executed: false,
      outerOutcomeUsedForSelection: false
    },
    forecastability,
    interpretation: {
      humanTrunkAnchorSupported:
        evaluation.G0.primary.wape <= evaluation.G1.primary.wape,
      workLevelAutomationSupported: false,
      causalBusinessMechanismProven: false,
      allowedFailureConclusion:
        "CURRENT_CASH_HISTORY_LOW_COMPLEXITY_GENERATIVE_CORE_NO_INCREMENTAL_VALUE",
      forecastingTheoreticallyImpossible: false
    },
    boundaries: {
      G1Executed: true,
      G2Executed: false,
      G3Executed: false,
      G4Executed: false,
      G5Executed: false,
      G6Executed: false,
      productionSurfaceChangeCount: 0,
      exactV03Modified: false,
      finalHoldoutOpened: false,
      providerUsed: false,
      databaseRead: false,
      safeToStartPlatform: false,
      safeToStartTaxonomy: false,
      safeToStartComposition: false,
      safeToStartImplementationOfAnyLaterLayer: false,
      productionUpgradeSupported: false,
      exactV03ReplacementSupported: false,
      releaseAuthorized: false
    },
    preregistrationGatesUnchanged:
      preregistration.gates.coreRawPass.conditions
        .primaryRelativeWape.value === 0.01
  };
}

function publicCandidate(primary, strict, bootstrap = null, baselines = null) {
  return {
    primary: metricSummary(primary),
    strict: metricSummary(strict),
    relativeWape: baselines === null ? null : {
      primary: relativeWape(baselines.primary, primary),
      strict: relativeWape(baselines.strict, strict)
    },
    byHorizon: {
      primary: primary.byHorizon,
      strict: strict.byHorizon
    },
    byOrigin: {
      primary: primary.byOrigin,
      strict: strict.byOrigin
    },
    byMechanism: {
      primary: primary.byMechanism,
      strict: strict.byMechanism
    },
    topRevenue: {
      primary: primary.topRevenue,
      strict: strict.topRevenue
    },
    coverage: {
      primary: primary.coverage,
      strict: strict.coverage
    },
    bootstrap
  };
}

function metricSummary(value) {
  return {
    ...value.workTotal,
    workChannelWape: value.workChannel.wape,
    workChannelAbsoluteError: value.workChannel.absoluteError
  };
}

function evaluateCoreGates({
  config,
  baselines,
  primary,
  strict,
  bootstrap
}) {
  const result = {};
  for (const candidateId of ["G1"]) {
    const p = primary.evaluations[candidateId];
    const s = strict.evaluations[candidateId];
    const primaryRelative = relativeWape(baselines.primary, p);
    const strictRelative = relativeWape(baselines.strict, s);
    const strictBlocks = Object.keys(s.byOrigin).filter((origin) => (
      relativeMetric(
        baselines.strict.byOrigin[origin]?.wape,
        s.byOrigin[origin]?.wape
      ) > 0
    )).length;
    const horizonValues = [
      relativeMetric(
        baselines.primary.byHorizon["36"]?.wape,
        p.byHorizon["36"]?.wape
      ),
      ...["3", "6", "12", "18", "24"].map((horizon) => (
        relativeMetric(
          baselines.strict.byHorizon[horizon]?.wape,
          s.byHorizon[horizon]?.wape
        )
      ))
    ].filter(Number.isFinite);
    const checks = {
      rawResult: true,
      primaryRelativeWape: primaryRelative >= 0.01,
      strictRelativeWape: strictRelative >= 0.01,
      strictImprovedOriginBlocks: strictBlocks >= 6,
      improvedFrozenHorizonSlices:
        horizonValues.filter((value) => value > 0).length >= 4,
      eachHorizonSafety:
        horizonValues.every((value) => value >= -0.01),
      top10RelativeWape: bothTop(
        baselines,
        p,
        s,
        "0.1",
        0.01
      ),
      top1Safety: bothTop(baselines, p, s, "0.01", -0.01),
      top5Safety: bothTop(baselines, p, s, "0.05", -0.01),
      biasSafety:
        Math.abs(p.workTotal.signedBias)
          - Math.abs(baselines.primary.workTotal.signedBias) <= 0.01
        && Math.abs(s.workTotal.signedBias)
          - Math.abs(baselines.strict.workTotal.signedBias) <= 0.01,
      bootstrapSafety:
        bootstrap[candidateId].primary.lower95 >= -0.01
        && bootstrap[candidateId].strict.lower95 >= -0.01,
      coverage:
        p.coverage.generatorObservedChannelRowUsage >= 0.2
        && s.coverage.generatorObservedChannelRowUsage >= 0.2
        && p.coverage.generatorActualPositiveCashUsage >= 0.2
        && s.coverage.generatorActualPositiveCashUsage >= 0.2,
      mechanismSafety: mechanismSafety(
        baselines,
        p,
        s
      )
    };
    result[candidateId] = {
      checks,
      allPassed: Object.values(checks).every(Boolean),
      primaryRelativeWape: primaryRelative,
      strictRelativeWape: strictRelative,
      strictImprovedOriginBlocks: strictBlocks,
      improvedHorizonSlices:
        horizonValues.filter((value) => value > 0).length,
      horizonRelativeImprovements: horizonValues
    };
  }
  return result;
}

function mechanismSafety(baselines, primary, strict) {
  const mechanisms = ["membership", "advertising", "transactional"];
  let safe = 0;
  for (const mechanism of mechanisms) {
    const p = relativeMetric(
      baselines.primary.byMechanism[mechanism]?.wape,
      primary.byMechanism[mechanism]?.wape
    );
    const s = relativeMetric(
      baselines.strict.byMechanism[mechanism]?.wape,
      strict.byMechanism[mechanism]?.wape
    );
    if (p >= -0.01 && s >= -0.01) safe += 1;
  }
  return safe >= 2;
}

function bothTop(baselines, primary, strict, fraction, threshold) {
  return relativeMetric(
    baselines.primary.topRevenue[fraction]?.wape,
    primary.topRevenue[fraction]?.wape
  ) >= threshold && relativeMetric(
    baselines.strict.topRevenue[fraction]?.wape,
    strict.topRevenue[fraction]?.wape
  ) >= threshold;
}

function pairedBootstrap(baselineCases, candidateCases, config) {
  const baselineKeys = new Map(baselineCases.map((row) => [
    publishingScaleCaseKey(
      row.standardWorkId,
      row.origin,
      row.horizonMonths
    ),
    Number(row.actual)
  ]));
  const candidateKeys = new Map(candidateCases.map((row) => [
    publishingScaleCaseKey(
      row.standardWorkId,
      row.origin,
      row.horizonMonths
    ),
    Number(row.actual)
  ]));
  if (
    baselineKeys.size !== candidateKeys.size
    || [...baselineKeys].some(([key, actual]) => (
      !candidateKeys.has(key)
      || Math.abs(candidateKeys.get(key) - actual) > 1e-8
    ))
  ) {
    throw new Error("m2_publishing_scale_bootstrap_same_case_invalid");
  }
  const baseline = groupCasesByWork(baselineCases);
  const candidate = groupCasesByWork(candidateCases);
  const works = [...baseline.keys()].filter((work) => candidate.has(work))
    .sort();
  let state = Number(config.evaluation.bootstrapSeed) >>> 0;
  const values = [];
  for (let iteration = 0;
    iteration < Number(config.evaluation.bootstrapIterations);
    iteration += 1) {
    let baselineAe = 0;
    let candidateAe = 0;
    let denominator = 0;
    for (let index = 0; index < works.length; index += 1) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const work = works[Math.floor((state / 2 ** 32) * works.length)];
      const base = baseline.get(work);
      const challenger = candidate.get(work);
      baselineAe += base.absoluteError;
      candidateAe += challenger.absoluteError;
      denominator += base.denominator;
    }
    const baselineWape = denominator === 0 ? 0 : baselineAe / denominator;
    const candidateWape = denominator === 0 ? 0 : candidateAe / denominator;
    values.push(baselineWape === 0
      ? 0
      : (baselineWape - candidateWape) / baselineWape);
  }
  values.sort((left, right) => left - right);
  return {
    iterations: values.length,
    seed: Number(config.evaluation.bootstrapSeed),
    clusterUnit: "standardWorkId",
    sameCasePaired: true,
    statistic: "relative_wape_improvement",
    lower95: values[Math.floor(0.025 * (values.length - 1))],
    upper95: values[Math.floor(0.975 * (values.length - 1))]
  };
}

function groupCasesByWork(cases) {
  const output = new Map();
  for (const row of cases) {
    const value = output.get(row.standardWorkId) ?? {
      absoluteError: 0,
      denominator: 0
    };
    value.absoluteError += Math.abs(row.pointEstimate - row.actual);
    value.denominator += Math.abs(row.actual);
    output.set(row.standardWorkId, value);
  }
  return output;
}

function privateEvaluationRows(primary, strict) {
  const output = [];
  for (const [family, result] of [
    ["primary", primary],
    ["strict", strict]
  ]) {
    for (const row of result.evaluations.G1.cases) {
      output.push({
        schema:
          "m2.current.channel_generative_G1_evaluation_private_row.v0.1",
        tracked: false,
        evaluationFamily: family,
        modelId: "M2-CHAN-GEN02",
        experimentArmId: "M2-EXP-CHANNEL-GENERATIVE-02/G1",
        candidateId: "G1",
        actualDefinitionId:
          "M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01",
        standardWorkId: row.standardWorkId,
        origin: row.origin,
        horizonMonths: row.horizonMonths,
        actualPositive: row.actualPositive,
        actualReversal: row.actualReversal,
        actual: row.actual,
        positivePoint: row.positivePoint,
        pointEstimate: row.pointEstimate,
        G2Executed: false,
        G3Executed: false,
        G4Executed: false,
        G5Executed: false,
        G6Executed: false
      });
    }
  }
  return output;
}

function publicForecastability(result) {
  return {
    schema:
      "m2.current.channel_generative_G1_forecastability_public.v0.1",
    displayNameZh:
      "渠道时间生成模型 v0.2——独立渠道月度发生—条件金额核心",
    displayNameEn:
      "Channel Generative v0.2 — Independent Monthly Occurrence × Conditional Amount Core",
    modelId: "M2-CHAN-GEN02",
    experimentArmId: "M2-EXP-CHANNEL-GENERATIVE-02/G1",
    finalStatus: result.finalStatus,
    primary: result.forecastability.primary,
    strict: result.forecastability.strict,
    diagnosticOnly: true,
    participatesInTraining: false,
    participatesInSelection: false,
    participatesInGate: false,
    deployable: false,
    canAuthorizeG4G5G6: false,
    allowedClaims: [
      "observed structural unreachable mass",
      "retrospective oracle gap",
      "current model-family residual gap",
      "missing historically available drivers"
    ],
    forbiddenClaims: [
      "proven irreducible error",
      "Bayes error measured",
      "theoretical maximum established",
      "forecasting impossible"
    ]
  };
}

function renderDevelopmentReport(result) {
  return `# 渠道时间生成模型 v0.2——独立渠道月度发生—条件金额核心

## 结论

本轮只执行实验臂 \`M2-EXP-CHANNEL-GENERATIVE-02/G1\` 的 raw 独立核心；
冻结的 \`G0\` 只作为相同实际值定义、相同外层 case 的配对比较基线。最终状态为
\`${result.finalStatus}\`。这是重复使用 development window 的受控证据，不是独立
later-origin，也不构成 production、exact v0.3 替换、自动化或 release 授权。

## 核心结果

| 对象 | Primary WAPE | 相对冻结 G0 | Strict WAPE | 相对冻结 G0 |
|---|---:|---:|---:|---:|
${["G0", "G1"].map((id) => {
    const value = result.evaluation[id];
    return `| ${id} | ${number(value.primary.wape)} | ${
      percent(value.relativeWape?.primary)
    } | ${number(value.strict.wape)} | ${
      percent(value.relativeWape?.strict)
    } |`;
  }).join("\n")}

冻结 G0 语义等价校验：\`${
  result.G0SemanticEquivalence.status
}\`。raw 独立核心结果完整保留，未由 fallback 或 blend 覆盖。

## 边界

结构化偏置、混合、平台、taxonomy 与 composition 实验臂均未执行。
production surface change count 为 0；exact v0.3、holdout、provider、database、
Canary 与 release 均未打开。无论结果如何，
\`safeToStartImplementationOfAnyLaterLayer=false\`，等待用户另行决定。
`;
}

function renderForecastabilityReport(result) {
  const primary = result.forecastability.primary;
  const strict = result.forecastability.strict;
  return `# 渠道时间生成模型 v0.2 可预测性诊断

## 诊断边界

这些 retrospective oracle 诊断只在 raw 独立核心候选输出冻结后执行，不参与训练、
inner/outer selection、gate 或 routing，也不能授权其它实验臂。它们描述当前
输入边界下的新渠道不可达现金、发生误差上限、条件金额误差上限和机制时间 basis
的信息增益；没有测得 Bayes error，也没有证明预测不可能。

## 当前可达范围

| 口径 | 全部实际可建模现金 | future-first-seen 现金 | 占比 |
|---|---:|---:|---:|
| Primary | ${number(primary.currentReachability.totalActualPositiveCash)} | ${
  number(primary.currentReachability.futureFirstSeenActualPositiveCash)
} | ${percent(primary.currentReachability.futureFirstSeenShare)} |
| Strict | ${number(strict.currentReachability.totalActualPositiveCash)} | ${
  number(strict.currentReachability.futureFirstSeenActualPositiveCash)
} | ${percent(strict.currentReachability.futureFirstSeenShare)} |

\`ORACLE_OCCURRENCE_ONLY\`、\`ORACLE_AMOUNT_ONLY\`、\`ORACLE_BOTH\`、
\`FUTURE_FIRST_ENTRY_CEILING\` 与 \`MECHANISM_INFORMATION_GAIN\` 均不可部署，
也不参与独立核心是否通过的判定。
`;
}

function buildPublishingScaleReadiness({
  config,
  support,
  diagnostic
}) {
  return {
    schema: "m2.current.publishing_scale_channel_readiness.v0.1",
    displayNameZh: config.displayNameZh,
    displayNameEn: config.displayNameEn,
    modelId: M2_PUBLISHING_SCALE_MODEL_ID,
    experimentArmId: M2_PUBLISHING_SCALE_ARM_ID,
    status: config.currentExecution.status,
    supportContractId: support.contractId,
    supportContractStatus: support.status,
    implementation: {
      canonicalCore:
        "src/domain/m2Current/publishingScaleChannelCore.js",
      runtimeConfig: PUBLISHING_SCALE_CONFIG_PATH,
      publicDiagnostic: config.publicDiagnosticOutput,
      historicalModelOverwritten: false,
      historicalArtifactVerifierPreserved: true,
      legacyFixedEligibilityUsed: false,
      workBalancedTraining: true,
      continuousParentShrinkage: true,
      oneClassSmoothing: "Jeffreys_0.5_0.5"
    },
    supportTiers: {
      directFitNodeCount:
        support.currentFreezeDecision.directFitNodeCount,
      globalPooledParent:
        support.parameterFreeze.nodes.globalPooledParent.frozenTier,
      mechanisms: Object.fromEntries(
        ["membership", "advertising", "transactional"].map((key) => [
          key,
          support.parameterFreeze.nodes[key].frozenTier
        ])
      ),
      namedPlatforms: Object.fromEntries(Object.entries(
        support.parameterFreeze.namedPlatforms
      ).map(([name, value]) => [name, value.frozenTier])),
      taxonomy: support.parameterFreeze.taxonomy,
      authorization: support.parameterFreeze.authorization
    },
    syntheticVerification: {
      status: diagnostic.status,
      distinctWorkCount: diagnostic.training.distinctWorkCount,
      monthlyRowCount: diagnostic.training.monthlyRowCount,
      workTotal: diagnostic.evaluation.workTotal,
      support: diagnostic.support,
      privateArtifactRead: diagnostic.boundaries.privateArtifactRead,
      candidateOuterOutcomeRead:
        diagnostic.boundaries.candidateOuterOutcomeRead
    },
    authorityBoundary: {
      taxonomy: "REPORT_ONLY",
      authorization: "REPORT_ONLY",
      currentOnlyTaxonomyBackfilled: false,
      currentOnlyAuthorizationBackfilled: false,
      originObservedCanonicalChannelIdentityOnly: true
    },
    executionBoundary: {
      privateDevelopmentExecutionAuthorizedOnceAfterExactHeadCi:
        config.authorization.oneTimePrivateDevelopmentEvaluation
          === "AUTHORIZED_AFTER_K7C_EXACT_HEAD_LINUX_WINDOWS_CI",
      privateDevelopmentExecutionConsumed:
        config.currentExecution.privateExecutionAuthorizationConsumed,
      privateMaterializationStarted:
        config.currentExecution.privateMaterializationStarted,
      privateCapabilityReadOccurred:
        config.currentExecution.privateCapabilityReadOccurred,
      candidateFitStarted:
        config.currentExecution.candidateFitStarted,
      candidateOuterOutcomeProduced:
        config.currentExecution.candidateOutputProduced,
      finalHoldoutOpened:
        config.currentExecution.finalHoldoutOpened,
      productionModified:
        config.currentExecution.productionModified,
      operationalFallbackModified:
        config.currentExecution.operationalFallbackModified,
      retryAuthorized: config.authorization.retryAuthorized,
      mergeAuthorized: false
    },
    impactMap:
      "docs/analysis/m2-current/"
      + "M2-publishing-scale-threshold-impact-map-v1.json"
  };
}

function renderPublishingScaleReadiness(result) {
  const mechanisms = result.supportTiers.mechanisms;
  return `# ${result.displayNameZh}：当前实现与执行闭环

- 英文名：${result.displayNameEn}
- 稳定模型 ID：\`${result.modelId}\`
- 实验臂：\`${result.experimentArmId}\`
- 当前状态：私有物化在候选拟合前因实现接线错误 fail-closed
  （\`${result.status}\`）
- 支持合同：\`${result.supportContractId}\`

## 实现结果

新版本位于 canonical M2 core，使用每部作品总权重相等的训练权重，并分别在发生概率的
logit 尺度与条件金额的 log1p 尺度连续收缩到父层。历史
\`M2-CHAN-GEN02\`、历史配置、历史评分和旧阻断结论均未改写。

## 冻结支持层级

- 全局池化父层：\`${result.supportTiers.globalPooledParent}\`
- 会员分成机制：\`${mechanisms.membership}\`
- 广告分成机制：\`${mechanisms.advertising}\`
- 单购交易机制：\`${mechanisms.transactional}\`
- 三级分类：\`${result.supportTiers.taxonomy}\`
- 授权关系：\`${result.supportTiers.authorization}\`
- 独立拟合（\`DIRECT_FIT\`）节点数：${result.supportTiers.directFitNodeCount}

月度行没有被解释为独立作品样本。每个公开节点都报告 distinct works、
positive works、work-cluster ESS、现金 ESS、集中度、支持层级、连续收缩权重与回退原因。

## 权威与执行边界

三级分类和 work-platform 授权关系缺少历史 as-of 字段，因此保持
\`REPORT_ONLY\`；只允许使用 forecast origin 已观察到的 canonical channel
identity，不回填 current-only 分类或授权。K7C exact-head Linux/Windows CI 已通过；
K7D 唯一一次私有命令已启动物化并读取 capability-scoped 输入，但在候选拟合前
fail-closed。没有候选预测、候选评价、bootstrap 或 oracle 结果。本次授权已消耗，
未授权重试。

## 公开 synthetic 验证

- 状态：\`${result.syntheticVerification.status}\`
- distinct works：${result.syntheticVerification.distinctWorkCount}
- monthly rows：${result.syntheticVerification.monthlyRowCount}
- WAPE：${number(result.syntheticVerification.workTotal.wape)}
- signed bias：${number(result.syntheticVerification.workTotal.signedBias)}
- private artifact read：${result.syntheticVerification.privateArtifactRead}
- candidate outer outcome read：${result.syntheticVerification.candidateOuterOutcomeRead}
`;
}

function buildPublishingScaleExecutionClosure({ config, readiness }) {
  return {
    schema:
      "m2.current.publishing_scale_channel_execution_closure_public.v0.1",
    displayNameZh: config.displayNameZh,
    displayNameEn: config.displayNameEn,
    modelId: M2_PUBLISHING_SCALE_MODEL_ID,
    experimentArmId: M2_PUBLISHING_SCALE_ARM_ID,
    finalStatus: config.currentExecution.status,
    executionAttempt: {
      exactHeadPreflightPassed: true,
      pullRequestNumber: 29,
      k7cLinuxCiPassed: true,
      k7cWindowsCiPassed: true,
      privateMaterializationStarted:
        config.currentExecution.privateMaterializationStarted,
      privateCapabilityReadOccurred:
        config.currentExecution.privateCapabilityReadOccurred,
      failureStage: config.currentExecution.failureStage,
      failureCode: config.currentExecution.failureCode,
      candidateFitStarted: config.currentExecution.candidateFitStarted,
      candidateOutputProduced:
        config.currentExecution.candidateOutputProduced,
      evaluatedCandidateIds:
        config.currentExecution.evaluatedCandidateIds
    },
    requestedEvaluationAvailability: {
      primary: "NOT_PRODUCED",
      strict: "NOT_PRODUCED",
      horizon: "NOT_PRODUCED",
      timeBlock: "NOT_PRODUCED",
      topRevenue: "NOT_PRODUCED",
      bias: "NOT_PRODUCED",
      mae: "NOT_PRODUCED",
      medianAbsoluteError: "NOT_PRODUCED",
      occurrence: "NOT_PRODUCED",
      conditionalAmount: "NOT_PRODUCED",
      ranking: "NOT_PRODUCED",
      workClusterBootstrap2000: "NOT_PRODUCED",
      forecastabilityOracle: "NOT_PRODUCED"
    },
    rootCause: {
      class: "IMPLEMENTATION_MODE_ROUTING_MISMATCH",
      explanation:
        "the new publishing-scale runner invoked the historical "
        + "channel-generative materialization mode, whose consumed "
        + "historical authorization correctly failed closed before "
        + "the new model could fit",
      dataAuthorityFailure: false,
      statisticalSupportFailure: false,
      rawCandidateGateFailure: false
    },
    remediation: {
      publishingScaleMaterializationModeSeparated: true,
      historicalMaterializationModePreserved: true,
      materializationFailureReceiptAutomatic: true,
      publicSyntheticValidationOnlyAfterRepair: true,
      privateRetryPerformed: false,
      privateRetryAuthorized: false,
      newAuthorizationAndNewExactHeadCiRequiredForAnyFutureAttempt: true
    },
    governance: {
      privateExecutionAuthorizationConsumed:
        readiness.executionBoundary.privateDevelopmentExecutionConsumed,
      activeCandidate: null,
      approvedForAutomation: null,
      operationalFallbackModelId: "M2-WORK-OA03",
      operationalFallbackModified: false,
      finalHoldoutOpened: false,
      productionModified: false,
      providerUsed: false,
      databaseUsed: false,
      laterOriginOpened: false,
      mergeAuthorized: false
    },
    privacy: {
      privateRowDataIncluded: false,
      privatePathIncluded: false,
      privateDigestIncluded: false
    }
  };
}

function renderPublishingScaleExecutionClosure(result) {
  return `# ${result.displayNameZh}：K7D 一次性执行闭环

- 最终状态：出版行业规模适配实现阻断（\`${result.finalStatus}\`）
- 模型：${result.displayNameZh}（${result.displayNameEn}，\`${result.modelId}\`）
- 实验臂：出版行业规模适配渠道核心开发的核心臂
  （\`${result.experimentArmId}\`）

K7C 的精确提交、Draft PR #29 与 Linux/Windows CI 前置核验均通过。K7D 唯一一次
私有命令随后启动 capability-scoped 物化；由于新 runner 误调用历史渠道时间生成模型
v0.2 的物化模式，历史已消耗授权的边界校验正确 fail-closed。失败发生在候选拟合前。

因此没有生成 raw candidate、primary/strict 结果、分 horizon/time block/top revenue
结果、bias/MAE/median AE、occurrence/conditional amount/ranking、2,000 次作品聚类
bootstrap 或 forecastability/oracle 诊断。不能把本次结果解释为模型通过或模型失败。

实现已修复为独立的 publishing-scale 物化入口，并补齐物化阶段自动失败收据；历史
物化入口未改写。修复后只运行公开 synthetic 验证。本次私有授权已消耗且未授权重试；
未来若要再次执行，必须由用户提供新的明确授权，并重新经过新提交的精确
Linux/Windows CI。

作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，
\`M2-WORK-OA03\`）继续是现行运行回退模型；活动候选和自动化批准均为空。final
holdout、production、provider、database、later-origin、release 与 PR 合并均未打开。
`;
}

function buildPublishingScalePublicResult({
  config,
  support,
  baselines,
  pairedResearchComparatorCandidate,
  operationalFallback,
  globalParentAblation,
  diagnostics,
  primary,
  strict,
  bootstrap,
  gate,
  forecastability,
  candidateFreeze,
  restatementBinding
}) {
  const finalStatus = gate.allPassed
    ? "M2_PUBLISHING_SCALE_CORE_PASS"
    : gate.reproducibleLocalSignal
      ? "M2_PUBLISHING_SCALE_CORE_PROMISING_NOT_QUALIFIED"
      : "M2_PUBLISHING_SCALE_CORE_FAIL";
  return {
    schema: "m2.current.publishing_scale_channel_development_public.v0.1",
    displayNameZh: config.displayNameZh,
    displayNameEn: config.displayNameEn,
    modelId: M2_PUBLISHING_SCALE_MODEL_ID,
    experimentArmId: M2_PUBLISHING_SCALE_ARM_ID,
    candidateId: M2_PUBLISHING_SCALE_RAW_CANDIDATE_ID,
    finalStatus,
    evaluationContractId:
      "M2_EVALUATION_V2_2_ACTIVE_FOR_DEVELOPMENT_WITH_DISCLOSED_RESIDUAL_EXCLUSION",
    supportContractId: support.contractId,
    actualDefinitionId: config.actualDefinitionId,
    comparisonBoundary: {
      comparatorId: "M2-WORK-LG01-FROZEN-G0",
      comparatorRole: "paired_research_baseline_not_operational_fallback",
      sameCases: true,
      sameActualDefinition: true,
      workTotalPopulation: "exact_same_case_population",
      workChannelPopulation: "same_case_channel_intersection_only",
      operationalFallbackId: "M2-WORK-OA03",
      operationalFallbackDirectlyRanked:
        operationalFallback.primary.caseCount > 0
        || operationalFallback.strict.caseCount > 0,
      operationalFallbackComparisonPopulation:
        "exact_same_case_intersection_only"
    },
    evaluation: {
      frozenResearchComparator: {
        primary: publishingScaleEvaluationSummary(baselines.primary),
        strict: publishingScaleEvaluationSummary(baselines.strict)
      },
      frozenResearchComparatorChannelIntersection: {
        primary: pairedResearchComparatorCandidate.primary,
        strict: pairedResearchComparatorCandidate.strict,
        directlyComparableToRawCandidateFullChannelPopulation: false
      },
      operationalFallbackSameCaseIntersection: {
        primary: publishingScaleComparableIntersectionSummary(
          operationalFallback.primary
        ),
        strict: publishingScaleComparableIntersectionSummary(
          operationalFallback.strict
        )
      },
      globalParentAblation: {
        role: "PRE_REGISTERED_LAYER_ABLATION_NOT_OPERATIONAL_FALLBACK",
        primary: publishingScaleEvaluationSummary(
          globalParentAblation.primary
        ),
        strict: publishingScaleEvaluationSummary(
          globalParentAblation.strict
        ),
        relativeWapeFromGlobalParentToRawCandidate: {
          primary: relativeWape(
            globalParentAblation.primary,
            primary.evaluation
          ),
          strict: relativeWape(
            globalParentAblation.strict,
            strict.evaluation
          )
        }
      },
      rawCandidate: {
        primary: publishingScaleEvaluationSummary(primary.evaluation),
        strict: publishingScaleEvaluationSummary(strict.evaluation),
        relativeWapeToFrozenResearchComparator: {
          primary: relativeWape(baselines.primary, primary.evaluation),
          strict: relativeWape(baselines.strict, strict.evaluation)
        },
        operationalFallbackSameCaseIntersection: {
          primary: operationalFallback.primary.candidate,
          strict: operationalFallback.strict.candidate,
          relativeWapeToOperationalFallback: {
            primary: relativeMetric(
              operationalFallback.primary.fallback.wape,
              operationalFallback.primary.candidate.wape
            ),
            strict: relativeMetric(
              operationalFallback.strict.fallback.wape,
              operationalFallback.strict.candidate.wape
            )
          }
        },
        byHorizon: {
          primary: primary.evaluation.byHorizon,
          strict: strict.evaluation.byHorizon
        },
        byTimeBlock: {
          primary: primary.evaluation.byOrigin,
          strict: strict.evaluation.byOrigin
        },
        byMechanism: {
          primary: primary.evaluation.byMechanism,
          strict: strict.evaluation.byMechanism
        },
        topRevenue: {
          primary: primary.evaluation.topRevenue,
          strict: strict.evaluation.topRevenue
        },
        occurrence: {
          primary: primary.evaluation.occurrence,
          strict: strict.evaluation.occurrence
        },
        conditionalAmount: {
          primary: primary.evaluation.conditionalAmount,
          strict: strict.evaluation.conditionalAmount
        },
        ranking: {
          primary: scorePublishingScaleRanking(
            primary.evaluation.cases
          ),
          strict: scorePublishingScaleRanking(
            strict.evaluation.cases
          )
        },
        coverage: {
          primary: primary.evaluation.coverage,
          strict: strict.evaluation.coverage,
          role: "DESCRIPTIVE_ONLY_NOT_A_FIT_GATE"
        },
        detailedDiagnostics: diagnostics
      }
    },
    bootstrap: {
      clusterUnit: "standard_work",
      iterations: config.evaluation.bootstrapIterations,
      pairedRelativeWape: bootstrap
    },
    gate,
    support: {
      primaryOuterFolds: primary.receipts,
      strictOuterOrigins: strict.receipts,
      directFitNodeCount:
        support.currentFreezeDecision.directFitNodeCount,
      taxonomyTier: "REPORT_ONLY",
      authorizationTier: "REPORT_ONLY"
    },
    forecastability,
    candidateFreeze: {
      status: candidateFreeze.status,
      rowCount: candidateFreeze.rowCount,
      privateDigestPublished: false,
      predictionGeneratedAfterFreezeCount:
        candidateFreeze.predictionGeneratedAfterFreezeCount,
      predictionModifiedAfterFreezeCount:
        candidateFreeze.predictionModifiedAfterFreezeCount
    },
    reversalRestatement: {
      primary: publicRestatementAudit(restatementBinding.primary),
      strict: publicRestatementAudit(restatementBinding.strict)
    },
    interpretation: {
      cashOnlyCoreMayContinueAsDevelopmentCandidate:
        finalStatus === "M2_PUBLISHING_SCALE_CORE_PASS",
      operationalFallbackRemainsUnchanged: true,
      productionUpgradeSupported: false,
      automationSupported: false,
      releaseSupported: false,
      ifFailedNextEvidencePriority: [
        "historical_business_state",
        "availability_and_consumption",
        "exposure_and_eCPM",
        "orders_and_refunds",
        "contracts",
        "origin_visible_operations"
      ]
    },
    boundaries: {
      oneTimePrivateDevelopmentExecutionConsumed: true,
      rawCandidatePreserved: true,
      fallbackOverwroteRaw: false,
      outerOutcomeUsedForParameterSelection: false,
      currentOnlyTaxonomyBackfilled: false,
      currentOnlyAuthorizationBackfilled: false,
      finalHoldoutOpened: false,
      laterOriginOpened: false,
      providerUsed: false,
      databaseRead: false,
      productionModified: false,
      exactV03Modified: false,
      mergeAuthorized: false,
      privateRowDataPublished: false,
      privateArtifactDigestPublished: false
    }
  };
}

function evaluatePublishingScaleGates({
  config,
  baselines,
  pairedResearchComparatorCandidate,
  primary,
  strict,
  bootstrap
}) {
  const primaryRelative = relativeWape(baselines.primary, primary);
  const strictRelative = relativeWape(baselines.strict, strict);
  const strictImprovedOrigins = Object.keys(strict.byOrigin).filter(
    (origin) => relativeMetric(
      baselines.strict.byOrigin[origin]?.wape,
      strict.byOrigin[origin]?.wape
    ) > 0
  ).length;
  const horizons = [
    ...Object.keys(primary.byHorizon).map((horizon) => ({
      family: "primary",
      horizon,
      value: relativeMetric(
        baselines.primary.byHorizon[horizon]?.wape,
        primary.byHorizon[horizon]?.wape
      )
    })),
    ...Object.keys(strict.byHorizon).map((horizon) => ({
      family: "strict",
      horizon,
      value: relativeMetric(
        baselines.strict.byHorizon[horizon]?.wape,
        strict.byHorizon[horizon]?.wape
      )
    }))
  ].filter((entry) => Number.isFinite(entry.value));
  const checks = {
    rawCandidateProduced: true,
    primaryRelativeWape:
      primaryRelative >= config.evaluation.relativeWapeMinimum,
    strictRelativeWape:
      strictRelative >= config.evaluation.relativeWapeMinimum,
    strictImprovedOriginBlocks:
      strictImprovedOrigins
        >= config.evaluation.strictImprovedOriginBlockMinimum,
    improvedHorizonSlices:
      horizons.filter((entry) => entry.value > 0).length
        >= config.evaluation.improvedHorizonSliceMinimum,
    eachHorizonSafety: horizons.every(
      (entry) => entry.value
        >= config.evaluation.relativeWapeMaximumAllowedHarm
    ),
    top10MaterialImprovement: bothTop(
      baselines,
      primary,
      strict,
      "0.1",
      config.evaluation.relativeWapeMinimum
    ),
    top1Safety: bothTop(
      baselines,
      primary,
      strict,
      "0.01",
      config.evaluation.relativeWapeMaximumAllowedHarm
    ),
    top5Safety: bothTop(
      baselines,
      primary,
      strict,
      "0.05",
      config.evaluation.relativeWapeMaximumAllowedHarm
    ),
    biasSafety:
      Math.abs(primary.workTotal.signedBias)
        - Math.abs(baselines.primary.workTotal.signedBias)
          <= config.evaluation.absoluteBiasDeteriorationMaximum
      && Math.abs(strict.workTotal.signedBias)
        - Math.abs(baselines.strict.workTotal.signedBias)
          <= config.evaluation.absoluteBiasDeteriorationMaximum,
    bootstrapSafety:
      bootstrap.primary.lower95
        >= config.evaluation.relativeWapeMaximumAllowedHarm
      && bootstrap.strict.lower95
        >= config.evaluation.relativeWapeMaximumAllowedHarm,
    occurrenceScored:
      Number.isFinite(primary.occurrence.logLoss)
      && Number.isFinite(strict.occurrence.logLoss),
    conditionalAmountScored:
      Number.isFinite(primary.conditionalAmount.mae)
      && Number.isFinite(strict.conditionalAmount.mae),
    mechanismSafety: publishingScaleMechanismSafety(
      baselines,
      pairedResearchComparatorCandidate.primary,
      pairedResearchComparatorCandidate.strict
    )
  };
  return {
    checks,
    allPassed: Object.values(checks).every(Boolean),
    reproducibleLocalSignal: (
      (
        primaryRelative > 0
        && bootstrap.primary.lower95 > 0
      )
      || (
        strictRelative > 0
        && bootstrap.strict.lower95 > 0
      )
    ),
    primaryRelativeWape: primaryRelative,
    strictRelativeWape: strictRelative,
    strictImprovedOriginBlocks: strictImprovedOrigins,
    improvedHorizonSlices:
      horizons.filter((entry) => entry.value > 0).length,
    horizonRelativeImprovements: horizons,
    generatorUsageIsNotAGate: true
  };
}

function publishingScaleMechanismSafety(baselines, primary, strict) {
  const mechanisms = ["membership", "advertising", "transactional"];
  return mechanisms.filter((mechanism) => {
    const primaryValue = relativeMetric(
      baselines.primary.byMechanism[mechanism]?.wape,
      primary.byMechanism[mechanism]?.wape
    );
    const strictValue = relativeMetric(
      baselines.strict.byMechanism[mechanism]?.wape,
      strict.byMechanism[mechanism]?.wape
    );
    return primaryValue >= -0.01 && strictValue >= -0.01;
  }).length >= 2;
}

function scorePublishingScaleCandidateChannelIntersection(
  baseline,
  candidate
) {
  const candidateCases = new Map(candidate.cases.map((row) => [
    publishingScaleCaseKey(
      row.standardWorkId,
      row.origin,
      row.horizonMonths
    ),
    row
  ]));
  const pairedChannels = [];
  for (const baselineCase of baseline.cases) {
    const candidateCase = candidateCases.get(publishingScaleCaseKey(
      baselineCase.standardWorkId,
      baselineCase.origin,
      baselineCase.horizonMonths
    ));
    if (candidateCase === undefined) {
      throw new Error(
        "m2_publishing_scale_candidate_comparator_work_pair_missing"
      );
    }
    const candidateChannels = new Map(candidateCase.channels.map((row) => [
      row.channelUid,
      row
    ]));
    for (const baselineChannel of baselineCase.channels) {
      const candidateChannel = candidateChannels.get(baselineChannel.channelUid);
      if (candidateChannel === undefined) {
        throw new Error(
          "m2_publishing_scale_candidate_comparator_channel_pair_missing"
        );
      }
      pairedChannels.push(candidateChannel);
    }
  }
  const observedChannels = pairedChannels.filter(
    (row) => row.observedAtOrigin
  );
  return Object.freeze({
    sameCase: true,
    sameTarget: true,
    sameOrigin: true,
    sameHorizon: true,
    sameActualDefinition: true,
    population: "same_case_channel_intersection_only",
    candidateFullChannelCaseCount:
      candidate.cases.reduce((total, row) => total + row.channels.length, 0),
    pairedChannelCaseCount: pairedChannels.length,
    excludedCandidateChannelCaseCount:
      candidate.cases.reduce(
        (total, row) => total + row.channels.length,
        0
      ) - pairedChannels.length,
    workChannel: scorePublishingScaleComparableCases(pairedChannels),
    byMechanism: scorePublishingScaleComparableSlices(
      observedChannels,
      "mechanism"
    )
  });
}

function publishingScaleEvaluationSummary(value) {
  const errors = value.cases.map(
    (row) => Math.abs(row.pointEstimate - row.actual)
  ).sort((left, right) => left - right);
  const middle = Math.floor(errors.length / 2);
  const medianAbsoluteError = errors.length === 0
    ? null
    : errors.length % 2 === 0
      ? (errors[middle - 1] + errors[middle]) / 2
      : errors[middle];
  return {
    ...value.workTotal,
    mae: errors.length === 0
      ? null
      : value.workTotal.absoluteError / errors.length,
    medianAbsoluteError,
    workChannelWape: value.workChannel.wape,
    workChannelAbsoluteError: value.workChannel.absoluteError,
    occurrence: value.occurrence ?? null,
    conditionalAmount: value.conditionalAmount ?? null,
    ranking: scorePublishingScaleRanking(value.cases),
    privateCasesIncluded: false
  };
}

function scorePublishingScaleOperationalFallbackIntersection(
  result,
  modelId
) {
  const fallbackByCase = new Map();
  for (const row of result.rows) {
    for (const horizon of row.includedHorizons) {
      const point = row.operationalFallbackPointByHorizon?.[String(horizon)];
      if (!Number.isFinite(Number(point))) continue;
      const key = publishingScaleCaseKey(
        row.standardWorkId,
        row.origin,
        horizon
      );
      const previous = fallbackByCase.get(key);
      if (previous !== undefined && previous !== Number(point)) {
        throw new Error(
          "m2_publishing_scale_operational_fallback_point_drift"
        );
      }
      fallbackByCase.set(key, Number(point));
    }
  }
  const candidateCases = result.evaluation.cases.filter((row) => (
    fallbackByCase.has(publishingScaleCaseKey(
      row.standardWorkId,
      row.origin,
      row.horizonMonths
    ))
  ));
  const fallbackCases = candidateCases.map((row) => ({
    ...row,
    pointEstimate: fallbackByCase.get(publishingScaleCaseKey(
      row.standardWorkId,
      row.origin,
      row.horizonMonths
    ))
  }));
  return Object.freeze({
    modelId,
    caseCount: candidateCases.length,
    workCount: new Set(
      candidateCases.map((row) => row.standardWorkId)
    ).size,
    sameCase: true,
    sameTarget: true,
    sameOrigin: true,
    sameHorizon: true,
    sameActualDefinition: true,
    fallback: scorePublishingScaleComparableCases(fallbackCases),
    candidate: scorePublishingScaleComparableCases(candidateCases),
    byHorizon: Object.freeze({
      fallback: scorePublishingScaleComparableSlices(
        fallbackCases,
        "horizonMonths"
      ),
      candidate: scorePublishingScaleComparableSlices(
        candidateCases,
        "horizonMonths"
      )
    }),
    byOrigin: Object.freeze({
      fallback: scorePublishingScaleComparableSlices(
        fallbackCases,
        "origin"
      ),
      candidate: scorePublishingScaleComparableSlices(
        candidateCases,
        "origin"
      )
    })
  });
}

function publishingScaleComparableIntersectionSummary(value) {
  return {
    modelId: value.modelId,
    caseCount: value.caseCount,
    workCount: value.workCount,
    sameCase: value.sameCase,
    sameTarget: value.sameTarget,
    sameOrigin: value.sameOrigin,
    sameHorizon: value.sameHorizon,
    sameActualDefinition: value.sameActualDefinition,
    fallback: value.fallback,
    candidate: value.candidate,
    relativeWape: relativeMetric(
      value.fallback.wape,
      value.candidate.wape
    ),
    byHorizon: value.byHorizon,
    byOrigin: value.byOrigin
  };
}

function scorePublishingScaleComparableSlices(cases, field) {
  const groups = new Map();
  for (const row of cases) {
    const key = String(row[field]);
    const values = groups.get(key) ?? [];
    values.push(row);
    groups.set(key, values);
  }
  return Object.freeze(Object.fromEntries(
    [...groups.entries()].map(([key, values]) => [
      key,
      scorePublishingScaleComparableCases(values)
    ])
  ));
}

function scorePublishingScaleComparableCases(cases) {
  let absoluteError = 0;
  let signedError = 0;
  let denominator = 0;
  const errors = [];
  for (const row of cases) {
    const actual = Number(row.actual);
    const point = Number(row.pointEstimate);
    const error = point - actual;
    absoluteError += Math.abs(error);
    signedError += error;
    denominator += Math.abs(actual);
    errors.push(Math.abs(error));
  }
  errors.sort((left, right) => left - right);
  const middle = Math.floor(errors.length / 2);
  return Object.freeze({
    caseCount: cases.length,
    absoluteError,
    actualCashDenominator: denominator,
    wape: denominator === 0 ? null : absoluteError / denominator,
    signedBias: denominator === 0 ? null : signedError / denominator,
    mae: cases.length === 0 ? null : absoluteError / cases.length,
    medianAbsoluteError: cases.length === 0
      ? null
      : cases.length % 2 === 0
        ? (errors[middle - 1] + errors[middle]) / 2
        : errors[middle]
  });
}

function publishingScaleCaseKey(workId, origin, horizon) {
  return `${workId}\u001f${origin}\u001f${horizon}`;
}

export function buildPublishingScaleDetailedEvaluation(result, config) {
  const tierAttribution = scorePublishingScaleSupportAttribution(result);
  return Object.freeze({
    occurrenceCalibration: Object.freeze({
      allPredictionEligibleRows: scoreOccurrenceCalibration(
        result.rows,
        result.predictions
      ),
      originObservedRows: scoreOccurrenceCalibration(
        result.rows.filter((row) => row.observedAtOrigin),
        result.predictions
      )
    }),
    namedPlatforms: scorePublishingScaleNamedPlatforms(
      result.evaluation.cases,
      config.nodes.namedPlatforms
    ),
    supportTier: tierAttribution.byTier,
    selectedNode: tierAttribution.bySelectedNode,
    topCashAndErrorAttribution: scorePublishingScaleTopAttribution(
      result.evaluation.cases,
      config.evaluation.topRevenueFractions
    ),
    hierarchyLayerIncrement: scorePublishingScaleLayerIncrement(result),
    structuralCoverage: Object.freeze({
      originObservedMonthlyRowCount:
        result.evaluation.coverage.observedChannelMonthlyRowCount,
      futureFirstSeenMonthlyRowCount:
        result.evaluation.coverage.futureFirstSeenMonthlyRowCount,
      futureFirstSeenActualPositiveCash:
        result.evaluation.coverage.futureFirstSeenActualPositiveCash,
      futureFirstSeenActualPositiveCashShare: safeRatio(
        result.evaluation.coverage.futureFirstSeenActualPositiveCash,
        result.evaluation.coverage.observedChannelActualPositiveCash
          + result.evaluation.coverage.futureFirstSeenActualPositiveCash
      ),
      tierMonthlyRowUsage: tierAttribution.monthlyRowUsage
    })
  });
}

function scoreOccurrenceCalibration(rows, predictions) {
  const binCount = 10;
  const bins = Array.from({ length: binCount }, (_, index) => ({
    lowerInclusive: index / binCount,
    upperInclusive: (index + 1) / binCount,
    rowCount: 0,
    predictedProbabilityTotal: 0,
    actualOccurrenceTotal: 0
  }));
  for (const row of rows) {
    const prediction = predictions.get(
      `${row.standardWorkId}\u001f${row.channelUid}`
        + `\u001f${row.origin}\u001f${row.futureMonthIndex}`
    );
    if (!Number.isFinite(prediction?.occurrenceProbability)) continue;
    const probability = Math.max(
      0,
      Math.min(1, Number(prediction.occurrenceProbability))
    );
    const index = Math.min(binCount - 1, Math.floor(probability * binCount));
    bins[index].rowCount += 1;
    bins[index].predictedProbabilityTotal += probability;
    bins[index].actualOccurrenceTotal += row.actualPositive > 0 ? 1 : 0;
  }
  const populated = bins.filter((bin) => bin.rowCount > 0).map((bin) => {
    const meanPredictedProbability =
      bin.predictedProbabilityTotal / bin.rowCount;
    const observedOccurrenceRate =
      bin.actualOccurrenceTotal / bin.rowCount;
    return Object.freeze({
      lowerInclusive: bin.lowerInclusive,
      upperInclusive: bin.upperInclusive,
      rowCount: bin.rowCount,
      meanPredictedProbability,
      observedOccurrenceRate,
      absoluteCalibrationGap:
        Math.abs(meanPredictedProbability - observedOccurrenceRate)
    });
  });
  const rowCount = populated.reduce(
    (total, bin) => total + bin.rowCount,
    0
  );
  return Object.freeze({
    rowCount,
    binCount,
    populatedBinCount: populated.length,
    expectedCalibrationError: rowCount === 0
      ? null
      : populated.reduce(
        (total, bin) => total
          + bin.rowCount / rowCount * bin.absoluteCalibrationGap,
        0
      ),
    bins: Object.freeze(populated)
  });
}

function scorePublishingScaleNamedPlatforms(cases, platforms) {
  return Object.freeze(Object.fromEntries(platforms.map((platform) => {
    const rows = cases.flatMap((row) => row.channels
      .filter((channel) => channel.channelUid === platform.channelUid)
      .map((channel) => ({
        ...channel,
        standardWorkId: row.standardWorkId,
        origin: row.origin,
        horizonMonths: row.horizonMonths
      })));
    return [platform.platformId, Object.freeze({
      displayNameZh: platform.displayNameZh,
      channelUid: platform.channelUid,
      frozenTier: platform.frozenTier,
      workCount: new Set(rows.map((row) => row.standardWorkId)).size,
      channelCaseCount: rows.length,
      point: scorePublishingScaleComparableCases(rows)
    })];
  })));
}

function scorePublishingScaleSupportAttribution(result) {
  const cases = new Map();
  const monthlyUsage = new Map();
  for (const row of result.rows) {
    const prediction = result.predictions.get(
      `${row.standardWorkId}\u001f${row.channelUid}`
        + `\u001f${row.origin}\u001f${row.futureMonthIndex}`
    );
    if (prediction === undefined) continue;
    const tier = prediction.supportTier;
    const node = prediction.selectedNodeId;
    const usage = monthlyUsage.get(tier) ?? {
      monthlyRowCount: 0,
      actualPositiveCash: 0
    };
    usage.monthlyRowCount += 1;
    usage.actualPositiveCash += Number(row.actualPositive);
    monthlyUsage.set(tier, usage);
    for (const horizon of row.includedHorizons) {
      const key = [
        tier,
        node,
        row.standardWorkId,
        row.origin,
        horizon
      ].join("\u001f");
      const value = cases.get(key) ?? {
        tier,
        node,
        standardWorkId: row.standardWorkId,
        origin: row.origin,
        horizonMonths: horizon,
        actual: 0,
        pointEstimate: 0
      };
      value.actual += Number(row.actual);
      value.pointEstimate += Number(prediction.positivePoint);
      cases.set(key, value);
    }
  }
  const values = [...cases.values()];
  const byTier = scorePublishingScaleAttributionDimension(values, "tier");
  const bySelectedNode = scorePublishingScaleAttributionDimension(
    values,
    "node"
  );
  const totalRows = [...monthlyUsage.values()].reduce(
    (total, value) => total + value.monthlyRowCount,
    0
  );
  const totalCash = [...monthlyUsage.values()].reduce(
    (total, value) => total + value.actualPositiveCash,
    0
  );
  return Object.freeze({
    byTier,
    bySelectedNode,
    monthlyRowUsage: Object.freeze(Object.fromEntries(
      [...monthlyUsage.entries()].sort().map(([tier, value]) => [
        tier,
        Object.freeze({
          ...value,
          monthlyRowShare: safeRatio(value.monthlyRowCount, totalRows),
          actualPositiveCashShare:
            safeRatio(value.actualPositiveCash, totalCash)
        })
      ])
    ))
  });
}

function scorePublishingScaleAttributionDimension(rows, field) {
  const keys = [...new Set(rows.map((row) => row[field]))].sort();
  const scores = Object.fromEntries(keys.map((key) => {
    const selected = rows.filter((row) => row[field] === key);
    return [key, {
      workCount: new Set(selected.map((row) => row.standardWorkId)).size,
      point: scorePublishingScaleComparableCases(selected)
    }];
  }));
  const totalAbsoluteError = Object.values(scores).reduce(
    (total, value) => total + value.point.absoluteError,
    0
  );
  return Object.freeze(Object.fromEntries(Object.entries(scores).map(
    ([key, value]) => [key, Object.freeze({
      ...value,
      shareOfAttributedAbsoluteError: safeRatio(
        value.point.absoluteError,
        totalAbsoluteError
      )
    })]
  )));
}

function scorePublishingScaleTopAttribution(cases, fractions) {
  const works = new Map();
  for (const row of cases) {
    const value = works.get(row.standardWorkId) ?? {
      standardWorkId: row.standardWorkId,
      actualPositiveCash: 0,
      reversalCash: 0,
      absoluteCashScale: 0,
      absoluteError: 0
    };
    value.actualPositiveCash += Number(row.actualPositive);
    value.reversalCash += Number(row.actualReversal);
    value.absoluteCashScale += Math.abs(Number(row.actual));
    value.absoluteError += Math.abs(
      Number(row.pointEstimate) - Number(row.actual)
    );
    works.set(row.standardWorkId, value);
  }
  const values = [...works.values()];
  return Object.freeze({
    byPositiveRevenue: topAttributionView(
      values,
      fractions,
      "actualPositiveCash"
    ),
    byAbsoluteCashScale: topAttributionView(
      values,
      fractions,
      "absoluteCashScale"
    ),
    byReversalCash: topAttributionView(
      values,
      fractions,
      "reversalCash"
    )
  });
}

function topAttributionView(works, fractions, orderField) {
  const ordered = [...works].sort((left, right) => (
    right[orderField] - left[orderField]
      || left.standardWorkId.localeCompare(right.standardWorkId)
  ));
  const totals = {
    actualPositiveCash: sumValues(works, "actualPositiveCash"),
    reversalCash: sumValues(works, "reversalCash"),
    absoluteCashScale: sumValues(works, "absoluteCashScale"),
    absoluteError: sumValues(works, "absoluteError")
  };
  return Object.freeze(Object.fromEntries(fractions.map((fraction) => {
    const count = Math.max(1, Math.ceil(ordered.length * Number(fraction)));
    const selected = ordered.slice(0, count);
    const values = {
      selectedWorkCount: selected.length,
      actualPositiveCash: sumValues(selected, "actualPositiveCash"),
      reversalCash: sumValues(selected, "reversalCash"),
      absoluteCashScale: sumValues(selected, "absoluteCashScale"),
      absoluteError: sumValues(selected, "absoluteError")
    };
    return [String(fraction), Object.freeze({
      ...values,
      actualPositiveCashShare: safeRatio(
        values.actualPositiveCash,
        totals.actualPositiveCash
      ),
      reversalCashShare: safeRatio(
        values.reversalCash,
        totals.reversalCash
      ),
      absoluteCashScaleShare: safeRatio(
        values.absoluteCashScale,
        totals.absoluteCashScale
      ),
      absoluteErrorShare: safeRatio(
        values.absoluteError,
        totals.absoluteError
      )
    })];
  })));
}

function scorePublishingScaleLayerIncrement(result) {
  const layerIds = [
    "originVisibleEmpiricalParent",
    "globalPooledParent",
    "mechanism",
    "namedPlatform"
  ];
  const cases = new Map();
  for (const row of result.rows) {
    const prediction = result.predictions.get(
      `${row.standardWorkId}\u001f${row.channelUid}`
        + `\u001f${row.origin}\u001f${row.futureMonthIndex}`
    );
    if (prediction?.layerPredictions === undefined) {
      throw new Error("m2_publishing_scale_layer_prediction_missing");
    }
    for (const horizon of row.includedHorizons) {
      const key = publishingScaleCaseKey(
        row.standardWorkId,
        row.origin,
        horizon
      );
      const value = cases.get(key) ?? {
        standardWorkId: row.standardWorkId,
        origin: row.origin,
        horizonMonths: horizon,
        actual: 0,
        points: Object.fromEntries(layerIds.map((layer) => [layer, 0]))
      };
      value.actual += Number(row.actual);
      for (const layer of layerIds) {
        value.points[layer] += Number(
          prediction.layerPredictions[layer].positivePoint
        );
      }
      cases.set(key, value);
    }
  }
  const scores = Object.fromEntries(layerIds.map((layer) => [
    layer,
    scorePublishingScaleComparableCases(
      [...cases.values()].map((row) => ({
        actual: row.actual,
        pointEstimate: row.points[layer]
      }))
    )
  ]));
  return Object.freeze(Object.fromEntries(layerIds.map((layer, index) => {
    const current = scores[layer];
    const parent = index === 0 ? null : scores[layerIds[index - 1]];
    return [layer, Object.freeze({
      ...current,
      parentLayer: index === 0 ? null : layerIds[index - 1],
      incrementalAbsoluteErrorReductionFromParent: parent === null
        ? null
        : parent.absoluteError - current.absoluteError,
      incrementalWapeReductionFromParent: parent === null
        || !Number.isFinite(parent.wape)
        || !Number.isFinite(current.wape)
        ? null
        : parent.wape - current.wape
    })];
  })));
}

function sumValues(rows, field) {
  return rows.reduce((total, row) => total + Number(row[field]), 0);
}

function safeRatio(numerator, denominator) {
  return denominator === 0 ? null : numerator / denominator;
}

function scorePublishingScaleRanking(cases) {
  const groups = new Map();
  for (const row of cases) {
    const key = `${row.origin}\u001f${row.horizonMonths}`;
    const values = groups.get(key) ?? [];
    values.push({
      actual: Math.max(0, Number(row.actual)),
      actualPositive: Math.max(0, Number(row.actualPositive)),
      point: Math.max(0, Number(row.pointEstimate))
    });
    groups.set(key, values);
  }
  const groupScores = [...groups.values()]
    .filter((rows) => rows.length >= 2)
    .map((rows) => ({
      spearman: spearman(rows),
      ndcgAt10: ndcgAt(rows, 10),
      topCaptureAt1Percent: topCapture(rows, 0.01),
      topCaptureAt5Percent: topCapture(rows, 0.05),
      topCaptureAt10Percent: topCapture(rows, 0.1)
    }));
  return {
    groupCount: groupScores.length,
    meanSpearman: averageFinite(
      groupScores.map((row) => row.spearman)
    ),
    meanNdcgAt10: averageFinite(
      groupScores.map((row) => row.ndcgAt10)
    ),
    meanTopCaptureAt1Percent: averageFinite(
      groupScores.map((row) => row.topCaptureAt1Percent)
    ),
    meanTopCaptureAt5Percent: averageFinite(
      groupScores.map((row) => row.topCaptureAt5Percent)
    ),
    meanTopCaptureAt10Percent: averageFinite(
      groupScores.map((row) => row.topCaptureAt10Percent)
    ),
    diagnosticOnly: true,
    futureActualUsedForAttributionOnly: true
  };
}

function topCapture(rows, fraction) {
  const count = Math.max(1, Math.ceil(rows.length * fraction));
  const selected = [...rows].sort(
    (left, right) => right.point - left.point
  ).slice(0, count);
  const denominator = rows.reduce(
    (total, row) => total + row.actualPositive,
    0
  );
  return safeRatio(
    selected.reduce(
      (total, row) => total + row.actualPositive,
      0
    ),
    denominator
  );
}

function spearman(rows) {
  const actualRanks = averageRanks(rows.map((row) => row.actual));
  const pointRanks = averageRanks(rows.map((row) => row.point));
  const actualMean = averageFinite(actualRanks);
  const pointMean = averageFinite(pointRanks);
  let covariance = 0;
  let actualVariance = 0;
  let pointVariance = 0;
  for (let index = 0; index < rows.length; index += 1) {
    const actualDelta = actualRanks[index] - actualMean;
    const pointDelta = pointRanks[index] - pointMean;
    covariance += actualDelta * pointDelta;
    actualVariance += actualDelta ** 2;
    pointVariance += pointDelta ** 2;
  }
  return actualVariance === 0 || pointVariance === 0
    ? null
    : covariance / Math.sqrt(actualVariance * pointVariance);
}

function averageRanks(values) {
  const ordered = values.map((value, index) => ({ value, index }))
    .sort((left, right) => right.value - left.value || left.index - right.index);
  const ranks = Array(values.length);
  for (let start = 0; start < ordered.length;) {
    let end = start + 1;
    while (
      end < ordered.length
      && ordered[end].value === ordered[start].value
    ) {
      end += 1;
    }
    const rank = (start + 1 + end) / 2;
    for (let index = start; index < end; index += 1) {
      ranks[ordered[index].index] = rank;
    }
    start = end;
  }
  return ranks;
}

function ndcgAt(rows, count) {
  const gain = (value, index) => (
    (2 ** Math.min(30, value) - 1) / Math.log2(index + 2)
  );
  const predicted = [...rows].sort(
    (left, right) => right.point - left.point
  ).slice(0, count);
  const ideal = [...rows].sort(
    (left, right) => right.actual - left.actual
  ).slice(0, count);
  const dcg = predicted.reduce(
    (total, row, index) => total + gain(row.actual, index),
    0
  );
  const idcg = ideal.reduce(
    (total, row, index) => total + gain(row.actual, index),
    0
  );
  return idcg === 0 ? null : dcg / idcg;
}

function averageFinite(values) {
  const finiteValues = values.filter(Number.isFinite);
  return finiteValues.length === 0
    ? null
    : finiteValues.reduce((total, value) => total + value, 0)
      / finiteValues.length;
}

function publicRestatementAudit(value) {
  return {
    transformedPackedRowCount: value.transformedPackedRowCount,
    transformedLabelCount: value.transformedLabelCount,
    laterRecordedReversalLabelCount:
      value.laterRecordedReversalLabelCount,
    originalPostingLabelChangedCount:
      value.originalPostingLabelChangedCount,
    canonicalWorkIdAliasPackedRowCount:
      value.canonicalWorkIdAliasPackedRowCount,
    canonicalWorkIdAmbiguousScopeCount:
      value.canonicalWorkIdAmbiguousScopeCount,
    unresolvedRestatementScopeCount:
      value.unresolvedRestatementScopeCount,
    excludedUnallocatedReversalResidualAssignedToLabel:
      value.excludedUnallocatedReversalResidualAssignedToLabel,
    exactIntegerReconciliationDifferenceMinor:
      value.exactIntegerReconciliationDifferenceMinor
  };
}

function* publishingScalePrivateRows(primary, strict) {
  for (const [family, result] of [
    ["primary", primary],
    ["strict", strict]
  ]) {
    for (const row of result.rows) {
      const prediction = result.predictions.get(
        `${row.standardWorkId}\u001f${row.channelUid}`
          + `\u001f${row.origin}\u001f${row.futureMonthIndex}`
      );
      if (prediction === undefined) {
        throw new Error("m2_publishing_scale_private_prediction_missing");
      }
      yield {
        schema:
          "m2.current.publishing_scale_channel_evaluation_private_row.v0.2",
        tracked: false,
        evaluationFamily: family,
        modelId: M2_PUBLISHING_SCALE_MODEL_ID,
        experimentArmId: M2_PUBLISHING_SCALE_ARM_ID,
        candidateId: M2_PUBLISHING_SCALE_RAW_CANDIDATE_ID,
        actualDefinitionId:
          "M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01",
        standardWorkId: row.standardWorkId,
        channelUid: row.channelUid,
        mechanism: row.mechanism,
        origin: row.origin,
        futureMonthIndex: row.futureMonthIndex,
        futureMonth: row.futureMonth,
        includedHorizons: row.includedHorizons,
        labelAvailableAsOf: row.labelAvailableAsOf,
        observedAtOrigin: row.observedAtOrigin,
        actualPositive: row.actualPositive,
        actualReversal: row.actualReversal,
        actual: row.actual,
        postingTimeActualPositive: row.postingTimeActualPositive,
        postingTimeActualReversal: row.postingTimeActualReversal,
        postingTimeActual: row.postingTimeActual,
        positivePoint: prediction.positivePoint,
        pointEstimate: prediction.positivePoint,
        occurrenceProbability: prediction.occurrenceProbability,
        conditionalPositiveAmount:
          prediction.conditionalPositiveAmount,
        selectedNodeId: prediction.selectedNodeId,
        supportTier: prediction.supportTier,
        hierarchyPath: prediction.hierarchyPath,
        layerPredictions: prediction.layerPredictions,
        occurrenceShrinkageWeight:
          prediction.occurrenceShrinkageWeight ?? 0,
        conditionalAmountShrinkageWeight:
          prediction.conditionalAmountShrinkageWeight ?? 0,
        fallbackReason: prediction.fallbackReason,
        taxonomyFeatureUsed: prediction.taxonomyFeatureUsed,
        authorizationBackfillUsed:
          prediction.authorizationBackfillUsed,
        rawCandidatePreserved: true,
        fallbackOverwroteRaw: false
      };
    }
  }
}

export async function writePublishingScalePrivateRows(
  outputPath,
  primary,
  strict
) {
  const handle = await open(outputPath, "wx");
  const hash = createHash("sha256");
  let rowCount = 0;
  let bufferedText = "";
  try {
    for (const row of publishingScalePrivateRows(primary, strict)) {
      const line = `${JSON.stringify(row)}\n`;
      hash.update(line, "utf8");
      bufferedText += line;
      rowCount += 1;
      if (Buffer.byteLength(bufferedText, "utf8") >= 4 * 1024 * 1024) {
        await handle.write(bufferedText, null, "utf8");
        bufferedText = "";
      }
    }
    if (bufferedText.length > 0) {
      await handle.write(bufferedText, null, "utf8");
    }
    await handle.sync();
  } finally {
    await handle.close();
  }
  return Object.freeze({
    rowCount,
    sha256: hash.digest("hex"),
    serialization: "STREAMED_NDJSON_INCREMENTAL_SHA256",
    maximumBufferedBytes: 4 * 1024 * 1024
  });
}

function publishingScalePublicForecastability(result) {
  return {
    schema:
      "m2.current.publishing_scale_channel_forecastability_public.v0.1",
    displayNameZh: result.displayNameZh,
    displayNameEn: result.displayNameEn,
    modelId: result.modelId,
    experimentArmId: result.experimentArmId,
    finalStatus: result.finalStatus,
    primary: result.forecastability.primary,
    strict: result.forecastability.strict,
    diagnosticOnly: true,
    participatesInTraining: false,
    participatesInSelection: false,
    participatesInGate: false,
    deployable: false,
    allowedClaims: [
      "observed structural unreachable mass",
      "retrospective oracle gap",
      "current model residual gap",
      "missing historically available drivers"
    ],
    forbiddenClaims: [
      "proven irreducible error",
      "Bayes error measured",
      "theoretical maximum established",
      "forecasting impossible"
    ]
  };
}

function reidentifyPublishingScaleForecastability(value) {
  return {
    ...value,
    schema: "m2.current.publishing_scale_channel_forecastability.v0.1",
    modelId: M2_PUBLISHING_SCALE_MODEL_ID,
    experimentArmId: M2_PUBLISHING_SCALE_ARM_ID
  };
}

function renderPublishingScaleDevelopmentReport(result) {
  const raw = result.evaluation.rawCandidate;
  const base = result.evaluation.frozenResearchComparator;
  return `# ${result.displayNameZh}：一次性私有开发评价

- 英文名：${result.displayNameEn}
- 稳定模型 ID：\`${result.modelId}\`
- 实验臂：\`${result.experimentArmId}\`
- 最终状态：\`${result.finalStatus}\`

## 核心结果

| 对象 | Primary WAPE | Strict WAPE | Primary signed bias | Strict signed bias |
|---|---:|---:|---:|---:|
| 冻结研究比较基线（\`M2-WORK-LG01-FROZEN-G0\`） | ${number(base.primary.wape)} | ${number(base.strict.wape)} | ${number(base.primary.signedBias)} | ${number(base.strict.signedBias)} |
| 出版行业适配 raw core（\`${result.modelId}\`） | ${number(raw.primary.wape)} | ${number(raw.strict.wape)} | ${number(raw.primary.signedBias)} | ${number(raw.strict.signedBias)} |

相对冻结研究比较基线的 WAPE 改善为 primary
${percent(raw.relativeWapeToFrozenResearchComparator.primary)}、strict
${percent(raw.relativeWapeToFrozenResearchComparator.strict)}。raw candidate 结果已独立保留，
没有被 fallback 或 selected pipeline 覆盖。

## 评价覆盖

报告包含 primary、strict rolling、各 horizon、各时间块、top 1%/5%/10% 收入、
bias、MAE、median AE、occurrence、conditional amount、ranking、2,000 次
standard-work cluster bootstrap，以及候选冻结后的 forecastability/oracle diagnostic。

## 支持与权威

每个 outer fit receipt 都公开聚合的 support tier、distinct/positive works、
work-cluster ESS、现金 ESS、集中度、连续收缩权重和回退原因。三级分类与授权关系继续为
\`REPORT_ONLY\`，没有用 current-only 快照回填 forecast origin。

## 治理边界

这是同一 development window 的一次性受控评价，不是独立 later-origin 或 final
holdout。作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，
\`M2-WORK-OA03\`）的运行回退角色未改变；本结果不授权 automation、production、
provider、database、Canary/full160、release、M3 formal 或合并 PR。
`;
}

function renderPublishingScaleForecastabilityReport(result) {
  const primary = result.forecastability.primary;
  const strict = result.forecastability.strict;
  return `# ${result.displayNameZh}：forecastability / oracle 诊断

这些 retrospective oracle 只在 raw candidate 预测冻结后运行，不参与训练、参数选择、
路由或通过门禁，也不能证明 Bayes error、理论上限或“无法预测”。

| 口径 | 全部实际正现金 | future-first-seen 正现金 | 占比 |
|---|---:|---:|---:|
| Primary | ${number(primary.currentReachability.totalActualPositiveCash)} | ${number(primary.currentReachability.futureFirstSeenActualPositiveCash)} | ${percent(primary.currentReachability.futureFirstSeenShare)} |
| Strict | ${number(strict.currentReachability.totalActualPositiveCash)} | ${number(strict.currentReachability.futureFirstSeenActualPositiveCash)} | ${percent(strict.currentReachability.futureFirstSeenShare)} |

\`ORACLE_OCCURRENCE_ONLY\`、\`ORACLE_AMOUNT_ONLY\`、\`ORACLE_BOTH\`、
\`FUTURE_FIRST_ENTRY_CEILING\` 与 \`MECHANISM_INFORMATION_GAIN\` 均不可部署。
`;
}

function renderPublishingScaleDevelopmentReportCurrent(result) {
  const raw = result.evaluation.rawCandidate;
  const frozen = result.evaluation.frozenResearchComparator;
  const globalParent = result.evaluation.globalParentAblation;
  const fallback = result.evaluation.operationalFallbackSameCaseIntersection;
  const occurrence = raw.primary.occurrence;
  const amount = raw.primary.conditionalAmount;
  const sparseTiers = publishingScaleSparsePlatformTierSummary(result);
  return `# ${result.displayNameZh}：受控私有开发评价

- 英文原名：${result.displayNameEn}
- 稳定模型 ID：\`${result.modelId}\`
- 所属实验臂：出版行业规模适配渠道核心实验的核心臂（\`${result.experimentArmId}\`）
- 机器结论：${publishingScaleStatusZh(result.finalStatus)}
  （\`${result.finalStatus}\`）

## 先说结论

本轮已经真正拟合并完整评价原始候选
（raw candidate，\`${result.candidateId}\`）。原始候选输出先冻结，随后才运行评价与
可预测性/oracle 诊断；运行回退和任何 selected pipeline 都没有覆盖原始结果。
这是重复使用开发窗口的受控证据，不是独立 later-origin 或 final holdout 证据，
也不授权生产、自动化、发布或合并。

## 点预测总账

| 对象 | 主评价（primary）WAPE | 严格滚动（strict）WAPE | 主评价 signed bias | 严格滚动 signed bias |
|---|---:|---:|---:|---:|
| 冻结研究基线（Frozen learnedGlobal，\`M2-WORK-LG01-FROZEN-G0\`） | ${number(frozen.primary.wape)} | ${number(frozen.strict.wape)} | ${number(frozen.primary.signedBias)} | ${number(frozen.strict.signedBias)} |
| 全局父层消融（global-parent ablation） | ${number(globalParent.primary.wape)} | ${number(globalParent.strict.wape)} | ${number(globalParent.primary.signedBias)} | ${number(globalParent.strict.signedBias)} |
| 原始候选（raw candidate，\`${result.candidateId}\`） | ${number(raw.primary.wape)} | ${number(raw.strict.wape)} | ${number(raw.primary.signedBias)} | ${number(raw.strict.signedBias)} |

原始候选相对冻结研究基线的 WAPE 变化为：主评价
${percent(raw.relativeWapeToFrozenResearchComparator.primary)}，严格滚动
${percent(raw.relativeWapeToFrozenResearchComparator.strict)}。主评价的绝对误差为
${number(raw.primary.absoluteError)}，实际现金分母为
${number(raw.primary.actualDenominator)}，MAE 为 ${number(raw.primary.mae)}，
绝对误差中位数为 ${number(raw.primary.medianAbsoluteError)}；严格滚动对应值为
${number(raw.strict.absoluteError)}、${number(raw.strict.actualDenominator)}、
${number(raw.strict.mae)} 和 ${number(raw.strict.medianAbsoluteError)}。

## 与现行运行回退的同人口比较

现行运行回退是作品发生—金额校准模型 v0.3
（Occurrence-Amount Calibration v0.3，\`M2-WORK-OA03\`），角色保持不变。
这里只比较 exact same-case、same-target、same-origin、same-horizon 的交集：

| 口径 | 同人口 case 数 | 运行回退 WAPE | 原始候选 WAPE | 原始候选相对变化 |
|---|---:|---:|---:|---:|
| 主评价（primary） | ${fallback.primary.caseCount} | ${number(fallback.primary.fallback.wape)} | ${number(fallback.primary.candidate.wape)} | ${percent(fallback.primary.relativeWape)} |
| 严格滚动（strict） | ${fallback.strict.caseCount} | ${number(fallback.strict.fallback.wape)} | ${number(fallback.strict.candidate.wape)} | ${percent(fallback.strict.relativeWape)} |

## 发生、条件金额与结构

主评价发生部分的 Brier score、log loss、PR-AUC、Average Precision 和辅助
ROC-AUC 分别为 ${number(occurrence.brier)}、${number(occurrence.logLoss)}、
${number(occurrence.prAuc)}、${number(occurrence.averagePrecision)}、
${number(occurrence.rocAuc)}。条件正金额 WAPE、MAE 和绝对误差中位数分别为
${number(amount.wape)}、${number(amount.mae)}、
${number(amount.medianAbsoluteError)}。

完整机器记录还包含：发生概率校准、各 horizon、各严格滚动时间块、三种变现机制、
五个重点平台、支持层级、top 1%/5%/10% 正收入与绝对现金及冲销误差归因、
排序与 top capture、层级相对父层增量，以及 2,000 次
\`standardWorkId\` 作品聚类 bootstrap。

稀疏平台实际层级：${sparseTiers}。月度行没有被当作独立作品；作品数、作品—渠道
scope 数与月度行数在每个 outer receipt 中分开记录。三级分类和授权关系均保持
只报告（\`REPORT_ONLY\`），不估参、不路由、不做 current-only 回填。

## 决策边界

当前状态只由冻结门产生。即使机器结论为通过，也只表示 development core
证据通过；现行运行回退、production、exact v0.3、provider、数据库、
final holdout、Canary/full160、release、M3 formal 和 PR 合并均未获得授权。
`;
}

function renderPublishingScaleForecastabilityReportCurrent(result) {
  const primary = result.forecastability.primary;
  const strict = result.forecastability.strict;
  return `# ${result.displayNameZh}：可预测性与 oracle 诊断

- 英文原名：${result.displayNameEn}
- 稳定模型 ID：\`${result.modelId}\`
- 所属实验臂：出版行业规模适配渠道核心实验的核心臂（\`${result.experimentArmId}\`）
- 机器结论：${publishingScaleStatusZh(result.finalStatus)}
  （\`${result.finalStatus}\`）

这些 retrospective oracle 只在原始候选输出冻结后运行，不参与训练、参数选择、
路由或晋级门，也不能证明 Bayes error、理论上限或“无法预测”。

| 诊断 | 主评价最多可移除绝对误差 | 严格滚动最多可移除绝对误差 |
|---|---:|---:|
| 真实发生替换（\`ORACLE_OCCURRENCE_ONLY\`） | ${number(primary.diagnostics.ORACLE_OCCURRENCE_ONLY.maximumRemovableError)} | ${number(strict.diagnostics.ORACLE_OCCURRENCE_ONLY.maximumRemovableError)} |
| 真实条件金额替换（\`ORACLE_AMOUNT_ONLY\`） | ${number(primary.diagnostics.ORACLE_AMOUNT_ONLY.maximumRemovableError)} | ${number(strict.diagnostics.ORACLE_AMOUNT_ONLY.maximumRemovableError)} |
| 发生与金额同时替换（\`ORACLE_BOTH\`） | ${number(primary.diagnostics.ORACLE_BOTH.maximumRemovableError)} | ${number(strict.diagnostics.ORACLE_BOTH.maximumRemovableError)} |
| future-first 新渠道上限（\`FUTURE_FIRST_ENTRY_CEILING\`） | ${number(primary.diagnostics.FUTURE_FIRST_ENTRY_CEILING.maximumRemovableError)} | ${number(strict.diagnostics.FUTURE_FIRST_ENTRY_CEILING.maximumRemovableError)} |

主评价和严格滚动中，origin 时尚未观察到的新渠道正现金占比分别为
${percent(primary.currentReachability.futureFirstSeenShare)} 与
${percent(strict.currentReachability.futureFirstSeenShare)}。机制时间 basis 相对全局父层
的绝对误差增益分别为
${number(primary.diagnostics.MECHANISM_INFORMATION_GAIN.absoluteErrorGain)}
与 ${number(strict.diagnostics.MECHANISM_INFORMATION_GAIN.absoluteErrorGain)}。

这些数值用于判断下一步证据应优先补发生、条件金额、新渠道进入、机制时间结构，
还是停止 cash-only 路线；它们不参与本轮模型选拔，也不授权任何后续实验。
`;
}

function publishingScaleSparsePlatformTierSummary(result) {
  const definitions = [
    ["猫耳", "missevan"],
    ["克拉漫播", "manbo"]
  ];
  return definitions.map(([name, platformId]) => {
    const tiers = new Set();
    for (const receipt of [
      ...result.support.primaryOuterFolds,
      ...result.support.strictOuterOrigins
    ]) {
      const tier = receipt.support?.namedPlatforms?.[platformId]?.tier;
      if (typeof tier === "string") tiers.add(tier);
    }
    return `${name}（${[...tiers].sort().map(
      (tier) => `\`${tier}\``
    ).join(" / ") || "无可评价 outer receipt"}）`;
  }).join("；");
}

function publishingScaleStatusZh(status) {
  return ({
    M2_PUBLISHING_SCALE_CORE_PASS: "开发核心证据通过",
    M2_PUBLISHING_SCALE_CORE_PROMISING_NOT_QUALIFIED:
      "存在局部信号但未满足全部冻结晋级门",
    M2_PUBLISHING_SCALE_CORE_FAIL:
      "原始候选完成评价但未达到冻结门或出现实质伤害",
    M2_PUBLISHING_SCALE_IMPLEMENTATION_BLOCKED:
      "原始候选完整评价前发生实现阻断"
  })[status] ?? "未知状态";
}

function verifyPrivateBindings({
  config,
  preregistration,
  baseManifest,
  materialization,
  frozenManifest,
  primaryText,
  auxiliaryText,
  frozenText,
  reconciliationText,
  allocationText,
  reversalReceipt
}) {
  if (
    materialization?.schema
      !== "m2.current.channel_generative_materialization_private.v0.2"
    || materialization.candidateId !== config.candidateId
    || materialization.primarySha256 !== digest(primaryText)
    || materialization.auxiliarySha256 !== digest(auxiliaryText)
    || frozenManifest.sha256 !== digest(frozenText)
    || frozenManifest.sha256
      !== preregistration.caseManifest.digests.frozenEvaluationSha256
    || frozenManifest.rowCount
      !== preregistration.caseManifest.digests.frozenEvaluationRowCount
    || baseManifest.digests.primaryCasesSha256
      !== preregistration.caseManifest.digests.basePrimaryCasesSha256
    || baseManifest.digests.auxiliaryCasesSha256
      !== preregistration.caseManifest.digests.baseAuxiliaryCasesSha256
    || baseManifest.digests.historiesSha256
      !== preregistration.caseManifest.digests.baseHistoriesSha256
    || materialization.dataQuality.overlappingHorizonDuplicateCount !== 0
    || materialization.dataQuality.unmaturedLabelZeroImputationCount !== 0
    || materialization.dataQuality.buyoutCashUsed !== false
    || reversalReceipt?.status
      !== "M2_EVALUATION_V2_2_ACTIVE_FOR_DEVELOPMENT_WITH_DISCLOSED_RESIDUAL_EXCLUSION"
    || reversalReceipt?.actualDefinitionId
      !== "M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01"
    || reversalReceipt?.outputDigests?.scopeReconciliationSha256
      !== digest(reconciliationText)
    || reversalReceipt?.outputDigests?.allocationLedgerSha256
      !== digest(allocationText)
    || reversalReceipt?.labels?.originAfterCutoffRowsUsed !== 0
    || frozenManifest.G4Executed === true
    || frozenManifest.G5Executed === true
    || frozenManifest.G6Executed === true
  ) {
    throw new Error("m2_channel_generative_private_binding_invalid");
  }
}

function verifyPublishingScalePrivateBindings({
  config,
  preregistration,
  baseManifest,
  materialization,
  frozenManifest,
  primaryText,
  auxiliaryText,
  frozenText,
  reconciliationText,
  allocationText,
  reversalReceipt
}) {
  if (
    materialization?.schema
      !== "m2.current.publishing_scale_channel_materialization_private.v0.2"
    || materialization.modelId !== M2_PUBLISHING_SCALE_MODEL_ID
    || materialization.experimentArmId !== M2_PUBLISHING_SCALE_ARM_ID
    || materialization.candidateId
      !== M2_PUBLISHING_SCALE_RAW_CANDIDATE_ID
    || materialization.materializerId
      !== "M2-MATERIALIZER-PUBLISHING-SCALE-CHANNEL-01"
    || materialization.primarySha256 !== digest(primaryText)
    || materialization.auxiliarySha256 !== digest(auxiliaryText)
    || materialization.sourceArtifacts
      ?.historicalChannelGenerativeArtifactsRead !== false
    || materialization.sourceArtifacts
      ?.historicalChannelGenerativeAuthorizationChecked !== false
    || materialization.sourceArtifacts
      ?.historicalFrozenComparator?.sourceArtifact !== true
    || materialization.sourceArtifacts
      ?.historicalFrozenComparator?.readOnly !== true
    || materialization.sourceArtifacts
      ?.historicalFrozenComparator?.overwritten !== false
    || frozenManifest.sha256 !== digest(frozenText)
    || frozenManifest.sha256
      !== preregistration.caseManifest.digests.frozenEvaluationSha256
    || frozenManifest.rowCount
      !== preregistration.caseManifest.digests.frozenEvaluationRowCount
    || baseManifest.digests.primaryCasesSha256
      !== preregistration.caseManifest.digests.basePrimaryCasesSha256
    || baseManifest.digests.auxiliaryCasesSha256
      !== preregistration.caseManifest.digests.baseAuxiliaryCasesSha256
    || baseManifest.digests.historiesSha256
      !== preregistration.caseManifest.digests.baseHistoriesSha256
    || materialization.baseDatasetDigests.primaryCasesSha256
      !== baseManifest.digests.primaryCasesSha256
    || materialization.baseDatasetDigests.auxiliaryCasesSha256
      !== baseManifest.digests.auxiliaryCasesSha256
    || materialization.baseDatasetDigests.historiesSha256
      !== baseManifest.digests.historiesSha256
    || materialization.dataQuality.overlappingHorizonDuplicateCount !== 0
    || materialization.dataQuality.unmaturedLabelZeroImputationCount !== 0
    || materialization.dataQuality.buyoutCashUsed !== false
    || materialization.dataQuality.trainingWeight
      !== "equal_total_weight_per_standard_work"
    || materialization.dataQuality.monthlyRowsAreIndependentWorks !== false
    || reversalReceipt?.status
      !== "M2_EVALUATION_V2_2_ACTIVE_FOR_DEVELOPMENT_WITH_DISCLOSED_RESIDUAL_EXCLUSION"
    || reversalReceipt?.actualDefinitionId !== config.actualDefinitionId
    || reversalReceipt?.outputDigests?.scopeReconciliationSha256
      !== digest(reconciliationText)
    || reversalReceipt?.outputDigests?.allocationLedgerSha256
      !== digest(allocationText)
    || reversalReceipt?.labels?.originAfterCutoffRowsUsed !== 0
    || frozenManifest.G4Executed === true
    || frozenManifest.G5Executed === true
    || frozenManifest.G6Executed === true
  ) {
    throw new Error("m2_publishing_scale_private_binding_invalid");
  }
}

function validatePublishingScaleOutputFiles(outputFiles, config) {
  const keys = [
    "primaryMonthlyCases",
    "auxiliaryMonthlyCases",
    "materializationManifest",
    "evaluationRows",
    "evaluationManifest"
  ];
  if (
    outputFiles === null
    || typeof outputFiles !== "object"
    || Array.isArray(outputFiles)
    || Object.keys(outputFiles).sort().join(",") !== [...keys].sort().join(",")
  ) {
    throw new Error("m2_publishing_scale_versioned_output_plan_invalid");
  }
  for (const key of keys) {
    const value = outputFiles[key];
    const base = config.privateOutputs[key];
    const parsed = path.parse(base);
    if (
      typeof value !== "string"
      || path.basename(value) !== value
      || value.includes("/")
      || value.includes("\\")
      || !value.startsWith(`${parsed.name}-`)
      || path.extname(value) !== parsed.ext
    ) {
      throw new Error("m2_publishing_scale_versioned_output_identity_invalid");
    }
  }
  return Object.freeze({ ...outputFiles });
}

function assertBoundary(config) {
  if (
    config?.schema !== "m2.current.channel_generative_core.v0.2"
    || config?.target
      !== "future_sales_share_development_modelable_cash"
    || config?.actualDefinitionId
      !== "M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01"
    || config?.authorization?.coreImplementation !== true
    || config?.authorization?.oneTimePrivateDevelopmentEvaluation !== false
    || config?.authorization?.forecastabilityOracleDiagnostic !== false
    || config?.authorization?.authorizedModelId !== "M2-CHAN-GEN02"
    || config?.authorization?.authorizedArmId
      !== "M2-EXP-CHANNEL-GENERATIVE-02/G1"
    || config?.authorization?.G1IndependentCoreTraining !== false
    || config?.authorization?.G1PrivateDevelopmentEvaluation !== false
    || config?.authorization?.G2StructuredOffset !== false
    || config?.authorization?.G3Blend !== false
    || config?.authorization?.G4Platform !== false
    || config?.authorization?.G5Taxonomy !== false
    || config?.authorization?.G6Composition !== false
    || config?.authorization?.newModelFamily !== false
    || config?.authorization?.outcomeDrivenTuning !== false
    || config?.authorization?.finalHoldout !== false
    || config?.authorization?.production !== false
    || config?.authorization?.exactV03Replacement !== false
    || config?.authorization?.release !== false
    || config?.authorization?.closureStatus
      !== "CONSUMED_WITH_PREREGISTERED_ELIGIBILITY_BLOCK"
    || config?.authorization?.closedAfterFitStarted !== true
    || config?.authorization?.retryAuthorized !== false
    || config?.candidateIds?.join(",") !== "G0,G1"
    || config?.currentExecution?.status
      !== "M2_CHANNEL_GENERATIVE_G1_CORE_BLOCKED"
    || config?.currentExecution?.privateExecutionAuthorizationConsumed
      !== true
    || config?.currentExecution?.fitStartedCandidateIds?.join(",") !== "G1"
    || config?.currentExecution?.trainedCandidateIds?.length !== 0
    || config?.currentExecution?.candidateOutputIds?.length !== 0
    || config?.currentExecution?.evaluatedCandidateIds?.length !== 0
  ) {
    throw new Error("m2_channel_generative_authorization_boundary_differs");
  }
}

function assertPrivateExecutionAuthorization(config) {
  if (
    config?.authorization?.oneTimePrivateDevelopmentEvaluation !== true
    || config?.authorization?.G1IndependentCoreTraining !== true
    || config?.authorization?.G1PrivateDevelopmentEvaluation !== true
  ) {
    throw new Error(
      "m2_channel_generative_private_execution_authorization_closed"
    );
  }
}

function frozenConfigPublicPath() {
  return "docs/analysis/m2-current/"
    + "M2-current-channel-experts-development-v0.1.json";
}

function parseNdjson(value) {
  return value.split(/\r?\n/u).filter(Boolean).map(JSON.parse);
}

function relativeWape(baseline, candidate) {
  return relativeMetric(
    baseline.workTotal.wape,
    candidate.workTotal.wape
  );
}

function relativeMetric(baseline, candidate) {
  return Number.isFinite(Number(baseline))
      && Number.isFinite(Number(candidate))
      && Number(baseline) !== 0
    ? (Number(baseline) - Number(candidate)) / Number(baseline)
    : Number.NaN;
}

function digest(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readOptionalJson(filePath) {
  try {
    return await readJson(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function normalizeAttemptHistory(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error("m2_channel_generative_attempt_history_invalid");
  }
  return value.map((attempt) => ({
    attemptOrdinal: Number(attempt.attemptOrdinal),
    implementationCommit: String(attempt.implementationCommit),
    startTime: String(attempt.startTime),
    status: String(attempt.status),
    failurePhase: attempt.failurePhase ?? null,
    errorCode: attempt.errorCode ?? null,
    candidateOutcomeRead:
      attempt.candidateOutcomeRead === true,
    G1ExecutionStarted: attempt.G1ExecutionStarted === true,
    G1Executed: attempt.G1Executed === true
  }));
}

function summarizePriorAttempt(receipt) {
  return {
    attemptOrdinal:
      Number(receipt.attemptOrdinal ?? receipt.priorAttemptCount + 1) || 1,
    implementationCommit: String(receipt.implementationCommit),
    startTime: String(receipt.startTime),
    status: String(receipt.status),
    failurePhase: receipt.failurePhase ?? null,
    errorCode: receipt.errorCode ?? null,
    candidateOutcomeRead:
      receipt.candidateOutcomeReadAtFailure === true
      || receipt.candidateOutcomeReadAfterReceipt === true
      || receipt.G1Executed === true,
    G1ExecutionStarted: receipt.G1ExecutionStarted === true,
    G1Executed: receipt.G1Executed === true
  };
}

function number(value) {
  return Number(value).toFixed(8);
}

function percent(value) {
  return Number.isFinite(Number(value))
    ? `${(Number(value) * 100).toFixed(4)}%`
    : "不适用";
}
