import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { verifyTrackedCoreCommitmentV0_1 } from "./authorityGraph.js";
import { sha256 as sha256Value } from "./pilotCore.js";

export const CURRENT_AUTHORITY_SCHEMA = "m2.v2.current-authority-private.v0.2";
export const LEGACY_CURRENT_STATE_INDEX_RELATIVE = "docs/analysis/m2-v2/M2-v2-current-state-index-v0.2.json";
export const LEGACY_CURRENT_RESTATEMENT_RELATIVE = "docs/analysis/m2-v2/M2-v2-canary-v3-1-integrity-restatement-v0.3.json";
export const DEFAULT_CURRENT_STATE_INDEX_RELATIVE = "docs/analysis/m2-v2/M2-v2-current-state-index-v0.3.json";
export const DEFAULT_CURRENT_RESTATEMENT_RELATIVE = "docs/analysis/m2-v2/M2-v2-canary-v3-1-integrity-restatement-v0.4.json";
export const NEXT_CURRENT_STATE_INDEX_RELATIVE = DEFAULT_CURRENT_STATE_INDEX_RELATIVE;
export const NEXT_CURRENT_RESTATEMENT_RELATIVE = DEFAULT_CURRENT_RESTATEMENT_RELATIVE;
export const LEGACY_CLOSED_REQUEST_STATE_BINDING_RELATIVE =
  "data/private-output/m2-v2-integrity-remediation/request-state-binding-private-v0.2.json";
export const CURRENT_CLOSED_REQUEST_STATE_BINDING_RELATIVE =
  "data/private-output/m2-v2-pr7-s1-remediation-badbf45/b6-authority-recovery-v0.1/current-binding-private-v0.2.json";

/**
 * Read the two versioned current-authority artifacts without writing anything.
 * Historical entries are reported for audit, but are never considered when
 * selecting the current decision.
 */
export function readCurrentAuthority(root, options = {}) {
  const absoluteRoot = resolve(root);
  let indexRelativePath;
  try {
    indexRelativePath = normalizeGovernedRelativePath(
      options.indexRelativePath ?? DEFAULT_CURRENT_STATE_INDEX_RELATIVE,
    );
  } catch {
    return invalidAuthority(["current_state_index_path_invalid"]);
  }
  const indexRead = readAuthorityFile(absoluteRoot, indexRelativePath, "current_state_index");
  if (!indexRead.valid) return invalidAuthority(indexRead.issues, { indexRelativePath });

  const binding = extractCurrentRestatementBinding(indexRead.value);
  let restatementRelativePath;
  try {
    restatementRelativePath = normalizeGovernedRelativePath(
      options.restatementRelativePath
        ?? binding.artifact
        ?? DEFAULT_CURRENT_RESTATEMENT_RELATIVE,
    );
  } catch {
    return invalidAuthority(["current_restatement_path_invalid"], {
      indexRelativePath,
      indexDigest: indexRead.byteDigest,
    });
  }
  const restatementRead = readAuthorityFile(absoluteRoot, restatementRelativePath, "current_restatement");
  if (!restatementRead.valid) {
    return invalidAuthority(restatementRead.issues, {
      indexRelativePath,
      indexDigest: indexRead.byteDigest,
      restatementRelativePath,
    });
  }

  let trackedCoreCommitmentRead = null;
  if (indexRead.value?.schemaVersion === "m2-v2-current-state-index-v0.3") {
    const commitmentPath = indexRead.value?.currentAuthority?.trackedCoreCommitmentPath;
    let commitmentRelativePath;
    try { commitmentRelativePath = normalizeGovernedRelativePath(commitmentPath); } catch {
      return invalidAuthority(["tracked_core_commitment_path_invalid"], {
        indexRelativePath,
        indexDigest: indexRead.byteDigest,
        restatementRelativePath,
      });
    }
    trackedCoreCommitmentRead = readAuthorityFile(
      absoluteRoot,
      commitmentRelativePath,
      "tracked_core_commitment",
    );
    if (!trackedCoreCommitmentRead.valid) {
      return invalidAuthority(trackedCoreCommitmentRead.issues, {
        indexRelativePath,
        indexDigest: indexRead.byteDigest,
        restatementRelativePath,
      });
    }
    trackedCoreCommitmentRead.relativePath = commitmentRelativePath;
  }

  let graph = options.graph;
  if (indexRead.value?.schemaVersion === "m2-v2-current-state-index-v0.3" && graph === undefined) {
    const graphRead = readCanonicalCurrentAuthorityGraph(
      absoluteRoot,
      options.bindingRelativePath ?? CURRENT_CLOSED_REQUEST_STATE_BINDING_RELATIVE,
    );
    if (!graphRead.valid) {
      return invalidAuthority(graphRead.issues, {
        indexRelativePath,
        indexDigest: indexRead.byteDigest,
        restatementRelativePath,
      });
    }
    graph = graphRead.graph;
  }

  return validateCurrentAuthorityDocuments({
    index: indexRead.value,
    restatement: restatementRead.value,
    root: absoluteRoot,
    indexRelativePath,
    indexByteDigest: indexRead.byteDigest,
    restatementRelativePath,
    restatementByteDigest: restatementRead.byteDigest,
    graph,
    trackedCoreCommitment: trackedCoreCommitmentRead?.value,
    trackedCoreCommitmentRelativePath: trackedCoreCommitmentRead?.relativePath,
    trackedCoreCommitmentByteDigest: trackedCoreCommitmentRead?.byteDigest,
  });
}

export function validateCurrentAuthorityDocuments(input) {
  const issues = [];
  const index = input?.index;
  const restatement = input?.restatement;
  const authorityVersion = index?.schemaVersion === "m2-v2-current-state-index-v0.3" ? "v0.3" : "v0.2";
  const indexRelativePath = safeNormalizedPath(input?.indexRelativePath, issues, "current_state_index_path_invalid");
  const restatementRelativePath = safeNormalizedPath(
    input?.restatementRelativePath,
    issues,
    "current_restatement_path_invalid",
  );
  const indexByteDigest = requiredDigest(input?.indexByteDigest, issues, "current_state_index_digest_invalid");
  const restatementByteDigest = requiredDigest(
    input?.restatementByteDigest,
    issues,
    "current_restatement_digest_invalid",
  );

  if (!isPlainObject(index)) issues.push("current_state_index_invalid");
  if (!isPlainObject(restatement)) issues.push("current_restatement_invalid");
  if (!isPlainObject(index?.currentAuthority)) issues.push("current_authority_binding_missing");

  const binding = extractCurrentRestatementBinding(index);
  if (!binding.artifact) issues.push("current_restatement_binding_artifact_missing");
  else if (restatementRelativePath && normalizeComparablePath(binding.artifact) !== restatementRelativePath) {
    issues.push("current_restatement_binding_artifact_mismatch");
  }
  if (!isDigest(binding.digest)) issues.push("current_restatement_binding_digest_missing");
  else if (restatementByteDigest && binding.digest !== restatementByteDigest) {
    issues.push("current_restatement_binding_digest_mismatch");
  }

  if (!/^m2-v2-current-state-index-v0\.(?:2|3)$/u.test(String(index?.schemaVersion ?? ""))) {
    issues.push("current_state_index_schema_invalid");
  }
  if (authorityVersion === "v0.3" ? index?.status !== "current_digest_bound" : index?.status !== "current") {
    issues.push("current_state_index_status_invalid");
  }
  const expectedRestatementSchema = authorityVersion === "v0.3"
    ? "m2.v2.canary-v3.1-integrity-restatement-public.v0.4"
    : "m2.v2.canary-v3.1-integrity-restatement-public.v0.3";
  if (restatement?.schema !== expectedRestatementSchema) {
    issues.push("current_restatement_schema_invalid");
  }

  const historicalDecision = explicitHistoricalDecision(index, restatement);
  const currentRestatedDecision = explicitCurrentDecision(index, restatement);
  const restatedDecision = restatement?.restatedContract?.decision ?? restatement?.currentRestatedDecision ?? null;
  const restatedHistoricalDecision = restatement?.historicalContract?.decision ?? restatement?.historicalDecision ?? null;
  if (!validDecision(historicalDecision)) issues.push("historical_decision_missing");
  if (!validDecision(currentRestatedDecision)) issues.push("current_restated_decision_missing");
  if (historicalDecision && restatedHistoricalDecision !== historicalDecision) {
    issues.push("historical_decision_mismatch");
  }
  if (currentRestatedDecision && restatedDecision !== currentRestatedDecision) {
    issues.push("current_restated_decision_mismatch");
  }
  if (currentRestatedDecision === historicalDecision) issues.push("historical_decision_used_as_current");

  const restatementFull160Authorized = restatement?.restatedContract?.full160Authorized
    ?? restatement?.full160Authorized
    ?? restatement?.authorization?.full160Authorized;
  if (index?.full160Authorized !== false
    || (authorityVersion === "v0.2" && restatementFull160Authorized !== false)) {
    issues.push("full160_authorization_not_fail_closed");
  }
  if (authorityVersion === "v0.3" && index?.modelTrainingAuthorized !== false) {
    issues.push("model_training_authorization_not_fail_closed");
  }
  const restatementReadiness = restatement?.nextDevelopmentReadiness
    ?? restatement?.authorization?.nextDevelopmentReadiness
    ?? restatement?.boundaries?.nextDevelopmentReadiness;
  if (index?.nextDevelopmentReadiness !== "NOT_AUTHORIZED") {
    issues.push("next_development_readiness_not_fail_closed");
  }
  if (restatementReadiness !== undefined && restatementReadiness !== "NOT_AUTHORIZED") {
    issues.push("restatement_readiness_not_fail_closed");
  }
  const providerRequestDelta = authorityVersion === "v0.3"
    ? restatement?.unchangedBoundaries?.providerRequestDelta
    : restatement?.providerRequestDelta;
  if (providerRequestDelta !== 0) issues.push("provider_request_delta_nonzero");

  let coreBinding = null;
  if (authorityVersion === "v0.3") {
    coreBinding = validateV03CoreBinding(input, index, restatement);
    if (!coreBinding.valid) issues.push(...coreBinding.issues);
    issues.push(...validateV03DocumentDigests(index, restatement));
    issues.push(...validateV03PublicReportBindings(input, index));
  }

  const historicalArtifacts = extractHistoricalArtifacts(index);
  const mapPayload = {
    schema: CURRENT_AUTHORITY_SCHEMA,
    currentAuthorityArtifact: indexRelativePath,
    currentAuthorityDigest: indexByteDigest,
    currentRestatementArtifact: restatementRelativePath,
    currentRestatementDigest: restatementByteDigest,
    graphDigestSha256: coreBinding?.graphDigestSha256 ?? null,
    trackedCoreCommitmentArtifact: coreBinding?.trackedCoreCommitmentRelativePath ?? null,
    trackedCoreCommitmentDigest: coreBinding?.trackedCoreCommitmentByteDigest ?? null,
    historicalArtifacts,
    historicalDecision: historicalDecision ?? null,
    currentRestatedDecision: currentRestatedDecision ?? null,
    full160Authorized: false,
    nextDevelopmentReadiness: "NOT_AUTHORIZED",
  };
  return {
    valid: issues.length === 0,
    issues: [...new Set(issues)],
    authorityMap: mapPayload,
    historicalDecision: historicalDecision ?? null,
    currentRestatedDecision: issues.length === 0 ? currentRestatedDecision : null,
    full160Authorized: false,
    nextDevelopmentReadiness: "NOT_AUTHORIZED",
    currentAuthorityDigestVerified: issues.length === 0,
    currentRestatementVerified: issues.length === 0,
    canonicalAuthorityGraphVerified: authorityVersion === "v0.3" && coreBinding?.valid === true && issues.length === 0,
    trackedCoreCommitmentVerified: authorityVersion === "v0.3" && coreBinding?.commitmentVerified === true && issues.length === 0,
  };
}

function validateV03CoreBinding(input, index, restatement) {
  const issues = [];
  const current = index?.currentAuthority;
  const graph = input?.graph;
  const commitment = input?.trackedCoreCommitment;
  const commitmentPath = safeNormalizedPath(
    input?.trackedCoreCommitmentRelativePath,
    issues,
    "tracked_core_commitment_path_invalid",
  );
  const commitmentDigest = requiredDigest(
    input?.trackedCoreCommitmentByteDigest,
    issues,
    "tracked_core_commitment_digest_invalid",
  );
  if (!isPlainObject(current)) issues.push("current_authority_binding_missing");
  if (commitmentPath && current?.trackedCoreCommitmentPath !== commitmentPath) {
    issues.push("tracked_core_commitment_path_mismatch");
  }
  if (commitmentDigest && current?.trackedCoreCommitmentDigestSha256 !== commitmentDigest) {
    issues.push("tracked_core_commitment_digest_mismatch");
  }
  const commitmentCheck = verifyTrackedCoreCommitmentV0_1(commitment, graph);
  if (!commitmentCheck.valid) issues.push("tracked_core_commitment_mismatch");
  const graphDigest = graph?.graphDigestSha256 ?? null;
  if (!isDigest(graphDigest)
    || current?.graphDigestSha256 !== graphDigest
    || restatement?.authorityBindings?.graphDigestSha256 !== graphDigest) {
    issues.push("canonical_authority_graph_binding_mismatch");
  }
  if (index?.sourceExactHead !== commitment?.sourceExactHead
    || restatement?.sourceExactHead !== commitment?.sourceExactHead) {
    issues.push("tracked_core_commitment_source_head_mismatch");
  }
  return {
    valid: issues.length === 0,
    issues: [...new Set(issues)],
    graphDigestSha256: graphDigest,
    trackedCoreCommitmentRelativePath: commitmentPath,
    trackedCoreCommitmentByteDigest: commitmentDigest,
    commitmentVerified: commitmentCheck.valid,
  };
}

function validateV03DocumentDigests(index, restatement) {
  const issues = [];
  const { indexDigestSha256, ...indexPayload } = isPlainObject(index) ? index : {};
  const { restatementDigestSha256, ...restatementPayload } = isPlainObject(restatement) ? restatement : {};
  if (!isDigest(indexDigestSha256) || indexDigestSha256 !== sha256Json(indexPayload)) {
    issues.push("current_state_index_semantic_digest_mismatch");
  }
  if (!isDigest(restatementDigestSha256)
    || restatementDigestSha256 !== sha256Json(restatementPayload)) {
    issues.push("current_restatement_semantic_digest_mismatch");
  }
  if (index?.currentDecisionComputation?.evaluationDigestSha256
    !== restatement?.currentDecisionComputation?.evaluationDigestSha256
    || index?.currentDecisionComputation?.recomputedDecision !== index?.currentDecision
    || restatement?.currentDecisionComputation?.recomputedDecision !== index?.currentDecision) {
    issues.push("current_decision_computation_binding_mismatch");
  }
  if (index?.supersession?.transactionId !== restatement?.supersession?.transactionId
    || index?.supersession?.transactionDigestSha256
      !== restatement?.supersession?.transactionDigestSha256
    || index?.currentAuthority?.promotionReceiptDigestSha256
      !== index?.supersession?.transactionDigestSha256) {
    issues.push("current_supersession_binding_mismatch");
  }
  return issues;
}

function validateV03PublicReportBindings(input, index) {
  const issues = [];
  const expected = [
    ["remediation_summary", "docs/analysis/m2-v2/M2-v2-PR7-P1-remediation-summary-v0.2.json"],
    ["merge_readiness", "docs/analysis/m2-v2/M2-v2-PR7-merge-readiness-v0.2.json"],
    ["current_integrity_restatement", "docs/analysis/m2-v2/M2-v2-canary-v3-1-integrity-restatement-v0.4.json"],
  ];
  const bindings = index?.currentAuthority?.publicReportBindings;
  if (!Array.isArray(bindings) || bindings.length !== expected.length) {
    return ["current_public_report_binding_set_invalid"];
  }
  const root = input?.root ? resolve(input.root) : null;
  for (const [role, path] of expected) {
    const binding = bindings.find((entry) => entry?.role === role);
    if (!binding
      || binding.repositoryRelativePath !== path
      || binding.pathIdentityDigestSha256 !== sha256Json(path)
      || !isDigest(binding.semanticDigestSha256)
      || !isDigest(binding.byteDigestSha256)) {
      issues.push("current_public_report_binding_invalid");
      continue;
    }
    if (root) {
      const read = readAuthorityFile(root, path, "current_public_report");
      if (!read.valid || read.byteDigest !== binding.byteDigestSha256
        || sha256Json(read.value) !== binding.semanticDigestSha256) {
        issues.push("current_public_report_binding_invalid");
      }
    }
  }
  return issues;
}

function explicitHistoricalDecision(index, restatement) {
  void restatement;
  return index?.historicalV2B8Decision ?? null;
}

function explicitCurrentDecision(index, restatement) {
  void restatement;
  return index?.currentDecision ?? null;
}

function extractCurrentRestatementBinding(index) {
  const source = isPlainObject(index?.currentAuthority) ? index.currentAuthority : {};
  return {
    artifact: source.currentRestatementPath
      ?? source.currentRestatementArtifact
      ?? source.restatementArtifact
      ?? null,
    digest: source.currentRestatementDigestSha256
      ?? source.currentRestatementDigest
      ?? source.restatementDigest
      ?? null,
  };
}

function extractHistoricalArtifacts(index) {
  if (Array.isArray(index?.historicalArtifacts)) {
    return index.historicalArtifacts.filter(validHistoricalArtifact).map((value) => cloneJson(value));
  }
  if (!Array.isArray(index?.entries)) return [];
  return index.entries
    .filter((entry) => ["historical", "superseded"].includes(entry?.lifecycle)
      || String(entry?.status ?? "").includes("historical"))
    .map((entry) => ({
      artifact: String(entry.artifact ?? ""),
      version: String(entry.version ?? ""),
      decision: validDecision(entry.decision) ? entry.decision : null,
      lifecycle: String(entry.lifecycle ?? "historical"),
    }));
}

function validHistoricalArtifact(value) {
  return isPlainObject(value) && typeof value.artifact === "string" && value.artifact.length > 0;
}

function invalidAuthority(issues, context = {}) {
  return {
    valid: false,
    issues: [...new Set(issues)],
    authorityMap: {
      schema: CURRENT_AUTHORITY_SCHEMA,
      currentAuthorityArtifact: context.indexRelativePath ?? null,
      currentAuthorityDigest: context.indexDigest ?? null,
      currentRestatementArtifact: context.restatementRelativePath ?? null,
      currentRestatementDigest: null,
      historicalArtifacts: [],
      historicalDecision: null,
      currentRestatedDecision: null,
      full160Authorized: false,
      nextDevelopmentReadiness: "NOT_AUTHORIZED",
    },
    historicalDecision: null,
    currentRestatedDecision: null,
    full160Authorized: false,
    nextDevelopmentReadiness: "NOT_AUTHORIZED",
    currentAuthorityDigestVerified: false,
    currentRestatementVerified: false,
    canonicalAuthorityGraphVerified: false,
    trackedCoreCommitmentVerified: false,
  };
}

export function readCanonicalCurrentAuthorityGraph(
  root,
  bindingRelativePath = CURRENT_CLOSED_REQUEST_STATE_BINDING_RELATIVE,
) {
  let normalizedBindingPath;
  try {
    normalizedBindingPath = normalizeGovernedRelativePath(bindingRelativePath);
  } catch {
    return { valid: false, issues: ["current_closed_binding_path_invalid"] };
  }
  const bindingRead = readAuthorityFile(root, normalizedBindingPath, "current_closed_binding");
  if (!bindingRead.valid) return bindingRead;
  const binding = bindingRead.value;
  const { bindingDigest, ...bindingPayload } = isPlainObject(binding) ? binding : {};
  if (binding?.schema !== "m2.v2.request-state-atomic-binding.v0.2"
      || binding?.privateOnly !== true
      || binding?.scope !== "v2b8"
      || bindingDigest !== sha256Json(bindingPayload)
      || !Array.isArray(binding?.members)) {
    return { valid: false, issues: ["current_closed_binding_invalid"] };
  }
  const descriptors = binding.members.filter(
    (entry) => entry?.role === "contract_bound_public_report_digests",
  );
  if (descriptors.length !== 1
      || !isDigest(descriptors[0]?.byteDigest)) {
    return { valid: false, issues: ["current_authority_graph_member_invalid"] };
  }
  let memberPath;
  try {
    memberPath = normalizeGovernedRelativePath(descriptors[0].path);
  } catch {
    return { valid: false, issues: ["current_authority_graph_member_path_invalid"] };
  }
  const memberRead = readAuthorityFile(root, memberPath, "current_authority_graph_member");
  if (!memberRead.valid) return memberRead;
  if (memberRead.byteDigest !== descriptors[0].byteDigest
      || memberRead.value?.schema !== "m2.v2.v2b8-contract-bound-public-report-digests-private.v0.3"
      || !isPlainObject(memberRead.value?.canonicalAuthorityGraph)) {
    return { valid: false, issues: ["current_authority_graph_member_invalid"] };
  }
  return { valid: true, issues: [], graph: memberRead.value.canonicalAuthorityGraph };
}

function readAuthorityFile(root, relativePath, role) {
  let path;
  try { path = resolveGovernedPath(root, relativePath); } catch {
    return { valid: false, issues: [`${role}_path_invalid`] };
  }
  if (!existsSync(path)) return { valid: false, issues: [`${role}_missing`] };
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile()) return { valid: false, issues: [`${role}_file_invalid`] };
  const bytes = readFileSync(path);
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); } catch {
    return { valid: false, issues: [`${role}_json_invalid`] };
  }
  return { valid: true, issues: [], value, byteDigest: createHash("sha256").update(bytes).digest("hex") };
}

function normalizeGovernedRelativePath(value) {
  const path = String(value ?? "").trim().replace(/\\/gu, "/");
  if (!path || isAbsolute(path) || /^[A-Za-z]:/u.test(path) || path.startsWith("//")) {
    throw new Error("authority_path_invalid");
  }
  if (path.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("authority_path_invalid");
  }
  return path;
}

function safeNormalizedPath(value, issues, issue) {
  try { return normalizeGovernedRelativePath(value); } catch {
    issues.push(issue);
    return null;
  }
}

function normalizeComparablePath(value) {
  try { return normalizeGovernedRelativePath(value); } catch { return null; }
}

function resolveGovernedPath(root, relativePath) {
  const normalized = normalizeGovernedRelativePath(relativePath);
  const absolute = resolve(root, normalized);
  if (absolute !== root && !absolute.startsWith(`${root}${sep}`)) throw new Error("authority_path_escape");
  if (relative(root, absolute).split(sep).includes("..")) throw new Error("authority_path_escape");
  return absolute;
}

function requiredDigest(value, issues, issue) {
  if (!isDigest(value)) {
    issues.push(issue);
    return null;
  }
  return value;
}

function isDigest(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function sha256Json(value) {
  return sha256Value(value);
}

function validDecision(value) {
  return typeof value === "string" && /^[A-Z][A-Z0-9_:-]{2,100}$/u.test(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function currentAuthorityArtifactName(path) {
  return basename(normalizeGovernedRelativePath(path));
}
