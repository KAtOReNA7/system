import { createReadStream } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  fitM2CoreHorizonAmountModel,
  predictM2CoreHorizonAmount
} from "../../src/domain/m2Current/coreLegacyHorizonAmount.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const privateDirectory = path.join(
  root,
  "data/private-output/m2-core80-cross-model-real-business-evaluation-v0.1"
);
const inputPath = path.join(
  privateDirectory,
  "M2-CMX01-cham01-input-private-v0.1.ndjson"
);
const predictionPath = path.join(
  privateDirectory,
  "M2-CMX01-cham01-predictions-private-v0.1.ndjson"
);
const manifestPath = path.join(
  privateDirectory,
  "M2-CMX01-cham01-model-manifest-private-v0.1.json"
);
const receiptPath = path.join(
  privateDirectory,
  "M2-CMX01-cham01-numpy-parity-receipt-private-v0.1.json"
);
const [config, schedule, manifest] = await Promise.all([
  readJson(path.join(
    root,
    "config/m2-current-core-legacy-horizon-amount.v0.1.json"
  )),
  readJson(path.join(root, "config/m2-current-oa03-replication.v0.1.json")),
  readJson(manifestPath)
]);
if (manifest.status !== "COMPLETE") {
  throw new Error("m2_cmx01_cham_parity_manifest_incomplete");
}
const sample = manifest.selections.find((row) => (
  row.armId === "B1"
  && row.horizonMonths === 3
  && row.status === "EVALUATED_ORIGIN_SAFE"
));
if (!sample) throw new Error("m2_cmx01_cham_parity_sample_missing");
const trainingOriginSet = new Set([
  ...schedule.rollingEvaluation.schedules.PRIMARY_ROLLING
    .trainingAndEvaluationOrigins,
  ...schedule.rollingEvaluation.schedules.STRICT_ROLLING
    .trainingAndEvaluationOrigins
]);
const training = [];
const validation = [];
await forEachNdjson(inputPath, (row) => {
  if (row.horizonMonths !== sample.horizonMonths) return;
  if (row.origin === sample.outerOrigin) validation.push(row);
  if (
    trainingOriginSet.has(row.origin)
    && row.origin < sample.outerOrigin
    && row.labelAvailableAsOf <= sample.outerOrigin
  ) {
    training.push(row);
  }
});
if (
  training.length !== sample.trainingRowCount
  || validation.length !== sample.validationRowCount
) {
  throw new Error("m2_cmx01_cham_parity_case_count_mismatch");
}
const state = fitM2CoreHorizonAmountModel(training, {
  armId: sample.armId,
  huberDelta: sample.selectedHuberDelta,
  l2: sample.selectedL2,
  config
});
const javascript = new Map(validation.map((row) => {
  const prediction = predictM2CoreHorizonAmount(row, state);
  return [caseKey(row), prediction.pointEstimate];
}));
const numpy = new Map();
await forEachNdjson(predictionPath, (row) => {
  if (
    row.modelVariantId === `M2-WORK-CHAM01/${sample.armId}`
    && row.horizonMonths === sample.horizonMonths
    && row.origin === sample.outerOrigin
  ) {
    numpy.set(caseKey(row), Number(row.pointEstimate));
  }
});
if (javascript.size !== numpy.size || javascript.size !== validation.length) {
  throw new Error("m2_cmx01_cham_parity_prediction_count_mismatch");
}
let maximumAbsoluteDifference = 0;
let maximumRelativeDifference = 0;
for (const [key, expected] of javascript) {
  const actual = numpy.get(key);
  if (!Number.isFinite(actual)) {
    throw new Error("m2_cmx01_cham_parity_prediction_missing");
  }
  const absolute = Math.abs(expected - actual);
  const relative = absolute / Math.max(1, Math.abs(expected));
  maximumAbsoluteDifference = Math.max(maximumAbsoluteDifference, absolute);
  maximumRelativeDifference = Math.max(maximumRelativeDifference, relative);
}
const relativeTolerance = 1e-7;
const status = maximumRelativeDifference <= relativeTolerance
  ? "NUMPY_EQUIVALENT_TO_JAVASCRIPT_FORMULA_AUTHORITY"
  : "NUMPY_JAVASCRIPT_PARITY_FAILED";
const receipt = {
  schema: "m2.cmx01.cham01_numpy_parity_receipt.private.v0.1",
  status,
  tracked: false,
  formulaAuthority:
    "src/domain/m2Current/coreLegacyHorizonAmount.js",
  sample: {
    armId: sample.armId,
    horizonMonths: sample.horizonMonths,
    outerOrigin: sample.outerOrigin,
    trainingRowCount: training.length,
    validationRowCount: validation.length,
    maximumTrainingLabelAvailableAsOf:
      state.maximumTrainingLabelAvailableAsOf
  },
  maximumAbsoluteDifference,
  maximumRelativeDifference,
  relativeTolerance,
  privateIdentityPublished: false,
  finalHoldoutOpened: false,
  productionChanged: false
};
await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
if (status !== "NUMPY_EQUIVALENT_TO_JAVASCRIPT_FORMULA_AUTHORITY") {
  throw new Error("m2_cmx01_cham_numpy_javascript_parity_failed");
}
process.stdout.write(`${JSON.stringify({
  status,
  trainingRowCount: training.length,
  validationRowCount: validation.length,
  withinTolerance: true
})}\n`);


function caseKey(row) {
  return [row.standardWorkId, row.origin, row.horizonMonths].join("\u001f");
}


async function forEachNdjson(file, callback) {
  const lines = createInterface({
    input: createReadStream(file, { encoding: "utf8" }),
    crlfDelay: Infinity
  });
  for await (const line of lines) {
    if (line.trim()) callback(JSON.parse(line));
  }
}


async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}
