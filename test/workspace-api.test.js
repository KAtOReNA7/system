import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { createApp } from "../src/http/app.js";
import { createFixtureApp } from "../src/http/fixtureApp.js";
import { listenOnFetchSafePort } from "./helpers/listenOnFetchSafePort.js";

const config = { service: "workspace-test", appEnv: "test", port: 0, database: {} };

async function withApp(app, run) {
  const server = http.createServer(app);
  const port = await listenOnFetchSafePort(server);
  try {
    await run(async (path, options) => {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, options);
      const text = await response.text();
      return { status: response.status, headers: response.headers, body: JSON.parse(text) };
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("workspace context is composition-owned without a database; query parameters cannot enable fixture", async () => {
  for (const [factory, mode] of [[createApp, "formal"], [createFixtureApp, "fixture"]]) {
    await withApp(factory(config), async (request) => {
      const result = await request("/api/workspace/context?fixture=1&mode=fixture");
      assert.equal(result.status, 200);
      assert.equal(result.body.dataset.mode, mode);
      assert.equal(result.body.dataset.syntheticOnly, mode === "fixture");
      assert.equal(result.body.capabilities.writesAllowed, false);
      assert.equal(result.body.capabilities.modelExecutionAllowed, false);
      assert.equal(result.headers.get("cache-control"), "no-store");
    });
  }
  await withApp(createApp(config), async (request) => {
    for (const path of ["/api/workspace/overview?fixture=1", "/api/workspace/works?mode=fixture", "/api/workspace/works/DEMO-W001?fixture=1"]) {
      const result = await request(path);
      assert.equal(result.status, 503);
      assert.equal(result.body.error.code, "database_not_configured");
      assert.equal(JSON.stringify(result.body).includes("海边来信"), false);
    }
    assert.equal((await request("/health")).status, 200);
  });
});

test("formal workspace projects only existing M1 fields and never fabricates cash or forecast", async () => {
  const rows = [
    { id: "900001", completeness: { missingBasicInfoRecord: true, missingCoreFields: false, missingClassification: false } },
    { id: "900002", completeness: { missingBasicInfoRecord: false, missingCoreFields: false, missingClassification: false } }
  ];
  const app = createApp(config, {
    listWorks: async (_config, pagination) => ({ items: rows, pagination: { ...pagination, total: 2 } }),
    getWorkById: async (_config, id) => rows.find((row) => row.id === id) ?? null
  });
  await withApp(app, async (request) => {
    const list = await request("/api/workspace/works?search=900001&dataStatus=needs_review&pageSize=6");
    assert.equal(list.status, 200);
    assert.equal(list.body.pagination.total, 1);
    const item = list.body.items[0];
    assert.equal(item.id, "900001");
    for (const field of ["workName", "authorName", "category", "completeBillMonths", "channelCount", "salesShareCash12Months", "cashType"]) assert.equal(item[field], null);
    assert.equal(item.businessStatus, "unknown");
    const detail = await request("/api/workspace/works/900002");
    assert.equal(detail.body.item.dataStatus, "unknown");
    assert.equal(detail.body.item.monthlyCash, null);
    assert.equal(detail.body.item.channels, null);
    assert.deepEqual(detail.body.item.predictions.map((row) => row.horizonMonths), [3, 6, 12, 36]);
    assert.ok(detail.body.item.predictions.every((row) => row.pointEstimate === null && row.status === "NOT_GENERATED"));
    assert.equal((await request("/api/workspace/works/missing")).status, 404);
    const overview = await request("/api/workspace/overview");
    assert.equal(overview.body.summary.workCount, 2);
    assert.equal(overview.body.summary.needsMasterDataCount, 1);
    assert.equal(overview.body.summary.salesShareCash12MonthsTotal, null);
    assert.equal(overview.body.summary.completeBillWorkCount, null);
    assert.equal(overview.body.summary.channelReviewCount, null);
  });
});

test("workspace filtering searches all formal pages before paginating", async () => {
  const rows = Array.from({ length: 103 }, (_, index) => ({ id: `REAL-${index + 1}`, completeness: { missingClassification: index === 102 } }));
  const pagesRead = [];
  const app = createApp(config, {
    listWorks: async (_config, pagination) => {
      pagesRead.push(pagination.page);
      const start = (pagination.page - 1) * pagination.pageSize;
      return { items: rows.slice(start, start + pagination.pageSize), pagination: { ...pagination, total: rows.length } };
    }
  });
  await withApp(app, async (request) => {
    const result = await request("/api/workspace/works?search=REAL-103&pageSize=6");
    assert.deepEqual(pagesRead, [1, 2]);
    assert.equal(result.body.pagination.total, 1);
    assert.equal(result.body.items[0].id, "REAL-103");
  });
});

test("fixture list has 128 distinct examples, stable selected first page, and effective combined filters", async () => {
  await withApp(createFixtureApp(config), async (request) => {
    const first = await request("/api/workspace/works?pageSize=6");
    assert.equal(first.body.pagination.total, 128);
    assert.deepEqual(first.body.items.map((row) => row.id), ["DEMO-W001", "DEMO-W002", "DEMO-W003", "DEMO-W004", "DEMO-W005", "DEMO-W007"]);
    assert.deepEqual(first.body.items.map((row) => row.salesShareCash12Months), [286400, 194800, 126500, 98300, 42600, null]);
    const filtered = await request(`/api/workspace/works?search=${encodeURIComponent("江宁")}&category=${encodeURIComponent("文学小说")}&dataStatus=needs_review&businessStatus=needs_review&pageSize=6`);
    assert.equal(filtered.body.pagination.total, 1);
    assert.equal(filtered.body.items[0].id, "DEMO-W004");
    const none = await request(`/api/workspace/works?search=${encodeURIComponent("江宁")}&category=${encodeURIComponent("历史文化")}`);
    assert.deepEqual(none.body.items, []);
    assert.equal(none.body.pagination.total, 0);
    const second = await request("/api/workspace/works?page=2&pageSize=6");
    assert.equal(second.body.items.length, 6);
    assert.ok(second.body.items.every((row) => !first.body.items.some((firstRow) => firstRow.id === row.id)));
    assert.equal((await request("/api/workspace/works?businessStatus=outside_scope")).body.items.every((row) => row.cashType === "pure_buyout"), true);
  });
});

test("overview totals and distributions reconcile to the full synthetic population", async () => {
  await withApp(createFixtureApp(config), async (request) => {
    const one = await request("/api/workspace/works?pageSize=100");
    const two = await request("/api/workspace/works?page=2&pageSize=100");
    const items = [...one.body.items, ...two.body.items];
    const overview = (await request("/api/workspace/overview")).body;
    assert.equal(new Set(items.map((item) => item.id)).size, 128);
    assert.equal(overview.summary.workCount, items.length);
    assert.equal(overview.summary.salesShareCash12MonthsTotal, items.reduce((sum, item) => sum + (item.salesShareCash12Months ?? 0), 0));
    assert.equal(overview.summary.completeBillWorkCount, items.filter((item) => item.completeBillMonths >= 3).length);
    assert.equal(overview.summary.channelReviewCount, items.filter((item) => item.reviewReason).length);
    assert.equal(overview.summary.knownCashWorkCount + overview.summary.unknownCashWorkCount + overview.summary.outsideScopeCashWorkCount, items.length);
    for (const field of ["categoryDistribution", "dataStatusDistribution", "businessStatusDistribution"]) {
      assert.equal(overview[field].reduce((sum, row) => sum + row.count, 0), items.length);
    }
  });
});

test("detail cash history conserves known amounts; incomplete history and buyout remain null", async () => {
  await withApp(createFixtureApp(config), async (request) => {
    const items = [
      ...(await request("/api/workspace/works?pageSize=100")).body.items,
      ...(await request("/api/workspace/works?page=2&pageSize=100")).body.items
    ];
    for (const row of items) {
      const { item } = (await request(`/api/workspace/works/${row.id}`)).body;
      assert.equal(item.monthlyCash.length, 12);
      assert.equal(item.monthlyCash[0].month, "2025-10");
      assert.equal(item.monthlyCash[11].month, "2026-09");
      assert.ok(item.predictions.every((prediction) => prediction.pointEstimate === null));
      if (item.cashType === "pure_buyout") {
        assert.ok(item.monthlyCash.every((month) => month.amount === null && month.observationStatus === "OUTSIDE_SCOPE"));
        assert.ok(item.predictions.every((prediction) => prediction.status === "ABSTAINED" && prediction.reason === "buyout_outside_m2_forecast_scope"));
      } else {
        assert.equal(item.monthlyCash.reduce((sum, month) => sum + (month.amount ?? 0), 0), item.salesShareCash12Months);
        assert.equal(item.monthlyCash.filter((month) => month.amount !== null).length, Math.min(12, item.completeBillMonths));
      }
    }
    const first = (await request("/api/workspace/works/DEMO-W001")).body.item;
    assert.deepEqual(first.monthlyCash.slice(-6).map((month) => month.amount), [14000, 18000, 17000, 22000, 25000, 29000]);
    const immature = (await request("/api/workspace/works/DEMO-W005")).body.item;
    assert.equal(immature.businessStatus, "insufficient_history");
    assert.ok(immature.monthlyCash.slice(0, 10).every((month) => month.amount === null));
  });
});

test("workspace endpoints reject invalid filters, invalid pagination, unknown IDs, and writes", async () => {
  await withApp(createFixtureApp(config), async (request) => {
    for (const query of ["page=0", "pageSize=101", "pageSize=x", "dataStatus=approved", "businessStatus=production", "unknown=yes"]) {
      assert.equal((await request(`/api/workspace/works?${query}`)).status, 400);
    }
    assert.equal((await request("/api/workspace/works/DOES-NOT-EXIST")).status, 404);
    assert.equal((await request("/api/workspace/works", { method: "POST", body: "{}" })).status, 404);
  });
});

test("public research and bounded sources are readable without database in both compositions", async () => {
  for (const factory of [createApp, createFixtureApp]) {
    await withApp(factory(config), async (request) => {
      const summary = await request("/api/m2/public/research-summary");
      assert.equal(summary.status, 200);
      assert.equal(summary.body.dataKind, "PUBLIC_FROZEN_RESEARCH");
      assert.equal(summary.body.permissions.production, false);
      const source = await request("/api/m2/public/research-sources/registry");
      assert.equal(source.status, 200);
      assert.equal(source.body.schema, "m2.model_registry.v1");
      assert.equal((await request("/api/m2/public/research-sources/unknown")).status, 404);
      assert.equal((await request("/api/m2/public/research-sources/%2E%2E%2Fprivate" )).status, 404);
    });
  }
});
