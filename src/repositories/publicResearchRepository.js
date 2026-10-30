import { readFile } from "node:fs/promises";
import { projectAcceptanceEvidence, projectFrozenResearchRoutes } from "./publicResearchAcceptance.js";

const ROOT = new URL("../../", import.meta.url);
const SOURCE_DEFINITIONS = {
  registry: { title: "模型登记表", path: "config/m2-model-registry.v1.json" },
  contract: { title: "业务验收合同 v1", path: "config/m2-business-acceptance-contract.v1.json" },
  "cross-model": {
    title: "Core80 全模型历史横评",
    path: "docs/analysis/m2-current/M2-core80-cross-model-real-business-evaluation-v0.1.json"
  },
  independent: {
    title: "头部保护尾段修正模型唯一独立评价",
    path: "docs/analysis/m2-current/M2-head-protected-tail-band-correction-independent-evaluation-v0.2.json"
  },
  "psc02-audit": {
    title: "起点可见现金锚模型：源权威与执行完整性审计",
    path: "docs/analysis/m2-current/M2-psc02-pr40-execution-completeness-and-source-authority-recovery-audit-v0.1.json"
  },
  "psc03-correction": {
    title: "直接现金尺度模型：当前结果权威纠正",
    path: "docs/analysis/m2-current/M2-psc03-result-authority-correction-v0.1.json"
  }
};
const POPULATION_ID = "ORIGIN_VISIBLE_DYNAMIC_CORE80";
const COMPARABLE_GROUP_ID = "CG-CMX01-DYNAMIC-CORE80-WORK-MODEL-AVAILABLE";
const CAMPAIGN_ID = "M2-EXP-CORE80-CROSS-MODEL-REAL-BUSINESS-EVALUATION-01";
const HORIZONS = [3, 6, 12, 36];

function requireValue(condition, reason) {
  if (!condition) throw new Error(`public_research_source_invalid:${reason}`);
}

function only(rows, reason) {
  requireValue(Array.isArray(rows) && rows.length === 1, reason);
  return rows[0];
}

function finite(value, reason) {
  requireValue(typeof value === "number" && Number.isFinite(value), reason);
  return value;
}

function count(value, reason) {
  requireValue(Number.isSafeInteger(value) && value >= 0, reason);
  return value;
}

function currentStatePath(registry) {
  const path = registry.currentRoles?.latestStateIndex;
  requireValue(
    typeof path === "string" && /^docs\/analysis\/m2-v2\/M2-v2-current-state-index-v\d+\.\d+\.md$/.test(path),
    "current_state_path"
  );
  return path;
}

function source(id, definition, asOf = null) {
  return { id, title: definition.title, path: definition.path, href: `/api/m2/public/research-sources/${id}`, asOf };
}

function modelIdentity(registry, id) {
  const model = only(registry.models.filter((item) => item.stableModelId === id), "model_identity");
  return { id: model.stableModelId, nameZh: model.displayNameZh, currentRole: model.currentRole };
}

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, ROOT), "utf8"));
}

// Projection is explicit: no ledger rows, absolute cash totals, input digests, or runner state.
// Exported separately so contracts can be tested without editing frozen authority files.
export function projectPublicResearchSummary({ registry, contract, crossModel, independent, psc02Audit, psc03Correction }) {
  requireValue(Array.isArray(registry.models) && Array.isArray(registry.experiments), "registry");
  const statePath = currentStatePath(registry);
  const baseline = modelIdentity(registry, registry.currentRoles.researchWorkBaseline);
  const fallback = modelIdentity(registry, registry.currentRoles.operationalWorkFallback);
  const campaign = only(registry.experiments.filter((item) => item.experimentId === CAMPAIGN_ID), "campaign");
  const comparisonGroup = only(registry.comparabilityGroups.filter((item) => item.comparableGroupId === COMPARABLE_GROUP_ID), "comparison_group");
  requireValue(comparisonGroup.comparisonClass === "STANDALONE_ONLY", "comparison_class");
  requireValue(contract.populations?.primary?.populationId === "CORE80" &&
    contract.businessUsability?.decisionPopulationId === "CORE80", "decision_population_consistency");
  requireValue(crossModel.schema === "m2.cmx01.public_evaluation.v0.1" && crossModel.campaignId === "M2-CMX01", "campaign_identity");
  requireValue(typeof contract.scope?.actualDefinitionId === "string" && contract.scope.actualDefinitionId.length > 0 &&
    crossModel.authority?.actualDefinitionId === contract.scope.actualDefinitionId &&
    comparisonGroup.actualDefinition === contract.scope.actualDefinitionId, "actual_definition_consistency");
  requireValue(comparisonGroup.grain === "work_origin_horizon" &&
    comparisonGroup.target === contract.scope.target &&
    comparisonGroup.populationId === "cmx01-origin-visible-dynamic-core80-model-available" &&
    comparisonGroup.evaluationFamily === "cmx01_historical_model_available_coverage_diagnostic" &&
    comparisonGroup.asOfContract === "2020_2025_all_legal_monthly_origins_model_specific_coverage_origin_visible_dynamic_core80" &&
    Array.isArray(comparisonGroup.horizons) && comparisonGroup.horizons.length === HORIZONS.length &&
    HORIZONS.every((months) => comparisonGroup.horizons.filter((value) => value === months).length === 1), "comparison_basis_consistency");
  const contractHorizons = contract.businessUsability?.horizons;
  requireValue(Array.isArray(contractHorizons) && contractHorizons.length === HORIZONS.length, "horizon_contract");
  const available = crossModel.comparison?.modelAvailable;
  requireValue(Array.isArray(available), "model_available");
  const rows = available.filter((row) => row.populationId === POPULATION_ID && row.modelId === baseline.id &&
    row.modelVariantId === `${baseline.id}/LEARNED_GLOBAL_COMMON_REVERSAL` && row.sliceType === "HORIZON");
  requireValue(rows.length === HORIZONS.length, "baseline_horizons");
  const horizons = HORIZONS.map((months) => {
    const row = only(rows.filter((item) => item.sliceId === String(months)), `baseline_h${months}`);
    const limit = only(contractHorizons.filter((item) => item.horizonMonths === months), `contract_h${months}`);
    const wape = finite(row.wape, "wape");
    requireValue(wape >= 0, "wape");
    const signedBias = finite(row.signedBias, "signed_bias");
    const caseCount = count(row.caseCount, "case_count");
    const expectedCaseCount = count(row.expectedCaseCount, "expected_case_count");
    const caseCoverage = finite(row.coverage, "case_coverage");
    requireValue(expectedCaseCount > 0 && caseCount <= expectedCaseCount &&
      Math.abs(caseCoverage - caseCount / expectedCaseCount) < 1e-12, "case_coverage_reconciliation");
    const limits = {
      wape: finite(limit.maximumWape, "wape_limit"),
      absoluteSignedBias: finite(limit.maximumAbsoluteSignedBias, "bias_limit")
    };
    const wapeWithinLimit = wape <= limits.wape;
    const biasWithinLimit = Math.abs(signedBias) <= limits.absoluteSignedBias;
    return {
      months, wape, signedBias, caseCoverage, caseCount, expectedCaseCount,
      workCount: count(row.workCount, "work_count"),
      revenueAmountCoverage: null,
      revenueAmountCoverageStatus: "NOT_DISCLOSED",
      limits,
      numericComparison: {
        status: wapeWithinLimit && biasWithinLimit ? "WITHIN_TWO_NUMERIC_LIMITS" : "NUMERIC_LIMIT_EXCEEDED",
        labelZh: wapeWithinLimit && biasWithinLimit ? "两项数值在阈值内" :
          wapeWithinLimit ? "误差在阈值内，偏差超限" : biasWithinLimit ? "误差超限，偏差在阈值内" : "误差与偏差均超限",
        wapeWithinLimit, biasWithinLimit
      },
      businessGate: { status: "NOT_ESTABLISHED_BY_THIS_SUMMARY", labelZh: "完整验收仍需其余证据" },
      historicalNonProspective: months === 36,
      sourceIds: ["cross-model", "contract", "current-state"]
    };
  });

  const evaluation = independent.evaluation;
  requireValue(evaluation?.modelId === independent.model?.stableModelId, "independent_model");
  const confidence = evaluation.metrics?.bootstrapFva95;
  const lower = finite(confidence?.interval95?.lower, "confidence_lower");
  const upper = finite(confidence?.interval95?.upper, "confidence_upper");
  requireValue(lower <= upper, "confidence_order");
  const workTotal = contract.grainGates?.workTotalGate;
  const workChannel = contract.grainGates?.workChannelGate;
  requireValue(workTotal?.grain === "WORK_TOTAL" && workChannel?.grain === "WORK_CHANNEL", "grains");
  requireValue(typeof campaign.productionReady === "boolean", "production_ready");
  const permissions = {};
  for (const name of ["production", "automation", "release"]) {
    requireValue(typeof contract.authorization?.[name] === "boolean", `permission_${name}`);
    permissions[name] = contract.authorization[name];
  }
  return {
    schemaVersion: "1",
    dataKind: "PUBLIC_FROZEN_RESEARCH",
    sources: [
      source("current-state", { title: "当前状态索引", path: statePath }),
      source("registry", SOURCE_DEFINITIONS.registry, registry.asOf),
      source("contract", SOURCE_DEFINITIONS.contract, contract.asOf),
      source("cross-model", SOURCE_DEFINITIONS["cross-model"], crossModel.asOf),
      source("independent", SOURCE_DEFINITIONS.independent, independent.asOf),
      source("psc02-audit", SOURCE_DEFINITIONS["psc02-audit"], psc02Audit?.asOf),
      source("psc03-correction", SOURCE_DEFINITIONS["psc03-correction"], psc03Correction?.asOf)
    ],
    roles: {
      researchBaseline: baseline, operationalFallback: fallback,
      activeCandidate: registry.currentRoles.activeCandidate,
      approvedForAutomation: registry.currentRoles.approvedForAutomation,
      productionReady: campaign.productionReady,
      currentStatePath: statePath
    },
    permissions,
    scope: {
      labelZh: registry.targetAuthority.displayNameZh,
      target: contract.scope.target,
      actualDefinitionId: contract.scope.actualDefinitionId,
      minimumCompleteBillMonthsAtOrigin: contract.scope.minimumCompleteBillMonthsAtOrigin,
      coreRecomputedAtEveryOrigin: contract.scope.coreRecomputedAtEveryOrigin,
      primaryPopulationId: contract.populations.primary.populationId,
      sensitivityPopulationId: contract.populations.sensitivity.populationId,
      excluded: [...contract.scope.excluded],
      horizons: [...HORIZONS]
    },
    grainGates: {
      workTotal: {
        grain: workTotal.grain, status: workTotal.status, labelZh: "作品总额 · 仅开发验收口径",
        horizons: [...workTotal.horizonMonths],
        historicalEvidenceCaveat: workTotal.h36HistoricalEvidenceCaveat,
        historicalEvidenceCaveatZh: "36 个月为历史多起点证据，尚未形成前瞻验证"
      },
      workChannel: {
        grain: workChannel.grain, status: workChannel.status, labelZh: "作品×渠道 · 部分证据，未激活",
        horizons: [...workChannel.horizonMonths], reason: workChannel.reason,
        missingCaseCount: workChannel.missingCaseCount, missingComponentCount: workChannel.missingComponentCount,
        workTotalBaselineAffected: workChannel.workTotalBaselineAffected
      }
    },
    baselineSummary: {
      model: baseline, populationId: POPULATION_ID, comparableGroupId: COMPARABLE_GROUP_ID,
      comparisonClass: comparisonGroup.comparisonClass,
      actualDefinitionId: comparisonGroup.actualDefinition,
      evidenceStatus: "HISTORICAL_NUMERIC_COMPARISON_NOT_FULL_BUSINESS_ACCEPTANCE",
      labelZh: "同一研究基线的历史摘要与合同阈值对照", horizons
    },
    acceptanceEvidence: projectAcceptanceEvidence({ horizons, contract, baseline }),
    researchRoutes: projectFrozenResearchRoutes({ registry, independent, psc02Audit, psc03Correction }),
    latestIndependentEvaluation: {
      model: modelIdentity(registry, independent.model.stableModelId),
      status: independent.status,
      labelZh: "证据不足，现金历史相邻研究已结束",
      origin: evaluation.origin, months: evaluation.horizonMonths,
      workCount: count(evaluation.workCount, "independent_work_count"),
      relativeFva: finite(evaluation.metrics.relativeFva, "relative_fva"),
      bootstrap: { iterations: count(confidence.iterations, "bootstrap_iterations"), lower, upper, crossesZero: lower <= 0 && upper >= 0 },
      completedResultCount: independent.execution.completeIndependentResultCount,
      secondOriginExecuted: independent.execution.secondIndependentOriginExecuted,
      cashOnlyResearchEnded: independent.governance.cashOnlyResearchEnded,
      sourceIds: ["registry", "independent", "current-state"]
    },
    historicalEvaluation: {
      id: crossModel.campaignId, nameZh: crossModel.displayNameZh, status: crossModel.status,
      historicalChampionStatus: crossModel.historicalChampionStatus,
      modelCount: crossModel.authority.formalEligibleRegisteredModelCount,
      variantCount: crossModel.authority.formalEvaluationVariantCount,
      originCount: crossModel.universe.origins,
      frozenDecisionCode: crossModel.conclusions.decision,
      currentInterpretationZh: "历史切片排名不同，尚未证明稳定的按切片选模收益",
      interpretationSourceId: "current-state"
    },
    caveats: [
      "LG01 摘要仅包含该模型自身有合法预测的动态 Core80 案例，不是全模型共同同案。",
      "案例覆盖率不能替代收入金额覆盖率；金额覆盖率未披露。",
      "两项数值在阈值内不等于完整业务门禁通过；稳定性与不确定性仍须分别判断。",
      "36 个月为历史多起点证据，尚未形成前瞻验证。",
      "作品总额与作品×渠道分别验收，不能用部分渠道证据反推作品总额通过。",
      "买断、未来新增作品、新渠道和核心范围外尾部不计作零预测；60 个月不属于当前 M2 输出。"
    ]
  };
}

export async function getPublicResearchSummary() {
  const [registry, contract, crossModel, independent, psc02Audit, psc03Correction] = await Promise.all([
    readJson(SOURCE_DEFINITIONS.registry.path), readJson(SOURCE_DEFINITIONS.contract.path),
    readJson(SOURCE_DEFINITIONS["cross-model"].path), readJson(SOURCE_DEFINITIONS.independent.path),
    readJson(SOURCE_DEFINITIONS["psc02-audit"].path), readJson(SOURCE_DEFINITIONS["psc03-correction"].path)
  ]);
  return projectPublicResearchSummary({ registry, contract, crossModel, independent, psc02Audit, psc03Correction });
}

export async function getPublicResearchSource(id) {
  if (typeof id !== "string" || ![...Object.keys(SOURCE_DEFINITIONS), "current-state"].includes(id)) return null;
  const definition = id === "current-state"
    ? { title: "当前状态索引", path: currentStatePath(await readJson(SOURCE_DEFINITIONS.registry.path)) }
    : SOURCE_DEFINITIONS[id];
  return {
    title: definition.title, path: definition.path,
    contentType: definition.path.endsWith(".json") ? "application/json; charset=utf-8" : "text/plain; charset=utf-8",
    body: await readFile(new URL(definition.path, ROOT), "utf8")
  };
}
