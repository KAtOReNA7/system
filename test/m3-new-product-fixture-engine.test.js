import assert from "node:assert/strict";
import test from "node:test";
import { buildM3NewProductFixtureDataset } from "../src/domain/newProductEvaluation/fixtureEngine.js";

test("M3 fixture engine covers M3-0 through M3-7 prototype objects", () => {
  const dataset = buildM3NewProductFixtureDataset();

  assert.equal(dataset.topics.length, 5);
  assert.equal(dataset.algorithmVersions[0].fixtureOnly, true);
  assert.equal(dataset.backtests[0].syntheticOnly, true);

  const ready = dataset.topics.find((topic) => topic.topicId === "SYN-TOPIC-0001");
  assert.ok(ready);
  assert.equal(ready.inputSnapshot.readiness, "ready");
  assert.equal(ready.material.rawMaterialStored, false);
  assert.ok(ready.material.chunkingPlan.length >= 1);
  assert.ok(ready.comparators.filter((item) => item.selectedAsFinal).length <= 3);
  assert.equal(ready.authorRanking.enabled, true);
  assert.equal(ready.forecast.outputType, "five_year_interval_forecast");
  assert.equal(ready.forecast.annualBreakdown.length, 5);
  assert.equal(ready.rating.noDevelopDecisionOutput, true);
  assert.equal(ready.rating.noResourceInvestmentLevel, true);
  assert.equal(ready.topicWorkLink.oneTopicOneWork, true);
  assert.deepEqual(ready.backtestPlan.checkpoints, ["first_year", "third_year", "fifth_year"]);
  assert.equal(ready.notForFormalDecision, true);
});

test("M3 readiness blocked topics do not emit formal-style numeric forecasts", () => {
  const dataset = buildM3NewProductFixtureDataset();
  const blocked = dataset.topics.find((topic) => topic.topicId === "SYN-TOPIC-0003");

  assert.ok(blocked.inputSnapshot.gaps.some((gap) => gap.field === "completeClassification"));
  assert.equal(blocked.forecast.outputType, "readiness_blocked");
  assert.equal(blocked.forecast.fiveYearBase, null);
  assert.equal(blocked.rating.value, "blocked");
  assert.equal(blocked.rating.limitingFactors.length > 0, true);
});

test("M3 fixture engine output contains no raw-material or formal execution markers", () => {
  const text = JSON.stringify(buildM3NewProductFixtureDataset());

  for (const forbidden of [
    "postgres://",
    "postgresql://",
    "PGPASSWORD",
    "data/private-output",
    "raw bill",
    "raw ledger",
    "formalMasterDataWritten"
  ]) {
    assert.equal(text.includes(forbidden), false, `unexpected forbidden token: ${forbidden}`);
  }
});
