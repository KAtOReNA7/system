import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jsonPath = path.join(
  root,
  "docs",
  "analysis",
  "m2-current",
  "M2-current-channel-generative-v0.2-preregistration.json"
);
const mdPath = jsonPath.replace(/\.json$/u, ".md");
const [jsonText, markdown] = await Promise.all([
  readFile(jsonPath, "utf8"),
  readFile(mdPath, "utf8")
]);
const contract = JSON.parse(jsonText);

const requiredTopLevel = [
  "schemaVersion",
  "artifactType",
  "repository",
  "activePr",
  "activeBranch",
  "verifiedAnchor",
  "startHead",
  "sourceEvidence",
  "scientificQuestion",
  "hypotheses",
  "targetContract",
  "caseManifest",
  "cashAuthority",
  "futureFirstSeenBoundary",
  "featureAllowlist",
  "featureDenylist",
  "candidateGraph",
  "modelFamilies",
  "hyperparameterGrid",
  "seeds",
  "splitProtocol",
  "nestedSelection",
  "evaluationMetrics",
  "materiality",
  "gates",
  "phaseStops",
  "fallbackPolicy",
  "requiredOutputs",
  "forbiddenActions",
  "dataLimitations",
  "implementationAuthorizationRequired",
  "safeToStartImplementation",
  "finalStatus"
];

test("generative v0.2 preregistration has every required machine field", () => {
  for (const field of requiredTopLevel) {
    assert.equal(Object.hasOwn(contract, field), true, field);
  }
  assert.equal(
    contract.finalStatus,
    "GENERATIVE_V02_PREREGISTRATION_COMPLETE_IMPLEMENTATION_NOT_AUTHORIZED"
  );
  assert.equal(contract.implementationAuthorizationRequired, true);
  assert.equal(contract.safeToStartImplementation, false);
  assert.deepEqual(contract.unresolvedQuestions, []);
  assert.equal(
    contract.preregistrationSelfCheck.productionSurfaceChangeCount,
    0
  );
});

test("frozen case manifest and receipts match inherited evidence", () => {
  assert.equal(
    contract.sourceEvidence.architectureConclusion,
    "CHANNEL_EXPERT_V01_IMPLEMENTATION_MISMATCH_CONFIRMED"
  );
  assert.equal(
    contract.caseManifest.digests.frozenEvaluationSha256,
    "aee288069e2cee728d26797df24c48f186e9083c49235f9e4c77ccc0e74922fd"
  );
  assert.equal(contract.caseManifest.primary.caseRowCount, 12039);
  assert.equal(contract.caseManifest.primary.independentWorkCount, 1125);
  assert.deepEqual(contract.caseManifest.primary.horizonsMonths, [36]);
  assert.equal(contract.caseManifest.strict.evaluatedCaseRowCount, 74320);
  assert.equal(contract.caseManifest.strict.independentWorkCount, 2650);
  assert.deepEqual(contract.caseManifest.strict.horizonsMonths, [
    3,
    6,
    12,
    18,
    24
  ]);
  assert.equal(
    Object.values(contract.caseManifest.strict.horizonCaseCounts)
      .reduce((sum, value) => sum + value, 0),
    74320
  );
  assert.equal(contract.caseManifest.strict.originBlockCount, 11);
  assert.equal(
    contract.caseManifest.materialization.futureFirstSeenLabelOnlyCount,
    99261
  );
});

test("G1 and G2 are separate two-part temporal generators", () => {
  const nodes = contract.candidateGraph.nodes;
  assert.deepEqual(Object.keys(nodes), [
    "G0",
    "G1",
    "G2",
    "G3",
    "G4",
    "G5",
    "G6"
  ]);
  assert.match(nodes.G1.occurrence, /logistic/u);
  assert.match(nodes.G1.conditionalAmount, /log1p-ridge/u);
  assert.equal(nodes.G1.usesG0AsFeatureOrOffset, false);
  assert.match(nodes.G2.conditionalAmountEquation, /log1p\(frozenG0/u);
  assert.equal(nodes.G2.actualPredictionRatioUsed, false);
  assert.equal(nodes.G2.platformOrTaxonomyMultiplierUsed, false);
  assert.equal(nodes.G2.sameCasesAndFoldsAsG1, true);
  assert.equal(nodes.G3.outerOutcomeUsedForSelection, false);
  assert.equal(nodes.G3.theoryEvidenceEligible, false);
  assert.equal(nodes.G4.amountMultiplier, false);
  assert.equal(nodes.G5.amountMultiplier, false);
  assert.equal(nodes.G5.actualPredictionRatio, false);
  assert.equal(
    contract.targetContract.generatorTrainingUniqueKey,
    "standardWorkId|channelUid|origin|futureMonthIndex"
  );
  assert.match(
    contract.targetContract.overlappingHorizonTrainingRule,
    /never duplicate/u
  );
});

test("features, grids, solvers and seeds are closed before implementation", () => {
  assert.equal(contract.featureAllowlist.length > 0, true);
  for (const feature of contract.featureAllowlist) {
    assert.equal(typeof feature.id, "string");
    assert.equal(typeof feature.formula, "string");
    assert.equal(typeof feature.sourcePath, "string");
    assert.equal(typeof feature.availableAt, "string");
    assert.equal(typeof feature.missingPolicy, "string");
  }
  assert.deepEqual(contract.hyperparameterGrid.rawCore.occurrenceL2, [
    1,
    10,
    100
  ]);
  assert.deepEqual(
    contract.hyperparameterGrid.rawCore.conditionalAmountL2,
    [1, 10, 100]
  );
  assert.deepEqual(contract.hyperparameterGrid.blend.alpha, [
    0.5,
    0.75,
    0.9,
    1
  ]);
  assert.equal(contract.hyperparameterGrid.rawCore.timeBasis, "FIXED_NOT_SELECTED");
  assert.equal(contract.hyperparameterGrid.maximumIterations, 200);
  assert.equal(contract.hyperparameterGrid.executedInThisPreregistration, false);
  assert.equal(contract.seeds.bootstrapSeed, 2026072702);
  assert.equal(contract.seeds.bootstrapIterations, 2000);
  assert.equal(contract.seeds.otherRandomnessAllowed, false);
  assert.equal(contract.modelFamilies.numericAlternativeFamily, null);
  assert.equal(
    contract.hyperparameterGrid.auditOutcomeUsedToChooseNumericValues,
    false
  );
});

test("raw, blend and selected results cannot replace one another", () => {
  assert.equal(contract.requiredOutputs.selectionSeparatedFromRaw, true);
  assert.deepEqual(contract.requiredOutputs.rawAlwaysPublished.slice(0, 2), [
    "G1",
    "G2"
  ]);
  assert.equal(contract.gates.blendDiagnostic.theoryGateEligible, false);
  assert.equal(contract.gates.blendDiagnostic.nextPhaseParentEligible, false);
  assert.equal(
    contract.gates.blendDiagnostic.ifRawFailsButBlendPassesStatus,
    "RAW_CORE_FAIL_BLEND_ONLY_SIGNAL"
  );
  assert.equal(
    contract.gates.coreRawPass.conditions.rawResultNotBlend,
    true
  );
  assert.equal(
    contract.gates.coreRawPass.failureStatus,
    "GENERATIVE_V02_CORE_FAIL"
  );
});

test("primary, strict, horizon, time and top-revenue gates are executable", () => {
  const conditions = contract.gates.coreRawPass.conditions;
  for (const field of [
    "primaryRelativeWape",
    "strictRelativeWape",
    "strictImprovedOriginBlocks",
    "improvedFrozenHorizonSlices",
    "eachHorizonRelativeImprovement",
    "top10RelativeWape",
    "top1RelativeWape",
    "top5RelativeWape",
    "primaryAbsoluteBiasDeterioration",
    "strictAbsoluteBiasDeterioration",
    "primaryBootstrapRelativeImprovementLower95",
    "strictBootstrapRelativeImprovementLower95"
  ]) {
    assert.equal(Object.hasOwn(conditions, field), true, field);
  }
  assert.deepEqual(conditions.primaryRelativeWape, {
    operator: ">=",
    value: 0.01
  });
  assert.equal(conditions.strictImprovedOriginBlocks.value, 6);
  assert.equal(conditions.strictImprovedOriginBlocks.total, 11);
  assert.equal(conditions.improvedFrozenHorizonSlices.value, 4);
  assert.equal(conditions.improvedFrozenHorizonSlices.total, 6);
  assert.equal(conditions.eachHorizonRelativeImprovement.value, -0.01);
  assert.equal(conditions.top10RelativeWape.value, 0.01);
  assert.equal(
    conditions.primaryBootstrapRelativeImprovementLower95.value,
    -0.01
  );
  assert.equal(contract.materiality.relativeWapeMinimum, 0.01);
  assert.equal(
    contract.gates.mechanismSafety.minimumAdequatelyPopulatedMechanismsWithoutMaterialHarm,
    2
  );
  assert.equal(
    contract.evaluationMetrics.pairedBootstrap.clusterUnit,
    "standardWorkId across all channel, origin and horizon rows"
  );
});

test("core to platform to taxonomy is a gated sequential stop", () => {
  assert.deepEqual(
    contract.phaseStops.map(({ order, phase }) => [order, phase]),
    [
      [1, "CORE_G1_G2_AND_G3_DIAGNOSTIC"],
      [2, "PLATFORM_G4"],
      [3, "TAXONOMY_G5"],
      [4, "COMPOSITION_G6"]
    ]
  );
  assert.equal(contract.candidateGraph.G4G5G6AuthorizedNow, false);
  assert.equal(contract.phaseStops[0].startRequiresNewAuthorization, true);
  assert.deepEqual(contract.phaseStops[0].forbidNext, ["G4", "G5", "G6"]);
  assert.deepEqual(contract.phaseStops[1].forbidNext, ["G5", "G6"]);
  assert.deepEqual(contract.phaseStops[2].forbidNext, ["G6"]);
  assert.equal(
    contract.fallbackPolicy.eligibility.platform.manboStandaloneAllowed,
    false
  );
});

test("preregistration contains no v0.2 result or implementation authorization", () => {
  assert.equal(contract.sourceEvidence.newV02OutcomeRead, false);
  assert.equal(contract.sourceEvidence.v02TrainingExecuted, false);
  assert.equal(contract.requiredOutputs.noOutcomeInPreregistration, true);
  assert.equal(contract.implementationPlan.authorizedNow, false);
  assert.doesNotMatch(jsonText, /"v02Wape"\s*:/u);
  assert.doesNotMatch(jsonText, /"candidateMetrics"\s*:/u);
  assert.match(
    markdown,
    /GENERATIVE_V02_PREREGISTRATION_COMPLETE_IMPLEMENTATION_NOT_AUTHORIZED/u
  );
  assert.match(markdown, /safeToStartImplementation=false/u);
  assert.match(markdown, /本轮没有实现、训练、拟合、预测或读取任何 v0\.2 outcome/u);
});
