#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { types as utilTypes } from "node:util";
import { deriveCanonicalAuthorityGraphV0_3 } from "../../src/domain/m2V2EvidencePilot/authorityGraph.js";
import {
  S1_EXTERNAL_ENV_NAMES,
  sha256PortableText,
  validateContractRegistry,
  validateS1CommandRegistry,
  validateS1TaskManifest,
} from "./m2_v2_pr7_s1_contract.mjs";

const PROOF_SCHEMA = "m2.v2.verifier-readonly-proof-public.v0.2";
const MODULE_REPOSITORY_ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const SYNTHETIC_PROOF_SCHEMA = "m2.v2.verifier-readonly-proof-synthetic-test-only.v0.2";
const SCOPE_SCHEMA = "m2.v2.verifier-readonly-scope.v0.2";
const SNAPSHOT_SCHEMA = "m2.v2.verifier-readonly-snapshot.v0.2";
const SYNTHETIC_SNAPSHOT_SCHEMA = "m2.v2.verifier-readonly-snapshot-synthetic-test-only.v0.2";
const FORMAL_REQUEST_SCHEMA = "m2.v2.verifier-readonly-formal-request.v0.2";
const CLAIM = "PERSISTENT_CONTENT_METADATA_PATH_REF_INVARIANCE";
const SYNTHETIC_CLAIM = "SYNTHETIC_LOGIC_ONLY_NOT_A_READONLY_PROOF";
const SHA256_RE = /^[0-9a-f]{64}$/u;
const FORMAL_SCOPE_BRAND = Symbol("m2.v2.verifier-readonly.formal-scope");
const FORMAL_CONTROL_PATHS = Object.freeze({
  taskManifest: "config/m2-v2-pr7-s1-task.v0.1.json",
  commandRegistry: "config/m2-v2-pr7-s1-command-registry.v0.1.json",
  receiptSchema: "config/m2-v2-pr7-s1-receipt-schema.v0.1.json",
  contractRegistry: "config/m2-v2-pr7-s1-contract-registry.v0.1.json",
  caseRegistry: "config/m2-v2-pr7-s1-case-registry.v0.1.json",
  readonlyContract: "docs/technical-design/m2-v2/M2-v2-verifier-readonly-contract-v0.2.json",
  readonlyNarrative: "docs/technical-design/m2-v2/M2-v2-verifier-readonly-contract-v0.2.md",
  packageManifest: "package.json",
});
const FORMAL_VERIFIER_BINDINGS = Object.freeze({
  "m2:v2:v2b5:verify": Object.freeze({
    packageScript: "node scripts/m2-v2-evidence-pilot/run_m2_v2_b5.mjs verify",
    sourcePath: "scripts/m2-v2-evidence-pilot/run_m2_v2_b5.mjs",
  }),
  "m2:v2:v2b6:verify": Object.freeze({
    packageScript: "node scripts/m2-v2-evidence-pilot/run_m2_v2_b6.mjs verify",
    sourcePath: "scripts/m2-v2-evidence-pilot/run_m2_v2_b6.mjs",
  }),
  "m2:v2:v2b7:verify": Object.freeze({
    packageScript: "node scripts/m2-v2-evidence-pilot/run_m2_v2_b7.mjs verify",
    sourcePath: "scripts/m2-v2-evidence-pilot/run_m2_v2_b7.mjs",
  }),
  "m2:v2:v2b8:verify": Object.freeze({
    packageScript: "node scripts/m2-v2-evidence-pilot/run_m2_v2_b8.mjs verify",
    sourcePath: "scripts/m2-v2-evidence-pilot/run_m2_v2_b8.mjs",
  }),
});
const EXPECTED_CONTRACT_IDS = Object.freeze([
  "authority_binding_v0_3",
  "event_time_clause_binding_v0_4",
  "migration_set_integrity_v0_3",
  "provider_transport_v0_2",
  "safe_cache_projection_v0_3",
  "verifier_readonly_v0_2",
  "workbook_independent_verification_v0_2",
]);
const EXPECTED_S1_COMMAND_IDS = Object.freeze([
  "s1.contracts",
  "s1.default.isolated",
  "s1.doctor",
  "s1.validate.local",
]);
const EXTERNAL_ENV_NAMES = S1_EXTERNAL_ENV_NAMES;

export const READONLY_PROOF_REASON = Object.freeze({
  roleSetMismatch: "readonly_scope_role_set_mismatch",
  missingTransaction: "readonly_scope_missing_transaction",
  missingCurrentAuthority: "readonly_scope_missing_current_authority",
  missingPublicReport: "readonly_scope_missing_public_report",
  pathSetChanged: "readonly_path_set_changed",
  metadataChangedOrUnsupported: "readonly_metadata_changed_or_unsupported",
  linkForbidden: "readonly_scope_link_forbidden",
  selfReference: "readonly_proof_self_reference",
  claimableInjectionForbidden: "readonly_claimable_injection_forbidden",
});

const METADATA_FIELDS = Object.freeze({
  WINDOWS_NATIVE: Object.freeze([
    "platform",
    "attributes",
    "creationTimeUtcFiletime",
    "lastWriteTimeUtcFiletime",
    "reparseTag",
    "volumeSerialNumber",
    "fileId128",
    "finalPathDigestSha256",
  ]),
  POSIX_NATIVE: Object.freeze([
    "platform",
    "device",
    "inode",
    "mode",
    "uid",
    "gid",
    "size",
    "mtimeNs",
    "ctimeNs",
    "mountId",
    "resolvedPathDigestSha256",
  ]),
  GIT: Object.freeze(["platform", "refName", "objectType", "targetOid"]),
});

function stable(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stable(entry)).join(",")}]`;
  }
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`)
    .join(",")}}`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function digest(value) {
  return sha256(Buffer.from(stable(value), "utf8"));
}

function fail(reason, message, details = {}) {
  const error = new Error(message);
  error.reason = reason;
  error.details = details;
  throw error;
}

function issue(reason, code, details = {}) {
  return Object.freeze({ reason, code, ...details });
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(READONLY_PROOF_REASON.roleSetMismatch, `${label} must be an object`);
  }
  return value;
}

function exactKeys(value, keys, label) {
  const actual = Object.keys(assertObject(value, label)).sort();
  const expected = [...keys].sort();
  if (stable(actual) !== stable(expected)) {
    fail(
      READONLY_PROOF_REASON.roleSetMismatch,
      `${label} key set is not exact`,
      { actual, expected },
    );
  }
}

function normalizeRepositoryRelativePath(value, label = "repositoryRelativePath") {
  if (typeof value !== "string" || value.length === 0 || value !== value.normalize("NFC")) {
    fail(READONLY_PROOF_REASON.pathSetChanged, `${label} must be non-empty NFC text`);
  }
  const normalized = value.replaceAll("\\", "/");
  if (
    normalized.startsWith("/") ||
    /^[A-Za-z]:\//u.test(normalized) ||
    normalized.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    fail(READONLY_PROOF_REASON.pathSetChanged, `${label} must be canonical repository-relative text`);
  }
  return normalized;
}

function normalizeOutputPath(value, repositoryRoot) {
  if (value === undefined || value === null || value === "") return null;
  const absolute = path.isAbsolute(value)
    ? path.resolve(value)
    : path.resolve(repositoryRoot, value);
  const relative = path.relative(repositoryRoot, absolute).replaceAll("\\", "/");
  if (relative === "" || relative.startsWith("../") || relative === "..") {
    fail(READONLY_PROOF_REASON.selfReference, "proof output must be a repository child path");
  }
  return normalizeRepositoryRelativePath(relative, "proofOutputPath");
}

function isIgnoredRepositoryPath(repositoryRoot, repositoryRelativePath) {
  const result = spawnSync(
    "git",
    ["check-ignore", "--no-index", "--quiet", "--", repositoryRelativePath],
    { cwd: repositoryRoot, encoding: "utf8", shell: false, windowsHide: true },
  );
  return result.status === 0;
}

function sortedUnique(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, "en"));
}

function resolveFormalRepositoryRoot() {
  const moduleRoot = realpathSync(MODULE_REPOSITORY_ROOT);
  let gitRoot;
  try {
    gitRoot = realpathSync(execFileSync(
      "git",
      ["rev-parse", "--show-toplevel"],
      { cwd: moduleRoot, encoding: "utf8", windowsHide: true },
    ).trim());
  } catch (error) {
    fail(
      READONLY_PROOF_REASON.roleSetMismatch,
      "formal repository root is not an exact Git worktree",
      { status: error?.status ?? null },
    );
  }
  const normalizeRoot = (value) => process.platform === "win32" ? value.toLowerCase() : value;
  if (normalizeRoot(moduleRoot) !== normalizeRoot(gitRoot)) {
    fail(READONLY_PROOF_REASON.roleSetMismatch, "module and Git repository roots differ");
  }
  return moduleRoot;
}

function assertExactPlainRecord(value, expectedKeys, label) {
  assertObject(value, label);
  if (utilTypes.isProxy(value)) {
    fail(
      READONLY_PROOF_REASON.claimableInjectionForbidden,
      `${label} must not be a Proxy`,
      { code: "FORMAL_REQUEST_PROXY_FORBIDDEN" },
    );
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail(
      READONLY_PROOF_REASON.claimableInjectionForbidden,
      `${label} must be a plain record`,
      { code: "FORMAL_REQUEST_PROTOTYPE_FORBIDDEN" },
    );
  }
  const ownKeys = Reflect.ownKeys(value);
  const actualKeys = ownKeys.map((key) => String(key)).sort();
  const expected = [...expectedKeys].sort();
  if (
    ownKeys.some((key) => typeof key !== "string") ||
    stable(actualKeys) !== stable(expected)
  ) {
    fail(
      READONLY_PROOF_REASON.claimableInjectionForbidden,
      `${label} key set is not exact`,
      { code: "FORMAL_REQUEST_KEY_SET_MISMATCH", actualKeys, expectedKeys: expected },
    );
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of ownKeys) {
    const descriptor = descriptors[key];
    if (!descriptor || descriptor.get || descriptor.set) {
      fail(
        READONLY_PROOF_REASON.claimableInjectionForbidden,
        `${label} must contain data properties only`,
        { code: "FORMAL_REQUEST_ACCESSOR_FORBIDDEN", key },
      );
    }
  }
  return Object.freeze(Object.fromEntries(ownKeys.map((key) => [key, descriptors[key].value])));
}

function readTrackedBytesExact(repositoryRoot, repositoryRelativePath) {
  const normalized = normalizeRepositoryRelativePath(repositoryRelativePath);
  const workingBytes = readFileSync(path.resolve(repositoryRoot, normalized));
  let headBytes;
  try {
    headBytes = execFileSync("git", ["show", `HEAD:${normalized}`], {
      cwd: repositoryRoot,
      windowsHide: true,
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (error) {
    fail(
      READONLY_PROOF_REASON.roleSetMismatch,
      `formal control is not a tracked HEAD blob: ${normalized}`,
      { path: normalized, status: error?.status ?? null },
    );
  }
  if (!Buffer.isBuffer(headBytes) || !workingBytes.equals(headBytes)) {
    fail(
      READONLY_PROOF_REASON.metadataChangedOrUnsupported,
      `formal control differs from the tracked HEAD blob: ${normalized}`,
      {
        path: normalized,
        workingSha256: sha256(workingBytes),
        headSha256: Buffer.isBuffer(headBytes) ? sha256(headBytes) : null,
      },
    );
  }
  return workingBytes;
}

function readTrackedJsonExact(repositoryRoot, repositoryRelativePath) {
  const bytes = readTrackedBytesExact(repositoryRoot, repositoryRelativePath);
  try {
    return Object.freeze({ bytes, value: JSON.parse(bytes.toString("utf8")) });
  } catch {
    fail(
      READONLY_PROOF_REASON.roleSetMismatch,
      `formal control is not valid JSON: ${repositoryRelativePath}`,
    );
  }
}

function taskRegistryPathMap() {
  return Object.freeze({
    commandRegistry: FORMAL_CONTROL_PATHS.commandRegistry,
    receiptSchema: FORMAL_CONTROL_PATHS.receiptSchema,
    contractRegistry: FORMAL_CONTROL_PATHS.contractRegistry,
    caseRegistry: FORMAL_CONTROL_PATHS.caseRegistry,
  });
}

function validateControlPlaneStructure(request) {
  const taskManifest = assertObject(request.taskManifest, "taskManifest");
  const contractRegistry = assertObject(request.contractRegistry, "contractRegistry");
  const commandRegistry = assertObject(request.commandRegistry, "commandRegistry");
  const readonlyContract = assertObject(request.readonlyContract, "readonlyContract");
  const packageManifest = assertObject(request.packageManifest, "packageManifest");
  if (taskManifest.schema !== "m2.v2.pr7.s1-task.v0.1") {
    fail(READONLY_PROOF_REASON.roleSetMismatch, "task manifest schema is not exact");
  }
  if (contractRegistry.schema !== "m2.v2.pr7-s1-contract-registry.v0.1") {
    fail(READONLY_PROOF_REASON.roleSetMismatch, "contract registry schema is not exact");
  }
  if (commandRegistry.schema !== "m2.v2.pr7.s1-command-registry.v0.1") {
    fail(READONLY_PROOF_REASON.roleSetMismatch, "command registry schema is not exact");
  }
  if (readonlyContract.schema !== "m2.v2.verifier-readonly-contract.v0.2") {
    fail(READONLY_PROOF_REASON.roleSetMismatch, "readonly contract schema is not exact");
  }
  const expectedTaskRegistryPaths = taskRegistryPathMap();
  exactKeys(taskManifest.registries, Object.keys(expectedTaskRegistryPaths), "taskManifest.registries");
  for (const [role, expectedPath] of Object.entries(expectedTaskRegistryPaths)) {
    const record = taskManifest.registries[role];
    exactKeys(record, ["path", "sha256"], `taskManifest.registries.${role}`);
    if (record.path !== expectedPath || !SHA256_RE.test(record.sha256)) {
      fail(READONLY_PROOF_REASON.roleSetMismatch, `task registry binding differs for ${role}`);
    }
  }
  if (!Array.isArray(contractRegistry.contracts)) {
    fail(READONLY_PROOF_REASON.roleSetMismatch, "contractRegistry.contracts must be an array");
  }
  const contractIds = contractRegistry.contracts.map((entry) => entry?.contractId).sort();
  if (stable(contractIds) !== stable([...EXPECTED_CONTRACT_IDS].sort())) {
    fail(READONLY_PROOF_REASON.roleSetMismatch, "contract registry exact contract set differs");
  }
  const historicalArtifacts = contractRegistry.historicalBaselines?.trackedArtifacts;
  if (!Array.isArray(historicalArtifacts) || historicalArtifacts.length !== 19) {
    fail(READONLY_PROOF_REASON.roleSetMismatch, "historical tracked artifact set is not exact");
  }
  const readonlyRecord = contractRegistry.contracts.find(
    (entry) => entry.contractId === "verifier_readonly_v0_2",
  );
  if (
    readonlyRecord?.machinePath !== FORMAL_CONTROL_PATHS.readonlyContract ||
    readonlyRecord?.narrativePath !== FORMAL_CONTROL_PATHS.readonlyNarrative ||
    readonlyRecord?.schema !== readonlyContract.schema ||
    !SHA256_RE.test(readonlyRecord?.machineSha256 ?? "") ||
    !SHA256_RE.test(readonlyRecord?.narrativeSha256 ?? "")
  ) {
    fail(READONLY_PROOF_REASON.roleSetMismatch, "readonly registry binding differs");
  }
  const allowedVerifierIds = [...(readonlyContract.commands ?? [])].sort();
  if (stable(allowedVerifierIds) !== stable(Object.keys(FORMAL_VERIFIER_BINDINGS).sort())) {
    fail(READONLY_PROOF_REASON.roleSetMismatch, "readonly verifier command set differs");
  }
  if (!Array.isArray(commandRegistry.commands)) {
    fail(READONLY_PROOF_REASON.roleSetMismatch, "commandRegistry.commands must be an array");
  }
  const s1CommandIds = commandRegistry.commands.map((entry) => entry?.commandId).sort();
  if (stable(s1CommandIds) !== stable([...EXPECTED_S1_COMMAND_IDS].sort())) {
    fail(READONLY_PROOF_REASON.roleSetMismatch, "S1 command registry exact command set differs");
  }
  if (!packageManifest.scripts || typeof packageManifest.scripts !== "object") {
    fail(READONLY_PROOF_REASON.roleSetMismatch, "package scripts are required");
  }
  for (const [commandId, binding] of Object.entries(FORMAL_VERIFIER_BINDINGS)) {
    if (packageManifest.scripts[commandId] !== binding.packageScript) {
      fail(READONLY_PROOF_REASON.roleSetMismatch, `package verifier binding differs for ${commandId}`);
    }
  }
  return Object.freeze({
    taskManifest,
    contractRegistry,
    commandRegistry,
    readonlyContract,
    packageManifest,
  });
}

function verifyRegisteredTrackedArtifacts(repositoryRoot, controls, controlBytes) {
  for (const [role, expectedPath] of Object.entries(taskRegistryPathMap())) {
    const bytes = controlBytes.get(expectedPath) ?? readTrackedBytesExact(repositoryRoot, expectedPath);
    controlBytes.set(expectedPath, bytes);
    if (sha256PortableText(bytes) !== controls.taskManifest.registries[role].sha256) {
      fail(READONLY_PROOF_REASON.roleSetMismatch, `task registry digest differs for ${role}`);
    }
  }
  for (const artifact of controls.contractRegistry.historicalBaselines.trackedArtifacts) {
    if (typeof artifact?.path !== "string" || !SHA256_RE.test(artifact?.sha256 ?? "")) {
      fail(READONLY_PROOF_REASON.roleSetMismatch, "historical artifact binding is incomplete");
    }
    const bytes = readTrackedBytesExact(repositoryRoot, artifact.path);
    controlBytes.set(artifact.path, bytes);
    if (sha256PortableText(bytes) !== artifact.sha256) {
      fail(READONLY_PROOF_REASON.roleSetMismatch, `historical artifact digest differs: ${artifact.path}`);
    }
  }
  for (const contract of controls.contractRegistry.contracts) {
    for (const [pathKey, digestKey] of [
      ["machinePath", "machineSha256"],
      ["narrativePath", "narrativeSha256"],
    ]) {
      const artifactPath = contract[pathKey];
      const expectedDigest = contract[digestKey];
      if (typeof artifactPath !== "string" || !SHA256_RE.test(expectedDigest ?? "")) {
        fail(READONLY_PROOF_REASON.roleSetMismatch, `contract artifact binding is incomplete: ${contract.contractId}`);
      }
      const bytes = readTrackedBytesExact(repositoryRoot, artifactPath);
      controlBytes.set(artifactPath, bytes);
      if (sha256PortableText(bytes) !== expectedDigest) {
        fail(READONLY_PROOF_REASON.roleSetMismatch, `contract artifact digest differs: ${artifactPath}`);
      }
    }
  }
}

function loadFormalControlPlane(repositoryRoot) {
  const controlBytes = new Map();
  const parsed = {};
  for (const role of [
    "taskManifest",
    "commandRegistry",
    "contractRegistry",
    "readonlyContract",
    "packageManifest",
  ]) {
    const artifact = readTrackedJsonExact(repositoryRoot, FORMAL_CONTROL_PATHS[role]);
    controlBytes.set(FORMAL_CONTROL_PATHS[role], artifact.bytes);
    parsed[role] = artifact.value;
  }
  controlBytes.set(
    FORMAL_CONTROL_PATHS.readonlyNarrative,
    readTrackedBytesExact(repositoryRoot, FORMAL_CONTROL_PATHS.readonlyNarrative),
  );
  const controls = validateControlPlaneStructure(parsed);
  verifyRegisteredTrackedArtifacts(repositoryRoot, controls, controlBytes);
  for (const artifact of controls.taskManifest.historicalImmutableArtifacts ?? []) {
    if (typeof artifact?.path !== "string") {
      fail(READONLY_PROOF_REASON.roleSetMismatch, "task historical artifact path is invalid");
    }
    if (!controlBytes.has(artifact.path)) {
      controlBytes.set(artifact.path, readTrackedBytesExact(repositoryRoot, artifact.path));
    }
  }
  try {
    validateS1CommandRegistry(controls.commandRegistry);
    validateS1TaskManifest(controls.taskManifest, {
      commandRegistryBytes: controlBytes.get(FORMAL_CONTROL_PATHS.commandRegistry),
      receiptSchemaBytes: controlBytes.get(FORMAL_CONTROL_PATHS.receiptSchema),
      contractRegistryBytes: controlBytes.get(FORMAL_CONTROL_PATHS.contractRegistry),
      caseRegistryBytes: controlBytes.get(FORMAL_CONTROL_PATHS.caseRegistry),
      historicalArtifactBytesByPath: controlBytes,
    });
    validateContractRegistry(controls.contractRegistry, {
      contractArtifactBytesByPath: controlBytes,
      historicalArtifactBytesByPath: controlBytes,
      trackedPaths: new Set(controlBytes.keys()),
    });
  } catch (error) {
    fail(
      READONLY_PROOF_REASON.roleSetMismatch,
      `formal semantic control validation failed: ${error.message}`,
    );
  }
  for (const verifierPath of sortedUnique([
    ...extractVerifierPaths(controls.commandRegistry),
    ...Object.values(FORMAL_VERIFIER_BINDINGS).map((entry) => entry.sourcePath),
    "scripts/m2-v2-evidence-pilot/prove_m2_v2_verifier_readonly.mjs",
    "scripts/m2-v2-evidence-pilot/m2_v2_pr7_s0_contract.mjs",
    "scripts/m2-v2-evidence-pilot/m2_v2_pr7_s1_contract.mjs",
    "src/domain/m2V2EvidencePilot/authorityGraph.js",
    "test/helpers/m2V2NoExternalSentinel.js",
  ])) {
    controlBytes.set(verifierPath, readTrackedBytesExact(repositoryRoot, verifierPath));
  }
  let trackedVerifierSources;
  try {
    trackedVerifierSources = execFileSync(
      "git",
      [
        "ls-files",
        "-z",
        "--",
        "scripts/m2-v2-evidence-pilot",
        "src/domain/m2V2EvidencePilot",
        "test/helpers/m2V2NoExternalSentinel.js",
      ],
      { cwd: repositoryRoot, encoding: "utf8", windowsHide: true },
    )
      .split("\0")
      .filter((artifactPath) => /\.(?:mjs|cjs|js|ps1)$/u.test(artifactPath));
  } catch (error) {
    fail(
      READONLY_PROOF_REASON.roleSetMismatch,
      "tracked verifier source inventory could not be resolved",
      { status: error?.status ?? null },
    );
  }
  for (const verifierPath of sortedUnique(trackedVerifierSources)) {
    controlBytes.set(verifierPath, readTrackedBytesExact(repositoryRoot, verifierPath));
  }
  return Object.freeze({
    ...controls,
    formalContentDigests: Object.freeze(Object.fromEntries(
      [...controlBytes.entries()].map(([artifactPath, bytes]) => [artifactPath, sha256(bytes)]),
    )),
  });
}

function resolveFormalVerifierCommand(commandId, controls) {
  const binding = FORMAL_VERIFIER_BINDINGS[commandId];
  if (!binding || !controls.readonlyContract.commands.includes(commandId)) {
    fail(READONLY_PROOF_REASON.roleSetMismatch, "formal verifier command ID is not allowed");
  }
  if (controls.packageManifest.scripts[commandId] !== binding.packageScript) {
    fail(READONLY_PROOF_REASON.roleSetMismatch, "formal verifier package binding differs");
  }
  return Object.freeze({
    commandId,
    executable: process.execPath,
    argv: Object.freeze([binding.sourcePath, "verify"]),
    scriptDigestSha256: digest({ commandId, packageScript: binding.packageScript }),
  });
}

function prepareFormalRequest(rawRequest) {
  const normalized = assertExactPlainRecord(
    rawRequest,
    ["schema", "graphPath", "graphContentSha256", "proofOutputPath", "verifierCommandId"],
    "formalRequest",
  );
  if (normalized.schema !== FORMAL_REQUEST_SCHEMA) {
    fail(READONLY_PROOF_REASON.roleSetMismatch, "formal request schema is not exact");
  }
  for (const key of ["graphPath", "proofOutputPath", "verifierCommandId"]) {
    if (typeof normalized[key] !== "string" || normalized[key].length === 0) {
      fail(READONLY_PROOF_REASON.roleSetMismatch, `formal request ${key} must be non-empty text`);
    }
  }
  const repositoryRoot = resolveFormalRepositoryRoot();
  const graphPath = normalizeRepositoryRelativePath(normalized.graphPath, "graphPath");
  const graphBytes = readFileSync(path.resolve(repositoryRoot, graphPath));
  if (!SHA256_RE.test(normalized.graphContentSha256 ?? "")
      || sha256(graphBytes) !== normalized.graphContentSha256) {
    fail(READONLY_PROOF_REASON.roleSetMismatch, "formal graph source digest differs");
  }
  let graph;
  try {
    graph = JSON.parse(graphBytes.toString("utf8"));
  } catch {
    fail(READONLY_PROOF_REASON.roleSetMismatch, "formal graph source is not valid JSON");
  }
  const controls = loadFormalControlPlane(repositoryRoot);
  const verifierCommand = resolveFormalVerifierCommand(normalized.verifierCommandId, controls);
  return Object.freeze({
    formalRequest: normalized,
    graph,
    graphSourcePath: graphPath,
    graphSourceContentSha256: sha256(graphBytes),
    proofOutputPath: normalized.proofOutputPath,
    repositoryRoot,
    verifierCommand,
    ...controls,
  });
}

function prepareFormalRequestFile(requestPath) {
  if (typeof requestPath !== "string" || requestPath.length === 0) {
    fail(
      READONLY_PROOF_REASON.claimableInjectionForbidden,
      "claimable proof requires one repository-relative formal request file path",
      { code: "FORMAL_REQUEST_PATH_REQUIRED" },
    );
  }
  const repositoryRoot = resolveFormalRepositoryRoot();
  const normalizedPath = normalizeRepositoryRelativePath(requestPath, "formalRequestPath");
  const requestBytes = readFileSync(path.resolve(repositoryRoot, normalizedPath));
  let rawRequest;
  try {
    rawRequest = JSON.parse(requestBytes.toString("utf8"));
  } catch {
    fail(READONLY_PROOF_REASON.roleSetMismatch, "formal request file is not valid JSON");
  }
  const prepared = prepareFormalRequest(rawRequest);
  return Object.freeze({
    ...prepared,
    formalRequestSourcePath: normalizedPath,
    formalRequestSourceContentSha256: sha256(requestBytes),
  });
}

function memberIdentity(member) {
  return digest({
    authorityRole: member.authorityRole,
    scopeMemberClass: member.scopeMemberClass,
    memberKind: member.memberKind,
    repositoryRelativePath: member.repositoryRelativePath,
  });
}

function memberKey(member) {
  return [
    member.authorityRole,
    member.scopeMemberClass,
    member.memberKind,
    member.repositoryRelativePath,
  ].join("\u0000");
}

function memberSpecification(member) {
  return Object.freeze({
    authorityRole: member.authorityRole,
    scopeMemberClass: member.scopeMemberClass,
    memberKind: member.memberKind,
    repositoryRelativePath: member.repositoryRelativePath,
    physicalObjectIdSha256: member.physicalObjectIdSha256,
    pathIdentityDigestSha256: member.pathIdentityDigestSha256,
    declaredContentDigestSha256: member.declaredContentDigestSha256,
    enforceDeclaredContentDigest: member.enforceDeclaredContentDigest,
    discoveryKind: member.discoveryKind,
  });
}

function mappingMemberKind(mapping, scopeMemberClass) {
  if (scopeMemberClass === "provider_counter") return "COUNTER";
  if (mapping.objectType === "FILE") return "FILE";
  if (mapping.objectType === "ORDERED_FILE_SET" || mapping.objectType === "VIRTUAL_DERIVED_SET") {
    return "DIRECTORY";
  }
  fail(
    READONLY_PROOF_REASON.roleSetMismatch,
    `unsupported authority physical object type: ${mapping.objectType}`,
  );
}

function addMember(target, seen, member) {
  const normalized = {
    authorityRole: member.authorityRole,
    scopeMemberClass: member.scopeMemberClass,
    memberKind: member.memberKind,
    repositoryRelativePath: normalizeRepositoryRelativePath(member.repositoryRelativePath),
    physicalObjectIdSha256: member.physicalObjectIdSha256 ?? null,
    pathIdentityDigestSha256: member.pathIdentityDigestSha256 ?? null,
    declaredContentDigestSha256: member.declaredContentDigestSha256 ?? null,
    enforceDeclaredContentDigest: member.enforceDeclaredContentDigest === true,
    discoveryKind: member.discoveryKind ?? null,
  };
  const key = memberKey(normalized);
  if (!seen.has(key)) {
    seen.set(key, target.length);
    target.push(Object.freeze({ ...normalized, memberIdentity: memberIdentity(normalized) }));
    return;
  }

  const index = seen.get(key);
  const existing = target[index];
  const mergeCompatibleField = (field) => {
    const previous = existing[field];
    const next = normalized[field];
    if (previous !== null && next !== null && previous !== next) {
      fail(
        READONLY_PROOF_REASON.roleSetMismatch,
        `duplicate readonly member has conflicting ${field}`,
        { memberIdentity: existing.memberIdentity, repositoryRelativePath: existing.repositoryRelativePath },
      );
    }
    return previous ?? next;
  };
  const merged = {
    ...normalized,
    physicalObjectIdSha256: mergeCompatibleField("physicalObjectIdSha256"),
    pathIdentityDigestSha256: mergeCompatibleField("pathIdentityDigestSha256"),
    declaredContentDigestSha256: mergeCompatibleField("declaredContentDigestSha256"),
    enforceDeclaredContentDigest:
      existing.enforceDeclaredContentDigest || normalized.enforceDeclaredContentDigest,
    discoveryKind: mergeCompatibleField("discoveryKind"),
    memberIdentity: existing.memberIdentity,
  };
  if (merged.enforceDeclaredContentDigest && !SHA256_RE.test(merged.declaredContentDigestSha256 ?? "")) {
    fail(
      READONLY_PROOF_REASON.roleSetMismatch,
      "enforced duplicate readonly member has no authenticated content digest",
      { memberIdentity: existing.memberIdentity, repositoryRelativePath: existing.repositoryRelativePath },
    );
  }
  target[index] = Object.freeze(merged);
}

function publicReportRole(entry) {
  if (typeof entry.role === "string") {
    const aliases = {
      remediation_summary: "public_remediation_summary",
      merge_readiness: "public_merge_readiness",
      integrity_restatement: "current_integrity_restatement",
      current_integrity_restatement: "current_integrity_restatement",
      current_state_index: "current_state_index",
    };
    return aliases[entry.role] ?? entry.role;
  }
  return null;
}

function extractRegistryPaths(registry, taskManifest) {
  const paths = [];
  if (registry && typeof registry === "object") {
    if (!Array.isArray(registry.contracts)) {
      fail(READONLY_PROOF_REASON.roleSetMismatch, "contractRegistry.contracts must be an array");
    }
    for (const contract of registry.contracts) {
      if (typeof contract?.machinePath === "string") paths.push(contract.machinePath);
      if (typeof contract?.narrativePath === "string") paths.push(contract.narrativePath);
    }
    const trackedArtifacts = registry.historicalBaselines?.trackedArtifacts ?? [];
    if (!Array.isArray(trackedArtifacts)) {
      fail(
        READONLY_PROOF_REASON.roleSetMismatch,
        "contractRegistry.historicalBaselines.trackedArtifacts must be an array",
      );
    }
    for (const artifact of trackedArtifacts) {
      if (typeof artifact?.path === "string") paths.push(artifact.path);
    }
  }
  if (taskManifest && typeof taskManifest === "object") {
    for (const registryRecord of Object.values(taskManifest.registries ?? {})) {
      if (typeof registryRecord?.path === "string") paths.push(registryRecord.path);
    }
  }
  return sortedUnique(paths.filter((entry) => typeof entry === "string"));
}

function extractVerifierPaths(commandRegistry) {
  const paths = [];
  if (!commandRegistry || typeof commandRegistry !== "object") return paths;
  for (const command of Object.values(commandRegistry.commands ?? {})) {
    for (const token of command?.argv ?? []) {
      if (typeof token === "string" && /\.(?:mjs|cjs|js|ps1)$/u.test(token)) paths.push(token);
    }
    for (const input of command?.requiredInputs ?? []) {
      if (typeof input === "string" && /\.(?:mjs|cjs|js|ps1)$/u.test(input)) paths.push(input);
    }
  }
  return sortedUnique(paths);
}

function roleClassesFromContract(readonlyContract) {
  const mapping = readonlyContract.scopeDerivation?.roleToScopeMemberMapping;
  if (!Array.isArray(mapping)) {
    fail(
      READONLY_PROOF_REASON.roleSetMismatch,
      "scopeDerivation.roleToScopeMemberMapping must be an array",
    );
  }
  const result = new Map();
  for (const record of mapping) {
    exactKeys(
      record,
      ["authorityRole", "scopeMemberClasses", "cardinality"],
      "roleToScopeMemberMapping record",
    );
    const role = record.authorityRole;
    const classes = record.scopeMemberClasses;
    if (typeof role !== "string" || result.has(role)) {
      fail(READONLY_PROOF_REASON.roleSetMismatch, "authority role mapping must be unique text");
    }
    if (!Array.isArray(classes) || classes.length === 0 || classes.some((entry) => typeof entry !== "string")) {
      fail(READONLY_PROOF_REASON.roleSetMismatch, `scope classes for ${role} are invalid`);
    }
    result.set(role, sortedUnique(classes));
  }
  return result;
}

function graphRoles(graph) {
  if (!Array.isArray(graph.nodes)) {
    fail(READONLY_PROOF_REASON.roleSetMismatch, "authority graph nodes are required");
  }
  return graph.nodes.map((node) => node?.nodeId ?? node?.authorityRole ?? node?.role);
}

function classifyMissingScope(scopeClass) {
  if (scopeClass === "transaction_roots") return READONLY_PROOF_REASON.missingTransaction;
  if (["current_pointer", "current_state_index", "current_integrity_restatement"].includes(scopeClass)) {
    return READONLY_PROOF_REASON.missingCurrentAuthority;
  }
  if (scopeClass === "public_reports") return READONLY_PROOF_REASON.missingPublicReport;
  return READONLY_PROOF_REASON.roleSetMismatch;
}

/**
 * Derive the complete v0.2 read-only observation scope. The authority-role set is
 * read from the canonical graph and cross-checked against the read-only contract;
 * this module intentionally carries no second role registry.
 */
function deriveReadonlyScopeV0_2Internal(request, formal = false) {
  assertObject(request, "request");
  validateControlPlaneStructure(request);
  const graph = assertObject(request.graph, "graph");
  const readonlyContract = assertObject(request.readonlyContract, "readonlyContract");
  const repositoryRoot = path.resolve(request.repositoryRoot ?? process.cwd());
  let canonicalGraph;
  try {
    canonicalGraph = deriveCanonicalAuthorityGraphV0_3({
      physicalMappings: graph.physicalMappings,
      selectionDecisions: graph.selectionDecisions,
    });
  } catch (error) {
    fail(READONLY_PROOF_REASON.roleSetMismatch, `canonical authority graph runtime arrays invalid: ${error.message}`);
  }
  const canonicalPublicRoles = canonicalGraph.publicReportRegistry.map((entry) => entry.role).sort();
  const suppliedPublicRoles = Array.isArray(graph.publicReportRegistry)
    ? graph.publicReportRegistry.map((entry) => entry?.role).sort()
    : [];
  if (stable(canonicalPublicRoles) !== stable(suppliedPublicRoles)) {
    fail(READONLY_PROOF_REASON.missingPublicReport, "canonical public report registry set is incomplete", {
      canonicalPublicRoles,
      suppliedPublicRoles,
    });
  }
  const canonicalStatic = {
    ...canonicalGraph,
    physicalMappings: [],
    selectionDecisions: [],
    graphDigestSha256: null,
  };
  const suppliedStatic = {
    ...graph,
    physicalMappings: [],
    selectionDecisions: [],
    graphDigestSha256: null,
  };
  if (stable(canonicalStatic) !== stable(suppliedStatic)) {
    fail(READONLY_PROOF_REASON.roleSetMismatch, "canonical authority graph static sets differ");
  }
  const canonicalGraphDigestMatches = graph.graphDigestSha256 === canonicalGraph.graphDigestSha256;
  const roleClasses = roleClassesFromContract(readonlyContract);
  const roles = graphRoles(graph);
  if (!Array.isArray(graph.runtimeConsumers)) {
    fail(READONLY_PROOF_REASON.roleSetMismatch, "canonical runtimeConsumers are required");
  }
  const consumedRoles = sortedUnique(
    graph.runtimeConsumers.flatMap((consumer) => consumer?.consumedNodeIds ?? []),
  );
  const expectedRoles = [...roleClasses.keys()].sort();
  const actualRoles = sortedUnique(roles);
  if (
    roles.some((role) => typeof role !== "string") ||
    roles.length !== actualRoles.length ||
    stable(actualRoles) !== stable(expectedRoles) ||
    stable(consumedRoles) !== stable(actualRoles)
  ) {
    fail(READONLY_PROOF_REASON.roleSetMismatch, "authority graph and read-only role sets differ", {
      actualRoles,
      expectedRoles,
    });
  }
  if (!Array.isArray(graph.physicalMappings)) {
    fail(READONLY_PROOF_REASON.roleSetMismatch, "authority graph physicalMappings are required");
  }

  const members = [];
  const seen = new Map();
  const physicalMappingRoles = new Set();
  for (const mapping of graph.physicalMappings) {
    exactKeys(
      mapping,
      [
        "physicalObjectIdSha256",
        "nodeId",
        "repositoryRelativePath",
        "pathIdentityDigestSha256",
        "contentDigestSha256",
        "objectType",
      ],
      "physicalMapping",
    );
    if (!roleClasses.has(mapping.nodeId)) {
      fail(READONLY_PROOF_REASON.roleSetMismatch, `physical mapping has unknown node ${mapping.nodeId}`);
    }
    physicalMappingRoles.add(mapping.nodeId);
    for (const hashField of [
      "physicalObjectIdSha256",
      "pathIdentityDigestSha256",
      "contentDigestSha256",
    ]) {
      if (!SHA256_RE.test(mapping[hashField])) {
        fail(READONLY_PROOF_REASON.roleSetMismatch, `${hashField} is not sha256`);
      }
    }
    for (const scopeMemberClass of roleClasses.get(mapping.nodeId)) {
      addMember(members, seen, {
        authorityRole: mapping.nodeId,
        scopeMemberClass,
        memberKind: mappingMemberKind(mapping, scopeMemberClass),
        repositoryRelativePath: mapping.repositoryRelativePath,
        physicalObjectIdSha256: mapping.physicalObjectIdSha256,
        pathIdentityDigestSha256: mapping.pathIdentityDigestSha256,
        declaredContentDigestSha256: mapping.contentDigestSha256,
      });
    }
  }

  if (!Array.isArray(graph.publicReportRegistry)) {
    fail(READONLY_PROOF_REASON.missingPublicReport, "publicReportRegistry must be an array");
  }
  const publicReportSourceRoles = new Set();
  for (const report of graph.publicReportRegistry) {
    const role = publicReportRole(report);
    const reportPath = report.repositoryRelativePath;
    if (!role || !roleClasses.has(role) || typeof reportPath !== "string") {
      fail(READONLY_PROOF_REASON.missingPublicReport, "public report registry entry is incomplete");
    }
    if (publicReportSourceRoles.has(role)) {
      fail(READONLY_PROOF_REASON.missingPublicReport, `duplicate public report source for ${role}`);
    }
    publicReportSourceRoles.add(role);
    for (const scopeMemberClass of roleClasses.get(role)) {
      addMember(members, seen, {
        authorityRole: role,
        scopeMemberClass,
        memberKind: "FILE",
        repositoryRelativePath: reportPath,
      });
    }
  }

  for (const [role, classes] of roleClasses) {
    const isRegistryBackedPublicRole =
      classes.includes("public_reports") && !classes.includes("required_v0_2_and_vnext_paths");
    if (isRegistryBackedPublicRole && !publicReportSourceRoles.has(role)) {
      fail(READONLY_PROOF_REASON.missingPublicReport, `public report registry omits ${role}`, {
        authorityRole: role,
      });
    }
    if (!physicalMappingRoles.has(role) && !publicReportSourceRoles.has(role)) {
      const omissionReason = classes
        .map((scopeClass) => classifyMissingScope(scopeClass))
        .find((reason) => reason !== READONLY_PROOF_REASON.roleSetMismatch);
      fail(omissionReason ?? READONLY_PROOF_REASON.roleSetMismatch, `authority role ${role} has no bound member`, {
        authorityRole: role,
      });
    }
  }
  if (!canonicalGraphDigestMatches) {
    fail(READONLY_PROOF_REASON.roleSetMismatch, "canonical authority graph digest differs");
  }

  const executionRole = [...roleClasses.entries()].find(([, classes]) =>
    classes.includes("required_v0_2_and_vnext_paths"),
  )?.[0];
  if (executionRole) {
    const requiredControlPaths = sortedUnique([
      ...extractRegistryPaths(request.contractRegistry, request.taskManifest),
      FORMAL_CONTROL_PATHS.taskManifest,
      FORMAL_CONTROL_PATHS.packageManifest,
      FORMAL_CONTROL_PATHS.readonlyContract,
      FORMAL_CONTROL_PATHS.readonlyNarrative,
      ...(typeof request.graphSourcePath === "string" ? [request.graphSourcePath] : []),
      ...(typeof request.formalRequestSourcePath === "string"
        ? [request.formalRequestSourcePath]
        : []),
    ]);
    for (const registryPath of requiredControlPaths) {
      const formalDigest = request.formalContentDigests?.[registryPath]
        ?? (registryPath === request.graphSourcePath
          ? request.graphSourceContentSha256
          : registryPath === request.formalRequestSourcePath
            ? request.formalRequestSourceContentSha256
            : null);
      addMember(members, seen, {
        authorityRole: executionRole,
        scopeMemberClass: "required_v0_2_and_vnext_paths",
        memberKind: "FILE",
        repositoryRelativePath: registryPath,
        declaredContentDigestSha256: formalDigest,
        enforceDeclaredContentDigest: SHA256_RE.test(formalDigest ?? ""),
      });
    }
    const verifierPaths = sortedUnique([
      ...extractVerifierPaths(request.commandRegistry),
      ...Object.values(FORMAL_VERIFIER_BINDINGS).map((entry) => entry.sourcePath),
      "scripts/m2-v2-evidence-pilot/prove_m2_v2_verifier_readonly.mjs",
      "scripts/m2-v2-evidence-pilot/m2_v2_pr7_s0_contract.mjs",
      "scripts/m2-v2-evidence-pilot/m2_v2_pr7_s1_contract.mjs",
      "src/domain/m2V2EvidencePilot/authorityGraph.js",
      "test/helpers/m2V2NoExternalSentinel.js",
      ...Object.keys(request.formalContentDigests ?? {}).filter((artifactPath) =>
        /\.(?:mjs|cjs|js|ps1)$/u.test(artifactPath)
      ),
    ]);
    for (const verifierPath of verifierPaths) {
      const formalDigest = request.formalContentDigests?.[verifierPath] ?? null;
      addMember(members, seen, {
        authorityRole: executionRole,
        scopeMemberClass: "tracked_verifier_sources",
        memberKind: "FILE",
        repositoryRelativePath: verifierPath,
        declaredContentDigestSha256: formalDigest,
        enforceDeclaredContentDigest: SHA256_RE.test(formalDigest ?? ""),
      });
    }
  }

  const refsRole = [...roleClasses.entries()].find(([, classes]) =>
    classes.includes("user_repository_refs"),
  )?.[0];
  if (refsRole) {
    addMember(members, seen, {
      authorityRole: refsRole,
      scopeMemberClass: "user_repository_refs",
      memberKind: "GIT_REF",
      repositoryRelativePath: "refs/*",
      discoveryKind: "USER_REPOSITORY_REFS",
    });
  }

  const requiredClasses = readonlyContract.scopeDerivation?.requiredRoleClasses;
  if (!Array.isArray(requiredClasses) || requiredClasses.length === 0) {
    fail(READONLY_PROOF_REASON.roleSetMismatch, "requiredRoleClasses must be non-empty");
  }
  for (const requiredClass of requiredClasses) {
    if (!members.some((member) => member.scopeMemberClass === requiredClass)) {
      fail(classifyMissingScope(requiredClass), `read-only scope has no ${requiredClass} member`, {
        scopeMemberClass: requiredClass,
      });
    }
  }

  const proofOutputPath = normalizeOutputPath(request.proofOutputPath, repositoryRoot);
  const exclusions = [];
  if (proofOutputPath) {
    const conflicts = members.filter((member) => {
      if (member.memberKind === "GIT_REF") return false;
      const memberPath = member.repositoryRelativePath;
      return (
        proofOutputPath === memberPath ||
        proofOutputPath.startsWith(`${memberPath}/`) ||
        memberPath.startsWith(`${proofOutputPath}/`)
      );
    });
    if (conflicts.length > 0) {
      fail(READONLY_PROOF_REASON.selfReference, "proof output intersects the governed scope", {
        conflictingMemberIdentities: conflicts.map((entry) => entry.memberIdentity).sort(),
      });
    }
    const outputAbsolute = path.resolve(repositoryRoot, proofOutputPath);
    if (existsSync(outputAbsolute) || !isIgnoredRepositoryPath(repositoryRoot, proofOutputPath)) {
      fail(
        READONLY_PROOF_REASON.selfReference,
        "proof output must be an explicit new Git-ignored repository path",
      );
    }
    exclusions.push({
      repositoryRelativePath: proofOutputPath,
      memberKind: "FILE",
      reason: "PROOF_OUTPUT_SELF",
      allowedObservationDifference: "ALL_PERSISTENT_OBSERVATIONS",
    });
    exclusions.push({
      repositoryRelativePath: `${proofOutputPath}/**`,
      memberKind: "DIRECTORY",
      reason: "PROOF_OUTPUT_DESCENDANT",
      allowedObservationDifference: "ALL_PERSISTENT_OBSERVATIONS",
    });
    const parentRelative = path
      .relative(repositoryRoot, path.dirname(outputAbsolute))
      .replaceAll("\\", "/");
    if (parentRelative && parentRelative !== ".") {
      exclusions.push({
        repositoryRelativePath: normalizeRepositoryRelativePath(parentRelative),
        memberKind: "DIRECTORY",
        reason: "NEW_OUTPUT_CHILD_PARENT_DIRECTORY_MTIME_ONLY",
        allowedObservationDifference: "LAST_WRITE_TIME_ONLY",
      });
    }
  }

  const orderedMembers = [...members].sort((left, right) =>
    memberKey(left).localeCompare(memberKey(right), "en"),
  );
  const sourceGraphDigest = graph.graphDigestSha256 ?? digest(graph);
  if (!SHA256_RE.test(sourceGraphDigest)) {
    fail(READONLY_PROOF_REASON.roleSetMismatch, "authority graph digest is invalid");
  }
  return Object.freeze({
    schema: SCOPE_SCHEMA,
    claim: CLAIM,
    claimable: formal,
    [FORMAL_SCOPE_BRAND]: formal,
    sourceGraphDigestSha256: sourceGraphDigest,
    requiredRoleClasses: [...requiredClasses],
    roleMappings: Object.fromEntries(
      [...roleClasses.entries()].sort(([left], [right]) => left.localeCompare(right, "en")),
    ),
    members: Object.freeze(orderedMembers),
    exclusions: Object.freeze(exclusions.map((entry) => Object.freeze(entry))),
    memberSpecificationSetDigestSha256: digest(
      orderedMembers.map(memberSpecification),
    ),
  });
}

/** Logic-level scope derivation is exported for adversarial tests and is never claimable. */
export function deriveReadonlyScopeV0_2(request) {
  return deriveReadonlyScopeV0_2Internal(request, false);
}

function safeNumber(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    fail(READONLY_PROOF_REASON.metadataChangedOrUnsupported, `${label} is outside safe integer range`);
  }
  return number;
}

const WINDOWS_NATIVE_COLLECTOR = String.raw`
$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$nativeSource = @'
using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;

public sealed class B1NativeRecord {
    public string Path { get; set; }
    public string Attributes { get; set; }
    public string CreationTimeUtcFiletime { get; set; }
    public string LastWriteTimeUtcFiletime { get; set; }
    public string ReparseTag { get; set; }
    public string VolumeSerialNumber { get; set; }
    public string FileId128 { get; set; }
    public string FinalPath { get; set; }
    public bool IsDirectory { get; set; }
}

public static class B1NativeMetadata {
    private const uint FILE_SHARE_READ = 1;
    private const uint FILE_SHARE_WRITE = 2;
    private const uint FILE_SHARE_DELETE = 4;
    private const uint OPEN_EXISTING = 3;
    private const uint FILE_FLAG_BACKUP_SEMANTICS = 0x02000000;
    private const uint FILE_FLAG_OPEN_REPARSE_POINT = 0x00200000;

    [StructLayout(LayoutKind.Sequential)]
    private struct BY_HANDLE_FILE_INFORMATION {
        public uint FileAttributes;
        public System.Runtime.InteropServices.ComTypes.FILETIME CreationTime;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastAccessTime;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWriteTime;
        public uint VolumeSerialNumber;
        public uint FileSizeHigh;
        public uint FileSizeLow;
        public uint NumberOfLinks;
        public uint FileIndexHigh;
        public uint FileIndexLow;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct FILE_ATTRIBUTE_TAG_INFO {
        public uint FileAttributes;
        public uint ReparseTag;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct FILE_ID_INFO {
        public ulong VolumeSerialNumber;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 16)]
        public byte[] FileId;
    }

    private enum FILE_INFO_BY_HANDLE_CLASS {
        FileAttributeTagInfo = 9,
        FileIdInfo = 18
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafeFileHandle CreateFileW(string name, uint access, uint share,
        IntPtr security, uint creation, uint flags, IntPtr template);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetFileInformationByHandle(SafeFileHandle handle,
        out BY_HANDLE_FILE_INFORMATION information);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetFileInformationByHandleEx(SafeFileHandle handle,
        FILE_INFO_BY_HANDLE_CLASS infoClass, out FILE_ATTRIBUTE_TAG_INFO information, uint size);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetFileInformationByHandleEx(SafeFileHandle handle,
        FILE_INFO_BY_HANDLE_CLASS infoClass, out FILE_ID_INFO information, uint size);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern uint GetFinalPathNameByHandleW(SafeFileHandle handle,
        [Out] StringBuilder path, uint size, uint flags);

    private static ulong FileTime(System.Runtime.InteropServices.ComTypes.FILETIME value) {
        return ((ulong)(uint)value.dwHighDateTime << 32) | (uint)value.dwLowDateTime;
    }

    public static B1NativeRecord Inspect(string path) {
        using (SafeFileHandle handle = CreateFileW(path, 0,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            IntPtr.Zero, OPEN_EXISTING,
            FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT, IntPtr.Zero)) {
            if (handle.IsInvalid) throw new Win32Exception(Marshal.GetLastWin32Error(), "CreateFileW");
            BY_HANDLE_FILE_INFORMATION basic;
            if (!GetFileInformationByHandle(handle, out basic))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "GetFileInformationByHandle");
            FILE_ATTRIBUTE_TAG_INFO tag;
            if (!GetFileInformationByHandleEx(handle, FILE_INFO_BY_HANDLE_CLASS.FileAttributeTagInfo,
                out tag, (uint)Marshal.SizeOf(typeof(FILE_ATTRIBUTE_TAG_INFO))))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "FileAttributeTagInfo");
            FILE_ID_INFO id;
            if (!GetFileInformationByHandleEx(handle, FILE_INFO_BY_HANDLE_CLASS.FileIdInfo,
                out id, (uint)Marshal.SizeOf(typeof(FILE_ID_INFO))))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "FileIdInfo");
            StringBuilder finalPath = new StringBuilder(32768);
            uint length = GetFinalPathNameByHandleW(handle, finalPath, (uint)finalPath.Capacity, 0);
            if (length == 0 || length >= finalPath.Capacity)
                throw new Win32Exception(Marshal.GetLastWin32Error(), "GetFinalPathNameByHandleW");
            return new B1NativeRecord {
                Path = System.IO.Path.GetFullPath(path),
                Attributes = "0x" + tag.FileAttributes.ToString("x8"),
                CreationTimeUtcFiletime = FileTime(basic.CreationTime).ToString(),
                LastWriteTimeUtcFiletime = FileTime(basic.LastWriteTime).ToString(),
                ReparseTag = "0x" + tag.ReparseTag.ToString("x8"),
                VolumeSerialNumber = "0x" + id.VolumeSerialNumber.ToString("x16"),
                FileId128 = BitConverter.ToString(id.FileId).Replace("-", "").ToLowerInvariant(),
                FinalPath = finalPath.ToString(),
                IsDirectory = (tag.FileAttributes & 0x10) != 0
            };
        }
    }
}
'@
Add-Type -TypeDefinition $nativeSource -Language CSharp -ErrorAction Stop
$request = [Console]::In.ReadToEnd() | ConvertFrom-Json
$root = [System.IO.Path]::GetFullPath([string]$request.root).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
$rootPrefix = $root + [System.IO.Path]::DirectorySeparatorChar
$scope = @{}
$ancestors = @{}
function Assert-Contained([string]$candidate) {
    $full = [System.IO.Path]::GetFullPath($candidate)
    if (-not $full.Equals($root, [System.StringComparison]::OrdinalIgnoreCase) -and
        -not $full.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "native path escaped repository root"
    }
    return $full
}
function Add-Native([hashtable]$target, [string]$candidate) {
    $full = Assert-Contained $candidate
    $key = $full.ToUpperInvariant()
    if (-not $target.ContainsKey($key)) {
        $target[$key] = [B1NativeMetadata]::Inspect($full)
    }
    return $target[$key]
}
function Get-AncestorChain([string]$candidate) {
    $chain = New-Object System.Collections.Generic.List[string]
    $cursor = Assert-Contained $candidate
    while ($true) {
        $chain.Add($cursor)
        if ($cursor.Equals($root, [System.StringComparison]::OrdinalIgnoreCase)) { break }
        $parent = [System.IO.Directory]::GetParent($cursor)
        if ($null -eq $parent) { throw "native ancestor chain did not reach root" }
        $cursor = $parent.FullName.TrimEnd([System.IO.Path]::DirectorySeparatorChar)
    }
    $chain.Reverse()
    return $chain
}
function Add-Ancestors([string]$candidate) {
    foreach ($ancestor in (Get-AncestorChain $candidate)) {
        $record = Add-Native $ancestors $ancestor
        if ($record.ReparseTag -ne "0x00000000") { return $false }
    }
    return $true
}
function Walk-Scope([string]$candidate, [bool]$recursive) {
    $record = Add-Native $scope $candidate
    if ($record.ReparseTag -ne "0x00000000") { return }
    if ($recursive -and $record.IsDirectory) {
        $children = @([System.IO.Directory]::EnumerateFileSystemEntries($record.Path))
        [Array]::Sort($children, [System.StringComparer]::Ordinal)
        foreach ($child in $children) { Walk-Scope $child $true }
    }
}
foreach ($member in @($request.members)) {
    $full = Assert-Contained ([string]$member.path)
    if (Add-Ancestors $full) {
        Walk-Scope $full ([string]$member.kind -eq "DIRECTORY")
    }
}
$result = [ordered]@{
    schema = "m2.v2.readonly.windows-native-batch.v0.1"
    scopeRecords = @($scope.Values | Sort-Object -Property Path)
    ancestorRecords = @($ancestors.Values | Sort-Object -Property Path)
}
$result | ConvertTo-Json -Depth 8 -Compress
`;

function assertContainedPath(repositoryRoot, absolutePath) {
  const relative = path.relative(repositoryRoot, absolutePath);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail(READONLY_PROOF_REASON.pathSetChanged, "scope member escapes repository root");
  }
}

function canonicalHostNativeRoot(requestedRoot) {
  if (process.platform !== "win32") return requestedRoot;
  try {
    return realpathSync.native(requestedRoot);
  } catch (error) {
    fail(
      READONLY_PROOF_REASON.metadataChangedOrUnsupported,
      "Windows host-native repository root cannot be canonicalized",
      { code: typeof error?.code === "string" ? error.code : "UNKNOWN" },
    );
  }
}

function windowsPathKey(value) {
  return path.resolve(value).normalize("NFC").toLocaleUpperCase("en-US");
}

function collectWindowsNativeContext(repositoryRoot, members) {
  const systemRoot = process.env.SystemRoot;
  const executable = typeof systemRoot === "string" && systemRoot.length > 0
    ? path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
    : null;
  if (!executable || !existsSync(executable)) {
    fail(
      READONLY_PROOF_REASON.metadataChangedOrUnsupported,
      "Windows PowerShell 5.1 native metadata collector is unavailable",
    );
  }
  const memberInputs = [];
  const seen = new Set();
  for (const member of members.filter((entry) => entry.memberKind !== "GIT_REF")) {
    const absolutePath = path.resolve(repositoryRoot, member.repositoryRelativePath);
    assertContainedPath(repositoryRoot, absolutePath);
    const key = windowsPathKey(absolutePath);
    if (!seen.has(key)) {
      seen.add(key);
      memberInputs.push({ path: absolutePath, kind: member.memberKind });
    }
  }
  const encodedCommand = Buffer.from(WINDOWS_NATIVE_COLLECTOR, "utf16le").toString("base64");
  const child = spawnSync(
    executable,
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encodedCommand],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      input: JSON.stringify({ root: repositoryRoot, members: memberInputs }),
      shell: false,
      windowsHide: true,
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (child.status !== 0) {
    fail(
      READONLY_PROOF_REASON.metadataChangedOrUnsupported,
      "Windows native metadata batch failed",
      { stderrDigestSha256: sha256(Buffer.from(String(child.stderr ?? ""), "utf8")) },
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(child.stdout);
  } catch {
    fail(READONLY_PROOF_REASON.metadataChangedOrUnsupported, "Windows native metadata JSON is invalid");
  }
  if (
    parsed?.schema !== "m2.v2.readonly.windows-native-batch.v0.1" ||
    !Array.isArray(parsed.scopeRecords) ||
    !Array.isArray(parsed.ancestorRecords)
  ) {
    fail(READONLY_PROOF_REASON.metadataChangedOrUnsupported, "Windows native metadata result shape is invalid");
  }
  for (const ancestor of parsed.ancestorRecords) {
    if (ancestor.ReparseTag !== "0x00000000") {
      fail(READONLY_PROOF_REASON.linkForbidden, "native Windows ancestor reparse tag is forbidden", {
        pathDigestSha256: sha256(Buffer.from(String(ancestor.Path), "utf8")),
      });
    }
  }
  const records = new Map();
  const identityPaths = new Map();
  for (const raw of parsed.scopeRecords) {
    const absolutePath = path.resolve(String(raw.Path));
    assertContainedPath(repositoryRoot, absolutePath);
    if (raw.ReparseTag !== "0x00000000") {
      fail(READONLY_PROOF_REASON.linkForbidden, "native Windows scope reparse tag is forbidden", {
        pathDigestSha256: sha256(Buffer.from(absolutePath, "utf8")),
      });
    }
    const stats = lstatSync(absolutePath, { bigint: true });
    const memberKind = raw.IsDirectory === true ? "DIRECTORY" : stats.isFile() ? "FILE" : null;
    if (!memberKind) {
      fail(READONLY_PROOF_REASON.metadataChangedOrUnsupported, "Windows scope object kind is unsupported");
    }
    const metadata = {
      platform: "WINDOWS_NATIVE",
      attributes: raw.Attributes,
      creationTimeUtcFiletime: raw.CreationTimeUtcFiletime,
      lastWriteTimeUtcFiletime: raw.LastWriteTimeUtcFiletime,
      reparseTag: raw.ReparseTag,
      volumeSerialNumber: raw.VolumeSerialNumber,
      fileId128: raw.FileId128,
      finalPathDigestSha256: sha256(Buffer.from(String(raw.FinalPath).normalize("NFC"), "utf8")),
    };
    const objectIdentity = `${metadata.volumeSerialNumber}:${metadata.fileId128}`;
    const priorPath = identityPaths.get(objectIdentity);
    if (priorPath && windowsPathKey(priorPath) !== windowsPathKey(absolutePath)) {
      fail(READONLY_PROOF_REASON.linkForbidden, "distinct Windows paths alias one native file identity");
    }
    identityPaths.set(objectIdentity, absolutePath);
    records.set(windowsPathKey(absolutePath), {
      absolutePath,
      repositoryRelativePath: path.relative(repositoryRoot, absolutePath).replaceAll("\\", "/"),
      memberKind,
      metadata,
      objectIdentity,
      stats,
    });
  }
  for (const input of memberInputs) {
    if (!records.has(windowsPathKey(input.path))) {
      fail(READONLY_PROOF_REASON.pathSetChanged, "Windows native scope member is missing");
    }
  }
  return { platform: "WINDOWS_NATIVE", records, key: windowsPathKey };
}

function decodeMountInfoPath(value) {
  return value.replace(/\\([0-7]{3})/gu, (_match, octal) =>
    String.fromCharCode(Number.parseInt(octal, 8)),
  );
}

function readLinuxMountTable() {
  if (!existsSync("/proc/self/mountinfo")) {
    fail(
      READONLY_PROOF_REASON.metadataChangedOrUnsupported,
      "POSIX mount id is not deterministically observable without /proc/self/mountinfo",
    );
  }
  return readFileSync("/proc/self/mountinfo", "utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => line.split(" "))
    .filter((fields) => fields.length >= 6 && /^\d+$/u.test(fields[0]))
    .map((fields) => ({ mountId: fields[0], mountPoint: decodeMountInfoPath(fields[4]) }))
    .sort((left, right) => right.mountPoint.length - left.mountPoint.length);
}

function posixMountId(resolvedPath, mountTable) {
  const matches = mountTable.filter(
    (entry) =>
      resolvedPath === entry.mountPoint ||
      (entry.mountPoint === "/"
        ? resolvedPath.startsWith("/")
        : resolvedPath.startsWith(`${entry.mountPoint}/`)),
  );
  if (matches.length === 0) {
    fail(READONLY_PROOF_REASON.metadataChangedOrUnsupported, "POSIX mount id is unobservable");
  }
  return matches[0].mountId;
}

function posixNativeRecord(repositoryRoot, absolutePath, mountTable) {
  const stats = lstatSync(absolutePath, { bigint: true });
  if (stats.isSymbolicLink()) {
    fail(READONLY_PROOF_REASON.linkForbidden, "POSIX lstat observed a forbidden symbolic link", {
      pathDigestSha256: sha256(Buffer.from(absolutePath, "utf8")),
    });
  }
  const memberKind = stats.isDirectory() ? "DIRECTORY" : stats.isFile() ? "FILE" : null;
  if (!memberKind) {
    fail(READONLY_PROOF_REASON.metadataChangedOrUnsupported, "POSIX scope object kind is unsupported");
  }
  const resolvedPath = realpathSync.native(absolutePath);
  return {
    absolutePath,
    repositoryRelativePath: path.relative(repositoryRoot, absolutePath).replaceAll("\\", "/"),
    memberKind,
    metadata: {
      platform: "POSIX_NATIVE",
      device: stats.dev.toString(),
      inode: stats.ino.toString(),
      mode: stats.mode.toString(),
      uid: stats.uid.toString(),
      gid: stats.gid.toString(),
      size: stats.size.toString(),
      mtimeNs: stats.mtimeNs.toString(),
      ctimeNs: stats.ctimeNs.toString(),
      mountId: posixMountId(resolvedPath, mountTable),
      resolvedPathDigestSha256: sha256(Buffer.from(resolvedPath.normalize("NFC"), "utf8")),
    },
    objectIdentity: `${stats.dev.toString()}:${stats.ino.toString()}`,
    stats,
  };
}

function collectPosixNativeContext(repositoryRoot, members) {
  const mountTable = readLinuxMountTable();
  const records = new Map();
  const identityPaths = new Map();
  const addRecord = (absolutePath) => {
    const key = path.resolve(absolutePath);
    if (records.has(key)) return records.get(key);
    const record = posixNativeRecord(repositoryRoot, key, mountTable);
    const priorPath = identityPaths.get(record.objectIdentity);
    if (priorPath && priorPath !== key) {
      fail(READONLY_PROOF_REASON.linkForbidden, "distinct POSIX paths alias one native file identity");
    }
    identityPaths.set(record.objectIdentity, key);
    records.set(key, record);
    return record;
  };
  const assertAncestors = (absolutePath) => {
    const relative = path.relative(repositoryRoot, absolutePath);
    const parts = relative.split(path.sep).filter(Boolean);
    let cursor = repositoryRoot;
    posixNativeRecord(repositoryRoot, cursor, mountTable);
    for (const part of parts) {
      cursor = path.join(cursor, part);
      posixNativeRecord(repositoryRoot, cursor, mountTable);
    }
  };
  const visit = (absolutePath, recursive) => {
    const record = addRecord(absolutePath);
    if (recursive && record.memberKind === "DIRECTORY") {
      const children = readdirSync(absolutePath)
        .sort((left, right) => left.localeCompare(right, "en"));
      for (const child of children) visit(path.join(absolutePath, child), true);
    }
  };
  for (const member of members.filter((entry) => entry.memberKind !== "GIT_REF")) {
    const absolutePath = path.resolve(repositoryRoot, member.repositoryRelativePath);
    assertContainedPath(repositoryRoot, absolutePath);
    assertAncestors(absolutePath);
    visit(absolutePath, member.memberKind === "DIRECTORY");
  }
  return { platform: "POSIX_NATIVE", records, key: (value) => path.resolve(value) };
}

function collectDefaultNativeContext(repositoryRoot, members) {
  if (process.platform === "win32") return collectWindowsNativeContext(repositoryRoot, members);
  return collectPosixNativeContext(repositoryRoot, members);
}

function observationRecordsForMember(repositoryRoot, member, context) {
  const absoluteRoot = path.resolve(repositoryRoot, member.repositoryRelativePath);
  const rootRecord = context.records.get(context.key(absoluteRoot));
  if (!rootRecord) {
    fail(READONLY_PROOF_REASON.pathSetChanged, "native scope member is missing", {
      memberIdentity: member.memberIdentity,
    });
  }
  const declaredDirectory = member.memberKind === "DIRECTORY";
  if (declaredDirectory !== (rootRecord.memberKind === "DIRECTORY")) {
    fail(READONLY_PROOF_REASON.pathSetChanged, "declared member kind differs from native object kind");
  }
  const selected = [...context.records.values()]
    .filter((record) => {
      if (!declaredDirectory) return context.key(record.absolutePath) === context.key(absoluteRoot);
      const relative = path.relative(absoluteRoot, record.absolutePath);
      return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
    })
    .sort((left, right) => right.repositoryRelativePath.split("/").length - left.repositoryRelativePath.split("/").length);
  const derived = new Map();
  for (const record of selected) {
    const isRoot = context.key(record.absolutePath) === context.key(absoluteRoot);
    const observationKind = isRoot && member.memberKind === "COUNTER" ? "COUNTER" : record.memberKind;
    if (record.memberKind === "FILE") {
      const content = readFileSync(record.absolutePath);
      const contentSha256 = sha256(content);
      derived.set(context.key(record.absolutePath), {
        contentSha256,
        byteLength: safeNumber(record.stats.size, "native file byteLength"),
        memberSetDigestSha256: digest([{
          childName: path.basename(record.absolutePath).normalize("NFC"),
          memberKind: observationKind,
          objectIdentity: record.objectIdentity,
        }]),
      });
      continue;
    }
    const children = selected
      .filter((candidate) => context.key(path.dirname(candidate.absolutePath)) === context.key(record.absolutePath))
      .sort((left, right) => path.basename(left.absolutePath).localeCompare(path.basename(right.absolutePath), "en"));
    const childValues = children.map((child) => ({ child, value: derived.get(context.key(child.absolutePath)) }));
    if (childValues.some((entry) => !entry.value)) {
      fail(READONLY_PROOF_REASON.metadataChangedOrUnsupported, "native directory derivation order is incomplete");
    }
    derived.set(context.key(record.absolutePath), {
      contentSha256: digest(childValues.map(({ child, value }) => ({
        childName: path.basename(child.absolutePath).normalize("NFC"),
        memberKind: child.memberKind,
        contentSha256: value.contentSha256,
      }))),
      byteLength: childValues.reduce((sum, entry) => sum + entry.value.byteLength, 0),
      memberSetDigestSha256: digest(childValues.map(({ child }) => ({
        childName: path.basename(child.absolutePath).normalize("NFC"),
        memberKind: child.memberKind,
        objectIdentity: child.objectIdentity,
      }))),
    });
  }
  return selected
    .sort((left, right) => left.repositoryRelativePath.localeCompare(right.repositoryRelativePath, "en"))
    .map((record) => {
      const isRoot = context.key(record.absolutePath) === context.key(absoluteRoot);
      const memberKind = isRoot && member.memberKind === "COUNTER" ? "COUNTER" : record.memberKind;
      const value = derived.get(context.key(record.absolutePath));
      return {
        authorityRole: member.authorityRole,
        scopeMemberClass: member.scopeMemberClass,
        memberKind,
        repositoryRelativePath: record.repositoryRelativePath,
        contentSha256: value.contentSha256,
        byteLength: value.byteLength,
        memberSetDigestSha256: value.memberSetDigestSha256,
        metadata: record.metadata,
        objectIdentity: record.objectIdentity,
        linkOrReparseType: "NONE",
        referenceTargetDigestSha256: null,
      };
    });
}

function defaultObserveMember(repositoryRoot, member, context) {
  return observationRecordsForMember(repositoryRoot, member, context);
}

function isSystemRef(refName) {
  return (
    refName.startsWith("refs/codex/") ||
    refName.startsWith("refs/worktree/") ||
    refName.startsWith("refs/bisect/") ||
    refName.startsWith("refs/rewritten/")
  );
}

function defaultGitRefObserver(repositoryRoot) {
  const output = execFileSync(
    "git",
    ["for-each-ref", "--format=%(refname)%09%(objecttype)%09%(objectname)%09%(symref)"],
    { cwd: repositoryRoot, encoding: "utf8", windowsHide: true },
  );
  return output
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => {
      const [refName, objectType, targetOid, symbolicTarget = ""] = line.split("\t");
      return { refName, objectType, targetOid, symbolicTarget };
    })
    .filter((entry) => !isSystemRef(entry.refName))
    .sort((left, right) => left.refName.localeCompare(right.refName, "en"));
}

function observeRefs(member, entries) {
  if (!Array.isArray(entries)) {
    fail(READONLY_PROOF_REASON.metadataChangedOrUnsupported, "git ref observer must return an array");
  }
  return entries.map((entry) => {
    const refName = normalizeRepositoryRelativePath(entry.refName, "refName");
    if (!refName.startsWith("refs/") || isSystemRef(refName)) {
      fail(READONLY_PROOF_REASON.pathSetChanged, "git ref observer returned an out-of-scope ref");
    }
    const targetOid = entry.targetOid;
    if (typeof targetOid !== "string" || !/^[0-9a-f]{40,64}$/u.test(targetOid)) {
      fail(READONLY_PROOF_REASON.metadataChangedOrUnsupported, "git ref target oid is invalid");
    }
    const symbolicTarget = entry.symbolicTarget ?? entry.symref ?? "";
    const observation = {
      authorityRole: member.authorityRole,
      scopeMemberClass: member.scopeMemberClass,
      memberKind: "GIT_REF",
      repositoryRelativePath: refName,
      contentSha256: digest({ objectType: entry.objectType, targetOid, symbolicTarget }),
      byteLength: Buffer.byteLength(targetOid, "utf8"),
      memberSetDigestSha256: digest([{ refName, targetOid, symbolicTarget }]),
      metadata: {
        platform: "GIT",
        refName,
        objectType: entry.objectType,
        targetOid,
      },
      objectIdentity: targetOid,
      linkOrReparseType: symbolicTarget ? "SYMBOLIC_REF" : "DIRECT_REF",
      referenceTargetDigestSha256: symbolicTarget
        ? sha256(Buffer.from(symbolicTarget, "utf8"))
        : null,
    };
    return { ...observation, memberIdentity: memberIdentity(observation) };
  });
}

function validateMetadataExact(metadata, observation) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    fail(
      READONLY_PROOF_REASON.metadataChangedOrUnsupported,
      "metadata fingerprint must be an exact native object",
    );
  }
  const expectedFields = METADATA_FIELDS[metadata.platform];
  if (!expectedFields || stable(Object.keys(metadata).sort()) !== stable([...expectedFields].sort())) {
    fail(
      READONLY_PROOF_REASON.metadataChangedOrUnsupported,
      "metadata platform or exact field set is unsupported",
      { metadataKeySetDigestSha256: digest(Object.keys(metadata).sort()) },
    );
  }
  if (metadata.platform === "WINDOWS_NATIVE") {
    if (
      observation.memberKind === "GIT_REF" ||
      !/^0x[0-9a-fA-F]{8}$/u.test(metadata.attributes) ||
      !/^\d+$/u.test(metadata.creationTimeUtcFiletime) ||
      !/^\d+$/u.test(metadata.lastWriteTimeUtcFiletime) ||
      !/^0x[0-9a-fA-F]{8}$/u.test(metadata.reparseTag) ||
      !/^0x[0-9a-fA-F]{16}$/u.test(metadata.volumeSerialNumber) ||
      !/^[0-9a-f]{32}$/u.test(metadata.fileId128) ||
      !SHA256_RE.test(metadata.finalPathDigestSha256)
    ) {
      fail(
        READONLY_PROOF_REASON.metadataChangedOrUnsupported,
        "WINDOWS_NATIVE metadata contains a malformed or non-native field",
      );
    }
    if (metadata.reparseTag !== "0x00000000") {
      fail(READONLY_PROOF_REASON.linkForbidden, "native Windows reparse tag is forbidden");
    }
    return;
  }
  if (metadata.platform === "POSIX_NATIVE") {
    if (
      observation.memberKind === "GIT_REF" ||
      [
        metadata.device,
        metadata.inode,
        metadata.mode,
        metadata.uid,
        metadata.gid,
        metadata.size,
        metadata.mtimeNs,
        metadata.ctimeNs,
        metadata.mountId,
      ].some((value) => typeof value !== "string" || !/^\d+$/u.test(value)) ||
      !SHA256_RE.test(metadata.resolvedPathDigestSha256)
    ) {
      fail(
        READONLY_PROOF_REASON.metadataChangedOrUnsupported,
        "POSIX_NATIVE metadata contains a malformed or non-native field",
      );
    }
    return;
  }
  if (
    observation.memberKind !== "GIT_REF" ||
    metadata.refName !== observation.repositoryRelativePath ||
    typeof metadata.objectType !== "string" ||
    !/^[0-9a-f]{40,64}$/u.test(metadata.targetOid)
  ) {
    fail(
      READONLY_PROOF_REASON.metadataChangedOrUnsupported,
      "GIT metadata contains a malformed ref observation",
    );
  }
}

function normalizeObserved(member, observed) {
  const observation = {
    authorityRole: observed.authorityRole ?? member.authorityRole,
    scopeMemberClass: observed.scopeMemberClass ?? member.scopeMemberClass,
    memberKind: observed.memberKind ?? member.memberKind,
    repositoryRelativePath: observed.repositoryRelativePath ?? member.repositoryRelativePath,
    contentSha256: observed.contentSha256,
    byteLength: observed.byteLength,
    memberSetDigestSha256: observed.memberSetDigestSha256,
    metadata: observed.metadata,
    objectIdentity: observed.objectIdentity,
    linkOrReparseType: observed.linkOrReparseType ?? "NONE",
    referenceTargetDigestSha256: observed.referenceTargetDigestSha256 ?? null,
  };
  if (observation.linkOrReparseType !== "NONE" && observation.memberKind !== "GIT_REF") {
    fail(READONLY_PROOF_REASON.linkForbidden, "observer reported a forbidden link or alias", {
      memberIdentity: member.memberIdentity,
    });
  }
  validateMetadataExact(observation.metadata, observation);
  if (
    member.enforceDeclaredContentDigest === true &&
    observation.repositoryRelativePath === member.repositoryRelativePath &&
    observation.contentSha256 !== member.declaredContentDigestSha256
  ) {
    fail(
      READONLY_PROOF_REASON.metadataChangedOrUnsupported,
      "observed content differs from the formal source bytes used for scope derivation",
      { memberIdentity: member.memberIdentity },
    );
  }
  if (
    !SHA256_RE.test(observation.contentSha256) ||
    !SHA256_RE.test(observation.memberSetDigestSha256) ||
    !observation.metadata ||
    typeof observation.objectIdentity !== "string"
  ) {
    fail(
      READONLY_PROOF_REASON.metadataChangedOrUnsupported,
      "observer returned incomplete persistent observations",
      { memberIdentity: member.memberIdentity },
    );
  }
  return Object.freeze({ ...observation, memberIdentity: memberIdentity(observation) });
}

function normalizeSnapshotOptions(options = {}, synthetic = false) {
  assertObject(options, "snapshotOptions");
  if (utilTypes.isProxy(options)) {
    fail(
      READONLY_PROOF_REASON.claimableInjectionForbidden,
      "snapshot options must not be a Proxy",
      { code: "SNAPSHOT_OPTIONS_PROXY_FORBIDDEN" },
    );
  }
  const prototype = Object.getPrototypeOf(options);
  if (prototype !== Object.prototype && prototype !== null) {
    fail(
      READONLY_PROOF_REASON.claimableInjectionForbidden,
      "snapshot options must be an exact plain record",
      { code: "SNAPSHOT_OPTIONS_PROTOTYPE_FORBIDDEN" },
    );
  }
  if (!synthetic && ("observer" in options || "gitRefObserver" in options)) {
    fail(
      READONLY_PROOF_REASON.claimableInjectionForbidden,
      "claimable snapshot forbids observer and gitRefObserver injection",
      { code: "CLAIMABLE_PROOF_INJECTION_FORBIDDEN" },
    );
  }
  const allowedKeys = synthetic
    ? ["repositoryRoot", "observer", "gitRefObserver"]
    : ["repositoryRoot"];
  const descriptors = Object.getOwnPropertyDescriptors(options);
  const ownKeys = Reflect.ownKeys(options);
  const unknownKeys = ownKeys.filter(
    (key) => typeof key !== "string" || !allowedKeys.includes(key),
  );
  if (unknownKeys.length > 0) {
    fail(
      READONLY_PROOF_REASON.claimableInjectionForbidden,
      "snapshot options contain undeclared keys",
      {
        code: "SNAPSHOT_OPTIONS_KEY_SET_MISMATCH",
        unknownKeys: unknownKeys.map((key) => String(key)).sort(),
      },
    );
  }
  for (const key of ownKeys) {
    const descriptor = descriptors[key];
    if (!descriptor || descriptor.get || descriptor.set) {
      fail(
        READONLY_PROOF_REASON.claimableInjectionForbidden,
        "snapshot options must contain data properties only",
        { code: "SNAPSHOT_OPTIONS_ACCESSOR_FORBIDDEN", key: String(key) },
      );
    }
  }
  const normalized = Object.create(null);
  for (const key of ownKeys) normalized[key] = descriptors[key].value;
  return Object.freeze(normalized);
}

function snapshotReadonlyScopeV0_2Internal(scope, options = {}, synthetic = false) {
  assertObject(scope, "scope");
  const requestedRoot = path.resolve(options.repositoryRoot ?? process.cwd());
  const repositoryRoot = options.observer
    ? requestedRoot
    : canonicalHostNativeRoot(requestedRoot);
  const nativeContext = options.observer
    ? null
    : collectDefaultNativeContext(repositoryRoot, scope.members);
  const observations = [];
  for (const member of scope.members) {
    if (member.discoveryKind === "USER_REPOSITORY_REFS") {
      const refRoot = options.gitRefObserver ? requestedRoot : repositoryRoot;
      const refEntries = (options.gitRefObserver ?? defaultGitRefObserver)(refRoot, member);
      observations.push(...observeRefs(member, refEntries));
      continue;
    }
    const raw = options.observer
      ? options.observer(member, { repositoryRoot })
      : defaultObserveMember(repositoryRoot, member, nativeContext);
    const rawList = Array.isArray(raw) ? raw : [raw];
    for (const entry of rawList) observations.push(normalizeObserved(member, entry));
  }
  observations.sort((left, right) => left.memberIdentity.localeCompare(right.memberIdentity, "en"));
  const identities = observations.map((entry) => entry.memberIdentity);
  if (identities.length !== new Set(identities).size) {
    fail(READONLY_PROOF_REASON.pathSetChanged, "snapshot contains duplicate member identities");
  }
  return Object.freeze({
    schema: synthetic ? SYNTHETIC_SNAPSHOT_SCHEMA : SNAPSHOT_SCHEMA,
    claim: synthetic ? SYNTHETIC_CLAIM : CLAIM,
    claimable: synthetic ? false : true,
    sourceGraphDigestSha256: scope.sourceGraphDigestSha256,
    memberIdentities: Object.freeze(identities),
    memberSetDigestSha256: digest(identities),
    observationSetDigestSha256: digest(observations),
    observations: Object.freeze(observations),
  });
}

/** Capture one exact, host-native, no-follow persistent-state snapshot. */
export function snapshotReadonlyScopeV0_2(scope, options = {}) {
  const normalizedOptions = normalizeSnapshotOptions(options, false);
  if (scope?.[FORMAL_SCOPE_BRAND] !== true || scope?.claimable !== true) {
    fail(
      READONLY_PROOF_REASON.claimableInjectionForbidden,
      "claimable snapshot requires an internally authenticated formal scope",
      { code: "FORMAL_SCOPE_PROVENANCE_REQUIRED" },
    );
  }
  return snapshotReadonlyScopeV0_2Internal(scope, normalizedOptions, false);
}

/** Synthetic-only test seam. Its output is explicitly non-claimable. */
export function snapshotSyntheticReadonlyScopeV0_2ForTests(scope, options = {}) {
  return snapshotReadonlyScopeV0_2Internal(
    scope,
    normalizeSnapshotOptions(options, true),
    true,
  );
}

/** Exercise the host-native collector without issuing a claimable proof artifact. */
export function snapshotHostNativeReadonlyScopeV0_2ForTests(scope, options = {}) {
  return snapshotReadonlyScopeV0_2Internal(
    scope,
    normalizeSnapshotOptions(options, false),
    true,
  );
}

/** Child-process attestation for a fixed stage verifier; never writes a proof artifact. */
export function attestFormalReadonlyRequestV0_2(requestPath) {
  const request = prepareFormalRequestFile(requestPath);
  const scope = deriveReadonlyScopeV0_2Internal(request, true);
  const snapshot = snapshotReadonlyScopeV0_2(scope, {
    repositoryRoot: request.repositoryRoot,
  });
  return Object.freeze({
    readonlyProofCheckedMemberIds: snapshot.memberIdentities,
    readonlyProofCheckedMemberSetDigestSha256: digest(snapshot.memberIdentities),
    readonlyProofSourceGraphDigestSha256: scope.sourceGraphDigestSha256,
    readonlyProofMemberSpecificationSetDigestSha256:
      scope.memberSpecificationSetDigestSha256,
  });
}

function observationMap(snapshot) {
  return new Map(snapshot.observations.map((entry) => [entry.memberIdentity, entry]));
}

function comparePair(left, right, pairName, issues) {
  if (left.memberSetDigestSha256 !== right.memberSetDigestSha256) {
    issues.push(
      issue(READONLY_PROOF_REASON.pathSetChanged, "SCOPE_MEMBER_SET_MISMATCH", {
        snapshotPair: pairName,
        leftMemberSetDigestSha256: left.memberSetDigestSha256,
        rightMemberSetDigestSha256: right.memberSetDigestSha256,
      }),
    );
  }
  const leftMap = observationMap(left);
  const rightMap = observationMap(right);
  for (const identity of sortedUnique([...leftMap.keys(), ...rightMap.keys()])) {
    const leftObservation = leftMap.get(identity);
    const rightObservation = rightMap.get(identity);
    if (!leftObservation || !rightObservation) continue;
    if (stable(leftObservation) !== stable(rightObservation)) {
      issues.push(
        issue(
          READONLY_PROOF_REASON.metadataChangedOrUnsupported,
          "SCOPE_PERSISTENT_OBSERVATION_CHANGED",
          {
            snapshotPair: pairName,
            memberIdentity: identity,
            leftObservationDigestSha256: digest(leftObservation),
            rightObservationDigestSha256: digest(rightObservation),
          },
        ),
      );
    }
  }
}

function exactCheckerIssues(invocations, expectedMemberIds) {
  const issues = [];
  const expected = sortedUnique(expectedMemberIds);
  const exactInvocationKeys = [
    "invocation",
    "passed",
    "checkedMemberIds",
    "exitStatus",
    "verdictDigestSha256",
  ];
  if (!Array.isArray(invocations) || invocations.length !== 2) {
    issues.push(
      issue(READONLY_PROOF_REASON.metadataChangedOrUnsupported, "VERIFIER_INVOCATION_SEQUENCE_MISMATCH", {
        expectedInvocationCount: 2,
        actualInvocationCount: Array.isArray(invocations) ? invocations.length : null,
      }),
    );
  }
  for (let index = 0; index < (Array.isArray(invocations) ? invocations.length : 0); index += 1) {
    const invocation = invocations[index];
    const keys = invocation && typeof invocation === "object" && !Array.isArray(invocation)
      ? Object.keys(invocation).sort()
      : [];
    if (stable(keys) !== stable([...exactInvocationKeys].sort())) {
      issues.push(
        issue(READONLY_PROOF_REASON.metadataChangedOrUnsupported, "VERIFIER_INVOCATION_RECORD_SHAPE_MISMATCH", {
          invocationIndex: index,
          actualKeySetDigestSha256: digest(keys),
        }),
      );
      continue;
    }
    if (invocation.invocation !== index + 1) {
      issues.push(
        issue(READONLY_PROOF_REASON.metadataChangedOrUnsupported, "VERIFIER_INVOCATION_SEQUENCE_MISMATCH", {
          invocationIndex: index,
          expectedInvocationId: index + 1,
          actualInvocationId: invocation.invocation,
        }),
      );
    }
    const rawChecked = invocation.checkedMemberIds;
    const checked = Array.isArray(rawChecked) ? sortedUnique(rawChecked) : [];
    const checkedIsNormalized =
      Array.isArray(rawChecked) &&
      rawChecked.every((identity) => typeof identity === "string" && SHA256_RE.test(identity)) &&
      stable(rawChecked) === stable(checked);
    if (!checkedIsNormalized) {
      issues.push(
        issue(READONLY_PROOF_REASON.pathSetChanged, "VERIFIER_CHECKED_MEMBER_SET_NOT_NORMALIZED", {
          invocation: invocation.invocation,
          checkedMemberSetDigestSha256: digest(rawChecked ?? null),
        }),
      );
    }
    if (stable(checked) !== stable(expected)) {
      issues.push(
        issue(READONLY_PROOF_REASON.pathSetChanged, "VERIFIER_CHECKED_MEMBER_SET_MISMATCH", {
          invocation: invocation.invocation,
          expectedMemberSetDigestSha256: digest(expected),
          checkedMemberSetDigestSha256: digest(checked),
        }),
      );
    }
    if (invocation.passed !== true || invocation.exitStatus !== 0) {
      issues.push(
        issue(READONLY_PROOF_REASON.metadataChangedOrUnsupported, "VERIFIER_INVOCATION_FAILED", {
          invocation: invocation.invocation,
          verdictDigestSha256: invocation.verdictDigestSha256,
        }),
      );
    }
    if (!SHA256_RE.test(invocation.verdictDigestSha256)) {
      issues.push(
        issue(READONLY_PROOF_REASON.metadataChangedOrUnsupported, "VERIFIER_VERDICT_DIGEST_INVALID", {
          invocation: invocation.invocation,
        }),
      );
    }
  }
  if (
    Array.isArray(invocations) &&
    invocations.length === 2 &&
    SHA256_RE.test(invocations[0]?.verdictDigestSha256) &&
    SHA256_RE.test(invocations[1]?.verdictDigestSha256) &&
    invocations[0].verdictDigestSha256 !== invocations[1].verdictDigestSha256
  ) {
    issues.push(
      issue(READONLY_PROOF_REASON.metadataChangedOrUnsupported, "VERIFIER_VERDICT_MISMATCH", {
        firstVerdictDigestSha256: invocations[0].verdictDigestSha256,
        secondVerdictDigestSha256: invocations[1].verdictDigestSha256,
      }),
    );
  }
  return issues;
}

/** Compare before/after-1/after-2 persistent state and both exact checker sets. */
export function compareReadonlySnapshotsV0_2(before, after1, after2, context = {}) {
  const issues = [];
  comparePair(before, after1, "before:after_invocation_1", issues);
  comparePair(after1, after2, "after_invocation_1:after_invocation_2", issues);
  comparePair(before, after2, "before:after_invocation_2", issues);
  issues.push(...exactCheckerIssues(context.invocations, before.memberIdentities));
  if ((context.providerRequestDelta ?? 0) !== 0) {
    issues.push(
      issue(READONLY_PROOF_REASON.metadataChangedOrUnsupported, "PROVIDER_REQUEST_DELTA_NONZERO", {
        providerRequestDelta: context.providerRequestDelta,
      }),
    );
  }
  if ((context.databaseConnectionDelta ?? 0) !== 0) {
    issues.push(
      issue(READONLY_PROOF_REASON.metadataChangedOrUnsupported, "DATABASE_CONNECTION_DELTA_NONZERO", {
        databaseConnectionDelta: context.databaseConnectionDelta,
      }),
    );
  }
  if (context.sentinelInstallDelta !== undefined && context.sentinelInstallDelta !== 2) {
    issues.push(
      issue(READONLY_PROOF_REASON.metadataChangedOrUnsupported, "CHILD_SENTINEL_INSTALL_COUNT_MISMATCH", {
        sentinelInstallDelta: context.sentinelInstallDelta,
      }),
    );
  }
  return Object.freeze({ allPassed: issues.length === 0, issues: Object.freeze(issues) });
}

function assertExternalEnvironmentEmpty(environment) {
  const nonEmpty = EXTERNAL_ENV_NAMES.filter(
    (name) => typeof environment[name] === "string" && environment[name].length > 0,
  );
  if (nonEmpty.length > 0) {
    fail(
      READONLY_PROOF_REASON.metadataChangedOrUnsupported,
      `external provider/database environment must be empty: ${nonEmpty.join(",")}`,
    );
  }
}

function readAuditCounter(counterPath) {
  const raw = readFileSync(counterPath, "utf8").trim();
  if (!/^\d+$/u.test(raw)) {
    fail(READONLY_PROOF_REASON.metadataChangedOrUnsupported, "audited counter is malformed");
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) {
    fail(READONLY_PROOF_REASON.metadataChangedOrUnsupported, "audited counter is outside range");
  }
  return value;
}

function createFormalAuditContext(request) {
  const auditRoot = mkdtempSync(path.join(tmpdir(), "m2-v2-readonly-audit-"));
  const providerCounterPath = path.join(auditRoot, "provider-counter.txt");
  const databaseCounterPath = path.join(auditRoot, "database-counter.txt");
  const installCounterPath = path.join(auditRoot, "sentinel-install-counter.txt");
  for (const counterPath of [providerCounterPath, databaseCounterPath, installCounterPath]) {
    writeFileSync(counterPath, "0\n", { encoding: "utf8", flag: "wx", mode: 0o600 });
  }
  return Object.freeze({
    auditRoot,
    providerCounterPath,
    databaseCounterPath,
    installCounterPath,
    formalRequestSourcePath: request.formalRequestSourcePath,
    sentinelPath: path.resolve(
      request.repositoryRoot,
      "test/helpers/m2V2NoExternalSentinel.js",
    ),
  });
}

function formalChildEnvironment(auditContext) {
  const environment = { ...process.env };
  for (const name of EXTERNAL_ENV_NAMES) environment[name] = "";
  return {
    ...environment,
    NODE_OPTIONS: `--import=${pathToFileURL(auditContext.sentinelPath).href}`,
    M2_V2_S0_SENTINEL_AUTO_INSTALL: "1",
    M2_V2_S0_PROVIDER_COUNTER_FILE: auditContext.providerCounterPath,
    M2_V2_S0_DATABASE_COUNTER_FILE: auditContext.databaseCounterPath,
    M2_V2_S0_SENTINEL_INSTALL_COUNTER_FILE: auditContext.installCounterPath,
    M2_V2_READONLY_FORMAL_REQUEST_PATH: auditContext.formalRequestSourcePath,
  };
}

function cleanupFormalAuditContext(auditContext) {
  if (!auditContext) return;
  rmSync(auditContext.auditRoot, { recursive: true, force: true });
}

function formalVerifierOutputPassed(commandId, parsed, exitStatus) {
  if (exitStatus !== 0 || parsed?.status !== "ok") return false;
  if (commandId === "m2:v2:v2b5:verify") {
    return parsed.issueCount === 0 && Array.isArray(parsed.issues) && parsed.issues.length === 0;
  }
  if (commandId === "m2:v2:v2b6:verify" || commandId === "m2:v2:v2b7:verify") {
    return parsed.allPassed === true && Array.isArray(parsed.issues) && parsed.issues.length === 0;
  }
  if (commandId === "m2:v2:v2b8:verify") {
    return [
      "historicalEvaluationVerified",
      "currentRestatementVerified",
      "effectiveReceiptsVerified",
      "currentAuthorityDigestVerified",
      "transactionBindingVerified",
    ].every((field) => parsed[field] === true)
      && Array.isArray(parsed.verificationIssues)
      && parsed.verificationIssues.length === 0
      && parsed.providerRequestDelta === 0;
  }
  return false;
}

function normalizeInvocationResult(invocation, rawResult) {
  const result = rawResult && typeof rawResult === "object" ? rawResult : { passed: rawResult === true };
  const checkedMemberIds = Array.isArray(result.checkedMemberIds) ? result.checkedMemberIds : [];
  const verdict = {
    passed: result.passed === true,
    checkedMemberIds: sortedUnique(checkedMemberIds),
    verdict: result.verdict ?? null,
    exitStatus: result.exitStatus ?? 0,
  };
  return Object.freeze({
    invocation,
    passed: verdict.passed,
    checkedMemberIds: Object.freeze(verdict.checkedMemberIds),
    exitStatus: verdict.exitStatus,
    verdictDigestSha256: digest(verdict),
  });
}

function invokeCommand(
  verifierCommand,
  invocation,
  scope,
  expectedMemberIds,
  repositoryRoot,
  auditContext,
) {
  assertObject(verifierCommand, "verifierCommand");
  exactKeys(
    verifierCommand,
    ["commandId", "executable", "argv", "scriptDigestSha256"],
    "verifierCommand",
  );
  const binding = FORMAL_VERIFIER_BINDINGS[verifierCommand.commandId];
  const executable = verifierCommand.executable;
  const argv = verifierCommand.argv ?? [];
  if (
    !binding ||
    executable !== process.execPath ||
    stable(argv) !== stable([binding.sourcePath, "verify"]) ||
    verifierCommand.scriptDigestSha256 !== digest({
      commandId: verifierCommand.commandId,
      packageScript: binding.packageScript,
    })
  ) {
    fail(READONLY_PROOF_REASON.roleSetMismatch, "verifier command is not the internal tracked binding");
  }
  assertExternalEnvironmentEmpty(process.env);
  const child = spawnSync(executable, argv, {
    cwd: repositoryRoot,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    env: formalChildEnvironment(auditContext),
  });
  let parsed = null;
  try {
    parsed = JSON.parse(child.stdout || "null");
  } catch {
    parsed = null;
  }
  const checkedMemberIds = parsed?.readonlyProofCheckedMemberIds;
  const expectedCheckedMemberIds = expectedMemberIds;
  if (
    !Array.isArray(checkedMemberIds) ||
    checkedMemberIds.some((entry) => typeof entry !== "string" || !SHA256_RE.test(entry)) ||
    stable(checkedMemberIds) !== stable(sortedUnique(checkedMemberIds)) ||
    stable(checkedMemberIds) !== stable(expectedCheckedMemberIds) ||
    parsed?.readonlyProofCheckedMemberSetDigestSha256 !== digest(checkedMemberIds) ||
    parsed?.readonlyProofSourceGraphDigestSha256 !== scope.sourceGraphDigestSha256 ||
    parsed?.readonlyProofMemberSpecificationSetDigestSha256
      !== scope.memberSpecificationSetDigestSha256
  ) {
    fail(
      READONLY_PROOF_REASON.pathSetChanged,
      "verifier did not attest the exact independently observed readonly member set",
      { commandId: verifierCommand.commandId, invocation },
    );
  }
  const verifierPassed = formalVerifierOutputPassed(
    verifierCommand.commandId,
    parsed,
    child.status,
  );
  return normalizeInvocationResult(invocation, {
    passed: verifierPassed,
    checkedMemberIds,
    verdict: {
      commandId: verifierCommand.commandId,
      scriptDigestSha256: verifierCommand.scriptDigestSha256,
      expectedMemberSetDigestSha256: digest(checkedMemberIds),
      verifierOutputDigestSha256: digest(parsed),
      verifierPassed,
    },
    exitStatus: child.status,
  });
}

function invokeVerifier(request, invocation, scope, expectedMemberIds, repositoryRoot, auditContext) {
  if (typeof request.verifierCallback === "function") {
    return normalizeInvocationResult(
      invocation,
      request.verifierCallback({
        invocation,
        scope,
        expectedMemberIds: Object.freeze([...expectedMemberIds]),
      }),
    );
  }
  if (request.verifierCommand) {
    return invokeCommand(
      request.verifierCommand,
      invocation,
      scope,
      expectedMemberIds,
      repositoryRoot,
      auditContext,
    );
  }
  fail(READONLY_PROOF_REASON.roleSetMismatch, "exactly one verifier callback or command is required");
}

/**
 * Execute the immutable sequence: snapshot, checker, snapshot, checker, snapshot.
 * No proof file is written by this function; callers may persist the returned
 * proof only after all comparisons have completed.
 */
function runReadonlyProofV0_2Unsafe(request, progress, synthetic = false, auditContext = null) {
  assertObject(request, "request");
  if (!synthetic && (typeof request.verifierCallback === "function" || !request.verifierCommand)) {
    fail(
      READONLY_PROOF_REASON.claimableInjectionForbidden,
      "claimable proof requires a verifier command and forbids verifierCallback",
      { code: "CLAIMABLE_PROOF_INJECTION_FORBIDDEN" },
    );
  }
  if (synthetic && request.syntheticTestOnly !== true) {
    fail(
      READONLY_PROOF_REASON.claimableInjectionForbidden,
      "synthetic proof runner requires an explicit syntheticTestOnly marker",
      { code: "SYNTHETIC_TEST_ONLY_MARKER_REQUIRED" },
    );
  }
  if ((typeof request.verifierCallback === "function") === Boolean(request.verifierCommand)) {
    fail(
      READONLY_PROOF_REASON.roleSetMismatch,
      "exactly one of verifierCallback and verifierCommand must be provided",
    );
  }
  const repositoryRoot = path.resolve(request.repositoryRoot ?? process.cwd());
  if (!synthetic) assertExternalEnvironmentEmpty(process.env);
  const scope = deriveReadonlyScopeV0_2Internal({ ...request, repositoryRoot }, !synthetic);
  progress.scope = scope;
  const requestedSnapshotOptions = synthetic
    ? normalizeSnapshotOptions(request.snapshotOptions ?? {}, true)
    : normalizeSnapshotOptions({}, false);
  const snapshotOptions = Object.freeze(Object.assign(
    Object.create(null),
    requestedSnapshotOptions,
    { repositoryRoot },
  ));
  const providerCounterReader = synthetic
    ? request.providerCounterReader ?? (() => 0)
    : null;
  const databaseConnectionCounterReader = synthetic
    ? request.databaseConnectionCounterReader ?? (() => 0)
    : null;
  const providerBefore = synthetic
    ? Number(providerCounterReader({ phase: "before", scope }))
    : readAuditCounter(auditContext.providerCounterPath);
  const databaseBefore = synthetic
    ? Number(databaseConnectionCounterReader({ phase: "before", scope }))
    : readAuditCounter(auditContext.databaseCounterPath);
  const sentinelInstallBefore = synthetic
    ? null
    : readAuditCounter(auditContext.installCounterPath);
  progress.providerBefore = providerBefore;
  progress.databaseBefore = databaseBefore;
  const snapshot = synthetic
    ? () => snapshotReadonlyScopeV0_2Internal(scope, snapshotOptions, true)
    : () => snapshotReadonlyScopeV0_2(scope, snapshotOptions);
  const before = snapshot();
  progress.snapshots.before = before;
  const first = invokeVerifier(
    request,
    1,
    scope,
    before.memberIdentities,
    repositoryRoot,
    auditContext,
  );
  progress.invocations.push(first);
  const after1 = snapshot();
  progress.snapshots.after_invocation_1 = after1;
  const second = invokeVerifier(
    request,
    2,
    scope,
    before.memberIdentities,
    repositoryRoot,
    auditContext,
  );
  progress.invocations.push(second);
  const after2 = snapshot();
  progress.snapshots.after_invocation_2 = after2;
  const providerAfter = synthetic
    ? Number(providerCounterReader({ phase: "after", scope }))
    : readAuditCounter(auditContext.providerCounterPath);
  const databaseAfter = synthetic
    ? Number(databaseConnectionCounterReader({ phase: "after", scope }))
    : readAuditCounter(auditContext.databaseCounterPath);
  const sentinelInstallAfter = synthetic
    ? null
    : readAuditCounter(auditContext.installCounterPath);
  if (!synthetic) assertExternalEnvironmentEmpty(process.env);
  progress.providerAfter = providerAfter;
  progress.databaseAfter = databaseAfter;
  const providerRequestDelta = providerAfter - providerBefore;
  const databaseConnectionDelta = databaseAfter - databaseBefore;
  const sentinelInstallDelta = synthetic
    ? undefined
    : sentinelInstallAfter - sentinelInstallBefore;
  const comparison = compareReadonlySnapshotsV0_2(before, after1, after2, {
    invocations: [first, second],
    providerRequestDelta,
    databaseConnectionDelta,
    sentinelInstallDelta,
  });
  return Object.freeze({
    schema: synthetic ? SYNTHETIC_PROOF_SCHEMA : PROOF_SCHEMA,
    claim: synthetic ? SYNTHETIC_CLAIM : CLAIM,
    claimable: !synthetic,
    allPassed: comparison.allPassed,
    issues: comparison.issues,
    scope,
    snapshots: Object.freeze({
      before,
      after_invocation_1: after1,
      after_invocation_2: after2,
    }),
    invocations: Object.freeze([first, second]),
    invocationCount: 2,
    providerRequestDelta,
    databaseConnectionDelta,
    sentinelInstallDelta: synthetic ? null : sentinelInstallDelta,
  });
}

/**
 * Public fail-closed wrapper. Low-level derive/snapshot helpers throw an Error
 * carrying `reason`; the public runner converts any such evidence gap into a
 * structured, non-writing proof failure and preserves truthful partial counts.
 */
function runReadonlyProofWrapper(request, synthetic) {
  const progress = {
    scope: null,
    snapshots: {},
    invocations: [],
    providerBefore: null,
    providerAfter: null,
    databaseBefore: null,
    databaseAfter: null,
  };
  let auditContext = null;
  try {
    const executableRequest = synthetic ? request : prepareFormalRequestFile(request);
    auditContext = synthetic ? null : createFormalAuditContext(executableRequest);
    return runReadonlyProofV0_2Unsafe(executableRequest, progress, synthetic, auditContext);
  } catch (error) {
    const providerRequestDelta =
      Number.isFinite(progress.providerBefore) && Number.isFinite(progress.providerAfter)
        ? progress.providerAfter - progress.providerBefore
        : null;
    const databaseConnectionDelta =
      Number.isFinite(progress.databaseBefore) && Number.isFinite(progress.databaseAfter)
        ? progress.databaseAfter - progress.databaseBefore
        : null;
    return Object.freeze({
      schema: synthetic ? SYNTHETIC_PROOF_SCHEMA : PROOF_SCHEMA,
      claim: synthetic ? SYNTHETIC_CLAIM : CLAIM,
      claimable: false,
      allPassed: false,
      issues: Object.freeze([
        issue(
          error.reason ?? READONLY_PROOF_REASON.metadataChangedOrUnsupported,
          "READONLY_PROOF_EXECUTION_FAILED",
          {
            message: error.message,
            detailDigestSha256: digest(error.details ?? {}),
          },
        ),
      ]),
      scope: progress.scope,
      snapshots: Object.freeze({ ...progress.snapshots }),
      invocations: Object.freeze([...progress.invocations]),
      invocationCount: progress.invocations.length,
      providerRequestDelta,
      databaseConnectionDelta,
    });
  } finally {
    cleanupFormalAuditContext(auditContext);
  }
}

export function runReadonlyProofV0_2(request) {
  return runReadonlyProofWrapper(request, false);
}

/** Execute logic-only injected fixtures without producing a claimable proof. */
export function runSyntheticReadonlyProofV0_2ForTests(request) {
  return runReadonlyProofWrapper(request, true);
}

function parseCliArgs(argv) {
  const result = {};
  for (const token of argv) {
    if (!token.startsWith("--") || !token.includes("=")) {
      throw new Error("usage: prove_m2_v2_verifier_readonly.mjs --request=<repository-relative-json>");
    }
    const [key, ...rest] = token.slice(2).split("=");
    if (key !== "request" || Object.prototype.hasOwnProperty.call(result, key)) {
      throw new Error("exactly one --request argument is allowed");
    }
    result[key] = rest.join("=");
  }
  if (Object.keys(result).length !== 1) {
    throw new Error("exactly one --request argument is required");
  }
  return result;
}

const invokedAsScript =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (invokedAsScript) {
  try {
    const args = parseCliArgs(process.argv.slice(2));
    if (!args.request) throw new Error("--request is required");
    const result = runReadonlyProofV0_2(args.request);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (!result.allPassed) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        schema: PROOF_SCHEMA,
        allPassed: false,
        issues: [
          {
            reason: error.reason ?? READONLY_PROOF_REASON.metadataChangedOrUnsupported,
            code: "READONLY_PROOF_EXECUTION_FAILED",
            message: error.message,
          },
        ],
      })}\n`,
    );
    process.exitCode = 1;
  }
}
