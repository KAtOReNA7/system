const HORIZONS = [3, 6, 12, 36];
const BASIS_ID = "CG-CMX01-DYNAMIC-CORE80-WORK-MODEL-AVAILABLE";

function requireValue(condition, reason) {
  if (!condition) throw new Error(`public_research_source_invalid:${reason}`);
}

function only(rows, reason) {
  requireValue(Array.isArray(rows) && rows.length === 1, reason);
  return rows[0];
}

function textValue(value, reason) {
  requireValue(typeof value === "string" && value.trim().length > 0, reason);
  return value;
}

function missingMetric(status, labelZh) {
  return { value: null, limit: null, status, labelZh };
}

function numericMetric(value, limit, absolute = false) {
  requireValue(typeof value === "number" && Number.isFinite(value), "acceptance_metric_value");
  requireValue(absolute || value >= 0, "acceptance_wape_negative");
  requireValue(typeof limit === "number" && Number.isFinite(limit) && limit >= 0, "acceptance_metric_limit");
  const within = (absolute ? Math.abs(value) : value) <= limit;
  return {
    value, limit,
    status: within ? "WITHIN_NUMERIC_LIMIT" : "NUMERIC_LIMIT_EXCEEDED",
    labelZh: within ? "本项数值在上限内" : "本项数值超出上限"
  };
}

// This matrix projects one existing summary. It neither evaluates models nor joins
// the contract's separate 13-origin H36 window into the cross-model evidence.
export function projectAcceptanceEvidence({ horizons, contract, baseline }) {
  const workTotal = contract.grainGates?.workTotalGate;
  const workChannel = contract.grainGates?.workChannelGate;
  requireValue(workTotal?.grain === "WORK_TOTAL" && workChannel?.grain === "WORK_CHANNEL", "acceptance_grains");
  requireValue(Array.isArray(workTotal.horizonMonths) &&
    workTotal.horizonMonths.length === HORIZONS.length &&
    HORIZONS.every((months) => workTotal.horizonMonths.filter((value) => value === months).length === 1),
  "acceptance_work_total_horizons");
  requireValue(Array.isArray(workChannel.horizonMonths) && workChannel.horizonMonths.length === 1 &&
    workChannel.horizonMonths[0] === 36 && workChannel.status === "PARTIAL_NOT_ACTIVE" &&
    workChannel.completeH36ValidationClaimAllowed === false, "acceptance_work_channel_contract");
  for (const key of ["missingCaseCount", "missingComponentCount"]) {
    requireValue(Number.isSafeInteger(workChannel[key]) && workChannel[key] >= 0, `acceptance_${key}`);
  }
  requireValue(Array.isArray(horizons) && horizons.length === HORIZONS.length, "acceptance_horizons");
  const rows = HORIZONS.flatMap((horizonMonths) => {
    const row = only(horizons.filter((entry) => entry.months === horizonMonths), `acceptance_h${horizonMonths}`);
    const wape = numericMetric(row.wape, row.limits.wape);
    const signedBias = numericMetric(row.signedBias, row.limits.absoluteSignedBias, true);
    const numericSatisfied = wape.status === "WITHIN_NUMERIC_LIMIT" && signedBias.status === "WITHIN_NUMERIC_LIMIT";
    const selector = `comparison.modelAvailable[populationId=ORIGIN_VISIBLE_DYNAMIC_CORE80,modelVariantId=${baseline.id}/LEARNED_GLOBAL_COMMON_REVERSAL,sliceType=HORIZON,sliceId=${horizonMonths}]`;
    const total = {
      horizonMonths, grain: "WORK_TOTAL",
      basisId: BASIS_ID,
      basisLabelZh: `${baseline.nameZh}自身合法预测的动态 Core80 作品总额历史摘要`,
      metrics: {
        wape, signedBias,
        amountCoverage: missingMetric("NOT_DISCLOSED", "收入金额覆盖率未披露"),
        stability: missingMetric("NOT_AVAILABLE_FOR_THIS_SUMMARY", "缺少本周期同口径的逐起点稳定性证据"),
        uncertainty: missingMetric("NOT_AVAILABLE_FOR_THIS_SUMMARY", "未披露本周期同口径的不确定性区间")
      },
      acceptance: {
        status: "NOT_ESTABLISHED_BY_THIS_SUMMARY",
        labelZh: numericSatisfied ? "数值对照满足两项上限，完整验收未成立" :
          wape.status === "WITHIN_NUMERIC_LIMIT" ? "偏差超限，完整验收未成立" : "数值超限，完整验收未成立"
      },
      historicalNonProspective: horizonMonths === 36,
      sourceIds: ["cross-model", "contract", "current-state"],
      fieldPaths: {
        wape: `${selector}.wape`, signedBias: `${selector}.signedBias`,
        limits: `businessUsability.horizons[horizonMonths=${horizonMonths}]`,
        evidenceBoundary: "当前状态索引：LG01 四周期作品总额摘要与合同阈值对照"
      }
    };
    const registered = workChannel.horizonMonths.includes(horizonMonths);
    const channel = {
      horizonMonths, grain: "WORK_CHANNEL",
      basisId: "M2-BUSINESS-ACCEPTANCE-CONTRACT-V1-WORK-CHANNEL",
      basisLabelZh: "业务验收合同中的作品×渠道门禁登记；不借用作品总额指标",
      metrics: {
        wape: missingMetric("NOT_AVAILABLE_FOR_THIS_GRAIN", "本粒度没有可用于本矩阵的误差值"),
        signedBias: missingMetric("NOT_AVAILABLE_FOR_THIS_GRAIN", "本粒度没有可用于本矩阵的偏差值"),
        amountCoverage: missingMetric("NOT_DISCLOSED", "收入金额覆盖率未披露"),
        stability: missingMetric("NOT_AVAILABLE_FOR_THIS_SUMMARY", "缺少本周期同口径的逐起点稳定性证据"),
        uncertainty: missingMetric("NOT_AVAILABLE_FOR_THIS_SUMMARY", "未披露本周期同口径的不确定性区间")
      },
      acceptance: {
        status: registered ? workChannel.status : "NO_ACTIVE_HORIZON_GATE",
        labelZh: registered ? "部分渠道证据，门禁未激活" : "本周期尚无已登记的渠道验收门禁"
      },
      missingCaseCount: registered ? workChannel.missingCaseCount : null,
      missingComponentCount: registered ? workChannel.missingComponentCount : null,
      sourceIds: ["contract", "current-state"],
      fieldPaths: {
        grainGate: "grainGates.workChannelGate",
        registeredHorizons: "grainGates.workChannelGate.horizonMonths",
        ...(registered ? {
          missingCaseCount: "grainGates.workChannelGate.missingCaseCount",
          missingComponentCount: "grainGates.workChannelGate.missingComponentCount"
        } : {})
      }
    };
    return [total, channel];
  });
  return { labelZh: "四周期、两粒度验收证据矩阵", readOnly: true, rows };
}

const STATUS_LABELS = {
  PSC02_HISTORICAL_REPLAY_BLOCKED_NO_RECOVERABLE_ORIGIN_VISIBLE_CASH_AUTHORITY: "历史起点可见现金权威不可恢复，重放阻断",
  PSC02_EXECUTION_IMPLEMENTATION_INCOMPLETE_NO_CANDIDATE_RESULT: "真实执行实现不完整，没有候选结果",
  NO_MODEL_PERFORMANCE_EVIDENCE: "没有模型性能证据",
  PSC02_DEVELOPMENT_NOT_SUPPORTED: "历史预测前尝试停止；不是模型性能结论",
  PSC03_IMPLEMENTATION_CONTRACT_MISMATCH_CONFIRMED: "实现与预注册合同不一致已确认",
  PSC03_FROZEN_RAW_PRESERVED_BUT_NOT_VALID_CANDIDATE_PERFORMANCE_EVIDENCE: "冻结原始结果保留，但不是有效候选性能证据",
  DIRECT_CASH_SCALE_HYPOTHESIS_NOT_ADJUDICATED_BY_CONFORMING_IMPLEMENTATION: "直接现金尺度假设尚未被符合合同的实现裁决",
  NO_SUCCESSOR_OR_REPLAY_AUTHORIZED: "未授权重放或后继模型",
  PSC03_DEVELOPMENT_NOT_SUPPORTED: "历史开发不支持结果保留；已不作为现行候选性能判定",
  M2_HPSR02_FIRST_INDEPENDENT_INCONCLUSIVE_CASH_ONLY_RESEARCH_ENDED: "唯一独立评价证据不足，现金历史相邻研究结束"
};

function status(code) {
  requireValue(typeof code === "string" && Object.hasOwn(STATUS_LABELS, code), "research_route_status");
  return { code, labelZh: STATUS_LABELS[code] };
}

function routeIdentity(registry, modelId, experimentId) {
  const model = only(registry.models.filter((entry) => entry.stableModelId === modelId), "research_route_model");
  const experiment = only(registry.experiments.filter((entry) => entry.experimentId === experimentId), "research_route_experiment");
  requireValue(Array.isArray(experiment.modelIds) && experiment.modelIds.includes(modelId), "research_route_membership");
  requireValue(model.automationAuthorized === false && model.productionImported === false && model.finalHoldoutOpened === false,
    "research_route_activation");
  return {
    experiment,
    route: {
      modelId, nameZh: textValue(model.displayNameZh, "research_route_name"),
      experimentId, experimentNameZh: textValue(experiment.displayNameZh, "research_route_experiment_name"),
      currentRole: textValue(model.currentRole, "research_route_role"),
      evidenceStatus: textValue(model.evidenceStatus, "research_route_evidence"),
      operationalStatus: textValue(model.operationalStatus, "research_route_operational")
    }
  };
}

export function projectFrozenResearchRoutes({ registry, independent, psc02Audit, psc03Correction }) {
  const psc02 = routeIdentity(registry, "M2-CHAN-PSC02", "M2-EXP-PUBLISHING-SCALE-CHANNEL-CASH-ANCHOR-02");
  const psc03 = routeIdentity(registry, "M2-CHAN-PSC03", "M2-EXP-PUBLISHING-SCALE-CHANNEL-DIRECT-CASH-03");
  const hpsr02 = routeIdentity(registry, "M2-WORK-HPSR02", "M2-EXP-LG01-HEAD-PROTECTED-TAIL-BAND-CORRECTION-02");
  requireValue(psc02Audit?.modelId === psc02.route.modelId && psc02Audit.experimentId === psc02.route.experimentId,
    "psc02_authority_identity");
  requireValue(psc02.experiment.resultStatus === psc02Audit.currentStatuses?.sourceAuthority &&
    psc02Audit.status === psc02Audit.currentStatuses?.sourceAuthority &&
    psc02.experiment.executionCompletenessStatus === psc02Audit.currentStatuses?.executionCompleteness &&
    psc02.experiment.modelPerformanceEvidenceStatus === psc02Audit.currentStatuses?.modelPerformanceEvidence &&
    psc02.experiment.realPredictionGenerated === false && psc02.experiment.evaluationExecuted === false,
  "psc02_authority_consistency");
  requireValue(psc03Correction?.modelId === psc03.route.modelId && psc03Correction.experimentId === psc03.route.experimentId,
    "psc03_authority_identity");
  requireValue(psc03.experiment.currentAuthorityStatus === psc03Correction.currentStatus &&
    psc03.experiment.frozenRawStatus === psc03Correction.frozenRawStatus &&
    psc03.experiment.scientificHypothesisStatus === psc03Correction.scientificHypothesisStatus &&
    psc03.experiment.successorStatus === psc03Correction.successorStatus &&
    psc03.experiment.resultStatus === psc03Correction.historicalResult?.status &&
    psc03Correction.historicalResult.historicalInterpretationStillCurrent === false &&
    psc03.experiment.validForCandidateDecision === false && psc03Correction.authorityEffect?.validForCandidateDecision === false &&
    psc03Correction.authorityEffect.modelPerformanceClaimAllowed === false &&
    psc03Correction.authorityEffect.directCashScaleHypothesisAdjudicated === false &&
    psc03Correction.authorityEffect.replayAuthorized === false && psc03Correction.authorityEffect.successorAuthorized === false,
  "psc03_authority_consistency");
  requireValue(independent?.model?.stableModelId === hpsr02.route.modelId &&
    hpsr02.experiment.resultStatus === independent.status && hpsr02.experiment.resultFrozen === true &&
    hpsr02.experiment.completeIndependentResultCount === 1 && independent.execution?.completeIndependentResultCount === 1 &&
    hpsr02.experiment.cashOnlyResearchEnded === true && independent.governance?.cashOnlyResearchEnded === true &&
    hpsr02.experiment.secondIndependentOriginExecuted === false && independent.execution.secondIndependentOriginExecuted === false &&
    independent.governance.secondConfirmationAuthorizedNow === false,
  "hpsr02_authority_consistency");
  return [
    {
      ...psc02.route,
      currentStatus: status(psc02.experiment.resultStatus),
      historicalStatus: status(psc02.experiment.historicalAttemptStatus),
      detailStatuses: [status(psc02.experiment.executionCompletenessStatus), status(psc02.experiment.modelPerformanceEvidenceStatus)],
      summaryZh: "历史起点现金权威不可恢复；真实候选成功路径未实现；没有模型性能证据。",
      boundaryZh: "保留预测前停止记录；不能补造历史快照、重放或将公共数学核心解释为端到端模型结果。",
      sourceIds: ["registry", "psc02-audit", "current-state"],
      fieldPaths: {
        registry: `experiments[experimentId=${psc02.route.experimentId}]`,
        currentStatus: "currentStatuses.sourceAuthority", implementation: "currentStatuses.executionCompleteness",
        performanceEvidence: "currentStatuses.modelPerformanceEvidence"
      }
    },
    {
      ...psc03.route,
      currentStatus: status(psc03.experiment.currentAuthorityStatus),
      historicalStatus: status(psc03.experiment.resultStatus),
      detailStatuses: [status(psc03.experiment.frozenRawStatus), status(psc03.experiment.scientificHypothesisStatus), status(psc03.experiment.successorStatus)],
      validForCandidateDecision: psc03.experiment.validForCandidateDecision,
      summaryZh: "冻结原始结果真实，但实现与预注册合同不一致，不能作为有效候选性能证据；直接现金尺度假设尚未被符合合同的实现裁决。",
      boundaryZh: "历史指标、原始结果和停止记录保持冻结；不重放，不补造折内状态，不创建修正版或后继模型。",
      sourceIds: ["registry", "psc03-correction", "current-state"],
      fieldPaths: {
        registry: `experiments[experimentId=${psc03.route.experimentId}]`,
        currentStatus: "currentStatus", historicalStatus: "historicalResult.status",
        evidenceValidity: "authorityEffect.validForCandidateDecision", hypothesis: "scientificHypothesisStatus",
        successor: "successorStatus"
      }
    },
    {
      ...hpsr02.route,
      currentStatus: status(hpsr02.experiment.resultStatus), historicalStatus: null, detailStatuses: [],
      resultFrozen: hpsr02.experiment.resultFrozen,
      completeIndependentResultCount: hpsr02.experiment.completeIndependentResultCount,
      cashOnlyResearchEnded: hpsr02.experiment.cashOnlyResearchEnded,
      secondIndependentOriginExecuted: hpsr02.experiment.secondIndependentOriginExecuted,
      summaryZh: "首个且唯一独立评价证据不足，结果已冻结，现金历史相邻研究结束。",
      boundaryZh: "不得追加第二独立起点、开发 HPSR03 或打开最终留出；该结果不授权自动化或生产。",
      sourceIds: ["registry", "independent", "current-state"],
      fieldPaths: {
        registry: `experiments[experimentId=${hpsr02.route.experimentId}]`,
        currentStatus: "status", completeResultCount: "execution.completeIndependentResultCount",
        researchEnded: "governance.cashOnlyResearchEnded", secondOrigin: "execution.secondIndependentOriginExecuted"
      }
    }
  ];
}
