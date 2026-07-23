#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CURRENT_CLOSED_REQUEST_STATE_BINDING_RELATIVE,
  readCanonicalCurrentAuthorityGraph,
  readCurrentAuthority,
} from "../../src/domain/m2V2EvidencePilot/currentAuthority.js";
import { validateClosedAtomicRequestBinding } from "../../src/domain/m2V2EvidencePilot/integrityState.js";
import { runReadonlyProofV0_2 } from "./prove_m2_v2_verifier_readonly.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PRIVATE_PROOF_ROOT =
  "data/private-output/m2-v2-pr7-s1-remediation-badbf45/b8-independent-readonly-proof-v0.1";

try {
  assertCleanTrackedWorktree();
  const exactHead = execFileSync(
    "git",
    ["rev-parse", "HEAD"],
    { cwd: ROOT, encoding: "utf8", windowsHide: true },
  ).trim();
  if (!/^[a-f0-9]{40}$/u.test(exactHead)) throw new Error("readonly_proof_head_invalid");

  const closed = validateClosedAtomicRequestBinding(ROOT, {
    bindingRelativePath: CURRENT_CLOSED_REQUEST_STATE_BINDING_RELATIVE,
    scope: "v2b8",
    eventStage: "v2b8",
  });
  if (!closed.valid) {
    throw new Error(`readonly_proof_current_binding_invalid:${closed.issues.join(",")}`);
  }
  const authority = readCurrentAuthority(ROOT);
  if (!authority.valid
      || authority.canonicalAuthorityGraphVerified !== true
      || authority.trackedCoreCommitmentVerified !== true) {
    throw new Error(`readonly_proof_current_authority_invalid:${authority.issues.join(",")}`);
  }
  const graphRead = readCanonicalCurrentAuthorityGraph(ROOT);
  if (!graphRead.valid) {
    throw new Error(`readonly_proof_current_graph_invalid:${graphRead.issues.join(",")}`);
  }

  const proofRoot = resolve(ROOT, PRIVATE_PROOF_ROOT);
  mkdirSync(proofRoot, { recursive: true });
  const attemptRoot = mkdtempSync(join(proofRoot, `head-${exactHead.slice(0, 12)}-`));
  const graphPath = join(attemptRoot, "canonical-authority-graph-private-v0.3.json");
  const requestPath = join(attemptRoot, "formal-readonly-request-private-v0.2.json");
  const proofPath = join(attemptRoot, "formal-readonly-proof-private-v0.2.json");
  const graphBytes = jsonBytes(graphRead.graph);
  writeFileSync(graphPath, graphBytes, { flag: "wx", mode: 0o600 });
  const request = {
    schema: "m2.v2.verifier-readonly-formal-request.v0.2",
    graphPath: repositoryRelative(graphPath),
    graphContentSha256: sha256(graphBytes),
    proofOutputPath: repositoryRelative(proofPath),
    verifierCommandId: "m2:v2:v2b8:verify",
  };
  writeFileSync(requestPath, jsonBytes(request), { flag: "wx", mode: 0o600 });

  const proof = runReadonlyProofV0_2(repositoryRelative(requestPath));
  if (!proof.allPassed
      || proof.claimable !== true
      || proof.invocationCount !== 2
      || proof.providerRequestDelta !== 0
      || proof.databaseConnectionDelta !== 0
      || proof.issues.length !== 0) {
    throw new Error(`readonly_proof_failed:${proof.issues.map((issue) => issue.code).join(",")}`);
  }
  const proofBytes = jsonBytes(proof);
  writeFileSync(proofPath, proofBytes, { flag: "wx", mode: 0o600 });
  process.stdout.write(`${JSON.stringify({
    schema: "m2.v2.pr7-b8-readonly-proof-receipt.v0.1",
    status: "PASS",
    exactHead,
    claimable: true,
    invocationCount: proof.invocationCount,
    memberCount: proof.scope.members.length,
    memberSetDigestSha256: proof.snapshots.before.memberSetDigestSha256,
    sourceGraphDigestSha256: proof.scope.sourceGraphDigestSha256,
    currentTransactionId: closed.transactionId,
    currentBindingDigestSha256: closed.bindingDigest,
    proofDigestSha256: sha256(proofBytes),
    providerRequestDelta: proof.providerRequestDelta,
    databaseConnectionDelta: proof.databaseConnectionDelta,
    full160Authorized: false,
  })}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({
    schema: "m2.v2.pr7-b8-readonly-proof-receipt.v0.1",
    status: "FAIL",
    reason: safeReason(error),
    providerRequestDelta: 0,
    databaseConnectionDelta: 0,
    full160Authorized: false,
  })}\n`);
  process.exitCode = 1;
}

function assertCleanTrackedWorktree() {
  const status = execFileSync(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=no"],
    { cwd: ROOT, encoding: "utf8", windowsHide: true },
  );
  if (status.trim() !== "") throw new Error("readonly_proof_tracked_worktree_not_clean");
}

function repositoryRelative(path) {
  const result = relative(ROOT, path).replaceAll("\\", "/");
  if (!result || result.startsWith("../") || result === "..") {
    throw new Error("readonly_proof_path_outside_repository");
  }
  return result;
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function safeReason(error) {
  return String(error instanceof Error ? error.message : "unknown_error")
    .replace(/[^A-Za-z0-9_:,.-]/gu, "_")
    .slice(0, 500);
}
