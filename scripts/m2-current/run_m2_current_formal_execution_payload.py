#!/usr/bin/env python3
"""Build the current private M2 payload without mutating frozen historical runners.

The historical ``run_m2_formal_execution_payload`` module is an immutable audit
source.  This adapter reuses its stable calculation helpers while replacing
only the current input composition: predictions use the human-reviewed
sales-share ledger, total cash remains rating/audit context, and buyout cash is
marked as outside the forecast target.
"""

from __future__ import annotations

import json
import math
import os
import pickle
import sys
from collections import defaultdict
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[2]
CURRENT_DIR = Path(__file__).resolve().parent
REAL_DATA_DIR = ROOT / "scripts" / "m2-real-data"
TOOLS_DIR = ROOT / "tools" / "m2-calibration"
TEMP_DEPS = Path(os.environ.get("TEMP", "")) / "codex-system-pydeps"
for candidate in (TEMP_DEPS, CURRENT_DIR, REAL_DATA_DIR, TOOLS_DIR):
    if candidate.exists() and str(candidate) not in sys.path:
        sys.path.insert(0, str(candidate))

from calibrate_cleaned_bills import (  # noqa: E402
    KNOWN_INCOMPLETE_MONTHS,
    build_work_summary,
)
from run_nonformal_dry_run import load_analysis_inputs  # noqa: E402
import run_m2_disentangled_forecastability_validation as v1  # noqa: E402
import run_m2_disentangled_forecast_v1_1_validation as v11  # noqa: E402
import run_m2_forecast_model_bakeoff as bake  # noqa: E402
import run_m2_formal_execution_payload as historical  # noqa: E402
import run_m2_post_foundation_readiness as readiness  # noqa: E402


PRIVATE_DIR = historical.PRIVATE_DIR
PAYLOAD_PATH = historical.PAYLOAD_PATH
FACTS_PATH = historical.FACTS_PATH
MODEL_CACHE_PATH = historical.MODEL_CACHE_PATH
PAYLOAD_SCHEMA = historical.PAYLOAD_SCHEMA
CANDIDATE_VERSION = historical.CANDIDATE_VERSION
ALGORITHM_VERSION = historical.ALGORITHM_VERSION
PARAMETER_VERSION = historical.PARAMETER_VERSION
CACHE_VERSION = "selector-only-backtest-v2-human-ledger-partition"

progress = historical.progress
clean = historical.clean
sha256_file = historical.sha256_file
stable_hash = historical.stable_hash
json_value = historical.json_value
decimal_text = historical.decimal_text
database_derived_standard_work_id = historical.database_derived_standard_work_id


def model_cache_signature() -> str:
    """Bind the private cache to all three ledger roles and current adapters."""

    from human_ledger_partition import CONFIG_PATH, discover_partition_sources
    from calibrate_cleaned_bills import DATA_DIR

    partition_sources = discover_partition_sources(DATA_DIR)
    paths = [
        *partition_sources.all(),
        CONFIG_PATH,
        ROOT / "tools" / "m2-calibration" / "human_ledger_partition.py",
        Path(__file__),
        readiness.FOUNDATION_PATH,
        readiness.FORMAL_INPUT_PATH,
        readiness.MAPPING_PAYLOAD,
        readiness.MAPPING_OVERLAY,
        Path(bake.__file__),
        Path(v1.__file__),
        Path(v11.__file__),
    ]
    return stable_hash(
        {
            "cacheVersion": CACHE_VERSION,
            "inputs": [
                {
                    "path": str(path.relative_to(ROOT)).replace("\\", "/"),
                    "sha256": sha256_file(path),
                }
                for path in paths
            ],
        }
    )


def load_or_build_model_inputs():
    signature = model_cache_signature()
    if MODEL_CACHE_PATH.exists():
        try:
            with MODEL_CACHE_PATH.open("rb") as handle:
                cached = pickle.load(handle)
            if cached.get("signature") == signature:
                progress("using the private current human-ledger model cache")
                return cached["modelInputs"]
        except Exception:
            progress("private current model cache was unreadable and will be rebuilt")
    model_inputs = build_current_model_inputs()
    PRIVATE_DIR.mkdir(parents=True, exist_ok=True)
    with MODEL_CACHE_PATH.open("wb") as handle:
        pickle.dump(
            {"signature": signature, "modelInputs": model_inputs},
            handle,
            protocol=pickle.HIGHEST_PROTOCOL,
        )
    progress("saved the private current human-ledger model cache")
    return model_inputs


def build_current_model_inputs() -> dict:
    progress("loading the verified 3053-work foundation and human ledger partition")
    context = load_analysis_inputs()
    foundation, foundation_summary = readiness.load_foundation()
    final_ids = set(foundation)
    formal_input = readiness.load_verified_formal_input(final_ids)
    if len(formal_input) != 3053:
        raise SystemExit("Contract-verified formal input must contain exactly 3053 works.")

    raw_mapping, standard_mapping = readiness.load_historical_mappings()
    mapped_bill, scope_reconciliation = readiness.apply_foundation_scope(
        context["bill"],
        final_ids,
        raw_mapping,
        standard_mapping,
        require_full_scope=False,
    )
    mapped_sales_share_bill, sales_share_scope = readiness.apply_foundation_scope(
        context["sales_share_bill"],
        final_ids,
        raw_mapping,
        standard_mapping,
        require_full_scope=False,
    )
    mapped_buyout_bill, buyout_scope = readiness.apply_foundation_scope(
        context["buyout_bill"],
        final_ids,
        raw_mapping,
        standard_mapping,
        require_full_scope=False,
    )
    if len(mapped_bill) != len(mapped_sales_share_bill) + len(mapped_buyout_bill):
        raise SystemExit("Human ledger partition row conservation changed after mapping.")
    if not math.isclose(
        float(mapped_bill["amount"].sum()),
        float(mapped_sales_share_bill["amount"].sum())
        + float(mapped_buyout_bill["amount"].sum()),
        rel_tol=0.0,
        abs_tol=1e-5,
    ):
        raise SystemExit("Human ledger partition amount conservation changed after mapping.")

    master_dates = {}
    for work_id, record in formal_input.items():
        start_value = clean(record.get("版权开始"))
        end_value = clean(record.get("版权到期"))
        master_dates[work_id] = {
            "start": date.fromisoformat(start_value),
            "end": (
                date.fromisoformat(end_value)
                if clean(record.get("版权到期类型")) == "exact_date"
                else None
            ),
            "conflict": False,
        }

    work_summary, work_month_stats = build_work_summary(
        mapped_sales_share_bill,
        master_dates,
        context["latest_complete_month"],
        population_ids=final_ids,
    )
    incomplete_work_ids = set(
        mapped_sales_share_bill.loc[
            mapped_sales_share_bill["validForCalibration"]
            & mapped_sales_share_bill["billMonth"].isin(KNOWN_INCOMPLETE_MONTHS),
            "standardWorkId",
        ]
        .dropna()
        .astype(str)
    )
    current_context = {
        **context,
        "bill": mapped_sales_share_bill,
        "total_ledger_bill": mapped_bill,
        "buyout_bill": mapped_buyout_bill,
        "population_ids": final_ids,
        "work_summary": work_summary,
        "work_month_stats": work_month_stats,
        "incomplete_work_ids": incomplete_work_ids,
    }

    evaluated = bake.evaluate_work_summary(
        work_summary,
        context["parameters"],
        context["latest_complete_month"],
        incomplete_work_ids,
        bake.PARAMETER_VARIANT,
    ).sort_values("standardWorkId").reset_index(drop=True)
    evaluated = bake.enrich_evaluated(evaluated)

    progress("rebuilding rating, forecastability, and backtest inputs on current scope")
    work_rows, input_snapshot = readiness.build_current_work_rows(
        context, mapped_bill, foundation
    )
    input_snapshot["ratingCashContext"] = {
        "source": "total_ledger_including_buyout_historical_context",
        "buyoutAllowedForRatingOnly": True,
        "notCashForecast": True,
    }
    front_rating = {
        str(row["standardWorkId"]): row["frontRating"] for row in work_rows
    }
    evaluated["rating"] = evaluated["standardWorkId"].astype(str).map(front_rating)
    if evaluated["rating"].isna().any():
        raise SystemExit("Front-rating join is incomplete for the 3053-work scope.")

    matrix, months = bake.build_month_matrix(current_context)
    matrix = matrix.reindex(
        index=sorted(str(value) for value in final_ids),
        fill_value=0.0,
    )
    q = bake.build_quantile_reference(matrix)
    thresholds = context["parameters"]["lifecycle"]
    feature_lookup = {
        str(row.standardWorkId): {
            "rating": row.rating,
            "riskCodes": row.riskCodes,
            "forecastFallbackUsed": row.forecastFallbackUsed,
            "suggestionBucket": row.suggestionBucket,
            "remainingCopyrightBucket": row.remainingCopyrightBucket,
        }
        for _, row in evaluated.iterrows()
    }
    cases = historical.build_selector_backtest_cases(
        matrix, months, thresholds, q, feature_lookup
    )
    final_outputs = bake.final_predictions(evaluated, matrix, thresholds, q)

    v1_gate = v1.build_current_gate_frame(evaluated, final_outputs)
    v1_1_gate, gate_changes = v11.apply_v1_1_gate_boundary(v1_gate, final_outputs)
    coverage = v1.build_coverage_report(v1_1_gate)
    v1_cases = v1.build_disentangled_cases(cases, v1_1_gate)
    v1_1_cases, interval_rows = v11.apply_interval_calibration(v1_cases)
    validation = v1.build_validation_report(v1_1_cases, v1_1_gate, coverage)
    validation = v11.enrich_validation(validation, v1_1_cases, coverage)

    if set(v1_1_gate["workKey"].astype(str)) != final_ids:
        raise SystemExit("Forecast gate scope does not match the fixed 3053-work foundation.")

    def scope_counts(frame: pd.DataFrame) -> dict:
        valid = frame[frame["validForCalibration"]]
        complete = valid[
            valid["billMonth"].astype(str) <= context["latest_complete_month"]
        ]
        return {
            "factCount": int(len(valid)),
            "completeFactCount": int(len(complete)),
            "completeAmount": float(complete["amount"].sum()),
        }

    cash_classification_authority = {
        "schema": "m2.current.human_ledger_partition.cache_authority.v0.1",
        "authorityMode": "user_reviewed_workbook_membership",
        "machineClassificationUsed": False,
        "salesShareForecastSourceOnly": True,
        "buyoutRatingHistoricalContextOnly": True,
        "buyoutNotCashForecast": True,
        "latestCompleteMonth": context["latest_complete_month"],
        "totalLedger": scope_counts(mapped_bill),
        "salesShare": scope_counts(mapped_sales_share_bill),
        "buyout": scope_counts(mapped_buyout_bill),
        "rowConserved": True,
        "amountConserved": True,
        "salesShareScope": sales_share_scope,
        "buyoutScope": buyout_scope,
    }
    return {
        "context": current_context,
        "foundation": foundation,
        "foundationSummary": foundation_summary,
        "formalInput": formal_input,
        "mappedBill": mapped_bill,
        "mappedSalesShareBill": mapped_sales_share_bill,
        "mappedBuyoutBill": mapped_buyout_bill,
        "cashClassificationAuthority": cash_classification_authority,
        "scopeReconciliation": scope_reconciliation,
        "inputSnapshot": input_snapshot,
        "evaluated": evaluated,
        "gate": v1_1_gate,
        "validation": validation,
        "coverage": coverage,
        "gateChanges": gate_changes,
        "intervalCalibration": interval_rows,
    }


def build_fact_payload(model_inputs: dict) -> dict:
    progress("building the private category-explicit income-fact payload")
    mapped_bill = model_inputs["mappedBill"]
    valid = mapped_bill[mapped_bill["validForCalibration"]].copy()
    if len(valid) != len(mapped_bill):
        raise SystemExit("Formal import refuses bill rows outside the validated mapping scope.")

    raw_mappings, historical_mappings, mapping_kind = historical.mapping_catalog(
        mapped_bill
    )
    from calibrate_cleaned_bills import discover_sources

    bill_path = discover_sources()[0]
    source_sha = sha256_file(bill_path)
    source_size = bill_path.stat().st_size
    monthly = defaultdict(
        lambda: {"rowCount": 0, "amountTotal": Decimal("0"), "hashes": []}
    )
    channels = {}
    total = Decimal("0")
    all_hashes = []
    PRIVATE_DIR.mkdir(parents=True, exist_ok=True)
    with FACTS_PATH.open("w", encoding="utf-8", newline="\n") as handle:
        for position, (source_index, row) in enumerate(valid.iterrows(), start=1):
            raw_work_id = clean(row.get("rawWorkId"))
            target_work_id = clean(row.get("standardWorkId"))
            raw_channel_name = clean(row.get("文学库渠道名称")) or "未提供渠道名称"
            raw_channel_id = clean(row.get("渠道ID"))
            if not raw_channel_id:
                raw_channel_id = f"missing-{stable_hash(raw_channel_name)[:16]}"
            cash_category = clean(row.get("cashCategory"))
            channel_key = stable_hash(
                [raw_channel_id, raw_channel_name, cash_category]
            )[:24]
            channels[channel_key] = {
                "channelKey": channel_key,
                "rawChannelId": raw_channel_id,
                "rawChannelName": raw_channel_name,
                "cashCategory": cash_category,
                "channelCode": f"local-{stable_hash(raw_channel_id)[:20]}",
            }
            amount = decimal_text(row.get("amount"))
            bill_month = f"{clean(row.get('billMonth'))}-01"
            source_row_number = (
                int(source_index) + 2
                if isinstance(source_index, int)
                else position + 1
            )
            fact = {
                "sourceRowNumber": source_row_number,
                "billMonth": bill_month,
                "rawChannelId": raw_channel_id,
                "rawChannelName": raw_channel_name,
                "rawAuthorizationCategory": (
                    clean(row.get("授权分类")) or "未提供授权分类"
                ),
                "rawWorkId": raw_work_id,
                "rawWorkName": clean(row.get("作品名称")) or "未提供作品名称",
                "actualSalesAmount": amount,
                "standardWorkId": target_work_id,
                "businessForm": clean(row.get("businessForm")),
                "cashCategory": cash_category,
                "cashCategoryAuthority": clean(row.get("cashCategoryAuthority")),
                "notCashForecast": cash_category == "buyout",
                "mappingKind": mapping_kind.get(raw_work_id),
                "channelKey": channel_key,
            }
            fact["rowHash"] = stable_hash(fact)
            if fact["mappingKind"] not in {"raw", "historical"}:
                raise SystemExit("A formal income fact is missing a mapping source.")
            handle.write(
                json.dumps(fact, ensure_ascii=False, separators=(",", ":")) + "\n"
            )
            value = Decimal(amount)
            total += value
            monthly[bill_month]["rowCount"] += 1
            monthly[bill_month]["amountTotal"] += value
            monthly[bill_month]["hashes"].append(fact["rowHash"])
            all_hashes.append(fact["rowHash"])
            if position % 25000 == 0:
                progress(f"prepared {position} private income facts")

    month_rows = [
        {
            "billMonth": month,
            "rowCount": values["rowCount"],
            "amountTotal": format(values["amountTotal"], "f"),
            "sourceFactChecksum": stable_hash(values["hashes"]),
        }
        for month, values in sorted(monthly.items())
    ]
    return {
        "sourceBill": {
            "originalFilename": bill_path.name,
            "sha256": source_sha,
            "fileSizeBytes": source_size,
            "sourceSheetName": "账单明细",
        },
        "factFile": str(FACTS_PATH.relative_to(ROOT)).replace("\\", "/"),
        "factFileSha256": sha256_file(FACTS_PATH),
        "factRowCount": len(valid),
        "factTotalAmount": format(total, "f"),
        "factChecksum": stable_hash(all_hashes),
        "monthly": month_rows,
        "channels": list(channels.values()),
        "rawMappings": raw_mappings,
        "historicalMappings": historical_mappings,
    }


def run() -> dict:
    model_inputs = load_or_build_model_inputs()
    fact_payload = build_fact_payload(model_inputs)
    progress("building formal aggregate evaluation records")
    records = historical.build_formal_records(model_inputs)
    if len(records) != 3053:
        raise SystemExit("Formal evaluation payload must contain 3053 works.")
    if any(not row["standardWorkName"] or not row["authorName"] for row in records):
        raise SystemExit("Formal evaluation payload has a missing work name or author.")

    summary = historical.aggregate_payload(records, model_inputs)
    payload = {
        "schema": PAYLOAD_SCHEMA,
        "privateOnly": True,
        "notForCommit": True,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "candidateVersion": CANDIDATE_VERSION,
        "algorithmVersion": ALGORITHM_VERSION,
        "parameterVersion": PARAMETER_VERSION,
        "algorithmStatus": "frozen_conditional_not_released",
        "formalEvaluationAuthorized": True,
        "finalReleaseApproved": False,
        "operatingSuggestionsIncluded": False,
        "latestCompleteMonth": model_inputs["context"]["latest_complete_month"],
        "scopeReconciliation": model_inputs["scopeReconciliation"],
        "cashClassificationAuthority": model_inputs["cashClassificationAuthority"],
        "reviewDecisionSummary": {
            "total": 238,
            "approved": 238,
            "pending": 0,
        },
        "factImport": fact_payload,
        "summary": summary,
        "records": records,
    }
    payload["payloadHash"] = stable_hash(
        {
            "candidateVersion": payload["candidateVersion"],
            "algorithmVersion": payload["algorithmVersion"],
            "factChecksum": fact_payload["factChecksum"],
            "recordInputHashes": [row["inputHash"] for row in records],
        }
    )
    PRIVATE_DIR.mkdir(parents=True, exist_ok=True)
    PAYLOAD_PATH.write_text(
        json.dumps(json_value(payload), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    progress("private current payload completed; no row-level data was printed")
    return {
        "payloadGenerated": True,
        "schema": PAYLOAD_SCHEMA,
        "workCount": len(records),
        "factRowCount": fact_payload["factRowCount"],
        "scopeFullyAligned": model_inputs["scopeReconciliation"]["scopeFullyAligned"],
        "candidateVersion": CANDIDATE_VERSION,
        "modelVerdict": summary["modelValidation"]["verdict"],
        "operatingSuggestionCount": 0,
        "privatePayload": str(PAYLOAD_PATH.relative_to(ROOT)).replace("\\", "/"),
        "privateFacts": str(FACTS_PATH.relative_to(ROOT)).replace("\\", "/"),
    }


if __name__ == "__main__":
    print(json.dumps(run(), ensure_ascii=False, indent=2))
