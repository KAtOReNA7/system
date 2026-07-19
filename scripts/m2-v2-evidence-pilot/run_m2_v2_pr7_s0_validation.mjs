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
  resolveRegisteredCommand,
  sha256,
  stableStringify,
  validateCommandRegistry,
} from "./m2_v2_pr7_s0_contract.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const registryPath = resolve(root, "config/m2-v2-pr7-s0-command-registry.v0.1.json");
const outputRoot = "data/private-output/m2-v2-pr7-s0-support-implementation-627f74";
const defaultReceipt = `${outputRoot}/s0-local-validation-receipt-private-v0.1.json`;
const isolationReceipt = `${outputRoot}/s0-default-test-isolation-receipt-private-v0.1.json`;

main();

function main() {
  const generatedAt = new Date().toISOString();
  let actualHead = "0000000000000000000000000000000000000000";
  let receiptPath = defaultReceipt;
  const executions = [];
  try {
    const options = parseArguments(process.argv.slice(2));
    receiptPath = options.receipt ?? defaultReceipt;
    if (!/^[0-9a-f]{40}$/u.test(options.expectedHead ?? "")) {
      throw new Error("expected_head_is_required_and_must_be_full_sha");
    }
    actualHead = runGit(["rev-parse", "HEAD"]).trim();
    if (actualHead !== options.expectedHead) throw new Error("expected_head_mismatch");

    const registry = JSON.parse(readFileSync(registryPath, "utf8"));
    validateCommandRegistry(registry);
    const plan = [
      { id: "s0.doctor", extraArgv: [`--expected-head=${actualHead}`] },
      { id: "s0.default.isolated", extraArgv: ["--receipt", isolationReceipt] },
      { id: "s0.artifacts.default", extraArgv: [] },
      { id: "s0.skips.default", extraArgv: [] },
      { id: "s0.focused.artifacts-external", extraArgv: [] },
      { id: "s0.focused.authority-event", extraArgv: [] },
      { id: "s0.focused.filesystem-ooxml", extraArgv: [] },
      { id: "s0.artifacts.optional-private", extraArgv: [] },
    ];
    for (const item of plan) {
      const command = resolveRegisteredCommand(registry, item.id);
      const execution = executeRegistered(command, item.extraArgv);
      executions.push(execution);
      if (!execution.passed) throw new Error(`registered_command_failed_${item.id}`);
    }

    const isolationExecution = executions.find((entry) => entry.commandId === "s0.default.isolated");
    const isolation = parseJsonOutput(isolationExecution.stdout);
    if (isolation.defaultTestChainInvocationCount !== 1
        || isolation.defaultTestTotalSkips !== 0
        || isolation.providerRequestDelta !== 0
        || isolation.userRefsUnchanged !== true
        || isolation.governedPrivateContentUnchanged !== true
        || isolation.governedPrivateMetadataUnchanged !== true) {
      throw new Error("isolated_default_chain_contract_failed");
    }

    const s0Gates = [
      gate("S0-01", ["s0.doctor", "s0.default.isolated"]),
      gate("S0-02", ["s0.artifacts.default", "s0.skips.default", "s0.focused.artifacts-external", "s0.artifacts.optional-private"]),
      gate("S0-03", ["s0.focused.artifacts-external"]),
      gate("S0-04", ["s0.focused.authority-event"]),
      gate("S0-05", ["s0.focused.filesystem-ooxml"]),
      gate("S0-06", ["s0.focused.filesystem-ooxml"]),
      gate("S0-07", ["s0.focused.authority-event"]),
    ];
    const receipt = {
      schema: "m2.v2.pr7.s0-local-validation-receipt.private.v0.1",
      privateOnly: true,
      generatedAt,
      actualHead,
      passed: s0Gates.every((entry) => entry.passed),
      defaultTestChainInvocationCount: isolation.defaultTestChainInvocationCount,
      defaultTestTotalSkips: isolation.defaultTestTotalSkips,
      providerRequestDelta: isolation.providerRequestDelta,
      databaseConnections: 0,
      s0Gates,
      executions: executions.map(publicExecution),
      fallbackEvents: [],
    };
    writeIgnoredReceipt(receiptPath, receipt);
    process.stdout.write(`${stableStringify(receipt)}\n`);
  } catch (error) {
    const receipt = {
      schema: "m2.v2.pr7.s0-local-validation-receipt.private.v0.1",
      privateOnly: true,
      generatedAt,
      actualHead,
      passed: false,
      executions: executions.map(publicExecution),
      fallbackEvents: [],
      error: sanitizeError(error),
    };
    try {
      writeIgnoredReceipt(receiptPath, receipt);
    } catch (receiptError) {
      receipt.receiptWriteError = sanitizeError(receiptError);
    }
    process.stdout.write(`${stableStringify(receipt)}\n`);
    process.exitCode = 1;
  }

  function gate(s0Id, commandIds) {
    return {
      s0Id,
      passed: commandIds.every((commandId) => executions.some((entry) => entry.commandId === commandId && entry.passed)),
      commandIds,
    };
  }
}

function parseArguments(args) {
  const options = { expectedHead: null, receipt: null };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const equals = argument.indexOf("=");
    const flag = equals >= 0 ? argument.slice(0, equals) : argument;
    const value = equals >= 0 ? argument.slice(equals + 1) : args[++index];
    if (typeof value !== "string" || value === "") throw new Error("argument_value_required");
    if (flag === "--expected-head") options.expectedHead = value;
    else if (flag === "--receipt") options.receipt = value;
    else throw new Error("unsupported_argument");
  }
  return options;
}

function executeRegistered(command, extraArgv) {
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const executable = resolveExecutable(command.executable);
  const child = spawnSync(executable, [...command.argv, ...extraArgv], {
    cwd: root,
    env: {
      ...process.env,
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
    },
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: command.timeoutSeconds * 1000,
    windowsHide: true,
  });
  const stdout = child.stdout ?? "";
  const stderr = child.stderr ?? "";
  return {
    commandId: command.commandId,
    executable: command.executable,
    argv: [...command.argv, ...extraArgv],
    startedAt,
    durationMs: Date.now() - started,
    exitCode: child.status,
    signal: child.signal ?? null,
    errorCode: child.error?.code ?? null,
    passed: child.status === 0 && child.signal === null && !child.error,
    stdout,
    stderr,
  };
}

function resolveExecutable(executable) {
  if (process.platform === "win32" && executable === "node") return process.execPath;
  return executable;
}

function publicExecution(execution) {
  return {
    commandId: execution.commandId,
    executable: execution.executable,
    argv: execution.argv,
    startedAt: execution.startedAt,
    durationMs: execution.durationMs,
    exitCode: execution.exitCode,
    signal: execution.signal,
    errorCode: execution.errorCode,
    passed: execution.passed,
    stdoutBytes: Buffer.byteLength(execution.stdout),
    stdoutSha256: sha256(Buffer.from(execution.stdout)),
    stderrBytes: Buffer.byteLength(execution.stderr),
    stderrSha256: sha256(Buffer.from(execution.stderr)),
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
  const authorizedRoot = resolve(root, outputRoot);
  if (!path.startsWith(`${authorizedRoot}${sep}`)) throw new Error("receipt_outside_authorized_output");
  const relativePath = normalizePath(relative(root, path));
  if (runGitStatus(["check-ignore", "--quiet", "--", relativePath]) !== 0) {
    throw new Error("receipt_path_not_ignored");
  }
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, `${stableStringify(payload)}\n`, { encoding: "utf8", flag: "wx" });
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

function runGit(argv) {
  const result = spawnSync("git", argv, { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`git_${argv[0]}_failed`);
  return result.stdout;
}

function runGitStatus(argv) {
  return spawnSync("git", argv, { cwd: root, windowsHide: true, stdio: "ignore" }).status;
}

function normalizePath(path) {
  return path.replaceAll("\\", "/");
}

function sanitizeError(error) {
  return {
    name: error instanceof Error ? error.name : "Error",
    code: typeof error?.code === "string" ? error.code : null,
    messageDigest: sha256(String(error?.message ?? error)),
  };
}
