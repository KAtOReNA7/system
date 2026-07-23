import { spawnSync } from "node:child_process";
import { filesForTestProfile } from "./project-inventory.mjs";

const args = process.argv.slice(2);
const profileId = args[0];
const listOnly = args.includes("--list-json");

if (!profileId || args.some((arg, index) => index > 0 && arg !== "--list-json")) {
  console.error(
    "Usage: node tools/node/run-test-registry.mjs <profile> [--list-json]"
  );
  process.exit(2);
}

let selection;
try {
  selection = filesForTestProfile(profileId);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

if (selection.files.length === 0) {
  console.error(`empty_test_profile:${profileId}`);
  process.exit(1);
}

if (listOnly) {
  console.log(JSON.stringify(selection));
  process.exit(0);
}

console.log(
  JSON.stringify({
    status: "RUNNING",
    profile: profileId,
    suites: selection.suites,
    fileCount: selection.files.length,
    trackedTestCount: selection.trackedTestCount,
    concurrency: selection.concurrency
  })
);

const result = spawnSync(
  process.execPath,
  [
    "--test",
    `--test-concurrency=${selection.concurrency}`,
    ...selection.files
  ],
  {
    stdio: "inherit",
    shell: false,
    windowsHide: true
  }
);

process.exit(result.status ?? 1);
