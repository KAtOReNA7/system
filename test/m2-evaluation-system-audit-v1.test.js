import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  scoreM2CurrentEvaluationRows,
  scoreM2CurrentPointRows
} from "../src/domain/m2Current/metrics.js";
import {
  evaluateM2CurrentResolution
} from "../src/domain/m2Current/portfolio.js";

const registry = readJson("config/m2-model-registry.v1.json");
const audit = readJson(
  "docs/analysis/m2-current/M2-evaluation-system-audit-v1.json"
);
const auditMarkdown = readFileSync(
  "docs/analysis/m2-current/M2-evaluation-system-audit-v1.md",
  "utf8"
);
const proposal = readFileSync(
  "docs/analysis/m2-current/M2-evaluation-contract-v2-proposal.md",
  "utf8"
);
const state = readFileSync(
  "docs/analysis/m2-v2/M2-v2-current-state-index-v0.27.md",
  "utf8"
);

test("current point metrics use absolute actual cash denominator", () => {
  const result = scoreM2CurrentPointRows([
    { actual: 100, pointEstimate: 80 },
    { actual: -20, pointEstimate: -10 },
    { actual: 0, pointEstimate: 5 }
  ]);

  assert.equal(result.wape, 35 / 120);
  assert.equal(result.signedBias, -5 / 120);
  assert.equal(result.zeroImputationUsed, false);
  assert.throws(
    () => scoreM2CurrentPointRows([{ actual: 0, pointEstimate: 1 }]),
    /actual_denominator_zero/u
  );
});

test("generic positiveAmount is documented as final-point subset, not conditional output", () => {
  const result = scoreM2CurrentEvaluationRows([{
    actual: 100,
    pointEstimate: 70,
    occurrenceProbability: 1,
    conditionalAmountPrediction: 100
  }]);

  assert.equal(result.positiveAmount.wape, 0.3);
  assert.ok(
    audit.implementationFindings.some(
      (item) => item.findingId === "EVAL-IMP-003"
        && item.status === "MISLABELED_PARTIAL_CAPABILITY"
    )
  );
});

test("work and portfolio resolution expose aggregation cancellation", () => {
  const result = evaluateM2CurrentResolution([
    forecastRow("SYN-A", 50),
    forecastRow("SYN-B", 150)
  ], {
    bootstrapIterations: 10,
    bootstrapSeed: 20260728
  });

  assert.equal(result.workCase.wape, 0.5);
  assert.equal(result.portfolioOriginHorizon.wape, 0);
  assert.equal(
    audit.capabilityMatrix.find(
      (item) => item.capabilityId === "portfolio_budget"
    ).mayAllocateBackToWorks,
    false
  );
});

test("historical audit keeps its snapshot while the registry advances", () => {
  const evaluationCount = registry.models.reduce(
    (sum, model) => sum + (model.evaluations?.length ?? 0),
    0
  );
  const registryGroups = registry.comparabilityGroups
    .map((group) => group.comparableGroupId)
    .sort();
  const auditGroups = audit.comparabilityFindings.groupSummaries
    .map((group) => group.comparableGroupId)
    .sort();

  assert.equal(evaluationCount, 102);
  assert.equal(audit.registryCoverage.evaluationCount, 45);
  assert.ok(evaluationCount > audit.registryCoverage.evaluationCount);
  assert.equal(
    auditGroups.every((groupId) => registryGroups.includes(groupId)),
    true
  );
  assert.equal(audit.registryCoverage.independentEvidenceEvaluationCount, 0);
});

test("historical audit experiment snapshot remains a subset as the registry advances", () => {
  const registryExperiments = registry.experiments
    .map((experiment) => experiment.experimentId)
    .sort();
  const auditExperiments = audit.experimentClassification
    .map((experiment) => experiment.experimentId)
    .sort();

  assert.equal(
    auditExperiments.every(
      (experimentId) => registryExperiments.includes(experimentId)
    ),
    true
  );
  assert.equal(
    registryExperiments.includes(
      "M2-EXP-CORE-LEGACY-HORIZON-ROUTER-01"
    ),
    true
  );
  assert.equal(
    auditExperiments.includes(
      "M2-EXP-CORE-LEGACY-HORIZON-ROUTER-01"
    ),
    false
  );
  assert.ok(audit.metricInventory.length >= 10);
  assert.ok(
    audit.capabilityMatrix.some(
      (item) => item.capabilityId === "ranking_allocation"
        && item.currentCoverage === "ABSENT"
    )
  );
});

test("audit refuses cross-group winner and preserves current roles", () => {
  assert.equal(audit.overallBestModel.supported, false);
  assert.equal(audit.overallBestModel.modelId, null);
  assert.equal(
    audit.currentRoles.operationalWorkFallback,
    registry.currentRoles.operationalWorkFallback
  );
  assert.equal(
    audit.currentRoles.researchWorkBaseline,
    registry.currentRoles.researchWorkBaseline
  );
  assert.equal(audit.currentRoles.activeCandidate, null);
  assert.equal(audit.currentRoles.approvedForAutomation, null);
  assert.ok(
    audit.comparabilityFindings.groupSummaries.every(
      (group) => group.modelIds.every(
        (modelId) => registry.models.some(
          (model) => model.stableModelId === modelId
        )
      )
    )
  );
});

test("evaluation contract remains a proposal and public aggregates are not overclaimed", () => {
  assert.equal(
    audit.proposedEvaluationContract.activationStatus,
    "DRAFT_NOT_ACTIVE"
  );
  assert.match(
    auditMarkdown,
    /NOT_COMPUTABLE_FROM_PUBLIC_AGGREGATES/u
  );
  assert.match(proposal, /DRAFT_NOT_ACTIVE/u);
  assert.match(proposal, /不得把组合预测分配回作品/u);
  assert.doesNotMatch(proposal, /已启用评价合同/u);
});

test("historical audit state records zero execution and registry may advance", () => {
  assert.equal(
    registry.currentRoles.latestStateIndex,
    "docs/analysis/m2-v2/M2-v2-current-state-index-v0.46.md"
  );
  assert.equal(audit.executionBoundary.modelExecutionCount, 0);
  assert.equal(audit.executionBoundary.modelTrainingCount, 0);
  assert.equal(audit.executionBoundary.privateEvaluationRowReadCount, 0);
  assert.equal(audit.executionBoundary.productionChangeCount, 0);
  assert.match(
    state,
    /M2_EVALUATION_SYSTEM_AUDIT_COMPLETE_NO_METRIC_CHANGE/u
  );
});

function forecastRow(standardWorkId, pointEstimate) {
  return {
    standardWorkId,
    origin: "2022-01",
    horizonMonths: 3,
    actual: 100,
    pointEstimate
  };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}
