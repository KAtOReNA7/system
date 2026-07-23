import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { restoreVerifiedPrivateStateMigration } from "../../src/domain/m2V2EvidencePilot/privateStateMigration.js";

try {
  const options = parseArguments(process.argv.slice(2));
  const extractRoot = resolve(options.extractRoot);
  const manifest = JSON.parse(readFileSync(resolve(extractRoot, "metadata/migration-manifest.private.json"), "utf8"));
  const result = restoreVerifiedPrivateStateMigration({
    extractRoot,
    targetRepoRoot: resolve(options.targetRepoRoot),
    manifest,
    force: options.force,
    faultAt: options.faultAt,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  const code = String(error?.message ?? "migration_restore_failed").replace(/[^A-Za-z0-9_.:-]/gu, "_").slice(0, 200);
  process.stderr.write(`${JSON.stringify({ status: "failed", code, providerRequestDelta: 0 })}\n`);
  process.exitCode = 1;
}

function parseArguments(args) {
  const options = { extractRoot: null, targetRepoRoot: null, force: false, faultAt: null };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--force") options.force = true;
    else if (["--extract-root", "--target-repo-root", "--fault-at"].includes(argument)) {
      const value = args[index + 1];
      if (!value) throw new Error("migration_cli_argument_missing");
      index += 1;
      if (argument === "--extract-root") options.extractRoot = value;
      else if (argument === "--target-repo-root") options.targetRepoRoot = value;
      else options.faultAt = value;
    } else throw new Error("migration_cli_argument_invalid");
  }
  if (!options.extractRoot || !options.targetRepoRoot) throw new Error("migration_cli_required_argument_missing");
  return options;
}
