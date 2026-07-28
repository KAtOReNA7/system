import { createWriteStream } from "node:fs";
import {
  mkdir,
  readFile,
} from "node:fs/promises";
import path from "node:path";
import { once } from "node:events";

import {
  applyM2DevelopmentModelableRestatementToPackedRows,
} from "../../src/domain/m2Current/channelGenerative.js";
import {
  runPythonCommand,
} from "../run-codex-python.mjs";

const ROOT = process.cwd();
const PRIVATE_ROOT = path.join(
  ROOT,
  "data",
  "private-output",
  "m2-publishing-scale-study",
);
const RESTATED_PACKED_PATH = path.join(
  PRIVATE_ROOT,
  "M2-publishing-scale-strict-restated-packed-private-v1.ndjson",
);
const PYTHON_SCRIPT = path.join(
  ROOT,
  "scripts",
  "m2-current",
  "study_publishing_scale_support.py",
);
const STRICT_PACKED_PATH = path.join(
  ROOT,
  "data",
  "private-output",
  "m2-current-human-anchored",
  "M2-current-channel-generative-auxiliary-monthly-private-v0.2.ndjson",
);
const RESTATEMENT_ROOT = path.join(
  ROOT,
  "data",
  "private-output",
  "m2-evaluation-v2-2-reversal-rescore",
);
const RECONCILIATION_PATH = path.join(
  RESTATEMENT_ROOT,
  "M2-reversal-scope-reconciliation-private-v1.json",
);
const ALLOCATION_PATH = path.join(
  RESTATEMENT_ROOT,
  "M2-reversal-allocation-ledger-private-v1.ndjson",
);
const K7A_PATH = path.join(
  ROOT,
  "docs",
  "analysis",
  "m2-current",
  "M2-publishing-scale-population-and-authority-audit-v1.json",
);

function parseNdjson(text) {
  return text
    .split(/\r?\n/u)
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
}

async function writeNdjson(filePath, rows) {
  const stream = createWriteStream(filePath, {
    encoding: "utf8",
    flags: "w",
  });
  for (const row of rows) {
    if (!stream.write(`${JSON.stringify(row)}\n`)) {
      await once(stream, "drain");
    }
  }
  stream.end();
  await once(stream, "finish");
}

async function main() {
  const [
    k7aText,
    strictText,
    reconciliationText,
    allocationText,
  ] = await Promise.all([
    readFile(K7A_PATH, "utf8"),
    readFile(STRICT_PACKED_PATH, "utf8"),
    readFile(RECONCILIATION_PATH, "utf8"),
    readFile(ALLOCATION_PATH, "utf8"),
  ]);
  const k7a = JSON.parse(k7aText);
  if (
    k7a.status !== "K7A_COMPLETE_NO_MODEL_EXECUTION"
    || k7a.scope.newCandidateOuterOutcomeRead !== false
    || k7a.scope.modelTrainedOrSelected !== false
  ) {
    throw new Error("m2_publishing_scale_K7A_gate_not_satisfied");
  }
  const restatement =
    applyM2DevelopmentModelableRestatementToPackedRows(
      parseNdjson(strictText),
      JSON.parse(reconciliationText),
      parseNdjson(allocationText),
    );
  await mkdir(PRIVATE_ROOT, { recursive: true });
  await writeNdjson(RESTATED_PACKED_PATH, restatement.rows);

  const result = runPythonCommand([
    PYTHON_SCRIPT,
    "--input",
    RESTATED_PACKED_PATH,
    "--output-directory",
    PRIVATE_ROOT,
  ]);
  if (result.error || result.status !== 0) {
    throw result.error
      ?? new Error("m2_publishing_scale_learning_study_failed");
  }
  process.stdout.write(`${JSON.stringify({
    status: "K7B_TRAINING_SIDE_LEARNING_STUDY_COMPLETE",
    restatementBindingPassed: true,
    restatementAudit: restatement.audit,
    newCandidateOuterOutcomeRead: false,
    privateOutputWritten: true,
  })}\n`);
}

main().catch((error) => {
  console.error(String(error?.message ?? error));
  process.exitCode = 1;
});
