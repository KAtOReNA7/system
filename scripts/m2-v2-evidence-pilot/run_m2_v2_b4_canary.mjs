import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  V2B4_REQUEST_CAP,
  checkAndFreezeV2B4,
  readV2B4Evaluation,
  runV2B4Canary,
  verifyV2B4,
  writeV2B4PublicReports,
} from "../../src/domain/m2V2EvidencePilot/v2b4Runtime.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const command = process.argv[2] ?? "check";

try {
  if (command === "check") {
    const result = checkAndFreezeV2B4(root);
    print({
      command,
      status: "ok",
      manifestDigest: result.manifest.manifestDigest,
      canaryManifestDigest: result.manifest.canaryManifestDigest,
      sampleCount: result.manifest.sampleCount,
      repeatSampleCount: result.manifest.repeatSampleCount,
      plannedPhysicalRequestCount: result.manifest.plannedPhysicalRequestCount,
      physicalRequestCap: V2B4_REQUEST_CAP,
      retryCount: 0,
      researchAllowlistCount: result.policy.researchAllowlist.approvedDomainEntries.length,
      modelAllowlistCount: result.policy.modelAllowlist.approvedDomainEntries.length,
      full160Authorized: false,
    });
  } else if (command === "run" || command === "resume") {
    const result = await runV2B4Canary(root, {
      resume: command === "resume",
      onProgress: (progress) => console.error(JSON.stringify({ command, progress })),
    });
    print({
      command,
      status: "ok",
      executionStatus: result.state.executionStatus,
      completedPhysicalReceiptCount: result.state.completedPhysicalReceiptCount,
      dispatchedPhysicalRequestCount: result.state.dispatchedPhysicalRequestCount,
      preliminaryDecision: result.evaluation.gate.preliminaryDecision,
      gatePassedCount: result.evaluation.gate.passedCount,
      gateTotalCount: result.evaluation.gate.totalCount,
      full160Authorized: false,
    });
  } else if (command === "report") {
    const evaluation = readV2B4Evaluation(root);
    const result = writeV2B4PublicReports(root, evaluation);
    print({
      command,
      status: "ok",
      finalDecision: evaluation.gate.finalDecision ?? evaluation.gate.preliminaryDecision,
      publicReportCount: result.publicReports.length,
      full160Authorized: evaluation.gate.full160Authorized === true,
    });
  } else if (command === "verify") {
    const result = verifyV2B4(root);
    print({
      command,
      status: result.allPassed ? "ok" : "failed",
      allPassed: result.allPassed,
      issueCount: result.issues.length,
      issues: result.issues,
      full160Authorized: false,
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
    full160Authorized: false,
  }));
  process.exitCode = 1;
}

function print(value) {
  console.log(JSON.stringify(value));
}
