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
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";

export const M2_PR7_S1_CAPABILITY_ID = "m2-pr7-s1";
export const M2_PR7_S1_AUTHENTICITY_PATH =
  "data/private-output/m2-v2-pr7-s1-remediation-badbf45/s1-source-evidence-authenticity-private-v0.1.json";
export const PRIVATE_CAPABILITY_MANIFEST_PATH =
  "metadata/development-private-capability-bundle-manifest.v0.1.json";
export const PRIVATE_CAPABILITY_MANIFEST_SCHEMA =
  "development.private-capability-bundle-manifest.v0.1";

const PAYLOAD_PREFIX = "payload/";
const PRIVATE_OUTPUT_PREFIX = "data/private-output/";
const SYNTHETIC_TARGET_PREFIX = "m2-v2-capability-restore-validation-";
const S1_TASK_MANIFEST_PATH = "config/m2-v2-pr7-s1-task.v0.1.json";
const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_PAYLOAD_FILE_BYTES = 16 * 1024 * 1024;
const MAX_PAYLOAD_BYTES = 64 * 1024 * 1024;
const RECEIPT_RELATIVE_PATH =
  "data/private-output/m2-v2-pr7-s1-remediation-badbf45/capability-bundle-restore-receipt-private-v0.1.json";

export function normalizePrivateCapabilityRepositoryPath(value, options = {}) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    throw new Error("private_capability_path_invalid");
  }
  const normalized = value.normalize("NFC").replace(/\\/gu, "/");
  const segments = normalized.split("/");
  if (
    normalized.startsWith("/")
    || normalized.startsWith("//")
    || isAbsolute(value)
    || /^[A-Za-z]:/u.test(normalized)
    || normalized.includes(":")
    || segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("private_capability_path_unsafe");
  }
  if (!normalized.startsWith(PRIVATE_OUTPUT_PREFIX)) {
    throw new Error("private_capability_path_out_of_scope");
  }
  const comparisonKey = options.platform === "win32" || (options.platform ?? process.platform) === "win32"
    ? normalized.toUpperCase()
    : normalized;
  return { normalized, comparisonKey };
}

export function createM2Pr7S1CapabilityBundleStage({
  repoRoot,
  stagingRoot,
  sourceCommit,
  authenticityRelativePath = M2_PR7_S1_AUTHENTICITY_PATH,
  platform = process.platform,
}) {
  if (!/^[a-f0-9]{40}$/u.test(String(sourceCommit ?? ""))) {
    throw new Error("private_capability_source_commit_invalid");
  }
  const repository = resolve(repoRoot);
  const staging = resolve(stagingRoot);
  assertRepository(repository);
  assertExactCleanHead(repository, sourceCommit);
  if (existsSync(staging) && readdirSync(staging).length > 0) {
    throw new Error("private_capability_staging_not_empty");
  }
  mkdirSync(staging, { recursive: true });

  const {
    records: sourceRecords,
    sourceEvidenceManifestDigestBindingSha256,
  } = discoverM2Pr7S1SourceRecords({
    root: repository,
    authenticityRelativePath,
    platform,
  });
  assertSourceGitBoundary(repository, sourceRecords.map((record) => record.repositoryRelativePath));

  const entries = sourceRecords.map((record) => {
    const sourcePath = resolveRepositoryPath(repository, record.repositoryRelativePath, platform);
    assertNoLinksOrReparse(repository, sourcePath);
    const stat = lstatSync(sourcePath);
    if (!stat.isFile() || stat.nlink !== 1) {
      throw new Error("private_capability_source_file_unsafe");
    }
    const payloadRelativePath = `${PAYLOAD_PREFIX}${record.repositoryRelativePath}`;
    const destination = resolve(staging, ...payloadRelativePath.split("/"));
    assertPathInside(staging, destination, "private_capability_stage_path_escape");
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(sourcePath, destination);
    const sha256 = sha256File(destination);
    if (sha256 !== sha256File(sourcePath)) {
      throw new Error("private_capability_stage_copy_digest_mismatch");
    }
    return {
      payloadRelativePath,
      repositoryRelativePath: record.repositoryRelativePath,
      role: record.role,
      sourceId: record.sourceId,
      sensitive: true,
      sizeBytes: stat.size,
      sha256,
    };
  }).sort((left, right) => left.payloadRelativePath.localeCompare(right.payloadRelativePath));

  const manifest = {
    schema: PRIVATE_CAPABILITY_MANIFEST_SCHEMA,
    privateOnly: true,
    capabilityId: M2_PR7_S1_CAPABILITY_ID,
    sourceGit: { commit: sourceCommit },
    sourceEvidenceManifestDigestBindingSha256,
    environmentIncluded: false,
    providerCredentialsIncluded: false,
    databaseCredentialsIncluded: false,
    entries,
    payloadFileCount: entries.length,
    payloadBytes: entries.reduce((sum, entry) => sum + entry.sizeBytes, 0),
    exactSetDigest: exactSetDigest(entries),
  };
  const manifestPath = resolve(staging, ...PRIVATE_CAPABILITY_MANIFEST_PATH.split("/"));
  mkdirSync(dirname(manifestPath), { recursive: true });
  durableWriteNew(manifestPath, Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8"));
  const verification = validateM2Pr7S1CapabilityBundlePayload({
    extractRoot: staging,
    manifest,
    platform,
  });
  return sanitizedBundleResult("staged", manifest, verification);
}

export function validateM2Pr7S1CapabilityBundlePayload({
  extractRoot,
  manifest,
  platform = process.platform,
}) {
  assertExactObjectKeys(manifest, [
    "schema",
    "privateOnly",
    "capabilityId",
    "sourceGit",
    "sourceEvidenceManifestDigestBindingSha256",
    "environmentIncluded",
    "providerCredentialsIncluded",
    "databaseCredentialsIncluded",
    "entries",
    "payloadFileCount",
    "payloadBytes",
    "exactSetDigest",
  ], "private_capability_manifest_fields_invalid");
  assertExactObjectKeys(
    manifest.sourceGit,
    ["commit"],
    "private_capability_source_git_fields_invalid",
  );
  if (
    !manifest
    || manifest.schema !== PRIVATE_CAPABILITY_MANIFEST_SCHEMA
    || manifest.privateOnly !== true
    || manifest.capabilityId !== M2_PR7_S1_CAPABILITY_ID
    || manifest.environmentIncluded !== false
    || manifest.providerCredentialsIncluded !== false
    || manifest.databaseCredentialsIncluded !== false
    || !/^[a-f0-9]{40}$/u.test(String(manifest.sourceGit?.commit ?? ""))
    || !/^[a-f0-9]{64}$/u.test(
      String(manifest.sourceEvidenceManifestDigestBindingSha256 ?? ""),
    )
    || !Array.isArray(manifest.entries)
    || manifest.payloadFileCount !== 9
    || !Number.isSafeInteger(manifest.payloadBytes)
    || manifest.payloadBytes < 0
    || manifest.payloadBytes > MAX_PAYLOAD_BYTES
  ) {
    throw new Error("private_capability_manifest_contract_invalid");
  }
  const root = resolve(extractRoot);
  assertSafeDirectory(root);
  const seen = new Set();
  const verifiedEntries = [];
  for (const entry of manifest.entries) {
    assertExactObjectKeys(entry, [
      "payloadRelativePath",
      "repositoryRelativePath",
      "role",
      "sourceId",
      "sensitive",
      "sizeBytes",
      "sha256",
    ], "private_capability_manifest_entry_fields_invalid");
    const repositoryPath = normalizePrivateCapabilityRepositoryPath(
      entry?.repositoryRelativePath,
      { platform },
    );
    const expectedPayloadPath = `${PAYLOAD_PREFIX}${repositoryPath.normalized}`;
    if (entry?.payloadRelativePath !== expectedPayloadPath) {
      throw new Error("private_capability_payload_path_binding_invalid");
    }
    const payloadPath = normalizeArchiveMemberPath(entry.payloadRelativePath, { platform });
    if (seen.has(payloadPath.comparisonKey)) {
      throw new Error("private_capability_manifest_path_duplicate");
    }
    seen.add(payloadPath.comparisonKey);
    if (
      !Number.isSafeInteger(entry.sizeBytes)
      || entry.sizeBytes < 0
      || entry.sizeBytes > MAX_PAYLOAD_FILE_BYTES
      || !/^[a-f0-9]{64}$/u.test(String(entry.sha256 ?? "").toLowerCase())
      || entry.sensitive !== true
      || !["s1_source_authenticity", "s1_source_report", "s1_source_receipt"].includes(entry.role)
    ) {
      throw new Error("private_capability_manifest_entry_invalid");
    }
    const sourcePath = resolve(root, ...payloadPath.normalized.split("/"));
    assertPathInside(root, sourcePath, "private_capability_payload_path_escape");
    assertNoLinksOrReparse(root, sourcePath);
    const stat = lstatSync(sourcePath);
    const expectedSha256 = String(entry.sha256).toLowerCase();
    if (
      !stat.isFile()
      || stat.nlink !== 1
      || stat.size !== entry.sizeBytes
      || sha256File(sourcePath) !== expectedSha256
    ) {
      throw new Error("private_capability_payload_integrity_mismatch");
    }
    verifiedEntries.push({
      payloadRelativePath: payloadPath.normalized,
      repositoryRelativePath: repositoryPath.normalized,
      comparisonKey: repositoryPath.comparisonKey,
      role: entry.role,
      sourceId: entry.sourceId ?? null,
      sizeBytes: stat.size,
      sha256: expectedSha256,
      sourcePath,
    });
  }
  if (verifiedEntries.length !== 9) {
    throw new Error("private_capability_payload_count_invalid");
  }
  const manifestEntry = verifiedEntries.find(
    (entry) => entry.repositoryRelativePath === M2_PR7_S1_AUTHENTICITY_PATH,
  );
  if (!manifestEntry || manifestEntry.role !== "s1_source_authenticity") {
    throw new Error("private_capability_authenticity_entry_missing");
  }
  validateS1EvidenceClosure(manifestEntry.sourcePath, verifiedEntries, platform);

  const actualFiles = collectSafeFiles(root, root)
    .map((filePath) => relative(root, filePath).replace(/\\/gu, "/").normalize("NFC"))
    .sort();
  const expectedFiles = [
    PRIVATE_CAPABILITY_MANIFEST_PATH,
    ...verifiedEntries.map((entry) => entry.payloadRelativePath),
  ].sort();
  const actualKeys = actualFiles.map((value) => comparisonKey(value, platform));
  const expectedKeys = expectedFiles.map((value) => comparisonKey(value, platform));
  if (
    new Set(actualKeys).size !== actualKeys.length
    || JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)
  ) {
    throw new Error("private_capability_archive_exact_set_mismatch");
  }
  const payloadBytes = verifiedEntries.reduce((sum, entry) => sum + entry.sizeBytes, 0);
  const computedExactSetDigest = exactSetDigest(verifiedEntries);
  if (
    manifest.payloadFileCount !== verifiedEntries.length
    || manifest.payloadBytes !== payloadBytes
    || manifest.exactSetDigest !== computedExactSetDigest
  ) {
    throw new Error("private_capability_manifest_aggregate_mismatch");
  }
  return {
    schema: "development.private-capability-bundle-verification.v0.1",
    capabilityId: M2_PR7_S1_CAPABILITY_ID,
    entries: verifiedEntries.sort((left, right) =>
      left.repositoryRelativePath.localeCompare(right.repositoryRelativePath)),
    payloadFileCount: verifiedEntries.length,
    payloadBytes,
    exactSetDigest: computedExactSetDigest,
    environmentIncluded: false,
    providerRequestDelta: 0,
  };
}

export function restoreM2Pr7S1CapabilityBundle({
  extractRoot,
  targetRepoRoot,
  manifest,
  force = false,
  faultAt = null,
  platform = process.platform,
}) {
  const targetRoot = resolve(targetRepoRoot);
  const root = resolve(extractRoot);
  if (faultAt) assertSyntheticFaultTarget(targetRoot);
  assertRepository(targetRoot);
  assertExactCleanHead(targetRoot, manifest?.sourceGit?.commit);
  assertNoLinksOrReparse(targetRoot, targetRoot);
  const verification = validateM2Pr7S1CapabilityBundlePayload({
    extractRoot: root,
    manifest,
    platform,
  });
  const authenticityEntry = verification.entries.find(
    (entry) => entry.repositoryRelativePath === M2_PR7_S1_AUTHENTICITY_PATH,
  );
  const targetBinding = assertS1EvidenceAgainstTrackedManifest(
    targetRoot,
    parseJson(
      authenticityEntry.sourcePath,
      "private_capability_authenticity_json_invalid",
    ),
  );
  if (
    targetBinding !== manifest.sourceEvidenceManifestDigestBindingSha256
  ) {
    throw new Error("private_capability_target_manifest_binding_mismatch");
  }
  assertTargetGitBoundary(
    targetRoot,
    verification.entries.map((entry) => entry.repositoryRelativePath),
  );
  const destinations = verification.entries.map((entry) => {
    const destination = resolveRepositoryPath(
      targetRoot,
      entry.repositoryRelativePath,
      platform,
    );
    assertNoLinksOrReparse(targetRoot, destination);
    const existingMatches = existsSync(destination)
      && lstatSync(destination).isFile()
      && sha256File(destination) === entry.sha256;
    return { ...entry, destination, existingMatches };
  });
  if (destinations.every((entry) => entry.existingMatches)) {
    return sanitizedBundleResult("already_restored_noop", manifest, verification, {
      rollbackPerformed: false,
    });
  }
  if (!force && destinations.some((entry) => existsSync(entry.destination) && !entry.existingMatches)) {
    throw new Error("private_capability_destination_exists_use_force");
  }

  const transactionBase = join(
    targetRoot,
    "data",
    "private-output",
    ".development-capability-transactions",
  );
  const { transactionId, transactionRoot } = allocateTransaction(
    transactionBase,
    verification.exactSetDigest,
  );
  const stagedRoot = join(transactionRoot, "candidate");
  const backupRoot = join(transactionRoot, "previous");
  const promoted = [];
  mkdirSync(stagedRoot, { recursive: true });
  for (const entry of destinations) {
    const staged = resolve(stagedRoot, ...entry.repositoryRelativePath.split("/"));
    assertPathInside(stagedRoot, staged, "private_capability_stage_path_escape");
    mkdirSync(dirname(staged), { recursive: true });
    copyFileSync(entry.sourcePath, staged);
    if (sha256File(staged) !== entry.sha256) {
      throw new Error("private_capability_staged_copy_digest_mismatch");
    }
    entry.staged = staged;
    entry.backup = resolve(backupRoot, ...entry.repositoryRelativePath.split("/"));
  }

  try {
    for (let index = 0; index < destinations.length; index += 1) {
      const entry = destinations[index];
      mkdirSync(dirname(entry.destination), { recursive: true });
      let backedUp = false;
      if (existsSync(entry.destination)) {
        mkdirSync(dirname(entry.backup), { recursive: true });
        renameSync(entry.destination, entry.backup);
        backedUp = true;
      }
      renameSync(entry.staged, entry.destination);
      promoted.push({ ...entry, backedUp });
      if (faultAt === "after_first_promotion" && index === 0) {
        throw new Error("synthetic_fault_after_first_promotion");
      }
    }
    if (
      destinations.some(
        (entry) => !existsSync(entry.destination) || sha256File(entry.destination) !== entry.sha256,
      )
    ) {
      throw new Error("private_capability_post_promotion_verification_failed");
    }
    if (faultAt === "before_receipt") throw new Error("synthetic_fault_before_receipt");
    const receipt = sanitizedBundleResult("restored", manifest, verification, {
      transactionId,
      rollbackPerformed: false,
      replacedExistingFileCount: promoted.filter((entry) => entry.backedUp).length,
    });
    durableAtomicReplace(
      resolve(targetRoot, RECEIPT_RELATIVE_PATH),
      Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, "utf8"),
    );
    return receipt;
  } catch (error) {
    const rollbackSucceeded = rollbackPromotions(promoted);
    const receipt = sanitizedBundleResult("rolled_back", manifest, verification, {
      transactionId,
      rollbackPerformed: true,
      rollbackSucceeded,
      failureCode: sanitizeErrorCode(error),
    });
    durableAtomicReplace(
      resolve(targetRoot, RECEIPT_RELATIVE_PATH),
      Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, "utf8"),
    );
    throw new Error(`private_capability_restore_rolled_back:${sanitizeErrorCode(error)}`);
  }
}

function discoverM2Pr7S1SourceRecords({ root, authenticityRelativePath, platform }) {
  const authenticityPath = normalizePrivateCapabilityRepositoryPath(
    authenticityRelativePath,
    { platform },
  ).normalized;
  if (authenticityPath !== M2_PR7_S1_AUTHENTICITY_PATH) {
    throw new Error("private_capability_authenticity_path_invalid");
  }
  const absolute = resolveRepositoryPath(root, authenticityPath, platform);
  const evidence = parseJson(absolute, "private_capability_authenticity_json_invalid");
  if (
    evidence.schema !== "m2.v2.pr7.s1-source-evidence-authenticity.private.v0.1"
    || evidence.privateOnly !== true
    || evidence.status !== "PASS"
    || !Array.isArray(evidence.sources)
    || evidence.sources.length !== 4
  ) {
    throw new Error("private_capability_authenticity_contract_invalid");
  }
  const sourceEvidenceManifestDigestBindingSha256 =
    assertS1EvidenceAgainstTrackedManifest(root, evidence);
  const records = [{
    repositoryRelativePath: authenticityPath,
    role: "s1_source_authenticity",
    sourceId: null,
  }];
  const sourceIds = new Set();
  for (const source of evidence.sources) {
    if (typeof source?.sourceId !== "string" || !source.sourceId || sourceIds.has(source.sourceId)) {
      throw new Error("private_capability_source_identity_invalid");
    }
    sourceIds.add(source.sourceId);
    if (source.matches !== true) throw new Error("private_capability_source_not_matched");
    for (const [field, role] of [
      ["reportPath", "s1_source_report"],
      ["receiptPath", "s1_source_receipt"],
    ]) {
      const repositoryRelativePath = normalizePrivateCapabilityRepositoryPath(
        source[field],
        { platform },
      ).normalized;
      records.push({
        repositoryRelativePath,
        role,
        sourceId: source.sourceId,
      });
    }
  }
  const keys = records.map((record) => comparisonKey(record.repositoryRelativePath, platform));
  if (new Set(keys).size !== records.length) {
    throw new Error("private_capability_source_path_duplicate");
  }
  validateS1EvidenceClosure(absolute, records.map((record) => ({
    ...record,
    sourcePath: resolveRepositoryPath(root, record.repositoryRelativePath, platform),
  })), platform);
  return { records, sourceEvidenceManifestDigestBindingSha256 };
}

function validateS1EvidenceClosure(authenticityPath, entries, platform) {
  const evidence = parseJson(authenticityPath, "private_capability_authenticity_json_invalid");
  assertS1AuthenticityEnvelope(evidence);
  const byPath = new Map(entries.map((entry) => [
    comparisonKey(entry.repositoryRelativePath, platform),
    entry,
  ]));
  const expected = new Set([comparisonKey(M2_PR7_S1_AUTHENTICITY_PATH, platform)]);
  for (const source of evidence.sources ?? []) {
    const reportPath = normalizePrivateCapabilityRepositoryPath(source.reportPath, { platform });
    const receiptPath = normalizePrivateCapabilityRepositoryPath(source.receiptPath, { platform });
    expected.add(reportPath.comparisonKey);
    expected.add(receiptPath.comparisonKey);
    const report = byPath.get(reportPath.comparisonKey);
    const receipt = byPath.get(receiptPath.comparisonKey);
    if (
      !report
      || report.role !== "s1_source_report"
      || report.sourceId !== source.sourceId
      || !receipt
      || receipt.role !== "s1_source_receipt"
      || receipt.sourceId !== source.sourceId
    ) {
      throw new Error("private_capability_source_closure_invalid");
    }
    if (
      sha256File(report.sourcePath) !== source.reportActualSha256
      || source.reportActualSha256 !== source.reportExpectedSha256
    ) {
      throw new Error("private_capability_source_report_digest_mismatch");
    }
    const receiptObject = parseJson(
      receipt.sourcePath,
      "private_capability_source_receipt_json_invalid",
    );
    const recomputed = canonicalReceiptDigest(receiptObject);
    if (
      receiptObject.receiptDigest !== source.receiptClaimedDigest
      || recomputed !== source.receiptRecomputedDigest
      || source.receiptClaimedDigest !== source.receiptExpectedDigest
      || source.receiptRecomputedDigest !== source.receiptExpectedDigest
    ) {
      throw new Error("private_capability_source_receipt_digest_mismatch");
    }
  }
  if (
    expected.size !== byPath.size
    || [...expected].some((key) => !byPath.has(key))
  ) {
    throw new Error("private_capability_source_exact_set_mismatch");
  }
}

function rollbackPromotions(promoted) {
  let valid = true;
  for (const entry of [...promoted].reverse()) {
    try {
      if (existsSync(entry.destination)) rmSync(entry.destination, { force: true });
      if (entry.backedUp && existsSync(entry.backup)) {
        mkdirSync(dirname(entry.destination), { recursive: true });
        renameSync(entry.backup, entry.destination);
      }
    } catch {
      valid = false;
    }
  }
  for (const entry of promoted) {
    if (entry.backedUp && !existsSync(entry.destination)) valid = false;
    if (!entry.backedUp && existsSync(entry.destination)) valid = false;
  }
  return valid;
}

function allocateTransaction(transactionBase, exactSetDigest) {
  mkdirSync(transactionBase, { recursive: true });
  const prefix = `capability-${exactSetDigest.slice(0, 32)}`;
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const transactionId = attempt === 0 ? prefix : `${prefix}-retry-${attempt}`;
    const transactionRoot = join(transactionBase, transactionId);
    try {
      mkdirSync(transactionRoot);
      return { transactionId, transactionRoot };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
  }
  throw new Error("private_capability_transaction_allocation_exhausted");
}

function assertSourceGitBoundary(root, paths) {
  assertPathsIgnoredAndUntracked(root, paths, "private_capability_source");
}

function assertTargetGitBoundary(root, paths) {
  assertPathsIgnoredAndUntracked(root, [
    ...paths,
    "data/private-output/.development-capability-transactions/probe.json",
    RECEIPT_RELATIVE_PATH,
  ], "private_capability_target");
}

function assertPathsIgnoredAndUntracked(root, paths, prefix) {
  for (const path of paths) {
    const ignored = spawnSync(
      "git",
      ["-C", root, "check-ignore", "-q", "--no-index", "--", path],
      { encoding: "utf8", windowsHide: true },
    );
    if (ignored.status !== 0) throw new Error(`${prefix}_not_ignored`);
  }
  const tracked = spawnSync(
    "git",
    ["-C", root, "ls-files", "--", ...paths],
    { encoding: "utf8", windowsHide: true },
  );
  if (tracked.status !== 0 || tracked.stdout.trim()) {
    throw new Error(`${prefix}_is_tracked`);
  }
}

function normalizeArchiveMemberPath(value, { platform }) {
  if (typeof value !== "string" || !value || value.includes("\0")) {
    throw new Error("private_capability_archive_path_invalid");
  }
  const normalized = value.normalize("NFC").replace(/\\/gu, "/");
  const segments = normalized.split("/");
  if (
    !normalized.startsWith(`${PAYLOAD_PREFIX}${PRIVATE_OUTPUT_PREFIX}`)
    || normalized.startsWith("/")
    || /^[A-Za-z]:/u.test(normalized)
    || normalized.includes(":")
    || segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("private_capability_archive_path_unsafe");
  }
  return { normalized, comparisonKey: comparisonKey(normalized, platform) };
}

function resolveRepositoryPath(root, repositoryRelativePath, platform) {
  const normalized = normalizePrivateCapabilityRepositoryPath(
    repositoryRelativePath,
    { platform },
  ).normalized;
  const result = resolve(root, ...normalized.split("/"));
  assertPathInside(root, result, "private_capability_repository_path_escape");
  return result;
}

function collectSafeFiles(root, current) {
  assertNoLinksOrReparse(root, current);
  const files = [];
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    assertNoLinksOrReparse(root, path);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error("private_capability_reparse_rejected");
    if (stat.isDirectory()) files.push(...collectSafeFiles(root, path));
    else if (stat.isFile() && stat.nlink === 1) files.push(path);
    else throw new Error("private_capability_special_or_hardlink_rejected");
  }
  return files;
}

function assertRepository(root) {
  if (!existsSync(join(root, ".git")) || !existsSync(join(root, "package.json"))) {
    throw new Error("private_capability_repository_invalid");
  }
}

function assertExactCleanHead(root, expectedHead) {
  if (!/^[a-f0-9]{40}$/u.test(String(expectedHead ?? ""))) {
    throw new Error("private_capability_expected_head_invalid");
  }
  const head = git(root, ["rev-parse", "HEAD"], "private_capability_git_head_failed");
  if (head !== expectedHead) throw new Error("private_capability_exact_head_mismatch");
  const trackedStatus = git(
    root,
    ["status", "--porcelain", "--untracked-files=no"],
    "private_capability_git_status_failed",
  );
  if (trackedStatus) throw new Error("private_capability_tracked_worktree_not_clean");
}

function assertS1EvidenceAgainstTrackedManifest(root, evidence) {
  assertS1AuthenticityEnvelope(evidence);
  const task = parseJson(
    resolve(root, ...S1_TASK_MANIFEST_PATH.split("/")),
    "private_capability_s1_task_manifest_invalid",
  );
  if (
    !Array.isArray(task.requiredSourceEvidence)
    || task.requiredSourceEvidence.length !== 4
  ) {
    throw new Error("private_capability_s1_task_sources_invalid");
  }
  const binding = sha256Buffer(Buffer.from(
    stableStringify(task.requiredSourceEvidence),
    "utf8",
  ));
  if (
    evidence.manifestDigestBindingSha256 !== binding
    || !Array.isArray(evidence.sources)
    || evidence.sources.length !== task.requiredSourceEvidence.length
  ) {
    throw new Error("private_capability_s1_manifest_binding_invalid");
  }
  const actualById = new Map();
  for (const source of evidence.sources) {
    if (
      typeof source?.sourceId !== "string"
      || actualById.has(source.sourceId)
    ) {
      throw new Error("private_capability_s1_source_identity_invalid");
    }
    actualById.set(source.sourceId, source);
  }
  for (const expected of task.requiredSourceEvidence) {
    const actual = actualById.get(expected.sourceId);
    if (
      !actual
      || actual.reportExpectedSha256 !== expected.reportSha256
      || actual.reportActualSha256 !== expected.reportSha256
      || actual.receiptExpectedDigest !== expected.receiptDigest
      || actual.receiptClaimedDigest !== expected.receiptDigest
      || actual.receiptRecomputedDigest !== expected.receiptDigest
      || actual.matches !== true
    ) {
      throw new Error("private_capability_s1_source_digest_binding_invalid");
    }
  }
  return binding;
}

function assertS1AuthenticityEnvelope(evidence) {
  assertExactObjectKeys(evidence, [
    "schema",
    "privateOnly",
    "generatedAt",
    "canonicalization",
    "manifestDigestBindingSha256",
    "status",
    "sources",
  ], "private_capability_authenticity_fields_invalid");
  if (
    evidence.schema !== "m2.v2.pr7.s1-source-evidence-authenticity.private.v0.1"
    || evidence.privateOnly !== true
    || typeof evidence.generatedAt !== "string"
    || Number.isNaN(Date.parse(evidence.generatedAt))
    || typeof evidence.canonicalization !== "string"
    || !evidence.canonicalization.trim()
    || !/^[a-f0-9]{64}$/u.test(String(evidence.manifestDigestBindingSha256 ?? ""))
    || evidence.status !== "PASS"
    || !Array.isArray(evidence.sources)
    || evidence.sources.length !== 4
  ) {
    throw new Error("private_capability_authenticity_contract_invalid");
  }
  for (const source of evidence.sources) {
    assertExactObjectKeys(source, [
      "sourceId",
      "reportExpectedSha256",
      "reportActualSha256",
      "reportPath",
      "receiptExpectedDigest",
      "receiptClaimedDigest",
      "receiptRecomputedDigest",
      "receiptPath",
      "matches",
    ], "private_capability_authenticity_source_fields_invalid");
    for (const field of [
      "reportExpectedSha256",
      "reportActualSha256",
      "receiptExpectedDigest",
      "receiptClaimedDigest",
      "receiptRecomputedDigest",
    ]) {
      if (!/^[a-f0-9]{64}$/u.test(String(source[field] ?? ""))) {
        throw new Error("private_capability_authenticity_source_digest_invalid");
      }
    }
  }
}

function assertExactObjectKeys(value, expected, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(code);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(code);
  }
}

function assertSafeDirectory(path) {
  if (!existsSync(path)) throw new Error("private_capability_root_missing");
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error("private_capability_root_unsafe");
  }
}

function assertNoLinksOrReparse(root, target) {
  const absoluteRoot = resolve(root);
  const absoluteTarget = resolve(target);
  assertPathInside(absoluteRoot, absoluteTarget, "private_capability_path_escape");
  const rel = relative(absoluteRoot, absoluteTarget);
  let cursor = absoluteRoot;
  const paths = [absoluteRoot];
  for (const segment of rel ? rel.split(sep) : []) {
    cursor = join(cursor, segment);
    paths.push(cursor);
  }
  for (const path of paths) {
    if (existsSync(path) && lstatSync(path).isSymbolicLink()) {
      throw new Error("private_capability_reparse_rejected");
    }
  }
  if (existsSync(absoluteTarget)) {
    assertPathInside(
      realpathSync(absoluteRoot),
      realpathSync(absoluteTarget),
      "private_capability_reparse_target_escape",
    );
  }
}

function assertPathInside(root, target, code) {
  const absoluteRoot = resolve(root);
  const prefix = absoluteRoot.replace(/[\\/]+$/u, "") + sep;
  const absoluteTarget = resolve(target);
  if (absoluteTarget !== absoluteRoot && !absoluteTarget.startsWith(prefix)) {
    throw new Error(code);
  }
}

function assertSyntheticFaultTarget(root) {
  const prefix = resolve(tmpdir()).replace(/[\\/]+$/u, "") + sep;
  if (!root.startsWith(prefix) || !basename(root).startsWith(SYNTHETIC_TARGET_PREFIX)) {
    throw new Error("private_capability_fault_injection_requires_synthetic_target");
  }
}

function parseJson(path, code) {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.size > MAX_MANIFEST_BYTES) throw new Error(code);
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(code);
  }
}

function git(root, args, code) {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error(code);
  return result.stdout.trim();
}

function exactSetDigest(entries) {
  return sha256Json(entries.map((entry) => ({
    repositoryRelativePath: entry.repositoryRelativePath,
    role: entry.role,
    sourceId: entry.sourceId ?? null,
    sizeBytes: entry.sizeBytes,
    sha256: entry.sha256,
  })).sort((left, right) =>
    left.repositoryRelativePath.localeCompare(right.repositoryRelativePath)));
}

function canonicalReceiptDigest(receipt) {
  const copy = structuredClone(receipt);
  delete copy.receiptDigest;
  return sha256Buffer(Buffer.from(stableStringify(copy), "utf8"));
}

function stableStringify(value) {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]),
  );
}

function comparisonKey(value, platform) {
  return platform === "win32" ? value.toUpperCase() : value;
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
  const temporary = `${path}.tmp-${process.pid}-${sha256Buffer(bytes).slice(0, 12)}`;
  try {
    if (existsSync(temporary)) rmSync(temporary, { force: true });
    durableWriteNew(temporary, bytes);
    renameSync(temporary, path);
  } finally {
    if (existsSync(temporary)) rmSync(temporary, { force: true });
  }
}

function sanitizedBundleResult(status, manifest, verification, extra = {}) {
  return {
    schema: "development.private-capability-bundle-result.v0.1",
    privateOnly: true,
    capabilityId: M2_PR7_S1_CAPABILITY_ID,
    status,
    sourceCommit: manifest.sourceGit.commit,
    payloadFileCount: verification.payloadFileCount,
    payloadBytes: verification.payloadBytes,
    exactSetDigest: verification.exactSetDigest,
    environmentIncluded: false,
    providerCredentialsIncluded: false,
    databaseCredentialsIncluded: false,
    secretValuesPersistedInReceipt: false,
    providerRequestDelta: 0,
    databaseConnections: 0,
    ...extra,
  };
}

function sanitizeErrorCode(error) {
  return String(error?.message ?? "private_capability_restore_failed")
    .replace(/[^A-Za-z0-9_.:-]/gu, "_")
    .slice(0, 200);
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
