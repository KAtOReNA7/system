import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";

export const TEST_REGISTRY_PATH = "config/test-registry.v0.1.json";

function normalizePath(path) {
  return path.replaceAll("\\", "/");
}

export function listTrackedFiles(patterns, { root = process.cwd() } = {}) {
  const output = execFileSync("git", ["ls-files", "-z", "--", ...patterns], {
    cwd: root,
    encoding: "buffer",
    windowsHide: true
  });

  return output
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map(normalizePath)
    .sort();
}

export function listProjectFiles(patterns, { root = process.cwd() } = {}) {
  const output = execFileSync(
    "git",
    [
      "ls-files",
      "-z",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      ...patterns
    ],
    {
      cwd: root,
      encoding: "buffer",
      windowsHide: true
    }
  );

  return [...new Set(
    output
      .toString("utf8")
      .split("\0")
      .filter(Boolean)
      .map(normalizePath)
  )].sort();
}

export function listTrackedJavaScriptFiles(options) {
  return listTrackedFiles(["*.js", "*.mjs"], options);
}

export function listProjectJavaScriptFiles(options) {
  return listProjectFiles(["*.js", "*.mjs"], options);
}

export function listTrackedTestFiles(options) {
  return listProjectFiles(["test/**/*.test.js", "test/*.test.js"], options);
}

export function loadTestRegistry({
  root = process.cwd(),
  registryPath = TEST_REGISTRY_PATH
} = {}) {
  return JSON.parse(readFileSync(resolve(root, registryPath), "utf8"));
}

function matchesAny(value, candidates = []) {
  return candidates.some((candidate) => value.includes(candidate));
}

function matchesRule(path, match = {}) {
  const fileName = basename(path);
  const included =
    (match.exactPaths || []).includes(path) ||
    (match.pathPrefixes || []).some((prefix) => path.startsWith(prefix)) ||
    matchesAny(fileName, match.basenameIncludes);

  if (!included) {
    return false;
  }

  return !(
    (match.excludeExactPaths || []).includes(path) ||
    (match.excludePathPrefixes || []).some((prefix) => path.startsWith(prefix)) ||
    matchesAny(fileName, match.excludeBasenameIncludes)
  );
}

export function classifyTrackedTests({
  root = process.cwd(),
  registry = loadTestRegistry({ root })
} = {}) {
  const trackedTests = listTrackedTestFiles({ root });
  const suites = new Map(registry.suites.map((suite) => [suite.id, []]));
  const classifications = [];

  for (const path of trackedTests) {
    const matches = registry.suites
      .filter((suite) => matchesRule(path, suite.match))
      .map((suite) => suite.id);
    classifications.push({ path, matches });
    if (matches.length === 1) {
      suites.get(matches[0]).push(path);
    }
  }

  return {
    trackedTests,
    classifications,
    suites
  };
}

export function filesForTestProfile(profileId, {
  root = process.cwd(),
  registry = loadTestRegistry({ root })
} = {}) {
  const profile = registry.profiles[profileId];
  if (!profile) {
    throw new Error(`unknown_test_profile:${profileId}`);
  }

  const classified = classifyTrackedTests({ root, registry });
  const invalid = classified.classifications.filter(
    (entry) => entry.matches.length !== 1
  );
  if (invalid.length > 0) {
    throw new Error(
      `invalid_test_classification:${invalid
        .map((entry) => `${entry.path}=>${entry.matches.join(",") || "NONE"}`)
        .join("|")}`
    );
  }

  const files = profile.suites
    .flatMap((suiteId) => {
      if (!classified.suites.has(suiteId)) {
        throw new Error(`unknown_test_suite:${suiteId}`);
      }
      return classified.suites.get(suiteId);
    })
    .sort();

  return {
    profileId,
    concurrency: profile.concurrency,
    suites: [...profile.suites],
    files,
    trackedTestCount: classified.trackedTests.length
  };
}
