import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  AUTHORITY_FAULT_IDS,
  PROOF_SCOPE_CASE_IDS,
  SAFE_CACHE_CASE_IDS,
  applyAuthorityFault,
  buildAuthorityFixture,
  buildProofScopeFixtureCases,
  buildSafeCacheFixtureCases,
  canonicalJson,
  normalizeFixturePath,
  serializeAuthorityFixture,
  sha256,
} from "./helpers/m2V2Pr7S0DeterministicFixtures.js";

const REQUIRED_ROLES = [
  "ledger",
  "receiptEnvelopes",
  "receiptIndex",
  "safeCache",
  "effectiveIndex",
  "counterProjection",
  "derivedInputs",
  "publicMirrors",
  "currentPointer",
  "proofScope",
];

test("S0-04 authority graph is byte-, digest-, and order-deterministic", () => {
  const first = buildAuthorityFixture();
  const second = buildAuthorityFixture();
  const firstBytes = serializeAuthorityFixture(first);
  const secondBytes = serializeAuthorityFixture(second);

  assert.equal(firstBytes.equals(secondBytes), true);
  assert.equal(sha256(firstBytes), sha256(secondBytes));
  assert.deepEqual(first.roleOrder, REQUIRED_ROLES);
  assert.deepEqual(Object.keys(first.documents), REQUIRED_ROLES);
  assert.deepEqual(first.members.map((member) => member.relativePath), [...first.members.map((member) => member.relativePath)].sort());
  assert.deepEqual(Object.keys(first.physicalFiles), [...Object.keys(first.physicalFiles)].sort());
  assert.equal(first.graphDigest, second.graphDigest);
});

test("S0-04 canonical graph binds receipts, effective rows, counters, mirror, pointer, and proof scope", () => {
  const fixture = buildAuthorityFixture();
  const receipts = new Map(fixture.documents.receiptEnvelopes.entries.map((entry) => [entry.receiptId, entry]));
  const indexedDigests = new Set();
  for (const row of fixture.documents.receiptIndex.entries) {
    assert.equal(receipts.has(row.receiptId), true);
    assert.equal(row.receiptDigest, receipts.get(row.receiptId).receiptDigest);
    indexedDigests.add(row.receiptDigest);
  }
  for (const row of fixture.documents.effectiveIndex.entries) assert.equal(indexedDigests.has(row.receiptDigest), true);
  assert.deepEqual(fixture.documents.counterProjection.counters, {
    cacheHit: 1,
    completed: 1,
    dispatched: 1,
    planned: 2,
    reserved: 1,
  });
  assert.equal(fixture.documents.derivedInputs.rows.some((row) => row.effective === false), true);
  assert.equal(fixture.documents.publicMirrors.aggregate.providerRequestDelta, 0);
  assert.equal(fixture.documents.currentPointer.currentDecision, "CANARY_FAIL");
  assert.equal(fixture.documents.currentPointer.full160Authorized, false);

  const proof = fixture.documents.proofScope;
  const expectedScopedPaths = fixture.members
    .filter((member) => member.role !== "proofScope")
    .map((member) => member.relativePath)
    .sort();
  assert.deepEqual(proof.expectedAuthorityDerivedPathSet, expectedScopedPaths);
  assert.deepEqual(proof.members.map((member) => member.relativePath), expectedScopedPaths);
  assert.equal(proof.expectedAuthorityDerivedPathSet.includes(fixture.proofOutputPath), false);
  assert.deepEqual(proof.selfOutputExclusions, [fixture.proofOutputPath]);

  assert.deepEqual(Object.keys(fixture.physicalFiles), fixture.members.map((member) => member.relativePath).sort());
  for (const member of fixture.members) {
    const bytes = Buffer.from(`${fixture.physicalFiles[member.relativePath]}\n`, "utf8");
    assert.equal(member.byteLength, bytes.byteLength);
    assert.equal(member.contentSha256, sha256(bytes));
  }
});

test("S0-04 authority faults have stable IDs, deterministic bytes, and bounded transforms", () => {
  const canonical = buildAuthorityFixture();
  assert.equal(new Set(AUTHORITY_FAULT_IDS).size, AUTHORITY_FAULT_IDS.length);
  for (const faultId of AUTHORITY_FAULT_IDS) {
    const first = applyAuthorityFault(canonical, faultId);
    const second = applyAuthorityFault(canonical, faultId);
    assert.equal(first.faultId, faultId);
    assert.equal(canonicalJson(first), canonicalJson(second), faultId);
    const changes = deepDiffPaths(canonical, first.fixture);
    assert.notEqual(changes.length, 0, faultId);
    for (const change of changes) {
      assert.equal(
        first.expectedChangedPrefixes.some((prefix) => change === prefix || change.startsWith(`${prefix}.`) || change.startsWith(`${prefix}[`)),
        true,
        `${faultId}:unexpected_change:${change}`,
      );
    }
  }
  assert.deepEqual(buildAuthorityFixture(), canonical, "fault builders must not mutate the canonical graph");
});

test("S0-04 safe-cache fixture covers closed-schema, resource, prototype, secret, and raw-byte faults", () => {
  const cases = buildSafeCacheFixtureCases();
  assert.deepEqual(cases.map((entry) => entry.caseId).sort(), [...SAFE_CACHE_CASE_IDS].sort());
  assert.equal(cases.filter((entry) => entry.expectedValid).length, 2);
  assert.equal(cases.filter((entry) => !entry.expectedValid).length, 9);
  for (const entry of cases) {
    const { caseDigest, ...payload } = entry;
    assert.equal(caseDigest, sha256(canonicalJson(payload)), entry.caseId);
  }
  const minimal = cases.find((entry) => entry.caseId === "safe-cache.valid-minimal.v0.1");
  for (const entry of cases.filter((candidate) => candidate.baseCaseId === minimal.caseId)) {
    const changes = deepDiffPaths(minimal.cache, entry.cache);
    assert.notEqual(changes.length, 0, entry.caseId);
    for (const change of changes) {
      assert.equal(
        entry.expectedChangedPrefixes.some((prefix) => change === prefix || change.startsWith(`${prefix}.`) || change.startsWith(`${prefix}[`)),
        true,
        `${entry.caseId}:unexpected_change:${change}`,
      );
    }
  }
  const prototypeCase = cases.find((entry) => entry.caseId === "safe-cache.prototype-key.v0.1");
  assert.equal(Object.hasOwn(prototypeCase.cache.entries[0].projection, "__proto__"), true);
  const phaseCase = cases.find((entry) => entry.caseId === "safe-cache.phase-owned-projections.v0.1");
  assert.deepEqual(phaseCase.cache.entries.map((entry) => entry.phase), ["V2-B.4", "V2-B.6", "V2-B.8"]);
});

test("S0-04 proof-scope foundation covers self-exclusion and all six fault transforms", () => {
  const authority = buildAuthorityFixture();
  const base = authority.documents.proofScope;
  const cases = buildProofScopeFixtureCases(authority);
  assert.deepEqual(cases.map((entry) => entry.caseId).sort(), [...PROOF_SCOPE_CASE_IDS].sort());
  assert.equal(cases.filter((entry) => entry.expectedValid).length, 1);
  assert.equal(cases.filter((entry) => !entry.expectedValid).length, 6);

  for (const entry of cases) {
    const { caseDigest, ...payload } = entry;
    assert.equal(caseDigest, sha256(canonicalJson(payload)), entry.caseId);
    const changes = deepDiffPaths(base, entry.proofScope);
    for (const change of changes) {
      assert.equal(
        entry.expectedChangedPrefixes.some((prefix) => change === prefix || change.startsWith(`${prefix}.`) || change.startsWith(`${prefix}[`)),
        true,
        `${entry.caseId}:unexpected_change:${change}`,
      );
    }
  }
  const selfExclusion = cases.find((entry) => entry.caseId === "proof-scope.self-output-exclusion.v0.1");
  assert.deepEqual(selfExclusion.proofScope.selfOutputExclusions, [authority.proofOutputPath]);
  assert.equal(selfExclusion.proofScope.expectedAuthorityDerivedPathSet.includes(authority.proofOutputPath), false);
});

test("S0-04 normalization is platform-neutral and fixtures contain no private payload or external side effect", () => {
  assert.equal(normalizeFixturePath("authority\\子目录\\e\u0301.json"), "authority/子目录/é.json");
  assert.equal(normalizeFixturePath("authority/子目录/é.json"), "authority/子目录/é.json");
  assert.throws(() => normalizeFixturePath("../outside.json"), /unsafe_fixture_path/u);
  assert.throws(() => normalizeFixturePath("C:\\outside.json"), /absolute_fixture_path_forbidden/u);

  let fetchCalls = 0;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("synthetic_external_fetch_forbidden");
  };
  let fixture;
  try {
    fixture = buildAuthorityFixture();
    buildSafeCacheFixtureCases();
    buildProofScopeFixtureCases(fixture);
  } finally {
    globalThis.fetch = previousFetch;
  }
  assert.equal(fetchCalls, 0);
  assert.deepEqual(fixture.externalSafety, {
    actualExternalFetchCount: 0,
    databaseConnections: 0,
    providerRequestDelta: 0,
  });
  const serialized = serializeAuthorityFixture(fixture).toString("utf8");
  assert.doesNotMatch(serialized, /data[\\/]private-(?:input|output)/iu);
  assert.doesNotMatch(serialized, /(?:OPENAI_API_KEY|TAVILY_API_KEY|DATABASE_URL|PGPASSWORD)/u);
  assert.doesNotMatch(serialized, /\bsk-[A-Za-z0-9_-]{8,}\b/u);
  const helperSource = readFileSync(new URL("./helpers/m2V2Pr7S0DeterministicFixtures.js", import.meta.url), "utf8");
  assert.doesNotMatch(helperSource, /from\s+["'](?:pg|node:(?:net|http|https|tls|dgram))["']/u);
  assert.doesNotMatch(helperSource, /\bfetch\s*\(/u);
});

function deepDiffPaths(left, right, prefix = "") {
  if (Object.is(left, right)) return [];
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return [prefix];
    const changes = [];
    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
      changes.push(...deepDiffPaths(left[index], right[index], `${prefix}[${index}]`));
    }
    return changes;
  }
  if (left && right && typeof left === "object" && typeof right === "object") {
    const changes = [];
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    for (const key of [...keys].sort()) {
      changes.push(...deepDiffPaths(left[key], right[key], prefix ? `${prefix}.${key}` : key));
    }
    return changes;
  }
  return [prefix];
}
