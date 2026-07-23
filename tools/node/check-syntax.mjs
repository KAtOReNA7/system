import { spawnSync } from "node:child_process";
import {
  listProjectJavaScriptFiles,
  listTrackedJavaScriptFiles
} from "./project-inventory.mjs";

const args = new Set(process.argv.slice(2));
const allowedArgs = new Set(["--json"]);
for (const arg of args) {
  if (!allowedArgs.has(arg)) {
    console.error(`unknown_argument:${arg}`);
    process.exit(2);
  }
}

const files = listProjectJavaScriptFiles();
const trackedFiles = listTrackedJavaScriptFiles();
if (files.length === 0) {
  console.error("tracked_javascript_inventory_empty");
  process.exit(1);
}

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], {
    stdio: args.has("--json") ? "pipe" : "inherit",
    encoding: "utf8",
    windowsHide: true
  });
  if (result.status !== 0) {
    if (args.has("--json")) {
      process.stderr.write(result.stderr || result.stdout || "");
    }
    process.exit(result.status ?? 1);
  }
}

if (args.has("--json")) {
  console.log(
    JSON.stringify({
      status: "PASS",
      projectJavaScriptFileCount: files.length,
      trackedJavaScriptFileCount: trackedFiles.length,
      files
    })
  );
} else {
  console.log(
    `Checked all ${files.length} tracked and nonignored JavaScript files.`
  );
}
