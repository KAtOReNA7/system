import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  inspectAllOptionalPrivateIdentities,
  loadArtifactRegistry,
  requireRegisteredArtifact,
  validateArtifactRegistry,
} from "../../test/helpers/m2V2RequiredArtifacts.js";

const OPTIONAL_TEST_FILES = Object.freeze([
  "test/m2-c1-transparent-ensemble.test.js",
  "test/m2-c2-development-validation.test.js",
  "test/m2-calibration-v1-2-contract.test.js",
  "test/m2-operator-task-after-staging.test.js",
]);

function parseArgs(argv) {
  const parsed = { profile: "default", root: process.cwd(), runOptionalTests: true };
  for (const arg of argv) {
    if (arg.startsWith("--profile=")) parsed.profile = arg.slice("--profile=".length);
    else if (arg.startsWith("--root=")) parsed.root = path.resolve(arg.slice("--root=".length));
    else if (arg === "--no-run-optional-tests") parsed.runOptionalTests = false;
    else throw new Error(`s0_artifact_check_unknown_argument:${arg}`);
  }
  if (!["default", "optional-private"].includes(parsed.profile)) {
    throw new Error(`s0_artifact_check_unknown_profile:${parsed.profile}`);
  }
  return parsed;
}

export function checkRequiredArtifacts({ root = process.cwd(), profile = "default" } = {}) {
  const registry = loadArtifactRegistry(root);
  const registrySummary = validateArtifactRegistry(registry);
  if (profile === "default") {
    const required = registry.artifacts.filter((item) => item.profiles.includes("default"));
    for (const artifact of required) requireRegisteredArtifact(root, artifact.artifactId, { registry });
    return {
      schema: "m2.v2.pr7.s0.required-artifact-check.v0.1",
      profile,
      status: "PASS",
      artifactCount: required.length,
      requiredSiteCount: registrySummary.requiredSiteCount,
      optionalSiteCount: registrySummary.optionalSiteCount,
      totalTestSkips: 0,
      unknownSkipIds: 0,
      requiredArtifactSkips: 0,
    };
  }
  const optionalResults = inspectAllOptionalPrivateIdentities(root);
  return {
    schema: "m2.v2.pr7.s0.required-artifact-check.v0.1",
    profile,
    status: "PASS",
    artifactCount: registry.artifacts.filter((item) => item.profiles.includes("optional-private")).length,
    optionalPrivateIdentities: optionalResults,
    totalTestSkips: 0,
    unknownSkipIds: 0,
    requiredArtifactSkips: 0,
  };
}

function runOptionalTests(root) {
  const result = spawnSync(
    process.execPath,
    ["--test", "--test-concurrency=1", ...OPTIONAL_TEST_FILES],
    {
      cwd: root,
      env: { ...process.env, M2_V2_TEST_PROFILE: "optional-private" },
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error(`s0_optional_private_tests_failed:${result.status}`);
  return { status: "PASS", executable: process.execPath, argv: ["--test", "--test-concurrency=1", ...OPTIONAL_TEST_FILES] };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const receipt = checkRequiredArtifacts(args);
  if (args.profile === "optional-private" && args.runOptionalTests) {
    receipt.optionalSemanticTests = runOptionalTests(args.root);
  }
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

const isCli = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isCli) {
  main().catch((error) => {
    process.stderr.write(`${String(error?.message ?? "s0_artifact_check_failed").replace(/[\r\n]+/gu, " ")}\n`);
    process.exitCode = 1;
  });
}

export const OPTIONAL_PRIVATE_TEST_FILES = OPTIONAL_TEST_FILES;
export const SCRIPT_PATH = fileURLToPath(import.meta.url);
