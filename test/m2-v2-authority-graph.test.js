import assert from "node:assert/strict";
import test from "node:test";

import {
  CANONICAL_AUTHORITY_GRAPH_CORE_FIELDS,
  buildAuthorityPhysicalMapping,
  buildAuthorityDerivedInputBindings,
  buildAuthoritySelectionDecision,
  buildTrackedCoreCommitmentV0_1,
  canonicalAuthorityGraphCoreDigestSha256,
  checkAuthorityGraphExactSets,
  deriveCanonicalAuthorityGraphV0_3,
  verifyCanonicalAuthorityGraph,
  verifyTrackedCoreCommitmentV0_1,
} from "../src/domain/m2V2EvidencePilot/authorityGraph.js";
import {
  buildAlternateGraph,
  buildAuthorityGraphFixture,
  buildFullyReboundReceiptPayloadIdentityBypass,
  duplicatePhysicalGraph,
} from "./helpers/m2V2Pr7B1AuthorityFixture.js";
import {
  assertAcceptedByBoth,
  assertRejectedByBoth,
  casesForFinding,
  cloneJson,
} from "./helpers/m2V2Pr7B1CaseRegistry.js";

const registeredCases = casesForFinding("PR7-P1-003");
const casesById = new Map(registeredCases.map((entry) => [entry.caseId, entry]));
const expectedCaseIds = [
  "PR7-P1-003-mirror-fallback",
  "PR7-P1-003-duplicate-physical",
  "PR7-P1-003-missing-noneffective",
  "PR7-P1-003-swap-receipt",
  "PR7-P1-003-effective-duplicate",
  "PR7-P1-003-counter-drift",
  "PR7-P1-003-derived-omit",
  "PR7-P1-003-alternate-graph",
  "PR7-P1-003-canonical-pass",
];

test("PR7-P1-003 registry exact set is fully exercised with no skip path", () => {
  assert.deepEqual([...casesById.keys()].sort(), [...expectedCaseIds].sort());
  assert.equal(registeredCases.some((entry) => entry.expectedResult === "SKIP"), false);
});

for (const caseId of expectedCaseIds) {
  test(`${caseId} is rejected or accepted by the public verifier and secondary exact-set checker`, () => {
    const registered = casesById.get(caseId);
    assert.ok(registered, `${caseId}:registry_missing`);
    const fixture = buildFixture();
    const input = mutateCase(caseId, fixture);
    const publicResult = verifyCanonicalAuthorityGraph(input, { requireCoreCommitment: true });
    const secondaryResult = checkAuthorityGraphExactSets(input);
    if (registered.expectedResult === "PASS") {
      assertAcceptedByBoth(caseId, publicResult, secondaryResult);
      assert.equal(publicResult.providerRequestDelta ?? 0, 0, `${caseId}:provider_delta`);
      return;
    }
    assertRejectedByBoth(
      caseId,
      registered.expectedErrorOrReason,
      publicResult,
      secondaryResult,
    );
  });
}

test("tracked core commitment uses the exact non-self-referential static projection", () => {
  assert.deepEqual(CANONICAL_AUTHORITY_GRAPH_CORE_FIELDS, [
    "schema",
    "nodes",
    "edges",
    "runtimeConsumers",
    "publicReportRegistry",
    "runtimePopulationRules",
  ]);
  const fixture = buildFixture();
  const mappings = fixture.physicalMappings.map((entry) => ({ ...entry }));
  const index = mappings.findIndex((entry) => entry.nodeId === "tracked_core_commitment");
  const target = mappings[index];
  mappings[index] = buildAuthorityPhysicalMapping({
    nodeId: target.nodeId,
    repositoryRelativePath: target.repositoryRelativePath,
    contentDigestSha256: "e".repeat(64),
    objectType: target.objectType,
  });
  const runtimeDrift = deriveCanonicalAuthorityGraphV0_3({
    physicalMappings: mappings,
    selectionDecisions: fixture.selectionDecisions,
  });
  assert.equal(
    canonicalAuthorityGraphCoreDigestSha256(runtimeDrift),
    canonicalAuthorityGraphCoreDigestSha256(fixture.graph),
  );
  assert.notEqual(runtimeDrift.graphDigestSha256, fixture.graph.graphDigestSha256);
  assert.equal(
    verifyTrackedCoreCommitmentV0_1(fixture.trackedCoreCommitment, runtimeDrift).valid,
    true,
  );
});

test("a self-consistent static alternate graph invalidates the tracked core commitment", () => {
  const fixture = buildFixture();
  const alternate = buildAlternateGraph(fixture);
  assert.notEqual(alternate.graphDigestSha256, fixture.graph.graphDigestSha256);
  const result = verifyTrackedCoreCommitmentV0_1(fixture.trackedCoreCommitment, alternate);
  assert.equal(result.valid, false);
  assert.ok(result.issues.includes("tracked_core_commitment_mismatch"));
});

test("digest-rebound receipt payload identity mismatches fail through both authority entrypoints", () => {
  const fixture = buildFixture();
  const mismatches = [
    ["logicalKey", "logicalExtractionKey", fixture.request.logicalA],
    ["physicalKey", "cacheKey", fixture.request.physicalA1],
    ["requestDigest", "requestPayloadDigest", "d".repeat(64)],
    ["provider", "provider", "different_synthetic_provider"],
    ["stage", "stage", "v2b7"],
  ];
  for (const [identity, field, value] of mismatches) {
    const caseId = `PR7-P1-003-rebound-receipt-payload-${identity}`;
    const input = buildFullyReboundReceiptPayloadIdentityBypass(fixture, {
      field,
      value,
      targetIndex: 2,
      buildDerivedInputBindings: buildAuthorityDerivedInputBindings,
    });
    assertRejectedByBoth(
      caseId,
      "graph_tuple_semantic_mismatch",
      verifyCanonicalAuthorityGraph(input, { requireCoreCommitment: true }),
      checkAuthorityGraphExactSets(input),
    );
  }
});

function buildFixture() {
  return buildAuthorityGraphFixture({
    deriveGraph: deriveCanonicalAuthorityGraphV0_3,
    buildCommitment: buildTrackedCoreCommitmentV0_1,
    buildPhysicalMapping: buildAuthorityPhysicalMapping,
    buildSelectionDecision: buildAuthoritySelectionDecision,
    buildDerivedInputBindings: buildAuthorityDerivedInputBindings,
  });
}

function mutateCase(caseId, fixture) {
  const graph = cloneJson(fixture.graph);
  const evidence = cloneJson(fixture.evidence);
  const trackedCoreCommitment = cloneJson(fixture.trackedCoreCommitment);
  if (caseId === "PR7-P1-003-mirror-fallback") {
    evidence.consumedPhysicalObjectIds.push("f".repeat(64));
  } else if (caseId === "PR7-P1-003-duplicate-physical") {
    return {
      graph: duplicatePhysicalGraph(
        fixture,
        deriveCanonicalAuthorityGraphV0_3,
        buildAuthorityPhysicalMapping,
      ),
      evidence,
      trackedCoreCommitment,
    };
  } else if (caseId === "PR7-P1-003-missing-noneffective") {
    const omitted = fixture.request.physicalA2;
    evidence.receiptIndexEntries = evidence.receiptIndexEntries.filter((entry) => entry.physicalKey !== omitted);
    evidence.safeCacheEntries = evidence.safeCacheEntries.filter((entry) => entry.physicalKey !== omitted);
  } else if (caseId === "PR7-P1-003-swap-receipt") {
    [evidence.receiptIndexEntries[0].receiptDigest, evidence.receiptIndexEntries[1].receiptDigest] = [
      evidence.receiptIndexEntries[1].receiptDigest,
      evidence.receiptIndexEntries[0].receiptDigest,
    ];
  } else if (caseId === "PR7-P1-003-effective-duplicate") {
    evidence.effectiveReceiptIndexEntries.push(cloneJson(evidence.effectiveReceiptIndexEntries[0]));
  } else if (caseId === "PR7-P1-003-counter-drift") {
    evidence.counterProjection.completed += 1;
  } else if (caseId === "PR7-P1-003-derived-omit") {
    evidence.derivedInputBindings = evidence.derivedInputBindings.slice(1);
  } else if (caseId === "PR7-P1-003-alternate-graph") {
    return {
      graph: buildAlternateGraph(fixture),
      evidence,
      trackedCoreCommitment,
    };
  } else if (caseId !== "PR7-P1-003-canonical-pass") {
    throw new Error(`${caseId}:unhandled_test_case`);
  }
  return { graph, evidence, trackedCoreCommitment };
}
