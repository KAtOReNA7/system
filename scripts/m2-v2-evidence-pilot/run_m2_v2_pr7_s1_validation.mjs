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
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  S1_BATCHES,
  deriveS1AuditedTransportCounts,
  parseJsonUtf8Strict,
  resolveRegisteredCommand,
  sha256,
  validateS1CommandRegistry,
  validateS1Receipt,
} from "./m2_v2_pr7_s1_contract.mjs";
import { parseMachineFailureEvidence } from "./m2_v2_pr7_s0_contract.mjs";
import { withInstalledNoExternalSentinel } from "../../test/helpers/m2V2NoExternalSentinel.js";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const registryPath = resolve(root, "config/m2-v2-pr7-s1-command-registry.v0.1.json");
const receiptSchema = parseJsonUtf8Strict(readFileSync(
  resolve(root, "config/m2-v2-pr7-s1-receipt-schema.v0.1.json"),
));
const outputRoot = "data/private-output/m2-v2-pr7-s1-remediation-badbf45";

await main();

async function main() {
  const generatedAt = new Date().toISOString();
  let options = { batchId: "B1", receipt: null };
  let actualHead = safeGitHead();
  let failureStage = "argument_and_registry_contract";
  const executions = [];
  try {
    options = parseArguments(process.argv.slice(2));
    if (!/^[0-9a-f]{40}$/u.test(options.expectedHead ?? "")) {
      throw new Error("expected_head_is_required_and_must_be_full_sha");
    }
    const registry = parseJsonUtf8Strict(readFileSync(registryPath));
    validateS1CommandRegistry(registry);
    const preflightCommand = resolveRegisteredCommand(registry, "s1.doctor");
    const isolationCommand = resolveRegisteredCommand(registry, "s1.default.isolated");

    failureStage = "s1_preflight";
    const preflightExecution = executeRegistered(preflightCommand, [
      `--expected-head=${options.expectedHead}`,
      `--batch-id=${options.batchId}`,
    ], { preserveExternalEnvironment: true });
    executions.push(publicExecution(preflightExecution));
    const preflight = parseJsonOutput(preflightExecution.stdout);
    validateS1Receipt(preflight, receiptSchema);
    if (!preflightExecution.passed || preflight.passed !== true) throw new Error("s1_preflight_failed");

    failureStage = "isolated_default_test_chain";
    const isolationAttempt = await withInstalledNoExternalSentinel(
      { env: providerFreeEnvironment() },
      async (sentinel) => {
        const execution = executeRegistered(isolationCommand, [], { preserveExternalEnvironment: false });
        return { execution, transportSnapshot: sentinel.snapshot() };
      },
    );
    const { execution: isolationExecution, transportSnapshot } = isolationAttempt;
    executions.push(publicExecution(isolationExecution));
    const isolation = parseJsonOutput(isolationExecution.stdout);
    if (!isolationExecution.passed || isolation.passed !== true) throw new Error("isolated_default_test_chain_failed");
    const transportCounts = deriveS1AuditedTransportCounts({
      preflight,
      isolation,
      parentTransportSnapshot: transportSnapshot,
      isolationCommand,
    });

    failureStage = "bounded_success_receipt";
    actualHead = safeGitHead();
    const checks = {
      preflightPassed: true,
      isolationPassed: true,
      actualHeadMatchesExpected: actualHead === options.expectedHead,
      defaultTestChainInvocationCount: isolation.defaultTestChainInvocationCount,
      defaultTestTotalSkips: isolation.defaultTestTotalSkips,
      defaultTestSkipSummaryPresent: isolation.defaultTestSkipSummaryPresent,
      defaultTestSkipIdentityCountMatchesSummary: isolation.defaultTestSkipIdentityCountMatchesSummary,
      providerRequestDelta: isolation.providerRequestDelta,
      databaseConnections: transportCounts.databaseConnections,
      actualExternalFetchCount: transportCounts.actualExternalFetchCount,
      trackedContentUnchanged: isolation.trackedContentUnchanged,
      trackedMetadataUnchanged: isolation.trackedMetadataUnchanged,
      governedPrivateContentUnchanged: isolation.governedPrivateContentUnchanged,
      governedPrivateMetadataUnchanged: isolation.governedPrivateMetadataUnchanged,
      gitStatusUnchanged: isolation.gitStatusUnchanged,
      nonIgnoredUntrackedContentUnchanged: isolation.nonIgnoredUntrackedContentUnchanged,
      nonIgnoredUntrackedMetadataUnchanged: isolation.nonIgnoredUntrackedMetadataUnchanged,
      userRefsUnchanged: isolation.userRefsUnchanged,
      systemRefsUnchanged: isolation.systemRefsUnchanged,
    };
    if (checks.actualHeadMatchesExpected !== true
        || checks.defaultTestChainInvocationCount !== 1
        || checks.defaultTestTotalSkips !== 0
        || checks.defaultTestSkipSummaryPresent !== true
        || checks.defaultTestSkipIdentityCountMatchesSummary !== true
        || checks.providerRequestDelta !== 0
        || checks.databaseConnections !== 0
        || checks.actualExternalFetchCount !== 0
        || Object.entries(checks).some(([key, value]) => (
          ![
            "defaultTestChainInvocationCount", "defaultTestTotalSkips", "providerRequestDelta",
            "databaseConnections", "actualExternalFetchCount",
          ].includes(key)
          && value !== true
        ))) throw new Error("local_validation_invariant_failed");

    const receipt = {
      schema: "m2.v2.pr7.s1-local-validation-receipt.v0.1",
      passed: true,
      generatedAt,
      batchId: options.batchId,
      actualHead,
      actualBranch: preflight.actualBranch,
      startingHead: preflight.startingHead,
      findingHead: preflight.findingHead,
      baseSha: preflight.baseSha,
      selectedCommandId: "s1.validate.local",
      taskManifestSha256: preflight.taskManifestSha256,
      commandRegistrySha256: preflight.commandRegistrySha256,
      contractRegistrySha256: preflight.contractRegistrySha256,
      caseRegistrySha256: preflight.caseRegistrySha256,
      receiptSchemaSha256: preflight.receiptSchemaSha256,
      sourceEvidence: preflight.sourceEvidence,
      externalEnvironment: preflight.externalEnvironment,
      capabilities: preflight.capabilities,
      checks,
      executions,
      fallbackEvents: [],
    };
    validateS1Receipt(receipt, receiptSchema);
    if (options.receipt) writeIgnoredReceipt(options.receipt, receipt);
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  } catch (error) {
    const receipt = {
      schema: "m2.v2.pr7.s1-local-validation-receipt.v0.1",
      passed: false,
      generatedAt,
      batchId: options.batchId ?? "B1",
      actualHead,
      checks: {},
      executions,
      fallbackEvents: [],
      failureStage,
      error: sanitizeError(error),
    };
    validateS1Receipt(receipt, receiptSchema);
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
    process.exitCode = 1;
  }
}

function parseArguments(args) {
  const options = { expectedHead: null, batchId: "B1", receipt: null };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const equals = argument.indexOf("=");
    const flag = equals >= 0 ? argument.slice(0, equals) : argument;
    const value = equals >= 0 ? argument.slice(equals + 1) : args[++index];
    if (!["--expected-head", "--batch-id", "--receipt"].includes(flag)) throw new Error("unsupported_argument");
    if (typeof value !== "string" || value === "") throw new Error("argument_value_required");
    const key = flag.slice(2).replace(/-([a-z])/gu, (_match, letter) => letter.toUpperCase());
    options[key] = value;
  }
  if (!S1_BATCHES.includes(options.batchId)) throw new Error("batch_id_not_authorized");
  return options;
}

function executeRegistered(command, extraArgv, { preserveExternalEnvironment }) {
  const executable = process.platform === "win32" && command.executable === "node"
    ? process.execPath
    : command.executable;
  const started = Date.now();
  const child = spawnSync(executable, [...command.argv, ...extraArgv], {
    cwd: root,
    env: preserveExternalEnvironment ? process.env : providerFreeEnvironment(),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: command.timeoutSeconds * 1000,
    windowsHide: true,
  });
  return {
    commandId: command.commandId,
    status: child.status,
    signal: child.signal ?? null,
    errorCode: child.error?.code ?? null,
    durationMs: Date.now() - started,
    stdout: child.stdout ?? "",
    stderr: child.stderr ?? "",
    passed: child.status === 0 && child.signal === null && !child.error,
  };
}

function providerFreeEnvironment() {
  return {
    ...process.env,
    NODE_OPTIONS: appendNodeOption(process.env.NODE_OPTIONS, "--test-reporter=tap"),
    OPENAI_API_KEY: "",
    OPENAI_BASE_URL: "",
    TAVILY_API_KEY: "",
    M2_V2_EVIDENCE_API_BASE_URL: "",
    M2_V2_EVIDENCE_APPROVED_HOST: "",
    M2_V2_APPROVED_RELAY_HOST: "",
    M2_V2_EVIDENCE_PROVIDER: "",
    M2_V2_SEARCH_PROVIDER: "",
    M2_V2_TAVILY_BASE_URL: "",
    M1_DATABASE_URL: "",
    M1_DATABASE_READONLY_URL: "",
    M1_DATABASE_BACKGROUND_URL: "",
    DATABASE_URL: "",
    PGHOST: "",
    PGPORT: "",
    PGDATABASE: "",
    PGUSER: "",
    PGPASSWORD: "",
  };
}

function appendNodeOption(current, option) {
  const normalized = String(current ?? "").trim();
  if (normalized.includes(option)) return normalized;
  return [normalized, option].filter(Boolean).join(" ");
}

function publicExecution(execution) {
  return {
    commandId: execution.commandId,
    passed: execution.passed,
    exitCode: Number.isSafeInteger(execution.status) ? execution.status : -1,
    durationMs: execution.durationMs,
    stdoutBytes: Buffer.byteLength(execution.stdout),
    stdoutSha256: sha256(Buffer.from(execution.stdout)),
    stderrBytes: Buffer.byteLength(execution.stderr),
    stderrSha256: sha256(Buffer.from(execution.stderr)),
    failureSummary: execution.passed ? {} : boundedFailureSummary(execution),
  };
}

function boundedFailureSummary(execution) {
  const machine = parseMachineFailureEvidence(execution.stdout);
  if (machine) return machine;
  let parsed = null;
  try {
    parsed = JSON.parse(execution.stdout);
  } catch {
    // Only digests and process categories are returned below.
  }
  return {
    process: {
      signal: typeof execution.signal === "string" ? execution.signal : null,
      errorCode: typeof execution.errorCode === "string" ? execution.errorCode : null,
    },
    childReceipt: parsed?.passed === false ? {
      schemaSha256: typeof parsed.schema === "string" ? sha256(parsed.schema) : null,
      failureStageSha256: typeof parsed.failureStage === "string" ? sha256(parsed.failureStage) : null,
      reasonCodeSha256: typeof parsed.error?.reasonCode === "string" ? sha256(parsed.error.reasonCode) : null,
      messageDigest: /^[0-9a-f]{64}$/u.test(parsed.error?.messageDigest ?? "") ? parsed.error.messageDigest : null,
    } : null,
  };
}

function parseJsonOutput(output) {
  try {
    return JSON.parse(output);
  } catch {
    throw new Error("registered_command_output_not_json");
  }
}

function writeIgnoredReceipt(receipt, payload) {
  const path = resolveInside(receipt);
  const allowedRoot = resolve(root, outputRoot);
  if (!path.startsWith(`${allowedRoot}${sep}`)) throw new Error("receipt_outside_authorized_output");
  const relativePath = normalizePath(relative(root, path));
  if (gitStatus(["check-ignore", "--quiet", "--", relativePath]) !== 0) throw new Error("receipt_path_not_ignored");
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    renameSync(temporary, path);
  } finally {
    if (existsSync(temporary)) rmSync(temporary, { force: true });
  }
}

function resolveInside(path) {
  const resolved = resolve(root, path);
  if (resolved !== root && !resolved.startsWith(`${root}${sep}`)) throw new Error("path_outside_repository");
  return resolved;
}

function safeGitHead() {
  const child = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", windowsHide: true });
  const value = String(child.stdout ?? "").trim();
  return child.status === 0 && /^[0-9a-f]{40}$/u.test(value) ? value : "0".repeat(40);
}

function gitStatus(argv) {
  return spawnSync("git", argv, { cwd: root, stdio: "ignore", windowsHide: true }).status;
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
