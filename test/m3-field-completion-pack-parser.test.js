import assert from "node:assert/strict";
import test from "node:test";

import {
  inferFieldCompletionPackFormat,
  parseFieldCompletionPack,
  parseJsonCompletionPack,
  parseMarkdownCompletionPack
} from "../src/domain/newProductEvaluation/fieldCompletionPackParser.js";

test("JSON completion pack can be parsed", () => {
  const parsed = parseJsonCompletionPack(JSON.stringify({
    version: "synthetic-json-pack",
    rows: [completeRow("ANON-001")]
  }));

  assert.equal(parsed.format, "json");
  assert.equal(parsed.materialCount, 1);
  assert.equal(parsed.rows[0].anonymousMaterialId, "ANON-001");
  assert.equal(parsed.rows[0].userFields.title, "Sensitive Title Should Stay Internal");
});

test("Markdown completion pack can be parsed from fillable table", () => {
  const parsed = parseMarkdownCompletionPack(markdownPack());

  assert.equal(parsed.format, "markdown");
  assert.equal(parsed.materialCount, 1);
  assert.equal(parsed.rows[0].anonymousMaterialId, "ANON-MD-001");
  assert.equal(parsed.rows[0].userFields.source, "publication");
  assert.equal(parsed.rows[0].userFields.heatSignalType, "ratingScore");
  assert.equal(parsed.rows[0].userFields.targetChannels, "channel-a, channel-b");
});

test("Markdown table fields map to userFields", () => {
  const row = parseFieldCompletionPack(markdownPack(), { format: "markdown" }).rows[0];

  assert.equal(row.userFields.title, "Sensitive Markdown Title");
  assert.equal(row.userFields.author, "Sensitive Markdown Author");
  assert.equal(row.userFields.classification, "class-a");
  assert.equal(row.userFields.wordCount, "320000");
  assert.equal(row.userFields.sameNameAudioStatusCheckStatus, "checked");
  assert.equal(row.userFields.sameNameAudioStatus, "none");
});

test("Legacy summary markdown table parses but contains empty user fields", () => {
  const parsed = parseMarkdownCompletionPack([
    "# M3 private material field completion pack v0.1",
    "",
    "| anonymousMaterialId | inputExtension | readinessStatus | missingCoreFields | userFieldsToFill |",
    "| --- | --- | --- | --- | --- |",
    "| ANON-LEGACY-001 | .doc | blocked | title, author | title, author |"
  ].join("\n"));

  assert.equal(parsed.materialCount, 1);
  assert.equal(parsed.rows[0].anonymousMaterialId, "ANON-LEGACY-001");
  assert.equal(parsed.rows[0].userFields.title, "");
});

test("XLSX format is detected but not parsed without project dependency", () => {
  assert.equal(inferFieldCompletionPackFormat("pack.xlsx"), "xlsx");
  assert.throws(
    () => parseFieldCompletionPack("", { filePath: "pack.xlsx" }),
    /xlsx completion pack parsing is not enabled/
  );
});

function completeRow(anonymousMaterialId) {
  return {
    anonymousMaterialId,
    inputExtension: ".fixture",
    parseStatus: "synthetic",
    readinessStatus: "blocked",
    hardBlockerCodes: ["missing_title"],
    missingCoreFields: ["title"],
    userFields: {
      title: "Sensitive Title Should Stay Internal",
      author: "Sensitive Author Should Stay Internal",
      source: "publication",
      classification: "class-a",
      wordCount: "320000",
      heatSignalType: "reads",
      heatSignalValue: "50000",
      copyrightTermRange: "3 years",
      targetChannels: "channel-a, channel-b",
      sameNameAudioStatusCheckStatus: "checked",
      sameNameAudioStatus: "none"
    }
  };
}

function markdownPack() {
  return [
    "# M3 private material field completion pack v0.1",
    "",
    "| anonymousMaterialId | inputExtension | parseStatus | readinessStatus | missingCoreFields | title | author | source | classification | wordCount | audioVolumeEstimate | heatSignalType | heatSignalValue | copyrightTermRange | targetChannels | sameNameAudioStatusCheckStatus | sameNameAudioStatus | completionStatus | notes |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    "| ANON-MD-001 | .md | parsed | blocked | title | Sensitive Markdown Title | Sensitive Markdown Author | publication | class-a | 320000 |  | rating | 8.2 | 3 years | channel-a, channel-b | checked | none |  | synthetic note |"
  ].join("\n");
}
