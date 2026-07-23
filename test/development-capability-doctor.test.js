import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  evaluateCapability,
  loadCapabilityCatalog,
  resolveRepoPath,
} from "../scripts/check-development-capability.mjs";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, "..");
const CATALOG_PATH = path.join(
  REPO_ROOT,
  "config",
  "development-capability-catalog.v0.1.json",
);
const catalog = loadCapabilityCatalog(CATALOG_PATH);
const availableToolProbe = (tool) => ({
  present: true,
  versionText: tool.id === "python" ? "Python 3.13.0" : "24.0.0",
});

test("catalog defines one private-free core capability and scoped private capabilities", () => {
  assert.deepEqual(
    catalog.capabilities.map((capability) => capability.id),
    [
      "core-dev",
      "m2-pr7-s1",
      "m2-v2-current-state",
      "m2-algorithm-authoritative-input",
      "m3-private-materials",
    ],
  );
  const core = catalog.capabilities.find((capability) => capability.id === "core-dev");
  const s1 = catalog.capabilities.find((capability) => capability.id === "m2-pr7-s1");
  assert.deepEqual(core.requiredPrivateArtifacts, []);
  assert.equal(s1.privateBundle.payloadFileCount, 9);
  assert.equal(s1.privateBundle.environmentIncluded, false);
  assert.equal(s1.privateBundle.providerCredentialsIncluded, false);
  assert.equal(s1.privateBundle.databaseCredentialsIncluded, false);
  assert.equal(catalog.principles.missingPrivateArtifactsBlockOnlyOwningCapability, true);
});

test("core development stays ready without probing any private path", () => {
  let artifactProbeCount = 0;
  const result = evaluateCapability(catalog, "core-dev", {
    repoRoot: REPO_ROOT,
    artifactExists: () => {
      artifactProbeCount += 1;
      return false;
    },
    toolProbe: availableToolProbe,
  });
  assert.equal(result.status, "READY");
  assert.equal(result.coreDevelopmentUnaffected, true);
  assert.equal(artifactProbeCount, 0);
  assert.deepEqual(result.privateArtifacts, []);
});

test("missing S1 private evidence blocks only the S1 capability", () => {
  const result = evaluateCapability(catalog, "m2-pr7-s1", {
    repoRoot: REPO_ROOT,
    artifactExists: () => false,
    toolProbe: availableToolProbe,
  });
  assert.equal(result.status, "BLOCKED_MISSING_PRIVATE_ARTIFACT");
  assert.equal(result.coreDevelopmentUnaffected, true);
  assert.deepEqual(result.missingPrivateRoles, ["s1-source-evidence-authenticity"]);
  assert.match(result.recovery, /verified encrypted capability bundle/u);
  assert.match(result.recovery, /Never reconstruct/u);
});

test("present S1 evidence still requires the canonical verifier", () => {
  const result = evaluateCapability(catalog, "m2-pr7-s1", {
    repoRoot: REPO_ROOT,
    artifactExists: () => true,
    toolProbe: availableToolProbe,
  });
  assert.equal(result.status, "AVAILABLE_FOR_CANONICAL_VALIDATION");
  assert.match(result.canonicalValidationCommands[0], /--batch-id=<explicitly-authorized-batch>/u);
  assert.match(result.notes.join(" "), /presence is inventory only/u);
});

test("capability paths cannot escape the repository", () => {
  assert.throws(
    () => resolveRepoPath(REPO_ROOT, "../outside-private.json"),
    /escapes repository root/u,
  );
  assert.throws(
    () => resolveRepoPath(REPO_ROOT, path.resolve(REPO_ROOT, "absolute.json")),
    /repository-relative/u,
  );
});

test("default install, development, validation, and start commands do not invoke private capability checks", () => {
  const packageJson = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
  for (const scriptName of [
    "dev",
    "start",
    "lint",
    "build",
    "test",
    "smoke",
    "check:no-real-data",
  ]) {
    const command = packageJson.scripts[scriptName];
    assert.equal(typeof command, "string", `missing package script ${scriptName}`);
    assert.doesNotMatch(command, /doctor:capability|data[\\/]private-(?:input|output)/u);
  }
  assert.equal(
    packageJson.scripts.test,
    "node tools/node/run-test-registry.mjs default",
  );
});

test("private capability roots remain ignored by the repository policy", () => {
  const gitignore = readFileSync(path.join(REPO_ROOT, ".gitignore"), "utf8");
  assert.match(gitignore, /^data\/$/mu);
  assert.match(gitignore, /^\*\*\/data\/$/mu);
});
