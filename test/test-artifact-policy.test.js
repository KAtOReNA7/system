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
  validateArtifactRegistry,
} from "./helpers/m2V2RequiredArtifacts.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function cloneRegistry() {
  return structuredClone(loadArtifactRegistry(root));
}

function assertMissingArtifact(caseId, artifactId) {
  const registry = cloneRegistry();
  const artifact = registry.artifacts.find((row) => row.artifactId === artifactId);
  artifact.path = `synthetic-missing/${caseId}.json`;
  assert.throws(
    () => requireRegisteredArtifact(root, artifactId, { registry }),
    /artifact:required_missing/u,
  );
}

test("PR7-P2-006-missing-population fails without a tracked population report", () => {
  assertMissingArtifact("population", "CALIBRATION_POPULATION_COVERAGE_JSON");
});

test("PR7-P2-006-missing-comparator fails without the comparator identity report", () => {
  assertMissingArtifact("comparator", "BASELINE_COMPARATOR_IDENTITY_JSON");
});

test("PR7-P2-006-missing-gate fails for each required Gate A/C/D report", () => {
  for (const artifactId of ["CALIBRATION_GATE_A_JSON", "C2_GATE_C_JSON", "C3_GATE_D_JSON"]) {
    assertMissingArtifact(artifactId.toLowerCase(), artifactId);
  }
});

test("PR7-P2-006-missing-pointer fails when a required JSON pointer is absent", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "m2-v2-b5-pointer-"));
  try {
    const registry = cloneRegistry();
    const artifact = registry.artifacts.find((row) => row.artifactId === "CALIBRATION_GATE_A_JSON");
    artifact.path = "gate.json";
    fs.writeFileSync(path.join(directory, artifact.path), "{}\n", "utf8");
    assert.throws(
      () => requireRegisteredArtifact(directory, artifact.artifactId, {
        registry,
        gitRoleResolver: () => "TRACKED",
      }),
      /json_pointer:missing/u,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("PR7-P2-006-missing-v2-report fails without the tracked pilot report", () => {
  assertMissingArtifact("v2-report", "PILOT_SUMMARY_JSON");
});

test("PR7-P2-006-optional-absent remains separate from the passing default profile", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "m2-v2-b5-optional-"));
  try {
    const result = inspectOptionalPrivateIdentity(directory, "OPT-C1", {
      registry: cloneRegistry(),
      gitRoleResolver: () => "IGNORED_UNTRACKED",
    });
    assert.deepEqual(result, {
      optionalId: "OPT-C1",
      status: "OPTIONAL_PRIVATE_ABSENT",
      artifactCount: result.artifactCount,
    });
    assert.equal(checkRequiredArtifacts({ root, profile: "default" }).status, "PASS");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("PR7-P2-006-unknown-skip rejects an unregistered skip identity", () => {
  const registry = cloneRegistry();
  registry.profiles.find((row) => row.profileId === "default").unknownSkipIds = 1;
  assert.throws(() => validateArtifactRegistry(registry), /unknownSkipIds:must_be_zero/u);
});

test("PR7-P2-006-offset-skip rejects optional/required skip count offsetting", () => {
  const registry = cloneRegistry();
  const profile = registry.profiles.find((row) => row.profileId === "default");
  profile.totalTestSkips = 1;
  profile.requiredArtifactSkips = 1;
  assert.throws(() => validateArtifactRegistry(registry), /must_be_zero/u);
});

test("PR7-P2-006-return-continue rejects hidden fail-open branches", () => {
  for (const source of [
    "if (!existsSync(reportPath)) return;",
    "for (const file of files) { if (!fs.existsSync(file)) continue; }",
  ]) {
    assert.equal(
      scanTestSource(source, "synthetic.test.js")
        .some((row) => row.kind === "FAIL_OPEN_MISSING_ARTIFACT_BRANCH"),
      true,
    );
  }
});

test("PR7-P2-006-zero-skip-pass validates the complete default registry", () => {
  const receipt = checkRequiredArtifacts({ root, profile: "default" });
  assert.equal(receipt.status, "PASS");
  assert.equal(receipt.totalTestSkips, 0);
  assert.equal(receipt.unknownSkipIds, 0);
  assert.equal(receipt.requiredArtifactSkips, 0);
});
