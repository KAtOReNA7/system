#!/usr/bin/env node
import { resolve } from "node:path";

import {
  preparePr7P1OfflineRemediation,
  runPr7P1OfflineRemediation,
} from "../../src/domain/m2V2EvidencePilot/pr7P1OfflineRemediation.js";

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  process.stdout.write([
    "Usage: node scripts/m2-v2-evidence-pilot/run_m2_v2_pr7_p1_offline_remediation.mjs [--root PATH] [--promote]",
    "",
    "Default mode is read-only input verification. --promote performs the",
    "group-atomic private promotion and current closed-binding swap.",
    "No provider, Canary, full160, or training operation is available here.",
    "",
  ].join("\n"));
  process.exit(0);
}

const root = resolve(args.root ?? process.cwd());
try {
  const result = args.promote
    ? runPr7P1OfflineRemediation(root)
    : preparePr7P1OfflineRemediation(root).summary;
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({
    status: "FAILED_CLOSED",
    issue: safeIssue(error),
    providerRequestDelta: 0,
    canaryExecutedDuringRecovery: false,
    full160Authorized: false,
  })}\n`);
  process.exitCode = 1;
}

function parseArgs(values) {
  const result = { promote: false, help: false, root: null };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--promote") result.promote = true;
    else if (value === "--help" || value === "-h") result.help = true;
    else if (value === "--root") {
      const root = values[index + 1];
      if (!root || root.startsWith("--")) throw new Error("root_argument_missing");
      result.root = root;
      index += 1;
    } else throw new Error("unsupported_argument");
  }
  return result;
}

function safeIssue(error) {
  return String(error?.message ?? "offline_remediation_failed")
    .replace(/https?:\/\/\S+/giu, "url")
    .replace(/(?:sk|tvly)-[A-Za-z0-9_-]+/gu, "secret")
    .replace(/[^A-Za-z0-9_.:+-]/gu, "_")
    .slice(0, 240);
}

