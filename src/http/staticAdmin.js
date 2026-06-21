import { readFile } from "node:fs/promises";

const ADMIN_ASSETS = new Map([
  ["/admin", { file: "index.html", contentType: "text/html; charset=utf-8" }],
  ["/admin/", { file: "index.html", contentType: "text/html; charset=utf-8" }],
  ["/admin/app.css", { file: "app.css", contentType: "text/css; charset=utf-8" }],
  ["/admin/app.js", { file: "app.js", contentType: "text/javascript; charset=utf-8" }]
]);

function adminAssetUrl(file) {
  return new URL(`../../public/admin/${file}`, import.meta.url);
}

function send(response, statusCode, contentType, body, method) {
  response.writeHead(statusCode, {
    "content-type": contentType,
    "cache-control": "no-store"
  });
  response.end(method === "HEAD" ? undefined : body);
}

export async function serveAdminAsset(request, response, pathname) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return false;
  }

  if (!pathname.startsWith("/admin")) {
    return false;
  }

  const asset = ADMIN_ASSETS.get(pathname);
  if (!asset) {
    send(response, 404, "text/plain; charset=utf-8", "Admin asset not found", request.method);
    return true;
  }

  const body = await readFile(adminAssetUrl(asset.file));
  send(response, 200, asset.contentType, body, request.method);
  return true;
}
