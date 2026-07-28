import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  writeFile
} from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";

import {
  inspectM2PublishingScaleDesignContracts,
  M2_PUBLISHING_SCALE_ARM_ID,
  M2_PUBLISHING_SCALE_MATERIALIZER_ID,
  M2_PUBLISHING_SCALE_MODEL_ID,
  M2_PUBLISHING_SCALE_RAW_CANDIDATE_ID,
  M2_PUBLISHING_SCALE_RECEIPT_CONTROLLER_ID,
  validateM2PublishingScaleConfig
} from "../../src/domain/m2Current/publishingScaleChannelCore.js";
import {
  runM2PublishingScalePrivateDevelopment
} from "./channel_generative_mode.mjs";

const CONFIG_PATH =
  "config/m2-current-publishing-scale-channel.v0.1.json";
const SUPPORT_PATH =
  "config/m2-publishing-scale-statistical-support.v1.json";
const POLICY_PATH =
  "config/m2-publishing-scale-execution-policy.v0.3.json";
const MATERIALIZER_PATH =
  "scripts/m2-current/materialize_human_anchored_cases.py";
const MATERIALIZER_PREFLIGHT_ARGUMENT = "--publishing-scale-preflight";
const MATERIALIZER_PRIVATE_ARGUMENT = "--publishing-scale-channel";

export async function runM2PublishingScaleCommandPreflight({ root }) {
  const { config, support, policy } = await readContracts(root);
  const designContracts = inspectM2PublishingScaleDesignContracts(config);
  assertExecutionPolicy(policy, config);
  const receiptPlan = planM2PublishingScaleReceiptController({
    config,
    policy
  });
  const materializer = invokePublishingScaleMaterializerPreflight(root);
  assertMaterializerPreflight(materializer, config);
  const result = Object.freeze({
    schema: "m2.current.publishing_scale_channel_command_preflight.v0.2",
    status: "READY_FOR_AUTHORIZED_PRIVATE_EXECUTION",
    modelId: M2_PUBLISHING_SCALE_MODEL_ID,
    experimentArmId: M2_PUBLISHING_SCALE_ARM_ID,
    materializerId: M2_PUBLISHING_SCALE_MATERIALIZER_ID,
    receiptControllerId: M2_PUBLISHING_SCALE_RECEIPT_CONTROLLER_ID,
    command:
      "npm run develop:m2:current:publishing-scale-channel -- --preflight-only",
    dispatch: Object.freeze({
      packageScriptSelected: true,
      publishingScaleRunnerSelected: true,
      publishingScaleMaterializerInvocationCount: 1,
      legacyChannelGenerativeMaterializerInvocationCount: 0,
      legacyChannelGenerativeMaterializerSelected: false,
      legacyAuthorizationChecked: false,
      modelAndArmBindingValidated: true,
      configAndSupportBindingValidated: true,
      receiptControllerPlanned: receiptPlan.status === "PLANNED_NO_WRITE",
      outputPathsPlanned: true
    }),
    staticContracts: Object.freeze({
      legacyFixedEligibilityUsed: false,
      monthlyRowsUsedAsIndependentWorks: false,
      taxonomyTier: "REPORT_ONLY",
      taxonomyParametersEstimated: false,
      taxonomyRoutingUsed: false,
      authorizationTier: "REPORT_ONLY",
      authorizationParametersEstimated: false,
      authorizationRoutingUsed: false,
      directFitNodeCount: support.currentFreezeDecision.directFitNodeCount,
      designContracts
    }),
    privateArtifactRowsRead: 0,
    candidateFitStarted: false,
    predictionRowsProduced: 0,
    evaluationRowsProduced: 0,
    privateOutputWrites: 0,
    externalNetworkCalls: 0,
    databaseWrites: 0,
    productionWrites: 0
  });
  process.stdout.write(JSON.stringify(result) + "\n");
  return result;
}

export function verifyM2PublishingScaleGitAndCiPreflight({ root }) {
  const status = runCommand(root, "git", ["status", "--porcelain"]);
  if (status.stdout.trim() !== "") {
    throw new Error("m2_publishing_scale_worktree_not_clean");
  }
  const branch = runCommand(
    root,
    "git",
    ["branch", "--show-current"]
  ).stdout.trim();
  const head = runCommand(root, "git", ["rev-parse", "HEAD"]).stdout.trim();
  const upstream = runCommand(
    root,
    "git",
    ["rev-parse", "@{upstream}"]
  ).stdout.trim();
  if (head !== upstream) {
    throw new Error("m2_publishing_scale_upstream_not_exact_head");
  }
  const ancestor = spawnSync(
    "git",
    ["merge-base", "--is-ancestor", "origin/main", "HEAD"],
    { cwd: root, encoding: "utf8", windowsHide: true }
  );
  if (ancestor.status !== 0) {
    throw new Error("m2_publishing_scale_origin_main_not_ancestor");
  }
  const pr = JSON.parse(runCommand(
    root,
    "gh",
    [
      "pr",
      "view",
      "--json",
      "number,state,isDraft,mergedAt,baseRefName,headRefName,headRefOid,statusCheckRollup"
    ]
  ).stdout);
  if (
    pr.state !== "OPEN"
    || pr.isDraft !== true
    || pr.mergedAt !== null
    || pr.baseRefName !== "main"
    || pr.headRefName !== branch
    || pr.headRefOid !== head
  ) {
    throw new Error("m2_publishing_scale_active_draft_pr_exact_head_invalid");
  }
  const checks = new Map((pr.statusCheckRollup ?? []).map((check) => [
    String(check.name ?? check.context),
    String(check.conclusion ?? check.state ?? check.status)
  ]));
  for (const checkName of ["verify", "verify-windows"]) {
    if (checks.get(checkName) !== "SUCCESS") {
      throw new Error(
        `m2_publishing_scale_exact_head_ci_not_success:${checkName}`
      );
    }
  }
  return Object.freeze({
    checkedAt: new Date().toISOString(),
    branch,
    head,
    upstream,
    originMain: runCommand(
      root,
      "git",
      ["rev-parse", "origin/main"]
    ).stdout.trim(),
    prNumber: pr.number,
    prHead: pr.headRefOid,
    prBase: pr.baseRefName,
    prDraft: pr.isDraft,
    linuxCheck: checks.get("verify"),
    windowsCheck: checks.get("verify-windows"),
    worktreeClean: true
  });
}

export async function prepareM2PublishingScaleExecution({
  root,
  gitPreflight,
  prepared,
  command,
  environment
}) {
  const { config, support, policy, texts } = await readContracts(root);
  assertExecutionPolicy(policy, config);
  const privateDirectory = path.join(root, config.privateOutputs.directory);
  const previousReceipts = await readPreviousReceipts(
    privateDirectory,
    config.privateOutputs.runReceiptPrefix
  );
  const recoveredReceipts = await recoverInterruptedPreviousReceipt({
    directory: privateDirectory,
    previousReceipts,
    policy
  });
  const attemptNumber = authorizeAttempt(recoveredReceipts, policy);
  const previousAttempt = recoveredReceipts.at(-1)?.value ?? null;
  const retryAuthorizationBasis = attemptNumber === 1
    ? null
    : Object.freeze({
      previousAttemptNumber: previousAttempt?.attemptNumber ?? null,
      previousFailureCode: previousAttempt?.failureCode ?? null,
      failureClassUnderCurrentPolicy:
        previousAttempt?.infrastructureFailureClass
        ?? classifyInfrastructureFailure(previousAttempt?.failureCode),
      previousReceiptRewritten: false,
      validEvaluationPreviouslyProduced: false
    });
  const suffix = `${gitPreflight.head.slice(0, 12)}-attempt-${attemptNumber}`;
  const authorizationFile =
    `${path.parse(config.privateOutputs.runtimeAuthorization).name}-`
    + `${suffix}.json`;
  const receiptFile =
    `${config.privateOutputs.runReceiptPrefix}-${suffix}.json`;
  const outputFiles = Object.freeze(Object.fromEntries(
    [
      "primaryMonthlyCases",
      "auxiliaryMonthlyCases",
      "materializationManifest",
      "evaluationRows",
      "evaluationManifest"
    ].map((key) => [
      key,
      versionPrivateOutputFilename(config.privateOutputs[key], suffix)
    ])
  ));
  const authorizationPath = path.join(privateDirectory, authorizationFile);
  const receiptPath = path.join(privateDirectory, receiptFile);
  if (
    await readOptionalJson(authorizationPath) !== null
    || await readOptionalJson(receiptPath) !== null
    || await anyFileExists(
      privateDirectory,
      Object.values(outputFiles)
    )
  ) {
    throw new Error("m2_publishing_scale_execution_artifact_collision");
  }
  const runtimeAuthorization = {
    schema: "m2.publishing_scale.runtime_execution_authorization.private.v0.2",
    tracked: false,
    status: "ACTIVE_FOR_ONE_LOGICAL_EXECUTION_WINDOW",
    authorizationPolicyId: policy.authorizationPolicyId,
    authorizationSourceSha256: policy.authorizationSource.sha256,
    authorizedModelId: M2_PUBLISHING_SCALE_MODEL_ID,
    authorizedArmId: M2_PUBLISHING_SCALE_ARM_ID,
    authorizedCommand: policy.authorizedCommand,
    exactHead: gitPreflight.head,
    pullRequestNumber: gitPreflight.prNumber,
    branch: gitPreflight.branch,
    attemptNumber,
    normalExecution: attemptNumber === 1,
    infrastructureRecoveryRetry: attemptNumber > 1,
    retryAuthorizationBasis,
    createdAt: new Date().toISOString(),
    finalHoldoutAuthorized: false,
    productionAuthorized: false,
    mergeAuthorized: false
  };
  const receipt = {
    schema: "m2.current.publishing_scale_channel_run_receipt_private.v0.2",
    tracked: false,
    status: "PREPARED_BEFORE_PRIVATE_MATERIALIZATION",
    authorizationPolicyId: policy.authorizationPolicyId,
    runtimeAuthorizationFile: authorizationFile,
    implementationCommit: gitPreflight.head,
    codeSha256: digest(texts.sourceText),
    configSha256: digest(texts.configText),
    supportContractSha256: digest(texts.supportText),
    executionPolicySha256: digest(texts.policyText),
    command,
    environment,
    nodeVersion: process.version,
    executionProcessId: process.pid,
    startTime: new Date().toISOString(),
    modelId: M2_PUBLISHING_SCALE_MODEL_ID,
    experimentArmId: M2_PUBLISHING_SCALE_ARM_ID,
    expectedCandidateId: M2_PUBLISHING_SCALE_RAW_CANDIDATE_ID,
    materializerId: M2_PUBLISHING_SCALE_MATERIALIZER_ID,
    receiptControllerId: M2_PUBLISHING_SCALE_RECEIPT_CONTROLLER_ID,
    outputFiles,
    preparedBundle: {
      runId: prepared.receipt.runId,
      relativeDirectory: prepared.relativeDirectory,
      receiptFile: config.privateOutputs.preparationReceipt,
      preparedFiles: prepared.receipt.preparedFiles,
      normalizedContentDigests:
        prepared.receipt.normalizedContentDigests
    },
    attemptNumber,
    retryAuthorizationBasis,
    gitPreflight,
    privateMaterializationStarted: false,
    privateRowsRead: 0,
    candidateFitStarted: false,
    candidateOutputFrozen: false,
    predictionRowsProduced: 0,
    evaluationStarted: false,
    evaluationRowsProduced: 0,
    evaluationComplete: false,
    finalHoldoutOpened: false,
    productionModified: false
  };
  await mkdir(privateDirectory, { recursive: true });
  await writeFile(
    authorizationPath,
    JSON.stringify(runtimeAuthorization, null, 2) + "\n",
    { encoding: "utf8", flag: "wx" }
  );
  await writeFile(
    receiptPath,
    JSON.stringify(receipt, null, 2) + "\n",
    { encoding: "utf8", flag: "wx" }
  );
  return {
    privateDirectory,
    authorizationFile,
    authorizationPath,
    receiptFile,
    receiptPath,
    runtimeAuthorization,
    receipt
  };
}

export async function runM2PublishingScaleAuthorizedExecution({ root }) {
  const gitPreflight = verifyM2PublishingScaleGitAndCiPreflight({ root });
  const prepared = await ensureM2PublishingScalePreparation({
    root,
    exactHead: gitPreflight.head
  });
  const execution = await prepareM2PublishingScaleExecution({
    root,
    gitPreflight,
    prepared,
    command: "npm run develop:m2:current:publishing-scale-channel",
    environment: `${process.platform}-${process.arch}`
  });
  try {
    await attachPreparedPublishingScaleMaterialization({
      execution,
      prepared
    });
    const result = await runM2PublishingScalePrivateDevelopment({
      root,
      privateDirectory: execution.privateDirectory,
      sourceDirectory: prepared.directory,
      restatementDirectory: prepared.directory,
      receiptPath: execution.receiptPath
    });
    await closeRuntimeAuthorization(
      execution.authorizationPath,
      "CLOSED_COMPLETED",
      result.finalStatus
    );
    return result;
  } catch (error) {
    const failure = await recordPublishingScaleExecutionFailure({
      receiptPath: execution.receiptPath,
      error
    });
    await closeRuntimeAuthorization(
      execution.authorizationPath,
      "CLOSED_FAILED",
      failure.status
    );
    throw error;
  }
}

async function ensureM2PublishingScalePreparation({ root, exactHead }) {
  let prepared = await findLatestPreparedBundle({ root, exactHead });
  if (prepared !== null) return prepared;
  runNode(root, [
    "--max-old-space-size=8192",
    "scripts/m2-current/prepare_m2_publishing_scale_channel.mjs"
  ]);
  prepared = await findLatestPreparedBundle({ root, exactHead });
  if (prepared === null) {
    throw new Error("m2_publishing_scale_cache_rebuild_missing_after_prepare");
  }
  return prepared;
}

async function findLatestPreparedBundle({ root, exactHead }) {
  const config = JSON.parse(await readFile(path.join(root, CONFIG_PATH), "utf8"));
  const relativeRoot = config.privateOutputs.preparationDirectory;
  const directoryRoot = resolvePrivateDirectory(root, relativeRoot);
  let entries;
  try {
    entries = await readdir(directoryRoot, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  const directories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();
  for (const runId of directories) {
    const directory = path.join(directoryRoot, runId);
    const receipt = await readOptionalJson(path.join(
      directory,
      config.privateOutputs.preparationReceipt
    ));
    if (
      receipt?.status !== "COMPLETE"
      || receipt?.exactHead !== exactHead
      || receipt?.modelId !== M2_PUBLISHING_SCALE_MODEL_ID
      || receipt?.experimentArmId !== M2_PUBLISHING_SCALE_ARM_ID
    ) {
      continue;
    }
    await verifyPreparedBundle(directory, receipt);
    return {
      directory,
      relativeDirectory: path.posix.join(
        relativeRoot.replaceAll("\\", "/"),
        runId
      ),
      receipt
    };
  }
  return null;
}

async function verifyPreparedBundle(directory, receipt) {
  for (const [role, filename] of Object.entries(receipt.preparedFiles ?? {})) {
    if (
      typeof filename !== "string"
      || path.basename(filename) !== filename
      || filename.includes("/")
      || filename.includes("\\")
    ) {
      throw new Error(`m2_publishing_scale_prepared_filename_invalid:${role}`);
    }
    const contents = await readFile(path.join(directory, filename));
    if (digest(contents) !== receipt.normalizedContentDigests?.[role]) {
      throw new Error(`m2_publishing_scale_prepared_digest_mismatch:${role}`);
    }
  }
}

async function attachPreparedPublishingScaleMaterialization({
  execution,
  prepared
}) {
  const receipt = await readOptionalJson(execution.receiptPath);
  if (receipt?.status !== "PREPARED_BEFORE_PRIVATE_MATERIALIZATION") {
    throw new Error("m2_publishing_scale_receipt_control_flow_invalid");
  }
  const roles = [
    "primaryMonthlyCases",
    "auxiliaryMonthlyCases",
    "materializationManifest"
  ];
  for (const role of roles) {
    await copyFile(
      path.join(prepared.directory, prepared.receipt.preparedFiles[role]),
      path.join(execution.privateDirectory, receipt.outputFiles[role]),
      fsConstants.COPYFILE_EXCL
    );
  }
  const materialization = JSON.parse(await readFile(
    path.join(
      execution.privateDirectory,
      receipt.outputFiles.materializationManifest
    ),
    "utf8"
  ));
  await writeFile(
    execution.receiptPath,
    JSON.stringify({
      ...receipt,
      status: "PRIVATE_MATERIALIZATION_COMPLETE",
      privateMaterializationStarted: true,
      privateMaterializationComplete: true,
      privateRowsRead:
        Number(materialization.primaryPackedRowCount)
        + Number(materialization.auxiliaryPackedRowCount),
      materializedPrimaryPackedRows:
        materialization.primaryPackedRowCount,
      materializedStrictPackedRows:
        materialization.auxiliaryPackedRowCount,
      preparedBundleVerified: true
    }, null, 2) + "\n",
    "utf8"
  );
}

export function invokePublishingScalePrivateMaterializer({
  root,
  authorizationFile,
  receiptFile
}) {
  return runNode(root, [
    "scripts/run-codex-python.mjs",
    MATERIALIZER_PATH,
    MATERIALIZER_PRIVATE_ARGUMENT,
    "--execution-authorization",
    authorizationFile,
    "--run-receipt",
    receiptFile
  ]);
}

async function recordPublishingScaleExecutionFailure({
  receiptPath,
  error
}) {
  const receipt = await readOptionalJson(receiptPath);
  if (receipt === null || receipt.status === "COMPLETED") return receipt;
  const failureCode = String(error?.code ?? error?.message ?? error);
  const candidateFitStarted = receipt.candidateFitStarted === true;
  const predictionRowsProduced = Number(
    receipt.predictionRowsProduced ?? 0
  );
  const evaluationRowsProduced = Number(
    receipt.evaluationRowsProduced ?? 0
  );
  const infrastructureFailureClass =
    classifyInfrastructureFailure(failureCode);
  const infrastructureRecoveryEligible = (
    receipt.evaluationComplete !== true
    && infrastructureFailureClass !== null
  );
  const failure = {
    ...receipt,
    status: candidateFitStarted
      ? "FAILED_CLOSED_AFTER_CANDIDATE_FIT_STARTED"
      : "FAILED_CLOSED_BEFORE_CANDIDATE_FIT_STARTED",
    failedAt: new Date().toISOString(),
    failureCode,
    failureStage: receipt.status,
    candidateFitStarted,
    predictionRowsProduced,
    evaluationRowsProduced,
    infrastructureFailureClass,
    infrastructureRecoveryEligible,
    interpretableRawCandidateEvaluationProduced: false,
    evaluationComplete: false,
    finalHoldoutOpened: false,
    productionModified: false
  };
  await writeFile(
    receiptPath,
    JSON.stringify(failure, null, 2) + "\n",
    "utf8"
  );
  return failure;
}

function classifyInfrastructureFailure(failureCode) {
  const patterns = [
    ["runner_dispatch", /dispatch|controller|requires_v0_2/u],
    [
      "file_io",
      /ENOENT|EACCES|FileNotFoundError|PermissionError|no such file|file_io/iu
    ],
    [
      "path_resolution",
      /path_resolution|invalid_path|artifact filename invalid/iu
    ],
    [
      "receipt_control_flow",
      /receipt_control_flow|receipt.*(?:invalid|differs|collision)|authorization.*(?:invalid|differs)/iu
    ],
    [
      "schema_wiring",
      /schema_wiring|versioned output (?:plan|identity) invalid/iu
    ],
    [
      "cache_rebuild",
      /cache_rebuild|prepared_(?:digest|filename)|rebuild_(?:incomplete|missing)/iu
    ],
    [
      "temporary_directory",
      /temporary_directory|temp(?:orary)? directory/iu
    ],
    [
      "memory",
      /heap out of memory|ENOMEM|memory/iu
    ],
    [
      "process_termination",
      /process_terminated_before_valid_evaluation/iu
    ],
    [
      "deterministic_implementation",
      /deterministic_implementation|conservation|duplicate case key|G0_paired_(?:work|channel|population)/iu
    ]
  ];
  return patterns.find(([, pattern]) => pattern.test(failureCode))?.[0]
    ?? null;
}

async function closeRuntimeAuthorization(filePath, status, resultStatus) {
  const authorization = await readOptionalJson(filePath);
  if (authorization === null) return;
  await writeFile(
    filePath,
    JSON.stringify({
      ...authorization,
      status,
      closedAt: new Date().toISOString(),
      resultStatus
    }, null, 2) + "\n",
    "utf8"
  );
}

export function planM2PublishingScaleReceiptController({
  config,
  policy
}) {
  if (
    config.receiptControllerId
      !== M2_PUBLISHING_SCALE_RECEIPT_CONTROLLER_ID
    || policy.authorizedModelId !== M2_PUBLISHING_SCALE_MODEL_ID
    || policy.authorizedArmId !== M2_PUBLISHING_SCALE_ARM_ID
  ) {
    throw new Error("m2_publishing_scale_receipt_controller_binding_invalid");
  }
  return Object.freeze({
    status: "PLANNED_NO_WRITE",
    receiptControllerId: M2_PUBLISHING_SCALE_RECEIPT_CONTROLLER_ID,
    outputDirectory: config.privateOutputs.directory,
    runtimeAuthorizationFile: config.privateOutputs.runtimeAuthorization,
    receiptPrefix: config.privateOutputs.runReceiptPrefix
  });
}

export function assertExecutionPolicy(policy, config) {
  if (
    policy?.schema !== "m2.publishing_scale.execution_policy.v0.3"
    || policy?.status
      !== "USER_AUTHORIZED_FIRST_VALID_RAW_EVALUATION"
    || policy?.authorizedModelId !== M2_PUBLISHING_SCALE_MODEL_ID
    || policy?.authorizedArmId !== M2_PUBLISHING_SCALE_ARM_ID
    || policy?.authorizedCommand
      !== "npm run develop:m2:current:publishing-scale-channel"
    || policy?.runtimeBinding?.exactHeadRequired !== true
    || policy?.runtimeBinding?.openDraftPullRequestRequired !== true
    || policy?.runtimeBinding?.bothChecksMustSucceedBeforePrivateRead !== true
    || policy?.historicalAuthorization
      ?.historicalConsumedFieldsMayBeRewritten !== false
    || policy?.historicalAuthorization
      ?.historicalReceiptsMayBeOverwritten !== false
    || policy?.historicalAuthorization
      ?.historicalArtifactsMayBeOverwritten !== false
    || policy?.executionWindow
      ?.firstValidRawCandidateEvaluationMaximum !== 1
    || policy?.executionWindow
      ?.infrastructureRetryAllowedBeforeValidEvaluation !== true
    || policy?.executionWindow
      ?.invalidAttemptReceiptRequired !== true
    || policy?.executionWindow
      ?.retryAfterValidEvaluationAllowed !== false
    || policy?.privateArtifactPolicy
      ?.derivedCacheMissingRequiresAutomaticRebuild !== true
    || policy?.privateArtifactPolicy
      ?.historicalReceiptMissingBlocks !== false
    || policy?.forbidden?.finalHoldout !== true
    || policy?.forbidden?.production !== true
    || policy?.forbidden?.pullRequestMerge !== true
    || config?.executionPolicy !== POLICY_PATH
  ) {
    throw new Error("m2_publishing_scale_execution_policy_invalid");
  }
}

async function readContracts(root) {
  const [configText, supportText, policyText, sourceText] = await Promise.all([
    readFile(path.join(root, CONFIG_PATH), "utf8"),
    readFile(path.join(root, SUPPORT_PATH), "utf8"),
    readFile(path.join(root, POLICY_PATH), "utf8"),
    readFile(
      path.join(root, "src/domain/m2Current/publishingScaleChannelCore.js"),
      "utf8"
    )
  ]);
  const config = JSON.parse(configText);
  const support = JSON.parse(supportText);
  const policy = JSON.parse(policyText);
  validateM2PublishingScaleConfig(config, support);
  return {
    config,
    support,
    policy,
    texts: { configText, supportText, policyText, sourceText }
  };
}

function invokePublishingScaleMaterializerPreflight(root) {
  return JSON.parse(runNode(root, [
    "scripts/run-codex-python.mjs",
    MATERIALIZER_PATH,
    MATERIALIZER_PREFLIGHT_ARGUMENT
  ]).stdout.trim());
}

function assertMaterializerPreflight(materializer, config) {
  if (
    materializer?.status !== "READY"
    || materializer?.modelId !== M2_PUBLISHING_SCALE_MODEL_ID
    || materializer?.experimentArmId !== M2_PUBLISHING_SCALE_ARM_ID
    || materializer?.materializerId !== M2_PUBLISHING_SCALE_MATERIALIZER_ID
    || materializer?.legacyAuthorizationChecked !== false
    || materializer?.privateArtifactRowsRead !== 0
    || materializer?.privateOutputWrites !== 0
    || config.materializerId !== materializer.materializerId
  ) {
    throw new Error("m2_publishing_scale_materializer_preflight_invalid");
  }
}

export async function readPreviousReceipts(directory, prefix) {
  let files;
  try {
    files = await readdir(directory);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const receiptFiles = files.filter(
    (file) => file.startsWith(`${prefix}-`) && file.endsWith(".json")
  );
  const receipts = await Promise.all(receiptFiles.map(async (file) => ({
    file,
    value: JSON.parse(await readFile(path.join(directory, file), "utf8"))
  })));
  const attemptNumbers = new Set();
  for (const { value } of receipts) {
    const attemptNumber = Number(value.attemptNumber);
    if (!Number.isInteger(attemptNumber) || attemptNumber <= 0) {
      throw new Error("m2_publishing_scale_receipt_attempt_number_invalid");
    }
    if (attemptNumbers.has(attemptNumber)) {
      throw new Error("m2_publishing_scale_receipt_attempt_number_duplicate");
    }
    attemptNumbers.add(attemptNumber);
  }
  return receipts.sort((left, right) => (
    left.value.attemptNumber - right.value.attemptNumber
  ));
}

export async function recoverInterruptedPreviousReceipt({
  directory,
  previousReceipts,
  policy
}) {
  if (previousReceipts.length === 0) return previousReceipts;
  const latest = previousReceipts.at(-1);
  const receipt = latest.value;
  if (
    receipt.status === "COMPLETED"
    || receipt.status?.startsWith("FAILED_CLOSED_")
    || receipt.evaluationComplete === true
  ) {
    return previousReceipts;
  }
  if (
    Number.isInteger(receipt.executionProcessId)
    && receipt.executionProcessId > 0
    && processIsAlive(receipt.executionProcessId)
  ) {
    throw new Error("m2_publishing_scale_execution_already_running");
  }
  if (
    policy.executionWindow.invalidAttemptReceiptRequired !== true
    || receipt.interpretableRawCandidateEvaluationProduced === true
  ) {
    throw new Error("m2_publishing_scale_interrupted_attempt_not_recoverable");
  }
  const receiptPath = path.join(directory, latest.file);
  const failure = await recordPublishingScaleExecutionFailure({
    receiptPath,
    error: {
      code:
        "m2_publishing_scale_process_terminated_before_valid_evaluation"
    }
  });
  if (typeof receipt.runtimeAuthorizationFile === "string") {
    await closeRuntimeAuthorization(
      path.join(directory, receipt.runtimeAuthorizationFile),
      "CLOSED_FAILED",
      failure.status
    );
  }
  return previousReceipts.map((entry) => (
    entry.file === latest.file ? { ...entry, value: failure } : entry
  ));
}

function processIsAlive(processId) {
  try {
    process.kill(processId, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    if (error?.code === "EPERM") return true;
    throw error;
  }
}

export function authorizeAttempt(previousReceipts, policy) {
  if (previousReceipts.length === 0) return 1;
  if (
    previousReceipts.some(({ value }) => (
      value.evaluationComplete === true
      || value.interpretableRawCandidateEvaluationProduced === true
      || value.status === "COMPLETED"
    ))
  ) {
    throw new Error("m2_publishing_scale_valid_evaluation_already_exists");
  }
  const previous = previousReceipts.at(-1).value;
  const currentFailureClass = classifyInfrastructureFailure(
    previous.failureCode
  );
  const retryEligibleUnderCurrentPolicy = (
    previous.infrastructureRecoveryEligible === true
    || (
      previous.status?.startsWith("FAILED_CLOSED_")
      && currentFailureClass !== null
      && policy.executionWindow.allowedRetryFailureClasses
        ?.includes(currentFailureClass)
    )
  );
  if (
    policy.executionWindow.infrastructureRetryAllowedBeforeValidEvaluation
      !== true
    || retryEligibleUnderCurrentPolicy !== true
    || previous.interpretableRawCandidateEvaluationProduced === true
  ) {
    throw new Error("m2_publishing_scale_infrastructure_retry_not_eligible");
  }
  return Math.max(
    previousReceipts.length,
    ...previousReceipts.map(({ value }) => Number(value.attemptNumber ?? 0))
  ) + 1;
}

async function readOptionalJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function anyFileExists(directory, filenames) {
  for (const filename of filenames) {
    try {
      await readFile(path.join(directory, filename));
      return true;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return false;
}

function runNode(root, args) {
  return runCommand(root, process.execPath, args);
}

function runCommand(root, command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error(
      `m2_publishing_scale_command_failed:${command}:${args.join(" ")}:`
        + String(result.stderr ?? "").trim()
    );
  }
  return result;
}

function digest(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function resolvePrivateDirectory(root, relativePath) {
  if (!relativePath || path.isAbsolute(relativePath)) {
    throw new Error("m2_publishing_scale_private_directory_invalid");
  }
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  const relative = path.relative(resolvedRoot, resolved).replaceAll("\\", "/");
  if (
    relative === ".."
    || relative.startsWith("../")
    || !relative.startsWith("data/private-output/")
  ) {
    throw new Error("m2_publishing_scale_private_directory_escapes_root");
  }
  return resolved;
}

function versionPrivateOutputFilename(filename, suffix) {
  if (
    typeof filename !== "string"
    || path.basename(filename) !== filename
    || filename.includes("/")
    || filename.includes("\\")
  ) {
    throw new Error("m2_publishing_scale_private_output_filename_invalid");
  }
  const parsed = path.parse(filename);
  return `${parsed.name}-${suffix}${parsed.ext}`;
}
