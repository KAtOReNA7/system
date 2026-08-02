#!/usr/bin/env python3
"""Finalize and verify the ignored CMX01 private delivery manifest.

The script only inventories frozen outputs, creates portable delivery metadata,
and removes explicitly regenerable spreadsheet-inspection caches when requested.
It does not fit, predict, score, bootstrap, or alter the CMX01 SQLite evidence.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import time
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
PRIVATE_DIR = ROOT / "data" / "private-output" / "m2-core80-cross-model-real-business-evaluation-v0.1"
PUBLIC_JSON = ROOT / "docs" / "analysis" / "m2-current" / "M2-core80-cross-model-real-business-evaluation-v0.1.json"
PUBLIC_MD = ROOT / "docs" / "analysis" / "m2-current" / "M2-core80-cross-model-real-business-evaluation-v0.1.md"
CHECKPOINT = PRIVATE_DIR / "M2-CMX01-evaluation-checkpoint-private-v0.1.json"
CORE_MANIFEST = PRIVATE_DIR / "M2-CMX01-core-artifact-manifest-private-v0.1.json"
WIDE_INDEX = PRIVATE_DIR / "M2-CMX01-wide-comparison-index-private-v0.1.json"
CHANNEL_SHARD_INDEX = PRIVATE_DIR / "channel-workbook-shards" / "M2-CMX01-channel-workbook-shard-index-private-v0.1.json"
CLEANUP_RECEIPT = PRIVATE_DIR / "M2-CMX01-local-cleanup-receipt-private-v0.1.json"
DELIVERY_RECEIPT = PRIVATE_DIR / "M2-CMX01-delivery-receipt-private-v0.1.json"
DELIVERY_README = PRIVATE_DIR / "M2-CMX01-private-delivery-README-v0.1.md"
FINAL_MANIFEST = PRIVATE_DIR / "M2-CMX01-file-manifest-private-v0.1.json"
STATUS = "M2_CMX01_HISTORICAL_CROSS_EVALUATION_COMPLETE_DECISION_PENDING"

MAIN_WORKBOOKS = [
    "M2-Core80-全模型横评-总览-v0.1.xlsx",
    "M2-Core80-逐本书模型成绩-v0.1.xlsx",
    "M2-Core80-逐本书逐渠道模型成绩-v0.1.xlsx",
]
HTML_REPORT = "M2-Core80-全模型横评-可筛选报告-v0.1.html"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cleanup-regenerable-caches", action="store_true")
    parser.add_argument("--verify-only", action="store_true")
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


def assert_private_ignored() -> None:
    probe = PRIVATE_DIR / "manifest-probe.json"
    result = subprocess.run(
        ["git", "check-ignore", "-q", str(probe.relative_to(ROOT))],
        cwd=ROOT,
        shell=False,
        check=False,
    )
    if result.returncode != 0:
        raise ValueError("m2_cmx01_private_delivery_not_git_ignored")


def inspect_original_for_cache(path: Path) -> Path:
    suffix = ".inspect.ndjson"
    if not path.name.endswith(suffix):
        raise ValueError(f"m2_cmx01_cleanup_cache_name_invalid:{path}")
    original = path.with_name(path.name[: -len(suffix)])
    if original.suffix.lower() != ".xlsx" or not original.is_file():
        raise ValueError(f"m2_cmx01_cleanup_original_workbook_missing:{path}")
    return original


def cleanup_regenerable_caches() -> dict[str, Any]:
    private_resolved = PRIVATE_DIR.resolve()
    inspect_paths = sorted(PRIVATE_DIR.rglob("*.xlsx.inspect.ndjson"))
    failure_paths = sorted(PRIVATE_DIR.glob(f"{HTML_REPORT}.tmp-*.verification-failure.png"))
    entries = []
    for path in inspect_paths:
        resolved = path.resolve()
        if private_resolved not in resolved.parents:
            raise ValueError(f"m2_cmx01_cleanup_target_outside_private_dir:{resolved}")
        original = inspect_original_for_cache(path)
        entries.append({
            "relativePath": str(path.relative_to(PRIVATE_DIR)).replace("\\", "/"),
            "bytes": path.stat().st_size,
            "reason": "REGENERABLE_XLSX_INSPECTION_CACHE",
            "originalWorkbook": str(original.relative_to(PRIVATE_DIR)).replace("\\", "/"),
        })
    for path in failure_paths:
        resolved = path.resolve()
        if resolved.parent != private_resolved:
            raise ValueError(f"m2_cmx01_cleanup_target_outside_private_dir:{resolved}")
        entries.append({
            "relativePath": path.name,
            "bytes": path.stat().st_size,
            "reason": "SUPERSEDED_PORTABLE_READER_FAILURE_SCREENSHOT",
        })
    for entry in entries:
        target = PRIVATE_DIR / entry["relativePath"]
        if not target.is_file() or private_resolved not in target.resolve().parents:
            raise ValueError(f"m2_cmx01_cleanup_target_changed:{target}")
        target.unlink()
    receipt = {
        "schema": "m2.cmx01.local_cleanup_receipt.private.v0.1",
        "campaignId": "M2-CMX01",
        "status": "M2_CMX01_REGENERABLE_LOCAL_CACHE_CLEANUP_COMPLETE",
        "completedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "removedFileCount": len(entries),
        "removedBytes": sum(item["bytes"] for item in entries),
        "entries": entries,
        "authorityInputRemoved": False,
        "frozenEvidenceRemoved": False,
        "workbookRemoved": False,
    }
    receipt["canonicalPayloadSha256"] = canonical_sha256(receipt)
    write_json(CLEANUP_RECEIPT, receipt)
    print(json.dumps({
        "status": receipt["status"],
        "removedFileCount": receipt["removedFileCount"],
        "removedBytes": receipt["removedBytes"],
    }, ensure_ascii=False))
    return receipt


def validate_frozen_authority() -> dict[str, Any]:
    checkpoint = read_json(CHECKPOINT)
    core = read_json(CORE_MANIFEST)
    public = read_json(PUBLIC_JSON)
    wide = read_json(WIDE_INDEX)
    shards = read_json(CHANNEL_SHARD_INDEX)
    if checkpoint.get("status") != "COMPLETE":
        raise ValueError("m2_cmx01_evaluation_checkpoint_not_complete")
    if core.get("status") != "M2_CMX01_CORE_PRIVATE_ARTIFACTS_COMPLETE":
        raise ValueError("m2_cmx01_core_manifest_not_complete")
    if public.get("status") != STATUS or wide.get("status") != STATUS or shards.get("status") != STATUS:
        raise ValueError("m2_cmx01_delivery_status_mismatch")
    if checkpoint["outputDigests"]["publicJsonSha256"] != sha256_file(PUBLIC_JSON):
        raise ValueError("m2_cmx01_public_json_changed_after_evaluation")
    if checkpoint["outputDigests"]["publicMarkdownSha256"] != sha256_file(PUBLIC_MD):
        raise ValueError("m2_cmx01_public_markdown_changed_after_evaluation")
    database_entry = next(
        (item for item in core["files"] if item["relativePath"] == "M2-CMX01-complete-private-v0.1.sqlite"),
        None,
    )
    database = PRIVATE_DIR / "M2-CMX01-complete-private-v0.1.sqlite"
    if (
        database_entry is None
        or checkpoint["outputDigests"]["databaseSha256"] != database_entry["sha256"]
        or database.stat().st_size != database_entry["bytes"]
    ):
        raise ValueError("m2_cmx01_database_checkpoint_and_core_manifest_mismatch")
    if shards.get("rowConservation") is not True or shards.get("xlsxRowConservation") is not True:
        raise ValueError("m2_cmx01_channel_workbook_shard_conservation_failed")
    if wide["work"].get("longRowConservation") is not True or wide["workChannel"].get("longRowConservation") is not True:
        raise ValueError("m2_cmx01_wide_row_conservation_failed")
    return {
        "checkpoint": checkpoint,
        "core": core,
        "public": public,
        "wide": wide,
        "shards": shards,
    }


def write_delivery_metadata(authority: dict[str, Any]) -> None:
    for name in [*MAIN_WORKBOOKS, HTML_REPORT]:
        if not (PRIVATE_DIR / name).is_file():
            raise ValueError(f"m2_cmx01_delivery_file_missing:{name}")
    shard_entries = authority["shards"]["entries"]
    for entry in shard_entries:
        workbook = CHANNEL_SHARD_INDEX.parent / entry["xlsx"]
        if workbook.stat().st_size != entry["xlsxBytes"] or sha256_file(workbook) != entry["xlsxSha256"]:
            raise ValueError(f"m2_cmx01_channel_workbook_shard_mismatch:{entry['xlsx']}")
    cleanup = read_json(CLEANUP_RECEIPT) if CLEANUP_RECEIPT.is_file() else None
    receipt = {
        "schema": "m2.cmx01.delivery_receipt.private.v0.1",
        "campaignId": "M2-CMX01",
        "status": "M2_CMX01_PRIVATE_DELIVERY_COMPLETE",
        "evaluationStatus": STATUS,
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "evaluationCheckpointStatus": authority["checkpoint"]["status"],
        "databaseSha256": authority["checkpoint"]["outputDigests"]["databaseSha256"],
        "workbooks": {
            "mainWorkbookCount": len(MAIN_WORKBOOKS),
            "mainWorkbooks": MAIN_WORKBOOKS,
            "channelShardWorkbookCount": len(shard_entries),
            "channelShardRows": authority["shards"]["xlsxRows"],
            "channelShardRowConservation": authority["shards"]["xlsxRowConservation"],
            "artifactToolStructuralInspection": "PASSED_ALL_WORKBOOKS_AND_SHEETS",
            "renderedVisualInspection": "PASSED_ALL_WORKBOOKS_AND_SHEETS",
        },
        "wideComparison": {
            "derivation": authority["wide"]["derivation"],
            "workLongRows": authority["wide"]["work"]["sourceLongRows"],
            "workWideRows": authority["wide"]["work"]["outputWideRows"],
            "workChannelLongRows": authority["wide"]["workChannel"]["sourceLongRows"],
            "workChannelWideRows": authority["wide"]["workChannel"]["outputWideRows"],
            "rowConservation": True,
        },
        "portableHtml": {
            "file": HTML_REPORT,
            "validation": "PASSED",
            "package": "PASSED",
            "staticChartExtraction": "PASSED",
            "browserVerification": "STRUCTURAL_ONLY",
            "manualRealBrowserVisualInspection": "PASSED",
            "sourceDialog": "NOT_VERIFIED",
            "sourceInteraction": "NOT_VERIFIED",
            "knownSharedReaderFinding": "WINDOWS_CLASSIC_SCROLLBAR_100VW_TOP_BAR_8PX_HORIZONTAL_OVERFLOW",
            "findingScope": "SHARED_PORTABLE_READER_CHROME_NOT_CMX01_REPORT_CONTENT",
            "generatedHtmlHandEdited": False,
        },
        "cleanupReceipt": CLEANUP_RECEIPT.name if cleanup else None,
        "cleanupStatus": cleanup.get("status") if cleanup else "NOT_EXECUTED",
        "privateDataGitIgnored": True,
        "modelOrMetricRerunDuringPackaging": False,
        "modelRolesChanged": False,
        "activeCandidate": None,
        "approvedForAutomation": None,
        "productionReady": False,
        "finalHoldoutOpened": False,
    }
    receipt["canonicalPayloadSha256"] = canonical_sha256(receipt)
    write_json(DELIVERY_RECEIPT, receipt)

    readme = f"""# M2-CMX01 私有交付入口

状态：`{STATUS}`。本目录是 Git ignored 的私有派生缓存与运行溯源，不得提交到 GitHub。

## 怎么看

- 总体、周期、年度、重点渠道与配对 bootstrap：`{MAIN_WORKBOOKS[0]}`。
- 按一本书比较模型：打开 `{MAIN_WORKBOOKS[1]}`，在“逐书模型总账”按 `work_title` 或 `work_id` 筛选。
- 按一本书和渠道比较模型：先打开 `{MAIN_WORKBOOKS[2]}`，按模型变体定位 `channel-workbook-shards/` 中的分片，再在“逐书逐渠道总账”按 `work_title`、`channel_name`、人口和输出范围筛选。
- 逐 case 长表：`full-work-prediction-detail/` 与 `full-work-channel-prediction-detail/`。
- 模型预测横向并列：`wide-work-prediction-comparison/` 与 `wide-work-channel-prediction-comparison/`；列代码到模型变体的映射见 `M2-CMX01-wide-column-map-private-v0.1.json`。
- 程序查询：`M2-CMX01-complete-private-v0.1.sqlite`；字段口径见 `M2-CMX01-data-dictionary-private-v0.1.md`。
- 本地聚合筛选报告：`{HTML_REPORT}`。逐书过滤以 Excel/CSV/SQLite 为完整权威。

## 解释边界

不存在覆盖全部 21 个评价变体的全局共同案例集合，因此没有统一历史冠军。不同目标、粒度、人口、horizon 和评价窗口不得直接排名；公共分配器组合只是诊断，不代表作品模型原生渠道能力。结果未激活任何模型，也未打开 final holdout、production、automation 或 M3 formal。
"""
    DELIVERY_README.write_text(readme, encoding="utf-8")


def row_count_and_hash(path: Path) -> tuple[str, int | None, bool | None]:
    digest = hashlib.sha256()
    newline_count = 0
    last_byte = b""
    first_bytes = b""
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(1024 * 1024)
            if not chunk:
                break
            if not first_bytes:
                first_bytes = chunk[:3]
            digest.update(chunk)
            newline_count += chunk.count(b"\n")
            last_byte = chunk[-1:]
    row_count: int | None = None
    utf8_bom: bool | None = None
    if path.suffix.lower() == ".csv":
        total_lines = newline_count + (1 if path.stat().st_size and last_byte != b"\n" else 0)
        row_count = max(0, total_lines - 1)
        utf8_bom = first_bytes == b"\xef\xbb\xbf"
        if not utf8_bom:
            raise ValueError(f"m2_cmx01_csv_without_utf8_bom:{path}")
    elif path.suffix.lower() == ".ndjson":
        row_count = newline_count + (1 if path.stat().st_size and last_byte != b"\n" else 0)
    return digest.hexdigest(), row_count, utf8_bom


def artifact_classification(path: Path) -> str:
    lowered = path.name.lower()
    if any(token in lowered for token in ("receipt", "checkpoint", "manifest")):
        return "PRIVATE_RUN_PROVENANCE"
    return "PRIVATE_DERIVED_CACHE"


def enumerate_manifest_files() -> list[Path]:
    excluded_suffix = ".inspect.ndjson"
    paths = []
    for path in PRIVATE_DIR.rglob("*"):
        if not path.is_file() or path == FINAL_MANIFEST:
            continue
        if path.name.endswith(excluded_suffix) or ".verification-failure.png" in path.name:
            raise ValueError(f"m2_cmx01_regenerable_cache_not_cleaned:{path}")
        if path.name.endswith("-wal") or path.name.endswith("-shm") or ".tmp-" in path.name:
            raise ValueError(f"m2_cmx01_temporary_file_present:{path}")
        paths.append(path)
    return sorted(paths, key=lambda item: str(item.relative_to(PRIVATE_DIR)).replace("\\", "/"))


def write_final_manifest(authority: dict[str, Any]) -> None:
    started = time.time()
    entries = []
    total_bytes = 0
    for index, path in enumerate(enumerate_manifest_files(), 1):
        relative = str(path.relative_to(PRIVATE_DIR)).replace("\\", "/")
        digest, row_count, utf8_bom = row_count_and_hash(path)
        entry = {
            "relativePath": relative,
            "classification": artifact_classification(path),
            "bytes": path.stat().st_size,
            "sha256": digest,
        }
        if row_count is not None:
            entry["rowCount"] = row_count
        if utf8_bom is not None:
            entry["utf8Bom"] = utf8_bom
        entries.append(entry)
        total_bytes += entry["bytes"]
        print(json.dumps({
            "status": "M2_CMX01_DELIVERY_FILE_HASHED",
            "index": index,
            "relativePath": relative,
            "bytes": entry["bytes"],
        }, ensure_ascii=False))
    payload = {
        "schema": "m2.cmx01.file_manifest.private.v0.1",
        "campaignId": "M2-CMX01",
        "status": "M2_CMX01_PRIVATE_DELIVERY_MANIFEST_COMPLETE",
        "evaluationStatus": STATUS,
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "privateRootClass": "GIT_IGNORED_PRIVATE_OUTPUT",
        "fileCount": len(entries),
        "totalBytes": total_bytes,
        "publicFreeze": {
            "publicJson": str(PUBLIC_JSON.relative_to(ROOT)).replace("\\", "/"),
            "publicJsonSha256": authority["checkpoint"]["outputDigests"]["publicJsonSha256"],
            "publicMarkdown": str(PUBLIC_MD.relative_to(ROOT)).replace("\\", "/"),
            "publicMarkdownSha256": authority["checkpoint"]["outputDigests"]["publicMarkdownSha256"],
        },
        "rowSummary": {
            "workLongRows": authority["wide"]["work"]["sourceLongRows"],
            "workWideRows": authority["wide"]["work"]["outputWideRows"],
            "workChannelLongRows": authority["wide"]["workChannel"]["sourceLongRows"],
            "workChannelWideRows": authority["wide"]["workChannel"]["outputWideRows"],
            "channelWorkbookRows": authority["shards"]["xlsxRows"],
        },
        "files": entries,
        "elapsedSeconds": round(time.time() - started, 3),
    }
    payload["canonicalPayloadSha256"] = canonical_sha256(payload)
    write_json(FINAL_MANIFEST, payload)


def verify_final_manifest(*, rehash: bool) -> None:
    manifest = read_json(FINAL_MANIFEST)
    if manifest.get("status") != "M2_CMX01_PRIVATE_DELIVERY_MANIFEST_COMPLETE":
        raise ValueError("m2_cmx01_final_manifest_status_invalid")
    payload = {key: value for key, value in manifest.items() if key != "canonicalPayloadSha256"}
    if canonical_sha256(payload) != manifest.get("canonicalPayloadSha256"):
        raise ValueError("m2_cmx01_final_manifest_payload_digest_mismatch")
    expected_paths = {item["relativePath"] for item in manifest["files"]}
    actual_paths = {
        str(path.relative_to(PRIVATE_DIR)).replace("\\", "/")
        for path in enumerate_manifest_files()
    }
    if expected_paths != actual_paths:
        raise ValueError("m2_cmx01_final_manifest_file_set_mismatch")
    total_bytes = 0
    for item in manifest["files"]:
        path = PRIVATE_DIR / item["relativePath"]
        if path.stat().st_size != item["bytes"]:
            raise ValueError(f"m2_cmx01_final_manifest_file_mismatch:{item['relativePath']}")
        if rehash:
            digest, row_count, utf8_bom = row_count_and_hash(path)
            if digest != item["sha256"]:
                raise ValueError(f"m2_cmx01_final_manifest_file_mismatch:{item['relativePath']}")
            if item.get("rowCount") != row_count:
                raise ValueError(f"m2_cmx01_final_manifest_row_mismatch:{item['relativePath']}")
            if item.get("utf8Bom") != utf8_bom:
                raise ValueError(f"m2_cmx01_final_manifest_bom_mismatch:{item['relativePath']}")
        total_bytes += item["bytes"]
    if total_bytes != manifest["totalBytes"] or len(manifest["files"]) != manifest["fileCount"]:
        raise ValueError("m2_cmx01_final_manifest_totals_mismatch")
    print(json.dumps({
        "status": "M2_CMX01_PRIVATE_DELIVERY_VERIFIED",
        "fileCount": manifest["fileCount"],
        "totalBytes": manifest["totalBytes"],
        "manifestSha256": sha256_file(FINAL_MANIFEST),
        "rehash": rehash,
    }, ensure_ascii=False))


def main() -> None:
    args = parse_args()
    assert_private_ignored()
    if args.cleanup_regenerable_caches:
        cleanup_regenerable_caches()
    if args.verify_only:
        verify_final_manifest(rehash=True)
        return
    authority = validate_frozen_authority()
    write_delivery_metadata(authority)
    write_final_manifest(authority)
    verify_final_manifest(rehash=False)


if __name__ == "__main__":
    main()
