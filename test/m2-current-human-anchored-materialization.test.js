import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

test("human-anchored materializer separates signed cash and excludes target work from peer trend", () => {
  const output = execFileSync(
    process.execPath,
    [
      "scripts/run-codex-python.mjs",
      "scripts/m2-current/materialize_human_anchored_cases.py",
      "--fixture-self-test"
    ],
    { encoding: "utf8", windowsHide: true }
  );
  const result = JSON.parse(output);

  assert.deepEqual(result, {
    netCashConserved: true,
    peerTrendExcludesTargetWork: true,
    signedCashSeparatedBeforeAggregation: true
  });
});
