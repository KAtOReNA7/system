import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  compareM2ModelRegistryEntries,
  explainM2Identifier,
  findM2ModelsByAlias,
  loadM2ModelRegistry,
  validateM2ModelRegistry
} from "../src/domain/m2Current/modelRegistry.js";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const registry = loadM2ModelRegistry(
  path.join(root, "config", "m2-model-registry.v1.json")
);

test("registry schema, evidence paths and immutable digests validate", () => {
  const validation = validateM2ModelRegistry(registry, { repoRoot: root });
  assert.equal(validation.valid, true, validation.errors.join("\n"));
  assert.equal(validation.counts.modelCount, 27);
  assert.equal(validation.counts.experimentCount, 12);
  assert.equal(validation.counts.comparabilityGroupCount, 13);
});

test("stable model IDs and model aliases are unique", () => {
  const ids = registry.models.map((model) => model.stableModelId);
  assert.equal(new Set(ids).size, ids.length);
  const aliases = registry.models.flatMap((model) => (
    [model.stableModelId, ...model.legacyIds, ...model.legacyAliases]
      .map((alias) => alias.normalize("NFKC").trim().toLowerCase())
  ));
  assert.equal(new Set(aliases).size, aliases.length);
  assert.equal(
    findM2ModelsByAlias(registry, "exact-v0.3")[0].stableModelId,
    "M2-WORK-OA03"
  );
});

test("model and non-model namespaces are separate and collisions are explicit", () => {
  const b4 = explainM2Identifier(registry, "B4");
  assert.equal(b4.models[0].stableModelId, "M2-WORK-B4");
  assert.equal(b4.nonModels.length, 1);
  assert.equal(b4.nonModels[0].type, "governance_stage_and_legacy_alias");
  const r3 = explainM2Identifier(registry, "R3");
  assert.equal(r3.models.length, 0);
  assert.equal(r3.nonModels[0].type, "evaluation_campaign_stage");
  assert.equal(
    registry.validationRules.aliasCollisionLedger.some(
      (entry) => entry.alias === "B4"
    ),
    true
  );
});

test("current roles retain fallback, research baseline and no automation promotion", () => {
  assert.equal(
    registry.currentRoles.operationalWorkFallback,
    "M2-WORK-OA03"
  );
  assert.equal(
    registry.currentRoles.researchWorkBaseline,
    "M2-WORK-LG01"
  );
  assert.equal(
    registry.currentRoles.portfolioReference,
    "M2-PORT-ETS01"
  );
  assert.equal(registry.currentRoles.activeCandidate, null);
  assert.equal(registry.currentRoles.approvedForAutomation, null);
  assert.equal(registry.currentRoles.roleConflict, false);
});

test("evaluations preserve population and comparability contracts", () => {
  const oa03 = registry.models.find(
    (model) => model.stableModelId === "M2-WORK-OA03"
  );
  assert.equal(oa03.evaluations.length, 2);
  assert.notEqual(
    oa03.evaluations[0].comparableGroupId,
    oa03.evaluations[1].comparableGroupId
  );
  const sameCase = compareM2ModelRegistryEntries(
    registry,
    "M2-WORK-OA03",
    "M2-WORK-CCR01"
  );
  assert.equal(sameCase.comparable, true);
  const differentPopulation = compareM2ModelRegistryEntries(
    registry,
    "M2-WORK-OA03",
    "M2-WORK-LG01"
  );
  assert.equal(differentPopulation.comparable, true);
  assert.equal(
    differentPopulation.pairs.every(
      (pair) => pair.left.comparableGroupId
        === "CG-WORK-SS-OVERLAP-5203-H36"
    ),
    true
  );
  const differentGrain = compareM2ModelRegistryEntries(
    registry,
    "M2-WORK-OA03",
    "M2-PORT-ETS01"
  );
  assert.equal(differentGrain.comparable, false);
  assert.equal(differentGrain.winnerByWape, null);
  assert.equal(
    differentGrain.differences.some((item) => item.field === "grain"),
    true
  );
});

test("channel generative status remains blocked rather than failed", () => {
  const experiment = registry.experiments.find(
    (item) => item.experimentId === "M2-EXP-CHANNEL-GENERATIVE-02"
  );
  assert.equal(
    experiment.arms.find((arm) => arm.armId === "G1").executionStatus,
    "NOT_EXECUTED_CONTRACT_SEMANTIC_BLOCKER"
  );
  const model = registry.models.find(
    (item) => item.stableModelId === "M2-CHAN-GEN02"
  );
  assert.equal(model.operationalStatus, "blocked_not_failed");
  assert.equal(model.evaluations.at(-1).WAPE, null);
});

test("long-term reporting rules are placed at the minimal AGENTS scope", async () => {
  const [rootRules, scopedRules] = await Promise.all([
    readFile(path.join(root, "AGENTS.md"), "utf8"),
    readFile(path.join(root, "src", "domain", "m2Current", "AGENTS.md"), "utf8")
  ]);
  assert.match(rootRules, /用户可见的阶段反馈、结论和复盘必须中文优先/u);
  assert.match(rootRules, /历史文件名、历史 ID[\s\S]+不得因此被重命名、改写或回填/u);
  assert.match(scopedRules, /m2-model-registry\.v1\.json/u);
  assert.match(scopedRules, /G1.*A5.*R3.*K1/u);
  assert.match(scopedRules, /Rank evaluations only when target/u);
  assert.match(scopedRules, /raw candidate metrics or raw FVA/u);
  assert.doesNotMatch(scopedRules, /481441f|30276695120|PR #28/u);
});

test("registry contains no private path and performs no model execution", () => {
  const serialized = JSON.stringify(registry);
  assert.doesNotMatch(serialized, /data[\\/]+private-(input|output)/iu);
  assert.equal(
    registry.models.some((model) => model.productionImported),
    false
  );
  assert.equal(
    registry.models.some((model) => model.automationAuthorized),
    false
  );
  assert.equal(
    registry.models.some((model) => model.finalHoldoutOpened),
    false
  );
});
