import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_INPUT_DIR = "data/private-input/m3-material-dry-run";
export const DEFAULT_OUTPUT_DIR = "data/private-output/m3-dry-run";
export const ALLOWED_EXTENSIONS = Object.freeze([".docx", ".pdf", ".pptx", ".txt", ".md", ".xlsx"]);
export const MIN_INPUT_FILES = 3;
export const MAX_INPUT_FILES = 5;

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const IS_CLI = path.resolve(process.argv[1] ?? "") === path.resolve(SCRIPT_PATH);

export function checkM3PrivateDryRunSafety(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const inputDir = normalizeRelativePath(options.inputDir ?? DEFAULT_INPUT_DIR);
  const outputDir = normalizeRelativePath(options.outputDir ?? DEFAULT_OUTPUT_DIR);
  const absoluteInputDir = path.join(repoRoot, inputDir);
  const absoluteOutputDir = path.join(repoRoot, outputDir);
  const issues = [];

  if (!isAllowedPrivatePath(inputDir, "input")) {
    issues.push(issue("unsafe_input_path", "Input path must stay under data/private-input/."));
  }
  if (!isAllowedPrivatePath(outputDir, "output")) {
    issues.push(issue("unsafe_output_path", "Output path must stay under data/private-output/."));
  }

  if (!existsSync(absoluteInputDir)) {
    issues.push(issue("input_dir_missing", "Private input directory is missing."));
  }

  mkdirSync(absoluteOutputDir, { recursive: true });

  if (!options.skipGitChecks) {
    if (!isGitIgnored(repoRoot, inputDir)) {
      issues.push(issue("input_dir_not_gitignored", "Private input directory is not covered by gitignore."));
    }
    if (!isGitIgnored(repoRoot, outputDir)) {
      issues.push(issue("output_dir_not_gitignored", "Private output directory is not covered by gitignore."));
    }
    const stagedFiles = gitNameOnly(repoRoot, ["diff", "--cached", "--name-only"]);
    if (stagedFiles.length > 0) {
      issues.push(issue("staged_files_present", "No staged files are allowed before private dry-run.", {
        stagedFileCount: stagedFiles.length
      }));
    }
    const migrationDiff = [
      ...gitNameOnly(repoRoot, ["diff", "--name-only", "--", "db/migrations"]),
      ...gitNameOnly(repoRoot, ["diff", "--cached", "--name-only", "--", "db/migrations"])
    ];
    if (migrationDiff.length > 0) {
      issues.push(issue("db_migrations_diff_present", "db/migrations must not have diff in this sprint.", {
        changedFileCount: new Set(migrationDiff).size
      }));
    }
  }

  const inventory = existsSync(absoluteInputDir)
    ? collectInputInventory(absoluteInputDir)
    : [];
  const validFileCount = inventory.length;
  if (validFileCount < MIN_INPUT_FILES || validFileCount > MAX_INPUT_FILES) {
    issues.push(issue("input_file_count_out_of_range", "Private dry-run requires 3 to 5 direct input files.", {
      inputFileCount: validFileCount,
      expectedMin: MIN_INPUT_FILES,
      expectedMax: MAX_INPUT_FILES
    }));
  }

  const unsupported = inventory.filter((item) => !ALLOWED_EXTENSIONS.includes(item.extension));
  if (unsupported.length > 0) {
    issues.push(issue("unsupported_input_extension", "Unsupported private input extension detected.", {
      unsupportedInputs: unsupported.map((item) => ({
        anonymousInputId: item.anonymousInputId,
        extension: item.extension
      }))
    }));
  }

  const ok = issues.length === 0;
  return {
    ok,
    inputDir,
    outputDir,
    inputFileCount: validFileCount,
    allowedExtensions: [...ALLOWED_EXTENSIONS],
    anonymousInputs: inventory.map(({ anonymousInputId, extension, sizeBytes }) => ({
      anonymousInputId,
      extension,
      sizeBytes
    })),
    extensionDistribution: countBy(inventory, "extension"),
    issues,
    databaseConnected: false,
    dockerExecuted: false,
    migrationExecuted: false,
    dbMigrationsModified: false,
    rawMaterialPrinted: false,
    realFileNamesPrinted: false,
    notForFormalDecision: true
  };
}

export function collectInputInventory(absoluteInputDir) {
  return readdirSync(absoluteInputDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry, index) => {
      const extension = path.extname(entry.name).toLowerCase();
      const absolutePath = path.join(absoluteInputDir, entry.name);
      return {
        anonymousInputId: `ANON-M3-PRIVATE-${String(index + 1).padStart(3, "0")}`,
        extension,
        absolutePath,
        sizeBytes: statSync(absolutePath).size
      };
    });
}

export function isAllowedPrivatePath(relativePath, kind) {
  const normalized = normalizeRelativePath(relativePath);
  if (kind === "input") {
    return normalized === "data/private-input" || normalized.startsWith("data/private-input/");
  }
  if (kind === "output") {
    return normalized === "data/private-output" || normalized.startsWith("data/private-output/");
  }
  return false;
}

export function normalizeRelativePath(value) {
  return String(value ?? "")
    .replaceAll("\\", "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

function isGitIgnored(repoRoot, relativePath) {
  try {
    execFileSync("git", ["check-ignore", "-q", "--", normalizeRelativePath(relativePath)], {
      cwd: repoRoot,
      stdio: "ignore"
    });
    return true;
  } catch {
    return false;
  }
}

function gitNameOnly(repoRoot, args) {
  const output = execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  return output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function countBy(values, key) {
  return values.reduce((counts, value) => {
    const group = value[key] || "unknown";
    counts[group] = (counts[group] ?? 0) + 1;
    return counts;
  }, {});
}

function issue(code, message, extra = {}) {
  return { code, message, ...extra };
}

if (IS_CLI) {
  const result = checkM3PrivateDryRunSafety();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) {
    process.exitCode = 1;
  }
}
