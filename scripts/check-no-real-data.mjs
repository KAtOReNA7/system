import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const MAX_TEXT_BYTES = 2 * 1024 * 1024;

const CHANNEL_SALES_SUMMARY = ["渠道", "实销", "汇总"].join("");
const FORMAL_MAPPING_CANDIDATE = [
  "M1",
  "-formal-mapping-version-",
  "candidate"
].join("");
const LOCAL_REHEARSAL_DETAIL = [
  "M1",
  "-mapping-version-local-rehearsal-",
  "detail"
].join("");
const PG_PASSWORD = ["PG", "PASSWORD"].join("");
const POSTGRES_PROTOCOL = ["postgres", "://"].join("");
const POSTGRESQL_PROTOCOL = ["postgresql", "://"].join("");
const WINDOWS_POSTGRES_DATA = [
  "C:",
  "\\",
  "Program Files",
  "\\",
  "PostgreSQL",
  "\\",
  "16",
  "\\",
  "data"
].join("");
const PROJECT_DATA_DIRECTORY = [
  "D:",
  "\\",
  "porject",
  "\\",
  "system",
  "\\",
  "data"
].join("");

function runGit(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024
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

function unique(values) {
  return [...new Set(values)];
}

function pathSegments(path) {
  return path.split("/").filter(Boolean);
}

function basename(path) {
  const segments = pathSegments(path);
  return segments.at(-1) || path;
}

function isEnvFile(path) {
  const name = basename(path);
  return name === ".env" || (name.startsWith(".env.") && name !== ".env.example");
}

function shouldScanContent(path) {
  const normalized = path.replaceAll("\\", "/");
  return !(
    normalized === "scripts/check-no-real-data.mjs" ||
    normalized.startsWith("test/") ||
    normalized.startsWith("tools/dev-smoke/") ||
    normalized.startsWith("tools/dev-db/") ||
    normalized.startsWith("experiments/m1-flyway-candidate/tests/") ||
    normalized.startsWith("experiments/m1-postgresql16-prototype/tests/") ||
    normalized === "docs/technical-design/M1-应用开发前数据库迁移使用说明-v0.1.md"
  );
}

function isProbablyText(buffer) {
  return !buffer.includes(0);
}

function collectCandidatePaths() {
  const tracked = gitPathList(["ls-files", "-z"]);
  const staged = gitPathList([
    "diff",
    "--cached",
    "--name-only",
    "--diff-filter=ACMR",
    "-z"
  ]);
  return unique([...tracked, ...staged]).sort();
}

const pathRules = [
  {
    label: ".env",
    test: isEnvFile
  },
  {
    label: ".pgpass",
    test: (path) => basename(path) === ".pgpass"
  },
  {
    label: "data/",
    test: (path) => pathSegments(path).includes("data")
  },
  {
    label: ".xlsx",
    test: (path) => path.toLowerCase().endsWith(".xlsx")
  },
  {
    label: ".xls",
    test: (path) => path.toLowerCase().endsWith(".xls")
  },
  {
    label: CHANNEL_SALES_SUMMARY,
    test: (path) => path.includes(CHANNEL_SALES_SUMMARY)
  },
  {
    label: FORMAL_MAPPING_CANDIDATE,
    test: (path) => path.includes(FORMAL_MAPPING_CANDIDATE)
  },
  {
    label: LOCAL_REHEARSAL_DETAIL,
    test: (path) => path.includes(LOCAL_REHEARSAL_DETAIL)
  }
];

const contentRules = [
  {
    label: PG_PASSWORD,
    test: (line) => new RegExp(`\\b${PG_PASSWORD}\\b`).test(line)
  },
  {
    label: POSTGRES_PROTOCOL,
    test: (line) => line.includes(POSTGRES_PROTOCOL)
  },
  {
    label: POSTGRESQL_PROTOCOL,
    test: (line) => line.includes(POSTGRESQL_PROTOCOL)
  },
  {
    label: WINDOWS_POSTGRES_DATA,
    test: (line) => line.includes(WINDOWS_POSTGRES_DATA)
  },
  {
    label: PROJECT_DATA_DIRECTORY,
    test: (line) => line.includes(PROJECT_DATA_DIRECTORY)
  }
];

function checkPath(path, violations) {
  for (const rule of pathRules) {
    if (rule.test(path)) {
      violations.push({
        type: "path",
        rule: rule.label,
        path
      });
    }
  }
}

function checkContent(root, path, violations) {
  if (!shouldScanContent(path)) {
    return;
  }

  const fullPath = join(root, path);
  if (!existsSync(fullPath)) {
    return;
  }

  const stat = statSync(fullPath);
  if (!stat.isFile() || stat.size > MAX_TEXT_BYTES) {
    return;
  }

  const buffer = readFileSync(fullPath);
  if (!isProbablyText(buffer)) {
    return;
  }

  const lines = buffer.toString("utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const rule of contentRules) {
      if (rule.test(line)) {
        violations.push({
          type: "content",
          rule: rule.label,
          path,
          line: index + 1
        });
      }
    }
  });
}

const root = repoRoot();
const paths = collectCandidatePaths();
const violations = [];

for (const path of paths) {
  checkPath(path, violations);
  checkContent(root, path, violations);
}

if (violations.length > 0) {
  console.error("Real data and secret guard failed.");
  for (const violation of violations) {
    const location = violation.line
      ? `${violation.path}:${violation.line}`
      : violation.path;
    console.error(`- ${violation.type}: ${violation.rule} in ${location}`);
  }
  process.exit(1);
}

console.log(`No real data guard violations found in ${paths.length} Git-tracked/staged files.`);
