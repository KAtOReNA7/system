#!/usr/bin/env python3
"""Correct and verify the C2 checkpoint monetary reconciliation representation.

This runner does not train or score a model.  It keeps the Gate C-bound C2
sources immutable, replays only the reconciliation over the locked private C2
cases, and updates aggregate public evidence plus the ignored private manifest.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import subprocess
import sys
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Any, Mapping, Sequence


ROOT = Path(__file__).resolve().parents[2]
PUBLIC_DIR = ROOT / "docs" / "analysis" / "m2-real-data"
PRIVATE_DIR = ROOT / "data" / "private-output" / "m2-c2-v1"
AMENDMENT_PATH = (
    ROOT
    / "src"
    / "domain"
    / "oldProductEvaluation"
    / "calibrationSpec.c2.v1.1.reconciliation.amendment.json"
)
BASE_SPEC_PATH = (
    ROOT
    / "src"
    / "domain"
    / "oldProductEvaluation"
    / "calibrationSpec.c2.v1.amendment.json"
)
C2_CORE_PATH = ROOT / "scripts" / "m2-real-data" / "m2_calibration_c2_v1.py"
C2_RUNNER_PATH = (
    ROOT / "scripts" / "m2-real-data" / "run_m2_c2_development_validation.py"
)
GATE_C_PATH = PUBLIC_DIR / "M2-calibration-gate-c-v1.json"
RESIDUAL_JSON = PUBLIC_DIR / "M2-C2-other-new-channel-residual-audit-v1.json"
RESIDUAL_MD = PUBLIC_DIR / "M2-C2-other-new-channel-residual-audit-v1.md"
MODEL_JSON = PUBLIC_DIR / "M2-C2-model-quality-decision-v1.json"
MODEL_MD = PUBLIC_DIR / "M2-C2-model-quality-decision-v1.md"
VALIDATION_JSON = PUBLIC_DIR / "M2-C2-development-validation-v1.json"
VALIDATION_MD = PUBLIC_DIR / "M2-C2-development-validation-v1.md"
BUSINESS_JSON = PUBLIC_DIR / "M2-C2-business-coverage-decision-v1.json"
PRIVATE_CASES = PRIVATE_DIR / "M2-C2-development-cases-private-v1.ndjson"
PRIVATE_MANIFEST = PRIVATE_DIR / "M2-C2-development-manifest-private-v1.json"
CENT = Decimal("0.01")


class ReconciliationCheckpointError(RuntimeError):
    """C2 checkpoint evidence differs from the frozen correction boundary."""


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def canonical_digest(value: Any) -> str:
    payload = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.write_text(
        json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False)
        + "\n",
        encoding="utf-8",
    )


def decimal_value(value: Any) -> Decimal:
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def difference_cents(left: Decimal, right: Decimal) -> int:
    """Return the quantized signed difference in exact integer cents."""

    quantized = (left - right).quantize(CENT, rounding=ROUND_HALF_UP)
    return int((quantized * 100).to_integral_exact())


def load_amendment() -> dict[str, Any]:
    value = load_json(AMENDMENT_PATH)
    if value.get("version") != "calibration-spec-c2-v1.1-reconciliation-amendment":
        raise ReconciliationCheckpointError("C2 reconciliation amendment identity differs")
    return value


def verify_frozen_phase_a(amendment: Mapping[str, Any]) -> None:
    frozen = amendment["frozenPhaseA"]
    expected = {
        BASE_SPEC_PATH: frozen["baseSpecSha256"],
        C2_CORE_PATH: frozen["c2CoreSha256"],
        C2_RUNNER_PATH: frozen["c2RunnerSha256"],
        GATE_C_PATH: frozen["gateCReportSha256"],
    }
    for path, digest in expected.items():
        if not path.is_file() or sha256(path) != digest:
            raise ReconciliationCheckpointError(
                f"Gate C-bound source changed: {path.relative_to(ROOT).as_posix()}"
            )
    gate = load_json(GATE_C_PATH)
    if (
        gate.get("conditionCount") != frozen["gateCConditionCount"]
        or gate.get("passedConditionCount") != frozen["gateCPassedConditionCount"]
        or gate.get("allTrue") is not True
        or any(value is not True for value in gate.get("conditions", {}).values())
    ):
        raise ReconciliationCheckpointError("Gate C is not the frozen 14/14 evidence")


def synthetic_check() -> dict[str, Any]:
    subcent = difference_cents(Decimal("100.00000011"), Decimal("100"))
    one_cent = difference_cents(Decimal("100.01"), Decimal("100"))
    negative_one_cent = difference_cents(Decimal("100"), Decimal("100.01"))
    if subcent != 0 or one_cent != 1 or negative_one_cent != -1:
        raise ReconciliationCheckpointError("integer-cent synthetic boundary differs")
    return {
        "subCentRawDifferenceYuan": 0.00000011,
        "subCentDifferenceCents": subcent,
        "oneCentDifferenceCents": one_cent,
        "negativeOneCentDifferenceCents": negative_one_cent,
        "floatingAbsoluteToleranceUsed": False,
        "oneCentMismatchMustFail": True,
    }


def _model_population(row: Mapping[str, Any]) -> bool:
    return (
        row.get("statisticallyScoreable") is True
        and row.get("modelPredictionAvailable") is True
        and row.get("routeAbstained") is False
        and row.get("rawModelPrediction") is not None
    )


def audit_private_cases(amendment: Mapping[str, Any]) -> dict[str, Any]:
    if not PRIVATE_CASES.is_file():
        raise ReconciliationCheckpointError("locked private C2 cases are unavailable")
    total_cases = 0
    population_cases = 0
    generic_components = 0
    work_mismatch_cases = 0
    truth_mismatch_cases = 0
    maximum_work_raw = Decimal("0")
    maximum_truth_raw = Decimal("0")
    maximum_work_cents = 0
    maximum_truth_cents = 0
    generic_key: str | None = None
    actual_uses_generic_key = False

    with PRIVATE_CASES.open(encoding="utf-8") as handle:
        for line in handle:
            total_cases += 1
            row = json.loads(line, parse_float=Decimal)
            if not _model_population(row):
                continue
            population_cases += 1
            known: dict[str, Decimal] = {}
            generic: Decimal | None = None
            for component in row.get("channelComponents", []) or []:
                key = str(component["channel_key"])
                point = decimal_value(component["point_forecast"])
                if component.get("component_type") == "other_or_new_channel_residual":
                    if generic is not None:
                        raise ReconciliationCheckpointError(
                            "more than one generic residual component"
                        )
                    generic = point
                    generic_components += 1
                    if generic_key is None:
                        generic_key = key
                    elif generic_key != key:
                        raise ReconciliationCheckpointError(
                            "generic residual component key changed"
                        )
                else:
                    if key in known:
                        raise ReconciliationCheckpointError(
                            "duplicate known channel component"
                        )
                    known[key] = point
            if generic is None:
                raise ReconciliationCheckpointError(
                    "model-population case lacks generic residual component"
                )
            confirmed = sum(
                (
                    decimal_value(item["outstandingAmount"])
                    for item in row.get("confirmedCashComponents", []) or []
                ),
                Decimal("0"),
            )
            left = sum(known.values(), Decimal("0")) + generic + confirmed
            right = decimal_value(row["rawModelPrediction"])
            raw_difference = abs(left - right)
            cents = abs(difference_cents(left, right))
            maximum_work_raw = max(maximum_work_raw, raw_difference)
            maximum_work_cents = max(maximum_work_cents, cents)
            work_mismatch_cases += int(cents != 0)

            actual = row.get("forecastableActualByComponent", {}) or {}
            if generic_key is not None and generic_key in actual:
                actual_uses_generic_key = True
            truth_left = sum(
                (decimal_value(value) for value in actual.values()), Decimal("0")
            )
            truth_right = decimal_value(row["forecastableCashActual"])
            truth_raw_difference = abs(truth_left - truth_right)
            truth_cents = abs(difference_cents(truth_left, truth_right))
            maximum_truth_raw = max(maximum_truth_raw, truth_raw_difference)
            maximum_truth_cents = max(maximum_truth_cents, truth_cents)
            truth_mismatch_cases += int(truth_cents != 0)

    frozen = amendment["frozenModelEvidence"]
    boundary = amendment["correctionBoundary"]
    if (
        total_cases != frozen["developmentCaseCount"]
        or population_cases != frozen["modelPopulationCaseCount"]
        or generic_components != population_cases
        or maximum_work_raw
        != Decimal(boundary["expectedMaximumRawWorkPointDifferenceYuan"])
        or maximum_work_cents
        != boundary["expectedMaximumWorkPointDifferenceCents"]
        or maximum_truth_cents != boundary["expectedMaximumTruthDifferenceCents"]
        or work_mismatch_cases != 0
        or truth_mismatch_cases != 0
        or actual_uses_generic_key
    ):
        raise ReconciliationCheckpointError(
            "locked C2 monetary reconciliation differs from the amendment"
        )
    return {
        "modelPopulationCaseCount": population_cases,
        "genericComponentCount": generic_components,
        "maximumWorkPointReconciliationDifferenceRawYuan": float(
            maximum_work_raw
        ),
        "maximumWorkPointReconciliationDifferenceCents": maximum_work_cents,
        "workPointReconciliationMismatchCaseCountAtCentPrecision": work_mismatch_cases,
        "maximumTruthComponentReconciliationDifferenceRawYuan": float(
            maximum_truth_raw
        ),
        "maximumTruthComponentReconciliationDifferenceCents": maximum_truth_cents,
        "truthComponentReconciliationMismatchCaseCountAtCentPrecision": truth_mismatch_cases,
        "knownChannelCashDuplicated": actual_uses_generic_key,
        "workPointFormulaVerified": True,
    }


def verify_frozen_model_evidence(
    validation: Mapping[str, Any], amendment: Mapping[str, Any]
) -> None:
    frozen = amendment["frozenModelEvidence"]
    metric = validation["metrics"]["modelPopulation"]
    technical = validation["technicalSummary"]
    prediction = validation["predictionIntegrity"]
    checks = {
        "developmentCaseCount": technical["frozenCaseCount"]
        == frozen["developmentCaseCount"],
        "statisticallyScoreableCaseCount": technical[
            "statisticallyScoreableCaseCount"
        ]
        == frozen["statisticallyScoreableCaseCount"],
        "modelPopulationCaseCount": metric["caseCount"]
        == frozen["modelPopulationCaseCount"],
        "modelPopulationWorkCount": metric["uniqueWorkCount"]
        == frozen["modelPopulationWorkCount"],
        "overallWape": metric["wape"] == frozen["overallWape"],
        "overallMae": metric["mae"] == frozen["overallMae"],
        "overallSmape": metric["smape"] == frozen["overallSmape"],
        "overallSignedAggregateBias": metric["signedAggregateBias"]
        == frozen["overallSignedAggregateBias"],
        "predictionProjectionDigest": prediction["predictionProjectionDigest"]
        == frozen["predictionProjectionDigest"],
        "primaryComparator": technical["primaryComparator"]
        == frozen["primaryComparator"],
    }
    failed = [name for name, passed in checks.items() if not passed]
    if failed:
        raise ReconciliationCheckpointError(
            f"C2 model evidence changed: {','.join(failed)}"
        )


def correction_summary(audit: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "contractVersion": "calibration-spec-c2-v1.1-reconciliation-amendment",
        "scope": "monetary_reconciliation_numeric_representation_only",
        "comparisonUnit": "integer_cent",
        "minorUnitYuan": 0.01,
        "roundingMode": "ROUND_HALF_UP",
        "floatingAbsoluteToleranceUsed": False,
        "rawFloatingDifferenceRetainedAsDiagnostic": True,
        "maximumRawWorkPointDifferenceYuan": audit[
            "maximumWorkPointReconciliationDifferenceRawYuan"
        ],
        "maximumWorkPointDifferenceCents": audit[
            "maximumWorkPointReconciliationDifferenceCents"
        ],
        "changedAcceptanceConditions": ["residual_does_not_duplicate_cash"],
        "modelMetricsChanged": False,
        "predictionsChanged": False,
        "B4Changed": False,
        "GateCChanged": False,
        "modelPopulationChanged": False,
        "otherAcceptanceThresholdsChanged": False,
    }


def apply_correction() -> dict[str, Any]:
    amendment = load_amendment()
    verify_frozen_phase_a(amendment)
    synthetic_check()
    audit = audit_private_cases(amendment)
    residual = load_json(RESIDUAL_JSON)
    model = load_json(MODEL_JSON)
    validation = load_json(VALIDATION_JSON)
    business = load_json(BUSINESS_JSON)
    verify_frozen_model_evidence(validation, amendment)

    boundary = amendment["correctionBoundary"]
    if (
        validation.get("modelQualityDecision") != boundary["modelQualityDecision"]
        or validation.get("businessCoverageDecision")
        != boundary["businessCoverageDecision"]
        or validation.get("overallDecision") != boundary["overallDecision"]
        or business.get("businessCoverageDecision")
        != boundary["businessCoverageDecision"]
    ):
        raise ReconciliationCheckpointError("C2 decisions changed before correction")

    metrics_digest = canonical_digest(validation["metrics"])
    b4_digest = canonical_digest(validation["B4Metrics"])
    comparator_digest = canonical_digest(validation["comparatorBundle"])
    acceptance = copy.deepcopy(validation["acceptance"])
    model_acceptance = copy.deepcopy(model["acceptance"])
    if canonical_digest(acceptance) != canonical_digest(model_acceptance):
        raise ReconciliationCheckpointError(
            "validation and model-quality acceptance evidence differ"
        )
    allowed = boundary["allowedChangedAcceptanceCondition"]
    prior_value = acceptance["conditions"][allowed]
    if prior_value not in (False, True):
        raise ReconciliationCheckpointError("residual acceptance condition is invalid")
    other_conditions_before = {
        key: value for key, value in acceptance["conditions"].items() if key != allowed
    }
    acceptance["conditions"][allowed] = True
    acceptance["passedConditionCount"] = sum(acceptance["conditions"].values())
    acceptance["allPassed"] = False
    acceptance["modelQualityDecision"] = boundary["modelQualityDecision"]
    if (
        acceptance["conditionCount"] != boundary["conditionCount"]
        or acceptance["passedConditionCount"]
        != boundary["correctedPassedConditionCount"]
        or {
            key: value
            for key, value in acceptance["conditions"].items()
            if key != allowed
        }
        != other_conditions_before
    ):
        raise ReconciliationCheckpointError(
            "more than the allowed residual acceptance condition changed"
        )

    residual.update(audit)
    residual["maximumWorkPointReconciliationDifference"] = audit[
        "maximumWorkPointReconciliationDifferenceRawYuan"
    ]
    residual["maximumTruthComponentReconciliationDifference"] = audit[
        "maximumTruthComponentReconciliationDifferenceRawYuan"
    ]
    residual["workPointFormulaVerificationBasis"] = "exact_integer_cent_difference"
    residual["monetaryReconciliation"] = {
        "contractVersion": amendment["version"],
        "comparisonUnit": "integer_cent",
        "minorUnitYuan": 0.01,
        "roundingMode": "ROUND_HALF_UP",
        "floatingAbsoluteToleranceUsed": False,
        "oneCentMismatchMustFail": True,
        "rawFloatingDifferenceRetainedAsDiagnostic": True,
    }
    summary = correction_summary(audit)
    validation["acceptance"] = copy.deepcopy(acceptance)
    validation["modelQualityDecision"] = boundary["modelQualityDecision"]
    validation["businessCoverageDecision"] = boundary["businessCoverageDecision"]
    validation["overallDecision"] = boundary["overallDecision"]
    validation["monetaryReconciliationCorrection"] = copy.deepcopy(summary)
    model["acceptance"] = copy.deepcopy(acceptance)
    model["modelQualityDecision"] = boundary["modelQualityDecision"]
    model["monetaryReconciliationCorrection"] = copy.deepcopy(summary)

    if (
        canonical_digest(validation["metrics"]) != metrics_digest
        or canonical_digest(validation["B4Metrics"]) != b4_digest
        or canonical_digest(validation["comparatorBundle"]) != comparator_digest
    ):
        raise ReconciliationCheckpointError("model or comparator evidence changed")

    write_json(RESIDUAL_JSON, residual)
    write_json(MODEL_JSON, model)
    write_json(VALIDATION_JSON, validation)
    RESIDUAL_MD.write_text(
        "# M2 C2 其他或新增渠道残差审计 v1\n\n"
        "通用 residual 预测现金合计为 0.00；已知渠道 matched actual coverage 为 "
        "83.7738%。原始浮点最大 work point 对账差为 0.0000001100 元，仅作为诊断保留。\n\n"
        "货币对账现将差额以 Decimal 按 0.01 元、ROUND_HALF_UP 量化为整数分，"
        "并要求分值精确等于 0；最大差异为 0 分，逐 case 不一致数为 0。"
        "这不是扩大金额容差，任何 1 分差异仍会失败。\n\n"
        "residual 参数只来自 strictly-earlier origins，不读取当前 outer truth，不记忆作品未来渠道，"
        "不伪造真实渠道名称，也不与已知渠道现金重复。公开报告不含渠道标识或区间端点。\n",
        encoding="utf-8",
    )
    MODEL_MD.write_text(
        "# M2 C2 模型质量判定 v1\n\n"
        "货币对账改为整数分精确相等后，固定 25 项模型质量条件通过 16 项，判定仍为 FAIL。"
        "仅 `residual_does_not_duplicate_cash` 由浮点表示误判修正为通过；预测、B4、Gate C、"
        "模型人口、其余门槛和指标均未改变。该判定不构成正式业务批准或 release。\n",
        encoding="utf-8",
    )
    VALIDATION_MD.write_text(
        "# M2 C2 development 验证 v1\n\n"
        "C2 已在冻结的 18615 个 development case、12223 个 statistically scoreable case 和 "
        "7851 个 formal-cash 模型人口 case 上执行。总体 WAPE 为 0.55695480，"
        "signed aggregate bias 为 +0.09289130。\n\n"
        "货币 reconciliation 已改为 Decimal 量化到 0.01 元后按整数分精确相等。"
        "原始浮点最大差异 0.0000001100 元保留为诊断，整数分差异为 0；"
        "因此 25 项通过数由 15 修正为 16。仅该数值表示门槛变化，模型预测和指标不变。\n\n"
        "模型质量判定仍为 FAIL；业务覆盖判定为 CONDITIONAL；总判定为 "
        "MODEL_FAIL_BUSINESS_COVERAGE_CONDITIONAL。所有选择只使用 strictly-earlier origin，"
        "B4 始终为锚，高价值证据不足时强制回退 B4。\n\n"
        "pure-buyout 无 cutoff commitment 时继续 null abstain；mixed 只预测实销和 cutoff 已确认应收。"
        "通用其他或新增渠道残差不预测真实渠道身份，也不重复已知渠道现金。\n\n"
        "结果继续为 not_for_formal_decision。final holdout、embargo shadow 和 deferred 60-month labels "
        "均未打开；未进入 C3，未 release，未进入 M3。\n",
        encoding="utf-8",
    )

    if PRIVATE_MANIFEST.is_file():
        manifest = load_json(PRIVATE_MANIFEST)
        public_paths = (
            RESIDUAL_JSON,
            RESIDUAL_MD,
            MODEL_JSON,
            MODEL_MD,
            VALIDATION_JSON,
            VALIDATION_MD,
        )
        for path in public_paths:
            manifest["publicArtifactSha256"][path.name] = sha256(path)
        write_json(PRIVATE_MANIFEST, manifest)

    result = verify_public()
    private_result = verify_private()
    return {
        **result,
        "privateReconciliationVerified": private_result["status"] == "passed",
        "previousResidualCondition": prior_value,
    }


def _assert_public_safety(paths: Sequence[Path]) -> None:
    forbidden = (
        "private-output",
        '"standard_work_id"',
        '"channel_key"',
        '"lower"',
        '"upper"',
        "optimistic",
        "pessimistic",
    )
    for path in paths:
        text = path.read_text(encoding="utf-8")
        if any(token.casefold() in text.casefold() for token in forbidden):
            raise ReconciliationCheckpointError(
                f"public correction artifact contains forbidden content: {path.name}"
            )


def verify_public() -> dict[str, Any]:
    amendment = load_amendment()
    verify_frozen_phase_a(amendment)
    synthetic_check()
    residual = load_json(RESIDUAL_JSON)
    model = load_json(MODEL_JSON)
    validation = load_json(VALIDATION_JSON)
    business = load_json(BUSINESS_JSON)
    verify_frozen_model_evidence(validation, amendment)
    boundary = amendment["correctionBoundary"]
    condition = boundary["allowedChangedAcceptanceCondition"]
    summary = validation.get("monetaryReconciliationCorrection", {})
    checks = (
        residual.get("maximumWorkPointReconciliationDifferenceRawYuan")
        == float(Decimal(boundary["expectedMaximumRawWorkPointDifferenceYuan"])),
        residual.get("maximumWorkPointReconciliationDifferenceCents") == 0,
        residual.get("workPointReconciliationMismatchCaseCountAtCentPrecision")
        == 0,
        residual.get("maximumTruthComponentReconciliationDifferenceCents") == 0,
        residual.get("truthComponentReconciliationMismatchCaseCountAtCentPrecision")
        == 0,
        residual.get("knownChannelCashDuplicated") is False,
        residual.get("workPointFormulaVerified") is True,
        residual.get("workPointFormulaVerificationBasis")
        == "exact_integer_cent_difference",
        residual.get("monetaryReconciliation", {}).get(
            "floatingAbsoluteToleranceUsed"
        )
        is False,
        residual.get("monetaryReconciliation", {}).get("oneCentMismatchMustFail")
        is True,
        validation["acceptance"]["conditions"][condition] is True,
        validation["acceptance"]["passedConditionCount"]
        == boundary["correctedPassedConditionCount"],
        validation["acceptance"]["conditionCount"] == boundary["conditionCount"],
        validation["modelQualityDecision"] == boundary["modelQualityDecision"],
        business["businessCoverageDecision"]
        == boundary["businessCoverageDecision"],
        validation["overallDecision"] == boundary["overallDecision"],
        canonical_digest(validation["acceptance"])
        == canonical_digest(model["acceptance"]),
        model["modelQualityDecision"] == boundary["modelQualityDecision"],
        summary.get("modelMetricsChanged") is False,
        summary.get("predictionsChanged") is False,
        summary.get("B4Changed") is False,
        summary.get("GateCChanged") is False,
        summary.get("modelPopulationChanged") is False,
        summary.get("otherAcceptanceThresholdsChanged") is False,
        all(value is False for value in validation["seals"].values()),
        validation["decisionStatus"] == "not_for_formal_decision",
        validation["C3Started"] is False,
        validation["releaseAuthorized"] is False,
        validation["M3Started"] is False,
    )
    if not all(checks):
        raise ReconciliationCheckpointError("public C2 correction evidence differs")
    _assert_public_safety(
        (RESIDUAL_JSON, RESIDUAL_MD, MODEL_JSON, MODEL_MD, VALIDATION_JSON, VALIDATION_MD)
    )
    return {
        "status": "passed",
        "mode": "public-checkpoint-verification",
        "acceptancePassedConditionCount": validation["acceptance"][
            "passedConditionCount"
        ],
        "acceptanceConditionCount": validation["acceptance"]["conditionCount"],
        "modelQualityDecision": validation["modelQualityDecision"],
        "businessCoverageDecision": validation["businessCoverageDecision"],
        "overallDecision": validation["overallDecision"],
        "overallWape": validation["metrics"]["modelPopulation"]["wape"],
        "overallSignedAggregateBias": validation["metrics"]["modelPopulation"][
            "signedAggregateBias"
        ],
        "maximumRawWorkPointDifferenceYuan": residual[
            "maximumWorkPointReconciliationDifferenceRawYuan"
        ],
        "maximumWorkPointDifferenceCents": residual[
            "maximumWorkPointReconciliationDifferenceCents"
        ],
        "gateCAllTrue": True,
        "finalHoldoutOpened": False,
        "decisionStatus": "not_for_formal_decision",
        "C3Started": False,
    }


def run_git(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args], cwd=ROOT, capture_output=True, text=True, check=False
    )


def verify_private() -> dict[str, Any]:
    amendment = load_amendment()
    verify_frozen_phase_a(amendment)
    audit = audit_private_cases(amendment)
    residual = load_json(RESIDUAL_JSON)
    if any(residual.get(key) != value for key, value in audit.items()):
        raise ReconciliationCheckpointError("private replay and residual report differ")
    if not PRIVATE_MANIFEST.is_file():
        raise ReconciliationCheckpointError("private C2 manifest is unavailable")
    manifest = load_json(PRIVATE_MANIFEST)
    for path in (
        RESIDUAL_JSON,
        RESIDUAL_MD,
        MODEL_JSON,
        MODEL_MD,
        VALIDATION_JSON,
        VALIDATION_MD,
    ):
        if manifest.get("publicArtifactSha256", {}).get(path.name) != sha256(path):
            raise ReconciliationCheckpointError(
                f"private manifest hash differs for {path.name}"
            )
    for path in (PRIVATE_CASES, PRIVATE_MANIFEST):
        relative = path.relative_to(ROOT).as_posix()
        if run_git("check-ignore", "--quiet", "--", relative).returncode != 0:
            raise ReconciliationCheckpointError(f"private path is not ignored: {relative}")
        if run_git("ls-files", "--error-unmatch", "--", relative).returncode == 0:
            raise ReconciliationCheckpointError(f"private path is tracked: {relative}")
    return {
        "status": "passed",
        "mode": "private-reconciliation-replay",
        "modelPopulationCaseCount": audit["modelPopulationCaseCount"],
        "maximumRawWorkPointDifferenceYuan": audit[
            "maximumWorkPointReconciliationDifferenceRawYuan"
        ],
        "maximumWorkPointDifferenceCents": audit[
            "maximumWorkPointReconciliationDifferenceCents"
        ],
        "privateFilesTracked": False,
        "finalHoldoutOpened": False,
    }


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--synthetic", action="store_true")
    modes.add_argument("--run-correction", action="store_true")
    modes.add_argument("--verify-public", action="store_true")
    modes.add_argument("--verify-private", action="store_true")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        if args.run_correction:
            result = apply_correction()
        elif args.verify_public:
            result = verify_public()
        elif args.verify_private:
            result = verify_private()
        else:
            amendment = load_amendment()
            verify_frozen_phase_a(amendment)
            result = {
                "status": "passed",
                "mode": "synthetic-only",
                "checks": synthetic_check(),
                "privateDataRead": False,
                "finalHoldoutOpened": False,
            }
        print(json.dumps(result, ensure_ascii=False, sort_keys=True))
        return 0
    except (OSError, ValueError, KeyError, ReconciliationCheckpointError) as error:
        print(f"C2 reconciliation checkpoint failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
