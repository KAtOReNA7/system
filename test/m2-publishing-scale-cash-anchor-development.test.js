import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  M2_PSC02_MODEL_ID,
  M2_PSC02_RAW_CANDIDATE_ID,
  buildM2Psc02SyntheticImplementationDiagnostic,
  crossFitM2Psc02Primary,
  fitM2Psc02ResidualHierarchy,
  predictM2Psc02MonthlyDevelopment,
  validateM2Psc02DevelopmentConfig
} from "../src/domain/m2Current/publishingScaleCashAnchorDevelopment.js";
import {
  M2_PSC02_ANCHOR_AVAILABLE,
  m2Psc02ReferenceArmIds
} from "../src/domain/m2Current/publishingScaleCashAnchorPreregistration.js";

const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const [
  implementation,
  preregistration,
  psc01Config,
  supportContract,
  evaluationContract,
  businessAcceptanceContract
] = await Promise.all([
  readJson("config/m2-current-publishing-scale-channel-origin-visible-cash-anchor-development.v0.1.json"),
  readJson("config/m2-current-publishing-scale-channel-origin-visible-cash-anchor-preregistration.v0.1.json"),
  readJson("config/m2-current-publishing-scale-channel.v0.1.json"),
  readJson("config/m2-publishing-scale-statistical-support.v1.json"),
  readJson("config/m2-evaluation-contract.v2.2.json"),
  readJson("config/m2-business-acceptance-contract.v1.json")
]);
const options = {preregistration, psc01Config, supportContract};
const arms = m2Psc02ReferenceArmIds();

test("PSC02 development config creates one inactive raw model identity", () => {
  assert.equal(validateM2Psc02DevelopmentConfig(implementation, {
    preregistration,
    psc01Config,
    supportContract,
    evaluationContract,
    businessAcceptanceContract
  }), true);
  assert.equal(implementation.modelId, M2_PSC02_MODEL_ID);
  assert.equal(implementation.rawCandidateId, M2_PSC02_RAW_CANDIDATE_ID);
  assert.equal(implementation.boundaries.activeCandidate, null);
  assert.equal(implementation.boundaries.approvedForAutomation, null);
  assert.equal(implementation.boundaries.productionReady, false);
  assert.equal(implementation.boundaries.finalHoldoutOpened, false);
});

test("public implementation diagnostic verifies scale and dependency boundaries", () => {
  const result = buildM2Psc02SyntheticImplementationDiagnostic({
    implementation,
    preregistration,
    psc01Config,
    supportContract,
    evaluationContract,
    businessAcceptanceContract
  });
  assert.equal(
    result.status,
    "M2_PSC02_PUBLIC_SYNTHETIC_IMPLEMENTATION_VERIFIED"
  );
  assert.equal(result.scaleEquivarianceFactor, 10);
  assert.equal(result.occurrenceMultiplyCount, 1);
  assert.equal(result.anchorApplyCount, 1);
  assert.equal(result.taxonomyUsed, false);
  assert.equal(result.lg01PredictionUsed, false);
  assert.equal(result.realOutcomeUsed, false);
});

test("diagnostic and primary estimators stay separate and deterministic", () => {
  const rows = syntheticRows();
  const firstD1 = fitM2Psc02ResidualHierarchy(rows, {
    ...options,
    armId: arms.D1,
    selection: {kind: "PRIMARY_WORK_FOLDS", salt: "unit"}
  });
  const firstPrimary = fitM2Psc02ResidualHierarchy(rows, {
    ...options,
    armId: arms.P,
    selection: {kind: "PRIMARY_WORK_FOLDS", salt: "unit"}
  });
  const secondPrimary = fitM2Psc02ResidualHierarchy(rows, {
    ...options,
    armId: arms.P,
    selection: {kind: "PRIMARY_WORK_FOLDS", salt: "unit"}
  });
  assert.equal(firstD1.status, "FITTED");
  assert.equal(firstPrimary.status, "FITTED");
  assert.deepEqual(secondPrimary, firstPrimary);
  assert.ok([1, 3].includes(firstD1.global.selectedLambda));
  assert.ok([1, 3].includes(firstPrimary.global.selectedLambda));
  assert.equal(firstD1.candidateId, null);
  assert.equal(firstPrimary.candidateId, M2_PSC02_RAW_CANDIDATE_ID);
  assert.equal(firstPrimary.estimatorSwitchUsed, false);
  const d0 = predictM2Psc02MonthlyDevelopment(rows[0], null, options);
  const d1 = predictM2Psc02MonthlyDevelopment(rows[0], firstD1, options);
  const primary = predictM2Psc02MonthlyDevelopment(
    rows[0],
    firstPrimary,
    options
  );
  assert.equal(d0.armId, arms.D0);
  assert.equal(d1.armId, arms.D1);
  assert.equal(primary.armId, arms.P);
  assert.equal(primary.occurrenceProbability, rows[0].occurrenceProbability);
  assert.equal(primary.occurrenceMultiplyCount, 1);
  assert.equal(primary.anchorApplyCount, 1);
  assert.equal(primary.taxonomyFeatureUsed, false);
  assert.equal(primary.lg01PredictionUsed, false);
});

test("primary cross-fit preserves exact occurrence and case coverage", () => {
  const rows = syntheticRows();
  const result = crossFitM2Psc02Primary(rows, options);
  assert.equal(result.status, "COMPLETE");
  assert.equal(result.coverage.passed, true);
  assert.equal(result.coverage.intersectionScoringUsed, false);
  assert.equal(result.predictions.P.length, rows.length);
  for (let index = 0; index < rows.length; index += 1) {
    assert.ok(Object.is(
      result.predictions.P[index].occurrenceProbability,
      rows[index].occurrenceProbability
    ));
  }
});

test("PSC02 wiring reuses the canonical runner, registry, and has no production route", async () => {
  const [runner, mode, source, packageJson, lifecycle, capability, registry] =
    await Promise.all([
      readFile("scripts/m2-current/run_m2_human_anchored_development.mjs", "utf8"),
      readFile("scripts/m2-current/publishing_scale_cash_anchor_execution.mjs", "utf8"),
      readFile("src/domain/m2Current/publishingScaleCashAnchorDevelopment.js", "utf8"),
      readJson("package.json"),
      readJson("config/command-lifecycle.v0.1.json"),
      readJson("config/development-capability-catalog.v0.1.json"),
      readJson("config/m2-model-registry.v1.json")
    ]);
  assert.match(runner, /--publishing-scale-cash-anchor/u);
  assert.match(
    packageJson.scripts["develop:m2:current:publishing-scale-cash-anchor"],
    /run_m2_human_anchored_development\.mjs/u
  );
  assert.ok(lifecycle.currentPublicCommands.includes(
    "diagnose:m2:publishing-scale-cash-anchor"
  ));
  assert.ok(capability.capabilities.some((value) => (
    value.id === "m2-current-publishing-scale-cash-anchor-development"
  )));
  const model = registry.models.find((value) => (
    value.stableModelId === M2_PSC02_MODEL_ID
  ));
  assert.equal(model.rawCandidateVariantId, M2_PSC02_RAW_CANDIDATE_ID);
  assert.deepEqual(model.evaluations, []);
  assert.equal(registry.currentRoles.activeCandidate, null);
  assert.equal(registry.currentRoles.approvedForAutomation, null);
  assert.doesNotMatch(source, /productionLoader|LG01_PREDICTION/u);
  assert.doesNotMatch(
    mode,
    /from\s+["'][^"']*(?:src\/routes|database|providerClient)/u
  );
});

function syntheticRows() {
  const rows = [];
  for (let work = 0; work < 36; work += 1) {
    for (let originIndex = 0; originIndex < 3; originIndex += 1) {
      const origin = `2022-${String(originIndex + 1).padStart(2, "0")}`;
      for (let futureMonthIndex = 1; futureMonthIndex <= 3; futureMonthIndex += 1) {
        const anchorValue = 50 + work + originIndex;
        const features = Object.fromEntries(psc01Config.featureOrder.map(
          (field, index) => [field, Math.log1p(anchorValue + index) / (index + 1)]
        ));
        rows.push({
          caseKey: `w${work}|channel|${origin}|${futureMonthIndex}`,
          standardWorkId: `w${work}`,
          channelUid: "chn_846e11f634e4e518364a",
          origin,
          futureMonthIndex,
          labelAvailableAsOf: `2022-${String(originIndex + 4).padStart(2, "0")}`,
          mechanism: "membership",
          features,
          anchor: {
            status: M2_PSC02_ANCHOR_AVAILABLE,
            level: "WORK_CHANNEL",
            value: anchorValue
          },
          occurrenceProbability: 0.7,
          actualPositive: anchorValue * Math.exp(0.02 * futureMonthIndex),
          observedAtOrigin: true,
          actual: anchorValue * Math.exp(0.02 * futureMonthIndex),
          actualReversal: 0,
          includedHorizons: [3]
        });
      }
    }
  }
  return rows;
}
