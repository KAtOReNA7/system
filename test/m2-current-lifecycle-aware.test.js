import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  buildM2LifecycleAwareSyntheticDiagnostic,
  M2_LIFECYCLE_STATES,
  m2LifecycleAwareFeatureNames
} from "../src/domain/m2Current/lifecycleAware.js";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const [config, baseConfig, fixture] = await Promise.all([
  readJson("config/m2-current-lifecycle-aware.v0.1.json"),
  readJson("config/m2-current-human-anchored.v0.1.json"),
  readJson("test/fixtures/m2-current-lifecycle-aware.synthetic.v0.1.json")
]);

test("lifecycle-aware public diagnostic covers all five mutually exclusive states", () => {
  const result = buildM2LifecycleAwareSyntheticDiagnostic(
    fixture,
    baseConfig,
    config
  );

  assert.equal(
    result.schema,
    "m2.current.lifecycle_aware_public_diagnostic.v0.1"
  );
  assert.deepEqual(
    Object.keys(result.lifecycleCounts),
    M2_LIFECYCLE_STATES
  );
  for (const state of M2_LIFECYCLE_STATES) {
    assert.equal(
      result.lifecycleCounts[state],
      fixture.replicationsPerState
    );
  }
  assert.equal(
    result.caseCount,
    fixture.replicationsPerState * M2_LIFECYCLE_STATES.length
  );
  assert.equal(result.boundaries.privateArtifactRead, false);
  assert.equal(result.boundaries.exactV03Modified, false);
  assert.equal(result.boundaries.productionRouteModified, false);
  assert.equal(result.boundaries.buyoutCashUsed, false);
  assert.equal(result.boundaries.finalHoldoutUsed, false);
  assert.equal(result.boundaries.releaseAuthorized, false);
});

test("lifecycle-aware model records explicit feature and experiment versions", () => {
  const result = buildM2LifecycleAwareSyntheticDiagnostic(
    fixture,
    baseConfig,
    config
  );

  assert.equal(result.datasetVersion, config.datasetVersion);
  assert.equal(result.featureVersion, config.featureVersion);
  assert.deepEqual(result.featureNames, m2LifecycleAwareFeatureNames());
  assert.equal(result.featureNames.includes("stateRevival"), true);
  assert.equal(result.featureNames.includes("logTrailing12"), true);
  assert.equal(result.featureNames.includes("logHorizon"), true);
  assert.equal(
    result.model.amount,
    config.model.amountFamily
  );
  assert.equal(
    result.evaluation.revenueWeightedWape.value,
    result.evaluation.candidate.wape
  );
  assert.equal(
    Object.keys(result.evaluation.topRevenue.cumulative).length,
    config.evaluation.topRevenueFractions.length
  );
});

test("every lifecycle-aware rapid experiment keeps a reproducibility record", async () => {
  assert.equal(config.completedRapidExperiments.length, 4);
  for (const experiment of config.completedRapidExperiments) {
    assert.match(experiment.experimentId, /^M2-lifecycle-aware-/u);
    assert.equal(experiment.datasetVersion, config.datasetVersion);
    assert.equal(typeof experiment.featureVersion, "string");
    assert.equal(experiment.featureVersion.length > 0, true);
    assert.equal(typeof experiment.modelConfig, "object");
    assert.equal(typeof experiment.evaluationResult, "object");
    assert.equal(typeof experiment.diagnosis, "string");
  }

  const result = await readJson(
    "docs/analysis/m2-current/"
      + "M2-current-lifecycle-aware-revenue-forecast-development-v0.1.json"
  );
  assert.equal(result.dataset.datasetVersion, config.datasetVersion);
  assert.equal(result.featureSet.featureVersion, config.featureVersion);
  assert.equal(
    result.decision,
    "LIFECYCLE_AWARE_DEVELOPMENT_FAIL_TRIVIAL_POSTHOC_GAIN"
  );
  assert.equal(result.interpretation.modelUpgradeSupported, false);
  assert.equal(
    result.experiments.challenger.modelConfig.model.stateSelectionSemantics,
    config.model.stateSelectionSemantics
  );
  assert.equal(
    result.experiments.challenger.evaluation.rawPrimary.wape
      > result.experiments.baseline.evaluation.primary.wape,
    true
  );
  assert.equal(result.comparison.exactV03Overlap.caseCount, 5203);
  assert.equal(
    result.comparison.exactV03Overlap.exactV03UsedForTrainingOrSelection,
    false
  );
});

test("lifecycle-aware challenger is isolated from production loader and route", async () => {
  const [loader, route, packageJson] = await Promise.all([
    readFile(path.join(root, "src/domain/m2Current/loader.js"), "utf8"),
    readFile(path.join(root, "src/domain/m2Current/route.js"), "utf8"),
    readJson("package.json")
  ]);

  assert.doesNotMatch(loader, /lifecycleAware/u);
  assert.doesNotMatch(route, /lifecycleAware/u);
  assert.match(
    packageJson.scripts["diagnose:m2:lifecycle-aware"],
    /--lifecycle-aware-public/u
  );
  assert.match(
    packageJson.scripts["develop:m2:current:lifecycle-aware"],
    /--lifecycle-aware/u
  );
  assert.equal(config.authorization.productionModelModification, false);
  assert.equal(config.authorization.exactV03Replacement, false);
  assert.equal(config.authorization.dataAuthorityChange, false);
  assert.equal(config.authorization.cashBoundaryChange, false);
});

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
}
