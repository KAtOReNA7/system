import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  OFFLINE_RECOVERY_SOURCE_ROLES,
  promoteOfflineRecoveryGroup,
} from "../src/domain/m2V2EvidencePilot/privateStateRecovery.js";

const CONTRACT_DIGEST = sha256("synthetic-recovery-contract-v0.2");
const ROLE_REGISTRY = Object.freeze({
  requiredRoles: ["state", "requestEventLedger", "counterProjection"],
  optionalRoles: ["derivedEvaluation"],
});

test("offline recovery promotes a closed group once and repeats as a metadata-stable no-op", () => {
  const root = makeRecoveryRoot();
  try {
    const input = recoveryInput(root, "first");
    const first = promoteOfflineRecoveryGroup(input);
    assert.equal(first.status, "PROMOTED");
    assert.equal(first.providerRequestDelta, 0);
    const pointer = join(root, "governed", "current.json");
    const before = { bytes: readFileSync(pointer), mtimeMs: statSync(pointer).mtimeMs };
    const second = promoteOfflineRecoveryGroup(input);
    assert.equal(second.status, "ALREADY_CURRENT_NOOP");
    assert.equal(readFileSync(pointer).equals(before.bytes), true);
    assert.equal(statSync(pointer).mtimeMs, before.mtimeMs);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("offline recovery rejects missing, extra, forbidden-source, digest, and gate failures before current state changes", () => {
  const cases = [
    (input) => ({ ...input, members: input.members.filter((member) => member.role !== "counterProjection") }),
    (input) => ({ ...input, members: [...input.members, { role: "unknownRole", relativePath: "unknown.json", bytes: "{}\n" }] }),
    (input) => ({ ...input, sources: [{ ...input.sources[0], role: "public_report" }] }),
    (input) => ({ ...input, sources: [{ ...input.sources[0], byteDigest: "0".repeat(64) }] }),
    (input) => ({ ...input, evaluateGates: () => ({ sourceDigestsValid: true, verifierPassed: false }) }),
  ];
  for (const mutate of cases) {
    const root = makeRecoveryRoot();
    try {
      assert.throws(() => promoteOfflineRecoveryGroup(mutate(recoveryInput(root, "invalid"))));
      assert.equal(existsSync(join(root, "governed", "current.json")), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

for (const faultAt of [
  "transaction_rename_before",
  "transaction_rename_after",
  "pointer_swap_before",
  "pointer_swap_after",
]) {
  test(`offline recovery rolls current binding back at ${faultAt}`, () => {
    const root = makeRecoveryRoot();
    try {
      promoteOfflineRecoveryGroup(recoveryInput(root, "baseline"));
      const pointer = join(root, "governed", "current.json");
      const before = { bytes: readFileSync(pointer), mtimeMs: statSync(pointer).mtimeMs };
      const changed = recoveryInput(root, `changed-${faultAt}`);
      changed.faultAt = faultAt;
      assert.throws(() => promoteOfflineRecoveryGroup(changed), /synthetic_fault/u);
      assert.equal(readFileSync(pointer).equals(before.bytes), true);
      assert.equal(statSync(pointer).mtimeMs, before.mtimeMs);
      assert.equal(JSON.parse(readFileSync(join(root, "sources", "ledger.ndjson"), "utf8").trim()).sequence, 1);
      delete changed.faultAt;
      assert.equal(promoteOfflineRecoveryGroup(changed).status, "PROMOTED");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

test("recovery fault injection is unavailable outside a synthetic temp root", () => {
  const root = makeRecoveryRoot("ordinary-root-");
  try {
    const input = recoveryInput(root, "guarded");
    input.faultAt = "pointer_swap_before";
    assert.throws(() => promoteOfflineRecoveryGroup(input), /requires_synthetic_temp_target/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function recoveryInput(root, marker) {
  const members = [
    { role: "state", relativePath: "v2b8/state.json", bytes: `${JSON.stringify({ marker, full160Authorized: false })}\n` },
    { role: "requestEventLedger", relativePath: "v2b8/request-events.ndjson", bytes: `${JSON.stringify({ sequence: 1, eventType: "completed" })}\n` },
    { role: "counterProjection", relativePath: "v2b8/counters.json", bytes: `${JSON.stringify({ planned: 1, reserved: 1, dispatched: 1, completed: 1 })}\n` },
  ];
  return {
    root,
    members,
    sources: [
      { role: "immutable_manifest", relativePath: "sources/manifest.json" },
      { role: "append_only_provider_receipt", relativePath: "sources/receipt.ndjson" },
      { role: "request_event_ledger", relativePath: "sources/ledger.ndjson" },
      { role: "frozen_execution_contract", relativePath: "sources/contract.json" },
    ],
    roleRegistry: ROLE_REGISTRY,
    contractDigest: CONTRACT_DIGEST,
    transactionRootRelative: "governed/transactions",
    pointerRelative: "governed/current.json",
    evaluateGates: ({ members: descriptors, sources, providerRequestDelta }) => ({
      exactRoleSet: descriptors.length === 3,
      authoritativeSourcesOnly: sources.every((source) => OFFLINE_RECOVERY_SOURCE_ROLES.includes(source.role)),
      counterUnchanged: JSON.parse(readFileSync(join(root, "sources", "ledger.ndjson"), "utf8").trim()).sequence === 1,
      providerDeltaZero: providerRequestDelta === 0,
    }),
    validateCandidate: ({ phase, candidateRoot, members: descriptors, providerRequestDelta }) => {
      const issues = [];
      if (providerRequestDelta !== 0) issues.push("provider_delta_nonzero");
      if (descriptors.length !== 3) issues.push("member_count_invalid");
      if (phase !== "in_memory") {
        for (const descriptor of descriptors) {
          const path = join(candidateRoot, ...descriptor.relativePath.split("/"));
          if (!existsSync(path)) issues.push(`missing:${descriptor.role}`);
          else if (sha256Buffer(readFileSync(path)) !== descriptor.byteDigest) issues.push(`digest:${descriptor.role}`);
        }
      }
      return { valid: issues.length === 0, issues };
    },
  };
}

function makeRecoveryRoot(prefix = "m2-v2-recovery-validation-") {
  const root = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(root, "sources"), { recursive: true });
  writeFileSync(join(root, "sources", "manifest.json"), "{\"immutable\":true}\n", "utf8");
  writeFileSync(join(root, "sources", "receipt.ndjson"), "{\"status\":\"completed\"}\n", "utf8");
  writeFileSync(join(root, "sources", "ledger.ndjson"), "{\"sequence\":1}\n", "utf8");
  writeFileSync(join(root, "sources", "contract.json"), "{\"frozen\":true}\n", "utf8");
  return root;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sha256Buffer(value) {
  return createHash("sha256").update(value).digest("hex");
}
