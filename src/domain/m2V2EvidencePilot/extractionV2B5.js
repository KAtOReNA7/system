import { canonicalJson, normalizeEntityText } from "./pilotCore.js";
import {
  V2B5_SOURCE_RECORD_SCHEMA,
  buildV2B5SourceRecordSet,
  validateV2B5SourceRecord,
} from "./sourceRecordV2B5.js";
import {
  V2B5_DEFAULT_SOURCE_GOVERNANCE_POLICY,
  classifyV2B5ProhibitedSource,
  evaluateV2B5PilotUsability,
} from "./sourceGovernanceV2B5.js";

export const V2B5_EXTRACTION_SCHEMA = "m2.v2.evidence-extraction.v0.3";
export const V2B5_EXTRACTION_OUTPUT_SCHEMA_VERSION = "m2.v2.evidence-extraction-output.v0.2";
export const V2B5_EXTRACTION_ADAPTER_VERSION = "m2-v2-relay-extraction-adapter-v0.1";

export const V2B5_CLAIM_TYPES = Object.freeze([
  "work_identity",
  "author_identity",
  "publication_event",
  "original_platform",
  "ranking_signal",
  "rating_signal",
  "review_signal",
  "search_heat_signal",
  "adaptation_event",
  "award_event",
  "market_signal",
  "completion_status",
  "other",
]);

const ENTITY_STATUSES = Object.freeze(["high", "medium", "low", "unresolved", "ambiguous"]);
const AUTHOR_ENTITY_STATUSES = Object.freeze([...ENTITY_STATUSES, "not_applicable"]);
const CONTRADICTION_STATUSES = Object.freeze(["none", "possible", "confirmed", "unresolved", "resolved"]);
const FORBIDDEN_OUTPUT_PATTERNS = Object.freeze([
  /standard[_\s-]*work[_\s-]*id/iu,
  /raw[_\s-]*work[_\s-]*id/iu,
  /internal[_\s-]*(?:id|channel)/iu,
  /B4\s*(?:prediction|forecast|预测)/iu,
  /(?:账单|内部)[^\n]{0,12}收入/iu,
  /合同[^\n]{0,12}(?:金额|条款)/iu,
  /版权[^\n]{0,12}(?:期限|到期)/iu,
  /operatingSuggestion/iu,
  /resourceInvestment/iu,
]);

export function buildV2B5ExtractionPayload(input) {
  const model = cleanText(input?.model, 120);
  const title = cleanText(input?.work?.title, 200);
  const author = cleanText(input?.work?.author, 200);
  const sourceType = input?.work?.sourceType === "publication" ? "publication" : "web_original";
  const sourceRecords = Array.isArray(input?.sourceRecords) ? input.sourceRecords : [];
  if (!model || !title || !author || sourceRecords.length === 0 || sourceRecords.length > 6) {
    throw new Error("v2b5_extraction_input_incomplete");
  }
  for (const record of sourceRecords) {
    const validation = validateV2B5SourceRecord(record);
    if (!validation.valid) throw new Error(`v2b5_extraction_source_invalid:${validation.issues.join(",")}`);
    const prohibited = classifyV2B5ProhibitedSource(record);
    if (prohibited.prohibited) throw new Error(`v2b5_extraction_source_prohibited:${prohibited.categories.join(",")}`);
  }
  const sourceProjection = sourceRecords.map((record) => ({
    sourceId: record.sourceId,
    title: record.title,
    url: record.url,
    domain: record.domain,
    snippet: record.snippet,
    capturedAt: record.capturedAt,
    availableAt: record.availableAt,
    availableAtBasis: record.availableAtBasis,
    sourceTypeCandidate: record.sourceTypeCandidate,
  }));
  const totalSnippetCharacters = sourceProjection.reduce((total, record) => total + [...record.snippet].length, 0);
  if (totalSnippetCharacters > 3_000) throw new Error("v2b5_extraction_snippet_budget_exceeded");
  const repairIssues = Array.isArray(input?.repairIssues)
    ? input.repairIssues.map((value) => safeIssue(value)).filter(Boolean).slice(0, 20)
    : [];
  const instructions = [
    "Extract structured evidence only from the supplied SOURCE_RECORDS.",
    "Do not search, browse, call tools, or use outside knowledge.",
    "Every entity support and claim must cite supplied sourceIds; never invent a sourceId.",
    "Do not output URLs. URLs exist only in the supplied source records for local source mapping.",
    "Unknown eventTime must be null. Do not infer publication time from the current retrieval time.",
    "Do not predict revenue, assign commercial value, or give operating recommendations.",
    "Return only the strict JSON schema.",
  ];
  if (repairIssues.length) instructions.push(`Previous local validation issues to repair: ${repairIssues.join(", ")}`);
  instructions.push("WORK:", canonicalJson({ title, author, sourceType }), "SOURCE_RECORDS:", canonicalJson(sourceProjection));
  const payload = {
    model,
    input: instructions.join("\n"),
    text: { format: extractionJsonSchemaFormat() },
    store: false,
    max_output_tokens: boundedInteger(input?.maxOutputTokens, 1_200, 256, 1_200),
  };
  if (input?.includeReasoning !== false) {
    payload.reasoning = { effort: input?.reasoningEffort === "low" ? "low" : "low" };
  }
  const outbound = validateV2B5ExtractionOutboundPayload(payload, {
    title,
    author,
    sourceRecords,
  });
  if (!outbound.valid) throw new Error(`v2b5_extraction_outbound_invalid:${outbound.issues.join(",")}`);
  return payload;
}

export function validateV2B5ExtractionOutboundPayload(payload, context = {}) {
  const issues = [];
  if (!isObject(payload)) return { valid: false, issues: ["payload_not_object"] };
  if (Object.hasOwn(payload, "tools")) issues.push("tools_prohibited");
  if (/web_search|computer-use|browser/iu.test(canonicalJson(payload))) issues.push("search_or_browser_prohibited");
  if (payload.store !== false) issues.push("store_must_be_false");
  if (payload?.text?.format?.type !== "json_schema" || payload?.text?.format?.strict !== true) issues.push("strict_json_schema_missing");
  if (!Number.isInteger(payload.max_output_tokens) || payload.max_output_tokens > 1_200) issues.push("output_token_cap_invalid");
  for (const forbidden of ["standardWorkId", "workReference", "identityDigest", "queryId", "providerRequestId", "providerReceiptRef", "providerScore"]) {
    if (canonicalJson(payload).includes(`\"${forbidden}\"`)) issues.push(`outbound_forbidden_field:${forbidden}`);
  }
  const authorizedUrls = new Set((context.sourceRecords ?? []).map((record) => record.url));
  for (const url of canonicalJson(payload).match(/https:\/\/[^\s"\\]+/gu) ?? []) {
    if (!authorizedUrls.has(url)) issues.push("outbound_unapproved_url");
  }
  return { valid: issues.length === 0, issues: unique(issues) };
}

export function validateV2B5ExtractionOutput(value) {
  const issues = [];
  if (!isObject(value)) return { valid: false, issues: ["extraction_output_not_object"] };
  exactKeys(value, ["schemaVersion", "entityResolution", "claims", "contradictions", "limitations"], "extraction_output", issues);
  if (value.schemaVersion !== V2B5_EXTRACTION_OUTPUT_SCHEMA_VERSION) issues.push("extraction_schema_version_invalid");
  validateEntityResolution(value.entityResolution, issues);
  if (!Array.isArray(value.claims) || value.claims.length > 20) {
    issues.push("claims_array_invalid");
  } else {
    value.claims.forEach((claim, index) => validateClaim(claim, index, issues));
    const claimIds = value.claims.map((claim) => claim?.claimId);
    if (new Set(claimIds).size !== claimIds.length) issues.push("claim_id_duplicate");
  }
  if (!Array.isArray(value.contradictions) || value.contradictions.length > 20) {
    issues.push("contradictions_array_invalid");
  } else {
    value.contradictions.forEach((contradiction, index) => validateContradiction(contradiction, index, value.claims, issues));
    const keys = value.contradictions.map((item) => item?.contradictionKey);
    if (new Set(keys).size !== keys.length) issues.push("contradiction_key_duplicate");
  }
  validateLimitations(value.limitations, "output", issues);
  return { valid: issues.length === 0, issues: unique(issues) };
}

export function normalizeV2B5ExtractionResponse(json, context = {}) {
  const sourceRecords = Array.isArray(context.sourceRecords) ? context.sourceRecords : [];
  const sourceSet = buildV2B5SourceRecordSet(sourceRecords);
  const sourceById = new Map(sourceRecords.map((record) => [record.sourceId, record]));
  const roots = responseRoots(json);
  const outputText = extractOutputText(roots);
  let structured = roots.map((root) => root?.output_parsed).find(isObject) ?? null;
  const parseIssues = [];
  if (!structured) {
    try { structured = JSON.parse(outputText); } catch { parseIssues.push("strict_json_parse_failed"); }
  }
  const schemaValidation = validateV2B5ExtractionOutput(structured);
  const privateTokens = (context.privateTokens ?? []).map((value) => String(value ?? "")).filter(Boolean);
  const serializedOutput = structured ? canonicalJson(structured) : outputText;
  const modelGeneratedUrlDetected = containsGeneratedUrl(serializedOutput);
  const privateLeakDetected = containsPrivateLeak(serializedOutput, privateTokens);
  const contradictions = new Map((structured?.contradictions ?? []).map((item) => [item.contradictionKey, item]));
  const entityResolution = structured?.entityResolution ?? unresolvedEntityResolution();
  const claims = Array.isArray(structured?.claims) ? structured.claims : [];
  const entityAudit = auditEntityResolution(entityResolution, sourceById, context.work);
  const contradictionAudit = auditLocalContradictions(claims, contradictions);
  const evaluatedEvidence = claims.map((claim, index) => evaluateClaim({
    claim,
    index,
    schemaValid: schemaValidation.valid && parseIssues.length === 0,
    sourceById,
    sourceRecords,
    entityResolution,
    contradictions,
    modelGeneratedUrlDetected,
    privateLeakDetected,
    entityAudit,
    contradictionAudit,
    work: context.work,
    policy: context.governancePolicy ?? V2B5_DEFAULT_SOURCE_GOVERNANCE_POLICY,
  }));
  const claimReferencedIds = claims.flatMap((claim) => Array.isArray(claim?.supportingSourceIds) ? claim.supportingSourceIds : []);
  const entityReferencedIds = [
    ...(Array.isArray(entityResolution?.work?.supportingSourceIds) ? entityResolution.work.supportingSourceIds : []),
    ...(Array.isArray(entityResolution?.author?.supportingSourceIds) ? entityResolution.author.supportingSourceIds : []),
  ];
  const referencedIds = [...claimReferencedIds, ...entityReferencedIds];
  const fabricatedSourceIds = unique(referencedIds.filter((sourceId) => !sourceById.has(sourceId)));
  const mappedReferenceCount = referencedIds.filter((sourceId) => sourceById.has(sourceId)).length;
  const unresolvedOrConflicted = evaluatedEvidence.filter((item) => (
    !["high", "medium"].includes(item.entityResolution?.work?.status)
      || !["none", "resolved"].includes(item.contradictionStatus)
  ));
  const unresolvedOrConflictedAccepted = unresolvedOrConflicted.filter((item) => item.accepted);
  const issues = unique([
    ...parseIssues,
    ...schemaValidation.issues,
    ...(modelGeneratedUrlDetected ? ["model_generated_url"] : []),
    ...(privateLeakDetected ? ["private_leak_detected"] : []),
    ...(fabricatedSourceIds.length ? ["fabricated_source_id"] : []),
    ...entityAudit.issues,
    ...contradictionAudit.issues,
  ]);
  const contractValid = schemaValidation.valid
    && parseIssues.length === 0
    && !modelGeneratedUrlDetected
    && !privateLeakDetected
    && fabricatedSourceIds.length === 0
    && entityAudit.valid;
  return {
    schema: "m2.v2.extraction-layer-result.v0.3",
    extractionSchema: V2B5_EXTRACTION_SCHEMA,
    adapterVersion: V2B5_EXTRACTION_ADAPTER_VERSION,
    sourceRecordSetDigest: sourceSet.sourceRecordSetDigest,
    contractValid,
    structuredValid: schemaValidation.valid && parseIssues.length === 0,
    entityResolution,
    entityAudit,
    claims: evaluatedEvidence,
    contradictions: Array.isArray(structured?.contradictions) ? structured.contradictions : [],
    limitations: Array.isArray(structured?.limitations) ? structured.limitations : [],
    acceptedClaimCount: evaluatedEvidence.filter((item) => item.accepted).length,
    pilotUsableClaimCount: evaluatedEvidence.filter((item) => item.pilotUsable).length,
    rejectedClaimCount: evaluatedEvidence.filter((item) => !item.accepted).length,
    sourceIdReferenceCount: referencedIds.length,
    mappedSourceIdReferenceCount: mappedReferenceCount,
    sourceIdIntegrityRate: referencedIds.length ? mappedReferenceCount / referencedIds.length : 1,
    fabricatedSourceIdCount: fabricatedSourceIds.length,
    modelGeneratedUrlCount: modelGeneratedUrlDetected ? 1 : 0,
    privateLeakCount: privateLeakDetected ? 1 : 0,
    historicalBackfillCount: evaluatedEvidence.filter((item) => item.historicalBackfillDetected).length,
    unresolvedOrConflictedEvidenceExcluded: unresolvedOrConflictedAccepted.length === 0,
    capturedAtCompleteness: sourceRecords.length
      ? sourceRecords.filter((record) => isIsoTimestamp(record.capturedAt)).length / sourceRecords.length
      : 0,
    availableAtCompleteness: sourceRecords.length
      ? sourceRecords.filter((record) => isIsoTimestamp(record.availableAt)).length / sourceRecords.length
      : 0,
    issues,
    rawResponsePersisted: false,
  };
}

export function extractV2B5Usage(json) {
  const root = responseRoots(json).find((candidate) => isObject(candidate?.usage)) ?? {};
  const usage = root.usage ?? {};
  const inputTokens = finiteNonnegativeInteger(usage.input_tokens ?? usage.prompt_tokens);
  const outputTokens = finiteNonnegativeInteger(usage.output_tokens ?? usage.completion_tokens);
  const reportedTotal = finiteNonnegativeInteger(usage.total_tokens);
  const totalTokens = reportedTotal ?? (
    inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null
  );
  return { inputTokens, outputTokens, totalTokens };
}

export function extractV2B5ReturnedModelId(json) {
  const root = responseRoots(json).find((candidate) => typeof candidate?.model === "string");
  return cleanText(root?.model, 120) || null;
}

export function extractV2B5ResponseStatus(json) {
  const root = responseRoots(json).find((candidate) => typeof candidate?.status === "string");
  return cleanText(root?.status, 80) || null;
}

export function compareV2B5ClaimSets(primaryClaims, repeatClaims) {
  const primary = new Set((primaryClaims ?? []).filter((item) => item.pilotUsable).map(claimSignature));
  const repeat = new Set((repeatClaims ?? []).filter((item) => item.pilotUsable).map(claimSignature));
  return jaccard(primary, repeat);
}

export function compareV2B5StructuredValues(primaryClaims, repeatClaims) {
  const primary = new Set((primaryClaims ?? []).filter((item) => item.pilotUsable).map(structuredValueSignature));
  const repeat = new Set((repeatClaims ?? []).filter((item) => item.pilotUsable).map(structuredValueSignature));
  return jaccard(primary, repeat);
}

function evaluateClaim(context) {
  const { claim, index, sourceById, entityResolution, contradictions } = context;
  const reasons = [];
  if (!context.schemaValid) reasons.push("strict_schema_invalid");
  const sourceIds = Array.isArray(claim?.supportingSourceIds) ? claim.supportingSourceIds : [];
  if (sourceIds.length === 0) reasons.push("source_id_missing");
  const sources = [];
  for (const sourceId of sourceIds) {
    const source = sourceById.get(sourceId);
    if (!source) reasons.push("source_id_unknown");
    else sources.push(source);
  }
  const citationAligned = sourceIds.length > 0 && sources.length === sourceIds.length;
  if (!citationAligned) reasons.push("source_mapping_invalid");
  if (context.modelGeneratedUrlDetected || containsGeneratedUrl(canonicalJson(claim ?? {}))) reasons.push("model_generated_url");
  if (context.privateLeakDetected || containsPrivateLeak(canonicalJson(claim ?? {}), [])) reasons.push("private_leak_detected");
  let contradictionStatus = resolveContradictionStatus(claim?.contradictionKey, contradictions);
  if (context.contradictionAudit.conflictedClaimIds.has(claim?.claimId)) contradictionStatus = "unresolved";
  if (!["none", "resolved"].includes(contradictionStatus)) reasons.push("conflict_unresolved");
  const workStatus = entityResolution?.work?.status;
  if (!["high", "medium"].includes(workStatus)) reasons.push("work_entity_unresolved_or_ambiguous");
  if (!context.entityAudit.workValid) reasons.push("work_entity_source_mapping_or_support_invalid");
  const claimInvolvesAuthor = claimInvolvesAuthorEntity(claim, context.work);
  if (claimInvolvesAuthor && !["high", "medium"].includes(entityResolution?.author?.status)) {
    reasons.push("author_entity_unresolved_or_ambiguous");
  }
  if (claimInvolvesAuthor && !context.entityAudit.authorValid) reasons.push("author_entity_source_mapping_or_support_invalid");
  const historicalBackfillDetected = sources.some((source) => (
    source.availableAt !== source.capturedAt || source.availableAtBasis !== "first_observed_by_system"
  ));
  if (historicalBackfillDetected) reasons.push("historical_backfill_detected");
  for (const source of sources) {
    if (classifyV2B5ProhibitedSource(source).prohibited) reasons.push("prohibited_source");
    if (!isIsoTimestamp(source.capturedAt) || !isIsoTimestamp(source.availableAt)) reasons.push("source_time_missing");
  }
  if (claim?.eventTime !== null && claim?.eventTime !== undefined && !eventTimeSupportedBySources(claim.eventTime, sources, claim)) {
    reasons.push("event_time_not_supported_by_source");
  }
  if (sources.length && !claimSupportedBySources(claim, sources, context.work)) reasons.push("claim_exceeds_snippet_support");
  const rejectionReasons = unique(reasons);
  const accepted = rejectionReasons.length === 0;
  const availableAt = accepted && sources.length
    ? sources.map((source) => source.availableAt).sort().at(-1)
    : null;
  const governance = evaluateV2B5PilotUsability({
    accepted,
    sources,
    entityResolution,
    claimInvolvesAuthor,
    contradictionStatus,
    citationAligned,
    privateLeakDetected: rejectionReasons.includes("private_leak_detected"),
    historicalBackfillDetected,
  }, context.policy);
  return {
    claimId: cleanText(claim?.claimId, 120) || `invalid_claim_${index}`,
    claim: renderLocalClaimText(claim),
    claimType: V2B5_CLAIM_TYPES.includes(claim?.claimType) ? claim.claimType : "other",
    structuredValue: isObject(claim?.structuredValue) ? structuredClone(claim.structuredValue) : null,
    supportingSourceIds: sourceIds,
    confidence: Number.isFinite(claim?.confidence) ? claim.confidence : null,
    eventTime: isIsoTimestamp(claim?.eventTime) ? claim.eventTime : null,
    availableAt,
    availableAtBasis: availableAt ? "max_first_observed_source_time" : null,
    entityResolution: structuredClone(entityResolution),
    contradictionStatus,
    limitations: Array.isArray(claim?.limitations) ? claim.limitations : [],
    citationAligned,
    sourceMappingValid: citationAligned,
    accepted,
    pilotUsable: governance.pilotUsable,
    researchApproved: false,
    modelEligible: false,
    researchOnly: true,
    termsReviewStatus: "pending",
    legalReviewStatus: "pending",
    historicalBackfillDetected,
    rejectionReasons: unique([...rejectionReasons, ...governance.rejectionReasons]),
  };
}

function claimSupportedBySources(claim, sources, work = {}) {
  const haystack = normalizeSupportText(sources.map((source) => `${source.title} ${source.snippet}`).join(" "));
  if (!haystack) return false;
  if (claim?.claimType === "work_identity") {
    const expectedTitle = normalizeSupportText(work?.title);
    return Boolean(expectedTitle && haystack.includes(expectedTitle));
  }
  if (claim?.claimType === "author_identity") {
    const expectedAuthor = normalizeSupportText(work?.author);
    return Boolean(expectedAuthor && haystack.includes(expectedAuthor));
  }
  const activeValue = activeStructuredValue(claim?.structuredValue);
  if (activeValue !== null) {
    const normalizedValue = normalizeSupportText(String(activeValue));
    if (normalizedValue && haystack.includes(normalizedValue)) return true;
  }
  return false;
}

function activeStructuredValue(value) {
  if (!isObject(value)) return null;
  return {
    text: value.textValue,
    date: value.dateValue,
    number: value.numberValue,
    boolean: value.booleanValue,
  }[value.valueType] ?? null;
}

function normalizeSupportText(value) {
  return normalizeEntityText(value).replace(/["'“”‘’]/gu, "");
}

function eventTimeSupportedBySources(eventTime, sources, claim) {
  if (!isIsoTimestamp(eventTime)) return false;
  const date = new Date(eventTime);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const forms = [
    `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    `${year}/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`,
    `${year}.${String(month).padStart(2, "0")}.${String(day).padStart(2, "0")}`,
    `${year}年${month}月${day}日`,
  ];
  const activeValue = activeStructuredValue(claim?.structuredValue);
  if (claim?.structuredValue?.valueType === "date") {
    const dateValue = String(activeValue ?? "").slice(0, 10);
    if (dateValue !== eventTime.slice(0, 10)) return false;
  }
  const normalizedValue = claim?.structuredValue?.valueType === "date"
    ? "" : normalizeSupportText(String(activeValue ?? ""));
  return sources.some((source) => {
    const text = `${source.title} ${source.snippet}`;
    if (!forms.some((form) => text.includes(form))) return false;
    return !normalizedValue || normalizeSupportText(text).includes(normalizedValue);
  });
}

function claimInvolvesAuthorEntity(claim, work = {}) {
  if (["author_identity", "publication_event", "award_event"].includes(claim?.claimType)) return true;
  const expectedAuthor = normalizeSupportText(work?.author);
  const value = normalizeSupportText(String(activeStructuredValue(claim?.structuredValue) ?? ""));
  return Boolean(expectedAuthor && value && value.includes(expectedAuthor));
}

function renderLocalClaimText(claim) {
  const type = V2B5_CLAIM_TYPES.includes(claim?.claimType) ? claim.claimType : "other";
  const value = activeStructuredValue(claim?.structuredValue);
  return cleanText(value === null ? type : `${type}: ${String(value)}`, 500);
}

function auditEntityResolution(entityResolution, sourceById, work = {}) {
  const issues = [];
  const audit = (entity, expectedText, label, statuses) => {
    const ids = Array.isArray(entity?.supportingSourceIds) ? entity.supportingSourceIds : [];
    const sources = ids.map((sourceId) => sourceById.get(sourceId)).filter(Boolean);
    const mappingValid = ids.length === sources.length;
    if (!mappingValid) issues.push(`${label}_entity_source_mapping_invalid`);
    if (!statuses.includes(entity?.status)) return mappingValid;
    const expected = normalizeSupportText(expectedText);
    const haystack = normalizeSupportText(sources.map((source) => `${source.title} ${source.snippet}`).join(" "));
    const supported = ids.length > 0 && Boolean(expected) && haystack.includes(expected);
    if (!supported) issues.push(`${label}_entity_source_support_invalid`);
    return mappingValid && supported;
  };
  const workValid = audit(entityResolution?.work, work?.title, "work", ["high", "medium"]);
  const authorValid = entityResolution?.author?.status === "not_applicable"
    ? true
    : audit(entityResolution?.author, work?.author, "author", ["high", "medium"]);
  return { valid: issues.length === 0, workValid, authorValid, issues: unique(issues) };
}

function auditLocalContradictions(claims, contradictions) {
  const conflictedClaimIds = new Set();
  const issues = [];
  const controlledTypes = new Set(["work_identity", "author_identity", "original_platform", "completion_status"]);
  const byType = new Map();
  for (const claim of claims) {
    if (!controlledTypes.has(claim?.claimType)) continue;
    const rows = byType.get(claim.claimType) ?? [];
    rows.push(claim);
    byType.set(claim.claimType, rows);
  }
  for (const [claimType, rows] of byType) {
    const signatures = new Set(rows.map((claim) => canonicalJson(claim.structuredValue)));
    if (signatures.size <= 1) continue;
    rows.forEach((claim) => conflictedClaimIds.add(claim.claimId));
    issues.push(`implicit_conflict:${claimType}`);
  }
  for (const contradiction of contradictions.values()) {
    if (contradiction?.status !== "resolved") continue;
    const linked = claims.filter((claim) => contradiction.claimIds?.includes(claim.claimId));
    if (new Set(linked.map((claim) => canonicalJson(claim.structuredValue))).size <= 1) continue;
    linked.forEach((claim) => conflictedClaimIds.add(claim.claimId));
    issues.push(`unverifiable_resolved_conflict:${contradiction.contradictionKey}`);
  }
  return { conflictedClaimIds, issues: unique(issues) };
}

function resolveContradictionStatus(key, contradictions) {
  if (key === null || key === undefined || key === "") return "none";
  return contradictions.get(key)?.status ?? "unresolved";
}

function validateEntityResolution(value, issues) {
  if (!isObject(value)) {
    issues.push("entity_resolution_missing");
    return;
  }
  exactKeys(value, ["work", "author"], "entity_resolution", issues);
  validateEntityPart(value.work, "work", ENTITY_STATUSES, issues);
  validateEntityPart(value.author, "author", AUTHOR_ENTITY_STATUSES, issues);
}

function validateEntityPart(value, prefix, allowedStatuses, issues) {
  if (!isObject(value)) {
    issues.push(`${prefix}_entity_resolution_missing`);
    return;
  }
  exactKeys(value, ["status", "confidence", "supportingSourceIds"], `${prefix}_entity_resolution`, issues);
  if (!allowedStatuses.includes(value.status)) issues.push(`${prefix}_entity_status_invalid`);
  if (!Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) issues.push(`${prefix}_entity_confidence_invalid`);
  const evidenceRequired = value.status === "high" || value.status === "medium";
  validateSourceIds(value.supportingSourceIds, `${prefix}_entity`, issues, !evidenceRequired);
}

function validateClaim(value, index, issues) {
  const prefix = `claim_${index}`;
  if (!isObject(value)) {
    issues.push(`${prefix}_not_object`);
    return;
  }
  exactKeys(value, ["claimId", "claimType", "structuredValue", "supportingSourceIds", "confidence", "eventTime", "contradictionKey", "limitations"], prefix, issues);
  if (!/^clm_[A-Za-z0-9_-]{1,80}$/u.test(value.claimId ?? "")) issues.push(`${prefix}_id_invalid`);
  if (!V2B5_CLAIM_TYPES.includes(value.claimType)) issues.push(`${prefix}_type_invalid`);
  validateStructuredValue(value.structuredValue, prefix, issues);
  validateSourceIds(value.supportingSourceIds, prefix, issues, false);
  if (!Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) issues.push(`${prefix}_confidence_invalid`);
  if (value.eventTime !== null && !isIsoTimestamp(value.eventTime)) issues.push(`${prefix}_event_time_invalid`);
  if (value.contradictionKey !== null && !/^ctr_[A-Za-z0-9_-]{1,80}$/u.test(value.contradictionKey ?? "")) issues.push(`${prefix}_contradiction_key_invalid`);
  validateLimitations(value.limitations, prefix, issues);
}

function validateContradiction(value, index, claims, issues) {
  const prefix = `contradiction_${index}`;
  if (!isObject(value)) {
    issues.push(`${prefix}_not_object`);
    return;
  }
  exactKeys(value, ["contradictionKey", "claimIds", "status", "reason"], prefix, issues);
  if (!/^ctr_[A-Za-z0-9_-]{1,80}$/u.test(value.contradictionKey ?? "")) issues.push(`${prefix}_key_invalid`);
  if (!Array.isArray(value.claimIds) || new Set(value.claimIds).size !== value.claimIds.length
    || value.claimIds.some((claimId) => !claims?.some((claim) => claim.claimId === claimId))) {
    issues.push(`${prefix}_claim_ids_invalid`);
  }
  if (!CONTRADICTION_STATUSES.includes(value.status)) issues.push(`${prefix}_status_invalid`);
  if (!cleanText(value.reason, 500) || cleanText(value.reason, 500) !== value.reason) issues.push(`${prefix}_reason_invalid`);
}

function validateStructuredValue(value, prefix, issues) {
  if (!isObject(value)) {
    issues.push(`${prefix}_structured_value_missing`);
    return;
  }
  const fields = ["valueType", "textValue", "dateValue", "numberValue", "booleanValue"];
  exactKeys(value, fields, `${prefix}_structured_value`, issues);
  const active = { text: "textValue", date: "dateValue", number: "numberValue", boolean: "booleanValue" }[value.valueType];
  if (!active) {
    issues.push(`${prefix}_value_type_invalid`);
    return;
  }
  for (const field of fields.slice(1)) {
    if (field !== active) {
      if (value[field] !== null) issues.push(`${prefix}_${field}_must_be_null`);
    } else if (field === "numberValue") {
      if (!Number.isFinite(value[field])) issues.push(`${prefix}_${field}_invalid`);
    } else if (field === "booleanValue") {
      if (typeof value[field] !== "boolean") issues.push(`${prefix}_${field}_invalid`);
    } else if (!cleanText(value[field], 500) || cleanText(value[field], 500) !== value[field]) {
      issues.push(`${prefix}_${field}_invalid`);
    }
  }
}

function validateSourceIds(value, prefix, issues, allowEmpty) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)
    || value.some((sourceId) => !/^src_[a-f0-9]{32}$/u.test(sourceId ?? ""))
    || new Set(value).size !== value.length) {
    issues.push(`${prefix}_source_ids_invalid`);
  }
}

function validateLimitations(value, prefix, issues) {
  if (!Array.isArray(value) || value.length > 10
    || value.some((item) => !cleanText(item, 500) || cleanText(item, 500) !== item)) {
    issues.push(`${prefix}_limitations_invalid`);
  }
}

function extractionJsonSchemaFormat() {
  const entity = (statuses) => ({
    type: "object",
    additionalProperties: false,
    properties: {
      status: { type: "string", enum: [...statuses] },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      supportingSourceIds: { type: "array", uniqueItems: true, items: { type: "string", pattern: "^src_[a-f0-9]{32}$" } },
    },
    required: ["status", "confidence", "supportingSourceIds"],
  });
  return {
    type: "json_schema",
    name: "m2_v2_evidence_extraction_v0_2",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        schemaVersion: { type: "string", enum: [V2B5_EXTRACTION_OUTPUT_SCHEMA_VERSION] },
        entityResolution: {
          type: "object",
          additionalProperties: false,
          properties: { work: entity(ENTITY_STATUSES), author: entity(AUTHOR_ENTITY_STATUSES) },
          required: ["work", "author"],
        },
        claims: {
          type: "array",
          maxItems: 20,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              claimId: { type: "string", pattern: "^clm_[A-Za-z0-9_-]{1,80}$" },
              claimType: { type: "string", enum: [...V2B5_CLAIM_TYPES] },
              structuredValue: structuredValueSchema(),
              supportingSourceIds: { type: "array", minItems: 1, uniqueItems: true, items: { type: "string", pattern: "^src_[a-f0-9]{32}$" } },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              eventTime: { type: ["string", "null"] },
              contradictionKey: { type: ["string", "null"] },
              limitations: { type: "array", maxItems: 10, items: { type: "string", minLength: 1, maxLength: 500 } },
            },
            required: ["claimId", "claimType", "structuredValue", "supportingSourceIds", "confidence", "eventTime", "contradictionKey", "limitations"],
          },
        },
        contradictions: {
          type: "array",
          maxItems: 20,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              contradictionKey: { type: "string", pattern: "^ctr_[A-Za-z0-9_-]{1,80}$" },
              claimIds: { type: "array", uniqueItems: true, items: { type: "string", pattern: "^clm_[A-Za-z0-9_-]{1,80}$" } },
              status: { type: "string", enum: [...CONTRADICTION_STATUSES] },
              reason: { type: "string", minLength: 1, maxLength: 500 },
            },
            required: ["contradictionKey", "claimIds", "status", "reason"],
          },
        },
        limitations: { type: "array", maxItems: 10, items: { type: "string", minLength: 1, maxLength: 500 } },
      },
      required: ["schemaVersion", "entityResolution", "claims", "contradictions", "limitations"],
    },
  };
}

function structuredValueSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      valueType: { type: "string", enum: ["text", "date", "number", "boolean"] },
      textValue: { type: ["string", "null"] },
      dateValue: { type: ["string", "null"] },
      numberValue: { type: ["number", "null"] },
      booleanValue: { type: ["boolean", "null"] },
    },
    required: ["valueType", "textValue", "dateValue", "numberValue", "booleanValue"],
  };
}

function responseRoots(json) {
  if (!isObject(json)) return [];
  return [json, json.response, json.data].filter((value, index, values) => isObject(value) && values.indexOf(value) === index);
}

function extractOutputText(roots) {
  const values = [];
  for (const root of roots) {
    if (typeof root.output_text === "string") values.push(root.output_text);
    for (const output of Array.isArray(root.output) ? root.output : []) {
      for (const content of Array.isArray(output?.content) ? output.content : []) {
        if (["output_text", "text"].includes(content?.type) && typeof content.text === "string") values.push(content.text);
      }
    }
    for (const choice of Array.isArray(root.choices) ? root.choices : []) {
      if (typeof choice?.message?.content === "string") values.push(choice.message.content);
    }
  }
  return values.join("\n").trim();
}

function containsGeneratedUrl(value) {
  return /(?:https?:\/\/|www\.)/iu.test(String(value ?? ""));
}

function containsPrivateLeak(value, privateTokens) {
  const text = String(value ?? "");
  if (FORBIDDEN_OUTPUT_PATTERNS.some((pattern) => pattern.test(text))) return true;
  const normalized = text.toLocaleLowerCase("zh-CN");
  return privateTokens.some((token) => normalized.includes(String(token).toLocaleLowerCase("zh-CN")));
}

function unresolvedEntityResolution() {
  return {
    work: { status: "unresolved", confidence: 0, supportingSourceIds: [] },
    author: { status: "unresolved", confidence: 0, supportingSourceIds: [] },
  };
}

function claimSignature(item) {
  return canonicalJson({
    claimType: item.claimType,
    structuredValue: item.structuredValue,
    supportingSourceIds: [...(item.supportingSourceIds ?? [])].sort(),
  });
}

function structuredValueSignature(item) {
  return canonicalJson({ claimType: item.claimType, structuredValue: item.structuredValue });
}

function jaccard(left, right) {
  if (left.size === 0 && right.size === 0) return 0;
  const union = new Set([...left, ...right]);
  let intersection = 0;
  for (const item of left) if (right.has(item)) intersection += 1;
  return union.size ? intersection / union.size : 0;
}

function exactKeys(value, expected, prefix, issues) {
  if (!isObject(value)) return;
  if (canonicalJson(Object.keys(value).sort()) !== canonicalJson([...expected].sort())) issues.push(`${prefix}_keys_invalid`);
}

function cleanText(value, limit) {
  if (typeof value !== "string") return "";
  return [...value.normalize("NFKC").replace(/\s+/gu, " ").trim()].slice(0, limit).join("");
}

function safeIssue(value) {
  const token = String(value ?? "");
  return /^[A-Za-z0-9._:-]{1,120}$/u.test(token) ? token : null;
}

function boundedInteger(value, fallback, minimum, maximum) {
  const number = Number(value ?? fallback);
  return Number.isInteger(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

function finiteNonnegativeInteger(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function isIsoTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function unique(values) {
  return [...new Set(values)];
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
