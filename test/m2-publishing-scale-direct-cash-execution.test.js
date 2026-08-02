import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  assignM2Psc03CashBands,
  combineM2Psc03EvaluationFamilies,
  normalizedM2Psc03ChannelCompositionWape,
  pairedM2Psc03WholeWorkBootstrap,
  protectM2Psc03Aggregate,
  scoreM2Psc03CaseRows,
  selectM2Psc03OriginVisiblePopulation,
  verifyM2Psc03SameCaseComparator
} from "../src/domain/m2Current/publishingScaleDirectCashEvaluation.js";
import {
  runM2Psc03OrderedCampaign,
  runM2Psc03PublicDiagnostic
} from "../scripts/m2-current/publishing_scale_direct_cash_execution.mjs";

const root = path.resolve(".");

test("PSC03 campaign seals P before loading either comparator", async () => {
  const calls = [];
  const names = [
    "materialize",
    "joinOccurrence",
    "generateD0",
    "generateD1",
    "generateP",
    "correctnessGates",
    "sealPrimary",
    "loadComparators",
    "calculateMetrics",
    "bootstrap",
    "applyGates",
    "freezeDecision"
  ];
  const phases = Object.fromEntries(names.map((name) => [name, async () => {
    calls.push(name);
    return name === "freezeDecision" ? {publicResult: {status: "TEST"}} : name;
  }]));
  await runM2Psc03OrderedCampaign({phases});
  assert.deepEqual(calls, names);
  assert.ok(calls.indexOf("sealPrimary") < calls.indexOf("loadComparators"));
});

test("PSC03 failure injection cannot reach seal comparator evaluation or registry", async () => {
  const calls = [];
  const phases = {};
  for (const name of [
    "materialize", "joinOccurrence", "generateD0", "generateD1",
    "generateP", "correctnessGates", "sealPrimary", "loadComparators",
    "calculateMetrics", "bootstrap", "applyGates", "freezeDecision"
  ]) {
    phases[name] = async () => {
      calls.push(name);
      if (name === "generateP") throw new Error("injected_before_primary_result");
      return name;
    };
  }
  await assert.rejects(
    runM2Psc03OrderedCampaign({phases}),
    /injected_before_primary_result/u
  );
  assert.equal(calls.includes("sealPrimary"), false);
  assert.equal(calls.includes("loadComparators"), false);
  assert.equal(calls.includes("calculateMetrics"), false);
  assert.equal(calls.includes("freezeDecision"), false);
});

test("PSC03 public runner executes without private metadata or writes", async () => {
  const result = await runM2Psc03PublicDiagnostic({root});
  assert.equal(result.status, "PSC03_PUBLIC_SYNTHETIC_FULL_PATH_PASSED");
  assert.equal(result.boundaries.privateArtifactRead, false);
  assert.equal(result.armPredictionCounts.P.primary, 720);
});

test("PSC03 paired whole-work bootstrap is deterministic and paired", () => {
  const candidate = caseRows(0.8);
  const baseline = caseRows(1.4);
  const first = pairedM2Psc03WholeWorkBootstrap({
    candidateRows: candidate,
    baselineRows: baseline,
    seed: 20260728,
    iterations: 2000
  });
  const second = pairedM2Psc03WholeWorkBootstrap({
    candidateRows: candidate,
    baselineRows: baseline,
    seed: 20260728,
    iterations: 2000
  });
  assert.deepEqual(first, second);
  assert.equal(first.iterations, 2000);
  assert.ok(first.lower95 > 0);
  assert.equal(Object.hasOwn(first, "draws"), false);
  const privateValue = pairedM2Psc03WholeWorkBootstrap({
    candidateRows: candidate,
    baselineRows: baseline,
    seed: 20260728,
    iterations: 2000,
    includeDraws: true
  });
  assert.equal(privateValue.draws.length, 2000);
});

test("PSC03 comparator integrity rejects duplicate, missing and changed actual cases", () => {
  const candidate = caseRows(0.8);
  const baseline = caseRows(1.4);
  assert.equal(
    verifyM2Psc03SameCaseComparator({candidateRows: candidate, baselineRows: baseline})
      .sameCase,
    true
  );
  assert.throws(
    () => verifyM2Psc03SameCaseComparator({
      candidateRows: [...candidate, candidate[0]],
      baselineRows: baseline
    }),
    /comparator_candidate_duplicate/u
  );
  assert.throws(
    () => verifyM2Psc03SameCaseComparator({
      candidateRows: candidate,
      baselineRows: baseline.slice(1)
    }),
    /comparator_population_mismatch/u
  );
  assert.throws(
    () => verifyM2Psc03SameCaseComparator({
      candidateRows: candidate,
      baselineRows: baseline.map((row, index) => index === 0
        ? {...row, actual: row.actual + 1}
        : row)
    }),
    /comparator_actual_mismatch/u
  );
});

test("PSC03 population gates combine primary and strict horizons without overlap", () => {
  const primary = caseRows(0.8).filter((row) => row.horizonMonths === 3)
    .map((row) => ({...row, horizonMonths: 36, origin: "2021-12"}));
  const strict = caseRows(0.8);
  const combined = combineM2Psc03EvaluationFamilies(primary, strict);
  assert.deepEqual(
    [...new Set(combined.map((row) => row.horizonMonths))].sort((a, b) => a - b),
    [3, 6, 36]
  );
  assert.throws(
    () => combineM2Psc03EvaluationFamilies(primary, [primary[0]]),
    /family_case_overlap/u
  );
});

test("PSC03 normalized composition requires exact channel case coverage", () => {
  const base = [
    channelRow("W01", "C01", 60, 50),
    channelRow("W01", "C02", 40, 50)
  ];
  const value = normalizedM2Psc03ChannelCompositionWape({
    candidateChannelRows: base,
    baselineChannelRows: base.map((row) => ({...row, pointEstimate: row.actual}))
  });
  assert.equal(
    value.status,
    "POST_HOC_DIAGNOSTIC_NOT_MODEL_EVIDENCE_NOT_CANDIDATE_SCORE"
  );
  assert.throws(
    () => normalizedM2Psc03ChannelCompositionWape({
      candidateChannelRows: base,
      baselineChannelRows: [base[0], {...base[1], channelUid: "C03"}]
    }),
    /composition_channel_missing/u
  );
});

test("PSC03 aggregate privacy requires both 30 cases and 20 works", () => {
  const score = scoreM2Psc03CaseRows(caseRows(0.9).slice(0, 19));
  const protectedValue = protectM2Psc03Aggregate(score, {
    minimumCases: 30,
    minimumWorks: 20
  });
  assert.equal(protectedValue.status, "SUPPRESSED_PRIVACY_THRESHOLD");
  assert.equal(protectedValue.metrics, null);
});

test("PSC03 Core80 population and cash bands use only origin-visible cash", () => {
  const originWorkCash = new Map();
  const cases = [];
  for (let index = 0; index < 30; index += 1) {
    const work = `W${String(index).padStart(2, "0")}`;
    originWorkCash.set(`2022-01\u001f${work}`, 30 - index);
    cases.push({
      standardWorkId: work,
      origin: "2022-01",
      horizonMonths: 36,
      actual: 100 + index,
      pointEstimate: 90 + index
    });
  }
  const core80 = selectM2Psc03OriginVisiblePopulation({
    originWorkCash,
    fraction: 0.8
  });
  const bands = assignM2Psc03CashBands({cases, originWorkCash, core80});
  assert.ok(core80.selected.size < 30);
  assert.deepEqual(
    [...new Set(bands.map((row) => row.cashBandId))].sort(),
    ["H50", "L20", "M30"]
  );
});

test("PSC03 runner source contains no PSC02 ledger field dependency", async () => {
  const source = await readFile(
    path.join(root, "scripts/m2-current/publishing_scale_direct_cash_execution.mjs"),
    "utf8"
  );
  for (const field of ["componentId", "revisionId", "effectiveAt", "availableAt"]) {
    assert.doesNotMatch(source, new RegExp(`row\\.${field}`, "u"));
  }
  assert.match(source, /comparatorLoadedAfterPrimarySeal/u);
});

test("PSC03 runner reads target identity from the immutable scientific scope", async () => {
  const source = await readFile(
    path.join(root, "scripts/m2-current/publishing_scale_direct_cash_execution.mjs"),
    "utf8"
  );
  assert.doesNotMatch(source, /preregistration\.actualDefinitionId/u);
  assert.doesNotMatch(source, /preregistration\.target/u);
  assert.match(
    source,
    /preregistration\.immutableScientificScope\.actualDefinitionId/u
  );
  assert.match(source, /preregistration\.immutableScientificScope\.target/u);
});

function caseRows(multiplier) {
  const rows = [];
  for (let work = 0; work < 25; work += 1) {
    for (const horizonMonths of [3, 6]) {
      const actual = 100 + work * 5 + horizonMonths;
      rows.push({
        standardWorkId: `W${String(work).padStart(2, "0")}`,
        origin: "2022-01",
        horizonMonths,
        actual,
        pointEstimate: actual * multiplier
      });
    }
  }
  return rows;
}

function channelRow(standardWorkId, channelUid, actual, pointEstimate) {
  return {
    standardWorkId,
    channelUid,
    origin: "2022-01",
    horizonMonths: 36,
    actual,
    pointEstimate
  };
}
