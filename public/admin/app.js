const PAGE_KEYS = ["system", "works", "mapping", "jobs"];
const state = {
  activePage: "system",
  fixtureMode: new URLSearchParams(window.location.search).get("fixture") === "1"
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

function setPageState(page, value) {
  const pill = document.querySelector(`[data-state-for="${page}"]`);
  if (!pill) {
    return;
  }
  pill.dataset.state = value;
  pill.textContent = value;
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

function renderMetric(label, value) {
  return `
    <div class="metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function renderError(error) {
  const payload = error.payload || {};
  const apiError = payload.error;
  const reason = apiError?.code || payload.database?.reason || "request_failed";
  const message = apiError?.message || error.message || "请求失败";
  const requestId = apiError?.requestId;
  return `
    <div class="error-state">
      <h3>请求失败</h3>
      <p>${escapeHtml(message)}</p>
      <code>${escapeHtml(reason)}</code>
      ${requestId ? `<p class="pagination-note">requestId: ${escapeHtml(requestId)}</p>` : ""}
    </div>
  `;
}

function renderEmpty(title, description) {
  return `
    <div class="empty-state">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(description)}</p>
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
  return `<span class="badge ${tone}">${escapeHtml(value)}</span>`;
}

function renderPagination(pagination) {
  return `
    <p class="pagination-note">
      page=${escapeHtml(pagination.page)} · pageSize=${escapeHtml(pagination.pageSize)} · total=${escapeHtml(pagination.total)}
    </p>
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
    document.querySelector("#serviceCard").innerHTML = renderError(healthResult.error);
  } else {
    document.querySelector("#serviceCard").innerHTML = `
      <h3>服务</h3>
      ${renderMetric("service", healthResult.service)}
      ${renderMetric("environment", healthResult.environment)}
      ${renderMetric("status", healthResult.status)}
    `;
  }

  const db = dbHealth.database || {};
  document.querySelector("#databaseCard").innerHTML = `
    <h3>数据库</h3>
    ${renderMetric("connected", db.connected === true ? "true" : "false")}
    ${renderMetric("schemaVersion", db.schemaVersion || "未配置")}
    ${renderMetric("systemState", db.systemState || "未配置")}
    ${renderMetric("reason", db.reason || "无")}
  `;

  if (systemResult.error) {
    document.querySelector("#lifecycleCard").innerHTML = renderError(systemResult.error);
  } else {
    const system = systemResult.system;
    document.querySelector("#lifecycleCard").innerHTML = `
      <h3>M1 生命周期</h3>
      ${renderMetric("state", system.state)}
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
        ? "数据库依赖降级；空库或未配置数据库是当前开发阶段的可预期状态。"
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
        "空库状态正常；未导入真实账单或运营确认结果。"
      );
      return;
    }

    setPageState("works", "success");
    const first = await getJson(`/api/works/${encodeURIComponent(data.items[0].id)}`, {
      item: data.items[0]
    }).catch(() => ({ item: null }));
    document.querySelector("#worksContent").innerHTML = `
      <div class="table-wrap">
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
        "空库无 mapping version 是正常状态；页面不提供激活或导入操作。"
      );
      return;
    }

    setPageState("mapping", "success");
    const first = await getJson(`/api/mapping-versions/${encodeURIComponent(data.items[0].id)}`, {
      item: data.items[0]
    }).catch(() => ({ item: null }));
    document.querySelector("#mappingContent").innerHTML = `
      <div class="table-wrap">
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
          ${renderMetric("status", first.item.status)}
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
        "空库无任务是正常状态；页面不提供启动、重试或取消操作。"
      );
      return;
    }

    setPageState("jobs", "success");
    const first = await getJson(`/api/jobs/${encodeURIComponent(data.items[0].id)}`, {
      item: data.items[0]
    }).catch(() => ({ item: null }));
    document.querySelector("#jobsContent").innerHTML = `
      <div class="table-wrap">
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
          ${renderMetric("status", first.item.status)}
          ${renderMetric("errorSummary", "当前 API 未返回")}
        ` : "<p>未找到详情。</p>"}
      </div>
    `;
  } catch (error) {
    setPageState("jobs", error.statusCode === 404 ? "not found" : "error");
    document.querySelector("#jobsContent").innerHTML = renderError(error);
  }
}

function showPage(page) {
  state.activePage = PAGE_KEYS.includes(page) ? page : "system";
  for (const key of PAGE_KEYS) {
    document.querySelector(`#page-${key}`).classList.toggle("is-hidden", key !== state.activePage);
    document.querySelector(`[data-nav="${key}"]`).classList.toggle("is-active", key === state.activePage);
  }
  renderCurrentPage();
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
  return renderJobs();
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
