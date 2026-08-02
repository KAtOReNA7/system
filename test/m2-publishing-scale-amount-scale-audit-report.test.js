import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const reportPath = new URL(
  "../docs/analysis/m2-current/"
    + "M2-publishing-scale-channel-amount-scale-root-cause-audit-v0.1.json",
  import.meta.url
);
const reportMarkdownPath = new URL(
  "../docs/analysis/m2-current/"
    + "M2-publishing-scale-channel-amount-scale-root-cause-audit-v0.1.md",
  import.meta.url
);
const registryPath = new URL(
  "../config/m2-model-registry.v1.json",
  import.meta.url
);

test("PSC01 public root-cause report preserves frozen evidence", () => {
  const report = readJson(reportPath);
  assert.equal(
    report.schema,
    "m2.current.publishing_scale_channel_amount_scale_root_cause_audit.v0.1"
  );
  assert.equal(report.modelId, "M2-CHAN-PSC01");
  assert.equal(report.candidateId, "M2-CHAN-PSC01-RAW");
  assert.equal(
    report.rootCause.category,
    "ESTIMATOR_SCALE_SHRINKAGE_CONFIRMED_IMPLEMENTATION_CORRECT"
  );
  assert.equal(report.rootCause.firstMaterialCollapseStage,
    "originVisibleEmpiricalParent");
  assert.equal(report.rootCause.implementationOrUnitTransformDefectConfirmed,
    false);
  assert.equal(report.rootCause.comparatorIntegrityDefectConfirmed, false);
  assert.equal(report.frozenEvidence.evaluationRowCount, 3318819);
  assert.equal(report.frozenEvidence.comparatorRowCount, 395904);
  assert.equal(report.frozenEvidence.rawCandidatePreserved, true);
  assert.equal(report.frozenEvidence.fallbackOverwroteRaw, false);
  assert.equal(report.frozenEvidence.predictionGeneratedAfterFreezeCount, 0);
  assert.equal(report.frozenEvidence.predictionModifiedAfterFreezeCount, 0);
  assert.equal(
    report.comparatorIntegrity.status,
    "EXACT_SAME_CASE_CURRENT_ACTUAL_RESCORING_VERIFIED"
  );
  assert.equal(
    report.comparatorIntegrity.counts.missingComparatorWorkCases,
    0
  );
  assert.equal(
    report.comparatorIntegrity.counts.missingComparatorObservedChannelCases,
    0
  );
  assert.equal(
    report.comparatorIntegrity.counts.missingComparatorFutureFirstChannelCases,
    26909
  );
  assert.equal(report.scaleEvidence.invariantStatus, "PASS");
  assert.deepEqual(
    [...new Set(Object.values(report.scaleEvidence.invariantFailures))],
    [0]
  );
});

test("PSC01 report publishes every privacy-safe requested dimension", () => {
  const report = readJson(reportPath);
  assert.equal(report.privacy.minimumCaseCount, 30);
  assert.equal(report.privacy.minimumWorkCount, 20);
  assert.equal(report.aggregates.horizon.length, 6);
  assert.equal(report.aggregates.strictTimeBlocks.length, 39);
  assert.equal(report.aggregates.mechanisms.length, 30);
  assert.equal(report.aggregates.namedPlatforms.length, 30);
  assert.equal(report.aggregates.supportTiers.length, 12);
  assert.ok(report.aggregates.strictTimeBlocks.every(
    (cell) => cell.status === "REPORTED"
  ));
  const suppressedPlatforms = report.aggregates.namedPlatforms.filter(
    (cell) => cell.status === "SUPPRESSED_PRIVACY_THRESHOLD"
  );
  assert.equal(suppressedPlatforms.length, 3);
  assert.ok(suppressedPlatforms.every(
    (cell) => cell.platformId === "manbo" && cell.metrics === null
  ));
  for (const dimension of Object.values(report.aggregates)) {
    for (const cell of dimension.filter((value) => value.status === "REPORTED")) {
      assert.deepEqual(
        Object.keys(cell.metrics.stagePredictionToActualNetRatio),
        [
          "originVisibleEmpiricalParent",
          "globalPooledParent",
          "mechanism",
          "namedPlatform",
          "final"
        ]
      );
    }
  }
});

test("PSC01 oracle and normalized composition remain diagnostics", () => {
  const report = readJson(reportPath);
  assertClose(
    report.scaleEvidence.primaryConditionalAmountOracleRemovableErrorShare,
    0.7816409217984716
  );
  assertClose(
    report.scaleEvidence.primaryOccurrenceOracleRemovableErrorShare,
    0.0021014395632335064
  );
  assertClose(
    report.scaleEvidence.strictMechanismTimeRelativeErrorGain,
    0.052592066444463605
  );
  assert.equal(report.normalizedChannelComposition.length, 6);
  assert.ok(report.normalizedChannelComposition.every((cell) => (
    cell.diagnosticLabel === "POST_HOC_DIAGNOSTIC_NOT_MODEL_EVIDENCE"
    && cell.metrics.participatesInTraining === false
    && cell.metrics.participatesInSelection === false
    && cell.metrics.participatesInGate === false
    && cell.metrics.registeredAsCandidateScore === false
  )));
  assert.equal(
    report.psc02DesignDecision.status,
    "PSC02_DESIGN_PREREGISTRATION_SUPPORTED_NOT_AUTHORIZED"
  );
  assert.equal(report.psc02DesignDecision.implementationAuthorized, false);
  assert.equal(report.authorizationBoundaries.psc02Created, false);
  assert.equal(report.authorizationBoundaries.finalHoldoutOpened, false);
});

test("PSC01 audit stays frozen while current governance maps its successors", () => {
  const registry = readJson(registryPath);
  assert.equal(
    registry.currentRoles.latestStateIndex,
    "docs/analysis/m2-v2/M2-v2-current-state-index-v0.60.md"
  );
  const model = registry.models.find(
    (value) => value.stableModelId === "M2-CHAN-PSC01"
  );
  assert.ok(model);
  assert.deepEqual(model.successorIds, ["M2-CHAN-PSC02", "M2-CHAN-PSC03"]);
  assert.equal(
    model.rootCauseAudit.category,
    "ESTIMATOR_SCALE_SHRINKAGE_CONFIRMED_IMPLEMENTATION_CORRECT"
  );
  assert.ok(model.evidenceRefs.includes(
    "docs/analysis/m2-current/"
      + "M2-publishing-scale-channel-amount-scale-root-cause-audit-v0.1.json"
  ));
  assert.equal(
    registry.models.some((value) => /PSC02/u.test(value.stableModelId)),
    true
  );
  const identifiers = new Set(registry.nonModelIdentifiers.map(
    (value) => value.identifier
  ));
  assert.ok(identifiers.has(
    "M2_PSC01_AMOUNT_SCALE_ROOT_CAUSE_AUDIT_COMPLETE_"
      + "ESTIMATOR_SCALE_SHRINKAGE_CONFIRMED"
  ));
  assert.ok(identifiers.has(
    "PSC02_DESIGN_PREREGISTRATION_SUPPORTED_NOT_AUTHORIZED"
  ));
});

test("PSC01 public artifacts contain no private paths, digests, or identities", () => {
  const publicJson = readFileSync(reportPath, "utf8");
  const publicMarkdown = readFileSync(reportMarkdownPath, "utf8");
  for (const text of [publicJson, publicMarkdown]) {
    assert.doesNotMatch(text, /data[\\/]private-(?:input|output)/u);
    assert.doesNotMatch(text, /\bsha256\b/u);
    assert.doesNotMatch(text, /"standardWorkId"\s*:/u);
    assert.doesNotMatch(text, /"channelUid"\s*:/u);
    assert.doesNotMatch(text, /\bchn_[0-9a-f]{12,}\b/u);
  }
});

function readJson(url) {
  return JSON.parse(readFileSync(url, "utf8"));
}

function assertClose(actual, expected) {
  assert.ok(Math.abs(actual - expected) <= 1e-12);
}
