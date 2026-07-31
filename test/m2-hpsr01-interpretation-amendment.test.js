import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const frozenJsonPath = path.join(
  root,
  "docs",
  "analysis",
  "m2-current",
  "M2-head-protected-segmented-router-retrospective-development-v0.1.json"
);
const frozenReportPath = path.join(
  root,
  "docs",
  "analysis",
  "m2-current",
  "M2-head-protected-segmented-router-retrospective-development-v0.1.md"
);
const amendmentPath = path.join(
  root,
  "docs",
  "analysis",
  "m2-current",
  "M2-head-protected-segmented-router-interpretation-amendment-v0.1.json"
);
const amendmentReportPath = path.join(
  root,
  "docs",
  "analysis",
  "m2-current",
  "M2-head-protected-segmented-router-interpretation-amendment-v0.1.md"
);
const attributionReportPath = path.join(
  root,
  "docs",
  "analysis",
  "m2-current",
  "M2-head-protected-tail-band-correction-cash-band-attribution-v0.1.md"
);

const frozenBytes = await readFile(frozenJsonPath);
const frozenReportBytes = await readFile(frozenReportPath);
const frozen = JSON.parse(frozenBytes.toString("utf8"));
const amendment = JSON.parse(await readFile(amendmentPath, "utf8"));
const amendmentReport = await readFile(amendmentReportPath, "utf8");
const attributionReport = await readFile(attributionReportPath, "utf8");

test("HPSR01 frozen result files remain byte-identical", () => {
  assert.equal(
    sha256(frozenBytes),
    "390a8d835bad7342acef29a3282e370ac2972714b4c6a12cbc000f15b9e3ba44"
  );
  assert.equal(
    sha256(frozenReportBytes),
    "014725ed18f5fd1a201cf11bda5a646a242071b67a2984aa70e69dc0f547164a"
  );
  assert.equal(
    frozen.status,
    "M2_HPSR01_RETROSPECTIVE_DEVELOPMENT_UNSUPPORTED_STOP_BEFORE_K2"
  );
});

test("contract decision and scientific interpretation stay separate", () => {
  assert.equal(
    amendment.originalContractDecision.status,
    frozen.status
  );
  assert.equal(
    amendment.originalContractDecision.observedAbsoluteBiasWorsening,
    frozen.retrospective.evaluation.metrics.absoluteBiasWorsening
  );
  assert.equal(amendment.originalContractDecision.guardrail, 0.02);
  assert.equal(
    amendment.originalContractDecision.calculationErrorFound,
    false
  );
  assert.equal(amendment.originalContractDecision.decisionPreserved, true);
  assert.equal(
    amendment.interpretationStatus,
    "M2_HPSR01_CONTRACT_UNSUPPORTED_SCIENTIFICALLY_INCONCLUSIVE"
  );
  assert.equal(
    amendment.scientificInterpretation.wholeDirectionProvenFailed,
    false
  );
  assert.equal(
    amendment.scientificInterpretation.independentEvidence,
    false
  );
  assert.equal(amendment.scientificInterpretation.originCount, 1);
  assert.equal(amendment.scientificInterpretation.workCount, 57);
  assert.equal(
    amendment.scientificInterpretation.r1WapeBetterThanR0,
    true
  );
  assert.equal(
    amendment.scientificInterpretation.bootstrapFva95.crossesZero,
    true
  );
  assert.equal(
    amendment.scientificInterpretation.crossTimeStabilityEstablished,
    false
  );
  assert.equal(
    amendment.scientificInterpretation.cashBandDirectionHomogeneous,
    false
  );
});

test("cash-band attribution deterministically recomputes public aggregates", () => {
  const { metrics, cashBands } = frozen.retrospective.evaluation;
  const expected = amendment.cashBandAttribution;
  for (const bandId of ["H50", "M30", "L20"]) {
    const source = cashBands[bandId];
    const target = expected.bands[bandId];
    assert.equal(target.workCount, source.workCount);
    assert.equal(target.actualCashShare, source.absoluteActualCashShare);
    assert.equal(
      target.r0AbsoluteError,
      source.r0.absoluteErrorTotal
    );
    assert.equal(
      target.r1AbsoluteError,
      source.r1.absoluteErrorTotal
    );
    assert.equal(
      target.r1MinusR0AbsoluteError,
      source.r1.absoluteErrorTotal - source.r0.absoluteErrorTotal
    );
  }
  assert.equal(
    expected.netR1MinusR0AbsoluteError,
    metrics.r1.absoluteErrorTotal - metrics.r0.absoluteErrorTotal
  );
  assert.equal(expected.bands.H50.r1MinusR0AbsoluteError, 0);
  assert.ok(expected.bands.M30.r1MinusR0AbsoluteError > 0);
  assert.ok(expected.bands.L20.r1MinusR0AbsoluteError < 0);
});

test("L20-only arithmetic is exact and explicitly not model evidence", () => {
  const { metrics, cashBands } = frozen.retrospective.evaluation;
  const diagnosticAbsoluteError =
    cashBands.H50.r0.absoluteErrorTotal
    + cashBands.M30.r0.absoluteErrorTotal
    + cashBands.L20.r1.absoluteErrorTotal;
  const diagnosticPredictionTotal =
    cashBands.H50.r0.predictionTotal
    + cashBands.M30.r0.predictionTotal
    + cashBands.L20.r1.predictionTotal;
  const diagnosticWape =
    diagnosticAbsoluteError / metrics.r0.absoluteActualTotal;
  const diagnosticFva =
    (metrics.r0.absoluteErrorTotal - diagnosticAbsoluteError)
      / metrics.r0.absoluteErrorTotal;
  const diagnosticSignedBias =
    (diagnosticPredictionTotal - metrics.r0.actualTotal)
      / metrics.r0.actualTotal;
  const diagnosticAbsoluteBiasWorsening =
    Math.abs(diagnosticSignedBias) - metrics.r0.absoluteBias;
  const diagnostic = amendment.postHocAggregateArithmetic;

  assert.equal(
    diagnostic.status,
    "POST_HOC_AGGREGATE_ARITHMETIC_NOT_MODEL_EVIDENCE"
  );
  assert.equal(
    diagnostic.diagnosticAbsoluteError,
    diagnosticAbsoluteError
  );
  assert.equal(diagnostic.diagnosticWape, diagnosticWape);
  assert.equal(diagnostic.diagnosticPairedFvaVsR0, diagnosticFva);
  assert.equal(diagnostic.diagnosticSignedBias, diagnosticSignedBias);
  assert.equal(
    diagnostic.diagnosticAbsoluteBiasWorseningVsR0,
    diagnosticAbsoluteBiasWorsening
  );
  assert.equal(diagnostic.modelPredictionRowsGenerated, false);
  assert.equal(diagnostic.modelEvaluationExecuted, false);
  assert.equal(diagnostic.bootstrapExecuted, false);
  assert.equal(diagnostic.independentEvidence, false);
  assert.equal(diagnostic.leaderboardEligible, false);
  assert.equal(diagnostic.contractPassClaimAllowed, false);
});

test("public amendment artifacts preserve privacy and execution boundaries", () => {
  const serialized = JSON.stringify(amendment);
  for (const content of [
    serialized,
    amendmentReport,
    attributionReport
  ]) {
    assert.doesNotMatch(content, /data[\\/]+private-(?:input|output)/iu);
    assert.doesNotMatch(content, /[A-Z]:[\\/]/u);
    assert.doesNotMatch(content, /standardWorkId|channelUid/u);
  }
  assert.equal(amendment.auditBoundary.hpsr01Rerun, false);
  assert.equal(amendment.auditBoundary.newPrivateActualRead, false);
  assert.equal(
    amendment.auditBoundary.newRealPredictionGenerated,
    false
  );
  assert.equal(
    amendment.auditBoundary.newModelEvaluationExecuted,
    false
  );
  assert.equal(amendment.auditBoundary.newBootstrapExecuted, false);
  assert.equal(amendment.auditBoundary.frozenPredictionModified, false);
  assert.equal(amendment.auditBoundary.frozenMetricModified, false);
  assert.equal(
    amendment.auditBoundary.prospectiveFinalHoldoutOpened,
    false
  );
  assert.equal(amendment.auditBoundary.productionChanged, false);
});

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
