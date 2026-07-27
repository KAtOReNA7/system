import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docs = path.join(root, "docs", "analysis", "m2-current");
const paths = {
  preregistration: path.join(
    docs,
    "M2-current-channel-generative-v0.2-preregistration.json"
  ),
  amendment: path.join(
    docs,
    "M2-current-channel-generative-v0.2-interpretation-amendment-v0.1.json"
  ),
  amendmentMarkdown: path.join(
    docs,
    "M2-current-channel-generative-v0.2-interpretation-amendment-v0.1.md"
  ),
  oracleContract: path.join(
    docs,
    "M2-current-channel-generative-v0.2-forecastability-diagnostic-contract-v0.1.json"
  ),
  oracleMarkdown: path.join(
    docs,
    "M2-current-channel-generative-v0.2-forecastability-diagnostic-contract-v0.1.md"
  )
};

const [
  preregistrationText,
  amendmentText,
  amendmentMarkdown,
  oracleText,
  oracleMarkdown
] = await Promise.all([
  readFile(paths.preregistration, "utf8"),
  readFile(paths.amendment, "utf8"),
  readFile(paths.amendmentMarkdown, "utf8"),
  readFile(paths.oracleContract, "utf8"),
  readFile(paths.oracleMarkdown, "utf8")
]);

const preregistration = JSON.parse(preregistrationText);
const amendment = JSON.parse(amendmentText);
const oracle = JSON.parse(oracleText);
const sha256 = (text) => createHash("sha256").update(text).digest("hex");

test("K0 amendment binds the exact frozen preregistration", () => {
  assert.equal(
    amendment.boundPreregistration.sha256,
    sha256(preregistrationText)
  );
  assert.equal(
    amendment.verifiedAnchor,
    "36125b451d00489cec900a8140d61f3a91904fed"
  );
  assert.equal(amendment.startHead, amendment.verifiedAnchor);
  assert.equal(
    preregistration.finalStatus,
    "GENERATIVE_V02_PREREGISTRATION_COMPLETE_IMPLEMENTATION_NOT_AUTHORIZED"
  );
  for (const field of [
    "candidateGraphUnchanged",
    "featureAllowlistUnchanged",
    "featureDenylistUnchanged",
    "modelFamiliesUnchanged",
    "hyperparameterGridUnchanged",
    "timeBasisUnchanged",
    "innerOuterSplitUnchanged",
    "seedsUnchanged",
    "gatesUnchanged",
    "phaseStopsUnchanged"
  ]) {
    assert.equal(amendment.boundPreregistration[field], true, field);
  }
});

test("K0 amendment changes interpretation only and reads no outcome", () => {
  assert.equal(amendment.amendmentScope.interpretationBoundaryOnly, true);
  assert.equal(amendment.amendmentScope.candidateAdded, false);
  assert.equal(amendment.amendmentScope.selectionRuleChanged, false);
  assert.equal(amendment.amendmentScope.outcomeRead, false);
  assert.equal(amendment.amendmentScope.trainingExecuted, false);
  assert.equal(amendment.amendmentScope.predictionExecuted, false);
  assert.equal(amendment.amendmentScope.privateEvaluationRowsRead, false);
  assert.equal(amendment.checkpoint.privateOutcomeMayBeRead, false);
  assert.equal(amendment.productionSurfaceChangeCount, 0);
});

test("failure inference is bounded to the current information and family", () => {
  assert.equal(
    amendment.inferenceBoundary.allowedFailureConclusion,
    "CURRENT_CASH_HISTORY_LOW_COMPLEXITY_GENERATIVE_CORE_NO_INCREMENTAL_VALUE"
  );
  assert.equal(
    amendment.inferenceBoundary.forbiddenExpandedConclusion,
    "FORECASTING_IS_THEORETICALLY_IMPOSSIBLE"
  );
  assert.equal(amendment.inferenceBoundary.independentHoldout, false);
  assert.match(
    amendment.inferenceBoundary.allowedFailureMeaning,
    /origin-visible cash history/u
  );
  assert.match(
    amendmentMarkdown,
    /不能证明真实会员池、广告流量、订单、净价、合同或因果机制/u
  );
});

test("three human-formula questions cannot be conflated", () => {
  assert.deepEqual(Object.keys(amendment.humanFormulaQuestions), [
    "A_baselineAnchor",
    "B_workAutomationQuality",
    "C_businessMechanismReality"
  ]);
  assert.equal(
    amendment.humanFormulaQuestions.C_businessMechanismReality.answerableNow,
    false
  );
  assert.deepEqual(
    amendment.humanFormulaQuestions.B_workAutomationQuality.cannotSubstitute,
    [
      "selected fallback",
      "portfolio error cancellation",
      "same-window overlap improvement"
    ]
  );
});

test("current authorization ends at G3 and the frozen diagnostic", () => {
  for (const field of [
    "G0",
    "G1",
    "G2",
    "G3",
    "forecastabilityOracleDiagnostic",
    "oneTimePrivateDevelopmentEvaluation"
  ]) {
    assert.equal(amendment.currentAuthorization[field], true, field);
  }
  for (const field of [
    "G4Platform",
    "G5Taxonomy",
    "G6Composition",
    "newModelFamily",
    "outcomeDrivenTuning",
    "finalHoldout",
    "laterOriginHoldout",
    "productionLoaderRouteApiChange",
    "exactV03Replacement",
    "release",
    "mergePr"
  ]) {
    assert.equal(amendment.currentAuthorization[field], false, field);
  }
});

test("oracle contract is diagnostic-only and runs after candidate freeze", () => {
  assert.equal(oracle.executionOrder.runOnlyAfterCandidateOutputsFrozen, true);
  for (const field of [
    "participatesInTraining",
    "participatesInInnerSelection",
    "participatesInOuterSelection",
    "participatesInGate",
    "participatesInRouting",
    "canAuthorizeG4G5G6",
    "outcomeReadAtContractCreation"
  ]) {
    assert.equal(oracle.executionOrder[field], false, field);
  }
  assert.equal(oracle.safeToRunBeforeCandidateFreeze, false);
  assert.equal(oracle.targetUseDiagnostic.nonMainMetricCannotDeclareCorePass, true);
});

test("oracle entry and occurrence use future truth only as upper bounds", () => {
  for (const node of [oracle.oracleEntry, oracle.oracleOccurrence]) {
    assert.equal(node.deployable, false);
    assert.equal(node.selectionEligible, false);
    assert.equal(node.futureInformationUsed, true);
  }
  assert.equal(oracle.oracleEntry.retrospectiveUpperBoundOnly, true);
  assert.equal(oracle.currentReachability.notACompleteBayesErrorFloor, true);
  assert.match(
    oracle.decomposition.overlapWarning,
    /may overlap/u
  );
});

test("public oracle output cannot expose row identities or claim a ceiling", () => {
  assert.equal(oracle.outputPolicy.publicAggregateOnly, true);
  assert.equal(oracle.outputPolicy.publicWorkId, false);
  assert.equal(oracle.outputPolicy.publicChannelUid, false);
  assert.equal(oracle.outputPolicy.publicTaxonomyValue, false);
  assert.equal(oracle.outputPolicy.privateRowsGitIgnoredCapabilityScoped, true);
  assert.deepEqual(oracle.forbiddenClaims, [
    "proven irreducible error",
    "Bayes error measured",
    "theoretical maximum established",
    "forecasting impossible"
  ]);
  assert.match(oracleMarkdown, /retrospective upper bound 可能重叠/u);
  assert.equal(
    oracle.finalStatus,
    "FORECASTABILITY_ORACLE_DIAGNOSTIC_CONTRACT_FROZEN_NO_OUTCOME_READ"
  );
  assert.equal(preregistration.sourceEvidence.newV02OutcomeRead, false);
});

test("K0 documents contain no candidate result payload", () => {
  for (const text of [amendmentText, oracleText]) {
    assert.doesNotMatch(text, /"candidateMetrics"\s*:/u);
    assert.doesNotMatch(text, /"primaryWape"\s*:/u);
    assert.doesNotMatch(text, /"strictWape"\s*:/u);
    assert.doesNotMatch(text, /"oracleEntryWape"\s*:/u);
  }
});
