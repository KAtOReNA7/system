#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  HPSR_IMPLEMENTED_STATUS,
  validateHeadProtectedSegmentedRouterContract,
  validateHpsrImplementationReadiness,
  validateHpsrLaterOriginAvailability,
  validateHpsrOpenedOriginSemantics,
  validateHpsrResidualBoundProvenance,
  validateHpsrSelectionAttribution
} from "../../src/domain/m2Current/headProtectedSegmentedRouter.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const config = readJson(
  "config/m2-current-head-protected-segmented-router.v0.1.json"
);
const attribution = readJson(
  config.publicOutputs.selectionAttributionJson
);
const availability = readJson(config.publicOutputs.availabilityJson);
const openedSemantics = readJson(
  config.publicOutputs.openedOriginSemanticsJson
);
const residualBoundProvenance = readJson(
  config.publicOutputs.residualBoundProvenanceJson
);
const implementationReadiness = readJson(
  config.publicOutputs.implementationReadinessJson
);
const retrospectiveReadiness = readJson(
  config.publicOutputs.retrospectiveReadinessJson
);

if (!process.argv.includes("--verify")) {
  throw new Error("hpsr_readiness_mode_required_use_verify");
}

for (const result of [
  validateHeadProtectedSegmentedRouterContract(config),
  validateHpsrSelectionAttribution(attribution),
  validateHpsrLaterOriginAvailability(availability),
  validateHpsrOpenedOriginSemantics(openedSemantics),
  validateHpsrResidualBoundProvenance(residualBoundProvenance),
  validateHpsrImplementationReadiness(implementationReadiness)
]) {
  if (!result.valid) {
    throw new Error(result.errors.join(","));
  }
}

const report = readText(config.publicOutputs.availabilityReport);
const preregistration = readText(config.publicOutputs.preregistration);
const openedSemanticsReport = readText(
  config.publicOutputs.openedOriginSemanticsReport
);
const prospectiveHoldoutReport = readText(
  config.publicOutputs.prospectiveFinalHoldoutReport
);
const residualBoundReport = readText(
  config.publicOutputs.residualBoundProvenanceReport
);
const implementationReadinessReport = readText(
  config.publicOutputs.implementationReadinessReport
);
const retrospectiveReadinessReport = readText(
  config.publicOutputs.retrospectiveReadinessReport
);
if (
  !report.includes(HPSR_IMPLEMENTED_STATUS)
  || !preregistration.includes(HPSR_IMPLEMENTED_STATUS)
  || !implementationReadinessReport.includes(HPSR_IMPLEMENTED_STATUS)
  || [
    report,
    preregistration,
    openedSemanticsReport,
    prospectiveHoldoutReport,
    residualBoundReport,
    implementationReadinessReport,
    retrospectiveReadinessReport
  ].some((value) => (
    value.includes("data/private-output/")
    || /[A-Z]:[\\/]/u.test(value)
  ))
) {
  throw new Error("hpsr_public_report_status_or_privacy_boundary_invalid");
}
if (
  retrospectiveReadiness?.retrospectiveReplayReady !== true
  || retrospectiveReadiness?.independentK2Ready !== false
  || retrospectiveReadiness?.auditBoundary
    ?.newFutureActualAmountsRead !== false
  || retrospectiveReadiness?.auditBoundary?.modelEvaluationRun !== false
) {
  throw new Error("hpsr_retrospective_readiness_invalid");
}

process.stdout.write(
  "M2 HPSR K1 implementation, retrospective readiness, and conditional K2 readiness verified.\n"
);

function readJson(repositoryRelativePath) {
  return JSON.parse(readText(repositoryRelativePath));
}

function readText(repositoryRelativePath) {
  return readFileSync(path.join(root, repositoryRelativePath), "utf8")
    .replaceAll("\r\n", "\n");
}
