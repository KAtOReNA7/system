import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
import { loadConfig } from "../../src/config.js";
import { createApp } from "../../src/http/app.js";
import { getPublicResearchSummary } from "../../src/repositories/publicResearchRepository.js";
import { listenOnFetchSafePort } from "../helpers/listenOnFetchSafePort.js";

// These are synthetic contract records in an isolated temporary directory. The
// formal/local flags exercise the real-source UI branch; they do not certify any
// real ledger, work, author, rights record or model result.
const SOURCE_LABEL = "本地真实资料 · 只读";
const AUDIT_LABEL = "原始账单核对 · 未通过总账守恒";
const CATEGORY = "出版物 / 小说 / 中国当代小说";
const digest = value => createHash("sha256").update(value).digest("hex");
const percent = value => (value * 100).toFixed(2).replace("-", "−") + "%";
const cashText = async locator => (await locator.innerText()).replace(/^¥\s*/, "");
const roots = [];
const servers = [];
let browser;
let local;
let stale;
let research;

function syntheticWork(index) {
  const id = String(910000 + index);
  const pure = index === 3;
  const amounts = index === 1 ? [100, 100, 100, null, 100, 100, 100, 100, 100, 100, -250, 0] : Array(12).fill(100);
  const monthlyCash = amounts.map((value, offset) => ({
    month: `${2025 + Math.floor((9 + offset) / 12)}-${String((9 + offset) % 12 + 1).padStart(2, "0")}`,
    amount: pure ? null : value,
    complete: true,
    observationStatus: pure ? "OUTSIDE_SCOPE" : value === null ? "NOT_OBSERVED" : "OBSERVED_POSTING"
  }));
  // An actual posting in the incomplete latest month remains inspectable but
  // must never inflate the complete T12 cash total.
  if (index === 1) monthlyCash.push({ month: "2026-10", amount: 5000, complete: false, observationStatus: "OBSERVED_POSTING" });
  const cash = pure ? null : index === 1 ? 650 : 1200;
  return {
    id, standardWorkId: id, syntheticOnly: false,
    workName: index === 1 ? "合同样例·负数与缺月" : index === 2 ? "合同样例·混合现金" : pure ? "合同样例·纯买断" : `合同样例·作品${String(index).padStart(3, "0")}`,
    authorName: index === 1 ? null : `合同合成作者${index}`,
    category: pure ? "出版物 / 人文 / 散杂文" : CATEGORY,
    categoryPath: pure ? ["出版物", "人文", "散杂文"] : ["出版物", "小说", "中国当代小说"],
    classificationLevel1: "出版物", classificationLevel2: pure ? "人文" : "小说", classificationLevel3: pure ? "散杂文" : "中国当代小说",
    completeBillMonths: index === 1 ? 11 : 12, channelCount: 1,
    salesShareCash12Months: cash, cashType: pure ? "pure_buyout" : index === 2 ? "mixed" : "sales_share",
    dataStatus: index === 1 ? "needs_review" : "complete",
    businessStatus: pure ? "outside_scope" : index === 1 ? "needs_review" : "not_evaluated",
    completeness: { missingBasicInfoRecord: false, missingCoreFields: index === 1, missingClassification: false },
    cashCoverage: { observedMonths: pure ? 0 : index === 1 ? 11 : 12, expectedMonths: 12 },
    monthlyCash,
    channels: [{ uid: "synthetic-contract-channel", name: "合同合成渠道", amount: cash, canonical: true }],
    qualityIssues: index === 1 ? [
      { code: "AUTHOR_MISSING", messageZh: "作者缺少依据，保持为空", field: "authorName", severity: "warning", status: "pending", sourceLabel: "合成合同测试" },
      { code: "RIGHTS_MISSING", messageZh: "版权期限缺少依据，保持为空", field: "rightsStartDate", severity: "warning", status: "pending", sourceLabel: "合成合同测试" }
    ] : [],
    reviewReason: index === 1 ? "合成资料待核对" : null,
    workSource: "合同合成来源", businessForms: index === 1 ? ["有声版权", "有声成品"] : ["有声版权"],
    rawWorkIds: index === 1 ? [id, `Y${id}`] : [id],
    rightsStartDate: index === 1 ? null : "2025-01-01", rightsEndDate: index === 1 ? null : "2027-12-31",
    firstSalesMonth: pure ? null : "2025-10", productStatus: null,
    buyoutAudit: { cash12Months: index === 2 ? 120000 : pure ? 4200 : 0, totalCash: index === 2 ? 125000 : pure ? 4200 : 0, recordCount: index === 2 ? 2 : pure ? 1 : 0, notForecastCash: true },
    notices: ["本条仅为合成合同测试记录，不是真实业务证据。"]
  };
}

async function saveSnapshot(root, payload, { mode = "local_snapshot", schema } = {}) {
  const payloadJson = JSON.stringify(payload);
  const filename = mode === "local_audit" ? "audit.json" : "current.json";
  await writeFile(join(root, "data/private-output/workspace", filename), JSON.stringify({
    schema: schema ?? (mode === "local_audit" ? "workspace.local-audit.v1" : "workspace.local-readonly.v1"),
    payloadJson, sha256: digest(payloadJson)
  }));
}

async function startLocalApp(root, mode = "local_snapshot") {
  const config = loadConfig({ M1_APP_ENV: "test", M1_WORKSPACE_SOURCE: mode, M1_WORKSPACE_SOURCE_ROOT: root });
  const failDatabase = () => { throw new Error("Synthetic local-source E2E must never access a database"); };
  const server = http.createServer(createApp(config, { listWorks: failDatabase, getWorkById: failDatabase }));
  servers.push(server);
  return `http://127.0.0.1:${await listenOnFetchSafePort(server)}`;
}

async function prepareLocalApp({ mode = "local_snapshot", transform } = {}) {
  const root = await mkdtemp(join(tmpdir(), "workspace-local-e2e-"));
  roots.push(root);
  const sourceDirectory = "data/synthetic-authority";
  await mkdir(join(root, sourceDirectory), { recursive: true });
  await mkdir(join(root, "data/private-output/workspace"), { recursive: true });
  const sources = [];
  for (const role of ["total-ledger-authority", "sales-share-ledger-authority", "buyout-ledger-authority", "user-reviewed-channel-master"]) {
    const path = `${sourceDirectory}/${role}.txt`;
    const body = `SYNTHETIC CONTRACT ONLY: ${role}\n`;
    await writeFile(join(root, path), body);
    const info = await stat(join(root, path), { bigint: true });
    sources.push({ role, path, size: Number(info.size), sha256: digest(body), mtimeNs: info.mtimeNs.toString() });
  }
  const directoryInfo = await stat(join(root, sourceDirectory), { bigint: true });
  const sourceDirectories = [{ role: "synthetic-ledger-directory", path: sourceDirectory, mtimeNs: directoryInfo.mtimeNs.toString(), entries: (await readdir(join(root, sourceDirectory))).sort() }];
  for (const role of ["master-data-directory", "work-mapping-directory"]) {
    const path = `data/${role}`;
    await mkdir(join(root, path));
    const info = await stat(join(root, path), { bigint: true });
    sourceDirectories.push({ role, path, mtimeNs: info.mtimeNs.toString(), entries: [] });
  }
  const payload = {
    generatedAt: "2026-10-30T00:00:00Z",
    dataset: {
      mode: "formal", source: "local-reviewed-ledger-snapshot", syntheticOnly: false, notForFormalDecision: true, cashAuthorityVerified: true,
      cutoffMonth: "2026-09", cashPeriodStart: "2025-10", billMaxMonth: "2026-10", currency: null,
      sourceLabelZh: SOURCE_LABEL,
      cashDefinitionLabelZh: "本地只读账单视图；尚未完成正式主数据治理。按入账月展示分成现金，买断单列审计。",
      identityStatusLabelZh: "待确认分册映射未自动应用", governanceStatusLabelZh: "尚未完成正式主数据治理",
      completeBillMonthsDefinitionZh: "有观察记录的完整账单月份；不等于动态核心人口资格", cashView: "posting_time_accounting"
    },
    authorityChecks: { schemaEqual: true, splitTypePure: true, noSplitOverlap: true, rowMultisetConserved: true, amountConserved: true, monthlyRowCountConserved: true, monthlyAmountConserved: true },
    sources,
    sourceDirectories,
    items: Array.from({ length: 9 }, (_, index) => syntheticWork(index + 1))
  };
  if (transform) transform(payload);
  await saveSnapshot(root, payload, { mode });
  const origin = await startLocalApp(root, mode);
  const response = await fetch(origin + "/api/workspace/works");
  assert.equal(response.status, 200, "Synthetic snapshot must satisfy the production loader contract");
  const result = await response.json();
  assert.equal(result.pagination.total, 9);
  return { root, origin, source: join(root, sources[0].path), payload, sourceLabel: result.dataset.sourceLabelZh };
}

before(async () => {
  local = await prepareLocalApp();
  stale = await prepareLocalApp();
  research = await getPublicResearchSummary();
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  for (const server of servers) {
    if (server.listening) await new Promise((resolvePromise, reject) => server.close(error => error ? reject(error) : resolvePromise()));
  }
  for (const root of roots) {
    const part = relative(resolve(tmpdir()), resolve(root));
    assert.ok(part.startsWith("workspace-local-e2e-") && part !== ".." && !part.startsWith(`..${sep}`) && !isAbsolute(part));
    await rm(root, { recursive: true, force: true });
  }
});

async function withPage(run, { app = local, path = "/workspace/#/", width = 1440, waitForMode = true } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  const external = [];
  const writes = [];
  page.on("pageerror", error => errors.push(error.message));
  await context.route("**/*", route => {
    const request = route.request();
    if (new URL(request.url()).origin !== app.origin) {
      external.push(request.url());
      return route.abort();
    }
    if (!["GET", "HEAD"].includes(request.method())) {
      writes.push(request.method() + " " + request.url());
      return route.abort();
    }
    return route.continue();
  });
  try {
    assert.equal((await page.goto(app.origin + path, { waitUntil: "load" })).status(), 200, "Build the workspace before browser tests");
    if (waitForMode) await page.getByTestId("data-mode").getByText(app.sourceLabel ?? SOURCE_LABEL, { exact: true }).waitFor();
    await run(page);
    assert.deepEqual(errors, [], "Navigation must not cause a runtime error");
    assert.deepEqual(external, [], "Local-source browsing must never request a remote resource");
    assert.deepEqual(writes, [], "Local-source browsing must never send a write request");
  } finally {
    await context.close();
  }
}

async function waitForRows(page, ids) {
  await page.waitForFunction(expected => {
    const rows = [...document.querySelectorAll(".works-table tbody tr")];
    return rows.length === expected.length && rows.every((row, index) => row.textContent.includes(expected[index]));
  }, ids);
}

async function expectPublicResearch(page) {
  await page.locator(".metric-card").last().waitFor();
  const cards = await page.locator(".metric-card").allTextContents();
  assert.equal(cards.length, 4);
  research.baselineSummary.horizons.forEach((horizon, index) => {
    for (const value of [String(horizon.months).padStart(2, "0"), percent(horizon.wape), percent(horizon.signedBias), percent(horizon.caseCoverage)]) assert.ok(cards[index].includes(value));
    assert.ok(cards[index].includes("金额覆盖率：未披露"));
  });
  const body = await page.locator("body").innerText();
  for (const label of ["[ PUBLIC ]", "无活动候选", "自动化未批准", "未具备生产资格", "部分证据，未激活", "现金历史相邻研究已结束"]) assert.ok(body.includes(label), label);
  assert.equal(research.roles.productionReady, false);
  assert.equal(research.roles.activeCandidate, null);
}

test("local-source synthetic contract preserves IDs, filters and page when returning from work detail", async () => {
  await withPage(async page => {
    await page.locator(".stats-grid").waitFor();
    assert.equal(await page.locator(".stat .number").first().innerText(), "9");
    assert.match(await page.locator("body").innerText(), /尚未完成正式主数据治理/);
    assert.match(await page.locator(".source-note").first().innerText(), /\[ LOCAL \]/);
    await page.getByRole("link", { name: "浏览作品库 ↗", exact: true }).click();
    await waitForRows(page, ["910001", "910002", "910003", "910004", "910005", "910006"]);
    await page.getByRole("button", { name: "数据视图", exact: true }).click();
    await page.waitForFunction(() => [...document.querySelectorAll(".view-switch button")].some(button => button.textContent === "数据视图" && button.getAttribute("aria-pressed") === "true"));
    await page.getByRole("combobox", { name: "作品分类" }).selectOption(CATEGORY);
    await waitForRows(page, ["910001", "910002", "910004", "910005", "910006", "910007"]);
    await page.getByRole("link", { name: "下一页 ↗", exact: true }).click();
    await waitForRows(page, ["910008", "910009"]);
    const listHash = new URL(page.url()).hash;
    await page.locator(".works-table").getByRole("link", { name: "合同样例·作品008", exact: true }).click();
    await page.getByRole("heading", { name: "合同样例·作品008", exact: true }).waitFor();
    assert.match(new URL(page.url()).hash, /^#\/works\/910008\?/);
    assert.match(await page.locator(".work-metadata").innerText(), /910008/);
    await page.getByRole("link", { name: "返回作品库", exact: true }).click();
    await waitForRows(page, ["910008", "910009"]);
    assert.equal(new URL(page.url()).hash, listHash);
    assert.equal(await page.getByRole("combobox", { name: "作品分类" }).inputValue(), CATEGORY);
    assert.equal(await page.getByRole("link", { name: "第 2 页", exact: true }).getAttribute("aria-current"), "page");
    assert.equal(await page.getByRole("button", { name: "数据视图", exact: true }).getAttribute("aria-pressed"), "true");
    await page.getByRole("searchbox").fill("910002");
    await page.getByRole("button", { name: "搜索作品", exact: true }).click();
    await waitForRows(page, ["910002"]);
    assert.equal(new URLSearchParams(new URL(page.url()).hash.split("?")[1]).get("page"), null);
    await page.getByRole("button", { name: "清除筛选 ×", exact: true }).click();
    await waitForRows(page, ["910001", "910002", "910003", "910004", "910005", "910006"]);
    await page.getByRole("combobox", { name: "数据状态" }).selectOption("needs_review");
    await waitForRows(page, ["910001"]);
    await page.getByRole("button", { name: "清除筛选 ×", exact: true }).click();
    await waitForRows(page, ["910001", "910002", "910003", "910004", "910005", "910006"]);
    await page.getByRole("combobox", { name: "业务状态" }).selectOption("outside_scope");
    await waitForRows(page, ["910003"]);
    assert.equal(await page.locator(".works-table .cash-column").last().innerText(), "—");
  });
});

test("local-source synthetic cash retains reversals, missing months and incomplete postings without inventing metadata", async () => {
  await withPage(async page => {
    await page.getByRole("heading", { name: "合同样例·负数与缺月", exact: true }).waitFor();
    assert.equal(await cashText(page.locator(".detail-summary-grid .number")), "650");
    assert.match(await page.locator(".detail-summary-grid").innerText(), /已观察 11 \/ 12 个月；缺月不补零/);
    const recent = page.getByTestId("cash-history-table").first();
    assert.equal(await recent.locator("tbody tr").count(), 6);
    const negative = recent.getByRole("row").filter({ hasText: "2026.08" });
    assert.equal(await cashText(negative.locator("td").nth(1)), "-250");
    assert.equal(await cashText(recent.getByRole("row").filter({ hasText: "2026.09" }).locator("td").nth(1)), "0");
    assert.equal(await page.locator(".cash-chart").count(), 0, "Negative cash must not become a positive-height bar");
    await page.getByText("查看全部账单月份", { exact: true }).click();
    const allMonths = page.getByTestId("cash-history-table").last();
    const missing = allMonths.getByRole("row").filter({ hasText: "2026.01" });
    assert.equal(await missing.locator("td").nth(1).innerText(), "—");
    assert.match(await missing.innerText(), /未观察.*不填零/);
    const incomplete = allMonths.getByRole("row").filter({ hasText: "2026.10" });
    assert.equal(await cashText(incomplete.locator("td").nth(1)), "5,000");
    assert.match(await incomplete.innerText(), /账单未完整.*仅事实追溯/);
    for (const label of ["作者", "版权开始", "版权到期"]) {
      const entry = page.locator(".work-metadata .metadata-grid > div").filter({ has: page.locator("dt").getByText(label, { exact: true }) });
      assert.equal(await entry.locator("dd").innerText(), "未确认");
    }
    assert.match(await page.locator(".work-metadata").innerText(), /有声版权 · 有声成品/);
    assert.match(await page.locator(".work-metadata").innerText(), /Y910001/);
    assert.match(await page.locator(".detail-facts").innerText(), /分成\s*现金类型/);
    assert.match(await page.locator(".quality-issues").innerText(), /作者缺少依据.*版权期限缺少依据/s);
    assert.equal(await page.locator(".prediction").count(), 4);
    assert.ok((await page.locator(".prediction").allTextContents()).every(value => value.includes("尚未生成") && !value.includes("¥")));
  }, { path: "/workspace/#/works/910001" });
});

test("mixed and pure-buyout synthetic contracts keep audit cash separate from forecast cash", async () => {
  await withPage(async page => {
    await page.getByRole("heading", { name: "合同样例·混合现金", exact: true }).waitFor();
    assert.equal(await cashText(page.locator(".detail-summary-grid .number")), "1,200");
    assert.match(await page.locator(".detail-facts").innerText(), /混合\s*现金类型/);
    assert.equal(await cashText(page.getByTestId("buyout-audit").locator(".number-small")), "120,000");
    assert.match(await page.getByTestId("buyout-audit").innerText(), /历史合计 (?:¥ )?125,000.*不计入分成现金与预测/s);
    await page.goto(local.origin + "/workspace/#/works/910003");
    await page.getByRole("heading", { name: "合同样例·纯买断", exact: true }).waitFor();
    assert.equal(await page.locator(".detail-summary-grid .number").innerText(), "—");
    assert.equal(await cashText(page.getByTestId("buyout-audit").locator(".number-small")), "4,200");
    assert.match(await page.locator(".history-section").innerText(), /纯买断不属于分成现金预测范围.*保持为空/);
    assert.equal(await page.locator(".cash-chart").count(), 0);
    assert.equal(await page.locator(".prediction").count(), 4);
    assert.ok((await page.locator(".prediction").allTextContents()).every(value => value.includes("不适用") && !value.includes("¥")));
    assert.doesNotMatch(await page.locator(".detail-summary-grid").innerText(), /合成示例|¥ 0/);
    await page.getByRole("navigation", { name: "主导航" }).getByRole("link", { name: /研究结果/ }).click();
    await expectPublicResearch(page);
    const response = await page.request.get(local.origin + "/api/m2/public/research-summary");
    assert.equal(response.status(), 200);
    assert.deepEqual(await response.json(), research, "Local ledger selection must not alter public research evidence");
  }, { path: "/workspace/#/works/910002" });
});

test("local-source synthetic pages and expanded evidence stay within a 320px viewport", async () => {
  await withPage(async page => {
    const checks = [
      ["#/", ".stats-grid"], ["#/works", ".works-table"],
      ["#/works/910001", ".work-metadata"], ["#/works/910003", ".buyout-audit"], ["#/research", ".metric-grid"]
    ];
    for (const [hash, ready] of checks) {
      await page.goto(local.origin + "/workspace/" + hash);
      await page.locator(ready).waitFor();
      if (hash === "#/works/910001") await page.getByText("查看全部账单月份", { exact: true }).click();
      if (hash === "#/research") await page.getByText("口径与完整来源", { exact: true }).click();
      const geometry = await page.evaluate(async () => {
        await document.fonts.ready;
        return {
          width: innerWidth, documentWidth: document.documentElement.scrollWidth,
          scrollRegions: [...document.querySelectorAll(".table-scroll")].filter(node => node.getBoundingClientRect().height > 0).map(node => ({
            right: node.getBoundingClientRect().right, left: node.getBoundingClientRect().left, overflow: getComputedStyle(node).overflowX
          }))
        };
      });
      assert.ok(geometry.documentWidth <= geometry.width + 1, `${hash}: ${geometry.documentWidth}px document overflows ${geometry.width}px viewport`);
      for (const region of geometry.scrollRegions) {
        assert.ok(region.right <= geometry.width + 1 && region.left >= -1, `${hash}: table scroll container exceeds viewport`);
        assert.ok(["auto", "scroll"].includes(region.overflow));
      }
    }
  }, { width: 320 });
});

test("changed synthetic source disables cached local works without substituting fixtures or blocking public research", async () => {
  await withPage(async page => {
    await waitForRows(page, ["910001", "910002", "910003", "910004", "910005", "910006"]);
    await writeFile(stale.source, "SYNTHETIC CONTRACT SOURCE CHANGED; prior snapshot must stop\n");
    await page.getByRole("searchbox").fill("910001");
    const unavailable = page.waitForResponse(response => response.url().includes("/api/workspace/works?") && response.status() === 503);
    await page.getByRole("button", { name: "搜索作品", exact: true }).click();
    const response = await unavailable;
    assert.equal((await response.json()).error.code, "workspace_snapshot_stale");
    await page.getByRole("heading", { name: "本地真实数据暂不可用", exact: true }).waitFor();
    assert.equal(await page.locator(".works-table").count(), 0);
    assert.equal(await page.getByRole("searchbox").inputValue(), "910001");
    assert.doesNotMatch(await page.locator("body").innerText(), /DEMO-W001|海边来信|128/);
    await page.getByRole("link", { name: "查看研究结果 ↗", exact: true }).click();
    await expectPublicResearch(page);
  }, { app: stale, path: "/workspace/#/works" });
});

function markSyntheticAudit(payload) {
  Object.assign(payload.dataset, {
    kind: "RAW_LEDGER_AUDIT", sourceStatus: "RECONCILIATION_REQUIRED", cashAuthorityVerified: false,
    sourceLabelZh: AUDIT_LABEL
  });
  payload.reconciliation = { missingRowCount: 0, extraRowCount: 3 };
  Object.assign(payload.authorityChecks, {
    rowMultisetConserved: false, amountConserved: "NOT_CHECKED", monthlyRowCountConserved: "NOT_CHECKED", monthlyAmountConserved: "NOT_CHECKED"
  });
}

async function expectAuditBanner(page) {
  const banner = page.getByTestId("audit-banner");
  await banner.getByRole("heading", { name: "原始账单核对 / 对账尚未通过", exact: true }).waitFor();
  assert.match(await banner.innerText(), /金额待核对.*不用于正式财务汇总、预测或业务验收/s);
  assert.match(await banner.innerText(), /总账侧未匹配 0 条；拆分侧多出 3 条/);
  assert.equal(await page.getByTestId("data-mode").innerText(), AUDIT_LABEL);
}

test("failed synthetic reconciliation stays rejected in strict mode and explicit audit browsing retains unverified warnings", async () => {
  const audit = await prepareLocalApp({ mode: "local_audit", transform: markSyntheticAudit });
  // Use identical records and failed checks in the strict envelope. Setting the
  // strict dataset flags must not promote a failed conservation check to READY.
  const strictPayload = structuredClone(audit.payload);
  delete strictPayload.dataset.kind;
  strictPayload.dataset.sourceStatus = "READY";
  strictPayload.dataset.cashAuthorityVerified = true;
  await saveSnapshot(audit.root, strictPayload);
  const strictOrigin = await startLocalApp(audit.root);
  const strictResponse = await fetch(strictOrigin + "/api/workspace/works?mode=fixture&fixture=1");
  assert.equal(strictResponse.status, 503);
  assert.equal((await strictResponse.json()).error.code, "workspace_snapshot_invalid");
  const strictContext = await (await fetch(strictOrigin + "/api/workspace/context")).json();
  assert.equal(strictContext.dataset.sourceStatus, "UNAVAILABLE");
  assert.equal(strictContext.capabilities.cashAuthorityVerified, false);

  await withPage(async page => {
    const context = await (await page.request.get(audit.origin + "/api/workspace/context")).json();
    assert.equal(context.dataset.kind, "RAW_LEDGER_AUDIT");
    assert.equal(context.dataset.sourceStatus, "RECONCILIATION_REQUIRED");
    assert.equal(context.dataset.cashAuthorityVerified, false);
    assert.equal(context.capabilities.cashAuthorityVerified, false);
    assert.equal(context.capabilities.writesAllowed, false);
    assert.equal(context.capabilities.modelExecutionAllowed, false);
    assert.equal(context.capabilities.productionForecastAvailable, false);
    assert.deepEqual(context.dataset.reconciliation, { missingRowCount: 0, extraRowCount: 3 });
    await page.locator(".stats-grid").waitFor();
    await expectAuditBanner(page);
    await page.getByRole("link", { name: "浏览作品库 ↗", exact: true }).click();
    await waitForRows(page, ["910001", "910002", "910003", "910004", "910005", "910006"]);
    await expectAuditBanner(page);
    await page.locator(".works-table").getByRole("link", { name: "合同样例·负数与缺月", exact: true }).click();
    await page.getByRole("heading", { name: "合同样例·负数与缺月", exact: true }).waitFor();
    await expectAuditBanner(page);
    assert.equal(await cashText(page.locator(".detail-summary-grid .number")), "650");
    assert.match(await page.locator(".detail-summary-grid").innerText(), /原始分成记录.*待核对/s);
    assert.match(await page.locator(".quality-issues").innerText(), /总账|守恒|核对/);
    assert.ok((await page.locator(".prediction").allTextContents()).every(value => value.includes("尚未生成")));
    const geometry = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
    assert.ok(geometry.document <= geometry.viewport + 1, "Audit banner must also fit a 320px viewport");
    await page.getByRole("navigation", { name: "主导航" }).getByRole("link", { name: /研究结果/ }).click();
    await expectPublicResearch(page);
    assert.equal(await page.getByTestId("data-mode").innerText(), AUDIT_LABEL);
    const publicResponse = await page.request.get(audit.origin + "/api/m2/public/research-summary");
    assert.deepEqual(await publicResponse.json(), research);
  }, { app: audit, width: 320 });
});

test("audit schema mismatch never selects an otherwise valid strict snapshot", async () => {
  const audit = await prepareLocalApp({ mode: "local_audit", transform: markSyntheticAudit });
  const validStrict = structuredClone(audit.payload);
  delete validStrict.dataset.kind;
  delete validStrict.reconciliation;
  validStrict.dataset.sourceStatus = "READY";
  validStrict.dataset.cashAuthorityVerified = true;
  validStrict.dataset.sourceLabelZh = SOURCE_LABEL;
  for (const key of Object.keys(validStrict.authorityChecks)) validStrict.authorityChecks[key] = true;
  await saveSnapshot(audit.root, validStrict);
  const strictOrigin = await startLocalApp(audit.root);
  assert.equal((await fetch(strictOrigin + "/api/workspace/works")).status, 200, "The strict file exists and is valid, so failure proves audit does not fall back to it");
  await saveSnapshot(audit.root, audit.payload, { mode: "local_audit", schema: "workspace.local-readonly.v1" });
  const response = await fetch(audit.origin + "/api/workspace/works?mode=local_snapshot");
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "workspace_snapshot_invalid");
  const context = await (await fetch(audit.origin + "/api/workspace/context")).json();
  assert.equal(context.dataset.sourceStatus, "UNAVAILABLE");
  assert.equal(context.capabilities.cashAuthorityVerified, false);
  await withPage(async page => {
    await page.getByRole("heading", { name: "本地真实数据暂不可用", exact: true }).waitFor();
    assert.equal(await page.locator(".works-table").count(), 0);
    assert.doesNotMatch(await page.locator("body").innerText(), /合同样例·负数与缺月|DEMO-W001|海边来信/);
    await page.getByRole("link", { name: "查看研究结果 ↗", exact: true }).click();
    await expectPublicResearch(page);
  }, { app: audit, path: "/workspace/#/works", waitForMode: false });
});
