import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  PRIVATE_CANARY_RELATIVE,
  checkAndFreezeCanary,
  runCanary,
  verifyCanary,
  writeCanaryReports,
} from "../../src/domain/m2V2EvidencePilot/canaryRuntime.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const command = process.argv[2] ?? "check";

try {
  if (command === "check") {
    const result = checkAndFreezeCanary(root);
    print({
      command,
      status: "ok",
      manifestCreated: result.created,
      canaryCount: result.manifest.sampleCount,
      repeatWorkCount: result.manifest.repeatSample.length,
      plannedRequestCount: result.manifest.requestBudget.plannedTotalRequests,
      requestCap: result.manifest.requestBudget.maxTotalRequests,
      parentManifestDigest: result.manifest.parentManifestDigest,
      canaryManifestDigest: result.manifest.canaryManifestDigest,
      allCoverageDimensionsMet: Object.values(result.manifest.coverage).every(Boolean),
      privateStoreRole: PRIVATE_CANARY_RELATIVE,
    });
  } else if (command === "run" || command === "resume") {
    const result = await runCanary(root, { runMode: command });
    print({
      command,
      status: "ok",
      executionStatus: result.state.executionStatus,
      canaryCount: result.manifest.sampleCount,
      requestCount: result.state.requestCount,
      successCount: result.state.contractSuccessCount,
      relayDeclaredSuccessCount: result.state.successCount,
      candidateEvidenceCount: result.state.candidateEvidenceCount,
      acceptedEvidenceCount: result.state.acceptedEvidenceCount,
      repeatWorkCount: result.reproducibility.repeatWorkCount,
    });
  } else if (command === "verify") {
    const result = verifyCanary(root);
    print({
      command,
      status: "ok",
      issueCount: result.verification.issues.length,
      validationPassedCount: result.verification.fullValidation.passedCount,
      validationCommandCount: result.verification.fullValidation.commandCount,
      decision: result.decision.decision,
      allowFull160Pilot: result.decision.allowFull160Pilot,
    });
  } else if (command === "report") {
    const reports = writeCanaryReports(root);
    print({
      command,
      status: "ok",
      decision: reports.decision.decision,
      allowFull160Pilot: reports.decision.allowFull160Pilot,
      requestCount: reports.execution.retrieval.requestCount,
      successCount: reports.execution.retrieval.successCount,
      acceptedEvidenceCount: reports.execution.evidence.acceptedCount,
    });
  } else {
    throw new Error(`unsupported_command:${command}`);
  }
} catch (error) {
  console.error(JSON.stringify({ command, status: "failed", error: error.message }));
  process.exitCode = 1;
}

function print(value) {
  console.log(JSON.stringify(value));
}
