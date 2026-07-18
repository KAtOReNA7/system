import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  V2B6_RELAY_REQUEST_CAP,
  checkAndFreezeV2B6,
  readV2B6Results,
  runV2B6,
  verifyV2B6,
  writeV2B6PublicReports,
} from "../../src/domain/m2V2EvidencePilot/v2b6Runtime.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const command = process.argv[2] ?? "check";

try {
  if (command === "check") {
    const result = checkAndFreezeV2B6(root);
    print({
      command,
      status: "ok",
      sourceBundleDigest: result.bundle.sourceBundleDigest,
      workCount: result.bundle.workCount,
      sourceRecordCount: result.bundle.sourceRecordCount,
      newTavilyPhysicalRequestCount: 0,
      relayRequestCap: V2B6_RELAY_REQUEST_CAP,
      extractionTimeoutMs: result.config.timeoutMs,
      canaryExecuted: false,
      full160Authorized: false,
    });
  } else if (command === "run") {
    const result = await runV2B6(root, {
      onProgress: (progress) => console.error(JSON.stringify({ command, progress })),
    });
    print({
      command,
      status: "ok",
      benchmarkDecision: result.evaluation.benchmarkDecision,
      defaultExtractionModel: result.evaluation.defaultExtractionModel,
      escalationModel: result.evaluation.escalationModel,
      sourceBundleDigest: result.evaluation.sourceBundleDigest,
      newTavilyPhysicalRequestCount: 0,
      relayPhysicalRequestCount: result.state.physicalRelayRequestCount,
      canaryExecuted: false,
      full160Authorized: false,
    });
  } else if (command === "report") {
    const result = writeV2B6PublicReports(root, readV2B6Results(root));
    print({ command, status: "ok", publicReportCount: result.publicReports.length, canaryExecuted: false, full160Authorized: false });
  } else if (command === "verify") {
    const result = verifyV2B6(root);
    print({ command, status: result.allPassed ? "ok" : "failed", ...result });
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
    canaryExecuted: false,
    full160Authorized: false,
  }));
  process.exitCode = 1;
}

function print(value) {
  console.log(JSON.stringify(value));
}
