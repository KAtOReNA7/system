import http from "node:http";
import { loadConfig } from "./config.js";
import { createApp } from "./http/app.js";
import { publicErrorBody } from "./errors.js";

function start() {
  try {
    const config = loadConfig();
    const server = http.createServer(createApp(config));

    server.listen(config.port, "127.0.0.1", () => {
      console.log(
        JSON.stringify({
          status: "started",
          service: config.service,
          environment: config.appEnv,
          composition: "formal",
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

start();
