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
import {
  CANONICAL_AUTHORITY_NODE_IDS,
  verifyCanonicalAuthorityGraph,
} from "./authorityGraph.js";
import { validateCurrentAuthorityDocuments } from "./currentAuthority.js";
import {
  REQUEST_COUNTER_FIELDS,
  REQUEST_EVENT_SCHEMA,
  validateRequestEventLedger,
} from "./requestEventLedger.js";

export const RECEIPT_ENVELOPE_SCHEMA = "receipt-envelope-v0.2";
export const ATOMIC_BINDING_SCHEMA = "m2.v2.request-state-atomic-binding.v0.1";
export const CURRENT_REQUEST_STATE_BINDING_RELATIVE = "data/private-output/m2-v2-integrity-remediation/request-state-binding-private-v0.1.json";
export const REQUEST_STATE_TRANSACTION_ROOT_RELATIVE = "data/private-output/m2-v2-integrity-remediation/request-state-transactions";
export const CLOSED_ATOMIC_BINDING_SCHEMA = "m2.v2.request-state-atomic-binding.v0.2";
export const CLOSED_ATOMIC_TRANSACTION_SCHEMA = "m2.v2.request-state-transaction.v0.2";
export const CURRENT_CLOSED_REQUEST_STATE_BINDING_RELATIVE = "data/private-output/m2-v2-integrity-remediation/request-state-binding-private-v0.2.json";
export const CLOSED_ATOMIC_MEMBER_ROLES = Object.freeze([
  "state",
  "cache_index",
  "receipt_index",
  "request_event_ledger",
  "counter_projection",
  "transaction_manifest",
  "execution_contract",
  "immutable_manifests",
  "frozen_upstream_digests",
  "derived_evaluation",
  "effective_receipt_index",
  "current_authority",
  "current_restatement",
  "contract_bound_public_report_digests",
]);
export const CANONICAL_AUTHORITY_MEMBER_ROLES = Object.freeze([...CANONICAL_AUTHORITY_NODE_IDS]);

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
  const b4Unchanged = !paths.some((path) => (
    /oldProductEvaluation|formal-cash|calibrationSpec/iu.test(path)
      || (
        /(?:^|\/)(?:docs|scripts|test)\/(?:analysis\/)?m2-real-data\//iu.test(path)
        && /(?:^|[\/_.-])b4(?:$|[\/_.-])/iu.test(path)
      )
  ));
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

/**
 * Read-only integrity gate used by historical public verifiers. A legacy
 * compatibility state is never authoritative by itself: the scoped atomic
 * binding must be present, bind the exact pre-registered role set, and bind a
 * replayable request ledger plus its counter projection. When the current
 * closed binding exists, it is also required to validate in full.
 */
export function validateVerifierRequestIntegrity(root, options = {}) {
  const issues = [];
  const scope = String(options.scope ?? "");
  if (!/^[A-Za-z0-9._:-]{1,200}$/u.test(scope)) {
    return verifierIntegrityResult(["request_state_scope_invalid"]);
  }
  const eventStage = String(options.eventStage ?? scope);
  const requiredAtomicRoles = uniqueStrings(options.requiredAtomicRoles ?? [
    "state",
    "cacheIndex",
    "receiptIndex",
    "requestLedger",
    "counters",
  ]).sort();
  let snapshot = null;
  try { snapshot = readCurrentRequestStateSnapshot(root, { scope }); } catch {
    issues.push("request_state_binding_unreadable");
  }
  if (!snapshot) return verifierIntegrityResult(issues);
  if (!snapshot.present) issues.push("request_state_binding_missing");
  else if (!snapshot.valid) issues.push(...snapshot.issues.map((issue) => `request_state_binding:${issue}`));

  let replay = null;
  if (snapshot.present && snapshot.valid) {
    const atomicRoles = Object.keys(snapshot.binding?.scopeMembers?.[scope] ?? {}).sort();
    if (canonicalJson(atomicRoles) !== canonicalJson(requiredAtomicRoles)) {
      const missing = requiredAtomicRoles.filter((role) => !atomicRoles.includes(role));
      const extra = atomicRoles.filter((role) => !requiredAtomicRoles.includes(role));
      if (missing.length) issues.push(`request_state_roles_missing:${missing.join("+")}`);
      if (extra.length) issues.push(`request_state_roles_extra:${extra.join("+")}`);
    }
    if (snapshot.memberCount !== requiredAtomicRoles.length) issues.push("request_state_member_count_mismatch");

    const ledgerResult = validateVerifierLedger(snapshot.members?.requestLedger, eventStage);
    if (!ledgerResult.valid) issues.push(...ledgerResult.issues.map((issue) => `request_event_ledger:${issue}`));
    else replay = ledgerResult.replay;

    const counterResult = validateVerifierCounterProjection(
      snapshot.members?.counters,
      snapshot.members?.requestLedger,
      replay,
      scope,
      snapshot.transactionId,
    );
    if (!counterResult.valid) issues.push(...counterResult.issues.map((issue) => `request_counters:${issue}`));

    const state = snapshot.members?.state;
    if (!isPlainObject(state)) issues.push("request_state_member_invalid");
    else if (replay) {
      if (isPlainObject(state.requestCounters)
        && canonicalJson(state.requestCounters) !== canonicalJson(replay.counters)) {
        issues.push("request_state_counter_replay_mismatch");
      }
      if (Array.isArray(state.requestEventLedger)
        && canonicalJson(state.requestEventLedger) !== canonicalJson(snapshot.members.requestLedger)) {
        issues.push("request_state_ledger_binding_mismatch");
      }
      const physicalCount = verifierPhysicalRequestCount(state);
      if (physicalCount !== null && physicalCount !== replay.counters.reserved) {
        issues.push("request_state_physical_reservation_replay_mismatch");
      }
    }

    const legacyStateRelativePath = options.legacyStateRelativePath;
    if (legacyStateRelativePath) {
      let legacyPath;
      try { legacyPath = resolveGovernedPath(resolve(root), legacyStateRelativePath); } catch {
        issues.push("legacy_state_path_invalid");
      }
      if (legacyPath) {
        if (!existsSync(legacyPath) || !isRegularGovernedFile(resolve(root), legacyPath)) {
          issues.push("legacy_state_mirror_missing_or_invalid");
        } else {
          try {
            const legacyState = JSON.parse(readFileSync(legacyPath, "utf8"));
            if (canonicalJson(legacyState) !== canonicalJson(snapshot.members?.state)) {
              issues.push("legacy_state_mirror_stale");
            }
          } catch {
            issues.push("legacy_state_mirror_unreadable");
          }
        }
      }
    }
  }

  const closed = validateClosedAtomicRequestBinding(root, {
    scope: options.closedScope ?? "v2b8",
    eventStage: options.closedEventStage ?? "v2b8",
  });
  if (closed.present) {
    if (!closed.valid) issues.push(...closed.issues.map((issue) => `current_closed_binding:${issue}`));
    else {
      if (closed.memberCount !== CLOSED_ATOMIC_MEMBER_ROLES.length) issues.push("current_closed_binding_member_count_mismatch");
      if (closed.currentRestatementVerified !== true) issues.push("current_closed_binding_restatement_unverified");
      if (closed.currentAuthorityDigestVerified !== true) issues.push("current_closed_binding_authority_digest_unverified");
      if (closed.effectiveReceiptsVerified !== true) issues.push("current_closed_binding_effective_receipts_unverified");
    }
  } else if (options.requireClosedBinding === true) {
    issues.push("current_closed_binding_missing");
  }

  return verifierIntegrityResult(issues, {
    scope,
    transactionId: snapshot.transactionId ?? null,
    bindingDigest: snapshot.bindingDigest ?? null,
    requestEventLedgerVerified: replay !== null,
    requestCounterReplayVerified: replay !== null
      && !issues.some((issue) => issue.startsWith("request_counters:")),
    closedBindingPresent: closed.present === true,
    closedBindingVerified: closed.present === true ? closed.valid === true : null,
    replay,
  });
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

/**
 * Build the v0.2 closed binding. Unlike the compatibility v0.1 binding, this
 * accepts exactly the declared role set and never accepts caller-supplied
 * digests as proof: the verifier below always re-reads every bound file.
 */
export function createClosedAtomicRequestBinding(input) {
  if (!isPlainObject(input)) throw new Error("closed_atomic_binding_input_invalid");
  const requiredRoles = normalizeClosedRoleSet(input.requiredRoles ?? CLOSED_ATOMIC_MEMBER_ROLES);
  const members = normalizeClosedDescriptors(input.members, requiredRoles);
  const payload = {
    schema: CLOSED_ATOMIC_BINDING_SCHEMA,
    privateOnly: true,
    scope: requiredToken(input.scope, "closed_atomic_scope_invalid"),
    transactionId: requiredToken(input.transactionId, "closed_atomic_transaction_id_invalid"),
    members,
  };
  return { ...payload, bindingDigest: sha256(payload) };
}

export function buildClosedAtomicTransactionManifest(input) {
  if (!isPlainObject(input)) throw new Error("closed_atomic_transaction_input_invalid");
  const requiredRoles = normalizeClosedRoleSet(input.requiredRoles ?? CLOSED_ATOMIC_MEMBER_ROLES)
    .filter((role) => role !== "transaction_manifest");
  const members = normalizeClosedDescriptors(input.members, requiredRoles);
  const payload = {
    schema: CLOSED_ATOMIC_TRANSACTION_SCHEMA,
    privateOnly: true,
    scope: requiredToken(input.scope, "closed_atomic_scope_invalid"),
    transactionId: requiredToken(input.transactionId, "closed_atomic_transaction_id_invalid"),
    createdAt: requiredTimestamp(input.createdAt),
    members,
  };
  return { ...payload, manifestDigest: sha256(payload) };
}

/**
 * Lowest side-effect-free integration point for the v0.3 authority graph.
 * Historical v0.2 closed bindings remain readable, but they cannot satisfy
 * this projection unless a caller supplies the complete canonical evidence.
 */
export function validateCanonicalAuthorityProjection(input, options = {}) {
  return verifyCanonicalAuthorityGraph(input, {
    requireCoreCommitment: options.requireCoreCommitment !== false,
  });
}

/**
 * Read-only verification for a complete closed transaction. Missing binding
 * is invalid, every role/file digest is re-read, and all projections are
 * checked against the append-only ledger and immutable receipt envelopes.
 */
export function validateClosedAtomicRequestBinding(root, options = {}) {
  const absoluteRoot = resolve(root);
  const requiredRoles = normalizeClosedRoleSet(options.requiredRoles ?? CLOSED_ATOMIC_MEMBER_ROLES);
  const bindingRelativePath = options.bindingRelativePath ?? CURRENT_CLOSED_REQUEST_STATE_BINDING_RELATIVE;
  let bindingPath;
  try { bindingPath = resolveGovernedPath(absoluteRoot, bindingRelativePath); } catch {
    return closedBindingResult(["closed_binding_path_invalid"]);
  }
  if (!existsSync(bindingPath)) return closedBindingResult(["closed_binding_missing"], { present: false });
  if (!isRegularGovernedFile(absoluteRoot, bindingPath)) {
    return closedBindingResult(["closed_binding_file_invalid"]);
  }

  let binding;
  try { binding = JSON.parse(readFileSync(bindingPath, "utf8")); } catch {
    return closedBindingResult(["closed_binding_unreadable"]);
  }
  if (!isPlainObject(binding)) return closedBindingResult(["closed_binding_invalid"]);
  const issues = [];
  if (binding.schema !== CLOSED_ATOMIC_BINDING_SCHEMA) issues.push("closed_binding_schema_invalid");
  if (binding.privateOnly !== true) issues.push("closed_binding_private_boundary_invalid");
  if (!/^[A-Za-z0-9._:-]{1,200}$/u.test(String(binding.scope ?? ""))) issues.push("closed_binding_scope_invalid");
  if (options.scope && binding.scope !== options.scope) issues.push("closed_binding_scope_mismatch");
  if (!/^[A-Za-z0-9._:-]{1,200}$/u.test(String(binding.transactionId ?? ""))) {
    issues.push("closed_binding_transaction_id_invalid");
  }
  const { bindingDigest, ...bindingPayload } = binding;
  if (bindingDigest !== sha256(bindingPayload)) issues.push("closed_binding_digest_invalid");

  let descriptors = [];
  try { descriptors = normalizeClosedDescriptors(binding.members, requiredRoles); } catch (error) {
    issues.push(String(error?.message ?? "closed_binding_members_invalid"));
  }
  const members = new Map();
  for (const descriptor of descriptors) {
    const read = readClosedMember(absoluteRoot, descriptor);
    if (!read.valid) {
      issues.push(...read.issues);
      continue;
    }
    members.set(descriptor.role, { ...descriptor, ...read });
  }

  validateClosedTransactionManifest(binding, requiredRoles, members, issues);
  const ledger = parseClosedMember(members.get("request_event_ledger"), "request_event_ledger", issues, true);
  const ledgerValidation = Array.isArray(ledger)
    ? validateRequestEventLedger(ledger, { stage: options.eventStage })
    : { valid: false, issues: ["ledger_not_array"], replay: null };
  if (!ledgerValidation.valid) {
    issues.push(...ledgerValidation.issues.map((issue) => `request_event_ledger:${issue}`));
  }

  const counterDocument = parseClosedMember(members.get("counter_projection"), "counter_projection", issues);
  const counterProjection = isPlainObject(counterDocument?.counters) ? counterDocument.counters : counterDocument;
  if (ledgerValidation.valid && canonicalJson(counterProjection) !== canonicalJson(ledgerValidation.replay.counters)) {
    issues.push("counter_projection_replay_mismatch");
  }
  const state = parseClosedMember(members.get("state"), "state", issues);
  if (!isPlainObject(state?.requestCounters)) issues.push("state_request_counters_missing");
  else if (ledgerValidation.valid
    && canonicalJson(state.requestCounters) !== canonicalJson(ledgerValidation.replay.counters)) {
    issues.push("state_request_counters_replay_mismatch");
  }

  const receiptIndex = parseClosedMember(members.get("receipt_index"), "receipt_index", issues, true);
  const receiptIssueStart = issues.length;
  const receiptDigests = validateClosedReceiptIndex(absoluteRoot, receiptIndex, issues);
  const receiptIndexVerified = receiptDigests !== null && issues.length === receiptIssueStart;
  const cacheIndex = parseClosedMember(members.get("cache_index"), "cache_index", issues);
  validateClosedCacheIndex(cacheIndex, receiptDigests, issues);
  const effectiveReceiptIndex = parseClosedMember(
    members.get("effective_receipt_index"),
    "effective_receipt_index",
    issues,
    true,
  );
  const effectiveReceiptIssueStart = issues.length;
  validateEffectiveReceiptIndex(effectiveReceiptIndex, receiptDigests, issues);
  const effectiveReceiptIndexVerified = issues.length === effectiveReceiptIssueStart;

  let contractBoundAuthorityGraph = null;
  for (const role of ["immutable_manifests", "frozen_upstream_digests", "contract_bound_public_report_digests"]) {
    const document = parseClosedMember(members.get(role), role, issues);
    validateBoundArtifactIndex(absoluteRoot, document, role, issues);
    if (role === "contract_bound_public_report_digests") {
      contractBoundAuthorityGraph = document?.canonicalAuthorityGraph ?? null;
    }
  }

  let authority = null;
  const currentAuthority = parseClosedMember(members.get("current_authority"), "current_authority", issues);
  const currentRestatement = parseClosedMember(members.get("current_restatement"), "current_restatement", issues);
  if (currentAuthority && currentRestatement) {
    const isV03Authority = currentAuthority?.schemaVersion === "m2-v2-current-state-index-v0.3";
    const commitment = isV03Authority
      ? readCurrentTrackedCommitment(
        absoluteRoot,
        currentAuthority?.currentAuthority?.trackedCoreCommitmentPath,
        issues,
      )
      : null;
    authority = validateCurrentAuthorityDocuments({
      index: currentAuthority,
      restatement: currentRestatement,
      root: absoluteRoot,
      indexRelativePath: members.get("current_authority")?.path,
      indexByteDigest: members.get("current_authority")?.actualByteDigest,
      restatementRelativePath: members.get("current_restatement")?.path,
      restatementByteDigest: members.get("current_restatement")?.actualByteDigest,
      ...(isV03Authority ? {
        graph: contractBoundAuthorityGraph,
        trackedCoreCommitment: commitment?.value,
        trackedCoreCommitmentRelativePath: commitment?.relativePath,
        trackedCoreCommitmentByteDigest: commitment?.byteDigest,
      } : {}),
    });
    if (!authority.valid) issues.push(...authority.issues.map((issue) => `current_authority:${issue}`));
    if (isV03Authority && (currentAuthority?.supersession?.transactionId !== binding.transactionId
      || currentRestatement?.supersession?.transactionId !== binding.transactionId)) {
      issues.push("current_authority_transaction_id_mismatch");
    }
  }

  let canonicalAuthority = null;
  const canonicalAuthorityInput = options.canonicalAuthorityInput
    ?? (contractBoundAuthorityGraph ? {
      graph: contractBoundAuthorityGraph,
      evidence: options.canonicalAuthorityEvidence,
      trackedCoreCommitment: readCurrentTrackedCommitment(
        absoluteRoot,
        currentAuthority?.currentAuthority?.trackedCoreCommitmentPath,
        [],
      )?.value,
    } : undefined);
  if (canonicalAuthorityInput !== undefined && canonicalAuthorityInput.evidence !== undefined) {
    canonicalAuthority = validateCanonicalAuthorityProjection(canonicalAuthorityInput, {
      requireCoreCommitment: options.requireCoreCommitment !== false,
    });
    if (!canonicalAuthority.valid) {
      issues.push(...canonicalAuthority.issues.map((issue) => `canonical_authority:${issue}`));
    }
  }

  const closedTransactionVerified = issues.length === 0;
  return closedBindingResult(issues, {
    present: true,
    transactionId: binding.transactionId ?? null,
    bindingDigest: binding.bindingDigest ?? null,
    memberCount: descriptors.length,
    historicalDecision: authority?.historicalDecision ?? null,
    currentRestatedDecision: authority?.currentRestatedDecision ?? null,
    currentRestatementVerified: closedTransactionVerified && authority?.currentRestatementVerified === true,
    currentAuthorityDigestVerified: closedTransactionVerified && authority?.currentAuthorityDigestVerified === true,
    effectiveReceiptsVerified: closedTransactionVerified && receiptIndexVerified && effectiveReceiptIndexVerified,
    canonicalAuthorityVerified: closedTransactionVerified && canonicalAuthority?.valid === true,
    canonicalAuthorityGraphDigestSha256: canonicalAuthority?.graphDigestSha256 ?? null,
    full160Authorized: false,
    nextDevelopmentReadiness: "NOT_AUTHORIZED",
    replay: ledgerValidation.valid ? ledgerValidation.replay : null,
  });
}

function normalizeClosedRoleSet(values) {
  if (!Array.isArray(values) || values.length === 0) throw new Error("closed_atomic_roles_invalid");
  const roles = values.map((value) => String(value));
  if (roles.some((role) => !/^[a-z][a-z0-9_]{1,80}$/u.test(role))) throw new Error("closed_atomic_role_invalid");
  if (new Set(roles).size !== roles.length) throw new Error("closed_atomic_role_duplicate");
  return [...roles].sort();
}

function normalizeClosedDescriptors(values, requiredRoles) {
  if (!Array.isArray(values)) throw new Error("closed_atomic_members_invalid");
  const descriptors = values.map((value) => {
    if (!isPlainObject(value)) throw new Error("closed_atomic_member_invalid");
    const role = String(value.role ?? "");
    const path = normalizeRelativePath(String(value.path ?? "").replace(/\\/gu, "/"));
    const byteDigest = String(value.byteDigest ?? "");
    if (!/^[a-z][a-z0-9_]{1,80}$/u.test(role)) throw new Error("closed_atomic_member_role_invalid");
    if (!path || isAbsolute(path) || /^[A-Za-z]:/u.test(path) || path.startsWith("//")
      || path.split("/").some((part) => !part || part === "." || part === "..")) {
      throw new Error(`closed_atomic_member_path_invalid:${role}`);
    }
    if (!/^[a-f0-9]{64}$/u.test(byteDigest)) throw new Error(`closed_atomic_member_digest_invalid:${role}`);
    return { role, path, byteDigest };
  }).sort((left, right) => left.role.localeCompare(right.role));
  if (new Set(descriptors.map((descriptor) => descriptor.role)).size !== descriptors.length) {
    throw new Error("closed_atomic_member_role_duplicate");
  }
  if (new Set(descriptors.map((descriptor) => descriptor.path.toLocaleLowerCase("en-US"))).size !== descriptors.length) {
    throw new Error("closed_atomic_member_path_duplicate");
  }
  const actualRoles = descriptors.map((descriptor) => descriptor.role).sort();
  if (canonicalJson(actualRoles) !== canonicalJson([...requiredRoles].sort())) {
    const missing = requiredRoles.filter((role) => !actualRoles.includes(role));
    const extra = actualRoles.filter((role) => !requiredRoles.includes(role));
    if (missing.length) throw new Error(`closed_atomic_roles_missing:${missing.join("+")}`);
    throw new Error(`closed_atomic_roles_extra:${extra.join("+")}`);
  }
  return descriptors;
}

function readClosedMember(root, descriptor) {
  let path;
  try { path = resolveGovernedPath(root, descriptor.path); } catch {
    return { valid: false, issues: [`closed_member_path_invalid:${descriptor.role}`] };
  }
  if (!existsSync(path) || !isRegularGovernedFile(root, path)) {
    return { valid: false, issues: [`closed_member_missing_or_reparse:${descriptor.role}`] };
  }
  const bytes = readFileSync(path);
  const actualByteDigest = createHash("sha256").update(bytes).digest("hex");
  if (actualByteDigest !== descriptor.byteDigest) {
    return { valid: false, issues: [`closed_member_digest_mismatch:${descriptor.role}`] };
  }
  return { valid: true, issues: [], bytes, actualByteDigest };
}

function validateClosedTransactionManifest(binding, requiredRoles, members, issues) {
  const member = members.get("transaction_manifest");
  const manifest = parseClosedMember(member, "transaction_manifest", issues);
  if (!isPlainObject(manifest)) return;
  if (manifest.schema !== CLOSED_ATOMIC_TRANSACTION_SCHEMA) issues.push("transaction_manifest_schema_invalid");
  if (manifest.privateOnly !== true) issues.push("transaction_manifest_private_boundary_invalid");
  if (manifest.scope !== binding.scope) issues.push("transaction_manifest_scope_mismatch");
  if (manifest.transactionId !== binding.transactionId) issues.push("transaction_manifest_id_mismatch");
  const { manifestDigest, ...payload } = manifest;
  if (manifestDigest !== sha256(payload)) issues.push("transaction_manifest_digest_invalid");
  let descriptors;
  try {
    descriptors = normalizeClosedDescriptors(
      manifest.members,
      requiredRoles.filter((role) => role !== "transaction_manifest"),
    );
  } catch (error) {
    issues.push(String(error?.message ?? "transaction_manifest_members_invalid"));
    return;
  }
  const bindingDescriptors = [...members.values()]
    .filter((descriptor) => descriptor.role !== "transaction_manifest")
    .map(({ role, path, byteDigest }) => ({ role, path, byteDigest }))
    .sort((left, right) => left.role.localeCompare(right.role));
  if (canonicalJson(descriptors) !== canonicalJson(bindingDescriptors)) {
    issues.push("transaction_manifest_member_binding_mismatch");
  }
}

function parseClosedMember(member, role, issues, allowNdjson = false) {
  if (!member?.bytes) return null;
  const text = member.bytes.toString("utf8");
  try { return JSON.parse(text); } catch {
    if (allowNdjson) {
      try { return text.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line)); } catch { /* fail below */ }
    }
    issues.push(`closed_member_json_invalid:${role}`);
    return null;
  }
}

function validateClosedReceiptIndex(root, document, issues) {
  const entries = Array.isArray(document) ? document : document?.entries;
  if (!Array.isArray(entries)) {
    issues.push("receipt_index_entries_invalid");
    return null;
  }
  const digests = new Set();
  const references = new Set();
  for (const [index, entry] of entries.entries()) {
    const label = `receipt_index_entry_${index + 1}`;
    if (!isPlainObject(entry) || !/^[a-f0-9]{64}$/u.test(String(entry.receiptDigest ?? ""))) {
      issues.push(`${label}:invalid`);
      continue;
    }
    let relativePath;
    try { relativePath = normalizeClosedReferencePath(entry.path); } catch {
      issues.push(`${label}:path_invalid`);
      continue;
    }
    const lineNumber = entry.lineNumber === undefined ? null : Number(entry.lineNumber);
    if (lineNumber !== null && (!Number.isInteger(lineNumber) || lineNumber < 1)) {
      issues.push(`${label}:line_number_invalid`);
      continue;
    }
    const referenceKey = `${relativePath}#${lineNumber ?? "json"}`.toLocaleLowerCase("en-US");
    if (references.has(referenceKey)) issues.push(`${label}:duplicate_reference`);
    references.add(referenceKey);
    const envelope = readReceiptEnvelopeReference(root, relativePath, lineNumber, label, issues);
    if (!envelope) continue;
    const validation = validateReceiptEnvelope(envelope);
    if (!validation.valid) {
      issues.push(...validation.issues.map((issue) => `${label}:${issue}`));
      continue;
    }
    if (entry.receiptDigest !== envelope.receiptDigest) issues.push(`${label}:receipt_digest_mismatch`);
    if (digests.has(envelope.receiptDigest)) issues.push(`${label}:receipt_digest_duplicate`);
    digests.add(envelope.receiptDigest);
  }
  return digests;
}

function readReceiptEnvelopeReference(root, relativePath, lineNumber, label, issues) {
  let path;
  try { path = resolveGovernedPath(root, relativePath); } catch {
    issues.push(`${label}:receipt_path_escape`);
    return null;
  }
  if (!existsSync(path) || !isRegularGovernedFile(root, path)) {
    issues.push(`${label}:receipt_file_missing_or_reparse`);
    return null;
  }
  const text = readFileSync(path, "utf8");
  if (lineNumber !== null) {
    const lines = text.split(/\r?\n/u).filter(Boolean);
    if (lineNumber > lines.length) {
      issues.push(`${label}:receipt_line_missing`);
      return null;
    }
    try { return JSON.parse(lines[lineNumber - 1]); } catch {
      issues.push(`${label}:receipt_line_invalid`);
      return null;
    }
  }
  try {
    const value = JSON.parse(text);
    if (Array.isArray(value)) {
      if (value.length !== 1) {
        issues.push(`${label}:receipt_line_number_required`);
        return null;
      }
      return value[0];
    }
    return value;
  } catch {
    const lines = text.split(/\r?\n/u).filter(Boolean);
    if (lines.length !== 1) {
      issues.push(`${label}:receipt_line_number_required`);
      return null;
    }
    try { return JSON.parse(lines[0]); } catch {
      issues.push(`${label}:receipt_json_invalid`);
      return null;
    }
  }
}

function validateClosedCacheIndex(document, receiptDigests, issues) {
  if (!isPlainObject(document) || !Array.isArray(document.entries)) {
    issues.push("cache_index_entries_invalid");
    return;
  }
  const allowed = ["adapterVersion", "logicalKey", "physicalKey", "receiptDigest", "transactionId"].sort();
  for (const [index, entry] of document.entries.entries()) {
    const label = `cache_index_entry_${index + 1}`;
    if (!isPlainObject(entry)) {
      issues.push(`${label}:invalid`);
      continue;
    }
    if (canonicalJson(Object.keys(entry).sort()) !== canonicalJson(allowed)) issues.push(`${label}:not_reference_only`);
    if (!/^[a-f0-9]{64}$/u.test(String(entry.receiptDigest ?? ""))) issues.push(`${label}:receipt_digest_invalid`);
    else if (!receiptDigests?.has(entry.receiptDigest)) issues.push(`${label}:receipt_not_recomputed`);
    if (containsForbiddenCachePayload(entry)) issues.push(`${label}:raw_response_present`);
  }
}

function validateEffectiveReceiptIndex(document, receiptDigests, issues) {
  const entries = Array.isArray(document) ? document : document?.entries;
  if (!Array.isArray(entries)) {
    issues.push("effective_receipt_index_entries_invalid");
    return;
  }
  for (const [index, entry] of entries.entries()) {
    const digest = isPlainObject(entry) ? entry.receiptDigest : entry;
    if (!/^[a-f0-9]{64}$/u.test(String(digest ?? "")) || !receiptDigests?.has(digest)) {
      issues.push(`effective_receipt_index_entry_${index + 1}:unverified`);
    }
  }
}

function validateBoundArtifactIndex(root, document, role, issues) {
  if (!isPlainObject(document) || !Array.isArray(document.entries)) {
    issues.push(`${role}_entries_invalid`);
    return;
  }
  const paths = new Set();
  for (const [index, entry] of document.entries.entries()) {
    const label = `${role}_entry_${index + 1}`;
    if (!isPlainObject(entry) || !/^[a-f0-9]{64}$/u.test(String(entry.byteDigest ?? ""))) {
      issues.push(`${label}:invalid`);
      continue;
    }
    let path;
    try { path = normalizeClosedReferencePath(entry.path); } catch {
      issues.push(`${label}:path_invalid`);
      continue;
    }
    const key = path.toLocaleLowerCase("en-US");
    if (paths.has(key)) issues.push(`${label}:duplicate_path`);
    paths.add(key);
    let absolute;
    try { absolute = resolveGovernedPath(root, path); } catch {
      issues.push(`${label}:path_escape`);
      continue;
    }
    if (!existsSync(absolute) || !isRegularGovernedFile(root, absolute)) {
      issues.push(`${label}:missing_or_reparse`);
      continue;
    }
    if (digestFile(absolute) !== entry.byteDigest) issues.push(`${label}:digest_mismatch`);
  }
}

function readCurrentTrackedCommitment(root, relativePath, issues) {
  try {
    const normalized = normalizeClosedReferencePath(relativePath);
    const absolute = resolveGovernedPath(root, normalized);
    if (!existsSync(absolute) || !isRegularGovernedFile(root, absolute)) {
      issues.push("tracked_core_commitment_missing_or_reparse");
      return null;
    }
    const bytes = readFileSync(absolute);
    return {
      relativePath: normalized,
      byteDigest: createHash("sha256").update(bytes).digest("hex"),
      value: JSON.parse(bytes.toString("utf8")),
    };
  } catch {
    issues.push("tracked_core_commitment_invalid");
    return null;
  }
}

function containsForbiddenCachePayload(value) {
  if (Array.isArray(value)) return value.some(containsForbiddenCachePayload);
  if (!isPlainObject(value)) return false;
  const forbidden = new Set(["body", "json", "providerResponse", "rawJson", "rawResponse", "receipt", "receiptPayload", "response"]);
  return Object.entries(value).some(([key, child]) => forbidden.has(key) || containsForbiddenCachePayload(child));
}

function normalizeClosedReferencePath(value) {
  const path = String(value ?? "").replace(/\\/gu, "/");
  if (!path || isAbsolute(path) || /^[A-Za-z]:/u.test(path) || path.startsWith("//")
    || path.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("closed_reference_path_invalid");
  }
  return path;
}

function isRegularGovernedFile(root, path) {
  const absoluteRoot = resolve(root);
  const absolutePath = resolve(path);
  if (absolutePath !== absoluteRoot && !absolutePath.startsWith(`${absoluteRoot}${sep}`)) return false;
  let cursor = absolutePath;
  while (cursor !== absoluteRoot) {
    if (!existsSync(cursor)) return false;
    const stat = lstatSync(cursor);
    if (stat.isSymbolicLink()) return false;
    cursor = dirname(cursor);
  }
  return lstatSync(absolutePath).isFile();
}

function closedBindingResult(issues, values = {}) {
  const uniqueIssues = [...new Set(issues)];
  return {
    present: values.present ?? true,
    valid: uniqueIssues.length === 0,
    issues: uniqueIssues,
    memberCount: values.memberCount ?? 0,
    transactionId: values.transactionId ?? null,
    bindingDigest: values.bindingDigest ?? null,
    historicalDecision: values.historicalDecision ?? null,
    currentRestatedDecision: values.currentRestatedDecision ?? null,
    currentRestatementVerified: values.currentRestatementVerified === true,
    currentAuthorityDigestVerified: values.currentAuthorityDigestVerified === true,
    effectiveReceiptsVerified: values.effectiveReceiptsVerified === true,
    canonicalAuthorityVerified: values.canonicalAuthorityVerified === true,
    canonicalAuthorityGraphDigestSha256: values.canonicalAuthorityGraphDigestSha256 ?? null,
    full160Authorized: false,
    nextDevelopmentReadiness: "NOT_AUTHORIZED",
    replay: values.replay ?? null,
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
    compatibilityretryreserved: "reserved",
    dispatched: "dispatched",
    completed: "completed",
    indeterminate: "indeterminate",
    providerfailed: "providerFailed",
    contractfailed: "contractFailed",
    cachehit: "cacheHit",
    cachehitobserved: "cacheHit",
  }[token] ?? null;
}

function validateVerifierLedger(ledger, eventStage) {
  if (!Array.isArray(ledger)) return { valid: false, issues: ["ledger_not_array"], replay: null };
  if (ledger.length === 0 || ledger.every((entry) => entry?.schema === REQUEST_EVENT_SCHEMA)) {
    return validateRequestEventLedger(ledger, { stage: eventStage });
  }
  const issues = [];
  const expectedKeys = [
    "cacheHit",
    "completed",
    "dispatched",
    "indeterminate",
    "ledgerOrdinal",
    "planned",
    "privateOnly",
    "provider",
    "requestRef",
    "reservationDigest",
    "reserved",
    "schema",
    "sourceStatus",
    "stage",
  ].sort();
  const reservationDigests = new Set();
  const providerOrdinals = new Map();
  for (const [index, entry] of ledger.entries()) {
    const label = `entry_${index + 1}`;
    if (!isPlainObject(entry)) {
      issues.push(`${label}:not_object`);
      continue;
    }
    if (canonicalJson(Object.keys(entry).sort()) !== canonicalJson(expectedKeys)) issues.push(`${label}:key_set_invalid`);
    if (entry.schema !== "m2.v2.request-ledger-entry-private.v0.1") issues.push(`${label}:schema_invalid`);
    if (entry.privateOnly !== true) issues.push(`${label}:private_boundary_invalid`);
    if (entry.stage !== eventStage) issues.push(`${label}:stage_mismatch`);
    if (!/^[A-Za-z0-9._:-]{1,200}$/u.test(String(entry.provider ?? ""))) issues.push(`${label}:provider_invalid`);
    const providerOrdinal = (providerOrdinals.get(entry.provider) ?? 0) + 1;
    providerOrdinals.set(entry.provider, providerOrdinal);
    if (entry.ledgerOrdinal !== providerOrdinal) issues.push(`${label}:ordinal_invalid`);
    if (typeof entry.requestRef !== "string" || entry.requestRef.length < 1 || entry.requestRef.length > 500
      || /[\r\n\u0000]/u.test(entry.requestRef)) issues.push(`${label}:request_ref_invalid`);
    if (!/^[a-f0-9]{64}$/u.test(String(entry.reservationDigest ?? ""))) issues.push(`${label}:reservation_digest_invalid`);
    else if (reservationDigests.has(entry.reservationDigest)) issues.push(`${label}:reservation_digest_duplicate`);
    else reservationDigests.add(entry.reservationDigest);
    if (typeof entry.sourceStatus !== "string" || entry.sourceStatus.length < 1 || entry.sourceStatus.length > 200
      || /[\r\n\u0000]/u.test(entry.sourceStatus)) issues.push(`${label}:source_status_invalid`);
    for (const flag of ["planned", "reserved", "dispatched", "completed", "indeterminate", "cacheHit"]) {
      if (typeof entry[flag] !== "boolean") issues.push(`${label}:${flag}_not_boolean`);
    }
    if (entry.planned !== true) issues.push(`${label}:not_planned`);
    if (entry.dispatched === true && entry.reserved !== true) issues.push(`${label}:dispatch_without_reservation`);
    if (entry.completed === true && entry.dispatched !== true) issues.push(`${label}:completion_without_dispatch`);
    if (entry.completed === true && entry.indeterminate === true) issues.push(`${label}:terminal_status_conflict`);
    if (entry.cacheHit === true && (entry.dispatched === true || entry.completed === true || entry.indeterminate === true)) {
      issues.push(`${label}:cache_hit_physical_status_conflict`);
    }
  }
  const counters = issues.length === 0 ? recomputeRequestCounters(ledger) : null;
  return {
    valid: issues.length === 0,
    issues: uniqueStrings(issues),
    replay: counters ? {
      counters,
      physicalReservationCount: counters.reserved,
      reservations: null,
      lastEventDigest: null,
    } : null,
  };
}

function validateVerifierCounterProjection(document, ledger, replay, scope, transactionId) {
  const issues = [];
  if (!replay) return { valid: false, issues: ["ledger_replay_unavailable"] };
  let counters = document;
  if (isPlainObject(document?.counters)) {
    counters = document.counters;
    const expectedKeys = [
      "byProvider",
      "counters",
      "privateOnly",
      "recomputedFromAppendOnlyLedger",
      "schema",
      "stage",
      "transactionId",
    ].sort();
    if (canonicalJson(Object.keys(document).sort()) !== canonicalJson(expectedKeys)) issues.push("document_key_set_invalid");
    if (document.schema !== "m2.v2.request-counters-private.v0.1") issues.push("document_schema_invalid");
    if (document.privateOnly !== true || document.recomputedFromAppendOnlyLedger !== true) issues.push("document_provenance_invalid");
    if (document.stage !== scope) issues.push("document_stage_mismatch");
    if (document.transactionId !== transactionId) issues.push("document_transaction_id_mismatch");
    if (!isPlainObject(document.byProvider)) issues.push("by_provider_invalid");
    else {
      const ledgerProviders = uniqueStrings((ledger ?? []).map((entry) => entry?.provider));
      for (const provider of ledgerProviders) {
        if (!isPlainObject(document.byProvider[provider])) {
          issues.push(`by_provider_missing:${provider}`);
          continue;
        }
        const expected = recomputeRequestCounters(ledger.filter((entry) => entry?.provider === provider));
        if (canonicalJson(document.byProvider[provider]) !== canonicalJson(expected)) {
          issues.push(`by_provider_replay_mismatch:${provider}`);
        }
      }
      for (const [provider, projection] of Object.entries(document.byProvider)) {
        const expected = recomputeRequestCounters(ledger.filter((entry) => entry?.provider === provider));
        if (canonicalJson(projection) !== canonicalJson(expected)) issues.push(`by_provider_extra_or_stale:${provider}`);
      }
    }
  }
  if (!isPlainObject(counters)
    || canonicalJson(Object.keys(counters).sort()) !== canonicalJson([...REQUEST_COUNTER_FIELDS].sort())) {
    issues.push("counter_key_set_invalid");
  } else if (canonicalJson(counters) !== canonicalJson(replay.counters)) {
    issues.push("counter_replay_mismatch");
  }
  return { valid: issues.length === 0, issues: uniqueStrings(issues) };
}

function verifierPhysicalRequestCount(state) {
  if (Number.isInteger(state?.physicalRelayRequestCount) && state.physicalRelayRequestCount >= 0) {
    return state.physicalRelayRequestCount;
  }
  const tavily = state?.tavily?.physicalRequestCount;
  const relay = state?.relay?.physicalRequestCount;
  if (Number.isInteger(tavily) && tavily >= 0 && Number.isInteger(relay) && relay >= 0) return tavily + relay;
  return null;
}

function verifierIntegrityResult(issues, details = {}) {
  const normalized = uniqueStrings(issues);
  return {
    valid: normalized.length === 0,
    issues: normalized,
    scope: details.scope ?? null,
    transactionId: details.transactionId ?? null,
    bindingDigest: details.bindingDigest ?? null,
    requestEventLedgerVerified: details.requestEventLedgerVerified === true,
    requestCounterReplayVerified: details.requestCounterReplayVerified === true,
    closedBindingPresent: details.closedBindingPresent === true,
    closedBindingVerified: details.closedBindingVerified ?? null,
    replay: details.replay ?? null,
  };
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
