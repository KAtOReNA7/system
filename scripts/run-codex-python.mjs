import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCompatiblePython } from "./resolve-compatible-python.mjs";

const localAnalysisDependencyCandidates = [
  join(process.cwd(), ".analysis-python314"),
  join(process.cwd(), ".analysis-python")
];
const localAnalysisDependencies = localAnalysisDependencyCandidates.find((path) => existsSync(path));

export function resolveRunnerPython(options = {}) {
  return resolveCompatiblePython(options);
}

export function runPythonCommand(args, {
  resolution = resolveRunnerPython(),
  spawnSyncImpl = spawnSync,
  env = process.env,
  stdio = "inherit",
} = {}) {
  if (!resolution.compatible) {
    return {
      status: 1,
      error: new Error(resolution.error ?? "compatible Python unavailable"),
      resolution,
    };
  }
  const result = spawnSyncImpl(
    resolution.executable,
    [...(resolution.argsPrefix ?? []), ...args],
    {
      stdio,
      shell: false,
      windowsHide: true,
      env: {
        ...env,
        PYTHONHASHSEED: env.PYTHONHASHSEED || "0",
        PYTHONPATH: localAnalysisDependencies
          ? [localAnalysisDependencies, env.PYTHONPATH].filter(Boolean).join(delimiter)
          : env.PYTHONPATH,
      },
    },
  );
  return { ...result, resolution };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--print-python-resolution") {
    const resolution = resolveRunnerPython();
    process.stdout.write(`${JSON.stringify(resolution, null, 2)}\n`);
    process.exitCode = resolution.compatible ? 0 : 1;
    return;
  }
  if (args.length === 0) {
    console.error("Usage: node scripts/run-codex-python.mjs <script.py> [args...]");
    process.exitCode = 2;
    return;
  }
  const result = runPythonCommand(args);
  if (result.error) {
    console.error(result.error.message);
    process.exitCode = 1;
    return;
  }
  process.exitCode = result.status ?? 1;
}

const SCRIPT_PATH = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
  main();
}
