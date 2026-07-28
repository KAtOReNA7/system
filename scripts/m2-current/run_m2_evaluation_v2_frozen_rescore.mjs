import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  assignMaximalAdjacentOriginBlocksV21,
  scoreConditionalAmountRowsV2,
  scoreConditionalAmountRowsV21,
  scoreIntervalRowsV21,
  scoreOccurrenceRowsV2,
  scoreOccurrenceRowsV21,
  scoreOccurrenceRowsV22,
  scorePairedPointRowsV2,
  scorePointRowsV2,
  scorePointRowsV21,
  scorePortfolioPairedV21,
  scorePortfolioPairedV22,
  scoreRankingRowsV21,
  scoreRankingRowsV22,
  scoreConditionalAmountRowsV22,
  scoreReversalRowsV22,
  scoreTopRevenueAttributionV21,
  scoreTopRevenueAttributionV22,
  validateEvaluationIdentityV21
} from "../../src/domain/m2Current/evaluationV2.js";
import {
  buildReversalScopeKeyV1,
  restateSalesShareReversalsV1
} from "../../src/domain/m2Current/reversalRestatement.js";
import {
  scoreM2CurrentProbabilisticRows
} from "../../src/domain/m2Current/metrics.js";

const rootResolution = spawnSync(
  "git",
  ["rev-parse", "--show-toplevel"],
  { cwd: process.cwd(), encoding: "utf8", windowsHide: true }
);
if (rootResolution.status !== 0 || !rootResolution.stdout.trim()) {
  throw new Error("m2_evaluation_v2_repository_root_unavailable");
}
const root = path.resolve(rootResolution.stdout.trim());
const preregistration = JSON.parse(fs.readFileSync(
  path.join(root, "config/m2-evaluation-v2-rescore-preregistration.v1.json"),
  "utf8"
));
const contractV21 = JSON.parse(fs.readFileSync(
  path.join(root, "config/m2-evaluation-contract.v2.1.json"),
  "utf8"
));
const contractV22 = JSON.parse(fs.readFileSync(
  path.join(root, "config/m2-evaluation-contract.v2.2.json"),
  "utf8"
));
const reversalContract = JSON.parse(fs.readFileSync(
  path.join(root, "config/m2-reversal-restatement.v1.json"),
  "utf8"
));
const modelRegistry = JSON.parse(fs.readFileSync(
  path.join(root, "config/m2-model-registry.v1.json"),
  "utf8"
));
let activeAuthorityScalePowerV22 = null;
const mode = process.argv.includes("--inventory")
  ? "inventory"
  : process.argv.includes("--rescore-v2-2")
    ? "rescore-v2-2"
  : process.argv.includes("--rescore-v2-1")
    ? "rescore-v2-1"
  : process.argv.includes("--rescore")
    ? "rescore"
    : null;
if (!mode) {
  console.error(
    "Usage: node scripts/m2-current/run_m2_evaluation_v2_frozen_rescore.mjs "
      + "--inventory|--rescore|--rescore-v2-1|--rescore-v2-2"
  );
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
  const inspection = await inspectNdjson(absolutePath, binding.artifactId);
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
    uniqueCaseKeyCount: inspection.uniqueCaseKeyCount,
    uniqueCaseKeysMatchRowCount:
      inspection.uniqueCaseKeyCount === inspection.rowCount,
    caseKeyFieldsComplete: inspection.caseKeyFieldsComplete,
    fields: [...inspection.fields].sort(),
    familyCounts: Object.fromEntries([...inspection.familyCounts].sort())
  });
}

const inventoryPass = inventory.every((item) =>
  item.existedBeforeTask
  && item.gitIgnored
  && item.digestMatchesPreregistration
  && item.rowCountMatchesPreregistration
  && item.uniqueCaseKeysMatchRowCount
  && item.caseKeyFieldsComplete
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
if (mode === "rescore-v2-2") {
  const resultV22 = await runV22LabelOnlyRescore(datasets, inventory);
  console.log(JSON.stringify({
    status: resultV22.status,
    contractVersion: "2.2",
    receiptPath: resultV22.receiptPath,
    publicAggregateCandidatePath: resultV22.publicAggregateCandidatePath
  }));
  process.exit(resultV22.status === "COMPLETE" ? 0 : 1);
}
if (mode === "rescore-v2-1") {
  const resultsV21 = scoreV21Datasets(datasets, inventory);
  const v1ScoreReproduction = verifyV1ScoreReproductionV21(datasets);
  const receiptV21 = {
    schema: "m2.evaluation-v2.1.frozen-rescore.private.v1",
    asOf: contractV21.asOf,
    contractVersion: contractV21.version,
    taskAnchor: preregistration.taskAnchor,
    preregistrationSha256: crypto.createHash("sha256")
      .update(fs.readFileSync(
        path.join(root, "config/m2-evaluation-v2-rescore-preregistration.v1.json")
      ))
      .digest("hex"),
    contractSha256: crypto.createHash("sha256")
      .update(fs.readFileSync(
        path.join(root, "config/m2-evaluation-contract.v2.1.json")
      ))
      .digest("hex"),
    status: "COMPLETE_AVAILABLE_GROUPS",
    v1ScoreReproduction,
    capabilityGaps: {
      mase: contractV21.missingness.missingScale,
      originVisibleRevenueScaleBand:
        contractV21.missingness.missingOriginVisibleRevenueScaleBand,
      humanAnchoredPositiveAmountExperts: {
        stableModelId: "M2-WORK-HP01",
        status: contractV21.missingness.missingRawRows
      },
      frozenTrainingPrevalence:
        contractV21.missingness.missingFrozenTrainingBaseRate
    },
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
    results: resultsV21
  };
  const receiptV21Path = path.join(
    privateDirectory,
    "M2-evaluation-v2.1-frozen-rescore-private-v1.json"
  );
  fs.writeFileSync(receiptV21Path, `${JSON.stringify(receiptV21, null, 2)}\n`);
  console.log(JSON.stringify({
    status: "COMPLETE_AVAILABLE_GROUPS",
    contractVersion: "2.1",
    comparabilityGroupCount: Object.keys(resultsV21).length,
    receiptPath: receiptV21Path
  }));
  process.exit(0);
}
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

async function runV22LabelOnlyRescore(datasets, artifactInventory) {
  const capability = resolveCapabilityV22();
  const capabilityCheck = verifyCapabilityPathsV22(capability);
  if (!capabilityCheck.ready) {
    return writeBlockedV22(
      "M2_EVALUATION_V2_2_PUBLIC_IMPLEMENTATION_COMPLETE_PRIVATE_RESCORE_BLOCKED",
      { missingRoles: capabilityCheck.missingRoles }
    );
  }
  const authority = await loadReversalAuthorityV22(capability);
  if (authority.status !== "READY") {
    return writeBlockedV22(
      "M2_EVALUATION_V2_2_BLOCKED_REVERSAL_AUTHORITY",
      authority.publicAudit
    );
  }
  activeAuthorityScalePowerV22 = authority.scalePower;
  const labels = buildRestatedLabelsV22(datasets, authority);
  const executionStatus = labels.status === "COMPLETE"
    ? "COMPLETE"
    : labels.status === "BLOCKED_UNRESOLVED_REVERSAL"
      ? "M2_EVALUATION_V2_2_BLOCKED_UNRESOLVED_REVERSAL"
      : "M2_EVALUATION_V2_2_BLOCKED_REVERSAL_AUTHORITY";
  const resultsV22 = scoreV22Datasets(
    datasets,
    labels.byGroupCaseKey,
    artifactInventory
  );
  const outputDirectory = path.join(
    root,
    "data",
    "private-output",
    reversalContract.privateOutputs.directoryRole
  );
  fs.mkdirSync(outputDirectory, { recursive: true });
  const allocationPath = path.join(
    outputDirectory,
    reversalContract.privateOutputs.allocationLedger
  );
  const allocationLines = [];
  for (const scope of labels.finalRestatement.scopes) {
    for (const allocation of scope.allocations) {
      allocationLines.push(JSON.stringify({
        reversalScopeKey: scope.reversalScopeKey,
        standardWorkId: scope.standardWorkId,
        channelMemberId: scope.channelMemberId,
        currencyScope: scope.currencyScope,
        ...allocation
      }));
    }
  }
  fs.writeFileSync(
    allocationPath,
    allocationLines.length ? `${allocationLines.join("\n")}\n` : ""
  );
  const reconciliationPath = path.join(
    outputDirectory,
    reversalContract.privateOutputs.scopeReconciliation
  );
  fs.writeFileSync(reconciliationPath, `${JSON.stringify({
    schema: "m2.reversal-restatement.scope-reconciliation.private.v1",
    actualDefinitionId:
      reversalContract.actualDefinition.stableId,
    authority: authority.privateAudit,
    scopes: labels.finalRestatement.scopes
  }, null, 2)}\n`);
  const privateRowsPath = path.join(
    outputDirectory,
    reversalContract.privateOutputs.labelOnlyRescoreRows
  );
  writeV22PrivateRescoreRows(
    privateRowsPath,
    datasets,
    labels.byGroupCaseKey
  );
  const activationBinding = contentBindingV22(artifactInventory);
  const executionHead = spawnSync(
    "git",
    ["rev-parse", "HEAD"],
    { cwd: root, encoding: "utf8", windowsHide: true }
  ).stdout.trim();
  const counters = {
    privateAuthorityRowReadCount: authority.salesShareRowCount,
    frozenPredictionRowReadCount: artifactInventory.reduce(
      (sum, item) => sum + item.rowCount,
      0
    ),
    modelExecutionCount: 0,
    trainingCount: 0,
    fittingCount: 0,
    tuningCount: 0,
    selectionCount: 0,
    predictionRowsGenerated: 0,
    predictionRowsModified: 0,
    productionChangeCount: 0
  };
  const publicAggregate = {
    schema: "m2.evaluation-v2.2.diagnostic-recheck.public-candidate.v1",
    asOf: contractV22.asOf,
    contractVersion: contractV22.version,
    status: executionStatus,
    resultStatus: labels.status === "COMPLETE"
      ? "FROZEN_PREDICTION_LABEL_ONLY_RESCORE"
      : "PARTIAL_COMPLETE_SCOPES_LABEL_ONLY_RESCORE",
    actualDefinition: reversalContract.actualDefinition,
    activationBinding,
    frozenArtifactInventory: {
      artifactCount: artifactInventory.length,
      rowCount: artifactInventory.reduce(
        (sum, item) => sum + item.rowCount,
        0
      ),
      allGitIgnored: artifactInventory.every((item) => item.gitIgnored),
      allDigestsMatched: artifactInventory.every(
        (item) => item.digestMatchesPreregistration
      ),
      predictionRowsModified: 0
    },
    authorityAudit: authority.publicAudit,
    reversalImpact: labels.publicSummary,
    authorizationCounters: counters,
    results: resultsV22,
    publicPrivacy: {
      aggregateOnly: true,
      containsRowLevelIdentity: false,
      containsPrivatePath: false
    }
  };
  const publicAggregateCandidatePath = path.join(
    outputDirectory,
    reversalContract.privateOutputs.publicAggregateCandidate
  );
  fs.writeFileSync(
    publicAggregateCandidatePath,
    `${JSON.stringify(publicAggregate, null, 2)}\n`
  );
  const receiptPathV22 = path.join(
    outputDirectory,
    reversalContract.privateOutputs.executionReceipt
  );
  const receipt = {
    schema: "m2.evaluation-v2.2.execution-receipt.private.v1",
    executionHead,
    status: executionStatus,
    actualDefinitionId: reversalContract.actualDefinition.stableId,
    activationBinding,
    authority: authority.privateAudit,
    labels: labels.privateSummary,
    authorizationCounters: counters,
    outputDigests: {
      allocationLedgerSha256: sha256PathV22(allocationPath),
      scopeReconciliationSha256: sha256PathV22(reconciliationPath),
      labelOnlyRescoreRowsSha256: sha256PathV22(privateRowsPath),
      publicAggregateCandidateSha256:
        sha256PathV22(publicAggregateCandidatePath)
    }
  };
  fs.writeFileSync(receiptPathV22, `${JSON.stringify(receipt, null, 2)}\n`);
  return {
    status: executionStatus,
    receiptPath: receiptPathV22,
    publicAggregateCandidatePath
  };
}

function resolveCapabilityV22() {
  const catalog = JSON.parse(fs.readFileSync(
    path.join(root, "config/development-capability-catalog.v0.1.json"),
    "utf8"
  ));
  const capability = catalog.capabilities.find(
    (item) => item.id === "m2-evaluation-v2-2-reversal-rescore"
  );
  if (!capability) {
    throw new Error("m2_evaluation_v2_2_capability_missing");
  }
  return capability;
}

function capabilityRolePathV22(capability, role) {
  const artifact = capability.requiredPrivateArtifacts.find(
    (item) => item.role === role
  );
  if (!artifact || artifact.kind !== "file") {
    throw new Error(`m2_evaluation_v2_2_capability_role_missing:${role}`);
  }
  return {
    relativePath: artifact.path,
    absolutePath: path.join(root, artifact.path)
  };
}

function verifyCapabilityPathsV22(capability) {
  const missingRoles = [];
  for (const artifact of capability.requiredPrivateArtifacts) {
    const absolutePath = path.join(root, artifact.path);
    const exists = fs.existsSync(absolutePath)
      && (
        artifact.kind === "file"
          ? fs.statSync(absolutePath).isFile()
          : artifact.kind === "directory"
            ? fs.statSync(absolutePath).isDirectory()
            : false
      );
    const ignored = exists && spawnSync(
      "git",
      ["check-ignore", "--quiet", "--", artifact.path],
      { cwd: root, windowsHide: true }
    ).status === 0;
    if (!exists || !ignored) missingRoles.push(artifact.role);
  }
  return {
    ready: missingRoles.length === 0,
    missingRoles
  };
}

async function loadReversalAuthorityV22(capability) {
  const preparation = spawnSync(
    process.execPath,
    [
      path.join(root, "scripts/run-codex-python.mjs"),
      "scripts/m2-current/export_m2_reversal_authority.py"
    ],
    {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024
    }
  );
  if (preparation.status !== 0) {
    return {
      status: "BLOCKED",
      publicAudit: {
        authorityExportStatus: "BLOCKED",
        authorityExportExitCode: preparation.status
      }
    };
  }
  const ledger = capabilityRolePathV22(
    capability,
    "sales-share-ledger-authority"
  );
  const outputDirectory = path.join(
    root,
    "data",
    "private-output",
    reversalContract.privateOutputs.directoryRole
  );
  const facts = {
    absolutePath: path.join(
      outputDirectory,
      reversalContract.privateOutputs.authorityFacts
    )
  };
  const receiptPath = path.join(
    outputDirectory,
    reversalContract.privateOutputs.authorityReceipt
  );
  if (!fs.existsSync(facts.absolutePath) || !fs.existsSync(receiptPath)) {
    return {
      status: "BLOCKED",
      publicAudit: {
        authorityExportStatus: "BLOCKED_OUTPUT_MISSING"
      }
    };
  }
  const authorityReceipt = JSON.parse(
    fs.readFileSync(receiptPath, "utf8")
  );
  const ledgerDigest = await sha256File(ledger.absolutePath);
  const factDigest = await sha256File(facts.absolutePath);
  const userConfirmation = JSON.parse(fs.readFileSync(
    path.join(root, "config/m2-current-user-confirmation.v0.1.json"),
    "utf8"
  ));
  const partition = JSON.parse(fs.readFileSync(
    path.join(root, "config/m2-current-human-ledger-partition.v0.1.json"),
    "utf8"
  ));
  const expectedDigest = authorityReceipt.authorityFactsSha256;
  const sourceDigest =
    authorityReceipt?.sourceDigests?.salesShare;
  const sourceDigestMatchedAuthority =
    ledgerDigest === sourceDigest;
  const partitionReady = authorityReceipt.status === "READY"
    && authorityReceipt.authorityMode
      === "user_reviewed_workbook_membership"
    && authorityReceipt.machineClassificationUsed === false
    && Array.isArray(authorityReceipt.partitionChecksPassed)
    && partition.requiredChecks.every((check) =>
      authorityReceipt.partitionChecksPassed.includes(check)
    );
  const policyReady =
    userConfirmation.negativeCashEventPolicy
      === "all_negative_cash_records_are_reversals"
    && partition.cashCategoryContract.negativeCashEventPolicy
      === "all_negative_cash_records_are_reversals"
    && partition.cashCategoryContract.classificationSource
      === "workbook_membership_only"
    && partition.cashCategoryContract.machineClassificationAllowed === false;
  if (
    !/^[a-f0-9]{64}$/.test(String(expectedDigest ?? ""))
    || factDigest !== expectedDigest
    || !/^[a-f0-9]{64}$/.test(String(sourceDigest ?? ""))
    || !sourceDigestMatchedAuthority
    || !policyReady
    || !partitionReady
  ) {
    return {
      status: "BLOCKED",
      publicAudit: {
        factDigestMatchedPayload: factDigest === expectedDigest,
        sourceDigestBound: /^[a-f0-9]{64}$/.test(
          String(sourceDigest ?? "")
        ),
        sourceDigestMatchedAuthority,
        negativeEventPolicyProven: policyReady,
        reviewedPartitionProven: partitionReady
      }
    };
  }
  const rawRows = [];
  await forEachNdjson(facts.absolutePath, (row) => {
    if (row.cashCategory === "sales_share") rawRows.push(row);
  });
  const requiredFields = [
    "authorityRecordId",
    "billMonth",
    "recordedAt",
    "standardWorkId",
    "channelMemberId",
    "actualSalesAmount",
    "cashCategory",
    "cashCategoryAuthority"
  ];
  const fieldCoverage = Object.fromEntries(requiredFields.map((field) => [
    field,
    rawRows.filter((row) =>
      row[field] !== null && row[field] !== undefined && row[field] !== ""
    ).length / rawRows.length
  ]));
  const scopeAndTimeReady = rawRows.length > 0
    && rawRows.length === authorityReceipt.rowCount
    && authorityReceipt.missingWorkCount === 0
    && authorityReceipt.missingChannelCount === 0
    && authorityReceipt.channelScopeMode
      === "user_reviewed_canonical_channel_uid"
    && authorityReceipt?.channelMasterEvidence
      ?.inconsistentCanonicalGroupCount === 0
    && Object.values(fieldCoverage).every((value) => value === 1)
    && rawRows.every((row) =>
      row.cashCategoryAuthority === "user_reviewed_workbook_membership"
      && /^\d{4}-\d{2}-\d{2}$/.test(String(row.billMonth))
      && /^\d{4}-\d{2}-\d{2}$/.test(String(row.recordedAt))
    );
  const amountTexts = rawRows.map((row) =>
    normalizeDecimalTextV22(row.actualSalesAmount)
  );
  const scalePower = amountTexts.reduce(
    (maximum, value) => Math.max(maximum, value.fraction.length),
    0
  );
  if (scalePower !== authorityReceipt.amountScalePower) {
    return {
      status: "BLOCKED",
      publicAudit: {
        authorityExportStatus: "BLOCKED_AMOUNT_SCALE_MISMATCH"
      }
    };
  }
  const scale = 10n ** BigInt(scalePower);
  const currencyScope = `authority-ledger-native-unit:${sourceDigest}`;
  const normalizedRows = rawRows.map((row, index) => {
    const amountMinor = decimalToMinorV22(
      row.actualSalesAmount,
      scalePower
    );
    return {
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
      channelMemberId: String(row.channelMemberId),
      authorityRowOrdinal: Number(row.authorityRowOrdinal ?? index + 1)
    };
  });
  const recordIds = new Set(normalizedRows.map((row) => row.recordId));
  const negativeCount = normalizedRows.filter(
    (row) => BigInt(row.amountMinor) < 0n
  ).length;
  const ready = scopeAndTimeReady
    && recordIds.size === normalizedRows.length
    && negativeCount > 0;
  return {
    status: ready ? "READY" : "BLOCKED",
    scalePower,
    scale,
    sourceDigest,
    factDigest,
    salesShareRowCount: normalizedRows.length,
    rows: normalizedRows,
    publicAudit: {
      status: ready ? "REVERSAL_AUTHORITY_PROVEN" : "BLOCKED",
      cashAuthority: "user_reviewed_sales_share_workbook_membership",
      authorityExportStatus: "READY",
      reviewedPartitionProven: partitionReady,
      negativeEventPolicy:
        "all_negative_cash_records_are_reversals",
      salesShareRowCount: normalizedRows.length,
      reversalRowCount: negativeCount,
      fieldCoverage: {
        recordIdentifier: fieldCoverage.authorityRecordId,
        postingMonth: fieldCoverage.billMonth,
        recordedAt: fieldCoverage.recordedAt,
        standardWorkMapping: fieldCoverage.standardWorkId,
        canonicalChannelMapping: fieldCoverage.channelMemberId,
        amount: fieldCoverage.actualSalesAmount,
        cashCategory: fieldCoverage.cashCategory,
        cashCategoryAuthority: fieldCoverage.cashCategoryAuthority
      },
      postingTimeField: "billMonth",
      recordedAtField: "billMonth",
      recordedAtGranularity: "month",
      channelScopeMode: authorityReceipt.channelScopeMode,
      channelMappingCoverage: authorityReceipt.missingChannelCount === 0
        ? 1
        : 1 - authorityReceipt.missingChannelCount / rawRows.length,
      channelMasterConfirmed:
        authorityReceipt?.channelMasterEvidence?.confirmedRowCount
        === authorityReceipt?.channelMasterEvidence?.rawPairCount,
      reversalScopeKeyFields: [
        "cashCategory",
        "standardWorkId",
        "channelMemberId",
        "sourceLedgerNativeCurrencyScope"
      ],
      currencyScopeMode:
        "single_digest_bound_authority_ledger_native_monetary_unit",
      contractOrSettlementFieldStatus:
        "NOT_AVAILABLE_NOT_USED_FOR_SCOPE_COLLAPSE",
      companyAggregateFallbackUsed: false,
      amountScalePower: scalePower,
      exactIntegerMinorUnits: true,
      factDigestMatchedAuthorityReceipt: factDigest === expectedDigest,
      sourceDigestMatchedAuthority,
      authorityRecordIdUnique: recordIds.size === normalizedRows.length
    },
    privateAudit: {
      sourceDigest,
      ledgerDigest,
      factDigest,
      mappingArtifactDigests:
        authorityReceipt.mappingArtifactDigests,
      channelMasterEvidence:
        authorityReceipt.channelMasterEvidence,
      scalePower,
      fieldCoverage,
      salesShareRowCount: normalizedRows.length,
      reversalRowCount: negativeCount,
      currencyScope
    }
  };
}

function buildRestatedLabelsV22(datasets, authority) {
  const cases = collectUniqueCasesV22(datasets);
  const byCutoff = new Map();
  for (const value of cases.values()) {
    const targetEnd = addMonthsV22(value.origin, value.horizonMonths);
    value.targetEnd = targetEnd;
    const values = byCutoff.get(targetEnd) ?? [];
    values.push(value);
    byCutoff.set(targetEnd, values);
  }
  const origins = [...new Set([...cases.values()].map((row) => row.origin))]
    .sort();
  const targetCutoffs = [...byCutoff.keys()].sort();
  const allCutoffs = [...new Set([...origins, ...targetCutoffs])].sort();
  const authorityStartMonth = authority.rows
    .map((row) => row.postingMonth)
    .sort()[0];
  const postingIndex = buildPostingIndexV22(authority.rows);
  const byGroupCaseKey = new Map();
  const cutoffAudit = [];
  let unresolvedResidualMinor = 0n;
  let conservationDifferenceMinor = 0n;
  let postingActualExactMismatchCount = 0;
  let postingActualMismatchCount = 0;
  let portfolioPopulationMismatchCount = 0;
  let affectedCaseCount = 0;
  let affectedWorkCaseCount = 0;
  let actualDefinitionDifferenceCaseCount = 0;
  let blockedResidualCaseCount = 0;
  let finalRestatement = null;
  for (const cutoff of allCutoffs) {
    const restatement = restateSalesShareReversalsV1(authority.rows, {
      cutoff,
      authorityStartMonth
    });
    unresolvedResidualMinor += BigInt(
      restatement.unresolvedReversalResidualMinor
    );
    conservationDifferenceMinor += BigInt(
      restatement.conservationDifferenceMinor
    );
    cutoffAudit.push({
      cutoff,
      status: restatement.status,
      unresolvedReversalResidualMinor:
        restatement.unresolvedReversalResidualMinor,
      conservationDifferenceMinor:
        restatement.conservationDifferenceMinor,
      futureRowsExcluded: restatement.futureExcludedCount
    });
    if (cutoff === allCutoffs.at(-1)) finalRestatement = restatement;
    const cutoffCases = byCutoff.get(cutoff);
    if (!cutoffCases) continue;
    const residualWorkIds = new Set(
      restatement.scopes.filter(
        (scope) => BigInt(scope.unresolvedReversalResidualMinor) !== 0n
      ).map((scope) => scope.standardWorkId)
    );
    const restatedIndex = buildRestatedWorkMonthIndexV22(restatement);
    for (const value of cutoffCases) {
      const startMonth = addMonthsV22(value.origin, 1);
      const posting = sumPostingWindowV22(
        postingIndex,
        value.standardWorkId,
        startMonth,
        value.targetEnd
      );
      let restatedMinor;
      if (value.standardWorkId === "__PORTFOLIO__") {
        restatedMinor = sumAllWorkWindowV22(
          restatedIndex,
          startMonth,
          value.targetEnd
        );
      } else {
        restatedMinor = sumWorkWindowV22(
          restatedIndex,
          value.standardWorkId,
          startMonth,
          value.targetEnd
        );
      }
      const expectedPosting = value.standardWorkId === "__PORTFOLIO__"
        ? posting.allWorkNet
        : posting.net;
      const frozenMinor = frozenNumberToMinorV22(
        value.actual,
        authority.scalePower
      );
      const postingDifferenceMinor = expectedPosting - frozenMinor;
      const postingToleranceMinor = authority.scalePower > 8
        ? 10n ** BigInt(authority.scalePower - 8)
        : 0n;
      const postingExactMatch = postingDifferenceMinor === 0n;
      const postingMatches = (
        postingDifferenceMinor < 0n
          ? -postingDifferenceMinor
          : postingDifferenceMinor
      ) <= postingToleranceMinor;
      if (!postingExactMatch) postingActualExactMismatchCount += 1;
      if (!postingMatches && value.standardWorkId === "__PORTFOLIO__") {
        portfolioPopulationMismatchCount += 1;
      } else if (!postingMatches) {
        postingActualMismatchCount += 1;
      }
      const blockedByResidual = value.standardWorkId === "__PORTFOLIO__"
        ? residualWorkIds.size > 0
        : residualWorkIds.has(value.standardWorkId);
      const portfolioPopulationMismatch =
        !postingMatches && value.standardWorkId === "__PORTFOLIO__";
      const reversalAffected = expectedPosting !== restatedMinor;
      const actualDefinitionChanged = frozenMinor !== restatedMinor;
      const label = {
        groupId: value.groupId,
        caseKey: value.caseKey,
        origin: value.origin,
        horizonMonths: value.horizonMonths,
        targetEnd: value.targetEnd,
        postingActualMinor: frozenMinor.toString(),
        authorityPostingActualMinor: expectedPosting.toString(),
        restatedActualMinor: restatedMinor.toString(),
        positiveActualMinor: (
          value.standardWorkId === "__PORTFOLIO__"
            ? posting.allWorkPositive
            : posting.positive
        ).toString(),
        reversalActualMinor: (
          value.standardWorkId === "__PORTFOLIO__"
            ? posting.allWorkReversal
            : posting.reversal
        ).toString(),
        postingActualMatchesAuthority: postingMatches,
        postingActualExactMatch: postingExactMatch,
        postingActualDifferenceMinor: postingDifferenceMinor.toString(),
        postingActualToleranceMinor: postingToleranceMinor.toString(),
        reversalAffected,
        actualDefinitionChanged,
        blockedByUnresolvedReversal: blockedByResidual,
        status: blockedByResidual
          ? "BLOCKED_UNRESOLVED_REVERSAL"
          : portfolioPopulationMismatch
            ? "NOT_RESCORABLE_PORTFOLIO_POPULATION_MEMBERSHIP_MISSING"
            : "FROZEN_PREDICTION_LABEL_ONLY_RESCORE"
      };
      if (reversalAffected) {
        affectedCaseCount += 1;
        if (value.standardWorkId !== "__PORTFOLIO__") {
          affectedWorkCaseCount += 1;
        }
      }
      if (actualDefinitionChanged) {
        actualDefinitionDifferenceCaseCount += 1;
      }
      if (blockedByResidual) blockedResidualCaseCount += 1;
      byGroupCaseKey.set(`${value.groupId}\u001f${value.caseKey}`, label);
    }
  }
  const status = unresolvedResidualMinor !== 0n
    ? "BLOCKED_UNRESOLVED_REVERSAL"
    : conservationDifferenceMinor !== 0n
      ? "BLOCKED_REVERSAL_AUTHORITY"
      : "COMPLETE";
  const publicSummary = {
    status,
    labelOnlyRescoreStatus: status === "COMPLETE"
      ? "FROZEN_PREDICTION_LABEL_ONLY_RESCORE"
      : "PARTIAL_COMPLETE_SCOPES_LABEL_ONLY_RESCORE",
    positiveRevenueMinor: finalRestatement.positiveRevenueMinor,
    reversalPostingMinor: finalRestatement.reversalPostingMinor,
    tracedOffsetMinor: finalRestatement.tracedOffsetMinor,
    restatedRevenueMinor: finalRestatement.restatedRevenueMinor,
    unresolvedReversalResidualMinor:
      finalRestatement.unresolvedReversalResidualMinor,
    conservationDifferenceMinor:
      finalRestatement.conservationDifferenceMinor,
    affectedScopeCount: finalRestatement.affectedScopeCount,
    affectedWorkCount: finalRestatement.affectedWorkCount,
    affectedChannelCount: finalRestatement.affectedChannelCount,
    affectedMonthCount: finalRestatement.affectedMonthCount,
    fullyZeroedMonthCount: finalRestatement.fullyZeroedMonthCount,
    partiallyRetainedMonthCount:
      finalRestatement.partiallyRetainedMonthCount,
    maximumTraceDepthMonths:
      finalRestatement.maximumTraceDepthMonths,
    traceDepthDistribution: finalRestatement.traceDepthDistribution,
    evaluatedCaseCount: cases.size,
    affectedCaseCount,
    affectedWorkCaseCount,
    actualDefinitionDifferenceCaseCount,
    blockedResidualCaseCount,
    postingActualExactMismatchCount,
    postingActualMismatchCount,
    portfolioPopulationMismatchCount,
    postingTimeViewStatus:
      "PASS_FROZEN_HISTORICAL_POSTING_ACTUAL_PRESERVED",
    currentAuthorityPostingReconciliationStatus:
      postingActualMismatchCount === 0
        ? "EXACT_MATCH"
        : "DIFFERENCES_REPORTED_NOT_REWRITTEN",
    asOfRestatedViewStatus: cutoffAudit.every(
      (row) => row.conservationDifferenceMinor === "0"
    ) ? "PASS" : "BLOCKED",
    finalRestatedViewStatus:
      finalRestatement.status === "COMPLETE" ? "PASS" : "BLOCKED",
    authorityStartMonth,
    authorityDataAsOf: authority.rows.map(
      (row) => row.recordedAt.slice(0, 7)
    ).sort().at(-1),
    labelMaturityCutoff: allCutoffs.at(-1),
    futureLeakageRiskFound: false,
    originAfterCutoffRowsUsed: 0
  };
  return {
    status,
    byGroupCaseKey,
    finalRestatement,
    publicSummary,
    privateSummary: {
      ...publicSummary,
      cutoffAudit
    }
  };
}

function collectUniqueCasesV22(datasets) {
  const output = new Map();
  for (const [groupId, group] of Object.entries(datasets)) {
    const firstRows = Object.values(group.models)[0] ?? [];
    for (const row of firstRows) {
      const key = `${groupId}\u001f${row.caseKey}`;
      output.set(key, {
        groupId,
        caseKey: row.caseKey,
        standardWorkId: row.standardWorkId,
        origin: row.origin,
        horizonMonths: row.horizonMonths,
        actual: row.actual
      });
    }
  }
  return output;
}

function buildPostingIndexV22(rows) {
  const byWork = new Map();
  const allWork = new Map();
  for (const row of rows) {
    const amount = BigInt(row.amountMinor);
    const workMonths = byWork.get(row.standardWorkId) ?? new Map();
    const value = workMonths.get(row.postingMonth) ?? {
      positive: 0n,
      reversal: 0n,
      net: 0n
    };
    const global = allWork.get(row.postingMonth) ?? {
      positive: 0n,
      reversal: 0n,
      net: 0n
    };
    if (amount >= 0n) {
      value.positive += amount;
      global.positive += amount;
    } else {
      value.reversal += -amount;
      global.reversal += -amount;
    }
    value.net += amount;
    global.net += amount;
    workMonths.set(row.postingMonth, value);
    byWork.set(row.standardWorkId, workMonths);
    allWork.set(row.postingMonth, global);
  }
  return { byWork, allWork };
}

function sumPostingWindowV22(index, workId, start, end) {
  const work = index.byWork.get(workId) ?? new Map();
  const result = { positive: 0n, reversal: 0n, net: 0n };
  const all = { positive: 0n, reversal: 0n, net: 0n };
  for (let month = start; month <= end; month = addMonthsV22(month, 1)) {
    const value = work.get(month);
    const global = index.allWork.get(month);
    if (value) {
      result.positive += value.positive;
      result.reversal += value.reversal;
      result.net += value.net;
    }
    if (global) {
      all.positive += global.positive;
      all.reversal += global.reversal;
      all.net += global.net;
    }
  }
  return {
    ...result,
    allWorkPositive: all.positive,
    allWorkReversal: all.reversal,
    allWorkNet: all.net
  };
}

function buildRestatedWorkMonthIndexV22(restatement) {
  const result = new Map();
  for (const scope of restatement.scopes) {
    const months = result.get(scope.standardWorkId) ?? new Map();
    for (const row of scope.restatedBalances) {
      months.set(
        row.month,
        (months.get(row.month) ?? 0n) + BigInt(row.amountMinor)
      );
    }
    result.set(scope.standardWorkId, months);
  }
  return result;
}

function sumWorkWindowV22(index, workId, start, end) {
  const months = index.get(workId) ?? new Map();
  let total = 0n;
  for (let month = start; month <= end; month = addMonthsV22(month, 1)) {
    total += months.get(month) ?? 0n;
  }
  return total;
}

function sumAllWorkWindowV22(index, start, end) {
  let total = 0n;
  for (const workId of index.keys()) {
    total += sumWorkWindowV22(index, workId, start, end);
  }
  return total;
}

function scoreV22Datasets(datasets, labels, artifactInventory) {
  const results = {};
  for (const [groupId, group] of Object.entries(datasets)) {
    const models = {};
    for (const [modelId, sourceRows] of Object.entries(group.models)) {
      const rowPairs = buildV22RowPairs(
        groupId,
        sourceRows,
        labels,
        group.grain
      );
      if (rowPairs.posting.length === 0) {
        models[modelId] = {
          status: "NOT_RESCORABLE_NO_COMPLETE_AUTHORITY_CASES",
          originalCaseCount: rowPairs.originalCaseCount,
          blockedCaseCount: rowPairs.blockedCaseCount,
          blockedStatusCounts: rowPairs.blockedStatusCounts
        };
        continue;
      }
      const posting = scoreV22ModelFamily(
        rowPairs.posting,
        "M2-ACTUAL-POSTING-TIME-01"
      );
      const restated = scoreV22ModelFamily(
        rowPairs.restated,
        reversalContract.actualDefinition.stableId
      );
      models[modelId] = {
        status: rowPairs.blockedCaseCount === 0
          ? "FROZEN_PREDICTION_LABEL_ONLY_RESCORE"
          : "PARTIAL_COMPLETE_SCOPES_LABEL_ONLY_RESCORE",
        stableModelId: modelId.split("::")[0],
        variantType: group.variants[modelId],
        originalCaseCount: rowPairs.originalCaseCount,
        sameCaseCount: rowPairs.posting.length,
        blockedCaseCount: rowPairs.blockedCaseCount,
        blockedStatusCounts: rowPairs.blockedStatusCounts,
        postingAuthorityMismatchCount:
          rowPairs.postingAuthorityMismatchCount,
        postingTime: posting,
        reversalRestated: restated,
        pairedActualDefinitionImpact: {
          status:
            "PAIRED_LABEL_DEFINITION_IMPACT_NOT_MODEL_IMPROVEMENT",
          sameCaseCount: rowPairs.posting.length,
          postingTimeWape: posting.point.pooled.wape,
          postingTimeSignedBias: posting.point.pooled.signedBias,
          restatedWape: restated.point.pooled.wape,
          restatedSignedBias: restated.point.pooled.signedBias,
          absoluteWapeChange:
            restated.point.pooled.wape - posting.point.pooled.wape,
          relativeWapeChange: posting.point.pooled.wape === 0
            ? null
            : restated.point.pooled.wape / posting.point.pooled.wape - 1,
          affectedCaseCount: rowPairs.posting.filter(
            (row) => row.reversalAffected
          ).length,
          unaffectedCaseCount: rowPairs.posting.filter(
            (row) => !row.reversalAffected
          ).length,
          affectedSlice: safePointScoreV22(rowPairs.restated.filter(
            (row) => row.reversalAffected
          )),
          unaffectedSlice: safePointScoreV22(rowPairs.restated.filter(
            (row) => !row.reversalAffected
          ))
        }
      };
    }
    const fallbackId = chooseFallback(groupId, group.models);
    const pairedWithinActualDefinition = {};
    if (fallbackId && models[fallbackId]?.postingTime) {
      for (const [modelId, sourceRows] of Object.entries(group.models)) {
        if (modelId === fallbackId || !models[modelId]?.postingTime) continue;
        const candidatePairs = buildV22RowPairs(
          groupId,
          sourceRows,
          labels,
          group.grain
        );
        const fallbackPairs = buildV22RowPairs(
          groupId,
          group.models[fallbackId],
          labels,
          group.grain
        );
        if (
          candidatePairs.posting.length === 0
          || fallbackPairs.posting.length === 0
        ) {
          pairedWithinActualDefinition[modelId] = {
            versus: fallbackId,
            status: "NOT_RESCORABLE_NO_COMPLETE_AUTHORITY_CASES"
          };
          continue;
        }
        pairedWithinActualDefinition[modelId] = {
          versus: fallbackId,
          postingTime: scorePairedPointRowsV2(
            candidatePairs.posting,
            fallbackPairs.posting
          ),
          reversalRestated: scorePairedPointRowsV2(
            candidatePairs.restated,
            fallbackPairs.restated
          )
        };
        if (modelId === "M2-CHAN-SCL01") {
          const options = {
            minimumCaseCount: contractV22.publicPrivacy.minimumCaseCount,
            minimumWorkCount: contractV22.publicPrivacy.minimumWorkCount,
            topFractions: contractV22.topRevenueAttribution.fractions,
            seed: contractV22.uncertainty.seed,
            bootstrapIterations:
              contractV22.uncertainty.bootstrapIterations,
            minimumIndependentTimeBlocks:
              contractV22.uncertainty.minimumIndependentTimeBlocks
          };
          pairedWithinActualDefinition[modelId].ranking = {
            postingTime: scoreRankingRowsV22(
              candidatePairs.posting,
              fallbackPairs.posting,
              options
            ),
            reversalRestated: scoreRankingRowsV22(
              candidatePairs.restated,
              fallbackPairs.restated,
              options
            )
          };
        }
      }
    }
    let portfolio = null;
    if (
      group.grain === "portfolio_origin_horizon"
      && models["M2-PORT-ETS01"]?.postingTime
    ) {
      const candidatePairs = buildV22RowPairs(
        groupId,
        group.models["M2-PORT-ETS01"],
        labels,
        group.grain
      );
      const fallbackPairs = buildV22RowPairs(
        groupId,
        group.models[
          "M2-BASE-CLASSIC01::M2-EXP-PORTFOLIO-ETS-01:SNAIVE"
        ],
        labels,
        group.grain
      );
      const options = {
        bootstrapIterations: contractV22.uncertainty.bootstrapIterations,
        seed: contractV22.uncertainty.seed,
        minimumOriginCount:
          contractV22.publicPrivacy.minimumPortfolioOriginCount,
        minimumIndependentTimeBlocks:
          contractV22.uncertainty.minimumIndependentTimeBlocks
      };
      portfolio = {
        postingTime: scorePortfolioPairedV22(
          candidatePairs.posting,
          fallbackPairs.posting,
          options
        ),
        reversalRestated: scorePortfolioPairedV22(
          candidatePairs.restated,
          fallbackPairs.restated,
          options
        )
      };
    }
    results[groupId] = {
      frozenInputArtifactSetSha256:
        contentBindingV22(artifactInventory).frozenInputArtifactSetSha256,
      postingComparabilityGroupId: `${groupId}::POSTING_TIME`,
      restatedComparabilityGroupId: `${groupId}::REVERSAL_RESTATED`,
      crossActualDefinitionWinnerAllowed: false,
      fallbackId,
      models,
      pairedWithinActualDefinition,
      portfolio
    };
  }
  return results;
}

function buildV22RowPairs(groupId, rows, labels, grain) {
  const blockedStatusCounts = {};
  let postingAuthorityMismatchCount = 0;
  const pairs = rows.map((row) => {
    const label = labels.get(`${groupId}\u001f${row.caseKey}`);
    if (!label) {
      blockedStatusCounts.LABEL_MISSING =
        (blockedStatusCounts.LABEL_MISSING ?? 0) + 1;
      return null;
    }
    if (label.status !== "FROZEN_PREDICTION_LABEL_ONLY_RESCORE") {
      blockedStatusCounts[label.status] =
        (blockedStatusCounts[label.status] ?? 0) + 1;
      return null;
    }
    if (!label.postingActualMatchesAuthority) {
      postingAuthorityMismatchCount += 1;
    }
    const common = {
      ...row,
      actualPositiveAmount: minorToNumberV22(
        label.positiveActualMinor
      ),
      postingTimeReversalActual: minorToNumberV22(
        label.reversalActualMinor
      ),
      reversalActualMagnitude: minorToNumberV22(
        label.reversalActualMinor
      ),
      reversalAffected: label.reversalAffected,
      actualDefinitionChanged: label.actualDefinitionChanged
    };
    return {
      posting: {
        ...common,
        actual: minorToNumberV22(label.postingActualMinor),
        actualPositive:
          BigInt(label.postingActualMinor) > 0n ? 1 : 0
      },
      restated: {
        ...common,
        actual: minorToNumberV22(label.restatedActualMinor),
        actualPositive:
          BigInt(label.restatedActualMinor) > 0n ? 1 : 0,
        actualPositiveAmount: minorToNumberV22(
          label.restatedActualMinor
        )
      }
    };
  });
  const complete = pairs.filter((pair) => pair !== null);
  return {
    grain,
    originalCaseCount: rows.length,
    blockedCaseCount: rows.length - complete.length,
    blockedStatusCounts,
    postingAuthorityMismatchCount,
    posting: complete.map((pair) => pair.posting),
    restated: complete.map((pair) => pair.restated)
  };
}

function scoreV22ModelFamily(rows, actualDefinitionId) {
  const occurrenceAvailable = rows.every(
    (row) => row.occurrenceProbability !== undefined
  );
  const conditionalAvailable = rows.every(
    (row) => row.conditionalAmountPrediction !== undefined
  );
  const reversalPredictionAvailable = rows.every(
    (row) => row.reversalPointEstimate !== undefined
  );
  return {
    actualDefinitionId,
    point: {
      pooled: scorePointRowsV21(rows),
      byHorizon: scorePointSlicesV22(rows)
    },
    occurrence: occurrenceAvailable
      ? scoreOccurrenceRowsV22(rows, {
        epsilon: preregistration.numericPolicy.probabilityClipEpsilon
      })
      : {
        status: "NOT_COMPUTABLE_OCCURRENCE_PROBABILITY_MISSING"
      },
    conditionalAmount: conditionalAvailable
      ? scoreConditionalAmountRowsV22(rows)
      : {
        status:
          "NOT_COMPUTABLE_CONDITIONAL_AMOUNT_PREDICTION_MISSING"
      },
    reversal: reversalPredictionAvailable
      ? scoreReversalRowsV22(rows, {
        epsilon: preregistration.numericPolicy.probabilityClipEpsilon
      })
      : {
        status: "NOT_COMPUTABLE_REVERSAL_PREDICTION_MISSING"
      },
    topRevenueAttribution: rows[0]?.standardWorkId === "__PORTFOLIO__"
      ? null
      : scoreTopRevenueAttributionV22(rows, {
        minimumCaseCount: contractV22.publicPrivacy.minimumCaseCount,
        minimumWorkCount: contractV22.publicPrivacy.minimumWorkCount,
        topFractions: contractV22.topRevenueAttribution.fractions
      })
  };
}

function scorePointSlicesV22(rows) {
  const result = {};
  for (const [key, values] of [...groupMapRunnerV22(
    rows,
    (row) => String(row.horizonMonths)
  )].sort(([left], [right]) => left.localeCompare(right))) {
    result[key] = scorePointRowsV21(values);
  }
  return result;
}

function safePointScoreV22(rows) {
  return rows.length === 0
    ? { status: "NOT_APPLICABLE_EMPTY_SLICE", caseCount: 0 }
    : scorePointRowsV21(rows);
}

function writeV22PrivateRescoreRows(filePath, datasets, labels) {
  const file = fs.openSync(filePath, "w");
  try {
    for (const [groupId, group] of Object.entries(datasets)) {
      for (const [modelId, rows] of Object.entries(group.models)) {
        for (const row of rows) {
          const label = labels.get(`${groupId}\u001f${row.caseKey}`);
          fs.writeSync(file, `${JSON.stringify({
            groupId,
            modelId,
            variantType: group.variants[modelId],
            caseKey: row.caseKey,
            standardWorkId: row.standardWorkId,
            origin: row.origin,
            horizonMonths: row.horizonMonths,
            frozenPointEstimate: row.pointEstimate,
            postingActualMinor: label?.postingActualMinor ?? null,
            authorityPostingActualMinor:
              label?.authorityPostingActualMinor ?? null,
            restatedActualMinor: label?.restatedActualMinor ?? null,
            postingActualDifferenceMinor:
              label?.postingActualDifferenceMinor ?? null,
            reversalAffected: label?.reversalAffected ?? null,
            actualDefinitionChanged:
              label?.actualDefinitionChanged ?? null,
            status: label?.status ?? "NOT_RESCORABLE"
          })}\n`);
        }
      }
    }
  } finally {
    fs.closeSync(file);
  }
}

function contentBindingV22(artifactInventory) {
  const artifactSet = artifactInventory.map((item) => ({
    artifactId: item.artifactId,
    sha256: item.sha256,
    rowCount: item.rowCount
  })).sort((left, right) =>
    left.artifactId.localeCompare(right.artifactId)
  );
  return {
    contractSchema: contractV22.schema,
    contractVersion: contractV22.version,
    contractArtifactSha256: sha256PathV22(
      path.join(root, "config/m2-evaluation-contract.v2.2.json")
    ),
    evaluatorImplementationSha256: sha256TrackedSetV22([
      "src/domain/m2Current/evaluationV2.js",
      "src/domain/m2Current/reversalRestatement.js",
      "scripts/m2-current/run_m2_evaluation_v2_frozen_rescore.mjs",
      "scripts/m2-current/export_m2_reversal_authority.py",
      "scripts/m2-current/materialize_canonical_channel_cases.py",
      "tools/m2-calibration/human_ledger_partition.py",
      "tools/m2-calibration/calibrate_cleaned_bills.py"
    ]),
    testContractSha256: sha256TrackedSetV22([
      "test/m2-evaluation-contract-v2-2.test.js",
      "test/m2-reversal-restatement.test.js"
    ]),
    frozenInputArtifactSetSha256: crypto.createHash("sha256")
      .update(JSON.stringify(artifactSet))
      .digest("hex")
  };
}

function writeBlockedV22(status, detail) {
  const outputDirectory = path.join(
    root,
    "data",
    "private-output",
    reversalContract.privateOutputs.directoryRole
  );
  fs.mkdirSync(outputDirectory, { recursive: true });
  const receiptPathV22 = path.join(
    outputDirectory,
    reversalContract.privateOutputs.executionReceipt
  );
  fs.writeFileSync(receiptPathV22, `${JSON.stringify({
    schema: "m2.evaluation-v2.2.execution-receipt.private.v1",
    status,
    detail,
    authorizationCounters: {
      modelExecutionCount: 0,
      trainingCount: 0,
      fittingCount: 0,
      tuningCount: 0,
      selectionCount: 0,
      predictionRowsGenerated: 0,
      predictionRowsModified: 0,
      productionChangeCount: 0
    }
  }, null, 2)}\n`);
  return {
    status,
    receiptPath: receiptPathV22,
    publicAggregateCandidatePath: null
  };
}

function normalizeDecimalTextV22(value) {
  const text = String(value).trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) throw new Error("m2_evaluation_v2_2_amount_decimal_invalid");
  return {
    negative: match[1] === "-",
    integer: match[2],
    fraction: match[3] ?? ""
  };
}

function decimalToMinorV22(value, scalePower) {
  const parsed = normalizeDecimalTextV22(value);
  if (parsed.fraction.length > scalePower) {
    throw new Error("m2_evaluation_v2_2_amount_scale_invalid");
  }
  const digits = `${parsed.integer}${parsed.fraction.padEnd(
    scalePower,
    "0"
  )}`;
  const amount = BigInt(digits);
  return parsed.negative ? -amount : amount;
}

function frozenNumberToMinorV22(value, scalePower) {
  const numeric = Number(value);
  if (
    !Number.isFinite(numeric)
    || !Number.isInteger(scalePower)
    || scalePower < 0
    || scalePower > 100
  ) {
    throw new Error("m2_evaluation_v2_2_frozen_actual_range_invalid");
  }
  return decimalToMinorV22(numeric.toFixed(scalePower), scalePower);
}

function minorToNumberV22(value) {
  if (!Number.isInteger(activeAuthorityScalePowerV22)) {
    throw new Error("m2_evaluation_v2_2_authority_scale_not_initialized");
  }
  return Number(value) / (10 ** activeAuthorityScalePowerV22);
}

function addMonthsV22(month, amount) {
  const [year, value] = month.split("-").map(Number);
  const absolute = year * 12 + value - 1 + amount;
  return `${Math.floor(absolute / 12)}-${String(
    absolute % 12 + 1
  ).padStart(2, "0")}`;
}

function groupMapRunnerV22(rows, keyOf) {
  const result = new Map();
  for (const row of rows) {
    const key = String(keyOf(row));
    const values = result.get(key) ?? [];
    values.push(row);
    result.set(key, values);
  }
  return result;
}

function sha256PathV22(filePath) {
  return crypto.createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex");
}

function sha256TrackedSetV22(relativePaths) {
  const entries = [...relativePaths].sort().map((relativePath) => ({
    relativePath: relativePath.replaceAll("\\", "/"),
    sha256: sha256PathV22(path.join(root, relativePath))
  }));
  return crypto.createHash("sha256")
    .update(JSON.stringify(entries))
    .digest("hex");
}

async function inspectNdjson(filePath, artifactId) {
  let rowCount = 0;
  const fields = new Set();
  const familyCounts = new Map();
  const caseKeys = new Set();
  let caseKeyFieldsComplete = true;
  await forEachNdjson(filePath, (row) => {
    rowCount += 1;
    Object.keys(row).forEach((field) => fields.add(field));
    const family = String(
      row.evaluationFamily ?? row.population ?? row.rowKind ?? "portfolio"
    );
    familyCounts.set(family, (familyCounts.get(family) ?? 0) + 1);
    const caseKey = frozenArtifactCaseKeyV21(artifactId, row);
    if (caseKey === null) caseKeyFieldsComplete = false;
    else caseKeys.add(caseKey);
  });
  return {
    rowCount,
    fields,
    familyCounts,
    uniqueCaseKeyCount: caseKeys.size,
    caseKeyFieldsComplete
  };
}

function frozenArtifactCaseKeyV21(artifactId, row) {
  let fields;
  if (artifactId === "ART-CURRENT-CANONICAL-51384") {
    fields = ["population", "standardWorkId", "origin", "horizonMonths"];
  } else if (artifactId === "ART-HUMAN-ANCHORED-91562") {
    fields = [
      "evaluationFamily",
      "standardWorkId",
      "origin",
      "horizonMonths"
    ];
  } else if (artifactId === "ART-TSB-86359") {
    fields = [
      "evaluationFamily",
      "standardWorkId",
      "origin",
      "horizonMonths"
    ];
  } else if (artifactId === "ART-LIFECYCLE-91562") {
    fields = [
      "evaluationFamily",
      "standardWorkId",
      "origin",
      "horizonMonths"
    ];
  } else if (artifactId === "ART-CHANNEL-SCALAR-395904") {
    fields = [
      "evaluationFamily",
      "rowKind",
      "standardWorkId",
      "channelUid",
      "origin",
      "horizonMonths"
    ];
  } else if (artifactId === "ART-PORTFOLIO-30") {
    fields = ["origin", "horizonMonths"];
  } else {
    throw new Error(`m2_evaluation_v2_1_unknown_artifact:${artifactId}`);
  }
  const values = fields.map((field) => row[field] ?? "__NOT_APPLICABLE__");
  const required = fields.filter((field) =>
    field !== "channelUid" || row.rowKind !== "work"
  );
  if (required.some((field) =>
    row[field] === null || row[field] === undefined || row[field] === ""
  )) return null;
  return values.map((value) => String(value)).join("|");
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
      addModel(groups["CG-WORK-SS-HA-PRIMARY-12039-H36"], "M2-WORK-LG01::historical_original", row, row.learnedGlobalPointEstimate, {
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
    addModel(group, "M2-WORK-LG01", row, row.selectedPipelinePointEstimate, {
      variantType: "research_baseline"
    });
    addModel(group, "M2-WORK-TSB01", row, row.rawTsbPointEstimate, {
      variantType: "raw_candidate",
      occurrenceProbability: row.occurrenceProbability,
      occurrenceActual: row.actualPositive
    });
    addModel(group, "M2-WORK-TSBB01", row, row.blendCandidatePointEstimate, {
      variantType: "raw_candidate"
    });
    addModel(group, "M2-WORK-TSBB01::selected_pipeline", row, row.selectedPipelinePointEstimate, {
      variantType: "selected_pipeline"
    });
  });
  await forEachNdjson(path.join(root, byId["ART-LIFECYCLE-91562"].privatePath), (row) => {
    const group = row.evaluationFamily === "primary"
      ? groups["CG-WORK-SS-HA-PRIMARY-12039-H36"]
      : row.evaluationFamily === "strict_rolling"
        ? groups["CG-WORK-SS-HA-STRICT-74320"]
        : row.evaluationFamily === "v03_overlap_cross_work"
          ? groups["CG-WORK-SS-OVERLAP-5203-H36"]
          : null;
    if (!group) return;
    if (row.evaluationFamily === "v03_overlap_cross_work") {
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
      occurrenceActual: row.actualPositive,
      conditionalAmountPrediction: row.conditionalPositiveAmount,
      conditionalActual: row.actualPositive,
      actualPositiveAmount: row.actualPositive,
      reversalPointEstimate: row.reversalPointEstimate,
      lifecycleState: row.lifecycleState
    });
    addModel(group, "M2-WORK-LC01::selected_pipeline", row, row.pointEstimate, {
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
    addModel(groups["CG-PORT-SS-30CELLS"], "M2-BASE-CLASSIC01::M2-EXP-PORTFOLIO-ETS-01:SNAIVE", row, row.seasonalNaivePointEstimate, {
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
    occurrenceActual: extras.occurrenceActual,
    actualPositive: extras.actualPositive ?? extras.occurrenceActual,
    conditionalAmountPrediction: extras.conditionalAmountPrediction,
    conditionalActual: extras.conditionalActual,
    actualPositiveAmount: extras.actualPositiveAmount,
    reversalPointEstimate: extras.reversalPointEstimate,
    quantiles: extras.quantiles
  });
  group.models[modelId] = rows;
  group.variants[modelId] = extras.variantType;
}

function scoreV21Datasets(datasets, artifactInventory) {
  const results = {};
  for (const [groupId, group] of Object.entries(datasets)) {
    const groupAuthority = modelRegistry.comparabilityGroups.find(
      (item) => item.comparableGroupId === groupId
    );
    if (!groupAuthority) {
      throw new Error(`m2_evaluation_v2_1_comparability_group_missing:${groupId}`);
    }
    const models = {};
    for (const [modelId, rows] of Object.entries(group.models)) {
      const artifact = artifactForModelV21(groupId, modelId, artifactInventory);
      const pointIdentity = evaluationIdentityV21(
        contractV21.pointMetrics,
        groupAuthority,
        artifact,
        groupId,
        modelId,
        group.variants[modelId]
      );
      const point = scorePointRowsV21(rows);
      models[modelId] = {
        variantType: group.variants[modelId],
        pointIdentity,
        pooledCrossHorizonDiagnostic: point,
        mase: {
          status: "NOT_COMPUTABLE_PRE_ORIGIN_SCALE_MISSING",
          value: null,
          strictlyPreOriginScaleAvailable: false
        },
        byHorizon: scorePointSlicesV21(rows, "horizonMonths"),
        byMaximalAdjacentOriginTimeBlock: scorePointSlicesV21(
          assignMaximalAdjacentOriginBlocksV21(rows),
          "timeBlock"
        ),
        topRevenueAttribution: group.grain === "portfolio_origin_horizon"
          ? null
          : scoreTopRevenueAttributionV21(rows, privacyOptionsV21()),
        occurrence: rows.every((row) =>
          row.occurrenceProbability !== undefined
          && row.actualPositive !== undefined
        ) ? {
          identity: evaluationIdentityV21(
            contractV21.occurrenceMetrics,
            groupAuthority,
            artifact,
            groupId,
            modelId,
            group.variants[modelId]
          ),
          score: scoreOccurrenceRowsV21(rows, {
            epsilon: preregistration.numericPolicy.probabilityClipEpsilon,
            diagnosticThreshold: 0.5,
            frozenTrainingBaseRate: null
          })
        } : null,
        conditionalAmount: rows.every((row) =>
          row.conditionalAmountPrediction !== undefined
          && row.actualPositiveAmount !== undefined
          && row.reversalPointEstimate !== undefined
        ) ? {
          identity: evaluationIdentityV21(
            contractV21.conditionalAmountMetrics,
            groupAuthority,
            artifact,
            groupId,
            modelId,
            group.variants[modelId]
          ),
          score: scoreConditionalAmountRowsV21(rows)
        } : null,
        intervals: rows.every((row) => row.quantiles) ? {
          identity: evaluationIdentityV21(
            contractV21.intervalMetrics,
            groupAuthority,
            artifact,
            groupId,
            modelId,
            group.variants[modelId]
          ),
          score: scoreIntervalRowsV21(rows, {
            quantileGrid: contractV21.intervalMetrics.nativeQuantileGrid,
            ...privacyOptionsV21()
          })
        } : null
      };
    }
    const fallbackId = chooseFallback(groupId, group.models);
    const paired = {};
    if (fallbackId) {
      for (const [modelId, rows] of Object.entries(group.models)) {
        if (modelId === fallbackId) continue;
        try {
          const pointFva = scorePairedPointRowsV2(rows, group.models[fallbackId]);
          const pair = {
            versus: fallbackId,
            status: "STRICT_EXACT_CASE_PAIR",
            caseCount: rows.length,
            workCount: new Set(rows.map((row) => row.standardWorkId)).size,
            pointFva,
            workClusterInterval: pointFvaBootstrapV21Runner(
              rows,
              group.models[fallbackId],
              group.grain === "portfolio_origin_horizon"
                ? "origin"
                : "standardWorkId"
            )
          };
          if (modelId === "M2-CHAN-SCL01") {
            pair.ranking = {
              identity: evaluationIdentityV21(
                contractV21.rankingMetrics,
                groupAuthority,
                artifactForModelV21(groupId, modelId, artifactInventory),
                groupId,
                modelId,
                group.variants[modelId]
              ),
              score: scoreRankingRowsV21(
                rows,
                group.models[fallbackId],
                {
                  ...privacyOptionsV21(),
                  topFractions: contractV21.topRevenueAttribution.fractions,
                  seed: contractV21.uncertainty.seed,
                  bootstrapIterations: contractV21.uncertainty.bootstrapIterations
                }
              )
            };
          }
          paired[modelId] = pair;
        } catch (error) {
          if (
            error.message !== "m2_evaluation_v2_pair_mismatch"
            && error.message !== "m2_evaluation_v2_1_pair_mismatch"
          ) throw error;
          paired[modelId] = {
            versus: fallbackId,
            status: "NOT_COMPARABLE_CASE_SET_MISMATCH"
          };
        }
      }
    }
    const portfolio = group.grain === "portfolio_origin_horizon"
      ? {
        identity: evaluationIdentityV21(
          contractV21.portfolioMetrics,
          groupAuthority,
          artifactForModelV21(
            groupId,
            "M2-PORT-ETS01",
            artifactInventory
          ),
          groupId,
          "M2-PORT-ETS01",
          group.variants["M2-PORT-ETS01"]
        ),
        score: scorePortfolioPairedV21(
          group.models["M2-PORT-ETS01"],
          group.models["M2-BASE-CLASSIC01::M2-EXP-PORTFOLIO-ETS-01:SNAIVE"],
          {
            minimumOriginCount:
              contractV21.publicPrivacy.minimumPortfolioOriginCount,
            seed: contractV21.uncertainty.seed,
            bootstrapIterations: contractV21.uncertainty.bootstrapIterations
          }
        )
      }
      : null;
    results[groupId] = {
      comparisonClass: groupAuthority.comparisonClass,
      grain: group.grain ?? "work_origin_horizon",
      fallbackId,
      models,
      paired,
      portfolio
    };
  }
  return results;
}

function verifyV1ScoreReproductionV21(datasets) {
  let bindingCount = 0;
  let maximumAbsoluteDifference = 0;
  for (const group of Object.values(datasets)) {
    for (const rows of Object.values(group.models)) {
      const v1 = scorePointRowsV2(rows);
      const v21 = scorePointRowsV21(rows);
      maximumAbsoluteDifference = Math.max(
        maximumAbsoluteDifference,
        Math.abs(v1.wape - v21.wape),
        Math.abs(v1.signedBias - v21.signedBias)
      );
      bindingCount += 1;
    }
  }
  return {
    status: maximumAbsoluteDifference <= 1e-8 ? "PASS" : "FAIL",
    absoluteTolerance: 1e-8,
    bindingCount,
    maximumAbsoluteDifference
  };
}

function scorePointSlicesV21(rows, field) {
  const groups = new Map();
  for (const row of rows) {
    const key = String(row[field] ?? "");
    const values = groups.get(key) ?? [];
    values.push(row);
    groups.set(key, values);
  }
  return Object.fromEntries([...groups].sort(([left], [right]) =>
    left.localeCompare(right)
  ).map(([key, values]) => {
    if (
      values.length < contractV21.publicPrivacy.minimumCaseCount
      || new Set(values.map((row) => row.standardWorkId)).size
        < contractV21.publicPrivacy.minimumWorkCount
    ) {
      return [key, {
        status: contractV21.publicPrivacy.suppressionStatus,
        caseCount: values.length,
        workCount: new Set(values.map((row) => row.standardWorkId)).size
      }];
    }
    return [key, scorePointRowsV21(values)];
  }));
}

function evaluationIdentityV21(
  metric,
  group,
  artifact,
  groupId,
  modelId,
  variant
) {
  const modelIdentity = modelIdentityV21(groupId, modelId);
  return validateEvaluationIdentityV21({
    metricDefinitionId: metric.metricDefinitionId,
    metricDefinitionVersion: metric.metricDefinitionVersion,
    ...modelIdentity,
    variant,
    comparabilityGroupId: groupId,
    target: group.target,
    cashAuthority: group.cashAuthority,
    actualDefinition: group.actualDefinition,
    asOfContract: group.asOfContract,
    grain: group.grain,
    populationId: group.populationId,
    horizonContract: group.horizons,
    evaluationFamily: group.evaluationFamily,
    caseKeyFields: group.grain === "portfolio_origin_horizon"
      ? ["origin", "horizonMonths"]
      : ["standardWorkId", "origin", "horizonMonths"],
    artifactId: artifact.artifactId,
    artifactSha256: artifact.sha256
  });
}

function modelIdentityV21(groupId, modelId) {
  const stableModelId = modelId.split("::")[0];
  const model = modelRegistry.models.find(
    (item) => item.stableModelId === stableModelId
  );
  if (!model) throw new Error(`m2_evaluation_v2_1_model_missing:${stableModelId}`);
  let experimentId = null;
  let armId = null;
  if (stableModelId === "M2-WORK-CCR01") {
    experimentId = "M2-EXP-CANONICAL-CHANNEL-01";
    armId = "CCR";
  } else if (stableModelId === "M2-WORK-MAN01") {
    experimentId = "M2-EXP-HUMAN-ANCHORED-10";
    armId = "MANUAL";
  } else if (stableModelId === "M2-WORK-OR01") {
    experimentId = "M2-EXP-HUMAN-ANCHORED-10";
    armId = "OCCURRENCE";
  } else if (modelId === "M2-WORK-LG01::historical_original") {
    experimentId = "M2-EXP-HUMAN-ANCHORED-10";
    armId = "GLOBAL";
  } else if (stableModelId === "M2-WORK-LG01") {
    experimentId = groupId === "CG-WORK-SS-OVERLAP-5203-H36"
      ? "M2-EXP-LIFECYCLE-AWARE-01"
      : "M2-EXP-TSB-OCCURRENCE-01";
    armId = "BASE";
  } else if (stableModelId === "M2-WORK-TSB01") {
    experimentId = "M2-EXP-TSB-OCCURRENCE-01";
    armId = "RAW";
  } else if (stableModelId === "M2-WORK-TSBB01") {
    experimentId = "M2-EXP-TSB-OCCURRENCE-01";
    armId = "BLEND";
  } else if (stableModelId === "M2-WORK-LC01") {
    experimentId = "M2-EXP-LIFECYCLE-AWARE-01";
    armId = modelId.includes("selected_pipeline") ? "REVIVAL_ONLY" : "RAW";
  } else if (stableModelId === "M2-CHAN-SCL01") {
    experimentId = "M2-EXP-CHANNEL-EXPERTS-01";
    armId = "A6";
  } else if (stableModelId === "M2-PORT-ETS01") {
    experimentId = "M2-EXP-PORTFOLIO-ETS-01";
    armId = "ETS";
  } else if (stableModelId === "M2-BASE-CLASSIC01") {
    experimentId = "M2-EXP-PORTFOLIO-ETS-01";
    armId = "SNAIVE";
  }
  return {
    stableModelId,
    displayNameZh: model.displayNameZh,
    displayNameEn: model.displayNameEn,
    experimentId,
    armId
  };
}

function artifactForModelV21(groupId, modelId, artifactInventory) {
  let artifactId;
  if (groupId === "CG-WORK-SS-CURRENT-7083") {
    artifactId = "ART-CURRENT-CANONICAL-51384";
  } else if (groupId === "CG-PORT-SS-30CELLS") {
    artifactId = "ART-PORTFOLIO-30";
  } else if (modelId.startsWith("M2-CHAN-SCL01")) {
    artifactId = "ART-CHANNEL-SCALAR-395904";
  } else if (modelId.startsWith("M2-WORK-LC01")) {
    artifactId = "ART-LIFECYCLE-91562";
  } else if (
    modelId.startsWith("M2-WORK-TSB")
    || modelId === "M2-WORK-LG01"
  ) {
    artifactId = groupId === "CG-WORK-SS-OVERLAP-5203-H36"
      ? "ART-LIFECYCLE-91562"
      : "ART-TSB-86359";
  } else if (modelId === "M2-WORK-OA03") {
    artifactId = "ART-LIFECYCLE-91562";
  } else {
    artifactId = "ART-HUMAN-ANCHORED-91562";
  }
  const artifact = artifactInventory.find((item) => item.artifactId === artifactId);
  if (!artifact) throw new Error(`m2_evaluation_v2_1_artifact_missing:${artifactId}`);
  return artifact;
}

function privacyOptionsV21() {
  return {
    minimumCaseCount: contractV21.publicPrivacy.minimumCaseCount,
    minimumWorkCount: contractV21.publicPrivacy.minimumWorkCount
  };
}

function pointFvaBootstrapV21Runner(candidate, fallback, clusterField) {
  return clusterBootstrap(
    candidate,
    fallback,
    clusterField,
    contractV21.uncertainty.seed,
    contractV21.uncertainty.bootstrapIterations
  );
}

function scoreGroup(groupId, group) {
  const scoredModels = {};
  for (const [modelId, rows] of Object.entries(group.models)) {
    const score = scorePointRowsV2(rows);
    const byHorizon = safeGroupScore(rows, "horizonMonths");
    const byOrigin = safeGroupScore(rows, "origin");
    const byTimeBlock = scoreTimeBlocks(rows);
    const bySegment = rows.every((row) => row.segment)
      ? safeGroupScore(rows, "segment")
      : null;
    const byLifecycle = rows.every((row) => row.lifecycleState)
      ? safeGroupScore(rows, "lifecycleState")
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
      ? scoreM2CurrentProbabilisticRows(
        rows,
        [0.05, 0.1, 0.2, 0.5, 0.8, 0.9, 0.95]
      )
      : null;
    scoredModels[modelId] = {
      variantType: group.variants[modelId],
      pooledDiagnostic: score,
      byHorizon,
      byOrigin,
      byTimeBlock,
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
        clusterBootstrap: clusterBootstrap(
          rows,
          group.models[fallbackId],
          group.grain === "portfolio_origin_horizon"
            ? "origin"
            : "standardWorkId",
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
  if (groupId === "CG-PORT-SS-30CELLS") {
    return "M2-BASE-CLASSIC01::M2-EXP-PORTFOLIO-ETS-01:SNAIVE";
  }
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

function scoreTimeBlocks(rows) {
  const origins = [...new Set(rows.map((row) => row.origin))].sort();
  const blockByOrigin = new Map();
  let blockStart = origins[0];
  let previous = origins[0];
  let blockIndex = 1;
  for (const origin of origins) {
    if (origin !== origins[0] && monthDistance(previous, origin) !== 1) {
      blockIndex += 1;
      blockStart = origin;
    }
    blockByOrigin.set(origin, { blockIndex, blockStart });
    previous = origin;
  }
  const blockEnds = new Map();
  for (const origin of origins) {
    blockEnds.set(blockByOrigin.get(origin).blockIndex, origin);
  }
  const tagged = rows.map((row) => {
    const block = blockByOrigin.get(row.origin);
    return {
      ...row,
      timeBlock: `B${block.blockIndex}:${block.blockStart}..${blockEnds.get(block.blockIndex)}`
    };
  });
  return safeGroupScore(tagged, "timeBlock");
}

function safeGroupScore(rows, field) {
  const groups = new Map();
  for (const row of rows) {
    const key = String(row[field] ?? "");
    const values = groups.get(key) ?? [];
    values.push(row);
    groups.set(key, values);
  }
  return Object.fromEntries([...groups].sort(([a], [b]) => a.localeCompare(b))
    .map(([key, values]) => {
      try {
        return [key, scorePointRowsV2(values)];
      } catch (error) {
        if (error.message !== "m2_evaluation_v2_actual_denominator_zero") throw error;
        return [key, {
          status: "UNDEFINED_ZERO_ACTUAL_DENOMINATOR",
          caseCount: values.length,
          wape: null,
          signedBias: null,
          absoluteBias: null
        }];
      }
    }));
}

function monthDistance(left, right) {
  const [leftYear, leftMonth] = left.split("-").map(Number);
  const [rightYear, rightMonth] = right.split("-").map(Number);
  return (rightYear - leftYear) * 12 + rightMonth - leftMonth;
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

function clusterBootstrap(candidate, fallback, clusterField, seed, iterations) {
  const fallbackByKey = new Map(fallback.map((row) => [row.caseKey, row]));
  const clusters = new Map();
  for (const row of candidate) {
    const other = fallbackByKey.get(row.caseKey);
    const clusterId = row[clusterField];
    const value = clusters.get(clusterId) ?? {
      candidateError: 0, fallbackError: 0, denominator: 0
    };
    value.candidateError += Math.abs(Number(row.pointEstimate) - Number(row.actual));
    value.fallbackError += Math.abs(Number(other.pointEstimate) - Number(row.actual));
    value.denominator += Math.abs(Number(row.actual));
    clusters.set(clusterId, value);
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
    unit: clusterField,
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
