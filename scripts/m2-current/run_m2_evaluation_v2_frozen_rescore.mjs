import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  assignMaximalAdjacentOriginBlocksV21,
  scoreConditionalAmountRowsV2,
  scoreConditionalAmountRowsV21,
  scoreIntervalRowsV21,
  scoreOccurrenceRowsV2,
  scoreOccurrenceRowsV21,
  scorePairedPointRowsV2,
  scorePointRowsV2,
  scorePointRowsV21,
  scorePortfolioPairedV21,
  scoreRankingRowsV21,
  scoreTopRevenueAttributionV21,
  validateEvaluationIdentityV21
} from "../../src/domain/m2Current/evaluationV2.js";
import {
  scoreM2CurrentProbabilisticRows
} from "../../src/domain/m2Current/metrics.js";

const root = process.cwd();
const preregistration = JSON.parse(fs.readFileSync(
  path.join(root, "config/m2-evaluation-v2-rescore-preregistration.v1.json"),
  "utf8"
));
const contractV21 = JSON.parse(fs.readFileSync(
  path.join(root, "config/m2-evaluation-contract.v2.1.json"),
  "utf8"
));
const modelRegistry = JSON.parse(fs.readFileSync(
  path.join(root, "config/m2-model-registry.v1.json"),
  "utf8"
));
const mode = process.argv.includes("--inventory")
  ? "inventory"
  : process.argv.includes("--rescore-v2-1")
    ? "rescore-v2-1"
  : process.argv.includes("--rescore")
    ? "rescore"
    : null;
if (!mode) {
  console.error(
    "Usage: node scripts/m2-current/run_m2_evaluation_v2_frozen_rescore.mjs "
      + "--inventory|--rescore|--rescore-v2-1"
  );
  process.exit(2);
}

const privateDirectory = path.join(
  root,
  "data/private-output/m2-evaluation-v2-frozen-rescore"
);
fs.mkdirSync(privateDirectory, { recursive: true });

const inventory = [];
for (const binding of preregistration.artifactBindings) {
  const absolutePath = path.join(root, binding.privatePath);
  const stat = fs.statSync(absolutePath);
  const inspection = await inspectNdjson(absolutePath);
  const sha256 = await sha256File(absolutePath);
  const ignored = spawnSync(
    "git",
    ["check-ignore", "--quiet", "--", binding.privatePath],
    { cwd: root, windowsHide: true }
  ).status === 0;
  inventory.push({
    artifactId: binding.artifactId,
    privatePath: binding.privatePath,
    existedBeforeTask:
      stat.mtimeMs < Date.parse(preregistration.taskStartedAt),
    modifiedAt: stat.mtime.toISOString(),
    gitIgnored: ignored,
    sha256,
    digestMatchesPreregistration: sha256 === binding.sha256,
    rowCount: inspection.rowCount,
    rowCountMatchesPreregistration: inspection.rowCount === binding.rowCount,
    fields: [...inspection.fields].sort(),
    familyCounts: Object.fromEntries([...inspection.familyCounts].sort())
  });
}

const inventoryPass = inventory.every((item) =>
  item.existedBeforeTask
  && item.gitIgnored
  && item.digestMatchesPreregistration
  && item.rowCountMatchesPreregistration
);
const inventoryReceipt = {
  schema: "m2.evaluation-v2.frozen-artifact-inventory.private.v1",
  createdAt: new Date().toISOString(),
  taskAnchor: preregistration.taskAnchor,
  status: inventoryPass ? "READY" : "BLOCKED",
  modelExecutionCount: 0,
  trainingCount: 0,
  selectionCount: 0,
  predictionRowsGenerated: 0,
  predictionRowsModified: 0,
  artifacts: inventory
};
const inventoryPath = path.join(
  privateDirectory,
  "M2-evaluation-v2-frozen-artifact-inventory-private-v1.json"
);
fs.writeFileSync(inventoryPath, `${JSON.stringify(inventoryReceipt, null, 2)}\n`);
if (!inventoryPass) {
  console.error(JSON.stringify({ status: "BLOCKED", inventoryPath }));
  process.exit(1);
}
if (mode === "inventory") {
  console.log(JSON.stringify({
    status: "READY",
    artifactCount: inventory.length,
    inventoryPath,
    v2OutcomeRead: false
  }));
  process.exit(0);
}

const datasets = await loadRescoreDatasets(preregistration.artifactBindings);
if (mode === "rescore-v2-1") {
  const resultsV21 = scoreV21Datasets(datasets, inventory);
  const receiptV21 = {
    schema: "m2.evaluation-v2.1.frozen-rescore.private.v1",
    asOf: contractV21.asOf,
    contractVersion: contractV21.version,
    taskAnchor: preregistration.taskAnchor,
    preregistrationSha256: crypto.createHash("sha256")
      .update(fs.readFileSync(
        path.join(root, "config/m2-evaluation-v2-rescore-preregistration.v1.json")
      ))
      .digest("hex"),
    contractSha256: crypto.createHash("sha256")
      .update(fs.readFileSync(
        path.join(root, "config/m2-evaluation-contract.v2.1.json")
      ))
      .digest("hex"),
    status: "COMPLETE_AVAILABLE_GROUPS",
    authorizationCounters: {
      privateRowReadCount: inventory.reduce((sum, item) => sum + item.rowCount, 0),
      modelExecutionCount: 0,
      trainingCount: 0,
      fittingCount: 0,
      tuningCount: 0,
      selectionCount: 0,
      predictionRowsGenerated: 0,
      predictionRowsModified: 0,
      productionChangeCount: 0
    },
    results: resultsV21
  };
  const receiptV21Path = path.join(
    privateDirectory,
    "M2-evaluation-v2.1-frozen-rescore-private-v1.json"
  );
  fs.writeFileSync(receiptV21Path, `${JSON.stringify(receiptV21, null, 2)}\n`);
  console.log(JSON.stringify({
    status: "COMPLETE_AVAILABLE_GROUPS",
    contractVersion: "2.1",
    comparabilityGroupCount: Object.keys(resultsV21).length,
    receiptPath: receiptV21Path
  }));
  process.exit(0);
}
const results = {};
for (const [groupId, group] of Object.entries(datasets)) {
  results[groupId] = scoreGroup(groupId, group);
}
const rescoreReceipt = {
  schema: "m2.evaluation-v2.frozen-rescore.private.v1",
  createdAt: new Date().toISOString(),
  taskAnchor: preregistration.taskAnchor,
  preregistrationSha256: crypto.createHash("sha256")
    .update(fs.readFileSync(
      path.join(root, "config/m2-evaluation-v2-rescore-preregistration.v1.json")
    ))
    .digest("hex"),
  status: "COMPLETE_AVAILABLE_GROUPS",
  authorizationCounters: {
    privateRowReadCount: inventory.reduce((sum, item) => sum + item.rowCount, 0),
    modelExecutionCount: 0,
    trainingCount: 0,
    fittingCount: 0,
    tuningCount: 0,
    selectionCount: 0,
    predictionRowsGenerated: 0,
    predictionRowsModified: 0,
    productionChangeCount: 0
  },
  results
};
const receiptPath = path.join(
  privateDirectory,
  "M2-evaluation-v2-frozen-rescore-private-v1.json"
);
fs.writeFileSync(receiptPath, `${JSON.stringify(rescoreReceipt, null, 2)}\n`);
console.log(JSON.stringify({
  status: "COMPLETE_AVAILABLE_GROUPS",
  comparabilityGroupCount: Object.keys(results).length,
  receiptPath
}));

async function inspectNdjson(filePath) {
  let rowCount = 0;
  const fields = new Set();
  const familyCounts = new Map();
  await forEachNdjson(filePath, (row) => {
    rowCount += 1;
    Object.keys(row).forEach((field) => fields.add(field));
    const family = String(
      row.evaluationFamily ?? row.population ?? row.rowKind ?? "portfolio"
    );
    familyCounts.set(family, (familyCounts.get(family) ?? 0) + 1);
  });
  return { rowCount, fields, familyCounts };
}

async function loadRescoreDatasets(bindings) {
  const byId = Object.fromEntries(bindings.map((item) => [item.artifactId, item]));
  const groups = {
    "CG-WORK-SS-CURRENT-7083": { models: {}, variants: {} },
    "CG-WORK-SS-HA-PRIMARY-12039-H36": { models: {}, variants: {} },
    "CG-WORK-SS-HA-STRICT-74320": { models: {}, variants: {} },
    "CG-WORK-SS-OVERLAP-5203-H36": { models: {}, variants: {} },
    "CG-PORT-SS-30CELLS": { models: {}, variants: {}, grain: "portfolio_origin_horizon" }
  };
  await forEachNdjson(path.join(root, byId["ART-CURRENT-CANONICAL-51384"].privatePath), (row) => {
    if (row.population !== "frozen_served") return;
    addModel(groups["CG-WORK-SS-CURRENT-7083"], "M2-WORK-OA03", row, row.basePointEstimate, {
      variantType: "operational_fallback"
    });
    addModel(groups["CG-WORK-SS-CURRENT-7083"], "M2-WORK-CCR01", row, row.candidatePointEstimate, {
      variantType: "raw_candidate"
    });
  });
  await forEachNdjson(path.join(root, byId["ART-HUMAN-ANCHORED-91562"].privatePath), (row) => {
    if (row.evaluationFamily === "primary") {
      addModel(groups["CG-WORK-SS-HA-PRIMARY-12039-H36"], "M2-WORK-MAN01", row, row.manualPointEstimate, {
        variantType: "research_comparator"
      });
      addModel(groups["CG-WORK-SS-HA-PRIMARY-12039-H36"], "M2-WORK-OR01", row, row.occurrenceReversalPointEstimate, {
        variantType: "raw_candidate"
      });
      addModel(groups["CG-WORK-SS-HA-PRIMARY-12039-H36"], "M2-WORK-LG01::historical_original", row, row.learnedGlobalPointEstimate, {
        variantType: "historical_original_baseline",
        quantiles: row.quantiles
      });
    }
  });
  await forEachNdjson(path.join(root, byId["ART-TSB-86359"].privatePath), (row) => {
    const group = row.evaluationFamily === "primary_36_month"
      ? groups["CG-WORK-SS-HA-PRIMARY-12039-H36"]
      : row.evaluationFamily === "strict_auxiliary"
        ? groups["CG-WORK-SS-HA-STRICT-74320"]
        : null;
    if (!group) return;
    addModel(group, "M2-WORK-LG01", row, row.selectedPipelinePointEstimate, {
      variantType: "research_baseline"
    });
    addModel(group, "M2-WORK-TSB01", row, row.rawTsbPointEstimate, {
      variantType: "raw_candidate",
      occurrenceProbability: row.occurrenceProbability,
      occurrenceActual: row.actualPositive
    });
    addModel(group, "M2-WORK-TSBB01", row, row.blendCandidatePointEstimate, {
      variantType: "raw_candidate"
    });
    addModel(group, "M2-WORK-TSBB01::selected_pipeline", row, row.selectedPipelinePointEstimate, {
      variantType: "selected_pipeline"
    });
  });
  await forEachNdjson(path.join(root, byId["ART-LIFECYCLE-91562"].privatePath), (row) => {
    const group = row.evaluationFamily === "primary"
      ? groups["CG-WORK-SS-HA-PRIMARY-12039-H36"]
      : row.evaluationFamily === "strict_rolling"
        ? groups["CG-WORK-SS-HA-STRICT-74320"]
        : row.evaluationFamily === "v03_overlap_cross_work"
          ? groups["CG-WORK-SS-OVERLAP-5203-H36"]
          : null;
    if (!group) return;
    if (row.evaluationFamily === "v03_overlap_cross_work") {
      addModel(group, "M2-WORK-OA03", row, row.v03PointEstimate, {
        variantType: "operational_fallback"
      });
      addModel(group, "M2-WORK-LG01", row, row.baselinePointEstimate, {
        variantType: "research_baseline"
      });
    }
    addModel(group, "M2-WORK-LC01", row, row.rawLifecyclePointEstimate, {
      variantType: "raw_candidate",
      occurrenceProbability: row.occurrenceProbability,
      occurrenceActual: row.actualPositive,
      conditionalAmountPrediction: row.conditionalPositiveAmount,
      conditionalActual: row.actualPositive,
      actualPositiveAmount: row.actualPositive,
      reversalPointEstimate: row.reversalPointEstimate,
      lifecycleState: row.lifecycleState
    });
    addModel(group, "M2-WORK-LC01::selected_pipeline", row, row.pointEstimate, {
      variantType: "selected_pipeline",
      lifecycleState: row.lifecycleState
    });
  });
  await forEachNdjson(path.join(root, byId["ART-CHANNEL-SCALAR-395904"].privatePath), (row) => {
    if (row.rowKind !== "work") return;
    const group = row.evaluationFamily === "primary"
      ? groups["CG-WORK-SS-HA-PRIMARY-12039-H36"]
      : row.evaluationFamily === "strict_rolling"
        ? groups["CG-WORK-SS-HA-STRICT-74320"]
        : null;
    if (!group) return;
    addModel(group, "M2-CHAN-SCL01", row, row.ablationPoints.A6, {
      variantType: "raw_candidate"
    });
  });
  await forEachNdjson(path.join(root, byId["ART-PORTFOLIO-30"].privatePath), (row) => {
    addModel(groups["CG-PORT-SS-30CELLS"], "M2-PORT-ETS01", row, row.pointEstimate, {
      variantType: "portfolio_reference"
    });
    addModel(groups["CG-PORT-SS-30CELLS"], "M2-BASE-CLASSIC01::M2-EXP-PORTFOLIO-ETS-01:SNAIVE", row, row.seasonalNaivePointEstimate, {
      variantType: "research_comparator"
    });
  });
  return groups;
}

function addModel(group, modelId, source, pointEstimate, extras) {
  const rows = group.models[modelId] ?? [];
  const horizon = Number(source.horizonMonths);
  const origin = source.origin;
  const work = source.standardWorkId ?? "__PORTFOLIO__";
  rows.push({
    caseKey: `${work}|${origin}|${horizon}`,
    standardWorkId: work,
    origin,
    horizonMonths: horizon,
    actual: source.actual,
    pointEstimate,
    segment: source.segment ?? source.legacySegment ?? null,
    lifecycleState: extras.lifecycleState ?? null,
    occurrenceProbability: extras.occurrenceProbability,
    occurrenceActual: extras.occurrenceActual,
    actualPositive: extras.actualPositive ?? extras.occurrenceActual,
    conditionalAmountPrediction: extras.conditionalAmountPrediction,
    conditionalActual: extras.conditionalActual,
    actualPositiveAmount: extras.actualPositiveAmount,
    reversalPointEstimate: extras.reversalPointEstimate,
    quantiles: extras.quantiles
  });
  group.models[modelId] = rows;
  group.variants[modelId] = extras.variantType;
}

function scoreV21Datasets(datasets, artifactInventory) {
  const results = {};
  for (const [groupId, group] of Object.entries(datasets)) {
    const groupAuthority = modelRegistry.comparabilityGroups.find(
      (item) => item.comparableGroupId === groupId
    );
    if (!groupAuthority) {
      throw new Error(`m2_evaluation_v2_1_comparability_group_missing:${groupId}`);
    }
    const models = {};
    for (const [modelId, rows] of Object.entries(group.models)) {
      const artifact = artifactForModelV21(groupId, modelId, artifactInventory);
      const pointIdentity = evaluationIdentityV21(
        contractV21.pointMetrics,
        groupAuthority,
        artifact
      );
      const point = scorePointRowsV21(rows);
      models[modelId] = {
        variantType: group.variants[modelId],
        pointIdentity,
        pooledCrossHorizonDiagnostic: point,
        mase: {
          status: "NOT_COMPUTABLE_PRE_ORIGIN_SCALE_MISSING",
          value: null,
          strictlyPreOriginScaleAvailable: false
        },
        byHorizon: scorePointSlicesV21(rows, "horizonMonths"),
        byMaximalAdjacentOriginTimeBlock: scorePointSlicesV21(
          assignMaximalAdjacentOriginBlocksV21(rows),
          "timeBlock"
        ),
        topRevenueAttribution: group.grain === "portfolio_origin_horizon"
          ? null
          : scoreTopRevenueAttributionV21(rows, privacyOptionsV21()),
        occurrence: rows.every((row) =>
          row.occurrenceProbability !== undefined
          && row.actualPositive !== undefined
        ) ? {
          identity: evaluationIdentityV21(
            contractV21.occurrenceMetrics,
            groupAuthority,
            artifact
          ),
          score: scoreOccurrenceRowsV21(rows, {
            epsilon: preregistration.numericPolicy.probabilityClipEpsilon,
            diagnosticThreshold: 0.5,
            frozenTrainingBaseRate: null
          })
        } : null,
        conditionalAmount: rows.every((row) =>
          row.conditionalAmountPrediction !== undefined
          && row.actualPositiveAmount !== undefined
          && row.reversalPointEstimate !== undefined
        ) ? {
          identity: evaluationIdentityV21(
            contractV21.conditionalAmountMetrics,
            groupAuthority,
            artifact
          ),
          score: scoreConditionalAmountRowsV21(rows)
        } : null,
        intervals: rows.every((row) => row.quantiles) ? {
          identity: evaluationIdentityV21(
            contractV21.intervalMetrics,
            groupAuthority,
            artifact
          ),
          score: scoreIntervalRowsV21(rows, {
            quantileGrid: contractV21.intervalMetrics.nativeQuantileGrid,
            ...privacyOptionsV21()
          })
        } : null
      };
    }
    const fallbackId = chooseFallback(groupId, group.models);
    const paired = {};
    if (fallbackId) {
      for (const [modelId, rows] of Object.entries(group.models)) {
        if (modelId === fallbackId) continue;
        try {
          const pointFva = scorePairedPointRowsV2(rows, group.models[fallbackId]);
          const pair = {
            versus: fallbackId,
            status: "STRICT_EXACT_CASE_PAIR",
            pointFva,
            workClusterInterval: pointFvaBootstrapV21Runner(
              rows,
              group.models[fallbackId],
              group.grain === "portfolio_origin_horizon"
                ? "origin"
                : "standardWorkId"
            )
          };
          if (modelId === "M2-CHAN-SCL01") {
            pair.ranking = {
              identity: evaluationIdentityV21(
                contractV21.rankingMetrics,
                groupAuthority,
                artifactForModelV21(groupId, modelId, artifactInventory)
              ),
              score: scoreRankingRowsV21(
                rows,
                group.models[fallbackId],
                {
                  ...privacyOptionsV21(),
                  topFractions: contractV21.topRevenueAttribution.fractions,
                  seed: contractV21.uncertainty.seed,
                  bootstrapIterations: contractV21.uncertainty.bootstrapIterations
                }
              )
            };
          }
          paired[modelId] = pair;
        } catch (error) {
          if (
            error.message !== "m2_evaluation_v2_pair_mismatch"
            && error.message !== "m2_evaluation_v2_1_pair_mismatch"
          ) throw error;
          paired[modelId] = {
            versus: fallbackId,
            status: "NOT_COMPARABLE_CASE_SET_MISMATCH"
          };
        }
      }
    }
    const portfolio = group.grain === "portfolio_origin_horizon"
      ? {
        identity: evaluationIdentityV21(
          contractV21.portfolioMetrics,
          groupAuthority,
          artifactForModelV21(
            groupId,
            "M2-PORT-ETS01",
            artifactInventory
          )
        ),
        score: scorePortfolioPairedV21(
          group.models["M2-PORT-ETS01"],
          group.models["M2-BASE-CLASSIC01::M2-EXP-PORTFOLIO-ETS-01:SNAIVE"],
          {
            minimumOriginCount:
              contractV21.publicPrivacy.minimumPortfolioOriginCount,
            seed: contractV21.uncertainty.seed,
            bootstrapIterations: contractV21.uncertainty.bootstrapIterations
          }
        )
      }
      : null;
    results[groupId] = {
      comparisonClass: groupAuthority.comparisonClass,
      grain: group.grain ?? "work_origin_horizon",
      fallbackId,
      models,
      paired,
      portfolio
    };
  }
  return results;
}

function scorePointSlicesV21(rows, field) {
  const groups = new Map();
  for (const row of rows) {
    const key = String(row[field] ?? "");
    const values = groups.get(key) ?? [];
    values.push(row);
    groups.set(key, values);
  }
  return Object.fromEntries([...groups].sort(([left], [right]) =>
    left.localeCompare(right)
  ).map(([key, values]) => {
    if (
      values.length < contractV21.publicPrivacy.minimumCaseCount
      || new Set(values.map((row) => row.standardWorkId)).size
        < contractV21.publicPrivacy.minimumWorkCount
    ) {
      return [key, {
        status: contractV21.publicPrivacy.suppressionStatus,
        caseCount: values.length,
        workCount: new Set(values.map((row) => row.standardWorkId)).size
      }];
    }
    return [key, scorePointRowsV21(values)];
  }));
}

function evaluationIdentityV21(metric, group, artifact) {
  return validateEvaluationIdentityV21({
    metricDefinitionId: metric.metricDefinitionId,
    metricDefinitionVersion: metric.metricDefinitionVersion,
    target: group.target,
    cashAuthority: group.cashAuthority,
    actualDefinition: group.actualDefinition,
    asOfContract: group.asOfContract,
    grain: group.grain,
    populationId: group.populationId,
    horizonContract: group.horizons,
    evaluationFamily: group.evaluationFamily,
    artifactId: artifact.artifactId,
    artifactSha256: artifact.sha256
  });
}

function artifactForModelV21(groupId, modelId, artifactInventory) {
  let artifactId;
  if (groupId === "CG-WORK-SS-CURRENT-7083") {
    artifactId = "ART-CURRENT-CANONICAL-51384";
  } else if (groupId === "CG-PORT-SS-30CELLS") {
    artifactId = "ART-PORTFOLIO-30";
  } else if (modelId.startsWith("M2-CHAN-SCL01")) {
    artifactId = "ART-CHANNEL-SCALAR-395904";
  } else if (modelId.startsWith("M2-WORK-LC01")) {
    artifactId = "ART-LIFECYCLE-91562";
  } else if (
    modelId.startsWith("M2-WORK-TSB")
    || modelId === "M2-WORK-LG01"
  ) {
    artifactId = groupId === "CG-WORK-SS-OVERLAP-5203-H36"
      ? "ART-LIFECYCLE-91562"
      : "ART-TSB-86359";
  } else if (modelId === "M2-WORK-OA03") {
    artifactId = "ART-LIFECYCLE-91562";
  } else {
    artifactId = "ART-HUMAN-ANCHORED-91562";
  }
  const artifact = artifactInventory.find((item) => item.artifactId === artifactId);
  if (!artifact) throw new Error(`m2_evaluation_v2_1_artifact_missing:${artifactId}`);
  return artifact;
}

function privacyOptionsV21() {
  return {
    minimumCaseCount: contractV21.publicPrivacy.minimumCaseCount,
    minimumWorkCount: contractV21.publicPrivacy.minimumWorkCount
  };
}

function pointFvaBootstrapV21Runner(candidate, fallback, clusterField) {
  return clusterBootstrap(
    candidate,
    fallback,
    clusterField,
    contractV21.uncertainty.seed,
    contractV21.uncertainty.bootstrapIterations
  );
}

function scoreGroup(groupId, group) {
  const scoredModels = {};
  for (const [modelId, rows] of Object.entries(group.models)) {
    const score = scorePointRowsV2(rows);
    const byHorizon = safeGroupScore(rows, "horizonMonths");
    const byOrigin = safeGroupScore(rows, "origin");
    const byTimeBlock = scoreTimeBlocks(rows);
    const bySegment = rows.every((row) => row.segment)
      ? safeGroupScore(rows, "segment")
      : null;
    const byLifecycle = rows.every((row) => row.lifecycleState)
      ? safeGroupScore(rows, "lifecycleState")
      : null;
    const occurrence = rows.every((row) => row.occurrenceProbability !== undefined)
      ? scoreOccurrenceRowsV2(rows, {
        epsilon: preregistration.numericPolicy.probabilityClipEpsilon,
        thresholds: preregistration.occurrenceMetrics.thresholds
      })
      : null;
    const conditionalAmount = rows.every((row) =>
      row.conditionalAmountPrediction !== undefined
      && row.reversalPointEstimate !== undefined
    ) ? scoreConditionalAmountRowsV2(rows) : null;
    const probabilistic = rows.every((row) => row.quantiles)
      ? scoreM2CurrentProbabilisticRows(
        rows,
        [0.05, 0.1, 0.2, 0.5, 0.8, 0.9, 0.95]
      )
      : null;
    scoredModels[modelId] = {
      variantType: group.variants[modelId],
      pooledDiagnostic: score,
      byHorizon,
      byOrigin,
      byTimeBlock,
      bySegment,
      byLifecycle,
      topRevenuePosthocAttribution: topRevenueAttribution(rows),
      rankingDiagnostic: rankingDiagnostic(rows),
      businessLossSensitivity: businessLoss(rows),
      occurrence,
      conditionalAmount,
      probabilistic
    };
  }
  const fallbackId = chooseFallback(groupId, group.models);
  const paired = {};
  if (fallbackId) {
    for (const [modelId, rows] of Object.entries(group.models)) {
      if (modelId === fallbackId || rows.length !== group.models[fallbackId].length) continue;
      paired[modelId] = {
        versus: fallbackId,
        ...scorePairedPointRowsV2(rows, group.models[fallbackId]),
        clusterBootstrap: clusterBootstrap(
          rows,
          group.models[fallbackId],
          group.grain === "portfolio_origin_horizon"
            ? "origin"
            : "standardWorkId",
          preregistration.uncertainty.seed,
          preregistration.uncertainty.workClusterBootstrapIterations
        )
      };
    }
  }
  return {
    grain: group.grain ?? "work_origin_horizon",
    fallbackId,
    modelCount: Object.keys(group.models).length,
    models: scoredModels,
    paired
  };
}

function chooseFallback(groupId, models) {
  if (models["M2-WORK-OA03"]) return "M2-WORK-OA03";
  if (models["M2-WORK-LG01"]) return "M2-WORK-LG01";
  if (groupId === "CG-PORT-SS-30CELLS") {
    return "M2-BASE-CLASSIC01::M2-EXP-PORTFOLIO-ETS-01:SNAIVE";
  }
  return null;
}

function topRevenueAttribution(rows) {
  const byWork = new Map();
  for (const row of rows) {
    const value = byWork.get(row.standardWorkId) ?? {
      actual: 0, absoluteError: 0, count: 0
    };
    value.actual += Math.abs(Number(row.actual));
    value.absoluteError += Math.abs(Number(row.pointEstimate) - Number(row.actual));
    value.count += 1;
    byWork.set(row.standardWorkId, value);
  }
  const ordered = [...byWork].sort((a, b) =>
    b[1].actual - a[1].actual || a[0].localeCompare(b[0])
  );
  const actualTotal = ordered.reduce((sum, [, value]) => sum + value.actual, 0);
  const errorTotal = ordered.reduce((sum, [, value]) => sum + value.absoluteError, 0);
  return Object.fromEntries(preregistration.posthocTopRevenueAttribution.fractions.map((fraction) => {
    const count = Math.max(1, Math.ceil(ordered.length * fraction));
    const top = ordered.slice(0, count);
    const topActual = top.reduce((sum, [, value]) => sum + value.actual, 0);
    const topError = top.reduce((sum, [, value]) => sum + value.absoluteError, 0);
    return [String(fraction), {
      posthocOnly: true,
      workCount: count,
      actualCashShare: topActual / actualTotal,
      absoluteErrorShare: topError / errorTotal,
      outsideTopWape: (errorTotal - topError) / (actualTotal - topActual)
    }];
  }));
}

function scoreTimeBlocks(rows) {
  const origins = [...new Set(rows.map((row) => row.origin))].sort();
  const blockByOrigin = new Map();
  let blockStart = origins[0];
  let previous = origins[0];
  let blockIndex = 1;
  for (const origin of origins) {
    if (origin !== origins[0] && monthDistance(previous, origin) !== 1) {
      blockIndex += 1;
      blockStart = origin;
    }
    blockByOrigin.set(origin, { blockIndex, blockStart });
    previous = origin;
  }
  const blockEnds = new Map();
  for (const origin of origins) {
    blockEnds.set(blockByOrigin.get(origin).blockIndex, origin);
  }
  const tagged = rows.map((row) => {
    const block = blockByOrigin.get(row.origin);
    return {
      ...row,
      timeBlock: `B${block.blockIndex}:${block.blockStart}..${blockEnds.get(block.blockIndex)}`
    };
  });
  return safeGroupScore(tagged, "timeBlock");
}

function safeGroupScore(rows, field) {
  const groups = new Map();
  for (const row of rows) {
    const key = String(row[field] ?? "");
    const values = groups.get(key) ?? [];
    values.push(row);
    groups.set(key, values);
  }
  return Object.fromEntries([...groups].sort(([a], [b]) => a.localeCompare(b))
    .map(([key, values]) => {
      try {
        return [key, scorePointRowsV2(values)];
      } catch (error) {
        if (error.message !== "m2_evaluation_v2_actual_denominator_zero") throw error;
        return [key, {
          status: "UNDEFINED_ZERO_ACTUAL_DENOMINATOR",
          caseCount: values.length,
          wape: null,
          signedBias: null,
          absoluteBias: null
        }];
      }
    }));
}

function monthDistance(left, right) {
  const [leftYear, leftMonth] = left.split("-").map(Number);
  const [rightYear, rightMonth] = right.split("-").map(Number);
  return (rightYear - leftYear) * 12 + rightMonth - leftMonth;
}

function rankingDiagnostic(rows) {
  const cells = new Map();
  for (const row of rows) {
    const key = `${row.origin}|${row.horizonMonths}`;
    const values = cells.get(key) ?? [];
    values.push(row);
    cells.set(key, values);
  }
  const spearman = [];
  for (const values of cells.values()) {
    if (values.length < 2) continue;
    const actualRanks = ranks(values.map((row) => Number(row.actual)));
    const predictedRanks = ranks(values.map((row) => Number(row.pointEstimate)));
    spearman.push(correlation(actualRanks, predictedRanks));
  }
  return {
    diagnosticOnly: true,
    cellCount: spearman.length,
    meanSpearman: spearman.length
      ? spearman.reduce((sum, value) => sum + value, 0) / spearman.length
      : null
  };
}

function businessLoss(rows) {
  return Object.fromEntries(
    preregistration.businessLossSensitivity.underToOverCostRatios.map(([under, over]) => [
      `${under}:${over}`,
      rows.reduce((sum, row) => {
        const error = Number(row.pointEstimate) - Number(row.actual);
        return sum + (error < 0 ? -error * under : error * over);
      }, 0) / rows.length
    ])
  );
}

function clusterBootstrap(candidate, fallback, clusterField, seed, iterations) {
  const fallbackByKey = new Map(fallback.map((row) => [row.caseKey, row]));
  const clusters = new Map();
  for (const row of candidate) {
    const other = fallbackByKey.get(row.caseKey);
    const clusterId = row[clusterField];
    const value = clusters.get(clusterId) ?? {
      candidateError: 0, fallbackError: 0, denominator: 0
    };
    value.candidateError += Math.abs(Number(row.pointEstimate) - Number(row.actual));
    value.fallbackError += Math.abs(Number(other.pointEstimate) - Number(row.actual));
    value.denominator += Math.abs(Number(row.actual));
    clusters.set(clusterId, value);
  }
  const values = [...clusters.values()];
  const random = mulberry32(seed);
  const estimates = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let candidateError = 0; let fallbackError = 0; let denominator = 0;
    for (let index = 0; index < values.length; index += 1) {
      const value = values[Math.floor(random() * values.length)];
      candidateError += value.candidateError;
      fallbackError += value.fallbackError;
      denominator += value.denominator;
    }
    estimates.push((fallbackError - candidateError) / denominator);
  }
  estimates.sort((a, b) => a - b);
  return {
    unit: clusterField,
    iterations,
    seed,
    absoluteWapeFvaLower95: quantile(estimates, 0.025),
    absoluteWapeFvaUpper95: quantile(estimates, 0.975)
  };
}

function ranks(values) {
  const ordered = values.map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value || a.index - b.index);
  const result = Array(values.length);
  for (let start = 0; start < ordered.length;) {
    let end = start + 1;
    while (end < ordered.length && ordered[end].value === ordered[start].value) end += 1;
    const rank = (start + end - 1) / 2;
    for (let index = start; index < end; index += 1) {
      result[ordered[index].index] = rank;
    }
    start = end;
  }
  return result;
}

function correlation(left, right) {
  const leftMean = left.reduce((sum, value) => sum + value, 0) / left.length;
  const rightMean = right.reduce((sum, value) => sum + value, 0) / right.length;
  let numerator = 0; let leftSq = 0; let rightSq = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index] - leftMean;
    const b = right[index] - rightMean;
    numerator += a * b;
    leftSq += a * a;
    rightSq += b * b;
  }
  return leftSq && rightSq ? numerator / Math.sqrt(leftSq * rightSq) : 0;
}

function quantile(values, probability) {
  const index = (values.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return values[lower] * (upper - index) + values[upper] * (index - lower);
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

async function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

async function forEachNdjson(filePath, callback) {
  const input = fs.createReadStream(filePath, { encoding: "utf8" });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    callback(JSON.parse(line));
  }
}
