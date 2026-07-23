const ALLOWED_HORIZONS = new Set([3, 6, 12, 18, 24]);

export function buildM2CurrentCaseKey(input) {
  const standardWorkId = requireString(input?.standardWorkId, "standardWorkId");
  const origin = requireOrigin(input?.origin);
  const horizonMonths = Number(input?.horizonMonths);
  const route = requireString(input?.route, "route");
  if (!ALLOWED_HORIZONS.has(horizonMonths)) {
    throw new Error("m2_current_horizon_not_allowed");
  }
  return `${standardWorkId}|${origin}|${horizonMonths}|${route}`;
}

export function summarizeM2CurrentCaseUniverse(rows) {
  if (!Array.isArray(rows)) {
    throw new Error("m2_current_case_rows_required");
  }
  const keys = new Set();
  const works = new Set();
  const horizons = new Map();
  for (const row of rows) {
    const key = buildM2CurrentCaseKey(row);
    if (keys.has(key)) {
      throw new Error("m2_current_duplicate_case_key");
    }
    keys.add(key);
    works.add(row.standardWorkId);
    horizons.set(row.horizonMonths, (horizons.get(row.horizonMonths) ?? 0) + 1);
  }
  return {
    caseCount: keys.size,
    uniqueWorkCount: works.size,
    horizons: Object.fromEntries([...horizons].sort(([a], [b]) => a - b))
  };
}

function requireOrigin(value) {
  const origin = requireString(value, "origin");
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/u.test(origin)) {
    throw new Error("m2_current_origin_invalid");
  }
  return origin;
}

function requireString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`m2_current_${name}_required`);
  }
  return value.trim();
}
