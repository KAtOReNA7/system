import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  groupScorePointRowsV2,
  scoreConditionalAmountRowsV2,
  scoreOccurrenceRowsV2,
  scorePairedPointRowsV2,
  scorePointRowsV2
} from "../../src/domain/m2Current/evaluationV2.js";
import {
  scoreM2CurrentProbabilisticRows
} from "../../src/domain/m2Current/metrics.js";

const root = process.cwd();
const preregistration = JSON.parse(fs.readFileSync(
  path.join(root, "config/m2-evaluation-v2-rescore-preregistration.v1.json"),
  "utf8"
));
const mode = process.argv.includes("--inventory")
  ? "inventory"
  : process.argv.includes("--rescore")
    ? "rescore"
    : null;
if (!mode) {
  console.error("Usage: node scripts/m2-current/run_m2_evaluation_v2_frozen_rescore.mjs --inventory|--rescore");
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
      addModel(groups["CG-WORK-SS-HA-PRIMARY-12039-H36"], "M2-WORK-LG01-ORIGINAL", row, row.learnedGlobalPointEstimate, {
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
    addModel(group, "M2-WORK-LG01", row, row.learnedGlobalPointEstimate, {
      variantType: "research_baseline"
    });
    addModel(group, "M2-WORK-TSB01", row, row.rawTsbPointEstimate, {
      variantType: "raw_candidate",
      occurrenceProbability: row.occurrenceProbability
    });
    addModel(group, "M2-WORK-TSBB01", row, row.blendCandidatePointEstimate, {
      variantType: "raw_candidate"
    });
    addModel(group, "M2-WORK-TSBB01-SELECTED", row, row.selectedPipelinePointEstimate, {
      variantType: "selected_pipeline"
    });
  });
  await forEachNdjson(path.join(root, byId["ART-LIFECYCLE-91562"].privatePath), (row) => {
    const group = row.evaluationFamily === "primary"
      ? groups["CG-WORK-SS-HA-PRIMARY-12039-H36"]
      : row.evaluationFamily === "strict_rolling"
        ? groups["CG-WORK-SS-HA-STRICT-74320"]
        : row.evaluationFamily === "overlap"
          ? groups["CG-WORK-SS-OVERLAP-5203-H36"]
          : null;
    if (!group) return;
    if (row.evaluationFamily === "overlap") {
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
      conditionalAmountPrediction: row.conditionalPositiveAmount,
      reversalPointEstimate: row.reversalPointEstimate,
      lifecycleState: row.lifecycleState
    });
    addModel(group, "M2-WORK-LC01-SELECTED", row, row.pointEstimate, {
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
    addModel(groups["CG-PORT-SS-30CELLS"], "M2-EXP-PORTFOLIO-V05:SNAIVE", row, row.seasonalNaivePointEstimate, {
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
    conditionalAmountPrediction: extras.conditionalAmountPrediction,
    reversalPointEstimate: extras.reversalPointEstimate,
    quantiles: extras.quantiles
  });
  group.models[modelId] = rows;
  group.variants[modelId] = extras.variantType;
}

function scoreGroup(groupId, group) {
  const scoredModels = {};
  for (const [modelId, rows] of Object.entries(group.models)) {
    const score = scorePointRowsV2(rows);
    const byHorizon = groupScorePointRowsV2(rows, "horizonMonths");
    const byOrigin = groupScorePointRowsV2(rows, "origin");
    const bySegment = rows.every((row) => row.segment)
      ? groupScorePointRowsV2(rows, "segment")
      : null;
    const byLifecycle = rows.every((row) => row.lifecycleState)
      ? groupScorePointRowsV2(rows, "lifecycleState")
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
      ? scoreM2CurrentProbabilisticRows(rows)
      : null;
    scoredModels[modelId] = {
      variantType: group.variants[modelId],
      pooledDiagnostic: score,
      byHorizon,
      byOrigin,
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
        workClusterBootstrap: workClusterBootstrap(
          rows,
          group.models[fallbackId],
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
  if (groupId === "CG-PORT-SS-30CELLS") return "M2-EXP-PORTFOLIO-V05:SNAIVE";
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

function workClusterBootstrap(candidate, fallback, seed, iterations) {
  const fallbackByKey = new Map(fallback.map((row) => [row.caseKey, row]));
  const clusters = new Map();
  for (const row of candidate) {
    const other = fallbackByKey.get(row.caseKey);
    const value = clusters.get(row.standardWorkId) ?? {
      candidateError: 0, fallbackError: 0, denominator: 0
    };
    value.candidateError += Math.abs(Number(row.pointEstimate) - Number(row.actual));
    value.fallbackError += Math.abs(Number(other.pointEstimate) - Number(row.actual));
    value.denominator += Math.abs(Number(row.actual));
    clusters.set(row.standardWorkId, value);
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
    unit: "standardWorkId",
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
