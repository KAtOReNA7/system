import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { run } from "node:test";
import { fileURLToPath } from "node:url";

import {
  parseJsonUtf8Strict,
  sha256PortableText,
  validateCaseRegistry,
} from "./m2_v2_pr7_s1_contract.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CASE_REGISTRY_PATH = "config/m2-v2-pr7-s1-case-registry.v0.1.json";
const TEST_FILES = Object.freeze([
  "test/m2-v2-authority-graph.test.js",
  "test/m2-v2-verifier-readonly-proof.test.js",
  "test/m2-v2-private-state-migration.test.js",
  "test/m2-v2-v2b6-safe-cache.test.js",
  "test/m2-v2-v2b6-raw-cache-migration.test.js",
  "test/m2-v2-provider-transport-security.test.js",
  "test/m2-v2-event-tuple.test.js",
  "test/m2-v2-workbook-independent-verifier.test.js",
  "test/test-artifact-policy.test.js",
]);
const CASE_ID_PATTERN = /\bPR7-P[12]-\d{3}-[a-z0-9-]+\b/gu;

const platform = process.platform === "win32"
  ? "windows"
  : process.platform === "linux"
    ? "linux"
    : null;
if (platform === null) throw new Error(`b7_native_platform_unsupported:${process.platform}`);

const registryBytes = readFileSync(resolve(ROOT, CASE_REGISTRY_PATH));
const registry = parseJsonUtf8Strict(registryBytes);
const registrySummary = validateCaseRegistry(registry);
const allCaseIds = new Set(registry.cases.map((entry) => entry.caseId));
const expectedCaseIds = registry.cases
  .filter((entry) => entry.platforms.includes(platform))
  .map((entry) => entry.caseId)
  .sort(compareText);

const passingCaseIds = new Set();
const unexpectedCaseIds = new Set();
const failedTests = [];
const skippedTests = [];
let passedTestCount = 0;

const events = run({
  files: TEST_FILES.map((path) => resolve(ROOT, path)),
  concurrency: 1,
  isolation: "process",
});

for await (const event of events) {
  if (event.type === "test:pass") {
    passedTestCount += 1;
    if (event.data.skip !== undefined || event.data.todo !== undefined) {
      skippedTests.push(event.data.name);
      continue;
    }
    for (const caseId of String(event.data.name).match(CASE_ID_PATTERN) ?? []) {
      if (!allCaseIds.has(caseId)) unexpectedCaseIds.add(caseId);
      else passingCaseIds.add(caseId);
    }
  } else if (event.type === "test:fail") {
    failedTests.push({
      name: event.data.name,
      failureType: event.data.details?.error?.failureType ?? null,
      message: event.data.details?.error?.message ?? null,
    });
  }
}

const observedApplicableCaseIds = [...passingCaseIds]
  .filter((caseId) => expectedCaseIds.includes(caseId))
  .sort(compareText);
const missingCaseIds = expectedCaseIds.filter((caseId) => !passingCaseIds.has(caseId));
const outOfPlatformCaseIds = [...passingCaseIds]
  .filter((caseId) => !expectedCaseIds.includes(caseId))
  .sort(compareText);
const passed = failedTests.length === 0
  && skippedTests.length === 0
  && unexpectedCaseIds.size === 0
  && missingCaseIds.length === 0
  && outOfPlatformCaseIds.length === 0
  && observedApplicableCaseIds.length === (platform === "linux" ? registrySummary.linux : registrySummary.windows);

const receipt = {
  schema: "m2.v2.pr7-b7-full-regression-receipt.v0.1",
  passed,
  platform,
  caseRegistryPath: CASE_REGISTRY_PATH,
  caseRegistrySha256: sha256PortableText(registryBytes),
  registeredCaseCount: registrySummary.total,
  platformExpectedCaseCount: expectedCaseIds.length,
  platformPassedCaseCount: observedApplicableCaseIds.length,
  secondaryVerifierRequiredCaseCount: registrySummary.secondaryVerifierRequired,
  testFileCount: TEST_FILES.length,
  passedTestCount,
  failedTestCount: failedTests.length,
  skippedTestCount: skippedTests.length,
  missingCaseIds,
  outOfPlatformCaseIds,
  unexpectedCaseIds: [...unexpectedCaseIds].sort(compareText),
  failedTests,
  skippedTests,
  providerAllowed: false,
  privateStatePolicy: "SYNTHETIC_TEMP_ONLY",
};
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
if (!passed) process.exitCode = 1;

function compareText(left, right) {
  return String(left).localeCompare(String(right), "en");
}
