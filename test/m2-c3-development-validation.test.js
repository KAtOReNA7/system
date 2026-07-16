import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const python = "scripts/run-codex-python.mjs";
const runner = "scripts/m2-real-data/run_m2_c3_development_validation.py";
const reportDir = path.join(root, "docs/analysis/m2-real-data");
const validationPath = path.join(reportDir, "M2-C3-development-validation-v1.json");
const gatePath = path.join(reportDir, "M2-calibration-gate-d-v1.json");
const privateRelative = "data/private-output/m2-c3-v1";

function git(...args) {
  return spawnSync("git", args, { cwd: root, encoding: "utf8" });
}

function run(args) {
  return spawnSync(process.execPath, [python, runner, ...args], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      M1_APP_ENV: "ci",
      M1_DATABASE_URL: "",
      M1_DATABASE_READONLY_URL: "",
      M1_DATABASE_BACKGROUND_URL: "",
    },
    maxBuffer: 64 * 1024 * 1024,
  });
}

function read(name) {
  const file = path.join(reportDir, name);
  assert.equal(fs.existsSync(file), true, `${name} must exist`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function validationOrSkip(context) {
  if (!fs.existsSync(validationPath)) {
    context.skip("C3 development replay has not been generated yet");
    return null;
  }
  return JSON.parse(fs.readFileSync(validationPath, "utf8"));
}

function assertMetricSet(value, label) {
  assert.equal(typeof value, "object", label);
  for (const key of ["wape", "mae", "smape", "signedBias"]) {
    assert.equal(Number.isFinite(value[key]), true, `${label}.${key}`);
  }
}

function assertPrivateRoleIgnoredAndUntracked() {
  const sentinel = `${privateRelative}/.c3-contract-sentinel`;
  assert.equal(git("check-ignore", "--quiet", "--", sentinel).status, 0, sentinel);
  const tracked = git("ls-files", "--", privateRelative);
  assert.equal(tracked.status, 0, tracked.stderr);
  assert.equal(tracked.stdout.trim(), "", "C3 private role must remain untracked");
}

test("C3 pre-development state is Gate-D-denied and its private role is ignored", () => {
  assertPrivateRoleIgnoredAndUntracked();
  if (fs.existsSync(validationPath)) return;

  if (fs.existsSync(gatePath)) {
    const gate = JSON.parse(fs.readFileSync(gatePath, "utf8"));
    assert.equal(gate.allTrue, false);
    assert.equal(gate.C3AuthorizedByGateD, false);
  }
  const result = run(["--verify-c3-authorization"]);
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /Gate D.*(?:not authorized|not all true|missing)/iu);
  assert.match(`${result.stdout}\n${result.stderr}`.replaceAll(" ", ""), /dataLoadCalls=0/iu);
});

test("C3 development preserves 18615/12223/7851/824 and prediction integrity", (context) => {
  const report = validationOrSkip(context);
  if (!report) return;
  assert.equal(report.schema, "m2.c3_development_validation.v1");
  assert.equal(report.decisionStatus, "not_for_formal_decision");
  assert.equal(report.formalDecisionAuthorized, false);
  assert.equal(report.releaseAuthorized, false);
  assert.equal(report.technicalSummary.C3Executed, true);
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
  assert.equal(report.predictionIntegrity.caseKeysMatchFrozen, true);
  assert.equal(report.predictionIntegrity.actualsMatchFrozen, true);
  assert.equal(report.predictionIntegrity.statesMatchFrozen, true);
  assert.equal(report.predictionIntegrity.futurePerturbationInvariant, true);
  assert.equal(report.predictionIntegrity.samePredictAsOfEntryUsed, true);
  assert.equal(report.predictionIntegrity.deterministicReplayMatched, true);
  assert.match(report.predictionIntegrity.predictionProjectionDigest, /^[0-9a-f]{64}$/u);
});

test("C3 compares A/B/C and conditionally S with the frozen comparator bundle", (context) => {
  const report = validationOrSkip(context);
  if (!report) return;
  for (const id of ["C3-A", "C3-B", "C3-C"]) {
    assert.equal(report.candidateResults[id].status, "executed", id);
    assert.equal(report.candidateResults[id].outerActualUsedForRuleCreation, false, id);
  }
  const c3s = report.candidateResults["C3-S"];
  assert.ok(["enabled", "skipped"].includes(c3s.status));
  if (c3s.status === "enabled") {
    assert.equal(c3s.stableInnerOriginImprovementEstablished, true);
  } else {
    assert.equal(c3s.stableInnerOriginImprovementEstablished, false);
    assert.equal(c3s.outerReplayExecuted, false);
  }

  const required = ["B0b", "B1", "B3", "B4", "C3-A", "C3-B", "C3-C"];
  for (const model of required) assert.ok(report.comparatorBundle.reported.includes(model));
  assert.equal(report.comparatorBundle.reported.includes("C3-S"), c3s.status === "enabled");
  assert.equal(report.comparatorBundle.primaryComparator, "B4");
  assert.equal(report.comparatorBundle.sameCaseKeys, true);
  assert.equal(report.comparatorBundle.sameActuals, true);
  assert.equal(report.comparatorBundle.sameCaseStates, true);
  assert.equal(report.comparatorBundle.sameModelPopulation, true);
  assert.equal(report.comparatorBundle.sameOriginsHorizonsAndSeed, true);
  assert.equal(report.finalRouteSelection.outerActualUsed, false);
  assert.equal(report.finalRouteSelection.outerMetricsUsed, false);
  assert.equal(report.finalRouteSelection.selectedModel, report.finalModel);
  assert.ok(["C3-A", "C3-S"].includes(report.finalModel));
});

test("C3 reports complete metric cuts, model behavior, and internal intervals", (context) => {
  const report = validationOrSkip(context);
  if (!report) return;
  assertMetricSet(report.metrics.overall, "metrics.overall");
  for (const horizon of [3, 6, 12, 18, 24]) {
    assertMetricSet(report.metrics.byHorizon[String(horizon)], `metrics.byHorizon.${horizon}`);
  }
  for (const band of ["top1", "top5", "top10"]) {
    assertMetricSet(report.metrics.highValue[band], `metrics.highValue.${band}`);
  }
  for (const segment of ["dense", "intermittent", "dormant"]) {
    assertMetricSet(report.metrics.segments[segment], `metrics.segments.${segment}`);
    assertMetricSet(
      report.comparators.B4.segments[segment],
      `comparators.B4.segments.${segment}`,
    );
  }
  assert.ok(Object.keys(report.metrics.routes).length >= 2);
  for (const [route, metrics] of Object.entries(report.metrics.routes)) {
    assertMetricSet(metrics, `metrics.routes.${route}`);
  }
  assert.equal(Number.isFinite(report.metrics.internal80.coverage), true);
  assert.equal(Number.isFinite(report.metrics.internal80.wis), true);
  assert.equal(Number.isFinite(report.metrics.internal80.standardizedWidth), true);
  assert.equal(report.metrics.internal80.endpointsPresentInPublicReport, false);

  assert.ok(Number.isInteger(report.modelBehavior.B4UnchangedCount));
  assert.ok(Number.isInteger(report.modelBehavior.correctionCount));
  assert.ok(Number.isInteger(report.modelBehavior.fallbackCount));
  assert.equal(
    report.modelBehavior.B4UnchangedCount + report.modelBehavior.correctionCount,
    7851,
  );
  assert.equal(typeof report.modelBehavior.correctionDistribution, "object");
  assert.equal(typeof report.modelBehavior.featureImportance, "object");
  assert.match(report.modelBehavior.deterministicDigest, /^[0-9a-f]{64}$/u);
});

test("C3 formal-cash and training boundaries remain fail-closed", (context) => {
  const report = validationOrSkip(context);
  if (!report) return;
  assert.equal(report.formalCashIntegrity.targetUnchanged, true);
  assert.equal(report.formalCashIntegrity.pureBuyoutWithoutCommitment.rawModelPrediction, null);
  assert.equal(report.formalCashIntegrity.pureBuyoutWithoutCommitment.servedPrediction, null);
  assert.equal(report.formalCashIntegrity.pureBuyoutWithoutCommitment.routeAbstained, true);
  assert.equal(
    report.formalCashIntegrity.pureBuyoutWithoutCommitment.abstentionReason,
    "uncommitted_future_buyout_not_forecastable",
  );
  assert.equal(report.formalCashIntegrity.pureBuyoutWithoutCommitment.zeroImputationUsed, false);
  assert.equal(report.formalCashIntegrity.mixedExcludesUncommittedFutureBuyout, true);
  assert.equal(report.trainingIntegrity.innerOriginOnly, true);
  assert.equal(report.trainingIntegrity.crossFit, true);
  assert.equal(report.trainingIntegrity.preprocessingFoldLocal, true);
  assert.equal(report.trainingIntegrity.candidateSpaceFrozen, true);
  assert.equal(report.trainingIntegrity.identityFeaturesUsed, false);
  assert.equal(report.trainingIntegrity.futureInformationUsed, false);
});

test("C3 keeps the unchanged acceptance gates and independent decisions", (context) => {
  const report = validationOrSkip(context);
  if (!report) return;
  const spec = JSON.parse(
    fs.readFileSync(
      path.join(root, "src/domain/oldProductEvaluation/calibrationSpec.c3.v1.amendment.json"),
      "utf8",
    ),
  );
  assert.deepEqual(report.acceptance.thresholds, spec.acceptance);
  assert.equal(report.acceptance.thresholdsChangedAfterResults, false);
  assert.equal(report.acceptance.populationMoved, false);
  assert.ok(["PASS", "FAIL"].includes(report.modelQualityDecision));
  assert.ok(["PASS", "CONDITIONAL", "FAIL"].includes(report.businessCoverageDecision));
  assert.match(report.overallDecision, /^MODEL_(?:PASS|FAIL)_BUSINESS_COVERAGE_(?:PASS|CONDITIONAL|FAIL)$/u);
  assert.equal(Number.isFinite(report.businessCoverage.fullLibraryCashCoverage), true);
  assert.equal(Number.isFinite(report.businessCoverage.top10CashCoverage), true);
  assert.equal(report.P0Count, 0);
  assert.equal(report.P1Count, 0);
  assert.equal(report.P2Boundary, "fact_audit_only");
  assert.equal(report.automaticOperationalActionCount, 0);
  assert.equal(Object.values(report.seals).every((value) => value === false), true);
  assert.equal(report.C4Started, false);
  assert.equal(report.M3Started, false);
  assert.equal(report.releaseAuthorized, false);
});

test("C3 public artifacts are Chinese, aggregate-only, and terminal on model failure", (context) => {
  const report = validationOrSkip(context);
  if (!report) return;
  const names = [
    "M2-C3-opportunity-audit-v1",
    "M2-C3-feature-manifest-v1",
    "M2-C3-candidate-space-v1",
    "M2-C3-model-design-v1",
    "M2-C3-development-validation-v1",
    "M2-C3-model-quality-decision-v1",
    "M2-C3-business-coverage-decision-v1",
  ];
  if (report.modelQualityDecision === "FAIL") {
    names.push("M2-C3-terminal-model-route-summary-v1");
    const terminal = read("M2-C3-terminal-model-route-summary-v1.json");
    assert.deepEqual(terminal.routes, ["B4", "C1", "C2-R", "C2", "C3"]);
    assert.equal(terminal.C4Authorized, false);
  }
  for (const name of names) {
    const jsonText = fs.readFileSync(path.join(reportDir, `${name}.json`), "utf8");
    const markdown = fs.readFileSync(path.join(reportDir, `${name}.md`), "utf8");
    assert.match(markdown, /[\u4e00-\u9fff]/u, name);
    assert.doesNotMatch(jsonText + markdown, /data[\\/]private|private-output/iu, name);
    assert.doesNotMatch(
      jsonText,
      /"standard_work_id"\s*:|"workId"\s*:|"title"\s*:|"author"\s*:|"channel_key"\s*:|"rawChannel"\s*:/iu,
      name,
    );
    assert.doesNotMatch(
      jsonText,
      /"piLower"\s*:|"piUpper"\s*:|"lowerEndpoint"\s*:|"upperEndpoint"\s*:/iu,
      name,
    );
  }
});

test("C3 private evidence, when present, remains ignored and untracked", () => {
  assertPrivateRoleIgnoredAndUntracked();
  const privateDir = path.join(root, privateRelative);
  if (!fs.existsSync(privateDir)) return;
  const pending = [privateDir];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(absolute);
        continue;
      }
      const relative = path.relative(root, absolute);
      assert.equal(git("check-ignore", "--quiet", "--", relative).status, 0, relative);
      assert.equal(git("ls-files", "--error-unmatch", "--", relative).status, 1, relative);
    }
  }
});
