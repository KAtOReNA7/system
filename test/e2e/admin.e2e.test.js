import assert from "node:assert/strict";
import http from "node:http";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
import { createApp } from "../../src/http/app.js";

const FORBIDDEN_WRITE_CONTROL_WORDS = [
  "导入",
  "激活",
  "撤销",
  "重试",
  "取消",
  "上传",
  "应用",
  "迁移",
  "写入",
  "提交",
  "导出",
  "创建评估",
  "formal evaluation"
];

const SENSITIVE_OUTPUT_PATTERNS = [
  /postgres(?:ql)?:\/\//i,
  /password/i,
  /passwd/i,
  /jdbc:/i,
  /SELECT\s+/i,
  /INSERT\s+/i,
  /UPDATE\s+/i,
  /DELETE\s+/i,
  /at\s+.+\(.+:\d+:\d+\)/,
  /background_worker database connection is not configured/i,
  /D:\\/i
];

const baseConfig = {
  service: "m1-audiobook-evaluation",
  appEnv: "test",
  port: 0,
  database: {
    rwUrl: undefined,
    readonlyUrl: undefined,
    backgroundUrl: undefined
  }
};

let browser;
let server;
let baseUrl;

async function listen(serverToStart) {
  await new Promise((resolve) => serverToStart.listen(0, "127.0.0.1", resolve));
  const address = serverToStart.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
}

async function closeServer(serverToClose) {
  await new Promise((resolve, reject) => {
    serverToClose.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function readVisibleText(page) {
  return page.locator("body").innerText();
}

async function assertNoForbiddenWriteControls(page) {
  const controls = await page.locator("button, a, label").evaluateAll((elements) =>
    elements.map((element) => element.textContent?.trim() ?? "").filter(Boolean)
  );
  const forbidden = controls.filter((text) =>
    FORBIDDEN_WRITE_CONTROL_WORDS.some((word) => text.includes(word))
  );
  assert.deepEqual(forbidden, [], `Unexpected write-like controls: ${forbidden.join(", ")}`);
}

function assertNoSensitiveOutput(text) {
  for (const pattern of SENSITIVE_OUTPUT_PATTERNS) {
    assert.doesNotMatch(text, pattern);
  }
}

async function openPage(path, options = {}) {
  const context = await browser.newContext({
    viewport: options.viewport ?? { width: 1280, height: 720 }
  });
  const page = await context.newPage();
  const requestedUrls = [];
  if (options.captureRequests) {
    page.on("request", (request) => requestedUrls.push(request.url()));
  }
  for (const routeConfig of options.routes ?? []) {
    await page.route(routeConfig.url, routeConfig.handler);
  }
  await page.goto(`${baseUrl}${path}`, { waitUntil: "load" });
  return { context, page, requestedUrls };
}

before(async () => {
  server = http.createServer(createApp(baseConfig));
  await listen(server);
  browser = await chromium.launch();
});

after(async () => {
  if (browser) {
    await browser.close();
  }
  if (server?.listening) {
    await closeServer(server);
  }
});

test("admin default no-database page renders degraded state without leaking sensitive details", async () => {
  const { context, page } = await openPage("/admin");
  try {
    await page.getByText("降级 / degraded").waitFor();
    const text = await readVisibleText(page);

    assert.match(text, /数据库未配置/);
    assert.match(text, /生命周期状态/);
    assert.match(text, /暂不可读取/);
    assert.match(text, /database_not_configured/);
    assert.match(text, /不等同于空库/);
    assertNoSensitiveOutput(text);
    await assertNoForbiddenWriteControls(page);
  } finally {
    await context.close();
  }
});

test("admin fixture mode renders all read-only pages in success state", async () => {
  const cases = [
    {
      path: "/admin?fixture=1#system",
      awaitText: "结构已初始化",
      expected: ["正常 / success", "结构已初始化", "schema_initialized"]
    },
    {
      path: "/admin?fixture=1#works",
      awaitText: "SYN-WORK-001",
      expected: ["正常 / success", "SYN-WORK-001", "未提供表示当前 API 尚未返回标准作品名称"]
    },
    {
      path: "/admin?fixture=1#mapping",
      awaitText: "构建中",
      expected: ["正常 / success", "构建中", "building"]
    },
    {
      path: "/admin?fixture=1#jobs",
      awaitText: "等待中",
      expected: ["正常 / success", "等待中", "pending"]
    }
  ];

  for (const testCase of cases) {
    const { context, page } = await openPage(testCase.path);
    try {
      await page.getByText("正常 / success").waitFor();
      await page.waitForFunction(
        (needle) => document.body.innerText.includes(needle),
        testCase.awaitText
      );
      const text = await readVisibleText(page);
      for (const expected of [...testCase.expected, ...(testCase.extraExpected || [])]) {
        assert.match(text, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      }
      assertNoSensitiveOutput(text);
      await assertNoForbiddenWriteControls(page);
    } finally {
      await context.close();
    }
  }
});

test("admin mobile fixture tables avoid page overflow and expose horizontal scroll hints", async () => {
  const tablePages = ["works", "mapping", "jobs"];

  for (const pageName of tablePages) {
    const { context, page } = await openPage(`/admin?fixture=1#${pageName}`, {
      viewport: { width: 390, height: 780 }
    });
    try {
      await page.getByText("小屏幕下可横向滚动查看完整列").waitFor();
      const metrics = await page.evaluate(() => {
        const activePage = document.querySelector("[data-page]:not(.is-hidden)");
        const tableWrap = activePage?.querySelector(".table-wrap");
        return {
          pageScrollWidth: document.documentElement.scrollWidth,
          pageClientWidth: document.documentElement.clientWidth,
          tableClientWidth: tableWrap?.clientWidth ?? 0,
          tableScrollWidth: tableWrap?.scrollWidth ?? 0,
          tableOverflowX: tableWrap ? getComputedStyle(tableWrap).overflowX : ""
        };
      });

      assert.ok(
        metrics.pageScrollWidth <= metrics.pageClientWidth,
        `${pageName} should not cause page-level horizontal overflow`
      );
      assert.ok(
        metrics.tableScrollWidth > metrics.tableClientWidth,
        `${pageName} table should be horizontally scrollable inside its container`
      );
      assert.equal(metrics.tableOverflowX, "auto");
      await assertNoForbiddenWriteControls(page);
    } finally {
      await context.close();
    }
  }
});

test("M2 old-product fixture admin pages render from M2 APIs", async () => {
  const cases = [
    {
      path: "/admin#m2-overview",
      awaitText: "eligible old products",
      expected: ["老品评估总览", "fixture-only", "synthetic marker", "dataset.mode", "2026-04", "2026-05 excluded", "Formal old-product evaluation is blocked"],
      endpoint: "/api/m2/old-products/evaluations/overview"
    },
    {
      path: "/admin#m2-list",
      awaitText: "SYN-WORK-0001",
      expected: ["老品评估列表", "SYN-WORK-0001", "FORECAST TOTAL", "READINESS", "fixture-only"],
      endpoint: "/api/m2/old-products/evaluations",
      extraExpected: ["rating score", "lifecycle confidence"]
    },
    {
      path: "/admin#m2-detail:SYN-WORK-0001",
      awaitText: "remaining copyright-period forecast",
      expected: ["老品评估详情", "SYN-WORK-0001", "forecast scenarios", "input snapshot", "algorithm version"],
      endpoint: "/api/m2/old-products/evaluations/SYN-WORK-0001",
      extraExpected: [
        "lifecycle confidence",
        "rating score",
        "rating rationale",
        "incompleteMonthExcluded",
        "warnings",
        "oldProductEvaluationResult",
        "syntheticOnly",
        "notForFormalDecision"
      ]
    },
    {
      path: "/admin#m2-gaps",
      awaitText: "missing classification",
      expected: ["老品数据缺口", "missing classification", "missing copyright end", "SUGGESTED OWNER/ACTION"],
      endpoint: "/api/m2/old-products/readiness-gaps"
    },
    {
      path: "/admin#m2-backtests",
      awaitText: "fixture-old-product-v1",
      expected: ["回测与算法版本", "fixture-old-product-v1", "SYN-BACKTEST-0001", "covered", "missed", "over", "under"],
      endpoint: "/api/m2/old-products/backtests",
      extraExpected: ["Synthetic backtest shape", "no real backtest executed"]
    },
    {
      path: "/admin#m2-reviews",
      awaitText: "SYN-FR-REVIEW-001",
      expected: ["Blocking manual review queue", "fixture-only", "synthetic review queue", "databaseWritten=false", "SYN-FR-REVIEW-001", "Simulate approve", "Advisory review summary", "does not block formal eligibility", "downlist_requires_manual_confirmation"],
      endpoint: "/api/m2/formal-readiness/reviews",
      extraExpected: ["formalEvaluationAllowed=false", "notForFormalDecision=true"]
    }
  ];

  for (const testCase of cases) {
    const { context, page, requestedUrls } = await openPage(testCase.path, {
      captureRequests: true
    });
    try {
      await page.waitForFunction(
        (needle) => document.body.innerText.includes(needle),
        testCase.awaitText
      );
      const text = await readVisibleText(page);
      for (const expected of testCase.expected) {
        assert.match(text, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      }
      assert.ok(
        requestedUrls.some((url) => url.includes(testCase.endpoint)),
        `${testCase.path} should request ${testCase.endpoint}`
      );
      assertNoSensitiveOutput(text);
      await assertNoForbiddenWriteControls(page);
    } finally {
      await context.close();
    }
  }
});

test("M2 old-product admin renders blocked empty error and not-found states safely", async () => {
  const blocked = await openPage("/admin#m2-overview", {
    routes: [
      {
        url: "**/api/m2/old-products/evaluations/overview",
        handler: (route) =>
          route.fulfill({
            status: 423,
            contentType: "application/json",
            body: JSON.stringify({
              error: {
                code: "formal_data_blocked",
                message: "Formal M2 old-product evaluation is blocked until M1 formal data readiness is complete.",
                requestId: "SYN-REQUEST-BLOCKED"
              }
            })
          })
      }
    ]
  });
  try {
    await blocked.page.getByText("已阻断 / blocked").waitFor();
    const text = await readVisibleText(blocked.page);
    assert.match(text, /formal_data_blocked/);
    assert.match(text, /SYN-REQUEST-BLOCKED/);
    assertNoSensitiveOutput(text);
    await assertNoForbiddenWriteControls(blocked.page);
  } finally {
    await blocked.context.close();
  }

  const empty = await openPage("/admin#m2-list", {
    routes: [
      {
        url: "**/api/m2/old-products/evaluations?*",
        handler: (route) =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              dataset: {
                mode: "fixture",
                source: "m2-b-static-synthetic-fixture",
                formalDataAuthorized: false,
                formalEvaluationAllowed: false,
                syntheticValue: true,
                cutoffMonth: "2026-04",
                incompleteMonths: ["2026-05"]
              },
              items: [],
              pagination: { page: 1, pageSize: 20, total: 0 }
            })
          })
      }
    ]
  });
  try {
    await empty.page.getByText("空状态 / empty").waitFor();
    const text = await readVisibleText(empty.page);
    assert.match(text, /暂无符合条件的老品评估/);
    assertNoSensitiveOutput(text);
  } finally {
    await empty.context.close();
  }

  const error = await openPage("/admin#m2-backtests", {
    routes: [
      {
        url: "**/api/m2/old-products/backtests*",
        handler: (route) =>
          route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({
              error: {
                code: "internal_error",
                message: "Internal server error",
                requestId: "SYN-REQUEST-ERROR"
              }
            })
          })
      }
    ]
  });
  try {
    await error.page.getByText("错误 / error").waitFor();
    const text = await readVisibleText(error.page);
    assert.match(text, /internal_error/);
    assert.match(text, /SYN-REQUEST-ERROR/);
    assertNoSensitiveOutput(text);
  } finally {
    await error.context.close();
  }

  const notFound = await openPage("/admin#m2-detail:SYN-WORK-9999");
  try {
    await notFound.page.getByText("未找到 / not found").waitFor();
    const text = await readVisibleText(notFound.page);
    assert.match(text, /老品评估详情未找到/);
    assert.match(text, /not_found/);
    assertNoSensitiveOutput(text);
  } finally {
    await notFound.context.close();
  }
});

test("M2 old-product mobile tables remain contained and scrollable", async () => {
  const tablePages = ["m2-list", "m2-gaps", "m2-backtests"];

  for (const pageName of tablePages) {
    const { context, page } = await openPage(`/admin#${pageName}`, {
      viewport: { width: 390, height: 780 }
    });
    try {
      await page.getByText("小屏幕下可横向滚动查看完整列").first().waitFor();
      const metrics = await page.evaluate(() => {
        const activePage = document.querySelector("[data-page]:not(.is-hidden)");
        const tableWrap = activePage?.querySelector(".table-wrap");
        return {
          pageScrollWidth: document.documentElement.scrollWidth,
          pageClientWidth: document.documentElement.clientWidth,
          tableClientWidth: tableWrap?.clientWidth ?? 0,
          tableScrollWidth: tableWrap?.scrollWidth ?? 0,
          tableOverflowX: tableWrap ? getComputedStyle(tableWrap).overflowX : ""
        };
      });

      assert.ok(
        metrics.pageScrollWidth <= metrics.pageClientWidth,
        `${pageName} should not cause page-level horizontal overflow`
      );
      assert.ok(
        metrics.tableScrollWidth >= metrics.tableClientWidth,
        `${pageName} table should remain contained inside its scroll container`
      );
      assert.equal(metrics.tableOverflowX, "auto");
      const text = await readVisibleText(page);
      assertNoSensitiveOutput(text);
      await assertNoForbiddenWriteControls(page);
    } finally {
      await context.close();
    }
  }
});

test("M2 old-product overview distribution links navigate to filtered list", async () => {
  const { context, page, requestedUrls } = await openPage("/admin#m2-overview", {
    captureRequests: true
  });
  try {
    await page.locator('[data-m2-filter-key="rating"][data-m2-filter-value="S+"]').click();
    await page.waitForFunction(() => location.hash === "#m2-list");
    await page.getByText("Current filters").waitFor();
    const text = await readVisibleText(page);
    assert.match(text, /rating=S\+/);
    assert.match(text, /SYN-WORK-0001/);
    assert.ok(
      requestedUrls.some((url) => url.includes("/api/m2/old-products/evaluations?") && url.includes("rating=S%2B")),
      "filtered list should be fetched from M2 API with rating query"
    );
    assertNoSensitiveOutput(text);
    await assertNoForbiddenWriteControls(page);
  } finally {
    await context.close();
  }
});

test("M2 blocking review fixture page simulates action without persistence", async () => {
  const { context, page, requestedUrls } = await openPage("/admin#m2-reviews", {
    captureRequests: true
  });
  try {
    await page.getByText("SYN-FR-REVIEW-001").first().waitFor();
    await page.getByText("Simulate approve").click();
    await page.getByText("Fixture action result").waitFor();
    const text = await readVisibleText(page);

    assert.match(text, /databaseWritten=false/);
    assert.match(text, /formalEvaluationAllowed=false/);
    assert.match(text, /notForFormalDecision=true/);
    assert.match(text, /pending/);
    assert.match(text, /approved/);
    assert.ok(
      requestedUrls.some((url) => url.includes("/api/m2/formal-readiness/reviews/SYN-FR-REVIEW-001/actions")),
      "fixture action endpoint should be called"
    );
    assertNoSensitiveOutput(text);
    await assertNoForbiddenWriteControls(page);
  } finally {
    await context.close();
  }
});

test("M2 fixture evaluation task page creates blocked task and simulates retry without persistence", async () => {
  const { context, page, requestedUrls } = await openPage("/admin#m2-fixture-tasks", {
    captureRequests: true
  });
  try {
    await page.getByText("SYN-FR-TASK-001").first().waitFor();
    let text = await readVisibleText(page);
    assert.match(text, /Evaluation task fixture queue/);
    assert.match(text, /Advisory review summary/);
    assert.match(text, /readiness advisory reasons/);
    assert.match(text, /formalEvaluationExecuted=false/);
    assert.match(text, /databaseWritten=false/);
    assert.match(text, /mappingVersionActivated=false/);
    assert.match(text, /switchMappingVersionCalled=false/);

    await page.locator('#m2TaskCreateForm select[name="caseId"]').selectOption("blocked_review_pending");
    await page.getByText("Simulate create task").click();
    await page.getByText("Fixture task result").waitFor();
    text = await readVisibleText(page);
    assert.match(text, /SYN-FR-TASK-005/);
    assert.match(text, /blocked/);
    assert.match(text, /databaseWritten=false/);

    await page.locator('[data-m2-task-id="SYN-FR-TASK-FAILED"]').click();
    await page.getByText("Simulate retry").click();
    await page.locator(".audit-event").getByText("retry_requested").first().waitFor();
    text = await readVisibleText(page);
    assert.match(text, /formalEvaluationExecuted=false/);
    assert.match(text, /databaseWritten=false/);
    assert.ok(
      requestedUrls.some((url) => url.includes(`/api/m2/fixture/${["evaluation", "tasks"].join("-")}`)),
      "fixture task endpoint should be requested"
    );
    assertNoSensitiveOutput(text);
    await assertNoForbiddenWriteControls(page);
  } finally {
    await context.close();
  }
});

test("M2 old-product list filters reset pagination and detail navigation work", async () => {
  const { context, page, requestedUrls } = await openPage("/admin#m2-list", {
    captureRequests: true
  });
  try {
    await page.getByText("SYN-WORK-0001").waitFor();
    await page.locator('#m2ListFilters input[name="query"]').fill("SYN-WORK-0003");
    await page.locator('#m2ListFilters select[name="rating"]').selectOption("A");
    await page.locator('#m2ListFilters select[name="lifecycle"]').selectOption("declining");
    await page.locator('#m2ListFilters select[name="risk"]').selectOption("high");
    await page.locator('#m2ListFilters select[name="readiness"]').selectOption("blocked");
    await page.locator('#m2ListFilters select[name="resultStatus"]').selectOption("current");
    await page.locator("#m2ListFilters").evaluate((form) => form.requestSubmit());

    await page.waitForFunction(() => document.body.innerText.includes("query=SYN-WORK-0003"));
    let text = await readVisibleText(page);
    assert.match(text, /SYN-WORK-0003/);
    assert.match(text, /risk=high/);
    assert.ok(
      requestedUrls.some((url) =>
        url.includes("/api/m2/old-products/evaluations?") &&
        url.includes("query=SYN-WORK-0003") &&
        url.includes("risk=high")
      ),
      "list filters should request M2 API"
    );

    await page.getByText("View detail").first().click();
    await page.waitForFunction(() => location.hash.startsWith("#m2-detail:SYN-WORK-0003"));
    await page.getByText("Back to evaluation list").waitFor();
    text = await readVisibleText(page);
    assert.match(text, /SYN-WORK-0003/);
    assert.match(text, /current-historical-invalidated summary/);

    await page.getByText("Back to evaluation list").click();
    await page.waitForFunction(() => location.hash === "#m2-list");
    await page.getByText("Reset filters").click();
    await page.getByText("default collection").waitFor();
    text = await readVisibleText(page);
    assert.match(text, /SYN-WORK-0001/);
    assertNoSensitiveOutput(text);
    await assertNoForbiddenWriteControls(page);
  } finally {
    await context.close();
  }
});

test("M2 old-product readiness gaps filter through API", async () => {
  const { context, page, requestedUrls } = await openPage("/admin#m2-gaps", {
    captureRequests: true
  });
  try {
    await page.getByText("Formal blocking reasons").waitFor();
    await page.locator('#m2GapsFilters select[name="gapCode"]').selectOption("missing_classification");
    await page.locator('#m2GapsFilters select[name="severity"]').selectOption("high");
    await page.locator('#m2GapsFilters select[name="readiness"]').selectOption("blocked");
    await page.locator("#m2GapsFilters").evaluate((form) => form.requestSubmit());

    await page.waitForFunction(() => document.body.innerText.includes("gapCode=missing_classification"));
    const text = await readVisibleText(page);
    assert.match(text, /SYN-WORK-0003/);
    assert.match(text, /blocks formal evaluation/i);
    assert.ok(
      requestedUrls.some((url) =>
        url.includes("/api/m2/old-products/readiness-gaps?") &&
        url.includes("gapCode=missing_classification") &&
        url.includes("severity=high")
      ),
      "gap filters should request M2 API"
    );
    assertNoSensitiveOutput(text);
    await assertNoForbiddenWriteControls(page);
  } finally {
    await context.close();
  }
});

test("M2 old-product backtest selector renders selected batch detail", async () => {
  const { context, page, requestedUrls } = await openPage("/admin#m2-backtests", {
    captureRequests: true
  });
  try {
    await page.getByText("Formal backtest blocked").waitFor();
    await page.locator("#m2BacktestSelector").evaluate((form) => form.requestSubmit());
    await page.locator("#m2BacktestDetail").waitFor();
    const text = await readVisibleText(page);
    assert.match(text, /fixtureOnly/);
    assert.match(text, /SYN-BACKTEST-0001/);
    assert.match(text, /synthetic backtest shape/i);
    assert.match(text, /no real backtest executed/i);
    assert.match(text, /covered/);
    assert.match(text, /missed/);
    assert.match(text, /over/);
    assert.match(text, /under/);
    assert.ok(
      requestedUrls.some((url) => url.includes("/api/m2/old-products/backtests/SYN-BACKTEST-0001")),
      "backtest detail should be fetched from M2 API"
    );
    assertNoSensitiveOutput(text);
    await assertNoForbiddenWriteControls(page);
  } finally {
    await context.close();
  }
});
