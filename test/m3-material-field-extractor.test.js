import assert from "node:assert/strict";
import test from "node:test";
import {
  assertNoRawMaterialPayload,
  extractMaterialFields
} from "../src/domain/newProductEvaluation/materialFieldExtractor.js";
import { M3_NEW_PRODUCT_MATERIAL_FIXTURES } from "../src/domain/newProductEvaluation/fixtures/newProductMaterials.fixture.js";

test("material-first is the default input mode and structured table is not required", () => {
  const result = extractMaterialFields(M3_NEW_PRODUCT_MATERIAL_FIXTURES[0]);

  assert.equal(result.inputMode, "material_first");
  assert.equal(result.syntheticOnly, true);
  assert.equal(result.rawMaterialStored, false);
  assert.equal(result.rawTextPersisted, false);
  assert.ok(result.extractedFields.length > 0);
});

test("source accepts only publication and web_original", () => {
  const publication = extractMaterialFields({
    materialId: "SYN-M3-SOURCE-001",
    fields: { source: "publication" }
  });
  const webOriginal = extractMaterialFields({
    materialId: "SYN-M3-SOURCE-002",
    fields: { source: "web_original" }
  });
  const unsupported = extractMaterialFields({
    materialId: "SYN-M3-SOURCE-003",
    fields: { source: "other" }
  });

  assert.equal(publication.normalizedFields.source, "publication");
  assert.equal(webOriginal.normalizedFields.source, "web_original");
  assert.equal(unsupported.invalidFields[0].code, "unsupported_source");
});

test("variable-field material still emits candidates, missing fields and manual fill list", () => {
  const result = extractMaterialFields(M3_NEW_PRODUCT_MATERIAL_FIXTURES[1]);

  assert.ok(result.extractedFields.some((field) => field.key === "title"));
  assert.ok(result.missingFields.includes("synopsis"));
  assert.ok(result.manualFillRequired.includes("classificationCandidate"));
  assert.equal(result.normalizedFields.source, "web_original");
});

test("publication completionStatus defaults to completed and is marked defaulted", () => {
  const result = extractMaterialFields({
    materialId: "SYN-M3-PUB-DEFAULT",
    fields: {
      source: "publication"
    }
  });

  assert.equal(result.normalizedFields.completionStatus, "completed");
  assert.ok(result.defaultedFields.includes("completionStatus"));
  assert.equal(result.missingFields.includes("completionStatus"), false);
});

test("same-name audio check status is normalized and unknown status defaults after checked", () => {
  const result = extractMaterialFields({
    materialId: "SYN-M3-AUDIO-CHECKED",
    fields: {
      sameNameAudioStatusCheckStatus: "checked"
    }
  });
  const unchecked = extractMaterialFields({
    materialId: "SYN-M3-AUDIO-UNCHECKED",
    fields: {
      sameNameAudioStatusCheckStatus: "pending"
    }
  });

  assert.equal(result.normalizedFields.sameNameAudioStatusCheckStatus, "checked");
  assert.equal(result.normalizedFields.sameNameAudioStatus, "unknown");
  assert.ok(result.defaultedFields.includes("sameNameAudioStatus"));
  assert.equal(unchecked.normalizedFields.sameNameAudioStatusCheckStatus, "unchecked");
});

test("raw material payload is rejected before parsing", () => {
  assert.throws(
    () => assertNoRawMaterialPayload({ rawText: "SYNTHETIC RAW BODY SHOULD NOT BE ACCEPTED" }),
    /raw material payload is not accepted/
  );
});
