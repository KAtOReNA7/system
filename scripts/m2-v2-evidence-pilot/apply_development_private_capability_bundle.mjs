#!/usr/bin/env node
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

import {
  PRIVATE_CAPABILITY_MANIFEST_PATH,
  restoreM2Pr7S1CapabilityBundle,
} from "../../src/domain/m2V2EvidencePilot/privateCapabilityBundle.js";

try {
  const options = parseArguments(process.argv.slice(2));
  const extractRoot = path.resolve(options.extractRoot);
  const manifestPath = path.resolve(extractRoot, PRIVATE_CAPABILITY_MANIFEST_PATH);
  const manifestStat = statSync(manifestPath);
  if (!manifestStat.isFile() || manifestStat.size > 1024 * 1024) {
    throw new Error("private_capability_manifest_file_invalid");
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const result = restoreM2Pr7S1CapabilityBundle({
    extractRoot,
    targetRepoRoot: path.resolve(options.targetRepoRoot),
    manifest,
    force: options.force,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  const code = String(error?.message ?? "private_capability_restore_failed")
    .replace(/[^A-Za-z0-9_.:-]/gu, "_")
    .slice(0, 200);
  process.stderr.write(`${JSON.stringify({
    status: "failed",
    code,
    providerRequestDelta: 0,
    databaseConnections: 0,
  })}\n`);
  process.exitCode = 1;
}

function parseArguments(args) {
  const options = { extractRoot: null, targetRepoRoot: null, force: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--force") {
      options.force = true;
      continue;
    }
    if (!["--extract-root", "--target-repo-root"].includes(argument)) {
      throw new Error("private_capability_cli_argument_invalid");
    }
    const value = args[index + 1];
    if (!value) throw new Error("private_capability_cli_argument_missing");
    index += 1;
    if (argument === "--extract-root") options.extractRoot = value;
    else options.targetRepoRoot = value;
  }
  if (!options.extractRoot || !options.targetRepoRoot) {
    throw new Error("private_capability_cli_required_argument_missing");
  }
  return options;
}
