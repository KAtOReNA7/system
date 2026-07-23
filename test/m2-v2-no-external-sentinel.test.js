import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import pg from "pg";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  DATABASE_ENV_NAMES,
  M2_V2_S0_SENTINEL_GLOBAL,
  PROVIDER_ENV_NAMES,
  PROVIDER_ROUTE_INVENTORY,
  assertExternalEnvironmentEmpty,
  createNoExternalSentinel,
  createSyntheticCapabilityFoundation,
  readProviderCounter,
  validateProviderRouteInventory,
  withInstalledNoExternalSentinel,
} from "./helpers/m2V2NoExternalSentinel.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function emptyExternalEnv(extra = {}) {
  return Object.fromEntries([...PROVIDER_ENV_NAMES, ...DATABASE_ENV_NAMES].map((name) => [name, ""]).concat(Object.entries(extra)));
}

function withCounter(callback) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "m2-v2-s0-provider-counter-"));
  const counterFile = path.join(directory, "provider-counter.txt");
  fs.writeFileSync(counterFile, "0\n", "utf8");
  return Promise.resolve()
    .then(() => callback(counterFile))
    .finally(() => fs.rmSync(directory, { recursive: true, force: true }));
}

test("S0-03 route inventory binds all six direct fetch sinks and their test entrances", () => {
  const result = validateProviderRouteInventory(root);
  assert.equal(result.routeCount, 6);
  assert.equal(new Set(PROVIDER_ROUTE_INVENTORY.map((item) => item.routeId)).size, 6);
  assert.equal(PROVIDER_ROUTE_INVENTORY.every((item) => item.exportedEntrypoints.length > 0), true);
  assert.equal(PROVIDER_ROUTE_INVENTORY.every((item) => Array.isArray(item.existingTestEntrypoints)), true);
});

test("S0-03 global fetch, direct HTTP/HTTPS and known provider hosts fail before transport", async () => {
  await withCounter(async (counterFile) => {
    const fetchBeforeInstall = globalThis.fetch;
    await withInstalledNoExternalSentinel({ env: emptyExternalEnv(), counterFile }, async (sentinel) => {
      assert.notEqual(globalThis.fetch, fetchBeforeInstall);
      assert.equal(Object.hasOwn(sentinel, "originalFetch"), false);
      assert.equal(Object.hasOwn(sentinel, "restore"), false);
      await assert.rejects(async () => globalThis.fetch("https://api.openai.com/v1/responses"), /s0_external_transport_blocked:fetch/u);
      assert.throws(() => http.request("http://example.invalid/"), /s0_external_transport_blocked:http\.request/u);
      const https = await import("node:https");
      assert.throws(() => https.default.request("https://api.tavily.com/search"), /s0_external_transport_blocked:https\.request/u);
      const snapshot = sentinel.snapshot();
      assert.equal(snapshot.attemptedExternalFetchCount, 3);
      assert.equal(snapshot.actualExternalFetchCount, 0);
      assert.equal(snapshot.providerRequestDelta, 0);
      assert.equal(readProviderCounter(counterFile), 0);
    });
  });
});

test("S0-03 DB aliases and real pg Client.connect fail before transport", async () => {
  assert.throws(
    () => assertExternalEnvironmentEmpty(emptyExternalEnv({ DATABASE_URL: "present-but-not-printed" })),
    /s0_external_env_nonempty:DATABASE_URL/u,
  );
  let acceptedConnections = 0;
  const server = net.createServer((socket) => {
    acceptedConnections += 1;
    socket.destroy();
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  try {
    await withInstalledNoExternalSentinel({ env: emptyExternalEnv() }, async (sentinel) => {
      const address = server.address();
      const client = new pg.Client({ host: "127.0.0.1", port: address.port, database: "synthetic" });
      assert.throws(() => client.connect(), /s0_database_connect_blocked:pg\.Client\.connect/u);
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(acceptedConnections, 0);
      assert.equal(sentinel.snapshot().attemptedDbConnectCount, 1);
      assert.equal(sentinel.snapshot().actualDbConnectCount, 0);
    });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("S0-03 child-process network helpers are denied before process creation", async () => {
  await withInstalledNoExternalSentinel({ env: emptyExternalEnv() }, async (sentinel) => {
    assert.throws(
      () => childProcess.spawnSync("curl", ["https://example.invalid/"]),
      /s0_child_network_helper_blocked:spawnSync/u,
    );
    assert.equal(sentinel.snapshot().actualExternalFetchCount, 0);
  });
});

test("S0-03 child-process guards preserve Node promisify contracts without a network bypass", async () => {
  await withInstalledNoExternalSentinel({ env: emptyExternalEnv() }, async () => {
    const execFileAsync = promisify(childProcess.execFile);
    const execAsync = promisify(childProcess.exec);
    assert.equal(Object.getOwnPropertyDescriptor(childProcess.execFile, promisify.custom)?.configurable, false);
    assert.equal(Object.getOwnPropertyDescriptor(childProcess.exec, promisify.custom)?.configurable, false);
    const pendingResult = execFileAsync(process.execPath, ["-e", "process.stdout.write('PROMISIFY_OK')"]);
    assert.equal(typeof pendingResult.child?.pid, "number");
    const result = await pendingResult;
    assert.equal(result.stdout, "PROMISIFY_OK");
    assert.equal(result.stderr, "");
    await assert.rejects(
      execFileAsync("curl", ["https://example.invalid/"]),
      /s0_child_network_helper_blocked:execFile/u,
    );
    await assert.rejects(
      execAsync("curl https://example.invalid/"),
      /s0_child_network_helper_blocked:exec/u,
    );
  });
});

test("S0-03 fake transports are route-bound positive controls and never increment the provider counter", async () => {
  await withCounter(async (counterFile) => {
    const sentinel = createNoExternalSentinel({ env: emptyExternalEnv(), counterFile });
    const fake = sentinel.createFakeFetch("V2B6_RELAY_EXTRACTION_DISPATCH", async () => ({ ok: true, status: 200 }));
    assert.deepEqual(await fake(new URL("https://synthetic.invalid/")), { ok: true, status: 200 });
    assert.throws(() => sentinel.createFakeFetch("WRONG_ROUTE"), /s0_fake_transport_unknown_route/u);
    const snapshot = sentinel.snapshot();
    assert.equal(snapshot.fakeFetchCount, 1);
    assert.equal(snapshot.actualExternalFetchCount, 0);
    assert.equal(snapshot.providerRequestDelta, 0);
    assert.equal(readProviderCounter(counterFile), 0);
  });
});

test("S0-03 synthetic capability foundation rejects missing, forged, stale, reused and wrong-route objects", () => {
  let clock = 1_000;
  const issuer = createSyntheticCapabilityFoundation({ now: () => clock, ttlMs: 50 });
  const binding = { routeId: "V2B5_TAVILY_DISPATCH", rootIdentity: "synthetic-root", cacheDigest: "a".repeat(64) };
  assert.throws(() => issuer.consume(null, binding), /s0_capability_missing_or_forged/u);
  assert.throws(() => issuer.consume({ ...binding }, binding), /s0_capability_missing_or_forged/u);

  const wrongRoute = issuer.issue(binding);
  assert.throws(
    () => issuer.consume(wrongRoute, { ...binding, routeId: "V2B6_RELAY_EXTRACTION_DISPATCH" }),
    /s0_capability_wrong_route/u,
  );

  const stale = issuer.issue(binding);
  clock += 51;
  assert.throws(() => issuer.consume(stale, binding), /s0_capability_stale/u);

  const valid = issuer.issue(binding);
  assert.equal(issuer.consume(valid, binding), true);
  assert.throws(() => issuer.consume(valid, binding), /s0_capability_reused/u);
  assert.throws(
    () => issuer.issue({ ...binding, routeId: "WRONG_ROUTE" }),
    /s0_capability_unknown_route/u,
  );
});

test("S0-03 loopback in-process HTTP is allowed without provider-counter movement", async () => {
  await withCounter(async (counterFile) => {
    const server = http.createServer((request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end('{"ok":true}');
    });
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    try {
      await withInstalledNoExternalSentinel({ env: emptyExternalEnv(), counterFile }, async (sentinel) => {
        const response = await globalThis.fetch(`http://127.0.0.1:${address.port}/health`);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { ok: true });
        const snapshot = sentinel.snapshot();
        assert.equal(snapshot.loopbackCount, 1);
        assert.equal(snapshot.actualExternalFetchCount, 0);
        assert.equal(snapshot.providerRequestDelta, 0);
        assert.equal(readProviderCounter(counterFile), 0);
      });
    } finally {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});

test("S0-03 helper auto-installs only under the explicit Node preload env", async () => {
  await withCounter(async (counterFile) => {
    const inheritedHandle = globalThis[M2_V2_S0_SENTINEL_GLOBAL] ?? null;
    if (process.env.M2_V2_S0_SENTINEL_AUTO_INSTALL === "1") {
      assert.equal(inheritedHandle?.isInstalled(), true);
      assert.equal(typeof inheritedHandle.restore, "undefined");
      assert.equal(typeof inheritedHandle.originalFetch, "undefined");
    } else {
      assert.equal(inheritedHandle, null);
    }
    const helperUrl = pathToFileURL(path.join(root, "test/helpers/m2V2NoExternalSentinel.js")).href;
    const script = `
      const value = globalThis[Symbol.for('m2.v2.pr7.s0.noExternalSentinel.v0.1')];
      if (!value || !value.isInstalled()) process.exit(17);
      if (typeof value.restore !== 'undefined' || typeof value.originalFetch !== 'undefined') process.exit(19);
      const snapshot = value.snapshot();
      if (snapshot.providerRequestDelta !== 0) process.exit(18);
      process.stdout.write('AUTO_SENTINEL_OK');
    `;
    const result = childProcess.spawnSync(
      process.execPath,
      ["--import", helperUrl, "--input-type=module", "-e", script],
      {
        cwd: root,
        env: {
          ...process.env,
          ...emptyExternalEnv(),
          M2_V2_S0_SENTINEL_AUTO_INSTALL: "1",
          M2_V2_S0_PROVIDER_COUNTER_FILE: counterFile,
        },
        encoding: "utf8",
        windowsHide: true,
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "AUTO_SENTINEL_OK");
    assert.equal(readProviderCounter(counterFile), 0);
  });
});
