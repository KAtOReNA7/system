import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { sha256 } from "./pilotCore.js";

export const MIGRATION_IDENTITY_IMPLEMENTATION_STATUS = "PARTIAL_NOT_INTEGRATED";
export const MIGRATION_NATIVE_OBSERVATION_SCHEMA =
  "m2.v2.migration-path-native-observation.private.v0.1";
export const MIGRATION_IDENTITY_SNAPSHOT_SCHEMA =
  "m2.v2.migration-path-identity-snapshot.private.v0.1";
export const MIGRATION_IDENTITY_SET_SCHEMA =
  "m2.v2.migration-path-identity-set.private.v0.1";

export const MIGRATION_IDENTITY_PLATFORMS = Object.freeze([
  "WINDOWS_POWERSHELL_5_1_NATIVE",
  "LINUX_NATIVE",
]);

export const MIGRATION_IDENTITY_STAGES = Object.freeze([
  "BEFORE_ENUMERATION",
  "BEFORE_COPY",
  "BEFORE_ARCHIVE",
  "BEFORE_KEY_WRITE",
  "BEFORE_RECEIPT",
  "AFTER_OPERATION",
]);

export const MIGRATION_IDENTITY_ENDPOINT_ROLES = Object.freeze([
  "REPOSITORY",
  "SOURCE",
  "OUTPUT",
  "KEY",
  "STAGING",
]);

const OBSERVATION_REQUEST_SCHEMA =
  "m2.v2.migration-path-native-observation-request.private.v0.1";
const IDENTITY_SET_DIGEST_BASIS_SCHEMA =
  "m2.v2.migration-path-identity-set-digest-basis.private.v0.1";
const SEPARATION_RESULT_SCHEMA =
  "m2.v2.migration-path-separation-result.private.v0.1";
const WINDOWS_DIRECTORY_ATTRIBUTE = 0x00000010;
const WINDOWS_REPARSE_ATTRIBUTE = 0x00000400;
const POSIX_FILE_TYPE_MASK = 0o170000n;
const POSIX_DIRECTORY_MODE = 0o040000n;
const POSIX_SYMBOLIC_LINK_MODE = 0o120000n;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/u;
const HEX_8_PATTERN = /^0x[a-f0-9]{8}$/u;
const HEX_16_PATTERN = /^[a-f0-9]{16}$/u;
const HEX_32_PATTERN = /^[a-f0-9]{32}$/u;
const DECIMAL_PATTERN = /^(?:0|[1-9][0-9]*)$/u;
const WINDOWS_RECORD_FIELDS = Object.freeze([
  "stage",
  "endpointRole",
  "ancestorIndex",
  "attributes",
  "reparseTag",
  "volumeSerialNumber",
  "fileId128",
  "finalPathDigestSha256",
]);
const POSIX_RECORD_FIELDS = Object.freeze([
  "stage",
  "endpointRole",
  "ancestorIndex",
  "device",
  "inode",
  "mode",
  "mountId",
  "resolvedPathDigestSha256",
  "noFollowVerified",
]);
const ENDPOINT_ROLE_ORDER = new Map(
  MIGRATION_IDENTITY_ENDPOINT_ROLES.map((value, index) => [value, index]),
);
const migrationPathSetCapabilityState = new WeakMap();
const WINDOWS_OBSERVER = fileURLToPath(new URL(
  "../../../scripts/m2-v2-evidence-pilot/inspect_m2_v2_migration_identity_windows.ps1",
  import.meta.url,
));
const POSIX_OBSERVER = fileURLToPath(new URL(
  "../../../scripts/m2-v2-evidence-pilot/inspect_m2_v2_migration_identity_posix.py",
  import.meta.url,
));

export function resolveSafeDirectory(options = {}) {
  assertPlainObject(options, "migration_identity_options_invalid");
  assertExactFields(
    options,
    ["path", "endpointRole", "stage"],
    "migration_identity_options_invalid",
  );
  const path = normalizeRequestedPath(options.path);
  const endpointRole = requiredEnum(
    options.endpointRole,
    MIGRATION_IDENTITY_ENDPOINT_ROLES,
    "migration_identity_endpoint_role_invalid",
  );
  const stage = requiredEnum(
    options.stage,
    MIGRATION_IDENTITY_STAGES,
    "migration_identity_stage_invalid",
  );
  const platform = nativePlatformForHost();
  const request = {
    schema: OBSERVATION_REQUEST_SCHEMA,
    path,
    endpointRole,
    stage,
  };
  const rawObservation = invokeNativeObserver(platform, request);
  const snapshot = normalizeObservation(rawObservation, { platform, endpointRole, stage });
  assertSafeDirectorySnapshot(snapshot);
  return deepFreeze(snapshot);
}

export function captureMigrationPathSet(options = {}) {
  assertPlainObject(options, "migration_identity_options_invalid");
  assertExactFields(options, ["endpoints", "stage"], "migration_identity_options_invalid");
  if (!Array.isArray(options.endpoints) || options.endpoints.length === 0) {
    throw new Error("migration_identity_endpoints_invalid");
  }
  const stage = requiredEnum(
    options.stage,
    MIGRATION_IDENTITY_STAGES,
    "migration_identity_stage_invalid",
  );
  const roles = new Set();
  const snapshots = options.endpoints.map((endpoint) => {
    if (!isPlainObject(endpoint)) throw new Error("migration_identity_endpoint_invalid");
    assertExactFields(
      endpoint,
      ["path", "endpointRole"],
      "migration_identity_endpoint_invalid",
    );
    if (roles.has(endpoint.endpointRole)) throw new Error("migration_identity_endpoint_role_duplicate");
    roles.add(endpoint.endpointRole);
    return resolveSafeDirectory({
      path: endpoint.path,
      endpointRole: endpoint.endpointRole,
      stage,
    });
  }).sort(compareSnapshots);
  const platforms = new Set(snapshots.map((snapshot) => snapshot.platform));
  if (platforms.size !== 1) throw new Error("migration_identity_platform_set_mismatch");
  const basis = {
    schema: IDENTITY_SET_DIGEST_BASIS_SCHEMA,
    platform: snapshots[0].platform,
    stage,
    snapshots,
  };
  const identitySet = deepFreeze({
    schema: MIGRATION_IDENTITY_SET_SCHEMA,
    platform: basis.platform,
    stage,
    snapshots,
    identitySetDigestSha256: sha256(basis),
  });
  const capability = Object.freeze(Object.create(null));
  migrationPathSetCapabilityState.set(capability, identitySet);
  return capability;
}

export function assertSeparated(identityCapability) {
  const normalized = requireMigrationPathSetCapability(identityCapability);
  const finalRecords = normalized.snapshots.map((snapshot) => ({
    endpointRole: snapshot.endpointRole,
    record: snapshot.records.at(-1),
  }));
  const physicalOwners = new Map();
  for (const entry of finalRecords) {
    const key = physicalObjectKey(normalized.platform, entry.record);
    if (physicalOwners.has(key)) throw new Error("migration_directory_identity_collision");
    physicalOwners.set(key, entry.endpointRole);
  }

  let sourceInsideRepository = false;
  for (const left of finalRecords) {
    const leftKey = physicalObjectKey(normalized.platform, left.record);
    for (const right of normalized.snapshots) {
      if (left.endpointRole === right.endpointRole) continue;
      const isAncestor = right.records
        .slice(0, -1)
        .some((record) => physicalObjectKey(normalized.platform, record) === leftKey);
      if (!isAncestor) continue;
      if (left.endpointRole === "REPOSITORY" && right.endpointRole === "SOURCE") {
        sourceInsideRepository = true;
        continue;
      }
      throw new Error("migration_directory_ancestor_relation");
    }
  }
  const roles = new Set(normalized.snapshots.map((snapshot) => snapshot.endpointRole));
  if (roles.has("REPOSITORY") && roles.has("SOURCE") && !sourceInsideRepository) {
    throw new Error("migration_source_not_inside_repository");
  }
  return deepFreeze({
    schema: SEPARATION_RESULT_SCHEMA,
    platform: normalized.platform,
    stage: normalized.stage,
    sourceInsideRepository,
    identitySetDigestSha256: normalized.identitySetDigestSha256,
  });
}

export function verifyStableIdentity(beforeIdentityCapability, afterIdentityCapability) {
  const before = requireMigrationPathSetCapability(beforeIdentityCapability);
  const after = requireMigrationPathSetCapability(afterIdentityCapability);
  if (before.platform !== after.platform || before.snapshots.length !== after.snapshots.length) {
    throw new Error("migration_identity_changed");
  }
  for (let index = 0; index < before.snapshots.length; index += 1) {
    const left = before.snapshots[index];
    const right = after.snapshots[index];
    if (left.endpointRole !== right.endpointRole || left.records.length !== right.records.length) {
      throw new Error("migration_identity_changed");
    }
    for (let ancestorIndex = 0; ancestorIndex < left.records.length; ancestorIndex += 1) {
      const leftRecord = left.records[ancestorIndex];
      const rightRecord = right.records[ancestorIndex];
      if (leftRecord.ancestorIndex !== rightRecord.ancestorIndex
          || stableIdentityTuple(before.platform, leftRecord)
            !== stableIdentityTuple(after.platform, rightRecord)) {
        throw new Error("migration_identity_changed");
      }
    }
  }
  return true;
}

function requireMigrationPathSetCapability(capability) {
  if (capability === null
      || (typeof capability !== "object" && typeof capability !== "function")) {
    throw new Error("migration_identity_capability_invalid");
  }
  const identitySet = migrationPathSetCapabilityState.get(capability);
  if (identitySet === undefined) throw new Error("migration_identity_capability_invalid");
  return validateIdentitySet(identitySet);
}

function invokeNativeObserver(platform, request) {
  if (platform === "WINDOWS_POWERSHELL_5_1_NATIVE") {
    const systemRoot = process.env.SystemRoot;
    if (typeof systemRoot !== "string" || systemRoot.length === 0 || !existsSync(WINDOWS_OBSERVER)) {
      throw new Error("migration_native_observer_unavailable");
    }
    const executable = resolve(
      systemRoot,
      "System32",
      "WindowsPowerShell",
      "v1.0",
      "powershell.exe",
    );
    if (!existsSync(executable)) throw new Error("migration_native_observer_unavailable");
    return runObserverProcess(executable, [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      WINDOWS_OBSERVER,
    ], request);
  }
  if (platform === "LINUX_NATIVE") {
    if (!existsSync(POSIX_OBSERVER)) throw new Error("migration_native_observer_unavailable");
    return runObserverProcess("python3", [POSIX_OBSERVER], request);
  }
  throw new Error("migration_native_platform_unsupported");
}

function runObserverProcess(executable, args, request) {
  const result = spawnSync(executable, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    input: `${JSON.stringify(request)}\n`,
    maxBuffer: 4 * 1024 * 1024,
    shell: false,
    windowsHide: true,
  });
  if (result.error) throw new Error("migration_native_observer_unavailable");
  if (result.status !== 0 || result.stderr.trim() !== "") {
    throw new Error(extractObserverFailureCode(result.stderr));
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error("migration_native_observer_output_invalid");
  }
}

function extractObserverFailureCode(stderr) {
  const rows = String(stderr ?? "").trim().split(/\r?\n/gu).filter(Boolean);
  try {
    const value = JSON.parse(rows.at(-1) ?? "{}");
    if (/^migration_[a-z0-9_]+$/u.test(String(value?.code ?? ""))) return value.code;
  } catch {
    // Native observer details can contain paths. Never forward them.
  }
  return "migration_native_observer_failed";
}

function normalizeObservation(observation, expected) {
  assertPlainObject(observation, "migration_native_observer_output_invalid");
  assertExactFields(observation, [
    "schema",
    "platform",
    "stage",
    "endpointRole",
    "records",
  ], "migration_native_observer_output_invalid");
  if (observation.schema !== MIGRATION_NATIVE_OBSERVATION_SCHEMA
      || observation.platform !== expected.platform
      || observation.stage !== expected.stage
      || observation.endpointRole !== expected.endpointRole
      || !Array.isArray(observation.records)
      || observation.records.length === 0) {
    throw new Error("migration_native_observer_output_invalid");
  }
  const records = observation.records.map((record, ancestorIndex) => normalizeEvidenceRecord(
    record,
    expected.platform,
    expected.endpointRole,
    expected.stage,
    ancestorIndex,
  ));
  return {
    schema: MIGRATION_IDENTITY_SNAPSHOT_SCHEMA,
    platform: expected.platform,
    stage: expected.stage,
    endpointRole: expected.endpointRole,
    records,
  };
}

function normalizeEvidenceRecord(record, platform, endpointRole, stage, ancestorIndex) {
  assertPlainObject(record, "migration_native_observer_output_invalid");
  const fields = platform === "WINDOWS_POWERSHELL_5_1_NATIVE"
    ? WINDOWS_RECORD_FIELDS
    : POSIX_RECORD_FIELDS;
  assertExactFields(record, fields, "migration_native_observer_output_invalid");
  if (record.stage !== stage
      || record.endpointRole !== endpointRole
      || record.ancestorIndex !== ancestorIndex
      || !Number.isSafeInteger(record.ancestorIndex)
      || record.ancestorIndex < 0) {
    throw new Error("migration_native_observer_output_invalid");
  }
  requiredEnum(record.stage, MIGRATION_IDENTITY_STAGES, "migration_native_observer_output_invalid");
  requiredEnum(
    record.endpointRole,
    MIGRATION_IDENTITY_ENDPOINT_ROLES,
    "migration_native_observer_output_invalid",
  );
  if (platform === "WINDOWS_POWERSHELL_5_1_NATIVE") {
    if (!HEX_8_PATTERN.test(record.attributes)
        || !HEX_8_PATTERN.test(record.reparseTag)
        || !HEX_16_PATTERN.test(record.volumeSerialNumber)
        || !HEX_32_PATTERN.test(record.fileId128)
        || !DIGEST_PATTERN.test(record.finalPathDigestSha256)) {
      throw new Error("migration_native_observer_output_invalid");
    }
    return {
      stage: record.stage,
      endpointRole: record.endpointRole,
      ancestorIndex: record.ancestorIndex,
      attributes: record.attributes,
      reparseTag: record.reparseTag,
      volumeSerialNumber: record.volumeSerialNumber,
      fileId128: record.fileId128,
      finalPathDigestSha256: record.finalPathDigestSha256,
    };
  }
  if (![record.device, record.inode, record.mode, record.mountId].every((value) => (
    typeof value === "string" && DECIMAL_PATTERN.test(value)
  )) || !DIGEST_PATTERN.test(record.resolvedPathDigestSha256)
      || record.noFollowVerified !== true) {
    throw new Error("migration_native_observer_output_invalid");
  }
  return {
    stage: record.stage,
    endpointRole: record.endpointRole,
    ancestorIndex: record.ancestorIndex,
    device: record.device,
    inode: record.inode,
    mode: record.mode,
    mountId: record.mountId,
    resolvedPathDigestSha256: record.resolvedPathDigestSha256,
    noFollowVerified: true,
  };
}

function assertSafeDirectorySnapshot(snapshot) {
  if (snapshot.platform === "WINDOWS_POWERSHELL_5_1_NATIVE") {
    for (const record of snapshot.records) {
      const attributes = Number.parseInt(record.attributes.slice(2), 16);
      if (record.reparseTag !== "0x00000000"
          || (attributes & WINDOWS_REPARSE_ATTRIBUTE) !== 0) {
        throw new Error("migration_link_or_mount_forbidden");
      }
      if ((attributes & WINDOWS_DIRECTORY_ATTRIBUTE) === 0) {
        throw new Error("migration_identity_not_directory");
      }
    }
    return;
  }
  let previousMountId = snapshot.records[0].mountId;
  for (const record of snapshot.records) {
    const mode = BigInt(record.mode);
    const fileType = mode & POSIX_FILE_TYPE_MASK;
    if (fileType === POSIX_SYMBOLIC_LINK_MODE) {
      throw new Error("migration_link_or_mount_forbidden");
    }
    if (fileType !== POSIX_DIRECTORY_MODE) throw new Error("migration_identity_not_directory");
    if (record.mountId !== previousMountId) {
      throw new Error("migration_link_or_mount_forbidden");
    }
    previousMountId = record.mountId;
  }
}

function validateIdentitySet(identitySet) {
  assertPlainObject(identitySet, "migration_identity_set_invalid");
  assertExactFields(identitySet, [
    "schema",
    "platform",
    "stage",
    "snapshots",
    "identitySetDigestSha256",
  ], "migration_identity_set_invalid");
  if (identitySet.schema !== MIGRATION_IDENTITY_SET_SCHEMA
      || !MIGRATION_IDENTITY_PLATFORMS.includes(identitySet.platform)
      || !MIGRATION_IDENTITY_STAGES.includes(identitySet.stage)
      || !Array.isArray(identitySet.snapshots)
      || identitySet.snapshots.length === 0
      || !DIGEST_PATTERN.test(identitySet.identitySetDigestSha256)) {
    throw new Error("migration_identity_set_invalid");
  }
  const snapshots = identitySet.snapshots.map((snapshot) => {
    assertPlainObject(snapshot, "migration_identity_set_invalid");
    assertExactFields(snapshot, [
      "schema",
      "platform",
      "stage",
      "endpointRole",
      "records",
    ], "migration_identity_set_invalid");
    if (snapshot.schema !== MIGRATION_IDENTITY_SNAPSHOT_SCHEMA
        || snapshot.platform !== identitySet.platform
        || snapshot.stage !== identitySet.stage
        || !Array.isArray(snapshot.records)
        || snapshot.records.length === 0) {
      throw new Error("migration_identity_set_invalid");
    }
    const records = snapshot.records.map((record, ancestorIndex) => normalizeEvidenceRecord(
      record,
      identitySet.platform,
      snapshot.endpointRole,
      identitySet.stage,
      ancestorIndex,
    ));
    const normalizedSnapshot = { ...snapshot, records };
    assertSafeDirectorySnapshot(normalizedSnapshot);
    return normalizedSnapshot;
  }).sort(compareSnapshots);
  const roles = snapshots.map((snapshot) => snapshot.endpointRole);
  if (new Set(roles).size !== roles.length) throw new Error("migration_identity_set_invalid");
  const basis = {
    schema: IDENTITY_SET_DIGEST_BASIS_SCHEMA,
    platform: identitySet.platform,
    stage: identitySet.stage,
    snapshots,
  };
  if (identitySet.identitySetDigestSha256 !== sha256(basis)) {
    throw new Error("migration_identity_set_invalid");
  }
  return { ...identitySet, snapshots };
}

function physicalObjectKey(platform, record) {
  return platform === "WINDOWS_POWERSHELL_5_1_NATIVE"
    ? `${record.volumeSerialNumber}:${record.fileId128}`
    : `${record.device}:${record.inode}`;
}

function stableIdentityTuple(platform, record) {
  return platform === "WINDOWS_POWERSHELL_5_1_NATIVE"
    ? [record.volumeSerialNumber, record.fileId128, record.finalPathDigestSha256].join(":")
    : [
      record.mountId,
      record.device,
      record.inode,
      record.mode,
      record.resolvedPathDigestSha256,
    ].join(":");
}

function compareSnapshots(left, right) {
  return ENDPOINT_ROLE_ORDER.get(left.endpointRole) - ENDPOINT_ROLE_ORDER.get(right.endpointRole);
}

function nativePlatformForHost() {
  if (process.platform === "win32") return "WINDOWS_POWERSHELL_5_1_NATIVE";
  if (process.platform === "linux") return "LINUX_NATIVE";
  throw new Error("migration_native_platform_unsupported");
}

function normalizeRequestedPath(value) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    throw new Error("migration_identity_path_invalid");
  }
  const normalized = value.normalize("NFC");
  if (/^(?:\\\\[?.]\\|\\\?\?\\)/u.test(normalized)) {
    throw new Error("migration_identity_path_device_namespace");
  }
  if (process.platform !== "win32" && (normalized.startsWith("//") || normalized.includes("\\"))) {
    throw new Error("migration_identity_path_alias_invalid");
  }
  const pathSegments = normalized.split(/[\\/]+/u).filter(Boolean);
  if (pathSegments.some((segment) => segment === "." || segment === "..")) {
    throw new Error("migration_identity_path_traversal");
  }
  if (pathSegments.some((segment) => /[. ]$/u.test(segment))) {
    throw new Error("migration_identity_path_alias_invalid");
  }
  if (pathSegments.some((segment) => /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/iu.test(segment))) {
    throw new Error("migration_identity_path_alias_invalid");
  }
  const drivePrefix = /^[A-Za-z]:[\\/]/u.test(normalized);
  const colonScope = drivePrefix ? normalized.slice(2) : normalized;
  if (colonScope.includes(":")) throw new Error("migration_identity_path_ads_invalid");
  if (!isAbsolute(normalized)) throw new Error("migration_identity_path_not_absolute");
  return resolve(normalized).normalize("NFC");
}

function requiredEnum(value, values, code) {
  const allowed = values instanceof Set ? values : new Set(values);
  if (typeof value !== "string" || !allowed.has(value)) throw new Error(code);
  return value;
}

function assertPlainObject(value, code) {
  if (!isPlainObject(value)) throw new Error(code);
}

function assertExactFields(value, expectedFields, code) {
  const actual = Object.keys(value).sort();
  const expected = [...expectedFields].sort();
  if (actual.length !== expected.length
      || actual.some((field, index) => field !== expected[index])) throw new Error(code);
}

function deepFreeze(value) {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}
