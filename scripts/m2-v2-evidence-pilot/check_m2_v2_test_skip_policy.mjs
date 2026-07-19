import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { loadArtifactRegistry, validateArtifactRegistry } from "../../test/helpers/m2V2RequiredArtifacts.js";

function parseArgs(argv) {
  const parsed = { profile: "default", root: process.cwd() };
  for (const arg of argv) {
    if (arg.startsWith("--profile=")) parsed.profile = arg.slice("--profile=".length);
    else if (arg.startsWith("--root=")) parsed.root = path.resolve(arg.slice("--root=".length));
    else throw new Error(`s0_skip_policy_unknown_argument:${arg}`);
  }
  if (!["default", "optional-private"].includes(parsed.profile)) throw new Error(`s0_skip_policy_unknown_profile:${parsed.profile}`);
  return parsed;
}

function listTestFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listTestFiles(absolute));
    else if (/\.test\.(?:c|m)?js$/u.test(entry.name)) files.push(absolute);
  }
  return files.sort((left, right) => left.localeCompare(right));
}

export function stripJavaScriptNonCode(source) {
  let output = "";
  let state = "code";
  let quote = "";
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1] ?? "";
    if (state === "line_comment") {
      if (char === "\n") {
        state = "code";
        output += "\n";
      } else output += " ";
      continue;
    }
    if (state === "block_comment") {
      if (char === "*" && next === "/") {
        output += "  ";
        index += 1;
        state = "code";
      } else output += char === "\n" ? "\n" : " ";
      continue;
    }
    if (state === "string") {
      if (escaped) {
        escaped = false;
        output += char === "\n" ? "\n" : " ";
      } else if (char === "\\") {
        escaped = true;
        output += " ";
      } else if (char === quote) {
        state = "code";
        output += " ";
      } else output += char === "\n" ? "\n" : " ";
      continue;
    }
    if (char === "/" && next === "/") {
      output += "  ";
      index += 1;
      state = "line_comment";
      continue;
    }
    if (char === "/" && next === "*") {
      output += "  ";
      index += 1;
      state = "block_comment";
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      state = "string";
      output += " ";
      continue;
    }
    output += char;
  }
  return output;
}

function lineForOffset(source, offset) {
  return source.slice(0, offset).split("\n").length;
}

export function scanTestSource(source, relativePath = "synthetic.test.js") {
  const code = stripJavaScriptNonCode(source);
  const patterns = [
    { kind: "NODE_TEST_SKIP_API", regex: /\b(?:test|it|describe|context|t)\s*\.\s*skip\s*\(/gu },
    { kind: "NODE_TEST_SKIP_OPTION", regex: /(?:\{|,)\s*skip\s*:/gu },
    {
      kind: "FAIL_OPEN_MISSING_ARTIFACT_BRANCH",
      regex: /if\s*\(\s*!\s*(?:[A-Za-z_$][\w$]*\s*\.\s*)?(?:existsSync|accessSync)\s*\([^)]*\)[^)]*\)\s*(?:\{[^{}]{0,240})?\b(?:return|continue)\b/gu,
    },
    {
      kind: "FAIL_OPEN_MISSING_VALUE_BRANCH",
      regex: /if\s*\(\s*!\s*(?:report|artifact|receipt|manifest|gate|binding|validation)\s*\)\s*(?:\{[^{}]{0,240})?\b(?:return|continue)\b/gu,
    },
  ];
  const violations = [];
  for (const pattern of patterns) {
    for (const match of code.matchAll(pattern.regex)) {
      violations.push({ kind: pattern.kind, path: relativePath, line: lineForOffset(code, match.index), token: match[0].slice(0, 80).replace(/\s+/gu, " ") });
    }
  }
  return violations.sort((left, right) => left.line - right.line || left.kind.localeCompare(right.kind));
}

export function checkSkipPolicy({ root = process.cwd(), profile = "default", files } = {}) {
  const registry = loadArtifactRegistry(root);
  const summary = validateArtifactRegistry(registry);
  const testFiles = files ?? listTestFiles(path.join(root, "test"));
  const violations = [];
  for (const absolute of testFiles) {
    const syntax = spawnSync(process.execPath, ["--check", absolute], { cwd: root, encoding: "utf8", windowsHide: true });
    if (syntax.status !== 0) throw new Error(`s0_skip_policy_syntax_error:${path.relative(root, absolute).replaceAll("\\", "/")}`);
    const relative = path.relative(root, absolute).replaceAll("\\", "/");
    violations.push(...scanTestSource(fs.readFileSync(absolute, "utf8"), relative));
  }
  if (violations.length > 0) {
    const first = violations[0];
    throw new Error(`s0_skip_policy_violation:${first.kind}:${first.path}:${first.line}`);
  }
  return {
    schema: "m2.v2.pr7.s0.test-skip-policy.v0.1",
    profile,
    status: "PASS",
    scannedTestFiles: testFiles.length,
    registeredRequiredSites: summary.requiredSiteCount,
    registeredOptionalSites: summary.optionalSiteCount,
    totalTestSkips: 0,
    unknownSkipIds: 0,
    requiredArtifactSkips: 0,
    violations: [],
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(checkSkipPolicy(args))}\n`);
}

const isCli = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isCli) {
  main().catch((error) => {
    process.stderr.write(`${String(error?.message ?? "s0_skip_policy_failed").replace(/[\r\n]+/gu, " ")}\n`);
    process.exitCode = 1;
  });
}
