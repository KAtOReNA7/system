import { createHash } from "node:crypto";

const SCHEMA = "m2.v2.pr7.s0-authority-fixture.v0.1";
const FIXED_TIME = "2026-01-01T00:00:00.000Z";
const DEFAULT_SEED = "pr7-s0-authority-seed-v0.1";
const PROOF_OUTPUT_PATH = "audit/proof-scope-result-private-v0.1.json";

const ROLE_PATHS = Object.freeze({
  ledger: "authority/request-event-ledger.ndjson",
  receiptEnvelopes: "authority/receipt-envelopes.json",
  receiptIndex: "authority/receipt-index.json",
  safeCache: "authority/safe-cache.json",
  effectiveIndex: "authority/effective-index.json",
  counterProjection: "authority/counter-projection.json",
  derivedInputs: "authority/derived-inputs.json",
  publicMirrors: "authority/public-mirror-é.json",
  currentPointer: "authority/current-pointer.json",
  proofScope: "authority/proof-scope-manifest.json",
});

export const AUTHORITY_FAULT_IDS = Object.freeze([
  "authority.missing.v0.1",
  "authority.extra.v0.1",
  "authority.duplicate-physical-mapping.v0.1",
  "authority.orphan.v0.1",
  "authority.receipt-swap.v0.1",
  "authority.digest-mismatch.v0.1",
  "authority.counter-drift.v0.1",
  "authority.non-effective-row-omission.v0.1",
  "authority.mirror-mutation.v0.1",
  "authority.alternate-self-consistent-graph.v0.1",
  "authority.nfc-case-alias.v0.1",
]);

export const SAFE_CACHE_CASE_IDS = Object.freeze([
  "safe-cache.valid-minimal.v0.1",
  "safe-cache.phase-owned-projections.v0.1",
  "safe-cache.unknown-key.v0.1",
  "safe-cache.unknown-nested-key.v0.1",
  "safe-cache.deep-structure.v0.1",
  "safe-cache.oversized-string.v0.1",
  "safe-cache.oversized-total-bytes.v0.1",
  "safe-cache.too-many-items.v0.1",
  "safe-cache.prototype-key.v0.1",
  "safe-cache.secret-shaped-field.v0.1",
  "safe-cache.raw-provider-bytes.v0.1",
]);

export const PROOF_SCOPE_CASE_IDS = Object.freeze([
  "proof-scope.self-output-exclusion.v0.1",
  "proof-scope.missing-member.v0.1",
  "proof-scope.extra-member.v0.1",
  "proof-scope.rename.v0.1",
  "proof-scope.content-mutation.v0.1",
  "proof-scope.metadata-mutation.v0.1",
  "proof-scope.identity-link-mutation.v0.1",
]);

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  if (typeof value === "number" && !Number.isFinite(value)) throw new TypeError("non_finite_number");
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new TypeError("unsupported_json_value");
  return encoded;
}

export function canonicalJsonBytes(value) {
  return Buffer.from(`${canonicalJson(value)}\n`, "utf8");
}

export function sha256(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8");
  return createHash("sha256").update(bytes).digest("hex");
}

export function normalizeFixturePath(input) {
  if (typeof input !== "string" || input.length === 0) throw new TypeError("fixture_path_required");
  const normalized = input.replaceAll("\\", "/").normalize("NFC");
  const parts = normalized.split("/");
  if (normalized.startsWith("/") || /^[A-Za-z]:\//u.test(normalized)) throw new Error("absolute_fixture_path_forbidden");
  if (parts.some((part) => part === "" || part === "." || part === "..")) throw new Error("unsafe_fixture_path");
  return parts.join("/");
}

export function buildAuthorityFixture({ seed = DEFAULT_SEED } = {}) {
  if (typeof seed !== "string" || seed.length === 0) throw new TypeError("seed_required");
  const authorityId = `synthetic-authority-${sha256(seed).slice(0, 16)}`;
  const requestA = `request-${sha256(`${seed}:a`).slice(0, 12)}`;
  const requestB = `request-${sha256(`${seed}:b`).slice(0, 12)}`;
  const receiptA = `receipt-${sha256(`${seed}:receipt:a`).slice(0, 12)}`;
  const receiptB = `receipt-${sha256(`${seed}:receipt:b`).slice(0, 12)}`;
  const ledger = [
    event(1, requestA, "planned", seed),
    event(2, requestA, "reserved", seed),
    event(3, requestA, "dispatched", seed),
    event(4, requestA, "completed", seed, receiptA),
    event(5, requestB, "planned", seed),
    event(6, requestB, "cache_hit_observed", seed, receiptB),
  ];
  for (let index = 0; index < ledger.length; index += 1) {
    ledger[index].previousEventDigest = index === 0 ? null : ledger[index - 1].eventDigest;
    ledger[index].eventDigest = sha256(canonicalJson({ ...ledger[index], eventDigest: undefinedValueMarker() }));
  }
  const receiptEnvelopes = {
    schema: "m2.v2.pr7.s0.synthetic-receipts.v0.1",
    entries: [
      receiptEnvelope(receiptA, requestA, true, seed),
      receiptEnvelope(receiptB, requestB, false, seed),
    ],
  };
  const receiptIndex = {
    schema: "m2.v2.pr7.s0.synthetic-receipt-index.v0.1",
    entries: receiptEnvelopes.entries.map((entry) => ({
      logicalKey: entry.logicalKey,
      physicalKey: entry.physicalKey,
      receiptDigest: entry.receiptDigest,
      receiptId: entry.receiptId,
    })),
  };
  const safeCache = {
    schema: "m2.v2.pr7.s0.synthetic-safe-cache.v0.1",
    entries: [{
      logicalKey: requestB,
      phase: "V2-B.6",
      projection: { kind: "capability_ok", status: "OK" },
      receiptDigest: receiptEnvelopes.entries[1].receiptDigest,
    }],
  };
  const effectiveIndex = {
    schema: "m2.v2.pr7.s0.synthetic-effective-index.v0.1",
    entries: [{
      logicalKey: requestA,
      receiptDigest: receiptEnvelopes.entries[0].receiptDigest,
      selectedAsEffective: true,
    }],
  };
  const counterProjection = {
    schema: "m2.v2.pr7.s0.synthetic-counter-projection.v0.1",
    counters: { cacheHit: 1, completed: 1, dispatched: 1, planned: 2, reserved: 1 },
    ledgerDigest: sha256(canonicalJson(ledger)),
  };
  const derivedInputs = {
    schema: "m2.v2.pr7.s0.synthetic-derived-inputs.v0.1",
    rows: [
      { effective: true, logicalKey: requestA, receiptDigest: receiptEnvelopes.entries[0].receiptDigest },
      { effective: false, logicalKey: requestB, receiptDigest: receiptEnvelopes.entries[1].receiptDigest },
    ],
  };
  const publicMirrors = {
    schema: "m2.v2.pr7.s0.synthetic-public-mirror.v0.1",
    decision: "CANARY_FAIL",
    full160Authorized: false,
    aggregate: { effectiveReceiptCount: 1, providerRequestDelta: 0 },
  };
  const documents = {
    ledger,
    receiptEnvelopes,
    receiptIndex,
    safeCache,
    effectiveIndex,
    counterProjection,
    derivedInputs,
    publicMirrors,
  };
  const preliminaryMembers = Object.keys(documents).map((role) => memberFor(role, documents[role], authorityId));
  const currentPointer = {
    schema: "m2.v2.pr7.s0.synthetic-current-pointer.v0.1",
    authorityId,
    currentDecision: "CANARY_FAIL",
    full160Authorized: false,
    memberBindings: preliminaryMembers.map(bindingForMember),
  };
  documents.currentPointer = currentPointer;
  const scopedMembers = Object.keys(documents).map((role) => memberFor(role, documents[role], authorityId));
  const proofScope = {
    schema: "m2.v2.pr7.s0.synthetic-proof-scope.v0.1",
    scopeId: `scope-${sha256(`${seed}:scope`).slice(0, 16)}`,
    expectedAuthorityDerivedPathSet: scopedMembers.map((member) => member.relativePath).sort(),
    members: scopedMembers.map((member) => ({
      byteLength: member.byteLength,
      contentSha256: member.contentSha256,
      linkType: member.linkType,
      metadata: member.metadata,
      physicalIdentity: member.physicalIdentity,
      relativePath: member.relativePath,
      role: member.role,
    })).sort(compareScopeMembers),
    selfOutputExclusions: [PROOF_OUTPUT_PATH],
  };
  documents.proofScope = proofScope;
  const members = Object.keys(documents).map((role) => memberFor(role, documents[role], authorityId));
  const physicalFiles = Object.fromEntries(members.map((member) => [
    member.relativePath,
    canonicalJson(documents[member.role]),
  ]));
  const fixture = {
    schema: SCHEMA,
    seed,
    authorityId,
    createdAt: FIXED_TIME,
    roleOrder: Object.keys(ROLE_PATHS),
    documents,
    members: members.sort((left, right) => compareText(left.relativePath, right.relativePath)),
    physicalFiles: sortObject(physicalFiles),
    proofOutputPath: PROOF_OUTPUT_PATH,
    externalSafety: {
      actualExternalFetchCount: 0,
      databaseConnections: 0,
      providerRequestDelta: 0,
    },
  };
  fixture.graphDigest = computeGraphDigest(fixture);
  return fixture;
}

export function serializeAuthorityFixture(fixture) {
  return canonicalJsonBytes(fixture);
}

export function applyAuthorityFault(input, faultId) {
  if (!AUTHORITY_FAULT_IDS.includes(faultId)) throw new Error(`unknown_authority_fault:${faultId}`);
  if (faultId === "authority.alternate-self-consistent-graph.v0.1") {
    return faultResult(faultId, buildAuthorityFixture({ seed: `${input.seed}:alternate` }), [
      "authorityId", "documents", "graphDigest", "members", "physicalFiles", "seed",
    ]);
  }
  const fixture = cloneJson(input);
  const receiptIndexMember = fixture.members.find((member) => member.role === "receiptIndex");
  switch (faultId) {
    case "authority.missing.v0.1":
      delete fixture.physicalFiles[receiptIndexMember.relativePath];
      return finishFault(faultId, fixture, ["physicalFiles"]);
    case "authority.extra.v0.1":
      fixture.physicalFiles["authority/unregistered-extra.json"] = canonicalJson({ synthetic: true });
      fixture.physicalFiles = sortObject(fixture.physicalFiles);
      return finishFault(faultId, fixture, ["physicalFiles"]);
    case "authority.duplicate-physical-mapping.v0.1": {
      const ledgerIdentity = fixture.members.find((member) => member.role === "ledger").physicalIdentity;
      receiptIndexMember.physicalIdentity = ledgerIdentity;
      return finishFault(faultId, fixture, ["members"]);
    }
    case "authority.orphan.v0.1": {
      const orphanDocument = { schema: "m2.v2.pr7.s0.synthetic-orphan.v0.1", synthetic: true };
      const orphan = memberFor("orphan", orphanDocument, fixture.authorityId, "authority/orphan.json");
      fixture.members.push(orphan);
      fixture.members.sort((left, right) => compareText(left.relativePath, right.relativePath));
      fixture.physicalFiles[orphan.relativePath] = canonicalJson(orphanDocument);
      fixture.physicalFiles = sortObject(fixture.physicalFiles);
      return finishFault(faultId, fixture, ["members", "physicalFiles"]);
    }
    case "authority.receipt-swap.v0.1": {
      const entries = fixture.documents.receiptIndex.entries;
      [entries[0].receiptId, entries[1].receiptId] = [entries[1].receiptId, entries[0].receiptId];
      rematerializeRole(fixture, "receiptIndex");
      return finishFault(faultId, fixture, ["documents.receiptIndex", "members", "physicalFiles"]);
    }
    case "authority.digest-mismatch.v0.1":
      receiptIndexMember.contentSha256 = "0".repeat(64);
      return finishFault(faultId, fixture, ["members"]);
    case "authority.counter-drift.v0.1":
      fixture.documents.counterProjection.counters.completed += 1;
      rematerializeRole(fixture, "counterProjection");
      return finishFault(faultId, fixture, ["documents.counterProjection", "members", "physicalFiles"]);
    case "authority.non-effective-row-omission.v0.1":
      fixture.documents.derivedInputs.rows = fixture.documents.derivedInputs.rows.filter((row) => row.effective);
      rematerializeRole(fixture, "derivedInputs");
      return finishFault(faultId, fixture, ["documents.derivedInputs", "members", "physicalFiles"]);
    case "authority.mirror-mutation.v0.1":
      fixture.documents.publicMirrors.aggregate.effectiveReceiptCount += 1;
      rematerializeRole(fixture, "publicMirrors");
      return finishFault(faultId, fixture, ["documents.publicMirrors", "members", "physicalFiles"]);
    case "authority.nfc-case-alias.v0.1": {
      const canonical = fixture.members.find((member) => member.role === "publicMirrors");
      const aliasPath = "authority/PUBLIC-MIRROR-e\u0301.json";
      fixture.physicalFiles[aliasPath] = fixture.physicalFiles[canonical.relativePath];
      fixture.physicalFiles = sortObject(fixture.physicalFiles);
      return finishFault(faultId, fixture, ["physicalFiles"]);
    }
    default:
      throw new Error(`unhandled_authority_fault:${faultId}`);
  }
}

export function buildSafeCacheFixtureCases() {
  const minimal = {
    schema: "m2.v2.pr7.s0.safe-cache-projection.v0.1",
    entries: [{ logicalKey: "synthetic-minimal", phase: "V2-B.6", projection: { kind: "capability_ok", status: "OK" } }],
  };
  const phaseOwned = {
    schema: minimal.schema,
    entries: [
      { logicalKey: "synthetic-b4", phase: "V2-B.4", projection: { kind: "search_refs", refs: ["synthetic-ref"] } },
      { logicalKey: "synthetic-b6", phase: "V2-B.6", projection: { kind: "capability_ok", status: "OK" } },
      { logicalKey: "synthetic-b8", phase: "V2-B.8", projection: { kind: "evidence_summary", evidenceCount: 1 } },
    ],
  };
  const prototypeProjection = JSON.parse('{"kind":"capability_ok","__proto__":{"synthetic":true}}');
  const cases = [
    safeCacheCase("safe-cache.valid-minimal.v0.1", true, "VALID_MINIMAL", minimal),
    safeCacheCase("safe-cache.phase-owned-projections.v0.1", true, "VALID_PHASE_OWNED", phaseOwned),
    safeCacheCase("safe-cache.unknown-key.v0.1", false, "UNKNOWN_TOP_LEVEL_KEY", { ...minimal, unexpected: true }, faultFromMinimal(["unexpected"])),
    safeCacheCase("safe-cache.unknown-nested-key.v0.1", false, "UNKNOWN_NESTED_KEY", mutateMinimal(minimal, (projection) => ({ ...projection, unexpected: true })), faultFromMinimal(["entries"])),
    safeCacheCase("safe-cache.deep-structure.v0.1", false, "MAX_DEPTH_EXCEEDED", mutateMinimal(minimal, () => nestedObject(65)), faultFromMinimal(["entries"])),
    safeCacheCase("safe-cache.oversized-string.v0.1", false, "MAX_STRING_BYTES_EXCEEDED", mutateMinimal(minimal, () => ({ kind: "capability_ok", status: "x".repeat(8193) })), faultFromMinimal(["entries"])),
    safeCacheCase("safe-cache.oversized-total-bytes.v0.1", false, "MAX_TOTAL_BYTES_EXCEEDED", {
      ...minimal,
      entries: Array.from({ length: 192 }, (_, index) => ({
        logicalKey: `synthetic-total-${String(index).padStart(3, "0")}`,
        phase: "V2-B.6",
        projection: { kind: "capability_ok", status: "x".repeat(96) },
      })),
    }, faultFromMinimal(["entries"])),
    safeCacheCase("safe-cache.too-many-items.v0.1", false, "MAX_ITEMS_EXCEEDED", {
      ...minimal,
      entries: Array.from({ length: 257 }, (_, index) => ({
        logicalKey: `synthetic-item-${String(index).padStart(3, "0")}`,
        phase: "V2-B.6",
        projection: { kind: "capability_ok", status: "OK" },
      })),
    }, faultFromMinimal(["entries"])),
    safeCacheCase("safe-cache.prototype-key.v0.1", false, "PROTOTYPE_KEY_FORBIDDEN", mutateMinimal(minimal, () => prototypeProjection), faultFromMinimal(["entries"])),
    safeCacheCase("safe-cache.secret-shaped-field.v0.1", false, "SECRET_SHAPED_FIELD_FORBIDDEN", mutateMinimal(minimal, () => ({
      apiKey: "<synthetic-redacted-token>", kind: "capability_ok", status: "OK",
    })), faultFromMinimal(["entries"])),
    safeCacheCase("safe-cache.raw-provider-bytes.v0.1", false, "RAW_PROVIDER_BYTES_FORBIDDEN", mutateMinimal(minimal, () => ({
      kind: "capability_ok", rawProviderBytes: "00010203-synthetic", status: "OK",
    })), faultFromMinimal(["entries"])),
  ];
  return cases.sort((left, right) => compareText(left.caseId, right.caseId));
}

export function buildProofScopeFixtureCases(authorityFixture = buildAuthorityFixture()) {
  const base = cloneJson(authorityFixture.documents.proofScope);
  const cases = [
    proofCase("proof-scope.self-output-exclusion.v0.1", true, "SELF_OUTPUT_EXCLUDED", base, []),
    proofCase("proof-scope.missing-member.v0.1", false, "MISSING_SCOPE_MEMBER", mutateProof(base, (scope) => {
      scope.members.shift();
      scope.expectedAuthorityDerivedPathSet.shift();
    }), ["expectedAuthorityDerivedPathSet", "members"]),
    proofCase("proof-scope.extra-member.v0.1", false, "EXTRA_SCOPE_MEMBER", mutateProof(base, (scope) => {
      scope.members.push(syntheticScopeMember("authority/extra-scope-member.json"));
      scope.members.sort(compareScopeMembers);
      scope.expectedAuthorityDerivedPathSet.push("authority/extra-scope-member.json");
      scope.expectedAuthorityDerivedPathSet.sort();
    }), ["expectedAuthorityDerivedPathSet", "members"]),
    proofCase("proof-scope.rename.v0.1", false, "SCOPE_MEMBER_RENAMED", mutateProof(base, (scope) => {
      scope.members[0].relativePath = "authority/renamed-member.json";
      scope.expectedAuthorityDerivedPathSet[0] = "authority/renamed-member.json";
      scope.expectedAuthorityDerivedPathSet.sort();
      scope.members.sort(compareScopeMembers);
    }), ["expectedAuthorityDerivedPathSet", "members"]),
    proofCase("proof-scope.content-mutation.v0.1", false, "SCOPE_CONTENT_MUTATED", mutateProof(base, (scope) => {
      scope.members[0].contentSha256 = "f".repeat(64);
    }), ["members"]),
    proofCase("proof-scope.metadata-mutation.v0.1", false, "SCOPE_METADATA_MUTATED", mutateProof(base, (scope) => {
      scope.members[0].metadata.mode = "0644";
    }), ["members"]),
    proofCase("proof-scope.identity-link-mutation.v0.1", false, "SCOPE_IDENTITY_LINK_MUTATED", mutateProof(base, (scope) => {
      scope.members[0].linkType = "junction";
      scope.members[0].physicalIdentity = "synthetic-identity-mutated";
    }), ["members"]),
  ];
  return cases.sort((left, right) => compareText(left.caseId, right.caseId));
}

function event(sequence, logicalKey, eventType, seed, receiptDigest = null) {
  return {
    eventDigest: null,
    eventType,
    logicalKey,
    physicalKey: `physical-${sha256(`${seed}:${logicalKey}`).slice(0, 12)}`,
    previousEventDigest: null,
    receiptDigest,
    sequence,
    timestamp: new Date(Date.parse(FIXED_TIME) + sequence * 1000).toISOString(),
  };
}

function undefinedValueMarker() {
  return null;
}

function receiptEnvelope(receiptId, logicalKey, dispatched, seed) {
  const payload = {
    dispatched,
    logicalKey,
    physicalKey: `physical-${sha256(`${seed}:${logicalKey}`).slice(0, 12)}`,
    provider: "synthetic-provider",
    status: dispatched ? "completed" : "cache_hit",
  };
  return {
    logicalKey,
    physicalKey: payload.physicalKey,
    receiptDigest: sha256(canonicalJson(payload)),
    receiptId,
    receiptPayload: payload,
  };
}

function memberFor(role, document, authorityId, explicitPath = null) {
  const relativePath = normalizeFixturePath(explicitPath ?? ROLE_PATHS[role]);
  const bytes = canonicalJsonBytes(document);
  return {
    byteLength: bytes.byteLength,
    contentSha256: sha256(bytes),
    linkType: "regular",
    metadata: { mode: "0444", mtime: FIXED_TIME },
    physicalIdentity: `${authorityId}:${sha256(relativePath.toLowerCase().normalize("NFC")).slice(0, 16)}`,
    relativePath,
    role,
  };
}

function bindingForMember(member) {
  return {
    contentSha256: member.contentSha256,
    relativePath: member.relativePath,
    role: member.role,
  };
}

function computeGraphDigest(fixture) {
  return sha256(canonicalJson({
    authorityId: fixture.authorityId,
    members: fixture.members.map((member) => ({
      byteLength: member.byteLength,
      contentSha256: member.contentSha256,
      physicalIdentity: member.physicalIdentity,
      relativePath: member.relativePath,
      role: member.role,
    })),
  }));
}

function rematerializeRole(fixture, role) {
  const index = fixture.members.findIndex((member) => member.role === role);
  if (index < 0) throw new Error(`fixture_role_missing:${role}`);
  const nextMember = memberFor(role, fixture.documents[role], fixture.authorityId);
  fixture.members[index] = nextMember;
  fixture.members.sort((left, right) => compareText(left.relativePath, right.relativePath));
  fixture.physicalFiles[nextMember.relativePath] = canonicalJson(fixture.documents[role]);
  fixture.physicalFiles = sortObject(fixture.physicalFiles);
}

function finishFault(faultId, fixture, expectedChangedPrefixes) {
  fixture.graphDigest = computeGraphDigest(fixture);
  return faultResult(faultId, fixture, ["graphDigest", ...expectedChangedPrefixes]);
}

function faultResult(faultId, fixture, expectedChangedPrefixes) {
  return {
    schema: "m2.v2.pr7.s0-authority-fault.v0.1",
    faultId,
    expectedChangedPrefixes: [...new Set(expectedChangedPrefixes)].sort(),
    fixture,
  };
}

function safeCacheCase(caseId, expectedValid, reasonCode, cache, transform = { baseCaseId: null, expectedChangedPrefixes: [] }) {
  return {
    caseId,
    expectedValid,
    reasonCode,
    baseCaseId: transform.baseCaseId,
    expectedChangedPrefixes: transform.expectedChangedPrefixes,
    cache,
    caseDigest: sha256(canonicalJson({
      caseId,
      expectedValid,
      reasonCode,
      baseCaseId: transform.baseCaseId,
      expectedChangedPrefixes: transform.expectedChangedPrefixes,
      cache,
    })),
  };
}

function faultFromMinimal(expectedChangedPrefixes) {
  return { baseCaseId: "safe-cache.valid-minimal.v0.1", expectedChangedPrefixes };
}

function mutateMinimal(input, projectionBuilder) {
  const clone = cloneJson(input);
  clone.entries[0].projection = projectionBuilder(clone.entries[0].projection);
  return clone;
}

function nestedObject(depth) {
  let value = { leaf: "synthetic" };
  for (let index = 0; index < depth; index += 1) value = { nested: value };
  return value;
}

function proofCase(caseId, expectedValid, reasonCode, proofScope, expectedChangedPrefixes) {
  return {
    caseId,
    expectedValid,
    reasonCode,
    expectedChangedPrefixes,
    proofScope,
    caseDigest: sha256(canonicalJson({ caseId, expectedValid, reasonCode, expectedChangedPrefixes, proofScope })),
  };
}

function mutateProof(input, mutate) {
  const clone = cloneJson(input);
  mutate(clone);
  return clone;
}

function syntheticScopeMember(relativePath) {
  return {
    byteLength: 3,
    contentSha256: sha256("{}\n"),
    linkType: "regular",
    metadata: { mode: "0444", mtime: FIXED_TIME },
    physicalIdentity: `synthetic-extra:${sha256(relativePath).slice(0, 16)}`,
    relativePath,
    role: "extra",
  };
}

function compareScopeMembers(left, right) {
  return compareText(left.relativePath, right.relativePath);
}

function cloneJson(value) {
  return JSON.parse(canonicalJson(value));
}

function sortObject(value) {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => compareText(left, right)));
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
