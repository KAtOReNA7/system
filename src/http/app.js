import { checkDatabaseHealth } from "../db/health.js";
import { publicErrorBody } from "../errors.js";

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(body));
}

function notFoundBody(config) {
  return {
    status: "not_found",
    service: config.service
  };
}

export function createApp(config, options = {}) {
  const dbHealthChecker = options.dbHealthChecker ?? checkDatabaseHealth;

  return async function app(request, response) {
    try {
      if (request.method === "GET" && request.url === "/health") {
        sendJson(response, 200, {
          status: "ok",
          service: config.service,
          environment: config.appEnv
        });
        return;
      }

      if (request.method === "GET" && request.url === "/health/db") {
        const body = await dbHealthChecker(config);
        sendJson(response, body.status === "ok" ? 200 : 503, {
          service: config.service,
          ...body
        });
        return;
      }

      sendJson(response, 404, notFoundBody(config));
    } catch (error) {
      sendJson(response, 500, publicErrorBody(error));
    }
  };
}
