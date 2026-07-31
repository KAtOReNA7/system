#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertHpsrControlledExecutionGate
} from "../../src/domain/m2Current/headProtectedSegmentedRouter.js";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);
const CONTRACT_PATH = path.join(
  ROOT,
  "config",
  "m2-current-head-protected-segmented-router.v0.1.json"
);

function main() {
  const contract = readJson(CONTRACT_PATH);
  const availability = readJson(path.join(
    ROOT,
    contract.publicOutputs.availabilityJson
  ));
  assertHpsrControlledExecutionGate({
    contract,
    availability,
    authorization: null
  });
  throw new Error(
    "hpsr_k2_adapter_requires_separate_future_authorization"
  );
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

if (
  process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `[M2_HPSR_CONTROLLED_EXECUTE_DENIED] ${error.message}\n`
    );
    process.exitCode = 1;
  }
}
