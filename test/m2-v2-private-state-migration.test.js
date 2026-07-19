import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import "./m2-v2-migration-archive-v0-3.test.js";
import "./m2-v2-migration-path-identity.test.js";

import {
  MIGRATION_ALLOWED_ENV_NAMES,
  normalizeMigrationManifestPath,
  restoreVerifiedPrivateStateMigration,
  validateMigrationPayloadSet,
} from "../src/domain/m2V2EvidencePilot/privateStateMigration.js";

test("migration manifest rejects path aliases, traversal, absolute paths, and duplicate-plus-unlisted payload attacks", () => {
  for (const value of ["", "../escape", "payload/../escape", "payload//env/file", "payload/./env/file", "C:\\escape", "\\\\server\\share", "/absolute"]) {
    assert.throws(() => normalizeMigrationManifestPath(value, { platform: "win32" }));
  }
  const fixture = makeMigrationFixture();
  try {
    const duplicate = structuredClone(fixture.manifest);
    duplicate.entries = [duplicate.entries[0], duplicate.entries[1], structuredClone(duplicate.entries[1])];
    duplicate.payloadFileCount = 3;
    duplicate.payloadBytes = duplicate.entries.reduce((sum, entry) => sum + entry.sizeBytes, 0);
    assert.throws(() => validateMigrationPayloadSet({ extractRoot: fixture.extractRoot, manifest: duplicate, platform: "win32" }), /duplicate/u);

    const caseAlias = structuredClone(fixture.manifest);
    caseAlias.entries.push({ ...caseAlias.entries[1], relativePath: caseAlias.entries[1].relativePath.toUpperCase() });
    caseAlias.payloadFileCount += 1;
    caseAlias.payloadBytes += caseAlias.entries[1].sizeBytes;
    assert.throws(() => validateMigrationPayloadSet({ extractRoot: fixture.extractRoot, manifest: caseAlias, platform: "win32" }), /duplicate/u);

    const extraPath = join(fixture.extractRoot, "payload", "data", "private-output", "m2-v2-evidence-pilot", "extra.json");
    write(extraPath, "{\"extra\":true}\n");
    assert.throws(() => validateMigrationPayloadSet({ extractRoot: fixture.extractRoot, manifest: fixture.manifest }), /exact_set/u);
  } finally {
    fixture.cleanup();
  }
});

test("migration manifest rejects file symlinks, parent symlinks, and hardlinks", () => {
  const symlinkFixture = makeMigrationFixture();
  try {
    const target = symlinkFixture.privateFile;
    const link = join(dirname(target), "linked.json");
    symlinkSync(target, link, "file");
    const entry = entryFor(symlinkFixture.extractRoot, link);
    const manifest = withEntry(symlinkFixture.manifest, entry);
    assert.throws(() => validateMigrationPayloadSet({ extractRoot: symlinkFixture.extractRoot, manifest }), /reparse/u);
  } finally {
    symlinkFixture.cleanup();
  }

  const hardlinkFixture = makeMigrationFixture();
  try {
    const link = join(dirname(hardlinkFixture.privateFile), "hardlinked.json");
    linkSync(hardlinkFixture.privateFile, link);
    const manifest = withEntry(hardlinkFixture.manifest, entryFor(hardlinkFixture.extractRoot, link));
    assert.throws(() => validateMigrationPayloadSet({ extractRoot: hardlinkFixture.extractRoot, manifest }), /hardlink/u);
  } finally {
    hardlinkFixture.cleanup();
  }

  const parentFixture = makeMigrationFixture();
  try {
    const real = join(parentFixture.base, "real-private");
    mkdirSync(real);
    write(join(real, "state.json"), "{\"state\":1}\n");
    rmSync(join(parentFixture.extractRoot, "payload", "data", "private-output", "m2-v2-evidence-pilot"), { recursive: true, force: true });
    symlinkSync(real, join(parentFixture.extractRoot, "payload", "data", "private-output", "m2-v2-evidence-pilot"), "junction");
    assert.throws(() => validateMigrationPayloadSet({ extractRoot: parentFixture.extractRoot, manifest: parentFixture.manifest }), /reparse/u);
  } finally {
    parentFixture.cleanup();
  }
});

test("migration restores only verified members, merges the closed env set, and reruns without writes", () => {
  const fixture = makeMigrationFixture({ withTargetState: true });
  try {
    const result = restoreVerifiedPrivateStateMigration({
      extractRoot: fixture.extractRoot,
      targetRepoRoot: fixture.targetRoot,
      manifest: fixture.manifest,
      force: true,
    });
    assert.equal(result.status, "restored");
    assert.equal(result.providerRequestDelta, 0);
    assert.equal(result.apiKeyValuesPersistedInReceipt, false);
    assert.equal(readFileSync(join(fixture.targetRoot, "data", "private-output", "m2-v2-evidence-pilot", "state.json"), "utf8"), "{\"state\":1}\n");
    const env = readFileSync(join(fixture.targetRoot, ".env.local"), "utf8");
    assert.match(env, /UNRELATED_SETTING=preserved/u);
    assert.match(env, /OPENAI_API_KEY=synthetic-openai/u);
    assert.match(env, /TAVILY_API_KEY=synthetic-tavily/u);
    const envPath = join(fixture.targetRoot, ".env.local");
    const privatePath = join(fixture.targetRoot, "data", "private-output", "m2-v2-evidence-pilot", "state.json");
    const before = { envMtime: statSync(envPath).mtimeMs, privateMtime: statSync(privatePath).mtimeMs };
    const second = restoreVerifiedPrivateStateMigration({
      extractRoot: fixture.extractRoot,
      targetRepoRoot: fixture.targetRoot,
      manifest: fixture.manifest,
      force: true,
    });
    assert.equal(second.status, "already_restored_noop");
    assert.equal(statSync(envPath).mtimeMs, before.envMtime);
    assert.equal(statSync(privatePath).mtimeMs, before.privateMtime);
  } finally {
    fixture.cleanup();
  }
});

for (const faultAt of [
  "private_rename_before",
  "private_rename_after",
  "env_write_before",
  "env_write_after",
  "git_check_before",
  "receipt_write_before",
]) {
  test(`migration restores prior private and environment state at ${faultAt}`, () => {
    const fixture = makeMigrationFixture({ withTargetState: true });
    try {
      const oldPrivatePath = join(fixture.targetRoot, "data", "private-output", "m2-v2-evidence-pilot", "old.json");
      const oldEnvPath = join(fixture.targetRoot, ".env.local");
      const oldPrivate = readFileSync(oldPrivatePath);
      const oldEnv = readFileSync(oldEnvPath);
      const oldMetadata = { privateMtime: statSync(oldPrivatePath).mtimeMs, envMtime: statSync(oldEnvPath).mtimeMs };
      assert.throws(() => restoreVerifiedPrivateStateMigration({
        extractRoot: fixture.extractRoot,
        targetRepoRoot: fixture.targetRoot,
        manifest: fixture.manifest,
        force: true,
        faultAt,
      }), /rolled_back/u);
      assert.equal(readFileSync(oldPrivatePath).equals(oldPrivate), true);
      assert.equal(readFileSync(oldEnvPath).equals(oldEnv), true);
      assert.equal(statSync(oldPrivatePath).mtimeMs, oldMetadata.privateMtime);
      assert.equal(statSync(oldEnvPath).mtimeMs, oldMetadata.envMtime);
      assert.equal(existsSync(join(fixture.targetRoot, "data", "private-output", "m2-v2-evidence-pilot", "state.json")), false);
      const receipt = JSON.parse(readFileSync(join(fixture.targetRoot, "data", "private-output", "m2-v2-pr7-p1-remediation", "migration-restore-receipt-private-v0.1.json"), "utf8"));
      assert.equal(receipt.status, "rolled_back");
      assert.equal(receipt.rollbackSucceeded, true);
      assert.equal(JSON.stringify(receipt).includes("synthetic-openai"), false);
      assert.equal(JSON.stringify(receipt).includes("synthetic-tavily"), false);
      assert.equal(restoreVerifiedPrivateStateMigration({
        extractRoot: fixture.extractRoot,
        targetRepoRoot: fixture.targetRoot,
        manifest: fixture.manifest,
        force: true,
      }).status, "restored");
    } finally {
      fixture.cleanup();
    }
  });
}

test("migration rejects a reparse ancestor in the target and protects fault injection outside temp validation roots", () => {
  const fixture = makeMigrationFixture();
  try {
    const outside = join(fixture.base, "outside-private-output");
    mkdirSync(outside);
    mkdirSync(join(fixture.targetRoot, "data"), { recursive: true });
    symlinkSync(outside, join(fixture.targetRoot, "data", "private-output"), "junction");
    assert.throws(() => restoreVerifiedPrivateStateMigration({
      extractRoot: fixture.extractRoot,
      targetRepoRoot: fixture.targetRoot,
      manifest: fixture.manifest,
      force: true,
    }), /reparse/u);
  } finally {
    fixture.cleanup();
  }
  assert.equal(MIGRATION_ALLOWED_ENV_NAMES.includes("TAVILY_API_KEY"), true);
  assert.equal(MIGRATION_ALLOWED_ENV_NAMES.includes("M2_V2_TAVILY_BASE_URL"), true);
});

test("migration rejects reparse points at each final target", () => {
  const privateFixture = makeMigrationFixture();
  try {
    const outside = join(privateFixture.base, "outside-evidence-pilot");
    mkdirSync(outside);
    mkdirSync(join(privateFixture.targetRoot, "data", "private-output"), { recursive: true });
    symlinkSync(outside, join(privateFixture.targetRoot, "data", "private-output", "m2-v2-evidence-pilot"), "junction");
    assert.throws(() => restoreVerifiedPrivateStateMigration({
      extractRoot: privateFixture.extractRoot,
      targetRepoRoot: privateFixture.targetRoot,
      manifest: privateFixture.manifest,
      force: true,
    }), /reparse/u);
  } finally {
    privateFixture.cleanup();
  }

  const envFixture = makeMigrationFixture();
  try {
    const outside = join(envFixture.base, "outside.env");
    write(outside, "UNRELATED_SETTING=outside\n");
    symlinkSync(outside, join(envFixture.targetRoot, ".env.local"), "file");
    assert.throws(() => restoreVerifiedPrivateStateMigration({
      extractRoot: envFixture.extractRoot,
      targetRepoRoot: envFixture.targetRoot,
      manifest: envFixture.manifest,
      force: true,
    }), /reparse/u);
  } finally {
    envFixture.cleanup();
  }
});

test("migration keeps the git-ignore boundary fail closed after reparse validation", () => {
  const fixture = makeMigrationFixture();
  try {
    write(join(fixture.targetRoot, ".gitignore"), ".env.*\n");
    assert.throws(() => restoreVerifiedPrivateStateMigration({
      extractRoot: fixture.extractRoot,
      targetRepoRoot: fixture.targetRoot,
      manifest: fixture.manifest,
      force: true,
    }), /git_ignore_boundary/u);
    assert.equal(existsSync(join(fixture.targetRoot, "data", "private-output", "m2-v2-evidence-pilot", "state.json")), false);
  } finally {
    fixture.cleanup();
  }
});

test("migration rollback restores originally absent private and environment targets", () => {
  const fixture = makeMigrationFixture();
  try {
    assert.throws(() => restoreVerifiedPrivateStateMigration({
      extractRoot: fixture.extractRoot,
      targetRepoRoot: fixture.targetRoot,
      manifest: fixture.manifest,
      force: true,
      faultAt: "env_write_after",
    }), /rolled_back/u);
    assert.equal(existsSync(join(fixture.targetRoot, "data", "private-output", "m2-v2-evidence-pilot")), false);
    assert.equal(existsSync(join(fixture.targetRoot, ".env.local")), false);
  } finally {
    fixture.cleanup();
  }
});

test("PowerShell migration entrypoints delegate verified promotion and make key separation claims precise", () => {
  const build = readFileSync(new URL("../scripts/m2-v2-evidence-pilot/build_m2_v2_private_state_migration.ps1", import.meta.url), "utf8");
  const restore = readFileSync(new URL("../scripts/m2-v2-evidence-pilot/restore_m2_v2_private_state_migration.ps1", import.meta.url), "utf8");
  assert.match(build, /"TAVILY_API_KEY"/u);
  assert.match(build, /Assert-SeparateDirectories/u);
  assert.match(build, /recoveryKeyDirectorySeparationVerified = \$true/u);
  assert.match(build, /separateTransferVerified = \$false/u);
  assert.doesNotMatch(build, /recoveryKeyStoredSeparately = \$true/u);
  assert.match(restore, /apply_m2_v2_private_state_migration\.mjs/u);
  assert.doesNotMatch(restore, /Copy-Item\s+-Destination\s+\$restoreStage\s+-Recurse/gu);
});

function makeMigrationFixture(options = {}) {
  const base = mkdtempSync(join(tmpdir(), "m2-v2-migration-fixture-"));
  const targetRoot = mkdtempSync(join(tmpdir(), "m2-v2-migration-restore-validation-"));
  const extractRoot = join(base, "extract");
  const envPath = join(extractRoot, "payload", "env", "m2-v2-evidence.env.private");
  const privateFile = join(extractRoot, "payload", "data", "private-output", "m2-v2-evidence-pilot", "state.json");
  write(envPath, "OPENAI_API_KEY=synthetic-openai\nTAVILY_API_KEY=synthetic-tavily\n");
  write(privateFile, "{\"state\":1}\n");
  const entries = [entryFor(extractRoot, envPath, "filtered_m2_v2_environment"), entryFor(extractRoot, privateFile, "m2_v2_evidence_pilot_private_state")];
  const manifest = {
    schema: "m2.v2.private-state-migration-manifest.v0.2",
    privateOnly: true,
    sourceGit: { branch: "synthetic", commit: "a".repeat(40) },
    scope: { environmentVariableNames: ["OPENAI_API_KEY", "TAVILY_API_KEY"] },
    entries,
    payloadFileCount: entries.length,
    payloadBytes: entries.reduce((sum, entry) => sum + entry.sizeBytes, 0),
  };
  write(join(extractRoot, "metadata", "migration-manifest.private.json"), `${JSON.stringify(manifest)}\n`);
  write(join(targetRoot, "package.json"), "{\"private\":true}\n");
  write(join(targetRoot, ".gitignore"), ".env.*\n**/data/\n");
  const init = spawnSync("git", ["init", "-q", targetRoot], { encoding: "utf8" });
  assert.equal(init.status, 0, init.stderr);
  if (options.withTargetState) {
    write(join(targetRoot, "data", "private-output", "m2-v2-evidence-pilot", "old.json"), "{\"old\":true}\n");
    write(join(targetRoot, ".env.local"), "UNRELATED_SETTING=preserved\nOPENAI_API_KEY=old-openai\nTAVILY_API_KEY=old-tavily\n");
  }
  return {
    base,
    targetRoot,
    extractRoot,
    privateFile,
    manifest,
    cleanup() {
      rmSync(base, { recursive: true, force: true });
      rmSync(targetRoot, { recursive: true, force: true });
    },
  };
}

function withEntry(manifest, entry) {
  const result = structuredClone(manifest);
  result.entries.push(entry);
  result.payloadFileCount = result.entries.length;
  result.payloadBytes = result.entries.reduce((sum, item) => sum + item.sizeBytes, 0);
  return result;
}

function entryFor(root, path, role = "m2_v2_evidence_pilot_private_state") {
  const bytes = readFileSync(path);
  return {
    relativePath: path.slice(root.length + 1).replace(/\\/gu, "/"),
    role,
    sensitive: true,
    sizeBytes: bytes.byteLength,
    sha256: sha256(bytes),
  };
}

function write(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
