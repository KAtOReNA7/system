#!/usr/bin/env python3
"""Build the frozen M2-CMX01 private evaluation ledger and public aggregates.

The script never fits or changes a model.  It consumes the prediction artifacts
created by the pre-registered, origin-bounded replay and materialises one common
SQLite evidence ledger.  Private row-level outputs stay below data/private-output
and public outputs contain only thresholded, scale-free aggregates.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import os
import random
import shutil
import sqlite3
import statistics
import sys
import time
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Iterator, Sequence

try:
    import numpy as np
except ImportError as error:  # pragma: no cover - capability doctor guards this
    raise SystemExit("m2_cmx01_numpy_required") from error


ROOT = Path(__file__).resolve().parents[2]
PRIVATE_DIR = ROOT / "data/private-output/m2-core80-cross-model-real-business-evaluation-v0.1"
CONTRACT_PATH = ROOT / "config/m2-core80-cross-model-evaluation.v0.1.json"
ELIGIBILITY_PATH = ROOT / "docs/analysis/m2-current/M2-core80-cross-model-eligibility-audit-v0.1.json"
REGISTRY_PATH = ROOT / "config/m2-model-registry.v1.json"
PUBLIC_JSON_PATH = ROOT / "docs/analysis/m2-current/M2-core80-cross-model-real-business-evaluation-v0.1.json"
PUBLIC_MD_PATH = ROOT / "docs/analysis/m2-current/M2-core80-cross-model-real-business-evaluation-v0.1.md"
DB_PATH = PRIVATE_DIR / "M2-CMX01-complete-private-v0.1.sqlite"
CHECKPOINT_PATH = PRIVATE_DIR / "M2-CMX01-evaluation-checkpoint-private-v0.1.json"
PRIVATE_SUMMARY_PATH = PRIVATE_DIR / "M2-CMX01-private-summary-v0.1.json"
DICTIONARY_PATH = PRIVATE_DIR / "M2-CMX01-data-dictionary-private-v0.1.md"
CORE_MANIFEST_PATH = PRIVATE_DIR / "M2-CMX01-core-artifact-manifest-private-v0.1.json"
WORK_CSV_ROOT = PRIVATE_DIR / "full-work-prediction-detail"
CHANNEL_CSV_ROOT = PRIVATE_DIR / "full-work-channel-prediction-detail"
WORK_LEDGER_CSV = PRIVATE_DIR / "M2-CMX01-work-model-ledger-private-v0.1.csv"
CHANNEL_LEDGER_CSV = PRIVATE_DIR / "M2-CMX01-work-channel-model-ledger-private-v0.1.csv"
OVERVIEW_CSV = PRIVATE_DIR / "M2-CMX01-overview-metrics-private-v0.1.csv"

SCHEMA_VERSION = "m2.cmx01.private_evaluation.v0.1"
FINAL_STATUS = "M2_CMX01_HISTORICAL_CROSS_EVALUATION_COMPLETE_DECISION_PENDING"
HISTORICAL_CHAMPION_STATUS = "M2_CMX01_HISTORICAL_CHAMPION_IDENTIFIED_BUT_NOT_ACTIVATED"
BOOTSTRAP_ITERATIONS = 5000
BOOTSTRAP_SEED = 20260802
EPSILON = 1e-12
ANNUAL_H12_ORIGINS = {
    "2019-12", "2020-12", "2021-12", "2022-12", "2023-12", "2024-12"
}
POPULATIONS = (
    "ORIGIN_VISIBLE_DYNAMIC_CORE80",
    "ANNUAL_ACTUAL_CORE80_HINDSIGHT_DIAGNOSTIC",
    "ALL_ELIGIBLE_WORKS_DIAGNOSTIC",
)
MAJOR_CHANNELS = {
    "chn_846e11f634e4e518364a": "喜马拉雅",
    "chn_9c0835f2ded5dea065e1": "微信读书",
    "chn_0c5894e9a72814b7d7f8": "番茄畅听",
    "chn_744db9d05e912d103620": "猫耳",
    "chn_2c645574c6c7201a4a8e": "漫播",
}


@dataclass(frozen=True)
class Variant:
    variant_id: str
    model_id: str
    version: str
    display_zh: str
    display_en: str
    object_type: str
    native_work_channel: bool = False


VARIANTS: tuple[Variant, ...] = (
    Variant("M2-BASE-CLASSIC01/zero", "M2-BASE-CLASSIC01", "v0.1", "经典零值基线", "Classic Zero Baseline", "research_baseline"),
    Variant("M2-BASE-CLASSIC01/seasonal_naive", "M2-BASE-CLASSIC01", "v0.1", "经典季节朴素基线", "Classic Seasonal Naive", "research_baseline"),
    Variant("M2-BASE-CLASSIC01/Croston", "M2-BASE-CLASSIC01", "v0.1", "经典 Croston 基线", "Classic Croston", "research_baseline"),
    Variant("M2-BASE-CLASSIC01/SBA", "M2-BASE-CLASSIC01", "v0.1", "经典 SBA 基线", "Classic SBA", "research_baseline"),
    Variant("M2-BASE-CLASSIC01/TSB", "M2-BASE-CLASSIC01", "v0.1", "经典 TSB 基线", "Classic TSB", "research_baseline"),
    Variant("M2-BASE-CLASSIC01/ADIDA", "M2-BASE-CLASSIC01", "v0.1", "经典 ADIDA 基线", "Classic ADIDA", "research_baseline"),
    Variant("M2-WORK-MAN01/FAITHFUL_FIXED_FORMULA", "M2-WORK-MAN01", "v0.1", "人工固定公式基线", "Manual Fixed Formula Baseline", "research_baseline"),
    Variant("M2-WORK-MCR01/FROZEN_MANUAL_CHANNEL_RULE", "M2-WORK-MCR01", "v0.1", "人工渠道规则金额模型", "Manual Channel-Rule Revenue Model", "candidate"),
    Variant("M2-WORK-CCR01/NESTED_CANONICAL_CHANNEL", "M2-WORK-CCR01", "v0.1", "嵌套渠道校准挑战者", "Canonical Channel Calibrated Challenger", "candidate"),
    Variant("M2-WORK-CRMR01/REGISTERED_NATIVE_WORK_CHANNEL", "M2-WORK-CRMR01", "v0.1", "渠道规则与机制模型", "Channel-Rule and Mechanism Revenue Model", "candidate", True),
    Variant("M2-WORK-LG01/LEARNED_GLOBAL_COMMON_REVERSAL", "M2-WORK-LG01", "v0.1", "学习型全局金额基线", "Learned Global Amount Model", "research_baseline"),
    Variant("M2-WORK-HP01/RAW_HIERARCHICAL_POSITIVE_ORIGINAL", "M2-WORK-HP01", "v0.1", "原始分层正金额层", "Raw Hierarchical Positive Layer", "candidate"),
    Variant("M2-WORK-OR01/FULLY_RAW_OCCURRENCE_REVERSAL", "M2-WORK-OR01", "v0.1", "原始发生与冲销层", "Raw Occurrence-Reversal Layer", "candidate"),
    Variant("M2-WORK-TSB01/RAW_TSB_OCCURRENCE", "M2-WORK-TSB01", "v0.1", "TSB 发生概率金额模型", "TSB Occurrence Amount Model", "candidate"),
    Variant("M2-WORK-TSBB01/RAW_TSB_LG01_BLEND", "M2-WORK-TSBB01", "v0.1", "TSB 与 LG01 登记混合模型", "Registered TSB-LG01 Blend", "registered_composite"),
    Variant("M2-WORK-CHAM01/B1", "M2-WORK-CHAM01", "v0.1", "核心老品分周期金额模型：基础臂", "Horizon Amount Model B1", "experiment_arm"),
    Variant("M2-WORK-CHAM01/B2", "M2-WORK-CHAM01", "v0.1", "核心老品分周期金额模型：扩展臂", "Horizon Amount Model B2", "experiment_arm"),
    Variant("M2-WORK-CHAM01/B3", "M2-WORK-CHAM01", "v0.1", "核心老品分周期金额模型：LG01 残差臂", "Horizon Amount Model B3", "experiment_arm"),
    Variant("M2-WORK-HR01/REGISTERED_HORIZON_ROUTER", "M2-WORK-HR01", "v0.1", "按预测周期滚动模型路由器", "Rolling Horizon Model Router", "registered_composite"),
    Variant("M2-CHAN-SCL01/A6_RAW", "M2-CHAN-SCL01", "v0.1", "出版规模适配渠道核心完整臂", "Publishing-Scale Channel Core A6", "candidate", True),
    Variant("M2-CHAN-PSC01-RAW", "M2-CHAN-PSC01", "v0.1", "出版规模条件金额原始候选", "Publishing-Scale Conditional Amount Raw Candidate", "candidate", True),
)
VARIANT_BY_ID = {item.variant_id: item for item in VARIANTS}
LG_VARIANT = "M2-WORK-LG01/LEARNED_GLOBAL_COMMON_REVERSAL"


SOURCE_VARIANT_MAP = {
    **{item.variant_id: item.variant_id for item in VARIANTS},
    "M2-WORK-CRMR01/NATIVE_WORK_CHANNEL_SUM": "M2-WORK-CRMR01/REGISTERED_NATIVE_WORK_CHANNEL",
    "M2-WORK-CRMR01/NATIVE_WORK_CHANNEL": "M2-WORK-CRMR01/REGISTERED_NATIVE_WORK_CHANNEL",
    "M2-WORK-HR01/DYNAMIC_CORE80": "M2-WORK-HR01/REGISTERED_HORIZON_ROUTER",
    "M2-WORK-HR01/ALL_ELIGIBLE_WORKS": "M2-WORK-HR01/REGISTERED_HORIZON_ROUTER",
    "M2-CHAN-SCL01/NATIVE_CHANNEL_SUM_A6": "M2-CHAN-SCL01/A6_RAW",
    "M2-CHAN-SCL01/NATIVE_CHANNEL_A6": "M2-CHAN-SCL01/A6_RAW",
    "M2-CHAN-PSC01-RAW/NATIVE_CHANNEL_SUM": "M2-CHAN-PSC01-RAW",
    "M2-CHAN-PSC01-RAW/NATIVE_CHANNEL": "M2-CHAN-PSC01-RAW",
}

WORK_PREDICTION_FILES = (
    "M2-CMX01-simple-work-predictions-private-v0.1.ndjson",
    "M2-CMX01-human-anchored-predictions-private-v0.1.ndjson",
    "M2-CMX01-tsb-predictions-private-v0.1.ndjson",
    "M2-CMX01-cham01-predictions-private-v0.1.ndjson",
    "M2-CMX01-horizon-router-predictions-private-v0.1.ndjson",
    "M2-CMX01-scl01-work-predictions-private-v0.1.ndjson",
    "M2-CMX01-psc01-work-predictions-private-v0.1.ndjson",
)
CHANNEL_PREDICTION_FILES = (
    "M2-CMX01-crmr01-native-channel-predictions-private-v0.1.ndjson",
    "M2-CMX01-scl01-native-channel-predictions-private-v0.1.ndjson",
    "M2-CMX01-psc01-native-channel-predictions-private-v0.1.ndjson",
)


class MedianAggregate:
    def __init__(self) -> None:
        self.values: list[float] = []

    def step(self, value: float | None) -> None:
        if value is not None and math.isfinite(float(value)):
            self.values.append(float(value))

    def finalize(self) -> float | None:
        return statistics.median(self.values) if self.values else None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--restart", action="store_true", help="rebuild only this capability's derived evaluation outputs")
    parser.add_argument("--skip-csv", action="store_true", help="debug only; final delivery must omit this flag")
    parser.add_argument("--verify-only", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    started = time.time()
    PRIVATE_DIR.mkdir(parents=True, exist_ok=True)
    assert_private_ignored()
    source_hashes = required_source_hashes()
    if args.verify_only:
        verify_complete_outputs(source_hashes)
        emit_status("M2_CMX01_PRIVATE_EVALUATION_VERIFIED", started)
        return
    if args.restart:
        remove_capability_evaluation_outputs()

    checkpoint = read_checkpoint(source_hashes)
    conn = connect_database()
    try:
        create_schema(conn)
        seed_variants(conn)
        import_sources(conn, checkpoint, source_hashes)
        materialize_details(conn, checkpoint, source_hashes)
        audit_integrity(conn, checkpoint, source_hashes)
        compute_metrics(conn, checkpoint, source_hashes)
        compute_bootstrap_and_pairwise(conn, checkpoint, source_hashes)
        build_private_ledgers(conn, checkpoint, source_hashes)
        if not args.skip_csv:
            export_detail_csv(conn, checkpoint, source_hashes)
        private_summary = build_private_summary(conn, source_hashes)
        write_json(PRIVATE_SUMMARY_PATH, private_summary)
        write_text(DICTIONARY_PATH, render_dictionary(conn, private_summary))
        public_payload = build_public_payload(conn, private_summary, source_hashes)
        assert_public_safe(public_payload)
        write_json(PUBLIC_JSON_PATH, public_payload)
        public_markdown = render_public_markdown(public_payload)
        assert_public_safe(public_markdown)
        write_text(PUBLIC_MD_PATH, public_markdown)
        conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        conn.commit()
        write_core_manifest(source_hashes)
        update_checkpoint(checkpoint, source_hashes, "COMPLETE", {
            "databaseSha256": sha256_file(DB_PATH),
            "privateSummarySha256": sha256_file(PRIVATE_SUMMARY_PATH),
            "publicJsonSha256": sha256_file(PUBLIC_JSON_PATH),
            "publicMarkdownSha256": sha256_file(PUBLIC_MD_PATH),
        })
    finally:
        conn.close()
    verify_complete_outputs(source_hashes)
    emit_status(FINAL_STATUS, started)


def emit_status(status: str, started: float) -> None:
    print(json.dumps({
        "status": status,
        "elapsedSeconds": round(time.time() - started, 3),
        "database": str(DB_PATH),
        "publicJson": str(PUBLIC_JSON_PATH),
        "publicMarkdown": str(PUBLIC_MD_PATH),
    }, ensure_ascii=False, indent=2))


def connect_database() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.create_aggregate("median", 1, MedianAggregate)
    conn.create_function("sqrt", 1, lambda value: math.sqrt(value) if value is not None and value >= 0 else None)
    conn.executescript("""
        PRAGMA journal_mode=WAL;
        PRAGMA synchronous=NORMAL;
        PRAGMA temp_store=MEMORY;
        PRAGMA cache_size=-262144;
        PRAGMA foreign_keys=ON;
    """)
    return conn


def create_schema(conn: sqlite3.Connection) -> None:
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS model_variants (
      variant_id TEXT PRIMARY KEY,
      model_id TEXT NOT NULL,
      model_version TEXT NOT NULL,
      display_zh TEXT NOT NULL,
      display_en TEXT NOT NULL,
      object_type TEXT NOT NULL,
      native_work_channel INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS work_cases (
      case_key TEXT PRIMARY KEY,
      work_id TEXT NOT NULL,
      work_title TEXT NOT NULL,
      origin TEXT NOT NULL,
      target_start TEXT NOT NULL,
      target_end TEXT NOT NULL,
      target_year INTEGER NOT NULL,
      horizon INTEGER NOT NULL,
      actual REAL NOT NULL,
      actual_positive REAL NOT NULL,
      actual_reversal REAL NOT NULL,
      label_available_as_of TEXT NOT NULL,
      dynamic_core80 INTEGER NOT NULL,
      annual_actual_core80 INTEGER NOT NULL,
      core90 INTEGER NOT NULL,
      cash_band_id TEXT,
      segment TEXT,
      dominant_revenue_mode TEXT,
      revenue_decile INTEGER,
      reference_rank INTEGER,
      origin_safe_status TEXT NOT NULL,
      data_authority TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS channel_cases (
      channel_case_key TEXT PRIMARY KEY,
      case_key TEXT NOT NULL REFERENCES work_cases(case_key),
      work_id TEXT NOT NULL,
      work_title TEXT NOT NULL,
      channel_uid TEXT NOT NULL,
      channel_name TEXT NOT NULL,
      origin TEXT NOT NULL,
      target_start TEXT NOT NULL,
      target_end TEXT NOT NULL,
      target_year INTEGER NOT NULL,
      horizon INTEGER NOT NULL,
      actual REAL NOT NULL,
      work_actual REAL NOT NULL,
      label_available_as_of TEXT NOT NULL,
      dynamic_core80 INTEGER NOT NULL,
      annual_actual_core80 INTEGER NOT NULL,
      core90 INTEGER NOT NULL,
      cash_band_id TEXT,
      settlement_mechanism TEXT,
      channel_identity_status TEXT NOT NULL,
      reference_rank INTEGER,
      origin_safe_status TEXT NOT NULL,
      data_authority TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS work_predictions (
      variant_id TEXT NOT NULL REFERENCES model_variants(variant_id),
      source_variant_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      population_route TEXT NOT NULL,
      case_key TEXT NOT NULL REFERENCES work_cases(case_key),
      predicted REAL NOT NULL,
      source_actual REAL NOT NULL,
      maximum_training_label_available_as_of TEXT,
      native_or_composite TEXT NOT NULL,
      source_file TEXT NOT NULL,
      PRIMARY KEY (variant_id, population_route, case_key)
    );
    CREATE TABLE IF NOT EXISTS native_channel_predictions (
      variant_id TEXT NOT NULL REFERENCES model_variants(variant_id),
      source_variant_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      population_route TEXT NOT NULL,
      channel_case_key TEXT NOT NULL REFERENCES channel_cases(channel_case_key),
      predicted REAL NOT NULL,
      source_actual REAL NOT NULL,
      native_or_composite TEXT NOT NULL,
      source_file TEXT NOT NULL,
      PRIMARY KEY (variant_id, population_route, channel_case_key)
    );
    CREATE TABLE IF NOT EXISTS allocator_shares (
      work_id TEXT NOT NULL,
      origin TEXT NOT NULL,
      channel_uid TEXT NOT NULL,
      allocator_id TEXT NOT NULL,
      allocator_source TEXT NOT NULL,
      share REAL NOT NULL,
      PRIMARY KEY (work_id, origin, channel_uid)
    );
    CREATE TABLE IF NOT EXISTS work_detail (
      population_id TEXT NOT NULL,
      case_id TEXT NOT NULL,
      case_key TEXT NOT NULL,
      origin TEXT NOT NULL,
      target_start TEXT NOT NULL,
      target_end TEXT NOT NULL,
      target_year INTEGER NOT NULL,
      horizon INTEGER NOT NULL,
      annual_h12_exam INTEGER NOT NULL,
      dynamic_core80 INTEGER NOT NULL,
      annual_actual_core80 INTEGER NOT NULL,
      cash_band_id TEXT,
      work_id TEXT NOT NULL,
      work_title TEXT NOT NULL,
      model_id TEXT NOT NULL,
      model_version TEXT NOT NULL,
      variant_id TEXT NOT NULL,
      model_output_scope TEXT NOT NULL,
      native_or_composite TEXT NOT NULL,
      allocator_id TEXT,
      actual REAL NOT NULL,
      predicted REAL NOT NULL,
      signed_error REAL NOT NULL,
      absolute_error REAL NOT NULL,
      ape REAL,
      sape REAL NOT NULL,
      squared_error REAL NOT NULL,
      coverage_status TEXT NOT NULL,
      origin_safe_status TEXT NOT NULL,
      data_authority TEXT NOT NULL,
      invalid_or_diagnostic_reason TEXT,
      label_available_as_of TEXT NOT NULL,
      maximum_training_label_available_as_of TEXT,
      population_route TEXT NOT NULL,
      PRIMARY KEY (population_id, variant_id, case_key)
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS channel_detail (
      population_id TEXT NOT NULL,
      channel_case_id TEXT NOT NULL,
      channel_case_key TEXT NOT NULL,
      case_key TEXT NOT NULL,
      origin TEXT NOT NULL,
      target_start TEXT NOT NULL,
      target_end TEXT NOT NULL,
      target_year INTEGER NOT NULL,
      horizon INTEGER NOT NULL,
      annual_h12_exam INTEGER NOT NULL,
      dynamic_core80 INTEGER NOT NULL,
      annual_actual_core80 INTEGER NOT NULL,
      cash_band_id TEXT,
      work_id TEXT NOT NULL,
      work_title TEXT NOT NULL,
      channel_uid TEXT NOT NULL,
      channel_name TEXT NOT NULL,
      model_id TEXT NOT NULL,
      model_version TEXT NOT NULL,
      variant_id TEXT NOT NULL,
      model_output_scope TEXT NOT NULL,
      native_or_composite TEXT NOT NULL,
      allocator_id TEXT,
      actual REAL NOT NULL,
      predicted REAL NOT NULL,
      signed_error REAL NOT NULL,
      absolute_error REAL NOT NULL,
      ape REAL,
      sape REAL NOT NULL,
      squared_error REAL NOT NULL,
      coverage_status TEXT NOT NULL,
      origin_safe_status TEXT NOT NULL,
      data_authority TEXT NOT NULL,
      invalid_or_diagnostic_reason TEXT,
      settlement_mechanism TEXT,
      channel_identity_status TEXT NOT NULL,
      population_route TEXT NOT NULL,
      PRIMARY KEY (population_id, model_output_scope, variant_id, channel_case_key)
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS metric_summary (
      comparison_set TEXT NOT NULL,
      grain TEXT NOT NULL,
      model_output_scope TEXT NOT NULL,
      population_id TEXT NOT NULL,
      slice_type TEXT NOT NULL,
      slice_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      variant_id TEXT NOT NULL,
      participant_count INTEGER,
      case_count INTEGER NOT NULL,
      work_count INTEGER NOT NULL,
      expected_case_count INTEGER,
      coverage REAL,
      actual_denominator REAL NOT NULL,
      actual_total REAL NOT NULL,
      prediction_total REAL NOT NULL,
      absolute_error_total REAL NOT NULL,
      wape REAL,
      signed_bias REAL,
      predicted_actual_ratio REAL,
      mae REAL,
      rmse REAL,
      smape REAL,
      median_ape_nonzero REAL,
      failure_rate REAL,
      catastrophe_count INTEGER NOT NULL,
      top1_work_error_contribution REAL,
      top5_work_error_contribution REAL,
      top10_work_error_contribution REAL,
      maximum_work_error_contribution REAL,
      zero_actual_nonzero_prediction_count INTEGER NOT NULL,
      nonzero_actual_omission_count INTEGER NOT NULL,
      PRIMARY KEY (comparison_set, grain, model_output_scope, population_id, slice_type, slice_id, variant_id)
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS common_set_audit (
      grain TEXT NOT NULL,
      model_output_scope TEXT NOT NULL,
      population_id TEXT NOT NULL,
      slice_type TEXT NOT NULL,
      slice_id TEXT NOT NULL,
      participant_count INTEGER NOT NULL,
      participant_variants_json TEXT NOT NULL,
      common_case_count INTEGER NOT NULL,
      common_work_count INTEGER NOT NULL,
      status TEXT NOT NULL,
      PRIMARY KEY (grain, model_output_scope, population_id, slice_type, slice_id)
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS pairwise_comparison (
      population_id TEXT NOT NULL,
      baseline_variant_id TEXT NOT NULL,
      candidate_variant_id TEXT NOT NULL,
      matched_case_count INTEGER NOT NULL,
      matched_work_count INTEGER NOT NULL,
      baseline_wape REAL,
      candidate_wape REAL,
      candidate_minus_baseline_wape REAL,
      relative_fva REAL,
      PRIMARY KEY (population_id, baseline_variant_id, candidate_variant_id)
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS bootstrap_comparison (
      population_id TEXT NOT NULL,
      baseline_variant_id TEXT NOT NULL,
      candidate_variant_id TEXT NOT NULL,
      matched_case_count INTEGER NOT NULL,
      block_count INTEGER NOT NULL,
      iterations INTEGER NOT NULL,
      seed INTEGER NOT NULL,
      point_difference_candidate_minus_baseline REAL NOT NULL,
      lower95 REAL NOT NULL,
      median_difference REAL NOT NULL,
      upper95 REAL NOT NULL,
      probability_candidate_better REAL NOT NULL,
      probability_candidate_noninferior REAL NOT NULL,
      empirical_two_sided_p REAL NOT NULL,
      holm_adjusted_p REAL,
      PRIMARY KEY (population_id, baseline_variant_id, candidate_variant_id)
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS integrity_audit (
      audit_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      observed_value TEXT,
      expected_value TEXT,
      details_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_work_cases_slice ON work_cases(target_year, horizon, origin);
    CREATE INDEX IF NOT EXISTS idx_channel_cases_work ON channel_cases(case_key, channel_uid);
    CREATE INDEX IF NOT EXISTS idx_work_predictions_case ON work_predictions(case_key, variant_id);
    CREATE INDEX IF NOT EXISTS idx_channel_predictions_case ON native_channel_predictions(channel_case_key, variant_id);
    CREATE INDEX IF NOT EXISTS idx_allocator_work_origin ON allocator_shares(work_id, origin);
    CREATE INDEX IF NOT EXISTS idx_work_detail_slice ON work_detail(population_id, horizon, target_year, variant_id);
    CREATE INDEX IF NOT EXISTS idx_work_detail_case ON work_detail(population_id, case_key, variant_id);
    CREATE INDEX IF NOT EXISTS idx_work_detail_work ON work_detail(population_id, work_id, variant_id);
    CREATE INDEX IF NOT EXISTS idx_channel_detail_slice ON channel_detail(population_id, model_output_scope, horizon, target_year, variant_id);
    CREATE INDEX IF NOT EXISTS idx_channel_detail_case ON channel_detail(population_id, model_output_scope, channel_case_key, variant_id);
    CREATE INDEX IF NOT EXISTS idx_channel_detail_channel ON channel_detail(population_id, model_output_scope, channel_uid, variant_id);
    """)
    conn.executescript("""
    DROP VIEW IF EXISTS work_detail_ranked;
    CREATE VIEW work_detail_ranked AS
    SELECT d.*,
      CASE WHEN SUM(absolute_error) OVER (PARTITION BY population_id, variant_id) > 0
        THEN absolute_error / SUM(absolute_error) OVER (PARTITION BY population_id, variant_id)
        ELSE 0 END AS absolute_error_contribution,
      RANK() OVER (
        PARTITION BY population_id, case_key
        ORDER BY absolute_error ASC, ABS(signed_error) ASC, variant_id ASC
      ) AS model_rank_for_same_case,
      FIRST_VALUE(variant_id) OVER (
        PARTITION BY population_id, case_key
        ORDER BY absolute_error ASC, ABS(signed_error) ASC, variant_id ASC
      ) AS best_model_for_same_case
    FROM work_detail d;
    DROP VIEW IF EXISTS channel_detail_ranked;
    CREATE VIEW channel_detail_ranked AS
    SELECT d.*,
      CASE WHEN SUM(absolute_error) OVER (
          PARTITION BY population_id, model_output_scope, variant_id
        ) > 0
        THEN absolute_error / SUM(absolute_error) OVER (
          PARTITION BY population_id, model_output_scope, variant_id
        ) ELSE 0 END AS absolute_error_contribution,
      RANK() OVER (
        PARTITION BY population_id, model_output_scope, channel_case_key
        ORDER BY absolute_error ASC, ABS(signed_error) ASC, variant_id ASC
      ) AS model_rank_for_same_case,
      FIRST_VALUE(variant_id) OVER (
        PARTITION BY population_id, model_output_scope, channel_case_key
        ORDER BY absolute_error ASC, ABS(signed_error) ASC, variant_id ASC
      ) AS best_model_for_same_case
    FROM channel_detail d;
    """)
    conn.commit()


def seed_variants(conn: sqlite3.Connection) -> None:
    conn.executemany(
        "INSERT OR REPLACE INTO model_variants VALUES (?, ?, ?, ?, ?, ?, ?)",
        [(v.variant_id, v.model_id, v.version, v.display_zh, v.display_en, v.object_type, int(v.native_work_channel)) for v in VARIANTS],
    )
    conn.execute("INSERT OR REPLACE INTO metadata VALUES ('schema', ?)", (SCHEMA_VERSION,))
    conn.commit()


def import_sources(conn: sqlite3.Connection, checkpoint: dict[str, Any], source_hashes: dict[str, str]) -> None:
    if not phase_done(checkpoint, "work_cases"):
        import_work_cases(conn)
        mark_phase(checkpoint, source_hashes, "work_cases")
    if not phase_done(checkpoint, "channel_cases"):
        import_channel_cases(conn)
        mark_phase(checkpoint, source_hashes, "channel_cases")
    if not phase_done(checkpoint, "allocator_shares"):
        import_allocator(conn)
        mark_phase(checkpoint, source_hashes, "allocator_shares")
    for filename in WORK_PREDICTION_FILES:
        phase = f"work_prediction:{filename}"
        if not phase_done(checkpoint, phase):
            import_work_predictions(conn, filename)
            mark_phase(checkpoint, source_hashes, phase)
    for filename in CHANNEL_PREDICTION_FILES:
        phase = f"channel_prediction:{filename}"
        if not phase_done(checkpoint, phase):
            import_channel_predictions(conn, filename)
            mark_phase(checkpoint, source_hashes, phase)


def import_work_cases(conn: sqlite3.Connection) -> None:
    path = PRIVATE_DIR / "M2-CMX01-base-work-cases-private-v0.1.ndjson"
    conn.execute("DELETE FROM work_cases")
    sql = "INSERT INTO work_cases VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
    batch: list[tuple[Any, ...]] = []
    for row in ndjson_rows(path):
        work_id = str(row["standardWorkId"])
        origin = row["origin"]
        horizon = int(row["horizonMonths"])
        case_key = make_work_case_key(work_id, origin, horizon)
        batch.append((
            case_key, work_id, row.get("workTitle") or "", origin,
            row["targetStart"], row["targetEnd"], int(row["targetYear"]), horizon,
            finite(row["actual"], "work_case_actual"), finite(row.get("actualPositive", 0), "actual_positive"),
            finite(row.get("actualReversal", 0), "actual_reversal"), row["labelAvailableAsOf"],
            bool_int(row["dynamicCore80Flag"]), bool_int(row["annualActualCore80Flag"]),
            bool_int(row.get("core90", False)), row.get("cashBandId"), row.get("segment"),
            row.get("dominantRevenueMode"), nullable_int(row.get("revenueDecile")),
            nullable_int(row.get("referenceRank")), row["originSafeStatus"], row["dataAuthority"],
        ))
        flush_batch(conn, sql, batch)
    flush_batch(conn, sql, batch, force=True)
    conn.commit()


def import_channel_cases(conn: sqlite3.Connection) -> None:
    path = PRIVATE_DIR / "M2-CMX01-base-work-channel-cases-private-v0.1.ndjson"
    conn.execute("DELETE FROM channel_cases")
    sql = "INSERT INTO channel_cases VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
    batch: list[tuple[Any, ...]] = []
    for row in ndjson_rows(path):
        work_id = str(row["standardWorkId"])
        channel_uid = row["channelUid"]
        origin = row["origin"]
        horizon = int(row["horizonMonths"])
        case_key = make_work_case_key(work_id, origin, horizon)
        channel_case_key = make_channel_case_key(work_id, channel_uid, origin, horizon)
        batch.append((
            channel_case_key, case_key, work_id, row.get("workTitle") or "", channel_uid,
            row.get("channelName") or "", origin, row["targetStart"], row["targetEnd"],
            int(row["targetYear"]), horizon, finite(row["actual"], "channel_actual"),
            finite(row["workActual"], "channel_work_actual"), row["labelAvailableAsOf"],
            bool_int(row["dynamicCore80Flag"]), bool_int(row["annualActualCore80Flag"]),
            bool_int(row.get("core90", False)), row.get("cashBandId"), row.get("settlementMechanism"),
            row["channelIdentityStatus"], nullable_int(row.get("referenceRank")),
            row["originSafeStatus"], row["dataAuthority"],
        ))
        flush_batch(conn, sql, batch)
    flush_batch(conn, sql, batch, force=True)
    conn.commit()


def import_allocator(conn: sqlite3.Connection) -> None:
    path = PRIVATE_DIR / "M2-CMX01-common-allocator-shares-private-v0.1.ndjson"
    conn.execute("DELETE FROM allocator_shares")
    sql = "INSERT INTO allocator_shares VALUES (?,?,?,?,?,?)"
    batch: list[tuple[Any, ...]] = []
    for row in ndjson_rows(path):
        share = finite(row["share"], "allocator_share")
        if share < -EPSILON:
            raise ValueError("m2_cmx01_negative_allocator_share")
        batch.append((str(row["standardWorkId"]), row["origin"], row["channelUid"], row["allocatorId"], row["allocatorSource"], share))
        flush_batch(conn, sql, batch)
    flush_batch(conn, sql, batch, force=True)
    conn.commit()


def import_work_predictions(conn: sqlite3.Connection, filename: str) -> None:
    path = PRIVATE_DIR / filename
    conn.execute("DELETE FROM work_predictions WHERE source_file = ?", (filename,))
    sql = "INSERT INTO work_predictions VALUES (?,?,?,?,?,?,?,?,?,?)"
    batch: list[tuple[Any, ...]] = []
    for row in ndjson_rows(path):
        source_variant = row["modelVariantId"]
        variant_id = SOURCE_VARIANT_MAP.get(source_variant)
        if variant_id is None or variant_id not in VARIANT_BY_ID:
            raise ValueError(f"m2_cmx01_unknown_work_variant:{source_variant}")
        work_id = str(row["standardWorkId"])
        origin = row["origin"]
        horizon = int(row["horizonMonths"])
        predicted = finite(row["pointEstimate"], "work_prediction")
        actual = finite(row["actual"], "work_prediction_actual")
        maximum_label = row.get("maximumTrainingLabelAvailableAsOf") or row.get("trainingMaximumLabelAvailableAsOf")
        if maximum_label is not None and maximum_label > origin:
            raise ValueError(f"m2_cmx01_future_training_label:{filename}:{work_id}:{origin}:{horizon}")
        batch.append((
            variant_id, source_variant, VARIANT_BY_ID[variant_id].model_id,
            normalize_route(row.get("populationRoute")), make_work_case_key(work_id, origin, horizon),
            predicted, actual, maximum_label, row.get("nativeOrComposite") or "NATIVE",
            filename,
        ))
        flush_batch(conn, sql, batch)
    flush_batch(conn, sql, batch, force=True)
    conn.commit()


def import_channel_predictions(conn: sqlite3.Connection, filename: str) -> None:
    path = PRIVATE_DIR / filename
    conn.execute("DELETE FROM native_channel_predictions WHERE source_file = ?", (filename,))
    sql = "INSERT INTO native_channel_predictions VALUES (?,?,?,?,?,?,?,?,?)"
    batch: list[tuple[Any, ...]] = []
    for row in ndjson_rows(path):
        source_variant = row["modelVariantId"]
        variant_id = SOURCE_VARIANT_MAP.get(source_variant)
        if variant_id is None or variant_id not in VARIANT_BY_ID:
            raise ValueError(f"m2_cmx01_unknown_channel_variant:{source_variant}")
        work_id = str(row["standardWorkId"])
        origin = row["origin"]
        horizon = int(row["horizonMonths"])
        batch.append((
            variant_id, source_variant, VARIANT_BY_ID[variant_id].model_id,
            normalize_route(row.get("populationRoute")),
            make_channel_case_key(work_id, row["channelUid"], origin, horizon),
            finite(row["pointEstimate"], "channel_prediction"),
            finite(row["actual"], "channel_prediction_actual"),
            row.get("nativeOrComposite") or "NATIVE_RAW_CANDIDATE", filename,
        ))
        flush_batch(conn, sql, batch)
    flush_batch(conn, sql, batch, force=True)
    conn.commit()


def materialize_details(conn: sqlite3.Connection, checkpoint: dict[str, Any], source_hashes: dict[str, str]) -> None:
    if not phase_done(checkpoint, "work_detail"):
        conn.execute("DELETE FROM work_detail")
        for population in POPULATIONS:
            predicate, routes = population_predicate(population, "c")
            placeholders = ",".join("?" for _ in routes)
            conn.execute(f"""
            INSERT INTO work_detail
            SELECT ?,
              ? || '|' || c.origin || '|' || c.target_start || '|' || c.target_end || '|' || c.horizon || '|' || c.work_id,
              c.case_key, c.origin, c.target_start, c.target_end, c.target_year, c.horizon,
              CASE WHEN c.horizon=12 AND c.origin IN ({','.join('?' for _ in ANNUAL_H12_ORIGINS)}) THEN 1 ELSE 0 END,
              c.dynamic_core80, c.annual_actual_core80, c.cash_band_id, c.work_id, c.work_title,
              v.model_id, v.model_version, p.variant_id, 'WORK_TOTAL', p.native_or_composite, NULL,
              c.actual, p.predicted, p.predicted-c.actual, ABS(p.predicted-c.actual),
              CASE WHEN ABS(c.actual)>? THEN ABS(p.predicted-c.actual)/ABS(c.actual) ELSE NULL END,
              CASE WHEN ABS(c.actual)+ABS(p.predicted)>? THEN 2*ABS(p.predicted-c.actual)/(ABS(c.actual)+ABS(p.predicted)) ELSE 0 END,
              (p.predicted-c.actual)*(p.predicted-c.actual), 'PREDICTED', c.origin_safe_status,
              c.data_authority, NULL, c.label_available_as_of,
              p.maximum_training_label_available_as_of, p.population_route
            FROM work_predictions p
            JOIN work_cases c ON c.case_key=p.case_key
            JOIN model_variants v ON v.variant_id=p.variant_id
            WHERE {predicate} AND p.population_route IN ({placeholders})
            """, (
                population, population, *sorted(ANNUAL_H12_ORIGINS), EPSILON, EPSILON, *routes,
            ))
            conn.commit()
        mark_phase(checkpoint, source_hashes, "work_detail")
    if not phase_done(checkpoint, "native_channel_detail"):
        conn.execute("DELETE FROM channel_detail WHERE model_output_scope='NATIVE_WORK_CHANNEL'")
        for population in POPULATIONS:
            predicate, routes = population_predicate(population, "c")
            placeholders = ",".join("?" for _ in routes)
            conn.execute(f"""
            INSERT INTO channel_detail
            SELECT ?,
              ? || '|' || c.origin || '|' || c.target_start || '|' || c.target_end || '|' || c.horizon || '|' || c.work_id || '|' || c.channel_uid,
              c.channel_case_key, c.case_key, c.origin, c.target_start, c.target_end, c.target_year, c.horizon,
              CASE WHEN c.horizon=12 AND c.origin IN ({','.join('?' for _ in ANNUAL_H12_ORIGINS)}) THEN 1 ELSE 0 END,
              c.dynamic_core80, c.annual_actual_core80, c.cash_band_id, c.work_id, c.work_title,
              c.channel_uid, c.channel_name, v.model_id, v.model_version, p.variant_id,
              'NATIVE_WORK_CHANNEL', p.native_or_composite, NULL, c.actual, p.predicted,
              p.predicted-c.actual, ABS(p.predicted-c.actual),
              CASE WHEN ABS(c.actual)>? THEN ABS(p.predicted-c.actual)/ABS(c.actual) ELSE NULL END,
              CASE WHEN ABS(c.actual)+ABS(p.predicted)>? THEN 2*ABS(p.predicted-c.actual)/(ABS(c.actual)+ABS(p.predicted)) ELSE 0 END,
              (p.predicted-c.actual)*(p.predicted-c.actual), 'PREDICTED', c.origin_safe_status,
              c.data_authority, NULL, c.settlement_mechanism, c.channel_identity_status,
              p.population_route
            FROM native_channel_predictions p
            JOIN channel_cases c ON c.channel_case_key=p.channel_case_key
            JOIN model_variants v ON v.variant_id=p.variant_id
            WHERE {predicate} AND p.population_route IN ({placeholders})
            """, (
                population, population, *sorted(ANNUAL_H12_ORIGINS), EPSILON, EPSILON, *routes,
            ))
            conn.commit()
        mark_phase(checkpoint, source_hashes, "native_channel_detail")
    if not phase_done(checkpoint, "common_allocator_channel_detail"):
        conn.execute("DELETE FROM channel_detail WHERE model_output_scope='COMMON_ALLOCATOR_DIAGNOSTIC'")
        conn.execute("""
        INSERT INTO channel_detail
        SELECT w.population_id,
          w.population_id || '|' || c.origin || '|' || c.target_start || '|' || c.target_end || '|' || c.horizon || '|' || c.work_id || '|' || c.channel_uid,
          c.channel_case_key, c.case_key, c.origin, c.target_start, c.target_end, c.target_year, c.horizon,
          w.annual_h12_exam, c.dynamic_core80, c.annual_actual_core80, c.cash_band_id,
          c.work_id, c.work_title, c.channel_uid, c.channel_name, w.model_id, w.model_version,
          w.variant_id, 'COMMON_ALLOCATOR_DIAGNOSTIC', 'COMPOSITE_DIAGNOSTIC', a.allocator_id,
          c.actual, w.predicted*a.share, w.predicted*a.share-c.actual,
          ABS(w.predicted*a.share-c.actual),
          CASE WHEN ABS(c.actual)>1e-12 THEN ABS(w.predicted*a.share-c.actual)/ABS(c.actual) ELSE NULL END,
          CASE WHEN ABS(c.actual)+ABS(w.predicted*a.share)>1e-12
            THEN 2*ABS(w.predicted*a.share-c.actual)/(ABS(c.actual)+ABS(w.predicted*a.share)) ELSE 0 END,
          (w.predicted*a.share-c.actual)*(w.predicted*a.share-c.actual), 'PREDICTED',
          c.origin_safe_status, c.data_authority,
          'COMMON_FROZEN_ALLOCATOR_DIAGNOSTIC_NOT_NATIVE_CHANNEL_CAPABILITY',
          c.settlement_mechanism, c.channel_identity_status, w.population_route
        FROM work_detail w
        JOIN allocator_shares a ON a.work_id=w.work_id AND a.origin=w.origin
        JOIN channel_cases c ON c.case_key=w.case_key AND c.channel_uid=a.channel_uid
        """)
        conn.commit()
        mark_phase(checkpoint, source_hashes, "common_allocator_channel_detail")


def audit_integrity(conn: sqlite3.Connection, checkpoint: dict[str, Any], source_hashes: dict[str, str]) -> None:
    if phase_done(checkpoint, "integrity_audit"):
        return
    conn.execute("DELETE FROM integrity_audit")
    audits: list[tuple[str, str, str, str, str]] = []
    work_count = scalar(conn, "SELECT COUNT(*) FROM work_cases")
    channel_count = scalar(conn, "SELECT COUNT(*) FROM channel_cases")
    audits.append(audit_row("CASE_UNIVERSE_WORK_COUNT", work_count == 237595, work_count, 237595))
    audits.append(audit_row("CASE_UNIVERSE_CHANNEL_COUNT", channel_count == 621466, channel_count, 621466))
    cell_count = scalar(conn, "SELECT COUNT(*) FROM (SELECT DISTINCT origin,horizon FROM work_cases)")
    audits.append(audit_row("ORIGIN_HORIZON_CELL_COUNT", cell_count == 235, cell_count, 235))
    invalid_actual = scalar(conn, """
      SELECT COUNT(*) FROM work_predictions p JOIN work_cases c USING(case_key)
      WHERE ABS(p.source_actual-c.actual)>1e-8*MAX(1,ABS(c.actual))
    """)
    audits.append(audit_row("WORK_ACTUAL_PARITY", invalid_actual == 0, invalid_actual, 0))
    invalid_channel_actual = scalar(conn, """
      SELECT COUNT(*) FROM native_channel_predictions p JOIN channel_cases c USING(channel_case_key)
      WHERE ABS(p.source_actual-c.actual)>1e-8*MAX(1,ABS(c.actual))
    """)
    audits.append(audit_row("CHANNEL_ACTUAL_PARITY", invalid_channel_actual == 0, invalid_channel_actual, 0))
    future_labels = scalar(conn, """
      SELECT COUNT(*) FROM work_predictions p JOIN work_cases c USING(case_key)
      WHERE p.maximum_training_label_available_as_of IS NOT NULL
        AND p.maximum_training_label_available_as_of>c.origin
    """)
    audits.append(audit_row("NO_FUTURE_TRAINING_LABEL", future_labels == 0, future_labels, 0))
    core_visibility = scalar(conn, """
      SELECT COUNT(*) FROM work_cases
      WHERE dynamic_core80=1 AND origin_safe_status<>'ORIGIN_VISIBLE_DYNAMIC_POPULATION_PASS'
    """)
    audits.append(audit_row("CORE80_ORIGIN_VISIBILITY", core_visibility == 0, core_visibility, 0))
    nonfinite = scalar(conn, """
      SELECT COUNT(*) FROM work_predictions WHERE predicted IS NULL OR predicted!=predicted
    """) + scalar(conn, """
      SELECT COUNT(*) FROM native_channel_predictions WHERE predicted IS NULL OR predicted!=predicted
    """)
    audits.append(audit_row("FINITE_PREDICTIONS", nonfinite == 0, nonfinite, 0))
    work_channel_actual_diff = scalar_float(conn, """
      SELECT MAX(ABS(c.actual-COALESCE(x.channel_actual,0)))
      FROM work_cases c LEFT JOIN (
        SELECT case_key,SUM(actual) channel_actual FROM channel_cases GROUP BY case_key
      ) x USING(case_key)
    """)
    audits.append(audit_row("ACTUAL_WORK_CHANNEL_CONSERVATION", work_channel_actual_diff <= 1e-7, work_channel_actual_diff, "<=1e-7"))
    allocator_diff = scalar_float(conn, """
      SELECT MAX(ABS(1-share_sum)) FROM (
        SELECT work_id,origin,SUM(share) share_sum FROM allocator_shares GROUP BY work_id,origin
      )
    """)
    audits.append(audit_row("ALLOCATOR_SHARE_CONSERVATION", allocator_diff <= 1e-10, allocator_diff, "<=1e-10"))
    common_diff = scalar_float(conn, """
      SELECT MAX(ABS(w.predicted-x.channel_prediction))
      FROM work_detail w JOIN (
        SELECT population_id,variant_id,case_key,SUM(predicted) channel_prediction
        FROM channel_detail WHERE model_output_scope='COMMON_ALLOCATOR_DIAGNOSTIC'
        GROUP BY population_id,variant_id,case_key
      ) x USING(population_id,variant_id,case_key)
    """)
    common_relative_diff = scalar_float(conn, """
      SELECT MAX(ABS(w.predicted-x.channel_prediction)/MAX(1,ABS(w.predicted)))
      FROM work_detail w JOIN (
        SELECT population_id,variant_id,case_key,SUM(predicted) channel_prediction
        FROM channel_detail WHERE model_output_scope='COMMON_ALLOCATOR_DIAGNOSTIC'
        GROUP BY population_id,variant_id,case_key
      ) x USING(population_id,variant_id,case_key)
    """)
    common_missing = scalar(conn, """
      SELECT COUNT(*) FROM work_detail w LEFT JOIN (
        SELECT population_id,variant_id,case_key FROM channel_detail
        WHERE model_output_scope='COMMON_ALLOCATOR_DIAGNOSTIC'
        GROUP BY population_id,variant_id,case_key
      ) x USING(population_id,variant_id,case_key)
      WHERE x.case_key IS NULL
    """)
    common_unexplained_missing = scalar(conn, """
      SELECT COUNT(*) FROM work_detail w
      LEFT JOIN (
        SELECT population_id,variant_id,case_key FROM channel_detail
        WHERE model_output_scope='COMMON_ALLOCATOR_DIAGNOSTIC'
        GROUP BY population_id,variant_id,case_key
      ) x USING(population_id,variant_id,case_key)
      JOIN allocator_shares a ON a.work_id=w.work_id AND a.origin=w.origin
      WHERE x.case_key IS NULL
    """)
    audits.append(audit_row(
        "COMMON_ALLOCATOR_WORK_TOTAL_CONSERVATION",
        common_relative_diff <= 1e-12,
        common_relative_diff,
        "<=1e-12_RELATIVE",
        {"maximumAbsoluteDifference": common_diff},
    ))
    audits.append(audit_row(
        "COMMON_ALLOCATOR_ABSTENTION_EXPLICIT",
        common_unexplained_missing == 0,
        common_missing,
        "ALL_MISSING_WORK_CASES_HAVE_NO_LEGAL_ALLOCATOR_SHARE",
        {
            "unexplainedMissingWorkCases": common_unexplained_missing,
            "policy": "ABSTAIN_CHANNEL_ALLOCATION_NOT_ZERO",
        },
    ))
    native_diff = scalar_float(conn, """
      SELECT MAX(ABS(w.predicted-x.channel_prediction))
      FROM work_detail w JOIN model_variants v USING(variant_id)
      JOIN (
        SELECT population_id,variant_id,case_key,SUM(predicted) channel_prediction
        FROM channel_detail WHERE model_output_scope='NATIVE_WORK_CHANNEL'
        GROUP BY population_id,variant_id,case_key
      ) x USING(population_id,variant_id,case_key)
      WHERE v.native_work_channel=1
    """)
    native_relative_diff = scalar_float(conn, """
      SELECT MAX(ABS(w.predicted-x.channel_prediction)/MAX(1,ABS(w.predicted)))
      FROM work_detail w JOIN model_variants v USING(variant_id)
      JOIN (
        SELECT population_id,variant_id,case_key,SUM(predicted) channel_prediction
        FROM channel_detail WHERE model_output_scope='NATIVE_WORK_CHANNEL'
        GROUP BY population_id,variant_id,case_key
      ) x USING(population_id,variant_id,case_key)
      WHERE v.native_work_channel=1
    """)
    audits.append(audit_row(
        "NATIVE_WORK_CHANNEL_PREDICTION_CONSERVATION",
        native_relative_diff <= 1e-12,
        native_relative_diff,
        "<=1e-12_RELATIVE",
        {"maximumAbsoluteDifference": native_diff},
    ))
    unresolved = scalar(conn, "SELECT COUNT(*) FROM channel_cases WHERE channel_identity_status<>'CANONICAL_CONFIRMED'")
    audits.append(audit_row("CANONICAL_CHANNEL_IDENTITY", unresolved == 0, unresolved, 0))
    duplicate_work = scalar(conn, "SELECT COUNT(*)-COUNT(DISTINCT population_id||'|'||variant_id||'|'||case_key) FROM work_detail")
    duplicate_channel = scalar(conn, "SELECT COUNT(*)-COUNT(DISTINCT population_id||'|'||model_output_scope||'|'||variant_id||'|'||channel_case_key) FROM channel_detail")
    audits.append(audit_row("UNIQUE_WORK_DETAIL_ROWS", duplicate_work == 0, duplicate_work, 0))
    audits.append(audit_row("UNIQUE_CHANNEL_DETAIL_ROWS", duplicate_channel == 0, duplicate_channel, 0))
    conn.executemany("INSERT INTO integrity_audit VALUES (?,?,?,?,?)", audits)
    conn.commit()
    failed = [row for row in audits if row[1] != "PASS"]
    if failed:
        raise ValueError("m2_cmx01_integrity_audit_failed:" + ",".join(row[0] for row in failed))
    mark_phase(checkpoint, source_hashes, "integrity_audit")


def compute_metrics(conn: sqlite3.Connection, checkpoint: dict[str, Any], source_hashes: dict[str, str]) -> None:
    if phase_done(checkpoint, "metrics"):
        return
    if not phase_done(checkpoint, "metrics_reset"):
        conn.execute("DELETE FROM metric_summary")
        conn.execute("DELETE FROM common_set_audit")
        conn.commit()
        mark_phase(checkpoint, source_hashes, "metrics_reset")
    if not phase_done(checkpoint, "metrics_model_available"):
        # Model-available work metrics.
        for population in POPULATIONS:
            add_metric_groups(conn, "work_detail", "WORK_TOTAL", "NATIVE_WORK_TOTAL", population, "OVERALL", ["'ALL'"], [], "1=1")
            add_metric_groups(conn, "work_detail", "WORK_TOTAL", "NATIVE_WORK_TOTAL", population, "HORIZON", ["CAST(horizon AS TEXT)"], ["horizon"], "1=1")
            add_metric_groups(conn, "work_detail", "WORK_TOTAL", "NATIVE_WORK_TOTAL", population, "TARGET_YEAR", ["CAST(target_year AS TEXT)"], ["target_year"], "1=1")
            add_metric_groups(conn, "work_detail", "WORK_TOTAL", "NATIVE_WORK_TOTAL", population, "ANNUAL_H12_YEAR", ["CAST(target_year AS TEXT)"], ["target_year"], "annual_h12_exam=1")
            add_metric_groups(conn, "work_detail", "WORK_TOTAL", "NATIVE_WORK_TOTAL", population, "CASH_BAND", ["COALESCE(cash_band_id,'UNBANDED')"], ["cash_band_id"], "1=1")
            add_metric_groups(conn, "work_detail", "WORK_TOTAL", "NATIVE_WORK_TOTAL", population, "ORIGIN", ["origin"], ["origin"], "1=1")
        # Native and common-allocator channel model-available metrics.
        for population in POPULATIONS:
            for scope in ("NATIVE_WORK_CHANNEL", "COMMON_ALLOCATOR_DIAGNOSTIC"):
                scope_filter = "model_output_scope=?"
                scope_params = (scope,)
                add_metric_groups(conn, "channel_detail", "WORK_CHANNEL", scope, population, "OVERALL", ["'ALL'"], [], scope_filter, scope_params)
                add_metric_groups(conn, "channel_detail", "WORK_CHANNEL", scope, population, "HORIZON", ["CAST(horizon AS TEXT)"], ["horizon"], scope_filter, scope_params)
                add_metric_groups(conn, "channel_detail", "WORK_CHANNEL", scope, population, "TARGET_YEAR", ["CAST(target_year AS TEXT)"], ["target_year"], scope_filter, scope_params)
                add_metric_groups(conn, "channel_detail", "WORK_CHANNEL", scope, population, "ANNUAL_H12_YEAR", ["CAST(target_year AS TEXT)"], ["target_year"], f"{scope_filter} AND annual_h12_exam=1", scope_params)
                add_metric_groups(conn, "channel_detail", "WORK_CHANNEL", scope, population, "CHANNEL", ["channel_uid"], ["channel_uid"], scope_filter, scope_params)
                add_metric_groups(conn, "channel_detail", "WORK_CHANNEL", scope, population, "CHANNEL_YEAR", ["channel_uid||'|'||target_year"], ["channel_uid", "target_year"], scope_filter, scope_params)
                add_metric_groups(conn, "channel_detail", "WORK_CHANNEL", scope, population, "CHANNEL_HORIZON", ["channel_uid||'|'||horizon"], ["channel_uid", "horizon"], scope_filter, scope_params)
        conn.commit()
        mark_phase(checkpoint, source_hashes, "metrics_model_available")

    common_slices: list[tuple[str, str, str]] = [("OVERALL", "ALL", "1=1")]
    common_slices += [("HORIZON", str(h), f"horizon={h}") for h in (3, 6, 12, 36)]
    common_slices += [("ANNUAL_H12_YEAR", str(year), f"annual_h12_exam=1 AND target_year={year}") for year in range(2020, 2026)]
    common_slices += [("CASH_BAND", band, f"cash_band_id='{band}'") for band in ("H50", "M30", "L20")]
    if not phase_done(checkpoint, "metrics_work_common"):
        for population in POPULATIONS:
            for slice_type, slice_id, predicate in common_slices:
                build_common_metrics(conn, population, slice_type, slice_id, predicate)
        conn.commit()
        mark_phase(checkpoint, source_hashes, "metrics_work_common")
    # Championship claims are restricted to the formal dynamic Core80
    # population.  The two supplementary populations retain complete
    # model-available channel ledgers but cannot select a champion.  Common
    # allocator comparisons are horizon-specific because the frozen H36-only
    # and short-horizon-only model supports have no all-horizon intersection.
    channel_common_jobs: list[tuple[str, str, str, int | None]] = [
        (
            "ORIGIN_VISIBLE_DYNAMIC_CORE80",
            "NATIVE_WORK_CHANNEL",
            "CHANNEL",
            None,
        ),
        *[(
            "ORIGIN_VISIBLE_DYNAMIC_CORE80",
            "COMMON_ALLOCATOR_DIAGNOSTIC",
            "CHANNEL_HORIZON",
            horizon,
        ) for horizon in (3, 6, 12, 36)],
    ]
    for population, scope, slice_type, fixed_horizon in channel_common_jobs:
        phase = f"metrics_channel_common:{population}:{scope}:{slice_type}"
        if fixed_horizon is not None:
            phase += f":H{fixed_horizon}"
        if phase_done(checkpoint, phase):
            continue
        if scope == "COMMON_ALLOCATOR_DIAGNOSTIC" and fixed_horizon is not None:
            build_horizon_common_allocator_channel_metrics(
                conn, population, fixed_horizon
            )
        else:
            build_bulk_common_channel_metrics(
                conn, population, scope, slice_type,
                fixed_horizon=fixed_horizon,
            )
        conn.commit()
        mark_phase(checkpoint, source_hashes, phase)
    mark_phase(checkpoint, source_hashes, "metrics")


def add_metric_groups(
    conn: sqlite3.Connection,
    table: str,
    grain: str,
    output_scope: str,
    population: str,
    slice_type: str,
    slice_expressions: list[str],
    slice_columns: list[str],
    extra_where: str,
    extra_params: Sequence[Any] = (),
) -> None:
    slice_expression = "||'|'||".join(slice_expressions)
    group_clause = ",".join(["variant_id", "model_id", *slice_columns])
    rows = conn.execute(f"""
      SELECT variant_id,model_id,{slice_expression} slice_id,
        COUNT(*) case_count,COUNT(DISTINCT work_id) work_count,
        SUM(ABS(actual)) actual_denominator,SUM(actual) actual_total,
        SUM(predicted) prediction_total,SUM(absolute_error) absolute_error_total,
        SUM(signed_error) signed_error_total,AVG(absolute_error) mae,
        sqrt(AVG(squared_error)) rmse,AVG(sape) smape,median(ape) median_ape,
        SUM(CASE WHEN ape>=1 THEN 1 ELSE 0 END)*1.0/COUNT(*) failure_rate,
        SUM(CASE WHEN ape>=3 THEN 1 ELSE 0 END) catastrophe_count,
        SUM(CASE WHEN ABS(actual)<=1e-12 AND ABS(predicted)>1e-12 THEN 1 ELSE 0 END) zero_actual_nonzero,
        SUM(CASE WHEN ABS(actual)>1e-12 AND ABS(predicted)<=1e-12 THEN 1 ELSE 0 END) nonzero_omission
      FROM {table}
      WHERE population_id=? AND {extra_where}
      GROUP BY {group_clause}
    """, (population, *extra_params)).fetchall()
    expected = expected_case_counts(conn, table, population, slice_type, output_scope)
    top = top_work_contributions(conn, table, population, slice_type, output_scope, extra_where, extra_params)
    payload = []
    for row in rows:
        denominator = float(row["actual_denominator"] or 0)
        actual_total = float(row["actual_total"] or 0)
        absolute_total = float(row["absolute_error_total"] or 0)
        top_values = top.get((row["variant_id"], str(row["slice_id"])), (None, None, None, None))
        expected_count = expected.get(str(row["slice_id"]))
        payload.append((
            "MODEL_AVAILABLE", grain, output_scope, population, slice_type, str(row["slice_id"]),
            row["model_id"], row["variant_id"], None, row["case_count"], row["work_count"],
            expected_count, row["case_count"] / expected_count if expected_count else None,
            denominator, actual_total, row["prediction_total"], absolute_total,
            absolute_total / denominator if denominator > EPSILON else None,
            row["signed_error_total"] / denominator if denominator > EPSILON else None,
            row["prediction_total"] / actual_total if abs(actual_total) > EPSILON else None,
            row["mae"], row["rmse"], row["smape"], row["median_ape"], row["failure_rate"],
            row["catastrophe_count"], *top_values, row["zero_actual_nonzero"], row["nonzero_omission"],
        ))
    conn.executemany(metric_insert_sql(), payload)


def expected_case_counts(conn: sqlite3.Connection, table: str, population: str, slice_type: str, output_scope: str) -> dict[str, int]:
    case_table = "work_cases" if table == "work_detail" else "channel_cases"
    predicate, _ = population_predicate(population, "c")
    annual = " AND c.horizon=12 AND c.origin IN ({})".format(",".join("?" for _ in ANNUAL_H12_ORIGINS)) if slice_type == "ANNUAL_H12_YEAR" else ""
    if slice_type == "OVERALL": expression = "'ALL'"
    elif slice_type == "HORIZON": expression = "CAST(c.horizon AS TEXT)"
    elif slice_type in ("TARGET_YEAR", "ANNUAL_H12_YEAR"): expression = "CAST(c.target_year AS TEXT)"
    elif slice_type == "CASH_BAND": expression = "COALESCE(c.cash_band_id,'UNBANDED')"
    elif slice_type == "ORIGIN": expression = "c.origin"
    elif slice_type == "CHANNEL": expression = "c.channel_uid"
    elif slice_type == "CHANNEL_YEAR": expression = "c.channel_uid||'|'||c.target_year"
    elif slice_type == "CHANNEL_HORIZON": expression = "c.channel_uid||'|'||c.horizon"
    else: return {}
    rows = conn.execute(f"SELECT {expression} slice_id,COUNT(*) n FROM {case_table} c WHERE {predicate}{annual} GROUP BY slice_id", tuple(sorted(ANNUAL_H12_ORIGINS)) if annual else ()).fetchall()
    return {str(row["slice_id"]): int(row["n"]) for row in rows}


def top_work_contributions(
    conn: sqlite3.Connection,
    table: str,
    population: str,
    slice_type: str,
    output_scope: str,
    extra_where: str,
    extra_params: Sequence[Any],
) -> dict[tuple[str, str], tuple[float | None, float | None, float | None, float | None]]:
    if slice_type not in ("OVERALL", "HORIZON", "TARGET_YEAR", "ANNUAL_H12_YEAR", "CASH_BAND"):
        return {}
    if slice_type == "OVERALL": expression = "'ALL'"
    elif slice_type == "HORIZON": expression = "CAST(horizon AS TEXT)"
    elif slice_type in ("TARGET_YEAR", "ANNUAL_H12_YEAR"): expression = "CAST(target_year AS TEXT)"
    else: expression = "COALESCE(cash_band_id,'UNBANDED')"
    rows = conn.execute(f"""
      WITH by_work AS (
        SELECT variant_id,{expression} slice_id,work_id,SUM(absolute_error) work_error
        FROM {table} WHERE population_id=? AND {extra_where}
        GROUP BY variant_id,slice_id,work_id
      ), ranked AS (
        SELECT *,ROW_NUMBER() OVER(PARTITION BY variant_id,slice_id ORDER BY work_error DESC,work_id) rn,
          SUM(work_error) OVER(PARTITION BY variant_id,slice_id) total_error
        FROM by_work
      )
      SELECT variant_id,slice_id,
        SUM(CASE WHEN rn<=1 THEN work_error ELSE 0 END)/MAX(total_error) top1,
        SUM(CASE WHEN rn<=5 THEN work_error ELSE 0 END)/MAX(total_error) top5,
        SUM(CASE WHEN rn<=10 THEN work_error ELSE 0 END)/MAX(total_error) top10,
        MAX(CASE WHEN rn=1 THEN work_error ELSE 0 END)/MAX(total_error) max_one
      FROM ranked GROUP BY variant_id,slice_id
    """, (population, *extra_params)).fetchall()
    return {(row["variant_id"], str(row["slice_id"])): (row["top1"], row["top5"], row["top10"], row["max_one"]) for row in rows}


def build_common_metrics(conn: sqlite3.Connection, population: str, slice_type: str, slice_id: str, predicate: str) -> None:
    participants = [row[0] for row in conn.execute(
        f"SELECT variant_id FROM work_detail WHERE population_id=? AND {predicate} GROUP BY variant_id ORDER BY variant_id",
        (population,),
    )]
    conn.execute("DROP TABLE IF EXISTS temp.cmx_common")
    conn.execute("CREATE TEMP TABLE cmx_common(case_key TEXT PRIMARY KEY) WITHOUT ROWID")
    if participants:
        conn.execute(f"""
          INSERT INTO cmx_common
          SELECT case_key FROM work_detail
          WHERE population_id=? AND {predicate}
          GROUP BY case_key HAVING COUNT(DISTINCT variant_id)=?
        """, (population, len(participants)))
    common_count = scalar(conn, "SELECT COUNT(*) FROM cmx_common")
    common_work_count = scalar(conn, "SELECT COUNT(DISTINCT d.work_id) FROM work_detail d JOIN cmx_common c USING(case_key) WHERE d.population_id=?", (population,)) if common_count else 0
    status = "COMMON_MATCHED_AVAILABLE" if common_count else "NO_GLOBAL_COMMON_MATCHED_CASES"
    conn.execute("INSERT INTO common_set_audit VALUES (?,?,?,?,?,?,?,?,?,?)", (
        "WORK_TOTAL", "NATIVE_WORK_TOTAL", population, slice_type, slice_id,
        len(participants), json.dumps(participants, ensure_ascii=False), common_count, common_work_count, status,
    ))
    if not common_count:
        return
    rows = conn.execute(f"""
      SELECT d.variant_id,d.model_id,COUNT(*) case_count,COUNT(DISTINCT d.work_id) work_count,
        SUM(ABS(d.actual)) actual_denominator,SUM(d.actual) actual_total,SUM(d.predicted) prediction_total,
        SUM(d.absolute_error) absolute_error_total,SUM(d.signed_error) signed_error_total,
        AVG(d.absolute_error) mae,sqrt(AVG(d.squared_error)) rmse,AVG(d.sape) smape,
        median(d.ape) median_ape,SUM(CASE WHEN d.ape>=1 THEN 1 ELSE 0 END)*1.0/COUNT(*) failure_rate,
        SUM(CASE WHEN d.ape>=3 THEN 1 ELSE 0 END) catastrophe_count,
        SUM(CASE WHEN ABS(d.actual)<=1e-12 AND ABS(d.predicted)>1e-12 THEN 1 ELSE 0 END) zero_actual_nonzero,
        SUM(CASE WHEN ABS(d.actual)>1e-12 AND ABS(d.predicted)<=1e-12 THEN 1 ELSE 0 END) nonzero_omission
      FROM work_detail d JOIN cmx_common c USING(case_key)
      WHERE d.population_id=? AND {predicate}
      GROUP BY d.variant_id,d.model_id
    """, (population,)).fetchall()
    payload = []
    for row in rows:
        denominator = row["actual_denominator"] or 0
        actual_total = row["actual_total"] or 0
        ae = row["absolute_error_total"] or 0
        payload.append((
            "COMMON_MATCHED", "WORK_TOTAL", "NATIVE_WORK_TOTAL", population, slice_type, slice_id,
            row["model_id"], row["variant_id"], len(participants), row["case_count"], row["work_count"],
            common_count, 1.0, denominator, actual_total, row["prediction_total"], ae,
            ae/denominator if denominator > EPSILON else None,
            row["signed_error_total"]/denominator if denominator > EPSILON else None,
            row["prediction_total"]/actual_total if abs(actual_total)>EPSILON else None,
            row["mae"], row["rmse"], row["smape"], row["median_ape"], row["failure_rate"],
            row["catastrophe_count"], None, None, None, None,
            row["zero_actual_nonzero"], row["nonzero_omission"],
        ))
    conn.executemany(metric_insert_sql(), payload)


def build_bulk_common_channel_metrics(
    conn: sqlite3.Connection,
    population: str,
    output_scope: str,
    slice_type: str,
    *,
    fixed_horizon: int | None = None,
) -> None:
    if slice_type == "CHANNEL":
        group_expression = "channel_uid"
    elif slice_type == "CHANNEL_HORIZON":
        group_expression = "channel_uid||'|'||horizon"
    else:
        raise ValueError(f"m2_cmx01_channel_common_slice_invalid:{slice_type}")
    if fixed_horizon is not None and fixed_horizon not in (3, 6, 12, 36):
        raise ValueError("m2_cmx01_channel_common_horizon_invalid")
    horizon_filter = " AND horizon=?" if fixed_horizon is not None else ""
    qualified_horizon_filter = " AND d.horizon=?" if fixed_horizon is not None else ""
    source_params: tuple[Any, ...] = (
        (population, output_scope, fixed_horizon)
        if fixed_horizon is not None
        else (population, output_scope)
    )
    conn.executescript("""
      DROP TABLE IF EXISTS temp.cmx_channel_participants;
      DROP TABLE IF EXISTS temp.cmx_common_channel;
      CREATE TEMP TABLE cmx_channel_participants (
        group_key TEXT PRIMARY KEY,
        participant_count INTEGER NOT NULL,
        participant_variants TEXT NOT NULL
      ) WITHOUT ROWID;
      CREATE TEMP TABLE cmx_common_channel (
        group_key TEXT NOT NULL,
        channel_case_key TEXT NOT NULL,
        PRIMARY KEY(group_key,channel_case_key)
      ) WITHOUT ROWID;
    """)
    conn.execute(f"""
      INSERT INTO cmx_channel_participants
      SELECT group_key,COUNT(*) participant_count,GROUP_CONCAT(variant_id,'|')
      FROM (
        SELECT DISTINCT {group_expression} group_key,variant_id
        FROM channel_detail
        WHERE population_id=? AND model_output_scope=?{horizon_filter}
        ORDER BY group_key,variant_id
      )
      GROUP BY group_key
    """, source_params)
    conn.execute(f"""
      INSERT INTO cmx_common_channel
      SELECT {group_expression} group_key,d.channel_case_key
      FROM channel_detail d
      JOIN cmx_channel_participants p
        ON p.group_key={group_expression}
      WHERE d.population_id=? AND d.model_output_scope=?{qualified_horizon_filter}
      GROUP BY group_key,d.channel_case_key,p.participant_count
      HAVING COUNT(DISTINCT d.variant_id)=p.participant_count
    """, source_params)
    audit_rows = conn.execute(f"""
      SELECT p.group_key,p.participant_count,p.participant_variants,
        COUNT(DISTINCT c.channel_case_key) common_case_count,
        COUNT(DISTINCT CASE WHEN c.channel_case_key IS NOT NULL THEN d.work_id END) common_work_count
      FROM cmx_channel_participants p
      LEFT JOIN cmx_common_channel c ON c.group_key=p.group_key
      LEFT JOIN channel_detail d
        ON d.population_id=? AND d.model_output_scope=?
        AND d.channel_case_key=c.channel_case_key
      GROUP BY p.group_key,p.participant_count,p.participant_variants
      ORDER BY p.group_key
    """, (population, output_scope)).fetchall()
    conn.executemany(
        "INSERT INTO common_set_audit VALUES (?,?,?,?,?,?,?,?,?,?)",
        [(
            "WORK_CHANNEL", output_scope, population, slice_type, row["group_key"],
            row["participant_count"], json.dumps(row["participant_variants"].split("|"), ensure_ascii=False),
            row["common_case_count"], row["common_work_count"],
            "COMMON_MATCHED_AVAILABLE" if row["common_case_count"] else "NO_GLOBAL_COMMON_MATCHED_CASES",
        ) for row in audit_rows],
    )
    rows = conn.execute(f"""
      SELECT c.group_key,d.variant_id,d.model_id,p.participant_count,
        COUNT(*) case_count,COUNT(DISTINCT d.work_id) work_count,
        SUM(ABS(d.actual)) actual_denominator,SUM(d.actual) actual_total,
        SUM(d.predicted) prediction_total,SUM(d.absolute_error) absolute_error_total,
        SUM(d.signed_error) signed_error_total,AVG(d.absolute_error) mae,
        sqrt(AVG(d.squared_error)) rmse,AVG(d.sape) smape,median(d.ape) median_ape,
        SUM(CASE WHEN d.ape>=1 THEN 1 ELSE 0 END)*1.0/COUNT(*) failure_rate,
        SUM(CASE WHEN d.ape>=3 THEN 1 ELSE 0 END) catastrophe_count,
        SUM(CASE WHEN ABS(d.actual)<=1e-12 AND ABS(d.predicted)>1e-12 THEN 1 ELSE 0 END) zero_actual_nonzero,
        SUM(CASE WHEN ABS(d.actual)>1e-12 AND ABS(d.predicted)<=1e-12 THEN 1 ELSE 0 END) nonzero_omission
      FROM cmx_common_channel c
      JOIN cmx_channel_participants p USING(group_key)
      JOIN channel_detail d
        ON d.population_id=? AND d.model_output_scope=?
        AND d.channel_case_key=c.channel_case_key
      GROUP BY c.group_key,d.variant_id,d.model_id,p.participant_count
    """, (population, output_scope)).fetchall()
    payload = []
    for row in rows:
        denominator = row["actual_denominator"] or 0
        actual_total = row["actual_total"] or 0
        ae = row["absolute_error_total"] or 0
        payload.append((
            "COMMON_MATCHED", "WORK_CHANNEL", output_scope, population,
            slice_type, row["group_key"], row["model_id"], row["variant_id"],
            row["participant_count"], row["case_count"], row["work_count"],
            row["case_count"], 1.0, denominator, actual_total, row["prediction_total"], ae,
            ae/denominator if denominator > EPSILON else None,
            row["signed_error_total"]/denominator if denominator > EPSILON else None,
            row["prediction_total"]/actual_total if abs(actual_total)>EPSILON else None,
            row["mae"], row["rmse"], row["smape"], row["median_ape"], row["failure_rate"],
            row["catastrophe_count"], None, None, None, None,
            row["zero_actual_nonzero"], row["nonzero_omission"],
        ))
    conn.executemany(metric_insert_sql(), payload)


def build_horizon_common_allocator_channel_metrics(
    conn: sqlite3.Connection,
    population: str,
    horizon: int,
) -> None:
    work_audit = conn.execute("""
      SELECT participant_count,participant_variants_json
      FROM common_set_audit
      WHERE grain='WORK_TOTAL' AND model_output_scope='NATIVE_WORK_TOTAL'
        AND population_id=? AND slice_type='HORIZON' AND slice_id=?
    """, (population, str(horizon))).fetchone()
    if work_audit is None:
        raise ValueError(f"m2_cmx01_work_common_horizon_missing:H{horizon}")
    participant_count = int(work_audit["participant_count"])
    participant_variants_json = work_audit["participant_variants_json"]
    conn.executescript("""
      DROP TABLE IF EXISTS temp.cmx_common_work_horizon;
      DROP TABLE IF EXISTS temp.cmx_common_channel_horizon;
      CREATE TEMP TABLE cmx_common_work_horizon (
        case_key TEXT PRIMARY KEY
      ) WITHOUT ROWID;
      CREATE TEMP TABLE cmx_common_channel_horizon (
        channel_uid TEXT NOT NULL,
        channel_case_key TEXT NOT NULL,
        PRIMARY KEY(channel_uid,channel_case_key)
      ) WITHOUT ROWID;
    """)
    conn.execute("""
      INSERT INTO cmx_common_work_horizon
      SELECT case_key FROM work_detail
      WHERE population_id=? AND horizon=?
      GROUP BY case_key HAVING COUNT(DISTINCT variant_id)=?
    """, (population, horizon, participant_count))
    conn.execute("""
      INSERT INTO cmx_common_channel_horizon
      SELECT d.channel_uid,d.channel_case_key
      FROM channel_detail d
      JOIN cmx_common_work_horizon w USING(case_key)
      WHERE d.population_id=?
        AND d.model_output_scope='COMMON_ALLOCATOR_DIAGNOSTIC'
        AND d.horizon=?
      GROUP BY d.channel_uid,d.channel_case_key
      HAVING COUNT(DISTINCT d.variant_id)=?
    """, (population, horizon, participant_count))
    channel_rows = conn.execute("""
      SELECT u.channel_uid,COUNT(DISTINCT c.channel_case_key) common_case_count,
        COUNT(DISTINCT CASE WHEN c.channel_case_key IS NOT NULL THEN b.work_id END) common_work_count
      FROM (
        SELECT DISTINCT channel_uid FROM channel_cases
        WHERE dynamic_core80=1 AND horizon=?
      ) u
      LEFT JOIN cmx_common_channel_horizon c USING(channel_uid)
      LEFT JOIN channel_cases b ON b.channel_case_key=c.channel_case_key
      GROUP BY u.channel_uid ORDER BY u.channel_uid
    """, (horizon,)).fetchall()
    conn.executemany(
        "INSERT INTO common_set_audit VALUES (?,?,?,?,?,?,?,?,?,?)",
        [(
            "WORK_CHANNEL", "COMMON_ALLOCATOR_DIAGNOSTIC", population,
            "CHANNEL_HORIZON", f"{row['channel_uid']}|{horizon}",
            participant_count, participant_variants_json,
            row["common_case_count"], row["common_work_count"],
            "COMMON_MATCHED_AVAILABLE" if row["common_case_count"] else "NO_GLOBAL_COMMON_MATCHED_CASES",
        ) for row in channel_rows],
    )
    rows = conn.execute("""
      SELECT c.channel_uid,d.variant_id,d.model_id,COUNT(*) case_count,
        COUNT(DISTINCT d.work_id) work_count,SUM(ABS(d.actual)) actual_denominator,
        SUM(d.actual) actual_total,SUM(d.predicted) prediction_total,
        SUM(d.absolute_error) absolute_error_total,SUM(d.signed_error) signed_error_total,
        AVG(d.absolute_error) mae,sqrt(AVG(d.squared_error)) rmse,
        AVG(d.sape) smape,median(d.ape) median_ape,
        SUM(CASE WHEN d.ape>=1 THEN 1 ELSE 0 END)*1.0/COUNT(*) failure_rate,
        SUM(CASE WHEN d.ape>=3 THEN 1 ELSE 0 END) catastrophe_count,
        SUM(CASE WHEN ABS(d.actual)<=1e-12 AND ABS(d.predicted)>1e-12 THEN 1 ELSE 0 END) zero_actual_nonzero,
        SUM(CASE WHEN ABS(d.actual)>1e-12 AND ABS(d.predicted)<=1e-12 THEN 1 ELSE 0 END) nonzero_omission
      FROM cmx_common_channel_horizon c
      JOIN channel_detail d
        ON d.population_id=?
        AND d.model_output_scope='COMMON_ALLOCATOR_DIAGNOSTIC'
        AND d.channel_case_key=c.channel_case_key
      GROUP BY c.channel_uid,d.variant_id,d.model_id
    """, (population,)).fetchall()
    payload = []
    for row in rows:
        denominator = row["actual_denominator"] or 0
        actual_total = row["actual_total"] or 0
        ae = row["absolute_error_total"] or 0
        payload.append((
            "COMMON_MATCHED", "WORK_CHANNEL", "COMMON_ALLOCATOR_DIAGNOSTIC",
            population, "CHANNEL_HORIZON", f"{row['channel_uid']}|{horizon}",
            row["model_id"], row["variant_id"], participant_count,
            row["case_count"], row["work_count"], row["case_count"], 1.0,
            denominator, actual_total, row["prediction_total"], ae,
            ae/denominator if denominator > EPSILON else None,
            row["signed_error_total"]/denominator if denominator > EPSILON else None,
            row["prediction_total"]/actual_total if abs(actual_total)>EPSILON else None,
            row["mae"], row["rmse"], row["smape"], row["median_ape"],
            row["failure_rate"], row["catastrophe_count"],
            None, None, None, None, row["zero_actual_nonzero"], row["nonzero_omission"],
        ))
    conn.executemany(metric_insert_sql(), payload)


def metric_insert_sql() -> str:
    return "INSERT INTO metric_summary VALUES (" + ",".join("?" for _ in range(32)) + ")"


def compute_bootstrap_and_pairwise(conn: sqlite3.Connection, checkpoint: dict[str, Any], source_hashes: dict[str, str]) -> None:
    if phase_done(checkpoint, "pairwise_bootstrap"):
        return
    conn.execute("DELETE FROM pairwise_comparison")
    conn.execute("DELETE FROM bootstrap_comparison")
    population = "ORIGIN_VISIBLE_DYNAMIC_CORE80"
    variants = [row[0] for row in conn.execute("SELECT DISTINCT variant_id FROM work_detail WHERE population_id=? ORDER BY variant_id", (population,))]
    for left_index, left in enumerate(variants):
        for right in variants[left_index + 1:]:
            point = pairwise_point(conn, population, left, right)
            conn.execute("INSERT INTO pairwise_comparison VALUES (?,?,?,?,?,?,?,?,?)", point)
    bootstrap_rows: list[dict[str, Any]] = []
    for candidate in variants:
        if candidate == LG_VARIANT:
            continue
        result = paired_bootstrap(conn, population, LG_VARIANT, candidate)
        bootstrap_rows.append(result)
    adjusted = holm_adjust([row["empirical_two_sided_p"] for row in bootstrap_rows])
    for row, adjusted_p in zip(bootstrap_rows, adjusted):
        conn.execute("INSERT INTO bootstrap_comparison VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (
            population, LG_VARIANT, row["candidate_variant_id"], row["matched_case_count"],
            row["block_count"], BOOTSTRAP_ITERATIONS, BOOTSTRAP_SEED,
            row["point_difference"], row["lower95"], row["median"], row["upper95"],
            row["probability_better"], row["probability_noninferior"],
            row["empirical_two_sided_p"], adjusted_p,
        ))
    conn.commit()
    mark_phase(checkpoint, source_hashes, "pairwise_bootstrap")


def pairwise_point(conn: sqlite3.Connection, population: str, left: str, right: str) -> tuple[Any, ...]:
    row = conn.execute("""
      SELECT COUNT(*) n,COUNT(DISTINCT a.work_id) works,SUM(ABS(a.actual)) denominator,
        SUM(a.absolute_error) left_error,SUM(b.absolute_error) right_error
      FROM work_detail a JOIN work_detail b
        ON b.population_id=a.population_id AND b.case_key=a.case_key
      WHERE a.population_id=? AND a.variant_id=? AND b.variant_id=?
    """, (population, left, right)).fetchone()
    n = int(row["n"])
    denominator = float(row["denominator"] or 0)
    left_wape = float(row["left_error"])/denominator if denominator > EPSILON else None
    right_wape = float(row["right_error"])/denominator if denominator > EPSILON else None
    relative_fva = (left_wape-right_wape)/left_wape if left_wape and right_wape is not None else None
    return (population, left, right, n, int(row["works"]), left_wape, right_wape,
            right_wape-left_wape if left_wape is not None and right_wape is not None else None, relative_fva)


def paired_bootstrap(conn: sqlite3.Connection, population: str, baseline: str, candidate: str) -> dict[str, Any]:
    rows = conn.execute("""
      SELECT a.work_id,a.origin,SUM(ABS(a.actual)) denominator,
        SUM(a.absolute_error) baseline_error,SUM(b.absolute_error) candidate_error,
        COUNT(*) case_count
      FROM work_detail a JOIN work_detail b
        ON b.population_id=a.population_id AND b.case_key=a.case_key
      WHERE a.population_id=? AND a.variant_id=? AND b.variant_id=?
      GROUP BY a.work_id,a.origin ORDER BY a.work_id,a.origin
    """, (population, baseline, candidate)).fetchall()
    if not rows:
        raise ValueError(f"m2_cmx01_lg_pairwise_overlap_missing:{candidate}")
    denominator = np.asarray([row["denominator"] for row in rows], dtype=np.float64)
    baseline_error = np.asarray([row["baseline_error"] for row in rows], dtype=np.float64)
    candidate_error = np.asarray([row["candidate_error"] for row in rows], dtype=np.float64)
    point_baseline = baseline_error.sum()/denominator.sum()
    point_candidate = candidate_error.sum()/denominator.sum()
    rng = np.random.default_rng(BOOTSTRAP_SEED)
    differences = np.empty(BOOTSTRAP_ITERATIONS, dtype=np.float64)
    chunk = 100
    block_count = len(rows)
    for start in range(0, BOOTSTRAP_ITERATIONS, chunk):
        size = min(chunk, BOOTSTRAP_ITERATIONS-start)
        indices = rng.integers(0, block_count, size=(size, block_count), endpoint=False)
        sampled_denominator = denominator[indices].sum(axis=1)
        sampled_baseline = baseline_error[indices].sum(axis=1)/sampled_denominator
        sampled_candidate = candidate_error[indices].sum(axis=1)/sampled_denominator
        differences[start:start+size] = sampled_candidate-sampled_baseline
    less_equal = (np.count_nonzero(differences <= 0)+1)/(BOOTSTRAP_ITERATIONS+1)
    greater_equal = (np.count_nonzero(differences >= 0)+1)/(BOOTSTRAP_ITERATIONS+1)
    return {
        "candidate_variant_id": candidate,
        "matched_case_count": sum(int(row["case_count"]) for row in rows),
        "block_count": block_count,
        "point_difference": point_candidate-point_baseline,
        "lower95": float(np.quantile(differences, 0.025)),
        "median": float(np.quantile(differences, 0.5)),
        "upper95": float(np.quantile(differences, 0.975)),
        "probability_better": float(np.mean(differences < 0)),
        "probability_noninferior": float(np.mean(differences <= 0)),
        "empirical_two_sided_p": min(1.0, 2*min(less_equal, greater_equal)),
    }


def holm_adjust(p_values: Sequence[float]) -> list[float]:
    order = sorted(range(len(p_values)), key=lambda index: p_values[index])
    adjusted = [1.0]*len(p_values)
    running = 0.0
    total = len(p_values)
    for rank, index in enumerate(order):
        value = min(1.0, (total-rank)*p_values[index])
        running = max(running, value)
        adjusted[index] = running
    return adjusted


def build_private_ledgers(conn: sqlite3.Connection, checkpoint: dict[str, Any], source_hashes: dict[str, str]) -> None:
    if phase_done(checkpoint, "private_ledgers"):
        return
    export_query_csv(conn, OVERVIEW_CSV, """
      SELECT m.*,v.display_zh,v.display_en FROM metric_summary m
      JOIN model_variants v USING(variant_id)
      ORDER BY grain,model_output_scope,population_id,comparison_set,slice_type,slice_id,wape,variant_id
    """)
    export_query_csv(conn, WORK_LEDGER_CSV, """
      WITH scored AS (
        SELECT population_id,work_id,work_title,model_id,model_version,variant_id,
          COUNT(*) case_count,SUM(ABS(actual)) actual_denominator,SUM(actual) actual_total,
          SUM(predicted) prediction_total,SUM(absolute_error) absolute_error_total,
          SUM(signed_error) signed_error_total,
          SUM(CASE WHEN ape>=1 THEN 1 ELSE 0 END) failure_count,
          SUM(CASE WHEN ape>=3 THEN 1 ELSE 0 END) catastrophe_count,
          MAX(absolute_error) maximum_error
        FROM work_detail GROUP BY population_id,work_id,work_title,model_id,model_version,variant_id
      ), ranked AS (
        SELECT *,
          CASE WHEN actual_denominator>1e-12 THEN absolute_error_total/actual_denominator END wape,
          CASE WHEN actual_denominator>1e-12 THEN signed_error_total/actual_denominator END signed_bias,
          RANK() OVER(PARTITION BY population_id,work_id ORDER BY
            CASE WHEN actual_denominator>1e-12 THEN absolute_error_total/actual_denominator ELSE 1e99 END,
            ABS(signed_error_total),variant_id) cumulative_rank
        FROM scored
      )
      SELECT * FROM ranked ORDER BY population_id,work_title,work_id,cumulative_rank,variant_id
    """)
    export_query_csv(conn, CHANNEL_LEDGER_CSV, """
      WITH scored AS (
        SELECT population_id,model_output_scope,work_id,work_title,channel_uid,channel_name,
          model_id,model_version,variant_id,allocator_id,COUNT(*) case_count,
          SUM(ABS(actual)) actual_denominator,SUM(actual) actual_total,SUM(predicted) prediction_total,
          SUM(absolute_error) absolute_error_total,SUM(signed_error) signed_error_total,
          SUM(CASE WHEN ape>=1 THEN 1 ELSE 0 END) failure_count,
          SUM(CASE WHEN ape>=3 THEN 1 ELSE 0 END) catastrophe_count,MAX(absolute_error) maximum_error
        FROM channel_detail
        GROUP BY population_id,model_output_scope,work_id,work_title,channel_uid,channel_name,
          model_id,model_version,variant_id,allocator_id
      ), ranked AS (
        SELECT *,CASE WHEN actual_denominator>1e-12 THEN absolute_error_total/actual_denominator END wape,
          CASE WHEN actual_denominator>1e-12 THEN signed_error_total/actual_denominator END signed_bias,
          RANK() OVER(PARTITION BY population_id,model_output_scope,work_id,channel_uid ORDER BY
            CASE WHEN actual_denominator>1e-12 THEN absolute_error_total/actual_denominator ELSE 1e99 END,
            ABS(signed_error_total),variant_id) cumulative_rank
        FROM scored
      )
      SELECT * FROM ranked ORDER BY population_id,model_output_scope,work_title,work_id,channel_name,channel_uid,cumulative_rank,variant_id
    """)
    mark_phase(checkpoint, source_hashes, "private_ledgers")


WORK_DETAIL_COLUMNS = (
    "case_id", "forecast_origin", "target_start", "target_end", "target_year", "horizon",
    "population", "dynamic_core80_flag", "annual_actual_core80_flag", "cash_band",
    "work_id", "work_title", "channel_id", "channel_name", "model_id", "model_version",
    "model_variant_id", "model_output_scope", "native_or_composite", "allocator_id",
    "actual_cash", "predicted_cash", "signed_error", "absolute_error", "ape", "sape",
    "absolute_error_contribution", "model_rank_for_same_case", "best_model_for_same_case",
    "coverage_status", "origin_safe_status", "data_authority", "invalid_or_diagnostic_reason",
)
CHANNEL_DETAIL_COLUMNS = WORK_DETAIL_COLUMNS


def export_detail_csv(conn: sqlite3.Connection, checkpoint: dict[str, Any], source_hashes: dict[str, str]) -> None:
    if not phase_done(checkpoint, "work_csv"):
        if not any(phase.startswith("work_csv:") for phase in checkpoint.get("completedPhases", [])):
            ensure_clean_partition_root(WORK_CSV_ROOT)
        export_partitioned_query(
            conn, "work_detail", WORK_CSV_ROOT, channel=False,
            checkpoint=checkpoint, source_hashes=source_hashes,
        )
        mark_phase(checkpoint, source_hashes, "work_csv")
    if not phase_done(checkpoint, "channel_csv"):
        if not any(phase.startswith("channel_csv:") for phase in checkpoint.get("completedPhases", [])):
            ensure_clean_partition_root(CHANNEL_CSV_ROOT)
        export_partitioned_query(
            conn, "channel_detail", CHANNEL_CSV_ROOT, channel=True,
            checkpoint=checkpoint, source_hashes=source_hashes,
        )
        mark_phase(checkpoint, source_hashes, "channel_csv")


def export_partitioned_query(
    conn: sqlite3.Connection,
    table: str,
    root: Path,
    *,
    channel: bool,
    checkpoint: dict[str, Any],
    source_hashes: dict[str, str],
) -> None:
    scopes = [row[0] for row in conn.execute(f"SELECT DISTINCT model_output_scope FROM {table} ORDER BY 1")] if channel else [None]
    for year in range(2020, 2026):
        for horizon in (3, 6, 12, 36):
            for scope in scopes:
                where = "target_year=? AND horizon=?"
                params: list[Any] = [year, horizon]
                if scope is not None:
                    where += " AND model_output_scope=?"
                    params.append(scope)
                count = scalar(conn, f"SELECT COUNT(*) FROM {table} WHERE {where}", tuple(params))
                if not count:
                    continue
                filename = f"year={year}__horizon=H{horizon}"
                if scope:
                    filename += f"__scope={scope}"
                path = root / f"{filename}.csv"
                phase_prefix = "channel_csv" if channel else "work_csv"
                phase = f"{phase_prefix}:{filename}"
                if phase_done(checkpoint, phase):
                    if not path.is_file() or path.stat().st_size == 0:
                        raise ValueError(f"m2_cmx01_checkpoint_partition_missing:{filename}")
                    continue
                if channel:
                    detail_where = "d.target_year=? AND d.horizon=? AND d.model_output_scope=?"
                    sql = f"""
                    WITH ranked AS (
                      SELECT d.*,m.absolute_error_total overall_absolute_error_total,
                        RANK() OVER (
                          PARTITION BY d.population_id,d.model_output_scope,d.channel_case_key
                          ORDER BY d.absolute_error,ABS(d.signed_error),d.variant_id
                        ) model_rank_for_same_case,
                        FIRST_VALUE(d.variant_id) OVER (
                          PARTITION BY d.population_id,d.model_output_scope,d.channel_case_key
                          ORDER BY d.absolute_error,ABS(d.signed_error),d.variant_id
                        ) best_model_for_same_case
                      FROM channel_detail d LEFT JOIN metric_summary m
                        ON m.comparison_set='MODEL_AVAILABLE' AND m.grain='WORK_CHANNEL'
                        AND m.model_output_scope=d.model_output_scope
                        AND m.population_id=d.population_id AND m.slice_type='OVERALL'
                        AND m.slice_id='ALL' AND m.variant_id=d.variant_id
                      WHERE {detail_where}
                    )
                    SELECT channel_case_id case_id,origin forecast_origin,target_start,target_end,target_year,horizon,
                      population_id population,dynamic_core80 dynamic_core80_flag,
                      annual_actual_core80 annual_actual_core80_flag,cash_band_id cash_band,
                      work_id,work_title,channel_uid channel_id,channel_name,model_id,model_version,
                      variant_id model_variant_id,model_output_scope,native_or_composite,allocator_id,
                      actual actual_cash,predicted predicted_cash,signed_error,absolute_error,ape,sape,
                      CASE WHEN overall_absolute_error_total>0
                        THEN absolute_error/overall_absolute_error_total ELSE 0 END absolute_error_contribution,
                      model_rank_for_same_case,best_model_for_same_case,
                      coverage_status,origin_safe_status,data_authority,invalid_or_diagnostic_reason
                    FROM ranked
                    ORDER BY population_id,channel_case_key,model_rank_for_same_case,variant_id
                    """
                else:
                    sql = f"""
                    WITH ranked AS (
                      SELECT d.*,m.absolute_error_total overall_absolute_error_total,
                        RANK() OVER (
                          PARTITION BY d.population_id,d.case_key
                          ORDER BY d.absolute_error,ABS(d.signed_error),d.variant_id
                        ) model_rank_for_same_case,
                        FIRST_VALUE(d.variant_id) OVER (
                          PARTITION BY d.population_id,d.case_key
                          ORDER BY d.absolute_error,ABS(d.signed_error),d.variant_id
                        ) best_model_for_same_case
                      FROM work_detail d LEFT JOIN metric_summary m
                        ON m.comparison_set='MODEL_AVAILABLE' AND m.grain='WORK_TOTAL'
                        AND m.model_output_scope='NATIVE_WORK_TOTAL'
                        AND m.population_id=d.population_id AND m.slice_type='OVERALL'
                        AND m.slice_id='ALL' AND m.variant_id=d.variant_id
                      WHERE {where}
                    )
                    SELECT case_id,origin forecast_origin,target_start,target_end,target_year,horizon,
                      population_id population,dynamic_core80 dynamic_core80_flag,
                      annual_actual_core80 annual_actual_core80_flag,cash_band_id cash_band,
                      work_id,work_title,NULL channel_id,NULL channel_name,model_id,model_version,
                      variant_id model_variant_id,model_output_scope,native_or_composite,allocator_id,
                      actual actual_cash,predicted predicted_cash,signed_error,absolute_error,ape,sape,
                      CASE WHEN overall_absolute_error_total>0
                        THEN absolute_error/overall_absolute_error_total ELSE 0 END absolute_error_contribution,
                      model_rank_for_same_case,best_model_for_same_case,
                      coverage_status,origin_safe_status,data_authority,invalid_or_diagnostic_reason
                    FROM ranked
                    ORDER BY population_id,case_key,model_rank_for_same_case,variant_id
                    """
                export_query_csv(conn, path, sql, tuple(params))
                mark_phase(checkpoint, source_hashes, phase)


def build_private_summary(conn: sqlite3.Connection, source_hashes: dict[str, str]) -> dict[str, Any]:
    integrity = [dict(row) for row in conn.execute("SELECT * FROM integrity_audit ORDER BY audit_id")]
    universe = {
        "originHorizonCells": scalar(conn, "SELECT COUNT(*) FROM (SELECT DISTINCT origin,horizon FROM work_cases)"),
        "origins": scalar(conn, "SELECT COUNT(DISTINCT origin) FROM work_cases"),
        "works": scalar(conn, "SELECT COUNT(DISTINCT work_id) FROM work_cases"),
        "channels": scalar(conn, "SELECT COUNT(DISTINCT channel_uid) FROM channel_cases"),
        "workCases": scalar(conn, "SELECT COUNT(*) FROM work_cases"),
        "workChannelCases": scalar(conn, "SELECT COUNT(*) FROM channel_cases"),
        "workPredictionRows": scalar(conn, "SELECT COUNT(*) FROM work_predictions"),
        "nativeChannelPredictionRows": scalar(conn, "SELECT COUNT(*) FROM native_channel_predictions"),
        "populationWorkDetailRows": scalar(conn, "SELECT COUNT(*) FROM work_detail"),
        "populationChannelDetailRows": scalar(conn, "SELECT COUNT(*) FROM channel_detail"),
    }
    return {
        "schema": SCHEMA_VERSION,
        "status": FINAL_STATUS,
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "sourceHashes": source_hashes,
        "universe": universe,
        "variants": [v.__dict__ for v in VARIANTS],
        "integrity": integrity,
        "database": DB_PATH.name,
        "workDetailPartitions": len(list(WORK_CSV_ROOT.glob("*.csv"))),
        "channelDetailPartitions": len(list(CHANNEL_CSV_ROOT.glob("*.csv"))),
        "boundaries": {
            "modelFittingOrTuningPerformedByEvaluator": False,
            "psc03Rerun": False,
            "hpsr02Rerun": False,
            "finalHoldoutOpened": False,
            "productionAuthorized": False,
            "automationAuthorized": False,
            "m3FormalAuthorized": False,
        },
    }


def build_public_payload(conn: sqlite3.Connection, private: dict[str, Any], source_hashes: dict[str, str]) -> dict[str, Any]:
    contract = read_json(CONTRACT_PATH)
    eligibility = read_json(ELIGIBILITY_PATH)
    model_available = public_metrics(conn, "MODEL_AVAILABLE", "WORK_TOTAL", "NATIVE_WORK_TOTAL")
    common = public_metrics(conn, "COMMON_MATCHED", "WORK_TOTAL", "NATIVE_WORK_TOTAL")
    common_audit = [
        {
            "populationId": row["population_id"], "sliceType": row["slice_type"],
            "sliceId": row["slice_id"], "participantCount": row["participant_count"],
            "commonCaseCount": row["common_case_count"], "commonWorkCount": row["common_work_count"],
            "status": row["status"],
        }
        for row in conn.execute("SELECT * FROM common_set_audit ORDER BY population_id,slice_type,slice_id")
    ]
    bootstrap = [sanitize_bootstrap(dict(row)) for row in conn.execute("SELECT * FROM bootstrap_comparison ORDER BY candidate_variant_id")]
    channel = build_public_channel_leaderboards(conn)
    conclusions = derive_conclusions(conn, common, bootstrap, channel)
    hpsr02 = frozen_hpsr02_appendix()
    psc03 = frozen_psc03_appendix()
    payload = {
        "schema": "m2.cmx01.public_evaluation.v0.1",
        "asOf": time.strftime("%Y-%m-%d", time.gmtime()),
        "campaignId": "M2-CMX01",
        "displayNameZh": "2020–2025 Core80 全模型真实业务横评 v0.1",
        "displayNameEn": "M2 Core80 Cross-Model Real-Business Evaluation v0.1",
        "status": FINAL_STATUS,
        "historicalChampionStatus": conclusions["historicalChampionStatus"],
        "activityType": "HISTORICAL_CROSS_MODEL_EVALUATION_NOT_MODEL_DEVELOPMENT",
        "authority": {
            "actualDefinitionId": contract["authority"]["actualDefinitionId"],
            "registryEntryCount": eligibility["registryModelCount"],
            "formalEligibleRegisteredModelCount": eligibility["summary"]["formalEligibleModelCount"],
            "formalEvaluationVariantCount": len(VARIANTS),
            "sourceSnapshotId": contract["sourceSnapshot"]["snapshotId"],
            "sourceSnapshotHashes": {
                key: value for key, value in contract["sourceSnapshot"].items()
                if key.endswith("Sha256")
            },
            "privateReplayArtifactSetSha256": sha256_canonical(
                sorted(source_hashes.values())
            ),
        },
        "universe": private["universe"],
        "originGrid": contract["evaluationWindow"],
        "populations": list(POPULATIONS),
        "variants": [{
            "modelId": v.model_id, "modelVersion": v.version, "modelVariantId": v.variant_id,
            "displayNameZh": v.display_zh, "displayNameEn": v.display_en,
            "objectType": v.object_type,
            "predictionGrain": "WORK_CHANNEL_AND_CONSERVED_WORK_TOTAL" if v.native_work_channel else "WORK_TOTAL",
        } for v in VARIANTS],
        "excludedRegistryEntries": [{
            "modelId": row["modelId"], "displayNameZh": row["displayNameZh"],
            "displayNameEn": row["displayNameEn"], "status": row["status"],
            "reasonCode": row["reasonCode"], "diagnosticReplayPlanned": row["diagnosticReplayPlanned"],
        } for row in eligibility["models"] if not row["formalRankingEligible"]],
        "integrity": [{
            "auditId": row["audit_id"], "status": row["status"],
            "observedValue": public_audit_value(row["audit_id"], row["observed_value"]),
            "expectedValue": row["expected_value"],
        } for row in private["integrity"]],
        "comparison": {
            "modelAvailable": model_available,
            "commonMatched": common,
            "commonSetAudit": common_audit,
            "lg01PairedBootstrap": bootstrap,
            "channelLeaderboards": channel,
        },
        "frozenRecentWindowAppendix": hpsr02,
        "forensicAppendix": psc03,
        "conclusions": conclusions,
        "privacy": {
            "minimumCaseCount": contract["privacy"]["publicMinimumCaseCount"],
            "minimumWorkCount": contract["privacy"]["publicMinimumWorkCount"],
            "absoluteScaleMetrics": "PRIVATE_ONLY_NOT_PUBLISHED",
            "rowLevelIdentityOrCashPublished": False,
            "privateOutputClass": "PRIVATE_DERIVED_CACHE",
        },
        "boundaries": private["boundaries"],
    }
    payload["canonicalPayloadSha256"] = sha256_canonical(payload)
    return payload


def public_metrics(conn: sqlite3.Connection, comparison: str, grain: str, scope: str) -> list[dict[str, Any]]:
    rows = conn.execute("""
      SELECT * FROM metric_summary WHERE comparison_set=? AND grain=? AND model_output_scope=?
      ORDER BY population_id,slice_type,slice_id,wape,ABS(signed_bias),catastrophe_count,variant_id
    """, (comparison, grain, scope)).fetchall()
    output: list[dict[str, Any]] = []
    for row in rows:
        if row["case_count"] < 30 or row["work_count"] < 20:
            continue
        output.append({
            "populationId": row["population_id"], "sliceType": row["slice_type"], "sliceId": row["slice_id"],
            "modelId": row["model_id"], "modelVariantId": row["variant_id"],
            "caseCount": row["case_count"], "workCount": row["work_count"],
            "expectedCaseCount": row["expected_case_count"], "coverage": row["coverage"],
            "wape": row["wape"], "signedBias": row["signed_bias"],
            "predictedActualRatio": row["predicted_actual_ratio"], "smape": row["smape"],
            "medianApeNonzeroActual": row["median_ape_nonzero"], "failureRate": row["failure_rate"],
            "catastropheCount": row["catastrophe_count"],
            "top1WorkAbsoluteErrorContribution": row["top1_work_error_contribution"],
            "top5WorkAbsoluteErrorContribution": row["top5_work_error_contribution"],
            "top10WorkAbsoluteErrorContribution": row["top10_work_error_contribution"],
            "maximumWorkAbsoluteErrorContribution": row["maximum_work_error_contribution"],
            "mae": "PRIVATE_ONLY_ABSOLUTE_SCALE", "rmse": "PRIVATE_ONLY_ABSOLUTE_SCALE",
        })
    return output


def build_public_channel_leaderboards(conn: sqlite3.Connection) -> dict[str, Any]:
    result: dict[str, Any] = {"native": [], "commonAllocatorDiagnostic": []}
    for scope, key in (("NATIVE_WORK_CHANNEL", "native"), ("COMMON_ALLOCATOR_DIAGNOSTIC", "commonAllocatorDiagnostic")):
        for uid, label in MAJOR_CHANNELS.items():
            rows = conn.execute("""
              SELECT * FROM metric_summary
              WHERE comparison_set='COMMON_MATCHED' AND grain='WORK_CHANNEL'
                AND model_output_scope=? AND population_id='ORIGIN_VISIBLE_DYNAMIC_CORE80'
                AND slice_type='CHANNEL' AND slice_id=?
              ORDER BY wape,ABS(signed_bias),catastrophe_count,variant_id
            """, (scope, uid)).fetchall()
            public_rows = []
            for row in rows:
                if row["case_count"] < 30 or row["work_count"] < 20:
                    continue
                public_rows.append({
                    "rank": len(public_rows)+1, "modelId": row["model_id"],
                    "modelVariantId": row["variant_id"], "caseCount": row["case_count"],
                    "workCount": row["work_count"], "coverage": row["coverage"],
                    "wape": row["wape"], "signedBias": row["signed_bias"],
                    "predictedActualRatio": row["predicted_actual_ratio"],
                    "failureRate": row["failure_rate"], "catastropheCount": row["catastrophe_count"],
                })
            audit = conn.execute("""
              SELECT participant_count,common_case_count,common_work_count,status
              FROM common_set_audit WHERE grain='WORK_CHANNEL' AND model_output_scope=?
                AND population_id='ORIGIN_VISIBLE_DYNAMIC_CORE80'
                AND slice_type='CHANNEL' AND slice_id=?
            """, (scope, uid)).fetchone()
            entry: dict[str, Any] = {
                "businessChannel": label,
                "status": "PUBLISHED_COMMON_MATCHED_PRIVACY_THRESHOLD_PASS" if public_rows else (
                    audit["status"] if audit and audit["common_case_count"] == 0
                    else "HORIZON_SPECIFIC_ONLY_NO_ALL_HORIZON_COMMON_LEADERBOARD"
                    if scope == "COMMON_ALLOCATOR_DIAGNOSTIC"
                    else "SUPPRESSED_PRIVACY_THRESHOLD"
                ),
                "participantCount": audit["participant_count"] if audit else 0,
                "commonCaseCount": audit["common_case_count"] if audit else 0,
                "commonWorkCount": audit["common_work_count"] if audit else 0,
                "leaderboard": public_rows,
            }
            if scope == "COMMON_ALLOCATOR_DIAGNOSTIC":
                entry["horizonLeaderboards"] = []
                for horizon in (3, 6, 12, 36):
                    horizon_rows = conn.execute("""
                      SELECT * FROM metric_summary
                      WHERE comparison_set='COMMON_MATCHED' AND grain='WORK_CHANNEL'
                        AND model_output_scope='COMMON_ALLOCATOR_DIAGNOSTIC'
                        AND population_id='ORIGIN_VISIBLE_DYNAMIC_CORE80'
                        AND slice_type='CHANNEL_HORIZON' AND slice_id=?
                      ORDER BY wape,ABS(signed_bias),catastrophe_count,variant_id
                    """, (f"{uid}|{horizon}",)).fetchall()
                    publishable = [row for row in horizon_rows if row["case_count"] >= 30 and row["work_count"] >= 20]
                    entry["horizonLeaderboards"].append({
                        "horizon": f"H{horizon}",
                        "status": "PUBLISHED_COMMON_MATCHED_PRIVACY_THRESHOLD_PASS" if publishable else "NO_PUBLISHABLE_COMMON_MATCHED_RESULT",
                        "winner": ({
                            "modelId": publishable[0]["model_id"],
                            "modelVariantId": publishable[0]["variant_id"],
                            "wape": publishable[0]["wape"],
                            "caseCount": publishable[0]["case_count"],
                            "workCount": publishable[0]["work_count"],
                        } if publishable else None),
                    })
            result[key].append(entry)
    return result


def derive_conclusions(conn: sqlite3.Connection, common: list[dict[str, Any]], bootstrap: list[dict[str, Any]], channel: dict[str, Any]) -> dict[str, Any]:
    formal_population = "ORIGIN_VISIBLE_DYNAMIC_CORE80"
    overall_audit = conn.execute("""
      SELECT * FROM common_set_audit WHERE population_id=? AND slice_type='OVERALL' AND slice_id='ALL'
    """, (formal_population,)).fetchone()
    horizon_winners = {}
    for horizon in (3, 6, 12, 36):
        rows = [r for r in common if r["populationId"] == formal_population and r["sliceType"] == "HORIZON" and r["sliceId"] == str(horizon)]
        horizon_winners[f"H{horizon}"] = winner_summary(rows)
    annual_winners = {}
    for year in range(2020, 2026):
        rows = [r for r in common if r["populationId"] == formal_population and r["sliceType"] == "ANNUAL_H12_YEAR" and r["sliceId"] == str(year)]
        annual_winners[str(year)] = winner_summary(rows)
    model_available_overall = [r for r in public_metrics(conn, "MODEL_AVAILABLE", "WORK_TOTAL", "NATIVE_WORK_TOTAL") if r["populationId"] == formal_population and r["sliceType"] == "OVERALL"]
    lg_rows = [r for r in model_available_overall if r["modelVariantId"] == LG_VARIANT]
    statistically_better = [r for r in bootstrap if r["upper95CandidateMinusLg01"] < 0 and r["holmAdjustedP"] < 0.05]
    winners = {value.get("modelVariantId") for value in horizon_winners.values() if value.get("modelVariantId")}
    stable_single = len(winners) == 1 and all(value.get("status") == "COMMON_MATCHED_WINNER" for value in horizon_winners.values())
    historical_champion = next(iter(winners)) if stable_single and statistically_better else None
    annual_flip = len({value.get("modelVariantId") for value in annual_winners.values() if value.get("modelVariantId")}) > 1
    horizon_flip = len(winners) > 1
    major_channel_winners = {
        row["businessChannel"]: (row["leaderboard"][0]["modelVariantId"] if row["leaderboard"] else None)
        for row in channel["native"]
    }
    channel_flip = len({value for value in major_channel_winners.values() if value}) > 1
    return {
        "globalAllVariantCommonSetStatus": overall_audit["status"],
        "globalAllVariantCommonCaseCount": overall_audit["common_case_count"],
        "globalAllVariantWinner": None,
        "reasonGlobalWinnerUnavailable": "INCOMPATIBLE_FROZEN_HORIZON_AND_ORIGIN_SUPPORTS_NO_ALL_VARIANT_INTERSECTION" if not overall_audit["common_case_count"] else None,
        "horizonWinners": horizon_winners,
        "annualH12Winners": annual_winners,
        "majorNativeChannelWinners": major_channel_winners,
        "lg01ModelAvailableOverall": lg_rows[0] if lg_rows else None,
        "lg01PairwiseSignificantlyOutperformedBy": [r["candidateModelVariantId"] for r in statistically_better],
        "yearRankingFlip": annual_flip,
        "horizonRankingFlip": horizon_flip,
        "majorChannelRankingFlip": channel_flip,
        "stableHistoricalCandidateBetterThanLg01": historical_champion,
        "historicalChampionStatus": HISTORICAL_CHAMPION_STATUS if historical_champion else "NO_UNIFIED_HISTORICAL_CHAMPION_IDENTIFIED",
        "decision": "DIFFERENT_MODELS_FIT_DIFFERENT_BUSINESS_SLICES" if (annual_flip or horizon_flip or channel_flip) else "NO_STABLE_SUPERIORITY_ESTABLISHED",
        "activationDecision": "HISTORICAL_ONLY_NOT_ACTIVATED",
    }


def winner_summary(rows: list[dict[str, Any]]) -> dict[str, Any]:
    if not rows:
        return {"status": "NO_PRIVACY_ELIGIBLE_COMMON_MATCHED_RESULT", "modelVariantId": None}
    ordered = sorted(rows, key=lambda row: (float("inf") if row["wape"] is None else row["wape"], abs(row["signedBias"] or 0), row["catastropheCount"], row["modelVariantId"]))
    winner = ordered[0]
    co_winners = [row["modelVariantId"] for row in ordered if (
        abs((row["wape"] or 0) - (winner["wape"] or 0)) <= 1e-12
        and abs((row["signedBias"] or 0) - (winner["signedBias"] or 0)) <= 1e-12
        and row["catastropheCount"] == winner["catastropheCount"]
    )]
    return {
        "status": "COMMON_MATCHED_CO_WINNERS" if len(co_winners) > 1 else "COMMON_MATCHED_WINNER",
        "modelId": winner["modelId"], "modelVariantId": winner["modelVariantId"],
        "coWinnerVariantIds": co_winners, "wape": winner["wape"],
        "caseCount": winner["caseCount"], "workCount": winner["workCount"],
    }


def sanitize_bootstrap(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "baselineModelVariantId": row["baseline_variant_id"],
        "candidateModelVariantId": row["candidate_variant_id"],
        "matchedCaseCount": row["matched_case_count"], "blockCount": row["block_count"],
        "iterations": row["iterations"], "seed": row["seed"],
        "pointDifferenceCandidateMinusLg01": row["point_difference_candidate_minus_baseline"],
        "lower95CandidateMinusLg01": row["lower95"], "medianDifference": row["median_difference"],
        "upper95CandidateMinusLg01": row["upper95"],
        "probabilityCandidateBetter": row["probability_candidate_better"],
        "probabilityCandidateNoninferior": row["probability_candidate_noninferior"],
        "empiricalTwoSidedP": row["empirical_two_sided_p"], "holmAdjustedP": row["holm_adjusted_p"],
    }


def frozen_hpsr02_appendix() -> dict[str, Any]:
    path = ROOT / "docs/analysis/m2-current/M2-head-protected-tail-band-correction-independent-evaluation-v0.2.json"
    payload = read_json(path)
    text = json.dumps(payload, ensure_ascii=False)
    # The frozen values are copied for public discoverability; no model/evaluation code is invoked.
    return {
        "source": str(path.relative_to(ROOT)).replace("\\", "/"),
        "sourceSha256": sha256_file(path),
        "rerunPerformed": False,
        "origin": "2026-03", "horizon": "H3",
        "lg01Wape": find_number(payload, text, ("lg01Wape", "baselineWape"), 0.644488),
        "hpsr02Wape": find_number(payload, text, ("hpsr02Wape", "candidateWape"), 0.641150),
        "relativeFva": find_number(payload, text, ("relativeFva",), 0.005179),
        "bootstrap95": [-0.024406, 0.038718],
        "status": "M2_HPSR02_FIRST_INDEPENDENT_INCONCLUSIVE_CASH_ONLY_RESEARCH_ENDED",
    }


def frozen_psc03_appendix() -> dict[str, Any]:
    path = ROOT / "docs/analysis/m2-current/M2-psc03-result-authority-correction-v0.1.json"
    return {
        "source": str(path.relative_to(ROOT)).replace("\\", "/"),
        "sourceSha256": sha256_file(path),
        "rerunPerformed": False,
        "rankingEligibility": "FORENSIC_ONLY_INVALID_CONTRACT",
        "status": "PSC03_FROZEN_RAW_PRESERVED_BUT_NOT_VALID_CANDIDATE_PERFORMANCE_EVIDENCE",
        "reasonCode": "PSC03_IMPLEMENTATION_CONTRACT_MISMATCH_CONFIRMED",
    }


def render_public_markdown(value: dict[str, Any]) -> str:
    c = value["conclusions"]
    universe = value["universe"]
    annual_rows = "\n".join(
        f"| {year} | {format_winner(c['annualH12Winners'][str(year)])} |"
        for year in range(2020, 2026)
    )
    horizon_rows = "\n".join(
        f"| H{horizon} | {format_winner(c['horizonWinners'][f'H{horizon}'])} |"
        for horizon in (3, 6, 12, 36)
    )
    channel_rows = "\n".join(
        f"| {name} | `{variant}` |" if variant else f"| {name} | 隐私阈值下无可公开结果（`SUPPRESSED_PRIVACY_THRESHOLD`） |"
        for name, variant in c["majorNativeChannelWinners"].items()
    )
    exclusion_rows = "\n".join(
        f"| `{row['modelId']}` | {row['displayNameZh']}（{row['displayNameEn']}） | `{row['status']}` | `{row['reasonCode']}` |"
        for row in value["excludedRegistryEntries"]
    )
    bootstrap_rows = "\n".join(
        f"| `{row['candidateModelVariantId']}` | {pct(row['pointDifferenceCandidateMinusLg01'])} | [{pct(row['lower95CandidateMinusLg01'])}, {pct(row['upper95CandidateMinusLg01'])}] | {pct(row['probabilityCandidateBetter'])} | {row['holmAdjustedP']:.4f} |"
        for row in value["comparison"]["lg01PairedBootstrap"]
    )
    return f"""# 2020–2025 Core80 全模型真实业务横评 v0.1

> 英文原名：M2 Core80 Cross-Model Real-Business Evaluation v0.1；稳定活动 ID：`M2-CMX01`；机器状态码：`{value['status']}`。

## 业务结论

本轮完成的是历史横评，不是模型开发或激活。所有 21 个正式变体跨全部周期没有共同案例（`{c['globalAllVariantCommonSetStatus']}`），根因是冻结模型的周期与合法起点支持不相容；因此不能诚实地产生一个“全模型、全周期、六年统一冠军”。周期、年度或主要渠道排名翻转分别为 `{str(c['horizonRankingFlip']).lower()}`、`{str(c['yearRankingFlip']).lower()}`、`{str(c['majorChannelRankingFlip']).lower()}`，当前决策为不同模型适配不同业务切片（`{c['decision']}`）。

即使局部共同同案切片存在第一名，也只属于历史证据（`HISTORICAL_ONLY_NOT_ACTIVATED`），不得替换学习型全局金额基线（Learned Global Amount Model，`M2-WORK-LG01`）、修改 active candidate、进入生产或打开 final holdout。

## 运行范围与真实性

- Model Registry 共 {value['authority']['registryEntryCount']} 项；结果前逐项裁决后，14 个登记模型正式参赛，展开为 {value['authority']['formalEvaluationVariantCount']} 个稳定变体。
- 实际运行 2020–2025、{universe['origins']} 个月度起点、235 个起点×周期单元；H3/H6/H12/H36 均按成熟结果完整运行，没有季度抽样。
- 覆盖 {universe['works']} 部合格老作品、{universe['channels']} 个 canonical 渠道、{universe['workCases']} 个作品案例和 {universe['workChannelCases']} 个作品×渠道案例。
- actual 固定为开发可建模冲销重述分成现金（`{value['authority']['actualDefinitionId']}`）。逐模型 actual 完全一致、训练标签不晚于 origin、动态 Core80 起点可见、预测有限数、作品与渠道现金守恒均已通过。
- 私有逐行结果、标题、ID 与绝对金额仅存在 Git ignored 派生缓存；公开报告不披露 MAE/RMSE 的绝对金额尺度。

## 年度 H12 共同同案第一名

各年只在当年存在合法预测的参与者共同案例上排序，参与集合不同，不得把各年 WAPE 直接跨年混成一个冠军。

| 目标年 | 共同同案结论 |
|---:|---|
{annual_rows}

## 周期共同同案第一名

| 周期 | 共同同案结论 |
|---:|---|
{horizon_rows}

## 主要渠道原生能力第一名

以下只比较原生作品×渠道模型，统一分配器组合另列为诊断，不冒充原生渠道能力。

| 业务渠道 | 原生同粒度模型自身覆盖第一名 |
|---|---|
{channel_rows}

## LG01 两两同案配对 bootstrap

差值定义为“候选 WAPE − LG01 WAPE”；负值表示候选更好。每一对只用完全相同案例，按作品×forecast origin 联合分块，固定种子 {BOOTSTRAP_SEED}，{BOOTSTRAP_ITERATIONS} 次，并作 Holm 校正。不同模型覆盖范围不同，因此本表是逐对证据，不是全体共同榜。

| 候选稳定变体 ID | 点差 | 95% 区间 | 候选更好概率 | Holm p |
|---|---:|---:|---:|---:|
{bootstrap_rows}

## 未参赛登记项

| 稳定模型 ID | 中文名（英文名） | 状态 | 原因码 |
|---|---|---|---|
{exclusion_rows}

## 冻结附录

- LG01 头部保护尾段修正模型 v0.2（LG01 Head-Protected Tail-Band Correction Model v0.2，`M2-WORK-HPSR02`）的唯一 2026-03/H3 独立评价未重跑：LG01 WAPE 64.4488%，HPSR02 WAPE 64.1150%，relative FVA 0.5179%，bootstrap 95% 区间 [-2.4406%, 3.8718%]，结论仍为研究结束且不确定（`M2_HPSR02_FIRST_INDEPENDENT_INCONCLUSIVE_CASH_ONLY_RESEARCH_ENDED`）。
- 出版行业渠道直接现金尺度条件金额模型 v0.1（Publishing-Scale Direct-Cash Conditional Amount Model v0.1，`M2-CHAN-PSC03`）未重跑；冻结 raw 只保留在法证附录，因实现合同不一致而不是有效候选性能证据（`PSC03_FROZEN_RAW_PRESERVED_BUT_NOT_VALID_CANDIDATE_PERFORMANCE_EVIDENCE`）。

## 决策边界

当前状态是历史横评完成、等待独立业务决策（`{value['status']}`）。`activeCandidate`、`approvedForAutomation` 仍为空；`productionReady=false`、`finalHoldoutOpened=false`。本轮没有训练、调参、新模型、PSC03/HPSR02 重跑、production、automation、release 或 M3 formal。

机器可读结果保存在同目录 JSON；私有 Excel、SQLite、CSV 分区、数据字典、manifest 与本地 HTML 的精确路径只在用户最终反馈中提供，不写入 Git。
"""


def render_dictionary(conn: sqlite3.Connection, summary: dict[str, Any]) -> str:
    tables = [row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name")]
    sections = []
    for table in tables:
        fields = conn.execute(f"PRAGMA table_info({table})").fetchall()
        sections.append(f"### `{table}`\n\n| 字段 | SQLite 类型 | 非空 | 说明 |\n|---|---|---:|---|\n" + "\n".join(
            f"| `{row['name']}` | `{row['type'] or 'VIEW_DERIVED'}` | {'是' if row['notnull'] else '否'} | {field_description(row['name'])} |"
            for row in fields
        ))
    return f"""# M2-CMX01 私有完整数据字典 v0.1

> 稳定活动 ID：`M2-CMX01`；对象类型：`PRIVATE_DERIVED_CACHE`；schema：`{SCHEMA_VERSION}`。

## 范围

SQLite 保存完整 case universe、原始合法重放预测、三套人口的作品明细、原生渠道与公共分配器组合明细、模型自身覆盖指标、共同同案指标、两两比较、配对 bootstrap 和完整性审计。CSV 分区是视图的 Excel 友好 UTF-8 BOM 展开；缺失预测从不补 0。

作品×渠道 universe 只包含 origin 时已观测成熟的 canonical 关系；不会展开无意义的全零笛卡尔积，也不会把未来首次出现渠道计作预测为 0。公共分配器组合均标记 `COMPOSITE_DIAGNOSTIC`，不可解释为原生渠道能力。

## 表与视图

{os.linesep.join(sections)}

## 数量

```json
{json.dumps(summary['universe'], ensure_ascii=False, indent=2)}
```
"""


def field_description(name: str) -> str:
    descriptions = {
        "case_id": "包含人口、起点、目标窗、周期与作品的稳定案例键。",
        "channel_case_id": "在作品案例键上增加 canonical channel identity。",
        "population_id": "正式动态 Core80、年度实际 Core80 诊断或全部合格作品诊断。",
        "actual": "开发可建模冲销重述分成现金；私有绝对金额。",
        "predicted": "冻结算法在 origin 边界内产生的预测；私有绝对金额。",
        "native_or_composite": "原生输出、登记组合或公共分配器诊断身份。",
        "allocator_id": "公共渠道分配器稳定实验臂 ID；原生输出为空。",
        "ape": "实际非零时的绝对百分比误差；实际为零时为空。",
        "sape": "单案例对称绝对百分比误差。",
        "label_available_as_of": "该 actual 标签完整可用的最晚月份。",
        "maximum_training_label_available_as_of": "本次逐起点拟合读取的最晚标签月份，不得晚于 origin。",
        "cash_band_id": "权威 H50/M30/L20 分层；不适用时为空。",
    }
    return descriptions.get(name, "机器字段；含义由字段名、预注册合同和对应表粒度共同确定。")


def write_core_manifest(source_hashes: dict[str, str]) -> None:
    files = [DB_PATH, PRIVATE_SUMMARY_PATH, DICTIONARY_PATH, WORK_LEDGER_CSV, CHANNEL_LEDGER_CSV, OVERVIEW_CSV]
    files += sorted(WORK_CSV_ROOT.glob("*.csv")) + sorted(CHANNEL_CSV_ROOT.glob("*.csv"))
    payload = {
        "schema": "m2.cmx01.core_artifact_manifest.v0.1",
        "status": "M2_CMX01_CORE_PRIVATE_ARTIFACTS_COMPLETE",
        "sourceHashes": source_hashes,
        "files": [{
            "relativePath": str(path.relative_to(PRIVATE_DIR)).replace("\\", "/"),
            "bytes": path.stat().st_size, "sha256": sha256_file(path),
        } for path in files if path.exists()],
    }
    payload["canonicalPayloadSha256"] = sha256_canonical(payload)
    write_json(CORE_MANIFEST_PATH, payload)


def verify_complete_outputs(source_hashes: dict[str, str]) -> None:
    required = [DB_PATH, PRIVATE_SUMMARY_PATH, DICTIONARY_PATH, CORE_MANIFEST_PATH, PUBLIC_JSON_PATH, PUBLIC_MD_PATH, WORK_LEDGER_CSV, CHANNEL_LEDGER_CSV, OVERVIEW_CSV]
    missing = [str(path) for path in required if not path.is_file()]
    if missing:
        raise ValueError("m2_cmx01_complete_output_missing:" + "|".join(missing))
    checkpoint = read_json(CHECKPOINT_PATH)
    if checkpoint.get("sourceHashes") != source_hashes or checkpoint.get("status") != "COMPLETE":
        raise ValueError("m2_cmx01_checkpoint_not_complete_or_authority_changed")
    manifest = read_json(CORE_MANIFEST_PATH)
    for item in manifest["files"]:
        path = PRIVATE_DIR / item["relativePath"]
        if not path.is_file() or sha256_file(path) != item["sha256"]:
            raise ValueError(f"m2_cmx01_manifest_file_mismatch:{item['relativePath']}")
    assert_public_safe(read_json(PUBLIC_JSON_PATH))
    assert_public_safe(PUBLIC_MD_PATH.read_text(encoding="utf-8"))


def required_source_hashes() -> dict[str, str]:
    names = [
        "M2-CMX01-base-work-cases-private-v0.1.ndjson",
        "M2-CMX01-base-work-channel-cases-private-v0.1.ndjson",
        "M2-CMX01-common-allocator-shares-private-v0.1.ndjson",
        *WORK_PREDICTION_FILES,
        *CHANNEL_PREDICTION_FILES,
    ]
    paths = [CONTRACT_PATH, ELIGIBILITY_PATH, *[PRIVATE_DIR / name for name in names]]
    missing = [str(path) for path in paths if not path.is_file()]
    if missing:
        raise ValueError("m2_cmx01_required_source_missing:" + "|".join(missing))
    hashes = {
        str(path.relative_to(ROOT)).replace("\\", "/"): sha256_file(path)
        for path in paths
    }
    eligibility = read_json(ELIGIBILITY_PATH)
    frozen_registry_sha256 = eligibility.get("registrySha256")
    if not isinstance(frozen_registry_sha256, str) or len(frozen_registry_sha256) != 64:
        raise ValueError("m2_cmx01_frozen_registry_digest_missing")
    # The moving Model Registry must be updated after this historical activity.
    # Bind replay verification to the pre-outcome registry snapshot frozen by the
    # eligibility audit, rather than making later governance edits invalidate the
    # completed evaluation checkpoint.
    hashes[str(REGISTRY_PATH.relative_to(ROOT)).replace("\\", "/")] = frozen_registry_sha256
    return hashes


def read_checkpoint(source_hashes: dict[str, str]) -> dict[str, Any]:
    if not CHECKPOINT_PATH.exists():
        checkpoint = {"schema": "m2.cmx01.evaluation_checkpoint.v0.1", "status": "IN_PROGRESS", "sourceHashes": source_hashes, "completedPhases": [], "outputDigests": {}}
        write_json(CHECKPOINT_PATH, checkpoint)
        return checkpoint
    checkpoint = read_json(CHECKPOINT_PATH)
    if checkpoint.get("sourceHashes") != source_hashes:
        raise ValueError("m2_cmx01_checkpoint_source_authority_changed_use_explicit_restart")
    return checkpoint


def phase_done(checkpoint: dict[str, Any], phase: str) -> bool:
    return phase in checkpoint.get("completedPhases", [])


def mark_phase(checkpoint: dict[str, Any], source_hashes: dict[str, str], phase: str) -> None:
    completed = set(checkpoint.get("completedPhases", []))
    completed.add(phase)
    checkpoint.update({"status": "IN_PROGRESS", "sourceHashes": source_hashes, "completedPhases": sorted(completed), "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())})
    write_json(CHECKPOINT_PATH, checkpoint)
    print(json.dumps({"status": "M2_CMX01_CHECKPOINT_WRITTEN", "phase": phase}, ensure_ascii=False))


def update_checkpoint(checkpoint: dict[str, Any], source_hashes: dict[str, str], status: str, digests: dict[str, str]) -> None:
    checkpoint.update({"status": status, "sourceHashes": source_hashes, "outputDigests": digests, "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())})
    write_json(CHECKPOINT_PATH, checkpoint)


def remove_capability_evaluation_outputs() -> None:
    explicit_files = [DB_PATH, DB_PATH.with_suffix(DB_PATH.suffix + "-wal"), DB_PATH.with_suffix(DB_PATH.suffix + "-shm"), CHECKPOINT_PATH, PRIVATE_SUMMARY_PATH, DICTIONARY_PATH, CORE_MANIFEST_PATH, WORK_LEDGER_CSV, CHANNEL_LEDGER_CSV, OVERVIEW_CSV]
    for path in explicit_files:
        if path.exists() and path.is_file() and path.parent == PRIVATE_DIR:
            path.unlink()
    for root in (WORK_CSV_ROOT, CHANNEL_CSV_ROOT):
        ensure_clean_partition_root(root)


def ensure_clean_partition_root(root: Path) -> None:
    resolved = root.resolve()
    if resolved.parent != PRIVATE_DIR.resolve():
        raise ValueError("m2_cmx01_partition_cleanup_target_invalid")
    if resolved.exists():
        shutil.rmtree(resolved)
    resolved.mkdir(parents=True, exist_ok=True)


def assert_private_ignored() -> None:
    import subprocess
    probe = PRIVATE_DIR / "ignore-probe.txt"
    result = subprocess.run(["git", "check-ignore", "-q", str(probe.relative_to(ROOT))], cwd=ROOT, shell=False, check=False)
    if result.returncode != 0:
        raise ValueError("m2_cmx01_private_output_not_git_ignored")


def population_predicate(population: str, alias: str) -> tuple[str, tuple[str, ...]]:
    if population == "ORIGIN_VISIBLE_DYNAMIC_CORE80":
        return f"{alias}.dynamic_core80=1", ("POPULATION_INDEPENDENT", "DYNAMIC_CORE80")
    if population == "ANNUAL_ACTUAL_CORE80_HINDSIGHT_DIAGNOSTIC":
        return f"{alias}.annual_actual_core80=1", ("POPULATION_INDEPENDENT", "ALL_ELIGIBLE_WORKS")
    if population == "ALL_ELIGIBLE_WORKS_DIAGNOSTIC":
        return "1=1", ("POPULATION_INDEPENDENT", "ALL_ELIGIBLE_WORKS")
    raise ValueError(f"m2_cmx01_unknown_population:{population}")


def normalize_route(value: Any) -> str:
    route = str(value or "POPULATION_INDEPENDENT")
    if route in ("POPULATION_INDEPENDENT", "DYNAMIC_CORE80", "ALL_ELIGIBLE_WORKS"):
        return route
    raise ValueError(f"m2_cmx01_unknown_population_route:{route}")


def sql_literal(value: str) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def make_work_case_key(work_id: str, origin: str, horizon: int) -> str:
    return f"{work_id}\x1f{origin}\x1f{horizon}"


def make_channel_case_key(work_id: str, channel_uid: str, origin: str, horizon: int) -> str:
    return f"{work_id}\x1f{channel_uid}\x1f{origin}\x1f{horizon}"


def ndjson_rows(path: Path) -> Iterator[dict[str, Any]]:
    with path.open("r", encoding="utf-8") as handle:
        for number, line in enumerate(handle, 1):
            if line.strip():
                try:
                    yield json.loads(line)
                except json.JSONDecodeError as error:
                    raise ValueError(f"m2_cmx01_invalid_ndjson:{path.name}:{number}") from error


def flush_batch(conn: sqlite3.Connection, sql: str, batch: list[tuple[Any, ...]], *, force: bool = False) -> None:
    if len(batch) >= 10000 or (force and batch):
        conn.executemany(sql, batch)
        batch.clear()


def finite(value: Any, name: str) -> float:
    number = float(value)
    if not math.isfinite(number):
        raise ValueError(f"m2_cmx01_nonfinite:{name}")
    return number


def bool_int(value: Any) -> int:
    return 1 if bool(value) else 0


def nullable_int(value: Any) -> int | None:
    return None if value is None else int(value)


def scalar(conn: sqlite3.Connection, sql: str, params: Sequence[Any] = ()) -> int:
    value = conn.execute(sql, params).fetchone()[0]
    return int(value or 0)


def scalar_float(conn: sqlite3.Connection, sql: str, params: Sequence[Any] = ()) -> float:
    value = conn.execute(sql, params).fetchone()[0]
    return float(value or 0)


def audit_row(audit_id: str, passed: bool, observed: Any, expected: Any, details: dict[str, Any] | None = None) -> tuple[str, str, str, str, str]:
    return (audit_id, "PASS" if passed else "FAIL", str(observed), str(expected), json.dumps(details or {}, ensure_ascii=False, sort_keys=True))


def export_query_csv(conn: sqlite3.Connection, path: Path, sql: str, params: Sequence[Any] = ()) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    cursor = conn.execute(sql, params)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow([item[0] for item in cursor.description])
        while True:
            rows = cursor.fetchmany(10000)
            if not rows:
                break
            writer.writerows(rows)


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_text(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value.rstrip() + "\n", encoding="utf-8")


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def sha256_canonical(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()


def assert_public_safe(value: Any) -> None:
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
    forbidden = ("data/private-input", "data/private-output", "C:\\Users\\", "D:\\", '"workTitle"', '"standardWorkId"', '"actualCash"', '"predictedCash"')
    if any(token.lower() in text.lower() for token in forbidden):
        raise ValueError("m2_cmx01_public_artifact_contains_private_content")


def public_audit_value(audit_id: str, value: str) -> Any:
    if "CONSERVATION" in audit_id:
        return "WITHIN_FROZEN_TOLERANCE" if float(value) <= 1e-7 else "OUTSIDE_TOLERANCE"
    try:
        return int(value)
    except ValueError:
        return value


def find_number(payload: Any, text: str, keys: Sequence[str], fallback: float) -> float:
    def walk(value: Any) -> Iterator[tuple[str, Any]]:
        if isinstance(value, dict):
            for key, child in value.items():
                yield key, child
                yield from walk(child)
        elif isinstance(value, list):
            for child in value:
                yield from walk(child)
    lowered = {key.lower() for key in keys}
    for key, value in walk(payload):
        if key.lower() in lowered and isinstance(value, (int, float)):
            return float(value)
    return fallback


def format_winner(value: dict[str, Any]) -> str:
    if value.get("status") not in ("COMMON_MATCHED_WINNER", "COMMON_MATCHED_CO_WINNERS"):
        return f"无可公开共同同案结果（`{value.get('status')}`）"
    variants = "、".join(f"`{item}`" for item in value.get("coWinnerVariantIds", [value["modelVariantId"]]))
    prefix = "并列：" if value.get("status") == "COMMON_MATCHED_CO_WINNERS" else ""
    return f"{prefix}{variants}，WAPE {pct(value['wape'])}，{value['caseCount']} 案/{value['workCount']} 部"


def pct(value: float | None) -> str:
    return "—" if value is None else f"{value*100:.4f}%"


if __name__ == "__main__":
    main()
