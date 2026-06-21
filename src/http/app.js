import crypto from "node:crypto";
import { checkDatabaseHealth } from "../db/health.js";
import { AppError, badRequest, formalDataBlocked, notFound, publicErrorBody } from "../errors.js";
import { parsePagination, parsePositiveInteger } from "./pagination.js";
import { listJobs, getJobById } from "../repositories/jobRepository.js";
import {
  listMappingVersions,
  getMappingVersionById
} from "../repositories/mappingVersionRepository.js";
import {
  getM2OldProductEvaluationById,
  getM2OldProductEvaluationOverview,
  getM2OldProductBacktestById,
  listM2OldProductAlgorithmVersions,
  listM2OldProductBacktests,
  listM2OldProductEvaluations,
  listM2OldProductReadinessGaps
} from "../repositories/oldProductEvaluationFixtureRepository.js";
import {
  getM2BlockingReviewItemById,
  listM2BlockingReviewItems,
  simulateM2BlockingReviewAction
} from "../repositories/m2BlockingReviewFixtureRepository.js";
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
    getJobById: options.getJobById ?? getJobById,
    getM2OldProductEvaluationOverview:
      options.getM2OldProductEvaluationOverview ?? getM2OldProductEvaluationOverview,
    listM2OldProductEvaluations:
      options.listM2OldProductEvaluations ?? listM2OldProductEvaluations,
    getM2OldProductEvaluationById:
      options.getM2OldProductEvaluationById ?? getM2OldProductEvaluationById,
    listM2OldProductReadinessGaps:
      options.listM2OldProductReadinessGaps ?? listM2OldProductReadinessGaps,
    listM2OldProductAlgorithmVersions:
      options.listM2OldProductAlgorithmVersions ?? listM2OldProductAlgorithmVersions,
    listM2OldProductBacktests: options.listM2OldProductBacktests ?? listM2OldProductBacktests,
    getM2OldProductBacktestById:
      options.getM2OldProductBacktestById ?? getM2OldProductBacktestById,
    listM2BlockingReviewItems:
      options.listM2BlockingReviewItems ?? listM2BlockingReviewItems,
    getM2BlockingReviewItemById:
      options.getM2BlockingReviewItemById ?? getM2BlockingReviewItemById,
    simulateM2BlockingReviewAction:
      options.simulateM2BlockingReviewAction ?? simulateM2BlockingReviewAction
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

      if (path.startsWith("/api/m2/formal-readiness/reviews")) {
        blockFormalM2Mode(request, url);

        if (request.method === "GET" && path === "/api/m2/formal-readiness/reviews") {
          const pagination = parsePagination(url.searchParams);
          const body = await repositories.listM2BlockingReviewItems(config, {
            pagination,
            searchParams: url.searchParams
          });
          sendJson(response, 200, body, requestId);
          return;
        }

        const reviewActionMatch = path.match(
          /^\/api\/m2\/formal-readiness\/reviews\/([^/]+)\/actions$/
        );
        if (request.method === "POST" && reviewActionMatch) {
          const reviewItemId = decodeURIComponent(reviewActionMatch[1]);
          const payload = await readJsonBody(request);
          const body = await repositories.simulateM2BlockingReviewAction(
            config,
            reviewItemId,
            payload
          );
          if (!body) {
            throw notFound("Blocking review item");
          }
          sendJson(response, 200, body, requestId);
          return;
        }

        const reviewMatch = path.match(/^\/api\/m2\/formal-readiness\/reviews\/([^/]+)$/);
        if (request.method === "GET" && reviewMatch) {
          const reviewItemId = decodeURIComponent(reviewMatch[1]);
          const body = await repositories.getM2BlockingReviewItemById(config, reviewItemId);
          if (!body) {
            throw notFound("Blocking review item");
          }
          sendJson(response, 200, body, requestId);
          return;
        }
      }

      if (path.startsWith("/api/m2/old-products")) {
        blockFormalM2Mode(request, url);

        if (
          request.method === "GET" &&
          path === "/api/m2/old-products/evaluations/overview"
        ) {
          const body = await repositories.getM2OldProductEvaluationOverview(config);
          sendJson(response, 200, body, requestId);
          return;
        }

        if (request.method === "GET" && path === "/api/m2/old-products/evaluations") {
          const pagination = parsePagination(url.searchParams);
          const body = await repositories.listM2OldProductEvaluations(config, {
            pagination,
            searchParams: url.searchParams
          });
          sendJson(response, 200, body, requestId);
          return;
        }

        const oldProductEvaluationMatch = path.match(
          /^\/api\/m2\/old-products\/evaluations\/([^/]+)$/
        );
        if (request.method === "GET" && oldProductEvaluationMatch) {
          const standardWorkId = decodeURIComponent(oldProductEvaluationMatch[1]);
          const body = await repositories.getM2OldProductEvaluationById(config, standardWorkId);
          if (!body) {
            throw notFound("Old product evaluation");
          }
          sendJson(response, 200, body, requestId);
          return;
        }

        if (request.method === "GET" && path === "/api/m2/old-products/readiness-gaps") {
          const pagination = parsePagination(url.searchParams);
          const body = await repositories.listM2OldProductReadinessGaps(config, {
            pagination,
            searchParams: url.searchParams
          });
          sendJson(response, 200, body, requestId);
          return;
        }

        if (
          request.method === "GET" &&
          path === "/api/m2/old-products/algorithm-versions"
        ) {
          const body = await repositories.listM2OldProductAlgorithmVersions(config);
          sendJson(response, 200, body, requestId);
          return;
        }

        if (request.method === "GET" && path === "/api/m2/old-products/backtests") {
          const pagination = parsePagination(url.searchParams);
          const body = await repositories.listM2OldProductBacktests(config, {
            pagination,
            searchParams: url.searchParams
          });
          sendJson(response, 200, body, requestId);
          return;
        }

        const oldProductBacktestMatch = path.match(
          /^\/api\/m2\/old-products\/backtests\/([^/]+)$/
        );
        if (request.method === "GET" && oldProductBacktestMatch) {
          const backtestBatchId = decodeURIComponent(oldProductBacktestMatch[1]);
          const body = await repositories.getM2OldProductBacktestById(config, backtestBatchId);
          if (!body) {
            throw notFound("Old product backtest");
          }
          sendJson(response, 200, body, requestId);
          return;
        }
      }

      throw notFound("Route");
    } catch (error) {
      const statusCode = error instanceof AppError ? error.statusCode : 500;
      sendJson(response, statusCode, publicErrorBody(error, requestId), requestId);
    }
  };
}

function blockFormalM2Mode(request, url) {
  const requestedMode =
    url.searchParams.get("mode") ??
    request.headers["x-m2-mode"] ??
    request.headers["x-evaluation-mode"] ??
    request.headers["x-mode"];

  if (String(requestedMode ?? "").toLowerCase() === "formal") {
    throw formalDataBlocked();
  }
}

async function readJsonBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 10_000) {
      throw badRequest("request body is too large");
    }
  }

  if (body.trim() === "") {
    return {};
  }

  try {
    return JSON.parse(body);
  } catch {
    throw badRequest("request body must be valid JSON");
  }
}
