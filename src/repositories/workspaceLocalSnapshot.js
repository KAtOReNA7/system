import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, readdir, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { AppError } from "../errors.js";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SNAPSHOTS = Object.freeze({
  local_snapshot: { path: "data/private-output/workspace/current.json", schema: "workspace.local-readonly.v1" },
  local_audit: { path: "data/private-output/workspace/audit.json", schema: "workspace.local-audit.v1" }
});
const MAX_SNAPSHOT_BYTES = 64 * 1024 * 1024;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const SHA256 = /^[a-f0-9]{64}$/;
const DATA_STATUSES = new Set(["complete", "needs_review", "unknown"]);
const BUSINESS_STATUSES = new Set(["not_evaluated", "needs_review", "insufficient_history", "outside_scope", "unknown"]);
const CASH_TYPES = new Set(["pure_buyout", "sales_share", "mixed"]);
const OBSERVATIONS = new Set(["OBSERVED_POSTING", "NOT_OBSERVED", "OUTSIDE_SCOPE"]);
const AUTHORITY_CHECKS = ["schemaEqual", "splitTypePure", "noSplitOverlap", "rowMultisetConserved", "amountConserved", "monthlyRowCountConserved", "monthlyAmountConserved"];
const SOURCE_ROLES = ["total-ledger-authority", "sales-share-ledger-authority", "buyout-ledger-authority", "user-reviewed-channel-master"];

function unavailable(code = "workspace_snapshot_invalid") {
  const messages = {
    workspace_snapshot_missing: "本地只读资料尚未准备，请先生成已校验的工作台快照。",
    workspace_snapshot_stale: "本地源资料已变化，旧工作台快照已停用，请重新生成。",
    workspace_snapshot_invalid: "本地只读资料校验未通过，工作台不会使用该快照。"
  };
  return new AppError(code, messages[code] ?? messages.workspace_snapshot_invalid, 503);
}

function requireValue(condition) {
  if (!condition) throw unavailable();
}

function inside(root, target) {
  const part = relative(root, target);
  return part !== ".." && !part.startsWith(`..${sep}`) && !isAbsolute(part);
}

async function containedPath(root, path, directory = false) {
  requireValue(typeof path === "string" && path.length > 0 && !isAbsolute(path));
  const parts = path.split(/[\\/]/);
  requireValue(parts.every((part) => part && part !== "." && part !== ".." && !/[:\0]/.test(part)));
  const target = await realpath(resolve(root, ...parts));
  requireValue(inside(root, target));
  const info = await stat(target, { bigint: true });
  requireValue(directory ? info.isDirectory() : info.isFile());
  return { target, info };
}

const containedFile = (root, path) => containedPath(root, path);

async function directoryMatches(root, source) {
  const current = await containedPath(root, source.path, true);
  const entries = (await readdir(current.target)).sort();
  if (current.info.mtimeNs.toString() !== source.mtimeNs || JSON.stringify(entries) !== JSON.stringify(source.entries)) throw unavailable("workspace_snapshot_stale");
  return current;
}

function signature(info) {
  return `${info.size}:${info.mtimeNs}:${info.ctimeNs}`;
}

async function hashFile(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

function stringValue(value, { nullable = true, maximum = 2000 } = {}) {
  if (value === null && nullable) return null;
  requireValue(typeof value === "string" && value.length <= maximum);
  return value;
}

function amount(value) {
  requireValue(value === null || (typeof value === "number" && Number.isFinite(value)));
  return value;
}

function count(value, nullable = true) {
  requireValue((nullable && value === null) || (Number.isSafeInteger(value) && value >= 0));
  return value;
}

function stringList(value) {
  requireValue(Array.isArray(value) && value.length <= 10000);
  return value.map((entry) => stringValue(entry, { nullable: false }));
}

function matchingAmount(actual, expected) {
  // Python emits Decimal aggregates as JSON numbers. Permit only floating point
  // serialization noise; never round, clip, or absorb financial discrepancies.
  const tolerance = Math.max(1e-8, Number.EPSILON * 16 * Math.max(Math.abs(actual), Math.abs(expected)));
  requireValue(Math.abs(actual - expected) <= tolerance);
}

function projectMonths(value, outsideScope = false) {
  requireValue(Array.isArray(value) && value.length <= 1200);
  let previous = "";
  return value.map((row) => {
    requireValue(row && MONTH.test(row.month) && row.month > previous && OBSERVATIONS.has(row.observationStatus) && typeof row.complete === "boolean");
    previous = row.month;
    const cash = amount(row.amount);
    requireValue(row.observationStatus === "OBSERVED_POSTING" ? cash !== null : cash === null);
    if (outsideScope) requireValue(cash === null && row.observationStatus === "OUTSIDE_SCOPE");
    return { month: row.month, amount: cash, complete: row.complete, observationStatus: row.observationStatus };
  });
}

function projectItem(item, dataset) {
  requireValue(item && typeof item === "object" && !Array.isArray(item));
  const id = stringValue(item.id, { nullable: false, maximum: 200 });
  requireValue(id.length > 0 && item.standardWorkId === id && item.syntheticOnly === false);
  requireValue(DATA_STATUSES.has(item.dataStatus) && BUSINESS_STATUSES.has(item.businessStatus));
  requireValue(CASH_TYPES.has(item.cashType));
  const pureBuyout = item.cashType === "pure_buyout";
  const monthlyCash = projectMonths(item.monthlyCash, pureBuyout);
  const windowMonths = monthlyCash.filter((row) => row.month >= dataset.cashPeriodStart && row.month <= dataset.cutoffMonth);
  requireValue(windowMonths.length === 12 && windowMonths[0].month === dataset.cashPeriodStart && windowMonths.at(-1).month === dataset.cutoffMonth);
  for (let index = 1; index < windowMonths.length; index += 1) {
    const before = windowMonths[index - 1].month.split("-").map(Number);
    const after = windowMonths[index].month.split("-").map(Number);
    requireValue(after[0] * 12 + after[1] === before[0] * 12 + before[1] + 1);
  }
  const cash = amount(item.salesShareCash12Months);
  const observed = windowMonths.filter((row) => row.complete && row.amount !== null);
  requireValue(item.cashCoverage?.expectedMonths === 12 && item.cashCoverage.observedMonths === observed.length);
  if (observed.length) {
    requireValue(cash !== null);
    matchingAmount(cash, observed.reduce((sum, row) => sum + row.amount, 0));
  } else requireValue(cash === null);
  if (pureBuyout) requireValue(item.businessStatus === "outside_scope");
  requireValue(Array.isArray(item.channels));
  const channels = item.channels.map((channel) => {
    requireValue(channel && typeof channel.canonical === "boolean");
    return {
      uid: stringValue(channel.uid, { nullable: false, maximum: 200 }),
      name: stringValue(channel.name),
      amount: amount(channel.amount),
      canonical: channel.canonical
    };
  });
  requireValue(new Set(channels.map((row) => row.uid)).size === channels.length);
  const channelCash = channels.filter((row) => row.amount !== null);
  if (cash === null) requireValue(channelCash.length === 0);
  else {
    requireValue(channelCash.length > 0);
    matchingAmount(cash, channelCash.reduce((sum, row) => sum + row.amount, 0));
  }
  const channelCount = count(item.channelCount);
  requireValue(channelCount === channels.length);
  requireValue(item.completeness && typeof item.completeness === "object");
  const completeness = {};
  for (const key of ["missingBasicInfoRecord", "missingCoreFields", "missingClassification"]) {
    requireValue(item.completeness[key] === null || typeof item.completeness[key] === "boolean");
    completeness[key] = item.completeness[key];
  }
  requireValue(Array.isArray(item.qualityIssues));
  const qualityIssues = item.qualityIssues.map((issue) => {
    const projected = {
      code: stringValue(issue.code, { nullable: false, maximum: 200 }),
      messageZh: stringValue(issue.messageZh, { nullable: false })
    };
    for (const key of ["severity", "field", "status", "sourceLabel"]) {
      if (Object.hasOwn(issue, key)) projected[key] = stringValue(issue[key]);
    }
    return projected;
  });
  const result = {
    id, standardWorkId: id,
    workName: stringValue(item.workName), authorName: stringValue(item.authorName), category: stringValue(item.category),
    completeBillMonths: count(item.completeBillMonths), channelCount,
    salesShareCash12Months: cash, cashType: item.cashType,
    dataStatus: item.dataStatus, businessStatus: item.businessStatus, completeness,
    syntheticOnly: false, monthlyCash, channels, qualityIssues,
    cashCoverage: { observedMonths: observed.length, expectedMonths: 12 },
    reviewReason: item.reviewReason === undefined ? null : stringValue(item.reviewReason),
    notices: item.notices === undefined ? [] : stringList(item.notices)
  };
  for (const key of ["classificationLevel1", "classificationLevel2", "classificationLevel3", "workSource", "rightsStartDate", "rightsEndDate", "firstSalesMonth", "productStatus"]) {
    if (Object.hasOwn(item, key)) result[key] = stringValue(item[key]);
  }
  for (const key of ["rawWorkIds", "businessForms", "categoryPath"]) {
    if (Object.hasOwn(item, key)) result[key] = stringList(item[key]);
  }
  if (item.fieldSources !== undefined) {
    requireValue(item.fieldSources && typeof item.fieldSources === "object" && !Array.isArray(item.fieldSources));
    result.fieldSources = {};
    for (const key of ["workName", "authorName", "classificationLevel1", "classificationLevel2", "classificationLevel3", "workSource", "rightsStartDate", "rightsEndDate"]) {
      if (Object.hasOwn(item.fieldSources, key)) result.fieldSources[key] = stringList(item.fieldSources[key]);
    }
  }
  if (item.buyoutAudit !== undefined) {
    requireValue(item.buyoutAudit?.notForecastCash === true);
    result.buyoutAudit = {
      cash12Months: amount(item.buyoutAudit.cash12Months),
      totalCash: amount(item.buyoutAudit.totalCash),
      recordCount: count(item.buyoutAudit.recordCount, false), notForecastCash: true
    };
  }
  if (item.incompleteMonthlyCash !== undefined) result.incompleteMonthlyCash = projectMonths(item.incompleteMonthlyCash);
  // Cached forecast-shaped fields are deliberately not projected. The owning
  // repository produces the existing four-horizon null/abstained contract.
  return result;
}

function projectDataset(dataset, generatedAt, audit, reconciliation) {
  requireValue(dataset?.mode === "formal" && dataset.source === "local-reviewed-ledger-snapshot" && dataset.syntheticOnly === false && dataset.notForFormalDecision === true);
  if (audit) {
    requireValue(dataset.kind === "RAW_LEDGER_AUDIT" && dataset.sourceStatus === "RECONCILIATION_REQUIRED" && dataset.cashAuthorityVerified === false);
    requireValue(reconciliation && Number.isSafeInteger(reconciliation.missingRowCount) && reconciliation.missingRowCount >= 0 && Number.isSafeInteger(reconciliation.extraRowCount) && reconciliation.extraRowCount >= 0);
    requireValue(reconciliation.missingRowCount > 0 || reconciliation.extraRowCount > 0);
  } else {
    requireValue(dataset.cashAuthorityVerified === true && dataset.kind !== "RAW_LEDGER_AUDIT" && (dataset.sourceStatus === undefined || dataset.sourceStatus === "READY"));
  }
  requireValue(MONTH.test(dataset.cutoffMonth) && MONTH.test(dataset.cashPeriodStart) && MONTH.test(dataset.billMaxMonth));
  requireValue(dataset.cutoffMonth <= dataset.billMaxMonth);
  requireValue(typeof generatedAt === "string" && Number.isFinite(Date.parse(generatedAt)));
  const result = {
    mode: "formal", source: dataset.source, syntheticOnly: false, notForFormalDecision: true,
    cashAuthorityVerified: !audit, sourceStatus: audit ? "RECONCILIATION_REQUIRED" : "READY", generatedAt,
    cutoffMonth: dataset.cutoffMonth, cashPeriodStart: dataset.cashPeriodStart, billMaxMonth: dataset.billMaxMonth
  };
  for (const key of ["sourceLabelZh", "cashDefinitionLabelZh", "identityStatusLabelZh", "governanceStatusLabelZh", "completeBillMonthsDefinitionZh", "cashView"]) {
    if (Object.hasOwn(dataset, key)) result[key] = stringValue(dataset[key], { nullable: false });
  }
  if (audit) {
    result.kind = "RAW_LEDGER_AUDIT";
    result.sourceLabelZh = "原始账单核对 · 未通过总账守恒";
    result.sourceStatusLabelZh = "总账与拆分账单尚未一致，仅供原始资料核对，不构成已验证现金权威。";
    result.cashDefinitionLabelZh = "待核对原始分成账单净额；未通过总账守恒，仅用于原始账单核对。";
    result.reconciliation = { missingRowCount: reconciliation.missingRowCount, extraRowCount: reconciliation.extraRowCount };
    for (const [key, expected] of [["extraByMonth", reconciliation.extraRowCount], ["missingByMonth", reconciliation.missingRowCount]]) {
      if (Object.hasOwn(reconciliation, key)) {
        const values = reconciliation[key];
        requireValue(values && typeof values === "object" && !Array.isArray(values) && Object.keys(values).length <= 1200);
        requireValue(Object.entries(values).every(([month, value]) => MONTH.test(month) && Number.isSafeInteger(value) && value >= 0));
        requireValue(Object.values(values).reduce((sum, value) => sum + value, 0) === expected);
        result.reconciliation[key] = { ...values };
      }
    }
  }
  return result;
}

function validateAuthorityChecks(checks, audit) {
  if (!audit) {
    requireValue(AUTHORITY_CHECKS.every((key) => checks?.[key] === true));
    return;
  }
  requireValue(["schemaEqual", "splitTypePure", "noSplitOverlap"].every((key) => checks?.[key] === true));
  requireValue(checks.rowMultisetConserved === false);
  requireValue(["amountConserved", "monthlyRowCountConserved", "monthlyAmountConserved"].every((key) => typeof checks[key] === "boolean" || checks[key] === "NOT_CHECKED"));
}

export function createWorkspaceLocalSnapshotLoader() {
  let cached = null;
  let pending = null;
  async function read(config) {
    const configuredRoot = config.workspace?.sourceRoot ?? REPOSITORY_ROOT;
    try {
      const source = config.workspace?.source ?? "local_snapshot";
      const definition = SNAPSHOTS[source];
      requireValue(Boolean(definition));
      const audit = source === "local_audit";
      const root = await realpath(configuredRoot);
      const snapshot = await containedFile(root, definition.path);
      requireValue(snapshot.info.size <= BigInt(MAX_SNAPSHOT_BYTES));
      const snapshotSignature = signature(snapshot.info);
      if (cached?.root === root && cached.snapshotPath === snapshot.target && cached.snapshotSignature === snapshotSignature) {
        for (const source of cached.sources) {
          const current = await containedFile(root, source.path);
          if (current.target !== source.target || signature(current.info) !== source.signature) throw unavailable("workspace_snapshot_stale");
        }
        for (const directory of cached.directories) await directoryMatches(root, directory);
        return structuredClone(cached.result);
      }
      const envelope = JSON.parse(await readFile(snapshot.target, "utf8"));
      requireValue(envelope.schema === definition.schema && typeof envelope.payloadJson === "string" && SHA256.test(envelope.sha256));
      requireValue(createHash("sha256").update(envelope.payloadJson, "utf8").digest("hex") === envelope.sha256);
      const payload = JSON.parse(envelope.payloadJson);
      const dataset = projectDataset(payload.dataset, payload.generatedAt, audit, payload.reconciliation);
      validateAuthorityChecks(payload.authorityChecks, audit);
      requireValue(Array.isArray(payload.sources) && payload.sources.length > 0 && payload.sources.length <= 10000);
      requireValue(SOURCE_ROLES.every((role) => payload.sources.some((source) => source.role === role)));
      const sources = [];
      const uniquePaths = new Set();
      for (const source of payload.sources) {
        requireValue(source && typeof source.role === "string" && source.role.length > 0 && SHA256.test(source.sha256) && Number.isSafeInteger(source.size) && source.size >= 0 && /^\d+$/.test(source.mtimeNs));
        requireValue(!uniquePaths.has(source.path));
        uniquePaths.add(source.path);
        const current = await containedFile(root, source.path);
        requireValue(current.target !== snapshot.target);
        if (current.info.size !== BigInt(source.size) || current.info.mtimeNs.toString() !== source.mtimeNs || await hashFile(current.target) !== source.sha256) throw unavailable("workspace_snapshot_stale");
        const after = await stat(current.target, { bigint: true });
        if (signature(after) !== signature(current.info)) throw unavailable("workspace_snapshot_stale");
        sources.push({ path: source.path, target: current.target, signature: signature(after) });
      }
      requireValue(Array.isArray(payload.sourceDirectories) && payload.sourceDirectories.length > 0 && payload.sourceDirectories.length <= 10000);
      requireValue(["master-data-directory", "work-mapping-directory"].every((role) => payload.sourceDirectories.some((directory) => directory.role === role)));
      const directories = [];
      const uniqueDirectories = new Set();
      for (const directory of payload.sourceDirectories) {
        requireValue(directory && /^\d+$/.test(directory.mtimeNs) && Array.isArray(directory.entries));
        requireValue(directory.entries.every((entry) => typeof entry === "string" && entry && !/[\\/\0]/.test(entry) && entry !== "." && entry !== ".."));
        requireValue(!uniqueDirectories.has(directory.path));
        uniqueDirectories.add(directory.path);
        await directoryMatches(root, directory);
        directories.push({ path: directory.path, mtimeNs: directory.mtimeNs, entries: directory.entries });
      }
      requireValue(Array.isArray(payload.items) && payload.items.length <= 100000);
      const items = payload.items.map((item) => projectItem(item, dataset));
      if (audit) {
        for (const item of items) {
          item.dataStatus = "needs_review";
          if (!item.qualityIssues.some((issue) => issue.code === "LEDGER_RECONCILIATION_REQUIRED")) {
            item.qualityIssues.unshift({
              code: "LEDGER_RECONCILIATION_REQUIRED", severity: "blocking", field: "cashAuthority", status: "unresolved",
              messageZh: "总账与拆分账单未通过守恒核对；本页仅展示待核对原始事实，不得用于正式收入、模型或业务验收。"
            });
          }
        }
      }
      requireValue(new Set(items.map((item) => item.id)).size === items.length);
      for (const source of sources) {
        const current = await containedFile(root, source.path);
        if (current.target !== source.target || signature(current.info) !== source.signature) throw unavailable("workspace_snapshot_stale");
      }
      for (const directory of directories) await directoryMatches(root, directory);
      const afterSnapshot = await stat(snapshot.target, { bigint: true });
      if (signature(afterSnapshot) !== snapshotSignature) throw unavailable("workspace_snapshot_stale");
      const result = { dataset, items };
      cached = { root, snapshotPath: snapshot.target, snapshotSignature, sources, directories, result };
      return structuredClone(result);
    } catch (error) {
      cached = null;
      if (error instanceof AppError) throw error;
      if (error.code === "ENOENT" || error.code === "ENOTDIR") throw unavailable("workspace_snapshot_missing");
      throw unavailable();
    }
  }
  return async function loadWorkspaceLocalSnapshot(config) {
    // Serialize loading to avoid hashing the same large source workbooks for
    // concurrent context/overview/list requests. Every request still checks stat.
    const previous = pending;
    let release;
    pending = new Promise((resolvePromise) => { release = resolvePromise; });
    if (previous) await previous;
    try { return await read(config); } finally { release(); }
  };
}
