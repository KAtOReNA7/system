import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  writeFile
} from "node:fs/promises";
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
  "config/m2-publishing-scale-execution-policy.v0.2.json";
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
  const attemptNumber = authorizeAttempt(previousReceipts, policy);
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
    infrastructureRecoveryRetry: attemptNumber === 2,
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
    startTime: new Date().toISOString(),
    modelId: M2_PUBLISHING_SCALE_MODEL_ID,
    experimentArmId: M2_PUBLISHING_SCALE_ARM_ID,
    expectedCandidateId: M2_PUBLISHING_SCALE_RAW_CANDIDATE_ID,
    materializerId: M2_PUBLISHING_SCALE_MATERIALIZER_ID,
    receiptControllerId: M2_PUBLISHING_SCALE_RECEIPT_CONTROLLER_ID,
    outputFiles,
    attemptNumber,
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
  const execution = await prepareM2PublishingScaleExecution({
    root,
    gitPreflight,
    command: "npm run develop:m2:current:publishing-scale-channel",
    environment: `${process.platform}-${process.arch}`
  });
  try {
    invokePublishingScalePrivateMaterializer({
      root,
      authorizationFile: execution.authorizationFile,
      receiptFile: execution.receiptFile
    });
    const config = JSON.parse(await readFile(
      path.join(root, CONFIG_PATH),
      "utf8"
    ));
    const result = await runM2PublishingScalePrivateDevelopment({
      root,
      privateDirectory: execution.privateDirectory,
      sourceDirectory: path.join(
        root,
        config.privateOutputs.historicalSourceDirectory
      ),
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
    candidateFitStarted === false
    && predictionRowsProduced === 0
    && evaluationRowsProduced === 0
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
    policy?.schema !== "m2.publishing_scale.execution_policy.v0.2"
    || policy?.status
      !== "USER_AUTHORIZED_RUNTIME_EXACT_HEAD_BINDING_REQUIRED"
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
    || policy?.executionWindow?.normalPrivateExecutionMaximum !== 1
    || policy?.executionWindow?.infrastructureRecoveryRetryMaximum !== 1
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

async function readPreviousReceipts(directory, prefix) {
  let files;
  try {
    files = await readdir(directory);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const receiptFiles = files.filter(
    (file) => file.startsWith(`${prefix}-`) && file.endsWith(".json")
  ).sort();
  return Promise.all(receiptFiles.map(async (file) => ({
    file,
    value: JSON.parse(await readFile(path.join(directory, file), "utf8"))
  })));
}

function authorizeAttempt(previousReceipts, policy) {
  if (previousReceipts.length === 0) return 1;
  if (previousReceipts.length > policy.executionWindow
    .infrastructureRecoveryRetryMaximum) {
    throw new Error("m2_publishing_scale_execution_window_exhausted");
  }
  const previous = previousReceipts.at(-1).value;
  if (
    previous.candidateFitStarted === true
    || Number(previous.predictionRowsProduced ?? 0) !== 0
    || Number(previous.evaluationRowsProduced ?? 0) !== 0
    || previous.status !== "FAILED_CLOSED_BEFORE_CANDIDATE_FIT_STARTED"
    || previous.infrastructureRecoveryEligible !== true
  ) {
    throw new Error("m2_publishing_scale_infrastructure_retry_not_eligible");
  }
  return 2;
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
