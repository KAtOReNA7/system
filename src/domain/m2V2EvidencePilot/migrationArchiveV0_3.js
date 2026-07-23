import { createHash } from "node:crypto";
import { constants as bufferConstants } from "node:buffer";
import { constants as fsConstants } from "node:fs";
import { lstat, open as openFile } from "node:fs/promises";
import { createInflateRaw, inflateRawSync } from "node:zlib";

export const MIGRATION_ARCHIVE_V0_3_INNER_FILENAME =
  "m2-v2-private-state-migration-package.v0.3.zip";
export const MIGRATION_ARCHIVE_V0_3_MANIFEST_PATH =
  "metadata/migration-manifest.private.json";
export const MIGRATION_ARCHIVE_V0_3_IMPLEMENTATION_STATUS =
  "PARTIAL_NOT_INTEGRATED_STRUCTURE_ONLY";
export const MIGRATION_ARCHIVE_V0_3_CAPABILITY_SCOPE = "STRUCTURE_ONLY";
export const MIGRATION_ARCHIVE_V0_3_POLICY_DIGEST_SHA256 =
  "ca622afb98c223e3e1c5d97d35ac64c805065395f172f6237f9078d36a757163";
export const MIGRATION_ARCHIVE_V0_3_MAX_IN_MEMORY_ARCHIVE_BYTES = 64 * 1024 * 1024;
export const MIGRATION_ARCHIVE_V0_3_MAX_IN_MEMORY_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;
export const MIGRATION_ARCHIVE_V0_3_MAX_MANIFEST_BYTES = 64 * 1024 * 1024;

export const MIGRATION_ARCHIVE_V0_3_BUDGETS = Object.freeze({
  maxEntryCount: 100_000,
  maxPathLengthBytes: 1_024,
  maxPerEntryCompressedBytes: 536_870_912,
  maxPerEntryUncompressedBytes: 2_147_483_648,
  maxTotalCompressedBytes: 8_589_934_592,
  maxTotalUncompressedBytes: 17_179_869_184,
  maxCompressionRatio: 200,
});

const PACKAGE_SCHEMA = "m2.v2.private-state-migration-package.v0.3";
const MANIFEST_FIELDS = Object.freeze([
  "schema",
  "packageId",
  "sourceExactHead",
  "policyDigestSha256",
  "archiveMembers",
  "payloadRoles",
  "identityReceiptDigestSha256",
  "createdAt",
  "manifestDigestSha256",
]);
const MEMBER_FIELDS = Object.freeze([
  "canonicalPath",
  "memberKind",
  "payloadRole",
  "compressionMethod",
  "crc32",
  "compressedBytes",
  "uncompressedBytes",
  "contentSha256",
  "unixMode",
]);
const ROLE_FIELDS = Object.freeze([
  "roleId",
  "required",
  "minimumCardinality",
  "maximumCardinality",
  "memberPaths",
]);
const BUILDER_FIELDS = Object.freeze([
  "packageId",
  "sourceExactHead",
  "policyDigestSha256",
  "identityReceiptDigestSha256",
  "createdAt",
  "payloadRoles",
  "members",
]);
const BUILDER_MEMBER_FIELDS = Object.freeze([
  "canonicalPath",
  "memberKind",
  "payloadRole",
  "bytes",
]);
const BUILDER_ROLE_FIELDS = Object.freeze([
  "roleId",
  "required",
  "minimumCardinality",
  "maximumCardinality",
]);

const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const DATA_DESCRIPTOR_SIGNATURE = 0x08074b50;
const EOCD_SIGNATURE = 0x06054b50;
const ZIP64_EOCD_SIGNATURE = 0x06064b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const ZIP64_EXTRA_ID = 0x0001;
const UNICODE_PATH_EXTRA_ID = 0x7075;
const UTF8_FLAG = 0x0800;
const DATA_DESCRIPTOR_FLAG = 0x0008;
const ALLOWED_FLAGS = UTF8_FLAG | DATA_DESCRIPTOR_FLAG;
const UINT16_SENTINEL = 0xffff;
const UINT32_SENTINEL = 0xffffffff;
const REGULAR_POSIX_MODE = 0o100644;
const DIRECTORY_POSIX_MODE = 0o040755;
const DOS_DIRECTORY_ATTRIBUTE = 0x10;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const HEAD_PATTERN = /^[0-9a-f]{40}$/u;
const CRC32_PATTERN = /^[0-9a-f]{8}$/u;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const RESERVED_WINDOWS_NAMES = /^(?:CON|PRN|AUX|NUL|CLOCK\$|CONIN\$|CONOUT\$|COM[1-9¹²³]|LPT[1-9¹²³])(?:\..*)?$/iu;
const WINDOWS_FORBIDDEN_MEMBER_CHARACTERS = /[<>"|?*\u0000-\u001f\u007f]/u;
const STRICT_UTF8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const TYPED_ARRAY_PROTOTYPE = Object.getPrototypeOf(Uint8Array.prototype);
const TYPED_ARRAY_BUFFER_GETTER = Object.getOwnPropertyDescriptor(
  TYPED_ARRAY_PROTOTYPE,
  "buffer",
).get;
const TYPED_ARRAY_BYTE_LENGTH_GETTER = Object.getOwnPropertyDescriptor(
  TYPED_ARRAY_PROTOTYPE,
  "byteLength",
).get;
const TYPED_ARRAY_BYTE_OFFSET_GETTER = Object.getOwnPropertyDescriptor(
  TYPED_ARRAY_PROTOTYPE,
  "byteOffset",
).get;
const verifiedArchiveStates = new WeakMap();
const fileCapabilityFinalizer = new FinalizationRegistry((handle) => {
  void handle.close().catch(() => {});
});

const FORMAT_POLICIES = Object.freeze({
  "v0.1": frozenNullRecord({
    format: "v0.1",
    inspectAllowed: true,
    repackageToV0_3Allowed: true,
    directRestoreAllowed: false,
    autoPromotionAllowed: false,
    contractDirectRestoreEligible: false,
    contractAutoPromotionEligible: false,
    currentAuthorityGranted: false,
  }),
  "v0.2": frozenNullRecord({
    format: "v0.2",
    inspectAllowed: true,
    repackageToV0_3Allowed: true,
    directRestoreAllowed: false,
    autoPromotionAllowed: false,
    contractDirectRestoreEligible: false,
    contractAutoPromotionEligible: false,
    currentAuthorityGranted: false,
  }),
  "v0.3": frozenNullRecord({
    format: "v0.3",
    inspectAllowed: true,
    repackageToV0_3Allowed: true,
    directRestoreAllowed: false,
    autoPromotionAllowed: false,
    contractDirectRestoreEligible: true,
    contractAutoPromotionEligible: true,
    currentAuthorityGranted: false,
  }),
});

export function getMigrationArchiveCompatibilityPolicy(format) {
  const policy = FORMAT_POLICIES[format];
  if (policy === undefined) throw archiveError("migration_archive_format_unsupported");
  return policy;
}

/**
 * Builds the deterministic, unencrypted inner ZIP. The encrypted 7z transport
 * envelope is intentionally outside this module and must contain exactly the
 * exported fixed filename when it is integrated.
 */
export function buildCanonicalMigrationArchiveV0_3(options) {
  assertExactObject(options, BUILDER_FIELDS, "migration_archive_builder_input_invalid");
  assertIdentifier(options.packageId, "migration_archive_package_id_invalid");
  assertPattern(options.sourceExactHead, HEAD_PATTERN, "migration_archive_source_head_invalid");
  if (options.policyDigestSha256 !== MIGRATION_ARCHIVE_V0_3_POLICY_DIGEST_SHA256) {
    throw archiveError("migration_archive_policy_digest_invalid");
  }
  assertPattern(
    options.identityReceiptDigestSha256,
    SHA256_PATTERN,
    "migration_archive_identity_receipt_digest_invalid",
  );
  assertCreatedAt(options.createdAt);
  if (!Array.isArray(options.members) || !Array.isArray(options.payloadRoles)) {
    throw archiveError("migration_archive_builder_input_invalid");
  }
  if (options.members.length + 1 > MIGRATION_ARCHIVE_V0_3_BUDGETS.maxEntryCount) {
    throw archiveError("migration_archive_budget_exceeded");
  }

  const roleDefinitions = validateBuilderRoles(options.payloadRoles);
  const members = options.members.map((member) => (
    validateBuilderMemberPreflight(member, roleDefinitions)
  ));
  members.sort((left, right) => compareUtf8(left.canonicalPath, right.canonicalPath));
  assertNoPathCollisions([
    ...members.map((member) => ({
      path: member.canonicalPath,
      rawName: Buffer.from(member.canonicalPath, "utf8"),
    })),
    {
      path: MIGRATION_ARCHIVE_V0_3_MANIFEST_PATH,
      rawName: Buffer.from(MIGRATION_ARCHIVE_V0_3_MANIFEST_PATH, "utf8"),
    },
  ]);

  const payloadRoles = buildPayloadRoles(roleDefinitions, members);
  validateRoleCardinalities(payloadRoles);
  const preflightArchiveMembers = members.map((member) => nullRecord({
    canonicalPath: member.canonicalPath,
    memberKind: member.memberKind,
    payloadRole: member.payloadRole,
    compressionMethod: "STORE",
    crc32: "00000000",
    compressedBytes: member.byteLength,
    uncompressedBytes: member.byteLength,
    contentSha256: member.memberKind === "DIRECTORY" ? EMPTY_SHA256 : "0".repeat(64),
    unixMode: member.memberKind === "DIRECTORY" ? "0755" : "0644",
  }));
  const preflightManifest = makeBuilderManifest(options, preflightArchiveMembers, payloadRoles);
  preflightManifest.manifestDigestSha256 = "0".repeat(64);
  const manifestByteLength = Buffer.byteLength(canonicalJson(preflightManifest), "utf8");
  enforceBuilderPreflight(members, manifestByteLength);

  const materializedMembers = members.map((member) => {
    const bytes = safeBuilderByteView(member);
    const checksum = crc32(bytes);
    return {
      ...member,
      bytes,
      checksum,
      contentSha256: member.memberKind === "DIRECTORY" ? EMPTY_SHA256 : sha256(bytes),
    };
  });
  const archiveMembers = materializedMembers.map((member) => (
    nullRecord({
      canonicalPath: member.canonicalPath,
      memberKind: member.memberKind,
      payloadRole: member.payloadRole,
      compressionMethod: "STORE",
      crc32: hex32(member.checksum),
      compressedBytes: member.byteLength,
      uncompressedBytes: member.byteLength,
      contentSha256: member.contentSha256,
      unixMode: member.memberKind === "DIRECTORY" ? "0755" : "0644",
    })
  ));
  const manifest = makeBuilderManifest(options, archiveMembers, payloadRoles);
  manifest.manifestDigestSha256 = digestManifestBasis(manifest);
  const manifestBytes = Buffer.from(canonicalJson(manifest), "utf8");
  if (manifestBytes.length !== manifestByteLength) {
    throw archiveError("migration_archive_builder_preflight_mismatch");
  }
  const zipMembers = materializedMembers.map((member) => ({
    canonicalPath: member.canonicalPath,
    memberKind: member.memberKind,
    bytes: member.bytes,
    checksum: member.checksum,
  }));
  zipMembers.push({
    canonicalPath: MIGRATION_ARCHIVE_V0_3_MANIFEST_PATH,
    memberKind: "REGULAR_FILE",
    bytes: manifestBytes,
    checksum: crc32(manifestBytes),
  });
  zipMembers.sort((left, right) => compareUtf8(left.canonicalPath, right.canonicalPath));
  const archiveBytes = writeCanonicalStoreZip(zipMembers);
  verifyMemoryArchiveBytes(archiveBytes);
  return frozenNullRecord({
    archiveBytes,
    manifest: deepFreezeClone(manifest),
    manifestBytes: Buffer.from(manifestBytes),
  });
}

/**
 * Validates the complete raw ZIP before issuing an opaque capability. No
 * manifest, validator, platform, observer, evidence, or fault seam is accepted.
 */
export function verifyMigrationArchiveV0_3(archiveBytes) {
  if (arguments.length !== 1) throw archiveError("migration_archive_verifier_input_invalid");
  const bytes = copyArchiveBytes(archiveBytes);
  const verified = verifyMemoryArchiveBytes(bytes);
  const capability = Object.freeze(Object.create(null));
  verifiedArchiveStates.set(capability, verified);
  return capability;
}

function verifyMemoryArchiveBytes(bytes) {
  const structure = parseRawZipStructure(bytes);
  enforceRawBudgets(structure);
  enforceInMemoryVerificationBudgets(structure);
  const manifestStructure = structure.entries.find((entry) => (
    entry.path === MIGRATION_ARCHIVE_V0_3_MANIFEST_PATH
  ));
  if (manifestStructure === undefined) throw archiveError("migration_control_set_invalid");
  const manifestBytes = inflateAndChecksumEntry(structure, manifestStructure);
  const manifest = parseStrictJsonBytes(manifestBytes);
  const manifestRecords = validateManifestAndExactArchiveSet(
    manifest,
    structure.entries,
    manifestBytes,
  );
  const actualEntriesByPath = new Map(structure.entries.map((entry) => [entry.path, entry]));
  for (const [path, record] of manifestRecords) {
    const actual = actualEntriesByPath.get(path);
    const content = inflateAndChecksumEntry(structure, actual);
    const contentDigest = record.memberKind === "DIRECTORY" ? EMPTY_SHA256 : sha256(content);
    if (contentDigest !== record.contentSha256) {
      throw archiveError("migration_archive_member_record_mismatch");
    }
  }
  return {
    kind: "MEMORY",
    capabilityScope: MIGRATION_ARCHIVE_V0_3_CAPABILITY_SCOPE,
    archiveDigestSha256: sha256(bytes),
    manifest: deepFreezeClone(manifest),
    manifestDigestSha256: manifest.manifestDigestSha256,
    payloadEntries: manifest.archiveMembers.map((record) => ({
      canonicalPath: record.canonicalPath,
      memberKind: record.memberKind,
      payloadRole: record.payloadRole,
    })),
  };
}

/**
 * Authoritative large-archive entrypoint. ZIP offsets and aggregate budgets are
 * evaluated with BigInt, while member bodies are streamed from one pinned file
 * handle. The handle remains private to the opaque capability until closed.
 */
export async function verifyMigrationArchiveV0_3File(archivePath) {
  if (arguments.length !== 1 || typeof archivePath !== "string" || archivePath.length === 0) {
    throw archiveError("migration_archive_file_input_invalid");
  }
  const pathStat = await lstat(archivePath, { bigint: true });
  if (!pathStat.isFile() || pathStat.isSymbolicLink()) {
    throw archiveError("migration_archive_final_link_forbidden");
  }
  let handle;
  try {
    handle = await openFile(
      archivePath,
      fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0),
    );
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || before.dev !== pathStat.dev || before.ino !== pathStat.ino) {
      throw archiveError("migration_archive_file_changed");
    }
    const structure = await parseRawZipFileStructure(handle, before.size);
    enforceRawBudgets(structure);
    const manifestStructure = structure.entries.find((entry) => (
      entry.path === MIGRATION_ARCHIVE_V0_3_MANIFEST_PATH
    ));
    if (manifestStructure === undefined) throw archiveError("migration_control_set_invalid");
    if (manifestStructure.compressedSize > MIGRATION_ARCHIVE_V0_3_MAX_MANIFEST_BYTES
        || manifestStructure.uncompressedSize > MIGRATION_ARCHIVE_V0_3_MAX_MANIFEST_BYTES) {
      throw archiveError("migration_archive_manifest_budget_exceeded");
    }
    const manifestResult = await streamFileEntry(handle, manifestStructure, { collect: true });
    const manifest = parseStrictJsonBytes(manifestResult.bytes);
    const manifestRecords = validateManifestAndExactArchiveSet(
      manifest,
      structure.entries,
      manifestResult.bytes,
    );
    const payloadEntries = [];
    const actualEntriesByPath = new Map(structure.entries.map((entry) => [entry.path, entry]));
    for (const [path, record] of manifestRecords) {
      const entry = actualEntriesByPath.get(path);
      const contentSha256 = record.memberKind === "DIRECTORY"
        ? EMPTY_SHA256
        : (await streamFileEntry(handle, entry, { collect: false })).contentSha256;
      if (contentSha256 !== record.contentSha256) {
        throw archiveError("migration_archive_member_record_mismatch");
      }
      payloadEntries.push({
        canonicalPath: path,
        memberKind: record.memberKind,
        payloadRole: record.payloadRole,
        entry,
        contentSha256: record.contentSha256,
      });
    }
    const archiveDigestSha256 = await hashFileHandle(handle, before.size);
    const after = await handle.stat({ bigint: true });
    if (!sameFileStat(before, after)) throw archiveError("migration_archive_file_changed");

    const capability = Object.freeze(Object.create(null));
    verifiedArchiveStates.set(capability, {
      kind: "FILE",
      capabilityScope: MIGRATION_ARCHIVE_V0_3_CAPABILITY_SCOPE,
      handle,
      archiveDigestSha256,
      manifest: deepFreezeClone(manifest),
      manifestDigestSha256: manifest.manifestDigestSha256,
      payloadEntries,
      expectedStat: after,
      closed: false,
      closing: false,
    });
    fileCapabilityFinalizer.register(capability, handle, capability);
    return capability;
  } catch (error) {
    await handle?.close().catch(() => {});
    throw error;
  }
}

export function describeVerifiedMigrationArchiveV0_3(capability) {
  const state = requireVerifiedCapability(capability);
  return frozenNullRecord({
    capabilityScope: state.capabilityScope,
    schema: PACKAGE_SCHEMA,
    packageId: state.manifest.packageId,
    sourceExactHead: state.manifest.sourceExactHead,
    policyDigestSha256: state.manifest.policyDigestSha256,
    identityReceiptDigestSha256: state.manifest.identityReceiptDigestSha256,
    manifestDigestSha256: state.manifestDigestSha256,
    archiveDigestSha256: state.archiveDigestSha256,
    archiveMemberCount: state.payloadEntries.length,
    currentDirectRestoreAuthorized: false,
    currentAutoPromotionAuthorized: false,
    nativeProvenanceVerified: false,
  });
}

export async function closeVerifiedMigrationArchiveV0_3(capability) {
  const state = requireVerifiedCapability(capability);
  if (state.kind !== "FILE" || state.closed || state.closing) {
    throw archiveError("migration_archive_file_capability_invalid");
  }
  state.closing = true;
  try {
    await state.handle.close();
  } catch (error) {
    state.closing = false;
    throw error;
  }
  state.closed = true;
  fileCapabilityFinalizer.unregister(capability);
  verifiedArchiveStates.delete(capability);
}

function requireVerifiedCapability(capability) {
  const state = verifiedArchiveStates.get(capability);
  if (state === undefined) throw archiveError("migration_archive_capability_invalid");
  return state;
}

function validateBuilderRoles(roles) {
  const result = new Map();
  for (const role of roles) {
    assertExactObject(role, BUILDER_ROLE_FIELDS, "migration_archive_payload_role_invalid");
    assertIdentifier(role.roleId, "migration_archive_payload_role_invalid");
    if (typeof role.required !== "boolean") throw archiveError("migration_archive_payload_role_invalid");
    assertNonnegativeInteger(role.minimumCardinality, "migration_archive_payload_role_invalid");
    if (role.maximumCardinality !== null) {
      assertNonnegativeInteger(role.maximumCardinality, "migration_archive_payload_role_invalid");
      if (role.maximumCardinality < role.minimumCardinality) {
        throw archiveError("migration_archive_payload_role_invalid");
      }
    }
    if (result.has(role.roleId)) throw archiveError("migration_archive_payload_role_invalid");
    result.set(role.roleId, { ...role });
  }
  return result;
}

function validateBuilderMemberPreflight(member, roles) {
  assertExactObject(member, BUILDER_MEMBER_FIELDS, "migration_archive_member_invalid");
  const canonicalPath = validateCanonicalMemberPath(member.canonicalPath, member.memberKind);
  if (canonicalPath === MIGRATION_ARCHIVE_V0_3_MANIFEST_PATH) {
    throw archiveError("migration_control_set_invalid");
  }
  if (!roles.has(member.payloadRole)) throw archiveError("migration_archive_payload_role_invalid");
  const view = inspectByteView(member.bytes);
  if (view === null || isSharedBuffer(view.buffer)
      || (member.memberKind === "DIRECTORY" && view.byteLength !== 0)) {
    throw archiveError("migration_archive_member_invalid");
  }
  assertEntryBudgets(view.byteLength, view.byteLength);
  return {
    canonicalPath,
    memberKind: member.memberKind,
    payloadRole: member.payloadRole,
    byteLength: view.byteLength,
    sourceBuffer: view.buffer,
    sourceByteOffset: view.byteOffset,
  };
}

function safeBuilderByteView(member) {
  if (isSharedBuffer(member.sourceBuffer)) {
    throw archiveError("migration_archive_member_invalid");
  }
  return Buffer.from(member.sourceBuffer, member.sourceByteOffset, member.byteLength);
}

function buildPayloadRoles(roleDefinitions, members) {
  return [...roleDefinitions.values()]
    .sort((left, right) => compareUtf8(left.roleId, right.roleId))
    .map((role) => nullRecord({
      roleId: role.roleId,
      required: role.required,
      minimumCardinality: role.minimumCardinality,
      maximumCardinality: role.maximumCardinality,
      memberPaths: members
        .filter((member) => member.payloadRole === role.roleId)
        .map((member) => member.canonicalPath),
    }));
}

function makeBuilderManifest(options, archiveMembers, payloadRoles) {
  return nullRecord({
    schema: PACKAGE_SCHEMA,
    packageId: options.packageId,
    sourceExactHead: options.sourceExactHead,
    policyDigestSha256: options.policyDigestSha256,
    archiveMembers,
    payloadRoles,
    identityReceiptDigestSha256: options.identityReceiptDigestSha256,
    createdAt: options.createdAt,
    manifestDigestSha256: "",
  });
}

function validateManifestAndExactArchiveSet(manifest, entries, manifestBytes) {
  assertExactObject(manifest, MANIFEST_FIELDS, "migration_manifest_fields_invalid");
  if (manifest.schema !== PACKAGE_SCHEMA) throw archiveError("migration_archive_format_unsupported");
  assertIdentifier(manifest.packageId, "migration_archive_package_id_invalid");
  assertPattern(manifest.sourceExactHead, HEAD_PATTERN, "migration_archive_source_head_invalid");
  if (manifest.policyDigestSha256 !== MIGRATION_ARCHIVE_V0_3_POLICY_DIGEST_SHA256) {
    throw archiveError("migration_archive_policy_digest_invalid");
  }
  assertPattern(
    manifest.identityReceiptDigestSha256,
    SHA256_PATTERN,
    "migration_archive_identity_receipt_digest_invalid",
  );
  assertPattern(manifest.manifestDigestSha256, SHA256_PATTERN, "migration_manifest_digest_invalid");
  assertCreatedAt(manifest.createdAt);
  if (!Array.isArray(manifest.archiveMembers) || !Array.isArray(manifest.payloadRoles)) {
    throw archiveError("migration_manifest_fields_invalid");
  }
  if (digestManifestBasis(manifest) !== manifest.manifestDigestSha256) {
    throw archiveError("migration_manifest_digest_invalid");
  }
  if (!manifestBytes.equals(Buffer.from(canonicalJson(manifest), "utf8"))) {
    throw archiveError("migration_manifest_not_canonical");
  }

  const actualByPath = new Map(entries.map((entry) => [entry.path, entry]));
  const manifestRecords = new Map();
  for (const record of manifest.archiveMembers) {
    assertExactObject(record, MEMBER_FIELDS, "migration_archive_member_record_invalid");
    const path = validateCanonicalMemberPath(record.canonicalPath, record.memberKind);
    if (path === MIGRATION_ARCHIVE_V0_3_MANIFEST_PATH || manifestRecords.has(path)) {
      throw archiveError("migration_archive_set_mismatch");
    }
    assertIdentifier(record.payloadRole, "migration_archive_payload_role_invalid");
    if (record.compressionMethod !== "STORE" && record.compressionMethod !== "DEFLATE") {
      throw archiveError("migration_archive_member_record_invalid");
    }
    assertPattern(record.crc32, CRC32_PATTERN, "migration_archive_member_record_invalid");
    assertPattern(record.contentSha256, SHA256_PATTERN, "migration_archive_member_record_invalid");
    assertNonnegativeInteger(record.compressedBytes, "migration_archive_member_record_invalid");
    assertNonnegativeInteger(record.uncompressedBytes, "migration_archive_member_record_invalid");
    if (record.unixMode !== (record.memberKind === "DIRECTORY" ? "0755" : "0644")) {
      throw archiveError("migration_archive_member_mode_invalid");
    }
    manifestRecords.set(path, record);
  }

  const expectedPaths = new Set([
    MIGRATION_ARCHIVE_V0_3_MANIFEST_PATH,
    ...manifestRecords.keys(),
  ]);
  if (expectedPaths.size !== entries.length
      || entries.some((entry) => !expectedPaths.has(entry.path))) {
    throw archiveError("migration_archive_set_mismatch");
  }
  for (const [path, record] of manifestRecords) {
    const actual = actualByPath.get(path);
    if (actual === undefined
        || actual.memberKind !== record.memberKind
        || compressionName(actual.method) !== record.compressionMethod
        || hex32(actual.crc32) !== record.crc32
        || actual.compressedSize !== record.compressedBytes
        || actual.uncompressedSize !== record.uncompressedBytes
        || actual.unixMode !== record.unixMode) {
      throw archiveError("migration_archive_member_record_mismatch");
    }
  }
  const reserved = actualByPath.get(MIGRATION_ARCHIVE_V0_3_MANIFEST_PATH);
  if (reserved.memberKind !== "REGULAR_FILE" || reserved.unixMode !== "0644") {
    throw archiveError("migration_control_set_invalid");
  }

  const roleRecords = new Map();
  const rolePathSets = new Map();
  for (const role of manifest.payloadRoles) {
    assertExactObject(role, ROLE_FIELDS, "migration_archive_payload_role_invalid");
    assertIdentifier(role.roleId, "migration_archive_payload_role_invalid");
    if (typeof role.required !== "boolean" || !Array.isArray(role.memberPaths)) {
      throw archiveError("migration_archive_payload_role_invalid");
    }
    assertNonnegativeInteger(role.minimumCardinality, "migration_archive_payload_role_invalid");
    if (role.maximumCardinality !== null) {
      assertNonnegativeInteger(role.maximumCardinality, "migration_archive_payload_role_invalid");
      if (role.maximumCardinality < role.minimumCardinality) {
        throw archiveError("migration_archive_payload_role_invalid");
      }
    }
    if (roleRecords.has(role.roleId)) throw archiveError("migration_archive_payload_role_invalid");
    const sortedUnique = [...role.memberPaths].sort(compareUtf8);
    if (!sameStringArray(role.memberPaths, sortedUnique)
        || new Set(role.memberPaths).size !== role.memberPaths.length) {
      throw archiveError("migration_archive_payload_role_invalid");
    }
    for (const path of role.memberPaths) {
      if (typeof path !== "string" || manifestRecords.get(path)?.payloadRole !== role.roleId) {
        throw archiveError("migration_archive_payload_role_invalid");
      }
    }
    roleRecords.set(role.roleId, role);
    rolePathSets.set(role.roleId, new Set(role.memberPaths));
  }
  for (const [path, member] of manifestRecords) {
    if (!roleRecords.has(member.payloadRole)
        || !rolePathSets.get(member.payloadRole).has(path)) {
      throw archiveError("migration_archive_payload_role_invalid");
    }
  }
  validateRoleCardinalities([...roleRecords.values()]);
  return manifestRecords;
}

function validateRoleCardinalities(roles) {
  for (const role of roles) {
    const count = role.memberPaths.length;
    if (count < role.minimumCardinality
        || (role.maximumCardinality !== null && count > role.maximumCardinality)
        || (role.required && count === 0)) {
      throw archiveError("migration_archive_payload_role_cardinality_invalid");
    }
  }
}

async function parseRawZipFileStructure(handle, fileSize) {
  const maximumStructureOverhead = BigInt(MIGRATION_ARCHIVE_V0_3_BUDGETS.maxEntryCount)
    * BigInt(92 + (4 * MIGRATION_ARCHIVE_V0_3_BUDGETS.maxPathLengthBytes));
  const maximumFileSize = BigInt(MIGRATION_ARCHIVE_V0_3_BUDGETS.maxTotalCompressedBytes)
    + maximumStructureOverhead + 98n;
  if (fileSize < 22n || fileSize > maximumFileSize) {
    throw archiveError("migration_archive_budget_exceeded");
  }
  const eocdOffset = fileSize - 22n;
  const eocd = await readFileRange(handle, eocdOffset, 22, "migration_archive_eocd_invalid");
  if (eocd.readUInt32LE(0) !== EOCD_SIGNATURE) throw archiveError("migration_archive_eocd_invalid");
  const disk = eocd.readUInt16LE(4);
  const centralDisk = eocd.readUInt16LE(6);
  const countOnDisk16 = eocd.readUInt16LE(8);
  const count16 = eocd.readUInt16LE(10);
  const centralSize32 = eocd.readUInt32LE(12);
  const centralOffset32 = eocd.readUInt32LE(16);
  const commentLength = eocd.readUInt16LE(20);
  if (commentLength !== 0 || disk !== 0 || centralDisk !== 0) {
    throw archiveError("migration_archive_multidisk_or_comment_forbidden");
  }

  const locatorOffset = eocdOffset - 20n;
  let locator;
  let hasZip64Locator = false;
  if (locatorOffset >= 0n) {
    locator = await readFileRange(handle, locatorOffset, 20, "migration_archive_zip64_invalid");
    hasZip64Locator = locator.readUInt32LE(0) === ZIP64_LOCATOR_SIGNATURE;
  }
  const hasSentinel = countOnDisk16 === UINT16_SENTINEL
    || count16 === UINT16_SENTINEL
    || centralSize32 === UINT32_SENTINEL
    || centralOffset32 === UINT32_SENTINEL;
  let entryCount;
  let centralSize;
  let centralOffset;
  let centralEnd;
  if (hasZip64Locator || hasSentinel) {
    if (!hasZip64Locator) throw archiveError("migration_archive_zip64_noncanonical");
    if (locator.readUInt32LE(4) !== 0 || locator.readUInt32LE(16) !== 1) {
      throw archiveError("migration_archive_multidisk_or_comment_forbidden");
    }
    const zip64Offset = locator.readBigUInt64LE(8);
    const zip64 = await readFileRange(handle, zip64Offset, 56, "migration_archive_zip64_invalid");
    if (zip64.readUInt32LE(0) !== ZIP64_EOCD_SIGNATURE
        || zip64.readBigUInt64LE(4) !== 44n
        || zip64.readUInt16LE(12) !== ((3 << 8) | 45)
        || zip64.readUInt16LE(14) !== 45
        || zip64Offset + 56n !== locatorOffset) {
      throw archiveError("migration_archive_zip64_noncanonical");
    }
    if (zip64.readUInt32LE(16) !== 0 || zip64.readUInt32LE(20) !== 0) {
      throw archiveError("migration_archive_multidisk_or_comment_forbidden");
    }
    const countOnDisk = zip64.readBigUInt64LE(24);
    const count = zip64.readBigUInt64LE(32);
    if (countOnDisk !== count) throw archiveError("migration_archive_multidisk_or_comment_forbidden");
    const centralSize64 = zip64.readBigUInt64LE(40);
    const centralOffset64 = zip64.readBigUInt64LE(48);
    assertCanonicalLegacyZip64BigInt(count, BigInt(countOnDisk16), BigInt(UINT16_SENTINEL));
    assertCanonicalLegacyZip64BigInt(count, BigInt(count16), BigInt(UINT16_SENTINEL));
    assertCanonicalLegacyZip64BigInt(centralSize64, BigInt(centralSize32), BigInt(UINT32_SENTINEL));
    assertCanonicalLegacyZip64BigInt(centralOffset64, BigInt(centralOffset32), BigInt(UINT32_SENTINEL));
    if (count < BigInt(UINT16_SENTINEL)
        && centralSize64 < BigInt(UINT32_SENTINEL)
        && centralOffset64 < BigInt(UINT32_SENTINEL)) {
      throw archiveError("migration_archive_zip64_noncanonical");
    }
    entryCount = bigintToSafeNumber(count);
    centralSize = centralSize64;
    centralOffset = centralOffset64;
    centralEnd = zip64Offset;
  } else {
    if (countOnDisk16 !== count16) throw archiveError("migration_archive_multidisk_or_comment_forbidden");
    entryCount = count16;
    centralSize = BigInt(centralSize32);
    centralOffset = BigInt(centralOffset32);
    centralEnd = eocdOffset;
  }
  if (entryCount < 1 || entryCount > MIGRATION_ARCHIVE_V0_3_BUDGETS.maxEntryCount) {
    throw archiveError("migration_archive_budget_exceeded");
  }
  if (centralOffset + centralSize !== centralEnd || centralEnd > fileSize) {
    throw archiveError("migration_archive_central_directory_invalid");
  }

  const entries = [];
  const rawNames = new Set();
  let cursor = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    const header = await readFileRange(handle, cursor, 46, "migration_archive_central_directory_invalid");
    if (header.readUInt32LE(0) !== CENTRAL_SIGNATURE) {
      throw archiveError("migration_archive_central_directory_invalid");
    }
    const versionMadeBy = header.readUInt16LE(4);
    const versionNeeded = header.readUInt16LE(6);
    const flags = header.readUInt16LE(8);
    const method = header.readUInt16LE(10);
    const dosTime = header.readUInt16LE(12);
    const dosDate = header.readUInt16LE(14);
    const checksum = header.readUInt32LE(16);
    const compressed32 = header.readUInt32LE(20);
    const uncompressed32 = header.readUInt32LE(24);
    const nameLength = header.readUInt16LE(28);
    const extraLength = header.readUInt16LE(30);
    const fileCommentLength = header.readUInt16LE(32);
    const diskStart16 = header.readUInt16LE(34);
    const internalAttributes = header.readUInt16LE(36);
    const externalAttributes = header.readUInt32LE(38);
    const localOffset32 = header.readUInt32LE(42);
    if (fileCommentLength !== 0 || nameLength === 0
        || nameLength > MIGRATION_ARCHIVE_V0_3_BUDGETS.maxPathLengthBytes
        || extraLength > MIGRATION_ARCHIVE_V0_3_BUDGETS.maxPathLengthBytes
        || (versionMadeBy >>> 8) !== 3 || internalAttributes !== 0) {
      throw archiveError("migration_archive_member_header_invalid");
    }
    validateFlagsAndMethod(flags, method);
    const variableLength = nameLength + extraLength;
    const variable = await readFileRange(
      handle,
      cursor + 46n,
      variableLength,
      "migration_archive_central_directory_invalid",
    );
    const rawName = Buffer.from(variable.subarray(0, nameLength));
    const rawNameKey = rawName.toString("hex");
    if (rawNames.has(rawNameKey)) throw archiveError("migration_member_name_collision_or_link");
    rawNames.add(rawNameKey);
    const path = decodeStrictUtf8(rawName, "migration_archive_member_name_invalid");
    const extra = parseExtraFields(variable.subarray(nameLength));
    validateUnicodePathExtra(extra.get(UNICODE_PATH_EXTRA_ID), rawName, path);
    if (diskStart16 === UINT16_SENTINEL) throw archiveError("migration_archive_zip64_noncanonical");
    const compressedSentinel = compressed32 === UINT32_SENTINEL;
    const uncompressedSentinel = uncompressed32 === UINT32_SENTINEL;
    const offsetSentinel = localOffset32 === UINT32_SENTINEL;
    const zip64 = parseZip64Extra(extra.get(ZIP64_EXTRA_ID), {
      uncompressed: uncompressedSentinel,
      compressed: compressedSentinel,
      offset: offsetSentinel,
      disk: false,
    });
    const compressedSize = compressedSentinel ? zip64.compressed : compressed32;
    const uncompressedSize = uncompressedSentinel ? zip64.uncompressed : uncompressed32;
    const localOffset = offsetSentinel ? zip64.offset : localOffset32;
    if ((compressedSentinel && compressedSize < UINT32_SENTINEL)
        || (uncompressedSentinel && uncompressedSize < UINT32_SENTINEL)
        || (offsetSentinel && localOffset < UINT32_SENTINEL)) {
      throw archiveError("migration_archive_zip64_noncanonical");
    }
    if (diskStart16 !== 0) throw archiveError("migration_archive_multidisk_or_comment_forbidden");
    assertEntryBudgets(compressedSize, uncompressedSize);
    if (method === 8 && compressedSize === 0) {
      throw archiveError("migration_archive_deflate_empty_invalid");
    }
    const expectedVersionNeeded = compressedSentinel || uncompressedSentinel || offsetSentinel
      ? 45
      : method === 0 ? 10 : 20;
    if (versionNeeded !== expectedVersionNeeded) {
      throw archiveError("migration_archive_member_header_invalid");
    }
    const memberKind = path.endsWith("/") ? "DIRECTORY" : "REGULAR_FILE";
    validateCanonicalMemberPath(path, memberKind);
    const unixMode = validateExternalAttributes(memberKind, externalAttributes);
    if (memberKind === "DIRECTORY"
        && (method !== 0 || checksum !== 0 || compressedSize !== 0 || uncompressedSize !== 0)) {
      throw archiveError("migration_archive_directory_member_invalid");
    }
    entries.push({
      path,
      rawName,
      memberKind,
      unixMode,
      versionNeeded,
      flags,
      method,
      dosTime,
      dosDate,
      crc32: checksum,
      compressedSize,
      uncompressedSize,
      localOffset,
      externalAttributes,
      compressedSentinel,
      uncompressedSentinel,
      unicodePathExtra: extra.get(UNICODE_PATH_EXTRA_ID),
    });
    cursor += BigInt(46 + nameLength + extraLength);
  }
  if (cursor !== centralOffset + centralSize) {
    throw archiveError("migration_archive_central_directory_invalid");
  }
  assertNoPathCollisions(entries.map((entry) => ({ path: entry.path, rawName: entry.rawName })));
  await validateLocalFileRecords(handle, entries, centralOffset);
  return { entries, fileSize };
}

async function validateLocalFileRecords(handle, entries, centralOffset) {
  const ordered = [...entries].sort((left, right) => left.localOffset - right.localOffset);
  let cursor = 0n;
  for (const entry of ordered) {
    if (BigInt(entry.localOffset) !== cursor) throw archiveError("migration_archive_local_range_invalid");
    const header = await readFileRange(handle, cursor, 30, "migration_archive_local_header_invalid");
    if (header.readUInt32LE(0) !== LOCAL_SIGNATURE) {
      throw archiveError("migration_archive_local_header_invalid");
    }
    const versionNeeded = header.readUInt16LE(4);
    const flags = header.readUInt16LE(6);
    const method = header.readUInt16LE(8);
    const dosTime = header.readUInt16LE(10);
    const dosDate = header.readUInt16LE(12);
    const checksum = header.readUInt32LE(14);
    const compressed32 = header.readUInt32LE(18);
    const uncompressed32 = header.readUInt32LE(22);
    const nameLength = header.readUInt16LE(26);
    const extraLength = header.readUInt16LE(28);
    if (nameLength === 0
        || nameLength > MIGRATION_ARCHIVE_V0_3_BUDGETS.maxPathLengthBytes
        || extraLength > MIGRATION_ARCHIVE_V0_3_BUDGETS.maxPathLengthBytes
        || versionNeeded !== entry.versionNeeded || flags !== entry.flags
        || method !== entry.method || dosTime !== entry.dosTime || dosDate !== entry.dosDate) {
      throw archiveError("migration_archive_local_central_mismatch");
    }
    const variable = await readFileRange(
      handle,
      cursor + 30n,
      nameLength + extraLength,
      "migration_archive_local_header_invalid",
    );
    const rawName = variable.subarray(0, nameLength);
    if (!rawName.equals(entry.rawName)) throw archiveError("migration_archive_local_central_mismatch");
    const extra = parseExtraFields(variable.subarray(nameLength));
    validateUnicodePathExtra(extra.get(UNICODE_PATH_EXTRA_ID), entry.rawName, entry.path);
    const localUnicode = extra.get(UNICODE_PATH_EXTRA_ID);
    if ((localUnicode === undefined) !== (entry.unicodePathExtra === undefined)
        || (localUnicode !== undefined && !localUnicode.equals(entry.unicodePathExtra))) {
      throw archiveError("migration_archive_local_central_mismatch");
    }
    const localCompressedSentinel = compressed32 === UINT32_SENTINEL;
    const localUncompressedSentinel = uncompressed32 === UINT32_SENTINEL;
    if (localCompressedSentinel !== entry.compressedSentinel
        || localUncompressedSentinel !== entry.uncompressedSentinel) {
      throw archiveError("migration_archive_local_central_mismatch");
    }
    const zip64 = parseZip64Extra(extra.get(ZIP64_EXTRA_ID), {
      uncompressed: localUncompressedSentinel,
      compressed: localCompressedSentinel,
      offset: false,
      disk: false,
    });
    const compressedSize = localCompressedSentinel ? zip64.compressed : compressed32;
    const uncompressedSize = localUncompressedSentinel ? zip64.uncompressed : uncompressed32;
    if (checksum !== entry.crc32
        || compressedSize !== entry.compressedSize
        || uncompressedSize !== entry.uncompressedSize) {
      throw archiveError("migration_archive_local_central_mismatch");
    }
    const dataStart = cursor + BigInt(30 + nameLength + extraLength);
    const dataEnd = dataStart + BigInt(entry.compressedSize);
    let recordEnd = dataEnd;
    if ((entry.flags & DATA_DESCRIPTOR_FLAG) !== 0) {
      const descriptor = await readFileRange(
        handle,
        dataEnd,
        16,
        "migration_archive_data_descriptor_invalid",
      );
      if (descriptor.readUInt32LE(0) !== DATA_DESCRIPTOR_SIGNATURE
          || descriptor.readUInt32LE(4) !== entry.crc32
          || descriptor.readUInt32LE(8) !== entry.compressedSize
          || descriptor.readUInt32LE(12) !== entry.uncompressedSize) {
        throw archiveError("migration_archive_data_descriptor_invalid");
      }
      recordEnd += 16n;
    }
    if (recordEnd > centralOffset) throw archiveError("migration_archive_local_range_invalid");
    entry.dataStart = bigintToSafeNumber(dataStart);
    entry.dataEnd = bigintToSafeNumber(dataEnd);
    cursor = recordEnd;
  }
  if (cursor !== centralOffset) throw archiveError("migration_archive_local_range_invalid");
}

async function streamFileEntry(handle, entry, options) {
  const contentHash = createHash("sha256");
  let crcState = 0xffffffff;
  let outputBytes = 0n;
  const chunks = options.collect ? [] : null;
  const { source, output, inflater } = createFileEntryStreams(handle, entry);
  try {
    if (output !== null) {
      for await (const chunkValue of output) {
        const chunk = Buffer.from(chunkValue);
        outputBytes += BigInt(chunk.length);
        if (outputBytes > BigInt(entry.uncompressedSize)) {
          source.destroy();
          inflater?.destroy();
          throw archiveError("migration_archive_member_size_mismatch");
        }
        crcState = crc32Update(crcState, chunk);
        contentHash.update(chunk);
        if (chunks !== null) chunks.push(chunk);
      }
    }
  } catch (error) {
    source?.destroy();
    inflater?.destroy();
    if (error?.code?.startsWith?.("migration_")) throw error;
    throw archiveError("migration_archive_inflate_invalid");
  }
  validateCompletedFileStream(entry, source, inflater, outputBytes, crcState);
  const contentSha256 = contentHash.digest("hex");
  return {
    contentSha256,
    bytes: chunks === null ? undefined : Buffer.concat(chunks, entry.uncompressedSize),
  };
}

function createFileEntryStreams(handle, entry) {
  if (entry.compressedSize === 0) return { source: null, output: null, inflater: null };
  const source = handle.createReadStream({
    start: entry.dataStart,
    end: entry.dataEnd - 1,
    autoClose: false,
    highWaterMark: 64 * 1024,
  });
  if (entry.method === 0) return { source, output: source, inflater: null };
  const inflater = createInflateRaw();
  source.pipe(inflater);
  return { source, output: inflater, inflater };
}

function validateCompletedFileStream(entry, source, inflater, outputBytes, crcState) {
  const compressedRead = source === null ? 0 : source.bytesRead;
  if (compressedRead !== entry.compressedSize
      || (inflater !== null && inflater.bytesWritten !== entry.compressedSize)) {
    throw archiveError("migration_archive_deflate_trailing_data");
  }
  if (outputBytes !== BigInt(entry.uncompressedSize)) {
    throw archiveError("migration_archive_member_size_mismatch");
  }
  if (((crcState ^ 0xffffffff) >>> 0) !== entry.crc32) {
    throw archiveError("migration_archive_crc_mismatch");
  }
}

async function hashFileHandle(handle, fileSize) {
  const hash = createHash("sha256");
  if (fileSize === 0n) return hash.digest("hex");
  const stream = handle.createReadStream({
    start: 0,
    end: bigintToSafeNumber(fileSize - 1n),
    autoClose: false,
    highWaterMark: 1024 * 1024,
  });
  let consumed = 0n;
  for await (const chunk of stream) {
    consumed += BigInt(chunk.length);
    hash.update(chunk);
  }
  if (consumed !== fileSize) throw archiveError("migration_archive_file_changed");
  return hash.digest("hex");
}

async function readFileRange(handle, offset, length, code) {
  if (typeof offset !== "bigint" || offset < 0n
      || !Number.isSafeInteger(length) || length < 0) {
    throw archiveError(code);
  }
  const result = Buffer.alloc(length);
  let filled = 0;
  while (filled < length) {
    const { bytesRead } = await handle.read(
      result,
      filled,
      length - filled,
      bigintToSafeNumber(offset + BigInt(filled)),
    );
    if (bytesRead === 0) throw archiveError(code);
    filled += bytesRead;
  }
  return result;
}

function sameFileStat(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.nlink === right.nlink
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

function parseRawZipStructure(bytes) {
  if (bytes.length < 22) throw archiveError("migration_archive_eocd_invalid");
  const eocdOffset = bytes.length - 22;
  requireRange(bytes, eocdOffset, 22, "migration_archive_eocd_invalid");
  if (bytes.readUInt32LE(eocdOffset) !== EOCD_SIGNATURE) {
    throw archiveError("migration_archive_eocd_invalid");
  }
  const disk = bytes.readUInt16LE(eocdOffset + 4);
  const centralDisk = bytes.readUInt16LE(eocdOffset + 6);
  const countOnDisk16 = bytes.readUInt16LE(eocdOffset + 8);
  const count16 = bytes.readUInt16LE(eocdOffset + 10);
  const centralSize32 = bytes.readUInt32LE(eocdOffset + 12);
  const centralOffset32 = bytes.readUInt32LE(eocdOffset + 16);
  const commentLength = bytes.readUInt16LE(eocdOffset + 20);
  if (commentLength !== 0 || disk !== 0 || centralDisk !== 0) {
    throw archiveError("migration_archive_multidisk_or_comment_forbidden");
  }

  const locatorOffset = eocdOffset - 20;
  const hasZip64Locator = locatorOffset >= 0
    && bytes.readUInt32LE(locatorOffset) === ZIP64_LOCATOR_SIGNATURE;
  const hasSentinel = countOnDisk16 === UINT16_SENTINEL
    || count16 === UINT16_SENTINEL
    || centralSize32 === UINT32_SENTINEL
    || centralOffset32 === UINT32_SENTINEL;
  let entryCount;
  let centralSize;
  let centralOffset;
  let centralEnd;
  if (hasZip64Locator || hasSentinel) {
    if (!hasZip64Locator) throw archiveError("migration_archive_zip64_noncanonical");
    const locatorDisk = bytes.readUInt32LE(locatorOffset + 4);
    const zip64Offset = bigintToNumber(bytes.readBigUInt64LE(locatorOffset + 8));
    const totalDisks = bytes.readUInt32LE(locatorOffset + 16);
    if (locatorDisk !== 0 || totalDisks !== 1) {
      throw archiveError("migration_archive_multidisk_or_comment_forbidden");
    }
    requireRange(bytes, zip64Offset, 56, "migration_archive_zip64_invalid");
    if (bytes.readUInt32LE(zip64Offset) !== ZIP64_EOCD_SIGNATURE
        || bytes.readBigUInt64LE(zip64Offset + 4) !== 44n
        || bytes.readUInt16LE(zip64Offset + 12) !== ((3 << 8) | 45)
        || bytes.readUInt16LE(zip64Offset + 14) !== 45
        || zip64Offset + 56 !== locatorOffset) {
      throw archiveError("migration_archive_zip64_noncanonical");
    }
    if (bytes.readUInt32LE(zip64Offset + 16) !== 0
        || bytes.readUInt32LE(zip64Offset + 20) !== 0) {
      throw archiveError("migration_archive_multidisk_or_comment_forbidden");
    }
    const countOnDisk = bytes.readBigUInt64LE(zip64Offset + 24);
    const count = bytes.readBigUInt64LE(zip64Offset + 32);
    if (countOnDisk !== count) throw archiveError("migration_archive_multidisk_or_comment_forbidden");
    entryCount = bigintToNumber(count);
    centralSize = bigintToNumber(bytes.readBigUInt64LE(zip64Offset + 40));
    centralOffset = bigintToNumber(bytes.readBigUInt64LE(zip64Offset + 48));
    assertCanonicalLegacyZip64Value(entryCount, countOnDisk16, UINT16_SENTINEL);
    assertCanonicalLegacyZip64Value(entryCount, count16, UINT16_SENTINEL);
    assertCanonicalLegacyZip64Value(centralSize, centralSize32, UINT32_SENTINEL);
    assertCanonicalLegacyZip64Value(centralOffset, centralOffset32, UINT32_SENTINEL);
    if (entryCount < UINT16_SENTINEL
        && centralSize < UINT32_SENTINEL
        && centralOffset < UINT32_SENTINEL) {
      throw archiveError("migration_archive_zip64_noncanonical");
    }
    centralEnd = zip64Offset;
  } else {
    if (countOnDisk16 !== count16) throw archiveError("migration_archive_multidisk_or_comment_forbidden");
    entryCount = count16;
    centralSize = centralSize32;
    centralOffset = centralOffset32;
    centralEnd = eocdOffset;
  }
  if (entryCount < 1 || entryCount > MIGRATION_ARCHIVE_V0_3_BUDGETS.maxEntryCount) {
    throw archiveError("migration_archive_budget_exceeded");
  }
  if (centralOffset + centralSize !== centralEnd) {
    throw archiveError("migration_archive_central_directory_invalid");
  }
  requireRange(bytes, centralOffset, centralSize, "migration_archive_central_directory_invalid");

  const entries = [];
  const rawNames = new Set();
  let cursor = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    requireRange(bytes, cursor, 46, "migration_archive_central_directory_invalid");
    if (bytes.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) {
      throw archiveError("migration_archive_central_directory_invalid");
    }
    const versionMadeBy = bytes.readUInt16LE(cursor + 4);
    const versionNeeded = bytes.readUInt16LE(cursor + 6);
    const flags = bytes.readUInt16LE(cursor + 8);
    const method = bytes.readUInt16LE(cursor + 10);
    const dosTime = bytes.readUInt16LE(cursor + 12);
    const dosDate = bytes.readUInt16LE(cursor + 14);
    const checksum = bytes.readUInt32LE(cursor + 16);
    const compressed32 = bytes.readUInt32LE(cursor + 20);
    const uncompressed32 = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const fileCommentLength = bytes.readUInt16LE(cursor + 32);
    const diskStart16 = bytes.readUInt16LE(cursor + 34);
    const internalAttributes = bytes.readUInt16LE(cursor + 36);
    const externalAttributes = bytes.readUInt32LE(cursor + 38);
    const localOffset32 = bytes.readUInt32LE(cursor + 42);
    const recordLength = 46 + nameLength + extraLength + fileCommentLength;
    requireRange(bytes, cursor, recordLength, "migration_archive_central_directory_invalid");
    if (fileCommentLength !== 0 || nameLength === 0
        || nameLength > MIGRATION_ARCHIVE_V0_3_BUDGETS.maxPathLengthBytes
        || extraLength > MIGRATION_ARCHIVE_V0_3_BUDGETS.maxPathLengthBytes
        || (versionMadeBy >>> 8) !== 3
        || internalAttributes !== 0) {
      throw archiveError("migration_archive_member_header_invalid");
    }
    validateFlagsAndMethod(flags, method);
    if (versionNeeded < 10 || versionNeeded > 45) {
      throw archiveError("migration_archive_member_header_invalid");
    }
    const nameStart = cursor + 46;
    const rawName = Buffer.from(bytes.subarray(nameStart, nameStart + nameLength));
    const rawNameKey = rawName.toString("hex");
    if (rawNames.has(rawNameKey)) throw archiveError("migration_member_name_collision_or_link");
    rawNames.add(rawNameKey);
    const path = decodeStrictUtf8(rawName, "migration_archive_member_name_invalid");
    const extra = parseExtraFields(
      bytes.subarray(nameStart + nameLength, nameStart + nameLength + extraLength),
    );
    validateUnicodePathExtra(extra.get(UNICODE_PATH_EXTRA_ID), rawName, path);
    if (diskStart16 === UINT16_SENTINEL) {
      throw archiveError("migration_archive_zip64_noncanonical");
    }
    const compressedSentinel = compressed32 === UINT32_SENTINEL;
    const uncompressedSentinel = uncompressed32 === UINT32_SENTINEL;
    const offsetSentinel = localOffset32 === UINT32_SENTINEL;
    const zip64 = parseZip64Extra(extra.get(ZIP64_EXTRA_ID), {
      uncompressed: uncompressedSentinel,
      compressed: compressedSentinel,
      offset: offsetSentinel,
      disk: false,
    });
    const compressedSize = compressedSentinel ? zip64.compressed : compressed32;
    const uncompressedSize = uncompressedSentinel ? zip64.uncompressed : uncompressed32;
    const localOffset = offsetSentinel ? zip64.offset : localOffset32;
    const diskStart = diskStart16;
    if ((compressedSentinel && compressedSize < UINT32_SENTINEL)
        || (uncompressedSentinel && uncompressedSize < UINT32_SENTINEL)
        || (offsetSentinel && localOffset < UINT32_SENTINEL)) {
      throw archiveError("migration_archive_zip64_noncanonical");
    }
    if (diskStart !== 0) throw archiveError("migration_archive_multidisk_or_comment_forbidden");
    assertEntryBudgets(compressedSize, uncompressedSize);
    if (method === 8 && compressedSize === 0) {
      throw archiveError("migration_archive_deflate_empty_invalid");
    }
    const expectedVersionNeeded = compressedSentinel || uncompressedSentinel || offsetSentinel
      ? 45
      : method === 0 ? 10 : 20;
    if (versionNeeded !== expectedVersionNeeded) {
      throw archiveError("migration_archive_member_header_invalid");
    }
    const memberKind = path.endsWith("/") ? "DIRECTORY" : "REGULAR_FILE";
    validateCanonicalMemberPath(path, memberKind);
    const unixMode = validateExternalAttributes(memberKind, externalAttributes);
    if (memberKind === "DIRECTORY"
        && (method !== 0 || checksum !== 0 || compressedSize !== 0 || uncompressedSize !== 0)) {
      throw archiveError("migration_archive_directory_member_invalid");
    }
    entries.push({
      path,
      rawName,
      memberKind,
      unixMode,
      versionNeeded,
      flags,
      method,
      dosTime,
      dosDate,
      crc32: checksum,
      compressedSize,
      uncompressedSize,
      localOffset,
      centralOffset: cursor,
      externalAttributes,
      compressedSentinel,
      uncompressedSentinel,
      unicodePathExtra: extra.get(UNICODE_PATH_EXTRA_ID),
    });
    cursor += recordLength;
  }
  if (cursor !== centralOffset + centralSize) {
    throw archiveError("migration_archive_central_directory_invalid");
  }
  assertNoPathCollisions(entries.map((entry) => ({ path: entry.path, rawName: entry.rawName })));
  validateLocalRecords(bytes, entries, centralOffset);
  return { bytes, entries };
}

function validateLocalRecords(bytes, entries, centralOffset) {
  const ordered = [...entries].sort((left, right) => left.localOffset - right.localOffset);
  let cursor = 0;
  for (const entry of ordered) {
    if (entry.localOffset !== cursor) throw archiveError("migration_archive_local_range_invalid");
    requireRange(bytes, cursor, 30, "migration_archive_local_header_invalid");
    if (bytes.readUInt32LE(cursor) !== LOCAL_SIGNATURE) {
      throw archiveError("migration_archive_local_header_invalid");
    }
    const versionNeeded = bytes.readUInt16LE(cursor + 4);
    const flags = bytes.readUInt16LE(cursor + 6);
    const method = bytes.readUInt16LE(cursor + 8);
    const dosTime = bytes.readUInt16LE(cursor + 10);
    const dosDate = bytes.readUInt16LE(cursor + 12);
    const checksum = bytes.readUInt32LE(cursor + 14);
    const compressed32 = bytes.readUInt32LE(cursor + 18);
    const uncompressed32 = bytes.readUInt32LE(cursor + 22);
    const nameLength = bytes.readUInt16LE(cursor + 26);
    const extraLength = bytes.readUInt16LE(cursor + 28);
    const recordHeaderLength = 30 + nameLength + extraLength;
    requireRange(bytes, cursor, recordHeaderLength, "migration_archive_local_header_invalid");
    if (nameLength === 0
        || nameLength > MIGRATION_ARCHIVE_V0_3_BUDGETS.maxPathLengthBytes
        || extraLength > MIGRATION_ARCHIVE_V0_3_BUDGETS.maxPathLengthBytes
        || versionNeeded !== entry.versionNeeded
        || flags !== entry.flags
        || method !== entry.method
        || dosTime !== entry.dosTime
        || dosDate !== entry.dosDate) {
      throw archiveError("migration_archive_local_central_mismatch");
    }
    const nameStart = cursor + 30;
    const rawName = bytes.subarray(nameStart, nameStart + nameLength);
    if (!rawName.equals(entry.rawName)) throw archiveError("migration_archive_local_central_mismatch");
    const extra = parseExtraFields(
      bytes.subarray(nameStart + nameLength, nameStart + nameLength + extraLength),
    );
    validateUnicodePathExtra(extra.get(UNICODE_PATH_EXTRA_ID), entry.rawName, entry.path);
    const localUnicode = extra.get(UNICODE_PATH_EXTRA_ID);
    if ((localUnicode === undefined) !== (entry.unicodePathExtra === undefined)
        || (localUnicode !== undefined && !localUnicode.equals(entry.unicodePathExtra))) {
      throw archiveError("migration_archive_local_central_mismatch");
    }
    const localCompressedSentinel = compressed32 === UINT32_SENTINEL;
    const localUncompressedSentinel = uncompressed32 === UINT32_SENTINEL;
    if (localCompressedSentinel !== entry.compressedSentinel
        || localUncompressedSentinel !== entry.uncompressedSentinel) {
      throw archiveError("migration_archive_local_central_mismatch");
    }
    const zip64 = parseZip64Extra(extra.get(ZIP64_EXTRA_ID), {
      uncompressed: localUncompressedSentinel,
      compressed: localCompressedSentinel,
      offset: false,
      disk: false,
    });
    const compressedSize = localCompressedSentinel ? zip64.compressed : compressed32;
    const uncompressedSize = localUncompressedSentinel ? zip64.uncompressed : uncompressed32;
    if (checksum !== entry.crc32
        || compressedSize !== entry.compressedSize
        || uncompressedSize !== entry.uncompressedSize) {
      throw archiveError("migration_archive_local_central_mismatch");
    }
    const dataStart = cursor + recordHeaderLength;
    const dataEnd = dataStart + entry.compressedSize;
    requireRange(bytes, dataStart, entry.compressedSize, "migration_archive_local_range_invalid");
    let recordEnd = dataEnd;
    if ((entry.flags & DATA_DESCRIPTOR_FLAG) !== 0) {
      const descriptorLength = 16;
      requireRange(bytes, dataEnd, descriptorLength, "migration_archive_data_descriptor_invalid");
      if (bytes.readUInt32LE(dataEnd) !== DATA_DESCRIPTOR_SIGNATURE
          || bytes.readUInt32LE(dataEnd + 4) !== entry.crc32) {
        throw archiveError("migration_archive_data_descriptor_invalid");
      }
      const descriptorCompressed = bytes.readUInt32LE(dataEnd + 8);
      const descriptorUncompressed = bytes.readUInt32LE(dataEnd + 12);
      if (descriptorCompressed !== entry.compressedSize
          || descriptorUncompressed !== entry.uncompressedSize) {
        throw archiveError("migration_archive_data_descriptor_invalid");
      }
      recordEnd += descriptorLength;
    }
    if (recordEnd > centralOffset) throw archiveError("migration_archive_local_range_invalid");
    entry.dataStart = dataStart;
    entry.dataEnd = dataEnd;
    cursor = recordEnd;
  }
  if (cursor !== centralOffset) throw archiveError("migration_archive_local_range_invalid");
}

function enforceRawBudgets(structure) {
  let totalCompressed = 0n;
  let totalUncompressed = 0n;
  for (const entry of structure.entries) {
    assertEntryBudgets(entry.compressedSize, entry.uncompressedSize);
    totalCompressed += BigInt(entry.compressedSize);
    totalUncompressed += BigInt(entry.uncompressedSize);
    if (totalCompressed > BigInt(MIGRATION_ARCHIVE_V0_3_BUDGETS.maxTotalCompressedBytes)
        || totalUncompressed > BigInt(MIGRATION_ARCHIVE_V0_3_BUDGETS.maxTotalUncompressedBytes)) {
      throw archiveError("migration_archive_budget_exceeded");
    }
  }
}

function enforceInMemoryVerificationBudgets(structure) {
  let totalUncompressed = 0n;
  for (const entry of structure.entries) totalUncompressed += BigInt(entry.uncompressedSize);
  if (totalUncompressed > BigInt(MIGRATION_ARCHIVE_V0_3_MAX_IN_MEMORY_UNCOMPRESSED_BYTES)) {
    throw archiveError("migration_archive_streaming_verifier_required");
  }
  const manifest = structure.entries.find((entry) => (
    entry.path === MIGRATION_ARCHIVE_V0_3_MANIFEST_PATH
  ));
  if (manifest !== undefined
      && (manifest.compressedSize > MIGRATION_ARCHIVE_V0_3_MAX_MANIFEST_BYTES
        || manifest.uncompressedSize > MIGRATION_ARCHIVE_V0_3_MAX_MANIFEST_BYTES)) {
    throw archiveError("migration_archive_manifest_budget_exceeded");
  }
}

function enforceBuilderPreflight(members, manifestByteLength) {
  assertEntryBudgets(manifestByteLength, manifestByteLength);
  if (manifestByteLength > MIGRATION_ARCHIVE_V0_3_MAX_MANIFEST_BYTES) {
    throw archiveError("migration_archive_manifest_budget_exceeded");
  }

  const allMetadata = [
    ...members.map((member) => ({
      canonicalPath: member.canonicalPath,
      byteLength: member.byteLength,
    })),
    {
      canonicalPath: MIGRATION_ARCHIVE_V0_3_MANIFEST_PATH,
      byteLength: manifestByteLength,
    },
  ];
  if (allMetadata.length > MIGRATION_ARCHIVE_V0_3_BUDGETS.maxEntryCount) {
    throw archiveError("migration_archive_budget_exceeded");
  }

  let totalUncompressed = 0n;
  let projectedLocalBytes = 0n;
  let projectedCentralBytes = 0n;
  for (const member of allMetadata) {
    const size = BigInt(member.byteLength);
    const nameLength = BigInt(Buffer.byteLength(member.canonicalPath, "utf8"));
    totalUncompressed += size;
    projectedLocalBytes += 30n + nameLength + size;
    projectedCentralBytes += 46n + nameLength;
    if (totalUncompressed > BigInt(MIGRATION_ARCHIVE_V0_3_BUDGETS.maxTotalCompressedBytes)
        || totalUncompressed > BigInt(MIGRATION_ARCHIVE_V0_3_BUDGETS.maxTotalUncompressedBytes)) {
      throw archiveError("migration_archive_budget_exceeded");
    }
  }

  const zip64TailBytes = allMetadata.length >= UINT16_SENTINEL ? 76n : 0n;
  const projectedArchiveBytes = projectedLocalBytes + projectedCentralBytes
    + zip64TailBytes + 22n;
  if (totalUncompressed > BigInt(MIGRATION_ARCHIVE_V0_3_MAX_IN_MEMORY_UNCOMPRESSED_BYTES)
      || projectedArchiveBytes > BigInt(bufferConstants.MAX_LENGTH)
      || projectedArchiveBytes > BigInt(MIGRATION_ARCHIVE_V0_3_MAX_IN_MEMORY_ARCHIVE_BYTES)) {
    throw archiveError("migration_archive_streaming_builder_required");
  }
}

function assertEntryBudgets(compressedSize, uncompressedSize) {
  if (!Number.isSafeInteger(compressedSize) || compressedSize < 0
      || !Number.isSafeInteger(uncompressedSize) || uncompressedSize < 0
      || compressedSize > MIGRATION_ARCHIVE_V0_3_BUDGETS.maxPerEntryCompressedBytes
      || uncompressedSize > MIGRATION_ARCHIVE_V0_3_BUDGETS.maxPerEntryUncompressedBytes
      || (compressedSize === 0 && uncompressedSize !== 0)
      || uncompressedSize > compressedSize * MIGRATION_ARCHIVE_V0_3_BUDGETS.maxCompressionRatio) {
    throw archiveError("migration_archive_budget_exceeded");
  }
}

function inflateAndChecksumEntry(structure, entry) {
  const compressed = structure.bytes.subarray(entry.dataStart, entry.dataEnd);
    let bytes;
    if (entry.method === 0) {
      if (entry.compressedSize !== entry.uncompressedSize) {
        throw archiveError("migration_archive_member_size_mismatch");
      }
      bytes = compressed;
    } else {
      try {
        const inflated = inflateRawSync(compressed, {
          maxOutputLength: Math.max(1, entry.uncompressedSize),
          info: true,
        });
        if (inflated.engine.bytesWritten !== compressed.length) {
          throw archiveError("migration_archive_deflate_trailing_data");
        }
        bytes = inflated.buffer;
      } catch (error) {
        if (error?.code === "migration_archive_deflate_trailing_data") throw error;
        throw archiveError("migration_archive_inflate_invalid");
      }
    }
    if (bytes.length !== entry.uncompressedSize) {
      throw archiveError("migration_archive_member_size_mismatch");
    }
    if (crc32(bytes) !== entry.crc32) throw archiveError("migration_archive_crc_mismatch");
  return bytes;
}

function writeCanonicalStoreZip(members) {
  const records = [];
  let localOffset = 0;
  for (const member of members) {
    const rawName = Buffer.from(member.canonicalPath, "utf8");
    const checksum = member.checksum;
    const size = member.bytes.length;
    if (size >= UINT32_SENTINEL || localOffset >= UINT32_SENTINEL) {
      throw archiveError("migration_archive_streaming_builder_required");
    }
    records.push({
      member,
      rawName,
      checksum,
      size,
      localOffset,
    });
    localOffset += 30 + rawName.length + size;
  }

  let centralSize = 0;
  for (const record of records) {
    centralSize += 46 + record.rawName.length;
  }

  const needsZip64Archive = records.length >= UINT16_SENTINEL;
  const tailSize = needsZip64Archive ? 98 : 22;
  const totalSize = localOffset + centralSize + tailSize;
  if (centralSize >= UINT32_SENTINEL || localOffset >= UINT32_SENTINEL
      || totalSize > bufferConstants.MAX_LENGTH
      || totalSize > MIGRATION_ARCHIVE_V0_3_MAX_IN_MEMORY_ARCHIVE_BYTES) {
    throw archiveError("migration_archive_streaming_builder_required");
  }
  const output = Buffer.allocUnsafe(totalSize);
  let cursor = 0;
  for (const record of records) {
    output.writeUInt32LE(LOCAL_SIGNATURE, cursor);
    output.writeUInt16LE(10, cursor + 4);
    output.writeUInt16LE(UTF8_FLAG, cursor + 6);
    output.writeUInt16LE(0, cursor + 8);
    output.writeUInt16LE(0, cursor + 10);
    output.writeUInt16LE(0x0021, cursor + 12);
    output.writeUInt32LE(record.checksum, cursor + 14);
    output.writeUInt32LE(record.size, cursor + 18);
    output.writeUInt32LE(record.size, cursor + 22);
    output.writeUInt16LE(record.rawName.length, cursor + 26);
    output.writeUInt16LE(0, cursor + 28);
    cursor += 30;
    record.rawName.copy(output, cursor);
    cursor += record.rawName.length;
    record.member.bytes.copy(output, cursor);
    cursor += record.size;
  }
  if (cursor !== localOffset) throw archiveError("migration_archive_builder_preflight_mismatch");

  for (const record of records) {
    output.writeUInt32LE(CENTRAL_SIGNATURE, cursor);
    output.writeUInt16LE((3 << 8) | 45, cursor + 4);
    output.writeUInt16LE(10, cursor + 6);
    output.writeUInt16LE(UTF8_FLAG, cursor + 8);
    output.writeUInt16LE(0, cursor + 10);
    output.writeUInt16LE(0, cursor + 12);
    output.writeUInt16LE(0x0021, cursor + 14);
    output.writeUInt32LE(record.checksum, cursor + 16);
    output.writeUInt32LE(record.size, cursor + 20);
    output.writeUInt32LE(record.size, cursor + 24);
    output.writeUInt16LE(record.rawName.length, cursor + 28);
    output.writeUInt16LE(0, cursor + 30);
    output.writeUInt16LE(0, cursor + 32);
    output.writeUInt16LE(0, cursor + 34);
    output.writeUInt16LE(0, cursor + 36);
    const mode = record.member.memberKind === "DIRECTORY"
      ? DIRECTORY_POSIX_MODE
      : REGULAR_POSIX_MODE;
    const dos = record.member.memberKind === "DIRECTORY" ? DOS_DIRECTORY_ATTRIBUTE : 0;
    output.writeUInt32LE(((mode << 16) | dos) >>> 0, cursor + 38);
    output.writeUInt32LE(record.localOffset, cursor + 42);
    cursor += 46;
    record.rawName.copy(output, cursor);
    cursor += record.rawName.length;
  }
  if (cursor !== localOffset + centralSize) {
    throw archiveError("migration_archive_builder_preflight_mismatch");
  }

  if (needsZip64Archive) {
    const zip64Offset = cursor;
    output.writeUInt32LE(ZIP64_EOCD_SIGNATURE, cursor);
    output.writeBigUInt64LE(44n, cursor + 4);
    output.writeUInt16LE((3 << 8) | 45, cursor + 12);
    output.writeUInt16LE(45, cursor + 14);
    output.writeUInt32LE(0, cursor + 16);
    output.writeUInt32LE(0, cursor + 20);
    output.writeBigUInt64LE(BigInt(records.length), cursor + 24);
    output.writeBigUInt64LE(BigInt(records.length), cursor + 32);
    output.writeBigUInt64LE(BigInt(centralSize), cursor + 40);
    output.writeBigUInt64LE(BigInt(localOffset), cursor + 48);
    cursor += 56;
    output.writeUInt32LE(ZIP64_LOCATOR_SIGNATURE, cursor);
    output.writeUInt32LE(0, cursor + 4);
    output.writeBigUInt64LE(BigInt(zip64Offset), cursor + 8);
    output.writeUInt32LE(1, cursor + 16);
    cursor += 20;
  }
  output.writeUInt32LE(EOCD_SIGNATURE, cursor);
  output.writeUInt16LE(0, cursor + 4);
  output.writeUInt16LE(0, cursor + 6);
  output.writeUInt16LE(needsZip64Archive ? UINT16_SENTINEL : records.length, cursor + 8);
  output.writeUInt16LE(needsZip64Archive ? UINT16_SENTINEL : records.length, cursor + 10);
  output.writeUInt32LE(centralSize, cursor + 12);
  output.writeUInt32LE(localOffset, cursor + 16);
  output.writeUInt16LE(0, cursor + 20);
  cursor += 22;
  if (cursor !== output.length) throw archiveError("migration_archive_builder_preflight_mismatch");
  return output;
}

function validateFlagsAndMethod(flags, method) {
  if ((flags & UTF8_FLAG) === 0
      || (flags & ~ALLOWED_FLAGS) !== 0
      || (method !== 0 && method !== 8)) {
    throw archiveError("migration_archive_member_header_invalid");
  }
}

function validateExternalAttributes(memberKind, attributes) {
  const mode = attributes >>> 16;
  const dos = attributes & 0xffff;
  if (memberKind === "DIRECTORY") {
    if (mode !== DIRECTORY_POSIX_MODE || (dos & DOS_DIRECTORY_ATTRIBUTE) === 0
        || (dos & ~DOS_DIRECTORY_ATTRIBUTE) !== 0) {
      throw archiveError("migration_member_name_collision_or_link");
    }
    return "0755";
  }
  if (mode !== REGULAR_POSIX_MODE || dos !== 0) {
    throw archiveError("migration_member_name_collision_or_link");
  }
  return "0644";
}

function parseExtraFields(bytes) {
  const fields = new Map();
  let offset = 0;
  while (offset < bytes.length) {
    if (offset + 4 > bytes.length) throw archiveError("migration_archive_extra_field_invalid");
    const id = bytes.readUInt16LE(offset);
    const size = bytes.readUInt16LE(offset + 2);
    if (offset + 4 + size > bytes.length || fields.has(id)
        || (id !== ZIP64_EXTRA_ID && id !== UNICODE_PATH_EXTRA_ID)) {
      throw archiveError("migration_archive_extra_field_invalid");
    }
    fields.set(id, Buffer.from(bytes.subarray(offset + 4, offset + 4 + size)));
    offset += 4 + size;
  }
  return fields;
}

function parseZip64Extra(bytes, needed) {
  const requiredCount = Number(needed.uncompressed)
    + Number(needed.compressed)
    + Number(needed.offset)
    + Number(needed.disk);
  if (requiredCount === 0) {
    if (bytes !== undefined) throw archiveError("migration_archive_zip64_noncanonical");
    return {};
  }
  if (bytes === undefined) throw archiveError("migration_archive_zip64_invalid");
  let offset = 0;
  const result = {};
  for (const [field, required, width] of [
    ["uncompressed", needed.uncompressed, 8],
    ["compressed", needed.compressed, 8],
    ["offset", needed.offset, 8],
    ["disk", needed.disk, 4],
  ]) {
    if (!required) continue;
    if (offset + width > bytes.length) throw archiveError("migration_archive_zip64_invalid");
    result[field] = width === 8
      ? bigintToNumber(bytes.readBigUInt64LE(offset))
      : bytes.readUInt32LE(offset);
    offset += width;
  }
  if (offset !== bytes.length) throw archiveError("migration_archive_zip64_noncanonical");
  return result;
}

function validateUnicodePathExtra(extra, rawName, path) {
  if (extra === undefined) return;
  if (extra.length < 5 || extra[0] !== 1
      || extra.readUInt32LE(1) !== crc32(rawName)
      || decodeStrictUtf8(extra.subarray(5), "migration_archive_unicode_path_invalid") !== path) {
    throw archiveError("migration_archive_unicode_path_invalid");
  }
}

function validateCanonicalMemberPath(value, memberKind) {
  if (memberKind !== "REGULAR_FILE" && memberKind !== "DIRECTORY") {
    throw archiveError("migration_archive_member_kind_invalid");
  }
  if (typeof value !== "string" || value.length === 0 || hasUnpairedSurrogate(value)
      || value.includes("\0")
      || value.includes("\\") || value.includes(":") || value.startsWith("/")
      || value !== value.normalize("NFC")) {
    throw archiveError("migration_archive_member_name_invalid");
  }
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length === 0 || bytes.length > MIGRATION_ARCHIVE_V0_3_BUDGETS.maxPathLengthBytes) {
    throw archiveError("migration_archive_member_name_invalid");
  }
  if ((memberKind === "DIRECTORY") !== value.endsWith("/")) {
    throw archiveError("migration_archive_member_name_invalid");
  }
  const body = memberKind === "DIRECTORY" ? value.slice(0, -1) : value;
  const parts = body.split("/");
  if (parts.length === 0 || parts.some((part) => part.length === 0
      || part === "." || part === ".." || /[. ]$/u.test(part)
      || WINDOWS_FORBIDDEN_MEMBER_CHARACTERS.test(part)
      || RESERVED_WINDOWS_NAMES.test(part))) {
    throw archiveError("migration_archive_member_name_invalid");
  }
  return value;
}

function assertNoPathCollisions(records) {
  const nfc = new Set();
  const folded = new Set();
  const tree = new Map();
  for (const record of records) {
    const normalized = record.path.normalize("NFC");
    const withoutDirectorySlash = normalized.endsWith("/")
      ? normalized.slice(0, -1)
      : normalized;
    const caseFolded = unicodeCaseFold(withoutDirectorySlash);
    if (nfc.has(withoutDirectorySlash) || folded.has(caseFolded)) {
      throw archiveError("migration_member_name_collision_or_link");
    }
    nfc.add(withoutDirectorySlash);
    folded.add(caseFolded);
    tree.set(caseFolded, normalized.endsWith("/") ? "DIRECTORY" : "REGULAR_FILE");
  }
  for (const key of tree.keys()) {
    const parts = key.split("/");
    for (let index = 1; index < parts.length; index += 1) {
      const parent = parts.slice(0, index).join("/");
      if (tree.get(parent) === "REGULAR_FILE") {
        throw archiveError("migration_member_name_collision_or_link");
      }
    }
  }
}

function unicodeCaseFold(value) {
  return value.normalize("NFC").toUpperCase().toLowerCase().normalize("NFC");
}

function hasUnpairedSurrogate(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const following = value.charCodeAt(index + 1);
      if (following < 0xdc00 || following > 0xdfff) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function parseStrictJsonBytes(bytes) {
  const text = decodeStrictUtf8(bytes, "migration_manifest_utf8_invalid");
  const numberPattern = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/uy;
  let index = 0;
  let depth = 0;
  function skipWhitespace() {
    while (index < text.length && /[\t\n\r ]/u.test(text[index])) index += 1;
  }
  function parseValue() {
    skipWhitespace();
    if (depth > 64) throw archiveError("migration_manifest_json_invalid");
    const char = text[index];
    if (char === "{") return parseObject();
    if (char === "[") return parseArray();
    if (char === "\"") return parseString();
    if (text.startsWith("true", index)) { index += 4; return true; }
    if (text.startsWith("false", index)) { index += 5; return false; }
    if (text.startsWith("null", index)) { index += 4; return null; }
    numberPattern.lastIndex = index;
    const match = numberPattern.exec(text);
    if (match === null) throw archiveError("migration_manifest_json_invalid");
    index += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) throw archiveError("migration_manifest_json_invalid");
    return value;
  }
  function parseObject() {
    index += 1;
    depth += 1;
    const result = Object.create(null);
    const keys = new Set();
    skipWhitespace();
    if (text[index] === "}") { index += 1; depth -= 1; return result; }
    while (true) {
      skipWhitespace();
      if (text[index] !== "\"") throw archiveError("migration_manifest_json_invalid");
      const key = parseString();
      if (keys.has(key)) throw archiveError("migration_manifest_duplicate_key");
      keys.add(key);
      skipWhitespace();
      if (text[index] !== ":") throw archiveError("migration_manifest_json_invalid");
      index += 1;
      result[key] = parseValue();
      skipWhitespace();
      if (text[index] === "}") { index += 1; depth -= 1; return result; }
      if (text[index] !== ",") throw archiveError("migration_manifest_json_invalid");
      index += 1;
    }
  }
  function parseArray() {
    index += 1;
    depth += 1;
    const result = [];
    skipWhitespace();
    if (text[index] === "]") { index += 1; depth -= 1; return result; }
    while (true) {
      result.push(parseValue());
      skipWhitespace();
      if (text[index] === "]") { index += 1; depth -= 1; return result; }
      if (text[index] !== ",") throw archiveError("migration_manifest_json_invalid");
      index += 1;
    }
  }
  function parseString() {
    const start = index;
    index += 1;
    while (index < text.length) {
      const code = text.charCodeAt(index);
      if (code === 0x22) {
        index += 1;
        try {
          return JSON.parse(text.slice(start, index));
        } catch {
          throw archiveError("migration_manifest_json_invalid");
        }
      }
      if (code < 0x20) throw archiveError("migration_manifest_json_invalid");
      if (code === 0x5c) {
        index += 1;
        if (index >= text.length || !/["\\/bfnrtu]/u.test(text[index])) {
          throw archiveError("migration_manifest_json_invalid");
        }
        if (text[index] === "u") {
          const hex = text.slice(index + 1, index + 5);
          if (!/^[0-9a-fA-F]{4}$/u.test(hex)) throw archiveError("migration_manifest_json_invalid");
          index += 4;
        }
      }
      index += 1;
    }
    throw archiveError("migration_manifest_json_invalid");
  }
  const result = parseValue();
  skipWhitespace();
  if (index !== text.length) throw archiveError("migration_manifest_json_invalid");
  return result;
}

function digestManifestBasis(manifest) {
  const basis = deepNullClone(manifest);
  basis.manifestDigestSha256 = "";
  return sha256(Buffer.from(canonicalJson(basis), "utf8"));
}

function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw archiveError("migration_manifest_json_invalid");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    )).join(",")}}`;
  }
  throw archiveError("migration_manifest_json_invalid");
}

function deepNullClone(value) {
  if (Array.isArray(value)) return value.map((item) => deepNullClone(item));
  if (isRecord(value)) {
    const result = Object.create(null);
    for (const key of Object.keys(value)) result[key] = deepNullClone(value[key]);
    return result;
  }
  return value;
}

function deepFreezeClone(value) {
  const clone = deepNullClone(value);
  return deepFreeze(clone);
}

function deepFreeze(value) {
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item);
    return Object.freeze(value);
  }
  if (isRecord(value)) {
    for (const item of Object.values(value)) deepFreeze(item);
    return Object.freeze(value);
  }
  return value;
}

function assertExactObject(value, fields, code) {
  if (!isRecord(value) || !sameStringArray(Object.keys(value).sort(), [...fields].sort())) {
    throw archiveError(code);
  }
}

function isRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertIdentifier(value, code) {
  assertPattern(value, IDENTIFIER_PATTERN, code);
}

function assertPattern(value, pattern, code) {
  if (typeof value !== "string" || !pattern.test(value)) throw archiveError(code);
}

function assertCreatedAt(value) {
  if (typeof value !== "string"
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
      || Number.isNaN(Date.parse(value))
      || new Date(value).toISOString() !== value) {
    throw archiveError("migration_archive_created_at_invalid");
  }
}

function assertNonnegativeInteger(value, code) {
  if (!Number.isSafeInteger(value) || value < 0) throw archiveError(code);
}

function sameStringArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function compressionName(method) {
  return method === 0 ? "STORE" : "DEFLATE";
}

function compareUtf8(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function decodeStrictUtf8(bytes, code) {
  try {
    const value = STRICT_UTF8.decode(bytes);
    if (!Buffer.from(value, "utf8").equals(Buffer.from(bytes))) throw new Error("noncanonical_utf8");
    return value;
  } catch {
    throw archiveError(code);
  }
}

function copyArchiveBytes(value) {
  if (!isByteView(value) || value.byteLength > bufferConstants.MAX_LENGTH) {
    throw archiveError("migration_archive_verifier_input_invalid");
  }
  if (value.byteLength > MIGRATION_ARCHIVE_V0_3_MAX_IN_MEMORY_ARCHIVE_BYTES) {
    throw archiveError("migration_archive_streaming_verifier_required");
  }
  return Buffer.from(value);
}

function isByteView(value) {
  return Buffer.isBuffer(value) || value instanceof Uint8Array;
}

function inspectByteView(value) {
  if (!isByteView(value)) return null;
  try {
    return {
      buffer: TYPED_ARRAY_BUFFER_GETTER.call(value),
      byteLength: TYPED_ARRAY_BYTE_LENGTH_GETTER.call(value),
      byteOffset: TYPED_ARRAY_BYTE_OFFSET_GETTER.call(value),
    };
  } catch {
    return null;
  }
}

function isSharedBuffer(value) {
  return typeof SharedArrayBuffer !== "undefined" && value instanceof SharedArrayBuffer;
}

function requireRange(bytes, offset, length, code) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length)
      || offset < 0 || length < 0 || offset + length > bytes.length) {
    throw archiveError(code);
  }
}

function bigintToNumber(value) {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw archiveError("migration_archive_zip64_budget_exceeded");
  return Number(value);
}

function bigintToSafeNumber(value) {
  if (typeof value !== "bigint" || value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw archiveError("migration_archive_zip64_budget_exceeded");
  }
  return Number(value);
}

function assertCanonicalLegacyZip64Value(actual, legacy, sentinel) {
  if ((actual >= sentinel && legacy !== sentinel)
      || (actual < sentinel && legacy !== actual)) {
    throw archiveError("migration_archive_zip64_noncanonical");
  }
}

function assertCanonicalLegacyZip64BigInt(actual, legacy, sentinel) {
  if ((actual >= sentinel && legacy !== sentinel)
      || (actual < sentinel && legacy !== actual)) {
    throw archiveError("migration_archive_zip64_noncanonical");
  }
}

function nullRecord(fields) {
  return Object.assign(Object.create(null), fields);
}

function frozenNullRecord(fields) {
  return Object.freeze(nullRecord(fields));
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function hex32(value) {
  return value.toString(16).padStart(8, "0");
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let value = 0xffffffff;
  value = crc32Update(value, bytes);
  return (value ^ 0xffffffff) >>> 0;
}

function crc32Update(value, bytes) {
  let result = value;
  for (const byte of bytes) result = CRC_TABLE[(result ^ byte) & 0xff] ^ (result >>> 8);
  return result >>> 0;
}

function archiveError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
