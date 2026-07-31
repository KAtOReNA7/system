#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  addMonths,
  runHeadProtectedSegmentedRouter
} from "../../src/domain/m2Current/headProtectedSegmentedRouter.js";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);
const FIXTURE_PATH = path.join(
  ROOT,
  "test",
  "fixtures",
  "m2-head-protected-segmented-router.synthetic.v0.1.json"
);

export async function runHpsrSyntheticFixture({
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
  const input = Object.freeze({
    origin: fixture.origin,
    horizonMonths: fixture.horizonMonths,
    originVisibleMonthlyCashRows: monthlyRows,
    predictionRows,
    residualBoundState: fixture.residualBoundState,
    executionMode: "SYNTHETIC_FIXTURE"
  });
  const result = runHeadProtectedSegmentedRouter(input);
  assertFixtureExpectations(result, fixture.expected);
  const finiteExtremeRows = result.d1RawDiagnosticRows.filter(
    (row) => row.finiteExtreme
  );
  const finiteExtremeIsolated = finiteExtremeRows.every((diagnostic) => {
    const candidate = result.r1RawRouterRows.find(
      (row) => row.standardWorkId === diagnostic.standardWorkId
    );
    return (
      candidate?.boundTriggered === true
      && Number.isFinite(candidate.pointEstimate)
    );
  });
  const nonfiniteRows = result.d1RawDiagnosticRows.filter(
    (row) => !row.rawPredictionFinite
  );
  const nonfiniteRawFallbackToLg01 = nonfiniteRows.every((diagnostic) => {
    const candidate = result.r1RawRouterRows.find(
      (row) => row.standardWorkId === diagnostic.standardWorkId
    );
    const baseline = result.r0Rows.find(
      (row) => row.standardWorkId === diagnostic.standardWorkId
    );
    return (
      candidate?.fallbackToLg01 === true
      && candidate?.pointEstimate === baseline?.pointEstimate
    );
  });
  const summary = Object.freeze({
    schema:
      "m2.current.head_protected_segmented_router."
        + "synthetic_validation_stdout.v0.1",
    status: "PUBLIC_SYNTHETIC_ROUTER_VALIDATED",
    experimentId: result.experimentId,
    modelId: result.modelId,
    origin: result.origin,
    horizonMonths: result.horizonMonths,
    syntheticOnly: true,
    privateDataAccessed: false,
    dynamicCore80WorkCount: result.coverage.dynamicCore80WorkCount,
    core80CutoffTieCount: result.population.core80CutoffTieCount,
    bandCounts: result.population.bandCounts,
    H50RowwiseExactLg01: result.invariants.H50RowwiseExactLg01,
    H50FallbackRowCount: result.coverage.H50FallbackRowCount,
    M30Alpha: result.invariants.M30Alpha,
    L20Alpha: result.invariants.L20Alpha,
    globalAlphaDependency: result.invariants.globalAlphaDependency,
    otherBandDependency: result.invariants.otherBandDependency,
    correctedRowCount: result.coverage.correctedRowCount,
    numericFallbackRowCount: result.coverage.numericFallbackRowCount,
    boundTriggeredRowCount: result.coverage.boundTriggeredRowCount,
    rawB3FiniteExtremeRowCount:
      result.coverage.rawB3FiniteExtremeRowCount,
    rawB3NonfiniteRowCount:
      result.coverage.rawB3NonfiniteRowCount,
    finiteExtremeIsolated,
    nonfiniteRawFallbackToLg01,
    allFinalR1PredictionsFinite:
      result.invariants.allFinalR1PredictionsFinite,
    rawB3AndR1StoredSeparately:
      result.invariants.rawB3AndR1StoredSeparately,
    newLaterOriginFutureActualRead: false,
    realScoreProduced: false,
    realBootstrapExecuted: false,
    productionSurfaceChanged: false
  });
  if (
    !summary.finiteExtremeIsolated
    || !summary.nonfiniteRawFallbackToLg01
  ) {
    throw new Error("hpsr_synthetic_numeric_isolation_failed");
  }
  return Object.freeze({ fixture, input, result, summary });
}

function validateFixture(value) {
  if (
    value?.schema
      !== "m2.current.head_protected_segmented_router."
        + "synthetic_fixture.v0.1"
    || value?.syntheticOnly !== true
    || value?.realDataAccessAllowed !== false
    || value?.horizonMonths !== 3
    || value?.historyMonthCount !== 12
    || !Array.isArray(value?.works)
    || value.works.length === 0
    || value.works.some((row) => (
      !String(row?.standardWorkId ?? "").startsWith("SYN-HPSR-")
      || !Number.isFinite(row?.monthlySalesShareCash)
      || !Number.isFinite(row?.lg01Prediction)
    ))
  ) {
    throw new Error("hpsr_synthetic_fixture_invalid");
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
    result.coverage.H50FallbackRowCount
      === expected.H50FallbackRowCount,
    result.coverage.correctedRowCount
      === expected.correctedRowCount,
    result.coverage.numericFallbackRowCount
      === expected.numericFallbackRowCount,
    result.coverage.boundTriggeredRowCount
      === expected.boundTriggeredRowCount,
    result.coverage.rawB3FiniteExtremeRowCount
      === expected.rawB3FiniteExtremeRowCount,
    result.coverage.rawB3NonfiniteRowCount
      === expected.rawB3NonfiniteRowCount
  ];
  if (!checks.every(Boolean)) {
    throw new Error("hpsr_synthetic_fixture_expectation_mismatch");
  }
}

async function main() {
  if (!process.argv.includes("--verify")) {
    throw new Error("hpsr_synthetic_mode_required_use_verify");
  }
  const { summary } = await runHpsrSyntheticFixture();
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}

if (
  process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    process.stderr.write(`[M2_HPSR_SYNTHETIC_ERROR] ${error.message}\n`);
    process.exitCode = 1;
  });
}
