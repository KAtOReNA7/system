import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportDir = path.join(root, "docs/analysis/m2-real-data");
const python = "scripts/run-codex-python.mjs";
const supersessionPath = path.join(
  reportDir,
  "M2-C2R-legacy-target-supersession-v1.json",
);
const paths = {
  target: {
    json: path.join(reportDir, "M2-C2R1-formal-cash-target-separation-v1.json"),
    md: path.join(reportDir, "M2-C2R1-formal-cash-target-separation-v1.md"),
  },
  commitment: {
    json: path.join(reportDir, "M2-C2R1-buyout-commitment-as-of-audit-v1.json"),
    md: path.join(reportDir, "M2-C2R1-buyout-commitment-as-of-audit-v1.md"),
  },
  bridge: {
    json: path.join(reportDir, "M2-C2R1-old-target-new-target-bridge-v1.json"),
    md: path.join(reportDir, "M2-C2R1-old-target-new-target-bridge-v1.md"),
  },
};

function decodeUtf8(reportPath) {
  const bytes = fs.readFileSync(reportPath);
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function loadReports() {
  const reports = {};
  for (const [name, pair] of Object.entries(paths)) {
    for (const reportPath of Object.values(pair)) {
      assert.equal(
        fs.existsSync(reportPath),
        true,
        `required formal-cash report is missing: ${path.basename(reportPath)}`,
      );
    }
    const jsonText = decodeUtf8(pair.json);
    const markdownText = decodeUtf8(pair.md);
    reports[name] = {
      json: JSON.parse(jsonText),
      jsonText,
      markdownText,
    };
  }
  return reports;
}

function currentAmendmentDigest() {
  const source = String.raw`
import sys
from pathlib import Path
root = Path.cwd()
sys.path.insert(0, str(root / "scripts" / "m2-real-data"))
import m2_formal_cash_target_v1 as cash
print(cash.canonical_digest(cash.load_spec()))
`;
  const result = spawnSync(process.execPath, [python, "-c", source], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const digest = result.stdout.trim().split(/\r?\n/).at(-1);
  assert.match(digest, /^[a-f0-9]{64}$/);
  return digest;
}

function findNamedValues(value, wantedName, found = []) {
  if (Array.isArray(value)) {
    for (const item of value) findNamedValues(item, wantedName, found);
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (key === wantedName) found.push(child);
      findNamedValues(child, wantedName, found);
    }
  }
  return found;
}

const reports = loadReports();
const amendmentDigest = currentAmendmentDigest();

test("all six formal-cash reports are mandatory and bound to the current amendment", () => {
  assert.equal(Object.keys(reports).length, 3);
  for (const report of Object.values(reports)) {
    assert.equal(report.json.evidenceBinding.amendmentDigest, amendmentDigest);
  }
});

test("legacy C2-R artifacts are immutable historical-target evidence", () => {
  assert.equal(fs.existsSync(supersessionPath), true);
  const manifest = JSON.parse(decodeUtf8(supersessionPath));
  assert.equal(manifest.targetSemantics, "legacy_c2r_v1_monthly_equivalent");
  assert.equal(manifest.legacyC2RDevelopmentStatus, "FAIL");
  assert.equal(manifest.formalCashMetricEligible, false);
  assert.equal(manifest.mustNotCompareDirectlyToC2R1, true);
  assert.equal(manifest.legacyArtifactFamilyCount, 5);
  assert.equal(manifest.legacyArtifactCount, 10);
  assert.equal(manifest.legacyArtifacts.length, 10);
  for (const artifact of manifest.legacyArtifacts) {
    const artifactPath = path.join(root, artifact.path);
    assert.equal(fs.existsSync(artifactPath), true, artifact.path);
    const observed = crypto
      .createHash("sha256")
      .update(fs.readFileSync(artifactPath, "utf8").replaceAll("\r\n", "\n"))
      .digest("hex");
    assert.equal(observed, artifact.sha256, artifact.path);
  }
  assert.equal(manifest.executionBoundary.C2R1TrainingStarted, false);
  assert.equal(manifest.executionBoundary.finalHoldoutSealed, true);
  assert.equal(manifest.executionBoundary.released, false);
  assert.equal(manifest.executionBoundary.M3FormalExecutionStarted, false);
});

test("formal-cash reports keep authority, eligibility, training, and seals unchanged", () => {
  for (const report of Object.values(reports).map((value) => value.json)) {
    assert.equal(report.language, "zh-CN");
    assert.equal(report.decisionStatus, "not_for_formal_decision");
    assert.equal(report.formalDecisionAuthorized, false);
    assert.equal(report.releaseAuthorized, false);
    assert.equal(report.C2R1TrainingStarted, false);
    assert.equal(report.authorityInputsChanged, false);
    assert.equal(report.eligibilityChanged, false);
    assert.equal(report.seals.finalHoldoutOpened, false);
    assert.equal(report.seals.embargoShadowOpened, false);
    assert.equal(report.seals.deferred60MonthLabelsOpened, false);
  }
});

test("formal-cash target report separates all three actuals without model scoring", () => {
  const report = reports.target.json;
  assert.equal(report.scope.standardWorkCount, 3053);
  assert.equal(report.scope.incomeFactCount, 192872);
  assert.equal(report.scope.developmentCaseWindowCount, 18615);
  assert.equal(report.scope.statisticallyScoreableCaseWindowCount, 12223);
  assert.ok(
    Math.abs(
      report.developmentActualAudit.forecastableCashActual
        + report.developmentActualAudit.uncommittedBuyoutSurpriseActual
        - report.developmentActualAudit.totalLedgerCashActual,
    ) < 0.000001,
  );
  assert.equal(report.conservation.maximumPerCaseAmountDifference, 0);
  assert.ok(Math.abs(report.conservation.aggregateAmountDifference) <= 0.000001);
  assert.equal(report.metricStatus.C2R1CandidateMetricsComputed, false);
  assert.equal(report.caseStateAudit.nullPredictionMayBeScoredAsZero, false);
});

test("commitment audit fails closed when historical as-of evidence is absent", () => {
  const audit = reports.commitment.json.currentAuthorityAudit;
  assert.equal(audit.cashCommitmentSnapshotRoleAvailable, false);
  assert.equal(audit.auditableCutoffCommitmentCount, 0);
  assert.equal(audit.replayAdapterWorkCountWithCommitmentSnapshot, 0);
  assert.ok(Object.values(audit.requiredFieldsAvailable).every((value) => value === false));
  assert.equal(audit.postHocCommitmentRestorationUsed, false);
  assert.equal(
    reports.commitment.json.historicalEvidenceConclusion
      .classifierDerivedPositiveSurpriseCaseWindowCount > 0,
    true,
  );
});

test("old-to-new target bridge preserves keys and balances amounts", () => {
  const bridge = reports.bridge.json;
  assert.equal(bridge.population.sameCaseKeys, true);
  assert.equal(bridge.population.sameScoreabilityAndEligibility, true);
  assert.ok(Math.abs(bridge.amountBridge.bridgeBalanceDifference) <= 0.000001);
  assert.equal(
    bridge.amountBridge.formalForecastableCashAddedOnPureBuyoutCases,
    2571419.36,
  );
  assert.equal(bridge.amountBridge.legacyPureBuyoutTargetRemoved, 716265);
  assert.equal(bridge.amountBridge.nonPureBuyoutNetDifference, 0);
  assert.equal(bridge.amountConservation.passed, true);
  assert.equal(bridge.amountConservation.maximumPerCaseDifference, 0);
  assert.ok(Math.abs(bridge.amountConservation.aggregateDifference) <= 0.000001);
  assert.equal(bridge.interpretation.legacyC2RResultsAreFormalCashMetrics, false);
  assert.equal(bridge.interpretation.allDifferenceAttributedToLeakageRemoval, false);
});

test("JSON and Markdown reports are Chinese UTF-8, deidentified, and interval-free", () => {
  const forbiddenText = [
    ["replacement character", /\uFFFD/u],
    ["private data path", /data[\\/]private(?:[-_/\\]|$)/iu],
    ["private output path", /private[-_]?output/iu],
    ["Windows absolute path", /(?:^|[\s`"'(])(?:[a-z]:[\\/])/imu],
    ["private spreadsheet", /\.xlsx\b/iu],
    ["work identifier", /\bstandard_work_id\b/iu],
    ["channel identifier", /\bchannel_(?:key|id|component_key)\b/iu],
    [
      "scenario or PI endpoint field",
      /["'`](?:optimistic|pessimistic|high|base|low|lower|upper)["'`]\s*:/iu,
    ],
  ];

  for (const [name, report] of Object.entries(reports)) {
    for (const [format, text] of [
      ["json", report.jsonText],
      ["md", report.markdownText],
    ]) {
      assert.match(text, /[\u3400-\u9FFF]/u, `${name}.${format} must contain Chinese`);
      for (const [label, pattern] of forbiddenText) {
        assert.equal(pattern.test(text), false, `${name}.${format}: ${label}`);
      }
    }

    assert.deepEqual(report.json.privacy, {
      aggregateOnly: true,
      deidentified: true,
      minimumCellCount: 10,
      workIdentifiersPresent: false,
      channelIdentifiersPresent: false,
      privatePathsPresent: false,
      rawLedgerRowsPresent: false,
      commitmentEvidenceReferencesPresent: false,
      predictionIntervalEndpointsPresent: false,
    });
  }
});

test("cross-report suppression prevents differencing a protected small cell", () => {
  const protectedDerivedFields = [
    "businessServingEligibleFrozenCaseWindowCount",
    "structurallyForecastableRouteCaseWindowCount",
    "routeAbstainedScoreableCaseWindowCount",
    "routeAbstainedScoreableActualRevenueShare",
  ];
  for (const field of protectedDerivedFields) {
    const values = Object.values(reports).flatMap((report) =>
      findNamedValues(report.json, field),
    );
    assert.ok(values.length >= 1, `${field} must be explicitly present and suppressed`);
    assert.ok(values.every((value) => value === null), `${field} must never be numeric`);
  }

  const cells = Object.values(reports.bridge.json.routeDiagnostics);
  const suppressed = cells.filter((cell) => cell.suppressed);
  assert.ok(suppressed.length >= 2, "primary suppression requires complementary suppression");
  for (const cell of cells) {
    if (cell.suppressed) {
      assert.equal(cell.caseWindowCount, null);
      assert.equal(cell.uniqueWorkCount, null);
      assert.equal(cell.oldTargetAmount, null);
      assert.equal(cell.forecastableCashAmount, null);
      assert.equal(cell.surpriseBuyoutAmount, null);
      assert.equal(cell.totalLedgerCashAmount, null);
    } else {
      assert.ok(cell.caseWindowCount >= 10);
      assert.ok(cell.uniqueWorkCount >= 10);
    }
  }
});
