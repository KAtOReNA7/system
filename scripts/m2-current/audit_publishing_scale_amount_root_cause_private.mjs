import { createHash } from "node:crypto";
import {
  createReadStream,
  promises as fs
} from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { Transform } from "node:stream";
import { fileURLToPath } from "node:url";

import {
  accumulateM2Psc01EvaluationRow,
  createM2Psc01AmountAuditAccumulator,
  finalizeM2Psc01AmountAudit,
  scoreM2Psc01CaseRows
} from "../../src/domain/m2Current/publishingScaleAmountScaleAudit.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const privateDirectory = resolveWithinRoot(
  "data/private-output/m2-current-publishing-scale-channel"
);
const outputPath = path.join(
  privateDirectory,
  "M2-publishing-scale-channel-amount-scale-root-cause-audit-aggregate-private-v0.1.json"
);
const publicOutputPath = resolveWithinRoot(
  "docs/analysis/m2-current/"
    + "M2-publishing-scale-channel-amount-scale-root-cause-audit-v0.1.json"
);

await main();

async function main() {
  const [config, publicDevelopment, publicForecastability] = await Promise.all([
    readJson("config/m2-current-publishing-scale-channel.v0.1.json"),
    readJson(
      "docs/analysis/m2-current/"
        + "M2-current-publishing-scale-channel-development-v0.1.json"
    ),
    readJson(
      "docs/analysis/m2-current/"
        + "M2-current-publishing-scale-channel-forecastability-v0.1.json"
    )
  ]);
  const completed = await findUniqueCompletedReceipt();
  const receipt = completed.value;
  const manifest = await readJsonAbsolute(path.join(
    privateDirectory,
    basename(receipt.outputFiles.evaluationManifest)
  ));
  validateFrozenBindings({ receipt, manifest, publicDevelopment });
  const accumulator = createM2Psc01AmountAuditAccumulator({
    namedPlatforms: config.nodes.namedPlatforms
  });
  const evaluationPath = path.join(
    privateDirectory,
    basename(receipt.outputFiles.evaluationRows)
  );
  const evaluationScan = await scanNdjson({
    filePath: evaluationPath,
    label: "PSC01_FROZEN_EVALUATION",
    onRow: (row) => accumulateM2Psc01EvaluationRow(accumulator, row)
  });
  const finalized = finalizeM2Psc01AmountAudit(accumulator);
  const preparedDirectory = resolveWithinRoot(
    receipt.preparedBundle.relativeDirectory
  );
  const comparatorFile = basename(
    receipt.preparedBundle.preparedFiles.learnedGlobalEvaluation
  );
  const comparatorManifestFile = basename(
    receipt.preparedBundle.preparedFiles.learnedGlobalEvaluationManifest
  );
  const comparatorManifest = await readJsonAbsolute(path.join(
    preparedDirectory,
    comparatorManifestFile
  ));
  const comparator = await verifyComparator({
    filePath: path.join(preparedDirectory, comparatorFile),
    finalized,
    publicDevelopment
  });
  const sourceAudit = await auditImplementationSource(config);
  const publicReconciliation = reconcilePublicEvidence({
    finalized,
    comparator,
    publicDevelopment,
    publicForecastability
  });
  const expectedEvaluationDigest = manifest.sha256;
  const expectedComparatorDigest =
    receipt.preparedBundle.normalizedContentDigests.learnedGlobalEvaluation;
  const result = {
    schema:
      "m2.current.publishing_scale_channel_amount_root_cause_audit_private.v0.1",
    tracked: false,
    auditOnly: true,
    candidateFitExecuted: false,
    candidatePredictionGenerated: false,
    candidatePredictionModified: false,
    finalHoldoutOpened: false,
    laterOriginOpened: false,
    modelId: "M2-CHAN-PSC01",
    candidateId: "M2-CHAN-PSC01-RAW",
    actualDefinitionId:
      "M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01",
    frozenEvidence: {
      uniqueCompletedReceipt: true,
      receiptStatus: receipt.status,
      receiptAttemptNumber: receipt.attemptNumber,
      manifestRowCount: manifest.rowCount,
      scannedRowCount: evaluationScan.rowCount,
      evaluationDigestMatchesManifest:
        evaluationScan.sha256 === expectedEvaluationDigest,
      evaluationDigestMatchesReceipt:
        evaluationScan.sha256 === receipt.outputSha256,
      evaluationRowCountMatches:
        evaluationScan.rowCount === manifest.rowCount
          && evaluationScan.rowCount === receipt.outputRowCount
          && evaluationScan.rowCount === receipt.predictionRowsProduced,
      comparatorDigestMatchesPreparedReceipt:
        comparator.sha256 === expectedComparatorDigest,
      comparatorDigestMatchesManifest:
        comparator.sha256 === comparatorManifest.sha256,
      comparatorRowCountMatchesManifest:
        comparator.rowCount === comparatorManifest.rowCount,
      publicCandidateFreezeMatches:
        publicDevelopment.candidateFreeze.rowCount === manifest.rowCount,
      rawCandidatePreserved: manifest.rawCandidatePreserved === true,
      fallbackOverwroteRaw: manifest.fallbackOverwroteRaw === true,
      predictionGeneratedAfterFreezeCount:
        receipt.predictionGeneratedAfterFreezeCount,
      predictionModifiedAfterFreezeCount:
        receipt.predictionModifiedAfterFreezeCount
    },
    implementation: sourceAudit,
    comparator,
    computed: finalized.public,
    publicReconciliation
  };
  assertAuditComplete(result);
  const publicAudit = buildPublicAudit(result);
  await Promise.all([
    fs.writeFile(outputPath, JSON.stringify(result, null, 2) + "\n", "utf8"),
    fs.writeFile(
      publicOutputPath,
      JSON.stringify(publicAudit, null, 2) + "\n",
      "utf8"
    )
  ]);
  process.stdout.write(JSON.stringify({
    status: "M2_PSC01_FROZEN_AMOUNT_SCALE_AUDIT_AGGREGATE_COMPLETE",
    evaluationRows: evaluationScan.rowCount,
    comparatorRows: comparator.rowCount,
    invariantStatus: finalized.public.invariantStatus,
    comparatorIntegrity: comparator.status,
    publicEvidenceReconciled: publicReconciliation.status,
    candidateFitExecuted: false,
    candidatePredictionGenerated: false,
    privateDerivedOutput:
      path.relative(root, outputPath).replaceAll("\\", "/"),
    publicOutput:
      path.relative(root, publicOutputPath).replaceAll("\\", "/")
  }) + "\n");
}

function buildPublicAudit(result) {
  const primary = result.publicReconciliation.families.primary;
  const strict = result.publicReconciliation.families.strict;
  return {
    schema:
      "m2.current.publishing_scale_channel_amount_scale_root_cause_audit.v0.1",
    auditId: "M2-AUDIT-PSC01-AMOUNT-SCALE-ROOT-CAUSE-01",
    modelId: "M2-CHAN-PSC01",
    experimentId: "M2-EXP-PUBLISHING-SCALE-CHANNEL-01",
    candidateId: "M2-CHAN-PSC01-RAW",
    objectType: "FROZEN_MODEL_ROOT_CAUSE_AUDIT",
    status:
      "M2_PSC01_AMOUNT_SCALE_ROOT_CAUSE_AUDIT_COMPLETE_ESTIMATOR_SCALE_SHRINKAGE_CONFIRMED",
    rootCause: {
      category:
        "ESTIMATOR_SCALE_SHRINKAGE_CONFIRMED_IMPLEMENTATION_CORRECT",
      firstMaterialCollapseStage: "originVisibleEmpiricalParent",
      implementationOrUnitTransformDefectConfirmed: false,
      comparatorIntegrityDefectConfirmed: false,
      estimatorScaleShrinkageConfirmed: true,
      multipleUnresolvedFactors: false,
      frozenPrivateEvidenceMissing: false,
      explanation: [
        "The work-balanced log1p empirical parent begins far below cash mass before learned hierarchy refinements.",
        "Conditional-amount error dominates the frozen oracle decomposition while occurrence error is small.",
        "Log-scale ridge estimation and log-scale hierarchical blending preserve a geometric-center objective that contracts heavy-tailed cash scale.",
        "Mechanism and named-platform layers recover some local error but do not restore the missing cash scale."
      ]
    },
    frozenEvidence: {
      uniqueCompletedReceipt: result.frozenEvidence.uniqueCompletedReceipt,
      receiptStatus: result.frozenEvidence.receiptStatus,
      evaluationRowCount: result.frozenEvidence.scannedRowCount,
      evaluationDigestMatchesManifest:
        result.frozenEvidence.evaluationDigestMatchesManifest,
      evaluationDigestMatchesReceipt:
        result.frozenEvidence.evaluationDigestMatchesReceipt,
      evaluationRowCountMatches:
        result.frozenEvidence.evaluationRowCountMatches,
      comparatorRowCount: result.comparator.rowCount,
      comparatorDigestMatchesPreparedReceipt:
        result.frozenEvidence.comparatorDigestMatchesPreparedReceipt,
      comparatorDigestMatchesManifest:
        result.frozenEvidence.comparatorDigestMatchesManifest,
      comparatorRowCountMatchesManifest:
        result.frozenEvidence.comparatorRowCountMatchesManifest,
      publicCandidateFreezeMatches:
        result.frozenEvidence.publicCandidateFreezeMatches,
      rawCandidatePreserved: result.frozenEvidence.rawCandidatePreserved,
      fallbackOverwroteRaw: result.frozenEvidence.fallbackOverwroteRaw,
      predictionGeneratedAfterFreezeCount:
        result.frozenEvidence.predictionGeneratedAfterFreezeCount,
      predictionModifiedAfterFreezeCount:
        result.frozenEvidence.predictionModifiedAfterFreezeCount
    },
    implementationTrace: result.implementation,
    comparatorIntegrity: {
      status: result.comparator.status,
      counts: result.comparator.counts,
      semantics: result.comparator.comparisonSemantics,
      scores: result.comparator.scores
    },
    frozenScoreReconciliation: {
      status: result.publicReconciliation.status,
      primary,
      strict,
      rawCandidatePreserved:
        result.publicReconciliation.rawCandidatePreserved,
      fallbackOverwroteRaw:
        result.publicReconciliation.fallbackOverwroteRaw
    },
    scaleEvidence: {
      invariantStatus: result.computed.invariantStatus,
      invariantFailures: result.computed.invariantFailures,
      evaluationRowCount: result.computed.rowCount,
      channelCaseCount: result.computed.channelCaseCount,
      workCaseCount: result.computed.workCaseCount,
      rowDiagnostics: result.computed.rowDiagnostics,
      primaryConditionalAmountOracleRemovableErrorShare:
        primary.oracle.ORACLE_AMOUNT_ONLY.removableErrorShare,
      primaryOccurrenceOracleRemovableErrorShare:
        primary.oracle.ORACLE_OCCURRENCE_ONLY.removableErrorShare,
      strictConditionalAmountOracleRemovableErrorShare:
        strict.oracle.ORACLE_AMOUNT_ONLY.removableErrorShare,
      strictOccurrenceOracleRemovableErrorShare:
        strict.oracle.ORACLE_OCCURRENCE_ONLY.removableErrorShare,
      primaryMechanismTimeRelativeErrorGain:
        primary.mechanismTimeRelativeErrorGain,
      strictMechanismTimeRelativeErrorGain:
        strict.mechanismTimeRelativeErrorGain
    },
    privacy: result.computed.privacy,
    aggregates: compactAggregates(result.computed.aggregates),
    normalizedChannelComposition: result.computed.normalizedComposition,
    normalizedChannelCompositionPolicy: {
      diagnosticLabel: "POST_HOC_DIAGNOSTIC_NOT_MODEL_EVIDENCE",
      actualDerivedScalarUsed: true,
      participatesInTraining: false,
      participatesInSelection: false,
      participatesInGate: false,
      registeredAsCandidateScore: false
    },
    psc02DesignDecision: {
      status: "PSC02_DESIGN_PREREGISTRATION_SUPPORTED_NOT_AUTHORIZED",
      supportedForSeparatePreregistration: true,
      implementationAuthorized: false,
      fittingAuthorized: false,
      evaluationAuthorized: false,
      requiredDesignFocus: [
        "cash-scale-aligned conditional amount estimator",
        "origin-safe calibration without evaluation-actual scalars",
        "preserved raw candidate and same-case comparator",
        "separate channel-composition diagnostics"
      ]
    },
    authorizationBoundaries: {
      psc02Created: false,
      candidateFitExecuted: false,
      candidatePredictionGenerated: false,
      laterOriginOpened: false,
      finalHoldoutOpened: false,
      productionModified: false,
      routeModified: false,
      apiModified: false,
      databaseConnected: false,
      providerConnected: false
    },
    publication: {
      privateRowsIncluded: false,
      workIdentitiesIncluded: false,
      channelUidsIncluded: false,
      privatePathsIncluded: false,
      digestsIncluded: false
    }
  };
}

function compactAggregates(aggregates) {
  return Object.fromEntries(Object.entries(aggregates).map(
    ([dimension, cells]) => [dimension, cells.map((cell) => {
      const { metrics, ...identity } = cell;
      if (metrics === null) return { ...identity, metrics: null };
      return {
        ...identity,
        metrics: {
          monthlyRowCount: metrics.monthlyRowCount,
          actualNetTotal: metrics.actualNetTotal,
          stagePredictionToActualNetRatio: Object.fromEntries(
            Object.entries(metrics.stages).map(([stage, value]) => [
              stage,
              value.predictionToActualNetRatio
            ])
          ),
          finalWape: metrics.stages.final.wape,
          finalConditionalAmountMassRatio:
            metrics.stages.final.conditionalAmountMassRatio,
          finalObservedOccurrenceMassRatio:
            metrics.stages.final.observedOccurrenceMassRatio
        }
      };
    })]
  ));
}

async function findUniqueCompletedReceipt() {
  const names = (await fs.readdir(privateDirectory)).filter((name) => (
    name.startsWith(
      "M2-current-publishing-scale-channel-run-receipt-private-v0.2-"
    ) && name.endsWith(".json")
  ));
  const receipts = await Promise.all(names.map(async (name) => ({
    name,
    value: await readJsonAbsolute(path.join(privateDirectory, name))
  })));
  const completed = receipts.filter(({ value }) => (
    value?.status === "COMPLETED"
    && value?.evaluationComplete === true
    && value?.interpretableRawCandidateEvaluationProduced === true
    && value?.modelId === "M2-CHAN-PSC01"
    && value?.expectedCandidateId === "M2-CHAN-PSC01-RAW"
  ));
  if (completed.length !== 1) {
    throw new Error(
      `m2_psc01_completed_receipt_count_invalid:${completed.length}`
    );
  }
  return completed[0];
}

function validateFrozenBindings({ receipt, manifest, publicDevelopment }) {
  if (
    manifest?.schema
      !== "m2.current.publishing_scale_channel_evaluation_private_manifest.v0.2"
    || manifest?.modelId !== "M2-CHAN-PSC01"
    || manifest?.candidateId !== "M2-CHAN-PSC01-RAW"
    || manifest?.actualDefinitionId
      !== "M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01"
    || receipt?.candidateOutputFrozen !== true
    || receipt?.predictionGeneratedAfterFreezeCount !== 0
    || receipt?.predictionModifiedAfterFreezeCount !== 0
    || manifest?.rawCandidatePreserved !== true
    || manifest?.fallbackOverwroteRaw !== false
    || publicDevelopment?.candidateFreeze?.status
      !== "RAW_CANDIDATE_OUTPUTS_FROZEN_BEFORE_ORACLE"
  ) {
    throw new Error("m2_psc01_frozen_binding_invalid");
  }
}

async function verifyComparator({ filePath, finalized, publicDevelopment }) {
  const { workCases, channelCases } = finalized.privateIndex;
  const counts = {
    workRows: 0,
    channelRows: 0,
    missingCandidateWorkCases: 0,
    missingCandidateChannelCases: 0,
    duplicateWorkCases: 0,
    duplicateChannelCases: 0,
    frozenVsCurrentWorkActualMismatchCount: 0,
    frozenVsCurrentChannelActualMismatchCount: 0
  };
  const scan = await scanNdjson({
    filePath,
    label: "LG01_FROZEN_COMPARATOR",
    onRow: (row) => {
      const family = row.evaluationFamily === "strict_rolling"
        ? "strict"
        : row.evaluationFamily;
      if (family !== "primary" && family !== "strict") {
        throw new Error("m2_psc01_comparator_family_invalid");
      }
      const point = Number(row?.ablationPoints?.A1);
      if (!Number.isFinite(point)) {
        throw new Error("m2_psc01_comparator_point_invalid");
      }
      if (row.rowKind === "work") {
        counts.workRows += 1;
        const key = `${family}\u001f${row.standardWorkId}`
          + `\u001f${row.origin}\u001f${row.horizonMonths}`;
        const candidate = workCases.get(key);
        if (candidate === undefined) {
          counts.missingCandidateWorkCases += 1;
          return;
        }
        if (candidate.comparatorSeen === true) {
          counts.duplicateWorkCases += 1;
          return;
        }
        candidate.comparatorSeen = true;
        candidate.comparatorPoint = point;
        if (!nearlyEqual(Number(row.actual), candidate.actual)) {
          counts.frozenVsCurrentWorkActualMismatchCount += 1;
        }
        return;
      }
      if (row.rowKind === "work_channel") {
        counts.channelRows += 1;
        const key = `${family}\u001f${row.standardWorkId}`
          + `\u001f${row.origin}\u001f${row.horizonMonths}`
          + `\u001f${row.channelUid}`;
        const candidate = channelCases.get(key);
        if (candidate === undefined) {
          counts.missingCandidateChannelCases += 1;
          return;
        }
        if (candidate.comparatorSeen === true) {
          counts.duplicateChannelCases += 1;
          return;
        }
        candidate.comparatorSeen = true;
        candidate.comparatorPoint = point;
        if (!nearlyEqual(Number(row.actual), candidate.actual)) {
          counts.frozenVsCurrentChannelActualMismatchCount += 1;
        }
        return;
      }
      throw new Error("m2_psc01_comparator_row_kind_invalid");
    }
  });
  const missingComparatorWorkCases = [...workCases.values()].filter(
    (row) => row.comparatorSeen !== true
  ).length;
  const missingComparatorChannels = [...channelCases.values()].filter(
    (row) => row.comparatorSeen !== true
  );
  const missingComparatorChannelCases = missingComparatorChannels.length;
  const missingComparatorFutureFirstChannelCases = missingComparatorChannels
    .filter((row) => row.observedOccurrenceRowCount === 0).length;
  const missingComparatorObservedChannelCases = missingComparatorChannelCases
    - missingComparatorFutureFirstChannelCases;
  const scores = {};
  for (const family of ["primary", "strict"]) {
    const rows = [...workCases.values()].filter(
      (row) => row.family === family
    );
    scores[family] = {
      candidate: scoreM2Psc01CaseRows(rows, "final"),
      frozenLg01: scoreM2Psc01CaseRows(rows, "comparatorPoint")
    };
    assertScoreMatches(
      scores[family].candidate,
      publicDevelopment.evaluation.rawCandidate[family],
      `${family}_candidate`
    );
    assertScoreMatches(
      scores[family].frozenLg01,
      publicDevelopment.evaluation.frozenResearchComparator[family],
      `${family}_frozen_lg01`
    );
  }
  const scoringGrainFailureCount = (
    counts.missingCandidateWorkCases
    + counts.duplicateWorkCases
    + missingComparatorWorkCases
  );
  const availableChannelAlignmentFailureCount = (
    counts.missingCandidateChannelCases
    + counts.duplicateChannelCases
    + missingComparatorObservedChannelCases
  );
  return {
    status: scoringGrainFailureCount === 0
      && availableChannelAlignmentFailureCount === 0
      ? "EXACT_SAME_CASE_CURRENT_ACTUAL_RESCORING_VERIFIED"
      : "COMPARATOR_INTEGRITY_FAILURE",
    rowCount: scan.rowCount,
    sha256: scan.sha256,
    counts: {
      ...counts,
      missingComparatorWorkCases,
      missingComparatorChannelCases,
      missingComparatorFutureFirstChannelCases,
      missingComparatorObservedChannelCases
    },
    comparisonSemantics: {
      scoringGrain: "work_origin_horizon",
      sameCase: scoringGrainFailureCount === 0,
      sameOrigin: scoringGrainFailureCount === 0,
      sameHorizon: scoringGrainFailureCount === 0,
      sameTarget: true,
      sameActualDefinition: true,
      actualUsedForBothScores:
        "PSC01_CURRENT_DEVELOPMENT_MODELABLE_RESTATEMENT_ACTUAL",
      frozenComparatorActualUsedForScoring: false,
      frozenComparatorPredictionField: "ablationPoints.A1",
      frozenActualMismatchIsHistoricalLabelRestatementDiagnosticOnly: true,
      workChannelRowsAreSupplementalDiagnosticsNotComparatorScore: true,
      channelCoverageCompleteForOriginVisibleCases:
        missingComparatorObservedChannelCases === 0,
      missingChannelCasesAreFutureFirstOnly:
        missingComparatorChannelCases
          === missingComparatorFutureFirstChannelCases
    },
    scores
  };
}

async function auditImplementationSource(config) {
  const [core, channelGenerative, mode] = await Promise.all([
    readText("src/domain/m2Current/publishingScaleChannelCore.js"),
    readText("src/domain/m2Current/channelGenerative.js"),
    readText("scripts/m2-current/channel_generative_mode.mjs")
  ]);
  const forbiddenLg01Tokens = [
    "g0MonthlyPositive",
    "learnedGlobal",
    "ablationPoints",
    "M2-WORK-LG01"
  ];
  const comparatorParseIndex = mode.indexOf(
    "const frozenRows = parseNdjson(frozenText)"
  );
  const freezeIndex = mode.indexOf(
    "RAW_CANDIDATE_OUTPUTS_FROZEN_BEFORE_EVALUATION_AND_ORACLE"
  );
  const fitCall = mode.match(
    /crossFitM2PublishingScaleChannel\(\s*primaryRows,\s*config,\s*support\s*\)/u
  );
  const strictCall = mode.match(
    /strictRollingM2PublishingScaleChannel\(\s*strictRows,\s*config,\s*support\s*\)/u
  );
  return {
    status: "IMPLEMENTATION_PATH_STATIC_AUDIT_PASS",
    monthlyTargetUnit: "cash_amount_per_work_channel_future_month",
    monthlyUniqueKey: config.dataContract.uniqueKey,
    duplicateMonthlyKeyGuardPresent:
      channelGenerative.includes("const keys = new Set()")
      && channelGenerative.includes(
        "m2_channel_generative_monthly_label_duplicate"
      ),
    horizonAggregation: "sum_each_month_once_into_each_included_horizon",
    occurrenceAmountFormula:
      "positivePoint = occurrenceProbability * conditionalPositiveAmount",
    conditionalTargetTransform: "log1p(actualPositive)",
    inverseTransform: "exp(linear) * DuanSmearing - 1",
    jensenCorrectionPresent:
      core.includes("Math.exp(amountLinear) * model.amount.smearing - 1"),
    occurrenceMultipliedOnce:
      core.includes("prediction.occurrenceProbability")
      && core.includes("* prediction.conditionalPositiveAmount"),
    exposureOrOffsetPathPresent:
      /\b(?:exposure|offset)\b/u.test(core),
    conditionalLogClip: config.numerical.conditionalLogPredictionClip,
    nonnegativeFloorPresent:
      core.includes("Math.max(\n      0,\n      prediction.occurrenceProbability"),
    workBalancedTrainingWeight:
      config.dataContract.trainingWeight,
    ridgePenaltyAppliedToNonInterceptOnly:
      core.includes("for (let index = 1; index < dimension; index += 1)"),
    hierarchicalAmountBlendScale: "log1p",
    taxonomyRole: config.dataContract.taxonomyAsOfStatus,
    taxonomyParametersEstimated: config.nodes.taxonomy.currentParametersEstimated,
    lg01TokensPresentInCandidateCore: forbiddenLg01Tokens.filter(
      (token) => core.includes(token)
    ),
    candidateFitCallReceivesLg01Rows: fitCall === null || strictCall === null,
    comparatorParsedOnlyAfterCandidateFreeze:
      freezeIndex >= 0
      && comparatorParseIndex > freezeIndex,
    packedRowExpansionReceivesFrozenComparator:
      /expandM2ChannelGenerativePackedRows\(\s*primaryRestatement\.rows\s*,/u
        .test(mode),
    packedRowSchemaCanCarryG0ButCandidateFeatureOrderExcludesIt:
      channelGenerative.includes("g0MonthlyPositive")
      && !config.featureOrder.includes("g0MonthlyPositive"),
    predictionAndEvaluationCallChain: [
      "applyM2DevelopmentModelableRestatementToPackedRows",
      "expandM2ChannelGenerativePackedRows",
      "crossFitM2PublishingScaleChannel/strictRollingM2PublishingScaleChannel",
      "fitM2PublishingScaleChannelCore",
      "predictM2PublishingScaleChannelMonthly",
      "scoreM2ChannelGenerativeG1Predictions"
    ]
  };
}

function reconcilePublicEvidence({
  finalized,
  comparator,
  publicDevelopment,
  publicForecastability
}) {
  const workRows = [...finalized.privateIndex.workCases.values()];
  const families = {};
  for (const family of ["primary", "strict"]) {
    const rows = workRows.filter((row) => row.family === family);
    const base = scoreM2Psc01CaseRows(rows, "final");
    const globalParent = scoreM2Psc01CaseRows(rows, "globalPooledParent");
    const oracle = {};
    for (const [id, field] of [
      ["ORACLE_OCCURRENCE_ONLY", "occurrenceOnly"],
      ["ORACLE_AMOUNT_ONLY", "amountOnly"],
      ["ORACLE_BOTH", "both"],
      ["FUTURE_FIRST_ENTRY_CEILING", "futureFirstEntry"]
    ]) {
      oracle[id] = scoreOracle(rows, field, base.absoluteError);
    }
    const published = publicForecastability[family].diagnostics;
    assertClose(
      oracle.ORACLE_OCCURRENCE_ONLY.maximumRemovableError,
      published.ORACLE_OCCURRENCE_ONLY.maximumRemovableError,
      `${family}_occurrence_oracle`
    );
    assertClose(
      oracle.ORACLE_AMOUNT_ONLY.maximumRemovableError,
      published.ORACLE_AMOUNT_ONLY.maximumRemovableError,
      `${family}_amount_oracle`
    );
    assertClose(
      globalParent.absoluteError - base.absoluteError,
      published.MECHANISM_INFORMATION_GAIN.absoluteErrorGain,
      `${family}_mechanism_information_gain`
    );
    families[family] = {
      rawCandidate: base,
      frozenLg01: comparator.scores[family].frozenLg01,
      globalParent,
      mechanismTimeAbsoluteErrorGain:
        globalParent.absoluteError - base.absoluteError,
      mechanismTimeRelativeErrorGain:
        globalParent.absoluteError === 0
          ? null
          : (globalParent.absoluteError - base.absoluteError)
            / globalParent.absoluteError,
      oracle
    };
  }
  return {
    status: "PUBLIC_SUMMARY_EXACTLY_RECONCILED_FROM_FROZEN_ROWS",
    families,
    rawCandidatePreserved:
      publicDevelopment.boundaries.rawCandidatePreserved === true,
    fallbackOverwroteRaw:
      publicDevelopment.boundaries.fallbackOverwroteRaw === true
  };
}

function scoreOracle(rows, field, baseAbsoluteError) {
  let absoluteError = 0;
  let actualDenominator = 0;
  let predictionTotal = 0;
  let actualTotal = 0;
  for (const row of rows) {
    absoluteError += Math.abs(row.oracles[field] - row.actual);
    actualDenominator += Math.abs(row.actual);
    predictionTotal += row.oracles[field];
    actualTotal += row.actual;
  }
  return {
    absoluteError,
    maximumRemovableError: baseAbsoluteError - absoluteError,
    removableErrorShare: baseAbsoluteError === 0
      ? null
      : (baseAbsoluteError - absoluteError) / baseAbsoluteError,
    wape: actualDenominator === 0 ? null : absoluteError / actualDenominator,
    predictionTotal,
    actualTotal
  };
}

async function scanNdjson({ filePath, label, onRow }) {
  const hash = createHash("sha256");
  const source = createReadStream(filePath, { highWaterMark: 4 * 1024 * 1024 });
  const hashing = new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk);
      callback(null, chunk);
    }
  });
  const lines = createInterface({
    input: source.pipe(hashing),
    crlfDelay: Number.POSITIVE_INFINITY
  });
  let rowCount = 0;
  for await (const line of lines) {
    if (line.length === 0) continue;
    onRow(JSON.parse(line));
    rowCount += 1;
    if (rowCount % 250000 === 0) {
      process.stderr.write(JSON.stringify({
        status: "READ_ONLY_FROZEN_SCAN_PROGRESS",
        label,
        rowCount
      }) + "\n");
    }
  }
  return { rowCount, sha256: hash.digest("hex") };
}

function assertAuditComplete(result) {
  const frozen = result.frozenEvidence;
  const implementation = result.implementation;
  const checks = {
    evaluationDigestMatchesManifest: frozen.evaluationDigestMatchesManifest,
    evaluationDigestMatchesReceipt: frozen.evaluationDigestMatchesReceipt,
    evaluationRowCountMatches: frozen.evaluationRowCountMatches,
    comparatorDigestMatchesPreparedReceipt:
      frozen.comparatorDigestMatchesPreparedReceipt,
    comparatorDigestMatchesManifest: frozen.comparatorDigestMatchesManifest,
    comparatorRowCountMatchesManifest:
      frozen.comparatorRowCountMatchesManifest,
    publicCandidateFreezeMatches: frozen.publicCandidateFreezeMatches,
    fallbackDidNotOverwriteRaw: !frozen.fallbackOverwroteRaw,
    noPredictionGeneratedAfterFreeze:
      frozen.predictionGeneratedAfterFreezeCount === 0,
    noPredictionModifiedAfterFreeze:
      frozen.predictionModifiedAfterFreezeCount === 0,
    rowInvariantsPass: result.computed.invariantStatus === "PASS",
    comparatorIntegrityVerified: result.comparator.status
      === "EXACT_SAME_CASE_CURRENT_ACTUAL_RESCORING_VERIFIED",
    publicSummaryReconciled: result.publicReconciliation.status
      === "PUBLIC_SUMMARY_EXACTLY_RECONCILED_FROM_FROZEN_ROWS",
    noLg01TokenInCandidateCore:
      implementation.lg01TokensPresentInCandidateCore.length === 0,
    candidateFitDoesNotReceiveLg01Rows:
      !implementation.candidateFitCallReceivesLg01Rows,
    packedRowsDoNotReceiveComparator:
      !implementation.packedRowExpansionReceivesFrozenComparator,
    duplicateMonthlyKeyGuardPresent:
      implementation.duplicateMonthlyKeyGuardPresent,
    comparatorParsedOnlyAfterCandidateFreeze:
      implementation.comparatorParsedOnlyAfterCandidateFreeze
  };
  const failedChecks = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  if (failedChecks.length > 0) {
    throw new Error(
      `m2_psc01_amount_root_cause_audit_incomplete:${JSON.stringify({
        failedChecks,
        invariantFailures: result.computed.invariantFailures,
        comparatorStatus: result.comparator.status,
        comparatorCounts: result.comparator.counts,
        publicReconciliationStatus: result.publicReconciliation.status,
        implementation
      })}`
    );
  }
}

function assertScoreMatches(actual, expected, label) {
  for (const field of [
    "caseCount",
    "absoluteError",
    "signedError",
    "actualDenominator",
    "wape",
    "signedBias"
  ]) {
    assertClose(actual[field], expected[field], `${label}_${field}`);
  }
}

function assertClose(actual, expected, label) {
  if (!nearlyEqual(Number(actual), Number(expected), 1e-7)) {
    throw new Error(
      `m2_psc01_public_reconciliation_mismatch:${label}:${actual}:${expected}`
    );
  }
}

function nearlyEqual(left, right, tolerance = 1e-8) {
  return Number.isFinite(left)
    && Number.isFinite(right)
    && Math.abs(left - right) <= tolerance * Math.max(
      1,
      Math.abs(left),
      Math.abs(right)
    );
}

function basename(value) {
  if (
    typeof value !== "string"
    || value !== path.basename(value)
    || value.includes("/")
    || value.includes("\\")
  ) {
    throw new Error("m2_psc01_private_filename_invalid");
  }
  return value;
}

function resolveWithinRoot(relativePath) {
  if (typeof relativePath !== "string" || path.isAbsolute(relativePath)) {
    throw new Error("m2_psc01_relative_path_required");
  }
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved).replaceAll("\\", "/");
  if (relative === ".." || relative.startsWith("../")) {
    throw new Error("m2_psc01_path_escapes_root");
  }
  return resolved;
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readJsonAbsolute(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function readText(relativePath) {
  return fs.readFile(resolveWithinRoot(relativePath), "utf8");
}
