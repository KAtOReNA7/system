import assert from "node:assert/strict";
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
  authorizeAttempt,
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
