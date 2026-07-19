import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  evaluatePreflightFacts,
  FALLBACK_EVENT_FIELDS,
  resolveRegisteredCommand,
  sha256,
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
  assert.equal(taskManifest.commandRegistryDigest, sha256(registryBytes));
  assert.equal(taskManifest.receiptSchema.sha256, sha256(schemaBytes));
  assert.equal(taskManifest.governance.openFindings, 10);
  assert.equal(taskManifest.governance.findingRemediationAuthorized, false);
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
    taskManifestSha256: sha256(taskBytes),
    commandRegistrySha256: sha256(registryBytes),
    sourceEvidence: {},
    externalEnvironment: [],
    capabilities: {},
    checks: {},
    fallbackEvents: [],
  };
  assert.equal(validateJsonSchema(receipt, receiptSchema), true);
  assert.throws(
    () => validateJsonSchema({ ...receipt, hardcodedRemoteSuccess: true }, receiptSchema),
    /json_schema_unknown/u,
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
