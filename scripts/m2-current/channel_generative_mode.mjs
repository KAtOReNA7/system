import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
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

export function verifyM2PublishingScaleGitAndCiPreflight({ root }) {
  const status = runCommand(root, "git", ["status", "--porcelain"]);
  if (status.stdout.trim() !== "") {
    throw new Error("m2_publishing_scale_worktree_not_clean");
  }
  const head = runCommand(root, "git", ["rev-parse", "HEAD"]).stdout.trim();
  const upstream = runCommand(
    root,
    "git",
    ["rev-parse", "@{upstream}"]
  ).stdout.trim();
  const branch = runCommand(
    root,
    "git",
    ["branch", "--show-current"]
  ).stdout.trim();
  if (head !== upstream) {
    throw new Error("m2_publishing_scale_upstream_not_exact_head");
  }
  const ancestor = spawnSync(
    "git",
    ["merge-base", "--is-ancestor", "origin/main", "HEAD"],
    { cwd: root, encoding: "utf8", windowsHide: true }
  );
  if (ancestor.status !== 0) {
    throw new Error("m2_publishing_scale_origin_main_not_ancestor");
  }
  const pr = JSON.parse(runCommand(
    root,
    "gh",
    [
      "pr",
      "view",
      "29",
      "--json",
      "number,state,isDraft,baseRefName,headRefName,headRefOid,statusCheckRollup"
    ]
  ).stdout);
  if (
    pr.number !== 29
    || pr.state !== "OPEN"
    || pr.isDraft !== true
    || pr.baseRefName !== "main"
    || pr.headRefName !== branch
    || pr.headRefOid !== head
  ) {
    throw new Error("m2_publishing_scale_pr29_exact_head_invalid");
  }
  const checks = new Map((pr.statusCheckRollup ?? []).map((check) => [
    String(check.name ?? check.context),
    String(check.conclusion ?? check.state ?? check.status)
  ]));
  for (const checkName of ["verify", "verify-windows"]) {
    if (checks.get(checkName) !== "SUCCESS") {
      throw new Error(
        `m2_publishing_scale_exact_head_ci_not_success:${checkName}`
      );
    }
  }
  return Object.freeze({
    checkedAt: new Date().toISOString(),
    branch,
    head,
    upstream,
    originMain: runCommand(
      root,
      "git",
      ["rev-parse", "origin/main"]
    ).stdout.trim(),
    prNumber: pr.number,
    prHead: pr.headRefOid,
    prBase: pr.baseRefName,
    prDraft: pr.isDraft,
    linuxCheck: checks.get("verify"),
    windowsCheck: checks.get("verify-windows"),
    worktreeClean: true
  });
}

export async function prepareM2PublishingScaleRunReceipt({
  root,
  privateDirectory,
  gitPreflight,
  command,
  environment
}) {
  const [
    configText,
    supportText,
    sourceText,
    baseManifestText,
    frozenManifestText
  ] = await Promise.all([
    readFile(path.join(root, PUBLISHING_SCALE_CONFIG_PATH), "utf8"),
    readFile(path.join(root, PUBLISHING_SCALE_SUPPORT_PATH), "utf8"),
    readFile(
      path.join(
        root,
        "src/domain/m2Current/publishingScaleChannelCore.js"
      ),
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
  const support = JSON.parse(supportText);
  validateM2PublishingScaleConfig(config, support);
  assertPublishingScalePrivateAuthorization(config);
  const receiptPath = path.join(
    privateDirectory,
    config.privateOutputs.runReceipt
  );
  const previous = await readOptionalJson(receiptPath);
  if (
    previous?.status === "COMPLETED"
    || previous?.candidateExecutionStarted === true
    || previous?.candidateExecuted === true
  ) {
    throw new Error(
      "m2_publishing_scale_one_time_private_execution_already_consumed"
    );
  }
  const receipt = {
    schema: "m2.current.publishing_scale_channel_run_receipt_private.v0.1",
    tracked: false,
    status: "PREPARED_BEFORE_PRIVATE_EVALUATION_ROW_READ",
    implementationCommit: gitPreflight.head,
    codeSha256: digest(sourceText),
    configSha256: digest(configText),
    supportContractSha256: digest(supportText),
    datasetDigests: JSON.parse(baseManifestText).digests,
    frozenCaseDigest: JSON.parse(frozenManifestText).sha256,
    command,
    environment,
    nodeVersion: process.version,
    startTime: new Date().toISOString(),
    modelId: M2_PUBLISHING_SCALE_MODEL_ID,
    experimentArmId: M2_PUBLISHING_SCALE_ARM_ID,
    expectedCandidateId: M2_PUBLISHING_SCALE_RAW_CANDIDATE_ID,
    expectedPrimaryOuterFolds:
      config.selection.outerPrimaryWorkFoldCount,
    expectedStrictOuterOrigins: config.selection.strictOrigins,
    bootstrapIterations: config.evaluation.bootstrapIterations,
    gitPreflight,
    candidateOutcomeReadAtReceipt: false,
    candidateExecutionStarted: false,
    candidateExecuted: false,
    finalHoldoutOpened: false,
    productionModified: false
  };
  await mkdir(privateDirectory, { recursive: true });
  await writeFile(
    receiptPath,
    JSON.stringify(receipt, null, 2) + "\n",
    "utf8"
  );
  return receipt;
}

export async function runM2PublishingScalePrivateDevelopment({
  root,
  privateDirectory,
  baseManifest
}) {
  const [
    config,
    support,
    historicalConfig,
    frozenConfig,
    preregistration
  ] = await Promise.all([
    readJson(path.join(root, PUBLISHING_SCALE_CONFIG_PATH)),
    readJson(path.join(root, PUBLISHING_SCALE_SUPPORT_PATH)),
    readJson(path.join(root, CONFIG_PATH)),
    readJson(path.join(root, FROZEN_CONFIG_PATH)),
    readJson(path.join(root, PREREGISTRATION_PATH))
  ]);
  validateM2PublishingScaleConfig(config, support);
  assertPublishingScalePrivateAuthorization(config);
  const receiptPath = path.join(
    privateDirectory,
    config.privateOutputs.runReceipt
  );
  const receipt = await readJson(receiptPath);
  if (
    receipt?.status !== "PREPARED_BEFORE_PRIVATE_EVALUATION_ROW_READ"
    || receipt?.implementationCommit !== receipt?.gitPreflight?.head
    || receipt?.candidateOutcomeReadAtReceipt !== false
  ) {
    throw new Error("m2_publishing_scale_run_receipt_invalid");
  }
  const restatementDirectory = path.join(
    root,
    config.privateOutputs.reversalRestatementDirectory
  );
  const [
    primaryText,
    auxiliaryText,
    materializationText,
    frozenText,
    frozenManifestText,
    reconciliationText,
    allocationText,
    reversalReceiptText
  ] = await Promise.all([
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
    config: historicalConfig,
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
      ...receipt,
      status:
        "RESTATEMENT_BINDING_PREFLIGHT_PASSED_BEFORE_CANDIDATE_FIT",
      restatementBindingPreflight: {
        primary: primaryRestatement.audit,
        strict: strictRestatement.audit
      },
      candidateOutcomeReadAtPreflight: false
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
      ...receipt,
      status: "CANDIDATE_FIT_STARTED_AFTER_RESTATEMENT_PREFLIGHT",
      restatementBindingPreflight: {
        primary: primaryRestatement.audit,
        strict: strictRestatement.audit
      },
      candidateOutcomeReadAtFitStart: false,
      candidateExecutionStarted: true,
      candidateExecuted: false
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
  const frozenRows = parseNdjson(frozenText);
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
    primary: primary.evaluation,
    strict: strict.evaluation,
    bootstrap
  });
  const privateRows = publishingScalePrivateRows(primary, strict);
  const privateText = privateRows.map(JSON.stringify).join("\n") + "\n";
  const candidateFreeze = {
    status: "RAW_CANDIDATE_OUTPUTS_FROZEN_BEFORE_ORACLE",
    rowCount: privateRows.length,
    sha256: digest(privateText),
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
    primary,
    strict,
    bootstrap,
    gate,
    forecastability,
    candidateFreeze,
    restatementBinding: {
      primary: primaryRestatement.audit,
      strict: strictRestatement.audit
    },
    receipt
  });
  const privateManifest = {
    schema:
      "m2.current.publishing_scale_channel_evaluation_private_manifest.v0.1",
    tracked: false,
    modelId: M2_PUBLISHING_SCALE_MODEL_ID,
    experimentArmId: M2_PUBLISHING_SCALE_ARM_ID,
    candidateId: M2_PUBLISHING_SCALE_RAW_CANDIDATE_ID,
    actualDefinitionId: config.actualDefinitionId,
    rowCount: privateRows.length,
    sha256: digest(privateText),
    primaryMonthlyRowCount: primary.rows.length,
    strictMonthlyRowCount: strict.rows.length,
    primaryPackedSha256: materialization.primarySha256,
    auxiliaryPackedSha256: materialization.auxiliarySha256,
    frozenEvaluationSha256: frozenManifest.sha256,
    candidateFreeze,
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
      renderPublishingScaleDevelopmentReport(result),
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
      renderPublishingScaleForecastabilityReport(result),
      "utf8"
    )
  ]);
  await writeFile(
    receiptPath,
    JSON.stringify({
      ...receipt,
      status: "COMPLETED",
      completedAt: new Date().toISOString(),
      outputRowCount: privateManifest.rowCount,
      outputSha256: privateManifest.sha256,
      finalStatus: result.finalStatus,
      candidateExecutionStarted: true,
      candidateExecuted: true,
      candidateOutcomeReadAfterReceipt: true,
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

export async function recordM2PublishingScaleRunFailure({
  root,
  privateDirectory,
  error
}) {
  const config = await readJson(path.join(
    root,
    PUBLISHING_SCALE_CONFIG_PATH
  ));
  const receiptPath = path.join(
    privateDirectory,
    config.privateOutputs.runReceipt
  );
  const receipt = await readOptionalJson(receiptPath);
  if (receipt === null || receipt.status === "COMPLETED") return;
  await writeFile(
    receiptPath,
    JSON.stringify({
      ...receipt,
      status: receipt.candidateExecutionStarted === true
        ? "FAILED_CLOSED_AFTER_CANDIDATE_FIT_STARTED"
        : "FAILED_CLOSED_BEFORE_CANDIDATE_FIT_STARTED",
      failedAt: new Date().toISOString(),
      failureCode: String(error?.code ?? error?.message ?? error),
      candidateExecuted: false,
      finalHoldoutOpened: false,
      productionModified: false
    }, null, 2) + "\n",
    "utf8"
  );
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
    status: "IMPLEMENTED_NOT_EXECUTED_AWAITING_EXACT_HEAD_CI",
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
      namedPlatforms: support.parameterFreeze.namedPlatforms,
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
      privateDevelopmentExecutionAuthorizedOnceAfterExactHeadCi: true,
      privateDevelopmentExecutionConsumed: false,
      candidateOuterOutcomeProduced: false,
      finalHoldoutOpened: false,
      productionModified: false,
      operationalFallbackModified: false,
      mergeAuthorized: false
    },
    impactMap:
      "docs/analysis/m2-current/"
      + "M2-publishing-scale-threshold-impact-map-v1.json"
  };
}

function renderPublishingScaleReadiness(result) {
  const mechanisms = result.supportTiers.mechanisms;
  return `# ${result.displayNameZh}：K7C 实现就绪报告

- 英文名：${result.displayNameEn}
- 稳定模型 ID：\`${result.modelId}\`
- 实验臂：\`${result.experimentArmId}\`
- 当前状态：已实现但尚未执行私有开发评价（\`${result.status}\`）
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
identity，不回填 current-only 分类或授权。K7C 只运行了公开 synthetic diagnostic，
未读取新候选 outer outcome；一次性 private development execution 必须等待本提交的
exact-head Linux/Windows CI 成功后才能执行。

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

function buildPublishingScalePublicResult({
  config,
  support,
  baselines,
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
      operationalFallbackId: "M2-WORK-OA03",
      operationalFallbackDirectlyRanked: false
    },
    evaluation: {
      frozenResearchComparator: {
        primary: publishingScaleEvaluationSummary(baselines.primary),
        strict: publishingScaleEvaluationSummary(baselines.strict)
      },
      rawCandidate: {
        primary: publishingScaleEvaluationSummary(primary.evaluation),
        strict: publishingScaleEvaluationSummary(strict.evaluation),
        relativeWapeToFrozenResearchComparator: {
          primary: relativeWape(baselines.primary, primary.evaluation),
          strict: relativeWape(baselines.strict, strict.evaluation)
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
        }
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
      primary,
      strict
    )
  };
  return {
    checks,
    allPassed: Object.values(checks).every(Boolean),
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

function scorePublishingScaleRanking(cases) {
  const groups = new Map();
  for (const row of cases) {
    const key = `${row.origin}\u001f${row.horizonMonths}`;
    const values = groups.get(key) ?? [];
    values.push({
      actual: Math.max(0, Number(row.actual)),
      point: Math.max(0, Number(row.pointEstimate))
    });
    groups.set(key, values);
  }
  const groupScores = [...groups.values()]
    .filter((rows) => rows.length >= 2)
    .map((rows) => ({
      spearman: spearman(rows),
      ndcgAt10: ndcgAt(rows, 10)
    }));
  return {
    groupCount: groupScores.length,
    meanSpearman: averageFinite(
      groupScores.map((row) => row.spearman)
    ),
    meanNdcgAt10: averageFinite(
      groupScores.map((row) => row.ndcgAt10)
    ),
    diagnosticOnly: true,
    futureActualUsedForAttributionOnly: true
  };
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

function publishingScalePrivateRows(primary, strict) {
  const output = [];
  for (const [family, result] of [
    ["primary", primary],
    ["strict", strict]
  ]) {
    for (const row of result.evaluation.cases) {
      output.push({
        schema:
          "m2.current.publishing_scale_channel_evaluation_private_row.v0.1",
        tracked: false,
        evaluationFamily: family,
        modelId: M2_PUBLISHING_SCALE_MODEL_ID,
        experimentArmId: M2_PUBLISHING_SCALE_ARM_ID,
        candidateId: M2_PUBLISHING_SCALE_RAW_CANDIDATE_ID,
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
        rawCandidatePreserved: true,
        fallbackOverwroteRaw: false
      });
    }
  }
  return output;
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

function assertPublishingScalePrivateAuthorization(config) {
  if (
    config?.authorization?.oneTimePrivateDevelopmentEvaluation
      !== "AUTHORIZED_AFTER_K7C_EXACT_HEAD_LINUX_WINDOWS_CI"
    || config?.authorization?.authorizedModelId
      !== M2_PUBLISHING_SCALE_MODEL_ID
    || config?.authorization?.authorizedArmId
      !== M2_PUBLISHING_SCALE_ARM_ID
    || config?.authorization?.outcomeDrivenTuning !== false
    || config?.authorization?.laterOriginHoldout !== false
    || config?.authorization?.finalHoldout !== false
    || config?.authorization?.provider !== false
    || config?.authorization?.database !== false
    || config?.authorization?.production !== false
    || config?.authorization?.release !== false
  ) {
    throw new Error("m2_publishing_scale_private_authorization_invalid");
  }
}

function runCommand(root, command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error(
      `m2_publishing_scale_command_failed:${command}:${args.join(" ")}:`
        + String(result.stderr ?? "").trim()
    );
  }
  return result;
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
