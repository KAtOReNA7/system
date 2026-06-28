import assert from "node:assert/strict";
import test from "node:test";

import {
  validateFieldCompletionRows,
  assertValidFieldCompletionRows,
  summarizeValidationIssues
} from "../src/domain/newProductEvaluation/fieldCompletionValidator.js";

test("validator accepts complete publication row", () => {
  const validation = validateFieldCompletionRows([completeRow()]);

  assert.equal(validation.ok, true);
  assert.equal(validation.issueCount, 0);
});

test("source outside publication or web_original is rejected", () => {
  const validation = validateFieldCompletionRows([{ ...completeRow(), userFields: { ...completeFields(), source: "other" } }]);

  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some((item) => item.field === "source" && item.code === "invalid_value"));
});

test("missing wordCount and audioVolumeEstimate is rejected", () => {
  const fields = completeFields();
  fields.wordCount = "";
  fields.audioVolumeEstimate = "";
  const validation = validateFieldCompletionRows([{ ...completeRow(), userFields: fields }]);

  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some((item) => item.field === "wordCountOrAudioVolumeEstimate"));
});

test("missing heat signal pair is rejected", () => {
  const fields = completeFields();
  fields.heatSignalValue = "";
  const validation = validateFieldCompletionRows([{ ...completeRow(), userFields: fields }]);

  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some((item) => item.field === "heatSignal"));
});

test("web_original missing completionStatus is rejected", () => {
  const fields = completeFields();
  fields.source = "web_original";
  fields.completionStatus = "";
  const validation = validateFieldCompletionRows([{ ...completeRow(), userFields: fields }]);

  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some((item) => item.field === "completionStatus"));
});

test("sameNameAudioStatusCheckStatus not checked is rejected", () => {
  const fields = completeFields();
  fields.sameNameAudioStatusCheckStatus = "unchecked";
  const validation = validateFieldCompletionRows([{ ...completeRow(), userFields: fields }]);

  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some((item) => item.field === "sameNameAudioStatusCheckStatus"));
});

test("validator does not expose real field values", () => {
  const validation = validateFieldCompletionRows([{
    anonymousMaterialId: "ANON-SECRET",
    userFields: {
      title: "Real Title Should Not Print",
      author: "Real Author Should Not Print",
      source: "bad-source"
    }
  }]);
  const summary = summarizeValidationIssues(validation.issues);
  const text = JSON.stringify(summary);

  assert.equal(text.includes("Real Title Should Not Print"), false);
  assert.equal(text.includes("Real Author Should Not Print"), false);
  assert.equal(text.includes("ANON-SECRET"), true);
});

test("assertValidFieldCompletionRows throws sanitized validation", () => {
  assert.throws(
    () => assertValidFieldCompletionRows([{ anonymousMaterialId: "ANON-INVALID", userFields: {} }]),
    /missing or invalid/
  );
});

function completeRow() {
  return {
    anonymousMaterialId: "ANON-VALID-001",
    userFields: completeFields()
  };
}

function completeFields() {
  return {
    title: "Sensitive Title",
    author: "Sensitive Author",
    source: "publication",
    classification: "class-a",
    wordCount: "320000",
    audioVolumeEstimate: "",
    heatSignalType: "reads",
    heatSignalValue: "50000",
    copyrightTermRange: "3 years",
    targetChannels: "channel-a, channel-b",
    sameNameAudioStatusCheckStatus: "checked",
    sameNameAudioStatus: "none",
    completionStatus: ""
  };
}
