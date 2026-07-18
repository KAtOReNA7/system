import { canonicalJson, sha256 } from "./pilotCore.js";
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
  writeSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export const RECEIPT_ENVELOPE_SCHEMA = "receipt-envelope-v0.2";
export const ATOMIC_BINDING_SCHEMA = "m2.v2.request-state-atomic-binding.v0.1";
export const CURRENT_REQUEST_STATE_BINDING_RELATIVE = "data/private-output/m2-v2-integrity-remediation/request-state-binding-private-v0.1.json";
export const REQUEST_STATE_TRANSACTION_ROOT_RELATIVE = "data/private-output/m2-v2-integrity-remediation/request-state-transactions";

const receiptRuntimeViews = new WeakMap();

/**
 * Build a durable receipt envelope. The immutable payload and the runtime view
 * intentionally have independent digests: observing a cache hit can never
 * rewrite the identity of the provider exchange.
 */
export function createReceiptEnvelope(receiptPayload, runtimeView = {}) {
  const immutablePayload = cloneJson(receiptPayload);
  const normalizedRuntimeView = normalizeRuntimeView(runtimeView);
  return {
    schema: RECEIPT_ENVELOPE_SCHEMA,
    receiptPayload: immutablePayload,
    receiptDigest: sha256(immutablePayload),
    runtimeView: normalizedRuntimeView,
    runtimeViewDigest: sha256(normalizedRuntimeView),
  };
}

export function updateReceiptEnvelopeRuntimeView(envelope, runtimeView) {
  const validation = validateReceiptEnvelope(envelope);
  if (!validation.valid) throw new Error(`receipt_envelope_invalid:${validation.issues.join(",")}`);
  return createReceiptEnvelope(envelope.receiptPayload, {
    ...envelope.runtimeView,
    ...runtimeView,
  });
}

export function validateReceiptEnvelope(envelope) {
  const issues = [];
  if (envelope?.schema !== RECEIPT_ENVELOPE_SCHEMA) issues.push("schema_invalid");
  if (!isPlainObject(envelope?.receiptPayload)) issues.push("receipt_payload_invalid");
  if (!isPlainObject(envelope?.runtimeView)) issues.push("runtime_view_invalid");
  if (isPlainObject(envelope?.receiptPayload)
    && envelope.receiptDigest !== sha256(envelope.receiptPayload)) issues.push("receipt_digest_invalid");
  if (isPlainObject(envelope?.runtimeView)
    && envelope.runtimeViewDigest !== sha256(envelope.runtimeView)) issues.push("runtime_view_digest_invalid");
  return { valid: issues.length === 0, issues };
}

export function validateRuntimeOnlyStaleDigest(legacyReceipt, options = {}) {
  if (!isPlainObject(legacyReceipt)) return { valid: false, issues: ["legacy_receipt_invalid"] };
  const observedDigest = legacyReceipt.receiptDigest;
  if (!/^[a-f0-9]{64}$/u.test(observedDigest ?? "")) {
    return { valid: false, issues: ["legacy_receipt_digest_invalid"] };
  }
  const runtimeFields = normalizeRuntimeFieldNames(options.runtimeFields);
  const fullPayload = omitKeys(legacyReceipt, ["receiptDigest"]);
  const immutablePayload = omitKeys(fullPayload, [...runtimeFields, "runtimeView", "runtimeViewDigest"]);
  const currentPayloadDigest = sha256(fullPayload);
  const immutablePayloadDigest = sha256(immutablePayload);
  const matchedLegacyPayload = findRuntimeOnlyDigestMatch(fullPayload, runtimeFields, observedDigest);
  if (!matchedLegacyPayload) {
    return {
      valid: false,
      issues: ["legacy_receipt_non_runtime_digest_difference"],
      observedDigest,
      currentPayloadDigest,
      immutablePayloadDigest,
      runtimeFieldsRemoved: runtimeFields,
    };
  }
  return {
    valid: true,
    issues: [],
    classification: currentPayloadDigest === observedDigest
      ? "legacy_digest_valid"
      : "runtime_only_stale_digest",
    observedDigest,
    currentPayloadDigest,
    matchedLegacyPayloadDigest: sha256(matchedLegacyPayload),
    immutablePayloadDigest,
    immutablePayload,
    runtimeFieldsRemoved: runtimeFields.filter((field) => Object.hasOwn(fullPayload, field)),
    runtimeView: normalizeRuntimeView({
      cacheHit: fullPayload.cacheHit,
      readAt: fullPayload.readAt,
      selectedAsEffective: fullPayload.selectedAsEffective,
    }),
  };
}

export function migrateLegacyReceiptToEnvelopeV02(legacyReceipt, options = {}) {
  const validation = validateRuntimeOnlyStaleDigest(legacyReceipt, options);
  if (!validation.valid) {
    throw new Error(`legacy_receipt_migration_invalid:${validation.issues.join(",")}`);
  }
  const envelope = createReceiptEnvelope(validation.immutablePayload, validation.runtimeView);
  const migratedAt = requiredTimestamp(options.migratedAt);
  return {
    envelope,
    migration: {
      schema: "m2.v2.receipt-envelope-migration.v0.2",
      oldDigest: validation.observedDigest,
      newDigest: envelope.receiptDigest,
      reason: validation.classification,
      immutablePayloadDigest: envelope.receiptDigest,
      runtimeFieldsRemoved: validation.runtimeFieldsRemoved,
      migratedAt,
      migrationVersion: "receipt-envelope-v0.2",
    },
  };
}

/**
 * Compatibility sidecar for legacy, flat receipts. The returned clone has no
 * enumerable runtime fields, so its canonical payload and receiptDigest remain
 * byte-for-byte stable when it is later serialized. Callers must use
 * receiptRuntimeView()/receiptWasCacheHit() to inspect the ephemeral view.
 */
export function withReceiptRuntimeView(receipt, runtimeView) {
  if (!isPlainObject(receipt)) throw new Error("receipt_payload_invalid");
  const clone = { ...receipt };
  receiptRuntimeViews.set(clone, normalizeRuntimeView(runtimeView));
  return clone;
}

export function receiptRuntimeView(receipt) {
  return receiptRuntimeViews.get(receipt) ?? Object.freeze({});
}

export function receiptWasCacheHit(receipt) {
  return receiptRuntimeView(receipt).cacheHit === true;
}

export function receiptReference(receipt) {
  if (receipt?.schema === RECEIPT_ENVELOPE_SCHEMA) {
    const validation = validateReceiptEnvelope(receipt);
    if (!validation.valid) throw new Error(`receipt_envelope_invalid:${validation.issues.join(",")}`);
    return `sha256:${receipt.receiptDigest}`;
  }
  if (!/^[a-f0-9]{64}$/u.test(receipt?.receiptDigest ?? "")) throw new Error("receipt_digest_invalid");
  return `sha256:${receipt.receiptDigest}`;
}

export function recomputeFrozenSourceBundleDigest(bundle) {
  if (!isPlainObject(bundle)) throw new Error("source_bundle_invalid");
  return sha256(omitKeys(bundle, ["frozenAt", "sourceBundleDigest"]));
}

export function validateFrozenSourceBundleDigest(bundle) {
  try {
    const recomputedDigest = recomputeFrozenSourceBundleDigest(bundle);
    return {
      valid: /^[a-f0-9]{64}$/u.test(bundle?.sourceBundleDigest ?? "")
        && bundle.sourceBundleDigest === recomputedDigest,
      storedDigest: bundle?.sourceBundleDigest ?? null,
      recomputedDigest,
    };
  } catch {
    return { valid: false, storedDigest: bundle?.sourceBundleDigest ?? null, recomputedDigest: null };
  }
}

export function evaluateGitBoundaryCommandResult(result) {
  if (!result || result.status !== 0 || result.error) {
    return {
      auditSucceeded: false,
      b4Unchanged: false,
      holdoutSealed: false,
      paths: [],
      issue: "git_boundary_audit_failed",
    };
  }
  const paths = String(result.stdout ?? "").split(/\r?\n/u).filter(Boolean).sort();
  const b4Unchanged = !paths.some((path) => /oldProductEvaluation|formal-cash|calibrationSpec|B4/iu.test(path));
  const holdoutSealed = !paths.some((path) => /holdout|embargo|deferred.*label/iu.test(path));
  return {
    auditSucceeded: true,
    b4Unchanged,
    holdoutSealed,
    paths,
    issue: null,
  };
}

export function recomputeRequestCounters(requestLedger) {
  if (!Array.isArray(requestLedger)) throw new Error("request_ledger_invalid");
  const counters = {
    planned: 0,
    reserved: 0,
    dispatched: 0,
    completed: 0,
    indeterminate: 0,
    providerFailed: 0,
    contractFailed: 0,
    cacheHit: 0,
  };
  for (const entry of requestLedger) {
    if (!isPlainObject(entry)) throw new Error("request_ledger_entry_invalid");
    const explicitFlags = Object.keys(counters).filter((key) => entry[key] === true);
    for (const key of explicitFlags) counters[key] += 1;
    if (explicitFlags.length === 0) {
      const dimension = normalizeCounterDimension(entry.event ?? entry.eventType ?? entry.status);
      if (dimension) counters[dimension] += 1;
    }
  }
  return counters;
}

export function createAtomicRequestBinding(input) {
  if (!isPlainObject(input)) throw new Error("atomic_binding_input_invalid");
  const stages = normalizeBindingStages(input);
  if (stages.length === 0) throw new Error("atomic_binding_stages_required");
  const currentTransactionId = requiredToken(
    input.currentTransactionId ?? stages.at(-1)?.transaction?.transactionId,
    "atomic_binding_current_transaction_id_invalid",
  );
  const stageTransactions = {};
  const scopeMembers = {};
  for (const stage of stages) {
    if (stageTransactions[stage.scope]) throw new Error(`atomic_binding_scope_duplicate:${stage.scope}`);
    stageTransactions[stage.scope] = stage.transaction;
    scopeMembers[stage.scope] = stage.members;
  }
  const payload = {
    schema: ATOMIC_BINDING_SCHEMA,
    privateOnly: true,
    currentTransactionId,
    stageTransactions,
    scopeMembers,
    members: normalizeBindingDescriptors(input.members ?? [], { requireScope: true }),
  };
  const binding = { ...payload, bindingDigest: sha256(payload) };
  const validation = validateAtomicRequestBinding(binding);
  if (!validation.valid) throw new Error(`atomic_binding_invalid:${validation.issues.join(",")}`);
  return binding;
}

export function buildAtomicTransaction(input) {
  if (!isPlainObject(input)) throw new Error("atomic_binding_input_invalid");
  const requestLedger = cloneJson(input.requestLedger ?? []);
  const recomputedCounters = recomputeRequestCounters(requestLedger);
  if (input.counters && canonicalJson(input.counters) !== canonicalJson(recomputedCounters)) {
    throw new Error("atomic_binding_counter_ledger_mismatch");
  }
  return {
    transactionId: requiredToken(input.transactionId, "transaction_id_invalid"),
    stateDigest: suppliedOrComputedDigest(input.memberDigests?.state, input.state),
    cacheIndexDigest: suppliedOrComputedDigest(input.memberDigests?.cacheIndex, input.cacheIndex),
    receiptIndexDigest: suppliedOrComputedDigest(input.memberDigests?.receiptIndex, input.receiptIndex),
    requestLedgerDigest: suppliedOrComputedDigest(input.memberDigests?.requestLedger, requestLedger),
    counterDigest: suppliedOrComputedDigest(input.memberDigests?.counters, recomputedCounters),
    manifestBindings: cloneJson(input.manifestBindings ?? {}),
    createdAt: requiredTimestamp(input.createdAt),
  };
}

export function validateAtomicRequestBinding(binding, options = {}) {
  const issues = [];
  if (binding?.schema !== ATOMIC_BINDING_SCHEMA) issues.push("schema_invalid");
  if (binding?.privateOnly !== true) issues.push("private_boundary_invalid");
  if (!isPlainObject(binding)) return { valid: false, issues: ["binding_invalid"] };
  const { bindingDigest, ...payload } = binding;
  if (bindingDigest !== sha256(payload)) issues.push("binding_digest_invalid");
  if (!/^[A-Za-z0-9._:-]{1,200}$/u.test(String(binding.currentTransactionId ?? ""))) {
    issues.push("current_transaction_id_invalid");
  }
  const scopes = bindingScopes(binding);
  if (scopes.length === 0) issues.push("stage_transactions_missing");
  if (options.scope && !scopes.includes(options.scope)) issues.push(`binding_scope_missing:${options.scope}`);
  for (const scope of scopes) {
    const descriptors = bindingDescriptors(binding, scope);
    const stage = bindingStageTransaction(binding, scope);
    if (!stage) issues.push(`binding_stage_transaction_missing:${scope}`);
    else issues.push(...validateStageTransaction(stage, descriptors).map((issue) => `${scope}:${issue}`));
  }
  try { normalizeBindingDescriptors(binding.members ?? [], { requireScope: true }); } catch (error) {
    issues.push(String(error?.message ?? "binding_members_invalid"));
  }
  return { valid: issues.length === 0, issues: [...new Set(issues)] };
}

export function verifyAtomicTransaction(transaction, members) {
  const issues = [];
  let counters = null;
  try { counters = recomputeRequestCounters(members?.requestLedger ?? []); } catch { issues.push("request_ledger_invalid"); }
  const expected = {
    stateDigest: suppliedOrComputedDigest(members?.memberDigests?.state, members?.state),
    cacheIndexDigest: suppliedOrComputedDigest(members?.memberDigests?.cacheIndex, members?.cacheIndex),
    receiptIndexDigest: suppliedOrComputedDigest(members?.memberDigests?.receiptIndex, members?.receiptIndex),
    requestLedgerDigest: suppliedOrComputedDigest(members?.memberDigests?.requestLedger, members?.requestLedger ?? []),
    counterDigest: counters ? suppliedOrComputedDigest(members?.memberDigests?.counters, counters) : null,
  };
  for (const [key, value] of Object.entries(expected)) if (transaction?.[key] !== value) issues.push(`${key}_mismatch`);
  if (members?.counters && counters
    && canonicalJson(members.counters) !== canonicalJson(counters)) issues.push("counter_ledger_mismatch");
  if (members?.manifestBindings
    && canonicalJson(transaction?.manifestBindings) !== canonicalJson(members.manifestBindings)) issues.push("manifest_binding_mismatch");
  return { valid: issues.length === 0, issues };
}

/**
 * Materialize a checkpoint into an immutable, transaction-specific directory,
 * then atomically replace the single current-binding pointer last. A crash
 * before the pointer swap leaves the prior transaction authoritative; a crash
 * after it leaves a complete immutable snapshot authoritative.
 */
export function commitAtomicRequestCheckpoint(root, input) {
  const absoluteRoot = resolve(root);
  const scope = requiredToken(input?.scope, "atomic_checkpoint_scope_invalid");
  const createdAt = requiredTimestamp(input?.createdAt ?? new Date().toISOString());
  const manifestBindings = cloneJson(input?.manifestBindings ?? {});
  const seed = {
    scope,
    createdAt,
    state: input?.state ?? null,
    caches: input?.caches ?? {},
    receipts: input?.receipts ?? [],
    manifestBindings,
  };
  const transactionId = requiredToken(
    input?.transactionId ?? `${scope}-${sha256(seed).slice(0, 32)}`,
    "atomic_checkpoint_transaction_id_invalid",
  );
  const projection = buildRequestStateCheckpointProjection({
    ...input,
    scope,
    transactionId,
    manifestBindings,
  });
  const transactionRootRelative = normalizeRelativePath(
    `${input?.transactionRootRelative ?? REQUEST_STATE_TRANSACTION_ROOT_RELATIVE}/${scope}`,
  );
  const transactionRoot = resolveGovernedPath(absoluteRoot, transactionRootRelative);
  mkdirSync(transactionRoot, { recursive: true });
  const finalDirectory = join(transactionRoot, transactionId);
  const temporaryDirectory = `${finalDirectory}.tmp-${process.pid}-${Date.now()}`;
  mkdirSync(temporaryDirectory, { recursive: false });
  const roles = {
    state: projection.state,
    cacheIndex: projection.cacheIndex,
    receiptIndex: projection.receiptIndex,
    requestLedger: projection.requestLedger,
    counters: projection.counters,
  };
  const descriptors = {};
  try {
    for (const [role, value] of Object.entries(roles)) {
      const name = `${kebabCase(role)}.json`;
      const path = join(temporaryDirectory, name);
      const content = `${JSON.stringify(value, null, 2)}\n`;
      durableWriteNewFile(path, content);
      const relativePath = normalizeRelativePath(relative(absoluteRoot, join(finalDirectory, name)));
      descriptors[role] = {
        path: relativePath,
        byteDigest: digestFile(path),
      };
    }
    const transaction = buildAtomicTransaction({
      transactionId,
      createdAt,
      requestLedger: projection.requestLedger,
      counters: projection.counters,
      manifestBindings,
      memberDigests: Object.fromEntries(Object.entries(descriptors).map(([role, descriptor]) => [role, descriptor.byteDigest])),
    });
    const transactionDocument = {
      schema: "m2.v2.request-state-transaction.v0.1",
      privateOnly: true,
      scope,
      ...transaction,
      members: descriptors,
    };
    durableWriteNewFile(
      join(temporaryDirectory, "transaction-manifest.json"),
      `${JSON.stringify(transactionDocument, null, 2)}\n`,
    );
    if (existsSync(finalDirectory)) {
      assertExistingTransactionMatches(finalDirectory, transactionDocument, descriptors);
      rmSync(temporaryDirectory, { recursive: true, force: true });
    } else {
      renameSync(temporaryDirectory, finalDirectory);
    }

    const bindingPath = resolveGovernedPath(
      absoluteRoot,
      input?.bindingRelativePath ?? CURRENT_REQUEST_STATE_BINDING_RELATIVE,
    );
    const previous = existsSync(bindingPath) ? JSON.parse(readFileSync(bindingPath, "utf8")) : null;
    if (previous) {
      const validation = validateAtomicRequestBinding(previous);
      if (!validation.valid) throw new Error(`atomic_checkpoint_prior_binding_invalid:${validation.issues.join(",")}`);
    }
    const priorStages = previous ? bindingStagesFromBinding(previous).filter((stage) => stage.scope !== scope) : [];
    const binding = createAtomicRequestBinding({
      currentTransactionId: transactionId,
      stages: [...priorStages, { scope, transaction, members: descriptors }],
      members: (previous?.members ?? []).filter((descriptor) => descriptor?.scope !== scope),
    });
    durableAtomicReplace(bindingPath, `${JSON.stringify(binding, null, 2)}\n`);
    const current = validateCurrentRequestStateBinding(absoluteRoot, {
      bindingRelativePath: input?.bindingRelativePath ?? CURRENT_REQUEST_STATE_BINDING_RELATIVE,
      scope,
    });
    if (!current.valid) throw new Error(`atomic_checkpoint_roundtrip_invalid:${current.issues.join(",")}`);
    return {
      transactionId,
      transaction,
      binding,
      descriptors,
      projection,
    };
  } catch (error) {
    if (existsSync(temporaryDirectory)) rmSync(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
}

export function buildRequestStateCheckpointProjection(input) {
  const scope = requiredToken(input?.scope, "atomic_checkpoint_scope_invalid");
  const transactionId = requiredToken(input?.transactionId, "atomic_checkpoint_transaction_id_invalid");
  const state = cloneJson(input?.state ?? {});
  const cacheIndex = buildReferenceOnlyCacheIndex(input?.caches ?? {}, {
    scope,
    transactionId,
    adapterVersion: input?.adapterVersion,
  });
  const receiptIndex = buildReceiptIndex(input?.receipts ?? [], cacheIndex, { scope, transactionId });
  const requestLedger = Array.isArray(input?.requestLedger)
    ? cloneJson(input.requestLedger)
    : deriveRequestLedgerFromState(state);
  const counters = recomputeRequestCounters(requestLedger);
  if (input?.counters && canonicalJson(input.counters) !== canonicalJson(counters)) {
    throw new Error("atomic_checkpoint_counter_ledger_mismatch");
  }
  return {
    scope,
    transactionId,
    state,
    cacheIndex,
    receiptIndex,
    requestLedger,
    counters,
    manifestBindings: cloneJson(input?.manifestBindings ?? {}),
  };
}

export function readCurrentRequestStateSnapshot(root, options = {}) {
  const validation = validateCurrentRequestStateBinding(root, options);
  if (!validation.present || !validation.valid) return { ...validation, members: null };
  const absoluteRoot = resolve(root);
  const bindingRelativePath = options.bindingRelativePath ?? CURRENT_REQUEST_STATE_BINDING_RELATIVE;
  const binding = JSON.parse(readFileSync(resolveGovernedPath(absoluteRoot, bindingRelativePath), "utf8"));
  const descriptors = bindingDescriptors(binding, options.scope);
  const members = {};
  for (const descriptor of descriptors) {
    if (!CHECKPOINT_ROLES.has(descriptor.role)) continue;
    members[descriptor.role] = readStructuredSnapshotMember(
      resolveGovernedPath(absoluteRoot, descriptor.path),
      descriptor.role,
    );
  }
  return { ...validation, binding, members };
}

export function hashGovernedPrivateState(root, options = {}) {
  const absoluteRoot = resolve(root);
  const relativeRoots = uniqueStrings(options.relativePaths ?? options.relativeRoots ?? []);
  if (relativeRoots.length === 0) throw new Error("governed_state_paths_required");
  const excluded = uniqueStrings([
    "data/private-output/m2-v2-integrity-remediation/recovery-staging-v0.1",
    "data/private-output/m2-v2-integrity-remediation/audit-receipts",
    ...(options.excludedRelativePaths ?? []),
  ]);
  const files = [];
  for (const relativeRoot of relativeRoots) {
    const absolute = resolveGovernedPath(absoluteRoot, relativeRoot);
    collectGovernedFiles(absoluteRoot, absolute, files, excluded, options.excludeAuditReceipts !== false);
  }
  const uniqueFiles = [...new Set(files)].sort((left, right) => left.localeCompare(right));
  const members = uniqueFiles.map((path) => {
    const content = readFileSync(path);
    return {
      path: normalizeRelativePath(relative(absoluteRoot, path)),
      byteLength: content.byteLength,
      digest: createHash("sha256").update(content).digest("hex"),
    };
  });
  const totalBytes = members.reduce((total, member) => total + member.byteLength, 0);
  return {
    schema: "m2.v2.governed-private-state-snapshot.v0.1",
    algorithm: "sha256",
    memberCount: members.length,
    totalBytes,
    members,
    aggregateDigest: sha256(members),
  };
}

export function validateCurrentRequestStateBinding(root, options = {}) {
  const absoluteRoot = resolve(root);
  const bindingRelativePath = options.bindingRelativePath ?? CURRENT_REQUEST_STATE_BINDING_RELATIVE;
  const bindingPath = resolveGovernedPath(absoluteRoot, bindingRelativePath);
  if (!existsSync(bindingPath)) return { present: false, valid: true, issues: [], memberCount: 0 };
  let binding;
  try { binding = JSON.parse(readFileSync(bindingPath, "utf8")); } catch {
    return { present: true, valid: false, issues: ["binding_unreadable"], memberCount: 0 };
  }
  if (!isPlainObject(binding)) return { present: true, valid: false, issues: ["binding_invalid"], memberCount: 0 };
  const structure = validateAtomicRequestBinding(binding, { scope: options.scope });
  const issues = [...structure.issues];
  const descriptors = bindingDescriptors(binding, options.scope);
  if (descriptors.length === 0) issues.push(`binding_scope_members_missing:${String(options.scope ?? "default")}`);
  for (const descriptor of descriptors) {
    let memberPath;
    try { memberPath = resolveGovernedPath(absoluteRoot, descriptor.path); } catch {
      issues.push(`binding_member_path_invalid:${descriptor.role}`);
      continue;
    }
    if (!existsSync(memberPath) || !lstatSync(memberPath).isFile()) {
      issues.push(`binding_member_missing:${descriptor.role}`);
      continue;
    }
    const digest = createHash("sha256").update(readFileSync(memberPath)).digest("hex");
    if (digest !== descriptor.byteDigest) issues.push(`binding_member_digest_mismatch:${descriptor.role}`);
  }
  const stage = bindingStageTransaction(binding, options.scope);
  return {
    present: true,
    valid: issues.length === 0,
    issues,
    memberCount: descriptors.length,
    transactionId: stage?.transactionId ?? binding.currentTransactionId ?? null,
    bindingDigest: binding.bindingDigest ?? null,
  };
}

const CHECKPOINT_ROLES = new Set(["state", "cacheIndex", "receiptIndex", "requestLedger", "counters"]);

function normalizeBindingStages(input) {
  const supplied = Array.isArray(input.stages)
    ? input.stages
    : isPlainObject(input.stageTransactions) && isPlainObject(input.scopeMembers)
      ? Object.entries(input.stageTransactions).map(([scope, transaction]) => ({
        scope,
        transaction,
        members: input.scopeMembers[scope],
      }))
      : [];
  return supplied.map((stage) => {
    const scope = requiredToken(stage?.scope ?? stage?.stage, "atomic_binding_scope_invalid");
    const members = normalizeBindingDescriptorMap(stage?.members);
    const transaction = stage?.transaction
      ? cloneJson(stage.transaction)
      : buildAtomicTransaction({
        transactionId: stage?.transactionId,
        createdAt: stage?.createdAt,
        requestLedger: stage?.requestLedger ?? [],
        counters: stage?.counters,
        manifestBindings: stage?.manifestBindings,
        memberDigests: Object.fromEntries(Object.entries(members).map(([role, descriptor]) => [role, descriptor.byteDigest])),
      });
    const issues = validateStageTransaction(transaction, Object.entries(members).map(([role, descriptor]) => ({ role, ...descriptor })));
    if (issues.length) throw new Error(`atomic_binding_stage_invalid:${scope}:${issues.join(",")}`);
    return { scope, transaction, members };
  }).sort((left, right) => left.scope.localeCompare(right.scope));
}

function normalizeBindingDescriptorMap(value) {
  if (!isPlainObject(value)) throw new Error("atomic_binding_scope_members_invalid");
  const entries = Object.entries(value);
  const roles = new Set(entries.map(([role]) => role));
  for (const role of CHECKPOINT_ROLES) if (!roles.has(role)) throw new Error(`atomic_binding_role_missing:${role}`);
  return Object.fromEntries(entries.map(([role, descriptor]) => {
    const normalized = normalizeBindingDescriptor({ role, ...descriptor }, { requireScope: false });
    return [role, { path: normalized.path, byteDigest: normalized.byteDigest }];
  }).sort(([left], [right]) => left.localeCompare(right)));
}

function normalizeBindingDescriptors(values, options = {}) {
  if (!Array.isArray(values)) throw new Error("atomic_binding_members_invalid");
  return values.map((value) => normalizeBindingDescriptor(value, options))
    .sort((left, right) => `${left.scope ?? ""}:${left.role}:${left.path}`.localeCompare(`${right.scope ?? ""}:${right.role}:${right.path}`));
}

function normalizeBindingDescriptor(value, options = {}) {
  if (!isPlainObject(value)) throw new Error("atomic_binding_member_invalid");
  const descriptor = {
    ...(value.scope === undefined ? {} : { scope: requiredToken(value.scope, "atomic_binding_member_scope_invalid") }),
    role: requiredToken(value.role, "atomic_binding_member_role_invalid"),
    path: normalizeRelativePath(String(value.path ?? "")),
    byteDigest: String(value.byteDigest ?? value.digest ?? ""),
  };
  if (options.requireScope && !descriptor.scope) throw new Error("atomic_binding_member_scope_missing");
  if (!descriptor.path || isAbsolute(descriptor.path) || descriptor.path.split("/").includes("..")) {
    throw new Error("atomic_binding_member_path_invalid");
  }
  if (!/^[a-f0-9]{64}$/u.test(descriptor.byteDigest)) throw new Error("atomic_binding_member_digest_invalid");
  return descriptor;
}

function bindingScopes(binding) {
  const transactionScopes = Array.isArray(binding?.stageTransactions)
    ? binding.stageTransactions.map((item) => item?.scope ?? item?.stage)
    : isPlainObject(binding?.stageTransactions) ? Object.keys(binding.stageTransactions) : [];
  const memberScopes = isPlainObject(binding?.scopeMembers) ? Object.keys(binding.scopeMembers) : [];
  return uniqueStrings([...transactionScopes, ...memberScopes]);
}

function bindingStagesFromBinding(binding) {
  return bindingScopes(binding).map((scope) => ({
    scope,
    transaction: bindingStageTransaction(binding, scope),
    members: Object.fromEntries(bindingDescriptors(binding, scope)
      .filter((descriptor) => CHECKPOINT_ROLES.has(descriptor.role))
      .map(({ role, path, byteDigest }) => [role, { path, byteDigest }])),
  }));
}

function buildReferenceOnlyCacheIndex(caches, context) {
  const entries = [];
  for (const [provider, cache] of Object.entries(isPlainObject(caches) ? caches : {})) {
    const values = isPlainObject(cache?.entries) ? cache.entries : {};
    for (const [key, value] of Object.entries(values)) {
      const receiptDigest = extractReceiptDigest(value);
      entries.push({
        receiptDigest,
        transactionId: context.transactionId,
        logicalKey: cleanIndexToken(value?.logicalKey ?? value?.queryId ?? value?.requestIdentity ?? key),
        physicalKey: cleanIndexToken(value?.physicalKey ?? `${provider}:${key}`),
        adapterVersion: cleanIndexToken(
          value?.adapterVersion
            ?? value?.providerReceipt?.adapterVersion
            ?? context.adapterVersion
            ?? "legacy-adapter-version-unreported",
        ),
      });
    }
  }
  entries.sort((left, right) => `${left.physicalKey}:${left.logicalKey}`.localeCompare(`${right.physicalKey}:${right.logicalKey}`));
  return {
    schema: "m2.v2.request-cache-index.v0.1",
    privateOnly: true,
    scope: context.scope,
    transactionId: context.transactionId,
    entries,
  };
}

function buildReceiptIndex(receipts, cacheIndex, context) {
  const indexed = new Map();
  for (const entry of cacheIndex.entries) indexed.set(entry.receiptDigest, {
    receiptDigest: entry.receiptDigest,
    source: "cache_reference",
  });
  for (const receipt of flattenReceipts(receipts)) {
    const receiptDigest = extractReceiptDigest(receipt);
    indexed.set(receiptDigest, {
      receiptDigest,
      source: "append_only_receipt",
      schema: String(receipt?.schema ?? "legacy-receipt-schema-unreported"),
    });
  }
  return {
    schema: "m2.v2.request-receipt-index.v0.1",
    privateOnly: true,
    scope: context.scope,
    transactionId: context.transactionId,
    entries: [...indexed.values()].sort((left, right) => left.receiptDigest.localeCompare(right.receiptDigest)),
  };
}

function deriveRequestLedgerFromState(state) {
  const providerBudgets = [];
  if (isPlainObject(state?.tavily?.reservations)) providerBudgets.push(["tavily", state.tavily.reservations]);
  if (isPlainObject(state?.relay?.reservations)) providerBudgets.push(["relay", state.relay.reservations]);
  if (isPlainObject(state?.reservations)) providerBudgets.push(["relay", state.reservations]);
  const rows = [];
  for (const [provider, reservations] of providerBudgets) {
    for (const [physicalKey, reservation] of Object.entries(reservations)) {
      const status = String(reservation?.status ?? "unknown");
      const dispatched = Boolean(reservation?.dispatchStartedAt)
        || !["reserved_before_dispatch", "reserved", "planned"].includes(status);
      rows.push({
        requestId: `${provider}:${physicalKey}`,
        provider,
        physicalKey,
        planned: true,
        reserved: true,
        dispatched,
        completed: ["completed", "completed_recovered"].includes(status),
        indeterminate: status === "indeterminate_after_crash",
        providerFailed: status === "provider_failed",
        contractFailed: status === "contract_failed",
        cacheHit: false,
      });
    }
  }
  return rows.sort((left, right) => left.requestId.localeCompare(right.requestId));
}

function extractReceiptDigest(value) {
  if (value?.schema === RECEIPT_ENVELOPE_SCHEMA) {
    const validation = validateReceiptEnvelope(value);
    if (!validation.valid) throw new Error(`atomic_checkpoint_receipt_envelope_invalid:${validation.issues.join(",")}`);
    return value.receiptDigest;
  }
  for (const candidate of [value?.receiptDigest, value?.providerReceipt?.receiptDigest, value?.receipt?.receiptDigest]) {
    if (/^[a-f0-9]{64}$/u.test(candidate ?? "")) return candidate;
  }
  return sha256(omitKeys(isPlainObject(value) ? value : { value }, ["cacheHit", "readAt", "selectedAsEffective", "runtimeView", "runtimeViewDigest"]));
}

function flattenReceipts(value) {
  if (Array.isArray(value)) return value.flatMap(flattenReceipts);
  if (isPlainObject(value)) return [value];
  return [];
}

function cleanIndexToken(value) {
  const token = String(value ?? "").normalize("NFKC").replace(/[^A-Za-z0-9._:-]/gu, "_").slice(0, 300);
  return token || "unreported";
}

function durableWriteNewFile(path, content) {
  const descriptor = openSync(path, "wx");
  try {
    writeSync(descriptor, content, null, "utf8");
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function readStructuredSnapshotMember(path, role) {
  const content = readFileSync(path, "utf8");
  try {
    return JSON.parse(content);
  } catch (error) {
    if (!["requestLedger", "receiptIndex"].includes(role)) throw error;
    return content.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
  }
}

function durableAtomicReplace(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  try {
    durableWriteNewFile(temporary, content);
    renameSync(temporary, path);
  } finally {
    if (existsSync(temporary)) rmSync(temporary, { force: true });
  }
}

function digestFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function assertExistingTransactionMatches(directory, transactionDocument, descriptors) {
  const persisted = JSON.parse(readFileSync(join(directory, "transaction-manifest.json"), "utf8"));
  if (canonicalJson(persisted) !== canonicalJson(transactionDocument)) {
    throw new Error("atomic_checkpoint_transaction_id_collision");
  }
  for (const [role, descriptor] of Object.entries(descriptors)) {
    const path = join(directory, `${kebabCase(role)}.json`);
    if (!existsSync(path) || digestFile(path) !== descriptor.byteDigest) {
      throw new Error(`atomic_checkpoint_existing_member_invalid:${role}`);
    }
  }
}

function kebabCase(value) {
  return String(value).replace(/([a-z0-9])([A-Z])/gu, "$1-$2").toLowerCase();
}

function normalizeRuntimeView(value) {
  const source = isPlainObject(value) ? value : {};
  return Object.freeze({
    cacheHit: source.cacheHit === true,
    readAt: typeof source.readAt === "string" ? source.readAt : null,
    selectedAsEffective: source.selectedAsEffective === true,
  });
}

function normalizeCounterDimension(value) {
  const token = String(value ?? "").replace(/[-_\s]/gu, "").toLocaleLowerCase("en-US");
  return {
    planned: "planned",
    reserved: "reserved",
    dispatched: "dispatched",
    completed: "completed",
    indeterminate: "indeterminate",
    providerfailed: "providerFailed",
    contractfailed: "contractFailed",
    cachehit: "cacheHit",
  }[token] ?? null;
}

function bindingDescriptors(binding, scope) {
  const scoped = isPlainObject(binding.scopeMembers) && isPlainObject(binding.scopeMembers[scope])
    ? Object.entries(binding.scopeMembers[scope]).map(([role, descriptor]) => ({ role, ...descriptor }))
    : [];
  const listed = Array.isArray(binding.members)
    ? binding.members.filter((descriptor) => !scope || descriptor?.scope === scope)
    : [];
  return [...scoped, ...listed].map((descriptor, index) => ({
    role: String(descriptor?.role ?? `member_${index + 1}`),
    path: String(descriptor?.path ?? ""),
    byteDigest: String(descriptor?.byteDigest ?? descriptor?.digest ?? ""),
  })).sort((left, right) => `${left.role}:${left.path}`.localeCompare(`${right.role}:${right.path}`));
}

function bindingStageTransaction(binding, scope) {
  if (Array.isArray(binding.stageTransactions)) {
    return binding.stageTransactions.find((item) => item?.scope === scope || item?.stage === scope) ?? null;
  }
  return isPlainObject(binding.stageTransactions) ? binding.stageTransactions[scope] ?? null : null;
}

function validateStageTransaction(stage, descriptors) {
  const issues = [];
  if (!isPlainObject(stage)) return ["binding_stage_transaction_invalid"];
  if (!/^[A-Za-z0-9._:-]{1,200}$/u.test(String(stage.transactionId ?? ""))) issues.push("binding_stage_transaction_id_invalid");
  if (!Number.isFinite(Date.parse(String(stage.createdAt ?? "")))) issues.push("binding_stage_created_at_invalid");
  if (!isPlainObject(stage.manifestBindings)) issues.push("binding_stage_manifest_bindings_invalid");
  const descriptorMap = new Map(descriptors.map((descriptor) => [descriptor.role, descriptor.byteDigest]));
  const expected = [
    ["stateDigest", ["state"]],
    ["cacheIndexDigest", ["cacheIndex", "cache"]],
    ["receiptIndexDigest", ["receiptIndex", "receipts"]],
    ["requestLedgerDigest", ["requestLedger", "ledger"]],
    ["counterDigest", ["counters", "counter"]],
  ];
  for (const [digestField, aliases] of expected) {
    const memberDigest = aliases.map((alias) => descriptorMap.get(alias)).find(Boolean);
    if (!memberDigest) issues.push(`binding_stage_member_role_missing:${digestField}`);
    else if (stage[digestField] !== memberDigest) issues.push(`binding_stage_member_digest_mismatch:${digestField}`);
  }
  return issues;
}

function normalizeRuntimeFieldNames(value) {
  const supplied = Array.isArray(value) ? value : ["cacheHit", "readAt", "selectedAsEffective"];
  const fields = uniqueStrings(supplied);
  if (fields.some((field) => !/^[A-Za-z][A-Za-z0-9_]{0,80}$/u.test(field))) {
    throw new Error("runtime_field_name_invalid");
  }
  return fields;
}

function findRuntimeOnlyDigestMatch(payload, runtimeFields, observedDigest) {
  if (sha256(payload) === observedDigest) return payload;
  const candidates = runtimeFields.map((field) => runtimeFieldCandidates(field, payload[field]));
  let matched = null;
  visitRuntimeCandidates(0, payload, runtimeFields, candidates, observedDigest, (value) => { matched = value; });
  return matched;
}

function visitRuntimeCandidates(index, source, fields, candidates, observedDigest, onMatch) {
  if (index >= fields.length) {
    if (sha256(source) === observedDigest) onMatch(source);
    return;
  }
  for (const candidate of candidates[index]) {
    const next = { ...source };
    if (candidate === ABSENT) delete next[fields[index]];
    else next[fields[index]] = candidate;
    visitRuntimeCandidates(index + 1, next, fields, candidates, observedDigest, onMatch);
  }
}

const ABSENT = Symbol("absent");

function runtimeFieldCandidates(field, current) {
  if (field === "cacheHit" || field === "selectedAsEffective") return uniqueValues([current, false, true, ABSENT]);
  if (field === "readAt") return uniqueValues([current, null, ABSENT]);
  return uniqueValues([current, null, false, true, ABSENT]);
}

function omitKeys(value, keys) {
  const denied = new Set(keys);
  return Object.fromEntries(Object.entries(value).filter(([key]) => !denied.has(key)));
}

function collectGovernedFiles(root, path, output, excluded, excludeAuditReceipts) {
  const relativePath = normalizeRelativePath(relative(root, path));
  if (excluded.some((entry) => relativePath === entry || relativePath.startsWith(`${entry}/`))) return;
  if (excludeAuditReceipts && /(?:^|\/)(?:.*(?:verification|validation|pretest).*receipt|audit-receipts?)(?:[-./]|$)/iu.test(relativePath)) return;
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) throw new Error(`governed_state_symlink_forbidden:${relativePath}`);
  if (stat.isFile()) {
    output.push(path);
    return;
  }
  if (!stat.isDirectory()) throw new Error(`governed_state_member_type_invalid:${relativePath}`);
  for (const name of readdirSync(path).sort((left, right) => left.localeCompare(right))) {
    collectGovernedFiles(root, join(path, name), output, excluded, excludeAuditReceipts);
  }
}

function resolveGovernedPath(root, input) {
  const relativePath = String(input ?? "").trim();
  if (!relativePath || isAbsolute(relativePath)) throw new Error("governed_state_path_invalid");
  const absolute = resolve(root, relativePath);
  if (absolute !== root && !absolute.startsWith(`${root}${sep}`)) throw new Error("governed_state_path_escape");
  return absolute;
}

function normalizeRelativePath(value) {
  return value.split(sep).join("/");
}

function uniqueStrings(values) {
  return [...new Set(values.map((value) => String(value).trim()).filter(Boolean))].sort();
}

function uniqueValues(values) {
  const output = [];
  for (const value of values) if (!output.some((existing) => Object.is(existing, value))) output.push(value);
  return output;
}

function digestMember(value) {
  return sha256(value ?? null);
}

function suppliedOrComputedDigest(supplied, value) {
  if (supplied === undefined || supplied === null) return digestMember(value);
  const digest = String(supplied);
  if (!/^[a-f0-9]{64}$/u.test(digest)) throw new Error("atomic_member_digest_invalid");
  return digest;
}

function cloneJson(value) {
  return JSON.parse(canonicalJson(value));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredToken(value, code) {
  const token = String(value ?? "").trim();
  if (!/^[A-Za-z0-9._:-]{1,200}$/u.test(token)) throw new Error(code);
  return token;
}

function requiredTimestamp(value) {
  const text = String(value ?? "");
  if (!Number.isFinite(Date.parse(text))) throw new Error("atomic_binding_created_at_invalid");
  return text;
}
