export const M2_CORE_REVENUE_MANUAL_MODEL_ID = "M2-WORK-CRMR01";
export const M2_CORE_REVENUE_MANUAL_EXPERIMENT_ID =
  "M2-EXP-CORE-REVENUE-MANUAL-01";

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/u;
const EPSILON = 1e-12;

export class M2CoreRevenueManualContractError extends Error {
  constructor(code) {
    super(code);
    this.name = "M2CoreRevenueManualContractError";
    this.code = code;
  }
}

export function validateM2CoreRevenueManualConfig(config) {
  if (
    config?.schema !== "m2.current.core_revenue_manual.v0.1"
    || config?.model?.stableModelId !== M2_CORE_REVENUE_MANUAL_MODEL_ID
    || config?.model?.experimentId
      !== M2_CORE_REVENUE_MANUAL_EXPERIMENT_ID
    || config?.target?.actualDefinitionId
      !== "M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01"
    || config?.target?.calendarField !== "billMonth"
    || config?.target?.predictionGrain
      !== "work_origin_horizon_channel"
    || config?.eligibility?.minimumCompleteMonths !== 3
    || config?.longTermMultiplier?.hardClampAllowed !== false
    || config?.longTermMultiplier?.fixedSupportThresholdAllowed !== false
    || config?.evaluation?.bootstrap?.iterations !== 2000
  ) {
    throw new M2CoreRevenueManualContractError(
      "m2_core_revenue_manual_contract_invalid"
    );
  }
  return true;
}

export function monthToSerial(month) {
  const match = MONTH_PATTERN.exec(String(month));
  if (!match) {
    throw new M2CoreRevenueManualContractError(
      "m2_core_revenue_manual_month_invalid"
    );
  }
  return Number(match[1]) * 12 + Number(match[2]) - 1;
}

export function serialToMonth(serial) {
  if (!Number.isInteger(serial)) {
    throw new M2CoreRevenueManualContractError(
      "m2_core_revenue_manual_month_serial_invalid"
    );
  }
  const year = Math.floor(serial / 12);
  const month = serial - year * 12 + 1;
  return `${String(year).padStart(4, "0")}-${
    String(month).padStart(2, "0")
  }`;
}

export function addMonths(month, amount) {
  if (!Number.isInteger(amount)) {
    throw new M2CoreRevenueManualContractError(
      "m2_core_revenue_manual_month_offset_invalid"
    );
  }
  return serialToMonth(monthToSerial(month) + amount);
}

export function referenceWindowForOrigin(origin) {
  const serial = monthToSerial(origin);
  const monthOfYear = serial % 12 + 1;
  const startSerial = monthOfYear >= 3
    ? serial - monthOfYear + 1
    : serial - 5;
  return Object.freeze({
    start: serialToMonth(startSerial),
    end: serialToMonth(serial),
    monthCount: serial - startSerial + 1,
    basis: monthOfYear >= 3
      ? "CALENDAR_YEAR_JANUARY_THROUGH_ORIGIN"
      : "LATEST_6_COMPLETE_MONTHS_CROSS_YEAR"
  });
}

export function selectCoreRevenuePopulations({
  origin,
  monthlyWorkCash,
  thresholds = [
    ["CORE80", 0.8],
    ["CORE90", 0.9]
  ],
  topCounts = [20, 50]
}) {
  const window = referenceWindowForOrigin(origin);
  const start = monthToSerial(window.start);
  const end = monthToSerial(window.end);
  const ranked = requireWorkCashRows(monthlyWorkCash).map((row) => {
    const referenceRevenue = Object.entries(row.months)
      .filter(([month]) => {
        const serial = monthToSerial(month);
        return serial >= start && serial <= end;
      })
      .reduce((sum, [, cash]) => sum + requireFiniteCash(cash), 0);
    return Object.freeze({
      standardWorkId: row.standardWorkId,
      referenceRevenue
    });
  }).sort((left, right) => (
    right.referenceRevenue - left.referenceRevenue
    || stableTextCompare(left.standardWorkId, right.standardWorkId)
  ));
  const referenceRevenueTotal = ranked.reduce(
    (sum, row) => sum + row.referenceRevenue,
    0
  );
  if (!(referenceRevenueTotal > 0)) {
    return Object.freeze({
      status: "NOT_COMPUTABLE_NONPOSITIVE_REFERENCE_REVENUE",
      origin,
      referenceWindow: window,
      referenceRevenueTotal,
      ranked,
      populations: Object.fromEntries(
        thresholds.map(([id]) => [id, Object.freeze([])])
      ),
      top: Object.fromEntries(
        topCounts.map((count) => [`TOP${count}`, Object.freeze([])])
      )
    });
  }
  const populations = {};
  for (const [id, share] of thresholds) {
    if (!(share > 0 && share <= 1)) {
      throw new M2CoreRevenueManualContractError(
        "m2_core_revenue_manual_core_threshold_invalid"
      );
    }
    let cumulative = 0;
    const selected = [];
    for (const row of ranked) {
      selected.push(row.standardWorkId);
      cumulative += row.referenceRevenue;
      if (cumulative + EPSILON >= referenceRevenueTotal * share) {
        break;
      }
    }
    populations[id] = Object.freeze(selected);
  }
  return Object.freeze({
    status: "SELECTED",
    origin,
    referenceWindow: window,
    referenceRevenueTotal,
    ranked: Object.freeze(ranked),
    populations: Object.freeze(populations),
    top: Object.freeze(Object.fromEntries(
      topCounts.map((count) => [
        `TOP${count}`,
        Object.freeze(
          ranked.slice(0, count).map((row) => row.standardWorkId)
        )
      ])
    ))
  });
}

export function ordinaryLeastSquaresSlope(values) {
  const source = requireCashArray(values);
  if (source.length < 2) {
    return 0;
  }
  const xMean = (source.length - 1) / 2;
  const yMean = source.reduce((sum, value) => sum + value, 0)
    / source.length;
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < source.length; index += 1) {
    const centeredX = index - xMean;
    numerator += centeredX * (source[index] - yMean);
    denominator += centeredX ** 2;
  }
  return denominator === 0 ? 0 : numerator / denominator;
}

export function forecastCoreRevenueManual(
  monthlyCash,
  {
    windowCash = monthlyCash,
    twoCompleteWindows = monthlyCash.length >= 24
  } = {}
) {
  const history = requireCashArray(monthlyCash);
  const calendarWindow = requireCashArray(windowCash);
  if (history.length < 3) {
    return Object.freeze({
      status: "NOT_ELIGIBLE",
      historyMonthCount: history.length,
      minimumHistoryMonthCount: 3
    });
  }
  if (calendarWindow.length === 0) {
    throw new M2CoreRevenueManualContractError(
      "m2_core_revenue_manual_window_empty"
    );
  }
  const latestSix = history.slice(-Math.min(6, history.length));
  const s12Window = calendarWindow.slice(-12);
  const p12Window = twoCompleteWindows && calendarWindow.length >= 24
    ? calendarWindow.slice(-24, -12)
    : [];
  const M1 = history.at(-1);
  const S6 = sum(latestSix);
  const S12 = sum(s12Window);
  const P12 = sum(p12Window);
  const b6 = ordinaryLeastSquaresSlope(latestSix);
  const F3 = M1 * 3;
  const F6 = S6;
  const annualizedLatest = M1 * 12;
  const F12 = b6 > 0
    ? Math.max(S12, annualizedLatest)
    : b6 < 0
      ? Math.min(S12, annualizedLatest)
      : S12;
  const directK = (
    twoCompleteWindows
    && calendarWindow.length >= 24
    && P12 > 0
  )
    ? S12 / P12
    : null;
  return Object.freeze({
    status: "ELIGIBLE",
    historyMonthCount: history.length,
    slopeMonthCount: latestSix.length,
    M1,
    S6,
    S12,
    P12,
    b6,
    F3,
    F6,
    F12,
    directK
  });
}

export function buildCoreDirectKFallbackIndex(rows) {
  const category = new Map();
  const channel = new Map();
  for (const row of rows) {
    if (!Number.isFinite(row?.directK)) {
      continue;
    }
    const channelUid = requireNonempty(row.channelUid, "channel_uid");
    const categoryValue = normalizeCategory(row.level2Category);
    appendMapValue(channel, channelUid, row.directK);
    appendMapValue(
      category,
      `${channelUid}\u0000${categoryValue}`,
      row.directK
    );
  }
  return Object.freeze({
    category: freezeMedianMap(category),
    channel: freezeMedianMap(channel)
  });
}

export function resolveCoreRevenueK({
  directK = null,
  channelUid,
  level2Category,
  fallbackIndex
}) {
  if (Number.isFinite(directK)) {
    return Object.freeze({
      k: directK,
      sourceLevel: "DIRECT",
      supportCount: 1
    });
  }
  const channelKey = requireNonempty(channelUid, "channel_uid");
  const categoryKey = `${channelKey}\u0000${
    normalizeCategory(level2Category)
  }`;
  const category = fallbackIndex?.category?.[categoryKey];
  if (category) {
    return Object.freeze({
      k: category.median,
      sourceLevel: "CHANNEL_LEVEL2_CATEGORY",
      supportCount: category.count
    });
  }
  const channel = fallbackIndex?.channel?.[channelKey];
  if (channel) {
    return Object.freeze({
      k: channel.median,
      sourceLevel: "CHANNEL",
      supportCount: channel.count
    });
  }
  return Object.freeze({
    k: 1,
    sourceLevel: "ONE",
    supportCount: 0
  });
}

export function applyCoreRevenueLongTermForecast(base, resolvedK) {
  if (base?.status !== "ELIGIBLE") {
    return base;
  }
  const k = requireFiniteCash(resolvedK?.k);
  const Y1 = base.F12;
  const Y2 = Y1 * k;
  const Y3 = Y2 * k;
  return Object.freeze({
    ...base,
    k,
    kSource: resolvedK.sourceLevel,
    kSupportCount: resolvedK.supportCount,
    Y1,
    Y2,
    Y3,
    F36: Y1 + Y2 + Y3
  });
}

export function poolEligibleTailMonthlyRows({
  eligibleMonthlyRows,
  coreWorkIds
}) {
  const core = new Set(coreWorkIds.map(String));
  const monthly = new Map();
  let coreCash = 0;
  let tailCash = 0;
  for (const row of eligibleMonthlyRows) {
    const cash = requireFiniteCash(row.cash);
    if (core.has(String(row.standardWorkId))) {
      coreCash += cash;
    } else {
      tailCash += cash;
      monthly.set(row.month, (monthly.get(row.month) ?? 0) + cash);
    }
  }
  return Object.freeze({
    monthly: Object.freeze(
      [...monthly.entries()]
        .sort(([left], [right]) => stableTextCompare(left, right))
        .map(([month, cash]) => Object.freeze({ month, cash }))
    ),
    coreCash,
    tailCash,
    totalCash: coreCash + tailCash
  });
}

export function runCoreRevenueManualRolling({
  monthlyRows,
  origins,
  config
}) {
  validateM2CoreRevenueManualConfig(config);
  const source = normalizeMonthlyRows(monthlyRows);
  const originList = [...new Set(origins.map(String))]
    .sort(stableTextCompare);
  if (originList.length === 0 || source.length === 0) {
    throw new M2CoreRevenueManualContractError(
      "m2_core_revenue_manual_rolling_input_empty"
    );
  }
  const minimumSourceSerial = Math.min(
    ...source.map((row) => monthToSerial(row.month))
  );
  const thresholds = config.coreSelection.populations.map((item) => [
    item.id,
    item.minimumCumulativeReferenceRevenueShare
  ]);
  const caseRows = [];
  const annualComponentRows = [];
  const portfolioRows = [];
  const portfolioAnnualRows = [];
  const originDiagnostics = [];

  for (const origin of originList) {
    const originSerial = monthToSerial(origin);
    const visible = source.filter(
      (row) => monthToSerial(row.month) <= originSerial
    );
    const workMonth = aggregateBy(visible, (row) => [
      row.standardWorkId,
      row.month
    ]);
    const selection = selectCoreRevenuePopulations({
      origin,
      monthlyWorkCash: groupWorkMonths(workMonth),
      thresholds,
      topCounts: config.coreSelection.topDiagnostics
    });
    if (selection.status !== "SELECTED") {
      originDiagnostics.push(selection);
      continue;
    }
    const eligible = buildEligibleStates({
      source,
      origin,
      originSerial,
      minimumSourceSerial
    });
    const populationDiagnostics = [];
    for (const [populationId] of thresholds) {
      const coreWorkIds = selection.populations[populationId];
      const coreSet = new Set(coreWorkIds);
      const directCoreRows = eligible
        .filter((item) => coreSet.has(item.standardWorkId))
        .map((item) => ({
          channelUid: item.channelUid,
          level2Category: item.level2Category,
          directK: item.base.directK
        }));
      const fallbackIndex = buildCoreDirectKFallbackIndex(directCoreRows);
      const selectedStates = eligible.filter(
        (item) => coreSet.has(item.standardWorkId)
      );
      for (const item of selectedStates) {
        const resolvedK = resolveCoreRevenueK({
          directK: item.base.directK,
          channelUid: item.channelUid,
          level2Category: item.level2Category,
          fallbackIndex
        });
        const forecast = applyCoreRevenueLongTermForecast(
          item.base,
          resolvedK
        );
        for (const horizon of config.evaluation.horizonsMonths) {
          caseRows.push(Object.freeze({
            modelId: M2_CORE_REVENUE_MANUAL_MODEL_ID,
            experimentId: M2_CORE_REVENUE_MANUAL_EXPERIMENT_ID,
            origin,
            featureCutoffMonth: origin,
            targetStartMonth: addMonths(origin, 1),
            targetEndMonth: addMonths(origin, horizon),
            standardWorkId: item.standardWorkId,
            channelUid: item.channelUid,
            level2Category: item.level2Category,
            settlementMechanism: item.settlementMechanism,
            populationId,
            horizonMonths: horizon,
            pointEstimate: forecastForHorizon(forecast, horizon),
            actual: futureCashForKey(
              source,
              item,
              originSerial,
              horizon
            ),
            k: forecast.k,
            kSource: forecast.kSource,
            kSupportCount: forecast.kSupportCount,
            referenceRank: selection.ranked.findIndex(
              (row) => row.standardWorkId === item.standardWorkId
            ) + 1,
            top20: selection.top.TOP20.includes(item.standardWorkId),
            top50: selection.top.TOP50.includes(item.standardWorkId)
          }));
        }
        for (const [component, startOffset, endOffset] of [
          ["Y1", 1, 12],
          ["Y2", 13, 24],
          ["Y3", 25, 36]
        ]) {
          annualComponentRows.push(Object.freeze({
            modelId: M2_CORE_REVENUE_MANUAL_MODEL_ID,
            experimentId: M2_CORE_REVENUE_MANUAL_EXPERIMENT_ID,
            origin,
            standardWorkId: item.standardWorkId,
            channelUid: item.channelUid,
            populationId,
            annualComponent: component,
            pointEstimate: forecast[component],
            actual: futureCashForKeyRange(
              source,
              item,
              originSerial,
              startOffset,
              endOffset
            )
          }));
        }
      }
      const coreOnlyRows = caseRows.filter((row) => (
        row.origin === origin
        && row.populationId === populationId
      ));
      const coreAnnualRows = annualComponentRows.filter((row) => (
        row.origin === origin
        && row.populationId === populationId
      ));
      const tail = buildTailForecast({
        eligible,
        coreSet,
        minimumSourceSerial,
        originSerial
      });
      for (const horizon of config.evaluation.horizonsMonths) {
        const coreHorizonRows = coreOnlyRows.filter(
          (row) => row.horizonMonths === horizon
        );
        const corePrediction = sum(
          coreHorizonRows.map((row) => row.pointEstimate)
        );
        const coreActual = sum(coreHorizonRows.map((row) => row.actual));
        const tailPrediction = tail === null
          ? 0
          : forecastForHorizon(tail.forecast, horizon);
        const tailActual = futureCashForStates(
          source,
          eligible.filter((item) => !coreSet.has(item.standardWorkId)),
          originSerial,
          horizon
        );
        portfolioRows.push(
          portfolioRow({
            origin,
            populationId,
            variant: "CORE_ONLY",
            horizon,
            pointEstimate: corePrediction,
            actual: coreActual,
            coreWorkCount: coreWorkIds.length,
            eligibleWorkChannelCount: selectedStates.length,
            tailKSource: null
          }),
          portfolioRow({
            origin,
            populationId,
            variant: "CORE_PLUS_POOLED_TAIL",
            horizon,
            pointEstimate: corePrediction + tailPrediction,
            actual: coreActual + tailActual,
            coreWorkCount: coreWorkIds.length,
            eligibleWorkChannelCount: eligible.length,
            tailKSource: tail?.forecast?.kSource ?? "NO_ELIGIBLE_TAIL"
          })
        );
      }
      for (const [component, startOffset, endOffset] of [
        ["Y1", 1, 12],
        ["Y2", 13, 24],
        ["Y3", 25, 36]
      ]) {
        const selectedAnnualRows = coreAnnualRows.filter(
          (row) => row.annualComponent === component
        );
        const corePrediction = sum(
          selectedAnnualRows.map((row) => row.pointEstimate)
        );
        const coreActual = sum(
          selectedAnnualRows.map((row) => row.actual)
        );
        const tailPrediction = tail?.forecast?.[component] ?? 0;
        const tailActual = futureCashForStatesRange(
          source,
          eligible.filter((item) => !coreSet.has(item.standardWorkId)),
          originSerial,
          startOffset,
          endOffset
        );
        portfolioAnnualRows.push(
          Object.freeze({
            origin,
            populationId,
            variant: "CORE_ONLY",
            annualComponent: component,
            pointEstimate: corePrediction,
            actual: coreActual
          }),
          Object.freeze({
            origin,
            populationId,
            variant: "CORE_PLUS_POOLED_TAIL",
            annualComponent: component,
            pointEstimate: corePrediction + tailPrediction,
            actual: coreActual + tailActual
          })
        );
      }
      populationDiagnostics.push(Object.freeze({
        populationId,
        selectedWorkCount: coreWorkIds.length,
        eligibleSelectedWorkChannelCount: selectedStates.length,
        eligibleTailWorkChannelCount:
          eligible.length - selectedStates.length,
        referenceRevenueCapture: sum(
          selection.ranked
            .filter((row) => coreSet.has(row.standardWorkId))
            .map((row) => row.referenceRevenue)
        ) / selection.referenceRevenueTotal,
        selectedWorkCountShare: selection.ranked.length === 0
          ? 0
          : coreWorkIds.length / selection.ranked.length
      }));
    }
    originDiagnostics.push(Object.freeze({
      origin,
      status: "EVALUATED",
      referenceWindow: selection.referenceWindow,
      rankedWorkCount: selection.ranked.length,
      eligibleWorkChannelCount: eligible.length,
      populations: Object.freeze(populationDiagnostics)
    }));
  }
  return Object.freeze({
    schema: "m2.current.core_revenue_manual.rolling_result.v0.1",
    modelId: M2_CORE_REVENUE_MANUAL_MODEL_ID,
    experimentId: M2_CORE_REVENUE_MANUAL_EXPERIMENT_ID,
    origins: Object.freeze(originList),
    caseRows: Object.freeze(caseRows.sort(compareCaseRows)),
    annualComponentRows: Object.freeze(
      annualComponentRows.sort(compareAnnualRows)
    ),
    portfolioRows: Object.freeze(portfolioRows.sort(comparePortfolioRows)),
    portfolioAnnualRows: Object.freeze(
      portfolioAnnualRows.sort(comparePortfolioAnnualRows)
    ),
    originDiagnostics: Object.freeze(originDiagnostics)
  });
}

export function buildM2CoreRevenueManualSyntheticDiagnostic(
  fixture,
  config
) {
  validateM2CoreRevenueManualConfig(config);
  const coreSelection = fixture.coreSelectionCases.map((item) => {
    const selected = selectCoreRevenuePopulations({
      origin: item.origin,
      monthlyWorkCash: item.monthlyWorkCash
    });
    return Object.freeze({
      id: item.id,
      status: selected.status,
      referenceStart: selected.referenceWindow.start,
      referenceEnd: selected.referenceWindow.end,
      orderedWorks: selected.ranked.map((row) => row.standardWorkId),
      core80: selected.populations.CORE80,
      core90: selected.populations.CORE90
    });
  });
  const forecasts = fixture.forecastCases.map((item) => {
    const base = forecastCoreRevenueManual(item.monthlyCash);
    const resolvedK = resolveCoreRevenueK({
      directK: base.directK,
      channelUid: "SYNTHETIC_CHANNEL",
      level2Category: "SYNTHETIC_CATEGORY",
      fallbackIndex: buildCoreDirectKFallbackIndex([])
    });
    return Object.freeze({
      id: item.id,
      ...(
        base.status === "ELIGIBLE"
          ? applyCoreRevenueLongTermForecast(base, resolvedK)
          : base
      )
    });
  });
  const kFallbacks = fixture.kFallbackCases.map((item) => {
    const index = buildCoreDirectKFallbackIndex([
      ...item.categoryDirectK.map((directK) => ({
        channelUid: item.channelUid,
        level2Category: item.level2Category,
        directK
      })),
      ...item.channelDirectK.map((directK) => ({
        channelUid: item.channelUid,
        level2Category: `${item.level2Category}-OTHER`,
        directK
      }))
    ]);
    return Object.freeze({
      id: item.id,
      ...resolveCoreRevenueK({
        channelUid: item.channelUid,
        level2Category: item.level2Category,
        fallbackIndex: index
      })
    });
  });
  const tail = poolEligibleTailMonthlyRows({
    eligibleMonthlyRows: fixture.tailConservationCase.eligibleMonthlyRows,
    coreWorkIds: fixture.tailConservationCase.coreWorkIds
  });
  return Object.freeze({
    schema: "m2.current.core_revenue_manual.public_diagnostic.v0.1",
    modelId: M2_CORE_REVENUE_MANUAL_MODEL_ID,
    experimentId: M2_CORE_REVENUE_MANUAL_EXPERIMENT_ID,
    status: "SYNTHETIC_DIAGNOSTIC_PASS",
    coreSelection,
    forecasts,
    kFallbacks,
    tailConservation: tail,
    boundaries: Object.freeze({
      publicSyntheticOnly: true,
      privateArtifactRead: false,
      modelTrained: false,
      parameterTuned: false,
      futureActualUsedForSelection: false,
      categoryAmountMultiplierUsed: false,
      platformTrendMultiplierUsed: false,
      operationalFallbackModified: false,
      activeCandidateChanged: false,
      approvedForAutomationChanged: false,
      productionModified: false
    })
  });
}

function buildEligibleStates({
  source,
  origin,
  originSerial,
  minimumSourceSerial
}) {
  const groups = groupBy(source, (row) => [
    row.standardWorkId,
    row.channelUid
  ]);
  const result = [];
  for (const rows of groups.values()) {
    const representative = rows[0];
    const first = rows
      .filter((row) => (
        monthToSerial(row.month) <= originSerial
        && row.cash !== 0
      ))
      .sort((left, right) => (
        monthToSerial(left.month) - monthToSerial(right.month)
      ))[0];
    if (!first) {
      continue;
    }
    const firstSerial = monthToSerial(first.month);
    const history = denseCash(
      rows,
      firstSerial,
      originSerial
    );
    if (history.length < 3) {
      continue;
    }
    const windowStart = Math.max(minimumSourceSerial, originSerial - 23);
    const windowCash = denseCash(rows, windowStart, originSerial);
    const twoCompleteWindows =
      originSerial - minimumSourceSerial + 1 >= 24;
    const base = forecastCoreRevenueManual(history, {
      windowCash,
      twoCompleteWindows
    });
    result.push(Object.freeze({
      standardWorkId: representative.standardWorkId,
      channelUid: representative.channelUid,
      level2Category: representative.level2Category,
      settlementMechanism: representative.settlementMechanism,
      firstRevenueMonth: first.month,
      origin,
      monthlyCashBySerial: new Map(
        rows.map((row) => [monthToSerial(row.month), row.cash])
      ),
      base
    }));
  }
  return result.sort((left, right) => (
    stableTextCompare(left.standardWorkId, right.standardWorkId)
    || stableTextCompare(left.channelUid, right.channelUid)
  ));
}

function buildTailForecast({
  eligible,
  coreSet,
  minimumSourceSerial,
  originSerial
}) {
  const tailStates = eligible.filter(
    (item) => !coreSet.has(item.standardWorkId)
  );
  if (tailStates.length === 0) {
    return null;
  }
  const firstSerial = Math.min(
    ...tailStates.map((item) => monthToSerial(item.firstRevenueMonth))
  );
  const history = denseStateCash(tailStates, firstSerial, originSerial);
  const windowStart = Math.max(minimumSourceSerial, originSerial - 23);
  const windowCash = denseStateCash(
    tailStates,
    windowStart,
    originSerial
  );
  const base = forecastCoreRevenueManual(history, {
    windowCash,
    twoCompleteWindows:
      originSerial - minimumSourceSerial + 1 >= 24
  });
  const resolvedK = Number.isFinite(base.directK)
    ? { k: base.directK, sourceLevel: "DIRECT", supportCount: 1 }
    : { k: 1, sourceLevel: "ONE", supportCount: 0 };
  return Object.freeze({
    states: Object.freeze(tailStates),
    forecast: applyCoreRevenueLongTermForecast(base, resolvedK)
  });
}

function futureCashForKey(source, item, originSerial, horizon) {
  return futureCashForKeyRange(
    source,
    item,
    originSerial,
    1,
    horizon
  );
}

function futureCashForKeyRange(
  source,
  item,
  originSerial,
  startOffset,
  endOffset
) {
  return sum(source.filter((row) => (
    row.standardWorkId === item.standardWorkId
    && row.channelUid === item.channelUid
    && monthToSerial(row.month) >= originSerial + startOffset
    && monthToSerial(row.month) <= originSerial + endOffset
  )).map((row) => row.cash));
}

function futureCashForStates(source, states, originSerial, horizon) {
  return futureCashForStatesRange(
    source,
    states,
    originSerial,
    1,
    horizon
  );
}

function futureCashForStatesRange(
  source,
  states,
  originSerial,
  startOffset,
  endOffset
) {
  const keys = new Set(states.map((item) => (
    `${item.standardWorkId}\u0000${item.channelUid}`
  )));
  return sum(source.filter((row) => (
    keys.has(`${row.standardWorkId}\u0000${row.channelUid}`)
    && monthToSerial(row.month) >= originSerial + startOffset
    && monthToSerial(row.month) <= originSerial + endOffset
  )).map((row) => row.cash));
}

function forecastForHorizon(forecast, horizon) {
  if (horizon === 3) return forecast.F3;
  if (horizon === 6) return forecast.F6;
  if (horizon === 12) return forecast.F12;
  if (horizon === 36) return forecast.F36;
  throw new M2CoreRevenueManualContractError(
    "m2_core_revenue_manual_horizon_invalid"
  );
}

function portfolioRow({
  origin,
  populationId,
  variant,
  horizon,
  pointEstimate,
  actual,
  coreWorkCount,
  eligibleWorkChannelCount,
  tailKSource
}) {
  return Object.freeze({
    modelId: M2_CORE_REVENUE_MANUAL_MODEL_ID,
    experimentId: M2_CORE_REVENUE_MANUAL_EXPERIMENT_ID,
    origin,
    populationId,
    variant,
    horizonMonths: horizon,
    pointEstimate,
    actual,
    coreWorkCount,
    eligibleWorkChannelCount,
    tailKSource
  });
}

function normalizeMonthlyRows(rows) {
  const aggregated = new Map();
  for (const row of rows) {
    const normalized = {
      standardWorkId: requireNonempty(
        row?.standardWorkId,
        "standard_work_id"
      ),
      channelUid: requireNonempty(row?.channelUid, "channel_uid"),
      month: serialToMonth(monthToSerial(row?.month)),
      cash: requireFiniteCash(row?.cash),
      level2Category: normalizeCategory(row?.level2Category),
      settlementMechanism: row?.settlementMechanism == null
        ? "UNKNOWN"
        : String(row.settlementMechanism)
    };
    const key = [
      normalized.standardWorkId,
      normalized.channelUid,
      normalized.month
    ].join("\u0000");
    const existing = aggregated.get(key);
    if (
      existing
      && (
        existing.level2Category !== normalized.level2Category
        || existing.settlementMechanism !== normalized.settlementMechanism
      )
    ) {
      throw new M2CoreRevenueManualContractError(
        "m2_core_revenue_manual_static_identity_conflict"
      );
    }
    aggregated.set(key, {
      ...normalized,
      cash: (existing?.cash ?? 0) + normalized.cash
    });
  }
  return [...aggregated.values()].sort((left, right) => (
    stableTextCompare(left.standardWorkId, right.standardWorkId)
    || stableTextCompare(left.channelUid, right.channelUid)
    || stableTextCompare(left.month, right.month)
  ));
}

function groupWorkMonths(workMonth) {
  const workRows = new Map();
  for (const row of workMonth.values()) {
    let item = workRows.get(row.standardWorkId);
    if (!item) {
      item = { standardWorkId: row.standardWorkId, months: {} };
      workRows.set(row.standardWorkId, item);
    }
    item.months[row.month] = (item.months[row.month] ?? 0) + row.cash;
  }
  return [...workRows.values()];
}

function aggregateBy(rows, keyFields) {
  const result = new Map();
  for (const row of rows) {
    const fields = keyFields(row);
    const key = fields.join("\u0000");
    const existing = result.get(key);
    result.set(key, {
      standardWorkId: fields[0],
      month: fields[1],
      cash: (existing?.cash ?? 0) + row.cash
    });
  }
  return result;
}

function groupBy(rows, keyFields) {
  const result = new Map();
  for (const row of rows) {
    const key = keyFields(row).join("\u0000");
    const values = result.get(key) ?? [];
    values.push(row);
    result.set(key, values);
  }
  return result;
}

function denseCash(rows, startSerial, endSerial) {
  const byMonth = new Map(
    rows.map((row) => [monthToSerial(row.month), row.cash])
  );
  const result = [];
  for (let serial = startSerial; serial <= endSerial; serial += 1) {
    result.push(byMonth.get(serial) ?? 0);
  }
  return result;
}

function denseStateCash(states, startSerial, endSerial) {
  const result = [];
  for (let serial = startSerial; serial <= endSerial; serial += 1) {
    let cash = 0;
    for (const state of states) {
      cash += state.monthlyCashBySerial.get(serial) ?? 0;
    }
    result.push(cash);
  }
  return result;
}

function requireWorkCashRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new M2CoreRevenueManualContractError(
      "m2_core_revenue_manual_work_cash_rows_empty"
    );
  }
  return rows.map((row) => ({
    standardWorkId: requireNonempty(
      row?.standardWorkId,
      "standard_work_id"
    ),
    months: row?.months && typeof row.months === "object"
      ? row.months
      : {}
  }));
}

function requireCashArray(values) {
  if (!Array.isArray(values)) {
    throw new M2CoreRevenueManualContractError(
      "m2_core_revenue_manual_cash_array_invalid"
    );
  }
  return values.map(requireFiniteCash);
}

function requireFiniteCash(value) {
  const result = Number(value);
  if (!Number.isFinite(result)) {
    throw new M2CoreRevenueManualContractError(
      "m2_core_revenue_manual_cash_invalid"
    );
  }
  return result;
}

function requireNonempty(value, field) {
  const result = String(value ?? "").trim();
  if (result === "") {
    throw new M2CoreRevenueManualContractError(
      `m2_core_revenue_manual_${field}_missing`
    );
  }
  return result;
}

function normalizeCategory(value) {
  const normalized = String(value ?? "").trim();
  return normalized === "" ? "UNKNOWN" : normalized;
}

function appendMapValue(map, key, value) {
  const values = map.get(key) ?? [];
  values.push(value);
  map.set(key, values);
}

function freezeMedianMap(map) {
  return Object.freeze(Object.fromEntries(
    [...map.entries()]
      .sort(([left], [right]) => stableTextCompare(left, right))
      .map(([key, values]) => [
        key,
        Object.freeze({
          median: median(values),
          count: values.length
        })
      ])
  ));
}

function median(values) {
  const source = [...values].sort((left, right) => left - right);
  if (source.length === 0) {
    return null;
  }
  const middle = Math.floor(source.length / 2);
  return source.length % 2 === 1
    ? source[middle]
    : (source[middle - 1] + source[middle]) / 2;
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function stableTextCompare(left, right) {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareCaseRows(left, right) {
  return (
    stableTextCompare(left.origin, right.origin)
    || stableTextCompare(left.populationId, right.populationId)
    || stableTextCompare(left.standardWorkId, right.standardWorkId)
    || stableTextCompare(left.channelUid, right.channelUid)
    || left.horizonMonths - right.horizonMonths
  );
}

function comparePortfolioRows(left, right) {
  return (
    stableTextCompare(left.origin, right.origin)
    || stableTextCompare(left.populationId, right.populationId)
    || stableTextCompare(left.variant, right.variant)
    || left.horizonMonths - right.horizonMonths
  );
}

function compareAnnualRows(left, right) {
  return (
    stableTextCompare(left.origin, right.origin)
    || stableTextCompare(left.populationId, right.populationId)
    || stableTextCompare(left.standardWorkId, right.standardWorkId)
    || stableTextCompare(left.channelUid, right.channelUid)
    || stableTextCompare(left.annualComponent, right.annualComponent)
  );
}

function comparePortfolioAnnualRows(left, right) {
  return (
    stableTextCompare(left.origin, right.origin)
    || stableTextCompare(left.populationId, right.populationId)
    || stableTextCompare(left.variant, right.variant)
    || stableTextCompare(left.annualComponent, right.annualComponent)
  );
}
