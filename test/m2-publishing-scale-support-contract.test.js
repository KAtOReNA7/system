import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const paths = {
  support: path.join(
    root,
    "config",
    "m2-publishing-scale-statistical-support.v1.json",
  ),
  learning: path.join(
    root,
    "docs",
    "analysis",
    "m2-current",
    "M2-publishing-scale-training-side-learning-study-v1.json",
  ),
  contract: path.join(
    root,
    "docs",
    "analysis",
    "m2-current",
    "M2-publishing-scale-statistical-support-contract-v1.json",
  ),
  contractMarkdown: path.join(
    root,
    "docs",
    "analysis",
    "m2-current",
    "M2-publishing-scale-statistical-support-contract-v1.md",
  ),
  prd: path.join(
    root,
    "docs",
    "prd",
    "m2-v2",
    "M2-forecast-intelligence-v2-prd-v0.2.md",
  ),
  prdAmendment: path.join(
    root,
    "docs",
    "prd",
    "m2-v2",
    "M2-forecast-intelligence-v2-publishing-scale-amendment-v0.1.json",
  ),
  evaluation: path.join(
    root,
    "config",
    "m2-evaluation-contract.v2.2.json",
  ),
  historical: path.join(
    root,
    "config",
    "m2-current-channel-generative.v0.2.json",
  ),
  historicalPreregistration: path.join(
    root,
    "docs",
    "analysis",
    "m2-current",
    "M2-current-channel-generative-v0.2-preregistration.json",
  ),
  studyScript: path.join(
    root,
    "scripts",
    "m2-current",
    "study_publishing_scale_support.py",
  ),
};

const texts = Object.fromEntries(
  await Promise.all(
    Object.entries(paths).map(async ([key, filePath]) => [
      key,
      await readFile(filePath, "utf8"),
    ]),
  ),
);
const support = JSON.parse(texts.support);
const learning = JSON.parse(texts.learning);
const contract = JSON.parse(texts.contract);
const prdAmendment = JSON.parse(texts.prdAmendment);
const evaluation = JSON.parse(texts.evaluation);
const historical = JSON.parse(texts.historical);
const historicalPreregistration = JSON.parse(
  texts.historicalPreregistration,
);

test("K7B freezes four support tiers without a universal work count", () => {
  assert.equal(
    support.status,
    "FROZEN_BEFORE_NEW_CANDIDATE_OUTER_OUTCOME",
  );
  assert.deepEqual(support.supportTiers, [
    "DIRECT_FIT",
    "SHRUNK_FIT",
    "POOLED_PARENT",
    "REPORT_ONLY",
  ]);
  assert.equal(
    support.currentFreezeDecision.universalFixedDistinctWorkThreshold,
    null,
  );
  assert.equal(support.currentFreezeDecision.directFitNodeCount, 0);
  assert.equal(
    support.currentFreezeDecision.newCandidateOuterOutcomeMayNowBeRead,
    false,
  );
  assert.equal(contract.fixedUniversalWorkThreshold, null);
});

test("component shrinkage uses effective works and never monthly row count", () => {
  assert.match(
    support.continuousShrinkage.occurrenceWeight,
    /occurrenceClassEffectiveWorkCount/u,
  );
  assert.match(
    support.continuousShrinkage.conditionalAmountWeight,
    /cashEffectiveWorkCount/u,
  );
  assert.equal(
    support.continuousShrinkage.monthlyRowsUsedInNumerator,
    false,
  );
  assert.equal(
    support.supportMetrics.monthlyRows,
    "descriptive only; never an independent-work proxy",
  );
});

test("training-side parameter freeze agrees with public learning evidence", () => {
  const pairs = {
    globalPooledParent: "globalPooledParent",
    membership: "membership",
    advertising: "advertising",
    transactional: "transactional",
  };
  for (const [supportKey, learningKey] of Object.entries(pairs)) {
    const frozen = support.parameterFreeze.nodes[supportKey];
    const studied = learning.parameterCalibration[learningKey];
    assert.equal(frozen.basisProfile, studied.basisProfile, supportKey);
    assert.equal(frozen.occurrenceL2, studied.occurrenceL2, supportKey);
    assert.equal(
      frozen.conditionalAmountL2,
      studied.conditionalAmountL2,
      supportKey,
    );
    assert.equal(
      frozen.effectiveParameterCount,
      studied.effectiveParameterCount,
      supportKey,
    );
  }
  assert.deepEqual(learning.method.l2Grid, [1, 3, 10, 30, 100, 300]);
  assert.equal(learning.method.newCandidateOuterOutcomeRead, false);
  assert.equal(learning.method.sealedHoldoutRead, false);
});

test("named platforms and current-only taxonomy have explicit tiers", () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(
      support.parameterFreeze.namedPlatforms
    ).map(([name, value]) => [name, value.frozenTier])),
    {
    喜马拉雅: "SHRUNK_FIT",
    微信读书: "SHRUNK_FIT",
    番茄畅听: "SHRUNK_FIT",
    猫耳: "POOLED_PARENT",
    克拉漫播: "POOLED_PARENT",
    }
  );
  for (const value of Object.values(
    support.parameterFreeze.namedPlatforms
  )) {
    assert.equal(typeof value.basisMechanism, "string");
    assert.equal(typeof value.basisProfile, "string");
    assert.ok(value.effectiveParameterCount > 0);
  }
  assert.equal(support.parameterFreeze.taxonomy, "REPORT_ONLY");
  assert.equal(support.parameterFreeze.authorization, "REPORT_ONLY");
  assert.equal(
    learning.namedPlatformLearningCurveMaximumStudiedSupport.微信读书
      .minimumObservedStableDistinctWorks,
    32,
  );
  assert.equal(
    learning.namedPlatformLearningCurveMaximumStudiedSupport.微信读书
      .notStandalonePromotionAuthority,
    true,
  );
});

test("PRD and evaluation contract bind the publishing-scale support contract", () => {
  assert.equal(
    prdAmendment.canonicalSupportContract,
    "config/m2-publishing-scale-statistical-support.v1.json",
  );
  assert.match(texts.prd, /DIRECT_FIT/u);
  assert.match(texts.prd, /current-only assignment/u);
  assert.equal(
    evaluation.forwardStatisticalSupportContract.contractId,
    "M2-PUBLISHING-SCALE-SUPPORT-01",
  );
  assert.equal(
    evaluation.forwardStatisticalSupportContract
      .newCandidateOuterOutcomeMaySelectSupportThreshold,
    false,
  );
});

test("historical v0.2 eligibility remains readable and unchanged", () => {
  assert.equal(historical.eligibility.minimumDistinctTrainingWorks, 50);
  assert.equal(
    historicalPreregistration.fallbackPolicy.eligibility.platform
      .minimumDistinctTrainingWorks,
    100,
  );
  assert.equal(
    historicalPreregistration.fallbackPolicy.eligibility.taxonomy
      .minimumDistinctTrainingWorks,
    100,
  );
  assert.equal(
    contract.governance.historical50And100RulesPreservedForHistoricalVerifier,
    true,
  );
});

test("public K7B artifacts and study code preserve privacy and outcome blindness", () => {
  assert.deepEqual(learning.publicPrivacy, {
    aggregateOnly: true,
    containsWorkIdentity: false,
    containsCategoryValues: false,
    containsPrivatePath: false,
    containsPrivateArtifactDigest: false,
  });
  assert.doesNotMatch(texts.learning, /standardWorkId|data[\\/]+private-/u);
  assert.doesNotMatch(texts.learning, /\b[a-f0-9]{64}\b/u);
  assert.match(texts.studyScript, /complete\s+standard-work clusters/u);
  assert.match(texts.studyScript, /newCandidateOuterOutcomeRead/u);
  assert.doesNotMatch(
    texts.studyScript,
    /channel-generative-g1-development-v0\.1/u,
  );
  assert.match(
    texts.contractMarkdown,
    /开发资格，不是晋升资格/u,
  );
});
