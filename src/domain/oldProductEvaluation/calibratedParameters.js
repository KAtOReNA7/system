// Non-formal M2-C aggregate calibration parameters.
// M2-C-3 records aggregate-only parameter iteration evidence. Do not use as formal business rules.
export const M2_C0_CLEANED_BILL_CALIBRATED_PARAMETERS = Object.freeze({
  "version": "m2-c3-cleaned-bill-nonformal-v0.2",
  "nonFormalCalibration": true,
  "realDataAggregated": true,
  "notForFormalDecision": true,
  "sourceBoundary": {
    "aggregateOnly": true,
    "rawDetailIncluded": false,
    "realWorkNamesIncluded": false,
    "realAuthorNamesIncluded": false,
    "realChannelNamesIncluded": false
  },
  "latestCompleteMonth": "2026-04",
  "lifecycle": {
    "insufficientHistoryCompleteMonths": 6,
    "inactiveRecent6RevenueMax": 0.0,
    "longTailLast12RevenueMax": 2.82,
    "growthRecent6Prior6Ratio": 1.52,
    "decliningRecent6Prior6Ratio": 0.45,
    "reboundRecent3Previous3Ratio": 1.5,
    "stableLast6CoefficientOfVariationMax": 0.73
  },
  "forecast": {
    "recommendedBaseModel": "lifecycle_adjusted",
    "modelsTested": [
      "last12_average",
      "last24_average",
      "lifecycle_adjusted"
    ],
    "lifecycleFactors": {
      "stable": 0.63,
      "rebound": 0.63,
      "growth": 0.82,
      "long_tail": 1.09,
      "declining": 0.35,
      "inactive": 0.79,
      "insufficient_history": 2.5
    },
    "scenarioMultipliers": {
      "base": 1.0,
      "pessimistic": 0.45,
      "optimistic": 2.01
    }
  },
  "rating": {
    "method": "hybrid of last-12 historical revenue and 12-month lifecycle-adjusted forecast distribution",
    "absoluteAmountThresholdCandidates": {
      "S+": 133000,
      "S": 16000,
      "A": 2700,
      "B": 310,
      "C": 10,
      "D": 1.8,
      "E": 0.0
    },
    "percentileBreakpoints": {
      "S+": 0.99,
      "S": 0.95,
      "A": 0.85,
      "B": 0.65,
      "C": 0.4,
      "D": 0.2,
      "E": 0.0
    },
    "sampleShareByRating": {
      "S+": 0.0103,
      "S": 0.0399,
      "A": 0.1021,
      "B": 0.1988,
      "C": 0.2861,
      "D": 0.1626,
      "E": 0.2001
    },
    "lowInvestmentBoundary": {
      "ratings": [
        "D",
        "E"
      ],
      "thresholdUpperBound": 10
    },
    "highPriorityBoundary": {
      "ratings": [
        "S+",
        "S"
      ],
      "thresholdLowerBound": 16000
    },
    "newProductOldProductNote": "Old-product rating should not be treated as equivalent to new-product launch rating because it is driven by observed historical revenue and remaining-rights economics.",
    "externalEventLimit": "External event override should increase at most two rating levels and must require manual review.",
    "smallSampleFallback": "When history is below the insufficient-history threshold, use observe_only and manual_review_required instead of a high-confidence rating."
  },
  "riskCalibration": {
    "stage": "M2-C-3",
    "calibrationMode": "non_formal_aggregate_dry_run_parameter_iteration",
    "aggregateOnly": true,
    "notForFormalDecision": true,
    "m2C3SelectedVariant": "candidate-a",
    "recommendation": "Use candidate-a for the next bounded non-formal dry-run. It keeps high and mid-value uncertainty in the blocking review queue while converting low-value evidence gaps to advisory review.",
    "validationEvidence": {
      "evaluatedWorkCount": 3054,
      "manualReviewRequiredCount": 513,
      "advisoryOnlyCount": 2331,
      "channelConcentrationCount": 1944,
      "channelConcentrationBlockingLikeCount": 2,
      "copyrightFallbackUsageCount": 2207
    },
    "dataReadinessSubtypes": [
      "missing_copyright_end",
      "copyright_date_conflict",
      "mapping_uncertainty",
      "missing_basic_info",
      "incomplete_month_boundary",
      "insufficient_revenue_history",
      "aggregate_projection_gap"
    ],
    "manualReviewLayering": {
      "blockingReasons": [
        "mapping_uncertainty",
        "copyright_conflict",
        "abnormal_spike",
        "buyout_or_oneoff_income",
        "high_value_with_expiry",
        "high_value_with_data_gap",
        "insufficient_history",
        "channel_structure_unclear"
      ],
      "advisoryReasons": [
        "copyright_missing",
        "abnormal_spike",
        "buyout_or_oneoff_income",
        "high_value_with_expiry",
        "insufficient_history",
        "channel_structure_unclear"
      ],
      "blockingPolicy": "Only blocking reasons enter the pre-formal manual review queue. Advisory reasons are analyst notes and do not block aggregate dry-run evaluation."
    },
    "channelConcentration": {
      "selectedVariant": "candidate-a",
      "conservative": {
        "shareThreshold": 0.98,
        "riskRevenueFloor": 2700,
        "blockingManualReviewRevenueFloor": 16000,
        "businessFormAware": true,
        "lowRevenueConcentrationTreatment": "advisory"
      },
      "balanced": {
        "shareThreshold": 0.98,
        "riskRevenueFloor": 16000,
        "blockingManualReviewRevenueFloor": 16000,
        "businessFormAware": true,
        "lowRevenueConcentrationTreatment": "advisory"
      }
    },
    "forecastFallback": {
      "selectedVariant": "lifecycle_layered",
      "missingCopyrightEndFallbackMonthsByLifecycle": {
        "growth": 12,
        "stable": 12,
        "rebound": 12,
        "declining": 9,
        "long_tail": 6,
        "inactive": 6,
        "insufficient_history": 6
      },
      "highValueMissingCopyrightTreatment": "blocking_manual_review",
      "lowValueMissingCopyrightTreatment": "advisory_review"
    },
    "ratingCaps": {
      "selectedVariant": "candidate-a",
      "caps": {
        "abnormal_spike": "A",
        "buyout_or_oneoff_income": "A",
        "missing_copyright_end": "B",
        "copyright_date_conflict": "B",
        "copyright_expiry": "A",
        "insufficient_history": "C"
      },
      "capMeaning": "A cap is the best allowed rating when the corresponding aggregate risk is present; it never upgrades a work."
    }
  },
  "riskRules": [
    {
      "code": "data_readiness",
      "trigger": "missing aggregate input, unresolved mapping, or incomplete master-data field required by the target evaluation",
      "severity": "high",
      "evidence": "M1 readiness and mapping confirmation status",
      "manualReviewRequired": true
    },
    {
      "code": "revenue_decline",
      "trigger": "recent6/prior6 ratio <= 0.45",
      "severity": "medium",
      "evidence": "work-month aggregate trend",
      "manualReviewRequired": false
    },
    {
      "code": "copyright_expiry",
      "trigger": "remaining copyright months <= 12",
      "severity": "high",
      "evidence": "aggregate count=363",
      "manualReviewRequired": true
    },
    {
      "code": "insufficient_history",
      "trigger": "history months < 6",
      "severity": "medium",
      "evidence": "complete-month history count",
      "manualReviewRequired": true
    },
    {
      "code": "business_form_mixed",
      "trigger": "standard work has both audio_copyright and audio_product revenue",
      "severity": "low",
      "evidence": "aggregate count=474",
      "manualReviewRequired": false
    },
    {
      "code": "inactive_tail",
      "trigger": "lifecycle in inactive or long_tail",
      "severity": "medium",
      "evidence": "calibrated lifecycle label",
      "manualReviewRequired": false
    },
    {
      "code": "abnormal_spike",
      "trigger": "peak month share >= 0.9",
      "severity": "medium",
      "evidence": "aggregate count=382",
      "manualReviewRequired": true
    },
    {
      "code": "buyout_or_oneoff_income",
      "trigger": "peak month share >= 0.9 with otherwise sparse revenue",
      "severity": "medium",
      "evidence": "monthly concentration pattern; cannot confirm commercial type from bills alone",
      "manualReviewRequired": true
    },
    {
      "code": "channel_concentration",
      "trigger": "top channel share >= 0.95",
      "severity": "medium",
      "evidence": "aggregate count=2003",
      "manualReviewRequired": false
    },
    {
      "code": "mapping_uncertainty",
      "trigger": "raw work ID is invalid, unmapped, or belongs to a confirmed conflict group",
      "severity": "high",
      "evidence": "mapping candidate and operation confirmation material",
      "manualReviewRequired": true
    },
    {
      "code": "incomplete_month_boundary",
      "trigger": "latest bill month is beyond latest confirmed complete month",
      "severity": "low",
      "evidence": "2026-05 is excluded from calibration cutoff",
      "manualReviewRequired": false
    }
  ],
  "suggestionRules": [
    {
      "code": "promote",
      "trigger": "rating in S+/S or lifecycle=growth without high readiness risk",
      "priority": "high",
      "copyTemplate": "Prioritize additional operation resources after manual check confirms no one-off spike.",
      "manualReviewRequired": true
    },
    {
      "code": "maintain",
      "trigger": "rating in A/B and lifecycle stable or modest growth",
      "priority": "medium",
      "copyTemplate": "Maintain baseline operation and monitor next complete-month trend.",
      "manualReviewRequired": false
    },
    {
      "code": "reduce_investment",
      "trigger": "rating in C/D with declining or inactive signal",
      "priority": "medium",
      "copyTemplate": "Reduce incremental spend unless external event evidence is provided.",
      "manualReviewRequired": false
    },
    {
      "code": "repackage",
      "trigger": "business_form_mixed or channel concentration risk with non-low revenue",
      "priority": "medium",
      "copyTemplate": "Review package positioning across business forms and top channels.",
      "manualReviewRequired": true
    },
    {
      "code": "pricing_or_channel_adjustment",
      "trigger": "long_tail or rebound with channel concentration below risk threshold",
      "priority": "medium",
      "copyTemplate": "Test price or channel adjustment in a controlled non-formal plan.",
      "manualReviewRequired": true
    },
    {
      "code": "renewal_review",
      "trigger": "copyright_expiry risk and rating not below C",
      "priority": "high",
      "copyTemplate": "Review renewal economics before further resource allocation.",
      "manualReviewRequired": true
    },
    {
      "code": "observe_only",
      "trigger": "insufficient_history or incomplete_month_boundary dominates evidence",
      "priority": "low",
      "copyTemplate": "Observe until more complete months are available.",
      "manualReviewRequired": false
    },
    {
      "code": "downlist_or_suspend",
      "trigger": "rating E, inactive lifecycle, and no renewal or event support",
      "priority": "medium",
      "copyTemplate": "Consider downlisting or suspension only after manual confirmation.",
      "manualReviewRequired": true
    },
    {
      "code": "manual_review_required",
      "trigger": "mapping_uncertainty, abnormal_spike, buyout_or_oneoff_income, or copyright conflict",
      "priority": "high",
      "copyTemplate": "Route to operations review before any formal action.",
      "manualReviewRequired": true
    }
  ]
});
