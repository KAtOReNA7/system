import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getPublicResearchSource, getPublicResearchSummary, projectPublicResearchSummary } from "../src/repositories/publicResearchRepository.js";

async function authorities() {
  const paths = {
    registry: "config/m2-model-registry.v1.json",
    contract: "config/m2-business-acceptance-contract.v1.json",
    crossModel: "docs/analysis/m2-current/M2-core80-cross-model-real-business-evaluation-v0.1.json",
    independent: "docs/analysis/m2-current/M2-head-protected-tail-band-correction-independent-evaluation-v0.2.json",
    psc02Audit: "docs/analysis/m2-current/M2-psc02-pr40-execution-completeness-and-source-authority-recovery-audit-v0.1.json",
    psc03Correction: "docs/analysis/m2-current/M2-psc03-result-authority-correction-v0.1.json"
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

test("different actual definitions or comparison bases cannot be relabeled as this historical summary", async () => {
  const findGroup = (input) => input.registry.comparabilityGroups.find((entry) =>
    entry.comparableGroupId === "CG-CMX01-DYNAMIC-CORE80-WORK-MODEL-AVAILABLE");
  for (const mutate of [
    (input) => { input.crossModel.authority.actualDefinitionId = "OTHER_ACTUAL"; },
    (input) => { input.contract.populations.primary.populationId = "CORE90"; },
    (input) => { input.contract.businessUsability.decisionPopulationId = "CORE90"; },
    (input) => { delete input.contract.scope.actualDefinitionId; },
    (input) => { findGroup(input).actualDefinition = "OTHER_ACTUAL"; },
    (input) => { findGroup(input).grain = "work_channel"; },
    (input) => { findGroup(input).horizons = [3, 6, 12, 12]; },
    (input) => { findGroup(input).asOfContract = "OTHER_WINDOW"; },
    (input) => { input.crossModel.campaignId = "OTHER_CAMPAIGN"; }
  ]) {
    const input = await authorities();
    mutate(input);
    assert.throws(() => projectPublicResearchSummary(input), /public_research_source_invalid:/);
  }
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
  assert.equal(summary.sources.length, 7);
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

test("acceptance matrix preserves eight separate horizon/grain decisions and never borrows work totals for channels", async () => {
  const input = await authorities();
  const summary = projectPublicResearchSummary(input);
  assert.equal(summary.schemaVersion, "1");
  assert.equal(summary.acceptanceEvidence.readOnly, true);
  const { rows } = summary.acceptanceEvidence;
  assert.deepEqual(rows.map((row) => [row.horizonMonths, row.grain]),
    [3, 6, 12, 36].flatMap((months) => [[months, "WORK_TOTAL"], [months, "WORK_CHANNEL"]]));
  assert.equal(new Set(rows.map((row) => `${row.horizonMonths}/${row.grain}`)).size, 8);
  for (const row of rows) {
    assert.ok(row.basisId && row.basisLabelZh && Object.keys(row.fieldPaths).length > 0);
    for (const metric of ["amountCoverage", "stability", "uncertainty"]) {
      assert.equal(row.metrics[metric].value, null);
      assert.equal(row.metrics[metric].limit, null);
    }
    assert.equal(row.metrics.amountCoverage.status, "NOT_DISCLOSED");
    assert.equal(row.metrics.stability.status, "NOT_AVAILABLE_FOR_THIS_SUMMARY");
    assert.equal(row.metrics.uncertainty.status, "NOT_AVAILABLE_FOR_THIS_SUMMARY");
    assert.ok(row.sourceIds.every((id) => summary.sources.some((source) => source.id === id)));
    if (row.grain === "WORK_TOTAL") {
      const original = summary.baselineSummary.horizons.find((entry) => entry.months === row.horizonMonths);
      assert.equal(row.metrics.wape.value, original.wape);
      assert.equal(row.metrics.signedBias.value, original.signedBias);
      assert.equal(row.metrics.wape.limit, original.limits.wape);
      assert.equal(row.metrics.signedBias.limit, original.limits.absoluteSignedBias);
      assert.equal(row.acceptance.status, "NOT_ESTABLISHED_BY_THIS_SUMMARY");
      assert.equal(Object.hasOwn(row, "missingCaseCount"), false);
    } else {
      for (const metric of Object.values(row.metrics)) assert.equal(metric.value, null);
      assert.equal(row.metrics.wape.limit, null);
      assert.equal(row.metrics.signedBias.limit, null);
      assert.equal(row.acceptance.status, row.horizonMonths === 36 ? "PARTIAL_NOT_ACTIVE" : "NO_ACTIVE_HORIZON_GATE");
      assert.equal(row.missingCaseCount, row.horizonMonths === 36 ? 633 : null);
      assert.equal(row.missingComponentCount, row.horizonMonths === 36 ? 914 : null);
    }
  }
  assert.equal(rows[0].metrics.wape.status, "WITHIN_NUMERIC_LIMIT");
  assert.equal(rows[0].metrics.signedBias.status, "NUMERIC_LIMIT_EXCEEDED");
});

test("contract reference evidence and attractive numeric scores cannot manufacture a matrix pass or fill missing evidence", async () => {
  const input = await authorities();
  for (const row of input.crossModel.comparison.modelAvailable) {
    if (row.populationId === "ORIGIN_VISIBLE_DYNAMIC_CORE80" && row.modelId === "M2-WORK-LG01" && row.sliceType === "HORIZON") {
      row.wape = 0;
      row.signedBias = 0;
      // Unsupported extra fields must not become evidence merely by appearing in an input object.
      row.revenueAmountCoverage = row.coverage;
      row.stability = "PASS";
      row.uncertainty = [0.01, 0.02];
    }
  }
  input.contract.h36Evidence.h36Activated = true;
  input.contract.h36Evidence.independentTimeEvidenceStatus = "DO_NOT_IMPORT_OTHER_WINDOW";
  input.contract.h36Evidence.aggregateAuthority.CORE80.perOriginWapeP10P50P90 = { p10: 0, p50: 0, p90: 0 };
  const summary = projectPublicResearchSummary(input);
  for (const row of summary.acceptanceEvidence.rows.filter((entry) => entry.grain === "WORK_TOTAL")) {
    assert.equal(row.metrics.wape.status, "WITHIN_NUMERIC_LIMIT");
    assert.equal(row.metrics.signedBias.status, "WITHIN_NUMERIC_LIMIT");
    assert.equal(row.acceptance.status, "NOT_ESTABLISHED_BY_THIS_SUMMARY");
    for (const key of ["amountCoverage", "stability", "uncertainty"]) assert.equal(row.metrics[key].value, null);
  }
  assert.doesNotMatch(JSON.stringify(summary), /DO_NOT_IMPORT_OTHER_WINDOW|perOriginWapeP10P50P90/);
});

test("missing or duplicated grain contracts and missing channel counts fail closed", async () => {
  for (const mutate of [
    (input) => { input.contract.grainGates.workTotalGate.horizonMonths = [3, 6, 12, 12]; },
    (input) => { input.contract.grainGates.workChannelGate.horizonMonths = [3, 6, 12, 36]; },
    (input) => { input.contract.grainGates.workChannelGate.status = "ACTIVE"; },
    (input) => { delete input.contract.grainGates.workChannelGate.missingComponentCount; },
    (input) => { delete input.contract.grainGates.workChannelGate.completeH36ValidationClaimAllowed; },
    (input) => { input.contract.businessUsability.horizons[1] = structuredClone(input.contract.businessUsability.horizons[0]); }
  ]) {
    const input = await authorities();
    mutate(input);
    assert.throws(() => projectPublicResearchSummary(input), /public_research_source_invalid:/);
  }
});

test("three frozen research routes distinguish absent results, invalid evidence and an inconclusive independent result", async () => {
  const input = await authorities();
  const original = JSON.stringify(input);
  const summary = projectPublicResearchSummary(input);
  assert.equal(JSON.stringify(input), original, "projection must not edit frozen input objects");
  const routes = summary.researchRoutes;
  assert.deepEqual(routes.map((route) => route.modelId), ["M2-CHAN-PSC02", "M2-CHAN-PSC03", "M2-WORK-HPSR02"]);
  const [psc02, psc03, hpsr02] = routes;
  assert.equal(psc02.currentStatus.code, input.psc02Audit.currentStatuses.sourceAuthority);
  assert.deepEqual(psc02.detailStatuses.map((entry) => entry.code), [
    input.psc02Audit.currentStatuses.executionCompleteness, input.psc02Audit.currentStatuses.modelPerformanceEvidence
  ]);
  assert.equal(psc02.historicalStatus.code, "PSC02_DEVELOPMENT_NOT_SUPPORTED");
  assert.equal(psc03.currentStatus.code, input.psc03Correction.currentStatus);
  assert.equal(psc03.historicalStatus.code, input.psc03Correction.historicalResult.status);
  assert.notEqual(psc03.currentStatus.code, psc03.historicalStatus.code);
  assert.equal(psc03.validForCandidateDecision, false);
  assert.equal(psc03.detailStatuses[1].code, input.psc03Correction.scientificHypothesisStatus);
  assert.equal(hpsr02.currentStatus.code, input.independent.status);
  assert.equal(hpsr02.resultFrozen, true);
  assert.equal(hpsr02.completeIndependentResultCount, 1);
  assert.equal(hpsr02.cashOnlyResearchEnded, true);
  assert.equal(hpsr02.secondIndependentOriginExecuted, false);
  for (const route of routes) {
    assert.ok(route.nameZh && route.experimentNameZh && route.summaryZh && route.boundaryZh);
    assert.ok(route.sourceIds.every((id) => summary.sources.some((source) => source.id === id)));
    assert.ok(Object.keys(route.fieldPaths).length >= 3);
    assert.equal(Object.hasOwn(route, "metrics"), false, "frozen nonconforming scores are not promoted into a leaderboard");
  }
});

test("research route identity or authority conflicts fail closed instead of reporting a stale state", async () => {
  const findExperiment = (input, suffix) => input.registry.experiments.find((entry) => entry.experimentId.endsWith(suffix));
  for (const mutate of [
    (input) => { delete input.psc02Audit; },
    (input) => { input.registry.models.push(structuredClone(input.registry.models.find((row) => row.stableModelId === "M2-CHAN-PSC02"))); },
    (input) => { input.registry.experiments.push(structuredClone(findExperiment(input, "DIRECT-CASH-03"))); },
    (input) => { delete findExperiment(input, "CASH-ANCHOR-02").executionCompletenessStatus; },
    (input) => { input.psc02Audit.currentStatuses.modelPerformanceEvidence = "MODEL_PASSED"; },
    (input) => { delete input.psc03Correction.currentStatus; },
    (input) => { input.psc03Correction.authorityEffect.validForCandidateDecision = true; },
    (input) => { input.psc03Correction.authorityEffect.replayAuthorized = true; },
    (input) => { input.psc03Correction.historicalResult.historicalInterpretationStillCurrent = true; },
    (input) => { input.independent.governance.cashOnlyResearchEnded = false; },
    (input) => { input.independent.execution.completeIndependentResultCount = 2; },
    (input) => { delete findExperiment(input, "TAIL-BAND-CORRECTION-02").resultFrozen; }
  ]) {
    const input = await authorities();
    mutate(input);
    assert.throws(() => projectPublicResearchSummary(input), /public_research_source_invalid:/);
  }
});
