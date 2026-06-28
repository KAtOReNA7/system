import { M3_NEW_PRODUCT_EXTERNAL_EVIDENCE_FIXTURES } from "./fixtures/newProductExternalEvidence.fixture.js";

export const M3_EXTERNAL_EVIDENCE_TYPES = Object.freeze([
  "originalPlatformStats",
  "rankingSignal",
  "searchHeatSignal",
  "socialHeatSignal",
  "sameNameAudioEvidence",
  "adaptationEvidence",
  "publicationEvidence",
  "reviewReputationEvidence",
  "operatorResearchNote",
  "gptWebAssistedSummary"
]);

export const M3_EVIDENCE_COLLECTION_MODES = Object.freeze([
  "manualEvidenceEntry",
  "gptWebAssistedManualEntry",
  "fixtureEvidenceProvider"
]);

export const M3_FUTURE_EVIDENCE_PROVIDER_INTERFACES = Object.freeze([
  "futureSearchApiProvider",
  "futurePlatformApiProvider",
  "futureBrowserResearchProvider"
]);

const HEAT_EVIDENCE_TYPES = Object.freeze([
  "originalPlatformStats",
  "rankingSignal",
  "searchHeatSignal",
  "socialHeatSignal",
  "reviewReputationEvidence",
  "gptWebAssistedSummary"
]);

export function getFixtureExternalEvidenceForMaterial(materialId) {
  return normalizeExternalEvidence(
    M3_NEW_PRODUCT_EXTERNAL_EVIDENCE_FIXTURES.filter((item) => item.materialId === materialId)
  );
}

export function normalizeExternalEvidence(entries = []) {
  return entries.map((entry, index) => normalizeEvidenceEntry(entry, index));
}

export function normalizeEvidenceEntry(entry = {}, index = 0) {
  const evidenceType = M3_EXTERNAL_EVIDENCE_TYPES.includes(entry.evidenceType)
    ? entry.evidenceType
    : "operatorResearchNote";
  const hasCitedSource = hasValue(entry.sourceUrl) || hasValue(entry.sourceDescription);
  const confidence = normalizeConfidence(entry.confidence, evidenceType, hasCitedSource);
  const sourceReliability = normalizeReliability(entry.sourceReliability, evidenceType, hasCitedSource);
  const limitations = unique([
    ...(Array.isArray(entry.limitations) ? entry.limitations : []),
    ...gptBoundaryLimitations(evidenceType, hasCitedSource, entry.manualConfirmed)
  ]);

  return {
    evidenceId: stringValue(entry.evidenceId, `SYN-M3-EVID-AUTO-${String(index + 1).padStart(3, "0")}`),
    topicId: stringValue(entry.topicId, "SYN-M3-TOPIC"),
    materialId: stringValue(entry.materialId, "SYN-M3-MATERIAL"),
    evidenceType,
    sourceName: stringValue(entry.sourceName, "synthetic evidence source"),
    sourceUrl: stringValue(entry.sourceUrl, ""),
    sourceDescription: stringValue(entry.sourceDescription, ""),
    queryUsed: stringValue(entry.queryUsed, ""),
    collectedAt: stringValue(entry.collectedAt, "2026-06-28T00:00:00Z"),
    collectedBy: normalizeCollectionMode(entry.collectedBy, evidenceType),
    rawExcerptSummary: summarizeShort(entry.rawExcerptSummary),
    metricName: stringValue(entry.metricName, ""),
    metricValue: entry.metricValue ?? null,
    metricUnit: stringValue(entry.metricUnit, ""),
    confidence,
    sourceReliability,
    freshness: normalizeFreshness(entry.freshness),
    manualConfirmed: entry.manualConfirmed === true,
    mappedFields: Array.isArray(entry.mappedFields) ? entry.mappedFields.filter(hasValue) : [],
    limitations,
    nonFormal: true,
    fixtureOnly: true,
    notForFormalDecision: true
  };
}

export function summarizeExternalEvidence(entries = []) {
  const evidence = normalizeExternalEvidence(entries);
  const countByType = (type) => evidence.filter((item) => item.evidenceType === type).length;
  const confidenceCount = (confidence) => evidence.filter((item) => item.confidence === confidence).length;
  const heatEvidence = evidence.filter((item) => HEAT_EVIDENCE_TYPES.includes(item.evidenceType));
  const limitations = [];
  if (evidence.some((item) => item.confidence === "low")) {
    limitations.push("Low-confidence evidence is explanation-only and cannot fill hard blockers.");
  }
  if (evidence.some((item) => !item.manualConfirmed)) {
    limitations.push("Unconfirmed evidence cannot fill hard blockers.");
  }
  if (evidence.some((item) => item.evidenceType === "gptWebAssistedSummary")) {
    limitations.push("GPT web-assisted evidence must retain cited sources and manual confirmation before affecting forecast or rating.");
  }

  return {
    heatSignalEvidenceCount: heatEvidence.length,
    sameNameAudioEvidenceCount: countByType("sameNameAudioEvidence"),
    adaptationEvidenceCount: countByType("adaptationEvidence"),
    publicationEvidenceCount: countByType("publicationEvidence"),
    reviewReputationEvidenceCount: countByType("reviewReputationEvidence"),
    operatorResearchNoteCount: countByType("operatorResearchNote"),
    gptWebAssistedSummaryCount: countByType("gptWebAssistedSummary"),
    highConfidenceEvidenceCount: confidenceCount("high"),
    mediumConfidenceEvidenceCount: confidenceCount("medium"),
    lowConfidenceEvidenceCount: confidenceCount("low"),
    manualConfirmedEvidenceCount: evidence.filter((item) => item.manualConfirmed).length,
    limitations,
    nonFormal: true,
    fixtureOnly: true,
    notForFormalDecision: true
  };
}

export function applyExternalEvidenceToParsedMaterial(parsedMaterial = {}, entries = []) {
  const evidence = normalizeExternalEvidence(entries);
  const evidenceDerivedFields = buildEvidenceDerivedFields(evidence);
  const normalizedFields = mergeDerivedFields(parsedMaterial.normalizedFields ?? {}, evidenceDerivedFields.derivedFields);
  const missingFields = removeDerivedMissingFields(parsedMaterial.missingFields ?? [], evidenceDerivedFields.derivedFields);
  return {
    ...parsedMaterial,
    normalizedFields,
    missingFields,
    evidenceDerivedFields
  };
}

export function buildEvidenceDerivedFields(entries = []) {
  const evidence = normalizeExternalEvidence(entries);
  const derivedFields = {};
  const appliedEvidence = [];
  const limitations = [];

  const heatEvidence = evidence.filter((item) => HEAT_EVIDENCE_TYPES.includes(item.evidenceType));
  const confirmedHeat = heatEvidence.filter(canFillHardBlocker);
  if (confirmedHeat.length > 0) {
    derivedFields.externalHeat = {
      evidenceIds: confirmedHeat.map((item) => item.evidenceId),
      source: "externalEvidence",
      level: strongestHeatLevel(confirmedHeat),
      nonFormal: true
    };
    appliedEvidence.push(...confirmedHeat.map((item) => applied(item, ["externalHeat"])));
  } else if (heatEvidence.length > 0) {
    limitations.push("Heat evidence exists but is not confirmed with sufficient confidence.");
  }

  const sameNameEvidence = evidence.filter((item) => item.evidenceType === "sameNameAudioEvidence");
  const confirmedSameName = sameNameEvidence.find(canFillHardBlocker);
  if (confirmedSameName) {
    derivedFields.sameNameAudioStatusCheckStatus = "checked";
    derivedFields.sameNameAudioStatus = normalizeSameNameMetric(confirmedSameName.metricValue);
    appliedEvidence.push(applied(confirmedSameName, ["sameNameAudioStatusCheckStatus", "sameNameAudioStatus"]));
  } else if (sameNameEvidence.length > 0) {
    limitations.push("Same-name audio evidence exists but is not confirmed with sufficient confidence.");
  }

  const adaptationEvidence = evidence.filter((item) => item.evidenceType === "adaptationEvidence");
  const confirmedAdaptation = adaptationEvidence.filter(canInfluenceEvaluation);
  if (confirmedAdaptation.length > 0) {
    derivedFields.adaptationSignals = unique(
      confirmedAdaptation.map((item) => stringValue(item.metricValue, "external_adaptation_signal"))
    );
    appliedEvidence.push(...confirmedAdaptation.map((item) => applied(item, ["adaptationSignals"])));
  } else if (adaptationEvidence.length > 0) {
    limitations.push("Adaptation evidence exists but remains unconfirmed or low confidence.");
  }

  return {
    derivedFields,
    appliedEvidence,
    limitations,
    nonFormal: true,
    fixtureOnly: true,
    notForFormalDecision: true
  };
}

export function canFillHardBlocker(evidence) {
  return evidence.manualConfirmed === true && ["high", "medium"].includes(evidence.confidence) && hasSource(evidence);
}

export function canInfluenceEvaluation(evidence) {
  return evidence.manualConfirmed === true && ["high", "medium"].includes(evidence.confidence) && hasSource(evidence);
}

function normalizeConfidence(confidence, evidenceType, hasCitedSource) {
  const normalized = ["high", "medium", "low"].includes(confidence) ? confidence : "low";
  if (evidenceType === "gptWebAssistedSummary" && !hasCitedSource) return "low";
  if (evidenceType === "gptWebAssistedSummary" && normalized === "high") return "medium";
  return normalized;
}

function normalizeReliability(sourceReliability, evidenceType, hasCitedSource) {
  if (evidenceType === "gptWebAssistedSummary" && !hasCitedSource) return "low";
  if (["high", "medium", "low"].includes(sourceReliability)) return sourceReliability;
  return evidenceType === "operatorResearchNote" ? "low" : "medium";
}

function normalizeCollectionMode(collectedBy, evidenceType) {
  if (M3_EVIDENCE_COLLECTION_MODES.includes(collectedBy)) return collectedBy;
  if (evidenceType === "gptWebAssistedSummary") return "gptWebAssistedManualEntry";
  return "fixtureEvidenceProvider";
}

function normalizeFreshness(value) {
  return ["recent", "usable", "stale", "unknown"].includes(value) ? value : "unknown";
}

function gptBoundaryLimitations(evidenceType, hasCitedSource, manualConfirmed) {
  if (evidenceType !== "gptWebAssistedSummary") return [];
  const limitations = ["GPT web-assisted summaries are manual research notes, not automatic facts."];
  if (!hasCitedSource) {
    limitations.push("No cited source is present; evidence is low confidence only.");
  }
  if (!manualConfirmed) {
    limitations.push("Manual confirmation is required before evidence affects forecast or rating.");
  }
  return limitations;
}

function mergeDerivedFields(fields, derivedFields) {
  const merged = { ...fields };
  if (derivedFields.externalHeat && !hasValue(merged.externalHeat)) {
    merged.externalHeat = derivedFields.externalHeat;
  }
  if (derivedFields.sameNameAudioStatusCheckStatus && !hasValue(merged.sameNameAudioStatusCheckStatus)) {
    merged.sameNameAudioStatusCheckStatus = derivedFields.sameNameAudioStatusCheckStatus;
  }
  if (derivedFields.sameNameAudioStatus && !hasValue(merged.sameNameAudioStatus)) {
    merged.sameNameAudioStatus = derivedFields.sameNameAudioStatus;
  }
  if (Array.isArray(derivedFields.adaptationSignals) && !hasValue(merged.adaptationSignals)) {
    merged.adaptationSignals = derivedFields.adaptationSignals;
  }
  return merged;
}

function removeDerivedMissingFields(missingFields, derivedFields) {
  const derivedKeys = new Set(Object.keys(derivedFields));
  if (derivedFields.externalHeat) {
    derivedKeys.add("rankings");
    derivedKeys.add("searchHeat");
    derivedKeys.add("socialHeat");
    derivedKeys.add("platformHeat");
  }
  return missingFields.filter((field) => !derivedKeys.has(field));
}

function applied(evidence, mappedFields) {
  return {
    evidenceId: evidence.evidenceId,
    evidenceType: evidence.evidenceType,
    mappedFields,
    confidence: evidence.confidence,
    manualConfirmed: evidence.manualConfirmed
  };
}

function strongestHeatLevel(entries) {
  if (entries.some((item) => item.confidence === "high")) return "strong";
  if (entries.some((item) => item.confidence === "medium")) return "usable";
  return "limited";
}

function normalizeSameNameMetric(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["has", "yes", "true", "present", "existing"].includes(normalized)) return "has";
  if (["none", "no", "false", "absent"].includes(normalized)) return "none";
  return "unknown";
}

function hasSource(evidence) {
  return hasValue(evidence.sourceUrl) || hasValue(evidence.sourceDescription);
}

function summarizeShort(value) {
  const text = stringValue(value, "");
  return text.length > 240 ? `${text.slice(0, 237)}...` : text;
}

function stringValue(value, fallback) {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function unique(values) {
  return [...new Set(values.filter(hasValue))];
}

function hasValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}
