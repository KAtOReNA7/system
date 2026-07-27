import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile
} from "node:fs/promises";
import path from "node:path";

import {
  buildM2ChannelExpertsSyntheticDiagnostic,
  crossFitM2ChannelExperts,
  M2_CHANNEL_EXPERT_ABLATIONS,
  scoreM2ChannelExpertRows,
  strictRollingM2ChannelExperts
} from "../../src/domain/m2Current/channelExperts.js";

const CONFIG_PATH = "config/m2-current-channel-experts.v0.1.json";

export async function runM2ChannelExpertsPublicDiagnostic({
  root,
  verify
}) {
  const { config, baseConfig } = await loadConfigs(root);
  assertBoundary(config);
  const fixture = JSON.parse(await readFile(
    path.join(root, config.syntheticFixture),
    "utf8"
  ));
  const result = buildM2ChannelExpertsSyntheticDiagnostic(
    fixture,
    baseConfig,
    config
  );
  const outputPath = path.join(root, config.publicDiagnosticOutput);
  const text = JSON.stringify(result, null, 2) + "\n";
  if (verify) {
    const current = await readFile(outputPath, "utf8");
    if (current !== text) {
      throw new Error("m2_channel_experts_public_diagnostic_drift");
    }
    process.stdout.write(
      "M2 channel experts public diagnostic verified.\n"
    );
    return result;
  }
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, text, "utf8");
  process.stdout.write(
    "M2 channel experts public diagnostic written.\n"
  );
  return result;
}

export async function runM2ChannelExpertsPrivateDevelopment({
  root,
  baseConfig,
  manifest,
  primaryCases,
  auxiliaryCases,
  privateDirectory
}) {
  const config = JSON.parse(await readFile(
    path.join(root, CONFIG_PATH),
    "utf8"
  ));
  assertBoundary(config);
  const supplements = await readSupplements(
    privateDirectory,
    config
  );
  assertDatasetBoundary(manifest, supplements.manifest, baseConfig, config);
  const primaryJoined = joinWorkChannelLabels(
    primaryCases,
    supplements.primary
  );
  const auxiliaryJoined = joinWorkChannelLabels(
    auxiliaryCases,
    supplements.auxiliary
  );

  const primary = crossFitM2ChannelExperts(
    primaryJoined,
    baseConfig,
    config
  );
  const strict = strictRollingM2ChannelExperts(
    auxiliaryJoined,
    baseConfig,
    config
  );
  const result = buildPublicResult({
    config,
    baseConfig,
    manifest,
    materialization: supplements.manifest,
    primary,
    strict
  });
  const privateRows = [
    ...privateEvaluationRows(primary.rows, "primary"),
    ...privateEvaluationRows(strict.rows, "strict_rolling")
  ];
  const privateText = privateRows.map(
    (row) => JSON.stringify(row)
  ).join("\n") + "\n";
  const privateManifest = {
    schema: "m2.current.channel_expert_evaluation_private_manifest.v0.1",
    tracked: false,
    candidateId: config.candidateId,
    rowCount: privateRows.length,
    workEvaluationRowCount: privateRows.filter(
      (row) => row.rowKind === "work"
    ).length,
    channelEvaluationRowCount: privateRows.filter(
      (row) => row.rowKind === "work_channel"
    ).length,
    sha256: digest(privateText),
    sourceDatasetDigests: manifest.digests,
    supplementalPrimarySha256: supplements.manifest.primarySha256,
    supplementalAuxiliarySha256:
      supplements.manifest.auxiliarySha256,
    rawAblationsPreserved: [...M2_CHANNEL_EXPERT_ABLATIONS],
    exactV03UsedForSelection: false,
    independentLaterOriginOpened: false,
    finalHoldoutOpened: false,
    providerUsed: false,
    databaseRead: false,
    productionRouteModified: false,
    releaseAuthorized: false
  };

  await Promise.all([
    mkdir(path.dirname(path.join(root, config.publicOutput)), {
      recursive: true
    }),
    mkdir(privateDirectory, { recursive: true })
  ]);
  await Promise.all([
    writeFile(
      path.join(root, config.publicOutput),
      JSON.stringify(result, null, 2) + "\n",
      "utf8"
    ),
    writeFile(
      path.join(root, config.publicReport),
      renderM2ChannelExpertReport(result),
      "utf8"
    ),
    writeFile(
      path.join(privateDirectory, config.privateOutputs.evaluation),
      privateText,
      "utf8"
    ),
    writeFile(
      path.join(
        privateDirectory,
        config.privateOutputs.evaluationManifest
      ),
      JSON.stringify(privateManifest, null, 2) + "\n",
      "utf8"
    )
  ]);
  process.stdout.write(JSON.stringify({
    candidateId: config.candidateId,
    primaryA6: result.evaluation.primary.ablations.A6,
    strictA6: result.evaluation.strictRolling.ablations.A6,
    primaryRelativeWapeToA0:
      result.evaluation.primary.relativeWapeToA0.A6,
    strictRelativeWapeToA0:
      result.evaluation.strictRolling.relativeWapeToA0.A6,
    decision: result.decision
  }) + "\n");
  return result;
}

function buildPublicResult({
  config,
  baseConfig,
  manifest,
  materialization,
  primary,
  strict
}) {
  const primaryA0 = primary.metrics.ablations.A0;
  const primaryA6 = primary.metrics.ablations.A6;
  const strictA0 = strict.metrics.ablations.A0;
  const strictA6 = strict.metrics.ablations.A6;
  const primaryRelative = primaryA6.wape / primaryA0.wape - 1;
  const strictRelative = strictA6.wape / strictA0.wape - 1;
  const minimumImprovement = Number(
    config.evaluation.materialRelativeWapeImprovementMinimum
  );
  const checks = Object.freeze({
    workChannelConservation: (
      materialization.dataQuality
        .workChannelPositiveConservationDifference === 0
      && materialization.dataQuality
        .workChannelReversalConservationDifference === 0
      && materialization.dataQuality
        .workChannelNetConservationDifference === 0
    ),
    A0A1DecompositionConservation: (
      primary.metrics.decompositionMaximumAbsoluteDifference <= 1e-7
      && strict.metrics.decompositionMaximumAbsoluteDifference <= 1e-7
    ),
    primaryMaterialRelativeWape:
      primaryRelative <= -minimumImprovement,
    strictMaterialRelativeWape:
      strictRelative <= -minimumImprovement,
    primaryAbsoluteWape:
      primaryA6.wape <= Number(config.evaluation.maximumPrimaryWape),
    primaryAbsoluteBias:
      Math.abs(primaryA6.signedBias)
        <= Number(config.evaluation.maximumPrimaryAbsoluteBias),
    laterOriginIndependent: false
  });
  const rawDevelopmentPass = (
    checks.workChannelConservation
    && checks.A0A1DecompositionConservation
    && checks.primaryMaterialRelativeWape
    && checks.strictMaterialRelativeWape
    && checks.primaryAbsoluteWape
    && checks.primaryAbsoluteBias
  );
  const decision = rawDevelopmentPass
    ? "CHANNEL_EXPERT_DEVELOPMENT_PASS_NOT_MATURE_NOT_RELEASE"
    : "CHANNEL_EXPERT_DEVELOPMENT_FAIL_KEEP_LEARNEDGLOBAL_AND_EXACT_V0_3";
  return Object.freeze({
    schema: "m2.current.channel_expert_development.public.v0.1",
    candidateId: config.candidateId,
    status: "DEVELOPMENT_EXPERIMENT_ONLY",
    decision,
    maturityDecision: "M2_NOT_MATURE",
    objective:
      "improve_work_level_future_sales_share_cash_with_origin_available_static_channel_features",
    preregistration:
      "docs/analysis/m2-current/M2-current-channel-experts-preregistration-v0.1.json",
    dataset: Object.freeze({
      datasetVersion: config.datasetVersion,
      authority: "user_reviewed_sales_share_workbook_membership",
      featureAndLabelWindow: Object.freeze({
        startsAt: baseConfig.dataContract.featureAndLabelWindowStart,
        endsAt: baseConfig.dataContract.featureAndLabelWindowEnd
      }),
      authorityWorkCount: manifest.authorityWorkCount,
      workWithModernSalesShareFactCount:
        manifest.modernWindowWorkWithFactCount,
      modernSalesShareFactRowCount: manifest.modernWindowFactRowCount,
      primary: publicPopulation(manifest.primary),
      strictAuxiliary: publicPopulation(manifest.auxiliary),
      workChannelMaterialization: Object.freeze({
        primaryCaseRowCount: materialization.primaryCaseRowCount,
        auxiliaryCaseRowCount:
          materialization.auxiliaryCaseRowCount,
        workChannelLabelRowCount:
          materialization.workChannelLabelRowCount,
        predictionEligibleObservedChannelLabelCount:
          materialization
            .predictionEligibleObservedChannelLabelCount,
        futureFirstSeenLabelOnlyCount:
          materialization.futureFirstSeenLabelOnlyCount,
      configuredNamedPlatformCount:
          materialization.namedPlatformConfiguredCount,
        namedPlatformObservedLabelCounts:
          materialization.namedPlatformObservedLabelCounts,
        workChannelPositiveConservationDifference: 0,
        workChannelReversalConservationDifference: 0,
        workChannelNetConservationDifference: 0
      }),
      dataQuality: Object.freeze({
        mappingCoverage: manifest.dataQuality.mappingCoverage,
        amountConservationDifference:
          manifest.dataQuality.amountConservationDifference,
        unmaturedLabelZeroImputationCount:
          manifest.dataQuality.unmaturedLabelZeroImputationCount,
        futureFirstSeenIdentityUsedAsFeature: false,
        buyoutCashUsed: false,
        pre2021CashAmountUsed: false,
        post2025CashAmountUsed: false
      })
    }),
    featureSet: Object.freeze({
      featureVersion: config.featureVersion,
      canonicalChannelIdentity:
        "user_confirmed_static_development_only",
      monetizationMechanism:
        "user_confirmed_static_development_only",
      intrinsicWorkCategory: "development_only",
      categoryValuesPublished: false,
      futureFirstSeenChannelIdentityUsed: false,
      channelAttributeHistoricalEffectiveMonthClaimed: false
    }),
    model: Object.freeze({
      learnedGlobalContributionDecomposition:
        "exact_positive_forecast_conservation_by_observed_channel",
      mechanismExperts: config.mechanismExperts,
      namedPlatforms: config.platformModels.map((platform) => ({
        platformId: platform.platformId,
        displayName:
          platform.displayName ?? platform.canonicalChannelName,
        model: "platform_partial_pooling_with_sparse_fallback"
      })),
      platformTaxonomy: Object.freeze({
        node: config.platformTaxonomy.node,
        categoryValuesPublished: false
      }),
      hierarchy: Object.freeze({
        fallbackOrder: [
          "platform_x_mechanism_x_intrinsic_category",
          "platform_x_mechanism",
          "platform",
          "mechanism",
          "learnedGlobal"
        ],
        shrinkagePriorStrengthGrid:
          config.training.shrinkagePriorStrengthGrid,
        selection:
          "deterministic_inner_work_holdout_inside_each_outer_training_set"
      }),
      commonReversalLayer:
        "existing_human_anchored_reversal_layer_shared_by_A0_A6"
    }),
    ablations: Object.freeze(config.ablations),
    evaluation: Object.freeze({
      primary: primary.metrics,
      strictRolling: strict.metrics,
      strictRollingOrigins: strict.origins,
      outerFolds: primary.folds,
      coverageMatrix: Object.freeze({
        primary: coverageMatrix(primary.rows, config),
        strictRolling: coverageMatrix(strict.rows, config)
      }),
      topRevenueFractions: config.evaluation.topRevenueFractions,
      rawAblationsPreserved: [...M2_CHANNEL_EXPERT_ABLATIONS],
      selectedPipelineDoesNotReplaceRawMetrics: true
    }),
    comparison: Object.freeze({
      primary: Object.freeze({
        A0: primaryA0,
        A6: primaryA6,
        relativeWape: primaryRelative
      }),
      strictRolling: Object.freeze({
        A0: strictA0,
        A6: strictA6,
        relativeWape: strictRelative
      })
    }),
    gates: Object.freeze({
      checks,
      rawDevelopmentPass,
      independentLaterOriginRequiredForMaturity: true,
      independentLaterOriginAvailable: false
    }),
    implementation: Object.freeze({
      canonicalCore: "src/domain/m2Current/channelExperts.js",
      materializer:
        "existing materialize_human_anchored_cases.py --channel-experts mode",
      runner:
        "existing run_m2_human_anchored_development.mjs --channel-experts mode",
      productionLoaderImported: false,
      productionRouteImported: false,
      productionApiChanged: false,
      exactV03CodeChanged: false,
      exactV03UsedForTrainingOrSelection: false
    }),
    boundaries: Object.freeze({
      developmentOnly: true,
      currentDecision: "CANARY_FAIL",
      automationDecision: "AUTOMATION_BLOCKED",
      exactV03FallbackRetained: true,
      independentLaterOriginOpened: false,
      finalHoldoutOpened: false,
      providerAuthorized: false,
      databaseAuthorized: false,
      canaryAuthorized: false,
      releaseAuthorized: false,
      m3FormalAuthorized: false
    })
  });
}

function coverageMatrix(rows, config) {
  const channelRows = rows.flatMap((row) => row.channelRows)
    .filter((row) => row.observedAtOrigin);
  const platforms = config.platformModels.map(
    (platform) => String(platform.platformId)
  );
  const mechanisms = config.mechanismExperts.map(
    (expert) => String(expert.expertId)
  ).concat("learnedGlobal");
  const matrix = {};
  for (const platformId of platforms) {
    const mechanismRows = {};
    for (const mechanism of mechanisms) {
      const selected = channelRows.filter((row) => (
        row.platformId === platformId
        && row.mechanism === mechanism
      ));
      const fallbackCounts = {};
      for (const row of selected) {
        const key = String(row.fallback.A6);
        fallbackCounts[key] = (fallbackCounts[key] ?? 0) + 1;
      }
      mechanismRows[mechanism] = Object.freeze({
        channelCaseCount: selected.length,
        positiveActualCaseCount: selected.filter(
          (row) => row.actualPositive > 0
        ).length,
        fallbackCounts: Object.freeze(fallbackCounts)
      });
    }
    matrix[platformId] = Object.freeze(mechanismRows);
  }
  return Object.freeze(matrix);
}

function privateEvaluationRows(rows, family) {
  const output = [];
  for (const row of rows) {
    output.push({
      schema: "m2.current.channel_expert_evaluation_private_row.v0.1",
      tracked: false,
      rowKind: "work",
      evaluationFamily: family,
      standardWorkId: row.standardWorkId,
      origin: row.origin,
      horizonMonths: row.horizonMonths,
      labelAvailableAsOf: row.labelAvailableAsOf,
      actualPositive: row.actualPositive,
      actualReversal: row.actualReversal,
      actual: row.actual,
      ablationPositivePoints: row.ablationPositivePoints,
      ablationPoints: row.ablationPoints,
      reversalRate: row.reversalRate,
      selectedPriorStrength: row.selectedPriorStrength,
      evaluationFold: row.evaluationFold ?? null,
      outerOrigin: row.outerOrigin ?? null,
      sameOrLaterOuterTruthRead:
        row.sameOrLaterOuterTruthRead ?? false,
      unmaturedLabelZeroImputed: row.unmaturedLabelZeroImputed,
      buyoutCashUsed: row.buyoutCashUsed
    });
    for (const channel of row.channelRows) {
      output.push({
        schema: "m2.current.channel_expert_evaluation_private_row.v0.1",
        tracked: false,
        rowKind: "work_channel",
        evaluationFamily: family,
        standardWorkId: row.standardWorkId,
        origin: row.origin,
        horizonMonths: row.horizonMonths,
        channelUid: channel.channelUid,
        platformId: channel.platformId,
        mechanism: channel.mechanism,
        intrinsicCategory: channel.category,
        observedAtOrigin: channel.observedAtOrigin,
        actualPositive: channel.actualPositive,
        actualReversal: channel.actualReversal,
        actual: channel.actual,
        ablationPositivePoints: channel.positivePoints,
        ablationPoints: channel.pointEstimates,
        fallback: channel.fallback
      });
    }
  }
  return output;
}

async function readSupplements(privateDirectory, config) {
  const outputs = config.privateOutputs;
  const [primaryText, auxiliaryText, manifestText] = await Promise.all([
    readFile(
      path.join(privateDirectory, outputs.primaryWorkChannelCases),
      "utf8"
    ),
    readFile(
      path.join(privateDirectory, outputs.auxiliaryWorkChannelCases),
      "utf8"
    ),
    readFile(
      path.join(privateDirectory, outputs.materializationManifest),
      "utf8"
    )
  ]);
  const manifest = JSON.parse(manifestText);
  if (
    manifest?.schema
      !== "m2.current.channel_expert_materialization_private.v0.1"
    || manifest.candidateId !== config.candidateId
    || manifest.primarySha256 !== digest(primaryText)
    || manifest.auxiliarySha256 !== digest(auxiliaryText)
  ) {
    throw new Error("m2_channel_expert_supplement_digest_invalid");
  }
  return {
    primary: parseNdjson(primaryText),
    auxiliary: parseNdjson(auxiliaryText),
    manifest
  };
}

function joinWorkChannelLabels(cases, supplementRows) {
  const supplements = new Map(supplementRows.map((row) => [
    caseKey(row.caseKey),
    row
  ]));
  if (supplements.size !== supplementRows.length) {
    throw new Error("m2_channel_expert_supplement_case_duplicate");
  }
  const joined = cases.map((row) => {
    const supplement = supplements.get(caseKey(row));
    if (!supplement) {
      throw new Error("m2_channel_expert_supplement_case_missing");
    }
    return {
      ...row,
      workChannelLabels: supplement.workChannelLabels
    };
  });
  if (joined.length !== supplements.size) {
    throw new Error("m2_channel_expert_supplement_case_count_differs");
  }
  return joined;
}

function caseKey(value) {
  return `${value.standardWorkId}\u001f${value.origin}`
    + `\u001f${Number(value.horizonMonths)}`;
}

function assertBoundary(config) {
  const authorization = config?.authorization;
  if (
    config?.schema !== "m2.current.channel_expert_development.v0.1"
    || config?.target !== "future_sales_share_cash"
    || authorization?.localPrivateDevelopmentTraining !== true
    || authorization?.boundedNestedSelection !== true
    || authorization?.canonicalChannelIdentityStaticFeature !== true
    || authorization
      ?.userConfirmedMonetizationMechanismStaticFeature !== true
    || authorization?.intrinsicWorkCategoryStaticFeature !== true
    || [
      "productionModelModification",
      "exactV03Replacement",
      "independentLaterOrigin",
      "finalHoldout",
      "provider",
      "database",
      "canary",
      "release",
      "m3Formal"
    ].some((key) => authorization?.[key] !== false)
    || config?.dataContract?.workChannelConservationRequired !== true
    || config?.dataContract?.buyoutCashUsed !== false
    || config?.ablations?.map((value) => value.id).join(",")
      !== M2_CHANNEL_EXPERT_ABLATIONS.join(",")
  ) {
    throw new Error("m2_channel_expert_authorization_boundary_invalid");
  }
}

function assertDatasetBoundary(
  manifest,
  materialization,
  baseConfig,
  config
) {
  if (
    manifest?.schema
      !== "m2.current.human_anchored.private_manifest.v0.1"
    || manifest.target !== "future_sales_share_cash"
    || manifest.dataQuality.mappingCoverage !== 1
    || manifest.dataQuality.amountConservationDifference !== 0
    || manifest.dataQuality.unmaturedLabelZeroImputationCount !== 0
    || manifest.dataQuality.buyoutCashUsed !== false
    || manifest.dataQuality.pre2021CashAmountUsed !== false
    || manifest.dataQuality.post2025CashAmountUsed !== false
    || manifest.independentLaterOriginOpened !== false
    || manifest.finalHoldoutOpened !== false
    || materialization.target !== "future_sales_share_cash"
    || materialization.dataQuality
      .workChannelPositiveConservationDifference !== 0
    || materialization.dataQuality
      .workChannelReversalConservationDifference !== 0
    || materialization.dataQuality
      .workChannelNetConservationDifference !== 0
    || materialization.dataQuality
      .futureFirstSeenIdentityUsedAsFeature !== false
    || materialization.dataQuality
      .unmaturedLabelZeroImputationCount !== 0
    || materialization.independentLaterOriginOpened !== false
    || materialization.finalHoldoutOpened !== false
    || materialization.providerUsed !== false
    || materialization.databaseRead !== false
    || baseConfig.dataContract.featureAndLabelWindowStart
      !== config.dataContract.featureAndLabelWindowStart
    || baseConfig.dataContract.featureAndLabelWindowEnd
      !== config.dataContract.featureAndLabelWindowEnd
  ) {
    throw new Error("m2_channel_expert_dataset_boundary_invalid");
  }
}

export function renderM2ChannelExpertReport(result) {
  const primary = result.evaluation.primary;
  const strict = result.evaluation.strictRolling;
  const rows = M2_CHANNEL_EXPERT_ABLATIONS.map((id) => (
    `| ${id} | ${result.ablations.find((item) => item.id === id).name}`
    + ` | ${number(primary.ablations[id].wape)}`
    + ` | ${number(primary.ablations[id].signedBias)}`
    + ` | ${percent(primary.relativeWapeToA0[id])}`
    + ` | ${number(strict.ablations[id].wape)}`
    + ` | ${number(strict.ablations[id].signedBias)}`
    + ` | ${percent(strict.relativeWapeToA0[id])} |`
  )).join("\n");
  const platformRows = Object.entries(
    result.evaluation.coverageMatrix.primary
  ).flatMap(([platform, mechanisms]) => (
    Object.entries(mechanisms).map(([mechanism, value]) => {
      const strictValue = result.evaluation.coverageMatrix
        .strictRolling[platform][mechanism];
      return (
        `| ${platform} | ${mechanism} | ${value.channelCaseCount}`
        + ` | ${strictValue.channelCaseCount}`
        + ` | ${JSON.stringify(value.fallbackCounts)}`
        + ` | ${JSON.stringify(strictValue.fallbackCounts)} |`
      );
    })
  )).join("\n");
  const topRows = Object.entries(primary.topRevenue).map(([key, value]) => {
    const strictValue = strict.topRevenue[key];
    return (
      `| top ${percent(value.fraction, 0)} | ${value.workCount}`
      + ` | ${number(value.ablations.A0.wape)}`
      + ` | ${number(value.ablations.A6.wape)}`
      + ` | ${percent(
        value.ablations.A6.wape / value.ablations.A0.wape - 1
      )}`
      + ` | ${strictValue.workCount}`
      + ` | ${number(strictValue.ablations.A0.wape)}`
      + ` | ${number(strictValue.ablations.A6.wape)}`
      + ` | ${percent(
        strictValue.ablations.A6.wape
          / strictValue.ablations.A0.wape - 1
      )} |`
    );
  }).join("\n");
  return `# M2 channel/mechanism hierarchical challenger v0.1

## 结论先行

本轮按预注册完成 work-channel 物化、learnedGlobal 逐渠道守恒分解、三类机制专家、
五个平台模型、平台专属作品分类 taxonomy、hierarchical shrinkage 和 A0–A6
全量评估。结论为 **${result.decision}**；完整成熟度仍为
**${result.maturityDecision}**，exact v0.3 fallback、CANARY_FAIL 和
AUTOMATION_BLOCKED 均未改变。

## 数据与防泄漏

- 作品级 primary case：${result.dataset.primary.caseRowCount}；
  strict 辅助 case：${result.dataset.strictAuxiliary.caseRowCount}。
- work-channel 标签：${result.dataset.workChannelMaterialization.workChannelLabelRowCount}；
  三项守恒差均为 0。
- ${result.dataset.workChannelMaterialization.futureFirstSeenLabelOnlyCount}
  个未来首次出现渠道标签只用于误差归因，预测为 0，渠道身份没有进入特征。
- 买断、2021 年前现金、2025 年后现金、未成熟标签补 0、later-origin、
  final holdout、provider 和数据库均未使用。

## A0–A6 完整结果

| Ablation | 定义 | primary WAPE | primary bias | 相对 A0 | strict WAPE | strict bias | 相对 A0 |
|---|---|---:|---:|---:|---:|---:|---:|
${rows}

A0 与 A1 的最大绝对差为
${primary.decompositionMaximumAbsoluteDifference}（strict 为
${strict.decompositionMaximumAbsoluteDifference}），证明 learnedGlobal 的渠道分解
与重组严格守恒。A6 的 shrinkage strength 只由每个 outer training 内的确定性
inner work holdout 选择；outer validation、exact v0.3 和 sealed 数据未参与。

## 五个平台 × 三类机制覆盖与回退

| 平台 | 机制 | primary channel case | strict channel case | primary A6 路由 | strict A6 路由 |
|---|---|---:|---:|---|---|
${platformRows}

细分类样本不足时按
taxonomy → platform×mechanism → platform → mechanism → learnedGlobal
自动回退，所有 A0–A6 仍继续运行；公开产物不包含作品分类值、作品 ID 或渠道 UID。

## Top-revenue

| 收入层 | primary 作品 | primary A0 | primary A6 | primary 相对 | strict 作品 | strict A0 | strict A6 | strict 相对 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
${topRows}

## 门禁

${Object.entries(result.gates.checks).map(
    ([key, value]) => `- ${key}: ${value ? "PASS" : "FAIL"}`
  ).join("\n")}

本报告只陈述 raw preregistered development 结果。即使某层回退或 A6 被选择，
A0–A6 原始指标仍全部保留；没有用 post-hoc fallback 覆盖失败候选。
`;
}

function publicPopulation(value) {
  return {
    caseRowCount: value.caseRowCount,
    independentWorkCount: value.independentWorkCount,
    originCount: value.originCount,
    originCounts: value.originCounts,
    horizonCounts: value.horizonCounts ?? null,
    positiveTargetCaseCount: value.positiveTargetCaseCount,
    reversalTargetCaseCount: value.reversalTargetCaseCount,
    evaluationDesign: value.evaluationDesign
  };
}

async function loadConfigs(root) {
  const config = JSON.parse(await readFile(
    path.join(root, CONFIG_PATH),
    "utf8"
  ));
  const baseConfig = JSON.parse(await readFile(
    path.join(root, config.baseConfig),
    "utf8"
  ));
  return { config, baseConfig };
}

function parseNdjson(text) {
  return text.split(/\r?\n/u).filter(Boolean).map(JSON.parse);
}

function digest(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function number(value) {
  return Number(value).toFixed(8);
}

function percent(value, digits = 2) {
  return `${(Number(value) * 100).toFixed(digits)}%`;
}
