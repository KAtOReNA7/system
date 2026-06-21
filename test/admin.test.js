import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { createApp } from "../src/http/app.js";

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

async function request(app, path) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`);
    return {
      statusCode: response.status,
      contentType: response.headers.get("content-type"),
      cacheControl: response.headers.get("cache-control"),
      body: await response.text()
    };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("GET /admin serves the minimal read-only admin prototype", async () => {
  const response = await request(createApp(baseConfig), "/admin");

  assert.equal(response.statusCode, 200);
  assert.match(response.contentType, /text\/html/);
  assert.equal(response.cacheControl, "no-store");
  assert.match(response.body, /M1 最小管理端/);
  assert.match(response.body, /系统状态/);
  assert.match(response.body, /作品列表/);
  assert.match(response.body, /映射版本/);
  assert.match(response.body, /后台任务/);
  assert.match(response.body, /老品评估总览/);
  assert.match(response.body, /老品评估列表/);
  assert.match(response.body, /老品评估详情/);
  assert.match(response.body, /老品数据缺口/);
  assert.match(response.body, /回测与算法版本/);
  assert.doesNotMatch(response.body, /<form/i);
  assert.doesNotMatch(response.body, /evaluation-tasks/i);
  assert.doesNotMatch(response.body, /switch_mapping_version/i);
});

test("admin assets are served without using API routes", async () => {
  const app = createApp(baseConfig);
  const css = await request(app, "/admin/app.css");
  const js = await request(app, "/admin/app.js");

  assert.equal(css.statusCode, 200);
  assert.match(css.contentType, /text\/css/);
  assert.match(css.body, /\.app-shell/);

  assert.equal(js.statusCode, 200);
  assert.match(js.contentType, /text\/javascript/);
  assert.match(js.body, /\/api\/system\/status/);
  assert.match(js.body, /\/api\/works/);
  assert.match(js.body, /\/api\/mapping-versions/);
  assert.match(js.body, /\/api\/jobs/);
  assert.match(js.body, /生命周期状态/);
  assert.match(js.body, /数据库未配置/);
  assert.match(js.body, /不等同于空库/);
  assert.match(js.body, /小屏幕下可横向滚动查看完整列/);
  assert.match(js.body, /未提供表示当前 API 尚未返回标准作品名称/);
  assert.match(js.body, /\/api\/m2\/old-products\/evaluations\/overview/);
  assert.match(js.body, /\/api\/m2\/old-products\/evaluations/);
  assert.match(js.body, /\/api\/m2\/old-products\/readiness-gaps/);
  assert.match(js.body, /\/api\/m2\/old-products\/algorithm-versions/);
  assert.match(js.body, /\/api\/m2\/old-products\/backtests/);
  assert.match(js.body, /Formal old-product evaluation is blocked/);
  assert.match(js.body, /fixture-only/);
  assert.match(js.body, /synthetic marker/);
  assert.match(js.body, /2026-05 excluded/);
  assert.match(js.body, /Reset filters/);
  assert.match(js.body, /View detail/);
  assert.match(js.body, /Filter gaps/);
  assert.match(js.body, /Show batch detail/);
  assert.match(js.body, /Formal backtest blocked/);
  assert.doesNotMatch(js.body, /method:\s*["'`](POST|PUT|PATCH|DELETE)/i);
  assert.doesNotMatch(js.body, /evaluation-tasks/i);
  assert.doesNotMatch(js.body, /switch_mapping_version/i);
  assert.doesNotMatch(js.body, /export formal result/i);
});

test("unknown admin assets return a static 404", async () => {
  const response = await request(createApp(baseConfig), "/admin/missing.js");

  assert.equal(response.statusCode, 404);
  assert.match(response.contentType, /text\/plain/);
  assert.equal(response.cacheControl, "no-store");
  assert.equal(response.body, "Admin asset not found");
});
