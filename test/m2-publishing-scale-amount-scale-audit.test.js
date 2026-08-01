import assert from "node:assert/strict";
import test from "node:test";

import {
  accumulateM2Psc01EvaluationRow,
  createM2Psc01AmountAuditAccumulator,
  finalizeM2Psc01AmountAudit
} from "../src/domain/m2Current/publishingScaleAmountScaleAudit.js";

test("PSC01 amount audit traces scale without exposing private identities", () => {
  const accumulator = createM2Psc01AmountAuditAccumulator({
    namedPlatforms: [{
      platformId: "platform_a",
      displayNameZh: "合成平台甲",
      channelUid: "channel_a"
    }]
  });
  for (let workIndex = 0; workIndex < 30; workIndex += 1) {
    for (const channelUid of ["channel_a", "channel_b"]) {
      accumulateM2Psc01EvaluationRow(
        accumulator,
        syntheticRow({ workIndex, channelUid })
      );
    }
  }
  const result = finalizeM2Psc01AmountAudit(accumulator);
  assert.equal(result.public.invariantStatus, "PASS");
  assert.equal(result.public.rowCount, 60);
  assert.equal(result.public.channelCaseCount, 60);
  assert.equal(result.public.workCaseCount, 30);
  const horizon = result.public.aggregates.horizon[0];
  assert.equal(horizon.status, "REPORTED");
  assert.equal(horizon.caseCount, 30);
  assert.equal(horizon.workCount, 30);
  assert.equal(
    horizon.metrics.stages.originVisibleEmpiricalParent
      .predictionToActualNetRatio,
    0.05
  );
  assert.equal(horizon.metrics.stages.final.predictionToActualNetRatio, 0.1);
  const composition = result.public.normalizedComposition[0];
  assert.equal(
    composition.diagnosticLabel,
    "POST_HOC_DIAGNOSTIC_NOT_MODEL_EVIDENCE"
  );
  assert.equal(composition.metrics.actualDerivedGlobalScalar, 10);
  assert.equal(composition.metrics.globallyNormalizedWorkChannelWape, 0);
  assert.equal(
    composition.metrics.perWorkActualDerivedScalarWorkChannelWape,
    0
  );
  const publicText = JSON.stringify(result.public);
  assert.doesNotMatch(publicText, /synthetic-work/u);
  assert.doesNotMatch(publicText, /channel_[ab]/u);
});

test("PSC01 amount audit fails a duplicated occurrence multiplication", () => {
  const accumulator = createM2Psc01AmountAuditAccumulator({
    namedPlatforms: []
  });
  const row = syntheticRow({ workIndex: 0, channelUid: "channel_b" });
  row.positivePoint = 1;
  row.pointEstimate = 1;
  accumulateM2Psc01EvaluationRow(accumulator, row);
  const result = finalizeM2Psc01AmountAudit(accumulator);
  assert.equal(result.public.invariantStatus, "FAIL");
  assert.equal(result.public.invariantFailures.occurrenceAmountProduct, 1);
});

function syntheticRow({ workIndex, channelUid }) {
  const layer = (positivePoint, occurrenceProbability) => ({
    positivePoint,
    occurrenceProbability,
    conditionalPositiveAmount: positivePoint / occurrenceProbability
  });
  return {
    schema:
      "m2.current.publishing_scale_channel_evaluation_private_row.v0.2",
    modelId: "M2-CHAN-PSC01",
    experimentArmId: "M2-EXP-PUBLISHING-SCALE-CHANNEL-01/CORE",
    candidateId: "M2-CHAN-PSC01-RAW",
    actualDefinitionId:
      "M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01",
    evaluationFamily: "primary",
    standardWorkId: `synthetic-work-${workIndex}`,
    channelUid,
    mechanism: "membership",
    origin: "2025-01",
    futureMonthIndex: 1,
    includedHorizons: [3],
    observedAtOrigin: true,
    actualPositive: 100,
    actualReversal: 0,
    actual: 100,
    postingTimeActualPositive: 100,
    postingTimeActualReversal: 0,
    postingTimeActual: 100,
    positivePoint: 10,
    pointEstimate: 10,
    occurrenceProbability: 0.5,
    conditionalPositiveAmount: 20,
    selectedNodeId: "membership",
    supportTier: "SHRUNK_FIT",
    layerPredictions: {
      originVisibleEmpiricalParent: layer(5, 0.5),
      globalPooledParent: layer(6, 0.5),
      mechanism: layer(8, 0.5),
      namedPlatform: layer(10, 0.5)
    },
    occurrenceShrinkageWeight: 0.8,
    conditionalAmountShrinkageWeight: 0.4,
    fallbackReason: null,
    taxonomyFeatureUsed: false,
    authorizationBackfillUsed: false,
    rawCandidatePreserved: true,
    fallbackOverwroteRaw: false
  };
}
