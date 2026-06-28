import assert from "node:assert/strict";
import test from "node:test";
import { extractMaterialFields } from "../src/domain/newProductEvaluation/materialFieldExtractor.js";
import { evaluateNewProductReadiness } from "../src/domain/newProductEvaluation/newProductReadiness.js";
import { M3_NEW_PRODUCT_MATERIAL_FIXTURES } from "../src/domain/newProductEvaluation/fixtures/newProductMaterials.fixture.js";

function readyFields(overrides = {}) {
  return {
    title: "SYN-M3-TITLE",
    author: "SYN-M3-AUTHOR",
    source: "web_original",
    classificationCandidate: ["SYN-L1", "SYN-L2", "SYN-L3"],
    wordCount: 500000,
    completionStatus: "completed",
    reads: 1000,
    targetChannels: ["SYN-M3-CHANNEL-X"],
    copyrightTermRange: "3 years",
    sameNameAudioStatus: "none",
    sameNameAudioStatusCheckStatus: "checked",
    ...overrides
  };
}

function readinessFor(fields) {
  return evaluateNewProductReadiness(extractMaterialFields({ materialId: "SYN-M3-READINESS", fields }));
}

test("missing hard blockers returns readiness blocked", () => {
  const readiness = readinessFor({
    title: "SYN-M3-TITLE-BLOCKED",
    author: "SYN-M3-AUTHOR-BLOCKED",
    source: "publication",
    copyrightTermRange: "3 years"
  });

  assert.equal(readiness.readinessStatus, "blocked");
  assert.equal(readiness.numericForecastAllowed, false);
  assert.ok(readiness.hardBlockerCodes.includes("missing_classification"));
  assert.ok(readiness.hardBlockerCodes.includes("missing_volume_estimate"));
  assert.ok(readiness.hardBlockerCodes.includes("missing_heat_signal"));
  assert.ok(readiness.hardBlockerCodes.includes("missing_target_channels"));
  assert.ok(readiness.hardBlockerCodes.includes("missing_same_name_audio_check_status"));
});

test("missing warning fields creates warnings but does not block", () => {
  const readiness = evaluateNewProductReadiness(extractMaterialFields(M3_NEW_PRODUCT_MATERIAL_FIXTURES[1]));

  assert.equal(readiness.readinessStatus, "warning_only");
  assert.equal(readiness.numericForecastAllowed, true);
  assert.equal(readiness.hardBlockers.length, 0);
  assert.ok(readiness.warningCodes.includes("missing_synopsis"));
  assert.ok(readiness.warningCodes.includes("classification_requires_user_confirmation"));
  assert.ok(readiness.warningCodes.includes("same_name_audio_unknown"));
});

test("missing wordCount passes when audioVolumeEstimate exists", () => {
  const readiness = readinessFor(readyFields({ wordCount: undefined, audioVolumeEstimate: 75 }));

  assert.equal(readiness.hardBlockerCodes.includes("missing_volume_estimate"), false);
  assert.equal(readiness.numericForecastAllowed, true);
});

test("missing both wordCount and audioVolumeEstimate blocks", () => {
  const readiness = readinessFor(readyFields({ wordCount: undefined, audioVolumeEstimate: undefined }));

  assert.equal(readiness.readinessStatus, "blocked");
  assert.ok(readiness.hardBlockerCodes.includes("missing_volume_estimate"));
  assert.equal(readiness.numericForecastAllowed, false);
});

test("publication missing completionStatus defaults to completed with warning", () => {
  const parsed = extractMaterialFields({
    materialId: "SYN-M3-PUBLICATION-DEFAULT",
    fields: readyFields({ source: "publication", completionStatus: undefined })
  });
  const readiness = evaluateNewProductReadiness(parsed);

  assert.equal(parsed.normalizedFields.completionStatus, "completed");
  assert.ok(parsed.defaultedFields.includes("completionStatus"));
  assert.equal(readiness.hardBlockerCodes.includes("missing_completion_status_web_original"), false);
  assert.ok(readiness.warningCodes.includes("completion_status_source_defaulted"));
});

test("web_original missing completionStatus blocks", () => {
  const readiness = readinessFor(readyFields({ completionStatus: undefined }));

  assert.equal(readiness.readinessStatus, "blocked");
  assert.ok(readiness.hardBlockerCodes.includes("missing_completion_status_web_original"));
});

test("sameNameAudioStatus checked but unknown is warning only", () => {
  const readiness = readinessFor(readyFields({ sameNameAudioStatus: "unknown" }));

  assert.equal(readiness.hardBlockerCodes.includes("same_name_audio_not_checked"), false);
  assert.ok(readiness.warningCodes.includes("same_name_audio_unknown"));
});

test("sameNameAudioStatus unchecked blocks", () => {
  const readiness = readinessFor(
    readyFields({
      sameNameAudioStatus: "unknown",
      sameNameAudioStatusCheckStatus: "unchecked"
    })
  );

  assert.equal(readiness.readinessStatus, "blocked");
  assert.ok(readiness.hardBlockerCodes.includes("same_name_audio_not_checked"));
});

test("other source is rejected", () => {
  const readiness = readinessFor(readyFields({ source: "other" }));

  assert.equal(readiness.readinessStatus, "blocked");
  assert.ok(readiness.hardBlockerCodes.includes("unsupported_source"));
});

test("confirmed high-confidence heat evidence can fill missing heat hard blocker", () => {
  const parsed = extractMaterialFields({
    materialId: "SYN-M3-READINESS-EVIDENCE",
    fields: readyFields({ reads: undefined })
  });
  const readiness = evaluateNewProductReadiness(parsed, {
    externalEvidence: [{
      evidenceId: "SYN-EVID-HEAT",
      evidenceType: "rankingSignal",
      sourceUrl: "https://example.invalid/synthetic-ranking",
      confidence: "high",
      manualConfirmed: true,
      rawExcerptSummary: "Short synthetic ranking summary."
    }]
  });

  assert.equal(readiness.hardBlockerCodes.includes("missing_heat_signal"), false);
  assert.equal(readiness.numericForecastAllowed, true);
  assert.ok(readiness.evidenceDerivedFields.appliedEvidence.some((item) => item.evidenceId === "SYN-EVID-HEAT"));
});

test("low-confidence heat evidence cannot fill missing heat hard blocker", () => {
  const parsed = extractMaterialFields({
    materialId: "SYN-M3-READINESS-LOW-EVIDENCE",
    fields: readyFields({ reads: undefined })
  });
  const readiness = evaluateNewProductReadiness(parsed, {
    externalEvidence: [{
      evidenceId: "SYN-EVID-LOW-HEAT",
      evidenceType: "searchHeatSignal",
      sourceUrl: "https://example.invalid/synthetic-search",
      confidence: "low",
      manualConfirmed: true,
      rawExcerptSummary: "Short synthetic search summary."
    }]
  });

  assert.ok(readiness.hardBlockerCodes.includes("missing_heat_signal"));
  assert.equal(readiness.numericForecastAllowed, false);
});

test("confirmed same-name audio evidence can fill missing same-name check", () => {
  const parsed = extractMaterialFields({
    materialId: "SYN-M3-READINESS-AUDIO-EVIDENCE",
    fields: readyFields({
      sameNameAudioStatus: undefined,
      sameNameAudioStatusCheckStatus: undefined
    })
  });
  const readiness = evaluateNewProductReadiness(parsed, {
    externalEvidence: [{
      evidenceId: "SYN-EVID-SAME-NAME",
      evidenceType: "sameNameAudioEvidence",
      sourceUrl: "https://example.invalid/synthetic-audio-check",
      confidence: "high",
      manualConfirmed: true,
      metricValue: "none",
      rawExcerptSummary: "Short synthetic same-name audio summary."
    }]
  });

  assert.equal(readiness.hardBlockerCodes.includes("missing_same_name_audio_check_status"), false);
  assert.equal(readiness.hardBlockerCodes.includes("same_name_audio_not_checked"), false);
  assert.equal(readiness.numericForecastAllowed, true);
});

test("unconfirmed evidence cannot fill hard blockers", () => {
  const parsed = extractMaterialFields({
    materialId: "SYN-M3-READINESS-UNCONFIRMED-EVIDENCE",
    fields: readyFields({ reads: undefined })
  });
  const readiness = evaluateNewProductReadiness(parsed, {
    externalEvidence: [{
      evidenceId: "SYN-EVID-UNCONFIRMED",
      evidenceType: "rankingSignal",
      sourceUrl: "https://example.invalid/synthetic-ranking",
      confidence: "high",
      manualConfirmed: false,
      rawExcerptSummary: "Short synthetic ranking summary."
    }]
  });

  assert.ok(readiness.hardBlockerCodes.includes("missing_heat_signal"));
  assert.equal(readiness.numericForecastAllowed, false);
});
