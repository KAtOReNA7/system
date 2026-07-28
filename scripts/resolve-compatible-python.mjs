import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export const SUPPORTED_PYTHON_MINORS = Object.freeze([13, 12, 11]);

const VERSION_PROBE = [
  "import json, sys",
  "print(json.dumps({",
  '  "major": sys.version_info.major,',
  '  "minor": sys.version_info.minor,',
  '  "patch": sys.version_info.micro,',
  '  "executable": sys.executable',
  "}))",
].join("\n");

function isAbsoluteOnSupportedPlatform(value) {
  return path.posix.isAbsolute(value) || path.win32.isAbsolute(value);
}

function addCandidate(candidates, seen, candidate) {
  const key = JSON.stringify([candidate.executable, candidate.argsPrefix ?? []]);
  if (!seen.has(key)) {
    candidates.push({
      executable: candidate.executable,
      argsPrefix: [...(candidate.argsPrefix ?? [])],
      source: candidate.source,
    });
    seen.add(key);
  }
}

export function buildCompatiblePythonCandidates({
  env = process.env,
  platform = process.platform,
  repoRoot = process.cwd(),
  userHome = homedir(),
  pathExists = existsSync,
} = {}) {
  const candidates = [];
  const seen = new Set();
  const explicit = String(env.KATORENA7_PYTHON ?? "").trim();

  if (explicit) {
    if (!isAbsoluteOnSupportedPlatform(explicit) || explicit.includes("\0")) {
      throw new Error("KATORENA7_PYTHON_MUST_BE_A_SINGLE_ABSOLUTE_EXECUTABLE_PATH");
    }
    addCandidate(candidates, seen, {
      executable: explicit,
      source: "KATORENA7_PYTHON",
    });
  }

  const localVenvPython = platform === "win32"
    ? path.join(repoRoot, ".venv", "Scripts", "python.exe")
    : path.join(repoRoot, ".venv", "bin", "python");
  if (pathExists(localVenvPython)) {
    addCandidate(candidates, seen, {
      executable: localVenvPython,
      source: "project_venv",
    });
  }

  const bundledRoot = path.join(
    userHome,
    ".cache",
    "codex-runtimes",
    "codex-primary-runtime",
    "dependencies",
    "python",
  );
  const bundledCandidates = platform === "win32"
    ? [path.join(bundledRoot, "python.exe")]
    : [
      path.join(bundledRoot, "bin", "python3"),
      path.join(bundledRoot, "bin", "python"),
    ];
  for (const executable of bundledCandidates) {
    if (pathExists(executable)) {
      addCandidate(candidates, seen, {
        executable,
        source: "codex_bundled_runtime",
      });
    }
  }

  if (platform === "win32") {
    for (const minor of SUPPORTED_PYTHON_MINORS) {
      addCandidate(candidates, seen, {
        executable: "py",
        argsPrefix: [`-3.${minor}`],
        source: `windows_py_3_${minor}`,
      });
    }
  } else {
    for (const minor of SUPPORTED_PYTHON_MINORS) {
      addCandidate(candidates, seen, {
        executable: `python3.${minor}`,
        source: `posix_python_3_${minor}`,
      });
    }
  }

  for (const executable of ["python3", "python"]) {
    addCandidate(candidates, seen, {
      executable,
      source: `verified_${executable}`,
    });
  }

  return candidates;
}

export function probePythonCandidate(candidate, {
  spawnSyncImpl = spawnSync,
} = {}) {
  const args = [...(candidate.argsPrefix ?? []), "-c", VERSION_PROBE];
  const result = spawnSyncImpl(candidate.executable, args, {
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    return {
      source: candidate.source,
      launcherExecutable: candidate.executable,
      launcherArgsPrefix: [...(candidate.argsPrefix ?? [])],
      present: false,
      compatible: false,
      reason: result.error?.code ?? result.error?.message ?? `exit_${result.status}`,
    };
  }

  let details;
  try {
    const output = String(result.stdout ?? "").trim().split(/\r?\n/u).filter(Boolean).at(-1);
    details = JSON.parse(output);
  } catch {
    return {
      source: candidate.source,
      launcherExecutable: candidate.executable,
      launcherArgsPrefix: [...(candidate.argsPrefix ?? [])],
      present: true,
      compatible: false,
      reason: "UNPARSABLE_PYTHON_VERSION_PROBE",
    };
  }

  const compatible = details.major === 3
    && SUPPORTED_PYTHON_MINORS.includes(details.minor);
  const version = [details.major, details.minor, details.patch].join(".");
  return {
    source: candidate.source,
    launcherExecutable: candidate.executable,
    launcherArgsPrefix: [...(candidate.argsPrefix ?? [])],
    present: true,
    compatible,
    version,
    resolvedExecutable: details.executable,
    reason: compatible ? null : `UNSUPPORTED_PYTHON_VERSION_${version}`,
  };
}

export function resolveCompatiblePython(options = {}) {
  let candidates;
  try {
    candidates = options.candidates ?? buildCompatiblePythonCandidates(options);
  } catch (error) {
    return {
      status: "BLOCKED_MISSING_OR_INCOMPATIBLE_PYTHON",
      compatible: false,
      version: null,
      executable: null,
      source: null,
      attempts: [],
      error: error.message,
    };
  }

  const attempts = [];
  for (const candidate of candidates) {
    const attempt = probePythonCandidate(candidate, options);
    attempts.push(attempt);
    if (attempt.compatible) {
      return {
        status: "READY",
        compatible: true,
        version: attempt.version,
        executable: attempt.resolvedExecutable,
        argsPrefix: [],
        source: attempt.source,
        launcherExecutable: attempt.launcherExecutable,
        launcherArgsPrefix: attempt.launcherArgsPrefix,
        attempts,
        error: null,
      };
    }
  }

  return {
    status: "BLOCKED_MISSING_OR_INCOMPATIBLE_PYTHON",
    compatible: false,
    version: null,
    executable: null,
    argsPrefix: [],
    source: null,
    attempts,
    error: "No Python 3.11, 3.12, or 3.13 interpreter was found",
  };
}
