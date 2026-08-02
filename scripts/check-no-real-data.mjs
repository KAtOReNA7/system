import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const MAX_TEXT_BYTES = 8 * 1024 * 1024;
const SCANNER_SELF = "scripts/check-no-real-data.mjs";
const SCANNER_TEST = "test/check-no-real-data.test.js";

const CHANNEL_SALES_SUMMARY = ["渠道", "实销", "汇总"].join("");
const FORMAL_MAPPING_CANDIDATE = ["M1", "-formal-mapping-version-", "candidate"].join("");
const LOCAL_REHEARSAL_DETAIL = ["M1", "-mapping-version-local-rehearsal-", "detail"].join("");
const PG_PASSWORD = ["PG", "PASSWORD"].join("");
const POSTGRES_PROTOCOL = ["postgres", "://"].join("");
const POSTGRESQL_PROTOCOL = ["postgresql", "://"].join("");
const WINDOWS_POSTGRES_DATA = ["C:", "\\", "Program Files", "\\", "PostgreSQL", "\\", "16", "\\", "data"].join("");
const PROJECT_DATA_DIRECTORY = ["D:", "\\", "porject", "\\", "system", "\\", "data"].join("");
const REVIEWED_PUBLIC_BINARY_SHA256 = new Map([
  ["docs/analysis/m1-master-data/assets/master-coverage.png", "fb29bff5b194e9bc7403806c2f3a586dc41b4e1fd5cb288b3bcff4163d886142"],
  ["docs/analysis/m1-master-data/assets/ops-confirmation-groups.png", "d94a52a754e377f3686096b6b634d5d0afb8b32b8fa91782e85e4a9768d24dd9"],
  ["docs/analysis/m1-master-data/assets/required-field-gaps.png", "32b833ae344dcae74f9c9362b0ea1c9dbd7677b901b1a7c5ada6f2010d66a0a1"],
  ["docs/analysis/m1-real-bills/assets/amount-sign-count.png", "b007cd7d996b29931f9be790bf7da126b1617a493b16d3a6743f73177588e201"],
  ["docs/analysis/m1-real-bills/assets/issue-candidate-count.png", "025510e1aeb2148fdb8a2ba13e9b19bd17b5d9fa691151d694d7c7776a7cd231"],
  ["docs/analysis/m1-real-bills/assets/monthly-row-count.png", "63c740d5f6582396b4323e15bf88b0817c6b4a27ce65458522799906e3adfd50"],
  ["docs/analysis/m1-real-bills/assets/work-id-format.png", "bcfca44010d0517598469045a722db636e754e8e1b2431b440e504fa14a0b812"]
]);

function runGit(args, options = {}) {
  return execFileSync("git", args, {
    encoding: options.encoding ?? "utf8",
    maxBuffer: 32 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function gitPathList(args) {
  return runGit(args)
    .split("\0")
    .filter(Boolean)
    .map((path) => path.replaceAll("\\", "/"));
}

function repoRoot() {
  return runGit(["rev-parse", "--show-toplevel"]).trim();
}

function pathSegments(path) {
  return path.split("/").filter(Boolean);
}

function basename(path) {
  return pathSegments(path).at(-1) || path;
}

function isEnvFile(path) {
  const name = basename(path).toLowerCase();
  return name === ".env" || (name.startsWith(".env.") && name !== ".env.example");
}

function shouldScanContent(path) {
  const normalized = path.replaceAll("\\", "/");
  return !(
    normalized === SCANNER_SELF ||
    normalized === SCANNER_TEST ||
    normalized === "docs/technical-design/M1-应用开发前数据库迁移使用说明-v0.1.md"
  );
}

function sha256Buffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function decodeUtf8(buffer) {
  return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
}

function isReviewedPublicBinary(path, buffer) {
  const expected = REVIEWED_PUBLIC_BINARY_SHA256.get(path.toLowerCase());
  return Boolean(expected) && sha256Buffer(buffer) === expected;
}

function collectCandidateEntries() {
  const tracked = gitPathList(["ls-files", "-z"]).map((path) => ({ path, source: "worktree" }));
  const staged = gitPathList([
    "diff",
    "--cached",
    "--name-only",
    "--diff-filter=ACMR",
    "-z"
  ]).map((path) => ({ path, source: "index" }));
  const untracked = gitPathList([
    "ls-files",
    "--others",
    "--exclude-standard",
    "-z"
  ]).map((path) => ({ path, source: "untracked" }));
  const seen = new Set();
  return [...tracked, ...staged, ...untracked]
    .filter((entry) => {
      const key = `${entry.source}:${entry.path}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => left.path.localeCompare(right.path) || left.source.localeCompare(right.source));
}

const pathRules = [
  { label: "environment_file", test: isEnvFile },
  { label: "pgpass_file", test: (path) => basename(path).toLowerCase() === ".pgpass" },
  { label: "private_data_path", test: (path) => pathSegments(path).some((segment) => segment.toLowerCase() === "data") },
  { label: "excel_workbook", test: (path) => /\.xlsx?$/iu.test(path) },
  { label: "provider_raw_response_file", test: (path) => /(?:^|\/)(?:response|raw[-_.]?response)(?:\.[^/]*)?$/iu.test(path) },
  { label: "channel_sales_summary", test: (path) => path.toLowerCase().includes(CHANNEL_SALES_SUMMARY.toLowerCase()) },
  { label: "formal_mapping_candidate", test: (path) => path.toLowerCase().includes(FORMAL_MAPPING_CANDIDATE.toLowerCase()) },
  { label: "local_rehearsal_detail", test: (path) => path.toLowerCase().includes(LOCAL_REHEARSAL_DETAIL.toLowerCase()) }
];

function normalizedValue(rawValue) {
  return String(rawValue ?? "")
    .trim()
    .replace(/^["'`]|["'`,;}]$/gu, "")
    .trim();
}

function isSafeExampleValue(rawValue) {
  const value = normalizedValue(rawValue);
  if (!value) return true;
  if (/^(?:null|undefined|false|none)$/iu.test(value)) return true;
  if (/^(?:redacted|example|placeholder|synthetic|test|dummy|fake|sample)(?:[-_].*)?$/iu.test(value)) return true;
  if (/^(?:your|replace|insert|set)[-_ ]?(?:api[-_ ]?)?(?:key|token|secret)(?:[-_ ]?here)?$/iu.test(value)) return true;
  if (/^(?:<[^>]+>|\$\{[^}]+\}|\$env:[A-Za-z_][A-Za-z0-9_]*|%[A-Za-z_][A-Za-z0-9_]*%)$/u.test(value)) return true;
  if (/^(?:process\.)?env(?:\.|\[)|(?:config|options|context|relay|tavily)\.[A-Za-z_]/u.test(value)) return true;
  return false;
}

function looksSecretLike(rawValue) {
  const value = normalizedValue(rawValue);
  if (isSafeExampleValue(value)) return false;
  if (/^(?:sk|tvly|tavily|relay)[-_][A-Za-z0-9_-]{12,}$/u.test(value)) return true;
  if (/^[A-Za-z0-9+/_=-]{20,}$/u.test(value)) return true;
  if (/^[A-Za-z0-9._~-]{12,}$/u.test(value) && /[A-Za-z]/u.test(value) && /[0-9]/u.test(value)) return true;
  return false;
}

const staticContentRules = [
  { label: "windows_postgres_data_path", test: (line) => line.includes(WINDOWS_POSTGRES_DATA) },
  { label: "project_private_data_path", test: (line) => line.includes(PROJECT_DATA_DIRECTORY) }
];

function findPostgresPasswordSecret(line) {
  const pattern = new RegExp(`\\b${PG_PASSWORD}\\b\\s*(?:=|:)\\s*["'\`]?(\\S+)`, "giu");
  for (const match of line.matchAll(pattern)) {
    if (looksSecretLike(match[1])) return "postgres_password_value";
  }
  return null;
}

function findDirectTokenSecret(line) {
  const pattern = /(?<![A-Za-z0-9_])(?:sk|tvly)[-_]([A-Za-z0-9_-]{16,})/gu;
  for (const match of line.matchAll(pattern)) {
    if (/^(?:synthetic|test|example|placeholder|redacted|dummy|fake|sample)(?:[-_]|$)/iu.test(match[1])) continue;
    return "secret_token_literal";
  }
  return null;
}

function findPostgresSecret(line) {
  if (!line.includes(POSTGRES_PROTOCOL) && !line.includes(POSTGRESQL_PROTOCOL)) return null;
  const match = line.match(/postgres(?:ql)?:\/\/[^:\s/]+:([^@\s/]+)@/iu);
  if (!match) return null;
  const password = normalizedValue(match[1]);
  if (/^(?:postgres|password|local|localhost|synthetic|test|example|placeholder)$/iu.test(password)) return null;
  return looksSecretLike(password) ? "postgres_connection_secret" : null;
}

function findAssignmentSecret(line) {
  const environmentPattern = /\b(?:OPENAI_API_KEY|TAVILY_API_KEY|M2_V2_[A-Z0-9_]*KEY)\b\s*["']?\s*(?:=|:)\s*["'`]?([^\s"'`,;}]+)/giu;
  for (const match of line.matchAll(environmentPattern)) {
    if (looksSecretLike(match[1])) return "provider_key_value";
  }

  const providerFieldPattern = /\b(?:api[_-]?key|access[_-]?token|provider[_-]?(?:key|token|authorization)|relay[_-]?(?:key|token|secret)|tavily[_-]?(?:key|token|secret)|raw[_-]?authorization)\b["']?\s*(?:=|:)\s*["'`]?([^\s"'`,;}]+)/giu;
  for (const match of line.matchAll(providerFieldPattern)) {
    if (looksSecretLike(match[1])) return "provider_secret_field";
  }
  return null;
}

function findBearerSecret(line) {
  const bearerPattern = /\bBearer\s+([^\s"'`,;}]+)/giu;
  for (const match of line.matchAll(bearerPattern)) {
    if (looksSecretLike(match[1])) return "bearer_token_value";
  }
  return null;
}

function checkPath(entry, violations) {
  for (const rule of pathRules) {
    if (rule.test(entry.path)) {
      violations.push({ type: "path", rule: rule.label, path: entry.path, source: entry.source });
    }
  }
}

function readEntryBuffer(root, entry) {
  if (entry.source === "index") {
    try {
      return { buffer: runGit(["show", `:${entry.path}`], { encoding: "buffer" }), failure: null };
    } catch {
      return { buffer: null, failure: "index_blob_unreadable" };
    }
  }
  const fullPath = join(root, entry.path);
  if (!existsSync(fullPath)) return { buffer: null, failure: "worktree_file_missing" };
  try {
    const stat = statSync(fullPath);
    if (!stat.isFile()) return { buffer: null, failure: "non_regular_file" };
    if (stat.size > MAX_TEXT_BYTES) return { buffer: null, failure: "oversized_file_unscanned" };
    return { buffer: readFileSync(fullPath), failure: null };
  } catch {
    return { buffer: null, failure: "worktree_file_unreadable" };
  }
}

function checkContent(root, entry, violations) {
  if (!shouldScanContent(entry.path)) return;
  const loaded = readEntryBuffer(root, entry);
  if (loaded.failure) {
    violations.push({ type: "content", rule: loaded.failure, path: entry.path, source: entry.source });
    return;
  }
  const buffer = loaded.buffer;
  if (!buffer || buffer.length > MAX_TEXT_BYTES) {
    violations.push({ type: "content", rule: "content_read_incomplete", path: entry.path, source: entry.source });
    return;
  }
  if (buffer.includes(0)) {
    if (!isReviewedPublicBinary(entry.path, buffer)) {
      violations.push({ type: "content", rule: "unreviewed_binary_content", path: entry.path, source: entry.source });
    }
    return;
  }

  let text;
  try {
    text = decodeUtf8(buffer);
  } catch {
    violations.push({ type: "content", rule: "invalid_utf8_content", path: entry.path, source: entry.source });
    return;
  }

  const lines = text.split(/\r?\n/u);
  lines.forEach((line, index) => {
    for (const rule of staticContentRules) {
      if (rule.test(line)) {
        violations.push({ type: "content", rule: rule.label, path: entry.path, source: entry.source, line: index + 1 });
      }
    }
    const assignmentRule = findAssignmentSecret(line);
    if (assignmentRule) {
      violations.push({ type: "content", rule: assignmentRule, path: entry.path, source: entry.source, line: index + 1 });
    }
    const bearerRule = findBearerSecret(line);
    if (bearerRule) {
      violations.push({ type: "content", rule: bearerRule, path: entry.path, source: entry.source, line: index + 1 });
    }
    const postgresRule = findPostgresSecret(line);
    if (postgresRule) {
      violations.push({ type: "content", rule: postgresRule, path: entry.path, source: entry.source, line: index + 1 });
    }
    const directTokenRule = findDirectTokenSecret(line);
    if (directTokenRule) {
      violations.push({ type: "content", rule: directTokenRule, path: entry.path, source: entry.source, line: index + 1 });
    }
    const postgresPasswordRule = findPostgresPasswordSecret(line);
    if (postgresPasswordRule) {
      violations.push({ type: "content", rule: postgresPasswordRule, path: entry.path, source: entry.source, line: index + 1 });
    }
  });
}

const root = repoRoot();
const entries = collectCandidateEntries();
const violations = [];

for (const entry of entries) {
  checkPath(entry, violations);
  checkContent(root, entry, violations);
}

const uniqueViolations = [...new Map(
  violations.map((violation) => [`${violation.type}:${violation.rule}:${violation.source}:${violation.path}:${violation.line ?? ""}`, violation])
).values()];

if (uniqueViolations.length > 0) {
  console.error("Real data and secret guard failed.");
  for (const violation of uniqueViolations) {
    const location = violation.line ? `${violation.path}:${violation.line}` : violation.path;
    console.error(`- ${violation.type}: ${violation.rule} in ${location} [${violation.source}]`);
  }
  process.exit(1);
}

const uniquePaths = new Set(entries.map((entry) => entry.path));
console.log(`No real data guard violations found in ${uniquePaths.size} tracked/staged/nonignored-untracked paths.`);
