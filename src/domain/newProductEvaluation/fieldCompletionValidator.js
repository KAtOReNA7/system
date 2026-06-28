const VALID_SOURCES = Object.freeze(["publication", "web_original"]);
const VALID_AUDIO_STATUSES = Object.freeze(["has", "none", "unknown"]);

export function validateFieldCompletionRows(rows = []) {
  const issues = [];
  if (!Array.isArray(rows) || rows.length === 0) {
    issues.push(issue("pack", "rows", "missing_rows"));
    return result(issues, 0);
  }

  for (const row of rows) {
    const materialId = sanitizeMaterialId(row?.anonymousMaterialId);
    const fields = row?.userFields ?? {};
    requireValue(issues, materialId, fields.title, "title");
    requireValue(issues, materialId, fields.author, "author");
    requireOneOf(issues, materialId, normalizeSource(fields.source), "source", VALID_SOURCES);
    requireValue(issues, materialId, fields.classification, "classification");
    if (!hasValue(fields.wordCount) && !hasValue(fields.audioVolumeEstimate)) {
      issues.push(issue(materialId, "wordCountOrAudioVolumeEstimate", "missing_required_either_field"));
    }
    if (!hasValue(fields.heatSignalType) || !hasValue(fields.heatSignalValue)) {
      issues.push(issue(materialId, "heatSignal", "missing_required_pair"));
    }
    requireValue(issues, materialId, fields.copyrightTermRange, "copyrightTermRange");
    if (splitList(fields.targetChannels).length === 0) {
      issues.push(issue(materialId, "targetChannels", "missing_required_field"));
    }
    if (normalizeCheckStatus(fields.sameNameAudioStatusCheckStatus) !== "checked") {
      issues.push(issue(materialId, "sameNameAudioStatusCheckStatus", "must_be_checked"));
    }
    requireOneOf(
      issues,
      materialId,
      normalizeAudioStatus(fields.sameNameAudioStatus),
      "sameNameAudioStatus",
      VALID_AUDIO_STATUSES
    );
    if (normalizeSource(fields.source) === "web_original" && !hasValue(fields.completionStatus)) {
      issues.push(issue(materialId, "completionStatus", "web_original_requires_completion_status"));
    }
  }

  return result(issues, rows.length);
}

export function assertValidFieldCompletionRows(rows = []) {
  const validation = validateFieldCompletionRows(rows);
  if (!validation.ok) {
    const error = new Error("field completion pack has missing or invalid fields");
    error.code = "field_completion_validation_failed";
    error.validation = validation;
    throw error;
  }
  return validation;
}

export function summarizeValidationIssues(issues = []) {
  return {
    issueCount: issues.length,
    issueDistribution: countBy(issues, "field"),
    missingByAnonymousMaterial: issues.reduce((items, item) => {
      const existing = items.find((entry) => entry.anonymousMaterialId === item.anonymousMaterialId);
      if (existing) {
        existing.fields.push(item.field);
      } else {
        items.push({ anonymousMaterialId: item.anonymousMaterialId, fields: [item.field] });
      }
      return items;
    }, [])
  };
}

export function normalizeSource(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["publication", "published"].includes(normalized)) return "publication";
  if (["web_original", "original_web"].includes(normalized)) return "web_original";
  return normalized;
}

export function normalizeAudioStatus(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["has", "yes", "true"].includes(normalized)) return "has";
  if (["none", "no", "false"].includes(normalized)) return "none";
  if (normalized === "unknown") return "unknown";
  return normalized;
}

export function normalizeCheckStatus(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["checked", "yes", "true", "confirmed"].includes(normalized)) return "checked";
  if (["unchecked", "not_checked", "no", "false", "pending"].includes(normalized)) return "unchecked";
  return normalized;
}

function result(issues, rowCount) {
  return {
    ok: issues.length === 0,
    rowCount,
    issueCount: issues.length,
    issues,
    ...summarizeValidationIssues(issues),
    realFieldValuesPrinted: false
  };
}

function requireValue(issues, materialId, value, field) {
  if (!hasValue(value)) {
    issues.push(issue(materialId, field, "missing_required_field"));
  }
}

function requireOneOf(issues, materialId, value, field, allowedValues) {
  if (!hasValue(value)) {
    issues.push(issue(materialId, field, "missing_required_field"));
    return;
  }
  if (!allowedValues.includes(value)) {
    issues.push(issue(materialId, field, "invalid_value"));
  }
}

function issue(anonymousMaterialId, field, code) {
  return {
    anonymousMaterialId: sanitizeMaterialId(anonymousMaterialId),
    field,
    code
  };
}

function sanitizeMaterialId(value) {
  const text = String(value ?? "").trim();
  return text || "UNKNOWN-ANON-MATERIAL";
}

function hasValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function splitList(value) {
  if (Array.isArray(value)) return value.filter(hasValue);
  return String(value ?? "").split(/[;,\n]/).map((item) => item.trim()).filter(Boolean);
}

function countBy(values, key) {
  return values.reduce((counts, value) => {
    const group = value?.[key] ?? "unknown";
    counts[group] = (counts[group] ?? 0) + 1;
    return counts;
  }, {});
}
