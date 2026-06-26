import { M2_COMMERCIAL_RATING_SUGGESTION_VERSION } from "./ratingCalibration.js";

const HIGH_RATINGS = new Set(["S+", "S", "A"]);
const MID_RATINGS = new Set(["B", "C"]);
const LOW_RATINGS = new Set(["D", "E"]);
const HEALTHY_LIFECYCLES = new Set(["growth", "stable", "rebound"]);
const PROMOTE_LIFECYCLES = new Set(["growth", "rebound"]);
const WEAK_LIFECYCLES = new Set(["declining", "inactive", "long_tail", "insufficient_history"]);

export function calibrateSuggestion(input = {}) {
  const ctx = normalizeSuggestionInput(input);
  const result = chooseSuggestion(ctx);
  const automaticSuggestionSuppressedReason =
    result.noAutomaticSuggestionReason ||
    "M2阶段暂不输出自动运营动作建议；仅保留风险/复核提示，待 M4 业务校准后再启用建议功能。";
  const reviewPrompt = result.reviewPrompt
    ? {
        promptType: result.suggestionType,
        promptChinese: result.reviewPrompt,
        requiredManualChecks: result.requiredManualChecks,
        evidenceSignals: result.evidenceSignals,
        reason: result.whyThisSuggestion
      }
    : null;

  return {
    candidateVersion: M2_COMMERCIAL_RATING_SUGGESTION_VERSION,
    oldSuggestion: ctx.oldSuggestion,
    changed: ctx.oldSuggestion ? ctx.oldSuggestion !== result.suggestionChinese && ctx.oldSuggestion !== result.suggestionType : false,
    suggestion: result.suggestionType,
    suggestionType: result.suggestionType,
    suggestionCn: result.suggestionChinese,
    suggestionChinese: result.suggestionChinese,
    triggerEvidenceCn: result.evidenceSignals,
    evidenceSignals: result.evidenceSignals,
    requiresManualConfirmation: result.requiresManualConfirmation,
    actionabilityLevel: result.actionabilityLevel,
    whyNotOtherSuggestionsCn: result.whyNotOtherSuggestions,
    whyThisSuggestion: result.whyThisSuggestion,
    whyNotOtherSuggestions: result.whyNotOtherSuggestions,
    commercialTermsImpact: result.commercialTermsImpact,
    rightsImpact: result.rightsImpact,
    forecastImpact: result.forecastImpact,
    lifecycleImpact: result.lifecycleImpact,
    revenueModelImpact: result.revenueModelImpact,
    suggestionEvidenceChinese: result.evidenceSignals,
    confidence: result.confidence,
    requiredManualChecks: result.requiredManualChecks,
    suggestionQualityLevel: result.suggestionQualityLevel,
    automaticSuggestionDeleted: true,
    frontSuggestionVisible: false,
    hiddenInternalSuggestionType: result.suggestionType,
    operatingSuggestion: null,
    reviewPrompt,
    riskAndReviewPrompt: result.reviewPrompt || result.whyThisSuggestion || "暂无自动运营动作，仅保留人工复核提示。",
    m4CalibrationCandidateReason: buildM4CalibrationCandidateReason(ctx, result),
    noAutomaticSuggestionReason: automaticSuggestionSuppressedReason
  };
}

function buildM4CalibrationCandidateReason(ctx, result) {
  const reasons = [];
  if (ctx.revenueModel === "unknown_revenue_model") reasons.push("收入模式未识别");
  if (ctx.shelfStatus && ctx.shelfStatus !== "active_on_shelf") reasons.push("货架/版权状态影响前台判断");
  if (ctx.currentRightsStatus !== "active" && ctx.currentRightsStatus !== "perpetual") reasons.push("权利状态需复核");
  if (result.isOperatingSuggestion) reasons.push("原规则会产生运营动作，需进入 M4 校准后再决定是否恢复");
  if (ctx.forecastabilityStatus === "true_forecast_blocked") reasons.push("预测不可用");
  return reasons.length ? reasons.join("；") : "建议作为 M4 校准候选观察，不在 M2 自动给运营动作";
}

function chooseSuggestion(ctx) {
  if (ctx.currentRightsStatus === "expired") {
    if (hasValueSupport(ctx)) {
      return reviewOnly(ctx, {
        type: "renewal_review",
        chinese: "先做续约价值复核和权利核查",
        prompt: "建议人工复核：版权已到期，但历史或预测价值仍有支撑。",
        evidence: ["版权已到期", "历史或预测价值仍有支撑", revenueModelEvidence(ctx)],
        why: "版权状态阻断当前运营，但历史价值不应被清零，需要判断续约或权利恢复价值。",
        checks: ["确认版权是否可续约", "确认到期后收入是否合法", "确认后续运营窗口"]
      });
    }
    return reviewOnly(ctx, {
      type: "observe_only",
      chinese: "仅归档观察，暂不建议续约或运营动作",
      prompt: "建议人工复核：版权已到期且价值支撑不足。",
      evidence: ["版权已到期", "历史或预测价值支撑不足"],
      why: "低价值且权利已到期，不生成强动作。",
      checks: ["如业务仍关注，人工复核权利状态"]
    });
  }

  if (ctx.currentRightsStatus === "unknown" || ctx.currentRightsStatus === "pending_review") {
    return reviewOnly(ctx, {
      type: "manual_review_required",
      chinese: "暂无自动运营建议，仅建议人工复核/观察",
      prompt: "建议人工复核：版权状态未知或待复核。",
      evidence: ["版权状态未知或待复核", revenueModelEvidence(ctx)],
      why: "权利状态不足以支持自动运营动作。",
      checks: ["确认版权开始/到期", "确认当前是否可运营"]
    });
  }

  if (ctx.shelfStatus === "off_shelf_but_tail_revenue") {
    return reviewOnly(ctx, {
      type: "rights_audit",
      chinese: "先做权利核查和尾部收入归因",
      prompt: "建议人工复核：疑似下架后仍有尾部收入，需确认收入来源和权利状态。",
      evidence: ["下架后尾部收入信号", revenueModelEvidence(ctx), salesRatingEvidence(ctx)],
      why: "尾部收入不能直接支持推广或下架动作，必须先确认权利和收入来源。",
      checks: ["确认是否已下架", "确认尾部收入是否来自会员/已购用户", "确认权利状态"]
    });
  }

  if (ctx.shelfStatus === "rights_expired_likely_off_shelf") {
    return reviewOnly(ctx, {
      type: hasValueSupport(ctx) ? "renewal_review" : "observe_only",
      chinese: hasValueSupport(ctx) ? "先做续约价值复核" : "仅归档观察",
      prompt: hasValueSupport(ctx) ? "建议人工复核：版权到期且历史/预测有价值。" : "建议观察：版权到期且价值支撑不足。",
      evidence: ["版权到期且大概率下架", revenueModelEvidence(ctx), salesRatingEvidence(ctx)],
      why: "版权到期影响当前运营，但不改写历史评级。",
      checks: ["确认续约价值", "确认下架状态"]
    });
  }

  if (
    ctx.currentRightsStatus === "active" &&
    ctx.forecastOutputType === "copyright_term_forecast" &&
    ctx.remainingCopyrightMonths != null &&
    ctx.remainingCopyrightMonths <= 12 &&
    hasValueSupport(ctx)
  ) {
    return reviewOnly(ctx, {
      type: "renewal_review",
      chinese: "先做续约价值复核",
      prompt: "建议人工复核：版权期临近结束且历史或预测价值有支撑。",
      evidence: ["剩余版权期较短", "历史或预测价值有支撑", revenueModelEvidence(ctx)],
      why: "临近到期作品不直接给推广或下架动作，先确认续约价值和权利窗口。",
      checks: ["确认版权到期时间", "确认续约成本和可运营窗口"]
    });
  }

  if (ctx.revenueModel === "unknown_revenue_model") {
    return reviewOnly(ctx, {
      type: "manual_review_required",
      chinese: "暂无自动运营建议，仅建议人工复核/观察",
      prompt: "建议人工复核：收入模式未知，不能判断买断、实销或混合收入逻辑。",
      evidence: ["收入模式未知", `评级=${ctx.rating || "未知"}`, lifecycleEvidence(ctx)],
      why: "缺少足够证据，不自动给运营动作。",
      checks: ["确认收入是否为买断、实销或买断+实销"]
    });
  }

  if (isForecastBlocked(ctx)) {
    return reviewOnly(ctx, {
      type: "manual_review_required",
      chinese: "暂无自动运营建议，仅建议人工复核/观察",
      prompt: "建议人工复核：预测或业务动作仍处于阻断/观察状态。",
      evidence: ["预测或业务动作仍处于阻断状态", revenueModelEvidence(ctx)],
      why: "预测不可用时不生成强运营建议。",
      checks: ["确认预测阻断原因是否已解除"]
    });
  }

  if (shouldPromote(ctx)) {
    return operating(ctx, {
      type: "promote",
      chinese: "可考虑加大分发或重点推广",
      actionability: "需人工确认",
      evidence: ["高价值评级", revenueModelEvidence(ctx), lifecycleEvidence(ctx), "版权可运营", forecastEvidence(ctx)],
      why: "高价值、收入模式可信、生命周期和预测均支持进一步分发，但仍需人工确认资源投入。",
      whyNot: ["不自动执行推广：仍需确认渠道资源和近期收入是否异常"],
      checks: ["确认近期收入不是异常峰值", "确认渠道投放资源"]
    });
  }

  if (shouldMaintain(ctx)) {
    return operating(ctx, {
      type: "maintain",
      chinese: "维持当前运营",
      actionability: "可执行",
      evidence: [revenueModelEvidence(ctx), lifecycleEvidence(ctx), "权利可运营"],
      why: "收入模式和生命周期支持持续价值，但未达到强推广门槛。",
      whyNot: ["不加大推广：缺少强增长或高预测证据", "不下架：仍有持续价值支撑"],
      checks: []
    });
  }

  if (shouldReduce(ctx)) {
    return operating(ctx, {
      type: "reduce_investment",
      chinese: "降低增量投入，保留观察",
      actionability: "仅供参考",
      evidence: [revenueModelEvidence(ctx), lifecycleEvidence(ctx), `评级=${ctx.rating}`],
      why: "收入或生命周期转弱，但仍有部分价值，不建议直接下架。",
      whyNot: ["不下架：仍存在历史或尾部价值", "不推广：证据不足"],
      checks: []
    });
  }

  if (shouldDownlist(ctx)) {
    return reviewOnly(ctx, {
      type: "downlist_or_suspend",
      chinese: "下架或暂停运营候选",
      prompt: "建议人工复核：只有极低价值、长期无收入且无买断/续约价值时才可考虑下架。",
      evidence: ["低历史价值", lifecycleEvidence(ctx), revenueModelEvidence(ctx)],
      why: "下架是高风险动作，必须人工确认，避免误伤高历史价值、买断或稳定收入作品。",
      checks: ["确认长期无收入", "确认无买断保留价值", "确认无续约价值"]
    });
  }

  return reviewOnly(ctx, {
    type: "manual_review_required",
    chinese: "暂无自动运营建议，仅建议人工复核/观察",
    prompt: "建议人工复核：缺少足够证据，不自动给运营动作。",
    evidence: [`评级=${ctx.rating || "未知"}`, revenueModelEvidence(ctx), lifecycleEvidence(ctx)],
    why: "结构化证据不足以形成有启发性的运营建议。",
    checks: ["人工复核收入模式、生命周期、权利状态和近期收入"]
  });
}

function shouldPromote(ctx) {
  return (
    (HIGH_RATINGS.has(ctx.salesPerformanceRating) || HIGH_RATINGS.has(ctx.rating)) &&
    ["pure_sales_share", "buyout_plus_sales"].includes(ctx.revenueModel) &&
    PROMOTE_LIFECYCLES.has(ctx.lifecycle) &&
    ctx.forecastConfidence !== "low" &&
    ctx.forecastabilityStatus === "numeric_forecast_eligible" &&
    ctx.currentRightsStatus === "active" &&
    isActiveShelf(ctx) &&
    !ctx.hasHighRisk
  );
}

function shouldMaintain(ctx) {
  return (
    (HIGH_RATINGS.has(ctx.rating) || MID_RATINGS.has(ctx.rating)) &&
    ["pure_sales_share", "buyout_plus_sales", "pure_buyout"].includes(ctx.revenueModel) &&
    HEALTHY_LIFECYCLES.has(ctx.lifecycle) &&
    ctx.currentRightsStatus === "active" &&
    isActiveShelf(ctx)
  );
}

function shouldReduce(ctx) {
  return (
    (MID_RATINGS.has(ctx.rating) || ctx.rating === "D") &&
    WEAK_LIFECYCLES.has(ctx.lifecycle) &&
    ["pure_sales_share", "buyout_plus_sales"].includes(ctx.revenueModel) &&
    isActiveShelf(ctx)
  );
}

function shouldDownlist(ctx) {
  return (
    LOW_RATINGS.has(ctx.rating) &&
    ["inactive", "long_tail"].includes(ctx.lifecycle) &&
    ctx.revenueModel !== "pure_buyout" &&
    ctx.revenueModel !== "buyout_plus_sales" &&
    ctx.salesRevenue12m <= 100 &&
    ctx.currentRightsStatus !== "expired"
  );
}

function isForecastBlocked(ctx) {
  return (
    ctx.forecastabilityStatus === "true_forecast_blocked" ||
    ctx.forecastabilityStatus === "observe_only_no_numeric_forecast" ||
    ctx.businessActionStatus === "action_blocked" ||
    ctx.businessActionStatus === "observe_only"
  );
}

function operating(ctx, options) {
  return baseSuggestion(ctx, {
    ...options,
    prompt: options.checks.length ? `建议人工确认：${options.checks.join("；")}` : "",
    isOperatingSuggestion: true,
    requiresManualConfirmation: options.actionability !== "可执行",
    noAutomaticSuggestionReason: null,
    quality: options.actionability === "可执行" ? "有证据" : "有证据但需人工确认",
    confidence: ctx.forecastConfidence || "medium"
  });
}

function reviewOnly(ctx, options) {
  return baseSuggestion(ctx, {
    ...options,
    actionability: options.type === "renewal_review" ? "需人工确认" : "不建议自动动作",
    whyNot: ["不输出强建议：证据不足或权利/收入模式需要复核"],
    isOperatingSuggestion: false,
    requiresManualConfirmation: true,
    noAutomaticSuggestionReason: options.why || "缺少足够证据，不自动给运营动作。",
    quality: "复核提示",
    confidence: "low"
  });
}

function baseSuggestion(ctx, options) {
  return {
    suggestionType: options.type,
    suggestionChinese: options.chinese,
    reviewPrompt: options.prompt || "",
    actionabilityLevel: options.actionability,
    evidenceSignals: [...new Set((options.evidence || []).filter(Boolean))],
    commercialTermsImpact: commercialImpact(ctx),
    rightsImpact: rightsImpact(ctx),
    forecastImpact: forecastImpact(ctx),
    lifecycleImpact: lifecycleEvidence(ctx),
    revenueModelImpact: revenueModelEvidence(ctx),
    whyThisSuggestion: options.why,
    whyNotOtherSuggestions: options.whyNot || [],
    confidence: options.confidence,
    requiredManualChecks: options.checks || [],
    suggestionQualityLevel: options.quality,
    isOperatingSuggestion: options.isOperatingSuggestion,
    requiresManualConfirmation: options.requiresManualConfirmation,
    noAutomaticSuggestionReason: options.noAutomaticSuggestionReason
  };
}

function hasValueSupport(ctx) {
  return (
    HIGH_RATINGS.has(ctx.rating) ||
    HIGH_RATINGS.has(ctx.salesPerformanceRating) ||
    HIGH_RATINGS.has(ctx.buyoutHistoricalValueRating) ||
    ctx.rating === "B" ||
    ctx.salesPerformanceRating === "B" ||
    ["top", "high", "medium", "mid"].includes(ctx.revenueBucket)
  );
}

function isActiveShelf(ctx) {
  return !ctx.shelfStatus || ctx.shelfStatus === "active_on_shelf";
}

function revenueModelEvidence(ctx) {
  return ctx.revenueModelChinese ? `收入模式=${ctx.revenueModelChinese}` : `收入模式=${ctx.revenueModel || "未知"}`;
}

function salesRatingEvidence(ctx) {
  return ctx.salesPerformanceRating ? `实销评级=${ctx.salesPerformanceRating}` : `展示评级=${ctx.rating || "未知"}`;
}

function lifecycleEvidence(ctx) {
  return ctx.lifecycle ? `生命周期=${ctx.lifecycle}` : "生命周期未知";
}

function forecastEvidence(ctx) {
  return `预测状态=${ctx.forecastabilityStatus || "未知"}，置信度=${ctx.forecastConfidence || "未知"}`;
}

function commercialImpact(ctx) {
  if (ctx.revenueModel === "pure_buyout") return "收入行为更像纯买断，不按普通持续实销逻辑给推广建议。";
  if (ctx.revenueModel === "buyout_plus_sales") return "收入行为同时包含买断和实销尾部，建议分层评估买断收入与实销收入。";
  if (ctx.revenueModel === "pure_sales_share") return "收入行为更像持续实销/分成，建议关注连续性、波动和生命周期。";
  return "收入模式未知，建议降级为人工复核。";
}

function rightsImpact(ctx) {
  if (ctx.currentRightsStatus === "expired") return "版权已到期，当前不可直接运营。";
  if (ctx.currentRightsStatus === "unknown") return "版权状态未知，需要权利核查。";
  if (ctx.currentRightsStatus === "pending_review") return "版权状态待复核。";
  if (ctx.currentRightsStatus === "perpetual") return "版权长期有效或无限期。";
  return "版权有效。";
}

function forecastImpact(ctx) {
  if (ctx.forecastabilityStatus === "true_forecast_blocked") return "预测不可用，不能支撑自动运营动作。";
  if (ctx.forecastabilityStatus === "conservative_numeric_forecast") return "仅可保守预测，建议保持谨慎。";
  if (ctx.forecastabilityStatus === "numeric_forecast_eligible") return "可输出数值预测。";
  return "预测证据不足或仅观察。";
}

function normalizeSuggestionInput(input) {
  const revenueModel = clean(input.revenueModel ?? input.revenueModelClassification?.revenueModel);
  const commercialModel = clean(input.commercialModel ?? input.commercialTerms?.commercialModel);
  return {
    rating: clean(input.rating ?? input.calibratedRating ?? input.displayRatingCode),
    oldSuggestion: clean(input.currentSuggestion ?? input.suggestion),
    lifecycle: clean(input.lifecycle),
    revenueBucket: clean(input.revenueBucket ?? input.revenueScale),
    forecastabilityStatus: clean(input.forecastabilityStatus),
    forecastConfidence: clean(input.forecastConfidence ?? input.confidence),
    businessActionStatus: clean(input.businessActionStatus),
    forecastOutputType: clean(input.forecastOutputType),
    remainingCopyrightMonths: numberOrNull(input.remainingCopyrightMonths),
    currentRightsStatus: clean(input.currentRightsStatus ?? input.rightsStatus) || "unknown",
    revenueModel: revenueModel || revenueModelFromLegacyCommercial(commercialModel),
    revenueModelChinese: clean(input.revenueModelChinese ?? input.revenueModelClassification?.revenueModelChinese),
    salesPerformanceRating: clean(input.salesPerformanceRating),
    buyoutHistoricalValueRating: clean(input.buyoutHistoricalValueRating),
    shelfStatus: clean(input.shelfStatus ?? input.shelfStatusInference?.shelfStatus),
    shelfStatusChinese: clean(input.shelfStatusChinese ?? input.shelfStatusInference?.shelfStatusChinese),
    salesRevenue12m: numberOrNull(input.salesRevenue12m) ?? 0,
    hasHighRisk: asArray(input.riskCodes ?? input.risks).some((risk) =>
      ["abnormal_spike", "copyright_date_conflict", "mapping_uncertainty"].includes(risk)
    )
  };
}

function revenueModelFromLegacyCommercial(commercialModel) {
  if (commercialModel === "buyout") return "pure_buyout";
  if (commercialModel === "revenue_share" || commercialModel === "royalty" || commercialModel === "prepaid_royalty") return "pure_sales_share";
  return "unknown_revenue_model";
}

function asArray(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  if (!value) return [];
  return [clean(value)].filter(Boolean);
}

function clean(value) {
  return value == null ? "" : String(value).trim();
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
