#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  validateM2CoreLegacyHorizonAmountConfig
} from "../../src/domain/m2Current/coreLegacyHorizonAmount.js";
import {
  loadOrRecoverHpsrImmutableFrozenParameters
} from "./hpsr_frozen_parameter_authority_private.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);

export async function materializeHpsrImmutableFrozenParameters({
  root = ROOT
} = {}) {
  const [hpsr01Config, coreAmountConfig, boundProof] = await Promise.all([
    readJson(path.join(
      root,
      "config/m2-current-head-protected-segmented-router.v0.1.json"
    )),
    readJson(path.join(
      root,
      "config/m2-current-core-legacy-horizon-amount.v0.1.json"
    )),
    readJson(path.join(
      root,
      "docs/analysis/m2-current/"
        + "M2-head-protected-segmented-router-"
        + "residual-bound-provenance-v0.1.json"
    ))
  ]);
  validateM2CoreLegacyHorizonAmountConfig(coreAmountConfig);
  const result = await loadOrRecoverHpsrImmutableFrozenParameters({
    root,
    hpsr01Config,
    coreAmountConfig,
    boundProof
  });
  return Object.freeze({
    schema:
      "m2.current.hpsr.immutable_frozen_parameter_"
        + "materialization_stdout.v0.2",
    status: result.parameterAuthorityStatus,
    artifactClass: "IMMUTABLE_FROZEN_MODEL_PARAMETER",
    parameterLoadMode: result.parameterLoadMode,
    parameterLineageStatus: result.parameterLineageStatus,
    historicalReceiptStatus: result.historicalReceiptStatus,
    channelLineageDriftStatus: result.channelLineageDriftStatus,
    inputRowCount: result.inputRowCount,
    finiteSupportRowCount: result.finiteSupportRowCount,
    parameterCount: 3,
    parameterValuesPublished: false,
    currentBillSourceUsedForParameterDerivation: false,
    laterOriginOutcomeUsed: false,
    prospectiveFinalHoldoutOutcomeUsed: false,
    scientificEvaluationExecuted: false
  });
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function main() {
  if (
    !process.argv.includes("--private-rebuild")
    && !process.argv.includes("--parameter-authority")
  ) {
    throw new Error("hpsr_immutable_parameter_private_mode_required");
  }
  const result = await materializeHpsrImmutableFrozenParameters();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (
  process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    process.stderr.write(
      `[M2_HPSR_PARAMETER_AUTHORITY_ERROR] ${error.message}\n`
    );
    process.exitCode = 1;
  });
}
