import {
  mkdir,
  readFile,
  writeFile
} from "node:fs/promises";
import path from "node:path";

import {
  assertM2LayeredRevenuePublicSafe,
  buildM2LayeredRevenueSyntheticDiagnostic
} from "../../src/domain/m2Current/layeredRevenueComposition.js";

const CONFIG_PATH =
  "config/m2-current-layered-revenue-composition.v0.1.json";
const FIXTURE_PATH =
  "test/fixtures/m2-layered-revenue-composition.synthetic.v0.1.json";

export async function runM2LayeredRevenueCompositionPublicDiagnostic({
  root,
  verify
}) {
  const [config, fixture] = await Promise.all([
    readJson(path.join(root, CONFIG_PATH)),
    readJson(path.join(root, FIXTURE_PATH))
  ]);
  const diagnostic = buildM2LayeredRevenueSyntheticDiagnostic(
    fixture,
    config
  );
  assertExpectations(fixture, diagnostic);
  assertM2LayeredRevenuePublicSafe(diagnostic);
  const outputPath = path.join(root, config.publicOutputs.diagnostic);
  const text = `${JSON.stringify(diagnostic, null, 2)}\n`;
  if (verify) {
    if (await readFile(outputPath, "utf8") !== text) {
      throw new Error(
        "m2_layered_revenue_public_diagnostic_drift"
      );
    }
    process.stdout.write(
      "M2 layered-revenue composition public diagnostic verified.\n"
    );
    return diagnostic;
  }
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, text, "utf8");
  process.stdout.write(
    "M2 layered-revenue composition public diagnostic written.\n"
  );
  return diagnostic;
}

function assertExpectations(fixture, diagnostic) {
  const actual = diagnostic.decomposition;
  for (const [componentId, expected] of Object.entries(
    fixture.expected
  )) {
    const value = componentId === "COMPANY_TOTAL"
      ? actual.companyTotalMinor
      : componentId === "CONSERVATION_DIFFERENCE"
        ? actual.conservationDifferenceMinor
        : actual.components[componentId];
    if (value !== expected) {
      throw new Error(
        `m2_layered_revenue_fixture_failed:${componentId}`
      );
    }
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}
