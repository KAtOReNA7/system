import { badRequest } from "../errors.js";
import { listWorks, getWorkById } from "./workRepository.js";
import { createWorkspaceLocalSnapshotLoader } from "./workspaceLocalSnapshot.js";

export const WORKSPACE_DATA_STATUSES = Object.freeze(["complete", "needs_review", "unknown"]);
export const WORKSPACE_BUSINESS_STATUSES = Object.freeze([
  "not_evaluated", "needs_review", "insufficient_history", "outside_scope", "unknown"
]);

const FORMAL_DATASET = Object.freeze({
  mode: "formal",
  source: "m1-readonly-work-repository",
  syntheticOnly: false,
  notForFormalDecision: true,
  cutoffMonth: null,
  cashPeriodStart: null,
  cashDefinitionLabelZh: "分成现金尚未接入；现有 M1 接口仅提供作品 ID 与基础缺项标记"
});

export function workspaceContext(dataset) {
  return {
    dataset: { ...dataset },
    capabilities: {
      readOnly: true,
      writesAllowed: false,
      modelExecutionAllowed: false,
      productionForecastAvailable: false,
      cashAuthorityVerified: dataset.cashAuthorityVerified === true
    }
  };
}

export function parseWorkspaceFilters(searchParams = new URLSearchParams()) {
  const allowed = new Set(["search", "category", "dataStatus", "businessStatus", "page", "pageSize", "fixture", "mode"]);
  for (const key of searchParams.keys()) {
    if (!allowed.has(key)) throw badRequest(`Unsupported workspace query: ${key}`);
  }
  const filters = Object.fromEntries(["search", "category", "dataStatus", "businessStatus"].map((key) => [key, (searchParams.get(key) ?? "").trim()]));
  if (filters.search.length > 200 || filters.category.length > 80) throw badRequest("Workspace filter is too long");
  if (filters.dataStatus && !WORKSPACE_DATA_STATUSES.includes(filters.dataStatus)) throw badRequest("dataStatus is not supported");
  if (filters.businessStatus && !WORKSPACE_BUSINESS_STATUSES.includes(filters.businessStatus)) throw badRequest("businessStatus is not supported");
  // Query parameters never choose the composition or activate synthetic data.
  return filters;
}

export function workspaceList(items, dataset, { pagination, searchParams }) {
  const filters = parseWorkspaceFilters(searchParams);
  const needle = filters.search.toLocaleLowerCase("zh-CN");
  const filtered = items.filter((item) =>
    (!needle || [item.id, item.workName, item.authorName].some((value) => String(value ?? "").toLocaleLowerCase("zh-CN").includes(needle))) &&
    (!filters.category || (item.category ?? "unknown") === filters.category) &&
    (!filters.dataStatus || item.dataStatus === filters.dataStatus) &&
    (!filters.businessStatus || item.businessStatus === filters.businessStatus)
  );
  const start = (pagination.page - 1) * pagination.pageSize;
  return {
    ...workspaceContext(dataset),
    items: filtered.slice(start, start + pagination.pageSize),
    pagination: { ...pagination, total: filtered.length },
    filters,
    facets: {
      categories: [...new Set(items.map((item) => item.category).filter(Boolean))].sort(),
      dataStatuses: WORKSPACE_DATA_STATUSES,
      businessStatuses: WORKSPACE_BUSINESS_STATUSES
    }
  };
}

function distribution(items, key) {
  const counts = new Map();
  for (const item of items) {
    const value = item[key] ?? "unknown";
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts].map(([value, count]) => ({ value, count }));
}

export function workspaceOverview(items, dataset) {
  const knownCash = items.filter((item) => typeof item.salesShareCash12Months === "number" && Number.isFinite(item.salesShareCash12Months));
  const knownBillMonths = items.filter((item) => Number.isSafeInteger(item.completeBillMonths));
  const channelReviewAvailable = items.some((item) => Object.hasOwn(item, "reviewReason"));
  return {
    ...workspaceContext(dataset),
    summary: {
      workCount: items.length,
      dataCompleteCount: items.filter((item) => item.dataStatus === "complete").length,
      completeBillWorkCount: knownBillMonths.length ? knownBillMonths.filter((item) => item.completeBillMonths >= 3).length : null,
      completeBillWorkDefinitionZh: dataset.completeBillMonthsDefinitionZh ?? "至少有 3 个完整账单月的作品数；不等于动态 Core80 人口或预测资格",
      knownBillMonthsWorkCount: knownBillMonths.length,
      unknownBillMonthsWorkCount: items.length - knownBillMonths.length,
      needsMasterDataCount: items.filter((item) => Object.values(item.completeness ?? {}).includes(true)).length,
      channelReviewCount: channelReviewAvailable ? items.filter((item) => item.reviewReason).length : null,
      needsReviewCount: items.filter((item) => item.dataStatus === "needs_review").length,
      insufficientHistoryCount: items.filter((item) => item.businessStatus === "insufficient_history").length,
      outsideScopeCount: items.filter((item) => item.businessStatus === "outside_scope").length,
      salesShareCash12MonthsTotal: knownCash.length ? knownCash.reduce((sum, item) => sum + item.salesShareCash12Months, 0) : null,
      knownCashWorkCount: knownCash.length,
      unknownCashWorkCount: items.filter((item) => item.salesShareCash12Months === null && item.businessStatus !== "outside_scope").length,
      outsideScopeCashWorkCount: items.filter((item) => item.salesShareCash12Months === null && item.businessStatus === "outside_scope").length
    },
    recentWorks: items.slice(0, 6),
    categoryDistribution: distribution(items, "category"),
    dataStatusDistribution: distribution(items, "dataStatus"),
    businessStatusDistribution: distribution(items, "businessStatus")
  };
}

export function workspacePredictions(work) {
  const outsideScope = work.cashType === "pure_buyout";
  return [3, 6, 12, 36].map((horizonMonths) => ({
    horizonMonths,
    pointEstimate: null,
    status: outsideScope ? "ABSTAINED" : "NOT_GENERATED",
    reason: outsideScope ? "buyout_outside_m2_forecast_scope" : "No authorized work-level forecast is available"
  }));
}

function projectFormalWork(work) {
  const completeness = {
    missingBasicInfoRecord: work.completeness?.missingBasicInfoRecord ?? null,
    missingCoreFields: work.completeness?.missingCoreFields ?? null,
    missingClassification: work.completeness?.missingClassification ?? null
  };
  return {
    id: String(work.standardWorkId ?? work.id),
    standardWorkId: String(work.standardWorkId ?? work.id),
    workName: null,
    authorName: null,
    category: null,
    completeBillMonths: null,
    channelCount: null,
    salesShareCash12Months: null,
    cashType: null,
    dataStatus: Object.values(completeness).includes(true) ? "needs_review" : "unknown",
    businessStatus: "unknown",
    completeness,
    syntheticOnly: false
  };
}

export function createWorkspaceRepository(dependencies = {}) {
  const readWorks = dependencies.listWorks ?? listWorks;
  const readWork = dependencies.getWorkById ?? getWorkById;
  const loadSnapshot = dependencies.loadLocalSnapshot ?? createWorkspaceLocalSnapshotLoader();
  const isLocalSnapshot = (config) => ["local_snapshot", "local_audit"].includes(config.workspace?.source);
  async function allWorks(config) {
    const first = await readWorks(config, { page: 1, pageSize: 100 });
    const items = [...first.items];
    for (let page = 2; (page - 1) * 100 < first.pagination.total; page += 1) {
      const next = await readWorks(config, { page, pageSize: 100 });
      items.push(...next.items);
    }
    return items.map(projectFormalWork);
  }
  return {
    async getWorkspaceContext(config = {}) {
      if (isLocalSnapshot(config)) {
        try {
          const snapshot = await loadSnapshot(config);
          return workspaceContext(snapshot.dataset);
        } catch (error) {
          return workspaceContext({
            ...FORMAL_DATASET,
            source: "local-reviewed-ledger-snapshot",
            ...(config.workspace?.source === "local_audit" ? { kind: "RAW_LEDGER_AUDIT" } : {}),
            sourceStatus: "UNAVAILABLE",
            sourceLabelZh: config.workspace?.source === "local_audit" ? "原始账单核对 · 未就绪" : "本地真实数据 · 未就绪",
            cashDefinitionLabelZh: "本地只读资料尚未准备或来源校验未通过；当前不展示现金。",
            sourceStatusLabelZh: error.statusCode === 503 ? error.message : "本地只读资料暂不可用。",
            sourceErrorCode: error.statusCode === 503 ? error.code : "workspace_snapshot_invalid",
            cashAuthorityVerified: false
          });
        }
      }
      return workspaceContext(FORMAL_DATASET);
    },
    async getWorkspaceOverview(config) {
      if (isLocalSnapshot(config)) {
        const snapshot = await loadSnapshot(config);
        return workspaceOverview(snapshot.items, snapshot.dataset);
      }
      return workspaceOverview(await allWorks(config), FORMAL_DATASET);
    },
    async listWorkspaceWorks(config, query) {
      parseWorkspaceFilters(query.searchParams);
      if (isLocalSnapshot(config)) {
        const snapshot = await loadSnapshot(config);
        return workspaceList(snapshot.items, snapshot.dataset, query);
      }
      return workspaceList(await allWorks(config), FORMAL_DATASET, query);
    },
    async getWorkspaceWorkById(config, id) {
      if (isLocalSnapshot(config)) {
        const snapshot = await loadSnapshot(config);
        const work = snapshot.items.find((item) => item.id === id);
        return work ? { ...workspaceContext(snapshot.dataset), item: { ...work, predictions: workspacePredictions(work) } } : null;
      }
      const source = await readWork(config, id);
      if (!source) return null;
      const work = projectFormalWork(source);
      return {
        ...workspaceContext(FORMAL_DATASET),
        item: {
          ...work,
          monthlyCash: null,
          channels: null,
          predictions: workspacePredictions(work),
          notices: ["现有 M1 只读接口尚未提供作品名称、作者、分类、账单月数、渠道和分成现金。未提供不等于零。", "基础缺项标记不能证明动态 Core80 资格或模型业务验收通过。"]
        }
      };
    }
  };
}
