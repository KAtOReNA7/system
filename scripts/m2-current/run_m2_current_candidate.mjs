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
  evaluateM2CurrentAutomationPolicy
} from "../../src/domain/m2Current/automation.js";
import { assertM2CurrentModelCaseRoute } from "../../src/domain/m2Current/route.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const config = JSON.parse(
  await readFile(path.join(root, "config/m2-current.v0.3.json"), "utf8")
);
const nextConfig = JSON.parse(
  await readFile(path.join(root, "config/m2-current.v0.4.json"), "utf8")
);
const previousConfig = JSON.parse(
  await readFile(path.join(root, "config/m2-current.v0.2.json"), "utf8")
);
const contract = buildM2CurrentContract(config);
const nextContract = buildM2CurrentContract(nextConfig);
const previousContract = buildM2CurrentContract(previousConfig);
const populationReport = JSON.parse(
  await readFile(path.join(root, config.publicSources.population), "utf8")
);
if (
  !contract.authorizations.modelTraining
  || !nextContract.authorizations.modelTraining
) {
  throw new Error("m2_current_candidate_development_not_authorized");
}
if (
  nextContract.authorizations.newCandidateFamilyDevelopment
  || contract.authorizations.holdout
  || contract.authorizations.release
  || nextContract.authorizations.holdout
  || nextContract.authorizations.release
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
const denseManifest = JSON.parse(await readFile(
  path.join(
    denseDirectory,
    "M2-current-dense-manifest-private-v0.1.json"
  ),
  "utf8"
));
verifyDenseManifest(denseManifest, denseCaseText, denseHistoryText);
const denseHistoryByKey = new Map(parseNdjson(denseHistoryText).map(
  (row) => [row.historyKey, row.historySeries]
));
const denseCases = parseNdjson(denseCaseText).map((row) => ({
  ...row,
  revenueModel: row.route,
  historySeries: denseHistoryByKey.get(row.historyKey)
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

process.stdout.write(`${JSON.stringify({
  candidateId: nextConfig.candidate.id,
  caseCount: candidate.rows.length,
  workCount: publicReport.scope.uniqueWorkCount,
  candidateWape: nextComparison.candidate.wape,
  baseCandidateWape: nextComparison.b4.wape,
  relativeWape: nextComparison.relativeWape,
  candidateSignedBias: nextComparison.candidate.signedBias,
  pairedCiUpper95: nextPairedCi.upper95,
  denseMonthlyOriginCount: denseManifest.originCount,
  denseMonthlyCaseCount: denseManifest.caseRowCount,
  probabilisticWis: probabilistic.overall.wis,
  automationDecision: automation.decision,
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

function verifyDenseManifest(manifest, caseText, historyText) {
  if (
    manifest.schema
      !== "m2.current.dense_development.private_manifest.v0.1"
    || manifest.tracked !== false
    || manifest.decisionStatus !== "not_for_formal_decision"
    || manifest.role !== "secondary_development_diagnostic"
    || manifest.decisionPopulationMoved !== false
    || manifest.workCount !== nextContract.population.modelWorkCount
    || manifest.originCount !== 25
    || manifest.caseRowCount !== parseNdjson(caseText).length
    || manifest.historyRowCount !== parseNdjson(historyText).length
    || manifest.caseSha256 !== sha256(caseText)
    || manifest.historySha256 !== sha256(historyText)
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
