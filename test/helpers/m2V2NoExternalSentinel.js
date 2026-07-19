import fs from "node:fs";
import path from "node:path";
import childProcess from "node:child_process";
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import { syncBuiltinESMExports } from "node:module";
import pg from "pg";

export const M2_V2_S0_SENTINEL_GLOBAL = Symbol.for("m2.v2.pr7.s0.noExternalSentinel.v0.1");

export const PROVIDER_ENV_NAMES = Object.freeze([
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "TAVILY_API_KEY",
  "M2_V2_EVIDENCE_API_BASE_URL",
  "M2_V2_EVIDENCE_APPROVED_HOST",
  "M2_V2_APPROVED_RELAY_HOST",
  "M2_V2_EVIDENCE_PROVIDER",
  "M2_V2_SEARCH_PROVIDER",
  "M2_V2_TAVILY_BASE_URL",
]);

export const DATABASE_ENV_NAMES = Object.freeze([
  "M1_DATABASE_URL",
  "M1_DATABASE_READONLY_URL",
  "M1_DATABASE_BACKGROUND_URL",
  "DATABASE_URL",
  "PGHOST",
  "PGPORT",
  "PGDATABASE",
  "PGUSER",
  "PGPASSWORD",
]);

export const PROVIDER_ROUTE_INVENTORY = Object.freeze([
  Object.freeze({
    routeId: "CANARY_RELAY_ADAPTER_EXECUTE",
    sourcePath: "src/domain/m2V2EvidencePilot/openAiCompatibleRelayAdapter.js",
    sinkSymbol: "OpenAICompatibleRelayCanaryAdapter.execute",
    exportedEntrypoints: ["OpenAICompatibleRelayCanaryAdapter"],
    sourceMarker: "response = await this.fetchImpl(",
    existingTestEntrypoints: ["test/m2-v2-evidence-canary.test.js"],
  }),
  Object.freeze({
    routeId: "V2B2_RELAY_DISPATCH",
    sourcePath: "src/domain/m2V2EvidencePilot/v2b2Runtime.js",
    sinkSymbol: "dispatchRelayResponse",
    exportedEntrypoints: ["createRelayStageExecutor", "runV2B2Benchmark", "runV2B2Canary"],
    sourceMarker: "response = await fetchImpl(",
    existingTestEntrypoints: ["test/m2-v2-relay-v2b2.test.js", "test/m2-v2-relay-v2b2-runtime.test.js"],
  }),
  Object.freeze({
    routeId: "V2B4_RELAY_DISPATCH",
    sourcePath: "src/domain/m2V2EvidencePilot/v2b4Runtime.js",
    sinkSymbol: "dispatchRelayResponse",
    exportedEntrypoints: ["runV2B4Canary"],
    sourceMarker: "response = await fetchImpl(",
    existingTestEntrypoints: [],
  }),
  Object.freeze({
    routeId: "V2B5_TAVILY_DISPATCH",
    sourcePath: "src/domain/m2V2EvidencePilot/tavilySearchProviderV2B5.js",
    sinkSymbol: "dispatchV2B5TavilyRequest",
    exportedEntrypoints: ["dispatchV2B5TavilyRequest", "TavilySearchProviderV2B5.search"],
    sourceMarker: "response = await fetchImpl(",
    existingTestEntrypoints: ["test/m2-v2-provider-transport-security.test.js", "test/m2-v2-v2b5.test.js"],
  }),
  Object.freeze({
    routeId: "V2B5_RELAY_EXTRACTION_DISPATCH",
    sourcePath: "src/domain/m2V2EvidencePilot/relayExtractionProviderV2B5.js",
    sinkSymbol: "dispatchV2B5RelayExtractionRequest",
    exportedEntrypoints: ["dispatchV2B5RelayExtractionRequest", "OpenAICompatibleRelayExtractionProviderV2B5.extract"],
    sourceMarker: "response = await fetchImpl(",
    existingTestEntrypoints: [],
  }),
  Object.freeze({
    routeId: "V2B6_RELAY_EXTRACTION_DISPATCH",
    sourcePath: "src/domain/m2V2EvidencePilot/relayExtractionAdapterV2B6.js",
    sinkSymbol: "dispatchV2B6RelayRequest",
    exportedEntrypoints: ["dispatchV2B6RelayRequest"],
    sourceMarker: "response = await fetchImpl(",
    existingTestEntrypoints: ["test/m2-v2-provider-transport-security.test.js"],
  }),
]);

const ROUTE_IDS = new Set(PROVIDER_ROUTE_INVENTORY.map((item) => item.routeId));
const RESTORE_HANDLES = new WeakMap();

function sanitizedToken(value) {
  return String(value ?? "").replace(/[\r\n\t]+/gu, " ").slice(0, 160);
}

export function assertExternalEnvironmentEmpty(env = process.env) {
  const nonempty = [...PROVIDER_ENV_NAMES, ...DATABASE_ENV_NAMES]
    .filter((name) => typeof env[name] === "string" && env[name].trim() !== "")
    .sort();
  if (nonempty.length > 0) throw new Error(`s0_external_env_nonempty:${nonempty.join(",")}`);
  return { checkedNames: [...PROVIDER_ENV_NAMES, ...DATABASE_ENV_NAMES], nonemptyNames: [] };
}

function parseCounter(text) {
  const trimmed = text.trim();
  if (/^\d+$/u.test(trimmed)) return { count: Number(trimmed), format: "integer" };
  const value = JSON.parse(trimmed);
  for (const key of ["providerCalls", "providerRequestCount", "count"]) {
    if (Number.isSafeInteger(value?.[key]) && value[key] >= 0) return { count: value[key], format: "json", key, value };
  }
  throw new Error("s0_provider_counter_format_invalid");
}

export function readProviderCounter(counterFile) {
  if (!counterFile) return 0;
  const parsed = parseCounter(fs.readFileSync(counterFile, "utf8"));
  return parsed.count;
}

function incrementProviderCounterAtomic(counterFile) {
  const absolute = path.resolve(counterFile);
  const directory = path.dirname(absolute);
  const lockPath = `${absolute}.lock`;
  let lock;
  let temporary = null;
  try {
    lock = fs.openSync(lockPath, "wx", 0o600);
    const parsed = parseCounter(fs.readFileSync(absolute, "utf8"));
    const nextCount = parsed.count + 1;
    const payload = parsed.format === "integer"
      ? `${nextCount}\n`
      : `${JSON.stringify({ ...parsed.value, [parsed.key]: nextCount })}\n`;
    temporary = path.join(directory, `.${path.basename(absolute)}.${process.pid}.${Date.now()}.tmp`);
    const handle = fs.openSync(temporary, "wx", 0o600);
    try {
      fs.writeFileSync(handle, payload, "utf8");
      fs.fsyncSync(handle);
    } finally {
      fs.closeSync(handle);
    }
    fs.renameSync(temporary, absolute);
    temporary = null;
  } catch (error) {
    throw new Error(`s0_provider_counter_atomic_increment_failed:${sanitizedToken(error?.code ?? error?.name)}`);
  } finally {
    if (temporary) fs.rmSync(temporary, { force: true });
    if (lock !== undefined) {
      fs.closeSync(lock);
      fs.rmSync(lockPath, { force: true });
    }
  }
}

function isLoopbackHost(hostname) {
  const normalized = String(hostname ?? "").trim().toLowerCase().replace(/^\[|\]$/gu, "");
  return normalized === "localhost"
    || normalized === "::1"
    || normalized === "0:0:0:0:0:0:0:1"
    || /^127(?:\.\d{1,3}){3}$/u.test(normalized);
}

function targetFromRequestArgs(args, defaultProtocol) {
  const first = args[0];
  if (first instanceof URL) return first;
  if (typeof first === "string") return new URL(first, `${defaultProtocol}//localhost`);
  if (first && typeof first === "object") {
    const protocol = first.protocol ?? defaultProtocol;
    const hostname = first.hostname ?? first.host ?? "localhost";
    const port = first.port ? `:${first.port}` : "";
    const pathname = first.path ?? first.pathname ?? "/";
    return new URL(`${protocol}//${hostname}${port}${pathname}`);
  }
  return new URL(`${defaultProtocol}//localhost/`);
}

function targetFromNetArgs(args) {
  const first = args[0];
  if (typeof first === "number") return { port: first, hostname: typeof args[1] === "string" ? args[1] : "localhost" };
  if (typeof first === "string" && /^\\\\\.\\pipe\\/iu.test(first)) return { pipe: true, hostname: "localhost", port: null };
  if (first && typeof first === "object") {
    return { port: Number(first.port ?? 0) || null, hostname: first.host ?? first.hostname ?? "localhost" };
  }
  return { port: null, hostname: "localhost" };
}

function looksLikeDatabasePort(port) {
  return Number(port) === 5432 || Number(port) === 5433;
}

function looksLikeNetworkHelper(executable, argv) {
  const base = path.basename(String(executable ?? "")).toLowerCase().replace(/\.(?:exe|cmd|bat|ps1)$/u, "");
  if (["curl", "wget", "invoke-webrequest", "invoke-restmethod", "psql", "pg_isready", "tavily", "openai"].includes(base)) return true;
  const args = Array.isArray(argv) ? argv.map(String) : [];
  return args.some((item) => /^https?:\/\//iu.test(item) || /(?:^|[=:/])(api\.tavily\.com|api\.openai\.com)(?:$|[/:])/iu.test(item));
}

export function scanDirectFetchSinks(root = process.cwd()) {
  const domain = path.join(root, "src", "domain", "m2V2EvidencePilot");
  const sinks = [];
  for (const entry of fs.readdirSync(domain, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".js")) continue;
    const absolute = path.join(domain, entry.name);
    const source = fs.readFileSync(absolute, "utf8");
    const regex = /(?:[A-Za-z_$][\w$]*\s*=\s*)?await\s+(?:this\.)?fetchImpl\s*\(/gu;
    for (const match of source.matchAll(regex)) {
      sinks.push({
        sourcePath: path.relative(root, absolute).replaceAll("\\", "/"),
        line: source.slice(0, match.index).split("\n").length,
        marker: match[0].replace(/\s+/gu, " ").trim(),
      });
    }
  }
  return sinks.sort((left, right) => left.sourcePath.localeCompare(right.sourcePath) || left.line - right.line);
}

export function validateProviderRouteInventory(root = process.cwd()) {
  const sinks = scanDirectFetchSinks(root);
  if (sinks.length !== PROVIDER_ROUTE_INVENTORY.length) {
    throw new Error(`s0_provider_route_inventory_count_drift:${sinks.length}`);
  }
  for (const route of PROVIDER_ROUTE_INVENTORY) {
    const source = fs.readFileSync(path.join(root, ...route.sourcePath.split("/")), "utf8");
    const markerCount = source.split(route.sourceMarker).length - 1;
    if (markerCount !== 1) throw new Error(`s0_provider_route_marker_drift:${route.routeId}:${markerCount}`);
  }
  const inventoryPaths = PROVIDER_ROUTE_INVENTORY.map((item) => item.sourcePath).sort();
  const sinkPaths = sinks.map((item) => item.sourcePath).sort();
  if (JSON.stringify(inventoryPaths) !== JSON.stringify(sinkPaths)) throw new Error("s0_provider_route_path_drift");
  return { routeCount: PROVIDER_ROUTE_INVENTORY.length, routes: PROVIDER_ROUTE_INVENTORY, sinks };
}

export function createSyntheticCapabilityFoundation({ now = () => Date.now(), ttlMs = 30_000 } = {}) {
  const issued = new WeakMap();
  function issue({ routeId, rootIdentity, cacheDigest }) {
    if (!ROUTE_IDS.has(routeId)) throw new Error(`s0_capability_unknown_route:${routeId}`);
    if (!rootIdentity || !cacheDigest) throw new Error("s0_capability_binding_incomplete");
    const capability = Object.freeze(Object.create(null));
    issued.set(capability, { routeId, rootIdentity, cacheDigest, issuedAt: now(), used: false });
    return capability;
  }
  function consume(capability, { routeId, rootIdentity, cacheDigest }) {
    const record = capability && typeof capability === "object" ? issued.get(capability) : null;
    if (!record) throw new Error("s0_capability_missing_or_forged");
    if (record.used) throw new Error("s0_capability_reused");
    if (now() - record.issuedAt > ttlMs) throw new Error("s0_capability_stale");
    if (record.routeId !== routeId) throw new Error("s0_capability_wrong_route");
    if (record.rootIdentity !== rootIdentity) throw new Error("s0_capability_wrong_root");
    if (record.cacheDigest !== cacheDigest) throw new Error("s0_capability_wrong_cache_digest");
    record.used = true;
    return true;
  }
  return Object.freeze({ issue, consume });
}

export function createNoExternalSentinel(options = {}) {
  const env = options.env ?? process.env;
  const allowExternal = options.allowExternal === true;
  const counterFile = options.counterFile ?? env.M2_V2_S0_PROVIDER_COUNTER_FILE ?? null;
  assertExternalEnvironmentEmpty(env);
  const initialProviderCounter = counterFile ? readProviderCounter(counterFile) : 0;
  const counters = {
    attemptedExternalFetchCount: 0,
    actualExternalFetchCount: 0,
    attemptedDbConnectCount: 0,
    actualDbConnectCount: 0,
    fakeFetchCount: 0,
    loopbackCount: 0,
  };
  const originals = {
    fetch: globalThis.fetch,
    httpRequest: http.request,
    httpGet: http.get,
    httpsRequest: https.request,
    httpsGet: https.get,
    netConnect: net.connect,
    netCreateConnection: net.createConnection,
    socketConnect: net.Socket.prototype.connect,
    tlsConnect: tls.connect,
    dnsLookup: dns.lookup,
    dnsResolve: dns.resolve,
    dnsResolve4: dns.resolve4,
    dnsResolve6: dns.resolve6,
    spawn: childProcess.spawn,
    spawnSync: childProcess.spawnSync,
    execFile: childProcess.execFile,
    execFileSync: childProcess.execFileSync,
    exec: childProcess.exec,
    execSync: childProcess.execSync,
    pgClientConnect: pg.Client.prototype.connect,
    pgPoolConnect: pg.Pool.prototype.connect,
  };
  let installed = false;

  function incrementProviderCounterBeforeExternalTransport() {
    if (!counterFile) return;
    incrementProviderCounterAtomic(counterFile);
  }

  function denyOrAllowExternal(kind, invoke) {
    counters.attemptedExternalFetchCount += 1;
    if (!allowExternal) throw new Error(`s0_external_transport_blocked:${kind}`);
    incrementProviderCounterBeforeExternalTransport();
    counters.actualExternalFetchCount += 1;
    return invoke();
  }

  function guardUrl(kind, url, invoke) {
    if (isLoopbackHost(url.hostname)) {
      counters.loopbackCount += 1;
      return invoke();
    }
    return denyOrAllowExternal(kind, invoke);
  }

  function guardNet(kind, args, invoke) {
    const target = targetFromNetArgs(args);
    if (target.pipe) return invoke();
    if (looksLikeDatabasePort(target.port)) {
      counters.attemptedDbConnectCount += 1;
      if (!allowExternal) throw new Error(`s0_database_connect_blocked:${kind}`);
      counters.actualDbConnectCount += 1;
      return invoke();
    }
    if (isLoopbackHost(target.hostname)) return invoke();
    return denyOrAllowExternal(kind, invoke);
  }

  function guardedChild(kind, original, thisArg, executable, argv, rest) {
    if (looksLikeNetworkHelper(executable, argv)) throw new Error(`s0_child_network_helper_blocked:${kind}`);
    return original.call(thisArg, executable, argv, ...rest);
  }

  function install() {
    if (installed) throw new Error("s0_no_external_sentinel_already_installed");
    installed = true;
    globalThis.fetch = function guardedFetch(input, init) {
      const url = input instanceof URL ? input : new URL(typeof input === "string" ? input : input?.url);
      return guardUrl("fetch", url, () => originals.fetch.call(globalThis, input, init));
    };
    http.request = function guardedHttpRequest(...args) {
      return guardUrl("http.request", targetFromRequestArgs(args, "http:"), () => originals.httpRequest.apply(this, args));
    };
    http.get = function guardedHttpGet(...args) {
      return guardUrl("http.get", targetFromRequestArgs(args, "http:"), () => originals.httpGet.apply(this, args));
    };
    https.request = function guardedHttpsRequest(...args) {
      return guardUrl("https.request", targetFromRequestArgs(args, "https:"), () => originals.httpsRequest.apply(this, args));
    };
    https.get = function guardedHttpsGet(...args) {
      return guardUrl("https.get", targetFromRequestArgs(args, "https:"), () => originals.httpsGet.apply(this, args));
    };
    net.connect = function guardedNetConnect(...args) { return guardNet("net.connect", args, () => originals.netConnect.apply(this, args)); };
    net.createConnection = function guardedNetCreateConnection(...args) { return guardNet("net.createConnection", args, () => originals.netCreateConnection.apply(this, args)); };
    net.Socket.prototype.connect = function guardedSocketConnect(...args) { return guardNet("net.Socket.connect", args, () => originals.socketConnect.apply(this, args)); };
    tls.connect = function guardedTlsConnect(...args) { return guardNet("tls.connect", args, () => originals.tlsConnect.apply(this, args)); };
    for (const [name, original] of [["lookup", originals.dnsLookup], ["resolve", originals.dnsResolve], ["resolve4", originals.dnsResolve4], ["resolve6", originals.dnsResolve6]]) {
      dns[name] = function guardedDns(hostname, ...args) {
        if (isLoopbackHost(hostname)) return original.call(this, hostname, ...args);
        return denyOrAllowExternal(`dns.${name}`, () => original.call(this, hostname, ...args));
      };
    }
    childProcess.spawn = function guardedSpawn(executable, argv = [], ...rest) { return guardedChild("spawn", originals.spawn, this, executable, argv, rest); };
    childProcess.spawnSync = function guardedSpawnSync(executable, argv = [], ...rest) { return guardedChild("spawnSync", originals.spawnSync, this, executable, argv, rest); };
    childProcess.execFile = function guardedExecFile(executable, argv = [], ...rest) { return guardedChild("execFile", originals.execFile, this, executable, argv, rest); };
    childProcess.execFileSync = function guardedExecFileSync(executable, argv = [], ...rest) { return guardedChild("execFileSync", originals.execFileSync, this, executable, argv, rest); };
    childProcess.exec = function guardedExec(command, ...rest) {
      if (/https?:\/\/|\b(?:curl|wget|psql|pg_isready|tavily|openai)\b/iu.test(String(command))) throw new Error("s0_child_network_helper_blocked:exec");
      return originals.exec.call(this, command, ...rest);
    };
    childProcess.execSync = function guardedExecSync(command, ...rest) {
      if (/https?:\/\/|\b(?:curl|wget|psql|pg_isready|tavily|openai)\b/iu.test(String(command))) throw new Error("s0_child_network_helper_blocked:execSync");
      return originals.execSync.call(this, command, ...rest);
    };
    pg.Client.prototype.connect = function guardedPgClientConnect() {
      counters.attemptedDbConnectCount += 1;
      throw new Error("s0_database_connect_blocked:pg.Client.connect");
    };
    pg.Pool.prototype.connect = function guardedPgPoolConnect() {
      counters.attemptedDbConnectCount += 1;
      throw new Error("s0_database_connect_blocked:pg.Pool.connect");
    };
    syncBuiltinESMExports();
    return api;
  }

  function restore() {
    if (!installed) return;
    globalThis.fetch = originals.fetch;
    http.request = originals.httpRequest;
    http.get = originals.httpGet;
    https.request = originals.httpsRequest;
    https.get = originals.httpsGet;
    net.connect = originals.netConnect;
    net.createConnection = originals.netCreateConnection;
    net.Socket.prototype.connect = originals.socketConnect;
    tls.connect = originals.tlsConnect;
    dns.lookup = originals.dnsLookup;
    dns.resolve = originals.dnsResolve;
    dns.resolve4 = originals.dnsResolve4;
    dns.resolve6 = originals.dnsResolve6;
    childProcess.spawn = originals.spawn;
    childProcess.spawnSync = originals.spawnSync;
    childProcess.execFile = originals.execFile;
    childProcess.execFileSync = originals.execFileSync;
    childProcess.exec = originals.exec;
    childProcess.execSync = originals.execSync;
    pg.Client.prototype.connect = originals.pgClientConnect;
    pg.Pool.prototype.connect = originals.pgPoolConnect;
    syncBuiltinESMExports();
    installed = false;
  }

  function createFakeFetch(routeId, handler = async () => ({ ok: true })) {
    if (!ROUTE_IDS.has(routeId)) throw new Error(`s0_fake_transport_unknown_route:${routeId}`);
    return async (...args) => {
      counters.fakeFetchCount += 1;
      return handler(...args);
    };
  }

  function guardDbConnect(connect) {
    counters.attemptedDbConnectCount += 1;
    if (!allowExternal) throw new Error("s0_database_connect_blocked:pg.Client.connect");
    counters.actualDbConnectCount += 1;
    return connect();
  }

  function snapshot() {
    const currentProviderCounter = counterFile ? readProviderCounter(counterFile) : initialProviderCounter;
    return Object.freeze({
      ...counters,
      providerRequestDelta: currentProviderCounter - initialProviderCounter,
      providerCounterFileConfigured: Boolean(counterFile),
    });
  }

  const api = Object.freeze({
    install,
    snapshot,
    createFakeFetch,
    guardDbConnect,
    isInstalled: () => installed,
  });
  RESTORE_HANDLES.set(api, restore);
  return api;
}

export async function withInstalledNoExternalSentinel(options, callback) {
  if (typeof callback !== "function") throw new Error("s0_no_external_callback_required");
  const sentinel = createNoExternalSentinel(options);
  sentinel.install();
  try {
    return await callback(sentinel);
  } finally {
    RESTORE_HANDLES.get(sentinel)();
  }
}

export function getAutoInstalledSentinel() {
  return globalThis[M2_V2_S0_SENTINEL_GLOBAL] ?? null;
}

if (process.env.M2_V2_S0_SENTINEL_AUTO_INSTALL === "1") {
  if (!globalThis[M2_V2_S0_SENTINEL_GLOBAL]) {
    const sentinel = createNoExternalSentinel({ env: process.env });
    sentinel.install();
    const autoInstalledHandle = Object.freeze({
      isInstalled: sentinel.isInstalled,
      snapshot: sentinel.snapshot,
    });
    Object.defineProperty(globalThis, M2_V2_S0_SENTINEL_GLOBAL, {
      value: autoInstalledHandle,
      configurable: false,
      enumerable: false,
      writable: false,
    });
  }
}
