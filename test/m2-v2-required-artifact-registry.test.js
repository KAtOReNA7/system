import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { checkRequiredArtifacts } from "../scripts/m2-v2-evidence-pilot/check_m2_v2_required_artifacts.mjs";
import { scanTestSource } from "../scripts/m2-v2-evidence-pilot/check_m2_v2_test_skip_policy.mjs";
import {
  inspectOptionalPrivateIdentity,
  loadArtifactRegistry,
  requireRegisteredArtifact,
  resolveJsonPointer,
  validateArtifactRegistry,
} from "./helpers/m2V2RequiredArtifacts.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function cloneRegistry() {
  return structuredClone(loadArtifactRegistry(root));
}

test("S0-02 registry names all 34 required sites and four optional-private identities", () => {
  const registry = cloneRegistry();
  const summary = validateArtifactRegistry(registry);
  assert.equal(summary.requiredSiteCount, 34);
  assert.equal(summary.optionalSiteCount, 4);
  assert.deepEqual(summary.optionalPrivateIdentities, [
    "OPT-C1",
    "OPT-C2",
    "OPT-CALIBRATION-PHASE-A",
    "OPT-M2-OPERATOR",
  ]);
  for (const identity of registry.optionalPrivateIdentities) {
    assert.equal(identity.defaultProfileScheduled, false);
    assert.equal(identity.absenceResult, "OPTIONAL_PRIVATE_ABSENT");
    assert.match(identity.whyOptional, /ignored|private/iu);
  }
});

test("S0-02 default profile hard-validates every tracked required artifact and pointer", () => {
  const receipt = checkRequiredArtifacts({ root, profile: "default" });
  assert.equal(receipt.status, "PASS");
  assert.equal(receipt.requiredSiteCount, 34);
  assert.equal(receipt.totalTestSkips, 0);
  assert.equal(receipt.unknownSkipIds, 0);
  assert.equal(receipt.requiredArtifactSkips, 0);
});

test("S0-02 missing tracked artifacts and non-tracked registry roles fail closed", () => {
  const missing = cloneRegistry();
  const artifact = missing.artifacts.find((item) => item.artifactId === "C1_FAILURE_REPORT_JSON");
  artifact.path = "docs/analysis/m2-real-data/does-not-exist-required.json";
  assert.throws(
    () => requireRegisteredArtifact(root, artifact.artifactId, { registry: missing }),
    /artifact:required_missing/u,
  );

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "m2-v2-s0-artifact-role-"));
  try {
    const synthetic = cloneRegistry();
    const row = synthetic.artifacts.find((item) => item.artifactId === "C1_FAILURE_REPORT_JSON");
    row.path = "required.json";
    fs.writeFileSync(path.join(directory, row.path), "{}\n", "utf8");
    assert.throws(
      () => requireRegisteredArtifact(directory, row.artifactId, {
        registry: synthetic,
        gitRoleResolver: () => "UNTRACKED_NOT_IGNORED",
      }),
      /artifact:git_role_mismatch/u,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("S0-02 required JSON pointer absence fails and the pointer profile cannot be empty", () => {
  assert.throws(() => resolveJsonPointer({}, "/evidenceBindings"), /json_pointer:missing/u);
  const registry = cloneRegistry();
  const gate = registry.artifacts.find((item) => item.artifactId === "CALIBRATION_GATE_A_JSON");
  gate.requiredJsonPointers = [];
  assert.throws(() => validateArtifactRegistry(registry), /artifact:pointer_profile_empty/u);
});

test("S0-02 strict registry rejects duplicate IDs, path aliases, conflicting classes and unknown fields", () => {
  const duplicateId = cloneRegistry();
  duplicateId.artifacts.push(structuredClone(duplicateId.artifacts[0]));
  assert.throws(() => validateArtifactRegistry(duplicateId), /artifact:duplicate_id/u);

  const alias = cloneRegistry();
  const aliasRow = structuredClone(alias.artifacts[0]);
  aliasRow.artifactId = "CASE_ALIAS";
  aliasRow.path = aliasRow.path.toUpperCase();
  alias.artifacts.push(aliasRow);
  assert.throws(() => validateArtifactRegistry(alias), /artifact:path_alias_or_conflict|artifact:duplicate_path/u);

  const optionalRequired = cloneRegistry();
  const required = optionalRequired.artifacts.find((item) => item.artifactId === "C1_FAILURE_REPORT_JSON");
  required.classification = "OPTIONAL_PRIVATE_PROFILE";
  assert.throws(() => validateArtifactRegistry(optionalRequired), /artifact:optional_git_role|site:classification_mismatch/u);

  const unknown = cloneRegistry();
  unknown.unexpected = true;
  assert.throws(() => validateArtifactRegistry(unknown), /registry:keys/u);
});

test("S0-02 optional identities reject missing reasons and unknown IDs", () => {
  const registry = cloneRegistry();
  registry.optionalPrivateIdentities[0].whyOptional = "";
  assert.throws(() => validateArtifactRegistry(registry), /nonempty_required/u);
  assert.throws(() => inspectOptionalPrivateIdentity(root, "OPT-UNKNOWN"), /optional:unknown_id/u);
});

test("S0-02 an optional absence cannot offset a required or unknown skip", () => {
  for (const field of ["totalTestSkips", "unknownSkipIds", "requiredArtifactSkips"]) {
    const registry = cloneRegistry();
    registry.profiles.find((item) => item.profileId === "default")[field] = 1;
    assert.throws(() => validateArtifactRegistry(registry), new RegExp(`${field}:must_be_zero`, "u"));
  }
});

test("S0-02 conservative scanner catches skip APIs and artifact-driven return/continue", () => {
  const cases = [
    ["bare t.skip", "test('x', (t) => { t.skip('missing'); });", "NODE_TEST_SKIP_API"],
    ["context.skip", "test('x', (context) => { context.skip('missing'); });", "NODE_TEST_SKIP_API"],
    ["skip option", "test('x', { skip: missing }, () => {});", "NODE_TEST_SKIP_OPTION"],
    ["conditional return", "if (!existsSync(reportPath)) return;", "FAIL_OPEN_MISSING_ARTIFACT_BRANCH"],
    ["conditional continue", "for (const file of files) { if (!fs.existsSync(file)) continue; }", "FAIL_OPEN_MISSING_ARTIFACT_BRANCH"],
    ["missing report return", "if (!report) return;", "FAIL_OPEN_MISSING_VALUE_BRANCH"],
  ];
  for (const [name, source, expected] of cases) {
    assert.equal(scanTestSource(source, `${name}.test.js`).some((item) => item.kind === expected), true, name);
  }
});

test("S0-02 scanner ignores skip-shaped strings and comments", () => {
  const source = `
    const first = "t.skip('not code')";
    const second = 'context.skip("not code")';
    // test.skip('not code')
    /* if (!existsSync(reportPath)) return; */
    test('positive', () => assert.equal(first.length > 0 && second.length > 0, true));
  `;
  assert.deepEqual(scanTestSource(source), []);
});
