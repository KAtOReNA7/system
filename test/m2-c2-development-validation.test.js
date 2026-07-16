import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportDir = path.join(root, "docs/analysis/m2-real-data");
const validationPath = path.join(reportDir, "M2-C2-development-validation-v1.json");
const privateDir = path.join(root, "data/private-output/m2-c2-v1");

function read(name) {
  return JSON.parse(fs.readFileSync(path.join(reportDir, name), "utf8"));
}

function git(...args) {
  return spawnSync("git", args, { cwd: root, encoding: "utf8" });
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

test("C2 development preserves the exact population, prediction lock, and seals", (context) => {
  if (!fs.existsSync(validationPath)) {
    context.skip("C2 development replay has not been generated yet");
    return;
  }
  const report = JSON.parse(fs.readFileSync(validationPath, "utf8"));
  assert.equal(report.schema, "m2.c2_development_validation.v1");
  assert.equal(report.decisionStatus, "not_for_formal_decision");
  assert.equal(report.formalDecisionAuthorized, false);
  assert.equal(report.releaseAuthorized, false);
  assert.equal(report.technicalSummary.C2Executed, true);
  assert.equal(report.technicalSummary.primaryComparator, "B4");
  assert.equal(report.technicalSummary.frozenCaseCount, 18615);
  assert.equal(report.technicalSummary.statisticallyScoreableCaseCount, 12223);
  assert.equal(report.technicalSummary.modelPopulationCaseCount, 7851);
  assert.equal(report.technicalSummary.modelPopulationWorkCount, 824);
  assert.equal(report.technicalSummary.modelPopulationUnchanged, true);
  assert.equal(report.technicalSummary.pureBuyoutNullScoredAsZero, false);
  assert.equal(report.predictionIntegrity.predictionLockedBeforeTruthJoin, true);
  assert.equal(report.predictionIntegrity.postTruthProjectionMatchesLock, true);
  assert.equal(report.predictionIntegrity.actualFieldAbsentAtPredictionLock, true);
  assert.match(report.predictionIntegrity.predictionProjectionDigest, /^[0-9a-f]{64}$/u);
  assert.equal(Object.values(report.seals).every((value) => value === false), true);
});

test("C2 reports all fixed quality gates and independent decisions", (context) => {
  if (!fs.existsSync(validationPath)) {
    context.skip("C2 development replay has not been generated yet");
    return;
  }
  const report = JSON.parse(fs.readFileSync(validationPath, "utf8"));
  assert.equal(report.acceptance.conditionCount, 25);
  assert.equal(Object.keys(report.acceptance.conditions).length, 25);
  assert.equal(report.acceptance.thresholdsChangedAfterResults, false);
  assert.ok(["PASS", "FAIL"].includes(report.modelQualityDecision));
  assert.ok(["PASS", "CONDITIONAL", "FAIL"].includes(report.businessCoverageDecision));
  assert.match(report.overallDecision, /MODEL_|FAIL_CLOSED/u);
  assert.equal(report.metrics.modelPopulation.caseCount, 7851);
  assert.equal(report.metrics.modelPopulation.zeroImputationUsed, false);
  assert.equal(report.metrics.internal80.endpointsPresentInPublicReport, false);
  assert.equal(report.P0Count, 0);
  assert.equal(report.P1Count, 0);
  assert.equal(report.P2Boundary, "fact_audit_only");
  assert.equal(report.automaticOperationalActionCount, 0);
});

test("C2 segment, residual, and high-value reports preserve their frozen contracts", (context) => {
  if (!fs.existsSync(validationPath)) {
    context.skip("C2 development replay has not been generated yet");
    return;
  }
  const segment = read("M2-C2-activity-segment-route-manifest-v1.json");
  const residual = read("M2-C2-other-new-channel-residual-audit-v1.json");
  const guard = read("M2-C2-high-value-guard-audit-v1.json");
  assert.deepEqual(Object.keys(segment.segments).sort(), ["dense", "dormant", "intermittent"]);
  assert.equal(segment.thresholdMovedAfterResults, false);
  assert.equal(segment.futurePerturbationInvariant, true);
  assert.equal(residual.outerTruthUsed, false);
  assert.equal(residual.futureChannelIdentityPredicted, false);
  assert.equal(residual.knownChannelCashDuplicated, false);
  assert.ok(residual.maximumWorkPointReconciliationDifference <= 0.000001);
  assert.equal(guard.outerTopBandActualUsed, false);
  assert.equal(guard.guardActiveOnEveryTop10Case, true);
  assert.equal(guard.fallbackRuleChangedAfterResults, false);
});

test("C2 remains comparable with B4, B0b, B1, and B3 on identical keys", (context) => {
  if (!fs.existsSync(validationPath)) {
    context.skip("C2 development replay has not been generated yet");
    return;
  }
  const report = JSON.parse(fs.readFileSync(validationPath, "utf8"));
  assert.deepEqual(report.comparatorBundle.reported, ["B0b", "B1", "B3", "B4", "C2"]);
  assert.equal(report.comparatorBundle.sameCaseKeys, true);
  assert.equal(report.comparatorBundle.sameActuals, true);
  assert.equal(report.comparatorBundle.sameModelPopulation, true);
  assert.equal(report.comparatorBundle.sameOriginsHorizonsAndSeed, true);
  assert.equal(report.comparatorBundle.primaryComparator, "B4");
});

test("C2 public artifacts are Chinese, aggregate-only, and omit PI endpoints", (context) => {
  if (!fs.existsSync(validationPath)) {
    context.skip("C2 development replay has not been generated yet");
    return;
  }
  const names = [
    "M2-C2-activity-segment-route-manifest-v1",
    "M2-C2-other-new-channel-residual-audit-v1",
    "M2-C2-high-value-guard-audit-v1",
    "M2-C2-development-validation-v1",
    "M2-C2-model-quality-decision-v1",
    "M2-C2-business-coverage-decision-v1",
  ];
  for (const name of names) {
    const jsonText = fs.readFileSync(path.join(reportDir, `${name}.json`), "utf8");
    const markdown = fs.readFileSync(path.join(reportDir, `${name}.md`), "utf8");
    assert.match(markdown, /[\u4e00-\u9fff]/u);
    assert.doesNotMatch(jsonText + markdown, /data[\\/]private|private-output/iu);
    assert.doesNotMatch(jsonText, /"standard_work_id"|"channel_key"|rawChannel/iu);
    assert.doesNotMatch(jsonText, /"lower"|"upper"/u);
    assert.doesNotMatch(jsonText, /optimistic|pessimistic|high\/base\/low/iu);
  }
});

test("ignored C2 evidence remains untracked and is verified when complete", (context) => {
  const manifestPath = path.join(privateDir, "M2-C2-development-manifest-private-v1.json");
  const casesPath = path.join(privateDir, "M2-C2-development-cases-private-v1.ndjson");
  const workbookPath = path.join(privateDir, "M2-C2-中文业务抽检工作簿-private-v1.xlsx");
  const privateArtifacts = [casesPath, manifestPath, workbookPath];
  for (const file of privateArtifacts) {
    const relative = path.relative(root, file);
    assert.equal(git("check-ignore", "--quiet", "--", relative).status, 0, relative);
    assert.equal(git("ls-files", "--error-unmatch", "--", relative).status, 1, relative);
  }
  if (!privateArtifacts.every((file) => fs.existsSync(file))) {
    context.skip("ignored C2 development evidence is incomplete on this machine");
    return;
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.schema, "m2.c2_development_manifest.private.v1");
  assert.equal(manifest.privateCaseCount, 18615);
  assert.equal(manifest.modelPopulationCaseCount, 7851);
  assert.equal(manifest.privateCaseSha256, sha256(casesPath));
  assert.equal(manifest.privateWorkbookSha256, sha256(workbookPath));
  assert.equal(manifest.tracked, false);
});

test("C2 decisions do not authorize C3, release, or M3", (context) => {
  if (!fs.existsSync(validationPath)) {
    context.skip("C2 development replay has not been generated yet");
    return;
  }
  const report = JSON.parse(fs.readFileSync(validationPath, "utf8"));
  assert.equal(report.C3Started, false);
  assert.equal(report.releaseAuthorized, false);
  assert.equal(report.M3Started, false);
  assert.equal(report.nextBoundary, "stop_before_C3_wait_for_user_authorization");
});
