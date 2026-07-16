import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportDir = path.join(root, "docs", "analysis", "m2-real-data");

function read(name) {
  const file = path.join(reportDir, name);
  assert.equal(fs.existsSync(file), true, `${name} must exist`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

test("C2-R.1 development report preserves population, scoring, and seals", () => {
  const report = read("M2-C2R1-development-validation-v1.json");
  assert.ok(["PASS", "FAIL"].includes(report.candidateDecision));
  assert.equal(report.decisionStatus, "not_for_formal_decision");
  assert.equal(report.formalDecisionAuthorized, false);
  assert.equal(report.releaseAuthorized, false);
  assert.equal(report.technicalSummary.C2R1Executed, true);
  assert.equal(report.technicalSummary.primaryComparator, "B4");
  assert.equal(report.technicalSummary.modelPopulationCaseCount, 7851);
  assert.equal(report.technicalSummary.modelPopulationUnchanged, true);
  assert.equal(report.technicalSummary.pureBuyoutNullScoredAsZero, false);
  assert.equal(report.technicalSummary.thresholdMoved, false);
  assert.equal(report.predictionIntegrity.predictionLockedBeforeTruthJoin, true);
  assert.equal(report.predictionIntegrity.postTruthProjectionMatchesLock, true);
  assert.equal(report.predictionIntegrity.fullCaseKeyCount, 18615);
  assert.equal(report.predictionIntegrity.modelPopulationKeyCount, 7851);
  assert.equal(report.predictionIntegrity.modelPopulationMatchesPrimaryComparator, true);
  assert.match(report.predictionIntegrity.predictionProjectionDigest, /^[0-9a-f]{64}$/);
  assert.equal(report.metrics.modelPopulation.caseCount, 7851);
  assert.equal(report.metrics.caseState.frozenCaseCount, 18615);
  assert.equal(report.metrics.caseState.statisticallyScoreableCaseCount, 12223);
  assert.equal(report.metrics.modelPopulation.zeroImputationUsed, false);
  assert.equal(report.metrics.internal80.completeOnModelPopulation, true);
  assert.equal(report.metrics.internal80.availableCaseCount, 7851);
  assert.equal(report.acceptance.conditionCount, 23);
  assert.equal(report.acceptance.passedConditionCount, 13);
  assert.equal(report.acceptance.originWinShare, 0.4);
  assert.equal(
    report.acceptance.conditions.atLeast70PercentOriginsBeatPrimary,
    false,
  );
  assert.equal(report.acceptance.thresholdMoved, false);
  assert.equal(report.P0Count, 0);
  assert.equal(report.P1Count, 0);
  assert.equal(report.P2Boundary, "fact_audit_only");
  assert.equal(report.automaticOperationalActionCount, 0);
  assert.equal(Object.values(report.seals).every((value) => value === false), true);
  assert.equal(report.selectionByOriginAndRoute.length, 10);
  assert.equal(
    report.selectionByOriginAndRoute.every((row) => row.thresholdMoved === false),
    true,
  );
});

test("C2-R.1 routes abstain rather than fabricate buyout or unknown cash", () => {
  const report = read("M2-C2R1-route-specific-metrics-v1.json");
  assert.equal(report.pureBuyoutAbstention.commitmentCaseCount, 0);
  assert.equal(report.pureBuyoutAbstention.rawAndServedNull, true);
  assert.equal(report.pureBuyoutAbstention.zeroImputationUsed, false);
  assert.equal(
    report.pureBuyoutAbstention.abstentionReason,
    "uncommitted_future_buyout_not_forecastable",
  );
  assert.equal(report.unknownRevenueModel.fallbackToBestRouteUsed, false);
  assert.equal(report.excludesUncommittedFutureBuyout, true);
  assert.equal(report.futureBuyoutProbabilityModelPresent, false);
});

test("C2-R.1 channel report exposes completeness gaps without identifiers", () => {
  const report = read("M2-C2R1-channel-reconciliation-completeness-v1.json");
  const overall = report.candidate.overall;
  assert.equal(overall.workCaseCount, 7851);
  assert.equal(overall.allWorkPointsStrictlyReconciled, true);
  assert.equal(overall.allWorkActualsStrictlyReconciled, true);
  assert.ok(overall.maximumChannelSumToWorkPointAbsoluteDifference <= 0.000001);
  assert.ok(overall.maximumTruthComponentSumToWorkActualAbsoluteDifference <= 0.000001);
  assert.ok(overall.truthWithoutPredictionComponentCount >= 0);
  assert.equal(report.matchedChannelMetricMayBeNamedWorkLevelModelWape, false);
  assert.equal(report.truthWithoutPredictionReportedNotHidden, true);
  assert.equal(report.privacy.channelIdentifiersPresent, false);
});

test("C2-R.1 business report keeps observation gates separate from model WAPE", () => {
  const report = read("M2-C2R1-end-to-end-business-coverage-v1.json");
  assert.equal(report.completePopulation.scope.standardWorkCount, 3053);
  assert.equal(report.completePopulation.scope.completeIncomeFactCount, 192869);
  assert.equal(report.observationGateMayAuthorizeFormalApproval, false);
  assert.equal(report.endToEndBusinessGapMayBeNamedModelWape, false);
  assert.equal(report.surpriseCashHidden, false);
  assert.equal(report.decisionStatus, "not_for_formal_decision");
});

test("all C2-R.1 public artifacts are Chinese, deidentified, and omit PI endpoints", () => {
  const names = [
    "M2-C2R1-design-v1",
    "M2-C2R1-development-validation-v1",
    "M2-C2R1-route-specific-metrics-v1",
    "M2-C2R1-channel-reconciliation-completeness-v1",
    "M2-C2R1-end-to-end-business-coverage-v1",
  ];
  for (const name of names) {
    const jsonText = fs.readFileSync(path.join(reportDir, `${name}.json`), "utf8");
    const markdown = fs.readFileSync(path.join(reportDir, `${name}.md`), "utf8");
    assert.match(markdown, /[\u4e00-\u9fff]/);
    assert.doesNotMatch(jsonText + markdown, /data[\\/]private-output/i);
    assert.doesNotMatch(jsonText, /"standard_work_id"|"channel_key"|"rawChannel/i);
    assert.doesNotMatch(jsonText, /"lower"|"upper"/);
    assert.doesNotMatch(jsonText, /optimistic|pessimistic/i);
  }
});
