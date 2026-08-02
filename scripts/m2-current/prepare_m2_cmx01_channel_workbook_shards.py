#!/usr/bin/env python3
"""Prepare deterministic, non-truncated CSV shards for CMX01 channel workbooks.

This utility does not fit, tune, or execute a model. It partitions the frozen
private work-channel aggregate ledger by complete model-variant groups so the
spreadsheet packaging layer stays below its practical in-memory export limit.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from collections import Counter
from contextlib import ExitStack
from datetime import datetime, timezone
from pathlib import Path


CAMPAIGN_ID = "M2-CMX01"
STATUS = "M2_CMX01_HISTORICAL_CROSS_EVALUATION_COMPLETE_DECISION_PENDING"
SCHEMA = "m2.cmx01.channel_workbook_shard_index.v0.1"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def plan_groups(counts: Counter[str], maximum_rows: int) -> list[list[str]]:
    groups: list[list[str]] = []
    current: list[str] = []
    current_rows = 0
    for variant_id in sorted(counts):
        variant_rows = counts[variant_id]
        if current and current_rows + variant_rows > maximum_rows:
            groups.append(current)
            current = []
            current_rows = 0
        current.append(variant_id)
        current_rows += variant_rows
    if current:
        groups.append(current)
    return groups


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--index", required=True, type=Path)
    parser.add_argument("--maximum-rows", type=int, default=35_000)
    args = parser.parse_args()

    source = args.source.resolve()
    output_dir = args.output_dir.resolve()
    index_path = args.index.resolve()
    if not source.is_file():
        raise FileNotFoundError(source)
    if args.maximum_rows < 1:
        raise ValueError("--maximum-rows must be positive")
    output_dir.mkdir(parents=True, exist_ok=True)

    counts: Counter[str] = Counter()
    with source.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames or "variant_id" not in reader.fieldnames:
            raise ValueError("source ledger is missing variant_id")
        fieldnames = list(reader.fieldnames)
        for row in reader:
            counts[row["variant_id"]] += 1

    groups = plan_groups(counts, args.maximum_rows)
    variant_to_group = {
        variant_id: group_index
        for group_index, variants in enumerate(groups)
        for variant_id in variants
    }
    shard_paths = [output_dir / f"M2-CMX01-channel-workbook-part-{index + 1:03d}.csv" for index in range(len(groups))]
    observed_counts = [0 for _ in groups]

    with ExitStack() as stack:
        handles = [
            stack.enter_context(path.open("w", encoding="utf-8-sig", newline=""))
            for path in shard_paths
        ]
        writers = [csv.DictWriter(handle, fieldnames=fieldnames) for handle in handles]
        for writer in writers:
            writer.writeheader()
        with source.open("r", encoding="utf-8-sig", newline="") as handle:
            for row in csv.DictReader(handle):
                group_index = variant_to_group[row["variant_id"]]
                writers[group_index].writerow(row)
                observed_counts[group_index] += 1

    source_rows = sum(counts.values())
    if sum(observed_counts) != source_rows:
        raise RuntimeError("shard row conservation failed")
    entries = []
    for index, (variants, csv_path, row_count) in enumerate(
        zip(groups, shard_paths, observed_counts, strict=True),
        start=1,
    ):
        expected = sum(counts[variant_id] for variant_id in variants)
        if expected != row_count:
            raise RuntimeError(f"shard {index} row mismatch: {row_count} != {expected}")
        xlsx_name = f"M2-Core80-逐本书逐渠道模型成绩-v0.1-part-{index:03d}.xlsx"
        entries.append(
            {
                "part": index,
                "variantIds": variants,
                "rowCount": row_count,
                "csv": csv_path.name,
                "csvBytes": csv_path.stat().st_size,
                "csvSha256": sha256_file(csv_path),
                "xlsx": xlsx_name,
            }
        )

    payload = {
        "schema": SCHEMA,
        "campaignId": CAMPAIGN_ID,
        "status": STATUS,
        "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "partitionRule": "COMPLETE_MODEL_VARIANT_GROUPS_MAXIMUM_35000_ROWS_PER_XLSX_SHARD",
        "maximumRowsPerShard": args.maximum_rows,
        "source": source.name,
        "sourceRows": source_rows,
        "sourceBytes": source.stat().st_size,
        "sourceSha256": sha256_file(source),
        "shardCount": len(entries),
        "shardRows": sum(entry["rowCount"] for entry in entries),
        "rowConservation": sum(entry["rowCount"] for entry in entries) == source_rows,
        "entries": entries,
    }
    index_path.parent.mkdir(parents=True, exist_ok=True)
    index_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(payload, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
