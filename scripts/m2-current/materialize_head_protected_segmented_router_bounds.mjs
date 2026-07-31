#!/usr/bin/env node
import { createReadStream } from "node:fs";
import {
  mkdir,
  readFile,
  rename,
  stat,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

import {
  deriveHpsrResidualBounds,
  HPSR_EXPERIMENT_ID,
  HPSR_MODEL_ID
} from "../../src/domain/m2Current/headProtectedSegmentedRouter.js";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);
const CONFIG_PATH =
  "config/m2-current-head-protected-segmented-router.v0.1.json";

export async function loadOrRebuildHpsrResidualBoundCache({
  cachePath,
  rebuild,
  forceRebuild = false
}) {
  if (!forceRebuild && await fileExists(cachePath)) {
    const value = JSON.parse(await readFile(cachePath, "utf8"));
    validatePrivateBoundArtifact(value);
    return Object.freeze({
      cacheStatus: "CACHE_HIT",
      value: Object.freeze(value)
    });
  }
  const rebuilt = await rebuild();
  validatePrivateBoundArtifact(rebuilt);
  await writeJsonAtomic(cachePath, rebuilt);
  return Object.freeze({
    cacheStatus: "CACHE_MISS_REBUILT",
    value: Object.freeze(rebuilt)
  });
}

export async function materializeHpsrResidualBounds({
  root = ROOT,
  forceRebuild = false
} = {}) {
  const config = await readJson(path.join(root, CONFIG_PATH));
  const semantics = await readJson(path.join(
    root,
    config.publicOutputs.openedOriginSemanticsJson
  ));
  const cachePath = resolvePrivatePath(
    root,
    config.privateCapability.residualBoundArtifact,
    "m2-head-protected-segmented-router"
  );
  const result = await loadOrRebuildHpsrResidualBoundCache({
    cachePath,
    forceRebuild,
    rebuild: async () => (
      await rebuildFromFrozenDevelopmentCaches({
        root,
        config,
        semantics
      })
    )
  });
  return Object.freeze({
    schema:
      "m2.current.head_protected_segmented_router."
        + "residual_bound_materialization_stdout.v0.1",
    status: result.value.status,
    cacheStatus: result.cacheStatus,
    sourcePopulation: result.value.sourcePopulation,
    derivationOriginRange: result.value.derivationOriginRange,
    inputRowCount: result.value.inputRowCount,
    finiteSupportRowCount: result.value.finiteSupportRowCount,
    excludedNonfiniteRowCount:
      result.value.excludedNonfiniteRowCount,
    positiveBaseSupportRowCount:
      result.value.positiveBaseSupportRowCount,
    privateParameterValuesFrozen: true,
    privateParameterValuesPrinted: false,
    newLaterOriginActualValueRead: false,
    laterOriginOutcomeUsed: false,
    finalHoldoutOutcomeUsed: false
  });
}

async function rebuildFromFrozenDevelopmentCaches({
  root,
  config,
  semantics
}) {
  const source = config.privateCapability.boundSourceCaches;
  const frozenLg01Path = resolvePrivatePath(
    root,
    source.frozenLg01Rows,
    "m2-core-legacy-horizon-amount"
  );
  const frozenCham01Path = resolvePrivatePath(
    root,
    source.frozenCham01PredictionRows,
    "m2-core-legacy-horizon-amount"
  );
  if (
    !await fileExists(frozenLg01Path)
    || !await fileExists(frozenCham01Path)
  ) {
    throw new Error(
      "hpsr_residual_bound_upstream_cache_missing_rebuildable"
    );
  }
  const baseByCase = new Map();
  await forEachNdjson(frozenLg01Path, (row) => {
    if (Number(row.horizonMonths) !== 3) return;
    baseByCase.set(caseKey(row), nullableNumber(row.pointEstimate));
  });
  const maximumOpenedOrigin =
    semantics.openedSemantics.maxActualValueOpenedOrigin;
  const developmentRows = [];
  await forEachNdjson(frozenCham01Path, (row) => {
    if (
      row.armId !== "B3"
      || row.evaluationFamily !== "STRICT_ROLLING"
      || row.populationId !== "CORE80"
      || Number(row.horizonMonths) !== 3
    ) {
      return;
    }
    if (String(row.origin) > maximumOpenedOrigin) {
      throw new Error(
        "hpsr_residual_bound_later_origin_cache_row_forbidden"
      );
    }
    const basePointEstimate = baseByCase.get(caseKey(row));
    if (basePointEstimate === undefined) {
      throw new Error("hpsr_residual_bound_lg01_join_missing");
    }
    developmentRows.push({
      origin: String(row.origin),
      basePointEstimate,
      rawPointEstimate: nullableNumber(row.pointEstimate)
    });
  });
  const bounds = deriveHpsrResidualBounds(developmentRows, {
    maximumOpenedDevelopmentOrigin: maximumOpenedOrigin,
    positiveBaseQuantile:
      config.residualBoundaryFreeze.positiveBaseFloor.quantile,
    lowerResidualQuantile:
      config.residualBoundaryFreeze.normalizedResidualBounds
        .lowerQuantile,
    upperResidualQuantile:
      config.residualBoundaryFreeze.normalizedResidualBounds
        .upperQuantile
  });
  return {
    schema:
      "m2.current.head_protected_segmented_router."
        + "residual_bounds.private.v0.1",
    artifactClass: "PRIVATE_DERIVED_CACHE",
    tracked: false,
    rebuildable: true,
    experimentId: HPSR_EXPERIMENT_ID,
    modelId: HPSR_MODEL_ID,
    status: bounds.status,
    sourcePopulation:
      "STRICT_ROLLING_CORE80_H3_B3_JOIN_FROZEN_LG01",
    sourceCacheRoles: [
      "frozen-cham01-b3-prediction-rows",
      "frozen-lg01-same-case-rows"
    ],
    derivationOriginRange: bounds.derivationOriginRange,
    maximumOpenedDevelopmentOrigin:
      bounds.maximumOpenedDevelopmentOrigin,
    inputRowCount: bounds.inputRowCount,
    finiteSupportRowCount: bounds.finiteSupportRowCount,
    excludedNonfiniteRowCount: bounds.excludedNonfiniteRowCount,
    positiveBaseSupportRowCount: bounds.positiveBaseSupportRowCount,
    quantileMethod: bounds.quantileMethod,
    quantiles: bounds.quantiles,
    parameterValues: {
      frozenDevelopmentPositiveBaseFloor: bounds.positiveBaseFloor,
      frozenDevelopmentQ05: bounds.lowerBound,
      frozenDevelopmentQ95: bounds.upperBound
    },
    nullAndNonfinitePolicy:
      "EXCLUDE_FROM_BOUND_DERIVATION_AND_REPORT_COUNTS",
    actualFieldConsumedForBoundDerivation: false,
    newLaterOriginActualValueRead: false,
    laterOriginOutcomeUsed: false,
    prospectiveFinalHoldoutOutcomeUsed: false,
    publicParameterValuesPublished: false,
    privateDigestIsCrossComputerGate: false
  };
}

function validatePrivateBoundArtifact(value) {
  if (
    value?.schema
      !== "m2.current.head_protected_segmented_router."
        + "residual_bounds.private.v0.1"
    || value?.artifactClass !== "PRIVATE_DERIVED_CACHE"
    || value?.experimentId !== HPSR_EXPERIMENT_ID
    || value?.modelId !== HPSR_MODEL_ID
    || value?.status
      !== "FROZEN_FROM_PREVIOUSLY_OPENED_DEVELOPMENT_ONLY"
    || value?.sourcePopulation
      !== "STRICT_ROLLING_CORE80_H3_B3_JOIN_FROZEN_LG01"
    || value?.newLaterOriginActualValueRead !== false
    || value?.laterOriginOutcomeUsed !== false
    || value?.prospectiveFinalHoldoutOutcomeUsed !== false
    || value?.publicParameterValuesPublished !== false
    || value?.privateDigestIsCrossComputerGate !== false
    || !Number.isFinite(
      value?.parameterValues?.frozenDevelopmentPositiveBaseFloor
    )
    || !Number.isFinite(
      value?.parameterValues?.frozenDevelopmentQ05
    )
    || !Number.isFinite(
      value?.parameterValues?.frozenDevelopmentQ95
    )
  ) {
    throw new Error("hpsr_private_residual_bound_artifact_invalid");
  }
}

async function forEachNdjson(filePath, visit) {
  const stream = createReadStream(filePath, { encoding: "utf8" });
  const lines = readline.createInterface({
    input: stream,
    crlfDelay: Infinity
  });
  let rowCount = 0;
  for await (const line of lines) {
    if (line.trim() === "") continue;
    rowCount += 1;
    visit(JSON.parse(line));
  }
  if (rowCount === 0) {
    throw new Error("hpsr_residual_bound_source_cache_empty");
  }
}

function resolvePrivatePath(root, repositoryRelativePath, capability) {
  const normalized = String(repositoryRelativePath).replaceAll("\\", "/");
  if (!normalized.startsWith(`data/private-output/${capability}/`)) {
    throw new Error("hpsr_residual_bound_private_path_invalid");
  }
  const privateRoot = path.resolve(root, "data/private-output");
  const resolved = path.resolve(root, repositoryRelativePath);
  if (!resolved.startsWith(`${privateRoot}${path.sep}`)) {
    throw new Error("hpsr_residual_bound_private_path_escape");
  }
  return resolved;
}

function caseKey(row) {
  return [
    String(row.standardWorkId),
    String(row.origin),
    Number(row.horizonMonths)
  ].join("\u0000");
}

function nullableNumber(value) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJsonAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  await writeFile(
    temporary,
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8"
  );
  await rename(temporary, filePath);
}

async function fileExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function main() {
  if (!process.argv.includes("--private-rebuild")) {
    throw new Error(
      "hpsr_residual_bound_private_rebuild_mode_required"
    );
  }
  const result = await materializeHpsrResidualBounds({
    forceRebuild: process.argv.includes("--force")
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (
  process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    process.stderr.write(
      `[M2_HPSR_RESIDUAL_BOUND_ERROR] ${error.message}\n`
    );
    process.exitCode = 1;
  });
}
