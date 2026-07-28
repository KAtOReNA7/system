import assert from "node:assert/strict";
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
  M2_PUBLISHING_SCALE_ARM_ID,
  M2_PUBLISHING_SCALE_MODEL_ID,
  predictM2PublishingScaleChannelMonthly,
  strictRollingM2PublishingScaleChannel,
  validateM2PublishingScaleConfig
} from "../src/domain/m2Current/publishingScaleChannelCore.js";
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
  impact,
  historical,
  evaluation,
  prd,
  coreSource,
  runnerSource,
  modeSource,
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
  readJson("package.json")
]);

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
  assert.ok(primary.evaluation.workTotal.wape >= 0);
  assert.ok(primary.evaluation.occurrence.logLoss >= 0);
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

test("readiness and impact map close public K7C without private execution", () => {
  assert.equal(
    readiness.status,
    "IMPLEMENTED_NOT_EXECUTED_AWAITING_EXACT_HEAD_CI"
  );
  assert.equal(
    readiness.executionBoundary.privateDevelopmentExecutionConsumed,
    false
  );
  assert.equal(readiness.executionBoundary.candidateOuterOutcomeProduced, false);
  assert.equal(impact.closureChecks.length, 8);
  assert.equal(
    impact.closureChecks.filter((entry) => entry.status === "PASS").length,
    7
  );
  assert.equal(
    impact.closureChecks.at(-1).status,
    "PENDING_EXACT_HEAD_CI"
  );
  assert.doesNotMatch(
    JSON.stringify({ diagnostic, readiness, impact }),
    /data[\\/]+private-(?:input|output)|[A-Z]:\\/iu
  );
});

test("one-time private runner is runtime-bound and remains unexecuted in K7C", () => {
  assert.equal(
    packageConfig.scripts["develop:m2:current:publishing-scale-channel"],
    "node --max-old-space-size=8192 "
      + "scripts/m2-current/run_m2_human_anchored_development.mjs "
      + "--publishing-scale-channel"
  );
  assert.match(runnerSource, /verifyM2PublishingScaleGitAndCiPreflight/u);
  assert.match(modeSource, /git", \["status", "--porcelain"\]/u);
  assert.match(modeSource, /"verify-windows"/u);
  assert.match(modeSource, /pr\.headRefOid !== head/u);
  assert.match(
    modeSource,
    /PREPARED_BEFORE_PRIVATE_EVALUATION_ROW_READ/u
  );
  assert.match(
    modeSource,
    /m2_publishing_scale_one_time_private_execution_already_consumed/u
  );
  assert.doesNotMatch(
    modeSource,
    /implementationCommit:\s*"[a-f0-9]{40}"/u
  );
  assert.equal(
    config.currentExecution.privateExecutionAuthorizationConsumed,
    false
  );
  assert.equal(config.currentExecution.candidateOutputProduced, false);
});

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readText(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}
