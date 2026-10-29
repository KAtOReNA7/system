import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getPublicResearchSource, getPublicResearchSummary, projectPublicResearchSummary } from "../src/repositories/publicResearchRepository.js";

async function authorities() {
  const paths = {
    registry: "config/m2-model-registry.v1.json",
    contract: "config/m2-business-acceptance-contract.v1.json",
    crossModel: "docs/analysis/m2-current/M2-core80-cross-model-real-business-evaluation-v0.1.json",
    independent: "docs/analysis/m2-current/M2-head-protected-tail-band-correction-independent-evaluation-v0.2.json"
  };
  return Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([key, path]) => [
    key, JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), "utf8"))
  ])));
}

test("public research dynamically joins frozen horizon evidence and current numeric limits without claiming business acceptance", async () => {
  const input = await authorities();
  const summary = await getPublicResearchSummary();
  assert.equal(summary.dataKind, "PUBLIC_FROZEN_RESEARCH");
  assert.deepEqual(summary.baselineSummary.horizons.map((row) => row.months), [3, 6, 12, 36]);
  for (const row of summary.baselineSummary.horizons) {
    const evidence = input.crossModel.comparison.modelAvailable.find((item) => item.populationId === "ORIGIN_VISIBLE_DYNAMIC_CORE80" &&
      item.modelId === "M2-WORK-LG01" && item.sliceType === "HORIZON" && item.sliceId === String(row.months));
    const contract = input.contract.businessUsability.horizons.find((item) => item.horizonMonths === row.months);
    assert.equal(row.wape, evidence.wape);
    assert.equal(row.signedBias, evidence.signedBias);
    assert.equal(row.caseCoverage, evidence.caseCount / evidence.expectedCaseCount);
    assert.equal(row.limits.wape, contract.maximumWape);
    assert.equal(row.limits.absoluteSignedBias, contract.maximumAbsoluteSignedBias);
    assert.equal(row.revenueAmountCoverage, null);
    assert.equal(row.revenueAmountCoverageStatus, "NOT_DISCLOSED");
    assert.equal(row.businessGate.status, "NOT_ESTABLISHED_BY_THIS_SUMMARY");
    assert.equal(row.historicalNonProspective, row.months === 36);
  }
  assert.equal(summary.baselineSummary.horizons[0].numericComparison.biasWithinLimit, false);
  assert.equal(summary.baselineSummary.horizons[1].numericComparison.status, "WITHIN_TWO_NUMERIC_LIMITS");
  assert.equal(summary.baselineSummary.comparisonClass, "STANDALONE_ONLY");
  assert.equal(summary.roles.activeCandidate, null);
  assert.equal(summary.roles.approvedForAutomation, null);
  assert.equal(summary.roles.productionReady, false);
  assert.deepEqual(summary.permissions, { production: false, automation: false, release: false });
  assert.equal(summary.grainGates.workChannel.status, "PARTIAL_NOT_ACTIVE");
  assert.equal(summary.latestIndependentEvaluation.bootstrap.crossesZero, true);
  assert.equal(summary.latestIndependentEvaluation.cashOnlyResearchEnded, true);
});

test("public projection responds to authority values rather than embedded screenshot metrics", async () => {
  const input = await authorities();
  const evidence = input.crossModel.comparison.modelAvailable.find((row) => row.populationId === "ORIGIN_VISIBLE_DYNAMIC_CORE80" &&
    row.modelId === "M2-WORK-LG01" && row.sliceType === "HORIZON" && row.sliceId === "6");
  evidence.wape = 0.51;
  input.contract.businessUsability.horizons.find((row) => row.horizonMonths === 6).maximumWape = 0.5;
  const result = projectPublicResearchSummary(input).baselineSummary.horizons.find((row) => row.months === 6);
  assert.equal(result.wape, 0.51);
  assert.equal(result.limits.wape, 0.5);
  assert.equal(result.numericComparison.status, "NUMERIC_LIMIT_EXCEEDED");
  assert.equal(result.businessGate.status, "NOT_ESTABLISHED_BY_THIS_SUMMARY");
});

test("missing or ambiguous horizon evidence fails closed instead of using a fallback or zero", async () => {
  const input = await authorities();
  const index = input.crossModel.comparison.modelAvailable.findIndex((row) => row.populationId === "ORIGIN_VISIBLE_DYNAMIC_CORE80" &&
    row.modelId === "M2-WORK-LG01" && row.sliceType === "HORIZON" && row.sliceId === "3");
  const [removed] = input.crossModel.comparison.modelAvailable.splice(index, 1);
  assert.throws(() => projectPublicResearchSummary(input), /public_research_source_invalid:baseline_horizons/);
  input.crossModel.comparison.modelAvailable.push(removed, structuredClone(removed));
  assert.throws(() => projectPublicResearchSummary(input), /public_research_source_invalid:baseline_horizons/);
});

test("invalid numbers and inconsistent case coverage cannot become apparently valid public evidence", async () => {
  const input = await authorities();
  const evidence = input.crossModel.comparison.modelAvailable.find((row) => row.populationId === "ORIGIN_VISIBLE_DYNAMIC_CORE80" &&
    row.modelId === "M2-WORK-LG01" && row.sliceType === "HORIZON" && row.sliceId === "3");
  const originalWape = evidence.wape;
  evidence.wape = null;
  assert.throws(() => projectPublicResearchSummary(input), /public_research_source_invalid:wape/);
  evidence.wape = originalWape;
  evidence.coverage = 1;
  assert.throws(() => projectPublicResearchSummary(input), /public_research_source_invalid:case_coverage_reconciliation/);
});

test("public DTO excludes unrelated ledger, absolute-money, digest and runner properties", async () => {
  const input = await authorities();
  input.registry.unrelatedSecret = "DO_NOT_PROJECT_TEST_VALUE";
  input.independent.evaluation.metrics.r2.absoluteActualTotal = "DO_NOT_PROJECT_TEST_VALUE";
  input.crossModel.authority.sourceSnapshotHashes.extra = "DO_NOT_PROJECT_TEST_VALUE";
  const serialized = JSON.stringify(projectPublicResearchSummary(input));
  assert.doesNotMatch(serialized, /DO_NOT_PROJECT_TEST_VALUE|absoluteActualTotal|sourceSnapshotHashes|preResultEngineeringRecovery/);
  assert.match(serialized, /尚未证明稳定的按切片选模收益/);
});

test("source links resolve exact current public files while arbitrary paths and inherited object keys are refused", async () => {
  const summary = await getPublicResearchSummary();
  assert.equal(summary.sources.length, 5);
  for (const entry of summary.sources) {
    const result = await getPublicResearchSource(entry.id);
    assert.equal(result.path, entry.path);
    assert.equal(typeof result.body, "string");
    assert.equal(entry.href, `/api/m2/public/research-sources/${entry.id}`);
    assert.doesNotMatch(result.path, /^(?:[A-Z]:|\/)|\.\./i);
  }
  for (const id of ["../../.env", "data/private-input", "constructor", "toString", "__proto__", "current-state/../registry", null]) {
    assert.equal(await getPublicResearchSource(id), null);
  }
  const input = await authorities();
  input.registry.currentRoles.latestStateIndex = "../../.env";
  assert.throws(() => projectPublicResearchSummary(input), /public_research_source_invalid:current_state_path/);
});
