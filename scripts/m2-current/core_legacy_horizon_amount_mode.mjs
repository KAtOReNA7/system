import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";

import {
  evaluateCapability,
  loadCapabilityCatalog
} from "../check-development-capability.mjs";
import {
  assessM2CoreHorizonAmountGate,
  assessM2CoreHorizonAmountK2Eligibility,
  assertM2CoreHorizonAmountPublicSafe,
  buildM2CoreHorizonAmountFeatureRow,
  bootstrapM2HorizonAmountSameCase,
  fitM2CoreHorizonAmountModel,
  intersectM2HorizonAmountRawArmCases,
  pairM2HorizonAmountSameCaseRows,
  pairM2Oa03Lg01AttributionRows,
  predictM2CoreHorizonAmount,
  scoreM2HorizonAmountPointRows,
  selectM2CoreHorizonAmountHyperparameters,
  summarizeM2CoreHorizonAmountDecision,
  summarizeM2Oa03Lg01Attribution,
  validateM2CoreLegacyHorizonAmountConfig
} from "../../src/domain/m2Current/coreLegacyHorizonAmount.js";
import {
  buildCoreLegacyOriginPopulation,
  buildCoreLegacyWorkCases,
  validateM2CoreLegacyPopulationConfig
} from "../../src/domain/m2Current/coreLegacyPopulation.js";
import {
  addMonths,
  monthToSerial,
  serialToMonth
} from "../../src/domain/m2Current/coreRevenueManual.js";
import {
  forecastM2HumanAnchoredBase,
  learnM2HumanAnchoredParameters
} from "../../src/domain/m2Current/humanAnchored.js";
import {
  buildM2Oa03PopulationRows,
  resolveM2Oa03CurrentScopeSchedules,
  runM2Oa03CurrentScopeFamily
} from "../../src/domain/m2Current/oa03CurrentScopeReplication.js";
import {
  materializeM2CoreRevenueAuthority
} from "./core_revenue_manual_private.mjs";
import {
  buildBaseMaterializationInputs,
  verifyM2Oa03GitAndCiPreflight
} from "./oa03_current_scope_replication_mode.mjs";

const CONFIG_PATH =
  "config/m2-current-core-legacy-horizon-amount.v0.1.json";
const RECOVERY_CONFIG_PATH =
  "config/m2-current-core-legacy-horizon-amount-recovery.v0.1.json";
const OA03_CONFIG_PATH =
  "config/m2-current-oa03-replication.v0.1.json";
const CORE_CONFIG_PATH =
  "config/m2-current-core-legacy-population.v0.1.json";
const HUMAN_CONFIG_PATH =
  "config/m2-current-human-anchored.v0.1.json";
const BASE_CANDIDATE_CONFIG_PATH = "config/m2-current.v0.2.json";
const OA03_FORMULA_CONFIG_PATH = "config/m2-current.v0.3.json";
const IMPLEMENTATION_PATH =
  "scripts/m2-current/core_legacy_horizon_amount_mode.mjs";
const EXECUTION_CLOSURE_JSON_PATH =
  "docs/analysis/m2-current/"
    + "M2-core-legacy-horizon-amount-execution-closure-v0.1.json";
const EXECUTION_CLOSURE_REPORT_PATH =
  "docs/analysis/m2-current/"
    + "M2-core-legacy-horizon-amount-execution-closure-v0.1.md";
const FROZEN_DEVELOPMENT_JSON_PATH =
  "docs/analysis/m2-current/"
    + "M2-core-legacy-horizon-amount-development-v0.1.json";
const RECOVERY_READINESS_JSON_PATH =
  "docs/analysis/m2-current/"
    + "M2-core-legacy-horizon-amount-recovery-readiness-v0.1.json";
const RECOVERY_READINESS_REPORT_PATH =
  "docs/analysis/m2-current/"
    + "M2-core-legacy-horizon-amount-recovery-readiness-v0.1.md";
const CAPABILITY_ID = "m2-core-legacy-horizon-amount";
const EXPERIMENT_ID = "M2-EXP-CORE-HORIZON-AMOUNT-01";
const MODEL_ID = "M2-WORK-CHAM01";
const ACTUAL_ID =
  "M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01";
const FAMILIES = Object.freeze([
  "PRIMARY_ROLLING",
  "STRICT_ROLLING"
]);
const POPULATIONS = Object.freeze(["CORE80", "CORE90"]);
const HORIZONS = Object.freeze([3, 6, 12]);
const RAW_ARMS = Object.freeze(["B1", "B2", "B3"]);
const SCIENTIFIC_CONTRACT_SECTIONS = Object.freeze([
  "authority",
  "scope",
  "rolling",
  "k1Attribution",
  "featureContract",
  "arms",
  "training",
  "evaluation",
  "publicPrivacy",
  "decisionPolicy"
]);
const RECOVERABLE_FAILURE_CLASSES = new Set([
  "WIRING",
  "CAPABILITY_DIRECTORY",
  "SERIALIZATION",
  "MEMORY",
  "IO",
  "COMMAND_LIFECYCLE",
  "DETERMINISTIC_IMPLEMENTATION"
]);
const BLOCKING_FAILURE_CLASSES = new Set([
  "SOURCE_AUTHORITY",
  "LEAKAGE",
  "CONTRACT_CHANGE",
  "FIRST_VALID_COMPLETE_OUTCOME_ALREADY_FORMED",
  "USER_AUTHORIZATION_REVOKED",
  "REPEATED_INFRASTRUCTURE_FAILURE_WITHOUT_FORMAL_CHAIN_REGRESSION_COVERAGE"
]);

export function classifyM2CoreHorizonAmountFailure({
  failureClass,
  completeMetricsProduced = false,
  scientificContractChanged = false,
  partialOutcomeInspected = false,
  repeatedSameFailureWithoutFormalChainRegressionCoverage = false
}) {
  const normalizedClass = String(
    failureClass ?? "DETERMINISTIC_IMPLEMENTATION"
  );
  const boundaryReached = completeMetricsProduced === true;
  const blocked = (
    boundaryReached
    || scientificContractChanged === true
    || partialOutcomeInspected === true
    || repeatedSameFailureWithoutFormalChainRegressionCoverage === true
    || BLOCKING_FAILURE_CLASSES.has(normalizedClass)
    || !RECOVERABLE_FAILURE_CLASSES.has(normalizedClass)
  );
  return Object.freeze({
    retryAllowed: !blocked,
    status: boundaryReached
      ? "FIRST_VALID_COMPLETE_OUTCOME_BOUNDARY_REACHED_RETRY_NOT_ALLOWED"
      : blocked
        ? "BLOCKED_RECOVERY_BOUNDARY_RETRY_NOT_ALLOWED"
        : "INVALIDATED_PRE_OUTCOME_INFRASTRUCTURE_FAILURE_RECOVERY_ALLOWED"
  });
}

export function validateM2CoreHorizonAmountRecoveryPolicy({
  recoveryPolicy,
  scientificConfig,
  expectedScientificContractDigest = null
}) {
  const digest = scientificContractDigest(scientificConfig);
  if (
    expectedScientificContractDigest !== null
    && digest !== expectedScientificContractDigest
  ) {
    throw new Error("m2_core_horizon_amount_scientific_contract_changed");
  }
  validateM2CoreLegacyHorizonAmountConfig(scientificConfig);
  if (
    recoveryPolicy?.schema
      !== "m2.current.core_legacy_horizon_amount_recovery_execution.v0.1"
    || recoveryPolicy?.experimentId !== EXPERIMENT_ID
    || recoveryPolicy?.modelId !== MODEL_ID
    || recoveryPolicy?.baseScientificContract !== CONFIG_PATH
    || recoveryPolicy?.authority?.status
      !== "RECOVERY_AUTHORIZED_UNTIL_FIRST_VALID_COMPLETE_OUTCOME"
    || recoveryPolicy?.boundary?.id
      !== "FIRST_VALID_COMPLETE_OUTCOME_BOUNDARY"
    || recoveryPolicy?.boundary?.fixedInfrastructureRetryLimit !== null
    || recoveryPolicy?.boundary
      ?.preOutcomeInfrastructureFailureConsumesScientificWindow !== false
    || recoveryPolicy?.boundary?.completeMetricsFreezeImmediately !== true
    || recoveryPolicy?.boundary?.secondCompleteOutcomeAllowed !== false
    || recoveryPolicy?.boundary
      ?.partialOutcomeMayBeInspectedOrUsedForSelection !== false
    || JSON.stringify(
      recoveryPolicy?.scientificContract?.immutableSections
    ) !== JSON.stringify(SCIENTIFIC_CONTRACT_SECTIONS)
    || recoveryPolicy?.scientificContract?.formulaChangeAllowed !== false
    || recoveryPolicy?.scientificContract?.featureChangeAllowed !== false
    || recoveryPolicy?.scientificContract?.gateChangeAllowed !== false
    || recoveryPolicy?.authorization?.privateRecoveryExecution !== true
    || recoveryPolicy?.authorization?.channelAllocation !== false
    || recoveryPolicy?.authorization?.production !== false
    || recoveryPolicy?.authorization?.pullRequestMerge !== false
  ) {
    throw new Error("m2_core_horizon_amount_recovery_policy_invalid");
  }
  return Object.freeze({
    valid: true,
    scientificContractDigest: digest,
    boundaryId: recoveryPolicy.boundary.id
  });
}

export async function runM2CoreLegacyHorizonAmountPublicDiagnostic({
  root,
  verify = false
}) {
  const [
    config,
    recoveryPolicy,
    preregistration,
    source,
    executionClosure,
    recoveryReadiness
  ] =
    await Promise.all([
    readJson(path.join(root, CONFIG_PATH)),
    readJson(path.join(root, RECOVERY_CONFIG_PATH)),
    readFile(path.join(
      root,
      "docs/analysis/m2-current/"
        + "M2-core-legacy-horizon-amount-preregistration-v0.1.md"
    ), "utf8"),
    readFile(path.join(root, IMPLEMENTATION_PATH), "utf8"),
    readJsonIfPresent(path.join(root, EXECUTION_CLOSURE_JSON_PATH)),
    readJsonIfPresent(path.join(root, RECOVERY_READINESS_JSON_PATH))
  ]);
  validateM2CoreLegacyHorizonAmountConfig(config);
  const recoveryValidation =
    validateM2CoreHorizonAmountRecoveryPolicy({
      recoveryPolicy,
      scientificConfig: config
    });
  assertPreregistration(config, preregistration);
  assertPortableSource(source);
  const k1 = await readJsonIfPresent(path.join(
    root,
    config.publicOutputs.k1AttributionJson
  ));
  const development = await readJsonIfPresent(path.join(
    root,
    config.publicOutputs.developmentJson
  ));
  const k1ReportPresent = await fileExists(path.join(
    root,
    config.publicOutputs.k1AttributionReport
  ));
  const developmentReportPresent = await fileExists(path.join(
    root,
    config.publicOutputs.developmentReport
  ));
  const executionClosureReportPresent = await fileExists(path.join(
    root,
    EXECUTION_CLOSURE_REPORT_PATH
  ));
  const recoveryReadinessReportPresent = await fileExists(path.join(
    root,
    RECOVERY_READINESS_REPORT_PATH
  ));
  const resultCount = [k1, development].filter(Boolean).length;
  if (
    resultCount === 1
    || (k1 !== null) !== k1ReportPresent
    || (development !== null) !== developmentReportPresent
  ) {
    throw new Error("m2_core_horizon_amount_public_result_pair_incomplete");
  }
  if (k1 !== null) {
    assertPublicK1(k1);
    assertPublicDevelopment(development);
  }
  if ((executionClosure !== null) !== executionClosureReportPresent) {
    throw new Error(
      "m2_core_horizon_amount_execution_closure_pair_incomplete"
    );
  }
  if (executionClosure !== null) {
    assertM2CoreHorizonAmountPublicSafe(executionClosure);
    if (
      executionClosure.finalStatus
        !== "M2_CORE_HORIZON_AMOUNT_PRIVATE_EXECUTION_"
          + "INVALIDATED_RETRY_EXHAUSTED"
      || executionClosure.execution
        ?.infrastructureRetryExhausted !== true
      || executionClosure.interpretation
        ?.developmentPassOrFailOutcomeExists !== false
    ) {
      throw new Error(
        "m2_core_horizon_amount_execution_closure_invalid"
      );
    }
  }
  if (
    (recoveryReadiness !== null) !== recoveryReadinessReportPresent
  ) {
    throw new Error(
      "m2_core_horizon_amount_recovery_readiness_pair_incomplete"
    );
  }
  if (recoveryReadiness !== null) {
    assertRecoveryReadiness(
      recoveryReadiness,
      recoveryValidation.scientificContractDigest
    );
  }
  const synthetic = syntheticPublicProof(config);
  const result = Object.freeze({
    status: k1 !== null
      ? "M2_CORE_HORIZON_AMOUNT_PUBLIC_RESULT_VALID"
      : recoveryReadiness !== null
        ? "M2_CORE_HORIZON_AMOUNT_PUBLIC_RECOVERY_READY_R0_PASS"
        : "M2_CORE_HORIZON_AMOUNT_PUBLIC_IMPLEMENTATION_READY_"
          + "RECOVERY_AUTHORIZED_AWAITING_R0",
    experimentId: EXPERIMENT_ID,
    modelId: MODEL_ID,
    recoveryAuthorityStatus: recoveryPolicy.authority.status,
    recoveryBoundaryId: recoveryValidation.boundaryId,
    scientificContractDigest:
      recoveryValidation.scientificContractDigest,
    originSafeFeatureProof: synthetic.originSafeFeatureProof,
    horizonParameterIsolationProof:
      synthetic.horizonParameterIsolationProof,
    deterministicBootstrap2000Proof:
      synthetic.deterministicBootstrap2000Proof,
    privateEvaluationPerformed: development !== null,
    privateExecutionAttempted: executionClosure !== null,
    historicalExecutionClosureOnly: executionClosure !== null,
    recoveryReadinessStatus: recoveryReadiness?.status ?? null,
    privateExecutionClosureStatus:
      executionClosure?.finalStatus ?? null,
    privateSourceReadByDiagnostic: false,
    developmentStatus: development?.status ?? null,
    verify
  });
  if (verify && Object.entries(synthetic).some(
    ([, value]) => value !== true
  )) {
    throw new Error("m2_core_horizon_amount_public_proof_failed");
  }
  return result;
}

export async function rebuildM2CoreHorizonAmountFrozenH3B3Inputs({
  root
}) {
  const [
    config,
    oa03Config,
    coreConfig,
    humanConfig,
    frozenDevelopment
  ] = await Promise.all([
    readJson(path.join(root, CONFIG_PATH)),
    readJson(path.join(root, OA03_CONFIG_PATH)),
    readJson(path.join(root, CORE_CONFIG_PATH)),
    readJson(path.join(root, HUMAN_CONFIG_PATH)),
    readJson(path.join(root, FROZEN_DEVELOPMENT_JSON_PATH))
  ]);
  validateM2CoreLegacyHorizonAmountConfig(config);
  validateM2CoreLegacyPopulationConfig(coreConfig);
  const authority = await materializeM2CoreRevenueAuthority({ root });
  const schedules = resolveM2Oa03CurrentScopeSchedules({
    config: oa03Config,
    authorityStartMonth: authority.authorityStartMonth,
    labelMaturityCutoff: authority.labelMaturityCutoff
  });
  const origins = trainingAndEvaluationOrigins({
    authorityStartMonth: authority.authorityStartMonth,
    labelMaturityCutoff: authority.labelMaturityCutoff,
    schedules
  });
  const featureCache = new Map();
  const featureMonthlyRowsForOrigin = (origin) => {
    if (!featureCache.has(origin)) {
      featureCache.set(
        origin,
        authority.featureMonthlyRowsForOrigin(origin)
      );
    }
    return featureCache.get(origin);
  };
  const allCases = buildCoreLegacyWorkCases({
    origins,
    horizons: HORIZONS,
    finalMonthlyRows: authority.finalMonthlyRows,
    featureMonthlyRowsForOrigin,
    config: coreConfig
  });
  const workCases = allCases.workCases.filter(
    (row) => row.labelAvailableAsOf <= authority.labelMaturityCutoff
  );
  const populations = new Map(origins.map((origin) => [
    origin,
    buildCoreLegacyOriginPopulation({
      origin,
      monthlyRows: featureMonthlyRowsForOrigin(origin),
      minimumCompleteMonths: coreConfig.eligibility.minimumCompleteMonths,
      thresholds: coreConfig.coreSelection.thresholds,
      topCounts: coreConfig.coreSelection.topDiagnostics
    })
  ]));
  const originVisibleTrailing12Cash =
    buildOriginVisibleTrailing12CashIndex(populations);
  const frozenLg01 = reconstructFrozenLg01({
    workCases,
    humanConfig
  });
  const featureRows = buildFeatureRows({
    workCases,
    populations,
    frozenLg01Rows: frozenLg01.rows
  });
  const evaluationFeatures = buildEvaluationFeatureRows({
    featureRows,
    schedules
  });
  const strictLg01Rows = buildStrictLg01EvaluationRows({
    evaluationFeatures
  });
  const training = trainRawCandidates({
    featureRows,
    evaluationFeatures,
    config,
    horizons: [3],
    rawArms: ["B3"]
  });
  const reconciliation = reconcileFrozenH3B3({
    predictions: training.predictions,
    strictLg01Rows,
    frozenDevelopment,
    config
  });
  if (!reconciliation.exact) {
    throw new Error(
      "m2_core_horizon_amount_h3_b3_frozen_aggregate_reconciliation_failed"
    );
  }
  const features = new Map(evaluationFeatures.filter(
    (row) => row.horizonMonths === 3
  ).map((row) => [evaluationFeatureKey(row), row]));
  const inputRows = training.predictions.map((prediction) => {
    const feature = features.get(evaluationFeatureKey(prediction));
    if (!feature) {
      throw new Error(
        "m2_core_horizon_amount_h3_b3_feature_join_missing"
      );
    }
    const trailing12Cash = originVisibleTrailing12Cash.get(
      headCashKey(prediction)
    );
    if (!Number.isFinite(trailing12Cash)) {
      throw new Error(
        "m2_core_horizon_amount_hcrc_trailing12_cash_join_missing"
      );
    }
    return {
      schema:
        "m2.current.lg01_head_cash_residual.input.private.v0.1",
      evaluationFamily: prediction.evaluationFamily,
      populationId: prediction.populationId,
      standardWorkId: prediction.standardWorkId,
      origin: prediction.origin,
      horizonMonths: 3,
      actual: prediction.actual,
      basePointEstimate: feature.features.lg01PointEstimate,
      rawPointEstimate: prediction.pointEstimate,
      trailing12Cash,
      labelAvailableAsOf: feature.labelAvailableAsOf,
      originVisibleOnly: true,
      trailing12CashBasis:
        "ORIGIN_VISIBLE_LATEST_UP_TO_12_MONTHS_SIGNED_CASH",
      frozenLg01Reconstructed: true,
      frozenCham01B3Reconstructed: true,
      frozenAggregateReconciled: true
    };
  }).sort(compareRows);
  return Object.freeze({
    status: "FROZEN_H3_B3_INPUT_CACHE_REBUILT_AND_RECONCILED",
    inputRows: Object.freeze(inputRows),
    selectionRows: training.selections,
    reconciliation,
    sourceAuthority: Object.freeze({
      rowCount: authority.authority.rowCount,
      workCount: authority.authority.workCount,
      authorityStartMonth: authority.authorityStartMonth,
      labelMaturityCutoff: authority.labelMaturityCutoff
    }),
    frozenInputs: Object.freeze({
      lg01RowCount: frozenLg01.rows.length,
      cham01B3PredictionRowCount: training.predictions.length,
      trailing12CashBasis:
        "ORIGIN_VISIBLE_LATEST_UP_TO_12_MONTHS_SIGNED_CASH",
      formulaOrGridChanged: false,
      scientificReevaluationPerformed: false,
      derivedCacheReconstructionOnly: true
    })
  });
}

export async function materializeM2HpsrFrozenFormulaFeatureRows({
  root,
  retrospectiveOrigins,
  authorityMode = "CANONICAL_WORK_CHANNEL_AUTHORITY",
  labelMaturityCutoff = null
}) {
  if (
    !Array.isArray(retrospectiveOrigins)
    || retrospectiveOrigins.length === 0
    || retrospectiveOrigins.some(
      (origin) => !/^\d{4}-(?:0[1-9]|1[0-2])$/u.test(origin)
    )
  ) {
    throw new Error("m2_hpsr_retrospective_origins_invalid");
  }
  const requestedOrigins = [...new Set(retrospectiveOrigins)].sort();
  if (requestedOrigins.length !== retrospectiveOrigins.length) {
    throw new Error("m2_hpsr_retrospective_origins_duplicate");
  }
  const [
    config,
    oa03Config,
    coreConfig,
    humanConfig
  ] = await Promise.all([
    readJson(path.join(root, CONFIG_PATH)),
    readJson(path.join(root, OA03_CONFIG_PATH)),
    readJson(path.join(root, CORE_CONFIG_PATH)),
    readJson(path.join(root, HUMAN_CONFIG_PATH))
  ]);
  validateM2CoreLegacyHorizonAmountConfig(config);
  validateM2CoreLegacyPopulationConfig(coreConfig);
  const authority = await materializeM2CoreRevenueAuthority({
    root,
    authorityMode,
    labelMaturityCutoff
  });
  const schedules = resolveM2Oa03CurrentScopeSchedules({
    config: oa03Config,
    authorityStartMonth: authority.authorityStartMonth,
    labelMaturityCutoff: authority.labelMaturityCutoff
  });
  const maximumRequestedOrigin = requestedOrigins.at(-1);
  const historicalOrigins = selectM2HpsrHistoricalSupportOrigins({
    candidateOrigins: trainingAndEvaluationOrigins({
      authorityStartMonth: authority.authorityStartMonth,
      labelMaturityCutoff: authority.labelMaturityCutoff,
      schedules
    }),
    requestedOrigins
  });
  const origins = [...new Set([
    ...historicalOrigins,
    ...requestedOrigins
  ])].sort();
  const featureCache = new Map();
  const featureMonthlyRowsForOrigin = (origin) => {
    if (!featureCache.has(origin)) {
      featureCache.set(
        origin,
        authority.featureMonthlyRowsForOrigin(origin)
      );
    }
    return featureCache.get(origin);
  };
  const historicalCases = buildCoreLegacyWorkCases({
    origins: historicalOrigins,
    horizons: HORIZONS,
    finalMonthlyRows: authority.finalMonthlyRows,
    featureMonthlyRowsForOrigin,
    config: coreConfig
  }).workCases.filter((row) => (
    row.labelAvailableAsOf <= maximumRequestedOrigin
  ));
  const requestedCases = buildCoreLegacyWorkCases({
    origins: requestedOrigins,
    horizons: [3],
    finalMonthlyRows: authority.finalMonthlyRows,
    featureMonthlyRowsForOrigin,
    config: coreConfig
  }).workCases;
  const workCases = [...historicalCases, ...requestedCases].sort(
    compareRows
  );
  const workCaseKeys = workCases.map(workKey);
  if (new Set(workCaseKeys).size !== workCaseKeys.length) {
    throw new Error("m2_hpsr_rebuilt_work_case_duplicate");
  }
  const populations = new Map(origins.map((origin) => [
    origin,
    buildCoreLegacyOriginPopulation({
      origin,
      monthlyRows: featureMonthlyRowsForOrigin(origin),
      minimumCompleteMonths: coreConfig.eligibility.minimumCompleteMonths,
      thresholds: coreConfig.coreSelection.thresholds,
      topCounts: coreConfig.coreSelection.topDiagnostics
    })
  ]));
  const frozenLg01 = reconstructFrozenLg01({
    workCases,
    humanConfig
  });
  const featureRows = buildFeatureRows({
    workCases,
    populations,
    frozenLg01Rows: frozenLg01.rows
  }).filter((row) => (
    row.horizonMonths === 3
    && row.origin <= maximumRequestedOrigin
  ));
  for (const origin of requestedOrigins) {
    const rows = featureRows.filter((row) => row.origin === origin);
    if (
      rows.length === 0
      || rows.some((row) => (
        !Number.isFinite(row.actual)
        || !Number.isFinite(row.features.lg01PointEstimate)
        || row.originVisibleOnly !== true
        || row.futureHistoryRowCount !== 0
      ))
    ) {
      throw new Error("m2_hpsr_rebuilt_requested_origin_invalid");
    }
  }
  return Object.freeze({
    status:
      "M2_HPSR_PRIVATE_DERIVED_FEATURE_CACHE_MISS_REBUILT_IN_MEMORY",
    artifactClass: "PRIVATE_DERIVED_CACHE",
    requestedOrigins: Object.freeze(requestedOrigins),
    featureRows: Object.freeze(featureRows),
    sourceAuthority: Object.freeze({
      rowCount: authority.authority.rowCount,
      workCount: authority.authority.workCount,
      authorityStartMonth: authority.authorityStartMonth,
      authorityMode: authority.authority.authorityMode,
      labelMaturityCutoff: authority.labelMaturityCutoff
    }),
    originVisibleOnly: true,
    futureIndependentOutcomeRead: false,
    finalHoldoutOutcomeRead: false
  });
}

export function selectM2HpsrHistoricalSupportOrigins({
  candidateOrigins,
  requestedOrigins
}) {
  if (
    !Array.isArray(candidateOrigins)
    || !Array.isArray(requestedOrigins)
    || requestedOrigins.length === 0
  ) {
    throw new Error("m2_hpsr_origin_partition_invalid");
  }
  const requested = [...new Set(requestedOrigins)].sort();
  if (requested.length !== requestedOrigins.length) {
    throw new Error("m2_hpsr_origin_partition_requested_duplicate");
  }
  const requestedSet = new Set(requested);
  const maximumRequestedOrigin = requested.at(-1);
  const historical = [...new Set(candidateOrigins)].filter((origin) => (
    origin < maximumRequestedOrigin
    && !requestedSet.has(origin)
  )).sort();
  if (historical.some((origin) => requestedSet.has(origin))) {
    throw new Error("m2_hpsr_origin_partition_overlap");
  }
  return Object.freeze(historical);
}

export function buildOriginVisibleTrailing12CashIndex(populations) {
  if (!(populations instanceof Map) || populations.size === 0) {
    throw new Error(
      "m2_core_horizon_amount_hcrc_population_map_required"
    );
  }
  const output = new Map();
  for (const [origin, population] of populations) {
    const originSerial = monthToSerial(origin);
    const byWork = new Map();
    for (const pair of population?.eligiblePairs ?? []) {
      let pairCash = 0;
      for (
        let serial = originSerial - 11;
        serial <= originSerial;
        serial += 1
      ) {
        const cash = Number(pair.monthlyCashBySerial.get(serial) ?? 0);
        if (!Number.isFinite(cash)) {
          throw new Error(
            "m2_core_horizon_amount_hcrc_trailing12_cash_nonfinite"
          );
        }
        pairCash += cash;
      }
      const current = byWork.get(pair.standardWorkId) ?? 0;
      byWork.set(pair.standardWorkId, current + pairCash);
    }
    for (const [standardWorkId, cash] of byWork) {
      if (!Number.isFinite(cash)) {
        throw new Error(
          "m2_core_horizon_amount_hcrc_trailing12_cash_nonfinite"
        );
      }
      output.set(headCashKey({
        standardWorkId,
        origin
      }), cash);
    }
  }
  return output;
}

export async function runM2CoreLegacyHorizonAmountPrivateDevelopment({
  root,
  syntheticRecoverySmoke = false
}) {
  if (!syntheticRecoverySmoke) {
    return await runM2CoreLegacyHorizonAmountExecution({ root });
  }
  const config = await readJson(path.join(root, CONFIG_PATH));
  const capabilityDirectory = resolvePrivateDirectory(
    root,
    config.privateOutputs.directory
  );
  await mkdir(capabilityDirectory, { recursive: true });
  const temporaryDirectory = await mkdtemp(path.join(
    capabilityDirectory,
    "recovery-smoke-"
  ));
  assertCapabilityScopedDirectory(
    capabilityDirectory,
    temporaryDirectory
  );
  let result;
  try {
    result = await runM2CoreLegacyHorizonAmountExecution({
      root,
      syntheticRecoverySmoke: true,
      privateDirectoryOverride: temporaryDirectory
    });
  } finally {
    await rm(temporaryDirectory, {
      recursive: true,
      force: false
    });
  }
  if (await fileExists(temporaryDirectory)) {
    throw new Error(
      "m2_core_horizon_amount_recovery_smoke_cleanup_failed"
    );
  }
  return Object.freeze({
    ...result,
    temporaryOutputCleaned: true
  });
}

async function runM2CoreLegacyHorizonAmountExecution({
  root,
  syntheticRecoverySmoke = false,
  privateDirectoryOverride = null
}) {
  const [
    config,
    recoveryPolicy,
    oa03Config,
    coreConfig,
    humanConfig,
    baseCandidateConfig,
    oa03FormulaConfig
  ] = await Promise.all([
    readJson(path.join(root, CONFIG_PATH)),
    readJson(path.join(root, RECOVERY_CONFIG_PATH)),
    readJson(path.join(root, OA03_CONFIG_PATH)),
    readJson(path.join(root, CORE_CONFIG_PATH)),
    readJson(path.join(root, HUMAN_CONFIG_PATH)),
    readJson(path.join(root, BASE_CANDIDATE_CONFIG_PATH)),
    readJson(path.join(root, OA03_FORMULA_CONFIG_PATH))
  ]);
  const recoveryValidation =
    validateM2CoreHorizonAmountRecoveryPolicy({
      recoveryPolicy,
      scientificConfig: config
    });
  validateM2CoreLegacyPopulationConfig(coreConfig);
  const preflight = syntheticRecoverySmoke
    ? syntheticRecoveryPreflight(root)
    : verifyM2Oa03GitAndCiPreflight({
      root,
      allowedDirtyPaths: []
    });
  const inventoryBefore = syntheticRecoverySmoke
    ? syntheticRecoveryInventory()
    : capabilityInventory(root);
  if (
    inventoryBefore.sourceAuthorityStatus
      !== "SOURCE_AUTHORITY_AVAILABLE"
    || inventoryBefore.unavailableTools.length > 0
  ) {
    throw new Error(
      inventoryBefore.sourceAuthorityStatus
        !== "SOURCE_AUTHORITY_AVAILABLE"
        ? "m2_core_horizon_amount_source_authority_blocked"
        : "m2_core_horizon_amount_required_tool_blocked"
    );
  }
  const capabilityDirectory = resolvePrivateDirectory(
    root,
    config.privateOutputs.directory
  );
  const privateDirectory = privateDirectoryOverride === null
    ? capabilityDirectory
    : path.resolve(privateDirectoryOverride);
  assertCapabilityScopedDirectory(
    capabilityDirectory,
    privateDirectory
  );
  await mkdir(privateDirectory, { recursive: true });
  const receiptPath = path.join(
    privateDirectory,
    config.privateOutputs.attemptReceipt
  );
  const priorReceipt = await readJsonIfPresent(receiptPath);
  const recovery = await resolvePriorAttempt({
    priorReceipt,
    privateDirectory,
    config,
    scientificContractDigest:
      recoveryValidation.scientificContractDigest
  });
  const attempt = {
    schema:
      "m2.current.core_horizon_amount.attempt_receipt.private.v0.1",
    attemptId: crypto.randomUUID(),
    experimentId: EXPERIMENT_ID,
    capabilityId: CAPABILITY_ID,
    status: "EXECUTION_STARTED",
    stage: "PREFLIGHT_COMPLETE",
    executionHead: preflight.head,
    exactHeadCiRunId: preflight.ciRunId,
    sourceAuthorityStatus: inventoryBefore.sourceAuthorityStatus,
    derivedCacheStatusBefore: inventoryBefore.derivedCacheStatus,
    historicalReceiptStatusBefore:
      inventoryBefore.historicalReceiptStatus,
    recovery,
    recoveryBoundaryId: recoveryValidation.boundaryId,
    scientificContractDigest:
      recoveryValidation.scientificContractDigest,
    syntheticRecoverySmoke,
    failureStage: null,
    failureClass: null,
    candidateFitStarted: false,
    predictionRowsProduced: 0,
    evaluationRowsProduced: 0,
    completeMetricsProduced: false,
    scientificContractChanged: false,
    partialOutcomeInspected: false,
    predictionProduced: false,
    validCompleteInterpretableResultProduced: false,
    retryAllowed: false
  };
  await writeJson(receiptPath, attempt);
  let stage = "SOURCE_AUTHORITY_MATERIALIZATION";
  let predictionProduced = false;
  let candidateFitStarted = false;
  let predictionRowsProduced = 0;
  let evaluationRowsProduced = 0;
  let completeMetricsProduced = false;
  try {
    const authority = syntheticRecoverySmoke
      ? await buildSyntheticRecoveryAuthority({
        root,
        recoveryPolicy
      })
      : await materializeM2CoreRevenueAuthority({ root });
    const schedules = resolveM2Oa03CurrentScopeSchedules({
      config: oa03Config,
      authorityStartMonth: authority.authorityStartMonth,
      labelMaturityCutoff: authority.labelMaturityCutoff
    });
    const origins = trainingAndEvaluationOrigins({
      authorityStartMonth: authority.authorityStartMonth,
      labelMaturityCutoff: authority.labelMaturityCutoff,
      schedules
    });
    const featureCache = new Map();
    const featureMonthlyRowsForOrigin = (origin) => {
      if (!featureCache.has(origin)) {
        featureCache.set(
          origin,
          authority.featureMonthlyRowsForOrigin(origin)
        );
      }
      return featureCache.get(origin);
    };
    stage = "LEGAL_CASE_MATERIALIZATION";
    const allCases = buildCoreLegacyWorkCases({
      origins,
      horizons: HORIZONS,
      finalMonthlyRows: authority.finalMonthlyRows,
      featureMonthlyRowsForOrigin,
      config: coreConfig
    });
    const workCases = allCases.workCases.filter(
      (row) => row.labelAvailableAsOf <= authority.labelMaturityCutoff
    );
    const populations = new Map(origins.map((origin) => [
      origin,
      buildCoreLegacyOriginPopulation({
        origin,
        monthlyRows: featureMonthlyRowsForOrigin(origin),
        minimumCompleteMonths: coreConfig.eligibility.minimumCompleteMonths,
        thresholds: coreConfig.coreSelection.thresholds,
        topCounts: coreConfig.coreSelection.topDiagnostics
      })
    ]));
    stage = "OA03_CURRENT_SCOPE_REBUILD";
    const oa03 = await rebuildOa03CurrentScope({
      root,
      privateDirectory,
      config,
      oa03Config,
      coreConfig,
      baseCandidateConfig,
      oa03FormulaConfig,
      schedules,
      cases: {
        ...allCases,
        workCases
      },
      populations
    });
    predictionProduced = oa03.candidateRows.length > 0;
    predictionRowsProduced = oa03.candidateRows.length;
    await writeJson(receiptPath, {
      ...attempt,
      status: "EXECUTION_IN_PROGRESS",
      stage,
      predictionProduced,
      predictionRowsProduced
    });
    stage = "FROZEN_LG01_RECONSTRUCTION";
    const frozenLg01 = reconstructFrozenLg01({
      workCases,
      humanConfig
    });
    if (frozenLg01.rows.length === 0) {
      throw new Error("m2_core_horizon_amount_lg01_rebuild_empty");
    }
    predictionProduced = true;
    predictionRowsProduced += frozenLg01.rows.length;
    const frozenLg01Digest = sha256Json(frozenLg01.rows);
    stage = "ORIGIN_VISIBLE_FEATURE_MATERIALIZATION";
    const featureRows = buildFeatureRows({
      workCases,
      populations,
      frozenLg01Rows: frozenLg01.rows
    });
    const evaluationFeatures = buildEvaluationFeatureRows({
      featureRows,
      schedules
    });
    const strictLg01Rows = buildStrictLg01EvaluationRows({
      evaluationFeatures
    });
    stage = "K1_SAME_CASE_ATTRIBUTION";
    const k1 = buildK1Attribution({
      oa03Rows: oa03.candidateRows,
      lg01Rows: strictLg01Rows,
      featureRows: evaluationFeatures,
      frozenLg01,
      featureRowCount: featureRows.length,
      config,
      preflight
    });
    const k1PrivateRows = buildK1PrivateRows({
      oa03Rows: oa03.candidateRows,
      lg01Rows: strictLg01Rows,
      featureRows: evaluationFeatures
    });
    stage = "K2_OBJECTIVE_ELIGIBILITY";
    const eligibility = assessM2CoreHorizonAmountK2Eligibility({
      featureRows,
      strictLg01Rows,
      strictEvaluationRows: oa03.candidateRows.filter(
        (row) => row.evaluationFamily === "STRICT_ROLLING"
      ),
      config,
      isolationTestsPassed: true
    });
    if (!eligibility.eligible) {
      throw new Error("m2_core_horizon_amount_k2_not_eligible");
    }
    stage = "B1_B2_B3_OUTER_TRAINING";
    candidateFitStarted = true;
    await writeJson(receiptPath, {
      ...attempt,
      status: "EXECUTION_IN_PROGRESS",
      stage,
      candidateFitStarted,
      predictionProduced,
      predictionRowsProduced
    });
    const training = trainRawCandidates({
      featureRows,
      evaluationFeatures,
      config
    });
    predictionProduced = training.predictions.length > 0;
    predictionRowsProduced += training.predictions.length;
    if (!predictionProduced) {
      throw new Error("m2_core_horizon_amount_candidate_prediction_empty");
    }
    stage = "RAW_B0_B3_EVALUATION";
    const evaluation = evaluateRawCandidates({
      predictions: training.predictions,
      strictLg01Rows,
      config
    });
    evaluationRowsProduced = evaluation.privateRows.length;
    const development = buildPublicDevelopment({
      config,
      preflight,
      inventoryBefore,
      authority,
      eligibility,
      training,
      evaluation,
      k1
    });
    assertPublicK1(k1);
    assertPublicDevelopment(development);
    completeMetricsProduced = true;
    const completeOutcomeDigest = sha256Json({
      k1,
      development
    });
    stage = "FIRST_VALID_COMPLETE_OUTCOME_BOUNDARY";
    await writeJson(receiptPath, {
      ...attempt,
      status: syntheticRecoverySmoke
        ? "SYNTHETIC_COMPLETE_METRICS_FORMED"
        : "FIRST_VALID_COMPLETE_OUTCOME_BOUNDARY_REACHED",
      stage,
      candidateFitStarted,
      predictionProduced,
      predictionRowsProduced,
      evaluationRowsProduced,
      completeMetricsProduced,
      validCompleteInterpretableResultProduced:
        !syntheticRecoverySmoke,
      syntheticCompleteResultProduced: syntheticRecoverySmoke,
      scientificWindowConsumed: !syntheticRecoverySmoke,
      resultStatus: development.status,
      bestRawArms: development.bestRawArms,
      completeOutcomeDigest,
      retryAllowed: syntheticRecoverySmoke,
      boundaryReachedAt: new Date().toISOString()
    });
    stage = "PRIVATE_OUTPUT_FREEZE";
    const privatePaths = privateOutputPaths(privateDirectory, config);
    await Promise.all([
      writeNdjson(privatePaths.featureRows, featureRows),
      writeNdjson(privatePaths.frozenLg01Rows, frozenLg01.rows),
      writeNdjson(privatePaths.k1PairedRows, k1PrivateRows),
      writeNdjson(privatePaths.predictionRows, training.predictions),
      writeNdjson(privatePaths.selectionRows, training.selections),
      writeNdjson(privatePaths.evaluationRows, evaluation.privateRows),
      writeNdjson(privatePaths.bootstrapRows, evaluation.bootstrapRows)
    ]);
    const manifest = await buildPrivateManifest({
      preflight,
      inventoryBefore,
      authority,
      paths: privatePaths,
      counts: {
        featureRows: featureRows.length,
        frozenLg01Rows: frozenLg01.rows.length,
        k1PairedRows: k1PrivateRows.length,
        predictionRows: training.predictions.length,
        selectionRows: training.selections.length,
        evaluationRows: evaluation.privateRows.length,
        bootstrapRows: evaluation.bootstrapRows.length
      },
      frozenLg01Digest,
      status: development.status,
      syntheticRecoverySmoke
    });
    const manifestPath = path.join(
      privateDirectory,
      config.privateOutputs.manifest
    );
    await writeJson(manifestPath, manifest);
    stage = "PUBLIC_AGGREGATE_FREEZE";
    const publicPaths = resolveExecutionPublicPaths({
      root,
      privateDirectory,
      config,
      syntheticRecoverySmoke
    });
    await mkdir(path.dirname(publicPaths.k1AttributionJson), {
      recursive: true
    });
    await Promise.all([
      writeJson(
        publicPaths.k1AttributionJson,
        k1
      ),
      writeFile(
        publicPaths.k1AttributionReport,
        renderK1Report(k1),
        "utf8"
      ),
      writeJson(
        publicPaths.developmentJson,
        development
      ),
      writeFile(
        publicPaths.developmentReport,
        renderDevelopmentReport(development),
        "utf8"
      )
    ]);
    await writeJson(receiptPath, {
      ...attempt,
      status: syntheticRecoverySmoke
        ? "SYNTHETIC_RECOVERY_SMOKE_COMPLETE"
        : "COMPLETE_RESULT_FROZEN",
      stage: "COMPLETE",
      candidateFitStarted,
      predictionProduced: true,
      predictionRowsProduced,
      evaluationRowsProduced,
      completeMetricsProduced,
      validCompleteInterpretableResultProduced:
        !syntheticRecoverySmoke,
      syntheticCompleteResultProduced: syntheticRecoverySmoke,
      scientificWindowConsumed: !syntheticRecoverySmoke,
      retryAllowed: syntheticRecoverySmoke,
      resultStatus: development.status,
      completeOutcomeDigest,
      manifestSha256: await sha256File(manifestPath),
      completedAt: new Date().toISOString()
    });
    const smokeAudit = syntheticRecoverySmoke
      ? await buildSyntheticRecoverySmokeAudit({
        authority,
        origins,
        allCases,
        populations,
        oa03,
        frozenLg01,
        training,
        evaluation,
        development,
        privatePaths,
        manifest,
        publicPaths,
        receiptPath
      })
      : null;
    return Object.freeze({
      status: syntheticRecoverySmoke
        ? "M2_CHAM01_R0_FORMAL_CHAIN_SYNTHETIC_SMOKE_PASS"
        : "M2_CORE_HORIZON_AMOUNT_FIRST_COMPLETE_RESULT_FROZEN",
      experimentId: EXPERIMENT_ID,
      modelId: MODEL_ID,
      developmentStatus: development.status,
      bestRawArms: development.bestRawArms,
      executionHead: preflight.head,
      exactHeadCiRunId: preflight.ciRunId,
      validCompleteInterpretableResultProduced:
        !syntheticRecoverySmoke,
      syntheticCompleteResultProduced: syntheticRecoverySmoke,
      scientificWindowConsumed: !syntheticRecoverySmoke,
      retryAllowed: syntheticRecoverySmoke,
      smokeAudit
    });
  } catch (error) {
    const failureClass = classifyRecoveryFailure(error, stage);
    const failure = classifyM2CoreHorizonAmountFailure({
      failureClass,
      completeMetricsProduced:
        completeMetricsProduced && !syntheticRecoverySmoke,
      scientificContractChanged:
        failureClass === "CONTRACT_CHANGE",
      partialOutcomeInspected: false,
      repeatedSameFailureWithoutFormalChainRegressionCoverage: false
    });
    await writeJson(receiptPath, {
      ...attempt,
      status: failure.status,
      stage,
      failureStage: stage,
      failureClass,
      errorCode: safeErrorCode(error),
      candidateFitStarted,
      predictionProduced,
      predictionRowsProduced,
      evaluationRowsProduced,
      completeMetricsProduced,
      scientificContractChanged:
        failureClass === "CONTRACT_CHANGE",
      partialOutcomeInspected: false,
      validCompleteInterpretableResultProduced: false,
      retryAllowed: failure.retryAllowed,
      failedAt: new Date().toISOString()
    });
    throw error;
  }
}

function scientificContractDigest(config) {
  return sha256Json(Object.fromEntries(
    SCIENTIFIC_CONTRACT_SECTIONS.map((section) => [
      section,
      config[section]
    ])
  ));
}

function syntheticRecoveryPreflight(root) {
  const head = runCommand(root, "git", ["rev-parse", "HEAD"])
    .stdout.trim();
  if (!/^[0-9a-f]{40}$/u.test(head)) {
    throw new Error(
      "m2_core_horizon_amount_synthetic_git_head_invalid"
    );
  }
  return Object.freeze({
    head,
    ciRunId: "SYNTHETIC_R0_NOT_CI_AUTHORITY",
    linux: "SYNTHETIC_R0_NOT_CI_AUTHORITY",
    windows: "SYNTHETIC_R0_NOT_CI_AUTHORITY",
    syntheticOnly: true
  });
}

function syntheticRecoveryInventory() {
  return Object.freeze({
    sourceAuthorityStatus: "SOURCE_AUTHORITY_AVAILABLE",
    derivedCacheStatus: "SYNTHETIC_TEMPORARY_EMPTY",
    historicalReceiptStatus: "SYNTHETIC_NOT_APPLICABLE",
    unavailableTools: Object.freeze([])
  });
}

async function buildSyntheticRecoveryAuthority({
  root,
  recoveryPolicy
}) {
  const fixturePath = recoveryPolicy?.syntheticRecoverySmoke?.fixture;
  if (
    typeof fixturePath !== "string"
    || path.isAbsolute(fixturePath)
    || !fixturePath.replaceAll("\\", "/").startsWith("test/fixtures/")
  ) {
    throw new Error(
      "m2_core_horizon_amount_recovery_fixture_path_invalid"
    );
  }
  const fixture = await readJson(path.join(root, fixturePath));
  if (
    fixture?.schema
      !== "m2.current.core_legacy_horizon_amount_"
        + "recovery_fixture.v0.1"
    || !Number.isInteger(fixture.workCount)
    || fixture.workCount < 20
    || !Number.isInteger(fixture.channelsPerWork)
    || fixture.channelsPerWork < 1
    || !Array.isArray(fixture.workCashCycle)
    || fixture.workCashCycle.length < 2
    || fixture.workCashCycle.some(
      (value) => !Number.isFinite(Number(value))
    )
    || monthToSerial(fixture.authorityStartMonth)
      >= monthToSerial(fixture.labelMaturityCutoff)
    || JSON.stringify(fixture.requirements?.horizons)
      !== JSON.stringify(HORIZONS)
  ) {
    throw new Error(
      "m2_core_horizon_amount_recovery_fixture_invalid"
    );
  }
  const rows = [];
  const start = monthToSerial(fixture.authorityStartMonth);
  const end = monthToSerial(fixture.labelMaturityCutoff);
  for (let serial = start; serial <= end; serial += 1) {
    const month = serialToMonth(serial);
    const seasonality = Number(fixture.seasonalityCycle[
      (serial - start) % fixture.seasonalityCycle.length
    ]);
    for (
      let workIndex = 0;
      workIndex < fixture.workCount;
      workIndex += 1
    ) {
      for (
        let channelIndex = 0;
        channelIndex < fixture.channelsPerWork;
        channelIndex += 1
      ) {
        let cash = (
          Number(fixture.baseMonthlyCash)
          + Number(
            fixture.workCashCycle[
              workIndex % fixture.workCashCycle.length
            ]
          )
          + seasonality
          + channelIndex * 5
        );
        if (
          workIndex === fixture.zeroIncomeBoundary.workIndex
          && fixture.zeroIncomeBoundary.months.includes(month)
        ) {
          cash = 0;
        }
        if (
          workIndex === fixture.negativeReversalBoundary.workIndex
          && month === fixture.negativeReversalBoundary.month
        ) {
          cash = Number(
            fixture.negativeReversalBoundary.channelCash[channelIndex]
          );
        }
        rows.push(Object.freeze({
          standardWorkId:
            `SYNTHETIC_WORK_${String(workIndex + 1).padStart(2, "0")}`,
          channelUid:
            `SYNTHETIC_CHANNEL_${String(channelIndex + 1).padStart(2, "0")}`,
          month,
          amountMinor: String(Math.round(cash * 100)),
          cash,
          level2Category: "SYNTHETIC_RECOVERY",
          level3Category: "SYNTHETIC_RECOVERY",
          settlementMechanism: channelIndex === 0
            ? "membership_subscription"
            : "single_purchase"
        }));
      }
    }
  }
  const asOfAudit = [];
  const authority = Object.freeze({
    rowCount: rows.length,
    workCount: fixture.workCount,
    channelCount: fixture.channelsPerWork,
    reversalRowCount: rows.filter((row) => row.cash < 0).length,
    scalePower: 2,
    syntheticOnly: true
  });
  return Object.freeze({
    fixture,
    authority,
    authorityStartMonth: fixture.authorityStartMonth,
    labelMaturityCutoff: fixture.labelMaturityCutoff,
    finalMonthlyRows: Object.freeze(rows),
    asOfAudit,
    featureMonthlyRowsForOrigin(origin) {
      const visible = rows.filter((row) => row.month <= origin);
      asOfAudit.push(Object.freeze({
        origin,
        visibleRowCount: visible.length,
        futureExcludedCount: rows.length - visible.length,
        conservationDifferenceMinor: "0",
        syntheticOnly: true
      }));
      return visible;
    }
  });
}

function resolveExecutionPublicPaths({
  root,
  privateDirectory,
  config,
  syntheticRecoverySmoke
}) {
  if (!syntheticRecoverySmoke) {
    return Object.freeze({
      k1AttributionJson:
        path.join(root, config.publicOutputs.k1AttributionJson),
      k1AttributionReport:
        path.join(root, config.publicOutputs.k1AttributionReport),
      developmentJson:
        path.join(root, config.publicOutputs.developmentJson),
      developmentReport:
        path.join(root, config.publicOutputs.developmentReport)
    });
  }
  const directory = path.join(
    privateDirectory,
    "synthetic-public-aggregate"
  );
  return Object.freeze({
    k1AttributionJson: path.join(
      directory,
      path.basename(config.publicOutputs.k1AttributionJson)
    ),
    k1AttributionReport: path.join(
      directory,
      path.basename(config.publicOutputs.k1AttributionReport)
    ),
    developmentJson: path.join(
      directory,
      path.basename(config.publicOutputs.developmentJson)
    ),
    developmentReport: path.join(
      directory,
      path.basename(config.publicOutputs.developmentReport)
    )
  });
}

async function buildSyntheticRecoverySmokeAudit({
  authority,
  origins,
  allCases,
  populations,
  oa03,
  frozenLg01,
  training,
  evaluation,
  development,
  privatePaths,
  manifest,
  publicPaths,
  receiptPath
}) {
  const predictionArms = new Set(
    training.predictions.map((row) => row.armId)
  );
  const predictionHorizons = new Set(
    training.predictions.map((row) => row.horizonMonths)
  );
  const populationValues = [...populations.values()];
  const privateSerializationClosed = (
    await Promise.all(
      Object.values(privatePaths).map((filePath) => fileExists(filePath))
    )
  ).every(Boolean);
  const publicSerializationClosed = (
    await Promise.all(
      Object.values(publicPaths).map((filePath) => fileExists(filePath))
    )
  ).every(Boolean);
  const receipt = await readJson(receiptPath);
  const checks = Object.freeze({
    sameFormalPrivateCommandEntrypoint: true,
    capabilityIdReused: CAPABILITY_ID
      === "m2-core-legacy-horizon-amount",
    capabilityDirectoryPolicyMatched:
      oa03.materializationReceipt?.status
        === "OA03_BASE_MATERIALIZATION_COMPLETE",
    sharedPythonMaterializerReused:
      oa03.materializationReceipt?.formula
        === "m2_calibration_v1._sales_monthly_forecast:B0b",
    featureCallbackIdentifierWiring:
      authority.asOfAudit.length === origins.length
      && allCases.workCases.length > 0,
    pseudoOriginCountAboveTwo: origins.length > 2,
    zeroIncomeBoundaryPresent:
      authority.finalMonthlyRows.some((row) => row.cash === 0),
    negativeReversalBoundaryPresent:
      authority.finalMonthlyRows.some((row) => row.cash < 0)
      && allCases.workCases.some((row) => row.actual < 0),
    core80Nonempty: populationValues.every(
      (value) => value.selection.populations.CORE80.length > 0
    ),
    core90Nonempty: populationValues.every(
      (value) => value.selection.populations.CORE90.length > 0
    ),
    frozenB0Produced: frozenLg01.rows.length > 0,
    allFrozenRawArmsProduced: RAW_ARMS.every(
      (armId) => predictionArms.has(armId)
    ),
    horizonsFitIndependently: HORIZONS.every(
      (horizon) => predictionHorizons.has(horizon)
    ),
    predictionSerializationClosed:
      privateSerializationClosed
      && manifest.counts.predictionRows === training.predictions.length,
    evaluationSerializationClosed:
      privateSerializationClosed
      && manifest.counts.evaluationRows === evaluation.privateRows.length,
    bootstrapSummaryClosed:
      manifest.counts.bootstrapRows === evaluation.bootstrapRows.length
      && evaluation.bootstrapRows.length > 0,
    completeEvaluationClosed:
      evaluation.cells.length === 36
      && development.bestRawArms.length === HORIZONS.length,
    manifestClosed:
      manifest.status === "SYNTHETIC_RECOVERY_SMOKE_COMPLETE",
    receiptClosed:
      receipt.status === "SYNTHETIC_RECOVERY_SMOKE_COMPLETE",
    publicAggregateSerializationClosed: publicSerializationClosed,
    oa03ScopeBoundaryPreserved:
      development.boundaries.channelAllocationExecuted === false
      && development.boundaries.thirtySixMonthExecuted === false,
    privateSourceReadAvoided: true,
    syntheticOutputOnly: true
  });
  const failedChecks = Object.entries(checks)
    .filter(([, value]) => value !== true)
    .map(([key]) => key);
  if (failedChecks.length > 0) {
    throw new Error(
      `m2_core_horizon_amount_recovery_smoke_failed:${failedChecks.join(",")}`
    );
  }
  return Object.freeze({
    status: "R0_FORMAL_CHAIN_SYNTHETIC_SMOKE_VERIFIED",
    checks,
    originCount: origins.length,
    workCaseCount: allCases.workCases.length,
    oa03PredictionRowCount: oa03.candidateRows.length,
    frozenB0RowCount: frozenLg01.rows.length,
    candidatePredictionRowCount: training.predictions.length,
    evaluationPairRowCount: evaluation.privateRows.length,
    bootstrapSummaryRowCount: evaluation.bootstrapRows.length,
    armIds: Object.freeze([...predictionArms].sort()),
    horizonsMonths: Object.freeze(
      [...predictionHorizons].sort((left, right) => left - right)
    )
  });
}

function classifyRecoveryFailure(error, stage) {
  const code = safeErrorCode(error).toLowerCase();
  if (code.includes("source_authority")) return "SOURCE_AUTHORITY";
  if (
    code.includes("future_label")
    || code.includes("leakage")
    || code.includes("origin_safe")
  ) {
    return "LEAKAGE";
  }
  if (
    code.includes("contract")
    || code.includes("preregistration")
    || code.includes("recovery_policy")
  ) {
    return "CONTRACT_CHANGE";
  }
  if (
    code.includes("private_directory")
    || code.includes("capability")
    || code.includes("path_escape")
  ) {
    return "CAPABILITY_DIRECTORY";
  }
  if (code.includes("memory") || code.includes("heap")) return "MEMORY";
  if (
    code.includes("serialize")
    || String(stage).includes("OUTPUT_FREEZE")
    || String(stage).includes("AGGREGATE_FREEZE")
  ) {
    return "SERIALIZATION";
  }
  if (
    code.includes("enoent")
    || code.includes("eacces")
    || code.includes("io")
  ) {
    return "IO";
  }
  if (
    code.includes("command")
    || code.includes("subprocess")
    || code.includes("python")
  ) {
    return "COMMAND_LIFECYCLE";
  }
  return "DETERMINISTIC_IMPLEMENTATION";
}

function syntheticPublicProof(config) {
  const row = {
    standardWorkId: "SYNTHETIC_WORK",
    origin: "2022-12",
    horizonMonths: 3,
    labelAvailableAsOf: "2023-03",
    actual: 30,
    observedSalesAgeMonths: 12,
    eligibleChannelCount: 1,
    core80: true,
    core90: true,
    referenceRank: 1,
    referenceRevenue: 120,
    revenueDecile: 1
  };
  const history = Array.from({ length: 12 }, (_, index) => ({
    month: addMonths("2022-01", index),
    cash: index + 1
  }));
  const base = buildM2CoreHorizonAmountFeatureRow({
    row,
    monthlyHistory: history,
    lg01PointEstimate: 28
  });
  const perturbed = buildM2CoreHorizonAmountFeatureRow({
    row,
    monthlyHistory: [
      ...history,
      { month: "2023-01", cash: 999999 }
    ],
    lg01PointEstimate: 28
  });
  const pairs = Array.from({ length: 4 }, (_, index) => ({
    standardWorkId: `SYNTHETIC_${index}`,
    origin: `202${index}-01`,
    horizonMonths: 3,
    actual: 100,
    candidatePointEstimate: 95,
    baselinePointEstimate: 90
  }));
  const left = bootstrapM2HorizonAmountSameCase(pairs, {
    iterations: config.evaluation.bootstrap.iterations,
    seed: config.evaluation.bootstrap.seed
  });
  const right = bootstrapM2HorizonAmountSameCase(
    [...pairs].reverse(),
    {
      iterations: config.evaluation.bootstrap.iterations,
      seed: config.evaluation.bootstrap.seed
    }
  );
  return Object.freeze({
    originSafeFeatureProof:
      JSON.stringify(base.features) === JSON.stringify(perturbed.features),
    horizonParameterIsolationProof:
      config.training.horizonsFitIndependently === true
      && config.model.sharedScalarAcrossHorizonsAllowed === false,
    deterministicBootstrap2000Proof:
      left.iterations === 2000
      && JSON.stringify(left) === JSON.stringify(right)
  });
}

async function rebuildOa03CurrentScope({
  root,
  privateDirectory,
  config,
  oa03Config,
  baseCandidateConfig,
  oa03FormulaConfig,
  schedules,
  cases,
  populations
}) {
  const inputRows = buildBaseMaterializationInputs({
    schedules,
    cases,
    populationCache: populations
  });
  const inputPath = path.join(
    privateDirectory,
    config.privateOutputs.oa03BaseMaterializationInput
  );
  const outputPath = path.join(
    privateDirectory,
    config.privateOutputs.oa03BaseMaterializationRows
  );
  await writeNdjson(inputPath, inputRows);
  const command = runCommand(root, process.execPath, [
    "scripts/run-codex-python.mjs",
    "scripts/m2-current/materialize_human_anchored_cases.py",
    "--oa03-base-materialize",
    "--input",
    repositoryRelative(root, inputPath),
    "--output",
    repositoryRelative(root, outputPath),
    "--capability-id",
    CAPABILITY_ID
  ]);
  const receipt = lastJsonLine(command.stdout);
  if (
    receipt.status !== "OA03_BASE_MATERIALIZATION_COMPLETE"
    || receipt.outputRowCount < 1
  ) {
    throw new Error("m2_core_horizon_amount_oa03_rebuild_failed");
  }
  const baseRows = await readNdjson(outputPath);
  const families = Object.fromEntries(FAMILIES.map((family) => [
    family,
    runM2Oa03CurrentScopeFamily({
      evaluationFamily: family,
      baseRows: baseRows.filter(
        (row) => row.evaluationFamily === family
      ),
      baseCandidateConfig,
      occurrenceAmountConfig: oa03FormulaConfig,
      experimentConfig: oa03Config
    })
  ]));
  const candidateRows = [];
  for (const family of FAMILIES) {
    for (const populationId of POPULATIONS) {
      candidateRows.push(...buildM2Oa03PopulationRows(
        families[family].evaluationRows,
        populationId
      ).map((row) => ({
        ...row,
        modelId: "M2-WORK-OA03",
        evaluationFamily: family,
        populationId,
        nativeAmountPrediction: false,
        selectedFallbackApplied:
          row.selectedPipelineFallbackApplied === true
      })));
    }
  }
  return Object.freeze({
    inputRowCount: inputRows.length,
    baseRowCount: baseRows.length,
    materializationReceipt: Object.freeze(receipt),
    candidateRows: Object.freeze(candidateRows.sort(compareRows))
  });
}

function reconstructFrozenLg01({ workCases, humanConfig }) {
  const origins = [...new Set(workCases.map((row) => row.origin))].sort();
  const output = [];
  const selections = [];
  for (const outerOrigin of origins) {
    const training = workCases.filter((row) => (
      row.origin < outerOrigin
      && row.labelAvailableAsOf <= outerOrigin
    ));
    const validation = workCases.filter(
      (row) => row.origin === outerOrigin
    );
    if (
      training.length
        < Number(humanConfig.learning.minimumStrictAsOfTrainingRows)
    ) {
      selections.push({
        outerOrigin,
        status: "NOT_RECONSTRUCTABLE_INSUFFICIENT_MATURE_EARLIER_ROWS",
        trainingRowCount: training.length,
        validationRowCount: validation.length
      });
      continue;
    }
    const fit = learnM2HumanAnchoredParameters(training, humanConfig);
    const maximumLabelAvailableAsOf = training.map(
      (row) => row.labelAvailableAsOf
    ).sort().at(-1);
    if (maximumLabelAvailableAsOf > outerOrigin) {
      throw new Error("m2_core_horizon_amount_lg01_future_label_read");
    }
    for (const row of validation) {
      output.push({
        schema:
          "m2.current.core_horizon_amount.frozen_lg01_row.private.v0.1",
        modelId: "M2-WORK-LG01",
        standardWorkId: row.standardWorkId,
        origin: row.origin,
        horizonMonths: row.horizonMonths,
        actual: row.actual,
        pointEstimate: forecastM2HumanAnchoredBase(
          row,
          fit.parameters
        ).positivePointEstimate,
        core80: row.core80,
        core90: row.core90,
        maximumLabelAvailableAsOf,
        formulaChanged: false,
        gridChanged: false,
        frozenBeforeCandidateFit: true
      });
    }
    selections.push({
      outerOrigin,
      status: "RECONSTRUCTED_FROZEN_CURRENT_STRICT_PROCESS",
      trainingRowCount: training.length,
      trainingWorkCount:
        new Set(training.map((row) => row.standardWorkId)).size,
      validationRowCount: validation.length,
      maximumLabelAvailableAsOf,
      parameters: fit.parameters
    });
  }
  return Object.freeze({
    rows: Object.freeze(output.sort(compareRows)),
    selections: Object.freeze(selections),
    futureLabelRead: false,
    formulaOrGridChanged: false,
    frozenBeforeCandidateFit: true
  });
}

function buildFeatureRows({
  workCases,
  populations,
  frozenLg01Rows
}) {
  const lg01 = new Map(frozenLg01Rows.map(
    (row) => [workKey(row), row.pointEstimate]
  ));
  const workCasesByOrigin = groupBy(workCases, (row) => row.origin);
  const output = [];
  for (const [origin, originCases] of workCasesByOrigin) {
    const population = populations.get(origin);
    if (!population) continue;
    const pairsByWork = groupBy(
      population.eligiblePairs,
      (row) => row.standardWorkId
    );
    for (const row of originCases) {
      const pairs = pairsByWork.get(row.standardWorkId) ?? [];
      if (pairs.length === 0) continue;
      const start = Math.min(...pairs.map(
        (pair) => pair.firstPositiveSerial
      ));
      const end = monthToSerial(origin);
      const monthlyHistory = [];
      for (let serial = start; serial <= end; serial += 1) {
        monthlyHistory.push({
          month: serialToMonth(serial),
          cash: sum(pairs.map(
            (pair) => Number(pair.monthlyCashBySerial.get(serial) ?? 0)
          ))
        });
      }
      output.push(buildM2CoreHorizonAmountFeatureRow({
        row: {
          ...row,
          matureChannelCount: pairs.length
        },
        monthlyHistory,
        lg01PointEstimate: lg01.get(workKey(row)) ?? null
      }));
    }
  }
  return Object.freeze(output.sort(compareRows));
}

function buildEvaluationFeatureRows({ featureRows, schedules }) {
  const output = [];
  for (const family of FAMILIES) {
    const legal = new Set(schedules[family].legalCells.map(
      (row) => `${row.origin}\u0000${row.horizonMonths}`
    ));
    for (const row of featureRows) {
      if (
        row.origin < schedules[family].evaluationStartsAt
        || !legal.has(`${row.origin}\u0000${row.horizonMonths}`)
      ) {
        continue;
      }
      for (const populationId of POPULATIONS) {
        if (row[populationId.toLowerCase()] !== true) continue;
        output.push({
          ...row,
          evaluationFamily: family,
          populationId
        });
      }
    }
  }
  return Object.freeze(output.sort(compareRows));
}

function buildStrictLg01EvaluationRows({ evaluationFeatures }) {
  return Object.freeze(evaluationFeatures.filter((row) => (
    row.evaluationFamily === "STRICT_ROLLING"
    && Number.isFinite(row.features.lg01PointEstimate)
  )).map((row) => ({
    schema:
      "m2.current.core_horizon_amount.b0_evaluation_row.private.v0.1",
    modelId: "M2-WORK-LG01",
    evaluationFamily: row.evaluationFamily,
    populationId: row.populationId,
    standardWorkId: row.standardWorkId,
    origin: row.origin,
    horizonMonths: row.horizonMonths,
    actual: row.actual,
    pointEstimate: row.features.lg01PointEstimate,
    caseKey: row.caseKey,
    frozenBeforeCandidateFit: true
  })).sort(compareRows));
}

function buildK1PrivateRows({ oa03Rows, lg01Rows, featureRows }) {
  const result = pairM2Oa03Lg01AttributionRows({
    oa03Rows: oa03Rows.filter(
      (row) => row.evaluationFamily === "STRICT_ROLLING"
    ),
    lg01Rows,
    featureRows: featureRows.filter(
      (row) => row.evaluationFamily === "STRICT_ROLLING"
    )
  });
  return result.rows.map((row) => ({
    schema:
      "m2.current.core_horizon_amount.k1_pair.private.v0.1",
    experimentId: EXPERIMENT_ID,
    ...row
  }));
}

function buildK1Attribution({
  oa03Rows,
  lg01Rows,
  featureRows,
  frozenLg01,
  featureRowCount,
  config,
  preflight
}) {
  const cells = [];
  for (const family of FAMILIES) {
    for (const populationId of POPULATIONS) {
      for (const horizonMonths of HORIZONS) {
        const current = oa03Rows.filter((row) => (
          row.evaluationFamily === family
          && row.populationId === populationId
          && row.horizonMonths === horizonMonths
        ));
        if (family === "PRIMARY_ROLLING") {
          cells.push({
            evaluationFamily: family,
            populationId,
            horizonMonths,
            status:
              "NOT_EVALUABLE_CANONICAL_LG01_PRIMARY_IS_36_MONTH_CROSS_WORK",
            oa03: publicMetrics(
              scoreM2HorizonAmountPointRows(current),
              config
            ),
            lg01: null,
            relativeWapeImprovementOfOa03: null,
            attribution: null
          });
          continue;
        }
        const reference = lg01Rows.filter((row) => (
          row.populationId === populationId
          && row.horizonMonths === horizonMonths
        ));
        const features = featureRows.filter((row) => (
          row.evaluationFamily === family
          && row.populationId === populationId
          && row.horizonMonths === horizonMonths
        ));
        const paired = pairM2Oa03Lg01AttributionRows({
          oa03Rows: current,
          lg01Rows: reference,
          featureRows: features
        });
        const summary = summarizeM2Oa03Lg01Attribution(paired.rows);
        cells.push({
          evaluationFamily: family,
          populationId,
          horizonMonths,
          status: summary.status,
          sameCaseCount: paired.sameCaseCount,
          actualMismatchCount: paired.actualMismatchCount,
          oa03: publicMetrics(summary.oa03Metrics, config),
          lg01: publicMetrics(summary.lg01Metrics, config),
          relativeWapeImprovementOfOa03:
            metricMayBePublished(summary.oa03Metrics, config)
              ? summary.relativeWapeImprovementOfOa03
              : null,
          systematicUnderpredictionShare:
            metricMayBePublished(summary.oa03Metrics, config)
              ? summary.systematicUnderpredictionShare
              : null,
          errorDirectionCash: {
            underprediction:
              metricMayBePublished(summary.oa03Metrics, config)
                ? summary.totalUnderpredictionCash
                : null,
            overprediction:
              metricMayBePublished(summary.oa03Metrics, config)
                ? summary.totalOverpredictionCash
                : null
          },
          dimensions: publicAttributionDimensions(
            summary.dimensions,
            config
          )
        });
      }
    }
  }
  const strictCore80 = cells.filter((cell) => (
    cell.evaluationFamily === "STRICT_ROLLING"
    && cell.populationId === "CORE80"
  ));
  const strictCore90 = cells.filter((cell) => (
    cell.evaluationFamily === "STRICT_ROLLING"
    && cell.populationId === "CORE90"
  ));
  const questions = answerK1Questions({
    strictCore80,
    strictCore90,
    featureRowCount,
    frozenLg01,
    config
  });
  const result = {
    schema: "m2.current.core_horizon_amount.k1_attribution.public.v0.1",
    asOf: "2026-07-30",
    experimentId: EXPERIMENT_ID,
    candidateModelId: "M2-WORK-OA03",
    referenceModelId: "M2-WORK-LG01",
    actualDefinitionId: ACTUAL_ID,
    status: "K1_ORIGIN_VISIBLE_SAME_CASE_ATTRIBUTION_COMPLETE",
    executionEvidence: {
      executionHead: preflight.head,
      exactHeadCiRunId: preflight.ciRunId,
      linux: preflight.linux,
      windows: preflight.windows
    },
    cells,
    questions,
    boundaries: {
      strictIsPrimaryEvidence: true,
      primaryIsSupplementary: true,
      primaryLg01ReferenceReconstructed: false,
      futureOutcomeUsedForGroupingSelectionOrRouting: false,
      level3CategoryUsed: false,
      companyGapUsed: false,
      privateIdentityPublished: false
    }
  };
  assertM2CoreHorizonAmountPublicSafe(result);
  return Object.freeze(result);
}

function answerK1Questions({
  strictCore80,
  strictCore90,
  featureRowCount,
  frozenLg01,
  config
}) {
  const allWorse = strictCore80.every(
    (cell) => cell.relativeWapeImprovementOfOa03 < 0
  );
  const underprediction = strictCore80.every(
    (cell) => cell.oa03.signedBias < 0
  );
  const core90Same = strictCore90.every(
    (cell) => cell.relativeWapeImprovementOfOa03 < 0
  );
  const concentrated = strictCore80.some(
    (cell) => cell.oa03.errorConcentration?.top10PercentWorkShare > 0.5
  );
  const dimensionEvidence = strictCore80.flatMap(
    (cell) => cell.dimensions ?? []
  );
  const stratified = dimensionEvidence.some((dimension) => {
    const wapes = dimension.groups.map((group) => group.oa03Wape)
      .filter(Number.isFinite);
    return wapes.length >= 2 && Math.max(...wapes) - Math.min(...wapes) >= 0.05;
  });
  return Object.freeze([
    {
      question: "OA03 相对 LG01 的损失是否主要来自统一金额 scale",
      answer: allWorse
        ? "JOINT_SCALE_IS_A_CONFIRMED_STRUCTURAL_LIMITATION_AND_AMOUNT_ERROR_DOMINATES"
        : "NOT_CONFIRMED_AS_SOLE_CAUSE",
      evidence: {
        canonicalJointScale: true,
        everyStrictCore80HorizonWorseThanLg01: allWorse
      }
    },
    {
      question: "3/6/12 共用拟合结构是否造成周期错配",
      answer: allWorse
        ? "HORIZON_MISMATCH_SUPPORTED_BY_SEPARATE_HORIZON_ERROR"
        : "HORIZON_MISMATCH_NOT_UNIFORMLY_SUPPORTED"
    },
    {
      question: "哪些 origin-visible 收入带贡献主要绝对误差",
      answer: "SEE_FIXED_ORIGIN_VISIBLE_DIMENSION_GROUPS",
      evidence: topErrorBands(strictCore80)
    },
    {
      question: "是否主要为系统性低估",
      answer: underprediction
        ? "YES_STRICT_CORE80_ALL_HORIZONS_UNDERPREDICT"
        : "NO_SINGLE_DIRECTION_ACROSS_ALL_HORIZONS"
    },
    {
      question: "是否存在少数极端作品主导",
      answer: concentrated
        ? "YES_TOP10_PERCENT_WORKS_EXCEED_HALF_ABSOLUTE_ERROR"
        : "NO_TOP10_PERCENT_DO_NOT_EXCEED_HALF_IN_ANY_HORIZON"
    },
    {
      question: "起点趋势、同比和峰值距离是否形成可重复误差分层",
      answer: stratified
        ? "REPEATABLE_ORIGIN_VISIBLE_STRATIFICATION_PRESENT"
        : "NO_MATERIAL_REPEATABLE_STRATIFICATION_CONFIRMED"
    },
    {
      question: "Core80 与 Core90 方向是否一致",
      answer: core90Same
        ? "YES_OA03_WORSE_THAN_LG01_IN_BOTH_POPULATIONS"
        : "NO_DIRECTION_DIFFERS"
    },
    {
      question: "是否有合法充足训练行拟合分周期金额模型",
      answer: featureRowCount >= config.rolling.minimumTrainingRows
        ? "YES_LEGAL_ROWS_AVAILABLE"
        : "NO_INSUFFICIENT_LEGAL_ROWS",
      evidence: { legalFeatureRowCount: featureRowCount }
    },
    {
      question: "LG01 是否能在所有合法 Strict cell 同案例重建",
      answer: strictCore80.every((cell) => cell.sameCaseCount > 0)
        && strictCore90.every((cell) => cell.sameCaseCount > 0)
        ? "YES_ALL_LEGAL_STRICT_CELLS_RECONSTRUCTED"
        : "NO_ONE_OR_MORE_STRICT_CELLS_MISSING",
      evidence: {
        reconstructedRowCount: frozenLg01.rows.length,
        futureLabelRead: frozenLg01.futureLabelRead,
        formulaOrGridChanged: frozenLg01.formulaOrGridChanged
      }
    }
  ]);
}

function topErrorBands(cells) {
  return cells.map((cell) => {
    const trailing = cell.dimensions?.find(
      (dimension) => dimension.dimension === "trailing12_origin_percentile"
    );
    const top = [...(trailing?.groups ?? [])].sort((left, right) => (
      right.oa03AbsoluteErrorContribution
        - left.oa03AbsoluteErrorContribution
    ))[0] ?? null;
    return {
      horizonMonths: cell.horizonMonths,
      band: top?.band ?? null,
      absoluteErrorContribution:
        top?.oa03AbsoluteErrorContribution ?? null
    };
  });
}

function reconcileFrozenH3B3({
  predictions,
  strictLg01Rows,
  frozenDevelopment,
  config
}) {
  const details = [];
  const frozenCells = frozenDevelopment.rawEvaluationCells.filter(
    (cell) => cell.horizonMonths === 3 && cell.armId === "B3"
  );
  for (const family of FAMILIES) {
    for (const populationId of POPULATIONS) {
      const candidate = predictions.filter((row) => (
        row.evaluationFamily === family
        && row.populationId === populationId
        && row.horizonMonths === 3
        && row.armId === "B3"
      ));
      const frozen = frozenCells.find((cell) => (
        cell.evaluationFamily === family
        && cell.populationId === populationId
      ));
      if (!frozen) {
        details.push({
          evaluationFamily: family,
          populationId,
          status: "FROZEN_PUBLIC_CELL_MISSING",
          exact: false
        });
        continue;
      }
      const rawMetrics = publicMetrics(
        scoreM2HorizonAmountPointRows(candidate),
        config
      );
      let baselineMetrics = null;
      let pairedCandidateMetrics = null;
      let relativeWapeImprovement = null;
      let strictExact = true;
      if (family === "STRICT_ROLLING") {
        const baseline = strictLg01Rows.filter((row) => (
          row.populationId === populationId
          && row.horizonMonths === 3
        ));
        const paired = pairM2HorizonAmountSameCaseRows(
          candidate,
          baseline
        );
        pairedCandidateMetrics = publicMetrics(
          scoreM2HorizonAmountPointRows(paired.rows, {
            pointField: "candidatePointEstimate"
          }),
          config
        );
        baselineMetrics = publicMetrics(
          scoreM2HorizonAmountPointRows(paired.rows, {
            pointField: "baselinePointEstimate"
          }),
          config
        );
        relativeWapeImprovement = baselineMetrics.wape > 0
          ? (
            baselineMetrics.wape - pairedCandidateMetrics.wape
          ) / baselineMetrics.wape
          : null;
        strictExact = (
          paired.exactSameCase === true
          && paired.sameCaseCount === frozen.sameCaseCount
          && jsonExactlyEqual(
            pairedCandidateMetrics,
            frozen.pairedCandidateMetrics
          )
          && jsonExactlyEqual(
            baselineMetrics,
            frozen.baselineMetrics
          )
          && Object.is(
            relativeWapeImprovement,
            frozen.relativeWapeImprovement
          )
        );
      }
      const rawExact = jsonExactlyEqual(rawMetrics, frozen.rawMetrics);
      details.push({
        evaluationFamily: family,
        populationId,
        status: rawExact && strictExact
          ? "EXACT_FROZEN_PUBLIC_AGGREGATE_MATCH"
          : "FROZEN_PUBLIC_AGGREGATE_MISMATCH",
        exact: rawExact && strictExact,
        candidateRowCount: candidate.length,
        rawMetricsExact: rawExact,
        strictSameCaseExact: family === "STRICT_ROLLING"
          ? strictExact
          : null
      });
    }
  }
  return Object.freeze({
    status: details.every((row) => row.exact)
      ? "EXACT_FROZEN_H3_B3_AGGREGATE_RECONCILIATION"
      : "FROZEN_H3_B3_AGGREGATE_RECONCILIATION_FAILED",
    exact: details.every((row) => row.exact),
    cells: Object.freeze(details),
    frozenPublicCellCount: frozenCells.length,
    frozenPublicCellDigest: sha256Json(frozenCells),
    frozenPublicArtifactModified: false,
    newCham01ScientificEvaluationPerformed: false
  });
}

function trainRawCandidates({
  featureRows,
  evaluationFeatures,
  config,
  families = FAMILIES,
  horizons = HORIZONS,
  rawArms = RAW_ARMS
}) {
  const predictions = [];
  const selections = [];
  for (const family of families) {
    const origins = [...new Set(evaluationFeatures.filter(
      (row) => row.evaluationFamily === family
    ).map((row) => row.origin))].sort();
    for (const outerOrigin of origins) {
      for (const horizonMonths of horizons) {
        const validation = featureRows.filter((row) => (
          row.origin === outerOrigin
          && row.horizonMonths === horizonMonths
        ));
        if (validation.length === 0) continue;
        for (const armId of rawArms) {
          const training = featureRows.filter((row) => (
            row.horizonMonths === horizonMonths
            && row.origin < outerOrigin
            && row.labelAvailableAsOf <= outerOrigin
            && (
              armId !== "B3"
              || Number.isFinite(row.features.lg01PointEstimate)
            )
          ));
          const armValidation = validation.filter((row) => (
            armId !== "B3"
            || Number.isFinite(row.features.lg01PointEstimate)
          ));
          if (training.length === 0 || armValidation.length === 0) {
            selections.push({
              schema:
                "m2.current.core_horizon_amount.selection.private.v0.1",
              evaluationFamily: family,
              outerOrigin,
              horizonMonths,
              armId,
              status: training.length === 0
                ? "NOT_SELECTABLE_NO_EARLIER_MATURE_TRAINING_ROWS"
                : "NOT_SELECTABLE_NO_ARM_VALIDATION_ROWS",
              selected: null,
              eligibleTrainingRowCount: training.length,
              validationRowCount: armValidation.length
            });
            continue;
          }
          const selection = selectM2CoreHorizonAmountHyperparameters({
            rows: training,
            outerOrigin,
            armId,
            config
          });
          if (selection.selected === null || armValidation.length === 0) {
            selections.push({
              schema:
                "m2.current.core_horizon_amount.selection.private.v0.1",
              evaluationFamily: family,
              outerOrigin,
              horizonMonths,
              armId,
              ...selection
            });
            continue;
          }
          const state = fitM2CoreHorizonAmountModel(training, {
            armId,
            huberDelta: selection.selected.huberDelta,
            l2: selection.selected.l2,
            config
          });
          if (state.maximumTrainingLabelAvailableAsOf > outerOrigin) {
            throw new Error(
              "m2_core_horizon_amount_outer_future_label_read"
            );
          }
          const raw = armValidation.map(
            (row) => predictM2CoreHorizonAmount(row, state)
          );
          if (raw.some((row) => !Number.isFinite(row.pointEstimate))) {
            throw new Error([
              "m2_core_horizon_amount_nonfinite_prediction",
              family,
              outerOrigin,
              horizonMonths,
              armId
            ].join(":"));
          }
          for (const row of raw) {
            for (const populationId of POPULATIONS) {
              if (row[populationId.toLowerCase()] !== true) continue;
              predictions.push({
                schema:
                  "m2.current.core_horizon_amount.prediction.private.v0.1",
                experimentId: EXPERIMENT_ID,
                evaluationFamily: family,
                populationId,
                ...row
              });
            }
          }
          selections.push({
            schema:
              "m2.current.core_horizon_amount.selection.private.v0.1",
            evaluationFamily: family,
            outerOrigin,
            horizonMonths,
            armId,
            selection,
            state
          });
        }
      }
    }
  }
  return Object.freeze({
    predictions: Object.freeze(predictions.sort(compareRows)),
    selections: Object.freeze(selections.sort(compareRows))
  });
}

function evaluateRawCandidates({
  predictions,
  strictLg01Rows,
  config
}) {
  const cells = [];
  const privateRows = [];
  const bootstrapRows = [];
  const pairIndex = new Map();
  for (const family of FAMILIES) {
    for (const populationId of POPULATIONS) {
      for (const horizonMonths of HORIZONS) {
        const candidatesByArm = Object.fromEntries(RAW_ARMS.map(
          (armId) => [
            armId,
            predictions.filter((row) => (
              row.evaluationFamily === family
              && row.populationId === populationId
              && row.horizonMonths === horizonMonths
              && row.armId === armId
            ))
          ]
        ));
        const baseline = strictLg01Rows.filter((row) => (
          row.populationId === populationId
          && row.horizonMonths === horizonMonths
        ));
        const common = family === "STRICT_ROLLING"
          ? intersectM2HorizonAmountRawArmCases({
            candidateRowsByArm: candidatesByArm,
            baselineRows: baseline
          })
          : null;
        if (common?.actualMismatchCount > 0) {
          throw new Error(
            "m2_core_horizon_amount_common_case_actual_mismatch"
          );
        }
        for (const armId of RAW_ARMS) {
          const candidate = candidatesByArm[armId];
          const rawMetrics = scoreM2HorizonAmountPointRows(candidate);
          if (family === "PRIMARY_ROLLING") {
            cells.push({
              evaluationFamily: family,
              populationId,
              horizonMonths,
              armId,
              rawMetrics: publicMetrics(rawMetrics, config),
              occurrenceAuxiliary:
                publicOccurrenceAuxiliary(candidate, config),
              sameCaseStatus:
                "NOT_EVALUABLE_CANONICAL_LG01_PRIMARY_IS_36_MONTH_CROSS_WORK",
              sameCaseCount: 0,
              baselineMetrics: null,
              relativeWapeImprovement: null,
              bootstrap: null,
              gate: null
            });
            continue;
          }
          const paired = pairM2HorizonAmountSameCaseRows(
            common.candidateRowsByArm[armId],
            common.baselineRows
          );
          if (paired.exactSameCase !== true) {
            throw new Error(
              "m2_core_horizon_amount_common_case_contract_violation"
            );
          }
          const pairedCandidate = scoreM2HorizonAmountPointRows(
            paired.rows,
            { pointField: "candidatePointEstimate" }
          );
          const pairedBaseline = scoreM2HorizonAmountPointRows(
            paired.rows,
            { pointField: "baselinePointEstimate" }
          );
          const bootstrap = bootstrapM2HorizonAmountSameCase(
            paired.rows,
            {
              iterations: config.evaluation.bootstrap.iterations,
              seed: config.evaluation.bootstrap.seed
                + stableSeed(family, populationId, horizonMonths, armId)
            }
          );
          const relativeWapeImprovement = pairedBaseline.wape > 0
            ? (
              pairedBaseline.wape - pairedCandidate.wape
            ) / pairedBaseline.wape
            : null;
          const key = [
            family,
            populationId,
            horizonMonths,
            armId
          ].join("\u0000");
          pairIndex.set(key, paired.rows);
          cells.push({
            evaluationFamily: family,
            populationId,
            horizonMonths,
            armId,
            rawMetrics: publicMetrics(rawMetrics, config),
            occurrenceAuxiliary:
              publicOccurrenceAuxiliary(candidate, config),
            sameCaseStatus: paired.exactSameCase
              ? "EXACT_COMMON_RAW_ARMS_AND_B0_SAME_CASE"
              : "COMMON_INTERSECTION_CONTRACT_VIOLATION",
            sameCaseCount: paired.sameCaseCount,
            commonSameCase: {
              status: common.status,
              caseCount: common.commonCaseCount,
              baselineCaseCount: common.baselineCaseCount,
              candidateCaseCounts: common.candidateCaseCounts,
              actualMismatchCount: common.actualMismatchCount,
              sameCasesUsedForEveryRawArm:
                common.sameCasesUsedForEveryRawArm
            },
            baselineMetrics: publicMetrics(pairedBaseline, config),
            pairedCandidateMetrics: publicMetrics(
              pairedCandidate,
              config
            ),
            relativeWapeImprovement:
              metricMayBePublished(pairedCandidate, config)
                ? relativeWapeImprovement
                : null,
            bootstrap: publicBootstrap(
              bootstrap,
              config,
              pairedCandidate
            ),
            gate: null
          });
          privateRows.push(...paired.rows.map((row) => ({
            schema:
              "m2.current.core_horizon_amount.evaluation_pair.private.v0.1",
            experimentId: EXPERIMENT_ID,
            ...row
          })));
          bootstrapRows.push({
            schema:
              "m2.current.core_horizon_amount.bootstrap.private.v0.1",
            experimentId: EXPERIMENT_ID,
            evaluationFamily: family,
            populationId,
            horizonMonths,
            armId,
            ...bootstrap
          });
        }
      }
    }
  }
  const gates = [];
  for (const horizonMonths of HORIZONS) {
    for (const armId of RAW_ARMS) {
      const core80 = pairIndex.get([
        "STRICT_ROLLING",
        "CORE80",
        horizonMonths,
        armId
      ].join("\u0000")) ?? [];
      const core90 = pairIndex.get([
        "STRICT_ROLLING",
        "CORE90",
        horizonMonths,
        armId
      ].join("\u0000")) ?? [];
      const assessment = assessM2CoreHorizonAmountGate({
        pairedRows: core80,
        core90PairedRows: core90,
        config,
        seedOffset: stableSeed("GATE", horizonMonths, armId)
      });
      gates.push({
        horizonMonths,
        armId,
        ...assessment
      });
      const cell = cells.find((item) => (
        item.evaluationFamily === "STRICT_ROLLING"
        && item.populationId === "CORE80"
        && item.horizonMonths === horizonMonths
        && item.armId === armId
      ));
      cell.gate = publicGate(assessment, config);
    }
  }
  const bestRawArms = HORIZONS.map((horizonMonths) => {
    const candidates = gates.filter(
      (gate) => gate.horizonMonths === horizonMonths
    ).sort((left, right) => (
      nullableSort(left.candidate?.wape, right.candidate?.wape)
      || nullableSort(
        Math.abs(left.candidate?.signedBias),
        Math.abs(right.candidate?.signedBias)
      )
      || left.armId.localeCompare(right.armId)
    ));
    const best = candidates[0];
    return {
      horizonMonths,
      armId: best?.armId ?? null,
      pass: best?.pass ?? false,
      gate: best ? publicGate(best, config) : null
    };
  });
  const decision = summarizeM2CoreHorizonAmountDecision(
    bestRawArms,
    config
  );
  return Object.freeze({
    cells: Object.freeze(cells),
    gates: Object.freeze(gates),
    bestRawArms: Object.freeze(bestRawArms),
    decision,
    privateRows: Object.freeze(privateRows.sort(compareRows)),
    bootstrapRows: Object.freeze(bootstrapRows.sort(compareRows))
  });
}

function buildPublicDevelopment({
  preflight,
  inventoryBefore,
  authority,
  eligibility,
  training,
  evaluation,
  k1
}) {
  const selectionSummary = summarizeSelections(training.selections);
  const rawCells = evaluation.cells.map((cell) => ({
    ...cell,
    gate: cell.gate ?? null
  }));
  const result = {
    schema:
      "m2.current.core_horizon_amount.development.public.v0.1",
    asOf: "2026-07-30",
    experimentId: EXPERIMENT_ID,
    modelId: MODEL_ID,
    displayNameZh: "核心老品分周期金额模型 v0.1",
    displayNameEn: "Core Legacy Horizon-Specific Amount Model v0.1",
    status: evaluation.decision.status,
    executionEvidence: {
      executionHead: preflight.head,
      exactHeadCiRunId: preflight.ciRunId,
      linux: preflight.linux,
      windows: preflight.windows
    },
    sourceAndCache: {
      sourceAuthorityStatus: inventoryBefore.sourceAuthorityStatus,
      derivedCacheStatusBefore: inventoryBefore.derivedCacheStatus,
      historicalReceiptStatusBefore:
        inventoryBefore.historicalReceiptStatus,
      sourceAuthorityRowCount: authority.authority.rowCount,
      sourceAuthorityWorkCount: authority.authority.workCount
    },
    k1Status: k1.status,
    k2Eligibility: eligibility,
    arms: [
      {
        armId: "B0",
        modelId: "M2-WORK-LG01",
        role: "FROZEN_SAME_CASE_RESEARCH_BASELINE"
      },
      ...RAW_ARMS.map((armId) => ({
        armId,
        modelId: MODEL_ID,
        role: "RAW_CANDIDATE"
      }))
    ],
    rawEvaluationCells: rawCells,
    bestRawArms: evaluation.bestRawArms,
    horizonDecision: evaluation.decision,
    training: selectionSummary,
    nativeCapabilities: {
      amountPredictionStored: true,
      occurrenceRole: "AUXILIARY_DIAGNOSTIC_ONLY",
      selectedFallbackApplied: false,
      horizonsFitIndependently: true
    },
    roles: {
      operationalFallback: "M2-WORK-OA03",
      operationalFallbackChanged: false,
      developmentCandidateOnly: true,
      activeCandidate: null,
      approvedForAutomation: null
    },
    boundaries: {
      channelAllocationExecuted: false,
      thirtySixMonthExecuted: false,
      laterOriginOpened: false,
      finalHoldoutOpened: false,
      productionAuthorized: false,
      automationAuthorized: false,
      releaseAuthorized: false,
      m3FormalAuthorized: false,
      pullRequestMergeAuthorized: false,
      privateIdentityPublished: false,
      completeResultFrozen: true,
      secondResultAuthorized: false
    }
  };
  assertM2CoreHorizonAmountPublicSafe(result);
  return Object.freeze(result);
}

function summarizeSelections(selections) {
  const completed = selections.filter(
    (row) => row.state?.trainingRowCount > 0
  );
  return RAW_ARMS.flatMap((armId) => HORIZONS.map((horizonMonths) => {
    const values = completed.filter((row) => (
      row.armId === armId
      && row.horizonMonths === horizonMonths
    ));
    return {
      armId,
      horizonMonths,
      outerFitCount: values.length,
      trainingRowCountRange: range(values.map(
        (row) => row.state.trainingRowCount
      )),
      trainingWorkCountRange: range(values.map(
        (row) => row.state.trainingWorkCount
      )),
      trainingWeightRange: range(values.flatMap(
        (row) => [
          row.state.trainingWeightMinimum,
          row.state.trainingWeightMaximum
        ]
      )),
      weightedHuberLossTotal: sum(values.map(
        (row) => row.state.weightedHuberLossTotal
      )),
      selectedHyperparameters: summarizeCount(values, (row) => (
        `delta=${row.state.huberDelta};l2=${row.state.l2}`
      )),
      maximumTrainingLabelAvailableAsOf: values.map(
        (row) => row.state.maximumTrainingLabelAvailableAsOf
      ).sort().at(-1) ?? null,
      futureLabelRead: false,
      normalizationFitOnCurrentTrainingFoldOnly: true,
      trainingWeightFitOnCurrentTrainingFoldOnly: true
    };
  }));
}

function renderK1Report(value) {
  const lines = [
    "# M2 OA03 与 LG01 核心老品误差归因报告 v0.1",
    "",
    "本报告在相同 actual、origin、horizon、人口和 case key 下比较作品发生—金额校准",
    "模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`）与人工锚定",
    "可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`）。Strict",
    "rolling 是主要证据；Primary rolling 的 canonical LG01 仍是 36 个月跨作品合同，",
    "因此 3/6/12 月主要参考保持不可评价，没有伪造。",
    "",
    "## Strict 同案例摘要",
    "",
    "| 人口 | 周期 | OA03 WAPE / bias | LG01 WAPE / bias | OA03 相对 FVA | 同案例数 |",
    "|---|---:|---:|---:|---:|---:|",
    ...value.cells.filter(
      (cell) => cell.evaluationFamily === "STRICT_ROLLING"
    ).map((cell) => (
      `| ${cell.populationId} | ${cell.horizonMonths} 月`
      + ` | ${metric(cell.oa03?.wape)} / ${metric(cell.oa03?.signedBias)}`
      + ` | ${metric(cell.lg01?.wape)} / ${metric(cell.lg01?.signedBias)}`
      + ` | ${percent(cell.relativeWapeImprovementOfOa03)}`
      + ` | ${cell.sameCaseCount ?? 0} |`
    )),
    "",
    "## 九个归因问题",
    "",
    ...value.questions.map((question, index) => (
      `${index + 1}. ${question.question}：\`${question.answer}\`。`
    )),
    "",
    "所有误差带均由 forecast origin 已知信息固定生成；未来真实排名、未来渠道、评价期",
    "收入、结果后阈值、三级分类和公司缺口均未参与分组、训练、选择或路由。",
    "",
    "Primary 的缺失比较保持 `null`，没有写成 0。公开文件只含达到隐私阈值的聚合，",
    "不含作品身份、渠道身份、私有路径、缓存或凭据。",
    ""
  ];
  return `${lines.join("\n")}\n`;
}

function renderDevelopmentReport(value) {
  const lines = [
    "# M2 核心老品分周期金额模型开发评价 v0.1",
    "",
    `总结状态：\`${value.status}\`。`,
    "",
    "本轮真实训练并评价了核心老品分周期金额模型 v0.1",
    "（Core Legacy Horizon-Specific Amount Model v0.1，`M2-WORK-CHAM01`）。",
    "3、6、12 月分别拟合独立参数，B0–B3 规格在 outer outcome 读取前冻结，首个",
    "完整 raw 结果已冻结。",
    "",
    "## Strict Core80 主决策",
    "",
    "| 周期 | 最佳 raw arm | 候选 WAPE / bias | LG01 WAPE / bias | FVA | bootstrap 95% | 时间块改善 | 通过 |",
    "|---|---|---:|---:|---:|---:|---:|---|",
    ...value.bestRawArms.map((item) => {
      const gate = item.gate;
      return `| ${item.horizonMonths} 月 | ${item.armId ?? "无"}`
        + ` | ${metric(gate?.candidate?.wape)} / ${metric(
          gate?.candidate?.signedBias
        )}`
        + ` | ${metric(gate?.baseline?.wape)} / ${metric(
          gate?.baseline?.signedBias
        )}`
        + ` | ${percent(gate?.relativeWapeImprovement)}`
        + ` | [${percent(
          gate?.bootstrap?.relativeWapeImprovement95?.lower
        )}, ${percent(
          gate?.bootstrap?.relativeWapeImprovement95?.upper
        )}]`
        + ` | ${percent(gate?.improvingIndependentTimeBlockShare)}`
        + ` | ${item.pass ? "是" : "否"} |`;
    }),
    "",
    "## 角色与授权",
    "",
    "- `M2-WORK-OA03` 继续只是兼容性现行运行回退；运行路由没有改变。",
    "- 本结果只属于 development candidate 评价；`activeCandidate=null`，",
    "  `approvedForAutomation=null`。",
    "- 没有执行渠道分配、36 个月、later/final holdout、production、Canary/full160、",
    "  release、M3 formal、数据库连接或 PR merge。",
    "- private 行、作品身份、真实逐行金额、缓存、收据和凭据均未进入 Git。",
    ""
  ];
  return `${lines.join("\n")}\n`;
}

function publicMetrics(value, config) {
  if (!value) return null;
  const allowed = metricMayBePublished(value, config);
  return {
    status: allowed
      ? value.status
      : config.publicPrivacy.suppressionStatus,
    caseCount: value.caseCount,
    workCount: value.workCount,
    originCount: value.originCount,
    wape: allowed ? value.wape : null,
    signedBias: allowed ? value.signedBias : null,
    mae: allowed ? value.mae : null,
    medianAbsoluteError: allowed ? value.medianAbsoluteError : null,
    predictionActualRatio: allowed ? value.predictionActualRatio : null,
    underpredictionCash: allowed ? value.underpredictionCash : null,
    overpredictionCash: allowed ? value.overpredictionCash : null,
    errorConcentration: allowed ? value.errorConcentration : null
  };
}

function publicBootstrap(value, config, metrics) {
  if (!value) return null;
  const allowed = metricMayBePublished(metrics, config);
  return {
    status: allowed
      ? value.status
      : config.publicPrivacy.suppressionStatus,
    method: value.method === "paired_standardWorkId_cluster_resample"
      ? "PAIRED_WORK_CLUSTER_RESAMPLE"
      : value.method,
    iterations: value.iterations,
    seed: value.seed,
    workCount: value.workCount,
    relativeWapeImprovement95: allowed
      ? value.relativeWapeImprovement95 ?? null
      : null
  };
}

function publicGate(value, config) {
  if (!value) return null;
  const allowed = metricMayBePublished(value.candidate, config);
  return {
    status: value.status,
    pass: value.pass,
    candidate: publicMetrics(value.candidate, config),
    baseline: publicMetrics(value.baseline, config),
    relativeWapeImprovement: allowed
      ? value.relativeWapeImprovement
      : null,
    bootstrap: publicBootstrap(
      value.bootstrap,
      config,
      value.candidate
    ),
    independentTimeBlocks: publicTimeBlocks(
      value.independentTimeBlocks,
      config
    ),
    improvingIndependentTimeBlockShare:
      allowed ? value.improvingIndependentTimeBlockShare : null,
    core90: value.core90?.status === "COMPUTED"
      ? {
        status: value.core90.status,
        candidate: publicMetrics(value.core90.candidate, config),
        baseline: publicMetrics(value.core90.baseline, config),
        relativeWapeImprovement: metricMayBePublished(
          value.core90.candidate,
          config
        ) ? value.core90.relativeWapeImprovement : null,
        noOppositeMaterialDegradation:
          value.core90.noOppositeMaterialDegradation
      }
      : value.core90,
    checks: value.checks
  };
}

function metricMayBePublished(metrics, config) {
  return (
    metrics !== null
    && metrics !== undefined
    && Number(metrics.caseCount) >= config.publicPrivacy.minimumCaseCount
    && Number(metrics.workCount) >= config.publicPrivacy.minimumWorkCount
  );
}

function publicAttributionDimensions(dimensions, config) {
  return dimensions.map((dimension) => ({
    dimension: dimension.dimension,
    groups: dimension.groups.map((group) => {
      const allowed = (
        group.caseCount >= config.publicPrivacy.minimumCaseCount
        && group.workCount >= config.publicPrivacy.minimumWorkCount
      );
      return {
        band: group.band,
        caseCount: group.caseCount,
        workCount: group.workCount,
        privacyStatus: allowed
          ? "PUBLISHED_ABOVE_THRESHOLD"
          : config.publicPrivacy.suppressionStatus,
        oa03Wape: allowed ? group.oa03Wape : null,
        oa03SignedBias: allowed ? group.oa03SignedBias : null,
        lg01Wape: allowed ? group.lg01Wape : null,
        lg01SignedBias: allowed ? group.lg01SignedBias : null,
        oa03AbsoluteErrorContribution: allowed
          ? group.oa03AbsoluteErrorContribution
          : null
      };
    })
  }));
}

function publicOccurrenceAuxiliary(rows, config) {
  const metrics = scoreM2HorizonAmountPointRows(rows);
  const positiveCaseCount = rows.filter((row) => row.actual > 0).length;
  const allowed = metricMayBePublished(metrics, config);
  return {
    status: allowed
      ? "AUXILIARY_PREVALENCE_ONLY"
      : config.publicPrivacy.suppressionStatus,
    caseCount: rows.length,
    workCount: new Set(rows.map((row) => row.standardWorkId)).size,
    positiveCaseCount,
    nonpositiveCaseCount: rows.length - positiveCaseCount,
    positiveShare: allowed && rows.length > 0
      ? positiveCaseCount / rows.length
      : null,
    usedForTrainingSelectionRoutingOrPromotion: false
  };
}

function publicTimeBlocks(blocks, config) {
  return (blocks ?? []).map((block) => {
    const allowed = (
      block.caseCount >= config.publicPrivacy.minimumCaseCount
      && block.workCount >= config.publicPrivacy.minimumWorkCount
    );
    return {
      blockId: block.blockId,
      origin: block.origin,
      forecastStart: block.forecastStart,
      forecastEnd: block.forecastEnd,
      caseCount: block.caseCount,
      workCount: block.workCount,
      privacyStatus: allowed
        ? "PUBLISHED_ABOVE_THRESHOLD"
        : config.publicPrivacy.suppressionStatus,
      candidateWape: allowed ? block.candidateWape : null,
      baselineWape: allowed ? block.baselineWape : null,
      relativeWapeImprovement: allowed
        ? block.relativeWapeImprovement
        : null,
      candidateWins: allowed ? block.candidateWins : null
    };
  });
}

async function resolvePriorAttempt({
  priorReceipt,
  privateDirectory,
  config,
  scientificContractDigest
}) {
  if (priorReceipt === null) return null;
  if (
    priorReceipt.validCompleteInterpretableResultProduced === true
    || priorReceipt.completeMetricsProduced === true
    || priorReceipt.status === "COMPLETE_RESULT_FROZEN"
  ) {
    throw new Error("m2_core_horizon_amount_complete_result_already_frozen");
  }
  if (
    priorReceipt.scientificContractDigest !== undefined
    && priorReceipt.scientificContractDigest !== null
    && priorReceipt.scientificContractDigest
      !== scientificContractDigest
  ) {
    throw new Error("m2_core_horizon_amount_scientific_contract_changed");
  }
  const failureClass = priorReceipt.failureClass
    ?? classifyRecoveryFailure(
      new Error(priorReceipt.errorCode ?? "legacy_infrastructure_failure"),
      priorReceipt.failureStage ?? priorReceipt.stage
    );
  const priorAssessment = classifyM2CoreHorizonAmountFailure({
    failureClass,
    completeMetricsProduced:
      priorReceipt.completeMetricsProduced === true,
    scientificContractChanged:
      priorReceipt.scientificContractChanged === true,
    partialOutcomeInspected:
      priorReceipt.partialOutcomeInspected === true,
    repeatedSameFailureWithoutFormalChainRegressionCoverage:
      priorReceipt
        .repeatedSameFailureWithoutFormalChainRegressionCoverage === true
  });
  if (!priorAssessment.retryAllowed) {
    throw new Error("m2_core_horizon_amount_recovery_boundary_blocked");
  }
  const attemptDirectory = path.join(
    privateDirectory,
    config.privateOutputs.attemptDirectory
  );
  await mkdir(attemptDirectory, { recursive: true });
  const archive = path.join(
    attemptDirectory,
    `${priorReceipt.attemptId}-invalidated.json`
  );
  const serialized = `${JSON.stringify(priorReceipt, null, 2)}\n`;
  try {
    await writeFile(
      archive,
      serialized,
      { encoding: "utf8", flag: "wx" }
    );
  } catch (error) {
    if (
      error?.code !== "EEXIST"
      || await readFile(archive, "utf8") !== serialized
    ) {
      throw error;
    }
  }
  const recoverySequence = Number(
    priorReceipt.recovery?.recoverySequence ?? 0
  ) + 1;
  return {
    status: "PRE_OUTCOME_INFRASTRUCTURE_RECOVERY_AUTHORIZED",
    boundaryId: "FIRST_VALID_COMPLETE_OUTCOME_BOUNDARY",
    recoverySequence,
    priorAttemptId: priorReceipt.attemptId,
    priorStage: priorReceipt.stage,
    priorFailureClass: failureClass,
    fixedRetryCountApplied: false,
    scientificContractChanged: false,
    partialOutcomeInspected: false
  };
}

async function buildPrivateManifest({
  preflight,
  inventoryBefore,
  authority,
  paths,
  counts,
  frozenLg01Digest,
  status,
  syntheticRecoverySmoke = false
}) {
  const bindings = {};
  for (const [key, filePath] of Object.entries(paths)) {
    bindings[key] = await fileBinding(filePath);
  }
  return {
    schema: "m2.current.core_horizon_amount.manifest.private.v0.1",
    experimentId: EXPERIMENT_ID,
    modelId: MODEL_ID,
    status: syntheticRecoverySmoke
      ? "SYNTHETIC_RECOVERY_SMOKE_COMPLETE"
      : "COMPLETE_RESULT_FROZEN",
    developmentStatus: status,
    executionHead: preflight.head,
    exactHeadCiRunId: preflight.ciRunId,
    sourceAuthorityStatus: inventoryBefore.sourceAuthorityStatus,
    sourceAuthority: {
      rowCount: authority.authority.rowCount,
      workCount: authority.authority.workCount,
      channelCount: authority.authority.channelCount,
      reversalRowCount: authority.authority.reversalRowCount
    },
    frozenLg01Digest,
    counts,
    outputBindings: bindings,
    candidateResultCount: 1,
    resultFrozen: !syntheticRecoverySmoke,
    syntheticRecoverySmoke,
    scientificWindowConsumed: !syntheticRecoverySmoke,
    retryAllowed: syntheticRecoverySmoke,
    privateIdentityPublished: false
  };
}

function trainingAndEvaluationOrigins({
  authorityStartMonth,
  labelMaturityCutoff,
  schedules
}) {
  const start = monthToSerial(authorityStartMonth) + 2;
  const end = monthToSerial(labelMaturityCutoff) - 3;
  const quarterly = [];
  for (let serial = start; serial <= end; serial += 3) {
    quarterly.push(serialToMonth(serial));
  }
  return [...new Set([
    ...quarterly,
    ...FAMILIES.flatMap((family) => schedules[family].origins)
  ])].filter((origin) => (
    origin >= authorityStartMonth
    && origin <= labelMaturityCutoff
  )).sort();
}

function assertPreregistration(config, source) {
  const required = [
    config.model.stableModelId,
    config.experiment.stableExperimentId,
    "B0",
    "B1",
    "B2",
    "B3",
    "1 + 3 × percentile²",
    "2,000"
  ];
  if (required.some((token) => !source.includes(token))) {
    throw new Error("m2_core_horizon_amount_preregistration_incomplete");
  }
}

function assertPortableSource(source) {
  if (
    /[A-Z]:[\\/]/u.test(source)
    || /(?:^|[\\/])Users[\\/]/u.test(source)
    || /\b[0-9a-f]{40}\b/iu.test(source)
  ) {
    throw new Error("m2_core_horizon_amount_source_not_portable");
  }
}

function assertRecoveryReadiness(value, expectedScientificDigest) {
  if (
    value?.schema
      !== "m2.current.core_horizon_amount."
        + "recovery_readiness.public.v0.1"
    || value?.status
      !== "M2_CHAM01_RECOVERY_READY_R0_FORMAL_CHAIN_PASS"
    || value?.experimentId !== EXPERIMENT_ID
    || value?.modelId !== MODEL_ID
    || value?.recoveryBoundaryId
      !== "FIRST_VALID_COMPLETE_OUTCOME_BOUNDARY"
    || value?.scientificContractDigest !== expectedScientificDigest
    || value?.scientificContractChanged !== false
    || value?.syntheticR0?.privateSourceRead !== false
    || value?.syntheticR0?.scientificWindowConsumed !== false
    || value?.syntheticR0?.temporaryOutputCleaned !== true
    || value?.syntheticR0?.armIds?.join(",") !== RAW_ARMS.join(",")
    || value?.syntheticR0?.horizonsMonths?.join(",")
      !== HORIZONS.join(",")
    || Object.values(value?.syntheticR0?.checks ?? {})
      .some((check) => check !== true)
    || value?.boundaries?.privateExecutionPerformed !== false
    || value?.boundaries?.productionAuthorized !== false
    || value?.boundaries?.pullRequestMergeAuthorized !== false
  ) {
    throw new Error(
      "m2_core_horizon_amount_recovery_readiness_invalid"
    );
  }
  assertM2CoreHorizonAmountPublicSafe(value);
  return true;
}

function assertPublicK1(value) {
  if (
    value.schema
      !== "m2.current.core_horizon_amount.k1_attribution.public.v0.1"
    || value.status
      !== "K1_ORIGIN_VISIBLE_SAME_CASE_ATTRIBUTION_COMPLETE"
    || value.cells.length !== 12
    || value.questions.length !== 9
    || value.boundaries.futureOutcomeUsedForGroupingSelectionOrRouting
      !== false
  ) {
    throw new Error("m2_core_horizon_amount_k1_public_invalid");
  }
  assertM2CoreHorizonAmountPublicSafe(value);
}

function assertPublicDevelopment(value) {
  if (
    value.schema
      !== "m2.current.core_horizon_amount.development.public.v0.1"
    || ![
      "M2_CORE_HORIZON_AMOUNT_DEVELOPMENT_PASS",
      "M2_CORE_HORIZON_AMOUNT_DEVELOPMENT_PARTIAL",
      "M2_CORE_HORIZON_AMOUNT_DEVELOPMENT_FAIL",
      "M2_CORE_HORIZON_AMOUNT_BLOCKED_SOURCE_AUTHORITY"
    ].includes(value.status)
    || value.bestRawArms.length !== 3
    || value.roles.operationalFallback !== "M2-WORK-OA03"
    || value.roles.operationalFallbackChanged !== false
    || value.roles.activeCandidate !== null
    || value.roles.approvedForAutomation !== null
    || value.boundaries.productionAuthorized !== false
  ) {
    throw new Error("m2_core_horizon_amount_development_public_invalid");
  }
  assertM2CoreHorizonAmountPublicSafe(value);
}

function capabilityInventory(root) {
  const catalog = loadCapabilityCatalog(path.join(
    root,
    "config/development-capability-catalog.v0.1.json"
  ));
  return evaluateCapability(catalog, CAPABILITY_ID, { repoRoot: root });
}

function privateOutputPaths(privateDirectory, config) {
  return Object.freeze({
    featureRows: path.join(
      privateDirectory,
      config.privateOutputs.featureRows
    ),
    frozenLg01Rows: path.join(
      privateDirectory,
      config.privateOutputs.frozenLg01Rows
    ),
    k1PairedRows: path.join(
      privateDirectory,
      config.privateOutputs.k1PairedRows
    ),
    predictionRows: path.join(
      privateDirectory,
      config.privateOutputs.predictionRows
    ),
    selectionRows: path.join(
      privateDirectory,
      config.privateOutputs.selectionRows
    ),
    evaluationRows: path.join(
      privateDirectory,
      config.privateOutputs.evaluationRows
    ),
    bootstrapRows: path.join(
      privateDirectory,
      config.privateOutputs.bootstrapRows
    )
  });
}

function resolvePrivateDirectory(root, relativePath) {
  if (
    path.isAbsolute(relativePath)
    || !relativePath.replaceAll("\\", "/")
      .startsWith("data/private-output/")
  ) {
    throw new Error("m2_core_horizon_amount_private_directory_invalid");
  }
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  const relative = path.relative(resolvedRoot, resolved);
  if (
    relative === ".."
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)
  ) {
    throw new Error("m2_core_horizon_amount_private_directory_escape");
  }
  return resolved;
}

function assertCapabilityScopedDirectory(
  capabilityDirectory,
  candidateDirectory
) {
  const base = path.resolve(capabilityDirectory);
  const candidate = path.resolve(candidateDirectory);
  const relative = path.relative(base, candidate);
  if (
    relative === ".."
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)
  ) {
    throw new Error(
      "m2_core_horizon_amount_capability_directory_escape"
    );
  }
  return true;
}

function repositoryRelative(root, filePath) {
  const relative = path.relative(path.resolve(root), path.resolve(filePath));
  if (
    relative === ".."
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)
  ) {
    throw new Error("m2_core_horizon_amount_path_escape");
  }
  return relative.replaceAll("\\", "/");
}

function runCommand(root, executable, args) {
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024
  });
  if (result.status !== 0) {
    const error = new Error(
      "m2_core_horizon_amount_subprocess_failed"
    );
    error.cause = {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr
    };
    throw error;
  }
  return result;
}

function lastJsonLine(value) {
  const lines = String(value).trim().split(/\r?\n/u);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index]);
    } catch {
      continue;
    }
  }
  throw new Error("m2_core_horizon_amount_subprocess_json_missing");
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

async function readNdjson(filePath) {
  const value = await readFile(filePath, "utf8");
  return value.split(/\r?\n/u).filter(Boolean).map(JSON.parse);
}

async function writeNdjson(filePath, rows) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(
    filePath,
    rows.map((row) => JSON.stringify(row)).join("\n") + "\n",
    "utf8"
  );
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(
    filePath,
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8"
  );
}

async function fileBinding(filePath) {
  const details = await stat(filePath);
  return {
    rowCount: filePath.endsWith(".ndjson")
      ? (await readFile(filePath, "utf8"))
        .split(/\r?\n/u).filter(Boolean).length
      : null,
    byteCount: details.size,
    sha256: await sha256File(filePath)
  };
}

async function sha256File(filePath) {
  return await new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
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

function sha256Json(value) {
  return crypto.createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function workKey(row) {
  return [
    row.standardWorkId,
    row.origin,
    Number(row.horizonMonths)
  ].join("\u0000");
}

function evaluationFeatureKey(row) {
  return [
    row.evaluationFamily,
    row.populationId,
    row.standardWorkId,
    row.origin,
    Number(row.horizonMonths)
  ].join("\u0000");
}

function headCashKey(row) {
  return [
    row.standardWorkId,
    row.origin
  ].join("\u0000");
}

function jsonExactlyEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function groupBy(values, keyOf) {
  const output = new Map();
  for (const value of values) {
    const key = keyOf(value);
    const rows = output.get(key) ?? [];
    rows.push(value);
    output.set(key, rows);
  }
  return output;
}

function summarizeCount(values, keyOf) {
  const counts = new Map();
  for (const value of values) {
    const key = keyOf(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].map(([key, count]) => ({ key, count }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

function range(values) {
  const finiteValues = values.filter(Number.isFinite);
  return finiteValues.length === 0
    ? { minimum: null, maximum: null }
    : {
      minimum: Math.min(...finiteValues),
      maximum: Math.max(...finiteValues)
    };
}

function compareRows(left, right) {
  return (
    String(left.evaluationFamily ?? "")
      .localeCompare(String(right.evaluationFamily ?? ""))
    || String(left.populationId ?? "")
      .localeCompare(String(right.populationId ?? ""))
    || Number(left.horizonMonths ?? 0) - Number(right.horizonMonths ?? 0)
    || String(left.origin ?? left.outerOrigin ?? "")
      .localeCompare(String(right.origin ?? right.outerOrigin ?? ""))
    || String(left.armId ?? "").localeCompare(String(right.armId ?? ""))
    || String(left.standardWorkId ?? "")
      .localeCompare(String(right.standardWorkId ?? ""))
  );
}

function stableSeed(...values) {
  const digest = crypto.createHash("sha256")
    .update(values.join("\u0000"))
    .digest();
  return digest.readUInt32BE(0) % 1000000;
}

function nullableSort(left, right) {
  const leftValue = Number.isFinite(left) ? left : Infinity;
  const rightValue = Number.isFinite(right) ? right : Infinity;
  return leftValue - rightValue;
}

function metric(value) {
  return Number.isFinite(value) ? Number(value).toFixed(6) : "不可计算";
}

function percent(value) {
  return Number.isFinite(value)
    ? `${(Number(value) * 100).toFixed(2)}%`
    : "不可计算";
}

function safeErrorCode(error) {
  return String(error?.message ?? "unknown_error")
    .replace(/[^a-zA-Z0-9_.:-]/gu, "_")
    .slice(0, 240);
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}
