import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  assertIndependentWorkbookVerification,
  verifyIndependentWorkbookObject,
} from "../src/domain/m2V2EvidencePilot/workbookIndependentVerifier.js";
import "./m2-v2-v2b8-workbook-lineage.test.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PYTHON_TEST = "scripts/m2-v2-evidence-pilot/test_verify_m2_v2_workbook.py";

test("independent workbook verifier recomputes OOXML object facts", () => {
  const python = findPython();
  const result = spawnSync(python, [PYTHON_TEST], {
    cwd: ROOT,
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(result.status, 0, `${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  assert.match(result.stderr, /Ran 5 tests/u);
});

test("Node wrapper accepts only independently derived redacted 18.2 facts", () => {
  const python = findPython();
  const temporaryRoot = mkdtempSync(join(tmpdir(), "m2-v2-workbook-verifier-"));
  try {
    const scriptDirectory = join(temporaryRoot, "scripts", "m2-v2-evidence-pilot");
    const workbookPath = join(temporaryRoot, "synthetic", "review.xlsx");
    mkdirSync(scriptDirectory, { recursive: true });
    mkdirSync(dirname(workbookPath), { recursive: true });
    copyFileSync(join(ROOT, "scripts", "m2-v2-evidence-pilot", "verify_m2_v2_workbook.py"), join(scriptDirectory, "verify_m2_v2_workbook.py"));
    copyFileSync(join(ROOT, PYTHON_TEST), join(scriptDirectory, "test_verify_m2_v2_workbook.py"));
    const build = spawnSync(python, [
      "-c",
      [
        "import importlib.util, pathlib, sys",
        "p=pathlib.Path(sys.argv[1])",
        "s=importlib.util.spec_from_file_location('builder', p)",
        "m=importlib.util.module_from_spec(s)",
        "s.loader.exec_module(m)",
        "m.build_xlsx(pathlib.Path(sys.argv[2]))",
      ].join(";"),
      join(scriptDirectory, "test_verify_m2_v2_workbook.py"),
      workbookPath,
    ], { cwd: temporaryRoot, encoding: "utf8", windowsHide: true });
    assert.equal(build.status, 0, `${build.stdout ?? ""}\n${build.stderr ?? ""}`);

    const actual = verifyIndependentWorkbookObject(temporaryRoot, "synthetic/review.xlsx", {
      expectedSheets: ["Review"],
      forbiddenValues: ["never-present"],
      // A caller-supplied fake count is intentionally ignored.
      formulaCount: 999,
      hyperlinkCount: 999,
    });
    assert.equal(actual.passed, true, actual.issues.join(","));
    assert.deepEqual(actual.sheetNames, ["Review"]);
    assert.deepEqual(actual.rowCounts, [1]);
    assert.equal(actual.formulaCount, 0);
    assert.equal(actual.formulaErrorCount, 0);
    assert.deepEqual(actual.cachedFormulaErrors, []);
    assert.equal(actual.hyperlinkCount, 1);
    assert.equal(actual.hyperlinkTargets[0].protocol, "https");
    assert.match(actual.hyperlinkTargets[0].targetDigest, /^[a-f0-9]{64}$/u);
    assert.equal("target" in actual.hyperlinkTargets[0], false);
    assert.equal(JSON.stringify(actual).includes("example.test"), false);
    assert.equal(actual.validationCount, 1);
    assert.equal(actual.forbiddenValueCount, 0);
    assert.equal(actual.internalIdCount, 0);
    assert.equal(actual.incomeValueCount, 0);
    assert.equal(actual.secretCount, 0);
    assert.equal(actual.externalLinkCount, 0);
    assert.equal(actual.visualReviewAttested, false);

    const unsafe = structuredClone(actual);
    unsafe.hyperlinkTargets[0].target = "https://example.test/private";
    assert.throws(
      () => assertIndependentWorkbookVerification(unsafe),
      /hyperlink_target_contract_invalid/u,
    );
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

function findPython() {
  for (const executable of ["python", "python3"]) {
    const result = spawnSync(executable, ["--version"], { encoding: "utf8", windowsHide: true });
    if (!result.error && result.status === 0) return executable;
  }
  assert.fail("python_interpreter_unavailable");
}
