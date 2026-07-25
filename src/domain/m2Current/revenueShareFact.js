const EVENT_TYPES = new Set(["sale", "refund", "reversal"]);
const ISO_INSTANT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const ISO_CURRENCY_PATTERN = /^[A-Z]{3}$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const AMOUNT_TOLERANCE = 1e-9;

export const M2_CURRENT_REVENUE_SHARE_FACT_SCHEMA =
  "m2.current.revenue_share_fact.v0.1";

export const M2_CURRENT_REVENUE_SHARE_EVENT_TYPES = Object.freeze(
  [...EVENT_TYPES]
);

export function buildM2CurrentRevenueShareFact(input) {
  if (
    input?.schema !== undefined
    && input.schema !== M2_CURRENT_REVENUE_SHARE_FACT_SCHEMA
  ) {
    throw new Error("m2_current_revenue_share_fact_schema_invalid");
  }
  const factId = requireString(input?.factId, "fact_id");
  const standardWorkId = requireString(
    input?.standardWorkId,
    "fact_standard_work_id"
  );
  const channelId = requireString(input?.channelId, "fact_channel_id");
  const currency = requireCurrency(input?.currency);
  const eventType = requireEventType(input?.eventType);
  const cashAmount = requireCashAmount(input?.cashAmount, eventType);
  const economicTime = requireInstant(
    input?.economicTime,
    "fact_economic_time"
  );
  const postingTime = requireInstant(
    input?.postingTime,
    "fact_posting_time"
  );
  const availableAt = requireInstant(
    input?.availableAt,
    "fact_available_at"
  );
  if (economicTime > postingTime || postingTime > availableAt) {
    throw new Error("m2_current_revenue_share_fact_time_order_invalid");
  }

  const source = buildSource(input?.source);
  const lineage = buildLineage(input?.lineage);
  const reversesFactId = nullableString(input?.reversesFactId);
  if (eventType === "reversal") {
    if (reversesFactId === null || reversesFactId === factId) {
      throw new Error("m2_current_revenue_share_reversal_reference_invalid");
    }
    if (!lineage.parentFactIds.includes(reversesFactId)) {
      throw new Error(
        "m2_current_revenue_share_reversal_lineage_reference_missing"
      );
    }
  } else if (reversesFactId !== null) {
    throw new Error(
      "m2_current_revenue_share_non_reversal_reference_forbidden"
    );
  }

  return Object.freeze({
    schema: M2_CURRENT_REVENUE_SHARE_FACT_SCHEMA,
    factId,
    standardWorkId,
    channelId,
    currency,
    eventType,
    cashAmount,
    economicTime,
    postingTime,
    availableAt,
    source,
    lineage,
    reversesFactId,
    targetPolicy: "sales_share_cash_only",
    buyoutIncluded: false
  });
}

export function validateM2CurrentRevenueShareFacts(inputs) {
  if (!Array.isArray(inputs)) {
    throw new Error("m2_current_revenue_share_facts_required");
  }
  const facts = inputs.map(buildM2CurrentRevenueShareFact);
  const byId = new Map();
  const sourceKeys = new Set();
  for (const fact of facts) {
    if (byId.has(fact.factId)) {
      throw new Error("m2_current_revenue_share_fact_id_duplicate");
    }
    byId.set(fact.factId, fact);
    const sourceKey = [
      fact.source.system,
      fact.source.dataset,
      fact.source.version,
      fact.source.recordId
    ].join("|");
    if (sourceKeys.has(sourceKey)) {
      throw new Error("m2_current_revenue_share_source_record_duplicate");
    }
    sourceKeys.add(sourceKey);
  }

  const reversedCashByFactId = new Map();
  for (const fact of facts) {
    if (fact.eventType !== "reversal") {
      continue;
    }
    const reversed = byId.get(fact.reversesFactId);
    if (!reversed) {
      throw new Error("m2_current_revenue_share_reversal_parent_missing");
    }
    if (
      reversed.standardWorkId !== fact.standardWorkId
      || reversed.channelId !== fact.channelId
      || reversed.currency !== fact.currency
    ) {
      throw new Error("m2_current_revenue_share_reversal_scope_mismatch");
    }
    if (Math.sign(reversed.cashAmount) === Math.sign(fact.cashAmount)) {
      throw new Error("m2_current_revenue_share_reversal_sign_invalid");
    }
    if (
      fact.economicTime < reversed.economicTime
      || fact.availableAt < reversed.availableAt
    ) {
      throw new Error("m2_current_revenue_share_reversal_time_invalid");
    }
    const reversedTotal =
      (reversedCashByFactId.get(reversed.factId) ?? 0)
      + Math.abs(fact.cashAmount);
    if (reversedTotal - Math.abs(reversed.cashAmount) > AMOUNT_TOLERANCE) {
      throw new Error("m2_current_revenue_share_reversal_amount_exceeded");
    }
    reversedCashByFactId.set(reversed.factId, reversedTotal);
  }
  assertNoReversalCycles(facts, byId);
  return Object.freeze(facts);
}

export function selectM2CurrentRevenueShareFactsAsOf(inputs, cutoffAt) {
  const cutoff = requireInstant(cutoffAt, "fact_selection_cutoff");
  return Object.freeze(
    validateM2CurrentRevenueShareFacts(inputs)
      .filter((fact) => fact.availableAt <= cutoff)
      .sort((left, right) => (
        left.availableAt.localeCompare(right.availableAt)
        || left.factId.localeCompare(right.factId)
      ))
  );
}

function buildSource(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("m2_current_revenue_share_fact_source_required");
  }
  const contentHashSha256 = String(value.contentHashSha256 ?? "").toLowerCase();
  if (!SHA256_PATTERN.test(contentHashSha256)) {
    throw new Error(
      "m2_current_revenue_share_fact_source_content_hash_invalid"
    );
  }
  return Object.freeze({
    system: requireString(value.system, "fact_source_system"),
    dataset: requireString(value.dataset, "fact_source_dataset"),
    version: requireString(value.version, "fact_source_version"),
    recordId: requireString(value.recordId, "fact_source_record_id"),
    contentHashSha256
  });
}

function buildLineage(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("m2_current_revenue_share_fact_lineage_required");
  }
  return Object.freeze({
    transformId: requireString(
      value.transformId,
      "fact_lineage_transform_id"
    ),
    transformVersion: requireString(
      value.transformVersion,
      "fact_lineage_transform_version"
    ),
    parentFactIds: Object.freeze(
      uniqueStrings(value.parentFactIds ?? [], "fact_lineage_parent_fact_ids")
    )
  });
}

function assertNoReversalCycles(facts, byId) {
  for (const fact of facts) {
    const visited = new Set([fact.factId]);
    let current = fact;
    while (current.eventType === "reversal") {
      if (visited.has(current.reversesFactId)) {
        throw new Error("m2_current_revenue_share_reversal_cycle");
      }
      visited.add(current.reversesFactId);
      current = byId.get(current.reversesFactId);
      if (!current) {
        break;
      }
    }
  }
}

function requireCashAmount(value, eventType) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount === 0) {
    throw new Error("m2_current_revenue_share_fact_cash_amount_invalid");
  }
  if (eventType === "sale" && amount <= 0) {
    throw new Error("m2_current_revenue_share_sale_amount_not_positive");
  }
  if (eventType === "refund" && amount >= 0) {
    throw new Error("m2_current_revenue_share_refund_amount_not_negative");
  }
  return amount;
}

function requireEventType(value) {
  const eventType = String(value ?? "");
  if (!EVENT_TYPES.has(eventType)) {
    throw new Error("m2_current_revenue_share_event_type_invalid");
  }
  return eventType;
}

function requireCurrency(value) {
  const currency = String(value ?? "");
  if (!ISO_CURRENCY_PATTERN.test(currency)) {
    throw new Error("m2_current_revenue_share_fact_currency_invalid");
  }
  return currency;
}

function requireInstant(value, name) {
  const instant = String(value ?? "");
  if (!ISO_INSTANT_PATTERN.test(instant)) {
    throw new Error(`m2_current_${name}_invalid`);
  }
  const timestamp = Date.parse(instant);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`m2_current_${name}_invalid`);
  }
  const normalized = new Date(timestamp).toISOString();
  const expected = instant.includes(".")
    ? instant
    : instant.replace("Z", ".000Z");
  if (normalized !== expected) {
    throw new Error(`m2_current_${name}_invalid`);
  }
  return normalized;
}

function uniqueStrings(values, name) {
  if (!Array.isArray(values)) {
    throw new Error(`m2_current_${name}_invalid`);
  }
  const normalized = values.map((value) => requireString(value, name));
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`m2_current_${name}_duplicate`);
  }
  return normalized;
}

function nullableString(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return requireString(value, "fact_reverses_fact_id");
}

function requireString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`m2_current_${name}_required`);
  }
  return value.trim();
}
