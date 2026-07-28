import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  canonicalEvidenceSha256,
  compareM2ModelRegistryEntries,
  explainM2Identifier,
  findM2ModelsByAlias,
  loadM2ModelRegistry,
  renderM2ModelCatalog,
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
  assert.equal(
    registry.validationRules.historicalEvidenceDigestContract,
    "sha256_utf8_lf_v1"
  );
  assert.equal(
    canonicalEvidenceSha256("same\r\ncontent\r\n"),
    canonicalEvidenceSha256("same\ncontent\n")
  );
  assert.equal(validation.counts.modelCount, 28);
  assert.equal(validation.counts.experimentCount, 13);
  assert.equal(validation.counts.nonModelIdentifierCount, 50);
  assert.equal(validation.counts.comparabilityGroupCount, 16);
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
  assert.equal(oa03.evaluations.length, 4);
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
  assert.deepEqual(
    new Set(differentPopulation.pairs.map(
      (pair) => pair.left.comparableGroupId
    )),
    new Set([
      "CG-WORK-SS-OVERLAP-5203-H36",
      "CG-PSC01-V22-PRIMARY-12039-H36",
      "CG-PSC01-V22-STRICT-74320"
    ])
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

test("channel generative G1 execution is eligibility-blocked rather than failed", () => {
  const experiment = registry.experiments.find(
    (item) => item.experimentId === "M2-EXP-CHANNEL-GENERATIVE-02"
  );
  assert.equal(
    experiment.arms.find((arm) => arm.armId === "G1").executionStatus,
    "EXECUTION_STARTED_BLOCKED_INNER_ELIGIBILITY_NO_CANDIDATE_OUTCOME"
  );
  const model = registry.models.find(
    (item) => item.stableModelId === "M2-CHAN-GEN02"
  );
  assert.equal(model.operationalStatus, "blocked_not_failed");
  assert.equal(model.evaluations.at(-1).WAPE, null);
  assert.equal(
    model.evaluations.at(-1).resultStatus,
    "M2_CHANNEL_GENERATIVE_G1_CORE_BLOCKED"
  );
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

test("reader catalog is a deterministic complete rendering of the registry", async () => {
  const catalog = await readFile(
    path.join(
      root,
      "docs",
      "analysis",
      "m2-current",
      "M2-model-catalog-and-scorecard-v1.md"
    ),
    "utf8"
  );
  assert.equal(catalog, renderM2ModelCatalog(registry));
  assert.match(catalog, /M2-WORK-OA03/u);
  assert.match(catalog, /CG-G1-BLOCKED-NO-CANDIDATE-OUTCOME/u);
  assert.match(catalog, /M2_CHANNEL_GENERATIVE_G1_CORE_BLOCKED/u);
  assert.match(catalog, /M2_PUBLISHING_SCALE_IMPLEMENTATION_BLOCKED/u);
  assert.match(catalog, /M2_PUBLISHING_SCALE_CORE_FAIL/u);
  assert.match(catalog, /CG-PSC01-V22-PRIMARY-12039-H36/u);
  assert.match(catalog, /CG-PSC01-V22-STRICT-74320/u);
});

test("read-only query exposes scoped identities and refuses invalid ranking", () => {
  const list = runQuery("list");
  assert.equal(list.status, 0, list.stderr);
  assert.match(list.stdout, /M2 持久模型与模型族：28 个/u);
  assert.match(list.stdout, /M2-CHAN-GEN02/u);

  const status = runQuery("status");
  assert.equal(status.status, 0, status.stderr);
  assert.match(status.stdout, /本次只读查询模型执行次数：0/u);
  assert.match(status.stdout, /第一份有效原始候选评价已经冻结/u);
  assert.match(status.stdout, /原始候选预测行 3,318,819/u);
  assert.match(status.stdout, /M2_PUBLISHING_SCALE_CORE_FAIL/u);
  assert.match(status.stdout, /M2-WORK-OA03/u);

  const publishingScale = runQuery("show", "M2-CHAN-PSC01");
  assert.equal(publishingScale.status, 0, publishingScale.stderr);
  assert.match(publishingScale.stdout, /模型修订（model_revision）/u);
  assert.match(
    publishingScale.stdout,
    /未来分成收入开发可建模现金/u
  );

  const show = runQuery("show", "M2-WORK-OA03");
  assert.equal(show.status, 0, show.stderr);
  assert.match(show.stdout, /公式：/u);
  assert.match(show.stdout, /证据路径：/u);
  assert.match(show.stdout, /current-human-authority-served-758w-7083c/u);

  const aliases = runQuery("aliases", "exact-v0.3");
  assert.equal(aliases.status, 0, aliases.stderr);
  assert.match(aliases.stdout, /M2-WORK-OA03/u);
  assert.match(aliases.stdout, /exact v0\.3/u);

  const experiment = runQuery(
    "experiment",
    "M2-EXP-CHANNEL-GENERATIVE-02"
  );
  assert.equal(experiment.status, 0, experiment.stderr);
  assert.match(experiment.stdout, /M2-EXP-CHANNEL-GENERATIVE-02\/G1/u);
  assert.match(
    experiment.stdout,
    /EXECUTION_STARTED_BLOCKED_INNER_ELIGIBILITY_NO_CANDIDATE_OUTCOME/u
  );

  const g1 = runQuery("explain", "G1");
  assert.equal(g1.status, 0, g1.stderr);
  assert.match(g1.stdout, /M2-EXP-CHANNEL-GENERATIVE-02\/G1/u);
  assert.match(g1.stdout, /独立渠道发生-条件金额生成器/u);

  const k1 = runQuery("explain", "K1");
  assert.equal(k1.status, 0, k1.stderr);
  assert.match(k1.stdout, /M2-EXP-CHANNEL-GENERATIVE-02/u);
  assert.match(k1.stdout, /M2-MODEL-REGISTRY-V1/u);

  const scoped = runQuery(
    "compare",
    "M2-WORK-OA03",
    "M2-WORK-LG01"
  );
  assert.equal(scoped.status, 0, scoped.stderr);
  assert.match(scoped.stdout, /只能在下列明确相同可比组内比较/u);
  assert.match(scoped.stdout, /CG-WORK-SS-OVERLAP-5203-H36/u);

  const refused = runQuery(
    "compare",
    "M2-WORK-OA03",
    "M2-PORT-ETS01"
  );
  assert.equal(refused.status, 0, refused.stderr);
  assert.match(refused.stdout, /不能直接排名/u);
  assert.match(refused.stdout, /grain 不同/u);
});

test("current user-facing query is Chinese-first and never leaves G1 bare", () => {
  const result = runQuery("explain", "G1");
  assert.equal(result.status, 0, result.stderr);
  const linesWithG1 = result.stdout
    .split(/\r?\n/u)
    .filter((line) => /\bG1\b/u.test(line));
  assert.ok(linesWithG1.length > 0);
  assert.equal(
    linesWithG1.every((line) => (
      /渠道时间生成/u.test(line)
      && /M2-EXP-CHANNEL-GENERATIVE-02/u.test(line)
    )),
    true
  );
});

function runQuery(...args) {
  return spawnSync(
    process.execPath,
    [
      path.join(
        root,
        "scripts",
        "m2-current",
        "query_m2_model_registry.mjs"
      ),
      ...args
    ],
    {
      cwd: root,
      encoding: "utf8"
    }
  );
}
