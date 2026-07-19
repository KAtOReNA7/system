import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { win32 } from "node:path";

export const FALLBACK_DISPOSITIONS = Object.freeze([
  "USED_SEMANTICALLY_EQUIVALENT",
  "USED_SCOPE_EQUIVALENT",
  "REJECTED_NO_EQUIVALENT",
  "EXPECTED_NO_MATCH",
]);

export const FALLBACK_EVENT_FIELDS = Object.freeze([
  "eventId",
  "timestamp",
  "task",
  "preferredExecutable",
  "preferredArgv",
  "failureClass",
  "failureMessageSanitized",
  "replacementExecutable",
  "replacementArgv",
  "semanticEquivalence",
  "coverageDifference",
  "sideEffectDifference",
  "securityDifference",
  "confidenceImpact",
  "disposition",
]);

export const COMMAND_FIELDS = Object.freeze([
  "commandId",
  "purpose",
  "platform",
  "executable",
  "argv",
  "cwd",
  "networkPolicy",
  "providerPolicy",
  "databasePolicy",
  "mutability",
  "requiredInputs",
  "optionalInputs",
  "timeoutSeconds",
  "skipPolicy",
  "isolationGroup",
  "receiptRole",
]);

export const S0_EXTERNAL_ENV_NAMES = Object.freeze([
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "TAVILY_API_KEY",
  "M2_V2_EVIDENCE_API_BASE_URL",
  "M2_V2_EVIDENCE_APPROVED_HOST",
  "M2_V2_APPROVED_RELAY_HOST",
  "M2_V2_EVIDENCE_PROVIDER",
  "M2_V2_SEARCH_PROVIDER",
  "M2_V2_TAVILY_BASE_URL",
  "M1_DATABASE_URL",
  "M1_DATABASE_READONLY_URL",
  "M1_DATABASE_BACKGROUND_URL",
  "DATABASE_URL",
  "PGHOST",
  "PGPORT",
  "PGDATABASE",
  "PGUSER",
  "PGPASSWORD",
]);

export function sha256(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8");
  return createHash("sha256").update(bytes).digest("hex");
}

export function stableStringify(value) {
  return JSON.stringify(sortObjectKeys(value));
}

export function canonicalReceiptDigest(receipt) {
  const copy = structuredClone(receipt);
  delete copy.receiptDigest;
  return sha256(stableStringify(copy));
}

export function assertS0ExternalEnvironmentEmpty(env = process.env) {
  const nonemptyNames = S0_EXTERNAL_ENV_NAMES
    .filter((name) => String(env[name] ?? "") !== "")
    .sort();
  if (nonemptyNames.length > 0) {
    throw new Error(`s0_external_environment_nonempty:${nonemptyNames.join(",")}`);
  }
  return S0_EXTERNAL_ENV_NAMES.map((name) => ({
    name,
    present: Object.hasOwn(env, name),
    empty: true,
  }));
}

export function resolveDefaultNpmTestCommand({
  platform = process.platform,
  nodeExecutable = process.execPath,
  npmExecPath = process.env.npm_execpath,
  pathExists = existsSync,
} = {}) {
  if (platform !== "win32") return ["npm", "test"];
  const explicitNpmCli = String(npmExecPath ?? "").trim();
  if (explicitNpmCli && pathExists(explicitNpmCli)) {
    return [nodeExecutable, explicitNpmCli, "test"];
  }
  const bundledNpmCli = win32.join(win32.dirname(nodeExecutable), "node_modules", "npm", "bin", "npm-cli.js");
  if (pathExists(bundledNpmCli)) return [nodeExecutable, bundledNpmCli, "test"];
  throw new Error("windows_npm_cli_unavailable_without_shell");
}

export function validateFallbackEvent(event) {
  assertPlainObject(event, "fallback_event_must_be_object");
  assertExactFields(event, FALLBACK_EVENT_FIELDS, "fallback_event");
  for (const field of FALLBACK_EVENT_FIELDS) {
    if (field.endsWith("Argv")) {
      assertStringArray(event[field], `${field}_must_be_string_array`);
    } else {
      assertNonemptyString(event[field], `${field}_must_be_nonempty_string`);
    }
  }
  if (Number.isNaN(Date.parse(event.timestamp))) throw new Error("fallback_timestamp_must_be_iso_datetime");
  if (!FALLBACK_DISPOSITIONS.includes(event.disposition)) throw new Error("fallback_disposition_unknown");
  return true;
}

export function validateFallbackLedger(ledger, { executedFallbackIds = [] } = {}) {
  assertPlainObject(ledger, "fallback_ledger_must_be_object");
  if (!Array.isArray(ledger.events)) throw new Error("fallback_events_must_be_array");
  const seen = new Set();
  for (const event of ledger.events) {
    validateFallbackEvent(event);
    if (seen.has(event.eventId)) throw new Error("duplicate_fallback_event_id");
    seen.add(event.eventId);
  }
  for (const eventId of executedFallbackIds) {
    assertNonemptyString(eventId, "executed_fallback_id_must_be_nonempty_string");
    if (!seen.has(eventId)) throw new Error("fallback_used_but_not_recorded");
  }
  const expectedNoMatch = ledger.events.filter((event) => event.disposition === "EXPECTED_NO_MATCH");
  const fallbacks = ledger.events.filter((event) => event.disposition !== "EXPECTED_NO_MATCH");
  return {
    events: ledger.events.length,
    fallbackEvents: fallbacks.length,
    expectedNoMatchEvents: expectedNoMatch.length,
    silentFallbackEvents: 0,
  };
}

export function validateCommandRegistry(registry) {
  assertPlainObject(registry, "command_registry_must_be_object");
  assertExactFields(registry, ["schema", "commands"], "command_registry");
  if (registry.schema !== "m2.v2.pr7.s0-command-registry.v0.1") {
    throw new Error("command_registry_schema_unknown");
  }
  if (!Array.isArray(registry.commands) || registry.commands.length === 0) {
    throw new Error("command_registry_commands_required");
  }
  const ids = new Set();
  for (const command of registry.commands) {
    assertPlainObject(command, "command_must_be_object");
    assertExactFields(command, COMMAND_FIELDS, "command");
    for (const field of [
      "commandId", "purpose", "platform", "executable", "cwd", "networkPolicy",
      "providerPolicy", "databasePolicy", "mutability", "skipPolicy", "isolationGroup", "receiptRole",
    ]) {
      assertNonemptyString(command[field], `${field}_must_be_nonempty_string`);
    }
    for (const field of ["argv", "requiredInputs", "optionalInputs"]) {
      assertStringArray(command[field], `${field}_must_be_string_array`);
    }
    if (command.argv.some((value) => /(?:&&|\|\||[|;<>])/u.test(value))) {
      throw new Error("command_argv_contains_shell_control_operator");
    }
    if (!Number.isSafeInteger(command.timeoutSeconds) || command.timeoutSeconds <= 0) {
      throw new Error("command_timeout_must_be_positive_integer");
    }
    if (ids.has(command.commandId)) throw new Error("duplicate_command_id");
    ids.add(command.commandId);
  }
  return { commandCount: registry.commands.length, commandIds: [...ids] };
}

export function resolveRegisteredCommand(registry, commandId, platform = process.platform) {
  validateCommandRegistry(registry);
  const command = registry.commands.find((candidate) => candidate.commandId === commandId);
  if (!command) throw new Error("unknown_command_id");
  const compatible = command.platform === "all"
    || (command.platform === "windows" && platform === "win32")
    || (command.platform === "linux" && platform === "linux");
  if (!compatible) throw new Error("command_not_supported_on_platform");
  return structuredClone(command);
}

export function validateTaskManifest(manifest, { registryBytes, receiptSchemaBytes } = {}) {
  assertPlainObject(manifest, "task_manifest_must_be_object");
  const required = [
    "repository", "pullRequest", "startingHead", "baseSha", "allowedBranches", "allowedPathClasses",
    "prohibitedActions", "providerPolicy", "databasePolicy", "networkPolicy", "privateStatePolicy",
    "gitPolicy", "commandRegistry", "commandRegistryDigest", "requiredSourceEvidence", "receiptSchema",
    "governance",
  ];
  for (const field of required) {
    if (!(field in manifest)) throw new Error(`task_manifest_missing_${field}`);
  }
  if (manifest.repository !== "KAtOReNA7/system" || manifest.pullRequest !== 7) {
    throw new Error("task_manifest_repository_or_pr_mismatch");
  }
  assertGitSha(manifest.startingHead, "starting_head_invalid");
  assertGitSha(manifest.baseSha, "base_sha_invalid");
  assertSha(manifest.commandRegistryDigest, "command_registry_digest_invalid");
  if (!Array.isArray(manifest.requiredSourceEvidence) || manifest.requiredSourceEvidence.length !== 3) {
    throw new Error("required_source_evidence_must_have_three_entries");
  }
  for (const source of manifest.requiredSourceEvidence) {
    assertPlainObject(source, "source_evidence_entry_must_be_object");
    assertExactFields(source, ["sourceId", "reportSha256", "receiptDigest"], "source_evidence_entry");
    assertNonemptyString(source.sourceId, "source_evidence_id_required");
    assertSha(source.reportSha256, "source_report_sha_invalid");
    assertSha(source.receiptDigest, "source_receipt_digest_invalid");
  }
  if (registryBytes && sha256(registryBytes) !== manifest.commandRegistryDigest) {
    throw new Error("command_registry_digest_mismatch");
  }
  assertPlainObject(manifest.receiptSchema, "receipt_schema_binding_must_be_object");
  assertExactFields(manifest.receiptSchema, ["path", "sha256"], "receipt_schema_binding");
  assertSha(manifest.receiptSchema.sha256, "receipt_schema_sha_invalid");
  if (receiptSchemaBytes && sha256(receiptSchemaBytes) !== manifest.receiptSchema.sha256) {
    throw new Error("receipt_schema_digest_mismatch");
  }
  const governance = manifest.governance;
  if (governance.currentDecision !== "CANARY_FAIL"
      || governance.openFindings !== 10
      || governance.findingRemediationAuthorized !== false
      || governance.mergeAuthorized !== false
      || governance.full160Authorized !== false
      || governance.nextDevelopmentReadiness !== "NOT_AUTHORIZED"
      || governance.releaseAuthorized !== false) {
    throw new Error("current_governance_mismatch");
  }
  return true;
}

export function validateSourceAuthenticityBinding(manifestSources, privateEvidence = null) {
  if (privateEvidence === null) return { status: "BOUND_TO_TRACKED_MANIFEST", sourceCount: 3 };
  if (privateEvidence.status !== "PASS" || !Array.isArray(privateEvidence.sources)) {
    throw new Error("private_source_evidence_not_pass");
  }
  for (const expected of manifestSources) {
    const actual = privateEvidence.sources.find((source) => source.sourceId === expected.sourceId);
    if (!actual
        || actual.reportExpectedSha256 !== expected.reportSha256
        || actual.reportActualSha256 !== expected.reportSha256
        || actual.receiptExpectedDigest !== expected.receiptDigest
        || actual.receiptClaimedDigest !== expected.receiptDigest
        || actual.receiptRecomputedDigest !== expected.receiptDigest
        || actual.matches !== true) {
      throw new Error(`source_evidence_digest_mismatch_${expected.sourceId}`);
    }
  }
  return { status: "RECOMPUTED_PRIVATE_EVIDENCE_VERIFIED", sourceCount: 3 };
}

export function evaluateIsolationOrdering({ events, defaultTestChainInvocationCount }) {
  if (!Array.isArray(events)) throw new Error("isolation_events_must_be_array");
  if (defaultTestChainInvocationCount !== 1) throw new Error("default_test_chain_invocation_count_must_equal_one");
  const required = [
    "before_snapshot_complete",
    "default_test_start",
    "default_test_finish",
    "after_snapshot_complete",
  ];
  const positions = required.map((eventId) => {
    const matches = events.filter((event) => event?.eventId === eventId);
    if (matches.length !== 1) throw new Error(`isolation_event_count_invalid_${eventId}`);
    if (!Number.isSafeInteger(matches[0].sequence)) throw new Error("isolation_event_sequence_invalid");
    return matches[0].sequence;
  });
  for (let index = 1; index < positions.length; index += 1) {
    if (positions[index] <= positions[index - 1]) throw new Error("before_snapshot_does_not_precede_default_test");
  }
  return {
    beforePrecedesFirstDefaultTest: true,
    defaultTestChainInvocationCount: 1,
  };
}

export function evaluatePreflightFacts(facts) {
  const requiredTrue = [
    "expectedHeadMatches",
    "baseAncestorOfStartingHead",
    "startingHeadAncestorOfActualHead",
    "branchAllowed",
    "trackedSourceClean",
    "externalEnvironmentEmpty",
    "outputPathIgnored",
    "noPrivatePathStaged",
    "sourceEvidenceAuthentic",
    "commandRegistryValid",
    "receiptSchemaValid",
    "capabilitiesPresent",
    "currentGovernanceValid",
  ];
  for (const field of requiredTrue) {
    if (facts?.[field] !== true) throw new Error(`preflight_gate_failed_${field}`);
  }
  return Object.fromEntries(requiredTrue.map((field) => [field, true]));
}

export function parseTapSkipEvidence(output) {
  const text = String(output ?? "");
  const identities = [];
  for (const line of text.split(/\r?\n/u)) {
    const match = line.match(/^\s*(?:ok|not ok)\s+\d+\s+-\s+(.+?)\s+#\s*SKIP(?:\s+(.*))?\s*$/iu);
    if (match) identities.push({ name: match[1].trim(), reason: (match[2] ?? "").trim() });
  }
  const summaries = [...text.matchAll(/^#\s*skipped\s+(\d+)\s*$/gimu)];
  const reported = summaries.length > 0
    ? summaries.reduce((total, match) => total + Number(match[1]), 0)
    : identities.length;
  return {
    totalSkips: reported,
    identities,
    summaryPresent: summaries.length > 0,
    identityCountMatchesSummary: identities.length === reported,
  };
}

export function parseTapFailureEvidence(stdout, stderr = "") {
  const combined = `${String(stdout ?? "")}\n${String(stderr ?? "")}`;
  const failedTestIdentities = [];
  for (const line of combined.split(/\r?\n/u)) {
    const match = line.match(/^\s*not ok\s+\d+\s+-\s+(.+?)(?:\s+#\s*(?:SKIP|TODO).*)?\s*$/iu);
    if (!match) continue;
    const name = match[1].replace(/[\r\n\t]+/gu, " ").trim().slice(0, 240);
    if (name && !failedTestIdentities.includes(name)) failedTestIdentities.push(name);
  }
  const summary = {};
  for (const field of ["tests", "pass", "fail", "cancelled", "skipped", "todo"]) {
    const matches = [...combined.matchAll(new RegExp(`^#\\s*${field}\\s+(\\d+)\\s*$`, "gimu"))];
    summary[field] = matches.reduce((total, match) => total + Number(match[1]), 0);
  }
  return {
    failedTestIdentities: failedTestIdentities.slice(0, 50),
    failedTestIdentityCount: failedTestIdentities.length,
    failedTestIdentitiesTruncated: failedTestIdentities.length > 50,
    tapSummary: summary,
    stdoutBytes: Buffer.byteLength(String(stdout ?? "")),
    stdoutSha256: sha256(Buffer.from(String(stdout ?? ""))),
    stderrBytes: Buffer.byteLength(String(stderr ?? "")),
    stderrSha256: sha256(Buffer.from(String(stderr ?? ""))),
  };
}

export function validateJsonSchema(value, schema, rootSchema = schema, path = "$") {
  if (schema.$ref) {
    if (!schema.$ref.startsWith("#/") || rootSchema === undefined) throw new Error(`json_schema_ref_unsupported_${path}`);
    const target = schema.$ref.slice(2).split("/").reduce((current, segment) => current?.[segment], rootSchema);
    if (!target) throw new Error(`json_schema_ref_missing_${path}`);
    return validateJsonSchema(value, target, rootSchema, path);
  }
  if (Object.hasOwn(schema, "const") && !Object.is(schema.const, value)) {
    throw new Error(`json_schema_const_${path}`);
  }
  if (schema.enum && !schema.enum.some((candidate) => Object.is(candidate, value))) {
    throw new Error(`json_schema_enum_${path}`);
  }
  for (const childSchema of schema.allOf ?? []) {
    validateJsonSchema(value, childSchema, rootSchema, path);
  }
  if (schema.if) {
    let conditionMatches = true;
    try {
      validateJsonSchema(value, schema.if, rootSchema, path);
    } catch {
      conditionMatches = false;
    }
    if (conditionMatches && schema.then) validateJsonSchema(value, schema.then, rootSchema, path);
    if (!conditionMatches && schema.else) validateJsonSchema(value, schema.else, rootSchema, path);
  }
  if (schema.type) assertJsonType(value, schema.type, path);
  if (schema.type === "object") {
    for (const field of schema.required ?? []) {
      if (!Object.hasOwn(value, field)) throw new Error(`json_schema_required_${path}_${field}`);
    }
    const properties = schema.properties ?? {};
    if (schema.additionalProperties === false) {
      for (const field of Object.keys(value)) {
        if (!Object.hasOwn(properties, field)) throw new Error(`json_schema_unknown_${path}_${field}`);
      }
    }
    for (const [field, childSchema] of Object.entries(properties)) {
      if (Object.hasOwn(value, field)) validateJsonSchema(value[field], childSchema, rootSchema, `${path}.${field}`);
    }
  }
  if (schema.type === "array") {
    if (Number.isSafeInteger(schema.minItems) && value.length < schema.minItems) {
      throw new Error(`json_schema_min_items_${path}`);
    }
    if (schema.items) value.forEach((item, index) => validateJsonSchema(item, schema.items, rootSchema, `${path}[${index}]`));
  }
  if (schema.type === "string") {
    if (Number.isSafeInteger(schema.minLength) && value.length < schema.minLength) {
      throw new Error(`json_schema_min_length_${path}`);
    }
    if (schema.pattern && !(new RegExp(schema.pattern, "u")).test(value)) {
      throw new Error(`json_schema_pattern_${path}`);
    }
    if (schema.format === "date-time" && Number.isNaN(Date.parse(value))) {
      throw new Error(`json_schema_date_time_${path}`);
    }
  }
  return true;
}

function sortObjectKeys(value) {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObjectKeys(value[key])]));
}

function assertExactFields(value, fields, prefix) {
  const expected = [...fields].sort();
  const actual = Object.keys(value).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${prefix}_fields_invalid`);
}

function assertPlainObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(message);
  }
}

function assertNonemptyString(value, message) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(message);
}

function assertStringArray(value, message) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new Error(message);
}

function assertSha(value, message) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) throw new Error(message);
}

function assertGitSha(value, message) {
  if (typeof value !== "string" || !/^[0-9a-f]{40}$/u.test(value)) throw new Error(message);
}

function assertJsonType(value, type, path) {
  const matches = type === "object"
    ? value !== null && typeof value === "object" && !Array.isArray(value)
    : type === "array"
      ? Array.isArray(value)
      : type === "integer"
        ? Number.isSafeInteger(value)
        : type === "number"
          ? typeof value === "number" && Number.isFinite(value)
          : type === "null"
            ? value === null
            : typeof value === type;
  if (!matches) throw new Error(`json_schema_type_${path}_${type}`);
}
