import assert from "node:assert/strict";
import test from "node:test";
import { runPythonCommand } from "../scripts/run-codex-python.mjs";

test("local workspace preparation validates synthetic authority, cash coverage and atomic failure boundaries", () => {
  const result = runPythonCommand(["test/fixtures/workspace_snapshot_test.py"], {
    stdio: "pipe",
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1", PYTHONIOENCODING: "utf-8" }
  });
  assert.equal(result.status, 0, [result.stdout, result.stderr].filter(Boolean).join("\n"));
  assert.match(result.stderr.toString(), /Ran 10 tests/);
  assert.match(result.stderr.toString(), /OK/);
});
