import assert from "node:assert/strict";
import test from "node:test";
import {
  applyExternalEvidenceToParsedMaterial,
  buildEvidenceDerivedFields,
  normalizeExternalEvidence,
  summarizeExternalEvidence
} from "../src/domain/newProductEvaluation/externalEvidence.js";
import { extractMaterialFields } from "../src/domain/newProductEvaluation/materialFieldExtractor.js";

const baseMaterial = {
  materialId: "SYN-M3-EVIDENCE-TEST",
  fields: {
    title: "SYN-M3-TITLE",
    author: "SYN-M3-AUTHOR",
    source: "publication",
    classificationCandidate: ["SYN-L1"],
    wordCount: 100000,
    targetChannels: ["SYN-CHANNEL"],
    copyrightTermRange: "3 years"
  }
};

test("GPT web-assisted summary without cited source is forced to low confidence", () => {
  const [evidence] = normalizeExternalEvidence([{
    evidenceId: "SYN-EVID-GPT-NO-SOURCE",
    evidenceType: "gptWebAssistedSummary",
    confidence: "high",
    sourceUrl: "",
    sourceDescription: "",
    rawExcerptSummary: "Short synthetic GPT-assisted summary."
  }]);

  assert.equal(evidence.confidence, "low");
  assert.equal(evidence.sourceReliability, "low");
  assert.ok(evidence.limitations.some((item) => item.includes("No cited source")));
});

test("GPT web-assisted summary with source is capped at medium confidence", () => {
  const [evidence] = normalizeExternalEvidence([{
    evidenceId: "SYN-EVID-GPT-SOURCE",
    evidenceType: "gptWebAssistedSummary",
    confidence: "high",
    sourceUrl: "https://example.invalid/synthetic-source",
    rawExcerptSummary: "Short synthetic source-backed summary."
  }]);

  assert.equal(evidence.confidence, "medium");
  assert.equal(evidence.sourceReliability, "medium");
});

test("confirmed high-confidence heat evidence can derive usable externalHeat", () => {
  const parsed = extractMaterialFields(baseMaterial);
  const evidence = normalizeExternalEvidence([{
    evidenceId: "SYN-EVID-HEAT",
    evidenceType: "rankingSignal",
    sourceUrl: "https://example.invalid/synthetic-ranking",
    confidence: "high",
    manualConfirmed: true,
    mappedFields: ["externalHeat"],
    metricName: "ranking",
    metricValue: "strong",
    rawExcerptSummary: "Short synthetic ranking summary."
  }]);
  const enhanced = applyExternalEvidenceToParsedMaterial(parsed, evidence);

  assert.equal(enhanced.normalizedFields.externalHeat.level, "strong");
  assert.ok(enhanced.evidenceDerivedFields.appliedEvidence.some((item) => item.evidenceId === "SYN-EVID-HEAT"));
});

test("low-confidence heat evidence cannot derive externalHeat", () => {
  const evidence = normalizeExternalEvidence([{
    evidenceId: "SYN-EVID-LOW-HEAT",
    evidenceType: "searchHeatSignal",
    sourceUrl: "https://example.invalid/synthetic-search",
    confidence: "low",
    manualConfirmed: true,
    mappedFields: ["externalHeat"],
    rawExcerptSummary: "Short synthetic low-confidence summary."
  }]);
  const derived = buildEvidenceDerivedFields(evidence);

  assert.equal(Object.hasOwn(derived.derivedFields, "externalHeat"), false);
  assert.ok(derived.limitations.some((item) => item.includes("Heat evidence")));
});

test("confirmed same-name audio evidence derives checked status", () => {
  const evidence = normalizeExternalEvidence([{
    evidenceId: "SYN-EVID-AUDIO",
    evidenceType: "sameNameAudioEvidence",
    sourceUrl: "https://example.invalid/synthetic-audio-check",
    confidence: "high",
    manualConfirmed: true,
    metricValue: "none",
    mappedFields: ["sameNameAudioStatusCheckStatus", "sameNameAudioStatus"],
    rawExcerptSummary: "Short synthetic same-name audio check summary."
  }]);
  const derived = buildEvidenceDerivedFields(evidence);

  assert.equal(derived.derivedFields.sameNameAudioStatusCheckStatus, "checked");
  assert.equal(derived.derivedFields.sameNameAudioStatus, "none");
});

test("external evidence summary is aggregate-only and non-formal", () => {
  const evidence = normalizeExternalEvidence([{
    evidenceId: "SYN-EVID-SOCIAL",
    evidenceType: "socialHeatSignal",
    sourceDescription: "Synthetic social heat source.",
    confidence: "medium",
    manualConfirmed: true,
    rawExcerptSummary: "Short synthetic social summary."
  }]);
  const summary = summarizeExternalEvidence(evidence);

  assert.equal(summary.heatSignalEvidenceCount, 1);
  assert.equal(summary.mediumConfidenceEvidenceCount, 1);
  assert.equal(summary.manualConfirmedEvidenceCount, 1);
  assert.equal(summary.nonFormal, true);
  assert.equal(JSON.stringify(evidence).includes("webpageFullText"), false);
});
