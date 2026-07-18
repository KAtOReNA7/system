import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkAndFreezeV2B8Contract, recordV2B8Pretest } from "../../src/domain/m2V2EvidencePilot/v2b8Contract.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const command = process.argv[2] ?? "check";

try {
  if (command !== "check") throw new Error(`v2b8_command_not_available_before_phase_a:${command}`);
  const frozen = checkAndFreezeV2B8Contract(root);
  const testRun = spawnSync(process.execPath, ["--test", "test/m2-v2-v2b8.test.js"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    timeout: 120_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  const receipt = recordV2B8Pretest(root, {
    exitCode: testRun.status,
    stdoutDigest: digest(String(testRun.stdout ?? "")),
    stderrDigest: digest(String(testRun.stderr ?? "")),
  });
  print({
    command,
    status: receipt.allPassed ? "ok" : "failed",
    manifestDigest: frozen.contract.manifestDigest,
    repeatDigest: frozen.contract.repeatDigest,
    sourceBundleDigest: frozen.contract.sourceBundleDigest,
    failedQueryCount: frozen.forensic.public.failedQueryCount,
    pretestsPassed: receipt.allPassed,
    newTavilyPhysicalRequestCount: frozen.state.tavily.physicalRequestCount,
    newRelayPhysicalRequestCount: frozen.state.relay.physicalRequestCount,
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
