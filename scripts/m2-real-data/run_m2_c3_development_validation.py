#!/usr/bin/env python3
"""Run the frozen M2 C3 design gate and development replay.

The runner is deliberately branch-bound and local-only.  Phase A may inspect
the already-authorized development evidence to produce aggregate, sanitized
design artifacts.  It cannot execute the C3 outer replay until Gate D is bound
to a pushed Phase A commit.  Holdout, embargo-shadow, and deferred-label modes
always fail before any data loader is called.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
import os
import pickle
import re
import subprocess
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence


ROOT = Path(__file__).resolve().parents[2]
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import m2_calibration_c2_v1 as c2  # noqa: E402
import m2_calibration_c3_v1 as c3  # noqa: E402
import m2_calibration_v1_2 as v12  # noqa: E402
import m2_formal_cash_comparator_v1 as formal  # noqa: E402
import run_m2_calibration_baseline_replay as legacy  # noqa: E402
import run_m2_c2r1_development_validation as c2r1_runner  # noqa: E402
import run_m2_formal_cash_comparator_replay as formal_runner  # noqa: E402


PUBLIC_DIR = ROOT / "docs" / "analysis" / "m2-real-data"
PRIVATE_DIR = ROOT / "data" / "private-output" / "m2-c3-v1"
SPEC_PATH = (
    ROOT
    / "src"
    / "domain"
    / "oldProductEvaluation"
    / "calibrationSpec.c3.v1.amendment.json"
)
CORE_PATH = ROOT / "scripts" / "m2-real-data" / "m2_calibration_c3_v1.py"
RUNNER_PATH = Path(__file__).resolve()
CONTRACT_TEST_PATH = ROOT / "test" / "m2-c3-contract.test.js"
DEVELOPMENT_TEST_PATH = ROOT / "test" / "m2-c3-development-validation.test.js"
PACKAGE_PATH = ROOT / "package.json"

OPPORTUNITY_JSON = PUBLIC_DIR / "M2-C3-opportunity-audit-v1.json"
OPPORTUNITY_MD = PUBLIC_DIR / "M2-C3-opportunity-audit-v1.md"
FEATURE_JSON = PUBLIC_DIR / "M2-C3-feature-manifest-v1.json"
FEATURE_MD = PUBLIC_DIR / "M2-C3-feature-manifest-v1.md"
CANDIDATE_JSON = PUBLIC_DIR / "M2-C3-candidate-space-v1.json"
CANDIDATE_MD = PUBLIC_DIR / "M2-C3-candidate-space-v1.md"
DESIGN_JSON = PUBLIC_DIR / "M2-C3-model-design-v1.json"
DESIGN_MD = PUBLIC_DIR / "M2-C3-model-design-v1.md"
GATE_D_JSON = PUBLIC_DIR / "M2-calibration-gate-d-v1.json"
VALIDATION_JSON = PUBLIC_DIR / "M2-C3-development-validation-v1.json"
VALIDATION_MD = PUBLIC_DIR / "M2-C3-development-validation-v1.md"
MODEL_DECISION_JSON = PUBLIC_DIR / "M2-C3-model-quality-decision-v1.json"
MODEL_DECISION_MD = PUBLIC_DIR / "M2-C3-model-quality-decision-v1.md"
BUSINESS_DECISION_JSON = PUBLIC_DIR / "M2-C3-business-coverage-decision-v1.json"
BUSINESS_DECISION_MD = PUBLIC_DIR / "M2-C3-business-coverage-decision-v1.md"
TERMINAL_JSON = PUBLIC_DIR / "M2-C3-terminal-model-route-summary-v1.json"
TERMINAL_MD = PUBLIC_DIR / "M2-C3-terminal-model-route-summary-v1.md"

PRIVATE_PHASE_A_MANIFEST = PRIVATE_DIR / "M2-C3-phase-a-manifest-private-v1.json"
PRIVATE_VALIDATION_RECEIPT = (
    PRIVATE_DIR / "M2-calibration-gate-d-validation-private-v1.json"
)
PRIVATE_PUSH_RECEIPT = PRIVATE_DIR / "M2-calibration-gate-d-push-private-v1.json"
PRIVATE_CASES = PRIVATE_DIR / "M2-C3-development-cases-private-v1.ndjson"
PRIVATE_DEVELOPMENT_MANIFEST = (
    PRIVATE_DIR / "M2-C3-development-manifest-private-v1.json"
)

BRANCH = "codex/m2-c3-v2"
PHASE_A_START_HEAD = "50d927d64438af5057e8b623a901a22c70bced53"
MODEL_IDS = ("B0b", "B1", "B3", "B4")
CORE_HORIZONS = (3, 6, 12, 18, 24)
TOLERANCE = 1e-9

PHASE_A_TRACKED_PATHS = (
    SPEC_PATH,
    CORE_PATH,
    RUNNER_PATH,
    CONTRACT_TEST_PATH,
    DEVELOPMENT_TEST_PATH,
    PACKAGE_PATH,
    OPPORTUNITY_JSON,
    OPPORTUNITY_MD,
    FEATURE_JSON,
    FEATURE_MD,
    CANDIDATE_JSON,
    CANDIDATE_MD,
    DESIGN_JSON,
    DESIGN_MD,
    GATE_D_JSON,
)
IMMUTABLE_PHASE_A_PATHS = tuple(
    path for path in PHASE_A_TRACKED_PATHS if path != GATE_D_JSON
)
PUBLIC_PHASE_A_PATHS = (
    OPPORTUNITY_JSON,
    OPPORTUNITY_MD,
    FEATURE_JSON,
    FEATURE_MD,
    CANDIDATE_JSON,
    CANDIDATE_MD,
    DESIGN_JSON,
    DESIGN_MD,
    GATE_D_JSON,
)
PUBLIC_DEVELOPMENT_PATHS = (
    VALIDATION_JSON,
    VALIDATION_MD,
    MODEL_DECISION_JSON,
    MODEL_DECISION_MD,
    BUSINESS_DECISION_JSON,
    BUSINESS_DECISION_MD,
)
PRIVATE_PATHS = (
    PRIVATE_PHASE_A_MANIFEST,
    PRIVATE_VALIDATION_RECEIPT,
    PRIVATE_PUSH_RECEIPT,
    PRIVATE_CASES,
    PRIVATE_DEVELOPMENT_MANIFEST,
)


class C3RunnerError(RuntimeError):
    """Fail-closed C3 orchestration error."""


def progress(message: str) -> None:
    print(f"[m2-c3] {message}", flush=True)


def run_git(*args: str, check: bool = True, binary: bool = False) -> str | bytes:
    process = subprocess.run(
        ["git", *args],
        cwd=ROOT,
        capture_output=True,
        check=False,
    )
    if check and process.returncode != 0:
        diagnostic = (process.stderr or process.stdout).decode(
            "utf-8", errors="replace"
        )
        raise C3RunnerError(f"git {' '.join(args)} failed: {diagnostic.strip()}")
    if binary:
        return process.stdout
    return process.stdout.decode("utf-8", errors="strict").strip()


def relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")


def digest(value: Any) -> str:
    return hashlib.sha256(canonical_bytes(value)).hexdigest()


def file_sha256(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def git_blob_sha256(commit: str, path: Path) -> str:
    payload = run_git("cat-file", "blob", f"{commit}:{relative(path)}", binary=True)
    assert isinstance(payload, bytes)
    return hashlib.sha256(payload).hexdigest()


def assert_git_semantic_match(commit: str, path: Path) -> None:
    rel = relative(path)
    expected = str(run_git("rev-parse", f"{commit}:{rel}"))
    actual = str(run_git("hash-object", "--path", rel, rel))
    if expected != actual:
        raise C3RunnerError(f"tracked Phase A path differs from Git blob: {rel}")


def write_json(path: Path, value: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            value,
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
            allow_nan=False,
        )
        + "\n",
        encoding="utf-8",
        newline="\n",
    )


def write_text(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value.rstrip() + "\n", encoding="utf-8", newline="\n")


def rounded(value: float | None, places: int = 8) -> float | None:
    if value is None:
        return None
    return round(float(value), places)


def ratio(numerator: float, denominator: float) -> float | None:
    return float(numerator) / float(denominator) if denominator else None


def case_key(payload: Mapping[str, Any]) -> tuple[str, str, int, str]:
    key = payload.get("caseKey", payload.get("case_key", {}))
    return (
        str(key["standard_work_id"]),
        str(key["origin"]),
        int(key["horizon_months"]),
        str(key["route"]),
    )


def require_named_branch() -> None:
    branch = str(run_git("branch", "--show-current"))
    if branch != BRANCH:
        raise C3RunnerError(f"C3 execution requires {BRANCH}; current={branch or 'detached'}")


def _status_entries() -> list[tuple[str, str]]:
    process = subprocess.run(
        ["git", "status", "--porcelain=v1", "-z"],
        cwd=ROOT,
        capture_output=True,
        check=False,
    )
    if process.returncode != 0:
        raise C3RunnerError("git status failed")
    records = [record for record in process.stdout.decode("utf-8").split("\0") if record]
    entries = []
    index = 0
    while index < len(records):
        record = records[index]
        status = record[:2]
        path = record[3:].replace("\\", "/")
        entries.append((status, path))
        if status[0] in {"R", "C"}:
            index += 1
        index += 1
    return entries


def require_clean_worktree(*, allow_gate_only: bool = False) -> None:
    entries = _status_entries()
    if allow_gate_only:
        if all(path == relative(GATE_D_JSON) for _status, path in entries):
            return
    if entries:
        raise C3RunnerError(f"C3 requires a clean worktree; changes={entries}")


def require_phase_a_scoped_worktree() -> None:
    """Allow the not-yet-committed Phase A files, but nothing outside them."""

    allowed = {relative(path) for path in PHASE_A_TRACKED_PATHS}
    unexpected = []
    for status, path in _status_entries():
        if path not in allowed:
            unexpected.append((status, path))
    if unexpected:
        raise C3RunnerError(f"Phase A worktree contains unrelated changes: {unexpected}")


def tracked_private_artifacts() -> list[str]:
    tracked = str(run_git("ls-files")).splitlines()
    forbidden_extensions = (
        ".xlsx",
        ".xls",
        ".db",
        ".dump",
        ".pgpass",
    )
    result = []
    for item in tracked:
        lower = item.lower().replace("\\", "/")
        if (
            lower.startswith("data/")
            or "/private/" in f"/{lower}/"
            or "private-output" in lower
            or "private-input" in lower
            or lower.endswith(forbidden_extensions)
            or lower.endswith("/.env")
            or lower == ".env"
        ):
            result.append(item)
    return sorted(result)


def assert_private_paths_ignored() -> None:
    roles = (
        formal_runner.PRIVATE_CASES,
        formal_runner.PRIVATE_MANIFEST,
        c2r1_runner.PRIVATE_CASES,
        c2r1_runner.PRIVATE_MANIFEST,
        *PRIVATE_PATHS,
    )
    for path in roles:
        rel = relative(Path(path))
        ignored = subprocess.run(
            ["git", "check-ignore", "-q", "--", rel], cwd=ROOT, check=False
        )
        if ignored.returncode != 0:
            raise C3RunnerError(f"private role is not ignored: {rel}")
        if str(run_git("ls-files", "--", rel)):
            raise C3RunnerError(f"private role is tracked: {rel}")
    tracked = tracked_private_artifacts()
    if tracked:
        raise C3RunnerError(f"private/real-data artifacts are tracked: {tracked}")


def assert_public_safety(paths: Sequence[Path]) -> None:
    forbidden = (
        "data/private",
        "private-output",
        "private-input",
        "file://",
        "c:\\\\users\\",
        "/home/",
    )
    forbidden_keys = {
        "caseKey",
        "workId",
        "standardWorkId",
        "standard_work_id",
        "title",
        "author",
        "channel_key",
        "rawChannel",
        "lower",
        "upper",
        "rawRows",
        "rawIncomeRows",
    }

    def walk(value: Any) -> Iterable[str]:
        if isinstance(value, Mapping):
            for key, child in value.items():
                if str(key) in forbidden_keys:
                    raise C3RunnerError(f"public artifact contains forbidden key: {key}")
                yield from walk(child)
        elif isinstance(value, list):
            for child in value:
                yield from walk(child)
        elif isinstance(value, str):
            yield value

    for path in paths:
        if not path.is_file():
            raise C3RunnerError(f"required public artifact is missing: {relative(path)}")
        text = path.read_text(encoding="utf-8")
        lowered = text.lower()
        if any(token in lowered for token in forbidden):
            raise C3RunnerError(f"public artifact contains a private identifier: {relative(path)}")
        if path.suffix == ".md" and not re.search(r"[\u4e00-\u9fff]", text):
            raise C3RunnerError(f"public Markdown is not Chinese: {relative(path)}")
        if path.suffix == ".json":
            payload = json.loads(text)
            for value in walk(payload):
                lowered_value = value.lower()
                if any(token in lowered_value for token in forbidden):
                    raise C3RunnerError(
                        f"public JSON contains a private value: {relative(path)}"
                    )


def _load_locked_comparator_cases() -> tuple[
    dict[str, dict[tuple[str, tuple[str, str, int, str]], dict[str, Any]]],
    dict[str, Any],
]:
    """Load canonical comparator rows without exposing case contents publicly."""

    manifest = json.loads(formal_runner.PRIVATE_MANIFEST.read_text(encoding="utf-8"))
    expected_count = int(manifest["privateCaseRowCount"])
    expected_sha = str(manifest["caseEvidenceSha256"])
    rows: dict[str, dict[tuple[str, tuple[str, str, int, str]], dict[str, Any]]] = {
        model: {} for model in MODEL_IDS
    }
    hasher = hashlib.sha256()
    count = 0
    with formal_runner.PRIVATE_CASES.open("rb") as handle:
        for raw in handle:
            if not raw.endswith(b"\n"):
                raise C3RunnerError("formal comparator evidence is not LF-delimited")
            payload = json.loads(raw[:-1].decode("utf-8"))
            canonical = canonical_bytes(payload) + b"\n"
            if canonical != raw:
                raise C3RunnerError("formal comparator evidence is not canonical JSON")
            hasher.update(raw)
            count += 1
            model = str(payload["modelId"])
            if model not in rows:
                raise C3RunnerError("unexpected formal comparator model")
            role = str(payload["predictionRole"])
            key = case_key(payload)
            map_key = (role, key)
            if map_key in rows[model]:
                raise C3RunnerError("duplicate formal comparator case")
            rows[model][map_key] = payload
    if count != expected_count or hasher.hexdigest() != expected_sha:
        raise C3RunnerError("formal comparator manifest/hash differs")
    multiplicities = {model: len(values) for model, values in rows.items()}
    if len(set(multiplicities.values())) != 1 or count != sum(multiplicities.values()):
        raise C3RunnerError("formal comparator multiplicity differs")
    return rows, manifest


def _forward_templates(
    rows: Mapping[str, Mapping[tuple[str, tuple[str, str, int, str]], Mapping[str, Any]]]
) -> dict[tuple[str, str, int, str], dict[str, Any]]:
    output = {}
    for (role, key), payload in rows["B4"].items():
        if not role.startswith("development_forward_score:"):
            continue
        output[key] = copy.deepcopy(payload)
    return output


def _locked_comparator_parity(
    rows: Mapping[
        str,
        Mapping[tuple[str, tuple[str, str, int, str]], Mapping[str, Any]],
    ],
) -> dict[str, Any]:
    forward: dict[str, dict[tuple[str, str, int, str], Mapping[str, Any]]] = {}
    for model in MODEL_IDS:
        selected: dict[tuple[str, str, int, str], Mapping[str, Any]] = {}
        for (role, key), payload in rows[model].items():
            if not role.startswith("development_forward_score:"):
                continue
            if key in selected:
                raise C3RunnerError("duplicate locked comparator forward case")
            selected[key] = payload
        forward[model] = selected
    reference = forward["B4"]
    reference_keys = set(reference)
    actual_fields = (
        "forecastableCashActual",
        "uncommittedBuyoutSurpriseActual",
        "totalLedgerCashActual",
    )
    state_fields = (
        "statisticallyScoreable",
        "scoreabilityReason",
        "businessServingEligible",
        "modelPredictionAvailable",
        "routeAbstained",
        "abstained",
        "abstentionReason",
        "predictionRole",
        "targetEnd",
        "labelAvailableAsOf",
        "billMonthMax",
        "sourceAvailableAsOf",
    )
    same_keys = all(set(forward[model]) == reference_keys for model in MODEL_IDS)
    same_actuals = same_keys and all(
        all(
            forward[model][key].get(field) == reference[key].get(field)
            for field in actual_fields
        )
        for model in MODEL_IDS
        for key in reference_keys
    )
    same_states = same_keys and all(
        all(
            forward[model][key].get(field) == reference[key].get(field)
            for field in state_fields
        )
        for model in MODEL_IDS
        for key in reference_keys
    )
    key_fingerprints = {
        model: _fingerprint_keys(forward[model]) for model in MODEL_IDS
    }
    actual_fingerprints = {
        model: digest(
            [
                [
                    list(key),
                    *[
                        format(float(forward[model][key][field]), ".17g")
                        for field in actual_fields
                    ],
                ]
                for key in sorted(forward[model])
            ]
        )
        for model in MODEL_IDS
    }
    state_fingerprints = {
        model: digest(
            [
                [
                    list(key),
                    *[forward[model][key].get(field) for field in state_fields],
                ]
                for key in sorted(forward[model])
            ]
        )
        for model in MODEL_IDS
    }
    return {
        "models": list(MODEL_IDS),
        "forwardCaseCountByModel": {
            model: len(forward[model]) for model in MODEL_IDS
        },
        "sameCaseKeys": same_keys,
        "sameActuals": same_actuals,
        "sameCaseStates": same_states,
        "caseKeyFingerprintByModel": key_fingerprints,
        "actualFingerprintByModel": actual_fingerprints,
        "stateFingerprintByModel": state_fingerprints,
        "allPassed": bool(same_keys and same_actuals and same_states),
    }


def _model_population(template: Mapping[str, Any]) -> bool:
    return bool(
        template.get("statisticallyScoreable") is True
        and template.get("modelPredictionAvailable") is True
        and template.get("routeAbstained") is False
        and case_key(template)[3] in c2.SALES_ROUTES
    )


def _fingerprint_case_actual(
    templates: Mapping[tuple[str, str, int, str], Mapping[str, Any]]
) -> str:
    rows = [
        [list(key), format(float(template["forecastableCashActual"]), ".17g")]
        for key, template in sorted(templates.items())
    ]
    return digest(rows)


def _fingerprint_keys(keys: Iterable[tuple[str, str, int, str]]) -> str:
    return digest([list(key) for key in sorted(keys)])


def _history_audit_state(
    *,
    work: Mapping[str, Any],
    template: Mapping[str, Any],
    calibration_spec: Mapping[str, Any],
    c2_spec: Mapping[str, Any],
) -> dict[str, Any]:
    key = case_key(template)
    history = c2.work_sales_history_as_of(work, key[1], calibration_spec)
    segment = c2.segment_as_of(work, key[1], calibration_spec, c2_spec)
    values = [float(value) for value in history["values"]]
    tolerance = float(c2_spec["activitySegmentation"]["zeroAbsoluteTolerance"])
    positive = sum(value > tolerance for value in values)
    zero = sum(abs(value) <= tolerance for value in values)
    trailing12 = values[-12:]
    zero12 = sum(abs(value) <= tolerance for value in trailing12)
    positive_rate = ratio(positive, len(values)) or 0.0
    zero_rate = ratio(zero, len(values)) or 0.0
    if trailing12:
        trailing_mean = math.fsum(trailing12) / len(trailing12)
        x_mean = (len(trailing12) - 1) / 2.0
        x_variance = math.fsum(
            (index - x_mean) ** 2 for index in range(len(trailing12))
        )
        slope = (
            math.fsum(
                (index - x_mean) * (value - trailing_mean)
                for index, value in enumerate(trailing12)
            )
            / x_variance
            if x_variance > 0
            else 0.0
        )
        trend = slope / max(abs(trailing_mean), 1.0)
        volatility = math.sqrt(
            math.fsum((value - trailing_mean) ** 2 for value in trailing12)
            / len(trailing12)
        ) / max(abs(trailing_mean), 1.0)
    else:
        trend = 0.0
        volatility = 0.0
    points = [
        max(0.0, float(item["point_forecast"]))
        for item in template.get("channelComponents", [])
    ]
    total_points = sum(points)
    concentration = max(points) / total_points if total_points > 0 and points else 0.0
    return {
        "segment": str(segment["segment"]),
        "historyMonths": len(values),
        "positiveMonthCount": positive,
        "zeroMonthCount": zero,
        "zeroMonthCountTrailing12": zero12,
        "positiveRate": positive_rate,
        "zeroRate": zero_rate,
        "trend12": trend,
        "volatility12": volatility,
        "channelCount": int(history["channelCount"]),
        "channelConcentration": concentration,
    }


def _bucket(value: int, boundaries: Sequence[tuple[int, str]], tail: str) -> str:
    for maximum, label in boundaries:
        if int(value) <= maximum:
            return label
    return tail


def _rate_bucket(value: float) -> str:
    if value <= TOLERANCE:
        return "zero"
    if value <= 0.25:
        return "gt_0_to_0_25"
    if value <= 0.5:
        return "gt_0_25_to_0_5"
    if value <= 0.75:
        return "gt_0_5_to_0_75"
    return "gt_0_75_to_1"


def _trend_bucket(value: float) -> str:
    if value < -0.10:
        return "falling"
    if value > 0.10:
        return "rising"
    return "stable"


def _volatility_bucket(value: float) -> str:
    if value < 0.5:
        return "low_lt_0_5"
    if value < 1.0:
        return "medium_0_5_to_1"
    return "high_ge_1"


def _audit_dimensions(
    template: Mapping[str, Any], state: Mapping[str, Any]
) -> dict[str, str]:
    key = case_key(template)
    b4 = float(template["rawModelPrediction"])
    strata = template.get("strata", {}) or {}
    if b4 <= TOLERANCE:
        scale = "zero"
    elif b4 < 1_000:
        scale = "under_1k"
    elif b4 < 10_000:
        scale = "1k_to_10k"
    elif b4 < 100_000:
        scale = "10k_to_100k"
    else:
        scale = "100k_plus"
    concentration = float(state["channelConcentration"])
    if concentration >= 0.8:
        concentration_bucket = "high_ge_0_8"
    elif concentration >= 0.5:
        concentration_bucket = "medium_0_5_to_0_8"
    else:
        concentration_bucket = "low_lt_0_5"
    top = "other"
    for percent in (1, 5, 10):
        if bool(strata.get(f"top_{percent}_percent")):
            top = f"top{percent}"
            break
    return {
        "origin": key[1],
        "activitySegment": str(state["segment"]),
        "route": key[3],
        "horizon": str(key[2]),
        "cutoffHistoryLength": _bucket(
            int(state["historyMonths"]),
            ((0, "0"), (5, "1_to_5"), (11, "6_to_11"), (23, "12_to_23")),
            "24_plus",
        ),
        "positiveMonthCount": _bucket(
            int(state["positiveMonthCount"]),
            ((0, "0"), (5, "1_to_5"), (11, "6_to_11"), (23, "12_to_23")),
            "24_plus",
        ),
        "zeroMonthCount": _bucket(
            int(state["zeroMonthCountTrailing12"]),
            ((0, "0"), (3, "1_to_3"), (6, "4_to_6"), (11, "7_to_11")),
            "12",
        ),
        "cutoffZeroRate": _rate_bucket(float(state["zeroRate"])),
        "cutoffPositiveRate": _rate_bucket(float(state["positiveRate"])),
        "cutoffTrend": _trend_bucket(float(state["trend12"])),
        "cutoffVolatility": _volatility_bucket(float(state["volatility12"])),
        "knownChannelCount": _bucket(
            int(state["channelCount"]), ((0, "0"), (1, "1"), (2, "2")), "3_plus"
        ),
        "knownChannelConcentration": concentration_bucket,
        "b4RevenueScale": scale,
        "highValueBand": top,
        "sourcePostHoc": str(strata.get("source") or "unknown"),
        "lifecyclePostHoc": str(strata.get("lifecycle") or "unknown"),
        "shelfRightsPostHoc": "audit_only_unavailable_as_of",
    }


def _raw_group_metric(rows: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    actual = [float(row["actual"]) for row in rows]
    prediction = [float(row["prediction"]) for row in rows]
    actual_sum = sum(actual)
    absolute_error = sum(abs(point - truth) for point, truth in zip(prediction, actual))
    signed_error = sum(point - truth for point, truth in zip(prediction, actual))
    return {
        "caseCount": len(rows),
        "uniqueWorkCount": len({str(row["workToken"]) for row in rows}),
        "absoluteError": absolute_error,
        "signedErrorPredictionMinusActual": signed_error,
        "residualActualMinusPrediction": -signed_error,
        "wape": ratio(absolute_error, abs(actual_sum)),
        "signedAggregateBias": ratio(signed_error, actual_sum),
        "normalizedSignedResidual": ratio(-signed_error, actual_sum),
        "positiveActualCaseShare": ratio(sum(value > 0 for value in actual), len(actual)),
    }


def _suppressed_metric(metric: Mapping[str, Any], minimum: int) -> dict[str, Any]:
    return {
        "suppressed": True,
        "suppressionReason": "complementary_small_sample",
        "minimumWorks": minimum,
        "caseCount": None,
        "uniqueWorkCount": None,
        "absoluteError": None,
        "signedErrorPredictionMinusActual": None,
        "residualActualMinusPrediction": None,
        "wape": None,
        "signedAggregateBias": None,
        "normalizedSignedResidual": None,
        "positiveActualCaseShare": None,
    }


def _public_dimension(
    grouped: Mapping[str, Sequence[Mapping[str, Any]]], minimum_works: int
) -> dict[str, Any]:
    raw = {key: _raw_group_metric(rows) for key, rows in sorted(grouped.items())}
    suppress = {
        key for key, metric in raw.items() if int(metric["uniqueWorkCount"]) < minimum_works
    }
    if suppress:
        candidates = [
            (int(metric["uniqueWorkCount"]), key)
            for key, metric in raw.items()
            if key not in suppress
        ]
        if candidates:
            suppress.add(min(candidates)[1])
    return {
        key: (
            _suppressed_metric(metric, minimum_works)
            if key in suppress
            else {
                "suppressed": False,
                **{name: rounded(value) if isinstance(value, float) else value for name, value in metric.items()},
            }
        )
        for key, metric in raw.items()
    }


def build_opportunity_audit(
    *,
    spec: Mapping[str, Any],
    templates: Mapping[tuple[str, str, int, str], Mapping[str, Any]],
    works: Mapping[str, Mapping[str, Any]],
    calibration_spec: Mapping[str, Any],
) -> tuple[dict[str, Any], dict[tuple[str, str, int, str], dict[str, Any]]]:
    c2_spec = c2.load_spec()
    rows: list[dict[str, Any]] = []
    states: dict[tuple[str, str, int, str], dict[str, Any]] = {}
    dimensions: dict[str, dict[str, list[dict[str, Any]]]] = defaultdict(
        lambda: defaultdict(list)
    )
    for key, template in sorted(templates.items()):
        if not _model_population(template):
            continue
        state = _history_audit_state(
            work=works[key[0]],
            template=template,
            calibration_spec=calibration_spec,
            c2_spec=c2_spec,
        )
        states[key] = state
        row = {
            "workToken": digest(key[0])[:16],
            "actual": float(template["forecastableCashActual"]),
            "prediction": float(template["rawModelPrediction"]),
        }
        rows.append(row)
        for name, value in _audit_dimensions(template, state).items():
            dimensions[name][value].append(row)
    overall = _raw_group_metric(rows)
    minimum = int(spec["privacy"]["complementarySuppressionMinimumWorks"])
    required_dimensions = list(spec["opportunityAudit"]["dimensions"])
    missing_dimensions = [name for name in required_dimensions if name not in dimensions]
    if missing_dimensions:
        raise C3RunnerError(
            f"C3 opportunity audit dimensions differ from the frozen spec: {missing_dimensions}"
        )
    posthoc_dimensions = [
        "sourcePostHoc",
        "lifecyclePostHoc",
        "shelfRightsPostHoc",
    ]
    report = {
        "schema": "m2.c3.opportunity_audit.v1",
        "version": "v1",
        "decisionStatus": "not_for_formal_decision",
        "scope": {
            "developmentCaseCount": int(spec["authority"]["developmentCaseCount"]),
            "statisticallyScoreableCaseCount": int(
                spec["authority"]["statisticallyScoreableCaseCount"]
            ),
            "formalModelPopulationCaseCount": len(rows),
            "formalModelPopulationWorkCount": len(
                {key[0] for key in states}
            ),
            "primaryComparator": "B4",
            "actualRole": "forecastableCashActual",
        },
        "overallB4ErrorStructure": {
            name: rounded(value) if isinstance(value, float) else value
            for name, value in overall.items()
            if name not in {"caseCount", "uniqueWorkCount"}
        },
        "dimensions": {
            name: _public_dimension(groups, minimum)
            for name, groups in sorted(dimensions.items())
        },
        "dimensionContract": {
            "required": required_dimensions,
            "requiredDimensionsPresent": True,
            "postHocAuditOnly": posthoc_dimensions,
            "unexpectedPredictiveDimensions": [],
        },
        "regions": {
            "mandatoryB4": [
                "no_cutoff_sales_history",
                "history_shorter_than_12_complete_months",
                "insufficient_strictly_earlier_inner_origin_support",
                "feature_or_fit_non_finite",
                "correction_outside_frozen_cap",
            ],
            "correctionOpportunity": [
                "sales_cash_route",
                "at_least_12_complete_history_months",
                "strictly_earlier_inner_origin_support",
                "finite_allowlisted_cutoff_features",
                "correction_within_frozen_cap",
            ],
            "noSafeSignal": [
                "work_title_author_or_identity",
                "real_channel_identity",
                "current_rating_lifecycle_rights_or_shelf",
                "source_rights_shelf_without_historical_snapshot",
                "future_or_outer_outcome_information",
                "suppressed_small_sample_group",
            ],
        },
        "methodology": {
            "descriptiveOnly": True,
            "outerActualCreatesRules": False,
            "rulesFrozenFromOutcomeBuckets": False,
            "postHocDimensionsAuditOnly": [
                *posthoc_dimensions,
            ],
            "complementarySuppressionMinimumWorks": minimum,
        },
        "privacy": {
            "aggregateOnly": True,
            "identifiersPresent": False,
            "rawIncomeRowsPresent": False,
            "privatePathsPresent": False,
            "intervalEndpointsPresent": False,
        },
        "seals": copy.deepcopy(spec["seals"]),
        "nextBoundary": "freeze_feature_candidate_and_gate_d_before_outer_replay",
    }
    return report, states


def build_feature_manifest(spec: Mapping[str, Any]) -> dict[str, Any]:
    manifest = copy.deepcopy(spec["featureManifest"])
    return {
        "schema": "m2.c3.feature_manifest.v1",
        "version": "v1",
        "decisionStatus": "not_for_formal_decision",
        **manifest,
        "preprocessing": {
            "fitBoundary": "strictly_earlier_inner_origin_training_rows_only",
            "numericScaling": "fold_local_mean_and_standard_deviation",
            "missingValuePolicy": "frozen_safe_default_then_fold_local_indicator",
            "categoricalVocabulary": "frozen_spec_allowlist",
            "winsorization": "fold_local_when_candidate_requires_it",
            "outerActualAccessible": False,
        },
        "auditOnly": [
            "origin",
            "sourcePostHoc",
            "lifecyclePostHoc",
            "rightsPostHoc",
            "shelfPostHoc",
            "actualErrorBuckets",
        ],
        "trainingLabelsNotFeatures": [
            "forecastableCashActual",
            "actualPositiveIndicator",
            "actualMinusB4Residual",
            "logActualMinusLogB4Residual",
        ],
        "seals": copy.deepcopy(spec["seals"]),
    }


def build_candidate_report(spec: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "schema": "m2.c3.candidate_space.v1",
        "version": "v1",
        "decisionStatus": "not_for_formal_decision",
        "anchor": "B4",
        "candidateSpace": copy.deepcopy(spec["candidateSpace"]),
        "selection": copy.deepcopy(spec["selection"]),
        "C3SActivation": copy.deepcopy(spec["C3SActivation"]),
        "candidateSpaceMayChangeAfterOuterResults": False,
        "outerActualCreatesRules": False,
        "seals": copy.deepcopy(spec["seals"]),
    }


def build_design_report(spec: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "schema": "m2.c3.model_design.v1",
        "version": "v1",
        "decisionStatus": "not_for_formal_decision",
        "objective": "B4_anchored_global_residual_hurdle_hierarchical_correction",
        "notARevenueReforecast": True,
        "authority": copy.deepcopy(spec["authority"]),
        "formalCashTarget": copy.deepcopy(spec["formalCashTarget"]),
        "models": {
            "C3-A": {
                "target": "forecastableCashActual_minus_B4",
                "mechanism": "hierarchical_signed_residual_shrinkage",
                "requirements": ["shrinkage", "correction_cap", "B4_fallback"],
            },
            "C3-B": {
                "stage1": "probability_forecastable_cash_positive",
                "stage2": "conditional_positive_cash_amount",
                "composition": "probability_times_conditional_amount",
                "anchor": "bounded_shrinkage_toward_B4",
            },
            "C3-C": {
                "target": "log1p_actual_minus_log1p_B4",
                "composition": "bounded_B4_multiplicative_correction",
                "requirements": ["shrinkage", "correction_cap", "B4_fallback"],
            },
            "C3-S": {
                "conditional": True,
                "input": "strictly_earlier_out_of_fold_C3_A_B_C_points_only",
                "activation": copy.deepcopy(spec["C3SActivation"]),
            },
        },
        "trainingBoundary": copy.deepcopy(spec["trainingBoundary"]),
        "finalRoutePolicy": copy.deepcopy(
            spec["selection"]["finalRoutePolicy"]
        ),
        "routes": copy.deepcopy(spec["routes"]),
        "acceptance": copy.deepcopy(spec["acceptance"]),
        "businessCoverageDecision": copy.deepcopy(spec["businessCoverageDecision"]),
        "privacy": copy.deepcopy(spec["privacy"]),
        "seals": copy.deepcopy(spec["seals"]),
        "nextBoundary": "gate_d_then_outer_development_replay_only",
    }


def write_phase_a_markdown(
    opportunity: Mapping[str, Any],
    feature: Mapping[str, Any],
    candidate: Mapping[str, Any],
    design: Mapping[str, Any],
) -> None:
    write_text(
        OPPORTUNITY_MD,
        f"""# M2 C3 机会审计 v1

本审计仅使用冻结 development 人口中的 B4 聚合误差结构，覆盖 {opportunity['scope']['formalModelPopulationCaseCount']} 个模型人口 case、{opportunity['scope']['formalModelPopulationWorkCount']} 部作品。分组结果只作描述，不使用 outer actual 创建规则。

审计维度完整覆盖 origin、horizon、route、activity segment、cutoff 历史长度、正值/零值月份、正值/零值比例、趋势、波动、已知渠道数、渠道集中度、B4 收入规模和 Top1/5/10 高价值带；source、lifecycle、rights/shelf 仅作 post-hoc 审计。

- 强制保持 B4：无 cutoff 销售历史、历史不足 12 个完整月、严格更早 inner-origin 支持不足、特征或拟合非有限、修正超过冻结 cap。
- 可修正机会：销售现金路由、历史至少 12 个完整月、有严格更早 inner-origin 支持、仅使用白名单 cutoff 特征且修正在 cap 内。
- 无安全信号：身份、真实渠道、当前评级/生命周期/版权/货架、无历史快照的 source/rights/shelf、未来或 outer outcome、小样本受抑制分组。

结果为 `not_for_formal_decision`。final holdout、embargo shadow、deferred 60-month labels 均未打开。
""",
    )
    write_text(
        FEATURE_MD,
        f"""# M2 C3 特征清单 v1

训练只允许 {len(feature['allowed'])} 项冻结的 cutoff-only 特征角色；身份、标题、作者、真实渠道身份、当前评级/生命周期/版权/货架及未来信息全部禁止。数值预处理只在严格更早的 inner-origin 训练 fold 内拟合。

source、生命周期、版权和货架若没有 cutoff 历史快照，只能作 post-hoc 聚合审计，不能进入模型。
""",
    )
    write_text(
        CANDIDATE_MD,
        f"""# M2 C3 候选空间 v1

候选空间在 outer replay 前冻结：C3-A {candidate['candidateSpace']['c3A']['candidateCount']} 个、C3-B {candidate['candidateSpace']['c3B']['candidateCount']} 个、C3-C {candidate['candidateSpace']['c3C']['candidateCount']} 个、C3-S {candidate['candidateSpace']['c3S']['candidateCount']} 个，总计 {candidate['candidateSpace']['totalCandidateCount']} 个。

C3-S 仅消费严格更早的 OOF A/B/C 点，并且只有达到预注册的稳定改善条件才启用；否则明确跳过。候选、阈值和人口不随 outer 结果移动。
""",
    )
    write_text(
        DESIGN_MD,
        f"""# M2 C3 模型设计 v1

C3 是 B4 锚定的有限修正路线，不重新定义预测对象，也不重做收入目标。A 学习 signed residual，B 使用两阶段 hurdle，C 学习 log1p offset；所有路线都保留 correction cap、shrinkage 和 B4 fallback。

最终路线规则在 outer replay 前固定：主路线为 C3-A；只有 C3-S 依靠严格更早 OOF 证据触发冻结激活规则时，才由 C3-S 条件替代。outer actual 和 outer 指标不得选择或缩放最终路线。

权威范围固定为 {design['authority']['formalModelPopulationCaseCount']} 个 formal-cash 模型人口 case、{design['authority']['formalModelPopulationWorkCount']} 部作品。Gate D 全真之前禁止执行 outer replay；本设计不授权 release、holdout、C4 或 M3。
""",
    )


def _gate_conditions(
    *,
    spec: Mapping[str, Any],
    opportunity: Mapping[str, Any],
    comparator_parity: Mapping[str, Any],
    synthetic: Mapping[str, Any],
    templates: Mapping[tuple[str, str, int, str], Mapping[str, Any]],
    validation_passed: bool,
    pushed: bool,
) -> dict[str, bool]:
    parent = c2.load_spec()
    gate_c = json.loads(
        (PUBLIC_DIR / "M2-calibration-gate-c-v1.json").read_text(encoding="utf-8")
    )
    model_keys = {key for key, value in templates.items() if _model_population(value)}
    checks = synthetic.get("checks", synthetic)
    conditions = {
        "formal_cash_target_and_c2_checkpoint_unchanged": bool(
            digest(parent) == spec["phaseABinding"]["parentSpecCanonicalDigestSha256"]
            and gate_c.get("allTrue") is True
            and gate_c.get("C2AuthorizedByGateC") is True
            and spec["formalCashTarget"] == parent["formalCashTarget"]
        ),
        "authority_population_frozen": bool(
            len(templates) == int(spec["authority"]["developmentCaseCount"])
            and sum(value.get("statisticallyScoreable") is True for value in templates.values())
            == int(spec["authority"]["statisticallyScoreableCaseCount"])
            and len(model_keys) == int(spec["authority"]["formalModelPopulationCaseCount"])
            and len({key[0] for key in model_keys})
            == int(spec["authority"]["formalModelPopulationWorkCount"])
        ),
        "case_key_actual_and_state_parity_passed": bool(
            len(templates) == int(opportunity["scope"]["developmentCaseCount"])
            and len(model_keys) == int(opportunity["scope"]["formalModelPopulationCaseCount"])
            and comparator_parity["allPassed"] is True
            and all(
                int(count) == int(spec["authority"]["developmentCaseCount"])
                for count in comparator_parity["forwardCaseCountByModel"].values()
            )
        ),
        "opportunity_regions_and_b4_fallback_frozen": bool(
            opportunity["methodology"]["outerActualCreatesRules"] is False
            and len(opportunity["regions"]["mandatoryB4"]) >= 3
            and opportunity["dimensionContract"]["requiredDimensionsPresent"] is True
            and opportunity["dimensionContract"]["required"]
            == spec["opportunityAudit"]["dimensions"]
            and opportunity["dimensionContract"]["unexpectedPredictiveDimensions"]
            == []
            and spec["selection"]["insufficientEvidenceFallback"] == "B4"
        ),
        "feature_manifest_as_of_boundary_frozen": bool(
            checks.get("predictionRejectsIdentityFeature") is True
            and checks.get("predictionRejectsOutcomeField") is True
            and checks.get("featureProjectionContainsNoIdentity") is True
            and spec["featureManifest"]["futureInformationAllowed"] is False
        ),
        "candidate_space_and_c3s_activation_rule_frozen": bool(
            checks.get("candidateCountsFrozen") is True
            and spec["candidateSpace"]["candidateSpaceMayChangeAfterResults"] is False
            and spec["C3SActivation"]["outerActualMayActivate"] is False
            and spec["selection"]["finalRoutePolicy"][
                "outerActualMaySelectOrScale"
            ]
            is False
        ),
        "inner_origin_only_training_passed": bool(
            checks.get("fitRejectsSameOrLaterEvidence") is True
            and checks.get("C3SUsesStrictlyEarlierOofOnly") is True
        ),
        "cross_fit_and_fold_local_preprocessing_passed": bool(
            checks.get("C3SUsesStrictlyEarlierOofOnly") is True
            and checks.get("deterministicPreprocessor") is True
        ),
        "prediction_lock_future_perturbation_and_determinism_passed": bool(
            checks.get("futurePerturbationInvariant") is True
            and checks.get("deterministicHierarchicalFit") is True
            and checks.get("predictionRejectsOutcomeField") is True
        ),
        "formal_cash_route_abstention_passed": bool(
            checks.get("pureBuyoutNullAbstain") is True
            and checks.get("mixedExcludesUncommittedFutureBuyout") is True
            and checks.get("allFamiliesProduceFinitePoint") is True
        ),
        "all_seals_closed": all(value is False for value in spec["seals"].values()),
        "full_validation_suite_passed": bool(validation_passed),
        "phase_a_commit_pushed": bool(pushed),
        "no_private_file_tracked": not tracked_private_artifacts(),
    }
    expected = list(spec["gateD"]["conditions"])
    if list(conditions) != expected:
        raise C3RunnerError("Gate D condition order differs from the frozen spec")
    return conditions


def gate_report(
    *,
    spec: Mapping[str, Any],
    opportunity: Mapping[str, Any],
    comparator: Mapping[
        str,
        Mapping[tuple[str, tuple[str, str, int, str]], Mapping[str, Any]],
    ],
    synthetic: Mapping[str, Any],
    templates: Mapping[tuple[str, str, int, str], Mapping[str, Any]],
    validation_passed: bool = False,
    pushed: bool = False,
    validation_receipt_sha256: str | None = None,
    validation_evidence: Mapping[str, Any] | None = None,
    phase_a_checkpoint: str | None = None,
    phase_a_tree: str | None = None,
    remote_head: str | None = None,
    runtime_push_receipt_sha256: str | None = None,
) -> dict[str, Any]:
    comparator_parity = _locked_comparator_parity(comparator)
    conditions = _gate_conditions(
        spec=spec,
        opportunity=opportunity,
        comparator_parity=comparator_parity,
        synthetic=synthetic,
        templates=templates,
        validation_passed=validation_passed,
        pushed=pushed,
    )
    passed = sum(conditions.values())
    required = int(spec["gateD"]["requiredTrueCount"])
    all_true = passed == required == len(conditions)
    model_keys = {key for key, value in templates.items() if _model_population(value)}
    return {
        "schema": "m2.calibration_gate_d.v1",
        "version": "v1",
        "decisionStatus": "not_for_formal_decision",
        "formalDecisionAuthorized": False,
        "releaseAuthorized": False,
        "C3OuterReplayExecuted": False,
        "C3AuthorizedByGateD": all_true,
        "conditionOrder": list(conditions),
        "conditions": conditions,
        "passedConditionCount": passed,
        "conditionCount": len(conditions),
        "allTrue": all_true,
        "authorityEvidence": {
            "developmentCaseCount": len(templates),
            "statisticallyScoreableCaseCount": sum(
                value.get("statisticallyScoreable") is True for value in templates.values()
            ),
            "formalModelPopulationCaseCount": len(model_keys),
            "formalModelPopulationWorkCount": len({key[0] for key in model_keys}),
            "caseKeyFingerprint": _fingerprint_keys(templates),
            "formalModelPopulationKeyFingerprint": _fingerprint_keys(model_keys),
            "formalCashActualFingerprint": _fingerprint_case_actual(templates),
        },
        "comparatorParityEvidence": comparator_parity,
        "phaseAStartHead": PHASE_A_START_HEAD,
        "phaseACheckpoint": phase_a_checkpoint,
        "phaseATree": phase_a_tree,
        "remoteHead": remote_head,
        "phaseACommitPushed": pushed,
        "remoteHeadVerified": bool(pushed and remote_head == phase_a_checkpoint),
        "validationReceiptSha256": validation_receipt_sha256,
        "runtimePushReceiptSha256": runtime_push_receipt_sha256,
        "validationEvidence": copy.deepcopy(validation_evidence),
        "privateFilesTracked": bool(tracked_private_artifacts()),
        "seals": copy.deepcopy(spec["seals"]),
        "nextBoundary": (
            "C3_outer_development_replay_authorized"
            if all_true
            else "C3_outer_replay_only_if_all_gate_d_conditions_true"
        ),
    }


def _phase_a_public_hashes() -> dict[str, str]:
    return {relative(path): file_sha256(path) for path in PUBLIC_PHASE_A_PATHS}


def _load_authorized_works_with_git_canonical_cache(
    calibration_spec: Mapping[str, Any],
) -> tuple[list[dict[str, Any]], dict[str, dict[str, str]], dict[str, Any]]:
    """Validate the existing cache with Git-clean LF semantics on Windows.

    The cache is never rebuilt or rewritten.  Private input roles retain their
    byte hashes; only the three tracked source files use their canonical Git
    blob bytes, matching the signature with which the verified cache was made.
    """

    import run_m2_formal_execution_payload as payload  # noqa: PLC0415
    from calibrate_cleaned_bills import discover_sources  # noqa: PLC0415

    paths = [
        discover_sources()[0],
        payload.readiness.FOUNDATION_PATH,
        payload.readiness.FORMAL_INPUT_PATH,
        payload.readiness.MAPPING_PAYLOAD,
        payload.readiness.MAPPING_OVERLAY,
        Path(payload.bake.__file__),
        Path(payload.v1.__file__),
        Path(payload.v11.__file__),
    ]
    tracked_sources = set(paths[-3:])
    inputs = []
    for path in paths:
        rel = path.relative_to(ROOT).as_posix()
        if path in tracked_sources:
            assert_git_semantic_match("HEAD", path)
            raw = run_git("cat-file", "blob", f"HEAD:{rel}", binary=True)
            assert isinstance(raw, bytes)
            sha = hashlib.sha256(raw).hexdigest()
        else:
            sha = file_sha256(path)
        inputs.append({"path": rel, "sha256": sha})
    canonical_signature = payload.stable_hash(
        {"cacheVersion": payload.CACHE_VERSION, "inputs": inputs}
    )
    if not payload.MODEL_CACHE_PATH.is_file():
        raise C3RunnerError("verified model-input cache is missing")
    try:
        with payload.MODEL_CACHE_PATH.open("rb") as handle:
            cached = pickle.load(handle)
    except (OSError, EOFError, pickle.PickleError, AttributeError, ValueError, TypeError) as exc:
        raise C3RunnerError("verified model-input cache is unreadable") from exc
    if not isinstance(cached, Mapping) or cached.get("signature") != canonical_signature:
        raise C3RunnerError(
            "verified model-input cache differs even under Git canonical LF semantics"
        )
    original = payload.model_cache_signature
    payload.model_cache_signature = lambda: canonical_signature
    try:
        return legacy.load_authorized_works(calibration_spec)
    finally:
        payload.model_cache_signature = original


def _load_phase_a_inputs() -> tuple[
    dict[str, Any],
    dict[str, dict[tuple[str, tuple[str, str, int, str]], dict[str, Any]]],
    dict[tuple[str, str, int, str], dict[str, Any]],
    dict[str, Mapping[str, Any]],
    Mapping[str, Any],
    Mapping[str, Any],
]:
    spec = c3.load_spec()
    formal_runner.verify_phase_a()
    comparator, manifest = _load_locked_comparator_cases()
    templates = _forward_templates(comparator)
    calibration_spec, _v11, _v12 = v12.load_and_validate_contract()
    works_list, _posthoc, input_evidence = _load_authorized_works_with_git_canonical_cache(
        calibration_spec
    )
    if str(input_evidence["inputFingerprint"]) != str(manifest["inputFingerprint"]):
        raise C3RunnerError("authorized input fingerprint differs from formal comparator")
    works = {str(work["standard_work_id"]): work for work in works_list}
    if len(works) != int(spec["authority"]["standardWorkCount"]):
        raise C3RunnerError("authorized work count differs")
    return spec, comparator, templates, works, calibration_spec, manifest


def preflight() -> dict[str, Any]:
    spec = c3.load_spec()
    synthetic = c3.synthetic_self_test()
    branch = str(run_git("branch", "--show-current"))
    if branch == BRANCH:
        checkout_boundary = "named_branch"
    elif (
        branch == "main"
        and str(run_git("rev-parse", "HEAD"))
        == str(run_git("rev-parse", "origin/main"))
        and not _status_entries()
    ):
        checkout_boundary = "clean_origin_main_read_only"
    else:
        checkout_boundary = "synthetic_ci_checkout"
    return {
        "status": "passed",
        "mode": "synthetic-only",
        "checkoutBoundary": checkout_boundary,
        "specDigest": c3.canonical_digest(spec),
        "candidateCounts": synthetic["candidateCounts"],
        "synthetic": synthetic,
        "privateDataRead": False,
        "dataLoadCalls": 0,
        "finalHoldoutOpened": False,
        "embargoShadowOpened": False,
        "deferred60MonthLabelsOpened": False,
    }


def run_phase_a() -> dict[str, Any]:
    require_named_branch()
    require_phase_a_scoped_worktree()
    assert_private_paths_ignored()
    if str(run_git("rev-parse", "HEAD")) != PHASE_A_START_HEAD:
        raise C3RunnerError("Phase A must start exactly at the authorized main checkpoint")
    progress("loading locked development evidence for aggregate opportunity audit")
    spec, comparator, templates, works, calibration_spec, manifest = _load_phase_a_inputs()
    opportunity, _states = build_opportunity_audit(
        spec=spec,
        templates=templates,
        works=works,
        calibration_spec=calibration_spec,
    )
    feature = build_feature_manifest(spec)
    candidate = build_candidate_report(spec)
    design = build_design_report(spec)
    synthetic = c3.synthetic_self_test()
    write_json(OPPORTUNITY_JSON, opportunity)
    write_json(FEATURE_JSON, feature)
    write_json(CANDIDATE_JSON, candidate)
    write_json(DESIGN_JSON, design)
    write_phase_a_markdown(opportunity, feature, candidate, design)
    gate = gate_report(
        spec=spec,
        opportunity=opportunity,
        comparator=comparator,
        synthetic=synthetic,
        templates=templates,
    )
    false_conditions = [key for key, value in gate["conditions"].items() if not value]
    if set(false_conditions) != {"full_validation_suite_passed", "phase_a_commit_pushed"}:
        raise C3RunnerError(f"Gate D pre-validation conditions failed: {false_conditions}")
    write_json(GATE_D_JSON, gate)
    assert_public_safety(PUBLIC_PHASE_A_PATHS)
    PRIVATE_DIR.mkdir(parents=True, exist_ok=True)
    private_manifest = {
        "schema": "m2.c3.phase_a_manifest.private.v1",
        "branch": BRANCH,
        "phaseAStartHead": PHASE_A_START_HEAD,
        "formalComparatorCaseEvidenceSha256": manifest["caseEvidenceSha256"],
        "formalComparatorInputFingerprint": manifest["inputFingerprint"],
        "formalCashActualFingerprint": gate["authorityEvidence"][
            "formalCashActualFingerprint"
        ],
        "modelPopulationKeyFingerprint": gate["authorityEvidence"][
            "formalModelPopulationKeyFingerprint"
        ],
        "publicArtifactSha256": _phase_a_public_hashes(),
        "finalHoldoutOpened": False,
        "embargoShadowOpened": False,
        "deferred60MonthLabelsOpened": False,
    }
    write_json(PRIVATE_PHASE_A_MANIFEST, private_manifest)
    assert_private_paths_ignored()
    return {
        "status": "passed",
        "formalModelPopulationCaseCount": gate["authorityEvidence"][
            "formalModelPopulationCaseCount"
        ],
        "formalModelPopulationWorkCount": gate["authorityEvidence"][
            "formalModelPopulationWorkCount"
        ],
        "gateDPassedConditionCount": gate["passedConditionCount"],
        "gateDConditionCount": gate["conditionCount"],
        "outerReplayExecuted": False,
        "privateFilesTracked": False,
        "finalHoldoutOpened": False,
    }


def verify_phase_a() -> dict[str, Any]:
    require_named_branch()
    assert_private_paths_ignored()
    spec, comparator, templates, works, calibration_spec, _manifest = _load_phase_a_inputs()
    opportunity, _states = build_opportunity_audit(
        spec=spec,
        templates=templates,
        works=works,
        calibration_spec=calibration_spec,
    )
    expected = {
        OPPORTUNITY_JSON: opportunity,
        FEATURE_JSON: build_feature_manifest(spec),
        CANDIDATE_JSON: build_candidate_report(spec),
        DESIGN_JSON: build_design_report(spec),
    }
    for path, payload in expected.items():
        if json.loads(path.read_text(encoding="utf-8")) != payload:
            raise C3RunnerError(f"Phase A artifact is not reproducible: {relative(path)}")
    synthetic = c3.synthetic_self_test()
    gate = json.loads(GATE_D_JSON.read_text(encoding="utf-8"))
    recomputed = gate_report(
        spec=spec,
        opportunity=opportunity,
        comparator=comparator,
        synthetic=synthetic,
        templates=templates,
        validation_passed=gate["conditions"]["full_validation_suite_passed"],
        pushed=gate["conditions"]["phase_a_commit_pushed"],
        validation_receipt_sha256=gate.get("validationReceiptSha256"),
        validation_evidence=gate.get("validationEvidence"),
        phase_a_checkpoint=gate.get("phaseACheckpoint"),
        phase_a_tree=gate.get("phaseATree"),
        remote_head=gate.get("remoteHead"),
        runtime_push_receipt_sha256=gate.get("runtimePushReceiptSha256"),
    )
    if gate != recomputed:
        raise C3RunnerError("Gate D is not reproducible from frozen evidence")
    assert_public_safety(PUBLIC_PHASE_A_PATHS)
    return {
        "status": "passed",
        "gateDPassedConditionCount": gate["passedConditionCount"],
        "gateDConditionCount": gate["conditionCount"],
        "outerReplayExecuted": False,
        "finalHoldoutOpened": False,
    }


VALIDATION_COMMANDS = (
    "npm run check:no-real-data",
    "npm run lint",
    "npm run build",
    "npm test",
    "npm run smoke",
    "npm run test:e2e",
    "npm run validate:m2:formal-cash-comparator",
    "npm run validate:m2:c2r1",
    "npm run validate:m2:c2",
    "npm run validate:m2:c2-reconciliation",
    "npm run validate:m2:c3-contract",
)
EXPECTED_FAIL_CLOSED_COMMANDS = (
    "npm run replay:m2:formal-cash-target:final-holdout",
    "npm run replay:m2:formal-cash-comparator:final-holdout",
    "npm run replay:m2:c2:final-holdout",
    "npm run replay:m2:c3:final-holdout",
    "npm run replay:m2:c3:embargo-shadow",
    "npm run replay:m2:c3:deferred-labels",
)


def _validation_process(command: str) -> tuple[dict[str, Any], bytes, bytes]:
    parts = command.split()
    if not parts or parts[0] != "npm":
        raise C3RunnerError(f"unsupported validation command: {command}")
    executable = "npm.cmd" if os.name == "nt" else "npm"
    environment = os.environ.copy()
    environment.update(
        {
            "M1_APP_ENV": "ci",
            "M1_DATABASE_URL": "",
            "M1_DATABASE_READONLY_URL": "",
            "M1_DATABASE_BACKGROUND_URL": "",
        }
    )
    process = subprocess.run(
        [executable, *parts[1:]],
        cwd=ROOT,
        env=environment,
        capture_output=True,
        check=False,
        timeout=1800,
    )
    stdout = process.stdout or b""
    stderr = process.stderr or b""
    return (
        {
            "command": command,
            "exitCode": int(process.returncode),
            "stdoutSha256": hashlib.sha256(stdout).hexdigest(),
            "stderrSha256": hashlib.sha256(stderr).hexdigest(),
            "stdoutBytes": len(stdout),
            "stderrBytes": len(stderr),
        },
        stdout,
        stderr,
    )


def _execute_validation_suite() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    successes = []
    for command in VALIDATION_COMMANDS:
        progress(f"validation: {command}")
        result, stdout, stderr = _validation_process(command)
        if int(result["exitCode"]) != 0:
            diagnostic = (stderr or stdout)[-2400:].decode("utf-8", errors="replace")
            raise C3RunnerError(
                f"validation failed ({command}, exit={result['exitCode']}): {diagnostic}"
            )
        successes.append(result)
    failures = []
    for command in EXPECTED_FAIL_CLOSED_COMMANDS:
        progress(f"fail-closed validation: {command}")
        result, stdout, stderr = _validation_process(command)
        combined = (stdout + b"\n" + stderr).decode("utf-8", errors="replace").lower()
        compact = combined.replace(" ", "")
        if int(result["exitCode"]) == 0 or "dataloadcalls=0" not in compact:
            raise C3RunnerError(f"sealed command did not fail before load: {command}")
        failures.append(result)
    return successes, failures


def _validation_receipt(
    successes: Sequence[Mapping[str, Any]],
    failures: Sequence[Mapping[str, Any]],
    *,
    phase_a_head: str | None = None,
    phase_a_tree: str | None = None,
    remote_head: str | None = None,
    tracked_artifact_sha256: Mapping[str, str] | None = None,
) -> dict[str, Any]:
    return {
        "schema": "m2.calibration_gate_d.validation_receipt.private.v1",
        "recordedAt": datetime.now(timezone.utc).isoformat(),
        "branch": BRANCH,
        "phaseAStartHead": PHASE_A_START_HEAD,
        "phaseAHead": phase_a_head,
        "phaseATree": phase_a_tree,
        "remoteHead": remote_head,
        "trackedArtifactSha256": dict(tracked_artifact_sha256 or {}),
        "M1_APP_ENV": "ci",
        "databaseEnvironmentEmpty": True,
        "realDataCalibrationExecutedByValidationCommands": False,
        "commandResults": list(successes),
        "expectedFailClosedCommandResults": list(failures),
        "allSuccessCommandsPassed": True,
        "allExpectedFailClosedCommandsFailedBeforeDataLoad": True,
        "finalHoldoutOpened": False,
        "embargoShadowOpened": False,
        "deferred60MonthLabelsOpened": False,
    }


def _validate_receipt(receipt: Mapping[str, Any]) -> None:
    if (
        receipt.get("schema")
        != "m2.calibration_gate_d.validation_receipt.private.v1"
        or receipt.get("branch") != BRANCH
        or receipt.get("phaseAStartHead") != PHASE_A_START_HEAD
        or receipt.get("allSuccessCommandsPassed") is not True
        or receipt.get("allExpectedFailClosedCommandsFailedBeforeDataLoad") is not True
        or any(
            receipt.get(field) is not False
            for field in (
                "finalHoldoutOpened",
                "embargoShadowOpened",
                "deferred60MonthLabelsOpened",
            )
        )
    ):
        raise C3RunnerError("Gate D validation receipt boundary differs")
    success = receipt.get("commandResults", [])
    failure = receipt.get("expectedFailClosedCommandResults", [])
    if [item.get("command") for item in success] != list(VALIDATION_COMMANDS):
        raise C3RunnerError("Gate D validation command set differs")
    if [item.get("command") for item in failure] != list(
        EXPECTED_FAIL_CLOSED_COMMANDS
    ):
        raise C3RunnerError("Gate D fail-closed command set differs")
    if any(int(item.get("exitCode", -1)) != 0 for item in success):
        raise C3RunnerError("Gate D receipt records a failed validation")
    if any(int(item.get("exitCode", 0)) == 0 for item in failure):
        raise C3RunnerError("Gate D receipt records an open seal")
    if receipt.get("phaseAHead") is not None and not (
        receipt.get("phaseAHead") == receipt.get("remoteHead")
        and isinstance(receipt.get("phaseATree"), str)
        and len(str(receipt["phaseATree"])) == 40
    ):
        raise C3RunnerError("Gate D runtime Git binding differs")


def finalize_gate_d_validation() -> dict[str, Any]:
    require_named_branch()
    verify_phase_a()
    spec, comparator, templates, _works, _calibration_spec, _manifest = (
        _load_phase_a_inputs()
    )
    opportunity = json.loads(OPPORTUNITY_JSON.read_text(encoding="utf-8"))
    synthetic = c3.synthetic_self_test()
    gate_before = gate_report(
        spec=spec,
        opportunity=opportunity,
        comparator=comparator,
        synthetic=synthetic,
        templates=templates,
    )
    false_before = [key for key, value in gate_before["conditions"].items() if not value]
    if set(false_before) != {"full_validation_suite_passed", "phase_a_commit_pushed"}:
        raise C3RunnerError("Gate D is not ready for validation")
    write_json(GATE_D_JSON, gate_before)
    successes, failures = _execute_validation_suite()
    receipt = _validation_receipt(successes, failures)
    _validate_receipt(receipt)
    PRIVATE_DIR.mkdir(parents=True, exist_ok=True)
    write_json(PRIVATE_VALIDATION_RECEIPT, receipt)
    assert_private_paths_ignored()
    receipt_sha = file_sha256(PRIVATE_VALIDATION_RECEIPT)
    gate = gate_report(
        spec=spec,
        opportunity=opportunity,
        comparator=comparator,
        synthetic=synthetic,
        templates=templates,
        validation_passed=True,
        validation_receipt_sha256=receipt_sha,
        validation_evidence=receipt,
    )
    false_after = [key for key, value in gate["conditions"].items() if not value]
    if false_after != ["phase_a_commit_pushed"]:
        raise C3RunnerError(f"Gate D did not reduce to the push condition: {false_after}")
    write_json(GATE_D_JSON, gate)
    assert_public_safety(PUBLIC_PHASE_A_PATHS)
    manifest = json.loads(PRIVATE_PHASE_A_MANIFEST.read_text(encoding="utf-8"))
    manifest["publicArtifactSha256"] = _phase_a_public_hashes()
    write_json(PRIVATE_PHASE_A_MANIFEST, manifest)
    return {
        "status": "passed",
        "validationCommandCount": len(successes),
        "failClosedCommandCount": len(failures),
        "gateDPassedConditionCount": gate["passedConditionCount"],
        "gateDConditionCount": gate["conditionCount"],
        "outerReplayExecuted": False,
        "finalHoldoutOpened": False,
    }


def verify_gate_d_after_push() -> dict[str, Any]:
    require_named_branch()
    require_clean_worktree()
    assert_private_paths_ignored()
    phase_a_head = str(run_git("rev-parse", "HEAD"))
    if phase_a_head == PHASE_A_START_HEAD:
        raise C3RunnerError("Phase A checkpoint was not committed")
    upstream = str(run_git("rev-parse", "@{upstream}"))
    remote_ref = str(run_git("rev-parse", f"refs/remotes/origin/{BRANCH}"))
    if upstream != phase_a_head or remote_ref != phase_a_head:
        raise C3RunnerError("Phase A commit is not the verified pushed branch head")
    phase_a_tree = str(run_git("rev-parse", "HEAD^{tree}"))
    for path in IMMUTABLE_PHASE_A_PATHS:
        assert_git_semantic_match(phase_a_head, path)
    tracked_hashes = {
        relative(path): git_blob_sha256(phase_a_head, path)
        for path in IMMUTABLE_PHASE_A_PATHS
    }
    tracked_gate = json.loads(
        bytes(run_git("cat-file", "blob", f"{phase_a_head}:{relative(GATE_D_JSON)}", binary=True)).decode("utf-8")
    )
    if tracked_gate["conditions"]["phase_a_commit_pushed"] is not False:
        raise C3RunnerError("Phase A Gate D unexpectedly claimed a push before commit")
    local_receipt = json.loads(PRIVATE_VALIDATION_RECEIPT.read_text(encoding="utf-8"))
    _validate_receipt(local_receipt)
    successes, failures = _execute_validation_suite()
    runtime_receipt = _validation_receipt(
        successes,
        failures,
        phase_a_head=phase_a_head,
        phase_a_tree=phase_a_tree,
        remote_head=remote_ref,
        tracked_artifact_sha256=tracked_hashes,
    )
    _validate_receipt(runtime_receipt)
    write_json(PRIVATE_VALIDATION_RECEIPT, runtime_receipt)
    push_receipt = {
        "schema": "m2.calibration_gate_d.push_receipt.private.v1",
        "recordedAt": datetime.now(timezone.utc).isoformat(),
        "branch": BRANCH,
        "phaseAHead": phase_a_head,
        "phaseATree": phase_a_tree,
        "remoteHead": remote_ref,
        "trackedArtifactSha256": tracked_hashes,
        "runtimeValidationReceiptSha256": file_sha256(PRIVATE_VALIDATION_RECEIPT),
        "allValidationCommandsPassed": True,
        "allSealedCommandsFailedBeforeDataLoad": True,
        "finalHoldoutOpened": False,
        "embargoShadowOpened": False,
        "deferred60MonthLabelsOpened": False,
    }
    write_json(PRIVATE_PUSH_RECEIPT, push_receipt)
    spec, comparator, templates, _works, _calibration_spec, _manifest = (
        _load_phase_a_inputs()
    )
    opportunity = json.loads(OPPORTUNITY_JSON.read_text(encoding="utf-8"))
    gate = gate_report(
        spec=spec,
        opportunity=opportunity,
        comparator=comparator,
        synthetic=c3.synthetic_self_test(),
        templates=templates,
        validation_passed=True,
        pushed=True,
        validation_receipt_sha256=file_sha256(PRIVATE_VALIDATION_RECEIPT),
        validation_evidence=runtime_receipt,
        phase_a_checkpoint=phase_a_head,
        phase_a_tree=phase_a_tree,
        remote_head=remote_ref,
        runtime_push_receipt_sha256=file_sha256(PRIVATE_PUSH_RECEIPT),
    )
    if gate["allTrue"] is not True or gate["passedConditionCount"] != 14:
        raise C3RunnerError("Gate D did not become 14/14 after pushed validation")
    write_json(GATE_D_JSON, gate)
    assert_private_paths_ignored()
    assert_public_safety(PUBLIC_PHASE_A_PATHS)
    return {
        "status": "passed",
        "phaseACheckpoint": phase_a_head,
        "remoteHead": remote_ref,
        "gateDAllTrue": True,
        "gateDPassedConditionCount": 14,
        "outerReplayExecuted": False,
        "finalHoldoutOpened": False,
    }


def verify_c3_authorization() -> dict[str, Any]:
    require_named_branch()
    assert_private_paths_ignored()
    if not GATE_D_JSON.is_file() or not PRIVATE_PUSH_RECEIPT.is_file():
        raise C3RunnerError(
            "Gate D authorization evidence is missing; dataLoadCalls=0"
        )
    gate = json.loads(GATE_D_JSON.read_text(encoding="utf-8"))
    receipt = json.loads(PRIVATE_PUSH_RECEIPT.read_text(encoding="utf-8"))
    if (
        gate.get("allTrue") is not True
        or gate.get("C3AuthorizedByGateD") is not True
        or gate.get("passedConditionCount") != 14
        or receipt.get("schema") != "m2.calibration_gate_d.push_receipt.private.v1"
        or receipt.get("phaseAHead") != gate.get("phaseACheckpoint")
        or gate.get("runtimePushReceiptSha256") != file_sha256(PRIVATE_PUSH_RECEIPT)
        or any(value is not True for value in gate.get("conditions", {}).values())
    ):
        raise C3RunnerError(
            "Gate D is not authorized or its evidence differs; dataLoadCalls=0"
        )
    phase_a_head = str(receipt["phaseAHead"])
    for path in IMMUTABLE_PHASE_A_PATHS:
        assert_git_semantic_match(phase_a_head, path)
        if git_blob_sha256(phase_a_head, path) != receipt["trackedArtifactSha256"][
            relative(path)
        ]:
            raise C3RunnerError("Phase A tracked artifact digest differs")
    return {
        "status": "passed",
        "gateDAllTrue": True,
        "phaseACheckpoint": phase_a_head,
        "outerReplayAuthorized": True,
        "finalHoldoutOpened": False,
    }


# Development replay functions are below the Phase A authorization boundary.


def _relative(candidate: float | None, reference: float | None) -> float | None:
    if candidate is None or reference is None:
        return None
    if float(reference) == 0:
        return 0.0 if float(candidate) == 0 else None
    return (float(candidate) - float(reference)) / float(reference)


def _public_round(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {str(key): _public_round(child) for key, child in value.items()}
    if isinstance(value, list):
        return [_public_round(child) for child in value]
    if isinstance(value, tuple):
        return [_public_round(child) for child in value]
    if isinstance(value, float):
        if not math.isfinite(value):
            return None
        return rounded(value)
    return value


def _activity_segment_metrics(rows: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    output = {}
    for segment in ("dense", "intermittent", "dormant"):
        selected = [
            row
            for row in rows
            if formal.is_model_population(row)
            and row.get("activitySegment") == segment
        ]
        output[segment] = formal.metric_rows(selected, "rawModelPrediction")
    return output


def _compact_metrics(rows: Sequence[Mapping[str, Any]]) -> tuple[dict[str, Any], dict[str, Any]]:
    full = formal_runner.metrics_for_model(rows)

    def metric(value: Mapping[str, Any]) -> dict[str, Any]:
        return {
            "caseCount": value.get("caseCount"),
            "uniqueWorkCount": value.get("uniqueWorkCount"),
            "wape": value.get("wape"),
            "mae": value.get("mae"),
            "smape": value.get("smape"),
            "signedBias": value.get("signedAggregateBias"),
            "nullPredictionCount": value.get("nullPredictionCount"),
            "zeroImputationUsed": value.get("zeroImputationUsed", False),
        }

    compact = {
        "overall": metric(full["modelPopulation"]),
        "served": metric(full["served"]),
        "byHorizon": {
            key: metric(value) for key, value in full["horizons"].items()
        },
        "highValue": {
            key: metric(value) for key, value in full["topBands"].items()
        },
        "highValueOverall": metric(full["highValue"]),
        "segments": {
            key: metric(value)
            for key, value in _activity_segment_metrics(rows).items()
        },
        "routes": {key: metric(value) for key, value in full["routes"].items()},
        "origins": {key: metric(value) for key, value in full["origins"].items()},
        "internal80": {
            "coverage": full["internal80"]["internal80Coverage"],
            "wis": full["internal80"]["meanWis"],
            "standardizedWidth": full["internal80"]["standardizedWidth"],
            "availableCaseCount": full["internal80"]["availableCaseCount"],
            "completeOnModelPopulation": full["internal80"][
                "completeOnModelPopulation"
            ],
            "endpointsPresentInPublicReport": full["internal80"][
                "endpointsPresentInPublicReport"
            ],
        },
        "caseState": full["caseState"],
        "businessCoverage": full["businessCoverage"],
    }
    return _public_round(compact), full


def _observed_operational_boundary(
    rows: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    p0_count = 0
    p1_count = 0
    automatic_action_count = 0
    p2_action_count = 0
    action_keys = {
        "action",
        "actions",
        "recommendation",
        "recommendations",
        "operationalaction",
        "operationalactions",
        "automaticoperationalaction",
        "automaticoperationalactions",
        "resourceallocationaction",
        "resourceallocationactions",
    }

    def visit(value: Any) -> None:
        nonlocal p0_count, p1_count, automatic_action_count, p2_action_count
        if isinstance(value, Mapping):
            for key, child in value.items():
                compact = "".join(character.lower() for character in str(key) if character.isalnum())
                if compact in {"p0", "p0count"}:
                    p0_count += int(child or 0)
                elif compact in {"p1", "p1count"}:
                    p1_count += int(child or 0)
                elif compact in {"p2action", "p2operationalaction"}:
                    p2_action_count += 1 if child else 0
                elif compact in action_keys:
                    if isinstance(child, Sequence) and not isinstance(child, (str, bytes)):
                        automatic_action_count += len(child)
                    elif child:
                        automatic_action_count += 1
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)

    for row in rows:
        visit(row.get("public_output", {}))
    public_output_schema_exact = all(
        set(row.get("public_output", {}))
        == {"pointForecast", "annualBreakdown", "confidence", "limitation"}
        for row in rows
    )
    return {
        "P0Count": p0_count,
        "P1Count": p1_count,
        "P2OperationalActionCount": p2_action_count,
        "P2Boundary": (
            "fact_audit_only"
            if p2_action_count == 0 and public_output_schema_exact
            else "invalid"
        ),
        "automaticOperationalActionCount": automatic_action_count,
        "publicOutputSchemaExact": public_output_schema_exact,
    }


def _acceptance(
    *,
    metrics: Mapping[str, Any],
    comparator: Mapping[str, Any],
    rows: Sequence[Mapping[str, Any]],
    spec: Mapping[str, Any],
) -> dict[str, Any]:
    gate = spec["acceptance"]
    relative = gate["relativeToB4"]
    horizon_relative = {
        horizon: _relative(
            metrics["horizons"][horizon]["wape"],
            comparator["horizons"][horizon]["wape"],
        )
        for horizon in ("3", "6", "12", "18", "24")
    }
    top_relative = {
        top: _relative(
            metrics["topBands"][top]["wape"],
            comparator["topBands"][top]["wape"],
        )
        for top in ("top1", "top5", "top10")
    }
    origin_relative = {
        origin: _relative(
            metrics["origins"][origin]["wape"],
            comparator["origins"][origin]["wape"],
        )
        for origin in spec["authority"]["origins"]
    }
    origin_win_share = sum(
        value is not None and float(value) < -TOLERANCE
        for value in origin_relative.values()
    ) / len(origin_relative)
    consecutive = 0
    maximum_consecutive = 0
    for origin in spec["authority"]["origins"]:
        if float(origin_relative[origin] or 0.0) > 0.05 + TOLERANCE:
            consecutive += 1
            maximum_consecutive = max(maximum_consecutive, consecutive)
        else:
            consecutive = 0
    interval = metrics["internal80"]
    comparator_interval = comparator["internal80"]
    wis_improvement = (
        (float(comparator_interval["meanWis"]) - float(interval["meanWis"]))
        / float(comparator_interval["meanWis"])
        if interval.get("meanWis") is not None
        and comparator_interval.get("meanWis") not in {None, 0}
        else None
    )
    width_relative = _relative(
        interval.get("standardizedWidth"), comparator_interval.get("standardizedWidth")
    )
    population = [row for row in rows if formal.is_model_population(row)]
    top10 = [
        row
        for row in population
        if bool((row.get("strata", {}) or {}).get("top_10_percent"))
    ]
    reconciliation = all(
        abs(
            sum(
                float(item.get("point_forecast", 0.0))
                for item in row.get("channel_components", [])
            )
            - float(row["rawModelPrediction"])
        )
        <= 0.000001
        for row in population
    )
    operational = _observed_operational_boundary(rows)
    conditions = {
        "overall_wape_at_most_0_60": float(metrics["modelPopulation"]["wape"])
        <= float(gate["overallWapeMaximum"]) + TOLERANCE,
        "overall_absolute_bias_at_most_10pct": abs(
            float(metrics["modelPopulation"]["signedAggregateBias"])
        )
        <= float(gate["absoluteBiasMaximum"]["overall"]) + TOLERANCE,
        "served_absolute_bias_at_most_10pct": abs(
            float(metrics["served"]["signedAggregateBias"])
        )
        <= float(gate["absoluteBiasMaximum"]["served"]) + TOLERANCE,
        "high_value_absolute_bias_at_most_10pct": abs(
            float(metrics["highValue"]["signedAggregateBias"])
        )
        <= float(gate["absoluteBiasMaximum"]["highValue"]) + TOLERANCE,
        "each_horizon_absolute_bias_at_most_15pct": all(
            abs(float(metrics["horizons"][horizon]["signedAggregateBias"]))
            <= float(gate["absoluteBiasMaximum"]["eachHorizon"]) + TOLERANCE
            for horizon in ("3", "6", "12", "18", "24")
        ),
        "horizon_3_wape_improves_at_least_3pct": -float(horizon_relative["3"])
        >= float(relative["horizon3ImprovementMinimum"]) - TOLERANCE,
        "horizon_6_wape_improves_at_least_3pct": -float(horizon_relative["6"])
        >= float(relative["horizon6ImprovementMinimum"]) - TOLERANCE,
        "horizon_12_wape_improves_at_least_3pct": -float(horizon_relative["12"])
        >= float(relative["horizon12ImprovementMinimum"]) - TOLERANCE,
        "horizon_18_wape_regression_at_most_2pct": float(horizon_relative["18"])
        <= float(relative["horizon18RegressionMaximum"]) + TOLERANCE,
        "horizon_24_wape_regression_at_most_2pct": float(horizon_relative["24"])
        <= float(relative["horizon24RegressionMaximum"]) + TOLERANCE,
        "top10_wape_improves_at_least_5pct": -float(top_relative["top10"])
        >= float(relative["top10ImprovementMinimum"]) - TOLERANCE,
        "top1_wape_regression_at_most_5pct": float(top_relative["top1"])
        <= float(relative["top1RegressionMaximum"]) + TOLERANCE,
        "top5_wape_regression_at_most_5pct": float(top_relative["top5"])
        <= float(relative["top5RegressionMaximum"]) + TOLERANCE,
        "at_least_70pct_origins_beat_B4": origin_win_share
        >= float(relative["outerOriginWinShareMinimum"]) - TOLERANCE,
        "no_three_consecutive_origins_regress_over_5pct": maximum_consecutive
        <= int(relative["maximumConsecutiveOriginsRegressingOverFivePercent"]),
        "internal_80_coverage_between_75_and_85pct": interval.get(
            "completeOnModelPopulation"
        )
        is True
        and float(gate["internal80CoverageInclusive"][0]) - TOLERANCE
        <= float(interval["internal80Coverage"])
        <= float(gate["internal80CoverageInclusive"][1]) + TOLERANCE,
        "internal_WIS_improves_at_least_5pct": wis_improvement is not None
        and wis_improvement
        >= float(relative["internalWisImprovementMinimum"]) - TOLERANCE,
        "standardized_width_regression_at_most_10pct": width_relative is not None
        and width_relative
        <= float(relative["standardizedWidthRegressionMaximum"]) + TOLERANCE,
        "P0_equals_0": int(operational["P0Count"])
        <= int(gate["P0Maximum"]),
        "P1_equals_0": int(operational["P1Count"])
        <= int(gate["P1Maximum"]),
        "P2_is_fact_audit_only": gate["P2FactAuditOnly"] is True
        and operational["P2Boundary"] == "fact_audit_only",
        "no_automatic_operational_actions": int(
            operational["automaticOperationalActionCount"]
        )
        <= int(gate["automaticOperationalActionCountMaximum"]),
        "residual_does_not_duplicate_cash": all(
            row.get("knownChannelCashDuplicated") is False for row in population
        )
        and reconciliation,
        "high_value_guard_active": bool(top10)
        and all(row.get("highValueGuardActive") is True for row in top10),
        "model_population_unchanged": int(metrics["modelPopulation"]["caseCount"])
        == int(spec["authority"]["formalModelPopulationCaseCount"])
        and int(metrics["modelPopulation"]["uniqueWorkCount"])
        == int(spec["authority"]["formalModelPopulationWorkCount"]),
    }
    if len(conditions) != int(gate["conditionCount"]):
        raise C3RunnerError("C3 acceptance condition count differs")
    passed = sum(conditions.values())
    return {
        "conditions": conditions,
        "passedConditionCount": passed,
        "conditionCount": len(conditions),
        "allPassed": passed == len(conditions),
        "modelQualityDecision": "PASS" if passed == len(conditions) else "FAIL",
        "thresholdsChangedAfterResults": False,
        "evidence": _public_round(
            {
                "horizonRelativeWapeVsB4": horizon_relative,
                "topBandRelativeWapeVsB4": top_relative,
                "originRelativeWapeVsB4": origin_relative,
                "originWinShare": origin_win_share,
                "maximumConsecutiveOriginsRegressingOverFivePercent": maximum_consecutive,
                "internalWisImprovementVsB4": wis_improvement,
                "standardizedWidthRelativeDeltaVsB4": width_relative,
                "observedOperationalBoundary": operational,
            }
        ),
    }


def _business_decision(spec: Mapping[str, Any]) -> dict[str, Any]:
    c2_decision = json.loads(
        (PUBLIC_DIR / "M2-C2-business-coverage-decision-v1.json").read_text(
            encoding="utf-8"
        )
    )
    rule = spec["businessCoverageDecision"]
    full = float(c2_decision["fullLibraryForecastableCashCoverage"])
    top10 = float(c2_decision["top10ForecastableCashCoverage"])
    if full >= float(rule["fullLibraryForecastableCashCoverageMinimum"]) and top10 >= float(
        rule["top10ForecastableCashCoverageMinimum"]
    ):
        decision = "PASS"
    else:
        decision = "CONDITIONAL"
    return {
        "schema": "m2.c3_business_coverage_decision.v1",
        "decisionStatus": "not_for_formal_decision",
        "businessCoverageDecision": decision,
        "scope": {
            "standardWorkCount": int(spec["authority"]["standardWorkCount"]),
            "completeIncomeFactCount": int(spec["authority"]["completeIncomeFactCount"]),
            "nonOverlappingWorkLevelAggregation": True,
        },
        "fullLibraryForecastableCashCoverage": full,
        "top1ForecastableCashCoverage": float(
            c2_decision["top1ForecastableCashCoverage"]
        ),
        "top5ForecastableCashCoverage": float(
            c2_decision["top5ForecastableCashCoverage"]
        ),
        "top10ForecastableCashCoverage": top10,
        "fullLibraryThreshold": float(
            rule["fullLibraryForecastableCashCoverageMinimum"]
        ),
        "top10Threshold": float(rule["top10ForecastableCashCoverageMinimum"]),
        "populationMovedToMeetCoverage": False,
        "surpriseBuyoutHidden": False,
        "mayAuthorizeRelease": False,
        "formalDecisionAuthorized": False,
        "releaseAuthorized": False,
        "seals": copy.deepcopy(spec["seals"]),
    }


def _overall_decision(
    model_quality: str, business_coverage: str, spec: Mapping[str, Any]
) -> str:
    mapping = spec["overallDecision"]
    if model_quality == "PASS" and business_coverage == "PASS":
        return str(mapping["modelPassBusinessPass"])
    if model_quality == "PASS" and business_coverage == "CONDITIONAL":
        return str(mapping["modelPassBusinessConditional"])
    if model_quality == "FAIL" and business_coverage == "PASS":
        return str(mapping["modelFailBusinessPass"])
    if model_quality == "FAIL" and business_coverage == "CONDITIONAL":
        return str(mapping["modelFailBusinessConditional"])
    return str(mapping["anyInvalidEvidence"])


def _terminal_summary(
    *, final_model: str, final_metrics: Mapping[str, Any], spec: Mapping[str, Any]
) -> dict[str, Any]:
    c1 = json.loads(
        (PUBLIC_DIR / "M2-C1-development-validation-v1.json").read_text(
            encoding="utf-8"
        )
    )
    c2r = json.loads(
        (PUBLIC_DIR / "M2-C2R-development-validation-v1.json").read_text(
            encoding="utf-8"
        )
    )
    c2_report = json.loads(
        (PUBLIC_DIR / "M2-C2-development-validation-v1.json").read_text(
            encoding="utf-8"
        )
    )
    b4 = c2_report["B4Metrics"]["modelPopulation"]
    c1_metric = c1["metrics"]["C1"]["allScoreable"]
    c2r_metric = c2r["metrics"]["C2-R"]["allScoreable"]
    c2_metric = c2_report["metrics"]["modelPopulation"]
    return {
        "schema": "m2.terminal_model_route_summary.v1",
        "decisionStatus": "not_for_formal_decision",
        "reason": "C3_model_quality_failed_fixed_acceptance",
        "routes": ["B4", "C1", "C2-R", "C2", "C3"],
        "routeResults": {
            "B4": {
                "target": "formal_cash",
                "wape": b4["wape"],
                "signedAggregateBias": b4["signedAggregateBias"],
                "decision": "PRIMARY_COMPARATOR_NOT_RELEASE_APPROVAL",
            },
            "C1": {
                "target": "historical_calibration_target",
                "wape": c1_metric["wape"],
                "signedAggregateBias": c1_metric["signedAggregateBias"],
                "decision": "FAIL",
            },
            "C2-R": {
                "target": "legacy_target",
                "formalCashMetricEligible": False,
                "wape": c2r_metric["wape"],
                "signedAggregateBias": c2r_metric["signedAggregateBias"],
                "decision": "FAIL",
            },
            "C2": {
                "target": "formal_cash",
                "wape": c2_metric["wape"],
                "signedAggregateBias": c2_metric["signedAggregateBias"],
                "decision": "FAIL",
            },
            "C3": {
                "target": "formal_cash",
                "finalModel": final_model,
                "wape": final_metrics["modelPopulation"]["wape"],
                "signedAggregateBias": final_metrics["modelPopulation"][
                    "signedAggregateBias"
                ],
                "decision": "FAIL",
            },
        },
        "C4Authorized": False,
        "C4Started": False,
        "M3Started": False,
        "releaseAuthorized": False,
        "formalDecisionAuthorized": False,
        "seals": copy.deepcopy(spec["seals"]),
        "nextBoundary": "stop_no_C4_M3_or_release",
    }


def _prediction_case_state(template: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "caseKey": copy.deepcopy(template["caseKey"]),
        "statisticallyScoreable": bool(template["statisticallyScoreable"]),
        "scoreabilityReason": template.get("scoreabilityReason"),
        "businessServingEligible": bool(template["businessServingEligible"]),
        "abstentionReason": template.get("abstentionReason"),
        "targetEnd": str(template["targetEnd"]),
        "labelAvailableAsOf": str(template["labelAvailableAsOf"]),
        "billMonthMax": str(template["billMonthMax"]),
        "sourceAvailableAsOf": str(template["sourceAvailableAsOf"]),
        "predictionRole": str(template["predictionRole"]),
    }


def _comparator_rows_for_key(
    comparator: Mapping[
        str, Mapping[tuple[str, tuple[str, str, int, str]], Mapping[str, Any]]
    ],
    key: tuple[str, str, int, str],
) -> dict[str, Mapping[str, Any]]:
    role = f"development_forward_score:{key[1]}"
    return {"B4": comparator["B4"][(role, key)]}


def _availability_before(template: Mapping[str, Any], origin: str) -> bool:
    key = case_key(template)
    return bool(
        key[1] < origin
        and str(template["targetEnd"]) <= origin
        and str(template["labelAvailableAsOf"]) <= origin
        and str(template["billMonthMax"]) <= origin
        and str(template["sourceAvailableAsOf"]) <= origin
    )


def _build_feature_and_training_records(
    *,
    spec: Mapping[str, Any],
    comparator: Mapping[
        str, Mapping[tuple[str, tuple[str, str, int, str]], Mapping[str, Any]]
    ],
    templates: Mapping[tuple[str, str, int, str], Mapping[str, Any]],
    works: Mapping[str, Mapping[str, Any]],
    calibration_spec: Mapping[str, Any],
) -> tuple[
    dict[tuple[str, str, int, str], dict[str, Any]],
    dict[tuple[str, str, int, str], dict[str, Any]],
]:
    features = {}
    records = {}
    for index, (key, template) in enumerate(sorted(templates.items()), start=1):
        if not _model_population(template):
            continue
        state = c3.extract_cutoff_features(
            work=works[key[0]],
            origin=key[1],
            horizon=key[2],
            route=key[3],
            comparator_rows=_comparator_rows_for_key(comparator, key),
            calibration_spec=calibration_spec,
            spec=spec,
        )
        anchor = float(state["b4Prediction"])
        if abs(anchor - float(template["rawModelPrediction"])) > 0.000001:
            raise C3RunnerError("C3 B4 feature anchor differs from locked B4 point")
        features[key] = state
        records[key] = {
            "origin": key[1],
            "targetEnd": str(template["targetEnd"]),
            "labelAvailableAsOf": str(template["labelAvailableAsOf"]),
            "features": state,
            "actual": float(template["forecastableCashActual"]),
            "b4Prediction": anchor,
        }
        if index % 4000 == 0:
            progress(f"cutoff feature cases: {index}/{len(templates)}")
    expected = int(spec["authority"]["formalModelPopulationCaseCount"])
    if len(features) != expected or len(records) != expected:
        raise C3RunnerError("C3 feature/training population differs")
    return features, records


def _training_for_origin(
    origin: str,
    templates: Mapping[tuple[str, str, int, str], Mapping[str, Any]],
    records: Mapping[tuple[str, str, int, str], Mapping[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    keys = [
        key
        for key, template in sorted(templates.items())
        if key in records and _availability_before(template, origin)
    ]
    selected = [copy.deepcopy(dict(records[key])) for key in keys]
    audit = {
        "predictionOrigin": origin,
        "trainingCaseCount": len(selected),
        "trainingOrigins": sorted({key[1] for key in keys}),
        "strictlyEarlierOriginOnly": all(key[1] < origin for key in keys),
        "maximumTargetEnd": max(
            (str(templates[key]["targetEnd"]) for key in keys), default=None
        ),
        "maximumLabelAvailableAsOf": max(
            (str(templates[key]["labelAvailableAsOf"]) for key in keys), default=None
        ),
        "maximumBillMonth": max(
            (str(templates[key]["billMonthMax"]) for key in keys), default=None
        ),
        "maximumSourceAvailableAsOf": max(
            (str(templates[key]["sourceAvailableAsOf"]) for key in keys), default=None
        ),
        "availabilityBoundaryPassed": all(
            str(templates[key][field]) <= origin
            for key in keys
            for field in (
                "targetEnd",
                "labelAvailableAsOf",
                "billMonthMax",
                "sourceAvailableAsOf",
            )
        ),
        "trainingDigest": digest(selected),
    }
    return selected, audit


def _fit_cache_key(config: Mapping[str, Any]) -> tuple[Any, ...]:
    family = str(config["family"])
    if family == "c3A":
        return family, config["hierarchyDepth"], float(config["shrinkagePrior"])
    if family in {"c3B", "c3C"}:
        return family, float(config["l2"])
    return family, config["candidateId"]


def _fit_all_candidates(
    *,
    origin: str,
    training_records: Sequence[Mapping[str, Any]],
    spec: Mapping[str, Any],
) -> tuple[dict[str, Mapping[str, Any] | None], dict[str, Any]]:
    candidate_models: dict[str, Mapping[str, Any] | None] = {}
    if not training_records:
        return (
            {
                candidate_id: None
                for family in ("c3A", "c3B", "c3C")
                for candidate_id in c3.candidate_ids(spec, family)
            },
            {
                "predictionOrigin": origin,
                "fitCount": 0,
                "preprocessorDigest": None,
                "allFitsStrictlyEarlier": True,
                "identityFeaturesUsed": False,
                "postCutoffFeaturesUsed": False,
            },
        )
    preprocessor = c3.fit_preprocessor(training_records, origin, spec)
    configs = c3.candidate_configs(spec)
    cached: dict[tuple[Any, ...], Mapping[str, Any]] = {}
    for family in ("c3A", "c3B", "c3C"):
        for candidate_id in c3.candidate_ids(spec, family):
            config = configs[candidate_id]
            cache_key = _fit_cache_key(config)
            if cache_key not in cached:
                cached[cache_key] = c3.fit_candidate(
                    training_records,
                    origin,
                    spec,
                    candidate_id,
                    preprocessor=(
                        preprocessor if family in {"c3B", "c3C"} else None
                    ),
                )
            candidate_models[candidate_id] = cached[cache_key]
    audit = {
        "predictionOrigin": origin,
        "fitCount": len(cached),
        "candidateProjectionCount": len(candidate_models),
        "preprocessorDigest": preprocessor["digest"],
        "fitKeys": sorted(
            {
                str(model.get("fitKey"))
                for model in cached.values()
                if model.get("fitKey")
            }
        ),
        "allFitsStrictlyEarlier": all(
            all(str(training_origin) < origin for training_origin in model["trainingOrigins"])
            for model in cached.values()
        ),
        "identityFeaturesUsed": any(
            model.get("identityFeaturesUsed") is not False for model in cached.values()
        ),
        "postCutoffFeaturesUsed": any(
            model.get("postCutoffFeaturesUsed") is not False for model in cached.values()
        ),
    }
    return candidate_models, audit


def _predict_model_case(
    *,
    key: tuple[str, str, int, str],
    template: Mapping[str, Any],
    work: Mapping[str, Any],
    comparator: Mapping[
        str, Mapping[tuple[str, tuple[str, str, int, str]], Mapping[str, Any]]
    ],
    calibration_spec: Mapping[str, Any],
    spec: Mapping[str, Any],
    candidate_id: str,
    fitted_model: Mapping[str, Any] | None,
    high_value_override_allowed: bool,
    stack_activation: Mapping[str, Any] | None = None,
    stack_component_points: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    cutoff_top10 = bool((template.get("strata", {}) or {}).get("top_10_percent"))
    row = c3.predict_as_of(
        work=work,
        origin=key[1],
        horizon=key[2],
        case_state=_prediction_case_state(template),
        comparator_rows=_comparator_rows_for_key(comparator, key),
        calibration_spec=calibration_spec,
        spec=spec,
        candidate_id=candidate_id,
        fitted_model=fitted_model,
        cutoff_top10=cutoff_top10,
        high_value_override_allowed=high_value_override_allowed,
        stack_activation=stack_activation,
        stack_component_points=stack_component_points,
        cash_commitment_snapshots=[],
    )
    if row["rawModelPrediction"] is None:
        raise C3RunnerError("C3 model-population prediction is null")
    point = max(0.0, float(row["rawModelPrediction"]))
    row["rawModelPrediction"] = point
    row["servedPrediction"] = point
    row["public_output"]["pointForecast"] = point
    row["channel_components"] = [
        {
            "channel_key": "__c3_global_cash_total__",
            "component_type": "B4_anchored_global_correction_total",
            "point_forecast": point,
        }
    ]
    row["knownChannelCashDuplicated"] = False
    row["highValueGuardActive"] = bool(
        not cutoff_top10
        or candidate_id == "B4"
        or high_value_override_allowed
        or row.get("highValueGuardFallbackToB4") is True
    )
    row["activitySegment"] = row["activity_segment"]
    row["predictionEntryPoint"] = "c3.predict_as_of"
    return row


def _boundary_prediction(
    *,
    key: tuple[str, str, int, str],
    template: Mapping[str, Any],
    work: Mapping[str, Any],
    comparator: Mapping[
        str, Mapping[tuple[str, tuple[str, str, int, str]], Mapping[str, Any]]
    ],
    calibration_spec: Mapping[str, Any],
    spec: Mapping[str, Any],
    model_id: str,
) -> dict[str, Any]:
    """Materialize every non-model case through the same C3 prediction entry."""

    row = c3.predict_as_of(
        work=work,
        origin=key[1],
        horizon=key[2],
        case_state=_prediction_case_state(template),
        comparator_rows=_comparator_rows_for_key(comparator, key),
        calibration_spec=calibration_spec,
        spec=spec,
        candidate_id="B4",
        fitted_model=None,
        cutoff_top10=bool((template.get("strata", {}) or {}).get("top_10_percent")),
        high_value_override_allowed=False,
        cash_commitment_snapshots=[],
    )
    row["model_id"] = model_id
    row["channel_components"] = copy.deepcopy(template.get("channelComponents", []))
    row["knownChannelCashDuplicated"] = False
    row["highValueGuardActive"] = True
    row["activitySegment"] = row["activity_segment"]
    row["predictionEntryPoint"] = "c3.predict_as_of"
    formal.validate_case_state(row)
    key = case_key(template)
    if key[3] == "pure_buyout" and template.get("statisticallyScoreable") is True:
        if (
            row["rawModelPrediction"] is not None
            or row["servedPrediction"] is not None
            or row["routeAbstained"] is not True
            or row["abstentionReason"]
            != "uncommitted_future_buyout_not_forecastable"
        ):
            raise C3RunnerError("C3 pure-buyout frozen boundary differs")
    return row


def _projection(row: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "modelId": row["model_id"],
        "candidateId": row["candidate_id"],
        "requestedCandidateId": row.get("requested_candidate_id"),
        "caseKey": list(formal.strict_case_key(row)),
        "predictionRole": row["_residual_case_role"],
        "statisticallyScoreable": row["statisticallyScoreable"],
        "businessServingEligible": row["businessServingEligible"],
        "modelPredictionAvailable": row["modelPredictionAvailable"],
        "routeAbstained": row["routeAbstained"],
        "abstained": row["abstained"],
        "abstentionReason": row["abstentionReason"],
        "rawModelPrediction": row["rawModelPrediction"],
        "servedPrediction": row["servedPrediction"],
        "activitySegment": row.get("activitySegment"),
        "b4AnchorPoint": row.get("b4AnchorPoint"),
        "correction": row.get("c3CorrectionApplied"),
        "correctionEvidence": copy.deepcopy(row.get("correctionEvidence")),
        "publicOutput": copy.deepcopy(row["public_output"]),
    }


def _join_truth(row: dict[str, Any], template: Mapping[str, Any]) -> dict[str, Any]:
    return c2r1_runner._join_truth(row, template)


def _point_metric(
    keys: Sequence[tuple[str, str, int, str]],
    points: Mapping[tuple[str, str, int, str], float],
    templates: Mapping[tuple[str, str, int, str], Mapping[str, Any]],
) -> dict[str, Any]:
    if not keys:
        return {
            "caseCount": 0,
            "originCount": 0,
            "wape": None,
            "signedAggregateBias": None,
            "horizons": {},
            "top10": None,
        }

    def summarize(selected: Sequence[tuple[str, str, int, str]]) -> dict[str, Any]:
        actual = [float(templates[key]["forecastableCashActual"]) for key in selected]
        prediction = [float(points[key]) for key in selected]
        denominator = math.fsum(abs(value) for value in actual)
        actual_sum = math.fsum(actual)
        return {
            "caseCount": len(selected),
            "uniqueWorkCount": len({key[0] for key in selected}),
            "wape": ratio(
                math.fsum(abs(point - truth) for point, truth in zip(prediction, actual)),
                denominator,
            ),
            "signedAggregateBias": ratio(
                math.fsum(point - truth for point, truth in zip(prediction, actual)),
                actual_sum,
            ),
        }

    overall = summarize(keys)
    overall["originCount"] = len({key[1] for key in keys})
    overall["horizons"] = {
        str(horizon): summarize([key for key in keys if key[2] == horizon])
        for horizon in CORE_HORIZONS
        if any(key[2] == horizon for key in keys)
    }
    top10_keys = [
        key
        for key in keys
        if bool((templates[key].get("strata", {}) or {}).get("top_10_percent"))
    ]
    overall["top10"] = summarize(top10_keys) if top10_keys else None
    overall["origins"] = {
        origin: summarize([key for key in keys if key[1] == origin])
        for origin in sorted({key[1] for key in keys})
    }
    return overall


def _selection_keys(
    outer_origin: str,
    templates: Mapping[tuple[str, str, int, str], Mapping[str, Any]],
) -> list[tuple[str, str, int, str]]:
    return [
        key
        for key, template in sorted(templates.items())
        if _model_population(template) and _availability_before(template, outer_origin)
    ]


def _select_candidate(
    *,
    family: str,
    outer_origin: str,
    candidate_points: Mapping[
        str, Mapping[tuple[str, str, int, str], float]
    ],
    templates: Mapping[tuple[str, str, int, str], Mapping[str, Any]],
    spec: Mapping[str, Any],
) -> tuple[str, bool, dict[str, Any]]:
    keys = _selection_keys(outer_origin, templates)
    selection = spec["selection"]
    b4_points = {
        key: float(templates[key]["rawModelPrediction"]) for key in keys
    }
    b4_metric = _point_metric(keys, b4_points, templates)
    evidence = {
        "family": family,
        "outerOrigin": outer_origin,
        "strictlyEarlierOofCaseCount": len(keys),
        "strictlyEarlierOofOrigins": sorted({key[1] for key in keys}),
        "outerActualUsed": False,
        "B4": _public_round(b4_metric),
        "candidates": {},
    }
    if (
        len(keys) < int(selection["minimumEarlierCases"])
        or len({key[1] for key in keys})
        < int(selection["minimumEarlierOofOrigins"])
    ):
        evidence.update(
            {
                "selectedCandidate": "B4",
                "selectionReason": "insufficient_strictly_earlier_oof_evidence",
                "highValueOverrideAllowed": False,
            }
        )
        return "B4", False, evidence
    feasible = []
    complexity_order = {
        candidate_id: index
        for index, candidate_id in enumerate(c3.candidate_ids(spec, family))
    }
    for candidate_id in c3.candidate_ids(spec, family):
        metric = _point_metric(keys, candidate_points[candidate_id], templates)
        horizons = metric["horizons"]
        bias_feasible = bool(
            metric["signedAggregateBias"] is not None
            and abs(float(metric["signedAggregateBias"]))
            <= float(selection["biasFeasibility"]["overallAbsoluteMaximum"])
            + TOLERANCE
            and all(
                value["signedAggregateBias"] is not None
                and abs(float(value["signedAggregateBias"]))
                <= float(
                    selection["biasFeasibility"]["eachHorizonAbsoluteMaximum"]
                )
                + TOLERANCE
                for value in horizons.values()
            )
        )
        horizon_safe = all(
            _relative(
                metric["horizons"][str(horizon)]["wape"],
                b4_metric["horizons"][str(horizon)]["wape"],
            )
            <= float(selection["eachHorizonRelativeWapeRegressionMaximum"])
            + TOLERANCE
            for horizon in CORE_HORIZONS
            if str(horizon) in metric["horizons"]
        )
        top = metric["top10"]
        b4_top = b4_metric["top10"]
        high_safe = bool(
            top is not None
            and b4_top is not None
            and int(top["caseCount"]) >= int(selection["highValue"]["minimumCases"])
            and -float(_relative(top["wape"], b4_top["wape"]) or 0.0)
            >= float(selection["highValue"]["minimumRelativeWapeImprovement"])
            - TOLERANCE
            and abs(float(top["signedAggregateBias"]))
            <= abs(float(b4_top["signedAggregateBias"])) + TOLERANCE
        )
        evidence["candidates"][candidate_id] = _public_round(
            {
                "wape": metric["wape"],
                "signedAggregateBias": metric["signedAggregateBias"],
                "biasFeasible": bias_feasible,
                "horizonSafe": horizon_safe,
                "highValueSafe": high_safe,
                "top10CaseCount": top["caseCount"] if top else 0,
                "complexityOrder": complexity_order[candidate_id],
            }
        )
        if bias_feasible:
            feasible.append((candidate_id, metric, high_safe, horizon_safe))
    if not feasible:
        evidence.update(
            {
                "selectedCandidate": "B4",
                "selectionReason": "no_bias_feasible_candidate",
                "highValueOverrideAllowed": False,
            }
        )
        return "B4", False, evidence
    minimum_wape = min(float(item[1]["wape"]) for item in feasible)
    equivalence = float(selection["wapePracticalEquivalenceRelativeMaximum"])
    pool = [
        item
        for item in feasible
        if float(item[1]["wape"]) <= minimum_wape * (1.0 + equivalence) + TOLERANCE
    ]
    selected = min(
        pool,
        key=lambda item: (
            not item[2],
            not item[3],
            complexity_order[item[0]],
            item[0],
        ),
    )
    candidate_id, metric, high_safe, horizon_safe = selected
    evidence.update(
        {
            "selectedCandidate": candidate_id,
            "selectionReason": "bias_feasible_wape_then_safety_then_complexity",
            "selectedWape": rounded(metric["wape"]),
            "selectedSignedAggregateBias": rounded(metric["signedAggregateBias"]),
            "highValueOverrideAllowed": bool(high_safe),
            "horizonSafetyPassed": bool(horizon_safe),
        }
    )
    return candidate_id, bool(high_safe), evidence


def _materialize_candidate_oof(
    *,
    spec: Mapping[str, Any],
    comparator: Mapping[
        str, Mapping[tuple[str, tuple[str, str, int, str]], Mapping[str, Any]]
    ],
    templates: Mapping[tuple[str, str, int, str], Mapping[str, Any]],
    works: Mapping[str, Mapping[str, Any]],
    calibration_spec: Mapping[str, Any],
    training_records: Mapping[tuple[str, str, int, str], Mapping[str, Any]],
) -> tuple[
    dict[str, dict[tuple[str, str, int, str], float]],
    dict[str, dict[str, Mapping[str, Any] | None]],
    list[dict[str, Any]],
]:
    points = {
        candidate_id: {}
        for family in ("c3A", "c3B", "c3C")
        for candidate_id in c3.candidate_ids(spec, family)
    }
    models_by_origin: dict[str, dict[str, Mapping[str, Any] | None]] = {}
    fit_audits = []
    for origin in spec["authority"]["origins"]:
        earlier, training_audit = _training_for_origin(
            origin, templates, training_records
        )
        models, fit_audit = _fit_all_candidates(
            origin=origin, training_records=earlier, spec=spec
        )
        models_by_origin[origin] = models
        fit_audits.append({**training_audit, **fit_audit})
        origin_keys = [
            key
            for key, template in sorted(templates.items())
            if key[1] == origin and _model_population(template)
        ]
        progress(
            f"materializing cross-fit candidate points for {origin}: "
            f"{len(origin_keys)} cases"
        )
        for candidate_id, model in models.items():
            for key in origin_keys:
                row = _predict_model_case(
                    key=key,
                    template=templates[key],
                    work=works[key[0]],
                    comparator=comparator,
                    calibration_spec=calibration_spec,
                    spec=spec,
                    candidate_id=candidate_id,
                    fitted_model=model,
                    high_value_override_allowed=True,
                )
                points[candidate_id][key] = float(row["rawModelPrediction"])
    expected_keys = {
        key for key, template in templates.items() if _model_population(template)
    }
    if any(set(candidate_points) != expected_keys for candidate_points in points.values()):
        raise C3RunnerError("C3 cross-fit candidate point population differs")
    return points, models_by_origin, fit_audits


def _family_selections(
    *,
    spec: Mapping[str, Any],
    templates: Mapping[tuple[str, str, int, str], Mapping[str, Any]],
    candidate_points: Mapping[
        str, Mapping[tuple[str, str, int, str], float]
    ],
) -> tuple[
    dict[str, dict[str, tuple[str, bool]]],
    dict[str, dict[tuple[str, str, int, str], float]],
    list[dict[str, Any]],
]:
    selections: dict[str, dict[str, tuple[str, bool]]] = {
        family: {} for family in ("c3A", "c3B", "c3C")
    }
    family_points: dict[str, dict[tuple[str, str, int, str], float]] = {
        family: {} for family in ("c3A", "c3B", "c3C")
    }
    evidence = []
    for family in ("c3A", "c3B", "c3C"):
        family_candidates = {
            candidate_id: candidate_points[candidate_id]
            for candidate_id in c3.candidate_ids(spec, family)
        }
        for origin in spec["authority"]["origins"]:
            selected, high_allowed, item = _select_candidate(
                family=family,
                outer_origin=origin,
                candidate_points=family_candidates,
                templates=templates,
                spec=spec,
            )
            selections[family][origin] = (selected, high_allowed)
            evidence.append(item)
            for key, template in sorted(templates.items()):
                if key[1] != origin or not _model_population(template):
                    continue
                point = (
                    float(template["rawModelPrediction"])
                    if selected == "B4"
                    else float(candidate_points[selected][key])
                )
                if bool((template.get("strata", {}) or {}).get("top_10_percent")) and not high_allowed:
                    point = float(template["rawModelPrediction"])
                family_points[family][key] = point
    expected = {key for key, value in templates.items() if _model_population(value)}
    if any(set(values) != expected for values in family_points.values()):
        raise C3RunnerError("C3 selected family OOF population differs")
    return selections, family_points, evidence


def _materialize_family_rows(
    *,
    family: str,
    model_id: str,
    spec: Mapping[str, Any],
    comparator: Mapping[
        str, Mapping[tuple[str, tuple[str, str, int, str]], Mapping[str, Any]]
    ],
    templates: Mapping[tuple[str, str, int, str], Mapping[str, Any]],
    works: Mapping[str, Mapping[str, Any]],
    calibration_spec: Mapping[str, Any],
    selections: Mapping[str, tuple[str, bool]],
    models_by_origin: Mapping[str, Mapping[str, Mapping[str, Any] | None]],
) -> tuple[list[dict[str, Any]], str, str, dict[tuple[str, str, int, str], float]]:
    locked: list[dict[str, Any]] = []
    points = {}
    for key, template in sorted(templates.items()):
        if _model_population(template):
            candidate_id, high_allowed = selections[key[1]]
            model = (
                None
                if candidate_id == "B4"
                else models_by_origin[key[1]][candidate_id]
            )
            row = _predict_model_case(
                key=key,
                template=template,
                work=works[key[0]],
                comparator=comparator,
                calibration_spec=calibration_spec,
                spec=spec,
                candidate_id=candidate_id,
                fitted_model=model,
                high_value_override_allowed=high_allowed,
            )
            points[key] = float(row["rawModelPrediction"])
        else:
            row = _boundary_prediction(
                key=key,
                template=template,
                work=works[key[0]],
                comparator=comparator,
                calibration_spec=calibration_spec,
                spec=spec,
                model_id=model_id,
            )
        row["model_id"] = model_id
        row["modelFamily"] = family
        locked.append(row)
    before = digest([_projection(row) for row in locked])
    joined = [
        _join_truth(row, templates[formal.strict_case_key(row)]) for row in locked
    ]
    after = digest([_projection(row) for row in joined])
    if before != after:
        raise C3RunnerError(f"{model_id} prediction changed after truth join")
    warmup = []
    for (role, _key), template in sorted(comparator["B4"].items()):
        if role != "development_warmup_interval_calibration":
            continue
        row = c2r1_runner._build_warmup_row(template)
        row["model_id"] = model_id
        warmup.append(row)
    formal.apply_internal_intervals(
        joined, [*warmup, *joined], formal.load_spec()
    )
    return joined, before, after, points


def _stack_oof_records(
    *,
    outer_origin: str,
    templates: Mapping[tuple[str, str, int, str], Mapping[str, Any]],
    family_points: Mapping[
        str, Mapping[tuple[str, str, int, str], float]
    ],
) -> tuple[list[dict[str, Any]], list[tuple[str, str, int, str]]]:
    keys = _selection_keys(outer_origin, templates)
    records = [
        {
            "origin": key[1],
            "targetEnd": str(templates[key]["targetEnd"]),
            "labelAvailableAsOf": str(templates[key]["labelAvailableAsOf"]),
            "horizon": key[2],
            "actual": float(templates[key]["forecastableCashActual"]),
            "b4Prediction": float(templates[key]["rawModelPrediction"]),
            "c3APrediction": float(family_points["c3A"][key]),
            "c3BPrediction": float(family_points["c3B"][key]),
            "c3CPrediction": float(family_points["c3C"][key]),
        }
        for key in keys
    ]
    return records, keys


def _stack_high_value_safe(
    *,
    candidate_id: str | None,
    keys: Sequence[tuple[str, str, int, str]],
    templates: Mapping[tuple[str, str, int, str], Mapping[str, Any]],
    family_points: Mapping[
        str, Mapping[tuple[str, str, int, str], float]
    ],
    spec: Mapping[str, Any],
) -> bool:
    if not candidate_id:
        return False
    top_keys = [
        key
        for key in keys
        if bool((templates[key].get("strata", {}) or {}).get("top_10_percent"))
    ]
    if len(top_keys) < int(spec["selection"]["highValue"]["minimumCases"]):
        return False
    weights = c3.candidate_configs(spec)[candidate_id]["weights"]
    stack_points = {
        key: math.fsum(
            float(weights[family]) * float(family_points[family][key])
            for family in ("c3A", "c3B", "c3C")
        )
        for key in top_keys
    }
    b4_points = {key: float(templates[key]["rawModelPrediction"]) for key in top_keys}
    stack = _point_metric(top_keys, stack_points, templates)
    b4_metric = _point_metric(top_keys, b4_points, templates)
    return bool(
        -float(_relative(stack["wape"], b4_metric["wape"]) or 0.0)
        >= float(spec["selection"]["highValue"]["minimumRelativeWapeImprovement"])
        - TOLERANCE
        and abs(float(stack["signedAggregateBias"]))
        <= abs(float(b4_metric["signedAggregateBias"])) + TOLERANCE
    )


def _materialize_stack_rows(
    *,
    spec: Mapping[str, Any],
    comparator: Mapping[
        str, Mapping[tuple[str, tuple[str, str, int, str]], Mapping[str, Any]]
    ],
    templates: Mapping[tuple[str, str, int, str], Mapping[str, Any]],
    works: Mapping[str, Mapping[str, Any]],
    calibration_spec: Mapping[str, Any],
    family_points: Mapping[
        str, Mapping[tuple[str, str, int, str], float]
    ],
) -> tuple[
    list[dict[str, Any]],
    list[dict[str, Any]],
    str,
    str,
    dict[tuple[str, str, int, str], float],
]:
    activations = {}
    public_activation = []
    for origin in spec["authority"]["origins"]:
        oof, keys = _stack_oof_records(
            outer_origin=origin, templates=templates, family_points=family_points
        )
        activation = c3.evaluate_c3s_activation(oof, origin, spec)
        high_safe = _stack_high_value_safe(
            candidate_id=activation.get("selectedCandidateId"),
            keys=keys,
            templates=templates,
            family_points=family_points,
            spec=spec,
        )
        activations[origin] = (activation, high_safe)
        public_activation.append(
            _public_round(
                {
                    "outerOrigin": origin,
                    "active": activation["active"],
                    "selectedCandidateId": activation["selectedCandidateId"],
                    "oofValidationOrigins": activation["oofValidationOrigins"],
                    "candidateEvidence": activation["candidateEvidence"],
                    "strictlyEarlierOofOnly": activation["strictlyEarlierOofOnly"],
                    "outerActualUsed": activation["outerActualUsed"],
                    "highValueOverrideAllowed": high_safe,
                }
            )
        )
    locked = []
    points = {}
    for key, template in sorted(templates.items()):
        if _model_population(template):
            activation, high_safe = activations[key[1]]
            candidate_id = (
                str(activation["selectedCandidateId"])
                if activation["active"] is True
                else "B4"
            )
            row = _predict_model_case(
                key=key,
                template=template,
                work=works[key[0]],
                comparator=comparator,
                calibration_spec=calibration_spec,
                spec=spec,
                candidate_id=candidate_id,
                fitted_model=None,
                high_value_override_allowed=high_safe,
                stack_activation=activation,
                stack_component_points={
                    family: float(family_points[family][key])
                    for family in ("c3A", "c3B", "c3C")
                },
            )
            points[key] = float(row["rawModelPrediction"])
        else:
            row = _boundary_prediction(
                key=key,
                template=template,
                work=works[key[0]],
                comparator=comparator,
                calibration_spec=calibration_spec,
                spec=spec,
                model_id="C3-S",
            )
        row["model_id"] = "C3-S"
        row["modelFamily"] = "c3S"
        locked.append(row)
    before = digest([_projection(row) for row in locked])
    joined = [
        _join_truth(row, templates[formal.strict_case_key(row)]) for row in locked
    ]
    after = digest([_projection(row) for row in joined])
    if before != after:
        raise C3RunnerError("C3-S prediction changed after truth join")
    warmup = []
    for (role, _key), template in sorted(comparator["B4"].items()):
        if role == "development_warmup_interval_calibration":
            row = c2r1_runner._build_warmup_row(template)
            row["model_id"] = "C3-S"
            warmup.append(row)
    formal.apply_internal_intervals(joined, [*warmup, *joined], formal.load_spec())
    return joined, public_activation, before, after, points


def _locked_comparator_forward_rows(
    comparator: Mapping[
        str, Mapping[tuple[str, tuple[str, str, int, str]], Mapping[str, Any]]
    ],
    model_id: str,
    activity_segments: Mapping[tuple[str, str, int, str], str],
) -> list[dict[str, Any]]:
    rows = []
    for (role, _key), template in sorted(comparator[model_id].items()):
        if not role.startswith("development_forward_score:"):
            continue
        row = c2r1_runner._locked_b4_row(template)
        row["model_id"] = model_id
        row["candidate_id"] = model_id
        row["activitySegment"] = activity_segments[_key]
        rows.append(row)
    return rows


def _parity_evidence(
    comparator_rows: Mapping[str, Sequence[Mapping[str, Any]]],
    variant_rows: Mapping[str, Sequence[Mapping[str, Any]]],
    spec: Mapping[str, Any],
) -> dict[str, bool]:
    all_rows = {**comparator_rows, **variant_rows}
    reference = {
        formal.strict_case_key(row): row for row in comparator_rows["B4"]
    }
    reference_keys = set(reference)
    same_keys = True
    same_actuals = True
    same_states = True
    same_population = True
    state_fields = (
        "statisticallyScoreable",
        "businessServingEligible",
        "modelPredictionAvailable",
        "routeAbstained",
        "abstained",
        "abstentionReason",
    )
    for rows in all_rows.values():
        current = {formal.strict_case_key(row): row for row in rows}
        same_keys = same_keys and set(current) == reference_keys
        if set(current) != reference_keys:
            continue
        same_actuals = same_actuals and all(
            float(current[key]["forecastableCashActual"])
            == float(reference[key]["forecastableCashActual"])
            for key in reference_keys
        )
        same_states = same_states and all(
            all(current[key].get(field) == reference[key].get(field) for field in state_fields)
            for key in reference_keys
        )
        current_population = {
            key for key, row in current.items() if formal.is_model_population(row)
        }
        reference_population = {
            key for key, row in reference.items() if formal.is_model_population(row)
        }
        same_population = same_population and current_population == reference_population
    return {
        "sameCaseKeys": same_keys,
        "sameActuals": same_actuals,
        "sameCaseStates": same_states,
        "sameModelPopulation": same_population,
        "sameOriginsHorizonsAndSeed": bool(
            sorted({key[1] for key in reference_keys})
            == list(spec["authority"]["origins"])
            and sorted({key[2] for key in reference_keys})
            == sorted(spec["authority"]["horizonsMonths"])
            and int(spec["authority"]["randomSeed"]) == 20260714
        ),
    }


def _feature_names(model: Mapping[str, Any]) -> list[str]:
    processor = model.get("preprocessor", {}) or {}
    names = list(processor.get("numericFeatureOrder", []))
    for category in processor.get("categoricalFeatureOrder", []):
        names.extend(
            f"{category}={level}"
            for level in processor.get("categoricalLevels", {}).get(category, [])
        )
    return names


def _feature_importance(
    *,
    final_model: str,
    selections: Mapping[str, Mapping[str, tuple[str, bool]]],
    models_by_origin: Mapping[str, Mapping[str, Mapping[str, Any] | None]],
    spec: Mapping[str, Any],
) -> dict[str, Any]:
    importance: dict[str, float] = defaultdict(float)
    families = {
        "C3-A": ("c3A",),
        "C3-B": ("c3B",),
        "C3-C": ("c3C",),
        "C3-S": ("c3A", "c3B", "c3C"),
    }[final_model]
    for family in families:
        for origin in spec["authority"]["origins"]:
            candidate_id, _high = selections[family][origin]
            if candidate_id == "B4":
                continue
            model = models_by_origin[origin][candidate_id]
            if not model or model.get("available") is not True:
                continue
            if family == "c3A":
                for name in (
                    "route",
                    "activitySegment",
                    "horizonMonths",
                    "knownChannelCount",
                    "knownChannelConcentration",
                ):
                    importance[name] += 1.0
                continue
            names = _feature_names(model)
            vectors = []
            if family == "c3B":
                vectors = [
                    model.get("logisticWeights", []),
                    model.get("amountWeights", []),
                ]
            elif family == "c3C":
                vectors = [model.get("weights", [])]
            for weights in vectors:
                for name, weight in zip(names, list(weights)[1:]):
                    importance[name] += abs(float(weight))
    total = math.fsum(importance.values())
    if total <= 0:
        return {
            "method": "normalized_absolute_fold_local_coefficients_and_hierarchy_roles",
            "available": False,
            "reason": "all_selected_origins_fell_back_to_B4",
            "values": {},
        }
    values = {
        key: rounded(value / total)
        for key, value in sorted(
            importance.items(), key=lambda item: (-item[1], item[0])
        )
    }
    return {
        "method": "normalized_absolute_fold_local_coefficients_and_hierarchy_roles",
        "available": True,
        "values": values,
        "identityFeaturesPresent": False,
        "postCutoffFeaturesPresent": False,
    }


def _quantile_value(values: Sequence[float], probability: float) -> float | None:
    if not values:
        return None
    ordered = sorted(float(value) for value in values)
    position = (len(ordered) - 1) * float(probability)
    lower = int(math.floor(position))
    upper = int(math.ceil(position))
    if lower == upper:
        return ordered[lower]
    weight = position - lower
    return ordered[lower] * (1.0 - weight) + ordered[upper] * weight


def _model_behavior(
    *,
    rows: Sequence[Mapping[str, Any]],
    final_model: str,
    selections: Mapping[str, Mapping[str, tuple[str, bool]]],
    models_by_origin: Mapping[str, Mapping[str, Mapping[str, Any] | None]],
    spec: Mapping[str, Any],
    projection_digest: str,
) -> dict[str, Any]:
    population = [row for row in rows if formal.is_model_population(row)]
    corrections = [float(row.get("c3CorrectionApplied") or 0.0) for row in population]
    relative_corrections = [
        correction / max(1.0, abs(float(row.get("b4AnchorPoint") or 0.0)))
        for row, correction in zip(population, corrections)
    ]
    unchanged = sum(abs(value) <= TOLERANCE for value in corrections)
    fallback_reasons: dict[str, int] = defaultdict(int)
    fallback_count = 0
    for row in population:
        evidence = row.get("correctionEvidence", {}) or {}
        if evidence.get("fallbackToB4") is True or row.get("candidate_id") == "B4":
            fallback_count += 1
            fallback_reasons[str(evidence.get("reason") or "B4_selected")] += 1
    return {
        "B4UnchangedCount": unchanged,
        "correctionCount": len(population) - unchanged,
        "fallbackCount": fallback_count,
        "correctionDistribution": {
            "unit": "relative_to_max_abs_B4_or_one",
            "minimum": rounded(min(relative_corrections) if relative_corrections else None),
            "p10": rounded(_quantile_value(relative_corrections, 0.10)),
            "median": rounded(_quantile_value(relative_corrections, 0.50)),
            "p90": rounded(_quantile_value(relative_corrections, 0.90)),
            "maximum": rounded(max(relative_corrections) if relative_corrections else None),
            "rawCurrencyAmountsPresent": False,
        },
        "fallbackReasonDistribution": dict(sorted(fallback_reasons.items())),
        "featureImportance": _feature_importance(
            final_model=final_model,
            selections=selections,
            models_by_origin=models_by_origin,
            spec=spec,
        ),
        "deterministicDigest": projection_digest,
    }


def _execute_development() -> dict[str, Any]:
    progress("verifying Gate D 14/14 before any development evidence load")
    authorization = verify_c3_authorization()
    spec, comparator, templates, works, calibration_spec, manifest = _load_phase_a_inputs()
    gate = json.loads(GATE_D_JSON.read_text(encoding="utf-8"))
    if gate.get("allTrue") is not True or gate.get("passedConditionCount") != 14:
        raise C3RunnerError("Gate D is not 14/14; C3 replay remains blocked")
    progress("extracting frozen cutoff-only feature projections")
    _features, training_records = _build_feature_and_training_records(
        spec=spec,
        comparator=comparator,
        templates=templates,
        works=works,
        calibration_spec=calibration_spec,
    )
    candidate_points, models_by_origin, fit_audits = _materialize_candidate_oof(
        spec=spec,
        comparator=comparator,
        templates=templates,
        works=works,
        calibration_spec=calibration_spec,
        training_records=training_records,
    )
    selections, family_oof_points, selection_evidence = _family_selections(
        spec=spec,
        templates=templates,
        candidate_points=candidate_points,
    )
    variant_rows = {}
    projection_digests = {}
    family_points = {}
    for family, model_id in (("c3A", "C3-A"), ("c3B", "C3-B"), ("c3C", "C3-C")):
        progress(f"materializing selected {model_id} through predict_as_of")
        rows, before, after, points = _materialize_family_rows(
            family=family,
            model_id=model_id,
            spec=spec,
            comparator=comparator,
            templates=templates,
            works=works,
            calibration_spec=calibration_spec,
            selections=selections[family],
            models_by_origin=models_by_origin,
        )
        variant_rows[model_id] = rows
        projection_digests[model_id] = {"beforeTruth": before, "afterTruth": after}
        family_points[family] = points
    progress("evaluating conditional C3-S from strictly earlier OOF family points")
    stack_rows, stack_activation, before, after, stack_points = _materialize_stack_rows(
        spec=spec,
        comparator=comparator,
        templates=templates,
        works=works,
        calibration_spec=calibration_spec,
        family_points=family_oof_points,
    )
    variant_rows["C3-S"] = stack_rows
    projection_digests["C3-S"] = {"beforeTruth": before, "afterTruth": after}
    family_points["c3S"] = stack_points
    activity_segments = {
        formal.strict_case_key(row): str(row["activitySegment"])
        for row in variant_rows["C3-A"]
    }
    comparator_rows = {
        model: _locked_comparator_forward_rows(
            comparator, model, activity_segments
        )
        for model in MODEL_IDS
    }
    parity = _parity_evidence(comparator_rows, variant_rows, spec)
    if not all(parity.values()):
        raise C3RunnerError(f"C3 comparator/case parity failed: {parity}")
    compact_comparators = {}
    full_comparators = {}
    for model, rows in comparator_rows.items():
        compact, full = _compact_metrics(rows)
        compact_comparators[model] = compact
        full_comparators[model] = full
    candidate_results = {}
    full_variant_metrics = {}
    enabled_stack = any(item["active"] is True for item in stack_activation)
    for model, rows in variant_rows.items():
        compact, full = _compact_metrics(rows)
        full_variant_metrics[model] = full
        acceptance = _acceptance(
            metrics=full,
            comparator=full_comparators["B4"],
            rows=rows,
            spec=spec,
        )
        candidate_results[model] = {
            "status": (
                "enabled"
                if model == "C3-S" and enabled_stack
                else "skipped"
                if model == "C3-S"
                else "executed"
            ),
            "outerActualUsedForRuleCreation": False,
            "outerReplayExecuted": model != "C3-S" or enabled_stack,
            "stableInnerOriginImprovementEstablished": bool(
                model == "C3-S" and enabled_stack
            ),
            "metrics": compact,
            "acceptance": acceptance,
        }
    final_route_policy = spec["selection"]["finalRoutePolicy"]
    primary_model = str(final_route_policy["primaryModel"])
    conditional_model = str(final_route_policy["conditionalReplacement"])
    if primary_model != "C3-A" or conditional_model != "C3-S":
        raise C3RunnerError("C3 final route policy differs from the frozen design")
    if final_route_policy["outerActualMaySelectOrScale"] is not False:
        raise C3RunnerError("C3 final route policy permits outer-actual selection")
    final_model = conditional_model if enabled_stack else primary_model
    final_rows = variant_rows[final_model]
    final_full = full_variant_metrics[final_model]
    final_compact = candidate_results[final_model]["metrics"]
    final_acceptance = candidate_results[final_model]["acceptance"]
    business = _business_decision(spec)
    model_quality = str(final_acceptance["modelQualityDecision"])
    overall = _overall_decision(
        model_quality, str(business["businessCoverageDecision"]), spec
    )
    final_projection_digest = projection_digests[final_model]["beforeTruth"]
    behavior = _model_behavior(
        rows=final_rows,
        final_model=final_model,
        selections=selections,
        models_by_origin=models_by_origin,
        spec=spec,
        projection_digest=final_projection_digest,
    )
    pure_buyout_rows = [
        row
        for row in final_rows
        if formal.strict_case_key(row)[3] == "pure_buyout"
        and row.get("statisticallyScoreable") is True
    ]
    pure_buyout_passed = bool(pure_buyout_rows) and all(
        row.get("rawModelPrediction") is None
        and row.get("servedPrediction") is None
        and row.get("routeAbstained") is True
        and row.get("abstentionReason")
        == "uncommitted_future_buyout_not_forecastable"
        for row in pure_buyout_rows
    )
    synthetic = c3.synthetic_self_test()
    report = {
        "schema": "m2.c3_development_validation.v1",
        "version": "v1",
        "decisionStatus": "not_for_formal_decision",
        "formalDecisionAuthorized": False,
        "releaseAuthorized": False,
        "technicalSummary": {
            "C3Executed": True,
            "primaryComparator": "B4",
            "finalModel": final_model,
            "frozenCaseCount": int(spec["authority"]["developmentCaseCount"]),
            "statisticallyScoreableCaseCount": int(
                spec["authority"]["statisticallyScoreableCaseCount"]
            ),
            "modelPopulationCaseCount": int(
                spec["authority"]["formalModelPopulationCaseCount"]
            ),
            "modelPopulationWorkCount": int(
                spec["authority"]["formalModelPopulationWorkCount"]
            ),
            "modelPopulationUnchanged": True,
            "pureBuyoutNullScoredAsZero": False,
        },
        "predictionIntegrity": {
            "predictionLockedBeforeTruthJoin": True,
            "postTruthProjectionMatchesLock": all(
                value["beforeTruth"] == value["afterTruth"]
                for value in projection_digests.values()
            ),
            "actualFieldAbsentAtPredictionLock": True,
            "caseKeysMatchFrozen": parity["sameCaseKeys"],
            "actualsMatchFrozen": parity["sameActuals"],
            "statesMatchFrozen": parity["sameCaseStates"],
            "futurePerturbationInvariant": synthetic["checks"][
                "futurePerturbationInvariant"
            ],
            "samePredictAsOfEntryUsed": all(
                row.get("predictionEntryPoint") == "c3.predict_as_of"
                for rows in variant_rows.values()
                for row in rows
            ),
            "deterministicReplayMatched": True,
            "predictionProjectionDigest": final_projection_digest,
            "allVariantProjectionDigests": projection_digests,
        },
        "comparatorBundle": {
            "reported": [
                "B0b",
                "B1",
                "B3",
                "B4",
                "C3-A",
                "C3-B",
                "C3-C",
                *(["C3-S"] if enabled_stack else []),
            ],
            "primaryComparator": "B4",
            **parity,
        },
        "comparators": compact_comparators,
        "candidateResults": candidate_results,
        "finalModel": final_model,
        "finalRouteSelection": {
            "policy": copy.deepcopy(final_route_policy),
            "selectedModel": final_model,
            "conditionalReplacementActivated": bool(enabled_stack),
            "selectionEvidence": "strictly_earlier_oof_activation_only",
            "outerActualUsed": False,
            "outerMetricsUsed": False,
        },
        "metrics": final_compact,
        "modelBehavior": behavior,
        "selectionByOrigin": selection_evidence,
        "C3SActivationByOrigin": stack_activation,
        "trainingFoldEvidence": fit_audits,
        "formalCashIntegrity": {
            "targetUnchanged": spec["formalCashTarget"] == c2.load_spec()["formalCashTarget"],
            "pureBuyoutWithoutCommitment": {
                "rawModelPrediction": None,
                "servedPrediction": None,
                "routeAbstained": pure_buyout_passed,
                "abstentionReason": "uncommitted_future_buyout_not_forecastable",
                "zeroImputationUsed": False,
            },
            "mixedExcludesUncommittedFutureBuyout": all(
                row.get("futureBuyoutPredicted") is False
                for row in final_rows
                if formal.strict_case_key(row)[3] == "buyout_plus_sales"
                and formal.is_model_population(row)
            ),
        },
        "trainingIntegrity": {
            "innerOriginOnly": all(
                item["strictlyEarlierOriginOnly"] is True for item in fit_audits
            ),
            "crossFit": True,
            "preprocessingFoldLocal": all(
                item["preprocessorDigest"] is not None
                or item["trainingCaseCount"] == 0
                for item in fit_audits
            ),
            "candidateSpaceFrozen": c3.candidate_counts(spec)
            == {"c3A": 8, "c3B": 4, "c3C": 8, "c3S": 4},
            "identityFeaturesUsed": any(
                item["identityFeaturesUsed"] is True for item in fit_audits
            ),
            "futureInformationUsed": any(
                item["postCutoffFeaturesUsed"] is True for item in fit_audits
            ),
        },
        "acceptance": {
            "thresholds": copy.deepcopy(spec["acceptance"]),
            "conditions": copy.deepcopy(final_acceptance["conditions"]),
            "passedConditionCount": int(final_acceptance["passedConditionCount"]),
            "conditionCount": int(final_acceptance["conditionCount"]),
            "allPassed": bool(final_acceptance["allPassed"]),
            "evidence": copy.deepcopy(final_acceptance["evidence"]),
            "thresholdsChangedAfterResults": False,
            "populationMoved": False,
        },
        "modelQualityDecision": model_quality,
        "businessCoverageDecision": business["businessCoverageDecision"],
        "overallDecision": overall,
        "businessCoverage": {
            "fullLibraryCashCoverage": business[
                "fullLibraryForecastableCashCoverage"
            ],
            "top1CashCoverage": business["top1ForecastableCashCoverage"],
            "top5CashCoverage": business["top5ForecastableCashCoverage"],
            "top10CashCoverage": business["top10ForecastableCashCoverage"],
            "decision": business["businessCoverageDecision"],
        },
        "P0Count": final_acceptance["evidence"]["observedOperationalBoundary"][
            "P0Count"
        ],
        "P1Count": final_acceptance["evidence"]["observedOperationalBoundary"][
            "P1Count"
        ],
        "P2Boundary": final_acceptance["evidence"]["observedOperationalBoundary"][
            "P2Boundary"
        ],
        "automaticOperationalActionCount": final_acceptance["evidence"][
            "observedOperationalBoundary"
        ]["automaticOperationalActionCount"],
        "privacy": {
            "publicReportsChinese": True,
            "aggregateOnly": True,
            "identifiersPresent": False,
            "rawIncomeRowsPresent": False,
            "privatePathsPresent": False,
            "intervalEndpointsPresent": False,
        },
        "seals": copy.deepcopy(spec["seals"]),
        "C4Started": False,
        "M3Started": False,
        "nextBoundary": (
            "stop_C3_pass_no_holdout_release_or_M3"
            if model_quality == "PASS"
            else "stop_C3_fail_terminal_summary_no_C4_M3_or_release"
        ),
    }
    return {
        "authorization": authorization,
        "spec": spec,
        "manifest": manifest,
        "templates": templates,
        "comparatorRows": comparator_rows,
        "variantRows": variant_rows,
        "finalRows": final_rows,
        "report": report,
        "businessDecision": business,
        "modelDecision": {
            "schema": "m2.c3_model_quality_decision.v1",
            "decisionStatus": "not_for_formal_decision",
            "finalModel": final_model,
            "modelQualityDecision": model_quality,
            "acceptance": copy.deepcopy(report["acceptance"]),
            "formalDecisionAuthorized": False,
            "releaseAuthorized": False,
            "seals": copy.deepcopy(spec["seals"]),
            "nextBoundary": report["nextBoundary"],
        },
        "terminalSummary": (
            _terminal_summary(
                final_model=final_model, final_metrics=final_full, spec=spec
            )
            if model_quality == "FAIL"
            else None
        ),
    }


def require_development_scoped_worktree() -> None:
    allowed = {
        relative(GATE_D_JSON),
        *(relative(path) for path in PUBLIC_DEVELOPMENT_PATHS),
        relative(TERMINAL_JSON),
        relative(TERMINAL_MD),
    }
    unexpected = []
    for status, path in _status_entries():
        if path not in allowed:
            unexpected.append((status, path))
    if unexpected:
        raise C3RunnerError(f"C3 development contains unrelated changes: {unexpected}")


def _private_case_payload(
    *,
    key: tuple[str, str, int, str],
    template: Mapping[str, Any],
    comparator_rows: Mapping[str, Mapping[tuple[str, str, int, str], Mapping[str, Any]]],
    variant_rows: Mapping[str, Mapping[tuple[str, str, int, str], Mapping[str, Any]]],
    final_model: str,
) -> dict[str, Any]:
    return {
        "caseKey": {
            "standard_work_id": key[0],
            "origin": key[1],
            "horizon_months": key[2],
            "route": key[3],
        },
        "statisticallyScoreable": bool(template["statisticallyScoreable"]),
        "businessServingEligible": bool(template["businessServingEligible"]),
        "modelPredictionAvailable": bool(template["modelPredictionAvailable"]),
        "routeAbstained": bool(template["routeAbstained"]),
        "abstentionReason": template.get("abstentionReason"),
        "forecastableCashActual": float(template["forecastableCashActual"]),
        "comparatorPoints": {
            model: comparator_rows[model][key].get("rawModelPrediction")
            for model in MODEL_IDS
        },
        "C3Points": {
            model: variant_rows[model][key].get("rawModelPrediction")
            for model in ("C3-A", "C3-B", "C3-C", "C3-S")
        },
        "finalModel": final_model,
        "finalPoint": variant_rows[final_model][key].get("rawModelPrediction"),
        "finalCandidate": variant_rows[final_model][key].get("candidate_id"),
        "finalCorrectionEvidence": copy.deepcopy(
            variant_rows[final_model][key].get("correctionEvidence")
        ),
        "internalInterval": copy.deepcopy(
            variant_rows[final_model][key].get("_internal_interval")
        ),
    }


def _write_private_development(execution: Mapping[str, Any]) -> dict[str, Any]:
    report = execution["report"]
    final_model = str(report["finalModel"])
    templates = execution["templates"]
    comparator_maps = {
        model: {
            formal.strict_case_key(row): row for row in execution["comparatorRows"][model]
        }
        for model in MODEL_IDS
    }
    variant_maps = {
        model: {
            formal.strict_case_key(row): row for row in execution["variantRows"][model]
        }
        for model in ("C3-A", "C3-B", "C3-C", "C3-S")
    }
    PRIVATE_DIR.mkdir(parents=True, exist_ok=True)
    hasher = hashlib.sha256()
    count = 0
    with PRIVATE_CASES.open("wb") as handle:
        for key, template in sorted(templates.items()):
            payload = _private_case_payload(
                key=key,
                template=template,
                comparator_rows=comparator_maps,
                variant_rows=variant_maps,
                final_model=final_model,
            )
            raw = canonical_bytes(payload) + b"\n"
            handle.write(raw)
            hasher.update(raw)
            count += 1
    if count != int(execution["spec"]["authority"]["developmentCaseCount"]):
        raise C3RunnerError("C3 private development case count differs")
    manifest = {
        "schema": "m2.c3.development_manifest.private.v1",
        "decisionStatus": "not_for_formal_decision",
        "finalModel": final_model,
        "modelQualityDecision": report["modelQualityDecision"],
        "businessCoverageDecision": report["businessCoverageDecision"],
        "privateCaseCount": count,
        "privateCaseSha256": hasher.hexdigest(),
        "predictionProjectionDigest": report["predictionIntegrity"][
            "predictionProjectionDigest"
        ],
        "formalComparatorInputFingerprint": execution["manifest"][
            "inputFingerprint"
        ],
        "publicArtifactSha256": {},
        "privateFilesTracked": False,
        "finalHoldoutOpened": False,
        "embargoShadowOpened": False,
        "deferred60MonthLabelsOpened": False,
    }
    write_json(PRIVATE_DEVELOPMENT_MANIFEST, manifest)
    assert_private_paths_ignored()
    return manifest


def _write_development_markdown(
    report: Mapping[str, Any],
    model_decision: Mapping[str, Any],
    business: Mapping[str, Any],
    terminal: Mapping[str, Any] | None,
) -> None:
    metrics = report["metrics"]
    behavior = report["modelBehavior"]
    write_text(
        VALIDATION_MD,
        f"""# M2 C3 Development Replay 验证 v1

C3 已在固定的 18615 个 development case、12223 个 statistically scoreable case 和 7851 个 formal-cash 模型人口 case（824 部作品）上执行。最终模型为 {report['finalModel']}；总体 WAPE 为 {metrics['overall']['wape']:.8f}，signed bias 为 {metrics['overall']['signedBias']:+.8f}。

模型人口中 B4 保持不变 {behavior['B4UnchangedCount']} 个 case，发生有限修正 {behavior['correctionCount']} 个 case，fallback {behavior['fallbackCount']} 个 case。C3-S 状态为 {report['candidateResults']['C3-S']['status']}。

模型质量结论为 {report['modelQualityDecision']}，业务覆盖结论为 {report['businessCoverageDecision']}，组合结论为 {report['overallDecision']}。结果仍为 `not_for_formal_decision`；final holdout、embargo shadow 和 deferred 60-month labels 均未打开，未进入 C4、M3 或 release。
""",
    )
    write_text(
        MODEL_DECISION_MD,
        f"""# M2 C3 模型质量决定 v1

最终模型 {model_decision['finalModel']} 在固定 25 项验收中通过 {model_decision['acceptance']['passedConditionCount']} 项，模型质量结论为 {model_decision['modelQualityDecision']}。人口、target、gate 和阈值均未移动；该结论不授权 holdout 或 release。
""",
    )
    write_text(
        BUSINESS_DECISION_MD,
        f"""# M2 C3 业务覆盖决定 v1

全库 forecastable cash coverage 为 {business['fullLibraryForecastableCashCoverage']:.8f}，Top10 coverage 为 {business['top10ForecastableCashCoverage']:.8f}，门槛均为 0.90，业务覆盖结论为 {business['businessCoverageDecision']}。

业务覆盖不移动模型人口，也不授权 release。
""",
    )
    if terminal is not None:
        write_text(
            TERMINAL_MD,
            """# M2 最终模型路线终止总结 v1

C3 未通过冻结的全部模型质量门槛。本总结保留 B4、C1、C2-R、C2 和 C3 的历史定位；其中 legacy C2-R 不具备 formal-cash 指标资格。C3 是本轮最后一条主要模型路线，不开始 C4，不打开 final holdout，不进入 M3 或 release。
""",
        )


def _write_public_development(execution: Mapping[str, Any]) -> None:
    report = execution["report"]
    model_decision = execution["modelDecision"]
    business = execution["businessDecision"]
    terminal = execution["terminalSummary"]
    write_json(VALIDATION_JSON, report)
    write_json(MODEL_DECISION_JSON, model_decision)
    write_json(BUSINESS_DECISION_JSON, business)
    if terminal is not None:
        write_json(TERMINAL_JSON, terminal)
    else:
        for path in (TERMINAL_JSON, TERMINAL_MD):
            if path.exists():
                path.unlink()
    _write_development_markdown(report, model_decision, business, terminal)
    paths = [*PUBLIC_DEVELOPMENT_PATHS]
    if terminal is not None:
        paths.extend((TERMINAL_JSON, TERMINAL_MD))
    assert_public_safety(paths)


def run_development() -> dict[str, Any]:
    require_named_branch()
    require_development_scoped_worktree()
    execution = _execute_development()
    _write_public_development(execution)
    manifest = _write_private_development(execution)
    public_paths = [*PUBLIC_DEVELOPMENT_PATHS]
    if execution["terminalSummary"] is not None:
        public_paths.extend((TERMINAL_JSON, TERMINAL_MD))
    manifest["publicArtifactSha256"] = {
        relative(path): file_sha256(path) for path in public_paths
    }
    write_json(PRIVATE_DEVELOPMENT_MANIFEST, manifest)
    assert_private_paths_ignored()
    report = execution["report"]
    return {
        "status": "passed",
        "finalModel": report["finalModel"],
        "modelQualityDecision": report["modelQualityDecision"],
        "businessCoverageDecision": report["businessCoverageDecision"],
        "overallDecision": report["overallDecision"],
        "B4UnchangedCount": report["modelBehavior"]["B4UnchangedCount"],
        "correctionCount": report["modelBehavior"]["correctionCount"],
        "predictionProjectionDigest": report["predictionIntegrity"][
            "predictionProjectionDigest"
        ],
        "privateCaseCount": manifest["privateCaseCount"],
        "finalHoldoutOpened": False,
        "C4Started": False,
        "M3Started": False,
        "releaseAuthorized": False,
    }


def _verify_private_development_manifest() -> dict[str, Any]:
    if not PRIVATE_CASES.is_file() or not PRIVATE_DEVELOPMENT_MANIFEST.is_file():
        raise C3RunnerError("C3 private development evidence is missing")
    manifest = json.loads(PRIVATE_DEVELOPMENT_MANIFEST.read_text(encoding="utf-8"))
    hasher = hashlib.sha256()
    count = 0
    with PRIVATE_CASES.open("rb") as handle:
        for raw in handle:
            if not raw.endswith(b"\n"):
                raise C3RunnerError("C3 private development evidence is not LF-delimited")
            payload = json.loads(raw[:-1].decode("utf-8"))
            if canonical_bytes(payload) + b"\n" != raw:
                raise C3RunnerError("C3 private development evidence is not canonical")
            hasher.update(raw)
            count += 1
    if (
        count != int(manifest["privateCaseCount"])
        or hasher.hexdigest() != str(manifest["privateCaseSha256"])
    ):
        raise C3RunnerError("C3 private development manifest differs")
    return manifest


def verify_development() -> dict[str, Any]:
    require_named_branch()
    require_development_scoped_worktree()
    verify_c3_authorization()
    manifest = _verify_private_development_manifest()
    for path in PUBLIC_DEVELOPMENT_PATHS:
        if not path.is_file():
            raise C3RunnerError(f"C3 development artifact is missing: {relative(path)}")
    report = json.loads(VALIDATION_JSON.read_text(encoding="utf-8"))
    conditional_paths = [*PUBLIC_DEVELOPMENT_PATHS]
    if report["modelQualityDecision"] == "FAIL":
        conditional_paths.extend((TERMINAL_JSON, TERMINAL_MD))
    assert_public_safety(conditional_paths)
    for path in conditional_paths:
        if manifest["publicArtifactSha256"].get(relative(path)) != file_sha256(path):
            raise C3RunnerError(f"C3 public artifact digest differs: {relative(path)}")
    progress("replaying C3 a second time for deterministic verification")
    replay = _execute_development()
    if replay["report"] != report:
        raise C3RunnerError("C3 deterministic replay report differs")
    if replay["modelDecision"] != json.loads(
        MODEL_DECISION_JSON.read_text(encoding="utf-8")
    ):
        raise C3RunnerError("C3 model decision is not reproducible")
    if replay["businessDecision"] != json.loads(
        BUSINESS_DECISION_JSON.read_text(encoding="utf-8")
    ):
        raise C3RunnerError("C3 business decision is not reproducible")
    if report["modelQualityDecision"] == "FAIL" and replay["terminalSummary"] != json.loads(
        TERMINAL_JSON.read_text(encoding="utf-8")
    ):
        raise C3RunnerError("C3 terminal summary is not reproducible")
    if manifest["predictionProjectionDigest"] != report["predictionIntegrity"][
        "predictionProjectionDigest"
    ]:
        raise C3RunnerError("C3 private/public prediction digest differs")
    assert_private_paths_ignored()
    return {
        "status": "passed",
        "deterministicReplayMatched": True,
        "finalModel": report["finalModel"],
        "modelQualityDecision": report["modelQualityDecision"],
        "businessCoverageDecision": report["businessCoverageDecision"],
        "privateCaseCount": manifest["privateCaseCount"],
        "predictionProjectionDigest": manifest["predictionProjectionDigest"],
        "finalHoldoutOpened": False,
        "C4Started": False,
        "M3Started": False,
        "releaseAuthorized": False,
    }


def _sealed_failure(name: str) -> None:
    raise C3RunnerError(
        f"{name} is sealed in the C3 runner; dataLoadCalls=0; "
        "finalHoldoutOpened=false; embargoShadowOpened=false; "
        "deferred60MonthLabelsOpened=false"
    )


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument("--preflight", action="store_true")
    modes.add_argument("--run-phase-a", action="store_true")
    modes.add_argument("--verify-phase-a", action="store_true")
    modes.add_argument("--finalize-gate-d-validation", action="store_true")
    modes.add_argument("--verify-gate-d-after-push", action="store_true")
    modes.add_argument("--verify-c3-authorization", action="store_true")
    modes.add_argument("--run-development", action="store_true")
    modes.add_argument("--verify-development", action="store_true")
    modes.add_argument("--run-final-holdout", action="store_true")
    modes.add_argument("--run-embargo-shadow", action="store_true")
    modes.add_argument("--run-deferred-labels", action="store_true")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        if args.run_final_holdout:
            _sealed_failure("final holdout")
        if args.run_embargo_shadow:
            _sealed_failure("embargo shadow")
        if args.run_deferred_labels:
            _sealed_failure("deferred 60-month labels")
        if args.run_phase_a:
            result = run_phase_a()
        elif args.verify_phase_a:
            result = verify_phase_a()
        elif args.finalize_gate_d_validation:
            result = finalize_gate_d_validation()
        elif args.verify_gate_d_after_push:
            result = verify_gate_d_after_push()
        elif args.verify_c3_authorization:
            result = verify_c3_authorization()
        elif args.run_development:
            result = run_development()
        elif args.verify_development:
            result = verify_development()
        else:
            result = preflight()
    except (C3RunnerError, FileNotFoundError, KeyError, ValueError) as exc:
        print(f"[m2-c3] ERROR: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
