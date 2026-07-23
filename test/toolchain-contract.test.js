import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  classifyTrackedTests,
  filesForTestProfile,
  listProjectJavaScriptFiles,
  listTrackedJavaScriptFiles
} from "../tools/node/project-inventory.mjs";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

test("syntax inventory covers every tracked and nonignored JS/MJS file", () => {
  const tracked = listTrackedJavaScriptFiles();
  const project = listProjectJavaScriptFiles();

  assert.ok(tracked.length >= 339);
  assert.ok(project.length >= tracked.length);
  assert.deepEqual(
    tracked.filter((path) => !project.includes(path)),
    []
  );
  assert.ok(project.includes("scripts/m2-v2-evidence-pilot/run_m2_v2_b8.mjs"));
  assert.ok(project.includes("tools/m1-master-data-analysis/build_ops_confirmation_workbook.mjs"));
  assert.ok(project.includes("tools/node/check-syntax.mjs"));
});

test("test registry classifies every test exactly once", () => {
  const classified = classifyTrackedTests();
  const invalid = classified.classifications.filter(
    (entry) => entry.matches.length !== 1
  );

  assert.deepEqual(invalid, []);
  assert.ok(classified.trackedTests.length >= 150);
  for (const suiteId of [
    "unit",
    "current-contract",
    "archive",
    "private",
    "e2e"
  ]) {
    assert.ok(classified.suites.get(suiteId).length > 0, suiteId);
  }
});

test("default test profile covers every non-E2E test without duplicates", () => {
  const classified = classifyTrackedTests();
  const selection = filesForTestProfile("default");
  const expected = classified.trackedTests.filter(
    (path) => !path.startsWith("test/e2e/")
  );

  assert.deepEqual(selection.files, expected);
  assert.equal(new Set(selection.files).size, selection.files.length);
  assert.equal(selection.concurrency, 4);
});

test("package scripts use distinct lint/build contracts and registry test entrypoints", () => {
  const packageJson = readJson("package.json");

  assert.notEqual(packageJson.scripts.lint, packageJson.scripts.build);
  assert.match(packageJson.scripts.lint, /check-package-scripts\.mjs/);
  assert.match(packageJson.scripts.build, /check-build\.mjs/);
  assert.equal(
    packageJson.scripts.test,
    "node tools/node/run-test-registry.mjs default"
  );
  assert.doesNotMatch(packageJson.scripts.test, /\.test\.js/);
  for (const profile of [
    "unit",
    "current-contract",
    "archive",
    "private",
    "e2e"
  ]) {
    assert.match(
      packageJson.scripts[`test:${profile}`],
      new RegExp(`run-test-registry\\.mjs ${profile}$`)
    );
  }
});

test("all package Python commands use the repository launcher", () => {
  const packageJson = readJson("package.json");
  const directPython = Object.entries(packageJson.scripts).filter(([, command]) =>
    /^\s*(?:python|python3|py)(?:\s|$)/i.test(command)
  );
  const pythonTargets = Object.entries(packageJson.scripts).filter(([, command]) =>
    /\.py(?:\s|$)/.test(command)
  );

  assert.deepEqual(directPython, []);
  assert.ok(pythonTargets.length > 0);
  for (const [name, command] of pythonTargets) {
    assert.match(
      command,
      /^node scripts\/run-codex-python\.mjs /,
      name
    );
  }
});

test("Node, Python and CI analysis dependencies are explicitly pinned", () => {
  const packageJson = readJson("package.json");
  const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
  const requirements = readFileSync("requirements-ci.txt", "utf8")
    .trim()
    .split(/\r?\n/);

  assert.equal(packageJson.engines.node, ">=24 <25");
  assert.match(packageJson.packageManager, /^npm@11\./);
  assert.equal(readFileSync(".nvmrc", "utf8").trim(), "24");
  assert.equal(readFileSync(".python-version", "utf8").trim(), "3.13");
  assert.deepEqual(requirements, [
    "numpy==2.5.1",
    "openpyxl==3.1.5",
    "pandas==3.0.3"
  ]);
  assert.match(workflow, /node-version: 24/g);
  assert.match(workflow, /python-version: "3\.13"/g);
  assert.equal(
    workflow.match(/-r requirements-ci\.txt/g)?.length,
    2
  );
});

test("build manifest imports public application composition without starting server", () => {
  const result = JSON.parse(
    execFileSync(
      process.execPath,
      ["tools/node/check-build.mjs", "--json"],
      { encoding: "utf8", windowsHide: true }
    )
  );

  assert.equal(result.status, "PASS");
  assert.equal(result.requiredTrackedFileCount, 8);
  assert.equal(result.importCheckCount, 3);
});
