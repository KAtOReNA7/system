import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile
} from "node:fs/promises";
import path from "node:path";

import {
  buildM2ChannelGenerativeForecastabilityDiagnostic,
  buildM2ChannelGenerativeSyntheticDiagnostic,
  crossFitM2ChannelGenerative,
  expandM2ChannelGenerativePackedRows,
  scoreM2ChannelGenerativePredictions,
  strictRollingM2ChannelGenerative,
  verifyM2ChannelGenerativeG0
} from "../../src/domain/m2Current/channelGenerative.js";

const CONFIG_PATH = "config/m2-current-channel-generative.v0.2.json";
const FROZEN_CONFIG_PATH = "config/m2-current-channel-experts.v0.1.json";
const PREREGISTRATION_PATH =
  "docs/analysis/m2-current/"
  + "M2-current-channel-generative-v0.2-preregistration.json";

export async function runM2ChannelGenerativePublicDiagnostic({
  root,
  verify
}) {
  const config = await readJson(path.join(root, CONFIG_PATH));
  assertBoundary(config);
  const fixture = await readJson(path.join(root, config.syntheticFixture));
  const result = buildM2ChannelGenerativeSyntheticDiagnostic(fixture, config);
  const outputPath = path.join(root, config.publicDiagnosticOutput);
  const text = JSON.stringify(result, null, 2) + "\n";
  if (verify) {
    if (await readFile(outputPath, "utf8") !== text) {
      throw new Error("m2_channel_generative_public_diagnostic_drift");
    }
    process.stdout.write(
      "M2 channel generative public diagnostic verified.\n"
    );
    return result;
  }
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, text, "utf8");
  process.stdout.write(
    "M2 channel generative public diagnostic written.\n"
  );
  return result;
}

export async function prepareM2ChannelGenerativeRunReceipt({
  root,
  privateDirectory,
  implementationCommit,
  command,
  environment
}) {
  const [configText, preregistrationText, amendmentText, sourceText,
    baseManifestText, frozenManifestText] = await Promise.all([
    readFile(path.join(root, CONFIG_PATH), "utf8"),
    readFile(path.join(root, PREREGISTRATION_PATH), "utf8"),
    readFile(
      path.join(
        root,
        "docs/analysis/m2-current/"
          + "M2-current-channel-generative-v0.2-"
          + "interpretation-amendment-v0.1.json"
      ),
      "utf8"
    ),
    readFile(
      path.join(root, "src/domain/m2Current/channelGenerative.js"),
      "utf8"
    ),
    readFile(
      path.join(
        privateDirectory,
        "M2-current-human-anchored-manifest-private-v0.1.json"
      ),
      "utf8"
    ),
    readFile(
      path.join(
        privateDirectory,
        "M2-current-channel-experts-evaluation-manifest-private-v0.1.json"
      ),
      "utf8"
    )
  ]);
  const config = JSON.parse(configText);
  const baseManifest = JSON.parse(baseManifestText);
  const frozenManifest = JSON.parse(frozenManifestText);
  assertBoundary(config);
  const receipt = {
    schema: "m2.current.channel_generative_run_receipt_private.v0.2",
    tracked: false,
    status: "PREPARED_BEFORE_PRIVATE_EVALUATION_ROW_READ",
    implementationCommit,
    codeSha256: digest(sourceText),
    preregistrationSha256: digest(preregistrationText),
    interpretationAmendmentSha256: digest(amendmentText),
    configSha256: digest(configText),
    datasetDigests: baseManifest.digests,
    frozenCaseDigest: frozenManifest.sha256,
    frozenEvaluationRowCount: frozenManifest.rowCount,
    bootstrapSeed: config.evaluation.bootstrapSeed,
    command,
    environment,
    nodeVersion: process.version,
    startTime: new Date().toISOString(),
    expectedCandidateIds: ["G0", "G1", "G2", "G3"],
    expectedPrimaryOuterFolds:
      config.selection.outerPrimaryWorkFoldCount,
    expectedStrictOuterOrigins: config.selection.strictOrigins,
    expectedParameterGridCount:
      config.grid.configurationCountPerRawCandidate,
    G4Expected: false,
    G5Expected: false,
    G6Expected: false,
    candidateOutcomeReadAtReceipt: false
  };
  await mkdir(privateDirectory, { recursive: true });
  const receiptPath = path.join(
    privateDirectory,
    config.privateOutputs.runReceipt
  );
  await writeFile(
    receiptPath,
    JSON.stringify(receipt, null, 2) + "\n",
    "utf8"
  );
  return receipt;
}

export async function runM2ChannelGenerativePrivateDevelopment({
  root,
  privateDirectory,
  baseManifest
}) {
  const [config, frozenConfig, preregistration, frozenPublic] =
    await Promise.all([
      readJson(path.join(root, CONFIG_PATH)),
      readJson(path.join(root, FROZEN_CONFIG_PATH)),
      readJson(path.join(root, PREREGISTRATION_PATH)),
      readJson(path.join(root, frozenConfigPublicPath()))
    ]);
  assertBoundary(config);
  const receipt = await readJson(path.join(
    privateDirectory,
    config.privateOutputs.runReceipt
  ));
  if (
    receipt?.status
      !== "PREPARED_BEFORE_PRIVATE_EVALUATION_ROW_READ"
    || receipt?.implementationCommit === undefined
    || receipt?.candidateOutcomeReadAtReceipt !== false
  ) {
    throw new Error("m2_channel_generative_run_receipt_invalid");
  }
  const [primaryText, auxiliaryText, materializationText,
    frozenText, frozenManifestText] = await Promise.all([
    readFile(path.join(
      privateDirectory,
      config.privateOutputs.primaryMonthlyCases
    ), "utf8"),
    readFile(path.join(
      privateDirectory,
      config.privateOutputs.auxiliaryMonthlyCases
    ), "utf8"),
    readFile(path.join(
      privateDirectory,
      config.privateOutputs.materializationManifest
    ), "utf8"),
    readFile(path.join(
      privateDirectory,
      frozenConfig.privateOutputs.evaluation
    ), "utf8"),
    readFile(path.join(
      privateDirectory,
      frozenConfig.privateOutputs.evaluationManifest
    ), "utf8")
  ]);
  const materialization = JSON.parse(materializationText);
  const frozenManifest = JSON.parse(frozenManifestText);
  verifyPrivateBindings({
    config,
    preregistration,
    baseManifest,
    materialization,
    frozenManifest,
    primaryText,
    auxiliaryText,
    frozenText
  });
  const frozenRows = parseNdjson(frozenText);
  const expected = {
    primary: frozenPublic.evaluation.primary.ablations.A0,
    strict: frozenPublic.evaluation.strictRolling.ablations.A0
  };
  const G0 = verifyM2ChannelGenerativeG0(
    frozenRows,
    { expected }
  );
  const primaryRows = expandM2ChannelGenerativePackedRows(
    parseNdjson(primaryText),
    { frozenRows: frozenRows.filter(
      (row) => row.evaluationFamily === "primary"
    ) }
  );
  const strictRows = expandM2ChannelGenerativePackedRows(
    parseNdjson(auxiliaryText),
    { frozenRows: frozenRows.filter(
      (row) => row.evaluationFamily === "strict_rolling"
    ) }
  );
  const primary = crossFitM2ChannelGenerative(primaryRows, config);
  const strict = strictRollingM2ChannelGenerative(strictRows, config);
  const baselines = {
    primary: scoreG0(primary.rows, config),
    strict: scoreG0(strict.rows, config)
  };
  const bootstrap = {};
  for (const candidateId of ["G1", "G2", "G3"]) {
    bootstrap[candidateId] = {
      primary: pairedBootstrap(
        baselines.primary.cases,
        primary.evaluations[candidateId].cases,
        config
      ),
      strict: pairedBootstrap(
        baselines.strict.cases,
        strict.evaluations[candidateId].cases,
        config
      )
    };
  }
  const gateMatrix = evaluateCoreGates({
    config,
    baselines,
    primary,
    strict,
    bootstrap
  });
  const candidatePredictions = {
    primary: {
      G1: primary.predictions.G1,
      G2: primary.predictions.G2
    },
    strict: {
      G1: strict.predictions.G1,
      G2: strict.predictions.G2
    }
  };
  const forecastability = {
    primary: buildM2ChannelGenerativeForecastabilityDiagnostic(
      primary.rows,
      candidatePredictions.primary,
      config
    ),
    strict: buildM2ChannelGenerativeForecastabilityDiagnostic(
      strict.rows,
      candidatePredictions.strict,
      config
    )
  };
  const result = buildPublicResult({
    config,
    preregistration,
    baseManifest,
    materialization,
    frozenManifest,
    G0,
    baselines,
    primary,
    strict,
    bootstrap,
    gateMatrix,
    forecastability,
    receipt
  });
  const privateRows = privateEvaluationRows(primary, strict);
  const privateText = privateRows.map(JSON.stringify).join("\n") + "\n";
  const privateManifest = {
    schema:
      "m2.current.channel_generative_evaluation_private_manifest.v0.2",
    tracked: false,
    candidateId: config.candidateId,
    rowCount: privateRows.length,
    sha256: digest(privateText),
    primaryMonthlyRowCount: primary.rows.length,
    strictMonthlyRowCount: strict.rows.length,
    primaryPackedSha256: materialization.primarySha256,
    auxiliaryPackedSha256: materialization.auxiliarySha256,
    frozenEvaluationSha256: frozenManifest.sha256,
    rawCandidatesPreserved: ["G1", "G2"],
    blendDiagnosticPreserved: true,
    G4Executed: false,
    G5Executed: false,
    G6Executed: false,
    finalHoldoutOpened: false,
    productionModified: false,
    exactV03Modified: false,
    providerUsed: false,
    databaseRead: false
  };
  await Promise.all([
    writeFile(
      path.join(
        privateDirectory,
        config.privateOutputs.evaluationRows
      ),
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
    ),
    writeFile(
      path.join(root, config.publicDevelopmentOutput),
      JSON.stringify(result, null, 2) + "\n",
      "utf8"
    ),
    writeFile(
      path.join(root, config.publicDevelopmentReport),
      renderDevelopmentReport(result),
      "utf8"
    ),
    writeFile(
      path.join(root, config.publicForecastabilityOutput),
      JSON.stringify(publicForecastability(result), null, 2) + "\n",
      "utf8"
    ),
    writeFile(
      path.join(root, config.publicForecastabilityReport),
      renderForecastabilityReport(result),
      "utf8"
    )
  ]);
  await writeFile(
    path.join(
      privateDirectory,
      config.privateOutputs.runReceipt
    ),
    JSON.stringify({
      ...receipt,
      status: "COMPLETED",
      completedAt: new Date().toISOString(),
      outputRowCount: privateManifest.rowCount,
      outputSha256: privateManifest.sha256,
      finalStatus: result.finalStatus
    }, null, 2) + "\n",
    "utf8"
  );
  process.stdout.write(JSON.stringify({
    finalStatus: result.finalStatus,
    G0: result.evaluation.G0,
    G1: result.evaluation.G1,
    G2: result.evaluation.G2,
    G3: result.evaluation.G3,
    privateRowCount: privateManifest.rowCount,
    privateSha256: privateManifest.sha256
  }) + "\n");
  return result;
}

function scoreG0(rows, config) {
  const predictions = new Map(rows.map((row) => [
    monthlyKey(row),
    {
      candidateId: "G0",
      positivePoint: row.observedAtOrigin ? row.g0MonthlyPositive : 0,
      occurrenceProbability: null,
      conditionalPositiveAmount: row.g0MonthlyPositive,
      usedGenerator: false,
      fallbackReason: row.observedAtOrigin
        ? "frozen_G0"
        : "future_first_seen",
      candidateEligible: true
    }
  ]));
  return scoreM2ChannelGenerativePredictions(
    rows,
    predictions,
    config,
    { candidateId: "G0" }
  );
}

function buildPublicResult({
  config,
  preregistration,
  baseManifest,
  materialization,
  frozenManifest,
  G0,
  baselines,
  primary,
  strict,
  bootstrap,
  gateMatrix,
  forecastability,
  receipt
}) {
  const evaluation = {
    G0: publicCandidate(baselines.primary, baselines.strict, null),
    G1: publicCandidate(
      primary.evaluations.G1,
      strict.evaluations.G1,
      bootstrap.G1,
      baselines
    ),
    G2: publicCandidate(
      primary.evaluations.G2,
      strict.evaluations.G2,
      bootstrap.G2,
      baselines
    ),
    G3: publicCandidate(
      primary.evaluations.G3,
      strict.evaluations.G3,
      bootstrap.G3,
      baselines
    )
  };
  const g1 = gateMatrix.G1.allPassed;
  const g2 = gateMatrix.G2.allPassed;
  const finalStatus = g1 && g2
    ? "GENERATIVE_V02_BOTH_RAW_CORE_PASS"
    : g1
      ? "GENERATIVE_V02_G1_CORE_PASS"
      : g2
        ? "GENERATIVE_V02_G2_CORE_PASS"
        : gateMatrix.G3.allPassed
          ? "RAW_CORE_FAIL_BLEND_ONLY_SIGNAL"
          : "GENERATIVE_V02_CORE_FAIL";
  return {
    schema: "m2.current.channel_generative_core_development.v0.1",
    candidateId: config.candidateId,
    finalStatus,
    evidenceClass:
      "STRICTLY_CONTROLLED_REUSED_DEVELOPMENT_WINDOW_EVIDENCE",
    sourceBindings: {
      preregistrationSha256:
        config.preregistration.sha256,
      implementationCommit: receipt.implementationCommit,
      frozenEvaluationSha256: frozenManifest.sha256,
      baseDatasetDigests: baseManifest.digests
    },
    population: {
      primaryCaseCount: baselines.primary.workTotal.caseCount,
      strictCaseCount: baselines.strict.workTotal.caseCount,
      primaryMonthlyRowCount: primary.rows.length,
      strictMonthlyRowCount: strict.rows.length,
      materializedMonthlyLabelRowCount:
        materialization.monthlyLabelRowCount
    },
    G0SemanticEquivalence: G0,
    evaluation,
    gateMatrix,
    selection: {
      primaryOuterFolds: primary.receipts,
      strictOuterOrigins: strict.receipts,
      rawOutputsPreserved: ["G1", "G2"],
      G3TheoryEvidenceEligible: false,
      outerOutcomeUsedForSelection: false
    },
    forecastability,
    interpretation: {
      humanTrunkAnchorSupported:
        evaluation.G0.primary.wape
          <= Math.min(
            evaluation.G1.primary.wape,
            evaluation.G2.primary.wape
          ),
      workLevelAutomationSupported: false,
      causalBusinessMechanismProven: false,
      allowedFailureConclusion:
        "CURRENT_CASH_HISTORY_LOW_COMPLEXITY_GENERATIVE_CORE_NO_INCREMENTAL_VALUE",
      forecastingTheoreticallyImpossible: false
    },
    boundaries: {
      G4Executed: false,
      G5Executed: false,
      G6Executed: false,
      productionSurfaceChangeCount: 0,
      exactV03Modified: false,
      finalHoldoutOpened: false,
      providerUsed: false,
      databaseRead: false,
      safeToStartPlatform: false,
      safeToStartTaxonomy: false,
      safeToStartComposition: false,
      safeToStartImplementationOfAnyLaterLayer: false,
      productionUpgradeSupported: false,
      exactV03ReplacementSupported: false,
      releaseAuthorized: false
    },
    preregistrationGatesUnchanged:
      preregistration.gates.coreRawPass.conditions
        .primaryRelativeWape.value === 0.01
  };
}

function publicCandidate(primary, strict, bootstrap = null, baselines = null) {
  return {
    primary: metricSummary(primary),
    strict: metricSummary(strict),
    relativeWape: baselines === null ? null : {
      primary: relativeWape(baselines.primary, primary),
      strict: relativeWape(baselines.strict, strict)
    },
    byHorizon: {
      primary: primary.byHorizon,
      strict: strict.byHorizon
    },
    byOrigin: {
      primary: primary.byOrigin,
      strict: strict.byOrigin
    },
    byMechanism: {
      primary: primary.byMechanism,
      strict: strict.byMechanism
    },
    topRevenue: {
      primary: primary.topRevenue,
      strict: strict.topRevenue
    },
    coverage: {
      primary: primary.coverage,
      strict: strict.coverage
    },
    bootstrap
  };
}

function metricSummary(value) {
  return {
    ...value.workTotal,
    workChannelWape: value.workChannel.wape,
    workChannelAbsoluteError: value.workChannel.absoluteError
  };
}

function evaluateCoreGates({
  config,
  baselines,
  primary,
  strict,
  bootstrap
}) {
  const result = {};
  for (const candidateId of ["G1", "G2", "G3"]) {
    const p = primary.evaluations[candidateId];
    const s = strict.evaluations[candidateId];
    const primaryRelative = relativeWape(baselines.primary, p);
    const strictRelative = relativeWape(baselines.strict, s);
    const strictBlocks = Object.keys(s.byOrigin).filter((origin) => (
      relativeMetric(
        baselines.strict.byOrigin[origin]?.wape,
        s.byOrigin[origin]?.wape
      ) > 0
    )).length;
    const horizonValues = [
      relativeMetric(
        baselines.primary.byHorizon["36"]?.wape,
        p.byHorizon["36"]?.wape
      ),
      ...["3", "6", "12", "18", "24"].map((horizon) => (
        relativeMetric(
          baselines.strict.byHorizon[horizon]?.wape,
          s.byHorizon[horizon]?.wape
        )
      ))
    ].filter(Number.isFinite);
    const checks = {
      rawResult: candidateId !== "G3",
      primaryRelativeWape: primaryRelative >= 0.01,
      strictRelativeWape: strictRelative >= 0.01,
      strictImprovedOriginBlocks: strictBlocks >= 6,
      improvedFrozenHorizonSlices:
        horizonValues.filter((value) => value > 0).length >= 4,
      eachHorizonSafety:
        horizonValues.every((value) => value >= -0.01),
      top10RelativeWape: bothTop(
        baselines,
        p,
        s,
        "0.1",
        0.01
      ),
      top1Safety: bothTop(baselines, p, s, "0.01", -0.01),
      top5Safety: bothTop(baselines, p, s, "0.05", -0.01),
      biasSafety:
        Math.abs(p.workTotal.signedBias)
          - Math.abs(baselines.primary.workTotal.signedBias) <= 0.01
        && Math.abs(s.workTotal.signedBias)
          - Math.abs(baselines.strict.workTotal.signedBias) <= 0.01,
      bootstrapSafety:
        bootstrap[candidateId].primary.lower95 >= -0.01
        && bootstrap[candidateId].strict.lower95 >= -0.01,
      coverage:
        p.coverage.generatorObservedChannelRowUsage >= 0.2
        && s.coverage.generatorObservedChannelRowUsage >= 0.2
        && p.coverage.generatorActualPositiveCashUsage >= 0.2
        && s.coverage.generatorActualPositiveCashUsage >= 0.2,
      mechanismSafety: mechanismSafety(
        baselines,
        p,
        s
      )
    };
    result[candidateId] = {
      checks,
      allPassed: candidateId === "G3"
        ? Object.entries(checks).filter(([key]) => key !== "rawResult")
          .every(([, value]) => value)
        : Object.values(checks).every(Boolean),
      primaryRelativeWape: primaryRelative,
      strictRelativeWape: strictRelative,
      strictImprovedOriginBlocks: strictBlocks,
      improvedHorizonSlices:
        horizonValues.filter((value) => value > 0).length,
      horizonRelativeImprovements: horizonValues
    };
  }
  return result;
}

function mechanismSafety(baselines, primary, strict) {
  const mechanisms = ["membership", "advertising", "transactional"];
  let safe = 0;
  for (const mechanism of mechanisms) {
    const p = relativeMetric(
      baselines.primary.byMechanism[mechanism]?.wape,
      primary.byMechanism[mechanism]?.wape
    );
    const s = relativeMetric(
      baselines.strict.byMechanism[mechanism]?.wape,
      strict.byMechanism[mechanism]?.wape
    );
    if (p >= -0.01 && s >= -0.01) safe += 1;
  }
  return safe >= 2;
}

function bothTop(baselines, primary, strict, fraction, threshold) {
  return relativeMetric(
    baselines.primary.topRevenue[fraction]?.wape,
    primary.topRevenue[fraction]?.wape
  ) >= threshold && relativeMetric(
    baselines.strict.topRevenue[fraction]?.wape,
    strict.topRevenue[fraction]?.wape
  ) >= threshold;
}

function pairedBootstrap(baselineCases, candidateCases, config) {
  const baseline = groupCasesByWork(baselineCases);
  const candidate = groupCasesByWork(candidateCases);
  const works = [...baseline.keys()].filter((work) => candidate.has(work))
    .sort();
  let state = Number(config.evaluation.bootstrapSeed) >>> 0;
  const values = [];
  for (let iteration = 0;
    iteration < Number(config.evaluation.bootstrapIterations);
    iteration += 1) {
    let baselineAe = 0;
    let candidateAe = 0;
    let denominator = 0;
    for (let index = 0; index < works.length; index += 1) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const work = works[Math.floor((state / 2 ** 32) * works.length)];
      const base = baseline.get(work);
      const challenger = candidate.get(work);
      baselineAe += base.absoluteError;
      candidateAe += challenger.absoluteError;
      denominator += base.denominator;
    }
    const baselineWape = denominator === 0 ? 0 : baselineAe / denominator;
    const candidateWape = denominator === 0 ? 0 : candidateAe / denominator;
    values.push(baselineWape === 0
      ? 0
      : (baselineWape - candidateWape) / baselineWape);
  }
  values.sort((left, right) => left - right);
  return {
    iterations: values.length,
    seed: Number(config.evaluation.bootstrapSeed),
    lower95: values[Math.floor(0.025 * (values.length - 1))],
    upper95: values[Math.floor(0.975 * (values.length - 1))]
  };
}

function groupCasesByWork(cases) {
  const output = new Map();
  for (const row of cases) {
    const value = output.get(row.standardWorkId) ?? {
      absoluteError: 0,
      denominator: 0
    };
    value.absoluteError += Math.abs(row.pointEstimate - row.actual);
    value.denominator += Math.abs(row.actual);
    output.set(row.standardWorkId, value);
  }
  return output;
}

function privateEvaluationRows(primary, strict) {
  const output = [];
  for (const [family, result] of [
    ["primary", primary],
    ["strict", strict]
  ]) {
    for (const candidateId of ["G1", "G2", "G3"]) {
      for (const row of result.evaluations[candidateId].cases) {
        output.push({
          schema:
            "m2.current.channel_generative_evaluation_private_row.v0.2",
          tracked: false,
          evaluationFamily: family,
          candidateId,
          standardWorkId: row.standardWorkId,
          origin: row.origin,
          horizonMonths: row.horizonMonths,
          actualPositive: row.actualPositive,
          actualReversal: row.actualReversal,
          actual: row.actual,
          positivePoint: row.positivePoint,
          pointEstimate: row.pointEstimate,
          G4Executed: false,
          G5Executed: false,
          G6Executed: false
        });
      }
    }
  }
  return output;
}

function publicForecastability(result) {
  return {
    schema:
      "m2.current.channel_generative_forecastability_public.v0.1",
    finalStatus: result.finalStatus,
    primary: result.forecastability.primary,
    strict: result.forecastability.strict,
    diagnosticOnly: true,
    participatesInTraining: false,
    participatesInSelection: false,
    participatesInGate: false,
    deployable: false,
    canAuthorizeG4G5G6: false,
    allowedClaims: [
      "observed structural unreachable mass",
      "retrospective oracle gap",
      "current model-family residual gap",
      "missing historically available drivers"
    ],
    forbiddenClaims: [
      "proven irreducible error",
      "Bayes error measured",
      "theoretical maximum established",
      "forecasting impossible"
    ]
  };
}

function renderDevelopmentReport(result) {
  return `# M2 Channel Generative v0.2 core development

## 结论

本轮严格执行 G0、raw G1、raw G2 与不参与理论判定的 G3；最终状态为
\`${result.finalStatus}\`。这是重复使用 development window 的受控证据，不是独立
later-origin，也不构成 production、exact v0.3 替换或 release 授权。

## 核心结果

| 候选 | Primary WAPE | 相对 G0 | Strict WAPE | 相对 G0 |
|---|---:|---:|---:|---:|
${["G0", "G1", "G2", "G3"].map((id) => {
    const value = result.evaluation[id];
    return `| ${id} | ${number(value.primary.wape)} | ${
      percent(value.relativeWape?.primary)
    } | ${number(value.strict.wape)} | ${
      percent(value.relativeWape?.strict)
    } |`;
  }).join("\n")}

G0 semantic-equivalence：\`${
  result.G0SemanticEquivalence.status
}\`。G1/G2 raw 结果均已保留；G3 没有覆盖 raw 输出，也不作为 G4 parent。

## 边界

G4、G5、G6 均未执行。production surface change count 为 0；exact v0.3、
holdout、provider、database、Canary 与 release 均未打开。无论 core 结果如何，
\`safeToStartImplementationOfAnyLaterLayer=false\`，等待用户另行决定。
`;
}

function renderForecastabilityReport(result) {
  const primary = result.forecastability.primary;
  const strict = result.forecastability.strict;
  return `# M2 Channel Generative v0.2 forecastability diagnostic

## 诊断边界

该 retrospective oracle 诊断在候选输出冻结后执行，不参与训练、inner/outer
selection、gate 或 routing，也不能授权 G4–G6。它只描述当前零新渠道进入边界下的
结构性不可达正现金、oracle gap 与当前模型族剩余 gap；没有测得 Bayes error，
没有证明理论 ceiling，也没有证明预测不可能。

## 当前可达范围

| 口径 | 全部实际正现金 | future-first-seen 正现金 | 占比 |
|---|---:|---:|---:|
| Primary | ${number(primary.currentReachability.totalActualPositiveCash)} | ${
  number(primary.currentReachability.futureFirstSeenActualPositiveCash)
} | ${percent(primary.currentReachability.futureFirstSeenShare)} |
| Strict | ${number(strict.currentReachability.totalActualPositiveCash)} | ${
  number(strict.currentReachability.futureFirstSeenActualPositiveCash)
} | ${percent(strict.currentReachability.futureFirstSeenShare)} |

ORACLE_OCCURRENCE 只表示“若月度 occurrence 已完美知晓”的回顾性上界，不可部署，
也不参与 core pass。
`;
}

function verifyPrivateBindings({
  config,
  preregistration,
  baseManifest,
  materialization,
  frozenManifest,
  primaryText,
  auxiliaryText,
  frozenText
}) {
  if (
    materialization?.schema
      !== "m2.current.channel_generative_materialization_private.v0.2"
    || materialization.candidateId !== config.candidateId
    || materialization.primarySha256 !== digest(primaryText)
    || materialization.auxiliarySha256 !== digest(auxiliaryText)
    || frozenManifest.sha256 !== digest(frozenText)
    || frozenManifest.sha256
      !== preregistration.caseManifest.digests.frozenEvaluationSha256
    || frozenManifest.rowCount
      !== preregistration.caseManifest.digests.frozenEvaluationRowCount
    || baseManifest.digests.primaryCasesSha256
      !== preregistration.caseManifest.digests.basePrimaryCasesSha256
    || baseManifest.digests.auxiliaryCasesSha256
      !== preregistration.caseManifest.digests.baseAuxiliaryCasesSha256
    || baseManifest.digests.historiesSha256
      !== preregistration.caseManifest.digests.baseHistoriesSha256
    || materialization.dataQuality.overlappingHorizonDuplicateCount !== 0
    || materialization.dataQuality.unmaturedLabelZeroImputationCount !== 0
    || materialization.dataQuality.buyoutCashUsed !== false
    || frozenManifest.G4Executed === true
    || frozenManifest.G5Executed === true
    || frozenManifest.G6Executed === true
  ) {
    throw new Error("m2_channel_generative_private_binding_invalid");
  }
}

function assertBoundary(config) {
  if (
    config?.schema !== "m2.current.channel_generative_core.v0.2"
    || config?.authorization?.coreImplementation !== true
    || config?.authorization?.oneTimePrivateDevelopmentEvaluation !== true
    || config?.authorization?.G4Platform !== false
    || config?.authorization?.G5Taxonomy !== false
    || config?.authorization?.G6Composition !== false
    || config?.authorization?.newModelFamily !== false
    || config?.authorization?.outcomeDrivenTuning !== false
    || config?.authorization?.finalHoldout !== false
    || config?.authorization?.production !== false
    || config?.authorization?.exactV03Replacement !== false
    || config?.authorization?.release !== false
    || config?.candidateIds?.join(",") !== "G0,G1,G2,G3"
  ) {
    throw new Error("m2_channel_generative_authorization_boundary_differs");
  }
}

function frozenConfigPublicPath() {
  return "docs/analysis/m2-current/"
    + "M2-current-channel-experts-development-v0.1.json";
}

function parseNdjson(value) {
  return value.split(/\r?\n/u).filter(Boolean).map(JSON.parse);
}

function monthlyKey(row) {
  return `${row.standardWorkId}\u001f${row.channelUid}\u001f${row.origin}`
    + `\u001f${row.futureMonthIndex}`;
}

function relativeWape(baseline, candidate) {
  return relativeMetric(
    baseline.workTotal.wape,
    candidate.workTotal.wape
  );
}

function relativeMetric(baseline, candidate) {
  return Number.isFinite(Number(baseline))
      && Number.isFinite(Number(candidate))
      && Number(baseline) !== 0
    ? (Number(baseline) - Number(candidate)) / Number(baseline)
    : Number.NaN;
}

function digest(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function number(value) {
  return Number(value).toFixed(8);
}

function percent(value) {
  return Number.isFinite(Number(value))
    ? `${(Number(value) * 100).toFixed(4)}%`
    : "不适用";
}
