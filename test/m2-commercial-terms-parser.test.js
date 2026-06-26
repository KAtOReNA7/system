import assert from "node:assert/strict";
import test from "node:test";

import { COMMERCIAL_SOURCE_TYPES, parseCommercialTerms } from "../src/domain/oldProductEvaluation/commercialTermsParser.js";

test("commercial parser recognizes buyout", () => {
  const result = parseCommercialTerms({
    text: "合作方式: 买断",
    sourceType: COMMERCIAL_SOURCE_TYPES.FULL_DIGITAL_LEDGER_TERMS
  });
  assert.equal(result.commercialModel, "buyout");
  assert.equal(result.buyoutFlag, true);
  assert.equal(result.commercialModelConfidence, "high");
});

test("commercial parser recognizes royalty", () => {
  const result = parseCommercialTerms({ text: "结算方式: 版税" });
  assert.equal(result.commercialModel, "royalty");
  assert.equal(result.royaltyFlag, true);
});

test("commercial parser recognizes prepaid royalty", () => {
  const result = parseCommercialTerms({ text: "预付版税，后续按版税结算" });
  assert.equal(result.commercialModel, "prepaid_royalty");
  assert.equal(result.prepaidFlag, true);
  assert.equal(result.royaltyFlag, true);
});

test("commercial parser does not infer unknown terms", () => {
  const result = parseCommercialTerms({ text: "有声使用权: 有" });
  assert.equal(result.commercialModel, "unknown");
  assert.equal(result.requiresManualCommercialReview, true);
});

test("operation confirmation tags do not become high confidence contract facts", () => {
  const result = parseCommercialTerms({
    text: "合作方式: 买断；有声权利描述: 有声使用权",
    sourceType: COMMERCIAL_SOURCE_TYPES.OPERATION_CONFIRMATION_TAGS
  });

  assert.equal(result.commercialModel, "buyout");
  assert.equal(result.commercialModelConfidence, "medium");
  assert.equal(result.requiresManualCommercialReview, true);
});

test("full ledger field has priority over lower-priority tag source", () => {
  const result = parseCommercialTerms({
    sources: [
      {
        sourceType: COMMERCIAL_SOURCE_TYPES.OPERATION_CONFIRMATION_TAGS,
        value: "合作方式: 分成"
      },
      {
        sourceType: COMMERCIAL_SOURCE_TYPES.FULL_DIGITAL_LEDGER_TERMS,
        value: "合同类型: 买断；有声使用权: 是"
      }
    ]
  });

  assert.equal(result.commercialModel, "buyout");
  assert.equal(result.commercialModelConfidence, "high");
});

test("same-priority conflicting commercial models require manual review", () => {
  const result = parseCommercialTerms({
    sources: [
      {
        sourceType: COMMERCIAL_SOURCE_TYPES.FULL_DIGITAL_LEDGER_TERMS,
        value: "合作方式: 买断；有声使用权: 是"
      },
      {
        sourceType: COMMERCIAL_SOURCE_TYPES.FULL_DIGITAL_LEDGER_TERMS,
        value: "结算方式: 分成"
      }
    ]
  });

  assert.equal(result.commercialModel, "conflict");
  assert.equal(result.requiresManualCommercialReview, true);
});
