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
    process.stdout.write(
      "M2 core legacy population public diagnostic verified.\n"
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
