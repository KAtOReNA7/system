import { canonicalJson, sha256 } from "./pilotCore.js";

export const V2B3_PIPELINE_VERSION = "m2-v2-evidence-pipeline-v2b3-v0.1";
export const V2B3_SOURCE_RECORD_SCHEMA = "m2.v2.evidence-source-record.v0.1";
export const V2B3_EXTRACTION_SCHEMA = "m2.v2.evidence-extraction.v0.2";
export const V2B3_SOURCE_GOVERNANCE_SCHEMA = "m2.v2.source-governance-policy.v0.2";

export const V2B3_SOURCE_RECORD_FIELDS = Object.freeze([
  "sourceId",
  "title",
  "url",
  "domain",
  "snippet",
  "citation",
  "capturedAt",
  "providerReceipt",
]);

export const V2B3_EVIDENCE_FIELDS = Object.freeze([
  "claim",
  "claimType",
  "structuredValue",
  "sourceIds",
  "confidence",
  "eventTime",
  "availableAt",
  "entityResolution",
  "contradictionStatus",
]);

const CLAIM_TYPES = Object.freeze([
  "work_identity",
  "author_identity",
  "publication_event",
  "adaptation_event",
  "award_event",
  "original_platform",
  "ranking_signal",
  "market_signal",
  "other",
]);
const ENTITY_RESOLUTION_STATUSES = Object.freeze(["high", "medium", "low", "unresolved"]);
const CONTRADICTION_STATUSES = Object.freeze(["none", "possible", "confirmed", "unresolved"]);
const CONTENT_TYPES = new Set(["output_text", "text"]);

export const DEFAULT_V2B3_SOURCE_GOVERNANCE_POLICY = deepFreeze({
  schema: V2B3_SOURCE_GOVERNANCE_SCHEMA,
  status: "fail_closed_contract_ready",
  effectiveDate: "2026-07-18",
  researchAllowlist: {
    purpose: "pilot_research_only",
    explicitDomainEntryRequired: true,
    approvedDomainEntries: [],
  },
  modelAllowlist: {
    purpose: "model_eligibility",
    defaultEmpty: true,
    explicitDomainEntryRequired: true,
    approvedDomainEntries: [],
  },
  promotionRule: {
    researchApprovalDoesNotImplyModelApproval: true,
    explicitModelApprovalRequired: true,
    automaticPromotionForbidden: true,
  },
  modelEligibilityRule: {
    sourceIdRequired: true,
    citationRequired: true,
    availableAtRequired: true,
    entityResolvedRequired: true,
    contradictionStatusRequired: "none",
  },
});

export function planV2B3SearchQueries(input) {
  const title = cleanText(input?.title, 200);
  const author = cleanText(input?.author, 200);
  const sourceType = input?.sourceType === "publication" ? "publication" : "web_original";
  const intent = cleanText(input?.intent, 650);
  if (!title || !author || !intent) throw new Error("v2b3_query_plan_input_incomplete");
  const identityDigest = sha256([title, author, sourceType]);
  return [{
    queryId: `qry_${sha256([identityDigest, intent]).slice(0, 20)}`,
    queryText: `\"${title}\" \"${author}\" ${intent}`,
    intent,
    sourceType,
    identityDigest,
  }];
}

export function buildV2B3SearchPayload(input) {
  const model = cleanText(input?.model, 120);
  const plan = input?.plan ?? planV2B3SearchQueries(input);
  if (!model || !Array.isArray(plan) || plan.length === 0) throw new Error("v2b3_search_payload_input_incomplete");
  for (const query of plan) {
    if (!cleanText(query?.queryText, 1_200) || !cleanText(query?.queryId, 120)) throw new Error("v2b3_search_query_invalid");
  }
  return {
    model,
    input: [
      "Search public web sources for the supplied query plan.",
      "This layer performs discovery only: return source-bearing search output with citations.",
      "Do not synthesize final claims, evidence decisions, model features, or recommendations.",
      "Do not invent sources or citations. Do not include private business data or full-page text.",
      "QUERY_PLAN:",
      canonicalJson(plan),
    ].join("\n"),
    tools: [{ type: "web_search" }],
    include: ["web_search_call.action.sources"],
    store: false,
    max_output_tokens: boundedInteger(input?.maxOutputTokens, 700, 128, 700),
  };
}

export function normalizeV2B3SearchResponse(json, meta = {}) {
  const roots = responseRoots(json);
  const responseShapeValid = roots.some((root) => Array.isArray(root.output) || Array.isArray(root.choices));
  const webSearchObserved = roots.some((root) => (Array.isArray(root.output) ? root.output : []).some(isWebSearchOutput));
  const capturedAt = isIsoTimestamp(meta.capturedAt) ? meta.capturedAt : null;
  const parsed = parseV2B3Citations(json);
  const issues = [...parsed.issues];
  if (!responseShapeValid) issues.push("responses_shape_invalid");
  if (!webSearchObserved) issues.push("web_search_not_observed");
  if (!capturedAt) issues.push("captured_at_invalid");

  const providerReceipt = capturedAt ? buildProviderReceipt(json, meta, capturedAt) : null;
  const sourceRecords = capturedAt && providerReceipt
    ? parsed.citations.map((citation) => citationToSourceRecord(citation, capturedAt, providerReceipt))
    : [];
  for (const sourceRecord of sourceRecords) issues.push(...validateV2B3SourceRecord(sourceRecord).issues);
  if (sourceRecords.length === 0) issues.push("source_record_missing");
  const valid = unique(issues).length === 0;
  return {
    schema: "m2.v2.search-layer-result.v0.1",
    pipelineVersion: V2B3_PIPELINE_VERSION,
    status: valid ? "success" : "contract_failure",
    valid,
    contractValid: valid,
    responseShapeValid,
    webSearchObserved,
    sourceRecords,
    sourceRecordCount: sourceRecords.length,
    finalClaimGenerated: false,
    issues: unique(issues),
    rawResponsePersisted: false,
  };
}

export function parseV2B3Citations(json) {
  const candidates = [];
  const issues = [];
  for (const root of responseRoots(json)) {
    for (const [outputIndex, output] of (Array.isArray(root.output) ? root.output : []).entries()) {
      for (const [contentIndex, content] of (Array.isArray(output?.content) ? output.content : []).entries()) {
        if (!CONTENT_TYPES.has(content?.type) || typeof content?.text !== "string") continue;
        const carriers = [
          ...(Array.isArray(content.annotations) ? content.annotations : []),
          ...(Array.isArray(content.citations) ? content.citations : []),
        ];
        for (const [annotationIndex, annotation] of carriers.entries()) {
          collectCitation(candidates, issues, annotation, {
            allowUntyped: false,
            carrier: "responses_content_annotation",
            annotationPath: "output[*].content[*].annotations_or_citations[*]",
            annotationIndex,
            text: content.text,
            rootNested: root !== json,
            outputIndex,
            contentIndex,
          });
        }
      }
      for (const [annotationIndex, annotation] of (Array.isArray(output?.annotations) ? output.annotations : []).entries()) {
        collectCitation(candidates, issues, annotation, {
          allowUntyped: false,
          carrier: "responses_message_annotation",
          annotationPath: "output[*].annotations[*]",
          annotationIndex,
          text: null,
          rootNested: root !== json,
          outputIndex,
        });
      }
      if (isWebSearchOutput(output)) {
        for (const [sourceIndex, source] of (Array.isArray(output?.action?.sources) ? output.action.sources : []).entries()) {
          collectCitation(candidates, issues, source, {
            allowUntyped: true,
            carrier: "web_search_action_source",
            annotationPath: "output[*].action.sources[*]",
            annotationIndex: sourceIndex,
            text: null,
            rootNested: root !== json,
            outputIndex,
          });
        }
      }
    }
    for (const [choiceIndex, choice] of (Array.isArray(root.choices) ? root.choices : []).entries()) {
      const message = choice?.message;
      if (!message || typeof message.content !== "string") continue;
      const carriers = [
        ...(Array.isArray(message.annotations) ? message.annotations : []),
        ...(Array.isArray(message.citations) ? message.citations : []),
      ];
      for (const [annotationIndex, annotation] of carriers.entries()) {
        collectCitation(candidates, issues, annotation, {
          allowUntyped: true,
          carrier: "relay_nested_citation",
          annotationPath: "choices[*].message.annotations_or_citations[*]",
          annotationIndex,
          text: message.content,
          rootNested: root !== json,
          choiceIndex,
        });
      }
    }
  }
  const byUrl = new Map();
  for (const citation of candidates) {
    const existing = byUrl.get(citation.url);
    if (!existing || (!existing.snippet && citation.snippet)) byUrl.set(citation.url, citation);
  }
  return {
    citations: [...byUrl.values()].sort((left, right) => left.sourceId.localeCompare(right.sourceId)),
    issues: unique(issues),
  };
}

export function validateV2B3SourceRecord(value) {
  const issues = [];
  if (!isObject(value)) return { valid: false, issues: ["source_record_not_object"] };
  exactKeys(value, V2B3_SOURCE_RECORD_FIELDS, "source_record", issues);
  if (typeof value.sourceId !== "string" || !/^src_[a-f0-9]{20}$/u.test(value.sourceId)) issues.push("source_id_invalid");
  const normalizedUrl = normalizeUrl(value.url);
  if (!normalizedUrl || normalizedUrl !== value.url) issues.push("source_url_invalid");
  if (normalizedUrl && value.sourceId !== sourceIdForUrl(normalizedUrl)) issues.push("source_id_url_mismatch");
  const expectedDomain = normalizedUrl ? new URL(normalizedUrl).hostname.toLocaleLowerCase("en-US") : null;
  if (!expectedDomain || value.domain !== expectedDomain) issues.push("source_domain_invalid");
  if (value.title !== null && (typeof value.title !== "string" || !value.title.trim())) issues.push("source_title_invalid");
  if (value.snippet !== null && (typeof value.snippet !== "string" || !value.snippet.trim() || value.snippet.length > 600)) issues.push("source_snippet_invalid");
  validateCitation(value.citation, normalizedUrl, issues);
  if (!isIsoTimestamp(value.capturedAt)) issues.push("source_captured_at_invalid");
  validateProviderReceipt(value.providerReceipt, issues);
  return { valid: issues.length === 0, issues: unique(issues) };
}

export function buildV2B3ExtractionPayload(input) {
  const model = cleanText(input?.model, 120);
  const sourceRecords = Array.isArray(input?.sourceRecords) ? input.sourceRecords : [];
  if (!model || sourceRecords.length === 0) throw new Error("v2b3_extraction_input_incomplete");
  for (const sourceRecord of sourceRecords) {
    const validation = validateV2B3SourceRecord(sourceRecord);
    if (!validation.valid) throw new Error(`v2b3_extraction_source_invalid:${validation.issues.join(",")}`);
  }
  return {
    model,
    input: [
      "Extract evidence only from SOURCE_RECORDS. Do not search the web and do not use unstated knowledge.",
      "Each evidence item must reference one or more supplied sourceIds. Never invent a sourceId.",
      "Evidence without a cited source is invalid. Unknown time fields must be null, never guessed.",
      "Return only the strict JSON schema.",
      "SOURCE_RECORDS:",
      canonicalJson(sourceRecords),
    ].join("\n"),
    text: { format: extractionJsonSchemaFormat() },
    store: false,
    max_output_tokens: boundedInteger(input?.maxOutputTokens, 1_200, 256, 1_200),
  };
}

export function normalizeV2B3ExtractionResponse(json, context = {}) {
  const sourceRecords = Array.isArray(context.sourceRecords) ? context.sourceRecords : [];
  const governancePolicy = context.governancePolicy ?? DEFAULT_V2B3_SOURCE_GOVERNANCE_POLICY;
  const sourceById = new Map(sourceRecords.map((record) => [record?.sourceId, record]));
  const roots = responseRoots(json);
  const outputText = extractOutputText(roots);
  let structured = roots.map((root) => root?.output_parsed).find(isObject) ?? null;
  const parseIssues = [];
  if (!structured) {
    try {
      structured = JSON.parse(outputText);
    } catch {
      parseIssues.push("strict_json_parse_failed");
    }
  }
  const schemaValidation = validateV2B3ExtractionOutput(structured);
  const candidates = Array.isArray(structured?.evidence) ? structured.evidence : [];
  const evaluatedEvidence = candidates.map((evidence, index) => evaluateEvidenceCandidate(
    evidence,
    index,
    sourceById,
    governancePolicy,
  ));
  const rejectedEvidenceCount = evaluatedEvidence.filter((item) => !item.accepted).length;
  const issues = unique([...parseIssues, ...schemaValidation.issues]);
  if (rejectedEvidenceCount > 0) issues.push("evidence_rejected");
  const contractValid = issues.length === 0;
  return {
    schema: "m2.v2.extraction-layer-result.v0.2",
    pipelineVersion: V2B3_PIPELINE_VERSION,
    status: contractValid ? "success" : "contract_failure",
    valid: contractValid,
    contractValid,
    structuredValid: schemaValidation.valid,
    acceptedEvidenceCount: evaluatedEvidence.filter((item) => item.accepted).length,
    rejectedEvidenceCount,
    modelEligibleEvidenceCount: evaluatedEvidence.filter((item) => item.modelEligible).length,
    evaluatedEvidence,
    issues: unique(issues),
    rawResponsePersisted: false,
  };
}

export function validateV2B3ExtractionOutput(value) {
  const issues = [];
  if (!isObject(value)) return { valid: false, issues: ["extraction_output_not_object"] };
  exactKeys(value, ["evidence"], "extraction_output", issues);
  if (!Array.isArray(value.evidence) || value.evidence.length > 10) {
    issues.push("evidence_array_invalid");
  } else {
    value.evidence.forEach((item, index) => validateEvidenceRecord(item, index, issues));
  }
  return { valid: issues.length === 0, issues: unique(issues) };
}

export function createV2B3SourceGovernancePolicy(options = {}) {
  const researchDomains = normalizeDomainEntries(options.researchDomains ?? []);
  const modelDomains = normalizeDomainEntries(options.modelDomains ?? []);
  return deepFreeze({
    ...structuredClone(DEFAULT_V2B3_SOURCE_GOVERNANCE_POLICY),
    effectiveDate: options.effectiveDate ?? DEFAULT_V2B3_SOURCE_GOVERNANCE_POLICY.effectiveDate,
    researchAllowlist: {
      ...structuredClone(DEFAULT_V2B3_SOURCE_GOVERNANCE_POLICY.researchAllowlist),
      approvedDomainEntries: researchDomains,
    },
    modelAllowlist: {
      ...structuredClone(DEFAULT_V2B3_SOURCE_GOVERNANCE_POLICY.modelAllowlist),
      approvedDomainEntries: modelDomains,
    },
  });
}

export function validateV2B3SourceGovernancePolicy(policy) {
  const issues = [];
  if (!isObject(policy)) return { valid: false, issues: ["source_governance_policy_not_object"] };
  if (policy.schema !== V2B3_SOURCE_GOVERNANCE_SCHEMA) issues.push("source_governance_schema_invalid");
  if (!isIsoDate(policy.effectiveDate)) issues.push("source_governance_effective_date_invalid");
  for (const [role, expectedPurpose] of [["researchAllowlist", "pilot_research_only"], ["modelAllowlist", "model_eligibility"]]) {
    const allowlist = policy[role];
    if (!isObject(allowlist)) {
      issues.push(`${role}_missing`);
      continue;
    }
    if (allowlist.purpose !== expectedPurpose) issues.push(`${role}_purpose_invalid`);
    if (allowlist.explicitDomainEntryRequired !== true) issues.push(`${role}_explicit_approval_not_required`);
    try {
      const normalized = normalizeDomainEntries(allowlist.approvedDomainEntries);
      if (canonicalJson(normalized) !== canonicalJson(allowlist.approvedDomainEntries)) issues.push(`${role}_entries_not_canonical`);
    } catch {
      issues.push(`${role}_entries_invalid`);
    }
  }
  if (policy?.modelAllowlist?.defaultEmpty !== true) issues.push("model_allowlist_default_empty_not_declared");
  if (policy?.promotionRule?.researchApprovalDoesNotImplyModelApproval !== true
    || policy?.promotionRule?.explicitModelApprovalRequired !== true
    || policy?.promotionRule?.automaticPromotionForbidden !== true) {
    issues.push("source_governance_promotion_rule_invalid");
  }
  return { valid: issues.length === 0, issues: unique(issues) };
}

export function evaluateV2B3SourceGovernance(sourceRecords, policy = DEFAULT_V2B3_SOURCE_GOVERNANCE_POLICY) {
  const records = Array.isArray(sourceRecords) ? sourceRecords : [];
  const researchDomains = new Set(policy?.researchAllowlist?.approvedDomainEntries ?? []);
  const modelDomains = new Set(policy?.modelAllowlist?.approvedDomainEntries ?? []);
  const validRecords = records.filter((record) => validateV2B3SourceRecord(record).valid);
  const researchAllowed = records.length > 0
    && validRecords.length === records.length
    && records.every((record) => researchDomains.has(record.domain));
  const modelAllowed = records.length > 0
    && validRecords.length === records.length
    && records.every((record) => modelDomains.has(record.domain));
  return {
    researchAllowed,
    modelAllowed,
    researchAllowlistEmpty: researchDomains.size === 0,
    modelAllowlistEmpty: modelDomains.size === 0,
    implicitPromotionUsed: false,
  };
}

function evaluateEvidenceCandidate(evidence, index, sourceById, policy) {
  const schemaIssues = [];
  validateEvidenceRecord(evidence, index, schemaIssues);
  const rejectionReasons = [...schemaIssues];
  const sourceIds = Array.isArray(evidence?.sourceIds) ? evidence.sourceIds : [];
  if (sourceIds.length === 0) rejectionReasons.push("source_id_missing");
  const sources = [];
  for (const sourceId of sourceIds) {
    const source = sourceById.get(sourceId);
    if (!source) {
      rejectionReasons.push("source_id_unknown");
      continue;
    }
    const sourceValidation = validateV2B3SourceRecord(source);
    if (!sourceValidation.valid || !source.citation) rejectionReasons.push("source_citation_missing_or_invalid");
    sources.push(source);
  }
  const accepted = unique(rejectionReasons).length === 0 && sources.length === sourceIds.length;
  const governance = evaluateV2B3SourceGovernance(sources, policy);
  const modelEligibilityReasons = [];
  if (!accepted) modelEligibilityReasons.push("evidence_rejected");
  if (!governance.researchAllowed) modelEligibilityReasons.push("research_domain_not_allowlisted");
  if (!governance.modelAllowed) modelEligibilityReasons.push("model_domain_not_allowlisted");
  const hasEventTime = isIsoTimestamp(evidence?.eventTime);
  const hasAvailableAt = isIsoTimestamp(evidence?.availableAt);
  if (!hasEventTime && !hasAvailableAt) modelEligibilityReasons.push("time_missing");
  if (!hasAvailableAt) modelEligibilityReasons.push("available_at_missing");
  if (evidence?.entityResolution?.status === "unresolved") modelEligibilityReasons.push("entity_unresolved");
  if (evidence?.contradictionStatus !== "none") modelEligibilityReasons.push("contradiction_unresolved");
  return {
    evidence,
    accepted,
    rejectionReasons: unique(rejectionReasons),
    researchEligible: accepted && governance.researchAllowed,
    modelEligible: modelEligibilityReasons.length === 0,
    modelEligibilityReasons: unique(modelEligibilityReasons),
  };
}

function collectCitation(target, issues, annotation, binding) {
  const parsed = unwrapCitation(annotation, binding.allowUntyped);
  if (!parsed) return;
  const span = validateSpan(parsed, binding.text);
  if (!span.valid) {
    issues.push("citation_span_invalid");
    return;
  }
  const carrier = binding.rootNested || parsed.nested
    ? "relay_nested_citation"
    : binding.carrier;
  const snippet = cleanText(parsed.snippet, 600)
    || citationSnippet(binding.text, span.startIndex, span.endIndex);
  const citationId = citationIdForUrl(parsed.url);
  const sourceId = sourceIdForUrl(parsed.url);
  const citation = {
    type: "url_citation",
    carrier,
    annotationPath: binding.annotationPath,
    citationId,
    startIndex: span.startIndex,
    endIndex: span.endIndex,
    annotationDigest: sha256({
      url: parsed.url,
      title: parsed.title,
      carrier,
      annotationPath: binding.annotationPath,
      startIndex: span.startIndex,
      endIndex: span.endIndex,
    }),
  };
  target.push({
    sourceId,
    title: parsed.title,
    url: parsed.url,
    domain: new URL(parsed.url).hostname.toLocaleLowerCase("en-US"),
    snippet,
    citation,
  });
}

function unwrapCitation(annotation, allowUntyped) {
  if (!isObject(annotation)) return null;
  const wrappers = [
    annotation,
    annotation.url_citation,
    annotation.citation,
    annotation.citation?.url_citation,
    annotation.data,
    annotation.data?.url_citation,
    annotation.data?.citation,
    annotation.source,
    annotation.source?.url_citation,
  ].filter(isObject);
  const typed = allowUntyped
    || ["url_citation", "citation", "source"].includes(annotation.type)
    || wrappers.length > 1;
  if (!typed) return null;
  const value = wrappers.find((candidate) => normalizeUrl(candidate.url ?? candidate.uri));
  if (!value) return null;
  const url = normalizeUrl(value.url ?? value.uri);
  return {
    url,
    title: cleanText(value.title ?? annotation.title, 300) || null,
    snippet: cleanText(value.snippet ?? value.text ?? annotation.snippet, 600) || null,
    startIndex: integerOrNull(value.start_index ?? value.startIndex ?? annotation.start_index ?? annotation.startIndex),
    endIndex: integerOrNull(value.end_index ?? value.endIndex ?? annotation.end_index ?? annotation.endIndex),
    nested: value !== annotation,
  };
}

function citationToSourceRecord(value, capturedAt, providerReceipt) {
  return {
    sourceId: value.sourceId,
    title: value.title,
    url: value.url,
    domain: value.domain,
    snippet: value.snippet,
    citation: value.citation,
    capturedAt,
    providerReceipt: structuredClone(providerReceipt),
  };
}

function buildProviderReceipt(json, meta, capturedAt) {
  const roots = responseRoots(json);
  const root = roots.find((candidate) => Array.isArray(candidate.output) || Array.isArray(candidate.choices) || candidate.id || candidate.model) ?? roots[0] ?? {};
  const safe = {
    providerId: cleanText(meta.providerId, 120) || "openai_compatible_relay",
    responseId: cleanText(meta.responseId ?? root.id, 200) || null,
    requestedModelId: cleanText(meta.requestedModelId, 120) || null,
    returnedModelId: cleanText(root.model, 120) || null,
    status: cleanText(root.status, 80) || null,
    receiptDigest: null,
  };
  safe.receiptDigest = /^[a-f0-9]{64}$/u.test(meta.receiptDigest ?? "")
    ? meta.receiptDigest
    : sha256({ ...safe, capturedAt, responseShape: safeResponseShape(root) });
  return safe;
}

function validateCitation(value, normalizedUrl, issues) {
  if (!isObject(value)) {
    issues.push("source_citation_missing");
    return;
  }
  exactKeys(value, ["type", "carrier", "annotationPath", "citationId", "startIndex", "endIndex", "annotationDigest"], "citation", issues);
  if (value.type !== "url_citation") issues.push("citation_type_invalid");
  if (typeof value.carrier !== "string" || !value.carrier) issues.push("citation_carrier_invalid");
  if (typeof value.annotationPath !== "string" || !value.annotationPath) issues.push("citation_path_invalid");
  if (typeof value.citationId !== "string" || !/^cit_[a-f0-9]{20}$/u.test(value.citationId)) issues.push("citation_id_invalid");
  if (normalizedUrl && value.citationId !== citationIdForUrl(normalizedUrl)) issues.push("citation_id_url_mismatch");
  const nullSpan = value.startIndex === null && value.endIndex === null;
  const integerSpan = Number.isInteger(value.startIndex) && Number.isInteger(value.endIndex)
    && value.startIndex >= 0 && value.endIndex > value.startIndex;
  if (!nullSpan && !integerSpan) issues.push("citation_span_invalid");
  if (typeof value.annotationDigest !== "string" || !/^[a-f0-9]{64}$/u.test(value.annotationDigest)) issues.push("citation_digest_invalid");
}

function validateProviderReceipt(value, issues) {
  if (!isObject(value)) {
    issues.push("provider_receipt_missing");
    return;
  }
  exactKeys(value, ["providerId", "responseId", "requestedModelId", "returnedModelId", "status", "receiptDigest"], "provider_receipt", issues);
  if (typeof value.providerId !== "string" || !value.providerId) issues.push("provider_id_invalid");
  for (const key of ["responseId", "requestedModelId", "returnedModelId", "status"]) {
    if (value[key] !== null && typeof value[key] !== "string") issues.push(`provider_receipt_${key}_invalid`);
  }
  if (typeof value.receiptDigest !== "string" || !/^[a-f0-9]{64}$/u.test(value.receiptDigest)) issues.push("provider_receipt_digest_invalid");
}

function validateEvidenceRecord(value, index, issues) {
  const prefix = `evidence_${index}`;
  if (!isObject(value)) {
    issues.push(`${prefix}_not_object`);
    return;
  }
  exactKeys(value, V2B3_EVIDENCE_FIELDS, prefix, issues);
  if (typeof value.claim !== "string" || !value.claim.trim() || value.claim.length > 500) issues.push(`${prefix}_claim_invalid`);
  if (!CLAIM_TYPES.includes(value.claimType)) issues.push(`${prefix}_claim_type_invalid`);
  validateStructuredValue(value.structuredValue, prefix, issues);
  if (!Array.isArray(value.sourceIds) || value.sourceIds.length === 0 || value.sourceIds.some((id) => typeof id !== "string" || !/^src_[a-f0-9]{20}$/u.test(id)) || new Set(value.sourceIds).size !== value.sourceIds.length) {
    issues.push(`${prefix}_source_ids_invalid`);
  }
  if (!Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) issues.push(`${prefix}_confidence_invalid`);
  for (const key of ["eventTime", "availableAt"]) {
    if (value[key] !== null && !isIsoTimestamp(value[key])) issues.push(`${prefix}_${key}_invalid`);
  }
  validateEntityResolution(value.entityResolution, prefix, issues);
  if (!CONTRADICTION_STATUSES.includes(value.contradictionStatus)) issues.push(`${prefix}_contradiction_status_invalid`);
}

function validateStructuredValue(value, prefix, issues) {
  if (!isObject(value)) {
    issues.push(`${prefix}_structured_value_missing`);
    return;
  }
  const fields = ["valueType", "textValue", "dateValue", "numberValue", "booleanValue"];
  exactKeys(value, fields, `${prefix}_structured_value`, issues);
  const active = {
    text: "textValue",
    date: "dateValue",
    number: "numberValue",
    boolean: "booleanValue",
  }[value.valueType];
  if (!active) {
    issues.push(`${prefix}_value_type_invalid`);
    return;
  }
  for (const field of fields.slice(1)) {
    if (field === active) {
      const valid = field === "numberValue"
        ? Number.isFinite(value[field])
        : field === "booleanValue"
          ? typeof value[field] === "boolean"
          : typeof value[field] === "string" && value[field].trim();
      if (!valid) issues.push(`${prefix}_${field}_invalid`);
    } else if (value[field] !== null) {
      issues.push(`${prefix}_${field}_must_be_null`);
    }
  }
}

function validateEntityResolution(value, prefix, issues) {
  if (!isObject(value)) {
    issues.push(`${prefix}_entity_resolution_missing`);
    return;
  }
  exactKeys(value, ["status", "matchedTitle", "matchedAuthor"], `${prefix}_entity_resolution`, issues);
  if (!ENTITY_RESOLUTION_STATUSES.includes(value.status)) issues.push(`${prefix}_entity_resolution_status_invalid`);
  for (const key of ["matchedTitle", "matchedAuthor"]) {
    if (value[key] !== null && (typeof value[key] !== "string" || !value[key].trim())) issues.push(`${prefix}_${key}_invalid`);
  }
}

function extractionJsonSchemaFormat() {
  return {
    type: "json_schema",
    name: "m2_v2_evidence_extraction_v0_2",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        evidence: {
          type: "array",
          maxItems: 10,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              claim: { type: "string", minLength: 1, maxLength: 500 },
              claimType: { type: "string", enum: [...CLAIM_TYPES] },
              structuredValue: structuredValueJsonSchema(),
              sourceIds: { type: "array", minItems: 1, uniqueItems: true, items: { type: "string", pattern: "^src_[a-f0-9]{20}$" } },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              eventTime: { type: ["string", "null"] },
              availableAt: { type: ["string", "null"] },
              entityResolution: {
                type: "object",
                additionalProperties: false,
                properties: {
                  status: { type: "string", enum: [...ENTITY_RESOLUTION_STATUSES] },
                  matchedTitle: { type: ["string", "null"] },
                  matchedAuthor: { type: ["string", "null"] },
                },
                required: ["status", "matchedTitle", "matchedAuthor"],
              },
              contradictionStatus: { type: "string", enum: [...CONTRADICTION_STATUSES] },
            },
            required: [...V2B3_EVIDENCE_FIELDS],
          },
        },
      },
      required: ["evidence"],
    },
  };
}

function structuredValueJsonSchema() {
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

function extractOutputText(roots) {
  const values = [];
  for (const root of roots) {
    if (typeof root.output_text === "string") values.push(root.output_text);
    for (const output of Array.isArray(root.output) ? root.output : []) {
      for (const content of Array.isArray(output?.content) ? output.content : []) {
        if (CONTENT_TYPES.has(content?.type) && typeof content.text === "string") values.push(content.text);
      }
    }
    for (const choice of Array.isArray(root.choices) ? root.choices : []) {
      if (typeof choice?.message?.content === "string") values.push(choice.message.content);
    }
  }
  return values.join("\n").trim();
}

function responseRoots(json) {
  if (!isObject(json)) return [];
  return uniqueObjects([json, json.response, json.data]);
}

function isWebSearchOutput(output) {
  return isObject(output) && (
    ["web_search_call", "web_search"].includes(output.type)
    || ["web_search", "web_search_preview"].includes(output.name)
    || ["web_search", "search"].includes(output?.action?.type)
  );
}

function validateSpan(value, text) {
  const { startIndex, endIndex } = value;
  if (startIndex === null && endIndex === null) return { valid: true, startIndex: null, endIndex: null };
  if (!Number.isInteger(startIndex) || !Number.isInteger(endIndex) || startIndex < 0 || endIndex <= startIndex) return { valid: false };
  if (typeof text === "string" && endIndex > text.length) return { valid: false };
  return { valid: true, startIndex, endIndex };
}

function citationSnippet(text, startIndex, endIndex) {
  if (typeof text !== "string" || !Number.isInteger(startIndex) || !Number.isInteger(endIndex)) return null;
  const left = Math.max(0, startIndex - 240);
  const right = Math.min(text.length, endIndex + 240);
  return cleanText(text.slice(left, right), 600) || null;
}

function safeResponseShape(root) {
  return {
    hasOutput: Array.isArray(root?.output),
    hasChoices: Array.isArray(root?.choices),
    outputTypes: (Array.isArray(root?.output) ? root.output : []).map((item) => cleanText(item?.type, 80) || "unknown"),
  };
}

function normalizeDomainEntries(values) {
  if (!Array.isArray(values)) throw new Error("v2b3_allowlist_not_array");
  const normalized = values.map((value) => String(value ?? "").trim().toLocaleLowerCase("en-US"));
  if (normalized.some((value) => !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u.test(value))) {
    throw new Error("v2b3_allowlist_domain_invalid");
  }
  return unique(normalized).sort();
}

function normalizeUrl(value) {
  try {
    const url = new URL(String(value ?? ""));
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function sourceIdForUrl(url) {
  return `src_${sha256(url).slice(0, 20)}`;
}

function citationIdForUrl(url) {
  return `cit_${sha256(url).slice(0, 20)}`;
}

function exactKeys(value, expected, prefix, issues) {
  if (!isObject(value)) return;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (canonicalJson(actual) !== canonicalJson(wanted)) issues.push(`${prefix}_keys_invalid`);
}

function boundedInteger(value, fallback, minimum, maximum) {
  const number = Number(value ?? fallback);
  return Number.isInteger(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

function integerOrNull(value) {
  return Number.isInteger(value) ? value : null;
}

function isIsoTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function isIsoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00.000Z`));
}

function cleanText(value, limit) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/gu, " ").slice(0, limit);
}

function unique(values) {
  return [...new Set(values)];
}

function uniqueObjects(values) {
  return values.filter((value, index) => isObject(value) && values.indexOf(value) === index);
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
