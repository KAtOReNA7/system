import { createHash } from "node:crypto";
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
  buildM2CurrentAutomatedBaselineEvaluation
} from "../../src/domain/m2Current/baselines.js";
import {
  buildM2CurrentOccurrenceAmountCandidate,
  buildM2CurrentReliableCandidate
} from "../../src/domain/m2Current/candidate.js";
import { compareM2CurrentCandidateToB4 } from "../../src/domain/m2Current/comparator.js";
import { buildM2CurrentContract } from "../../src/domain/m2Current/contract.js";
import {
  scoreM2CurrentEvaluationRows,
  scoreM2CurrentEvaluationSlices,
  scoreM2CurrentSlices
} from "../../src/domain/m2Current/metrics.js";
import { assertM2CurrentModelCaseRoute } from "../../src/domain/m2Current/route.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const config = JSON.parse(
  await readFile(path.join(root, "config/m2-current.v0.3.json"), "utf8")
);
const previousConfig = JSON.parse(
  await readFile(path.join(root, "config/m2-current.v0.2.json"), "utf8")
);
const contract = buildM2CurrentContract(config);
const previousContract = buildM2CurrentContract(previousConfig);
const populationReport = JSON.parse(
  await readFile(path.join(root, config.publicSources.population), "utf8")
);
if (!contract.authorizations.modelTraining) {
  throw new Error("m2_current_candidate_development_not_authorized");
}
if (contract.authorizations.holdout || contract.authorizations.release) {
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

process.stdout.write(`${JSON.stringify({
  candidateId: candidate.candidateId,
  caseCount: candidate.rows.length,
  workCount: publicReport.scope.uniqueWorkCount,
  candidateWape: comparison.candidate.wape,
  baseCandidateWape: comparison.b4.wape,
  relativeWape: comparison.relativeWape,
  candidateSignedBias: comparison.candidate.signedBias,
  pairedCiUpper95: pairedCi.upper95,
  relativeWapeVsPreviousCandidate: previousComparison.relativeWape,
  pairedCiVsPreviousCandidateUpper95: pairedCiVsPreviousCandidate.upper95,
  automatedEvaluationBaselines:
    Object.keys(automatedEvaluation.simpleBaselines),
  eligibilityReasonLedgerWorkCount: eligibilityLedger.length,
  formalCashRouteExcludedWorkCount: routeExcludedWorkCount,
  acceptance: publicReport.acceptance
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
