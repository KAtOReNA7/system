export const REVENUE_MODELS = Object.freeze({
  PURE_SALES_SHARE: "pure_sales_share",
  PURE_BUYOUT: "pure_buyout",
  BUYOUT_PLUS_SALES: "buyout_plus_sales",
  UNKNOWN: "unknown_revenue_model"
});

export const CHANNEL_REVENUE_MODELS = Object.freeze({
  SALES_SHARE: "sales_share_channel",
  BUYOUT: "buyout_channel",
  MIXED: "mixed_channel",
  UNKNOWN: "unknown_channel"
});

const MODEL_LABELS = Object.freeze({
  pure_sales_share: "纯实销/纯分成",
  pure_buyout: "纯买断",
  buyout_plus_sales: "买断+实销",
  unknown_revenue_model: "收入模式未知"
});

const MIN_BUYOUT_NO_SALES_MONTHS = 12;

export function computeBillingPatternFeatures(input = {}) {
  const values = monthlyValues(input);
  const observableMonthCount = Number(input.observableMonthCount ?? values.length) || values.length || 0;
  const positive = values.filter((value) => value > 0);
  const positiveIncomeTotal = sum(positive);
  const largestMonthIncome = positive.length ? Math.max(...positive) : 0;
  const incomeMonthCount = positive.length;
  const zeroMonthCount = Math.max(0, observableMonthCount - incomeMonthCount);
  const activeMonthRatio = observableMonthCount > 0 ? incomeMonthCount / observableMonthCount : 0;
  const largestMonthShare = positiveIncomeTotal > 0 ? largestMonthIncome / positiveIncomeTotal : 0;
  const integerAmountRatio = ratio(positive, (value) => isNearInteger(value));
  const roundAmountRatio = ratio(positive, (value) => isRoundAmount(value));
  const repeatedAmountClusterCount = Number(input.repeatedAmountClusterCount ?? 0) || 0;
  const sameAmountSiblingWorks = Number(input.sameAmountSiblingWorks ?? 0) || 0;
  const equalSplitSignal = Boolean(input.equalSplitSignal) || sameAmountSiblingWorks >= 2 || repeatedAmountClusterCount >= 2;
  const continuityScore = continuity(values);
  const randomnessScore = randomness(values);
  const spikeScore = largestMonthShare;
  const postBuyoutTailSalesSignal = hasPostBuyoutTail(values, largestMonthIncome);
  const postLargePaymentObservedMonthCount = postPeakObservedMonthCount(values, largestMonthIncome);
  const postLargePaymentPositiveMonthCount = postPeakPositiveMonthCount(values, largestMonthIncome);
  const postLargePaymentNoSalesMonthCount =
    postLargePaymentPositiveMonthCount === 0 ? postLargePaymentObservedMonthCount : 0;
  const postLargePaymentNoSalesSignal = postLargePaymentNoSalesMonthCount >= MIN_BUYOUT_NO_SALES_MONTHS;
  const largeIntegerPaymentSignal = largestMonthIncome >= 1000 && isNearInteger(largestMonthIncome);
  const largeRoundPaymentSignal = largestMonthIncome >= 1000 && isRoundAmount(largestMonthIncome);
  const businessFormMix = clean(input.businessFormMix) || businessFormMixFromCounts(input);

  return {
    incomeMonthCount,
    observableMonthCount,
    activeMonthRatio: round(activeMonthRatio),
    zeroMonthCount,
    positiveIncomeTotal: round(positiveIncomeTotal, 2),
    largestMonthIncome: round(largestMonthIncome, 2),
    largestMonthShare: round(largestMonthShare),
    integerAmountRatio: round(integerAmountRatio),
    roundAmountRatio: round(roundAmountRatio),
    repeatedAmountClusterCount,
    sameAmountSiblingWorks,
    equalSplitSignal,
    equalSplitSignalScore: round(equalSplitSignal ? Math.min(1, 0.35 + sameAmountSiblingWorks / 10 + repeatedAmountClusterCount / 10) : 0),
    continuityScore: round(continuityScore),
    randomnessScore: round(randomnessScore),
    spikeScore: round(spikeScore),
    postBuyoutTailSalesSignal,
    postLargePaymentObservedMonthCount,
    postLargePaymentPositiveMonthCount,
    postLargePaymentNoSalesMonthCount,
    postLargePaymentNoSalesSignal,
    largeIntegerPaymentSignal,
    largeRoundPaymentSignal,
    businessFormMix,
    latestIncomeMonth: clean(input.latestIncomeMonth),
    firstPositiveMonth: clean(input.firstPositiveMonth)
  };
}

export function classifyRevenueModel(input = {}) {
  const channelPatterns = input.channelPatterns ?? input.channelClassifications;
  if (Array.isArray(channelPatterns) && channelPatterns.length > 0) {
    return aggregateWorkRevenueModel(channelPatterns, input);
  }

  const features = input.features ? { ...input.features } : computeBillingPatternFeatures(input);
  const buyoutSignalScore = scoreBuyout(features);
  const salesContinuityScore = scoreSalesContinuity(features);
  const equalSplitSignalScore = Number(features.equalSplitSignalScore ?? 0);
  const reasons = [];

  let revenueModel = REVENUE_MODELS.UNKNOWN;
  let confidence = "low";
  let manualReviewRequired = true;

  if (features.positiveIncomeTotal <= 0) {
    revenueModel = REVENUE_MODELS.UNKNOWN;
    confidence = "low";
    reasons.push("历史收入月份或金额不足，无法稳定区分买断与实销");
  } else if (
    features.incomeMonthCount < 2 &&
    hasAnyBuyoutSignal(features)
  ) {
    revenueModel = REVENUE_MODELS.PURE_BUYOUT;
    confidence = buyoutSignalScore >= 0.82 ? "high" : "medium";
    manualReviewRequired = confidence !== "high";
    reasons.push("大额整数/同批次同额/买断后无实销三类信号中至少同时命中两类，可识别为纯买断");
  } else if (features.incomeMonthCount < 2) {
    revenueModel = REVENUE_MODELS.PURE_SALES_SHARE;
    confidence = "low";
    manualReviewRequired = false;
    reasons.push("有效账单收入未同时满足至少两类买断信号，按单月实销样本计入实销口径");
  } else if (
    buyoutSignalScore >= 0.70 &&
    hasAnyBuyoutSignal(features)
  ) {
    revenueModel = REVENUE_MODELS.PURE_BUYOUT;
    confidence = buyoutSignalScore >= 0.82 ? "high" : "medium";
    manualReviewRequired = confidence !== "high";
    reasons.push("大额整数/同批次同额/买断后无实销三类信号中至少同时命中两类，可识别为纯买断");
  } else if (salesContinuityScore >= 0.58 && buyoutSignalScore < 0.56) {
    revenueModel = REVENUE_MODELS.PURE_SALES_SHARE;
    confidence = salesContinuityScore >= 0.72 ? "high" : "medium";
    manualReviewRequired = false;
    reasons.push("多个收入月份连续或半连续，金额呈自然波动，未见强买断批次信号");
  } else {
    revenueModel = REVENUE_MODELS.UNKNOWN;
    confidence = "low";
    reasons.push("买断信号与实销连续信号均不充分或互相冲突");
  }

  const buyoutEstimatedAmount = estimateBuyoutAmount(features, revenueModel);
  const salesTailEstimatedAmount = Math.max(0, Number(features.positiveIncomeTotal ?? 0) - buyoutEstimatedAmount);

  return {
    revenueModel,
    revenueModelChinese: MODEL_LABELS[revenueModel],
    revenueModelConfidence: confidence,
    buyoutSignalScore: round(buyoutSignalScore),
    salesContinuityScore: round(salesContinuityScore),
    salesSignalScore: round(salesContinuityScore),
    equalSplitSignalScore: round(equalSplitSignalScore),
    classificationReason: reasons,
    manualReviewRequired,
    buyoutEstimatedAmount: round(buyoutEstimatedAmount, 2),
    salesTailEstimatedAmount: round(salesTailEstimatedAmount, 2),
    evidenceSummaryChinese: buildEvidenceSummary(features, revenueModel, buyoutSignalScore, salesContinuityScore),
    features
  };
}

export function computeChannelBillingPatternFeatures(input = {}) {
  const base = computeBillingPatternFeatures(input);
  const postLargePaymentTailMonthCount = Number(input.postLargePaymentTailMonthCount ?? tailMonthCount(input)) || 0;
  const postLargePaymentTailRevenue = Number(input.postLargePaymentTailRevenue ?? tailRevenue(input)) || 0;
  const sameMonthSameAmountClusterSize = Number(input.sameMonthSameAmountClusterSize ?? input.sameAmountSiblingWorks ?? 0) || 0;
  const adjacentRowsSameAmountSignal = Boolean(input.adjacentRowsSameAmountSignal) || sameMonthSameAmountClusterSize >= 2;
  const naturalSalesSequenceSignal =
    base.incomeMonthCount >= 4 &&
    base.continuityScore >= 0.45 &&
    base.randomnessScore >= 0.12 &&
    base.largestMonthShare < 0.85;
  return {
    positiveMonthCount: base.incomeMonthCount,
    observedMonthCount: base.observableMonthCount,
    activeMonthRatio: base.activeMonthRatio,
    monthlyContinuityScore: base.continuityScore,
    amountVariationScore: base.randomnessScore,
    nonStandardAmountRatio: round(1 - base.integerAmountRatio),
    integerAmountRatio: base.integerAmountRatio,
    roundAmountRatio: base.roundAmountRatio,
    singleLargeMonthShare: base.largestMonthShare,
    sameMonthSameAmountClusterSize,
    adjacentRowsSameAmountSignal,
    equalSplitBatchSignal: base.equalSplitSignal || adjacentRowsSameAmountSignal,
    postLargePaymentTailMonthCount,
    postLargePaymentTailRevenue: round(postLargePaymentTailRevenue, 2),
    naturalSalesSequenceSignal,
    ...base
  };
}

// User-confirmed channel-first billing rules:
// - Sales share is identified per channel when income is multi-month, continuous
//   or semi-continuous; an early high month is not a buyout signal by itself.
// - Buyout is identified per channel only when at least two user-confirmed
//   buyout signal families appear together: large round/integer-like one-off
//   payment, same-batch equal/similar amounts, or a post-candidate no-sales
//   window. One signal alone is too weak and must remain sales/share evidence.
// - Buyout plus sales is a work-level aggregation: one channel/stage can be
//   buyout while another channel/stage is sales share.
// - Unknown is reserved for sparse or conflicting evidence and should remain low.
export function classifyChannelRevenueModel(input = {}) {
  const features = input.features ? { ...input.features } : computeChannelBillingPatternFeatures(input);
  const buyoutSignalScore = channelBuyoutScore(features);
  const salesSignalScore = channelSalesScore(features);
  let channelRevenueModel = CHANNEL_REVENUE_MODELS.UNKNOWN;
  let confidence = "low";
  const reasons = [];

  if (features.positiveIncomeTotal <= 0 || features.positiveMonthCount <= 0) {
    reasons.push("渠道没有可判定的正收入月份");
  } else if (hasAnyBuyoutSignal(features)) {
    channelRevenueModel = CHANNEL_REVENUE_MODELS.BUYOUT;
    confidence = buyoutSignalScore >= 0.68 ? "medium" : "low";
    reasons.push("渠道在大额整数/同批次同额/买断后无实销三类信号中至少同时命中两类，按买断渠道处理");
  } else if (
    features.naturalSalesSequenceSignal &&
    Number(features.positiveMonthCount ?? features.incomeMonthCount) >= 4 &&
    Number(features.postLargePaymentTailMonthCount) >= 2
  ) {
    channelRevenueModel = CHANNEL_REVENUE_MODELS.SALES_SHARE;
    confidence = Number(features.positiveMonthCount ?? features.incomeMonthCount) >= 6 ? "high" : "medium";
    reasons.push("渠道存在连续多月自然实销序列，优先按实销/分成处理，不因整额或同批次信号直接判买断");
  } else if (salesSignalScore >= 0.5 && buyoutSignalScore < 0.68) {
    channelRevenueModel = CHANNEL_REVENUE_MODELS.SALES_SHARE;
    confidence = salesSignalScore >= 0.68 ? "high" : "medium";
    reasons.push("渠道收入连续或半连续，金额呈自然波动，符合实销/分成");
  } else if (features.positiveMonthCount >= 4 && features.postLargePaymentTailMonthCount >= 3) {
    channelRevenueModel = CHANNEL_REVENUE_MODELS.SALES_SHARE;
    confidence = "medium";
    reasons.push("渠道大额收入后仍有持续实销，按上线前期大卖或自然实销序列处理，不判买断");
  } else if (features.positiveMonthCount >= 3) {
    channelRevenueModel = CHANNEL_REVENUE_MODELS.SALES_SHARE;
    confidence = "low";
    reasons.push("渠道数据虽不强，但多月收入更接近实销而非纯买断");
  } else if (features.positiveMonthCount >= 1) {
    channelRevenueModel = CHANNEL_REVENUE_MODELS.SALES_SHARE;
    confidence = "low";
    reasons.push("有效账单收入未同时满足至少两类买断信号，按单月实销样本计入实销口径");
  } else {
    reasons.push("渠道数据稀少或买断/实销信号冲突，暂无法判定");
  }

  return {
    channelRevenueModel,
    channelRevenueModelConfidence: confidence,
    buyoutSignalScore: round(buyoutSignalScore),
    salesSignalScore: round(salesSignalScore),
    classificationReasonChinese: reasons,
    features
  };
}

export function aggregateWorkRevenueModel(channelPatterns = [], input = {}) {
  const channels = channelPatterns.map((channel) =>
    channel.channelRevenueModel ? channel : classifyChannelRevenueModel(channel)
  );
  const countByModel = channels.reduce((acc, channel) => {
    const model = channel.channelRevenueModel ?? CHANNEL_REVENUE_MODELS.UNKNOWN;
    acc[model] = (acc[model] ?? 0) + 1;
    return acc;
  }, {});
  const hasSales = channels.some((channel) => channel.channelRevenueModel === CHANNEL_REVENUE_MODELS.SALES_SHARE);
  const hasBuyout = channels.some((channel) => channel.channelRevenueModel === CHANNEL_REVENUE_MODELS.BUYOUT);
  const hasMixed = channels.some((channel) => channel.channelRevenueModel === CHANNEL_REVENUE_MODELS.MIXED);
  const totalRevenue = channels.reduce((sumValue, channel) => sumValue + Number(channel.positiveIncomeTotal ?? channel.features?.positiveIncomeTotal ?? 0), 0);
  let buyoutEstimatedAmount = Number(input.buyoutEstimatedAmount ?? 0) || 0;
  let salesTailEstimatedAmount = Number(input.salesTailEstimatedAmount ?? 0) || 0;
  for (const channel of channels) {
    const revenue = Number(channel.positiveIncomeTotal ?? channel.features?.positiveIncomeTotal ?? 0);
    const largest = Number(channel.largestMonthIncome ?? channel.features?.largestMonthIncome ?? 0);
    if (channel.channelRevenueModel === CHANNEL_REVENUE_MODELS.BUYOUT) buyoutEstimatedAmount += revenue;
    else if (channel.channelRevenueModel === CHANNEL_REVENUE_MODELS.MIXED) {
      buyoutEstimatedAmount += largest;
      salesTailEstimatedAmount += Math.max(0, revenue - largest);
    } else if (channel.channelRevenueModel === CHANNEL_REVENUE_MODELS.SALES_SHARE) {
      salesTailEstimatedAmount += revenue;
    }
  }

  let revenueModel = REVENUE_MODELS.UNKNOWN;
  let confidence = "low";
  const reasons = [];
  if ((hasBuyout || hasMixed) && (hasSales || hasMixed)) {
    revenueModel = REVENUE_MODELS.BUYOUT_PLUS_SALES;
    confidence = "medium";
    reasons.push("作品同时存在买断渠道和实销渠道，或存在混合渠道");
  } else if (hasSales && !hasBuyout && !hasMixed) {
    revenueModel = REVENUE_MODELS.PURE_SALES_SHARE;
    confidence = "medium";
    reasons.push("作品至少存在一个实销渠道，且没有强买断渠道");
  } else if (hasBuyout && !hasSales && !hasMixed) {
    revenueModel = REVENUE_MODELS.PURE_BUYOUT;
    confidence = "medium";
    reasons.push("作品存在买断渠道，且没有持续实销渠道");
  } else if (totalRevenue > 0 && channels.length > 0) {
    const fallback = classifyRevenueModel({ features: input.features ?? computeBillingPatternFeatures(input) });
    revenueModel = fallback.revenueModel;
    confidence = "low";
    buyoutEstimatedAmount ||= fallback.buyoutEstimatedAmount;
    salesTailEstimatedAmount ||= fallback.salesTailEstimatedAmount;
    reasons.push("渠道级证据不足，回退到作品级账单行为判断");
  } else {
    reasons.push("渠道和作品收入证据均不足");
  }

  const buyoutScores = channels.map((channel) => Number(channel.buyoutSignalScore ?? 0));
  const salesScores = channels.map((channel) => Number(channel.salesSignalScore ?? 0));
  const equalSplitScores = channels.map((channel) => Number(channel.equalSplitSignalScore ?? channel.features?.equalSplitSignalScore ?? 0));
  return {
    revenueModel,
    revenueModelChinese: MODEL_LABELS[revenueModel],
    revenueModelConfidence: confidence,
    channelModelSummary: countByModel,
    channelClassifications: channels,
    buyoutSignalScore: round(Math.max(0, ...buyoutScores)),
    salesSignalScore: round(Math.max(0, ...salesScores)),
    salesContinuityScore: round(Math.max(0, ...salesScores)),
    equalSplitSignalScore: round(Math.max(0, ...equalSplitScores)),
    buyoutEstimatedAmount: round(buyoutEstimatedAmount, 2),
    salesTailEstimatedAmount: round(salesTailEstimatedAmount, 2),
    salesRevenue12m: round(Number(input.salesRevenue12m ?? 0), 2),
    salesRevenueAnnualized: round(Number(input.salesRevenueAnnualized ?? 0), 2),
    classificationReasonChinese: reasons,
    classificationReason: reasons,
    manualReviewRequired: revenueModel === REVENUE_MODELS.UNKNOWN || confidence === "low"
  };
}

function scoreBuyout(features) {
  let score = 0;
  if (Number(features.largestMonthShare) >= 0.8) score += 0.35;
  else if (Number(features.largestMonthShare) >= 0.6) score += 0.25;
  else if (Number(features.largestMonthShare) >= 0.45) score += 0.12;
  if (Number(features.incomeMonthCount) <= 2) score += 0.22;
  else if (Number(features.incomeMonthCount) <= 4) score += 0.14;
  if (Number(features.integerAmountRatio) >= 0.75) score += 0.13;
  if (Number(features.roundAmountRatio) >= 0.5) score += 0.13;
  if (features.equalSplitSignal) score += 0.17;
  if (hasPostBuyoutNoSalesSignal(features)) score += 0.15;
  if (Number(features.postLargePaymentPositiveMonthCount) > 0) score -= 0.2;
  return Math.max(0, Math.min(1, score));
}

function scoreSalesContinuity(features) {
  let score = 0;
  score += Number(features.continuityScore ?? 0) * 0.45;
  score += Math.min(1, Number(features.activeMonthRatio ?? 0) * 2.2) * 0.25;
  score += Number(features.randomnessScore ?? 0) * 0.2;
  if (Number(features.incomeMonthCount) >= 12) score += 0.1;
  else if (Number(features.incomeMonthCount) >= 6) score += 0.05;
  if (Number(features.largestMonthShare) > 0.85) score -= 0.2;
  if (features.equalSplitSignal) score -= 0.08;
  return Math.max(0, Math.min(1, score));
}

function channelBuyoutScore(features) {
  let score = 0;
  if (Number(features.singleLargeMonthShare ?? features.largestMonthShare) >= 0.82) score += 0.3;
  else if (Number(features.singleLargeMonthShare ?? features.largestMonthShare) >= 0.62) score += 0.2;
  if (Number(features.positiveMonthCount ?? features.incomeMonthCount) <= 1) score += 0.22;
  else if (Number(features.positiveMonthCount ?? features.incomeMonthCount) <= 3) score += 0.14;
  if (Number(features.roundAmountRatio) >= 0.5) score += 0.13;
  if (Number(features.integerAmountRatio) >= 0.7) score += 0.09;
  if (features.equalSplitBatchSignal || features.equalSplitSignal) score += 0.18;
  if (features.adjacentRowsSameAmountSignal) score += 0.08;
  if (hasPostBuyoutNoSalesSignal(features)) score += 0.16;
  if (Number(features.postLargePaymentPositiveMonthCount) > 0) score -= 0.24;
  return Math.max(0, Math.min(1, score));
}

function channelSalesScore(features) {
  let score = 0;
  score += Number(features.monthlyContinuityScore ?? features.continuityScore ?? 0) * 0.42;
  score += Math.min(1, Number(features.activeMonthRatio ?? 0) * 2.4) * 0.22;
  score += Number(features.amountVariationScore ?? features.randomnessScore ?? 0) * 0.18;
  score += Math.min(1, Number(features.positiveMonthCount ?? features.incomeMonthCount ?? 0) / 12) * 0.12;
  score += Math.min(1, Number(features.nonStandardAmountRatio ?? 0)) * 0.06;
  if (Number(features.singleLargeMonthShare ?? features.largestMonthShare) > 0.9 && Number(features.postLargePaymentTailMonthCount) < 3) {
    score -= 0.18;
  }
  return Math.max(0, Math.min(1, score));
}

function estimateBuyoutAmount(features, model) {
  if (model === REVENUE_MODELS.PURE_BUYOUT) return Number(features.positiveIncomeTotal ?? 0);
  if (model === REVENUE_MODELS.BUYOUT_PLUS_SALES) return Number(features.largestMonthIncome ?? 0);
  return 0;
}

function hasAnyBuyoutSignal(features) {
  return countBuyoutSignalFamilies(features) >= 2;
}

function countBuyoutSignalFamilies(features) {
  return [
    hasLargeAmountBuyoutSignal(features),
    hasSameBatchBuyoutSignal(features),
    hasNoSalesAfterCandidateBuyoutSignal(features)
  ].filter(Boolean).length;
}

function hasLargeAmountBuyoutSignal(features) {
  return Boolean(
    Number(features.positiveIncomeTotal ?? 0) >= 1000 &&
      Number(features.postLargePaymentPositiveMonthCount ?? 0) === 0 &&
      (features.largeRoundPaymentSignal || features.largeIntegerPaymentSignal)
  );
}

function hasSameBatchBuyoutSignal(features) {
  return Boolean(
    features.equalSplitSignal ||
      features.equalSplitBatchSignal ||
      features.adjacentRowsSameAmountSignal
  );
}

function hasNoSalesAfterCandidateBuyoutSignal(features) {
  return Number(features.positiveIncomeTotal ?? 0) >= 1000 && hasPostBuyoutNoSalesSignal(features);
}

function hasPostBuyoutNoSalesSignal(features) {
  return (
    Boolean(features.postLargePaymentNoSalesSignal) ||
    (Number(features.postLargePaymentNoSalesMonthCount) >= MIN_BUYOUT_NO_SALES_MONTHS &&
      Number(features.postLargePaymentPositiveMonthCount) === 0)
  );
}

function buildEvidenceSummary(features, model, buyoutScore, salesScore) {
  const base = [
    `收入月份=${features.incomeMonthCount}/${features.observableMonthCount}`,
    `最大单月占比=${round(features.largestMonthShare)}`,
    `整额比例=${round(features.roundAmountRatio)}`,
    `连续性=${round(features.continuityScore)}`
  ];
  if (features.equalSplitSignal) base.push("存在同月同额/均分信号");
  if (hasLargeAmountBuyoutSignal(features)) base.push("命中大额整数/整额买断信号");
  if (hasSameBatchBuyoutSignal(features)) base.push("命中同批次同额买断信号");
  if (features.postBuyoutTailSalesSignal) base.push("候选买断月后仍有实销，不作为买断证据");
  if (hasNoSalesAfterCandidateBuyoutSignal(features)) base.push("命中买断后无实销信号");
  base.push(`买断信号=${round(buyoutScore)}`);
  base.push(`实销连续信号=${round(salesScore)}`);
  base.push(`分类=${MODEL_LABELS[model]}`);
  return base.join("；");
}

function monthlyValues(input) {
  const raw = input.monthlyAmounts ?? input.monthlyIncome ?? input.values ?? [];
  if (!Array.isArray(raw)) return [];
  return raw.map((value) => Number(value) || 0);
}

function continuity(values) {
  if (values.length <= 1) return 0;
  const positiveIndexes = values.map((value, index) => (value > 0 ? index : -1)).filter((index) => index >= 0);
  if (positiveIndexes.length <= 1) return positiveIndexes.length === 1 ? 0.1 : 0;
  let adjacent = 0;
  for (let index = 1; index < positiveIndexes.length; index += 1) {
    if (positiveIndexes[index] - positiveIndexes[index - 1] <= 1) adjacent += 1;
  }
  return adjacent / Math.max(1, positiveIndexes.length - 1);
}

function randomness(values) {
  const positive = values.filter((value) => value > 0);
  if (positive.length < 3) return 0;
  const mean = sum(positive) / positive.length;
  if (mean <= 0) return 0;
  const variance = positive.reduce((total, value) => total + (value - mean) ** 2, 0) / positive.length;
  const cv = Math.sqrt(variance) / mean;
  if (cv < 0.05) return 0.1;
  if (cv > 2.5) return 0.45;
  return Math.min(1, cv / 1.2);
}

function hasPostBuyoutTail(values, largestMonthIncome) {
  if (!values.length || largestMonthIncome <= 0) return false;
  const peakIndex = values.findIndex((value) => value === largestMonthIncome);
  if (peakIndex < 0 || peakIndex >= values.length - 2) return false;
  const tail = values.slice(peakIndex + 1);
  const positiveTail = tail.filter((value) => value > 0 && value < largestMonthIncome * 0.35);
  return positiveTail.length >= 3 && continuity(tail) >= 0.35;
}

function postPeakObservedMonthCount(values, largestMonthIncome) {
  if (!values.length || largestMonthIncome <= 0) return 0;
  const peakIndex = values.findIndex((value) => value === largestMonthIncome);
  if (peakIndex < 0) return 0;
  return Math.max(0, values.length - peakIndex - 1);
}

function postPeakPositiveMonthCount(values, largestMonthIncome) {
  if (!values.length || largestMonthIncome <= 0) return 0;
  const peakIndex = values.findIndex((value) => value === largestMonthIncome);
  if (peakIndex < 0) return 0;
  return values.slice(peakIndex + 1).filter((value) => value > 0).length;
}

function tailMonthCount(input) {
  const values = monthlyValues(input);
  if (!values.length) return 0;
  const largest = Math.max(...values);
  if (largest <= 0) return 0;
  const peakIndex = values.findIndex((value) => value === largest);
  return values.slice(peakIndex + 1).filter((value) => value > 0 && value < largest * 0.35).length;
}

function tailRevenue(input) {
  const values = monthlyValues(input);
  if (!values.length) return 0;
  const largest = Math.max(...values);
  if (largest <= 0) return 0;
  const peakIndex = values.findIndex((value) => value === largest);
  return values
    .slice(peakIndex + 1)
    .filter((value) => value > 0 && value < largest * 0.35)
    .reduce((total, value) => total + value, 0);
}

function businessFormMixFromCounts(input) {
  const copyright = Number(input.audioCopyrightRevenue ?? 0);
  const product = Number(input.audioProductRevenue ?? 0);
  if (copyright > 0 && product > 0) return "mixed";
  if (copyright > 0) return "audio_copyright";
  if (product > 0) return "audio_product";
  return "unknown";
}

function ratio(values, predicate) {
  if (!values.length) return 0;
  return values.filter(predicate).length / values.length;
}

function isNearInteger(value) {
  return Math.abs(value - Math.round(value)) <= 0.01;
}

function isRoundAmount(value) {
  const abs = Math.abs(value);
  if (abs < 10) return false;
  return [10, 100, 1000].some((base) => Math.abs(abs / base - Math.round(abs / base)) <= 0.01);
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function clean(value) {
  return value == null ? "" : String(value).trim();
}
