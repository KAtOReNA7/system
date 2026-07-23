import {
  buildQueryPlan,
  evaluateSource,
  normalizeEntityText,
  sha256,
} from "./pilotCore.js";

export const CANARY_SCHEMA_VERSION = "m2.v2.evidence-canary.v0.1";
export const CANARY_SEED = "20260717:canary-v0.1";
export const CANARY_SIZE = 10;
export const CANARY_REQUEST_CAP = 100;
export const CANARY_PLANNED_PRIMARY_REQUESTS = 40;
export const CANARY_REPEAT_WORK_COUNT = 5;
export const CANARY_PLANNED_REPEAT_REQUESTS = 20;
export const CANARY_TOTAL_PLANNED_REQUESTS = 60;
export const CANARY_MODEL_OUTPUT_SCHEMA = "m2_v2_canary_retrieval_v0_1";

export const CANARY_SLOT_RULES = Object.freeze([
  Object.freeze({ id: "slot01", sourceType: "publication", revenueModel: "pure_sales_share", highValue: true, ambiguityRisk: "high", evidencePrior: "rich" }),
  Object.freeze({ id: "slot02", sourceType: "publication", revenueModel: "buyout_plus_sales", highValue: true, ambiguityRisk: "high", evidencePrior: "rich" }),
  Object.freeze({ id: "slot03", sourceType: "publication", revenueModel: "pure_buyout", highValue: true, ambiguityRisk: "medium", evidencePrior: "rich" }),
  Object.freeze({ id: "slot04", sourceType: "publication", revenueModel: "pure_buyout", highValue: false, ambiguityRisk: "high", evidencePrior: "sparse" }),
  Object.freeze({ id: "slot05", sourceType: "publication", revenueModel: "pure_sales_share", highValue: false, ambiguityRisk: "low", evidencePrior: "rich" }),
  Object.freeze({ id: "slot06", sourceType: "web_original", revenueModel: "pure_sales_share", highValue: true, ambiguityRisk: "high", evidencePrior: "mixed" }),
  Object.freeze({ id: "slot07", sourceType: "web_original", revenueModel: "buyout_plus_sales", highValue: true, ambiguityRisk: "high", evidencePrior: "mixed" }),
  Object.freeze({ id: "slot08", sourceType: "web_original", revenueModel: "pure_buyout", highValue: true, ambiguityRisk: "high", evidencePrior: "sparse" }),
  Object.freeze({ id: "slot09", sourceType: "web_original", revenueModel: "pure_sales_share", highValue: false, ambiguityRisk: "low", evidencePrior: "sparse" }),
  Object.freeze({ id: "slot10", sourceType: "web_original", revenueModel: "buyout_plus_sales", highValue: false, ambiguityRisk: "high", evidencePrior: "sparse" }),
]);

const RESOLUTION_RANK = Object.freeze({ unresolved: 0, low: 1, medium: 2, high: 3 });
const ALLOWED_OUTBOUND_DATA_FIELDS = new Set(["work_title", "author_byline", "source_type"]);
const PROHIBITED_OUTBOUND_TOKENS = Object.freeze([
  "standardWorkId",
  "standard_work_id",
  "internal_work_id",
  "revenue",
  "rating",
  "channel",
  "rights",
  "copyright",
  "riskBucket",
  "businessActionStatus",
  "internalNote",
]);

export function selectCanarySubset(parentManifest, options = {}) {
  assertParentManifest(parentManifest);
  const seed = String(options.seed ?? CANARY_SEED);
  const selected = [];
  const selectedIds = new Set();

  for (const slot of CANARY_SLOT_RULES) {
    const candidates = parentManifest.sample
      .filter((work) => !selectedIds.has(work.standardWorkId) && matchesSlot(work, slot))
      .map((work) => ({ work, tieBreak: sha256([seed, slot.id, work.identityDigest]) }))
      .sort((left, right) => left.tieBreak.localeCompare(right.tieBreak));
    if (!candidates.length) throw new Error(`canary_slot_unavailable:${slot.id}`);
    const chosen = candidates[0].work;
    selectedIds.add(chosen.standardWorkId);
    selected.push({ ...chosen, canarySlotId: slot.id });
  }

  const repeatWorks = selectRepeatWorks(selected, seed);
  const coverage = evaluateCanaryCoverage(selected);
  if (!Object.values(coverage).every(Boolean)) throw new Error("canary_coverage_contract_failed");
  return { seed, selected, repeatWorks, coverage };
}

export function selectRepeatWorks(selected, seed = CANARY_SEED) {
  if (!Array.isArray(selected) || selected.length !== CANARY_SIZE) throw new Error("canary_sample_count_invalid");
  return selected
    .map((work) => ({ work, tieBreak: sha256([seed, "repeat5", work.identityDigest]) }))
    .sort((left, right) => left.tieBreak.localeCompare(right.tieBreak))
    .slice(0, CANARY_REPEAT_WORK_COUNT)
    .map((item) => item.work);
}

export function evaluateCanaryCoverage(sample) {
  const has = (key, value) => sample.some((item) => item[key] === value);
  return {
    sampleCountIsTen: sample.length === CANARY_SIZE,
    uniqueWorks: new Set(sample.map((item) => item.standardWorkId)).size === CANARY_SIZE,
    publicationCovered: has("sourceType", "publication"),
    webOriginalCovered: has("sourceType", "web_original"),
    highValueCovered: sample.some((item) => item.highValue === true),
    highAmbiguityCovered: has("ambiguityRisk", "high"),
    evidenceRichCovered: has("evidencePrior", "rich"),
    evidenceSparseCovered: has("evidencePrior", "sparse"),
    pureSalesCovered: has("revenueModel", "pure_sales_share"),
    mixedCovered: has("revenueModel", "buyout_plus_sales"),
    pureBuyoutCovered: has("revenueModel", "pure_buyout"),
  };
}

export function buildCanaryTasks(canaryManifest) {
  const repeatIds = new Set(canaryManifest.repeatSample.map((item) => item.standardWorkId));
  const tasks = [];
  for (const work of canaryManifest.sample) {
    for (const runKind of repeatIds.has(work.standardWorkId) ? ["primary", "repeat"] : ["primary"]) {
      const plan = buildQueryPlan(work);
      for (const query of plan) {
        const requestKey = sha256([
          canaryManifest.canaryManifestDigest,
          runKind,
          work.identityDigest,
          query.queryHash,
          CANARY_MODEL_OUTPUT_SCHEMA,
        ]);
        tasks.push({
          requestKey,
          runKind,
          workReference: work.standardWorkId,
          identityDigest: work.identityDigest,
          title: work.title,
          author: work.author,
          sourceType: work.sourceType,
          sameNameCount: work.sameNameCount,
          queryId: query.queryId,
          queryHash: query.queryHash,
          queryCategory: query.category,
          queryText: query.queryText,
          evidenceTypes: query.evidenceTypes,
          queryTemplateVersion: query.queryTemplateVersion,
          outboundDataFields: ["work_title", "author_byline", "source_type"],
          prohibitedFieldsTransmitted: false,
        });
      }
    }
  }
  assertTaskBudget(tasks);
  return tasks;
}

export function assertTaskBudget(tasks) {
  if (tasks.length !== CANARY_TOTAL_PLANNED_REQUESTS) throw new Error("canary_planned_request_count_invalid");
  if (tasks.length > CANARY_REQUEST_CAP) throw new Error("canary_total_request_budget_exceeded");
  const byWork = countBy(tasks, (task) => task.workReference);
  if (Object.values(byWork).some((count) => count > 8)) throw new Error("canary_per_work_request_budget_exceeded");
  if (tasks.some((task) => !task.outboundDataFields.every((field) => ALLOWED_OUTBOUND_DATA_FIELDS.has(field)))) {
    throw new Error("canary_outbound_field_not_allowed");
  }
  if (tasks.some((task) => task.prohibitedFieldsTransmitted !== false)) throw new Error("canary_private_field_transmission_detected");
  return true;
}

export function buildRelayRequestPayload(task, model) {
  const safeTitle = cleanText(task.title, 200);
  const safeAuthor = cleanText(task.author, 200);
  const safeSourceType = task.sourceType === "publication" ? "publication" : "web_original";
  const safeQuery = cleanText(task.queryText, 500);
  if (!safeTitle || !safeAuthor) throw new Error("canary_identity_input_missing");

  const input = [
    "Use web search and return only the strict JSON object required by the schema.",
    "Research public evidence for the named work. Do not rely on title equality alone: verify both work and author identity from cited public sources.",
    "Every evidence candidate must use a sourceUrl that is cited by the response. Do not include full-page text, long excerpts, private data, or non-public business fields.",
    "availableAt is the earliest provable public availability time; eventTime is the occurrence time. Use null when either time cannot be proven.",
    "Do not resolve contradictions by guessing, and do not invent evidence.",
    `work_title: ${safeTitle}`,
    `author_byline: ${safeAuthor}`,
    `source_type: ${safeSourceType}`,
    `query_intent: ${safeQuery}`,
  ].join("\n");

  const payload = {
    model,
    input,
    tools: [{ type: "web_search" }],
    text: { format: canaryJsonSchemaFormat() },
    store: false,
    max_output_tokens: 1800,
  };
  assertOutboundPayload(payload, task);
  return payload;
}

export function assertOutboundPayload(payload, task = {}) {
  if (!Object.hasOwn(payload ?? {}, "store") || payload.store !== false) {
    throw new Error("canary_responses_store_must_be_false");
  }
  const serialized = JSON.stringify(payload);
  for (const token of PROHIBITED_OUTBOUND_TOKENS) {
    if (serialized.toLocaleLowerCase("en-US").includes(token.toLocaleLowerCase("en-US"))) {
      throw new Error(`canary_prohibited_outbound_token:${token}`);
    }
  }
  for (const privateValue of [task.workReference, task.identityDigest]) {
    if (privateValue && serialized.includes(String(privateValue))) throw new Error("canary_private_identifier_in_outbound_payload");
  }
  if (!serialized.includes(cleanText(task.title, 200)) || !serialized.includes(cleanText(task.author, 200))) {
    throw new Error("canary_required_identity_not_in_outbound_payload");
  }
  return true;
}

export function parseRelayResponse(json) {
  const outputTextItems = extractResponseTextItems(json);
  const outputText = extractResponsesOutputText(json, outputTextItems);
  const webSearchObserved = observeWebSearchCall(json);
  let structured = null;
  let parseError = null;
  let structuredOutputItem = null;

  for (const item of outputTextItems) {
    try {
      const candidate = JSON.parse(item.text);
      const validation = validateStructuredRelayOutput(candidate);
      if (validation.valid) {
        structured = candidate;
        structuredOutputItem = item;
        break;
      }
    } catch {
      // A Responses payload may contain non-JSON text items in addition to the
      // one strict JSON item. Only the individually parseable item can bind a
      // citation to the structured result.
    }
  }

  if (!structured) {
    try {
      structured = JSON.parse(outputText);
    } catch {
      parseError = "strict_json_parse_failed";
    }
  }
  const validation = structured ? validateStructuredRelayOutput(structured) : { valid: false, issues: [parseError] };
  const citations = extractUrlCitations(json, outputTextItems, structuredOutputItem?.key ?? null);
  return {
    responsesShapeValid: Boolean(json && typeof json === "object" && Array.isArray(json.output)),
    outputText,
    outputTextDigest: outputText ? sha256(outputText) : null,
    structuredOutputItemKey: structuredOutputItem?.key ?? null,
    structuredOutputItemDigest: structuredOutputItem?.textDigest ?? null,
    citations,
    webSearchObserved,
    structured,
    structuredValid: validation.valid,
    validationIssues: validation.issues.filter(Boolean),
    usage: normalizeUsage(json?.usage),
  };
}

export function validateStructuredRelayOutput(value) {
  const issues = [];
  const statuses = ["high", "medium", "low", "unresolved"];
  if (!value || typeof value !== "object" || Array.isArray(value)) return { valid: false, issues: ["output_not_object"] };
  validateExactKeys(value, ["queryOutcome", "workIdentity", "authorIdentity", "authorWorkRelationshipConfirmed", "evidenceCandidates"], "output", issues);
  if (!['success', 'no_result', 'ambiguous'].includes(value.queryOutcome)) issues.push("query_outcome_invalid");
  for (const key of ["workIdentity", "authorIdentity"]) {
    if (!value[key] || typeof value[key] !== "object") {
      issues.push(`${key}_missing`);
      continue;
    }
    validateExactKeys(
      value[key],
      key === "workIdentity" ? ["status", "matchedTitle", "matchedAuthor", "basis"] : ["status", "matchedAuthor", "basis"],
      key,
      issues
    );
    if (!statuses.includes(value[key].status)) issues.push(`${key}_status_invalid`);
    for (const field of key === "workIdentity" ? ["matchedTitle", "matchedAuthor", "basis"] : ["matchedAuthor", "basis"]) {
      if (!(field in value[key])) issues.push(`${key}_${field}_missing`);
      else if (!isNullableString(value[key][field])) issues.push(`${key}_${field}_type_invalid`);
    }
  }
  if (typeof value.authorWorkRelationshipConfirmed !== "boolean") issues.push("author_work_relationship_flag_invalid");
  if (!Array.isArray(value.evidenceCandidates) || value.evidenceCandidates.length > 5) issues.push("evidence_candidates_invalid");
  for (const [index, item] of (value.evidenceCandidates ?? []).entries()) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      issues.push(`candidate_${index}_not_object`);
      continue;
    }
    const candidateKeys = ["sourceUrl", "sourceTitle", "sourceDomain", "availableAt", "eventTime", "claimType", "structuredValue", "confidence", "entitySupport", "sourceQualityHint"];
    validateExactKeys(item, candidateKeys, `candidate_${index}`, issues);
    for (const key of ["sourceUrl", "sourceTitle", "sourceDomain", "availableAt", "eventTime", "claimType", "structuredValue", "confidence", "entitySupport", "sourceQualityHint"]) {
      if (!(key in (item ?? {}))) issues.push(`candidate_${index}_${key}_missing`);
    }
    if (typeof item?.sourceUrl !== "string" || !isHttpUrl(item.sourceUrl)) issues.push(`candidate_${index}_source_url_invalid`);
    if (typeof item?.sourceTitle !== "string" || !item.sourceTitle.trim()) issues.push(`candidate_${index}_source_title_invalid`);
    if (typeof item?.sourceDomain !== "string" || !item.sourceDomain.trim()) issues.push(`candidate_${index}_source_domain_invalid`);
    if (!isNullableString(item?.availableAt)) issues.push(`candidate_${index}_available_at_type_invalid`);
    if (!isNullableString(item?.eventTime)) issues.push(`candidate_${index}_event_time_type_invalid`);
    if (!['work_identity', 'author_identity', 'publication_event', 'adaptation_event', 'award_event', 'original_platform', 'ranking_signal', 'market_signal', 'other'].includes(item?.claimType)) {
      issues.push(`candidate_${index}_claim_type_invalid`);
    }
    if (!Number.isFinite(item?.confidence) || item.confidence < 0 || item.confidence > 1) issues.push(`candidate_${index}_confidence_invalid`);
    if (!['work', 'author', 'both'].includes(item?.entitySupport)) issues.push(`candidate_${index}_entity_support_invalid`);
    if (!['official', 'reputable_secondary', 'weak', 'prohibited', 'unknown'].includes(item?.sourceQualityHint)) {
      issues.push(`candidate_${index}_source_quality_hint_invalid`);
    }
    validateStructuredValue(item?.structuredValue, index, issues);
  }
  return { valid: issues.length === 0, issues: [...new Set(issues)] };
}

export function resolveCanaryEntity(work, receipts) {
  const observations = receipts
    .filter(
      (receipt) => receipt.status === "success" &&
        receipt.structuredResponse &&
        validateStructuredRelayOutput(receipt.structuredResponse).valid
    )
    .map((receipt) => evaluateEntityObservation(work, receipt));
  const workIdentity = bestIdentity(observations.map((item) => item.workIdentity));
  const authorIdentity = bestIdentity(observations.map((item) => item.authorIdentity));
  const resolutionStatus = ["high", "medium"].includes(workIdentity.status) && ["high", "medium"].includes(authorIdentity.status)
    ? "resolved"
    : workIdentity.status === "low" || authorIdentity.status === "low" || observations.some((item) => item.ambiguous)
      ? "ambiguous"
      : "unresolved";
  return {
    resolutionStatus,
    workIdentity,
    authorIdentity,
    titleOnlyRejected: observations.some((item) => item.titleOnlyRejected),
    observationCount: observations.length,
    predictionEligible: false,
  };
}

export function materializeEvidenceCandidates({ work, receipts, entityResolution, sourceAllowlist, runKind }) {
  const records = [];
  for (const receipt of receipts.filter((item) => item.runKind === runKind && item.status === "success")) {
    const citations = receipt.citations ?? [];
    const prospective = deriveProspectiveProvenance(receipt);
    const localSchemaValidation = validateStructuredRelayOutput(receipt.structuredResponse);
    for (const [index, candidate] of (receipt.structuredResponse?.evidenceCandidates ?? []).entries()) {
      const sourceUrl = String(candidate.sourceUrl ?? "").trim();
      const parsedUrl = parseHttpUrl(sourceUrl);
      const normalizedUrl = normalizeUrl(sourceUrl);
      const matchingCitation = citations.find((citation) => normalizeUrl(citation.url) === normalizedUrl) ?? null;
      const alignedCitation = citations.find(
        (citation) => normalizeUrl(citation.url) === normalizedUrl && citation.alignmentLevel === "same_output_text_item"
      ) ?? null;
      const citationAlignmentLevel = alignedCitation
        ? "same_output_text_item_exact_url"
        : matchingCitation?.alignmentLevel === "different_output_text_item"
          ? "different_output_text_item"
          : matchingCitation
            ? "unbound_output_item"
            : "missing";
      const sourceDomain = parsedUrl?.hostname.toLocaleLowerCase("en-US") ?? null;
      const claimedDomain = String(candidate.sourceDomain ?? "").trim().toLocaleLowerCase("en-US");
      const sourceEvaluation = evaluateSource({ sourceDomain }, sourceAllowlist);
      const availableAt = normalizeTimestamp(candidate.availableAt);
      const eventTime = normalizeTimestamp(candidate.eventTime);
      const capturedAt = prospective.capturedAt;
      const firstObservedAt = prospective.firstObservedAt;
      const prohibitedSource = candidate.sourceQualityHint === "prohibited" || !parsedUrl;
      const identityPassed = entityResolution.resolutionStatus === "resolved";
      const rejectionReasons = [];
      if (!localSchemaValidation.valid) rejectionReasons.push("local_schema_validation_failed");
      if (!alignedCitation) rejectionReasons.push("citation_not_aligned");
      if (matchingCitation && !alignedCitation) rejectionReasons.push("citation_not_bound_to_structured_output_item");
      if (!identityPassed) rejectionReasons.push("entity_not_resolved");
      if (!capturedAt) rejectionReasons.push("captured_at_missing");
      if (!prospective.proven) rejectionReasons.push("prospective_observation_not_proven");
      if (!availableAt) rejectionReasons.push("available_at_missing_or_invalid");
      if (!eventTime) rejectionReasons.push("event_time_missing_or_invalid");
      if (availableAt && capturedAt && Date.parse(availableAt) > Date.parse(capturedAt)) rejectionReasons.push("available_at_after_capture");
      if (eventTime && capturedAt && Date.parse(eventTime) > Date.parse(capturedAt)) rejectionReasons.push("event_time_after_capture");
      if (!sourceEvaluation.allowed) rejectionReasons.push(sourceEvaluation.reason ?? "source_not_allowed");
      if (prohibitedSource) rejectionReasons.push("prohibited_source");
      if (!sourceDomain || claimedDomain !== sourceDomain) rejectionReasons.push("source_domain_mismatch");
      if (!structuredValuePresent(candidate.structuredValue)) rejectionReasons.push("structured_value_missing");
      if (!Number.isFinite(candidate.confidence) || candidate.confidence < 0.8) rejectionReasons.push("confidence_below_minimum");
      const disposition = rejectionReasons.length ? "rejected" : "accepted";
      records.push({
        schema: "m2.v2.canary-evidence-envelope.v0.1",
        privateOnly: true,
        evidenceId: `cev_${sha256([receipt.requestKey, index, runKind]).slice(0, 24)}`,
        workReference: work.standardWorkId,
        identityDigest: work.identityDigest,
        runKind,
        queryId: receipt.queryId,
        sourceUrl,
        sourceTitle: cleanText(alignedCitation?.title || candidate.sourceTitle, 300),
        sourceDomain,
        capturedAt,
        firstObservedAt,
        availableAt,
        eventTime,
        claimType: candidate.claimType,
        claimSubject: candidate.entitySupport,
        effectiveTime: eventTime ?? availableAt,
        structuredValue: candidate.structuredValue,
        confidence: candidate.confidence,
        citationAlignment: Boolean(alignedCitation),
        citationAlignmentLevel,
        citationAnnotationDigest: alignedCitation?.annotationDigest ?? null,
        citationOutputTextItemDigest: alignedCitation?.outputTextItemDigest ?? null,
        entityResolution: {
          work: entityResolution.workIdentity.status,
          author: entityResolution.authorIdentity.status,
          overall: entityResolution.resolutionStatus,
        },
        sourceQuality: {
          hint: candidate.sourceQualityHint,
          allowlistAccepted: sourceEvaluation.allowed,
          allowlistReason: sourceEvaluation.reason,
          prohibited: prohibitedSource,
        },
        contradiction: { status: "pending_group_evaluation" },
        disposition,
        rejectionReasons: [...new Set(rejectionReasons)].sort(),
        timeProvenance: {
          prospective: prospective.proven,
          firstObservedAtBasis: prospective.firstObservedAtBasis,
          receiptDigestPresent: prospective.receiptDigestPresent,
        },
        localSchemaValidation: {
          valid: localSchemaValidation.valid,
          issueDigests: localSchemaValidation.issues.map((issue) => sha256(issue)),
        },
        historicalBackfill: !prospective.proven,
        predictionEligible: false,
        notForFormalDecision: true,
      });
    }
  }
  return records;
}

export function evaluateCanaryContradictions(records) {
  const groups = new Map();
  for (const record of records) {
    const key = `${record.workReference}\u001f${record.claimType}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  return [...groups.entries()].map(([key, claims]) => {
    const segments = new Map();
    for (const claim of claims) {
      const subject = claim.claimSubject ?? "unknown";
      const effectiveTime = claim.effectiveTime ?? claim.eventTime ?? claim.availableAt ?? "unknown";
      const segmentKey = `${subject}\u001f${effectiveTime}`;
      if (!segments.has(segmentKey)) segments.set(segmentKey, []);
      segments.get(segmentKey).push(claim);
    }

    const segmentResults = [...segments.entries()].map(([segmentKey, segmentClaims]) => {
      const rawValueDigests = new Set(segmentClaims.map((claim) => sha256(claim.structuredValue)));
      const admissibleClaims = segmentClaims.filter((claim) => claim.disposition === "accepted");
      const admissibleValueDigests = new Set(admissibleClaims.map((claim) => sha256(claim.structuredValue)));
      const rawConflict = rawValueDigests.size > 1;
      const admissibleConflict = admissibleValueDigests.size > 1;

      if (admissibleConflict) {
        for (const claim of admissibleClaims) {
          claim.disposition = "rejected";
          claim.rejectionReasons = [...new Set([...(claim.rejectionReasons ?? []), "unresolved_contradiction"])].sort();
        }
      }

      const [claimSubject, effectiveTime] = segmentKey.split("\u001f");
      return {
        segmentKeyDigest: sha256(segmentKey),
        claimSubject,
        effectiveTime,
        rawClaimCount: segmentClaims.length,
        rawDistinctValueCount: rawValueDigests.size,
        rawStatus: rawConflict ? "unresolved" : "none",
        preConflictAdmissibleClaimCount: admissibleClaims.length,
        admissibleDistinctValueCount: admissibleValueDigests.size,
        admissibleStatus: admissibleConflict ? "unresolved_excluded_candidates" : "none",
        preExistingRejectedClaimCount: segmentClaims.length - admissibleClaims.length,
        conflictExcludedClaimCount: admissibleConflict ? admissibleClaims.length : 0,
        postConflictAdmissibleClaimCount: admissibleConflict ? 0 : admissibleClaims.length,
      };
    });

    const rawConflict = segmentResults.some((segment) => segment.rawStatus === "unresolved");
    const admissibleConflict = segmentResults.some((segment) => segment.admissibleStatus === "unresolved_excluded_candidates");
    const preConflictAdmissibleClaimCount = segmentResults.reduce((sum, segment) => sum + segment.preConflictAdmissibleClaimCount, 0);
    return {
      schema: "m2.v2.canary-contradiction.v0.1",
      privateOnly: true,
      groupDigest: sha256(key),
      workReference: claims[0].workReference,
      claimType: claims[0].claimType,
      claimCount: claims.length,
      distinctValueCount: new Set(claims.map((claim) => sha256(claim.structuredValue))).size,
      rawStatus: rawConflict ? "unresolved" : "none",
      admissibleStatus: admissibleConflict ? "unresolved_excluded_candidates" : "none",
      preConflictAdmissibleClaimCount,
      postConflictAdmissibleClaimCount: claims.filter((claim) => claim.disposition === "accepted").length,
      rejectedClaimsMayVetoAdmissible: false,
      status: admissibleConflict ? "admissible_conflicts_excluded" : "none",
      segments: segmentResults,
      winnerEvidenceId: null,
      llmSelectedWinner: false,
      predictionEligible: false,
    };
  });
}

export function compareCanaryReproducibility(primaryRecords, repeatRecords, repeatWorks) {
  const byWork = [];
  for (const work of repeatWorks) {
    const primaryRows = primaryRecords.filter((item) => item.workReference === work.standardWorkId);
    const repeatRows = repeatRecords.filter((item) => item.workReference === work.standardWorkId);
    const primary = claimSignatures(primaryRows);
    const repeat = claimSignatures(repeatRows);
    const admissiblePrimary = claimSignatures(primaryRows.filter((item) => item.disposition === "accepted"));
    const admissibleRepeat = claimSignatures(repeatRows.filter((item) => item.disposition === "accepted"));
    const evaluable = primary.size > 0 && repeat.size > 0;
    const admissibleEvaluable = admissiblePrimary.size > 0 && admissibleRepeat.size > 0;
    byWork.push({
      identityDigest: work.identityDigest,
      evaluable,
      primaryClaimCount: primary.size,
      repeatClaimCount: repeat.size,
      claimAgreement: evaluable ? jaccard(primary, repeat) : null,
      sourceOverlap: evaluable
        ? jaccard(
            sourceSignatures(primaryRows),
            sourceSignatures(repeatRows)
          )
        : null,
      admissibleEvaluable,
      admissiblePrimaryClaimCount: admissiblePrimary.size,
      admissibleRepeatClaimCount: admissibleRepeat.size,
      admissibleClaimAgreement: admissibleEvaluable ? jaccard(admissiblePrimary, admissibleRepeat) : null,
    });
  }
  const evaluable = byWork.filter((item) => item.evaluable);
  const admissibleEvaluable = byWork.filter((item) => item.admissibleEvaluable);
  return {
    schema: "m2.v2.canary-reproducibility.v0.1",
    privateOnly: true,
    repeatWorkCount: repeatWorks.length,
    evaluableWorkCount: evaluable.length,
    claimAgreement: mean(evaluable.map((item) => item.claimAgreement).filter(Number.isFinite)),
    sourceOverlap: mean(evaluable.map((item) => item.sourceOverlap).filter(Number.isFinite)),
    basis: "raw_candidate_claims_including_rejected",
    admissibleEvaluableWorkCount: admissibleEvaluable.length,
    admissibleClaimAgreement: mean(admissibleEvaluable.map((item) => item.admissibleClaimAgreement).filter(Number.isFinite)),
    perWork: byWork,
  };
}

export function evaluateCanaryDecision(metrics, verification) {
  const supplementalRequestCount = Number(metrics?.taskRequestAccounting?.supplementalSyntheticRequestCount ?? 0);
  const supplementalProviderBindingProven = supplementalRequestCount === 0
    || metrics?.taskRequestAccounting?.supplementalProviderBindingProven === true;
  const hardInvariantFailureCount = Number.isFinite(verification?.hardInvariantFailureCount)
    ? Number(verification.hardInvariantFailureCount)
    : verification?.allHardInvariantsPassed === false
      ? 1
      : 0;
  const allHardInvariantsPassed = verification?.allHardInvariantsPassed === undefined
    ? hardInvariantFailureCount === 0
    : verification.allHardInvariantsPassed === true && hardInvariantFailureCount === 0;
  const conditions = [
    condition("provider_request_success_rate", metrics.retrieval.successRate, 0.8, Number.isFinite(metrics.retrieval.successRate) && metrics.retrieval.successRate >= 0.8),
    condition("supplemental_provider_binding_proven", supplementalRequestCount === 0 ? true : metrics?.taskRequestAccounting?.supplementalProviderBindingProven ?? null, true, supplementalProviderBindingProven),
    condition("entity_resolution_rate", metrics.entity.resolutionRate, 0.8, Number.isFinite(metrics.entity.resolutionRate) && metrics.entity.resolutionRate >= 0.8),
    condition("citation_alignment", metrics.citation.acceptedAlignmentRate, 1, metrics.evidence.acceptedCount > 0 && metrics.citation.acceptedAlignmentRate === 1),
    condition("accepted_evidence_positive", metrics.evidence.acceptedCount, 1, metrics.evidence.acceptedCount > 0),
    condition("no_historical_backfill", metrics.evidence.historicalBackfillCount, 0, metrics.evidence.historicalBackfillCount === 0),
    condition("no_prohibited_source_accepted", metrics.source.prohibitedAcceptedCount, 0, metrics.source.prohibitedAcceptedCount === 0),
    condition("no_private_leak", verification?.privacyLeakCount ?? null, 0, verification?.privacyLeakCount === 0),
    condition("relay_cost_below_budget", metrics.cost.estimatedRelayCostCny, metrics.cost.budgetCny, metrics.cost.costProven && metrics.cost.withinBudget === true),
    condition("repeat_population_evaluable", metrics.reproducibility.evaluableWorkCount, CANARY_REPEAT_WORK_COUNT, metrics.reproducibility.evaluableWorkCount === CANARY_REPEAT_WORK_COUNT),
    condition("repeat_claim_consistency", metrics.reproducibility.claimAgreement, 0.8, Number.isFinite(metrics.reproducibility.claimAgreement) && metrics.reproducibility.claimAgreement >= 0.8),
    condition("all_hard_invariants_pass", hardInvariantFailureCount, 0, allHardInvariantsPassed),
    condition("all_tests_pass", verification?.allTestsPassed ?? null, true, verification?.allTestsPassed === true),
  ];
  const safetyIds = new Set(["no_historical_backfill", "no_prohibited_source_accepted", "no_private_leak", "all_hard_invariants_pass", "all_tests_pass"]);
  const hardSafetyAllPassed = conditions.filter((item) => safetyIds.has(item.id)).every((item) => item.passed);
  const allPassed = conditions.every((item) => item.passed);
  const decision = !hardSafetyAllPassed ? "CANARY_FAIL" : allPassed ? "CANARY_PASS" : "CANARY_CONDITIONAL";
  return {
    decision,
    conditions,
    hardSafetyAllPassed,
    allHardInvariantsPassed,
    hardInvariantFailureCount,
    allPassed,
    allowFull160Pilot: decision === "CANARY_PASS",
    blockers: conditions.filter((item) => !item.passed).map((item) => item.id),
  };
}

export function percentile(values, probability) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = Math.ceil(probability * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

export function ratio(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : null;
}

export function countBy(values, selector) {
  const result = {};
  for (const value of values) {
    const key = String(selector(value));
    result[key] = (result[key] ?? 0) + 1;
  }
  return result;
}

function canaryJsonSchemaFormat() {
  const nullableString = { type: ["string", "null"] };
  const identityStatus = { type: "string", enum: ["high", "medium", "low", "unresolved"] };
  return {
    type: "json_schema",
    name: CANARY_MODEL_OUTPUT_SCHEMA,
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        queryOutcome: { type: "string", enum: ["success", "no_result", "ambiguous"] },
        workIdentity: {
          type: "object",
          additionalProperties: false,
          properties: { status: identityStatus, matchedTitle: nullableString, matchedAuthor: nullableString, basis: nullableString },
          required: ["status", "matchedTitle", "matchedAuthor", "basis"],
        },
        authorIdentity: {
          type: "object",
          additionalProperties: false,
          properties: { status: identityStatus, matchedAuthor: nullableString, basis: nullableString },
          required: ["status", "matchedAuthor", "basis"],
        },
        authorWorkRelationshipConfirmed: { type: "boolean" },
        evidenceCandidates: {
          type: "array",
          maxItems: 5,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              sourceUrl: { type: "string" },
              sourceTitle: { type: "string" },
              sourceDomain: { type: "string" },
              availableAt: nullableString,
              eventTime: nullableString,
              claimType: { type: "string", enum: ["work_identity", "author_identity", "publication_event", "adaptation_event", "award_event", "original_platform", "ranking_signal", "market_signal", "other"] },
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
              entitySupport: { type: "string", enum: ["work", "author", "both"] },
              sourceQualityHint: { type: "string", enum: ["official", "reputable_secondary", "weak", "prohibited", "unknown"] },
            },
            required: ["sourceUrl", "sourceTitle", "sourceDomain", "availableAt", "eventTime", "claimType", "structuredValue", "confidence", "entitySupport", "sourceQualityHint"],
          },
        },
      },
      required: ["queryOutcome", "workIdentity", "authorIdentity", "authorWorkRelationshipConfirmed", "evidenceCandidates"],
    },
  };
}

function evaluateEntityObservation(work, receipt) {
  const structured = receipt.structuredResponse;
  const citationUrls = new Set(
    (receipt.citations ?? [])
      .filter((item) => item.alignmentLevel === "same_output_text_item")
      .map((item) => normalizeUrl(item.url))
      .filter(Boolean)
  );
  const alignedCandidates = (structured.evidenceCandidates ?? []).filter((item) => citationUrls.has(normalizeUrl(item.sourceUrl)));
  const workCitationSupport = alignedCandidates.some((item) => ["work", "both"].includes(item.entitySupport));
  const authorCitationSupport = alignedCandidates.some((item) => ["author", "both"].includes(item.entitySupport));
  const expectedTitle = normalizeEntityText(work.title);
  const expectedAuthor = normalizeEntityText(work.author);
  const matchedTitle = normalizeEntityText(structured.workIdentity?.matchedTitle);
  const matchedWorkAuthor = normalizeEntityText(structured.workIdentity?.matchedAuthor);
  const matchedAuthor = normalizeEntityText(structured.authorIdentity?.matchedAuthor);
  const titleExact = Boolean(expectedTitle && matchedTitle && expectedTitle === matchedTitle);
  const workAuthorExact = Boolean(expectedAuthor && matchedWorkAuthor && expectedAuthor === matchedWorkAuthor);
  const authorExact = Boolean(expectedAuthor && matchedAuthor && expectedAuthor === matchedAuthor);
  const relationship = structured.authorWorkRelationshipConfirmed === true;
  const titleOnlyRejected = titleExact && !(workAuthorExact && relationship);

  let workStatus = "unresolved";
  if (workCitationSupport && titleExact && workAuthorExact && relationship) {
    workStatus = capIdentityStatus(structured.workIdentity.status, "high");
  } else if (workCitationSupport && titleExact) {
    workStatus = "low";
  }
  if (Number(work.sameNameCount) > 1 && !(workAuthorExact && relationship)) workStatus = capIdentityStatus(workStatus, "low");

  let authorStatus = "unresolved";
  if (authorCitationSupport && authorExact) authorStatus = capIdentityStatus(structured.authorIdentity.status, "high");

  return {
    workIdentity: { status: workStatus, method: workStatus === "unresolved" ? "none" : workAuthorExact && relationship ? "title_author_composite_with_citation" : "title_only_rejected" },
    authorIdentity: { status: authorStatus, method: authorStatus === "unresolved" ? "none" : "author_with_citation" },
    titleOnlyRejected,
    ambiguous: structured.queryOutcome === "ambiguous" || workStatus === "low" || authorStatus === "low",
  };
}

function bestIdentity(values) {
  const sorted = [...values].sort((left, right) => (RESOLUTION_RANK[right.status] ?? 0) - (RESOLUTION_RANK[left.status] ?? 0));
  return sorted[0] ?? { status: "unresolved", method: "none" };
}

function capIdentityStatus(value, maximum) {
  const normalized = RESOLUTION_RANK[value] === undefined ? "unresolved" : value;
  return RESOLUTION_RANK[normalized] <= RESOLUTION_RANK[maximum] ? normalized : maximum;
}

function claimSignatures(records) {
  return new Set(records.map((item) => sha256([item.claimType, item.structuredValue])));
}

function sourceSignatures(records) {
  return new Set(records.map((item) => normalizeUrl(item.sourceUrl)).filter(Boolean));
}

function jaccard(left, right) {
  if (left.size === 0 && right.size === 0) return null;
  const intersection = [...left].filter((item) => right.has(item)).length;
  const union = new Set([...left, ...right]).size;
  return union ? intersection / union : null;
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function condition(id, value, threshold, passed) {
  return { id, value: value ?? null, threshold, passed: passed === true };
}

function assertParentManifest(manifest) {
  if (manifest?.schema !== "m2.v2.evidence-pilot-private-manifest.v0.1") throw new Error("canary_parent_manifest_schema_invalid");
  if (manifest?.immutable !== true || manifest?.status !== "frozen_before_retrieval") throw new Error("canary_parent_manifest_not_frozen");
  if (!Array.isArray(manifest?.sample) || manifest.sample.length !== 160) throw new Error("canary_parent_manifest_count_invalid");
  const { manifestDigest, ...payload } = manifest;
  if (manifestDigest !== sha256(payload)) throw new Error("canary_parent_manifest_digest_invalid");
}

function matchesSlot(work, slot) {
  return Object.entries(slot).every(([key, value]) => key === "id" || work[key] === value);
}

function extractResponseTextItems(json) {
  const items = [];
  for (const [outputIndex, output] of (json?.output ?? []).entries()) {
    for (const [contentIndex, content] of (output?.content ?? []).entries()) {
      if (typeof content?.text !== "string" || !['output_text', 'text'].includes(content.type)) continue;
      const key = `output.${outputIndex}.content.${contentIndex}`;
      items.push({
        key,
        text: content.text,
        textDigest: sha256(content.text),
        annotations: Array.isArray(content.annotations) ? content.annotations : [],
      });
    }
  }
  return items;
}

function extractResponsesOutputText(json, outputTextItems = extractResponseTextItems(json)) {
  if (outputTextItems.length) return outputTextItems.map((item) => item.text).join("\n").trim();
  return typeof json?.output_text === "string" ? json.output_text.trim() : "";
}

function extractUrlCitations(json, outputTextItems, structuredOutputItemKey) {
  const citations = [];
  const seenAnnotationObjects = new Set();

  for (const item of outputTextItems) {
    for (const [annotationIndex, annotation] of item.annotations.entries()) {
      if (!isUrlCitation(annotation)) continue;
      seenAnnotationObjects.add(annotation);
      citations.push(auditableCitation(annotation, {
        outputTextItemKey: item.key,
        outputTextItemDigest: item.textDigest,
        annotationIndex,
        alignmentLevel: item.key === structuredOutputItemKey ? "same_output_text_item" : "different_output_text_item",
      }));
    }
  }

  walk(json, (value) => {
    if (!isUrlCitation(value) || seenAnnotationObjects.has(value)) return;
    citations.push(auditableCitation(value, {
      outputTextItemKey: null,
      outputTextItemDigest: null,
      annotationIndex: null,
      alignmentLevel: "unbound",
    }));
  });

  const unique = new Map();
  for (const citation of citations) {
    const key = [normalizeUrl(citation.url), citation.outputTextItemKey, citation.annotationIndex].join("\u001f");
    if (!unique.has(key)) unique.set(key, citation);
  }
  return [...unique.values()].sort((left, right) => {
    const urlOrder = left.url.localeCompare(right.url);
    return urlOrder || String(left.outputTextItemKey).localeCompare(String(right.outputTextItemKey));
  });
}

function isUrlCitation(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && value.type === "url_citation" && isHttpUrl(value.url));
}

function auditableCitation(value, binding) {
  const startIndex = Number.isInteger(value.start_index) && value.start_index >= 0 ? value.start_index : null;
  const endIndex = Number.isInteger(value.end_index) && value.end_index >= 0 ? value.end_index : null;
  const payload = {
    url: value.url,
    title: cleanText(value.title, 300) || null,
    ...binding,
    startIndex,
    endIndex,
  };
  return { ...payload, annotationDigest: sha256(payload) };
}

function validateExactKeys(value, allowedKeys, path, issues) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) issues.push(`${path}_additional_property:${key}`);
  }
  for (const key of allowedKeys) {
    if (!(key in value)) issues.push(`${path}_${key}_missing`);
  }
}

function validateStructuredValue(value, candidateIndex, issues) {
  const prefix = `candidate_${candidateIndex}_structured_value`;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    issues.push(`${prefix}_invalid`);
    return;
  }
  const keys = ["valueType", "textValue", "dateValue", "numberValue", "booleanValue"];
  validateExactKeys(value, keys, prefix, issues);
  if (!['text', 'date', 'number', 'boolean'].includes(value.valueType)) {
    issues.push(`${prefix}_value_type_invalid`);
    return;
  }

  const typeChecks = {
    text: typeof value.textValue === "string" && value.textValue.trim().length > 0,
    date: typeof value.dateValue === "string" && value.dateValue.trim().length > 0 && Number.isFinite(Date.parse(value.dateValue)),
    number: typeof value.numberValue === "number" && Number.isFinite(value.numberValue),
    boolean: typeof value.booleanValue === "boolean",
  };
  if (!typeChecks[value.valueType]) issues.push(`${prefix}_${value.valueType}_payload_invalid`);

  const activeField = {
    text: "textValue",
    date: "dateValue",
    number: "numberValue",
    boolean: "booleanValue",
  }[value.valueType];
  for (const key of ["textValue", "dateValue", "numberValue", "booleanValue"]) {
    if (key !== activeField && value[key] !== null) issues.push(`${prefix}_${key}_must_be_null`);
  }
}

function isNullableString(value) {
  return value === null || typeof value === "string";
}

function deriveProspectiveProvenance(receipt) {
  const capturedAt = normalizeTimestamp(receipt?.capturedAt);
  const explicitFirstObservedAt = normalizeTimestamp(receipt?.firstObservedAt);
  const firstObservedAt = explicitFirstObservedAt ?? capturedAt;
  const receiptDigestPresent = typeof receipt?.receiptDigest === "string" && /^[a-f0-9]{64}$/u.test(receipt.receiptDigest);
  const chronological = Boolean(
    firstObservedAt && capturedAt && Date.parse(firstObservedAt) <= Date.parse(capturedAt)
  );
  const proven = Boolean(
    receipt?.dispatched === true &&
      receipt?.requestKey &&
      receiptDigestPresent &&
      chronological
  );
  return {
    capturedAt,
    firstObservedAt,
    firstObservedAtBasis: explicitFirstObservedAt
      ? "provider_receipt_first_observed_at"
      : capturedAt
        ? "provider_receipt_captured_at_as_first_observation"
        : "unavailable",
    receiptDigestPresent,
    proven,
  };
}

function observeWebSearchCall(json) {
  let observed = false;
  walk(json, (value) => {
    if (value && typeof value === "object" && !Array.isArray(value) && ['web_search_call', 'web_search'].includes(value.type)) observed = true;
  });
  return observed;
}

function walk(value, visitor) {
  if (value === null || value === undefined) return;
  visitor(value);
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visitor);
  } else if (typeof value === "object") {
    for (const item of Object.values(value)) walk(item, visitor);
  }
}

function normalizeUsage(value) {
  const inputTokens = finiteOrNull(value?.input_tokens ?? value?.prompt_tokens);
  const outputTokens = finiteOrNull(value?.output_tokens ?? value?.completion_tokens);
  const totalTokens = finiteOrNull(value?.total_tokens) ?? (Number.isFinite(inputTokens) && Number.isFinite(outputTokens) ? inputTokens + outputTokens : null);
  return { inputTokens, outputTokens, totalTokens };
}

function structuredValuePresent(value) {
  if (!value || typeof value !== "object") return false;
  return [value.textValue, value.dateValue, value.numberValue, value.booleanValue].some((item) => item !== null && item !== undefined && item !== "");
}

function normalizeTimestamp(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function normalizeUrl(value) {
  const parsed = parseHttpUrl(value);
  if (!parsed) return null;
  parsed.hash = "";
  for (const key of [...parsed.searchParams.keys()]) {
    if (/^(utm_|spm$|from$|ref$)/iu.test(key)) parsed.searchParams.delete(key);
  }
  parsed.hostname = parsed.hostname.toLocaleLowerCase("en-US");
  if (parsed.pathname !== "/") parsed.pathname = parsed.pathname.replace(/\/+$/u, "");
  return parsed.toString();
}

function parseHttpUrl(value) {
  try {
    const parsed = new URL(String(value ?? ""));
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed : null;
  } catch {
    return null;
  }
}

function isHttpUrl(value) {
  return Boolean(parseHttpUrl(value));
}

function cleanText(value, maxLength) {
  return String(value ?? "").replace(/[\r\n\t]+/gu, " ").replace(/\s+/gu, " ").trim().slice(0, maxLength);
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
