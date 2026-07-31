#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  addMonths
} from "../../src/domain/m2Current/headProtectedSegmentedRouter.js";
import {
  runHeadProtectedTailBandCorrection
} from "../../src/domain/m2Current/headProtectedTailBandCorrection.js";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);
const FIXTURE_PATH = path.join(
  ROOT,
  "test",
  "fixtures",
  "m2-head-protected-tail-band-correction.synthetic.v0.2.json"
);

export async function runHpsr02SyntheticFixture({
  fixturePath = FIXTURE_PATH
} = {}) {
  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  validateFixture(fixture);
  const historyMonths = Array.from(
    { length: fixture.historyMonthCount },
    (_, index) => addMonths(
      fixture.origin,
      index - fixture.historyMonthCount + 1
    )
  );
  const monthlyRows = fixture.works.flatMap((work) => (
    historyMonths.map((month) => ({
      standardWorkId: work.standardWorkId,
      channelUid: fixture.syntheticChannelUid,
      month,
      cash: work.monthlySalesShareCash,
      settlementMechanism: "rights_or_license_settlement"
    }))
  ));
  const predictionRows = fixture.works.map((work) => ({
    standardWorkId: work.standardWorkId,
    origin: fixture.origin,
    horizonMonths: fixture.horizonMonths,
    lg01Prediction: work.lg01Prediction,
    cham01B3Prediction: work.cham01B3Prediction,
    cham01Diagnostics: work.cham01Diagnostics
  }));
  const result = runHeadProtectedTailBandCorrection({
    origin: fixture.origin,
    horizonMonths: fixture.horizonMonths,
    originVisibleMonthlyCashRows: monthlyRows,
    predictionRows,
    residualBoundState: fixture.residualBoundState,
    executionMode: "SYNTHETIC_FIXTURE"
  });
  assertFixtureExpectations(result, fixture.expected);
  const l20Rows = result.r2Rows.filter(
    (row) => row.cashBandId === "L20"
  );
  const finiteExtremeClipIsFinite = l20Rows
    .filter((row) => row.finiteExtreme)
    .every((row) => (
      row.boundTriggered === true
      && Number.isFinite(row.pointEstimate)
    ));
  const nonfiniteL20FallbackToLg01 = l20Rows
    .filter((row) => row.rawPredictionFinite === false)
    .every((row) => {
      const baseline = result.r0Rows.find(
        (candidate) => candidate.standardWorkId === row.standardWorkId
      );
      return (
        row.fallbackToLg01 === true
        && row.pointEstimate === baseline?.pointEstimate
      );
    });
  const globalAlphaFieldCount = result.r2Rows.filter(
    (row) => Object.hasOwn(row, "globalAlpha")
  ).length;
  const summary = Object.freeze({
    schema:
      "m2.current.head_protected_tail_band_correction."
        + "synthetic_validation_stdout.v0.2",
    status: result.status,
    experimentId: result.experimentId,
    modelId: result.modelId,
    origin: result.origin,
    horizonMonths: result.horizonMonths,
    syntheticOnly: true,
    privateDataAccessed: false,
    dynamicCore80WorkCount: result.coverage.dynamicCore80WorkCount,
    core80CutoffTieCount: result.population.core80CutoffTieCount,
    bandCounts: result.population.bandCounts,
    H50M30RowwiseExactLg01:
      result.invariants.H50M30RowwiseExactLg01,
    protectedH50M30RowCount:
      result.coverage.protectedH50M30RowCount,
    correctedL20RowCount: result.coverage.correctedL20RowCount,
    numericFallbackL20RowCount:
      result.coverage.numericFallbackL20RowCount,
    boundTriggeredL20RowCount:
      result.coverage.boundTriggeredL20RowCount,
    finiteExtremeL20RowCount:
      result.coverage.finiteExtremeL20RowCount,
    nonfiniteRawL20RowCount:
      result.coverage.nonfiniteRawL20RowCount,
    finiteExtremeClipIsFinite,
    nonfiniteL20FallbackToLg01,
    L20Alpha: result.invariants.L20Alpha,
    globalAlphaFieldCount,
    globalAlphaDependency:
      result.invariants.globalAlphaDependency,
    crossBandDependency:
      result.invariants.crossBandDependency,
    actualConsumed: result.invariants.outcomeFieldsConsumed,
    realScoreProduced: result.invariants.scoreComputed,
    realBootstrapExecuted: result.invariants.bootstrapExecuted,
    productionSurfaceChanged:
      result.invariants.productionSurfaceChanged
  });
  if (
    summary.H50M30RowwiseExactLg01 !== true
    || summary.finiteExtremeClipIsFinite !== true
    || summary.nonfiniteL20FallbackToLg01 !== true
    || summary.globalAlphaFieldCount !== 0
    || summary.globalAlphaDependency !== false
    || summary.crossBandDependency !== false
    || summary.actualConsumed !== false
    || summary.privateDataAccessed !== false
    || summary.realScoreProduced !== false
    || summary.realBootstrapExecuted !== false
    || summary.productionSurfaceChanged !== false
  ) {
    throw new Error("hpsr02_synthetic_invariant_failed");
  }
  return Object.freeze({ fixture, result, summary });
}

function validateFixture(value) {
  if (
    value?.schema
      !== "m2.current.head_protected_tail_band_correction."
        + "synthetic_fixture.v0.2"
    || value?.syntheticOnly !== true
    || value?.realDataAccessAllowed !== false
    || value?.horizonMonths !== 3
    || value?.historyMonthCount !== 12
    || !Array.isArray(value?.works)
    || value.works.length === 0
    || value.works.some((row) => (
      !String(row?.standardWorkId ?? "").startsWith("SYN-HPSR02-")
      || !Number.isFinite(row?.monthlySalesShareCash)
      || !Number.isFinite(row?.lg01Prediction)
    ))
  ) {
    throw new Error("hpsr02_synthetic_fixture_invalid");
  }
}

function assertFixtureExpectations(result, expected) {
  const bandWorkIds = Object.fromEntries(["H50", "M30", "L20"].map(
    (bandId) => [
      bandId,
      result.population.cashBandRows
        .filter((row) => row.bandId === bandId)
        .map((row) => row.standardWorkId)
    ]
  ));
  const checks = [
    result.population.core80WorkCount === expected.core80WorkCount,
    result.population.core80CutoffTieCount
      === expected.core80CutoffTieCount,
    JSON.stringify(bandWorkIds.H50)
      === JSON.stringify(expected.H50WorkIds),
    JSON.stringify(bandWorkIds.M30)
      === JSON.stringify(expected.M30WorkIds),
    JSON.stringify(bandWorkIds.L20)
      === JSON.stringify(expected.L20WorkIds),
    result.coverage.protectedH50M30RowCount
      === expected.protectedH50M30RowCount,
    result.coverage.correctedL20RowCount
      === expected.correctedL20RowCount,
    result.coverage.numericFallbackL20RowCount
      === expected.numericFallbackL20RowCount,
    result.coverage.boundTriggeredL20RowCount
      === expected.boundTriggeredL20RowCount,
    result.coverage.finiteExtremeL20RowCount
      === expected.finiteExtremeL20RowCount,
    result.coverage.nonfiniteRawL20RowCount
      === expected.nonfiniteRawL20RowCount
  ];
  if (!checks.every(Boolean)) {
    throw new Error("hpsr02_synthetic_fixture_expectation_mismatch");
  }
}

async function main() {
  if (!process.argv.includes("--verify")) {
    throw new Error("hpsr02_synthetic_mode_required_use_verify");
  }
  const { summary } = await runHpsr02SyntheticFixture();
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}

if (
  process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    process.stderr.write(
      `[M2_HPSR02_SYNTHETIC_ERROR] ${error.message}\n`
    );
    process.exitCode = 1;
  });
}
