import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  accumulateM2Psc03FrozenRow,
  createM2Psc03FrozenAuditAccumulator,
  finalizeM2Psc03FrozenAudit,
  protectM2Psc03AuditForPublic
} from "../src/domain/m2Current/publishingScaleDirectCashFrozenAudit.js";
import {
  scanFrozenRaw
} from "../scripts/m2-current/audit_publishing_scale_direct_cash_frozen.mjs";

const namedPlatforms = [{channelUid: "channel-a", platformId: "fanqie_audio"}];

test("PSC03 frozen audit aggregates without model execution", () => {
  const rows = fixtureRows();
  const accumulator = createM2Psc03FrozenAuditAccumulator({namedPlatforms});
  rows.forEach((row) => accumulateM2Psc03FrozenRow(accumulator, row));
  const result = finalizeM2Psc03FrozenAudit(accumulator);
  assert.equal(result.summary.rowCount, rows.length);
  assert.equal(result.summary.invariantStatus, "PASS");
  assert.equal(result.summary.workCaseCount, 4);
  assert.ok(Math.abs(
    result.metrics.family.primary.predictionActualCashRatio - 2 / 3
  ) < 1e-12);
  assert.equal(result.metrics.categories.length, 3);
});

test("PSC03 public audit projection never publishes absolute private cash", () => {
  const accumulator = createM2Psc03FrozenAuditAccumulator({namedPlatforms});
  fixtureRows().forEach((row) => accumulateM2Psc03FrozenRow(accumulator, row));
  const value = protectM2Psc03AuditForPublic(
    finalizeM2Psc03FrozenAudit(accumulator)
  );
  const text = JSON.stringify(value);
  assert.equal(text.includes("\"actualMass\":"), false);
  assert.equal(text.includes("\"predictionMass\":"), false);
  assert.equal(text.includes("\"absoluteError\":"), false);
  assert.equal(text.includes("absoluteCashQuantilesPublished\":false"), true);
});

test("PSC03 raw scanner hashes the same read-only byte stream it aggregates", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "m2-psc03-audit-"));
  const rawPath = path.join(directory, "frozen.ndjson");
  const text = fixtureRows().map((row) => JSON.stringify(row)).join("\n") + "\n";
  await writeFile(rawPath, text, "utf8");
  try {
    const accumulator = createM2Psc03FrozenAuditAccumulator({namedPlatforms});
    const scan = await scanFrozenRaw({
      filePath: rawPath,
      accumulator,
      progressEvery: 1000
    });
    assert.equal(scan.rowCount, fixtureRows().length);
    assert.equal(
      scan.sha256,
      createHash("sha256").update(await readFile(rawPath)).digest("hex")
    );
    assert.equal(finalizeM2Psc03FrozenAudit(accumulator).summary.invariantStatus, "PASS");
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

test("PSC03 frozen auditor is physically isolated from fit and prediction entrypoints", async () => {
  const files = [
    "src/domain/m2Current/publishingScaleDirectCashFrozenAudit.js",
    "scripts/m2-current/audit_publishing_scale_direct_cash_frozen.mjs"
  ];
  const source = (await Promise.all(files.map((file) => readFile(file, "utf8"))))
    .join("\n");
  for (const forbidden of [
    "fitM2Psc03",
    "crossFitM2Psc03",
    "selectM2Psc03Lambda",
    "predictM2Psc03Monthly",
    "runM2Psc03OrderedCampaign"
  ]) {
    assert.equal(source.includes(forbidden), false);
  }
  assert.match(source, /createReadStream\(filePath, \{flags: "r"\}\)/u);
});

test("PSC03 audit governance preserves history and invalidates only candidate interpretation", async () => {
  const [
    reportText,
    correctionText,
    registryText,
    stateIndex,
    rootRules,
    scopedRules
  ] = await Promise.all([
    readFile(
      "docs/analysis/m2-current/"
        + "M2-psc03-frozen-tail-and-contract-conformance-audit-v0.1.json",
      "utf8"
    ),
    readFile(
      "docs/analysis/m2-current/"
        + "M2-psc03-result-authority-correction-v0.1.json",
      "utf8"
    ),
    readFile("config/m2-model-registry.v1.json", "utf8"),
    readFile(
      "docs/analysis/m2-v2/M2-v2-current-state-index-v0.61.md",
      "utf8"
    ),
    readFile("AGENTS.md", "utf8"),
    readFile("src/domain/m2Current/AGENTS.md", "utf8")
  ]);
  const report = JSON.parse(reportText);
  const correction = JSON.parse(correctionText);
  const registry = JSON.parse(registryText);
  const model = registry.models.find(
    (row) => row.stableModelId === "M2-CHAN-PSC03"
  );
  const experiment = registry.experiments.find(
    (row) => (
      row.experimentId
      === "M2-EXP-PUBLISHING-SCALE-CHANNEL-DIRECT-CASH-03"
    )
  );

  assert.equal(
    report.decision.status,
    "PSC03_IMPLEMENTATION_CONTRACT_MISMATCH_CONFIRMED"
  );
  assert.equal(report.decision.validForCandidateDecision, false);
  assert.equal(report.contractConformance.items.length, 20);
  assert.deepEqual(report.contractConformance.statusCounts, [7, 11, 1, 1]);
  assert.equal(report.prohibitedActions.fitExecuted, false);
  assert.equal(report.prohibitedActions.predictionExecuted, false);
  assert.equal(report.prohibitedActions.rawModified, false);
  assert.doesNotMatch(reportText, /"actualMass"\s*:/u);
  assert.doesNotMatch(reportText, /"predictionMass"\s*:/u);
  assert.doesNotMatch(reportText, /data[\\/]private-(input|output)/iu);

  assert.equal(correction.historicalResult.status, "PSC03_DEVELOPMENT_NOT_SUPPORTED");
  assert.equal(correction.historicalResult.preserved, true);
  assert.equal(correction.authorityEffect.validForCandidateDecision, false);
  assert.equal(correction.authorityEffect.successorAuthorized, false);

  assert.equal(
    model.currentRole,
    "invalid_frozen_candidate_evidence_contract_mismatch"
  );
  assert.deepEqual(model.successorIds, []);
  assert.equal(model.evaluations[0].WAPE, 0.5426465402440889);
  assert.equal(
    model.evaluations[0].resultStatus,
    "PSC03_DEVELOPMENT_NOT_SUPPORTED"
  );
  assert.equal(model.evaluations[0].validForCandidateDecision, false);
  assert.equal(experiment.resultStatus, "PSC03_DEVELOPMENT_NOT_SUPPORTED");
  assert.equal(experiment.validForCandidateDecision, false);
  assert.equal(
    experiment.currentAuthorityStatus,
    "PSC03_IMPLEMENTATION_CONTRACT_MISMATCH_CONFIRMED"
  );
  assert.equal(
    registry.models.some((row) => row.stableModelId === "M2-CHAN-PSC04"),
    false
  );
  assert.equal(
    registry.currentRoles.latestStateIndex,
    "docs/analysis/m2-v2/M2-v2-current-state-index-v0.61.md"
  );
  for (const text of [stateIndex, rootRules, scopedRules]) {
    assert.match(text, /PSC03_IMPLEMENTATION_CONTRACT_MISMATCH_CONFIRMED/u);
    assert.match(text, /NO_SUCCESSOR_OR_REPLAY_AUTHORIZED|不得重跑|do not refit/u);
  }
});

function fixtureRows() {
  return [
    row({
      workId: "work-1",
      month: 1,
      horizons: [3, 6],
      actualPositive: 10,
      occurrence: 0.5,
      conditional: 10,
      observedAtOrigin: true
    }),
    row({
      workId: "work-1",
      month: 2,
      horizons: [3, 6],
      actualPositive: 0,
      occurrence: 0.5,
      conditional: 10,
      observedAtOrigin: true
    }),
    row({
      workId: "work-2",
      month: 1,
      horizons: [3, 6],
      actualPositive: 5,
      occurrence: 0,
      conditional: 0,
      observedAtOrigin: false
    })
  ];
}

function row({
  workId,
  month,
  horizons,
  actualPositive,
  occurrence,
  conditional,
  observedAtOrigin
}) {
  const point = occurrence * conditional;
  return {
    schema: "m2.current.psc03.monthly_raw_prediction.private.v0.1",
    tracked: false,
    evidenceClass: "DEVELOPMENT_REPLAY",
    modelId: "M2-CHAN-PSC03",
    candidateId: "M2-CHAN-PSC03-RAW",
    experimentArmId: "M2-EXP-PUBLISHING-SCALE-CHANNEL-DIRECT-CASH-03/P",
    arm: "P",
    evaluationFamily: "primary",
    actualDefinitionId: "M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01",
    standardWorkId: workId,
    channelUid: "channel-a",
    mechanism: "advertising",
    origin: "2025-09",
    futureMonthIndex: month,
    futureMonth: "2025-09",
    includedHorizons: horizons,
    observedAtOrigin,
    actualPositive,
    actualReversal: 0,
    actual: actualPositive,
    positivePoint: point,
    pointEstimate: point,
    occurrenceProbability: occurrence,
    occurrenceBinary64: binary64Hex(occurrence),
    conditionalPositiveAmount: conditional,
    selectedNodeId: observedAtOrigin ? "fanqie_audio" : "future_first_seen_abstention",
    supportTier: observedAtOrigin ? "SHRUNK_FIT" : "POOLED_PARENT",
    fallbackReason: observedAtOrigin
      ? null
      : "future_first_seen_identity_not_available_at_origin",
    layerConditionalPositiveAmount: {
      global: conditional,
      mechanism: conditional,
      namedPlatform: conditional
    },
    occurrenceApplicationCount: 1,
    horizonAggregationCount: 0,
    taxonomyFeatureUsed: false,
    lg01PredictionDependency: false,
    postHocCalibrationUsed: false
  };
}

function binary64Hex(value) {
  const buffer = Buffer.allocUnsafe(8);
  buffer.writeDoubleBE(value, 0);
  return buffer.toString("hex");
}
