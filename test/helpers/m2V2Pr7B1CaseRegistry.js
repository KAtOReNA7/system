import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const registry = JSON.parse(readFileSync(
  new URL("../../config/m2-v2-pr7-s1-case-registry.v0.1.json", import.meta.url),
  "utf8",
));

export function casesForFinding(findingId) {
  const cases = registry.cases.filter((entry) => entry.findingId === findingId);
  assert.equal(cases.length, 9, `${findingId}:registry_case_count`);
  assert.equal(new Set(cases.map((entry) => entry.caseId)).size, cases.length, `${findingId}:duplicate_case_id`);
  for (const entry of cases) {
    assert.equal(entry.providerAllowed, false, `${entry.caseId}:provider_must_be_forbidden`);
    assert.equal(entry.privateStateAllowed, "SYNTHETIC_TEMP_ONLY", `${entry.caseId}:synthetic_only`);
    assert.equal(entry.mustEnterDefaultNpmTest, true, `${entry.caseId}:default_test_required`);
    assert.equal(entry.secondaryVerifierRequired, true, `${entry.caseId}:secondary_verifier_required`);
    assert.deepEqual(entry.platforms, ["linux", "windows"], `${entry.caseId}:native_platform_coverage`);
  }
  return cases;
}

export function assertRejectedByBoth(caseId, expectedReason, publicResult, secondaryResult) {
  assert.equal(publicResult?.allPassed ?? publicResult?.valid, false, `${caseId}:public_verifier_must_fail`);
  assert.equal(secondaryResult?.allPassed ?? secondaryResult?.valid, false, `${caseId}:secondary_checker_must_fail`);
  assert.equal(hasIssue(publicResult, expectedReason), true, `${caseId}:public_reason:${expectedReason}`);
  assert.equal(hasIssue(secondaryResult, expectedReason), true, `${caseId}:secondary_reason:${expectedReason}`);
}

export function assertAcceptedByBoth(caseId, publicResult, secondaryResult) {
  assert.equal(publicResult?.allPassed ?? publicResult?.valid, true, `${caseId}:public_verifier_must_pass`);
  assert.equal(secondaryResult?.allPassed ?? secondaryResult?.valid, true, `${caseId}:secondary_checker_must_pass`);
  assert.deepEqual(publicResult?.issues ?? [], [], `${caseId}:public_issues`);
  assert.deepEqual(secondaryResult?.issues ?? [], [], `${caseId}:secondary_issues`);
}

export function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

export function hasIssue(result, expectedReason) {
  return (result?.issues ?? []).some((issue) => issueText(issue).includes(expectedReason));
}

function issueText(issue) {
  if (typeof issue === "string") return issue;
  if (!issue || typeof issue !== "object") return String(issue);
  return [issue.reason, issue.code, issue.message, JSON.stringify(issue)].filter(Boolean).join(":");
}
