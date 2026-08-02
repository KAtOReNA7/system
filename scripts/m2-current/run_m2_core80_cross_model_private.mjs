import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import {
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { createInterface } from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  allocateCmx01Trailing12Channels,
  addMonths,
  buildCmx01OriginGrid,
  buildCmx01Checkpoint,
  sha256Canonical
} from "../../src/domain/m2Current/core80CrossModelEvaluation.js";
import {
  buildReversalScopeKeyV1,
  restateSalesShareReversalsV1
} from "../../src/domain/m2Current/reversalRestatement.js";
import {
  buildCoreLegacyWorkCases
} from "../../src/domain/m2Current/coreLegacyPopulation.js";
import {
  forecastM2CurrentBaselines
} from "../../src/domain/m2Current/baselines.js";
import {
  forecastM2CurrentManualChannelRule
} from "../../src/domain/m2Current/manualChannel.js";
import {
  fitM2HumanAnchoredModel,
  forecastM2HumanAnchoredBase,
  predictM2HumanAnchored
} from "../../src/domain/m2Current/humanAnchored.js";
import {
  strictRollingM2HumanAnchoredTsb
} from "../../src/domain/m2Current/humanAnchoredTsb.js";
import {
  buildM2ChannelPlatformIndex,
  fitM2ChannelExpertModel,
  predictM2ChannelExperts
} from "../../src/domain/m2Current/channelExperts.js";
import {
  M2_PUBLISHING_SCALE_RAW_CANDIDATE_ID,
  strictRollingM2PublishingScaleChannel,
  validateM2PublishingScaleConfig
} from "../../src/domain/m2Current/publishingScaleChannelCore.js";
import {
  buildM2CoreHorizonAmountFeatureRow,
  fitM2CoreHorizonAmountModel,
  predictM2CoreHorizonAmount,
  signedLog1p
} from "../../src/domain/m2Current/coreLegacyHorizonAmount.js";
import {
  selectM2CoreLegacyHorizonModel
} from "../../src/domain/m2Current/coreLegacyHorizonRouter.js";
import {
  forecastM2CurrentCanonicalChannelCase
} from "../../src/domain/m2Current/canonicalChannelModel.js";
import {
  runCoreRevenueManualRolling
} from "../../src/domain/m2Current/coreRevenueManual.js";
import {
  scoreM2CurrentPointRows
} from "../../src/domain/m2Current/metrics.js";


const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outputDirectory = path.join(
  root,
  "data/private-output/m2-core80-cross-model-real-business-evaluation-v0.1"
);
const authorityFactsPath = path.join(
  outputDirectory,
  "M2-CMX01-sales-share-authority-private-v0.1.ndjson"
);
const authorityReceiptPath = path.join(
  outputDirectory,
  "M2-CMX01-materialization-receipt-private-v0.1.json"
);
const metadataPath = path.join(
  outputDirectory,
  "M2-CMX01-static-metadata-private-v0.1.json"
);
const casePath = path.join(
  outputDirectory,
  "M2-CMX01-base-work-cases-private-v0.1.ndjson"
);
const channelCasePath = path.join(
  outputDirectory,
  "M2-CMX01-base-work-channel-cases-private-v0.1.ndjson"
);
const populationPath = path.join(
  outputDirectory,
  "M2-CMX01-origin-population-private-v0.1.ndjson"
);
const caseManifestPath = path.join(
  outputDirectory,
  "M2-CMX01-case-manifest-private-v0.1.json"
);
const checkpointPath = path.join(
  outputDirectory,
  "M2-CMX01-checkpoint-private-v0.1.json"
);
const simpleWorkPredictionPath = path.join(
  outputDirectory,
  "M2-CMX01-simple-work-predictions-private-v0.1.ndjson"
);
const simpleChannelPredictionPath = path.join(
  outputDirectory,
  "M2-CMX01-crmr01-native-channel-predictions-private-v0.1.ndjson"
);
const allocatorSharePath = path.join(
  outputDirectory,
  "M2-CMX01-common-allocator-shares-private-v0.1.ndjson"
);
const simpleManifestPath = path.join(
  outputDirectory,
  "M2-CMX01-simple-model-manifest-private-v0.1.json"
);
const humanInputPath = path.join(
  outputDirectory,
  "M2-CMX01-human-anchored-input-private-v0.1.ndjson"
);
const humanInputManifestPath = path.join(
  outputDirectory,
  "M2-CMX01-human-anchored-input-manifest-private-v0.1.json"
);
const humanPredictionPath = path.join(
  outputDirectory,
  "M2-CMX01-human-anchored-predictions-private-v0.1.ndjson"
);
const humanManifestPath = path.join(
  outputDirectory,
  "M2-CMX01-human-anchored-model-manifest-private-v0.1.json"
);
const tsbPredictionPath = path.join(
  outputDirectory,
  "M2-CMX01-tsb-predictions-private-v0.1.ndjson"
);
const tsbManifestPath = path.join(
  outputDirectory,
  "M2-CMX01-tsb-model-manifest-private-v0.1.json"
);
const chamInputPath = path.join(
  outputDirectory,
  "M2-CMX01-cham01-input-private-v0.1.ndjson"
);
const chamInputManifestPath = path.join(
  outputDirectory,
  "M2-CMX01-cham01-input-manifest-private-v0.1.json"
);
const chamPredictionPath = path.join(
  outputDirectory,
  "M2-CMX01-cham01-predictions-private-v0.1.ndjson"
);
const chamManifestPath = path.join(
  outputDirectory,
  "M2-CMX01-cham01-model-manifest-private-v0.1.json"
);
const routerPredictionPath = path.join(
  outputDirectory,
  "M2-CMX01-horizon-router-predictions-private-v0.1.ndjson"
);
const routerManifestPath = path.join(
  outputDirectory,
  "M2-CMX01-horizon-router-manifest-private-v0.1.json"
);
const sclWorkPredictionPath = path.join(
  outputDirectory,
  "M2-CMX01-scl01-work-predictions-private-v0.1.ndjson"
);
const sclChannelPredictionPath = path.join(
  outputDirectory,
  "M2-CMX01-scl01-native-channel-predictions-private-v0.1.ndjson"
);
const sclManifestPath = path.join(
  outputDirectory,
  "M2-CMX01-scl01-model-manifest-private-v0.1.json"
);
const pscWorkPredictionPath = path.join(
  outputDirectory,
  "M2-CMX01-psc01-work-predictions-private-v0.1.ndjson"
);
const pscChannelPredictionPath = path.join(
  outputDirectory,
  "M2-CMX01-psc01-native-channel-predictions-private-v0.1.ndjson"
);
const pscManifestPath = path.join(
  outputDirectory,
  "M2-CMX01-psc01-model-manifest-private-v0.1.json"
);
const contractPath = path.join(
  root,
  "config/m2-core80-cross-model-evaluation.v0.1.json"
);
const populationConfigPath = path.join(
  root,
  "config/m2-current-core-legacy-population.v0.1.json"
);
const humanConfigPath = path.join(
  root,
  "config/m2-current-human-anchored.v0.1.json"
);
const manualChannelConfigPath = path.join(
  root,
  "config/m2-current-manual-channel.v0.1.json"
);
const canonicalChannelConfigPath = path.join(
  root,
  "config/m2-current-canonical-channel.v0.1.json"
);
const coreRevenueConfigPath = path.join(
  root,
  "config/m2-current-core-revenue-manual.v0.1.json"
);


const stage = optionValue("--stage") ?? "all";
await mkdir(outputDirectory, { recursive: true });
if (stage === "cases" || stage === "all") {
  await buildCases();
}
if (stage === "simple-models" || stage === "all") {
  await runSimpleModels();
}
if (stage === "human-input" || stage === "all") {
  await buildHumanInput();
}
if (stage === "human-models" || stage === "all") {
  await runHumanModels();
}
if (stage === "tsb-models" || stage === "all") {
  await runTsbModels();
}
if (stage === "cham-input" || stage === "all") {
  await buildChamInput();
}
if (stage === "cham-models" || stage === "all") {
  await runChamModels();
}
if (stage === "router" || stage === "all") {
  await runHorizonRouter();
}
if (stage === "channel-experts" || stage === "all") {
  await runChannelExperts();
}
if (stage === "publishing-scale" || stage === "all") {
  await runPublishingScaleChannel();
}
if (![
  "cases",
  "simple-models",
  "human-input",
  "human-models",
  "tsb-models",
  "cham-input",
  "cham-models",
  "router",
  "channel-experts",
  "publishing-scale",
  "all"
].includes(stage)) {
  throw new Error(`m2_cmx01_unknown_stage:${stage}`);
}


async function buildCases() {
  const [contract, populationConfig, receipt, metadata] = await Promise.all([
    readJson(contractPath),
    readJson(populationConfigPath),
    readJson(authorityReceiptPath),
    readJson(metadataPath)
  ]);
  if (
    receipt.schema !== "m2.cmx01.materialization_receipt.private.v0.1"
    || receipt.status !== "READY"
    || receipt.actualDefinitionId
      !== "M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01"
    || receipt.partitionAudit?.fullPartitionMissingRows !== 0
    || receipt.partitionAudit?.fullPartitionExtraRows !== 3
    || JSON.stringify(receipt.partitionAudit?.fullPartitionExtraMonths)
      !== JSON.stringify(["2026-05"])
    || receipt.partitionAudit?.targetWindowPartitionExact !== true
    || receipt.channelMappingAudit?.targetWindowUnmappedRowCount !== 0
  ) {
    throw new Error("m2_cmx01_authority_receipt_invalid");
  }
  const [factsDigest, metadataDigest] = await Promise.all([
    sha256File(authorityFactsPath),
    sha256File(metadataPath)
  ]);
  if (
    factsDigest !== receipt.authorityFactsSha256
    || metadataDigest !== receipt.metadataSha256
  ) {
    throw new Error("m2_cmx01_materialization_digest_mismatch");
  }
  const authority = await loadAuthorityRows(receipt);
  const finalRestatement = restateSalesShareReversalsV1(authority.rows, {
    cutoff: receipt.lastBillMonth,
    authorityStartMonth: receipt.firstBillMonth
  });
  assertRestatementUsable(finalRestatement);
  const metadataIndex = buildMetadataIndex(metadata);
  const finalMonthlyRows = restatementMonthlyRows(
    finalRestatement,
    metadataIndex,
    authority.scalePower
  );
  const grid = buildCmx01OriginGrid({
    firstTargetMonth: contract.evaluationWindow.firstTargetMonth,
    lastTargetMonth: contract.evaluationWindow.lastTargetMonth,
    horizons: contract.evaluationWindow.horizons
  });
  if (
    grid.cells.length
      !== contract.evaluationWindow.expectedOriginHorizonCellCount
    || JSON.stringify(grid.countsByHorizon)
      !== JSON.stringify(contract.evaluationWindow.expectedCountsByHorizon)
  ) {
    throw new Error("m2_cmx01_origin_grid_drift");
  }
  const cellsByOrigin = groupBy(grid.cells, (cell) => cell.origin);
  const caseTemporary = `${casePath}.tmp`;
  const channelTemporary = `${channelCasePath}.tmp`;
  const populationTemporary = `${populationPath}.tmp`;
  await Promise.all([
    rm(caseTemporary, { force: true }),
    rm(channelTemporary, { force: true }),
    rm(populationTemporary, { force: true })
  ]);
  const caseWriter = createWriteStream(caseTemporary, { encoding: "utf8" });
  const channelWriter = createWriteStream(channelTemporary, { encoding: "utf8" });
  const populationWriter = createWriteStream(populationTemporary, { encoding: "utf8" });
  let workCaseCount = 0;
  let channelCaseCount = 0;
  let originCount = 0;
  let immatureChannelCaseCount = 0;
  let delayedWorkLabelCaseCount = 0;
  let delayedChannelLabelCaseCount = 0;
  const eligibleWorks = new Set();
  const eligibleChannels = new Set();
  for (const [origin, cells] of [...cellsByOrigin.entries()].sort()) {
    const asOf = restateSalesShareReversalsV1(authority.rows, {
      cutoff: origin,
      authorityStartMonth: receipt.firstBillMonth
    });
    assertRestatementUsable(asOf);
    const featureRows = restatementMonthlyRows(
      asOf,
      metadataIndex,
      authority.scalePower
    );
    const horizons = cells.map((cell) => cell.horizonMonths)
      .sort((left, right) => left - right);
    const built = buildCoreLegacyWorkCases({
      origins: [origin],
      horizons,
      finalMonthlyRows,
      featureMonthlyRowsForOrigin: () => featureRows,
      config: populationConfig
    });
    const cashBands = buildCashBands(built.workCases);
    const annualCoreFlags = buildAnnualActualCoreFlags(built.workCases, cells);
    for (const row of built.workCases) {
      const work = metadataIndex.workById.get(row.standardWorkId);
      if (!work) throw new Error("m2_cmx01_work_metadata_missing");
      const key = `${row.standardWorkId}\u001f${row.origin}\u001f${row.horizonMonths}`;
      const annualFlag = annualCoreFlags.get(key) ?? false;
      const enriched = {
        ...row,
        targetStart: addMonths(row.origin, 1),
        targetYear: row.targetEnd.slice(0, 4),
        dynamicCore80Flag: row.core80 === true,
        annualActualCore80Flag: annualFlag,
        cashBandId: row.core80 ? cashBands.get(row.standardWorkId) ?? null : null,
        workTitle: work.workTitle,
        rightsStartMonth: work.rightsStartMonth,
        dataAuthority:
          "M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01",
        originSafeStatus: "ORIGIN_VISIBLE_DYNAMIC_POPULATION_PASS"
      };
      writeNdjson(caseWriter, enriched);
      workCaseCount += 1;
      if (row.labelAvailableAsOf > row.targetEnd) {
        delayedWorkLabelCaseCount += 1;
      }
      eligibleWorks.add(row.standardWorkId);
    }
    for (const row of built.channelCases) {
      const channel = metadataIndex.channelById.get(row.channelUid);
      const work = metadataIndex.workById.get(row.standardWorkId);
      if (!channel || !work) {
        throw new Error("m2_cmx01_channel_case_metadata_missing");
      }
      const workKey = `${row.standardWorkId}\u001f${row.origin}\u001f${row.horizonMonths}`;
      const workCase = built.workCases.find((candidate) => (
        candidate.standardWorkId === row.standardWorkId
        && candidate.origin === row.origin
        && candidate.horizonMonths === row.horizonMonths
      ));
      const enriched = {
        ...row,
        targetStart: addMonths(row.origin, 1),
        targetEnd: addMonths(row.origin, row.horizonMonths),
        targetYear: addMonths(row.origin, row.horizonMonths).slice(0, 4),
        dynamicCore80Flag: row.core80 === true,
        annualActualCore80Flag:
          annualCoreFlags.get(workKey) ?? false,
        cashBandId: row.core80 ? cashBands.get(row.standardWorkId) ?? null : null,
        workTitle: work.workTitle,
        channelName: channel.channelName,
        channelIdentityStatus: channel.identityStatus,
        dataAuthority:
          "M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01",
        originSafeStatus: "ORIGIN_OBSERVED_MATURE_CHANNEL_PASS",
        workActual: workCase?.actual ?? null
      };
      writeNdjson(channelWriter, enriched);
      channelCaseCount += 1;
      if (row.labelAvailableAsOf > enriched.targetEnd) {
        delayedChannelLabelCaseCount += 1;
      }
      eligibleChannels.add(row.channelUid);
    }
    for (const row of built.populationRows) writeNdjson(populationWriter, row);
    immatureChannelCaseCount += built.immatureChannelCases.length;
    originCount += 1;
    const checkpoint = buildCmx01Checkpoint({
      contractSha256: await sha256File(contractPath),
      sourceSnapshotSha256: sha256Canonical(contract.sourceSnapshot),
      completedPartitions: [...cellsByOrigin.keys()].sort()
        .slice(0, originCount),
      outputDigests: {}
    });
    await writeJsonAtomic(checkpointPath, checkpoint);
    process.stdout.write(
      `[M2-CMX01] cases ${originCount}/${cellsByOrigin.size} ${origin}\n`
    );
  }
  await Promise.all([
    closeWriter(caseWriter),
    closeWriter(channelWriter),
    closeWriter(populationWriter)
  ]);
  await Promise.all([
    rename(caseTemporary, casePath),
    rename(channelTemporary, channelCasePath),
    rename(populationTemporary, populationPath)
  ]);
  const manifest = {
    schema: "m2.cmx01.case_manifest.private.v0.1",
    status: "COMPLETE",
    tracked: false,
    campaignId: contract.campaignId,
    sourceSnapshotSha256: sha256Canonical(contract.sourceSnapshot),
    authorityFactsSha256: factsDigest,
    finalRestatement: {
      status: finalRestatement.status,
      scopeCount: finalRestatement.scopeCount,
      inputRowCount: finalRestatement.inputRowCount,
      unresolvedReversalResidualMinor:
        finalRestatement.unresolvedReversalResidualMinor,
      excludedUnallocatedReversalResidualMinor:
        finalRestatement.excludedUnallocatedReversalResidualMinor,
      conservationDifferenceMinor:
        finalRestatement.conservationDifferenceMinor
    },
    originCount,
    originHorizonCellCount: grid.cells.length,
    countsByHorizon: grid.countsByHorizon,
    workCaseCount,
    channelCaseCount,
    immatureChannelCaseCount,
    eligibleWorkCount: eligibleWorks.size,
    eligibleChannelCount: eligibleChannels.size,
    labelAvailabilityAudit: {
      policy:
        "MAX_TARGET_MONTH_AND_CONTRIBUTING_REVERSAL_RECORDED_MONTH",
      delayedWorkLabelCaseCount,
      delayedChannelLabelCaseCount,
      targetEndUsedAsUnconditionalAvailability: false
    },
    files: {
      workCases: await fileDescriptor(casePath, workCaseCount),
      channelCases: await fileDescriptor(channelCasePath, channelCaseCount),
      populations: await fileDescriptor(populationPath, originCount)
    },
    actualCrossModelParityRequired: true,
    privateIdentityPublished: false,
    finalHoldoutOpened: false,
    productionChanged: false
  };
  await writeJsonAtomic(caseManifestPath, manifest);
  process.stdout.write(`${JSON.stringify({
    status: manifest.status,
    originCount,
    workCaseCount,
    channelCaseCount,
    eligibleWorkCount: eligibleWorks.size,
    eligibleChannelCount: eligibleChannels.size
  })}\n`);
}


async function runSimpleModels() {
  const [
    receipt,
    metadata,
    caseManifest,
    humanConfig,
    manualConfig,
    canonicalConfig,
    coreRevenueConfig
  ] = await Promise.all([
    readJson(authorityReceiptPath),
    readJson(metadataPath),
    readJson(caseManifestPath),
    readJson(humanConfigPath),
    readJson(manualChannelConfigPath),
    readJson(canonicalChannelConfigPath),
    readJson(coreRevenueConfigPath)
  ]);
  if (
    caseManifest.status !== "COMPLETE"
    || caseManifest.files.workCases.sha256 !== await sha256File(casePath)
    || caseManifest.files.channelCases.sha256
      !== await sha256File(channelCasePath)
  ) {
    throw new Error("m2_cmx01_case_manifest_invalid");
  }
  const authority = await loadAuthorityRows(receipt);
  const metadataIndex = buildMetadataIndex(metadata);
  const finalRestatement = restateSalesShareReversalsV1(authority.rows, {
    cutoff: receipt.lastBillMonth,
    authorityStartMonth: receipt.firstBillMonth
  });
  assertRestatementUsable(finalRestatement);
  const finalMonthlyRows = restatementMonthlyRows(
    finalRestatement,
    metadataIndex,
    authority.scalePower
  );
  const temporaryFiles = [
    `${simpleWorkPredictionPath}.tmp`,
    `${simpleChannelPredictionPath}.tmp`,
    `${allocatorSharePath}.tmp`
  ];
  await Promise.all(temporaryFiles.map((file) => rm(file, { force: true })));
  const workWriter = createWriteStream(temporaryFiles[0], { encoding: "utf8" });
  const channelWriter = createWriteStream(temporaryFiles[1], { encoding: "utf8" });
  const allocatorWriter = createWriteStream(temporaryFiles[2], { encoding: "utf8" });
  const workGroups = readNdjsonGroups(casePath, "origin")[Symbol.asyncIterator]();
  const channelGroups = readNdjsonGroups(
    channelCasePath,
    "origin"
  )[Symbol.asyncIterator]();
  const ccrHistory = [];
  const modelCounts = new Map();
  let nativeChannelPredictionCount = 0;
  let allocatorShareCount = 0;
  let originCount = 0;
  while (true) {
    const [workGroupResult, channelGroupResult] = await Promise.all([
      workGroups.next(),
      channelGroups.next()
    ]);
    if (workGroupResult.done || channelGroupResult.done) {
      if (workGroupResult.done !== channelGroupResult.done) {
        throw new Error("m2_cmx01_case_origin_stream_mismatch");
      }
      break;
    }
    const workGroup = workGroupResult.value;
    const channelGroup = channelGroupResult.value;
    if (workGroup.key !== channelGroup.key) {
      throw new Error("m2_cmx01_case_origin_key_mismatch");
    }
    const origin = workGroup.key;
    const asOf = restateSalesShareReversalsV1(authority.rows, {
      cutoff: origin,
      authorityStartMonth: receipt.firstBillMonth
    });
    assertRestatementUsable(asOf);
    const featureRows = restatementMonthlyRows(
      asOf,
      metadataIndex,
      authority.scalePower
    );
    const pairHistory = buildPairHistory(featureRows);
    const eligibleChannelsByWork = uniqueEligibleChannelsByWork(
      channelGroup.rows
    );
    const channelCaseIndex = new Map(channelGroup.rows.map((row) => [
      channelCaseKey(row),
      row
    ]));
    const workCaseIndex = new Map(workGroup.rows.map((row) => [
      workCaseKey(row),
      row
    ]));
    const workSeries = buildWorkSeries({
      pairHistory,
      eligibleChannelsByWork,
      origin
    });
    const baselineByCase = new Map();
    const currentCcrRows = [];
    for (const row of workGroup.rows) {
      const series = workSeries.get(row.standardWorkId) ?? [];
      if (series.length === 0) continue;
      const baselines = forecastM2CurrentBaselines(
        series,
        row.horizonMonths
      );
      baselineByCase.set(workCaseKey(row), baselines);
      for (const [baselineId, forecast] of Object.entries(baselines)) {
        writePrediction(workWriter, predictionRow(row, {
          modelId: "M2-BASE-CLASSIC01",
          modelVariantId: `M2-BASE-CLASSIC01/${baselineId}`,
          pointEstimate: forecast.pointEstimate,
          predictionGrain: "WORK_TOTAL",
          nativeOrComposite: "NATIVE",
          populationRoute: "POPULATION_INDEPENDENT"
        }));
        increment(modelCounts, `M2-BASE-CLASSIC01/${baselineId}`);
      }
      const manual = forecastM2HumanAnchoredBase(
        row,
        humanConfig.humanPrior,
        { faithful: true }
      );
      writePrediction(workWriter, predictionRow(row, {
        modelId: "M2-WORK-MAN01",
        modelVariantId: "M2-WORK-MAN01/FAITHFUL_FIXED_FORMULA",
        pointEstimate: manual.positivePointEstimate,
        predictionGrain: "WORK_TOTAL",
        nativeOrComposite: "NATIVE",
        populationRoute: "POPULATION_INDEPENDENT"
      }));
      increment(modelCounts, "M2-WORK-MAN01/FAITHFUL_FIXED_FORMULA");
      if (row.horizonMonths === 36 && row.rightsStartMonth) {
        const channels = (eligibleChannelsByWork.get(row.standardWorkId) ?? [])
          .map((channelUid) => ({
            channelId: channelUid,
            ...monthsAndValues(
              pairHistory.get(pairKey(row.standardWorkId, channelUid)),
              row.rightsStartMonth,
              origin
            )
          })).filter((channel) => channel.months.length > 0);
        if (channels.length > 0 && row.rightsStartMonth <= origin) {
          const manualChannel = forecastM2CurrentManualChannelRule({
            origin,
            horizonMonths: 36,
            rightsStartMonth: row.rightsStartMonth,
            channels
          }, manualConfig.rule);
          writePrediction(workWriter, predictionRow(row, {
            modelId: "M2-WORK-MCR01",
            modelVariantId: "M2-WORK-MCR01/FROZEN_MANUAL_CHANNEL_RULE",
            pointEstimate: manualChannel.pointEstimate,
            predictionGrain: "WORK_TOTAL",
            nativeOrComposite: "NATIVE",
            populationRoute: "POPULATION_INDEPENDENT"
          }));
          increment(modelCounts, "M2-WORK-MCR01/FROZEN_MANUAL_CHANNEL_RULE");
        }
      }
      if ([3, 6, 12].includes(row.horizonMonths)) {
        const canonicalChannels = (eligibleChannelsByWork.get(
          row.standardWorkId
        ) ?? []).map((channelUid) => {
          const channel = metadataIndex.channelById.get(channelUid);
          return {
            channelUid,
            channelRole: channel.channelRole,
            revenueMode: channel.revenueMode,
            historySeries: denseSeries(
              pairHistory.get(pairKey(row.standardWorkId, channelUid)),
              origin
            )
          };
        });
        const channelForecast = forecastM2CurrentCanonicalChannelCase({
          ...row,
          canonicalChannels
        }, canonicalConfig.model);
        const basePointEstimate = baselines.seasonal_naive.pointEstimate;
        currentCcrRows.push({
          ...row,
          basePointEstimate,
          channelPointEstimate: channelForecast.channelPointEstimate
        });
      }
    }
    const ccrSelections = selectCcrByGroup({
      history: ccrHistory,
      current: currentCcrRows,
      origin,
      policy: canonicalConfig.model
    });
    for (const row of currentCcrRows) {
      const selection = ccrSelections.get(ccrGroupKey(row));
      const pointEstimate = Math.max(
        0,
        row.basePointEstimate * (1 - selection.weight)
          + row.channelPointEstimate * selection.weight
      );
      writePrediction(workWriter, predictionRow(row, {
        modelId: "M2-WORK-CCR01",
        modelVariantId: "M2-WORK-CCR01/NESTED_CANONICAL_CHANNEL",
        pointEstimate,
        predictionGrain: "WORK_TOTAL",
        nativeOrComposite: "NATIVE",
        populationRoute: "POPULATION_INDEPENDENT",
        selectedChannelWeight: selection.weight,
        selectionReason: selection.reason
      }));
      increment(modelCounts, "M2-WORK-CCR01/NESTED_CANONICAL_CHANNEL");
    }
    ccrHistory.push(...currentCcrRows);
    const coreRevenueOverlay = structuredClone(coreRevenueConfig);
    coreRevenueOverlay.coreSelection.populations = [
      ...coreRevenueConfig.coreSelection.populations,
      {
        id: "ALL_ELIGIBLE_WORKS",
        minimumCumulativeReferenceRevenueShare: 1
      }
    ];
    coreRevenueOverlay.evaluation.horizonsMonths = [
      ...new Set(workGroup.rows.map((row) => row.horizonMonths))
    ].sort((left, right) => left - right);
    const coreRevenue = runCoreRevenueManualRolling({
      monthlyRows: finalMonthlyRows,
      featureMonthlyRowsForOrigin: () => featureRows,
      origins: [origin],
      config: coreRevenueOverlay
    });
    const coreRevenueRoutes = ["CORE80", "ALL_ELIGIBLE_WORKS"];
    for (const populationId of coreRevenueRoutes) {
      const routeRows = coreRevenue.caseRows.filter(
        (row) => row.populationId === populationId
      );
      for (const row of routeRows) {
        const baseChannel = channelCaseIndex.get(channelCaseKey(row));
        if (!baseChannel) continue;
        const route = populationId === "CORE80"
          ? "DYNAMIC_CORE80"
          : "ALL_ELIGIBLE_WORKS";
        writePrediction(channelWriter, channelPredictionRow(baseChannel, {
          modelId: "M2-WORK-CRMR01",
          modelVariantId: "M2-WORK-CRMR01/NATIVE_WORK_CHANNEL",
          pointEstimate: row.pointEstimate,
          populationRoute: route,
          nativeOrComposite: "NATIVE_WORK_CHANNEL",
          allocatorId: null,
          kSource: row.kSource
        }));
        nativeChannelPredictionCount += 1;
      }
      const byWork = groupBy(routeRows, (row) => (
        `${row.standardWorkId}\u001f${row.horizonMonths}`
      ));
      for (const values of byWork.values()) {
        const template = workCaseIndex.get(workCaseKey(values[0]));
        if (!template) continue;
        const pointEstimate = values.reduce(
          (sum, row) => sum + row.pointEstimate,
          0
        );
        writePrediction(workWriter, predictionRow(template, {
          modelId: "M2-WORK-CRMR01",
          modelVariantId: "M2-WORK-CRMR01/NATIVE_WORK_CHANNEL_SUM",
          pointEstimate,
          predictionGrain: "WORK_TOTAL_FROM_NATIVE_CHANNEL_SUM",
          nativeOrComposite: "NATIVE_WORK_CHANNEL",
          populationRoute: populationId === "CORE80"
            ? "DYNAMIC_CORE80"
            : "ALL_ELIGIBLE_WORKS"
        }));
        increment(modelCounts, `M2-WORK-CRMR01/${populationId}`);
      }
    }
    for (const [workId, channelUids] of eligibleChannelsByWork) {
      const observedMatureChannels = channelUids.map((channelUid) => ({
        channelUid,
        trailing12Cash: trailingCash(
          pairHistory.get(pairKey(workId, channelUid)),
          origin,
          12
        )
      }));
      const lastNonzeroMonthShares = lastNonzeroShares({
        pairHistory,
        workId,
        channelUids,
        origin
      });
      const allocation = allocateCmx01Trailing12Channels({
        workPrediction: 1,
        observedMatureChannels,
        lastNonzeroMonthShares
      });
      if (allocation.status !== "ALLOCATED") continue;
      for (const row of allocation.rows) {
        const channel = metadataIndex.channelById.get(row.channelUid);
        writeNdjson(allocatorWriter, {
          standardWorkId: workId,
          workTitle: metadataIndex.workById.get(workId)?.workTitle ?? null,
          origin,
          channelUid: row.channelUid,
          channelName: channel?.channelName ?? null,
          allocatorId: allocation.allocatorId,
          allocatorSource: allocation.source,
          share: row.share
        });
        allocatorShareCount += 1;
      }
    }
    originCount += 1;
    process.stdout.write(
      `[M2-CMX01] simple-models ${originCount}/${caseManifest.originCount} ${origin}\n`
    );
  }
  await Promise.all([
    closeWriter(workWriter),
    closeWriter(channelWriter),
    closeWriter(allocatorWriter)
  ]);
  await Promise.all([
    rename(temporaryFiles[0], simpleWorkPredictionPath),
    rename(temporaryFiles[1], simpleChannelPredictionPath),
    rename(temporaryFiles[2], allocatorSharePath)
  ]);
  const workPredictionCount = [...modelCounts.values()].reduce(
    (sum, count) => sum + count,
    0
  );
  const manifest = {
    schema: "m2.cmx01.simple_model_manifest.private.v0.1",
    status: "COMPLETE",
    tracked: false,
    originCount,
    workPredictionCount,
    nativeChannelPredictionCount,
    allocatorShareCount,
    modelVariantCounts: Object.fromEntries([...modelCounts].sort()),
    files: {
      workPredictions: await fileDescriptor(
        simpleWorkPredictionPath,
        workPredictionCount
      ),
      nativeChannelPredictions: await fileDescriptor(
        simpleChannelPredictionPath,
        nativeChannelPredictionCount
      ),
      allocatorShares: await fileDescriptor(
        allocatorSharePath,
        allocatorShareCount
      )
    },
    finalHoldoutOpened: false,
    productionChanged: false
  };
  await writeJsonAtomic(simpleManifestPath, manifest);
  process.stdout.write(`${JSON.stringify({
    status: manifest.status,
    workPredictionCount,
    nativeChannelPredictionCount,
    allocatorShareCount
  })}\n`);
}


async function buildHumanInput() {
  const [receipt, metadata, caseManifest, humanConfig] = await Promise.all([
    readJson(authorityReceiptPath),
    readJson(metadataPath),
    readJson(caseManifestPath),
    readJson(humanConfigPath)
  ]);
  if (
    caseManifest.status !== "COMPLETE"
    || caseManifest.files.workCases.sha256 !== await sha256File(casePath)
  ) {
    throw new Error("m2_cmx01_case_manifest_invalid_for_human_input");
  }
  const authority = await loadAuthorityRows(receipt);
  const metadataIndex = buildMetadataIndex(metadata);
  const featureStart = humanConfig.dataContract.featureAndLabelWindowStart;
  const temporary = `${humanInputPath}.tmp`;
  await rm(temporary, { force: true });
  const writer = createWriteStream(temporary, { encoding: "utf8" });
  let inputRowCount = 0;
  let unavailableWorkCaseCount = 0;
  let originCount = 0;
  const availabilityByOrigin = [];
  for await (const group of readNdjsonGroups(casePath, "origin")) {
    if (group.key < featureStart) continue;
    const asOf = restateSalesShareReversalsV1(authority.rows, {
      cutoff: group.key,
      authorityStartMonth: receipt.firstBillMonth
    });
    assertRestatementUsable(asOf);
    const visibleRows = restatementMonthlyRows(
      asOf,
      metadataIndex,
      authority.scalePower
    ).filter((row) => row.month >= featureStart && row.month <= group.key);
    const historyContext = buildHumanHistoryContext(visibleRows);
    const rowsByWork = groupBy(group.rows, (row) => row.standardWorkId);
    let availableAtOrigin = 0;
    let unavailableAtOrigin = 0;
    for (const rows of rowsByWork.values()) {
      const history = buildHumanHistoryRow({
        row: rows[0],
        historyContext,
        origin: group.key,
        featureStart
      });
      if (history === null) {
        unavailableWorkCaseCount += rows.length;
        unavailableAtOrigin += rows.length;
        continue;
      }
      for (const row of rows) {
        writeNdjson(writer, { ...row, ...history });
        inputRowCount += 1;
        availableAtOrigin += 1;
      }
    }
    availabilityByOrigin.push({
      origin: group.key,
      availableCaseCount: availableAtOrigin,
      unavailableCaseCount: unavailableAtOrigin
    });
    originCount += 1;
    process.stdout.write(
      `[M2-CMX01] human-input ${originCount} ${group.key}\n`
    );
  }
  await closeWriter(writer);
  await rename(temporary, humanInputPath);
  const manifest = {
    schema: "m2.cmx01.human_anchored_input_manifest.private.v0.1",
    status: "COMPLETE",
    tracked: false,
    featureWindowStart: featureStart,
    cashHistoryThroughOriginOnly: true,
    preFeatureWindowCashAmountUsed: false,
    futureFeatureCashUsed: false,
    actualDefinitionId:
      "M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01",
    originCount,
    inputRowCount,
    unavailableWorkCaseCount,
    availabilityByOrigin,
    file: await fileDescriptor(humanInputPath, inputRowCount),
    finalHoldoutOpened: false,
    productionChanged: false
  };
  await writeJsonAtomic(humanInputManifestPath, manifest);
  process.stdout.write(`${JSON.stringify({
    status: manifest.status,
    originCount,
    inputRowCount,
    unavailableWorkCaseCount
  })}\n`);
}


async function runHumanModels() {
  const [inputManifest, humanConfig] = await Promise.all([
    readJson(humanInputManifestPath),
    readJson(humanConfigPath)
  ]);
  if (
    inputManifest.status !== "COMPLETE"
    || inputManifest.file.sha256 !== await sha256File(humanInputPath)
  ) {
    throw new Error("m2_cmx01_human_input_manifest_invalid");
  }
  const rows = await loadNdjson(humanInputPath);
  if (rows.length !== inputManifest.inputRowCount) {
    throw new Error("m2_cmx01_human_input_row_count_mismatch");
  }
  const evaluationConfig = structuredClone(humanConfig);
  evaluationConfig.dataContract.strictAuxiliaryEvaluationStartsAt =
    humanConfig.dataContract.featureAndLabelWindowStart;
  const origins = [...new Set(rows.map((row) => row.origin))].sort();
  const temporary = `${humanPredictionPath}.tmp`;
  await rm(temporary, { force: true });
  const writer = createWriteStream(temporary, { encoding: "utf8" });
  const modelCounts = new Map();
  const selections = [];
  for (const outerOrigin of origins) {
    const training = rows.filter((row) => (
      row.origin < outerOrigin
      && row.labelAvailableAsOf <= outerOrigin
    ));
    const validation = rows.filter((row) => row.origin === outerOrigin);
    if (
      training.length
        < Number(evaluationConfig.learning.minimumStrictAsOfTrainingRows)
    ) {
      selections.push({
        outerOrigin,
        status: "MODEL_UNAVAILABLE_INSUFFICIENT_MATURE_EARLIER_ROWS",
        trainingRowCount: training.length,
        validationRowCount: validation.length
      });
      continue;
    }
    let state;
    try {
      state = fitM2HumanAnchoredModel(training, evaluationConfig);
    } catch (error) {
      selections.push({
        outerOrigin,
        status: "MODEL_EXECUTION_FAILED_AT_ORIGIN",
        trainingRowCount: training.length,
        validationRowCount: validation.length,
        errorCode: safeErrorCode(error)
      });
      continue;
    }
    for (const row of validation) {
      const forecast = predictM2HumanAnchored(
        row,
        state,
        evaluationConfig
      );
      const learnedGlobalNet = Math.max(
        0,
        forecast.learnedGlobalPointEstimate * (1 - forecast.reversalRate)
      );
      writePrediction(writer, {
        ...predictionRow(row, {
          modelId: "M2-WORK-LG01",
          modelVariantId:
            "M2-WORK-LG01/LEARNED_GLOBAL_COMMON_REVERSAL",
          pointEstimate: learnedGlobalNet,
          predictionGrain: "WORK_TOTAL",
          nativeOrComposite: "NATIVE",
          populationRoute: "POPULATION_INDEPENDENT"
        }),
        learnedGlobalPositivePointEstimate:
          forecast.learnedGlobalPointEstimate,
        reversalRate: forecast.reversalRate,
        maximumTrainingLabelAvailableAsOf:
          state.maximumLabelAvailableAsOf
      });
      increment(
        modelCounts,
        "M2-WORK-LG01/LEARNED_GLOBAL_COMMON_REVERSAL"
      );
      if (row.horizonMonths === 36) {
        writePrediction(writer, {
          ...predictionRow(row, {
            modelId: "M2-WORK-HP01",
            modelVariantId:
              "M2-WORK-HP01/RAW_HIERARCHICAL_POSITIVE_ORIGINAL",
            pointEstimate: forecast.rawHierarchicalPointEstimate,
            predictionGrain: "WORK_TOTAL",
            nativeOrComposite: "NATIVE_RAW_CANDIDATE",
            populationRoute: "POPULATION_INDEPENDENT"
          }),
          reversalRate: forecast.reversalRate,
          maximumTrainingLabelAvailableAsOf:
            state.maximumLabelAvailableAsOf
        });
        increment(
          modelCounts,
          "M2-WORK-HP01/RAW_HIERARCHICAL_POSITIVE_ORIGINAL"
        );
        writePrediction(writer, {
          ...predictionRow(row, {
            modelId: "M2-WORK-OR01",
            modelVariantId:
              "M2-WORK-OR01/FULLY_RAW_OCCURRENCE_REVERSAL",
            pointEstimate:
              forecast.fullyRawOccurrenceReversalPointEstimate,
            predictionGrain: "WORK_TOTAL",
            nativeOrComposite: "NATIVE_RAW_CANDIDATE",
            populationRoute: "POPULATION_INDEPENDENT"
          }),
          occurrenceProbability: forecast.occurrenceProbability,
          reversalRate: forecast.reversalRate,
          maximumTrainingLabelAvailableAsOf:
            state.maximumLabelAvailableAsOf
        });
        increment(
          modelCounts,
          "M2-WORK-OR01/FULLY_RAW_OCCURRENCE_REVERSAL"
        );
      }
    }
    selections.push({
      outerOrigin,
      status: "EVALUATED_ORIGIN_SAFE",
      trainingRowCount: training.length,
      trainingWorkCount: state.trainingWorkCount,
      validationRowCount: validation.length,
      maximumTrainingLabelAvailableAsOf:
        state.maximumLabelAvailableAsOf,
      parameters: state.parameters,
      hierarchyAcceptedInSelectedPipeline: state.hierarchyAccepted,
      occurrenceReversalAcceptedInSelectedPipeline:
        state.occurrenceReversalAccepted,
      rawCandidateResultsPreserved: true,
      sameOrLaterOuterTruthRead: false
    });
    process.stdout.write(
      `[M2-CMX01] human-models ${outerOrigin} training=${training.length}`
        + ` validation=${validation.length}\n`
    );
  }
  await closeWriter(writer);
  await rename(temporary, humanPredictionPath);
  const predictionCount = [...modelCounts.values()].reduce(
    (sum, value) => sum + value,
    0
  );
  const manifest = {
    schema: "m2.cmx01.human_anchored_model_manifest.private.v0.1",
    status: predictionCount > 0 ? "COMPLETE" : "FAILED_NO_PREDICTIONS",
    tracked: false,
    executionDesign:
      "STRICT_ORIGIN_BOUNDED_FULL_MATURE_TRAINING_SUPPORT",
    evaluationGridStartOverride:
      evaluationConfig.dataContract.strictAuxiliaryEvaluationStartsAt,
    evaluationGridOverrideChangesModelParameters: false,
    rawCandidateResultsPreserved: true,
    selectedFallbackUsedToReplaceRawCandidate: false,
    modelVariantCounts: Object.fromEntries([...modelCounts].sort()),
    selections,
    file: await fileDescriptor(humanPredictionPath, predictionCount),
    finalHoldoutOpened: false,
    productionChanged: false
  };
  await writeJsonAtomic(humanManifestPath, manifest);
  process.stdout.write(`${JSON.stringify({
    status: manifest.status,
    predictionCount,
    modelVariantCounts: manifest.modelVariantCounts
  })}\n`);
}


async function runTsbModels() {
  const [inputManifest, humanManifest, humanConfig, tsbConfig] =
    await Promise.all([
      readJson(humanInputManifestPath),
      readJson(humanManifestPath),
      readJson(humanConfigPath),
      readJson(path.join(
        root,
        "config/m2-current-human-anchored-tsb-occurrence.v0.1.json"
      ))
    ]);
  if (
    inputManifest.status !== "COMPLETE"
    || inputManifest.file.sha256 !== await sha256File(humanInputPath)
    || humanManifest.status !== "COMPLETE"
    || humanManifest.file.sha256 !== await sha256File(humanPredictionPath)
  ) {
    throw new Error("m2_cmx01_tsb_upstream_manifest_invalid");
  }
  const [rows, learnedGlobalIndex] = await Promise.all([
    loadNdjson(humanInputPath),
    loadPredictionIndex(humanPredictionPath, "M2-WORK-LG01")
  ]);
  const evaluationConfig = structuredClone(humanConfig);
  evaluationConfig.dataContract.strictAuxiliaryEvaluationStartsAt =
    humanConfig.dataContract.featureAndLabelWindowStart;
  const result = strictRollingM2HumanAnchoredTsb(
    rows,
    evaluationConfig,
    tsbConfig
  );
  const temporary = `${tsbPredictionPath}.tmp`;
  await rm(temporary, { force: true });
  const writer = createWriteStream(temporary, { encoding: "utf8" });
  const modelCounts = new Map();
  let learnedGlobalOverlapCount = 0;
  let learnedGlobalMissingCount = 0;
  let learnedGlobalMaximumAbsoluteDifference = 0;
  for (const row of result.rows) {
    const comparator = learnedGlobalIndex.get(workCaseKey(row));
    if (comparator === undefined) {
      learnedGlobalMissingCount += 1;
    } else {
      learnedGlobalOverlapCount += 1;
      learnedGlobalMaximumAbsoluteDifference = Math.max(
        learnedGlobalMaximumAbsoluteDifference,
        Math.abs(
          Number(comparator)
            - Number(row.learnedGlobalCommonReversalPointEstimate)
        )
      );
    }
    writePrediction(writer, {
      ...predictionRow(row, {
        modelId: "M2-WORK-TSB01",
        modelVariantId: "M2-WORK-TSB01/RAW_TSB_OCCURRENCE",
        pointEstimate: row.rawTsbPointEstimate,
        predictionGrain: "WORK_TOTAL",
        nativeOrComposite: "NATIVE_RAW_CANDIDATE",
        populationRoute: "POPULATION_INDEPENDENT"
      }),
      occurrenceProbability: row.occurrenceProbability,
      reversalRate: row.reversalRate,
      selectedTsbParameters: row.selectedTsbParameters,
      maximumTrainingLabelAvailableAsOf:
        row.maximumTrainingLabelAvailableAsOf
    });
    increment(modelCounts, "M2-WORK-TSB01/RAW_TSB_OCCURRENCE");
    writePrediction(writer, {
      ...predictionRow(row, {
        modelId: "M2-WORK-TSBB01",
        modelVariantId: "M2-WORK-TSBB01/RAW_TSB_LG01_BLEND",
        pointEstimate: row.blendCandidatePointEstimate,
        predictionGrain: "WORK_TOTAL",
        nativeOrComposite: "REGISTERED_COMPOSITE_RAW_CANDIDATE",
        populationRoute: "POPULATION_INDEPENDENT"
      }),
      occurrenceProbability: row.occurrenceProbability,
      reversalRate: row.reversalRate,
      selectedTsbParameters: row.selectedTsbParameters,
      maximumTrainingLabelAvailableAsOf:
        row.maximumTrainingLabelAvailableAsOf
    });
    increment(modelCounts, "M2-WORK-TSBB01/RAW_TSB_LG01_BLEND");
  }
  await closeWriter(writer);
  await rename(temporary, tsbPredictionPath);
  const predictionCount = [...modelCounts.values()].reduce(
    (sum, value) => sum + value,
    0
  );
  const parityTolerance = 1e-7;
  const manifest = {
    schema: "m2.cmx01.tsb_model_manifest.private.v0.1",
    status: learnedGlobalMissingCount === 0
      && learnedGlobalMaximumAbsoluteDifference <= parityTolerance
      ? "COMPLETE"
      : "COMPARATOR_PARITY_FAILED",
    tracked: false,
    executionDesign:
      "STRICT_ORIGIN_BOUNDED_WITH_EQUIVALENT_INNER_STATE_CACHE",
    modelVariantCounts: Object.fromEntries([...modelCounts].sort()),
    selections: result.selections,
    learnedGlobalComparatorParity: {
      overlapCount: learnedGlobalOverlapCount,
      missingCount: learnedGlobalMissingCount,
      maximumAbsoluteDifference: learnedGlobalMaximumAbsoluteDifference,
      tolerance: parityTolerance
    },
    rawCandidateResultsPreserved: true,
    selectedFallbackUsedToReplaceRawCandidate: false,
    file: await fileDescriptor(tsbPredictionPath, predictionCount),
    finalHoldoutOpened: false,
    productionChanged: false
  };
  await writeJsonAtomic(tsbManifestPath, manifest);
  process.stdout.write(`${JSON.stringify({
    status: manifest.status,
    predictionCount,
    modelVariantCounts: manifest.modelVariantCounts,
    learnedGlobalComparatorParity: manifest.learnedGlobalComparatorParity
  })}\n`);
}


async function buildChamInput() {
  const [receipt, metadata, caseManifest, lgManifest] = await Promise.all([
    readJson(authorityReceiptPath),
    readJson(metadataPath),
    readJson(caseManifestPath),
    readJson(humanManifestPath)
  ]);
  if (
    caseManifest.status !== "COMPLETE"
    || caseManifest.files.workCases.sha256 !== await sha256File(casePath)
    || lgManifest.status !== "COMPLETE"
  ) {
    throw new Error("m2_cmx01_cham_input_upstream_invalid");
  }
  const [authority, lg01Index] = await Promise.all([
    loadAuthorityRows(receipt),
    loadPredictionIndex(humanPredictionPath, "M2-WORK-LG01")
  ]);
  const metadataIndex = buildMetadataIndex(metadata);
  const temporary = `${chamInputPath}.tmp`;
  await rm(temporary, { force: true });
  const writer = createWriteStream(temporary, { encoding: "utf8" });
  let rowCount = 0;
  let lg01SameCaseCount = 0;
  let originCount = 0;
  for await (const group of readNdjsonGroups(casePath, "origin")) {
    const eligibleRows = group.rows.filter(
      (row) => [3, 6, 12].includes(row.horizonMonths)
    );
    if (eligibleRows.length === 0) continue;
    const asOf = restateSalesShareReversalsV1(authority.rows, {
      cutoff: group.key,
      authorityStartMonth: receipt.firstBillMonth
    });
    assertRestatementUsable(asOf);
    const featureRows = restatementMonthlyRows(
      asOf,
      metadataIndex,
      authority.scalePower
    );
    const pairHistory = buildPairHistory(featureRows);
    const historyByWork = buildMonthlyWorkHistoryFromCases({
      workRows: eligibleRows,
      pairHistory,
      origin: group.key
    });
    for (const row of eligibleRows) {
      const monthlyHistory = historyByWork.get(row.standardWorkId);
      if (!monthlyHistory || monthlyHistory.length === 0) continue;
      const feature = buildM2CoreHorizonAmountFeatureRow({
        row: {
          ...row,
          matureChannelCount: row.eligibleChannelCount,
          workAgeMonths: row.observedSalesAgeMonths
        },
        monthlyHistory
      });
      const lg01PointEstimate = lg01Index.get(workCaseKey(row)) ?? null;
      if (lg01PointEstimate !== null) lg01SameCaseCount += 1;
      writeNdjson(writer, {
        ...feature,
        workTitle: row.workTitle,
        targetStart: row.targetStart,
        targetEnd: row.targetEnd,
        targetYear: row.targetYear,
        dynamicCore80Flag: row.dynamicCore80Flag,
        annualActualCore80Flag: row.annualActualCore80Flag,
        cashBandId: row.cashBandId,
        segment: row.segment,
        dominantRevenueMode: row.dominantRevenueMode,
        originSafeStatus: row.originSafeStatus,
        lg01PointEstimate
      });
      rowCount += 1;
    }
    originCount += 1;
    process.stdout.write(`[M2-CMX01] cham-input ${originCount} ${group.key}\n`);
  }
  await closeWriter(writer);
  await rename(temporary, chamInputPath);
  const manifest = {
    schema: "m2.cmx01.cham01_input_manifest.private.v0.1",
    status: "COMPLETE",
    tracked: false,
    originCount,
    rowCount,
    lg01SameCaseCount,
    horizons: [3, 6, 12],
    horizon36ReadOrProduced: false,
    originVisibleFeatureOnly: true,
    file: await fileDescriptor(chamInputPath, rowCount),
    finalHoldoutOpened: false,
    productionChanged: false
  };
  await writeJsonAtomic(chamInputManifestPath, manifest);
  process.stdout.write(`${JSON.stringify({
    status: manifest.status,
    rowCount,
    lg01SameCaseCount
  })}\n`);
}


async function runChamModels() {
  const result = spawnSync(
    process.execPath,
    [
      path.join(root, "scripts/run-codex-python.mjs"),
      path.join(
        root,
        "scripts/m2-current/run_m2_core80_cross_model_cham_private.py"
      )
    ],
    {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
      shell: false,
      maxBuffer: 100 * 1024 * 1024
    }
  );
  if (result.status !== 0) {
    throw new Error(
      `m2_cmx01_cham_numpy_failed:${result.stderr || result.stdout}`
    );
  }
  process.stdout.write(result.stdout);
}


async function runHorizonRouter() {
  const [humanManifest, simpleManifest, config] = await Promise.all([
    readJson(humanManifestPath),
    readJson(simpleManifestPath),
    readJson(path.join(
      root,
      "config/m2-current-core-legacy-horizon-router.v0.1.json"
    ))
  ]);
  if (
    humanManifest.status !== "COMPLETE"
    || simpleManifest.status !== "COMPLETE"
    || humanManifest.file.sha256 !== await sha256File(humanPredictionPath)
    || simpleManifest.files.workPredictions.sha256
      !== await sha256File(simpleWorkPredictionPath)
  ) {
    throw new Error("m2_cmx01_router_upstream_manifest_invalid");
  }
  const rows = [];
  await forEachNdjson(humanPredictionPath, (row) => {
    if (row.modelId !== "M2-WORK-LG01") return;
    rows.push(routerSourceRow(row, "ALL_ELIGIBLE_WORKS"));
    if (row.dynamicCore80Flag === true) {
      rows.push(routerSourceRow(row, "DYNAMIC_CORE80"));
    }
  });
  await forEachNdjson(simpleWorkPredictionPath, (row) => {
    if (
      row.modelId !== "M2-WORK-CRMR01"
      || row.modelVariantId
        !== "M2-WORK-CRMR01/NATIVE_WORK_CHANNEL_SUM"
      || !["DYNAMIC_CORE80", "ALL_ELIGIBLE_WORKS"]
        .includes(row.populationRoute)
    ) return;
    rows.push(routerSourceRow(row, row.populationRoute));
  });
  const duplicateAudit = new Set();
  for (const row of rows) {
    const key = [row.populationId, row.modelId, row.caseKey].join("\u001f");
    if (duplicateAudit.has(key)) {
      throw new Error("m2_cmx01_router_source_duplicate");
    }
    duplicateAudit.add(key);
  }
  const temporary = `${routerPredictionPath}.tmp`;
  await rm(temporary, { force: true });
  const writer = createWriteStream(temporary, { encoding: "utf8" });
  const selections = [];
  let predictionCount = 0;
  for (const populationId of ["DYNAMIC_CORE80", "ALL_ELIGIBLE_WORKS"]) {
    for (const horizonMonths of [3, 6, 12, 36]) {
      const cellRows = rows.filter((row) => (
        row.populationId === populationId
        && row.horizonMonths === horizonMonths
      ));
      const origins = [...new Set(cellRows.map((row) => row.origin))].sort();
      for (const outerOrigin of origins) {
        const currentRows = cellRows.filter(
          (row) => row.origin === outerOrigin
        );
        const selection = selectM2CoreLegacyHorizonModel({
          outerOrigin,
          horizonMonths,
          currentRows: currentRows.map((row) => ({
            modelId: row.modelId
          })),
          historicalRows: cellRows,
          config
        });
        selections.push({
          populationId,
          horizonMonths,
          outerOrigin,
          selectedModelId: selection.selectedModelId,
          selectionMode: selection.selectionMode,
          selectionReason: selection.selectionReason,
          fallbackUsed: selection.fallbackUsed,
          matureHistoricalOriginCount:
            selection.matureHistoricalOriginCount,
          candidateModelIds: selection.candidateModelIds,
          candidateHistoricalMetrics:
            selection.candidateHistoricalMetrics,
          currentOuterActualReadForSelection: false
        });
        if (selection.selectedModelId === null) continue;
        for (const source of currentRows.filter(
          (row) => row.modelId === selection.selectedModelId
        )) {
          writePrediction(writer, {
            ...source,
            modelId: "M2-WORK-HR01",
            modelVariantId:
              `M2-WORK-HR01/${populationId}`,
            predictionGrain: "WORK_TOTAL",
            nativeOrComposite: "REGISTERED_COMPOSITE",
            populationRoute: populationId,
            selectedSourceModelId: selection.selectedModelId,
            selectionMode: selection.selectionMode,
            selectionReason: selection.selectionReason,
            fallbackUsed: selection.fallbackUsed
          });
          predictionCount += 1;
        }
      }
      process.stdout.write(
        `[M2-CMX01] router ${populationId} H${horizonMonths}\n`
      );
    }
  }
  await closeWriter(writer);
  await rename(temporary, routerPredictionPath);
  const manifest = {
    schema: "m2.cmx01.horizon_router_manifest.private.v0.1",
    status: predictionCount > 0 ? "COMPLETE" : "FAILED_NO_PREDICTIONS",
    tracked: false,
    legalSourceModelIds: ["M2-WORK-LG01", "M2-WORK-CRMR01"],
    excludedConfiguredSourceModelIds: [{
      modelId: "M2-WORK-OA03",
      reasonCode:
        "NO_LEGAL_REPLAYABLE_CURRENT_ACTUAL_PREDICTIONS_IN_CMX01"
    }],
    selections,
    predictionCount,
    currentOuterActualReadForSelection: false,
    rawSourceModelResultsPreserved: true,
    file: await fileDescriptor(routerPredictionPath, predictionCount),
    finalHoldoutOpened: false,
    productionChanged: false
  };
  await writeJsonAtomic(routerManifestPath, manifest);
  process.stdout.write(`${JSON.stringify({
    status: manifest.status,
    predictionCount,
    selectionCount: selections.length
  })}\n`);
}


async function runChannelExperts() {
  const [caseManifest, inputManifest, baseConfig, config] = await Promise.all([
    readJson(caseManifestPath),
    readJson(humanInputManifestPath),
    readJson(humanConfigPath),
    readJson(path.join(
      root,
      "config/m2-current-channel-experts.v0.1.json"
    ))
  ]);
  if (
    caseManifest.status !== "COMPLETE"
    || inputManifest.status !== "COMPLETE"
    || caseManifest.files.channelCases.sha256
      !== await sha256File(channelCasePath)
    || inputManifest.file.sha256 !== await sha256File(humanInputPath)
  ) {
    throw new Error("m2_cmx01_scl01_upstream_manifest_invalid");
  }
  const platformIndex = buildM2ChannelPlatformIndex(config);
  const channelCasesByWorkCase = new Map();
  await forEachNdjson(channelCasePath, (row) => {
    if (Number(row.actual) < 0) {
      throw new Error("m2_cmx01_scl01_negative_channel_actual_unexpected");
    }
    const key = workCaseKey(row);
    const rows = channelCasesByWorkCase.get(key) ?? [];
    rows.push(row);
    channelCasesByWorkCase.set(key, rows);
  });
  const source = [];
  let preFeatureWindowIdentityOnlyChannelCount = 0;
  await forEachNdjson(humanInputPath, (row) => {
    const bases = channelCasesByWorkCase.get(workCaseKey(row));
    if (!bases || bases.length === 0) {
      throw new Error("m2_cmx01_scl01_channel_labels_missing");
    }
    const canonicalChannels = row.canonicalChannels.map((channel) => ({
      ...channel
    }));
    const history = new Map(canonicalChannels.map((channel) => [
      String(channel.channelUid),
      channel
    ]));
    for (const base of bases) {
      if (history.has(String(base.channelUid))) continue;
      const channel = {
        channelUid: String(base.channelUid),
        channelRole: "observed_mature_channel",
        revenueMode: String(base.settlementMechanism),
        trailingAnnualPositive: 0,
        latestMonthPositive: 0,
        recent3AnnualPositive: 0,
        cumulativePositive: 0,
        cumulativeReversal: 0,
        cumulativeNet: 0,
        monthsSinceLastPositive:
          row.salesShareMonthlyHistory.positiveSeries.length,
        peerRecent6Positive: 0,
        peerPrevious6Positive: 0,
        peerTrendRatio: 1,
        identityObservedBeforeFeatureWindow: true
      };
      canonicalChannels.push(channel);
      history.set(channel.channelUid, channel);
      preFeatureWindowIdentityOnlyChannelCount += 1;
    }
    canonicalChannels.sort((left, right) => (
      left.channelUid.localeCompare(right.channelUid)
    ));
    const workChannelLabels = bases.map((base) => {
      const channel = history.get(String(base.channelUid));
      if (!channel) {
        throw new Error("m2_cmx01_scl01_origin_channel_history_missing");
      }
      return {
        channelUid: String(base.channelUid),
        channelRole: String(channel.channelRole),
        revenueMode: String(channel.revenueMode),
        platformId: platformIndex.byUid.get(String(base.channelUid))
          ?.platformId ?? "other_platform",
        observedAtOrigin: true,
        actualPositive: Number(base.actual),
        actualReversal: 0,
        actual: Number(base.actual),
        baseChannelCase: base
      };
    }).sort((left, right) => (
      left.channelUid.localeCompare(right.channelUid)
    ));
    const actual = sumNumbers(workChannelLabels.map((item) => item.actual));
    if (Math.abs(actual - Number(row.actual)) > 1e-7) {
      throw new Error("m2_cmx01_scl01_work_channel_conservation_failed");
    }
    source.push({
      ...row,
      canonicalChannels,
      actualPositive: actual,
      actualReversal: 0,
      actual,
      workChannelLabels
    });
  });
  channelCasesByWorkCase.clear();
  const origins = [...new Set(source.map((row) => row.origin))]
    .sort()
    .filter((origin) => origin >= config.training.strictRollingStartsAt);
  const temporary = [
    `${sclWorkPredictionPath}.tmp`,
    `${sclChannelPredictionPath}.tmp`
  ];
  await Promise.all(temporary.map((file) => rm(file, { force: true })));
  const workWriter = createWriteStream(temporary[0], { encoding: "utf8" });
  const channelWriter = createWriteStream(temporary[1], { encoding: "utf8" });
  const selections = [];
  let workPredictionCount = 0;
  let channelPredictionCount = 0;
  let ablationConservationMaximumAbsoluteDifference = 0;
  for (const outerOrigin of origins) {
    const training = source.filter((row) => (
      row.origin < outerOrigin
      && row.labelAvailableAsOf <= outerOrigin
    ));
    const validation = source.filter((row) => row.origin === outerOrigin);
    if (
      training.length < Number(config.training.minimumStrictTrainingRows)
      || validation.length === 0
    ) {
      selections.push({
        outerOrigin,
        status: "MODEL_UNAVAILABLE_INSUFFICIENT_MATURE_EARLIER_ROWS",
        trainingRowCount: training.length,
        validationRowCount: validation.length
      });
      continue;
    }
    let state;
    try {
      state = fitM2ChannelExpertModel(training, baseConfig, config);
    } catch (error) {
      selections.push({
        outerOrigin,
        status: "MODEL_EXECUTION_FAILED_AT_ORIGIN",
        trainingRowCount: training.length,
        validationRowCount: validation.length,
        errorCode: safeErrorCode(error)
      });
      continue;
    }
    for (const row of validation) {
      const result = predictM2ChannelExperts(row, state, baseConfig, config);
      writePrediction(workWriter, {
        ...predictionRow(row, {
          modelId: "M2-CHAN-SCL01",
          modelVariantId: "M2-CHAN-SCL01/NATIVE_CHANNEL_SUM_A6",
          pointEstimate: result.ablationPoints.A6,
          predictionGrain: "WORK_TOTAL",
          nativeOrComposite: "NATIVE_CHANNEL_SUM_RAW_CANDIDATE",
          populationRoute: "POPULATION_INDEPENDENT"
        }),
        ablationPointEstimates: result.ablationPoints,
        ablationPositivePointEstimates: result.ablationPositivePoints,
        reversalRate: result.reversalRate,
        selectedPriorStrength: result.selectedPriorStrength,
        maximumTrainingLabelAvailableAsOf:
          state.maximumLabelAvailableAsOf
      });
      workPredictionCount += 1;
      const labels = new Map(row.workChannelLabels.map((label) => [
        label.channelUid,
        label
      ]));
      let channelSum = 0;
      for (const channel of result.channelRows) {
        if (channel.observedAtOrigin !== true) {
          throw new Error("m2_cmx01_scl01_future_channel_prediction_forbidden");
        }
        const label = labels.get(channel.channelUid);
        if (!label) {
          throw new Error("m2_cmx01_scl01_prediction_label_missing");
        }
        const base = label.baseChannelCase;
        writePrediction(channelWriter, {
          ...channelPredictionRow(base, {
            modelId: "M2-CHAN-SCL01",
            modelVariantId: "M2-CHAN-SCL01/NATIVE_CHANNEL_A6",
            pointEstimate: channel.pointEstimates.A6,
            nativeOrComposite: "NATIVE_RAW_CANDIDATE",
            populationRoute: "POPULATION_INDEPENDENT",
            allocatorId: null
          }),
          ablationPointEstimates: channel.pointEstimates,
          ablationPositivePointEstimates: channel.positivePoints,
          platformId: channel.platformId,
          mechanism: channel.mechanism,
          fallbackTrace: channel.fallback,
          selectedPriorStrength: result.selectedPriorStrength,
          maximumTrainingLabelAvailableAsOf:
            state.maximumLabelAvailableAsOf
        });
        channelSum += Number(channel.pointEstimates.A6);
        channelPredictionCount += 1;
      }
      ablationConservationMaximumAbsoluteDifference = Math.max(
        ablationConservationMaximumAbsoluteDifference,
        Math.abs(channelSum - Number(result.ablationPoints.A6))
      );
    }
    selections.push({
      outerOrigin,
      status: "EVALUATED_ORIGIN_SAFE",
      trainingRowCount: state.trainingRowCount,
      trainingWorkCount: state.trainingWorkCount,
      validationRowCount: validation.length,
      maximumTrainingLabelAvailableAsOf:
        state.maximumLabelAvailableAsOf,
      selectedPriorStrength: state.selectedPriorStrength,
      innerSelection: state.selection.candidates,
      platformModels: state.platformModels,
      sameOrLaterOuterTruthRead: false
    });
    process.stdout.write(
      `[M2-CMX01] scl01 ${outerOrigin} training=${training.length}`
        + ` validation=${validation.length}\n`
    );
  }
  await Promise.all([closeWriter(workWriter), closeWriter(channelWriter)]);
  await Promise.all([
    rename(temporary[0], sclWorkPredictionPath),
    rename(temporary[1], sclChannelPredictionPath)
  ]);
  const tolerance = 1e-7;
  const manifest = {
    schema: "m2.cmx01.scl01_model_manifest.private.v0.1",
    status: workPredictionCount > 0
      && channelPredictionCount > 0
      && ablationConservationMaximumAbsoluteDifference <= tolerance
      ? "COMPLETE"
      : "FAILED_OUTPUT_OR_CONSERVATION",
    tracked: false,
    executionDesign:
      "ORIGINAL_STRICT_ROLLING_ORIGIN_BOUNDED_ALL_LEGAL_MONTHLY_ORIGINS",
    formalModelVariantId: "M2-CHAN-SCL01/NATIVE_CHANNEL_SUM_A6",
    diagnosticAblationsPreserved: ["A0", "A1", "A2", "A3", "A4", "A5", "A6"],
    taxonomyRole:
      "STATIC_INTRINSIC_CATEGORY_HIERARCHICAL_SCALE_NOT_DIRECT_CASH_FEATURE",
    preFeatureWindowIdentityOnlyChannelCount,
    preFeatureWindowCashAmountUsed: false,
    rawCandidateResultsPreserved: true,
    selectedFallbackUsedToReplaceRawCandidate: false,
    selections,
    ablationConservation: {
      maximumAbsoluteDifference:
        ablationConservationMaximumAbsoluteDifference,
      tolerance,
      passed:
        ablationConservationMaximumAbsoluteDifference <= tolerance
    },
    files: {
      workPredictions: await fileDescriptor(
        sclWorkPredictionPath,
        workPredictionCount
      ),
      nativeChannelPredictions: await fileDescriptor(
        sclChannelPredictionPath,
        channelPredictionCount
      )
    },
    finalHoldoutOpened: false,
    productionChanged: false
  };
  await writeJsonAtomic(sclManifestPath, manifest);
  process.stdout.write(`${JSON.stringify({
    status: manifest.status,
    workPredictionCount,
    channelPredictionCount,
    ablationConservation: manifest.ablationConservation
  })}\n`);
}


async function runPublishingScaleChannel() {
  const [
    caseManifest,
    receipt,
    metadata,
    config,
    support
  ] = await Promise.all([
    readJson(caseManifestPath),
    readJson(authorityReceiptPath),
    readJson(metadataPath),
    readJson(path.join(
      root,
      "config/m2-current-publishing-scale-channel.v0.1.json"
    )),
    readJson(path.join(
      root,
      "config/m2-publishing-scale-statistical-support.v1.json"
    ))
  ]);
  validateM2PublishingScaleConfig(config, support);
  if (
    caseManifest.status !== "COMPLETE"
    || caseManifest.files.workCases.sha256 !== await sha256File(casePath)
    || caseManifest.files.channelCases.sha256
      !== await sha256File(channelCasePath)
  ) {
    throw new Error("m2_cmx01_psc01_upstream_manifest_invalid");
  }
  const strictOrigins = new Set(config.selection.strictOrigins);
  const workCasesByOrigin = new Map();
  const channelCasesByOrigin = new Map();
  await Promise.all([
    forEachNdjson(casePath, (row) => {
      if (!strictOrigins.has(row.origin)) return;
      const rows = workCasesByOrigin.get(row.origin) ?? [];
      rows.push(row);
      workCasesByOrigin.set(row.origin, rows);
    }),
    forEachNdjson(channelCasePath, (row) => {
      if (!strictOrigins.has(row.origin)) return;
      const rows = channelCasesByOrigin.get(row.origin) ?? [];
      rows.push(row);
      channelCasesByOrigin.set(row.origin, rows);
    })
  ]);
  const authority = await loadAuthorityRows(receipt);
  const metadataIndex = buildMetadataIndex(metadata);
  const finalRestatement = restateSalesShareReversalsV1(authority.rows, {
    cutoff: receipt.lastBillMonth,
    authorityStartMonth: receipt.firstBillMonth
  });
  assertRestatementUsable(finalRestatement);
  const finalMonthly = restatementMonthlyRows(
    finalRestatement,
    metadataIndex,
    authority.scalePower
  );
  const finalIndex = buildPscMonthlyIndex(finalMonthly);
  const featureStart = config.dataContract.featureAndLabelWindowStart;
  const monthlyRows = [];
  const inputHash = createHash("sha256");
  let preFeatureWindowIdentityOnlyChannelCaseCount = 0;
  let inputChannelHorizonConservationMaximumAbsoluteDifference = 0;
  const inputOriginRows = [];
  for (const origin of config.selection.strictOrigins) {
    const workCases = workCasesByOrigin.get(origin) ?? [];
    const channelCases = channelCasesByOrigin.get(origin) ?? [];
    if (workCases.length === 0 || channelCases.length === 0) {
      inputOriginRows.push({
        origin,
        status: "NO_LEGAL_MATURE_CAMPAIGN_CASES",
        monthlyRowCount: 0
      });
      continue;
    }
    const asOf = restateSalesShareReversalsV1(authority.rows, {
      cutoff: origin,
      authorityStartMonth: receipt.firstBillMonth
    });
    assertRestatementUsable(asOf);
    const visible = restatementMonthlyRows(
      asOf,
      metadataIndex,
      authority.scalePower
    ).filter((row) => row.month >= featureStart && row.month <= origin);
    const pairHistory = buildPairHistory(visible);
    const workByKey = new Map(workCases.map((row) => [
      workCaseKey(row),
      row
    ]));
    const channelsByWork = groupBy(channelCases, (row) => (
      pairKey(row.standardWorkId, row.channelUid)
    ));
    const channelGroupsByWork = groupBy(
      [...channelsByWork.values()],
      (rows) => rows[0].standardWorkId
    );
    let originMonthlyRowCount = 0;
    for (const pairCases of channelsByWork.values()) {
      const representative = pairCases[0];
      const historyRows = (pairHistory.get(pairKey(
        representative.standardWorkId,
        representative.channelUid
      )) ?? []).filter((row) => row.month >= featureStart && row.month <= origin);
      const firstPositive = historyRows.find((row) => Number(row.cash) > 0);
      if (!firstPositive) {
        preFeatureWindowIdentityOnlyChannelCaseCount += pairCases.length;
        continue;
      }
      const workChannels = channelGroupsByWork.get(
        representative.standardWorkId
      ) ?? [];
      const observed = workChannels.map((rows) => {
        const item = rows[0];
        const values = densePscPositiveSeries(
          pairHistory.get(pairKey(item.standardWorkId, item.channelUid)) ?? [],
          origin,
          featureStart
        );
        return { item, values, trailing12: sumNumbers(values.slice(-12)) };
      }).filter((item) => item.values.length > 0 && item.values.some(
        (value) => value > 0
      ));
      const ranked = [...observed].sort((left, right) => (
        right.trailing12 - left.trailing12
        || left.item.channelUid.localeCompare(right.item.channelUid)
      ));
      const rankByUid = new Map(ranked.map((item, index) => [
        item.item.channelUid,
        index / Math.max(ranked.length - 1, 1)
      ]));
      const current = observed.find(
        (item) => item.item.channelUid === representative.channelUid
      );
      if (!current) continue;
      const workTrailing12 = sumNumbers(observed.map(
        (item) => item.trailing12
      ));
      const horizons = [...new Set(pairCases.map(
        (row) => Number(row.horizonMonths)
      ))].sort((left, right) => left - right);
      const maximumHorizon = Math.max(...horizons);
      const representativeWork = workByKey.get(workCaseKey(pairCases[0]));
      if (!representativeWork) {
        throw new Error("m2_cmx01_psc01_work_case_missing");
      }
      const features = buildPscFeatures({
        values: current.values,
        observedWorkAgeMonths:
          Number(representativeWork.observedSalesAgeMonths),
        workTrailing12,
        channelRankPercentile: rankByUid.get(representative.channelUid)
      });
      const actualByHorizon = new Map(horizons.map((horizon) => [horizon, 0]));
      for (let futureMonthIndex = 1;
        futureMonthIndex <= maximumHorizon;
        futureMonthIndex += 1) {
        const futureMonth = addMonths(origin, futureMonthIndex);
        const actual = finalIndex.get(pairKey(
          representative.standardWorkId,
          representative.channelUid
        ))?.get(futureMonth) ?? {
          cash: 0,
          labelAvailableAsOf: futureMonth
        };
        const includedHorizons = horizons.filter(
          (horizon) => horizon >= futureMonthIndex
        );
        for (const horizon of includedHorizons) {
          actualByHorizon.set(
            horizon,
            actualByHorizon.get(horizon) + Number(actual.cash)
          );
        }
        const monthly = {
          schema: "m2.current.channel_generative_monthly_row.v0.2",
          actualDefinitionId:
            "M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01",
          labelView: "DEVELOPMENT_MODELABLE_RESTATEMENT_VIEW",
          evaluationFamily: "strict",
          standardWorkId: representative.standardWorkId,
          channelUid: representative.channelUid,
          origin,
          futureMonthIndex,
          futureMonth,
          labelAvailableAsOf: actual.labelAvailableAsOf > futureMonth
            ? actual.labelAvailableAsOf
            : futureMonth,
          includedHorizons,
          observedAtOrigin: true,
          mechanism: pscMechanism(representative.settlementMechanism),
          features,
          actualPositive: Number(actual.cash),
          actualReversal: 0,
          actual: Number(actual.cash),
          trainingWeight: 1,
          futureFirstSeenIdentityUsedAsFeature: false,
          unmaturedLabelZeroImputed: false,
          buyoutCashUsed: false
        };
        monthlyRows.push(monthly);
        inputHash.update(JSON.stringify(monthly));
        inputHash.update("\n");
        originMonthlyRowCount += 1;
      }
      for (const pairCase of pairCases) {
        inputChannelHorizonConservationMaximumAbsoluteDifference = Math.max(
          inputChannelHorizonConservationMaximumAbsoluteDifference,
          Math.abs(
            actualByHorizon.get(Number(pairCase.horizonMonths))
              - Number(pairCase.actual)
          )
        );
      }
    }
    inputOriginRows.push({
      origin,
      status: originMonthlyRowCount > 0
        ? "INPUT_MATERIALIZED_ORIGIN_SAFE"
        : "NO_PSC01_FEATURE_AVAILABLE_CASES",
      monthlyRowCount: originMonthlyRowCount
    });
    process.stdout.write(
      `[M2-CMX01] psc01-input ${origin} monthly=${originMonthlyRowCount}\n`
    );
  }
  if (inputChannelHorizonConservationMaximumAbsoluteDifference > 1e-7) {
    throw new Error("m2_cmx01_psc01_input_conservation_failed");
  }
  const result = strictRollingM2PublishingScaleChannel(
    monthlyRows,
    config,
    support
  );
  const channelAggregates = new Map();
  const workAggregates = new Map();
  for (const row of result.rows) {
    const prediction = result.predictions.get(pscMonthlyKey(row));
    if (!prediction) {
      throw new Error("m2_cmx01_psc01_monthly_prediction_missing");
    }
    for (const horizonMonths of row.includedHorizons) {
      const channelKey = [
        row.standardWorkId,
        row.channelUid,
        row.origin,
        horizonMonths
      ].join("\u001f");
      const channel = channelAggregates.get(channelKey) ?? {
        standardWorkId: row.standardWorkId,
        channelUid: row.channelUid,
        origin: row.origin,
        horizonMonths,
        pointEstimate: 0,
        monthlyPredictionCount: 0,
        generatorMonthlyCount: 0,
        fallbackMonthlyCount: 0,
        occurrenceProbabilityTotal: 0,
        conditionalPositiveAmountTotal: 0
      };
      channel.pointEstimate += Number(prediction.positivePoint);
      channel.monthlyPredictionCount += 1;
      channel.generatorMonthlyCount += prediction.usedGenerator ? 1 : 0;
      channel.fallbackMonthlyCount += prediction.fallbackReason ? 1 : 0;
      channel.occurrenceProbabilityTotal += Number(
        prediction.occurrenceProbability
      );
      channel.conditionalPositiveAmountTotal += Number(
        prediction.conditionalPositiveAmount
      );
      channelAggregates.set(channelKey, channel);
    }
  }
  const baseChannelIndex = new Map();
  const baseWorkIndex = new Map();
  const expectedChannelCountByWorkCase = new Map();
  for (const rows of workCasesByOrigin.values()) {
    for (const row of rows) baseWorkIndex.set(workCaseKey(row), row);
  }
  for (const rows of channelCasesByOrigin.values()) {
    for (const row of rows) {
      baseChannelIndex.set(channelCaseKey(row), row);
      const key = workCaseKey(row);
      expectedChannelCountByWorkCase.set(
        key,
        (expectedChannelCountByWorkCase.get(key) ?? 0) + 1
      );
    }
  }
  const predictedChannelsByWorkCase = new Map();
  for (const aggregate of channelAggregates.values()) {
    const base = baseChannelIndex.get(channelCaseKey(aggregate));
    if (!base) throw new Error("m2_cmx01_psc01_base_channel_case_missing");
    const key = workCaseKey(aggregate);
    const channels = predictedChannelsByWorkCase.get(key) ?? [];
    channels.push({ aggregate, base });
    predictedChannelsByWorkCase.set(key, channels);
  }
  const temporary = [
    `${pscWorkPredictionPath}.tmp`,
    `${pscChannelPredictionPath}.tmp`
  ];
  await Promise.all(temporary.map((file) => rm(file, { force: true })));
  const workWriter = createWriteStream(temporary[0], { encoding: "utf8" });
  const channelWriter = createWriteStream(temporary[1], { encoding: "utf8" });
  let workPredictionCount = 0;
  let channelPredictionCount = 0;
  let incompleteWorkCaseCount = 0;
  for (const [key, predicted] of predictedChannelsByWorkCase) {
    let workPoint = 0;
    for (const { aggregate, base } of predicted) {
      writePrediction(channelWriter, {
        ...channelPredictionRow(base, {
          modelId: "M2-CHAN-PSC01",
          modelVariantId: "M2-CHAN-PSC01-RAW/NATIVE_CHANNEL",
          pointEstimate: aggregate.pointEstimate,
          nativeOrComposite: "NATIVE_RAW_CANDIDATE",
          populationRoute: "POPULATION_INDEPENDENT",
          allocatorId: null
        }),
        candidateId: M2_PUBLISHING_SCALE_RAW_CANDIDATE_ID,
        monthlyPredictionCount: aggregate.monthlyPredictionCount,
        generatorMonthlyCount: aggregate.generatorMonthlyCount,
        fallbackMonthlyCount: aggregate.fallbackMonthlyCount,
        meanOccurrenceProbability:
          aggregate.occurrenceProbabilityTotal
            / aggregate.monthlyPredictionCount,
        meanConditionalPositiveAmount:
          aggregate.conditionalPositiveAmountTotal
            / aggregate.monthlyPredictionCount,
        taxonomyFeatureUsed: false,
        authorizationBackfillUsed: false
      });
      channelPredictionCount += 1;
      workPoint += aggregate.pointEstimate;
    }
    const baseWork = baseWorkIndex.get(key);
    if (!baseWork) throw new Error("m2_cmx01_psc01_base_work_case_missing");
    const expectedChannelCount = expectedChannelCountByWorkCase.get(key) ?? 0;
    if (predicted.length !== expectedChannelCount) {
      incompleteWorkCaseCount += 1;
      continue;
    }
    writePrediction(workWriter, {
      ...predictionRow(baseWork, {
        modelId: "M2-CHAN-PSC01",
        modelVariantId: "M2-CHAN-PSC01-RAW/NATIVE_CHANNEL_SUM",
        pointEstimate: workPoint,
        predictionGrain: "WORK_TOTAL",
        nativeOrComposite: "NATIVE_CHANNEL_SUM_RAW_CANDIDATE",
        populationRoute: "POPULATION_INDEPENDENT"
      }),
      candidateId: M2_PUBLISHING_SCALE_RAW_CANDIDATE_ID,
      predictedChannelCount: predicted.length,
      expectedChannelCount,
      taxonomyFeatureUsed: false,
      authorizationBackfillUsed: false
    });
    workPredictionCount += 1;
    workAggregates.set(key, workPoint);
  }
  await Promise.all([closeWriter(workWriter), closeWriter(channelWriter)]);
  await Promise.all([
    rename(temporary[0], pscWorkPredictionPath),
    rename(temporary[1], pscChannelPredictionPath)
  ]);
  const manifest = {
    schema: "m2.cmx01.psc01_model_manifest.private.v0.1",
    status: workPredictionCount > 0 && channelPredictionCount > 0
      ? "COMPLETE"
      : "FAILED_NO_PREDICTIONS",
    tracked: false,
    executionDesign:
      "FROZEN_STRICT_ORIGIN_SCHEDULE_ORIGIN_BOUNDED_RAW_CANDIDATE_REPLAY",
    sourceScheduleAuthority:
      "config/m2-current-publishing-scale-channel.v0.1.json#selection.strictOrigins",
    allCampaignMonthlyOriginsClaimedAvailable: false,
    configuredStrictOrigins: config.selection.strictOrigins,
    inputOriginRows,
    monthlyInputRowCount: monthlyRows.length,
    monthlyInputSha256: inputHash.digest("hex"),
    inputChannelHorizonConservationMaximumAbsoluteDifference,
    preFeatureWindowIdentityOnlyChannelCaseCount,
    preFeatureWindowCashAmountUsed: false,
    workPredictionCount,
    channelPredictionCount,
    incompleteWorkCaseCount,
    receipts: result.receipts,
    rawCandidateId: M2_PUBLISHING_SCALE_RAW_CANDIDATE_ID,
    rawCandidateResultsPreserved: true,
    operationalFallbackOverwroteRaw: false,
    taxonomyTier: "REPORT_ONLY",
    taxonomyFeatureUsed: false,
    authorizationBackfillUsed: false,
    files: {
      workPredictions: await fileDescriptor(
        pscWorkPredictionPath,
        workPredictionCount
      ),
      nativeChannelPredictions: await fileDescriptor(
        pscChannelPredictionPath,
        channelPredictionCount
      )
    },
    finalHoldoutOpened: false,
    productionChanged: false
  };
  await writeJsonAtomic(pscManifestPath, manifest);
  process.stdout.write(`${JSON.stringify({
    status: manifest.status,
    monthlyInputRowCount: manifest.monthlyInputRowCount,
    workPredictionCount,
    channelPredictionCount,
    incompleteWorkCaseCount
  })}\n`);
}


function routerSourceRow(row, populationId) {
  return {
    ...row,
    evaluationFamily: "CMX01_MONTHLY_STRICT_ORIGIN_SAFE",
    populationId,
    grain: "WORK_TOTAL",
    channelUid: null,
    caseKey: workCaseKey(row)
  };
}


async function runChamModelsJavascriptReference() {
  const [inputManifest, config] = await Promise.all([
    readJson(chamInputManifestPath),
    readJson(path.join(
      root,
      "config/m2-current-core-legacy-horizon-amount.v0.1.json"
    ))
  ]);
  if (
    inputManifest.status !== "COMPLETE"
    || inputManifest.file.sha256 !== await sha256File(chamInputPath)
  ) {
    throw new Error("m2_cmx01_cham_input_manifest_invalid");
  }
  const source = await loadNdjson(chamInputPath);
  process.stdout.write(
    `[M2-CMX01] cham loaded=${source.length}\n`
  );
  const byHorizon = groupBy(source, (row) => String(row.horizonMonths));
  process.stdout.write("[M2-CMX01] cham horizon-index-ready\n");
  const temporary = `${chamPredictionPath}.tmp`;
  await rm(temporary, { force: true });
  const writer = createWriteStream(temporary, { encoding: "utf8" });
  const modelCounts = new Map();
  const selections = [];
  const selectionCache = new Map();
  for (const horizon of [3, 6, 12]) {
    const baseRows = byHorizon.get(String(horizon)) ?? [];
    const origins = [...new Set(baseRows.map((row) => row.origin))].sort();
    for (const armId of ["B1", "B2", "B3"]) {
      const armRows = armId === "B3"
        ? baseRows.filter((row) => row.lg01PointEstimate !== null).map(
          (row) => ({
            ...row,
            features: {
              ...row.features,
              lg01PointEstimate: Number(row.lg01PointEstimate)
            }
          })
        )
        : baseRows;
      const armIndex = buildChamOriginIndex(armRows, horizon);
      let firstSelectionLogged = false;
      for (const outerOrigin of origins) {
        const training = chamTrainingRows(armIndex, outerOrigin);
        const validation = armIndex.byOrigin.get(outerOrigin) ?? [];
        if (!chamTrainingSufficient(training, config)
          || validation.length === 0) {
          selections.push({
            armId,
            horizonMonths: horizon,
            outerOrigin,
            status: "MODEL_UNAVAILABLE_INSUFFICIENT_MATURE_EARLIER_ROWS",
            trainingRowCount: training.length,
            validationRowCount: validation.length
          });
          continue;
        }
        if (!firstSelectionLogged) {
          process.stdout.write(
            `[M2-CMX01] cham first-selection-start ${armId}`
              + ` H${horizon} ${outerOrigin} training=${training.length}\n`
          );
          firstSelectionLogged = true;
        }
        const selection = selectChamParametersCached({
          index: armIndex,
          outerOrigin,
          armId,
          config,
          cache: selectionCache
        });
        if (selection.selected === null) {
          selections.push({
            ...selection,
            validationRowCount: validation.length
          });
          continue;
        }
        let state;
        try {
          state = fitM2CoreHorizonAmountModel(training, {
            armId,
            huberDelta: selection.selected.huberDelta,
            l2: selection.selected.l2,
            config
          });
        } catch (error) {
          selections.push({
            armId,
            horizonMonths: horizon,
            outerOrigin,
            status: "MODEL_EXECUTION_FAILED_AT_ORIGIN",
            trainingRowCount: training.length,
            validationRowCount: validation.length,
            errorCode: safeErrorCode(error)
          });
          continue;
        }
        for (const row of validation) {
          const prediction = predictM2CoreHorizonAmount(row, state);
          writePrediction(writer, {
            ...predictionRow(row, {
              modelId: "M2-WORK-CHAM01",
              modelVariantId: `M2-WORK-CHAM01/${armId}`,
              pointEstimate: prediction.pointEstimate,
              predictionGrain: "WORK_TOTAL",
              nativeOrComposite: "NATIVE_RAW_CANDIDATE",
              populationRoute: "POPULATION_INDEPENDENT"
            }),
            trainingMaximumLabelAvailableAsOf:
              prediction.trainingMaximumLabelAvailableAsOf,
            selectedHuberDelta: state.huberDelta,
            selectedL2: state.l2,
            converged: state.converged,
            rawCandidatePreserved: true,
            selectedFallbackApplied: false,
            lg01InputUsed: armId === "B3"
          });
          increment(modelCounts, `M2-WORK-CHAM01/${armId}`);
        }
        selections.push({
          armId,
          horizonMonths: horizon,
          outerOrigin,
          status: "EVALUATED_ORIGIN_SAFE",
          trainingRowCount: training.length,
          trainingWorkCount: state.trainingWorkCount,
          validationRowCount: validation.length,
          maximumTrainingLabelAvailableAsOf:
            state.maximumTrainingLabelAvailableAsOf,
          selectedHuberDelta: state.huberDelta,
          selectedL2: state.l2,
          innerOriginCount: selection.innerOriginCount,
          sameOrLaterOuterTruthRead: false
        });
        process.stdout.write(
          `[M2-CMX01] cham ${armId} H${horizon} ${outerOrigin}`
            + ` training=${training.length}\n`
        );
      }
    }
  }
  await closeWriter(writer);
  await rename(temporary, chamPredictionPath);
  const predictionCount = [...modelCounts.values()].reduce(
    (sum, value) => sum + value,
    0
  );
  const manifest = {
    schema: "m2.cmx01.cham01_model_manifest.private.v0.1",
    status: predictionCount > 0 ? "COMPLETE" : "FAILED_NO_PREDICTIONS",
    tracked: false,
    executionDesign:
      "ORIGINAL_HORIZON_SPECIFIC_ORIGIN_BOUNDED_FIT_WITH_EQUIVALENT_INNER_CACHE",
    modelVariantCounts: Object.fromEntries([...modelCounts].sort()),
    selections,
    rawCandidateResultsPreserved: true,
    selectedFallbackUsedToReplaceRawCandidate: false,
    horizon36ReadOrProduced: false,
    file: await fileDescriptor(chamPredictionPath, predictionCount),
    finalHoldoutOpened: false,
    productionChanged: false
  };
  await writeJsonAtomic(chamManifestPath, manifest);
  process.stdout.write(`${JSON.stringify({
    status: manifest.status,
    predictionCount,
    modelVariantCounts: manifest.modelVariantCounts
  })}\n`);
}


async function* readNdjsonGroups(file, field) {
  const input = createReadStream(file, { encoding: "utf8" });
  const lines = createInterface({ input, crlfDelay: Infinity });
  let key = null;
  let rows = [];
  for await (const line of lines) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    const nextKey = String(row[field] ?? "");
    if (nextKey === "") {
      throw new Error(`m2_cmx01_ndjson_group_field_missing:${field}`);
    }
    if (key !== null && nextKey !== key) {
      if (nextKey < key) {
        throw new Error(`m2_cmx01_ndjson_group_order_invalid:${field}`);
      }
      yield { key, rows };
      rows = [];
    }
    key = nextKey;
    rows.push(row);
  }
  if (key !== null) yield { key, rows };
}


function buildPairHistory(rows) {
  const output = new Map();
  for (const row of rows) {
    const key = pairKey(row.standardWorkId, row.channelUid);
    const values = output.get(key) ?? [];
    values.push({ month: row.month, cash: Number(row.cash) });
    output.set(key, values);
  }
  for (const values of output.values()) {
    values.sort((left, right) => left.month.localeCompare(right.month));
  }
  return output;
}


function uniqueEligibleChannelsByWork(rows) {
  const output = new Map();
  for (const row of rows) {
    const key = String(row.standardWorkId);
    const values = output.get(key) ?? new Set();
    values.add(String(row.channelUid));
    output.set(key, values);
  }
  return new Map([...output].map(([key, values]) => [
    key,
    [...values].sort()
  ]));
}


function buildWorkSeries({ pairHistory, eligibleChannelsByWork, origin }) {
  const output = new Map();
  for (const [workId, channelUids] of eligibleChannelsByWork) {
    const monthly = new Map();
    let firstMonth = null;
    for (const channelUid of channelUids) {
      for (const row of pairHistory.get(pairKey(workId, channelUid)) ?? []) {
        if (row.month > origin) continue;
        firstMonth = firstMonth === null || row.month < firstMonth
          ? row.month
          : firstMonth;
        monthly.set(row.month, (monthly.get(row.month) ?? 0) + row.cash);
      }
    }
    if (firstMonth === null) continue;
    const values = [];
    for (
      let month = firstMonth;
      month <= origin;
      month = addMonths(month, 1)
    ) {
      values.push(Number(monthly.get(month) ?? 0));
    }
    output.set(workId, values);
  }
  return output;
}


function workCaseKey(row) {
  return [
    row.standardWorkId,
    row.origin,
    row.horizonMonths
  ].join("\u001f");
}


function channelCaseKey(row) {
  return [
    row.standardWorkId,
    row.channelUid,
    row.origin,
    row.horizonMonths
  ].join("\u001f");
}


function predictionRow(row, model) {
  return {
    modelId: model.modelId,
    modelVariantId: model.modelVariantId,
    predictionGrain: model.predictionGrain,
    nativeOrComposite: model.nativeOrComposite,
    populationRoute: model.populationRoute,
    standardWorkId: row.standardWorkId,
    workTitle: row.workTitle,
    origin: row.origin,
    horizonMonths: row.horizonMonths,
    targetStart: row.targetStart,
    targetEnd: row.targetEnd,
    targetYear: row.targetYear,
    pointEstimate: Number(model.pointEstimate),
    actual: Number(row.actual),
    actualPositive: Number(row.actualPositive ?? Math.max(0, row.actual)),
    actualReversal: Number(row.actualReversal ?? 0),
    labelAvailableAsOf: row.labelAvailableAsOf,
    dynamicCore80Flag: Boolean(row.dynamicCore80Flag),
    annualActualCore80Flag: Boolean(row.annualActualCore80Flag),
    core90: Boolean(row.core90),
    cashBandId: row.cashBandId,
    segment: row.segment,
    dominantRevenueMode: row.dominantRevenueMode,
    revenueDecile: row.revenueDecile,
    referenceRank: row.referenceRank,
    originSafeStatus: row.originSafeStatus,
    selectedChannelWeight: model.selectedChannelWeight ?? null,
    selectionReason: model.selectionReason ?? null
  };
}


function channelPredictionRow(row, model) {
  return {
    modelId: model.modelId,
    modelVariantId: model.modelVariantId,
    predictionGrain: "WORK_CHANNEL",
    nativeOrComposite: model.nativeOrComposite,
    populationRoute: model.populationRoute,
    allocatorId: model.allocatorId,
    standardWorkId: row.standardWorkId,
    workTitle: row.workTitle,
    channelUid: row.channelUid,
    channelName: row.channelName,
    origin: row.origin,
    horizonMonths: row.horizonMonths,
    targetStart: row.targetStart,
    targetEnd: row.targetEnd,
    targetYear: row.targetYear,
    pointEstimate: Number(model.pointEstimate),
    actual: Number(row.actual),
    workActual: Number(row.workActual),
    dynamicCore80Flag: Boolean(row.dynamicCore80Flag),
    annualActualCore80Flag: Boolean(row.annualActualCore80Flag),
    core90: Boolean(row.core90),
    cashBandId: row.cashBandId,
    settlementMechanism: row.settlementMechanism,
    channelIdentityStatus: row.channelIdentityStatus,
    referenceRank: row.referenceRank,
    originSafeStatus: row.originSafeStatus,
    kSource: model.kSource ?? null
  };
}


function writePrediction(writer, row) {
  if (!Number.isFinite(row.pointEstimate)) {
    throw new Error("m2_cmx01_prediction_value_invalid");
  }
  writeNdjson(writer, row);
}


function increment(counts, key) {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}


function monthsAndValues(rows = [], startMonth, origin) {
  const visible = rows.filter((row) => row.month <= origin);
  if (visible.length === 0) return { months: [], values: [] };
  const indexed = new Map(visible.map((row) => [row.month, row.cash]));
  const firstObserved = visible[0].month;
  const first = startMonth > firstObserved ? startMonth : firstObserved;
  const months = [];
  const values = [];
  for (let month = first; month <= origin; month = addMonths(month, 1)) {
    months.push(month);
    values.push(Number(indexed.get(month) ?? 0));
  }
  return { months, values };
}


function pairKey(workId, channelUid) {
  return `${workId}\u001f${channelUid}`;
}


function pscMonthlyKey(row) {
  return [
    row.standardWorkId,
    row.channelUid,
    row.origin,
    row.futureMonthIndex
  ].join("\u001f");
}


function buildPscMonthlyIndex(rows) {
  const output = new Map();
  for (const row of rows) {
    const key = pairKey(row.standardWorkId, row.channelUid);
    const months = output.get(key) ?? new Map();
    const current = months.get(row.month) ?? {
      cash: 0,
      labelAvailableAsOf: row.month
    };
    current.cash += Math.max(0, Number(row.cash));
    if (row.labelAvailableAsOf > current.labelAvailableAsOf) {
      current.labelAvailableAsOf = row.labelAvailableAsOf;
    }
    months.set(row.month, current);
    output.set(key, months);
  }
  return output;
}


function densePscPositiveSeries(rows, origin, featureStart) {
  const visible = rows.filter((row) => (
    row.month >= featureStart
    && row.month <= origin
    && Number(row.cash) > 0
  ));
  if (visible.length === 0) return [];
  const first = visible[0].month;
  const indexed = new Map(rows.filter((row) => (
    row.month >= first && row.month <= origin
  )).map((row) => [row.month, Math.max(0, Number(row.cash))]));
  return monthRange(first, origin).map(
    (month) => Number(indexed.get(month) ?? 0)
  );
}


function buildPscFeatures({
  values,
  observedWorkAgeMonths,
  workTrailing12,
  channelRankPercentile
}) {
  const age = values.length;
  const recent3 = values.slice(-Math.min(3, age));
  const previous3 = age >= 4
    ? values.slice(Math.max(0, age - 6), Math.max(0, age - 3))
    : [];
  const recent12 = values.slice(-Math.min(12, age));
  const positiveIndexes = values.flatMap(
    (value, index) => value > 0 ? [index] : []
  );
  const peak = Math.max(...values);
  const latestPeakIndex = values.lastIndexOf(peak);
  const logSeries = recent12.map((value) => Math.log1p(value));
  const logMean = sumNumbers(logSeries) / logSeries.length;
  return {
    log_recent_1_positive: Math.log1p(sumNumbers(values.slice(-1))),
    log_recent_3_positive: Math.log1p(sumNumbers(recent3)),
    log_recent_12_positive: Math.log1p(sumNumbers(recent12)),
    log_cumulative_positive: Math.log1p(sumNumbers(values)),
    positive_rate_3:
      recent3.filter((value) => value > 0).length / recent3.length,
    positive_rate_12:
      recent12.filter((value) => value > 0).length / recent12.length,
    log_recent_3_vs_previous_3: age < 4
      ? 0
      : Math.log1p(sumNumbers(recent3))
        - Math.log1p(sumNumbers(previous3)),
    previous_3_available: age >= 4 ? 1 : 0,
    log_positive_volatility_12: Math.sqrt(
      sumNumbers(logSeries.map((value) => (value - logMean) ** 2))
        / logSeries.length
    ),
    months_since_last_positive_scaled:
      Math.min(age - 1 - positiveIndexes.at(-1), 36) / 36,
    log_historical_peak_positive: Math.log1p(peak),
    months_since_peak_scaled:
      Math.min(age - 1 - latestPeakIndex, 36) / 36,
    log_observed_channel_age: Math.log1p(age),
    log_observed_work_age: Math.log1p(observedWorkAgeMonths),
    trailing_12_work_share: workTrailing12 === 0
      ? 0
      : sumNumbers(recent12) / workTrailing12,
    channel_rank_percentile: Number(channelRankPercentile),
    available_month_fraction_3: Math.min(age, 3) / 3,
    available_month_fraction_12: Math.min(age, 12) / 12
  };
}


function pscMechanism(revenueMode) {
  return {
    membership_subscription: "membership",
    advertising_or_free_share: "advertising",
    single_purchase_or_on_demand: "transactional"
  }[String(revenueMode)] ?? "other";
}


function denseSeries(rows = [], origin) {
  const visible = rows.filter((row) => row.month <= origin);
  if (visible.length === 0) return [];
  const indexed = new Map(visible.map((row) => [row.month, row.cash]));
  const output = [];
  for (
    let month = visible[0].month;
    month <= origin;
    month = addMonths(month, 1)
  ) {
    output.push(Number(indexed.get(month) ?? 0));
  }
  return output;
}


function ccrGroupKey(row) {
  return [
    row.segment ?? "unknown",
    row.horizonMonths,
    row.dominantRevenueMode ?? "unknown"
  ].join("|");
}


function selectCcrByGroup({ history, current, origin, policy }) {
  const output = new Map();
  for (const group of [...new Set(current.map(ccrGroupKey))].sort()) {
    const training = history.filter((row) => (
      ccrGroupKey(row) === group
      && row.origin < origin
      && row.labelAvailableAsOf <= origin
    ));
    const actualDenominator = training.reduce(
      (sum, row) => sum + Math.abs(Number(row.actual)),
      0
    );
    const base = training.length > 0 && actualDenominator > 0
      ? scoreM2CurrentPointRows(training.map((row) => ({
        ...row,
        pointEstimate: row.basePointEstimate
      })))
      : null;
    if (
      training.length < policy.minimumEarlierRows
      || !base
      || base.wape === 0
    ) {
      output.set(group, {
        weight: 0,
        reason: "mature_earlier_evidence_below_minimum"
      });
      continue;
    }
    const feasible = [...new Set(policy.weights.map(Number))]
      .filter((weight) => weight >= 0 && weight <= 1)
      .map((weight) => {
        const metrics = scoreM2CurrentPointRows(training.map((row) => ({
          ...row,
          pointEstimate: Math.max(
            0,
            row.basePointEstimate * (1 - weight)
              + row.channelPointEstimate * weight
          )
        })));
        return {
          weight,
          metrics,
          relativeWape: metrics.wape / base.wape - 1
        };
      }).filter(({ metrics }) => (
        Math.abs(metrics.signedBias) <= policy.maximumTrainingAbsoluteBias
      )).sort((left, right) => (
        left.metrics.wape - right.metrics.wape
        || Math.abs(left.metrics.signedBias)
          - Math.abs(right.metrics.signedBias)
        || left.weight - right.weight
      ));
    const selected = feasible[0];
    if (
      !selected
      || selected.weight === 0
      || selected.relativeWape > -policy.minimumRelativeWapeImprovement
    ) {
      output.set(group, {
        weight: 0,
        reason: "channel_signal_did_not_clear_nested_improvement_and_bias_gates"
      });
    } else {
      output.set(group, {
        weight: selected.weight,
        reason: "channel_signal_cleared_nested_improvement_and_bias_gates"
      });
    }
  }
  return output;
}


function trailingCash(rows = [], origin, months) {
  const first = addMonths(origin, -(months - 1));
  return rows.filter((row) => row.month >= first && row.month <= origin)
    .reduce((sum, row) => sum + Math.max(0, Number(row.cash)), 0);
}


function lastNonzeroShares({ pairHistory, workId, channelUids, origin }) {
  const first = addMonths(origin, -11);
  for (let month = origin; month >= first; month = addMonths(month, -1)) {
    const rows = channelUids.map((channelUid) => ({
      channelUid,
      cash: Math.max(0, Number(
        (pairHistory.get(pairKey(workId, channelUid)) ?? [])
          .find((row) => row.month === month)?.cash ?? 0
      ))
    })).filter((row) => row.cash > 0);
    if (rows.length > 0) return rows;
  }
  return null;
}


function buildHumanHistoryContext(rows) {
  const pairHistory = buildPairHistory(rows);
  const channelMonthly = new Map();
  for (const row of rows) {
    const values = channelMonthly.get(row.channelUid) ?? new Map();
    values.set(row.month, (values.get(row.month) ?? 0) + Number(row.cash));
    channelMonthly.set(row.channelUid, values);
  }
  return { pairHistory, channelMonthly };
}


function buildMonthlyWorkHistoryFromCases({ workRows, pairHistory, origin }) {
  const output = new Map();
  const templates = new Map();
  for (const row of workRows) {
    if (!templates.has(row.standardWorkId)) {
      templates.set(row.standardWorkId, row);
    }
  }
  for (const [workId, row] of templates) {
    const monthly = new Map();
    let firstMonth = null;
    for (const channel of row.canonicalChannels) {
      for (const item of pairHistory.get(pairKey(workId, channel.channelUid))
        ?? []) {
        if (item.month > origin) continue;
        firstMonth = firstMonth === null || item.month < firstMonth
          ? item.month
          : firstMonth;
        monthly.set(item.month, (monthly.get(item.month) ?? 0) + item.cash);
      }
    }
    if (firstMonth === null) continue;
    output.set(workId, monthRange(firstMonth, origin).map((month) => ({
      month,
      cash: Number(monthly.get(month) ?? 0)
    })));
  }
  return output;
}


function chamTrainingSufficient(rows, config) {
  return rows.length >= Number(config.rolling.minimumTrainingRows)
    && new Set(rows.map((row) => row.standardWorkId)).size
      >= Number(config.rolling.minimumTrainingWorks);
}


function buildChamOriginIndex(rows, horizonMonths) {
  const byOrigin = groupBy(rows, (row) => row.origin);
  return {
    horizonMonths,
    byOrigin,
    origins: [...byOrigin.keys()].sort(),
    trainingCache: new Map()
  };
}


function chamTrainingRows(index, outerOrigin) {
  const cached = index.trainingCache.get(outerOrigin);
  if (cached !== undefined) return cached;
  const cutoff = addMonths(outerOrigin, -index.horizonMonths);
  const rows = index.origins.filter((origin) => origin <= cutoff)
    .flatMap((origin) => index.byOrigin.get(origin) ?? [])
    .filter((row) => row.labelAvailableAsOf <= outerOrigin);
  if (rows.some((row) => (
    row.origin >= outerOrigin || row.labelAvailableAsOf > outerOrigin
  ))) {
    throw new Error("m2_cmx01_cham_training_index_boundary_failed");
  }
  index.trainingCache.set(outerOrigin, rows);
  return rows;
}


function selectChamParametersCached({
  index,
  outerOrigin,
  armId,
  config,
  cache
}) {
  const eligible = chamTrainingRows(index, outerOrigin);
  const horizonMonths = index.horizonMonths;
  const eligibleOrigins = new Set(eligible.map((row) => row.origin));
  const innerOrigins = index.origins.filter((innerOrigin) => {
    if (!eligibleOrigins.has(innerOrigin)) return false;
    return chamTrainingSufficient(
      chamTrainingRows(index, innerOrigin),
      config
    );
  });
  if (innerOrigins.length < config.rolling.minimumInnerValidationOrigins) {
    return {
      status: "NOT_SELECTABLE_INSUFFICIENT_INNER_ORIGINS",
      armId,
      horizonMonths,
      outerOrigin,
      eligibleTrainingRowCount: eligible.length,
      innerOriginCount: innerOrigins.length,
      selected: null
    };
  }
  const candidates = [];
  for (const huberDelta of config.training.grid.huberDelta) {
    for (const l2 of config.training.grid.l2) {
      const losses = [];
      for (const innerOrigin of innerOrigins) {
        const cacheKey = [
          armId,
          horizonMonths,
          innerOrigin,
          huberDelta,
          l2
        ].join("\u001f");
        let loss = cache.get(cacheKey);
        if (loss === undefined) {
          const training = chamTrainingRows(index, innerOrigin);
          const validation = index.byOrigin.get(innerOrigin) ?? [];
          const state = fitM2CoreHorizonAmountModel(training, {
            armId,
            huberDelta,
            l2,
            config
          });
          const predictions = validation.map(
            (row) => predictM2CoreHorizonAmount(row, state)
          );
          loss = predictions.reduce((sum, prediction, index) => {
            const residual = signedLog1p(validation[index].actual)
              - prediction.transformedPointEstimate;
            const absolute = Math.abs(residual);
            return sum + (absolute <= huberDelta
              ? 0.5 * residual ** 2
              : huberDelta * (absolute - 0.5 * huberDelta));
          }, 0) / predictions.length;
          cache.set(cacheKey, loss);
        }
        losses.push(loss);
      }
      candidates.push({
        huberDelta,
        l2,
        meanValidationHuberLoss:
          losses.reduce((sum, value) => sum + value, 0) / losses.length
      });
    }
  }
  candidates.sort((left, right) => (
    left.meanValidationHuberLoss - right.meanValidationHuberLoss
    || left.huberDelta - right.huberDelta
    || left.l2 - right.l2
  ));
  return {
    status: "SELECTED_ON_EARLIER_MATURE_INNER_ORIGINS",
    armId,
    horizonMonths,
    outerOrigin,
    eligibleTrainingRowCount: eligible.length,
    innerOriginCount: innerOrigins.length,
    selected: candidates[0]
  };
}


function buildHumanHistoryRow({
  row,
  historyContext,
  origin,
  featureStart
}) {
  const historyMonths = monthRange(featureStart, origin);
  const channels = [];
  const amountByMode = new Map();
  const totalPositiveByMonth = new Map(
    historyMonths.map((month) => [month, 0])
  );
  for (const base of row.canonicalChannels) {
    const pairRows = (
      historyContext.pairHistory.get(pairKey(
        row.standardWorkId,
        base.channelUid
      )) ?? []
    ).filter((item) => item.month >= featureStart && item.month <= origin);
    if (pairRows.length === 0) continue;
    const own = new Map(pairRows.map((item) => [item.month, item.cash]));
    const positive = historyMonths.map((month) => Math.max(
      0,
      Number(own.get(month) ?? 0)
    ));
    for (let index = 0; index < historyMonths.length; index += 1) {
      const month = historyMonths[index];
      totalPositiveByMonth.set(
        month,
        totalPositiveByMonth.get(month) + positive[index]
      );
    }
    const trailing = positive.slice(-12);
    const platform = historyContext.channelMonthly.get(base.channelUid)
      ?? new Map();
    const peerSeries = historyMonths.map((month, index) => Math.max(
      0,
      Number(platform.get(month) ?? 0) - positive[index]
    ));
    const peerRecent6 = sumNumbers(peerSeries.slice(-6));
    const peerPrevious6 = sumNumbers(peerSeries.slice(-12, -6));
    const peerTrendRatio = peerPrevious6 > 0
      ? peerRecent6 / peerPrevious6
      : peerRecent6 > 0 ? 2 : 1;
    const positiveIndexes = positive.map((amount, index) => (
      amount > 0 ? index : null
    )).filter((value) => value !== null);
    const cumulativePositive = sumNumbers(positive);
    amountByMode.set(
      base.revenueMode,
      (amountByMode.get(base.revenueMode) ?? 0) + cumulativePositive
    );
    channels.push({
      channelUid: base.channelUid,
      channelRole: base.channelRole,
      revenueMode: base.revenueMode,
      trailingAnnualPositive: sumNumbers(trailing),
      latestMonthPositive: trailing.at(-1) ?? 0,
      recent3AnnualPositive:
        sumNumbers(trailing.slice(-3)) / 3 * 12,
      cumulativePositive,
      cumulativeReversal: 0,
      cumulativeNet: cumulativePositive,
      monthsSinceLastPositive: positiveIndexes.length > 0
        ? positive.length - 1 - positiveIndexes.at(-1)
        : positive.length,
      peerRecent6Positive: peerRecent6,
      peerPrevious6Positive: peerPrevious6,
      peerTrendRatio
    });
  }
  if (channels.length === 0) return null;
  channels.sort((left, right) => left.channelUid.localeCompare(right.channelUid));
  const totalPositive = historyMonths.map(
    (month) => totalPositiveByMonth.get(month) ?? 0
  );
  const activeLast12 = totalPositive.slice(-12)
    .filter((value) => value > 0).length;
  const trailingPositive = sumNumbers(totalPositive.slice(-12));
  const historicalPositive = sumNumbers(totalPositive);
  const segment = trailingPositive === 0 && historicalPositive > 0
    ? "dormant"
    : activeLast12 <= 3 ? "intermittent" : "active";
  const dominantRevenueMode = [...amountByMode].sort((left, right) => (
    right[1] - left[1] || right[0].localeCompare(left[0])
  ))[0]?.[0] ?? "unknown";
  const workPositiveIndexes = totalPositive.map((amount, index) => (
    amount > 0 ? index : null
  )).filter((value) => value !== null);
  const firstObserved = row.rightsStartMonth > featureStart
    ? row.rightsStartMonth
    : featureStart;
  const observedStartIndex = Math.max(
    0,
    historyMonths.indexOf(firstObserved)
  );
  return {
    observedSalesAgeMonths: row.observedSalesAgeMonths,
    monthsSinceLastPositive: workPositiveIndexes.length > 0
      ? totalPositive.length - 1 - workPositiveIndexes.at(-1)
      : totalPositive.length,
    segment,
    dominantRevenueMode,
    canonicalChannels: channels,
    salesShareMonthlyHistory: {
      startsAt: historyMonths[observedStartIndex],
      through: origin,
      positiveSeries: totalPositive.slice(observedStartIndex),
      reversalSeries: totalPositive.slice(observedStartIndex).map(() => 0),
      observedZeroMonthsIncluded: true,
      unobservedMonthsZeroFilled: false
    },
    cashHistoryWindowStart: featureStart,
    cashHistoryThroughOriginOnly: true,
    pre2021CashAmountUsed: false,
    categoryUsedForPrediction: false,
    channelAttributesEffectiveAtProven: false
  };
}


function monthRange(first, last) {
  const output = [];
  for (let month = first; month <= last; month = addMonths(month, 1)) {
    output.push(month);
  }
  return output;
}


function sumNumbers(values) {
  return values.reduce((sum, value) => sum + Number(value), 0);
}


async function loadNdjson(file) {
  const rows = [];
  await forEachNdjson(file, (row) => rows.push(row));
  return rows;
}


async function loadPredictionIndex(file, modelId) {
  const output = new Map();
  await forEachNdjson(file, (row) => {
    if (row.modelId !== modelId) return;
    const key = workCaseKey(row);
    if (output.has(key)) {
      throw new Error(`m2_cmx01_prediction_key_duplicate:${modelId}`);
    }
    output.set(key, Number(row.pointEstimate));
  });
  return output;
}


function safeErrorCode(error) {
  const value = String(error?.message ?? error ?? "unknown_error");
  return value.replace(/[^A-Za-z0-9_.:-]/gu, "_").slice(0, 240);
}


async function loadAuthorityRows(receipt) {
  const factor = 10n ** BigInt(receipt.amountScalePower);
  const currencyScope = `authority-ledger-native-unit:${receipt.sourceDigests.salesShare}`;
  const rows = [];
  const ids = new Set();
  await forEachNdjson(authorityFactsPath, (row) => {
    const amountMinor = decimalToMinor(
      row.actualSalesAmount,
      receipt.amountScalePower
    );
    const recordId = String(row.authorityRecordId);
    if (ids.has(recordId)) throw new Error("m2_cmx01_authority_id_duplicate");
    ids.add(recordId);
    rows.push({
      recordId,
      reversalScopeKey: buildReversalScopeKeyV1({
        cashCategory: "sales_share",
        standardWorkId: String(row.standardWorkId),
        channelMemberId: String(row.channelMemberId),
        currencyScope
      }),
      postingMonth: String(row.billMonth).slice(0, 7),
      recordedAt: String(row.recordedAt),
      eventType: amountMinor < 0n ? "reversal" : "positive_sales_share",
      amountMinor: amountMinor.toString(),
      standardWorkId: String(row.standardWorkId),
      channelMemberId: String(row.channelMemberId)
    });
  });
  if (
    rows.length !== receipt.rowCount
    || rows.filter((row) => BigInt(row.amountMinor) < 0n).length
      !== receipt.negativeRowCount
  ) {
    throw new Error("m2_cmx01_authority_row_count_mismatch");
  }
  return { rows, factor, scalePower: receipt.amountScalePower };
}


function buildMetadataIndex(metadata) {
  if (metadata?.schema !== "m2.cmx01.static_metadata.private.v0.1") {
    throw new Error("m2_cmx01_metadata_schema_invalid");
  }
  return {
    workById: new Map(metadata.works.map((row) => [
      String(row.standardWorkId), row
    ])),
    channelById: new Map(metadata.channels.map((row) => [
      String(row.channelUid), row
    ]))
  };
}


function restatementMonthlyRows(restatement, metadata, scalePower) {
  const factor = Number(10n ** BigInt(scalePower));
  const rows = [];
  let totalMinor = 0n;
  for (const scope of restatement.scopes) {
    const availabilityByMonth = new Map(
      scope.restatedBalances.map((balance) => [
        String(balance.month),
        String(balance.month)
      ])
    );
    for (const allocation of scope.allocations ?? []) {
      if (BigInt(allocation.consumedAmountMinor) <= 0n) continue;
      const month = String(allocation.revenueRecognitionMonth);
      const available = String(allocation.reversalRecordedAt).slice(0, 7);
      const current = availabilityByMonth.get(month) ?? month;
      if (available > current) availabilityByMonth.set(month, available);
    }
    for (const balance of scope.restatedBalances) {
      const amountMinor = BigInt(balance.amountMinor);
      totalMinor += amountMinor;
      const labelAvailableAsOf = availabilityByMonth.get(balance.month)
        ?? balance.month;
      if (amountMinor === 0n && labelAvailableAsOf === balance.month) {
        continue;
      }
      const work = metadata.workById.get(scope.standardWorkId);
      const channel = metadata.channelById.get(scope.channelMemberId);
      if (!work || !channel) {
        throw new Error("m2_cmx01_restatement_metadata_missing");
      }
      rows.push({
        standardWorkId: scope.standardWorkId,
        channelUid: scope.channelMemberId,
        month: balance.month,
        labelAvailableAsOf,
        cash: Number(amountMinor) / factor,
        amountMinor: amountMinor.toString(),
        level2Category: work.level2Category,
        level3Category: work.level3Category,
        settlementMechanism: channel.revenueMode,
        channelRole: channel.channelRole,
        channelIdentityStatus: channel.identityStatus
      });
    }
  }
  if (totalMinor !== BigInt(restatement.modelableRestatedRevenueMinor)) {
    throw new Error("m2_cmx01_monthly_restatement_conservation_failed");
  }
  return rows;
}


function buildCashBands(workCases) {
  const byWork = new Map();
  for (const row of workCases.filter((item) => item.core80)) {
    if (byWork.has(row.standardWorkId)) continue;
    const trailing12Cash = row.canonicalChannels.reduce((total, channel) => (
      total + Math.max(0, Number(channel.trailingAnnualPositive))
    ), 0);
    byWork.set(row.standardWorkId, trailing12Cash);
  }
  const ordered = [...byWork.entries()].sort((left, right) => (
    right[1] - left[1] || left[0].localeCompare(right[0])
  ));
  const total = ordered.reduce((sum, row) => sum + row[1], 0);
  let cumulative = 0;
  const output = new Map();
  for (const [workId, cash] of ordered) {
    const shareBefore = total > 0 ? cumulative / total : 0;
    output.set(workId, shareBefore < 0.5 ? "H50" : shareBefore < 0.8 ? "M30" : "L20");
    cumulative += cash;
  }
  return output;
}


function buildAnnualActualCoreFlags(workCases, cells) {
  const output = new Map();
  for (const cell of cells.filter(
    (item) => item.annualH12BusinessExam
  )) {
    const rows = workCases.filter((row) => (
      row.origin === cell.origin && row.horizonMonths === 12
    )).sort((left, right) => (
      right.actual - left.actual
      || left.standardWorkId.localeCompare(right.standardWorkId)
    ));
    const positive = rows.filter((row) => row.actual > 0);
    const total = positive.reduce((sum, row) => sum + row.actual, 0);
    let cumulative = 0;
    let cutoff = null;
    for (const row of positive) {
      if (cutoff !== null && Math.abs(row.actual - cutoff) > 1e-9) break;
      output.set(
        `${row.standardWorkId}\u001f${row.origin}\u001f${row.horizonMonths}`,
        true
      );
      cumulative += row.actual;
      if (cutoff === null && cumulative >= total * 0.8) cutoff = row.actual;
    }
  }
  return output;
}


function assertRestatementUsable(restatement) {
  if (
    restatement.conservationDifferenceMinor !== "0"
    || [
      "BLOCKED_RECORDED_AT_MISSING",
      "BLOCKED_REVERSAL_CLASSIFICATION"
    ].includes(restatement.status)
  ) {
    throw new Error("m2_cmx01_restatement_blocked");
  }
}


function decimalToMinor(value, scalePower) {
  const text = String(value);
  if (!/^-?\d+(?:\.\d+)?$/u.test(text)) {
    throw new Error("m2_cmx01_decimal_invalid");
  }
  const negative = text.startsWith("-");
  const unsigned = negative ? text.slice(1) : text;
  const [whole, fraction = ""] = unsigned.split(".");
  if (fraction.length > scalePower) {
    throw new Error("m2_cmx01_decimal_scale_exceeded");
  }
  const digits = `${whole}${fraction.padEnd(scalePower, "0")}`;
  const amount = BigInt(digits || "0");
  return negative ? -amount : amount;
}


function groupBy(values, keyOf) {
  const result = new Map();
  for (const value of values) {
    const key = keyOf(value);
    const group = result.get(key) ?? [];
    group.push(value);
    result.set(key, group);
  }
  return result;
}


async function forEachNdjson(file, callback) {
  const input = createReadStream(file, { encoding: "utf8" });
  const lines = createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    if (line.trim()) callback(JSON.parse(line));
  }
}


function writeNdjson(writer, row) {
  writer.write(`${JSON.stringify(row)}\n`);
}


function closeWriter(writer) {
  return new Promise((resolvePromise, rejectPromise) => {
    writer.on("error", rejectPromise);
    writer.end(resolvePromise);
  });
}


async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}


async function writeJsonAtomic(file, value) {
  const temporary = `${file}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, file);
}


async function sha256File(file) {
  const hash = createHash("sha256");
  const input = createReadStream(file);
  for await (const block of input) hash.update(block);
  return hash.digest("hex");
}


async function fileDescriptor(file, rowCount) {
  const info = await stat(file);
  return {
    path: path.basename(file),
    rowCount,
    byteCount: info.size,
    sha256: await sha256File(file)
  };
}


function optionValue(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1];
}
