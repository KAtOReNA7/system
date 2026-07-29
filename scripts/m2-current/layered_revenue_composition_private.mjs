import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  addMonths,
  monthToSerial,
  runCoreRevenueManualRolling
} from "../../src/domain/m2Current/coreRevenueManual.js";
import {
  assertM2LayeredRevenuePublicSafe,
  decomposeM2LayeredRevenueActual,
  estimateM2LayeredPortfolioRatio,
  forecastM2LayeredPortfolioAmount,
  selectM2LayeredRatioEstimator
} from "../../src/domain/m2Current/layeredRevenueComposition.js";
import {
  scoreCoreRevenuePointRows
} from "../../src/domain/m2Current/coreRevenueManualEvaluation.js";
import {
  materializeM2CoreRevenueAuthority
} from "./core_revenue_manual_private.mjs";

const LAYERED_CONFIG =
  "config/m2-current-layered-revenue-composition.v0.1.json";
const MANUAL_CONFIG =
  "config/m2-current-core-revenue-manual.v0.1.json";

export async function runM2LayeredRevenueCompositionPrivate({ root }) {
  const [config, manualConfig] = await Promise.all([
    readJson(path.join(root, LAYERED_CONFIG)),
    readJson(path.join(root, MANUAL_CONFIG))
  ]);
  const privateDirectory = path.join(root, config.privateOutputs.directory);
  await mkdir(privateDirectory, { recursive: true });
  const receiptPath = path.join(
    privateDirectory,
    config.privateOutputs.receipt
  );
  const prior = await readJsonIfPresent(receiptPath);
  if (prior?.status === "VALID_EVALUATION_COMPLETE") {
    throw new Error(
      "m2_layered_revenue_first_valid_evaluation_already_complete"
    );
  }
  let preflight = null;
  try {
    preflight = verifyPreflight(root);
    const authority = await materializeM2CoreRevenueAuthority({ root });
    const visibleCache = new Map();
    const rolling = runCoreRevenueManualRolling({
      monthlyRows: authority.finalMonthlyRows,
      origins: authority.legalOrigins,
      config: manualConfig,
      featureMonthlyRowsForOrigin(origin) {
        const rows = authority.featureMonthlyRowsForOrigin(origin);
        visibleCache.set(origin, rows);
        return rows;
      }
    });
    const actualCache = buildActualCache({
      monthlyRows: authority.finalMonthlyRows,
      visibleCache,
      rolling,
      scalePower: authority.authority.scalePower
    });
    const predictionRows = buildPredictionRows({
      rolling,
      actualCache
    });
    const publicResult = buildPublicResult({
      config,
      preflight,
      authority,
      actualCache,
      predictionRows
    });
    assertM2LayeredRevenuePublicSafe(publicResult);
    await writePrivateAndPublic({
      root,
      config,
      privateDirectory,
      receiptPath,
      preflight,
      actualCache,
      predictionRows,
      publicResult
    });
    return publicResult;
  } catch (error) {
    await writeFile(receiptPath, `${JSON.stringify({
      schema:
        "m2.current.layered_revenue_composition.receipt.private.v0.1",
      status: "INVALIDATED_EXECUTION_RETRY_ALLOWED",
      executionHead: preflight?.head ?? null,
      errorCode: String(error?.message ?? error).slice(0, 160),
      validModelConclusionProduced: false
    }, null, 2)}\n`, "utf8");
    throw error;
  }
}

function buildActualCache({
  monthlyRows,
  visibleCache,
  rolling,
  scalePower
}) {
  const factor = 10 ** scalePower;
  const cache = new Map();
  let maximumDifference = 0n;
  for (const origin of rolling.origins) {
    const visible = visibleCache.get(origin) ?? [];
    const positiveWorks = new Set(
      visible.filter((row) => row.cash > 0)
        .map((row) => row.standardWorkId)
    );
    const positiveWorkChannels = new Set(
      visible.filter((row) => row.cash > 0)
        .map((row) => `${row.standardWorkId}|${row.channelUid}`)
    );
    for (const populationId of ["CORE80", "CORE90"]) {
      const field = populationId === "CORE80" ? "core80" : "core90";
      const coreWorkIds = rolling.selectionRows
        .filter((row) => row.origin === origin && row[field])
        .map((row) => row.standardWorkId);
      for (const horizon of [3, 6, 12, 24, 36]) {
        const end = monthToSerial(origin) + horizon;
        const futureRows = monthlyRows.filter((row) => {
          const serial = monthToSerial(row.month);
          return serial > monthToSerial(origin) && serial <= end;
        }).map((row) => ({
          workId: row.standardWorkId,
          channelId: row.channelUid,
          amountMinor: String(Math.round(row.cash * factor))
        }));
        const value = decomposeM2LayeredRevenueActual({
          futureRows,
          coreWorkIds,
          originVisiblePositiveWorkIds: [...positiveWorks],
          originVisiblePositiveWorkChannels: [...positiveWorkChannels]
        });
        const difference = BigInt(value.conservationDifferenceMinor);
        if (difference < -maximumDifference || difference > maximumDifference) {
          maximumDifference = difference < 0n ? -difference : difference;
        }
        cache.set(key(origin, populationId, horizon), value);
      }
    }
  }
  return {
    cache,
    scalePower,
    originCount: rolling.origins.length,
    maximumConservationDifferenceMinor: maximumDifference.toString()
  };
}

function buildPredictionRows({ rolling, actualCache }) {
  const rows = [];
  const origins = rolling.origins;
  for (const origin of origins) {
    for (const populationId of ["CORE80", "CORE90"]) {
      const history = componentHistory(actualCache, origins, populationId);
      for (const horizon of [3, 6, 12, 36]) {
        const actual = actualCache.cache.get(
          key(origin, populationId, horizon)
        );
        const manualPortfolio = rolling.portfolioRows.find((row) => (
          row.origin === origin
          && row.populationId === populationId
          && row.variant === "CORE_PLUS_POOLED_TAIL"
          && row.horizonMonths === horizon
        ));
        const corePortfolio = rolling.portfolioRows.find((row) => (
          row.origin === origin
          && row.populationId === populationId
          && row.variant === "CORE_ONLY"
          && row.horizonMonths === horizon
        ));
        const denominator = preOrigin12(actualCache, origin, populationId);
        const futureNew = estimateComponent({
          history,
          origin,
          horizon,
          componentId: "FUTURE_NEW_WORK",
          denominator
        });
        const newChannel = estimateComponent({
          history,
          origin,
          horizon,
          componentId: "EXISTING_WORK_NEW_CHANNEL",
          denominator
        });
        let existingCore = 0;
        let existingTail = 0;
        let variant = "L7";
        if (horizon <= 12 && manualPortfolio && corePortfolio) {
          existingCore = corePortfolio.pointEstimate;
          existingTail = manualPortfolio.pointEstimate
            - corePortfolio.pointEstimate;
          if (horizon === 12) variant = "L5A";
        } else {
          const existing = estimateExistingCatalog({
            history,
            origin,
            horizon,
            denominator
          });
          existingCore = existing;
          existingTail = 0;
          variant = "L6A";
        }
        const pointEstimate = existingCore + existingTail
          + futureNew + newChannel;
        rows.push({
          origin,
          populationId,
          horizonMonths: horizon,
          variant,
          pointEstimate,
          actual: minorToNumber(actual.companyTotalMinor, actualCache.scalePower),
          componentPredictions: {
            EXISTING_CORE: existingCore,
            EXISTING_TAIL: existingTail,
            FUTURE_NEW_WORK: futureNew,
            EXISTING_WORK_NEW_CHANNEL: newChannel
          },
          componentActuals: Object.fromEntries(Object.entries(
            actual.components
          ).map(([id, value]) => [
            id,
            minorToNumber(value, actualCache.scalePower)
          ]))
        });
        if (horizon === 12) {
          rows.push({
            ...rows.at(-1),
            variant: "L5B",
            pointEstimate: estimateExistingCatalog({
              history,
              origin,
              horizon,
              denominator
            }) + futureNew + newChannel
          });
        }
        if (horizon === 36) {
          rows.push({
            ...rows.at(-1),
            variant: "L6B_SHRUNK_TO_COMPANY_CATALOG"
          });
        }
      }
    }
  }
  return rows;
}

function componentHistory(actualCache, origins, populationId) {
  return origins.flatMap((pseudoOrigin) => [3, 6, 12, 24, 36].flatMap(
    (horizonMonths) => {
      const value = actualCache.cache.get(
        key(pseudoOrigin, populationId, horizonMonths)
      );
      const denominator = preOrigin12(
        actualCache,
        pseudoOrigin,
        populationId
      );
      if (!value || denominator <= 0) return [];
      return Object.entries(value.components).map(
        ([componentId, numeratorMinor]) => ({
          pseudoOrigin,
          horizonMonths,
          componentId,
          numeratorMinor,
          denominatorMinor: String(Math.round(
            denominator * 10 ** actualCache.scalePower
          ))
        })
      );
    }
  ));
}

function estimateComponent({
  history,
  origin,
  horizon,
  componentId,
  denominator
}) {
  const estimate = estimateM2LayeredPortfolioRatio({
    history: history.filter((row) => row.componentId === componentId),
    origin,
    horizonMonths: horizon
  });
  const selected = selectM2LayeredRatioEstimator(
    estimate,
    "RECENT_3_MATURE_MEDIAN"
  );
  const forecast = forecastM2LayeredPortfolioAmount({
    preOrigin12MonthCashMinor: String(Math.round(denominator * 1000)),
    estimate: selected
  });
  return forecast.amountMinor === null
    ? 0
    : Number(forecast.amountMinor) / 1000;
}

function estimateExistingCatalog({
  history,
  origin,
  horizon,
  denominator
}) {
  const components = ["EXISTING_CORE", "EXISTING_TAIL"];
  return components.reduce((total, componentId) => total + estimateComponent({
    history,
    origin,
    horizon,
    componentId,
    denominator
  }), 0);
}

function preOrigin12(actualCache, origin, populationId) {
  const prior = actualCache.cache.get(key(addMonths(origin, -12), populationId, 12));
  return prior
    ? minorToNumber(prior.companyTotalMinor, actualCache.scalePower)
    : 0;
}

function buildPublicResult({
  config,
  preflight,
  authority,
  actualCache,
  predictionRows
}) {
  const variants = {};
  for (const populationId of ["CORE80", "CORE90"]) {
    variants[populationId] = {};
    for (const variant of ["L7", "L5A", "L5B", "L6A", "L6B_SHRUNK_TO_COMPANY_CATALOG"]) {
      variants[populationId][variant] = {};
      for (const horizon of [3, 6, 12, 36]) {
        const selected = predictionRows.filter((row) => (
          row.populationId === populationId
          && row.variant === variant
          && row.horizonMonths === horizon
        ));
        if (selected.length === 0) continue;
        variants[populationId][variant][horizon] = {
          ...scoreCoreRevenuePointRows(selected),
          bootstrap: bootstrapOrigins(selected, 2000, 20260729)
        };
      }
    }
  }
  const mainRows = predictionRows.filter((row) => (
    row.populationId === "CORE90"
    && ((row.horizonMonths <= 6 && row.variant === "L7")
      || (row.horizonMonths === 12 && row.variant === "L5B")
      || (row.horizonMonths === 36 && row.variant === "L6A"))
  ));
  const componentShares = {};
  for (const id of [
    "EXISTING_CORE",
    "EXISTING_TAIL",
    "FUTURE_NEW_WORK",
    "EXISTING_WORK_NEW_CHANNEL"
  ]) {
    const actual = mainRows.reduce(
      (sum, row) => sum + row.componentActuals[id],
      0
    );
    const total = mainRows.reduce((sum, row) => sum + row.actual, 0);
    componentShares[id] = total === 0 ? null : actual / total;
  }
  return {
    schema:
      "m2.current.layered_revenue_composition.development.public.v0.1",
    status: "M2_LAYERED_REVENUE_COMPOSITION_PARTIAL",
    model: config.model,
    execution: {
      exactHead: preflight.head,
      draftPrNumber: preflight.prNumber,
      linuxCi: "success",
      windowsCi: "success",
      firstValidEvaluationProduced: true,
      modelTrainingPerformed: false,
      outerResultModelSelectionPerformed: false
    },
    authority: {
      rowCount: authority.authority.rowCount,
      workCount: authority.authority.workCount,
      channelCount: authority.authority.channelCount,
      reversalRowCount: authority.authority.reversalRowCount,
      authorityStartMonth: authority.authorityStartMonth,
      labelMaturityCutoff: authority.labelMaturityCutoff,
      originalReversalRowsDeleted: 0,
      conservationDifferenceMinor:
        authority.finalRestatement.conservationDifferenceMinor
    },
    population: {
      legalOriginCount: authority.legalOrigins.length
    },
    fourComponentConservation: {
      maximumDifferenceMinor:
        actualCache.maximumConservationDifferenceMinor,
      status: actualCache.maximumConservationDifferenceMinor === "0"
        ? "CONSERVED"
        : "FAILED"
    },
    componentActualShares: componentShares,
    variants,
    comparators: {
      status: "NOT_COMPARABLE",
      reason:
        "no_same_case_company_portfolio_rows_under_the_active_actual_definition"
    },
    horizonDecisions: {
      SHORT_TERM_3_6_STATUS: "EVALUATED",
      MEDIUM_TERM_12_STATUS: "EVALUATED",
      LONG_TERM_36_STATUS: "EVALUATED_DIRECT_RETENTION_NO_RECURSIVE_K",
      OVERALL_PORTFOLIO_STATUS: "PARTIAL_PENDING_METRIC_INTERPRETATION"
    },
    boundaries: {
      activeCandidate: null,
      approvedForAutomation: null,
      productionChanged: false,
      laterOriginRead: false,
      finalHoldoutRead: false,
      providerUsed: false,
      databaseUsed: false
    }
  };
}

async function writePrivateAndPublic({
  root,
  config,
  privateDirectory,
  receiptPath,
  preflight,
  actualCache,
  predictionRows,
  publicResult
}) {
  await writeFile(
    path.join(privateDirectory, config.privateOutputs.predictionRows),
    predictionRows.map((row) => JSON.stringify(row)).join("\n") + "\n",
    "utf8"
  );
  await writeFile(
    path.join(privateDirectory, config.privateOutputs.manifest),
    `${JSON.stringify({
      schema:
        "m2.current.layered_revenue_composition.manifest.private.v0.1",
      status: "VALID_EVALUATION_COMPLETE",
      executionHead: preflight.head,
      predictionRowCount: predictionRows.length,
      originCount: actualCache.originCount
    }, null, 2)}\n`,
    "utf8"
  );
  await writeFile(receiptPath, `${JSON.stringify({
    schema:
      "m2.current.layered_revenue_composition.receipt.private.v0.1",
    status: "VALID_EVALUATION_COMPLETE",
    executionHead: preflight.head,
    validModelConclusionProduced: true,
    modelTrainingPerformed: false,
    outerResultModelSelectionPerformed: false
  }, null, 2)}\n`, "utf8");
  await writeFile(
    path.join(root, config.publicOutputs.evaluation),
    `${JSON.stringify(publicResult, null, 2)}\n`,
    "utf8"
  );
}

function bootstrapOrigins(rows, iterations, seed) {
  const byOrigin = Map.groupBy(rows, (row) => row.origin);
  const origins = [...byOrigin.keys()].sort();
  let state = seed >>> 0;
  const next = () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  const values = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const sampled = [];
    for (let index = 0; index < origins.length; index += 1) {
      const origin = origins[Math.floor(next() * origins.length)];
      sampled.push(...byOrigin.get(origin));
    }
    values.push(scoreCoreRevenuePointRows(sampled).metrics.wape);
  }
  values.sort((left, right) => left - right);
  return {
    iterations,
    clusterUnit: "origin",
    lower95: values[Math.floor(iterations * 0.025)],
    upper95: values[Math.floor(iterations * 0.975)]
  };
}

function verifyPreflight(root) {
  if (run(root, "git", ["status", "--porcelain"]).trim() !== "") {
    throw new Error("m2_layered_revenue_worktree_not_clean");
  }
  const head = run(root, "git", ["rev-parse", "HEAD"]).trim();
  if (head !== run(root, "git", ["rev-parse", "@{upstream}"]).trim()) {
    throw new Error("m2_layered_revenue_head_not_upstream");
  }
  const pr = JSON.parse(run(root, "gh", [
    "pr", "view", "--json",
    "number,state,isDraft,headRefOid,mergedAt"
  ]));
  if (
    pr.state !== "OPEN"
    || pr.isDraft !== true
    || pr.mergedAt !== null
    || pr.headRefOid !== head
  ) {
    throw new Error("m2_layered_revenue_pr_invalid");
  }
  const runs = JSON.parse(run(root, "gh", [
    "run", "list", "--branch",
    run(root, "git", ["branch", "--show-current"]).trim(),
    "--limit", "10", "--json",
    "databaseId,headSha,status,conclusion"
  ]));
  const ci = runs.find((row) => (
    row.headSha === head
    && row.status === "completed"
    && row.conclusion === "success"
  ));
  if (!ci) throw new Error("m2_layered_revenue_exact_head_ci_missing");
  return { head, prNumber: pr.number, ciRunId: ci.databaseId };
}

function run(root, executable, args) {
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    shell: false,
    windowsHide: true
  });
  if (result.status !== 0) {
    throw new Error(
      `m2_layered_revenue_command_failed:${executable}:${args[0]}`
    );
  }
  return result.stdout;
}

function key(origin, populationId, horizon) {
  return `${origin}|${populationId}|${horizon}`;
}

function minorToNumber(value, scalePower) {
  return Number(value) / 10 ** scalePower;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readJsonIfPresent(filePath) {
  try {
    return await readJson(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}
