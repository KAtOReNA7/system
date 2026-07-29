import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  crossFitM2HumanAnchored,
  rawCandidateLayerFvaGate,
  strictRollingM2HumanAnchored,
  workClusterBootstrap
} from "../../src/domain/m2Current/humanAnchored.js";
import { scoreM2CurrentPointRows } from
  "../../src/domain/m2Current/metrics.js";
import {
  runM2HumanAnchoredTsbPrivateDevelopment,
  runM2HumanAnchoredTsbPublicDiagnostic,
  writeM2HumanAnchoredTsbBlockedDevelopment
} from "./human_anchored_tsb_occurrence_mode.mjs";
import {
  runM2LifecycleAwarePrivateDevelopment,
  runM2LifecycleAwarePublicDiagnostic
} from "./lifecycle_aware_mode.mjs";
import {
  runM2ChannelExpertsPrivateDevelopment,
  runM2ChannelExpertsPublicDiagnostic
} from "./channel_experts_mode.mjs";
import {
  prepareM2ChannelGenerativeRunReceipt,
  recordM2ChannelGenerativeRunFailure,
  runM2ChannelGenerativePrivateDevelopment,
  runM2ChannelGenerativePublicDiagnostic,
  prepareM2PublishingScaleRunReceipt,
  recordM2PublishingScaleRunFailure,
  runM2PublishingScaleChannelPublicDiagnostic,
  runM2PublishingScalePrivateDevelopment,
  verifyM2PublishingScaleGitAndCiPreflight
} from "./channel_generative_mode.mjs";
import {
  runM2CoreRevenueManualPrivateDevelopment,
  runM2CoreRevenueManualPublicDiagnostic
} from "./core_revenue_manual_mode.mjs";
import {
  runM2LayeredRevenueCompositionPrivateDevelopment,
  runM2LayeredRevenueCompositionPublicDiagnostic
} from "./layered_revenue_composition_mode.mjs";
import {
  runM2CoreLegacyPopulationPublicDiagnostic
} from "./core_legacy_population_mode.mjs";
import {
  runM2CoreLegacyFrozenRescore,
  runM2CoreLegacyPopulationK0Audit,
  runM2CoreLegacyTailInterferenceTest
} from "./core_legacy_population_private.mjs";

let config;

await main();

async function main() {
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);
const tsbPublicMode = process.argv.includes("--tsb-occurrence-public");
const tsbPrivateMode = process.argv.includes("--tsb-occurrence");
const lifecyclePublicMode = process.argv.includes("--lifecycle-aware-public");
const lifecyclePrivateMode = process.argv.includes("--lifecycle-aware");
const channelExpertsPublicMode = process.argv.includes(
  "--channel-experts-public"
);
const channelExpertsPrivateMode = process.argv.includes(
  "--channel-experts"
);
const channelGenerativePublicMode = process.argv.includes(
  "--channel-generative-public"
);
const channelGenerativePrivateMode = process.argv.includes(
  "--channel-generative"
);
const publishingScaleChannelPublicMode = process.argv.includes(
  "--publishing-scale-channel-public"
);
const publishingScaleChannelPrivateMode = process.argv.includes(
  "--publishing-scale-channel"
);
const coreRevenueManualPublicMode = process.argv.includes(
  "--core-revenue-manual-public"
);
const coreRevenueManualPrivateMode = process.argv.includes(
  "--core-revenue-manual"
);
const layeredRevenueCompositionPublicMode = process.argv.includes(
  "--layered-revenue-composition-public"
);
const layeredRevenueCompositionPrivateMode = process.argv.includes(
  "--layered-revenue-composition"
);
const coreLegacyPopulationPublicMode = process.argv.includes(
  "--core-legacy-population-public"
);
const coreLegacyPopulationAuditMode = process.argv.includes(
  "--core-legacy-population-audit"
);
const coreLegacyPopulationRescoreMode = process.argv.includes(
  "--core-legacy-population-rescore"
);
const coreLegacyTailTestMode = process.argv.includes(
  "--core-legacy-tail-test"
);
if (tsbPublicMode) {
  await runM2HumanAnchoredTsbPublicDiagnostic({
    root,
    verify: process.argv.includes("--verify")
  });
  return;
}
if (lifecyclePublicMode) {
  await runM2LifecycleAwarePublicDiagnostic({
    root,
    verify: process.argv.includes("--verify")
  });
  return;
}
if (channelExpertsPublicMode) {
  await runM2ChannelExpertsPublicDiagnostic({
    root,
    verify: process.argv.includes("--verify")
  });
  return;
}
if (channelGenerativePublicMode) {
  await runM2ChannelGenerativePublicDiagnostic({
    root,
    verify: process.argv.includes("--verify")
  });
  return;
}
if (publishingScaleChannelPublicMode) {
  await runM2PublishingScaleChannelPublicDiagnostic({
    root,
    verify: process.argv.includes("--verify")
  });
  return;
}
if (coreRevenueManualPublicMode) {
  await runM2CoreRevenueManualPublicDiagnostic({
    root,
    verify: process.argv.includes("--verify")
  });
  return;
}
if (coreRevenueManualPrivateMode) {
  await runM2CoreRevenueManualPrivateDevelopment({ root });
  return;
}
if (layeredRevenueCompositionPublicMode) {
  await runM2LayeredRevenueCompositionPublicDiagnostic({
    root,
    verify: process.argv.includes("--verify")
  });
  return;
}
if (layeredRevenueCompositionPrivateMode) {
  await runM2LayeredRevenueCompositionPrivateDevelopment({ root });
  return;
}
if (coreLegacyPopulationPublicMode) {
  await runM2CoreLegacyPopulationPublicDiagnostic({
    root,
    verify: process.argv.includes("--verify")
  });
  return;
}
if (coreLegacyPopulationAuditMode) {
  const result = await runM2CoreLegacyPopulationK0Audit({ root });
  process.stdout.write(`${JSON.stringify({
    status: result.status,
    experimentId: result.experiment.stableExperimentId,
    modelTrainingPerformed:
      result.boundaries.modelTrainingPerformed
  }, null, 2)}\n`);
  return;
}
if (coreLegacyPopulationRescoreMode) {
  const result = await runM2CoreLegacyFrozenRescore({ root });
  process.stdout.write(`${JSON.stringify({
    status: result.status,
    experimentId: result.experiment.stableExperimentId,
    modelTrainingPerformed:
      result.boundaries.modelTrainingPerformed
  }, null, 2)}\n`);
  return;
}
if (coreLegacyTailTestMode) {
  const result = await runM2CoreLegacyTailInterferenceTest({ root });
  process.stdout.write(`${JSON.stringify({
    status: result.status,
    experimentId: result.experiment.stableExperimentId,
    tailInterferenceDecision:
      result.tailInterferenceDecision.status,
    validTrainingEvaluationCount:
      result.boundaries.validTrainingEvaluationCount
  }, null, 2)}\n`);
  return;
}
config = JSON.parse(await readFile(
  path.join(root, "config/m2-current-human-anchored.v0.1.json"),
  "utf8"
));
assertBoundary(config);

const privateDirectory = path.join(root, config.privateOutputs.directory);
if (channelGenerativePrivateMode) {
  const head = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true
  });
  if (head.status !== 0) {
    throw new Error("m2_channel_generative_git_head_unavailable");
  }
  await prepareM2ChannelGenerativeRunReceipt({
    root,
    privateDirectory,
    implementationCommit: head.stdout.trim(),
    command:
      "npm run develop:m2:current:channel-generative",
    environment: `${process.platform}-${process.arch}`
  });
}
if (publishingScaleChannelPrivateMode) {
  const gitPreflight = verifyM2PublishingScaleGitAndCiPreflight({ root });
  await prepareM2PublishingScaleRunReceipt({
    root,
    privateDirectory,
    gitPreflight,
    command:
      "npm run develop:m2:current:publishing-scale-channel",
    environment: `${process.platform}-${process.arch}`
  });
}
const materialization = spawnSync(
  process.execPath,
  [
    path.join(root, "scripts/run-codex-python.mjs"),
    path.join(
      root,
      "scripts/m2-current/materialize_human_anchored_cases.py"
    ),
    ...(channelExpertsPrivateMode ? ["--channel-experts"] : []),
    ...(
      channelGenerativePrivateMode
        ? ["--channel-generative"]
        : []
    ),
    ...(
      publishingScaleChannelPrivateMode
        ? ["--publishing-scale-channel"]
        : []
    )
  ],
  {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024
  }
);
if (materialization.status !== 0) {
  if (publishingScaleChannelPrivateMode) {
    await recordM2PublishingScaleRunFailure({
      root,
      privateDirectory,
      error: new Error(
        "controlled_private_materialization_failed:"
          + String(materialization.stderr ?? "").trim()
      )
    });
  }
  if (tsbPrivateMode) {
    await runM2HumanAnchoredTsbPublicDiagnostic({
      root,
      verify: false
    });
    await writeM2HumanAnchoredTsbBlockedDevelopment({
      root,
      reason: "controlled_private_materialization_failed"
    });
    return;
  }
  throw new Error(
    "m2_human_anchored_materialization_failed:"
    + materialization.stderr
  );
}

const [
  historyText,
  primaryText,
  auxiliaryText,
  manifestText
] = await Promise.all([
  readFile(
    path.join(privateDirectory, config.privateOutputs.histories),
    "utf8"
  ),
  readFile(
    path.join(privateDirectory, config.privateOutputs.primaryCases),
    "utf8"
  ),
  readFile(
    path.join(privateDirectory, config.privateOutputs.auxiliaryCases),
    "utf8"
  ),
  readFile(
    path.join(privateDirectory, config.privateOutputs.manifest),
    "utf8"
  )
]);
const manifest = JSON.parse(manifestText);
verifyManifest(manifest, {
  historyText,
  primaryText,
  auxiliaryText
});
const histories = parseNdjson(historyText);
const historyByKey = new Map(histories.map(
  (row) => [row.historyKey, row]
));
if (historyByKey.size !== histories.length) {
  throw new Error("m2_human_anchored_history_key_duplicate");
}
const primaryCases = joinCases(parseNdjson(primaryText), historyByKey);
const auxiliaryCases = joinCases(parseNdjson(auxiliaryText), historyByKey);

if (tsbPrivateMode) {
  await runM2HumanAnchoredTsbPrivateDevelopment({
    root,
    baseConfig: config,
    manifest,
    primaryCases,
    auxiliaryCases,
    privateDirectory
  });
  return;
}
if (lifecyclePrivateMode) {
  await runM2LifecycleAwarePrivateDevelopment({
    root,
    baseConfig: config,
    manifest,
    primaryCases,
    auxiliaryCases,
    privateDirectory
  });
  return;
}
if (channelExpertsPrivateMode) {
  await runM2ChannelExpertsPrivateDevelopment({
    root,
    baseConfig: config,
    manifest,
    primaryCases,
    auxiliaryCases,
    privateDirectory
  });
  return;
}
if (channelGenerativePrivateMode) {
  try {
    await runM2ChannelGenerativePrivateDevelopment({
      root,
      privateDirectory,
      baseManifest: manifest
    });
  } catch (error) {
    await recordM2ChannelGenerativeRunFailure({
      root,
      privateDirectory,
      error
    });
    throw error;
  }
  return;
}
if (publishingScaleChannelPrivateMode) {
  try {
    await runM2PublishingScalePrivateDevelopment({
      root,
      privateDirectory,
      baseManifest: manifest
    });
  } catch (error) {
    await recordM2PublishingScaleRunFailure({
      root,
      privateDirectory,
      error
    });
    throw error;
  }
  return;
}

const primary = crossFitM2HumanAnchored(primaryCases, config);
const primaryBootstrap = workClusterBootstrap(primary.rows, {
  iterations: config.learning.bootstrapIterations,
  seed: config.learning.bootstrapSeed
});
const strictAuxiliary = strictRollingM2HumanAnchored(
  auxiliaryCases,
  config
);
const v03OverlapCases = auxiliaryCases.filter(
  (row) => row.v03ExactOverlap === true
);
const v03Overlap = crossFitM2HumanAnchored(v03OverlapCases, config);
const v03NewMetrics = scoreM2CurrentPointRows(v03Overlap.rows);
const v03Metrics = scoreM2CurrentPointRows(v03Overlap.rows.map((row) => ({
  actual: row.actual,
  pointEstimate: row.v03PointEstimate
})));
const relativeWapeToV03 = v03NewMetrics.wape / v03Metrics.wape - 1;

const gates = evaluateGates({
  config,
  manifest,
  primary,
  primaryBootstrap,
  v03NewMetrics,
  v03Metrics,
  relativeWapeToV03
});
const publicResult = buildPublicResult({
  config,
  manifest,
  primary,
  primaryBootstrap,
  strictAuxiliary,
  v03Overlap,
  v03NewMetrics,
  v03Metrics,
  relativeWapeToV03,
  gates
});
const privateEvaluationRows = [
  ...primary.rows.map((row) => compactEvaluationRow(row, "primary")),
  ...strictAuxiliary.rows.map(
    (row) => compactEvaluationRow(row, "strict_auxiliary")
  ),
  ...v03Overlap.rows.map(
    (row) => compactEvaluationRow(row, "v03_overlap_cross_work")
  )
];
const privateEvaluationText = privateEvaluationRows.map(
  (row) => JSON.stringify(row)
).join("\n") + "\n";
const privateEvaluationManifest = {
  schema: "m2.current.human_anchored.evaluation_private_manifest.v0.1",
  tracked: false,
  candidateId: config.candidateId,
  rowCount: privateEvaluationRows.length,
  sha256: digest(privateEvaluationText),
  primaryRowCount: primary.rows.length,
  strictAuxiliaryRowCount: strictAuxiliary.rows.length,
  v03OverlapCrossWorkRowCount: v03Overlap.rows.length,
  independentWorkCountPrimary: manifest.primary.independentWorkCount,
  finalHoldoutOpened: false,
  independentLaterOriginOpened: false,
  providerUsed: false,
  databaseRead: false
};

await Promise.all([
  mkdir(
    path.dirname(path.join(root, config.publicOutput)),
    { recursive: true }
  ),
  mkdir(privateDirectory, { recursive: true })
]);
await Promise.all([
  writeFile(
    path.join(privateDirectory, config.privateOutputs.evaluation),
    privateEvaluationText,
    "utf8"
  ),
  writeFile(
    path.join(
      privateDirectory,
      config.privateOutputs.evaluationManifest
    ),
    JSON.stringify(privateEvaluationManifest, null, 2) + "\n",
    "utf8"
  ),
  writeFile(
    path.join(root, config.publicOutput),
    JSON.stringify(publicResult, null, 2) + "\n",
    "utf8"
  ),
  writeFile(
    path.join(root, config.publicReport),
    renderReport(publicResult),
    "utf8"
  )
]);

process.stdout.write(JSON.stringify({
  candidateId: config.candidateId,
  primary: publicResult.primary.metrics.point.occurrenceAndReversal,
  strictAuxiliary:
    publicResult.strictAuxiliary.metrics.point.occurrenceAndReversal,
  relativeWapeToManual:
    publicResult.primary.relativeWapeToManual,
  relativeWapeToV03,
  developmentDecision: gates.developmentDecision,
  maturityDecision: gates.maturityDecision
}) + "\n");
}

function assertBoundary(value) {
  if (
    value?.schema !== "m2.current.human_anchored_development.v0.1"
    || value?.target !== "future_sales_share_cash"
    || value?.authorization?.populationExpansion !== true
    || value?.authorization?.humanParameterLearning !== true
    || value?.authorization?.hierarchicalExpertDevelopment !== true
    || value?.authorization?.probabilisticDevelopment !== true
    || value?.authorization?.independentLaterOrigin !== false
    || value?.authorization?.finalHoldout !== false
    || value?.authorization?.provider !== false
    || value?.authorization?.database !== false
    || value?.authorization?.canary !== false
    || value?.authorization?.release !== false
    || value?.authorization?.m3Formal !== false
  ) {
    throw new Error("m2_human_anchored_authorization_boundary_differs");
  }
}

function verifyManifest(value, texts) {
  if (
    value?.schema !== "m2.current.human_anchored.private_manifest.v0.1"
    || value?.target !== "future_sales_share_cash"
    || value?.authorityWorkCount !== config.dataContract.authorityWorkCount
    || value?.dataQuality?.mappingCoverage !== 1
    || value?.dataQuality?.amountConservationDifference !== 0
    || value?.dataQuality?.signedCashSeparatedBeforeAggregation !== true
    || value?.dataQuality?.peerTrendExcludesTargetWork !== true
    || value?.dataQuality?.unmaturedLabelZeroImputationCount !== 0
    || value?.dataQuality?.pre2021CashAmountUsed !== false
    || value?.dataQuality?.post2025CashAmountUsed !== false
    || value?.dataQuality?.buyoutCashUsed !== false
    || value?.finalHoldoutOpened !== false
    || value?.providerUsed !== false
    || value?.databaseRead !== false
    || value?.digests?.historiesSha256 !== digest(texts.historyText)
    || value?.digests?.primaryCasesSha256 !== digest(texts.primaryText)
    || value?.digests?.auxiliaryCasesSha256 !== digest(texts.auxiliaryText)
  ) {
    throw new Error("m2_human_anchored_private_manifest_invalid");
  }
}

function joinCases(cases, historiesByKey) {
  return cases.map((row) => {
    const history = historiesByKey.get(row.historyKey);
    if (!history || history.origin !== row.origin) {
      throw new Error("m2_human_anchored_case_history_missing");
    }
    return {
      ...history,
      ...row,
      canonicalChannels: history.canonicalChannels
    };
  });
}

function evaluateGates({
  config: value,
  manifest: privateManifest,
  primary: primaryResult,
  primaryBootstrap: bootstrap,
  v03NewMetrics: newMetrics,
  v03Metrics: oldMetrics,
  relativeWapeToV03: v03Delta
}) {
  const gate = value.gates;
  const point = primaryResult.metrics.point.occurrenceAndReversal;
  const manual = primaryResult.metrics.point.manualFaithful;
  const relativeManual = point.wape / manual.wape - 1;
  const coverage80 = primaryResult.metrics.probabilistic
    .intervalCoverage.central_80?.observed ?? null;
  const segmentBias = Object.values(
    primaryResult.metrics.bySegment
  ).map((metrics) => Math.abs(metrics.signedBias));
  const checks = {
    modernWindowAndPopulationExpanded: (
      privateManifest.modernWindowWorkWithFactCount > 300
      && privateManifest.primary.independentWorkCount > 300
    ),
    mappingAndCashConservation: (
      privateManifest.dataQuality.mappingCoverage
        === gate.mappingCoverageRequired
      && Math.abs(
        privateManifest.dataQuality.amountConservationDifference
      ) <= gate.amountConservationTolerance
    ),
    noImmatureZeroImputation:
      privateManifest.dataQuality.unmaturedLabelZeroImputationCount === 0,
    primaryAbsoluteWape:
      point.wape <= gate.maximumPrimaryWape,
    primaryAbsoluteBias:
      Math.abs(point.signedBias) <= gate.maximumPrimaryAbsoluteBias,
    relativeImprovementToManual:
      relativeManual <= -gate.minimumRelativeImprovementToManual,
    relativeImprovementToV03OnExactOverlap: (
      oldMetrics.caseCount > 0
      && newMetrics.caseCount === oldMetrics.caseCount
      && v03Delta <= -gate.minimumRelativeImprovementToV03OnOverlap
    ),
    majorSegmentBias:
      Math.max(...segmentBias) <= gate.maximumMajorSegmentAbsoluteBias,
    central80Coverage: (
      coverage80 !== null
      && coverage80 >= gate.minimumCentral80Coverage
      && coverage80 <= gate.maximumCentral80Coverage
    ),
    eachRawCandidateLayerFvaNonnegative:
      rawCandidateLayerFvaGate(
        primaryResult.metrics,
        gate.minimumLayerFva
      ),
    strictAuxiliaryTimeBlocksReported: (
      auxiliaryResult.timeBlockAudit.independentTimeBlockCount > 0
      && auxiliaryResult.timeBlockAudit
        .caseCountCannotSubstituteForTimeBlockCount
    ),
    workClusterBootstrapRelativeManualUpperBelowZero:
      bootstrap.relativeWapeToManual95.upper < 0,
    independentLaterOrigin:
      privateManifest.independentLaterOriginOpened === true
  };
  const developmentChecks = Object.entries(checks)
    .filter(([id]) => id !== "independentLaterOrigin");
  const developmentPassed = developmentChecks.every(([, passed]) => passed);
  return {
    checks,
    developmentDecision: developmentPassed
      ? "HUMAN_ANCHORED_DEVELOPMENT_PASS"
      : "HUMAN_ANCHORED_DEVELOPMENT_FAIL",
    maturityDecision: (
      developmentPassed && checks.independentLaterOrigin
    )
      ? "M2_MATURE"
      : "M2_NOT_MATURE",
    promotionEligible: false,
    automationEligible: false,
    releaseEligible: false,
    blockReasons: [
      ...developmentChecks.filter(([, passed]) => !passed)
        .map(([id]) => `development_gate_failed:${id}`),
      ...(!checks.independentLaterOrigin
        ? ["independent_later_origin_not_opened"]
        : []),
      "final_holdout_sealed",
      "release_not_authorized"
    ]
  };
}

function buildPublicResult({
  config: value,
  manifest: privateManifest,
  primary: primaryResult,
  primaryBootstrap: bootstrap,
  strictAuxiliary: auxiliaryResult,
  v03Overlap: overlapResult,
  v03NewMetrics: newMetrics,
  v03Metrics: oldMetrics,
  relativeWapeToV03: v03Delta,
  gates: gateResult
}) {
  const primaryMetrics = publicMetrics(primaryResult.metrics);
  const auxiliaryMetrics = publicMetrics(auxiliaryResult.metrics);
  const overlapMetrics = publicMetrics(overlapResult.metrics);
  const primaryPoint = primaryMetrics.point.occurrenceAndReversal;
  const manualPoint = primaryMetrics.point.manualFaithful;
  return {
    schema: "m2.current.human_anchored.development_public.v0.1",
    generatedFromPrivateAggregateOnly: true,
    candidateId: value.candidateId,
    target: value.target,
    decision: gateResult,
    population: {
      authorityWorkCount: privateManifest.authorityWorkCount,
      modernWindowWorkWithFactCount:
        privateManifest.modernWindowWorkWithFactCount,
      modernWindowWorkWithFactShare:
        privateManifest.modernWindowWorkWithFactShare,
      modernWindowFactRowCount:
        privateManifest.modernWindowFactRowCount,
      primaryIndependentWorkCount:
        privateManifest.primary.independentWorkCount,
      primaryRepeatedCaseCount:
        privateManifest.primary.caseRowCount,
      auxiliaryIndependentWorkCount:
        privateManifest.auxiliary.independentWorkCount,
      auxiliaryRepeatedCaseCount:
        privateManifest.auxiliary.caseRowCount,
      fixed300BookSampleUsed: false
    },
    dataQuality: privateManifest.dataQuality,
    cashScope: {
      predictionTarget: "future_sales_share_cash",
      positiveAndReversalModeledSeparately: true,
      modernWindowNetSalesShareCash:
        privateManifest.modernWindowNetSalesShareCash,
      buyoutCashUsed: false,
      unmatured36MonthLabelZeroImputed: false
    },
    modelContract: {
      structuralAnchor:
        "manual_main_edge_channel_lifecycle_rule",
      learnedParameters: [
        "latest_to_average_floor",
        "edge_historical_share",
        "year3_lifecycle_share",
        "year5_lifecycle_share",
        "main_channel_maximum",
        "recent_level_blend"
      ],
      fixedExpertPriors: [
        "dominant_top_two_boundary",
        "platform_trend_weight",
        "dormant_historical_share",
        "dormant_annual_decay",
        "reversal_rate_maximum"
      ],
      constrainedExperts: value.experts,
      categoriesUsedForPrediction: false,
      currentStaticChannelAttributesUsed: true,
      channelAttributeEffectiveMonthProven: false,
      manualRuleFallbackRetained: true,
      fvaSemantics: {
        candidateFva:
          "before_fallback_and_used_by_layer_gate",
        selectedPipelineFva:
          "after_fallback_for_operational_output_only",
        adjacentCalendarOrigins:
          "one_time_evidence_block",
        caseCountCannotSubstituteForTimeBlockCount: true
      },
      shortHorizonUse:
        "auxiliary_validation_of_direction_not_36_month_maturity"
    },
    primary: {
      design:
        "2021_12_to_2022_12_h36_five_fold_cross_independent_work",
      caveat:
        "cross_work_development_not_strict_operational_later_origin",
      metrics: primaryMetrics,
      developmentLayerSelection:
        primaryResult.developmentLayerSelection,
      relativeWapeToManual:
        primaryPoint.wape / manualPoint.wape - 1,
      bootstrap,
      foldSelections: primaryResult.folds
    },
    strictAuxiliary: {
      design:
        "strict_as_of_rolling_h3_h6_h12_h18_h24",
      outerOriginStartsAt:
        value.dataContract.strictAuxiliaryEvaluationStartsAt,
      metrics: auxiliaryMetrics,
      selections: auxiliaryResult.selections,
      timeBlockAudit: auxiliaryResult.timeBlockAudit
    },
    v03ExactOverlap: {
      design: "same_case_cross_work_overlap_comparison",
      caseCount: oldMetrics.caseCount,
      newModel: newMetrics,
      v03: oldMetrics,
      relativeWapeToV03: v03Delta,
      modelLayerMetrics: overlapMetrics
    },
    temporalMaturity: {
      operationalAsOf36MonthEvaluationPossible:
        privateManifest.operationalAsOf36MonthEvaluationPossible,
      blockReason:
        privateManifest.operationalAsOf36MonthBlockReason,
      independentLaterOriginOpened: false,
      finalHoldoutOpened: false
    },
    literatureMap: value.literatureMap,
    boundaries: {
      privateRowsPublished: false,
      workIdentifiersPublished: false,
      channelIdentifiersPublished: false,
      providerUsed: false,
      databaseRead: false,
      finalHoldoutOpened: false,
      canaryAuthorized: false,
      releaseAuthorized: false,
      codeMergeDoesNotEqualModelRelease: true
    }
  };
}

function publicMetrics(metrics) {
  return {
    point: metrics.point,
    candidatePoint: metrics.candidatePoint,
    fullyRawPoint: metrics.fullyRawPoint,
    candidateFva: metrics.candidateFva,
    selectedPipelineFva: metrics.selectedPipelineFva,
    fva: metrics.fva,
    probabilistic: metrics.probabilistic,
    byOrigin: metrics.byOrigin,
    byHorizon: metrics.byHorizon,
    bySegment: metrics.bySegment,
    byRevenueMode: metrics.byRevenueMode,
    secondLevelCategoryAggregate: {
      groupCount: Object.keys(metrics.bySecondLevelCategory).length,
      maximumWape: Math.max(...Object.values(
        metrics.bySecondLevelCategory
      ).map((value) => value.wape)),
      maximumAbsoluteBias: Math.max(...Object.values(
        metrics.bySecondLevelCategory
      ).map((value) => Math.abs(value.signedBias)))
    }
  };
}

function compactEvaluationRow(row, evaluationFamily) {
  return {
    evaluationFamily,
    standardWorkId: row.standardWorkId,
    origin: row.origin,
    horizonMonths: row.horizonMonths,
    labelAvailableAsOf: row.labelAvailableAsOf,
    segment: row.segment,
    dominantRevenueMode: row.dominantRevenueMode,
    actualPositive: row.actualPositive,
    actualReversal: row.actualReversal,
    actual: row.actual,
    manualPointEstimate: row.manualPointEstimate,
    learnedGlobalPointEstimate: row.learnedGlobalPointEstimate,
    rawHierarchicalPointEstimate: row.rawHierarchicalPointEstimate,
    preGlobalHierarchicalPointEstimate:
      row.preGlobalHierarchicalPointEstimate ?? null,
    hierarchicalPointEstimate: row.hierarchicalPointEstimate,
    fullyRawOccurrenceReversalPointEstimate:
      row.fullyRawOccurrenceReversalPointEstimate,
    preGlobalOccurrenceReversalPointEstimate:
      row.preGlobalOccurrenceReversalPointEstimate ?? null,
    candidateOccurrenceReversalPointEstimate:
      row.candidateOccurrenceReversalPointEstimate,
    occurrenceReversalPointEstimate:
      row.occurrenceReversalPointEstimate,
    pointEstimate: row.pointEstimate,
    occurrenceProbability: row.occurrenceProbability,
    reversalRate: row.reversalRate,
    quantiles: row.quantiles,
    v03PointEstimate: row.v03PointEstimate,
    evaluationFold: row.evaluationFold ?? null,
    outerOrigin: row.outerOrigin ?? null,
    maximumTrainingLabelAvailableAsOf:
      row.maximumTrainingLabelAvailableAsOf ?? null,
    sameOrLaterOuterTruthRead:
      row.sameOrLaterOuterTruthRead ?? false,
    trainingReadOwnWork: row.trainingReadOwnWork ?? null
  };
}

function renderReport(result) {
  const primary = result.primary.metrics.point.occurrenceAndReversal;
  const manual = result.primary.metrics.point.manualFaithful;
  const auxiliary =
    result.strictAuxiliary.metrics.point.occurrenceAndReversal;
  const coverage = result.primary.metrics.probabilistic.intervalCoverage;
  const checks = Object.entries(result.decision.checks).map(
    ([id, passed]) => `| ${id} | ${passed ? "通过" : "未通过"} |`
  ).join("\n");
  const selectedFvaByTransition = new Map(
    result.primary.metrics.selectedPipelineFva.map(
      (row) => [`${row.from}->${row.to}`, row]
    )
  );
  const fva = result.primary.metrics.candidateFva.map((row) => {
    const selected = selectedFvaByTransition.get(`${row.from}->${row.to}`);
    return `| ${row.from} → ${row.to} | `
      + `${number(row.valueAdded)} | ${percent(-row.relativeWapeChange)} | `
      + `${number(selected.valueAdded)} |`;
  }).join("\n");
  return `# M2 人工锚定层级概率模型开发回测 v0.1

## 结论

本轮已经把人工主力/边缘渠道算法改造成唯一结构主干，并从全部 ${
  result.population.authorityWorkCount
} 部权威作品建立人口账本。2021—2025 年存在分成流水的作品为 ${
  result.population.modernWindowWorkWithFactCount
} 部；36 个月成熟开发集覆盖 ${
  result.population.primaryIndependentWorkCount
} 部独立作品和 ${
  result.population.primaryRepeatedCaseCount
} 个作品×起点案例，没有固定抽取 300 本，也没有把重复案例冒充独立样本。

当前开发判定为 **${result.decision.developmentDecision}**，成熟度判定为
**${result.decision.maturityDecision}**。无论开发门禁是否通过，2021—2025
窗口内都没有可用于独立 later-origin 的 36 个月标签，因此本结果不能发布、
不能自动化，也不能表述为成熟 M2。

## 主要结果

| 口径 | WAPE | 偏差 |
|---|---:|---:|
| 人工规则原样回放 | ${number(manual.wape)} | ${number(manual.signedBias)} |
| 人工锚定模型（36个月、跨作品） | ${number(primary.wape)} | ${number(primary.signedBias)} |
| 严格 as-of 短周期辅助回测 | ${number(auxiliary.wape)} | ${number(auxiliary.signedBias)} |
| v0.3 精确重叠案例 | ${number(result.v03ExactOverlap.v03.wape)} | ${number(result.v03ExactOverlap.v03.signedBias)} |
| 新模型精确重叠案例 | ${number(result.v03ExactOverlap.newModel.wape)} | ${number(result.v03ExactOverlap.newModel.signedBias)} |

相对人工规则的 36 个月 WAPE 变化为 ${
  percent(result.primary.relativeWapeToManual)
}；相对 v0.3 精确重叠案例的 WAPE 变化为 ${
  percent(result.v03ExactOverlap.relativeWapeToV03)
}。按独立作品聚类 bootstrap 的相对人工规则 95% 区间为 [${
  percent(result.primary.bootstrap.relativeWapeToManual95.lower)
}, ${percent(result.primary.bootstrap.relativeWapeToManual95.upper)}]。
中央 80% 区间覆盖率为 ${
  percent(coverage.central_80?.observed ?? NaN)
}。

全体作品外 development 层选择中，层级专家接受状态为
\`${result.primary.developmentLayerSelection.hierarchyAccepted}\`，发生/冲销层接受状态为
\`${result.primary.developmentLayerSelection.occurrenceReversalAccepted}\`。未通过的原始层会
回退上一层；candidate FVA 保留回退前的真实增量，selected pipeline FVA 只反映
安全回退后的最终输出。

## 逐层 FVA

| 层级 | candidate WAPE 绝对改善 | candidate WAPE 相对改善 | selected pipeline WAPE 绝对改善 |
|---|---:|---:|---:|
${fva}

模型层级固定为：人工原式 → 可学习人工参数 → 四个受约束专家 →
发生概率与冲销 → 分位数/区间。门禁使用回退前的 candidate FVA，不再用
回退后必然非负的 selected pipeline FVA 代替层级证据。

## 数据与时序边界

- 现金目标只有未来分成收入；买断现金未进入历史特征、标签或指标。
- 正向收入与负数冲销分别建账，最终满足“正向－冲销＝分成净现金”。
- 现金金额只使用 2021-01 至 2025-12；2023—2025 只在对应短周期标签已成熟时使用。
- 36 个月主评估是五折按作品分组的开发回测，不是 later-origin 时序验证。
- 短周期辅助回测的每个 outer origin 只读取当时已经成熟的更早标签。
- 渠道统一关系和类型来自人工表，但生效年月覆盖仍为 0%，所以它们只能支持
  当前 development；三级分类只作分层报告，不参与预测。
- private 行、作品 ID 和渠道 ID 未公开；provider、数据库、final holdout、
  Canary、release 和 M3 formal 均未打开。

## 门禁

| 门禁 | 状态 |
|---|---|
${checks}

独立 later-origin 是成熟度的硬门禁。代码合入 main 只表示实现和公共可复现边界
完成，不等于模型发布。
`;
}

function parseNdjson(value) {
  return value.split(/\r?\n/u).filter(Boolean).map(JSON.parse);
}

function digest(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function number(value) {
  return Number(value).toFixed(6);
}

function percent(value) {
  return Number.isFinite(Number(value))
    ? `${(Number(value) * 100).toFixed(2)}%`
    : "不适用";
}
