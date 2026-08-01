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

async function main() {
  const contract = readJson(CONTRACT_PATH);
  if (process.argv.includes("--source-authority-reconciliation")) {
    const {
      reconcileHpsr02SourceAuthorityPrivate
    } = await import("./head_protected_segmented_router_private.mjs");
    const result = await reconcileHpsr02SourceAuthorityPrivate({
      root: ROOT
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  if (process.argv.includes("--hpsr02-independent")) {
    const {
      runHpsr02IndependentPrivate
    } = await import("./head_protected_segmented_router_private.mjs");
    const result = await runHpsr02IndependentPrivate({ root: ROOT });
    process.stdout.write(`${JSON.stringify({
      status: result.status,
      origin: result.origin,
      caseCount: result.caseCount,
      completeIndependentResultProduced:
        result.completeIndependentResultProduced,
      resultFrozen: result.resultFrozen,
      secondIndependentOriginExecuted:
        result.secondIndependentOriginExecuted,
      prospectiveFinalHoldoutOpened:
        result.prospectiveFinalHoldoutOpened
    })}\n`);
    return;
  }
  const availability = readJson(path.join(
    ROOT,
    contract.publicOutputs.availabilityJson
  ));
  if (process.argv.includes("--retrospective")) {
    const {
      runHpsrRetrospectivePrivate
    } = await import("./head_protected_segmented_router_private.mjs");
    const result = await runHpsrRetrospectivePrivate({
      root: ROOT,
      contract,
      availability
    });
    process.stdout.write(`${JSON.stringify({
      status: result.status,
      origins: result.origins,
      retrospectiveReplayReady: result.retrospectiveReplayReady,
      independentK2Ready: result.independentK2Ready,
      independentK2Executed: result.independentK2Executed,
      prospectiveFinalHoldoutOpened:
        result.prospectiveFinalHoldoutOpened
    })}\n`);
    return;
  }
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
  main().catch((error) => {
    process.stderr.write(
      `[M2_HPSR_CONTROLLED_EXECUTE_DENIED] ${error.message}\n`
    );
    process.exitCode = 1;
  });
}
