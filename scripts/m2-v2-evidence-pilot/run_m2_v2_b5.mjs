import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { attestFormalReadonlyRequestV0_2 } from "./prove_m2_v2_verifier_readonly.mjs";
import {
  V2B5_RELAY_REQUEST_CAP,
  V2B5_TAVILY_REQUEST_CAP,
  checkAndFreezeV2B5,
  readV2B5Results,
  recordV2B5ExecutionBlock,
  runV2B5,
  runV2B5CapabilityAuditProbe,
  runV2B5FullValidation,
  verifyV2B5,
  writeV2B5PublicReports,
} from "../../src/domain/m2V2EvidencePilot/v2b5Runtime.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const command = process.argv[2] ?? "check";

try {
  if (command === "check") {
    const result = checkAndFreezeV2B5(root);
    print({
      command,
      status: "ok",
      benchmarkManifestDigest: result.benchmarkManifest.benchmarkManifestDigest,
      canaryManifestDigest: result.canaryManifest.manifestDigest,
      fixedSampleCount: result.canaryManifest.sampleCount,
      fixedRepeatCount: result.canaryManifest.repeatSampleCount,
      tavilyApiKeyConfigured: result.config.tavilyApiKeyConfigured,
      relayApiKeyConfigured: result.config.relayApiKeyConfigured,
      tavilyRequestCap: V2B5_TAVILY_REQUEST_CAP,
      relayRequestCap: V2B5_RELAY_REQUEST_CAP,
      full160Authorized: false,
    });
  } else if (command === "probe") {
    const result = await runV2B5CapabilityAuditProbe(root);
    print({
      command,
      status: "ok",
      tavilyProviderDecision: result.capability.tavilyProviderDecision,
      dispatchAttempted: result.capability.finalResult?.dispatched === true,
      httpStatus: result.capability.finalResult?.providerReceipt?.httpStatus ?? null,
      contractValid: result.capability.finalResult?.contractValid === true,
      resultCount: result.capability.finalResult?.resultCount ?? 0,
      tavilyPhysicalRequestCount: result.state.tavily.physicalRequestCount,
      relayPhysicalRequestCount: result.state.relay.physicalRequestCount,
      full160Authorized: false,
    });
  } else if (command === "run" || command === "resume") {
    const result = await runV2B5(root, {
      resume: command === "resume",
      onProgress: (progress) => console.error(JSON.stringify({ command, progress })),
    });
    print({
      command,
      status: "ok",
      tavilyProviderDecision: result.capability.tavilyProviderDecision,
      extractionBenchmarkDecision: result.benchmarkEvaluation?.extractionBenchmarkDecision ?? "BLOCKED",
      defaultExtractionModel: result.benchmarkEvaluation?.defaultExtractionModel ?? null,
      canaryExecuted: result.canaryEvaluation.executed === true,
      canaryDecision: result.canaryEvaluation.decision,
      tavilyPhysicalRequestCount: result.state.tavily.physicalRequestCount,
      relayPhysicalRequestCount: result.state.relay.physicalRequestCount,
      full160Authorized: false,
    });
  } else if (command === "block") {
    const result = recordV2B5ExecutionBlock(root);
    print({
      command,
      status: "ok",
      tavilyProviderDecision: result.capability.tavilyProviderDecision,
      canaryExecuted: false,
      canaryDecision: result.canaryEvaluation.decision,
      tavilyPhysicalRequestCount: result.state.tavily.physicalRequestCount,
      relayPhysicalRequestCount: result.state.relay.physicalRequestCount,
      full160Authorized: false,
    });
  } else if (command === "validate") {
    const result = runV2B5FullValidation(root, {
      onProgress: (progress) => console.error(JSON.stringify({ command, progress })),
    });
    print({
      command,
      status: result.allPassed ? "ok" : "failed",
      allPassed: result.allPassed,
      executedCommandCount: result.executedCommandCount,
      expectedCommandCount: result.expectedCommandCount,
      full160Authorized: false,
    });
    if (!result.allPassed) process.exitCode = 1;
  } else if (command === "report") {
    const result = writeV2B5PublicReports(root, readV2B5Results(root));
    print({ command, status: "ok", publicReportCount: result.publicReports.length, full160Authorized: false });
  } else if (command === "verify") {
    const result = verifyV2B5(root);
    const readonlyAttestation = loadReadonlyAttestation();
    print({
      command,
      status: result.allPassed ? "ok" : "failed",
      allPassed: result.allPassed,
      issueCount: result.issues.length,
      issues: result.issues,
      finalDecision: result.finalDecision,
      full160Authorized: false,
      ...readonlyAttestation,
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

function loadReadonlyAttestation() {
  const requestPath = process.env.M2_V2_READONLY_FORMAL_REQUEST_PATH;
  return requestPath ? attestFormalReadonlyRequestV0_2(requestPath) : {};
}
