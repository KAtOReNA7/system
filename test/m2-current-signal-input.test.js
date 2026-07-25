import assert from "node:assert/strict";
import {
  execFileSync,
  spawnSync
} from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildM2CurrentSignalInputBundle,
  diagnoseM2CurrentSignalInputBundle,
  fingerprintM2CurrentSignalCasePopulation,
  summarizeM2CurrentSignalInputBundle
} from "../src/domain/m2Current/signalInputBundle.js";

const bundleFixture = JSON.parse(readFileSync(
  "test/fixtures/m2-current-signal-input-bundle.synthetic.v0.1.json",
  "utf8"
));
const caseFixtureText = readFileSync(
  "test/fixtures/m2-current-signal-cases.synthetic.v0.1.ndjson",
  "utf8"
);
const caseFixture = parseNdjson(caseFixtureText);

test("portable signal bundle resolves facts and reports aggregate coverage", () => {
  const bundle = buildM2CurrentSignalInputBundle(bundleFixture);
  const summary = summarizeM2CurrentSignalInputBundle(bundle);
  const diagnostic = diagnoseM2CurrentSignalInputBundle(
    caseFixture,
    bundleFixture
  );
  const serialized = JSON.stringify(diagnostic);

  assert.equal(bundle.facts.length, 4);
  assert.equal(bundle.currency, "CNY");
  assert.equal(bundle.snapshots.length, 6);
  assert.equal(bundle.snapshots[0].factIds.length, 1);
  assert.equal(bundle.snapshots[1].factIds.length, 3);
  assert.equal(
    bundle.snapshots[2].signals.occurrence.value,
    null
  );
  assert.deepEqual(summary.eventTypeCounts, {
    refund: 1,
    reversal: 1,
    sale: 2
  });
  assert.equal(summary.rowIdentifiersIncluded, false);
  assert.equal(summary.currency, "CNY");
  assert.equal(diagnostic.coverage.workOriginSegmentCount, 6);
  assert.equal(diagnostic.coverage.overall.occurrence.coverage, 5 / 6);
  assert.equal(
    diagnostic.coverage.overall.positiveAmount.twoPartReadinessCoverage,
    5 / 6
  );
  assert.equal(diagnostic.readiness.coverageComplete, false);
  assert.equal(diagnostic.readiness.newCandidateFamilyAuthorized, false);
  assert.equal(
    fingerprintM2CurrentSignalCasePopulation(caseFixture),
    bundleFixture.casePopulationSha256
  );
  assert.doesNotMatch(serialized, /SYN-WORK/u);
  assert.doesNotMatch(serialized, /factId|recordId|standardWorkId/u);
});

test("signal bundle rejects backfill, incomplete history and status regression", () => {
  assert.throws(
    () => buildM2CurrentSignalInputBundle({
      ...bundleFixture,
      currentStateBackfillUsed: true
    }),
    /current_state_backfill_declaration_required/u
  );
  assert.throws(
    () => buildM2CurrentSignalInputBundle({
      ...bundleFixture,
      currency: "USD"
    }),
    /fact_currency_mismatch/u
  );

  const incomplete = structuredClone(bundleFixture);
  incomplete.snapshots[1].factIds = [
    "SYN-DENSE-REFUND-1",
    "SYN-DENSE-REVERSAL-1"
  ];
  assert.throws(
    () => buildM2CurrentSignalInputBundle(incomplete),
    /observed_snapshot_not_complete/u
  );

  const regression = structuredClone(bundleFixture);
  regression.facts = regression.facts.filter(
    (fact) => fact.factId === "SYN-DENSE-SALE-1"
  );
  regression.snapshots = regression.snapshots
    .filter((snapshot) => snapshot.standardWorkId === "SYN-WORK-DENSE");
  regression.snapshots[1] = {
    ...regression.snapshots[1],
    status: "unknown_at_origin",
    factIds: [],
    authority: null,
    missingReason: "historical_snapshot_absent"
  };
  assert.throws(
    () => buildM2CurrentSignalInputBundle(regression),
    /observed_history_became_unknown/u
  );

  const movedPopulation = structuredClone(caseFixture);
  movedPopulation[0].horizonMonths = 12;
  assert.throws(
    () => diagnoseM2CurrentSignalInputBundle(
      movedPopulation,
      bundleFixture
    ),
    /case_population_fingerprint_mismatch/u
  );
});

test("portable signal diagnostic CLI verifies tracked synthetic evidence", () => {
  assert.equal(
    execFileSync(
      process.execPath,
      [
        "scripts/m2-current/"
          + "run_m2_current_signal_input_diagnostics.mjs",
        "--verify"
      ],
      { encoding: "utf8", windowsHide: true }
    ).trim(),
    "M2 current portable signal input diagnostic verified."
  );
  const fingerprint = JSON.parse(execFileSync(
    process.execPath,
    [
      "scripts/m2-current/"
        + "run_m2_current_signal_input_diagnostics.mjs",
      "--fingerprint-cases",
      "--case-file",
      "test/fixtures/m2-current-signal-cases.synthetic.v0.1.ndjson"
    ],
    { encoding: "utf8", windowsHide: true }
  ));
  assert.equal(fingerprint.caseRowCount, 7);
  assert.equal(
    fingerprint.caseFileSha256,
    bundleFixture.caseFileSha256
  );
  assert.equal(
    fingerprint.casePopulationSha256,
    bundleFixture.casePopulationSha256
  );
  assert.equal(fingerprint.rowIdentifiersIncluded, false);
});

test("external NDJSON signal bundle is hash-bound and aggregate-only", () => {
  const directory = mkdtempSync(path.join(
    tmpdir(),
    "m2-signal-input-test-"
  ));
  try {
    const factsText = encodeNdjson(bundleFixture.facts);
    const snapshotsText = encodeNdjson(bundleFixture.snapshots);
    const factFile = path.join(directory, "facts.ndjson");
    const snapshotFile = path.join(directory, "snapshots.ndjson");
    const bundleFile = path.join(directory, "bundle.json");
    const caseFile = path.join(directory, "cases.ndjson");
    writeFileSync(factFile, factsText, "utf8");
    writeFileSync(snapshotFile, snapshotsText, "utf8");
    writeFileSync(caseFile, caseFixtureText, "utf8");
    writeFileSync(bundleFile, JSON.stringify({
      ...bundleFixture,
      facts: undefined,
      snapshots: undefined,
      factFile: "facts.ndjson",
      factFileSha256: digest(factsText),
      factRowCount: bundleFixture.facts.length,
      snapshotFile: "snapshots.ndjson",
      snapshotFileSha256: digest(snapshotsText),
      snapshotRowCount: bundleFixture.snapshots.length
    }), "utf8");

    const output = execFileSync(
      process.execPath,
      [
        "scripts/m2-current/"
          + "run_m2_current_signal_input_diagnostics.mjs",
        "--bundle-file",
        bundleFile,
        "--case-file",
        caseFile
      ],
      { encoding: "utf8", windowsHide: true }
    );
    const diagnostic = JSON.parse(output);
    assert.equal(diagnostic.bundle.factCount, 4);
    assert.equal(diagnostic.coverage.inputCaseCount, 7);
    assert.doesNotMatch(output, /SYN-WORK/u);
    assert.doesNotMatch(
      output,
      /factId|recordId|standardWorkId|synthetic-ledger/u
    );

    writeFileSync(caseFile, `${caseFixtureText} \n`, "utf8");
    assert.throws(
      () => execFileSync(
        process.execPath,
        [
          "scripts/m2-current/"
            + "run_m2_current_signal_input_diagnostics.mjs",
          "--bundle-file",
          bundleFile,
          "--case-file",
          caseFile
        ],
        { encoding: "utf8", windowsHide: true, stdio: "pipe" }
      ),
      /cases_hash_mismatch/u
    );
    writeFileSync(caseFile, caseFixtureText, "utf8");

    writeFileSync(factFile, `${factsText} \n`, "utf8");
    assert.throws(
      () => execFileSync(
        process.execPath,
        [
          "scripts/m2-current/"
            + "run_m2_current_signal_input_diagnostics.mjs",
          "--bundle-file",
          bundleFile,
          "--case-file",
          caseFile
        ],
        { encoding: "utf8", windowsHide: true, stdio: "pipe" }
      ),
      /facts_hash_mismatch/u
    );

    const malformedFacts = "{\"private\":\"DO-NOT-LEAK\",\n";
    writeFileSync(factFile, malformedFacts, "utf8");
    writeFileSync(bundleFile, JSON.stringify({
      ...bundleFixture,
      facts: undefined,
      snapshots: undefined,
      factFile: "facts.ndjson",
      factFileSha256: digest(malformedFacts),
      factRowCount: 1,
      snapshotFile: "snapshots.ndjson",
      snapshotFileSha256: digest(snapshotsText),
      snapshotRowCount: bundleFixture.snapshots.length
    }), "utf8");
    const malformedResult = spawnSync(
      process.execPath,
      [
        "scripts/m2-current/"
          + "run_m2_current_signal_input_diagnostics.mjs",
        "--bundle-file",
        bundleFile,
        "--case-file",
        caseFile
      ],
      { encoding: "utf8", windowsHide: true }
    );
    assert.notEqual(malformedResult.status, 0);
    assert.match(
      malformedResult.stderr,
      /m2_current_signal_input_ndjson_invalid_line_1/u
    );
    assert.doesNotMatch(malformedResult.stderr, /DO-NOT-LEAK/u);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function encodeNdjson(rows) {
  return `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
}

function parseNdjson(text) {
  return String(text)
    .split(/\r?\n/u)
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}
