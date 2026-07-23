import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const packageJson = JSON.parse(
  readFileSync(resolve(root, "package.json"), "utf8")
);
const issues = [];

for (const [name, command] of Object.entries(packageJson.scripts || {})) {
  if (/^\s*(?:python|python3|py)(?:\s|$)/i.test(command)) {
    issues.push(`direct_python_bypasses_launcher:${name}`);
  }
  if (/([A-Za-z]:\\|\/Users\/|\/home\/)/.test(command)) {
    issues.push(`machine_specific_script_path:${name}`);
  }

  const referencedFiles = command.match(
    /(?:^|\s)([A-Za-z0-9_./-]+\.(?:js|mjs|py|ps1))(?=\s|$)/g
  );
  for (const rawReference of referencedFiles || []) {
    const path = rawReference.trim().replaceAll("\\", "/");
    if (!existsSync(resolve(root, path))) {
      issues.push(`script_target_missing:${name}:${path}`);
    }
  }
}

if (issues.length > 0) {
  for (const issue of issues) {
    console.error(issue);
  }
  process.exit(1);
}

console.log(
  `Validated ${Object.keys(packageJson.scripts || {}).length} package scripts.`
);
