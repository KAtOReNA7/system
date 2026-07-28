import { createHash } from "node:crypto";
import {
  mkdir,
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
  scoreM2ChannelGenerativeFrozenG0Comparator,
  strictRollingM2ChannelGenerativeG1,
  verifyM2ChannelGenerativeG0
} from "../../src/domain/m2Current/channelGenerative.js";

const CONFIG_PATH = "config/m2-current-channel-generative.v0.2.json";
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

function assertBoundary(config) {
  if (
    config?.schema !== "m2.current.channel_generative_core.v0.2"
    || config?.target
      !== "future_sales_share_development_modelable_cash"
    || config?.actualDefinitionId
      !== "M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01"
    || config?.authorization?.coreImplementation !== true
    || config?.authorization?.oneTimePrivateDevelopmentEvaluation !== true
    || config?.authorization?.authorizedModelId !== "M2-CHAN-GEN02"
    || config?.authorization?.authorizedArmId
      !== "M2-EXP-CHANNEL-GENERATIVE-02/G1"
    || config?.authorization?.G1IndependentCoreTraining !== true
    || config?.authorization?.G1PrivateDevelopmentEvaluation !== true
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
    || config?.candidateIds?.join(",") !== "G0,G1"
    || config?.currentExecution?.trainedCandidateIds?.join(",") !== "G1"
  ) {
    throw new Error("m2_channel_generative_authorization_boundary_differs");
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
