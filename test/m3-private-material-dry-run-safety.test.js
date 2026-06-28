import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dryRunDesign = readJson("docs/technical-design/M3-private-material-dry-run-design-v0.1.json");
const safetyDesign = readJson("docs/technical-design/M3-private-material-dry-run-safety-check-v0.1.json");
const summary = readJson("docs/analysis/m3/M3-5-fixture-e2e-dry-run-design-summary-v0.1.json");

test("M3 private dry-run paths stay under ignored private data roots", () => {
  for (const path of dryRunDesign.privateInputDirectories) {
    assert.ok(path.startsWith("data/private-input/") || path.startsWith("data/private-output/"));
  }
  for (const path of dryRunDesign.privateOutputPaths) {
    assert.ok(path.startsWith("data/private-output/"));
  }
  assert.ok(safetyDesign.allowedPrivateRoots.includes("data/private-input/"));
  assert.ok(safetyDesign.allowedPrivateRoots.includes("data/private-output/"));
});

test("M3 private dry-run result paths are covered by gitignore", () => {
  const gitignore = readFileSync(".gitignore", "utf8");

  assert.match(gitignore, /^data\/$/m);
  assert.match(gitignore, /^\*\*\/data\/$/m);
  assert.match(gitignore, /^\*\*\/\*\.xlsx$/m);
  assert.match(gitignore, /^\*\*\/\*\.csv$/m);
  assert.match(gitignore, /^\*\.db$/m);
});

test("M3 dry-run safety design forbids raw material storage and formal result", () => {
  assert.equal(safetyDesign.rawMaterialStorageAllowed, false);
  assert.equal(safetyDesign.webpageFullTextStorageAllowed, false);
  assert.equal(safetyDesign.formalResultGenerated, false);
  assert.equal(safetyDesign.databaseConnected, false);
  assert.equal(safetyDesign.migrationWritten, false);
  assert.equal(summary.privateMaterialRead, false);
  assert.equal(summary.realDryRunGenerated, false);
  assert.equal(summary.formalExecutionAllowed, false);
});

test("M3 private dry-run public docs contain no sample real material identifiers", () => {
  const publicDocs = [
    "docs/analysis/m3/M3-fixture-e2e-acceptance-audit-v0.1.md",
    "docs/technical-design/M3-private-material-dry-run-design-v0.1.md",
    "docs/technical-design/M3-private-material-dry-run-safety-check-v0.1.md",
    "docs/analysis/m3/M3-private-material-dry-run-human-acceptance-plan-v0.1.md",
    "docs/analysis/m3/M3-5-fixture-e2e-dry-run-design-summary-v0.1.md"
  ].map((path) => readFileSync(path, "utf8")).join("\n");

  assert.equal(publicDocs.includes("private-title-example"), false);
  assert.equal(publicDocs.includes("private-author-example"), false);
  assert.equal(publicDocs.includes("raw_bill_row"), false);
  assert.equal(publicDocs.includes("webpageFullText"), false);
});

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}
