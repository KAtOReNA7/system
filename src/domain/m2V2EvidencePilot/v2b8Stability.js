import { canonicalJson, sha256 } from "./pilotCore.js";
import { canonicalizeV2B5SourceUrl } from "./sourceRecordV2B5.js";
import { classifyV2B5ProhibitedSource } from "./sourceGovernanceV2B5.js";

export const V2B8_SOURCE_CATEGORIES = Object.freeze([
  "official_author",
  "official_publisher",
  "official_platform",
  "government_or_registry",
  "mainstream_media",
  "search_index",
  "catalog_or_encyclopedia",
  "community_review",
  "retailer",
  "unknown_public_web",
  "prohibited",
]);

export const V2B8_EVENT_TIME_PRECISIONS = Object.freeze(["day", "month", "year", "range", "unknown"]);
export const V2B8_EVENT_TIME_BASES = Object.freeze([
  "explicit_structured_value",
  "explicit_source_snippet",
  "explicit_source_title",
  "unknown",
]);

export const V2B8_CONFLICT_FAMILIES = Object.freeze([
  "work_identity",
  "author_identity",
  "original_platform",
  "completion_status",
  "publication_publisher_date_edition_format",
  "adaptation_type_stage_date",
  "rating_platform_scale_value",
  "award_event",
  "mutually_exclusive_status",
]);

const OFFICIAL_SOURCE_CATEGORIES = new Set([
  "official_author",
  "official_publisher",
  "official_platform",
]);

const IDENTITY_SOURCE_CATEGORIES = new Set([
  "official_author",
  "official_publisher",
  "official_platform",
  "government_or_registry",
]);

const SOURCE_PRIORITY = Object.freeze({
  official_author: 0,
  official_publisher: 1,
  official_platform: 2,
  government_or_registry: 3,
  mainstream_media: 4,
  catalog_or_encyclopedia: 5,
  retailer: 6,
  search_index: 7,
  community_review: 8,
  unknown_public_web: 9,
  prohibited: 10,
});

const TEMPORAL_CLAIM_TYPES = new Set([
  "publication_event",
  "completion_status",
  "adaptation_event",
  "award_event",
  "ranking_signal",
  "rating_signal",
  "search_heat_signal",
  "market_signal",
]);

const EVENT_KEYWORD_PATTERNS = Object.freeze({
  publication_event: /出版|发行|首版|再版|isbn|press|publisher|publish(?:ed|ing|es)?|publication|release(?:d)?/iu,
  completion_status: /完结|完本|完成|连载|更新|completed|complete|ongoing|serializ/iu,
  adaptation_event: /改编|电影|电视|动画|动漫|广播剧|有声剧|游戏|启动|立项|签约|开机|拍摄|制作|上映|播出|发布|adapt|film|series|drama|release(?:d)?|premiere|production/iu,
  award_event: /获奖|奖项|入围|提名|winner|award|nominee/iu,
  ranking_signal: /排名|榜单|排行|rank/iu,
  rating_signal: /评分|星级|rating|score/iu,
  search_heat_signal: /搜索|热度|指数|search/iu,
  market_signal: /市场|销量|销售|market|sale/iu,
});

const EVENT_CLAUSE_BOUNDARY = /[。！？!?；;，,\r\n]/u;

export function classifyV2B8QueryExecution(execution) {
  if (execution?.contractValid === true) return "success_contract_valid";
  const status = String(execution?.status ?? "").toLowerCase();
  const issues = Array.isArray(execution?.issues) ? execution.issues.join(" ").toLowerCase() : "";
  if (status.includes("indeterminate")) return "indeterminate_after_crash";
  if (status.includes("transport") || execution?.httpSuccess === false && execution?.httpStatus === null) return "transport";
  if ([401, 403, 429].includes(execution?.httpStatus) || /auth|rate.?limit/u.test(`${status} ${issues}`)) return "auth_or_rate_limit";
  if (execution?.httpSuccess === true && Number(execution?.resultCount ?? 0) === 0) return "http_success_zero_result";
  if (/prohibited/u.test(issues)) return "prohibited_only";
  if (/duplicate/u.test(issues)) return "duplicate_only";
  if (execution?.httpSuccess === true && execution?.contractValid !== true) return "http_success_contract_invalid";
  return "other";
}

export function buildV2B8FallbackPlan(input) {
  const work = input?.work ?? {};
  const failure = input?.failure ?? {};
  const title = cleanIdentity(work.title);
  const author = cleanIdentity(work.author);
  if (!title || !author || classifyV2B8QueryExecution(failure) === "success_contract_valid") {
    throw new Error("v2b8_fallback_input_invalid");
  }
  const removeCountry = classifyV2B8QueryExecution(failure) === "http_success_zero_result";
  const queryText = `"${title}" "${author}"`;
  const payload = {
    schema: "m2.v2.v2b8-fallback-query-plan.v0.1",
    executionNamespace: "v2b8-canary-stability-fallback",
    queryId: `qry_${sha256({ namespace: "v2b8-canary-stability", priorQueryId: failure.queryId, queryText, removeCountry }).slice(0, 32)}`,
    priorQueryId: failure.queryId,
    canarySlotId: work.canarySlotId,
    runKind: "primary_fallback",
    queryText,
    intent: failure.intent ?? "fallback",
    country: removeCountry ? null : "china",
    topic: "general",
    searchDepth: "basic",
    maxResults: 6,
    fallbackRule: removeCountry ? "remove_long_intent_then_country" : "remove_long_intent",
  };
  const validation = validateV2B8FallbackPlan(payload, work);
  if (!validation.valid) throw new Error(`v2b8_fallback_plan_invalid:${validation.issues.join(",")}`);
  return payload;
}

export function buildV2B8RepeatSearchPlan(work) {
  const title = cleanIdentity(work?.title);
  const author = cleanIdentity(work?.author);
  if (!title || !author) throw new Error("v2b8_repeat_search_input_invalid");
  const queryText = `"${title}" "${author}" 作品 作者 原作 出版 平台`;
  return {
    schema: "m2.v2.v2b8-repeat-query-plan.v0.1",
    executionNamespace: "v2b8-canary-stability-repeat",
    queryId: `qry_${sha256({ namespace: "v2b8-canary-stability", canarySlotId: work.canarySlotId, queryText }).slice(0, 32)}`,
    canarySlotId: work.canarySlotId,
    runKind: "repeat",
    queryText,
    intent: "stable_core",
    country: "china",
    topic: "general",
    searchDepth: "basic",
    maxResults: 6,
  };
}

export function validateV2B8FallbackPlan(plan, work) {
  const issues = [];
  const title = cleanIdentity(work?.title);
  const author = cleanIdentity(work?.author);
  if (!title || !author || !plan?.queryText?.includes(`"${title}"`) || !plan?.queryText?.includes(`"${author}"`)) issues.push("title_author_not_preserved");
  if (plan?.maxResults !== 6 || plan?.topic !== "general" || plan?.searchDepth !== "basic") issues.push("search_parameters_invalid");
  if (![/^"[^"]+" "[^"]+"$/u].some((pattern) => pattern.test(plan?.queryText ?? ""))) issues.push("fallback_not_compact_identity_query");
  if (/(?:standardWorkId|identityDigest|收入|账单|revenue|forecast|B4|评级|版权|合同|渠道|备注)/iu.test(plan?.queryText ?? "")) issues.push("private_or_prohibited_outbound_field");
  if (!["china", null].includes(plan?.country)) issues.push("country_invalid");
  return { valid: issues.length === 0, issues: unique(issues) };
}

export function classifyV2B8Source(record, classificationEvidence = null) {
  if (classifyV2B5ProhibitedSource(record).prohibited) return "prohibited";
  const domain = normalizeText(record?.domain);
  const title = normalizeText(record?.title);
  const snippet = normalizeText(record?.snippet);
  const text = `${domain} ${title} ${snippet}`;
  const positiveCategory = authoritativeCategoryFromPositiveEvidence(classificationEvidence, domain);
  if (positiveCategory) return positiveCategory;
  if (/(?:新闻网|日报|晚报|周刊|电视台|广播网|news\b|times\b|post\b|media\b)/u.test(text)) return "mainstream_media";
  if (/(?:baike|百科|wikipedia|维基|图书馆|library|isbn|catalog|豆瓣读书|读书网)/u.test(text)) return "catalog_or_encyclopedia";
  if (/(?:豆瓣|知乎|论坛|贴吧|书评|读者评论|community|forum|review)/u.test(text)) return "community_review";
  if (/(?:京东|当当|亚马逊|天猫|淘宝|商城|购书|retail|amazon|jd\.com)/u.test(text)) return "retailer";
  if (/(?:baidu|bing|sogou|so\.com|search|搜索)/u.test(`${domain} ${title}`)) return "search_index";
  return "unknown_public_web";
}

export function selectDeterministicV2B8Sources(records, options = {}) {
  const limit = Number(options.limit ?? 6);
  const domainLimit = Number(options.domainLimit ?? 2);
  const categoryLimit = Number(options.categoryLimit ?? 2);
  const categoryDiversityTarget = Number(options.categoryDiversityTarget ?? 3);
  if (!Number.isInteger(limit) || limit < 1 || limit > 6) throw new Error("v2b8_source_limit_invalid");
  if (!Number.isInteger(domainLimit) || domainLimit < 1 || domainLimit > limit) throw new Error("v2b8_domain_limit_invalid");
  if (!Number.isInteger(categoryLimit) || categoryLimit < 1 || categoryLimit > limit) throw new Error("v2b8_category_limit_invalid");
  if (!Number.isInteger(categoryDiversityTarget) || categoryDiversityTarget < 1 || categoryDiversityTarget > limit) throw new Error("v2b8_category_diversity_target_invalid");
  const work = options.work ?? {};
  const classificationEvidenceBySourceId = options.classificationEvidenceBySourceId ?? {};
  const classify = (record) => classifyV2B8Source(record, classificationEvidenceBySourceId[record.sourceId]);
  const byId = new Map();
  let prohibitedCount = 0;
  for (const record of Array.isArray(records) ? records : []) {
    const category = classify(record);
    if (category === "prohibited") {
      prohibitedCount += 1;
      continue;
    }
    if (!byId.has(record.sourceId)) byId.set(record.sourceId, record);
  }
  const sorted = [...byId.values()].sort((left, right) => (
    (SOURCE_PRIORITY[classify(left)] ?? 99) - (SOURCE_PRIORITY[classify(right)] ?? 99)
      || directIdentityRelevance(right, work) - directIdentityRelevance(left, work)
      || finiteScore(right.providerScore) - finiteScore(left.providerScore)
      || canonicalUrl(left.url).localeCompare(canonicalUrl(right.url))
      || left.sourceId.localeCompare(right.sourceId)
  ));
  const selected = [];
  const domainCounts = new Map();
  const categoryCounts = new Map();
  const reservedIdentitySourceIds = [];
  const add = (record) => {
    if (!record || selected.length >= limit || selected.some((item) => item.sourceId === record.sourceId)) return false;
    const category = classify(record);
    const domain = normalizeText(record.domain);
    if ((domainCounts.get(domain) ?? 0) >= domainLimit || (categoryCounts.get(category) ?? 0) >= categoryLimit) return false;
    selected.push(record);
    domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
    return true;
  };

  // Preserve the highest-ranked positive-evidence identity source before any
  // review/rating-style source can consume the bounded selection capacity.
  const identity = sorted.find((record) => IDENTITY_SOURCE_CATEGORIES.has(classify(record)));
  if (add(identity)) reservedIdentitySourceIds.push(identity.sourceId);

  // First diversity pass: at most one source from each new category.
  for (const record of sorted) {
    if (selected.length >= limit || categoryCounts.size >= categoryDiversityTarget) break;
    if ((categoryCounts.get(classify(record)) ?? 0) > 0) continue;
    add(record);
  }

  // Stable fill while retaining both the per-domain and per-category caps.
  for (const record of sorted) {
    if (selected.length >= limit) break;
    add(record);
  }
  const availableCategoryCount = new Set(sorted.map(classify)).size;
  const achievableDiversityTarget = Math.min(categoryDiversityTarget, availableCategoryCount, limit);
  const limitations = [];
  if (categoryCounts.size < achievableDiversityTarget) limitations.push("category_diversity_target_not_achieved_within_caps");
  if (selected.length < Math.min(limit, sorted.length)) limitations.push("selection_capacity_not_filled_within_domain_and_category_caps");
  if (!identity) limitations.push("positive_evidence_identity_source_unavailable");
  return {
    sourceRecords: selected,
    prohibitedCount,
    duplicateCount: Math.max(0, (Array.isArray(records) ? records.length : 0) - prohibitedCount - byId.size),
    domainDiversityCount: new Set(selected.map((record) => normalizeText(record.domain))).size,
    categoryCounts: countBy(selected, classify),
    sourceCategoriesById: Object.fromEntries(selected.map((record) => [record.sourceId, classify(record)])),
    domainLimit,
    categoryLimit,
    categoryDiversityTarget: achievableDiversityTarget,
    categoryDiversityAchieved: categoryCounts.size,
    identityReservationApplied: reservedIdentitySourceIds.length > 0,
    reservedIdentitySourceIds,
    limitations,
    selectionDigest: sha256(selected.map((record) => record.sourceId)),
  };
}

export function normalizeV2B8Text(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[《》〈〉「」『』【】\[\]()（）]/gu, " ")
    .replace(/[，。！？、；：,.!?;:'"“”‘’·—–_-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function extractV2B8EventTime(claim, sourceRecords = []) {
  const temporal = TEMPORAL_CLAIM_TYPES.has(claim?.claimType);
  if (!temporal) {
    return {
      eventTime: null,
      eventTimePrecision: "unknown",
      eventTimeBasis: "unknown",
      eventTimeSourceId: null,
      eventTimeClauseDigest: null,
      eventTimeSpanStart: null,
      eventTimeSpanEnd: null,
      eventKeywordSpan: null,
      eventTimeEvidenceSpanDigest: null,
      explicitTemporalText: false,
      extractionSucceeded: true,
    };
  }
  const active = activeStructuredValue(claim?.structuredValue);
  const direct = parseDateEvidence(claim?.eventTime) ?? parseDateEvidence(active);
  const supportingEvidence = findSupportingDateEvidence(claim, sourceRecords, direct);
  if (supportingEvidence) {
    const basis = direct
      ? "explicit_structured_value"
      : supportingEvidence.field === "snippet" ? "explicit_source_snippet" : "explicit_source_title";
    return {
      eventTime: supportingEvidence.eventTime,
      eventTimePrecision: supportingEvidence.eventTimePrecision,
      eventTimeBasis: basis,
      eventTimeSourceId: supportingEvidence.sourceId,
      eventTimeClauseDigest: sha256({
        sourceId: supportingEvidence.sourceId,
        field: supportingEvidence.field,
        clauseStart: supportingEvidence.supportStart,
        clauseEnd: supportingEvidence.supportEnd,
        clause: supportingEvidence.supportSpan,
      }),
      eventTimeSpanStart: supportingEvidence.start,
      eventTimeSpanEnd: supportingEvidence.end,
      eventKeywordSpan: supportingEvidence.eventKeywordSpan,
      eventTimeEvidenceSpanDigest: sha256({
        sourceId: supportingEvidence.sourceId,
        field: supportingEvidence.field,
        dateStart: supportingEvidence.start,
        dateEnd: supportingEvidence.end,
        supportStart: supportingEvidence.supportStart,
        supportEnd: supportingEvidence.supportEnd,
        supportSpan: supportingEvidence.supportSpan,
      }),
      explicitTemporalText: true,
      extractionSucceeded: true,
    };
  }
  const explicitTemporalText = Boolean(direct)
    || sourceRecords.some((source) => [source?.snippet, source?.title].some((value) => hasClaimBoundDateText(claim, value)));
  return {
    eventTime: null,
    eventTimePrecision: "unknown",
    eventTimeBasis: "unknown",
    eventTimeSourceId: null,
    eventTimeClauseDigest: null,
    eventTimeSpanStart: null,
    eventTimeSpanEnd: null,
    eventKeywordSpan: null,
    eventTimeEvidenceSpanDigest: null,
    explicitTemporalText,
    extractionSucceeded: !explicitTemporalText,
  };
}

export function canonicalizeV2B8Claim(claim, context = {}) {
  const sourceById = new Map((context.sourceRecords ?? []).map((source) => [source.sourceId, source]));
  const sources = (claim?.supportingSourceIds ?? []).map((sourceId) => sourceById.get(sourceId)).filter(Boolean);
  const event = extractV2B8EventTime(claim, sources);
  const sourceCategories = unique(sources.map((source) => classifyV2B8Source(source, context.classificationEvidenceBySourceId?.[source.sourceId])));
  const sourceSupportClass = [...sourceCategories].sort((left, right) => (SOURCE_PRIORITY[left] ?? 99) - (SOURCE_PRIORITY[right] ?? 99))[0] ?? "unknown_public_web";
  const normalizedStructuredValue = normalizeStructuredValue(claim, sources, event);
  const normalizedEntityReference = normalizeEntityReference(claim, context.work);
  const canonicalPayload = {
    claimType: claim?.claimType ?? "other",
    normalizedStructuredValue,
    normalizedEventTime: event.eventTime,
    eventTimePrecision: event.eventTimePrecision,
    normalizedEntityReference,
    sourceSupportClass,
  };
  const limitations = [...(claim?.limitations ?? [])];
  const rejectionReasons = [...(claim?.rejectionReasons ?? [])];
  let pilotUsable = claim?.pilotUsable === true;
  if (claim?.claimType === "review_signal") {
    pilotUsable = false;
    rejectionReasons.push("review_signal_weak_subjective");
  }
  if (claim?.claimType === "rating_signal" && (!normalizedStructuredValue.platform || !normalizedStructuredValue.scale)) {
    pilotUsable = false;
    rejectionReasons.push("rating_platform_or_scale_missing");
  }
  if (event.explicitTemporalText && !event.extractionSucceeded) {
    pilotUsable = false;
    rejectionReasons.push("explicit_event_time_not_extracted");
  }
  return {
    ...claim,
    sourceCategories,
    sourceSupportClass,
    canonicalClaim: canonicalJson(canonicalPayload),
    canonicalClaimKey: sha256(canonicalPayload),
    normalizedStructuredValue,
    normalizedEntityReference,
    eventTime: event.eventTime,
    eventTimePrecision: event.eventTimePrecision,
    eventTimeBasis: event.eventTimeBasis,
    eventTimeSourceId: event.eventTimeSourceId,
    eventTimeClauseDigest: event.eventTimeClauseDigest,
    eventTimeSpanStart: event.eventTimeSpanStart,
    eventTimeSpanEnd: event.eventTimeSpanEnd,
    eventKeywordSpan: event.eventKeywordSpan,
    eventTimeEvidenceSpanDigest: event.eventTimeEvidenceSpanDigest,
    explicitTemporalText: event.explicitTemporalText,
    eventTimeExtractionSucceeded: event.extractionSucceeded,
    limitations: unique(limitations),
    rejectionReasons: unique(rejectionReasons),
    pilotUsable,
    researchApproved: false,
    modelEligible: false,
    researchOnly: true,
  };
}

export function auditV2B8Conflicts(claims) {
  const rows = (Array.isArray(claims) ? claims : []).map((claim) => ({ ...claim }));
  const conflicts = [];
  const limitations = [];
  const groups = new Map();
  for (const claim of rows) {
    const key = `${claim.runKind ?? "unknown"}:${claim.canarySlotId ?? "unknown"}:${claim.claimType}`;
    const group = groups.get(key) ?? [];
    group.push(claim);
    groups.set(key, group);
  }
  for (const [key, group] of groups) {
    const type = group[0]?.claimType;
    if (type === "completion_status") {
      const statuses = new Set(group.map((claim) => claim.normalizedStructuredValue?.status).filter((value) => value && value !== "unknown"));
      if (statuses.size > 1 || statuses.has("contradictory")) markConflict(group, key, "completion_status_conflict", conflicts, "completion_status");
    } else if (type === "author_identity" || type === "work_identity" || type === "original_platform") {
      const identities = new Set(group.map((claim) => canonicalJson(claim.normalizedStructuredValue)));
      if (identities.size > 1) markConflict(group, key, `${type}_conflict`, conflicts, type);
    } else if (type === "publication_event") {
      const byEdition = new Map();
      for (const claim of group) {
        const value = claim.normalizedStructuredValue ?? {};
        const editionKey = `${value.edition ?? "unknown"}:${value.format ?? "unknown"}`;
        const bucket = byEdition.get(editionKey) ?? [];
        bucket.push(claim);
        byEdition.set(editionKey, bucket);
      }
      for (const [editionKey, bucket] of byEdition) {
        const publishers = new Set(bucket.map((claim) => claim.normalizedStructuredValue?.publisher).filter(Boolean));
        const dates = new Set(bucket.map((claim) => claim.normalizedStructuredValue?.publicationDate).filter(Boolean));
        if (publishers.size > 1 || dates.size > 1) markConflict(bucket, `${key}:${editionKey}`, "same_edition_publication_conflict", conflicts, "publication_publisher_date_edition_format");
      }
      if (byEdition.size > 1) limitations.push({ groupKey: key, reason: "valid_multi_edition_or_format", claimCount: group.length });
    } else if (type === "adaptation_event") {
      const byType = groupBy(group, (claim) => claim.normalizedStructuredValue?.adaptationType ?? "unknown");
      for (const [adaptationType, bucket] of byType) {
        const byStage = groupBy(bucket, (claim) => claim.normalizedStructuredValue?.stage ?? "unknown");
        for (const [stage, stageBucket] of byStage) {
          const dates = new Set(stageBucket.map((claim) => (
            claim.normalizedStructuredValue?.eventTime ?? claim.eventTime ?? claim.normalizedStructuredValue?.releaseTime ?? null
          )).filter(Boolean));
          if (stageBucket.length > 1 && dates.size > 1) {
            markConflict(stageBucket, `${key}:${adaptationType}:${stage}`, "same_adaptation_type_stage_date_conflict", conflicts, "adaptation_type_stage_date");
          }
        }
        if (byStage.size > 1) limitations.push({ groupKey: `${key}:${adaptationType}`, reason: "valid_adaptation_stage_progression", claimCount: bucket.length });
      }
      if (byType.size > 1) limitations.push({ groupKey: key, reason: "valid_multiple_adaptation_types", claimCount: group.length });
    } else if (type === "rating_signal") {
      const byPlatformScale = new Map();
      for (const claim of group) {
        const value = claim.normalizedStructuredValue ?? {};
        const bucketKey = `${value.platform ?? "unknown"}:${value.scale ?? "unknown"}:${claim.eventTime ?? "unknown"}`;
        const bucket = byPlatformScale.get(bucketKey) ?? [];
        bucket.push(claim);
        byPlatformScale.set(bucketKey, bucket);
      }
      for (const [bucketKey, bucket] of byPlatformScale) {
        const values = new Set(bucket.map((claim) => claim.normalizedStructuredValue?.value).filter((value) => value !== null && value !== undefined));
        if (!bucketKey.startsWith("unknown:") && values.size > 1) markConflict(bucket, `${key}:${bucketKey}`, "rating_platform_scale_value_conflict", conflicts, "rating_platform_scale_value");
      }
      const observations = new Set(group.map((claim) => claim.eventTime).filter(Boolean));
      if (observations.size > 1) limitations.push({ groupKey: key, reason: "valid_rating_temporal_observations", claimCount: group.length });
    } else if (type === "award_event") {
      const byAward = groupBy(group, awardIdentity);
      for (const [awardKey, bucket] of byAward) {
        const signatures = new Set(bucket.map((claim) => canonicalJson({
          value: claim.normalizedStructuredValue,
          eventTime: claim.eventTime ?? null,
        })));
        if (bucket.length > 1 && signatures.size > 1) markConflict(bucket, `${key}:${awardKey}`, "award_event_conflict", conflicts, "award_event");
      }
    }
  }

  const mutuallyExclusive = groupBy(
    rows.filter((claim) => canonicalExclusiveStatus(claim) !== null),
    (claim) => `${claim.runKind ?? "unknown"}:${claim.canarySlotId ?? "unknown"}:canonical_status:${claim.claimType ?? "unknown"}`,
  );
  for (const [key, group] of mutuallyExclusive) {
    const statuses = new Set(group.map(canonicalExclusiveStatus));
    if (statuses.has("positive") && statuses.has("negative")) {
      markConflict(group, key, "mutually_exclusive_status_conflict", conflicts, "mutually_exclusive_status");
    }
  }
  const familyResults = Object.fromEntries(V2B8_CONFLICT_FAMILIES.map((family) => {
    const evidenceCount = conflictFamilyEvidenceCount(family, rows);
    const familyConflicts = conflicts.filter((conflict) => conflict.family === family);
    const applicable = evidenceCount > 0;
    const executed = applicable;
    const unresolvedCount = familyConflicts.filter((conflict) => conflict.status === "unresolved").length;
    return [family, {
      applicable,
      executed,
      evidenceCount,
      conflictCount: familyConflicts.length,
      unresolvedCount,
      passed: applicable && executed && unresolvedCount === 0,
    }];
  }));
  const applicableFamilyCount = Object.values(familyResults).filter((row) => row.applicable).length;
  const conflictAuditStatus = applicableFamilyCount === 0
    ? "NOT_EVALUABLE"
    : conflicts.some((conflict) => conflict.status === "unresolved") ? "FAIL" : "PASS";
  return {
    claims: rows,
    conflicts,
    limitations,
    unresolvedConflictCount: conflicts.length,
    validMultiEditionCount: limitations.filter((item) => item.reason === "valid_multi_edition_or_format").length,
    declaredConflictFamilies: [...V2B8_CONFLICT_FAMILIES],
    conflictFamilyResults: familyResults,
    applicableFamilyCount,
    conflictAuditStatus,
    passed: conflictAuditStatus === "PASS",
    conflictFamilyCoverage: Object.fromEntries(V2B8_CONFLICT_FAMILIES.map((family) => [family, familyResults[family].executed])),
  };
}

export function compareV2B8CanonicalClaims(primaryClaims, repeatClaims) {
  const primary = new Set((primaryClaims ?? []).filter((claim) => claim.pilotUsable).map((claim) => claim.canonicalClaimKey));
  const repeat = new Set((repeatClaims ?? []).filter((claim) => claim.pilotUsable).map((claim) => claim.canonicalClaimKey));
  if (!primary.size || !repeat.size) return { status: "not_evaluable", agreement: null, intersection: 0, union: new Set([...primary, ...repeat]).size };
  const intersection = [...primary].filter((key) => repeat.has(key)).length;
  const union = new Set([...primary, ...repeat]).size;
  return { status: "evaluable", agreement: union ? intersection / union : null, intersection, union };
}

export function decomposeV2B8ClaimDifferences(input) {
  const primary = input.primaryClaims ?? [];
  const fresh = input.freshClaims ?? [];
  const same = input.sameSourceClaims ?? [];
  const sourceSetChanged = input.primarySourceDigest !== input.freshSourceDigest;
  const canonical = compareV2B8CanonicalClaims(primary, fresh);
  const sameSource = compareV2B8CanonicalClaims(primary, same);
  const rawSignature = (claim) => sha256({ claimType: claim.claimType, structuredValue: claim.structuredValue, sourceIds: [...(claim.supportingSourceIds ?? [])].sort() });
  const primaryRaw = new Set(primary.filter((claim) => claim.pilotUsable).map(rawSignature));
  const freshRaw = new Set(fresh.filter((claim) => claim.pilotUsable).map(rawSignature));
  const rawAgreement = jaccard(primaryRaw, freshRaw);
  const primaryByType = groupBy(primary.filter((claim) => claim.pilotUsable), (claim) => claim.claimType);
  const freshByType = groupBy(fresh.filter((claim) => claim.pilotUsable), (claim) => claim.claimType);
  let claimAdded = 0;
  let claimMissing = 0;
  let structuredValueChanged = 0;
  let confidenceOnlyChanged = 0;
  let conflictStatusChanged = 0;
  let eventTimeChanged = 0;
  for (const type of unique([...primaryByType.keys(), ...freshByType.keys()])) {
    const left = primaryByType.get(type) ?? [];
    const right = freshByType.get(type) ?? [];
    if (!left.length) claimAdded += right.length;
    else if (!right.length) claimMissing += left.length;
    else {
      if (canonicalJson(left.map((claim) => claim.normalizedStructuredValue).sort(byJson)) !== canonicalJson(right.map((claim) => claim.normalizedStructuredValue).sort(byJson))) structuredValueChanged += 1;
      if (canonicalJson(left.map((claim) => claim.eventTime).sort()) !== canonicalJson(right.map((claim) => claim.eventTime).sort())) eventTimeChanged += 1;
      if (canonicalJson(left.map((claim) => claim.contradictionStatus).sort()) !== canonicalJson(right.map((claim) => claim.contradictionStatus).sort())) conflictStatusChanged += 1;
      const leftCanonical = new Set(left.map((claim) => claim.canonicalClaimKey));
      const rightCanonical = new Set(right.map((claim) => claim.canonicalClaimKey));
      if (jaccard(leftCanonical, rightCanonical) === 1) {
        const leftConfidence = average(left.map((claim) => claim.confidence).filter(Number.isFinite));
        const rightConfidence = average(right.map((claim) => claim.confidence).filter(Number.isFinite));
        if (Number.isFinite(leftConfidence) && Number.isFinite(rightConfidence) && leftConfidence !== rightConfidence) confidenceOnlyChanged += 1;
      }
    }
  }
  return {
    sourceSetChanged,
    sameSourceExtractionChanged: sameSource.status === "evaluable" && sameSource.agreement < 1,
    canonicalizationOnlyDifference: canonical.status === "evaluable" && canonical.agreement > rawAgreement,
    claimAdded,
    claimMissing,
    structuredValueChanged,
    confidenceOnlyChanged,
    conflictStatusChanged,
    eventTimeChanged,
    rawAgreement,
    semanticAgreement: canonical.agreement,
    sameSourceAgreement: sameSource.agreement,
  };
}

function markConflict(group, key, reason, conflicts, family) {
  const claimKeys = group.map((claim) => claim.canonicalClaimKey);
  const conflictKey = `ctr_${sha256({ key, reason, claimKeys }).slice(0, 24)}`;
  if (!conflicts.some((conflict) => conflict.conflictKey === conflictKey)) {
    conflicts.push({ conflictKey, family, reason, claimKeys, status: "unresolved" });
  }
  for (const claim of group) {
    claim.contradictionStatus = "unresolved";
    claim.accepted = false;
    claim.pilotUsable = false;
    claim.rejectionReasons = unique([...(claim.rejectionReasons ?? []), "conflict_unresolved"]);
  }
}

function canonicalExclusiveStatus(claim) {
  const raw = claim?.normalizedStructuredValue?.status
    ?? claim?.normalizedStructuredValue?.value
    ?? activeStructuredValue(claim?.structuredValue);
  if (typeof raw === "boolean") return raw ? "positive" : "negative";
  const value = normalizeV2B8Text(raw);
  if (/^(?:active|available|enabled|yes|true|valid|有效|可用|启用|存在)$/u.test(value)) return "positive";
  if (/^(?:inactive|unavailable|disabled|no|false|invalid|无效|不可用|停用|不存在)$/u.test(value)) return "negative";
  return null;
}

function conflictFamilyEvidenceCount(family, claims) {
  const types = {
    work_identity: new Set(["work_identity"]),
    author_identity: new Set(["author_identity"]),
    original_platform: new Set(["original_platform"]),
    completion_status: new Set(["completion_status"]),
    publication_publisher_date_edition_format: new Set(["publication_event"]),
    adaptation_type_stage_date: new Set(["adaptation_event"]),
    rating_platform_scale_value: new Set(["rating_signal"]),
    award_event: new Set(["award_event"]),
  };
  if (family === "mutually_exclusive_status") return claims.filter((claim) => canonicalExclusiveStatus(claim) !== null).length;
  return claims.filter((claim) => types[family]?.has(claim.claimType)).length;
}

function awardIdentity(claim) {
  const value = normalizeV2B8Text(claim?.normalizedStructuredValue?.value ?? activeStructuredValue(claim?.structuredValue));
  const withoutDateOrStatus = value
    .replace(/(?:19|20)\d{2}(?:\s*年)?/gu, " ")
    .replace(/获奖|获奖者|入围|提名|winner|won|awardee|nominee/giu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return withoutDateOrStatus || "unknown_award";
}

function normalizeStructuredValue(claim, sources, event) {
  const active = activeStructuredValue(claim?.structuredValue);
  const normalized = normalizeV2B8Text(active);
  if (claim?.claimType === "work_identity") return { title: normalizeIdentityValue(normalized, "work") };
  if (claim?.claimType === "author_identity") return { author: normalizeIdentityValue(normalized, "author") };
  if (claim?.claimType === "completion_status") return { status: completionStatus(normalized, sources) };
  if (claim?.claimType === "publication_event") {
    const support = normalizeV2B8Text([active, ...sources.flatMap((source) => [source.title, source.snippet])].join(" "));
    return {
      publisher: firstMatch(support, /([\p{Script=Han}a-z0-9]{2,30}(?:出版社|出版集团|出版公司|press|publisher))/iu),
      publicationDate: event.eventTime,
      edition: firstMatch(support, /(第[一二三四五六七八九十0-9]+版|再版|首版|全版|大结局|完整版)/u),
      format: firstMatch(support, /(电子版|纸质版|精装|平装|网络版|有声版)/u),
      value: normalized || null,
    };
  }
  if (claim?.claimType === "rating_signal") {
    const support = normalizeV2B8Text([active, ...sources.flatMap((source) => [source.title, source.snippet])].join(" "));
    const value = Number(String(active ?? "").match(/\d+(?:\.\d+)?/u)?.[0]);
    const scale = Number(support.match(/(?:满分|总分|out of)\s*(10|5|100)/u)?.[1] ?? (value > 5 ? 10 : 5));
    return {
      platform: firstMatch(support, /(豆瓣|goodreads|amazon|京东|当当|起点|晋江|番茄小说)/iu),
      scale: Number.isFinite(scale) ? scale : null,
      value: Number.isFinite(value) ? value : null,
      ratingCount: parseCount(support),
    };
  }
  if (claim?.claimType === "adaptation_event") {
    const support = normalizeV2B8Text([active, ...sources.flatMap((source) => [source.title, source.snippet])].join(" "));
    return {
      adaptationType: firstMatch(support, /(电影|电视剧|动画|动漫|广播剧|有声剧|游戏|舞台剧)/u),
      stage: firstMatch(support, /(启动|立项|签约|开机|拍摄|制作|上映|播出|发布)/u),
      organization: firstMatch(support, /([\p{Script=Han}a-z0-9]{2,30}(?:公司|集团|电视台|工作室|影业))/iu),
      eventTime: event.eventTime,
      releaseTime: /上映|播出|发布/u.test(support) ? event.eventTime : null,
    };
  }
  return { valueType: claim?.structuredValue?.valueType ?? null, value: normalizeScalar(active), eventTime: event.eventTime };
}

function normalizeEntityReference(claim, work) {
  if (claim?.claimType === "author_identity") return normalizeIdentityValue(work?.author, "author");
  return normalizeIdentityValue(work?.title, "work");
}

function normalizeIdentityValue(value, kind) {
  let normalized = normalizeV2B8Text(value);
  normalized = normalized.replace(kind === "author" ? /^(?:作者|作家)\s*/u : /^(?:小说|作品)\s*/u, "");
  if (kind === "work") normalized = normalized.replace(/\s*(?:小说|作品)$/u, "");
  return normalized;
}

function completionStatus(value, sources) {
  const text = normalizeV2B8Text([value, ...sources.flatMap((source) => [source.title, source.snippet])].join(" "));
  const ongoing = /连载中|更新中|未完结|ongoing|serializing/u.test(text);
  const completed = /已完结|完结|全本|completed|complete/u.test(text);
  if (ongoing && completed) return "contradictory";
  if (ongoing) return "ongoing";
  if (completed) return "completed";
  return "unknown";
}

function parseDateEvidence(value) {
  const text = String(value ?? "").normalize("NFKC");
  if (!text) return null;
  const range = text.match(/((?:19|20)\d{2})\s*(?:年)?\s*(?:至|到|[-–—~])\s*((?:19|20)\d{2})\s*(?:年)?/u);
  if (range) return dateEvidence(text, range, `${range[1]}/${range[2]}`, "range");
  const day = text.match(/((?:19|20)\d{2})\s*(?:年|[-/.])\s*(0?[1-9]|1[0-2])\s*(?:月|[-/.])\s*(0?[1-9]|[12]\d|3[01])\s*(?:日)?/u);
  if (day) return dateEvidence(text, day, `${day[1]}-${pad2(day[2])}-${pad2(day[3])}`, "day");
  const month = text.match(/((?:19|20)\d{2})\s*(?:年|[-/.])\s*(0?[1-9]|1[0-2])\s*(?:月)?/u);
  if (month) return dateEvidence(text, month, `${month[1]}-${pad2(month[2])}`, "month");
  const year = text.match(/(?:^|\D)((?:19|20)\d{2})\s*(?:年)?(?:\D|$)/u);
  if (year) {
    const start = year.index + year[0].indexOf(year[1]);
    return { eventTime: year[1], eventTimePrecision: "year", start, end: start + year[1].length, span: year[1] };
  }
  return null;
}

function dateEvidence(text, match, eventTime, eventTimePrecision) {
  const start = match.index;
  const span = text.slice(start, start + match[0].length);
  return { eventTime, eventTimePrecision, start, end: start + span.length, span };
}

function findSupportingDateEvidence(claim, sourceRecords, requested) {
  const matches = [];
  for (const source of sourceRecords) {
    for (const field of ["snippet", "title"]) {
      const value = source?.[field];
      for (const evidence of parseDateEvidences(value)) {
        if (requested) {
          if (evidence.eventTime !== requested.eventTime || evidence.eventTimePrecision !== requested.eventTimePrecision) continue;
        }
        const support = claimBoundDateSupport(claim, value, evidence);
        if (!support) continue;
        matches.push({ ...evidence, ...support, field, sourceId: source.sourceId });
      }
    }
  }
  if (!matches.length) return null;
  if (!requested) {
    const distinctTimes = new Set(matches.map((item) => `${item.eventTime}:${item.eventTimePrecision}`));
    if (distinctTimes.size !== 1) return null;
  }
  return matches.sort((left, right) => (
    String(left.sourceId).localeCompare(String(right.sourceId))
      || left.field.localeCompare(right.field)
      || left.start - right.start
      || left.end - right.end
  ))[0];
}

function parseDateEvidences(value) {
  const text = String(value ?? "").normalize("NFKC");
  const results = [];
  let offset = 0;
  while (offset < text.length) {
    const evidence = parseDateEvidence(text.slice(offset));
    if (!evidence) break;
    const adjusted = { ...evidence, start: offset + evidence.start, end: offset + evidence.end };
    results.push(adjusted);
    offset = Math.max(offset + 1, adjusted.end);
  }
  return results;
}

function hasClaimBoundDateText(claim, value) {
  return parseDateEvidences(value).some((evidence) => claimBoundDateSupport(claim, value, evidence));
}

function claimBoundDateSupport(claim, value, evidence) {
  const text = String(value ?? "").normalize("NFKC");
  let supportStart = evidence.start;
  while (supportStart > 0 && !EVENT_CLAUSE_BOUNDARY.test(text[supportStart - 1])) supportStart -= 1;
  let supportEnd = evidence.end;
  while (supportEnd < text.length && !EVENT_CLAUSE_BOUNDARY.test(text[supportEnd])) supportEnd += 1;
  const supportSpan = text.slice(supportStart, supportEnd).trim();
  const normalizedClause = normalizeV2B8Text(supportSpan);
  const normalizedClaimValue = normalizeV2B8Text(activeStructuredValue(claim?.structuredValue));
  const tentative = /计划|拟于|预计|预定|planned|expected|scheduled|proposed/iu;
  const negated = /(?:未曾|尚未|没有|取消|not|never|cancelled|canceled)/iu;
  if (tentative.test(normalizedClause) && !tentative.test(normalizedClaimValue)) return null;
  if (negated.test(normalizedClause) && !negated.test(normalizedClaimValue)) return null;
  const pattern = EVENT_KEYWORD_PATTERNS[claim?.claimType];
  if (!pattern) return null;
  const keywordPattern = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  const keywords = [...text.slice(supportStart, supportEnd).matchAll(keywordPattern)].map((match) => ({
    start: supportStart + match.index,
    end: supportStart + match.index + match[0].length,
  }));
  if (!keywords.length) return null;
  const keyword = keywords.sort((left, right) => (
    spanDistance(left, evidence) - spanDistance(right, evidence)
      || left.start - right.start
  ))[0];
  return {
    supportStart,
    supportEnd,
    supportSpan,
    eventKeywordSpan: { start: keyword.start, end: keyword.end },
  };
}

function spanDistance(left, right) {
  if (left.end <= right.start) return right.start - left.end;
  if (right.end <= left.start) return left.start - right.end;
  return 0;
}

function activeStructuredValue(value) {
  if (!value || typeof value !== "object") return null;
  return { text: value.textValue, date: value.dateValue, number: value.numberValue, boolean: value.booleanValue }[value.valueType] ?? null;
}

function parseCount(text) {
  const match = text.match(/(\d+(?:\.\d+)?)\s*(万|千)?\s*(?:人|个)?\s*(?:评分|评价|rating|review)/iu);
  if (!match) return null;
  const factor = match[2] === "万" ? 10_000 : match[2] === "千" ? 1_000 : 1;
  return Math.round(Number(match[1]) * factor);
}

function directIdentityRelevance(record, work) {
  const text = normalizeV2B8Text(`${record.title} ${record.snippet}`);
  const title = normalizeV2B8Text(work?.title);
  const author = normalizeV2B8Text(work?.author);
  return Number(Boolean(title && text.includes(title))) + Number(Boolean(author && text.includes(author)));
}

function canonicalUrl(value) {
  return canonicalizeV2B5SourceUrl(value) ?? String(value ?? "");
}

function authoritativeCategoryFromPositiveEvidence(evidence, normalizedDomain) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return null;
  const candidates = [
    evidence.approvedDomainRule?.matched === true
      && normalizeText(evidence.approvedDomainRule?.domain) === normalizedDomain
      && typeof evidence.approvedDomainRule?.ruleId === "string"
      ? evidence.approvedDomainRule.category : null,
    evidence.providerMetadata?.verified === true
      && typeof evidence.providerMetadata?.field === "string"
      ? evidence.providerMetadata.category : null,
    evidence.entityDomainCorroboration?.verified === true
      && normalizeText(evidence.entityDomainCorroboration?.domain) === normalizedDomain
      && typeof evidence.entityDomainCorroboration?.entityReferenceDigest === "string"
      ? evidence.entityDomainCorroboration.category : null,
  ].filter((category) => OFFICIAL_SOURCE_CATEGORIES.has(category) || category === "government_or_registry");
  return unique(candidates).length === 1 ? candidates[0] : null;
}

function cleanIdentity(value) {
  return typeof value === "string" ? [...value.normalize("NFKC").replace(/\s+/gu, " ").trim()].slice(0, 240).join("") : "";
}

function normalizeText(value) {
  return String(value ?? "").normalize("NFKC").toLocaleLowerCase("zh-CN");
}

function finiteScore(value) {
  return Number.isFinite(value) ? value : -1;
}

function normalizeScalar(value) {
  if (typeof value === "number" || typeof value === "boolean") return value;
  const text = normalizeV2B8Text(value);
  if (/^-?\d+(?:\.\d+)?$/u.test(text)) return Number(text);
  return text || null;
}

function firstMatch(value, pattern) {
  return value.match(pattern)?.[1] ?? null;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function countBy(values, keyFn) {
  return values.reduce((result, value) => {
    const key = keyFn(value);
    result[key] = (result[key] ?? 0) + 1;
    return result;
  }, {});
}

function groupBy(values, keyFn) {
  const groups = new Map();
  for (const value of values) {
    const key = keyFn(value);
    const group = groups.get(key) ?? [];
    group.push(value);
    groups.set(key, group);
  }
  return groups;
}

function jaccard(left, right) {
  const union = new Set([...left, ...right]);
  if (!union.size) return null;
  return [...left].filter((value) => right.has(value)).length / union.size;
}

function byJson(left, right) {
  return canonicalJson(left).localeCompare(canonicalJson(right));
}

function average(values) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
}

function unique(values) {
  return [...new Set(values)];
}
