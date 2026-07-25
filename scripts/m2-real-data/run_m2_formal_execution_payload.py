from __future__ import annotations

import hashlib
import json
import math
import os
import pickle
import re
import sys
from collections import Counter, defaultdict
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[2]
SCRIPT_DIR = Path(__file__).resolve().parent
TOOLS_DIR = ROOT / "tools" / "m2-calibration"
TEMP_DEPS = Path(os.environ.get("TEMP", "")) / "codex-system-pydeps"
for candidate in (TEMP_DEPS, SCRIPT_DIR, TOOLS_DIR):
    if candidate.exists():
        sys.path.insert(0, str(candidate))

from calibrate_cleaned_bills import (  # noqa: E402
    KNOWN_INCOMPLETE_MONTHS,
    build_work_summary,
)
from run_nonformal_dry_run import load_analysis_inputs  # noqa: E402
import run_m2_disentangled_forecastability_validation as v1  # noqa: E402
import run_m2_disentangled_forecast_v1_1_validation as v11  # noqa: E402
import run_m2_forecast_model_bakeoff as bake  # noqa: E402
import run_m2_post_foundation_readiness as readiness  # noqa: E402


PRIVATE_DIR = ROOT / "data" / "private-output" / "m2-formal-execution"
PAYLOAD_PATH = PRIVATE_DIR / "m2-formal-execution-payload-v1.json"
FACTS_PATH = PRIVATE_DIR / "m2-formal-income-facts-v1.ndjson"
MODEL_CACHE_PATH = PRIVATE_DIR / "m2-formal-model-input-cache-v1.pkl"

PAYLOAD_SCHEMA = "m2.formal_execution_private_payload.v1"
CANDIDATE_VERSION = "m2-realdata-dev-disentangled-forecast-v1.1-conditional"
ALGORITHM_VERSION = "m2-disentangled-forecast-v1.1-conditional-formal-eval-v1"
PARAMETER_VERSION = "m2-disentangled-forecast-v1.1"
CACHE_VERSION = "selector-only-backtest-v2-human-ledger-partition"


def progress(message: str) -> None:
    print(f"[m2-formal-payload] {message}", file=sys.stderr, flush=True)


def clean(value) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and math.isnan(value):
        return ""
    return str(value).strip()


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def stable_hash(value) -> str:
    serialized = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return sha256_bytes(serialized.encode("utf-8"))


def model_cache_signature() -> str:
    from calibrate_cleaned_bills import DATA_DIR
    from human_ledger_partition import CONFIG_PATH, discover_partition_sources

    partition_sources = discover_partition_sources(DATA_DIR)
    paths = [
        *partition_sources.all(),
        CONFIG_PATH,
        Path(__file__).resolve().parents[2]
        / "tools"
        / "m2-calibration"
        / "human_ledger_partition.py",
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
                progress("using the private selector-only model cache")
                return cached["modelInputs"]
        except Exception:
            progress("private model cache was unreadable and will be rebuilt")
    model_inputs = build_current_model_inputs()
    PRIVATE_DIR.mkdir(parents=True, exist_ok=True)
    with MODEL_CACHE_PATH.open("wb") as handle:
        pickle.dump(
            {"signature": signature, "modelInputs": model_inputs},
            handle,
            protocol=pickle.HIGHEST_PROTOCOL,
        )
    progress("saved the private selector-only model cache")
    return model_inputs


def json_value(value):
    if value is None:
        return None
    if isinstance(value, (datetime, date, pd.Timestamp)):
        return value.isoformat()
    if hasattr(value, "item"):
        value = value.item()
    if isinstance(value, float):
        if not math.isfinite(value):
            return None
        return round(value, 8)
    if isinstance(value, dict):
        return {str(key): json_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [json_value(item) for item in value]
    return value


def decimal_text(value) -> str:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return "0"
    number = Decimal(str(value))
    return format(number, "f")


def database_derived_standard_work_id(raw_work_id: str) -> str | None:
    value = clean(raw_work_id).upper()
    if re.fullmatch(r"\d+", value):
        return value
    if re.fullmatch(r"Y\d+", value):
        return value[1:]
    return None


def term_record(row: dict) -> dict:
    end_value = clean(row.get("版权到期"))
    end_type = clean(row.get("版权到期类型"))
    if end_type == "exact_date":
        end_date = end_value
    else:
        end_date = None
    return {
        "copyrightStart": clean(row.get("版权开始")),
        "copyrightEnd": end_date,
        "copyrightEndType": end_type,
        "copyrightEndValue": end_value,
    }


def predict_selector_only(
    history,
    horizon: int,
    thresholds: dict,
    q: dict[str, float],
    cohort_priors: dict,
    *,
    rating: str,
    data_gap: bool,
) -> tuple[dict, float]:
    stats = bake.history_stats(history, thresholds)
    stats["history"] = history
    scale = bake.scale_from_stats(stats, q)
    spike = stats["peakShare"] >= 0.90
    raw, _ = bake.raw_trailing_prediction(stats, horizon)
    values = {}
    values["model_a_trailing_baseline"] = bake.model_a_prediction(stats, horizon)
    values["model_b_lifecycle_robust"] = bake.model_b_prediction(stats, horizon)
    values["model_c_zero_inflated_sparse"] = bake.model_c_prediction(stats, horizon)
    cohort_key = (stats["lifecycle"], scale)
    cohort_monthly = cohort_priors.get(
        cohort_key, cohort_priors.get((stats["lifecycle"], "all"), 0.0)
    )
    values["model_d_hierarchical_shrinkage"] = bake.model_d_prediction(
        stats, horizon, cohort_monthly
    )
    selected_model, selection_reason = bake.select_model(
        stats, rating, scale, spike
    )
    selected_base = max(0.0, values[selected_model][0])
    confidence = bake.confidence_for(
        stats, scale, selected_model, data_gap=data_gap
    )
    output = bake.build_forecast_output(
        selected_base, confidence, stats, scale, selected_model
    )
    output.update(
        {
            "selectedModel": selected_model,
            "modelReason": selection_reason,
            "lifecycle": stats["lifecycle"],
            "revenueScale": scale,
            "activeMonths": stats["activeMonths"],
            "zeroMonths": stats["zeroMonths"],
            "last12": stats["last12"],
            "peakShare": stats["peakShare"],
        }
    )
    return output, max(0.0, raw)


def build_selector_backtest_cases(
    matrix: pd.DataFrame,
    months: list[str],
    thresholds: dict,
    q: dict[str, float],
    feature_lookup: dict[str, dict],
) -> pd.DataFrame:
    records = []
    series_rows = [
        (str(standard_id), series.to_numpy(dtype=float))
        for standard_id, series in matrix.iterrows()
    ]
    cohort_priors_cache = {}
    cutoff_total = sum(
        len(bake.rolling_cutoff_indices(months, horizon))
        for horizon in bake.HORIZONS
    )
    cutoff_position = 0
    for horizon in bake.HORIZONS:
        for cutoff_idx in bake.rolling_cutoff_indices(months, horizon):
            cutoff_position += 1
            progress(
                f"selector backtest cutoff {cutoff_position}/{cutoff_total} "
                f"(horizon={horizon})"
            )
            if cutoff_idx not in cohort_priors_cache:
                cohort_priors_cache[cutoff_idx] = bake.build_cohort_priors(
                    matrix, cutoff_idx, thresholds, q
                )
            cohort_priors = cohort_priors_cache[cutoff_idx]
            cutoff_month = months[cutoff_idx]
            for standard_id, values in series_rows:
                history = values[: cutoff_idx + 1]
                actual_window = values[
                    cutoff_idx + 1 : cutoff_idx + 1 + horizon
                ]
                if len(actual_window) < horizon:
                    continue
                actual = float(actual_window.sum())
                features = feature_lookup.get(standard_id, {})
                rating = str(features.get("rating", "C"))
                risk_codes = set(features.get("riskCodes") or [])
                data_gap = bool(features.get("forecastFallbackUsed")) or (
                    "missing_copyright_end" in risk_codes
                )
                output, raw_baseline = predict_selector_only(
                    history,
                    horizon,
                    thresholds,
                    q,
                    cohort_priors,
                    rating=rating,
                    data_gap=data_gap,
                )
                prediction = bake.safe_float(output["base"])
                error = abs(prediction - actual)
                baseline_error = abs(raw_baseline - actual)
                records.append(
                    {
                        "workKey": standard_id,
                        "anonymousWorkId": None,
                        "modelId": "model_e_selector",
                        "cutoffMonth": cutoff_month,
                        "horizonMonths": horizon,
                        "predicted": prediction,
                        "actual": actual,
                        "absoluteError": error,
                        "baselinePredicted": raw_baseline,
                        "baselineAbsoluteError": baseline_error,
                        "betterThanBaseline": error <= baseline_error,
                        "smape": bake.smape(prediction, actual),
                        "ape": error / actual if actual > 0 else None,
                        "intervalCoverage": bake.safe_float(output["pessimistic"])
                        <= actual
                        <= bake.safe_float(output["optimistic"]),
                        "overForecast": prediction > actual,
                        "underForecast": prediction < actual,
                        "confidence": output["confidence"],
                        "optimisticPessimisticRatio": output[
                            "optimisticPessimisticRatio"
                        ],
                        "ratingAtCutoff": rating,
                        "lifecycleAtCutoff": output["lifecycle"],
                        "revenueScaleAtCutoff": output["revenueScale"],
                        "activeMonthsAtCutoff": output["activeMonths"],
                        "activeMonthsBucketAtCutoff": bake.count_bucket(
                            output["activeMonths"], [3, 6, 12, 18]
                        ),
                        "zeroMonthsAtCutoff": output["zeroMonths"],
                        "zeroMonthsBucketAtCutoff": bake.count_bucket(
                            output["zeroMonths"], [3, 6, 12, 24]
                        ),
                        "peakShareAtCutoff": output["peakShare"],
                        "abnormalSpikeAtCutoff": bake.bool_bucket(
                            output["peakShare"] >= 0.90
                        ),
                        "dataGapAtCutoff": bake.bool_bucket(data_gap),
                        "suggestionBucket": features.get(
                            "suggestionBucket", "unknown"
                        ),
                        "remainingCopyrightBucket": features.get(
                            "remainingCopyrightBucket", "unknown"
                        ),
                        "selectedModel": output["selectedModel"],
                        "selectionReason": output["modelReason"],
                    }
                )
    return pd.DataFrame(records)


def build_current_model_inputs():
    progress("loading the verified 3053-work foundation and cleaned bill scope")
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
            "end": date.fromisoformat(end_value)
            if clean(record.get("版权到期类型")) == "exact_date"
            else None,
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

    progress("rebuilding rating, forecastability, and backtest inputs on the 3053-work scope")
    work_rows, input_snapshot = readiness.build_current_work_rows(
        context, mapped_bill, foundation
    )
    input_snapshot["ratingCashContext"] = {
        "source": "total_ledger_including_buyout_historical_context",
        "buyoutAllowedForRatingOnly": True,
        "notCashForecast": True,
    }
    front_rating = {str(row["standardWorkId"]): row["frontRating"] for row in work_rows}
    evaluated["rating"] = evaluated["standardWorkId"].astype(str).map(front_rating)
    if evaluated["rating"].isna().any():
        raise SystemExit("Front-rating join is incomplete for the 3053-work scope.")

    matrix, months = bake.build_month_matrix(current_context)
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
    cases = build_selector_backtest_cases(
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


def mapping_catalog(mapped_bill: pd.DataFrame) -> tuple[list[dict], list[dict], dict]:
    rows = (
        mapped_bill.loc[
            mapped_bill["validForCalibration"],
            ["rawWorkId", "standardWorkId", "businessForm"],
        ]
        .drop_duplicates()
        .sort_values(["standardWorkId", "businessForm", "rawWorkId"])
    )
    by_target = defaultdict(list)
    for row in rows.itertuples(index=False):
        by_target[(str(row.standardWorkId), str(row.businessForm))].append(str(row.rawWorkId))

    raw_rows = []
    historical_rows = []
    mapping_kind = {}
    for (target, business_form), raw_ids in sorted(by_target.items()):
        derived_candidates = [
            raw_id
            for raw_id in raw_ids
            if database_derived_standard_work_id(raw_id) == target
        ]
        primary = sorted(derived_candidates)[0] if derived_candidates else None
        for raw_id in sorted(raw_ids):
            record = {
                "rawWorkId": raw_id,
                "standardWorkId": target,
                "businessForm": business_form,
            }
            if raw_id == primary:
                raw_rows.append(record)
                mapping_kind[raw_id] = "raw"
            else:
                historical_rows.append(record)
                mapping_kind[raw_id] = "historical"
    return raw_rows, historical_rows, mapping_kind


def build_fact_payload(model_inputs: dict) -> dict:
    progress("building the private income-fact and mapping payload")
    mapped_bill = model_inputs["mappedBill"]
    valid = mapped_bill[mapped_bill["validForCalibration"]].copy()
    if len(valid) != len(mapped_bill):
        raise SystemExit("Formal import refuses bill rows outside the validated mapping scope.")

    raw_mappings, historical_mappings, mapping_kind = mapping_catalog(mapped_bill)
    from calibrate_cleaned_bills import discover_sources

    bill_path = discover_sources()[0]
    source_sha = sha256_file(bill_path)
    source_size = bill_path.stat().st_size

    monthly = defaultdict(lambda: {"rowCount": 0, "amountTotal": Decimal("0"), "hashes": []})
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
            channel_key = stable_hash([raw_channel_id, raw_channel_name])[:24]
            channels[channel_key] = {
                "channelKey": channel_key,
                "rawChannelId": raw_channel_id,
                "rawChannelName": raw_channel_name,
                "channelCode": f"local-{stable_hash(raw_channel_id)[:20]}",
            }
            amount = decimal_text(row.get("amount"))
            bill_month = f"{clean(row.get('billMonth'))}-01"
            source_row_number = int(source_index) + 2 if isinstance(source_index, int) else position + 1
            fact = {
                "sourceRowNumber": source_row_number,
                "billMonth": bill_month,
                "rawChannelId": raw_channel_id,
                "rawChannelName": raw_channel_name,
                "rawAuthorizationCategory": clean(row.get("授权分类")) or "未提供授权分类",
                "rawWorkId": raw_work_id,
                "rawWorkName": clean(row.get("作品名称")) or "未提供作品名称",
                "actualSalesAmount": amount,
                "standardWorkId": target_work_id,
                "businessForm": clean(row.get("businessForm")),
                "cashCategory": clean(row.get("cashCategory")),
                "cashCategoryAuthority": clean(
                    row.get("cashCategoryAuthority")
                ),
                "notCashForecast": clean(row.get("cashCategory")) == "buyout",
                "mappingKind": mapping_kind.get(raw_work_id),
                "channelKey": channel_key,
            }
            fact["rowHash"] = stable_hash(fact)
            if fact["mappingKind"] not in {"raw", "historical"}:
                raise SystemExit("A formal income fact is missing a mapping source.")
            handle.write(json.dumps(fact, ensure_ascii=False, separators=(",", ":")) + "\n")
            value = Decimal(amount)
            total += value
            monthly[bill_month]["rowCount"] += 1
            monthly[bill_month]["amountTotal"] += value
            monthly[bill_month]["hashes"].append(fact["rowHash"])
            all_hashes.append(fact["rowHash"])
            if position % 25000 == 0:
                progress(f"prepared {position} private income facts")

    month_rows = []
    for month, values in sorted(monthly.items()):
        month_rows.append(
            {
                "billMonth": month,
                "rowCount": values["rowCount"],
                "amountTotal": format(values["amountTotal"], "f"),
                "sourceFactChecksum": stable_hash(values["hashes"]),
            }
        )
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


def confidence_for(row: dict) -> str:
    value = clean(row.get("confidence") or row.get("forecastConfidence"))
    return value if value in {"low", "medium", "high"} else "unknown"


def build_formal_records(model_inputs: dict) -> list[dict]:
    foundation = model_inputs["foundation"]
    formal_input = model_inputs["formalInput"]
    evaluated = model_inputs["evaluated"].set_index("standardWorkId").to_dict(orient="index")
    gate = model_inputs["gate"].set_index("workKey").to_dict(orient="index")
    rows = []
    for work_id in sorted(foundation, key=lambda item: (len(item), item)):
        base = formal_input[work_id]
        evaluation = evaluated[work_id]
        forecast = gate[work_id]
        term = term_record(base)
        status = clean(base.get("作品状态"))
        audio_status = clean(base.get("音频版权状态"))
        audio_status_code = {
            "版权有效": "active",
            "无限期": "perpetual",
            "版权已到期": "expired",
        }[audio_status]
        rights_term_status_conflict = (
            (term["copyrightEndType"] == "perpetual")
            != (audio_status_code == "perpetual")
        ) or (
            term["copyrightEndType"] == "expired_unknown_date"
            and audio_status_code != "expired"
        )
        classification = [
            clean(base.get("一级分类")),
            clean(base.get("二级分类")),
            clean(base.get("三级分类")),
        ]
        tags = readiness.split_tags(base.get("辅助标签"))
        risk_codes = list(dict.fromkeys(json_value(evaluation.get("riskCodes")) or []))
        if forecast.get("forecastabilityStatus") == v1.TRUE_BLOCKED_STATUS:
            risk_codes.append("true_forecast_blocked")
        if rights_term_status_conflict:
            risk_codes.append("rights_term_status_conflict")
        advisories = list(base.get("复核提示") or [])
        can_use_numeric = bool(forecast.get("canUseNumericForecast"))
        metadata = {
            "forecastabilityReasonCodes": json_value(forecast.get("forecastabilityReasonCodes") or []),
            "selectedModel": forecast.get("selectedModel"),
            "requiredForecastabilityAction": forecast.get("requiredForecastabilityAction"),
            "formalReadinessStatus": forecast.get("formalReadinessStatus"),
            "formalReadinessReasonCodes": json_value(forecast.get("formalReadinessReasonCodes") or []),
            "businessActionOutputRemoved": True,
            "candidateVerdict": model_inputs["validation"].get("verdict"),
            "rightsTermStatusConflict": rights_term_status_conflict,
            "rightsTermStatusConflictHandling": (
                "retained_as_non_blocking_audit_risk"
                if rights_term_status_conflict
                else "not_applicable"
            ),
        }
        record = {
            "standardWorkId": work_id,
            "standardWorkName": clean(base.get("书名")),
            "authorName": clean(base.get("作者")),
            **term,
            "workStatus": "listed" if status == "已上架" else "delisted",
            "audioRightsStatus": audio_status_code,
            "classificationPath": classification,
            "auxiliaryTags": tags,
            "reviewDecisionStatus": clean(base.get("复核决策状态")),
            "businessReviewAdvisories": advisories,
            "rating": clean(evaluation.get("rating")) or "not_rated",
            "lifecycle": clean(evaluation.get("lifecycle")) or "unknown",
            "lifecycleConfidence": (
                "high"
                if int(evaluation.get("activeMonthCount") or 0) >= 18
                else "medium"
                if int(evaluation.get("activeMonthCount") or 0) >= 6
                else "low"
            ),
            "forecastabilityStatus": forecast.get("forecastabilityStatus"),
            "forecastConfidence": confidence_for(forecast),
            "selectedForecastModel": forecast.get("selectedModel"),
            "forecastBaseTotal": json_value(forecast.get("baseForecast")) if can_use_numeric else None,
            "forecastOptimisticTotal": json_value(forecast.get("optimisticForecast")) if can_use_numeric else None,
            "forecastPessimisticTotal": json_value(forecast.get("pessimisticForecast")) if can_use_numeric else None,
            "riskLevel": clean(evaluation.get("riskSeverity")) or "low",
            "riskCodes": list(dict.fromkeys(risk_codes)),
            "last3Revenue": json_value(evaluation.get("last3MonthRevenue")) or 0,
            "last6Revenue": json_value(evaluation.get("last6MonthRevenue")) or 0,
            "last12Revenue": json_value(evaluation.get("last12MonthRevenue")) or 0,
            "last24Revenue": json_value(evaluation.get("last24MonthRevenue")) or 0,
            "totalHistoricalRevenue": json_value(evaluation.get("totalHistoricalRevenue")) or 0,
            "activeMonthCount": int(evaluation.get("activeMonthCount") or 0),
            "zeroRevenueMonthCount": int(evaluation.get("zeroRevenueMonthCount") or 0),
            "businessFormBreakdown": {
                "audio_copyright": json_value(evaluation.get("audioCopyrightRevenue")) or 0,
                "audio_product": json_value(evaluation.get("audioProductRevenue")) or 0,
            },
            "channelConcentrationSummary": {
                "topChannelShare": json_value(evaluation.get("channelConcentration")) or 0,
            },
            "remainingCopyrightMonths": (
                max(0, int(evaluation.get("remainingCopyrightMonths")))
                if term["copyrightEndType"] == "exact_date"
                and evaluation.get("remainingCopyrightMonths") is not None
                and not pd.isna(evaluation.get("remainingCopyrightMonths"))
                else None
            ),
            "evaluationMetadata": metadata,
        }
        record["inputHash"] = stable_hash(
            {
                key: record[key]
                for key in (
                    "standardWorkId",
                    "copyrightStart",
                    "copyrightEnd",
                    "copyrightEndType",
                    "copyrightEndValue",
                    "workStatus",
                    "audioRightsStatus",
                    "classificationPath",
                    "auxiliaryTags",
                    "last3Revenue",
                    "last6Revenue",
                    "last12Revenue",
                    "last24Revenue",
                    "totalHistoricalRevenue",
                    "activeMonthCount",
                    "zeroRevenueMonthCount",
                )
            }
        )
        rows.append(record)
    return rows


def aggregate_payload(records: list[dict], model_inputs: dict) -> dict:
    validation = model_inputs["validation"]
    coverage = model_inputs["coverage"]
    score = validation.get("forecastableCohortScore", {})
    issues = validation.get("issueSummary", {})
    return {
        "workCount": len(records),
        "workStatusDistribution": dict(Counter(row["workStatus"] for row in records)),
        "audioRightsStatusDistribution": dict(
            Counter(row["audioRightsStatus"] for row in records)
        ),
        "copyrightEndTypeDistribution": dict(
            Counter(row["copyrightEndType"] for row in records)
        ),
        "ratingDistribution": dict(Counter(row["rating"] for row in records)),
        "lifecycleDistribution": dict(Counter(row["lifecycle"] for row in records)),
        "forecastabilityDistribution": dict(
            Counter(row["forecastabilityStatus"] for row in records)
        ),
        "advisoryAssignmentCount": sum(
            len(row["businessReviewAdvisories"]) for row in records
        ),
        "operatingSuggestionCount": 0,
        "rightsTermStatusConflictCount": sum(
            bool(row["evaluationMetadata"].get("rightsTermStatusConflict"))
            for row in records
        ),
        "modelValidation": {
            "candidateVersion": validation.get("candidateVersion"),
            "verdict": validation.get("verdict"),
            "wape": score.get("wape"),
            "baselineWape": score.get("baselineWape"),
            "intervalCoverage": score.get("intervalCoverage"),
            "p0": issues.get("p0"),
            "p1": issues.get("p1"),
            "p2": issues.get("p2"),
            "forecastableRevenueShare": coverage.get(
                "forecastableNumericIncludingConservative", {}
            ).get("revenueShare"),
            "trueBlockedRevenueShare": coverage.get("trueForecastBlocked", {}).get(
                "revenueShare"
            ),
        },
    }


def run() -> dict:
    model_inputs = load_or_build_model_inputs()
    fact_payload = build_fact_payload(model_inputs)
    progress("building formal aggregate evaluation records")
    records = build_formal_records(model_inputs)
    if len(records) != 3053:
        raise SystemExit("Formal evaluation payload must contain 3053 works.")
    if any(not row["standardWorkName"] or not row["authorName"] for row in records):
        raise SystemExit("Formal evaluation payload has a missing work name or author.")

    summary = aggregate_payload(records, model_inputs)
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
        "cashClassificationAuthority":
            model_inputs["cashClassificationAuthority"],
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
    progress("private payload completed; no row-level data was printed")
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
