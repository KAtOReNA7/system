import { validateStructuredRelayOutput as validateLegacyStructuredOutput } from "./canaryCore.js";
import { canonicalJson, sha256 } from "./pilotCore.js";

export const V2B2_ADAPTER_VERSION = "m2-v2-relay-v2b2-v0.1";
export const V2B2_PROMPT_VERSION = "m2-v2-relay-two-stage-prompt-v0.1";
export const V2B2_SCHEMA_VERSION = "m2-v2-relay-extraction-schema-v0.1";

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
const IDENTITY_STATUSES = Object.freeze(["high", "medium", "low", "unresolved"]);
const ENTITY_SUPPORT = Object.freeze(["work", "author", "both"]);
const SOURCE_QUALITY = Object.freeze(["official", "reputable_secondary", "weak", "prohibited", "unknown"]);
const OUTPUT_ITEM_TYPES = new Set(["message", "web_search_call", "tool_call", "function_call"]);
const CONTENT_ITEM_TYPES = new Set(["output_text", "text", "refusal"]);

export function buildV2B2SearchPayload(task, explicitModel = null) {
  const input = normalizePayloadInput(task, explicitModel);
  const title = cleanText(input.workTitle, 200);
  const author = cleanText(input.authorByline, 200);
  const sourceType = input.sourceType === "publication" ? "publication" : "web_original";
  const intent = cleanText(input.queryIntent, 650);
  if (!input.model || !title || !author || !intent) throw new Error("v2b2_search_payload_input_incomplete");
  return {
    model: input.model,
    input: [
      "Search public web sources for the named work and author. Verify the composite work-author identity; title equality alone is insufficient.",
      "Return a concise factual research note with inline source citations. Prefer official or reputable public sources. Do not invent facts or citations.",
      "Include public timing evidence when visible: earliest public availability and event time. Use uncertainty explicitly.",
      "Do not include private business data, revenue, forecasts, full-page text, or long excerpts.",
      `work_title: ${title}`,
      `author_byline: ${author}`,
      `source_type: ${sourceType}`,
      `query_intent: ${intent}`,
    ].join("\n"),
    tools: [{ type: "web_search" }],
    max_output_tokens: boundedInteger(input.maxOutputTokens, 700, 128, 700),
  };
}

export function buildV2B2ExtractionPayload(task, explicitModel = null, explicitSearch = null) {
  const input = normalizePayloadInput(task, explicitModel, explicitSearch);
  const title = cleanText(input.workTitle, 200);
  const author = cleanText(input.authorByline, 200);
  const sourceType = input.sourceType === "publication" ? "publication" : "web_original";
  const intent = cleanText(input.queryIntent, 650);
  const search = input.search ?? {};
  const registry = normalizeRegistryForPrompt(input.citationRegistry ?? search.citationRegistry ?? search.citations ?? []);
  const researchNote = cleanText(search.outputText ?? search.text, 6_000);
  if (!input.model || !title || !author || !intent) throw new Error("v2b2_extraction_payload_input_incomplete");
  if (!researchNote || registry.length === 0) throw new Error("v2b2_extraction_search_artifact_missing");
  const sourceIndex = registry
    .map((citation) => `${citation.citationId}\t${cleanText(citation.title, 240) || "untitled"}\t${citation.url}`)
    .join("\n");
  return {
    model: input.model,
    input: [
      "Extract only facts supported by the supplied stage-1 research note and citation registry.",
      "Return the exact strict JSON schema. Do not use web search in this stage. Never create a citationId; use only an ID from CITATION_REGISTRY.",
      "A candidate is usable only when its citationId directly supports the claim and the named work-author identity. Do not guess missing dates or identities.",
      "claimText must be a short verbatim substring (at most 240 characters) from the cited stage-1 note; structuredValue must be present in that claimText.",
      "For structuredValue, exactly one field matching valueType is non-null; every inactive field must be null.",
      `work_title: ${title}`,
      `author_byline: ${author}`,
      `source_type: ${sourceType}`,
      `query_intent: ${intent}`,
      "STAGE_1_RESEARCH_NOTE:",
      researchNote,
      "CITATION_REGISTRY (citationId, title, URL):",
      sourceIndex,
    ].join("\n"),
    text: { format: extractionJsonSchemaFormat() },
    max_output_tokens: boundedInteger(input.maxOutputTokens, 1_200, 256, 1_200),
  };
}

export function normalizeV2B2SearchResponse(json, meta = {}) {
  const responseShapeValid = isObject(json) && (Array.isArray(json.output) || Array.isArray(json.choices));
  const textItems = extractTrustedTextItems(json);
  const outputText = textItems.map((item) => item.text).join("\n").trim()
    || (typeof json?.output_text === "string" ? json.output_text.trim() : "");
  const webSearchObserved = observeTrustedWebSearch(json);
  const extracted = extractTrustedCitations(json, textItems);
  const issues = [];
  if (!responseShapeValid) issues.push("responses_shape_invalid");
  if (!webSearchObserved) issues.push("web_search_not_observed");
  if (!outputText) issues.push("search_output_text_missing");
  if (extracted.citations.length === 0) issues.push("trusted_citation_missing");
  issues.push(...extracted.issues);
  return {
    status: issues.length === 0 ? "success" : "contract_failure",
    valid: issues.length === 0,
    contractValid: issues.length === 0,
    responsesShapeValid: responseShapeValid,
    webSearchObserved,
    outputText,
    outputTextDigest: outputText ? sha256(outputText) : null,
    citationRegistry: extracted.citations,
    citations: extracted.citations,
    issues: unique(issues),
    usage: normalizeUsage(json?.usage),
    requestedModelId: safeModelId(meta.requestedModelId),
    returnedModelId: safeModelId(json?.model),
    providerStatus: safeToken(json?.status),
    rawResponsePersisted: false,
  };
}

export function normalizeV2B2ExtractionResponse(json, meta = {}) {
  const responseShapeValid = isObject(json) && (Array.isArray(json.output) || Array.isArray(json.choices));
  const textItems = extractTrustedTextItems(json);
  const outputText = textItems.map((item) => item.text).join("\n").trim()
    || (typeof json?.output_text === "string" ? json.output_text.trim() : "");
  let structuredOutput = isObject(json?.output_parsed) ? json.output_parsed : null;
  const issues = [];
  if (!structuredOutput) {
    try {
      structuredOutput = JSON.parse(outputText);
    } catch {
      issues.push("strict_json_parse_failed");
    }
  }
  const validation = validateV2B2StructuredOutput(structuredOutput);
  issues.push(...validation.issues);
  if (!responseShapeValid) issues.push("responses_shape_invalid");
  const valid = responseShapeValid && validation.valid && !issues.includes("strict_json_parse_failed");
  return {
    status: valid ? "success" : "contract_failure",
    valid,
    contractValid: valid,
    responsesShapeValid: responseShapeValid,
    structuredValid: validation.valid,
    structuredOutput,
    structured: structuredOutput,
    evidenceCandidates: Array.isArray(structuredOutput?.evidenceCandidates) ? structuredOutput.evidenceCandidates : [],
    outputTextDigest: outputText ? sha256(outputText) : null,
    issues: unique(issues),
    usage: normalizeUsage(json?.usage),
    requestedModelId: safeModelId(meta.requestedModelId),
    returnedModelId: safeModelId(json?.model),
    providerStatus: safeToken(json?.status),
    rawResponsePersisted: false,
  };
}

export function validateV2B2StructuredOutput(value) {
  const issues = [];
  if (!isObject(value)) return { valid: false, issues: ["output_not_object"] };
  exactKeys(value, ["queryOutcome", "workIdentity", "authorIdentity", "authorWorkRelationshipConfirmed", "evidenceCandidates"], "output", issues);
  if (!["success", "no_result", "ambiguous"].includes(value.queryOutcome)) issues.push("query_outcome_invalid");
  validateIdentity(value.workIdentity, "workIdentity", true, issues);
  validateIdentity(value.authorIdentity, "authorIdentity", false, issues);
  if (typeof value.authorWorkRelationshipConfirmed !== "boolean") issues.push("author_work_relationship_flag_invalid");
  if (!Array.isArray(value.evidenceCandidates) || value.evidenceCandidates.length > 5) {
    issues.push("evidence_candidates_invalid");
  } else {
    value.evidenceCandidates.forEach((candidate, index) => validateCandidate(candidate, index, issues));
  }
  return { valid: issues.length === 0, issues: unique(issues) };
}

export function joinV2B2CitationLineage(input, explicitRegistry = null) {
  const search = input?.search ?? input?.searchArtifact ?? null;
  const extraction = input?.extraction ?? input?.structured ?? input;
  const registry = explicitRegistry ?? input?.citationRegistry ?? search?.citationRegistry ?? search?.citations ?? [];
  const structured = extraction?.structuredOutput ?? extraction?.structured ?? extraction?.value ?? extraction;
  const issues = [];
  const byId = new Map();
  for (const citation of Array.isArray(registry) ? registry : []) {
    const id = typeof citation?.citationId === "string" ? citation.citationId : null;
    if (!id || !/^cit_[a-f0-9]{20}$/u.test(id)) {
      issues.push("invalid_registry_citation_id");
      continue;
    }
    if (byId.has(id)) {
      issues.push("duplicate_registry_citation_id");
      continue;
    }
    if (!isHttpUrl(citation.url)) {
      issues.push("invalid_registry_url");
      continue;
    }
    byId.set(id, citation);
  }
  const candidates = Array.isArray(structured?.evidenceCandidates) ? structured.evidenceCandidates : [];
  const identityIds = [
    ...(structured?.workIdentity?.citationIds ?? []),
    ...(structured?.authorIdentity?.citationIds ?? []),
  ];
  let unsupportedReferenceCount = 0;
  for (const id of [...identityIds, ...candidates.map((candidate) => candidate?.citationId)]) {
    if (typeof id !== "string" || !byId.has(id)) unsupportedReferenceCount += 1;
  }
  if (unsupportedReferenceCount > 0) issues.push("unknown_or_invalid_citation_id");
  let claimSupportUnverifiedCount = 0;
  const joinedCandidates = candidates.flatMap((candidate) => {
    const citation = byId.get(candidate?.citationId);
    if (!citation) return [];
    const parsed = new URL(citation.url);
    const localClaimSupportVerified = candidateSupportsCitation(candidate, citation);
    if (!localClaimSupportVerified) claimSupportUnverifiedCount += 1;
    return [{
      ...candidate,
      sourceUrl: citation.url,
      sourceTitle: citation.title ?? null,
      sourceDomain: parsed.hostname.toLocaleLowerCase("en-US"),
      citationAnnotationDigest: citation.annotationDigest,
      localClaimSupportVerified,
    }];
  });
  const valid = issues.length === 0 && joinedCandidates.length === candidates.length;
  return {
    status: valid ? "success" : "failure",
    valid,
    allCandidatesBound: valid,
    registryCount: byId.size,
    candidateCount: candidates.length,
    boundCandidateCount: joinedCandidates.length,
    supportedCandidateCount: joinedCandidates.filter((candidate) => candidate.localClaimSupportVerified).length,
    claimSupportUnverifiedCount,
    unsupportedReferenceCount,
    issueCodes: unique(issues),
    issues: unique(issues),
    joinedCandidates,
  };
}

export function profileV2B2ResponseShape(json, meta = {}) {
  const outputItemTypeCounts = {};
  const contentItemTypeCounts = {};
  const outputTextPaths = [];
  const toolInvocationPaths = [];
  const annotationPaths = [];
  const annotationTypeCounts = {};
  const annotationFieldPresence = { url: 0, title: 0, startIndex: 0, endIndex: 0, nestedUrlCitation: 0 };
  const strictJsonPaths = [];
  for (const [outputIndex, output] of (Array.isArray(json?.output) ? json.output : []).entries()) {
    count(outputItemTypeCounts, safeShapeType(output?.type));
    if (isWebSearchOutput(output)) toolInvocationPaths.push("output[*]");
    for (const [contentIndex, content] of (Array.isArray(output?.content) ? output.content : []).entries()) {
      count(contentItemTypeCounts, safeShapeType(content?.type));
      if (typeof content?.text === "string") {
        outputTextPaths.push("output[*].content[*].text");
        if (isJsonObjectText(content.text)) strictJsonPaths.push("output[*].content[*].text(json_object)");
      }
      inspectAnnotationCarrier(content?.annotations, "output[*].content[*].annotations[*]");
      if (contentIndex < 0 || outputIndex < 0) throw new Error("unreachable");
    }
    inspectAnnotationCarrier(output?.annotations, "output[*].annotations[*]");
    inspectAnnotationCarrier(output?.action?.sources, "output[*].action.sources[*]");
  }
  for (const choice of Array.isArray(json?.choices) ? json.choices : []) {
    if (typeof choice?.message?.content === "string") {
      outputTextPaths.push("choices[*].message.content");
      if (isJsonObjectText(choice.message.content)) strictJsonPaths.push("choices[*].message.content(json_object)");
    }
    inspectAnnotationCarrier(choice?.message?.annotations, "choices[*].message.annotations[*]");
    inspectAnnotationCarrier(choice?.message?.citations, "choices[*].message.citations[*]");
  }
  if (typeof json?.output_text === "string") outputTextPaths.push("output_text");
  if (isObject(json?.output_parsed)) strictJsonPaths.push("output_parsed");
  const errorKeys = isObject(json?.error) ? Object.keys(json.error).sort() : [];
  const profile = {
    schema: "m2.v2.v2b2.response-shape-profile.v0.1",
    responseObjectType: json === null ? "null" : Array.isArray(json) ? "array" : typeof json,
    outputArrayPresent: Array.isArray(json?.output),
    choicesArrayPresent: Array.isArray(json?.choices),
    outputItemTypeCounts,
    contentItemTypeCounts,
    outputTextLocationTemplates: unique(outputTextPaths),
    toolInvocationLocationTemplates: unique(toolInvocationPaths),
    annotationLocationTemplates: unique(annotationPaths),
    annotationTypeCounts,
    annotationFieldPresence,
    strictJsonLocationTemplates: unique(strictJsonPaths),
    usageLocation: isObject(json?.usage) ? "usage" : null,
    usageFieldPresence: isObject(json?.usage) ? Object.keys(json.usage).sort().map(safeShapeType) : [],
    providerErrorShapeKeySignature: errorKeys.length ? sha256(errorKeys) : null,
    providerErrorPresent: errorKeys.length > 0,
    transportErrorShape: isObject(meta.transportError)
      ? {
          namePresent: typeof meta.transportError.name === "string",
          codePresent: typeof meta.transportError.code === "string",
          name: safeToken(meta.transportError.name),
          code: safeToken(meta.transportError.code),
        }
      : null,
    returnedModelId: safeModelId(json?.model),
    statusFieldPresent: typeof json?.status === "string",
    statusValue: safeToken(json?.status),
    finishFieldLocations: Array.isArray(json?.choices) && json.choices.some((item) => "finish_reason" in (item ?? {}))
      ? ["choices[*].finish_reason"]
      : [],
    httpStatus: Number.isInteger(meta.httpStatus) ? meta.httpStatus : null,
    contentTypeClass: safeToken(meta.contentTypeClass ?? classifyContentType(meta.contentType)),
    rawByteLength: finiteNonnegative(meta.rawByteLength),
    parseStatus: safeToken(meta.parseStatus),
    htmlOrNonJson: meta.parseStatus === "non_json" || classifyContentType(meta.contentType) === "html",
    rawResponsePersisted: false,
  };
  return { ...profile, shapeDigest: sha256(canonicalJson(profile)) };

  function inspectAnnotationCarrier(values, path) {
    if (!Array.isArray(values)) return;
    annotationPaths.push(path);
    for (const annotation of values) {
      const nested = isObject(annotation?.url_citation) ? annotation.url_citation : null;
      const candidate = nested ?? annotation;
      count(annotationTypeCounts, safeShapeType(annotation?.type ?? (path.includes("citations") ? "citation" : "unknown")));
      if (nested) annotationFieldPresence.nestedUrlCitation += 1;
      if (typeof candidate?.url === "string") annotationFieldPresence.url += 1;
      if (typeof candidate?.title === "string") annotationFieldPresence.title += 1;
      if (Number.isInteger(candidate?.start_index ?? candidate?.startIndex)) annotationFieldPresence.startIndex += 1;
      if (Number.isInteger(candidate?.end_index ?? candidate?.endIndex)) annotationFieldPresence.endIndex += 1;
    }
  }
}

export function buildV2B2PhysicalRequestKey(parts) {
  if (!isObject(parts)) throw new Error("v2b2_request_key_parts_invalid");
  const payload = Object.fromEntries(
    Object.entries(parts)
      .filter(([, value]) => value !== undefined)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  for (const required of ["model", "stage", "adapterVersion", "promptVersion", "schemaVersion"]) {
    if (typeof payload[required] !== "string" || !payload[required]) throw new Error(`v2b2_request_key_${required}_missing`);
  }
  if (!["search", "extraction"].includes(payload.stage)) throw new Error("v2b2_request_key_stage_invalid");
  return sha256(canonicalJson(payload));
}

export function classifyLegacyCanaryReceipts(receipts) {
  if (!Array.isArray(receipts)) throw new Error("v2b2_legacy_receipts_invalid");
  return receipts.map((receipt) => {
    if (receipt?.status !== "success" || !isObject(receipt?.structuredResponse)) return "provider_or_request_failure";
    return validateLegacyStructuredOutput(receipt.structuredResponse).valid
      ? "local_strict_success"
      : "relay_success_local_schema_failure";
  });
}

function extractTrustedTextItems(json) {
  const items = [];
  for (const [outputIndex, output] of (Array.isArray(json?.output) ? json.output : []).entries()) {
    for (const [contentIndex, content] of (Array.isArray(output?.content) ? output.content : []).entries()) {
      if (!CONTENT_ITEM_TYPES.has(content?.type) || typeof content?.text !== "string") continue;
      items.push({
        key: `output.${outputIndex}.content.${contentIndex}`,
        pathTemplate: "output[*].content[*]",
        text: content.text,
        textDigest: sha256(content.text),
        annotations: Array.isArray(content.annotations) ? content.annotations : [],
      });
    }
  }
  for (const [choiceIndex, choice] of (Array.isArray(json?.choices) ? json.choices : []).entries()) {
    if (typeof choice?.message?.content !== "string") continue;
    items.push({
      key: `choices.${choiceIndex}.message`,
      pathTemplate: "choices[*].message",
      text: choice.message.content,
      textDigest: sha256(choice.message.content),
      annotations: [
        ...(Array.isArray(choice.message.annotations) ? choice.message.annotations : []),
        ...(Array.isArray(choice.message.citations) ? choice.message.citations : []),
      ],
      chatCitationCarrier: true,
    });
  }
  return items;
}

function observeTrustedWebSearch(json) {
  return (Array.isArray(json?.output) ? json.output : []).some((output) => isWebSearchOutput(output));
}

function isWebSearchOutput(output) {
  if (!isObject(output)) return false;
  if (["web_search_call", "web_search"].includes(output.type)) return true;
  if (["web_search", "web_search_preview"].includes(output.name)) return true;
  return ["web_search", "search"].includes(output?.action?.type);
}

function extractTrustedCitations(json, textItems) {
  const candidates = [];
  const issues = [];
  for (const item of textItems) {
    for (const [annotationIndex, annotation] of item.annotations.entries()) {
      const parsed = parseTrustedAnnotation(annotation, { allowUntyped: item.chatCitationCarrier === true });
      if (!parsed) continue;
      const span = validateSpan(parsed, item.text);
      if (!span.valid) {
        issues.push("citation_span_invalid");
        continue;
      }
      candidates.push(buildCitation(parsed, {
        carrier: item.chatCitationCarrier ? "chat_message_annotation" : "responses_content_annotation",
        pathTemplate: item.chatCitationCarrier
          ? "choices[*].message.annotations_or_citations[*]"
          : "output[*].content[*].annotations[*]",
        textDigest: item.textDigest,
        supportExcerpt: citationSupportExcerpt(item.text, span.startIndex, span.endIndex),
        annotationIndex,
        ...span,
      }));
    }
  }
  for (const output of Array.isArray(json?.output) ? json.output : []) {
    for (const [annotationIndex, annotation] of (Array.isArray(output?.annotations) ? output.annotations : []).entries()) {
      const parsed = parseTrustedAnnotation(annotation, { allowUntyped: false });
      if (!parsed) continue;
      if (parsed.startIndex !== null || parsed.endIndex !== null) {
        issues.push("unbound_output_annotation_span");
        continue;
      }
      candidates.push(buildCitation(parsed, {
        carrier: "responses_message_annotation",
        pathTemplate: "output[*].annotations[*]",
        textDigest: null,
        supportExcerpt: null,
        annotationIndex,
        startIndex: null,
        endIndex: null,
      }));
    }
    const toolCompleted = ["completed", "succeeded"].includes(output?.status ?? output?.action?.status);
    if (isWebSearchOutput(output) && toolCompleted) {
      for (const [sourceIndex, source] of (Array.isArray(output?.action?.sources) ? output.action.sources : []).entries()) {
        const parsed = parseTrustedAnnotation(source, { allowUntyped: true });
        if (!parsed) continue;
        candidates.push(buildCitation(parsed, {
          carrier: "completed_web_search_action_source",
          pathTemplate: "output[*].action.sources[*]",
          textDigest: null,
          supportExcerpt: null,
          annotationIndex: sourceIndex,
          startIndex: null,
          endIndex: null,
        }));
      }
    }
  }
  const uniqueByUrl = new Map();
  for (const citation of candidates) {
    const key = normalizeUrl(citation.url);
    if (!uniqueByUrl.has(key)) uniqueByUrl.set(key, citation);
  }
  return {
    citations: [...uniqueByUrl.values()].sort((left, right) => left.citationId.localeCompare(right.citationId)),
    issues: unique(issues),
  };
}

function parseTrustedAnnotation(annotation, { allowUntyped }) {
  if (!isObject(annotation)) return null;
  const nested = isObject(annotation.url_citation) ? annotation.url_citation : null;
  const typed = annotation.type === "url_citation" || nested !== null;
  if (!typed && !allowUntyped) return null;
  const value = nested ?? annotation;
  const url = normalizeUrl(value.url ?? value.uri);
  if (!url) return null;
  return {
    url,
    title: cleanText(value.title, 300) || null,
    startIndex: integerOrNull(value.start_index ?? value.startIndex),
    endIndex: integerOrNull(value.end_index ?? value.endIndex),
  };
}

function validateSpan(annotation, text) {
  const { startIndex, endIndex } = annotation;
  if (startIndex === null && endIndex === null) return { valid: true, startIndex: null, endIndex: null };
  if (!Number.isInteger(startIndex) || !Number.isInteger(endIndex)) return { valid: false };
  if (startIndex < 0 || endIndex <= startIndex || endIndex > text.length) return { valid: false };
  return { valid: true, startIndex, endIndex };
}

function citationSupportExcerpt(text, startIndex, endIndex) {
  if (!Number.isInteger(startIndex) || !Number.isInteger(endIndex)) return null;
  const left = Math.max(0, startIndex - 240);
  const right = Math.min(text.length, endIndex + 240);
  return cleanText(text.slice(left, right), 520) || null;
}

function candidateSupportsCitation(candidate, citation) {
  const excerpt = normalizeSupportText(citation?.supportExcerpt);
  const claim = normalizeSupportText(candidate?.claimText);
  if (!excerpt || !claim || !excerpt.includes(claim)) return false;
  const structured = candidate?.structuredValue;
  const activeValue = {
    text: structured?.textValue,
    date: structured?.dateValue,
    number: structured?.numberValue,
    boolean: structured?.booleanValue,
  }[structured?.valueType];
  if (typeof activeValue === "boolean") return true;
  const normalizedValue = normalizeSupportText(String(activeValue ?? ""));
  if (!normalizedValue) return false;
  if (claim.includes(normalizedValue)) return true;
  if (structured?.valueType === "date") {
    const year = String(activeValue).match(/\d{4}/u)?.[0];
    return Boolean(year && claim.includes(year));
  }
  return false;
}

function normalizeSupportText(value) {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\p{P}\p{S}\s]+/gu, "");
}

function buildCitation(annotation, binding) {
  const identity = {
    url: annotation.url,
    title: annotation.title,
    carrier: binding.carrier,
    pathTemplate: binding.pathTemplate,
    textDigest: binding.textDigest,
    annotationIndex: binding.annotationIndex,
    startIndex: binding.startIndex,
    endIndex: binding.endIndex,
  };
  return {
    citationId: `cit_${sha256([normalizeUrl(annotation.url), annotation.title ?? ""]).slice(0, 20)}`,
    url: annotation.url,
    title: annotation.title,
    carrier: binding.carrier,
    pathTemplate: binding.pathTemplate,
    outputTextItemDigest: binding.textDigest,
    supportExcerpt: binding.supportExcerpt,
    supportExcerptDigest: binding.supportExcerpt ? sha256(binding.supportExcerpt) : null,
    startIndex: binding.startIndex,
    endIndex: binding.endIndex,
    annotationDigest: sha256(identity),
  };
}

function validateIdentity(value, prefix, includeTitle, issues) {
  if (!isObject(value)) {
    issues.push(`${prefix}_missing`);
    return;
  }
  const fields = includeTitle
    ? ["status", "matchedTitle", "matchedAuthor", "citationIds"]
    : ["status", "matchedAuthor", "citationIds"];
  exactKeys(value, fields, prefix, issues);
  if (!IDENTITY_STATUSES.includes(value.status)) issues.push(`${prefix}_status_invalid`);
  for (const key of includeTitle ? ["matchedTitle", "matchedAuthor"] : ["matchedAuthor"]) {
    if (!(value[key] === null || typeof value[key] === "string")) issues.push(`${prefix}_${key}_type_invalid`);
  }
  validateCitationIds(value.citationIds, `${prefix}_citation_ids`, issues);
}

function validateCandidate(value, index, issues) {
  const prefix = `candidate_${index}`;
  if (!isObject(value)) {
    issues.push(`${prefix}_not_object`);
    return;
  }
  exactKeys(value, ["citationId", "claimText", "availableAt", "eventTime", "claimType", "structuredValue", "confidence", "entitySupport", "sourceQualityHint"], prefix, issues);
  if (typeof value.citationId !== "string" || !/^cit_[a-f0-9]{20}$/u.test(value.citationId)) issues.push(`${prefix}_citation_id_invalid`);
  if (typeof value.claimText !== "string" || !value.claimText.trim() || value.claimText.length > 240) issues.push(`${prefix}_claim_text_invalid`);
  for (const field of ["availableAt", "eventTime"]) {
    if (!(value[field] === null || (typeof value[field] === "string" && Number.isFinite(Date.parse(value[field]))))) {
      issues.push(`${prefix}_${field}_invalid`);
    }
  }
  if (!CLAIM_TYPES.includes(value.claimType)) issues.push(`${prefix}_claim_type_invalid`);
  if (!Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) issues.push(`${prefix}_confidence_invalid`);
  if (!ENTITY_SUPPORT.includes(value.entitySupport)) issues.push(`${prefix}_entity_support_invalid`);
  if (!SOURCE_QUALITY.includes(value.sourceQualityHint)) issues.push(`${prefix}_source_quality_hint_invalid`);
  validateStructuredValue(value.structuredValue, prefix, issues);
}

function validateStructuredValue(value, prefix, issues) {
  if (!isObject(value)) {
    issues.push(`${prefix}_structured_value_invalid`);
    return;
  }
  const fields = ["valueType", "textValue", "dateValue", "numberValue", "booleanValue"];
  exactKeys(value, fields, `${prefix}_structured_value`, issues);
  const active = { text: "textValue", date: "dateValue", number: "numberValue", boolean: "booleanValue" }[value.valueType];
  if (!active) {
    issues.push(`${prefix}_structured_value_type_invalid`);
    return;
  }
  const activeValid = active === "textValue"
    ? typeof value[active] === "string" && value[active].trim().length > 0
    : active === "dateValue"
      ? typeof value[active] === "string" && Number.isFinite(Date.parse(value[active]))
      : active === "numberValue"
        ? Number.isFinite(value[active])
        : typeof value[active] === "boolean";
  if (!activeValid) issues.push(`${prefix}_structured_value_active_payload_invalid`);
  for (const field of fields.slice(1)) {
    if (field !== active && value[field] !== null) issues.push(`${prefix}_structured_value_${field}_must_be_null`);
  }
}

function validateCitationIds(value, prefix, issues) {
  if (!Array.isArray(value) || value.length > 5 || value.some((item) => typeof item !== "string" || !/^cit_[a-f0-9]{20}$/u.test(item))) {
    issues.push(`${prefix}_invalid`);
    return;
  }
  if (new Set(value).size !== value.length) issues.push(`${prefix}_duplicate`);
}

function extractionJsonSchemaFormat() {
  const nullableString = { type: ["string", "null"] };
  const citationIds = { type: "array", maxItems: 5, items: { type: "string", pattern: "^cit_[a-f0-9]{20}$" } };
  const identityStatus = { type: "string", enum: [...IDENTITY_STATUSES] };
  return {
    type: "json_schema",
    name: "m2_v2_v2b2_evidence_extraction",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        queryOutcome: { type: "string", enum: ["success", "no_result", "ambiguous"] },
        workIdentity: {
          type: "object",
          additionalProperties: false,
          properties: { status: identityStatus, matchedTitle: nullableString, matchedAuthor: nullableString, citationIds },
          required: ["status", "matchedTitle", "matchedAuthor", "citationIds"],
        },
        authorIdentity: {
          type: "object",
          additionalProperties: false,
          properties: { status: identityStatus, matchedAuthor: nullableString, citationIds },
          required: ["status", "matchedAuthor", "citationIds"],
        },
        authorWorkRelationshipConfirmed: { type: "boolean" },
        evidenceCandidates: {
          type: "array",
          maxItems: 5,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              citationId: { type: "string", pattern: "^cit_[a-f0-9]{20}$" },
              claimText: { type: "string", minLength: 1, maxLength: 240 },
              availableAt: nullableString,
              eventTime: nullableString,
              claimType: { type: "string", enum: [...CLAIM_TYPES] },
              structuredValue: {
                type: "object",
                additionalProperties: false,
                properties: {
                  valueType: { type: "string", enum: ["text", "date", "number", "boolean"] },
                  textValue: nullableString,
                  dateValue: nullableString,
                  numberValue: { type: ["number", "null"] },
                  booleanValue: { type: ["boolean", "null"] },
                },
                required: ["valueType", "textValue", "dateValue", "numberValue", "booleanValue"],
              },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              entitySupport: { type: "string", enum: [...ENTITY_SUPPORT] },
              sourceQualityHint: { type: "string", enum: [...SOURCE_QUALITY] },
            },
            required: ["citationId", "claimText", "availableAt", "eventTime", "claimType", "structuredValue", "confidence", "entitySupport", "sourceQualityHint"],
          },
        },
      },
      required: ["queryOutcome", "workIdentity", "authorIdentity", "authorWorkRelationshipConfirmed", "evidenceCandidates"],
    },
  };
}

function normalizePayloadInput(task, explicitModel, explicitSearch) {
  if (!isObject(task)) throw new Error("v2b2_payload_input_invalid");
  if (typeof task.model === "string") return { ...task, search: explicitSearch ?? task.search };
  return {
    ...task,
    model: explicitModel,
    workTitle: task.workTitle ?? task.title,
    authorByline: task.authorByline ?? task.author,
    queryIntent: task.queryIntent ?? task.queryText,
    search: explicitSearch ?? task.search,
  };
}

function normalizeRegistryForPrompt(value) {
  const result = [];
  const seen = new Set();
  for (const citation of Array.isArray(value) ? value : []) {
    if (typeof citation?.citationId !== "string" || !/^cit_[a-f0-9]{20}$/u.test(citation.citationId)) continue;
    const url = normalizeUrl(citation.url);
    if (!url || seen.has(citation.citationId)) continue;
    seen.add(citation.citationId);
    result.push({ citationId: citation.citationId, url, title: cleanText(citation.title, 300) || null });
    if (result.length >= 12) break;
  }
  return result;
}

function exactKeys(value, expected, prefix, issues) {
  if (!isObject(value)) return;
  const allowed = new Set(expected);
  for (const key of Object.keys(value)) if (!allowed.has(key)) issues.push(`${prefix}_additional_property:${key}`);
  for (const key of expected) if (!(key in value)) issues.push(`${prefix}_${key}_missing`);
}

function normalizeUsage(value) {
  const inputTokens = finiteNonnegative(value?.input_tokens ?? value?.inputTokens ?? value?.prompt_tokens);
  const outputTokens = finiteNonnegative(value?.output_tokens ?? value?.outputTokens ?? value?.completion_tokens);
  const totalTokens = finiteNonnegative(value?.total_tokens ?? value?.totalTokens)
    ?? (inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null);
  return { inputTokens, outputTokens, totalTokens };
}

function normalizeUrl(value) {
  try {
    const url = new URL(String(value ?? ""));
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function isHttpUrl(value) {
  return normalizeUrl(value) !== null;
}

function classifyContentType(value) {
  const text = String(value ?? "").toLocaleLowerCase("en-US");
  if (!text) return "unavailable";
  if (text.includes("html")) return "html";
  if (text.includes("json")) return "json";
  if (text.includes("text/plain")) return "text_plain";
  return "other";
}

function isJsonObjectText(value) {
  if (typeof value !== "string") return false;
  try {
    return isObject(JSON.parse(value));
  } catch {
    return false;
  }
}

function safeShapeType(value) {
  if (typeof value !== "string" || !value) return "missing";
  if (/^[A-Za-z0-9_.:-]{1,80}$/u.test(value)) return value;
  return `sha256:${sha256(value)}`;
}

function safeModelId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_.:-]{1,100}$/u.test(value) ? value : null;
}

function safeToken(value) {
  return typeof value === "string" && /^[A-Za-z0-9_.:-]{1,100}$/u.test(value) ? value : null;
}

function cleanText(value, limit) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/gu, " ").replace(/\s+/gu, " ").trim().slice(0, limit);
}

function boundedInteger(value, fallback, minimum, maximum) {
  const number = Number(value ?? fallback);
  if (!Number.isInteger(number) || number < minimum || number > maximum) throw new Error("v2b2_output_token_budget_invalid");
  return number;
}

function finiteNonnegative(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function integerOrNull(value) {
  return Number.isInteger(value) ? value : null;
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function count(target, key) {
  target[key] = (target[key] ?? 0) + 1;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
