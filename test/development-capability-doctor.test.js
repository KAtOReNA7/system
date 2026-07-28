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
  versionText: tool.id === "python"
    ? "Python 3.13.0"
    : tool.id === "npm"
      ? "11.13.0"
      : "24.0.0",
});

test("catalog defines one private-free core capability and scoped private capabilities", () => {
  assert.deepEqual(
    catalog.capabilities.map((capability) => capability.id),
    [
      "core-dev",
      "m2-pr7-s1",
      "m2-v2-current-state",
      "m2-algorithm-authoritative-input",
      "m2-publishing-scale-audit",
      "m2-publishing-scale-contract-calibration",
      "m2-current-canonical-channel",
      "m2-current-human-anchored",
      "m2-current-human-anchored-tsb-occurrence",
      "m2-current-lifecycle-aware",
      "m2-current-channel-experts",
      "m2-current-channel-generative",
      "m2-current-human-anchored-later-origin",
      "m2-evaluation-v2-2-reversal-rescore",
      "m3-private-materials",
    ],
  );
  const core = catalog.capabilities.find((capability) => capability.id === "core-dev");
  const s1 = catalog.capabilities.find((capability) => capability.id === "m2-pr7-s1");
  const nodeTool = core.requiredTools.find((tool) => tool.id === "node");
  const npmTool = core.requiredTools.find((tool) => tool.id === "npm");
  assert.deepEqual(core.requiredPrivateArtifacts, []);
  assert.equal(nodeTool.minimumMajor, 24);
  assert.equal(nodeTool.maximumMajor, 24);
  assert.equal(npmTool.exactVersion, "11.13.0");
  assert.equal(s1.privateBundle.payloadFileCount, 9);
  assert.equal(s1.privateBundle.environmentIncluded, false);
  assert.equal(s1.privateBundle.providerCredentialsIncluded, false);
  assert.equal(s1.privateBundle.databaseCredentialsIncluded, false);
  assert.equal(catalog.principles.missingPrivateArtifactsBlockOnlyOwningCapability, true);
});

test("missing publishing-scale inputs block only that audit capability", () => {
  const result = evaluateCapability(
    catalog,
    "m2-publishing-scale-audit",
    {
      repoRoot: REPO_ROOT,
      artifactExists: () => false,
      toolProbe: availableToolProbe,
    },
  );
  assert.equal(result.status, "BLOCKED_MISSING_PRIVATE_ARTIFACT");
  assert.equal(result.coreDevelopmentUnaffected, true);
  assert.deepEqual(result.missingPrivateRoles, [
    "formal-model-input-cache",
    "user-reviewed-channel-master",
    "primary-packed-training-rows",
    "strict-packed-training-rows",
  ]);
  assert.match(result.recovery, /block only this read-only scale audit/u);
});

test("missing K7B inputs block only training-side scale calibration", () => {
  const result = evaluateCapability(
    catalog,
    "m2-publishing-scale-contract-calibration",
    {
      repoRoot: REPO_ROOT,
      artifactExists: () => false,
      toolProbe: availableToolProbe,
    },
  );
  assert.equal(result.status, "BLOCKED_MISSING_PRIVATE_ARTIFACT");
  assert.equal(result.coreDevelopmentUnaffected, true);
  assert.deepEqual(result.missingPrivateRoles, [
    "strict-packed-training-rows",
    "v2.2-development-modelable-scope-reconciliation",
    "v2.2-reversal-allocation-ledger",
    "v2.2-development-activation-receipt",
  ]);
  assert.match(result.recovery, /block only K7B training-side calibration/u);
});

test("core doctor rejects Node and npm versions outside the repository contract", () => {
  const result = evaluateCapability(catalog, "core-dev", {
    repoRoot: REPO_ROOT,
    artifactExists: () => false,
    toolProbe: (tool) => ({
      present: true,
      versionText: tool.id === "node"
        ? "v20.19.0"
        : tool.id === "npm"
          ? "10.8.2"
          : tool.id === "python"
            ? "Python 3.13.0"
            : "2.54.0",
    }),
  });

  assert.equal(result.status, "BLOCKED_MISSING_OR_INCOMPATIBLE_TOOL");
  assert.deepEqual(result.unavailableTools, ["node", "npm"]);
});

test("core doctor enforces the exact npm patch version", () => {
  const result = evaluateCapability(catalog, "core-dev", {
    repoRoot: REPO_ROOT,
    artifactExists: () => false,
    toolProbe: (tool) => ({
      present: true,
      versionText: tool.id === "npm"
        ? "11.13.1"
        : tool.id === "python"
          ? "Python 3.13.0"
          : "24.0.0",
    }),
  });

  assert.equal(result.status, "BLOCKED_MISSING_OR_INCOMPATIBLE_TOOL");
  assert.deepEqual(result.unavailableTools, ["npm"]);
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

test("missing canonical-channel inputs block only that private capability", () => {
  const result = evaluateCapability(
    catalog,
    "m2-current-canonical-channel",
    {
      repoRoot: REPO_ROOT,
      artifactExists: () => false,
      toolProbe: availableToolProbe,
    },
  );
  assert.equal(result.status, "BLOCKED_MISSING_PRIVATE_ARTIFACT");
  assert.equal(result.coreDevelopmentUnaffected, true);
  assert.deepEqual(result.missingPrivateRoles, [
    "user-reviewed-channel-master",
    "formal-model-input-cache",
    "dense-development-cases",
    "frozen-sales-share-targets",
  ]);
  assert.match(result.recovery, /Missing channel artifacts block only/u);
});

test("missing human-anchored inputs block only that private capability", () => {
  const result = evaluateCapability(
    catalog,
    "m2-current-human-anchored",
    {
      repoRoot: REPO_ROOT,
      artifactExists: () => false,
      toolProbe: availableToolProbe,
    },
  );
  assert.equal(result.status, "BLOCKED_MISSING_PRIVATE_ARTIFACT");
  assert.equal(result.coreDevelopmentUnaffected, true);
  assert.deepEqual(result.missingPrivateRoles, [
    "user-reviewed-channel-master",
    "formal-model-input-cache",
    "exact-v0.3-overlap-comparator",
  ]);
  assert.match(result.recovery, /block only this bounded local development replay/u);
});

test("missing TSB occurrence inputs block only that private capability", () => {
  const result = evaluateCapability(
    catalog,
    "m2-current-human-anchored-tsb-occurrence",
    {
      repoRoot: REPO_ROOT,
      artifactExists: () => false,
      toolProbe: availableToolProbe,
    },
  );
  assert.equal(result.status, "BLOCKED_MISSING_PRIVATE_ARTIFACT");
  assert.equal(result.coreDevelopmentUnaffected, true);
  assert.deepEqual(result.missingPrivateRoles, [
    "user-reviewed-channel-master",
    "formal-model-input-cache",
    "exact-v0.3-overlap-comparator",
  ]);
  assert.match(result.recovery, /public core, synthetic diagnostics, tests and startup remain available/u);
});

test("missing lifecycle-aware inputs block only that private capability", () => {
  const result = evaluateCapability(
    catalog,
    "m2-current-lifecycle-aware",
    {
      repoRoot: REPO_ROOT,
      artifactExists: () => false,
      toolProbe: availableToolProbe,
    },
  );
  assert.equal(result.status, "BLOCKED_MISSING_PRIVATE_ARTIFACT");
  assert.equal(result.coreDevelopmentUnaffected, true);
  assert.deepEqual(result.missingPrivateRoles, [
    "user-reviewed-channel-master",
    "formal-model-input-cache",
    "exact-v0.3-overlap-comparator",
  ]);
  assert.match(
    result.recovery,
    /public diagnostics, tests and application startup remain available/u,
  );
});

test("missing channel-expert inputs block only that private capability", () => {
  const result = evaluateCapability(
    catalog,
    "m2-current-channel-experts",
    {
      repoRoot: REPO_ROOT,
      artifactExists: () => false,
      toolProbe: availableToolProbe,
    },
  );
  assert.equal(result.status, "BLOCKED_MISSING_PRIVATE_ARTIFACT");
  assert.equal(result.coreDevelopmentUnaffected, true);
  assert.deepEqual(result.missingPrivateRoles, [
    "user-reviewed-channel-master",
    "formal-model-input-cache",
    "exact-v0.3-overlap-comparator",
  ]);
  assert.match(
    result.recovery,
    /public diagnostics, tests and application startup remain available/u,
  );
});

test("missing channel-generative inputs block only that private capability", () => {
  const result = evaluateCapability(
    catalog,
    "m2-current-channel-generative",
    {
      repoRoot: REPO_ROOT,
      artifactExists: () => false,
      toolProbe: availableToolProbe,
    },
  );
  assert.equal(result.status, "BLOCKED_MISSING_PRIVATE_ARTIFACT");
  assert.equal(result.coreDevelopmentUnaffected, true);
  assert.deepEqual(result.missingPrivateRoles, [
    "user-reviewed-channel-master",
    "formal-model-input-cache",
    "frozen-channel-expert-evaluation",
    "frozen-channel-expert-evaluation-manifest",
    "v2.2-development-modelable-scope-reconciliation",
    "v2.2-reversal-allocation-ledger",
    "v2.2-development-activation-receipt",
  ]);
  assert.match(
    result.recovery,
    /public synthetic diagnostics, tests and startup remain available/u,
  );
});

test("later-origin capability requires the original frozen v1 state", () => {
  const result = evaluateCapability(
    catalog,
    "m2-current-human-anchored-later-origin",
    {
      repoRoot: REPO_ROOT,
      artifactExists: (_path, artifact) => (
        artifact.role !== "frozen-v1-model-state"
      ),
      toolProbe: availableToolProbe,
    },
  );
  assert.equal(result.status, "BLOCKED_MISSING_PRIVATE_ARTIFACT");
  assert.equal(result.coreDevelopmentUnaffected, true);
  assert.deepEqual(result.missingPrivateRoles, [
    "frozen-v1-model-state",
  ]);
  assert.match(result.recovery, /Do not infer/u);
  assert.match(result.recovery, /refit/u);
});

test("missing v2.2 reversal-rescore inputs block only that private capability", () => {
  const result = evaluateCapability(
    catalog,
    "m2-evaluation-v2-2-reversal-rescore",
    {
      repoRoot: REPO_ROOT,
      artifactExists: () => false,
      toolProbe: availableToolProbe,
    },
  );
  assert.equal(result.status, "BLOCKED_MISSING_PRIVATE_ARTIFACT");
  assert.equal(result.coreDevelopmentUnaffected, true);
  assert.deepEqual(result.missingPrivateRoles, [
    "total-ledger-authority",
    "sales-share-ledger-authority",
    "buyout-ledger-authority",
    "m1-work-mapping-authority",
    "user-reviewed-channel-master",
    "frozen-current-canonical-evaluation",
    "frozen-human-anchored-evaluation",
    "frozen-tsb-evaluation",
    "frozen-lifecycle-evaluation",
    "frozen-channel-evaluation",
    "frozen-portfolio-evaluation",
  ]);
  assert.match(result.recovery, /Never regenerate predictions/u);
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
