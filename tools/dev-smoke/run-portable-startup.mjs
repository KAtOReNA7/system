import { spawn } from "node:child_process";
import net from "node:net";

const HOST = "127.0.0.1";
const START_TIMEOUT_MS = 10_000;
const PRIVATE_FREE_ENV = {
  M1_APP_ENV: "ci",
  M1_DATABASE_URL: "",
  M1_DATABASE_READONLY_URL: "",
  M1_DATABASE_BACKGROUND_URL: "",
  DATABASE_URL: "",
  PGHOST: "",
  PGPORT: "",
  PGDATABASE: "",
  PGUSER: "",
  PGPASSWORD: "",
  OPENAI_API_KEY: "",
  OPENAI_BASE_URL: "",
  TAVILY_API_KEY: "",
  M2_V2_EVIDENCE_API_BASE_URL: "",
  M2_V2_EVIDENCE_APPROVED_HOST: "",
  M2_V2_APPROVED_RELAY_HOST: "",
  M2_V2_EVIDENCE_PROVIDER: "",
  M2_V2_SEARCH_PROVIDER: "",
  M2_V2_TAVILY_BASE_URL: "",
};

function reserveAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, HOST, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("portable_start_port_unavailable")));
        return;
      }
      const { port } = address;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolve) => child.once("exit", resolve));
}

async function waitForHealth(child, port, output) {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`portable_start_exited_early:${output.stderr || output.stdout}`);
    }
    try {
      const response = await fetch(`http://${HOST}:${port}/health`);
      const body = await response.json();
      if (response.ok && body.status === "ok") {
        return;
      }
    } catch {
      // The process can be healthy on the next bounded poll.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`portable_start_timeout:${output.stderr || output.stdout}`);
}

async function verifyComposition({ composition, entrypoint }) {
  const port = await reserveAvailablePort();
  const output = { stdout: "", stderr: "" };
  const child = spawn(process.execPath, [entrypoint], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...PRIVATE_FREE_ENV,
      M1_HTTP_PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout.on("data", (chunk) => {
    output.stdout += chunk.toString("utf8");
  });
  child.stderr.on("data", (chunk) => {
    output.stderr += chunk.toString("utf8");
  });

  try {
    await waitForHealth(child, port, output);
    return {
      composition,
      status: "PASS",
      privateArtifactsRequired: false,
      formalDatabaseConnected: false,
    };
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
    }
    await waitForExit(child);
  }
}

const results = [];
for (const target of [
  { composition: "formal", entrypoint: "src/server.js" },
  { composition: "fixture", entrypoint: "src/fixtureServer.js" },
]) {
  results.push(await verifyComposition(target));
}

process.stdout.write(`${JSON.stringify({
  status: "PASS",
  privateIndependent: true,
  results,
}, null, 2)}\n`);
