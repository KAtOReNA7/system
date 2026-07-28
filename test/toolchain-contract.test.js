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
import {
  buildCompatiblePythonCandidates,
  resolveCompatiblePython
} from "../scripts/resolve-compatible-python.mjs";
import { resolveDoctorPython } from "../scripts/check-development-capability.mjs";
import {
  resolveRunnerPython,
  runPythonCommand
} from "../scripts/run-codex-python.mjs";

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
    "historical-m2",
    "archive",
    "private",
    "e2e"
  ]) {
    assert.ok(classified.suites.get(suiteId).length > 0, suiteId);
  }
});

test("default test profile excludes historical M2 and E2E tests", () => {
  const classified = classifyTrackedTests();
  const selection = filesForTestProfile("default");
  const excluded = new Set([
    ...classified.suites.get("historical-m2"),
    ...classified.suites.get("archive"),
    ...classified.suites.get("e2e")
  ]);
  const expected = classified.trackedTests
    .filter((path) => !excluded.has(path));

  assert.deepEqual(selection.files, expected);
  assert.equal(new Set(selection.files).size, selection.files.length);
  assert.equal(selection.concurrency, 4);
});

test("package scripts use distinct lint/build contracts and registry test entrypoints", () => {
  const packageJson = readJson("package.json");

  assert.notEqual(packageJson.scripts.lint, packageJson.scripts.build);
  assert.match(packageJson.scripts.lint, /check-package-scripts\.mjs/);
  assert.match(packageJson.scripts.lint, /check-command-lifecycle\.mjs/);
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
  assert.equal(
    packageJson.scripts["test:m2-historical"],
    "node tools/node/run-test-registry.mjs historical-m2"
  );
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
  const capabilityCatalog = readJson("config/development-capability-catalog.v0.1.json");
  const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
  const requirements = readFileSync("requirements-ci.txt", "utf8")
    .trim()
    .split(/\r?\n/);

  assert.equal(packageJson.engines.node, ">=24 <25");
  assert.equal(packageJson.packageManager, "npm@11.13.0");
  const coreCapability = capabilityCatalog.capabilities.find(({ id }) => id === "core-dev");
  const nodeTool = coreCapability.requiredTools.find(({ id }) => id === "node");
  const npmTool = coreCapability.requiredTools.find(({ id }) => id === "npm");
  assert.equal(nodeTool.minimumMajor, 24);
  assert.equal(nodeTool.maximumMajor, 24);
  assert.equal(npmTool.exactVersion, "11.13.0");
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
    workflow.match(/npm install --global npm@11\.13\.0/g)?.length,
    2
  );
  assert.equal(
    workflow.match(/npm run doctor:dev/g)?.length,
    2
  );
  assert.equal(
    workflow.match(/npm run smoke:portable-start/g)?.length,
    2
  );
  assert.equal(
    workflow.match(/npm run verify:m2:current/g)?.length,
    2
  );
  assert.equal(
    workflow.match(/-r requirements-ci\.txt/g)?.length,
    2
  );
  const attributes = readFileSync(".gitattributes", "utf8");
  for (const rule of [
    "*.js text eol=lf",
    "*.mjs text eol=lf",
    "*.json text eol=lf",
    "*.py text eol=lf",
    "*.yml text eol=lf",
    "*.ps1 text eol=lf",
  ]) {
    const escapedRule = rule.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(attributes, new RegExp(`^${escapedRule}$`, "m"));
  }
});

test("package command lifecycle separates current, archive, and restricted entrypoints", () => {
  const result = JSON.parse(
    execFileSync(
      process.execPath,
      ["tools/node/check-command-lifecycle.mjs", "--json"],
      { encoding: "utf8", windowsHide: true }
    )
  );

  assert.equal(result.status, "PASS");
  assert.equal(result.scriptCount, result.classifiedCount);
  assert.ok(result.counts["current-public"] >= 20);
  assert.ok(result.counts["archive-only"] > result.counts["current-public"]);
  assert.ok(result.counts["restricted-local"] > 0);
  assert.equal(result.counts["history-dispatcher"], 1);
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

function successfulPythonProbe(executable, {
  major = 3,
  minor = 13,
  patch = 14
} = {}) {
  return {
    status: 0,
    stdout: `${JSON.stringify({ major, minor, patch, executable })}\n`,
    stderr: "",
    error: null
  };
}

test("compatible Python resolver treats an explicit path with spaces as one executable", () => {
  const explicit = "C:\\Program Files\\Python313\\python.exe";
  const calls = [];
  const resolution = resolveCompatiblePython({
    env: { KATORENA7_PYTHON: explicit },
    platform: "win32",
    pathExists: () => false,
    spawnSyncImpl(executable, args, options) {
      calls.push({ executable, args, options });
      return successfulPythonProbe(executable);
    }
  });

  assert.equal(resolution.status, "READY");
  assert.equal(resolution.executable, explicit);
  assert.equal(resolution.source, "KATORENA7_PYTHON");
  assert.equal(calls[0].executable, explicit);
  assert.equal(calls[0].args[0], "-c");
  assert.equal(calls[0].options.shell, false);
});

test("compatible Python resolver supports Windows py -3.13 without shell parsing", () => {
  const candidates = buildCompatiblePythonCandidates({
    env: {},
    platform: "win32",
    pathExists: () => false
  });
  const calls = [];
  const resolution = resolveCompatiblePython({
    candidates,
    spawnSyncImpl(executable, args, options) {
      calls.push({ executable, args, options });
      if (executable === "py" && args[0] === "-3.13") {
        return successfulPythonProbe("C:\\Python313\\python.exe");
      }
      return { status: 1, stdout: "", stderr: "", error: null };
    }
  });

  assert.equal(resolution.status, "READY");
  assert.equal(resolution.source, "windows_py_3_13");
  assert.equal(resolution.executable, "C:\\Python313\\python.exe");
  assert.deepEqual(calls[0].args.slice(0, 2), ["-3.13", "-c"]);
  assert.equal(calls[0].options.shell, false);
});

test("compatible Python resolver blocks when every present candidate is Python 3.14", () => {
  const resolution = resolveCompatiblePython({
    candidates: [
      { executable: "python", argsPrefix: [], source: "verified_python" }
    ],
    spawnSyncImpl(executable) {
      return successfulPythonProbe(executable, { minor: 14, patch: 5 });
    }
  });

  assert.equal(resolution.compatible, false);
  assert.equal(resolution.status, "BLOCKED_MISSING_OR_INCOMPATIBLE_PYTHON");
  assert.match(resolution.attempts[0].reason, /UNSUPPORTED_PYTHON_VERSION_3\.14\.5/);
});

test("compatible Python resolver skips an incompatible candidate and selects a later compatible one", () => {
  const resolution = resolveCompatiblePython({
    candidates: [
      { executable: "python-first", argsPrefix: [], source: "first" },
      { executable: "python-second", argsPrefix: [], source: "second" }
    ],
    spawnSyncImpl(executable) {
      return executable === "python-first"
        ? successfulPythonProbe(executable, { minor: 14, patch: 1 })
        : successfulPythonProbe(executable, { minor: 12, patch: 9 });
    }
  });

  assert.equal(resolution.status, "READY");
  assert.equal(resolution.source, "second");
  assert.equal(resolution.version, "3.12.9");
  assert.equal(resolution.attempts.length, 2);
});

test("compatible Python resolver reports a safe block when every candidate is missing", () => {
  const resolution = resolveCompatiblePython({
    candidates: [
      { executable: "missing-a", argsPrefix: [], source: "a" },
      { executable: "missing-b", argsPrefix: [], source: "b" }
    ],
    spawnSyncImpl() {
      return {
        status: null,
        stdout: "",
        stderr: "",
        error: Object.assign(new Error("missing"), { code: "ENOENT" })
      };
    }
  });

  assert.equal(resolution.compatible, false);
  assert.equal(resolution.attempts.length, 2);
  assert.deepEqual(resolution.attempts.map(({ reason }) => reason), ["ENOENT", "ENOENT"]);
});

test("doctor and Python runner share the same compatible interpreter resolution", () => {
  const options = {
    candidates: [
      { executable: "python-shared", argsPrefix: [], source: "shared-test" }
    ],
    spawnSyncImpl() {
      return successfulPythonProbe("C:\\Shared Python\\python.exe");
    }
  };
  const doctorResolution = resolveDoctorPython(options);
  const runnerResolution = resolveRunnerPython(options);

  assert.deepEqual(runnerResolution, doctorResolution);
  assert.equal(runnerResolution.executable, "C:\\Shared Python\\python.exe");
});

test("compatible Python candidate forms are platform-specific and array-based", () => {
  const windows = buildCompatiblePythonCandidates({
    env: {},
    platform: "win32",
    pathExists: () => false
  });
  const posix = buildCompatiblePythonCandidates({
    env: {},
    platform: "linux",
    pathExists: () => false
  });

  assert.deepEqual(
    windows.slice(0, 3).map(({ executable, argsPrefix }) => [executable, argsPrefix]),
    [["py", ["-3.13"]], ["py", ["-3.12"]], ["py", ["-3.11"]]]
  );
  assert.deepEqual(
    posix.slice(0, 3).map(({ executable, argsPrefix }) => [executable, argsPrefix]),
    [["python3.13", []], ["python3.12", []], ["python3.11", []]]
  );
});

test("Python runner launches the resolved executable with an args array and shell disabled", () => {
  const calls = [];
  const resolution = {
    compatible: true,
    executable: "C:\\Path With Spaces\\python.exe",
    argsPrefix: [],
    version: "3.13.14",
    source: "test"
  };
  const result = runPythonCommand(["script.py", "--flag=value"], {
    resolution,
    env: {},
    stdio: "pipe",
    spawnSyncImpl(executable, args, options) {
      calls.push({ executable, args, options });
      return { status: 0, stdout: "", stderr: "", error: null };
    }
  });

  assert.equal(result.status, 0);
  assert.equal(calls[0].executable, resolution.executable);
  assert.deepEqual(calls[0].args, ["script.py", "--flag=value"]);
  assert.equal(calls[0].options.shell, false);
});
