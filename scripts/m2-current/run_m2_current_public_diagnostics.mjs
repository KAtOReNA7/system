#!/usr/bin/env node
import { readFileSync } from "node:fs";

import { loadM2CurrentPublicEvidence } from "../../src/domain/m2Current/loader.js";
import {
  buildM2CurrentPublicDiagnosticReport
} from "../../src/domain/m2Current/report.js";

const config = readJson("config/m2-current.v0.1.json");
const sources = Object.fromEntries(
  Object.entries(config.publicSources)
    .map(([role, file]) => [role, readJson(file)])
);
const report = buildM2CurrentPublicDiagnosticReport(
  loadM2CurrentPublicEvidence(sources)
);
const output = `${JSON.stringify(report, null, 2)}\n`;

if (process.argv.includes("--verify")) {
  if (readFileSync(config.publicOutput, "utf8") !== output) {
    throw new Error("m2_current_public_diagnostic_output_drift");
  }
  process.stdout.write("M2 current public diagnostic output verified.\n");
} else {
  process.stdout.write(output);
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}
