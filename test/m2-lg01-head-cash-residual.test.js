import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  rm
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  assertM2Lg01HeadCashResidualPublicSafe,
  assignLg01HeadCashBands,
  buildResidualBoundState,
  quantileLinear,
  runLg01HeadCashResidualExperiment
} from "../src/domain/m2Current/lg01HeadCashResidual.js";
import {
  loadOrRebuildLg01HeadCashResidualInputCache
} from "../scripts/m2-current/lg01_head_cash_residual_mode.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(await readFile(path.join(
  root,
  "config",
  "m2-current-lg01-head-cash-residual.v0.1.json"
), "utf8"));

test("residual bounds use only finite earlier support and frozen quantiles", () => {
  const rows = [-1, -0.5, 0, 0.5, 1].map((residual, index) => ({
    origin: index < 3 ? "2022-01" : "2022-04",
    basePointEstimate: 100,
    rawPointEstimate: 100 + residual * 100
  }));
  rows.push({
    origin: "2022-04",
    basePointEstimate: 100,
    rawPointEstimate: Number.POSITIVE_INFINITY
  });

  const state = buildResidualBoundState(rows, config);

  assert.equal(state.valid, true);
  assert.equal(state.positiveBaseFloor, 100);
  assert.equal(state.lowerBound, quantileLinear(
    [-1, -0.5, 0, 0.5, 1],
    0.05
  ));
  assert.equal(state.upperBound, quantileLinear(
    [-1, -0.5, 0, 0.5, 1],
    0.95
  ));
  assert.equal(state.trainingRowCount, 5);
  assert.equal(state.trainingOriginCount, 2);
});

test("cash bands keep boundary works whole without a 50-work threshold", () => {
  const bands = assignLg01HeadCashBands([
    cashRow("WORK-A", 40),
    cashRow("WORK-B", 30),
    cashRow("WORK-C", 20),
    cashRow("WORK-D", 10)
  ], config);

  assert.deepEqual(
    bands.map((row) => [row.standardWorkId, row.bandId]),
    [
      ["WORK-A", "H50"],
      ["WORK-B", "H50"],
      ["WORK-C", "M30"],
      ["WORK-D", "L20"]
    ]
  );
  assert.equal(
    JSON.stringify(config.bandShrinkage).includes("minimumWorkCount"),
    false
  );
});

test("outer predictions are deterministic and cannot read their own outcome", () => {
  const rows = buildRows();
  const first = runLg01HeadCashResidualExperiment(rows, config);
  const reversed = runLg01HeadCashResidualExperiment(
    [...rows].reverse(),
    config
  );
  assert.deepEqual(first, reversed);

  const targetOrigin = "2023-07";
  const changed = runLg01HeadCashResidualExperiment(rows.map((row) => (
    row.origin === targetOrigin
      ? { ...row, actual: row.actual * 1000 }
      : row
  )), config);
  assert.deepEqual(
    outerPredictionView(first, targetOrigin),
    outerPredictionView(changed, targetOrigin)
  );
  assert.deepEqual(
    first.selections.filter((row) => row.outerOrigin === targetOrigin),
    changed.selections.filter((row) => row.outerOrigin === targetOrigin)
  );
});

test("nonfinite raw input falls back to C0 without hiding raw failure", () => {
  const rows = buildRows();
  const target = rows.find((row) => (
    row.origin === "2023-07"
    && row.standardWorkId === "WORK-001"
  ));
  target.rawPointEstimate = Number.POSITIVE_INFINITY;

  const result = runLg01HeadCashResidualExperiment(rows, config);
  const candidates = result.predictions.filter((row) => (
    row.origin === target.origin
    && row.standardWorkId === target.standardWorkId
    && ["C2", "C3"].includes(row.armId)
  ));

  assert.equal(candidates.length, 2);
  for (const row of candidates) {
    assert.equal(row.rawPointEstimate, null);
    assert.equal(row.selectedPointEstimate, row.basePointEstimate);
    assert.equal(row.selectedStatus, "FALLBACK_TO_C0");
    assert.match(row.rawNumericStatus, /^NUMERIC_STABILITY_FAIL/u);
    assert.equal(row.rawCandidatePreserved, true);
    assert.equal(row.selectedFallbackCannotCreatePass, true);
  }
  const candidateCell = result.evaluation.cells.find((cell) => (
    cell.evaluationFamily === "STRICT_ROLLING"
    && cell.populationId === "CORE80"
    && cell.armId === "C2"
  ));
  assert.ok(candidateCell.raw.numericFailureCount > 0);
  assert.equal(
    candidateCell.raw.numericStabilityStatus,
    "NUMERIC_STABILITY_FAIL"
  );
  assert.equal(candidateCell.selected.fallbackCount > 0, true);
});

test("missing input cache rebuilds once and then becomes a cache hit", async () => {
  const temporaryDirectory = await mkdtemp(path.join(
    os.tmpdir(),
    "m2-hcrc-unit-cache-"
  ));
  const cachePath = path.join(temporaryDirectory, "rows.ndjson");
  let rebuildCount = 0;
  try {
    const first = await loadOrRebuildLg01HeadCashResidualInputCache({
      cachePath,
      rebuild: async () => {
        rebuildCount += 1;
        return { inputRows: buildRows() };
      }
    });
    const second = await loadOrRebuildLg01HeadCashResidualInputCache({
      cachePath,
      rebuild: async () => {
        rebuildCount += 1;
        return { inputRows: [] };
      }
    });

    assert.equal(first.cacheStatus, "CACHE_MISS_REBUILT");
    assert.equal(second.cacheStatus, "CACHE_HIT");
    assert.equal(rebuildCount, 1);
    assert.deepEqual(first.inputRows, second.inputRows);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("public guard rejects private work identities and machine paths", () => {
  assert.throws(
    () => assertM2Lg01HeadCashResidualPublicSafe({
      standardWorkId: "PRIVATE-WORK"
    }),
    /hcrc_public_payload_unsafe/u
  );
  assert.throws(
    () => assertM2Lg01HeadCashResidualPublicSafe({
      source: "C:\\Users\\private\\input.ndjson"
    }),
    /hcrc_public_payload_unsafe/u
  );
  assert.equal(
    assertM2Lg01HeadCashResidualPublicSafe({
      caseCount: 80,
      workCount: 30
    }),
    true
  );
});

test("canonical dispatcher, lifecycle and dual-platform CI expose K1 gates", async () => {
  const [packageJson, lifecycle, dispatcher, workflow] =
    await Promise.all([
      readFile(path.join(root, "package.json"), "utf8").then(JSON.parse),
      readFile(path.join(
        root,
        "config",
        "command-lifecycle.v0.1.json"
      ), "utf8").then(JSON.parse),
      readFile(path.join(
        root,
        "scripts",
        "m2-current",
        "run_m2_human_anchored_development.mjs"
      ), "utf8"),
      readFile(path.join(
        root,
        ".github",
        "workflows",
        "ci.yml"
      ), "utf8")
    ]);

  assert.match(
    packageJson.scripts["develop:m2:current:lg01-head-cash-residual"],
    /--lg01-head-cash-residual$/u
  );
  assert.ok(lifecycle.currentPublicCommands.includes(
    "diagnose:m2:lg01-head-cash-residual"
  ));
  assert.ok(lifecycle.currentPublicCommands.includes(
    "smoke:m2:current:lg01-head-cash-residual"
  ));
  assert.match(dispatcher, /--lg01-head-cash-residual-public/u);
  assert.match(dispatcher, /--lg01-head-cash-residual-synthetic/u);
  assert.equal(
    workflow.match(
      /npm run smoke:m2:current:lg01-head-cash-residual/gu
    )?.length,
    2
  );
});

function cashRow(standardWorkId, trailing12Cash) {
  return {
    standardWorkId,
    origin: "2024-01",
    trailing12Cash
  };
}

function buildRows() {
  const origins = [
    "2022-01",
    "2022-04",
    "2022-07",
    "2022-10",
    "2023-01",
    "2023-04",
    "2023-07"
  ];
  const rows = [];
  for (let originIndex = 0; originIndex < origins.length; originIndex += 1) {
    const origin = origins[originIndex];
    for (let workIndex = 0; workIndex < 6; workIndex += 1) {
      const base = 1000 + (6 - workIndex) * 100 + originIndex * 10;
      const actual = base * (1.08 + workIndex * 0.002);
      rows.push({
        evaluationFamily: "STRICT_ROLLING",
        populationId: "CORE80",
        standardWorkId: `WORK-${String(workIndex + 1).padStart(3, "0")}`,
        origin,
        horizonMonths: 3,
        actual,
        basePointEstimate: base,
        rawPointEstimate: base + (actual - base) * 0.9,
        trailing12Cash: (6 - workIndex) ** 2 * 100,
        labelAvailableAsOf: addMonths(origin, 3),
        originVisibleOnly: true
      });
    }
  }
  return rows;
}

function outerPredictionView(result, origin) {
  return result.predictions.filter((row) => row.origin === origin).map(
    (row) => ({
      armId: row.armId,
      standardWorkId: row.standardWorkId,
      rawPointEstimate: row.rawPointEstimate,
      selectedPointEstimate: row.selectedPointEstimate,
      alpha: row.alpha,
      rawNumericStatus: row.rawNumericStatus,
      selectedStatus: row.selectedStatus
    })
  );
}

function addMonths(month, delta) {
  const [year, value] = month.split("-").map(Number);
  const serial = year * 12 + value - 1 + delta;
  return `${Math.floor(serial / 12)}-${String(
    serial % 12 + 1
  ).padStart(2, "0")}`;
}
