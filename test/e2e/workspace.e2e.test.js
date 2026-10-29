import assert from "node:assert/strict";
import http from "node:http";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
import { createApp } from "../../src/http/app.js";
import { createFixtureApp } from "../../src/http/fixtureApp.js";
import { listenOnFetchSafePort } from "../helpers/listenOnFetchSafePort.js";

const config = {
  service: "m1-audiobook-evaluation", appEnv: "test", port: 0,
  database: { rwUrl: undefined, readonlyUrl: undefined, backgroundUrl: undefined }
};
let browser;
const servers = [];
const origins = {};

before(async () => {
  for (const [mode, app] of [["fixture", createFixtureApp(config)], ["formal", createApp(config)]]) {
    const server = http.createServer(app);
    servers.push(server);
    origins[mode] = `http://127.0.0.1:${await listenOnFetchSafePort(server)}`;
  }
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  for (const server of servers) {
    if (server.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

async function withPage(run, { mode = "fixture", path = "/workspace/#/", width = 1440 } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  const pageErrors = [];
  const externalRequests = [];
  const writes = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  // These public browser tests must not contact a provider, database or remote website.
  await context.route("**/*", route => {
    const request = route.request();
    if (new URL(request.url()).origin !== origins[mode]) {
      externalRequests.push(request.url());
      return route.abort();
    }
    if (!["GET", "HEAD"].includes(request.method())) writes.push(request.method() + " " + request.url());
    return route.continue();
  });
  try {
    const response = await page.goto(origins[mode] + path, { waitUntil: "load" });
    assert.equal(response.status(), 200, "Build the workspace before running its browser tests");
    await page.getByTestId("data-mode").getByText(mode === "fixture" ? "合成演示 v0.2" : "正式数据 · 只读", { exact: true }).waitFor();
    await run(page);
    assert.deepEqual(pageErrors, [], "The page must not crash while navigating");
    assert.deepEqual(externalRequests, [], "Workspace assets and public evidence must stay local");
    assert.deepEqual(writes, [], "The workspace must remain read-only");
  } finally {
    await context.close();
  }
}

async function waitForRows(page, count, firstId) {
  await page.waitForFunction(({ expectedCount, expectedId }) => {
    const rows = [...document.querySelectorAll(".works-table tbody tr")];
    return rows.length === expectedCount && (!expectedId || rows[0]?.textContent.includes(expectedId));
  }, { expectedCount: count, expectedId: firstId });
}

async function expectResearch(page) {
  await page.locator(".metric-card").last().waitFor();
  const cards = await page.locator(".metric-card").allTextContents();
  assert.equal(cards.length, 4);
  const expected = [
    ["03", "27.85%", "−11.97%", "88.39%"],
    ["06", "28.74%", "−9.01%", "87.70%"],
    ["12", "31.64%", "−4.33%", "86.03%"],
    ["36", "36.46%", "−2.86%", "70.36%"]
  ];
  expected.forEach((values, index) => values.forEach(value => assert.ok(cards[index].includes(value), `Horizon card ${index + 1} must show ${value}`)));
  assert.ok(cards.every(text => text.includes("金额覆盖率：未披露")));
  assert.match(cards[0], /偏差超限/);
  assert.match(cards[3], /仅历史证据/);
  const body = await page.locator("body").innerText();
  assert.match(body, /无活动候选/);
  assert.match(body, /自动化未批准/);
  assert.match(body, /未具备生产资格/);
  assert.match(body, /0\.5179%/);
  assert.match(body, /95% 区间跨 0/);
}

test("workspace navigates all four pages and searches, clears and reports empty results", async () => {
  await withPage(async page => {
    await page.locator(".stats-grid").waitFor();
    assert.match(await page.locator(".stats-grid").innerText(), /128/);
    assert.match(await page.locator(".stats-grid").innerText(), /119/);
    await page.getByRole("link", { name: "浏览作品库 ↗", exact: true }).click();
    await waitForRows(page, 6, "DEMO-W001");
    await page.getByRole("searchbox", { name: "搜索作品、作者或标准编号" }).fill("林予");
    await page.getByRole("button", { name: "搜索作品", exact: true }).click();
    await waitForRows(page, 1, "DEMO-W001");
    assert.match(await page.locator(".filter-result").innerText(), /1 部作品/);
    await page.locator(".works-table").getByRole("link", { name: "海边来信", exact: true }).click();
    await page.getByRole("heading", { name: "海边来信", exact: true }).waitFor();
    await page.getByRole("link", { name: "返回作品库", exact: true }).click();
    await waitForRows(page, 1, "DEMO-W001");
    assert.equal(await page.getByRole("searchbox").inputValue(), "林予");
    assert.equal(new URLSearchParams(new URL(page.url()).hash.split("?")[1]).get("search"), "林予");
    await page.getByRole("button", { name: "清除筛选 ×", exact: true }).click();
    await waitForRows(page, 6, "DEMO-W001");
    assert.equal(await page.getByRole("searchbox").inputValue(), "");
    assert.equal(await page.locator(".filter-result").count(), 0);
    await page.getByRole("searchbox").fill("没有这部作品-XYZ-测试");
    await page.getByRole("button", { name: "搜索作品", exact: true }).click();
    await page.getByRole("heading", { name: "没有符合条件的作品", exact: true }).waitFor();
    assert.equal(await page.locator(".works-table tbody tr").count(), 0);
    assert.match(await page.locator(".filter-result").innerText(), /0 部作品/);
    await page.getByRole("navigation", { name: "主导航" }).getByRole("link", { name: /研究结果/ }).click();
    await expectResearch(page);
    await page.getByRole("navigation", { name: "主导航" }).getByRole("link", { name: /工作台/ }).click();
    await page.locator(".stats-grid").waitFor();
    assert.equal(new URL(page.url()).hash, "#/");
  });
});

test("workspace combines filters, paginates and preserves the exact list on detail return", async () => {
  await withPage(async page => {
    await waitForRows(page, 6, "DEMO-W001");
    await page.getByRole("combobox", { name: "业务状态", exact: true }).selectOption("outside_scope");
    await waitForRows(page, 6, "DEMO-W007");
    assert.match(await page.locator(".filter-result").innerText(), /7 部作品/);
    assert.equal(await page.locator(".works-table tbody tr").filter({ hasText: "纯买断 · 不属于预测范围" }).count(), 6);
    await page.getByRole("link", { name: "下一页 ↗", exact: true }).click();
    await waitForRows(page, 1, "DEMO-W114");
    const listUrl = page.url();
    assert.equal(await page.getByRole("link", { name: "第 2 页", exact: true }).getAttribute("aria-current"), "page");
    await page.locator(".works-table tbody tr").getByRole("link").click();
    await page.getByRole("heading", { name: "合成作品 114", exact: true }).waitFor();
    assert.match(await page.locator(".detail-facts").innerText(), /买断/);
    assert.equal(await page.locator(".detail-summary-grid h3").innerText(), "账单来源 / 买断审计资料（合成示例）");
    assert.doesNotMatch(await page.locator(".detail-summary-grid").innerText(), /人工拆分的分成账单/);
    assert.match(await page.locator(".history-section").innerText(), /纯买断不属于分成现金预测范围，历史分成现金保持为空/);
    assert.equal(await page.locator(".detail-summary-grid .number").innerText(), "—");
    assert.equal(await page.locator(".prediction").count(), 4);
    assert.ok((await page.locator(".prediction").allTextContents()).every(text => text.includes("不适用") && !text.includes("¥")));
    await page.getByRole("link", { name: "返回作品库", exact: true }).click();
    await waitForRows(page, 1, "DEMO-W114");
    assert.equal(page.url(), listUrl);
    assert.equal(await page.getByRole("combobox", { name: "业务状态", exact: true }).inputValue(), "outside_scope");
    await page.getByRole("combobox", { name: "作品分类", exact: true }).selectOption("人文社科");
    await waitForRows(page, 3, "DEMO-W007");
    assert.ok((await page.locator(".works-table tbody tr").allTextContents()).every(text => text.includes("人文社科") && text.includes("纯买断")));
    assert.equal(await page.getByRole("link", { name: "第 1 页", exact: true }).getAttribute("aria-current"), "page");
    await page.getByRole("button", { name: "清除筛选 ×", exact: true }).click();
    await waitForRows(page, 6, "DEMO-W001");
    await page.getByRole("combobox", { name: "数据状态", exact: true }).selectOption("needs_review");
    await waitForRows(page, 6, "DEMO-W004");
    assert.match(await page.locator(".filter-result").innerText(), /12 部作品/);
    assert.ok((await page.locator(".works-table tbody tr").allTextContents()).every(text => text.includes("渠道待核对")));
  }, { path: "/workspace/#/works" });
});

test("workspace recovers an out-of-range page without discarding its business filter", async () => {
  await withPage(async page => {
    await page.getByRole("heading", { name: "页码超出当前结果范围", exact: true }).waitFor();
    assert.equal(await page.locator(".works-table").count(), 0);
    assert.equal(await page.getByRole("combobox", { name: "业务状态", exact: true }).inputValue(), "outside_scope");
    assert.match(await page.locator(".state-panel").innerText(), /当前共 2 页，筛选条件已保留/);
    await page.getByRole("link", { name: "返回第一页", exact: true }).click();
    await waitForRows(page, 6, "DEMO-W007");
    const filters = new URLSearchParams(new URL(page.url()).hash.split("?")[1]);
    assert.equal(filters.get("businessStatus"), "outside_scope");
    assert.ok(!filters.has("page") || filters.get("page") === "1");
    assert.match(await page.locator(".filter-result").innerText(), /7 部作品/);
    assert.equal(await page.getByRole("link", { name: "第 1 页", exact: true }).getAttribute("aria-current"), "page");
  }, { path: "/workspace/#/works?businessStatus=outside_scope&page=999" });
});

test("workspace detail keeps observed cash separate from four empty forecasts and exposes its record", async () => {
  await withPage(async page => {
    await page.getByRole("heading", { name: "海边来信", exact: true }).waitFor();
    assert.equal(await page.locator(".detail-summary-grid .number").innerText(), "¥ 286,400");
    assert.match(await page.locator(".detail-facts").innerText(), /分成/);
    const chart = await page.getByRole("img", { name: /^最近六个月历史分成现金：/ }).getAttribute("aria-label");
    for (const value of ["2026-04 ¥ 14,000", "2026-05 ¥ 18,000", "2026-06 ¥ 17,000", "2026-07 ¥ 22,000", "2026-08 ¥ 25,000", "2026-09 ¥ 29,000"]) assert.ok(chart.includes(value), value);
    const predictions = await page.locator(".prediction").allTextContents();
    assert.equal(predictions.length, 4);
    [3, 6, 12, 36].forEach((months, index) => {
      assert.ok(predictions[index].includes(`${months} 个月 / 尚未生成`));
      assert.ok(predictions[index].includes("预测区间 — / 模型版本 —"));
      assert.doesNotMatch(predictions[index], /¥|0 元/);
    });
    const record = page.getByRole("button", { name: /资料与变更记录/ });
    assert.equal(await record.getAttribute("aria-expanded"), "false");
    await record.click();
    await page.locator(".source-detail").waitFor();
    assert.equal(await record.getAttribute("aria-expanded"), "true");
    assert.match(await page.locator(".source-detail").innerText(), /DEMO-W001/);
    assert.match(await page.locator(".source-detail").innerText(), /workspace-synthetic-128-v1/);
    assert.match(await page.locator(".source-detail").innerText(), /合成示例，不来自真实账单/);
  }, { path: "/workspace/#/works/DEMO-W001" });
});

test("workspace research renders all four frozen horizons and opens locally readable sources", async () => {
  await withPage(async page => {
    await expectResearch(page);
    await page.getByText("口径与完整来源", { exact: true }).click();
    await page.locator(".evidence-panel").waitFor();
    const evidence = await page.locator(".evidence-panel").innerText();
    assert.match(evidence, /36 个月/);
    assert.match(evidence, /尚未形成前瞻验证/);
    assert.match(evidence, /不能替代收入金额覆盖率/);
    const sourceLinks = page.locator(".evidence-panel a[href^='/api/m2/public/research-sources/']");
    assert.equal(await sourceLinks.count(), 5);
    const [sourcePage] = await Promise.all([
      page.waitForEvent("popup"),
      sourceLinks.filter({ hasText: "模型登记表" }).click()
    ]);
    await sourcePage.waitForLoadState("domcontentloaded");
    assert.equal(new URL(sourcePage.url()).pathname, "/api/m2/public/research-sources/registry");
    assert.match(await sourcePage.locator("body").innerText(), /"currentRoles"/);
    await sourcePage.close();
  }, { path: "/workspace/#/research" });
});

test("formal workspace reports unavailable data without fixture fallback while public research works", async () => {
  await withPage(async page => {
    await page.getByRole("heading", { name: "正式数据尚未连接", exact: true }).waitFor();
    const text = await page.locator("body").innerText();
    assert.match(text, /数据库未配置或当前不可用，这不等同于空库/);
    assert.doesNotMatch(text, /DEMO-W|海边来信|合成演示 v0\.2/);
    assert.equal(await page.locator(".works-table tbody tr").count(), 0);
    const response = await page.request.get(origins.formal + "/api/workspace/works?fixture=1&mode=fixture");
    assert.equal(response.status(), 503);
    const body = await response.json();
    assert.equal(body.error.code, "database_not_configured");
    assert.equal(body.items, undefined);
    await page.getByRole("navigation", { name: "主导航" }).getByRole("link", { name: /研究结果/ }).click();
    await expectResearch(page);
    assert.equal(await page.getByTestId("data-mode").innerText(), "正式数据 · 只读");
    await page.getByRole("navigation", { name: "主导航" }).getByRole("link", { name: /工作台/ }).click();
    await page.getByRole("heading", { name: "正式数据尚未连接", exact: true }).first().waitFor();
    assert.doesNotMatch(await page.locator("body").innerText(), /DEMO-W|海边来信/);
  }, { mode: "formal", path: "/workspace/?fixture=1#/works" });
});

for (const width of [390, 320]) {
  test(`workspace at ${width}px contains all four pages and expanded evidence without document overflow`, async () => {
    await withPage(async page => {
      const overflowingPages = [];
      const cases = [
        ["#/", ".stats-grid"], ["#/works", ".works-table"],
        ["#/works/DEMO-W001", ".cash-chart"], ["#/research", ".metric-card"]
      ];
      for (const [hash, ready] of cases) {
        await page.goto(origins.fixture + "/workspace/" + hash, { waitUntil: "load" });
        await page.locator(ready).first().waitFor();
        if (hash === "#/research") {
          await page.getByText("口径与完整来源", { exact: true }).click();
          await page.locator(".evidence-panel").waitFor();
        }
        if (hash.startsWith("#/works/")) await page.getByRole("button", { name: /资料与变更记录/ }).click();
        await page.evaluate(async () => { await document.fonts.ready; });
        const dimensions = await page.evaluate(() => ({
          viewport: innerWidth, document: document.documentElement.scrollWidth,
          tables: [...document.querySelectorAll(".table-scroll")].map(element => ({
            width: element.clientWidth, scrollWidth: element.scrollWidth,
            overflowX: getComputedStyle(element).overflowX,
            right: element.getBoundingClientRect().right
          })),
          outliers: [...document.querySelectorAll("main *, .site-header *, .site-footer *")]
            .filter(element => !element.closest(".table-scroll") && element.getBoundingClientRect().right > innerWidth + 1)
            .slice(0, 12)
            .map(element => ({ tag: element.tagName, className: element.className, text: element.textContent.slice(0, 80), right: element.getBoundingClientRect().right }))
        }));
        if (dimensions.document > dimensions.viewport + 1) overflowingPages.push({ hash, ...dimensions });
        for (const table of dimensions.tables) {
          assert.equal(table.overflowX, "auto");
          assert.ok(table.right <= width + 1);
          assert.ok(table.scrollWidth >= table.width);
        }
        if (["#/works", "#/research"].includes(hash)) assert.ok(dimensions.tables.some(table => table.scrollWidth > table.width), "Wide tables must scroll inside their container");
      }
      assert.deepEqual(overflowingPages, [], `Pages overflow at ${width}px: ${JSON.stringify(overflowingPages)}`);
    }, { width });
  });
}
