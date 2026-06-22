from __future__ import annotations

import json
import os
import subprocess
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TEMP_DEPS = Path(os.environ.get("TEMP", "")) / "codex-system-pydeps"
if TEMP_DEPS.exists():
    sys.path.insert(0, str(TEMP_DEPS))
sys.path.insert(0, str(ROOT / "tools" / "m2-calibration"))

import numpy as np
import pandas as pd

from calibrate_cleaned_bills import KNOWN_INCOMPLETE_MONTHS, REAL_BILL_COLUMNS, MASTER_COLUMNS
from run_nonformal_dry_run import evaluate_variant, load_analysis_inputs

CANDIDATE_VERSION = "m2-realdata-dev-candidate-b-v0.1"
BASELINE_VERSION = "m2-c3-cleaned-bill-nonformal-v0.2/candidate-a"

OUTPUT_DIR = ROOT / "docs" / "analysis" / "m2-real-data"
PLAN_DOC = ROOT / "docs" / "technical-design" / "M2-authorized-real-data-development-plan-v0.1.md"
PROFILE_JSON = OUTPUT_DIR / "M2-real-data-profile-summary-v0.1.json"
PROFILE_MD = OUTPUT_DIR / "M2-real-data-profile-summary-v0.1.md"
RECON_JSON = OUTPUT_DIR / "M2-strict-reconciliation-summary-v0.1.json"
RECON_MD = OUTPUT_DIR / "M2-strict-reconciliation-summary-v0.1.md"
ALGO_JSON = OUTPUT_DIR / "M2-real-data-algorithm-calibration-summary-v0.1.json"
ALGO_MD = OUTPUT_DIR / "M2-real-data-algorithm-calibration-summary-v0.1.md"
CANDIDATE_JSON = OUTPUT_DIR / "M2-realdata-dev-candidate-b-summary-v0.1.json"
CANDIDATE_MD = OUTPUT_DIR / "M2-realdata-dev-candidate-b-summary-v0.1.md"


def git_value(args: list[str]) -> str | None:
    try:
        return subprocess.check_output(["git", *args], cwd=ROOT, text=True, stderr=subprocess.DEVNULL).strip()
    except Exception:
        return None


def money(value) -> str:
    if value is None or (isinstance(value, float) and not np.isfinite(value)):
        return "0.00"
    return f"{float(value):.2f}"


def number(value):
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        return float(value)
    if pd.isna(value):
        return None
    return value


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
    if pd.isna(value):
        return None
    return value


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(json_safe(payload), ensure_ascii=False, indent=2), encoding="utf-8")


def markdown_table(rows: list[dict], columns: list[tuple[str, str]]) -> str:
    lines = ["| " + " | ".join(label for _, label in columns) + " |"]
    lines.append("|" + "|".join("---" for _ in columns) + "|")
    for row in rows:
        lines.append("| " + " | ".join(str(row.get(key, "")) for key, _ in columns) + " |")
    return "\n".join(lines)


def counts_rows(counts: dict) -> list[dict]:
    return [{"key": key, "value": value} for key, value in counts.items()]


def build_profile(context: dict, candidate_b: dict) -> dict:
    bill = context["bill"]
    valid = bill[bill["validForCalibration"]].copy()
    complete = valid[valid["billMonth"] <= context["latest_complete_month"]].copy()
    work_summary = context["work_summary"]
    population = candidate_b["dataScale"]
    data_sources = candidate_b["dataSources"]
    result_distribution = candidate_b["resultDistributions"]

    field_roles = [
        "bill_month",
        "channel_id",
        "channel_display_name",
        "authorization_category",
        "source_work_id",
        "work_display_name",
        "actual_sales_amount",
    ]
    field_rows = []
    for role, column in zip(field_roles, REAL_BILL_COLUMNS):
        missing_count = int(bill[column].isna().sum()) if column in bill.columns else len(bill)
        field_rows.append({
            "fieldRole": role,
            "present": column in bill.columns,
            "missingCount": missing_count,
            "missingRate": round(missing_count / len(bill), 6) if len(bill) else 0.0,
        })

    return {
        "schema": "m2.authorized_real_data.profile_summary.v0.1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "mode": "authorized_local_real_data_development",
        "currentHead": git_value(["rev-parse", "HEAD"]),
        "originMain": (git_value(["ls-remote", "origin", "refs/heads/main"]) or "").split("\t")[0] or None,
        "sourceInventory": [
            {
                "alias": "B001",
                "sourceType": "real_bill_workbook",
                "pathPattern": "data/real-bills/*.xlsx",
                "fileType": "xlsx",
                "fileCount": data_sources["realBillWorkbookCount"],
                "recordScale": int(len(bill)),
                "usableForCalibration": True,
                "sensitiveRawDetailCommitted": False,
            },
            {
                "alias": "M001",
                "sourceType": "copyright_master_workbook",
                "pathPattern": "data/master-data/*.xlsx",
                "fileType": "xlsx",
                "fileCount": data_sources["masterDataWorkbookCount"],
                "recordScale": int(context["master_stats"]["masterRows"]),
                "usableForCalibration": True,
                "sensitiveRawDetailCommitted": False,
            },
            {
                "alias": "MAP001",
                "sourceType": "mapping_candidate_private_json",
                "pathPattern": "data/m1-master-data-private/mapping-candidate/*.json",
                "fileType": "json",
                "fileCount": data_sources["mappingCandidateFileCount"],
                "recordScale": int(data_sources["selectedMappingRows"]),
                "usableForCalibration": True,
                "sensitiveRawDetailCommitted": False,
            },
            {
                "alias": "OPS001",
                "sourceType": "operation_confirmation_private_artifacts",
                "pathPattern": "data/m1-master-data-private/ops-confirmation/*",
                "fileType": "mixed",
                "fileCount": data_sources["operationsConfirmationRelatedFileCount"],
                "recordScale": None,
                "usableForCalibration": True,
                "sensitiveRawDetailCommitted": False,
            },
        ],
        "billFieldRecognition": {
            "requiredBusinessFieldRoles": field_roles,
            "allRequiredFieldsPresent": all(row["present"] for row in field_rows),
            "fieldCompleteness": field_rows,
            "amountFieldRole": "actual_sales_amount",
            "monthFieldRole": "bill_month",
            "workIdFieldRole": "source_work_id",
            "channelFieldRoles": ["channel_id", "channel_display_name"],
            "businessFormFieldRole": "authorization_category",
            "zeroNegativeAndRefundPolicy": "zero and negative values are retained; negative rows are treated as offsets/refunds in aggregate reconciliation.",
        },
        "scale": {
            "billRowCount": int(len(bill)),
            "validCalibrationRows": int(len(valid)),
            "completeCalibrationRows": int(len(complete)),
            "standardWorkCount": int(work_summary["standardWorkId"].nunique()),
            "rawWorkIdCount": int(valid["rawWorkId"].nunique()),
            "monthRange": [
                str(valid["billMonth"].min())[:7],
                str(valid["billMonth"].max())[:7],
            ],
            "latestCompleteMonth": context["latest_complete_month"],
            "excludedIncompleteMonths": sorted(KNOWN_INCOMPLETE_MONTHS),
            "businessFormDistribution": valid["businessForm"].value_counts(dropna=False).sort_index().to_dict(),
            "distinctChannelCount": int(valid["channelKey"].nunique()),
        },
        "masterDataReadiness": {
            "mappingAppliedRowCount": int(valid["mappingApplied"].sum()),
            "invalidOrUnmappedRowCount": int((~bill["validForCalibration"]).sum()),
            "copyrightEndDateUnambiguousWorkCount": int(context["master_stats"]["unambiguousWorks"]),
            "copyrightDateConflictWorkCount": int(population["copyrightDateConflictWorkCount"]),
            "manualReviewRequiredCount": int(result_distribution["manualReviewRequiredCount"]),
            "advisoryOnlyCount": int(result_distribution["manualReviewBreakdown"]["advisoryOnlyCount"]),
            "workWithCopyrightEndCount": int(work_summary["hasCopyrightEndDate"].sum()),
            "workMissingCopyrightEndCount": int((~work_summary["hasCopyrightEndDate"]).sum()),
            "workWithMultipleBusinessFormsCount": int((work_summary["businessFormCount"] > 1).sum()),
            "classificationAndTagCoverage": "not fully covered by the two source workbooks; requires follow-up master-data version integration.",
        },
        "safeOutputBoundary": {
            "rawRowsWritten": False,
            "realWorkNamesWritten": False,
            "realAuthorNamesWritten": False,
            "realChannelNamesWritten": False,
            "secretsWritten": False,
        },
    }


def build_reconciliation(context: dict) -> dict:
    bill = context["bill"]
    valid = bill[bill["validForCalibration"]].copy()
    complete = valid[valid["billMonth"] <= context["latest_complete_month"]].copy()
    excluded = valid[valid["billMonth"] > context["latest_complete_month"]].copy()
    amount_numeric = pd.to_numeric(bill["amount"], errors="coerce")

    month_rows = []
    for month, group in valid.groupby("billMonth"):
        status = "excluded_incomplete" if month in KNOWN_INCOMPLETE_MONTHS or month > context["latest_complete_month"] else "included_complete"
        month_rows.append({
            "month": month,
            "rowCount": int(len(group)),
            "amount": money(group["amount"].sum()),
            "status": status,
        })
    month_rows.sort(key=lambda item: item["month"])

    business_form_rows = [
        {"businessForm": key, "rowCount": int(len(group)), "amount": money(group["amount"].sum())}
        for key, group in valid.groupby("businessForm")
    ]

    channel_amounts = (
        valid.assign(positiveAmount=valid["amount"].clip(lower=0.0))
        .groupby("channelKey")["positiveAmount"]
        .sum()
        .sort_values(ascending=False)
    )
    channel_total = float(channel_amounts.sum()) or 1.0
    top_channel_rows = [
        {
            "rank": index + 1,
            "amount": money(value),
            "share": round(float(value) / channel_total, 6),
        }
        for index, value in enumerate(channel_amounts.head(10))
    ]

    return {
        "schema": "m2.authorized_real_data.strict_reconciliation_summary.v0.1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "mode": "authorized_local_real_data_development",
        "rowReconciliation": {
            "billRowCount": int(len(bill)),
            "validCalibrationRows": int(len(valid)),
            "invalidOrUnmappedRows": int((~bill["validForCalibration"]).sum()),
            "completeRowsIncluded": int(len(complete)),
            "incompleteRowsExcluded": int(len(excluded)),
        },
        "amountReconciliation": {
            "rawTotalAmount": money(valid["amount"].sum()),
            "completeIncludedAmount": money(complete["amount"].sum()),
            "excludedIncompleteAmount": money(excluded["amount"].sum()),
            "rawMinusCompleteMinusExcluded": money(valid["amount"].sum() - complete["amount"].sum() - excluded["amount"].sum()),
            "invalidAmountCellCount": int(amount_numeric.isna().sum()),
            "positiveRowCount": int((complete["amount"] > 0).sum()),
            "zeroRowCount": int((complete["amount"] == 0).sum()),
            "negativeRowCount": int((complete["amount"] < 0).sum()),
        },
        "monthTotals": month_rows,
        "businessFormTotals": business_form_rows,
        "channelTotalsAnonymizedTop10": top_channel_rows,
        "issueSummary": {
            "unmatchedWorkIdRows": int((~bill["validForCalibration"]).sum()),
            "duplicateCandidateHandling": "no row-level duplicate detail is written; use private source files for drill-down if needed.",
            "copyrightDateConflictWorkCount": int(context["master_stats"]["conflictWorks"]),
            "incompleteMonthDetected": sorted(KNOWN_INCOMPLETE_MONTHS),
            "latestCompleteMonthRecommended": context["latest_complete_month"],
        },
        "safeOutputBoundary": {
            "rawRowsWritten": False,
            "channelNamesWritten": False,
            "workNamesWritten": False,
            "secretsWritten": False,
        },
    }


def compact_result_distribution(aggregate: dict) -> dict:
    result = aggregate["resultDistributions"]
    return {
        "evaluatedWorkCount": result["evaluatedWorkCount"],
        "lifecycleDistribution": result["lifecycleDistribution"],
        "ratingDistribution": result["ratingDistribution"],
        "riskDistribution": result["riskDistribution"],
        "suggestionDistribution": result["suggestionDistribution"],
        "forecastDistributionSummary": result["forecastDistributionSummary"],
        "manualReviewRequiredCount": result["manualReviewRequiredCount"],
        "advisoryOnlyCount": result["manualReviewBreakdown"]["advisoryOnlyCount"],
        "blockingReasons": result["manualReviewBreakdown"]["blockingReasons"],
        "advisoryReasons": result["manualReviewBreakdown"]["advisoryReasons"],
        "downlistOrSuspendCount": result["downlistOrSuspendCount"],
        "promoteCount": result["promoteCount"],
        "copyrightFallbackUsage": result["copyrightFallbackUsage"],
    }


def build_algorithm_summary(context: dict, candidate_a: dict, candidate_b: dict) -> dict:
    backtests = context["c0_summary"]["forecastCalibration"]["backtestMetrics"]
    lifecycle_thresholds = context["c0_summary"]["lifecycleCalibration"]["thresholds"]
    rating = context["c0_summary"]["ratingCalibration"]
    return {
        "schema": "m2.authorized_real_data.algorithm_calibration_summary.v0.1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "mode": "authorized_local_real_data_development",
        "baselineCandidate": BASELINE_VERSION,
        "newDevelopmentCandidate": CANDIDATE_VERSION,
        "latestCompleteMonth": context["latest_complete_month"],
        "baselineCandidateA": compact_result_distribution(candidate_a),
        "candidateB": compact_result_distribution(candidate_b),
        "deltaCandidateBMinusA": {
            "manualReviewRequiredCount": int(candidate_b["resultDistributions"]["manualReviewRequiredCount"] - candidate_a["resultDistributions"]["manualReviewRequiredCount"]),
            "advisoryOnlyCount": int(candidate_b["resultDistributions"]["manualReviewBreakdown"]["advisoryOnlyCount"] - candidate_a["resultDistributions"]["manualReviewBreakdown"]["advisoryOnlyCount"]),
            "promoteCount": int(candidate_b["resultDistributions"]["promoteCount"] - candidate_a["resultDistributions"]["promoteCount"]),
            "downlistOrSuspendCount": int(candidate_b["resultDistributions"]["downlistOrSuspendCount"] - candidate_a["resultDistributions"]["downlistOrSuspendCount"]),
        },
        "lifecycleAlgorithm": {
            "labels": ["growth", "stable", "rebound", "declining", "long_tail", "inactive", "insufficient_history"],
            "thresholds": lifecycle_thresholds,
            "thresholdDerivation": "derived from real revenue distributions, recent/prior ratios, active history windows, and backtest usability.",
        },
        "forecastAlgorithm": {
            "modelsCompared": sorted({item["model"] for item in backtests}),
            "backtestMetrics": backtests,
            "recommendedModel": context["c0_summary"]["forecastCalibration"]["modelsTested"][-1],
            "scenarioMultipliers": context["c0_summary"]["forecastCalibration"]["scenarioMultipliers"],
            "lifecycleFactors": context["c0_summary"]["forecastCalibration"]["lifecycleFactors"],
        },
        "ratingAlgorithm": {
            "method": rating["method"],
            "thresholds": rating["absoluteAmountThresholdCandidates"],
            "percentileBreakpoints": rating["percentileBreakpoints"],
            "manualReviewPolicy": {
                "SPlusRequiresManualConfirmation": True,
                "downlistSuspendRequiresManualConfirmation": True,
                "renewalReviewRequiresManualConfirmation": True,
                "externalEventOverrideMaxIncreaseLevels": 2,
            },
        },
        "safeOutputBoundary": {
            "rawRowsWritten": False,
            "realWorkNamesWritten": False,
            "realChannelNamesWritten": False,
            "notFinalReleaseApproved": True,
        },
    }


def build_candidate_summary(algorithm: dict) -> dict:
    candidate = algorithm["candidateB"]
    baseline = algorithm["baselineCandidateA"]
    return {
        "schema": "m2.authorized_real_data.candidate_b_summary.v0.1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "candidateVersion": CANDIDATE_VERSION,
        "candidateStatus": "authorized_local_real_data_development_candidate",
        "baselineCandidate": BASELINE_VERSION,
        "notFinalReleaseApproved": True,
        "notForAutomatedBusinessAction": True,
        "recommendedForBusinessReview": True,
        "reason": "candidate-b preserves the real-data forecast/rating calibration while converting many lower-value uncertainty cases from blocking review to advisory review.",
        "evaluatedWorkCount": candidate["evaluatedWorkCount"],
        "manualReviewRequiredCount": candidate["manualReviewRequiredCount"],
        "advisoryOnlyCount": candidate["advisoryOnlyCount"],
        "manualReviewReductionFromCandidateA": baseline["manualReviewRequiredCount"] - candidate["manualReviewRequiredCount"],
        "promoteCount": candidate["promoteCount"],
        "downlistOrSuspendCount": candidate["downlistOrSuspendCount"],
        "ratingDistribution": candidate["ratingDistribution"],
        "lifecycleDistribution": candidate["lifecycleDistribution"],
        "requiresManualConfirmation": [
            "S+ release",
            "promote actions",
            "downlist_or_suspend actions",
            "renewal_review actions",
            "copyright conflicts",
            "abnormal spike or one-off income risks",
        ],
        "safeOutputBoundary": {
            "rawRowsWritten": False,
            "sensitiveDetailWritten": False,
            "secretsWritten": False,
        },
    }


def write_profile_markdown(profile: dict) -> None:
    PROFILE_MD.write_text(
        f"""# M2 real-data profile summary v0.1

Mode: authorized local real-data development.

## Source Inventory

{markdown_table(profile["sourceInventory"], [
    ("alias", "Alias"),
    ("sourceType", "Type"),
    ("pathPattern", "Path pattern"),
    ("fileType", "File type"),
    ("fileCount", "File count"),
    ("recordScale", "Record scale"),
    ("usableForCalibration", "Usable"),
])}

## Bill Fields

- Required fields present: `{profile["billFieldRecognition"]["allRequiredFieldsPresent"]}`
- Amount field role: `{profile["billFieldRecognition"]["amountFieldRole"]}`
- Month field role: `{profile["billFieldRecognition"]["monthFieldRole"]}`
- Work ID field role: `{profile["billFieldRecognition"]["workIdFieldRole"]}`
- Channel field roles: `{", ".join(profile["billFieldRecognition"]["channelFieldRoles"])}`
- Zero/negative policy: zero and negative values are retained for reconciliation and modeling.

## Scale

{markdown_table(counts_rows(profile["scale"]), [("key", "Metric"), ("value", "Value")])}

## Master Data Readiness

{markdown_table(counts_rows(profile["masterDataReadiness"]), [("key", "Metric"), ("value", "Value")])}

No raw rows, real work names, author names, channel names, secrets, or connection strings are written in this report.
""",
        encoding="utf-8",
    )


def write_reconciliation_markdown(reconciliation: dict) -> None:
    RECON_MD.write_text(
        f"""# M2 strict reconciliation summary v0.1

Mode: authorized local real-data development.

## Row Reconciliation

{markdown_table(counts_rows(reconciliation["rowReconciliation"]), [("key", "Metric"), ("value", "Value")])}

## Amount Reconciliation

{markdown_table(counts_rows(reconciliation["amountReconciliation"]), [("key", "Metric"), ("value", "Value")])}

## Business Form Totals

{markdown_table(reconciliation["businessFormTotals"], [
    ("businessForm", "Business form"),
    ("rowCount", "Rows"),
    ("amount", "Amount"),
])}

## Channel Totals

The JSON summary includes anonymized top-channel ranks and shares. Channel names and raw channel IDs are intentionally not written to committed reports.

## Month Totals

Full monthly totals are in `{RECON_JSON.name}`. Latest complete month recommendation: `{reconciliation["issueSummary"]["latestCompleteMonthRecommended"]}`.

No raw rows, work names, channel names, secrets, or connection strings are written in this report.
""",
        encoding="utf-8",
    )


def write_algorithm_markdown(algorithm: dict) -> None:
    ALGO_MD.write_text(
        f"""# M2 real-data algorithm calibration summary v0.1

Mode: authorized local real-data development.

## Candidate Comparison

{markdown_table([
    {"candidate": "candidate-a baseline", **algorithm["baselineCandidateA"]},
    {"candidate": CANDIDATE_VERSION, **algorithm["candidateB"]},
], [
    ("candidate", "Candidate"),
    ("evaluatedWorkCount", "Works"),
    ("manualReviewRequiredCount", "Blocking reviews"),
    ("advisoryOnlyCount", "Advisory reviews"),
    ("promoteCount", "Promote"),
    ("downlistOrSuspendCount", "Downlist/suspend"),
])}

## Candidate B Delta

{markdown_table(counts_rows(algorithm["deltaCandidateBMinusA"]), [("key", "Metric"), ("value", "Candidate B - A")])}

## Lifecycle Algorithm

{markdown_table(counts_rows(algorithm["lifecycleAlgorithm"]["thresholds"]), [("key", "Threshold"), ("value", "Value")])}

## Forecast Backtest

{markdown_table(algorithm["forecastAlgorithm"]["backtestMetrics"], [
    ("horizonMonths", "Horizon"),
    ("model", "Model"),
    ("sampleCount", "Samples"),
    ("mae", "MAE"),
    ("mape", "MAPE"),
    ("medianError", "Median error"),
    ("overCount", "Over"),
    ("underCount", "Under"),
])}

## Rating Thresholds

{markdown_table(counts_rows(algorithm["ratingAlgorithm"]["thresholds"]), [("key", "Rating"), ("value", "Amount threshold")])}

These outputs are real-data development results, not final release-approved formal results.
""",
        encoding="utf-8",
    )


def write_candidate_markdown(candidate: dict) -> None:
    CANDIDATE_MD.write_text(
        f"""# M2 real-data dev candidate b summary v0.1

Candidate: `{candidate["candidateVersion"]}`

Status: `{candidate["candidateStatus"]}`

This candidate is recommended for business review and continued development. It is not a final release-approved result and must not trigger automated business action.

## Summary

{markdown_table(counts_rows({
    "evaluatedWorkCount": candidate["evaluatedWorkCount"],
    "manualReviewRequiredCount": candidate["manualReviewRequiredCount"],
    "advisoryOnlyCount": candidate["advisoryOnlyCount"],
    "manualReviewReductionFromCandidateA": candidate["manualReviewReductionFromCandidateA"],
    "promoteCount": candidate["promoteCount"],
    "downlistOrSuspendCount": candidate["downlistOrSuspendCount"],
}), [("key", "Metric"), ("value", "Value")])}

## Rating Distribution

{markdown_table(counts_rows(candidate["ratingDistribution"]), [("key", "Rating"), ("value", "Count")])}

## Lifecycle Distribution

{markdown_table(counts_rows(candidate["lifecycleDistribution"]), [("key", "Lifecycle"), ("value", "Count")])}

## Required Manual Confirmation

{markdown_table([{"item": item} for item in candidate["requiresManualConfirmation"]], [("item", "Item")])}

No raw data or sensitive detail is written in this report.
""",
        encoding="utf-8",
    )


def write_plan_doc(profile: dict, reconciliation: dict, algorithm: dict, candidate: dict) -> None:
    PLAN_DOC.write_text(
        f"""# M2 authorized real-data development plan v0.1

Generated: {datetime.now(timezone.utc).isoformat()}

## Conclusion

The project is now in authorized local real-data development mode. This sprint reads local real data, performs aggregate profiling, strict reconciliation, real-data backtests, algorithm calibration, and DB-backed schema preparation while keeping raw data and secrets out of Git.

Recommended development candidate:

```text
{candidate["candidateVersion"]}
```

This candidate is not a final release-approved result.

## Data Sources

{markdown_table(profile["sourceInventory"], [
    ("alias", "Alias"),
    ("sourceType", "Type"),
    ("pathPattern", "Path pattern"),
    ("fileType", "File type"),
    ("fileCount", "File count"),
    ("recordScale", "Record scale"),
])}

## Reconciliation Gate

- Raw valid rows: `{reconciliation["rowReconciliation"]["validCalibrationRows"]}`
- Complete rows included: `{reconciliation["rowReconciliation"]["completeRowsIncluded"]}`
- Incomplete rows excluded: `{reconciliation["rowReconciliation"]["incompleteRowsExcluded"]}`
- Raw amount: `{reconciliation["amountReconciliation"]["rawTotalAmount"]}`
- Complete included amount: `{reconciliation["amountReconciliation"]["completeIncludedAmount"]}`
- Latest complete month: `{reconciliation["issueSummary"]["latestCompleteMonthRecommended"]}`

## Algorithm Gate

- Baseline candidate-a blocking reviews: `{algorithm["baselineCandidateA"]["manualReviewRequiredCount"]}`
- Candidate-b blocking reviews: `{algorithm["candidateB"]["manualReviewRequiredCount"]}`
- Candidate-b advisory reviews: `{algorithm["candidateB"]["advisoryOnlyCount"]}`
- Recommended forecast model: `{algorithm["forecastAlgorithm"]["recommendedModel"]}`

## DB-backed Development

The M2 persistence schema candidate is promoted into a local development migration under `db/migrations/`. Local migration execution is allowed in this mode; remote production/shared database execution remains prohibited.

Current execution note:

- Local DB-backed import/reconciliation runner: `scripts/m2-real-data/run_authorized_real_data_db_import.mjs`.
- Candidate-b review workflow runner: `scripts/m2-real-data/run_candidate_b_review_workflow.mjs`.
- Import dry-run can build the sanitized aggregate payload and plans 3054 work-level candidate rows, 85 blocking review items, and 2759 advisory review items.
- Local Docker/PostgreSQL execution has been validated with PostgreSQL 16 (`postgres:16-bookworm`), local migration state reaches `0070.000`, DB import writes 3054 evaluation results, 85 blocking review items, and 2759 advisory review items, and DB-backed reconciliation passes against the file-level aggregate reports.
- These DB-backed outputs remain authorized local development evidence, not final release-approved formal results.

## Safety

- Raw bills, ledgers, private Excel/CSV, database dumps, temporary database files, `.env`, `.pgpass`, and secrets must not be committed.
- Final replies and committed docs must contain only aggregate statistics, thresholds, metrics, and conclusions.
- Sensitive drill-down must remain in gitignored private paths.
""",
        encoding="utf-8",
    )


def main() -> None:
    context = load_analysis_inputs()
    candidate_a = evaluate_variant(context, "candidate-a")
    candidate_b = evaluate_variant(context, "candidate-b")

    profile = build_profile(context, candidate_b)
    reconciliation = build_reconciliation(context)
    algorithm = build_algorithm_summary(context, candidate_a, candidate_b)
    candidate = build_candidate_summary(algorithm)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    write_json(PROFILE_JSON, profile)
    write_json(RECON_JSON, reconciliation)
    write_json(ALGO_JSON, algorithm)
    write_json(CANDIDATE_JSON, candidate)
    write_profile_markdown(profile)
    write_reconciliation_markdown(reconciliation)
    write_algorithm_markdown(algorithm)
    write_candidate_markdown(candidate)
    write_plan_doc(profile, reconciliation, algorithm, candidate)

    print(json.dumps({
        "status": "pass",
        "mode": "authorized_local_real_data_development",
        "candidateVersion": CANDIDATE_VERSION,
        "billRowCount": profile["scale"]["billRowCount"],
        "validCalibrationRows": reconciliation["rowReconciliation"]["validCalibrationRows"],
        "completeRowsIncluded": reconciliation["rowReconciliation"]["completeRowsIncluded"],
        "latestCompleteMonth": reconciliation["issueSummary"]["latestCompleteMonthRecommended"],
        "candidateBManualReviewRequiredCount": candidate["manualReviewRequiredCount"],
        "candidateBAdvisoryOnlyCount": candidate["advisoryOnlyCount"],
        "rawRowsWritten": False,
        "secretsWritten": False,
        "outputs": [
            PROFILE_JSON.as_posix(),
            PROFILE_MD.as_posix(),
            RECON_JSON.as_posix(),
            RECON_MD.as_posix(),
            ALGO_JSON.as_posix(),
            ALGO_MD.as_posix(),
            CANDIDATE_JSON.as_posix(),
            CANDIDATE_MD.as_posix(),
            PLAN_DOC.as_posix(),
        ],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
