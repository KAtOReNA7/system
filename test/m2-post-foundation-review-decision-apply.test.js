import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const publicSummary =
  "docs/analysis/m2-real-data/M2-post-foundation-review-decision-apply-summary-v1.json";

test("post-foundation decision fixture resolves current authorization evidence without writes", () => {
  const output = execFileSync(
    "python",
    [
      "scripts/m2-real-data/run_m2_post_foundation_review_decision_apply.py",
      "--fixture-self-test"
    ],
    { encoding: "utf8" }
  );
  const result = JSON.parse(output);

  assert.equal(result.fixtureSelfTest, true);
  assert.equal(result.currentAuthorizationWinsStaleConflict, true);
  assert.equal(result.latestCurrentAuthorizationWinsOlderAuthorization, true);
  assert.equal(result.unresolvableEmptyCandidatesBlocked, true);
  assert.equal(result.noDatabaseWrite, true);
  assert.equal(result.noMappingActivation, true);
  assert.equal(result.noFormalEvaluation, true);
});

test("post-foundation formal input contract supports perpetual rights and rejects suggestions", () => {
  const output = execFileSync(
    "python",
    [
      "scripts/m2-real-data/m2_post_foundation_input_contract.py",
      "--fixture-self-test"
    ],
    { encoding: "utf8" }
  );
  const result = JSON.parse(output);

  assert.equal(result.verifiedFixtureAccepted, true);
  assert.equal(result.perpetualRightsAccepted, true);
  assert.equal(result.operatingSuggestionRejected, true);
  assert.equal(result.noDatabaseWrite, true);
  assert.equal(result.noFormalMasterDataWrite, true);
});

test("sanitized decision summary contains aggregate closure evidence only", async () => {
  const summary = JSON.parse(await readFile(publicSummary, "utf8"));
  const serialized = JSON.stringify(summary);

  assert.equal(summary.input.total, 238);
  assert.equal(summary.result.pending, 0);
  assert.equal(summary.result.formalInputContractVerified, true);
  assert.equal(summary.privacy.containsRealTitles, false);
  assert.equal(summary.privacy.containsAuthors, false);
  assert.equal(summary.privacy.containsChannels, false);
  for (const forbidden of [
    "standardWorkId",
    "作品编号",
    "书名",
    "作者名",
    "渠道名",
    "userNote",
    "connectionString"
  ]) {
    assert.equal(serialized.includes(forbidden), false, `summary includes ${forbidden}`);
  }
});
