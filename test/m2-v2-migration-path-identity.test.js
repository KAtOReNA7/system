import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

import * as migrationIdentity from "../src/domain/m2V2EvidencePilot/migrationPathIdentity.js";

test("migration identity exports only bounded native snapshot and capability operations", () => {
  assert.deepEqual(Object.keys(migrationIdentity).sort(), [
    "MIGRATION_IDENTITY_ENDPOINT_ROLES",
    "MIGRATION_IDENTITY_IMPLEMENTATION_STATUS",
    "MIGRATION_IDENTITY_PLATFORMS",
    "MIGRATION_IDENTITY_SET_SCHEMA",
    "MIGRATION_IDENTITY_SNAPSHOT_SCHEMA",
    "MIGRATION_IDENTITY_STAGES",
    "MIGRATION_NATIVE_OBSERVATION_SCHEMA",
    "assertSeparated",
    "buildMigrationIdentityReceipt",
    "captureMigrationPathSet",
    "resolveSafeDirectory",
    "validateMigrationIdentityReceipt",
    "verifyStableIdentity",
  ]);
  assert.equal(
    migrationIdentity.MIGRATION_IDENTITY_IMPLEMENTATION_STATUS,
    "ACCEPTANCE_COMPLETE_NOT_INTEGRATED",
  );
  for (const unsafeName of [
    "executePinnedMigrationOperation",
    "openPinnedMigrationIdentitySession",
    "createMigrationPathSetCapability",
  ]) assert.equal(Object.hasOwn(migrationIdentity, unsafeName), false);

  assert.throws(() => migrationIdentity.resolveSafeDirectory({
    path: resolve(process.cwd()),
    endpointRole: "OUTPUT",
    stage: "BEFORE_COPY",
    observer: () => ({}),
    platform: "WINDOWS_POWERSHELL_5_1_NATIVE",
    allowTestObserver: true,
  }), /migration_identity_options_invalid/u);
});

test("PR7-P2-008-same-target, PR7-P2-008-ancestor-alias, PR7-P2-008-distinct-pass, PR7-P2-008-unc-unstable, and PR7-P2-008-receipt-tamper", () => {
  const root = createWorkspaceRoot("capability");
  try {
    const repository = join(root, "repository");
    const source = join(repository, "source");
    const output = join(root, "output");
    const key = join(root, "key");
    const staging = join(root, "staging");
    for (const path of [repository, source, output, key, staging]) mkdirSync(path);

    const snapshot = migrationIdentity.resolveSafeDirectory({
      path: output,
      endpointRole: "OUTPUT",
      stage: "BEFORE_ENUMERATION",
    });
    const before = migrationIdentity.captureMigrationPathSet({
      endpoints: [
        { path: repository, endpointRole: "REPOSITORY" },
        { path: source, endpointRole: "SOURCE" },
        { path: output, endpointRole: "OUTPUT" },
        { path: key, endpointRole: "KEY" },
        { path: staging, endpointRole: "STAGING" },
      ],
      stage: "BEFORE_ENUMERATION",
    });
    assert.throws(
      () => migrationIdentity.assertSeparated(structuredClone(before)),
      /migration_identity_capability_invalid/u,
    );
    assert.equal(Object.isFrozen(snapshot), true);
    assert.equal(Object.isFrozen(snapshot.records), true);
    assert.equal(Object.isFrozen(snapshot.records.at(-1)), true);
    assert.equal(Object.isFrozen(before), true);
    assert.equal(Object.getPrototypeOf(before), null);
    assert.deepEqual(Object.keys(before), []);
    assert.equal(JSON.stringify(before), "{}");
    assert.equal(migrationIdentity.assertSeparated(before).sourceInsideRepository, true);

    const sameTarget = migrationIdentity.captureMigrationPathSet({
      endpoints: [
        { path: output, endpointRole: "OUTPUT" },
        { path: output, endpointRole: "KEY" },
      ],
      stage: "BEFORE_KEY_WRITE",
    });
    assert.throws(
      () => migrationIdentity.assertSeparated(sameTarget),
      /migration_directory_identity_collision/u,
    );

    const stable = migrationIdentity.captureMigrationPathSet({
      endpoints: [
        { path: repository, endpointRole: "REPOSITORY" },
        { path: source, endpointRole: "SOURCE" },
        { path: output, endpointRole: "OUTPUT" },
        { path: key, endpointRole: "KEY" },
        { path: staging, endpointRole: "STAGING" },
      ],
      stage: "BEFORE_COPY",
    });
    assert.equal(migrationIdentity.verifyStableIdentity(before, stable), true);
    const identityReceipt = migrationIdentity.buildMigrationIdentityReceipt({
      identityCapabilities: [before, stable],
      archiveMemberSetDigestSha256: "a".repeat(64),
      manifestDigestSha256: "b".repeat(64),
      result: "PASS",
    });
    assert.deepEqual(
      migrationIdentity.validateMigrationIdentityReceipt(identityReceipt),
      identityReceipt,
    );
    assert.equal(Object.isFrozen(identityReceipt), true);
    assert.equal(JSON.stringify(identityReceipt).includes(root), false);

    const tamperedReceipt = structuredClone(identityReceipt);
    tamperedReceipt.evidenceSetDigestSha256 = "c".repeat(64);
    assert.throws(
      () => migrationIdentity.validateMigrationIdentityReceipt(tamperedReceipt),
      /migration_identity_receipt_invalid/u,
    );
    const unstableReceipt = structuredClone(identityReceipt);
    if (unstableReceipt.platform === "WINDOWS_POWERSHELL_5_1_NATIVE") {
      unstableReceipt.platformEvidence.records[0].fileId128 = "0".repeat(32);
    } else {
      unstableReceipt.platformEvidence.records[0].inode = "0";
    }
    assert.throws(
      () => migrationIdentity.validateMigrationIdentityReceipt(unstableReceipt),
      /migration_stable_identity_unavailable/u,
    );

    const forgedPlain = {
      schema: migrationIdentity.MIGRATION_IDENTITY_SET_SCHEMA,
      platform: snapshot.platform,
      stage: snapshot.stage,
      snapshots: [snapshot],
      identitySetDigestSha256: "0".repeat(64),
    };
    for (const forged of [
      forgedPlain,
      Object.freeze({ ...before }),
      structuredClone(before),
      Object.freeze(Object.create(null)),
      snapshot,
    ]) {
      assert.throws(
        () => migrationIdentity.assertSeparated(forged),
        /migration_identity_capability_invalid/u,
      );
    }
    assert.throws(
      () => migrationIdentity.verifyStableIdentity(before, structuredClone(stable)),
      /migration_identity_capability_invalid/u,
    );

    const nestedKey = join(output, "nested-key");
    mkdirSync(nestedKey);
    const nested = migrationIdentity.captureMigrationPathSet({
      endpoints: [
        { path: output, endpointRole: "OUTPUT" },
        { path: nestedKey, endpointRole: "KEY" },
      ],
      stage: "BEFORE_KEY_WRITE",
    });
    assert.throws(
      () => migrationIdentity.assertSeparated(nested),
      /migration_directory_ancestor_relation/u,
    );
  } finally {
    removeWorkspaceRoot(root);
  }
});

test("PR7-P2-008-short-case and PR7-P2-008-posix-link-mount", () => {
  assertSupportedNativePlatform();
  const root = createWorkspaceRoot("aliases");
  try {
    const normal = join(root, "normal");
    const target = join(root, "target");
    const child = join(target, "child");
    const finalLink = join(root, "final-link");
    const ancestorLink = join(root, "ancestor-link");
    mkdirSync(normal);
    mkdirSync(target);
    mkdirSync(child);

    symlinkSync(target, finalLink, process.platform === "win32" ? "junction" : "dir");
    assert.throws(() => migrationIdentity.captureMigrationPathSet({
      endpoints: [{ path: finalLink, endpointRole: "KEY" }],
      stage: "BEFORE_KEY_WRITE",
    }), /migration_link_or_mount_forbidden/u);

    symlinkSync(target, ancestorLink, process.platform === "win32" ? "junction" : "dir");
    assert.throws(() => migrationIdentity.captureMigrationPathSet({
      endpoints: [{ path: join(ancestorLink, "child"), endpointRole: "SOURCE" }],
      stage: "BEFORE_ENUMERATION",
    }), /migration_link_or_mount_forbidden/u);

    if (process.platform === "win32") {
      const aliases = migrationIdentity.captureMigrationPathSet({
        endpoints: [
          { path: normal, endpointRole: "OUTPUT" },
          { path: normal.toUpperCase(), endpointRole: "KEY" },
        ],
        stage: "BEFORE_KEY_WRITE",
      });
      assert.throws(
        () => migrationIdentity.assertSeparated(aliases),
        /migration_directory_identity_collision/u,
      );
    } else {
      assert.throws(() => migrationIdentity.captureMigrationPathSet({
        endpoints: [
          { path: target, endpointRole: "OUTPUT" },
          { path: finalLink, endpointRole: "KEY" },
        ],
        stage: "BEFORE_KEY_WRITE",
      }), /migration_link_or_mount_forbidden/u);
    }
  } finally {
    removeWorkspaceRoot(root);
  }
});

test("PR7-P2-008-toctou-swap", () => {
  assertSupportedNativePlatform();
  const root = createWorkspaceRoot("drift");
  try {
    const endpoint = join(root, "endpoint");
    const retainedOldEndpoint = join(root, "endpoint-retained-old-object");
    mkdirSync(endpoint);
    const before = migrationIdentity.captureMigrationPathSet({
      endpoints: [{ path: endpoint, endpointRole: "OUTPUT" }],
      stage: "BEFORE_COPY",
    });
    renameSync(endpoint, retainedOldEndpoint);
    mkdirSync(endpoint);
    const after = migrationIdentity.captureMigrationPathSet({
      endpoints: [{ path: endpoint, endpointRole: "OUTPUT" }],
      stage: "AFTER_OPERATION",
    });
    assert.throws(
      () => migrationIdentity.verifyStableIdentity(before, after),
      /migration_identity_changed/u,
    );
  } finally {
    removeWorkspaceRoot(root);
  }
});

test("migration identity observer unavailability fails closed without fallback", () => {
  assertSupportedNativePlatform();
  const moduleUrl = pathToFileURL(resolve(
    process.cwd(),
    "src/domain/m2V2EvidencePilot/migrationPathIdentity.js",
  )).href;
  const path = resolve(process.cwd());
  const unavailableSetup = process.platform === "win32"
    ? `process.env.SystemRoot = ${JSON.stringify(join(process.cwd(), ".m2-v2-missing-system-root"))};`
    : "process.env.PATH = \"\";";
  const childSource = [
    `import { resolveSafeDirectory } from ${JSON.stringify(moduleUrl)};`,
    unavailableSetup,
    "try {",
    `  resolveSafeDirectory({ path: ${JSON.stringify(path)}, endpointRole: \"OUTPUT\", stage: \"BEFORE_COPY\" });`,
    "  process.exitCode = 2;",
    "} catch (error) {",
    "  process.stdout.write(String(error.message));",
    "}",
  ].join("\n");
  const child = spawnSync(process.execPath, [
    "--input-type=module",
    "--eval",
    childSource,
  ], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env },
    shell: false,
    windowsHide: true,
  });
  assert.equal(child.error, undefined);
  assert.equal(child.status, 0);
  assert.equal(child.stderr, "");
  assert.equal(child.stdout, "migration_native_observer_unavailable");
});

function createWorkspaceRoot(label) {
  return mkdtempSync(join(process.cwd(), `.m2-v2-migration-identity-${label}-`));
}

function removeWorkspaceRoot(root) {
  rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

function assertSupportedNativePlatform() {
  if (!["win32", "linux"].includes(process.platform)) {
    assert.fail(`unsupported native test platform: ${process.platform}`);
  }
}
