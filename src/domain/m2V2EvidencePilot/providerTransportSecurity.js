import { isIP } from "node:net";

const RESPONSES_ENDPOINT = "/responses";
const SEARCH_ENDPOINT = "/search";

/**
 * Parse and bind a provider base URL before a bearer credential is constructed.
 * The approved host is supplied separately from the URL so a typo or hostile URL
 * cannot approve itself. Production callers must load it from their private,
 * governed runtime binding; tests may pass a synthetic host explicitly.
 */
export function bindProviderTransport(options = {}) {
  if (options.endpointPath !== undefined && options.endpointPath !== RESPONSES_ENDPOINT) {
    throw fixedError("provider_endpoint_path_invalid");
  }
  return bindFixedProviderTransport(options, RESPONSES_ENDPOINT);
}

/** Bind a structured-search provider to its fixed endpoint. The approved host
 * remains a separate, governed input; callers cannot approve a supplied URL by
 * reflecting its own host back into this check. */
export function bindProviderSearchTransport(options = {}) {
  if (options.endpointPath !== undefined && options.endpointPath !== SEARCH_ENDPOINT) {
    throw fixedError("provider_endpoint_path_invalid");
  }
  return bindFixedProviderTransport(options, SEARCH_ENDPOINT);
}

function bindFixedProviderTransport(options, endpointPath) {
  const url = parseProviderBaseUrl(options.baseUrl);
  const approvedHost = normalizeApprovedHost(options.approvedHost);
  if (!approvedHost || url.host.toLocaleLowerCase("en-US") !== approvedHost) {
    throw fixedError("provider_host_binding_mismatch");
  }
  const endpoint = new URL(url.href);
  endpoint.pathname = `${url.pathname.replace(/\/+$/u, "")}${endpointPath}`.replace(/\/{2,}/gu, "/");
  endpoint.search = "";
  endpoint.hash = "";
  if (endpoint.protocol !== "https:" || endpoint.host !== url.host) {
    throw fixedError("provider_endpoint_binding_invalid");
  }
  return Object.freeze({
    baseUrl: url.href.replace(/\/$/u, ""),
    approvedHost,
    endpointUrl: endpoint.href,
    redirect: "manual",
  });
}

export function assertResponsesRetention(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw fixedError("provider_responses_payload_invalid");
  }
  if (!Object.hasOwn(payload, "store") || payload.store !== false) {
    throw fixedError("provider_responses_store_must_be_false");
  }
  return true;
}

/**
 * Final provider-dispatch gate. Counts must come from an actual-object cache
 * inspection; callers cannot replace this check with a narrative flag.
 */
export function assertProviderExecutionReadiness(readiness = {}) {
  if (readiness.legacyMutableCacheCount !== 0) {
    throw fixedError("provider_legacy_mutable_cache_not_zero");
  }
  if (readiness.rawResponseCurrentCacheCount !== 0) {
    throw fixedError("provider_current_cache_raw_response_not_zero");
  }
  if (readiness.providerHostBindingVerified !== true) {
    throw fixedError("provider_host_binding_not_verified");
  }
  return true;
}

/** Reject every redirect. A same-origin Location is distinguished for audit, but
 * is still not followed; this prevents fetch from forwarding a bearer credential
 * through an implementation-dependent redirect chain. */
export function assertNoProviderRedirect(response, requestUrl) {
  const status = Number(response?.status);
  if (!(status >= 300 && status < 400)) return true;
  const location = response?.headers?.get?.("location") ?? response?.headers?.get?.("Location") ?? null;
  if (location) {
    let target;
    try {
      target = new URL(location, requestUrl);
    } catch {
      throw fixedError("provider_redirect_location_invalid");
    }
    const source = new URL(requestUrl);
    if (target.protocol !== "https:" || target.host !== source.host) {
      throw fixedError("provider_redirect_binding_mismatch");
    }
  }
  throw fixedError("provider_redirect_forbidden");
}

export function parseProviderBaseUrl(value) {
  let url;
  try {
    url = new URL(String(value ?? "").trim());
  } catch {
    throw fixedError("provider_base_url_invalid");
  }
  if (url.protocol !== "https:") throw fixedError("provider_https_required");
  if (url.username || url.password) throw fixedError("provider_url_userinfo_forbidden");
  if (url.hash) throw fixedError("provider_url_fragment_forbidden");
  if (url.search) throw fixedError("provider_url_query_forbidden");
  if (!url.hostname || isForbiddenNetworkHost(url.hostname)) {
    throw fixedError("provider_local_or_private_host_forbidden");
  }
  url.pathname = url.pathname.replace(/\/+$/u, "") || "/";
  return url;
}

export function isForbiddenNetworkHost(hostname) {
  const normalized = String(hostname ?? "")
    .trim()
    .replace(/^\[|\]$/gu, "")
    .replace(/\.$/u, "")
    .toLocaleLowerCase("en-US");
  if (!normalized) return true;
  if (normalized === "localhost" || normalized.endsWith(".localhost") || normalized.endsWith(".local")) return true;
  const kind = isIP(normalized);
  if (kind === 4) return isPrivateIpv4(normalized);
  if (kind === 6) return isPrivateIpv6(normalized);
  return false;
}

function normalizeApprovedHost(value) {
  const host = String(value ?? "").trim().replace(/\.$/u, "").toLocaleLowerCase("en-US");
  if (!host || /[/?#@]/u.test(host)) return "";
  return host;
}

function isPrivateIpv4(value) {
  const octets = value.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = octets;
  return a === 0
    || a === 10
    || a === 127
    || a === 169 && b === 254
    || a === 172 && b >= 16 && b <= 31
    || a === 192 && b === 168
    || a >= 224;
}

function isPrivateIpv6(value) {
  const normalized = value.toLocaleLowerCase("en-US");
  if (normalized === "::" || normalized === "::1") return true;
  if (/^(?:fc|fd)/u.test(normalized) || /^fe[89ab]/u.test(normalized) || /^ff/u.test(normalized)) return true;
  const mappedIpv4 = ipv4FromMappedIpv6(normalized);
  return mappedIpv4 ? isPrivateIpv4(mappedIpv4) : false;
}

function ipv4FromMappedIpv6(value) {
  let canonical;
  try {
    canonical = new URL(`https://[${value}]/`).hostname
      .replace(/^\[|\]$/gu, "")
      .toLocaleLowerCase("en-US");
  } catch {
    return null;
  }
  const mapped = canonical.match(/^::ffff:([a-f0-9]{1,4}):([a-f0-9]{1,4})$/u);
  if (!mapped) return null;
  const high = Number.parseInt(mapped[1], 16);
  const low = Number.parseInt(mapped[2], 16);
  return `${high >>> 8}.${high & 0xff}.${low >>> 8}.${low & 0xff}`;
}

function fixedError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
