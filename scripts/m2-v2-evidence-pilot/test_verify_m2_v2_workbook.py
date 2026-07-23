#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import tempfile
import unittest
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

MODULE_PATH = Path(__file__).with_name("verify_m2_v2_workbook.py")
SPEC = importlib.util.spec_from_file_location("workbook_verifier", MODULE_PATH)
assert SPEC and SPEC.loader
VERIFIER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VERIFIER)


class WorkbookVerifierTest(unittest.TestCase):
    def test_actual_ooxml_contract_is_recomputed_and_targets_are_redacted(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "valid.xlsx"
            build_xlsx(path)
            result = VERIFIER.inspect_workbook(path, ("Review",))
            self.assertTrue(result["passed"], result["issues"])
            self.assertEqual(result["sheetNames"], ["Review"])
            self.assertEqual(result["rowCounts"], [1])
            self.assertEqual(result["formulaCount"], 0)
            self.assertEqual(result["formulaErrorCount"], 0)
            self.assertEqual(result["cachedFormulaErrors"], [])
            self.assertEqual(result["nativeHyperlinkCount"], 1)
            self.assertEqual(result["hyperlinkCount"], 1)
            self.assertEqual(result["formulaHyperlinkCount"], 0)
            self.assertEqual(result["validationCount"], 1)
            self.assertEqual(result["dataValidationCount"], 1)
            self.assertGreater(result["styledCellCount"], 0)
            self.assertEqual(result["hyperlinkTargets"][0]["protocol"], "https")
            self.assertEqual(result["hyperlinkTargets"][0]["relationshipType"], "hyperlink")
            self.assertEqual(len(result["hyperlinkTargets"][0]["targetDigest"]), 64)
            self.assertNotIn("target", result["hyperlinkTargets"][0])
            self.assertNotIn("example.test", str(result))
            self.assertFalse(result["generatorAssertionsTrusted"])
            self.assertFalse(result["visualReviewAttested"])

    def test_cached_formula_error_and_secret_are_recomputed_from_cells(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "invalid.xlsx"
            build_xlsx(path, formula_error=True)
            result = VERIFIER.inspect_workbook(path, ("Review",))
            self.assertFalse(result["passed"])
            self.assertEqual(result["formulaCount"], 1)
            self.assertEqual(result["formulaErrorCount"], 1)
            self.assertEqual(result["formulaHyperlinkCount"], 1)
            self.assertEqual(result["cachedFormulaErrorCount"], 1)
            self.assertEqual(len(result["cachedFormulaErrors"]), 1)
            self.assertEqual(result["cachedFormulaErrors"][0]["cellRef"], "A1")
            self.assertEqual(result["cachedFormulaErrors"][0]["errorClass"], "excel_error_token")
            self.assertNotIn("#VALUE!", str(result["cachedFormulaErrors"]))
            self.assertEqual(result["secretCount"], 1)
            self.assertIn("formula_or_cached_value_error_present", result["issues"])
            self.assertIn("formula_hyperlink_forbidden_use_native_hyperlink", result["issues"])
            self.assertIn("secret_like_content_present", result["issues"])

    def test_hidden_external_defined_name_custom_xml_and_privacy_values_fail_closed(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "privacy-invalid.xlsx"
            build_xlsx(path, privacy_invalid=True)
            result = VERIFIER.inspect_workbook(path, forbidden_tokens=("caller-only-marker",))
            self.assertFalse(result["passed"])
            self.assertEqual(result["hiddenSheetCount"], 1)
            self.assertGreater(result["externalLinkCount"], 0)
            self.assertGreater(result["externalLinkPartCount"], 0)
            self.assertEqual(result["definedNameCount"], 1)
            self.assertEqual(result["customXmlPartCount"], 1)
            self.assertGreater(result["forbiddenValueCount"], 0)
            self.assertGreater(result["callerForbiddenTokenMatchCount"], 0)
            self.assertGreater(result["internalIdCount"], 0)
            self.assertGreater(result["incomeValueCount"], 0)
            self.assertGreater(result["secretCount"], 0)
            self.assertIn("hidden_sheet_present", result["issues"])
            self.assertIn("external_workbook_link_present", result["issues"])
            self.assertIn("custom_xml_part_present", result["issues"])
            self.assertIn("internal_id_present", result["issues"])
            self.assertIn("income_value_present", result["issues"])

    def test_fixed_v04_profile_requires_four_sheets_115_native_links_and_zero_errors(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "profile.xlsx"
            build_profile_xlsx(path)
            result = VERIFIER.inspect_workbook(path, profile="m2-v2-canary-v3-review-v0.4")
            self.assertTrue(result["passed"], result["issues"])
            self.assertEqual(result["sheetNames"], list(VERIFIER.PROFILE_SHEETS))
            self.assertEqual(result["sheetCount"], 4)
            self.assertEqual(result["nativeHyperlinkCount"], 115)
            self.assertEqual(result["hyperlinkCount"], 115)
            self.assertEqual(result["formulaErrorCount"], 0)
            self.assertEqual(result["cachedFormulaErrors"], [])
            self.assertEqual(result["validationCount"], 3)
            self.assertEqual(result["externalLinkCount"], 0)
            self.assertEqual(result["customXmlPartCount"], 0)

    def test_dummy_pk_is_not_an_xlsx(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "dummy.xlsx"
            path.write_bytes(b"PK")
            result = VERIFIER.inspect_workbook(path)
            self.assertFalse(result["passed"])
            self.assertIn("xlsx_zip_invalid", result["issues"])


def build_xlsx(path: Path, formula_error: bool = False, privacy_invalid: bool = False) -> None:
    hidden = ' state="hidden"' if privacy_invalid else ""
    defined_names = (
        "<definedNames><definedName name=\"ExternalAudit\">[leak.xlsx]Sheet1!$A$1</definedName></definedNames>"
        if privacy_invalid
        else ""
    )
    external_refs = (
        f'<externalReferences><externalReference xmlns:r="{VERIFIER.REL}" r:id="rId3"/></externalReferences>'
        if privacy_invalid
        else ""
    )
    workbook = (
        f'<workbook xmlns="{VERIFIER.MAIN}" xmlns:r="{VERIFIER.REL}">'
        f'<sheets><sheet name="Review" sheetId="1" r:id="rId1"{hidden}/></sheets>'
        f"{defined_names}{external_refs}</workbook>"
    )
    workbook_rel_items = [
        relationship("rId1", "worksheet", "worksheets/sheet1.xml"),
        relationship("rId2", "styles", "styles.xml"),
    ]
    if privacy_invalid:
        workbook_rel_items.append(relationship("rId3", "externalLink", "externalLinks/externalLink1.xml"))
    workbook_rels = relationships(workbook_rel_items)

    if formula_error:
        sheet = (
            f'<worksheet xmlns="{VERIFIER.MAIN}"><sheetData><row r="1">'
            '<c r="A1" t="e"><f>HYPERLINK(&quot;https://example.test&quot;,&quot;Open&quot;)</f><v>#VALUE!</v></c>'
            '<c r="B1" t="inlineStr"><is><t>Bearer abcdefghijklmnopqrstuvwxyz</t></is></c>'
            "</row></sheetData></worksheet>"
        )
        sheet_rels = None
        shared_strings = None
    elif privacy_invalid:
        sheet = (
            f'<worksheet xmlns="{VERIFIER.MAIN}"><sheetData><row r="1">'
            '<c r="A1" t="s"><v>0</v></c></row></sheetData></worksheet>'
        )
        sheet_rels = None
        shared_strings = (
            f'<sst xmlns="{VERIFIER.MAIN}" count="1" uniqueCount="1"><si><t>'
            "standardWorkId=123 revenue=9000 rawResponse caller-only-marker "
            "password=abcdefghijklmnop"
            "</t></si></sst>"
        )
    else:
        sheet = (
            f'<worksheet xmlns="{VERIFIER.MAIN}" xmlns:r="{VERIFIER.REL}">'
            '<sheetData><row r="1"><c r="A1" t="inlineStr" s="1"><is><t>Open</t></is></c></row></sheetData>'
            '<dataValidations count="1"><dataValidation type="list" sqref="A2">'
            '<formula1>&quot;yes,no&quot;</formula1></dataValidation></dataValidations>'
            '<hyperlinks><hyperlink ref="A1" r:id="rId1"/></hyperlinks></worksheet>'
        )
        sheet_rels = relationships(
            [relationship("rId1", "hyperlink", "https://example.test/review", external=True)]
        )
        shared_strings = None

    content_types = content_types_xml(1, shared_strings is not None, privacy_invalid)
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", content_types)
        archive.writestr("_rels/.rels", root_relationships())
        archive.writestr("xl/workbook.xml", workbook)
        archive.writestr("xl/_rels/workbook.xml.rels", workbook_rels)
        archive.writestr("xl/worksheets/sheet1.xml", sheet)
        archive.writestr("xl/styles.xml", styles_xml())
        if sheet_rels:
            archive.writestr("xl/worksheets/_rels/sheet1.xml.rels", sheet_rels)
        if shared_strings:
            archive.writestr("xl/sharedStrings.xml", shared_strings)
        if privacy_invalid:
            archive.writestr(
                "xl/externalLinks/externalLink1.xml",
                f'<externalLink xmlns="{VERIFIER.MAIN}"/>',
            )
            archive.writestr(
                "customXml/item1.xml",
                "<audit><marker>rawResponse</marker></audit>",
            )


def build_profile_xlsx(path: Path) -> None:
    sheet_count = len(VERIFIER.PROFILE_SHEETS)
    workbook_sheets = "".join(
        f'<sheet name="{escape(name)}" sheetId="{index}" r:id="rId{index}"/>'
        for index, name in enumerate(VERIFIER.PROFILE_SHEETS, start=1)
    )
    workbook = (
        f'<workbook xmlns="{VERIFIER.MAIN}" xmlns:r="{VERIFIER.REL}">'
        f"<sheets>{workbook_sheets}</sheets></workbook>"
    )
    workbook_rels = relationships(
        [
            relationship(f"rId{index}", "worksheet", f"worksheets/sheet{index}.xml")
            for index in range(1, sheet_count + 1)
        ]
        + [relationship(f"rId{sheet_count + 1}", "styles", "styles.xml")]
    )

    rows = "".join(
        f'<row r="{index}"><c r="A{index}" t="inlineStr" s="1"><is><t>Open {index}</t></is></c></row>'
        for index in range(1, 116)
    )
    links = "".join(f'<hyperlink ref="A{index}" r:id="rId{index}"/>' for index in range(1, 116))
    validations = "".join(
        f'<dataValidation type="list" sqref="B{index}"><formula1>&quot;yes,no&quot;</formula1></dataValidation>'
        for index in range(1, 4)
    )
    first_sheet = (
        f'<worksheet xmlns="{VERIFIER.MAIN}" xmlns:r="{VERIFIER.REL}">'
        f"<sheetData>{rows}</sheetData><dataValidations count=\"3\">{validations}</dataValidations>"
        f"<hyperlinks>{links}</hyperlinks></worksheet>"
    )
    first_rels = relationships(
        [
            relationship(
                f"rId{index}",
                "hyperlink",
                f"https://example.test/review/{index:03d}",
                external=True,
            )
            for index in range(1, 116)
        ]
    )

    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", content_types_xml(sheet_count, False, False))
        archive.writestr("_rels/.rels", root_relationships())
        archive.writestr("xl/workbook.xml", workbook)
        archive.writestr("xl/_rels/workbook.xml.rels", workbook_rels)
        archive.writestr("xl/styles.xml", styles_xml())
        archive.writestr("xl/worksheets/sheet1.xml", first_sheet)
        archive.writestr("xl/worksheets/_rels/sheet1.xml.rels", first_rels)
        for index in range(2, sheet_count + 1):
            archive.writestr(
                f"xl/worksheets/sheet{index}.xml",
                f'<worksheet xmlns="{VERIFIER.MAIN}"><sheetData><row r="1"/></sheetData></worksheet>',
            )


def content_types_xml(sheet_count: int, shared_strings: bool, external_link: bool) -> str:
    overrides = [
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
    ]
    overrides.extend(
        f'<Override PartName="/xl/worksheets/sheet{index}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        for index in range(1, sheet_count + 1)
    )
    if shared_strings:
        overrides.append(
            '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'
        )
    if external_link:
        overrides.append(
            '<Override PartName="/xl/externalLinks/externalLink1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.externalLink+xml"/>'
        )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        + "".join(overrides)
        + "</Types>"
    )


def relationship(rel_id: str, kind: str, target: str, external: bool = False) -> str:
    target_mode = ' TargetMode="External"' if external else ""
    return (
        f'<Relationship Id="{rel_id}" '
        f'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/{kind}" '
        f'Target="{escape(target)}"{target_mode}/>'
    )


def relationships(items: list[str]) -> str:
    return (
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + "".join(items)
        + "</Relationships>"
    )


def root_relationships() -> str:
    return relationships([relationship("rId1", "officeDocument", "xl/workbook.xml")])


def styles_xml() -> str:
    return (
        f'<styleSheet xmlns="{VERIFIER.MAIN}"><fonts count="1"><font/></fonts>'
        '<fills count="1"><fill/></fills><borders count="1"><border/></borders>'
        '<cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf/></cellXfs>'
        "</styleSheet>"
    )


if __name__ == "__main__":
    unittest.main()
