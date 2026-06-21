import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import http from "node:http";
import test from "node:test";
import { createApp } from "../src/http/app.js";
import {
  buildExportPackage,
  evaluateExportEligibility,
  summarizeExportPackages,
  transitionReleaseGate
} from "../src/domain/oldProductEvaluation/exportReleaseGate.js";
import {
  createM2ExportFixture,
  getM2ExportFixtureById,
  listM2ExportFixtures,
  simulateM2ExportAction
} from "../src/repositories/m2ExportFixtureRepository.js";
import {
  FORBIDDEN_M2_EXPORT_RELEASE_GATE_TOKENS,
  M2_EXPORT_RELEASE_GATE_CASES,
  M2_EXPORT_RELEASE_GATE_FIXTURE_PACKAGES,
  M2_EXPORT_RELEASE_GATE_FLOW_FIXTURES
} from "./fixtures/m2ExportReleaseGate.fixture.js";

const baseConfig = {
  service: "m1-audiobook-evaluation",
  appEnv: "test",
  port: 0,
  database: {
    rwUrl: undefined,
    readonlyUrl: undefined,
    backgroundUrl: undefined
  }
};

const fixtureExportPath = "/api/m2/fixture/exports";

async function request(path, options = {}) {
  const app = createApp(baseConfig);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...(options.headers ?? {})
      }
    });
    return {
      statusCode: response.status,
      requestId: response.headers.get("x-request-id"),
      cacheControl: response.headers.get("cache-control"),
      body: await response.json()
    };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function caseInput(caseId) {
  return M2_EXPORT_RELEASE_GATE_CASES.find((item) => item.caseId === caseId).input;
}

function assertFixtureGuardFlags(body) {
  assert.equal(body.mode, "fixture");
  assert.equal(body.notForFormalDecision, true);
  assert.equal(body.formalEvaluationExecuted, false);
  assert.equal(body.databaseWritten, false);
  assert.equal(body.mappingVersionActivated, false);
  assert.equal(body.switchMappingVersionCalled, false);
  assert.equal(body.formalExportCreated, false);
}

test("eligible package can enter pending approval", () => {
  const pkg = buildExportPackage(caseInput("eligible_export_package"));
  assert.equal(pkg.eligibility.exportEligibilityStatus, "eligible");
  assert.equal(pkg.packageStatus, "draft");
  assertFixtureGuardFlags(pkg);

  const submitted = transitionReleaseGate(
    {
      ...pkg.releaseGate,
      exportId: pkg.exportId,
      exportEligibilityStatus: pkg.eligibility.exportEligibilityStatus
    },
    "submit_for_approval",
    "SYN-ACTOR-001",
    "Synthetic submit"
  );
  assert.equal(submitted.releaseGate.status, "pending_approval");
  assert.equal(submitted.auditEvent.action, "submit_for_approval");
  assertFixtureGuardFlags(submitted);
});

test("blocked readiness cannot export", () => {
  const eligibility = evaluateExportEligibility(caseInput("blocked_readiness"));
  assert.equal(eligibility.exportEligibilityStatus, "blocked");
  assert.ok(eligibility.blockingReasons.some((item) => item.code === "readiness_blocked"));
});

test("pending blocking review cannot export", () => {
  const eligibility = evaluateExportEligibility(caseInput("pending_blocking_review"));
  assert.equal(eligibility.exportEligibilityStatus, "blocked");
  assert.ok(eligibility.blockingReasons.some((item) => item.code === "blocking_review_not_approved"));
});

test("waiver-granted review can export", () => {
  const pkg = buildExportPackage(caseInput("waiver_granted_review"));
  assert.equal(pkg.eligibility.exportEligibilityStatus, "eligible");
  assert.equal(pkg.payload.reviewStatus, "approved_or_waived");
});

test("downlist and renewal require manual confirmation", () => {
  const downlist = evaluateExportEligibility(caseInput("downlist_requires_confirmation"));
  const renewal = evaluateExportEligibility(caseInput("renewal_requires_confirmation"));
  assert.ok(downlist.blockingReasons.some((item) => item.code === "downlist_manual_confirmation_missing"));
  assert.ok(renewal.blockingReasons.some((item) => item.code === "renewal_manual_confirmation_missing"));
});

test("forbidden field detection blocks synthetic package", () => {
  const pkg = buildExportPackage(caseInput("forbidden_field_detection"));
  assert.equal(pkg.eligibility.exportEligibilityStatus, "blocked");
  assert.deepEqual(pkg.eligibility.forbiddenFieldCheck.detectedFields, ["rawBillRows"]);
  assert.equal(pkg.payload.rawBillRows, undefined);
});

test("notForFormalDecision remains visible and formal-style release is blocked when formal evaluation did not run", () => {
  const visible = buildExportPackage(caseInput("not_for_formal_decision_visible"));
  assert.equal(visible.notForFormalDecision, true);
  assert.equal(visible.payload.notForFormalDecision, true);
  assert.equal(visible.payload.formalEvaluationExecuted, false);

  const formalStyle = buildExportPackage(caseInput("formal_style_release_blocked"));
  assert.equal(formalStyle.eligibility.exportEligibilityStatus, "blocked");
  assert.ok(formalStyle.eligibility.blockingReasons.some((item) => item.code === "formal_evaluation_not_executed"));
  assert.equal(formalStyle.formalExportCreated, false);
});

test("approve release rollback and invalidate generate audit events", () => {
  const { pendingRelease, approvedRelease, releasedRelease, rolledBackRelease, invalidatedRelease } =
    M2_EXPORT_RELEASE_GATE_FLOW_FIXTURES;

  assert.equal(pendingRelease.status, "pending_approval");
  assert.equal(approvedRelease.status, "approved_for_export");
  assert.equal(releasedRelease.status, "released");
  assert.equal(rolledBackRelease.status, "rolled_back");
  assert.equal(invalidatedRelease.status, "invalidated");
  assert.ok(releasedRelease.auditEvents.some((item) => item.action === "release"));
  assert.ok(rolledBackRelease.auditEvents.some((item) => item.action === "rollback"));
});

test("unknown action and invalid transition throw explicit errors", () => {
  const pkg = buildExportPackage(caseInput("eligible_export_package"));
  const state = {
    ...pkg.releaseGate,
    exportId: pkg.exportId,
    exportEligibilityStatus: pkg.eligibility.exportEligibilityStatus
  };
  assert.throws(
    () => transitionReleaseGate(state, "unknown_action", "SYN-ACTOR-001", "Synthetic reason"),
    /unknown release action/
  );
  assert.throws(
    () => transitionReleaseGate(state, "release", "SYN-ACTOR-001", "Synthetic reason"),
    /not allowed/
  );
});

test("summarizeExportPackages returns aggregate fixture counts", () => {
  const summary = summarizeExportPackages(M2_EXPORT_RELEASE_GATE_FIXTURE_PACKAGES);
  assert.equal(summary.total, 9);
  assert.equal(summary.eligibleCount, 3);
  assert.equal(summary.blockedCount, 6);
  assertFixtureGuardFlags(summary);
});

test("fixture repository list detail create and action are available without database", async () => {
  const list = await listM2ExportFixtures(baseConfig, {
    pagination: { page: 1, pageSize: 20 },
    searchParams: new URLSearchParams({ eligibility: "blocked" })
  });
  assertFixtureGuardFlags(list);
  assert.equal(list.items.length, 6);

  const detail = await getM2ExportFixtureById(baseConfig, "SYN-FR-EXPORT-001");
  assertFixtureGuardFlags(detail);
  assert.equal(detail.item.exportId, "SYN-FR-EXPORT-001");

  const created = await createM2ExportFixture(baseConfig, {
    caseId: "blocked_readiness"
  });
  assertFixtureGuardFlags(created);
  assert.equal(created.item.eligibility.exportEligibilityStatus, "blocked");

  const action = await simulateM2ExportAction(baseConfig, "SYN-FR-EXPORT-001", {
    action: "release",
    actor: "SYN-ACTOR-002",
    reason: "Synthetic release action"
  });
  assertFixtureGuardFlags(action);
  assert.equal(action.releaseGate.status, "released");
  assert.equal(action.auditEvent.action, "release");
});

test("fixture runtime API list detail create and action expose guard flags", async () => {
  const list = await request(`${fixtureExportPath}?page=1&pageSize=20`);
  assert.equal(list.statusCode, 200);
  assert.equal(typeof list.requestId, "string");
  assert.equal(list.cacheControl, "no-store");
  assertFixtureGuardFlags(list.body);
  assert.equal(list.body.items[0].exportId, "SYN-FR-EXPORT-001");

  const detail = await request(`${fixtureExportPath}/SYN-FR-EXPORT-001`);
  assert.equal(detail.statusCode, 200);
  assertFixtureGuardFlags(detail.body);
  assert.equal(detail.body.item.exportId, "SYN-FR-EXPORT-001");

  const created = await request(fixtureExportPath, {
    method: "POST",
    body: JSON.stringify({ caseId: "forbidden_field_detection" })
  });
  assert.equal(created.statusCode, 200);
  assertFixtureGuardFlags(created.body);
  assert.equal(created.body.item.eligibility.exportEligibilityStatus, "blocked");

  const action = await request(`${fixtureExportPath}/SYN-FR-EXPORT-001/actions`, {
    method: "POST",
    body: JSON.stringify({ action: "approve_export" })
  });
  assert.equal(action.statusCode, 200);
  assertFixtureGuardFlags(action.body);
  assert.equal(action.body.releaseGate.status, "approved_for_export");
});

test("fixture runtime API rejects invalid input and formal mode", async () => {
  const missing = await request(`${fixtureExportPath}/SYN-FR-EXPORT-999`);
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.body.error.code, "not_found");

  const invalidCase = await request(fixtureExportPath, {
    method: "POST",
    body: JSON.stringify({ caseId: "real_case" })
  });
  assert.equal(invalidCase.statusCode, 400);
  assert.equal(invalidCase.body.error.code, "bad_request");

  const invalidAction = await request(`${fixtureExportPath}/SYN-FR-EXPORT-001/actions`, {
    method: "POST",
    body: JSON.stringify({ action: "unknown_action" })
  });
  assert.equal(invalidAction.statusCode, 400);
  assert.equal(invalidAction.body.error.code, "bad_request");

  const formalMode = await request(`${fixtureExportPath}?mode=formal`);
  assert.equal(formalMode.statusCode, 423);
  assert.equal(formalMode.body.error.code, "formal_data_blocked");
});

test("formal old-products export path remains unavailable", async () => {
  const response = await request("/api/m2/old-products/exports", {
    method: "POST",
    body: JSON.stringify({ caseId: "eligible_export_package" })
  });
  assert.equal(response.statusCode, 404);
  assert.equal(response.body.error.code, "not_found");
});

test("admin includes fixture export page without formal persistence capability", () => {
  const html = readFileSync("public/admin/index.html", "utf8");
  const js = readFileSync("public/admin/app.js", "utf8");

  assert.match(html, /#m2-fixture-exports/);
  assert.match(html, /Export release gate fixture queue/);
  assert.match(js, /M2_FIXTURE_EXPORTS_API/);
  assert.match(js, /formalExportCreated=false/);
  assert.match(js, /formalEvaluationExecuted=false/);
  assert.match(js, /databaseWritten=false/);
  assert.doesNotMatch(js, /\/api\/m2\/old-products\/exports/i);
  assert.doesNotMatch(js, /switch_mapping_version/i);
  assert.doesNotMatch(js, /local_dry_run/i);
});

test("FR-6 source files do not read data connect database execute migration or add formal capability", () => {
  const files = [
    "src/domain/oldProductEvaluation/exportReleaseGate.js",
    "src/repositories/m2ExportFixtureRepository.js",
    "src/http/app.js",
    "public/admin/app.js"
  ];

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const token of FORBIDDEN_M2_EXPORT_RELEASE_GATE_TOKENS) {
      assert.equal(source.includes(token), false, `${file} should not contain ${token}`);
    }
    assert.doesNotMatch(source, /from ["']node:fs["']/);
    assert.doesNotMatch(source, /new\s+(Pool|Client)\b/);
  }
});
