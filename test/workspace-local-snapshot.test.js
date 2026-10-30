import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import http from "node:http";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { loadConfig } from "../src/config.js";
import { createApp } from "../src/http/app.js";
import { createFixtureApp } from "../src/http/fixtureApp.js";
import { createWorkspaceLocalSnapshotLoader } from "../src/repositories/workspaceLocalSnapshot.js";
import { createWorkspaceRepository } from "../src/repositories/workspaceRepository.js";
import { listenOnFetchSafePort } from "./helpers/listenOnFetchSafePort.js";

const digest = (text) => createHash("sha256").update(text).digest("hex");

function work(id, cashType = "sales_share") {
  const outside = cashType === "pure_buyout";
  const monthlyCash = Array.from({ length: 13 }, (_, index) => ({
    month: `${2025 + Math.floor((4 + index) / 12)}-${String(((4 + index) % 12) + 1).padStart(2, "0")}`,
    amount: outside || index === 0 ? null : index === 11 ? -50 : index === 12 ? 700 : 100,
    complete: index < 12,
    observationStatus: outside ? "OUTSIDE_SCOPE" : index === 0 ? "NOT_OBSERVED" : "OBSERVED_POSTING"
  }));
  return {
    id, standardWorkId: id, syntheticOnly: false,
    workName: `合成只读档案 ${id}`, authorName: "合成测试作者", category: "合成分类",
    completeBillMonths: outside ? 1 : 11, channelCount: 1,
    salesShareCash12Months: outside ? null : 950, cashType,
    dataStatus: "needs_review", businessStatus: outside ? "outside_scope" : "needs_review",
    completeness: { missingBasicInfoRecord: false, missingCoreFields: false, missingClassification: false },
    cashCoverage: { observedMonths: outside ? 0 : 11, expectedMonths: 12 },
    monthlyCash,
    channels: [{ uid: "synthetic-channel", name: "合成渠道", amount: outside ? null : 950, canonical: false }],
    qualityIssues: [{ code: "MAPPING_PENDING", messageZh: "合成候选映射未应用", severity: "warning", field: "id", status: "pending", sourceLabel: "合成测试" }],
    reviewReason: "合成渠道待核对",
    buyoutAudit: { cash12Months: cashType === "mixed" ? 6000 : outside ? 900 : null, totalCash: cashType === "mixed" ? 6000 : outside ? 900 : null, recordCount: cashType === "sales_share" ? 0 : 1, notForecastCash: true },
    categoryPath: ["合成分类"], businessForms: ["有声版权"], rawWorkIds: [id],
    rightsStartDate: null, rightsEndDate: null, firstSalesMonth: "2025-06", productStatus: null,
    notices: ["本文件仅为合成测试资料"],
    secretPath: "MUST_NOT_BE_PROJECTED", predictions: [{ horizonMonths: 3, pointEstimate: 99999 }]
  };
}

async function prepare(t) {
  const root = await mkdtemp(join(tmpdir(), "workspace-snapshot-test-"));
  t.after(async () => {
    assert.ok(resolve(root).startsWith(resolve(tmpdir(), "workspace-snapshot-test-")));
    await rm(root, { recursive: true, force: true });
  });
  await mkdir(join(root, "data/private-input"), { recursive: true });
  await mkdir(join(root, "data/private-output/workspace"), { recursive: true });
  const sourcePath = "data/private-input/synthetic-source.txt";
  const source = join(root, sourcePath);
  const contents = "SYNTHETIC ONLY source authority";
  await writeFile(source, contents);
  const info = await stat(source, { bigint: true });
  const sources = [{ role: "total-ledger-authority", path: sourcePath, sha256: digest(contents), size: Number(info.size), mtimeNs: info.mtimeNs.toString() }];
  for (const role of ["sales-share-ledger-authority", "buyout-ledger-authority", "user-reviewed-channel-master"]) {
    const path = `data/private-input/${role}.txt`;
    await writeFile(join(root, path), contents);
    const sourceInfo = await stat(join(root, path), { bigint: true });
    sources.push({ role, path, sha256: digest(contents), size: Number(sourceInfo.size), mtimeNs: sourceInfo.mtimeNs.toString() });
  }
  const sourceDirectoryInfo = await stat(join(root, "data/private-input"), { bigint: true });
  await mkdir(join(root, "data/mapping-candidates"));
  const mappingDirectoryInfo = await stat(join(root, "data/mapping-candidates"), { bigint: true });
  const payload = {
    generatedAt: "2026-10-30T00:00:00Z",
    dataset: {
      mode: "formal", source: "local-reviewed-ledger-snapshot", syntheticOnly: false,
      notForFormalDecision: true, cashAuthorityVerified: true,
      cutoffMonth: "2026-04", cashPeriodStart: "2025-05", billMaxMonth: "2026-05",
      sourceLabelZh: "合成测试快照", identityStatusLabelZh: "候选映射未应用",
      cashDefinitionLabelZh: "已记录分成现金，负数保留发生月"
    },
    authorityChecks: { schemaEqual: true, splitTypePure: true, noSplitOverlap: true, rowMultisetConserved: true, amountConserved: true, monthlyRowCountConserved: true, monthlyAmountConserved: true },
    sources,
    sourceDirectories: [
      { role: "master-data-directory", path: "data/private-input", mtimeNs: sourceDirectoryInfo.mtimeNs.toString(), entries: (await readdir(join(root, "data/private-input"))).sort() },
      { role: "work-mapping-directory", path: "data/mapping-candidates", mtimeNs: mappingDirectoryInfo.mtimeNs.toString(), entries: [] }
    ],
    items: [work("101"), work("102", "mixed"), work("103", "pure_buyout")]
  };
  const snapshotPath = join(root, "data/private-output/workspace/current.json");
  async function save(value = payload) {
    const payloadJson = JSON.stringify(value);
    await writeFile(snapshotPath, JSON.stringify({ schema: "workspace.local-readonly.v1", payloadJson, sha256: digest(payloadJson) }));
  }
  await save();
  return { root, source, payload, snapshotPath, save, config: loadConfig({ M1_APP_ENV: "test", M1_WORKSPACE_SOURCE: "local_snapshot", M1_WORKSPACE_SOURCE_ROOT: root }) };
}

async function withApp(app, callback) {
  const server = http.createServer(app);
  const port = await listenOnFetchSafePort(server);
  try {
    await callback(async (path, options) => {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, options);
      return { status: response.status, headers: response.headers, body: await response.json() };
    });
  } finally {
    await new Promise((resolvePromise) => server.close(resolvePromise));
  }
}

test("local source projects reviewed fields without reading a database or generating forecasts", async (t) => {
  const { config } = await prepare(t);
  const failDatabase = () => { throw new Error("database must not be used"); };
  await withApp(createApp(config, { listWorks: failDatabase, getWorkById: failDatabase }), async (request) => {
    const context = await request("/api/workspace/context?mode=fixture&fixture=1");
    assert.equal(context.body.dataset.sourceStatus, "READY");
    assert.equal(context.body.capabilities.cashAuthorityVerified, true);
    assert.equal(context.body.capabilities.modelExecutionAllowed, false);
    const list = await request("/api/workspace/works?search=102&pageSize=1");
    assert.equal(list.status, 200);
    assert.equal(list.body.pagination.total, 1);
    assert.equal(list.body.items[0].id, "102");
    assert.equal(list.body.items[0].salesShareCash12Months, 950);
    assert.equal(list.body.items[0].buyoutAudit.cash12Months, 6000);
    const detail = await request("/api/workspace/works/101");
    assert.equal(detail.body.item.monthlyCash[0].amount, null);
    assert.equal(detail.body.item.monthlyCash[11].amount, -50);
    assert.equal(detail.body.item.monthlyCash[12].complete, false);
    assert.ok(detail.body.item.predictions.every((row) => row.pointEstimate === null));
    assert.equal(JSON.stringify(detail.body).includes("MUST_NOT_BE_PROJECTED"), false);
    assert.equal(JSON.stringify(detail.body).includes("private-input"), false);
    const buyout = await request("/api/workspace/works/103");
    assert.ok(buyout.body.item.predictions.every((row) => row.status === "ABSTAINED"));
    const overview = await request("/api/workspace/overview");
    assert.equal(overview.body.summary.salesShareCash12MonthsTotal, 1900);
    assert.equal(overview.body.summary.completeBillWorkCount, 2);
    assert.equal(overview.body.summary.channelReviewCount, 3);
    assert.equal((await request("/api/workspace/works/missing")).status, 404);
    assert.equal((await request("/api/workspace/works", { method: "POST", body: "{}" })).status, 404);
  });
  await withApp(createFixtureApp(config), async (request) => {
    assert.equal((await request("/api/workspace/context")).body.dataset.mode, "fixture");
  });
});

test("missing local snapshot leaves context and health available but never falls back", async (t) => {
  const { config, root, snapshotPath } = await prepare(t);
  await rm(snapshotPath);
  await withApp(createApp(config, { listWorks: () => { throw new Error("fallback forbidden"); } }), async (request) => {
    const context = await request("/api/workspace/context");
    assert.equal(context.status, 200);
    assert.equal(context.body.dataset.sourceStatus, "UNAVAILABLE");
    assert.equal(context.body.capabilities.cashAuthorityVerified, false);
    for (const path of ["/api/workspace/overview", "/api/workspace/works?fixture=1", "/api/workspace/works/101"]) {
      const result = await request(path);
      assert.equal(result.status, 503);
      assert.equal(result.body.error.code, "workspace_snapshot_missing");
      assert.equal(JSON.stringify(result.body).includes(root), false);
    }
    assert.equal((await request("/health")).status, 200);
  });
});

test("derived integrity and cash reconciliation reject corrupt snapshots", async (t) => {
  const fixture = await prepare(t);
  const original = structuredClone(fixture.payload);
  const load = createWorkspaceLocalSnapshotLoader();
  const envelope = JSON.parse(await readFile(fixture.snapshotPath, "utf8"));
  envelope.sha256 = "0".repeat(64);
  await writeFile(fixture.snapshotPath, JSON.stringify(envelope));
  await assert.rejects(load(fixture.config), { code: "workspace_snapshot_invalid" });
  for (const mutate of [
    (payload) => { payload.items[0].salesShareCash12Months = 951; },
    (payload) => { payload.items[0].channels[0].amount = 951; },
    (payload) => { payload.items[0].monthlyCash[1].amount = "100"; },
    (payload) => { payload.items[0].cashCoverage.observedMonths = 12; },
    (payload) => { payload.items.push(payload.items[0]); },
    (payload) => { payload.dataset.cashAuthorityVerified = false; },
    (payload) => { payload.authorityChecks.amountConserved = false; },
    (payload) => { payload.sources[0].role = "unrelated-input"; },
    (payload) => { payload.sourceDirectories.pop(); },
    (payload) => { payload.items[2].monthlyCash[0].amount = 0; }
  ]) {
    const payload = structuredClone(original);
    mutate(payload);
    await fixture.save(payload);
    await assert.rejects(load(fixture.config), { code: "workspace_snapshot_invalid" });
  }
});

test("source hashes are checked on first load and later source changes disable the cached snapshot", async (t) => {
  const fixture = await prepare(t);
  const load = createWorkspaceLocalSnapshotLoader();
  const first = await load(fixture.config);
  first.items[0].workName = "mutated returned object";
  assert.notEqual((await load(fixture.config)).items[0].workName, "mutated returned object");
  await writeFile(fixture.source, "changed synthetic source");
  await assert.rejects(load(fixture.config), { code: "workspace_snapshot_stale" });
  const info = await stat(fixture.source, { bigint: true });
  fixture.payload.sources[0].size = Number(info.size);
  fixture.payload.sources[0].mtimeNs = info.mtimeNs.toString();
  await fixture.save();
  await assert.rejects(createWorkspaceLocalSnapshotLoader()(fixture.config), { code: "workspace_snapshot_stale" });
  fixture.payload.sources[0].sha256 = digest(await readFile(fixture.source));
  await fixture.save();
  assert.equal((await load(fixture.config)).items.length, 3);
});

test("source and snapshot symlinks cannot escape the configured private root", async (t) => {
  const fixture = await prepare(t);
  const outside = await mkdtemp(join(tmpdir(), "workspace-snapshot-test-outside-"));
  t.after(async () => { assert.ok(resolve(outside).startsWith(resolve(tmpdir(), "workspace-snapshot-test-outside-"))); await rm(outside, { recursive: true, force: true }); });
  await writeFile(join(outside, "source.txt"), "outside synthetic data");
  await symlink(outside, join(fixture.root, "data/escape"), process.platform === "win32" ? "junction" : "dir");
  fixture.payload.sources[0].path = "data/escape/source.txt";
  await fixture.save();
  await assert.rejects(createWorkspaceLocalSnapshotLoader()(fixture.config), { code: "workspace_snapshot_invalid" });
  fixture.payload.sources[0].path = "../source.txt";
  await fixture.save();
  await assert.rejects(createWorkspaceLocalSnapshotLoader()(fixture.config), { code: "workspace_snapshot_invalid" });
  await rm(join(fixture.root, "data/private-output/workspace"), { recursive: true });
  await writeFile(join(outside, "current.json"), "{}");
  await symlink(outside, join(fixture.root, "data/private-output/workspace"), process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(createWorkspaceLocalSnapshotLoader()(fixture.config), { code: "workspace_snapshot_invalid" });
});

test("source mutation with restored mtime is still noticed by ctime after an initial verified load", async (t) => {
  const fixture = await prepare(t);
  const load = createWorkspaceLocalSnapshotLoader();
  await load(fixture.config);
  const before = await stat(fixture.source);
  const original = await readFile(fixture.source, "utf8");
  await writeFile(fixture.source, original.replace("SYNTHETIC", "ALTERED!!"));
  await utimes(fixture.source, before.atime, before.mtime);
  await assert.rejects(load(fixture.config), { code: "workspace_snapshot_stale" });
});

test("adding a new file to an authority directory invalidates an otherwise unchanged snapshot", async (t) => {
  const fixture = await prepare(t);
  const load = createWorkspaceLocalSnapshotLoader();
  await load(fixture.config);
  await writeFile(join(fixture.root, "data/private-input/new-mapping.txt"), "new synthetic candidate");
  await assert.rejects(load(fixture.config), { code: "workspace_snapshot_stale" });
});
