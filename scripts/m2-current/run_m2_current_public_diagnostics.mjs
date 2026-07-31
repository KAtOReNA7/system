#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

import { loadM2CurrentPublicEvidence } from "../../src/domain/m2Current/loader.js";
import {
  buildM2CurrentPublicDiagnosticReport
} from "../../src/domain/m2Current/report.js";
import {
  validateM2BusinessAcceptanceContract
} from "../../src/domain/m2Current/businessAcceptanceContract.js";
import {
  loadM2CurrentConfigSync
} from "./load_m2_current_config.mjs";

const config = loadM2CurrentConfigSync(
  process.cwd(),
  "config/m2-current.v0.6.json"
);
validateM2BusinessAcceptanceContract(readJson(
  "config/m2-business-acceptance-contract.v1.json"
));
const sources = Object.fromEntries(
  Object.entries(config.publicSources)
    .map(([role, file]) => [role, readJson(file)])
);
const report = buildM2CurrentPublicDiagnosticReport(
  loadM2CurrentPublicEvidence(sources, config),
  sources.candidate,
  config
);
const output = `${JSON.stringify(report, null, 2)}\n`;

if (process.argv.includes("--verify")) {
  const trackedOutput = readFileSync(config.publicOutput, "utf8")
    .replaceAll("\r\n", "\n");
  if (trackedOutput !== output) {
    throw new Error("m2_current_public_diagnostic_output_drift");
  }
  process.stdout.write("M2 current public diagnostic output verified.\n");
} else {
  writeFileSync(config.publicOutput, output, "utf8");
  process.stdout.write(
    `M2 current public diagnostic written: ${config.publicOutput}\n`
  );
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}
