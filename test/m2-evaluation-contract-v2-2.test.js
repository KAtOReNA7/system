import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  scoreConditionalAmountRowsV22,
  scoreOccurrenceRowsV22,
  scorePortfolioPairedV22,
  scoreRankingRowsV22,
  scoreReversalRowsV22,
  scoreTopRevenueAttributionV22,
  validateActivationBindingV22
} from "../src/domain/m2Current/evaluationV2.js";

test("v2.2 contract requires 2,000 resamples and remains non-production", () => {
  const contract = JSON.parse(fs.readFileSync(
    "config/m2-evaluation-contract.v2.2.json",
    "utf8"
  ));
  assert.equal(contract.schema, "m2.evaluation_contract.v2.2");
  assert.equal(contract.uncertainty.bootstrapIterations, 2000);
  assert.equal(
    contract.rankingMetrics.fixedRankContributionApproximationAllowed,
    false
  );
  assert.equal(
    contract.actualDefinitions.reversalRestated.stableId,
    "M2-ACTUAL-REVERSAL-RESTATEMENT-01"
  );
  assert.equal(
    contract.actualDefinitions.developmentModelableRestatement.stableId,
    "M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01"
  );
  assert.equal(
    contract.status,
    "M2_EVALUATION_V2_2_ACTIVE_FOR_DEVELOPMENT_WITH_DISCLOSED_RESIDUAL_EXCLUSION"
  );
  assert.equal(contract.activationAllowed, true);
  assert.ok(contract.explicitlyNotAuthorized.includes("training"));
  assert.ok(contract.explicitlyNotAuthorized.includes("prediction_modification"));
  assert.ok(contract.explicitlyNotAuthorized.includes("production_change"));
});

test("v2.2 distinguishes trapezoidal PR-AUC from Average Precision", () => {
  const score = scoreOccurrenceRowsV22([
    { actualPositive: 1, occurrenceProbability: 0.9 },
    { actualPositive: 0, occurrenceProbability: 0.8 },
    { actualPositive: 1, occurrenceProbability: 0.7 },
    { actualPositive: 0, occurrenceProbability: 0.1 }
  ]);
  assert.equal(score.prevalence, 0.5);
  assert.ok(Math.abs(score.prAucTrapezoidal - 0.7916666666666666) < 1e-12);
  assert.ok(Math.abs(score.averagePrecision - 0.8333333333333333) < 1e-12);
  assert.notEqual(score.prAucTrapezoidal, score.averagePrecision);
});

test("v2.2 scores conditional amount and reversal as separate capabilities", () => {
  const conditional = scoreConditionalAmountRowsV22([
    { actualPositiveAmount: 10, conditionalAmountPrediction: 12 },
    { actualPositiveAmount: 0, conditionalAmountPrediction: 1 }
  ]);
  assert.equal(conditional.status, "DEFINED");
  assert.equal(conditional.positiveCaseCount, 1);
  assert.equal(conditional.wape, 0.2);
  const missingActual = scoreReversalRowsV22([
    { reversalPointEstimate: 2 }
  ]);
  assert.equal(missingActual.status, "NOT_COMPUTABLE_REVERSAL_ACTUAL_MISSING");
  assert.equal(
    scoreConditionalAmountRowsV22([{
      actualPositiveAmount: null,
      conditionalAmountPrediction: 2
    }]).status,
    "NOT_COMPUTABLE_CONDITIONAL_AMOUNT_ACTUAL_MISSING"
  );
  assert.equal(
    scoreReversalRowsV22([{
      postingTimeReversalActual: null,
      reversalPointEstimate: 2
    }]).status,
    "NOT_COMPUTABLE_REVERSAL_ACTUAL_MISSING"
  );
  const reversal = scoreReversalRowsV22([
    { postingTimeReversalActual: 5, reversalPointEstimate: 4 },
    { postingTimeReversalActual: 0, reversalPointEstimate: 1 }
  ]);
  assert.equal(reversal.status, "DEFINED_AVAILABLE_OUTPUTS");
  assert.equal(reversal.amount.wape, 0.4);
  assert.equal(
    reversal.occurrence.status,
    "NOT_COMPUTABLE_REVERSAL_OCCURRENCE_PROBABILITY_MISSING"
  );
});

test("v2.2 full ranking bootstrap recomputes ranks and blocks false time independence", () => {
  const fallback = rankingRows();
  const candidate = fallback.map((row, index) => ({
    ...row,
    pointEstimate: row.actual + (index % 2 ? 0.1 : -0.1)
  }));
  const first = scoreRankingRowsV22(candidate, fallback, {
    bootstrapIterations: 2000,
    seed: 31,
    minimumCaseCount: 1,
    minimumWorkCount: 1
  });
  const second = scoreRankingRowsV22(candidate, fallback, {
    bootstrapIterations: 2000,
    seed: 31,
    minimumCaseCount: 1,
    minimumWorkCount: 1
  });
  assert.deepEqual(first, second);
  assert.equal(
    first.workClusterBootstrap.method,
    "full_standard_work_cluster_resample_recompute_within_cell_ranks"
  );
  assert.equal(
    first.workClusterBootstrap.approximationFromFixedRankContributions,
    false
  );
  assert.equal(first.workClusterBootstrap.iterations, 2000);
  assert.equal(
    first.timeIndependence.status,
    "NOT_COMPUTABLE_INSUFFICIENT_INDEPENDENT_TIME_BLOCKS"
  );
  assert.equal(
    first.status,
    "WORK_CLUSTER_RANKING_SIGNAL_TIME_INDEPENDENCE_UNCONFIRMED"
  );
  assert.throws(
    () => scoreRankingRowsV22(candidate, fallback, {
      bootstrapIterations: 1999,
      minimumCaseCount: 1,
      minimumWorkCount: 1
    }),
    /bootstrap_iterations_minimum/
  );
});

test("v2.2 portfolio reports resampling, leave-one-out, and time-block sensitivity", () => {
  const fallback = Array.from({ length: 12 }, (_, index) => ({
    caseKey: `P-${index}`,
    standardWorkId: "__PORTFOLIO__",
    origin: `2024-${String(index + 1).padStart(2, "0")}`,
    horizonMonths: 3,
    actual: 100 + index,
    pointEstimate: 90 + index
  }));
  const candidate = fallback.map((row) => ({
    ...row,
    pointEstimate: row.actual - 2
  }));
  const score = scorePortfolioPairedV22(candidate, fallback, {
    bootstrapIterations: 2000,
    seed: 7
  });
  assert.equal(score.status, "PORTFOLIO_SMALL_SAMPLE_SENSITIVITY_ONLY");
  assert.equal(score.byHorizon["3"].routerAuthorized, false);
  assert.equal(
    score.byHorizon["3"].originResamplingSensitivity.iterations,
    2000
  );
  assert.equal(
    score.byHorizon["3"].leaveOneOriginOut.estimates.length,
    12
  );
  assert.equal(
    score.byHorizon["3"].contiguousTimeBlockDiagnostic.status,
    "NOT_COMPUTABLE_INSUFFICIENT_INDEPENDENT_TIME_BLOCKS"
  );
});

test("v2.2 top attribution separates positive revenue, cash magnitude, and reversal", () => {
  const rows = Array.from({ length: 40 }, (_, index) => ({
    caseKey: `C-${index}`,
    standardWorkId: `W-${index}`,
    origin: "2024-01",
    horizonMonths: 3,
    actual: index === 0 ? -1000 : index + 1,
    pointEstimate: 0,
    reversalActualMagnitude: index === 0 ? 1000 : 0
  }));
  const score = scoreTopRevenueAttributionV22(rows);
  const positive = score.positiveRevenueAttribution
    .workLevelGlobal["0.01"].magnitudeShare;
  const absolute = score.absoluteCashMagnitudeAttribution
    .workLevelGlobal["0.01"].magnitudeShare;
  const reversal = score.reversalMagnitudeAttribution
    .workLevelGlobal["0.01"].magnitudeShare;
  assert.notEqual(positive, absolute);
  assert.equal(reversal, 1);
  assert.equal(score.status, "POSTHOC_FUTURE_ACTUAL_ATTRIBUTION_ONLY");
});

test("v2.2 activation binds content digests and current CI, not a permanent HEAD", () => {
  const digests = {
    contractArtifactSha256: "a".repeat(64),
    evaluatorImplementationSha256: "b".repeat(64),
    testContractSha256: "c".repeat(64),
    frozenInputArtifactSetSha256: "d".repeat(64)
  };
  const active = validateActivationBindingV22(digests, digests, {
    linux: "SUCCESS",
    windows: "SUCCESS",
    exactHead: "runtime-only"
  });
  assert.equal(active.status, "ACTIVE_FOR_DEVELOPMENT_EVALUATION_ONLY");
  assert.equal(active.exactHeadAuditOnly, true);
  assert.equal(active.descendantCommitMayInheritWhenDigestsUnchanged, true);
  const changed = validateActivationBindingV22(digests, {
    ...digests,
    testContractSha256: "e".repeat(64)
  }, {
    linux: "SUCCESS",
    windows: "SUCCESS"
  });
  assert.equal(changed.status, "DRAFT_V2_2_REVISION_INCOMPLETE");
  assert.deepEqual(changed.digestDifferences, ["testContractSha256"]);
});

test("v2.2 extends the canonical frozen runner without a parallel model runtime", () => {
  const source = fs.readFileSync(
    "scripts/m2-current/run_m2_evaluation_v2_frozen_rescore.mjs",
    "utf8"
  );
  assert.match(source, /--rescore-v2-2/);
  assert.match(source, /\["rev-parse", "--show-toplevel"\]/);
  assert.match(source, /sourceDigestMatchedAuthority/);
  assert.match(
    source,
    /FROZEN_PREDICTION_DEVELOPMENT_MODELABLE_LABEL_ONLY_RESCORE/
  );
  assert.match(source, /modelExecutionCount:\s*0/);
  assert.match(source, /predictionRowsModified:\s*0/);
  assert.match(source, /src\/domain\/m2Current\/reversalRestatement\.js/);
  assert.match(source, /export_m2_reversal_authority\.py/);
  assert.match(source, /test\/m2-reversal-restatement\.test\.js/);
  assert.match(source, /sha256TrackedSetV22/);
  assert.doesNotMatch(source, /from .*loader\.js/);
  assert.doesNotMatch(source, /from .*route\.js/);
  assert.doesNotMatch(source, /src\/server/);
});

test("historical v2.2 blocked reports remain unchanged and aggregate-only", () => {
  const authority = JSON.parse(fs.readFileSync(
    "docs/analysis/m2-current/M2-reversal-restatement-authority-audit-v1.json",
    "utf8"
  ));
  const impact = JSON.parse(fs.readFileSync(
    "docs/analysis/m2-current/M2-reversal-restatement-impact-v1.json",
    "utf8"
  ));
  const diagnostic = JSON.parse(fs.readFileSync(
    "docs/analysis/m2-current/M2-evaluation-v2.2-diagnostic-recheck.json",
    "utf8"
  ));
  for (const report of [authority, impact, diagnostic]) {
    assert.equal(
      report.status,
      "M2_EVALUATION_V2_2_BLOCKED_UNRESOLVED_REVERSAL"
    );
    const serialized = JSON.stringify(report);
    assert.doesNotMatch(serialized, /[A-Za-z]:[\\/]/);
    assert.doesNotMatch(serialized, /data[\\/]private-(?:input|output)/i);
  }
  assert.equal(
    impact.cash.unresolvedReversalResidual.exactMinorUnits,
    "-267769000000000330000"
  );
  assert.equal(impact.cash.conservationDifference.exactMinorUnits, "0");
  assert.equal(impact.deterministicExecution.byteIdentical, true);
  assert.equal(diagnostic.activation.allowed, false);
  assert.equal(diagnostic.authorizationCounters.modelExecutionCount, 0);
  assert.equal(diagnostic.authorizationCounters.trainingCount, 0);
  assert.equal(diagnostic.authorizationCounters.selectionCount, 0);
  assert.equal(diagnostic.authorizationCounters.predictionRowsModified, 0);
});

test("active v2.2 reports isolate the exact residual without blocking whole cases", () => {
  const fourViews = JSON.parse(fs.readFileSync(
    "docs/analysis/m2-current/M2-reversal-four-view-reconciliation-v1.json",
    "utf8"
  ));
  const rescore = JSON.parse(fs.readFileSync(
    "docs/analysis/m2-current/"
      + "M2-evaluation-v2.2-development-modelable-rescore-v1.json",
    "utf8"
  ));
  for (const report of [fourViews, rescore]) {
    assert.equal(
      report.status,
      "M2_EVALUATION_V2_2_ACTIVE_FOR_DEVELOPMENT_WITH_DISCLOSED_RESIDUAL_EXCLUSION"
    );
    const serialized = JSON.stringify(report);
    assert.doesNotMatch(serialized, /[A-Za-z]:[\\/]/);
    assert.doesNotMatch(serialized, /data[\\/]private-(?:input|output)/i);
  }
  assert.equal(
    fourViews.views.POSTING_TIME_ACCOUNTING_VIEW.reversalRowCount,
    143
  );
  assert.equal(
    fourViews.cash.excludedUnallocatedReversalResidual.exactMinorUnits,
    "-267769000000000330000"
  );
  assert.equal(
    fourViews.views.DEVELOPMENT_MODELABLE_RESTATEMENT_VIEW
      .exactIntegerReconciliation.differenceMinor,
    "0"
  );
  assert.equal(fourViews.affectedPopulation.blockedResidualCaseCount, 0);
  assert.equal(fourViews.affectedPopulation.restoredResidualCaseCount, 292);
  assert.equal(fourViews.frozenArtifacts.predictionRowsModified, 0);
  assert.equal(rescore.activation.allowed, true);
  assert.equal(rescore.activation.productionGateActive, false);
  assert.equal(rescore.activation.automationGateActive, false);
});

test("registry records active development-only v2.2 without changing model roles", () => {
  const registry = JSON.parse(fs.readFileSync(
    "config/m2-model-registry.v1.json",
    "utf8"
  ));
  assert.equal(
    registry.currentRoles.latestStateIndex,
    "docs/analysis/m2-v2/M2-v2-current-state-index-v0.31.md"
  );
  assert.equal(registry.currentRoles.operationalWorkFallback, "M2-WORK-OA03");
  assert.equal(registry.currentRoles.researchWorkBaseline, "M2-WORK-LG01");
  assert.equal(registry.currentRoles.portfolioReference, "M2-PORT-ETS01");
  assert.equal(registry.currentRoles.activeCandidate, null);
  assert.equal(registry.currentRoles.approvedForAutomation, null);
  assert.equal(
    registry.currentEvaluationContract.status,
    "M2_EVALUATION_V2_2_ACTIVE_FOR_DEVELOPMENT_WITH_DISCLOSED_RESIDUAL_EXCLUSION"
  );
  assert.equal(registry.currentEvaluationContract.activationAllowed, true);
  assert.ok(
    registry.actualDefinitionTransformations.some(
      (item) =>
        item.transformationId === "M2-ACTUAL-REVERSAL-RESTATEMENT-01"
    )
  );
  assert.ok(
    registry.actualDefinitionTransformations.some(
      (item) =>
        item.transformationId
          === "M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01"
    )
  );
  const metricDefinitionIds = new Set(
    registry.metricDefinitions.map((item) => item.metricDefinitionId)
  );
  for (const metricDefinitionId of [
    "M2-EVAL-V2.2-POINT",
    "M2-EVAL-V2.2-OCCURRENCE",
    "M2-EVAL-V2.2-CONDITIONAL-AMOUNT",
    "M2-EVAL-V2.2-REVERSAL",
    "M2-EVAL-V2.2-RANKING",
    "M2-EVAL-V2.2-PORTFOLIO",
    "M2-EVAL-V2.2-TOP-REVENUE"
  ]) {
    assert.ok(metricDefinitionIds.has(metricDefinitionId));
  }
  assert.equal(Object.hasOwn(registry, "generatedFromCommit"), false);
});

function rankingRows() {
  return Array.from({ length: 12 }, (_, index) => {
    const origin = index < 6 ? "2024-01" : "2024-02";
    const work = index % 6;
    return {
      caseKey: `W-${work}|${origin}|3`,
      standardWorkId: `W-${work}`,
      origin,
      horizonMonths: 3,
      actual: work + 1,
      pointEstimate: 6 - work
    };
  });
}
