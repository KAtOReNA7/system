import assert from "node:assert/strict";
import test from "node:test";
import { extractMaterialFields } from "../src/domain/newProductEvaluation/materialFieldExtractor.js";
import { evaluateNewProductReadiness } from "../src/domain/newProductEvaluation/newProductReadiness.js";
import { M3_NEW_PRODUCT_MATERIAL_FIXTURES } from "../src/domain/newProductEvaluation/fixtures/newProductMaterials.fixture.js";

test("missing hard blockers returns readiness blocked", () => {
  const parsed = extractMaterialFields({
    materialId: "SYN-M3-BLOCKED",
    fields: {
      title: "SYN-M3-TITLE-BLOCKED",
      author: "SYN-M3-AUTHOR-BLOCKED",
      source: "publication",
      copyrightTermRange: "3 years"
    }
  });

  const readiness = evaluateNewProductReadiness(parsed);

  assert.equal(readiness.readinessStatus, "blocked");
  assert.equal(readiness.numericForecastAllowed, false);
  assert.ok(readiness.hardBlockerCodes.includes("missing_classification"));
  assert.ok(readiness.hardBlockerCodes.includes("missing_heat_signal"));
  assert.ok(readiness.hardBlockerCodes.includes("missing_target_channels"));
});

test("missing non-hard fields creates warnings but does not block", () => {
  const parsed = extractMaterialFields(M3_NEW_PRODUCT_MATERIAL_FIXTURES[1]);
  const readiness = evaluateNewProductReadiness(parsed);

  assert.equal(readiness.readinessStatus, "warning_only");
  assert.equal(readiness.numericForecastAllowed, true);
  assert.equal(readiness.hardBlockers.length, 0);
  assert.ok(readiness.warningCodes.includes("missing_synopsis"));
  assert.ok(readiness.warningCodes.includes("classification_requires_user_confirmation"));
});

test("at least one heat signal satisfies heat hard blocker", () => {
  const parsed = extractMaterialFields({
    materialId: "SYN-M3-HEAT",
    fields: {
      title: "SYN-M3-TITLE-HEAT",
      author: "SYN-M3-AUTHOR-HEAT",
      source: "web_original",
      classificationCandidate: ["SYN-L1", "SYN-L2", "SYN-L3"],
      reads: 1000,
      targetChannels: ["SYN-M3-CHANNEL-X"],
      copyrightTermRange: "2 years"
    }
  });

  const readiness = evaluateNewProductReadiness(parsed);

  assert.equal(readiness.hardBlockerCodes.includes("missing_heat_signal"), false);
  assert.equal(readiness.numericForecastAllowed, true);
});

test("sameNameAudioStatus only uses has none or unknown and missing value is warning", () => {
  const withStatus = extractMaterialFields({
    materialId: "SYN-M3-AUDIO",
    fields: { sameNameAudioStatus: "有" }
  });
  const withoutStatus = evaluateNewProductReadiness(extractMaterialFields(M3_NEW_PRODUCT_MATERIAL_FIXTURES[2]));

  assert.equal(withStatus.normalizedFields.sameNameAudioStatus, "has");
  assert.equal(withoutStatus.warningCodes.includes("missing_same_name_audio_status"), false);
});
