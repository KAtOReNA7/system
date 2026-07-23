import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  buildAuthorityDerivedInputBindings,
  buildAuthorityPhysicalMapping,
  buildAuthoritySelectionDecision,
  buildTrackedCoreCommitmentV0_1,
  deriveCanonicalAuthorityGraphV0_3,
} from "../src/domain/m2V2EvidencePilot/authorityGraph.js";
import {
  CURRENT_CLOSED_REQUEST_STATE_BINDING_RELATIVE,
  LEGACY_CURRENT_RESTATEMENT_RELATIVE,
  LEGACY_CURRENT_STATE_INDEX_RELATIVE,
  readCurrentAuthority,
  validateCurrentAuthorityDocuments,
} from "../src/domain/m2V2EvidencePilot/currentAuthority.js";
import { sha256 } from "../src/domain/m2V2EvidencePilot/pilotCore.js";
import {
  AUTHORITY_SOURCE_HEAD,
  buildAuthorityGraphFixture,
} from "./helpers/m2V2Pr7B1AuthorityFixture.js";

const roots = [];
test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function makeAuthority(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), "m2-v2-authority-"));
  roots.push(root);
  const indexRelativePath = "authority/current-index.json";
  const restatementRelativePath = "authority/current-restatement.json";
  mkdirSync(join(root, "authority"), { recursive: true });
  const restatement = {
    schema: "m2.v2.canary-v3.1-integrity-restatement-public.v0.3",
    providerRequestDelta: 0,
    historicalContract: { decision: "CANARY_CONDITIONAL" },
    restatedContract: { decision: "CANARY_FAIL", full160Authorized: false },
    nextDevelopmentReadiness: "NOT_AUTHORIZED",
    ...(overrides.restatement ?? {}),
  };
  writeJson(join(root, restatementRelativePath), restatement);
  const index = {
    schemaVersion: "m2-v2-current-state-index-v0.2",
    status: "current",
    historicalV2B8Decision: "CANARY_CONDITIONAL",
    currentDecision: "CANARY_FAIL",
    full160Authorized: false,
    nextDevelopmentReadiness: "NOT_AUTHORIZED",
    currentAuthority: {
      currentRestatementArtifact: restatementRelativePath,
      currentRestatementDigest: digestFile(join(root, restatementRelativePath)),
    },
    entries: [
      { artifact: "historical B8", version: "v0.1", lifecycle: "historical", decision: "CANARY_CONDITIONAL" },
      { artifact: "remediation text", version: "v0.1", lifecycle: "current", decision: "PASS_WITH_REMEDIATION" },
    ],
    ...(overrides.index ?? {}),
  };
  writeJson(join(root, indexRelativePath), index);
  return { root, index, restatement, indexRelativePath, restatementRelativePath };
}

test("current authority uses only explicit digest-bound current fields", () => {
  const fixture = makeAuthority();
  const beforeIndex = digestFile(join(fixture.root, fixture.indexRelativePath));
  const beforeRestatement = digestFile(join(fixture.root, fixture.restatementRelativePath));
  const result = readCurrentAuthority(fixture.root, fixture);

  assert.equal(result.valid, true, result.issues.join(","));
  assert.equal(result.historicalDecision, "CANARY_CONDITIONAL");
  assert.equal(result.currentRestatedDecision, "CANARY_FAIL");
  assert.equal(result.authorityMap.historicalArtifacts.length, 1);
  assert.equal(result.full160Authorized, false);
  assert.equal(result.nextDevelopmentReadiness, "NOT_AUTHORIZED");
  assert.equal(digestFile(join(fixture.root, fixture.indexRelativePath)), beforeIndex);
  assert.equal(digestFile(join(fixture.root, fixture.restatementRelativePath)), beforeRestatement);
});

test("historical conditional and remediation pass text cannot satisfy current authority", () => {
  const fixture = makeAuthority({ index: { currentDecision: "CANARY_CONDITIONAL" } });
  const result = readCurrentAuthority(fixture.root, fixture);
  assert.equal(result.valid, false);
  assert.ok(result.issues.includes("current_restated_decision_mismatch"));
  assert.equal(result.currentRestatedDecision, null);
  assert.equal(result.full160Authorized, false);
});

test("current authority fails closed when the restatement is missing or its digest drifts", () => {
  const missing = makeAuthority();
  rmSync(join(missing.root, missing.restatementRelativePath));
  const missingResult = readCurrentAuthority(missing.root, missing);
  assert.equal(missingResult.valid, false);
  assert.ok(missingResult.issues.includes("current_restatement_missing"));

  const drifted = makeAuthority();
  writeJson(join(drifted.root, drifted.restatementRelativePath), {
    ...drifted.restatement,
    note: "byte drift without index rebinding",
  });
  const driftedResult = readCurrentAuthority(drifted.root, drifted);
  assert.equal(driftedResult.valid, false);
  assert.ok(driftedResult.issues.includes("current_restatement_binding_digest_mismatch"));
});

test("current authority rejects missing binding, authorization and readiness drift", () => {
  const noBinding = makeAuthority({ index: { currentAuthority: null } });
  assert.equal(readCurrentAuthority(noBinding.root, noBinding).valid, false);

  const authorized = makeAuthority({
    index: { full160Authorized: true, nextDevelopmentReadiness: "READY" },
  });
  const result = readCurrentAuthority(authorized.root, authorized);
  assert.equal(result.valid, false);
  assert.ok(result.issues.includes("full160_authorization_not_fail_closed"));
  assert.ok(result.issues.includes("next_development_readiness_not_fail_closed"));
  assert.equal(result.full160Authorized, false);
});

test("v0.3 current authority binds exactly three non-self public reports", () => {
  const root = mkdtempSync(join(tmpdir(), "m2-v2-authority-v03-"));
  roots.push(root);
  const fixture = buildAuthorityGraphFixture({
    deriveGraph: deriveCanonicalAuthorityGraphV0_3,
    buildCommitment: buildTrackedCoreCommitmentV0_1,
    buildPhysicalMapping: buildAuthorityPhysicalMapping,
    buildSelectionDecision: buildAuthoritySelectionDecision,
    buildDerivedInputBindings: buildAuthorityDerivedInputBindings,
  });
  const paths = {
    summary: "docs/analysis/m2-v2/M2-v2-PR7-P1-remediation-summary-v0.2.json",
    readiness: "docs/analysis/m2-v2/M2-v2-PR7-merge-readiness-v0.2.json",
    restatement: "docs/analysis/m2-v2/M2-v2-canary-v3-1-integrity-restatement-v0.4.json",
    index: "docs/analysis/m2-v2/M2-v2-current-state-index-v0.3.json",
    commitment: "docs/analysis/m2-v2/M2-v2-PR7-core-commitment-v0.1.json",
  };
  const summary = { schema: "synthetic-summary-v0.2", currentDecision: "CANARY_FAIL" };
  const readiness = { schema: "synthetic-readiness-v0.2", mergeAuthorized: false };
  writeJson(join(root, paths.summary), summary);
  writeJson(join(root, paths.readiness), readiness);
  writeJson(join(root, paths.commitment), fixture.trackedCoreCommitment);
  const computation = {
    evaluationDigestSha256: sha256("synthetic-current-evaluation"),
    recomputedDecision: "CANARY_FAIL",
  };
  const transactionId = "recovery-synthetic-v03";
  const transactionDigestSha256 = sha256("synthetic-promotion-receipt");
  const restatementPayload = {
    schema: "m2.v2.canary-v3.1-integrity-restatement-public.v0.4",
    sourceExactHead: AUTHORITY_SOURCE_HEAD,
    historicalDecision: "CANARY_CONDITIONAL",
    currentRestatedDecision: "CANARY_FAIL",
    currentDecisionComputation: computation,
    unchangedBoundaries: { providerRequestDelta: 0 },
    authorityBindings: { graphDigestSha256: fixture.graph.graphDigestSha256 },
    supersession: { transactionId, transactionDigestSha256 },
  };
  const restatement = {
    ...restatementPayload,
    restatementDigestSha256: sha256(restatementPayload),
  };
  writeJson(join(root, paths.restatement), restatement);
  const publicReportBindings = [
    reportBinding(root, "remediation_summary", paths.summary, summary),
    reportBinding(root, "merge_readiness", paths.readiness, readiness),
    reportBinding(root, "current_integrity_restatement", paths.restatement, restatement),
  ];
  const indexPayload = {
    schemaVersion: "m2-v2-current-state-index-v0.3",
    status: "current_digest_bound",
    sourceExactHead: AUTHORITY_SOURCE_HEAD,
    historicalV2B8Decision: "CANARY_CONDITIONAL",
    currentDecision: "CANARY_FAIL",
    currentDecisionComputation: computation,
    full160Authorized: false,
    modelTrainingAuthorized: false,
    nextDevelopmentReadiness: "NOT_AUTHORIZED",
    currentAuthority: {
      graphDigestSha256: fixture.graph.graphDigestSha256,
      trackedCoreCommitmentPath: paths.commitment,
      trackedCoreCommitmentDigestSha256: digestFile(join(root, paths.commitment)),
      currentRestatementPath: paths.restatement,
      currentRestatementDigestSha256: digestFile(join(root, paths.restatement)),
      publicReportBindings,
      promotionReceiptDigestSha256: transactionDigestSha256,
    },
    supersession: { transactionId, transactionDigestSha256 },
  };
  const index = { ...indexPayload, indexDigestSha256: sha256(indexPayload) };
  writeJson(join(root, paths.index), index);
  const input = {
    index,
    restatement,
    root,
    indexRelativePath: paths.index,
    indexByteDigest: digestFile(join(root, paths.index)),
    restatementRelativePath: paths.restatement,
    restatementByteDigest: digestFile(join(root, paths.restatement)),
    graph: fixture.graph,
    trackedCoreCommitment: fixture.trackedCoreCommitment,
    trackedCoreCommitmentRelativePath: paths.commitment,
    trackedCoreCommitmentByteDigest: digestFile(join(root, paths.commitment)),
  };
  const result = validateCurrentAuthorityDocuments(input);
  assert.equal(result.valid, true, result.issues.join(","));

  const graphMemberPath = "data/private-output/current-authority-test/contract-bound-public-report-digests-private-v0.3.json";
  writeJson(join(root, graphMemberPath), {
    schema: "m2.v2.v2b8-contract-bound-public-report-digests-private.v0.3",
    canonicalAuthorityGraph: fixture.graph,
  });
  const bindingPayload = {
    schema: "m2.v2.request-state-atomic-binding.v0.2",
    privateOnly: true,
    scope: "v2b8",
    transactionId,
    members: [{
      role: "contract_bound_public_report_digests",
      path: graphMemberPath,
      byteDigest: digestFile(join(root, graphMemberPath)),
    }],
  };
  writeJson(join(root, CURRENT_CLOSED_REQUEST_STATE_BINDING_RELATIVE), {
    ...bindingPayload,
    bindingDigest: sha256(bindingPayload),
  });
  const legacyRestatement = {
    schema: "m2.v2.canary-v3.1-integrity-restatement-public.v0.3",
    providerRequestDelta: 0,
    historicalContract: { decision: "CANARY_CONDITIONAL" },
    restatedContract: { decision: "CANARY_FAIL", full160Authorized: false },
    nextDevelopmentReadiness: "NOT_AUTHORIZED",
  };
  writeJson(join(root, LEGACY_CURRENT_RESTATEMENT_RELATIVE), legacyRestatement);
  writeJson(join(root, LEGACY_CURRENT_STATE_INDEX_RELATIVE), {
    schemaVersion: "m2-v2-current-state-index-v0.2",
    status: "current",
    historicalV2B8Decision: "CANARY_CONDITIONAL",
    currentDecision: "CANARY_FAIL",
    full160Authorized: false,
    nextDevelopmentReadiness: "NOT_AUTHORIZED",
    currentAuthority: {
      currentRestatementArtifact: LEGACY_CURRENT_RESTATEMENT_RELATIVE,
      currentRestatementDigest: digestFile(join(root, LEGACY_CURRENT_RESTATEMENT_RELATIVE)),
    },
    entries: [],
  });
  const defaultResult = readCurrentAuthority(root);
  assert.equal(defaultResult.valid, true, defaultResult.issues.join(","));
  assert.equal(defaultResult.canonicalAuthorityGraphVerified, true);
  assert.equal(defaultResult.authorityMap.currentAuthorityArtifact, paths.index);

  rmSync(join(root, CURRENT_CLOSED_REQUEST_STATE_BINDING_RELATIVE));
  const noFallbackResult = readCurrentAuthority(root);
  assert.equal(noFallbackResult.valid, false);
  assert.ok(noFallbackResult.issues.includes("current_closed_binding_missing"));

  const selfBound = structuredClone(index);
  selfBound.currentAuthority.publicReportBindings.push({
    role: "current_state_index",
    repositoryRelativePath: paths.index,
    pathIdentityDigestSha256: sha256(paths.index),
    semanticDigestSha256: sha256(index),
    byteDigestSha256: digestFile(join(root, paths.index)),
  });
  const selfResult = validateCurrentAuthorityDocuments({ ...input, index: selfBound });
  assert.equal(selfResult.valid, false);
  assert.ok(selfResult.issues.includes("current_public_report_binding_set_invalid"));
});

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function reportBinding(root, role, path, value) {
  return {
    role,
    repositoryRelativePath: path,
    pathIdentityDigestSha256: sha256(path),
    semanticDigestSha256: sha256(value),
    byteDigestSha256: digestFile(join(root, path)),
  };
}

function digestFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
