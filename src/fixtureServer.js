import http from "node:http";
import { loadConfig } from "./config.js";
import { createFixtureApp } from "./http/fixtureApp.js";
import { publicErrorBody } from "./errors.js";

function startFixtureServer() {
  try {
    const config = loadConfig();
    const server = http.createServer(createFixtureApp(config));

    server.listen(config.port, "127.0.0.1", () => {
      console.log(
        JSON.stringify({
          status: "started",
          service: config.service,
          environment: config.appEnv,
          composition: "fixture",
          host: "127.0.0.1",
          port: config.port
        })
      );
    });
  } catch (error) {
    console.error(JSON.stringify(publicErrorBody(error)));
    process.exitCode = 1;
  }
}

startFixtureServer();
