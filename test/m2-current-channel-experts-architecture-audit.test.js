import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const auditPath = path.join(
  root,
  "docs",
  "analysis",
  "m2-current",
  "M2-current-channel-experts-architecture-failure-audit-v0.1.json"
);
const reportPath = auditPath.replace(/\.json$/u, ".md");
const [auditText, report] = await Promise.all([
  readFile(auditPath, "utf8"),
  readFile(reportPath, "utf8")
]);
const audit = JSON.parse(auditText);

test("channel expert architecture audit preserves frozen receipts and decisions", () => {
  assert.equal(
    audit.architectureConclusion,
    "CHANNEL_EXPERT_V01_IMPLEMENTATION_MISMATCH_CONFIRMED"
  );
  assert.equal(audit.nextStepDecision, "PREREGISTER_GENERATIVE_V02");
  assert.equal(
    audit.frozenV01Decision,
    "CHANNEL_EXPERT_DEVELOPMENT_FAIL_KEEP_LEARNEDGLOBAL_AND_EXACT_V0_3"
  );
  assert.equal(
    audit.sourceReceipts.evaluationSha256,
    "aee288069e2cee728d26797df24c48f186e9083c49235f9e4c77ccc0e74922fd"
  );
  assert.equal(audit.sourceReceipts.evaluationRowCount, 395904);
  assert.equal(audit.sourceReceipts.workEvaluationRowCount, 86359);
  assert.equal(audit.sourceReceipts.channelEvaluationRowCount, 309545);
  assert.deepEqual(audit.sourceReceipts.rawAblationsPreserved, [
    "A0",
    "A1",
    "A2",
    "A3",
    "A4",
    "A5",
    "A6"
  ]);
});

test("audit identifies multiplier architecture and the first failing stage", () => {
  assert.equal(audit.equations.independentChannelForecasts, false);
  assert.equal(
    audit.executiveConclusion.v01TestedIndependentChannelTemporalGenerators,
    false
  );
  assert.equal(audit.taxonomyAssessment.usedAsGenerativePrior, false);
  assert.equal(
    audit.executiveConclusion.firstFailingAblation.stage,
    "A1_to_A2"
  );
  assert.equal(
    audit.executiveConclusion.dominantPrimaryCause.stage,
    "A4_to_A5"
  );
  assert.equal(
    audit.executiveConclusion.dominantStrictCause.stage,
    "A2_to_A3"
  );
  assert.equal(
    audit.quantitativeAttribution.work.primary.stageTransitions.A1_to_A2
      .absoluteErrorDelta > 0,
    true
  );
  assert.equal(
    audit.quantitativeAttribution.work.strict_rolling.stageTransitions.A1_to_A2
      .absoluteErrorDelta > 0,
    true
  );
});

test("audit authorizes preregistration only and keeps runtime boundaries closed", () => {
  assert.equal(
    audit.generativeV02PreregistrationRequirements.preregistrationOnly,
    true
  );
  assert.equal(
    audit.generativeV02PreregistrationRequirements.implementationAuthorized,
    false
  );
  assert.equal(
    audit.generativeV02PreregistrationRequirements.trainingAuthorized,
    false
  );
  assert.equal(audit.invariants.modelTrainingAuthorized, false);
  assert.equal(audit.invariants.candidateSelectionAuthorized, false);
  assert.equal(audit.invariants.productionRouteModified, false);
  assert.equal(audit.invariants.exactV03FallbackRetained, true);
  assert.equal(audit.invariants.finalHoldoutOpened, false);
  assert.equal(audit.invariants.releaseAuthorized, false);
});

test("public architecture audit excludes row identities and private taxonomy values", () => {
  assert.equal(audit.publicPrivateBoundary.publicContainsWorkIds, false);
  assert.equal(audit.publicPrivateBoundary.publicContainsChannelUids, false);
  assert.equal(audit.publicPrivateBoundary.publicContainsCategoryValues, false);
  assert.doesNotMatch(auditText, /"standardWorkId"\s*:/u);
  assert.doesNotMatch(auditText, /"channelUid"\s*:/u);
  assert.doesNotMatch(auditText, /"intrinsicCategory"\s*:/u);
});

test("reader-facing report states the bounded conclusion and frozen fallback", () => {
  assert.match(
    report,
    /CHANNEL_EXPERT_V01_IMPLEMENTATION_MISMATCH_CONFIRMED/u
  );
  assert.match(report, /PREREGISTER_GENERATIVE_V02/u);
  assert.match(
    report,
    /CHANNEL_EXPERT_DEVELOPMENT_FAIL_KEEP_LEARNEDGLOBAL_AND_EXACT_V0_3/u
  );
  assert.match(report, /不授权实现、训练、\s*调参或选择 v0\.2/u);
});
