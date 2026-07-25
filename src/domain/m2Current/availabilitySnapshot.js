import {
  validateM2CurrentRevenueShareFacts
} from "./revenueShareFact.js";

const MONTH_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])$/u;
const ISO_INSTANT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const ISO_CURRENCY_PATTERN = /^[A-Z]{3}$/u;
const SEGMENTS = new Set(["dense", "intermittent", "dormant"]);
const STATUSES = new Set(["observed_as_of", "unknown_at_origin"]);

export const M2_CURRENT_AVAILABILITY_SNAPSHOT_SCHEMA =
  "m2.current.availability_snapshot.v0.1";

export const M2_CURRENT_AVAILABILITY_STATUSES = Object.freeze(
  [...STATUSES]
);

export function buildM2CurrentAvailabilitySnapshot(input) {
  if (
    input?.schema !== undefined
    && input.schema !== M2_CURRENT_AVAILABILITY_SNAPSHOT_SCHEMA
  ) {
    throw new Error("m2_current_availability_snapshot_schema_invalid");
  }
  const snapshotId = requireString(input?.snapshotId, "snapshot_id");
  const standardWorkId = requireString(
    input?.standardWorkId,
    "snapshot_standard_work_id"
  );
  const currency = requireCurrency(input?.currency);
  const origin = requireMonth(input?.origin, "snapshot_origin");
  const segment = requireSegment(input?.segment);
  const status = requireStatus(input?.status);
  const originCutoffAt = endOfMonthInstant(origin);
  if (
    input?.currentStateBackfillUsed !== undefined
    && input.currentStateBackfillUsed !== false
  ) {
    throw new Error("m2_current_availability_current_state_backfill_forbidden");
  }

  if (status === "unknown_at_origin") {
    if ((input?.facts ?? []).length !== 0 || input?.authority != null) {
      throw new Error(
        "m2_current_unknown_availability_cannot_include_observed_data"
      );
    }
    const missingReason = requireString(
      input?.missingReason,
      "snapshot_missing_reason"
    );
    return Object.freeze({
      schema: M2_CURRENT_AVAILABILITY_SNAPSHOT_SCHEMA,
      snapshotId,
      standardWorkId,
      currency,
      origin,
      segment,
      status,
      originCutoffAt,
      authority: null,
      factIds: Object.freeze([]),
      amounts: Object.freeze({
        saleCash: null,
        refundCash: null,
        reversalCash: null,
        netSalesShareCash: null
      }),
      signals: Object.freeze({
        occurrence: Object.freeze({
          status: "missing",
          value: null,
          semantic:
            "historical_net_sales_share_cash_positive_as_of_snapshot"
        }),
        positiveAmount: Object.freeze({
          status: "missing",
          value: null,
          semantic:
            "historical_net_sales_share_cash_as_of_snapshot"
        })
      }),
      missingReason,
      reconstructionPolicy: "strict_historical_snapshot_only",
      currentStateBackfillUsed: false
    });
  }

  const authority = buildAuthority(input?.authority);
  if (input?.missingReason !== null && input?.missingReason !== undefined) {
    throw new Error(
      "m2_current_observed_availability_missing_reason_forbidden"
    );
  }
  if (authority.availableAt > originCutoffAt) {
    throw new Error(
      "m2_current_availability_authority_not_available_at_origin"
    );
  }
  const facts = validateM2CurrentRevenueShareFacts(input?.facts ?? []);
  if (facts.some((fact) => fact.standardWorkId !== standardWorkId)) {
    throw new Error("m2_current_availability_fact_work_mismatch");
  }
  if (facts.some((fact) => fact.currency !== currency)) {
    throw new Error("m2_current_availability_fact_currency_mismatch");
  }
  if (facts.some((fact) => fact.availableAt > originCutoffAt)) {
    throw new Error("m2_current_availability_fact_not_available_at_origin");
  }
  if (
    facts.some((fact) => fact.availableAt > authority.availableAt)
  ) {
    throw new Error("m2_current_availability_fact_after_authority_snapshot");
  }

  const saleCash = sumEvent(facts, "sale");
  const refundCash = sumEvent(facts, "refund");
  const reversalCash = sumEvent(facts, "reversal");
  const netSalesShareCash = saleCash + refundCash + reversalCash;
  const occurrence = netSalesShareCash > 0;
  return Object.freeze({
    schema: M2_CURRENT_AVAILABILITY_SNAPSHOT_SCHEMA,
    snapshotId,
    standardWorkId,
    currency,
    origin,
    segment,
    status,
    originCutoffAt,
    authority,
    factIds: Object.freeze(facts.map((fact) => fact.factId).sort()),
    amounts: Object.freeze({
      saleCash,
      refundCash,
      reversalCash,
      netSalesShareCash
    }),
    signals: Object.freeze({
      occurrence: Object.freeze({
        status: "available",
        value: occurrence,
        semantic:
          "historical_net_sales_share_cash_positive_as_of_snapshot"
      }),
      positiveAmount: Object.freeze({
        status: occurrence ? "available" : "not_applicable",
        value: occurrence ? netSalesShareCash : null,
        semantic:
          "historical_net_sales_share_cash_as_of_snapshot"
      })
    }),
    missingReason: null,
    reconstructionPolicy: "strict_historical_snapshot_only",
    currentStateBackfillUsed: false
  });
}

export function buildM2CurrentUnknownAvailabilitySnapshot(input) {
  return buildM2CurrentAvailabilitySnapshot({
    ...input,
    status: "unknown_at_origin",
    facts: [],
    authority: null,
    currentStateBackfillUsed: false
  });
}

function buildAuthority(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("m2_current_availability_authority_required");
  }
  if (value.completeness !== "complete_as_of_snapshot") {
    throw new Error("m2_current_availability_authority_completeness_invalid");
  }
  const contentHashSha256 = String(value.contentHashSha256 ?? "").toLowerCase();
  if (!SHA256_PATTERN.test(contentHashSha256)) {
    throw new Error("m2_current_availability_authority_hash_invalid");
  }
  return Object.freeze({
    system: requireString(value.system, "snapshot_authority_system"),
    dataset: requireString(value.dataset, "snapshot_authority_dataset"),
    version: requireString(value.version, "snapshot_authority_version"),
    recordId: requireString(value.recordId, "snapshot_authority_record_id"),
    availableAt: requireInstant(
      value.availableAt,
      "snapshot_authority_available_at"
    ),
    contentHashSha256,
    completeness: "complete_as_of_snapshot"
  });
}

function endOfMonthInstant(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 0, 23, 59, 59, 999))
    .toISOString();
}

function sumEvent(facts, eventType) {
  return facts
    .filter((fact) => fact.eventType === eventType)
    .reduce((sum, fact) => sum + fact.cashAmount, 0);
}

function requireStatus(value) {
  const status = String(value ?? "");
  if (!STATUSES.has(status)) {
    throw new Error("m2_current_availability_status_invalid");
  }
  return status;
}

function requireCurrency(value) {
  const currency = String(value ?? "");
  if (!ISO_CURRENCY_PATTERN.test(currency)) {
    throw new Error("m2_current_availability_currency_invalid");
  }
  return currency;
}

function requireSegment(value) {
  const segment = String(value ?? "");
  if (!SEGMENTS.has(segment)) {
    throw new Error("m2_current_availability_segment_invalid");
  }
  return segment;
}

function requireMonth(value, name) {
  const month = String(value ?? "");
  if (!MONTH_PATTERN.test(month)) {
    throw new Error(`m2_current_${name}_invalid`);
  }
  return month;
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

function requireString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`m2_current_${name}_required`);
  }
  return value.trim();
}
