#!/usr/bin/env python3
"""Build non-truncated horizontal comparison CSV partitions from frozen CMX01 detail.

This is delivery-only post-processing. It never fits a model, changes a prediction,
or reads a source ledger. Every output cell comes from the already frozen long-form
CSV partitions produced by the CMX01 evaluator.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[2]
PRIVATE_DIR = ROOT / "data" / "private-output" / "m2-core80-cross-model-real-business-evaluation-v0.1"
WORK_LONG_DIR = PRIVATE_DIR / "full-work-prediction-detail"
CHANNEL_LONG_DIR = PRIVATE_DIR / "full-work-channel-prediction-detail"
WORK_WIDE_DIR = PRIVATE_DIR / "wide-work-prediction-comparison"
CHANNEL_WIDE_DIR = PRIVATE_DIR / "wide-work-channel-prediction-comparison"
CORE_MANIFEST_PATH = PRIVATE_DIR / "M2-CMX01-core-artifact-manifest-private-v0.1.json"
PUBLIC_REPORT_PATH = ROOT / "docs" / "analysis" / "m2-current" / "M2-core80-cross-model-real-business-evaluation-v0.1.json"
COLUMN_MAP_PATH = PRIVATE_DIR / "M2-CMX01-wide-column-map-private-v0.1.json"
INDEX_PATH = PRIVATE_DIR / "M2-CMX01-wide-comparison-index-private-v0.1.json"
STATUS = "M2_CMX01_HISTORICAL_CROSS_EVALUATION_COMPLETE_DECISION_PENDING"

BASE_FIELDS = [
    "case_id",
    "forecast_origin",
    "target_start",
    "target_end",
    "target_year",
    "horizon",
    "population",
    "dynamic_core80_flag",
    "annual_actual_core80_flag",
    "cash_band",
    "work_id",
    "work_title",
    "channel_id",
    "channel_name",
    "model_output_scope",
    "actual_cash",
    "best_model_for_same_case",
    "origin_safe_status",
    "data_authority",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify-only", action="store_true")
    parser.add_argument(
        "--restart-wide",
        action="store_true",
        help="remove and rebuild only the two CMX01 wide derived-cache directories",
    )
    return parser.parse_args()


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def canonical_sha256(value: Any) -> str:
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def count_csv_rows(path: Path) -> int:
    count = 0
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.reader(handle)
        next(reader, None)
        for _ in reader:
            count += 1
    return count


def assert_private_ignored() -> None:
    probe = PRIVATE_DIR / "wide-work-prediction-comparison" / "probe.csv"
    result = subprocess.run(
        ["git", "check-ignore", "-q", str(probe.relative_to(ROOT))],
        cwd=ROOT,
        shell=False,
        check=False,
    )
    if result.returncode != 0:
        raise ValueError("m2_cmx01_wide_output_not_git_ignored")


def safe_clean(root: Path) -> None:
    resolved = root.resolve()
    if resolved.parent != PRIVATE_DIR.resolve() or not resolved.name.startswith("wide-"):
        raise ValueError(f"m2_cmx01_wide_cleanup_target_invalid:{resolved}")
    if resolved.exists():
        shutil.rmtree(resolved)


def variant_columns() -> tuple[list[str], dict[str, str]]:
    report = read_json(PUBLIC_REPORT_PATH)
    if report.get("campaignId") != "M2-CMX01" or report.get("status") != STATUS:
        raise ValueError("m2_cmx01_public_report_authority_invalid")
    variants = sorted({item["modelVariantId"] for item in report["variants"]})
    if len(variants) != 21:
        raise ValueError(f"m2_cmx01_variant_count_invalid:{len(variants)}")
    mapping = {variant: f"V{index:02d}" for index, variant in enumerate(variants, 1)}
    return variants, mapping


def expected_source_hashes() -> dict[str, str]:
    manifest = read_json(CORE_MANIFEST_PATH)
    if manifest.get("status") != "M2_CMX01_CORE_PRIVATE_ARTIFACTS_COMPLETE":
        raise ValueError("m2_cmx01_core_manifest_status_invalid")
    return {item["relativePath"]: item["sha256"] for item in manifest["files"]}


def wide_headers(variants: Iterable[str], mapping: dict[str, str]) -> list[str]:
    headers = list(BASE_FIELDS)
    for variant in variants:
        short = mapping[variant]
        headers.extend([
            f"predicted_cash__{short}",
            f"absolute_error__{short}",
            f"rank__{short}",
        ])
    return headers


def group_key(row: dict[str, str]) -> tuple[str, str, str]:
    return row["population"], row["model_output_scope"], row["case_id"]


def flush_group(
    writer: csv.DictWriter,
    group_rows: list[dict[str, str]],
    variants: list[str],
    mapping: dict[str, str],
) -> int:
    if not group_rows:
        return 0
    reference = group_rows[0]
    for row in group_rows[1:]:
        for field in BASE_FIELDS:
            if row[field] != reference[field]:
                raise ValueError(
                    f"m2_cmx01_wide_same_case_field_mismatch:{field}:{reference['case_id']}"
                )
    output = {field: reference[field] for field in BASE_FIELDS}
    seen_variants: set[str] = set()
    for row in group_rows:
        variant = row["model_variant_id"]
        if variant not in mapping:
            raise ValueError(f"m2_cmx01_wide_unknown_variant:{variant}")
        if variant in seen_variants:
            raise ValueError(f"m2_cmx01_wide_duplicate_variant:{reference['case_id']}:{variant}")
        seen_variants.add(variant)
        short = mapping[variant]
        output[f"predicted_cash__{short}"] = row["predicted_cash"]
        output[f"absolute_error__{short}"] = row["absolute_error"]
        output[f"rank__{short}"] = row["model_rank_for_same_case"]
    for variant in variants:
        short = mapping[variant]
        output.setdefault(f"predicted_cash__{short}", "")
        output.setdefault(f"absolute_error__{short}", "")
        output.setdefault(f"rank__{short}", "")
    writer.writerow(output)
    return len(group_rows)


def convert_partition(
    source: Path,
    target: Path,
    variants: list[str],
    mapping: dict[str, str],
) -> tuple[int, int, int]:
    long_rows = 0
    encoded_long_rows = 0
    wide_rows = 0
    seen_keys: set[tuple[str, str, str]] = set()
    current_key: tuple[str, str, str] | None = None
    current_rows: list[dict[str, str]] = []
    with source.open("r", encoding="utf-8-sig", newline="") as input_handle, target.open(
        "w", encoding="utf-8-sig", newline=""
    ) as output_handle:
        reader = csv.DictReader(input_handle)
        missing = set(BASE_FIELDS + [
            "model_variant_id",
            "predicted_cash",
            "absolute_error",
            "model_rank_for_same_case",
        ]) - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"m2_cmx01_wide_source_fields_missing:{source.name}:{sorted(missing)}")
        writer = csv.DictWriter(output_handle, fieldnames=wide_headers(variants, mapping), lineterminator="\n")
        writer.writeheader()
        for row in reader:
            long_rows += 1
            key = group_key(row)
            if current_key is None:
                current_key = key
            if key != current_key:
                if current_key in seen_keys:
                    raise ValueError(f"m2_cmx01_wide_noncontiguous_case:{source.name}:{current_key}")
                seen_keys.add(current_key)
                encoded_long_rows += flush_group(writer, current_rows, variants, mapping)
                wide_rows += 1
                current_key = key
                current_rows = []
            current_rows.append(row)
        if current_rows:
            if current_key in seen_keys:
                raise ValueError(f"m2_cmx01_wide_noncontiguous_case:{source.name}:{current_key}")
            encoded_long_rows += flush_group(writer, current_rows, variants, mapping)
            wide_rows += 1
    if encoded_long_rows != long_rows:
        raise ValueError(f"m2_cmx01_wide_long_row_conservation_failed:{source.name}")
    return long_rows, wide_rows, encoded_long_rows


def build_partition_set(
    source_root: Path,
    target_root: Path,
    variants: list[str],
    mapping: dict[str, str],
    core_hashes: dict[str, str],
) -> dict[str, Any]:
    target_root.mkdir(parents=True, exist_ok=False)
    entries = []
    long_total = 0
    encoded_long_total = 0
    wide_total = 0
    for source in sorted(source_root.glob("*.csv")):
        relative_source = str(source.relative_to(PRIVATE_DIR)).replace("\\", "/")
        expected_hash = core_hashes.get(relative_source)
        if expected_hash is None:
            raise ValueError(f"m2_cmx01_wide_source_not_in_core_manifest:{relative_source}")
        target = target_root / source.name
        long_rows, wide_rows, encoded_long_rows = convert_partition(source, target, variants, mapping)
        long_total += long_rows
        encoded_long_total += encoded_long_rows
        wide_total += wide_rows
        entry = {
            "source": relative_source,
            "sourceSha256": expected_hash,
            "sourceLongRows": long_rows,
            "encodedLongRows": encoded_long_rows,
            "output": str(target.relative_to(PRIVATE_DIR)).replace("\\", "/"),
            "outputBytes": target.stat().st_size,
            "outputSha256": sha256_file(target),
            "outputWideRows": wide_rows,
            "utf8Bom": target.read_bytes()[:3] == b"\xef\xbb\xbf",
        }
        entries.append(entry)
        print(json.dumps({"status": "M2_CMX01_WIDE_PARTITION_WRITTEN", **entry}, ensure_ascii=False))
    return {
        "sourcePartitionCount": len(entries),
        "outputPartitionCount": len(entries),
        "sourceLongRows": long_total,
        "encodedLongRows": encoded_long_total,
        "outputWideRows": wide_total,
        "longRowConservation": encoded_long_total == long_total,
        "allUtf8Bom": all(item["utf8Bom"] for item in entries),
        "entries": entries,
    }


def verify_index() -> None:
    index = read_json(INDEX_PATH)
    if index.get("status") != STATUS or index.get("variantCount") != 21:
        raise ValueError("m2_cmx01_wide_index_authority_invalid")
    for group in (index["work"], index["workChannel"]):
        if not group.get("longRowConservation") or not group.get("allUtf8Bom"):
            raise ValueError("m2_cmx01_wide_index_conservation_invalid")
        for entry in group["entries"]:
            output = PRIVATE_DIR / entry["output"]
            if not output.is_file():
                raise ValueError(f"m2_cmx01_wide_output_missing:{entry['output']}")
            if output.stat().st_size != entry["outputBytes"] or sha256_file(output) != entry["outputSha256"]:
                raise ValueError(f"m2_cmx01_wide_output_digest_mismatch:{entry['output']}")
            if count_csv_rows(output) != entry["outputWideRows"]:
                raise ValueError(f"m2_cmx01_wide_output_row_mismatch:{entry['output']}")
    payload = {key: value for key, value in index.items() if key != "canonicalPayloadSha256"}
    if canonical_sha256(payload) != index.get("canonicalPayloadSha256"):
        raise ValueError("m2_cmx01_wide_index_payload_digest_mismatch")
    print(json.dumps({
        "status": "M2_CMX01_WIDE_COMPARISON_VERIFIED",
        "workWideRows": index["work"]["outputWideRows"],
        "workChannelWideRows": index["workChannel"]["outputWideRows"],
    }, ensure_ascii=False))


def main() -> None:
    args = parse_args()
    assert_private_ignored()
    if args.verify_only:
        verify_index()
        return
    if INDEX_PATH.exists() and not args.restart_wide:
        verify_index()
        return
    if args.restart_wide:
        safe_clean(WORK_WIDE_DIR)
        safe_clean(CHANNEL_WIDE_DIR)
        for path in (COLUMN_MAP_PATH, INDEX_PATH):
            if path.exists() and path.parent.resolve() == PRIVATE_DIR.resolve():
                path.unlink()
    elif WORK_WIDE_DIR.exists() or CHANNEL_WIDE_DIR.exists():
        raise ValueError("m2_cmx01_partial_wide_output_exists_use_restart_wide")

    started = time.time()
    variants, mapping = variant_columns()
    core_hashes = expected_source_hashes()
    column_map = {
        "schema": "m2.cmx01.wide_column_map.private.v0.1",
        "campaignId": "M2-CMX01",
        "status": STATUS,
        "variantCount": len(variants),
        "columns": [
            {
                "shortId": mapping[variant],
                "modelVariantId": variant,
                "predictionColumn": f"predicted_cash__{mapping[variant]}",
                "absoluteErrorColumn": f"absolute_error__{mapping[variant]}",
                "rankColumn": f"rank__{mapping[variant]}",
            }
            for variant in variants
        ],
    }
    column_map["canonicalPayloadSha256"] = canonical_sha256(column_map)
    write_json(COLUMN_MAP_PATH, column_map)
    result = {
        "schema": "m2.cmx01.wide_comparison_index.private.v0.1",
        "campaignId": "M2-CMX01",
        "status": STATUS,
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "derivation": "DELIVERY_ONLY_PIVOT_FROM_FROZEN_LONG_DETAIL_NO_MODEL_OR_METRIC_RERUN",
        "variantCount": len(variants),
        "columnMap": str(COLUMN_MAP_PATH.relative_to(PRIVATE_DIR)).replace("\\", "/"),
        "columnMapSha256": sha256_file(COLUMN_MAP_PATH),
        "work": build_partition_set(
            WORK_LONG_DIR, WORK_WIDE_DIR, variants, mapping, core_hashes
        ),
        "workChannel": build_partition_set(
            CHANNEL_LONG_DIR, CHANNEL_WIDE_DIR, variants, mapping, core_hashes
        ),
    }
    result["elapsedSeconds"] = round(time.time() - started, 3)
    result["canonicalPayloadSha256"] = canonical_sha256(result)
    write_json(INDEX_PATH, result)
    verify_index()


if __name__ == "__main__":
    main()
