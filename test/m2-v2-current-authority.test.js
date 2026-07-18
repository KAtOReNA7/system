import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { readCurrentAuthority } from "../src/domain/m2V2EvidencePilot/currentAuthority.js";

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

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function digestFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
