import assert from "node:assert/strict";
import http from "node:http";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
import { createApp } from "../../src/http/app.js";
import { listenOnFetchSafePort } from "../helpers/listenOnFetchSafePort.js";

// The public research composition is deliberately started without database,
// provider or local snapshot configuration. No private ledger is loaded here.
const config = {
  service: "m1-audiobook-evaluation", appEnv: "test", port: 0,
  database: { rwUrl: undefined, readonlyUrl: undefined, backgroundUrl: undefined }
};
const horizons = [3, 6, 12, 36];
const evidenceKeys = ["amountCoverage", "stability", "uncertainty"];
const percent = (value, digits = 2) => (value * 100).toFixed(digits).replace("-", "−") + "%";
let server;
let browser;
let origin;
let summary;

before(async () => {
  server = http.createServer(createApp(config));
  origin = `http://127.0.0.1:${await listenOnFetchSafePort(server)}`;
  const response = await fetch(origin + "/api/m2/public/research-summary");
  assert.equal(response.status, 200);
  summary = await response.json();
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  if (server?.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

async function withResearchPage(run, { width = 1440 } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  const external = [];
  const writes = [];
  page.on("pageerror", error => errors.push(error.message));
  await context.route("**/*", route => {
    const request = route.request();
    if (new URL(request.url()).origin !== origin) {
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
    const response = await page.goto(origin + "/workspace/#/research", { waitUntil: "load" });
    assert.equal(response.status(), 200, "Build the current workspace UI before browser tests");
    await page.locator(".acceptance-table tbody tr").last().waitFor();
    assert.equal(await page.title(), "研究结果 · SYSTEM.");
    assert.equal(new URL(page.url()).hash, "#/research");
    await run(page);
    assert.deepEqual(errors, [], "Research UI must not throw during grain changes or evidence expansion");
    assert.deepEqual(external, [], "Public evidence and workspace assets must remain on the local server");
    assert.deepEqual(writes, [], "Research browsing must never submit an execution or write request");
  } finally {
    await context.close();
  }
}

async function chooseGrain(page, grain) {
  const label = grain === "WORK_TOTAL" ? "作品总额" : "作品×渠道";
  const controls = page.locator('[aria-label="验收粒度"]');
  await controls.getByRole("button", { name: label, exact: true }).click();
  await page.waitForFunction(expected => {
    const controls = document.querySelector('[aria-label="验收粒度"]');
    return [...(controls?.querySelectorAll("button") ?? [])].some(button => button.textContent === expected && button.getAttribute("aria-pressed") === "true");
  }, label);
  const expected = summary.acceptanceEvidence.rows.filter(row => row.grain === grain).sort((a, b) => a.horizonMonths - b.horizonMonths);
  await page.waitForFunction(labels => {
    const rows = [...document.querySelectorAll(".acceptance-table tbody tr")];
    return rows.length === labels.length && rows.every((row, index) => row.textContent.includes(labels[index]));
  }, expected.map(row => row.acceptance.labelZh));
  assert.equal(await controls.getByRole("button", { name: label, exact: true }).getAttribute("aria-pressed"), "true");
  const other = grain === "WORK_TOTAL" ? "作品×渠道" : "作品总额";
  assert.equal(await controls.getByRole("button", { name: other, exact: true }).getAttribute("aria-pressed"), "false");
  return expected;
}

async function expandDetails(locator) {
  for (let index = 0; index < await locator.count(); index += 1) {
    const detail = locator.nth(index);
    if (await detail.getAttribute("open") === null) await detail.locator("summary").first().click();
  }
}

test("public API keeps eight evidence rows and frozen route states available with no database", async () => {
  assert.equal((await fetch(origin + "/health")).status, 200);
  assert.equal((await fetch(origin + "/api/workspace/works")).status, 503, "A missing formal database must not be replaced by fixture works");
  assert.equal(summary.acceptanceEvidence.readOnly, true);
  assert.equal(summary.acceptanceEvidence.rows.length, 8);
  assert.equal(summary.grainGates.workTotal.status, "ACTIVE_FOR_DEVELOPMENT_EVALUATION_ONLY", "An exceeded metric must not be confused with an inactive contract");
  assert.deepEqual(summary.acceptanceEvidence.rows.map(row => `${row.grain}/${row.horizonMonths}`).sort(),
    horizons.flatMap(months => [`WORK_TOTAL/${months}`, `WORK_CHANNEL/${months}`]).sort());
  for (const row of summary.acceptanceEvidence.rows) {
    assert.ok(row.basisId && row.basisLabelZh);
    assert.ok(row.sourceIds.length > 0);
    assert.ok(row.sourceIds.every(id => summary.sources.some(source => source.id === id)));
    for (const key of evidenceKeys) {
      assert.equal(row.metrics[key].value, null, `${row.grain}/${row.horizonMonths}: undisclosed ${key} must not become zero`);
      assert.ok(row.metrics[key].status && row.metrics[key].labelZh);
    }
    if (row.grain === "WORK_TOTAL") {
      const baseline = summary.baselineSummary.horizons.find(item => item.months === row.horizonMonths);
      assert.equal(row.metrics.wape.value, baseline.wape);
      assert.equal(row.metrics.signedBias.value, baseline.signedBias);
      assert.equal(row.metrics.wape.limit, baseline.limits.wape);
      assert.equal(row.metrics.signedBias.limit, baseline.limits.absoluteSignedBias);
      assert.equal(row.acceptance.status, "NOT_ESTABLISHED_BY_THIS_SUMMARY");
    } else {
      assert.equal(row.metrics.wape.value, null, "A channel row must never borrow work-total WAPE");
      assert.equal(row.metrics.signedBias.value, null, "A channel row must never borrow work-total bias");
      assert.equal(row.acceptance.status, row.horizonMonths === 36 ? "PARTIAL_NOT_ACTIVE" : "NO_ACTIVE_HORIZON_GATE");
      assert.equal(row.missingCaseCount, row.horizonMonths === 36 ? summary.grainGates.workChannel.missingCaseCount : null);
      assert.equal(row.missingComponentCount, row.horizonMonths === 36 ? summary.grainGates.workChannel.missingComponentCount : null);
    }
  }
  assert.equal(summary.roles.activeCandidate, null);
  assert.equal(summary.roles.approvedForAutomation, null);
  assert.equal(summary.roles.productionReady, false);
  assert.deepEqual(summary.permissions, { production: false, automation: false, release: false });
});

test("research matrix switches grains while preserving four horizon metrics and explicit evidence gaps", async () => {
  await withResearchPage(async page => {
    const total = await chooseGrain(page, "WORK_TOTAL");
    const table = page.locator(".acceptance-table");
    for (const label of ["误差", "偏差", "金额覆盖", "稳定性", "不确定性"]) assert.match(await table.locator("thead").innerText(), new RegExp(label));
    for (let index = 0; index < total.length; index += 1) {
      const row = total[index];
      const rendered = await table.locator("tbody tr").nth(index).innerText();
      assert.ok(rendered.includes(String(row.horizonMonths)));
      assert.ok(rendered.includes(percent(row.metrics.wape.value)));
      assert.ok(rendered.includes(percent(row.metrics.signedBias.value)));
      assert.ok(rendered.includes(percent(row.metrics.wape.limit, 0)));
      assert.ok(rendered.includes(percent(row.metrics.signedBias.limit, 0)));
      for (const key of evidenceKeys) assert.ok(rendered.includes(row.metrics[key].labelZh), `${key} must have its own visible gap label`);
      assert.ok(rendered.includes(row.acceptance.labelZh));
    }
    const channel = await chooseGrain(page, "WORK_CHANNEL");
    for (let index = 0; index < channel.length; index += 1) {
      const row = channel[index];
      const rendered = await table.locator("tbody tr").nth(index).innerText();
      assert.ok(rendered.includes(row.acceptance.labelZh));
      for (const key of ["wape", "signedBias", ...evidenceKeys]) assert.ok(rendered.includes(row.metrics[key].labelZh));
      for (const baseline of summary.baselineSummary.horizons) assert.ok(!rendered.includes(percent(baseline.wape)), "Channel table must not render work-total performance");
    }
    await chooseGrain(page, "WORK_TOTAL");
    assert.equal(await table.locator("tbody tr").count(), 4);
    assert.match(await page.locator(".acceptance-evidence").innerText(), /历史|前瞻/);
  });
});

test("three research route cards distinguish current authority from frozen historical status", async () => {
  const byId = Object.fromEntries(summary.researchRoutes.map(route => [route.modelId, route]));
  assert.deepEqual(Object.keys(byId).sort(), ["M2-CHAN-PSC02", "M2-CHAN-PSC03", "M2-WORK-HPSR02"]);
  const psc02 = byId["M2-CHAN-PSC02"];
  const psc02Codes = [psc02.currentStatus.code, ...psc02.detailStatuses.map(status => status.code)];
  for (const code of [
    "PSC02_HISTORICAL_REPLAY_BLOCKED_NO_RECOVERABLE_ORIGIN_VISIBLE_CASH_AUTHORITY",
    "PSC02_EXECUTION_IMPLEMENTATION_INCOMPLETE_NO_CANDIDATE_RESULT", "NO_MODEL_PERFORMANCE_EVIDENCE"
  ]) assert.ok(psc02Codes.includes(code));
  const psc03 = byId["M2-CHAN-PSC03"];
  assert.equal(psc03.currentStatus.code, "PSC03_IMPLEMENTATION_CONTRACT_MISMATCH_CONFIRMED");
  assert.equal(psc03.historicalStatus.code, "PSC03_DEVELOPMENT_NOT_SUPPORTED");
  assert.notEqual(psc03.currentStatus.code, psc03.historicalStatus.code);
  assert.equal(byId["M2-WORK-HPSR02"].currentStatus.code, "M2_HPSR02_FIRST_INDEPENDENT_INCONCLUSIVE_CASH_ONLY_RESEARCH_ENDED");
  await withResearchPage(async page => {
    await page.locator(".research-route").last().waitFor();
    assert.equal(await page.locator(".research-route").count(), 3);
    await expandDetails(page.locator(".research-route details"));
    for (const route of summary.researchRoutes) {
      const card = page.locator(".research-route").filter({ hasText: route.modelId });
      assert.equal(await card.count(), 1);
      const rendered = await card.innerText();
      for (const value of [route.nameZh, route.currentStatus.labelZh, route.currentStatus.code, route.summaryZh, route.boundaryZh]) assert.ok(rendered.includes(value), `${route.modelId}: ${value}`);
      if (route.historicalStatus) {
        assert.ok(rendered.includes(route.historicalStatus.code));
        assert.ok(rendered.includes(route.historicalStatus.labelZh));
        assert.match(rendered, /历史/);
      }
      for (const status of route.detailStatuses) {
        assert.ok(rendered.includes(status.labelZh));
      }
      assert.equal(await card.getByRole("button", { name: /运行|执行|重跑|启动|启用|训练|调参/ }).count(), 0);
    }
  });
});

test("expanded evidence links resolve only through the public source whitelist", async () => {
  await withResearchPage(async page => {
    await expandDetails(page.locator(".acceptance-evidence details, .research-route details, .evidence-details"));
    const allowed = new Set(summary.sources.map(source => source.href));
    const links = await page.locator('.acceptance-evidence a, .research-routes a, .evidence-panel a').evaluateAll(nodes => nodes.map(node => node.getAttribute("href")));
    assert.ok(links.length > 0);
    for (const href of links) assert.ok(allowed.has(href), "Evidence links must use a named public source, never a filesystem path");
    for (const source of summary.sources) {
      const response = await page.request.get(origin + source.href);
      assert.equal(response.status(), 200);
      assert.equal(response.headers()["cache-control"], "no-store");
      assert.ok(response.headers()["x-request-id"]);
      assert.match(response.headers()["content-type"], source.path.endsWith(".json") ? /application\/json/ : /text\/plain/);
    }
    for (const id of ["unknown", "..%2F..%2Fconfig%2Fm2-model-registry.v1.json", "data%2Fprivate-input%2Fnever-read.json"]) {
      assert.equal((await page.request.get(origin + "/api/m2/public/research-sources/" + id)).status(), 404);
    }
  });
});

test("both research grains and expanded route/source evidence fit a 320px document", async () => {
  await withResearchPage(async page => {
    await expandDetails(page.locator(".acceptance-evidence details, .research-route details, .evidence-details"));
    for (const grain of ["WORK_TOTAL", "WORK_CHANNEL"]) {
      await chooseGrain(page, grain);
      const geometry = await page.evaluate(async () => {
        await document.fonts.ready;
        return {
          width: innerWidth, documentWidth: document.documentElement.scrollWidth,
          regions: [...document.querySelectorAll(".table-scroll")].filter(node => node.getBoundingClientRect().height > 0).map(node => ({
            left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right,
            overflow: getComputedStyle(node).overflowX
          }))
        };
      });
      assert.ok(geometry.documentWidth <= geometry.width + 1, `${grain}: ${geometry.documentWidth}px document exceeds ${geometry.width}px viewport`);
      for (const region of geometry.regions) {
        assert.ok(region.left >= -1 && region.right <= geometry.width + 1);
        assert.ok(["auto", "scroll"].includes(region.overflow), "Wide evidence tables need an internal scroll region");
      }
    }
  }, { width: 320 });
});
