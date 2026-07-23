import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { NoProviderAdapter } from "../../src/domain/m2V2EvidencePilot/pilotCore.js";
import {
  PRIVATE_STORE_RELATIVE,
  checkAndFreezePilot,
  runPilot,
  verifyPilot,
  writePublicReports,
} from "../../src/domain/m2V2EvidencePilot/pilotRuntime.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const command = process.argv[2] ?? "check";

try {
  if (command === "check") {
    const result = await checkAndFreezePilot(root);
    print({
      command,
      status: "ok",
      manifestCreated: result.created,
      sampleCount: result.manifest.sample.length,
      populationCount: result.manifest.populationCount,
      manifestDigest: result.manifest.manifestDigest,
      allEffectiveTargetsAchieved: Object.values(result.manifest.targetAchievement).every((value) => value.achieved),
      privateStoreRole: PRIVATE_STORE_RELATIVE,
    });
  } else if (command === "run" || command === "resume") {
    const provider = selectProvider();
    const result = await runPilot(root, { provider, runMode: command });
    print({
      command,
      status: "ok",
      pilotExecutionStatus: result.state.executionStatus,
      sampleCount: result.state.sampleCount,
      plannedQueryCount: result.state.plannedQueryCount,
      dispatchedQueryCount: result.state.dispatchedQueryCount,
      resultCount: result.state.resultCount,
      pageCount: result.state.pageCount,
      evidenceCount: result.state.evidenceCount,
      cacheHitCount: result.state.cacheHitCount,
      providerMode: result.state.providerMode,
    });
  } else if (command === "verify") {
    const result = verifyPilot(root);
    print({
      command,
      status: "ok",
      issueCount: result.issues.length,
      hardGatePassedCount: result.hardGate.passedCount,
      hardGateTotalCount: result.hardGate.totalCount,
      allHardGatesPassed: result.hardGate.allPassed,
      verificationDigest: result.verificationDigest,
    });
  } else if (command === "report") {
    const result = writePublicReports(root);
    print({
      command,
      status: "ok",
      pilotExecutionStatus: result.summary.pilotExecutionStatus,
      decision: result.gate.decision,
      hardGatePassedCount: result.gate.hardGate.passedCount,
      hardGateTotalCount: result.gate.hardGate.totalCount,
      prospectiveShadowReadiness: result.gate.prospectiveShadowReadiness,
    });
  } else {
    throw new Error(`unsupported_command:${command}`);
  }
} catch (error) {
  console.error(JSON.stringify({ command, status: "failed", error: error.message }));
  process.exitCode = 1;
}

function selectProvider() {
  const configuredMode = String(process.env.M2_V2_EVIDENCE_PROVIDER ?? "").trim();
  const knownCredentialPresent = [
    "OPENAI_API_KEY",
    "BING_SEARCH_API_KEY",
    "BRAVE_SEARCH_API_KEY",
    "SERPAPI_API_KEY",
    "SERPAPI_KEY",
    "TAVILY_API_KEY",
    "GOOGLE_SEARCH_API_KEY",
  ].some((name) => Boolean(process.env[name]));

  if (!configuredMode && !knownCredentialPresent) {
    return new NoProviderAdapter({ reason: "no_authorized_provider_credentials_or_allowlist" });
  }
  return new NoProviderAdapter({ reason: "configured_provider_has_no_approved_runtime_adapter_or_domain_allowlist" });
}

function print(value) {
  console.log(JSON.stringify(value));
}
