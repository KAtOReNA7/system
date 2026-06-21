import crypto from "node:crypto";
import { checkDatabaseHealth } from "../db/health.js";
import { AppError, notFound, publicErrorBody } from "../errors.js";
import { parsePagination, parsePositiveInteger } from "./pagination.js";
import { listJobs, getJobById } from "../repositories/jobRepository.js";
import {
  listMappingVersions,
  getMappingVersionById
} from "../repositories/mappingVersionRepository.js";
import { getSystemStatus } from "../repositories/systemRepository.js";
import { getWorkById, listWorks } from "../repositories/workRepository.js";
import { serveAdminAsset } from "./staticAdmin.js";

function sendJson(response, statusCode, body, requestId) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-request-id": requestId
  });
  response.end(JSON.stringify(body));
}

function routeUrl(request) {
  return new URL(request.url ?? "/", "http://127.0.0.1");
}

export function createApp(config, options = {}) {
  const dbHealthChecker = options.dbHealthChecker ?? checkDatabaseHealth;
  const repositories = {
    getSystemStatus: options.getSystemStatus ?? getSystemStatus,
    listWorks: options.listWorks ?? listWorks,
    getWorkById: options.getWorkById ?? getWorkById,
    listMappingVersions: options.listMappingVersions ?? listMappingVersions,
    getMappingVersionById: options.getMappingVersionById ?? getMappingVersionById,
    listJobs: options.listJobs ?? listJobs,
    getJobById: options.getJobById ?? getJobById
  };

  return async function app(request, response) {
    const requestId = crypto.randomUUID();
    try {
      const url = routeUrl(request);
      const path = url.pathname;
      if (await serveAdminAsset(request, response, path)) {
        return;
      }

      if (request.method === "GET" && path === "/health") {
        sendJson(response, 200, {
          status: "ok",
          service: config.service,
          environment: config.appEnv
        }, requestId);
        return;
      }

      if (request.method === "GET" && path === "/health/db") {
        const body = await dbHealthChecker(config);
        sendJson(response, body.status === "ok" ? 200 : 503, {
          service: config.service,
          ...body
        }, requestId);
        return;
      }

      if (request.method === "GET" && path === "/api/system/status") {
        const system = await repositories.getSystemStatus(config);
        sendJson(response, 200, { status: "ok", system }, requestId);
        return;
      }

      if (request.method === "GET" && path === "/api/works") {
        const pagination = parsePagination(url.searchParams);
        const body = await repositories.listWorks(config, pagination);
        sendJson(response, 200, body, requestId);
        return;
      }

      const workMatch = path.match(/^\/api\/works\/([^/]+)$/);
      if (request.method === "GET" && workMatch) {
        const id = decodeURIComponent(workMatch[1]);
        const item = await repositories.getWorkById(config, id);
        if (!item) {
          throw notFound("Work");
        }
        sendJson(response, 200, { item }, requestId);
        return;
      }

      if (request.method === "GET" && path === "/api/mapping-versions") {
        const pagination = parsePagination(url.searchParams);
        const body = await repositories.listMappingVersions(config, pagination);
        sendJson(response, 200, body, requestId);
        return;
      }

      const mappingMatch = path.match(/^\/api\/mapping-versions\/([^/]+)$/);
      if (request.method === "GET" && mappingMatch) {
        const id = parsePositiveInteger(decodeURIComponent(mappingMatch[1]), "id", undefined);
        const item = await repositories.getMappingVersionById(config, id);
        if (!item) {
          throw notFound("Mapping version");
        }
        sendJson(response, 200, { item }, requestId);
        return;
      }

      if (request.method === "GET" && path === "/api/jobs") {
        const pagination = parsePagination(url.searchParams);
        const body = await repositories.listJobs(config, pagination);
        sendJson(response, 200, body, requestId);
        return;
      }

      const jobMatch = path.match(/^\/api\/jobs\/([^/]+)$/);
      if (request.method === "GET" && jobMatch) {
        const id = parsePositiveInteger(decodeURIComponent(jobMatch[1]), "id", undefined);
        const item = await repositories.getJobById(config, id);
        if (!item) {
          throw notFound("Job");
        }
        sendJson(response, 200, { item }, requestId);
        return;
      }

      throw notFound("Route");
    } catch (error) {
      const statusCode = error instanceof AppError ? error.statusCode : 500;
      sendJson(response, statusCode, publicErrorBody(error, requestId), requestId);
    }
  };
}
