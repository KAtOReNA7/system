import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { listTrackedFiles } from "./project-inventory.mjs";

const args = new Set(process.argv.slice(2));
for (const arg of args) {
  if (arg !== "--json") {
    console.error(`unknown_argument:${arg}`);
    process.exit(2);
  }
}

const root = process.cwd();
const manifest = JSON.parse(
  readFileSync(resolve(root, "config/build-entrypoints.v0.1.json"), "utf8")
);
const packageJson = JSON.parse(
  readFileSync(resolve(root, "package.json"), "utf8")
);
const tracked = new Set(listTrackedFiles(["*"], { root }));
const issues = [];

for (const path of manifest.requiredTrackedFiles) {
  if (!tracked.has(path)) {
    issues.push(`required_build_file_not_tracked:${path}`);
  } else if (!existsSync(resolve(root, path))) {
    issues.push(`required_build_file_missing:${path}`);
  }
}

for (const [scriptName, expectedEntrypoint] of Object.entries(
  manifest.packageEntrypoints
)) {
  const command = packageJson.scripts?.[scriptName] || "";
  if (!command.includes(expectedEntrypoint)) {
    issues.push(
      `package_entrypoint_mismatch:${scriptName}:${expectedEntrypoint}`
    );
  }
}

for (const importCheck of manifest.importChecks) {
  try {
    const module = await import(
      `${pathToFileURL(resolve(root, importCheck.path)).href}?build-check=1`
    );
    for (const exportName of importCheck.requiredExports) {
      if (!(exportName in module)) {
        issues.push(
          `required_export_missing:${importCheck.path}:${exportName}`
        );
      }
    }
  } catch (error) {
    issues.push(`module_import_failed:${importCheck.path}:${error.message}`);
  }
}

if (issues.length > 0) {
  for (const issue of issues) {
    console.error(issue);
  }
  process.exit(1);
}

const result = {
  status: "PASS",
  requiredTrackedFileCount: manifest.requiredTrackedFiles.length,
  importCheckCount: manifest.importChecks.length,
  packageEntrypointCount: Object.keys(manifest.packageEntrypoints).length
};

console.log(args.has("--json") ? JSON.stringify(result) : "Build entrypoints verified.");
