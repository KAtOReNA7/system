import assert from "node:assert/strict";
import test from "node:test";
import { buildAuthorRanking } from "../src/domain/newProductEvaluation/authorRanking.js";
import { extractMaterialFields } from "../src/domain/newProductEvaluation/materialFieldExtractor.js";
import { M3_NEW_PRODUCT_MATERIAL_FIXTURES } from "../src/domain/newProductEvaluation/fixtures/newProductMaterials.fixture.js";

function authorRankingForFixture(index) {
  const parsed = extractMaterialFields(M3_NEW_PRODUCT_MATERIAL_FIXTURES[index]);
  return buildAuthorRanking(parsed.normalizedFields);
}

test("author ranking is enabled when at least 3 measurable author works exist", () => {
  const ranking = authorRankingForFixture(0);

  assert.equal(ranking.enabled, true);
  assert.equal(ranking.disabledReason, null);
  assert.equal(ranking.comparableAuthorWorkCount, 3);
  assert.equal(ranking.measurableWorkCount, 3);
  assert.equal(ranking.medianMonthlyEquivalent, 6900);
  assert.equal(ranking.topWorkMonthlyEquivalent, 9200);
  assert.equal(ranking.authorTier, "author_tier_mid");
  assert.equal(ranking.nonFormal, true);
  assert.equal(ranking.fixtureOnly, true);
  assert.equal(ranking.notForFormalDecision, true);
});

test("author ranking is disabled when fewer than 3 measurable author works exist", () => {
  const ranking = authorRankingForFixture(1);

  assert.equal(ranking.enabled, false);
  assert.equal(ranking.disabledReason, "insufficient_measurable_author_works");
  assert.ok(ranking.measurableWorkCount < 3);
  assert.equal(ranking.medianMonthlyEquivalent, null);
  assert.equal(ranking.authorTier, null);
});

test("author ranking uses synthetic fixture data only", () => {
  const ranking = authorRankingForFixture(0);
  const text = JSON.stringify(ranking);

  assert.match(text, /Synthetic fixture author works only|No real author detail/);
  assert.equal(text.includes("data/private-output"), false);
  assert.equal(text.includes(".xlsx"), false);
  assert.equal(text.includes("postgres://"), false);
});
