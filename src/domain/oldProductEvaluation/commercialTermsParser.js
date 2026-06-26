export const COMMERCIAL_MODELS = Object.freeze({
  BUYOUT: "buyout",
  ROYALTY: "royalty",
  PREPAID_ROYALTY: "prepaid_royalty",
  REVENUE_SHARE: "revenue_share",
  MIXED: "mixed",
  CONFLICT: "conflict",
  UNKNOWN: "unknown"
});

export const COMMERCIAL_SOURCE_TYPES = Object.freeze({
  FULL_DIGITAL_LEDGER_TERMS: "full_digital_ledger_terms",
  FULL_DIGITAL_LEDGER_EXTRACTED_TAGS: "full_digital_ledger_extracted_tags",
  OPERATION_CONFIRMATION_TAGS: "operation_confirmation_tags",
  ORIGINAL_LIBRARY: "original_library",
  DUAL_SOURCE_CONSISTENT: "dual_source_consistent",
  DUAL_SOURCE_CONFLICT: "dual_source_conflict",
  UNKNOWN: "unknown"
});

const MODEL_LABELS = Object.freeze({
  buyout: "买断",
  royalty: "版税",
  prepaid_royalty: "预付+版税",
  revenue_share: "分成",
  mixed: "混合",
  conflict: "冲突",
  unknown: "未知"
});

const SOURCE_PRIORITY = Object.freeze({
  full_digital_ledger_terms: 5,
  dual_source_consistent: 5,
  full_digital_ledger_extracted_tags: 4,
  operation_confirmation_tags: 3,
  original_library: 2,
  dual_source_conflict: 1,
  unknown: 0
});

export function parseCommercialTerms(input = {}) {
  const signals = collectSignals(input);
  const detected = signals.map((signal) => ({
    ...signal,
    model: modelFromText(signal.value),
    flags: flagsFromText(signal.value),
    sourceType: sourceTypeOf(signal)
  }));

  const usable = detected.filter((signal) => signal.model !== COMMERCIAL_MODELS.UNKNOWN);
  const strongest = strongestSignals(usable);
  const distinctModels = new Set(strongest.map((signal) => signal.model));
  const allFlags = mergeFlags(detected.map((signal) => signal.flags));
  const reasons = [];

  let commercialModel = COMMERCIAL_MODELS.UNKNOWN;
  let confidence = "none";
  let requiresManualCommercialReview = false;

  if (input.sourceType === COMMERCIAL_SOURCE_TYPES.DUAL_SOURCE_CONFLICT || distinctModels.size > 1) {
    commercialModel = COMMERCIAL_MODELS.CONFLICT;
    confidence = "medium";
    requiresManualCommercialReview = true;
    reasons.push("多来源或高优先级来源出现不同商业模式信号，不能自动归类");
  } else if (strongest.length > 0) {
    commercialModel = strongest[0].model;
    confidence = confidenceFor(strongest, input);
    reasons.push(reasonForModel(commercialModel, strongest[0].sourceType));
  } else if (allFlags.prepaidFlag) {
    commercialModel = COMMERCIAL_MODELS.MIXED;
    confidence = "low";
    requiresManualCommercialReview = true;
    reasons.push("仅发现预付信号，缺少版税、买断或分成上下文");
  } else {
    requiresManualCommercialReview = true;
    reasons.push("未发现买断、版税、预付、分成、保底等可用商业模式字段");
  }

  if (commercialModel === COMMERCIAL_MODELS.BUYOUT && allFlags.buyoutScope === "unknown_buyout_scope") {
    requiresManualCommercialReview = true;
    reasons.push("买断范围未明确覆盖有声权利或完整权利，需人工确认权利范围");
  }
  if (allFlags.guaranteeFlag) {
    reasons.push("字段包含保底信号，需结合结算口径复核");
    if (confidence === "none") confidence = "low";
  }
  if (usesOnlyOperationTags(strongest)) {
    reasons.push("当前信号来自运营确认/抽取标签，不能等同完整合同字段");
    if (confidence === "high") confidence = "medium";
    requiresManualCommercialReview = true;
  }

  const commercialTermsSource = summarizeSource(input, detected, strongest);
  const commercialRiskLevel = riskLevel({
    commercialModel,
    confidence,
    requiresManualCommercialReview,
    guaranteeFlag: allFlags.guaranteeFlag,
    buyoutScope: allFlags.buyoutScope
  });

  return {
    commercialModel,
    commercialModelChinese: MODEL_LABELS[commercialModel],
    commercialModelConfidence: confidence,
    commercialTermsSource,
    commercialTermsReason: reasons,
    buyoutFlag: commercialModel === COMMERCIAL_MODELS.BUYOUT || allFlags.buyoutFlag,
    royaltyFlag:
      commercialModel === COMMERCIAL_MODELS.ROYALTY ||
      commercialModel === COMMERCIAL_MODELS.PREPAID_ROYALTY ||
      allFlags.royaltyFlag,
    prepaidFlag: allFlags.prepaidFlag,
    revenueShareFlag: commercialModel === COMMERCIAL_MODELS.REVENUE_SHARE || allFlags.revenueShareFlag,
    guaranteeFlag: allFlags.guaranteeFlag,
    buyoutScope: allFlags.buyoutScope,
    requiresManualCommercialReview:
      requiresManualCommercialReview ||
      [COMMERCIAL_MODELS.MIXED, COMMERCIAL_MODELS.CONFLICT, COMMERCIAL_MODELS.UNKNOWN].includes(commercialModel),
    commercialRiskLevel,
    evidenceSignalCount: signals.length,
    evidenceSourceTypes: [...new Set(detected.map((signal) => signal.sourceType))].filter(Boolean)
  };
}

function collectSignals(input) {
  const signals = [];
  const defaultSourceType = clean(input.sourceType ?? input.sourceKind ?? COMMERCIAL_SOURCE_TYPES.UNKNOWN);
  const push = (key, value, sourceType = defaultSourceType) => {
    const text = clean(value);
    if (text) signals.push({ key, value: text, sourceType: sourceType || COMMERCIAL_SOURCE_TYPES.UNKNOWN });
  };

  push("text", input.text ?? input.commercialTermsText);

  if (Array.isArray(input.values)) {
    input.values.forEach((value, index) => push(`values.${index}`, value));
  }
  if (input.fields && typeof input.fields === "object") {
    Object.entries(input.fields).forEach(([key, value]) => {
      if (isCommercialFieldName(key) || hasCommercialKeyword(value)) push(key, value);
    });
  }
  if (Array.isArray(input.sources)) {
    input.sources.forEach((source, index) => {
      if (source && typeof source === "object") {
        const sourceType = clean(source.sourceType ?? source.type ?? defaultSourceType);
        if (source.fields && typeof source.fields === "object") {
          Object.entries(source.fields).forEach(([key, value]) => {
            if (isCommercialFieldName(key) || hasCommercialKeyword(value)) push(key, value, sourceType);
          });
        }
        push(source.key ?? `sources.${index}`, source.value ?? source.text, sourceType);
      } else {
        push(`sources.${index}`, source);
      }
    });
  }

  return signals;
}

function strongestSignals(signals) {
  if (signals.length === 0) return [];
  const highestPriority = Math.max(...signals.map((signal) => SOURCE_PRIORITY[signal.sourceType] ?? 0));
  return signals.filter((signal) => (SOURCE_PRIORITY[signal.sourceType] ?? 0) === highestPriority);
}

function modelFromText(value) {
  const flags = flagsFromText(value);
  if (flags.prepaidFlag && flags.royaltyFlag) return COMMERCIAL_MODELS.PREPAID_ROYALTY;
  if (flags.buyoutFlag && (flags.royaltyFlag || flags.revenueShareFlag)) return COMMERCIAL_MODELS.MIXED;
  if (flags.buyoutFlag) return COMMERCIAL_MODELS.BUYOUT;
  if (flags.revenueShareFlag) return COMMERCIAL_MODELS.REVENUE_SHARE;
  if (flags.royaltyFlag) return COMMERCIAL_MODELS.ROYALTY;
  return COMMERCIAL_MODELS.UNKNOWN;
}

function flagsFromText(value) {
  const normalized = normalize(value);
  const buyoutFlag = /买断|著作权转让|全部著作权归|版权归[^，。,；;\n]*所有/.test(normalized);
  const royaltyFlag = /版税/.test(normalized);
  const prepaidFlag = /预付/.test(normalized);
  const revenueShareFlag = /分成|收益分配|收入分配|按比例结算/.test(normalized);
  const guaranteeFlag = /保底/.test(normalized);
  let buyoutScope = "not_buyout";
  if (buyoutFlag) {
    if (/有声[^，。,；;\n]*买断|买断[^，。,；;\n]*有声|有声使用权|有声改编权|有声转授权/.test(normalized)) {
      buyoutScope = "audio_related_buyout_scope";
    } else if (/全部著作权|完整权利|全版权|著作权转让/.test(normalized)) {
      buyoutScope = "full_rights_buyout_scope";
    } else {
      buyoutScope = "unknown_buyout_scope";
    }
  }
  return { buyoutFlag, royaltyFlag, prepaidFlag, revenueShareFlag, guaranteeFlag, buyoutScope };
}

function mergeFlags(flags) {
  const merged = {
    buyoutFlag: false,
    royaltyFlag: false,
    prepaidFlag: false,
    revenueShareFlag: false,
    guaranteeFlag: false,
    buyoutScope: "not_buyout"
  };
  for (const flag of flags) {
    merged.buyoutFlag ||= flag.buyoutFlag;
    merged.royaltyFlag ||= flag.royaltyFlag;
    merged.prepaidFlag ||= flag.prepaidFlag;
    merged.revenueShareFlag ||= flag.revenueShareFlag;
    merged.guaranteeFlag ||= flag.guaranteeFlag;
    if (flag.buyoutScope === "audio_related_buyout_scope" || flag.buyoutScope === "full_rights_buyout_scope") {
      merged.buyoutScope = flag.buyoutScope;
    } else if (flag.buyoutScope === "unknown_buyout_scope" && merged.buyoutScope === "not_buyout") {
      merged.buyoutScope = flag.buyoutScope;
    }
  }
  return merged;
}

function confidenceFor(signals, input) {
  if (input.sourceType === COMMERCIAL_SOURCE_TYPES.DUAL_SOURCE_CONSISTENT) return "high";
  const hasFullLedger = signals.some((signal) =>
    [COMMERCIAL_SOURCE_TYPES.FULL_DIGITAL_LEDGER_TERMS, COMMERCIAL_SOURCE_TYPES.DUAL_SOURCE_CONSISTENT].includes(signal.sourceType)
  );
  const hasExtractedLedger = signals.some((signal) => signal.sourceType === COMMERCIAL_SOURCE_TYPES.FULL_DIGITAL_LEDGER_EXTRACTED_TAGS);
  if (hasFullLedger) return "high";
  if (hasExtractedLedger) return "medium";
  if (usesOnlyOperationTags(signals)) return "medium";
  return "low";
}

function reasonForModel(model, sourceType) {
  const sourceLabel = sourceType === COMMERCIAL_SOURCE_TYPES.FULL_DIGITAL_LEDGER_TERMS ? "完整数字版权台账字段" : "商业条款信号";
  if (model === COMMERCIAL_MODELS.PREPAID_ROYALTY) return `${sourceLabel}同时包含预付和版税`;
  if (model === COMMERCIAL_MODELS.BUYOUT) return `${sourceLabel}包含买断或著作权转让`;
  if (model === COMMERCIAL_MODELS.REVENUE_SHARE) return `${sourceLabel}包含分成/收益分配`;
  if (model === COMMERCIAL_MODELS.ROYALTY) return `${sourceLabel}包含版税`;
  if (model === COMMERCIAL_MODELS.MIXED) return `${sourceLabel}同时包含多种商业模式`;
  return "商业模式未知";
}

function riskLevel({ commercialModel, confidence, requiresManualCommercialReview, guaranteeFlag, buyoutScope }) {
  if (commercialModel === COMMERCIAL_MODELS.CONFLICT || commercialModel === COMMERCIAL_MODELS.MIXED) return "high";
  if (requiresManualCommercialReview) return "high";
  if (commercialModel === COMMERCIAL_MODELS.UNKNOWN) return "medium";
  if (buyoutScope === "unknown_buyout_scope") return "medium";
  if (confidence === "low" || guaranteeFlag) return "medium";
  return "low";
}

function usesOnlyOperationTags(signals) {
  return (
    signals.length > 0 &&
    signals.every((signal) =>
      [COMMERCIAL_SOURCE_TYPES.OPERATION_CONFIRMATION_TAGS, COMMERCIAL_SOURCE_TYPES.FULL_DIGITAL_LEDGER_EXTRACTED_TAGS].includes(
        signal.sourceType
      )
    )
  );
}

function summarizeSource(input, detected, strongest) {
  const explicit = clean(input.source ?? input.commercialTermsSource);
  if (explicit) return explicit;
  const sourceTypes = strongest.length > 0 ? strongest.map((signal) => signal.sourceType) : detected.map((signal) => signal.sourceType);
  return [...new Set(sourceTypes)].filter(Boolean).join("+") || COMMERCIAL_SOURCE_TYPES.UNKNOWN;
}

function sourceTypeOf(signal) {
  const sourceType = clean(signal.sourceType);
  return SOURCE_PRIORITY[sourceType] == null ? COMMERCIAL_SOURCE_TYPES.UNKNOWN : sourceType;
}

function isCommercialFieldName(value) {
  return /买断|版税|预付|有声版税|有声预付|合作方式|合同类型|授权方式|是否买断|版权费用|分成|保底|结算方式|有声权利|有声使用权|有声改编权|有声转授权|标签/.test(
    clean(value)
  );
}

function hasCommercialKeyword(value) {
  return /买断|版税|预付|分成|保底|合作方式|合同类型|授权方式|结算方式|有声权利|有声使用权|有声改编权|有声转授权/.test(
    clean(value)
  );
}

function normalize(value) {
  return clean(value).replace(/\s+/g, "");
}

function clean(value) {
  return value == null ? "" : String(value).trim();
}
