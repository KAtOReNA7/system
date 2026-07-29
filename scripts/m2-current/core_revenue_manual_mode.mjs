import {
  mkdir,
  readFile,
  writeFile
} from "node:fs/promises";
import path from "node:path";

import {
  buildM2CoreRevenueManualSyntheticDiagnostic,
  validateM2CoreRevenueManualConfig
} from "../../src/domain/m2Current/coreRevenueManual.js";
import {
  runM2CoreRevenueManualPrivateEvaluation
} from "./core_revenue_manual_private.mjs";

const CONFIG_PATH =
  "config/m2-current-core-revenue-manual.v0.1.json";
const FIXTURE_PATH =
  "test/fixtures/m2-core-revenue-manual.synthetic.v0.1.json";

export async function runM2CoreRevenueManualPublicDiagnostic({
  root,
  verify
}) {
  const [config, fixture] = await Promise.all([
    readJson(path.join(root, CONFIG_PATH)),
    readJson(path.join(root, FIXTURE_PATH))
  ]);
  validateM2CoreRevenueManualConfig(config);
  const diagnostic = buildM2CoreRevenueManualSyntheticDiagnostic(
    fixture,
    config
  );
  assertSyntheticExpectations(fixture, diagnostic);
  const outputPath = path.join(
    root,
    config.publicOutputs.diagnostic
  );
  const text = `${JSON.stringify(diagnostic, null, 2)}\n`;
  if (verify) {
    if (await readFile(outputPath, "utf8") !== text) {
      throw new Error(
        "m2_core_revenue_manual_public_diagnostic_drift"
      );
    }
    process.stdout.write(
      "M2 core-revenue manual public diagnostic verified.\n"
    );
    return diagnostic;
  }
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, text, "utf8");
  process.stdout.write(
    "M2 core-revenue manual public diagnostic written.\n"
  );
  return diagnostic;
}

export async function runM2CoreRevenueManualPrivateDevelopment({ root }) {
  const result = await runM2CoreRevenueManualPrivateEvaluation({ root });
  process.stdout.write(`${JSON.stringify({
    status: result.status,
    exactHead: result.execution.exactHead,
    legalOriginCount: result.population.legalOriginCount,
    firstValidEvaluationProduced:
      result.execution.firstValidEvaluationProduced
  }, null, 2)}\n`);
  return result;
}

function assertSyntheticExpectations(fixture, diagnostic) {
  for (const expected of fixture.coreSelectionCases) {
    const actual = diagnostic.coreSelection.find(
      (item) => item.id === expected.id
    );
    if (
      actual?.referenceStart !== expected.expectedReferenceStart
      || actual?.referenceEnd !== expected.expectedReferenceEnd
      || JSON.stringify(actual.core80)
        !== JSON.stringify(expected.expectedCore80)
      || JSON.stringify(actual.core90)
        !== JSON.stringify(expected.expectedCore90)
      || (
        expected.expectedOrderedWorks
        && JSON.stringify(actual.orderedWorks)
          !== JSON.stringify(expected.expectedOrderedWorks)
      )
    ) {
      throw new Error(
        `m2_core_revenue_manual_core_fixture_failed:${expected.id}`
      );
    }
  }
  for (const expected of fixture.forecastCases) {
    const actual = diagnostic.forecasts.find(
      (item) => item.id === expected.id
    );
    if (actual?.status !== expected.expectedStatus) {
      throw new Error(
        `m2_core_revenue_manual_status_fixture_failed:${expected.id}`
      );
    }
    for (const [field, value] of Object.entries(
      expected.expected ?? {}
    )) {
      if (
        Math.abs(Number(actual[field]) - Number(value)) > 1e-9
        && actual[field] !== value
      ) {
        throw new Error(
          "m2_core_revenue_manual_forecast_fixture_failed:"
            + `${expected.id}:${field}`
        );
      }
    }
  }
  for (const expected of fixture.kFallbackCases) {
    const actual = diagnostic.kFallbacks.find(
      (item) => item.id === expected.id
    );
    if (
      actual?.k !== expected.expectedK
      || actual?.sourceLevel !== expected.expectedSource
      || actual?.supportCount !== expected.expectedSupportCount
    ) {
      throw new Error(
        `m2_core_revenue_manual_k_fixture_failed:${expected.id}`
      );
    }
  }
  const tail = fixture.tailConservationCase;
  if (
    diagnostic.tailConservation.coreCash !== tail.expectedCoreCash
    || diagnostic.tailConservation.tailCash !== tail.expectedTailCash
    || diagnostic.tailConservation.totalCash !== tail.expectedTotalCash
  ) {
    throw new Error(
      "m2_core_revenue_manual_tail_conservation_fixture_failed"
    );
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}
