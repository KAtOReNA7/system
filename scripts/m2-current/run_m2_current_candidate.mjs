import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  mkdir,
  readFile,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { pairedWorkOriginBootstrap } from "../../src/domain/m2Current/bootstrap.js";
import {
  attachM2CurrentScaleAndOccurrence,
  buildM2CurrentAutomatedBaselineEvaluation,
  buildM2CurrentHistoryRegimeChallenger,
  buildM2CurrentHistoryIndex,
  buildM2CurrentRollingBaselineChampion,
  getM2CurrentHistorySeries
} from "../../src/domain/m2Current/baselines.js";
import {
  buildM2CurrentOccurrenceAmountCandidate,
  buildM2CurrentReliableCandidate
} from "../../src/domain/m2Current/candidate.js";
import { compareM2CurrentCandidateToB4 } from "../../src/domain/m2Current/comparator.js";
import { buildM2CurrentContract } from "../../src/domain/m2Current/contract.js";
import {
  buildM2CurrentDenseOriginSchedule,
  partitionM2CurrentLabels
} from "../../src/domain/m2Current/dataContract.js";
import {
  buildM2CurrentConstrainedEnsemble,
  buildM2CurrentGlobalModelBakeoff
} from "../../src/domain/m2Current/evaluator.js";
import {
  reconcileM2CurrentSegmentHierarchy
} from "../../src/domain/m2Current/hierarchy.js";
import {
  scoreM2CurrentEvaluationRows,
  scoreM2CurrentEvaluationSlices,
  scoreM2CurrentProbabilisticRows,
  scoreM2CurrentSlices
} from "../../src/domain/m2Current/metrics.js";
import {
  attachM2CurrentConformalQuantiles
} from "../../src/domain/m2Current/probabilistic.js";
import {
  buildM2CurrentPortfolioReconstruction,
  evaluateM2CurrentResolution,
  summarizeM2CurrentCashConcentration
} from "../../src/domain/m2Current/portfolio.js";
import {
  evaluateM2CurrentAutomationPolicy
} from "../../src/domain/m2Current/automation.js";
import {
  assertM2CurrentModelCaseRoute,
  assertM2CurrentSalesShareModelCaseRoute
} from "../../src/domain/m2Current/route.js";
import {
  loadM2CurrentConfigSync
} from "./load_m2_current_config.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const config = JSON.parse(
  await readFile(path.join(root, "config/m2-current.v0.3.json"), "utf8")
);
const nextConfig = JSON.parse(
  await readFile(path.join(root, "config/m2-current.v0.4.json"), "utf8")
);
const resolutionConfig = JSON.parse(
  await readFile(path.join(root, "config/m2-current.v0.5.json"), "utf8")
);
const salesShareConfig = loadM2CurrentConfigSync(
  root,
  "config/m2-current.v0.6.json"
);
const previousConfig = JSON.parse(
  await readFile(path.join(root, "config/m2-current.v0.2.json"), "utf8")
);
const contract = buildM2CurrentContract(config);
const nextContract = buildM2CurrentContract(nextConfig);
const resolutionContract = buildM2CurrentContract(resolutionConfig);
const salesShareContract = buildM2CurrentContract(salesShareConfig);
const previousContract = buildM2CurrentContract(previousConfig);
const populationReport = JSON.parse(
  await readFile(path.join(root, config.publicSources.population), "utf8")
);
if (
  !contract.authorizations.modelTraining
  || !nextContract.authorizations.modelTraining
  || !resolutionContract.authorizations.modelTraining
  || !salesShareContract.authorizations.modelTraining
) {
  throw new Error("m2_current_candidate_development_not_authorized");
}
if (
  nextContract.authorizations.newCandidateFamilyDevelopment
  || contract.authorizations.holdout
  || contract.authorizations.release
  || nextContract.authorizations.holdout
  || nextContract.authorizations.release
  || resolutionContract.authorizations.newCandidateFamilyDevelopment
  || resolutionContract.authorizations.holdout
  || resolutionContract.authorizations.release
  || salesShareContract.authorizations.newCandidateFamilyDevelopment
  || salesShareContract.authorizations.holdout
  || salesShareContract.authorizations.release
) {
  throw new Error("m2_current_candidate_forbidden_authorization_scope");
}

const comparatorPath = path.join(
  root,
  "data/private-output/m2-formal-cash-comparator-v1",
  "M2-formal-cash-comparator-cases-private-v1.ndjson"
);
const comparatorManifestPath = path.join(
  root,
  "data/private-output/m2-formal-cash-comparator-v1",
  "M2-formal-cash-comparator-manifest-private-v1.json"
);
const segmentPath = path.join(
  root,
  "data/private-output/m2-c2-v1",
  "M2-C2-development-cases-private-v1.ndjson"
);
const segmentManifestPath = path.join(
  root,
  "data/private-output/m2-c2-v1",
  "M2-C2-development-manifest-private-v1.json"
);
const payloadPath = path.join(
  root,
  "data/private-output/m2-formal-execution",
  "m2-formal-execution-payload-v1.json"
);
const privateDirectory = path.join(
  root,
  "data/private-output/m2-current-quality"
);
const privateRowsPath = path.join(
  privateDirectory,
  "M2-current-occurrence-amount-candidate-cases-private-v0.3.ndjson"
);
const privateManifestPath = path.join(
  privateDirectory,
  "M2-current-occurrence-amount-candidate-manifest-private-v0.3.json"
);
const privateReasonLedgerPath = path.join(
  privateDirectory,
  "M2-current-model-eligibility-reasons-private-v0.2.ndjson"
);
const publicPath = path.join(root, config.publicSources.candidate);
const publicAutomatedEvaluationPath = path.join(
  root,
  config.publicSources.automatedEvaluation
);

const comparatorText = await readFile(comparatorPath, "utf8");
const segmentText = await readFile(segmentPath, "utf8");
const comparatorManifest = JSON.parse(
  await readFile(comparatorManifestPath, "utf8")
);
const segmentManifest = JSON.parse(
  await readFile(segmentManifestPath, "utf8")
);
verifyPrivateSourceManifest({
  manifest: comparatorManifest,
  expectedSchema: "m2.formal_cash_comparator.private_manifest.v1",
  expectedCountField: "privateCaseRowCount",
  expectedDigestField: "caseEvidenceSha256",
  text: comparatorText
});
verifyPrivateSourceManifest({
  manifest: segmentManifest,
  expectedSchema: "m2.c2_development_manifest.private.v1",
  expectedCountField: "privateCaseCount",
  expectedDigestField: "privateCaseSha256",
  text: segmentText
});

const comparatorRows = parseNdjson(comparatorText)
  .filter(isDevelopmentB4ModelCase)
  .map(normalizeComparator);
const comparatorKeys = new Set(comparatorRows.map(caseKey));
const rawSegmentRows = parseNdjson(segmentText);
const segmentRows = rawSegmentRows
  .map(normalizeSegment)
  .filter((row) => comparatorKeys.has(caseKey(row)));
const segmentByKey = new Map(
  segmentRows.map((row) => [caseKey(row), row.segment])
);
const comparatorByKey = new Map(
  comparatorRows.map((row) => [caseKey(row), row])
);
const featureRows = comparatorRows.map((row) => ({
  standardWorkId: row.standardWorkId,
  origin: row.origin,
  horizonMonths: row.horizonMonths,
  route: row.route,
  segment: segmentByKey.get(caseKey(row)),
  spikeCandidate: row.strata.spike_candidate,
  valueBand: row.strata.value_band,
  historicalFeaturePolicy: row.strata.historicalFeaturePolicy,
  sourceShelfRightsTermPolicy: row.strata.sourceShelfRightsTermPolicy
}));
const payload = JSON.parse(await readFile(payloadPath, "utf8"));
verifyPrivatePayload(payload, contract);
const eligibilityLedger = buildEligibilityLedger(
  payload.records,
  rawSegmentRows
);
const eligibilityReasonCounts = countBy(
  eligibilityLedger,
  (row) => row.reason
);
const routeExcludedWorkCount = (
  (eligibilityReasonCounts.formal_cash_route_uncommitted ?? 0)
  + (eligibilityReasonCounts.formal_cash_route_unknown ?? 0)
);
const expectedRouteExcludedWorkCount = (
  Number(populationReport.population.scoreableWorkCount)
  - contract.population.modelWorkCount
);
if (
  eligibilityLedger.length !== contract.population.libraryWorkCount
  || eligibilityReasonCounts.model_eligible
    !== contract.population.modelWorkCount
  || routeExcludedWorkCount !== expectedRouteExcludedWorkCount
  || eligibilityReasonCounts
    .not_observable_at_any_frozen_development_origin
    !== Number(
      populationReport.unscoreableReasons.distribution
        .not_observable_at_any_frozen_development_origin.count
    )
  || eligibilityReasonCounts.insufficient_history_at_every_eligible_origin
    !== Number(
      populationReport.unscoreableReasons.distribution
        .insufficient_observed_calendar_history_at_every_eligible_origin.count
    )
) {
  throw new Error("m2_current_private_eligibility_reason_ledger_drift");
}

const previousCandidate = buildM2CurrentReliableCandidate(
  comparatorRows,
  featureRows,
  previousContract
);
const candidate = buildM2CurrentOccurrenceAmountCandidate(
  previousCandidate.rows,
  contract
);
const previousCandidateByKey = new Map(
  previousCandidate.rows.map((row) => [caseKey(row), row])
);
const currentCandidateByKey = new Map(
  candidate.rows.map((row) => [caseKey(row), row])
);
if (
  candidate.rows.length !== contract.population.modelCaseCount
  || new Set(candidate.rows.map((row) => row.standardWorkId)).size
    !== contract.population.modelWorkCount
) {
  throw new Error("m2_current_candidate_frozen_population_drift");
}
const comparison = compareM2CurrentCandidateToB4(
  candidate.rows,
  previousCandidate.rows,
  contract
);
const pairedCi = pairedWorkOriginBootstrap(
  candidate.rows,
  previousCandidate.rows,
  contract
);
const previousComparison = compareM2CurrentCandidateToB4(
  candidate.rows,
  previousCandidate.rows,
  contract
);
const pairedCiVsPreviousCandidate = pairedWorkOriginBootstrap(
  candidate.rows,
  previousCandidate.rows,
  contract
);
const comparisonToB4 = compareM2CurrentCandidateToB4(
  candidate.rows,
  comparatorRows,
  contract
);
const pairedCiToB4 = pairedWorkOriginBootstrap(
  candidate.rows,
  comparatorRows,
  contract
);
const previousByHorizon = scoreM2CurrentSlices(
  previousCandidate.rows,
  "horizonMonths"
);
const previousSegmentRows = previousCandidate.rows.map((row) => ({
  ...row,
  segment: segmentByKey.get(caseKey(row))
}));
const b4RowsWithSegment = comparatorRows.map((row) => ({
  ...row,
  segment: segmentByKey.get(caseKey(row))
}));
const previousBySegment = scoreM2CurrentSlices(
  previousSegmentRows,
  "segment"
);
const previousByOrigin = scoreM2CurrentSlices(
  previousCandidate.rows,
  "origin"
);
const pairedByHorizon = pairedSlices(candidate.byHorizon, previousByHorizon);
const pairedBySegment = pairedSlices(candidate.bySegment, previousBySegment);
const pairedByOrigin = pairedSlices(candidate.byOrigin, previousByOrigin);
const overallAbsoluteBiasPassed = (
  Math.abs(comparison.candidate.signedBias)
    <= contract.thresholds.overallAbsoluteBiasMaximum
);
const developmentWapePassed = (
  comparison.candidate.wape
    <= contract.thresholds.developmentWapeMaximum
);
const eachHorizonAbsoluteBiasPassed = (
  contract.allowedHorizonValues.every((horizon) => (
    Math.abs(candidate.byHorizon[horizon].signedBias)
      <= contract.thresholds.eachHorizonAbsoluteBiasMaximum
  ))
);
const eachSegmentWapePassed = contract.activitySegmentValues.every(
  (segment) => (
    candidate.bySegment[segment].wape
      <= contract.thresholds.eachSegmentWapeMaximum
  )
);
const eachSegmentAbsoluteBiasPassed = contract.activitySegmentValues.every(
  (segment) => (
    Math.abs(candidate.bySegment[segment].signedBias)
      <= contract.thresholds.eachSegmentAbsoluteBiasMaximum
  )
);
const pairedRelativeWapeUpperPassed = (
  pairedCi.upper95 < contract.thresholds.pairedRelativeWapeUpperMaximum
);
const dormantFallbackPolicyPassed = candidate.selections
  .filter((selection) => selection.segment === "dormant")
  .every((selection) => (
    selection.selectedCandidateId === previousConfig.candidate.id
  ));
const dormantRows = candidate.rows.filter((row) => row.segment === "dormant");
const factPath = path.join(
  root,
  "data/private-output/m2-formal-execution",
  path.basename(payload.factImport.factFile)
);
const factText = await readFile(factPath, "utf8");
if (sha256(factText) !== payload.factImport.factFileSha256) {
  throw new Error("m2_current_private_history_digest_mismatch");
}
const historyRows = parseNdjson(factText)
  .filter((row) => row.businessForm === "audio_product")
  .map((row) => ({
    standardWorkId: String(row.standardWorkId),
    month: row.billMonth,
    amount: Number(row.actualSalesAmount)
  }));
const baselineEvaluation = buildM2CurrentAutomatedBaselineEvaluation(
  candidate.rows.map((row) => ({
    ...row,
    revenueModel: row.route
  })),
  historyRows,
  contract
);
const evaluatedCandidateRows = attachM2CurrentScaleAndOccurrence(
  candidate.rows,
  historyRows,
  (row) => row.occurrenceProbability ?? (row.pointEstimate > 0 ? 1 : 0)
);
const evaluatedPreviousRows = attachM2CurrentScaleAndOccurrence(
  previousCandidate.rows,
  historyRows,
  (row) => row.pointEstimate > 0 ? 1 : 0
);
const evaluatedB4Rows = attachM2CurrentScaleAndOccurrence(
  b4RowsWithSegment,
  historyRows,
  (row) => row.pointEstimate > 0 ? 1 : 0
);
const historyIndex = buildM2CurrentHistoryIndex(historyRows);
const officialBaseRows = evaluatedCandidateRows.map((row) => ({
  ...row,
  historySeries: getM2CurrentHistorySeries(
    historyIndex,
    row.standardWorkId,
    row.origin
  ),
  targetEnd: addMonths(row.origin, row.horizonMonths)
}));
const globalBakeoff = buildM2CurrentGlobalModelBakeoff(
  officialBaseRows,
  nextContract.development.modelDevelopment
);
const ensemble = buildM2CurrentConstrainedEnsemble(
  officialBaseRows,
  globalBakeoff.selectedRows,
  nextContract.development.ensemble
);
const hierarchy = reconcileM2CurrentSegmentHierarchy(ensemble.rows);
const hierarchySelection = buildM2CurrentConstrainedEnsemble(
  ensemble.rows,
  hierarchy.rows,
  {
    weights: [0, 1],
    maximumTrainingAbsoluteBias:
      nextContract.development.ensemble.maximumTrainingAbsoluteBias
  }
);
const probabilistic = attachM2CurrentConformalQuantiles(
  hierarchySelection.rows,
  {
    probabilities:
      nextContract.development.probabilistic.quantileProbabilities,
    minimumCalibrationRows:
      nextContract.development.probabilistic.minimumCalibrationRows
  }
);
const nextCandidateRows = probabilistic.rows;
const nextComparison = compareM2CurrentCandidateToB4(
  nextCandidateRows,
  officialBaseRows,
  nextContract
);
const nextPairedCi = pairedWorkOriginBootstrap(
  nextCandidateRows,
  officialBaseRows,
  nextContract
);
const nextComparisonToB4 = compareM2CurrentCandidateToB4(
  nextCandidateRows,
  evaluatedB4Rows,
  nextContract
);
const nextPairedCiToB4 = pairedWorkOriginBootstrap(
  nextCandidateRows,
  evaluatedB4Rows,
  nextContract
);
const groupConfidenceIntervals = {
  bySegment: pairedGroupConfidenceIntervals(
    nextCandidateRows,
    officialBaseRows,
    "segment",
    nextContract
  ),
  byHorizon: pairedGroupConfidenceIntervals(
    nextCandidateRows,
    officialBaseRows,
    "horizonMonths",
    nextContract
  )
};
const automation = evaluateM2CurrentAutomationPolicy({
  rows: nextCandidateRows,
  comparators: {
    v0_3: officialBaseRows,
    B4: evaluatedB4Rows,
    strongestSimpleBaseline: strongestBaselineRows(
      baselineEvaluation.rowsByBaseline
    )
  },
  policy: nextContract.development.automation,
  stableImprovement: nextPairedCi.upper95 < 0
});
const automatedEvaluation = {
  schema: "m2.current.automated_evaluation.public.v0.1",
  decisionStatus: "not_for_formal_decision",
  scope: {
    caseCount: candidate.rows.length,
    workCount: new Set(candidate.rows.map((row) => row.standardWorkId)).size,
    originCount: new Set(candidate.rows.map((row) => row.origin)).size,
    horizons: contract.allowedHorizonValues,
    finalHoldoutOpened: false
  },
  design: {
    monthlyRollingOrigin: true,
    strictlyAsOfHistory: true,
    samePopulationComparison: true,
    occurrenceAndPositiveAmountSeparated: true,
    metrics: contract.evaluationPolicy.requiredMetrics,
    humanNumericBaselineUsed: false
  },
  decisionThresholds: {
    developmentWapeMaximum:
      contract.thresholds.developmentWapeMaximum,
    observedCandidateWape: comparison.candidate.wape,
    developmentWapePassed
  },
  models: {
    [candidate.candidateId]: evaluationViews(evaluatedCandidateRows),
    [previousConfig.candidate.id]: evaluationViews(evaluatedPreviousRows),
    B4: evaluationViews(evaluatedB4Rows)
  },
  simpleBaselines: baselineEvaluation.baselines,
  coverage: {
    eligibility: {
      workCount: contract.population.modelWorkCount,
      libraryWorkCount: contract.population.libraryWorkCount,
      workShare:
        contract.population.modelWorkCount / contract.population.libraryWorkCount
    },
    cashObservability: {
      status: "reported_by_public_business_coverage_authority"
    },
    served: {
      caseCount: candidate.rows.length,
      caseShareOfFrozenModelPopulation: 1
    },
    abstention: baselineEvaluation.routePolicy
  },
  retiredHumanPredictionSample: {
    required: false,
    currentDependency: false,
    historicalArtifactOnly:
      "docs/analysis/m2-current/M2-current-business-sample-diagnostic-v0.2.json"
  },
  boundaries: {
    aggregateOnly: true,
    identifiersPresent: false,
    privateRowsPresent: false,
    providerCalled: false,
    databaseConnected: false,
    finalHoldoutOpened: false,
    releaseAuthorized: false
  }
};
const publicReport = {
  schema: "m2.current.occurrence_amount_candidate.public.v0.3",
  version: "M2-current-occurrence-amount-candidate-v0.3",
  decisionStatus: "not_for_formal_decision",
  candidateId: candidate.candidateId,
  target: config.target,
  primaryComparator: config.primaryComparator,
  developmentAuthorization: {
    modelTraining: true,
    finalHoldout: false,
    release: false,
    m3Formal: false
  },
  scope: {
    caseCount: candidate.rows.length,
    uniqueWorkCount: new Set(
      candidate.rows.map((row) => row.standardWorkId)
    ).size,
    originCount: new Set(candidate.rows.map((row) => row.origin)).size,
    horizons: contract.allowedHorizonValues,
    populationMoved: false
  },
  design: {
    family: "occurrence_hazard_plus_conditional_amount_calibration",
    baseCandidateId: previousConfig.candidate.id,
    dense: "two_part_rule_when_mature_earlier_gate_passes",
    intermittent: "two_part_rule_when_mature_earlier_gate_passes",
    dormant: "base_candidate_fallback",
    strictlyMatureEarlierLabelsOnly: true,
    sameOrLaterOuterTruthRead: false,
    postHocFeatureRead: false,
    occurrenceAmount: contract.candidate.occurrenceAmount,
    thresholdMovedAfterResults: false
  },
  selections: candidate.selections,
  comparison,
  comparisonToB4: {
    comparison: comparisonToB4,
    pairedCi: pairedCiToB4
  },
  previousCandidateComparison: {
    candidateId: previousCandidate.candidateId,
    comparison: previousComparison,
    pairedCi: pairedCiVsPreviousCandidate
  },
  byHorizon: pairedByHorizon,
  bySegment: pairedBySegment,
  segmentDiagnostics: {
    dormant: {
      caseCount: dormantRows.length,
      positiveActualCaseCount:
        dormantRows.filter((row) => row.actual > 0).length,
      zeroActualCaseCount:
        dormantRows.filter((row) => row.actual === 0).length,
      reactivationCandidateActivated: candidate.selections.some(
        (selection) => (
          selection.segment === "dormant"
          && selection.selectedCandidateId !== previousConfig.candidate.id
        )
      ),
      conclusion:
        "reactivation_cash_is_concentrated_in_a_few_events_without_identifiable_allowed_as_of_signal"
    }
  },
  byOrigin: pairedByOrigin,
  pairedCi,
  automatedEvaluation: {
    publicReport: config.publicSources.automatedEvaluation,
    humanNumericBaselineRequired: false,
    businessSampleRequired: false,
    humanRole: contract.evaluationPolicy.humanRole
  },
  acceptance: {
    developmentWapePassed,
    overallAbsoluteBiasPassed,
    eachHorizonAbsoluteBiasPassed,
    eachSegmentWapePassed,
    eachSegmentAbsoluteBiasPassed,
    pairedRelativeWapeUpperPassed,
    dormantFallbackPolicyPassed,
    allCurrentDevelopmentConditionsPassed:
      developmentWapePassed
      && overallAbsoluteBiasPassed
      && eachHorizonAbsoluteBiasPassed
      && eachSegmentWapePassed
      && eachSegmentAbsoluteBiasPassed
      && pairedRelativeWapeUpperPassed
      && dormantFallbackPolicyPassed,
    developmentDecision:
      developmentWapePassed
      && overallAbsoluteBiasPassed
      && eachHorizonAbsoluteBiasPassed
      && eachSegmentWapePassed
      && eachSegmentAbsoluteBiasPassed
      && pairedRelativeWapeUpperPassed
      && dormantFallbackPolicyPassed
        ? "PASS"
        : "PARTIAL_PASS",
    finalHoldoutOpened: false,
    releaseAuthorized: false
  },
  privacy: {
    aggregateOnly: true,
    workIdentifiersPresent: false,
    privatePathsPresent: false,
    rawRowsPresent: false
  },
  sourceBoundary: {
    privateDevelopmentRowsRead: true,
    privateEligibilityReasonLedgerWritten: true,
    databaseConnected: false,
    providerCalled: false,
    finalHoldoutOpened: false
  }
};

await mkdir(privateDirectory, { recursive: true });
const privateReasonLedgerText = eligibilityLedger
  .map((row) => JSON.stringify(row))
  .join("\n") + "\n";
await writeFile(privateReasonLedgerPath, privateReasonLedgerText, "utf8");
const privateText = candidate.rows.map((row) => JSON.stringify({
  caseKey: {
    standardWorkId: row.standardWorkId,
    origin: row.origin,
    horizonMonths: row.horizonMonths,
    route: row.route
  },
  activitySegment: row.segment,
  actual: row.actual,
  b4PointEstimate: comparatorByKey.get(caseKey(row)).pointEstimate,
  previousCandidatePointEstimate:
    previousCandidateByKey.get(caseKey(row))?.pointEstimate,
  candidatePointEstimate: row.pointEstimate,
  selectedCandidateId: row.selectedCandidateId,
  selectedFactor: row.selectedFactor,
  occurrenceProbability: row.occurrenceProbability,
  conditionalAmountScale: row.conditionalAmountScale,
  labelAvailableAsOf: row.labelAvailableAsOf
})).join("\n") + "\n";
await writeFile(privateRowsPath, privateText, "utf8");
const prettyPublic = `${JSON.stringify(publicReport, null, 2)}\n`;
await writeFile(privateManifestPath, `${JSON.stringify({
  schema: "m2.current.occurrence_amount_candidate.private_manifest.v0.3",
  tracked: false,
  decisionStatus: "not_for_formal_decision",
  privateCaseRowCount: candidate.rows.length,
  privateCaseSha256: sha256(privateText),
  privateEligibilityReasonRowCount: eligibilityLedger.length,
  privateEligibilityReasonSha256: sha256(privateReasonLedgerText),
  privateEligibilityReasonCounts: eligibilityReasonCounts,
  humanNumericBaselineUsed: false,
  businessSampleWritten: false,
  automatedEvaluationWritten: true,
  publicReportSha256: sha256(prettyPublic),
  publicAutomatedEvaluationSha256:
    sha256(`${JSON.stringify(automatedEvaluation, null, 2)}\n`),
  finalHoldoutOpened: false,
  releaseAuthorized: false
}, null, 2)}\n`, "utf8");
await mkdir(path.dirname(publicPath), { recursive: true });
await writeFile(publicPath, prettyPublic, "utf8");
await writeFile(
  publicAutomatedEvaluationPath,
  `${JSON.stringify(automatedEvaluation, null, 2)}\n`,
  "utf8"
);

const denseProcess = spawnSync(
  process.execPath,
  [
    path.join(root, "scripts/run-codex-python.mjs"),
    path.join(
      root,
      "scripts/m2-current/materialize_dense_development_cases.py"
    )
  ],
  {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024
  }
);
if (denseProcess.status !== 0) {
  throw new Error(
    `m2_current_dense_materialization_failed:${denseProcess.stderr}`
  );
}
const denseDirectory = path.join(
  root,
  "data/private-output/m2-current-dense"
);
const denseCaseText = await readFile(
  path.join(
    denseDirectory,
    "M2-current-dense-cases-private-v0.1.ndjson"
  ),
  "utf8"
);
const denseHistoryText = await readFile(
  path.join(
    denseDirectory,
    "M2-current-dense-history-private-v0.1.ndjson"
  ),
  "utf8"
);
const frozenSalesShareTargetText = await readFile(
  path.join(
    denseDirectory,
    "M2-current-sales-share-frozen-cases-private-v0.1.ndjson"
  ),
  "utf8"
);
const denseManifest = JSON.parse(await readFile(
  path.join(
    denseDirectory,
    "M2-current-dense-manifest-private-v0.1.json"
  ),
  "utf8"
));
verifyDenseManifest(
  denseManifest,
  denseCaseText,
  denseHistoryText,
  frozenSalesShareTargetText
);
const denseHistoryByKey = new Map(parseNdjson(denseHistoryText).map(
  (row) => [row.historyKey, row]
));
const denseCases = parseNdjson(denseCaseText).map((row) => ({
  ...row,
  revenueModel: row.route,
  historyFirstObservedMonth:
    denseHistoryByKey.get(row.historyKey)?.historyFirstObservedMonth,
  historySeries: denseHistoryByKey.get(row.historyKey)?.historySeries
}));
if (denseCases.some((row) => !Array.isArray(row.historySeries))) {
  throw new Error("m2_current_dense_history_join_failed");
}
const denseSchedule = buildM2CurrentDenseOriginSchedule(
  nextContract.development.denseOrigins
);
const denseLabelPartition = partitionM2CurrentLabels(
  denseCases,
  nextContract.development.denseOrigins.labelAvailableThrough
);
const denseBaselineEvaluation = buildM2CurrentAutomatedBaselineEvaluation(
  denseCases,
  historyRows,
  nextContract
);
const denseChampion = buildM2CurrentRollingBaselineChampion(
  denseBaselineEvaluation.rowsByBaseline,
  {
    minimumTrainingRows:
      nextContract.development.modelDevelopment.minimumTrainingRows
  }
);
const denseProbabilistic = attachM2CurrentConformalQuantiles(
  denseChampion.rows,
  {
    probabilities:
      nextContract.development.probabilistic.quantileProbabilities,
    minimumCalibrationRows:
      nextContract.development.probabilistic.minimumCalibrationRows
  }
);
const authorityResolution = evaluateM2CurrentResolution(
  nextCandidateRows,
  {
    bootstrapIterations:
      resolutionContract.pairedBootstrap.iterations,
    bootstrapSeed: resolutionContract.pairedBootstrap.seed
  }
);
const denseChampionResolution = evaluateM2CurrentResolution(
  denseChampion.rows,
  {
    bootstrapIterations:
      resolutionContract.pairedBootstrap.iterations,
    bootstrapSeed: resolutionContract.pairedBootstrap.seed
  }
);
const portfolioReconstruction = buildM2CurrentPortfolioReconstruction(
  denseCases,
  resolutionContract.development.portfolioReconstruction
);
const cashConcentration = summarizeM2CurrentCashConcentration(
  nextCandidateRows
);

const nextCandidatePrivateRows = nextCandidateRows.map((row) => ({
  caseKey: {
    standardWorkId: row.standardWorkId,
    origin: row.origin,
    horizonMonths: row.horizonMonths,
    route: row.route
  },
  segment: row.segment,
  actual: row.actual,
  previousCandidatePointEstimate:
    currentCandidateByKey.get(caseKey(row))?.pointEstimate,
  candidatePointEstimate: row.pointEstimate,
  occurrenceProbability: row.occurrenceProbability,
  quantiles: row.quantiles,
  ensembleChallengerWeight: row.ensembleChallengerWeight,
  hierarchyAdjustmentFactor: row.hierarchyAdjustmentFactor,
  labelAvailableAsOf: row.labelAvailableAsOf
}));
const nextCandidatePrivateText = nextCandidatePrivateRows
  .map((row) => JSON.stringify(row))
  .join("\n") + "\n";
const nextCandidatePrivatePath = path.join(
  privateDirectory,
  "M2-current-global-distributional-candidate-cases-private-v0.4.ndjson"
);
const nextCandidatePrivateManifestPath = path.join(
  privateDirectory,
  "M2-current-global-distributional-candidate-manifest-private-v0.4.json"
);

const nextCandidateAcceptance = {
  developmentWapePassed:
    nextComparison.candidate.wape
      <= nextContract.thresholds.developmentWapeMaximum,
  overallAbsoluteBiasPassed:
    Math.abs(nextComparison.candidate.signedBias)
      <= nextContract.thresholds.overallAbsoluteBiasMaximum,
  eachHorizonAbsoluteBiasPassed:
    nextContract.allowedHorizonValues.every((horizon) => (
      Math.abs(scoreM2CurrentSlices(
        nextCandidateRows,
        "horizonMonths"
      )[horizon].signedBias)
        <= nextContract.thresholds.eachHorizonAbsoluteBiasMaximum
    )),
  eachSegmentWapePassed:
    nextContract.activitySegmentValues.every((segment) => (
      scoreM2CurrentSlices(nextCandidateRows, "segment")[segment].wape
        <= nextContract.thresholds.eachSegmentWapeMaximum
    )),
  eachSegmentAbsoluteBiasPassed:
    nextContract.activitySegmentValues.every((segment) => (
      Math.abs(
        scoreM2CurrentSlices(nextCandidateRows, "segment")[segment].signedBias
      ) <= nextContract.thresholds.eachSegmentAbsoluteBiasMaximum
    )),
  stableImprovementVsV03Passed: nextPairedCi.upper95 < 0,
  central80CalibrationPassed:
    probabilistic.overall.intervalCoverage.central_80
      .absoluteCalibrationError
      <= nextContract.development.automation
        .maximumCentral80CalibrationError,
  hierarchyCoherencePassed: hierarchy.allCellsCoherent,
  denseMonthlyOriginEvaluatorPassed:
    denseSchedule.origins.length === 25
      && denseManifest.originCount === 25
      && denseLabelPartition.counts.invalid === 0
};
nextCandidateAcceptance.allCurrentDevelopmentConditionsPassed =
  Object.values(nextCandidateAcceptance).every(Boolean);
nextCandidateAcceptance.developmentDecision =
  nextCandidateAcceptance.allCurrentDevelopmentConditionsPassed
    ? "PASS"
    : "FAIL";
nextCandidateAcceptance.finalHoldoutOpened = false;
nextCandidateAcceptance.releaseAuthorized = false;

const nextAutomatedEvaluation = {
  schema: "m2.current.automated_evaluation.public.v0.2",
  decisionStatus: "not_for_formal_decision",
  targetContract: {
    target: nextConfig.target,
    occurrenceDefinition:
      "forecastable_cash_actual_strictly_greater_than_zero",
    negativeCashOccurrenceTreatment:
      "zero_occurrence_retained_in_amount_error",
    censoring:
      "only_observed_labels_available_at_evaluation_cutoff_are_scored",
    commitmentSnapshot:
      "same_work_signed_confirmed_available_as_of_cutoff_auditable_and_inside_horizon",
    uncommittedPureBuyout: "null_abstain"
  },
  authoritativeFrozenEvaluation: {
    caseCount: nextCandidateRows.length,
    workCount: new Set(
      nextCandidateRows.map((row) => row.standardWorkId)
    ).size,
    originCount: new Set(nextCandidateRows.map((row) => row.origin)).size,
    originCadence: "semiannual_frozen_authority",
    finalHoldoutOpened: false,
    models: {
      candidate: {
        id: nextConfig.candidate.id,
        point: evaluationViews(nextCandidateRows),
        probabilistic: {
          overall: probabilistic.overall,
          byHorizon: probabilistic.byHorizon,
          bySegment: probabilistic.bySegment
        }
      },
      previousCandidate: {
        id: config.candidate.id,
        point: evaluationViews(officialBaseRows)
      },
      B4: {
        point: evaluationViews(evaluatedB4Rows)
      }
    },
    globalModelBakeoff: {
      design: globalBakeoff.design,
      families: globalBakeoff.families,
      selections: globalBakeoff.selections
    },
    ensembleSelections: ensemble.selections,
    hierarchy: {
      method: hierarchy.method,
      allCellsCoherent: hierarchy.allCellsCoherent,
      cells: hierarchy.cells,
      nestedApplicationSelections: hierarchySelection.selections
    },
    comparisonToPrevious: {
      comparison: nextComparison,
      pairedCi: nextPairedCi,
      groupConfidenceIntervals
    },
    comparisonToB4: {
      comparison: nextComparisonToB4,
      pairedCi: nextPairedCiToB4
    },
    simpleBaselines: baselineEvaluation.baselines
  },
  denseMonthlyDevelopmentDiagnostic: {
    role: "secondary_development_diagnostic",
    decisionPopulationMoved: false,
    workCount: denseManifest.workCount,
    originCount: denseManifest.originCount,
    eligibleOriginHorizonCellCount: denseSchedule.eligibleCellCount,
    rightCensoredOriginHorizonCellCount:
      denseSchedule.rightCensoredCellCount,
    materializedCaseCount: denseManifest.caseRowCount,
    labelStatusCounts: denseLabelPartition.counts,
    routeCountsByWorkOrigin: denseManifest.routeCountsByWorkOrigin,
    segmentCountsByWorkOrigin: denseManifest.segmentCountsByWorkOrigin,
    baselines: denseBaselineEvaluation.baselines,
    rollingBaselineChampion: {
      overall: denseChampion.overall,
      byOrigin: denseChampion.byOrigin,
      bySegment: denseChampion.bySegment,
      selections: denseChampion.selections,
      probabilistic: {
        overall: denseProbabilistic.overall,
        byHorizon: denseProbabilistic.byHorizon,
        bySegment: denseProbabilistic.bySegment
      }
    },
    abstention: denseBaselineEvaluation.routePolicy
  },
  automation,
  retiredHumanPredictionSample: {
    required: false,
    currentDependency: false,
    replayed: false,
    skippedByUserDecision: true
  },
  boundaries: {
    aggregateOnly: true,
    identifiersPresent: false,
    privateRowsPresent: false,
    providerCalled: false,
    databaseConnected: false,
    finalHoldoutOpened: false,
    embargoShadowOpened: false,
    deferred60MonthLabelsOpened: false,
    releaseAuthorized: false
  }
};

const nextPublicReport = {
  schema: "m2.current.global_distributional_candidate.public.v0.4",
  version: "M2-current-global-distributional-candidate-v0.4",
  candidateId: nextConfig.candidate.id,
  decisionStatus: "not_for_formal_decision",
  status: nextCandidateAcceptance.allCurrentDevelopmentConditionsPassed
    ? "CANDIDATE_DEVELOPMENT_PASS_BLOCKED"
    : "CANDIDATE_DEVELOPMENT_FAIL_BLOCKED",
  target: nextConfig.target,
  primaryComparator: nextConfig.primaryComparator,
  scope: {
    frozenDecisionCaseCount: nextCandidateRows.length,
    frozenDecisionWorkCount: new Set(
      nextCandidateRows.map((row) => row.standardWorkId)
    ).size,
    frozenDecisionOriginCount: new Set(
      nextCandidateRows.map((row) => row.origin)
    ).size,
    denseDiagnosticCaseCount: denseManifest.caseRowCount,
    denseDiagnosticOriginCount: denseManifest.originCount,
    populationMoved: false
  },
  methods: {
    nestedGlobalFamilies: globalBakeoff.design.families,
    constrainedEnsemble: true,
    rollingSplitConformal: true,
    quantileProbabilities:
      nextContract.development.probabilistic.quantileProbabilities,
    hierarchy: hierarchy.method,
    occurrenceAmountSeparated: true,
    sameOrLaterOuterTruthRead: false
  },
  pointComparisonToPrevious: {
    comparison: nextComparison,
    pairedCi: nextPairedCi,
    groupConfidenceIntervals
  },
  byHorizon: scoreM2CurrentSlices(nextCandidateRows, "horizonMonths"),
  bySegment: scoreM2CurrentSlices(nextCandidateRows, "segment"),
  pairedCi: nextPairedCi,
  pointComparisonToB4: {
    comparison: nextComparisonToB4,
    pairedCi: nextPairedCiToB4
  },
  probabilistic: {
    overall: probabilistic.overall,
    byHorizon: probabilistic.byHorizon,
    bySegment: probabilistic.bySegment
  },
  globalModelBakeoff: {
    families: globalBakeoff.families,
    selections: globalBakeoff.selections
  },
  hierarchy: {
    allCellsCoherent: hierarchy.allCellsCoherent,
    method: hierarchy.method,
    nestedApplicationSelections: hierarchySelection.selections
  },
  denseMonthlyDiagnostic: {
    originCount: denseManifest.originCount,
    caseCount: denseManifest.caseRowCount,
    rollingBaselineChampion: denseChampion.overall,
    probabilistic: denseProbabilistic.overall,
    abstention: denseBaselineEvaluation.routePolicy,
    decisionPopulationMoved: false
  },
  automation,
  acceptance: nextCandidateAcceptance,
  developmentAuthorization: {
    modelTraining: true,
    newCandidateFamilyDevelopment: false,
    finalHoldout: false,
    release: false,
    m3Formal: false
  },
  humanEvaluation: {
    numericForecastRequired: false,
    sample120Required: false,
    sample120Replayed: false,
    role: "post_gate_quality_assurance_only"
  },
  privacy: {
    aggregateOnly: true,
    workIdentifiersPresent: false,
    privatePathsPresent: false,
    rawRowsPresent: false
  }
};

const nextPublicText = `${JSON.stringify(nextPublicReport, null, 2)}\n`;
const nextAutomatedText =
  `${JSON.stringify(nextAutomatedEvaluation, null, 2)}\n`;
await writeFile(nextCandidatePrivatePath, nextCandidatePrivateText, "utf8");
await writeFile(
  nextCandidatePrivateManifestPath,
  `${JSON.stringify({
    schema:
      "m2.current.global_distributional_candidate.private_manifest.v0.4",
    tracked: false,
    decisionStatus: "not_for_formal_decision",
    privateCaseRowCount: nextCandidateRows.length,
    privateCaseSha256: sha256(nextCandidatePrivateText),
    denseManifestSha256: sha256(
      `${JSON.stringify(denseManifest, null, 2)}\n`
    ),
    publicCandidateSha256: sha256(nextPublicText),
    publicAutomatedEvaluationSha256: sha256(nextAutomatedText),
    providerCalled: false,
    databaseConnected: false,
    finalHoldoutOpened: false,
    embargoShadowOpened: false,
    deferred60MonthLabelsOpened: false,
    releaseAuthorized: false
  }, null, 2)}\n`,
  "utf8"
);
await writeFile(
  path.join(root, nextConfig.publicSources.candidate),
  nextPublicText,
  "utf8"
);
await writeFile(
  path.join(root, nextConfig.publicSources.automatedEvaluation),
  nextAutomatedText,
  "utf8"
);

const {
  privateValidationRows: portfolioPrivateRows,
  privateSeasonalNaiveRows: portfolioPrivateComparatorRows,
  ...publicPortfolioReconstruction
} = portfolioReconstruction;
const portfolioPrivateText = portfolioPrivateRows.map((row) => JSON.stringify({
  ...row,
  seasonalNaivePointEstimate:
    portfolioPrivateComparatorRows.find((candidateRow) => (
      candidateRow.origin === row.origin
      && candidateRow.horizonMonths === row.horizonMonths
    ))?.pointEstimate
})).join("\n") + "\n";
const portfolioPrivatePath = path.join(
  privateDirectory,
  "M2-current-portfolio-reconstruction-cells-private-v0.5.ndjson"
);
const portfolioPrivateManifestPath = path.join(
  privateDirectory,
  "M2-current-portfolio-reconstruction-manifest-private-v0.5.json"
);
const portfolioDevelopmentPassed =
  publicPortfolioReconstruction.allPortfolioDevelopmentGatesPassed;
const workLevelDevelopmentPassed =
  nextCandidateAcceptance.allCurrentDevelopmentConditionsPassed;
const resolutionCoverage = JSON.parse(await readFile(
  path.join(root, resolutionConfig.publicSources.coverage),
  "utf8"
));
const resolutionAcceptance = {
  portfolioDevelopmentBacktestPassed: portfolioDevelopmentPassed,
  workLevelDevelopmentPassed,
  cashObservabilityPassed:
    Number(
      resolutionConfig.thresholds
        .fullLibraryForecastableCashCoverageMinimum
    ) <= Number(
      resolutionCoverage.cashCoverage.forecastableCashShareOfLedgerCash
    )
    && Number(
      resolutionConfig.thresholds
        .top10ForecastableCashCoverageMinimum
    ) <= Number(
      resolutionCoverage.topBands.top10.forecastableCashCoverage
    ),
  denseMonthlyContradictionResolved:
    portfolioDevelopmentPassed,
  fullM2MaturityPassed: false,
  finalHoldoutOpened: false,
  releaseAuthorized: false
};
const resolutionStatus = portfolioDevelopmentPassed
  ? "PORTFOLIO_DEVELOPMENT_BACKTEST_PASS_WORK_LEVEL_BLOCKED"
  : "MULTI_RESOLUTION_DEVELOPMENT_FAIL_BLOCKED";
const resolutionAutomatedEvaluation = {
  schema: "m2.current.automated_evaluation.public.v0.3",
  decisionStatus: "not_for_formal_decision",
  targetContract: nextAutomatedEvaluation.targetContract,
  authoritativeFrozenEvaluation: {
    ...nextAutomatedEvaluation.authoritativeFrozenEvaluation,
    multiResolution: authorityResolution,
    cashAndErrorConcentration: cashConcentration,
    interpretation:
      "five_sparse_semiannual_origins_show_aggregate_accuracy_but_do_not_establish_monthly_maturity"
  },
  denseMonthlyDevelopmentDiagnostic: {
    ...nextAutomatedEvaluation.denseMonthlyDevelopmentDiagnostic,
    existingChampionMultiResolution: denseChampionResolution,
    portfolioReconstruction: publicPortfolioReconstruction
  },
  automation: {
    ...automation,
    decision: "AUTOMATION_BLOCKED",
    automationAuthorized: false,
    releaseAuthorized: false
  },
  maturityAssessment: {
    matureDataPredictionCapability: false,
    highAccuracyPortfolioDevelopmentBacktestAvailable:
      portfolioDevelopmentPassed,
    permittedClaim:
      "portfolio_level_development_backtest_pass_only",
    prohibitedClaims: [
      "mature_work_level_forecasting",
      "independently_validated_production_forecast",
      "release_ready",
      "full_library_coverage"
    ],
    reasons: [
      "work_level_WAPE_above_0_30",
      "intermittent_and_dormant_segments_failed",
      "cash_observability_below_0_90",
      "portfolio_candidate_tuned_on_development_data",
      "final_holdout_sealed"
    ]
  },
  retiredHumanPredictionSample:
    nextAutomatedEvaluation.retiredHumanPredictionSample,
  boundaries: nextAutomatedEvaluation.boundaries
};
const resolutionPublicReport = {
  schema: "m2.current.multi_resolution_candidate.public.v0.5",
  version: "M2-current-multi-resolution-candidate-v0.5",
  candidateId: resolutionConfig.candidate.id,
  decisionStatus: "not_for_formal_decision",
  status: resolutionStatus,
  target: resolutionConfig.target,
  primaryComparator: resolutionConfig.primaryComparator,
  scope: {
    frozenDecisionCaseCount: nextCandidateRows.length,
    frozenDecisionWorkCount: new Set(
      nextCandidateRows.map((row) => row.standardWorkId)
    ).size,
    frozenDecisionOriginCount: new Set(
      nextCandidateRows.map((row) => row.origin)
    ).size,
    denseDiagnosticCaseCount: denseManifest.caseRowCount,
    denseDiagnosticOriginCount: denseManifest.originCount,
    portfolioEvaluationOriginCount:
      publicPortfolioReconstruction.candidate.originCount,
    portfolioEvaluationCellCount:
      publicPortfolioReconstruction.candidate.originHorizonCellCount,
    populationMoved: false
  },
  pointComparisonToPrevious: {
    comparison: nextComparison,
    pairedCi: nextPairedCi,
    groupConfidenceIntervals
  },
  byHorizon: scoreM2CurrentSlices(nextCandidateRows, "horizonMonths"),
  bySegment: scoreM2CurrentSlices(nextCandidateRows, "segment"),
  pairedCi: nextPairedCi,
  multiResolution: {
    workLevelFallbackCandidateId: nextConfig.candidate.id,
    authoritativeSparseOriginDiagnostic: authorityResolution,
    denseMonthlyExistingChampionDiagnostic: denseChampionResolution,
    portfolioReconstruction: publicPortfolioReconstruction,
    cashAndErrorConcentration: cashConcentration
  },
  maturityAssessment: resolutionAutomatedEvaluation.maturityAssessment,
  automation: {
    ...automation,
    decision: "AUTOMATION_BLOCKED",
    automationAuthorized: false,
    releaseAuthorized: false
  },
  acceptance: {
    ...nextCandidateAcceptance,
    ...resolutionAcceptance,
    allCurrentDevelopmentConditionsPassed: false,
    developmentDecision: portfolioDevelopmentPassed
      ? "PORTFOLIO_ONLY_PASS"
      : "FAIL"
  },
  developmentAuthorization: {
    modelTraining: true,
    newCandidateFamilyDevelopment: false,
    finalHoldout: false,
    release: false,
    m3Formal: false
  },
  humanEvaluation: {
    numericForecastRequired: false,
    sample120Required: false,
    sample120Replayed: false,
    role: "post_gate_quality_assurance_only"
  },
  privacy: {
    aggregateOnly: true,
    workIdentifiersPresent: false,
    privatePathsPresent: false,
    rawRowsPresent: false
  }
};
const resolutionPublicText =
  `${JSON.stringify(resolutionPublicReport, null, 2)}\n`;
const resolutionAutomatedText =
  `${JSON.stringify(resolutionAutomatedEvaluation, null, 2)}\n`;
await writeFile(portfolioPrivatePath, portfolioPrivateText, "utf8");
await writeFile(
  portfolioPrivateManifestPath,
  `${JSON.stringify({
    schema:
      "m2.current.portfolio_reconstruction.private_manifest.v0.5",
    tracked: false,
    decisionStatus: "not_for_formal_decision",
    privateCellRowCount: portfolioPrivateRows.length,
    privateCellSha256: sha256(portfolioPrivateText),
    denseManifestSha256: sha256(
      `${JSON.stringify(denseManifest, null, 2)}\n`
    ),
    publicCandidateSha256: sha256(resolutionPublicText),
    publicAutomatedEvaluationSha256:
      sha256(resolutionAutomatedText),
    providerCalled: false,
    databaseConnected: false,
    finalHoldoutOpened: false,
    embargoShadowOpened: false,
    deferred60MonthLabelsOpened: false,
    releaseAuthorized: false
  }, null, 2)}\n`,
  "utf8"
);
await writeFile(
  path.join(root, resolutionConfig.publicSources.candidate),
  resolutionPublicText,
  "utf8"
);
await writeFile(
  path.join(root, resolutionConfig.publicSources.automatedEvaluation),
  resolutionAutomatedText,
  "utf8"
);

const frozenSalesShareTargets = parseNdjson(frozenSalesShareTargetText);
const frozenSalesShareByKey = new Map(
  frozenSalesShareTargets.map((row) => [
    caseKey({
      standardWorkId: row.caseKey.standardWorkId,
      origin: row.caseKey.origin,
      horizonMonths: row.caseKey.horizonMonths,
      route: row.caseKey.route
    }),
    row
  ])
);
if (
  frozenSalesShareTargets.length !== salesShareContract.population.modelCaseCount
  || frozenSalesShareByKey.size !== frozenSalesShareTargets.length
) {
  throw new Error("m2_current_sales_share_frozen_target_population_drift");
}
const humanAuthorityFrozenRouteCounts = countBy(
  frozenSalesShareTargets,
  (row) => row.authorityRoute
);
const humanAuthorityRouteChangedCaseCount = frozenSalesShareTargets.filter(
  (row) => row.authorityRouteChanged === true
).length;
const humanAuthorityAbstainedCaseCount = frozenSalesShareTargets.filter(
  (row) => row.servedUnderHumanAuthority !== true
).length;
const salesShareWorkRows = nextCandidateRows.map((row) => {
  const target = frozenSalesShareByKey.get(caseKey(row));
  if (!target) {
    throw new Error("m2_current_sales_share_frozen_target_join_failed");
  }
  assertM2CurrentSalesShareModelCaseRoute({
    revenueModel: row.route,
    origin: row.origin
  });
  return {
    ...row,
    previousMachineRoute: target.previousMachineRoute,
    authorityRoute: target.authorityRoute,
    authorityRouteChanged: target.authorityRouteChanged,
    servedUnderHumanAuthority: target.servedUnderHumanAuthority,
    abstentionReasonUnderHumanAuthority:
      target.abstentionReasonUnderHumanAuthority,
    actual: Number(target.salesShareCashActual),
    legacyForecastableCashActual:
      Number(target.legacyForecastableCashActual),
    isolatedBuyoutCashActual:
      Number(target.isolatedBuyoutCashActual),
    isolatedOtherCashActual:
      Number(target.isolatedOtherCashActual),
    totalLedgerCashActual:
      Number(target.totalLedgerCashActual),
    classificationUncertainCashActual:
      Number(target.classificationUncertainCashActual),
    userConfirmedSalesShareCashActual:
      Number(target.userConfirmedSalesShareCashActual),
    userConfirmedSalesShareEventCount:
      Number(target.userConfirmedSalesShareEventCount)
  };
}).filter((row) => row.servedUnderHumanAuthority === true);
const salesShareB4Rows = evaluatedB4Rows.map((row) => {
  const target = frozenSalesShareByKey.get(caseKey(row));
  if (!target) {
    throw new Error("m2_current_sales_share_b4_target_join_failed");
  }
  return {
    ...row,
    actual: Number(target.salesShareCashActual),
    authorityRoute: target.authorityRoute,
    servedUnderHumanAuthority: target.servedUnderHumanAuthority
  };
}).filter((row) => row.servedUnderHumanAuthority === true);
const salesShareDenseCases = denseCases.map((row) => ({
  ...row,
  actual: Number(row.salesShareCashActual)
}));
const salesShareComparison = compareM2CurrentCandidateToB4(
  salesShareWorkRows,
  salesShareB4Rows,
  salesShareContract
);
const salesSharePairedCi = pairedWorkOriginBootstrap(
  salesShareWorkRows,
  salesShareB4Rows,
  salesShareContract
);
const salesShareByHorizon = scoreM2CurrentSlices(
  salesShareWorkRows,
  "horizonMonths"
);
const salesShareBySegment = scoreM2CurrentSlices(
  salesShareWorkRows,
  "segment"
);
const salesShareAuthorityResolution = evaluateM2CurrentResolution(
  salesShareWorkRows,
  {
    bootstrapIterations: salesShareContract.pairedBootstrap.iterations,
    bootstrapSeed: salesShareContract.pairedBootstrap.seed
  }
);
const salesShareDenseBaselineEvaluation =
  buildM2CurrentAutomatedBaselineEvaluation(
    salesShareDenseCases,
    historyRows,
    salesShareContract
  );
const salesShareDenseChampion = buildM2CurrentRollingBaselineChampion(
  salesShareDenseBaselineEvaluation.rowsByBaseline,
  {
    minimumTrainingRows:
      salesShareContract.development.modelDevelopment.minimumTrainingRows
  }
);
const realBillRecalibrationConfig =
  salesShareConfig.development.realBillRecalibration;
const salesShareHistoryRegimeChallenger =
  buildM2CurrentHistoryRegimeChallenger(
    salesShareDenseBaselineEvaluation.rowsByBaseline,
    {
      minimumTrainingRows:
        realBillRecalibrationConfig.minimumTrainingRows,
      trainingOriginWindow:
        realBillRecalibrationConfig.trainingOriginWindow
    }
  );
if (
  JSON.stringify(
    salesShareHistoryRegimeChallenger.design.candidateBaselineIds
  ) !== JSON.stringify(realBillRecalibrationConfig.candidateBaselines)
  || JSON.stringify(
    salesShareHistoryRegimeChallenger.design.selectionHierarchy
  ) !== JSON.stringify(realBillRecalibrationConfig.selectionHierarchy)
  || salesShareHistoryRegimeChallenger.design.promotionEligible
    !== realBillRecalibrationConfig.promotionEligible
) {
  throw new Error("m2_current_real_bill_recalibration_config_drift");
}
const historyRegimeRelativeWapeImprovement = (
  salesShareDenseChampion.overall.wape
    - salesShareHistoryRegimeChallenger.overall.wape
) / salesShareDenseChampion.overall.wape;
const historyRegimeAbsoluteQualityPassed = (
  salesShareHistoryRegimeChallenger.overall.wape
    <= salesShareContract.thresholds.developmentWapeMaximum
  && Math.abs(salesShareHistoryRegimeChallenger.overall.signedBias)
    <= salesShareContract.thresholds.overallAbsoluteBiasMaximum
  && salesShareContract.activitySegmentValues.every((segment) => (
    salesShareHistoryRegimeChallenger.bySegment[segment].wape
      <= salesShareContract.thresholds.eachSegmentWapeMaximum
    && Math.abs(
      salesShareHistoryRegimeChallenger.bySegment[segment].signedBias
    ) <= salesShareContract.thresholds.eachSegmentAbsoluteBiasMaximum
  ))
);
const salesShareDenseResolution = evaluateM2CurrentResolution(
  salesShareDenseChampion.rows,
  {
    bootstrapIterations: salesShareContract.pairedBootstrap.iterations,
    bootstrapSeed: salesShareContract.pairedBootstrap.seed
  }
);
const salesSharePortfolioReconstruction =
  buildM2CurrentPortfolioReconstruction(
    salesShareDenseCases,
    salesShareContract.development.portfolioReconstruction
  );
const {
  privateValidationRows: salesSharePortfolioPrivateRows,
  privateSeasonalNaiveRows: salesSharePortfolioPrivateComparatorRows,
  ...publicSalesSharePortfolio
} = salesSharePortfolioReconstruction;
const frozenTargetIsolation = summarizeSalesShareTarget(
  frozenSalesShareTargets,
  "legacyForecastableCashActual"
);
const denseTargetIsolation = summarizeSalesShareTarget(
  denseCases,
  "actual"
);
const targetClassificationPassed = (
  frozenTargetIsolation.classificationUncertainCashShare
    <= salesShareContract.thresholds
      .maximumClassificationUncertainCashShare
  && denseTargetIsolation.classificationUncertainCashShare
    <= salesShareContract.thresholds
      .maximumClassificationUncertainCashShare
);
const salesShareWorkQualityPassed = (
  salesShareComparison.candidate.wape
    <= salesShareContract.thresholds.developmentWapeMaximum
  && Math.abs(salesShareComparison.candidate.signedBias)
    <= salesShareContract.thresholds.overallAbsoluteBiasMaximum
  && salesShareContract.allowedHorizonValues.every((horizon) => (
    Math.abs(salesShareByHorizon[horizon].signedBias)
      <= salesShareContract.thresholds.eachHorizonAbsoluteBiasMaximum
  ))
  && salesShareContract.activitySegmentValues.every((segment) => (
    salesShareBySegment[segment].wape
      <= salesShareContract.thresholds.eachSegmentWapeMaximum
    && Math.abs(salesShareBySegment[segment].signedBias)
      <= salesShareContract.thresholds.eachSegmentAbsoluteBiasMaximum
  ))
  && salesSharePairedCi.upper95
    < salesShareContract.thresholds.pairedRelativeWapeUpperMaximum
);
const salesSharePortfolioPassed =
  publicSalesSharePortfolio.allPortfolioDevelopmentGatesPassed;
const realBillRecalibrationReport = {
  schema: "m2.current.real_bill_recalibration.public.v0.1",
  version: "M2-current-real-bill-recalibration-v0.1",
  candidateId: realBillRecalibrationConfig.candidateId,
  decisionStatus: "not_for_formal_decision",
  role: realBillRecalibrationConfig.role,
  target: salesShareConfig.target,
  scope: {
    workCount: denseManifest.workCount,
    originCount: denseManifest.originCount,
    materializedCaseCount: denseManifest.caseRowCount,
    scoredCaseCount: salesShareHistoryRegimeChallenger.overall.caseCount,
    populationMoved: false
  },
  realBillReplay: {
    deterministicReplayPassed: true,
    targetClassificationPassed,
    targetPartitionConservationPassed:
      frozenTargetIsolation.maximumAbsoluteConservationDifference
        <= salesShareContract.thresholds.targetPartitionConservationTolerance
      && denseTargetIsolation.maximumAbsoluteConservationDifference
        <= salesShareContract.thresholds.targetPartitionConservationTolerance,
    existingWorkLevel: {
      wape: salesShareComparison.candidate.wape,
      signedBias: salesShareComparison.candidate.signedBias
    },
    existingDenseMonthlyChampion: {
      overall: salesShareDenseChampion.overall,
      bySegment: salesShareDenseChampion.bySegment
    },
    existingPortfolioDevelopment: {
      overall: publicSalesSharePortfolio.candidate.overall,
      originClusterBootstrap:
        publicSalesSharePortfolio.candidate.originClusterBootstrap,
      forecastValueAdded:
        publicSalesSharePortfolio.forecastValueAdded
    }
  },
  challenger: {
    design: salesShareHistoryRegimeChallenger.design,
    overall: salesShareHistoryRegimeChallenger.overall,
    byOrigin: salesShareHistoryRegimeChallenger.byOrigin,
    byHorizon: salesShareHistoryRegimeChallenger.byHorizon,
    bySegment: salesShareHistoryRegimeChallenger.bySegment,
    selections: salesShareHistoryRegimeChallenger.selections,
    relativeWapeImprovementToDenseMonthlyChampion:
      historyRegimeRelativeWapeImprovement
  },
  gates: {
    improvesDenseMonthlyChampion:
      historyRegimeRelativeWapeImprovement > 0,
    developmentWapePassed:
      salesShareHistoryRegimeChallenger.overall.wape
        <= salesShareContract.thresholds.developmentWapeMaximum,
    overallAbsoluteBiasPassed:
      Math.abs(salesShareHistoryRegimeChallenger.overall.signedBias)
        <= salesShareContract.thresholds.overallAbsoluteBiasMaximum,
    eachSegmentWapePassed:
      salesShareContract.activitySegmentValues.every((segment) => (
        salesShareHistoryRegimeChallenger.bySegment[segment].wape
          <= salesShareContract.thresholds.eachSegmentWapeMaximum
      )),
    eachSegmentAbsoluteBiasPassed:
      salesShareContract.activitySegmentValues.every((segment) => (
        Math.abs(
          salesShareHistoryRegimeChallenger.bySegment[segment].signedBias
        ) <= salesShareContract.thresholds.eachSegmentAbsoluteBiasMaximum
      )),
    historicalFeatureAvailableAtPassed: false,
    independentHoldoutPassed: false,
    allAbsoluteQualityGatesPassed: historyRegimeAbsoluteQualityPassed
  },
  decision: {
    promotionDecision: "REJECT_KEEP_V0_3_WORK_LEVEL_FALLBACK",
    candidateSelectionAuthorized: false,
    operationalForecastAuthorized: false,
    reasonCodes: [
      "posthoc_same_development_window",
      "overall_WAPE_above_0_30",
      "intermittent_and_dormant_segments_failed",
      "historical_feature_available_at_not_proven",
      "independent_holdout_sealed"
    ],
    nextAction:
      "materialize_versioned_historical_availability_snapshots_then_evaluate_on_unseen_later_origin_or_separately_authorized_final_holdout"
  },
  authorization: realBillRecalibrationConfig.authorization,
  boundaries: {
    aggregateOnly: true,
    identifiersPresent: false,
    privateRowsPresent: false,
    providerCalled: false,
    databaseConnected: false,
    finalHoldoutOpened: false,
    embargoShadowOpened: false,
    deferred60MonthLabelsOpened: false,
    releaseAuthorized: false
  }
};
const salesShareAcceptance = {
  targetContractMigrated: true,
  allBuyoutExcludedFromTrainingLabels: true,
  allBuyoutExcludedFromBacktestMetrics: true,
  allBuyoutExcludedFromForecastOutput: true,
  targetPartitionConservationPassed:
    frozenTargetIsolation.maximumAbsoluteConservationDifference
      <= salesShareContract.thresholds.targetPartitionConservationTolerance
    && denseTargetIsolation.maximumAbsoluteConservationDifference
      <= salesShareContract.thresholds.targetPartitionConservationTolerance,
  targetClassificationPassed,
  workLevelDevelopmentPassed: salesShareWorkQualityPassed,
  portfolioDevelopmentBacktestPassed: salesSharePortfolioPassed,
  fullM2MaturityPassed: false,
  allCurrentDevelopmentConditionsPassed: false,
  developmentDecision:
    salesSharePortfolioPassed ? "PORTFOLIO_ONLY_PASS" : "FAIL",
  finalHoldoutOpened: false,
  releaseAuthorized: false
};
const salesShareStatus = salesSharePortfolioPassed
  ? "SALES_SHARE_TARGET_MIGRATED_PORTFOLIO_DEVELOPMENT_PASS_WORK_LEVEL_BLOCKED"
  : "SALES_SHARE_TARGET_MIGRATED_DEVELOPMENT_FAIL_BLOCKED";
const salesShareMaturityAssessment = {
  matureDataPredictionCapability: false,
  targetContractCorrected: true,
  highAccuracyPortfolioDevelopmentBacktestAvailable:
    salesSharePortfolioPassed,
  permittedClaim:
    "sales_share_only_portfolio_development_backtest",
  prohibitedClaims: [
    "buyout_forecast",
    "mature_work_level_forecasting",
    "independently_validated_production_forecast",
    "release_ready",
    "full_company_cash_coverage"
  ],
  reasons: [
    "work_level_WAPE_above_0_30",
    "intermittent_and_dormant_segments_failed",
    "portfolio_candidate_selected_on_development_data",
    "final_holdout_sealed"
  ]
};
const salesShareAutomatedEvaluation = {
  schema: "m2.current.automated_evaluation.public.v0.4",
  decisionStatus: "not_for_formal_decision",
  targetContract: {
    target: salesShareConfig.target,
    definition:
      "future_revenue_share_cash_only_excluding_all_buyout_and_identified_non_sales_cash",
    buyoutTreatment:
      "isolated_from_training_labels_backtest_metrics_and_forecast_output",
    confirmedBuyoutTreatment: "isolated_non_model_billing_audit_layer",
    pureBuyoutTreatment: "null_abstain_outside_M2_forecast_scope",
    amountConservation:
      "salesShareCashActual+isolatedBuyoutCashActual+isolatedOtherCashActual=totalLedgerCashActual"
  },
  authoritativeFrozenEvaluation: {
    caseCount: salesShareWorkRows.length,
    previousMachineClassifiedCaseCount: frozenSalesShareTargets.length,
    humanAuthorityAbstainedCaseCount,
    humanAuthorityRouteChangedCaseCount,
    humanAuthorityRouteCounts: humanAuthorityFrozenRouteCounts,
    workCount: new Set(
      salesShareWorkRows.map((row) => row.standardWorkId)
    ).size,
    originCount: new Set(
      salesShareWorkRows.map((row) => row.origin)
    ).size,
    originCadence: "frozen_sparse_semiannual",
    finalHoldoutOpened: false,
    comparisonToPrevious: salesShareComparison,
    comparisonToB4: salesShareComparison,
    multiResolution: salesShareAuthorityResolution,
    cashAndErrorConcentration:
      summarizeM2CurrentCashConcentration(salesShareWorkRows),
    targetIsolation: frozenTargetIsolation,
    interpretation:
      "same frozen work-origin-horizon keys were reclassified by user-reviewed workbook membership; pure-buyout keys abstain and are excluded from prediction metrics"
  },
  denseMonthlyDevelopmentDiagnostic: {
    role: "secondary_development_diagnostic",
    decisionPopulationMoved: false,
    workCount: denseManifest.workCount,
    originCount: denseManifest.originCount,
    materializedCaseCount: denseManifest.caseRowCount,
    labelStatusCounts: denseLabelPartition.counts,
    abstention: salesShareDenseBaselineEvaluation.routePolicy,
    rollingBaselineChampion: {
      overall: salesShareDenseChampion.overall,
      byOrigin: salesShareDenseChampion.byOrigin,
      bySegment: salesShareDenseChampion.bySegment,
      selections: salesShareDenseChampion.selections
    },
    existingChampionMultiResolution: salesShareDenseResolution,
    portfolioReconstruction: publicSalesSharePortfolio,
    targetIsolation: denseTargetIsolation
  },
  automation: {
    decision: "AUTOMATION_BLOCKED",
    gates: {
      targetPartitionConservationPassed:
        salesShareAcceptance.targetPartitionConservationPassed,
      targetClassificationPassed,
      workLevelDevelopmentPassed: salesShareWorkQualityPassed,
      portfolioDevelopmentBacktestPassed: salesSharePortfolioPassed,
      independentHoldoutPassed: false
    },
    automationAuthorized: false,
    releaseAuthorized: false
  },
  maturityAssessment: salesShareMaturityAssessment,
  retiredHumanPredictionSample:
    nextAutomatedEvaluation.retiredHumanPredictionSample,
  boundaries: nextAutomatedEvaluation.boundaries
};
const salesSharePublicReport = {
  schema: "m2.current.sales_share_candidate.public.v0.6",
  version: "M2-current-sales-share-candidate-v0.6",
  candidateId: salesShareConfig.candidate.id,
  decisionStatus: "not_for_formal_decision",
  status: salesShareStatus,
  target: salesShareConfig.target,
  primaryComparator: salesShareConfig.primaryComparator,
  targetMigration: {
    previousTarget: resolutionConfig.target,
    currentTarget: salesShareConfig.target,
    contractChangedByUserDecision: true,
    modelFamilyChanged: false,
    frozenPopulationMoved: true,
    frozenPopulationReclassifiedByHumanAuthority: true,
    previousMachineClassifiedCaseCount: frozenSalesShareTargets.length,
    currentHumanAuthorityServedCaseCount: salesShareWorkRows.length,
    humanAuthorityAbstainedCaseCount,
    humanAuthorityRouteChangedCaseCount,
    humanAuthorityRouteCounts: humanAuthorityFrozenRouteCounts,
    userConfirmation: {
      schema: "m2.current.human_ledger_partition.v0.1",
      authorityMode: denseManifest.cashClassificationAuthority,
      authoritySource: "financial_system_record",
      cashCategory: "workbook_membership_sales_share_or_buyout",
      eventType: "reversal",
      negativeCashEventPolicy:
        denseManifest.userConfirmation.negativeCashEventPolicy,
      legacyExactCellConfirmationCount:
        denseManifest.userConfirmation.legacyExactCellConfirmationCount,
      legacyExactCellConfirmationsApplied:
        denseManifest.userConfirmation.legacyExactCellConfirmationsApplied,
      machineCashClassificationUsed:
        denseManifest.machineCashClassificationUsed,
      salesShareFactCount: denseManifest.salesShareFactCount,
      buyoutFactCount: denseManifest.buyoutFactCount,
      rawEvidenceExported:
        denseManifest.userConfirmation.rawEvidenceExported,
      scope: "entire_user_reviewed_private_workbook_membership"
    },
    frozenTargetIsolation,
    denseTargetIsolation
  },
  scope: {
    frozenDecisionCaseCount: salesShareWorkRows.length,
    frozenDecisionWorkCount: new Set(
      salesShareWorkRows.map((row) => row.standardWorkId)
    ).size,
    frozenDecisionOriginCount: new Set(
      salesShareWorkRows.map((row) => row.origin)
    ).size,
    denseDiagnosticCaseCount: denseManifest.caseRowCount,
    denseDiagnosticOriginCount: denseManifest.originCount,
    portfolioEvaluationOriginCount:
      publicSalesSharePortfolio.candidate.originCount,
    portfolioEvaluationCellCount:
      publicSalesSharePortfolio.candidate.originHorizonCellCount,
    populationMoved: true,
    populationChangeReason:
      "user_reviewed_buyout_workbook_membership_replaced_machine_route_inference"
  },
  pointComparisonToPrevious: {
    comparison: salesShareComparison,
    pairedCi: salesSharePairedCi,
    interpretation:
      "same_work_level_candidate_predictions_rescored_against_sales_share_only_actuals"
  },
  pointComparisonToB4: {
    comparison: salesShareComparison,
    pairedCi: salesSharePairedCi
  },
  byHorizon: salesShareByHorizon,
  bySegment: salesShareBySegment,
  pairedCi: salesSharePairedCi,
  multiResolution: {
    workLevelFallbackCandidateId: nextConfig.candidate.id,
    authoritativeSparseOriginDiagnostic: salesShareAuthorityResolution,
    denseMonthlyExistingChampionDiagnostic: salesShareDenseResolution,
    portfolioReconstruction: publicSalesSharePortfolio,
    cashAndErrorConcentration:
      summarizeM2CurrentCashConcentration(salesShareWorkRows)
  },
  maturityAssessment: salesShareMaturityAssessment,
  automation: salesShareAutomatedEvaluation.automation,
  acceptance: salesShareAcceptance,
  developmentAuthorization: {
    modelTraining: true,
    newCandidateFamilyDevelopment: false,
    finalHoldout: false,
    release: false,
    m3Formal: false
  },
  humanEvaluation: {
    numericForecastRequired: false,
    sample120Required: false,
    sample120Replayed: false,
    role: "post_gate_quality_assurance_only"
  },
  privacy: {
    aggregateOnly: true,
    workIdentifiersPresent: false,
    privatePathsPresent: false,
    rawRowsPresent: false
  }
};
const salesSharePublicText =
  `${JSON.stringify(salesSharePublicReport, null, 2)}\n`;
const salesShareAutomatedText =
  `${JSON.stringify(salesShareAutomatedEvaluation, null, 2)}\n`;
const salesSharePortfolioPrivateText =
  salesSharePortfolioPrivateRows.map((row) => JSON.stringify({
    ...row,
    seasonalNaivePointEstimate:
      salesSharePortfolioPrivateComparatorRows.find((candidateRow) => (
        candidateRow.origin === row.origin
        && candidateRow.horizonMonths === row.horizonMonths
      ))?.pointEstimate
  })).join("\n") + "\n";
const salesSharePortfolioPrivatePath = path.join(
  privateDirectory,
  "M2-current-sales-share-portfolio-cells-private-v0.6.ndjson"
);
const salesSharePortfolioPrivateManifestPath = path.join(
  privateDirectory,
  "M2-current-sales-share-portfolio-manifest-private-v0.6.json"
);
await writeFile(
  salesSharePortfolioPrivatePath,
  salesSharePortfolioPrivateText,
  "utf8"
);
await writeFile(
  salesSharePortfolioPrivateManifestPath,
  `${JSON.stringify({
    schema: "m2.current.sales_share_portfolio.private_manifest.v0.6",
    tracked: false,
    decisionStatus: "not_for_formal_decision",
    targetPolicy: "sales_share_cash_only",
    privateCellRowCount: salesSharePortfolioPrivateRows.length,
    privateCellSha256: sha256(salesSharePortfolioPrivateText),
    frozenTargetSha256: sha256(frozenSalesShareTargetText),
    publicCandidateSha256: sha256(salesSharePublicText),
    publicAutomatedEvaluationSha256:
      sha256(salesShareAutomatedText),
    providerCalled: false,
    databaseConnected: false,
    finalHoldoutOpened: false,
    embargoShadowOpened: false,
    deferred60MonthLabelsOpened: false,
    releaseAuthorized: false
  }, null, 2)}\n`,
  "utf8"
);
await writeFile(
  path.join(root, salesShareConfig.publicSources.candidate),
  salesSharePublicText,
  "utf8"
);
await writeFile(
  path.join(root, salesShareConfig.publicSources.automatedEvaluation),
  salesShareAutomatedText,
  "utf8"
);
await writeFile(
  path.join(root, realBillRecalibrationConfig.publicOutput),
  `${JSON.stringify(realBillRecalibrationReport, null, 2)}\n`,
  "utf8"
);

process.stdout.write(`${JSON.stringify({
  candidateId: salesShareConfig.candidate.id,
  previousMachineClassifiedCaseCount: candidate.rows.length,
  currentHumanAuthorityServedCaseCount: salesShareWorkRows.length,
  currentHumanAuthorityServedWorkCount:
    new Set(salesShareWorkRows.map((row) => row.standardWorkId)).size,
  humanAuthorityAbstainedCaseCount,
  candidateWape: nextComparison.candidate.wape,
  baseCandidateWape: nextComparison.b4.wape,
  relativeWape: nextComparison.relativeWape,
  candidateSignedBias: nextComparison.candidate.signedBias,
  pairedCiUpper95: nextPairedCi.upper95,
  denseMonthlyOriginCount: denseManifest.originCount,
  denseMonthlyCaseCount: denseManifest.caseRowCount,
  probabilisticWis: probabilistic.overall.wis,
  automationDecision: automation.decision,
  portfolioDevelopmentWape:
    publicPortfolioReconstruction.candidate.overall.wape,
  portfolioDevelopmentBias:
    publicPortfolioReconstruction.candidate.overall.signedBias,
  portfolioForecastValueAdded:
    publicPortfolioReconstruction.forecastValueAdded,
  portfolioDevelopmentPassed,
  salesShareTargetMigrated: true,
  salesShareWorkWape: salesShareComparison.candidate.wape,
  salesShareWorkBias: salesShareComparison.candidate.signedBias,
  salesSharePortfolioWape:
    publicSalesSharePortfolio.candidate.overall.wape,
  salesSharePortfolioBias:
    publicSalesSharePortfolio.candidate.overall.signedBias,
  salesSharePortfolioDevelopmentPassed: salesSharePortfolioPassed,
  frozenTargetIsolation,
  denseTargetIsolation,
  historyRegimeRecalibration: {
    wape: salesShareHistoryRegimeChallenger.overall.wape,
    signedBias: salesShareHistoryRegimeChallenger.overall.signedBias,
    relativeWapeImprovementToDenseMonthlyChampion:
      historyRegimeRelativeWapeImprovement,
    promotionDecision:
      realBillRecalibrationReport.decision.promotionDecision
  },
  fullM2MaturityPassed: false,
  automatedEvaluationBaselines:
    Object.keys(denseBaselineEvaluation.baselines),
  eligibilityReasonLedgerWorkCount: eligibilityLedger.length,
  formalCashRouteExcludedWorkCount: routeExcludedWorkCount,
  acceptance: nextCandidateAcceptance
}, null, 2)}\n`);

function parseNdjson(value) {
  return value.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
}

function verifyPrivateSourceManifest({
  manifest,
  expectedSchema,
  expectedCountField,
  expectedDigestField,
  text
}) {
  const rowCount = text.split(/\r?\n/u).filter(Boolean).length;
  if (
    manifest.schema !== expectedSchema
    || manifest.tracked !== false
    || manifest.decisionStatus !== "not_for_formal_decision"
    || manifest.finalHoldoutOpened !== false
    || manifest.embargoShadowOpened !== false
    || manifest.deferred60MonthLabelsOpened !== false
    || Number(manifest[expectedCountField]) !== rowCount
    || manifest[expectedDigestField] !== sha256(text)
  ) {
    throw new Error("m2_current_private_source_manifest_invalid");
  }
}

function verifyPrivatePayload(payload, currentContract) {
  const expectedHash = sha256(canonicalJson({
    candidateVersion: payload.candidateVersion,
    algorithmVersion: payload.algorithmVersion,
    factChecksum: payload.factImport?.factChecksum,
    recordInputHashes: payload.records?.map((record) => record.inputHash)
  }));
  if (
    payload.schema !== "m2.formal_execution_private_payload.v1"
    || payload.privateOnly !== true
    || payload.notForCommit !== true
    || payload.finalReleaseApproved !== false
    || !Array.isArray(payload.records)
    || payload.records.length !== currentContract.population.libraryWorkCount
    || payload.payloadHash !== expectedHash
  ) {
    throw new Error("m2_current_private_authority_payload_invalid");
  }
}

function isDevelopmentB4ModelCase(row) {
  return (
    row.modelId === "B4"
    && String(row.predictionRole).startsWith("development_forward_score:")
    && row.statisticallyScoreable === true
    && row.businessServingEligible === true
    && row.modelPredictionAvailable === true
    && row.abstained === false
    && Number.isFinite(Number(row.servedPrediction))
  );
}

function normalizeComparator(row) {
  assertM2CurrentModelCaseRoute({
    revenueModel: row.strata?.revenue_model,
    origin: row.caseKey.origin
  });
  return {
    standardWorkId: String(row.caseKey.standard_work_id),
    origin: row.caseKey.origin,
    horizonMonths: Number(row.caseKey.horizon_months),
    route: row.caseKey.route,
    actual: Number(row.forecastableCashActual),
    pointEstimate: Number(row.servedPrediction),
    labelAvailableAsOf: row.labelAvailableAsOf,
    strata: {
      spike_candidate: row.strata?.spike_candidate,
      value_band: row.strata?.value_band,
      historicalFeaturePolicy: row.strata?.historicalFeaturePolicy,
      sourceShelfRightsTermPolicy: row.strata?.sourceShelfRightsTermPolicy
    }
  };
}

function normalizeSegment(row) {
  return {
    standardWorkId: String(row.caseKey.standard_work_id),
    origin: row.caseKey.origin,
    horizonMonths: Number(row.caseKey.horizon_months),
    route: row.caseKey.route,
    segment: row.activitySegment
  };
}

function buildEligibilityLedger(records, c2Rows) {
  if (!Array.isArray(records)) {
    throw new Error("m2_current_private_authority_records_required");
  }
  const rowsByWork = new Map();
  for (const row of c2Rows) {
    const workId = String(row.caseKey.standard_work_id);
    const values = rowsByWork.get(workId) ?? [];
    values.push(row);
    rowsByWork.set(workId, values);
  }
  const seen = new Set();
  return records.map((record) => {
    const standardWorkId = String(record.standardWorkId);
    if (seen.has(standardWorkId)) {
      throw new Error("m2_current_private_authority_duplicate_work");
    }
    seen.add(standardWorkId);
    const rows = rowsByWork.get(standardWorkId) ?? [];
    let reason;
    if (rows.some(isServedC2Case)) {
      reason = "model_eligible";
    } else if (rows.length === 0) {
      reason = "not_observable_at_any_frozen_development_origin";
    } else {
      const abstentionReasons = new Set(
        rows.map((row) => row.abstentionReason).filter(Boolean)
      );
      if (abstentionReasons.has("unknown_revenue_model")) {
        reason = "formal_cash_route_unknown";
      } else if (
        abstentionReasons.has("uncommitted_future_buyout_not_forecastable")
      ) {
        reason = "formal_cash_route_uncommitted";
      } else {
        reason = "insufficient_history_at_every_eligible_origin";
      }
    }
    return { standardWorkId, reason };
  });
}

function isServedC2Case(row) {
  return (
    row.statisticallyScoreable === true
    && row.businessServingEligible === true
    && row.modelPredictionAvailable === true
    && row.servedPrediction !== null
    && !row.abstentionReason
  );
}

function countBy(rows, selector) {
  const counts = {};
  for (const row of rows) {
    const key = selector(row);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))
  );
}

function caseKey(row) {
  return [
    row.standardWorkId,
    row.origin,
    row.horizonMonths,
    row.route
  ].join("|");
}

function pairedSlices(candidateSlices, b4Slices) {
  return Object.fromEntries(Object.keys(candidateSlices).map((key) => [
    key,
    {
      candidate: candidateSlices[key],
      b4: b4Slices[key],
      relativeWape: candidateSlices[key].wape / b4Slices[key].wape - 1
    }
  ]));
}

function evaluationViews(rows) {
  return {
    overall: scoreM2CurrentEvaluationRows(rows),
    byHorizon: scoreM2CurrentEvaluationSlices(rows, "horizonMonths"),
    bySegment: scoreM2CurrentEvaluationSlices(rows, "segment"),
    byRoute: scoreM2CurrentEvaluationSlices(rows, "route")
  };
}

function pairedGroupConfidenceIntervals(
  candidateRows,
  comparatorRows,
  field,
  currentContract
) {
  const values = [...new Set(candidateRows.map(
    (row) => String(row[field])
  ))].sort();
  return Object.fromEntries(values.map((value, index) => {
    const candidateSubset = candidateRows.filter(
      (row) => String(row[field]) === value
    );
    const keys = new Set(candidateSubset.map(caseKey));
    const comparatorSubset = comparatorRows.filter(
      (row) => keys.has(caseKey(row))
    );
    return [value, pairedWorkOriginBootstrap(
      candidateSubset,
      comparatorSubset,
      currentContract,
      {
        iterations: 500,
        seed: currentContract.pairedBootstrap.seed + index + 1
      }
    )];
  }));
}

function strongestBaselineRows(rowsByBaseline) {
  return Object.entries(rowsByBaseline).map(([id, rows]) => ({
    id,
    rows,
    metrics: scoreM2CurrentEvaluationRows(rows)
  })).sort((a, b) => (
    a.metrics.wape - b.metrics.wape
    || Math.abs(a.metrics.signedBias) - Math.abs(b.metrics.signedBias)
    || a.id.localeCompare(b.id)
  ))[0].rows;
}

function summarizeSalesShareTarget(rows, legacyActualField) {
  const values = rows.map((row) => ({
    legacy: Number(row[legacyActualField]),
    salesShare: Number(row.salesShareCashActual),
    buyout: Number(row.isolatedBuyoutCashActual),
    other: Number(row.isolatedOtherCashActual),
    total: Number(row.totalLedgerCashActual),
    uncertain: Number(row.classificationUncertainCashActual),
    userConfirmedSalesShare:
      Number(row.userConfirmedSalesShareCashActual),
    userConfirmedSalesShareEventCount:
      Number(row.userConfirmedSalesShareEventCount)
  }));
  if (
    values.length === 0
    || values.some((row) => Object.values(row).some(
      (value) => !Number.isFinite(value)
    ))
  ) {
    throw new Error("m2_current_sales_share_target_audit_invalid");
  }
  const sum = (field) => values.reduce(
    (total, row) => total + row[field],
    0
  );
  const totalAbsoluteCash = values.reduce(
    (total, row) => total + Math.abs(row.total),
    0
  );
  const conservationDifferences = values.map(
    (row) => row.salesShare + row.buyout + row.other - row.total
  );
  return {
    caseCount: values.length,
    targetChangedCaseCount: values.filter(
      (row) => Math.abs(row.legacy - row.salesShare) > 0.000001
    ).length,
    legacyForecastableCashCaseSum: sum("legacy"),
    salesShareCashCaseSum: sum("salesShare"),
    isolatedBuyoutCashCaseSum: sum("buyout"),
    isolatedOtherCashCaseSum: sum("other"),
    totalLedgerCashCaseSum: sum("total"),
    salesShareEconomicShareOfCaseLedgerCash:
      sum("total") === 0 ? null : sum("salesShare") / sum("total"),
    classificationUncertainCashShare:
      totalAbsoluteCash === 0
        ? 0
        : values.reduce(
          (total, row) => total + Math.abs(row.uncertain),
          0
        ) / totalAbsoluteCash,
    classificationUncertainCaseCount:
      values.filter((row) => row.uncertain !== 0).length,
    classificationUncertainCashCaseSum: sum("uncertain"),
    classificationUncertainAbsoluteCashCaseSum:
      values.reduce(
        (total, row) => total + Math.abs(row.uncertain),
        0
      ),
    userConfirmedSalesShareCashCaseSum: sum("userConfirmedSalesShare"),
    userConfirmedSalesShareCaseCount:
      values.filter((row) => row.userConfirmedSalesShareEventCount > 0).length,
    maximumAbsoluteConservationDifference: Math.max(
      ...conservationDifferences.map(Math.abs)
    ),
    legacyDistribution: distributionSummary(
      values.map((row) => row.legacy)
    ),
    salesShareDistribution: distributionSummary(
      values.map((row) => row.salesShare)
    ),
    overlappingCaseSumsNotFullLibraryEconomicTotals: true
  };
}

function distributionSummary(values) {
  const ordered = [...values].sort((a, b) => a - b);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce(
    (sum, value) => sum + (value - mean) ** 2,
    0
  ) / values.length;
  return {
    zeroShare: values.filter((value) => value === 0).length / values.length,
    positiveShare: values.filter((value) => value > 0).length / values.length,
    mean,
    standardDeviation: Math.sqrt(variance),
    coefficientOfVariation:
      mean === 0 ? null : Math.sqrt(variance) / Math.abs(mean),
    p50: quantile(ordered, 0.5),
    p90: quantile(ordered, 0.9),
    p99: quantile(ordered, 0.99)
  };
}

function quantile(ordered, probability) {
  const index = (ordered.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) {
    return ordered[lower];
  }
  const weight = index - lower;
  return ordered[lower] * (1 - weight) + ordered[upper] * weight;
}

function verifyDenseManifest(
  manifest,
  caseText,
  historyText,
  frozenSalesShareTargetText
) {
  if (
    manifest.schema
      !== "m2.current.dense_development.private_manifest.v0.2"
    || manifest.tracked !== false
    || manifest.decisionStatus !== "not_for_formal_decision"
    || manifest.role !== "secondary_development_diagnostic"
    || manifest.decisionPopulationMoved !== false
    || manifest.workCount !== nextContract.population.modelWorkCount
    || manifest.originCount !== 25
    || manifest.caseRowCount !== parseNdjson(caseText).length
    || manifest.historyRowCount !== parseNdjson(historyText).length
    || manifest.frozenSalesShareTargetRowCount
      !== parseNdjson(frozenSalesShareTargetText).length
    || manifest.caseSha256 !== sha256(caseText)
    || manifest.historySha256 !== sha256(historyText)
    || manifest.frozenSalesShareTargetSha256
      !== sha256(frozenSalesShareTargetText)
    || manifest.targetPolicy !== "sales_share_cash_only"
    || manifest.allBuyoutExcludedFromForecast !== true
    || manifest.providerCalled !== false
    || manifest.databaseConnected !== false
    || manifest.finalHoldoutOpened !== false
    || manifest.embargoShadowOpened !== false
    || manifest.deferred60MonthLabelsOpened !== false
  ) {
    throw new Error("m2_current_dense_private_manifest_invalid");
  }
}

function addMonths(value, count) {
  const [year, month] = String(value).split("-").map(Number);
  const ordinal = year * 12 + month - 1 + Number(count);
  return `${Math.floor(ordinal / 12)}-${String(
    ordinal % 12 + 1
  ).padStart(2, "0")}`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    )).join(",")}}`;
  }
  return JSON.stringify(value);
}
