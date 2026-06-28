import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_INPUT_DIR = "data/private-input/m3-material-dry-run";
export const DEFAULT_OUTPUT_DIR = "data/private-output/m3-dry-run";
export const PRIMARY_MATERIAL_EXTENSIONS = Object.freeze([
  ".doc",
  ".docx",
  ".pdf",
  ".pptx",
  ".jpg",
  ".jpeg",
  ".png",
  ".txt",
  ".md",
  ".xlsx"
]);
export const ALLOWED_EXTENSIONS = PRIMARY_MATERIAL_EXTENSIONS;
export const COMPANION_TEXT_EXTENSIONS = Object.freeze([".txt", ".md"]);
export const MIN_MATERIAL_GROUPS = 3;
export const MAX_MATERIAL_GROUPS = 5;

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

  const inventory = existsSync(absoluteInputDir) ? collectInputInventory(absoluteInputDir) : [];
  const unsupported = inventory.filter((item) => !PRIMARY_MATERIAL_EXTENSIONS.includes(item.extension));
  if (unsupported.length > 0) {
    issues.push(issue("unsupported_input_extension", "Unsupported private input extension detected.", {
      unsupportedInputs: unsupported.map((item) => ({
        anonymousFileId: item.anonymousFileId,
        extension: item.extension
      }))
    }));
  }

  const materialGroups = groupPrimaryMaterials(inventory);
  const materialGroupCount = materialGroups.length;
  if (materialGroupCount < MIN_MATERIAL_GROUPS || materialGroupCount > MAX_MATERIAL_GROUPS) {
    issues.push(issue("material_group_count_out_of_range", "Private dry-run requires 3 to 5 primary material groups.", {
      materialGroupCount,
      expectedMin: MIN_MATERIAL_GROUPS,
      expectedMax: MAX_MATERIAL_GROUPS
    }));
  }

  const ok = issues.length === 0;
  const anonymousMaterials = materialGroups.map(toPublicMaterialGroup);
  return {
    ok,
    inputDir,
    outputDir,
    materialGroupCount,
    inputFileCount: inventory.length,
    acceptedPrimaryMaterialCount: materialGroups.length,
    companionTextCount: materialGroups.filter((item) => item.companionTextFiles.length > 0).length,
    allowedExtensions: [...PRIMARY_MATERIAL_EXTENSIONS],
    anonymousInputs: anonymousMaterials,
    extensionDistribution: countBy(materialGroups, "extension"),
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
      const stem = path.basename(entry.name, extension);
      const absolutePath = path.join(absoluteInputDir, entry.name);
      return {
        anonymousFileId: `ANON-M3-FILE-${String(index + 1).padStart(3, "0")}`,
        extension,
        stem,
        absolutePath,
        sizeBytes: statSync(absolutePath).size
      };
    });
}

export function groupPrimaryMaterials(inventory) {
  const byStem = new Map();
  for (const item of inventory.filter((entry) => PRIMARY_MATERIAL_EXTENSIONS.includes(entry.extension))) {
    const items = byStem.get(item.stem) ?? [];
    items.push(item);
    byStem.set(item.stem, items);
  }

  return [...byStem.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, items], index) => {
      const sorted = [...items].sort((left, right) => materialSortRank(left.extension) - materialSortRank(right.extension));
      const primary = sorted.find((item) => !COMPANION_TEXT_EXTENSIONS.includes(item.extension)) ?? sorted[0];
      const companionTextFiles = sorted.filter((item) =>
        item !== primary &&
        COMPANION_TEXT_EXTENSIONS.includes(item.extension)
      );
      return {
        anonymousMaterialId: `ANON-M3-PRIVATE-${String(index + 1).padStart(3, "0")}`,
        extension: primary.extension,
        absolutePath: primary.absolutePath,
        sizeBytes: primary.sizeBytes,
        hasCompanionText: companionTextFiles.length > 0,
        companionTextFiles,
        plannedParseMode: plannedParseModeFor(primary.extension, companionTextFiles.length > 0),
        acceptedAsPrimaryMaterial: true
      };
    });
}

export function plannedParseModeFor(extension, hasCompanionText = false) {
  if (hasCompanionText && !COMPANION_TEXT_EXTENSIONS.includes(extension)) {
    return "companion_text_enhanced";
  }
  if (extension === ".txt" || extension === ".md") return "text";
  if (extension === ".doc") return "legacy_doc_metadata_only";
  if ([".jpg", ".jpeg", ".png"].includes(extension)) return "image_metadata_only";
  if ([".docx", ".pdf", ".pptx"].includes(extension)) return "document_metadata_only";
  if (extension === ".xlsx") return "spreadsheet_metadata_only";
  return "unsupported";
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

function toPublicMaterialGroup(group) {
  return {
    anonymousMaterialId: group.anonymousMaterialId,
    extension: group.extension,
    hasCompanionText: group.hasCompanionText,
    plannedParseMode: group.plannedParseMode
  };
}

function materialSortRank(extension) {
  const ranks = {
    ".doc": 1,
    ".docx": 1,
    ".pdf": 1,
    ".pptx": 1,
    ".jpg": 1,
    ".jpeg": 1,
    ".png": 1,
    ".xlsx": 1,
    ".txt": 2,
    ".md": 2
  };
  return ranks[extension] ?? 99;
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
