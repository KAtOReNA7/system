#!/usr/bin/env python3
"""Audit M2 publishing-scale population and authority without model outcomes.

This is a capability-scoped, read-only profiler.  It reads the registered
private model-input cache, channel master, and already materialized monthly
training rows.  Row-level outputs stay below data/private-output and the only
stdout payload is an aggregate public candidate.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import pickle
import statistics
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable, Mapping

import pandas as pd


ROOT = Path(__file__).resolve().parents[2]
TOOLS = ROOT / "tools" / "m2-calibration"
CURRENT = ROOT / "scripts" / "m2-current"
for candidate in (TOOLS, CURRENT):
    if str(candidate) not in sys.path:
        sys.path.insert(0, str(candidate))

import materialize_canonical_channel_cases as canonical  # noqa: E402


CACHE_PATH = (
    ROOT
    / "data"
    / "private-output"
    / "m2-formal-execution"
    / "m2-formal-model-input-cache-v1.pkl"
)
CHANNEL_MASTER_PATH = (
    ROOT
    / "data"
    / "private-output"
    / "outputs"
    / "channel-governance-20260726"
    / "M2-渠道统一与类型人工补全表-v0.2.xlsx"
)
PRIMARY_PACKED_PATH = (
    ROOT
    / "data"
    / "private-output"
    / "m2-current-human-anchored"
    / "M2-current-channel-generative-primary-monthly-private-v0.2.ndjson"
)
STRICT_PACKED_PATH = (
    ROOT
    / "data"
    / "private-output"
    / "m2-current-human-anchored"
    / "M2-current-channel-generative-auxiliary-monthly-private-v0.2.ndjson"
)
PRIVATE_OUTPUT_DIR = (
    ROOT / "data" / "private-output" / "m2-publishing-scale-audit"
)
PRIVATE_PROFILE_PATH = (
    PRIVATE_OUTPUT_DIR / "M2-publishing-scale-private-profile-v1.json"
)
PRIVATE_WORK_PATH = (
    PRIVATE_OUTPUT_DIR / "M2-publishing-scale-private-work-profile-v1.ndjson"
)
PUBLIC_CANDIDATE_PATH = (
    PRIVATE_OUTPUT_DIR / "M2-publishing-scale-public-aggregate-candidate-v1.json"
)
GEN_CONFIG_PATH = ROOT / "config" / "m2-current-channel-generative.v0.2.json"
CHANNEL_CONFIG_PATH = ROOT / "config" / "m2-current-canonical-channel.v0.1.json"
EXPERT_CONFIG_PATH = ROOT / "config" / "m2-current-channel-experts.v0.1.json"
FROZEN_G1_REPORT_PATH = (
    ROOT
    / "docs"
    / "analysis"
    / "m2-current"
    / "M2-current-channel-generative-g1-development-v0.1.json"
)


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def clean(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and math.isnan(value):
        return ""
    text = str(value).strip()
    if text.endswith(".0") and text[:-2].lstrip("-").isdigit():
        return text[:-2]
    return text


def month_index(value: str) -> int:
    year, month = value.split("-")
    return int(year) * 12 + int(month) - 1


def inclusive_months(start: str, end: str) -> int:
    return month_index(end) - month_index(start) + 1


def quantiles(values: Iterable[float]) -> dict[str, float | int | None]:
    ordered = sorted(float(value) for value in values)
    if not ordered:
        return {
            "minimum": None,
            "p25": None,
            "median": None,
            "p75": None,
            "maximum": None,
        }

    def pick(fraction: float) -> float:
        return ordered[round((len(ordered) - 1) * fraction)]

    result: dict[str, float | int | None] = {
        "minimum": ordered[0],
        "p25": pick(0.25),
        "median": statistics.median(ordered),
        "p75": pick(0.75),
        "maximum": ordered[-1],
    }
    return {
        key: int(value) if isinstance(value, float) and value.is_integer()
        else value
        for key, value in result.items()
    }


def fnv1a_fold(value: str, count: int) -> int:
    hashed = 2166136261
    for character in str(value):
        hashed ^= ord(character)
        hashed = (hashed * 16777619) & 0xFFFFFFFF
    return hashed % count


def load_cache() -> dict[str, Any]:
    if not CACHE_PATH.is_file():
        raise RuntimeError("m2_publishing_scale_model_input_cache_missing")
    with CACHE_PATH.open("rb") as handle:
        value = pickle.load(handle)  # noqa: S301 - trusted capability artifact.
    if not isinstance(value, dict) or "modelInputs" not in value:
        raise RuntimeError("m2_publishing_scale_model_input_cache_invalid")
    return value


def channel_authority() -> tuple[
    dict[tuple[str, str], dict[str, str]],
    dict[str, dict[str, str]],
    dict[str, Any],
]:
    config = read_json(CHANNEL_CONFIG_PATH)
    loaded, evidence = canonical.load_channel_master(
        config,
        CHANNEL_MASTER_PATH,
    )
    master = config["channelMaster"]
    frame = pd.read_excel(
        CHANNEL_MASTER_PATH,
        sheet_name=master["sheetName"],
        header=int(master["headerRow"]) - 1,
        dtype=object,
    )
    columns = {
        key: canonical.header_index(frame.columns, prefix)
        for key, prefix in master["columnPrefixes"].items()
    }
    names_by_uid: dict[str, dict[str, str]] = {}
    for _, source in frame.iterrows():
        raw_id = clean(source[columns["rawChannelId"]])
        raw_name = clean(source[columns["rawChannelName"]])
        if not raw_id and not raw_name:
            continue
        canonical_name = clean(source[columns["canonicalChannelName"]])
        uid = canonical.canonical_uid(
            canonical_name,
            master["uidNamespace"],
        )
        names_by_uid[uid] = {
            "canonicalChannelName": canonical_name,
            "effectiveMonth": clean(source[columns["effectiveMonth"]]),
        }
        loaded[(raw_id, raw_name)]["canonicalChannelName"] = canonical_name
        loaded[(raw_id, raw_name)]["effectiveMonth"] = clean(
            source[columns["effectiveMonth"]]
        )
    return loaded, names_by_uid, evidence


def classification_profile(
    foundation: Mapping[str, Mapping[str, Any]],
) -> tuple[dict[str, Any], dict[str, dict[str, Any]], list[dict[str, Any]]]:
    field_names = ("一级分类", "二级分类", "三级分类")
    complete = Counter()
    distinct: dict[str, set[str]] = {
        field: set() for field in field_names
    }
    level3_parents: dict[str, set[tuple[str, str]]] = defaultdict(set)
    level2_parents: dict[str, set[str]] = defaultdict(set)
    level3_nodes: dict[str, dict[str, Any]] = {}
    private_rows: list[dict[str, Any]] = []
    authors: set[str] = set()
    for work_id, raw in foundation.items():
        level1, level2, level3 = (
            clean(raw.get(field)) for field in field_names
        )
        author = clean(raw.get("作者"))
        if author:
            authors.add(author)
        for field, value in zip(
            field_names,
            (level1, level2, level3),
            strict=True,
        ):
            if value:
                complete[field] += 1
                distinct[field].add(value)
        if level3:
            level3_parents[level3].add((level1, level2))
            node = level3_nodes.setdefault(
                level3,
                {
                    "level1": level1,
                    "level2": level2,
                    "level3": level3,
                    "workIds": set(),
                },
            )
            node["workIds"].add(str(work_id))
        if level2:
            level2_parents[level2].add(level1)
        private_rows.append(
            {
                "standardWorkId": str(work_id),
                "authorIdentityCell": author or None,
                "classificationLevel1": level1 or None,
                "classificationLevel2": level2 or None,
                "classificationLevel3": level3 or None,
            }
        )
    total = len(foundation)
    summary = {
        "authorityGrain": "one_current_row_per_standard_work",
        "standardWorkCount": total,
        "exactAuthorIdentityCellCount": len(authors),
        "classificationCounts": {
            "level1": len(distinct["一级分类"]),
            "level2": len(distinct["二级分类"]),
            "level3": len(distinct["三级分类"]),
        },
        "coverage": {
            "level1": complete["一级分类"] / total,
            "level2": complete["二级分类"] / total,
            "level3": complete["三级分类"] / total,
        },
        "missingWorks": {
            "level1": total - complete["一级分类"],
            "level2": total - complete["二级分类"],
            "level3": total - complete["三级分类"],
        },
        "conflictingParentNodes": {
            "level2": sum(
                len(parents) > 1 for parents in level2_parents.values()
            ),
            "level3": sum(
                len(parents) > 1 for parents in level3_parents.values()
            ),
        },
        "multiAssignmentRepresentable": False,
        "effectiveAtCoverage": 0,
        "availableAtCoverage": 0,
        "asOfUseStatus": "CURRENT_ONLY_REPORTING_NOT_STRICT_ORIGIN_FEATURE",
    }
    return summary, level3_nodes, private_rows


def map_sales_share_bill(
    frame: pd.DataFrame,
    channel_map: Mapping[tuple[str, str], Mapping[str, str]],
) -> pd.DataFrame:
    result = frame.copy()

    def mapped(row: pd.Series) -> Mapping[str, str]:
        key = (
            clean(row.get("渠道ID")),
            clean(row.get("文学库渠道名称")),
        )
        if key not in channel_map:
            raise RuntimeError(
                "m2_publishing_scale_channel_mapping_incomplete"
            )
        return channel_map[key]

    mapped_rows = [mapped(row) for _, row in result.iterrows()]
    result["channelUid"] = [row["channelUid"] for row in mapped_rows]
    result["canonicalChannelName"] = [
        row["canonicalChannelName"] for row in mapped_rows
    ]
    result["channelRole"] = [row["channelRole"] for row in mapped_rows]
    result["revenueMode"] = [row["revenueMode"] for row in mapped_rows]
    result["effectiveMonth"] = [
        row["effectiveMonth"] for row in mapped_rows
    ]
    mechanism = {
        "membership_subscription": "membership",
        "advertising_or_free_share": "advertising",
        "single_purchase_or_on_demand": "transactional",
    }
    result["mechanism"] = result["revenueMode"].map(
        lambda value: mechanism.get(str(value), "other")
    )
    result["standardWorkId"] = result["standardWorkId"].map(clean)
    result["billMonth"] = result["billMonth"].map(clean)
    result["amount"] = result["amount"].astype(float)
    return result


def concentration(work_cash: pd.Series) -> dict[str, Any]:
    values = sorted(
        (max(0.0, float(value)) for value in work_cash.values),
        reverse=True,
    )
    total = sum(values)
    if total <= 0:
        return {
            "top1WorkCashShare": None,
            "top3WorkCashShare": None,
            "top5WorkCashShare": None,
            "revenueHHI": None,
        }
    shares = [value / total for value in values]
    return {
        "top1WorkCashShare": sum(shares[:1]),
        "top3WorkCashShare": sum(shares[:3]),
        "top5WorkCashShare": sum(shares[:5]),
        "revenueHHI": sum(value * value for value in shares),
    }


def group_profile(
    frame: pd.DataFrame,
    group_field: str,
) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    total_positive = float(frame.loc[frame["amount"] > 0, "amount"].sum())
    for group, rows in frame.groupby(group_field, dropna=False):
        key = clean(group) or "__missing__"
        monthly = rows.groupby(
            ["standardWorkId", "channelUid", "billMonth"],
            sort=False,
        )["amount"].sum()
        work_cash = rows.loc[rows["amount"] > 0].groupby(
            "standardWorkId"
        )["amount"].sum()
        positive_cash = float(rows.loc[rows["amount"] > 0, "amount"].sum())
        result[key] = {
            "rowCount": int(len(rows)),
            "distinctWorks": int(rows["standardWorkId"].nunique()),
            "positiveDistinctWorks": int(
                rows.loc[rows["amount"] > 0, "standardWorkId"].nunique()
            ),
            "workChannelScopes": int(
                rows[["standardWorkId", "channelUid"]]
                .drop_duplicates()
                .shape[0]
            ),
            "distinctMonths": int(rows["billMonth"].nunique()),
            "positiveMonths": int((monthly > 0).sum()),
            "reversalMonths": int((monthly < 0).sum()),
            "positiveCashShare": (
                positive_cash / total_positive if total_positive else 0
            ),
            **concentration(work_cash),
        }
    return result


def bill_profile(frame: pd.DataFrame) -> tuple[dict[str, Any], pd.DataFrame]:
    grouped = frame.groupby(
        ["standardWorkId", "channelUid", "billMonth"],
        sort=False,
    )["amount"].sum()
    work_month = frame.groupby(
        ["standardWorkId", "billMonth"],
        sort=False,
    )["amount"].sum()
    scope_spans: list[int] = []
    for _, rows in frame.groupby(
        ["standardWorkId", "channelUid"],
        sort=False,
    ):
        scope_spans.append(
            inclusive_months(rows["billMonth"].min(), rows["billMonth"].max())
        )
    work_spans: list[int] = []
    for _, rows in frame.groupby("standardWorkId", sort=False):
        work_spans.append(
            inclusive_months(rows["billMonth"].min(), rows["billMonth"].max())
        )
    annual_first_cash = Counter(
        frame.loc[frame["amount"] > 0]
        .groupby("standardWorkId")["billMonth"]
        .min()
        .map(lambda value: value[:4])
    )
    exact_duplicates = int(
        frame[
            [
                "billMonth",
                "渠道ID",
                "文学库渠道名称",
                "standardWorkId",
                "amount",
            ]
        ].duplicated().sum()
    )
    summary = {
        "grain": "sales_share_bill_row",
        "rowCount": int(len(frame)),
        "standardWorkCount": int(frame["standardWorkId"].nunique()),
        "canonicalChannelCount": int(frame["channelUid"].nunique()),
        "workChannelScopeCount": int(
            frame[["standardWorkId", "channelUid"]]
            .drop_duplicates()
            .shape[0]
        ),
        "monthRange": {
            "minimum": frame["billMonth"].min(),
            "maximum": frame["billMonth"].max(),
        },
        "rowSigns": {
            "positive": int((frame["amount"] > 0).sum()),
            "zero": int((frame["amount"] == 0).sum()),
            "negativeReversal": int((frame["amount"] < 0).sum()),
        },
        "workChannelMonthSigns": {
            "positive": int((grouped > 0).sum()),
            "zeroAfterAggregation": int((grouped == 0).sum()),
            "negative": int((grouped < 0).sum()),
        },
        "workMonthSigns": {
            "positive": int((work_month > 0).sum()),
            "zeroAfterAggregation": int((work_month == 0).sum()),
            "negative": int((work_month < 0).sum()),
        },
        "historySpanMonths": {
            "work": quantiles(work_spans),
            "workChannel": quantiles(scope_spans),
        },
        "annualFirstObservedPositiveCashWorks": dict(
            sorted(annual_first_cash.items())
        ),
        "annualFirstObservedCashIsVerifiedLaunch": False,
        "exactDuplicateBillRowCount": exact_duplicates,
        "channelJoinRowExpansion": 0,
    }
    return summary, grouped.reset_index(name="monthlyCash")


def packed_training_profile(
    foundation: Mapping[str, Mapping[str, Any]],
) -> tuple[dict[str, Any], dict[str, Any]]:
    config = read_json(GEN_CONFIG_PATH)
    fold_count = int(config["selection"]["outerPrimaryWorkFoldCount"])
    inner_count = int(config["selection"]["innerWorkFoldCount"])
    salt = str(config["selection"]["innerWorkFoldSalt"])
    strict_origins = list(config["selection"]["strictOrigins"])
    mechanism_works: dict[str, set[str]] = defaultdict(set)
    mechanism_origins: dict[str, set[str]] = defaultdict(set)
    primary_outer: dict[int, dict[str, dict[str, Any]]] = {
        fold: defaultdict(
            lambda: {
                "works": set(),
                "rows": 0,
                "positiveMonths": 0,
            }
        )
        for fold in range(fold_count)
    }
    first_outer_inner: dict[int, dict[str, dict[str, Any]]] = {
        fold: defaultdict(
            lambda: {
                "works": set(),
                "rows": 0,
                "positiveMonths": 0,
            }
        )
        for fold in range(inner_count)
    }
    strict_outer: dict[str, dict[str, dict[str, Any]]] = {
        origin: defaultdict(
            lambda: {
                "works": set(),
                "rows": 0,
                "positiveMonths": 0,
            }
        )
        for origin in strict_origins
    }
    category_support: dict[str, dict[str, Any]] = defaultdict(
        lambda: {
            "primary": {
                fold: {
                    "works": set(),
                    "positiveWorks": set(),
                    "rows": 0,
                    "positiveMonths": 0,
                }
                for fold in range(fold_count)
            },
            "strict": {
                origin: {
                    "works": set(),
                    "positiveWorks": set(),
                    "rows": 0,
                    "positiveMonths": 0,
                }
                for origin in strict_origins
            },
        }
    )

    def category_for(work_id: str) -> str:
        return clean(foundation.get(work_id, {}).get("三级分类")) or (
            "__missing__"
        )

    with PRIMARY_PACKED_PATH.open("r", encoding="utf-8") as handle:
        for line in handle:
            if not line.strip():
                continue
            row = json.loads(line)
            work_id = clean(row["standardWorkId"])
            mechanism = clean(row["mechanism"])
            origin = clean(row["origin"])
            labels = row["futureMonthlyLabels"]
            mechanism_works[mechanism].add(work_id)
            mechanism_origins[mechanism].add(origin)
            category = category_for(work_id)
            outer_fold = fnv1a_fold(work_id, fold_count)
            inner_fold = fnv1a_fold(f"{work_id}{salt}", inner_count)
            for fold in range(fold_count):
                if outer_fold == fold:
                    continue
                target = primary_outer[fold][mechanism]
                target["works"].add(work_id)
                category_target = category_support[category]["primary"][fold]
                category_target["works"].add(work_id)
                for label in labels:
                    target["rows"] += 1
                    category_target["rows"] += 1
                    if float(label["actual"]) > 0:
                        target["positiveMonths"] += 1
                        category_target["positiveMonths"] += 1
                        category_target["positiveWorks"].add(work_id)
            if outer_fold != 0:
                for fold in range(inner_count):
                    if inner_fold == fold:
                        continue
                    target = first_outer_inner[fold][mechanism]
                    target["works"].add(work_id)
                    for label in labels:
                        target["rows"] += 1
                        if float(label["actual"]) > 0:
                            target["positiveMonths"] += 1

    with STRICT_PACKED_PATH.open("r", encoding="utf-8") as handle:
        for line in handle:
            if not line.strip():
                continue
            row = json.loads(line)
            work_id = clean(row["standardWorkId"])
            mechanism = clean(row["mechanism"])
            origin = clean(row["origin"])
            category = category_for(work_id)
            labels = row["futureMonthlyLabels"]
            mechanism_origins[mechanism].add(origin)
            for outer_origin in strict_origins:
                if origin >= outer_origin:
                    continue
                target = strict_outer[outer_origin][mechanism]
                category_target = category_support[category]["strict"][
                    outer_origin
                ]
                for label in labels:
                    if clean(label["labelAvailableAsOf"]) > outer_origin:
                        continue
                    target["works"].add(work_id)
                    target["rows"] += 1
                    category_target["works"].add(work_id)
                    category_target["rows"] += 1
                    if float(label["actual"]) > 0:
                        target["positiveMonths"] += 1
                        category_target["positiveMonths"] += 1
                        category_target["positiveWorks"].add(work_id)

    def summarize_nodes(
        values: Mapping[Any, Mapping[str, Mapping[str, Any]]],
    ) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for fold, mechanisms in values.items():
            result[str(fold)] = {}
            for mechanism, raw in mechanisms.items():
                result[str(fold)][mechanism] = {
                    "distinctWorks": len(raw["works"]),
                    "monthlyRows": raw["rows"],
                    "positiveMonths": raw["positiveMonths"],
                }
        return result

    private_categories: dict[str, Any] = {}
    for category, families in category_support.items():
        private_categories[category] = {}
        for family, folds in families.items():
            private_categories[category][family] = {}
            for fold, raw in folds.items():
                private_categories[category][family][str(fold)] = {
                    "distinctWorks": len(raw["works"]),
                    "positiveDistinctWorks": len(raw["positiveWorks"]),
                    "monthlyRows": raw["rows"],
                    "positiveMonths": raw["positiveMonths"],
                }

    public_category = {}
    for family in ("primary", "strict"):
        work_supports: list[int] = []
        positive_supports: list[int] = []
        row_supports: list[int] = []
        positive_month_supports: list[int] = []
        for values in private_categories.values():
            for raw in values[family].values():
                work_supports.append(raw["distinctWorks"])
                positive_supports.append(raw["positiveDistinctWorks"])
                row_supports.append(raw["monthlyRows"])
                positive_month_supports.append(raw["positiveMonths"])
        public_category[family] = {
            "nodeFoldCount": len(work_supports),
            "distinctWorks": quantiles(work_supports),
            "positiveDistinctWorks": quantiles(positive_supports),
            "monthlyRows": quantiles(row_supports),
            "positiveMonths": quantiles(positive_month_supports),
            "shareBelowFixedWorkCounts": {
                str(value): (
                    sum(item < value for item in work_supports)
                    / len(work_supports)
                    if work_supports else None
                )
                for value in (5, 10, 15, 25, 50, 100)
            },
        }

    aggregate = {
        "packedInputs": {
            "primaryPackedRows": sum(
                1 for line in PRIMARY_PACKED_PATH.open(encoding="utf-8")
                if line.strip()
            ),
            "strictPackedRows": sum(
                1 for line in STRICT_PACKED_PATH.open(encoding="utf-8")
                if line.strip()
            ),
        },
        "mechanismDistinctWorksAcrossPrimaryPacked": {
            key: len(value) for key, value in sorted(mechanism_works.items())
        },
        "mechanismOriginCounts": {
            key: len(value) for key, value in sorted(mechanism_origins.items())
        },
        "primaryOuterTraining": summarize_nodes(primary_outer),
        "primaryOuter0InnerTraining": summarize_nodes(first_outer_inner),
        "strictOuterTraining": summarize_nodes(strict_outer),
        "level3FoldSupportAggregate": public_category,
    }
    return aggregate, private_categories


def attach_work_cash(
    private_rows: list[dict[str, Any]],
    monthly: pd.DataFrame,
) -> None:
    by_work: dict[str, dict[str, Any]] = {}
    for work_id, rows in monthly.groupby("standardWorkId", sort=False):
        positive = rows.loc[rows["monthlyCash"] > 0, "monthlyCash"]
        by_work[str(work_id)] = {
            "workChannelScopeCount": int(rows["channelUid"].nunique()),
            "observedWorkChannelMonthCount": int(len(rows)),
            "positiveMonthCount": int((rows["monthlyCash"] > 0).sum()),
            "reversalMonthCount": int((rows["monthlyCash"] < 0).sum()),
            "positiveCash": float(positive.sum()),
            "firstObservedCashMonth": rows["billMonth"].min(),
            "lastObservedCashMonth": rows["billMonth"].max(),
        }
    for row in private_rows:
        row.update(
            by_work.get(
                row["standardWorkId"],
                {
                    "workChannelScopeCount": 0,
                    "observedWorkChannelMonthCount": 0,
                    "positiveMonthCount": 0,
                    "reversalMonthCount": 0,
                    "positiveCash": 0,
                    "firstObservedCashMonth": None,
                    "lastObservedCashMonth": None,
                },
            )
        )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--print-public-candidate",
        action="store_true",
        help="Print the aggregate public candidate after writing private output.",
    )
    args = parser.parse_args()
    required = (
        CACHE_PATH,
        CHANNEL_MASTER_PATH,
        PRIMARY_PACKED_PATH,
        STRICT_PACKED_PATH,
    )
    missing = [path.name for path in required if not path.is_file()]
    if missing:
        raise SystemExit(
            "m2_publishing_scale_private_authority_missing:"
            + ",".join(missing)
        )

    cache = load_cache()
    inputs = cache["modelInputs"]
    foundation = {
        clean(key): value for key, value in inputs["foundation"].items()
    }
    channel_map, names_by_uid, channel_evidence = channel_authority()
    classification, level3_nodes, private_rows = classification_profile(
        foundation
    )
    full_sales_share = map_sales_share_bill(
        inputs["mappedSalesShareBill"],
        channel_map,
    )
    sales_share = full_sales_share[
        (full_sales_share["billMonth"] >= "2021-01")
        & (full_sales_share["billMonth"] <= "2025-12")
    ].copy()
    full_bills, _ = bill_profile(full_sales_share)
    model_window_bills, monthly = bill_profile(sales_share)
    bills = {
        "fullAuthority": full_bills,
        "modelWindow2021To2025": model_window_bills,
    }
    attach_work_cash(private_rows, monthly)
    mechanisms = group_profile(sales_share, "mechanism")
    channels = group_profile(sales_share, "canonicalChannelName")
    expert = read_json(EXPERT_CONFIG_PATH)
    named_channels = {}
    for item in expert["platformModels"]:
        name = item["canonicalChannelName"]
        named_channels[name] = channels.get(
            name,
            {
                "rowCount": 0,
                "distinctWorks": 0,
                "positiveDistinctWorks": 0,
                "workChannelScopes": 0,
                "distinctMonths": 0,
                "positiveMonths": 0,
                "reversalMonths": 0,
                "positiveCashShare": 0,
                "top1WorkCashShare": None,
                "top3WorkCashShare": None,
                "top5WorkCashShare": None,
                "revenueHHI": None,
            },
        )
    training, private_category_support = packed_training_profile(foundation)

    observed_relations = full_sales_share[
        ["standardWorkId", "channelUid"]
    ].drop_duplicates()
    authority_category = full_sales_share["授权分类"].map(clean)
    authorization = {
        "observedCashWorkChannelRelationCount": int(len(observed_relations)),
        "observedCashRelationIsAuthorizationAuthority": False,
        "authorizationCategoryRowCoverage": float(
            (authority_category != "").mean()
        ),
        "authorizationCategoryDistinctCurrentValues": int(
            authority_category[authority_category != ""].nunique()
        ),
        "workPlatformAuthorityTablePresent": False,
        "startCoverage": 0,
        "endCoverage": 0,
        "effectiveAtCoverage": 0,
        "availableAtCoverage": 0,
        "versionCoverage": 0,
        "strictOriginUseStatus": "PROHIBITED_CURRENT_OR_CASH_OBSERVED_ONLY",
    }
    entities = {
        "bookSku": {
            "count": None,
            "authorityPresent": False,
            "reason": "no registered ISBN/SKU-to-work/edition authority",
        },
        "editionOrVersion": {
            "count": None,
            "authorityPresent": False,
            "reason": "no registered edition/version identity table",
        },
        "standardWork": {
            "count": len(foundation),
            "authorityPresent": True,
            "key": "foundation standard work ID",
        },
        "work": {
            "count": len(foundation),
            "relationshipToStandardWork": (
                "current formal foundation is one row per standard work; "
                "no separate creative-work entity is registered"
            ),
        },
        "exactAuthorIdentityCell": {
            "count": classification["exactAuthorIdentityCellCount"],
            "personEntityResolved": False,
        },
        "observedCashWorkChannelScope": {
            "count": full_bills["workChannelScopeCount"],
            "authorizationRelationVerified": False,
        },
        "salesShareBillRow": {"count": full_bills["rowCount"]},
        "predictionCase": {
            "primaryPackedRows": training["packedInputs"][
                "primaryPackedRows"
            ],
            "strictPackedRows": training["packedInputs"]["strictPackedRows"],
            "sameAsSkuOrNewLaunch": False,
        },
    }

    private_level3: dict[str, Any] = {}
    work_cash_lookup = {
        row["standardWorkId"]: row for row in private_rows
    }
    for name, node in level3_nodes.items():
        work_ids = node["workIds"]
        cash = [
            float(work_cash_lookup[work_id]["positiveCash"])
            for work_id in work_ids
        ]
        private_level3[name] = {
            "level1": node["level1"],
            "level2": node["level2"],
            "level3": name,
            "distinctWorks": len(work_ids),
            "workChannelScopes": sum(
                int(work_cash_lookup[work_id]["workChannelScopeCount"])
                for work_id in work_ids
            ),
            "positiveMonths": sum(
                int(work_cash_lookup[work_id]["positiveMonthCount"])
                for work_id in work_ids
            ),
            "positiveCash": sum(cash),
            "yearsWithObservedPositiveCash": sorted(
                {
                    str(work_cash_lookup[work_id]["firstObservedCashMonth"])[:4]
                    for work_id in work_ids
                    if work_cash_lookup[work_id]["firstObservedCashMonth"]
                }
            ),
            "foldSupport": private_category_support.get(name, {}),
        }

    transactional = mechanisms.get("transactional", {})
    inner_transactional = [
        fold.get("transactional", {})
        for fold in training["primaryOuter0InnerTraining"].values()
    ]
    frozen_g1 = read_json(FROZEN_G1_REPORT_PATH)
    frozen_block = frozen_g1["eligibilityBlock"]
    transactional_diagnosis = {
        "fullWindowDistinctWorks": transactional.get("distinctWorks", 0),
        "fullWindowPositiveDistinctWorks": transactional.get(
            "positiveDistinctWorks",
            0,
        ),
        "primaryPackedDistinctWorks": training[
            "mechanismDistinctWorksAcrossPrimaryPacked"
        ].get("transactional", 0),
        "primaryOuter0TrainingDistinctWorks": training[
            "primaryOuterTraining"
        ]["0"].get("transactional", {}).get("distinctWorks", 0),
        "preRestatementPackedDiagnosticInnerDistinctWorkRange": quantiles(
            [
                value.get("distinctWorks", 0)
                for value in inner_transactional
            ]
        ),
        "preRestatementPackedDiagnosticInnerRowRange": quantiles(
            [value.get("monthlyRows", 0) for value in inner_transactional]
        ),
        "preRestatementPackedDiagnosticInnerPositiveMonthRange": quantiles(
            [value.get("positiveMonths", 0) for value in inner_transactional]
        ),
        "executedV02DevelopmentModelableInnerDistinctWorkRange": (
            frozen_block["distinctTrainingWorkRange"]
        ),
        "executedV02DevelopmentModelableInnerTrainingRowRange": (
            frozen_block["trainingRowRange"]
        ),
        "executedV02DevelopmentModelableInnerPositiveMonthRange": (
            frozen_block["positiveTrainingMonthRange"]
        ),
        "diagnosis": (
            "the 25-32 range is a nested primary outer0 training subset, "
            "not the publisher's annual SKU count and not the full-window "
            "transactional standard-work population"
        ),
    }

    private_profile = {
        "schema": "m2.publishing_scale.private_profile.v1",
        "asOf": "2026-07-28",
        "sources": {
            "modelInputCacheSha256": sha256_file(CACHE_PATH),
            "channelMasterSha256": sha256_file(CHANNEL_MASTER_PATH),
            "primaryPackedSha256": sha256_file(PRIMARY_PACKED_PATH),
            "strictPackedSha256": sha256_file(STRICT_PACKED_PATH),
        },
        "entities": entities,
        "classification": {
            **classification,
            "level3Nodes": private_level3,
        },
        "authorization": authorization,
        "bills": bills,
        "mechanisms": mechanisms,
        "namedChannels": named_channels,
        "trainingSupport": training,
        "transactionalSupportDiagnosis": transactional_diagnosis,
        "dataQuality": {
            "foundationDuplicateStandardWorkIds": (
                len(foundation) - len(set(foundation))
            ),
            "orphanBillStandardWorks": int(
                len(
                    set(sales_share["standardWorkId"])
                    - set(foundation)
                )
            ),
            "channelMappingCoverage": 1,
            "channelJoinRowExpansion": 0,
            "channelMaster": channel_evidence,
            "currentOnlyClassificationRisk": "HIGH_FOR_STRICT_FEATURE_USE",
            "authorizationHistoryGapRisk": "HIGH_FOR_STRICT_FEATURE_USE",
            "monthlyRowsAreIndependentWorks": False,
        },
    }

    public_channel_evidence = {
        key: value
        for key, value in channel_evidence.items()
        if key != "workbookSha256"
    }
    public_data_quality = {
        **private_profile["dataQuality"],
        "channelMaster": public_channel_evidence,
    }
    public_candidate = {
        "schema": "m2.publishing_scale.public_aggregate_candidate.v1",
        "asOf": "2026-07-28",
        "status": "K7A_POPULATION_AND_AUTHORITY_AUDIT_COMPLETE",
        "entities": entities,
        "classification": classification,
        "authorization": authorization,
        "bills": bills,
        "mechanisms": mechanisms,
        "namedChannels": named_channels,
        "trainingSupport": training,
        "transactionalSupportDiagnosis": transactional_diagnosis,
        "dataQuality": public_data_quality,
        "publicPrivacy": {
            "aggregateOnly": True,
            "containsWorkIdentity": False,
            "containsCategoryValues": False,
            "containsPrivatePath": False,
            "containsPrivateArtifactDigest": False,
        },
    }

    PRIVATE_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    PRIVATE_PROFILE_PATH.write_text(
        json.dumps(
            private_profile,
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )
    PRIVATE_WORK_PATH.write_text(
        "".join(
            json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n"
            for row in private_rows
        ),
        encoding="utf-8",
    )
    PUBLIC_CANDIDATE_PATH.write_text(
        json.dumps(
            public_candidate,
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )
    if args.print_public_candidate:
        print(
            json.dumps(
                public_candidate,
                ensure_ascii=False,
                indent=2,
                sort_keys=True,
            )
        )
    else:
        print(
            json.dumps(
                {
                    "status": public_candidate["status"],
                    "privateProfileWritten": True,
                    "privateWorkRows": len(private_rows),
                    "publicAggregateCandidateWritten": True,
                },
                ensure_ascii=False,
            )
        )


if __name__ == "__main__":
    main()
