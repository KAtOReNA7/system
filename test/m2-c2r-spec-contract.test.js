import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const specPath = path.join(
  root,
  "src/domain/oldProductEvaluation/calibrationSpec.c2r.v1.amendment.json",
);

test("C2-R spec freezes route separation, candidate selection, and seals", () => {
  const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
  assert.equal(spec.decisionStatus, "not_for_formal_decision");
  assert.equal(spec.candidateIdentity.id, "C2-R");
  assert.equal(spec.candidateIdentity.backtestAndForwardMustUseSameEntryPoint, true);
  assert.equal(spec.routeClassifier.oneTimeSeriesModelAcrossRoutesAllowed, false);
  assert.equal(spec.salesRoute.zeroMonthsRetained, true);
  assert.equal(spec.salesRoute.positiveOnlyLocationStatisticsAllowed, false);
  assert.equal(spec.salesRoute.candidateEnumeration.expectedCandidateCount, 38);
  assert.equal(spec.pureBuyoutRoute.defaultCycleMonths, 36);
  assert.equal(spec.pureBuyoutRoute.minimumCycleMonths, 12);
  assert.equal(spec.pureBuyoutRoute.futureRenewalAssumed, false);
  assert.equal(spec.mixedRoute.excludesFutureBuyout, true);
  assert.equal(spec.unknownRoute.businessServingEligible, false);
  assert.equal(spec.innerSelection.outerResultsMayChangeSelectionRules, false);
  assert.equal(spec.acceptanceGates.overallWapeMaximumInclusive, 0.6);
  assert.equal(spec.acceptanceGates.thresholdsMayChangeAfterResults, false);
  assert.deepEqual(spec.publicOutput.allowedFields, [
    "pointForecast",
    "annualBreakdown",
    "confidence",
    "limitation",
  ]);
  assert.equal(spec.seals.finalHoldoutOpened, false);
  assert.equal(spec.seals.embargoShadowOpened, false);
  assert.equal(spec.seals.deferred60MonthLabelsOpened, false);
  assert.equal(spec.seals.C2Authorized, false);
  assert.equal(spec.seals.C3Authorized, false);
});
