import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  V2B2_BENCHMARK_PHYSICAL_REQUEST_CAP,
  V2B2_CANARY_PHYSICAL_REQUEST_CAP,
  V2B2_MODELS,
  V2B2_PRIVATE_RELATIVE,
  auditLegacyV2B2Receipts,
  buildV2B2AggregateReport,
  checkAndFreezeV2B2,
  resumeV2B2Benchmark,
  runV2B2Benchmark,
  runV2B2Canary,
  verifyV2B2,
} from "../../src/domain/m2V2EvidencePilot/v2b2Runtime.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const command = process.argv[2] ?? "check";

try {
  if (command === "audit") {
    const result = auditLegacyV2B2Receipts(root);
    print({
      command,
      status: "ok",
      ...result.aggregate,
      privateStoreRole: V2B2_PRIVATE_RELATIVE,
      fullPilotAuthorized: false,
    });
  } else if (command === "check") {
    const result = checkAndFreezeV2B2(root);
    print({
      command,
      status: "ok",
      parentManifestDigest: result.parentManifestDigest,
      canaryManifestDigest: result.canaryManifestDigest,
      benchmarkManifestCreated: result.benchmarkManifestCreated,
      sampleCount: result.sampleCount,
      modelIds: V2B2_MODELS,
      logicalTaskCount: result.logicalTaskCount,
      plannedPhysicalRequestCount: result.plannedPhysicalRequestCount,
      benchmarkPhysicalRequestCap: V2B2_BENCHMARK_PHYSICAL_REQUEST_CAP,
      retryCount: 0,
      fullPilotAuthorized: false,
    });
  } else if (command === "benchmark") {
    const result = await runV2B2Benchmark(root);
    printBenchmark(command, result);
  } else if (command === "resume") {
    const result = await resumeV2B2Benchmark(root);
    printBenchmark(command, result);
  } else if (command === "canary") {
    const result = await runV2B2Canary(root);
    print({
      command,
      status: "ok",
      executionStatus: result.state.executionStatus,
      defaultModel: result.manifest.defaultModel,
      sampleCount: result.manifest.sampleCount,
      logicalTaskCount: result.manifest.logicalTaskCount,
      plannedPhysicalRequestCount: result.manifest.plannedPhysicalRequestCount,
      physicalRequestCap: V2B2_CANARY_PHYSICAL_REQUEST_CAP,
      providerConnectivity: result.evaluation.providerConnectivity.status,
      providerContractCompatibility: result.evaluation.providerContractCompatibility.status,
      modelEvidenceQuality: result.evaluation.modelEvidenceQuality.status,
      sourceGovernance: result.evaluation.sourceGovernance.status,
      fullPilotAuthorized: false,
      full160Executed: false,
    });
  } else if (command === "verify") {
    const result = verifyV2B2(root);
    print({
      command,
      status: result.allPassed ? "ok" : "failed",
      allPassed: result.allPassed,
      issueCount: result.issues.length,
      issues: result.issues,
      benchmarkPhysicalRequestCap: result.benchmarkPhysicalRequestCap,
      canaryPhysicalRequestCap: result.canaryPhysicalRequestCap,
      retryCount: result.retryCount,
      fullPilotAuthorized: false,
    });
    if (!result.allPassed) process.exitCode = 1;
  } else if (command === "report") {
    const report = buildV2B2AggregateReport(root);
    print({ command, status: "ok", ...report });
  } else {
    throw new Error(`unsupported_command:${command}`);
  }
} catch (error) {
  console.error(JSON.stringify({
    command,
    status: "failed",
    error: error instanceof Error ? error.message : "unknown_error",
    fullPilotAuthorized: false,
  }));
  process.exitCode = 1;
}

function printBenchmark(commandName, result) {
  print({
    command: commandName,
    status: "ok",
    executionStatus: result.state.executionStatus,
    sampleCount: result.manifest.sampleCount,
    logicalTaskCount: result.manifest.logicalTaskCount,
    plannedPhysicalRequestCount: result.manifest.plannedPhysicalRequestCount,
    physicalRequestCap: V2B2_BENCHMARK_PHYSICAL_REQUEST_CAP,
    retryCount: 0,
    providerConnectivity: result.evaluation.providerConnectivity.status,
    providerContractCompatibility: result.evaluation.providerContractCompatibility.status,
    modelEvidenceQuality: result.evaluation.modelEvidenceQuality.status,
    sourceGovernance: result.evaluation.sourceGovernance.status,
    modelDecisionStatus: result.decision.status,
    defaultModel: result.decision.defaultModel,
    upgradeModel: result.decision.upgradeModel,
    canaryRerunAuthorized: result.decision.canaryRerunAuthorized,
    fullPilotAuthorized: false,
  });
}

function print(value) {
  console.log(JSON.stringify(value));
}
