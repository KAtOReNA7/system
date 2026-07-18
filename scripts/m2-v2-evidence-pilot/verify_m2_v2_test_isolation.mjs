#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
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
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const DEFAULT_PRIVATE_ROOTS = ["data/private-output"];
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const RECEIPT_ROOT = "data/private-output/m2-v2-pr7-p1-remediation";

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

  let before;
  try {
    before = captureRepositoryState({ root, privateRoots });
  } catch (error) {
    emitFailure("before_snapshot_failed", error);
    return;
  }

  const child = spawnSync(command[0], command.slice(1), {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "test",
      OPENAI_API_KEY: "",
      OPENAI_BASE_URL: "",
      TAVILY_API_KEY: "",
      M2_V2_EVIDENCE_API_BASE_URL: "",
      M2_V2_EVIDENCE_APPROVED_HOST: "",
      M2_V2_APPROVED_RELAY_HOST: "",
      M2_V2_EVIDENCE_PROVIDER: "",
      M2_V2_SEARCH_PROVIDER: "",
      M2_V2_TAVILY_BASE_URL: "",
    },
    stdio: "ignore",
    timeout: timeoutMs,
    windowsHide: true,
  });

  let after;
  try {
    after = captureRepositoryState({ root, privateRoots });
  } catch (error) {
    emitFailure("after_snapshot_failed", error, {
      childExitCode: child.status,
      childSignal: child.signal ?? null,
    });
    return;
  }

  const comparisons = compareStates(before, after);
  const childCompleted = child.status !== null && child.signal === null && !child.error;
  const childPassed = childCompleted && child.status === 0;
  const passed = childPassed && Object.values(comparisons).every(Boolean);
  const result = {
    schema: "m2.v2.default-test-isolation-proof.v0.2",
    passed,
    proofScope: options.syntheticFixture ? "synthetic_fixture" : "full_npm_test",
    childCompleted,
    childPassed,
    childExitCode: child.status,
    childSignal: child.signal ?? null,
    childErrorCode: child.error?.code ?? null,
    timedOut: child.error?.code === "ETIMEDOUT" || child.signal === "SIGTERM",
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

  return {
    tracked,
    privateState,
    nonIgnoredUntracked,
    gitStatus: {
      entryCount: parseNullSeparated(gitStatusRaw).length,
      digest: sha256(Buffer.from(gitStatusRaw, "utf8")),
    },
  };
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
  };
}

function writeReceiptAfterComparison({ root, receipt, result }) {
  const receiptPath = resolveInside(root, receipt);
  const allowedRoot = resolveInside(root, RECEIPT_ROOT);
  if (!isInside(allowedRoot, receiptPath) || receiptPath === allowedRoot) {
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
    schema: "m2.v2.default-test-isolation-proof.v0.2",
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
