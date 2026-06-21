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
  assert.doesNotMatch(response.body, /<form/i);
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
  assert.doesNotMatch(js.body, /method:\s*["'`](POST|PUT|PATCH|DELETE)/i);
});

test("unknown admin assets return a static 404", async () => {
  const response = await request(createApp(baseConfig), "/admin/missing.js");

  assert.equal(response.statusCode, 404);
  assert.match(response.contentType, /text\/plain/);
  assert.equal(response.cacheControl, "no-store");
  assert.equal(response.body, "Admin asset not found");
});
