import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { attestFormalReadonlyRequestV0_2 } from "./prove_m2_v2_verifier_readonly.mjs";
import { checkAndFreezeV2B8Contract, recordV2B8Pretest } from "../../src/domain/m2V2EvidencePilot/v2b8Contract.js";
import {
  readV2B8Results,
  rebuildV2B8DerivedArtifacts,
  runV2B8,
  verifyV2B8,
  writeV2B8PublicReports,
} from "../../src/domain/m2V2EvidencePilot/v2b8Runtime.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const command = process.argv[2] ?? "check";

try {
  if (command === "check") {
    const frozen = checkAndFreezeV2B8Contract(root);
    const testRun = spawnSync(process.execPath, ["--test", "test/m2-v2-v2b8.test.js"], {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    const receipt = recordV2B8Pretest(root, { exitCode: testRun.status, stdoutDigest: digest(String(testRun.stdout ?? "")), stderrDigest: digest(String(testRun.stderr ?? "")) });
    print({ command, status: receipt.allPassed ? "ok" : "failed", manifestDigest: frozen.contract.manifestDigest, repeatDigest: frozen.contract.repeatDigest, sourceBundleDigest: frozen.contract.sourceBundleDigest, failedQueryCount: frozen.forensic.public.failedQueryCount, pretestsPassed: receipt.allPassed, newTavilyPhysicalRequestCount: frozen.state.tavily.physicalRequestCount, newRelayPhysicalRequestCount: frozen.state.relay.physicalRequestCount, full160Authorized: false });
    if (!receipt.allPassed) process.exitCode = 1;
  } else if (command === "run" || command === "resume") {
    const results = await runV2B8(root, { resume: command === "resume", onProgress: progress });
    print(summary(command, results));
  } else if (command === "report") {
    const results = rebuildV2B8DerivedArtifacts(root);
    writeV2B8PublicReports(root);
    print(summary(command, results));
  } else if (command === "verify") {
    const receipt = verifyV2B8(root);
    const results = readV2B8Results(root);
    print({
      ...summary(command, results),
      status: receipt.allPassed ? "ok" : "failed",
      decision: receipt.currentRestatedDecision,
      historicalDecision: receipt.historicalDecision,
      historicalEvaluationVerified: receipt.historicalEvaluationVerified,
      currentRestatedDecision: receipt.currentRestatedDecision,
      currentRestatementVerified: receipt.currentRestatementVerified,
      effectiveReceiptsVerified: receipt.effectiveReceiptsVerified,
      currentAuthorityDigestVerified: receipt.currentAuthorityDigestVerified,
      transactionBindingVerified: receipt.transactionBindingVerified,
      providerRequestDelta: receipt.providerRequestDelta,
      verificationIssues: receipt.issues,
      ...loadReadonlyAttestation(),
    });
    if (!receipt.allPassed) process.exitCode = 1;
  } else {
    throw new Error(`v2b8_command_invalid:${command}`);
  }
} catch (error) {
  console.error(JSON.stringify({
    command,
    status: "failed",
    error: error instanceof Error ? error.message : "unknown_error",
    newTavilyPhysicalRequestCount: 0,
    newRelayPhysicalRequestCount: 0,
    historicalDecision: null,
    historicalEvaluationVerified: false,
    currentRestatedDecision: null,
    currentRestatementVerified: false,
    effectiveReceiptsVerified: false,
    currentAuthorityDigestVerified: false,
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

function progress(value) {
  const safe = { stage: value.stage, ordinal: value.ordinal, total: value.total, runKind: value.runKind, command: value.command };
  console.error(JSON.stringify(Object.fromEntries(Object.entries(safe).filter(([, item]) => item !== undefined))));
}

function summary(currentCommand, results) {
  return {
    command: currentCommand,
    status: "ok",
    phase: results.state.phase,
    decision: results.evaluation.decision,
    newTavilyPhysicalRequestCount: results.state.tavily.physicalRequestCount,
    newRelayPhysicalRequestCount: results.state.relay.physicalRequestCount,
    repairCount: results.state.relay.repairCount,
    full160Authorized: false,
  };
}
