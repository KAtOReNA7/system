import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  LG01_HEAD_CASH_RESIDUAL_ARM_IDS,
  LG01_HEAD_CASH_RESIDUAL_EXPERIMENT_ID,
  LG01_HEAD_CASH_RESIDUAL_MODEL_ID,
  validateLg01HeadCashResidualContract
} from "../src/domain/m2Current/lg01HeadCashResidual.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const [
  contractBuffer,
  disclosureBuffer,
  frozenCham01Buffer,
  capabilityCatalogBuffer
] = await Promise.all([
  readFile(path.join(
    root,
    "config",
    "m2-current-lg01-head-cash-residual.v0.1.json"
  )),
  readFile(path.join(
    root,
    "docs",
    "analysis",
    "m2-current",
    "M2-core-legacy-horizon-amount-numeric-stability-disclosure-v0.1.json"
  )),
  readFile(path.join(
    root,
    "docs",
    "analysis",
    "m2-current",
    "M2-core-legacy-horizon-amount-development-v0.1.json"
  )),
  readFile(path.join(
    root,
    "config",
    "development-capability-catalog.v0.1.json"
  ))
]);

const contract = JSON.parse(contractBuffer);
const disclosure = JSON.parse(disclosureBuffer);
const capabilityCatalog = JSON.parse(capabilityCatalogBuffer);

test("HCRC01 contract is frozen before any outer outcome", () => {
  const validation = validateLg01HeadCashResidualContract(contract);

  assert.equal(validation.valid, true, validation.errors.join("\n"));
  assert.equal(
    contract.experiment.stableExperimentId,
    LG01_HEAD_CASH_RESIDUAL_EXPERIMENT_ID
  );
  assert.equal(contract.model.stableModelId, LG01_HEAD_CASH_RESIDUAL_MODEL_ID);
  assert.deepEqual(
    contract.arms.map((arm) => arm.armId),
    LG01_HEAD_CASH_RESIDUAL_ARM_IDS
  );
  assert.equal(contract.arms.some((arm) => arm.armId === "C4"), false);
  assert.deepEqual(contract.scope.horizonsMonths, [3]);
  assert.equal(contract.experiment.outerOutcomeRead, false);
  assert.equal(contract.experiment.firstCompleteOutcomeProduced, false);
  assert.equal(contract.frozenInputs.lg01RefitAllowed, false);
  assert.equal(contract.frozenInputs.cham01RefitAllowed, false);
  assert.equal(contract.execution.secondCompleteResultAllowed, false);
});

test("residual bounds, alpha selection and cash bands are origin-safe", () => {
  assert.equal(
    contract.residualBounding.trainingFoldPositiveBaseFloor.quantile,
    0.1
  );
  assert.equal(contract.residualBounding.clip.lowerQuantile, 0.05);
  assert.equal(contract.residualBounding.clip.upperQuantile, 0.95);
  assert.deepEqual(contract.alpha.candidateGrid, [0.25, 0.5, 0.75, 1]);
  assert.equal(contract.alpha.zeroIsCandidate, false);
  assert.match(
    contract.alpha.outerOriginSelectionSource,
    /STRICTLY_EARLIER_INNER_ORIGINS/u
  );
  assert.equal(contract.cashBands.futureActualUsed, false);
  assert.equal(
    contract.cashBands.boundaryWorkPolicy,
    "WHOLE_WORK_STAYS_IN_HIGHER_CASH_BAND"
  );
  assert.equal(contract.bandShrinkage.fixedMinimumWorkCountAllowed, false);
  assert.doesNotMatch(
    JSON.stringify(contract.bandShrinkage),
    /"minimumWorkCount"\s*:/u
  );
  assert.equal(contract.evaluation.bootstrap.iterations, 2000);
  assert.equal(contract.evaluation.bootstrap.wholeWorkCluster, true);
  assert.equal(contract.evaluation.rawAndSelectedReportedSeparately, true);
  assert.equal(contract.evaluation.fallbackMayReplaceRawMetrics, false);
});

test("CHAM01 disclosure preserves exact frozen bytes and five raw failures", () => {
  const frozenSha256 = createHash("sha256")
    .update(frozenCham01Buffer)
    .digest("hex");

  assert.equal(frozenSha256, disclosure.frozenSourceArtifact.sha256);
  assert.equal(
    frozenSha256,
    "963f51e5e324203d0f6b58fb19e532f94036af19683928e985e20b94640e5703"
  );
  assert.equal(disclosure.frozenSourceArtifact.modifiedByThisDisclosure, false);
  assert.equal(disclosure.frozenSourceArtifact.rerunPerformed, false);
  assert.deepEqual(
    disclosure.affectedCells.map((cell) => (
      `${cell.horizonMonths}/${cell.armId}`
    )),
    ["3/B1", "3/B2", "3/B3", "6/B1", "6/B2"]
  );
  assert.equal(
    disclosure.affectedCells.every(
      (cell) => (
        cell.evaluationFamily === "PRIMARY_ROLLING"
        && cell.populationId === "CORE90"
        && cell.caseCount === 396
        && cell.workCount === 155
        && cell.originCount === 5
        && Number.isFinite(cell.wape)
        && cell.maximumSingleWorkAbsoluteErrorShare > 0.9999999999999
        && cell.numericStatus
          === "NUMERIC_STABILITY_FAIL_FINITE_EXTREME_EXTRAPOLATION"
      )
    ),
    true
  );
  assert.equal(
    disclosure.causeAssessment.primaryCause,
    "OUT_OF_SUPPORT_TRANSFORMED_SPACE_EXTRAPOLATION_"
      + "AMPLIFIED_BY_UNBOUNDED_SIGNED_EXPM1"
  );
  assert.equal(disclosure.decisionImpact.existingPerformanceFailureChanged, false);
  assert.equal(
    disclosure.decisionImpact.performanceFailureAndNumericFailureRegisteredSeparately,
    true
  );
});

test("private capability blocks only on source authority", () => {
  const capability = capabilityCatalog.capabilities.find(
    (item) => item.id === "m2-lg01-head-cash-residual"
  );
  const classes = capability.requiredPrivateArtifacts.reduce(
    (result, artifact) => {
      result[artifact.artifactClass] ??= [];
      result[artifact.artifactClass].push(artifact.role);
      return result;
    },
    {}
  );

  assert.ok(classes.PRIVATE_SOURCE_AUTHORITY.length > 0);
  assert.ok(classes.PRIVATE_DERIVED_CACHE.length > 0);
  assert.ok(classes.PRIVATE_RUN_PROVENANCE.length > 0);
  assert.match(capability.recovery, /Missing caches or historical receipts never block/u);
  assert.match(capability.recovery, /receipts are never fabricated/u);
  assert.deepEqual(
    capability.canonicalValidationCommands,
    ["npm run doctor:capability -- m2-lg01-head-cash-residual"]
  );
});

test("scope exclusions cannot be silently widened", () => {
  for (const key of [
    "futureNewWorkAuthorized",
    "futureFirstObservedChannelAuthorized",
    "outsideCore90TailAuthorized",
    "channelAllocationAuthorized",
    "taxonomyAuthorized",
    "platformMechanismAuthorized",
    "sixMonthAuthorized",
    "twelveMonthAuthorized",
    "thirtySixMonthAuthorized"
  ]) {
    assert.equal(contract.scope[key], false, key);
  }
  for (const key of [
    "production",
    "provider",
    "database",
    "laterOrigin",
    "finalHoldout",
    "canary",
    "full160",
    "release",
    "m3Formal",
    "pullRequestMerge"
  ]) {
    assert.equal(contract.authorization[key], false, key);
  }
});
