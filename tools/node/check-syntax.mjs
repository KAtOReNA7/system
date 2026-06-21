import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const roots = ["src", "test", "tools/node"];
const files = [];

function collectJavaScriptFiles(directory) {
  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      collectJavaScriptFiles(fullPath);
    } else if (entry.endsWith(".js") || entry.endsWith(".mjs")) {
      files.push(fullPath);
    }
  }
}

for (const root of roots) {
  collectJavaScriptFiles(root);
}

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], {
    stdio: "inherit"
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(`Checked ${files.length} JavaScript files.`);
