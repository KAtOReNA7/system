import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  fitM2CurrentTsbProcess
} from "../src/domain/m2Current/baselines.js";
import {
  buildM2HumanAnchoredTsbParameterGrid,
  buildM2HumanAnchoredTsbSyntheticDiagnostic,
  forecastM2HumanAnchoredTsbComponents
} from "../src/domain/m2Current/humanAnchoredTsb.js";

const config = JSON.parse(readFileSync(
  new URL(
    "../config/m2-current-human-anchored-tsb-occurrence.v0.1.json",
    import.meta.url
  ),
  "utf8"
));
const fixture = JSON.parse(readFileSync(
  new URL(
    "./fixtures/m2-current-human-anchored-tsb-occurrence.synthetic.v0.1.json",
    import.meta.url
  ),
  "utf8"
));

test("canonical TSB updates occurrence on zero months only", () => {
  const first = fitM2CurrentTsbProcess([100], {
    occurrenceSmoothing: 0.1,
    positiveAmountSmoothing: 0.1
  });
  const zeros = fitM2CurrentTsbProcess([100, 0, 0], {
    occurrenceSmoothing: 0.1,
    positiveAmountSmoothing: 0.1
  });

  assert.ok(zeros.occurrenceProbability < first.occurrenceProbability);
  assert.equal(zeros.positiveAmountLevel, first.positiveAmountLevel);
  assert.equal(zeros.positiveMonthCount, 1);
  assert.equal(zeros.observedMonthCount, 3);
});

test("TSB challenger keeps the preregistered 27-choice grid", () => {
  const grid = buildM2HumanAnchoredTsbParameterGrid(config);

  assert.equal(grid.length, 27);
  assert.deepEqual(
    [...new Set(grid.map((row) => row.occurrenceSmoothing))],
    [0.05, 0.1, 0.2]
  );
  assert.deepEqual(
    [...new Set(grid.map((row) => row.positiveAmountSmoothing))],
    [0.05, 0.1, 0.2]
  );
  assert.deepEqual(
    [...new Set(grid.map((row) => row.lambda))],
    [0, 0.25, 0.5]
  );
});

test("lambda zero exactly restores the common-reversal learnedGlobal", () => {
  const row = fixture.cases[1];
  const result = forecastM2HumanAnchoredTsbComponents(row, {
    learnedGlobalPositive: row.learnedGlobalPositive,
    reversalRate: row.reversalRate,
    parameters: {
      occurrenceSmoothing: 0.1,
      positiveAmountSmoothing: 0.1,
      lambda: 0
    }
  });

  assert.equal(
    result.blendNetPointEstimate,
    result.learnedGlobalNetPointEstimate
  );
});

test("negative reversals never enter the positive TSB state", () => {
  const row = fixture.cases[0];
  const left = forecastM2HumanAnchoredTsbComponents(row, {
    learnedGlobalPositive: row.learnedGlobalPositive,
    reversalRate: row.reversalRate,
    parameters: {
      occurrenceSmoothing: 0.1,
      positiveAmountSmoothing: 0.1,
      lambda: 0.5
    }
  });
  const right = forecastM2HumanAnchoredTsbComponents({
    ...row,
    salesShareMonthlyHistory: {
      ...row.salesShareMonthlyHistory,
      reversalSeries: row.salesShareMonthlyHistory.reversalSeries.map(
        (value) => value + 10000
      )
    }
  }, {
    learnedGlobalPositive: row.learnedGlobalPositive,
    reversalRate: row.reversalRate,
    parameters: {
      occurrenceSmoothing: 0.1,
      positiveAmountSmoothing: 0.1,
      lambda: 0.5
    }
  });

  assert.equal(
    left.rawTsbPositivePointEstimate,
    right.rawTsbPositivePointEstimate
  );
});

test("unobserved history cannot be zero-filled into the challenger", () => {
  assert.throws(
    () => forecastM2HumanAnchoredTsbComponents({
      ...fixture.cases[0],
      salesShareMonthlyHistory: {
        ...fixture.cases[0].salesShareMonthlyHistory,
        positiveSeries: [],
        reversalSeries: []
      }
    }, {
      learnedGlobalPositive: 10,
      reversalRate: 0,
      parameters: {
        occurrenceSmoothing: 0.1,
        positiveAmountSmoothing: 0.1,
        lambda: 0.5
      }
    }),
    /monthly_history_invalid/u
  );
});

test("public synthetic diagnostic is private-independent and sealed", () => {
  const diagnostic = buildM2HumanAnchoredTsbSyntheticDiagnostic(
    fixture,
    config
  );

  assert.equal(diagnostic.privateCapabilityUsed, false);
  assert.equal(diagnostic.parameterGridCount, 27);
  assert.equal(
    Object.values(diagnostic.checks).every(Boolean),
    true
  );
  assert.equal(diagnostic.boundaries.frozenV10Modified, false);
  assert.equal(diagnostic.boundaries.independentLaterOriginOpened, false);
  assert.equal(diagnostic.boundaries.finalHoldoutOpened, false);
  assert.equal(diagnostic.boundaries.currentDecision, "CANARY_FAIL");
  assert.equal(
    diagnostic.boundaries.automationDecision,
    "AUTOMATION_BLOCKED"
  );
});
