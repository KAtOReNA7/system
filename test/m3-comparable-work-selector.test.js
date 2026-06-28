import assert from "node:assert/strict";
import test from "node:test";
import { buildComparableWorks } from "../src/domain/newProductEvaluation/comparableWorkSelector.js";
import { extractMaterialFields } from "../src/domain/newProductEvaluation/materialFieldExtractor.js";
import { M3_NEW_PRODUCT_MATERIAL_FIXTURES } from "../src/domain/newProductEvaluation/fixtures/newProductMaterials.fixture.js";

function comparableWorksForFixture(index = 0) {
  const parsed = extractMaterialFields(M3_NEW_PRODUCT_MATERIAL_FIXTURES[index]);
  return buildComparableWorks(parsed.normalizedFields);
}

test("system comparable works are capped at 3", () => {
  const comparableWorks = comparableWorksForFixture(0);

  assert.ok(comparableWorks.systemSelected.length <= 3);
  assert.equal(comparableWorks.nonFormal, true);
  assert.equal(comparableWorks.fixtureOnly, true);
  assert.equal(comparableWorks.notForFormalDecision, true);
});

test("operator-specified comparators are displayed beside system comparables", () => {
  const comparableWorks = comparableWorksForFixture(0);

  assert.equal(comparableWorks.operatorSpecified.length, 1);
  assert.equal(comparableWorks.operatorSpecified[0].operatorComparatorId, "SYN-M3-OP-COMPARATOR-001");
  assert.equal(comparableWorks.operatorSpecified[0].notCountedAgainstSystemLimit, true);
  assert.ok(comparableWorks.systemSelected.length > 0);
});

test("same-author works are separated and do not consume system comparable slots", () => {
  const comparableWorks = comparableWorksForFixture(0);
  const systemIds = new Set(comparableWorks.systemSelected.map((item) => item.comparableWorkId));

  assert.ok(comparableWorks.sameAuthorReferenceWorks.length >= 3);
  for (const item of comparableWorks.sameAuthorReferenceWorks) {
    assert.equal(item.notCountedAgainstComparableLimit, true);
    assert.equal(systemIds.has(item.authorWorkId), false);
  }
});

test("buyout income is excluded or separately reported in comparables", () => {
  const comparableWorks = comparableWorksForFixture(0);
  const pureBuyoutExcluded = comparableWorks.excluded.find(
    (item) => item.excludedReasonCode === "pure_buyout_historical_value_only"
  );
  const buyoutPlusSales = comparableWorks.systemSelected.find(
    (item) => item.buyoutTreatment === "sales_component_used_buyout_component_reported_separately"
  );

  assert.ok(pureBuyoutExcluded);
  assert.ok(buyoutPlusSales);
  assert.equal(buyoutPlusSales.revenueBasis.type, "sales_component_monthly_equivalent");
  assert.equal(buyoutPlusSales.revenueBasis.salesCurveEligible, true);
  assert.equal(
    comparableWorks.systemSelected.some((item) => item.buyoutTreatment === "pure_buyout_separated_not_sales_curve"),
    false
  );
});

test("excluded candidates include interpretable reasons", () => {
  const comparableWorks = comparableWorksForFixture(0);

  assert.ok(comparableWorks.excluded.length > 0);
  for (const item of comparableWorks.excluded) {
    assert.ok(item.candidateId);
    assert.ok(item.excludedReasonCode);
    assert.ok(item.excludedReason);
  }
});
