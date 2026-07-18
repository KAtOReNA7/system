import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkAndFreezeV2B7Contract,
  recordV2B7Pretest,
} from "../../src/domain/m2V2EvidencePilot/v2b7Contract.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const command = process.argv[2] ?? "check";

try {
  if (command !== "check") throw new Error(`unsupported_phase_a_command:${command}`);
  const frozen = checkAndFreezeV2B7Contract(root);
  const testRun = spawnSync(process.execPath, ["--test", "test/m2-v2-v2b7-contract.test.js"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    timeout: 120_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  const receipt = recordV2B7Pretest(root, {
    exitCode: testRun.status,
    stdoutDigest: digest(String(testRun.stdout ?? "")),
    stderrDigest: digest(String(testRun.stderr ?? "")),
  });
  print({
    command,
    status: receipt.allPassed ? "ok" : "failed",
    manifestDigest: frozen.publicContract.population.manifestDigest,
    repeatDigest: frozen.publicContract.population.repeatDigest,
    sourceBundleDigest: frozen.publicContract.frozenSourceBundle.bundleDigest,
    overlapCount: frozen.publicContract.frozenSourceBundle.benchmarkCanaryOverlapCount,
    pretestsPassed: receipt.allPassed,
    newTavilyPhysicalRequestCount: 0,
    newRelayPhysicalRequestCount: 0,
    full160Authorized: false,
  });
  if (!receipt.allPassed) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({
    command,
    status: "failed",
    error: error instanceof Error ? error.message : "unknown_error",
    newTavilyPhysicalRequestCount: 0,
    newRelayPhysicalRequestCount: 0,
    full160Authorized: false,
  }));
  process.exitCode = 1;
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function print(value) {
  console.log(JSON.stringify(value));
}
