from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TEMP_DEPS = Path(os.environ.get("TEMP", "")) / "codex-system-pydeps"
if TEMP_DEPS.exists():
    sys.path.insert(0, str(TEMP_DEPS))
sys.path.insert(0, str(ROOT / "tools" / "m2-calibration"))

import numpy as np
import pandas as pd

from run_nonformal_dry_run import (
    RISK_SEVERITY,
    evaluate_variant,
    evaluate_work_summary,
    load_analysis_inputs,
)

CANDIDATE_VERSION = "m2-realdata-dev-candidate-b-v0.1"
BASELINE_CANDIDATE = "m2-c3-cleaned-bill-nonformal-v0.2/candidate-a"
PARAMETER_VARIANT = "candidate-b"


def json_safe(value):
    if isinstance(value, dict):
        return {str(key): json_safe(child) for key, child in value.items()}
    if isinstance(value, list):
        return [json_safe(child) for child in value]
    if isinstance(value, tuple):
        return [json_safe(child) for child in value]
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        return float(value)
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    try:
        if pd.isna(value):
            return None
    except Exception:
        pass
    return value


def safe_float(value, default=0.0):
    try:
        result = float(value)
    except Exception:
        return default
    if not math.isfinite(result):
        return default
    return result


def safe_int(value, default=0):
    try:
        return int(value)
    except Exception:
        return default


def review_priority(row) -> int:
    rating = str(row.rating)
    if bool(row.manualReviewRequired):
        if rating in {"S+", "S"}:
            return 10
        if rating in {"A", "B"}:
            return 20
        return 40
    if bool(row.manualReviewAdvisoryReasons):
        return 80
    return 100


def lifecycle_confidence(row) -> str:
    if str(row.lifecycle) == "insufficient_history":
        return "low"
    if safe_int(row.historyMonthCount) >= 12:
        return "high"
    return "medium"


def concentration_bucket(value) -> str:
    numeric = safe_float(value)
    if numeric >= 0.98:
        return "very_high"
    if numeric >= 0.8:
        return "high"
    if numeric >= 0.5:
        return "medium"
    return "low"


def rating_score(rating: str) -> float:
    scores = {
        "S+": 100.0,
        "S": 92.0,
        "A": 82.0,
        "B": 68.0,
        "C": 52.0,
        "D": 35.0,
        "E": 10.0,
    }
    return scores.get(rating, 0.0)


def work_ref(index: int) -> str:
    return f"m2dev-{index + 1:06d}"


def stable_hash(*parts: str) -> str:
    text = "|".join(str(part) for part in parts)
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def build_payload() -> dict:
    context = load_analysis_inputs()
    candidate_b = evaluate_variant(context, PARAMETER_VARIANT)
    dry_run = evaluate_work_summary(
        context["work_summary"],
        context["parameters"],
        context["latest_complete_month"],
        context["incomplete_work_ids"],
        PARAMETER_VARIANT,
    )

    dry_run = dry_run.sort_values("standardWorkId").reset_index(drop=True)
    evaluated = []
    for index, row in dry_run.iterrows():
        ref = work_ref(index)
        risk_codes = list(row.riskCodes)
        suggestion_codes = list(row.suggestionCodes)
        blocking_reasons = list(row.manualReviewBlockingReasons)
        advisory_reasons = list(row.manualReviewAdvisoryReasons)
        primary_suggestion = suggestion_codes[0] if suggestion_codes else "observe_only"
        review_type = None
        review_reason_code = None
        if blocking_reasons:
            review_type = "blocking_manual_review"
            review_reason_code = blocking_reasons[0]
        elif advisory_reasons:
            review_type = "advisory_review"
            review_reason_code = advisory_reasons[0]

        evaluated.append(
            {
                "workRef": ref,
                "candidateVersion": CANDIDATE_VERSION,
                "rating": str(row.rating),
                "ratingScore": rating_score(str(row.rating)),
                "lifecycle": str(row.lifecycle),
                "lifecycleConfidence": lifecycle_confidence(row),
                "forecastBase": round(safe_float(row.forecastBase), 6),
                "forecastOptimistic": round(safe_float(row.forecastOptimistic), 6),
                "forecastPessimistic": round(safe_float(row.forecastPessimistic), 6),
                "riskLevel": str(row.riskSeverity),
                "primarySuggestion": primary_suggestion,
                "riskCodes": risk_codes,
                "suggestionCodes": suggestion_codes,
                "manualReviewRequired": bool(row.manualReviewRequired),
                "manualReviewBlockingReasons": blocking_reasons,
                "manualReviewAdvisoryReasons": advisory_reasons,
                "reviewItem": {
                    "reviewType": review_type,
                    "reviewReasonCode": review_reason_code,
                    "reviewPriority": review_priority(row),
                    "reviewStatus": "pending",
                    "isBlocking": review_type == "blocking_manual_review",
                    "allowedActions": ["approve", "data-fix", "waiver", "reject", "no-action"]
                    if review_type == "blocking_manual_review"
                    else ["no-action", "data-fix"],
                }
                if review_type
                else None,
                "inputSnapshot": {
                    "last3Revenue": round(safe_float(row.last3MonthRevenue), 6),
                    "last6Revenue": round(safe_float(row.last6MonthRevenue), 6),
                    "last12Revenue": round(safe_float(row.last12MonthRevenue), 6),
                    "last24Revenue": round(safe_float(row.last24MonthRevenue), 6),
                    "totalHistoricalRevenue": round(safe_float(row.totalHistoricalRevenue), 6),
                    "activeMonthCount": safe_int(row.activeMonthCount),
                    "zeroRevenueMonthCount": safe_int(row.zeroRevenueMonthCount),
                    "remainingCopyrightMonths": None
                    if pd.isna(row.remainingCopyrightMonths)
                    else safe_int(row.remainingCopyrightMonths),
                    "businessFormBreakdown": {
                        "businessFormCount": safe_int(row.businessFormCount),
                        "audioCopyrightRevenue": round(safe_float(row.audioCopyrightRevenue), 6),
                        "audioProductRevenue": round(safe_float(row.audioProductRevenue), 6),
                    },
                    "channelConcentrationSummary": {
                        "concentrationBucket": concentration_bucket(row.channelConcentration),
                        "channelConcentrationAvailable": not pd.isna(row.channelConcentration),
                    },
                    "inputHash": stable_hash(CANDIDATE_VERSION, ref, str(row.rating), str(row.lifecycle)),
                },
                "metadata": {
                    "forecastFallbackUsed": bool(row.forecastFallbackUsed),
                    "uncappedRating": str(row.uncappedRating),
                    "runMode": "authorized_local_real_data_development",
                    "notFinalReleaseApproved": True,
                },
            }
        )

    aggregate = candidate_b["resultDistributions"]
    return {
        "schema": "m2.authorized_real_data.db_import_payload.v0.1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "candidateVersion": CANDIDATE_VERSION,
        "baselineCandidate": BASELINE_CANDIDATE,
        "parameterVersion": context["parameters"]["version"],
        "parameterVariant": PARAMETER_VARIANT,
        "latestCompleteMonth": context["latest_complete_month"],
        "cutoffMonth": f"{context['latest_complete_month']}-01",
        "notFinalReleaseApproved": True,
        "safeOutputBoundary": {
            "rawRowsWritten": False,
            "realWorkNamesWritten": False,
            "realAuthorNamesWritten": False,
            "realChannelNamesWritten": False,
            "realSourceWorkIdsWritten": False,
            "workRefsAreAnonymized": True,
            "secretsWritten": False,
        },
        "aggregate": {
            "evaluatedWorkCount": int(aggregate["evaluatedWorkCount"]),
            "manualReviewRequiredCount": int(aggregate["manualReviewRequiredCount"]),
            "advisoryOnlyCount": int(aggregate["manualReviewBreakdown"]["advisoryOnlyCount"]),
            "ratingDistribution": aggregate["ratingDistribution"],
            "lifecycleDistribution": aggregate["lifecycleDistribution"],
            "riskDistribution": aggregate["riskDistribution"],
            "riskSeverityDistribution": aggregate["riskSeverityDistribution"],
            "suggestionDistribution": aggregate["suggestionDistribution"],
            "forecastDistributionSummary": aggregate["forecastDistributionSummary"],
            "blockingReasons": aggregate["manualReviewBreakdown"]["blockingReasons"],
            "advisoryReasons": aggregate["manualReviewBreakdown"]["advisoryReasons"],
        },
        "sourceScale": candidate_b["dataScale"],
        "riskSeverityMap": RISK_SEVERITY,
        "works": evaluated,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Build sanitized candidate-b DB import payload.")
    parser.add_argument("--output", help="Optional output path for the sanitized payload.")
    args = parser.parse_args()

    payload = build_payload()
    text = json.dumps(json_safe(payload), ensure_ascii=False, indent=2)
    if args.output:
        path = Path(args.output)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    else:
        print(text)


if __name__ == "__main__":
    main()
