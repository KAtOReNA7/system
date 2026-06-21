from __future__ import annotations

import math
import re
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any


BUSINESS_FORM_AUDIO_COPYRIGHT = "有声版权"
BUSINESS_FORM_AUDIO_PRODUCT = "有声成品"


@dataclass(frozen=True)
class WorkIdParseResult:
    raw: str
    normalized_raw: str
    standard_id: str | None
    business_form: str | None
    valid: bool
    format: str


def raw_work_id_text(value: Any) -> str:
    """Return the bill/master work ID as a text identifier without guessing fixes."""
    if value is None:
        return ""
    if isinstance(value, float) and math.isnan(value):
        return ""
    if isinstance(value, bool):
        return str(value)
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        if math.isfinite(value) and value.is_integer():
            return str(int(value))
        return format(value, ".15g")
    return str(value)


def derive_standard_work_id(raw_work_id: Any) -> str | None:
    text = raw_work_id_text(raw_work_id)
    if re.fullmatch(r"[0-9]+", text):
        return text
    if re.fullmatch(r"Y[0-9]+", text):
        return text[1:]
    return None


def derive_business_form(raw_work_id: Any) -> str | None:
    text = raw_work_id_text(raw_work_id)
    if re.fullmatch(r"[0-9]+", text):
        return BUSINESS_FORM_AUDIO_COPYRIGHT
    if re.fullmatch(r"Y[0-9]+", text):
        return BUSINESS_FORM_AUDIO_PRODUCT
    return None


def parse_raw_work_id(raw_work_id: Any) -> WorkIdParseResult:
    text = raw_work_id_text(raw_work_id)
    if text == "":
        return WorkIdParseResult(
            raw="",
            normalized_raw="",
            standard_id=None,
            business_form=None,
            valid=False,
            format="blank",
        )
    if re.fullmatch(r"[0-9]+", text):
        return WorkIdParseResult(
            raw=text,
            normalized_raw=text,
            standard_id=text,
            business_form=BUSINESS_FORM_AUDIO_COPYRIGHT,
            valid=True,
            format="pure_digits",
        )
    if re.fullmatch(r"Y[0-9]+", text):
        return WorkIdParseResult(
            raw=text,
            normalized_raw=text,
            standard_id=text[1:],
            business_form=BUSINESS_FORM_AUDIO_PRODUCT,
            valid=True,
            format="Y_prefix",
        )
    if re.fullmatch(r"y[0-9]+", text):
        fmt = "lowercase_y_prefix"
    elif text.strip() != text and re.fullmatch(r"[Yy]?[0-9]+", text.strip()):
        fmt = "whitespace_variant"
    elif re.fullmatch(r"[0-9]+\.0+", text):
        fmt = "decimal_integer_text"
    else:
        fmt = "unsupported"
    return WorkIdParseResult(
        raw=text,
        normalized_raw=text,
        standard_id=None,
        business_form=None,
        valid=False,
        format=fmt,
    )


def parse_work_id_dict(raw_work_id: Any) -> dict[str, Any]:
    result = parse_raw_work_id(raw_work_id)
    return {
        "raw": result.raw,
        "normalized_raw": result.normalized_raw,
        "standard_id": result.standard_id,
        "business_form": result.business_form,
        "valid": result.valid,
        "format": result.format,
    }
