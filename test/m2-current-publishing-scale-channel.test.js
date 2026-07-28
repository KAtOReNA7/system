import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  buildM2ChannelGenerativeForecastabilityDiagnostic,
  buildM2ChannelGenerativeSyntheticRows
} from "../src/domain/m2Current/channelGenerative.js";
import {
  buildM2PublishingScaleSyntheticDiagnostic,
  crossFitM2PublishingScaleChannel,
  fitM2PublishingScaleChannelCore,
  inspectM2PublishingScaleDesignContracts,
  M2_PUBLISHING_SCALE_ARM_ID,
  M2_PUBLISHING_SCALE_MATERIALIZER_ID,
  M2_PUBLISHING_SCALE_MODEL_ID,
  M2_PUBLISHING_SCALE_RECEIPT_CONTROLLER_ID,
  predictM2PublishingScaleChannelMonthly,
  strictRollingM2PublishingScaleChannel,
  validateM2PublishingScaleConfig
} from "../src/domain/m2Current/publishingScaleChannelCore.js";
import {
  assertExecutionPolicy,
  planM2PublishingScaleReceiptController
} from "../scripts/m2-current/publishing_scale_channel_execution.mjs";
import {
  buildPublishingScaleDetailedEvaluation
} from "../scripts/m2-current/channel_generative_mode.mjs";
import {
  explainM2Identifier,
  loadM2ModelRegistry,
  validateM2ModelRegistry
} from "../src/domain/m2Current/modelRegistry.js";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const [
  config,
  support,
  fixture,
  diagnostic,
  readiness,
  executionClosure,
  impact,
  historical,
  evaluation,
  prd,
  coreSource,
  runnerSource,
  modeSource,
  materializerSource,
  packageConfig
] = await Promise.all([
  readJson("config/m2-current-publishing-scale-channel.v0.1.json"),
  readJson("config/m2-publishing-scale-statistical-support.v1.json"),
  readJson("test/fixtures/m2-current-channel-generative.synthetic.v0.2.json"),
  readJson(
    "docs/analysis/m2-current/"
      + "M2-current-publishing-scale-channel-public-diagnostic-v0.1.json"
  ),
  readJson(
    "docs/analysis/m2-current/"
      + "M2-current-publishing-scale-channel-readiness-v0.1.json"
  ),
  readJson(
    "docs/analysis/m2-current/"
      + "M2-current-publishing-scale-channel-execution-closure-v0.1.json"
  ),
  readJson(
    "docs/analysis/m2-current/"
      + "M2-publishing-scale-threshold-impact-map-v1.json"
  ),
  readJson("config/m2-current-channel-generative.v0.2.json"),
  readJson("config/m2-evaluation-contract.v2.2.json"),
  readText("docs/prd/m2-v2/M2-forecast-intelligence-v2-prd-v0.2.md"),
  readText("src/domain/m2Current/publishingScaleChannelCore.js"),
  readText(
    "scripts/m2-current/run_m2_human_anchored_development.mjs"
  ),
  readText("scripts/m2-current/channel_generative_mode.mjs"),
  readText("scripts/m2-current/materialize_human_anchored_cases.py"),
  readJson("package.json")
]);
const executionPolicy = await readJson(
  "config/m2-publishing-scale-execution-policy.v0.2.json"
);
const publicPreflight = await readJson(
  "docs/analysis/m2-current/"
    + "M2-current-publishing-scale-channel-preflight-v0.2.json"
);
const privateReadiness = await readJson(
  "docs/analysis/m2-current/"
    + "M2-current-publishing-scale-channel-private-readiness-v0.2.json"
);

test("K7C active config is bound to the frozen publishing-scale contract", () => {
  assert.equal(validateM2PublishingScaleConfig(config, support), true);
  assert.equal(config.modelId, M2_PUBLISHING_SCALE_MODEL_ID);
  assert.equal(config.experimentArmId, M2_PUBLISHING_SCALE_ARM_ID);
  assert.equal(
    config.dataContract.trainingWeight,
    "equal_total_weight_per_standard_work"
  );
  assert.equal(config.dataContract.monthlyRowsAreIndependentWorks, false);
  assert.equal(config.dataContract.taxonomyAsOfStatus, "REPORT_ONLY");
  assert.equal(config.dataContract.authorizationAsOfStatus, "REPORT_ONLY");
  assert.equal(
    support.currentFreezeDecision.universalFixedDistinctWorkThreshold,
    null
  );
  const designs = inspectM2PublishingScaleDesignContracts(config);
  assert.equal(designs.length, 9);
  assert.equal(designs.every((node) => node.designCountMatches), true);
  assert.equal(
    designs.find((node) => node.nodeId === "globalPooledParent")
      .basisMeaning,
    "compact_linear_horizon_basis_alias_not_membership_routing"
  );
});

test("synthetic diagnostic exposes tier, effective support and fallback", () => {
  const generated = buildM2PublishingScaleSyntheticDiagnostic(
    fixture,
    config,
    support
  );
  assert.deepEqual(generated, diagnostic);
  assert.equal(generated.status, "SYNTHETIC_DIAGNOSTIC_PASS");
  assert.equal(generated.boundaries.privateArtifactRead, false);
  assert.equal(generated.boundaries.candidateOuterOutcomeRead, false);
  assert.equal(generated.boundaries.legacyFixedEligibilityUsed, false);
  for (const node of Object.values(generated.support.mechanisms)) {
    assert.equal(node.tier, "SHRUNK_FIT");
    assert.equal(node.parametersEstimated, true);
    assert.equal(node.support.monthlyRowsUsedAsIndependentSample, false);
    assert.ok(node.support.cashEffectiveWorkCount > 0);
    assert.ok(node.support.occurrenceShrinkageWeight >= 0);
    assert.ok(node.support.occurrenceShrinkageWeight <= 1);
    assert.ok(node.support.conditionalAmountShrinkageWeight >= 0);
    assert.ok(node.support.conditionalAmountShrinkageWeight <= 1);
  }
  assert.equal(
    generated.support.namedPlatforms.missevan.tier,
    "POOLED_PARENT"
  );
  assert.equal(
    generated.support.namedPlatforms.missevan.parametersEstimated,
    false
  );
  assert.equal(
    generated.support.namedPlatforms.missevan.fallbackReason,
    "training_side_contract_requires_parent_pooling"
  );
});

test("primary and strict implementations preserve raw predictions", () => {
  const rows = buildM2ChannelGenerativeSyntheticRows(fixture, config);
  const primary = crossFitM2PublishingScaleChannel(
    rows,
    config,
    support
  );
  assert.equal(primary.rawCandidatePreserved, true);
  assert.equal(primary.fallbackOverwroteRaw, false);
  assert.equal(primary.outerOutcomeUsedForSelection, false);
  assert.equal(primary.receipts.length, 5);
  assert.equal(
    primary.receipts.every(
      (receipt) => receipt.primaryWorkFoldIsolationPassed === true
        && receipt.trainingValidationWorkOverlapCount === 0
        && receipt.sampleIdentity.monthlyRowsAreIndependentWorks === false
    ),
    true
  );
  for (const prediction of primary.predictions.values()) {
    assert.deepEqual(
      Object.keys(prediction.layerPredictions).sort(),
      [
        "globalPooledParent",
        "mechanism",
        "namedPlatform",
        "originVisibleEmpiricalParent"
      ]
    );
  }
  assert.ok(primary.evaluation.workTotal.wape >= 0);
  assert.ok(primary.evaluation.occurrence.logLoss >= 0);
  const detailed = buildPublishingScaleDetailedEvaluation(primary, config);
  assert.equal(
    detailed.occurrenceCalibration.allPredictionEligibleRows.rowCount,
    primary.rows.length
  );
  assert.deepEqual(
    Object.keys(detailed.namedPlatforms).sort(),
    config.nodes.namedPlatforms.map((platform) => platform.platformId).sort()
  );
  assert.deepEqual(
    Object.keys(detailed.hierarchyLayerIncrement),
    [
      "originVisibleEmpiricalParent",
      "globalPooledParent",
      "mechanism",
      "namedPlatform"
    ]
  );
  assert.equal(
    Number.isFinite(
      detailed.topCashAndErrorAttribution.byPositiveRevenue["0.1"]
        .absoluteErrorShare
    ),
    true
  );
  const oracle = buildM2ChannelGenerativeForecastabilityDiagnostic(
    primary.rows,
    primary.predictions,
    config,
    {
      pooledPredictions: primary.globalParentPredictions,
      candidateOutputsFrozen: true
    }
  );
  assert.equal(
    oracle.diagnostics.ORACLE_BOTH.labelAggregationValidationPassed,
    true
  );
  assert.equal(oracle.diagnostics.MECHANISM_INFORMATION_GAIN.deployable, false);

  const strictRows = rows.map((row) => Object.freeze({
    ...row,
    evaluationFamily: "strict"
  }));
  const strictConfig = structuredClone(config);
  strictConfig.selection.strictOrigins = ["2022-12"];
  const strict = strictRollingM2PublishingScaleChannel(
    strictRows,
    strictConfig,
    support
  );
  assert.equal(strict.evaluationFamily, "strict");
  assert.equal(strict.receipts.length, 1);
  assert.equal(strict.receipts[0].status, "EVALUATED");
  assert.equal(strict.receipts[0].strictEarlierOriginTrainingPassed, true);
  assert.equal(
    Object.values(strict.receipts[0].labelAvailabilityByHorizon)
      .every((value) => (
        value.allLabelsAvailableBeforeStrictOuterOrigin === true
      )),
    true
  );
  assert.ok(strict.evaluation.workTotal.wape >= 0);
});

test("future-first channel remains zero without identity or authority backfill", () => {
  const rows = buildM2ChannelGenerativeSyntheticRows(fixture, config);
  const training = rows.filter(
    (row) => row.evaluationFamily === "primary"
  );
  const state = fitM2PublishingScaleChannelCore(
    training,
    config,
    support
  );
  const future = rows.find(
    (row) => row.evaluationFamily === "strict"
      && row.observedAtOrigin === false
  );
  const prediction = predictM2PublishingScaleChannelMonthly(
    future,
    state,
    config
  );
  assert.equal(prediction.positivePoint, 0);
  assert.equal(prediction.usedGenerator, false);
  assert.equal(prediction.taxonomyFeatureUsed, false);
  assert.equal(prediction.authorizationBackfillUsed, false);
});

test("historical fixed eligibility remains historical, not active truth", () => {
  assert.equal(historical.eligibility.minimumDistinctTrainingWorks, 50);
  assert.doesNotMatch(
    JSON.stringify(config),
    /minimumDistinctTrainingWorks|minimumMonthlyTrainingRows|minimumPositiveTrainingMonths/u
  );
  assert.doesNotMatch(coreSource, /\b50\b|\b100\b/u);
  assert.match(coreSource, /monthlyRowsUsedAsIndependentSample: false/u);
  assert.equal(
    impact.historicalBoundary.historicalConfigRewritten,
    false
  );
  assert.equal(
    impact.executionBoundary.newCandidateOuterOutcomeRead,
    false
  );
});

test("PRD, evaluation contract, registry and query identities agree", () => {
  assert.equal(
    evaluation.forwardStatisticalSupportContract.activeForwardModelId,
    M2_PUBLISHING_SCALE_MODEL_ID
  );
  assert.equal(
    evaluation.forwardStatisticalSupportContract
      .activeForwardExperimentArmId,
    M2_PUBLISHING_SCALE_ARM_ID
  );
  assert.match(prd, /M2-CHAN-PSC01/u);
  assert.match(prd, /M2-EXP-PUBLISHING-SCALE-CHANNEL-01\/CORE/u);

  const registry = loadM2ModelRegistry(
    path.join(root, "config", "m2-model-registry.v1.json")
  );
  const validation = validateM2ModelRegistry(
    registry,
    { repoRoot: root }
  );
  assert.equal(validation.valid, true, validation.errors.join("\n"));
  const model = explainM2Identifier(
    registry,
    M2_PUBLISHING_SCALE_MODEL_ID
  );
  assert.equal(model.models[0].stableModelId, M2_PUBLISHING_SCALE_MODEL_ID);
  const arm = explainM2Identifier(registry, "CORE");
  assert.equal(
    arm.arms.some(({ experiment }) => (
      experiment.experimentId
        === "M2-EXP-PUBLISHING-SCALE-CHANNEL-01"
    )),
    true
  );
  assert.equal(registry.currentRoles.activeCandidate, null);
  assert.equal(registry.currentRoles.approvedForAutomation, null);
});

test("readiness and impact map disclose the K7D implementation block", () => {
  assert.equal(
    readiness.status,
    "M2_PUBLISHING_SCALE_IMPLEMENTATION_BLOCKED"
  );
  assert.equal(
    readiness.executionBoundary.privateDevelopmentExecutionConsumed,
    true
  );
  assert.equal(readiness.executionBoundary.privateMaterializationStarted, true);
  assert.equal(readiness.executionBoundary.privateCapabilityReadOccurred, true);
  assert.equal(readiness.executionBoundary.candidateFitStarted, false);
  assert.equal(readiness.executionBoundary.candidateOuterOutcomeProduced, false);
  assert.equal(impact.closureChecks.length, 8);
  assert.equal(
    impact.closureChecks.filter((entry) => entry.status === "PASS").length,
    8
  );
  assert.doesNotMatch(
    JSON.stringify({
      diagnostic,
      readiness,
      executionClosure,
      impact
    }),
    /data[\\/]+private-(?:input|output)|[A-Z]:\\/iu
  );
});

test("historical consumed authorization remains immutable", () => {
  assert.equal(
    packageConfig.scripts["develop:m2:current:publishing-scale-channel"],
    "node --max-old-space-size=8192 "
      + "scripts/m2-current/run_m2_human_anchored_development.mjs "
      + "--publishing-scale-channel"
  );
  assert.match(runnerSource, /runM2PublishingScaleCommandPreflight/u);
  assert.match(runnerSource, /--preflight-only/u);
  assert.match(
    materializerSource,
    /PUBLISHING_SCALE_CHANNEL_CONFIG_PATH/u
  );
  assert.match(materializerSource, /--publishing-scale-channel/u);
  assert.doesNotMatch(
    modeSource,
    /implementationCommit:\s*"[a-f0-9]{40}"/u
  );
  assert.equal(
    config.currentExecution.privateExecutionAuthorizationConsumed,
    true
  );
  assert.equal(
    config.authorization.oneTimePrivateDevelopmentEvaluation,
    false
  );
  assert.equal(config.authorization.retryAuthorized, false);
  assert.equal(config.currentExecution.candidateFitStarted, false);
  assert.equal(config.currentExecution.candidateOutputProduced, false);
  assert.equal(
    executionClosure.finalStatus,
    "M2_PUBLISHING_SCALE_IMPLEMENTATION_BLOCKED"
  );
  assert.equal(
    executionClosure.executionAttempt.candidateFitStarted,
    false
  );
  assert.equal(
    executionClosure.remediation.privateRetryPerformed,
    false
  );
  assert.equal(
    executionClosure.remediation.privateRetryAuthorized,
    false
  );
  assert.equal(executionClosure.governance.activeCandidate, null);
  assert.equal(executionClosure.governance.approvedForAutomation, null);
  assert.doesNotMatch(
    JSON.stringify(config.privateOutputs),
    /M2-current-channel-generative-(?:primary|auxiliary|materialization)/u
  );
  assert.equal(
    config.privateOutputs.directory,
    "data/private-output/m2-current-publishing-scale-channel"
  );
  assert.equal(
    config.materializerId,
    M2_PUBLISHING_SCALE_MATERIALIZER_ID
  );
  assert.equal(
    config.receiptControllerId,
    M2_PUBLISHING_SCALE_RECEIPT_CONTROLLER_ID
  );
});

test("publishing-scale materialization config has a private-free self-test", () => {
  const output = execFileSync(
    process.execPath,
    [
      "scripts/run-codex-python.mjs",
      "scripts/m2-current/materialize_human_anchored_cases.py",
      "--publishing-scale-config-self-test"
    ],
    { encoding: "utf8", windowsHide: true }
  );
  assert.deepEqual(JSON.parse(output), {
    experimentArmId: M2_PUBLISHING_SCALE_ARM_ID,
    modelId: M2_PUBLISHING_SCALE_MODEL_ID,
    privateArtifactRead: false,
    publishingScaleConfigBoundaryValidated: true
  });
});

test("real npm entry preflight selects only the publishing-scale path", () => {
  const output = runNpm([
    "run",
    "develop:m2:current:publishing-scale-channel",
    "--",
    "--preflight-only"
  ]);
  const record = JSON.parse(
    output.split(/\r?\n/u).findLast((line) => line.startsWith("{"))
  );
  assert.equal(record.status, "READY_FOR_AUTHORIZED_PRIVATE_EXECUTION");
  assert.equal(record.modelId, M2_PUBLISHING_SCALE_MODEL_ID);
  assert.equal(record.experimentArmId, M2_PUBLISHING_SCALE_ARM_ID);
  assert.equal(
    record.materializerId,
    M2_PUBLISHING_SCALE_MATERIALIZER_ID
  );
  assert.equal(
    record.dispatch.publishingScaleMaterializerInvocationCount,
    1
  );
  assert.equal(
    record.dispatch.legacyChannelGenerativeMaterializerInvocationCount,
    0
  );
  assert.equal(
    record.dispatch.legacyChannelGenerativeMaterializerSelected,
    false
  );
  assert.equal(record.dispatch.legacyAuthorizationChecked, false);
  assert.equal(record.privateArtifactRowsRead, 0);
  assert.equal(record.privateOutputWrites, 0);
  assert.equal(record.candidateFitStarted, false);
  assert.equal(record.predictionRowsProduced, 0);
  assert.equal(record.dispatch.outputPathsPlanned, true);
  assert.deepEqual(record, publicPreflight);
});

test("preflight identity, materializer and receipt bindings fail closed", () => {
  assert.doesNotThrow(() => assertExecutionPolicy(executionPolicy, config));
  assert.deepEqual(
    planM2PublishingScaleReceiptController({
      config,
      policy: executionPolicy
    }).status,
    "PLANNED_NO_WRITE"
  );
  const wrongModel = structuredClone(executionPolicy);
  wrongModel.authorizedModelId = "M2-CHAN-GEN02";
  assert.throws(
    () => assertExecutionPolicy(wrongModel, config),
    /m2_publishing_scale_execution_policy_invalid/u
  );
  const wrongMaterializer = structuredClone(config);
  wrongMaterializer.receiptControllerId = "legacy-controller";
  assert.throws(
    () => planM2PublishingScaleReceiptController({
      config: wrongMaterializer,
      policy: executionPolicy
    }),
    /m2_publishing_scale_receipt_controller_binding_invalid/u
  );
  assert.match(
    materializerSource,
    /_write_new_private_bytes/u
  );
  assert.match(
    materializerSource,
    /publishing-scale versioned output plan invalid/u
  );
  assert.match(
    modeSource,
    /flag: "wx"/u
  );
});

test("R1 readiness preserves the unopened logical execution window", () => {
  assert.equal(
    privateReadiness.status,
    "READY_PENDING_R1_EXACT_HEAD_LINUX_WINDOWS_CI"
  );
  assert.equal(privateReadiness.modelId, M2_PUBLISHING_SCALE_MODEL_ID);
  assert.equal(
    privateReadiness.experimentArmId,
    M2_PUBLISHING_SCALE_ARM_ID
  );
  assert.equal(
    privateReadiness.authorizationPreparation
      .historicalConsumedAuthorizationRewritten,
    false
  );
  assert.equal(privateReadiness.executionCounters.privateArtifactRowsRead, 0);
  assert.equal(privateReadiness.executionCounters.candidateFitStarted, false);
  assert.equal(
    privateReadiness.executionCounters.logicalExecutionWindowConsumed,
    false
  );
  assert.equal(
    privateReadiness.r0Evidence.githubActions.linux.status,
    "SUCCESS"
  );
  assert.equal(
    privateReadiness.r0Evidence.githubActions.windows.status,
    "SUCCESS"
  );
});

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readText(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

function runNpm(args) {
  if (process.platform === "win32") {
    const escaped = args.map((value) => (
      /[\s"]/u.test(value)
        ? `"${value.replaceAll('"', '""')}"`
        : value
    )).join(" ");
    return execFileSync(
      process.env.ComSpec,
      ["/d", "/s", "/c", `npm ${escaped}`],
      { cwd: root, encoding: "utf8", windowsHide: true }
    );
  }
  return execFileSync(
    "npm",
    args,
    { cwd: root, encoding: "utf8", windowsHide: true }
  );
}
