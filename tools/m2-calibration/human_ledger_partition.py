"""Human-reviewed M2 ledger partition authority.

The three workbooks remain private.  This module validates their aggregate
relationship and assigns cash categories only from workbook membership.  It
does not infer buyout status from amount shape, channel, notes, or sign.
"""

from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from numbers import Number
from pathlib import Path
from typing import Callable

import pandas as pd


CONFIG_PATH = (
    Path(__file__).resolve().parents[2]
    / "config"
    / "m2-current-human-ledger-partition.v0.1.json"
)
TYPE_COLUMN = "类型"
PARTITION_VALIDATION_VERSION = "human-ledger-partition.v0.2"
CHECK_NAMES = (
    "schema_equal",
    "split_type_pure",
    "no_split_overlap",
    "row_multiset_conserved",
    "amount_conserved",
    "monthly_row_count_conserved",
    "monthly_amount_conserved",
)


class HumanLedgerPartitionError(RuntimeError):
    """The user-reviewed ledger partition contract is not satisfied."""


@dataclass(frozen=True)
class HumanLedgerPartitionSources:
    total_ledger: Path
    sales_share: Path
    buyout: Path

    def all(self) -> tuple[Path, Path, Path]:
        return (self.total_ledger, self.sales_share, self.buyout)


def load_partition_config(path: Path = CONFIG_PATH) -> dict:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if (
        payload.get("schema") != "m2.current.human_ledger_partition.v0.1"
        or payload.get("authorityMode") != "user_reviewed_workbook_membership"
        or payload.get("cashCategoryContract", {}).get(
            "machineClassificationAllowed"
        )
        is not False
    ):
        raise HumanLedgerPartitionError(
            "human ledger partition configuration differs"
        )
    return payload


def discover_partition_sources(
    data_dir: Path, config: dict | None = None
) -> HumanLedgerPartitionSources:
    contract = config or load_partition_config()
    source_dir = data_dir / Path(contract["sourceDirectory"]).name
    names = contract["workbooks"]
    sources = HumanLedgerPartitionSources(
        total_ledger=source_dir / names["totalLedger"],
        sales_share=source_dir / names["salesShare"],
        buyout=source_dir / names["buyout"],
    )
    missing = [path.name for path in sources.all() if not path.is_file()]
    if missing:
        raise HumanLedgerPartitionError(
            "human-reviewed ledger partition is incomplete: "
            + ", ".join(sorted(missing))
        )
    return sources


def _clean_text(value) -> str:
    if value is None:
        return ""
    try:
        if bool(pd.isna(value)):
            return ""
    except (TypeError, ValueError):
        pass
    return str(value).strip()


def _month_text(value) -> str:
    text = _clean_text(value)
    compact = re.fullmatch(r"(\d{4})(\d{2})(?:\.0)?", text)
    if compact:
        year, month = map(int, compact.groups())
        if 1 <= year <= 9999 and 1 <= month <= 12:
            return f"{year:04d}-{month:02d}"
        raise HumanLedgerPartitionError("invalid bill month")
    # Bare numeric values are not nanosecond timestamps. Excel date cells are
    # already datetime objects; an unformatted serial or a missing year/month
    # has no unambiguous month authority.
    if isinstance(value, Number) or not text or not re.match(r"^\d{4}[-/.]\d{1,2}(?:\D|$)", text):
        raise HumanLedgerPartitionError("invalid bill month")
    parsed = pd.to_datetime(value, errors="coerce")
    if pd.isna(parsed):
        raise HumanLedgerPartitionError("invalid bill month")
    return parsed.strftime("%Y-%m")


def _amount_decimal(value) -> Decimal:
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        raise HumanLedgerPartitionError("invalid bill amount") from None
    if not amount.is_finite():
        raise HumanLedgerPartitionError("invalid bill amount")
    return amount


def _row_signature(values: tuple, base_columns: list[str]) -> tuple:
    return tuple(
        _month_text(value) if column == "年月"
        else _amount_decimal(value) if column == "实销金额"
        else _clean_text(value)
        for column, value in zip(base_columns, values)
    )


def _row_counter(
    frame: pd.DataFrame, base_columns: list[str]
) -> Counter[tuple]:
    return Counter(
        _row_signature(values, base_columns)
        for values in frame[base_columns].itertuples(index=False, name=None)
    )


def _load_raw(path: Path, base_columns: list[str]) -> pd.DataFrame:
    with pd.ExcelFile(path) as workbook:
        header = pd.read_excel(
            workbook, header=None, nrows=1, dtype=object, keep_default_na=False
        )
        actual_columns = list(header.iloc[0]) if len(header) else []
        if (not actual_columns or
                any(not isinstance(column, str) or not column for column in actual_columns) or
                len(set(actual_columns)) != len(actual_columns)):
            raise HumanLedgerPartitionError("invalid or duplicate workbook columns")
        frame = pd.read_excel(
            workbook,
            dtype={"渠道ID": "string", "我方作品ID": "string", TYPE_COLUMN: "string"},
            keep_default_na=False,
        )
        if len(frame.columns) != len(actual_columns):
            raise HumanLedgerPartitionError("invalid or duplicate workbook columns")
    missing = [
        column for column in [*base_columns, TYPE_COLUMN] if column not in frame
    ]
    if missing:
        raise HumanLedgerPartitionError(
            f"{path.name} missing required columns: {missing}"
        )
    result = frame[[*base_columns, TYPE_COLUMN]].copy()
    result.attrs["sourceColumns"] = actual_columns
    result.attrs["sourceRowNumbers"] = tuple(range(2, len(result) + 2))
    return result


def _type_values(frame: pd.DataFrame) -> set[str]:
    return {_clean_text(value) for value in frame[TYPE_COLUMN]}


def _monthly(frame: pd.DataFrame) -> dict[str, dict[str, Decimal | int]]:
    result: dict[str, dict[str, Decimal | int]] = defaultdict(
        lambda: {"rowCount": 0, "amount": Decimal("0")}
    )
    for month, amount in zip(frame["年月"], frame["实销金额"]):
        key = _month_text(month)
        result[key]["rowCount"] = int(result[key]["rowCount"]) + 1
        result[key]["amount"] = Decimal(result[key]["amount"]) + _amount_decimal(
            amount
        )
    return dict(result)


def analyze_partition(
    sources: HumanLedgerPartitionSources, base_columns: list[str]
) -> tuple[dict[str, pd.DataFrame], dict]:
    """Analyze once without applying corrections or classifying unmatched rows.

    Counters, signatures and source row numbers are private diagnostics. Callers
    must explicitly project safe aggregate fields before logging or publishing.
    Column order is presentation only; the actual column sets must agree.
    """
    total = _load_raw(sources.total_ledger, base_columns)
    sales_share = _load_raw(sources.sales_share, base_columns)
    buyout = _load_raw(sources.buyout, base_columns)
    frames = {"totalLedger": total, "salesShare": sales_share, "buyout": buyout}
    schemas = {
        role: list(frame.attrs.get("sourceColumns", frame.columns))
        for role, frame in frames.items()
    }
    source_rows = {}
    for role, frame in frames.items():
        rows = []
        for position, values in enumerate(frame[base_columns].itertuples(index=False, name=None)):
            try:
                signature = _row_signature(values, base_columns)
            except HumanLedgerPartitionError as error:
                # Structured location is available to a private diagnostic writer;
                # the exception message deliberately contains no source value.
                error.source_role = role
                error.row_number = position + 2
                raise
            rows.append({"rowNumber": position + 2, "signature": signature})
        source_rows[role] = rows
    row_counters = {
        role: Counter(row["signature"] for row in rows)
        for role, rows in source_rows.items()
    }
    total_rows, sales_rows, buyout_rows = (
        row_counters[role] for role in ["totalLedger", "salesShare", "buyout"]
    )
    overlap = sales_rows.keys() & buyout_rows.keys()
    combined = sales_rows + buyout_rows
    missing_rows, extra_rows = total_rows - combined, combined - total_rows

    totals = {
        "totalLedger": sum(
            (_amount_decimal(value) for value in total["实销金额"]),
            Decimal("0"),
        ),
        "salesShare": sum(
            (_amount_decimal(value) for value in sales_share["实销金额"]),
            Decimal("0"),
        ),
        "buyout": sum(
            (_amount_decimal(value) for value in buyout["实销金额"]),
            Decimal("0"),
        ),
    }
    monthly = {
        "totalLedger": _monthly(total),
        "salesShare": _monthly(sales_share),
        "buyout": _monthly(buyout),
    }
    month_differences = {}
    for month in sorted(
        set(monthly["totalLedger"])
        | set(monthly["salesShare"])
        | set(monthly["buyout"])
    ):
        total_cell = monthly["totalLedger"].get(
            month, {"rowCount": 0, "amount": Decimal("0")}
        )
        sales_cell = monthly["salesShare"].get(
            month, {"rowCount": 0, "amount": Decimal("0")}
        )
        buyout_cell = monthly["buyout"].get(
            month, {"rowCount": 0, "amount": Decimal("0")}
        )
        month_differences[month] = {
            "rowCountSplitMinusTotal": int(sales_cell["rowCount"]) + int(buyout_cell["rowCount"]) - int(total_cell["rowCount"]),
            "amountSplitMinusTotal": Decimal(sales_cell["amount"]) + Decimal(buyout_cell["amount"]) - Decimal(total_cell["amount"]),
        }

    amount_difference = totals["salesShare"] + totals["buyout"] - totals["totalLedger"]
    checks = {
        "schema_equal": all(set(columns) == set(schemas["totalLedger"]) for columns in schemas.values()),
        "split_type_pure": _type_values(sales_share) == {"分成"} and _type_values(buyout) == {"买断"} and _type_values(total).issubset({"", "买断"}),
        "no_split_overlap": not overlap,
        "row_multiset_conserved": combined == total_rows,
        "amount_conserved": amount_difference == 0,
        "monthly_row_count_conserved": all(cell["rowCountSplitMinusTotal"] == 0 for cell in month_differences.values()),
        "monthly_amount_conserved": all(cell["amountSplitMinusTotal"] == 0 for cell in month_differences.values()),
    }

    evidence = {
        "schema": "m2.current.human_ledger_partition.private_evidence.v0.1",
        "authorityMode": "user_reviewed_workbook_membership",
        "machineClassificationUsed": False,
        "checksPassed": [name for name in CHECK_NAMES if checks[name]],
        "rowCounts": {
            "totalLedger": len(total),
            "salesShare": len(sales_share),
            "buyout": len(buyout),
        },
        "amounts": {key: format(value, "f") for key, value in totals.items()},
        "monthRange": {
            key: {
                "first": min(value) if value else None,
                "last": max(value) if value else None,
            }
            for key, value in monthly.items()
        },
        "negativeRowCounts": {
            "totalLedger": int(
                sum(_amount_decimal(value) < 0 for value in total["实销金额"])
            ),
            "salesShare": int(
                sum(
                    _amount_decimal(value) < 0
                    for value in sales_share["实销金额"]
                )
            ),
            "buyout": int(
                sum(_amount_decimal(value) < 0 for value in buyout["实销金额"])
            ),
        },
        "rawRowsExported": False,
        "workOrChannelIdentifiersExported": False,
    }
    return frames, {
        "checks": checks,
        "evidence": evidence,
        "schemas": schemas,
        "sourceRows": source_rows,
        "rowCounters": row_counters,
        "missingRows": missing_rows,
        "extraRows": extra_rows,
        "overlapRows": overlap,
        "totals": totals,
        "monthly": monthly,
        "differences": {"amountSplitMinusTotal": amount_difference, "byMonth": month_differences},
    }


def validate_partition(
    sources: HumanLedgerPartitionSources, base_columns: list[str]
) -> tuple[dict[str, pd.DataFrame], dict]:
    """Keep the historical strict return shape; any failed check still blocks."""
    frames, analysis = analyze_partition(sources, base_columns)
    checks = analysis["checks"]
    if not checks["schema_equal"]:
        raise HumanLedgerPartitionError("ledger workbook schemas differ")
    if not checks["split_type_pure"]:
        if _type_values(frames["salesShare"]) != {"分成"}:
            raise HumanLedgerPartitionError("sales-share workbook contains a non-sales-share type")
        if _type_values(frames["buyout"]) != {"买断"}:
            raise HumanLedgerPartitionError("buyout workbook contains a non-buyout type")
        raise HumanLedgerPartitionError("total ledger contains an unsupported presentation type")
    if not checks["no_split_overlap"]:
        raise HumanLedgerPartitionError("sales-share and buyout workbooks overlap on source rows")
    if not checks["row_multiset_conserved"]:
        raise HumanLedgerPartitionError(
            "total ledger row multiset differs from the reviewed split: "
            f"missing={sum(analysis['missingRows'].values())}, extra={sum(analysis['extraRows'].values())}"
        )
    if not checks["amount_conserved"]:
        raise HumanLedgerPartitionError("total ledger amount differs from sales-share plus buyout")
    for month, difference in analysis["differences"]["byMonth"].items():
        if difference["rowCountSplitMinusTotal"] != 0:
            raise HumanLedgerPartitionError(f"monthly row conservation failed at {month}")
        if difference["amountSplitMinusTotal"] != 0:
            raise HumanLedgerPartitionError(f"monthly amount conservation failed at {month}")
    return frames, analysis["evidence"]


def load_mapped_partition(
    data_dir: Path,
    base_columns: list[str],
    mapping: dict[str, str],
    bill_reader: Callable[[Path | pd.DataFrame, dict[str, str]], pd.DataFrame],
) -> tuple[dict[str, pd.DataFrame], dict, HumanLedgerPartitionSources]:
    sources = discover_partition_sources(data_dir)
    raw, evidence = validate_partition(sources, base_columns)
    sales_share = bill_reader(raw["salesShare"], mapping)
    sales_share["cashCategory"] = "sales_share"
    sales_share["cashCategoryAuthority"] = "user_reviewed_workbook_membership"
    buyout = bill_reader(raw["buyout"], mapping)
    buyout["cashCategory"] = "buyout"
    buyout["cashCategoryAuthority"] = "user_reviewed_workbook_membership"
    total = pd.concat([sales_share, buyout], ignore_index=True, sort=False)
    return {
        "totalLedger": total,
        "salesShare": sales_share,
        "buyout": buyout,
    }, evidence, sources
