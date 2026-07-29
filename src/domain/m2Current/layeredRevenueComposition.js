const COMPONENT_IDS = Object.freeze([
  "EXISTING_CORE",
  "EXISTING_TAIL",
  "FUTURE_NEW_WORK",
  "EXISTING_WORK_NEW_CHANNEL"
]);

export function validateM2LayeredRevenueCompositionConfig(config) {
  if (config?.schema !== "m2.current.layered_revenue_composition.v0.1") {
    throw new Error("m2_layered_revenue_config_schema_invalid");
  }
  if (
    config.model?.stableModelId !== "M2-PORT-LRC01"
    || config.model?.experimentId
      !== "M2-EXP-LAYERED-REVENUE-COMPOSITION-01"
    || config.model?.capability !== "PORT"
  ) {
    throw new Error("m2_layered_revenue_model_identity_invalid");
  }
  if (
    config.target?.actualDefinitionId
      !== "M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01"
    || config.target?.calendarField !== "billMonth"
  ) {
    throw new Error("m2_layered_revenue_target_invalid");
  }
  if (
    JSON.stringify(config.components?.map((item) => item.id))
      !== JSON.stringify(COMPONENT_IDS)
    || JSON.stringify(config.componentPrecedence) !== JSON.stringify([
      "FUTURE_NEW_WORK",
      "EXISTING_WORK_NEW_CHANNEL",
      "EXISTING_CORE",
      "EXISTING_TAIL"
    ])
  ) {
    throw new Error("m2_layered_revenue_components_invalid");
  }
  if (
    config.conservation?.currencyRepresentation !== "integer_minor_units"
    || config.conservation?.requiredDifference !== "0"
    || config.conservation?.futureNewWorkAndNewChannelMayOverlap !== false
  ) {
    throw new Error("m2_layered_revenue_conservation_invalid");
  }
  if (
    config.experiments?.L3?.identityPredictionAllowed !== false
    || config.experiments?.L4?.identityPredictionAllowed !== false
    || config.experiments?.L5B?.workLevelKAllowed !== false
    || config.experiments?.L6A?.recursiveCompoundingAllowed !== false
    || config.experiments?.L6B?.recursiveCompoundingAllowed !== false
    || config.retention?.workLevelGrowthCompoundingAllowed !== false
  ) {
    throw new Error("m2_layered_revenue_identity_or_compounding_invalid");
  }
  if (
    config.experiments?.L3?.timeDecay?.halfLifeMonths !== 24
    || config.experiments?.L4?.timeDecay?.halfLifeMonths !== 24
    || config.experiments?.L3?.timeDecay?.fixedBeforeOuterEvaluation !== true
    || config.experiments?.L4?.timeDecay?.fixedBeforeOuterEvaluation !== true
  ) {
    throw new Error("m2_layered_revenue_time_decay_invalid");
  }
  if (
    JSON.stringify(config.evaluation?.horizonsMonths)
      !== JSON.stringify([3, 6, 12, 36])
    || config.evaluation?.bootstrap?.iterations !== 2000
    || config.evaluation?.horizonDecisionsIndependent !== true
  ) {
    throw new Error("m2_layered_revenue_evaluation_invalid");
  }
  if (
    config.authorization?.formulaTuning !== false
    || config.authorization?.outerResultModelSelection !== false
    || config.authorization?.production !== false
    || config.authorization?.pullRequestMerge !== false
  ) {
    throw new Error("m2_layered_revenue_authorization_invalid");
  }
  return true;
}

export function classifyM2LayeredRevenueActual({
  workId,
  channelId,
  coreWorkIds,
  originVisiblePositiveWorkIds,
  originVisiblePositiveWorkChannels
}) {
  const workExists = originVisiblePositiveWorkIds.has(workId);
  if (!workExists) {
    return "FUTURE_NEW_WORK";
  }
  const workChannelExists = originVisiblePositiveWorkChannels.has(
    `${workId}|${channelId}`
  );
  if (!workChannelExists) {
    return "EXISTING_WORK_NEW_CHANNEL";
  }
  return coreWorkIds.has(workId)
    ? "EXISTING_CORE"
    : "EXISTING_TAIL";
}

export function decomposeM2LayeredRevenueActual({
  futureRows,
  coreWorkIds,
  originVisiblePositiveWorkIds,
  originVisiblePositiveWorkChannels
}) {
  const sets = {
    coreWorkIds: new Set(coreWorkIds),
    originVisiblePositiveWorkIds: new Set(originVisiblePositiveWorkIds),
    originVisiblePositiveWorkChannels:
      new Set(originVisiblePositiveWorkChannels)
  };
  const componentMinor = Object.fromEntries(
    COMPONENT_IDS.map((id) => [id, 0n])
  );
  let companyTotalMinor = 0n;
  const classifiedRows = futureRows.map((row) => {
    const amountMinor = BigInt(row.amountMinor);
    const componentId = classifyM2LayeredRevenueActual({
      ...row,
      ...sets
    });
    componentMinor[componentId] += amountMinor;
    companyTotalMinor += amountMinor;
    return Object.freeze({
      workId: row.workId,
      channelId: row.channelId,
      amountMinor: amountMinor.toString(),
      componentId
    });
  });
  const componentTotal = Object.values(componentMinor).reduce(
    (total, value) => total + value,
    0n
  );
  return Object.freeze({
    components: Object.freeze(Object.fromEntries(
      COMPONENT_IDS.map((id) => [id, componentMinor[id].toString()])
    )),
    companyTotalMinor: companyTotalMinor.toString(),
    conservationDifferenceMinor:
      (componentTotal - companyTotalMinor).toString(),
    rowCount: classifiedRows.length,
    classifiedRows: Object.freeze(classifiedRows)
  });
}

export function buildM2LayeredRevenueSyntheticDiagnostic(
  fixture,
  config
) {
  validateM2LayeredRevenueCompositionConfig(config);
  const decomposition = decomposeM2LayeredRevenueActual({
    futureRows: fixture.futureRows,
    coreWorkIds: fixture.coreWorkIds,
    originVisiblePositiveWorkIds:
      fixture.originVisiblePositiveWorkIds,
    originVisiblePositiveWorkChannels:
      fixture.originVisiblePositiveWorkChannels
  });
  return Object.freeze({
    schema:
      "m2.current.layered_revenue_composition.public_diagnostic.v0.1",
    status: "PUBLIC_CONTRACT_AND_SYNTHETIC_DIAGNOSTIC_COMPLETE",
    model: Object.freeze({
      stableModelId: config.model.stableModelId,
      experimentId: config.model.experimentId,
      displayNameZh: config.model.displayNameZh,
      displayNameEn: config.model.displayNameEn
    }),
    target: Object.freeze({
      actualDefinitionId: config.target.actualDefinitionId,
      calendarField: config.target.calendarField,
      excludedCash: Object.freeze([...config.target.excludedCash])
    }),
    decomposition: Object.freeze({
      origin: fixture.origin,
      horizonMonths: fixture.horizonMonths,
      components: decomposition.components,
      companyTotalMinor: decomposition.companyTotalMinor,
      conservationDifferenceMinor:
        decomposition.conservationDifferenceMinor,
      componentIds: COMPONENT_IDS
    }),
    frozenBoundaries: Object.freeze({
      futureNewWorkIdentityPredictionAllowed:
        config.experiments.L3.identityPredictionAllowed,
      newChannelIdentityPredictionAllowed:
        config.experiments.L4.identityPredictionAllowed,
      workLevelGrowthCompoundingAllowed:
        config.retention.workLevelGrowthCompoundingAllowed,
      fixedWorkCountEligibilityAllowed:
        config.retention.fixedWorkCountEligibilityAllowed,
      horizonDecisionsIndependent:
        config.evaluation.horizonDecisionsIndependent,
      bootstrapIterations:
        config.evaluation.bootstrap.iterations,
      formulaTuningAuthorized:
        config.authorization.formulaTuning,
      productionAuthorized:
        config.authorization.production
    }),
    privateEvaluation: Object.freeze({
      executed: false,
      status: "NOT_EXECUTED_PUBLIC_DIAGNOSTIC_ONLY"
    })
  });
}

export function assertM2LayeredRevenuePublicSafe(value) {
  const text = JSON.stringify(value);
  const forbidden = [
    /[A-Za-z]:\\/u,
    /data\/private-(?:input|output)/u,
    /"workId"\s*:/u,
    /"channelId"\s*:/u,
    /"workName"\s*:/u,
    /"actual"\s*:/u,
    /"prediction"\s*:/u
  ];
  for (const pattern of forbidden) {
    if (pattern.test(text)) {
      throw new Error("m2_layered_revenue_public_identity_leak");
    }
  }
  return true;
}

export function estimateM2LayeredPortfolioRatio({
  history,
  origin,
  horizonMonths,
  halfLifeMonths = 24
}) {
  const originSerial = monthToSerial(origin);
  const mature = history
    .filter((row) => (
      Number(row.horizonMonths) === Number(horizonMonths)
      && monthToSerial(row.pseudoOrigin) + Number(horizonMonths)
        <= originSerial
      && BigInt(row.denominatorMinor) > 0n
    ))
    .map((row) => ({
      pseudoOrigin: String(row.pseudoOrigin),
      serial: monthToSerial(row.pseudoOrigin),
      ratio: Number(row.numeratorMinor) / Number(row.denominatorMinor)
    }))
    .filter((row) => Number.isFinite(row.ratio) && row.ratio >= 0)
    .sort((left, right) => left.serial - right.serial);
  if (mature.length === 0) {
    return Object.freeze({
      status: "NOT_MATURE",
      maturePseudoOriginCount: 0,
      estimators: Object.freeze({})
    });
  }
  const priorYearSerial = originSerial - 12;
  const priorYear = mature.find((row) => row.serial === priorYearSerial);
  const recent = mature.slice(-3).map((row) => row.ratio);
  const weighted = mature.map((row) => ({
    value: row.ratio,
    weight: 0.5 ** ((originSerial - row.serial) / halfLifeMonths)
  }));
  return Object.freeze({
    status: "COMPUTED",
    maturePseudoOriginCount: mature.length,
    estimators: Object.freeze({
      SAME_MONTH_PRIOR_YEAR: priorYear?.ratio ?? null,
      RECENT_3_MATURE_MEDIAN: median(recent),
      TIME_DECAY_MATURE_MEDIAN: weightedMedian(weighted)
    })
  });
}

export function selectM2LayeredRatioEstimator(
  estimate,
  estimatorId
) {
  const ratio = estimate?.estimators?.[estimatorId];
  return Number.isFinite(ratio)
    ? Object.freeze({ status: "COMPUTED", estimatorId, ratio })
    : Object.freeze({ status: "NOT_MATURE", estimatorId, ratio: null });
}

export function forecastM2LayeredPortfolioAmount({
  preOrigin12MonthCashMinor,
  estimate
}) {
  if (estimate?.status !== "COMPUTED" || !Number.isFinite(estimate.ratio)) {
    return Object.freeze({
      status: "NOT_MATURE",
      amountMinor: null
    });
  }
  const amount = Math.round(
    Number(preOrigin12MonthCashMinor) * estimate.ratio
  );
  if (!Number.isSafeInteger(amount)) {
    throw new Error("m2_layered_revenue_amount_not_safe_integer");
  }
  return Object.freeze({
    status: "COMPUTED",
    amountMinor: String(amount)
  });
}

export function estimateM2DirectCatalogRetention({
  history,
  origin,
  annualComponent,
  ageBand = null,
  minimumMaturePseudoOrigins = 3
}) {
  const year = { Y1: 12, Y2: 24, Y3: 36 }[annualComponent];
  if (!year) {
    throw new Error("m2_layered_revenue_annual_component_invalid");
  }
  const eligible = history.filter((row) => (
    row.annualComponent === annualComponent
    && (ageBand === null || row.ageBand === ageBand)
  ));
  const estimate = estimateM2LayeredPortfolioRatio({
    history: eligible.map((row) => ({
      ...row,
      horizonMonths: year
    })),
    origin,
    horizonMonths: year
  });
  const ratios = eligible
    .filter((row) => (
      monthToSerial(row.pseudoOrigin) + year <= monthToSerial(origin)
      && BigInt(row.denominatorMinor) > 0n
    ))
    .map((row) => Number(row.numeratorMinor) / Number(row.denominatorMinor))
    .filter(Number.isFinite);
  const uncertainty = ratios.length < 2
    ? null
    : quantile(ratios, 0.75) - quantile(ratios, 0.25);
  return Object.freeze({
    status: estimate.status,
    annualComponent,
    ageBand,
    maturePseudoOriginCount: estimate.maturePseudoOriginCount,
    independentTimeBlockCount: new Set(
      eligible.map((row) => row.timeBlockId).filter(Boolean)
    ).size,
    uncertaintyIqr: uncertainty,
    supportStatus:
      estimate.maturePseudoOriginCount >= minimumMaturePseudoOrigins
        ? "DIRECT_SUPPORT"
        : "SHRINK_REQUIRED",
    estimators: estimate.estimators
  });
}

export function composeM2LayeredRevenuePrediction(components) {
  const values = COMPONENT_IDS.map((id) => {
    const value = components[id];
    if (value === null || value === undefined) {
      throw new Error(`m2_layered_revenue_component_missing:${id}`);
    }
    return BigInt(value);
  });
  return Object.freeze({
    components: Object.freeze(Object.fromEntries(
      COMPONENT_IDS.map((id, index) => [id, values[index].toString()])
    )),
    companyTotalMinor: values
      .reduce((total, value) => total + value, 0n)
      .toString()
  });
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function weightedMedian(rows) {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((left, right) => left.value - right.value);
  const total = sorted.reduce((sum, row) => sum + row.weight, 0);
  let cumulative = 0;
  for (const row of sorted) {
    cumulative += row.weight;
    if (cumulative >= total / 2) return row.value;
  }
  return sorted.at(-1).value;
}

function quantile(values, probability) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return sorted[lower]
    + (sorted[upper] - sorted[lower]) * (index - lower);
}

function monthToSerial(month) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/u.exec(String(month));
  if (!match) throw new Error("m2_layered_revenue_month_invalid");
  return Number(match[1]) * 12 + Number(match[2]) - 1;
}

export { COMPONENT_IDS as M2_LAYERED_REVENUE_COMPONENT_IDS };
