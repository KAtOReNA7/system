import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const lifecycle = JSON.parse(
  readFileSync(resolve(root, "config", "command-lifecycle.v0.1.json"), "utf8"),
);

if (lifecycle.schemaVersion !== "repository.command-lifecycle.v0.1") {
  throw new Error(`unsupported_command_lifecycle:${lifecycle.schemaVersion}`);
}

const scripts = Object.keys(packageJson.scripts ?? {});
const current = new Set(lifecycle.currentPublicCommands ?? []);
const dispatcher = lifecycle.historyDispatcher;
const archivePrefixes = lifecycle.archiveOnlyPrefixes ?? [];
const restrictedPrefixes = lifecycle.restrictedPrefixes ?? [];
const issues = [];
const classifications = new Map();

if (new Set(lifecycle.currentPublicCommands ?? []).size !== current.size) {
  issues.push("duplicate_current_public_command");
}
if (new Set(archivePrefixes).size !== archivePrefixes.length) {
  issues.push("duplicate_archive_prefix");
}
if (new Set(restrictedPrefixes).size !== restrictedPrefixes.length) {
  issues.push("duplicate_restricted_prefix");
}

for (const command of current) {
  if (!Object.hasOwn(packageJson.scripts ?? {}, command)) {
    issues.push(`current_command_missing:${command}`);
  }
}
if (!dispatcher || !Object.hasOwn(packageJson.scripts ?? {}, dispatcher)) {
  issues.push(`history_dispatcher_missing:${dispatcher ?? "undefined"}`);
}

for (const script of scripts) {
  if (current.has(script)) {
    classifications.set(script, "current-public");
    continue;
  }
  if (script === dispatcher) {
    classifications.set(script, "history-dispatcher");
    continue;
  }
  const archiveMatches = archivePrefixes.filter((prefix) => script.startsWith(prefix));
  const restrictedMatches = restrictedPrefixes.filter((prefix) => script.startsWith(prefix));
  if (archiveMatches.length + restrictedMatches.length !== 1) {
    issues.push(
      `command_lifecycle_match_count:${script}:`
      + `${archiveMatches.length + restrictedMatches.length}`,
    );
    continue;
  }
  classifications.set(
    script,
    archiveMatches.length === 1 ? "archive-only" : "restricted-local",
  );
}

if (issues.length > 0) {
  for (const issue of issues) {
    console.error(issue);
  }
  process.exit(1);
}

const counts = {};
for (const classification of classifications.values()) {
  counts[classification] = (counts[classification] ?? 0) + 1;
}
const result = {
  status: "PASS",
  scriptCount: scripts.length,
  classifiedCount: classifications.size,
  counts,
};

if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  console.log(
    `Classified ${result.classifiedCount}/${result.scriptCount} package scripts by lifecycle.`,
  );
}
