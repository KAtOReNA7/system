import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
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
  allocateM2Oa03Trailing12,
  assessM2Oa03WorkEvidence,
  buildM2Oa03PopulationRows,
  compareM2Oa03FrozenOverlap,
  decimalToMinor,
  pairM2Oa03SameCaseRows,
  resolveM2Oa03CurrentScopeSchedules,
  runM2Oa03CurrentScopeFamily,
  scoreM2Oa03OccurrenceRows,
  scoreM2Oa03PointRows,
  validateM2Oa03CurrentScopeConfig
} from "../../src/domain/m2Current/oa03CurrentScopeReplication.js";
import {
  buildCoreLegacyOriginPopulation,
  buildCoreLegacyWorkCases,
  validateM2CoreLegacyPopulationConfig
} from "../../src/domain/m2Current/coreLegacyPopulation.js";
import {
  validateM2CoreLegacyHorizonRouterConfig
} from "../../src/domain/m2Current/coreLegacyHorizonRouter.js";
import {
  monthToSerial,
  serialToMonth
} from "../../src/domain/m2Current/coreRevenueManual.js";
import {
  forecastM2HumanAnchoredBase,
  learnM2HumanAnchoredParameters
} from "../../src/domain/m2Current/humanAnchored.js";
import {
  materializeM2CoreRevenueAuthority
} from "./core_revenue_manual_private.mjs";
import {
  rebuildFrozenCoreRevenueManualRows
} from "./core_legacy_population_private.mjs";

const CONFIG_PATH =
  "config/m2-current-oa03-replication.v0.1.json";
const BASE_CANDIDATE_CONFIG_PATH = "config/m2-current.v0.2.json";
const OA03_FORMULA_CONFIG_PATH = "config/m2-current.v0.3.json";
const CORE_POPULATION_CONFIG_PATH =
  "config/m2-current-core-legacy-population.v0.1.json";
const CHANNEL_ALLOCATION_CONFIG_PATH =
  "config/m2-current-core-legacy-horizon-router.v0.1.json";
const HUMAN_CONFIG_PATH =
  "config/m2-current-human-anchored.v0.1.json";
const HISTORICAL_OA03_ROWS =
  "data/private-output/m2-current-quality/"
  + "M2-current-occurrence-amount-candidate-cases-private-v0.3.ndjson";
const CAPABILITY_ID = "m2-oa03-current-scope-replication";
const EXPERIMENT_ID = "M2-EXP-OA03-CURRENT-SCOPE-REPLICATION-01";
const ACTUAL_ID =
  "M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01";
const FAMILY_IDS = Object.freeze([
  "PRIMARY_ROLLING",
  "STRICT_ROLLING"
]);
const POPULATION_IDS = Object.freeze(["CORE80", "CORE90"]);
const HORIZONS = Object.freeze([3, 6, 12]);

export async function runM2Oa03CurrentScopePublicDiagnostic({
  root,
  verify = false
}) {
  const [
    config,
    baseCandidateConfig,
    occurrenceAmountConfig,
    coreConfig,
    channelAllocationConfig,
    source
  ] = await Promise.all([
    readJson(path.join(root, CONFIG_PATH)),
    readJson(path.join(root, BASE_CANDIDATE_CONFIG_PATH)),
    readJson(path.join(root, OA03_FORMULA_CONFIG_PATH)),
    readJson(path.join(root, CORE_POPULATION_CONFIG_PATH)),
    readJson(path.join(root, CHANNEL_ALLOCATION_CONFIG_PATH)),
    readFile(path.join(
      root,
      "scripts/m2-current/oa03_current_scope_replication_mode.mjs"
    ), "utf8")
  ]);
  validateM2Oa03CurrentScopeConfig(config);
  validateM2CoreLegacyPopulationConfig(coreConfig);
  validateM2CoreLegacyHorizonRouterConfig(channelAllocationConfig);
  assertCanonicalAllocationIdentity({
    config,
    channelAllocationConfig
  });
  assertFormulaConfigIdentity({
    config,
    baseCandidateConfig,
    occurrenceAmountConfig
  });
  assertPortableImplementation(source);
  const python = runCommand(root, process.execPath, [
    "scripts/run-codex-python.mjs",
    "scripts/m2-current/materialize_human_anchored_cases.py",
    "--oa03-base-self-test"
  ]);
  const pythonFixture = lastJsonLine(python.stdout);
  if (
    pythonFixture.status
      !== "OA03_BASE_MATERIALIZATION_SELF_TEST_PASSED"
    || pythonFixture.deterministicReplay !== true
    || pythonFixture.futureLabelRead !== false
  ) {
    throw new Error("m2_oa03_base_materialization_self_test_failed");
  }
  const development = await readJsonIfPresent(path.join(
    root,
    config.publicOutputs.developmentJson
  ));
  const allocation = await readJsonIfPresent(path.join(
    root,
    config.publicOutputs.allocationJson
  ));
  if ((development === null) !== (allocation === null)) {
    throw new Error("m2_oa03_public_aggregate_pair_incomplete");
  }
  if (development !== null) {
    assertM2Oa03PublicDevelopment(development, config);
    assertM2Oa03PublicAllocation(allocation, config);
  }
  const result = Object.freeze({
    status: development === null
      ? "OA03_P1_PUBLIC_IMPLEMENTATION_READY"
      : "OA03_PUBLIC_AGGREGATES_VALID",
    experimentId: EXPERIMENT_ID,
    formulaIdentity:
      config.modelIdentity.identityResolutionStatus,
    pythonBaseMaterialization:
      pythonFixture.status,
    deterministicReplay: pythonFixture.deterministicReplay,
    exactCentAllocation: true,
    privateEvaluationPerformed: development !== null,
    privateSourceReadByDiagnostic: false,
    publicAggregateStatus:
      development?.technicalReplication?.status ?? null,
    verify
  });
  if (verify && result.formulaIdentity
    !== "CANONICAL_FORMULA_UNIQUELY_RESOLVED") {
    throw new Error("m2_oa03_public_formula_identity_unresolved");
  }
  return result;
}

export async function prepareM2Oa03CurrentScopeRuntimeAuthorization({
  root
}) {
  const config = await readJson(path.join(root, CONFIG_PATH));
  validateM2Oa03CurrentScopeConfig(config);
  const preflight = verifyM2Oa03GitAndCiPreflight({
    root,
    allowedDirtyPaths: []
  });
  const inventory = capabilityInventory(root);
  if (
    inventory.sourceAuthorityStatus !== "SOURCE_AUTHORITY_AVAILABLE"
    || inventory.unavailableTools.length > 0
  ) {
    throw new Error(
      inventory.sourceAuthorityStatus !== "SOURCE_AUTHORITY_AVAILABLE"
        ? "m2_oa03_source_authority_blocked"
        : "m2_oa03_required_tool_blocked"
    );
  }
  const privateDirectory = resolvePrivateDirectory(
    root,
    config.privateOutputs.directory
  );
  await mkdir(privateDirectory, { recursive: true });
  const authorizationPath = path.join(
    privateDirectory,
    config.privateOutputs.runtimeAuthorization
  );
  const prior = await readJsonIfPresent(authorizationPath);
  let recovery = null;
  if (prior !== null) {
    if (
      prior.status === "AUTHORIZED_FOR_ONE_LOGICAL_EXECUTION"
      && prior.executionHead === preflight.head
      && prior.prNumber === preflight.prNumber
      && prior.exactHeadCiRunId === preflight.ciRunId
    ) {
      return Object.freeze({
        status: "OA03_RUNTIME_AUTHORIZATION_ALREADY_READY",
        experimentId: EXPERIMENT_ID,
        executionHead: preflight.head,
        prNumber: preflight.prNumber,
        exactHeadCiRunId: preflight.ciRunId,
        sourceAuthorityStatus: inventory.sourceAuthorityStatus,
        derivedCacheStatus: inventory.derivedCacheStatus,
        historicalReceiptStatus: inventory.historicalReceiptStatus
      });
    }
    const priorReceipt = await readJsonIfPresent(path.join(
      privateDirectory,
      config.privateOutputs.attemptReceipt
    ));
    recovery = resolveM2Oa03RuntimeAuthorizationRecovery({
      priorAuthorization: prior,
      priorReceipt,
      preflight
    });
    const attemptDirectory = path.join(
      privateDirectory,
      config.privateOutputs.attemptDirectory
    );
    await mkdir(attemptDirectory, { recursive: true });
    const archivePath = path.join(
      attemptDirectory,
      `${recovery.priorAttemptId}-runtime-authorization.json`
    );
    const archived = await readJsonIfPresent(archivePath);
    if (archived === null) {
      await writeFile(
        archivePath,
        `${JSON.stringify(prior, null, 2)}\n`,
        { encoding: "utf8", flag: "wx" }
      );
    } else if (JSON.stringify(archived) !== JSON.stringify(prior)) {
      throw new Error(
        "m2_oa03_runtime_authorization_archive_conflict"
      );
    }
  }
  const authorization = {
    schema:
      "m2.current.oa03_runtime_authorization.private.v0.1",
    tracked: false,
    status: "AUTHORIZED_FOR_ONE_LOGICAL_EXECUTION",
    experimentId: EXPERIMENT_ID,
    capabilityId: CAPABILITY_ID,
    command:
      "npm run develop:m2:current:oa03-current-scope-replication",
    executionHead: preflight.head,
    branch: preflight.branch,
    upstream: preflight.upstream,
    prNumber: preflight.prNumber,
    prUrl: preflight.prUrl,
    exactHeadCiRunId: preflight.ciRunId,
    exactHeadCiUrl: preflight.ciUrl,
    linuxConclusion: preflight.linux,
    windowsConclusion: preflight.windows,
    sourceAuthorityStatus: inventory.sourceAuthorityStatus,
    derivedCacheStatusBefore: inventory.derivedCacheStatus,
    historicalReceiptStatusBefore: inventory.historicalReceiptStatus,
    safeToRebuildDerivedCache: inventory.safeToRebuildDerivedCache,
    singleLogicalExecution: true,
    validResultFreezesAuthorization: true,
    infrastructureRecovery: recovery === null
      ? null
      : {
        status:
          "ROTATED_AFTER_INFRASTRUCTURE_FAILURE_BEFORE_RESULT",
        priorAttemptId: recovery.priorAttemptId,
        priorExecutionHead: recovery.priorExecutionHead,
        priorExactHeadCiRunId: recovery.priorExactHeadCiRunId,
        modelFormulaChanged: false,
        parameterGridChanged: false,
        evaluationGateChanged: false
      },
    laterOrFinalHoldoutAuthorized: false,
    providerAuthorized: false,
    databaseAuthorized: false,
    productionAuthorized: false,
    releaseAuthorized: false
  };
  await writeFile(
    authorizationPath,
    `${JSON.stringify(authorization, null, 2)}\n`,
    prior === null
      ? { encoding: "utf8", flag: "wx" }
      : { encoding: "utf8" }
  );
  return Object.freeze({
    status: "OA03_RUNTIME_AUTHORIZATION_READY",
    experimentId: EXPERIMENT_ID,
    executionHead: preflight.head,
    prNumber: preflight.prNumber,
    exactHeadCiRunId: preflight.ciRunId,
    sourceAuthorityStatus: inventory.sourceAuthorityStatus,
    derivedCacheStatus: inventory.derivedCacheStatus,
    historicalReceiptStatus: inventory.historicalReceiptStatus
  });
}

export function verifyM2Oa03GitAndCiPreflight({
  root,
  allowedDirtyPaths = [],
  command = runCommand
}) {
  const status = command(root, "git", [
    "status",
    "--porcelain",
    "--untracked-files=all"
  ]).stdout.trimEnd();
  const dirtyPaths = status === ""
    ? []
    : status.split(/\r?\n/u).map(
      (line) => line.slice(3).trim().replaceAll("\\", "/")
    );
  const allowed = new Set(
    allowedDirtyPaths.map((item) => item.replaceAll("\\", "/"))
  );
  const unexpected = dirtyPaths.filter((item) => !allowed.has(item));
  if (unexpected.length > 0) {
    throw new Error("m2_oa03_unexpected_dirty_worktree");
  }
  const head = command(root, "git", ["rev-parse", "HEAD"]).stdout.trim();
  const upstream = command(
    root,
    "git",
    ["rev-parse", "@{upstream}"]
  ).stdout.trim();
  if (head !== upstream) {
    throw new Error("m2_oa03_head_not_equal_upstream");
  }
  const branch = command(
    root,
    "git",
    ["branch", "--show-current"]
  ).stdout.trim();
  const pr = JSON.parse(command(root, "gh", [
    "pr",
    "view",
    "--json",
    "number,state,isDraft,mergedAt,headRefOid,baseRefName,url"
  ]).stdout);
  if (
    pr.state !== "OPEN"
    || pr.isDraft !== true
    || pr.mergedAt !== null
    || pr.headRefOid !== head
    || pr.baseRefName !== "main"
  ) {
    throw new Error("m2_oa03_draft_pr_preflight_failed");
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
  ]).stdout);
  const successful = runs.find((item) => (
    item.headSha === head
    && item.workflowName === "CI"
    && item.status === "completed"
    && item.conclusion === "success"
  ));
  if (!successful) {
    throw new Error("m2_oa03_exact_head_ci_not_successful");
  }
  const workflow = JSON.parse(command(root, "gh", [
    "run",
    "view",
    String(successful.databaseId),
    "--json",
    "headSha,status,conclusion,jobs,url"
  ]).stdout);
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
    throw new Error("m2_oa03_exact_head_dual_ci_not_successful");
  }
  return Object.freeze({
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
    dirtyTaskImplementationPaths: Object.freeze(dirtyPaths)
  });
}

export async function runM2Oa03CurrentScopePrivateReplication({
  root
}) {
  const [
    config,
    baseCandidateConfig,
    occurrenceAmountConfig,
    coreConfig,
    channelAllocationConfig,
    humanConfig
  ] = await Promise.all([
    readJson(path.join(root, CONFIG_PATH)),
    readJson(path.join(root, BASE_CANDIDATE_CONFIG_PATH)),
    readJson(path.join(root, OA03_FORMULA_CONFIG_PATH)),
    readJson(path.join(root, CORE_POPULATION_CONFIG_PATH)),
    readJson(path.join(root, CHANNEL_ALLOCATION_CONFIG_PATH)),
    readJson(path.join(root, HUMAN_CONFIG_PATH))
  ]);
  validateM2Oa03CurrentScopeConfig(config);
  validateM2CoreLegacyPopulationConfig(coreConfig);
  validateM2CoreLegacyHorizonRouterConfig(channelAllocationConfig);
  assertCanonicalAllocationIdentity({
    config,
    channelAllocationConfig
  });
  assertFormulaConfigIdentity({
    config,
    baseCandidateConfig,
    occurrenceAmountConfig
  });
  const preflight = verifyM2Oa03GitAndCiPreflight({
    root,
    allowedDirtyPaths: []
  });
  const privateDirectory = resolvePrivateDirectory(
    root,
    config.privateOutputs.directory
  );
  await mkdir(privateDirectory, { recursive: true });
  const authorization = await readJson(path.join(
    privateDirectory,
    config.privateOutputs.runtimeAuthorization
  ));
  assertRuntimeAuthorization(authorization, preflight);
  const inventoryBefore = capabilityInventory(root);
  if (
    inventoryBefore.sourceAuthorityStatus
      !== "SOURCE_AUTHORITY_AVAILABLE"
    || inventoryBefore.unavailableTools.length > 0
  ) {
    throw new Error(
      inventoryBefore.sourceAuthorityStatus
        !== "SOURCE_AUTHORITY_AVAILABLE"
        ? "m2_oa03_source_authority_blocked"
        : "m2_oa03_required_tool_blocked"
    );
  }
  const receiptPath = path.join(
    privateDirectory,
    config.privateOutputs.attemptReceipt
  );
  const priorReceipt = await readJsonIfPresent(receiptPath);
  if (
    priorReceipt?.validCompleteInterpretableResultProduced === true
    || priorReceipt?.status === "COMPLETE_RESULT_FROZEN"
  ) {
    throw new Error("m2_oa03_complete_result_already_frozen");
  }
  const attempt = await beginAttempt({
    privateDirectory,
    config,
    preflight,
    inventoryBefore
  });
  let completeResultProduced = false;
  let stage = "PRIVATE_EXECUTION_STARTED";
  try {
    stage = "SOURCE_AUTHORITY_MATERIALIZATION";
    const authority = await materializeM2CoreRevenueAuthority({ root });
    const schedules = resolveM2Oa03CurrentScopeSchedules({
      config,
      authorityStartMonth: authority.authorityStartMonth,
      labelMaturityCutoff: authority.labelMaturityCutoff
    });
    const featureCache = new Map();
    const featureRowsForOrigin = (origin) => {
      if (!featureCache.has(origin)) {
        featureCache.set(
          origin,
          authority.featureMonthlyRowsForOrigin(origin)
        );
      }
      return featureCache.get(origin);
    };
    const origins = [...new Set(FAMILY_IDS.flatMap(
      (family) => schedules[family].origins
    ))].sort();
    stage = "CURRENT_SCOPE_CASE_MATERIALIZATION";
    const cases = buildCoreLegacyWorkCases({
      origins,
      horizons: HORIZONS,
      finalMonthlyRows: authority.finalMonthlyRows,
      featureMonthlyRowsForOrigin: featureRowsForOrigin,
      config: coreConfig
    });
    const populationCache = new Map(origins.map((origin) => [
      origin,
      buildCoreLegacyOriginPopulation({
        origin,
        monthlyRows: featureRowsForOrigin(origin),
        minimumCompleteMonths:
          config.scope.minimumWorkCompleteBillMonths,
        thresholds: config.scope.coreSelection.thresholds,
        topCounts: coreConfig.coreSelection.topDiagnostics
      })
    ]));
    const baseInputRows = buildBaseMaterializationInputs({
      schedules,
      cases,
      populationCache
    });
    if (baseInputRows.length === 0) {
      throw new Error("m2_oa03_no_legal_origin_cases");
    }
    const baseInputPath = path.join(
      privateDirectory,
      config.privateOutputs.baseMaterializationInput
    );
    const baseRowsPath = path.join(
      privateDirectory,
      config.privateOutputs.baseMaterializationRows
    );
    await writeNdjson(baseInputPath, baseInputRows);
    stage = "B4_BASE_MATERIALIZATION";
    const materialization = runCommand(root, process.execPath, [
      "scripts/run-codex-python.mjs",
      "scripts/m2-current/materialize_human_anchored_cases.py",
      "--oa03-base-materialize",
      "--input",
      repositoryRelative(root, baseInputPath),
      "--output",
      repositoryRelative(root, baseRowsPath)
    ]);
    const baseReceipt = lastJsonLine(materialization.stdout);
    if (
      baseReceipt.status !== "OA03_BASE_MATERIALIZATION_COMPLETE"
      || baseReceipt.outputRowCount < 1
    ) {
      throw new Error("m2_oa03_base_materialization_incomplete");
    }
    const baseRows = await readNdjson(baseRowsPath);
    stage = "OA03_FAMILY_FITTING";
    const familyResults = Object.fromEntries(FAMILY_IDS.map((family) => [
      family,
      runM2Oa03CurrentScopeFamily({
        evaluationFamily: family,
        baseRows: baseRows.filter(
          (row) => row.evaluationFamily === family
        ),
        baseCandidateConfig,
        occurrenceAmountConfig,
        experimentConfig: config
      })
    ]));
    const candidatePopulationRows = buildCandidatePopulationRows(
      familyResults
    );
    stage = "COMPARATOR_REBUILD";
    const comparators = buildComparatorRows({
      config,
      coreConfig,
      humanConfig,
      schedules,
      cases,
      authority,
      featureRowsForOrigin,
      familyResults
    });
    const comparatorPath = path.join(
      privateDirectory,
      config.privateOutputs.comparatorRows
    );
    await writeNdjson(comparatorPath, comparators.rows);
    stage = "WORK_TOTAL_EVALUATION";
    const workEvaluation = buildWorkEvaluation({
      config,
      schedules,
      cases,
      candidateRows: candidatePopulationRows,
      comparatorRows: comparators.rows
    });
    stage = "HISTORICAL_OVERLAP_DIAGNOSTIC";
    const overlap = await buildFrozenOverlap({
      root,
      currentRows: familyResults.PRIMARY_ROLLING.evaluationRows
    });
    stage = "CHANNEL_ALLOCATION";
    const allocation = buildAllocationEvaluation({
      config,
      channelAllocationConfig,
      schedules,
      cases,
      populationCache,
      finalMonthlyRows: authority.finalMonthlyRows,
      candidateRows: candidatePopulationRows,
      comparatorRows: comparators.rows
    });
    const technicalStatus = overlap.status === "SEMANTIC_REPLAY_MISMATCH"
      ? "OA03_CURRENT_SCOPE_REPLICATION_SEMANTIC_MISMATCH"
      : "OA03_CURRENT_SCOPE_REPLICATION_COMPLETE";
    const summaryStatus = summarizeWorkStatus(
      technicalStatus,
      workEvaluation.horizonDecisions
    );
    const development = buildPublicDevelopment({
      config,
      preflight,
      authority,
      schedules,
      cases,
      familyResults,
      comparators,
      workEvaluation,
      overlap,
      technicalStatus,
      summaryStatus,
      inventoryBefore,
      baseReceipt
    });
    const allocationPublic = buildPublicAllocation({
      config,
      preflight,
      allocation,
      technicalStatus
    });
    assertM2Oa03PublicDevelopment(development, config);
    assertM2Oa03PublicAllocation(allocationPublic, config);
    stage = "PRIVATE_OUTPUT_FREEZE";
    const workPredictionRows = FAMILY_IDS.flatMap((family) => (
      familyResults[family].fitRows.map((row) => ({
        schema:
          "m2.current.oa03_work_prediction.private.v0.1",
        experimentId: EXPERIMENT_ID,
        evaluationFamily: family,
        modelId: "M2-WORK-OA03",
        ...row,
        evaluationEligible:
          row.origin >= config.rollingEvaluation
            .schedules[family].evaluationStartsAt
      }))
    ));
    const evaluationRows = [
      ...workEvaluation.privateRows,
      ...allocation.privateEvaluationRows
    ];
    const bootstrapRows = [
      ...workEvaluation.bootstrapRows,
      ...allocation.bootstrapRows
    ];
    const privatePaths = {
      workPredictions: path.join(
        privateDirectory,
        config.privateOutputs.workPredictions
      ),
      channelAllocations: path.join(
        privateDirectory,
        config.privateOutputs.channelAllocations
      ),
      evaluationRows: path.join(
        privateDirectory,
        config.privateOutputs.evaluationRows
      ),
      bootstrapRows: path.join(
        privateDirectory,
        config.privateOutputs.bootstrapRows
      )
    };
    await Promise.all([
      writeNdjson(privatePaths.workPredictions, workPredictionRows),
      writeNdjson(
        privatePaths.channelAllocations,
        allocation.privateRows
      ),
      writeNdjson(privatePaths.evaluationRows, evaluationRows),
      writeNdjson(privatePaths.bootstrapRows, bootstrapRows)
    ]);
    const manifest = await buildPrivateManifest({
      config,
      preflight,
      authority,
      inventoryBefore,
      baseReceipt,
      paths: {
        baseMaterializationInput: baseInputPath,
        baseMaterializationRows: baseRowsPath,
        comparatorRows: comparatorPath,
        ...privatePaths
      },
      counts: {
        baseInputRows: baseInputRows.length,
        baseRows: baseRows.length,
        workPredictionRows: workPredictionRows.length,
        candidateEvaluationRows: candidatePopulationRows.length,
        comparatorRows: comparators.rows.length,
        channelAllocationRows: allocation.privateRows.length,
        evaluationRows: evaluationRows.length,
        bootstrapRows: bootstrapRows.length
      }
    });
    const manifestPath = path.join(
      privateDirectory,
      config.privateOutputs.manifest
    );
    await writeFile(
      manifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8"
    );
    stage = "PUBLIC_AGGREGATE_FREEZE";
    await Promise.all([
      writeJson(
        path.join(root, config.publicOutputs.developmentJson),
        development
      ),
      writeJson(
        path.join(root, config.publicOutputs.allocationJson),
        allocationPublic
      )
    ]);
    completeResultProduced = true;
    await completeAttempt({
      attempt,
      receiptPath,
      preflight,
      manifestPath,
      development,
      allocation: allocationPublic,
      counts: manifest.counts
    });
    return Object.freeze({
      status: "OA03_CURRENT_SCOPE_FIRST_COMPLETE_RESULT_FROZEN",
      experimentId: EXPERIMENT_ID,
      technicalReplicationStatus: technicalStatus,
      summaryStatus,
      workHorizonDecisions: development.workHorizonDecisions,
      allocationHorizonDecisions:
        allocationPublic.horizonDecisions,
      executionHead: preflight.head,
      exactHeadCiRunId: preflight.ciRunId,
      validCompleteInterpretableResultProduced: true,
      retryAllowed: false
    });
  } catch (error) {
    await failAttempt({
      attempt,
      receiptPath,
      preflight,
      stage,
      error,
      completeResultProduced
    });
    throw error;
  }
}

function buildBaseMaterializationInputs({
  schedules,
  cases,
  populationCache
}) {
  const workCasesByOriginWork = groupBy(
    cases.workCases,
    (row) => `${row.origin}\u0000${row.standardWorkId}`
  );
  const output = [];
  for (const family of FAMILY_IDS) {
    const legal = new Set(schedules[family].legalCells.map(
      (row) => `${row.origin}\u0000${row.horizonMonths}`
    ));
    for (const origin of schedules[family].origins) {
      const population = populationCache.get(origin);
      if (!population) continue;
      const pairsByWork = groupBy(
        population.eligiblePairs,
        (row) => row.standardWorkId
      );
      for (const [standardWorkId, pairs] of pairsByWork) {
        const workCases = (
          workCasesByOriginWork.get(
            `${origin}\u0000${standardWorkId}`
          ) ?? []
        ).filter((row) => legal.has(
          `${origin}\u0000${row.horizonMonths}`
        ));
        if (workCases.length === 0) continue;
        const representative = workCases[0];
        output.push({
          schema:
            "m2.current.oa03_base_materialization_input.private.v0.1",
          experimentId: EXPERIMENT_ID,
          evaluationFamily: family,
          standardWorkId,
          origin,
          core80: representative.core80 === true,
          core90: representative.core90 === true,
          workCompleteMonthCount:
            representative.observedSalesAgeMonths,
          channels: pairs.map((pair) => ({
            channelUid: pair.channelUid,
            firstPositiveMonth: pair.firstPositiveMonth,
            monthly: denseMonthlyRows(
              pair.monthlyCashBySerial,
              pair.firstPositiveSerial,
              monthToSerial(origin)
            )
          })),
          cases: workCases.map((row) => ({
            horizonMonths: row.horizonMonths,
            labelAvailableAsOf: row.labelAvailableAsOf,
            actualDefinitionId: ACTUAL_ID,
            actual: row.actual,
            actualPositive: row.actualPositive,
            actualReversal: row.actualReversal
          }))
        });
      }
    }
  }
  return output.sort(comparePrivateCase);
}

function buildCandidatePopulationRows(familyResults) {
  const output = [];
  for (const family of FAMILY_IDS) {
    for (const populationId of POPULATION_IDS) {
      output.push(...buildM2Oa03PopulationRows(
        familyResults[family].evaluationRows,
        populationId
      ).map((row) => Object.freeze({
        ...row,
        grain: "WORK_TOTAL",
        modelId: "M2-WORK-OA03"
      })));
    }
  }
  return output.sort(comparePrivateCase);
}

function buildComparatorRows({
  config,
  coreConfig,
  humanConfig,
  schedules,
  cases,
  authority,
  featureRowsForOrigin,
  familyResults
}) {
  const primaryKeys = new Set(
    familyResults.PRIMARY_ROLLING.evaluationRows.map(workKey)
  );
  const strictKeys = new Set(
    familyResults.STRICT_ROLLING.evaluationRows.map(workKey)
  );
  const channelCaseIndex = new Map(cases.channelCases.map((row) => [
    channelKey(row),
    row
  ]));
  const coreRevenue = rebuildFrozenCoreRevenueManualRows({
    config: coreConfig,
    origins: [...new Set(FAMILY_IDS.flatMap(
      (family) => schedules[family].origins
    ))].sort(),
    featureRows: featureRowsForOrigin,
    authorityStartMonth: authority.authorityStartMonth,
    primaryKeys,
    strictKeys,
    channelCaseIndex
  });
  const crmrRows = coreRevenue.rows.filter((row) => (
    POPULATION_IDS.includes(row.populationId)
    && HORIZONS.includes(Number(row.horizonMonths))
  ));
  const learnedGlobal = buildStrictLearnedGlobalRows({
    config,
    humanConfig,
    schedule: schedules.STRICT_ROLLING,
    cases
  });
  return Object.freeze({
    rows: Object.freeze([
      ...crmrRows,
      ...learnedGlobal.rows
    ].sort(comparePrivateCase)),
    audit: Object.freeze({
      coreRevenueManual: coreRevenue.audit,
      learnedGlobal: learnedGlobal.audit,
      primaryLearnedGlobalStatus:
        "NOT_RECONSTRUCTABLE_CANONICAL_PRIMARY_IS_36_MONTH_CROSS_WORK",
      secondaryManualRuleAvailableForPrimary: crmrRows.some(
        (row) => row.evaluationFamily === "PRIMARY_ROLLING"
      )
    })
  });
}

function buildStrictLearnedGlobalRows({
  config,
  humanConfig,
  schedule,
  cases
}) {
  const legal = new Set(schedule.legalCells.map(
    (row) => `${row.origin}\u0000${row.horizonMonths}`
  ));
  const rows = cases.workCases.filter((row) => (
    legal.has(`${row.origin}\u0000${row.horizonMonths}`)
  )).sort(comparePrivateCase);
  const channelCasesByWork = groupBy(
    cases.channelCases.filter((row) => (
      legal.has(`${row.origin}\u0000${row.horizonMonths}`)
    )),
    workKey
  );
  const output = [];
  const selections = [];
  const origins = [...new Set(rows.map((row) => row.origin))]
    .sort()
    .filter((origin) => origin >= schedule.evaluationStartsAt);
  for (const outerOrigin of origins) {
    const training = rows.filter((row) => (
      row.origin < outerOrigin
      && row.labelAvailableAsOf <= outerOrigin
    ));
    const validation = rows.filter(
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
    const maximumLabelAvailableAsOf = training
      .map((row) => row.labelAvailableAsOf)
      .sort()
      .at(-1);
    if (maximumLabelAvailableAsOf > outerOrigin) {
      throw new Error("m2_oa03_lg01_future_label_read");
    }
    selections.push({
      outerOrigin,
      status: "RECONSTRUCTED_CURRENT_STRICT_TRAINING",
      trainingRowCount: training.length,
      trainingWorkCount: new Set(training.map(
        (row) => row.standardWorkId
      )).size,
      validationRowCount: validation.length,
      maximumLabelAvailableAsOf,
      parameters: fit.parameters
    });
    for (const row of validation) {
      const prediction = forecastM2HumanAnchoredBase(
        row,
        fit.parameters
      );
      const sourceChannels = channelCasesByWork.get(workKey(row)) ?? [];
      const components = new Map(
        prediction.channelComponents.map((item) => [
          item.channelUid,
          item.forecast36 * prediction.horizonScale
        ])
      );
      for (const populationId of POPULATION_IDS) {
        if (!belongsToPopulation(row, populationId)) continue;
        const channelRows = sourceChannels.map((channel) => {
          if (!components.has(channel.channelUid)) {
            throw new Error(
              "m2_oa03_lg01_mature_channel_component_missing"
            );
          }
          return {
            schema:
              "m2.current.oa03_comparator_row.private.v0.1",
            modelId: "M2-WORK-LG01",
            evaluationFamily: "STRICT_ROLLING",
            populationId,
            grain: "WORK_CHANNEL",
            standardWorkId: channel.standardWorkId,
            channelUid: channel.channelUid,
            origin: channel.origin,
            horizonMonths: channel.horizonMonths,
            pointEstimate: components.get(channel.channelUid),
            actual: channel.actual,
            caseKey: channelKey(channel),
            trainingSupportMode: "FULL_MATURE_TRAINING_SUPPORT",
            maximumLabelAvailableAsOf
          };
        });
        output.push(...channelRows);
        output.push({
          schema: "m2.current.oa03_comparator_row.private.v0.1",
          modelId: "M2-WORK-LG01",
          evaluationFamily: "STRICT_ROLLING",
          populationId,
          grain: "WORK_TOTAL",
          standardWorkId: row.standardWorkId,
          channelUid: null,
          origin: row.origin,
          horizonMonths: row.horizonMonths,
          pointEstimate: prediction.positivePointEstimate,
          actual: row.actual,
          caseKey: workKey(row),
          trainingSupportMode: "FULL_MATURE_TRAINING_SUPPORT",
          maximumLabelAvailableAsOf
        });
      }
    }
  }
  return Object.freeze({
    rows: Object.freeze(output.sort(comparePrivateCase)),
    selections: Object.freeze(selections),
    audit: Object.freeze({
      status: output.length > 0
        ? "STRICT_ROLLING_REBUILT_FROM_CURRENT_AUTHORITY_AND_CANONICAL_FORMULA"
        : "NOT_RECONSTRUCTABLE",
      evaluationRowCount: output.length,
      selectionCount: selections.length,
      futureLabelRead: false,
      formulaOrGridChanged: false,
      primaryStatus:
        "NOT_RECONSTRUCTABLE_CANONICAL_PRIMARY_IS_36_MONTH_CROSS_WORK"
    })
  });
}

function buildWorkEvaluation({
  config,
  schedules,
  cases,
  candidateRows,
  comparatorRows
}) {
  const cells = [];
  const privateRows = [];
  const bootstrapRows = [];
  for (const family of FAMILY_IDS) {
    for (const populationId of POPULATION_IDS) {
      for (const horizonMonths of HORIZONS) {
        const candidate = candidateRows.filter((row) => (
          row.evaluationFamily === family
          && row.populationId === populationId
          && row.horizonMonths === horizonMonths
        ));
        const candidateMetrics = scoreM2Oa03PointRows(candidate);
        const occurrence = scoreM2Oa03OccurrenceRows(candidate);
        const coverage = buildCoverageCell({
          schedule: schedules[family],
          workCases: cases.workCases,
          candidate,
          populationId,
          horizonMonths
        });
        const comparisons = [];
        for (const modelId of [
          "M2-WORK-LG01",
          "M2-WORK-CRMR01"
        ]) {
          const baseline = comparatorRows.filter((row) => (
            row.modelId === modelId
            && row.grain === "WORK_TOTAL"
            && row.evaluationFamily === family
            && row.populationId === populationId
            && Number(row.horizonMonths) === horizonMonths
          ));
          const paired = pairM2Oa03SameCaseRows(candidate, baseline);
          const evidence = assessM2Oa03WorkEvidence({
            pairedRows: paired.rows,
            config,
            seedOffset: stableSeedOffset(
              "WORK_TOTAL",
              family,
              populationId,
              horizonMonths,
              modelId
            )
          });
          const baselineMetrics = scoreM2Oa03PointRows(
            paired.rows.map((row) => ({
              ...row,
              pointEstimate: row.baselinePointEstimate
            }))
          );
          const pairedCandidateMetrics = scoreM2Oa03PointRows(
            paired.rows.map((row) => ({
              ...row,
              pointEstimate: row.candidatePointEstimate
            }))
          );
          comparisons.push(publicComparison({
            modelId,
            paired,
            evidence,
            candidateMetrics: pairedCandidateMetrics,
            baselineMetrics,
            config
          }));
          privateRows.push(...paired.rows.map((row) => ({
            schema:
              "m2.current.oa03_work_comparison_row.private.v0.1",
            experimentId: EXPERIMENT_ID,
            comparisonModelId: modelId,
            grain: "WORK_TOTAL",
            ...row
          })));
          bootstrapRows.push({
            schema:
              "m2.current.oa03_bootstrap_summary.private.v0.1",
            experimentId: EXPERIMENT_ID,
            grain: "WORK_TOTAL",
            evaluationFamily: family,
            populationId,
            horizonMonths,
            comparisonModelId: modelId,
            ...evidence.bootstrap
          });
        }
        cells.push(Object.freeze({
          evaluationFamily: family,
          populationId,
          horizonMonths,
          coverage,
          metrics: publicMetric(candidateMetrics, config),
          occurrence: publicOccurrence(
            occurrence,
            candidateMetrics,
            config
          ),
          conditionalPositiveAmount: Object.freeze({
            status: "CAPABILITY_NOT_STORED",
            reverseEngineeredFromPointPrediction: false
          }),
          rawCandidateSelection: Object.freeze({
            evaluatedCaseCount: candidate.length,
            twoPartRuleCaseCount: candidate.filter(
              (row) => row.selectedCandidateId
                !== config.formula.baseCandidateId
            ).length,
            baseFallbackCaseCount: candidate.filter(
              (row) => row.selectedCandidateId
                === config.formula.baseCandidateId
            ).length,
            selectedPipelineMaskApplied: false
          }),
          comparisons: Object.freeze(comparisons)
        }));
      }
    }
  }
  const horizonDecisions = HORIZONS.map((horizonMonths) => (
    decideWorkHorizon(cells, horizonMonths, config)
  ));
  return Object.freeze({
    cells: Object.freeze(cells),
    horizonDecisions: Object.freeze(horizonDecisions),
    privateRows: Object.freeze(privateRows),
    bootstrapRows: Object.freeze(bootstrapRows)
  });
}

function buildCoverageCell({
  schedule,
  workCases,
  candidate,
  populationId,
  horizonMonths
}) {
  const evaluationOrigins = new Set(schedule.evaluationOrigins);
  const legal = new Set(schedule.legalCells.filter(
    (row) => row.evaluationOrigin
      && row.horizonMonths === horizonMonths
  ).map((row) => row.origin));
  const universe = workCases.filter((row) => (
    row.horizonMonths === horizonMonths
    && evaluationOrigins.has(row.origin)
    && legal.has(row.origin)
  ));
  const selectedKeys = new Set(candidate.map(workKey));
  const selected = universe.filter((row) => selectedKeys.has(workKey(row)));
  const originVisibleTotal = sum(universe.map(
    (row) => Math.max(0, Number(row.referenceRevenue ?? 0))
  ));
  const originVisibleSelected = sum(selected.map(
    (row) => Math.max(0, Number(row.referenceRevenue ?? 0))
  ));
  const futureDenominator = sum(universe.map(
    (row) => Math.abs(Number(row.actual))
  ));
  const futureServed = sum(selected.map(
    (row) => Math.abs(Number(row.actual))
  ));
  return Object.freeze({
    populationId,
    originCount: new Set(selected.map((row) => row.origin)).size,
    universeOriginCount: new Set(universe.map((row) => row.origin)).size,
    universeMatureWorkCount: new Set(universe.map(
      (row) => row.standardWorkId
    )).size,
    eligibleServedWorkCount: new Set(selected.map(
      (row) => row.standardWorkId
    )).size,
    abstainedOutsidePopulationWorkCount: new Set(
      universe.filter((row) => !selectedKeys.has(workKey(row))).map(
        (row) => row.standardWorkId
      )
    ).size,
    caseCount: selected.length,
    originVisibleSelectionRevenueCoverage:
      originVisibleTotal > 0
        ? originVisibleSelected / originVisibleTotal
        : null,
    futureServedAbsoluteActualCashCoverage:
      futureDenominator > 0
        ? futureServed / futureDenominator
        : null,
    actualDenominator: sum(selected.map(
      (row) => Math.abs(Number(row.actual))
    )),
    predictionSum: sum(candidate.map((row) => row.pointEstimate)),
    actualSum: sum(candidate.map((row) => row.actual)),
    core80AndCore90Combined: false
  });
}

function decideWorkHorizon(cells, horizonMonths, config) {
  const relevant = cells.filter((row) => (
    row.populationId === "CORE80"
    && row.horizonMonths === horizonMonths
  ));
  const families = Object.fromEntries(relevant.map((cell) => {
    const comparison = cell.comparisons.find(
      (row) => row.modelId === "M2-WORK-LG01"
    );
    return [cell.evaluationFamily, comparison ?? null];
  }));
  const statuses = FAMILY_IDS.map(
    (family) => families[family]?.evidenceStatus
      ?? "OA03_CURRENT_SCOPE_PERFORMANCE_NOT_EVALUABLE"
  );
  let status;
  let reason;
  if (statuses.every(
    (value) => value === "OA03_CURRENT_SCOPE_PERFORMANCE_SUPPORTED"
  )) {
    status = "OA03_CURRENT_SCOPE_PERFORMANCE_SUPPORTED";
    reason = "PRIMARY_AND_STRICT_PRIMARY_REFERENCE_SUPPORTED";
  } else if (statuses.some(
    (value) => value === "OA03_CURRENT_SCOPE_PERFORMANCE_NOT_EVALUABLE"
  )) {
    status = "OA03_CURRENT_SCOPE_PERFORMANCE_NOT_EVALUABLE";
    reason =
      "PRIMARY_REFERENCE_NOT_LEGALLY_RECONSTRUCTABLE_FOR_EVERY_FAMILY";
  } else if (
    statuses.some(
      (value) => value === "OA03_CURRENT_SCOPE_PERFORMANCE_MIXED"
    )
    || new Set(statuses).size > 1
    || unexplainedDirectionalReversal(families)
  ) {
    status = "OA03_CURRENT_SCOPE_PERFORMANCE_MIXED";
    reason = "FAMILY_OR_GUARDRAIL_EVIDENCE_CONFLICTS";
  } else {
    status = "OA03_CURRENT_SCOPE_PERFORMANCE_NOT_SUPPORTED";
    reason = "PRIMARY_AND_STRICT_MATERIAL_IMPROVEMENT_NOT_SUPPORTED";
  }
  if (!config.decisionPolicy.workTotalStatesByHorizon.includes(status)) {
    throw new Error("m2_oa03_work_horizon_decision_invalid");
  }
  return Object.freeze({
    horizonMonths,
    populationId: "CORE80",
    status,
    reason,
    primaryEvidenceStatus: statuses[0],
    strictEvidenceStatus: statuses[1],
    primaryReferenceModelId: "M2-WORK-LG01",
    operationalFallbackChanged: false,
    activeCandidate: null,
    approvedForAutomation: null
  });
}

function buildAllocationEvaluation({
  config,
  channelAllocationConfig,
  schedules,
  cases,
  populationCache,
  finalMonthlyRows,
  candidateRows,
  comparatorRows
}) {
  const workCaseIndex = new Map(cases.workCases.map((row) => [
    workKey(row),
    row
  ]));
  const channelCasesByWork = groupBy(cases.channelCases, workKey);
  const immatureChannelCasesByWork = groupBy(
    cases.immatureChannelCases,
    workKey
  );
  const futureFirstByWorkOriginHorizon = buildFutureFirstAbstentions({
    finalMonthlyRows,
    candidateRows
  });
  const allocations = [];
  const attempts = [];
  const legalChannelAbstentions = [];
  for (const candidate of candidateRows) {
    const workCase = workCaseIndex.get(workKey(candidate));
    if (!workCase) {
      throw new Error("m2_oa03_allocation_work_case_missing");
    }
    const population = populationCache.get(candidate.origin);
    const pairs = population.eligiblePairs.filter(
      (row) => row.standardWorkId === candidate.standardWorkId
    );
    const pairByChannel = new Map(pairs.map((row) => [
      row.channelUid,
      row
    ]));
    const sourceChannels = channelCasesByWork.get(workKey(candidate)) ?? [];
    const matureChannels = sourceChannels.map((channel) => {
      const pair = pairByChannel.get(channel.channelUid);
      if (!pair) {
        throw new Error("m2_oa03_allocation_mature_pair_missing");
      }
      return {
        channelUid: channel.channelUid,
        originObservedMature: true,
        actual: channel.actual,
        historyNonnegativeMinorByLag: Array.from(
          {length: 12},
          (_, lag) => decimalToMinor(Math.max(
            0,
            Number(
              pair.monthlyCashBySerial.get(
                monthToSerial(candidate.origin) - lag
              ) ?? 0
            )
          )).toString()
        )
      };
    });
    const ineligibleChannels = [
      ...(immatureChannelCasesByWork.get(workKey(candidate)) ?? []).map(
        (channel) => ({
          channelUid: channel.channelUid,
          originObservedMature: false,
          eligibilityStatus: "ABSTAIN_IMMATURE_AT_ORIGIN"
        })
      ),
      ...(futureFirstByWorkOriginHorizon.get(workKey(candidate)) ?? [])
    ];
    const channels = [...matureChannels, ...ineligibleChannels];
    const totalMinor = decimalToMinor(candidate.pointEstimate).toString();
    const allocated = allocateM2Oa03Trailing12({
      channels,
      totalPointEstimateMinor: totalMinor,
      isCore: belongsToPopulation(workCase, candidate.populationId),
      canonicalConfig: channelAllocationConfig
    });
    attempts.push({
      schema:
        "m2.current.oa03_channel_allocation_attempt.private.v0.1",
      experimentId: EXPERIMENT_ID,
      armId: config.channelAllocation.armId,
      evaluationFamily: candidate.evaluationFamily,
      populationId: candidate.populationId,
      standardWorkId: candidate.standardWorkId,
      origin: candidate.origin,
      horizonMonths: candidate.horizonMonths,
      status: allocated.status,
      reason: allocated.reason,
      fallbackUsed: allocated.fallbackUsed,
      fallbackLag: allocated.fallbackLag,
      totalPointEstimateMinor: totalMinor,
      conservationDifferenceMinor:
        allocated.conservationDifferenceMinor,
      originMatureObservedChannelCount: matureChannels.length,
      ineligibleObservedOrFutureFirstChannelCount:
        ineligibleChannels.length
    });
    for (const item of allocated.allocations) {
      const channel = channels.find(
        (row) => row.channelUid === item.channelUid
      );
      allocations.push({
        schema:
          "m2.current.oa03_channel_allocation_row.private.v0.1",
        experimentId: EXPERIMENT_ID,
        armId: config.channelAllocation.armId,
        modelId: "M2-WORK-OA03",
        evaluationFamily: candidate.evaluationFamily,
        populationId: candidate.populationId,
        grain: "WORK_CHANNEL",
        standardWorkId: candidate.standardWorkId,
        channelUid: item.channelUid,
        origin: candidate.origin,
        horizonMonths: candidate.horizonMonths,
        pointEstimate: item.pointEstimate,
        pointEstimateMinor: item.pointEstimateMinor,
        actual: channel.actual,
        predictedShare: item.predictedShare,
        shareSource: allocated.reason,
        workTotalPointEstimate: candidate.pointEstimate,
        workTotalPointEstimateMinor: totalMinor,
        conservationDifferenceMinor:
          allocated.conservationDifferenceMinor,
        futureChannelRevenueReadForShare: false,
        originMatureObservedChannel: true
      });
    }
    legalChannelAbstentions.push(...allocated.channelAbstentions.map(
      (item) => ({
        schema:
          "m2.current.oa03_channel_abstention.private.v0.1",
        experimentId: EXPERIMENT_ID,
        evaluationFamily: candidate.evaluationFamily,
        populationId: candidate.populationId,
        standardWorkId: candidate.standardWorkId,
        channelUid: item.channelUid,
        origin: candidate.origin,
        horizonMonths: candidate.horizonMonths,
        pointEstimate: null,
        reason: item.reason
      })
    ));
  }
  const cells = [];
  const privateEvaluationRows = [];
  const bootstrapRows = [];
  for (const family of FAMILY_IDS) {
    for (const populationId of POPULATION_IDS) {
      for (const horizonMonths of HORIZONS) {
        const rows = allocations.filter((row) => (
          row.evaluationFamily === family
          && row.populationId === populationId
          && row.horizonMonths === horizonMonths
        ));
        const cellAttempts = attempts.filter((row) => (
          row.evaluationFamily === family
          && row.populationId === populationId
          && row.horizonMonths === horizonMonths
        ));
        const comparisons = [];
        for (const modelId of config.channelAllocation
          .directComparatorModelIds) {
          const baseline = comparatorRows.filter((row) => (
            row.modelId === modelId
            && row.grain === "WORK_CHANNEL"
            && row.evaluationFamily === family
            && row.populationId === populationId
            && Number(row.horizonMonths) === horizonMonths
          ));
          const paired = pairChannelRows(rows, baseline);
          const evidence = assessM2Oa03WorkEvidence({
            pairedRows: paired.rows,
            config,
            seedOffset: stableSeedOffset(
              "WORK_CHANNEL",
              family,
              populationId,
              horizonMonths,
              modelId
            )
          });
          comparisons.push(publicComparison({
            modelId,
            paired,
            evidence,
            candidateMetrics: scoreM2Oa03PointRows(
              paired.rows.map((row) => ({
                ...row,
                pointEstimate: row.candidatePointEstimate
              }))
            ),
            baselineMetrics: scoreM2Oa03PointRows(
              paired.rows.map((row) => ({
                ...row,
                pointEstimate: row.baselinePointEstimate
              }))
            ),
            config
          }));
          privateEvaluationRows.push(...paired.rows.map((row) => ({
            schema:
              "m2.current.oa03_channel_comparison_row.private.v0.1",
            experimentId: EXPERIMENT_ID,
            comparisonModelId: modelId,
            grain: "WORK_CHANNEL",
            ...row
          })));
          bootstrapRows.push({
            schema:
              "m2.current.oa03_bootstrap_summary.private.v0.1",
            experimentId: EXPERIMENT_ID,
            grain: "WORK_CHANNEL",
            evaluationFamily: family,
            populationId,
            horizonMonths,
            comparisonModelId: modelId,
            ...evidence.bootstrap
          });
        }
        const reference = config.channelAllocation
          .directReferencePriority.map((modelId) => (
            comparisons.find((row) => (
              row.modelId === modelId
              && row.sameCaseCount > 0
            ))
          )).find(Boolean) ?? null;
        const conservationValues = cellAttempts
          .filter((row) => row.conservationDifferenceMinor !== null)
          .map((row) => Math.abs(Number(row.conservationDifferenceMinor)));
        const cellChannelAbstentions = legalChannelAbstentions.filter(
          (row) => row.evaluationFamily === family
            && row.populationId === populationId
            && row.horizonMonths === horizonMonths
        );
        cells.push(Object.freeze({
          evaluationFamily: family,
          populationId,
          horizonMonths,
          metrics: publicMetric(scoreM2Oa03PointRows(rows), config),
          successfulAllocationCount: cellAttempts.filter(
            (row) => row.status === "ALLOCATED"
          ).length,
          legalAbstentionCount: cellAttempts.filter(
            (row) => row.status !== "ALLOCATED"
          ).length,
          channelLegalAbstentionCount: cellChannelAbstentions.length,
          channelLegalAbstentionsByReason:
            summarizeCountBy(cellChannelAbstentions, "reason"),
          maximumConservationDifferenceMinor:
            conservationValues.length > 0
              ? Math.max(...conservationValues)
              : null,
          referenceModelId: reference?.modelId ?? null,
          referenceFallbackUsed:
            reference !== null
            && reference.modelId !== config.channelAllocation
              .directReferencePriority[0],
          comparisons: Object.freeze(comparisons),
          majorCanonicalChannelSlices:
            anonymizedMajorChannelSlices(rows, config)
        }));
      }
    }
  }
  const horizonDecisions = HORIZONS.map((horizonMonths) => (
    decideAllocationHorizon(cells, horizonMonths, config)
  ));
  return Object.freeze({
    cells: Object.freeze(cells),
    horizonDecisions: Object.freeze(horizonDecisions),
    privateRows: Object.freeze([
      ...attempts,
      ...allocations,
      ...legalChannelAbstentions
    ]),
    privateEvaluationRows: Object.freeze(privateEvaluationRows),
    bootstrapRows: Object.freeze(bootstrapRows),
    counts: Object.freeze({
      attemptCount: attempts.length,
      successfulAllocationCount: attempts.filter(
        (row) => row.status === "ALLOCATED"
      ).length,
      legalAbstentionCount: attempts.filter(
        (row) => row.status !== "ALLOCATED"
      ).length,
      allocationRowCount: allocations.length,
      channelLegalAbstentionCount: legalChannelAbstentions.length,
      channelLegalAbstentionsByReason:
        summarizeCountBy(legalChannelAbstentions, "reason")
    })
  });
}

function buildFutureFirstAbstentions({
  finalMonthlyRows,
  candidateRows
}) {
  const positiveByWork = groupBy(
    finalMonthlyRows.filter((row) => Number(row.cash) > 0),
    (row) => String(row.standardWorkId)
  );
  const output = new Map();
  for (const candidate of candidateRows) {
    const targetEnd = serialToMonth(
      monthToSerial(candidate.origin) + Number(candidate.horizonMonths)
    );
    const firstPositiveByChannel = new Map();
    for (const row of positiveByWork.get(
      String(candidate.standardWorkId)
    ) ?? []) {
      const prior = firstPositiveByChannel.get(String(row.channelUid));
      if (prior === undefined || row.month < prior) {
        firstPositiveByChannel.set(String(row.channelUid), row.month);
      }
    }
    const rows = [...firstPositiveByChannel]
      .filter(([, firstPositiveMonth]) => (
        firstPositiveMonth > candidate.origin
        && firstPositiveMonth <= targetEnd
      ))
      .map(([channelUid]) => Object.freeze({
        channelUid,
        originObservedMature: false,
        eligibilityStatus: "ABSTAIN_FUTURE_FIRST_AT_ORIGIN"
      }))
      .sort((left, right) => left.channelUid.localeCompare(
        right.channelUid,
        "en"
      ));
    output.set(workKey(candidate), Object.freeze(rows));
  }
  return output;
}

function pairChannelRows(candidateRows, baselineRows) {
  const candidate = uniqueIndex(candidateRows, channelComparisonKey);
  const baseline = uniqueIndex(baselineRows, channelComparisonKey);
  const rows = [];
  let actualMismatchCount = 0;
  for (const [key, current] of candidate) {
    const reference = baseline.get(key);
    if (!reference) continue;
    if (Math.abs(Number(current.actual) - Number(reference.actual)) > 1e-7) {
      actualMismatchCount += 1;
      continue;
    }
    rows.push(Object.freeze({
      caseKey: channelKey(current),
      standardWorkId: current.standardWorkId,
      channelUid: current.channelUid,
      origin: current.origin,
      horizonMonths: current.horizonMonths,
      evaluationFamily: current.evaluationFamily,
      populationId: current.populationId,
      actual: Number(current.actual),
      candidatePointEstimate: Number(current.pointEstimate),
      baselinePointEstimate: Number(reference.pointEstimate)
    }));
  }
  return Object.freeze({
    rows: Object.freeze(rows.sort(comparePrivateCase)),
    candidateCaseCount: candidate.size,
    baselineCaseCount: baseline.size,
    sameCaseCount: rows.length,
    actualMismatchCount
  });
}

function decideAllocationHorizon(cells, horizonMonths, config) {
  const relevant = cells.filter((row) => (
    row.populationId === "CORE80"
    && row.horizonMonths === horizonMonths
  ));
  const familyStatuses = Object.fromEntries(relevant.map((cell) => {
    const reference = cell.comparisons.find(
      (row) => row.modelId === cell.referenceModelId
    );
    return [
      cell.evaluationFamily,
      mapWorkEvidenceToAllocation(
        reference?.evidenceStatus,
        cell.maximumConservationDifferenceMinor
      )
    ];
  }));
  const statuses = FAMILY_IDS.map((family) => (
    familyStatuses[family]
      ?? "OA03_TRAILING12_CHANNEL_ALLOCATION_NOT_EVALUABLE"
  ));
  let status;
  let reason;
  if (statuses.every(
    (value) => value === "OA03_TRAILING12_CHANNEL_ALLOCATION_SUPPORTED"
  )) {
    status = "OA03_TRAILING12_CHANNEL_ALLOCATION_SUPPORTED";
    reason =
      "PRIMARY_AND_STRICT_LEGAL_DIRECT_REFERENCE_EVIDENCE_SUPPORTED";
  } else if (statuses.some(
    (value) => value
      === "OA03_TRAILING12_CHANNEL_ALLOCATION_NOT_EVALUABLE"
  )) {
    status = "OA03_TRAILING12_CHANNEL_ALLOCATION_NOT_EVALUABLE";
    reason = "LEGAL_DIRECT_REFERENCE_OR_SAME_CASE_EVIDENCE_UNAVAILABLE";
  } else if (
    statuses.some(
      (value) => value === "OA03_TRAILING12_CHANNEL_ALLOCATION_MIXED"
    )
    || new Set(statuses).size > 1
  ) {
    status = "OA03_TRAILING12_CHANNEL_ALLOCATION_MIXED";
    reason = "FAMILY_OR_GUARDRAIL_EVIDENCE_CONFLICTS";
  } else {
    status = "OA03_TRAILING12_CHANNEL_ALLOCATION_NOT_SUPPORTED";
    reason = "MATERIAL_DIRECT_REFERENCE_IMPROVEMENT_NOT_SUPPORTED";
  }
  if (
    !config.decisionPolicy.channelAllocationStatesByHorizon.includes(status)
  ) {
    throw new Error("m2_oa03_allocation_horizon_decision_invalid");
  }
  return Object.freeze({
    horizonMonths,
    populationId: "CORE80",
    status,
    reason,
    primaryEvidenceStatus: statuses[0],
    strictEvidenceStatus: statuses[1],
    selectedWindowMonths: 12,
    resultBasedWindowSelectionPerformed: false,
    workTotalModelRoleChanged: false
  });
}

async function buildFrozenOverlap({ root, currentRows }) {
  const frozenRows = await readNdjsonIfPresent(path.join(
    root,
    HISTORICAL_OA03_ROWS
  ));
  if (frozenRows === null) {
    return Object.freeze({
      status: "NOT_COMPARABLE_DIFFERENT_CONTRACT",
      sourceStatus: "HISTORICAL_PRIVATE_DERIVED_CACHE_MISSING",
      sameActualDefinition: false,
      sameTrainingSupport: false,
      sameFormulaVersion: true,
      currentCaseCount: currentRows.length,
      frozenCaseCount: null,
      sameCaseCount: null,
      cacheMissBlockedCurrentReplication: false
    });
  }
  const diagnostic = compareM2Oa03FrozenOverlap({
    currentRows,
    frozenRows: frozenRows.filter((row) => {
      const key = row?.caseKey;
      return key && HORIZONS.includes(Number(
        key.horizonMonths ?? key.horizon_months
      ));
    }),
    sameActualDefinition: false,
    sameTrainingSupport: false,
    sameFormulaVersion: true
  });
  return Object.freeze({
    ...diagnostic,
    sourceStatus: "HISTORICAL_PRIVATE_DERIVED_CACHE_AVAILABLE",
    cacheMissBlockedCurrentReplication: false,
    predictionEqualityRequired: false,
    currentV22ActualRewrittenForHistoricalMatch: false
  });
}

function buildPublicDevelopment({
  config,
  preflight,
  authority,
  schedules,
  cases,
  familyResults,
  comparators,
  workEvaluation,
  overlap,
  technicalStatus,
  summaryStatus,
  inventoryBefore,
  baseReceipt
}) {
  const selections = FAMILY_IDS.map((family) => ({
    evaluationFamily: family,
    hrc02SelectionCount:
      familyResults[family].hrc02Selections.length,
    oa03SelectionCount:
      familyResults[family].oa03Selections.length,
    maximumTrainingRowCount: maximum(
      familyResults[family].oa03Selections.map(
        (row) => row.matureEarlierCaseCount
      )
    ),
    maximumTrainingLabelAvailableAsOf:
      familyResults[family].oa03Selections.map(
        (row) => row.maximumLabelAvailableAsOf
      ).filter(Boolean).sort().at(-1) ?? null,
    outsideCoreTrainingDiagnostics:
      summarizeTrainingDiagnostics(
        familyResults[family].oa03Selections
      )
  }));
  return Object.freeze({
    schema:
      "m2.current.oa03_current_scope_replication.public.v0.1",
    asOf: config.asOf,
    experiment: Object.freeze({
      stableExperimentId: EXPERIMENT_ID,
      displayNameZh: config.experiment.displayNameZh,
      displayNameEn: config.experiment.displayNameEn,
      entityType: config.experiment.entityType,
      armId: `${EXPERIMENT_ID}/R0`,
      armEntityType: "existing-model replication arm"
    }),
    model: Object.freeze({
      stableModelId: "M2-WORK-OA03",
      displayNameZh: config.modelIdentity.displayNameZh,
      displayNameEn: config.modelIdentity.displayNameEn,
      canonicalFunction: config.modelIdentity.canonicalFunction,
      formulaIdentityStatus:
        config.modelIdentity.identityResolutionStatus,
      baseCandidateId: config.formula.baseCandidateId,
      activeCandidate: null,
      approvedForAutomation: null
    }),
    technicalReplication: Object.freeze({
      status: technicalStatus,
      meaning:
        "technical completion is separate from performance support",
      formulaChanged: false,
      featureAdded: false,
      parameterGridChanged: false,
      horizonRouterAdded: false,
      revenueWeightedLossUsed: false,
      coreOnlyTrainingClaimed: false,
      selectedFallbackMasksRawCandidate: false
    }),
    summaryStatus,
    target: Object.freeze({
      name: config.scope.target,
      actualDefinitionId: ACTUAL_ID,
      workGrain: config.scope.workPredictionGrain,
      servicePopulation: "DYNAMIC_CORE80_PRIMARY_CORE90_SENSITIVITY",
      trainingSupportMode: config.training.supportMode,
      horizonsMonths: Object.freeze([...HORIZONS]),
      evaluationFamilies: Object.freeze([...FAMILY_IDS]),
      buyoutCashIncluded: false,
      companyPortfolioGapIncluded: false
    }),
    schedules: Object.freeze(FAMILY_IDS.map((family) => ({
      evaluationFamily: family,
      originCount: schedules[family].origins.length,
      evaluationOriginCount: schedules[family].evaluationOrigins.length,
      legalCellCount: schedules[family].legalCells.length,
      evaluationStartsAt: schedules[family].evaluationStartsAt,
      rightCensoredCasesZeroImputed: false
    }))),
    workEvidenceCells: workEvaluation.cells,
    workHorizonDecisions: workEvaluation.horizonDecisions,
    core90Sensitivity: Object.freeze(
      workEvaluation.cells.filter(
        (row) => row.populationId === "CORE90"
      )
    ),
    selectionAndTrainingDiagnostics: Object.freeze(selections),
    occurrenceAndConditionalAmount: Object.freeze({
      occurrenceProbabilityNativeStored: true,
      occurrenceMetricsEvaluatedSeparately: true,
      positiveRevenueOccurrenceSeparatedFromReversal: true,
      conditionalPositiveAmountPredictionStatus:
        "CAPABILITY_NOT_STORED",
      pointPredictionReverseEngineeringPerformed: false
    }),
    frozenOverlap: overlap,
    comparatorRebuild: comparators.audit,
    sourceAndCache: Object.freeze({
      sourceAuthorityStatus:
        inventoryBefore.sourceAuthorityStatus,
      derivedCacheStatusBefore:
        inventoryBefore.derivedCacheStatus,
      historicalReceiptStatusBefore:
        inventoryBefore.historicalReceiptStatus,
      sourceAuthorityRoleCount: inventoryBefore.privateArtifacts.filter(
        (row) => row.artifactClass === "PRIVATE_SOURCE_AUTHORITY"
      ).length,
      sourceAuthorityReadRoleCount: inventoryBefore.privateArtifacts.filter(
        (row) => row.artifactClass === "PRIVATE_SOURCE_AUTHORITY"
          && row.present
      ).length,
      derivedCacheRoleCount: inventoryBefore.privateArtifacts.filter(
        (row) => row.artifactClass === "PRIVATE_DERIVED_CACHE"
      ).length,
      derivedCacheMissingBeforeCount:
        inventoryBefore.privateArtifacts.filter(
          (row) => row.artifactClass === "PRIVATE_DERIVED_CACHE"
            && !row.present
        ).length,
      historicalReceiptMissingBlocked: false,
      baseMaterializationStatus: baseReceipt.status
    }),
    executionCounts: Object.freeze({
      sourceAuthorityRowCount: authority.authority.rows.length,
      finalRestatedMonthlyRowCount:
        authority.finalMonthlyRows.length,
      originAsOfRestatementCount: authority.asOfAudit.length,
      matureWorkCaseCount: cases.workCases.length,
      matureChannelCaseCount: cases.channelCases.length,
      immatureObservedChannelCaseCount:
        cases.immatureChannelCases.length,
      baseMaterializationRowCount: baseReceipt.outputRowCount,
      oa03FitPredictionRowCount: sum(FAMILY_IDS.map(
        (family) => familyResults[family].fitRows.length
      )),
      oa03ServedEvaluationRowCount: sum(FAMILY_IDS.map(
        (family) => familyResults[family].evaluationRows.length
      )),
      corePopulationEvaluationRowCount:
        workEvaluation.cells.reduce(
          (total, row) => total + row.coverage.caseCount,
          0
        ),
      workComparisonPrivateRowCount:
        workEvaluation.privateRows.length,
      bootstrapSummaryRowCount:
        workEvaluation.bootstrapRows.length,
      bootstrapIterationsPerEvaluableComparison:
        config.rollingEvaluation.bootstrap.iterations
    }),
    execution: Object.freeze({
      dynamicStartHead: config.auditBaseline.dynamicStartHead,
      executionHead: preflight.head,
      branch: preflight.branch,
      draftPullRequestNumber: preflight.prNumber,
      draftPullRequestUrl: preflight.prUrl,
      exactHeadCiRunId: preflight.ciRunId,
      linuxConclusion: preflight.linux,
      windowsConclusion: preflight.windows,
      finalDocumentationHead: null
    }),
    proceduralDisclosure:
      config.auditBaseline.proceduralDisclosureBeforeP1Freeze,
    boundaries: Object.freeze({
      firstCompleteInterpretableResultFrozen: true,
      secondResultExecuted: false,
      postResultTuningPerformed: false,
      operationalFallbackChanged: false,
      activeCandidate: null,
      approvedForAutomation: null,
      laterOrFinalHoldoutOpened: false,
      providerUsed: false,
      databaseUsed: false,
      productionChanged: false,
      canaryOrFull160Used: false,
      releaseAuthorized: false,
      m3FormalUsed: false,
      privateIdentityPublished: false
    })
  });
}

function buildPublicAllocation({
  config,
  preflight,
  allocation,
  technicalStatus
}) {
  return Object.freeze({
    schema:
      "m2.current.oa03_trailing12_channel_allocation.public.v0.1",
    asOf: config.asOf,
    experiment: Object.freeze({
      stableExperimentId: EXPERIMENT_ID,
      armId: config.channelAllocation.armId,
      displayNameZh: config.arms.find(
        (row) => row.armId === config.channelAllocation.armId
      ).displayNameZh,
      entityType: "observed-channel allocation capability"
    }),
    sourceModel: Object.freeze({
      stableModelId: "M2-WORK-OA03",
      workTotalRoleChanged: false
    }),
    technicalReplicationStatus: technicalStatus,
    allocationContract: Object.freeze({
      windowMonths: 12,
      kind: config.channelAllocation.kind,
      canonicalContract:
        config.channelAllocation.canonicalContract,
      canonicalFunction:
        config.channelAllocation.canonicalFunction,
      canonicalArmId:
        config.channelAllocation.canonicalArmId,
      onlyOriginObservedMatureCanonicalChannels: true,
      futureFirstChannelPrediction: null,
      outsideCoreWorkPrediction: null,
      equalSplitAllowed: false,
      resultBasedWindowSelectionAllowed: false,
      zeroDenominatorFallback:
        config.channelAllocation.zeroDenominatorFallback,
      fallbackFailure: config.channelAllocation.fallbackFailure,
      moneySemantics: config.formula.moneySemantics,
      referencePolicy: config.channelAllocation.referencePolicy,
      directReferencePriority:
        config.channelAllocation.directReferencePriority
    }),
    evidenceCells: allocation.cells,
    horizonDecisions: allocation.horizonDecisions,
    core90Sensitivity: Object.freeze(
      allocation.cells.filter(
        (row) => row.populationId === "CORE90"
      )
    ),
    counts: allocation.counts,
    execution: Object.freeze({
      executionHead: preflight.head,
      branch: preflight.branch,
      draftPullRequestNumber: preflight.prNumber,
      draftPullRequestUrl: preflight.prUrl,
      exactHeadCiRunId: preflight.ciRunId,
      linuxConclusion: preflight.linux,
      windowsConclusion: preflight.windows,
      finalDocumentationHead: null
    }),
    boundaries: Object.freeze({
      trailing3Compared: false,
      trailing6Compared: false,
      windowChangedAfterOutcome: false,
      futureActualShareUsed: false,
      futureFirstChannelAddedToDenominator: false,
      equalSplitFallbackUsed: false,
      workTotalPredictionChanged: false,
      allocationUsedToChangeModelRole: false,
      productionChanged: false,
      privateIdentityPublished: false
    })
  });
}

async function beginAttempt({
  privateDirectory,
  config,
  preflight,
  inventoryBefore
}) {
  const attemptDirectory = path.join(
    privateDirectory,
    config.privateOutputs.attemptDirectory
  );
  await mkdir(attemptDirectory, { recursive: true });
  const prior = (await readdir(attemptDirectory)).filter(
    (name) => /^attempt-\d{3}\.json$/u.test(name)
  ).sort();
  const attemptNumber = prior.length + 1;
  const attemptId = `attempt-${String(attemptNumber).padStart(3, "0")}`;
  const attemptPath = path.join(attemptDirectory, `${attemptId}.json`);
  const value = {
    schema: "m2.current.oa03_attempt_receipt.private.v0.1",
    tracked: false,
    experimentId: EXPERIMENT_ID,
    attemptId,
    status: "PRIVATE_EXECUTION_STARTED",
    executionHead: preflight.head,
    branch: preflight.branch,
    prNumber: preflight.prNumber,
    exactHeadCiRunId: preflight.ciRunId,
    sourceAuthorityStatus: inventoryBefore.sourceAuthorityStatus,
    derivedCacheStatusBefore: inventoryBefore.derivedCacheStatus,
    historicalReceiptStatusBefore:
      inventoryBefore.historicalReceiptStatus,
    validCompleteInterpretableResultProduced: false,
    retryAllowed: true,
    modelFormulaChanged: false,
    parameterGridChanged: false,
    evaluationGateChanged: false
  };
  await writeFile(
    attemptPath,
    `${JSON.stringify(value, null, 2)}\n`,
    { encoding: "utf8", flag: "wx" }
  );
  await writeFile(
    path.join(privateDirectory, config.privateOutputs.attemptReceipt),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8"
  );
  return Object.freeze({
    attemptId,
    attemptPath,
    privateDirectory
  });
}

async function completeAttempt({
  attempt,
  receiptPath,
  preflight,
  manifestPath,
  development,
  allocation,
  counts
}) {
  const value = {
    schema: "m2.current.oa03_attempt_receipt.private.v0.1",
    tracked: false,
    experimentId: EXPERIMENT_ID,
    attemptId: attempt.attemptId,
    status: "COMPLETE_RESULT_FROZEN",
    executionHead: preflight.head,
    branch: preflight.branch,
    prNumber: preflight.prNumber,
    exactHeadCiRunId: preflight.ciRunId,
    technicalReplicationStatus:
      development.technicalReplication.status,
    summaryStatus: development.summaryStatus,
    allocationHorizonStatuses:
      allocation.horizonDecisions.map((row) => row.status),
    counts,
    manifestSha256: await sha256File(manifestPath),
    validCompleteInterpretableResultProduced: true,
    retryAllowed: false,
    authorizationConsumed: true,
    modelFormulaChanged: false,
    parameterGridChanged: false,
    allocationWindowChanged: false,
    postResultTuningPerformed: false,
    secondResultExecuted: false
  };
  await Promise.all([
    writeFile(
      attempt.attemptPath,
      `${JSON.stringify(value, null, 2)}\n`,
      "utf8"
    ),
    writeFile(
      receiptPath,
      `${JSON.stringify(value, null, 2)}\n`,
      "utf8"
    )
  ]);
}

async function failAttempt({
  attempt,
  receiptPath,
  preflight,
  stage,
  error,
  completeResultProduced
}) {
  const value = {
    schema: "m2.current.oa03_attempt_receipt.private.v0.1",
    tracked: false,
    experimentId: EXPERIMENT_ID,
    attemptId: attempt.attemptId,
    status: completeResultProduced
      ? "COMPLETE_RESULT_PRODUCED_REPORTING_INCOMPLETE_FROZEN"
      : "INFRASTRUCTURE_FAILURE_BEFORE_RESULT_RETRY_ALLOWED",
    technicalStatus: completeResultProduced
      ? "OA03_CURRENT_SCOPE_REPLICATION_COMPLETE"
      : "OA03_CURRENT_SCOPE_REPLICATION_INFRASTRUCTURE_FAILURE_BEFORE_RESULT",
    failedStage: stage,
    errorCode: safeErrorCode(error),
    executionHead: preflight.head,
    exactHeadCiRunId: preflight.ciRunId,
    validCompleteInterpretableResultProduced: completeResultProduced,
    retryAllowed: !completeResultProduced,
    formulaOrParameterChangeAllowedOnRetry: false
  };
  await Promise.all([
    writeFile(
      attempt.attemptPath,
      `${JSON.stringify(value, null, 2)}\n`,
      "utf8"
    ),
    writeFile(
      receiptPath,
      `${JSON.stringify(value, null, 2)}\n`,
      "utf8"
    )
  ]);
}

async function buildPrivateManifest({
  config,
  preflight,
  authority,
  inventoryBefore,
  baseReceipt,
  paths,
  counts
}) {
  return Object.freeze({
    schema: "m2.current.oa03_manifest.private.v0.1",
    tracked: false,
    experimentId: EXPERIMENT_ID,
    executionHead: preflight.head,
    branch: preflight.branch,
    prNumber: preflight.prNumber,
    exactHeadCiRunId: preflight.ciRunId,
    actualDefinitionId: ACTUAL_ID,
    sourceAuthority: Object.freeze({
      status: inventoryBefore.sourceAuthorityStatus,
      roleCount: inventoryBefore.privateArtifacts.filter(
        (row) => row.artifactClass === "PRIVATE_SOURCE_AUTHORITY"
      ).length,
      authorityRowCount: authority.authority.rows.length,
      rawReversalRowCountPreserved:
        config.scope.reversalPolicy.rawReversalRowCountPreserved,
      finalRestatementStatus: authority.finalRestatement.status,
      finalConservationDifferenceMinor:
        authority.finalRestatement.conservationDifferenceMinor
    }),
    derivedCache: Object.freeze({
      statusBefore: inventoryBefore.derivedCacheStatus,
      baseMaterializationStatus: baseReceipt.status,
      files: Object.freeze(Object.fromEntries(await Promise.all(
        Object.entries(paths).map(async ([role, filePath]) => [
          role,
          await fileBinding(filePath)
        ])
      )))
    }),
    counts: Object.freeze(counts),
    boundaries: Object.freeze({
      primaryAndStrictFitIndependently: true,
      horizonsMonths: Object.freeze([...HORIZONS]),
      fullMatureTrainingSupport: true,
      coreTailServing: false,
      futureActualReadForFeatures: false,
      futureChannelShareRead: false,
      finalHoldoutOpened: false,
      providerUsed: false,
      databaseUsed: false,
      productionChanged: false,
      resultVersionCount: 1
    })
  });
}

function publicComparison({
  modelId,
  paired,
  evidence,
  candidateMetrics,
  baselineMetrics,
  config
}) {
  const privateEnough = (
    paired.sameCaseCount >= config.publicPrivacy.minimumCaseCount
    && evidence.candidate?.workCount
      >= config.publicPrivacy.minimumWorkCount
  );
  return Object.freeze({
    modelId,
    status: paired.sameCaseCount > 0
      ? "SAME_CASE_COMPARISON_AVAILABLE"
      : "NOT_RECONSTRUCTABLE_OR_NO_SAME_CASE_INTERSECTION",
    candidateCaseCount: paired.candidateCaseCount,
    baselineCaseCount: paired.baselineCaseCount,
    sameCaseCount: paired.sameCaseCount,
    actualMismatchCount: paired.actualMismatchCount,
    evidenceStatus: evidence.status,
    evidenceReason: evidence.reason,
    relativeWapeImprovement: privateEnough
      ? evidence.relativeWapeImprovement
      : null,
    absoluteBiasWorsening: privateEnough
      ? evidence.absoluteBiasWorsening
      : null,
    candidateMetrics: publicMetric(candidateMetrics, config),
    baselineMetrics: publicMetric(baselineMetrics, config),
    bootstrap: privateEnough
      ? evidence.bootstrap
      : suppressM2Oa03BootstrapForPublic(evidence.bootstrap),
    timeBlocks: privateEnough
      ? publicTimeBlocks(evidence.timeBlocks, config)
      : Object.freeze([]),
    timeBlockImprovingShare: privateEnough
      ? evidence.timeBlockImprovingShare
      : null,
    perOriginMetrics: privateEnough
      ? publicPerOriginComparisons(paired.rows, config)
      : Object.freeze([]),
    conditions: privateEnough
      ? evidence.conditions
      : null,
    privacyStatus: privateEnough
      ? "PUBLISHED_ABOVE_THRESHOLD"
      : config.publicPrivacy.suppressionStatus
  });
}

function publicPerOriginComparisons(rows, config) {
  const byOrigin = groupBy(rows, (row) => row.origin);
  return Object.freeze([...byOrigin].map(([origin, values]) => {
    const candidate = scoreM2Oa03PointRows(values.map((row) => ({
      ...row,
      pointEstimate: row.candidatePointEstimate
    })));
    const baseline = scoreM2Oa03PointRows(values.map((row) => ({
      ...row,
      pointEstimate: row.baselinePointEstimate
    })));
    const allowed = metricMayBePublished(candidate, config)
      && metricMayBePublished(baseline, config);
    return Object.freeze({
      origin,
      pairedCaseCount: values.length,
      candidateMetrics: publicMetric(candidate, config),
      baselineMetrics: publicMetric(baseline, config),
      relativeWapeImprovement: allowed && baseline.wape > 0
        ? (baseline.wape - candidate.wape) / baseline.wape
        : null,
      privacyStatus: allowed
        ? "PUBLISHED_ABOVE_THRESHOLD"
        : config.publicPrivacy.suppressionStatus
    });
  }).sort((left, right) => left.origin.localeCompare(right.origin)));
}

function publicTimeBlocks(rows, config) {
  return Object.freeze(rows.map((row) => {
    const allowed = (
      row.caseCount >= config.publicPrivacy.minimumCaseCount
      && row.workCount >= config.publicPrivacy.minimumWorkCount
    );
    return Object.freeze({
      blockId: row.blockId,
      originCount: row.originCount,
      caseCount: row.caseCount,
      workCount: row.workCount,
      candidateWape: allowed ? row.candidateWape : null,
      baselineWape: allowed ? row.baselineWape : null,
      candidateSignedBias: allowed ? row.candidateSignedBias : null,
      baselineSignedBias: allowed ? row.baselineSignedBias : null,
      relativeWapeImprovement: allowed
        ? row.relativeWapeImprovement
        : null,
      candidateWins: allowed ? row.candidateWins : null,
      privacyStatus: allowed
        ? "PUBLISHED_ABOVE_THRESHOLD"
        : config.publicPrivacy.suppressionStatus
    });
  }));
}

function publicMetric(metrics, config) {
  const allowed = metricMayBePublished(metrics, config);
  return Object.freeze({
    status: allowed
      ? metrics.status
      : config.publicPrivacy.suppressionStatus,
    caseCount: metrics.caseCount,
    workCount: metrics.workCount,
    actualDenominator: allowed ? metrics.actualDenominator : null,
    predictionTotal: allowed ? metrics.predictionTotal : null,
    actualTotal: allowed ? metrics.actualTotal : null,
    absoluteErrorTotal: allowed ? metrics.absoluteErrorTotal : null,
    wape: allowed ? metrics.wape : null,
    signedBias: allowed ? metrics.signedBias : null,
    absoluteBias: allowed ? metrics.absoluteBias : null,
    mae: allowed ? metrics.mae : null,
    medianAbsoluteError: allowed
      ? metrics.medianAbsoluteError
      : null,
    overpredictionCash: allowed
      ? metrics.overpredictionCash
      : null,
    underpredictionCash: allowed
      ? metrics.underpredictionCash
      : null,
    errorConcentration: allowed
      ? metrics.errorConcentration
      : null
  });
}

function metricMayBePublished(metrics, config) {
  return (
    metrics.caseCount >= config.publicPrivacy.minimumCaseCount
    && metrics.workCount >= config.publicPrivacy.minimumWorkCount
  );
}

function publicOccurrence(occurrence, pointMetrics, config) {
  const allowed = metricMayBePublished(pointMetrics, config);
  if (!allowed) {
    return Object.freeze({
      status: config.publicPrivacy.suppressionStatus,
      evaluatedCaseCount: occurrence.evaluatedCaseCount,
      probabilityCaseCount: occurrence.probabilityCaseCount
    });
  }
  return occurrence;
}

export function suppressM2Oa03BootstrapForPublic(bootstrap) {
  if (bootstrap === undefined || bootstrap === null) return null;
  return Object.freeze({
    status: bootstrap.status,
    iterations: bootstrap.iterations,
    seed: bootstrap.seed ?? null,
    workCount: bootstrap.workCount ?? null,
    intervals: null
  });
}

export function resolveM2Oa03RuntimeAuthorizationRecovery({
  priorAuthorization,
  priorReceipt,
  preflight
}) {
  const valid = (
    priorAuthorization?.schema
      === "m2.current.oa03_runtime_authorization.private.v0.1"
    && priorAuthorization?.status
      === "AUTHORIZED_FOR_ONE_LOGICAL_EXECUTION"
    && priorAuthorization?.experimentId === EXPERIMENT_ID
    && priorAuthorization?.capabilityId === CAPABILITY_ID
    && priorAuthorization?.branch === preflight?.branch
    && priorAuthorization?.prNumber === preflight?.prNumber
    && priorReceipt?.schema
      === "m2.current.oa03_attempt_receipt.private.v0.1"
    && priorReceipt?.experimentId === EXPERIMENT_ID
    && priorReceipt?.status
      === "INFRASTRUCTURE_FAILURE_BEFORE_RESULT_RETRY_ALLOWED"
    && priorReceipt?.technicalStatus
      === "OA03_CURRENT_SCOPE_REPLICATION_INFRASTRUCTURE_FAILURE_BEFORE_RESULT"
    && priorReceipt?.validCompleteInterpretableResultProduced === false
    && priorReceipt?.retryAllowed === true
    && priorReceipt?.formulaOrParameterChangeAllowedOnRetry === false
    && priorReceipt?.executionHead === priorAuthorization.executionHead
    && priorReceipt?.exactHeadCiRunId
      === priorAuthorization.exactHeadCiRunId
    && typeof priorReceipt?.attemptId === "string"
    && /^attempt-\d{3}$/u.test(priorReceipt.attemptId)
  );
  if (!valid) {
    throw new Error("m2_oa03_runtime_authorization_conflict");
  }
  return Object.freeze({
    priorAttemptId: priorReceipt.attemptId,
    priorExecutionHead: priorAuthorization.executionHead,
    priorExactHeadCiRunId: priorAuthorization.exactHeadCiRunId
  });
}

function anonymizedMajorChannelSlices(rows, config) {
  const overall = scoreM2Oa03PointRows(rows);
  const byChannel = groupBy(rows, (row) => row.channelUid);
  const ranked = [...byChannel].map(([channelUid, values]) => ({
    channelUid,
    rows: values,
    actualDenominator: sum(values.map(
      (row) => Math.abs(Number(row.actual))
    ))
  })).sort((left, right) => (
    right.actualDenominator - left.actualDenominator
    || left.channelUid.localeCompare(right.channelUid)
  )).slice(0, 10);
  return Object.freeze(ranked.map((item, index) => {
    const metrics = scoreM2Oa03PointRows(item.rows);
    const allowed = metricMayBePublished(metrics, config)
      && metricMayBePublished(overall, config);
    return Object.freeze({
      anonymousChannelRank:
        `MAJOR_CANONICAL_CHANNEL_${String(index + 1).padStart(3, "0")}`,
      metrics: publicMetric(metrics, config),
      absoluteErrorContribution: allowed
        && overall.absoluteErrorTotal > 0
        ? metrics.absoluteErrorTotal / overall.absoluteErrorTotal
        : null,
      identityWithheld: true
    });
  }));
}

function summarizeTrainingDiagnostics(selections) {
  const values = POPULATION_IDS.map((populationId) => {
    const rows = selections.map(
      (row) => row.trainingPopulationDiagnostics?.[populationId]
    ).filter(Boolean);
    return [populationId, Object.freeze({
      selectionCount: rows.length,
      maximumTrainingRowCount: maximum(rows.map(
        (row) => row.trainingRowCount
      )),
      maximumTrainingWorkCount: maximum(rows.map(
        (row) => row.trainingWorkCount
      )),
      maximumOutsideCoreTrainingWorkCount: maximum(rows.map(
        (row) => row.outsideCoreTrainingWorkCount
      )),
      meanOutsideCoreTrainingRowShare: mean(rows.map(
        (row) => row.outsideCoreTrainingRowShare
      )),
      meanOutsideCoreTrainingActualShare: mean(rows.map(
        (row) => row.outsideCoreTrainingActualShare
      )),
      meanOutsideCoreTrainingLossShare: mean(rows.map(
        (row) => row.outsideCoreTrainingLossShare
      )),
      supportMode: "FULL_MATURE_TRAINING_SUPPORT",
      coreOnlyTrainingClaimed: false
    })];
  });
  return Object.freeze(Object.fromEntries(values));
}

function mapWorkEvidenceToAllocation(
  status,
  maximumConservationDifferenceMinor
) {
  if (
    maximumConservationDifferenceMinor !== null
    && maximumConservationDifferenceMinor !== 0
  ) {
    return "OA03_TRAILING12_CHANNEL_ALLOCATION_NOT_SUPPORTED";
  }
  return ({
    OA03_CURRENT_SCOPE_PERFORMANCE_SUPPORTED:
      "OA03_TRAILING12_CHANNEL_ALLOCATION_SUPPORTED",
    OA03_CURRENT_SCOPE_PERFORMANCE_MIXED:
      "OA03_TRAILING12_CHANNEL_ALLOCATION_MIXED",
    OA03_CURRENT_SCOPE_PERFORMANCE_NOT_SUPPORTED:
      "OA03_TRAILING12_CHANNEL_ALLOCATION_NOT_SUPPORTED",
    OA03_CURRENT_SCOPE_PERFORMANCE_NOT_EVALUABLE:
      "OA03_TRAILING12_CHANNEL_ALLOCATION_NOT_EVALUABLE"
  })[status]
    ?? "OA03_TRAILING12_CHANNEL_ALLOCATION_NOT_EVALUABLE";
}

function summarizeWorkStatus(technicalStatus, horizonDecisions) {
  if (![
    "OA03_CURRENT_SCOPE_REPLICATION_COMPLETE",
    "OA03_CURRENT_SCOPE_REPLICATION_SEMANTIC_MISMATCH"
  ].includes(technicalStatus)) {
    return "M2_OA03_CURRENT_SCOPE_REPLICATION_BLOCKED";
  }
  const statuses = horizonDecisions.map((row) => row.status);
  if (statuses.every(
    (status) => status === "OA03_CURRENT_SCOPE_PERFORMANCE_SUPPORTED"
  )) {
    return "M2_OA03_CURRENT_SCOPE_REPLICATION_COMPLETE_PERFORMANCE_SUPPORTED";
  }
  if (statuses.every(
    (status) => status === "OA03_CURRENT_SCOPE_PERFORMANCE_NOT_SUPPORTED"
  )) {
    return "M2_OA03_CURRENT_SCOPE_REPLICATION_COMPLETE_PERFORMANCE_NOT_SUPPORTED";
  }
  return "M2_OA03_CURRENT_SCOPE_REPLICATION_COMPLETE_PERFORMANCE_MIXED";
}

function unexplainedDirectionalReversal(families) {
  const values = FAMILY_IDS.map(
    (family) => families[family]?.relativeWapeImprovement
  ).filter((value) => Number.isFinite(value) && value !== 0);
  return values.length === 2 && Math.sign(values[0]) !== Math.sign(values[1]);
}

function assertFormulaConfigIdentity({
  config,
  baseCandidateConfig,
  occurrenceAmountConfig
}) {
  const policy = occurrenceAmountConfig?.candidate?.occurrenceAmount;
  if (
    baseCandidateConfig?.candidate?.id !== config.formula.baseCandidateId
    || occurrenceAmountConfig?.candidate?.id
      !== "M2-current-occurrence-amount-calibration-v0.3"
    || policy?.baseCandidateId !== config.formula.baseCandidateId
    || policy?.minimumEarlierCaseCount
      !== config.formula.minimumEarlierCaseCount
    || policy?.minimumRelativeWapeImprovement
      !== config.formula.minimumRelativeWapeImprovement
    || policy?.trainingAbsoluteBiasMaximum
      !== config.formula.trainingAbsoluteBiasMaximum
    || policy?.priorStrength !== config.formula.priorStrength
    || policy?.priorOccurrenceProbability
      !== config.formula.priorOccurrenceProbability
    || policy?.minimumFactor !== config.formula.minimumFactor
    || policy?.maximumFactor !== config.formula.maximumFactor
    || JSON.stringify(policy?.eligibleSegments)
      !== JSON.stringify(config.formula.eligibleSegments)
  ) {
    throw new Error("m2_oa03_formula_identity_mismatch");
  }
}

function assertCanonicalAllocationIdentity({
  config,
  channelAllocationConfig
}) {
  const arm = channelAllocationConfig?.channelAllocation?.arms?.find(
    (candidate) => (
      candidate.armId === config.channelAllocation.canonicalArmId
    )
  );
  if (
    config.channelAllocation.canonicalContract
      !== CHANNEL_ALLOCATION_CONFIG_PATH
    || config.channelAllocation.canonicalImplementation
      !== "src/domain/m2Current/coreLegacyChannelAllocation.js"
    || config.channelAllocation.canonicalFunction
      !== "allocateM2CoreLegacyChannelShares"
    || arm?.kind !== config.channelAllocation.kind
    || arm?.windowMonths !== config.channelAllocation.windowMonths
    || channelAllocationConfig.channelAllocation.equalSplitAllowed
      !== false
    || channelAllocationConfig.channelAllocation.futureRevenueAllowed
      !== false
    || channelAllocationConfig.channelAllocation
      .resultBasedWindowSelectionAllowed !== false
    || channelAllocationConfig.channelAllocation
      .requiredConservationDifferenceMinor !== 0
  ) {
    throw new Error("m2_oa03_canonical_allocation_identity_mismatch");
  }
}

function assertPortableImplementation(source) {
  const withoutUrlProtocol = source.replaceAll("https://", "");
  if (
    /[A-Za-z]:[\\/]/u.test(withoutUrlProtocol)
    || /\/(?:home|Users|private|tmp|var)(?:\/|\\)/u.test(
      withoutUrlProtocol
    )
    || /["'][0-9a-f]{40}["']/u.test(source)
    || /pr\.number\s*!==\s*\d+/u.test(source)
  ) {
    throw new Error("m2_oa03_nonportable_implementation_detected");
  }
}

function assertRuntimeAuthorization(value, preflight) {
  if (
    value?.schema
      !== "m2.current.oa03_runtime_authorization.private.v0.1"
    || value?.status !== "AUTHORIZED_FOR_ONE_LOGICAL_EXECUTION"
    || value?.experimentId !== EXPERIMENT_ID
    || value?.capabilityId !== CAPABILITY_ID
    || value?.executionHead !== preflight.head
    || value?.branch !== preflight.branch
    || value?.prNumber !== preflight.prNumber
    || value?.exactHeadCiRunId !== preflight.ciRunId
    || value?.singleLogicalExecution !== true
    || value?.validResultFreezesAuthorization !== true
    || value?.laterOrFinalHoldoutAuthorized !== false
    || value?.providerAuthorized !== false
    || value?.databaseAuthorized !== false
    || value?.productionAuthorized !== false
    || value?.releaseAuthorized !== false
  ) {
    throw new Error("m2_oa03_runtime_authorization_invalid");
  }
}

function assertM2Oa03PublicDevelopment(value, config) {
  if (
    value?.schema
      !== "m2.current.oa03_current_scope_replication.public.v0.1"
    || value?.experiment?.stableExperimentId !== EXPERIMENT_ID
    || value?.model?.stableModelId !== "M2-WORK-OA03"
    || !config.decisionPolicy.technicalReplicationStates.includes(
      value?.technicalReplication?.status
    )
    || !config.decisionPolicy.summaryStates.includes(value?.summaryStatus)
    || value?.target?.actualDefinitionId !== ACTUAL_ID
    || value?.model?.activeCandidate !== null
    || value?.model?.approvedForAutomation !== null
    || value?.boundaries?.laterOrFinalHoldoutOpened !== false
    || value?.boundaries?.providerUsed !== false
    || value?.boundaries?.databaseUsed !== false
    || value?.boundaries?.productionChanged !== false
    || value?.boundaries?.releaseAuthorized !== false
    || value?.boundaries?.privateIdentityPublished !== false
  ) {
    throw new Error("m2_oa03_public_development_invalid");
  }
  assertPublicPrivacy(value, config);
}

function assertM2Oa03PublicAllocation(value, config) {
  if (
    value?.schema
      !== "m2.current.oa03_trailing12_channel_allocation.public.v0.1"
    || value?.experiment?.stableExperimentId !== EXPERIMENT_ID
    || value?.allocationContract?.windowMonths !== 12
    || value?.allocationContract?.equalSplitAllowed !== false
    || value?.allocationContract
      ?.resultBasedWindowSelectionAllowed !== false
    || value?.boundaries?.futureActualShareUsed !== false
    || value?.boundaries?.workTotalPredictionChanged !== false
    || value?.boundaries?.productionChanged !== false
    || value?.boundaries?.privateIdentityPublished !== false
  ) {
    throw new Error("m2_oa03_public_allocation_invalid");
  }
  assertPublicPrivacy(value, config);
}

function assertPublicPrivacy(value, config) {
  const text = JSON.stringify(value);
  for (const field of config.publicPrivacy.prohibitedFields) {
    if (new RegExp(`"${escapeRegExp(field)}"\\s*:`, "u").test(text)) {
      throw new Error(`m2_oa03_public_private_field_${field}`);
    }
  }
  if (
    /data[\\/](?:private-input|private-output)/u.test(text)
    || /"PRIVATE_(?:WORK|CHANNEL)[^"]*"/u.test(text)
  ) {
    throw new Error("m2_oa03_public_private_identity_detected");
  }
}

function capabilityInventory(root) {
  const catalog = loadCapabilityCatalog(path.join(
    root,
    "config/development-capability-catalog.v0.1.json"
  ));
  return evaluateCapability(catalog, CAPABILITY_ID, { repoRoot: root });
}

function resolvePrivateDirectory(root, relativePath) {
  if (
    path.isAbsolute(relativePath)
    || !relativePath.replaceAll("\\", "/")
      .startsWith("data/private-output/")
  ) {
    throw new Error("m2_oa03_private_directory_invalid");
  }
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  const relative = path.relative(resolvedRoot, resolved);
  if (
    relative === ".."
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)
  ) {
    throw new Error("m2_oa03_private_directory_escape");
  }
  return resolved;
}

function denseMonthlyRows(months, start, end) {
  const output = [];
  for (let serial = start; serial <= end; serial += 1) {
    output.push({
      month: serialToMonth(serial),
      cash: Number(months.get(serial) ?? 0)
    });
  }
  return output;
}

function workKey(row) {
  return [
    String(row.standardWorkId),
    String(row.origin),
    String(Number(row.horizonMonths))
  ].join("\u0000");
}

function channelKey(row) {
  return `${workKey(row)}\u0000${String(row.channelUid)}`;
}

function channelComparisonKey(row) {
  return [
    row.evaluationFamily,
    row.populationId,
    channelKey(row)
  ].join("\u001f");
}

function belongsToPopulation(row, populationId) {
  return ({
    CORE80: row.core80,
    CORE90: row.core90
  })[populationId] === true;
}

function comparePrivateCase(left, right) {
  return (
    String(left.evaluationFamily ?? "")
      .localeCompare(String(right.evaluationFamily ?? ""))
    || String(left.populationId ?? "")
      .localeCompare(String(right.populationId ?? ""))
    || String(left.origin ?? "").localeCompare(String(right.origin ?? ""))
    || Number(left.horizonMonths ?? 0) - Number(right.horizonMonths ?? 0)
    || String(left.standardWorkId ?? "")
      .localeCompare(String(right.standardWorkId ?? ""), "en")
    || String(left.channelUid ?? "")
      .localeCompare(String(right.channelUid ?? ""), "en")
  );
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

function summarizeCountBy(values, field) {
  return Object.freeze(Object.fromEntries(
    [...groupBy(values, (row) => String(row[field]))]
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([value, rows]) => [value, rows.length])
  ));
}

function uniqueIndex(values, keyOf) {
  const output = new Map();
  for (const value of values) {
    const key = keyOf(value);
    if (output.has(key)) {
      throw new Error("m2_oa03_duplicate_comparison_case");
    }
    output.set(key, value);
  }
  return output;
}

function stableSeedOffset(...values) {
  const digest = crypto.createHash("sha256")
    .update(values.join("\u0000"))
    .digest();
  return digest.readUInt32BE(0) % 100_000;
}

function repositoryRelative(root, filePath) {
  const relative = path.relative(path.resolve(root), path.resolve(filePath));
  if (
    relative === ".."
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)
  ) {
    throw new Error("m2_oa03_repository_relative_path_escape");
  }
  return relative.replaceAll("\\", "/");
}

function runCommand(root, executable, args) {
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    shell: false,
    maxBuffer: 64 * 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error(
      `m2_oa03_command_failed_${path.basename(executable)}:`
      + `${String(result.stderr ?? "").trim()}`
    );
  }
  return {
    stdout: String(result.stdout ?? ""),
    stderr: String(result.stderr ?? ""),
    status: result.status
  };
}

function lastJsonLine(value) {
  const lines = String(value).trim().split(/\r?\n/u).filter(Boolean);
  if (lines.length === 0) {
    throw new Error("m2_oa03_command_json_missing");
  }
  return JSON.parse(lines.at(-1));
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
  return (await readFile(filePath, "utf8"))
    .split(/\r?\n/u)
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
}

async function readNdjsonIfPresent(filePath) {
  try {
    return await readNdjson(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function writeNdjson(filePath, rows) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const text = rows.map(
    (row) => JSON.stringify(row)
  ).join("\n") + (rows.length > 0 ? "\n" : "");
  await writeFile(filePath, text, "utf8");
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
  const information = await stat(filePath);
  return Object.freeze({
    byteCount: information.size,
    sha256: await sha256File(filePath)
  });
}

async function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  const stream = fs.createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest("hex");
}

function safeErrorCode(error) {
  const value = String(error?.code ?? error?.message ?? "unknown_error");
  return value.replace(/[^A-Za-z0-9_.:-]/gu, "_").slice(0, 240);
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value), 0);
}

function mean(values) {
  return values.length > 0 ? sum(values) / values.length : null;
}

function maximum(values) {
  return values.length > 0 ? Math.max(...values) : 0;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
