import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  M2_PSC02_PREREGISTRATION_STATUS,
  validateM2Psc02Preregistration
} from "../src/domain/m2Current/publishingScaleCashAnchorPreregistration.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const paths = {
  config:
    "config/m2-current-publishing-scale-channel-origin-visible-cash-anchor-preregistration.v0.1.json",
  schema:
    "config/m2-current-publishing-scale-channel-origin-visible-cash-anchor-schema.v0.1.json",
  machine:
    "docs/analysis/m2-current/M2-publishing-scale-channel-origin-visible-cash-anchor-preregistration-v0.1.json",
  report:
    "docs/analysis/m2-current/M2-publishing-scale-channel-origin-visible-cash-anchor-preregistration-v0.1.md",
  decision:
    "docs/analysis/m2-current/M2-publishing-scale-channel-origin-visible-cash-anchor-design-decision-v0.1.md",
  clarification:
    "docs/analysis/m2-current/M2-publishing-scale-channel-origin-visible-cash-anchor-pre-outcome-contract-clarification-v0.1.md",
  state: "docs/analysis/m2-v2/M2-v2-current-state-index-v0.58.md"
};
const config = await readJson(paths.config);
const schema = await readJson(paths.schema);
const machine = await readJson(paths.machine);
const registry = await readJson("config/m2-model-registry.v1.json");
const report = await readText(paths.report);
const clarification = await readText(paths.clarification);
const state = await readText(paths.state);
const readme = await readText("README.md");

test("public preregistration report and machine contract share one status and identity", async () => {
  assert.equal(machine.status, M2_PSC02_PREREGISTRATION_STATUS);
  assert.equal(config.status, M2_PSC02_PREREGISTRATION_STATUS);
  assert.equal(machine.preregistrationId, config.preregistrationId);
  assert.equal(machine.experimentId, config.experimentId);
  assert.equal(machine.modelId, null);
  assert.equal(machine.contractRef, paths.config);
  assert.equal(machine.schemaRef, paths.schema);
  assert.match(report, new RegExp(M2_PSC02_PREREGISTRATION_STATUS, "u"));
  assert.match(report, /没有授权创建 PSC02 模型 ID/u);
  assert.match(report, /posting component/u);
  assert.match(clarification, /真实 outcome 从未打开/u);
  assert.match(clarification, /privateInputRead=false/u);
  assert.doesNotMatch(
    JSON.stringify(machine),
    /data[\\/]+private-(input|output)|[A-Z]:[\\/]/iu
  );
});

test("schema covers config, anchor input, anchor result, and manifest identities", () => {
  assert.equal(
    schema.$id,
    "m2.current.publishing_scale_channel_origin_visible_cash_anchor_schema.v0.1"
  );
  assert.equal(schema.properties.status.const, M2_PSC02_PREREGISTRATION_STATUS);
  assert.equal(schema.properties.modelId.type, "null");
  assert.ok(schema.$defs.anchorInputRow);
  assert.ok(schema.$defs.anchorResult);
  assert.ok(schema.$defs.anchorManifest);
  assert.equal(schema.properties.version.const, "0.1.1");
  assert.equal(
    schema.$defs.anchorInputRow.properties.sourceForm.const,
    config.cashAnchor.sourceAuthority.form
  );
  assert.ok(schema.$defs.anchorInputRow.required.includes("componentId"));
  assert.deepEqual(
    schema.$defs.cashAnchorContract.properties.fallbackOrder.const,
    config.cashAnchor.fallbackOrder
  );
});

test("public materializer proves the authority is component source aggregated monthly", async () => {
  const materializer = await readText(
    "scripts/m2-current/materialize_human_anchored_cases.py"
  );
  assert.equal(
    config.cashAnchor.sourceAuthority.form,
    "POSTING_COMPONENT_ROWS_AGGREGATED_WITHIN_CANONICAL_AS_OF_REVISION_SNAPSHOT"
  );
  assert.match(materializer, /rows, mapping_audit = _map_sales_share_rows\(/u);
  assert.match(materializer, /panel = _monthly_panel\(rows\)/u);
  assert.match(
    materializer,
    /bucket\["positive"\] \+= max\(amount, Decimal\("0"\)\)/u
  );
  assert.equal(config.cashAnchor.sourceAuthority.directComponentMeanAllowed, false);
});

test("semantic validator binds all current contracts", async () => {
  assert.equal(validateM2Psc02Preregistration(config, {
    psc01Config: await readJson(
      "config/m2-current-publishing-scale-channel.v0.1.json"
    ),
    baseConfig: await readJson("config/m2-current-human-anchored.v0.1.json"),
    evaluationContract: await readJson("config/m2-evaluation-contract.v2.2.json"),
    businessAcceptanceContract: await readJson(
      "config/m2-business-acceptance-contract.v1.json"
    )
  }), true);
});

test("Model Registry preserves the preregistration and maps the later authorized model without a score", () => {
  assert.equal(registry.currentRoles.activeCandidate, null);
  assert.equal(registry.currentRoles.approvedForAutomation, null);
  assert.equal(
    registry.currentRoles.latestStateIndex,
    paths.state
  );
  const experiment = registry.experiments.find(
    (item) => item.experimentId === config.experimentId
  );
  assert.ok(experiment);
  assert.deepEqual(experiment.modelIds, ["M2-CHAN-PSC02"]);
  assert.equal(experiment.modelCreated, true);
  assert.equal(experiment.realPredictionGenerated, false);
  assert.equal(experiment.evaluationExecuted, false);
  assert.ok(experiment.arms.every((arm) => arm.modelId === "M2-CHAN-PSC02"));
  assert.equal(
    registry.models.some((model) => /PSC02/u.test(model.stableModelId)),
    true
  );
  assert.equal(
    registry.models.flatMap((model) => model.evaluations).some(
      (evaluation) => /PSC02/u.test(evaluation.evaluationId)
    ),
    false
  );
  assert.deepEqual(
    registry.models.find((model) => model.stableModelId === "M2-CHAN-PSC01")
      .successorIds,
    ["M2-CHAN-PSC02"]
  );
});

test("README, state index, and catalog preserve preregistration lineage after the source-authority stop", async () => {
  const catalog = await readText(
    "docs/analysis/m2-current/M2-model-catalog-and-scorecard-v1.md"
  );
  for (const value of [readme, state]) {
    assert.match(value, /M2-PREREG-PSC02-ORIGIN-VISIBLE-CASH-ANCHOR-01/u);
  }
  assert.match(catalog, /M2-CHAN-PSC02/u);
  assert.match(
    await readText(
      "docs/analysis/m2-current/"
        + "M2-publishing-scale-channel-origin-visible-cash-anchor-preregistration-v0.1.md"
    ),
    new RegExp(M2_PSC02_PREREGISTRATION_STATUS, "u")
  );
  assert.match(readme, /M2-CHAN-PSC02-RAW/u);
  assert.match(state, /PSC02_DEVELOPMENT_NOT_SUPPORTED/u);
  assert.match(state, /PRIVATE_SOURCE_AUTHORITY_BLOCKER_NOT_MODEL_FAILURE/u);
  assert.match(state, /activeCandidate=null/u);
  assert.match(state, /approvedForAutomation=null/u);
  assert.match(state, /finalHoldoutOpened=false/u);
});

test("production loader, route, and package scripts do not import the reference harness", async () => {
  const [loader, route, packageJson] = await Promise.all([
    readText("src/domain/m2Current/loader.js"),
    readText("src/domain/m2Current/route.js"),
    readText("package.json")
  ]);
  for (const value of [loader, route, packageJson]) {
    assert.doesNotMatch(
      value,
      /publishingScaleCashAnchorPreregistration/u
    );
  }
});

test("evaluation gates and public synthetic disclosure are frozen before real prediction", () => {
  assert.equal(
    machine.evaluationFreeze.status,
    "FROZEN_BEFORE_ANY_REAL_PSC02_PREDICTION"
  );
  assert.equal(
    machine.evaluationFreeze.psc01PrimaryAndStrictRelativeWapeFvaMinimum,
    0.1
  );
  assert.equal(machine.evaluationFreeze.lg01CombinationRule, "AND");
  assert.equal(machine.evaluationFreeze.bootstrapIterations, 2000);
  assert.equal(machine.evaluationFreeze.bootstrapResamplingUnit, "standardWorkId");
  assert.equal(machine.publicSyntheticValidation.requiredInvariantCount, 22);
  assert.equal(machine.publicSyntheticValidation.verifiedInvariantCount, 22);
  assert.equal(machine.publicSyntheticValidation.privateRowsUsed, false);
  assert.equal(machine.publicSyntheticValidation.realPredictionGenerated, false);
  assert.equal(machine.publicSyntheticValidation.candidateFitExecuted, false);
  assert.equal(machine.publicSyntheticValidation.realEvaluationExecuted, false);
  assert.equal(machine.preOutcomeClarification.realOutcomeEverOpened, false);
  assert.equal(machine.preOutcomeClarification.privateInputReadForClarification, false);
  assert.equal(
    machine.evaluationFreeze.exactCaseCoverageGate,
    "PSC02_EXACT_CASE_COVERAGE_EQUALS_FROZEN_PSC01_RAW"
  );
});

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readText(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}
