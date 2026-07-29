import crypto from "node:crypto";
import fs from "node:fs";
import {
  mkdir,
  readFile,
  stat,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { spawnSync } from "node:child_process";

import {
  buildCoreLegacyOriginPopulation,
  buildCoreLegacyWorkCases,
  scoreCoreLegacyPointRows,
  validateM2CoreLegacyPopulationConfig
} from "../../src/domain/m2Current/coreLegacyPopulation.js";
import {
  forecastM2HumanAnchoredBase
} from "../../src/domain/m2Current/humanAnchored.js";
import {
  applyCoreRevenueLongTermForecast,
  buildCoreDirectKFallbackIndex,
  forecastCoreRevenueManual,
  monthToSerial,
  resolveCoreRevenueK
} from "../../src/domain/m2Current/coreRevenueManual.js";
import {
  materializeM2CoreRevenueAuthority
} from "./core_revenue_manual_private.mjs";

const CONFIG_PATH =
  "config/m2-current-core-legacy-population.v0.1.json";
const HUMAN_HISTORIES =
  "data/private-output/m2-current-human-anchored/"
  + "M2-current-human-anchored-histories-private-v0.1.ndjson";
const HUMAN_EVALUATION =
  "data/private-output/m2-current-human-anchored/"
  + "M2-current-human-anchored-evaluation-private-v0.1.ndjson";
const HUMAN_PUBLIC_EVALUATION =
  "docs/analysis/m2-current/"
  + "M2-current-human-anchored-development-v0.1.json";
const OCCURRENCE_AMOUNT_EVALUATION =
  "data/private-output/m2-current-quality/"
  + "M2-current-occurrence-amount-candidate-cases-private-v0.3.ndjson";

export async function runM2CoreLegacyPopulationK0Audit({ root }) {
  const config = await readJson(path.join(root, CONFIG_PATH));
  validateM2CoreLegacyPopulationConfig(config);
  const privateDirectory = path.join(
    root,
    config.privateOutputs.directory
  );
  await mkdir(privateDirectory, { recursive: true });
  const authority = await materializeM2CoreRevenueAuthority({ root });
  const histories = [];
  await forEachNdjson(path.join(root, HUMAN_HISTORIES), (row) => {
    histories.push(row);
  });
  const evaluations = [];
  await forEachNdjson(path.join(root, HUMAN_EVALUATION), (row) => {
    if (["primary", "strict_auxiliary"].includes(row.evaluationFamily)) {
      evaluations.push(row);
    }
  });
  const origins = [...new Set([
    ...histories.map((row) => row.origin),
    ...evaluations.map((row) => row.origin)
  ])].sort();
  const populations = new Map();
  for (const origin of origins) {
    const result = buildCoreLegacyOriginPopulation({
      origin,
      monthlyRows: authority.featureMonthlyRowsForOrigin(origin),
      minimumCompleteMonths: config.eligibility.minimumCompleteMonths,
      thresholds: config.coreSelection.thresholds,
      topCounts: config.coreSelection.topDiagnostics
    });
    populations.set(origin, result);
  }
  const assignments = buildAssignments(populations);
  const audit = buildTrainingAudit({
    config,
    authority,
    histories,
    evaluations,
    populations,
    assignments
  });
  const populationPath = path.join(
    privateDirectory,
    config.privateOutputs.populationRows
  );
  await writeNdjson(populationPath, buildPrivatePopulationRows(populations));
  const manifestPath = path.join(
    privateDirectory,
    config.privateOutputs.manifest
  );
  const receiptPath = path.join(
    privateDirectory,
    config.privateOutputs.receipt
  );
  const executionHead = git(root, ["rev-parse", "HEAD"]);
  await writeFile(manifestPath, `${JSON.stringify({
    schema: "m2.current.core_legacy_population.manifest.private.v0.1",
    status: "VALID_K0_AUDIT_COMPLETE",
    experimentId: config.experiment.stableExperimentId,
    actualDefinitionId: config.target.actualDefinitionId,
    executionHeadAtAudit: executionHead,
    sourceAuthority: {
      rowCount: authority.authority.rowCount,
      workCount: authority.authority.workCount,
      channelCount: authority.authority.channelCount,
      reversalRowCount: authority.authority.reversalRowCount
    },
    counts: {
      auditedOriginCount: origins.length,
      humanHistoryRowCount: histories.length,
      frozenEvaluationRowCount: evaluations.length,
      populationRowCount: [...populations.values()].reduce(
        (sum, item) => sum + item.eligiblePairs.length,
        0
      )
    },
    outputBindings: {
      populationRows: await fileBinding(populationPath)
    },
    privateIdentityPublished: false
  }, null, 2)}\n`, "utf8");
  await writeFile(receiptPath, `${JSON.stringify({
    schema: "m2.current.core_legacy_population.run_receipt.private.v0.1",
    stage: "K0_SCOPE_GOVERNANCE_AND_TRAINING_SEMANTICS_AUDIT",
    status: "VALID_K0_AUDIT_COMPLETE",
    executionHeadAtAudit: executionHead,
    command: "npm run prepare:m2:current:core-legacy-population",
    modelTrainingPerformed: false,
    modelParametersChanged: false,
    frozenPredictionModified: false,
    laterOriginRead: false,
    finalHoldoutRead: false,
    productionChanged: false,
    manifestSha256: await sha256File(manifestPath)
  }, null, 2)}\n`, "utf8");
  await writePublicK0Outputs({ root, config, audit });
  return audit;
}

export async function runM2CoreLegacyFrozenRescore({ root }) {
  const config = await readJson(path.join(root, CONFIG_PATH));
  validateM2CoreLegacyPopulationConfig(config);
  const privateDirectory = path.join(
    root,
    config.privateOutputs.directory
  );
  await mkdir(privateDirectory, { recursive: true });
  const receiptPath = path.join(
    privateDirectory,
    config.privateOutputs.receipt
  );
  const priorReceipt = await readJsonIfPresent(receiptPath);
  const reportingCorrectionRequired = (
    priorReceipt?.status === "VALID_K1_FROZEN_RESCORE_COMPLETE"
    && await frozenRescoreReportingCorrectionRequired({ root, config })
  );
  if (
    (
      priorReceipt?.status === "VALID_K1_FROZEN_RESCORE_COMPLETE"
      && !reportingCorrectionRequired
    )
    || priorReceipt?.status === "VALID_K2_TAIL_INTERFERENCE_TEST_COMPLETE"
  ) {
    throw new Error(
      "m2_core_legacy_frozen_rescore_already_complete"
    );
  }
  let preflight = null;
  try {
    preflight = verifyCoreLegacyStagePreflight(root, {
      stage: "K1_FROZEN_RESCORE",
      allowedDirtyPaths: [
        "package.json",
        "scripts/m2-current/core_legacy_population_private.mjs",
        "scripts/m2-current/run_m2_human_anchored_development.mjs",
        "src/domain/m2Current/coreLegacyPopulation.js",
        "test/m2-core-legacy-population-contract.test.js",
        "docs/analysis/m2-current/M2-core-legacy-frozen-rescore-v0.1.json",
        "docs/analysis/m2-current/M2-core-legacy-frozen-rescore-v0.1.md"
      ]
    });
    if (reportingCorrectionRequired) {
      await writeFile(path.join(
        privateDirectory,
        "M2-core-legacy-population-run-receipt-private-v0.1."
          + "k1-incomplete-required-matrix.json"
      ), `${JSON.stringify({
        ...priorReceipt,
        supersededStatus:
          "SUPERSEDED_INCOMPLETE_REQUIRED_MODEL_POPULATION_GRAIN_HORIZON_MATRIX",
        validMetricsPreservedWithoutInterpretationChange: true
      }, null, 2)}\n`, "utf8");
    }
    const authority = await materializeM2CoreRevenueAuthority({ root });
    const featureCache = new Map();
    const featureRows = (origin) => {
      if (!featureCache.has(origin)) {
        featureCache.set(
          origin,
          authority.featureMonthlyRowsForOrigin(origin)
        );
      }
      return featureCache.get(origin);
    };
    const cases = buildCoreLegacyWorkCases({
      origins: authority.legalOrigins,
      horizons: config.evaluation.horizonsMonths,
      finalMonthlyRows: authority.finalMonthlyRows,
      featureMonthlyRowsForOrigin: featureRows,
      config
    });
    const workCaseIndex = new Map(cases.workCases.map((row) => [
      frozenWorkKey(row),
      row
    ]));
    const channelCasesByWork = groupByValues(
      cases.channelCases,
      frozenWorkKey
    );
    const channelCaseIndex = new Map(cases.channelCases.map((row) => [
      frozenChannelKey(row),
      row
    ]));

    const humanPublic = await readJson(path.join(
      root,
      HUMAN_PUBLIC_EVALUATION
    ));
    const humanHistories = [];
    await forEachNdjson(path.join(root, HUMAN_HISTORIES), (row) => {
      humanHistories.push(row);
    });
    const historyIndex = new Map(humanHistories.map((row) => [
      `${row.origin}\u0000${row.standardWorkId}`,
      row
    ]));
    const humanEvaluations = [];
    await forEachNdjson(path.join(root, HUMAN_EVALUATION), (row) => {
      if (["primary", "strict_auxiliary"].includes(row.evaluationFamily)) {
        humanEvaluations.push(row);
      }
    });
    const strictKeys = new Set(humanEvaluations
      .filter((row) => row.evaluationFamily === "strict_auxiliary")
      .map(frozenWorkKey));
    const learnedGlobal = rebuildFrozenLearnedGlobalRows({
      config,
      humanPublic,
      humanEvaluations,
      historyIndex,
      workCaseIndex,
      channelCasesByWork
    });

    const occurrenceRows = [];
    await forEachNdjson(
      path.join(root, OCCURRENCE_AMOUNT_EVALUATION),
      (row) => occurrenceRows.push(row)
    );
    const occurrence = rebuildFrozenOccurrenceAmountRows({
      config,
      occurrenceRows,
      strictKeys,
      workCaseIndex
    });
    const primaryKeys = new Set([
      ...occurrence.sourceKeys,
      ...learnedGlobal.primarySourceKeys
    ]);

    const manual = rebuildFrozenCoreRevenueManualRows({
      config,
      origins: authority.legalOrigins,
      featureRows,
      authorityStartMonth: authority.authorityStartMonth,
      primaryKeys,
      strictKeys,
      channelCaseIndex
    });
    const privateRows = deduplicateFrozenRows([
      ...occurrence.rows,
      ...learnedGlobal.rows,
      ...manual.rows
    ]);
    if (privateRows.length === 0) {
      throw new Error("m2_core_legacy_frozen_rescore_rows_empty");
    }
    const evaluation = buildFrozenRescoreEvaluation({
      config,
      rows: privateRows,
      cases,
      rebuildAudit: {
        occurrence: occurrence.audit,
        learnedGlobal: learnedGlobal.audit,
        coreRevenueManual: manual.audit
      }
    });
    assertFrozenRescorePublicSafe(evaluation);

    const privateRowsPath = path.join(
      privateDirectory,
      config.privateOutputs.frozenRescoreRows
    );
    await writeNdjson(privateRowsPath, privateRows);
    const manifestPath = path.join(
      privateDirectory,
      config.privateOutputs.manifest
    );
    const priorManifest = await readJsonIfPresent(manifestPath) ?? {};
    const codeBindings = {};
    for (const relative of [
      "src/domain/m2Current/coreLegacyPopulation.js",
      "scripts/m2-current/core_legacy_population_private.mjs"
    ]) {
      codeBindings[relative] = await fileBinding(path.join(root, relative));
    }
    await writeFile(manifestPath, `${JSON.stringify({
      ...priorManifest,
      schema: "m2.current.core_legacy_population.manifest.private.v0.1",
      status: "VALID_K1_FROZEN_RESCORE_COMPLETE",
      experimentId: config.experiment.stableExperimentId,
      actualDefinitionId: config.target.actualDefinitionId,
      stages: {
        ...(priorManifest.stages ?? {}),
        K0_SCOPE_GOVERNANCE:
          priorManifest.status === "VALID_K0_AUDIT_COMPLETE"
            ? "COMPLETE"
            : "PRESERVED_FROM_PRIOR_MANIFEST",
        K1_FROZEN_RESCORE: "COMPLETE"
      },
      k1: {
        executionBaseHead: preflight.head,
        exactHeadCiRunId: preflight.ciRunId,
        privateRescoreRowCount: privateRows.length,
        modelTrainingPerformed: false,
        formulaOrParameterMutationPerformed: false,
        codeBindings,
        outputBindings: {
          frozenRescoreRows: await fileBinding(privateRowsPath)
        }
      },
      privateIdentityPublished: false
    }, null, 2)}\n`, "utf8");
    await writeFile(receiptPath, `${JSON.stringify({
      schema: "m2.current.core_legacy_population.run_receipt.private.v0.1",
      stage: "K1_FROZEN_MODEL_CORRECT_POPULATION_RESCORE",
      status: "VALID_K1_FROZEN_RESCORE_COMPLETE",
      executionBaseHead: preflight.head,
      exactHeadCiRunId: preflight.ciRunId,
      command: "npm run rescore:m2:current:core-legacy-population",
      frozenRescoreExecutionCount: reportingCorrectionRequired ? 2 : 1,
      validFrozenRescoreProduced: true,
      reportingCorrectionOfPriorValidOutput: reportingCorrectionRequired,
      priorOutputSupersededReason: reportingCorrectionRequired
        ? "INCOMPLETE_REQUIRED_MODEL_POPULATION_GRAIN_HORIZON_MATRIX"
        : null,
      modelTrainingPerformed: false,
      modelParametersChanged: false,
      frozenPredictionSourceModified: false,
      laterOriginRead: false,
      finalHoldoutRead: false,
      productionChanged: false,
      manifestSha256: await sha256File(manifestPath)
    }, null, 2)}\n`, "utf8");
    await writePublicK1Outputs({ root, config, evaluation });
    return evaluation;
  } catch (error) {
    await writeFile(receiptPath, `${JSON.stringify({
      schema: "m2.current.core_legacy_population.run_receipt.private.v0.1",
      stage: "K1_FROZEN_MODEL_CORRECT_POPULATION_RESCORE",
      status: "INVALIDATED_K1_EXECUTION_RETRY_ALLOWED",
      executionBaseHead: preflight?.head ?? null,
      errorCode: safeErrorCode(error),
      validFrozenRescoreProduced: false,
      modelTrainingPerformed: false,
      priorK0Status: priorReceipt?.status ?? null
    }, null, 2)}\n`, "utf8");
    throw error;
  }
}

function rebuildFrozenLearnedGlobalRows({
  config,
  humanPublic,
  humanEvaluations,
  historyIndex,
  workCaseIndex,
  channelCasesByWork
}) {
  const primaryParameters = new Map(
    (humanPublic.primary?.foldSelections ?? []).map(
      (row) => [Number(row.fold), row.parameters]
    )
  );
  const strictParameters = new Map(
    (humanPublic.strictAuxiliary?.selections ?? [])
      .filter((row) => row.status === "evaluated")
      .map((row) => [String(row.outerOrigin), row.parameters])
  );
  const rows = [];
  const primarySourceKeys = new Set();
  let frozenRowCount = 0;
  let matchedCorrectCaseCount = 0;
  let exactReconstructionCount = 0;
  let missingHistoryCount = 0;
  let missingParameterCount = 0;
  let missingEligibleChannelComponentCount = 0;
  let maximumAbsoluteReconstructionDifference = 0;
  for (const frozen of humanEvaluations) {
    frozenRowCount += 1;
    const workCase = workCaseIndex.get(frozenWorkKey(frozen));
    if (frozen.evaluationFamily === "primary") {
      primarySourceKeys.add(frozenWorkKey(frozen));
    }
    if (!workCase) continue;
    matchedCorrectCaseCount += 1;
    const history = historyIndex.get(
      `${frozen.origin}\u0000${frozen.standardWorkId}`
    );
    if (!history) {
      missingHistoryCount += 1;
      continue;
    }
    const parameters = frozen.evaluationFamily === "primary"
      ? primaryParameters.get(Number(frozen.evaluationFold))
      : strictParameters.get(String(frozen.outerOrigin));
    if (!parameters) {
      missingParameterCount += 1;
      continue;
    }
    const rebuilt = forecastM2HumanAnchoredBase({
      ...history,
      horizonMonths: Number(frozen.horizonMonths)
    }, parameters);
    const difference = Math.abs(
      rebuilt.positivePointEstimate
      - Number(frozen.learnedGlobalPointEstimate)
    );
    maximumAbsoluteReconstructionDifference = Math.max(
      maximumAbsoluteReconstructionDifference,
      difference
    );
    if (difference > 1e-7 * Math.max(
      1,
      Math.abs(Number(frozen.learnedGlobalPointEstimate))
    )) {
      continue;
    }
    exactReconstructionCount += 1;
    const components = new Map(rebuilt.channelComponents.map((item) => [
      String(item.channelUid),
      item.forecast36 * rebuilt.horizonScale
    ]));
    const correctChannels = channelCasesByWork.get(
      frozenWorkKey(frozen)
    ) ?? [];
    const missing = correctChannels.filter(
      (row) => !components.has(String(row.channelUid))
    );
    if (missing.length > 0) {
      missingEligibleChannelComponentCount += missing.length;
      continue;
    }
    const family = frozen.evaluationFamily === "primary"
      ? "PRIMARY_ROLLING"
      : "STRICT_ROLLING";
    for (const populationId of config.evaluation.populationIds) {
      if (!belongsToPopulation(workCase, populationId)) continue;
      const channelRows = correctChannels.map((channel) => ({
        schema: "m2.current.core_legacy_frozen_rescore_row.private.v0.1",
        modelId: "M2-WORK-LG01",
        evaluationFamily: family,
        populationId,
        grain: "WORK_CHANNEL",
        standardWorkId: String(channel.standardWorkId),
        channelUid: String(channel.channelUid),
        origin: channel.origin,
        horizonMonths: Number(channel.horizonMonths),
        pointEstimate: components.get(String(channel.channelUid)),
        actual: Number(channel.actual),
        settlementMechanism: channel.settlementMechanism,
        level2Category: channel.level2Category,
        level3Category: channel.level3Category,
        caseKey: frozenChannelKey(channel),
        frozenSourceStatus:
          "REBUILT_FROM_FROZEN_ROW_PARAMETERS_EXACTLY_VERIFIED"
      }));
      rows.push(...channelRows);
      rows.push({
        schema: "m2.current.core_legacy_frozen_rescore_row.private.v0.1",
        modelId: "M2-WORK-LG01",
        evaluationFamily: family,
        populationId,
        grain: "WORK_TOTAL",
        standardWorkId: String(workCase.standardWorkId),
        channelUid: null,
        origin: workCase.origin,
        horizonMonths: Number(workCase.horizonMonths),
        pointEstimate: sum(channelRows.map((row) => row.pointEstimate)),
        actual: Number(workCase.actual),
        settlementMechanism: workCase.dominantRevenueMode,
        level2Category: workCase.secondLevelCategoryReportingOnly,
        level3Category: workCase.thirdLevelCategoryReportingOnly,
        caseKey: frozenWorkKey(workCase),
        frozenSourceStatus:
          "SUM_OF_CORRECT_ELIGIBLE_FROZEN_CHANNEL_COMPONENTS"
      });
    }
  }
  return {
    rows,
    primarySourceKeys: [...primarySourceKeys],
    audit: {
      status: rows.length > 0
        ? "AVAILABLE_FROM_FROZEN_ROWS_AND_FOLD_PARAMETERS"
        : "NOT_COMPARABLE",
      frozenRowCount,
      matchedCorrectCaseCount,
      exactReconstructionCount,
      missingHistoryCount,
      missingParameterCount,
      missingEligibleChannelComponentCount,
      maximumAbsoluteReconstructionDifference
    }
  };
}

function rebuildFrozenOccurrenceAmountRows({
  config,
  occurrenceRows,
  strictKeys,
  workCaseIndex
}) {
  const rows = [];
  const sourceKeys = [];
  let salesShareFrozenRowCount = 0;
  let matchedCorrectCaseCount = 0;
  for (const frozen of occurrenceRows) {
    const key = normalizeOccurrenceCaseKey(frozen.caseKey);
    if (key === null || key.route !== "pure_sales_share") continue;
    salesShareFrozenRowCount += 1;
    const workKey = frozenWorkKey(key);
    sourceKeys.push(workKey);
    const workCase = workCaseIndex.get(workKey);
    if (!workCase) continue;
    matchedCorrectCaseCount += 1;
    for (const populationId of config.evaluation.populationIds) {
      if (!belongsToPopulation(workCase, populationId)) continue;
      const families = ["PRIMARY_ROLLING"];
      if (strictKeys.has(workKey)) families.push("STRICT_ROLLING");
      for (const evaluationFamily of families) {
        rows.push({
          schema: "m2.current.core_legacy_frozen_rescore_row.private.v0.1",
          modelId: "M2-WORK-OA03",
          evaluationFamily,
          populationId,
          grain: "WORK_TOTAL",
          standardWorkId: String(workCase.standardWorkId),
          channelUid: null,
          origin: workCase.origin,
          horizonMonths: Number(workCase.horizonMonths),
          pointEstimate: Number(frozen.candidatePointEstimate),
          actual: Number(workCase.actual),
          settlementMechanism: workCase.dominantRevenueMode,
          level2Category: workCase.secondLevelCategoryReportingOnly,
          level3Category: workCase.thirdLevelCategoryReportingOnly,
          caseKey: workKey,
          frozenSourceStatus: "DIRECT_FROZEN_WORK_TOTAL_ROW"
        });
      }
    }
  }
  return {
    rows,
    sourceKeys,
    audit: {
      status: rows.length > 0
        ? "WORK_TOTAL_AVAILABLE_WORK_CHANNEL_NOT_COMPARABLE"
        : "NOT_COMPARABLE",
      salesShareFrozenRowCount,
      matchedCorrectCaseCount,
      workChannelStatus:
        "NOT_COMPARABLE_FROZEN_CHANNEL_DECOMPOSITION_UNAVAILABLE"
    }
  };
}

function rebuildFrozenCoreRevenueManualRows({
  config,
  origins,
  featureRows,
  authorityStartMonth,
  primaryKeys,
  strictKeys,
  channelCaseIndex
}) {
  const rows = [];
  const minimumSourceSerial = monthToSerial(authorityStartMonth);
  let eligibleForecastCount = 0;
  let matchedCorrectChannelCaseCount = 0;
  for (const origin of origins) {
    const population = buildCoreLegacyOriginPopulation({
      origin,
      monthlyRows: featureRows(origin),
      minimumCompleteMonths: config.eligibility.minimumCompleteMonths,
      thresholds: config.coreSelection.thresholds,
      topCounts: config.coreSelection.topDiagnostics
    });
    const originSerial = monthToSerial(origin);
    for (const populationId of config.evaluation.populationIds) {
      const selected = population.eligiblePairs.filter(
        (row) => belongsToPopulation(row, populationId)
      );
      const prepared = selected.map((pair) => {
        const history = denseCashFromMap(
          pair.monthlyCashBySerial,
          pair.firstPositiveSerial,
          originSerial
        );
        const windowStart = Math.max(
          minimumSourceSerial,
          originSerial - 23
        );
        const windowCash = denseCashFromMap(
          pair.monthlyCashBySerial,
          windowStart,
          originSerial
        );
        const base = forecastCoreRevenueManual(history, {
          windowCash,
          twoCompleteWindows:
            originSerial - minimumSourceSerial + 1 >= 24
            && originSerial - pair.firstPositiveSerial + 1 >= 24
        });
        return { pair, base };
      });
      const fallbackIndex = buildCoreDirectKFallbackIndex(
        prepared.map(({ pair, base }) => ({
          channelUid: pair.channelUid,
          level2Category: pair.level2Category,
          directK: base.directK
        }))
      );
      for (const { pair, base } of prepared) {
        const forecast = applyCoreRevenueLongTermForecast(
          base,
          resolveCoreRevenueK({
            directK: base.directK,
            channelUid: pair.channelUid,
            level2Category: pair.level2Category,
            fallbackIndex
          })
        );
        eligibleForecastCount += 1;
        for (const horizonMonths of config.evaluation.horizonsMonths) {
          const channelKey = frozenChannelKey({
            ...pair,
            origin,
            horizonMonths
          });
          const channelCase = channelCaseIndex.get(channelKey);
          if (!channelCase) continue;
          const workKey = frozenWorkKey(channelCase);
          const families = [];
          if (primaryKeys.has(workKey)) families.push("PRIMARY_ROLLING");
          if (strictKeys.has(workKey)) families.push("STRICT_ROLLING");
          if (families.length === 0) continue;
          matchedCorrectChannelCaseCount += 1;
          for (const evaluationFamily of families) {
            rows.push({
              schema:
                "m2.current.core_legacy_frozen_rescore_row.private.v0.1",
              modelId: "M2-WORK-CRMR01",
              evaluationFamily,
              populationId,
              grain: "WORK_CHANNEL",
              standardWorkId: String(pair.standardWorkId),
              channelUid: String(pair.channelUid),
              origin,
              horizonMonths,
              pointEstimate: coreRevenueForecastForHorizon(
                forecast,
                horizonMonths
              ),
              actual: Number(channelCase.actual),
              settlementMechanism: pair.settlementMechanism,
              level2Category: pair.level2Category,
              level3Category: pair.level3Category,
              caseKey: channelKey,
              frozenSourceStatus:
                "DETERMINISTIC_FROZEN_FORMULA_NO_PARAMETER_CHANGE"
            });
          }
        }
      }
    }
  }
  const channelRows = [...rows];
  const grouped = groupByValues(channelRows, (row) => [
    row.modelId,
    row.evaluationFamily,
    row.populationId,
    row.origin,
    row.horizonMonths,
    row.standardWorkId
  ].join("\u0000"));
  for (const values of grouped.values()) {
    const first = values[0];
    rows.push({
      schema: "m2.current.core_legacy_frozen_rescore_row.private.v0.1",
      modelId: first.modelId,
      evaluationFamily: first.evaluationFamily,
      populationId: first.populationId,
      grain: "WORK_TOTAL",
      standardWorkId: first.standardWorkId,
      channelUid: null,
      origin: first.origin,
      horizonMonths: first.horizonMonths,
      pointEstimate: sum(values.map((row) => row.pointEstimate)),
      actual: sum(values.map((row) => row.actual)),
      settlementMechanism: dominantValue(
        values.map((row) => row.settlementMechanism)
      ),
      level2Category: dominantValue(
        values.map((row) => row.level2Category)
      ),
      level3Category: dominantValue(
        values.map((row) => row.level3Category)
      ),
      caseKey: frozenWorkKey(first),
      frozenSourceStatus:
        "SUM_OF_CORRECT_ELIGIBLE_FROZEN_FORMULA_CHANNEL_ROWS"
    });
  }
  return {
    rows,
    audit: {
      status: rows.length > 0
        ? "AVAILABLE_FROM_FROZEN_FORMULA_AND_AUTHORITY"
        : "NOT_COMPARABLE",
      eligibleForecastCount,
      matchedCorrectChannelCaseCount,
      formulaOrParameterMutationPerformed: false
    }
  };
}

function buildFrozenRescoreEvaluation({
  config,
  rows,
  cases,
  rebuildAudit
}) {
  const metrics = completeFrozenMetricMatrix(metricCells(rows, [
    "modelId",
    "evaluationFamily",
    "populationId",
    "grain",
    "horizonMonths"
  ]), config);
  const timeBlocks = buildTimeBlockSlices(rows);
  const channelSlices = buildSanitizedSlices(
    rows.filter((row) => row.grain === "WORK_CHANNEL"),
    "channelUid",
    "CHANNEL"
  );
  const level2Slices = buildSanitizedSlices(
    rows,
    "level2Category",
    "LEVEL2"
  );
  const level3Slices = buildSanitizedSlices(
    rows,
    "level3Category",
    "LEVEL3"
  );
  const mechanismSlices = metricCells(rows, [
    "modelId",
    "evaluationFamily",
    "populationId",
    "grain",
    "horizonMonths",
    "settlementMechanism"
  ], { suppressSmallCells: true });
  const pairedComparisons = buildPairedFrozenComparisons(rows, config);
  const sameCaseLeaderboards = buildSameCaseLeaderboards(rows);
  const coverage = buildCoverageReport(cases, config);
  return {
    schema: "m2.current.core_legacy_frozen_rescore.public.v0.1",
    asOf: config.asOf,
    experiment: config.experiment,
    status: "K1_FROZEN_MODEL_CORRECT_POPULATION_RESCORE_COMPLETE",
    target: {
      actualDefinitionId: config.target.actualDefinitionId,
      grain: config.target.predictionGrain,
      workTotalMeaning: config.target.workTotalMeaning,
      excluded: config.target.excluded
    },
    rebuildAudit,
    availability: [
      {
        modelId: "M2-WORK-OA03",
        displayNameZh: "作品发生—金额校准模型 v0.3",
        displayNameEn: "Occurrence-Amount Calibration v0.3",
        workTotal: "AVAILABLE_DIRECT_FROZEN_ROWS",
        workChannel:
          "NOT_COMPARABLE_FROZEN_CHANNEL_DECOMPOSITION_UNAVAILABLE"
      },
      {
        modelId: "M2-WORK-LG01",
        displayNameZh: "人工锚定可学习全局模型",
        displayNameEn: "Human-Anchored Learned Global",
        workTotal:
          "AVAILABLE_SUM_OF_CORRECT_ELIGIBLE_FROZEN_CHANNEL_COMPONENTS",
        workChannel:
          "AVAILABLE_FROM_EXACTLY_VERIFIED_FROZEN_DECOMPOSITION"
      },
      {
        modelId: "M2-WORK-CRMR01",
        displayNameZh: "核心收入人工规则基线 v0.1",
        displayNameEn: "Core-Revenue Manual Rule Baseline v0.1",
        workTotal: "AVAILABLE_DETERMINISTIC_FROZEN_FORMULA",
        workChannel: "AVAILABLE_DETERMINISTIC_FROZEN_FORMULA"
      }
    ],
    coverage,
    populationSummary: {
      originCount: cases.populationRows.length,
      meanEligibleWorkCount: average(cases.populationRows.map(
        (row) => row.eligibleWorkCount
      )),
      meanEligiblePairCount: average(cases.populationRows.map(
        (row) => row.eligiblePairCount
      )),
      meanCore80WorkCount: average(cases.populationRows.map(
        (row) => row.core80WorkCount
      )),
      meanCore90WorkCount: average(cases.populationRows.map(
        (row) => row.core90WorkCount
      )),
      meanImmatureObservedPairCount: average(cases.populationRows.map(
        (row) => row.immatureObservedPairCount
      ))
    },
    metrics,
    slices: {
      timeBlocks,
      channels: channelSlices,
      settlementMechanisms: mechanismSlices,
      level2ReportingOnly: level2Slices,
      level3ReportingOnly: level3Slices,
      sanitizedDimensionLabels: true,
      smallCellMinimumWorks: 5
    },
    pairedComparisons,
    sameCaseLeaderboards,
    boundaries: {
      modelTrainingPerformed: false,
      formulaOrParameterMutationPerformed: false,
      publicAggregateInferenceUsed: false,
      portfolioModelsIncluded: false,
      companyTotalDenominatorUsed: false,
      immaturePairsTreatedAsZero: false,
      futureNewWorkIncluded: false,
      futureFirstChannelIncluded: false,
      productionChanged: false,
      laterOriginRead: false,
      finalHoldoutRead: false
    },
    privacy: {
      privateRowIdentityIncluded: false,
      privatePathIncluded: false,
      originalChannelOrCategoryLabelIncluded: false,
      aggregateOnly: true
    }
  };
}

function metricCells(rows, dimensions, { suppressSmallCells = false } = {}) {
  const grouped = groupByValues(rows, (row) => dimensions
    .map((field) => String(row[field] ?? "UNKNOWN"))
    .join("\u0000"));
  return [...grouped.values()].map((values) => {
    const identity = Object.fromEntries(
      dimensions.map((field) => [field, values[0][field] ?? "UNKNOWN"])
    );
    const metric = scoreCoreLegacyPointRows(values);
    return {
      ...identity,
      ...publicMetric(
        metric,
        suppressSmallCells && metric.workCount < 5
      )
    };
  }).sort(comparePublicCells);
}

function buildTimeBlockSlices(rows) {
  const origins = [...new Set(rows.map((row) => row.origin))].sort();
  const blockByOrigin = new Map(origins.map((origin, index) => [
    origin,
    `TIME_BLOCK_${Math.min(3, Math.floor(index * 3 / origins.length) + 1)}`
  ]));
  return metricCells(rows.map((row) => ({
    ...row,
    timeBlock: blockByOrigin.get(row.origin)
  })), [
    "modelId",
    "evaluationFamily",
    "populationId",
    "grain",
    "horizonMonths",
    "timeBlock"
  ], { suppressSmallCells: true });
}

function buildSanitizedSlices(rows, field, prefix) {
  const values = [...new Set(rows.map(
    (row) => String(row[field] ?? "UNKNOWN")
  ))].sort();
  const aliases = new Map(values.map((value, index) => [
    value,
    `${prefix}_${String(index + 1).padStart(3, "0")}`
  ]));
  return metricCells(rows.map((row) => ({
    ...row,
    sanitizedSliceId: aliases.get(String(row[field] ?? "UNKNOWN"))
  })), [
    "modelId",
    "evaluationFamily",
    "populationId",
    "grain",
    "horizonMonths",
    "sanitizedSliceId"
  ], { suppressSmallCells: true });
}

function buildPairedFrozenComparisons(rows, config) {
  const dimensions = [
    "evaluationFamily",
    "populationId",
    "grain",
    "horizonMonths"
  ];
  const grouped = groupByValues(rows, (row) => dimensions
    .map((field) => String(row[field]))
    .join("\u0000"));
  const output = [];
  for (const values of grouped.values()) {
    const byModel = groupByValues(values, (row) => row.modelId);
    const modelIds = [...byModel.keys()].sort();
    for (let leftIndex = 0; leftIndex < modelIds.length; leftIndex += 1) {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < modelIds.length;
        rightIndex += 1
      ) {
        const leftId = modelIds[leftIndex];
        const rightId = modelIds[rightIndex];
        const left = new Map(byModel.get(leftId).map(
          (row) => [row.caseKey, row]
        ));
        const right = new Map(byModel.get(rightId).map(
          (row) => [row.caseKey, row]
        ));
        const common = [...left.keys()]
          .filter((key) => right.has(key))
          .sort()
          .map((key) => ({
            ...left.get(key),
            candidatePointEstimate: left.get(key).pointEstimate,
            baselinePointEstimate: right.get(key).pointEstimate
          }));
        if (common.length === 0) continue;
        const first = values[0];
        const leftScore = scoreCoreLegacyPointRows(common.map((row) => ({
          ...row,
          pointEstimate: row.candidatePointEstimate
        })));
        const rightScore = scoreCoreLegacyPointRows(common.map((row) => ({
          ...row,
          pointEstimate: row.baselinePointEstimate
        })));
        output.push({
          evaluationFamily: first.evaluationFamily,
          populationId: first.populationId,
          grain: first.grain,
          horizonMonths: first.horizonMonths,
          leftModelId: leftId,
          rightModelId: rightId,
          sameCaseCount: common.length,
          sameWorkCount: new Set(common.map(
            (row) => row.standardWorkId
          )).size,
          leftWape: leftScore.wape,
          rightWape: rightScore.wape,
          leftRelativeWapeImprovementVersusRight:
            rightScore.wape > 0
              ? (rightScore.wape - leftScore.wape) / rightScore.wape
              : null,
          bootstrap: efficientPairedWorkBootstrap(common, {
            iterations: config.evaluation.bootstrap.iterations,
            seed: config.evaluation.bootstrap.seed
          })
        });
      }
    }
  }
  return output.sort(comparePublicCells);
}

function buildSameCaseLeaderboards(rows) {
  const dimensions = [
    "evaluationFamily",
    "populationId",
    "grain",
    "horizonMonths"
  ];
  const grouped = groupByValues(rows, (row) => dimensions
    .map((field) => String(row[field]))
    .join("\u0000"));
  const output = [];
  for (const values of grouped.values()) {
    const byModel = groupByValues(values, (row) => row.modelId);
    const modelIds = [...byModel.keys()].sort();
    if (modelIds.length < 2) continue;
    let intersection = null;
    const indexes = new Map();
    for (const modelId of modelIds) {
      const index = new Map(byModel.get(modelId).map(
        (row) => [row.caseKey, row]
      ));
      indexes.set(modelId, index);
      const keys = new Set(index.keys());
      intersection = intersection === null
        ? keys
        : new Set([...intersection].filter((key) => keys.has(key)));
    }
    if (intersection.size === 0) continue;
    const scores = modelIds.map((modelId) => ({
      modelId,
      ...publicMetric(scoreCoreLegacyPointRows(
        [...intersection].map((key) => indexes.get(modelId).get(key))
      ))
    })).sort((left, right) => (
      (left.wape ?? Infinity) - (right.wape ?? Infinity)
      || left.modelId.localeCompare(right.modelId)
    ));
    const first = values[0];
    output.push({
      evaluationFamily: first.evaluationFamily,
      populationId: first.populationId,
      grain: first.grain,
      horizonMonths: first.horizonMonths,
      sameCaseCount: intersection.size,
      sameWorkCount: new Set([...intersection].map((key) => (
        indexes.get(modelIds[0]).get(key).standardWorkId
      ))).size,
      bestObservedFrozenModelId: scores[0].modelId,
      rankingScope:
        "ONLY_THIS_EXACT_SAME_CASE_POPULATION_GRAIN_HORIZON_AND_FAMILY",
      scores
    });
  }
  return output.sort(comparePublicCells);
}

function buildCoverageReport(cases, config) {
  const output = [];
  for (const horizonMonths of config.evaluation.horizonsMonths) {
    const eligible = cases.channelCases.filter(
      (row) => row.horizonMonths === horizonMonths
    );
    const immature = cases.immatureChannelCases.filter(
      (row) => row.horizonMonths === horizonMonths
    );
    const eligibleSigned = sum(eligible.map((row) => row.actual));
    const eligibleMagnitude = sum(eligible.map(
      (row) => Math.abs(row.actual)
    ));
    const immatureMagnitude = sum(immature.map(
      (row) => Math.abs(row.actual)
    ));
    for (const populationId of config.evaluation.populationIds) {
      const selected = eligible.filter(
        (row) => belongsToPopulation(row, populationId)
      );
      const selectedSigned = sum(selected.map((row) => row.actual));
      const selectedMagnitude = sum(selected.map(
        (row) => Math.abs(row.actual)
      ));
      const populationField = populationId.toLowerCase();
      const referenceValues = cases.populationRows
        .map((row) => row[`${populationField}ReferenceCapture`])
        .filter((value) => Number.isFinite(value));
      output.push({
        populationId,
        horizonMonths,
        originCount: cases.populationRows.length,
        referenceWindowMeanCapture:
          referenceValues.length > 0 ? average(referenceValues) : null,
        futureEligibleObservedChannelSignedRevenueCoverage:
          ratio(selectedSigned, eligibleSigned),
        futureEligibleObservedChannelAbsoluteRevenueCoverage:
          ratio(selectedMagnitude, eligibleMagnitude),
        denominator:
          "ALL_ORIGIN_MATURE_LEGACY_WORK_OBSERVED_MATURE_CHANNEL_FUTURE_REVENUE",
        companyFutureRevenueDenominatorUsed: false,
        immatureObservedPairFutureAbsoluteRevenueShare:
          ratio(
            immatureMagnitude,
            eligibleMagnitude + immatureMagnitude
          ),
        immatureObservedPairCount: immature.length,
        immaturePolicy: "ABSTAIN_NOT_ZERO"
      });
    }
  }
  return output;
}

function efficientPairedWorkBootstrap(rows, { iterations, seed }) {
  const byWork = groupByValues(rows, (row) => String(row.standardWorkId));
  const workIds = [...byWork.keys()].sort();
  if (workIds.length < 2) {
    return {
      status: "NOT_COMPUTABLE_INSUFFICIENT_WORK_CLUSTERS",
      iterations: 0,
      workCount: workIds.length
    };
  }
  const aggregates = workIds.map((workId) => {
    const values = byWork.get(workId);
    return {
      denominator: sum(values.map((row) => Math.abs(row.actual))),
      candidateError: sum(values.map(
        (row) => Math.abs(row.candidatePointEstimate - row.actual)
      )),
      baselineError: sum(values.map(
        (row) => Math.abs(row.baselinePointEstimate - row.actual)
      ))
    };
  });
  const random = mulberry32Local(seed);
  const improvements = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let denominator = 0;
    let candidateError = 0;
    let baselineError = 0;
    for (let index = 0; index < aggregates.length; index += 1) {
      const value = aggregates[
        Math.floor(random() * aggregates.length)
      ];
      denominator += value.denominator;
      candidateError += value.candidateError;
      baselineError += value.baselineError;
    }
    if (denominator > 0) {
      improvements.push(
        baselineError / denominator - candidateError / denominator
      );
    }
  }
  improvements.sort((left, right) => left - right);
  return {
    status: improvements.length === iterations ? "COMPUTED" : "PARTIAL",
    method: "paired_standard_work_cluster_resample",
    iterations: improvements.length,
    seed,
    workCount: workIds.length,
    leftModelAbsoluteWapeImprovement95: {
      lower: empiricalQuantileLocal(improvements, 0.025),
      median: empiricalQuantileLocal(improvements, 0.5),
      upper: empiricalQuantileLocal(improvements, 0.975)
    }
  };
}

function verifyCoreLegacyStagePreflight(root, {
  stage,
  allowedDirtyPaths
}) {
  const status = command(root, "git", [
    "status",
    "--porcelain",
    "--untracked-files=all"
  ]).trimEnd();
  const dirtyPaths = status === ""
    ? []
    : status.split(/\r?\n/u).map((line) => line.slice(3).trim());
  const unexpected = dirtyPaths.filter((file) => (
    !allowedDirtyPaths.includes(file.replaceAll("\\", "/"))
  ));
  if (unexpected.length > 0) {
    throw new Error(
      `m2_core_legacy_${stage.toLowerCase()}_unexpected_dirty_worktree`
    );
  }
  const head = command(root, "git", ["rev-parse", "HEAD"]).trim();
  const upstream = command(
    root,
    "git",
    ["rev-parse", "@{upstream}"]
  ).trim();
  if (head !== upstream) {
    throw new Error("m2_core_legacy_head_not_equal_upstream");
  }
  const branch = command(
    root,
    "git",
    ["branch", "--show-current"]
  ).trim();
  const pr = JSON.parse(command(root, "gh", [
    "pr",
    "view",
    "--json",
    "number,state,isDraft,mergedAt,headRefOid,baseRefName,url"
  ]));
  if (
    pr.number !== 32
    || pr.state !== "OPEN"
    || pr.isDraft !== true
    || pr.mergedAt !== null
    || pr.headRefOid !== head
    || pr.baseRefName !== "main"
  ) {
    throw new Error("m2_core_legacy_draft_pr_preflight_failed");
  }
  const runs = JSON.parse(command(root, "gh", [
    "run",
    "list",
    "--commit",
    head,
    "--event",
    "pull_request",
    "--limit",
    "20",
    "--json",
    "databaseId,headSha,status,conclusion,workflowName,url"
  ]));
  const successful = runs.find((item) => (
    item.headSha === head
    && item.workflowName === "CI"
    && item.status === "completed"
    && item.conclusion === "success"
  ));
  if (!successful) {
    throw new Error("m2_core_legacy_exact_head_ci_not_successful");
  }
  const workflow = JSON.parse(command(root, "gh", [
    "run",
    "view",
    String(successful.databaseId),
    "--json",
    "headSha,status,conclusion,jobs,url"
  ]));
  const jobs = Object.fromEntries(
    workflow.jobs.map((job) => [job.name, job])
  );
  if (
    workflow.headSha !== head
    || workflow.status !== "completed"
    || workflow.conclusion !== "success"
    || jobs.verify?.conclusion !== "success"
    || jobs["verify-windows"]?.conclusion !== "success"
  ) {
    throw new Error(
      "m2_core_legacy_exact_head_dual_ci_not_successful"
    );
  }
  return {
    repository: "KAtOReNA7/system",
    branch,
    head,
    upstream,
    prNumber: pr.number,
    prUrl: pr.url,
    prDraft: pr.isDraft,
    ciRunId: successful.databaseId,
    ciUrl: workflow.url,
    linux: jobs.verify.conclusion,
    windows: jobs["verify-windows"].conclusion,
    stage,
    dirtyTaskImplementationPaths: dirtyPaths
  };
}

function belongsToPopulation(row, populationId) {
  return ({
    CORE80: row.core80,
    CORE90: row.core90,
    TOP20: row.top20,
    TOP50: row.top50
  })[populationId] === true;
}

function normalizeOccurrenceCaseKey(value) {
  if (!value || typeof value !== "object") return null;
  const standardWorkId = value.standardWorkId
    ?? value.standard_work_id;
  const origin = value.origin;
  const horizonMonths = value.horizonMonths
    ?? value.horizon_months;
  const route = value.route;
  if (
    standardWorkId == null
    || !/^\d{4}-\d{2}$/u.test(String(origin))
    || !Number.isInteger(Number(horizonMonths))
    || route == null
  ) {
    return null;
  }
  return {
    standardWorkId: String(standardWorkId),
    origin: String(origin),
    horizonMonths: Number(horizonMonths),
    route: String(route)
  };
}

function frozenWorkKey(row) {
  const standardWorkId = row.standardWorkId
    ?? row.caseKey?.standardWorkId
    ?? row.caseKey?.standard_work_id;
  const origin = row.origin ?? row.caseKey?.origin;
  const horizonMonths = row.horizonMonths
    ?? row.caseKey?.horizonMonths
    ?? row.caseKey?.horizon_months;
  return `${standardWorkId}\u0000${origin}\u0000${Number(horizonMonths)}`;
}

function frozenChannelKey(row) {
  return `${frozenWorkKey(row)}\u0000${String(row.channelUid)}`;
}

function denseCashFromMap(months, start, end) {
  const output = [];
  for (let serial = start; serial <= end; serial += 1) {
    output.push(Number(months.get(serial) ?? 0));
  }
  return output;
}

function coreRevenueForecastForHorizon(forecast, horizon) {
  if (horizon === 3) return forecast.F3;
  if (horizon === 6) return forecast.F6;
  if (horizon === 12) return forecast.F12;
  if (horizon === 36) return forecast.F36;
  throw new Error("m2_core_legacy_horizon_invalid");
}

function deduplicateFrozenRows(rows) {
  const output = new Map();
  for (const row of rows) {
    const key = [
      row.modelId,
      row.evaluationFamily,
      row.populationId,
      row.grain,
      row.caseKey
    ].join("\u0000");
    const prior = output.get(key);
    if (
      prior
      && (
        Math.abs(prior.pointEstimate - row.pointEstimate) > 1e-7
        || Math.abs(prior.actual - row.actual) > 1e-7
      )
    ) {
      throw new Error("m2_core_legacy_frozen_row_conflict");
    }
    output.set(key, row);
  }
  return [...output.values()].sort((left, right) => (
    left.modelId.localeCompare(right.modelId)
    || left.evaluationFamily.localeCompare(right.evaluationFamily)
    || left.populationId.localeCompare(right.populationId)
    || left.grain.localeCompare(right.grain)
    || left.caseKey.localeCompare(right.caseKey)
  ));
}

function completeFrozenMetricMatrix(metrics, config) {
  const models = [
    "M2-WORK-OA03",
    "M2-WORK-LG01",
    "M2-WORK-CRMR01"
  ];
  const index = new Map(metrics.map((row) => [[
    row.modelId,
    row.evaluationFamily,
    row.populationId,
    row.grain,
    row.horizonMonths
  ].join("\u0000"), row]));
  for (const modelId of models) {
    for (const evaluationFamily of config.evaluation.families) {
      for (const populationId of config.evaluation.populationIds) {
        for (const grain of config.evaluation.grains) {
          for (const horizonMonths of config.evaluation.horizonsMonths) {
            const key = [
              modelId,
              evaluationFamily,
              populationId,
              grain,
              horizonMonths
            ].join("\u0000");
            if (index.has(key)) continue;
            const oaChannelUnavailable = (
              modelId === "M2-WORK-OA03"
              && grain === "WORK_CHANNEL"
            );
            index.set(key, {
              modelId,
              evaluationFamily,
              populationId,
              grain,
              horizonMonths,
              status: oaChannelUnavailable
                ? "NOT_COMPARABLE_FROZEN_CHANNEL_DECOMPOSITION_UNAVAILABLE"
                : "NOT_COMPARABLE_FROZEN_ROWS_UNAVAILABLE_FOR_FAMILY_HORIZON",
              caseCount: 0,
              workCount: 0,
              wape: null,
              signedBias: null,
              mae: null,
              medianAbsoluteError: null,
              zeroActualFalsePositiveError: null,
              zeroPredictionPositiveActualMissError: null
            });
          }
        }
      }
    }
  }
  return [...index.values()].sort(comparePublicCells);
}

function publicMetric(metric, suppressed = false) {
  if (suppressed) {
    return {
      status: "SUPPRESSED_SMALL_CELL",
      caseCount: metric.caseCount,
      workCount: metric.workCount,
      wape: null,
      signedBias: null,
      mae: null,
      medianAbsoluteError: null,
      zeroActualFalsePositiveError: null,
      zeroPredictionPositiveActualMissError: null
    };
  }
  return {
    status: metric.status,
    caseCount: metric.caseCount,
    workCount: metric.workCount,
    wape: metric.wape,
    signedBias: metric.signedBias,
    mae: metric.mae,
    medianAbsoluteError: metric.medianAbsoluteError,
    zeroActualFalsePositiveError: metric.zeroActualFalsePositiveError,
    zeroPredictionPositiveActualMissError:
      metric.zeroPredictionPositiveActualMissError
  };
}

function comparePublicCells(left, right) {
  return JSON.stringify(left).localeCompare(JSON.stringify(right));
}

function dominantValue(values) {
  const counts = new Map();
  for (const value of values) {
    counts.set(String(value ?? "UNKNOWN"), (
      counts.get(String(value ?? "UNKNOWN")) ?? 0
    ) + 1);
  }
  return [...counts].sort((left, right) => (
    right[1] - left[1] || left[0].localeCompare(right[0])
  ))[0]?.[0] ?? "UNKNOWN";
}

function groupByValues(values, keyOf) {
  const output = new Map();
  for (const value of values) {
    const key = keyOf(value);
    const rows = output.get(key) ?? [];
    rows.push(value);
    output.set(key, rows);
  }
  return output;
}

function mulberry32Local(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let state = value;
    state = Math.imul(state ^ state >>> 15, state | 1);
    state ^= state + Math.imul(state ^ state >>> 7, state | 61);
    return ((state ^ state >>> 14) >>> 0) / 4294967296;
  };
}

function empiricalQuantileLocal(sorted, probability) {
  if (sorted.length === 0) return null;
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] * (upper - index)
    + sorted[upper] * (index - lower);
}

function assertFrozenRescorePublicSafe(value) {
  assertNoPrivateIdentityKeys(value);
  const serialized = JSON.stringify(value);
  for (const forbidden of [
    "private-output",
    "private-input",
    "executionBaseHead",
    "sha256"
  ]) {
    if (serialized.includes(forbidden)) {
      throw new Error(
        `m2_core_legacy_public_rescore_forbidden_${forbidden}`
      );
    }
  }
  return true;
}

function assertNoPrivateIdentityKeys(value) {
  if (Array.isArray(value)) {
    for (const item of value) assertNoPrivateIdentityKeys(item);
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (["standardWorkId", "channelUid", "caseKey"].includes(key)) {
      throw new Error(
        `m2_core_legacy_public_rescore_forbidden_key_${key}`
      );
    }
    assertNoPrivateIdentityKeys(child);
  }
}

async function writePublicK1Outputs({ root, config, evaluation }) {
  const jsonPath = path.join(
    root,
    config.publicOutputs.frozenRescoreJson
  );
  const reportPath = path.join(
    root,
    config.publicOutputs.frozenRescoreReport
  );
  await writeFile(
    jsonPath,
    `${JSON.stringify(evaluation, null, 2)}\n`,
    "utf8"
  );
  await writeFile(reportPath, renderFrozenRescoreReport(evaluation), "utf8");
}

function renderFrozenRescoreReport(value) {
  const lines = [
    "# M2 正确人口冻结重评分 v0.1",
    "",
    `> 实验：${value.experiment.displayNameZh}（${
      value.experiment.displayNameEn
    }，\`${value.experiment.stableExperimentId}\`）`,
    ">",
    `> 阶段状态：冻结模型正确人口重评分完成（\`${value.status}\`）。本阶段没有训练、调参或修改冻结公式。`,
    "",
    "## 结论先行",
    "",
    "本次只把既有冻结预测放回“动态核心老品×起点已有成熟渠道”的正确 actual 中重评分。作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`）只有作品总额冻结行，因此渠道粒度明确记为不可比较（`NOT_COMPARABLE_FROZEN_CHANNEL_DECOMPOSITION_UNAVAILABLE`）；其余两种模型均保留作品总额和作品×渠道结果。",
    "",
    "所有排名只在相同人口、相同 horizon、相同粒度、相同评价族和 exact same-case 交集内成立，不形成跨人口冠军。",
    "",
    "## 覆盖率",
    "",
    "| 人口 | horizon | 参考窗平均覆盖 | 未来已有成熟渠道收入覆盖 | 不足 3 月未来金额占比 |",
    "|---|---:|---:|---:|---:|"
  ];
  for (const row of value.coverage) {
    lines.push(
      `| ${row.populationId} | ${row.horizonMonths} | ${
        percent(row.referenceWindowMeanCapture)
      } | ${percent(
        row.futureEligibleObservedChannelAbsoluteRevenueCoverage
      )} | ${percent(
        row.immatureObservedPairFutureAbsoluteRevenueShare
      )} |`
    );
  }
  lines.push(
    "",
    "覆盖率分母只包含 origin 时已经成熟的老作品×已有成熟渠道未来分成收入；未使用公司全部未来收入。成熟不足 3 个月的人口是弃权（`ABSTAIN_NOT_ZERO`），不按预测为 0。",
    "",
    "## 核心指标",
    "",
    "| 模型 | 评价族 | 人口 | 粒度 | horizon | cases | works | WAPE | signed bias | MAE | median AE |",
    "|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|"
  );
  for (const row of value.metrics.filter((item) => (
    ["CORE80", "CORE90"].includes(item.populationId)
  ))) {
    lines.push(
      `| ${row.modelId} | ${row.evaluationFamily} | ${
        row.populationId
      } | ${row.grain} | ${row.horizonMonths} | ${row.caseCount} | ${
        row.workCount
      } | ${metricNumber(row.wape)} | ${metricNumber(
        row.signedBias
      )} | ${metricNumber(row.mae)} | ${metricNumber(
        row.medianAbsoluteError
      )} |`
    );
  }
  lines.push(
    "",
    "Top20、Top50、时间块、匿名渠道、二级/三级分类诊断、零 actual 假阳性误差、零预测漏报误差和 2,000 次作品聚类配对 bootstrap 均保存在同名机器结果 JSON 中。渠道与分类公开切片使用匿名稳定桶，行级身份只保留在 Git ignored 私有工件。",
    "",
    "## 封闭边界",
    "",
    "- 未训练模型、未改变参数或公式，也未从公开聚合摘要反推私有预测。",
    "- 未纳入分层收入组合模型 v0.1（Layered Revenue Composition Model v0.1，`M2-PORT-LRC01`）或组合现金参考（Portfolio ETS/Holt-Winters，`M2-PORT-ETS01`）。",
    "- 未读取 later-origin 或 final holdout，未修改 production、活动候选或自动化批准。"
  );
  return `${lines.join("\n")}\n`;
}

function metricNumber(value) {
  return value === null || !Number.isFinite(value)
    ? "不可计算"
    : Number(value).toFixed(6);
}

function command(root, executable, args) {
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    shell: false
  });
  if (result.status !== 0) {
    throw new Error(
      `m2_core_legacy_command_failed:${executable}:${args.join("_")}`
    );
  }
  return result.stdout;
}

async function readJsonIfPresent(filePath) {
  try {
    return await readJson(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function frozenRescoreReportingCorrectionRequired({ root, config }) {
  const value = await readJsonIfPresent(path.join(
    root,
    config.publicOutputs.frozenRescoreJson
  ));
  if (
    value?.status
      !== "K1_FROZEN_MODEL_CORRECT_POPULATION_RESCORE_COMPLETE"
  ) {
    return false;
  }
  const required = 3
    * config.evaluation.families.length
    * config.evaluation.populationIds.length
    * config.evaluation.grains.length
    * config.evaluation.horizonsMonths.length;
  return !Array.isArray(value.metrics) || value.metrics.length !== required;
}

function safeErrorCode(error) {
  return String(error?.code ?? error?.message ?? "unknown_error")
    .replaceAll(/[^A-Za-z0-9_.:-]/gu, "_")
    .slice(0, 240);
}

function buildAssignments(populations) {
  const output = new Map();
  for (const [origin, population] of populations) {
    const core80 = new Set(
      population.selection.populations.CORE80 ?? []
    );
    const core90 = new Set(
      population.selection.populations.CORE90 ?? []
    );
    const ranks = new Map(population.selection.ranked.map((row) => [
      row.standardWorkId,
      row
    ]));
    const eligibleWorks = new Set(
      population.eligiblePairs.map((row) => row.standardWorkId)
    );
    const allWorks = new Set([
      ...eligibleWorks,
      ...ranks.keys()
    ]);
    for (const standardWorkId of allWorks) {
      const group = !eligibleWorks.has(standardWorkId)
        ? "INELIGIBLE_AT_ORIGIN"
        : core80.has(standardWorkId)
          ? "CORE80"
          : core90.has(standardWorkId)
            ? "CORE80_TO_CORE90"
            : "OUTSIDE_CORE90";
      output.set(`${origin}\u0000${standardWorkId}`, {
        group,
        revenueDecile: ranks.get(standardWorkId)?.revenueDecile ?? null
      });
    }
  }
  return output;
}

function buildTrainingAudit({
  config,
  authority,
  histories,
  evaluations,
  populations,
  assignments
}) {
  const historyByKey = new Map(histories.map((row) => [
    `${row.origin}\u0000${row.standardWorkId}`,
    row
  ]));
  const enrichedEvaluations = evaluations.map((row) => {
    const assignment = assignments.get(
      `${row.origin}\u0000${row.standardWorkId}`
    ) ?? {
      group: "INELIGIBLE_AT_ORIGIN",
      revenueDecile: null
    };
    const point = Number(row.learnedGlobalPointEstimate);
    const actual = Number(row.actual);
    const actualPositive = Number(row.actualPositive);
    return {
      ...assignment,
      standardWorkId: String(row.standardWorkId),
      origin: row.origin,
      evaluationFamily: row.evaluationFamily,
      actual,
      actualPositive,
      point,
      trainingLoss: actualPositive > 0
        ? Math.abs(point - actualPositive)
        : 0,
      absoluteError: Math.abs(point - actual),
      falsePositiveError:
        actual === 0 && point > 0 ? point : 0
    };
  });
  const enrichedHistories = histories.map((row) => {
    const assignment = assignments.get(
      `${row.origin}\u0000${row.standardWorkId}`
    ) ?? {
      group: "INELIGIBLE_AT_ORIGIN",
      revenueDecile: null
    };
    const positive = row.salesShareMonthlyHistory.positiveSeries.map(Number);
    const reversal = row.salesShareMonthlyHistory.reversalSeries.map(Number);
    const net = positive.map((value, index) => (
      value - (reversal[index] ?? 0)
    ));
    const mean = average(net);
    const deviation = standardDeviation(net);
    return {
      ...assignment,
      standardWorkId: String(row.standardWorkId),
      origin: row.origin,
      segment: row.segment,
      monthCount: net.length,
      positiveMonthCount: positive.filter((value) => value > 0).length,
      zeroMonthCount: positive.filter((value) => value === 0).length,
      netCash: sum(net),
      coefficientOfVariation:
        Math.abs(mean) > 1e-12 ? deviation / Math.abs(mean) : null
    };
  });
  const pairRows = [...populations.values()].flatMap(
    (population) => population.eligiblePairs.map((row) => ({
      origin: row.origin,
      standardWorkId: row.standardWorkId,
      channelUid: row.channelUid,
      group: row.core80
        ? "CORE80"
        : row.core90
          ? "CORE80_TO_CORE90"
          : "OUTSIDE_CORE90"
    }))
  );
  const groupOrder = [
    "CORE80",
    "CORE80_TO_CORE90",
    "OUTSIDE_CORE90",
    "INELIGIBLE_AT_ORIGIN"
  ];
  const groupAudit = Object.fromEntries(groupOrder.map((group) => [
    group,
    aggregateAuditGroup({
      evaluationRows: enrichedEvaluations.filter(
        (row) => row.group === group
      ),
      historyRows: enrichedHistories.filter(
        (row) => row.group === group
      ),
      pairRows: pairRows.filter((row) => row.group === group),
      evaluationDenominator: enrichedEvaluations,
      historyDenominator: enrichedHistories
    })
  ]));
  const deciles = Object.fromEntries(
    Array.from({ length: 10 }, (_, index) => index + 1).map((decile) => [
      String(decile),
      aggregateAuditGroup({
        evaluationRows: enrichedEvaluations.filter(
          (row) => row.revenueDecile === decile
        ),
        historyRows: enrichedHistories.filter(
          (row) => row.revenueDecile === decile
        ),
        pairRows: [],
        evaluationDenominator: enrichedEvaluations,
        historyDenominator: enrichedHistories
      })
    ])
  );
  const populationSummaries = [...populations.values()].map((item) => ({
    core80WorkCount:
      item.selection.populations.CORE80?.length ?? 0,
    core90WorkCount:
      item.selection.populations.CORE90?.length ?? 0,
    eligibleWorkCount: item.eligibleWorkCount,
    eligiblePairCount: item.eligiblePairCount,
    immatureObservedPairCount: item.immatureObservedPairs.length,
    core80ReferenceCapture:
      item.selection.populationDiagnostics.CORE80
        ?.referenceRevenueCapture ?? null,
    core90ReferenceCapture:
      item.selection.populationDiagnostics.CORE90
        ?.referenceRevenueCapture ?? null
  }));
  return {
    schema:
      "m2.current.core_legacy_population.training_semantics_audit.public.v0.1",
    asOf: config.asOf,
    experiment: config.experiment,
    status: "K0_SCOPE_GOVERNANCE_AND_TRAINING_SEMANTICS_AUDIT_COMPLETE",
    scope: {
      currentM2Target:
        "core_legacy_work_origin_observed_mature_channel_future_sales_share_cash",
      predictionGrain: config.target.predictionGrain,
      actualDefinitionId: config.target.actualDefinitionId,
      minimumCompleteMonths:
        config.eligibility.minimumCompleteMonths,
      tailPoolAllowed: false,
      futureNewWorkIncluded: false,
      futureFirstChannelIncluded: false,
      companyTotalTarget: false,
      buyoutIncluded: false
    },
    implementationAudit: modelImplementationAudit(),
    sourcePopulationAudit: {
      sourceModelId: "M2-WORK-LG01",
      sourceModelNameZh: "人工锚定可学习全局模型",
      sourceModelNameEn: "Human-Anchored Learned Global",
      semantics:
        "audit_of_frozen_historical_training_and_evaluation_rows_before_scope_correction",
      evaluationRowCount: enrichedEvaluations.length,
      historyRowCount: enrichedHistories.length,
      originCount: populations.size,
      groupAudit,
      revenueDeciles: deciles
    },
    dynamicCore: {
      originCount: populationSummaries.length,
      meanCore80WorkCount: average(
        populationSummaries.map((row) => row.core80WorkCount)
      ),
      meanCore90WorkCount: average(
        populationSummaries.map((row) => row.core90WorkCount)
      ),
      meanEligibleWorkCount: average(
        populationSummaries.map((row) => row.eligibleWorkCount)
      ),
      meanEligiblePairCount: average(
        populationSummaries.map((row) => row.eligiblePairCount)
      ),
      meanImmatureObservedPairCount: average(
        populationSummaries.map(
          (row) => row.immatureObservedPairCount
        )
      ),
      meanCore80ReferenceCapture: averageNonNull(
        populationSummaries.map(
          (row) => row.core80ReferenceCapture
        )
      ),
      meanCore90ReferenceCapture: averageNonNull(
        populationSummaries.map(
          (row) => row.core90ReferenceCapture
        )
      )
    },
    authority: {
      sourceAuthorityAvailable: true,
      salesShareRowCount: authority.authority.rowCount,
      workCount: authority.authority.workCount,
      channelCount: authority.authority.channelCount,
      reversalRowCount: authority.authority.reversalRowCount,
      originalReversalRowsDeleted: 0,
      actualDefinitionId: config.target.actualDefinitionId
    },
    finding: {
      existingLearnedGlobalTrainingUsesAllAvailableWorks: true,
      nativeRevenueSampleWeightsSupported: false,
      tailCanDominateCaseCount: (
        groupAudit.OUTSIDE_CORE90.trainingRowShare
        > groupAudit.OUTSIDE_CORE90.actualMagnitudeShare
      ),
      k2RequiredToTestCausality: true
    },
    privacy: {
      privateRowIdentityIncluded: false,
      privatePathIncluded: false,
      aggregateOnly: true
    },
    boundaries: {
      modelTrainingPerformed: false,
      modelParametersChanged: false,
      frozenPredictionsModified: false,
      productionChanged: false,
      laterOriginRead: false,
      finalHoldoutRead: false,
      portfolioModelRankedAgainstWorkModels: false
    }
  };
}

function aggregateAuditGroup({
  evaluationRows,
  historyRows,
  pairRows,
  evaluationDenominator,
  historyDenominator
}) {
  const totalActualMagnitude = sum(
    evaluationDenominator.map((row) => Math.abs(row.actual))
  );
  const totalTrainingLoss = sum(
    evaluationDenominator.map((row) => row.trainingLoss)
  );
  const totalAbsoluteError = sum(
    evaluationDenominator.map((row) => row.absoluteError)
  );
  const totalFalsePositive = sum(
    evaluationDenominator.map((row) => row.falsePositiveError)
  );
  const totalMonths = sum(
    historyDenominator.map((row) => row.monthCount)
  );
  return {
    trainingRowCount: evaluationRows.length,
    trainingRowShare: ratio(
      evaluationRows.length,
      evaluationDenominator.length
    ),
    independentWorkCount: new Set(
      evaluationRows.map((row) => row.standardWorkId)
    ).size,
    workChannelPairCount: pairRows.length,
    distinctWorkChannelOriginCount: new Set(pairRows.map(
      (row) => `${row.origin}|${row.standardWorkId}|${row.channelUid}`
    )).size,
    actualMagnitudeShare: ratio(
      sum(evaluationRows.map((row) => Math.abs(row.actual))),
      totalActualMagnitude
    ),
    positiveTargetRowShare: ratio(
      evaluationRows.filter((row) => row.actualPositive > 0).length,
      evaluationRows.length
    ),
    zeroTargetRowShare: ratio(
      evaluationRows.filter((row) => row.actual === 0).length,
      evaluationRows.length
    ),
    positiveMonthShare: ratio(
      sum(historyRows.map((row) => row.positiveMonthCount)),
      sum(historyRows.map((row) => row.monthCount))
    ),
    zeroMonthShare: ratio(
      sum(historyRows.map((row) => row.zeroMonthCount)),
      sum(historyRows.map((row) => row.monthCount))
    ),
    positiveMonthContribution: ratio(
      sum(historyRows.map((row) => row.positiveMonthCount)),
      totalMonths
    ),
    zeroMonthContribution: ratio(
      sum(historyRows.map((row) => row.zeroMonthCount)),
      totalMonths
    ),
    intermittentOrDormantHistoryShare: ratio(
      historyRows.filter(
        (row) => ["intermittent", "dormant"].includes(row.segment)
      ).length,
      historyRows.length
    ),
    medianMonthlyCoefficientOfVariation: median(
      historyRows.map((row) => row.coefficientOfVariation)
        .filter((value) => value !== null)
    ),
    trainingLossContribution: ratio(
      sum(evaluationRows.map((row) => row.trainingLoss)),
      totalTrainingLoss
    ),
    absoluteErrorContribution: ratio(
      sum(evaluationRows.map((row) => row.absoluteError)),
      totalAbsoluteError
    ),
    zeroActualFalsePositiveErrorContribution: ratio(
      sum(evaluationRows.map((row) => row.falsePositiveError)),
      totalFalsePositive
    )
  };
}

function modelImplementationAudit() {
  return [
    {
      modelId: "M2-WORK-OA03",
      displayNameZh: "作品发生—金额校准模型 v0.3",
      displayNameEn: "Occurrence-Amount Calibration v0.3",
      trulyTrained: true,
      targetAtHistoricalFit:
        "future_work_level_sales_share_cash_on_historical_population",
      loss: "WAPE_and_bias_gated_factor_selection",
      weighting: "case_rows_with_amount_denominator_implicit_revenue_weight",
      zeroMonths: "retained_for_occurrence_and_amount_error",
      occurrenceAndAmountSeparated: true,
      allWorksUsed: true,
      explicitRevenueSampleWeights: false,
      fallbackCanMaskRawCandidate: true,
      deterministicFrozenPredictionRebuild:
        "WORK_TOTAL_ONLY_CHANNEL_DECOMPOSITION_UNAVAILABLE",
      sourceRefs: [
        "scripts/m2-current/run_m2_current_candidate.mjs",
        "src/domain/m2Current/candidate.js"
      ]
    },
    {
      modelId: "M2-WORK-LG01",
      displayNameZh: "人工锚定可学习全局模型",
      displayNameEn: "Human-Anchored Learned Global",
      trulyTrained: true,
      targetAtHistoricalFit:
        "positive_sales_share_cash_with_net_evaluation",
      loss: "positive_row_WAPE_plus_absolute_bias_and_prior_distance",
      weighting: "each_training_case_contributes_absolute_error_no_native_sample_weight",
      zeroMonths: "dense_zero_months_retained_in_origin_visible_history",
      occurrenceAndAmountSeparated: false,
      allWorksUsed: true,
      explicitRevenueSampleWeights: false,
      fallbackCanMaskRawCandidate: true,
      deterministicFrozenPredictionRebuild:
        "AVAILABLE_FROM_FROZEN_ROWS_AND_FOLD_PARAMETERS",
      sourceRefs: [
        "src/domain/m2Current/humanAnchored.js",
        "scripts/m2-current/run_m2_human_anchored_development.mjs"
      ]
    },
    {
      modelId: "M2-WORK-CRMR01",
      displayNameZh: "核心收入人工规则基线 v0.1",
      displayNameEn: "Core-Revenue Manual Rule Baseline v0.1",
      trulyTrained: false,
      targetAtHistoricalFit:
        "development_modelable_sales_share_cash",
      loss: "none_fixed_formula",
      weighting: "not_applicable",
      zeroMonths: "structural_zero_after_first_positive",
      occurrenceAndAmountSeparated: false,
      allWorksUsed: false,
      explicitRevenueSampleWeights: false,
      fallbackCanMaskRawCandidate: false,
      deterministicFrozenPredictionRebuild:
        "AVAILABLE_FROM_FROZEN_FORMULA_AND_AUTHORITY",
      sourceRefs: [
        "src/domain/m2Current/coreRevenueManual.js",
        "scripts/m2-current/core_revenue_manual_private.mjs"
      ]
    },
    {
      modelId: "M2-WORK-TSB01",
      displayNameZh: "人工锚定 TSB 发生模型",
      displayNameEn: "Human-Anchored TSB Occurrence",
      trulyTrained: true,
      targetAtHistoricalFit:
        "historical_work_level_sales_share_cash",
      loss: "nested_occurrence_and_point_error",
      weighting: "case_level_without_native_revenue_sample_weight",
      zeroMonths: "retained_for_occurrence",
      occurrenceAndAmountSeparated: true,
      allWorksUsed: true,
      explicitRevenueSampleWeights: false,
      fallbackCanMaskRawCandidate: true,
      deterministicFrozenPredictionRebuild: "FROZEN_ROWS_IDENTIFIABLE",
      sourceRefs: [
        "src/domain/m2Current/humanAnchoredTsb.js"
      ]
    },
    {
      modelId: "M2-WORK-LC01",
      displayNameZh: "生命周期感知挑战模型 v0.1",
      displayNameEn: "Lifecycle-Aware Challenger v0.1",
      trulyTrained: true,
      targetAtHistoricalFit:
        "historical_work_level_sales_share_cash",
      loss: "occurrence_and_log_amount_outer_development_score",
      weighting: "case_level_without_native_revenue_sample_weight",
      zeroMonths: "retained_for_occurrence",
      occurrenceAndAmountSeparated: true,
      allWorksUsed: true,
      explicitRevenueSampleWeights: false,
      fallbackCanMaskRawCandidate: true,
      deterministicFrozenPredictionRebuild: "FROZEN_ROWS_IDENTIFIABLE",
      sourceRefs: [
        "src/domain/m2Current/lifecycleAware.js"
      ]
    }
  ];
}

function buildPrivatePopulationRows(populations) {
  return [...populations.values()].flatMap((population) => (
    population.eligiblePairs.map((row) => ({
      rowType: "ORIGIN_ELIGIBLE_WORK_CHANNEL",
      experimentId: "M2-EXP-CORE-LEGACY-POPULATION-01",
      origin: row.origin,
      standardWorkId: row.standardWorkId,
      channelUid: row.channelUid,
      firstPositiveMonth: row.firstPositiveMonth,
      workFirstPositiveMonth: row.workFirstPositiveMonth,
      completeMonthCount: row.completeMonthCount,
      workCompleteMonthCount: row.workCompleteMonthCount,
      core80: row.core80,
      core90: row.core90,
      top20: row.top20,
      top50: row.top50,
      referenceRank: row.referenceRank,
      revenueDecile: row.revenueDecile,
      level2Category: row.level2Category,
      level3Category: row.level3Category,
      settlementMechanism: row.settlementMechanism
    }))
  ));
}

async function writePublicK0Outputs({ root, config, audit }) {
  const jsonPath = path.join(
    root,
    config.publicOutputs.trainingAuditJson
  );
  const reportPath = path.join(
    root,
    config.publicOutputs.trainingAuditReport
  );
  await mkdir(path.dirname(jsonPath), { recursive: true });
  await writeFile(
    jsonPath,
    `${JSON.stringify(audit, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    reportPath,
    renderTrainingAudit(audit),
    "utf8"
  );
}

function renderTrainingAudit(result) {
  const groups = result.sourcePopulationAudit.groupAudit;
  const rows = Object.entries(groups).map(([id, value]) => (
    `| ${groupName(id)}（\`${id}\`） | ${value.trainingRowCount} | `
    + `${percent(value.trainingRowShare)} | ${value.independentWorkCount} | `
    + `${value.workChannelPairCount} | ${percent(value.actualMagnitudeShare)} | `
    + `${percent(value.zeroMonthShare)} | `
    + `${percent(value.trainingLossContribution)} | `
    + `${percent(value.absoluteErrorContribution)} |`
  )).join("\n");
  const models = result.implementationAudit.map((item) => (
    `| ${item.displayNameZh}（${item.displayNameEn}，\`${item.modelId}\`） | `
    + `${item.trulyTrained ? "是" : "否"} | ${item.loss} | `
    + `${item.explicitRevenueSampleWeights ? "是" : "否"} | `
    + `${item.deterministicFrozenPredictionRebuild} |`
  )).join("\n");
  return `# M2 训练人口与损失权重审计 v0.1

> 实验：M2 核心老品—已有渠道范围纠偏、冻结重评分与尾部干扰验证 v0.1（M2 Core Legacy Work–Observed Channel Scope Correction, Frozen Rescore and Tail Interference Test v0.1，\`${result.experiment.stableExperimentId}\`）
>
> 阶段状态：范围治理与训练语义审计已完成（\`${result.status}\`）。本阶段没有训练模型、修改冻结预测或读取最终留出集。

## 结论先行

当前 M2 目标已经在新合同中收敛为：预测起点时至少积累 3 个完整账单月的老作品，在同一起点时至少积累 3 个完整账单月的已有 canonical 渠道上，预测未来 3、6、12、36 个月开发可建模分成收入。

现有人工锚定可学习全局模型（Human-Anchored Learned Global，\`M2-WORK-LG01\`）的训练入口使用全部可用作品，没有原生样本权重；因此“尾部在行数上占比高于金额占比”可以被审计，但它是否造成因果性干扰仍须由预注册的固定训练人口消融验证，不能在本阶段提前下结论。

## 当前范围

- 属于 M2：动态 Core80/Core90 老作品 × 起点已有成熟渠道 × 未来分成收入。
- 不属于 M2：未来新增作品、老作品未来首次进入的新渠道、Core 外尾部、买断及其他非分成现金、公司总收入补差。
- 不足 3 个完整月的作品或渠道是“不预测/弃权”，不是“预测为 0”。
- Core80/Core90 是训练、服务和评价人口筛选器，不是公司组合分量。

## 训练人口量化

| 动态人口 | 训练/评价行 | 行占比 | 独立作品 | 作品×渠道-origin 行 | actual 绝对金额占比 | 零收入月占比 | 训练损失贡献 | 绝对误差贡献 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
${rows}

动态 Core80 平均包含 ${number(result.dynamicCore.meanCore80WorkCount)} 部作品，动态 Core90 平均包含 ${number(result.dynamicCore.meanCore90WorkCount)} 部作品。参考窗平均覆盖率分别为 ${percent(result.dynamicCore.meanCore80ReferenceCapture)} 与 ${percent(result.dynamicCore.meanCore90ReferenceCapture)}。这些是起点可见参考窗覆盖，不是未来收入覆盖；未来正确分母覆盖率将在冻结重评分阶段单独计算。

## 现有作品模型训练语义

| 模型 | 真正训练 | 目标/损失 | 原生收入样本权重 | 冻结预测可重建性 |
|---|---|---|---|---|
${models}

## 边界与解释

- 本表审计的是既有冻结训练/评价行的历史语义，未把历史 actual 改写成当前合同。
- 三级分类只用于报告诊断，没有进入 Core 资格或金额倍率。
- 分层收入组合模型 v0.1（Layered Revenue Composition Model v0.1，\`M2-PORT-LRC01\`）属于当前 M2 范围外组合研究（\`OUT_OF_CURRENT_M2_SCOPE_PORTFOLIO_RESEARCH\`），不得进入作品模型排名。
- 下一阶段只对可合法获得的冻结作品预测按正确人口重评分；无法重建的模型/粒度会明确标记不可比较（\`NOT_COMPARABLE\`），不会阻断其他模型。
`;
}

function groupName(id) {
  return ({
    CORE80: "动态 Core80",
    CORE80_TO_CORE90: "动态 Core80 至 Core90",
    OUTSIDE_CORE90: "动态 Core90 以外尾部",
    INELIGIBLE_AT_ORIGIN: "起点不满足成熟资格"
  })[id] ?? id;
}

async function writeNdjson(filePath, rows) {
  const stream = fs.createWriteStream(filePath, {
    encoding: "utf8",
    flags: "w"
  });
  for (const row of rows) {
    if (!stream.write(`${JSON.stringify(row)}\n`)) {
      await new Promise((resolve) => stream.once("drain", resolve));
    }
  }
  await new Promise((resolve, reject) => {
    stream.on("error", reject);
    stream.end(resolve);
  });
}

async function forEachNdjson(filePath, callback) {
  const input = fs.createReadStream(filePath, { encoding: "utf8" });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    if (line.trim() !== "") callback(JSON.parse(line));
  }
}

async function fileBinding(filePath) {
  return {
    sha256: await sha256File(filePath),
    bytes: (await stat(filePath)).size
  };
}

async function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

function git(root, args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true
  });
  if (result.status !== 0) {
    throw new Error(`m2_core_legacy_git_failed:${args.join("_")}`);
  }
  return result.stdout.trim();
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value), 0);
}

function average(values) {
  return values.length === 0 ? null : sum(values) / values.length;
}

function averageNonNull(values) {
  return average(values.filter((value) => value !== null));
}

function standardDeviation(values) {
  if (values.length === 0) return 0;
  const center = average(values);
  return Math.sqrt(average(values.map((value) => (
    (value - center) ** 2
  ))));
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = (sorted.length - 1) / 2;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return (sorted[lower] + sorted[upper]) / 2;
}

function ratio(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : null;
}

function percent(value) {
  return value === null || !Number.isFinite(value)
    ? "不可计算"
    : `${(value * 100).toFixed(2)}%`;
}

function number(value) {
  return value === null || !Number.isFinite(value)
    ? "不可计算"
    : value.toFixed(2);
}
