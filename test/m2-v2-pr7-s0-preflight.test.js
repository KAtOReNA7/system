import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  evaluatePreflightFacts,
  FALLBACK_EVENT_FIELDS,
  parseMachineFailureEvidence,
  parseJsonUtf8Strict,
  resolveRegisteredCommand,
  sha256,
  sha256PortableText,
  validateCommandRegistry,
  validateFallbackEvent,
  validateFallbackLedger,
  validateJsonSchema,
  validateSourceAuthenticityBinding,
  validateTaskManifest,
} from "../scripts/m2-v2-evidence-pilot/m2_v2_pr7_s0_contract.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const taskBytes = readFileSync(resolve(root, "config/m2-v2-pr7-s0-task.v0.1.json"));
const registryBytes = readFileSync(resolve(root, "config/m2-v2-pr7-s0-command-registry.v0.1.json"));
const schemaBytes = readFileSync(resolve(root, "config/m2-v2-pr7-s0-receipt-schema.v0.1.json"));
const taskManifest = JSON.parse(taskBytes);
const registry = JSON.parse(registryBytes);
const receiptSchema = JSON.parse(schemaBytes);

const passingFacts = Object.freeze({
  expectedHeadMatches: true,
  baseAncestorOfStartingHead: true,
  startingHeadAncestorOfActualHead: true,
  branchAllowed: true,
  trackedSourceClean: true,
  externalEnvironmentEmpty: true,
  outputPathIgnored: true,
  noPrivatePathStaged: true,
  sourceEvidenceAuthentic: true,
  commandRegistryValid: true,
  receiptSchemaValid: true,
  capabilitiesPresent: true,
  currentGovernanceValid: true,
});

test("S0 task manifest binds the exact registry, receipt schema, sources, and governance", () => {
  assert.equal(validateTaskManifest(taskManifest, { registryBytes, receiptSchemaBytes: schemaBytes }), true);
  assert.equal(taskManifest.startingHead, "627f74c6b9b2365ee4403c613ea9689748b76541");
  assert.equal(taskManifest.baseSha, "d81b952e37dd43365c0091cdd6665e69d8d39a7e");
  assert.equal(taskManifest.commandRegistryDigest, sha256PortableText(registryBytes));
  assert.equal(taskManifest.receiptSchema.sha256, sha256PortableText(schemaBytes));
  assert.equal(taskManifest.governance.openFindings, 10);
  assert.equal(taskManifest.governance.findingRemediationAuthorized, false);
});

test("S0 text bindings normalize checkout CRLF only and remain content-sensitive", () => {
  const taskCrlf = withCrlf(taskBytes);
  const registryCrlf = withCrlf(registryBytes);
  const schemaCrlf = withCrlf(schemaBytes);
  assert.equal(sha256PortableText(taskCrlf), sha256PortableText(taskBytes));
  assert.equal(sha256PortableText(registryCrlf), taskManifest.commandRegistryDigest);
  assert.equal(sha256PortableText(schemaCrlf), taskManifest.receiptSchema.sha256);
  assert.deepEqual(parseJsonUtf8Strict(taskCrlf), taskManifest);
  assert.equal(validateTaskManifest(taskManifest, {
    registryBytes: registryCrlf,
    receiptSchemaBytes: schemaCrlf,
  }), true);

  const changedRegistry = Buffer.from(
    registryCrlf.toString("utf8").replace('"purpose":', '"purpose" :'),
    "utf8",
  );
  assert.throws(
    () => validateTaskManifest(taskManifest, {
      registryBytes: changedRegistry,
      receiptSchemaBytes: schemaCrlf,
    }),
    /command_registry_digest_mismatch/u,
  );

  const registryWithLoneCr = Buffer.concat([registryBytes, Buffer.from("\r")]);
  assert.notEqual(sha256PortableText(registryWithLoneCr), taskManifest.commandRegistryDigest);

  const registryWithBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), registryBytes]);
  assert.notEqual(sha256PortableText(registryWithBom), taskManifest.commandRegistryDigest);
  assert.throws(() => parseJsonUtf8Strict(registryWithBom));

  const invalidTaskBytes = Buffer.from(taskBytes);
  invalidTaskBytes[invalidTaskBytes.indexOf(Buffer.from("prohibitedActions"))] = 0xff;
  assert.throws(() => parseJsonUtf8Strict(invalidTaskBytes));
  assert.throws(() => sha256PortableText(Buffer.from([0xff])));
});

test("S0 command registry is strict, argv-based, unique, and rejects unknown commands", () => {
  const summary = validateCommandRegistry(registry);
  assert.equal(summary.commandCount, registry.commands.length);
  assert.equal(summary.commandIds.length, registry.commands.length);
  for (const command of registry.commands) {
    assert.equal(typeof command.executable, "string");
    assert.equal(Array.isArray(command.argv), true);
    assert.equal(command.argv.some((argument) => /(?:&&|\|\||[|;<>])/u.test(argument)), false);
  }
  assert.equal(resolveRegisteredCommand(registry, "s0.doctor").executable, "node");
  assert.throws(() => resolveRegisteredCommand(registry, "s0.unknown"), /unknown_command_id/u);
});

test("fallback schema accepts the full exact field set", () => {
  assert.equal(validateFallbackEvent(validFallback()), true);
  assert.equal(validateJsonSchema(validFallback(), receiptSchema.$defs.fallbackEvent, receiptSchema), true);
  assert.deepEqual(Object.keys(validFallback()).sort(), [...FALLBACK_EVENT_FIELDS].sort());
});

test("tracked JSON Schema validates a success receipt strictly", () => {
  const receipt = {
    schema: "m2.v2.pr7.s0-preflight-receipt.v0.1",
    passed: true,
    generatedAt: "2026-07-19T00:00:00.000Z",
    actualHead: taskManifest.startingHead,
    actualBranch: "codex/pr7-s0-support-foundation-627f74",
    startingHead: taskManifest.startingHead,
    baseSha: taskManifest.baseSha,
    selectedCommandId: "s0.doctor",
    taskManifestSha256: sha256PortableText(taskBytes),
    commandRegistrySha256: sha256PortableText(registryBytes),
    sourceEvidence: {},
    externalEnvironment: [],
    capabilities: {},
    checks: {},
    fallbackEvents: [],
  };
  assert.equal(validateJsonSchema(receipt, receiptSchema), true);
  const missingSuccessBinding = { ...receipt };
  delete missingSuccessBinding.commandRegistrySha256;
  assert.throws(
    () => validateJsonSchema(missingSuccessBinding, receiptSchema),
    /json_schema_required/u,
  );
  assert.throws(
    () => validateJsonSchema({ ...receipt, hardcodedRemoteSuccess: true }, receiptSchema),
    /json_schema_unknown/u,
  );

  const failureReceipt = {
    schema: "m2.v2.pr7.s0-preflight-receipt.v0.1",
    passed: false,
    generatedAt: "2026-07-19T00:00:00.000Z",
    actualHead: "0".repeat(40),
    failureStage: "repository_and_governance_gates",
    checks: {},
    fallbackEvents: [],
    error: {
      name: "Error",
      code: "UNSPECIFIED",
      reasonCode: "preflight_gate_failed_expectedHeadMatches",
      messageDigest: "0".repeat(64),
    },
  };
  assert.equal(validateJsonSchema(failureReceipt, receiptSchema), true);
  const missingFailureReason = structuredClone(failureReceipt);
  delete missingFailureReason.error.reasonCode;
  assert.throws(
    () => validateJsonSchema(missingFailureReason, receiptSchema),
    /json_schema_required/u,
  );
});

test("fallback schema rejects invalid disposition, empty failure, swapped types, unknown fields, and missing equivalence", () => {
  const invalidDisposition = validFallback({ disposition: "SILENTLY_USED" });
  assert.throws(() => validateFallbackEvent(invalidDisposition), /fallback_disposition_unknown/u);

  const emptyFailure = validFallback({ failureClass: "" });
  assert.throws(() => validateFallbackEvent(emptyFailure), /failureClass_must_be_nonempty_string/u);

  const swapped = validFallback({ preferredExecutable: ["rg"], preferredArgv: "rg" });
  assert.throws(() => validateFallbackEvent(swapped), /preferredExecutable_must_be_nonempty_string/u);

  const unknownField = { ...validFallback(), remoteSuccess: true };
  assert.throws(() => validateFallbackEvent(unknownField), /fallback_event_fields_invalid/u);

  const missingEquivalence = validFallback();
  delete missingEquivalence.semanticEquivalence;
  assert.throws(() => validateFallbackEvent(missingEquivalence), /fallback_event_fields_invalid/u);
});

test("fallback use must be recorded and expected no-match remains a distinct disposition", () => {
  const used = validFallback({ eventId: "FB-USED" });
  const noMatch = validFallback({
    eventId: "NM-EXPECTED",
    disposition: "EXPECTED_NO_MATCH",
    failureClass: "EXPECTED_NO_MATCH",
  });
  const summary = validateFallbackLedger({ events: [used, noMatch] }, { executedFallbackIds: ["FB-USED"] });
  assert.equal(summary.fallbackEvents, 1);
  assert.equal(summary.expectedNoMatchEvents, 1);
  assert.equal(summary.silentFallbackEvents, 0);
  assert.throws(
    () => validateFallbackLedger({ events: [used] }, { executedFallbackIds: ["FB-MISSING"] }),
    /fallback_used_but_not_recorded/u,
  );
});

test("preflight facts fail closed for every mandated negative gate", () => {
  assert.deepEqual(evaluatePreflightFacts(passingFacts), passingFacts);
  for (const field of [
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
  ]) {
    assert.throws(
      () => evaluatePreflightFacts({ ...passingFacts, [field]: false }),
      new RegExp(`preflight_gate_failed_${field}`, "u"),
      field,
    );
  }
});

test("source digest mismatch and private evidence mismatch fail closed", () => {
  const changedRegistry = Buffer.concat([registryBytes, Buffer.from(" ")]);
  assert.throws(
    () => validateTaskManifest(taskManifest, { registryBytes: changedRegistry, receiptSchemaBytes: schemaBytes }),
    /command_registry_digest_mismatch/u,
  );
  assert.throws(
    () => validateSourceAuthenticityBinding(taskManifest.requiredSourceEvidence, {
      status: "PASS",
      sources: taskManifest.requiredSourceEvidence.map((source) => ({
        sourceId: source.sourceId,
        reportExpectedSha256: source.reportSha256,
        reportActualSha256: source.reportSha256,
        receiptExpectedDigest: source.receiptDigest,
        receiptClaimedDigest: source.receiptDigest,
        receiptRecomputedDigest: source.sourceId === "planning" ? "0".repeat(64) : source.receiptDigest,
        matches: true,
      })),
    }),
    /source_evidence_digest_mismatch_planning/u,
  );
});

test("preflight source cannot hardcode live PR or CI success", () => {
  const source = readFileSync(
    resolve(root, "scripts/m2-v2-evidence-pilot/check_m2_v2_pr7_s0_preflight.mjs"),
    "utf8",
  );
  assert.doesNotMatch(source, /ciRunId|verifyWindows|verify-windows=success|remote[^\n]*success/iu);
});

test("outer validation projects bounded isolation failure evidence without raw child output", () => {
  const canary = "RAW_CHILD_CANARY_MUST_NOT_LEAK_7f9c";
  const stdout = JSON.stringify({
    schema: canary,
    passed: false,
    failureStage: canary,
    error: { code: canary, reasonCode: canary },
    childCompleted: true,
    childPassed: false,
    childExitCode: 1,
    childSignal: canary,
    childErrorCode: canary,
    timedOut: false,
    defaultTestChainInvocationCount: 1,
    defaultTestTotalSkips: 0,
    defaultTestSkipSummaryPresent: true,
    defaultTestSkipIdentityCountMatchesSummary: true,
    providerRequestDelta: 0,
    trackedContentUnchanged: true,
    trackedMetadataUnchanged: false,
    childFailureEvidence: {
      failedTestIdentities: ["S0-05 synthetic named child failure", canary],
      failedTestIdentityCount: 2,
      failedTestIdentitiesTruncated: false,
      tapSummary: { tests: 43, pass: 42, fail: 1, cancelled: 0, skipped: 0, todo: 0 },
      stdoutBytes: 1234,
      stdoutSha256: "1".repeat(64),
      stderrBytes: 0,
      stderrSha256: "2".repeat(64),
      rawStdout: canary,
    },
    receiptError: {
      code: canary,
      reasonCode: canary,
      messageDigest: "3".repeat(64),
    },
    rawStdout: canary,
    rawStderr: canary,
  });
  const summary = parseMachineFailureEvidence(stdout);
  assert.deepEqual(summary.childFailureEvidence.failedTestIdentityDigests, [
    sha256("S0-05 synthetic named child failure"),
    sha256(canary),
  ]);
  assert.deepEqual(summary.childFailureEvidence.failedTestCategories, ["S0-05", "UNCLASSIFIED"]);
  assert.deepEqual(summary.childFailureEvidence.tapSummary, {
    tests: 43,
    pass: 42,
    fail: 1,
    cancelled: 0,
    skipped: 0,
    todo: 0,
  });
  assert.deepEqual(summary.failedChecks, ["childPassed", "trackedMetadataUnchanged"]);
  assert.equal(summary.childExitCode, 1);
  assert.equal(summary.providerRequestDelta, 0);
  assert.equal(summary.schemaCategory, "UNKNOWN");
  assert.equal(summary.failureStageCategory, "UNKNOWN");
  assert.equal(summary.errorCodeCategory, "UNKNOWN");
  assert.equal(summary.reasonCodeSha256, sha256(canary));
  assert.equal(summary.childSignalCategory, "UNKNOWN");
  assert.equal(summary.childErrorCodeCategory, "UNKNOWN");
  assert.equal(summary.receiptError.codeCategory, "UNKNOWN");
  assert.equal(summary.receiptError.reasonCodeSha256, sha256(canary));
  assert.doesNotMatch(JSON.stringify(summary), new RegExp(canary, "u"));
  assert.equal(parseMachineFailureEvidence("not-json"), null);
  assert.equal(parseMachineFailureEvidence(JSON.stringify({ passed: true })), null);
});

function validFallback(overrides = {}) {
  return {
    eventId: "FB-001",
    timestamp: "2026-07-19T00:00:00.000Z",
    task: "synthetic fallback validation",
    preferredExecutable: "rg",
    preferredArgv: ["--files"],
    failureClass: "OUTPUT_TRUNCATED",
    failureMessageSanitized: "Output exceeded the bounded display budget.",
    replacementExecutable: "rg",
    replacementArgv: ["--files", "bounded-root"],
    semanticEquivalence: "Same candidate set in bounded chunks.",
    coverageDifference: "None.",
    sideEffectDifference: "None.",
    securityDifference: "None.",
    confidenceImpact: "NONE",
    disposition: "USED_SEMANTICALLY_EQUIVALENT",
    ...overrides,
  };
}

function withCrlf(bytes) {
  return Buffer.from(bytes.toString("utf8").replace(/(?<!\r)\n/gu, "\r\n"), "utf8");
}
