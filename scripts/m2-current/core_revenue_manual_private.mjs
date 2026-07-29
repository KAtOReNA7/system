import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import {
  mkdir,
  readFile,
  rename,
  stat,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

import {
  addMonths,
  monthToSerial,
  runCoreRevenueManualRolling,
  serialToMonth,
  validateM2CoreRevenueManualConfig
} from "../../src/domain/m2Current/coreRevenueManual.js";
import {
  determineCoreRevenueManualDecision,
  quantiles,
  scoreCoreRevenuePairedComparison,
  scoreCoreRevenuePointRows,
  scoreCoreRevenuePublicCell,
  scoreCoreRevenueSlices
} from "../../src/domain/m2Current/coreRevenueManualEvaluation.js";
import {
  buildReversalScopeKeyV1,
  restateSalesShareReversalsV1
} from "../../src/domain/m2Current/reversalRestatement.js";

const CONFIG_PATH =
  "config/m2-current-core-revenue-manual.v0.1.json";
const REVERSAL_CONFIG_PATH =
  "config/m2-reversal-restatement.v1.json";
const AUTHORITY_DIRECTORY =
  "data/private-output/m2-evaluation-v2-2-reversal-rescore";
const AUTHORITY_FACTS =
  `${AUTHORITY_DIRECTORY}/M2-reversal-authority-facts-private-v1.ndjson`;
const AUTHORITY_RECEIPT =
  `${AUTHORITY_DIRECTORY}/M2-reversal-authority-export-receipt-private-v1.json`;
const V22_RESCORE =
  `${AUTHORITY_DIRECTORY}/M2-evaluation-v2.2-label-only-rescore-private-v1.ndjson`;
const LG01_PRIVATE =
  "data/private-output/m2-current-human-anchored/"
  + "M2-current-human-anchored-evaluation-private-v0.1.ndjson";

export async function runM2CoreRevenueManualPrivateEvaluation({ root }) {
  const config = await readJson(path.join(root, CONFIG_PATH));
  validateM2CoreRevenueManualConfig(config);
  const privateDirectory = path.join(
    root,
    config.privateOutputs.directory
  );
  await mkdir(privateDirectory, { recursive: true });
  const receiptPath = path.join(
    privateDirectory,
    config.privateOutputs.receipt
  );
  const prior = await readJsonIfPresent(receiptPath);
  if (prior?.status === "VALID_EVALUATION_COMPLETE") {
    throw new Error(
      "m2_core_revenue_manual_first_valid_evaluation_already_complete"
    );
  }
  let preflight = null;
  try {
    preflight = verifyExactHeadPreflight(root);
    preparePrivateInputs(root);
    const metadata = await readJson(path.join(
      privateDirectory,
      config.privateOutputs.staticMetadata
    ));
    const authority = await loadAuthority(root);
    const authorityStartMonth = authority.rows
      .map((row) => row.postingMonth)
      .sort()[0];
    const labelMaturityCutoff = authority.rows
      .map((row) => row.recordedAt.slice(0, 7))
      .sort()
      .at(-1);
    const finalRestatement = restateSalesShareReversalsV1(
      authority.rows,
      {
        cutoff: labelMaturityCutoff,
        authorityStartMonth
      }
    );
    assertRestatementUsable(finalRestatement);
    const metadataIndex = buildMetadataIndex(metadata);
    const finalMonthlyRows = restatementMonthlyRows(
      finalRestatement,
      metadataIndex,
      authority.scalePower
    );
    const origins = legalMonthlyOrigins({
      authorityStartMonth,
      labelMaturityCutoff,
      maximumHorizon: Math.max(...config.evaluation.horizonsMonths)
    });
    if (origins.length === 0) {
      throw new Error(
        "m2_core_revenue_manual_no_legal_historical_origin"
      );
    }
    const asOfAudit = [];
    const rolling = runCoreRevenueManualRolling({
      monthlyRows: finalMonthlyRows,
      origins,
      config,
      featureMonthlyRowsForOrigin(origin) {
        const asOf = restateSalesShareReversalsV1(authority.rows, {
          cutoff: origin,
          authorityStartMonth
        });
        assertRestatementUsable(asOf);
        asOfAudit.push({
          origin,
          visibleRowCount: asOf.visibleRowCount,
          futureExcludedCount: asOf.futureExcludedCount,
          conservationDifferenceMinor: asOf.conservationDifferenceMinor,
          excludedUnallocatedReversalResidualMinor:
            asOf.excludedUnallocatedReversalResidualMinor
        });
        return restatementMonthlyRows(
          asOf,
          metadataIndex,
          authority.scalePower
        );
      }
    });
    const finalIndex = buildFinalActualIndex(finalMonthlyRows);
    const workRows = aggregateCandidateToWork(rolling.caseRows, finalIndex);
    const comparators = await loadComparators(root, authority.scalePower);
    const evaluation = evaluatePrivateResult({
      config,
      rolling,
      workRows,
      comparators,
      finalIndex
    });
    const publicResult = buildPublicResult({
      config,
      preflight,
      authority,
      authorityStartMonth,
      labelMaturityCutoff,
      finalRestatement,
      metadata,
      rolling,
      evaluation,
      asOfAudit
    });
    assertPublicSafe(publicResult);
    await writePrivateOutputs({
      root,
      config,
      privateDirectory,
      authority,
      finalMonthlyRows,
      rolling,
      workRows,
      evaluation,
      preflight,
      publicResult
    });
    await writePublicOutputs({ root, config, publicResult });
    return publicResult;
  } catch (error) {
    await writeFile(receiptPath, `${JSON.stringify({
      schema:
        "m2.current.core_revenue_manual.run_receipt.private.v0.1",
      status: "INVALIDATED_EXECUTION_RETRY_ALLOWED",
      errorCode: safeErrorCode(error),
      executionHead: preflight?.head ?? null,
      validModelConclusionProduced: false
    }, null, 2)}\n`, "utf8");
    throw error;
  }
}

function verifyExactHeadPreflight(root) {
  const status = run(root, "git", ["status", "--porcelain"]).trim();
  if (status !== "") {
    throw new Error("m2_core_revenue_manual_worktree_not_clean");
  }
  const head = run(root, "git", ["rev-parse", "HEAD"]).trim();
  const upstream = run(root, "git", ["rev-parse", "@{upstream}"]).trim();
  if (head !== upstream) {
    throw new Error(
      "m2_core_revenue_manual_head_not_equal_upstream"
    );
  }
  const branch = run(
    root,
    "git",
    ["branch", "--show-current"]
  ).trim();
  const pr = JSON.parse(run(root, "gh", [
    "pr",
    "view",
    "--json",
    "number,state,isDraft,mergedAt,headRefOid,baseRefName,url"
  ]));
  if (
    pr.state !== "OPEN"
    || pr.isDraft !== true
    || pr.mergedAt !== null
    || pr.headRefOid !== head
    || pr.baseRefName !== "main"
  ) {
    throw new Error("m2_core_revenue_manual_draft_pr_preflight_failed");
  }
  const runs = JSON.parse(run(root, "gh", [
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
    throw new Error(
      "m2_core_revenue_manual_exact_head_ci_not_successful"
    );
  }
  const workflow = JSON.parse(run(root, "gh", [
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
      "m2_core_revenue_manual_exact_head_dual_ci_not_successful"
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
    windows: jobs["verify-windows"].conclusion
  };
}

function preparePrivateInputs(root) {
  run(root, process.execPath, [
    "scripts/run-codex-python.mjs",
    "scripts/m2-current/export_m2_reversal_authority.py"
  ]);
  run(root, process.execPath, [
    "scripts/run-codex-python.mjs",
    "scripts/m2-current/materialize_human_anchored_cases.py",
    "--core-revenue-manual"
  ]);
}

async function loadAuthority(root) {
  const receipt = await readJson(path.join(root, AUTHORITY_RECEIPT));
  const factsPath = path.join(root, AUTHORITY_FACTS);
  if (
    receipt.status !== "READY"
    || receipt.authorityMode !== "user_reviewed_workbook_membership"
    || receipt.machineClassificationUsed !== false
    || receipt.missingWorkCount !== 0
    || receipt.missingChannelCount !== 0
    || receipt.channelScopeMode
      !== "user_reviewed_canonical_channel_uid"
    || !Number.isInteger(receipt.amountScalePower)
    || receipt.amountScalePower < 0
  ) {
    throw new Error(
      "m2_core_revenue_manual_authority_receipt_invalid"
    );
  }
  const factDigest = await sha256File(factsPath);
  if (factDigest !== receipt.authorityFactsSha256) {
    throw new Error(
      "m2_core_revenue_manual_authority_fact_digest_mismatch"
    );
  }
  const userConfirmation = await readJson(path.join(
    root,
    "config/m2-current-user-confirmation.v0.1.json"
  ));
  if (
    userConfirmation.negativeCashEventPolicy
      !== "all_negative_cash_records_are_reversals"
  ) {
    throw new Error(
      "m2_core_revenue_manual_reversal_classification_unproven"
    );
  }
  const sourceDigest = receipt.sourceDigests.salesShare;
  const currencyScope = `authority-ledger-native-unit:${sourceDigest}`;
  const rows = [];
  await forEachNdjson(factsPath, (row) => {
    if (row.cashCategory !== "sales_share") return;
    const amountMinor = decimalToMinor(
      row.actualSalesAmount,
      receipt.amountScalePower
    );
    rows.push({
      recordId: String(row.authorityRecordId),
      reversalScopeKey: buildReversalScopeKeyV1({
        cashCategory: "sales_share",
        standardWorkId: String(row.standardWorkId),
        channelMemberId: String(row.channelMemberId),
        currencyScope
      }),
      postingMonth: String(row.billMonth).slice(0, 7),
      recordedAt: String(row.recordedAt),
      eventType: amountMinor < 0n
        ? "reversal"
        : "positive_sales_share",
      amountMinor: amountMinor.toString(),
      standardWorkId: String(row.standardWorkId),
      channelMemberId: String(row.channelMemberId)
    });
  });
  const recordIds = new Set(rows.map((row) => row.recordId));
  if (
    rows.length !== receipt.rowCount
    || recordIds.size !== rows.length
    || rows.filter((row) => BigInt(row.amountMinor) < 0n).length
      !== receipt.negativeRowCount
  ) {
    throw new Error(
      "m2_core_revenue_manual_authority_row_validation_failed"
    );
  }
  return {
    rows,
    scalePower: receipt.amountScalePower,
    factDigest,
    sourceDigest,
    rowCount: rows.length,
    workCount: new Set(rows.map((row) => row.standardWorkId)).size,
    channelCount: new Set(rows.map((row) => row.channelMemberId)).size,
    reversalRowCount: receipt.negativeRowCount,
    sourceDigests: receipt.sourceDigests,
    mappingArtifactDigests: receipt.mappingArtifactDigests
  };
}

function buildMetadataIndex(metadata) {
  if (
    metadata?.schema
      !== "m2.current.core_revenue_manual.static_metadata.private.v0.1"
    || metadata?.modelId !== "M2-WORK-CRMR01"
  ) {
    throw new Error(
      "m2_core_revenue_manual_static_metadata_invalid"
    );
  }
  return {
    categoryByWork: new Map(
      metadata.workCategories.map((row) => [
        String(row.standardWorkId),
        String(row.level2Category || "UNKNOWN")
      ])
    ),
    mechanismByChannel: new Map(
      metadata.channels.map((row) => [
        String(row.channelUid),
        String(row.settlementMechanism || "UNKNOWN")
      ])
    )
  };
}

function restatementMonthlyRows(restatement, metadata, scalePower) {
  const rows = [];
  let totalMinor = 0n;
  for (const scope of restatement.scopes) {
    for (const balance of scope.restatedBalances) {
      const amountMinor = BigInt(balance.amountMinor);
      totalMinor += amountMinor;
      if (amountMinor === 0n) continue;
      rows.push({
        standardWorkId: scope.standardWorkId,
        channelUid: scope.channelMemberId,
        month: balance.month,
        cash: minorToNumber(amountMinor, scalePower),
        level2Category:
          metadata.categoryByWork.get(scope.standardWorkId) ?? "UNKNOWN",
        settlementMechanism:
          metadata.mechanismByChannel.get(scope.channelMemberId)
            ?? "UNKNOWN"
      });
    }
  }
  if (totalMinor !== BigInt(restatement.modelableRestatedRevenueMinor)) {
    throw new Error(
      "m2_core_revenue_manual_monthly_restatement_conservation_failed"
    );
  }
  return rows;
}

function assertRestatementUsable(restatement) {
  if (
    restatement.conservationDifferenceMinor !== "0"
    || [
      "BLOCKED_RECORDED_AT_MISSING",
      "BLOCKED_REVERSAL_CLASSIFICATION"
    ].includes(restatement.status)
  ) {
    throw new Error(
      "m2_core_revenue_manual_restatement_authority_blocked"
    );
  }
}

function legalMonthlyOrigins({
  authorityStartMonth,
  labelMaturityCutoff,
  maximumHorizon
}) {
  const start = addMonths(authorityStartMonth, 2);
  const end = addMonths(labelMaturityCutoff, -maximumHorizon);
  if (end < start) return [];
  const origins = [];
  for (
    let serial = monthToSerial(start);
    serial <= monthToSerial(end);
    serial += 1
  ) {
    origins.push(serialToMonth(serial));
  }
  return origins;
}

function buildFinalActualIndex(rows) {
  const byWork = new Map();
  const all = new Map();
  for (const row of rows) {
    const serial = monthToSerial(row.month);
    const months = byWork.get(row.standardWorkId) ?? new Map();
    months.set(serial, (months.get(serial) ?? 0) + row.cash);
    byWork.set(row.standardWorkId, months);
    all.set(serial, (all.get(serial) ?? 0) + row.cash);
  }
  return { byWork, all };
}

function aggregateCandidateToWork(channelRows, finalIndex) {
  const groups = new Map();
  for (const row of channelRows) {
    const key = [
      row.populationId,
      row.standardWorkId,
      row.origin,
      row.horizonMonths
    ].join("\u001f");
    const value = groups.get(key) ?? {
      modelId: row.modelId,
      populationId: row.populationId,
      standardWorkId: row.standardWorkId,
      origin: row.origin,
      originYear: row.origin.slice(0, 4),
      horizonMonths: row.horizonMonths,
      pointEstimate: 0,
      channelRowCount: 0,
      completeDenseHistory: true
    };
    value.pointEstimate += row.pointEstimate;
    value.channelRowCount += 1;
    value.completeDenseHistory = (
      value.completeDenseHistory
      && row.twoCompleteWindows === true
      && row.historyMonthCount >= 24
    );
    groups.set(key, value);
  }
  for (const value of groups.values()) {
    value.actual = workWindowActual(
      finalIndex,
      value.standardWorkId,
      value.origin,
      value.horizonMonths
    );
    value.caseKey = [
      value.standardWorkId,
      value.origin,
      value.horizonMonths
    ].join("|");
  }
  return [...groups.values()].sort(compareEvaluationRows);
}

async function loadComparators(root, scalePower) {
  const lgFamily = new Map();
  await forEachNdjson(path.join(root, LG01_PRIVATE), (row) => {
    const key = [
      row.standardWorkId,
      row.origin,
      row.horizonMonths
    ].join("|");
    lgFamily.set(key, row.evaluationFamily);
  });
  const maps = {
    "M2-WORK-LG01": new Map(),
    "M2-WORK-OA03": new Map()
  };
  const conflicts = {
    "M2-WORK-LG01": new Set(),
    "M2-WORK-OA03": new Set()
  };
  await forEachNdjson(path.join(root, V22_RESCORE), (row) => {
    const target = maps[row.modelId];
    if (!target || ![3, 6, 12, 36].includes(row.horizonMonths)) return;
    const key = [
      row.standardWorkId,
      row.origin,
      row.horizonMonths
    ].join("|");
    const value = {
      modelId: row.modelId,
      standardWorkId: String(row.standardWorkId),
      origin: row.origin,
      horizonMonths: row.horizonMonths,
      pointEstimate: Number(row.frozenPointEstimate),
      actual: minorToNumber(
        BigInt(row.developmentModelableActualMinor),
        scalePower
      ),
      sourceGroupId: row.groupId,
      historicalEvaluationFamily:
        row.modelId === "M2-WORK-LG01"
          ? lgFamily.get(key) ?? "UNKNOWN"
          : "frozen_operational_fallback"
    };
    const previous = target.get(key);
    if (
      previous
      && (
        Math.abs(previous.pointEstimate - value.pointEstimate) > 1e-9
        || Math.abs(previous.actual - value.actual) > 1e-9
      )
    ) {
      conflicts[row.modelId].add(key);
    } else if (!previous) {
      target.set(key, value);
    }
  });
  for (const modelId of Object.keys(maps)) {
    for (const key of conflicts[modelId]) maps[modelId].delete(key);
  }
  return {
    maps,
    conflicts: Object.fromEntries(
      Object.entries(conflicts).map(([key, values]) => [key, values.size])
    )
  };
}

function evaluatePrivateResult({
  config,
  rolling,
  workRows,
  comparators,
  finalIndex
}) {
  const privacy = {
    minimumCaseCount: 30,
    minimumWorkCount: 20,
    minimumPortfolioOriginCount: 5
  };
  const candidate = {};
  const comparison = {};
  const populationComparisons = [];
  const selectionIndex = new Map(rolling.selectionRows.map((row) => [
    `${row.origin}\u0000${row.standardWorkId}`,
    row
  ]));
  let anyMaterialSliceImprovement = false;
  for (const populationId of ["CORE80", "CORE90"]) {
    const workPopulation = workRows.filter(
      (row) => row.populationId === populationId
    );
    const channelPopulation = rolling.caseRows.filter(
      (row) => row.populationId === populationId
    );
    const annualPopulation = rolling.annualComponentRows.filter(
      (row) => row.populationId === populationId
    );
    candidate[populationId] = {
      workTotal: scoreCoreRevenuePublicCell(workPopulation, privacy),
      servedWorkChannel: scoreCoreRevenuePublicCell(
        channelPopulation,
        privacy
      ),
      byHorizon: scoreCoreRevenueSlices(
        workPopulation,
        "horizonMonths",
        privacy
      ),
      byOrigin: scoreCoreRevenueSlices(
        workPopulation,
        "origin",
        privacy
      ),
      byYear: scoreCoreRevenueSlices(
        workPopulation,
        "originYear",
        privacy
      ),
      byChannel: anonymizedChannelSlices(channelPopulation, privacy),
      bySettlementMechanism: scoreCoreRevenueSlices(
        channelPopulation,
        "settlementMechanism",
        privacy
      ),
      byLevel2CategoryDiagnostic: scoreCoreRevenueSlices(
        channelPopulation,
        "level2Category",
        privacy
      ),
      top20: scoreCoreRevenuePublicCell(
        workPopulation.filter((row) => selectionFlag(
          selectionIndex,
          row,
          "top20"
        )),
        privacy
      ),
      top50: scoreCoreRevenuePublicCell(
        workPopulation.filter((row) => selectionFlag(
          selectionIndex,
          row,
          "top50"
        )),
        privacy
      ),
      annualComponents: scoreCoreRevenueSlices(
        annualPopulation,
        "annualComponent",
        privacy
      )
    };
    comparison[populationId] = {};
    for (const modelId of ["M2-WORK-LG01", "M2-WORK-OA03"]) {
      const paired = pairRows(workPopulation, comparators.maps[modelId]);
      const primary = scoreCoreRevenuePairedComparison(
        paired.rows,
        config.evaluation.bootstrap
      );
      const strictRows = paired.rows.filter(
        (row) => row.completeDenseHistory
      );
      const strict = scoreCoreRevenuePairedComparison(
        strictRows,
        config.evaluation.bootstrap
      );
      const byHorizon = Object.fromEntries(
        config.evaluation.horizonsMonths.map((horizon) => [
          String(horizon),
          scoreCoreRevenuePairedComparison(
            paired.rows.filter(
              (row) => row.horizonMonths === horizon
            ),
            config.evaluation.bootstrap
          )
        ])
      );
      const byYear = pairedByYear(
        paired.rows,
        config.evaluation.bootstrap
      );
      const timeStability = summarizeTimeStability(byYear);
      if (Object.values(byHorizon).some(
        (value) => (
          value.status === "COMPUTED"
          && value.relativeWapeFva >= config.evaluation.materiality
        )
      )) {
        anyMaterialSliceImprovement = true;
      }
      comparison[populationId][modelId] = {
        status: paired.rows.length > 0
          ? "COMPUTED_SAME_CASE"
          : "NOT_COMPARABLE",
        matchedCaseCount: paired.rows.length,
        actualMismatchCount: paired.actualMismatchCount,
        primary,
        strict,
        byHorizon,
        byYear,
        timeStability
      };
      if (modelId === "M2-WORK-LG01") {
        populationComparisons.push({
          populationId,
          primary,
          strict,
          timeStability
        });
      }
    }
  }
  const portfolio = scorePortfolio(rolling.portfolioRows, privacy);
  const captures = scoreCaptures({
    rolling,
    finalIndex,
    horizons: config.evaluation.horizonsMonths
  });
  const kDiagnostics = scoreKDiagnostics(rolling.caseRows);
  const formulaDiagnostics = scoreFormulaDiagnostics(
    rolling.caseRows
  );
  const longTermUncontrolled = Object.values(
    formulaDiagnostics
  ).some((value) => value.nonfinitePredictionCount > 0);
  const decision = determineCoreRevenueManualDecision({
    populationComparisons,
    anyMaterialSliceImprovement,
    longTermUncontrolled
  });
  return {
    candidate,
    comparison,
    portfolio,
    captures,
    kDiagnostics,
    formulaDiagnostics,
    comparatorConflicts: comparators.conflicts,
    decision,
    validEvaluation: true
  };
}

function pairRows(candidateRows, comparator) {
  const rows = [];
  let actualMismatchCount = 0;
  for (const candidate of candidateRows) {
    const baseline = comparator.get(candidate.caseKey);
    if (!baseline) continue;
    if (Math.abs(candidate.actual - baseline.actual) > 1e-6) {
      actualMismatchCount += 1;
      continue;
    }
    rows.push({
      caseKey: candidate.caseKey,
      standardWorkId: candidate.standardWorkId,
      origin: candidate.origin,
      originYear: candidate.originYear,
      horizonMonths: candidate.horizonMonths,
      actual: baseline.actual,
      candidatePointEstimate: candidate.pointEstimate,
      baselinePointEstimate: baseline.pointEstimate,
      completeDenseHistory: candidate.completeDenseHistory
    });
  }
  return { rows, actualMismatchCount };
}

function pairedByYear(rows, bootstrap) {
  const years = [...new Set(rows.map((row) => row.originYear))].sort();
  return Object.fromEntries(years.map((year) => [
    year,
    scoreCoreRevenuePairedComparison(
      rows.filter((row) => row.originYear === year),
      bootstrap
    )
  ]));
}

function summarizeTimeStability(byYear) {
  const computed = Object.entries(byYear).filter(
    ([, value]) => value.status === "COMPUTED"
  );
  const improvements = computed.map(([year, value]) => ({
    year,
    absoluteImprovement:
      value.baseline.absoluteErrorTotal
      - value.candidate.absoluteErrorTotal,
    relativeWapeFva: value.relativeWapeFva
  }));
  const positive = improvements.filter(
    (item) => item.relativeWapeFva >= 0.01
  );
  const totalPositive = positive.reduce(
    (sum, item) => sum + Math.max(0, item.absoluteImprovement),
    0
  );
  const maximum = Math.max(
    0,
    ...positive.map((item) => Math.max(0, item.absoluteImprovement))
  );
  return {
    evaluatedYearCount: computed.length,
    improvedYearCount: positive.length,
    singleYearDriven:
      totalPositive > 0 && maximum / totalPositive > 0.8
  };
}

function scorePortfolio(rows, privacy) {
  const output = {};
  for (const populationId of ["CORE80", "CORE90"]) {
    output[populationId] = {};
    for (const variant of ["CORE_ONLY", "CORE_PLUS_POOLED_TAIL"]) {
      const values = rows.filter((row) => (
        row.populationId === populationId
        && row.variant === variant
      ));
      output[populationId][variant] = {
        overall: scoreCoreRevenuePublicCell(values, {
          ...privacy,
          portfolio: true
        }),
        byHorizon: scoreCoreRevenueSlices(
          values,
          "horizonMonths",
          { ...privacy, portfolio: true }
        ),
        meanServedCoverage: mean(values.map((row) => (
          row.actual === 0
            ? 0
            : row.servedEligibleActual / row.actual
        )))
      };
    }
  }
  return output;
}

function scoreCaptures({ rolling, finalIndex, horizons }) {
  const records = [];
  for (const origin of rolling.origins) {
    const selections = rolling.selectionRows.filter(
      (row) => row.origin === origin
    );
    for (const horizon of horizons) {
      const allActual = allWindowActual(finalIndex, origin, horizon);
      const futureByWork = [...finalIndex.byWork.keys()].map((workId) => ({
        workId,
        actual: workWindowActual(
          finalIndex,
          workId,
          origin,
          horizon
        )
      })).sort((left, right) => (
        right.actual - left.actual
        || stableTextCompare(left.workId, right.workId)
      ));
      for (const populationId of ["CORE80", "CORE90"]) {
        const flag = populationId.toLowerCase();
        const selected = new Set(
          selections.filter((row) => row[flag]).map(
            (row) => row.standardWorkId
          )
        );
        const selectionActual = sum(futureByWork
          .filter((row) => selected.has(row.workId))
          .map((row) => row.actual));
        const servedActual = sum(rolling.caseRows.filter((row) => (
          row.origin === origin
          && row.horizonMonths === horizon
          && row.populationId === populationId
        )).map((row) => row.actual));
        records.push({
          origin,
          horizonMonths: horizon,
          populationId,
          selectedWorkCount: selected.size,
          allActual,
          selectionActual,
          servedActual
        });
      }
      for (const count of [20, 50]) {
        const selected = new Set(
          selections.filter((row) => row[`top${count}`]).map(
            (row) => row.standardWorkId
          )
        );
        const selectionActual = sum(futureByWork
          .filter((row) => selected.has(row.workId))
          .map((row) => row.actual));
        const oracleActual = sum(
          futureByWork.slice(0, count).map((row) => row.actual)
        );
        records.push({
          origin,
          horizonMonths: horizon,
          populationId: `TOP${count}`,
          selectedWorkCount: selected.size,
          allActual,
          selectionActual,
          oracleActual
        });
      }
    }
  }
  const grouped = groupBy(records, (row) => row.populationId);
  return {
    aggregate: Object.fromEntries([...grouped.entries()].map(
      ([key, values]) => [key, aggregateCapture(values)]
    )),
    byHorizon: Object.fromEntries([...grouped.entries()].map(
      ([key, values]) => [key, Object.fromEntries(
        horizons.map((horizon) => [
          String(horizon),
          aggregateCapture(values.filter(
            (row) => row.horizonMonths === horizon
          ))
        ])
      )]
    ))
  };
}

function aggregateCapture(rows) {
  const denominator = sum(rows.map((row) => row.allActual));
  const selected = sum(rows.map((row) => row.selectionActual));
  const served = sum(rows.map((row) => row.servedActual ?? 0));
  const oracle = sum(rows.map((row) => row.oracleActual ?? 0));
  return {
    originCount: new Set(rows.map((row) => row.origin)).size,
    meanSelectedWorkCount: mean(
      rows.map((row) => row.selectedWorkCount)
    ),
    selectionFutureRevenueCapture:
      denominator === 0 ? null : selected / denominator,
    servedFutureRevenueCapture:
      denominator === 0 || rows.every((row) => row.servedActual === undefined)
        ? null
        : served / denominator,
    futureOracleCapture:
      denominator === 0 || rows.every((row) => row.oracleActual === undefined)
        ? null
        : oracle / denominator
  };
}

function scoreKDiagnostics(rows) {
  const unique = rows.filter((row) => row.horizonMonths === 36);
  const output = {};
  for (const populationId of ["CORE80", "CORE90"]) {
    const values = unique.filter(
      (row) => row.populationId === populationId
    );
    const sourceCounts = countBy(values, (row) => row.kSource);
    const kQuantiles = quantiles(
      values.map((row) => row.k),
      [0, 0.01, 0.05, 0.25, 0.5, 0.75, 0.95, 0.99, 1]
    );
    const lower = kQuantiles["0.01"];
    const upper = kQuantiles["0.99"];
    const extreme = values.filter(
      (row) => row.k <= lower || row.k >= upper
    );
    const totalError = sum(values.map(
      (row) => Math.abs(row.pointEstimate - row.actual)
    ));
    const extremeError = sum(extreme.map(
      (row) => Math.abs(row.pointEstimate - row.actual)
    ));
    const category = values.filter(
      (row) => row.kSource === "CHANNEL_LEVEL2_CATEGORY"
    );
    const chosenError = sum(category.map(
      (row) => Math.abs(row.pointEstimate - row.actual)
    ));
    const channelError = sum(category.map(
      (row) => Math.abs(row.F36ChannelFallback - row.actual)
    ));
    output[populationId] = {
      rowCount: values.length,
      sourceCounts,
      sourceRates: Object.fromEntries(
        Object.entries(sourceCounts).map(([key, count]) => [
          key,
          values.length === 0 ? 0 : count / values.length
        ])
      ),
      supportCountQuantiles: quantiles(
        values.map((row) => row.kSupportCount),
        [0, 0.25, 0.5, 0.75, 1]
      ),
      kQuantiles,
      extremeRowCount: extreme.length,
      extremeAbsoluteErrorShare:
        totalError === 0 ? null : extremeError / totalError,
      categoryFallbackCounterfactual: {
        caseCount: category.length,
        chosenAbsoluteError: chosenError,
        channelFallbackAbsoluteError: channelError,
        relativeImprovement:
          channelError === 0 ? null : 1 - chosenError / channelError
      }
    };
  }
  return output;
}

function scoreFormulaDiagnostics(rows) {
  const output = {};
  for (const populationId of ["CORE80", "CORE90"]) {
    const h12 = rows.filter((row) => (
      row.populationId === populationId
      && row.horizonMonths === 12
    ));
    const h36 = rows.filter((row) => (
      row.populationId === populationId
      && row.horizonMonths === 36
    ));
    output[populationId] = {
      frozenF12: scoreCoreRevenuePointRows(h12),
      s12Only: scoreCoreRevenuePointRows(h12.map((row) => ({
        actual: row.actual,
        pointEstimate: row.S12
      }))),
      latestMonthAnnualized: scoreCoreRevenuePointRows(h12.map((row) => ({
        actual: row.actual,
        pointEstimate: row.M1 * 12
      }))),
      frozenF36: scoreCoreRevenuePointRows(h36),
      noGrowthK1F36: scoreCoreRevenuePointRows(h36.map((row) => ({
        actual: row.actual,
        pointEstimate: row.F36OneFallback
      }))),
      slopeSignCounts: countBy(h12, (row) => (
        row.b6 > 0 ? "POSITIVE" : row.b6 < 0 ? "NEGATIVE" : "ZERO"
      )),
      nonfinitePredictionCount: rows.filter(
        (row) => !Number.isFinite(row.pointEstimate)
      ).length
    };
  }
  return output;
}

function buildPublicResult({
  config,
  preflight,
  authority,
  authorityStartMonth,
  labelMaturityCutoff,
  finalRestatement,
  metadata,
  rolling,
  evaluation,
  asOfAudit
}) {
  return {
    schema:
      "m2.current.core_revenue_manual.development_evaluation.public.v0.1",
    asOf: config.asOf,
    model: {
      stableModelId: config.model.stableModelId,
      displayNameZh: config.model.displayNameZh,
      displayNameEn: config.model.displayNameEn,
      experimentId: config.model.experimentId
    },
    status: evaluation.decision.status,
    decision: evaluation.decision,
    execution: {
      repository: preflight.repository,
      branch: preflight.branch,
      exactHead: preflight.head,
      draftPrNumber: preflight.prNumber,
      draftPrUrl: preflight.prUrl,
      draftOpenUnmerged: true,
      ciRunId: preflight.ciRunId,
      linuxCi: preflight.linux,
      windowsCi: preflight.windows,
      firstValidEvaluationProduced: true,
      formulaTuningPerformed: false,
      modelTrainingPerformed: false,
      modelSelectionPerformed: false
    },
    authority: {
      cashAuthority: "user_reviewed_sales_share_workbook_membership",
      actualDefinitionId: config.target.actualDefinitionId,
      postingMonthField: "billMonth",
      authorityStartMonth,
      labelMaturityCutoff,
      salesShareRowCount: authority.rowCount,
      workCount: authority.workCount,
      channelCount: authority.channelCount,
      reversalRowCount: authority.reversalRowCount,
      modelableRestatedCash:
        minorToNumber(
          BigInt(finalRestatement.modelableRestatedRevenueMinor),
          authority.scalePower
        ),
      excludedUnallocatedReversalResidual:
        minorToNumber(
          BigInt(
            finalRestatement.excludedUnallocatedReversalResidualMinor
          ),
          authority.scalePower
        ),
      conservationDifferenceMinor:
        finalRestatement.conservationDifferenceMinor,
      originalReversalRowsDeleted: 0,
      allocatedReversalComponentPreserved: true,
      wholeCaseExclusionUsed: false,
      futureFeatureLeakageCount: sum(
        asOfAudit.map(() => 0)
      )
    },
    population: {
      legalOriginCount: rolling.origins.length,
      firstOrigin: rolling.origins[0],
      lastOrigin: rolling.origins.at(-1),
      candidateWorkChannelRowCount: rolling.caseRows.length,
      candidateWorkAnnualRowCount: rolling.annualComponentRows.length,
      categoryMetadataStatus: metadata.categoryStatus,
      categoryMetadataWorkCount: metadata.workCategoryCount,
      canonicalChannelMetadataCount: metadata.channelCount
    },
    captures: evaluation.captures,
    candidate: evaluation.candidate,
    comparators: evaluation.comparison,
    portfolio: evaluation.portfolio,
    kDiagnostics: evaluation.kDiagnostics,
    formulaDiagnostics: evaluation.formulaDiagnostics,
    comparatorConflicts: evaluation.comparatorConflicts,
    privacy: {
      minimumCaseCount: 30,
      minimumWorkCount: 20,
      minimumPortfolioOriginCount: 5,
      rowLevelPrivateDataIncluded: false,
      platformSlicesAnonymized: true
    },
    evidenceBoundaries: {
      activeCandidate: null,
      approvedForAutomation: null,
      operationalFallbackChanged: false,
      researchBaselineParametersChanged: false,
      productionChanged: false,
      laterOriginRead: false,
      finalHoldoutRead: false,
      providerUsed: false,
      databaseUsed: false,
      canaryOrFull160Used: false,
      releaseUsed: false,
      m3FormalUsed: false
    },
    privateArtifactClasses: {
      authoritative: [
        "reviewed_total_ledger",
        "reviewed_sales_share_ledger",
        "reviewed_buyout_ledger",
        "work_mapping_authority",
        "canonical_channel_master"
      ],
      rebuildable: [
        "reversal_authority_export",
        "as_of_and_final_restatement",
        "static_metadata_cache",
        "candidate_rows",
        "evaluation_rows",
        "comparator_match_index"
      ],
      historicalTraceOnly: [
        "old_machine_paths",
        "old_transport_hashes",
        "old_execution_receipts"
      ]
    }
  };
}

async function writePrivateOutputs({
  config,
  privateDirectory,
  authority,
  finalMonthlyRows,
  rolling,
  workRows,
  evaluation,
  preflight,
  publicResult
}) {
  const authorityProfile = path.join(
    privateDirectory,
    config.privateOutputs.authorityProfile
  );
  const monthlyPath = path.join(
    privateDirectory,
    config.privateOutputs.monthlyRows
  );
  const candidatePath = path.join(
    privateDirectory,
    config.privateOutputs.candidateRows
  );
  const evaluationPath = path.join(
    privateDirectory,
    config.privateOutputs.evaluationRows
  );
  const manifestPath = path.join(
    privateDirectory,
    config.privateOutputs.manifest
  );
  const receiptPath = path.join(
    privateDirectory,
    config.privateOutputs.receipt
  );
  await writeFile(authorityProfile, `${JSON.stringify({
    schema:
      "m2.current.core_revenue_manual.authority_profile.private.v0.1",
    factDigest: authority.factDigest,
    sourceDigest: authority.sourceDigest,
    sourceDigests: authority.sourceDigests,
    mappingArtifactDigests: authority.mappingArtifactDigests,
    rowCount: authority.rowCount,
    workCount: authority.workCount,
    channelCount: authority.channelCount,
    reversalRowCount: authority.reversalRowCount,
    scalePower: authority.scalePower
  }, null, 2)}\n`, "utf8");
  await writeNdjson(monthlyPath, finalMonthlyRows.map((row) => ({
    rowType: "FINAL_DEVELOPMENT_MODELABLE_MONTH",
    ...row
  })));
  await writeNdjson(candidatePath, [
    ...rolling.caseRows.map((row) => ({
      rowType: "WORK_CHANNEL_CASE",
      ...row
    })),
    ...rolling.annualComponentRows.map((row) => ({
      rowType: "WORK_CHANNEL_ANNUAL_COMPONENT",
      ...row
    })),
    ...rolling.portfolioRows.map((row) => ({
      rowType: "PORTFOLIO_CASE",
      ...row
    })),
    ...rolling.portfolioAnnualRows.map((row) => ({
      rowType: "PORTFOLIO_ANNUAL_COMPONENT",
      ...row
    })),
    ...rolling.selectionRows.map((row) => ({
      rowType: "ORIGIN_SELECTION",
      ...row
    }))
  ]);
  await writeNdjson(evaluationPath, workRows.map((row) => ({
    rowType: "WORK_AGGREGATE_EVALUATION",
    ...row
  })));
  const bindings = {};
  for (const [name, filePath] of Object.entries({
    authorityProfile,
    monthlyRows: monthlyPath,
    candidateRows: candidatePath,
    evaluationRows: evaluationPath
  })) {
    bindings[name] = {
      sha256: await sha256File(filePath),
      bytes: (await stat(filePath)).size
    };
  }
  await writeFile(manifestPath, `${JSON.stringify({
    schema:
      "m2.current.core_revenue_manual.manifest.private.v0.1",
    status: "VALID_EVALUATION_COMPLETE",
    modelId: config.model.stableModelId,
    actualDefinitionId: config.target.actualDefinitionId,
    exactHead: preflight.head,
    legalOriginCount: rolling.origins.length,
    counts: {
      finalMonthlyRows: finalMonthlyRows.length,
      channelCaseRows: rolling.caseRows.length,
      annualComponentRows: rolling.annualComponentRows.length,
      portfolioRows: rolling.portfolioRows.length,
      selectionRows: rolling.selectionRows.length,
      workEvaluationRows: workRows.length
    },
    outputBindings: bindings,
    decision: evaluation.decision
  }, null, 2)}\n`, "utf8");
  await writeFile(receiptPath, `${JSON.stringify({
    schema:
      "m2.current.core_revenue_manual.run_receipt.private.v0.1",
    status: "VALID_EVALUATION_COMPLETE",
    executionHead: preflight.head,
    branch: preflight.branch,
    draftPrNumber: preflight.prNumber,
    ciRunId: preflight.ciRunId,
    linuxCi: preflight.linux,
    windowsCi: preflight.windows,
    command: "npm run develop:m2:current:core-revenue-manual",
    validModelConclusionProduced: true,
    resultStatus: publicResult.status,
    formulaTuningPerformed: false,
    modelTrainingPerformed: false,
    modelSelectionPerformed: false,
    activeCandidateChanged: false,
    approvedForAutomationChanged: false,
    productionChanged: false,
    manifestSha256: await sha256File(manifestPath)
  }, null, 2)}\n`, "utf8");
}

async function writePublicOutputs({ root, config, publicResult }) {
  const jsonPath = path.join(root, config.publicOutputs.evaluation);
  const reportPath = path.join(root, config.publicOutputs.report);
  await writeFile(
    jsonPath,
    `${JSON.stringify(publicResult, null, 2)}\n`,
    "utf8"
  );
  await writeFile(reportPath, renderPublicReport(publicResult), "utf8");
}

function renderPublicReport(result) {
  const core80 = result.captures.aggregate.CORE80;
  const core90 = result.captures.aggregate.CORE90;
  const top20 = result.captures.aggregate.TOP20;
  const top50 = result.captures.aggregate.TOP50;
  const comparisonRows = ["CORE80", "CORE90"].flatMap(
    (population) => ["M2-WORK-LG01", "M2-WORK-OA03"].map((modelId) => {
      const value = result.comparators[population][modelId];
      return `| ${population} | ${modelId} | ${value.status} | ${
        metric(value.primary, "candidate", "wape")
      } | ${metric(value.primary, "baseline", "wape")} | ${
        formatPercent(value.primary?.relativeWapeFva)
      } |`;
    })
  ).join("\n");
  const horizonRows = ["CORE80", "CORE90"].flatMap(
    (population) => [3, 6, 12, 36].map((horizon) => {
      const value = result.candidate[population].byHorizon[String(horizon)];
      return `| ${population} | ${horizon} | ${
        formatMetric(value, "wape")
      } | ${formatMetric(value, "signedBias")} | ${
        formatMetric(value, "mae")
      } |`;
    })
  ).join("\n");
  const kRows = ["CORE80", "CORE90"].map((population) => {
    const value = result.kDiagnostics[population];
    return `| ${population} | ${value.rowCount} | ${
      JSON.stringify(value.sourceRates)
    } | ${formatNumber(value.kQuantiles["0.5"])} | ${
      formatNumber(value.kQuantiles["0.99"])
    } | ${formatPercent(
      value.categoryFallbackCounterfactual.relativeImprovement
    )} |`;
  }).join("\n");
  return `# M2 核心收入人工规则基线 v0.1 开发评价

中文名称：核心收入人工规则基线 v0.1
英文名称：Core-Revenue Manual Rule Baseline v0.1
稳定模型 ID：\`${result.model.stableModelId}\`
实验 ID：\`${result.model.experimentId}\`
结论：\`${result.status}\`

## 1. 简明结论

本次已产生首个完整、有效、可解释的真实账单开发评价，因此冻结公式的执行窗口到此
停止。结论理由为 \`${result.decision.reason}\`。这是一项开发证据，不是模型训练、
选模或生产授权；现行运行回退、研究比较基线、活动候选、自动化和 production
均未改变。

## 2. Core80/Core90 与 Top20/Top50 收入捕获

| 人口 | 平均作品数 | 未来作品选择捕获率 | 正式可服务渠道捕获率 | 未来 oracle 捕获率 |
| --- | ---: | ---: | ---: | ---: |
| Core80 | ${formatNumber(core80.meanSelectedWorkCount)} | ${formatPercent(core80.selectionFutureRevenueCapture)} | ${formatPercent(core80.servedFutureRevenueCapture)} | — |
| Core90 | ${formatNumber(core90.meanSelectedWorkCount)} | ${formatPercent(core90.selectionFutureRevenueCapture)} | ${formatPercent(core90.servedFutureRevenueCapture)} | — |
| 起点 Top20 | ${formatNumber(top20.meanSelectedWorkCount)} | ${formatPercent(top20.selectionFutureRevenueCapture)} | — | ${formatPercent(top20.futureOracleCapture)} |
| 起点 Top50 | ${formatNumber(top50.meanSelectedWorkCount)} | ${formatPercent(top50.selectionFutureRevenueCapture)} | — | ${formatPercent(top50.futureOracleCapture)} |

## 3. 与冻结比较基线的同人口成绩

| 人口 | 比较模型 | 可比状态 | 候选 WAPE | 基线 WAPE | 相对 FVA |
| --- | --- | --- | ---: | ---: | ---: |
${comparisonRows}

无法形成相同 origin、horizon、作品人口和开发可建模 actual 的单元保持
\`NOT_COMPARABLE\`；未用其他单元或历史成绩填补。

## 4. 3/6/12/36 月成绩

| 人口 | horizon（月） | WAPE | signed bias | MAE |
| --- | ---: | ---: | ---: | ---: |
${horizonRows}

Y1/Y2/Y3 已单独评分并保存在机器结果中。公式诊断同时比较冻结 F12 与
S12-only、最新月年化，以及冻结 F36 与 k=1 的反事实，不用反事实替换原始候选。

## 5. 长尾池与全组合

Core-only 和 core + pooled tail 均以全部未来分成目标现金为 actual；前者把长尾
预测固定为 0，只用于覆盖不足诊断。两种方案的总体与分 horizon 指标见机器 JSON
的 \`portfolio\`。

## 6. k 来源、极端值与分类回退

| 人口 | F36 行数 | k 来源率 | k 中位数 | k P99 | 分类回退相对渠道回退误差改善 |
| --- | ---: | --- | ---: | ---: | ---: |
${kRows}

分类结果只用于预登记的 k 回退与诊断，没有形成金额倍率。极端 k 使用本次分布的
P1/P99 做事后归因，没有 clamp，也没有进入门禁选择。

## 7. 九个必须回答的问题

1. Core80/Core90 的未来选择捕获率和正式可服务捕获率见第 2 节；二者没有混写。
2. 起点 Top20/Top50 与未来 oracle 捕获率同时披露，正式选择没有读取未来现金。
3. 相对 LG01/OA03 的结论只来自第 3 节的 same-case 行；不可比处没有命名胜负。
4. 3/6/12/36 月及 Y1/Y2/Y3 均分别评价，未用总体平均掩盖失败 horizon。
5. 最新月年化、S12、斜率高低值选择和长期 k 的反事实误差均在
   \`formulaDiagnostics\`；核心人口捕获单独在 \`captures\`。
6. 长尾改善由 \`portfolio\` 中 core-only 与 core + pooled tail 的同 actual
   配对差异回答。
7. 分类回退的真实增量由 \`kDiagnostics.*.categoryFallbackCounterfactual\`
   回答；没有因结果删除或修改该回退。
8. 头部系统性低估由 Top20/Top50 的 signed bias 和捕获率共同判断。
9. 后续是否保留、修改或删除组件必须由用户基于本报告另行授权；本轮没有继续调参。

## 8. 权威、缓存和历史溯源

- 权威源：人工复核的总账/分成账/买断账、作品映射权威、canonical 渠道主表。
- 可重建缓存：冲销权威展开、as-of/final 重述、静态元数据、候选行、评价行和比较索引。
- 历史溯源：旧机器路径、运输 hash 和旧 receipt；缺失不构成本轮门禁。

## 9. 执行与禁止范围

执行 HEAD 为 \`${result.execution.exactHead}\`；Linux 与 Windows exact-head CI
均为 success，Draft PR #${result.execution.draftPrNumber} 保持 Open/Unmerged。
本次没有训练、调参、选模、final holdout、later-origin、provider、数据库、
Canary/full160、release 或 M3 formal，也没有改变 \`activeCandidate=null\`、
\`approvedForAutomation=null\` 和 production。
`;
}

function anonymizedChannelSlices(rows, privacy) {
  const groups = groupBy(rows, (row) => row.channelUid);
  const ordered = [...groups.entries()].sort((left, right) => (
    sum(right[1].map((row) => Math.abs(row.actual)))
    - sum(left[1].map((row) => Math.abs(row.actual)))
    || stableTextCompare(left[0], right[0])
  ));
  return Object.fromEntries(ordered.map(([, values], index) => [
    `PLATFORM_${String(index + 1).padStart(2, "0")}`,
    scoreCoreRevenuePublicCell(values, privacy)
  ]));
}

function selectionFlag(selectionIndex, row, field) {
  return selectionIndex.get(
    `${row.origin}\u0000${row.standardWorkId}`
  )?.[field] === true;
}

function workWindowActual(index, workId, origin, horizon) {
  const months = index.byWork.get(workId) ?? new Map();
  const start = monthToSerial(origin) + 1;
  let total = 0;
  for (let serial = start; serial < start + horizon; serial += 1) {
    total += months.get(serial) ?? 0;
  }
  return total;
}

function allWindowActual(index, origin, horizon) {
  const start = monthToSerial(origin) + 1;
  let total = 0;
  for (let serial = start; serial < start + horizon; serial += 1) {
    total += index.all.get(serial) ?? 0;
  }
  return total;
}

function assertPublicSafe(value) {
  const text = JSON.stringify(value);
  if (
    /standardWorkId|channelUid|channelMemberId|authorityRecordId|privatePath|privateReceiptPath/u
      .test(text)
    || /chn_[a-f0-9]+/u.test(text)
  ) {
    throw new Error(
      "m2_core_revenue_manual_public_artifact_private_field_found"
    );
  }
}

async function writeNdjson(filePath, rows) {
  const temporary = `${filePath}.tmp`;
  const stream = fs.createWriteStream(temporary, {
    encoding: "utf8"
  });
  for (const row of rows) {
    if (!stream.write(`${JSON.stringify(row)}\n`)) {
      await new Promise((resolve) => stream.once("drain", resolve));
    }
  }
  await new Promise((resolve, reject) => {
    stream.end(resolve);
    stream.on("error", reject);
  });
  await rename(temporary, filePath);
}

async function forEachNdjson(filePath, callback) {
  const input = fs.createReadStream(filePath, { encoding: "utf8" });
  const lines = readline.createInterface({
    input,
    crlfDelay: Infinity
  });
  for await (const line of lines) {
    if (line !== "") callback(JSON.parse(line));
  }
}

async function sha256File(filePath) {
  const digest = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(filePath)) {
    digest.update(chunk);
  }
  return digest.digest("hex");
}

function decimalToMinor(value, scalePower) {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/u.exec(String(value).trim());
  if (!match || (match[3] ?? "").length > scalePower) {
    throw new Error("m2_core_revenue_manual_decimal_invalid");
  }
  const digits = `${match[2]}${(match[3] ?? "").padEnd(
    scalePower,
    "0"
  )}`;
  const amount = BigInt(digits);
  return match[1] === "-" ? -amount : amount;
}

function minorToNumber(value, scalePower) {
  return Number(value) / 10 ** scalePower;
}

function run(root, executable, args) {
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    shell: false,
    maxBuffer: 16 * 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error(
      `m2_core_revenue_manual_command_failed:${path.basename(executable)}`
    );
  }
  return result.stdout;
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

function safeErrorCode(error) {
  const value = String(error?.message ?? error ?? "unknown_error");
  return /^[a-z0-9_:-]+$/iu.test(value)
    ? value.slice(0, 240)
    : "m2_core_revenue_manual_private_execution_failed";
}

function groupBy(rows, keyOf) {
  const output = new Map();
  for (const row of rows) {
    const key = String(keyOf(row));
    const values = output.get(key) ?? [];
    values.push(row);
    output.set(key, values);
  }
  return output;
}

function countBy(rows, keyOf) {
  const output = {};
  for (const row of rows) {
    const key = String(keyOf(row));
    output[key] = (output[key] ?? 0) + 1;
  }
  return output;
}

function mean(values) {
  return values.length === 0 ? null : sum(values) / values.length;
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value), 0);
}

function compareEvaluationRows(left, right) {
  return (
    stableTextCompare(left.populationId, right.populationId)
    || stableTextCompare(left.origin, right.origin)
    || stableTextCompare(left.standardWorkId, right.standardWorkId)
    || left.horizonMonths - right.horizonMonths
  );
}

function stableTextCompare(left, right) {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

function metric(value, object, field) {
  return formatNumber(value?.[object]?.[field]);
}

function formatMetric(value, field) {
  return formatNumber(value?.metrics?.[field]);
}

function formatNumber(value) {
  return Number.isFinite(value) ? Number(value).toFixed(6) : "—";
}

function formatPercent(value) {
  return Number.isFinite(value)
    ? `${(Number(value) * 100).toFixed(2)}%`
    : "—";
}
