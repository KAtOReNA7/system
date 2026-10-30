import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

export class ApiError extends Error {
  constructor(status, code) {
    super("请求未完成");
    this.status = status;
    this.code = code;
  }
}

export async function getJson(url, signal) {
  const response = await fetch(url, { signal, headers: { Accept: "application/json" } });
  const body = await response.json();
  if (!response.ok) throw new ApiError(response.status, body.error?.code ?? body.code);
  return body;
}

export function useResource(url) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ url, data: null, error: null, loading: true });
  useEffect(() => {
    const controller = new AbortController();
    setState({ url, data: null, error: null, loading: true });
    getJson(url, controller.signal).then(
      data => setState({ url, data, error: null, loading: false }),
      error => {
        if (!controller.signal.aborted) setState({ url, data: null, error, loading: false });
      }
    );
    return () => controller.abort();
  }, [url, attempt]);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  return { ...(state.url === url ? state : { data: null, error: null, loading: true }), retry };
}

function subscribe(listener) {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}
export function useRoute() {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash, () => "#/");
  const route = hash.replace(/^#/, "") || "/";
  const divider = route.indexOf("?");
  return {
    path: divider < 0 ? route : route.slice(0, divider),
    params: new URLSearchParams(divider < 0 ? "" : route.slice(divider + 1))
  };
}
export function listHref(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value && value !== "all" && !(key === "page" && value === 1)) params.set(key, String(value));
  });
  return "#/works" + (params.size ? "?" + params.toString() : "");
}
export function detailHref(id, back = "#/works") {
  return "#/works/" + encodeURIComponent(id) + "?back=" + encodeURIComponent(back);
}
export const formatNumber = value => Number.isFinite(value) ? value.toLocaleString("zh-CN", { maximumFractionDigits: 20 }) : "—";
export const formatCash = value => Number.isFinite(value) ? "¥ " + formatNumber(value) : "—";
export const formatPercent = (value, digits = 2) => Number.isFinite(value) ? (value * 100).toFixed(digits).replace("-", "−") + "%" : "—";
export const formatMonth = value => value ? value.replace("-", ".") : "—";
export const dataStatusLabels = { complete: "数据完整", needs_review: "待核对", unknown: "未接入" };
export const businessStatusLabels = {
  not_evaluated: "成熟作品 · 范围待判定",
  needs_review: "渠道待核对",
  insufficient_history: "不足 3 个完整月",
  outside_scope: "纯买断 · 不属于预测范围",
  unknown: "范围未判定"
};
