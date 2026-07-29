import {
  mkdir,
  readFile,
  writeFile
} from "node:fs/promises";
import path from "node:path";

import {
  buildCoreLegacySyntheticDiagnostic,
  validateM2CoreLegacyPopulationConfig
} from "../../src/domain/m2Current/coreLegacyPopulation.js";

const CONFIG_PATH =
  "config/m2-current-core-legacy-population.v0.1.json";
const FIXTURE_PATH =
  "test/fixtures/m2-core-legacy-population.synthetic.v0.1.json";

export async function runM2CoreLegacyPopulationPublicDiagnostic({
  root,
  verify
}) {
  const [config, fixture] = await Promise.all([
    readJson(path.join(root, CONFIG_PATH)),
    readJson(path.join(root, FIXTURE_PATH))
  ]);
  validateM2CoreLegacyPopulationConfig(config);
  const diagnostic = buildCoreLegacySyntheticDiagnostic(
    fixture,
    config
  );
  assertFixture(diagnostic, fixture);
  const outputPath = path.join(root, config.publicOutputs.diagnostic);
  const text = `${JSON.stringify(diagnostic, null, 2)}\n`;
  if (verify) {
    if (await readFile(outputPath, "utf8") !== text) {
      throw new Error(
        "m2_core_legacy_population_public_diagnostic_drift"
      );
    }
    await assertTrackedPublicEvidence(root, config);
    process.stdout.write(
      "M2 core legacy population public diagnostic and tracked evidence "
        + "verified.\n"
    );
    return diagnostic;
  }
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, text, "utf8");
  process.stdout.write(
    "M2 core legacy population public diagnostic written.\n"
  );
  return diagnostic;
}

async function assertTrackedPublicEvidence(root, config) {
  const [frozenRescore, tailTest] = await Promise.all([
    readJson(path.join(root, config.publicOutputs.frozenRescoreJson)),
    readJson(path.join(root, config.publicOutputs.tailTestJson))
  ]);
  if (
    frozenRescore.status
      !== "K1_FROZEN_MODEL_CORRECT_POPULATION_RESCORE_COMPLETE"
    || frozenRescore.metrics?.length !== 192
    || frozenRescore.rebuildAudit?.learnedGlobal
      ?.maximumAbsoluteReconstructionDifference !== 0
  ) {
    throw new Error("m2_core_legacy_frozen_rescore_evidence_invalid");
  }
  if (
    tailTest.status
      !== "K2_CONTROLLED_TRAINING_POPULATION_ABLATION_COMPLETE"
    || tailTest.metrics?.length !== 96
    || tailTest.comparisons?.length !== 64
    || tailTest.tailInterferenceDecision?.status
      !== "TAIL_INTERFERENCE_NOT_CONFIRMED"
    || tailTest.boundaries?.validTrainingEvaluationCount !== 1
    || tailTest.boundaries?.postResultTuningPerformed !== false
    || tailTest.boundaries?.fallbackUsed !== false
    || tailTest.controlledDesign?.arms?.find(
      (arm) => arm.armId.endsWith("/T3_REVENUE_WEIGHTED_FULL")
    )?.status !== "NOT_EXECUTED_REQUIRES_MODEL_CHANGE"
  ) {
    throw new Error("m2_core_legacy_tail_test_evidence_invalid");
  }
  const serialized = JSON.stringify({ frozenRescore, tailTest });
  for (const forbidden of [
    "\"standardWorkId\":",
    "\"channelUid\":",
    "\"caseKey\":",
    "data/private-input",
    "data/private-output"
  ]) {
    if (serialized.includes(forbidden)) {
      throw new Error(
        `m2_core_legacy_public_evidence_privacy_boundary:${forbidden}`
      );
    }
  }
}

function assertFixture(diagnostic, fixture) {
  for (const expected of fixture.selectionCases) {
    const actual = diagnostic.selections.find(
      (item) => item.id === expected.id
    );
    if (
      JSON.stringify(actual?.core80)
        !== JSON.stringify(expected.expectedCore80)
      || JSON.stringify(actual?.core90)
        !== JSON.stringify(expected.expectedCore90)
      || actual?.core80TieCount !== expected.expectedCore80TieCount
    ) {
      throw new Error(
        `m2_core_legacy_selection_fixture_failed:${expected.id}`
      );
    }
  }
  for (const expected of fixture.eligibilityCases) {
    const actual = diagnostic.eligibility.find(
      (item) => item.id === expected.id
    );
    if (
      JSON.stringify(actual?.eligiblePairs)
        !== JSON.stringify(expected.expectedEligiblePairs)
      || actual?.immaturePairCount
        !== expected.expectedImmaturePairCount
    ) {
      throw new Error(
        `m2_core_legacy_eligibility_fixture_failed:${expected.id}`
      );
    }
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}
