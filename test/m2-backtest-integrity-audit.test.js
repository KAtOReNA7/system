import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

test("v1.1 backtest integrity audit self-test is no-real-data and validates cutoff safeguards", () => {
  const output = execFileSync(
    process.execPath,
    [
      "scripts/run-codex-python.mjs",
      "scripts/m2-real-data/run_m2_v1_1_backtest_integrity_audit.py",
      "--fixture-self-test",
    ],
    { encoding: "utf8" },
  );
  const result = JSON.parse(output);

  assert.equal(result.fixtureSelfTest, true);
  assert.equal(result.checks.featuresUseCutoffOrEarlierOnly, true);
  assert.equal(result.checks.actualUsesCutoffFutureWindowOnly, true);
  assert.equal(result.checks.incompleteMonthsExcluded, true);
  assert.equal(result.checks.baselineUsesSameHistoryAndCutoff, true);
  assert.equal(result.checks.v11IntervalUsesRollingPriorResiduals, true);
});
