import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { attestFormalReadonlyRequestV0_2 } from "./prove_m2_v2_verifier_readonly.mjs";
import {
  checkAndFreezeV2B7Contract,
  recordV2B7Pretest,
} from "../../src/domain/m2V2EvidencePilot/v2b7Contract.js";
import {
  rebuildV2B7DerivedArtifacts,
  readV2B7Results,
  runV2B7,
  verifyV2B7,
  writeV2B7PublicReports,
} from "../../src/domain/m2V2EvidencePilot/v2b7Runtime.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const command = process.argv[2] ?? "check";

try {
  if (command === "check") {
    const frozen = checkAndFreezeV2B7Contract(root);
    const testRun = spawnSync(process.execPath, ["--test", "test/m2-v2-v2b7-contract.test.js", "test/m2-v2-v2b7.test.js"], {
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
      newTavilyPhysicalRequestCount: frozen.state.tavily.physicalRequestCount,
      newRelayPhysicalRequestCount: frozen.state.relay.physicalRequestCount,
      full160Authorized: false,
    });
    if (!receipt.allPassed) process.exitCode = 1;
  } else if (["run", "resume"].includes(command)) {
    const result = await runV2B7(root, {
      resume: command === "resume",
      onProgress: (progress) => console.error(JSON.stringify({ command, progress })),
    });
    print({
      command,
      status: "ok",
      decision: result.evaluation.decision,
      searchDecision: result.evaluation.searchDecision,
      extractionDecision: result.evaluation.extractionDecision,
      evidenceUsabilityDecision: result.evaluation.evidenceUsabilityDecision,
      newTavilyPhysicalRequestCount: result.state.tavily.physicalRequestCount,
      newRelayPhysicalRequestCount: result.state.relay.physicalRequestCount,
      full160Authorized: false,
    });
  } else if (command === "report") {
    const rebuilt = rebuildV2B7DerivedArtifacts(root);
    const result = writeV2B7PublicReports(root, rebuilt);
    print({ command, status: "ok", publicReportCount: result.publicReports.length, full160Authorized: false });
  } else if (command === "verify") {
    const result = verifyV2B7(root);
    print({
      command,
      status: result.allPassed ? "ok" : "failed",
      ...result,
      ...loadReadonlyAttestation(),
    });
    if (!result.allPassed) process.exitCode = 1;
  } else {
    throw new Error(`unsupported_command:${command}`);
  }
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

function loadReadonlyAttestation() {
  const requestPath = process.env.M2_V2_READONLY_FORMAL_REQUEST_PATH;
  return requestPath ? attestFormalReadonlyRequestV0_2(requestPath) : {};
}
