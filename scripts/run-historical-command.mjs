import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const lifecycle = JSON.parse(
  readFileSync(resolve(root, "config", "command-lifecycle.v0.1.json"), "utf8"),
);
const [acknowledgement, scriptName, ...forwardedArguments] = process.argv.slice(2);

if (acknowledgement !== "--acknowledge-archive-only" || !scriptName) {
  throw new Error(
    "usage: npm run history:m2 -- --acknowledge-archive-only <archive-script> [arguments]",
  );
}
if (!(lifecycle.archiveOnlyPrefixes ?? []).some((prefix) => scriptName.startsWith(prefix))) {
  throw new Error(`historical_dispatch_rejects_non_archive_command:${scriptName}`);
}
if (!Object.hasOwn(packageJson.scripts ?? {}, scriptName)) {
  throw new Error(`historical_command_missing:${scriptName}`);
}
if (!process.env.npm_execpath) {
  throw new Error("historical_dispatch_requires_npm_execpath");
}

process.stderr.write(
  `[ARCHIVE_ONLY] ${scriptName}; this preserves audit replay and grants no execution authorization.\n`,
);
const result = spawnSync(
  process.execPath,
  [process.env.npm_execpath, "run", scriptName, "--", ...forwardedArguments],
  {
    cwd: root,
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
  },
);
if (result.error) {
  throw result.error;
}
process.exitCode = result.status ?? 1;
