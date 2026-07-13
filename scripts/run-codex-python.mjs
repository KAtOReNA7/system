import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

const bundledPython = join(
  homedir(),
  ".cache",
  "codex-runtimes",
  "codex-primary-runtime",
  "dependencies",
  "python",
  "python.exe"
);

const python = existsSync(bundledPython) ? bundledPython : "python";
const localAnalysisDependencyCandidates = [
  join(process.cwd(), ".analysis-python314"),
  join(process.cwd(), ".analysis-python")
];
const localAnalysisDependencies = localAnalysisDependencyCandidates.find((path) => existsSync(path));
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error("Usage: node scripts/run-codex-python.mjs <script.py> [args...]");
  process.exit(2);
}

const result = spawnSync(python, args, {
  stdio: "inherit",
  shell: false,
  env: {
    ...process.env,
    PYTHONHASHSEED: process.env.PYTHONHASHSEED || "0",
    PYTHONPATH: localAnalysisDependencies
      ? [localAnalysisDependencies, process.env.PYTHONPATH].filter(Boolean).join(delimiter)
      : process.env.PYTHONPATH
  }
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
