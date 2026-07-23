import assert from "node:assert/strict";
import test from "node:test";
import {
  V2B4_MODELS,
  V2B4_REQUEST_CAP,
  buildV2B4Manifest,
  evaluateV2B4Canary,
} from "../src/domain/m2V2EvidencePilot/v2b4Runtime.js";
import { createV2B3SourceGovernancePolicy } from "../src/domain/m2V2EvidencePilot/evidencePipelineV2B3.js";
import { sha256 } from "../src/domain/m2V2EvidencePilot/pilotCore.js";

const CAPTURED_AT = "2026-07-18T03:00:00.000Z";
const SOURCE_ID = "src_aaaaaaaaaaaaaaaaaaaa";

test("V2-B.4 manifest reuses the frozen 10-work/5-repeat identities and caps requests at 60", () => {
  const manifest = syntheticManifest();
  assert.equal(manifest.sampleCount, 10);
  assert.equal(manifest.repeatSampleCount, 5);
  assert.equal(manifest.logicalTaskCount, 15);
  assert.equal(manifest.plannedPhysicalRequestCount, V2B4_REQUEST_CAP);
  assert.equal(manifest.retryCount, 0);
  assert.deepEqual(manifest.models, V2B4_MODELS);
  assert.equal(manifest.fairness.sameWorks, true);
  assert.equal(manifest.fairness.sameQueries, true);
  assert.equal(manifest.fairness.samePromptTemplates, true);
  assert.equal(manifest.fairness.speedDoesNotSelectModel, true);
  assert.equal(new Set(manifest.physicalPlan.map((item) => item.requestKey)).size, 60);
  assert.equal(manifest.boundaries.full160Executed, false);
});

test("complete aligned synthetic receipts pass every pre-test canary gate", () => {
  const manifest = syntheticManifest();
  const receipts = syntheticReceipts(manifest);
  const policy = createV2B3SourceGovernancePolicy({
    researchDomains: ["research.example"],
    modelDomains: ["research.example"],
  });
  const evaluation = evaluateV2B4Canary({ manifest, receipts, policy });
  for (const model of V2B4_MODELS) {
    assert.equal(evaluation.perModel[model].search.successRate, 1);
    assert.equal(evaluation.perModel[model].search.providerConnectivityRate, 1);
    assert.equal(evaluation.perModel[model].search.repeatPlannedQueries, 5);
    assert.equal(evaluation.perModel[model].search.allRunProviderErrorCount, 0);
    assert.equal(evaluation.perModel[model].extraction.dispatchedRequests, 10);
    assert.equal(evaluation.perModel[model].extraction.contractSuccessRate, 1);
    assert.equal(evaluation.perModel[model].entity.resolvedRate, 1);
    assert.equal(evaluation.perModel[model].evidence.acceptedEvidenceCoverage, 1);
    assert.equal(evaluation.perModel[model].evidence.highValueCoverage, 1);
    assert.equal(evaluation.perModel[model].citation.alignmentRate, 1);
    assert.equal(evaluation.perModel[model].citation.alignmentEvaluable, true);
    assert.equal(evaluation.perModel[model].time.receiptCapturedAtCompleteness, 1);
    assert.equal(evaluation.perModel[model].time.availableAtCompleteness, 1);
    assert.equal(evaluation.perModel[model].reproducibility.claimAgreementRate, 1);
    assert.equal(evaluation.perModel[model].cost.tokenBudgetAcceptable, true);
  }
  assert.equal(evaluation.gate.nonTestGatePassed, true);
  assert.equal(evaluation.gate.preliminaryDecision, "CANARY_CONDITIONAL_PENDING_TESTS");
  assert.equal(evaluation.gate.full160Authorized, false);
});

test("empty research allowlist fails prohibited-source governance without implicit promotion", () => {
  const manifest = syntheticManifest();
  const policy = createV2B3SourceGovernancePolicy();
  const evaluation = evaluateV2B4Canary({ manifest, receipts: syntheticReceipts(manifest), policy });
  const gate = evaluation.gate.items.find((item) => item.id === "prohibited_source");
  assert.equal(gate.passed, false);
  assert.equal(gate.observed, 1);
  assert.equal(evaluation.governance.researchAllowlistStatus, "empty_fail_closed");
  assert.equal(evaluation.governance.modelAllowlistStatus, "empty_by_default");
  assert.equal(evaluation.governance.implicitPromotionUsed, false);
  assert.equal(evaluation.gate.preliminaryDecision, "CANARY_CONDITIONAL");
});

test("repeat claim drift remains in the five-work denominator and fails agreement gate", () => {
  const manifest = syntheticManifest();
  const receipts = syntheticReceipts(manifest).map((receipt) => {
    if (receipt.requestedModelId !== "gpt-5.6-luna" || receipt.runKind !== "repeat" || receipt.stage !== "extraction") return receipt;
    const changed = structuredClone(receipt);
    changed.normalizedResponse.evaluatedEvidence[0].evidence.claim = `Drifted ${receipt.identityDigest}`;
    changed.normalizedResponse.evaluatedEvidence[0].evidence.structuredValue.dateValue = "2025-01-02";
    return withDigest(changed, "receiptDigest");
  });
  const policy = createV2B3SourceGovernancePolicy({
    researchDomains: ["research.example"],
    modelDomains: ["research.example"],
  });
  const evaluation = evaluateV2B4Canary({ manifest, receipts, policy });
  assert.equal(evaluation.perModel["gpt-5.6-luna"].reproducibility.repeatWorkCount, 5);
  assert.equal(evaluation.perModel["gpt-5.6-luna"].reproducibility.evaluableWorkCount, 5);
  assert.equal(evaluation.perModel["gpt-5.6-luna"].reproducibility.claimAgreementRate, 0);
  assert.equal(evaluation.gate.items.find((item) => item.id === "repeat_claim_agreement").passed, false);
});

function syntheticManifest() {
  const sample = Array.from({ length: 10 }, (_, index) => ({
    standardWorkId: `synthetic-work-${index + 1}`,
    identityDigest: sha256(`synthetic-identity-${index + 1}`),
    title: `Synthetic Work ${index + 1}`,
    author: `Synthetic Author ${index + 1}`,
    sourceType: index % 2 ? "web_original" : "publication",
    highValue: index < 4,
    canarySlotId: `slot-${index + 1}`,
  }));
  const canary = {
    parentManifestDigest: "a".repeat(64),
    canaryManifestDigest: "b".repeat(64),
    sample,
    repeatSample: sample.slice(0, 5).map((work) => ({
      standardWorkId: work.standardWorkId,
      identityDigest: work.identityDigest,
    })),
  };
  const benchmark = {
    benchmarkManifestDigest: "c".repeat(64),
    logicalTasks: sample.map((work, index) => ({
      logicalTaskKey: sha256(["synthetic-task", index]),
      workReference: `private-work-${index + 1}`,
      identityDigest: work.identityDigest,
      workOrdinal: index + 1,
      title: work.title,
      author: work.author,
      sourceType: work.sourceType,
      combinedIntent: "verify synthetic public evidence",
    })),
  };
  return buildV2B4Manifest({
    canary,
    benchmark,
    policy: createV2B3SourceGovernancePolicy(),
    relayBindingDigest: "d".repeat(64),
    createdAt: CAPTURED_AT,
  });
}

function syntheticReceipts(manifest) {
  const taskByKey = new Map(manifest.logicalTasks.map((task) => [task.logicalTaskKey, task]));
  return manifest.physicalPlan.map((item) => {
    const task = taskByKey.get(item.logicalTaskKey);
    const sourceRecords = [sourceRecord()];
    const normalizedResponse = item.stage === "search"
      ? {
          contractValid: true,
          valid: true,
          sourceRecords,
          sourceRecordCount: 1,
          issues: [],
        }
      : {
          contractValid: true,
          valid: true,
          issues: [],
          evaluatedEvidence: [{
            evidence: evidence(task),
            accepted: true,
            rejectionReasons: [],
            researchEligible: true,
            modelEligible: true,
            modelEligibilityReasons: [],
          }],
        };
    const payload = {
      schema: "m2.v2.canary-v2-physical-receipt.v0.1",
      privateOnly: true,
      manifestDigest: manifest.manifestDigest,
      relayBindingDigest: manifest.relayBindingDigest,
      requestKey: item.requestKey,
      logicalTaskKey: item.logicalTaskKey,
      identityDigest: item.identityDigest,
      workReference: item.workReference,
      runKind: item.runKind,
      stage: item.stage,
      requestedModelId: item.model,
      returnedModelId: item.model,
      modelBindingVerified: true,
      pipelineVersion: manifest.sourcePipelineVersion,
      sourceRecordSchema: manifest.sourceRecordSchema,
      extractionSchema: manifest.extractionSchema,
      dispatched: true,
      retryCount: 0,
      httpStatus: 200,
      providerConnectivityPassed: true,
      providerContractCompatible: true,
      status: "success",
      responseContentTypeClass: "json",
      responseDigest: "e".repeat(64),
      responseByteLength: 100,
      normalizedResponse,
      entity: item.stage === "extraction"
        ? { classification: "resolved", confidence: 0.9, exactMatchEvidenceCount: 1, evaluatedEvidenceCount: 1 }
        : null,
      inputSourceRecords: item.stage === "extraction" ? sourceRecords : [],
      usage: { inputTokens: 80, outputTokens: 20, totalTokens: 100 },
      latencyMs: 100,
      capturedAt: CAPTURED_AT,
      validationIssues: [],
      rawResponsePersisted: false,
      authorizationHeaderPersisted: false,
      apiKeyPersisted: false,
      full160Authorized: false,
    };
    return withDigest(payload, "receiptDigest");
  });
}

function sourceRecord() {
  return {
    sourceId: SOURCE_ID,
    title: "Synthetic Source",
    url: "https://research.example/source",
    domain: "research.example",
    snippet: "Synthetic source fixture.",
    citation: {
      type: "url_citation",
      carrier: "responses_content_annotation",
      annotationPath: "output[*].content[*].annotations[*]",
      citationId: "cit_aaaaaaaaaaaaaaaaaaaa",
      startIndex: null,
      endIndex: null,
      annotationDigest: "f".repeat(64),
    },
    capturedAt: CAPTURED_AT,
    providerReceipt: {
      providerId: "synthetic_relay",
      responseId: "synthetic-response",
      requestedModelId: "synthetic-model",
      returnedModelId: "synthetic-model",
      status: "completed",
      receiptDigest: "1".repeat(64),
    },
  };
}

function evidence(task) {
  return {
    claim: `Publication ${task.identityDigest}`,
    claimType: "publication_event",
    structuredValue: {
      valueType: "date",
      textValue: null,
      dateValue: "2025-01-01",
      numberValue: null,
      booleanValue: null,
    },
    sourceIds: [SOURCE_ID],
    confidence: 0.9,
    eventTime: "2025-01-01T00:00:00.000Z",
    availableAt: "2025-01-02T00:00:00.000Z",
    entityResolution: {
      status: "high",
      matchedTitle: task.title,
      matchedAuthor: task.author,
    },
    contradictionStatus: "none",
  };
}

function withDigest(value, key) {
  const { [key]: _ignored, ...payload } = value;
  return { ...payload, [key]: sha256(payload) };
}
