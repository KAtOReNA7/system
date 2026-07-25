import { createHash } from "node:crypto";

const CHANNEL_ROLES = new Set([
  "terminal_sales_platform",
  "rights_or_agency_partner",
  "production_partner",
  "aggregation_or_distribution_channel"
]);

const REVENUE_MODES = new Set([
  "membership_subscription",
  "single_purchase_or_on_demand",
  "advertising_or_free_share",
  "rights_or_license_settlement"
]);

const CONTENT_FORMS = new Set([
  "audio"
]);

const AUDIT_STATUSES = new Set([
  "confirmed"
]);

export function normalizeM2CurrentChannelIdentity(value) {
  if (value === null || value === undefined) return "";
  const normalized = String(value).trim();
  if (/^-?\d+\.0$/u.test(normalized)) {
    return normalized.slice(0, -2);
  }
  return normalized;
}

export function buildM2CurrentChannelUid(
  canonicalName,
  namespace = "m2-current-channel-uid-v0.1"
) {
  const normalized = normalizeM2CurrentChannelIdentity(canonicalName)
    .normalize("NFKC")
    .toLowerCase();
  if (!normalized) {
    throw new Error("m2_current_channel_canonical_name_required");
  }
  return `chn_${createHash("sha256")
    .update(`${namespace}\u001f${normalized}`, "utf8")
    .digest("hex")
    .slice(0, 20)}`;
}

export function validateM2CurrentChannelMaster(
  rows,
  {
    namespace = "m2-current-channel-uid-v0.1",
    requireConfirmed = true
  } = {}
) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("m2_current_channel_master_rows_required");
  }
  const byRawPair = new Map();
  const canonicalAttributes = new Map();
  const normalizedRows = [];
  for (const [position, input] of rows.entries()) {
    const rawChannelId = normalizeM2CurrentChannelIdentity(
      input?.rawChannelId
    );
    const rawChannelName = normalizeM2CurrentChannelIdentity(
      input?.rawChannelName
    );
    const canonicalChannelName = normalizeM2CurrentChannelIdentity(
      input?.canonicalChannelName
    );
    const channelRole = normalizeM2CurrentChannelIdentity(input?.channelRole);
    const revenueMode = normalizeM2CurrentChannelIdentity(input?.revenueMode);
    const contentForm = normalizeM2CurrentChannelIdentity(input?.contentForm);
    const auditStatus = normalizeM2CurrentChannelIdentity(input?.auditStatus);
    if (!rawChannelId && !rawChannelName) {
      throw new Error(
        `m2_current_channel_raw_identity_required:${position + 1}`
      );
    }
    if (!canonicalChannelName) {
      throw new Error(
        `m2_current_channel_canonical_name_required:${position + 1}`
      );
    }
    if (!CHANNEL_ROLES.has(channelRole)) {
      throw new Error(
        `m2_current_channel_role_invalid:${position + 1}`
      );
    }
    if (!REVENUE_MODES.has(revenueMode)) {
      throw new Error(
        `m2_current_channel_revenue_mode_invalid:${position + 1}`
      );
    }
    if (!CONTENT_FORMS.has(contentForm)) {
      throw new Error(
        `m2_current_channel_content_form_invalid:${position + 1}`
      );
    }
    if (!AUDIT_STATUSES.has(auditStatus)) {
      throw new Error(
        `m2_current_channel_audit_status_invalid:${position + 1}`
      );
    }
    if (requireConfirmed && auditStatus !== "confirmed") {
      throw new Error(
        `m2_current_channel_not_confirmed:${position + 1}`
      );
    }
    const rawKey = buildRawPairKey(rawChannelId, rawChannelName);
    if (byRawPair.has(rawKey)) {
      throw new Error(
        `m2_current_channel_raw_pair_duplicate:${position + 1}`
      );
    }
    const channelUid = buildM2CurrentChannelUid(
      canonicalChannelName,
      namespace
    );
    const attributes = {
      channelUid,
      canonicalChannelName,
      channelRole,
      revenueMode,
      contentForm
    };
    const previous = canonicalAttributes.get(channelUid);
    if (
      previous
      && JSON.stringify(previous) !== JSON.stringify(attributes)
    ) {
      throw new Error(
        `m2_current_channel_canonical_attributes_conflict:${position + 1}`
      );
    }
    canonicalAttributes.set(channelUid, attributes);
    const row = Object.freeze({
      rawChannelId,
      rawChannelName,
      ...attributes,
      auditStatus
    });
    byRawPair.set(rawKey, row);
    normalizedRows.push(row);
  }
  return Object.freeze({
    schema: "m2.current.channel_master.v0.1",
    namespace,
    rawPairCount: byRawPair.size,
    canonicalChannelCount: canonicalAttributes.size,
    rows: Object.freeze(normalizedRows),
    byRawPair,
    canonicalAttributes
  });
}

export function applyM2CurrentChannelMaster(
  facts,
  master,
  {
    amountTolerance = 1e-9
  } = {}
) {
  if (!Array.isArray(facts)) {
    throw new Error("m2_current_channel_facts_required");
  }
  if (
    master?.schema !== "m2.current.channel_master.v0.1"
    || !(master.byRawPair instanceof Map)
  ) {
    throw new Error("m2_current_channel_master_invalid");
  }
  const output = [];
  let inputAmount = 0;
  let outputAmount = 0;
  for (const [position, fact] of facts.entries()) {
    const amount = Number(fact?.amount);
    if (!Number.isFinite(amount)) {
      throw new Error(
        `m2_current_channel_fact_amount_invalid:${position + 1}`
      );
    }
    const rawChannelId = normalizeM2CurrentChannelIdentity(
      fact?.rawChannelId
    );
    const rawChannelName = normalizeM2CurrentChannelIdentity(
      fact?.rawChannelName
    );
    const match = master.byRawPair.get(
      buildRawPairKey(rawChannelId, rawChannelName)
    );
    if (!match) {
      throw new Error(
        `m2_current_channel_fact_unmapped:${position + 1}`
      );
    }
    inputAmount += amount;
    outputAmount += amount;
    output.push({
      ...fact,
      rawChannelId,
      rawChannelName,
      channelUid: match.channelUid,
      canonicalChannelName: match.canonicalChannelName,
      channelRole: match.channelRole,
      revenueMode: match.revenueMode,
      contentForm: match.contentForm
    });
  }
  if (output.length !== facts.length) {
    throw new Error("m2_current_channel_mapping_row_conservation_failed");
  }
  if (Math.abs(inputAmount - outputAmount) > amountTolerance) {
    throw new Error("m2_current_channel_mapping_amount_conservation_failed");
  }
  return Object.freeze({
    rows: Object.freeze(output),
    evidence: Object.freeze({
      inputRowCount: facts.length,
      outputRowCount: output.length,
      mappedRowCount: output.length,
      unmappedRowCount: 0,
      inputAmount,
      outputAmount,
      rowConserved: true,
      amountConserved: true
    })
  });
}

function buildRawPairKey(rawChannelId, rawChannelName) {
  return `${rawChannelId}\u001f${rawChannelName}`;
}
