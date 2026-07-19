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
    "captureMigrationPathSet",
    "resolveSafeDirectory",
    "verifyStableIdentity",
  ]);
  assert.equal(
    migrationIdentity.MIGRATION_IDENTITY_IMPLEMENTATION_STATUS,
    "PARTIAL_NOT_INTEGRATED",
  );
  for (const unsafeName of [
    "buildMigrationIdentityReceipt",
    "validateMigrationIdentityReceipt",
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

test("migration identity authority accepts only genuine host-native opaque capabilities", () => {
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

test("migration identity native observation rejects link ancestors and physical aliases", () => {
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

test("migration identity genuine capabilities detect native object replacement", () => {
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
