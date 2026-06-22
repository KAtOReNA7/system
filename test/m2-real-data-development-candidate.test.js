import assert from "node:assert/strict";
import test from "node:test";
import {
  M2_REALDATA_DEV_BOUNDARY,
  M2_REALDATA_DEV_CANDIDATE_VERSION,
  assertAggregateOnlyPayload,
  ratingForAmount,
  summarizeCandidateDelta
} from "../src/domain/oldProductEvaluation/realDataDevelopmentCandidate.js";

test("real-data dev candidate keeps local-only and non-release boundary explicit", () => {
  assert.equal(M2_REALDATA_DEV_CANDIDATE_VERSION, "m2-realdata-dev-candidate-b-v0.1");
  assert.equal(M2_REALDATA_DEV_BOUNDARY.localRealDataReadAllowed, true);
  assert.equal(M2_REALDATA_DEV_BOUNDARY.localMigrationAllowed, true);
  assert.equal(M2_REALDATA_DEV_BOUNDARY.rawDetailMayEnterGit, false);
  assert.equal(M2_REALDATA_DEV_BOUNDARY.notFinalReleaseApproved, true);
});

test("ratingForAmount applies real-data calibrated threshold shape", () => {
  const thresholds = {
    "S+": 133000,
    S: 16000,
    A: 2700,
    B: 310,
    C: 10,
    D: 1.8,
    E: 0
  };

  assert.equal(ratingForAmount(200000, thresholds), "S+");
  assert.equal(ratingForAmount(17000, thresholds), "S");
  assert.equal(ratingForAmount(3000, thresholds), "A");
  assert.equal(ratingForAmount(0.5, thresholds), "E");
});

test("candidate delta summarizes aggregate review-load changes", () => {
  const delta = summarizeCandidateDelta(
    { manualReviewRequiredCount: 513, advisoryOnlyCount: 2331, promoteCount: 442 },
    { manualReviewRequiredCount: 85, advisoryOnlyCount: 2759, promoteCount: 557 }
  );

  assert.equal(delta.manualReviewReduction, 428);
  assert.equal(delta.advisoryIncrease, 428);
  assert.equal(delta.promoteIncrease, 115);
  assert.equal(delta.notFinalReleaseApproved, true);
});

test("aggregate-only payload guard catches raw or sensitive detail keys", () => {
  assert.deepEqual(assertAggregateOnlyPayload({ totals: { count: 10 } }).detectedForbiddenKeys, []);
  assert.equal(assertAggregateOnlyPayload({ rawBillRows: [] }).aggregateOnly, false);
  assert.equal(assertAggregateOnlyPayload({ nested: { channelName: "hidden" } }).aggregateOnly, false);
});
