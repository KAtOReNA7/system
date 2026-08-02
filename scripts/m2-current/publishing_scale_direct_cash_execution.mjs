import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {
  createReadStream,
  promises as fs
} from "node:fs";
import path from "node:path";
import {createInterface} from "node:readline";

import {
  applyM2DevelopmentModelableRestatementToPackedRows,
  expandM2ChannelGenerativePackedRows,
  scoreM2ChannelGenerativeFrozenG0Comparator
} from "../../src/domain/m2Current/channelGenerative.js";
import {
  M2Psc03OccurrenceProjectionBuilder,
  buildM2Psc03SyntheticDiagnostic,
  crossFitM2Psc03Arm,
  m2Psc03Binary64Hex,
  m2Psc03EvaluationFamily,
  m2Psc03MonthlyKey,
  scoreM2Psc03OuterResult,
  validateM2Psc03DevelopmentConfig
} from "../../src/domain/m2Current/publishingScaleDirectCashDevelopment.js";
import {
  M2_PSC03_EXPERIMENT_ID,
  M2_PSC03_MODEL_ID,
  M2_PSC03_PREREGISTRATION_ID,
  M2_PSC03_RAW_CANDIDATE_ID,
  validateM2Psc03Preregistration
} from "../../src/domain/m2Current/publishingScaleDirectCashPreregistration.js";
import {
  assignM2Psc03CashBands,
  combineM2Psc03EvaluationFamilies,
  evaluateM2Psc03ScaleRecovery,
  groupM2Psc03Scores,
  normalizedM2Psc03ChannelCompositionWape,
  pairedM2Psc03WholeWorkBootstrap,
  protectM2Psc03Aggregate,
  scoreM2Psc03CaseRows,
  scoreM2Psc03ConditionalRows,
  selectM2Psc03OriginVisiblePopulation,
  verifyM2Psc03SameCaseComparator
} from "../../src/domain/m2Current/publishingScaleDirectCashEvaluation.js";
import {
  validateM2BusinessAcceptanceContract
} from "../../src/domain/m2Current/businessAcceptanceContract.js";
import {
  verifyM2PublishingScaleGitAndCiPreflight
} from "./publishing_scale_channel_execution.mjs";

const DEVELOPMENT_CONFIG =
  "config/m2-current-publishing-scale-channel-direct-cash-development.v0.1.json";
const PREREGISTRATION_CONFIG =
  "config/m2-current-publishing-scale-channel-direct-cash-preregistration.v0.1.json";
const SCHEMA_CONFIG =
  "config/m2-current-publishing-scale-channel-direct-cash-schema.v0.1.json";
const PSC01_CONFIG = "config/m2-current-publishing-scale-channel.v0.1.json";
const SUPPORT_CONFIG = "config/m2-publishing-scale-statistical-support.v1.json";
const BUSINESS_CONFIG = "config/m2-business-acceptance-contract.v1.json";
const IMPLEMENTATION_SOURCE =
  "src/domain/m2Current/publishingScaleDirectCashDevelopment.js";
const EVALUATION_SOURCE =
  "src/domain/m2Current/publishingScaleDirectCashEvaluation.js";
const RUNNER_SOURCE =
  "scripts/m2-current/publishing_scale_direct_cash_execution.mjs";
const PSC01_RECEIPT_PREFIX =
  "M2-current-publishing-scale-channel-run-receipt-private-v0.2";
const PUBLIC_SYNTHETIC =
  "docs/analysis/m2-current/M2-publishing-scale-channel-direct-cash-public-diagnostic-v0.1.json";

export async function runM2Psc03PublicDiagnostic({root, verify = false}) {
  const contracts = await readContracts(root);
  validateContracts(contracts);
  const fixture = syntheticFixture(
    contracts.psc01Config,
    contracts.development
  );
  const expected = [
    ...fixture.primary,
    ...fixture.strict.filter((row) => row.origin === "2022-12")
  ];
  const result = buildM2Psc03SyntheticDiagnostic({
    primaryRows: fixture.primary,
    strictRows: fixture.strict,
    occurrenceRows: expected.map((row) => ({
      ...row,
      occurrenceProbability: row.observedAtOrigin ? 0.625 : 0
    })),
    config: fixture.config,
    psc01Config: contracts.psc01Config,
    support: contracts.support
  });
  const publicResult = Object.freeze({
    schema: "m2.current.psc03.public_synthetic_diagnostic.v0.1",
    status: result.status,
    modelId: result.modelId,
    rawCandidateId: result.rawCandidateId,
    experimentId: result.experimentId,
    preregistrationId: result.preregistrationId,
    occurrenceParity: result.occurrenceParity,
    armPredictionCounts: Object.freeze(Object.fromEntries(
      Object.entries(result.arms).map(([arm, value]) => [arm, Object.freeze({
        primary: value.primaryPredictionCount,
        strict: value.strictPredictionCount
      })])
    )),
    boundaries: result.boundaries
  });
  if (verify) {
    const expectedArtifact = JSON.parse(await fs.readFile(
      path.join(root, PUBLIC_SYNTHETIC),
      "utf8"
    ));
    if (stableJson(expectedArtifact) !== stableJson(publicResult)) {
      throw new Error("m2_psc03_public_synthetic_artifact_drift");
    }
  }
  process.stdout.write(`${JSON.stringify(publicResult)}\n`);
  return publicResult;
}

export async function runM2Psc03MetadataPrecheck({root}) {
  const contracts = await readContracts(root);
  validateContracts(contracts);
  const frozen = await inspectFrozenPsc01({root, contracts, hashRows: true});
  const outputDirectory = resolvePrivateDirectory(
    root,
    contracts.development.privateOutputs.directory
  );
  await fs.mkdir(outputDirectory, {recursive: true});
  const ignored = gitCheckIgnored(root, contracts.development.privateOutputs.directory);
  const result = Object.freeze({
    schema: "m2.current.psc03.private_metadata_precheck.v0.1",
    status: frozen.ready
      ? "PSC03_PRIVATE_METADATA_READY_BEFORE_PREDICTION"
      : "PSC03_EXECUTION_INPUT_UNAVAILABLE_NO_MODEL_EVIDENCE",
    modelId: M2_PSC03_MODEL_ID,
    rawCandidateId: M2_PSC03_RAW_CANDIDATE_ID,
    experimentId: M2_PSC03_EXPERIMENT_ID,
    preregistrationId: M2_PSC03_PREREGISTRATION_ID,
    frozenPsc01: Object.freeze({
      completedReceiptCount: frozen.completedReceiptCount,
      manifestValid: frozen.manifestValid,
      monthlyRowCount: frozen.monthlyRowCount,
      expectedMonthlyRowCount: contracts.development.frozenPsc01.monthlyRowCount,
      evaluationSha256: frozen.evaluationSha256,
      digestMatchesManifest: frozen.digestMatchesManifest,
      sourceAndTrainingInputsReadable: frozen.preparedBundleReady,
      target: contracts.preregistration.immutableScientificScope.target,
      actualDefinitionId:
        contracts.preregistration.immutableScientificScope.actualDefinitionId,
      originContractBound: true,
      horizonContractBound: true,
      populationIdentityBound: true
    }),
    frozenLg01: Object.freeze({
      comparatorPresent: frozen.lg01ComparatorPresent,
      manifestPresent: frozen.lg01ManifestPresent,
      scoreRowsRead: 0,
      scoresRead: false
    }),
    privateOutput: Object.freeze({
      writable: await directoryWritable(outputDirectory),
      gitIgnored: ignored
    }),
    prohibitedReads: Object.freeze({
      psc03MetricsComputed: false,
      outerActualAggregated: false,
      lg01ScoresRead: false,
      psc02AuthorityReaudited: false
    })
  });
  if (
    result.status !== "PSC03_PRIVATE_METADATA_READY_BEFORE_PREDICTION"
    || result.privateOutput.writable !== true
    || result.privateOutput.gitIgnored !== true
  ) {
    return result;
  }
  return result;
}

export async function runM2Psc03ControlledDevelopmentReplay({root}) {
  const contracts = await readContracts(root);
  validateContracts(contracts);
  const gitPreflight = verifyM2PublishingScaleGitAndCiPreflight({root});
  const metadata = await runM2Psc03MetadataPrecheck({root});
  if (metadata.status !== "PSC03_PRIVATE_METADATA_READY_BEFORE_PREDICTION") {
    throw new Error("PSC03_EXECUTION_INPUT_UNAVAILABLE_NO_MODEL_EVIDENCE");
  }
  const frozen = await inspectFrozenPsc01({root, contracts, hashRows: false});
  const privateDirectory = resolvePrivateDirectory(
    root,
    contracts.development.privateOutputs.directory
  );
  const attempt = await createAttemptReceipt({
    root,
    privateDirectory,
    contracts,
    gitPreflight,
    metadata
  });
  const events = [];
  const record = async (event) => {
    const value = Object.freeze({
      sequence: events.length + 1,
      event,
      at: new Date().toISOString()
    });
    events.push(value);
    await fs.appendFile(attempt.eventLogPath, `${JSON.stringify(value)}\n`, "utf8");
  };
  try {
    const result = await runM2Psc03OrderedCampaign({
      record,
      phases: campaignPhases({
      root,
      contracts,
      frozen,
      privateDirectory: attempt.outputDirectory,
      attempt,
        gitPreflight,
        metadata
      })
    });
    process.stdout.write(`${JSON.stringify({
      status: result.publicResult.status,
      modelId: M2_PSC03_MODEL_ID,
      rawCandidateId: M2_PSC03_RAW_CANDIDATE_ID,
      firstCompleteRawPredictionFormed: true,
      repeated: false,
      primaryWape: result.publicResult.arms.P.primary.workTotal.wape,
      strictWape: result.publicResult.arms.P.strict.workTotal.wape
    })}\n`);
    return result.publicResult;
  } catch (error) {
    await writeFailureReceipt({attempt, events, error});
    throw error;
  }
}

export async function runM2Psc03OrderedCampaign({phases, record = async () => {}}) {
  const required = [
    "materialize",
    "joinOccurrence",
    "generateD0",
    "generateD1",
    "generateP",
    "correctnessGates",
    "sealPrimary",
    "loadComparators",
    "calculateMetrics",
    "bootstrap",
    "applyGates",
    "freezeDecision"
  ];
  const values = {};
  for (const name of required) {
    if (typeof phases?.[name] !== "function") {
      throw new Error(`m2_psc03_campaign_phase_missing:${name}`);
    }
    await record(`BEFORE_${name}`);
    values[name] = await phases[name](Object.freeze({...values}));
    await record(`AFTER_${name}`);
  }
  return values.freezeDecision;
}

function campaignPhases(context) {
  let materialized;
  let occurrence;
  let D0;
  let D1;
  let P;
  let pSeal;
  let comparators;
  let metrics;
  let bootstraps;
  let gates;
  return {
    materialize: async () => {
      materialized = await materializeFrozenRows(context);
      return materialized.audit;
    },
    joinOccurrence: async () => {
      occurrence = await loadFrozenOccurrence(context, materialized);
      return occurrence.audit;
    },
    generateD0: async () => {
      D0 = await generateAndWriteArm(context, materialized, occurrence, "D0");
      const audit = D0.audit;
      D0 = null;
      forceGarbageCollection();
      return audit;
    },
    generateD1: async () => {
      D1 = await generateAndWriteArm(context, materialized, occurrence, "D1");
      const audit = D1.audit;
      D1 = null;
      forceGarbageCollection();
      return audit;
    },
    generateP: async () => {
      P = await generateAndWriteArm(context, materialized, occurrence, "P");
      return P.audit;
    },
    correctnessGates: async () => assertCorrectnessBeforeSeal({
      context,
      materialized,
      occurrence,
      P
    }),
    sealPrimary: async () => {
      pSeal = await sealPrimaryRaw(context, P);
      return pSeal;
    },
    loadComparators: async () => {
      comparators = await loadComparatorsAfterSeal(context, materialized, pSeal);
      return comparators.audit;
    },
    calculateMetrics: async () => {
      metrics = await calculateAllMetrics({
        context,
        materialized,
        P,
        comparators
      });
      return metrics.public;
    },
    bootstrap: async () => {
      bootstraps = await calculateBootstraps({context, metrics});
      return bootstraps.public;
    },
    applyGates: async () => {
      gates = applyFrozenGates({context, metrics, bootstraps});
      return gates;
    },
    freezeDecision: async (values) => freezeResult({
      context,
      materialized,
      occurrence,
      P,
      pSeal,
      comparators,
      metrics,
      bootstraps,
      gates,
      campaignValues: values
    })
  };
}

async function materializeFrozenRows(context) {
  const {root, frozen, contracts} = context;
  const preparedDirectory = frozen.preparedDirectory;
  const files = frozen.receipt.preparedBundle.preparedFiles;
  const digests = frozen.receipt.preparedBundle.normalizedContentDigests;
  for (const role of [
    "primaryMonthlyCases",
    "auxiliaryMonthlyCases",
    "reversalScopeReconciliation",
    "reversalAllocationLedger"
  ]) {
    const file = safeBasename(files?.[role], `prepared_${role}`);
    const absolute = path.join(preparedDirectory, file);
    if (await sha256File(absolute) !== digests?.[role]) {
      throw new Error(`m2_psc03_prepared_digest_mismatch:${role}`);
    }
  }
  const [primaryText, strictText, reconciliationText, allocationText] =
    await Promise.all([
      fs.readFile(path.join(
        preparedDirectory,
        safeBasename(files.primaryMonthlyCases, "primary_monthly")
      ), "utf8"),
      fs.readFile(path.join(
        preparedDirectory,
        safeBasename(files.auxiliaryMonthlyCases, "strict_monthly")
      ), "utf8"),
      fs.readFile(path.join(
        preparedDirectory,
        safeBasename(files.reversalScopeReconciliation, "reconciliation")
      ), "utf8"),
      fs.readFile(path.join(
        preparedDirectory,
        safeBasename(files.reversalAllocationLedger, "allocation")
      ), "utf8")
    ]);
  const reconciliation = JSON.parse(reconciliationText);
  const allocation = parseNdjson(allocationText);
  const primaryRestated = applyM2DevelopmentModelableRestatementToPackedRows(
    parseNdjson(primaryText),
    reconciliation,
    allocation
  );
  const strictRestated = applyM2DevelopmentModelableRestatementToPackedRows(
    parseNdjson(strictText),
    reconciliation,
    allocation
  );
  const primaryRows = expandM2ChannelGenerativePackedRows(primaryRestated.rows);
  const strictRows = expandM2ChannelGenerativePackedRows(strictRestated.rows);
  const strictOrigins = new Set(contracts.development.selection.strictOrigins);
  const strictEvaluationRows = strictRows.filter(
    (row) => strictOrigins.has(row.origin)
  );
  const expectedPredictionRows = primaryRows.length + strictEvaluationRows.length;
  if (expectedPredictionRows !== contracts.development.frozenPsc01.monthlyRowCount) {
    throw new Error(
      `m2_psc03_materialized_population_count_invalid:${expectedPredictionRows}`
    );
  }
  const originWorkCash = originVisibleWorkCash([primaryRows, strictRows]);
  return Object.freeze({
    primaryRows,
    strictRows,
    strictEvaluationRows: Object.freeze(strictEvaluationRows),
    expectedRows: Object.freeze([...primaryRows, ...strictEvaluationRows]),
    originWorkCash,
    audit: Object.freeze({
      status: "PSC03_FROZEN_PSC01_ROWS_MATERIALIZED",
      primaryMonthlyRowCount: primaryRows.length,
      strictTrainingAndEvaluationMonthlyRowCount: strictRows.length,
      strictEvaluationMonthlyRowCount: strictEvaluationRows.length,
      expectedPredictionRowCount: expectedPredictionRows,
      actualDefinitionId:
        contracts.preregistration.immutableScientificScope.actualDefinitionId,
      restatementPrimary: primaryRestated.audit,
      restatementStrict: strictRestated.audit,
      psc02ComponentFieldsRead: false,
      psc02ExtraThreeGateUsed: false
    })
  });
}

async function loadFrozenOccurrence(context, materialized) {
  const builder = new M2Psc03OccurrenceProjectionBuilder();
  const familyCounts = {primary: 0, strict: 0};
  const scan = await scanNdjson({
    filePath: context.frozen.evaluationPath,
    onRow: (row) => {
      if (
        row?.schema
          !== "m2.current.publishing_scale_channel_evaluation_private_row.v0.2"
        || row?.candidateId !== "M2-CHAN-PSC01-RAW"
        || row?.actualDefinitionId
          !== context.contracts.preregistration.immutableScientificScope
            .actualDefinitionId
      ) {
        throw new Error("m2_psc03_frozen_occurrence_row_contract_invalid");
      }
      const family = row.evaluationFamily === "strict" ? "strict" : row.evaluationFamily;
      if (!Object.hasOwn(familyCounts, family)) {
        throw new Error("m2_psc03_frozen_occurrence_family_invalid");
      }
      familyCounts[family] += 1;
      builder.add({
        standardWorkId: row.standardWorkId,
        channelUid: row.channelUid,
        origin: row.origin,
        futureMonthIndex: row.futureMonthIndex,
        occurrenceProbability: row.occurrenceProbability
      });
    }
  });
  if (
    scan.rowCount !== context.contracts.development.frozenPsc01.monthlyRowCount
    || scan.sha256 !== context.frozen.manifest.sha256
  ) {
    throw new Error("m2_psc03_frozen_occurrence_digest_or_count_invalid");
  }
  const verified = builder.finalize(materialized.expectedRows);
  return Object.freeze({
    map: verified.map,
    audit: Object.freeze({
      status: "PSC03_FROZEN_OCCURRENCE_BIT_FOR_BIT_EXACT_COVERAGE",
      rowCount: verified.rowCount,
      expectedRowCount: verified.expectedRowCount,
      evaluationSha256: scan.sha256,
      exactCoverage: verified.exactCoverage,
      binary64AbsoluteTolerance: 0,
      binary64RelativeTolerance: 0,
      familyCounts: Object.freeze(familyCounts),
      psc01RawScoresRead: false,
      lg01ScoresRead: false
    })
  });
}

async function generateAndWriteArm(context, materialized, occurrence, arm) {
  const primary = crossFitM2Psc03Arm({
    rows: materialized.primaryRows,
    occurrence: occurrence.map,
    config: context.contracts.development,
    psc01Config: context.contracts.psc01Config,
    support: context.contracts.support,
    arm,
    evaluationFamily: "primary"
  });
  const strict = crossFitM2Psc03Arm({
    rows: materialized.strictRows,
    occurrence: occurrence.map,
    config: context.contracts.development,
    psc01Config: context.contracts.psc01Config,
    support: context.contracts.support,
    arm,
    evaluationFamily: "strict"
  });
  const outputName = {
    D0: context.contracts.development.privateOutputs.D0Raw,
    D1: context.contracts.development.privateOutputs.D1Raw,
    P: context.contracts.development.privateOutputs.PRaw
  }[arm];
  const artifact = await writeArmRaw({
    outputPath: path.join(context.privateDirectory, outputName),
    primaryRows: materialized.primaryRows,
    strictRows: materialized.strictEvaluationRows,
    primaryPredictions: primary.predictions,
    strictPredictions: strict.predictions,
    arm,
    finalize: arm !== "P"
  });
  if (artifact.rowCount !== context.contracts.development.frozenPsc01.monthlyRowCount) {
    throw new Error(`m2_psc03_${arm}_raw_population_count_invalid`);
  }
  return Object.freeze({
    primary,
    strict,
    artifact,
    audit: Object.freeze({
      status: arm === "P"
        ? "PSC03_PRIMARY_RAW_COMPLETE_PENDING_CORRECTNESS_AND_ATOMIC_SEAL"
        : "PSC03_DIAGNOSTIC_RAW_FROZEN",
      arm,
      role: context.contracts.development.arms[arm].role,
      rowCount: artifact.rowCount,
      sha256: artifact.sha256,
      primaryPredictionCount: primary.predictions.size,
      strictPredictionCount: strict.predictions.size,
      outerOutcomeUsedForSelection: false,
      mayReplaceCandidate: false,
      finalPathVisible: artifact.finalPathVisible
    })
  });
}

function assertCorrectnessBeforeSeal({context, materialized, occurrence, P}) {
  let rowCount = 0;
  for (const [rows, predictions] of [
    [materialized.primaryRows, P.primary.predictions],
    [materialized.strictEvaluationRows, P.strict.predictions]
  ]) {
    for (const row of rows) {
      const key = m2Psc03MonthlyKey(row);
      const prediction = predictions.get(key);
      if (
        prediction === undefined
        || !Number.isFinite(prediction.pointEstimate)
        || prediction.pointEstimate < 0
        || prediction.occurrenceApplicationCount !== 1
        || prediction.horizonAggregationCount !== 0
        || prediction.taxonomyFeatureUsed !== false
        || prediction.lg01PredictionDependency !== false
        || prediction.postHocCalibrationUsed !== false
        || m2Psc03Binary64Hex(prediction.occurrenceProbability)
          !== m2Psc03Binary64Hex(occurrence.map.get(key))
      ) {
        throw new Error("m2_psc03_primary_correctness_gate_failed");
      }
      rowCount += 1;
    }
  }
  if (rowCount !== context.contracts.development.frozenPsc01.monthlyRowCount) {
    throw new Error("m2_psc03_primary_correctness_population_failed");
  }
  const primaryWorkCases = countHorizonCases(materialized.primaryRows);
  const strictWorkCases = countHorizonCases(materialized.strictEvaluationRows);
  if (
    primaryWorkCases
      !== context.contracts.development.frozenPsc01.primaryWorkCaseCount
    || strictWorkCases
      !== context.contracts.development.frozenPsc01.strictWorkCaseCount
  ) {
    throw new Error("m2_psc03_horizon_case_population_failed");
  }
  return Object.freeze({
    status: "PSC03_PRIMARY_CORRECTNESS_GATES_PASSED_BEFORE_SEAL",
    finite: true,
    exactPopulation: true,
    occurrenceBinary64Parity: true,
    occurrenceAppliedOnce: true,
    parentOffsetPerLayerAppliedOnce: true,
    horizonAggregationPendingExactlyOnce: true,
    primaryWorkCaseCount: primaryWorkCases,
    strictWorkCaseCount: strictWorkCases,
    taxonomyUsed: false,
    lg01PredictionDependency: false,
    psc02ComponentFieldsUsed: false,
    psc02ExtraThreeGateUsed: false
  });
}

async function sealPrimaryRaw(context, P) {
  const finalPath = P.artifact.finalPath;
  await fs.rename(P.artifact.temporaryPath, finalPath);
  const manifestPath = path.join(
    context.privateDirectory,
    context.contracts.development.privateOutputs.PManifest
  );
  const manifest = {
    schema: "m2.current.psc03.primary_raw_manifest.private.v0.1",
    tracked: false,
    status: "FROZEN_FIRST_COMPLETE_RAW_PREDICTION",
    modelId: M2_PSC03_MODEL_ID,
    candidateId: M2_PSC03_RAW_CANDIDATE_ID,
    experimentId: M2_PSC03_EXPERIMENT_ID,
    preregistrationId: M2_PSC03_PREREGISTRATION_ID,
    evidenceClass: "DEVELOPMENT_REPLAY",
    implementationCommit: context.gitPreflight.head,
    rowCount: P.artifact.rowCount,
    sha256: P.artifact.sha256,
    populationKeySha256: P.artifact.populationKeySha256,
    occurrenceAuthoritySha256: context.metadata.frozenPsc01.evaluationSha256,
    occurrenceBinary64Parity: true,
    exactPsc01PopulationCoverage: true,
    rawCandidatePreserved: true,
    comparatorLoadedBeforeSeal: false,
    candidatePredictionRepeated: false,
    finalHoldoutOpened: false,
    productionModified: false
  };
  await fs.writeFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    {encoding: "utf8", flag: "wx"}
  );
  const sealPath = path.join(
    context.privateDirectory,
    `M2-publishing-scale-direct-cash-P-seal-private-v0.1-${context.gitPreflight.head.slice(0, 12)}.json`
  );
  await fs.writeFile(sealPath, `${JSON.stringify({
    schema: "m2.current.psc03.primary_raw_atomic_seal.private.v0.1",
    tracked: false,
    status: "PSC03_PRIMARY_RAW_ATOMIC_SEAL_COMMITTED",
    rowCount: manifest.rowCount,
    sha256: manifest.sha256,
    manifestSha256: digest(`${JSON.stringify(manifest, null, 2)}\n`),
    comparatorLoadedBeforeSeal: false,
    sealedAt: new Date().toISOString()
  }, null, 2)}\n`, {encoding: "utf8", flag: "wx"});
  return Object.freeze({
    status: "PSC03_PRIMARY_RAW_ATOMIC_SEAL_COMMITTED",
    rowCount: manifest.rowCount,
    sha256: manifest.sha256,
    populationKeySha256: manifest.populationKeySha256,
    manifestPath,
    sealPath,
    comparatorLoadedBeforeSeal: false
  });
}

async function loadComparatorsAfterSeal(context, materialized, pSeal) {
  if (
    pSeal?.status !== "PSC03_PRIMARY_RAW_ATOMIC_SEAL_COMMITTED"
    || await sha256File(path.join(
      context.privateDirectory,
      context.contracts.development.privateOutputs.PRaw
    )) !== pSeal.sha256
  ) {
    throw new Error("m2_psc03_comparator_load_before_valid_primary_seal");
  }
  const psc01 = {primary: new Map(), strict: new Map()};
  const populationDigest = createCommutativeKeyDigest();
  const scan = await scanNdjson({
    filePath: context.frozen.evaluationPath,
    onRow: (row) => {
      const family = row.evaluationFamily === "strict" ? "strict" : row.evaluationFamily;
      const target = psc01[family];
      if (!(target instanceof Map)) {
        throw new Error("m2_psc03_psc01_comparator_family_invalid");
      }
      const key = m2Psc03MonthlyKey(row);
      if (target.has(key)) {
        throw new Error("m2_psc03_psc01_comparator_duplicate");
      }
      target.set(key, Object.freeze({
        positivePoint: finite(row.positivePoint, "psc01_positive_point"),
        pointEstimate: finite(row.pointEstimate, "psc01_point_estimate"),
        occurrenceProbability: finite(
          row.occurrenceProbability,
          "psc01_occurrence_probability"
        ),
        conditionalPositiveAmount: finite(
          row.conditionalPositiveAmount,
          "psc01_conditional_positive_amount"
        ),
        usedGenerator: false
      }));
      populationDigest.add(key);
    }
  });
  if (
    scan.sha256 !== context.frozen.manifest.sha256
    || scan.rowCount !== context.contracts.development.frozenPsc01.monthlyRowCount
    || populationDigest.finalize() !== pSeal.populationKeySha256
    || psc01.primary.size !== materialized.primaryRows.length
    || psc01.strict.size !== materialized.strictEvaluationRows.length
  ) {
    throw new Error("m2_psc03_psc01_comparator_integrity_invalid");
  }
  const [lg01Text, lg01ManifestText] = await Promise.all([
    fs.readFile(context.frozen.lg01Path, "utf8"),
    fs.readFile(context.frozen.lg01ManifestPath, "utf8")
  ]);
  const lg01Manifest = JSON.parse(lg01ManifestText);
  if (digest(lg01Text) !== lg01Manifest.sha256) {
    throw new Error("m2_psc03_lg01_comparator_digest_invalid");
  }
  const lg01Rows = parseNdjson(lg01Text);
  return Object.freeze({
    psc01,
    lg01Rows,
    lg01Manifest,
    audit: Object.freeze({
      status: "PSC03_COMPARATORS_LOADED_ONLY_AFTER_PRIMARY_RAW_SEAL",
      primaryRawSealVerified: true,
      psc01RowCount: scan.rowCount,
      psc01DigestMatchesFrozenManifest: true,
      psc01PopulationDigestMatchesPrimary: true,
      lg01ManifestValid: true,
      lg01RowCount: lg01Rows.length,
      lg01PredictionUsedByFit: false,
      comparatorLoadedAfterPrimarySeal: true
    })
  });
}

async function calculateAllMetrics({context, materialized, P, comparators}) {
  const privacy = privacyContract(context);
  const D0Predictions = await readArmPredictions(path.join(
    context.privateDirectory,
    context.contracts.development.privateOutputs.D0Raw
  ), "D0");
  const D0Evaluation = scoreArm({
    materialized,
    predictions: D0Predictions,
    config: context.contracts.psc01Config,
    arm: "D0"
  });
  const D0Public = buildArmPublicMetrics({
    materialized,
    predictions: D0Predictions,
    evaluation: D0Evaluation,
    context,
    includeSegments: false
  });
  D0Predictions.primary.clear();
  D0Predictions.strict.clear();
  forceGarbageCollection();

  const D1Predictions = await readArmPredictions(path.join(
    context.privateDirectory,
    context.contracts.development.privateOutputs.D1Raw
  ), "D1");
  const D1Evaluation = scoreArm({
    materialized,
    predictions: D1Predictions,
    config: context.contracts.psc01Config,
    arm: "D1"
  });
  const D1Public = buildArmPublicMetrics({
    materialized,
    predictions: D1Predictions,
    evaluation: D1Evaluation,
    context,
    includeSegments: false
  });
  D1Predictions.primary.clear();
  D1Predictions.strict.clear();
  forceGarbageCollection();

  const PEvaluation = Object.freeze({
    primary: scoreM2Psc03OuterResult(P.primary, context.contracts.psc01Config),
    strict: scoreM2Psc03OuterResult(P.strict, context.contracts.psc01Config)
  });
  const PPredictions = Object.freeze({
    primary: P.primary.predictions,
    strict: P.strict.predictions
  });
  const PPublic = buildArmPublicMetrics({
    materialized,
    predictions: PPredictions,
    evaluation: PEvaluation,
    context,
    includeSegments: true
  });
  const psc01Evaluation = scoreArm({
    materialized,
    predictions: comparators.psc01,
    config: context.contracts.psc01Config,
    arm: "M2-CHAN-PSC01-RAW"
  });
  const lg01Evaluation = Object.freeze({
    primary: scoreM2ChannelGenerativeFrozenG0Comparator(
      materialized.primaryRows,
      comparators.lg01Rows.filter((row) => row.evaluationFamily === "primary"),
      context.contracts.psc01Config,
      {channelPairingPolicy: "same_case_intersection"}
    ),
    strict: scoreM2ChannelGenerativeFrozenG0Comparator(
      materialized.strictEvaluationRows,
      comparators.lg01Rows.filter(
        (row) => row.evaluationFamily === "strict_rolling"
      ),
      context.contracts.psc01Config,
      {channelPairingPolicy: "same_case_intersection"}
    )
  });
  const comparatorIntegrity = Object.freeze({
    psc01Primary: verifyM2Psc03SameCaseComparator({
      candidateRows: PEvaluation.primary.cases,
      baselineRows: psc01Evaluation.primary.cases
    }),
    psc01Strict: verifyM2Psc03SameCaseComparator({
      candidateRows: PEvaluation.strict.cases,
      baselineRows: psc01Evaluation.strict.cases
    }),
    lg01Primary: verifyM2Psc03SameCaseComparator({
      candidateRows: PEvaluation.primary.cases,
      baselineRows: lg01Evaluation.primary.cases
    }),
    lg01Strict: verifyM2Psc03SameCaseComparator({
      candidateRows: PEvaluation.strict.cases,
      baselineRows: lg01Evaluation.strict.cases
    }),
    sameTarget: true,
    sameActualDefinition: true,
    actualUsedForAllScores:
      "PSC01_CURRENT_DEVELOPMENT_MODELABLE_RESTATEMENT_ACTUAL"
  });
  const comparatorPublic = Object.freeze({
    psc01: Object.freeze({
      primary: summarizeExistingEvaluation(psc01Evaluation.primary, privacy),
      strict: summarizeExistingEvaluation(psc01Evaluation.strict, privacy)
    }),
    lg01: Object.freeze({
      primary: summarizeExistingEvaluation(lg01Evaluation.primary, privacy),
      strict: summarizeExistingEvaluation(lg01Evaluation.strict, privacy)
    }),
    integrity: comparatorIntegrity
  });
  const composition = normalizedM2Psc03ChannelCompositionWape({
    candidateChannelRows: flattenChannels(PEvaluation.primary.cases),
    baselineChannelRows: flattenChannels(psc01Evaluation.primary.cases)
  });
  const primaryScore = scoreM2Psc03CaseRows(PEvaluation.primary.cases);
  const strictScore = scoreM2Psc03CaseRows(PEvaluation.strict.cases);
  const psc01PrimaryScore = scoreM2Psc03CaseRows(psc01Evaluation.primary.cases);
  const psc01StrictScore = scoreM2Psc03CaseRows(psc01Evaluation.strict.cases);
  const strictByHorizon = Object.fromEntries(
    [...new Set(PEvaluation.strict.cases.map((row) => row.horizonMonths))]
      .sort((left, right) => left - right)
      .map((horizon) => [String(horizon), scoreM2Psc03CaseRows(
        PEvaluation.strict.cases.filter((row) => row.horizonMonths === horizon)
      )])
  );
  const scaleRecovery = evaluateM2Psc03ScaleRecovery({
    primary: primaryScore,
    strict: strictScore,
    psc01Primary: psc01PrimaryScore,
    psc01Strict: psc01StrictScore,
    strictByHorizon,
    composition,
    contract: context.contracts.development.evaluation.scaleRecovery
  });
  const populations = buildPopulationMetrics({
    context,
    materialized,
    candidate: PEvaluation,
    lg01: lg01Evaluation
  });
  const privateValue = Object.freeze({
    candidate: PEvaluation,
    psc01: psc01Evaluation,
    lg01: lg01Evaluation,
    populations
  });
  return Object.freeze({
    private: privateValue,
    public: Object.freeze({
      D0: D0Public,
      D1: D1Public,
      P: PPublic,
      comparators: comparatorPublic,
      relativeFva: Object.freeze({
        versusPsc01: scaleRecovery.relativeFva,
        versusLg01: Object.freeze({
          primary: relativeFva(primaryScore, scoreM2Psc03CaseRows(
            lg01Evaluation.primary.cases
          )),
          strict: relativeFva(strictScore, scoreM2Psc03CaseRows(
            lg01Evaluation.strict.cases
          ))
        })
      }),
      scaleRecovery,
      normalizedChannelComposition: composition,
      populations: populations.public
    })
  });
}

function scoreArm({materialized, predictions, config, arm}) {
  return Object.freeze({
    primary: scoreM2Psc03OuterResult({
      arm,
      rows: materialized.primaryRows,
      predictions: predictions.primary
    }, config),
    strict: scoreM2Psc03OuterResult({
      arm,
      rows: materialized.strictEvaluationRows,
      predictions: predictions.strict
    }, config)
  });
}

function buildArmPublicMetrics({
  materialized,
  predictions,
  evaluation,
  context,
  includeSegments
}) {
  const primary = summarizeEvaluationFamily({
    rows: materialized.primaryRows,
    predictions: predictions.primary,
    evaluation: evaluation.primary,
    context,
    includeSegments
  });
  const strict = summarizeEvaluationFamily({
    rows: materialized.strictEvaluationRows,
    predictions: predictions.strict,
    evaluation: evaluation.strict,
    context,
    includeSegments
  });
  return Object.freeze({primary, strict});
}

function summarizeEvaluationFamily({
  rows,
  predictions,
  evaluation,
  context,
  includeSegments
}) {
  const privacy = privacyContract(context);
  const cases = evaluation.cases;
  const channels = flattenChannels(cases);
  const conditionalRows = [];
  for (const row of rows) {
    if (!row.observedAtOrigin || row.actualPositive <= 0) continue;
    const prediction = predictions.get(m2Psc03MonthlyKey(row));
    conditionalRows.push({
      standardWorkId: row.standardWorkId,
      actualPositive: row.actualPositive,
      conditionalPositiveAmount: prediction.conditionalPositiveAmount
    });
  }
  const result = {
    workTotal: scoreM2Psc03CaseRows(cases),
    workChannel: scoreM2Psc03CaseRows(channels),
    occurrence: evaluation.occurrence,
    conditionalAmount: scoreM2Psc03ConditionalRows(conditionalRows),
    byHorizon: groupM2Psc03Scores(cases, "horizonMonths", privacy),
    byOrigin: groupM2Psc03Scores(cases, "origin", privacy),
    topActualCashWorks: Object.freeze(Object.fromEntries(
      Object.entries(evaluation.topRevenue).map(([fraction, value]) => [
        fraction,
        Object.freeze({
          status: "POST_HOC_FUTURE_ACTUAL_ATTRIBUTION_ONLY",
          aggregate: protectM2Psc03Aggregate(Object.freeze({
            ...value,
            workCount: value.caseCount
          }), privacy)
        })
      ])
    ))
  };
  if (includeSegments) {
    result.byMechanism = groupM2Psc03Scores(
      channels.filter((row) => row.observedAtOrigin),
      "mechanism",
      privacy
    );
    const platformByUid = new Map(
      context.contracts.psc01Config.nodes.namedPlatforms.map(
        (row) => [row.channelUid, row.platformId]
      )
    );
    result.byNamedPlatform = groupM2Psc03Scores(
      channels.filter((row) => platformByUid.has(row.channelUid)),
      (row) => platformByUid.get(row.channelUid),
      privacy
    );
    result.bySupportTier = groupM2Psc03Scores(
      buildSupportAttributionCases(rows, predictions),
      "supportTier",
      privacy
    );
  }
  return Object.freeze(result);
}

function buildPopulationMetrics({context, materialized, candidate, lg01}) {
  const core80 = selectM2Psc03OriginVisiblePopulation({
    originWorkCash: materialized.originWorkCash,
    fraction: 0.8
  });
  const core90 = selectM2Psc03OriginVisiblePopulation({
    originWorkCash: materialized.originWorkCash,
    fraction: 0.9
  });
  const filterPopulation = (cases, population) => cases.filter((row) => (
    population.selected.has(`${row.origin}\u001f${row.standardWorkId}`)
  ));
  const candidateAll = combineM2Psc03EvaluationFamilies(
    candidate.primary.cases,
    candidate.strict.cases
  );
  const lg01All = combineM2Psc03EvaluationFamilies(
    lg01.primary.cases,
    lg01.strict.cases
  );
  const candidateCore80 = filterPopulation(candidateAll, core80);
  const candidateCore90 = filterPopulation(candidateAll, core90);
  const lg01Core80 = filterPopulation(lg01All, core80);
  const lg01Core90 = filterPopulation(lg01All, core90);
  if (
    candidateCore80.length !== lg01Core80.length
    || candidateCore90.length !== lg01Core90.length
  ) {
    throw new Error("m2_psc03_business_population_comparator_mismatch");
  }
  const candidateBands = assignM2Psc03CashBands({
    cases: candidateCore80.filter((row) => row.horizonMonths === 36),
    originWorkCash: materialized.originWorkCash,
    core80
  });
  const lg01Bands = assignM2Psc03CashBands({
    cases: lg01Core80.filter((row) => row.horizonMonths === 36),
    originWorkCash: materialized.originWorkCash,
    core80
  });
  const scoreByBand = (rows) => Object.freeze(Object.fromEntries(
    ["H50", "M30", "L20"].map((band) => {
      const selected = rows.filter((row) => row.cashBandId === band);
      return [band, selected.length === 0 ? null : scoreM2Psc03CaseRows(selected)];
    })
  ));
  const byHorizon = (rows) => Object.freeze(Object.fromEntries(
    [...new Set(rows.map((row) => row.horizonMonths))]
      .sort((left, right) => left - right)
      .map((horizon) => [String(horizon), scoreM2Psc03CaseRows(
        rows.filter((row) => row.horizonMonths === horizon)
      )])
  ));
  const privacy = privacyContract(context);
  const protectScore = (score) => protectM2Psc03Aggregate(score, privacy);
  const publicByHorizon = (rows) => Object.freeze(Object.fromEntries(
    Object.entries(byHorizon(rows)).map(([horizon, score]) => [
      horizon,
      protectScore(score)
    ])
  ));
  const publicByBand = (rows) => Object.freeze(Object.fromEntries(
    Object.entries(scoreByBand(rows)).map(([band, score]) => [
      band,
      protectScore(score)
    ])
  ));
  return Object.freeze({
    private: Object.freeze({
      core80,
      core90,
      candidateCore80: Object.freeze(candidateCore80),
      candidateCore90: Object.freeze(candidateCore90),
      lg01Core80: Object.freeze(lg01Core80),
      lg01Core90: Object.freeze(lg01Core90),
      candidateBands,
      lg01Bands
    }),
    public: Object.freeze({
      CORE80: Object.freeze({
        role: "HARD_GATE",
        candidate: Object.freeze({
          aggregate: protectScore(scoreM2Psc03CaseRows(candidateCore80)),
          byHorizon: publicByHorizon(candidateCore80),
          cashBandsH36: publicByBand(candidateBands)
        }),
        lg01: Object.freeze({
          aggregate: protectScore(scoreM2Psc03CaseRows(lg01Core80)),
          byHorizon: publicByHorizon(lg01Core80),
          cashBandsH36: publicByBand(lg01Bands)
        })
      }),
      CORE90: Object.freeze({
        role: "DISCLOSED_SENSITIVITY_NOT_A_VETO",
        candidate: Object.freeze({
          aggregate: protectScore(scoreM2Psc03CaseRows(candidateCore90)),
          byHorizon: publicByHorizon(candidateCore90)
        }),
        lg01: Object.freeze({
          aggregate: protectScore(scoreM2Psc03CaseRows(lg01Core90)),
          byHorizon: publicByHorizon(lg01Core90)
        })
      })
    })
  });
}

async function calculateBootstraps({context, metrics}) {
  const pairs = {
    psc01Primary: [
      metrics.private.candidate.primary.cases,
      metrics.private.psc01.primary.cases
    ],
    psc01Strict: [
      metrics.private.candidate.strict.cases,
      metrics.private.psc01.strict.cases
    ],
    lg01Core80AllRequiredHorizons: [
      metrics.private.populations.private.candidateCore80,
      metrics.private.populations.private.lg01Core80
    ]
  };
  const privateResults = Object.fromEntries(Object.entries(pairs).map(
    ([key, [candidateRows, baselineRows]]) => [key,
      pairedM2Psc03WholeWorkBootstrap({
        candidateRows,
        baselineRows,
        seed: context.contracts.development.evaluation.bootstrapSeed,
        iterations: context.contracts.development.evaluation.bootstrapIterations,
        includeDraws: true
      })]
  ));
  const publicResults = Object.freeze(Object.fromEntries(
    Object.entries(privateResults).map(([key, value]) => {
      const {draws, ...summary} = value;
      return [key, Object.freeze(summary)];
    })
  ));
  const outputPath = path.join(
    context.privateDirectory,
    context.contracts.development.privateOutputs.bootstrap
  );
  const lines = Object.entries(privateResults).flatMap(([comparisonId, value]) => {
    const {draws, ...summary} = value;
    return [
      {
        schema: "m2.current.psc03.bootstrap_summary.private.v0.1",
        tracked: false,
        comparisonId,
        ...summary
      },
      ...draws.map((draw, drawIndex) => ({
        schema: "m2.current.psc03.bootstrap_draw.private.v0.1",
        tracked: false,
        comparisonId,
        drawIndex,
        actualCashNormalizedImprovement: draw
      }))
    ];
  });
  await writeNdjsonAtomic(outputPath, lines);
  return Object.freeze({
    private: Object.freeze(privateResults),
    public: publicResults
  });
}

function applyFrozenGates({context, metrics, bootstraps}) {
  const contract = context.contracts.business;
  const core = metrics.private.populations.private;
  const candidateScore = scoreM2Psc03CaseRows(core.candidateCore80);
  const baselineScore = scoreM2Psc03CaseRows(core.lg01Core80);
  const candidateBands = scoreBands(core.candidateBands);
  const baselineBands = scoreBands(core.lg01Bands);
  const candidateByHorizon = scoresByHorizon(core.candidateCore80);
  const biasCaps = Object.fromEntries(contract.businessUsability.horizons.map(
    (row) => [String(row.horizonMonths), (
      candidateByHorizon[String(row.horizonMonths)] !== undefined
      && Math.abs(candidateByHorizon[String(row.horizonMonths)].signedBias)
        <= row.maximumAbsoluteSignedBias
    )]
  ));
  const usability = Object.freeze(Object.fromEntries(
    contract.businessUsability.horizons.map((row) => {
      const observed = candidateByHorizon[String(row.horizonMonths)];
      return [String(row.horizonMonths), Object.freeze({
        status: row.status,
        wapePass: observed !== undefined && observed.wape <= row.maximumWape,
        signedBiasPass: observed !== undefined
          && Math.abs(observed.signedBias) <= row.maximumAbsoluteSignedBias,
        observed: observed ?? null
      })];
    })
  ));
  const originReductions = perOriginReductions(
    core.candidateCore80,
    core.lg01Core80
  );
  const originReductionValues = originReductions.map((row) => row.reduction);
  const aggregatedReduction = baselineScore.absoluteError
    - candidateScore.absoluteError;
  const nonOverlapping = nonOverlappingTimeEvidence(core.candidateCore80);
  const superiority = Object.freeze({
    combinationRule: "AND",
    requirements: Object.freeze({
      pairedAbsoluteErrorReductionOverPairedActualAtLeastOnePercent:
        (baselineScore.absoluteError - candidateScore.absoluteError)
          / baselineScore.actualDenominator
        >= contract.candidateSuperiority.materiality
          .minimumPairedAbsoluteErrorReductionOverPairedActual,
      wholeWorkBootstrapLowerBoundAboveZero:
        bootstraps.public.lg01Core80AllRequiredHorizons.lower95 > 0,
      absoluteSignedBiasWithinHorizonCap:
        Object.values(biasCaps).every(Boolean),
      core80H50AbsoluteErrorNotWorse:
        candidateBands.H50.absoluteError <= baselineBands.H50.absoluteError,
      maximumWorkErrorShareNotWorse:
        candidateScore.errorConcentration.maximumWorkShare
          <= baselineScore.errorConcentration.maximumWorkShare,
      top10WorkErrorShareNotWorse:
        candidateScore.errorConcentration.top10WorkShare
          <= baselineScore.errorConcentration.top10WorkShare,
      l20ImprovementCannotMaskH50Loss:
        candidateBands.H50.absoluteError <= baselineBands.H50.absoluteError,
      perOriginAbsoluteErrorReductionMedianAboveZero:
        median(originReductions.map((row) => row.reduction)) > 0,
      nonOverlappingTimeEvidenceRequirementsMet: nonOverlapping.passed
    }),
    biasCaps: Object.freeze(biasCaps),
    disclosures: Object.freeze({
      pairedActual: candidateScore.actualDenominator,
      candidateAbsoluteError: candidateScore.absoluteError,
      baselineAbsoluteError: baselineScore.absoluteError,
      aggregatedForecastDecisionErrorReduction: aggregatedReduction,
      actualCashNormalizedReduction: candidateScore.actualDenominator === 0
        ? null
        : aggregatedReduction / candidateScore.actualDenominator,
      relativeFva: baselineScore.wape === 0
        ? null
        : (baselineScore.wape - candidateScore.wape) / baselineScore.wape,
      perOriginAbsoluteErrorReduction: Object.freeze({
        p25: quantile(originReductionValues, 0.25),
        p50: quantile(originReductionValues, 0.5),
        p75: quantile(originReductionValues, 0.75)
      })
    }),
    perOriginReductionMedian: median(originReductionValues),
    nonOverlappingTimeEvidence: nonOverlapping
  });
  const allSuperiority = Object.values(superiority.requirements).every(Boolean);
  const allUsability = Object.values(usability).every(
    (row) => row.wapePass && row.signedBiasPass
  );
  const materialHarm = (
    !superiority.requirements.absoluteSignedBiasWithinHorizonCap
    || !superiority.requirements.core80H50AbsoluteErrorNotWorse
    || !superiority.requirements.maximumWorkErrorShareNotWorse
    || !superiority.requirements.top10WorkErrorShareNotWorse
    || !superiority.requirements.l20ImprovementCannotMaskH50Loss
  );
  const correctness = true;
  const scalePassed = metrics.public.scaleRecovery.allPassed;
  const status = !correctness || !scalePassed || materialHarm
    ? "PSC03_DEVELOPMENT_NOT_SUPPORTED"
    : allUsability && allSuperiority
      ? "PSC03_FIRST_INDEPENDENT_EVALUATION_REQUEST_SUPPORTED_NOT_AUTHORIZED"
      : "PSC03_DEVELOPMENT_PROMISING_INDEPENDENT_NOT_READY";
  return Object.freeze({
    status,
    correctnessPassed: correctness,
    scaleHypothesis: Object.freeze({
      passed: scalePassed,
      interpretation: scalePassed
        ? "DIRECT_CASH_SCALE_HYPOTHESIS_SUPPORTED"
        : "DIRECT_CASH_SCALE_HYPOTHESIS_NOT_SUPPORTED"
    }),
    candidateCompetitiveness: Object.freeze({
      businessUsability: usability,
      candidateSuperiority: superiority,
      allBusinessUsabilityPassed: allUsability,
      allNineAndRequirementsPassed: allSuperiority,
      materialNonTimeGuardrailHarm: materialHarm,
      interpretation: scalePassed && !allSuperiority
        ? "DIRECT_CASH_SCALE_HYPOTHESIS_SUPPORTED_BUT_CANDIDATE_NOT_COMPETITIVE_WITH_LG01"
        : allSuperiority
          ? "CANDIDATE_SUPERIORITY_CONTRACT_PASSED"
          : "CANDIDATE_SUPERIORITY_CONTRACT_NOT_PASSED"
    })
  });
}

async function freezeResult({
  context,
  materialized,
  occurrence,
  P,
  pSeal,
  comparators,
  metrics,
  bootstraps,
  gates,
  campaignValues
}) {
  const publicResult = Object.freeze({
    schema: "m2.current.psc03.development_evaluation_public.v0.1",
    asOf: new Date().toISOString().slice(0, 10),
    status: gates.status,
    modelId: M2_PSC03_MODEL_ID,
    rawCandidateId: M2_PSC03_RAW_CANDIDATE_ID,
    experimentId: M2_PSC03_EXPERIMENT_ID,
    preregistrationId: M2_PSC03_PREREGISTRATION_ID,
    evidenceClass: "DEVELOPMENT_REPLAY",
    preExecution: Object.freeze({
      exactHead: context.gitPreflight.head,
      branch: context.gitPreflight.branch,
      pullRequestNumber: context.gitPreflight.prNumber,
      linuxCheck: context.gitPreflight.linuxCheck,
      windowsCheck: context.gitPreflight.windowsCheck,
      codeSha256: digest(
        context.contracts.texts.implementationSource
          + context.contracts.texts.evaluationSource
          + context.contracts.texts.runnerSource
      ),
      configSha256: digest(context.contracts.texts.development),
      preregistrationSha256: digest(context.contracts.texts.preregistration),
      schemaSha256: digest(context.contracts.texts.schema)
    }),
    execution: Object.freeze({
      attemptCount: context.attempt.receipt.attemptNumber,
      resultBeforeEngineeringAttemptCount: context.attempt.receipt.attemptNumber,
      resultBeforeEngineeringRepairCount:
        context.attempt.receipt.attemptNumber - 1,
      firstCompletePrimaryRawResultFormed: true,
      primaryRawRepeated: false,
      primaryRawRowCount: pSeal.rowCount,
      occurrenceAuthoritySha256: occurrence.audit.evaluationSha256,
      occurrenceBitForBitParity: true,
      exactPsc01PopulationCoverage: true,
      psc02ComponentFieldsUsed: false,
      psc02ExtraThreeGateUsed: false,
      comparatorLoadedAfterPrimarySeal:
        comparators.audit.comparatorLoadedAfterPrimarySeal
    }),
    correctnessGates: campaignValues.correctnessGates,
    arms: Object.freeze({
      D0: Object.freeze({
        armId: `${M2_PSC03_EXPERIMENT_ID}/D0`,
        stableArmCode: "ARITHMETIC_HIERARCHY_ONLY",
        role: "DIAGNOSTIC_NOT_CANDIDATE",
        ...metrics.public.D0
      }),
      D1: Object.freeze({
        armId: `${M2_PSC03_EXPERIMENT_ID}/D1`,
        stableArmCode: "DIRECT_QUASI_GAMMA_HIERARCHY",
        role: "VARIANCE_FAMILY_DIAGNOSTIC_NOT_CANDIDATE",
        ...metrics.public.D1
      }),
      P: Object.freeze({
        armId: `${M2_PSC03_EXPERIMENT_ID}/P`,
        stableArmCode: "DIRECT_QUASI_POISSON_HIERARCHY",
        role: "SOLE_RAW_CANDIDATE",
        candidateId: M2_PSC03_RAW_CANDIDATE_ID,
        ...metrics.public.P
      })
    }),
    comparisons: Object.freeze({
      ...metrics.public.comparators,
      relativeFva: metrics.public.relativeFva,
      normalizedChannelComposition:
        metrics.public.normalizedChannelComposition,
      bootstrap: bootstraps.public
    }),
    populations: metrics.public.populations,
    scaleHypothesis: gates.scaleHypothesis,
    candidateCompetitiveness: gates.candidateCompetitiveness,
    boundaries: Object.freeze({
      activeCandidate: null,
      approvedForAutomation: null,
      productionReady: false,
      finalHoldoutOpened: false,
      independentEvaluationOpened: false,
      laterOriginOpened: false,
      taxonomyUsed: false,
      lg01PredictionDependency: false,
      productionModified: false,
      automationAuthorized: false,
      releaseAuthorized: false,
      databaseUsed: false,
      apiModified: false,
      providerUsed: false,
      financialUseAuthorized: false
    })
  });
  await publishFrozenResult({context, publicResult});
  const decisionReceipt = {
    schema: "m2.current.psc03.development_decision_receipt.private.v0.1",
    tracked: false,
    status: publicResult.status,
    evidenceClass: "DEVELOPMENT_REPLAY",
    modelId: M2_PSC03_MODEL_ID,
    candidateId: M2_PSC03_RAW_CANDIDATE_ID,
    implementationCommit: context.gitPreflight.head,
    primaryRawSha256: pSeal.sha256,
    primaryRawRowCount: pSeal.rowCount,
    firstCompletePrimaryRawResultFormed: true,
    primaryRawRepeated: false,
    finalHoldoutOpened: false,
    independentEvaluationOpened: false,
    productionModified: false,
    completedAt: new Date().toISOString()
  };
  await fs.writeFile(path.join(
    context.privateDirectory,
    context.contracts.development.privateOutputs.decisionReceipt
  ), `${JSON.stringify(decisionReceipt, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx"
  });
  return Object.freeze({publicResult, decisionReceipt, P, materialized});
}

async function inspectFrozenPsc01({root, contracts, hashRows}) {
  const directory = resolvePrivateDirectory(
    root,
    contracts.development.frozenPsc01.evaluationDirectory
  );
  let names = [];
  try {
    names = await fs.readdir(directory);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const receipts = [];
  for (const name of names.filter((value) => (
    value.startsWith(`${PSC01_RECEIPT_PREFIX}-`) && value.endsWith(".json")
  ))) {
    const value = JSON.parse(await fs.readFile(path.join(directory, name), "utf8"));
    if (value.status === "COMPLETED") receipts.push({name, value});
  }
  if (receipts.length !== 1) {
    return Object.freeze({
      ready: false,
      completedReceiptCount: receipts.length,
      manifestValid: false,
      monthlyRowCount: null,
      evaluationSha256: null,
      digestMatchesManifest: false,
      preparedBundleReady: false,
      lg01ComparatorPresent: false,
      lg01ManifestPresent: false
    });
  }
  const receipt = receipts[0].value;
  const evaluationName = safeBasename(
    receipt.outputFiles?.evaluationRows,
    "psc01_evaluation_rows"
  );
  const manifestName = safeBasename(
    receipt.outputFiles?.evaluationManifest,
    "psc01_evaluation_manifest"
  );
  const evaluationPath = path.join(directory, evaluationName);
  const manifestPath = path.join(directory, manifestName);
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const preparedDirectory = resolvePrivateDirectory(
    root,
    receipt.preparedBundle?.relativeDirectory
  );
  const preparedFiles = receipt.preparedBundle?.preparedFiles ?? {};
  const requiredPrepared = [
    "primaryMonthlyCases",
    "auxiliaryMonthlyCases",
    "reversalScopeReconciliation",
    "reversalAllocationLedger"
  ];
  const preparedBundleReady = (await Promise.all(requiredPrepared.map(
    async (role) => fileExists(path.join(
      preparedDirectory,
      safeBasename(preparedFiles[role], `prepared_${role}`)
    ))
  ))).every(Boolean);
  const lg01Path = path.join(
    preparedDirectory,
    safeBasename(preparedFiles.learnedGlobalEvaluation, "lg01_rows")
  );
  const lg01ManifestPath = path.join(
    preparedDirectory,
    safeBasename(
      preparedFiles.learnedGlobalEvaluationManifest,
      "lg01_manifest"
    )
  );
  let rowScan = null;
  if (hashRows) {
    rowScan = await scanNdjson({filePath: evaluationPath, onRow: null});
  }
  const monthlyRowCount = rowScan?.rowCount ?? Number(manifest.rowCount);
  const evaluationSha256 = rowScan?.sha256 ?? manifest.sha256;
  const manifestValid = (
    manifest.schema
      === "m2.current.publishing_scale_channel_evaluation_private_manifest.v0.2"
    && manifest.candidateId === "M2-CHAN-PSC01-RAW"
    && Number(manifest.rowCount)
      === contracts.development.frozenPsc01.monthlyRowCount
    && manifest.rawCandidatePreserved === true
    && manifest.fallbackOverwroteRaw === false
  );
  return Object.freeze({
    ready: manifestValid
      && preparedBundleReady
      && await fileExists(evaluationPath)
      && await fileExists(lg01Path)
      && await fileExists(lg01ManifestPath)
      && monthlyRowCount === contracts.development.frozenPsc01.monthlyRowCount
      && evaluationSha256 === manifest.sha256,
    completedReceiptCount: 1,
    receipt,
    receiptFile: receipts[0].name,
    directory,
    evaluationPath,
    manifestPath,
    manifest,
    manifestValid,
    monthlyRowCount,
    evaluationSha256,
    digestMatchesManifest: evaluationSha256 === manifest.sha256,
    preparedDirectory,
    preparedBundleReady,
    lg01Path,
    lg01ManifestPath,
    lg01ComparatorPresent: await fileExists(lg01Path),
    lg01ManifestPresent: await fileExists(lg01ManifestPath)
  });
}

async function createAttemptReceipt({
  root,
  privateDirectory,
  contracts,
  gitPreflight,
  metadata
}) {
  await fs.mkdir(privateDirectory, {recursive: true});
  const prefix = contracts.development.privateOutputs.attemptReceiptPrefix;
  const existing = (await fs.readdir(privateDirectory)).filter((name) => (
    name.startsWith(`${prefix}-`)
    && name.endsWith(".json")
    && !name.endsWith("-failure.json")
  ));
  const priorAttempts = [];
  for (const name of existing) {
    const receipt = JSON.parse(await fs.readFile(
      path.join(privateDirectory, name),
      "utf8"
    ));
    const failurePath = path.join(
      privateDirectory,
      name.replace(/\.json$/u, "-failure.json")
    );
    if (!await fileExists(failurePath)) {
      throw new Error("m2_psc03_development_replay_attempt_already_exists");
    }
    const failure = JSON.parse(await fs.readFile(failurePath, "utf8"));
    if (
      failure.completePrimaryRawResultFormed !== false
      || receipt.completePrimaryRawResultFormed !== false
    ) {
      throw new Error("m2_psc03_complete_raw_result_already_formed");
    }
    if (receipt.implementationCommit === gitPreflight.head) {
      throw new Error("m2_psc03_engineering_retry_requires_new_exact_head");
    }
    priorAttempts.push({receipt, failure});
  }
  const attemptNumber = priorAttempts.reduce(
    (maximum, row) => Math.max(maximum, Number(row.receipt.attemptNumber) || 0),
    0
  ) + 1;
  const suffix = `${gitPreflight.head.slice(0, 12)}-attempt-${attemptNumber}`;
  const receiptPath = path.join(privateDirectory, `${prefix}-${suffix}.json`);
  const eventLogPath = path.join(
    privateDirectory,
    `M2-publishing-scale-direct-cash-event-log-private-v0.1-${suffix}.ndjson`
  );
  const outputDirectory = path.join(
    privateDirectory,
    `attempt-${attemptNumber}-${gitPreflight.head.slice(0, 12)}`
  );
  await fs.mkdir(outputDirectory, {recursive: false});
  const receipt = {
    schema: "m2.current.psc03.development_replay_attempt.private.v0.1",
    tracked: false,
    status: "PREPARED_BEFORE_PRIVATE_MODEL_EXECUTION",
    evidenceClass: "DEVELOPMENT_REPLAY",
    attemptNumber,
    priorPreResultEngineeringAttemptCount: priorAttempts.length,
    modelId: M2_PSC03_MODEL_ID,
    rawCandidateId: M2_PSC03_RAW_CANDIDATE_ID,
    experimentId: M2_PSC03_EXPERIMENT_ID,
    preregistrationId: M2_PSC03_PREREGISTRATION_ID,
    implementationCommit: gitPreflight.head,
    implementationSha256: digest(
      contracts.texts.implementationSource
        + contracts.texts.evaluationSource
        + contracts.texts.runnerSource
    ),
    developmentConfigSha256: digest(contracts.texts.development),
    preregistrationSha256: digest(contracts.texts.preregistration),
    schemaSha256: digest(contracts.texts.schema),
    frozenPsc01OccurrenceAuthoritySha256:
      metadata.frozenPsc01.evaluationSha256,
    gitPreflight,
    privateMetadataPrecheck: metadata,
    candidateFitStarted: false,
    completePrimaryRawResultFormed: false,
    comparatorScoresRead: false,
    candidateMetricsComputed: false,
    bootstrapExecuted: false,
    finalHoldoutOpened: false,
    independentEvaluationOpened: false,
    productionModified: false,
    startedAt: new Date().toISOString()
  };
  await fs.writeFile(
    receiptPath,
    `${JSON.stringify(receipt, null, 2)}\n`,
    {encoding: "utf8", flag: "wx"}
  );
  await fs.writeFile(eventLogPath, "", {encoding: "utf8", flag: "wx"});
  return Object.freeze({
    receiptPath,
    eventLogPath,
    outputDirectory,
    receipt,
    suffix
  });
}

async function writeFailureReceipt({attempt, events, error}) {
  const failurePath = attempt.receiptPath.replace(/\.json$/u, "-failure.json");
  await fs.writeFile(failurePath, `${JSON.stringify({
    schema: "m2.current.psc03.development_replay_failure.private.v0.1",
    tracked: false,
    status: "PSC03_DEVELOPMENT_REPLAY_FAILED_CLOSED",
    attemptNumber: attempt.receipt.attemptNumber,
    failureCode: String(error?.code ?? error?.message ?? error),
    lastEvent: events.at(-1)?.event ?? null,
    completePrimaryRawResultFormed: events.some(
      (row) => row.event === "AFTER_sealPrimary"
    ),
    partialEvaluationPublished: false,
    registryEvaluationWritten: false,
    finalHoldoutOpened: false,
    productionModified: false,
    failedAt: new Date().toISOString()
  }, null, 2)}\n`, {encoding: "utf8", flag: "wx"});
}

async function writeArmRaw({
  outputPath,
  primaryRows,
  strictRows,
  primaryPredictions,
  strictPredictions,
  arm,
  finalize
}) {
  if (await fileExists(outputPath)) {
    throw new Error(`m2_psc03_${arm}_raw_collision`);
  }
  const temporaryPath = `${outputPath}.tmp-${process.pid}`;
  const handle = await fs.open(temporaryPath, "wx");
  const hash = createHash("sha256");
  const population = createCommutativeKeyDigest();
  let rowCount = 0;
  let buffer = "";
  try {
    for (const [family, rows, predictions] of [
      ["primary", primaryRows, primaryPredictions],
      ["strict", strictRows, strictPredictions]
    ]) {
      for (const row of rows) {
        const key = m2Psc03MonthlyKey(row);
        const prediction = predictions.get(key);
        if (prediction === undefined) {
          throw new Error(`m2_psc03_${arm}_raw_prediction_missing`);
        }
        const value = {
          schema: "m2.current.psc03.monthly_raw_prediction.private.v0.1",
          tracked: false,
          evidenceClass: "DEVELOPMENT_REPLAY",
          modelId: M2_PSC03_MODEL_ID,
          candidateId: arm === "P" ? M2_PSC03_RAW_CANDIDATE_ID : null,
          experimentArmId: `${M2_PSC03_EXPERIMENT_ID}/${arm}`,
          arm,
          evaluationFamily: family,
          actualDefinitionId:
            "M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01",
          standardWorkId: row.standardWorkId,
          channelUid: row.channelUid,
          mechanism: row.mechanism,
          origin: row.origin,
          futureMonthIndex: row.futureMonthIndex,
          futureMonth: row.futureMonth,
          includedHorizons: row.includedHorizons,
          observedAtOrigin: row.observedAtOrigin,
          actualPositive: row.actualPositive,
          actualReversal: row.actualReversal,
          actual: row.actual,
          positivePoint: prediction.positivePoint,
          pointEstimate: prediction.pointEstimate,
          occurrenceProbability: prediction.occurrenceProbability,
          occurrenceBinary64: prediction.occurrenceBinary64,
          conditionalPositiveAmount: prediction.conditionalPositiveAmount,
          selectedNodeId: prediction.selectedNodeId,
          supportTier: prediction.supportTier,
          fallbackReason: prediction.fallbackReason,
          layerConditionalPositiveAmount:
            prediction.layerConditionalPositiveAmount,
          occurrenceApplicationCount: prediction.occurrenceApplicationCount,
          horizonAggregationCount: prediction.horizonAggregationCount,
          taxonomyFeatureUsed: prediction.taxonomyFeatureUsed,
          lg01PredictionDependency: prediction.lg01PredictionDependency,
          postHocCalibrationUsed: prediction.postHocCalibrationUsed
        };
        const line = `${JSON.stringify(value)}\n`;
        hash.update(line, "utf8");
        buffer += line;
        population.add(key);
        rowCount += 1;
        if (Buffer.byteLength(buffer, "utf8") >= 4 * 1024 * 1024) {
          await handle.write(buffer, null, "utf8");
          buffer = "";
        }
      }
    }
    if (buffer.length > 0) await handle.write(buffer, null, "utf8");
    await handle.sync();
  } catch (error) {
    await handle.close();
    await fs.unlink(temporaryPath).catch(() => {});
    throw error;
  }
  await handle.close();
  if (finalize) await fs.rename(temporaryPath, outputPath);
  return Object.freeze({
    rowCount,
    sha256: hash.digest("hex"),
    populationKeySha256: population.finalize(),
    finalPath: outputPath,
    temporaryPath,
    finalPathVisible: finalize
  });
}

async function readArmPredictions(filePath, arm) {
  const output = {primary: new Map(), strict: new Map()};
  await scanNdjson({
    filePath,
    onRow: (row) => {
      if (row?.arm !== arm || !Object.hasOwn(output, row.evaluationFamily)) {
        throw new Error(`m2_psc03_${arm}_private_raw_contract_invalid`);
      }
      const target = output[row.evaluationFamily];
      const key = m2Psc03MonthlyKey(row);
      if (target.has(key)) {
        throw new Error(`m2_psc03_${arm}_private_raw_duplicate`);
      }
      target.set(key, Object.freeze({
        positivePoint: row.positivePoint,
        pointEstimate: row.pointEstimate,
        occurrenceProbability: row.occurrenceProbability,
        conditionalPositiveAmount: row.conditionalPositiveAmount,
        selectedNodeId: row.selectedNodeId,
        supportTier: row.supportTier,
        fallbackReason: row.fallbackReason,
        usedGenerator: false
      }));
    }
  });
  return Object.freeze(output);
}

async function publishFrozenResult({context, publicResult}) {
  const outputs = context.contracts.development.publicOutputs;
  const evaluationPath = path.join(rootOf(context), outputs.developmentJson);
  const evaluationMarkdownPath = path.join(
    rootOf(context),
    outputs.developmentMarkdown
  );
  const decisionPath = path.join(rootOf(context), outputs.decisionMarkdown);
  const preExecutionPath = path.join(
    rootOf(context),
    outputs.preExecutionReceipt
  );
  await Promise.all([
    fs.writeFile(
      evaluationPath,
      `${JSON.stringify(publicResult, null, 2)}\n`,
      "utf8"
    ),
    fs.writeFile(evaluationMarkdownPath, renderEvaluation(publicResult), "utf8"),
    fs.writeFile(decisionPath, renderDecision(publicResult), "utf8"),
    fs.writeFile(preExecutionPath, `${JSON.stringify({
      schema: "m2.current.psc03.pre_execution_ci_receipt.v0.1",
      status: "PSC03_PRE_EXECUTION_EXACT_HEAD_CI_PASSED",
      modelId: M2_PSC03_MODEL_ID,
      evidenceClass: "DEVELOPMENT_REPLAY",
      ...publicResult.preExecution,
      occurrenceAuthoritySha256:
        publicResult.execution.occurrenceAuthoritySha256,
      privateRowLevelDataPublished: false
    }, null, 2)}\n`, "utf8")
  ]);
}

function renderEvaluation(result) {
  const p = result.arms.P;
  const psc01 = result.comparisons.psc01;
  const lg01 = result.comparisons.lg01;
  return `# 出版行业渠道直接现金尺度条件金额模型 v0.1：唯一开发重放

对象：出版行业渠道直接现金尺度条件金额模型 v0.1（Publishing-Scale Channel Direct-Cash Conditional Amount Model v0.1，\`${result.modelId}\`），原始候选（raw candidate，\`${result.rawCandidateId}\`）。

状态：\`${result.status}\`。本报告属于开发重放（\`${result.evidenceClass}\`），不是独立评价、later-origin、final holdout、production 或财务使用证据。

## 核心结果

| 对象 | primary WAPE | strict WAPE | primary 预测/实际比 | strict 预测/实际比 |
|---|---:|---:|---:|---:|
| 算术层级诊断（\`${result.arms.D0.armId}\`） | ${percent(result.arms.D0.primary.workTotal.wape)} | ${percent(result.arms.D0.strict.workTotal.wape)} | ${decimal(result.arms.D0.primary.workTotal.predictionActualCashRatio)} | ${decimal(result.arms.D0.strict.workTotal.predictionActualCashRatio)} |
| 准 Gamma 方差族诊断（\`${result.arms.D1.armId}\`） | ${percent(result.arms.D1.primary.workTotal.wape)} | ${percent(result.arms.D1.strict.workTotal.wape)} | ${decimal(result.arms.D1.primary.workTotal.predictionActualCashRatio)} | ${decimal(result.arms.D1.strict.workTotal.predictionActualCashRatio)} |
| 准 Poisson 唯一原始候选（\`${result.arms.P.armId}\`；\`${result.rawCandidateId}\`） | ${percent(p.primary.workTotal.wape)} | ${percent(p.strict.workTotal.wape)} | ${decimal(p.primary.workTotal.predictionActualCashRatio)} | ${decimal(p.strict.workTotal.predictionActualCashRatio)} |
| 冻结出版行业规模适配渠道核心（\`M2-CHAN-PSC01-RAW\`） | ${percent(psc01.primary.workTotal.wape)} | ${percent(psc01.strict.workTotal.wape)} | ${decimal(psc01.primary.workTotal.predictionActualCashRatio)} | ${decimal(psc01.strict.workTotal.predictionActualCashRatio)} |
| 冻结人工锚定可学习全局模型（\`M2-WORK-LG01\`） | ${percent(lg01.primary.workTotal.wape)} | ${percent(lg01.strict.workTotal.wape)} | ${decimal(lg01.primary.workTotal.predictionActualCashRatio)} | ${decimal(lg01.strict.workTotal.predictionActualCashRatio)} |

尺度假设：${result.scaleHypothesis.passed ? "通过" : "未通过"}（\`${result.scaleHypothesis.interpretation}\`）。候选竞争力：\`${result.candidateCompetitiveness.interpretation}\`。

## 完整性与边界

- 冻结 occurrence 与 ${result.execution.primaryRawRowCount.toLocaleString("en-US")} 行人口逐位一致，完整人口 exact coverage 通过；occurrence、层级 offset 与 horizon 汇总均只应用一次。
- 主候选原始预测先原子封存，随后才读取冻结 PSC01 与 LG01 比较器；fallback 与两个诊断臂均未覆盖原始候选。
- Core80 是硬门禁，Core90 仅为完整披露的敏感性人口；平台、机制、支持层、起点与 horizon 聚合不足隐私门槛的单元均标记 \`SUPPRESSED_PRIVACY_THRESHOLD\`。
- 统一作品实际总额后的渠道构成仅为 \`POST_HOC_DIAGNOSTIC_NOT_MODEL_EVIDENCE_NOT_CANDIDATE_SCORE\`。
- \`activeCandidate=null\`、\`approvedForAutomation=null\`、\`productionReady=false\`、\`finalHoldoutOpened=false\`。
`;
}

function renderDecision(result) {
  return `# 出版行业渠道直接现金尺度条件金额模型 v0.1：实现与结果决策

唯一开发重放已经完成并冻结，科学状态为 \`${result.status}\`。

1. 算术层级诊断（\`${result.arms.D0.armId}\`）和准 Gamma 方差族诊断（\`${result.arms.D1.armId}\`）只用于机制归因，不能接管候选身份。
2. 唯一原始候选为准 Poisson 层级设计（\`${result.arms.P.armId}\`；\`${result.rawCandidateId}\`），完整 raw 只形成一次，未重跑。
3. 尺度假设轴为 \`${result.scaleHypothesis.interpretation}\`；候选竞争力轴为 \`${result.candidateCompetitiveness.interpretation}\`，二者不得压缩成同一结论。
4. PSC02 的 componentId、revisionId、effectiveAt、availableAt 与 extra=3 均未成为本模型的输入或门禁。
5. 本结果不授权独立评价、later-origin、final holdout、taxonomy/category 模型、production、automation、release、API、数据库、provider 或财务使用。
`;
}

function summarizeExistingEvaluation(value, privacy) {
  return Object.freeze({
    workTotal: scoreM2Psc03CaseRows(value.cases),
    workChannel: scoreM2Psc03CaseRows(flattenChannels(value.cases)),
    byHorizon: groupM2Psc03Scores(value.cases, "horizonMonths", privacy),
    byOrigin: groupM2Psc03Scores(value.cases, "origin", privacy)
  });
}

function privacyContract(context) {
  return Object.freeze({
    minimumCases:
      context.contracts.development.evaluation.privacyMinimumCases,
    minimumWorks:
      context.contracts.development.evaluation.privacyMinimumWorks
  });
}

function countHorizonCases(rows) {
  const keys = new Set();
  for (const row of rows) {
    for (const horizonMonths of row.includedHorizons) {
      keys.add(`${row.standardWorkId}\u001f${row.origin}\u001f${horizonMonths}`);
    }
  }
  return keys.size;
}

function buildSupportAttributionCases(rows, predictions) {
  const groups = new Map();
  for (const row of rows) {
    const prediction = predictions.get(m2Psc03MonthlyKey(row));
    for (const horizonMonths of row.includedHorizons) {
      const key = `${row.standardWorkId}\u001f${row.origin}\u001f`
        + `${horizonMonths}\u001f${prediction.supportTier}`;
      const value = groups.get(key) ?? {
        standardWorkId: row.standardWorkId,
        origin: row.origin,
        horizonMonths,
        supportTier: prediction.supportTier,
        actual: 0,
        pointEstimate: 0
      };
      value.actual += row.actual;
      value.pointEstimate += prediction.pointEstimate;
      groups.set(key, value);
    }
  }
  return [...groups.values()].map(Object.freeze);
}

function flattenChannels(cases) {
  return cases.flatMap((row) => row.channels.map((channel) => Object.freeze({
    ...channel,
    standardWorkId: row.standardWorkId,
    origin: row.origin,
    horizonMonths: row.horizonMonths
  })));
}

function scoreBands(rows) {
  return Object.freeze(Object.fromEntries(["H50", "M30", "L20"].map(
    (band) => {
      const selected = rows.filter((row) => row.cashBandId === band);
      if (selected.length === 0) {
        throw new Error(`m2_psc03_business_cash_band_empty:${band}`);
      }
      return [band, scoreM2Psc03CaseRows(selected)];
    }
  )));
}

function scoresByHorizon(rows) {
  return Object.fromEntries(
    [...new Set(rows.map((row) => row.horizonMonths))]
      .map((horizon) => [String(horizon), scoreM2Psc03CaseRows(
        rows.filter((row) => row.horizonMonths === horizon)
      )])
  );
}

function perOriginReductions(candidateRows, baselineRows) {
  const baseline = new Map(baselineRows.map((row) => [
    `${row.standardWorkId}\u001f${row.origin}\u001f${row.horizonMonths}`,
    row
  ]));
  const byOrigin = new Map();
  for (const row of candidateRows) {
    const key = `${row.standardWorkId}\u001f${row.origin}\u001f${row.horizonMonths}`;
    const paired = baseline.get(key);
    if (paired === undefined) throw new Error("m2_psc03_origin_pair_missing");
    const value = byOrigin.get(row.origin) ?? {actual: 0, reduction: 0};
    value.actual += Math.abs(row.actual);
    value.reduction += Math.abs(paired.pointEstimate - row.actual)
      - Math.abs(row.pointEstimate - row.actual);
    byOrigin.set(row.origin, value);
  }
  return [...byOrigin.entries()].map(([origin, value]) => Object.freeze({
    origin,
    reduction: value.actual === 0 ? 0 : value.reduction / value.actual
  }));
}

function nonOverlappingTimeEvidence(rows) {
  const origins = [...new Set(rows.filter((row) => row.horizonMonths === 36)
    .map((row) => row.origin))].sort();
  const selected = [];
  for (const origin of origins) {
    if (
      selected.length === 0
      || monthIndex(origin) - monthIndex(selected.at(-1)) >= 36
    ) selected.push(origin);
  }
  return Object.freeze({
    definition: "PRIMARY_FUTURE_ACTUAL_WINDOWS_DO_NOT_OVERLAP",
    availableNonOverlappingWindows: selected.length,
    minimumRequired: 2,
    selectedOrigins: Object.freeze(selected),
    passed: selected.length >= 2,
    insufficientStatus: selected.length >= 2
      ? null
      : "INDEPENDENT_TIME_EVIDENCE_INSUFFICIENT"
  });
}

async function readContracts(root) {
  const paths = {
    development: DEVELOPMENT_CONFIG,
    preregistration: PREREGISTRATION_CONFIG,
    schema: SCHEMA_CONFIG,
    psc01Config: PSC01_CONFIG,
    support: SUPPORT_CONFIG,
    business: BUSINESS_CONFIG,
    implementationSource: IMPLEMENTATION_SOURCE,
    evaluationSource: EVALUATION_SOURCE,
    runnerSource: RUNNER_SOURCE
  };
  const entries = await Promise.all(Object.entries(paths).map(
    async ([key, file]) => [key, await fs.readFile(path.join(root, file), "utf8")]
  ));
  const texts = Object.fromEntries(entries);
  return Object.freeze({
    development: JSON.parse(texts.development),
    preregistration: JSON.parse(texts.preregistration),
    schema: JSON.parse(texts.schema),
    psc01Config: JSON.parse(texts.psc01Config),
    support: JSON.parse(texts.support),
    business: JSON.parse(texts.business),
    texts
  });
}

function validateContracts(contracts) {
  validateM2Psc03Preregistration({
    preregistration: contracts.preregistration,
    development: contracts.development,
    schema: contracts.schema,
    psc01: contracts.psc01Config,
    support: contracts.support,
    businessAcceptance: contracts.business
  });
  validateM2Psc03DevelopmentConfig(
    contracts.development,
    contracts.psc01Config,
    contracts.support
  );
  validateM2BusinessAcceptanceContract(contracts.business);
  if (
    contracts.schema?.properties?.modelId?.const !== M2_PSC03_MODEL_ID
    || contracts.schema?.properties?.rawCandidateId?.const
      !== M2_PSC03_RAW_CANDIDATE_ID
  ) {
    throw new Error("m2_psc03_schema_identity_invalid");
  }
}

function syntheticFixture(psc01Config, developmentConfig) {
  const development = structuredClone(developmentConfig);
  development.selection.strictOrigins = ["2022-12"];
  const primary = [];
  const strict = [];
  const origins = [
    "2021-12", "2022-03", "2022-06", "2022-09", "2022-12"
  ];
  const platformByMechanism = {
    membership: psc01Config.nodes.namedPlatforms[0],
    advertising: psc01Config.nodes.namedPlatforms[2],
    transactional: psc01Config.nodes.namedPlatforms[3]
  };
  for (const [mechanismIndex, mechanism] of [
    "membership", "advertising", "transactional"
  ].entries()) {
    for (let work = 0; work < 30; work += 1) {
      for (const [originIndex, origin] of origins.entries()) {
        for (let month = 1; month <= 2; month += 1) {
          const platform = platformByMechanism[mechanism];
          const amount = month === 2 && work % 11 === 0
            ? 0
            : (mechanismIndex + 1) * (work + 2) * (month + originIndex + 1);
          const row = Object.freeze({
            schema: "m2.current.channel_generative_monthly_row.v0.2",
            actualDefinitionId:
              "M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01",
            labelView: "DEVELOPMENT_MODELABLE_RESTATEMENT_VIEW",
            evaluationFamily: origin === "2022-12" ? "strict" : "primary",
            standardWorkId:
              `SYN-${mechanism}-${String(work).padStart(2, "0")}`,
            channelUid: platform.channelUid,
            mechanism,
            origin,
            futureMonthIndex: month,
            futureMonth: origin,
            labelAvailableAsOf: origin,
            includedHorizons: [3, 6, 12].filter((horizon) => horizon >= month),
            observedAtOrigin: true,
            features: Object.freeze(Object.fromEntries(
              psc01Config.featureOrder.map((field, index) => [
                field,
                (work + originIndex + month + index) / 50
              ])
            )),
            actualPositive: amount,
            actualReversal: 0,
            actual: amount,
            postingTimeActualPositive: amount,
            postingTimeActualReversal: 0,
            postingTimeActual: amount,
            reversalRateByHorizon: Object.freeze({"3": 0, "6": 0, "12": 0}),
            trainingWeight: 1,
            futureFirstSeenIdentityUsedAsFeature: false,
            unmaturedLabelZeroImputed: false,
            buyoutCashUsed: false
          });
          strict.push(Object.freeze({...row, evaluationFamily: "strict"}));
          if (origin !== "2022-12") {
            primary.push(Object.freeze({...row, evaluationFamily: "primary"}));
          }
        }
      }
    }
  }
  return Object.freeze({
    primary: Object.freeze(primary),
    strict: Object.freeze(strict),
    config: development
  });
}

function originVisibleWorkCash(rowGroups) {
  const output = new Map();
  const seen = new Set();
  for (const rows of rowGroups) {
    for (const row of rows) {
      if (!row.observedAtOrigin) continue;
      const channelKey = `${row.origin}\u001f${row.standardWorkId}`
        + `\u001f${row.channelUid}`;
      if (seen.has(channelKey)) continue;
      seen.add(channelKey);
      const key = `${row.origin}\u001f${row.standardWorkId}`;
      const cash = Math.max(
        0,
        Math.expm1(finite(
          row.features?.log_recent_12_positive,
          "origin_visible_log_recent_12_positive"
        ))
      );
      output.set(key, (output.get(key) ?? 0) + cash);
    }
  }
  return output;
}

async function scanNdjson({filePath, onRow}) {
  const input = createReadStream(filePath);
  const hash = createHash("sha256");
  const lines = createInterface({input, crlfDelay: Infinity});
  let rowCount = 0;
  for await (const line of lines) {
    if (line.trim().length === 0) continue;
    hash.update(`${line}\n`, "utf8");
    if (onRow !== null) onRow(JSON.parse(line));
    rowCount += 1;
  }
  return Object.freeze({rowCount, sha256: hash.digest("hex")});
}

async function writeNdjsonAtomic(outputPath, rows) {
  if (await fileExists(outputPath)) {
    throw new Error("m2_psc03_private_output_collision");
  }
  const temporary = `${outputPath}.tmp-${process.pid}`;
  const text = rows.map((row) => JSON.stringify(row)).join("\n") + "\n";
  await fs.writeFile(temporary, text, {encoding: "utf8", flag: "wx"});
  await fs.rename(temporary, outputPath);
  return Object.freeze({rowCount: rows.length, sha256: digest(text)});
}

function createCommutativeKeyDigest() {
  let xor = 0n;
  let sumValue = 0n;
  let count = 0;
  const mask = (1n << 128n) - 1n;
  return {
    add(value) {
      const hex = digest(String(value)).slice(0, 32);
      const number = BigInt(`0x${hex}`);
      xor ^= number;
      sumValue = (sumValue + number) & mask;
      count += 1;
    },
    finalize() {
      return digest(`${count}|${xor.toString(16).padStart(32, "0")}`
        + `|${sumValue.toString(16).padStart(32, "0")}`);
    }
  };
}

function gitCheckIgnored(root, relativePath) {
  const result = spawnSync(
    "git",
    ["check-ignore", "--quiet", "--", relativePath.replaceAll("\\", "/")],
    {cwd: root, encoding: "utf8", windowsHide: true}
  );
  return result.status === 0;
}

async function directoryWritable(directory) {
  try {
    await fs.access(directory, 2);
    return true;
  } catch {
    return false;
  }
}

function resolvePrivateDirectory(root, relativePath) {
  if (typeof relativePath !== "string" || path.isAbsolute(relativePath)) {
    throw new Error("m2_psc03_private_path_invalid");
  }
  const resolved = path.resolve(root, relativePath);
  const local = path.relative(path.resolve(root), resolved).replaceAll("\\", "/");
  if (!local.startsWith("data/private-output/") || local.includes("../")) {
    throw new Error("m2_psc03_private_path_escape");
  }
  return resolved;
}

function safeBasename(value, field) {
  if (
    typeof value !== "string"
    || value.length === 0
    || path.basename(value) !== value
    || value.includes("/")
    || value.includes("\\")
  ) {
    throw new Error(`m2_psc03_${field}_filename_invalid`);
  }
  return value;
}

async function fileExists(value) {
  try {
    await fs.access(value);
    return true;
  } catch {
    return false;
  }
}

async function sha256File(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

function parseNdjson(value) {
  return String(value).split(/\r?\n/u).filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map(
      (key) => `${JSON.stringify(key)}:${stableJson(value[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function finite(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`m2_psc03_${field}_nonfinite`);
  }
  return number;
}

function relativeFva(candidate, baseline) {
  return baseline.wape === 0
    ? null
    : (baseline.wape - candidate.wape) / baseline.wape;
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function quantile(values, probability) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (sorted.length === 0) return null;
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function monthIndex(value) {
  const match = /^(\d{4})-(\d{2})$/u.exec(String(value));
  if (match === null) throw new Error("m2_psc03_month_invalid");
  return Number(match[1]) * 12 + Number(match[2]) - 1;
}

function percent(value) {
  return Number.isFinite(value) ? `${(100 * value).toFixed(4)}%` : "n/a";
}

function decimal(value) {
  return Number.isFinite(value) ? value.toFixed(4) : "n/a";
}

function rootOf(context) {
  return context.root;
}

function forceGarbageCollection() {
  if (typeof globalThis.gc === "function") globalThis.gc();
}
