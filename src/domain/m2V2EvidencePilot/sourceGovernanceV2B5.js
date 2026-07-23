import { canonicalJson } from "./pilotCore.js";
import {
  V2B5_SOURCE_RECORD_SCHEMA,
  isV2B5ShortenerDomain,
  validateV2B5SourceRecord,
} from "./sourceRecordV2B5.js";

export const V2B5_SOURCE_GOVERNANCE_SCHEMA = "m2.v2.source-governance-policy.v0.3";
export const V2B5_RESEARCH_REGISTRY_SCHEMA = "m2.v2.research-source-candidate-registry.v0.3";

export const V2B5_DEFAULT_SOURCE_GOVERNANCE_POLICY = deepFreeze({
  schema: V2B5_SOURCE_GOVERNANCE_SCHEMA,
  status: "prospective_pilot_only",
  effectiveDate: "2026-07-18",
  sourceRecordSchema: V2B5_SOURCE_RECORD_SCHEMA,
  approvedPilotSearchProviders: ["tavily_structured_search"],
  pilotUsable: {
    termsReviewMayBePending: true,
    legalReviewMayBePending: true,
    researchOnlyRequired: true,
    modelEligibleRequired: false,
    historicalBackfillAllowed: false,
  },
  researchAllowlist: {
    purpose: "future_prospective_shadow",
    approvedDomainEntries: [],
    automaticApprovalForbidden: true,
  },
  modelAllowlist: {
    purpose: "future_model_training",
    defaultEmpty: true,
    approvedDomainEntries: [],
    automaticApprovalForbidden: true,
  },
  promotionRule: {
    pilotUsableDoesNotImplyResearchApproval: true,
    researchApprovalDoesNotImplyModelApproval: true,
    automaticPromotionForbidden: true,
  },
  currentRunInvariants: {
    researchApproved: false,
    modelEligible: false,
    notForFormalDecision: true,
  },
});

const FILE_SHARING_DOMAINS = Object.freeze([
  "aliyundrive.com",
  "drive.google.com",
  "dropbox.com",
  "mega.nz",
  "onedrive.live.com",
  "pan.baidu.com",
  "pan.quark.cn",
  "sharepoint.com",
  "weiyun.com",
]);

const MALICIOUS_DOMAIN_TOKENS = Object.freeze([
  "adult",
  "bet",
  "casino",
  "gambling",
  "malware",
  "phishing",
  "porn",
  "scam",
  "sex",
]);

const AI_SUMMARY_DOMAIN_TOKENS = Object.freeze([
  "ai-summary",
  "aisummary",
  "generated-summary",
  "summary-ai",
]);

const PROHIBITED_CONTENT_PATTERNS = Object.freeze([
  { category: "credential_or_secret", pattern: /(?:api[_\s-]*key|authorization\s*:\s*bearer|password\s*[:=]|tvly-[A-Za-z0-9_-]{8,}|sk-[A-Za-z0-9_-]{8,})/iu },
  { category: "personal_private_information", pattern: /(?:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:\+?86[-\s]?)?1[3-9]\d{9}|\d{6}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[0-9X])/iu },
  { category: "login_private_paywall_or_captcha", pattern: /(?:仅自己可见|私密内容|登录后可见|请输入验证码|sign\s*in\s*to\s*view|access\s*denied|paywall)/iu },
  { category: "unattributed_ai_summary", pattern: /(?:无来源|without\s+sources?).{0,12}(?:AI|人工智能).{0,12}(?:摘要|summary)|(?:AI|人工智能).{0,12}(?:生成|generated).{0,12}(?:摘要|summary)/iu },
  { category: "malicious_gambling_adult_or_scam", pattern: /(?:博彩|赌博|色情|诈骗|casino|gambling|phishing|malware)/iu },
]);

export function validateV2B5SourceGovernancePolicy(policy) {
  const issues = [];
  if (!isObject(policy)) return { valid: false, issues: ["source_governance_policy_not_object"] };
  if (policy.schema !== V2B5_SOURCE_GOVERNANCE_SCHEMA) issues.push("source_governance_schema_invalid");
  if (!isIsoDate(policy.effectiveDate)) issues.push("source_governance_effective_date_invalid");
  if (policy.sourceRecordSchema !== V2B5_SOURCE_RECORD_SCHEMA) issues.push("source_governance_source_schema_invalid");
  if (canonicalJson(policy.approvedPilotSearchProviders) !== canonicalJson(["tavily_structured_search"])) {
    issues.push("source_governance_pilot_provider_invalid");
  }
  if (policy?.pilotUsable?.termsReviewMayBePending !== true
    || policy?.pilotUsable?.legalReviewMayBePending !== true
    || policy?.pilotUsable?.researchOnlyRequired !== true
    || policy?.pilotUsable?.modelEligibleRequired !== false
    || policy?.pilotUsable?.historicalBackfillAllowed !== false) {
    issues.push("source_governance_pilot_usable_rule_invalid");
  }
  for (const [name, purpose] of [["researchAllowlist", "future_prospective_shadow"], ["modelAllowlist", "future_model_training"]]) {
    const allowlist = policy[name];
    if (!isObject(allowlist) || allowlist.purpose !== purpose || allowlist.automaticApprovalForbidden !== true) {
      issues.push(`${name}_invalid`);
      continue;
    }
    if (!Array.isArray(allowlist.approvedDomainEntries) || allowlist.approvedDomainEntries.length !== 0) {
      issues.push(`${name}_must_remain_empty`);
    }
  }
  if (policy?.modelAllowlist?.defaultEmpty !== true) issues.push("model_allowlist_default_empty_missing");
  if (policy?.promotionRule?.pilotUsableDoesNotImplyResearchApproval !== true
    || policy?.promotionRule?.researchApprovalDoesNotImplyModelApproval !== true
    || policy?.promotionRule?.automaticPromotionForbidden !== true) {
    issues.push("source_governance_promotion_rule_invalid");
  }
  if (policy?.currentRunInvariants?.researchApproved !== false
    || policy?.currentRunInvariants?.modelEligible !== false
    || policy?.currentRunInvariants?.notForFormalDecision !== true) {
    issues.push("source_governance_current_run_invariant_invalid");
  }
  return { valid: issues.length === 0, issues: unique(issues) };
}

export function classifyV2B5ProhibitedSource(record) {
  const reasons = [];
  const categories = [];
  const validation = validateV2B5SourceRecord(record);
  if (!validation.valid) {
    reasons.push(...validation.issues.map((issue) => `contract:${issue}`));
    categories.push("invalid_source_contract");
  }
  let url = null;
  try { url = new URL(record?.url); } catch { /* classified below */ }
  if (!url || url.protocol !== "https:") {
    reasons.push("https_required");
    categories.push("non_https_or_missing_url");
  }
  const domain = String(record?.domain ?? url?.hostname ?? "").toLocaleLowerCase("en-US");
  if (!domain) {
    reasons.push("domain_unparseable");
    categories.push("unparseable_domain");
  }
  if (isV2B5ShortenerDomain(domain)) {
    reasons.push("shortener_not_canonical_source");
    categories.push("url_shortener");
  }
  if (domainMatches(domain, FILE_SHARING_DOMAINS)) {
    reasons.push("file_sharing_source_prohibited");
    categories.push("file_sharing");
  }
  const pathAndQuery = `${url?.pathname ?? ""} ${url?.search ?? ""}`.toLocaleLowerCase("en-US");
  if (/(?:^|[\/_-])(login|signin|private|captcha|paywall)(?:[\/_-]|$)/u.test(pathAndQuery)) {
    reasons.push("login_private_or_bypass_page_prohibited");
    categories.push("login_private_paywall_or_captcha");
  }
  if (domainHasRiskToken(domain, MALICIOUS_DOMAIN_TOKENS)) {
    reasons.push("malicious_or_adult_domain_prohibited");
    categories.push("malicious_gambling_adult_or_scam");
  }
  if (domainHasRiskToken(domain, AI_SUMMARY_DOMAIN_TOKENS)) {
    reasons.push("unattributed_ai_summary_source_prohibited");
    categories.push("unattributed_ai_summary");
  }
  const publicText = `${String(record?.title ?? "")} ${String(record?.snippet ?? "")}`;
  for (const rule of PROHIBITED_CONTENT_PATTERNS) {
    if (!rule.pattern.test(publicText)) continue;
    reasons.push(`${rule.category}_content_prohibited`);
    categories.push(rule.category);
  }
  return {
    prohibited: reasons.length > 0,
    reasons: unique(reasons),
    categories: unique(categories),
  };
}

export function evaluateV2B5PilotUsability(input, policy = V2B5_DEFAULT_SOURCE_GOVERNANCE_POLICY) {
  const policyValidation = validateV2B5SourceGovernancePolicy(policy);
  if (!policyValidation.valid) throw new Error(`v2b5_governance_policy_invalid:${policyValidation.issues.join(",")}`);
  const sources = Array.isArray(input?.sources) ? input.sources : [];
  const reasons = [];
  if (input?.accepted !== true) reasons.push("claim_not_accepted");
  if (sources.length === 0) reasons.push("source_id_missing");
  for (const source of sources) {
    const validation = validateV2B5SourceRecord(source);
    if (!validation.valid) reasons.push("source_contract_invalid");
    if (!policy.approvedPilotSearchProviders.includes(source?.searchProvider)) reasons.push("search_provider_not_pilot_approved");
    const prohibited = classifyV2B5ProhibitedSource(source);
    if (prohibited.prohibited) reasons.push(...prohibited.reasons);
    if (!isIsoTimestamp(source?.capturedAt) || !isIsoTimestamp(source?.availableAt)) reasons.push("source_time_missing");
    if (source?.availableAt !== source?.capturedAt || source?.availableAtBasis !== "first_observed_by_system") {
      reasons.push("historical_backfill_or_time_basis_invalid");
    }
    if (source?.researchOnly !== true || source?.modelEligible !== false) reasons.push("source_current_run_qualification_invalid");
  }
  const workStatus = input?.entityResolution?.work?.status;
  if (!['high', 'medium'].includes(workStatus)) reasons.push("work_identity_not_resolved");
  if (input?.claimInvolvesAuthor === true) {
    const authorStatus = input?.entityResolution?.author?.status;
    if (!['high', 'medium'].includes(authorStatus)) reasons.push("author_identity_not_resolved");
  }
  if (!["none", "resolved"].includes(input?.contradictionStatus)) reasons.push("conflict_unresolved");
  if (input?.citationAligned !== true) reasons.push("source_mapping_invalid");
  if (input?.privateLeakDetected !== false) reasons.push("private_leak_audit_not_clean");
  if (input?.historicalBackfillDetected !== false) reasons.push("historical_backfill_audit_not_clean");
  const rejectionReasons = unique(reasons);
  return {
    pilotUsable: rejectionReasons.length === 0,
    researchApproved: false,
    modelEligible: false,
    termsReviewStatus: "pending",
    legalReviewStatus: "pending",
    researchOnly: true,
    rejectionReasons,
  };
}

export function buildV2B5ResearchCandidateRegistry(sourceRecords, evidenceRows = [], candidateObservations = []) {
  const records = Array.isArray(sourceRecords) ? sourceRecords : [];
  const evidence = Array.isArray(evidenceRows) ? evidenceRows : [];
  const observations = Array.isArray(candidateObservations) ? candidateObservations : [];
  const byDomain = new Map();
  for (const record of records) {
    const domain = String(record?.domain ?? "").toLocaleLowerCase("en-US");
    if (!domain) continue;
    const current = byDomain.get(domain) ?? {
      domain,
      firstSeenAt: null,
      searchProvider: record.searchProvider,
      sourceTypes: new Set(),
      publicHttpsObserved: true,
      sourceIds: new Set(),
      prohibitedCategories: new Set(),
      observationCount: 0,
    };
    if (!current.firstSeenAt || Date.parse(record.capturedAt) < Date.parse(current.firstSeenAt)) current.firstSeenAt = record.capturedAt;
    current.sourceTypes.add(record.sourceTypeCandidate);
    current.sourceIds.add(record.sourceId);
    if (observations.length === 0) current.observationCount += 1;
    current.publicHttpsObserved = current.publicHttpsObserved && String(record.url).startsWith("https://");
    for (const category of classifyV2B5ProhibitedSource(record).categories) current.prohibitedCategories.add(category);
    byDomain.set(domain, current);
  }
  for (const observation of observations) {
    const domain = String(observation?.domain ?? "").toLocaleLowerCase("en-US");
    if (!domain) continue;
    const current = byDomain.get(domain) ?? {
      domain,
      firstSeenAt: null,
      searchProvider: observation.searchProvider,
      sourceTypes: new Set(),
      publicHttpsObserved: true,
      sourceIds: new Set(),
      prohibitedCategories: new Set(),
      observationCount: 0,
    };
    if (isIsoTimestamp(observation.firstSeenAt)
      && (!current.firstSeenAt || Date.parse(observation.firstSeenAt) < Date.parse(current.firstSeenAt))) {
      current.firstSeenAt = observation.firstSeenAt;
    }
    current.searchProvider = current.searchProvider ?? observation.searchProvider;
    current.sourceTypes.add(observation.sourceTypeCandidate ?? "other");
    current.observationCount += Number.isInteger(observation.resultCount) && observation.resultCount > 0
      ? observation.resultCount : 1;
    current.publicHttpsObserved = current.publicHttpsObserved && observation.publicHttpsObserved === true;
    if (observation.publicHttpsObserved !== true) current.prohibitedCategories.add("non_https_or_missing_url");
    if (isV2B5ShortenerDomain(domain)) current.prohibitedCategories.add("url_shortener");
    if (domainMatches(domain, FILE_SHARING_DOMAINS)) current.prohibitedCategories.add("file_sharing");
    if (domainHasRiskToken(domain, MALICIOUS_DOMAIN_TOKENS)) current.prohibitedCategories.add("malicious_gambling_adult_or_scam");
    if (domainHasRiskToken(domain, AI_SUMMARY_DOMAIN_TOKENS)) current.prohibitedCategories.add("unattributed_ai_summary");
    byDomain.set(domain, current);
  }
  const entries = [...byDomain.values()].map((value) => {
    const pilotUsableEvidenceKeys = new Set(evidence.filter((row) => row?.pilotUsable === true
      && (row?.supportingSourceIds ?? []).some((sourceId) => value.sourceIds.has(sourceId)))
      .map((row) => canonicalJson({ claimType: row.claimType, structuredValue: row.structuredValue, supportingSourceIds: [...(row.supportingSourceIds ?? [])].sort() })));
    const sourceTypes = [...value.sourceTypes].sort();
    return {
      domain: value.domain,
      firstSeenAt: value.firstSeenAt,
      searchProvider: value.searchProvider,
      sourceTypeCandidate: sourceTypes.length === 1 ? sourceTypes[0] : "mixed",
      publicHttpsObserved: value.publicHttpsObserved,
      resultCount: value.observationCount,
      uniqueSourceCount: value.sourceIds.size,
      pilotUsableEvidenceCount: pilotUsableEvidenceKeys.size,
      prohibitedCategories: [...value.prohibitedCategories].sort(),
      termsReviewStatus: "pending",
      legalReviewStatus: "pending",
      researchApproved: false,
      modelEligible: false,
    };
  }).sort((left, right) => left.domain.localeCompare(right.domain));
  return {
    schema: V2B5_RESEARCH_REGISTRY_SCHEMA,
    privateOnly: true,
    defaultTermsReviewStatus: "pending",
    defaultLegalReviewStatus: "pending",
    automaticPromotionUsed: false,
    uniqueDomainCount: entries.length,
    entries,
  };
}

function domainMatches(domain, candidates) {
  return candidates.some((candidate) => domain === candidate || domain.endsWith(`.${candidate}`));
}

function domainHasRiskToken(domain, tokens) {
  const labels = String(domain ?? "").split(".").filter(Boolean);
  return tokens.some((token) => labels.some((label) => label === token
    || label.startsWith(`${token}-`) || label.endsWith(`-${token}`)));
}

function isIsoTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function isIsoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00.000Z`));
}

function unique(values) {
  return [...new Set(values)];
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
