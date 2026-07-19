#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluatePreflightFacts,
  parseJsonUtf8Strict,
  resolveRegisteredCommand,
  sha256,
  sha256PortableText,
  validateCommandRegistry,
  validateJsonSchema,
  validateSourceAuthenticityBinding,
  validateTaskManifest,
} from "./m2_v2_pr7_s0_contract.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const TASK_MANIFEST = "config/m2-v2-pr7-s0-task.v0.1.json";
const SOURCE_EVIDENCE = "data/private-output/m2-v2-pr7-s0-support-implementation-627f74/s0-source-evidence-authenticity-private-v0.1.json";
const STATUS_OVERLAY = "docs/analysis/m2-v2/M2-v2-PR7-open-findings-status-v0.1.json";
const OUTPUT_ROOT = "data/private-output/m2-v2-pr7-s0-support-implementation-627f74";
const FAILURE_RECEIPT_SCHEMA = JSON.parse(readFileSync(
  resolve(repositoryRoot, "config/m2-v2-pr7-s0-receipt-schema.v0.1.json"),
  "utf8",
));
const EXTERNAL_ENV_NAMES = Object.freeze([
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "TAVILY_API_KEY",
  "M2_V2_EVIDENCE_API_BASE_URL",
  "M2_V2_EVIDENCE_APPROVED_HOST",
  "M2_V2_APPROVED_RELAY_HOST",
  "M2_V2_EVIDENCE_PROVIDER",
  "M2_V2_SEARCH_PROVIDER",
  "M2_V2_TAVILY_BASE_URL",
  "M1_DATABASE_URL",
  "M1_DATABASE_READONLY_URL",
  "M1_DATABASE_BACKGROUND_URL",
  "DATABASE_URL",
  "PGHOST",
  "PGPORT",
  "PGDATABASE",
  "PGUSER",
  "PGPASSWORD",
]);

main();

function main() {
  const generatedAt = new Date().toISOString();
  let actualHead = "0000000000000000000000000000000000000000";
  let failureStage = "argument_and_task_contract";
  try {
    const options = parseArguments(process.argv.slice(2));
    const root = resolve(options.root ?? repositoryRoot);
    if (root !== repositoryRoot && !options.syntheticFixture) {
      throw new Error("root_override_requires_synthetic_fixture");
    }
    const taskPath = resolveInside(root, options.taskManifest ?? TASK_MANIFEST);
    const taskBytes = readFileSync(taskPath);
    const task = parseJsonUtf8Strict(taskBytes);
    const registryPath = resolveInside(root, task.commandRegistry);
    const registryBytes = readFileSync(registryPath);
    const registry = parseJsonUtf8Strict(registryBytes);
    const receiptSchemaPath = resolveInside(root, task.receiptSchema.path);
    const receiptSchemaBytes = readFileSync(receiptSchemaPath);
    const receiptSchema = parseJsonUtf8Strict(receiptSchemaBytes);
    validateTaskManifest(task, { registryBytes, receiptSchemaBytes });
    const registrySummary = validateCommandRegistry(registry);
    const selectedCommand = resolveRegisteredCommand(registry, options.commandId);
    if (options.fallbackId !== null) throw new Error("unknown_fallback_id");

    failureStage = "repository_and_governance_gates";
    actualHead = git(root, ["rev-parse", "HEAD"]).trim();
    if (!/^[0-9a-f]{40}$/u.test(options.expectedHead ?? "")) {
      throw new Error("expected_head_is_required_and_must_be_full_sha");
    }
    const actualBranch = git(root, ["branch", "--show-current"]).trim();
    const trackedStatus = git(root, ["status", "--porcelain=v2", "--untracked-files=no", "-z"]);
    const stagedPaths = parseNullSeparated(git(root, ["diff", "--cached", "--name-only", "-z"]));
    const externalEnvironment = EXTERNAL_ENV_NAMES.map((name) => ({
      name,
      present: Object.hasOwn(process.env, name),
      empty: String(process.env[name] ?? "") === "",
    }));

    const sourceEvidencePath = resolveInside(root, options.sourceEvidence ?? SOURCE_EVIDENCE);
    const privateEvidence = existsSync(sourceEvidencePath)
      ? parseJsonUtf8Strict(readFileSync(sourceEvidencePath))
      : null;
    const sourceBinding = validateSourceAuthenticityBinding(task.requiredSourceEvidence, privateEvidence);
    const overlay = parseJsonUtf8Strict(readFileSync(resolveInside(root, STATUS_OVERLAY)));
    const capabilities = captureCapabilities();
    const outputIgnored = gitStatus(root, ["check-ignore", "--quiet", "--", `${OUTPUT_ROOT}/.preflight-probe`]) === 0;
    const facts = {
      expectedHeadMatches: actualHead === options.expectedHead,
      baseAncestorOfStartingHead: gitStatus(root, ["merge-base", "--is-ancestor", task.baseSha, task.startingHead]) === 0,
      startingHeadAncestorOfActualHead: gitStatus(root, ["merge-base", "--is-ancestor", task.startingHead, actualHead]) === 0,
      branchAllowed: task.allowedBranches.includes(actualBranch),
      trackedSourceClean: trackedStatus.length === 0,
      externalEnvironmentEmpty: externalEnvironment.every((entry) => entry.empty),
      outputPathIgnored: outputIgnored,
      noPrivatePathStaged: stagedPaths.every((path) => !/^data\/private-(?:input|output)(?:\/|$)/u.test(normalizePath(path))),
      sourceEvidenceAuthentic: sourceBinding.sourceCount === 3,
      commandRegistryValid: registrySummary.commandCount > 0 && selectedCommand.commandId === options.commandId,
      receiptSchemaValid: sha256PortableText(receiptSchemaBytes) === task.receiptSchema.sha256,
      capabilitiesPresent: Object.values(capabilities).every((capability) => capability.available),
      currentGovernanceValid: validateOverlay(overlay),
    };
    const checks = evaluatePreflightFacts(facts);
    failureStage = "success_receipt_schema_validation";
    const receipt = {
      schema: "m2.v2.pr7.s0-preflight-receipt.v0.1",
      passed: true,
      generatedAt,
      actualHead,
      actualBranch,
      startingHead: task.startingHead,
      baseSha: task.baseSha,
      selectedCommandId: selectedCommand.commandId,
      taskManifestSha256: sha256PortableText(taskBytes),
      commandRegistrySha256: sha256PortableText(registryBytes),
      sourceEvidence: sourceBinding,
      externalEnvironment,
      capabilities,
      checks,
      fallbackEvents: [],
    };
    validateJsonSchema(receipt, receiptSchema);
    if (options.receipt) writeIgnoredReceipt(root, options.receipt, receipt);
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  } catch (error) {
    const receipt = {
      schema: "m2.v2.pr7.s0-preflight-receipt.v0.1",
      passed: false,
      generatedAt,
      actualHead,
      failureStage,
      checks: {},
      fallbackEvents: [],
      error: sanitizeError(error),
    };
    validateJsonSchema(receipt, FAILURE_RECEIPT_SCHEMA);
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
    process.exitCode = 1;
  }
}

function parseArguments(args) {
  const options = {
    expectedHead: null,
    commandId: "s0.doctor",
    fallbackId: null,
    receipt: null,
    root: null,
    taskManifest: null,
    sourceEvidence: null,
    syntheticFixture: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const equals = argument.indexOf("=");
    const flag = equals >= 0 ? argument.slice(0, equals) : argument;
    const inline = equals >= 0 ? argument.slice(equals + 1) : null;
    if (flag === "--synthetic-fixture") {
      options.syntheticFixture = true;
      continue;
    }
    if (![
      "--expected-head", "--command-id", "--fallback-id", "--receipt", "--root",
      "--task-manifest", "--source-evidence",
    ].includes(flag)) {
      throw new Error("unsupported_argument");
    }
    const value = inline ?? args[++index];
    if (typeof value !== "string" || value === "") throw new Error("argument_value_required");
    const key = flag.slice(2).replace(/-([a-z])/gu, (_match, letter) => letter.toUpperCase());
    options[key] = value;
  }
  return options;
}

function captureCapabilities() {
  const nodeVersion = process.versions.node;
  const gitVersion = versionCommand("git", ["--version"]);
  const pythonVersion = versionCommand("python", ["--version"]);
  const powershellExecutable = process.platform === "win32"
    ? `${process.env.SystemRoot ?? "C:\\Windows"}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
    : "pwsh";
  const powershellVersion = versionCommand(powershellExecutable, [
    "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "$PSVersionTable.PSVersion.ToString()",
  ]);
  const pythonMatch = pythonVersion.output.match(/Python\s+(\d+)\.(\d+)/u);
  const pythonSupported = Boolean(pythonMatch)
    && (Number(pythonMatch[1]) > 3 || (Number(pythonMatch[1]) === 3 && Number(pythonMatch[2]) >= 11));
  return {
    node: { available: Number(nodeVersion.split(".")[0]) >= 20, version: nodeVersion },
    git: { available: gitVersion.available, version: gitVersion.output },
    python: { available: pythonVersion.available && pythonSupported, version: pythonVersion.output },
    powershell: { available: powershellVersion.available, version: powershellVersion.output },
  };
}

function versionCommand(executable, argv) {
  const result = spawnSync(executable, argv, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    windowsHide: true,
  });
  return {
    available: result.status === 0,
    output: result.status === 0 ? `${result.stdout ?? ""}${result.stderr ?? ""}`.trim() : "unavailable",
  };
}

function validateOverlay(overlay) {
  return overlay.reviewedHead === "627f74c6b9b2365ee4403c613ea9689748b76541"
    && overlay.openP1 === 5
    && overlay.openDirectP2 === 5
    && Array.isArray(overlay.openFindingIds)
    && overlay.openFindingIds.length === 10
    && overlay.historicalDecision === "CANARY_CONDITIONAL"
    && overlay.currentDecision === "CANARY_FAIL"
    && overlay.mergeAuthorized === false
    && overlay.full160Authorized === false
    && overlay.nextDevelopmentReadiness === "NOT_AUTHORIZED"
    && overlay.nextAllowedPhase === "S0_SUPPORT_IMPLEMENTATION"
    && ["IMPLEMENTED_PENDING_VALIDATION", "PASSED_VALIDATION"].includes(overlay.s0Status)
    && overlay.openFindings === 10
    && overlay.findingRemediationAuthorized === false;
}

function writeIgnoredReceipt(root, receipt, payload) {
  const path = resolveInside(root, receipt);
  const allowedRoot = resolveInside(root, OUTPUT_ROOT);
  if (!isInside(allowedRoot, path) || path === allowedRoot) throw new Error("receipt_outside_authorized_output");
  const relativePath = normalizePath(relative(root, path));
  if (gitStatus(root, ["check-ignore", "--quiet", "--", relativePath]) !== 0) {
    throw new Error("receipt_path_not_ignored");
  }
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    renameSync(temporary, path);
  } finally {
    if (existsSync(temporary)) rmSync(temporary, { force: true });
  }
}

function git(root, argv) {
  const result = spawnSync("git", argv, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error(`git_${argv[0].replaceAll("-", "_")}_failed`);
  return result.stdout;
}

function gitStatus(root, argv) {
  return spawnSync("git", argv, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  }).status;
}

function parseNullSeparated(value) {
  return value.split("\0").filter(Boolean);
}

function resolveInside(root, path) {
  const resolved = isAbsolute(path) ? resolve(path) : resolve(root, path);
  if (resolved !== root && !isInside(root, resolved)) throw new Error("path_outside_repository");
  return resolved;
}

function isInside(parent, child) {
  return child.startsWith(`${parent}${sep}`);
}

function normalizePath(path) {
  return path.replaceAll("\\", "/");
}

function sanitizeError(error) {
  const message = String(error?.message ?? error);
  return {
    name: error instanceof Error ? error.name : "Error",
    code: typeof error?.code === "string" && error.code ? error.code : "UNSPECIFIED",
    reasonCode: message.replace(/[^A-Za-z0-9_.:-]+/gu, "_").slice(0, 160) || "unspecified_failure",
    messageDigest: sha256(message),
  };
}
