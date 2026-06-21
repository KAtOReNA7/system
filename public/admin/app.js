const PAGE_KEYS = [
  "system",
  "works",
  "mapping",
  "jobs",
  "m2-overview",
  "m2-list",
  "m2-detail",
  "m2-gaps",
  "m2-backtests"
];
const state = {
  activePage: "system",
  fixtureMode: new URLSearchParams(window.location.search).get("fixture") === "1",
  m2SelectedWorkId: "SYN-WORK-0001",
  m2ListFilters: {
    query: "",
    rating: "",
    lifecycle: "",
    risk: "",
    readiness: "",
    resultStatus: "",
    sort: "updatedAt.desc",
    page: 1,
    pageSize: 20
  },
  m2GapFilters: {
    gapCode: "",
    severity: "",
    readiness: "",
    page: 1,
    pageSize: 100
  },
  m2SelectedBacktestId: ""
};

const fixture = {
  health: {
    status: "ok",
    service: "m1-audiobook-evaluation",
    environment: "local"
  },
  dbHealth: {
    service: "m1-audiobook-evaluation",
    status: "ok",
    database: {
      connected: true,
      schemaVersion: "0060.290",
      systemState: "schema_initialized",
      checks: {
        timezoneUtc: true,
        expectedSchemaVersion: true,
        systemStateReadable: true,
        formalViewsQueryable: true,
        runtimeRoleAllowed: true
      }
    }
  },
  system: {
    status: "ok",
    system: {
      state: "schema_initialized",
      mappingVersionReady: false,
      billImportReady: false
    }
  },
  works: {
    items: [
      {
        id: "SYN-WORK-001",
        standardWorkId: "SYN-WORK-001",
        completeness: {
          missingBasicInfoRecord: true,
          missingCoreFields: true,
          missingClassification: true
        }
      },
      {
        id: "SYN-WORK-002",
        standardWorkId: "SYN-WORK-002",
        completeness: {
          missingBasicInfoRecord: false,
          missingCoreFields: false,
          missingClassification: true
        }
      }
    ],
    pagination: { page: 1, pageSize: 20, total: 2 }
  },
  mappingVersions: {
    items: [
      {
        id: "1",
        versionNo: 1,
        status: "building",
        triggerType: "synthetic_fixture",
        projectionRowCount: 0,
        createdAt: "2026-01-01T00:00:00.000Z"
      }
    ],
    pagination: { page: 1, pageSize: 20, total: 1 }
  },
  jobs: {
    items: [
      {
        id: "1",
        type: "synthetic_fixture_job",
        logicalOperationKey: "SYN-JOB-001",
        status: "pending",
        createdAt: "2026-01-01T00:00:00.000Z",
        startedAt: null,
        finishedAt: null
      }
    ],
    pagination: { page: 1, pageSize: 20, total: 1 }
  }
};

const CODE_LABELS = {
  schema_initialized: "结构已初始化",
  database_not_configured: "数据库未配置",
  database_unavailable: "数据库不可用",
  formal_data_blocked: "正式评估已阻断",
  building: "构建中",
  active: "已启用",
  pending: "等待中",
  running: "运行中",
  blocked: "已阻断",
  succeeded: "已成功",
  failed: "已失败",
  cancelled: "已取消",
  validated: "已校验",
  retired: "已退役"
};

const PAGE_STATE_LABELS = {
  loading: "加载中",
  success: "正常",
  degraded: "降级",
  empty: "空状态",
  error: "错误",
  "not found": "未找到",
  blocked: "已阻断"
};

const PAGE_STATE_DESCRIPTIONS = {
  loading: "正在读取本页只读信息。",
  success: "请求成功，当前展示的是只读结果。",
  degraded: "依赖未满足或不可用；页面仍保持只读可访问。",
  empty: "请求成功但暂无数据；空库时这是正常状态。",
  error: "请求失败；请根据技术码排查。",
  "not found": "目标记录不存在，未产生任何写入。",
  blocked: "请求被业务边界阻断；页面保持只读。"
};

const ERROR_MESSAGES = {
  bad_request: "请求参数不符合要求，请检查分页或详情 ID。",
  not_found: "目标记录不存在。",
  database_not_configured: "数据库未配置。当前是开发环境降级状态，不等同于空库。",
  database_unavailable: "数据库不可用。请检查本地或测试数据库是否启动并完成迁移。",
  formal_data_blocked: "正式老品评估仍被阻断，需等待 M1 正式数据 readiness 完成。",
  internal_error: "服务处理请求时发生异常。"
};

const MAPPING_STATUS_DESCRIPTIONS = {
  building: "版本仍在构建中，仅可查看，不可激活。",
  active: "当前启用版本；本页面仍不提供切换操作。",
  failed: "版本构建或校验失败，需要技术排查。",
  retired: "历史版本，仅用于追溯。"
};

const JOB_STATUS_DESCRIPTIONS = {
  pending: "等待中，当前页面不提供启动或重试。",
  running: "运行中，仅展示状态。",
  blocked: "已阻断，需要按任务来源排查。",
  succeeded: "已成功完成。",
  failed: "已失败，需要查看后续诊断信息。",
  cancelled: "已取消。"
};

function text(value) {
  if (value === null || value === undefined || value === "") {
    return "未提供";
  }
  return String(value);
}

function escapeHtml(value) {
  return text(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttribute(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function displayCode(value) {
  const code = text(value);
  const label = CODE_LABELS[code];
  if (!label) {
    return code;
  }
  return `${label}（${code}）`;
}

function setPageState(page, value) {
  const pill = document.querySelector(`[data-state-for="${page}"]`);
  if (!pill) {
    return;
  }
  pill.dataset.state = value;
  const label = PAGE_STATE_LABELS[value] || value;
  pill.textContent = `${label} / ${value}`;

  let help = document.querySelector(`[data-state-help-for="${page}"]`);
  if (!help) {
    help = document.createElement("p");
    help.className = "state-help";
    help.dataset.stateHelpFor = page;
    pill.insertAdjacentElement("afterend", help);
  }
  help.textContent = PAGE_STATE_DESCRIPTIONS[value] || "";
  help.classList.toggle("is-hidden", !help.textContent);
}

function setNotice(message, tone = "info") {
  const notice = document.querySelector("#globalNotice");
  notice.textContent = message;
  notice.dataset.tone = tone;
  notice.classList.toggle("is-hidden", !message);
}

async function getJson(path, fixtureValue) {
  if (state.fixtureMode) {
    await new Promise((resolve) => setTimeout(resolve, 80));
    return fixtureValue;
  }

  const response = await fetch(path, { headers: { accept: "application/json" } });
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body?.error?.message || body?.database?.reason || "Request failed");
    error.statusCode = response.status;
    error.payload = body;
    throw error;
  }
  return body;
}

async function getM2Json(path) {
  const response = await fetch(path, { headers: { accept: "application/json" } });
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body?.error?.message || "M2 request failed");
    error.statusCode = response.status;
    error.payload = body;
    throw error;
  }
  return body;
}

function buildQuery(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  }
  return search.toString();
}

function renderM2DatasetPanel(dataset) {
  const source = dataset?.source || "m2-b-static-synthetic-fixture";
  return `
    <section class="m2-safety-panel" data-testid="m2-safety-panel">
      <div class="meta-row">
        <span class="badge warn">fixture-only</span>
        <span class="badge ok">synthetic marker</span>
        <span class="badge warn">formal blocked</span>
      </div>
      <div class="cards three compact-cards">
        <article class="card">
          <h3>数据集</h3>
          ${renderMetric("dataset.mode", dataset?.mode || "fixture")}
          ${renderMetric("source", source)}
          ${renderMetric("formalDataAuthorized", dataset?.formalDataAuthorized ?? false)}
          ${renderMetric("formalEvaluationAllowed", dataset?.formalEvaluationAllowed ?? false)}
        </article>
        <article class="card">
          <h3>月份边界</h3>
          ${renderMetric("最新完整月", dataset?.cutoffMonth || "2026-04")}
          ${renderMetric("不完整月", (dataset?.incompleteMonths || ["2026-05"]).join(", "))}
          <p class="pagination-note">2026-05 excluded from evaluation cutoff.</p>
        </article>
        <article class="card">
          <h3>正式评估状态</h3>
          <p class="blocked-copy">Formal old-product evaluation is blocked until M1 formal data readiness is complete.</p>
          <p class="pagination-note">当前页面不得用于正式业务决策。</p>
        </article>
      </div>
    </section>
  `;
}

function renderM2Error(error, options = {}) {
  const payload = error.payload || {};
  const apiError = payload.error || {};
  const code = apiError.code || "request_failed";
  const message = ERROR_MESSAGES[code] || "老品评估信息暂不可读取。";
  const title = options.title || (code === "formal_data_blocked" ? "正式评估已阻断" : "老品评估状态暂不可用");
  return `
    <div class="error-state ${code === "formal_data_blocked" ? "blocked-state" : ""}">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(message)}</p>
      <p class="technical-code">技术码：<code>${escapeHtml(code)}</code></p>
      ${apiError.requestId ? `<p class="pagination-note">requestId: ${escapeHtml(apiError.requestId)}</p>` : ""}
    </div>
  `;
}

function setM2ErrorPageState(page, error) {
  const code = error.payload?.error?.code;
  if (code === "formal_data_blocked") {
    setPageState(page, "blocked");
    return;
  }
  if (error.statusCode === 404) {
    setPageState(page, "not found");
    return;
  }
  if (code === "database_not_configured" || code === "database_unavailable") {
    setPageState(page, "degraded");
    return;
  }
  setPageState(page, "error");
}

function renderDistribution(title, distribution = {}, filterKey = "") {
  return `
    <article class="card">
      <h3>${escapeHtml(title)}</h3>
      <div class="distribution-grid">
        ${Object.entries(distribution).map(([key, value]) => `
          <div>
            ${filterKey
              ? `<a href="#m2-list" data-m2-filter-key="${escapeAttribute(filterKey)}" data-m2-filter-value="${escapeAttribute(key)}">${escapeHtml(key)}</a>`
              : `<span>${escapeHtml(key)}</span>`}
            <strong>${escapeHtml(value)}</strong>
          </div>
        `).join("")}
      </div>
    </article>
  `;
}

function applyM2ListFilter(filterKey, filterValue) {
  state.m2ListFilters = {
    ...defaultM2ListFilters(),
    [filterKey]: filterValue,
    page: 1
  };
  if (location.hash.replace("#", "") !== "m2-list") {
    location.hash = "m2-list";
    return;
  }
  renderM2List();
}

function defaultM2ListFilters() {
  return {
    query: "",
    rating: "",
    lifecycle: "",
    risk: "",
    readiness: "",
    resultStatus: "",
    sort: "updatedAt.desc",
    page: 1,
    pageSize: 20
  };
}

function defaultM2GapFilters() {
  return {
    gapCode: "",
    severity: "",
    readiness: "",
    page: 1,
    pageSize: 100
  };
}

function renderM2LifecycleBadge(value) {
  return `<span class="badge ok">${escapeHtml(value)}</span>`;
}

function renderM2RatingBadge(value) {
  const tone = ["S+", "S", "A"].includes(value) ? "ok" : ["D", "E"].includes(value) ? "danger" : "warn";
  return `<span class="badge ${tone}">${escapeHtml(value)}</span>`;
}

function renderM2ReadinessBadge(value) {
  return `<span class="badge ${value === "ready" ? "ok" : "warn"}">${escapeHtml(value)}</span>`;
}

function renderMetric(label, value, options = {}) {
  const displayValue = options.code ? displayCode(value) : text(value);
  return `
    <div class="metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(displayValue)}</strong>
    </div>
  `;
}

function renderError(error, options = {}) {
  const payload = error.payload || {};
  const apiError = payload.error;
  const reason = apiError?.code || payload.database?.reason || "request_failed";
  const message = ERROR_MESSAGES[reason] || "请求未完成，请查看技术码后排查。";
  const requestId = apiError?.requestId;
  return `
    <div class="error-state">
      <h3>${escapeHtml(options.title || "状态暂不可用")}</h3>
      <p>${escapeHtml(message)}</p>
      <p class="technical-code">技术码：<code>${escapeHtml(reason)}</code></p>
      ${requestId ? `<p class="pagination-note">requestId: ${escapeHtml(requestId)}</p>` : ""}
    </div>
  `;
}

function renderEmpty(title, description, details = []) {
  return `
    <div class="empty-state">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(description)}</p>
      ${details.length ? `<ul class="explain-list">${details.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
    </div>
  `;
}

function renderLoading(targetId) {
  document.querySelector(targetId).innerHTML = '<div class="loading">加载中…</div>';
}

function renderBooleanBadge(value) {
  const label = value ? "缺失" : "完整";
  const tone = value ? "warn" : "ok";
  return `<span class="badge ${tone}">${label}</span>`;
}

function renderStatusBadge(value) {
  const tone = value === "active" || value === "succeeded" ? "ok" : value === "failed" ? "danger" : "warn";
  return `<span class="badge ${tone}">${escapeHtml(displayCode(value))}</span>`;
}

function renderPagination(pagination) {
  return `
    <p class="pagination-note">
      page=${escapeHtml(pagination.page)} · pageSize=${escapeHtml(pagination.pageSize)} · total=${escapeHtml(pagination.total)}
    </p>
  `;
}

function renderTableHint() {
  return '<p class="table-hint">小屏幕下可横向滚动查看完整列。</p>';
}

function renderExplanation(title, items) {
  return `
    <div class="context-note">
      <strong>${escapeHtml(title)}</strong>
      <ul class="explain-list">
        ${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </div>
  `;
}

function renderStatusLegend(title, descriptions) {
  return `
    <div class="context-note">
      <strong>${escapeHtml(title)}</strong>
      <dl class="legend-list">
        ${Object.entries(descriptions).map(([code, description]) => `
          <div>
            <dt>${escapeHtml(displayCode(code))}</dt>
            <dd>${escapeHtml(description)}</dd>
          </div>
        `).join("")}
      </dl>
    </div>
  `;
}

function renderLifecycleUnavailable(error) {
  const payload = error.payload || {};
  const apiError = payload.error || {};
  const reason = apiError.code || "database_unavailable";
  const reasonText = displayCode(reason);
  return `
    <h3>生命周期状态</h3>
    ${renderMetric("状态", "暂不可读取")}
    ${renderMetric("原因", reasonText)}
    ${renderMetric("技术码", reason)}
    ${apiError.requestId ? `<p class="pagination-note">requestId: ${escapeHtml(apiError.requestId)}</p>` : ""}
  `;
}

async function renderSystem() {
  setPageState("system", "loading");
  document.querySelector("#serviceCard").innerHTML = '<div class="loading">加载服务状态…</div>';
  document.querySelector("#databaseCard").innerHTML = '<div class="loading">加载数据库状态…</div>';
  document.querySelector("#lifecycleCard").innerHTML = '<div class="loading">加载生命周期…</div>';

  const healthResult = await getJson("/health", fixture.health).catch((error) => ({ error }));
  const dbHealth = await getJson("/health/db", fixture.dbHealth).catch((error) => error.payload || {
    status: "degraded",
    database: { connected: false, reason: "database_unavailable" }
  });
  const systemResult = await getJson("/api/system/status", fixture.system).catch((error) => ({ error }));

  if (healthResult.error) {
    document.querySelector("#serviceCard").innerHTML = renderError(healthResult.error, { title: "服务状态暂不可用" });
  } else {
    document.querySelector("#serviceCard").innerHTML = `
      <h3>服务</h3>
      ${renderMetric("service", healthResult.service)}
      ${renderMetric("environment", healthResult.environment)}
      ${renderMetric("status", healthResult.status)}
    `;
  }

  const db = dbHealth.database || {};
  const dbReason = db.reason || "";
  const dbConnected = db.connected === true;
  document.querySelector("#databaseCard").innerHTML = `
    <h3>数据库</h3>
    ${renderMetric("连接状态", dbConnected ? "已连接" : "未连接")}
    ${renderMetric("schemaVersion", db.schemaVersion || (dbReason ? "暂不可读取" : "未配置"))}
    ${renderMetric("systemState", db.systemState || (dbReason ? "暂不可读取" : "未配置"), { code: Boolean(db.systemState) })}
    ${renderMetric("原因", dbReason ? displayCode(dbReason) : "无")}
  `;

  if (systemResult.error) {
    document.querySelector("#lifecycleCard").innerHTML = renderLifecycleUnavailable(systemResult.error);
  } else {
    const system = systemResult.system;
    document.querySelector("#lifecycleCard").innerHTML = `
      <h3>M1 生命周期</h3>
      ${renderMetric("state", system.state, { code: true })}
      ${renderMetric("mappingVersionReady", system.mappingVersionReady)}
      ${renderMetric("billImportReady", system.billImportReady)}
    `;
  }

  const systemErrorCode = systemResult.error?.payload?.error?.code;
  const dependencyDegraded = dbHealth.status === "degraded" ||
    systemErrorCode === "database_not_configured" ||
    systemErrorCode === "database_unavailable";
  const pageState = healthResult.error || (systemResult.error && !dependencyDegraded)
    ? "error"
    : dependencyDegraded
      ? "degraded"
      : "success";
  setPageState("system", pageState);
  setNotice(
    state.fixtureMode
      ? "当前使用前端合成 fixture，不读取真实数据。"
      : pageState === "degraded"
        ? dbReason === "database_not_configured"
          ? "数据库未配置：这是本地开发降级状态，不等同于空库。空库需要先完成迁移并返回 schemaVersion 与 systemState。"
          : "数据库依赖降级：请检查本地或测试数据库连接；页面仍保持只读。"
        : "",
    pageState
  );
}

async function renderWorks() {
  setPageState("works", "loading");
  renderLoading("#worksContent");
  try {
    const data = await getJson("/api/works?page=1&pageSize=20", fixture.works);
    if (!data.items.length) {
      setPageState("works", "empty");
      document.querySelector("#worksContent").innerHTML = renderEmpty(
        "暂无标准作品",
        "空库状态正常：数据库已可用，但当前没有标准作品记录。",
        [
          "未提供表示当前 API 尚未返回标准作品名称。",
          "缺失表示该字段仍待基础信息补全。",
          "当前不展示真实收入、作者或版权日期。"
        ]
      );
      return;
    }

    setPageState("works", "success");
    const first = await getJson(`/api/works/${encodeURIComponent(data.items[0].id)}`, {
      item: data.items[0]
    }).catch(() => ({ item: null }));
    document.querySelector("#worksContent").innerHTML = `
      ${renderExplanation("字段说明", [
        "未提供表示当前 API 尚未返回标准作品名称。",
        "缺失表示该字段仍待基础信息补全。",
        "当前不展示真实收入、作者或版权日期。"
      ])}
      <div class="table-wrap">
        ${renderTableHint()}
        <table>
          <thead>
            <tr>
              <th>标准作品ID</th>
              <th>作品名称</th>
              <th>基础信息</th>
              <th>核心字段</th>
              <th>分类</th>
            </tr>
          </thead>
          <tbody>
            ${data.items.map((item) => `
              <tr>
                <td>${escapeHtml(item.standardWorkId)}</td>
                <td>未提供</td>
                <td>${renderBooleanBadge(item.completeness.missingBasicInfoRecord)}</td>
                <td>${renderBooleanBadge(item.completeness.missingCoreFields)}</td>
                <td>${renderBooleanBadge(item.completeness.missingClassification)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        ${renderPagination(data.pagination)}
      </div>
      <div class="detail-panel">
        <h3>详情预览</h3>
        ${first.item ? `
          ${renderMetric("standardWorkId", first.item.standardWorkId)}
          ${renderMetric("missingBasicInfoRecord", first.item.completeness.missingBasicInfoRecord)}
          ${renderMetric("missingCoreFields", first.item.completeness.missingCoreFields)}
          ${renderMetric("missingClassification", first.item.completeness.missingClassification)}
        ` : "<p>未找到详情。</p>"}
      </div>
    `;
  } catch (error) {
    setPageState("works", error.statusCode === 404 ? "not found" : "error");
    document.querySelector("#worksContent").innerHTML = renderError(error);
  }
}

async function renderMapping() {
  setPageState("mapping", "loading");
  renderLoading("#mappingContent");
  try {
    const data = await getJson("/api/mapping-versions?page=1&pageSize=20", fixture.mappingVersions);
    if (!data.items.length) {
      setPageState("mapping", "empty");
      document.querySelector("#mappingContent").innerHTML = renderEmpty(
        "暂无映射版本",
        "空库状态正常：数据库中暂无 mapping version。",
        [
          "本页面只读展示映射版本元数据。",
          "不提供导入、激活、撤销或应用操作。"
        ]
      );
      return;
    }

    setPageState("mapping", "success");
    const first = await getJson(`/api/mapping-versions/${encodeURIComponent(data.items[0].id)}`, {
      item: data.items[0]
    }).catch(() => ({ item: null }));
    document.querySelector("#mappingContent").innerHTML = `
      ${renderStatusLegend("映射版本状态说明", MAPPING_STATUS_DESCRIPTIONS)}
      <div class="table-wrap">
        ${renderTableHint()}
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>versionNo</th>
              <th>status</th>
              <th>triggerType</th>
              <th>projectionRowCount</th>
              <th>createdAt</th>
            </tr>
          </thead>
          <tbody>
            ${data.items.map((item) => `
              <tr>
                <td>${escapeHtml(item.id)}</td>
                <td>${escapeHtml(item.versionNo)}</td>
                <td>${renderStatusBadge(item.status)}</td>
                <td>${escapeHtml(item.triggerType)}</td>
                <td>${escapeHtml(item.projectionRowCount)}</td>
                <td>${escapeHtml(item.createdAt)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        ${renderPagination(data.pagination)}
      </div>
      <div class="detail-panel">
        <h3>详情预览</h3>
        ${first.item ? `
          ${renderMetric("id", first.item.id)}
          ${renderMetric("isActive", first.item.status === "active")}
          ${renderMetric("status", first.item.status, { code: true })}
          ${renderMetric("triggerType", first.item.triggerType)}
        ` : "<p>未找到详情。</p>"}
      </div>
    `;
  } catch (error) {
    setPageState("mapping", error.statusCode === 404 ? "not found" : "error");
    document.querySelector("#mappingContent").innerHTML = renderError(error);
  }
}

async function renderJobs() {
  setPageState("jobs", "loading");
  renderLoading("#jobsContent");
  try {
    const data = await getJson("/api/jobs?page=1&pageSize=20", fixture.jobs);
    if (!data.items.length) {
      setPageState("jobs", "empty");
      document.querySelector("#jobsContent").innerHTML = renderEmpty(
        "暂无后台任务",
        "空库状态正常：当前没有后台任务记录。",
        [
          "本页面只读展示任务元数据。",
          "不提供启动、重试或取消操作。"
        ]
      );
      return;
    }

    setPageState("jobs", "success");
    const first = await getJson(`/api/jobs/${encodeURIComponent(data.items[0].id)}`, {
      item: data.items[0]
    }).catch(() => ({ item: null }));
    document.querySelector("#jobsContent").innerHTML = `
      ${renderStatusLegend("后台任务状态说明", JOB_STATUS_DESCRIPTIONS)}
      <div class="table-wrap">
        ${renderTableHint()}
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>type</th>
              <th>logicalOperationKey</th>
              <th>status</th>
              <th>createdAt</th>
              <th>finishedAt</th>
            </tr>
          </thead>
          <tbody>
            ${data.items.map((item) => `
              <tr>
                <td>${escapeHtml(item.id)}</td>
                <td>${escapeHtml(item.type)}</td>
                <td>${escapeHtml(item.logicalOperationKey)}</td>
                <td>${renderStatusBadge(item.status)}</td>
                <td>${escapeHtml(item.createdAt)}</td>
                <td>${escapeHtml(item.finishedAt)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        ${renderPagination(data.pagination)}
      </div>
      <div class="detail-panel">
        <h3>详情预览</h3>
        ${first.item ? `
          ${renderMetric("id", first.item.id)}
          ${renderMetric("type", first.item.type)}
          ${renderMetric("status", first.item.status, { code: true })}
          ${renderMetric("errorSummary", "当前 API 未返回")}
        ` : "<p>未找到详情。</p>"}
      </div>
    `;
  } catch (error) {
    setPageState("jobs", error.statusCode === 404 ? "not found" : "error");
    document.querySelector("#jobsContent").innerHTML = renderError(error);
  }
}

async function renderM2Overview() {
  setPageState("m2-overview", "loading");
  document.querySelector("#m2OverviewContent").innerHTML = '<div class="loading">加载老品评估总览…</div>';
  try {
    const data = await getM2Json("/api/m2/old-products/evaluations/overview");
    setPageState("m2-overview", "success");
    const highRiskCount = data.distribution?.riskSeverity?.high ?? 0;
    document.querySelector("#m2OverviewContent").innerHTML = `
      ${renderM2DatasetPanel(data.dataset)}
      <div class="cards three">
        <article class="card">
          <h3>评估规模</h3>
          ${renderMetric("eligible old products", data.summary.eligibleWorks)}
          ${renderMetric("evaluated old products", data.summary.evaluatedWorks)}
          ${renderMetric("blocked old products", data.summary.blockedWorks)}
          ${renderMetric("works needing readiness action", data.summary.blockedWorks)}
        </article>
        <article class="card">
          <h3>结果状态</h3>
          ${renderMetric("current results", data.summary.currentResults)}
          ${renderMetric("historical results", data.summary.historicalResults)}
          ${renderMetric("invalidated results", data.summary.invalidatedResults)}
          ${renderMetric("high-risk count", highRiskCount)}
        </article>
        <article class="card">
          <h3>正式边界</h3>
          ${renderMetric("latest confirmed complete month", data.summary.latestCutoffMonth)}
          ${renderMetric("incomplete month", data.dataset.incompleteMonths.join(", "))}
          <p class="blocked-copy">Formal old-product evaluation is blocked until M1 formal data readiness is complete.</p>
        </article>
      </div>
      <div class="cards three">
        ${renderDistribution("rating distribution", data.distribution.rating, "rating")}
        ${renderDistribution("lifecycle distribution", data.distribution.lifecycle, "lifecycle")}
        ${renderDistribution("risk distribution", data.distribution.riskSeverity, "risk")}
      </div>
      <div class="context-note">
        <strong>Notices</strong>
        <ul class="explain-list">
          ${data.notices.map((notice) => `<li>${escapeHtml(notice.code)}：${escapeHtml(notice.message)}</li>`).join("")}
        </ul>
      </div>
    `;
    attachM2OverviewDistributionHandlers();
  } catch (error) {
    setM2ErrorPageState("m2-overview", error);
    document.querySelector("#m2OverviewContent").innerHTML = renderM2Error(error);
  }
}

function attachM2OverviewDistributionHandlers() {
  document.querySelectorAll("[data-m2-filter-key]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      applyM2ListFilter(link.dataset.m2FilterKey, link.dataset.m2FilterValue);
    });
  });
}

async function renderM2List() {
  setPageState("m2-list", "loading");
  document.querySelector("#m2ListContent").innerHTML = '<div class="loading">加载老品评估列表…</div>';
  const query = buildQuery(state.m2ListFilters);
  try {
    const data = await getM2Json(`/api/m2/old-products/evaluations?${query}`);
    if (!data.items.length) {
      setPageState("m2-list", "empty");
      document.querySelector("#m2ListContent").innerHTML = `
        ${renderM2DatasetPanel(data.dataset)}
        ${renderM2ListFilters()}
        ${renderM2CurrentFilterSummary(state.m2ListFilters)}
        ${renderEmpty("暂无符合条件的老品评估", "请求成功但当前筛选条件没有匹配记录。", [
          "这是正常 empty 状态。",
          "页面只读，不会创建评估任务。"
        ])}
      `;
      attachM2ListFilterHandlers();
      return;
    }

    setPageState("m2-list", "success");
    document.querySelector("#m2ListContent").innerHTML = `
      ${renderM2DatasetPanel(data.dataset)}
      ${renderM2ListFilters()}
      ${renderM2CurrentFilterSummary(state.m2ListFilters)}
      <div class="table-wrap">
        ${renderTableHint()}
        <table>
          <thead>
            <tr>
              <th>standard work ID</th>
              <th>work name</th>
              <th>author</th>
              <th>classification path</th>
              <th>business forms</th>
              <th>cutoff month</th>
              <th>lifecycle</th>
              <th>rating</th>
              <th>forecast total</th>
              <th>risk level</th>
              <th>primary suggestion</th>
              <th>result status</th>
              <th>readiness</th>
              <th>detail</th>
            </tr>
          </thead>
          <tbody>
            ${data.items.map((item) => `
              <tr>
                <td><a href="#m2-detail:${encodeURIComponent(item.standardWorkId)}">${escapeHtml(item.standardWorkId)}</a></td>
                <td>${escapeHtml(item.workName)}</td>
                <td>${escapeHtml(item.authorName)}</td>
                <td>${escapeHtml(item.classificationPath.join(" / "))}</td>
                <td>${escapeHtml(item.businessForms.join(", "))}</td>
                <td>${escapeHtml(item.cutoffMonth)}</td>
                <td>${renderM2LifecycleBadge(item.lifecycle)}</td>
                <td>${renderM2RatingBadge(item.rating)}</td>
                <td>${escapeHtml(item.forecastTotal)}</td>
                <td>${escapeHtml(item.riskLevel)}</td>
                <td>${escapeHtml(item.primarySuggestion)}</td>
                <td>${escapeHtml(item.resultStatus)}</td>
                <td>${renderM2ReadinessBadge(item.readiness)}</td>
                <td><a href="#m2-detail:${encodeURIComponent(item.standardWorkId)}">View detail</a></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        ${renderPagination(data.pagination)}
      </div>
    `;
    attachM2ListFilterHandlers();
  } catch (error) {
    setM2ErrorPageState("m2-list", error);
    document.querySelector("#m2ListContent").innerHTML = renderM2Error(error);
  }
}

function renderM2ListFilters() {
  const filters = state.m2ListFilters;
  return `
    <form class="filter-panel" id="m2ListFilters">
      <label>Search
        <input name="query" value="${escapeAttribute(filters.query)}" placeholder="SYN-WORK">
      </label>
      <label>Rating
        <select name="rating">
          ${option("", "全部", filters.rating)}
          ${["S+", "S", "A", "B", "C", "D", "E"].map((value) => option(value, value, filters.rating)).join("")}
        </select>
      </label>
      <label>Lifecycle
        <select name="lifecycle">
          ${option("", "全部", filters.lifecycle)}
          ${["growth", "stable", "declining", "long_tail", "inactive", "rebound", "insufficient_history"].map((value) => option(value, value, filters.lifecycle)).join("")}
        </select>
      </label>
      <label>Risk
        <select name="risk">
          ${option("", "All", filters.risk)}
          ${["high", "medium", "low"].map((value) => option(value, value, filters.risk)).join("")}
        </select>
      </label>
      <label>Readiness
        <select name="readiness">
          ${option("", "全部", filters.readiness)}
          ${["ready", "blocked"].map((value) => option(value, value, filters.readiness)).join("")}
        </select>
      </label>
      <label>Result status
        <select name="resultStatus">
          ${option("", "All", filters.resultStatus)}
          ${["current", "historical", "invalidated"].map((value) => option(value, value, filters.resultStatus)).join("")}
        </select>
      </label>
      <label>Sort
        <select name="sort">
          ${["forecastTotal.desc", "forecastTotal.asc", "last12MonthSales.desc", "rating.asc", "riskSeverity.desc", "updatedAt.desc"].map((value) => option(value, value, filters.sort)).join("")}
        </select>
      </label>
      <label>Page
        <input name="page" inputmode="numeric" value="${escapeAttribute(filters.page)}">
      </label>
      <label>Page size
        <input name="pageSize" inputmode="numeric" value="${escapeAttribute(filters.pageSize)}">
      </label>
      <button type="submit" class="secondary">查询</button>
      <button type="button" class="secondary" data-m2-reset-list>Reset filters</button>
    </form>
  `;
}

function option(value, label, selected) {
  const optionValue = String(value ?? "");
  const selectedValue = String(selected ?? "");
  return `<option value="${escapeAttribute(optionValue)}" ${optionValue === selectedValue ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

function m2FilterSummaryText(filters) {
  const entries = Object.entries(filters).filter(([key, value]) => {
    if (value === "" || value === null || value === undefined) {
      return false;
    }
    if (key === "page" && String(value) === "1") {
      return false;
    }
    if (key === "pageSize" && ["20", "100"].includes(String(value))) {
      return false;
    }
    if (key === "sort" && value === "updatedAt.desc") {
      return false;
    }
    return true;
  });
  if (!entries.length) {
    return "default collection";
  }
  return entries.map(([key, value]) => `${key}=${value}`).join(", ");
}

function renderM2CurrentFilterSummary(filters) {
  return `
    <div class="context-note">
      <strong>Current filters</strong>
      <p>${escapeHtml(m2FilterSummaryText(filters))}</p>
      <p class="pagination-note">Filtering is performed through the M2-B-1 fixture API, not by a frontend-only data shortcut.</p>
    </div>
  `;
}

function attachM2ListFilterHandlers() {
  const form = document.querySelector("#m2ListFilters");
  if (!form) {
    return;
  }
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    state.m2ListFilters = {
      query: String(formData.get("query") || ""),
      rating: String(formData.get("rating") || ""),
      lifecycle: String(formData.get("lifecycle") || ""),
      risk: String(formData.get("risk") || ""),
      readiness: String(formData.get("readiness") || ""),
      resultStatus: String(formData.get("resultStatus") || ""),
      sort: String(formData.get("sort") || "updatedAt.desc"),
      page: String(formData.get("page") || "1"),
      pageSize: String(formData.get("pageSize") || "20")
    };
    renderM2List();
  });
  form.querySelector("[data-m2-reset-list]")?.addEventListener("click", () => {
    state.m2ListFilters = defaultM2ListFilters();
    renderM2List();
  });
}

async function renderM2Detail() {
  setPageState("m2-detail", "loading");
  document.querySelector("#m2DetailContent").innerHTML = '<div class="loading">加载老品评估详情…</div>';
  try {
    const data = await getM2Json(`/api/m2/old-products/evaluations/${encodeURIComponent(state.m2SelectedWorkId)}`);
    setPageState("m2-detail", "success");
    const baseScenario = data.forecast.scenarios.base;
    const optimisticScenario = data.forecast.scenarios.optimistic;
    const pessimisticScenario = data.forecast.scenarios.pessimistic;
    document.querySelector("#m2DetailContent").innerHTML = `
      ${renderM2DatasetPanel(data.dataset)}
      <div class="context-note">
        <a href="#m2-list">Back to evaluation list</a>
        <p>Result status: ${escapeHtml(data.history?.[0]?.resultStatus || data.resultStatus || "current")} / current-historical-invalidated summary.</p>
        <p>Input snapshot is fixture-only and must not be used for formal business decisions.</p>
      </div>
      <div class="cards three">
        <article class="card">
          <h3>核心结论</h3>
          ${renderMetric("rating", data.rating.value)}
          ${renderMetric("lifecycle", data.lifecycle.type)}
          ${renderMetric("historical cumulative sales", data.incomeSummary.historicalTotal)}
          ${renderMetric("remaining copyright-period forecast", baseScenario.forecastTotal)}
          ${renderMetric("remaining copyright months", baseScenario.remainingMonths)}
          ${renderMetric("primary suggestion", data.suggestions[0]?.suggestionCode || "未提供")}
        </article>
        <article class="card">
          <h3>作品身份</h3>
          ${renderMetric("standardWorkId", data.work.standardWorkId)}
          ${renderMetric("workName", data.work.workName)}
          ${renderMetric("authorName", data.work.authorName)}
          ${renderMetric("business forms", data.work.businessForms.join(", "))}
          ${renderMetric("classification", data.work.classificationPath.join(" / "))}
        </article>
        <article class="card">
          <h3>readiness</h3>
          ${renderMetric("status", data.readiness.status)}
          ${renderMetric("gap count", data.readiness.gaps.length)}
          ${renderMetric("algorithm version", data.algorithmVersion.versionKey)}
          ${renderMetric("backtest batch", data.backtestSummary.latestBatchId)}
        </article>
      </div>
      <div class="cards three">
        <article class="card">
          <h3>income summary</h3>
          ${renderMetric("last12MonthSales", data.incomeSummary.last12MonthSales)}
          ${renderMetric("last24MonthSales", data.incomeSummary.last24MonthSales)}
          ${renderMetric("firstPositiveMonth", data.incomeSummary.firstPositiveMonth)}
          ${renderMetric("latestIncomeMonth", data.incomeSummary.latestIncomeMonth)}
        </article>
        <article class="card">
          <h3>forecast scenarios</h3>
          ${renderMetric("base", baseScenario.forecastTotal)}
          ${renderMetric("optimistic", optimisticScenario.forecastTotal)}
          ${renderMetric("pessimistic", pessimisticScenario.forecastTotal)}
          ${renderMetric("scenario structure", "base / optimistic / pessimistic")}
        </article>
        <article class="card">
          <h3>lifecycle rationale</h3>
          <p>${escapeHtml(data.lifecycle.rationale)}</p>
          <p class="pagination-note">rating rationale: ${escapeHtml(data.rating.basis)}</p>
        </article>
      </div>
      <div class="cards three">
        <article class="card">
          <h3>risks</h3>
          <ul class="explain-list">
            ${data.risks.map((risk) => `<li>${escapeHtml(risk.riskCode)} · ${escapeHtml(risk.severity)} · ${escapeHtml(risk.mitigation)}</li>`).join("")}
          </ul>
        </article>
        <article class="card">
          <h3>suggestions</h3>
          <ul class="explain-list">
            ${data.suggestions.map((item) => `<li>${escapeHtml(item.suggestionCode)} · ${escapeHtml(item.title)}</li>`).join("")}
          </ul>
        </article>
        <article class="card">
          <h3>input snapshot</h3>
          ${renderMetric("source", data.inputSnapshot.source)}
          ${renderMetric("fixture-only", "true")}
          ${renderMetric("mappingVersion", data.inputSnapshot.mappingVersion)}
          ${renderMetric("basicInfoVersion", data.inputSnapshot.basicInfoVersion)}
          ${renderMetric("excludedMonths", data.inputSnapshot.excludedMonths.join(", "))}
        </article>
      </div>
    `;
  } catch (error) {
    setM2ErrorPageState("m2-detail", error);
    document.querySelector("#m2DetailContent").innerHTML = renderM2Error(error, {
      title: error.statusCode === 404 ? "老品评估详情未找到" : undefined
    });
  }
}

async function renderM2Gaps() {
  setPageState("m2-gaps", "loading");
  document.querySelector("#m2GapsContent").innerHTML = '<div class="loading">加载老品数据缺口…</div>';
  const query = buildQuery(state.m2GapFilters);
  try {
    const data = await getM2Json(`/api/m2/old-products/readiness-gaps?${query}`);
    if (!data.items.length) {
      setPageState("m2-gaps", "empty");
      document.querySelector("#m2GapsContent").innerHTML = `
        ${renderM2DatasetPanel(data.dataset)}
        ${renderM2GapsFilters()}
        ${renderM2CurrentFilterSummary(state.m2GapFilters)}
        ${renderEmpty("暂无 readiness gaps", "请求成功但当前没有缺口记录。", [
          "这只表示 fixture 当前筛选结果为空。",
          "页面不会创建任何补全任务。"
        ])}
      `;
      attachM2GapsFilterHandlers();
      return;
    }
    setPageState("m2-gaps", "success");
    document.querySelector("#m2GapsContent").innerHTML = `
      ${renderM2DatasetPanel(data.dataset)}
      ${renderM2GapsFilters()}
      ${renderM2CurrentFilterSummary(state.m2GapFilters)}
      <div class="context-note">
        <strong>Formal blocking reasons</strong>
        <p>Rows with readiness=blocked indicate fixture examples that would block formal old-product evaluation until the listed gap is resolved outside this page.</p>
      </div>
      <div class="table-wrap">
        ${renderTableHint()}
        <table>
          <thead>
            <tr>
              <th>standard work ID</th>
              <th>work name</th>
              <th>missing income</th>
              <th>mapping status</th>
              <th>missing name</th>
              <th>missing author</th>
              <th>missing classification</th>
              <th>missing tags</th>
              <th>missing copyright start</th>
              <th>missing copyright end</th>
              <th>unresolved data issue</th>
              <th>suggested owner/action</th>
              <th>gap code</th>
              <th>severity</th>
              <th>readiness</th>
              <th>blocks formal evaluation</th>
            </tr>
          </thead>
          <tbody>
            ${data.items.map((item) => `
              <tr>
                <td>${escapeHtml(item.standardWorkId)}</td>
                <td>${escapeHtml(item.workName)}</td>
                <td>${item.gapCode === "missing_income_fact" ? "yes" : "no"}</td>
                <td>${item.gapCode === "mapping_not_active" ? "blocked" : "fixture-only"}</td>
                <td>${item.gapCode === "missing_standard_work_name" ? "yes" : "no"}</td>
                <td>${item.gapCode === "missing_author" ? "yes" : "no"}</td>
                <td>${item.gapCode === "missing_classification" ? "yes" : "no"}</td>
                <td>${item.gapCode === "missing_required_tags" ? "yes" : "no"}</td>
                <td>${item.gapCode === "missing_copyright_start" ? "yes" : "no"}</td>
                <td>${item.gapCode === "missing_copyright_end" ? "yes" : "no"}</td>
                <td>${item.gapCode === "unresolved_data_issue" ? "yes" : "no"}</td>
                <td>${escapeHtml(item.suggestedOwnerAction || item.message)}</td>
                <td>${escapeHtml(item.gapCode)}</td>
                <td>${escapeHtml(item.severity)}</td>
                <td>${escapeHtml(item.readiness)}</td>
                <td>${escapeHtml(item.blocksFormalEvaluation)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        ${renderPagination(data.pagination)}
      </div>
    `;
    attachM2GapsFilterHandlers();
  } catch (error) {
    setM2ErrorPageState("m2-gaps", error);
    document.querySelector("#m2GapsContent").innerHTML = renderM2Error(error);
  }
}

function renderM2GapsFilters() {
  const filters = state.m2GapFilters;
  return `
    <form class="filter-panel" id="m2GapsFilters">
      <label>Gap code
        <select name="gapCode">
          ${option("", "All", filters.gapCode)}
          ${["missing_income_fact", "mapping_not_active", "missing_standard_work_name", "missing_author", "missing_classification", "missing_required_tags", "missing_copyright_start", "missing_copyright_end", "copyright_expired", "pending_tag_configuration", "unresolved_data_issue", "incomplete_month_only"].map((value) => option(value, value, filters.gapCode)).join("")}
        </select>
      </label>
      <label>Severity
        <select name="severity">
          ${option("", "All", filters.severity)}
          ${["high", "medium", "low"].map((value) => option(value, value, filters.severity)).join("")}
        </select>
      </label>
      <label>Readiness
        <select name="readiness">
          ${option("", "All", filters.readiness)}
          ${["ready", "blocked"].map((value) => option(value, value, filters.readiness)).join("")}
        </select>
      </label>
      <label>Page
        <input name="page" inputmode="numeric" value="${escapeAttribute(filters.page)}">
      </label>
      <label>Page size
        <input name="pageSize" inputmode="numeric" value="${escapeAttribute(filters.pageSize)}">
      </label>
      <button type="submit" class="secondary">Filter gaps</button>
      <button type="button" class="secondary" data-m2-reset-gaps>Reset gap filters</button>
    </form>
  `;
}

function attachM2GapsFilterHandlers() {
  const form = document.querySelector("#m2GapsFilters");
  if (!form) {
    return;
  }
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    state.m2GapFilters = {
      gapCode: String(formData.get("gapCode") || ""),
      severity: String(formData.get("severity") || ""),
      readiness: String(formData.get("readiness") || ""),
      page: String(formData.get("page") || "1"),
      pageSize: String(formData.get("pageSize") || "100")
    };
    renderM2Gaps();
  });
  form.querySelector("[data-m2-reset-gaps]")?.addEventListener("click", () => {
    state.m2GapFilters = defaultM2GapFilters();
    renderM2Gaps();
  });
}

async function renderM2Backtests() {
  setPageState("m2-backtests", "loading");
  document.querySelector("#m2BacktestsContent").innerHTML = '<div class="loading">加载回测与算法版本…</div>';
  try {
    const [algorithms, backtests] = await Promise.all([
      getM2Json("/api/m2/old-products/algorithm-versions"),
      getM2Json("/api/m2/old-products/backtests?page=1&pageSize=20")
    ]);
    const selectedBatch = state.m2SelectedBacktestId || backtests.items[0]?.id;
    state.m2SelectedBacktestId = selectedBatch || "";
    const detail = selectedBatch
      ? await getM2Json(`/api/m2/old-products/backtests/${encodeURIComponent(selectedBatch)}`)
      : null;

    if (!algorithms.items.length && !backtests.items.length) {
      setPageState("m2-backtests", "empty");
      document.querySelector("#m2BacktestsContent").innerHTML = `
        ${renderM2DatasetPanel(algorithms.dataset)}
        ${renderEmpty("暂无算法版本或回测批次", "请求成功但 fixture 当前没有回测数据。")}
      `;
      return;
    }

    setPageState("m2-backtests", "success");
    document.querySelector("#m2BacktestsContent").innerHTML = `
      ${renderM2DatasetPanel(algorithms.dataset)}
      <div class="context-note">
        <strong>Formal backtest blocked</strong>
        <p>Formal backtesting remains blocked until M1 formal data readiness is complete. This page shows fixture-only synthetic examples.</p>
      </div>
      <div class="cards three">
        ${algorithms.items.map((item) => `
          <article class="card">
            <h3>${escapeHtml(item.versionKey)}</h3>
            ${renderMetric("status", item.status)}
            ${renderMetric("fixtureOnly", item.fixtureOnly)}
            ${renderMetric("usesAiModel", item.usesAiModel)}
            <p class="pagination-note">${escapeHtml(item.description)}</p>
          </article>
        `).join("")}
      </div>
      ${renderM2BacktestSelector(backtests.items)}
      <div class="table-wrap">
        ${renderTableHint()}
        <table>
          <thead>
            <tr>
              <th>backtest batch</th>
              <th>cutoff month</th>
              <th>horizon months</th>
              <th>work count</th>
              <th>absolute error</th>
              <th>percentage error</th>
              <th>interval coverage</th>
              <th>bias</th>
              <th>status</th>
            </tr>
          </thead>
          <tbody>
            ${backtests.items.map((item) => `
              <tr>
                <td>${escapeHtml(item.id)}</td>
                <td>${escapeHtml(item.cutoffMonth)}</td>
                <td>${escapeHtml(item.horizonMonths)}</td>
                <td>${escapeHtml(item.metrics.totalRows)}</td>
                <td>${escapeHtml(item.metrics.meanAbsoluteError)}</td>
                <td>fixture metric</td>
                <td>${escapeHtml(item.metrics.covered)} / ${escapeHtml(item.metrics.totalRows)}</td>
                <td>covered=${escapeHtml(item.metrics.covered)}, missed=${escapeHtml(item.metrics.missed)}, over=${escapeHtml(item.metrics.over)}, under=${escapeHtml(item.metrics.under)}</td>
                <td>${escapeHtml(item.status)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        ${renderPagination(backtests.pagination)}
      </div>
      ${detail ? `
        <div class="table-wrap" id="m2BacktestDetail">
          ${renderTableHint()}
          <table>
            <thead>
              <tr>
                <th>standard work ID</th>
                <th>outcome</th>
                <th>base</th>
                <th>optimistic</th>
                <th>pessimistic</th>
                <th>actual</th>
                <th>absolute error</th>
              </tr>
            </thead>
            <tbody>
              ${detail.items.map((item) => `
                <tr>
                  <td>${escapeHtml(item.standardWorkId)}</td>
                  <td>${escapeHtml(item.outcome)}</td>
                  <td>${escapeHtml(item.predictedTotalBase)}</td>
                  <td>${escapeHtml(item.predictedTotalOptimistic)}</td>
                  <td>${escapeHtml(item.predictedTotalPessimistic)}</td>
                  <td>${escapeHtml(item.actualTotal)}</td>
                  <td>${escapeHtml(item.absoluteError)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      ` : ""}
    `;
    attachM2BacktestHandlers();
  } catch (error) {
    setM2ErrorPageState("m2-backtests", error);
    document.querySelector("#m2BacktestsContent").innerHTML = renderM2Error(error);
  }
}

function renderM2BacktestSelector(items) {
  return `
    <form class="filter-panel" id="m2BacktestSelector">
      <label>Backtest batch
        <select name="backtestBatchId">
          ${items.map((item) => option(item.id, item.id, state.m2SelectedBacktestId)).join("")}
        </select>
      </label>
      <button type="submit" class="secondary">Show batch detail</button>
    </form>
  `;
}

function attachM2BacktestHandlers() {
  const form = document.querySelector("#m2BacktestSelector");
  if (!form) {
    return;
  }
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    state.m2SelectedBacktestId = String(formData.get("backtestBatchId") || "");
    renderM2Backtests();
  });
}

function showPage(page) {
  const parsed = parsePageHash(page);
  state.activePage = PAGE_KEYS.includes(parsed.page) ? parsed.page : "system";
  if (parsed.page === "m2-detail" && parsed.id) {
    state.m2SelectedWorkId = parsed.id;
  }
  for (const key of PAGE_KEYS) {
    document.querySelector(`#page-${key}`).classList.toggle("is-hidden", key !== state.activePage);
    document.querySelector(`[data-nav="${key}"]`).classList.toggle("is-active", key === state.activePage);
  }
  renderCurrentPage();
}

function parsePageHash(page) {
  const [pageKey, rawId] = String(page || "").split(":");
  return {
    page: pageKey || "system",
    id: rawId ? decodeURIComponent(rawId) : ""
  };
}

function renderCurrentPage() {
  if (state.activePage === "system") {
    return renderSystem();
  }
  if (state.activePage === "works") {
    return renderWorks();
  }
  if (state.activePage === "mapping") {
    return renderMapping();
  }
  if (state.activePage === "jobs") {
    return renderJobs();
  }
  if (state.activePage === "m2-overview") {
    return renderM2Overview();
  }
  if (state.activePage === "m2-list") {
    return renderM2List();
  }
  if (state.activePage === "m2-detail") {
    return renderM2Detail();
  }
  if (state.activePage === "m2-gaps") {
    return renderM2Gaps();
  }
  if (state.activePage === "m2-backtests") {
    return renderM2Backtests();
  }
  return renderSystem();
}

function init() {
  document.querySelector("#fixtureToggle").checked = state.fixtureMode;
  document.querySelector("#fixtureToggle").addEventListener("change", (event) => {
    state.fixtureMode = event.target.checked;
    setNotice(
      state.fixtureMode ? "当前使用前端合成 fixture，不读取真实数据。" : "",
      "info"
    );
    renderCurrentPage();
  });
  document.querySelector("#refreshButton").addEventListener("click", () => {
    renderCurrentPage();
  });
  window.addEventListener("hashchange", () => showPage(location.hash.replace("#", "")));
  showPage(location.hash.replace("#", "") || "system");
}

init();
