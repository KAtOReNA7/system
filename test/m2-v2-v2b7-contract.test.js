import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  V2B7_CANARY_MANIFEST_DIGEST,
  V2B7_GATE_THRESHOLDS,
  V2B7_MAX_OUTPUT_TOKENS,
  V2B7_MODEL_ID,
  V2B7_OVERLAP_MAPPING_DIGEST,
  V2B7_RELAY_REQUEST_CAP,
  V2B7_REPEAT_DIGEST,
  V2B7_SOURCE_BUNDLE_DIGEST,
  V2B7_TAVILY_REQUEST_CAP,
  V2B7_TIMEOUT_MS,
  assertPublicV2B7Sanitized,
  buildV2B7WorkQueries,
  checkAndFreezeV2B7Contract,
  validateV2B7OutboundQueryPlans,
} from "../src/domain/m2V2EvidencePilot/v2b7Contract.js";

const root = new URL("..", import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/u, (value) => value.slice(1));
const privateManifest = new URL("../data/private-output/m2-v2-evidence-pilot/canary-v0.1/canary-manifest-private-v0.1.json", import.meta.url);

test("V2-B.7 Phase A freezes the fixed manifest, repeat, bundle and overlap", () => {
  const result = contractResult({ now: () => "2026-07-18T00:00:00.000Z" });
  assert.equal(result.invariant.allPassed, true);
  assert.equal(result.invariant.failedSamplesReplaced, false);
  assert.equal(result.publicContract.population.manifestDigest, V2B7_CANARY_MANIFEST_DIGEST);
  assert.equal(result.publicContract.population.repeatDigest, V2B7_REPEAT_DIGEST);
  assert.equal(result.publicContract.frozenSourceBundle.bundleDigest, V2B7_SOURCE_BUNDLE_DIGEST);
  assert.equal(result.publicContract.frozenSourceBundle.overlapMappingDigest, V2B7_OVERLAP_MAPPING_DIGEST);
  assert.equal(result.publicContract.frozenSourceBundle.benchmarkCanaryOverlapCount, 4);
});

test("V2-B.7 contract freezes Terra-only full/server_strict routing and request caps", () => {
  const result = contractResult();
  assert.equal(result.publicContract.routing.defaultModel, V2B7_MODEL_ID);
  assert.equal(result.publicContract.routing.escalationModel, V2B7_MODEL_ID);
  assert.equal(result.publicContract.routing.lunaStatus, "blocked_not_used");
  assert.equal(result.publicContract.routing.extractionMode, "full");
  assert.equal(result.publicContract.routing.structuredMode, "server_strict");
  assert.equal(result.publicContract.routing.timeoutMs, V2B7_TIMEOUT_MS);
  assert.equal(result.publicContract.routing.maxOutputTokens, V2B7_MAX_OUTPUT_TOKENS);
  assert.equal(result.publicContract.routing.reasoningParameterIncluded, false);
  assert.equal(result.publicContract.routing.toolsIncluded, false);
  assert.equal(result.publicContract.requestBudgets.tavilyNewPhysicalRequestCap, V2B7_TAVILY_REQUEST_CAP);
  assert.equal(result.publicContract.requestBudgets.relayNewPhysicalRequestCap, V2B7_RELAY_REQUEST_CAP);
  assert.equal(result.publicContract.full160Authorized, false);
});

test("V2-B.7 query planner emits exactly two safe queries and no private fields", () => {
  for (const sourceType of ["publication", "web_original"]) {
    const plans = buildV2B7WorkQueries({
      title: "Synthetic Work",
      author: "Synthetic Author",
      sourceType,
      canarySlotId: "slot01",
    }, "primary");
    assert.equal(plans.length, 2);
    assert.equal(validateV2B7OutboundQueryPlans(plans).valid, true);
    assert.equal(plans.some((plan) => /standardWorkId|identityDigest|收入|B4|版权|合同/iu.test(plan.queryText)), false);
  }
});

test("V2-B.7 contract freezes all usability thresholds and the safety all-required rule", () => {
  const result = contractResult();
  assert.deepEqual(result.publicContract.gateThresholds, V2B7_GATE_THRESHOLDS);
  assert.equal(result.publicContract.safetyGate.itemCount, 14);
  assert.equal(result.publicContract.safetyGate.allRequired, true);
});

function contractResult(options) {
  if (existsSync(privateManifest)) return checkAndFreezeV2B7Contract(root, options);
  const publicContract = JSON.parse(readFileSync(new URL("../docs/prd/m2-v2/M2-v2-canary-v3-execution-contract-v0.2.json", import.meta.url), "utf8"));
  return {
    publicContract,
    invariant: {
      allPassed: publicContract.population.sampleCount === 10
        && publicContract.population.repeatCount === 5
        && publicContract.frozenSourceBundle.benchmarkCanaryOverlapCount === 4,
      failedSamplesReplaced: publicContract.population.failedSamplesReplaced,
    },
  };
}

test("V2-B.7 public contract is sanitized", () => {
  for (const relative of [
    "docs/prd/m2-v2/M2-v2-canary-v3-execution-contract-v0.2.json",
    "docs/prd/m2-v2/M2-v2-canary-v3-execution-contract-v0.2.md",
  ]) {
    assert.equal(assertPublicV2B7Sanitized(readFileSync(new URL(`../${relative}`, import.meta.url), "utf8")), true);
  }
});
