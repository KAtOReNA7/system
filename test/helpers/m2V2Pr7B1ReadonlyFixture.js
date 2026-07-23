import { readFileSync } from "node:fs";

import { sha256 } from "../../src/domain/m2V2EvidencePilot/pilotCore.js";
import { cloneJson } from "./m2V2Pr7B1CaseRegistry.js";

const authorityContract = readJson("../../docs/technical-design/m2-v2/M2-v2-verifier-authority-binding-v0.3.json");
const readonlyContract = readJson("../../docs/technical-design/m2-v2/M2-v2-verifier-readonly-contract-v0.2.json");
const contractRegistry = readJson("../../config/m2-v2-pr7-s1-contract-registry.v0.1.json");
const taskManifest = readJson("../../config/m2-v2-pr7-s1-task.v0.1.json");
const commandRegistry = readJson("../../config/m2-v2-pr7-s1-command-registry.v0.1.json");
const packageManifest = readJson("../../package.json");

const PUBLIC_NODE_BY_ROLE = Object.freeze({
  remediation_summary: "public_remediation_summary",
  merge_readiness: "public_merge_readiness",
  current_integrity_restatement: "current_integrity_restatement",
  current_state_index: "current_state_index",
});

export function buildReadonlyProofFixture({ deriveGraph, buildPhysicalMapping }) {
  const reportPathByNode = new Map(authorityContract.canonicalAuthorityGraph.publicReportRegistry.map((entry) => [
    PUBLIC_NODE_BY_ROLE[entry.role],
    entry.repositoryRelativePath,
  ]));
  reportPathByNode.set("tracked_core_commitment", authorityContract.trackedCoreCommitment.artifactPath);
  const physicalMappings = authorityContract.canonicalAuthorityGraph.nodes.map((node) => {
    const repositoryRelativePath = reportPathByNode.get(node.nodeId)
      ?? `synthetic-readonly-scope/${node.nodeId}.json`;
    return buildPhysicalMapping({
      nodeId: node.nodeId,
      repositoryRelativePath,
      contentDigestSha256: sha256(`synthetic-readonly:${node.nodeId}`),
      objectType: "FILE",
    });
  });
  return {
    graph: deriveGraph({ physicalMappings, selectionDecisions: [] }),
    readonlyContract: cloneJson(readonlyContract),
    contractRegistry: cloneJson(contractRegistry),
    taskManifest: cloneJson(taskManifest),
    commandRegistry: cloneJson(commandRegistry),
    packageManifest: cloneJson(packageManifest),
    repositoryRoot: process.cwd(),
    proofOutputPath: "data/private-output/m2-v2-pr7-s1-remediation-badbf45/synthetic-readonly-proof/readonly-proof-v0.2.json",
  };
}

export function mutateReadonlyCase(caseId, fixture) {
  const request = cloneJson(fixture);
  const state = { invocation: 0, mode: "stable", targetPath: null };
  if (caseId === "PR7-P2-009-scope-member") {
    removeGraphMember(request.graph, "safe_cache");
  } else if (caseId === "PR7-P2-009-scope-transaction") {
    removeGraphMember(request.graph, "immutable_inputs");
  } else if (caseId === "PR7-P2-009-scope-authority") {
    const mapping = request.readonlyContract.scopeDerivation.roleToScopeMemberMapping.find(
      (entry) => entry.authorityRole === "current_state_index",
    );
    mapping.scopeMemberClasses = mapping.scopeMemberClasses.filter((entry) => entry !== "current_pointer");
  } else if (caseId === "PR7-P2-009-scope-report") {
    removeGraphMember(request.graph, "public_remediation_summary");
    request.graph.publicReportRegistry = request.graph.publicReportRegistry.filter(
      (entry) => entry.role !== "remediation_summary",
    );
  } else if (caseId === "PR7-P2-009-path-drift") {
    state.mode = "path";
  } else if (caseId === "PR7-P2-009-metadata-drift") {
    state.mode = "metadata";
  } else if (caseId === "PR7-P2-009-link-alias") {
    state.mode = "link";
  } else if (caseId === "PR7-P2-009-self-reference") {
    request.proofOutputPath = request.graph.physicalMappings.find(
      (entry) => entry.nodeId === "safe_cache",
    ).repositoryRelativePath;
  } else if (caseId !== "PR7-P2-009-stable-pass") {
    throw new Error(`${caseId}:unhandled_test_case`);
  }
  const snapshotOptions = {
    observer(member) {
      state.targetPath ??= member.repositoryRelativePath;
      const changed = state.invocation > 0 && member.repositoryRelativePath === state.targetPath;
      return observation(member, state.mode, changed);
    },
    gitRefObserver() {
      return [{
        refName: "refs/heads/synthetic-readonly",
        objectType: "commit",
        targetOid: "a".repeat(40),
        symbolicTarget: "",
      }];
    },
  };
  const verifierCallback = ({ invocation, expectedMemberIds }) => {
    state.invocation = invocation;
    return {
      passed: true,
      checkedMemberIds: expectedMemberIds,
      verdict: { decision: "SYNTHETIC_STABLE", providerRequestDelta: 0 },
      exitStatus: 0,
    };
  };
  return {
    request: {
      ...request,
      syntheticTestOnly: true,
      snapshotOptions,
      verifierCallback,
      providerCounterReader: () => 0,
      databaseConnectionCounterReader: () => 0,
    },
    state,
    snapshotOptions,
  };
}

export function advanceReadonlyScenario(state, invocation) {
  state.invocation = invocation;
}

function removeGraphMember(graph, nodeId) {
  graph.physicalMappings = graph.physicalMappings.filter((entry) => entry.nodeId !== nodeId);
}

function observation(member, mode, changed) {
  return {
    authorityRole: member.authorityRole,
    scopeMemberClass: member.scopeMemberClass,
    memberKind: member.memberKind,
    repositoryRelativePath: changed && mode === "path"
      ? `${member.repositoryRelativePath}.renamed`
      : member.repositoryRelativePath,
    contentSha256: sha256(`content:${member.memberIdentity}`),
    byteLength: 1,
    memberSetDigestSha256: sha256(`member-set:${member.memberIdentity}`),
    metadata: {
      platform: "POSIX_NATIVE",
      device: "1",
      inode: "1",
      mode: "33188",
      uid: "0",
      gid: "0",
      size: "1",
      mtimeNs: changed && mode === "metadata" ? "2" : "1",
      ctimeNs: changed && mode === "metadata" ? "2" : "1",
      mountId: "1",
      resolvedPathDigestSha256: sha256(`resolved:${member.repositoryRelativePath}`),
    },
    objectIdentity: `synthetic-object:${member.memberIdentity}`,
    linkOrReparseType: mode === "link" ? "SYMLINK" : "NONE",
    referenceTargetDigestSha256: mode === "link" ? sha256("synthetic-link-target") : null,
  };
}

function readJson(relativeUrl) {
  return JSON.parse(readFileSync(new URL(relativeUrl, import.meta.url), "utf8"));
}
