import { badRequest } from "../errors.js";
import {
  buildExportPackage,
  summarizeExportPackages,
  transitionReleaseGate
} from "../domain/oldProductEvaluation/exportReleaseGate.js";
import {
  M2_EXPORT_RELEASE_GATE_CASES,
  M2_EXPORT_RELEASE_GATE_DATASET,
  M2_EXPORT_RELEASE_GATE_FIXTURE_PACKAGES
} from "../../test/fixtures/m2ExportReleaseGate.fixture.js";

const ALLOWED_QUERY_KEYS = new Set([
  "page",
  "pageSize",
  "eligibility",
  "releaseStatus",
  "caseId"
]);

const ELIGIBILITY_STATUSES = ["eligible", "blocked"];
const RELEASE_STATUSES = [
  "draft",
  "pending_approval",
  "approved_for_export",
  "rejected",
  "released",
  "rolled_back",
  "invalidated"
];

export async function listM2ExportFixtures(_config, { pagination, searchParams }) {
  validateQueryKeys(searchParams);
  const filtered = applyFilters(M2_EXPORT_RELEASE_GATE_FIXTURE_PACKAGES, searchParams);
  return withDataset({
    items: paginate(filtered.map(toExportSummary), pagination),
    pagination: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total: filtered.length
    },
    workflowSummary: summarizeExportPackages(filtered)
  });
}

export async function getM2ExportFixtureById(_config, exportId) {
  const item = M2_EXPORT_RELEASE_GATE_FIXTURE_PACKAGES.find(
    (candidate) => candidate.exportId === exportId
  );
  if (!item) {
    return null;
  }
  return withDataset({
    item: toExportDetail(item)
  });
}

export async function createM2ExportFixture(_config, payload) {
  const caseId = requireString(payload?.caseId, "caseId");
  const exportCase = M2_EXPORT_RELEASE_GATE_CASES.find((item) => item.caseId === caseId);
  if (!exportCase) {
    throw badRequest("caseId is not supported");
  }
  const nextPackage = buildExportPackage({
    ...clone(exportCase.input),
    generatedAt: "2026-06-22T03:00:00.000Z"
  });
  return withDataset({
    caseId,
    item: toExportDetail(nextPackage),
    eligibility: nextPackage.eligibility
  });
}

export async function simulateM2ExportAction(_config, exportId, payload) {
  const item = M2_EXPORT_RELEASE_GATE_FIXTURE_PACKAGES.find(
    (candidate) => candidate.exportId === exportId
  );
  if (!item) {
    return null;
  }
  const action = requireString(payload?.action, "action");
  const actor = requireString(payload?.actor ?? "SYN-FIXTURE-OPERATOR", "actor");
  const reason = requireString(payload?.reason ?? "Fixture-only export release gate simulation", "reason");
  const releaseState = compatibleReleaseState(item, action);
  let result;
  try {
    result = transitionReleaseGate(releaseState, action, actor, reason, {
      transitionedAt: "2026-06-22T03:10:00.000Z"
    });
  } catch (error) {
    throw badRequest(error.message);
  }
  return withDataset({
    exportId,
    action,
    ...result
  });
}

export function getM2ExportFixtureDataset() {
  return clone(M2_EXPORT_RELEASE_GATE_DATASET);
}

function withDataset(body) {
  return {
    dataset: getM2ExportFixtureDataset(),
    mode: "fixture",
    notForFormalDecision: true,
    formalEvaluationExecuted: false,
    databaseWritten: false,
    mappingVersionActivated: false,
    switchMappingVersionCalled: false,
    formalExportCreated: false,
    ...clone(body)
  };
}

function applyFilters(items, searchParams) {
  const eligibility = searchParams.get("eligibility");
  const releaseStatus = searchParams.get("releaseStatus");
  const caseId = searchParams.get("caseId");

  validateAllowedValue(eligibility, ELIGIBILITY_STATUSES, "eligibility");
  validateAllowedValue(releaseStatus, RELEASE_STATUSES, "releaseStatus");

  return items.filter((item) =>
    (!eligibility || item.eligibility.exportEligibilityStatus === eligibility) &&
    (!releaseStatus || item.releaseGate.status === releaseStatus) &&
    (!caseId || item.exportId.includes(caseId))
  );
}

function compatibleReleaseState(item, action) {
  const releaseGate = {
    ...clone(item.releaseGate),
    exportId: item.exportId,
    exportEligibilityStatus: item.eligibility.exportEligibilityStatus
  };
  if (action === "submit_for_approval") {
    return { ...releaseGate, status: "draft" };
  }
  if (action === "approve_export" || action === "reject_export") {
    return { ...releaseGate, status: "pending_approval" };
  }
  if (action === "release") {
    return { ...releaseGate, status: "approved_for_export" };
  }
  if (action === "rollback") {
    return { ...releaseGate, status: "released" };
  }
  if (action === "invalidate") {
    return { ...releaseGate, status: "approved_for_export" };
  }
  return releaseGate;
}

function toExportSummary(item) {
  return {
    exportId: item.exportId,
    standardWorkId: item.payload.standardWorkId,
    rating: item.payload.rating,
    lifecycle: item.payload.lifecycle,
    reviewStatus: item.payload.reviewStatus,
    readinessStatus: item.payload.readinessStatus,
    exportEligibilityStatus: item.eligibility.exportEligibilityStatus,
    releaseStatus: item.releaseGate.status,
    forbiddenFieldCount: item.eligibility.forbiddenFieldCheck.detectedFields.length,
    notForFormalDecision: item.notForFormalDecision,
    formalEvaluationExecuted: item.formalEvaluationExecuted,
    databaseWritten: item.databaseWritten,
    formalExportCreated: item.formalExportCreated
  };
}

function toExportDetail(item) {
  return clone(item);
}

function validateQueryKeys(searchParams) {
  for (const key of searchParams.keys()) {
    if (!ALLOWED_QUERY_KEYS.has(key)) {
      throw badRequest(`filter ${key} is not supported`);
    }
  }
}

function validateAllowedValue(value, allowed, name) {
  if (value && !allowed.includes(value)) {
    throw badRequest(`${name} is not supported`);
  }
}

function requireString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw badRequest(`${name} is required`);
  }
  return value.trim();
}

function paginate(items, pagination) {
  const start = (pagination.page - 1) * pagination.pageSize;
  return items.slice(start, start + pagination.pageSize);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
