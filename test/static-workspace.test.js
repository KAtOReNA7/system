import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { copyFile, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

let fixtureRoot;
let serveWorkspaceAsset;
const html = "<!doctype html><title>工作台</title>";
const css = "body{color:#18211f}";

before(async () => {
  fixtureRoot = await mkdtemp(join(tmpdir(), "workspace-assets-"));
  await mkdir(join(fixtureRoot, "src/http"), { recursive: true });
  const modulePath = join(fixtureRoot, "src/http/staticWorkspace.mjs");
  await copyFile(new URL("../src/http/staticWorkspace.js", import.meta.url), modulePath);
  ({ serveWorkspaceAsset } = await import(pathToFileURL(modulePath).href));
});

after(async () => {
  const expectedPrefix = resolve(tmpdir(), "workspace-assets-");
  assert.ok(resolve(fixtureRoot).startsWith(expectedPrefix));
  await rm(fixtureRoot, { recursive: true, force: true });
});

async function request(path, method = "GET") {
  const result = {};
  const response = {
    writeHead(status, headers) { Object.assign(result, { status, headers }); },
    end(body) { result.body = body; }
  };
  result.handled = await serveWorkspaceAsset({ method }, response, path);
  return result;
}

test("workspace reports a missing build without breaking unrelated routes", async () => {
  const missing = await request("/workspace");
  assert.equal(missing.status, 503);
  assert.match(missing.body, /npm run build:workspace/);
  assert.equal(missing.headers["cache-control"], "no-store");
  assert.equal((await request("/workspace-other")).handled, false);
  assert.equal((await request("/admin")).handled, false);
  assert.equal((await request("/health")).handled, false);
  assert.equal((await request("/workspace", "POST")).handled, false);
});

test("workspace serves index aliases and built assets with correct HEAD semantics", async () => {
  await mkdir(join(fixtureRoot, "public/workspace/assets"), { recursive: true });
  await writeFile(join(fixtureRoot, "public/workspace/index.html"), html);
  await writeFile(join(fixtureRoot, "public/workspace/assets/app-123.css"), css);
  await writeFile(join(fixtureRoot, "public/workspace/assets/app-123.js"), "export const demo=true;");
  await writeFile(join(fixtureRoot, "public/workspace/assets/font-123.woff2"), "wOF2");
  for (const path of ["/workspace", "/workspace/", "/workspace/index.html"]) {
    const get = await request(path);
    assert.equal(get.status, 200);
    assert.equal(get.body.toString(), html);
    assert.equal(get.headers["content-type"], "text/html; charset=utf-8");
    const head = await request(path, "HEAD");
    assert.equal(head.status, 200);
    assert.equal(head.body, undefined);
    assert.equal(head.headers["content-length"], Buffer.byteLength(html));
  }
  const asset = await request("/workspace/assets/app-123.css");
  assert.equal(asset.body.toString(), css);
  assert.equal(asset.headers["content-type"], "text/css; charset=utf-8");
  assert.equal(asset.headers["x-content-type-options"], "nosniff");
  assert.equal(asset.headers["cache-control"], "no-store");
  assert.equal((await request("/workspace/assets/font-123.woff2")).headers["content-type"], "font/woff2");
  assert.equal((await request("/workspace/assets/app-123.js")).headers["content-type"], "text/javascript; charset=utf-8");
  const head = await request("/workspace/assets/app-123.css", "HEAD");
  assert.equal(head.body, undefined);
  assert.equal(head.headers["content-length"], Buffer.byteLength(css));
});

test("workspace rejects invalid paths and never rewrites missing assets to HTML", async () => {
  for (const path of [
    "/workspace/assets/../../package.json",
    "/workspace/assets/%2e%2e%2f%2e%2e%2fpackage.json",
    "/workspace/assets/%5c..%5cpackage.json",
    "/workspace/assets/app.js:stream",
    "/workspace/assets/%00.css",
    "/workspace/assets/%xx"
  ]) {
    assert.equal((await request(path)).status, 400, path);
  }
  for (const path of ["/workspace/source.jsx", "/workspace/assets/private.json", "/workspace/assets/missing.js"]) {
    const response = await request(path);
    assert.equal(response.status, 404, path);
    assert.equal(response.headers["content-type"], "text/plain; charset=utf-8");
  }
});

test("workspace rejects asset symlinks that escape its build directory", async () => {
  const outside = join(fixtureRoot, "outside");
  await mkdir(outside);
  await writeFile(join(outside, "private.css"), "private content");
  await symlink(outside, join(fixtureRoot, "public/workspace/assets/escape"), process.platform === "win32" ? "junction" : "dir");
  const response = await request("/workspace/assets/escape/private.css");
  assert.equal(response.status, 403);
  assert.doesNotMatch(response.body, /private content/);
});
