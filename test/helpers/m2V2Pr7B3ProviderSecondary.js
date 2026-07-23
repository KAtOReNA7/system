import { readFileSync, readdirSync } from "node:fs";

const REGISTRY_PATH = new URL("../../config/m2-v2-pr7-b3-provider-route-registry.v0.1.json", import.meta.url);
const SOURCE_ROOT = new URL("../../src/domain/m2V2EvidencePilot/", import.meta.url);

export function verifyB3ProviderRouteClosure() {
  const issues = [];
  const registry = JSON.parse(readFileSync(REGISTRY_PATH, "utf8"));
  const sinkIds = new Set(registry.sinks.map((entry) => entry.sinkId));
  const routeIds = new Set(registry.routes.map((entry) => entry.routeId));
  if (registry.providerCapableExportCount !== 6) issues.push("provider_capable_export_count_invalid");
  if (registry.lowestSinkCount !== 6 || sinkIds.size !== 6) issues.push("lowest_sink_count_invalid");
  if (routeIds.size !== registry.routes.length) issues.push("route_id_duplicate");

  const activeSinkIds = new Set();
  const retiredSinkIds = new Set();
  for (const sink of registry.sinks) {
    const source = readFileSync(new URL(`../../${sink.sourcePath}`, import.meta.url), "utf8");
    const symbolIndex = source.indexOf(sink.symbol.split(".").at(-1));
    const fetchIndex = Math.max(source.indexOf("await fetchImpl("), source.indexOf("await this.fetchImpl("));
    if (symbolIndex < 0 || fetchIndex < 0) issues.push(`sink_callsite_missing:${sink.sinkId}`);
    if (sink.legacyStatus === "ACTIVE_CAPABILITY_REQUIRED") {
      activeSinkIds.add(sink.sinkId);
      const consumeIndex = source.lastIndexOf("consumeProviderDispatchCapability", fetchIndex);
      if (consumeIndex < 0 || consumeIndex > fetchIndex) issues.push(`sink_capability_consume_missing:${sink.sinkId}`);
    } else if (sink.legacyStatus === "RETIRED_HARD_FAIL") {
      retiredSinkIds.add(sink.sinkId);
      const rejectIndex = source.lastIndexOf("rejectRetiredProviderRoute();", fetchIndex);
      if (rejectIndex < 0 || rejectIndex > fetchIndex) issues.push(`legacy_sink_not_retired:${sink.sinkId}`);
    } else {
      issues.push(`sink_unclassified:${sink.sinkId}`);
    }
  }

  for (const route of registry.routes) {
    const routeSinks = Array.isArray(route.lowestSink) ? route.lowestSink : [route.lowestSink];
    if (routeSinks.some((sinkId) => !sinkIds.has(sinkId))) issues.push(`route_sink_unregistered:${route.routeId}`);
    if (route.legacyStatus === "ACTIVE_CAPABILITY_REQUIRED"
        && routeSinks.some((sinkId) => !activeSinkIds.has(sinkId))) {
      issues.push(`active_route_uses_retired_sink:${route.routeId}`);
    }
    if (route.legacyStatus === "RETIRED_HARD_FAIL"
        && routeSinks.some((sinkId) => !retiredSinkIds.has(sinkId))) {
      issues.push(`retired_route_uses_active_sink:${route.routeId}`);
    }
  }

  const discovered = discoverTransportCallsites();
  const registeredPaths = new Set(registry.sinks.map((entry) => entry.sourcePath));
  for (const callsite of discovered) {
    if (!registeredPaths.has(callsite.sourcePath)) issues.push(`unregistered_transport_sink:${callsite.sourcePath}`);
  }
  if (discovered.length !== registry.lowestSinkCount) issues.push("transport_callsite_count_mismatch");

  const capabilitySource = readFileSync(new URL("../../src/domain/m2V2EvidencePilot/providerDispatchCapability.js", import.meta.url), "utf8");
  if (!capabilitySource.includes("capabilityState.set(")
      || !capabilitySource.includes("capabilityState.get(")
      || !capabilitySource.includes("state.consumed = true")) {
    issues.push("capability_issue_consume_not_paired");
  }
  if (/export\s+(?:class|function)\s+(?:create|issue).*Capability/iu.test(capabilitySource)) {
    issues.push("exported_authority_constructor");
  }
  const globalFallbacks = sourceFiles().flatMap(({ sourcePath, source }) => (
    source.includes("globalThis.fetch") ? [sourcePath] : []
  ));
  if (globalFallbacks.length) issues.push(...globalFallbacks.map((path) => `global_fetch_fallback:${path}`));
  return {
    valid: issues.length === 0,
    issues,
    routeCount: registry.routes.length,
    classifiedRouteCount: registry.routes.filter((entry) => ["ACTIVE_CAPABILITY_REQUIRED", "RETIRED_HARD_FAIL"].includes(entry.legacyStatus)).length,
    lowestSinkCount: registry.sinks.length,
    discoveredTransportCallsiteCount: discovered.length,
    legacyActiveRouteCount: registry.routes.filter((entry) => entry.legacyStatus !== "RETIRED_HARD_FAIL" && entry.routeId.startsWith("legacy_")).length,
  };
}

function discoverTransportCallsites() {
  return sourceFiles().flatMap(({ sourcePath, source }) => {
    const matches = [...source.matchAll(/await\s+(?:this\.)?fetchImpl\s*\(/gu)];
    return matches.map(() => ({ sourcePath }));
  });
}

function sourceFiles() {
  return readdirSync(SOURCE_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
    .map((entry) => {
      const sourcePath = `src/domain/m2V2EvidencePilot/${entry.name}`;
      return { sourcePath, source: readFileSync(new URL(entry.name, SOURCE_ROOT), "utf8") };
    });
}
