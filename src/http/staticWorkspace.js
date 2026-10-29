import { readFile, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const WORKSPACE_ROOT = fileURLToPath(new URL("../../public/workspace/", import.meta.url));
const MIME_TYPES = new Map([
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".avif", "image/avif"],
  [".svg", "image/svg+xml"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
  [".ttf", "font/ttf"],
  [".otf", "font/otf"]
]);

function send(response, statusCode, contentType, body, method, size = Buffer.byteLength(body)) {
  response.writeHead(statusCode, {
    "content-type": contentType,
    "content-length": size,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  response.end(method === "HEAD" ? undefined : body);
}

function errorResponse(request, response, statusCode, message) {
  send(response, statusCode, "text/plain; charset=utf-8", message, request.method);
  return true;
}

function staysInside(root, target) {
  const path = relative(root, target);
  return path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

/** Serves the built hash-routed UI without exposing source or private files. */
export async function serveWorkspaceAsset(request, response, pathname) {
  if (pathname !== "/workspace" && !pathname.startsWith("/workspace/")) return false;
  if (request.method !== "GET" && request.method !== "HEAD") return false;

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return errorResponse(request, response, 400, "Invalid workspace asset path");
  }

  const indexRequest = ["/workspace", "/workspace/", "/workspace/index.html"].includes(decodedPath);
  const assetPath = indexRequest ? "index.html" : decodedPath.slice("/workspace/".length);
  const segments = assetPath.split("/");
  if (segments.some((part) => !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(part))) {
    return errorResponse(request, response, 400, "Invalid workspace asset path");
  }
  const contentType = indexRequest ? "text/html; charset=utf-8" : MIME_TYPES.get(extname(assetPath));
  if (!indexRequest && (!assetPath.startsWith("assets/") || !contentType)) {
    return errorResponse(request, response, 404, "Workspace asset not found");
  }

  let realRoot;
  try {
    realRoot = await realpath(WORKSPACE_ROOT);
    const indexFile = await realpath(resolve(realRoot, "index.html"));
    if (!staysInside(realRoot, indexFile) || !(await stat(indexFile)).isFile()) {
      return errorResponse(request, response, 503, "Workspace build is invalid; run npm run build:workspace");
    }
  } catch (error) {
    if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
    return errorResponse(request, response, 503, "工作台尚未构建。请先运行 npm run build:workspace。");
  }

  const target = resolve(realRoot, assetPath);
  if (!staysInside(realRoot, target)) {
    return errorResponse(request, response, 400, "Invalid workspace asset path");
  }
  try {
    const realTarget = await realpath(target);
    if (!staysInside(realRoot, realTarget)) {
      return errorResponse(request, response, 403, "Workspace asset is outside the build directory");
    }
    const file = await stat(realTarget);
    if (!file.isFile()) return errorResponse(request, response, 404, "Workspace asset not found");
    const body = request.method === "HEAD" ? "" : await readFile(realTarget);
    send(response, 200, contentType, body, request.method, file.size);
    return true;
  } catch (error) {
    if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
    return errorResponse(request, response, 404, "Workspace asset not found");
  }
}
