import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  buildM2ChannelExpertsSyntheticDiagnostic,
  M2_CHANNEL_EXPERT_ABLATIONS,
  M2_CHANNEL_MECHANISM_EXPERTS
} from "../src/domain/m2Current/channelExperts.js";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const [config, baseConfig, fixture] = await Promise.all([
  readJson("config/m2-current-channel-experts.v0.1.json"),
  readJson("config/m2-current-human-anchored.v0.1.json"),
  readJson("test/fixtures/m2-current-channel-experts.synthetic.v0.1.json")
]);
let diagnostic;

test("channel experts execute preregistered A0-A6 with exact channel conservation", () => {
  diagnostic ??= buildM2ChannelExpertsSyntheticDiagnostic(
    fixture,
    baseConfig,
    config
  );

  assert.equal(
    diagnostic.schema,
    "m2.current.channel_experts_public_diagnostic.v0.1"
  );
  assert.deepEqual(diagnostic.ablations, M2_CHANNEL_EXPERT_ABLATIONS);
  assert.deepEqual(diagnostic.mechanisms, M2_CHANNEL_MECHANISM_EXPERTS);
  assert.equal(
    diagnostic.evaluation.decompositionMaximumAbsoluteDifference,
    0
  );
  assert.deepEqual(
    Object.keys(diagnostic.evaluation.ablations),
    M2_CHANNEL_EXPERT_ABLATIONS
  );
  for (const id of M2_CHANNEL_EXPERT_ABLATIONS) {
    assert.equal(
      Number.isFinite(diagnostic.evaluation.ablations[id].wape),
      true
    );
  }
});

test("all five named platform models run and sparse taxonomy cells fall back", () => {
  diagnostic ??= buildM2ChannelExpertsSyntheticDiagnostic(
    fixture,
    baseConfig,
    config
  );

  assert.deepEqual(
    Object.keys(diagnostic.platformCoverage),
    config.platformModels.map((platform) => platform.platformId)
  );
  for (const count of Object.values(diagnostic.platformCoverage)) {
    assert.equal(count > 0, true);
  }
  assert.equal(
    Object.keys(diagnostic.evaluation.byNamedPlatform).length,
    config.platformModels.length
  );
  assert.equal(
    Object.entries(diagnostic.fallbackCounts).some(
      ([key, count]) => key.includes("platform") && count > 0
    ),
    true
  );
});

test("shrinkage selection is nested inside every outer work fold", () => {
  diagnostic ??= buildM2ChannelExpertsSyntheticDiagnostic(
    fixture,
    baseConfig,
    config
  );

  assert.equal(
    diagnostic.folds.length,
    config.training.crossWorkFoldCount
  );
  for (const fold of diagnostic.folds) {
    assert.equal(fold.outerValidationUsedForSelection, false);
    assert.equal(
      config.training.shrinkagePriorStrengthGrid.includes(
        fold.selectedPriorStrength
      ),
      true
    );
    assert.equal(
      fold.innerSelection.length,
      config.training.shrinkagePriorStrengthGrid.length
    );
  }
});

test("channel expert challenger stays isolated from production and sealed capabilities", async () => {
  const [loader, route, preregistration] = await Promise.all([
    readFile(path.join(root, "src/domain/m2Current/loader.js"), "utf8"),
    readFile(path.join(root, "src/domain/m2Current/route.js"), "utf8"),
    readJson(
      "docs/analysis/m2-current/"
        + "M2-current-channel-experts-preregistration-v0.1.json"
    )
  ]);

  assert.doesNotMatch(loader, /channelExperts/u);
  assert.doesNotMatch(route, /channelExperts/u);
  assert.equal(config.authorization.productionModelModification, false);
  assert.equal(config.authorization.exactV03Replacement, false);
  assert.equal(config.authorization.independentLaterOrigin, false);
  assert.equal(config.authorization.finalHoldout, false);
  assert.equal(config.authorization.provider, false);
  assert.equal(config.authorization.database, false);
  assert.equal(config.authorization.release, false);
  assert.equal(preregistration.candidateMetricsReadBeforeRegistration, false);
  assert.deepEqual(
    preregistration.ablationIds,
    M2_CHANNEL_EXPERT_ABLATIONS
  );
});

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
}
