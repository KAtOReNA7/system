import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

import { promoteOfflineRecoveryGroup } from "../../src/domain/m2V2EvidencePilot/privateStateRecovery.js";

try {
  const options = parseArguments(process.argv.slice(2));
  const adapterPath = resolve(options.root, options.adapter);
  const adapter = await import(pathToFileURL(adapterPath).href);
  if (typeof adapter.buildOfflineRecoveryInput !== "function") throw new Error("recovery_adapter_invalid");
  const input = await adapter.buildOfflineRecoveryInput({ root: options.root });
  const result = promoteOfflineRecoveryGroup({
    ...input,
    root: options.root,
    faultAt: options.faultAt,
    roleRegistry: adapter.roleRegistry ?? input.roleRegistry,
    evaluateGates: adapter.evaluateRecoveryGates,
    validateCandidate: adapter.validateRecoveryCandidate,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  const code = String(error?.message ?? "private_state_recovery_failed").replace(/[^A-Za-z0-9_.:-]/gu, "_").slice(0, 200);
  process.stderr.write(`${JSON.stringify({ status: "failed", code, providerRequestDelta: 0 })}\n`);
  process.exitCode = 1;
}

function parseArguments(args) {
  const options = { root: process.cwd(), adapter: null, faultAt: null };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (["--root", "--adapter", "--fault-at"].includes(argument)) {
      const value = args[index + 1];
      if (!value) throw new Error("recovery_cli_argument_missing");
      index += 1;
      if (argument === "--root") options.root = resolve(value);
      else if (argument === "--adapter") options.adapter = value;
      else options.faultAt = value;
    } else throw new Error("recovery_cli_argument_invalid");
  }
  if (!options.adapter) throw new Error("recovery_cli_adapter_required");
  return options;
}
