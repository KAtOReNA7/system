import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

export const OFFLINE_RECOVERY_SOURCE_ROLES = Object.freeze([
  "immutable_manifest",
  "append_only_provider_receipt",
  "source_record",
  "evidence_record",
  "request_event_ledger",
  "frozen_execution_contract",
]);

const FORBIDDEN_SOURCE_ROLES = new Set([
  "public_report",
  "prior_integrity_audit",
  "mutable_state",
  "mutable_cache",
  "derived_evaluation",
]);
const SYNTHETIC_TARGET_PREFIX = "m2-v2-recovery-validation-";

/**
 * Promote a complete offline-derived private state as one immutable group.
 * The caller supplies the P1-003 role registry and candidate verifier so this
 * module never carries a second, drifting definition of the closed role set.
 */
export function promoteOfflineRecoveryGroup(options) {
  const root = resolve(options.root);
  if (options.faultAt) assertSyntheticFaultTarget(root);
  const registry = normalizeRoleRegistry(options.roleRegistry);
  const sources = validateAuthoritativeSources(root, options.sources ?? []);
  if (typeof options.evaluateGates !== "function" || typeof options.validateCandidate !== "function") {
    throw new Error("recovery_real_gate_and_validator_required");
  }
  const sourceSetDigest = sha256Json(sources.map(({ role, relativePath, byteDigest }) => ({ role, relativePath, byteDigest })));
  const contractDigest = requireDigest(options.contractDigest, "recovery_contract_digest_invalid");
  const transactionRootRelative = normalizeRelative(options.transactionRootRelative
    ?? "data/private-output/m2-v2-pr7-p1-remediation/recovery-transactions");
  const pointerRelative = normalizeRelative(options.pointerRelative
    ?? "data/private-output/m2-v2-pr7-p1-remediation/current-recovery-binding-private-v0.2.json");
  let transactionId;
  let members;
  if (typeof options.buildMembers === "function") {
    const transactionIdentity = requiredTransactionIdentity(options.transactionIdentity);
    transactionId = `recovery-${sha256Json({ sourceSetDigest, contractDigest, transactionIdentity }).slice(0, 40)}`;
    const finalDirectoryRelative = `${transactionRootRelative}/${transactionId}`;
    members = normalizeMembers(options.buildMembers({
      root,
      transactionId,
      transactionRootRelative,
      finalDirectoryRelative,
      sources,
      sourceSetDigest,
      contractDigest,
      providerRequestDelta: 0,
    }), registry);
  } else {
    members = normalizeMembers(options.members, registry);
    const provisionalMemberSetDigest = sha256Json(members.map(({ role, relativePath, bytes }) => ({
      role,
      relativePath,
      byteDigest: sha256Buffer(bytes),
    })));
    transactionId = `recovery-${sha256Json({ sourceSetDigest, memberSetDigest: provisionalMemberSetDigest, contractDigest }).slice(0, 40)}`;
  }
  const memberSetDigest = sha256Json(members.map(({ role, relativePath, bytes }) => ({ role, relativePath, byteDigest: sha256Buffer(bytes) })));
  const transactionRoot = resolveInside(root, transactionRootRelative);
  const finalDirectory = join(transactionRoot, transactionId);
  const stagingDirectory = join(transactionRoot, `.staging-${transactionId}`);
  const pointerPath = resolveInside(root, pointerRelative);

  const priorPointer = existsSync(pointerPath) ? {
    bytes: readFileSync(pointerPath),
    atime: lstatSync(pointerPath).atime,
    mtime: lstatSync(pointerPath).mtime,
  } : null;
  if (existsSync(finalDirectory)) {
    const existing = verifyPersistedTransaction({ finalDirectory, transactionId, members, registry, options, sources, sourceSetDigest, memberSetDigest, contractDigest });
    if (priorPointer && sha256Buffer(priorPointer.bytes) === sha256Buffer(existing.pointerBytes)) {
      return {
        status: "ALREADY_CURRENT_NOOP",
        transactionId,
        sourceSetDigest,
        memberSetDigest,
        providerRequestDelta: 0,
        wroteCurrentState: false,
      };
    }
    throw new Error("recovery_transaction_exists_but_is_not_current");
  }
  if (existsSync(stagingDirectory)) throw new Error("recovery_staging_collision");

  const inMemory = options.validateCandidate({
    phase: "in_memory",
    root,
    transactionId,
    members: memberDescriptors(members),
    sources,
    providerRequestDelta: 0,
  });
  assertValidation(inMemory, "recovery_candidate_in_memory_invalid");
  const gates = options.evaluateGates({
    phase: "in_memory",
    root,
    transactionId,
    members: memberDescriptors(members),
    sources,
    sourceSetDigest,
    memberSetDigest,
    providerRequestDelta: 0,
  });
  assertGates(gates);

  mkdirSync(transactionRoot, { recursive: true });
  mkdirSync(stagingDirectory, { recursive: false });
  try {
    for (const member of members) {
      const memberPath = resolveInside(stagingDirectory, member.relativePath);
      mkdirSync(dirname(memberPath), { recursive: true });
      durableWriteNew(memberPath, member.bytes);
    }
    const persistedMembers = enumerateMemberFiles(stagingDirectory);
    assertExactPersistedMembers(persistedMembers, members);
    const manifest = buildTransactionManifest({
      transactionId,
      members,
      registry,
      sources,
      sourceSetDigest,
      memberSetDigest,
      contractDigest,
      gates,
    });
    durableWriteNew(join(stagingDirectory, "transaction-manifest-private-v0.2.json"), jsonBytes(manifest));
    const staged = options.validateCandidate({
      phase: "staged",
      root,
      candidateRoot: stagingDirectory,
      transactionId,
      members: manifest.members,
      sources,
      gates,
      providerRequestDelta: 0,
    });
    assertValidation(staged, "recovery_staging_verifier_failed");
    injectFault(options, "transaction_rename_before");
    renameSync(stagingDirectory, finalDirectory);
    injectFault(options, "transaction_rename_after");
    const verified = verifyPersistedTransaction({ finalDirectory, transactionId, members, registry, options, sources, sourceSetDigest, memberSetDigest, contractDigest, gates });
    injectFault(options, "pointer_swap_before");
    const pointerBackupPath = `${pointerPath}.previous-${transactionId}`;
    try {
      if (priorPointer) renameSync(pointerPath, pointerBackupPath);
      durableAtomicReplace(pointerPath, verified.pointerBytes);
      injectFault(options, "pointer_swap_after");
      const current = options.validateCandidate({
        phase: "current",
        root,
        candidateRoot: finalDirectory,
        pointerPath,
        transactionId,
        members: verified.manifest.members,
        sources,
        gates: verified.manifest.gates,
        providerRequestDelta: 0,
      });
      assertValidation(current, "recovery_current_verifier_failed");
    } catch (error) {
      restorePointer(pointerPath, priorPointer, transactionId, pointerBackupPath);
      throw error;
    }
    return {
      status: "PROMOTED",
      transactionId,
      sourceSetDigest,
      memberSetDigest,
      bindingDigest: verified.pointer.bindingDigest,
      providerRequestDelta: 0,
      wroteCurrentState: true,
    };
  } catch (error) {
    if (existsSync(stagingDirectory)) {
      const quarantine = join(transactionRoot, `.failed-${transactionId}`);
      if (!existsSync(quarantine)) renameSync(stagingDirectory, quarantine);
    }
    if (existsSync(finalDirectory) && !pointerSelectsTransaction(pointerPath, transactionId)) {
      renameSync(finalDirectory, nextQuarantinePath(transactionRoot, transactionId));
    }
    throw error;
  }
}

function verifyPersistedTransaction(input) {
  const manifestPath = join(input.finalDirectory, "transaction-manifest-private-v0.2.json");
  if (!existsSync(manifestPath)) throw new Error("recovery_transaction_manifest_missing");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const { transactionDigest, ...manifestPayload } = manifest;
  if (manifest.schema !== "m2.v2.group-atomic-private-recovery-transaction.v0.2"
    || manifest.privateOnly !== true
    || transactionDigest !== sha256Json(manifestPayload)
    || manifest.transactionId !== input.transactionId
    || manifest.contractDigest !== input.contractDigest
    || manifest.sourceSetDigest !== input.sourceSetDigest
    || manifest.memberSetDigest !== input.memberSetDigest
    || JSON.stringify(manifest.requiredRoles) !== JSON.stringify(input.registry.requiredRoles)
    || JSON.stringify(manifest.optionalRoles) !== JSON.stringify(input.registry.optionalRoles)) {
    throw new Error("recovery_transaction_manifest_mismatch");
  }
  if (input.gates && JSON.stringify(manifest.gates) !== JSON.stringify(input.gates)) {
    throw new Error("recovery_transaction_gate_mismatch");
  }
  assertGates(manifest.gates);
  const actual = enumerateMemberFiles(input.finalDirectory);
  assertExactPersistedMembers(actual, input.members);
  const validation = input.options.validateCandidate({
    phase: "persisted",
    root: input.options.root ? resolve(input.options.root) : null,
    candidateRoot: input.finalDirectory,
    transactionId: input.transactionId,
    members: manifest.members,
    sources: input.sources,
    gates: manifest.gates,
    providerRequestDelta: 0,
  });
  assertValidation(validation, "recovery_persisted_verifier_failed");
  const pointerContext = {
    root: resolve(input.options.root),
    finalDirectory: input.finalDirectory,
    finalDirectoryRelative: relative(resolve(input.options.root), input.finalDirectory).replace(/\\/gu, "/"),
    transactionId: input.transactionId,
    recoveryManifest: manifest,
    recoveryManifestRelativePath: relative(resolve(input.options.root), manifestPath).replace(/\\/gu, "/"),
    recoveryManifestDigest: sha256File(manifestPath),
    sources: input.sources,
    sourceSetDigest: input.sourceSetDigest,
    memberSetDigest: input.memberSetDigest,
    contractDigest: input.contractDigest,
    providerRequestDelta: 0,
  };
  const pointer = typeof input.options.buildCurrentPointer === "function"
    ? input.options.buildCurrentPointer(pointerContext)
    : defaultRecoveryPointer(pointerContext);
  if (!pointer || typeof pointer !== "object" || Array.isArray(pointer)
    || pointer.transactionId !== input.transactionId
    || !/^[a-f0-9]{64}$/u.test(String(pointer.bindingDigest ?? ""))) {
    throw new Error("recovery_current_pointer_invalid");
  }
  return { manifest, pointer, pointerBytes: jsonBytes(pointer) };
}

function defaultRecoveryPointer(input) {
  const payload = {
    schema: "m2.v2.group-atomic-private-recovery-binding.v0.2",
    privateOnly: true,
    transactionId: input.transactionId,
    transactionManifestRelativePath: input.recoveryManifestRelativePath,
    transactionManifestDigest: input.recoveryManifestDigest,
    sourceSetDigest: input.sourceSetDigest,
    memberSetDigest: input.memberSetDigest,
    contractDigest: input.contractDigest,
    providerRequestDelta: 0,
  };
  return { ...payload, bindingDigest: sha256Json(payload) };
}

function buildTransactionManifest(input) {
  const payload = {
    schema: "m2.v2.group-atomic-private-recovery-transaction.v0.2",
    privateOnly: true,
    transactionId: input.transactionId,
    contractDigest: input.contractDigest,
    sourceSetDigest: input.sourceSetDigest,
    memberSetDigest: input.memberSetDigest,
    requiredRoles: input.registry.requiredRoles,
    optionalRoles: input.registry.optionalRoles,
    members: input.members.map((member) => ({
      role: member.role,
      relativePath: member.relativePath,
      byteLength: member.bytes.byteLength,
      byteDigest: sha256Buffer(member.bytes),
    })),
    sources: input.sources.map(({ role, relativePath, byteDigest }) => ({ role, relativePath, byteDigest })),
    gates: input.gates,
    providerRequestDelta: 0,
    currentOnlyAfterPointerSwap: true,
  };
  return { ...payload, transactionDigest: sha256Json(payload) };
}

function validateAuthoritativeSources(root, sources) {
  const allowed = new Set(OFFLINE_RECOVERY_SOURCE_ROLES);
  if (!Array.isArray(sources) || sources.length === 0) throw new Error("recovery_authoritative_sources_required");
  const seen = new Set();
  const normalized = [];
  for (const source of sources) {
    const role = String(source?.role ?? "");
    if (FORBIDDEN_SOURCE_ROLES.has(role) || !allowed.has(role)) throw new Error(`recovery_source_role_forbidden:${role || "missing"}`);
    const relativePath = normalizeRelative(source?.relativePath);
    const key = `${role}:${relativePath}`;
    if (seen.has(key)) throw new Error("recovery_source_duplicate");
    seen.add(key);
    const path = resolveInside(root, relativePath);
    if (!existsSync(path) || !lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) {
      throw new Error("recovery_source_missing_or_unsafe");
    }
    const byteDigest = sha256File(path);
    if (source.byteDigest !== undefined && source.byteDigest !== byteDigest) throw new Error("recovery_source_digest_mismatch");
    normalized.push({ role, relativePath, byteDigest });
  }
  return normalized.sort((left, right) => `${left.role}:${left.relativePath}`.localeCompare(`${right.role}:${right.relativePath}`));
}

function normalizeRoleRegistry(value) {
  const requiredRoles = uniqueRoles(value?.requiredRoles, "recovery_required_roles_invalid");
  const optionalRoles = uniqueRoles(value?.optionalRoles ?? [], "recovery_optional_roles_invalid");
  if (requiredRoles.length === 0) throw new Error("recovery_required_roles_empty");
  if (optionalRoles.some((role) => requiredRoles.includes(role))) throw new Error("recovery_role_registry_overlap");
  return { requiredRoles, optionalRoles };
}

function normalizeMembers(values, registry) {
  if (!Array.isArray(values)) throw new Error("recovery_members_invalid");
  const allowed = new Set([...registry.requiredRoles, ...registry.optionalRoles]);
  const seenRoles = new Set();
  const seenPaths = new Set();
  const members = values.map((member) => {
    const role = String(member?.role ?? "");
    if (!allowed.has(role)) throw new Error(`recovery_member_extra_role:${role || "missing"}`);
    if (seenRoles.has(role)) throw new Error(`recovery_member_duplicate_role:${role}`);
    seenRoles.add(role);
    const relativePath = normalizeRelative(member.relativePath ?? `${role}.json`);
    if (relativePath === "transaction-manifest-private-v0.2.json") throw new Error("recovery_member_path_reserved");
    if (seenPaths.has(relativePath)) throw new Error("recovery_member_duplicate_path");
    seenPaths.add(relativePath);
    const bytes = Buffer.isBuffer(member.bytes) ? member.bytes : Buffer.from(String(member.bytes ?? ""), "utf8");
    return { role, relativePath, bytes };
  }).sort((left, right) => left.role.localeCompare(right.role));
  for (const role of registry.requiredRoles) if (!seenRoles.has(role)) throw new Error(`recovery_member_missing_role:${role}`);
  return members;
}

function memberDescriptors(members) {
  return members.map(({ role, relativePath, bytes }) => ({ role, relativePath, byteLength: bytes.byteLength, byteDigest: sha256Buffer(bytes) }));
}

function enumerateMemberFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) throw new Error("recovery_persisted_reparse_rejected");
      if (stat.isDirectory()) visit(path);
      else if (stat.isFile()) {
        const relativePath = relative(root, path).replace(/\\/gu, "/");
        if (relativePath !== "transaction-manifest-private-v0.2.json") files.push({ relativePath, byteLength: stat.size, byteDigest: sha256File(path) });
      } else throw new Error("recovery_persisted_special_file_rejected");
    }
  };
  visit(root);
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function assertExactPersistedMembers(actual, expected) {
  const expectedProjection = expected.map(({ relativePath, bytes }) => ({
    relativePath,
    byteLength: bytes.byteLength,
    byteDigest: sha256Buffer(bytes),
  })).sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  if (JSON.stringify(actual) !== JSON.stringify(expectedProjection)) throw new Error("recovery_persisted_member_exact_set_mismatch");
}

function assertValidation(result, code) {
  if (!result || result.valid !== true || (Array.isArray(result.issues) && result.issues.length > 0)) throw new Error(code);
}

function assertGates(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("recovery_gates_invalid");
  const entries = Object.entries(value);
  if (entries.length === 0 || entries.some(([, result]) => result !== true)) throw new Error("recovery_gate_failed");
}

function restorePointer(pointerPath, priorBytes, transactionId, pointerBackupPath) {
  if (existsSync(pointerPath)) {
    const quarantine = `${pointerPath}.rolled-back-${transactionId}`;
    renameSync(pointerPath, quarantine);
  }
  if (priorBytes) {
    if (!existsSync(pointerBackupPath)) throw new Error("recovery_pointer_backup_missing");
    renameSync(pointerBackupPath, pointerPath);
  }
}

function pointerSelectsTransaction(pointerPath, transactionId) {
  if (!existsSync(pointerPath)) return false;
  try { return JSON.parse(readFileSync(pointerPath, "utf8")).transactionId === transactionId; } catch { return false; }
}

function nextQuarantinePath(transactionRoot, transactionId) {
  const base = join(transactionRoot, `.failed-${transactionId}`);
  if (!existsSync(base)) return base;
  let ordinal = 2;
  while (existsSync(`${base}-${ordinal}`)) ordinal += 1;
  return `${base}-${ordinal}`;
}

function uniqueRoles(values, code) {
  if (!Array.isArray(values)) throw new Error(code);
  const roles = values.map((value) => String(value ?? ""));
  if (roles.some((role) => !/^[A-Za-z][A-Za-z0-9._:-]{0,199}$/u.test(role)) || new Set(roles).size !== roles.length) throw new Error(code);
  return [...roles].sort();
}

function requiredTransactionIdentity(value) {
  const identity = String(value ?? "").trim();
  if (!/^[A-Za-z0-9._:-]{1,200}$/u.test(identity)) {
    throw new Error("recovery_transaction_identity_invalid");
  }
  return identity;
}

function normalizeRelative(value) {
  if (typeof value !== "string" || !value || value.includes("\0")) throw new Error("recovery_relative_path_invalid");
  const normalized = value.replace(/\\/gu, "/");
  const segments = normalized.split("/");
  if (normalized.startsWith("/") || /^[A-Za-z]:/u.test(normalized)
    || segments.some((segment) => !segment || segment === "." || segment === "..")) throw new Error("recovery_relative_path_invalid");
  return normalized;
}

function resolveInside(root, relativePath) {
  const target = resolve(root, ...normalizeRelative(relativePath).split("/"));
  const prefix = resolve(root).replace(/[\\/]+$/u, "") + sep;
  if (target !== resolve(root) && !target.startsWith(prefix)) throw new Error("recovery_path_escape");
  return target;
}

function injectFault(options, point) {
  if (options.faultAt === point) throw new Error(`synthetic_fault_${point}`);
}

function assertSyntheticFaultTarget(root) {
  const prefix = resolve(tmpdir()).replace(/[\\/]+$/u, "") + sep;
  if (!root.startsWith(prefix) || !basename(root).startsWith(SYNTHETIC_TARGET_PREFIX)) {
    throw new Error("recovery_fault_injection_requires_synthetic_temp_target");
  }
}

function requireDigest(value, code) {
  if (!/^[a-f0-9]{64}$/u.test(String(value ?? ""))) throw new Error(code);
  return value;
}

function durableWriteNew(path, bytes) {
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

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
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
