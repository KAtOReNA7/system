import { createHash } from "node:crypto";
import {
  createReadStream,
  createWriteStream
} from "node:fs";
import {
  mkdir,
  readFile,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);
const privateSourceDirectory = path.join(
  root,
  "data/private-output/m2-current-human-anchored"
);
const privateAuditDirectory = path.join(
  root,
  "data/private-output/m2-current-channel-experts-architecture-audit"
);
const evaluationPath = path.join(
  privateSourceDirectory,
  "M2-current-channel-experts-evaluation-private-v0.1.ndjson"
);
const evaluationManifestPath = path.join(
  privateSourceDirectory,
  "M2-current-channel-experts-evaluation-manifest-private-v0.1.json"
);
const materializationManifestPath = path.join(
  privateSourceDirectory,
  "M2-current-channel-experts-materialization-manifest-private-v0.1.json"
);
const configPath = path.join(
  root,
  "config/m2-current-channel-experts.v0.1.json"
);
const publicDevelopmentPath = path.join(
  root,
  "docs/analysis/m2-current/"
    + "M2-current-channel-experts-development-v0.1.json"
);
const privateSummaryPath = path.join(
  privateAuditDirectory,
  "M2-current-channel-experts-architecture-audit-private-v0.1.json"
);
const privateRowsPath = path.join(
  privateAuditDirectory,
  "M2-current-channel-experts-architecture-audit-rows-private-v0.1.ndjson"
);
const publicAuditPath = path.join(
  root,
  "docs/analysis/m2-current/"
    + "M2-current-channel-experts-architecture-failure-audit-v0.1.json"
);

const ablations = Object.freeze([
  "A0",
  "A1",
  "A2",
  "A3",
  "A4",
  "A5",
  "A6"
]);
const stages = Object.freeze([
  Object.freeze({ id: "A1_to_A2", from: "A1", to: "A2" }),
  Object.freeze({ id: "A2_to_A3", from: "A2", to: "A3" }),
  Object.freeze({ id: "A3_to_A4", from: "A3", to: "A4" }),
  Object.freeze({ id: "A4_to_A5", from: "A4", to: "A5" }),
  Object.freeze({ id: "A5_to_A6", from: "A5", to: "A6" })
]);
const directFactorDefinitions = Object.freeze([
  Object.freeze({
    id: "rawExpertFactor",
    numerator: "A2",
    denominator: "A1"
  }),
  Object.freeze({
    id: "mechanismScale",
    numerator: "A3",
    denominator: "A2"
  }),
  Object.freeze({
    id: "platformMechanismScale",
    numerator: "A4",
    denominator: "A2"
  }),
  Object.freeze({
    id: "taxonomyScale",
    numerator: "A5",
    denominator: "A2"
  }),
  Object.freeze({
    id: "selectedTaxonomyScale",
    numerator: "A6",
    denominator: "A2"
  })
]);
const epsilon = 1e-12;

await main();

async function main() {
  const [
    config,
    evaluationManifest,
    materializationManifest,
    publicDevelopment
  ] = await Promise.all([
    readJson(configPath),
    readJson(evaluationManifestPath),
    readJson(materializationManifestPath),
    readJson(publicDevelopmentPath)
  ]);
  assertFrozenBoundary({
    config,
    evaluationManifest,
    materializationManifest,
    publicDevelopment
  });
  const evaluationSha256 = await sha256File(evaluationPath);
  if (evaluationSha256 !== evaluationManifest.sha256) {
    throw new Error("channel_expert_audit_evaluation_digest_mismatch");
  }

  const workRows = [];
  const workIndex = new Map();
  const observedCounts = { work: 0, work_channel: 0 };
  await forEachEvaluationRow((row) => {
    if (!(row.rowKind in observedCounts)) {
      throw new Error("channel_expert_audit_row_kind_invalid");
    }
    observedCounts[row.rowKind] += 1;
    if (row.rowKind !== "work") return;
    const compact = compactWorkRow(row);
    const key = workKey(compact);
    if (workIndex.has(key)) {
      throw new Error("channel_expert_audit_work_row_duplicate");
    }
    workRows.push(compact);
    workIndex.set(key, compact);
  });
  if (
    observedCounts.work !== evaluationManifest.workEvaluationRowCount
    || observedCounts.work_channel
      !== evaluationManifest.channelEvaluationRowCount
  ) {
    throw new Error("channel_expert_audit_row_counts_differ");
  }

  const familyContext = buildFamilyContext(workRows);
  const workDiagnostics = buildWorkDiagnostics(workRows, familyContext);
  const factorCollectors = buildFactorCollectors();
  const horizonGroups = new Map();
  const taxonomyCells = new Map();
  await forEachEvaluationRow((row) => {
    if (row.rowKind !== "work_channel") return;
    const compact = compactChannelRow(row, workIndex);
    collectDirectFactors(compact, factorCollectors, config);
    collectHorizonReuse(compact, horizonGroups);
    collectTaxonomyCell(compact, taxonomyCells);
  });
  const factorDiagnostics = finalizeFactorCollectors(factorCollectors);
  const factorThresholds = buildFactorThresholds(factorCollectors);
  const channelDiagnostics = buildEmptyChannelDiagnostics();
  await mkdir(privateAuditDirectory, { recursive: true });
  const privateWriter = createWriteStream(privateRowsPath, {
    encoding: "utf8"
  });
  for (const row of workRows) {
    await writePrivateLine(privateWriter, buildPrivateWorkRow(
      row,
      familyContext
    ));
  }
  await forEachEvaluationRow(async (row) => {
    if (row.rowKind !== "work_channel") return;
    const compact = compactChannelRow(row, workIndex);
    accumulateChannelDiagnostics(
      channelDiagnostics,
      compact,
      familyContext,
      factorThresholds
    );
    await writePrivateLine(
      privateWriter,
      buildPrivateChannelRow(compact, factorThresholds)
    );
  });
  privateWriter.end();
  await once(privateWriter, "finish");
  const privateRowsSha256 = await sha256File(privateRowsPath);

  const result = {
    schema:
      "m2.current.channel_experts_architecture_audit_private.v0.1",
    tracked: false,
    generatedFromFrozenRows: true,
    postHoc: true,
    selectionEligible: false,
    modelUpgradeEvidence: false,
    source: {
      candidateId: config.candidateId,
      evaluationSha256,
      evaluationRowCount: evaluationManifest.rowCount,
      workEvaluationRowCount:
        evaluationManifest.workEvaluationRowCount,
      channelEvaluationRowCount:
        evaluationManifest.channelEvaluationRowCount,
      materializationPrimarySha256:
        materializationManifest.primarySha256,
      materializationAuxiliarySha256:
        materializationManifest.auxiliarySha256,
      rawAblationsPreserved:
        evaluationManifest.rawAblationsPreserved,
      derivedPrivateRowsSha256: privateRowsSha256,
      derivedPrivateRowCount:
        observedCounts.work + observedCounts.work_channel
    },
    work: workDiagnostics,
    channel: finalizeChannelDiagnostics(channelDiagnostics),
    factors: factorDiagnostics,
    horizonReuse: finalizeHorizonReuse(horizonGroups),
    taxonomyCells: finalizeTaxonomyCells(taxonomyCells),
    boundaries: {
      frozenV01DecisionUnchanged: true,
      productionRouteModified: false,
      newCandidateTrained: false,
      candidateSelectionPerformed: false,
      finalHoldoutOpened: false,
      releaseAuthorized: false
    }
  };
  const publicAudit = buildPublicAudit({
    result,
    config,
    publicDevelopment
  });
  await Promise.all([
    writeFile(
      privateSummaryPath,
      JSON.stringify(result, null, 2) + "\n",
      "utf8"
    ),
    writeFile(
      publicAuditPath,
      JSON.stringify(publicAudit, null, 2) + "\n",
      "utf8"
    )
  ]);
  process.stdout.write(JSON.stringify({
    evaluationSha256,
    workRows: observedCounts.work,
    channelRows: observedCounts.work_channel,
    publicAuditPath: path.relative(root, publicAuditPath),
    privateSummaryPath: path.relative(root, privateSummaryPath),
    privateRowsPath: path.relative(root, privateRowsPath)
  }) + "\n");
}

function buildPublicAudit({ result, config, publicDevelopment }) {
  const primary = result.work.primary;
  const strict = result.work.strict_rolling;
  return {
    schema:
      "m2.current.channel_experts_architecture_failure_audit.public.v0.1",
    asOf: "2026-07-27",
    status: "BOUNDED_ARCHITECTURE_FAILURE_AUDIT_COMPLETE",
    candidateId: config.candidateId,
    architectureConclusion:
      "CHANNEL_EXPERT_V01_IMPLEMENTATION_MISMATCH_CONFIRMED",
    nextStepDecision: "PREREGISTER_GENERATIVE_V02",
    frozenV01Decision:
      "CHANNEL_EXPERT_DEVELOPMENT_FAIL_KEEP_LEARNEDGLOBAL_AND_EXACT_V0_3",
    executiveConclusion: {
      v01TestedIndependentChannelTemporalGenerators: false,
      actualTest:
        "learnedGlobal_channel_component_times_mechanism_factor"
        + "_times_one_amount_calibration_scale",
      generativeHypothesisProven: false,
      implementationMismatchConfirmedByCode: true,
      implementationMismatchConfirmedByRows: true,
      firstFailingAblation: {
        stage: "A1_to_A2",
        primaryAbsoluteErrorDelta:
          primary.stageTransitions.A1_to_A2.absoluteErrorDelta,
        primaryWapeDelta:
          primary.stageTransitions.A1_to_A2
            .normalizedAbsoluteErrorDelta,
        strictAbsoluteErrorDelta:
          strict.stageTransitions.A1_to_A2.absoluteErrorDelta,
        strictWapeDelta:
          strict.stageTransitions.A1_to_A2
            .normalizedAbsoluteErrorDelta
      },
      dominantPrimaryCause: {
        stage: "A4_to_A5",
        mechanism:
          "unshrunk taxonomy ratio directly rescales positive cash",
        absoluteErrorDelta:
          primary.stageTransitions.A4_to_A5.absoluteErrorDelta,
        wapeDelta:
          primary.stageTransitions.A4_to_A5
            .normalizedAbsoluteErrorDelta,
        shareOfFinalNetAbsoluteErrorIncrease:
          primary.stageTransitions.A4_to_A5.absoluteErrorDelta
          / primary.A1ToA6.absoluteErrorDelta
      },
      dominantStrictCause: {
        stage: "A2_to_A3",
        mechanism:
          "mechanism amount scale inflates the already channel-aware base",
        absoluteErrorDelta:
          strict.stageTransitions.A2_to_A3.absoluteErrorDelta,
        wapeDelta:
          strict.stageTransitions.A2_to_A3
            .normalizedAbsoluteErrorDelta,
        shareOfFinalNetAbsoluteErrorIncrease:
          strict.stageTransitions.A2_to_A3.absoluteErrorDelta
          / strict.A1ToA6.absoluteErrorDelta
      }
    },
    sourceReceipts: {
      ...result.source,
      privateRowsPublished: false,
      privateDerivedRowsPath:
        "data/private-output/"
        + "m2-current-channel-experts-architecture-audit/"
        + "M2-current-channel-experts-architecture-audit-rows-"
        + "private-v0.1.ndjson",
      privateSummaryPath:
        "data/private-output/"
        + "m2-current-channel-experts-architecture-audit/"
        + "M2-current-channel-experts-architecture-audit-private-v0.1.json"
    },
    equations: buildEquationAudit(),
    codePath: buildCodePathAudit(),
    learnedGlobalChannelAwareness: {
      originObservedChannelHistory: true,
      trailingAnnualPositiveByChannel: true,
      latestMonthPositiveByChannel: true,
      recentThreeMonthAnnualizedPositiveByChannel: true,
      cumulativePositiveByChannel: true,
      channelRankingAndMainEdgeAllocation: true,
      workAgeLifecycleContribution: true,
      commonLinearHorizonScale: true,
      platformPeerTrendComputedButNotUsedByBasePoint: true,
      categoricalPlatformIdentityInBasePoint: false,
      intrinsicCategoryInBasePoint: false,
      independentChannelOccurrenceProcess: false,
      A0A1EqualityProves:
        "exact additive decomposition and recomposition of the "
        + "learnedGlobal positive point",
      A0A1EqualityDoesNotProve:
        "channel allocation optimality, temporal-generator adequacy, "
        + "or mechanism-hypothesis validity",
      v01RelationshipToLearnedGlobal:
        "recalibrates information already embedded in the channel "
        + "component; it does not replace that component"
    },
    quantitativeAttribution: {
      work: result.work,
      channel: result.channel,
      factors: result.factors,
      horizonReuse: result.horizonReuse,
      taxonomyRouteAggregates:
        aggregateTaxonomyRoutes(result.taxonomyCells),
      trainingSupport: summarizeTrainingSupport(publicDevelopment)
    },
    causalIdentificationLimits: {
      allPredictionChangesMechanicallyLevelRescaling: true,
      levelRescalingShareOfPredictionChange: 1,
      horizonShapeCausalShareIdentifiable: false,
      occurrenceCausalShareIdentifiable: false,
      sparseFallbackCausalShareIdentifiable: false,
      associationNotCausalDecomposition: true,
      overlappingAssociations: {
        primaryTopOnePercentFinalAbsoluteErrorDelta:
          primary.topRevenue["0.01"].A1ToA6.absoluteErrorDelta,
        primaryTopFivePercentFinalAbsoluteErrorDelta:
          primary.topRevenue["0.05"].A1ToA6.absoluteErrorDelta,
        primaryTopTenPercentFinalAbsoluteErrorDelta:
          primary.topRevenue["0.1"].A1ToA6.absoluteErrorDelta,
        strictTopOnePercentFinalAbsoluteErrorDelta:
          strict.topRevenue["0.01"].A1ToA6.absoluteErrorDelta,
        strictTopFivePercentFinalAbsoluteErrorDelta:
          strict.topRevenue["0.05"].A1ToA6.absoluteErrorDelta,
        strictTopTenPercentFinalAbsoluteErrorDelta:
          strict.topRevenue["0.1"].A1ToA6.absoluteErrorDelta,
        strictInvariantFactorResidualDirectionChanging:
          result.horizonReuse
            .invariantFactorAndDirectionChangingA1ToA6,
        primaryOccurrenceAssociation:
          result.channel.primary.occurrence,
        strictOccurrenceAssociation:
          result.channel.strict_rolling.occurrence,
        primarySparseFallbackAssociation:
          result.channel.primary.sparseFallback,
        strictSparseFallbackAssociation:
          result.channel.strict_rolling.sparseFallback
      }
    },
    temporalGenerationAssessment: buildTemporalAssessment(),
    taxonomyAssessment: {
      usedAsGenerativePrior: false,
      A5Use:
        "direct unshrunk amount correction actualPositive/rawPrediction",
      A6Use:
        "hierarchically shrunk amount correction around parent scale",
      fallbackChangesModelFamily: false,
      fallbackOnlySubstitutesScalarCenter: true,
      exactTaxonomyTrainingCellSizesPersistedInFrozenReceipt: false,
      evaluationRouteCountsAvailable: true,
      shrinkageFinding:
        "factor dispersion falls, but the biased exposure-weighted "
        + "center is largely preserved",
      sparseNamedCellsDominantCause: false
    },
    assetDisposition: buildAssetDisposition(),
    generativeV02PreregistrationRequirements:
      buildV02Requirements(),
    publicPrivateBoundary: {
      publicContainsWorkIds: false,
      publicContainsChannelUids: false,
      publicContainsCategoryValues: false,
      privateRowsGitIgnored: true
    },
    invariants: {
      currentDecision: "CANARY_FAIL",
      automationDecision: "AUTOMATION_BLOCKED",
      modelTrainingAuthorized: false,
      candidateSelectionAuthorized: false,
      frozenV01DecisionUnchanged: true,
      learnedGlobalRetained: true,
      exactV03FallbackRetained: true,
      productionRouteModified: false,
      newCandidateTrained: false,
      finalHoldoutOpened: false,
      releaseAuthorized: false
    }
  };
}

function buildEquationAudit() {
  return {
    notation: {
      B:
        "learnedGlobal channel positive component forecast36 "
        + "times horizonMonths/36",
      F:
        "mechanism raw factor from the same origin-observed "
        + "channel history",
      S: "one bounded amount calibration scale",
      R: "shared human-anchored reversal rate",
      eligibleChannels:
        "channels observed at origin; future-first-seen labels predict zero"
    },
    commonFinalization:
      "workPoint(Ak)=(1-R)*sum_observed_channel(positivePoint(Ak))",
    A0: "positivePoint=B; direct learnedGlobal work baseline",
    A1: "positivePoint=B; exact channel decomposition/recomposition",
    A2: "positivePoint=B*F_mechanism",
    A3:
      "positivePoint=B*F_mechanism*S_mechanism(kappa=80)",
    A4:
      "positivePoint=B*F_mechanism*S_platform_x_mechanism(kappa=80); "
      + "unsupported node returns its parent scale",
    A5:
      "positivePoint=B*F_mechanism*S_taxonomy_unshrunk; "
      + "supported taxonomy scale=clamp(Y/P,0.1,4), otherwise A4 parent",
    A6:
      "positivePoint=B*F_mechanism*S_taxonomy(selected kappa); "
      + "kappa selected from frozen {20,80,240} inside outer training",
    shrinkage:
      "S_node=clamp((Y_node+kappa*mean(P_node)*S_parent)"
      + "/(P_node+kappa*mean(P_node)),0.1,4)",
    applicationOrder: [
      "fit learnedGlobal work parameters and shared reversal",
      "decompose learnedGlobal positive point by observed channel",
      "multiply each channel component by its raw mechanism factor",
      "choose exactly one scale for A3/A4/A5/A6",
      "sum channels",
      "apply one shared reversal rate"
    ],
    notSequentialScaleProducts: true,
    independentChannelForecasts: false
  };
}

function buildCodePathAudit() {
  return [
    {
      file: "src/domain/m2Current/humanAnchored.js",
      lines: "15-140",
      role:
        "learnedGlobal per-channel history, main/edge allocation, "
        + "work-age contribution and linear horizon scale"
    },
    {
      file: "src/domain/m2Current/channelExperts.js",
      lines: "46-111",
      role:
        "exact learnedGlobal channel decomposition and raw factor attachment"
    },
    {
      file: "src/domain/m2Current/channelExperts.js",
      lines: "610-690",
      role: "A0-A6 multiplier equations"
    },
    {
      file: "src/domain/m2Current/channelExperts.js",
      lines: "694-788",
      role: "fallback, shrinkage and clamp operators"
    },
    {
      file: "src/domain/m2Current/channelExperts.js",
      lines: "791-823",
      role: "three mechanism scalar-factor formulas"
    },
    {
      file:
        "scripts/m2-current/materialize_human_anchored_cases.py",
      lines: "406-570",
      role:
        "origin-only channel history and leave-one-work-out peer trend"
    },
    {
      file:
        "scripts/m2-current/materialize_human_anchored_cases.py",
      lines: "647-923",
      role:
        "work-channel labels, future-first-seen exclusion and conservation"
    },
    {
      file: "scripts/m2-current/channel_experts_mode.mjs",
      lines: "54-173,418-499",
      role: "frozen evaluation rows and digest receipts"
    },
    {
      file:
        "scripts/m2-current/run_m2_human_anchored_development.mjs",
      lines: "46-51,66-71,176-185",
      role: "isolated public/private runner dispatch"
    }
  ];
}

function buildTemporalAssessment() {
  const shared = {
    independentOccurrenceProcess: false,
    independentConditionalAmountDistribution: false,
    mechanismSpecificHorizonCurve: false,
    distinctShortVersusLongMemoryModel: false,
    timeVaryingWorkResidual: false,
    futureChannelRevenueGenerator: false
  };
  return {
    membership: {
      ...shared,
      implemented:
        "scalar clamp(0.75+0.25*recent3Annual/trailingAnnual,"
        + "0.25,2)"
    },
    advertising: {
      ...shared,
      implemented:
        "scalar clamp(sqrt(leave-one-work-out peerTrendRatio),0.25,2)"
    },
    transactional: {
      ...shared,
      implemented:
        "scalar clamp(exp(-monthsSinceLastPositive/12),0.1,1)",
      explicitSpikeBasis: false,
      explicitLongTailBasis: false
    },
    sharedReversalLayer: true,
    conclusion:
      "mechanism-specific parameters inside scalar factors, "
      + "not mechanism-specific future channel-revenue generators"
  };
}

function buildAssetDisposition() {
  return [
    disposition(
      "work-channel materialization",
      "REUSE_UNCHANGED",
      "preserves origin/label grain without prescribing model form"
    ),
    disposition(
      "three cash-conservation proofs",
      "REUSE_UNCHANGED",
      "positive, reversal and net remain exact invariants"
    ),
    disposition(
      "future-first-seen-channel exclusion",
      "REUSE_UNCHANGED",
      "prevents identity leakage and unsupported channel creation"
    ),
    disposition(
      "canonical platform mapping",
      "REUSE_UNCHANGED",
      "stable routing identity remains valid"
    ),
    disposition(
      "mechanism taxonomy",
      "REUSE_UNCHANGED",
      "semantic generator routing remains useful"
    ),
    disposition(
      "content taxonomy",
      "REUSE_AFTER_CORRECTION",
      "use only as a hierarchical prior with availability caveats"
    ),
    disposition(
      "learnedGlobal channel decomposition",
      "REUSE_UNCHANGED",
      "retain as G0, conservation comparator and unsupported-cell fallback"
    ),
    disposition(
      "A0-A6 evaluation harness",
      "REUSE_AFTER_CORRECTION",
      "retain splits/scoring but replace multiplier semantics with G0-G6"
    ),
    disposition(
      "nested work folds",
      "REUSE_UNCHANGED",
      "outer isolation is valid"
    ),
    disposition(
      "current scalar shrinkage implementation",
      "RETIRE_FROM_NEXT_CANDIDATE",
      "shrinks direct amount ratios, not generator parameters"
    ),
    disposition(
      "factor/calibration implementation",
      "RETIRE_FROM_NEXT_CANDIDATE",
      "post-hoc channel-component multipliers are the mismatch"
    ),
    disposition(
      "three raw mechanism factors",
      "DIAGNOSTIC_ONLY",
      "retain only to explain v0.1 failure"
    ),
    disposition(
      "five-platform scalar partial pooling",
      "RETIRE_FROM_NEXT_CANDIDATE",
      "platform layer changes level, not process"
    ),
    disposition(
      "common reversal layer",
      "REUSE_UNCHANGED",
      "audit found no contrary evidence"
    ),
    disposition(
      "public/private reporting",
      "REUSE_AFTER_CORRECTION",
      "add generator components while preserving aggregate-only publication"
    )
  ];
}

function disposition(asset, classification, reason) {
  return { asset, classification, reason };
}

function buildV02Requirements() {
  return {
    preregistrationOnly: true,
    implementationAuthorized: false,
    trainingAuthorized: false,
    selectionAuthorized: false,
    architecture:
      "replace named learnedGlobal channel components with independent "
      + "generators; never multiply those components by a correction factor",
    membership: "independent future channel curve/share process",
    advertising:
      "occurrence times conditional amount with shorter memory",
    transactional:
      "purchase occurrence times short spike times long tail",
    taxonomy:
      "hierarchical prior over generator parameters, never a direct "
      + "category amount multiplier",
    smallPlatforms:
      "parent mechanism generator plus bounded platform deviation",
    fallback:
      "unchanged learnedGlobal channel component for other channels "
      + "and unsupported cells",
    futureFirstSeenChannels: "no prediction in v0.2",
    reversal:
      "retain common reversal unless new preregistered evidence rejects it",
    noAuditDerivedParameterValues: true,
    minimumAblation: [
      "G0 frozen learnedGlobal channel component",
      "G1 independent membership generator",
      "G2 independent advertising generator",
      "G3 independent transactional generator",
      "G4 parent-plus-platform deviation",
      "G5 taxonomy-prior hierarchy",
      "G6 named-channel replacement plus unchanged fallback"
    ]
  };
}

function aggregateTaxonomyRoutes(cells) {
  const grouped = new Map();
  for (const row of cells) {
    const key = `${row.family}\u001f${row.platformId}\u001f`
      + `${row.mechanism}\u001f${row.fallbackA5}\u001f`
      + `${row.fallbackA6}`;
    const value = grouped.get(key) ?? {
      family: row.family,
      platformId: row.platformId,
      mechanism: row.mechanism,
      fallbackA5: row.fallbackA5,
      fallbackA6: row.fallbackA6,
      categoryCellCount: 0,
      evaluationRowCount: 0,
      evaluationWorkCountSum: 0,
      actual: 0,
      predictions: { A4: 0, A5: 0, A6: 0 },
      absoluteErrors: { A4: 0, A5: 0, A6: 0 }
    };
    value.categoryCellCount += 1;
    value.evaluationRowCount += row.evaluationRowCount;
    value.evaluationWorkCountSum += row.evaluationWorkCount;
    value.actual += row.actual;
    for (const id of ["A4", "A5", "A6"]) {
      value.predictions[id] += row.predictions[id];
      value.absoluteErrors[id] += row.absoluteErrors[id];
    }
    grouped.set(key, value);
  }
  return [...grouped.values()].sort((left, right) => (
    left.family.localeCompare(right.family)
    || left.platformId.localeCompare(right.platformId)
    || left.mechanism.localeCompare(right.mechanism)
    || left.fallbackA5.localeCompare(right.fallbackA5)
  ));
}

function summarizeTrainingSupport(publicDevelopment) {
  const primary = publicDevelopment.evaluation.outerFolds;
  const strict = publicDevelopment.evaluation.strictRollingOrigins.filter(
    (row) => row.status === "evaluated"
  );
  return {
    taxonomyNodeTrainingCountsPersisted: false,
    exactTaxonomyEffectiveSampleSizeIdentifiable: false,
    primaryOuterFoldPlatformRanges: platformRanges(primary),
    strictOriginPlatformRanges: platformRanges(strict),
    selectedPriorStrength: {
      primary: countBy(
        primary.map((row) => String(row.selectedPriorStrength))
      ),
      strict: countBy(
        strict.map((row) => String(row.selectedPriorStrength))
      )
    }
  };
}

function platformRanges(rows) {
  const platformIds = sortedUnique(rows.flatMap(
    (row) => Object.keys(row.platformModels)
  ));
  return Object.fromEntries(platformIds.map((platformId) => {
    const values = rows.map((row) => ({
      status: row.platformModels[platformId].status,
      rows: row.platformModels[platformId].trainingRowCount,
      works: row.platformModels[platformId].trainingWorkCount
    }));
    return [platformId, {
      minimumTrainingRows: Math.min(...values.map((row) => row.rows)),
      maximumTrainingRows: Math.max(...values.map((row) => row.rows)),
      minimumTrainingWorks: Math.min(...values.map((row) => row.works)),
      maximumTrainingWorks: Math.max(...values.map((row) => row.works)),
      fittedCount: values.filter(
        (row) => row.status === "fitted_with_hierarchical_pooling"
      ).length,
      evaluatedStateCount: values.length
    }];
  }));
}

function countBy(values) {
  const result = {};
  for (const value of values) {
    result[value] = (result[value] ?? 0) + 1;
  }
  return result;
}

function assertFrozenBoundary({
  config,
  evaluationManifest,
  materializationManifest,
  publicDevelopment
}) {
  if (
    config.schema !== "m2.current.channel_expert_development.v0.1"
    || evaluationManifest.schema
      !== "m2.current.channel_expert_evaluation_private_manifest.v0.1"
    || materializationManifest.schema
      !== "m2.current.channel_expert_materialization_private.v0.1"
    || publicDevelopment.decision
      !== "CHANNEL_EXPERT_DEVELOPMENT_FAIL_KEEP_LEARNEDGLOBAL_AND_EXACT_V0_3"
    || config.candidateId !== evaluationManifest.candidateId
    || config.candidateId !== materializationManifest.candidateId
    || evaluationManifest.rawAblationsPreserved.join(",")
      !== ablations.join(",")
    || config.authorization.productionModelModification !== false
    || config.authorization.exactV03Replacement !== false
    || config.authorization.finalHoldout !== false
    || config.authorization.release !== false
    || evaluationManifest.finalHoldoutOpened !== false
    || evaluationManifest.productionRouteModified !== false
    || evaluationManifest.releaseAuthorized !== false
  ) {
    throw new Error("channel_expert_audit_frozen_boundary_invalid");
  }
}

async function forEachEvaluationRow(visitor) {
  const input = createReadStream(evaluationPath, { encoding: "utf8" });
  const lines = createInterface({
    input,
    crlfDelay: Infinity
  });
  for await (const line of lines) {
    if (!line) continue;
    await visitor(JSON.parse(line));
  }
}

function compactWorkRow(row) {
  return {
    family: String(row.evaluationFamily),
    standardWorkId: String(row.standardWorkId),
    origin: String(row.origin),
    horizonMonths: Number(row.horizonMonths),
    actualPositive: Number(row.actualPositive),
    actualReversal: Number(row.actualReversal),
    actual: Number(row.actual),
    positive: numericAblations(row.ablationPositivePoints),
    points: numericAblations(row.ablationPoints),
    reversalRate: Number(row.reversalRate),
    selectedPriorStrength: Number(row.selectedPriorStrength)
  };
}

function compactChannelRow(row, workIndex) {
  const key = workKey(row);
  const work = workIndex.get(key);
  if (!work) {
    throw new Error("channel_expert_audit_channel_work_missing");
  }
  return {
    family: String(row.evaluationFamily),
    standardWorkId: String(row.standardWorkId),
    origin: String(row.origin),
    horizonMonths: Number(row.horizonMonths),
    channelUid: String(row.channelUid),
    platformId: String(row.platformId),
    mechanism: String(row.mechanism),
    intrinsicCategory: String(row.intrinsicCategory),
    observedAtOrigin: row.observedAtOrigin === true,
    actualPositive: Number(row.actualPositive),
    actualReversal: Number(row.actualReversal),
    actual: Number(row.actual),
    positive: numericAblations(row.ablationPositivePoints),
    points: numericAblations(row.ablationPoints),
    fallback: {
      A3: String(row.fallback.A3),
      A4: String(row.fallback.A4),
      A5: String(row.fallback.A5),
      A6: String(row.fallback.A6)
    },
    selectedPriorStrength: work.selectedPriorStrength
  };
}

function numericAblations(value) {
  return Object.fromEntries(ablations.map((id) => {
    const number = Number(value[id]);
    if (!Number.isFinite(number)) {
      throw new Error("channel_expert_audit_ablation_not_finite");
    }
    return [id, number];
  }));
}

function workKey(row) {
  return `${row.evaluationFamily ?? row.family}\u001f`
    + `${row.standardWorkId}\u001f${row.origin}\u001f`
    + `${Number(row.horizonMonths)}`;
}

function buildFamilyContext(rows) {
  const result = {};
  for (const family of sortedUnique(rows.map((row) => row.family))) {
    const selected = rows.filter((row) => row.family === family);
    const actualByWork = new Map();
    for (const row of selected) {
      actualByWork.set(
        row.standardWorkId,
        (actualByWork.get(row.standardWorkId) ?? 0) + row.actual
      );
    }
    const orderedWorks = [...actualByWork].sort((left, right) => (
      Math.abs(right[1]) - Math.abs(left[1])
      || left[0].localeCompare(right[0])
    ));
    const topSets = Object.fromEntries([0.01, 0.05, 0.1].map((fraction) => {
      const count = Math.max(
        1,
        Math.ceil(orderedWorks.length * fraction)
      );
      return [String(fraction), new Set(
        orderedWorks.slice(0, count).map(([workId]) => workId)
      )];
    }));
    const baselineDeciles = assignDeciles(
      selected,
      (row) => Math.abs(row.points.A1),
      (row) => workKey(row)
    );
    const factorDeciles = Object.fromEntries(stages.map((stage) => [
      stage.id,
      assignDeciles(
        selected.filter((row) => (
          ratio(row.points[stage.to], row.points[stage.from]) !== null
        )),
        (row) => ratio(
          row.points[stage.to],
          row.points[stage.from]
        ),
        (row) => workKey(row)
      )
    ]));
    result[family] = {
      topSets,
      baselineDeciles,
      factorDeciles
    };
  }
  return result;
}

function buildWorkDiagnostics(rows, familyContext) {
  return Object.fromEntries(
    sortedUnique(rows.map((row) => row.family)).map((family) => {
      const selected = rows.filter((row) => row.family === family);
      const context = familyContext[family];
      return [family, {
        caseCount: selected.length,
        workCount: new Set(
          selected.map((row) => row.standardWorkId)
        ).size,
        cumulative: cumulativeAblations(selected),
        calibration: calibrationAblations(selected),
        stageTransitions: stageTransitionSet(selected),
        A1ToA6: finalizeTransition(
          accumulateTransitionRows(selected, "A1", "A6")
        ),
        byHorizon: transitionSlices(
          selected,
          (row) => String(row.horizonMonths)
        ),
        byOrigin: transitionSlices(selected, (row) => row.origin),
        bySelectedPriorStrength: transitionSlices(
          selected,
          (row) => String(row.selectedPriorStrength)
        ),
        byBaselinePredictionDecile: transitionSlices(
          selected,
          (row) => String(
            context.baselineDeciles.get(workKey(row))
          )
        ),
        byAppliedFactorDecile: Object.fromEntries(stages.map((stage) => [
          stage.id,
          transitionSliceForStage(
            selected,
            stage,
            (row) => String(
              context.factorDeciles[stage.id].get(workKey(row))
                ?? "unidentifiable"
            )
          )
        ])),
        topRevenue: Object.fromEntries(
          Object.entries(context.topSets).map(([fraction, workIds]) => [
            fraction,
            {
              workCount: workIds.size,
              stageTransitions: stageTransitionSet(
                selected.filter((row) => (
                  workIds.has(row.standardWorkId)
                ))
              ),
              A1ToA6: finalizeTransition(
                accumulateTransitionRows(
                  selected.filter((row) => (
                    workIds.has(row.standardWorkId)
                  )),
                  "A1",
                  "A6"
                )
              )
            }
          ])
        ),
        biasByBaselinePredictionDecile: metricSlices(
          selected,
          (row) => String(
            context.baselineDeciles.get(workKey(row))
          )
        )
      }];
    })
  );
}

function cumulativeAblations(rows) {
  const actual = sum(rows.map((row) => row.actual));
  const actualAbsolute = sum(rows.map((row) => Math.abs(row.actual)));
  return {
    actual,
    actualAbsolute,
    predictions: Object.fromEntries(ablations.map((id) => [
      id,
      sum(rows.map((row) => row.points[id]))
    ]))
  };
}

function calibrationAblations(rows) {
  return Object.fromEntries(ablations.map((id) => [
    id,
    calibration(rows.map((row) => ({
      actual: row.actual,
      prediction: row.points[id]
    })))
  ]));
}

function calibration(rows) {
  const count = rows.length;
  const sumX = sum(rows.map((row) => row.prediction));
  const sumY = sum(rows.map((row) => row.actual));
  const sumXX = sum(rows.map((row) => row.prediction ** 2));
  const sumXY = sum(
    rows.map((row) => row.prediction * row.actual)
  );
  const denominator = count * sumXX - sumX ** 2;
  const slope = Math.abs(denominator) > epsilon
    ? (count * sumXY - sumX * sumY) / denominator
    : null;
  const intercept = slope === null
    ? null
    : (sumY - slope * sumX) / count;
  const actualAbsolute = sum(
    rows.map((row) => Math.abs(row.actual))
  );
  return {
    count,
    slope,
    intercept,
    signedBias: actualAbsolute > 0
      ? (sumX - sumY) / actualAbsolute
      : null
  };
}

function transitionSlices(rows, keyFunction) {
  const grouped = groupBy(rows, keyFunction);
  return Object.fromEntries([...grouped].sort(([left], [right]) => (
    left.localeCompare(right)
  )).map(([key, selected]) => [
    key,
    stageTransitionSet(selected)
  ]));
}

function transitionSliceForStage(rows, stage, keyFunction) {
  const grouped = groupBy(rows, keyFunction);
  return Object.fromEntries([...grouped].sort(([left], [right]) => (
    left.localeCompare(right)
  )).map(([key, selected]) => [
    key,
    finalizeTransition(
      accumulateTransitionRows(selected, stage.from, stage.to)
    )
  ]));
}

function metricSlices(rows, keyFunction) {
  const grouped = groupBy(rows, keyFunction);
  return Object.fromEntries([...grouped].sort(([left], [right]) => (
    left.localeCompare(right)
  )).map(([key, selected]) => [
    key,
    {
      count: selected.length,
      actualAbsolute: sum(
        selected.map((row) => Math.abs(row.actual))
      ),
      ablations: Object.fromEntries(ablations.map((id) => [
        id,
        pointMetrics(selected.map((row) => ({
          actual: row.actual,
          prediction: row.points[id]
        })))
      ]))
    }
  ]));
}

function pointMetrics(rows) {
  const actualAbsolute = sum(
    rows.map((row) => Math.abs(row.actual))
  );
  const absoluteError = sum(
    rows.map((row) => Math.abs(row.prediction - row.actual))
  );
  const signedError = sum(
    rows.map((row) => row.prediction - row.actual)
  );
  return {
    predictionMass: sum(rows.map((row) => row.prediction)),
    absoluteError,
    signedError,
    wape: actualAbsolute > 0
      ? absoluteError / actualAbsolute
      : null,
    signedBias: actualAbsolute > 0
      ? signedError / actualAbsolute
      : null
  };
}

function stageTransitionSet(rows) {
  return Object.fromEntries(stages.map((stage) => [
    stage.id,
    finalizeTransition(
      accumulateTransitionRows(rows, stage.from, stage.to)
    )
  ]));
}

function accumulateTransitionRows(rows, from, to) {
  const accumulator = emptyTransition();
  for (const row of rows) {
    accumulateTransition(
      accumulator,
      row.actual,
      row.points[from],
      row.points[to]
    );
  }
  return accumulator;
}

function emptyTransition() {
  return {
    count: 0,
    actualAbsolute: 0,
    fromPredictionMass: 0,
    toPredictionMass: 0,
    fromAbsoluteError: 0,
    toAbsoluteError: 0,
    fromSignedError: 0,
    toSignedError: 0,
    fromOverpredictionMass: 0,
    toOverpredictionMass: 0,
    fromUnderpredictionMass: 0,
    toUnderpredictionMass: 0,
    worsenedCount: 0,
    improvedCount: 0,
    unchangedCount: 0
  };
}

function accumulateTransition(accumulator, actual, from, to) {
  const fromError = from - actual;
  const toError = to - actual;
  const fromAbsolute = Math.abs(fromError);
  const toAbsolute = Math.abs(toError);
  accumulator.count += 1;
  accumulator.actualAbsolute += Math.abs(actual);
  accumulator.fromPredictionMass += from;
  accumulator.toPredictionMass += to;
  accumulator.fromAbsoluteError += fromAbsolute;
  accumulator.toAbsoluteError += toAbsolute;
  accumulator.fromSignedError += fromError;
  accumulator.toSignedError += toError;
  accumulator.fromOverpredictionMass += Math.max(fromError, 0);
  accumulator.toOverpredictionMass += Math.max(toError, 0);
  accumulator.fromUnderpredictionMass += Math.max(-fromError, 0);
  accumulator.toUnderpredictionMass += Math.max(-toError, 0);
  if (toAbsolute > fromAbsolute + epsilon) {
    accumulator.worsenedCount += 1;
  } else if (toAbsolute + epsilon < fromAbsolute) {
    accumulator.improvedCount += 1;
  } else {
    accumulator.unchangedCount += 1;
  }
}

function finalizeTransition(value) {
  const denominator = value.actualAbsolute;
  return {
    ...value,
    absoluteErrorDelta:
      value.toAbsoluteError - value.fromAbsoluteError,
    normalizedAbsoluteErrorDelta: denominator > 0
      ? (value.toAbsoluteError - value.fromAbsoluteError) / denominator
      : null,
    signedErrorDelta: value.toSignedError - value.fromSignedError,
    biasDelta: denominator > 0
      ? (value.toSignedError - value.fromSignedError) / denominator
      : null,
    overpredictionMassDelta:
      value.toOverpredictionMass - value.fromOverpredictionMass,
    underpredictionMassDelta:
      value.toUnderpredictionMass - value.fromUnderpredictionMass
  };
}

function buildFactorCollectors() {
  return Object.fromEntries(["primary", "strict_rolling"].map((family) => [
    family,
    Object.fromEntries(directFactorDefinitions.map((definition) => [
      definition.id,
      {
        definition,
        values: [],
        weights: [],
        correlations: {
          baselinePrediction: emptyCorrelation(),
          actual: emptyCorrelation(),
          baselineResidual: emptyCorrelation(),
          horizon: emptyCorrelation()
        },
        identifiableCount: 0,
        unidentifiableCount: 0,
        lowerClampCount: 0,
        upperClampCount: 0
      }
    ]))
  ]));
}

function collectDirectFactors(row, collectors, config) {
  const family = collectors[row.family];
  for (const definition of directFactorDefinitions) {
    const value = factorFromPositive(row, definition);
    const collector = family[definition.id];
    if (value === null) {
      collector.unidentifiableCount += 1;
      continue;
    }
    collector.identifiableCount += 1;
    collector.values.push(value);
    collector.weights.push(Math.abs(row.positive.A1));
    const baseline = row.positive.A1;
    addCorrelation(
      collector.correlations.baselinePrediction,
      value,
      baseline
    );
    addCorrelation(
      collector.correlations.actual,
      value,
      row.actualPositive
    );
    addCorrelation(
      collector.correlations.baselineResidual,
      value,
      row.actualPositive - baseline
    );
    addCorrelation(
      collector.correlations.horizon,
      value,
      row.horizonMonths
    );
    const [minimum, maximum] = factorBounds(
      definition.id,
      row.mechanism,
      config
    );
    if (nearlyEqual(value, minimum)) {
      collector.lowerClampCount += 1;
    }
    if (nearlyEqual(value, maximum)) {
      collector.upperClampCount += 1;
    }
  }
}

function factorFromPositive(row, definition) {
  return ratio(
    row.positive[definition.numerator],
    row.positive[definition.denominator]
  );
}

function factorBounds(id, mechanism, config) {
  if (id !== "rawExpertFactor") {
    return [
      Number(config.training.scaleMinimum),
      Number(config.training.scaleMaximum)
    ];
  }
  if (mechanism === "transactional") return [0.1, 1];
  if (mechanism === "membership") return [0.25, 2];
  if (mechanism === "advertising") return [0.25, 2];
  return [1, 1];
}

function finalizeFactorCollectors(collectors) {
  return Object.fromEntries(Object.entries(collectors).map(
    ([family, definitions]) => [
      family,
      Object.fromEntries(Object.entries(definitions).map(
        ([id, collector]) => [
          id,
          {
            formula:
              `${collector.definition.numerator}`
              + `/${collector.definition.denominator}`,
            identifiableCount: collector.identifiableCount,
            unidentifiableCount: collector.unidentifiableCount,
            distribution: distribution(collector.values),
            baselineWeightedMean: weightedMean(
              collector.values,
              collector.weights
            ),
            lowerClampCount: collector.lowerClampCount,
            upperClampCount: collector.upperClampCount,
            lowerClampShare: collector.identifiableCount > 0
              ? collector.lowerClampCount
                / collector.identifiableCount
              : null,
            upperClampShare: collector.identifiableCount > 0
              ? collector.upperClampCount
                / collector.identifiableCount
              : null,
            correlations: Object.fromEntries(
              Object.entries(collector.correlations).map(
                ([name, value]) => [name, finalizeCorrelation(value)]
              )
            )
          }
        ]
      ))
    ]
  ));
}

function buildFactorThresholds(collectors) {
  return Object.fromEntries(Object.entries(collectors).map(
    ([family, definitions]) => [
      family,
      Object.fromEntries(Object.entries(definitions).map(
        ([id, collector]) => [
          id,
          decileThresholds(collector.values)
        ]
      ))
    ]
  ));
}

function emptyCorrelation() {
  return {
    count: 0,
    sumX: 0,
    sumY: 0,
    sumXX: 0,
    sumYY: 0,
    sumXY: 0
  };
}

function addCorrelation(value, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  value.count += 1;
  value.sumX += x;
  value.sumY += y;
  value.sumXX += x * x;
  value.sumYY += y * y;
  value.sumXY += x * y;
}

function finalizeCorrelation(value) {
  const numerator = value.count * value.sumXY
    - value.sumX * value.sumY;
  const left = value.count * value.sumXX - value.sumX ** 2;
  const right = value.count * value.sumYY - value.sumY ** 2;
  const denominator = Math.sqrt(Math.max(0, left * right));
  return {
    count: value.count,
    pearson: denominator > epsilon ? numerator / denominator : null
  };
}

function buildEmptyChannelDiagnostics() {
  return Object.fromEntries(["primary", "strict_rolling"].map((family) => [
    family,
    {
      overall: stageAccumulatorSet(),
      A1ToA6: emptyTransition(),
      byMechanism: new Map(),
      byNamedPlatform: new Map(),
      byFallback: Object.fromEntries(stages.map((stage) => [
        stage.id,
        new Map()
      ])),
      bySpecialistUse: Object.fromEntries(stages.map((stage) => [
        stage.id,
        new Map()
      ])),
      byHorizon: new Map(),
      byOrigin: new Map(),
      byFactorDecile: Object.fromEntries(stages.map((stage) => [
        stage.id,
        new Map()
      ])),
      byTopRevenue: new Map(),
      occurrence: new Map(),
      sparseFallback: new Map(),
      selectedPriorStrength: new Map()
    }
  ]));
}

function accumulateChannelDiagnostics(
  diagnostics,
  row,
  familyContext,
  factorThresholds
) {
  const family = diagnostics[row.family];
  accumulateStageSet(family.overall, row);
  accumulateTransition(
    family.A1ToA6,
    row.actual,
    row.points.A1,
    row.points.A6
  );
  accumulateStageMap(family.byMechanism, row.mechanism, row);
  accumulateStageMap(family.byNamedPlatform, row.platformId, row);
  accumulateStageMap(
    family.byHorizon,
    String(row.horizonMonths),
    row
  );
  accumulateStageMap(family.byOrigin, row.origin, row);
  accumulateStageMap(
    family.selectedPriorStrength,
    String(row.selectedPriorStrength),
    row
  );
  for (const [fraction, workIds] of Object.entries(
    familyContext[row.family].topSets
  )) {
    if (workIds.has(row.standardWorkId)) {
      accumulateStageMap(family.byTopRevenue, fraction, row);
    }
  }
  for (const stage of stages) {
    const fallback = fallbackForStage(row, stage);
    accumulateSingleStageMap(
      family.byFallback[stage.id],
      fallback,
      row,
      stage
    );
    accumulateSingleStageMap(
      family.bySpecialistUse[stage.id],
      specialistUse(row, stage, fallback),
      row,
      stage
    );
    const factorId = factorIdForStage(stage);
    const definition = directFactorDefinitions.find(
      (value) => value.id === factorId
    );
    const factor = factorFromPositive(row, definition);
    const factorDecile = factor === null
      ? "unidentifiable"
      : String(decileForValue(
        factor,
        factorThresholds[row.family][factorId]
      ));
    accumulateSingleStageMap(
      family.byFactorDecile[stage.id],
      factorDecile,
      row,
      stage
    );
  }
  accumulateA1ToA6Map(
    family.occurrence,
    occurrenceClass(row),
    row
  );
  accumulateA1ToA6Map(
    family.sparseFallback,
    row.fallback.A6 === "hierarchically_shrunk_taxonomy"
      ? "taxonomy_supported"
      : "sparse_or_parent_fallback",
    row
  );
}

function stageAccumulatorSet() {
  return Object.fromEntries(stages.map((stage) => [
    stage.id,
    emptyTransition()
  ]));
}

function accumulateStageSet(value, row) {
  for (const stage of stages) {
    accumulateTransition(
      value[stage.id],
      row.actual,
      row.points[stage.from],
      row.points[stage.to]
    );
  }
}

function accumulateStageMap(map, key, row) {
  const value = map.get(key) ?? stageAccumulatorSet();
  accumulateStageSet(value, row);
  map.set(key, value);
}

function accumulateSingleStageMap(map, key, row, stage) {
  const value = map.get(key) ?? emptyTransition();
  accumulateTransition(
    value,
    row.actual,
    row.points[stage.from],
    row.points[stage.to]
  );
  map.set(key, value);
}

function accumulateA1ToA6Map(map, key, row) {
  const value = map.get(key) ?? emptyTransition();
  accumulateTransition(
    value,
    row.actual,
    row.points.A1,
    row.points.A6
  );
  map.set(key, value);
}

function fallbackForStage(row, stage) {
  if (stage.id === "A1_to_A2") {
    return row.mechanism === "learnedGlobal"
      ? "learnedGlobal"
      : "raw_mechanism_factor";
  }
  return row.fallback[stage.to];
}

function specialistUse(row, stage, fallback) {
  if (!row.observedAtOrigin) return "future_first_seen_label_only";
  if (stage.id === "A1_to_A2") {
    return row.mechanism === "learnedGlobal"
      ? "fallback"
      : "specialist_used";
  }
  if (stage.id === "A2_to_A3") {
    return fallback === "mechanism" ? "specialist_used" : "fallback";
  }
  if (stage.id === "A3_to_A4") {
    return fallback.includes("platform")
      ? "specialist_used"
      : "fallback";
  }
  if (stage.id === "A4_to_A5") {
    return fallback
      === "platform_x_mechanism_x_intrinsic_category"
      ? "specialist_used"
      : "fallback";
  }
  return fallback === "learnedGlobal" ? "fallback" : "specialist_used";
}

function occurrenceClass(row) {
  if (!row.observedAtOrigin) return "future_first_seen_label_only";
  if (row.actualPositive <= epsilon && row.positive.A6 > epsilon) {
    return "false_positive_occurrence";
  }
  if (row.actualPositive > epsilon && row.positive.A6 <= epsilon) {
    return "missed_positive_occurrence";
  }
  if (row.actualPositive > epsilon && row.positive.A6 > epsilon) {
    return "positive_occurrence_both";
  }
  return "true_zero_both";
}

function finalizeChannelDiagnostics(diagnostics) {
  return Object.fromEntries(Object.entries(diagnostics).map(
    ([family, value]) => [
      family,
      {
        stageTransitions: finalizeStageSet(value.overall),
        A1ToA6: finalizeTransition(value.A1ToA6),
        byMechanism: finalizeStageMap(value.byMechanism),
        byNamedPlatform: finalizeStageMap(value.byNamedPlatform),
        byFallback: Object.fromEntries(stages.map((stage) => [
          stage.id,
          finalizeSingleStageMap(value.byFallback[stage.id])
        ])),
        bySpecialistUse: Object.fromEntries(stages.map((stage) => [
          stage.id,
          finalizeSingleStageMap(value.bySpecialistUse[stage.id])
        ])),
        byHorizon: finalizeStageMap(value.byHorizon),
        byOrigin: finalizeStageMap(value.byOrigin),
        byFactorDecile: Object.fromEntries(stages.map((stage) => [
          stage.id,
          finalizeSingleStageMap(value.byFactorDecile[stage.id])
        ])),
        byTopRevenue: finalizeStageMap(value.byTopRevenue),
        occurrence: finalizeSingleStageMap(value.occurrence),
        sparseFallback: finalizeSingleStageMap(value.sparseFallback),
        selectedPriorStrength:
          finalizeStageMap(value.selectedPriorStrength)
      }
    ]
  ));
}

function finalizeStageSet(value) {
  return Object.fromEntries(stages.map((stage) => [
    stage.id,
    finalizeTransition(value[stage.id])
  ]));
}

function finalizeStageMap(map) {
  return Object.fromEntries([...map].sort(([left], [right]) => (
    left.localeCompare(right)
  )).map(([key, value]) => [key, finalizeStageSet(value)]));
}

function finalizeSingleStageMap(map) {
  return Object.fromEntries([...map].sort(([left], [right]) => (
    left.localeCompare(right)
  )).map(([key, value]) => [key, finalizeTransition(value)]));
}

function factorIdForStage(stage) {
  return {
    A1_to_A2: "rawExpertFactor",
    A2_to_A3: "mechanismScale",
    A3_to_A4: "platformMechanismScale",
    A4_to_A5: "taxonomyScale",
    A5_to_A6: "selectedTaxonomyScale"
  }[stage.id];
}

function collectHorizonReuse(row, groups) {
  if (row.family !== "strict_rolling" || !row.observedAtOrigin) return;
  const key = `${row.standardWorkId}\u001f${row.origin}\u001f`
    + `${row.channelUid}`;
  const value = groups.get(key) ?? {
    horizons: new Set(),
    factors: [],
    residualSigns: new Set(),
    A1ToA6: emptyTransition(),
    positiveDeteriorationMass: 0
  };
  value.horizons.add(row.horizonMonths);
  const factor = ratio(row.positive.A6, row.positive.A1);
  if (factor !== null) value.factors.push(factor);
  const residual = row.actualPositive - row.positive.A1;
  if (Math.abs(residual) > epsilon) {
    value.residualSigns.add(Math.sign(residual));
  }
  const before = value.A1ToA6.toAbsoluteError
    - value.A1ToA6.fromAbsoluteError;
  accumulateTransition(
    value.A1ToA6,
    row.actual,
    row.points.A1,
    row.points.A6
  );
  const after = value.A1ToA6.toAbsoluteError
    - value.A1ToA6.fromAbsoluteError;
  value.positiveDeteriorationMass += Math.max(0, after - before);
  groups.set(key, value);
}

function finalizeHorizonReuse(groups) {
  const output = {
    multiHorizonGroupCount: 0,
    invariantA6FactorGroupCount: 0,
    residualDirectionChangingGroupCount: 0,
    invariantFactorAndDirectionChangingGroupCount: 0,
    invariantFactorAndDirectionChangingA1ToA6: emptyTransition(),
    invariantFactorAndDirectionChangingPositiveDeteriorationMass: 0
  };
  for (const value of groups.values()) {
    if (value.horizons.size < 2) continue;
    output.multiHorizonGroupCount += 1;
    const invariant = value.factors.length > 0
      && Math.max(...value.factors) - Math.min(...value.factors) <= 1e-10;
    const directionChanging = value.residualSigns.size > 1;
    if (invariant) output.invariantA6FactorGroupCount += 1;
    if (directionChanging) {
      output.residualDirectionChangingGroupCount += 1;
    }
    if (invariant && directionChanging) {
      output.invariantFactorAndDirectionChangingGroupCount += 1;
      mergeTransition(
        output.invariantFactorAndDirectionChangingA1ToA6,
        value.A1ToA6
      );
      output.invariantFactorAndDirectionChangingPositiveDeteriorationMass
        += value.positiveDeteriorationMass;
    }
  }
  output.invariantFactorAndDirectionChangingA1ToA6 =
    finalizeTransition(
      output.invariantFactorAndDirectionChangingA1ToA6
    );
  return output;
}

function mergeTransition(target, source) {
  for (const key of Object.keys(target)) {
    target[key] += source[key];
  }
}

function collectTaxonomyCell(row, cells) {
  if (!row.observedAtOrigin) return;
  const key = `${row.family}\u001f${row.platformId}\u001f`
    + `${row.mechanism}\u001f${row.intrinsicCategory}\u001f`
    + `${row.fallback.A5}\u001f${row.fallback.A6}`;
  const value = cells.get(key) ?? {
    family: row.family,
    platformId: row.platformId,
    mechanism: row.mechanism,
    intrinsicCategory: row.intrinsicCategory,
    fallbackA5: row.fallback.A5,
    fallbackA6: row.fallback.A6,
    rowCount: 0,
    works: new Set(),
    actual: 0,
    predictions: { A4: 0, A5: 0, A6: 0 },
    absoluteErrors: { A4: 0, A5: 0, A6: 0 }
  };
  value.rowCount += 1;
  value.works.add(row.standardWorkId);
  value.actual += row.actual;
  for (const id of ["A4", "A5", "A6"]) {
    value.predictions[id] += row.points[id];
    value.absoluteErrors[id] += Math.abs(row.points[id] - row.actual);
  }
  cells.set(key, value);
}

function finalizeTaxonomyCells(cells) {
  return [...cells.values()].map((value) => ({
    family: value.family,
    platformId: value.platformId,
    mechanism: value.mechanism,
    intrinsicCategory: value.intrinsicCategory,
    fallbackA5: value.fallbackA5,
    fallbackA6: value.fallbackA6,
    evaluationRowCount: value.rowCount,
    evaluationWorkCount: value.works.size,
    actual: value.actual,
    predictions: value.predictions,
    absoluteErrors: value.absoluteErrors
  })).sort((left, right) => (
    left.family.localeCompare(right.family)
    || left.platformId.localeCompare(right.platformId)
    || left.mechanism.localeCompare(right.mechanism)
    || left.intrinsicCategory.localeCompare(right.intrinsicCategory)
  ));
}

function buildPrivateWorkRow(row, familyContext) {
  const key = workKey(row);
  return {
    schema:
      "m2.current.channel_experts_architecture_audit_row_private.v0.1",
    tracked: false,
    rowKind: "work",
    evaluationFamily: row.family,
    standardWorkId: row.standardWorkId,
    origin: row.origin,
    horizonMonths: row.horizonMonths,
    actual: row.actual,
    ablationPoints: row.points,
    baselinePredictionDecile:
      familyContext[row.family].baselineDeciles.get(key),
    appliedFactorDeciles: Object.fromEntries(stages.map((stage) => [
      stage.id,
      familyContext[row.family].factorDeciles[stage.id].get(key) ?? null
    ])),
    topRevenueMembership: Object.fromEntries(
      Object.entries(familyContext[row.family].topSets).map(
        ([fraction, workIds]) => [
          fraction,
          workIds.has(row.standardWorkId)
        ]
      )
    ),
    stageDeltas: Object.fromEntries(stages.map((stage) => [
      stage.id,
      rowStageDelta(row, stage)
    ])),
    selectedPriorStrength: row.selectedPriorStrength,
    postHoc: true,
    selectionEligible: false,
    modelUpgradeEvidence: false
  };
}

function buildPrivateChannelRow(row, factorThresholds) {
  return {
    schema:
      "m2.current.channel_experts_architecture_audit_row_private.v0.1",
    tracked: false,
    rowKind: "work_channel",
    evaluationFamily: row.family,
    standardWorkId: row.standardWorkId,
    origin: row.origin,
    horizonMonths: row.horizonMonths,
    channelUid: row.channelUid,
    platformId: row.platformId,
    mechanism: row.mechanism,
    intrinsicCategory: row.intrinsicCategory,
    observedAtOrigin: row.observedAtOrigin,
    actualPositive: row.actualPositive,
    actual: row.actual,
    ablationPositivePoints: row.positive,
    ablationPoints: row.points,
    fallback: row.fallback,
    directFactors: Object.fromEntries(
      directFactorDefinitions.map((definition) => {
        const value = factorFromPositive(row, definition);
        return [definition.id, {
          value,
          decile: value === null
            ? null
            : decileForValue(
              value,
              factorThresholds[row.family][definition.id]
            )
        }];
      })
    ),
    stageDeltas: Object.fromEntries(stages.map((stage) => [
      stage.id,
      rowStageDelta(row, stage)
    ])),
    occurrenceClass: occurrenceClass(row),
    selectedPriorStrength: row.selectedPriorStrength,
    postHoc: true,
    selectionEligible: false,
    modelUpgradeEvidence: false
  };
}

function rowStageDelta(row, stage) {
  const fromError = row.points[stage.from] - row.actual;
  const toError = row.points[stage.to] - row.actual;
  return {
    predictionDelta:
      row.points[stage.to] - row.points[stage.from],
    absoluteErrorDelta: Math.abs(toError) - Math.abs(fromError),
    signedErrorDelta: toError - fromError
  };
}

async function writePrivateLine(writer, value) {
  if (!writer.write(JSON.stringify(value) + "\n")) {
    await once(writer, "drain");
  }
}

function distribution(values) {
  if (values.length === 0) return null;
  const ordered = [...values].sort((left, right) => left - right);
  const meanValue = sum(ordered) / ordered.length;
  const variance = sum(
    ordered.map((value) => (value - meanValue) ** 2)
  ) / ordered.length;
  return {
    count: ordered.length,
    minimum: ordered[0],
    p01: quantile(ordered, 0.01),
    p05: quantile(ordered, 0.05),
    p10: quantile(ordered, 0.1),
    p25: quantile(ordered, 0.25),
    median: quantile(ordered, 0.5),
    p75: quantile(ordered, 0.75),
    p90: quantile(ordered, 0.9),
    p95: quantile(ordered, 0.95),
    p99: quantile(ordered, 0.99),
    maximum: ordered.at(-1),
    mean: meanValue,
    standardDeviation: Math.sqrt(variance)
  };
}

function weightedMean(values, weights) {
  const denominator = sum(weights);
  return denominator > 0
    ? sum(values.map((value, index) => value * weights[index]))
      / denominator
    : null;
}

function assignDeciles(rows, valueFunction, keyFunction) {
  const ordered = [...rows].sort((left, right) => (
    valueFunction(left) - valueFunction(right)
    || keyFunction(left).localeCompare(keyFunction(right))
  ));
  return new Map(ordered.map((row, index) => [
    keyFunction(row),
    Math.min(10, Math.floor(index * 10 / ordered.length) + 1)
  ]));
}

function decileThresholds(values) {
  if (values.length === 0) return [];
  const ordered = [...values].sort((left, right) => left - right);
  return Array.from(
    { length: 9 },
    (_, index) => quantile(ordered, (index + 1) / 10)
  );
}

function decileForValue(value, thresholds) {
  let decile = 1;
  while (
    decile <= thresholds.length
    && value > thresholds[decile - 1]
  ) {
    decile += 1;
  }
  return decile;
}

function quantile(ordered, probability) {
  if (ordered.length === 1) return ordered[0];
  const position = (ordered.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const weight = position - lower;
  return ordered[lower] * (1 - weight) + ordered[upper] * weight;
}

function ratio(numerator, denominator) {
  if (Math.abs(denominator) <= epsilon) return null;
  const value = numerator / denominator;
  return Number.isFinite(value) ? value : null;
}

function nearlyEqual(left, right) {
  return Math.abs(left - right)
    <= 1e-9 * Math.max(1, Math.abs(left), Math.abs(right));
}

function groupBy(rows, keyFunction) {
  const result = new Map();
  for (const row of rows) {
    const key = String(keyFunction(row));
    const value = result.get(key) ?? [];
    value.push(row);
    result.set(key, value);
  }
  return result;
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value), 0);
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}
