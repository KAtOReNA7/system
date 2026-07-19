#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import {
  evaluateIsolationOrdering,
  parseTapSkipEvidence,
} from "./m2_v2_pr7_s0_contract.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const DEFAULT_PRIVATE_ROOTS = ["data/private-input", "data/private-output"];
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const RECEIPT_ROOTS = [
  "data/private-output/m2-v2-pr7-p1-remediation",
  "data/private-output/m2-v2-pr7-s0-support-implementation-627f74",
];

main();

function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    emitFailure("invalid_arguments", error);
    return;
  }

  const root = resolve(options.root ?? repositoryRoot);
  const privateRoots = (options.privateRoots.length > 0
    ? options.privateRoots
    : DEFAULT_PRIVATE_ROOTS).map((path) => resolveInside(root, path));
  const command = options.command ?? defaultTestCommand();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    assertSyntheticOverridesAreExplicit(options, root, command, privateRoots);
    assertGitRepository(root);
  } catch (error) {
    emitFailure("preflight_failed", error);
    return;
  }

  const eventSequence = [];
  const counterDirectory = mkdtempSync(join(tmpdir(), "m2-v2-s0-provider-counter-"));
  const providerCounterPath = join(counterDirectory, "provider-counter.txt");
  writeFileSync(providerCounterPath, "0\n", { encoding: "utf8", flag: "wx" });
  const providerCounterBefore = readProviderCounter(providerCounterPath);
  let before;
  try {
    before = captureRepositoryState({ root, privateRoots });
    eventSequence.push(sequenceEvent("before_snapshot_complete", eventSequence.length + 1));
  } catch (error) {
    rmSync(counterDirectory, { recursive: true, force: true });
    emitFailure("before_snapshot_failed", error);
    return;
  }

  eventSequence.push(sequenceEvent("default_test_start", eventSequence.length + 1));
  const childEnvironment = defaultChildEnvironment({ root, providerCounterPath });
  const child = spawnSync(command[0], command.slice(1), {
    cwd: root,
    env: childEnvironment,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
    timeout: timeoutMs,
    windowsHide: true,
  });
  eventSequence.push(sequenceEvent("default_test_finish", eventSequence.length + 1));

  let after;
  let providerCounterAfter;
  try {
    providerCounterAfter = readProviderCounter(providerCounterPath);
    after = captureRepositoryState({ root, privateRoots });
    eventSequence.push(sequenceEvent("after_snapshot_complete", eventSequence.length + 1));
  } catch (error) {
    rmSync(counterDirectory, { recursive: true, force: true });
    emitFailure("after_snapshot_failed", error, {
      childExitCode: child.status,
      childSignal: child.signal ?? null,
    });
    return;
  }

  const comparisons = compareStates(before, after);
  const ordering = evaluateIsolationOrdering({
    events: eventSequence,
    defaultTestChainInvocationCount: 1,
  });
  const skipEvidence = parseTapSkipEvidence(`${child.stdout ?? ""}\n${child.stderr ?? ""}`);
  const providerRequestDelta = providerCounterAfter - providerCounterBefore;
  const childCompleted = child.status !== null && child.signal === null && !child.error;
  const childPassed = childCompleted && child.status === 0;
  const skipPolicyPassed = options.syntheticFixture || skipEvidence.totalSkips === 0;
  const passed = childPassed
    && skipPolicyPassed
    && providerRequestDelta === 0
    && Object.values(comparisons).every(Boolean);
  const result = {
    schema: "m2.v2.default-test-isolation-proof.v0.3",
    passed,
    proofScope: options.syntheticFixture ? "synthetic_fixture" : "full_npm_test",
    events: eventSequence,
    ...ordering,
    childCompleted,
    childPassed,
    childExitCode: child.status,
    childSignal: child.signal ?? null,
    childErrorCode: child.error?.code ?? null,
    timedOut: child.error?.code === "ETIMEDOUT" || child.signal === "SIGTERM",
    defaultTestTotalSkips: skipEvidence.totalSkips,
    defaultTestSkipIdentities: skipEvidence.identities,
    defaultTestSkipSummaryPresent: skipEvidence.summaryPresent,
    defaultTestSkipIdentityCountMatchesSummary: skipEvidence.identityCountMatchesSummary,
    providerCounterBefore,
    providerCounterAfter,
    providerRequestDelta,
    ...comparisons,
    before: publicSnapshot(before),
    after: publicSnapshot(after),
    receiptWrittenAfterComparison: false,
  };

  if (options.receipt) {
    try {
      result.receiptWrittenAfterComparison = writeReceiptAfterComparison({
        root,
        receipt: options.receipt,
        result,
      });
    } catch (error) {
      result.passed = false;
      result.receiptError = sanitizeError(error);
    }
  }

  rmSync(counterDirectory, { recursive: true, force: true });

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.passed) process.exitCode = 1;
}

function parseArguments(args) {
  const options = {
    root: null,
    privateRoots: [],
    command: null,
    receipt: null,
    timeoutMs: null,
    syntheticFixture: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--synthetic-fixture") {
      options.syntheticFixture = true;
    } else if (argument === "--root") {
      options.root = requireValue(args, ++index, argument);
    } else if (argument === "--private-root") {
      options.privateRoots.push(requireValue(args, ++index, argument));
    } else if (argument === "--command-json") {
      const parsed = JSON.parse(requireValue(args, ++index, argument));
      if (!Array.isArray(parsed) || parsed.length === 0 || parsed.some((item) => typeof item !== "string")) {
        throw new Error("command_json_must_be_nonempty_string_array");
      }
      options.command = parsed;
    } else if (argument === "--receipt") {
      options.receipt = requireValue(args, ++index, argument);
    } else if (argument === "--timeout-ms") {
      const parsed = Number(requireValue(args, ++index, argument));
      if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error("timeout_ms_must_be_positive_integer");
      options.timeoutMs = parsed;
    } else {
      throw new Error("unsupported_argument");
    }
  }
  return options;
}

function requireValue(args, index, flag) {
  if (index >= args.length) throw new Error(`${flag.slice(2).replaceAll("-", "_")}_requires_value`);
  return args[index];
}

function defaultTestCommand() {
  if (process.platform === "win32") {
    const npmExecutable = String(process.env.npm_execpath ?? "").trim();
    if (npmExecutable && existsSync(npmExecutable)) {
      return [process.execPath, npmExecutable, "test"];
    }
    return ["npm.cmd", "test"];
  }
  return ["npm", "test"];
}

function defaultChildEnvironment({ root, providerCounterPath }) {
  const sentinelPath = join(root, "test/helpers/m2V2NoExternalSentinel.js");
  const sentinelOption = existsSync(sentinelPath)
    ? `--import=${pathToFileURL(sentinelPath).href}`
    : "";
  const nodeOptions = [String(process.env.NODE_OPTIONS ?? "").trim(), sentinelOption]
    .filter(Boolean)
    .join(" ");
  return {
    ...process.env,
    NODE_ENV: "test",
    NODE_OPTIONS: nodeOptions,
    M2_V2_S0_SENTINEL_AUTO_INSTALL: "1",
    M2_V2_S0_PROVIDER_COUNTER_FILE: providerCounterPath,
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

function readProviderCounter(path) {
  const raw = readFileSync(path, "utf8").trim();
  const parsed = raw.startsWith("{") ? JSON.parse(raw).providerCalls : Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("provider_counter_must_be_nonnegative_integer");
  return parsed;
}

function sequenceEvent(eventId, sequence) {
  return { eventId, sequence, recordedAt: new Date().toISOString() };
}

function assertSyntheticOverridesAreExplicit(options, root, command, privateRoots) {
  const defaults = {
    root: repositoryRoot,
    command: defaultTestCommand(),
    privateRoots: DEFAULT_PRIVATE_ROOTS.map((path) => resolveInside(repositoryRoot, path)),
  };
  const hasOverride = root !== defaults.root
    || JSON.stringify(command) !== JSON.stringify(defaults.command)
    || JSON.stringify(privateRoots) !== JSON.stringify(defaults.privateRoots);
  if (hasOverride && !options.syntheticFixture) throw new Error("snapshot_or_command_override_requires_synthetic_fixture");
  if (!options.syntheticFixture && command.join("\0") !== defaults.command.join("\0")) {
    throw new Error("production_proof_must_execute_full_npm_test");
  }
}

function assertGitRepository(root) {
  const result = runGit(root, ["rev-parse", "--is-inside-work-tree"]);
  if (result.trim() !== "true") throw new Error("root_is_not_git_worktree");
}

function captureRepositoryState({ root, privateRoots }) {
  const trackedPaths = parseNullSeparated(runGit(root, ["ls-files", "-z"]));
  const nonIgnoredUntrackedPaths = parseNullSeparated(
    runGit(root, ["ls-files", "--others", "--exclude-standard", "-z"]),
  );
  const tracked = snapshotPaths(root, trackedPaths);
  const nonIgnoredUntracked = snapshotPaths(root, nonIgnoredUntrackedPaths);
  const privateState = snapshotRoots(root, privateRoots);
  const gitStatusRaw = runGit(root, ["status", "--porcelain=v2", "--untracked-files=all", "-z"]);
  const refs = snapshotRefs(root);

  return {
    tracked,
    privateState,
    nonIgnoredUntracked,
    refs,
    gitStatus: {
      entryCount: parseNullSeparated(gitStatusRaw).length,
      digest: sha256(Buffer.from(gitStatusRaw, "utf8")),
    },
  };
}

function snapshotRefs(root) {
  const raw = runGit(root, ["for-each-ref", "--format=%(refname)%09%(objectname)%09%(symref)"]);
  const lines = raw.split(/\r?\n/u).filter(Boolean);
  const userRows = [];
  const systemRows = [];
  for (const line of lines) {
    const fields = line.split("\t");
    if (fields.length !== 3) throw new Error("git_ref_snapshot_shape_invalid");
    const row = {
      ref: fields[0],
      object: fields[1],
      symref: fields[2],
    };
    if (isSystemManagedRef(row.ref)) systemRows.push(row);
    else userRows.push(row);
  }
  return {
    classification: {
      systemPrefixes: ["refs/codex/", "refs/worktree/"],
      defaultClass: "user",
    },
    userCount: userRows.length,
    userDigest: sha256(userRows),
    systemCount: systemRows.length,
    systemDigest: sha256(systemRows),
  };
}

function isSystemManagedRef(ref) {
  return ref.startsWith("refs/codex/") || ref.startsWith("refs/worktree/");
}

function snapshotPaths(root, paths) {
  const contentRows = [];
  const metadataRows = [];
  for (const path of [...paths].sort((left, right) => left.localeCompare(right))) {
    const absolutePath = resolveInside(root, path);
    if (!existsSync(absolutePath)) {
      contentRows.push({ path, exists: false });
      metadataRows.push({ path, exists: false });
      continue;
    }
    const stats = lstatSync(absolutePath, { bigint: true });
    const kind = fileKind(stats);
    contentRows.push({
      path: normalizePath(path),
      kind,
      contentDigest: stats.isFile()
        ? sha256(readFileSync(absolutePath))
        : stats.isSymbolicLink()
          ? sha256(readlinkSync(absolutePath))
          : null,
    });
    metadataRows.push(metadataRow(normalizePath(path), stats, kind));
  }
  return summarizeSnapshot(contentRows, metadataRows);
}

function snapshotRoots(root, roots) {
  const contentRows = [];
  const metadataRows = [];
  for (const privateRoot of [...roots].sort((left, right) => left.localeCompare(right))) {
    const rootLabel = normalizePath(relative(root, privateRoot));
    if (!existsSync(privateRoot)) {
      contentRows.push({ root: rootLabel, exists: false });
      metadataRows.push({ root: rootLabel, exists: false });
      continue;
    }
    walk(privateRoot, (absolutePath) => {
      const stats = lstatSync(absolutePath, { bigint: true });
      const path = normalizePath(relative(root, absolutePath));
      const kind = fileKind(stats);
      metadataRows.push(metadataRow(path, stats, kind));
      if (stats.isFile()) {
        contentRows.push({ path, kind, contentDigest: sha256(readFileSync(absolutePath)) });
      } else if (stats.isSymbolicLink()) {
        contentRows.push({ path, kind, contentDigest: sha256(readlinkSync(absolutePath)) });
      }
    });
  }
  return summarizeSnapshot(contentRows, metadataRows);
}

function walk(directory, visitor) {
  visitor(directory);
  const stats = lstatSync(directory);
  if (!stats.isDirectory() || stats.isSymbolicLink()) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))) {
    walk(join(directory, entry.name), visitor);
  }
}

function metadataRow(path, stats, kind) {
  return {
    path,
    kind,
    size: stats.size.toString(),
    mode: Number(stats.mode),
    mtimeNs: stats.mtimeNs.toString(),
    ctimeNs: stats.ctimeNs.toString(),
  };
}

function fileKind(stats) {
  if (stats.isFile()) return "file";
  if (stats.isDirectory()) return "directory";
  if (stats.isSymbolicLink()) return "symlink";
  return "other";
}

function summarizeSnapshot(contentRows, metadataRows) {
  return {
    fileCount: contentRows.filter((row) => row.kind === "file").length,
    entryCount: metadataRows.length,
    contentDigest: sha256(contentRows),
    metadataDigest: sha256(metadataRows),
  };
}

function compareStates(before, after) {
  return {
    trackedContentUnchanged: before.tracked.contentDigest === after.tracked.contentDigest,
    trackedMetadataUnchanged: before.tracked.metadataDigest === after.tracked.metadataDigest,
    governedPrivateContentUnchanged: before.privateState.contentDigest === after.privateState.contentDigest,
    governedPrivateMetadataUnchanged: before.privateState.metadataDigest === after.privateState.metadataDigest,
    gitStatusUnchanged: before.gitStatus.digest === after.gitStatus.digest,
    nonIgnoredUntrackedContentUnchanged:
      before.nonIgnoredUntracked.contentDigest === after.nonIgnoredUntracked.contentDigest,
    nonIgnoredUntrackedMetadataUnchanged:
      before.nonIgnoredUntracked.metadataDigest === after.nonIgnoredUntracked.metadataDigest,
    userRefsUnchanged: before.refs.userDigest === after.refs.userDigest,
    systemRefsUnchanged: before.refs.systemDigest === after.refs.systemDigest,
  };
}

function publicSnapshot(state) {
  return {
    trackedFileCount: state.tracked.fileCount,
    trackedEntryCount: state.tracked.entryCount,
    trackedContentDigest: state.tracked.contentDigest,
    trackedMetadataDigest: state.tracked.metadataDigest,
    governedPrivateFileCount: state.privateState.fileCount,
    governedPrivateEntryCount: state.privateState.entryCount,
    governedPrivateContentDigest: state.privateState.contentDigest,
    governedPrivateMetadataDigest: state.privateState.metadataDigest,
    gitStatusEntryCount: state.gitStatus.entryCount,
    gitStatusDigest: state.gitStatus.digest,
    nonIgnoredUntrackedFileCount: state.nonIgnoredUntracked.fileCount,
    nonIgnoredUntrackedEntryCount: state.nonIgnoredUntracked.entryCount,
    nonIgnoredUntrackedContentDigest: state.nonIgnoredUntracked.contentDigest,
    nonIgnoredUntrackedMetadataDigest: state.nonIgnoredUntracked.metadataDigest,
    userRefCount: state.refs.userCount,
    userRefDigest: state.refs.userDigest,
    systemRefCount: state.refs.systemCount,
    systemRefDigest: state.refs.systemDigest,
    refClassification: state.refs.classification,
  };
}

function writeReceiptAfterComparison({ root, receipt, result }) {
  const receiptPath = resolveInside(root, receipt);
  const allowedRoots = RECEIPT_ROOTS.map((path) => resolveInside(root, path));
  if (!allowedRoots.some((allowedRoot) => isInside(allowedRoot, receiptPath))) {
    throw new Error("receipt_must_be_file_under_ignored_remediation_root");
  }
  const relativeReceipt = normalizePath(relative(root, receiptPath));
  const ignored = spawnSync("git", ["check-ignore", "--quiet", "--", relativeReceipt], {
    cwd: root,
    windowsHide: true,
    stdio: "ignore",
  });
  if (ignored.status !== 0) throw new Error("receipt_path_is_not_git_ignored");

  mkdirSync(dirname(receiptPath), { recursive: true });
  const temporaryPath = `${receiptPath}.${process.pid}.tmp`;
  const receiptPayload = {
    ...result,
    receiptWrittenAfterComparison: true,
  };
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(receiptPayload, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    renameSync(temporaryPath, receiptPath);
  } finally {
    if (existsSync(temporaryPath)) rmSync(temporaryPath, { force: true });
  }
  return true;
}

function runGit(root, args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error(`git_${args[0].replaceAll("-", "_")}_failed`);
  return result.stdout;
}

function parseNullSeparated(value) {
  return value.split("\0").filter(Boolean);
}

function resolveInside(root, path) {
  const resolved = isAbsolute(path) ? resolve(path) : resolve(root, path);
  if (!isInside(root, resolved) && resolved !== root) throw new Error("path_must_stay_inside_repository_root");
  return resolved;
}

function isInside(parent, child) {
  return child.startsWith(`${parent}${sep}`);
}

function normalizePath(path) {
  return path.replaceAll("\\", "/");
}

function emitFailure(stage, error, extra = {}) {
  process.stdout.write(`${JSON.stringify({
    schema: "m2.v2.default-test-isolation-proof.v0.3",
    passed: false,
    failureStage: stage,
    error: sanitizeError(error),
    ...extra,
  }, null, 2)}\n`);
  process.exitCode = 1;
}

function sanitizeError(error) {
  return {
    name: error instanceof Error ? error.name : "Error",
    code: typeof error?.code === "string" ? error.code : null,
    messageDigest: sha256(String(error?.message ?? error)),
  };
}

function sha256(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value), "utf8");
  return createHash("sha256").update(bytes).digest("hex");
}
