import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createM2PublishingScalePreparationDirectory,
} from "../scripts/m2-current/prepare_m2_publishing_scale_channel.mjs";
import {
  writePublishingScalePrivateRows,
} from "../scripts/m2-current/channel_generative_mode.mjs";
import {
  authorizeAttempt,
  readPreviousReceipts,
  recoverInterruptedPreviousReceipt,
} from "../scripts/m2-current/publishing_scale_channel_execution.mjs";

test("empty publishing-scale derived root creates a versioned run directory", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "m2-psc-prepare-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = await createM2PublishingScalePreparationDirectory({
    root,
    preparationDirectory:
      "data/private-output/m2-current-publishing-scale-channel/prepared/v0.1/runs",
    runId: "portable-run-01",
  });
  assert.equal((await stat(directory)).isDirectory(), true);
  assert.equal(
    path.relative(root, directory).replaceAll("\\", "/"),
    "data/private-output/m2-current-publishing-scale-channel/"
      + "prepared/v0.1/runs/portable-run-01",
  );
});

test("publishing-scale preparation directory is non-overwriting and root confined", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "m2-psc-prepare-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const options = {
    root,
    preparationDirectory:
      "data/private-output/m2-current-publishing-scale-channel/prepared/v0.1/runs",
    runId: "portable-run-02",
  };
  await createM2PublishingScalePreparationDirectory(options);
  await assert.rejects(
    createM2PublishingScalePreparationDirectory(options),
    /EEXIST/u,
  );
  await assert.rejects(
    createM2PublishingScalePreparationDirectory({
      root,
      preparationDirectory: "../../outside",
      runId: "portable-run-03",
    }),
    /escapes_root/u,
  );
});

test("fatal process termination is preserved as an invalid infrastructure attempt", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "m2-psc-attempt-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const receiptFile = "run-receipt-attempt-1.json";
  const authorizationFile = "authorization-attempt-1.json";
  const receipt = {
    status: "RESTATEMENT_BINDING_PREFLIGHT_PASSED_BEFORE_CANDIDATE_FIT",
    attemptNumber: 1,
    runtimeAuthorizationFile: authorizationFile,
    candidateFitStarted: false,
    predictionRowsProduced: 0,
    evaluationRowsProduced: 0,
    evaluationComplete: false,
  };
  await Promise.all([
    writeFile(
      path.join(directory, receiptFile),
      JSON.stringify(receipt),
      "utf8",
    ),
    writeFile(
      path.join(directory, authorizationFile),
      JSON.stringify({ status: "ACTIVE_FOR_ONE_LOGICAL_EXECUTION_WINDOW" }),
      "utf8",
    ),
  ]);
  const policy = {
    executionWindow: {
      invalidAttemptReceiptRequired: true,
      infrastructureRetryAllowedBeforeValidEvaluation: true,
    },
  };
  const recovered = await recoverInterruptedPreviousReceipt({
    directory,
    previousReceipts: [{ file: receiptFile, value: receipt }],
    policy,
  });
  assert.equal(
    recovered[0].value.status,
    "FAILED_CLOSED_BEFORE_CANDIDATE_FIT_STARTED",
  );
  assert.equal(
    recovered[0].value.infrastructureFailureClass,
    "process_termination",
  );
  assert.equal(recovered[0].value.infrastructureRecoveryEligible, true);
  assert.equal(authorizeAttempt(recovered, policy), 2);
  const authorization = JSON.parse(await readFile(
    path.join(directory, authorizationFile),
    "utf8",
  ));
  assert.equal(authorization.status, "CLOSED_FAILED");
});

test("a closed pre-evaluation pairing failure is retryable without rewriting its receipt", () => {
  const previous = {
    status: "FAILED_CLOSED_AFTER_CANDIDATE_FIT_STARTED",
    attemptNumber: 2,
    failureCode: "m2_channel_generative_G0_paired_channel_missing",
    infrastructureFailureClass: null,
    infrastructureRecoveryEligible: false,
    interpretableRawCandidateEvaluationProduced: false,
    evaluationComplete: false
  };
  const policy = {
    executionWindow: {
      infrastructureRetryAllowedBeforeValidEvaluation: true,
      allowedRetryFailureClasses: ["deterministic_implementation"]
    }
  };
  assert.equal(
    authorizeAttempt([{ file: "attempt-2.json", value: previous }], policy),
    3
  );
  assert.equal(previous.infrastructureFailureClass, null);
  assert.equal(previous.infrastructureRecoveryEligible, false);
});

test("private run receipts are ordered by attempt number rather than filename", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "m2-psc-order-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await Promise.all([
    writeFile(
      path.join(directory, "receipt-z-attempt-1.json"),
      JSON.stringify({ attemptNumber: 1 }),
      "utf8"
    ),
    writeFile(
      path.join(directory, "receipt-a-attempt-2.json"),
      JSON.stringify({ attemptNumber: 2 }),
      "utf8"
    )
  ]);
  const receipts = await readPreviousReceipts(directory, "receipt");
  assert.deepEqual(
    receipts.map(({ value }) => value.attemptNumber),
    [1, 2]
  );
  assert.equal(receipts.at(-1).file, "receipt-a-attempt-2.json");
});

test("private evaluation rows stream to NDJSON with an incremental digest", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "m2-psc-stream-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const outputPath = path.join(directory, "evaluation.ndjson");
  const row = {
    standardWorkId: "W1",
    channelUid: "C1",
    mechanism: "membership",
    origin: "2022-12",
    futureMonthIndex: 1,
    futureMonth: "2023-01",
    includedHorizons: [3],
    labelAvailableAsOf: "2023-01",
    observedAtOrigin: true,
    actualPositive: 10,
    actualReversal: 0,
    actual: 10,
    postingTimeActualPositive: 10,
    postingTimeActualReversal: 0,
    postingTimeActual: 10
  };
  const prediction = {
    positivePoint: 9,
    occurrenceProbability: 0.5,
    conditionalPositiveAmount: 18,
    selectedNodeId: "membership",
    supportTier: "SHRUNK_FIT",
    hierarchyPath: ["globalPooledParent", "membership"],
    layerPredictions: {},
    fallbackReason: null,
    taxonomyFeatureUsed: false,
    authorizationBackfillUsed: false
  };
  const key = "W1\u001fC1\u001f2022-12\u001f1";
  const artifact = await writePublishingScalePrivateRows(
    outputPath,
    { rows: [row], predictions: new Map([[key, prediction]]) },
    { rows: [], predictions: new Map() }
  );
  const text = await readFile(outputPath, "utf8");
  assert.equal(artifact.rowCount, 1);
  assert.equal(
    artifact.sha256,
    createHash("sha256").update(text, "utf8").digest("hex")
  );
  assert.equal(text.endsWith("\n"), true);
  assert.equal(JSON.parse(text).standardWorkId, "W1");
  assert.equal(artifact.serialization, "STREAMED_NDJSON_INCREMENTAL_SHA256");
});
