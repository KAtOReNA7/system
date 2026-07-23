import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { appendFile, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { deflateRawSync } from "node:zlib";

import * as archiveModule from "../src/domain/m2V2EvidencePilot/migrationArchiveV0_3.js";
import {
  MIGRATION_ARCHIVE_V0_3_CAPABILITY_SCOPE,
  MIGRATION_ARCHIVE_V0_3_IMPLEMENTATION_STATUS,
  MIGRATION_ARCHIVE_V0_3_INNER_FILENAME,
  MIGRATION_ARCHIVE_V0_3_MANIFEST_PATH,
  MIGRATION_ARCHIVE_V0_3_MAX_IN_MEMORY_UNCOMPRESSED_BYTES,
  MIGRATION_ARCHIVE_V0_3_POLICY_DIGEST_SHA256,
  buildCanonicalMigrationArchiveV0_3,
  closeVerifiedMigrationArchiveV0_3,
  describeVerifiedMigrationArchiveV0_3,
  getMigrationArchiveCompatibilityPolicy,
  verifyMigrationArchiveV0_3,
  verifyMigrationArchiveV0_3File,
} from "../src/domain/m2V2EvidencePilot/migrationArchiveV0_3.js";

const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const DATA_DESCRIPTOR_SIGNATURE = 0x08074b50;
const EOCD_SIGNATURE = 0x06054b50;
const ZIP64_EOCD_SIGNATURE = 0x06064b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const UTF8_FLAG = 0x0800;
const DATA_DESCRIPTOR_FLAG = 0x0008;
const REGULAR_POSIX_MODE = 0o100644;
const DIRECTORY_POSIX_MODE = 0o040755;

test("PR7-P1-006-v03-pass: v0.3 archive writer is deterministic and issues only an opaque archive capability", () => {
  const options = validBuilderOptions();
  const first = buildCanonicalMigrationArchiveV0_3(options);
  const second = buildCanonicalMigrationArchiveV0_3(options);
  assert.equal(first.archiveBytes.equals(second.archiveBytes), true);
  assert.equal(
    MIGRATION_ARCHIVE_V0_3_IMPLEMENTATION_STATUS,
    "PARTIAL_NOT_INTEGRATED_STRUCTURE_ONLY",
  );
  assert.equal(MIGRATION_ARCHIVE_V0_3_CAPABILITY_SCOPE, "STRUCTURE_ONLY");
  assert.equal(MIGRATION_ARCHIVE_V0_3_INNER_FILENAME, "m2-v2-private-state-migration-package.v0.3.zip");
  assert.equal(first.manifest.manifestDigestSha256, manifestDigest(first.manifest));
  assert.notEqual(sha256(first.manifestBytes), first.manifest.manifestDigestSha256);
  assert.equal(first.manifest.archiveMembers.some((entry) => (
    entry.canonicalPath === MIGRATION_ARCHIVE_V0_3_MANIFEST_PATH
  )), false);

  const capability = verifyMigrationArchiveV0_3(first.archiveBytes);
  assert.equal(Object.getPrototypeOf(capability), null);
  assert.equal(Object.isFrozen(capability), true);
  assert.deepEqual(Object.keys(capability), []);
  const summary = describeVerifiedMigrationArchiveV0_3(capability);
  assert.equal(summary.schema, "m2.v2.private-state-migration-package.v0.3");
  assert.equal(summary.archiveMemberCount, 2);
  assert.equal(summary.capabilityScope, "STRUCTURE_ONLY");
  assert.equal(summary.currentDirectRestoreAuthorized, false);
  assert.equal(summary.currentAutoPromotionAuthorized, false);
  assert.equal(summary.nativeProvenanceVerified, false);
  assert.equal("extractVerifiedMigrationArchiveV0_3" in archiveModule, false);
  assert.equal("streamVerifiedMigrationArchiveV0_3Member" in archiveModule, false);
  assert.throws(
    () => describeVerifiedMigrationArchiveV0_3({ ...capability }),
    /migration_archive_capability_invalid/u,
  );
  assert.throws(
    () => describeVerifiedMigrationArchiveV0_3(structuredClone(capability)),
    /migration_archive_capability_invalid/u,
  );
  assert.throws(
    () => verifyMigrationArchiveV0_3(first.archiveBytes, { manifest: first.manifest }),
    /migration_archive_verifier_input_invalid/u,
  );
  assert.throws(
    () => buildCanonicalMigrationArchiveV0_3({ ...options, manifest: first.manifest }),
    /migration_archive_builder_input_invalid/u,
  );
});

test("all format policies withhold current restore and promotion authority", () => {
  for (const format of ["v0.1", "v0.2"]) {
    const policy = getMigrationArchiveCompatibilityPolicy(format);
    assert.equal(policy.inspectAllowed, true);
    assert.equal(policy.repackageToV0_3Allowed, true);
    assert.equal(policy.directRestoreAllowed, false);
    assert.equal(policy.autoPromotionAllowed, false);
    assert.equal(Object.isFrozen(policy), true);
  }
  const current = getMigrationArchiveCompatibilityPolicy("v0.3");
  assert.equal(current.directRestoreAllowed, false);
  assert.equal(current.autoPromotionAllowed, false);
  assert.equal(current.contractDirectRestoreEligible, true);
  assert.equal(current.contractAutoPromotionEligible, true);
  assert.equal(current.currentAuthorityGranted, false);
  assert.throws(
    () => getMigrationArchiveCompatibilityPolicy("v0.4"),
    /migration_archive_format_unsupported/u,
  );
});

test("builder binds the frozen policy digest and rejects lossy or shared byte sources", () => {
  assert.equal(
    MIGRATION_ARCHIVE_V0_3_POLICY_DIGEST_SHA256,
    "ca622afb98c223e3e1c5d97d35ac64c805065395f172f6237f9078d36a757163",
  );
  assert.throws(
    () => buildCanonicalMigrationArchiveV0_3({
      ...validBuilderOptions(),
      policyDigestSha256: "b".repeat(64),
    }),
    /migration_archive_policy_digest_invalid/u,
  );

  const surrogate = validBuilderOptions();
  surrogate.members[0].canonicalPath = "payload/\ud800.json";
  assert.throws(
    () => buildCanonicalMigrationArchiveV0_3(surrogate),
    /migration_archive_member_name_invalid/u,
  );

  const shared = validBuilderOptions();
  shared.members[0].bytes = new Uint8Array(new SharedArrayBuffer(12));
  assert.throws(
    () => buildCanonicalMigrationArchiveV0_3(shared),
    /migration_archive_member_invalid/u,
  );

  const overAggregate = validBuilderOptions();
  overAggregate.members = [overAggregate.members[0]];
  overAggregate.members[0].bytes = Buffer.allocUnsafe(
    MIGRATION_ARCHIVE_V0_3_MAX_IN_MEMORY_UNCOMPRESSED_BYTES + 1,
  );
  assert.throws(
    () => buildCanonicalMigrationArchiveV0_3(overAggregate),
    /migration_archive_streaming_builder_required/u,
  );
});

test("file-backed verifier issues structure-only capability and closes exactly once", async () => {
  const root = await mkdtemp(join(tmpdir(), "m2-v2-archive-v03-"));
  try {
    const built = buildCanonicalMigrationArchiveV0_3(validBuilderOptions());
    const archivePath = join(root, MIGRATION_ARCHIVE_V0_3_INNER_FILENAME);
    await writeFile(archivePath, built.archiveBytes);
    const capability = await verifyMigrationArchiveV0_3File(archivePath);
    const description = describeVerifiedMigrationArchiveV0_3(capability);
    assert.equal(description.archiveMemberCount, 2);
    assert.equal(description.capabilityScope, "STRUCTURE_ONLY");
    assert.equal(description.currentDirectRestoreAuthorized, false);
    await appendFile(archivePath, Buffer.from([0]));
    assert.equal(describeVerifiedMigrationArchiveV0_3(capability).capabilityScope, "STRUCTURE_ONLY");
    await assert.rejects(
      () => verifyMigrationArchiveV0_3File(archivePath),
      /migration_archive_eocd_invalid/u,
    );
    await closeVerifiedMigrationArchiveV0_3(capability);
    await assert.rejects(
      () => closeVerifiedMigrationArchiveV0_3(capability),
      /migration_archive_capability_invalid/u,
    );
    assert.throws(
      () => describeVerifiedMigrationArchiveV0_3(capability),
      /migration_archive_capability_invalid/u,
    );

    const trailingPath = join(root, "deflate-trailing.zip");
    await writeFile(trailingPath, makeArchiveFixture({
      method: "DEFLATE",
      trailingDeflateData: true,
    }).archiveBytes);
    await assert.rejects(
      () => verifyMigrationArchiveV0_3File(trailingPath),
      /migration_archive_deflate_trailing_data/u,
    );

    const symlinkPath = join(root, "archive-link.zip");
    await symlink(trailingPath, symlinkPath, "file");
    await assert.rejects(
      () => verifyMigrationArchiveV0_3File(symlinkPath),
      /migration_archive_final_link_forbidden/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("raw verifier accepts STORE, DEFLATE, directories, and signed exact descriptors", () => {
  const stored = makeArchiveFixture();
  assert.equal(
    describeVerifiedMigrationArchiveV0_3(verifyMigrationArchiveV0_3(stored.archiveBytes))
      .archiveMemberCount,
    1,
  );

  const deflated = makeArchiveFixture({ method: "DEFLATE" });
  assert.equal(
    describeVerifiedMigrationArchiveV0_3(verifyMigrationArchiveV0_3(deflated.archiveBytes))
      .archiveMemberCount,
    1,
  );

  const descriptor = makeArchiveFixture({ method: "DEFLATE", descriptor: true });
  assert.equal(
    describeVerifiedMigrationArchiveV0_3(verifyMigrationArchiveV0_3(descriptor.archiveBytes))
      .archiveMemberCount,
    1,
  );

  const withDirectory = makeArchiveFixture({ withDirectory: true });
  assert.equal(
    describeVerifiedMigrationArchiveV0_3(verifyMigrationArchiveV0_3(withDirectory.archiveBytes))
      .archiveMemberCount,
    2,
  );
});

test("public writer and file verifier cross the exact 0xffff ZIP64 count boundary", async () => {
  const root = await mkdtemp(join(tmpdir(), "m2-v2-archive-zip64-count-"));
  try {
    let below = buildCanonicalMigrationArchiveV0_3(zip64CountBuilderOptions(65_533));
    const belowEocd = below.archiveBytes.length - 22;
    assert.equal(below.archiveBytes.readUInt32LE(belowEocd), EOCD_SIGNATURE);
    assert.equal(below.archiveBytes.readUInt16LE(belowEocd + 10), 65_534);
    assert.notEqual(below.archiveBytes.readUInt32LE(belowEocd - 20), ZIP64_LOCATOR_SIGNATURE);
    const belowPath = join(root, "below.zip");
    await writeFile(belowPath, below.archiveBytes);
    const belowCapability = await verifyMigrationArchiveV0_3File(belowPath);
    assert.equal(describeVerifiedMigrationArchiveV0_3(belowCapability).archiveMemberCount, 65_533);
    await closeVerifiedMigrationArchiveV0_3(belowCapability);
    below = null;

    let boundary = buildCanonicalMigrationArchiveV0_3(zip64CountBuilderOptions(65_534));
    const boundaryEocd = boundary.archiveBytes.length - 22;
    assert.equal(boundary.archiveBytes.readUInt16LE(boundaryEocd + 8), 0xffff);
    assert.equal(boundary.archiveBytes.readUInt16LE(boundaryEocd + 10), 0xffff);
    assert.equal(boundary.archiveBytes.readUInt32LE(boundaryEocd - 20), ZIP64_LOCATOR_SIGNATURE);
    const zip64Offset = Number(boundary.archiveBytes.readBigUInt64LE(boundaryEocd - 12));
    assert.equal(boundary.archiveBytes.readUInt32LE(zip64Offset), ZIP64_EOCD_SIGNATURE);
    assert.equal(boundary.archiveBytes.readBigUInt64LE(zip64Offset + 32), 65_535n);
    const boundaryPath = join(root, "boundary.zip");
    await writeFile(boundaryPath, boundary.archiveBytes);
    const boundaryCapability = await verifyMigrationArchiveV0_3File(boundaryPath);
    assert.equal(describeVerifiedMigrationArchiveV0_3(boundaryCapability).archiveMemberCount, 65_534);
    await closeVerifiedMigrationArchiveV0_3(boundaryCapability);

    const mismatch = Buffer.from(boundary.archiveBytes);
    mismatch.writeUInt16LE(65_534, boundaryEocd + 8);
    const mismatchPath = join(root, "sentinel-mismatch.zip");
    await writeFile(mismatchPath, mismatch);
    await assert.rejects(
      () => verifyMigrationArchiveV0_3File(mismatchPath),
      /migration_archive_zip64_noncanonical/u,
    );
    boundary = null;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("raw verifier rejects prefix, trailing bytes, malformed ZIP64, overlap, and local/central drift", () => {
  const fixture = makeArchiveFixture();
  assert.throws(
    () => verifyMigrationArchiveV0_3(Buffer.concat([Buffer.from([0]), fixture.archiveBytes])),
    /migration_archive_(?:eocd|central_directory|local_range)_invalid/u,
  );
  assert.throws(
    () => verifyMigrationArchiveV0_3(Buffer.concat([fixture.archiveBytes, Buffer.from([0])])),
    /migration_archive_eocd_invalid/u,
  );

  const gratuitousZip64 = upgradeToForcedZip64(fixture.archiveBytes);
  assert.throws(
    () => verifyMigrationArchiveV0_3(gratuitousZip64),
    /migration_archive_zip64_noncanonical/u,
  );
  const noncanonicalZip64 = Buffer.from(gratuitousZip64);
  noncanonicalZip64.writeUInt16LE(2, noncanonicalZip64.length - 22 + 8);
  assert.throws(
    () => verifyMigrationArchiveV0_3(noncanonicalZip64),
    /migration_archive_zip64_noncanonical/u,
  );

  const localDrift = Buffer.from(fixture.archiveBytes);
  localDrift.writeUInt16LE(8, 8);
  assert.throws(
    () => verifyMigrationArchiveV0_3(localDrift),
    /migration_archive_local_central_mismatch/u,
  );

  const overlapping = makeArchiveFixture({ secondLocalOffset: 0 });
  assert.throws(
    () => verifyMigrationArchiveV0_3(overlapping.archiveBytes),
    /migration_archive_local_range_invalid/u,
  );
});

test("PR7-P1-006-v01-extra-root, PR7-P1-006-v01-control, and PR7-P1-006-collision fail closed", () => {
  assert.throws(
    () => verifyMigrationArchiveV0_3(makeArchiveFixture({ extraActualMember: true }).archiveBytes),
    /migration_archive_set_mismatch/u,
  );
  assert.throws(
    () => verifyMigrationArchiveV0_3(makeArchiveFixture({ missingDeclaredMember: true }).archiveBytes),
    /migration_archive_set_mismatch/u,
  );
  assert.throws(
    () => verifyMigrationArchiveV0_3(makeArchiveFixture({ manifestListsReservedPath: true }).archiveBytes),
    /migration_(?:control_set_invalid|archive_set_mismatch)/u,
  );
  assert.throws(
    () => verifyMigrationArchiveV0_3(makeArchiveFixture({ caseCollision: true }).archiveBytes),
    /migration_member_name_collision_or_link/u,
  );
  assert.throws(
    () => verifyMigrationArchiveV0_3(makeArchiveFixture({ unicodeCaseCollision: true }).archiveBytes),
    /migration_member_name_collision_or_link/u,
  );
  assert.throws(
    () => verifyMigrationArchiveV0_3(makeArchiveFixture({ treeAlias: true }).archiveBytes),
    /migration_member_name_collision_or_link/u,
  );
  assert.throws(
    () => verifyMigrationArchiveV0_3(makeArchiveFixture({ traversalPath: true }).archiveBytes),
    /migration_archive_member_name_invalid/u,
  );
  assert.throws(
    () => verifyMigrationArchiveV0_3(makeArchiveFixture({ reservedPath: true }).archiveBytes),
    /migration_archive_member_name_invalid/u,
  );
  assert.throws(
    () => verifyMigrationArchiveV0_3(makeArchiveFixture({ linkMode: true }).archiveBytes),
    /migration_member_name_collision_or_link/u,
  );
  assert.throws(
    () => verifyMigrationArchiveV0_3(makeArchiveFixture({ receiptSidecarInsideZip: true }).archiveBytes),
    /migration_archive_set_mismatch/u,
  );
});

test("manifest parser rejects duplicate or unknown keys and enforces digest, role, mode, CRC, and SHA bindings", () => {
  assert.throws(
    () => verifyMigrationArchiveV0_3(makeArchiveFixture({ duplicateManifestKey: true }).archiveBytes),
    /migration_manifest_duplicate_key/u,
  );
  assert.throws(
    () => verifyMigrationArchiveV0_3(makeArchiveFixture({ unknownManifestKey: true }).archiveBytes),
    /migration_manifest_fields_invalid/u,
  );
  assert.throws(
    () => verifyMigrationArchiveV0_3(makeArchiveFixture({ invalidManifestDigest: true }).archiveBytes),
    /migration_manifest_digest_invalid/u,
  );
  assert.throws(
    () => verifyMigrationArchiveV0_3(makeArchiveFixture({ invalidPolicyDigest: true }).archiveBytes),
    /migration_archive_policy_digest_invalid/u,
  );
  assert.throws(
    () => verifyMigrationArchiveV0_3(makeArchiveFixture({ invalidRoleBinding: true }).archiveBytes),
    /migration_archive_payload_role_invalid/u,
  );
  assert.throws(
    () => verifyMigrationArchiveV0_3(makeArchiveFixture({ invalidRoleCardinality: true }).archiveBytes),
    /migration_archive_payload_role_cardinality_invalid/u,
  );
  assert.throws(
    () => verifyMigrationArchiveV0_3(makeArchiveFixture({ numericUnixMode: true }).archiveBytes),
    /migration_archive_member_mode_invalid/u,
  );
  assert.throws(
    () => verifyMigrationArchiveV0_3(makeArchiveFixture({ invalidContentSha: true }).archiveBytes),
    /migration_archive_member_record_mismatch/u,
  );

  const crcTamper = makeArchiveFixture();
  const tamperedBytes = Buffer.from(crcTamper.archiveBytes);
  const payloadLocation = locateEntry(tamperedBytes, crcTamper.payloads[0].canonicalPath);
  tamperedBytes[payloadLocation.dataStart] ^= 0xff;
  assert.throws(
    () => verifyMigrationArchiveV0_3(tamperedBytes),
    /migration_archive_crc_mismatch/u,
  );
});

test("PR7-P1-006-bomb: raw budgets reject high-ratio data before inflate and aliases fail closed", () => {
  assert.throws(
    () => verifyMigrationArchiveV0_3(makeArchiveFixture({
      method: "DEFLATE",
      payloadBytes: Buffer.alloc(20_000),
    }).archiveBytes),
    /migration_archive_budget_exceeded/u,
  );

  const invalidUtf8 = makeArchiveFixture();
  const invalidUtf8Bytes = Buffer.from(invalidUtf8.archiveBytes);
  const location = locateEntry(invalidUtf8Bytes, invalidUtf8.payloads[0].canonicalPath);
  invalidUtf8Bytes[location.centralNameStart] = 0xff;
  invalidUtf8Bytes[location.localNameStart] = 0xff;
  assert.throws(
    () => verifyMigrationArchiveV0_3(invalidUtf8Bytes),
    /migration_archive_member_name_invalid/u,
  );

  assert.throws(
    () => verifyMigrationArchiveV0_3(makeArchiveFixture({ mismatchedUnicodeExtra: true }).archiveBytes),
    /migration_archive_unicode_path_invalid/u,
  );

  assert.throws(
    () => verifyMigrationArchiveV0_3(makeArchiveFixture({ localUnicodeExtraMissing: true }).archiveBytes),
    /migration_archive_local_central_mismatch/u,
  );

  assert.equal(
    describeVerifiedMigrationArchiveV0_3(verifyMigrationArchiveV0_3(
      makeArchiveFixture({ validUnicodeExtra: true }).archiveBytes,
    )).archiveMemberCount,
    1,
  );

  assert.throws(
    () => verifyMigrationArchiveV0_3(makeArchiveFixture({
      method: "DEFLATE",
      trailingDeflateData: true,
    }).archiveBytes),
    /migration_archive_deflate_trailing_data/u,
  );

  const noncanonicalVersion = makeArchiveFixture();
  const noncanonicalVersionBytes = Buffer.from(noncanonicalVersion.archiveBytes);
  const versionLocation = locateEntry(
    noncanonicalVersionBytes,
    noncanonicalVersion.payloads[0].canonicalPath,
  );
  noncanonicalVersionBytes.writeUInt16LE(20, versionLocation.localOffset + 4);
  noncanonicalVersionBytes.writeUInt16LE(20, versionLocation.centralOffset + 6);
  assert.throws(
    () => verifyMigrationArchiveV0_3(noncanonicalVersionBytes),
    /migration_archive_member_header_invalid/u,
  );
});

test("DEFLATE, descriptor, directory, and mode edge forms fail closed", async () => {
  const zeroDeflate = makeArchiveFixture({
    method: "DEFLATE",
    payloadBytes: Buffer.alloc(0),
    forceZeroDeflate: true,
  });
  assert.throws(
    () => verifyMigrationArchiveV0_3(zeroDeflate.archiveBytes),
    /migration_archive_deflate_empty_invalid/u,
  );

  for (const descriptorKind of ["UNSIGNED_12", "SIGNED_24", "UNFLAGGED_SIGNED_16"]) {
    assert.throws(
      () => verifyMigrationArchiveV0_3(makeArchiveFixture({
        method: "DEFLATE",
        descriptorKind,
      }).archiveBytes),
      /migration_archive_(?:data_descriptor|local_range)_invalid/u,
    );
  }
  assert.throws(
    () => verifyMigrationArchiveV0_3(makeArchiveFixture({ invalidDirectoryData: true }).archiveBytes),
    /migration_archive_directory_member_invalid/u,
  );
  assert.throws(
    () => verifyMigrationArchiveV0_3(makeArchiveFixture({ invalidRegularMode: true }).archiveBytes),
    /migration_member_name_collision_or_link/u,
  );

  const root = await mkdtemp(join(tmpdir(), "m2-v2-zero-deflate-"));
  try {
    const archivePath = join(root, "zero-deflate.zip");
    await writeFile(archivePath, zeroDeflate.archiveBytes);
    await assert.rejects(
      () => verifyMigrationArchiveV0_3File(archivePath),
      /migration_archive_deflate_empty_invalid/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("memory and file entrypoints apply pre-inflate aggregate and manifest caps", async () => {
  const overMemory = makeArchiveFixture({ aggregateMemoryBudgetClaim: true });
  assert.throws(
    () => verifyMigrationArchiveV0_3(overMemory.archiveBytes),
    /migration_archive_streaming_verifier_required/u,
  );

  const manifestCap = makeArchiveFixture({ manifestBudgetClaim: true });
  const root = await mkdtemp(join(tmpdir(), "m2-v2-manifest-cap-"));
  try {
    const archivePath = join(root, "manifest-cap.zip");
    await writeFile(archivePath, manifestCap.archiveBytes);
    await assert.rejects(
      () => verifyMigrationArchiveV0_3File(archivePath),
      /migration_archive_manifest_budget_exceeded/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function validBuilderOptions() {
  return {
    packageId: "synthetic-package",
    sourceExactHead: "a".repeat(40),
    policyDigestSha256: MIGRATION_ARCHIVE_V0_3_POLICY_DIGEST_SHA256,
    identityReceiptDigestSha256: "c".repeat(64),
    createdAt: "2026-07-20T00:00:00.000Z",
    payloadRoles: [
      { roleId: "environment", required: false, minimumCardinality: 0, maximumCardinality: 1 },
      { roleId: "private_state", required: true, minimumCardinality: 1, maximumCardinality: null },
    ],
    members: [
      {
        canonicalPath: "payload/data/state.json",
        memberKind: "REGULAR_FILE",
        payloadRole: "private_state",
        bytes: Buffer.from("{\"state\":1}\n", "utf8"),
      },
      {
        canonicalPath: "payload/env/",
        memberKind: "DIRECTORY",
        payloadRole: "environment",
        bytes: Buffer.alloc(0),
      },
    ],
  };
}

function zip64CountBuilderOptions(payloadCount) {
  const members = Array.from({ length: payloadCount }, (_value, index) => ({
    canonicalPath: `payload/d${String(index).padStart(5, "0")}/`,
    memberKind: "DIRECTORY",
    payloadRole: "generic",
    bytes: Buffer.alloc(0),
  }));
  return {
    packageId: `zip64-count-${payloadCount}`,
    sourceExactHead: "a".repeat(40),
    policyDigestSha256: MIGRATION_ARCHIVE_V0_3_POLICY_DIGEST_SHA256,
    identityReceiptDigestSha256: "c".repeat(64),
    createdAt: "2026-07-20T00:00:00.000Z",
    payloadRoles: [{
      roleId: "generic",
      required: true,
      minimumCardinality: payloadCount,
      maximumCardinality: payloadCount,
    }],
    members,
  };
}

function makeArchiveFixture(options = {}) {
  const payloads = [{
    canonicalPath: options.traversalPath
      ? "../state.json"
      : options.reservedPath
        ? "payload/COM¹.txt"
        : options.unicodeCaseCollision
          ? "payload/Straße.json"
          : options.validUnicodeExtra
            ? "payload/状态.json"
            : "payload/state.json",
    memberKind: "REGULAR_FILE",
    payloadRole: "private_state",
    bytes: options.payloadBytes ?? Buffer.from("{\"state\":1}\n", "utf8"),
    method: options.method ?? "STORE",
    descriptor: options.descriptorKind ?? options.descriptor ?? false,
    descriptorFlag: options.descriptorKind === "UNFLAGGED_SIGNED_16"
      ? false
      : undefined,
    linkMode: options.linkMode ?? false,
    invalidRegularMode: options.invalidRegularMode ?? false,
    mismatchedUnicodeExtra: options.mismatchedUnicodeExtra ?? false,
    localUnicodeExtraMissing: options.localUnicodeExtraMissing ?? false,
    validUnicodeExtra: options.validUnicodeExtra ?? false,
    trailingDeflateData: options.trailingDeflateData ?? false,
    forceZeroDeflate: options.forceZeroDeflate ?? false,
  }];
  if (options.aggregateMemoryBudgetClaim) {
    const uncompressedSize = (64 * 1024 * 1024) + 1;
    const compressedSize = Math.ceil(uncompressedSize / 200);
    payloads[0].method = "DEFLATE";
    payloads[0].bytes = Buffer.alloc(0);
    payloads[0].compressedOverride = Buffer.alloc(compressedSize);
    payloads[0].declaredCompressedSize = compressedSize;
    payloads[0].declaredUncompressedSize = uncompressedSize;
  }
  if (options.withDirectory) {
    payloads.push({
      canonicalPath: "payload/empty/",
      memberKind: "DIRECTORY",
      payloadRole: "private_state",
      bytes: Buffer.alloc(0),
      method: "STORE",
    });
  }
  if (options.invalidDirectoryData) {
    payloads.push({
      canonicalPath: "payload/nonempty/",
      memberKind: "DIRECTORY",
      payloadRole: "private_state",
      bytes: Buffer.from("x", "utf8"),
      method: "STORE",
    });
  }
  if (options.caseCollision) {
    payloads.push({
      canonicalPath: "PAYLOAD/STATE.JSON",
      memberKind: "REGULAR_FILE",
      payloadRole: "private_state",
      bytes: Buffer.from("other", "utf8"),
      method: "STORE",
    });
  }
  if (options.unicodeCaseCollision) {
    payloads.push({
      canonicalPath: "payload/STRASSE.json",
      memberKind: "REGULAR_FILE",
      payloadRole: "private_state",
      bytes: Buffer.from("other", "utf8"),
      method: "STORE",
    });
  }
  if (options.treeAlias) {
    payloads.push(
      {
        canonicalPath: "payload/tree",
        memberKind: "REGULAR_FILE",
        payloadRole: "private_state",
        bytes: Buffer.from("file", "utf8"),
        method: "STORE",
      },
      {
        canonicalPath: "payload/tree/child.json",
        memberKind: "REGULAR_FILE",
        payloadRole: "private_state",
        bytes: Buffer.from("child", "utf8"),
        method: "STORE",
      },
    );
  }
  if (options.missingDeclaredMember) {
    payloads.push({
      canonicalPath: "payload/missing.json",
      memberKind: "REGULAR_FILE",
      payloadRole: "private_state",
      bytes: Buffer.from("missing", "utf8"),
      method: "STORE",
      omitActual: true,
    });
  }

  const archiveMembers = payloads.map((payload) => memberRecord(payload));
  if (options.manifestListsReservedPath) {
    archiveMembers.push(memberRecord({
      canonicalPath: MIGRATION_ARCHIVE_V0_3_MANIFEST_PATH,
      memberKind: "REGULAR_FILE",
      payloadRole: "private_state",
      bytes: Buffer.from("reserved", "utf8"),
      method: "STORE",
    }));
  }
  if (options.numericUnixMode) archiveMembers[0].unixMode = 644;
  if (options.invalidContentSha) archiveMembers[0].contentSha256 = "d".repeat(64);
  const rolePaths = archiveMembers
    .filter((record) => record.payloadRole === "private_state")
    .map((record) => record.canonicalPath)
    .sort(compareUtf8);
  if (options.invalidRoleBinding) rolePaths[0] = "payload/not-declared.json";
  const manifest = {
    schema: "m2.v2.private-state-migration-package.v0.3",
    packageId: "synthetic-package",
    sourceExactHead: "a".repeat(40),
    policyDigestSha256: options.invalidPolicyDigest
      ? "b".repeat(64)
      : MIGRATION_ARCHIVE_V0_3_POLICY_DIGEST_SHA256,
    archiveMembers,
    payloadRoles: [{
      roleId: "private_state",
      required: true,
      minimumCardinality: 1,
      maximumCardinality: null,
      memberPaths: rolePaths,
    }],
    identityReceiptDigestSha256: "c".repeat(64),
    createdAt: "2026-07-20T00:00:00.000Z",
    manifestDigestSha256: "",
  };
  if (options.invalidRoleCardinality) manifest.payloadRoles[0].minimumCardinality = 99;
  if (options.unknownManifestKey) manifest.unknown = true;
  manifest.manifestDigestSha256 = manifestDigest(manifest);
  if (options.invalidManifestDigest) manifest.manifestDigestSha256 = "e".repeat(64);
  let manifestBytes = Buffer.from(canonicalJson(manifest), "utf8");
  if (options.duplicateManifestKey) {
    const duplicate = `\"schema\":${JSON.stringify(manifest.schema)},`;
    manifestBytes = Buffer.from(`{${duplicate}${canonicalJson(manifest).slice(1)}`, "utf8");
  }

  const actualEntries = payloads
    .filter((payload) => !payload.omitActual)
    .map((payload) => rawEntry(payload));
  if (options.manifestBudgetClaim) {
    const uncompressedSize = (64 * 1024 * 1024) + 1;
    const compressedSize = Math.ceil(uncompressedSize / 200);
    actualEntries.push(rawEntry({
      canonicalPath: MIGRATION_ARCHIVE_V0_3_MANIFEST_PATH,
      memberKind: "REGULAR_FILE",
      bytes: manifestBytes,
      method: "DEFLATE",
      compressedOverride: Buffer.alloc(compressedSize),
      declaredCompressedSize: compressedSize,
      declaredUncompressedSize: uncompressedSize,
    }));
  } else {
    actualEntries.push(rawEntry({
      canonicalPath: MIGRATION_ARCHIVE_V0_3_MANIFEST_PATH,
      memberKind: "REGULAR_FILE",
      bytes: manifestBytes,
      method: "STORE",
    }));
  }
  if (options.extraActualMember) {
    actualEntries.push(rawEntry({
      canonicalPath: "unexpected/control.json",
      memberKind: "REGULAR_FILE",
      bytes: Buffer.from("{}", "utf8"),
      method: "STORE",
    }));
  }
  if (options.receiptSidecarInsideZip) {
    actualEntries.push(rawEntry({
      canonicalPath: "metadata/migration-receipt.private.json",
      memberKind: "REGULAR_FILE",
      bytes: Buffer.from("{}", "utf8"),
      method: "STORE",
    }));
  }
  actualEntries.sort((left, right) => compareUtf8(left.path, right.path));
  if (options.secondLocalOffset !== undefined && actualEntries.length > 1) {
    actualEntries[1].centralLocalOffsetOverride = options.secondLocalOffset;
  }
  return {
    archiveBytes: writeTestZip(actualEntries),
    manifest,
    payloads,
  };
}

function memberRecord(payload) {
  const compressed = compressedPayload(payload);
  return {
    canonicalPath: payload.canonicalPath,
    memberKind: payload.memberKind,
    payloadRole: payload.payloadRole,
    compressionMethod: payload.method,
    crc32: hex32(crc32(payload.bytes)),
    compressedBytes: payload.declaredCompressedSize ?? compressed.length,
    uncompressedBytes: payload.declaredUncompressedSize ?? payload.bytes.length,
    contentSha256: sha256(payload.bytes),
    unixMode: payload.memberKind === "DIRECTORY" ? "0755" : "0644",
  };
}

function rawEntry(payload) {
  const compressed = compressedPayload(payload);
  let centralExtra = Buffer.alloc(0);
  let localExtra = Buffer.alloc(0);
  if (payload.mismatchedUnicodeExtra) {
    const wrongName = Buffer.from("payload/wrong.json", "utf8");
    const body = Buffer.alloc(5 + wrongName.length);
    body[0] = 1;
    body.writeUInt32LE(crc32(Buffer.from(payload.canonicalPath, "utf8")), 1);
    wrongName.copy(body, 5);
    centralExtra = makeExtra(0x7075, body);
    localExtra = centralExtra;
  } else if (payload.localUnicodeExtraMissing || payload.validUnicodeExtra) {
    const name = Buffer.from(payload.canonicalPath, "utf8");
    const body = Buffer.alloc(5 + name.length);
    body[0] = 1;
    body.writeUInt32LE(crc32(name), 1);
    name.copy(body, 5);
    centralExtra = makeExtra(0x7075, body);
    if (payload.validUnicodeExtra) localExtra = centralExtra;
  }
  return {
    path: payload.canonicalPath,
    bytes: payload.bytes,
    compressed,
    method: payload.method === "DEFLATE" ? 8 : 0,
    flags: UTF8_FLAG | ((payload.descriptorFlag ?? Boolean(payload.descriptor))
      ? DATA_DESCRIPTOR_FLAG
      : 0),
    descriptor: payload.descriptor ?? false,
    mode: payload.linkMode
      ? 0o120777
      : payload.invalidRegularMode
        ? 0o100600
      : payload.memberKind === "DIRECTORY" ? DIRECTORY_POSIX_MODE : REGULAR_POSIX_MODE,
    dosAttributes: payload.memberKind === "DIRECTORY" ? 0x10 : 0,
    centralExtra,
    localExtra,
    declaredCompressedSize: payload.declaredCompressedSize,
    declaredUncompressedSize: payload.declaredUncompressedSize,
  };
}

function compressedPayload(payload) {
  if (payload.compressedOverride !== undefined) return payload.compressedOverride;
  if (payload.forceZeroDeflate) return Buffer.alloc(0);
  const compressed = payload.method === "DEFLATE" ? deflateRawSync(payload.bytes) : payload.bytes;
  return payload.trailingDeflateData
    ? Buffer.concat([compressed, Buffer.from("junk", "utf8")])
    : compressed;
}

function writeTestZip(entries) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  for (const entry of entries) {
    entry.localOffset = localOffset;
    const name = Buffer.from(entry.path, "utf8");
    entry.name = name;
    entry.checksum = crc32(entry.bytes);
    entry.compressedSize = entry.declaredCompressedSize ?? entry.compressed.length;
    entry.uncompressedSize = entry.declaredUncompressedSize ?? entry.bytes.length;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_SIGNATURE, 0);
    local.writeUInt16LE(entry.method === 8 ? 20 : 10, 4);
    local.writeUInt16LE(entry.flags, 6);
    local.writeUInt16LE(entry.method, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(entry.checksum, 14);
    local.writeUInt32LE(entry.compressedSize, 18);
    local.writeUInt32LE(entry.uncompressedSize, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(entry.localExtra.length, 28);
    const descriptor = entry.descriptor
      ? makeDescriptor(
        entry.checksum,
        entry.compressedSize,
        entry.uncompressedSize,
        entry.descriptor,
      )
      : Buffer.alloc(0);
    const record = Buffer.concat([local, name, entry.localExtra, entry.compressed, descriptor]);
    localParts.push(record);
    localOffset += record.length;
  }
  const centralOffset = localOffset;
  let centralSize = 0;
  for (const entry of entries) {
    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_SIGNATURE, 0);
    central.writeUInt16LE((3 << 8) | 20, 4);
    central.writeUInt16LE(entry.method === 8 ? 20 : 10, 6);
    central.writeUInt16LE(entry.flags, 8);
    central.writeUInt16LE(entry.method, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(entry.checksum, 16);
    central.writeUInt32LE(entry.compressedSize, 20);
    central.writeUInt32LE(entry.uncompressedSize, 24);
    central.writeUInt16LE(entry.name.length, 28);
    central.writeUInt16LE(entry.centralExtra.length, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(((entry.mode << 16) | entry.dosAttributes) >>> 0, 38);
    central.writeUInt32LE(entry.centralLocalOffsetOverride ?? entry.localOffset, 42);
    const record = Buffer.concat([central, entry.name, entry.centralExtra]);
    centralParts.push(record);
    centralSize += record.length;
  }
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(EOCD_SIGNATURE, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, ...centralParts, eocd]);
}

function upgradeToForcedZip64(zip) {
  const eocdOffset = zip.length - 22;
  assert.equal(zip.readUInt32LE(eocdOffset), EOCD_SIGNATURE);
  const entryCount = zip.readUInt16LE(eocdOffset + 10);
  const centralSize = zip.readUInt32LE(eocdOffset + 12);
  const centralOffset = zip.readUInt32LE(eocdOffset + 16);
  const zip64 = Buffer.alloc(56);
  zip64.writeUInt32LE(ZIP64_EOCD_SIGNATURE, 0);
  zip64.writeBigUInt64LE(44n, 4);
  zip64.writeUInt16LE((3 << 8) | 45, 12);
  zip64.writeUInt16LE(45, 14);
  zip64.writeUInt32LE(0, 16);
  zip64.writeUInt32LE(0, 20);
  zip64.writeBigUInt64LE(BigInt(entryCount), 24);
  zip64.writeBigUInt64LE(BigInt(entryCount), 32);
  zip64.writeBigUInt64LE(BigInt(centralSize), 40);
  zip64.writeBigUInt64LE(BigInt(centralOffset), 48);
  const locator = Buffer.alloc(20);
  locator.writeUInt32LE(ZIP64_LOCATOR_SIGNATURE, 0);
  locator.writeUInt32LE(0, 4);
  locator.writeBigUInt64LE(BigInt(eocdOffset), 8);
  locator.writeUInt32LE(1, 16);
  const eocd = Buffer.alloc(22, 0xff);
  eocd.writeUInt32LE(EOCD_SIGNATURE, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(0xffff, 8);
  eocd.writeUInt16LE(0xffff, 10);
  eocd.writeUInt32LE(0xffffffff, 12);
  eocd.writeUInt32LE(0xffffffff, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([zip.subarray(0, eocdOffset), zip64, locator, eocd]);
}

function locateEntry(zip, wantedPath) {
  const eocdOffset = zip.length - 22;
  const count = zip.readUInt16LE(eocdOffset + 10);
  let centralOffset = zip.readUInt32LE(eocdOffset + 16);
  for (let index = 0; index < count; index += 1) {
    assert.equal(zip.readUInt32LE(centralOffset), CENTRAL_SIGNATURE);
    const nameLength = zip.readUInt16LE(centralOffset + 28);
    const extraLength = zip.readUInt16LE(centralOffset + 30);
    const commentLength = zip.readUInt16LE(centralOffset + 32);
    const centralNameStart = centralOffset + 46;
    const path = zip.subarray(centralNameStart, centralNameStart + nameLength).toString("utf8");
    const localOffset = zip.readUInt32LE(centralOffset + 42);
    const localNameLength = zip.readUInt16LE(localOffset + 26);
    const localExtraLength = zip.readUInt16LE(localOffset + 28);
    const localNameStart = localOffset + 30;
    const dataStart = localNameStart + localNameLength + localExtraLength;
    if (path === wantedPath) {
      return { centralOffset, centralNameStart, localOffset, localNameStart, dataStart };
    }
    centralOffset += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`test entry not found: ${wantedPath}`);
}

function makeDescriptor(checksum, compressedSize, uncompressedSize, kind) {
  if (kind === "UNSIGNED_12") {
    const result = Buffer.alloc(12);
    result.writeUInt32LE(checksum, 0);
    result.writeUInt32LE(compressedSize, 4);
    result.writeUInt32LE(uncompressedSize, 8);
    return result;
  }
  if (kind === "SIGNED_24") {
    const result = Buffer.alloc(24);
    result.writeUInt32LE(DATA_DESCRIPTOR_SIGNATURE, 0);
    result.writeUInt32LE(checksum, 4);
    result.writeBigUInt64LE(BigInt(compressedSize), 8);
    result.writeBigUInt64LE(BigInt(uncompressedSize), 16);
    return result;
  }
  const result = Buffer.alloc(16);
  result.writeUInt32LE(DATA_DESCRIPTOR_SIGNATURE, 0);
  result.writeUInt32LE(checksum, 4);
  result.writeUInt32LE(compressedSize, 8);
  result.writeUInt32LE(uncompressedSize, 12);
  return result;
}

function makeExtra(id, bytes) {
  const result = Buffer.alloc(4 + bytes.length);
  result.writeUInt16LE(id, 0);
  result.writeUInt16LE(bytes.length, 2);
  bytes.copy(result, 4);
  return result;
}

function manifestDigest(manifest) {
  const basis = structuredClone(manifest);
  basis.manifestDigestSha256 = "";
  return sha256(Buffer.from(canonicalJson(basis), "utf8"));
}

function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "number"
      || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => (
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`
  )).join(",")}}`;
}

function compareUtf8(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
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
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}
