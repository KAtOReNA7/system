import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const python = "scripts/run-codex-python.mjs";
const runner = "scripts/m2-real-data/run_m2_c2_reconciliation_checkpoint.py";
const reportDir = path.join(root, "docs/analysis/m2-real-data");
const amendmentPath = path.join(
  root,
  "src/domain/oldProductEvaluation/calibrationSpec.c2.v1.1.reconciliation.amendment.json",
);
const amendment = JSON.parse(fs.readFileSync(amendmentPath, "utf8"));

function read(name) {
  return JSON.parse(fs.readFileSync(path.join(reportDir, name), "utf8"));
}

function gitCanonicalSha256(file) {
  const relative = path.relative(root, file).split(path.sep).join("/");
  const clean = spawnSync("git", ["diff", "--quiet", "HEAD", "--", relative], {
    cwd: root,
  });
  assert.equal(clean.status, 0, `${relative} has local semantic changes`);
  const blob = spawnSync("git", ["cat-file", "blob", `HEAD:${relative}`], {
    cwd: root,
  });
  assert.equal(blob.status, 0, blob.stderr?.toString("utf8"));
  return crypto.createHash("sha256").update(blob.stdout).digest("hex");
}

function run(...args) {
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
  });
}

function lastJson(stdout) {
  return JSON.parse(stdout.trim().split(/\r?\n/u).at(-1));
}

test("C2 v1.1 amendment requires exact integer-cent reconciliation", () => {
  assert.equal(amendment.version, "calibration-spec-c2-v1.1-reconciliation-amendment");
  assert.equal(amendment.baseVersion, "calibration-spec-c2-v1");
  assert.equal(amendment.scope, "monetary_reconciliation_numeric_representation_only");
  assert.equal(amendment.monetaryReconciliation.minorUnit, "cent");
  assert.equal(amendment.monetaryReconciliation.minorUnitYuan, "0.01");
  assert.equal(amendment.monetaryReconciliation.roundingMode, "ROUND_HALF_UP");
  assert.equal(amendment.monetaryReconciliation.floatingAbsoluteToleranceAllowed, false);
  assert.equal(amendment.monetaryReconciliation.integerCentExactEqualityRequired, true);
  assert.equal(amendment.monetaryReconciliation.oneCentMismatchMustFail, true);
  assert.equal(amendment.monetaryReconciliation.rawFloatingDifferenceRetainedAsDiagnostic, true);
  assert.equal(amendment.correctionBoundary.allowedChangedAcceptanceCondition, "residual_does_not_duplicate_cash");
  assert.equal(amendment.correctionBoundary.previousPassedConditionCount, 15);
  assert.equal(amendment.correctionBoundary.correctedPassedConditionCount, 16);
  assert.equal(amendment.correctionBoundary.modelQualityDecision, "FAIL");
  assert.equal(amendment.correctionBoundary.businessCoverageDecision, "CONDITIONAL");
});

test("C2 synthetic cent boundary maps 1.1e-7 yuan to zero and one cent to failure", () => {
  const result = run("--synthetic");
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const payload = lastJson(result.stdout);
  assert.equal(payload.status, "passed");
  assert.equal(payload.mode, "synthetic-only");
  assert.equal(payload.checks.subCentRawDifferenceYuan, 1.1e-7);
  assert.equal(payload.checks.subCentDifferenceCents, 0);
  assert.equal(payload.checks.oneCentDifferenceCents, 1);
  assert.equal(payload.checks.negativeOneCentDifferenceCents, -1);
  assert.equal(payload.checks.floatingAbsoluteToleranceUsed, false);
  assert.equal(payload.checks.oneCentMismatchMustFail, true);
  assert.equal(payload.privateDataRead, false);
  assert.equal(payload.finalHoldoutOpened, false);
});

test("C2 corrected reports retain the raw diagnostic and pass exact cents", () => {
  const residual = read("M2-C2-other-new-channel-residual-audit-v1.json");
  assert.equal(residual.maximumWorkPointReconciliationDifference, 1.1e-7);
  assert.equal(residual.maximumWorkPointReconciliationDifferenceRawYuan, 1.1e-7);
  assert.equal(residual.maximumWorkPointReconciliationDifferenceCents, 0);
  assert.equal(residual.workPointReconciliationMismatchCaseCountAtCentPrecision, 0);
  assert.equal(residual.maximumTruthComponentReconciliationDifferenceCents, 0);
  assert.equal(residual.truthComponentReconciliationMismatchCaseCountAtCentPrecision, 0);
  assert.equal(residual.workPointFormulaVerified, true);
  assert.equal(residual.workPointFormulaVerificationBasis, "exact_integer_cent_difference");
  assert.equal(residual.knownChannelCashDuplicated, false);
  assert.equal(residual.monetaryReconciliation.floatingAbsoluteToleranceUsed, false);
  assert.equal(residual.monetaryReconciliation.oneCentMismatchMustFail, true);
});

test("C2 correction changes only the residual gate and leaves model decision FAIL", () => {
  const validation = read("M2-C2-development-validation-v1.json");
  const model = read("M2-C2-model-quality-decision-v1.json");
  assert.equal(validation.acceptance.conditionCount, 25);
  assert.equal(validation.acceptance.passedConditionCount, 16);
  assert.equal(validation.acceptance.conditions.residual_does_not_duplicate_cash, true);
  assert.equal(validation.modelQualityDecision, "FAIL");
  assert.equal(validation.businessCoverageDecision, "CONDITIONAL");
  assert.equal(validation.overallDecision, "MODEL_FAIL_BUSINESS_COVERAGE_CONDITIONAL");
  assert.deepEqual(model.acceptance, validation.acceptance);
  assert.equal(model.modelQualityDecision, "FAIL");
  assert.equal(validation.metrics.modelPopulation.caseCount, 7851);
  assert.equal(validation.metrics.modelPopulation.uniqueWorkCount, 824);
  assert.equal(validation.metrics.modelPopulation.wape, 0.5569548);
  assert.equal(validation.metrics.modelPopulation.mae, 5649.42524532);
  assert.equal(validation.metrics.modelPopulation.smape, 0.90320362);
  assert.equal(validation.metrics.modelPopulation.signedAggregateBias, 0.0928913);
  assert.equal(validation.predictionIntegrity.predictionProjectionDigest, amendment.frozenModelEvidence.predictionProjectionDigest);
  assert.equal(validation.monetaryReconciliationCorrection.predictionsChanged, false);
  assert.equal(validation.monetaryReconciliationCorrection.B4Changed, false);
  assert.equal(validation.monetaryReconciliationCorrection.GateCChanged, false);
  assert.equal(validation.monetaryReconciliationCorrection.modelPopulationChanged, false);
  assert.equal(validation.monetaryReconciliationCorrection.otherAcceptanceThresholdsChanged, false);
  assert.equal(Object.values(validation.seals).every((value) => value === false), true);
  assert.equal(validation.decisionStatus, "not_for_formal_decision");
  assert.equal(validation.C3Started, false);
  assert.equal(validation.releaseAuthorized, false);
  assert.equal(validation.M3Started, false);
});

test("Gate C-bound Git blobs remain canonical and public verification passes", () => {
  const frozen = amendment.frozenPhaseA;
  assert.equal(
    gitCanonicalSha256(path.join(root, "src/domain/oldProductEvaluation/calibrationSpec.c2.v1.amendment.json")),
    frozen.baseSpecSha256,
  );
  assert.equal(
    gitCanonicalSha256(path.join(root, "scripts/m2-real-data/m2_calibration_c2_v1.py")),
    frozen.c2CoreSha256,
  );
  assert.equal(
    gitCanonicalSha256(path.join(root, "scripts/m2-real-data/run_m2_c2_development_validation.py")),
    frozen.c2RunnerSha256,
  );
  assert.equal(
    gitCanonicalSha256(path.join(reportDir, "M2-calibration-gate-c-v1.json")),
    frozen.gateCReportSha256,
  );
  const gate = read("M2-calibration-gate-c-v1.json");
  assert.equal(gate.conditionCount, 14);
  assert.equal(gate.passedConditionCount, 14);
  assert.equal(gate.allTrue, true);
  const result = run("--verify-public");
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const payload = lastJson(result.stdout);
  assert.equal(payload.status, "passed");
  assert.equal(payload.acceptancePassedConditionCount, 16);
  assert.equal(payload.modelQualityDecision, "FAIL");
  assert.equal(payload.businessCoverageDecision, "CONDITIONAL");
  assert.equal(payload.gateCAllTrue, true);
  assert.equal(payload.finalHoldoutOpened, false);
  assert.equal(payload.C3Started, false);
});
