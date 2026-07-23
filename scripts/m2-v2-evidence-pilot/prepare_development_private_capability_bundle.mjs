#!/usr/bin/env node
import path from "node:path";

import {
  M2_PR7_S1_CAPABILITY_ID,
  createM2Pr7S1CapabilityBundleStage,
} from "../../src/domain/m2V2EvidencePilot/privateCapabilityBundle.js";

try {
  const options = parseArguments(process.argv.slice(2));
  if (options.capabilityId !== M2_PR7_S1_CAPABILITY_ID) {
    throw new Error("private_capability_id_not_supported");
  }
  const result = createM2Pr7S1CapabilityBundleStage({
    repoRoot: path.resolve(options.repoRoot),
    stagingRoot: path.resolve(options.stagingRoot),
    sourceCommit: options.sourceCommit,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  const code = String(error?.message ?? "private_capability_prepare_failed")
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
  const options = {
    capabilityId: null,
    repoRoot: null,
    stagingRoot: null,
    sourceCommit: null,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (![
      "--capability-id",
      "--repo-root",
      "--staging-root",
      "--source-commit",
    ].includes(argument)) {
      throw new Error("private_capability_cli_argument_invalid");
    }
    const value = args[index + 1];
    if (!value) throw new Error("private_capability_cli_argument_missing");
    index += 1;
    if (argument === "--capability-id") options.capabilityId = value;
    else if (argument === "--repo-root") options.repoRoot = value;
    else if (argument === "--staging-root") options.stagingRoot = value;
    else options.sourceCommit = value;
  }
  if (Object.values(options).some((value) => !value)) {
    throw new Error("private_capability_cli_required_argument_missing");
  }
  return options;
}
