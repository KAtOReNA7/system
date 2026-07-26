const MONTH_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])$/u;

export function assessM2HumanAnchoredLaterOriginReadiness({
  preregistrationConfig,
  developmentConfig,
  developmentEvidence,
  privateEvidence
}) {
  assertContracts(
    preregistrationConfig,
    developmentConfig,
    developmentEvidence
  );
  const audit = preregistrationConfig.qualificationAudit;
  const horizonMonths = positiveInteger(
    audit.horizonMonths,
    "horizon_months"
  );
  const latestCompleteMonth = requireMonth(
    audit.latestCompleteMonth,
    "latest_complete_month"
  );
  const selectionLabelThrough = requireMonth(
    preregistrationConfig.frozenDevelopment.selectionEvidenceLabelThrough,
    "selection_evidence_label_through"
  );
  const priorOrigins = new Set([
    ...developmentConfig.dataContract.primaryOrigins,
    ...developmentConfig.dataContract.auxiliaryOrigins
  ]);
  const candidateMonths = audit.focusOrigins.map((origin) => {
    const normalizedOrigin = requireMonth(origin, "focus_origin");
    const labelThrough = addMonths(normalizedOrigin, horizonMonths);
    const originPreviouslyUsed = priorOrigins.has(normalizedOrigin);
    const mature = compareMonths(labelThrough, latestCompleteMonth) <= 0;
    const afterSelectionEvidence = (
      compareMonths(normalizedOrigin, selectionLabelThrough) > 0
    );
    const reasons = [];
    if (!mature) reasons.push("36_month_label_not_mature");
    if (originPreviouslyUsed) {
      reasons.push("origin_used_in_v1_0_development_evidence");
    }
    if (!afterSelectionEvidence) {
      reasons.push(
        "origin_not_after_v1_0_selection_evidence_label_boundary"
      );
    }
    return Object.freeze({
      origin: normalizedOrigin,
      labelThrough,
      mature,
      originPreviouslyUsed,
      afterSelectionEvidence,
      eligible: reasons.length === 0,
      reasons: Object.freeze(reasons)
    });
  });
  assertContinuous(candidateMonths.map(({ origin }) => origin));

  const earliestTimeIndependentOrigin = addMonths(selectionLabelThrough, 1);
  const earliestTimeIndependentLabelThrough = addMonths(
    earliestTimeIndependentOrigin,
    horizonMonths
  );
  const missingCompleteMonths = monthRange(
    addMonths(latestCompleteMonth, 1),
    earliestTimeIndependentLabelThrough
  );
  const frozenModelStatePresent = (
    privateEvidence?.frozenModelStatePresent === true
  );
  const blockReasons = [];
  if (candidateMonths.some(({ originPreviouslyUsed }) => originPreviouslyUsed)) {
    blockReasons.push("candidate_block_contains_previously_evaluated_origin");
  }
  if (candidateMonths.some(({ afterSelectionEvidence }) => (
    !afterSelectionEvidence
  ))) {
    blockReasons.push(
      "candidate_block_precedes_v1_0_selection_evidence_label_boundary"
    );
  }
  if (!frozenModelStatePresent) {
    blockReasons.push("original_frozen_model_state_artifact_missing");
  }
  if (candidateMonths.some(({ mature }) => !mature)) {
    blockReasons.push("candidate_block_contains_unmatured_label");
  }
  const candidateBlockEligible = (
    candidateMonths.every(({ eligible }) => eligible)
    && frozenModelStatePresent
  );
  const decision = candidateBlockEligible
    ? "QUALIFIED_FROZEN_LATER_ORIGIN_VALIDATION_READY"
    : "NO_QUALIFIED_INDEPENDENT_MATURE_LATER_ORIGIN";

  return Object.freeze({
    schema: "m2.current.human_anchored_later_origin_assessment.v0.1",
    candidateId: preregistrationConfig.candidateId,
    target: preregistrationConfig.target,
    decision,
    candidateBlock: Object.freeze({
      from: candidateMonths[0].origin,
      through: candidateMonths.at(-1).origin,
      timeBlockCount: 1,
      adjacentMonthsNotIndependentReplicates: true,
      eligible: candidateBlockEligible,
      months: Object.freeze(candidateMonths)
    }),
    temporalBoundary: Object.freeze({
      horizonMonths,
      latestCompleteMonth,
      incompleteMonthsExcluded: Object.freeze([
        ...audit.incompleteMonths
      ]),
      selectionEvidenceLabelThrough: selectionLabelThrough,
      earliestTimeIndependentOrigin,
      earliestTimeIndependentLabelThrough,
      missingCompleteMonthCount: missingCompleteMonths.length,
      missingCompleteMonthRange: missingCompleteMonths.length > 0
        ? Object.freeze({
          from: missingCompleteMonths[0],
          through: missingCompleteMonths.at(-1)
        })
        : null
    }),
    frozenModel: Object.freeze({
      developmentCommit:
        preregistrationConfig.frozenDevelopment.developmentCommit,
      stateArtifactPresent: frozenModelStatePresent,
      refitAllowed: false,
      parameterUpdateAllowed: false,
      expertWeightUpdateAllowed: false,
      thresholdReselectionAllowed: false
    }),
    dataQuality: buildDataQuality(privateEvidence),
    validation: Object.freeze({
      metricsRead: false,
      laterOriginConsumed: false,
      trainingPerformed: false,
      finalHoldoutOpened: false,
      stopModelDevelopment: !candidateBlockEligible
    }),
    blockReasons: Object.freeze(blockReasons)
  });
}

export function buildM2HumanAnchoredLaterOriginPublicPreregistration({
  preregistrationConfig,
  assessment,
  codeEvidence,
  privateEvidence
}) {
  if (
    assessment?.schema
      !== "m2.current.human_anchored_later_origin_assessment.v0.1"
  ) {
    throw new Error("m2_later_origin_assessment_invalid");
  }
  const metrics = preregistrationConfig.metrics;
  const gates = preregistrationConfig.gates;
  return Object.freeze({
    schema:
      "m2.current.human_anchored_later_origin_public_preregistration.v0.1",
    candidateId: preregistrationConfig.candidateId,
    target: preregistrationConfig.target,
    authorization: Object.freeze({
      readinessAudit: true,
      qualifiedLaterOriginValidation: true,
      finalHoldout: false,
      provider: false,
      remoteOrSharedDatabase: false,
      canary: false,
      full160: false,
      release: false,
      m3Formal: false
    }),
    freeze: Object.freeze({
      developmentCommit:
        preregistrationConfig.frozenDevelopment.developmentCommit,
      auditImplementationCommit: codeEvidence.auditImplementationCommit,
      trackedCodeDigest: codeEvidence.trackedCodeDigest,
      modelCodeFrozen: true,
      parameterSpaceFrozen: true,
      humanThresholdsFrozen: true,
      fourExpertStructureFrozen: true,
      previousFailureConclusionFrozen: true,
      refitProhibited: true,
      resultDrivenTuningProhibited: true
    }),
    windows: Object.freeze({
      featureAndLabelWindow:
        preregistrationConfig.frozenDevelopment.featureAndLabelWindow,
      primaryDevelopmentOrigins:
        preregistrationConfig.frozenDevelopment.primaryOrigins,
      auxiliaryDevelopmentOrigins:
        preregistrationConfig.frozenDevelopment.auxiliaryOrigins,
      selectionEvidenceLabelThrough:
        preregistrationConfig.frozenDevelopment.selectionEvidenceLabelThrough,
      candidateBlock: Object.freeze({
        from: assessment.candidateBlock.from,
        through: assessment.candidateBlock.through,
        horizonMonths: assessment.temporalBoundary.horizonMonths,
        labelThrough: assessment.candidateBlock.months.at(-1).labelThrough,
        timeBlockCount: 1
      })
    }),
    eligibility: Object.freeze({
      populationRule:
        "all_authority_works_with_sales_share_history_as_of_origin",
      exclusions: Object.freeze([
        "pure_buyout_outside_forecast_scope",
        "no_sales_share_history_as_of_origin",
        "unmatured_36_month_label",
        "origin_or_label_period_used_by_v1_0_selection_evidence",
        "incomplete_2026_05_facts",
        "missing_original_frozen_model_state"
      ]),
      zeroImputationForUnmaturedLabels: false,
      candidateMonths: assessment.candidateBlock.months,
      candidateBlockEligible: assessment.candidateBlock.eligible,
      blockReasons: assessment.blockReasons
    }),
    dataEvidence: Object.freeze({
      authorityWorkCount: privateEvidence.authorityWorkCount,
      observedSalesShareWorkCount:
        privateEvidence.observedSalesShareWorkCount,
      salesShareFactRowCount: privateEvidence.salesShareFactRowCount,
      ledgerRowCounts: privateEvidence.ledgerRowCounts,
      mappingCoverage: privateEvidence.mappingCoverage,
      cashConservationPassed: privateEvidence.cashConservationPassed,
      rowConservationPassed: privateEvidence.rowConservationPassed,
      buyoutIsolated: privateEvidence.buyoutIsolated,
      privateDigestManifestWritten:
        privateEvidence.privateDigestManifestWritten,
      privateDigestValuesPublished: false,
      rawRowsPublished: false,
      workIdentifiersPublished: false,
      channelIdentifiersPublished: false
    }),
    evaluationPlan: Object.freeze({
      models: Object.freeze([
        "frozen_v1_0",
        "exact_v0_3",
        "faithful_manual_formula",
        "existing_required_baselines"
      ]),
      resolutions: Object.freeze([
        "work_case",
        "origin_portfolio",
        "origin_horizon_portfolio"
      ]),
      metrics: Object.freeze([...metrics.primary]),
      segments: Object.freeze([...metrics.segments]),
      bootstrap: metrics.bootstrap,
      timeBlockSensitivity: metrics.timeBlockSensitivity,
      gates,
      adjacentOriginsCountAsIndependentEvidence: false
    }),
    assessment,
    nonReuse: Object.freeze({
      validationResultsMayTuneV1: false,
      consumedBlockMayBeReusedForTuning: false,
      failureAllowsAttributionOnly: true,
      v1_1DevelopmentAuthorized: false
    })
  });
}

export function buildM2HumanAnchoredLaterOriginPublicDiagnostic(
  preregistration
) {
  validateM2HumanAnchoredLaterOriginPublicPreregistration(preregistration);
  return Object.freeze({
    schema: "m2.current.human_anchored_later_origin_readiness.v0.1",
    candidateId: preregistration.candidateId,
    target: preregistration.target,
    decision: preregistration.assessment.decision,
    candidateBlock: preregistration.assessment.candidateBlock,
    temporalBoundary: preregistration.assessment.temporalBoundary,
    frozenModel: preregistration.assessment.frozenModel,
    dataQuality: preregistration.assessment.dataQuality,
    validation: preregistration.assessment.validation,
    blockReasons: preregistration.assessment.blockReasons,
    nextCondition: Object.freeze({
      earliestPossibleIndependentOrigin:
        preregistration.assessment.temporalBoundary
          .earliestTimeIndependentOrigin,
      requiredCompleteLedgerThrough:
        preregistration.assessment.temporalBoundary
          .earliestTimeIndependentLabelThrough,
      frozenStateArtifactRequired: true,
      finalHoldoutRemainsSealed: true
    }),
    boundaries: Object.freeze({
      aggregateOnly: true,
      privateDigestValuesPublished: false,
      metricsRead: false,
      laterOriginConsumed: false,
      codeMergeDoesNotEqualModelRelease: true,
      currentDecision: "CANARY_FAIL",
      automationDecision: "AUTOMATION_BLOCKED",
      exactV03FallbackRetained: true,
      releaseAuthorized: false
    })
  });
}

export function validateM2HumanAnchoredLaterOriginPublicPreregistration(
  value
) {
  if (
    value?.schema
      !== "m2.current.human_anchored_later_origin_public_preregistration.v0.1"
    || value?.candidateId
      !== "M2-current-human-anchored-hierarchical-probabilistic-v1.0"
    || value?.target !== "future_sales_share_cash"
    || value?.authorization?.readinessAudit !== true
    || value?.authorization?.qualifiedLaterOriginValidation !== true
    || value?.authorization?.finalHoldout !== false
    || value?.freeze?.refitProhibited !== true
    || value?.freeze?.resultDrivenTuningProhibited !== true
    || value?.eligibility?.zeroImputationForUnmaturedLabels !== false
    || value?.eligibility?.candidateBlockEligible !== false
    || value?.dataEvidence?.privateDigestValuesPublished !== false
    || value?.assessment?.decision
      !== "NO_QUALIFIED_INDEPENDENT_MATURE_LATER_ORIGIN"
    || value?.assessment?.candidateBlock?.timeBlockCount !== 1
    || value?.assessment?.validation?.metricsRead !== false
    || value?.assessment?.validation?.laterOriginConsumed !== false
    || value?.nonReuse?.validationResultsMayTuneV1 !== false
    || value?.nonReuse?.v1_1DevelopmentAuthorized !== false
  ) {
    throw new Error("m2_later_origin_public_preregistration_invalid");
  }
  const serialized = JSON.stringify(value);
  if (
    /standardWorkId|channelUid|private-input|private-output/iu.test(serialized)
  ) {
    throw new Error("m2_later_origin_public_preregistration_private_leak");
  }
  return value;
}

export function renderM2HumanAnchoredLaterOriginReadinessReport(
  diagnostic
) {
  if (
    diagnostic?.schema
      !== "m2.current.human_anchored_later_origin_readiness.v0.1"
  ) {
    throw new Error("m2_later_origin_public_diagnostic_invalid");
  }
  const monthRows = diagnostic.candidateBlock.months.map((row) => (
    `| ${row.origin} | ${row.labelThrough} | `
    + `${row.mature ? "已成熟" : "未成熟"} | `
    + `${row.originPreviouslyUsed ? "已进入既有证据" : "未作为既有 origin"} | `
    + `${row.eligible ? "合格" : "不合格"} |`
  )).join("\n");
  const blockRows = diagnostic.blockReasons.map(
    (reason) => `- \`${reason}\``
  ).join("\n");
  const missing = diagnostic.temporalBoundary.missingCompleteMonthRange;
  return `# M2 v1.0 独立 later-origin 资格审计与预注册 v0.1

## 结论

本次资格审计结论为
\`${diagnostic.decision}\`。2023-01 至 2023-04 的 36 个月标签按时间已经成熟，
但这四个月必须作为一个连续时间块审计，不能拆成多份独立证据。该块位于 v1.0
已经读取到 2025-12 的选择/比较证据边界之前，且 2023-03 已明确进入既有短周期
辅助评估；因此整块不具备独立 later-origin 资格。

原始 v1.0 运行也没有留下可直接复用的完整冻结模型状态。当前授权禁止重新拟合
人工参数、专家权重、发生/冲销层或分位数残差池来补造状态，所以本次没有读取任何
新 later-origin 指标，候选块也没有被消耗。

## 候选月份资格

| origin | 36个月标签截至 | 成熟性 | 既有 origin 使用 | 资格 |
|---|---|---|---|---|
${monthRows}

连续月份只计 **1 个时间验证块**。作品数量不能把一个时间块变成多份独立证据。

## 阻断原因

${blockRows}

## 等待条件

- v1.0 选择/比较证据最晚读取到
  \`${diagnostic.temporalBoundary.selectionEvidenceLabelThrough}\`。
- 最早可能时间独立的 origin 是
  \`${diagnostic.nextCondition.earliestPossibleIndependentOrigin}\`。
- 其 36 个月标签需要账单完整到
  \`${diagnostic.nextCondition.requiredCompleteLedgerThrough}\`。
- 当前完整月仅到
  \`${diagnostic.temporalBoundary.latestCompleteMonth}\`；仍缺
  ${diagnostic.temporalBoundary.missingCompleteMonthCount} 个完整月${
    missing
      ? `（${missing.from} 至 ${missing.through}）`
      : ""
  }。
- 必须找到原 v1.0 运行时已经冻结并可摘要绑定的完整模型状态；不得从公开汇总
  反推，不得在本次授权下重新拟合。

## 数据和治理核对

- 现金权威仍为人工拆分的分成账单；买断继续隔离。
- 作品人口、渠道映射、行数与金额守恒均只公开聚合结果。
- 2026-05 不完整事实明确排除；未成熟标签不填 0。
- private 文件摘要仅写入 ignored 预注册，不在公开文件中披露。
- final holdout、provider、远程/共享数据库、Canary、full160、release 和
  M3 formal 均未打开。

## 当前状态

- 已实现：资格审计、预注册、公共 readiness 诊断和无 private 验证入口。
- 已验证：资格与数据边界；未执行模型表现验证。
- 已授权：readiness audit 与“仅在资格成立时”的一次冻结验证。
- 可发布：否。exact v0.3 继续 fallback，
  \`CANARY_FAIL\` 与 \`AUTOMATION_BLOCKED\` 保持不变。
`;
}

export function addMonths(month, offset) {
  const index = monthIndex(requireMonth(month, "month"));
  const target = index + Number(offset);
  if (!Number.isSafeInteger(target)) {
    throw new Error("m2_later_origin_month_offset_invalid");
  }
  const year = Math.floor(target / 12);
  const number = target % 12 + 1;
  return `${year}-${String(number).padStart(2, "0")}`;
}

export function monthRange(from, through) {
  const start = monthIndex(requireMonth(from, "range_from"));
  const end = monthIndex(requireMonth(through, "range_through"));
  if (end < start) return [];
  return Array.from(
    { length: end - start + 1 },
    (_, index) => addMonths(from, index)
  );
}

function assertContracts(config, developmentConfig, developmentEvidence) {
  if (
    config?.schema
      !== "m2.current.human_anchored_later_origin_preregistration.v0.1"
    || config?.candidateId
      !== "M2-current-human-anchored-hierarchical-probabilistic-v1.0"
    || config?.target !== "future_sales_share_cash"
    || config?.authorization?.readinessAudit !== true
    || config?.authorization?.qualifiedLaterOriginValidation !== true
    || config?.authorization?.finalHoldout !== false
    || config?.authorization?.provider !== false
    || config?.authorization?.remoteOrSharedDatabase !== false
    || config?.authorization?.canary !== false
    || config?.authorization?.full160 !== false
    || config?.authorization?.release !== false
    || config?.authorization?.m3Formal !== false
    || developmentConfig?.candidateId !== config.candidateId
    || developmentConfig?.authorization?.independentLaterOrigin !== false
    || developmentConfig?.authorization?.finalHoldout !== false
    || developmentEvidence?.candidateId !== config.candidateId
    || developmentEvidence?.decision?.developmentDecision
      !== "HUMAN_ANCHORED_DEVELOPMENT_FAIL"
    || developmentEvidence?.decision?.maturityDecision !== "M2_NOT_MATURE"
    || developmentEvidence?.temporalMaturity?.independentLaterOriginOpened
      !== false
  ) {
    throw new Error("m2_later_origin_contract_boundary_differs");
  }
}

function buildDataQuality(privateEvidence) {
  const value = privateEvidence ?? {};
  return Object.freeze({
    authorityWorkCount: numberOrNull(value.authorityWorkCount),
    observedSalesShareWorkCount:
      numberOrNull(value.observedSalesShareWorkCount),
    salesShareFactRowCount: numberOrNull(value.salesShareFactRowCount),
    mappingCoverage: numberOrNull(value.mappingCoverage),
    rowConservationPassed: value.rowConservationPassed === true,
    cashConservationPassed: value.cashConservationPassed === true,
    buyoutIsolated: value.buyoutIsolated === true,
    unmaturedLabelZeroImputationCount:
      numberOrNull(value.unmaturedLabelZeroImputationCount),
    incomplete202605Excluded: value.incomplete202605Excluded === true,
    privateDigestValuesPublished: false
  });
}

function assertContinuous(months) {
  for (let index = 1; index < months.length; index += 1) {
    if (months[index] !== addMonths(months[index - 1], 1)) {
      throw new Error("m2_later_origin_candidate_block_not_continuous");
    }
  }
}

function compareMonths(left, right) {
  return monthIndex(left) - monthIndex(right);
}

function monthIndex(month) {
  const [year, number] = month.split("-").map(Number);
  return year * 12 + number - 1;
}

function requireMonth(value, name) {
  if (typeof value !== "string" || !MONTH_PATTERN.test(value)) {
    throw new Error(`m2_later_origin_${name}_invalid`);
  }
  return value;
}

function positiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`m2_later_origin_${name}_invalid`);
  }
  return number;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
