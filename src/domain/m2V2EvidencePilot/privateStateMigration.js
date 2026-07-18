import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export const MIGRATION_MANIFEST_SCHEMAS = Object.freeze([
  "m2.v2.private-state-migration-manifest.v0.1",
  "m2.v2.private-state-migration-manifest.v0.2",
]);

export const MIGRATION_ALLOWED_ENV_NAMES = Object.freeze([
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "TAVILY_API_KEY",
  "M2_V2_EVIDENCE_API_BASE_URL",
  "M2_V2_EVIDENCE_PROVIDER",
  "M2_V2_PILOT_COST_MODE",
  "M2_V2_PILOT_MAX_REQUESTS",
  "M2_V2_PROVIDER_PROBE_MAX_REQUESTS",
  "M2_V2_SEARCH_PROVIDER",
  "M2_V2_TAVILY_BASE_URL",
  "M2_V2_TAVILY_TOPIC",
  "M2_V2_TAVILY_SEARCH_DEPTH",
  "M2_V2_TAVILY_MAX_RESULTS",
  "M2_V2_TAVILY_COUNTRY",
  "M2_V2_TAVILY_PROJECT",
  "M2_V2_TAVILY_MAX_REQUESTS",
  "M2_V2_RELAY_EXTRACTION_MAX_REQUESTS",
  "M2_V2_RELAY_EXTRACTION_TIMEOUT_MS",
]);

const PRIVATE_PREFIX = "payload/data/private-output/m2-v2-evidence-pilot/";
const ENV_PATH = "payload/env/m2-v2-evidence.env.private";
const CONTROL_PATHS = new Set([
  "README-new-computer.md",
  "tools/restore_m2_v2_private_state_migration.ps1",
  "tools/verify_m2_v2_private_state_migration.ps1",
]);
const SYNTHETIC_TARGET_PREFIX = "m2-v2-migration-restore-validation-";

export function normalizeMigrationManifestPath(value, options = {}) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    throw new Error("migration_manifest_path_invalid");
  }
  const normalized = value.normalize("NFC").replace(/\\/gu, "/");
  if (normalized.startsWith("/") || normalized.startsWith("//") || isAbsolute(value)
    || /^[A-Za-z]:/u.test(normalized) || normalized.includes(":")) {
    throw new Error("migration_manifest_path_absolute");
  }
  const segments = normalized.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new Error("migration_manifest_path_traversal");
  }
  const platform = options.platform ?? process.platform;
  const scopePath = platform === "win32" ? normalized.toUpperCase() : normalized;
  const envScope = platform === "win32" ? ENV_PATH.toUpperCase() : ENV_PATH;
  const privateScope = platform === "win32" ? PRIVATE_PREFIX.toUpperCase() : PRIVATE_PREFIX;
  if (scopePath !== envScope && !scopePath.startsWith(privateScope)) {
    throw new Error("migration_manifest_path_out_of_scope");
  }
  return {
    normalized,
    comparisonKey: platform === "win32" ? normalized.toUpperCase() : normalized,
  };
}

export function validateMigrationPayloadSet({ extractRoot, manifest, platform = process.platform }) {
  if (!manifest || !MIGRATION_MANIFEST_SCHEMAS.includes(manifest.schema) || manifest.privateOnly !== true) {
    throw new Error("migration_manifest_contract_invalid");
  }
  if (!Array.isArray(manifest.entries) || manifest.entries.length === 0) {
    throw new Error("migration_manifest_entries_invalid");
  }
  if (!/^[a-f0-9]{40}$/u.test(String(manifest.sourceGit?.commit ?? ""))) {
    throw new Error("migration_manifest_source_commit_invalid");
  }
  const root = resolve(extractRoot);
  const payloadRoot = join(root, "payload");
  assertSafeTreeRoot(root);
  assertSafeTreeRoot(payloadRoot);
  const seenKeys = new Set();
  const seenIdentities = new Set();
  const verifiedEntries = [];
  for (const entry of manifest.entries) {
    const { normalized, comparisonKey } = normalizeMigrationManifestPath(entry?.relativePath, { platform });
    if (seenKeys.has(comparisonKey)) throw new Error("migration_manifest_path_duplicate");
    seenKeys.add(comparisonKey);
    if (!Number.isSafeInteger(entry?.sizeBytes) || entry.sizeBytes < 0) {
      throw new Error("migration_manifest_size_invalid");
    }
    const expectedDigest = String(entry?.sha256 ?? "").toLowerCase();
    if (!/^[a-f0-9]{64}$/u.test(expectedDigest)) throw new Error("migration_manifest_sha256_invalid");
    const sourcePath = resolve(root, ...normalized.split("/"));
    assertPathInside(root, sourcePath, "migration_manifest_path_escape");
    assertNoLinksOrReparse(root, sourcePath);
    const stat = lstatSync(sourcePath);
    if (!stat.isFile()) throw new Error("migration_payload_file_missing");
    if (stat.nlink !== 1) throw new Error("migration_payload_hardlink_rejected");
    const identity = `${stat.dev}:${stat.ino}`;
    if (stat.ino !== 0 && seenIdentities.has(identity)) throw new Error("migration_payload_file_identity_duplicate");
    seenIdentities.add(identity);
    if (stat.size !== entry.sizeBytes) throw new Error("migration_payload_size_mismatch");
    if (sha256File(sourcePath) !== expectedDigest) throw new Error("migration_payload_sha256_mismatch");
    const expectedRole = normalized === ENV_PATH ? "filtered_m2_v2_environment" : "m2_v2_evidence_pilot_private_state";
    if (entry.role !== expectedRole || entry.sensitive !== true) throw new Error("migration_manifest_entry_role_invalid");
    verifiedEntries.push({
      relativePath: normalized,
      comparisonKey,
      sourcePath,
      sizeBytes: stat.size,
      sha256: expectedDigest,
      role: String(entry.role ?? ""),
    });
  }

  const actualFiles = collectSafeFiles(root, payloadRoot).map((path) => {
    const rel = relative(root, path).replace(/\\/gu, "/").normalize("NFC");
    return normalizeMigrationManifestPath(rel, { platform });
  });
  const actualKeys = new Set(actualFiles.map((item) => item.comparisonKey));
  if (actualKeys.size !== actualFiles.length) throw new Error("migration_payload_actual_path_duplicate");
  if (actualKeys.size !== seenKeys.size
    || [...actualKeys].some((key) => !seenKeys.has(key))
    || [...seenKeys].some((key) => !actualKeys.has(key))) {
    throw new Error("migration_payload_manifest_exact_set_mismatch");
  }
  const bytes = verifiedEntries.reduce((total, entry) => total + entry.sizeBytes, 0);
  if (manifest.payloadFileCount !== undefined && manifest.payloadFileCount !== verifiedEntries.length) {
    throw new Error("migration_payload_manifest_count_mismatch");
  }
  if (manifest.payloadBytes !== undefined && Number(manifest.payloadBytes) !== bytes) {
    throw new Error("migration_payload_manifest_bytes_mismatch");
  }
  const controls = validateControlEntries({ root, manifest, platform, seenKeys });
  return {
    schema: "m2.v2.private-state-migration-payload-verification.v0.2",
    entries: verifiedEntries.sort((left, right) => left.comparisonKey.localeCompare(right.comparisonKey)),
    payloadFileCount: verifiedEntries.length,
    payloadBytes: bytes,
    exactSetDigest: sha256Json(verifiedEntries.map(({ relativePath, sizeBytes, sha256 }) => ({ relativePath, sizeBytes, sha256 }))),
    controlEntries: controls,
  };
}

function validateControlEntries({ root, manifest, platform, seenKeys }) {
  const supplied = manifest.controlEntries ?? [];
  if (!Array.isArray(supplied)) throw new Error("migration_control_entries_invalid");
  const controls = [];
  for (const entry of supplied) {
    const relativePath = normalizeControlPath(entry?.relativePath);
    if (!CONTROL_PATHS.has(relativePath)) throw new Error("migration_control_path_out_of_scope");
    const comparisonKey = platform === "win32" ? relativePath.toUpperCase() : relativePath;
    if (seenKeys.has(comparisonKey)) throw new Error("migration_manifest_path_duplicate");
    seenKeys.add(comparisonKey);
    if (!Number.isSafeInteger(entry?.sizeBytes) || entry.sizeBytes < 0 || !/^[a-f0-9]{64}$/u.test(String(entry?.sha256 ?? "").toLowerCase())) {
      throw new Error("migration_control_entry_invalid");
    }
    const expectedRole = relativePath.startsWith("tools/") ? "migration_tool" : "migration_readme";
    if (entry.role !== expectedRole || entry.sensitive !== false) throw new Error("migration_control_entry_role_invalid");
    const sourcePath = resolve(root, ...relativePath.split("/"));
    assertNoLinksOrReparse(root, sourcePath);
    const stat = lstatSync(sourcePath);
    if (!stat.isFile() || stat.nlink !== 1) throw new Error("migration_control_file_unsafe");
    if (stat.size !== entry.sizeBytes || sha256File(sourcePath) !== String(entry.sha256).toLowerCase()) {
      throw new Error("migration_control_digest_mismatch");
    }
    controls.push({ relativePath, comparisonKey, sizeBytes: stat.size, sha256: String(entry.sha256).toLowerCase(), role: expectedRole });
  }
  if (manifest.schema.endsWith("v0.2")) {
    const actual = collectSafeFiles(root, root)
      .map((path) => relative(root, path).replace(/\\/gu, "/").normalize("NFC"))
      .filter((path) => path !== "metadata/migration-manifest.private.json");
    const actualKeys = new Set(actual.map((path) => platform === "win32" ? path.toUpperCase() : path));
    if (actualKeys.size !== actual.length || actualKeys.size !== seenKeys.size
      || [...actualKeys].some((key) => !seenKeys.has(key))
      || [...seenKeys].some((key) => !actualKeys.has(key))) {
      throw new Error("migration_archive_manifest_exact_set_mismatch");
    }
    if (manifest.controlFileCount !== undefined && manifest.controlFileCount !== controls.length) {
      throw new Error("migration_control_manifest_count_mismatch");
    }
  }
  return controls.sort((left, right) => left.comparisonKey.localeCompare(right.comparisonKey));
}

function normalizeControlPath(value) {
  if (typeof value !== "string" || !value || value.includes("\0")) throw new Error("migration_control_path_invalid");
  const normalized = value.normalize("NFC").replace(/\\/gu, "/");
  const segments = normalized.split("/");
  if (normalized.startsWith("/") || normalized.startsWith("//") || /^[A-Za-z]:/u.test(normalized)
    || segments.some((segment) => !segment || segment === "." || segment === "..")) throw new Error("migration_control_path_invalid");
  return normalized;
}

export function restoreVerifiedPrivateStateMigration(options) {
  const targetRoot = resolve(options.targetRepoRoot);
  const extractRoot = resolve(options.extractRoot);
  const manifest = options.manifest ?? JSON.parse(readFileSync(join(extractRoot, "metadata", "migration-manifest.private.json"), "utf8"));
  if (options.faultAt) assertSyntheticFaultTarget(targetRoot);
  assertTargetRepository(targetRoot);
  assertNoLinksOrReparse(targetRoot, targetRoot);
  const verification = validateMigrationPayloadSet({ extractRoot, manifest, platform: options.platform });
  const declaredEnvNames = normalizeDeclaredEnvNames(manifest);
  const envEntry = verification.entries.find((entry) => entry.relativePath === ENV_PATH);
  if (!envEntry) throw new Error("migration_env_fragment_missing");
  const envValues = parseEnvFragment(envEntry.sourcePath, declaredEnvNames);
  assertGitBoundary(targetRoot);

  const destinationPrivate = join(targetRoot, "data", "private-output", "m2-v2-evidence-pilot");
  const envDestination = join(targetRoot, ".env.local");
  assertNoLinksOrReparse(targetRoot, dirname(destinationPrivate));
  assertNoLinksOrReparse(targetRoot, dirname(envDestination));
  const mergedEnv = buildMergedEnv(envDestination, envValues, declaredEnvNames);
  const privateEntries = verification.entries.filter((entry) => entry.relativePath.startsWith(PRIVATE_PREFIX));
  if (privateEntries.length === 0) throw new Error("migration_private_payload_empty");
  const destinationMatches = destinationMatchesEntries(destinationPrivate, privateEntries, options.platform);
  const envMatches = existsSync(envDestination) && readFileSync(envDestination).equals(mergedEnv);
  if (destinationMatches && envMatches) {
    return sanitizedResult("already_restored_noop", manifest, verification, { rollbackPerformed: false });
  }
  if (existsSync(destinationPrivate) && options.force !== true) {
    throw new Error("migration_private_destination_exists_use_force");
  }

  const baseTransactionId = `migration-${sha256Json({ exactSetDigest: verification.exactSetDigest, sourceCommit: manifest.sourceGit?.commit ?? null }).slice(0, 32)}`;
  const transactionParent = join(targetRoot, "data", "private-output", ".m2-v2-private-migration-transactions");
  const attempt = selectMigrationAttempt(transactionParent, baseTransactionId);
  const transactionId = attempt.transactionId;
  const transactionRoot = attempt.transactionRoot;
  const stagePrivate = join(transactionRoot, "candidate-private");
  const privateBackup = join(transactionRoot, "previous-private");
  const envCandidate = join(transactionRoot, "candidate-env.local");
  const envBackup = join(transactionRoot, "previous-env.local");
  const quarantinePrivate = join(transactionRoot, "rolled-back-candidate-private");
  const quarantineEnv = join(transactionRoot, "rolled-back-candidate-env.local");
  const receiptPath = resolve(targetRoot, options.receiptRelativePath
    ?? "data/private-output/m2-v2-pr7-p1-remediation/migration-restore-receipt-private-v0.1.json");
  assertPathInside(targetRoot, receiptPath, "migration_receipt_path_escape");
  mkdirSync(stagePrivate, { recursive: true });
  for (const entry of privateEntries) {
    const suffix = entry.relativePath.slice(PRIVATE_PREFIX.length);
    const destination = resolve(stagePrivate, ...suffix.split("/"));
    assertPathInside(stagePrivate, destination, "migration_copy_target_escape");
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(entry.sourcePath, destination);
    if (sha256File(destination) !== entry.sha256) throw new Error("migration_staged_copy_digest_mismatch");
  }
  durableWriteNew(envCandidate, mergedEnv);
  if (!destinationMatchesEntries(stagePrivate, privateEntries, options.platform)) {
    throw new Error("migration_staged_private_exact_set_invalid");
  }
  const before = {
    privatePresent: existsSync(destinationPrivate),
    privateDigest: existsSync(destinationPrivate) ? hashSafeTree(destinationPrivate) : null,
    envPresent: existsSync(envDestination),
    envDigest: existsSync(envDestination) ? sha256File(envDestination) : null,
  };
  const state = { privateBackup: false, privatePromoted: false, envBackup: false, envPromoted: false };
  writeJournal(transactionRoot, { status: "prepared", transactionId, before, providerRequestDelta: 0 });
  try {
    injectFault(options, "private_rename_before");
    if (before.privatePresent) {
      renameSync(destinationPrivate, privateBackup);
      state.privateBackup = true;
    }
    renameSync(stagePrivate, destinationPrivate);
    state.privatePromoted = true;
    injectFault(options, "private_rename_after");
    injectFault(options, "env_write_before");
    if (before.envPresent) {
      renameSync(envDestination, envBackup);
      state.envBackup = true;
    }
    renameSync(envCandidate, envDestination);
    state.envPromoted = true;
    injectFault(options, "env_write_after");
    injectFault(options, "git_check_before");
    assertGitBoundary(targetRoot);
    if (!destinationMatchesEntries(destinationPrivate, privateEntries, options.platform)
      || !readFileSync(envDestination).equals(mergedEnv)) {
      throw new Error("migration_post_promotion_verification_failed");
    }
    injectFault(options, "receipt_write_before");
    const receipt = sanitizedResult("restored", manifest, verification, {
      transactionId,
      rollbackPerformed: false,
      priorPrivateStateBackedUp: before.privatePresent,
      priorEnvironmentBackedUp: before.envPresent,
    });
    durableAtomicReplace(receiptPath, Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, "utf8"));
    writeJournal(transactionRoot, { status: "committed", transactionId, before, providerRequestDelta: 0 });
    return receipt;
  } catch (error) {
    const rollback = rollbackMigration({
      destinationPrivate,
      envDestination,
      privateBackup,
      envBackup,
      quarantinePrivate,
      quarantineEnv,
      before,
      state,
    });
    const failedReceipt = sanitizedResult("rolled_back", manifest, verification, {
      transactionId,
      rollbackPerformed: true,
      rollbackSucceeded: rollback.valid,
      failureCode: sanitizeErrorCode(error),
    });
    durableAtomicReplace(receiptPath, Buffer.from(`${JSON.stringify(failedReceipt, null, 2)}\n`, "utf8"));
    writeJournal(transactionRoot, { status: "rolled_back", transactionId, before, rollback, providerRequestDelta: 0 });
    const wrapped = new Error(`migration_restore_rolled_back:${sanitizeErrorCode(error)}`);
    wrapped.cause = error;
    throw wrapped;
  }
}

function rollbackMigration(input) {
  if (input.state.envPromoted && existsSync(input.envDestination)) renameSync(input.envDestination, input.quarantineEnv);
  if (input.state.envBackup && existsSync(input.envBackup)) renameSync(input.envBackup, input.envDestination);
  if (input.state.privatePromoted && existsSync(input.destinationPrivate)) renameSync(input.destinationPrivate, input.quarantinePrivate);
  if (input.state.privateBackup && existsSync(input.privateBackup)) renameSync(input.privateBackup, input.destinationPrivate);
  const privatePresent = existsSync(input.destinationPrivate);
  const envPresent = existsSync(input.envDestination);
  const valid = privatePresent === input.before.privatePresent
    && envPresent === input.before.envPresent
    && (!privatePresent || hashSafeTree(input.destinationPrivate) === input.before.privateDigest)
    && (!envPresent || sha256File(input.envDestination) === input.before.envDigest);
  return { valid, privateRestored: privatePresent === input.before.privatePresent, environmentRestored: envPresent === input.before.envPresent };
}

function selectMigrationAttempt(parent, baseTransactionId) {
  let ordinal = 1;
  while (true) {
    const transactionId = ordinal === 1 ? baseTransactionId : `${baseTransactionId}-retry${ordinal}`;
    const transactionRoot = join(parent, transactionId);
    if (!existsSync(transactionRoot)) return { transactionId, transactionRoot };
    const journalPath = join(transactionRoot, "transaction-journal-private-v0.1.json");
    let status = null;
    try { status = JSON.parse(readFileSync(journalPath, "utf8")).status; } catch { throw new Error("migration_existing_transaction_unreadable"); }
    if (status !== "rolled_back") throw new Error("migration_transaction_already_exists");
    ordinal += 1;
  }
}

function destinationMatchesEntries(destinationRoot, privateEntries, platform = process.platform) {
  if (!existsSync(destinationRoot)) return false;
  let files;
  try { files = collectSafeFiles(destinationRoot, destinationRoot); } catch { return false; }
  const expected = new Map(privateEntries.map((entry) => {
    const suffix = entry.relativePath.slice(PRIVATE_PREFIX.length).normalize("NFC");
    const key = platform === "win32" ? suffix.toUpperCase() : suffix;
    return [key, entry.sha256];
  }));
  if (files.length !== expected.size) return false;
  for (const file of files) {
    const suffix = relative(destinationRoot, file).replace(/\\/gu, "/").normalize("NFC");
    const key = platform === "win32" ? suffix.toUpperCase() : suffix;
    if (!expected.has(key) || expected.get(key) !== sha256File(file)) return false;
  }
  return true;
}

function normalizeDeclaredEnvNames(manifest) {
  const supplied = manifest.scope?.environmentVariableNames;
  if (!Array.isArray(supplied) || supplied.length === 0) throw new Error("migration_env_manifest_scope_invalid");
  const allowed = new Set(MIGRATION_ALLOWED_ENV_NAMES);
  const names = [];
  const seen = new Set();
  for (const value of supplied) {
    const name = String(value ?? "");
    if (!allowed.has(name)) throw new Error("migration_env_name_out_of_scope");
    if (seen.has(name)) throw new Error("migration_env_name_duplicate");
    seen.add(name);
    names.push(name);
  }
  return names;
}

function parseEnvFragment(path, declaredNames) {
  const declared = new Set(declaredNames);
  const values = new Map();
  for (const line of readFileSync(path, "utf8").split(/\r?\n/gu)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/u.exec(line);
    if (!match) throw new Error("migration_env_line_invalid");
    const name = match[1];
    if (!declared.has(name)) throw new Error("migration_env_name_out_of_scope");
    if (values.has(name)) throw new Error("migration_env_name_duplicate");
    if (!match[2].trim()) throw new Error("migration_env_required_value_missing");
    values.set(name, match[2]);
  }
  if (values.size !== declared.size || declaredNames.some((name) => !values.has(name))) {
    throw new Error("migration_env_exact_set_mismatch");
  }
  return values;
}

function buildMergedEnv(destination, values, names) {
  const prior = existsSync(destination) ? readFileSync(destination, "utf8") : "";
  const newline = prior.includes("\r\n") ? "\r\n" : "\n";
  const managed = new Set(names);
  const preserved = prior.split(/\r?\n/gu).filter((line, index, rows) => {
    if (index === rows.length - 1 && line === "") return false;
    if (line === "# M2 v2 evidence provider state restored from encrypted migration package") return false;
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/u.exec(line);
    return !match || !managed.has(match[1]);
  });
  if (preserved.length > 0 && preserved.at(-1) !== "") preserved.push("");
  preserved.push("# M2 v2 evidence provider state restored from encrypted migration package");
  for (const name of names) preserved.push(`${name}=${values.get(name)}`);
  return Buffer.from(`${preserved.join(newline)}${newline}`, "utf8");
}

function assertGitBoundary(root) {
  for (const probe of [".env.local", "data/private-output/m2-v2-evidence-pilot/probe.json", "data/private-output/.m2-v2-private-migration-transactions/probe.json"]) {
    const ignored = spawnSync("git", ["-C", root, "check-ignore", "-q", "--no-index", "--", probe], { encoding: "utf8" });
    if (ignored.status !== 0) throw new Error("migration_git_ignore_boundary_failed");
  }
  const tracked = spawnSync("git", ["-C", root, "ls-files", "--", ".env.local", "data/private-output/m2-v2-evidence-pilot"], { encoding: "utf8" });
  if (tracked.status !== 0 || tracked.stdout.trim()) throw new Error("migration_git_tracking_boundary_failed");
}

function assertTargetRepository(root) {
  if (!existsSync(join(root, ".git")) || !existsSync(join(root, "package.json"))) {
    throw new Error("migration_target_is_not_project_repository");
  }
}

function collectSafeFiles(root, current) {
  assertNoLinksOrReparse(root, current);
  const files = [];
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    assertNoLinksOrReparse(root, path);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error("migration_reparse_point_rejected");
    if (stat.isDirectory()) files.push(...collectSafeFiles(root, path));
    else if (stat.isFile()) {
      if (stat.nlink !== 1) throw new Error("migration_payload_hardlink_rejected");
      files.push(path);
    } else throw new Error("migration_payload_special_file_rejected");
  }
  return files;
}

function assertSafeTreeRoot(path) {
  if (!existsSync(path)) throw new Error("migration_payload_root_missing");
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("migration_reparse_point_rejected");
}

function assertNoLinksOrReparse(root, target) {
  const absoluteRoot = resolve(root);
  const absoluteTarget = resolve(target);
  assertPathInside(absoluteRoot, absoluteTarget, "migration_path_escape");
  const rel = relative(absoluteRoot, absoluteTarget);
  let cursor = absoluteRoot;
  const segments = rel ? rel.split(sep) : [];
  const paths = [absoluteRoot, ...segments.map((segment) => {
    cursor = join(cursor, segment);
    return cursor;
  })];
  for (const path of paths) {
    if (!existsSync(path)) continue;
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error("migration_reparse_point_rejected");
  }
  if (existsSync(absoluteTarget)) {
    const realRoot = realpathSync(absoluteRoot);
    const realTarget = realpathSync(absoluteTarget);
    assertPathInside(realRoot, realTarget, "migration_reparse_target_escape");
  }
}

function assertPathInside(root, target, code) {
  const prefix = resolve(root).replace(/[\\/]+$/u, "") + sep;
  const absolute = resolve(target);
  if (absolute !== resolve(root) && !absolute.startsWith(prefix)) throw new Error(code);
}

function assertSyntheticFaultTarget(root) {
  const tempPrefix = resolve(tmpdir()).replace(/[\\/]+$/u, "") + sep;
  if (!root.startsWith(tempPrefix) || !basename(root).startsWith(SYNTHETIC_TARGET_PREFIX)) {
    throw new Error("migration_fault_injection_requires_synthetic_temp_target");
  }
}

function injectFault(options, point) {
  if (options.faultAt === point) throw new Error(`synthetic_fault_${point}`);
}

function hashSafeTree(root) {
  const members = collectSafeFiles(root, root).map((path) => ({
    path: relative(root, path).replace(/\\/gu, "/"),
    size: lstatSync(path).size,
    sha256: sha256File(path),
  })).sort((left, right) => left.path.localeCompare(right.path));
  return sha256Json(members);
}

function writeJournal(transactionRoot, value) {
  durableAtomicReplace(join(transactionRoot, "transaction-journal-private-v0.1.json"), Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8"));
}

function durableWriteNew(path, bytes) {
  mkdirSync(dirname(path), { recursive: true });
  const descriptor = openSync(path, "wx", 0o600);
  try {
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function durableAtomicReplace(path, bytes) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.tmp-${process.pid}-${sha256Buffer(bytes).slice(0, 12)}`;
  try {
    if (existsSync(temp)) rmSync(temp, { force: true });
    durableWriteNew(temp, bytes);
    renameSync(temp, path);
  } finally {
    if (existsSync(temp)) rmSync(temp, { force: true });
  }
}

function sanitizedResult(status, manifest, verification, extra) {
  return {
    schema: "m2.v2.private-state-migration-restore-receipt.v0.2",
    privateOnly: true,
    status,
    sourceCommit: /^[a-f0-9]{40}$/u.test(String(manifest.sourceGit?.commit ?? "")) ? manifest.sourceGit.commit : null,
    payloadFileCount: verification.payloadFileCount,
    payloadBytes: verification.payloadBytes,
    exactSetDigest: verification.exactSetDigest,
    apiKeyValuesPersistedInReceipt: false,
    recoveryKeyDirectorySeparationVerifiedByRestore: false,
    separateTransferVerified: false,
    providerRequestDelta: 0,
    evidenceQueriesExecuted: 0,
    ...extra,
  };
}

function sanitizeErrorCode(error) {
  return String(error?.message ?? "migration_restore_failed").replace(/[^A-Za-z0-9_.:-]/gu, "_").slice(0, 200);
}

function sha256File(path) {
  return sha256Buffer(readFileSync(path));
}

function sha256Buffer(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sha256Json(value) {
  return sha256Buffer(Buffer.from(JSON.stringify(value), "utf8"));
}
