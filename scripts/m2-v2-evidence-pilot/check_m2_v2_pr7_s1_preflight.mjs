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
  S1_BATCHES,
  S1_EXTERNAL_ENV_NAMES,
  canonicalReceiptDigest,
  evaluateS1PreflightFacts,
  evaluateTrackedOnlySourcePolicy,
  parseJsonUtf8Strict,
  resolveRegisteredCommand,
  sha256,
  sha256PortableText,
  validateCaseRegistry,
  validateContractRegistry,
  validateHistoricalArtifactBindings,
  validateS1CommandRegistry,
  validateS1Overlay,
  validateS1Receipt,
  validateS1SourceAuthenticityBinding,
  validateS1TaskManifest,
} from "./m2_v2_pr7_s1_contract.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const TASK_MANIFEST = "config/m2-v2-pr7-s1-task.v0.1.json";
const STATUS_OVERLAY = "docs/analysis/m2-v2/M2-v2-PR7-open-findings-status-v0.1.json";
const SOURCE_EVIDENCE = "data/private-output/m2-v2-pr7-s1-remediation-badbf45/s1-source-evidence-authenticity-private-v0.1.json";
const OUTPUT_ROOT = "data/private-output/m2-v2-pr7-s1-remediation-badbf45";
const FAILURE_RECEIPT_SCHEMA = parseJsonUtf8Strict(readFileSync(
  resolve(repositoryRoot, "config/m2-v2-pr7-s1-receipt-schema.v0.1.json"),
));

main();

function main() {
  const generatedAt = new Date().toISOString();
  let actualHead = "0".repeat(40);
  let batchId = "B0";
  let failureStage = "argument_and_task_contract";
  try {
    const options = parseArguments(process.argv.slice(2));
    batchId = options.batchId;
    const root = resolve(options.root ?? repositoryRoot);
    assertOverridesAuthorized(options, root);
    const taskPath = resolveInside(root, options.taskManifest ?? TASK_MANIFEST);
    const taskBytes = readFileSync(taskPath);
    const task = parseJsonUtf8Strict(taskBytes);
    if (batchId !== task.currentBatch) throw new Error("batch_id_does_not_match_frozen_task_batch");

    const commandRegistryBytes = readFileSync(resolveInside(root, task.registries.commandRegistry.path));
    const receiptSchemaBytes = readFileSync(resolveInside(root, task.registries.receiptSchema.path));
    const contractRegistryBytes = readFileSync(resolveInside(root, task.registries.contractRegistry.path));
    const caseRegistryBytes = readFileSync(resolveInside(root, task.registries.caseRegistry.path));
    const commandRegistry = parseJsonUtf8Strict(commandRegistryBytes);
    const receiptSchema = parseJsonUtf8Strict(receiptSchemaBytes);
    const contractRegistry = parseJsonUtf8Strict(contractRegistryBytes);
    const caseRegistry = parseJsonUtf8Strict(caseRegistryBytes);
    const historicalArtifactBytesByPath = new Map(task.historicalImmutableArtifacts.map((binding) => [
      binding.path,
      readFileSync(resolveInside(root, binding.path)),
    ]));
    const baselineArtifactBytesByPath = new Map(task.historicalImmutableArtifacts.map((binding) => [
      binding.path,
      gitBytes(root, ["show", `${task.startingHead}:${binding.path}`]),
    ]));
    const contractArtifactBytesByPath = new Map(contractRegistry.contracts.flatMap((contract) => [
      [contract.machinePath, readFileSync(resolveInside(root, contract.machinePath))],
      [contract.narrativePath, readFileSync(resolveInside(root, contract.narrativePath))],
    ]));
    const trackedPaths = new Set(parseNullSeparated(git(root, ["ls-files", "-z"])));

    validateS1TaskManifest(task, {
      commandRegistryBytes,
      receiptSchemaBytes,
      contractRegistryBytes,
      caseRegistryBytes,
      historicalArtifactBytesByPath,
    });
    validateHistoricalArtifactBindings(task.historicalImmutableArtifacts, baselineArtifactBytesByPath);
    const commandSummary = validateS1CommandRegistry(commandRegistry);
    const selectedCommand = resolveRegisteredCommand(commandRegistry, options.commandId);
    const contractSummary = validateContractRegistry(contractRegistry, {
      contractArtifactBytesByPath,
      historicalArtifactBytesByPath,
      trackedPaths,
    });
    const caseSummary = validateCaseRegistry(caseRegistry);
    if (contractRegistry.contracts.some((contract) => (
      !trackedPaths.has(contract.machinePath) || !trackedPaths.has(contract.narrativePath)
    ))) throw new Error("contract_artifact_not_tracked");

    failureStage = "repository_and_governance_gates";
    actualHead = git(root, ["rev-parse", "HEAD"]).trim();
    if (!/^[0-9a-f]{40}$/u.test(options.expectedHead ?? "")) {
      throw new Error("expected_head_is_required_and_must_be_full_sha");
    }
    const actualBranch = git(root, ["branch", "--show-current"]).trim();
    const trackedStatus = git(root, ["status", "--porcelain=v2", "--untracked-files=no", "-z"]);
    const nonIgnoredUntracked = parseNullSeparated(git(root, ["ls-files", "--others", "--exclude-standard", "-z"]));
    const stagedPaths = parseNullSeparated(git(root, ["diff", "--cached", "--name-only", "-z"]));
    const externalEnvironment = S1_EXTERNAL_ENV_NAMES.map((name) => ({
      name,
      present: Object.hasOwn(process.env, name),
      empty: String(process.env[name] ?? "") === "",
    }));
    const sourceEvidencePath = resolveInside(root, options.sourceEvidence ?? SOURCE_EVIDENCE);
    const privateEvidence = existsSync(sourceEvidencePath)
      ? parseJsonUtf8Strict(readFileSync(sourceEvidencePath))
      : null;
    const trackedOnlyAllowed = evaluateTrackedOnlySourcePolicy(process.env, {
      expectedHead: options.expectedHead,
      actualHead,
      repositoryRoot,
      workspaceRoot: root,
    });
    const sourceEvidence = validateS1SourceAuthenticityBinding(
      task.requiredSourceEvidence,
      privateEvidence,
      { trackedOnlyAllowed },
    );
    if (privateEvidence !== null) recomputePrivateSourceEvidence(root, privateEvidence);
    const overlay = parseJsonUtf8Strict(readFileSync(resolveInside(root, STATUS_OVERLAY)));
    const capabilities = captureCapabilities();
    const historicalPaths = task.historicalImmutableArtifacts.map((binding) => binding.path);
    const historicalDiffClean = gitStatus(root, [
      "diff", "--quiet", task.startingHead, "--", ...historicalPaths,
    ]) === 0;
    const facts = {
      expectedHeadMatches: actualHead === options.expectedHead,
      baseAncestorOfFindingHead: gitStatus(root, ["merge-base", "--is-ancestor", task.baseSha, task.findingHead]) === 0,
      findingHeadAncestorOfStartingHead: gitStatus(root, ["merge-base", "--is-ancestor", task.findingHead, task.startingHead]) === 0,
      startingHeadAncestorOfActualHead: gitStatus(root, ["merge-base", "--is-ancestor", task.startingHead, actualHead]) === 0,
      branchAllowed: task.branchPolicy.allowedBranches.includes(actualBranch),
      trackedSourceClean: trackedStatus.length === 0,
      nonIgnoredUntrackedClean: nonIgnoredUntracked.length === 0,
      externalEnvironmentEmpty: externalEnvironment.every((entry) => entry.empty),
      outputPathIgnored: gitStatus(root, ["check-ignore", "--quiet", "--", `${OUTPUT_ROOT}/.preflight-probe`]) === 0,
      noPrivatePathStaged: stagedPaths.every((path) => !/^data\/private-(?:input|output)(?:\/|$)/u.test(normalizePath(path))),
      sourceEvidenceAuthentic: sourceEvidence.sourceCount === 4,
      commandRegistryValid: commandSummary.commandCount === 4 && selectedCommand.commandId === options.commandId,
      receiptSchemaValid: sha256PortableText(receiptSchemaBytes) === task.registries.receiptSchema.sha256,
      contractRegistryValid: contractSummary.contractCount === 7 && contractSummary.findingCount === 10,
      caseRegistryValid: caseSummary.total === 89 && caseSummary.secondaryVerifierRequired === 30,
      historicalImmutableArtifactsValid: historicalDiffClean,
      capabilitiesPresent: Object.values(capabilities).every((capability) => capability.available),
      currentGovernanceValid: validateS1Overlay(overlay),
    };
    const checks = evaluateS1PreflightFacts(facts);
    failureStage = "success_receipt_schema_validation";
    const receipt = {
      schema: "m2.v2.pr7.s1-preflight-receipt.v0.1",
      passed: true,
      generatedAt,
      batchId,
      actualHead,
      actualBranch,
      startingHead: task.startingHead,
      findingHead: task.findingHead,
      baseSha: task.baseSha,
      selectedCommandId: selectedCommand.commandId,
      taskManifestSha256: sha256PortableText(taskBytes),
      commandRegistrySha256: sha256PortableText(commandRegistryBytes),
      contractRegistrySha256: sha256PortableText(contractRegistryBytes),
      caseRegistrySha256: sha256PortableText(caseRegistryBytes),
      receiptSchemaSha256: sha256PortableText(receiptSchemaBytes),
      sourceEvidence,
      externalEnvironment,
      capabilities,
      checks,
      executions: [],
      fallbackEvents: [],
    };
    validateS1Receipt(receipt, receiptSchema);
    if (options.receipt) writeIgnoredReceipt(root, options.receipt, receipt);
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  } catch (error) {
    const receipt = {
      schema: "m2.v2.pr7.s1-preflight-receipt.v0.1",
      passed: false,
      generatedAt,
      batchId,
      actualHead,
      checks: {},
      executions: [],
      fallbackEvents: [],
      failureStage,
      error: sanitizeError(error),
    };
    validateS1Receipt(receipt, FAILURE_RECEIPT_SCHEMA);
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
    process.exitCode = 1;
  }
}

function parseArguments(args) {
  const options = {
    expectedHead: null,
    batchId: "B0",
    commandId: "s1.doctor",
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
    if (!["--expected-head", "--batch-id", "--command-id", "--receipt", "--root", "--task-manifest", "--source-evidence"].includes(flag)) {
      throw new Error("unsupported_argument");
    }
    const value = inline ?? args[++index];
    if (typeof value !== "string" || value === "") throw new Error("argument_value_required");
    const key = flag.slice(2).replace(/-([a-z])/gu, (_match, letter) => letter.toUpperCase());
    options[key] = value;
  }
  if (!S1_BATCHES.includes(options.batchId)) throw new Error("batch_id_not_authorized");
  return options;
}

function assertOverridesAuthorized(options, root) {
  const hasSyntheticOverride = root !== repositoryRoot
    || options.taskManifest !== null
    || options.sourceEvidence !== null;
  if (hasSyntheticOverride && !options.syntheticFixture) {
    throw new Error("root_or_evidence_override_requires_synthetic_fixture");
  }
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

function recomputePrivateSourceEvidence(root, privateEvidence) {
  for (const source of privateEvidence.sources) {
    const reportBytes = readFileSync(resolveInside(root, source.reportPath));
    if (sha256(reportBytes) !== source.reportActualSha256) {
      throw new Error(`source_report_recompute_mismatch_${source.sourceId}`);
    }
    const receipt = parseJsonUtf8Strict(readFileSync(resolveInside(root, source.receiptPath)));
    const recomputed = canonicalReceiptDigest(receipt);
    if (recomputed !== source.receiptRecomputedDigest
        || receipt.receiptDigest !== source.receiptClaimedDigest) {
      throw new Error(`source_receipt_recompute_mismatch_${source.sourceId}`);
    }
  }
  return true;
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

function gitBytes(root, argv) {
  const result = spawnSync("git", argv, {
    cwd: root,
    encoding: "buffer",
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
  return value.split("\0").filter(Boolean).map(normalizePath);
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
