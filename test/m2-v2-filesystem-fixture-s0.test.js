import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const INSPECTOR = join(
  REPO_ROOT,
  "scripts",
  "m2-v2-evidence-pilot",
  "inspect_m2_v2_reparse_point.ps1",
);

if (process.platform === "win32") {
  test("S0-05 Windows normal directory inspection uses native resolved identity", () => {
    withWindowsFixture("normal", (root) => {
      const normal = join(root, "normal");
      mkdirSync(normal);
      const result = inspectWindows(normal, root);
      assertWindowsPowerShell51(result);
      assert.equal(result.finalObject.isReparsePoint, false);
      assertResolvedIdentity(result.finalObject);
    });
  });

  test("S0-05 Windows junction inspection reports the native tag and type", () => {
    withWindowsFixture("junction", (root) => {
      const target = join(root, "junction-target");
      const junction = join(root, "junction");
      mkdirSync(target);
      symlinkSync(target, junction, "junction");
      const result = inspectWindows(junction, root);
      assert.equal(result.finalObject.isReparsePoint, true);
      assert.equal(result.finalObject.nativeReparseTagHex, "0xA0000003");
      assert.equal(result.finalObject.nativeReparseType, "MOUNT_POINT_OR_JUNCTION");
      assertResolvedIdentity(result.finalObject);
    });
  });

  test("S0-05 Windows ancestor junction inspection uses chain position and native tag", () => {
    withWindowsFixture("ancestor", (root) => {
      const target = join(root, "ancestor-target");
      const junction = join(root, "ancestor-junction");
      mkdirSync(join(target, "nested"), { recursive: true });
      writeFileSync(join(target, "nested", "sentinel.txt"), "synthetic\n", "utf8");
      symlinkSync(target, junction, "junction");
      const result = inspectWindows(join(junction, "nested"), root);
      const nativeJunctionIndexes = result.ancestorChain
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => entry.nativeReparseTagHex === "0xA0000003");
      assert.equal(nativeJunctionIndexes.length, 1);
      assert.equal(nativeJunctionIndexes[0].index, result.ancestorChain.length - 2);
      assert.equal(nativeJunctionIndexes[0].entry.isReparsePoint, true);
      assert.equal(result.finalObject.isReparsePoint, false);
      assertResolvedIdentity(result.finalObject);
    });
  });

  test("S0-05 Windows final-path junction inspection preserves final-object identity", () => {
    withWindowsFixture("final", (root) => {
      const target = join(root, "final-target");
      const junction = join(root, "final-junction");
      mkdirSync(target);
      symlinkSync(target, junction, "junction");
      const result = inspectWindows(junction, root);
      assert.equal(result.finalObject.isReparsePoint, true);
      assert.equal(result.finalObject.nativeReparseTagHex, "0xA0000003");
      assertResolvedIdentity(result.finalObject);
    });
  });

  test("S0-05 Windows aliases resolve to one native physical identity", () => {
    withWindowsFixture("aliases", (root) => {
      const target = join(root, "shared-target");
      const aliasA = join(root, "alias-a");
      const aliasB = join(root, "alias-b");
      mkdirSync(target);
      symlinkSync(target, aliasA, "junction");
      symlinkSync(target, aliasB, "junction");
      const targetResult = inspectWindows(target, root);
      const aliasAResult = inspectWindows(aliasA, root);
      const aliasBResult = inspectWindows(aliasB, root);
      assertResolvedIdentity(targetResult.finalObject);
      assert.equal(aliasAResult.finalObject.isReparsePoint, true);
      assert.equal(aliasAResult.finalObject.nativeReparseTagHex, "0xA0000003");
      assert.equal(aliasBResult.finalObject.isReparsePoint, true);
      assert.equal(aliasBResult.finalObject.nativeReparseTagHex, "0xA0000003");
      assert.deepEqual(physicalIdentity(aliasAResult), physicalIdentity(targetResult));
      assert.deepEqual(physicalIdentity(aliasBResult), physicalIdentity(targetResult));
      assert.equal(
        normalizeWindowsResolvedPath(aliasAResult.finalObject.resolvedIdentity.resolvedPath),
        normalizeWindowsResolvedPath(targetResult.finalObject.resolvedIdentity.resolvedPath),
      );
      assert.equal(
        normalizeWindowsResolvedPath(aliasBResult.finalObject.resolvedIdentity.resolvedPath),
        normalizeWindowsResolvedPath(targetResult.finalObject.resolvedIdentity.resolvedPath),
      );
      assertResolvedIdentity(aliasAResult.finalObject);
      assertResolvedIdentity(aliasBResult.finalObject);
    });
  });

  test("S0-05 Windows replace-after-enumeration changes native physical identity", () => {
    withWindowsFixture("replacement", (root) => {
      const replacementTarget = join(root, "replacement-target");
      const replaceable = join(root, "replaceable");
      mkdirSync(replacementTarget);
      mkdirSync(replaceable);
      const beforeEnumeration = inspectWindows(root, root, "enumerate");
      const beforeRecord = findEnumerationRecord(beforeEnumeration, "replaceable");
      assert.equal(beforeRecord.isReparsePoint, false);
      assertResolvedIdentity(beforeRecord);
      const beforeIdentity = recordPhysicalIdentity(beforeRecord);
      rmSync(replaceable, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      });
      symlinkSync(replacementTarget, replaceable, "junction");
      const afterResult = inspectWindows(replaceable, root);
      assert.notDeepEqual(beforeIdentity, physicalIdentity(afterResult));
      assert.equal(afterResult.finalObject.isReparsePoint, true);
      assert.equal(afterResult.finalObject.nativeReparseTagHex, "0xA0000003");
      assertResolvedIdentity(afterResult.finalObject);
    });
  });

  test("S0-05 Windows enumeration is no-traverse and retains reparse identity", () => {
    withWindowsFixture("enumeration", (root) => {
      const target = join(root, "ancestor-target");
      const junction = join(root, "ancestor-junction");
      mkdirSync(join(target, "nested"), { recursive: true });
      writeFileSync(join(target, "nested", "sentinel.txt"), "synthetic\n", "utf8");
      symlinkSync(target, junction, "junction");
      const result = inspectWindows(root, root, "enumerate");
      const names = result.noTraverseEnumeration.map((entry) => normalizedBasename(entry.path));
      assert.equal(names.includes("ancestor-junction"), true);
      assert.equal(names.includes("nested"), false);
      const junctionRecord = findEnumerationRecord(result, "ancestor-junction");
      assert.equal(junctionRecord.isReparsePoint, true);
      assert.equal(junctionRecord.nativeReparseTagHex, "0xA0000003");
      assert.equal(result.localizedTextUsedForDecision, false);
    });
  });
} else {
  test("S0-05 records PENDING_CI_WINDOWS without simulating a junction", () => {
    assert.equal("PENDING_CI_WINDOWS", "PENDING_CI_WINDOWS");
  });
}

if (process.platform === "linux") {
  test("S0-05 Linux outside symlink retains target identity", () => {
    withLinuxOutsideFixture("outside", (root, outside) => {
      const target = join(outside, "outside-target");
      const link = join(root, "outside-link");
      mkdirSync(target);
      symlinkSync(target, link, "dir");
      assert.equal(lstatSync(link).isSymbolicLink(), true);
      assert.equal(realpathSync(link), realpathSync(target));
      assert.deepEqual(posixIdentity(link), posixIdentity(target));
    });
  });

  test("S0-05 Linux inside alias retains device and inode identity", () => {
    withLinuxFixture("inside", (root) => {
      const target = join(root, "inside-target");
      const alias = join(root, "inside-alias");
      mkdirSync(target);
      symlinkSync("inside-target", alias, "dir");
      assert.equal(lstatSync(alias).isSymbolicLink(), true);
      assert.deepEqual(posixIdentity(alias), posixIdentity(target));
    });
  });

  test("S0-05 Linux ancestor symlink resolves a nested target", () => {
    withLinuxFixture("ancestor", (root) => {
      const target = join(root, "ancestor-target");
      const link = join(root, "ancestor-link");
      mkdirSync(join(target, "nested"), { recursive: true });
      writeFileSync(join(target, "nested", "sentinel.txt"), "synthetic\n", "utf8");
      symlinkSync("ancestor-target", link, "dir");
      assert.equal(lstatSync(link).isSymbolicLink(), true);
      assert.equal(realpathSync(join(link, "nested")), realpathSync(join(target, "nested")));
    });
  });

  test("S0-05 Linux final symlink retains target physical identity", () => {
    withLinuxFixture("final", (root) => {
      const target = join(root, "final-target");
      const link = join(root, "final-link");
      mkdirSync(target);
      symlinkSync("final-target", link, "dir");
      assert.equal(lstatSync(link).isSymbolicLink(), true);
      assert.deepEqual(posixIdentity(link), posixIdentity(target));
    });
  });

  test("S0-05 Linux replacement changes the enumerated physical identity", () => {
    withLinuxFixture("replacement", (root) => {
      const target = join(root, "replacement-target");
      const replaceable = join(root, "replaceable");
      mkdirSync(target);
      mkdirSync(replaceable);
      const beforeEntries = readdirSync(root, { withFileTypes: true });
      const beforeEntry = findPosixDirectoryEntry(beforeEntries, "replaceable");
      assert.equal(beforeEntry.isDirectory(), true);
      assert.equal(beforeEntry.isSymbolicLink(), false);
      const beforeIdentity = posixIdentity(replaceable);
      rmSync(replaceable, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      });
      symlinkSync("replacement-target", replaceable, "dir");
      assert.equal(lstatSync(replaceable).isSymbolicLink(), true);
      assert.notDeepEqual(beforeIdentity, posixIdentity(replaceable));
    });
  });

  test("S0-05 Linux directory enumeration is no-follow", () => {
    withLinuxFixture("enumeration", (root) => {
      const target = join(root, "ancestor-target");
      const link = join(root, "ancestor-link");
      mkdirSync(join(target, "nested"), { recursive: true });
      writeFileSync(join(target, "nested", "sentinel.txt"), "synthetic\n", "utf8");
      symlinkSync("ancestor-target", link, "dir");
      const entries = readdirSync(root, { withFileTypes: true });
      const ancestorEntry = findPosixDirectoryEntry(entries, "ancestor-link");
      assert.equal(ancestorEntry.isSymbolicLink(), true);
      assert.equal(entries.some((entry) => entry.name === "nested"), false);
      assert.equal(entries.every((entry) => !entry.name.includes("/")), true);
    });
  });
} else {
  test("S0-05 records PENDING_CI_LINUX without simulating a symlink", () => {
    assert.equal("PENDING_CI_LINUX", "PENDING_CI_LINUX");
  });
}

function withWindowsFixture(caseId, run) {
  const root = mkdtempSync(join(tmpdir(), `m2-v2-s0-fs-win-${caseId}-`));
  try {
    assertSystemTempFixture(root);
    return run(root);
  } finally {
    cleanupSystemTempFixture(root, "Windows filesystem fixture left residue in system temp");
  }
}

function withLinuxFixture(caseId, run) {
  const root = mkdtempSync(join(tmpdir(), `m2-v2-s0-fs-linux-${caseId}-`));
  try {
    assertSystemTempFixture(root);
    return run(root);
  } finally {
    cleanupSystemTempFixture(root, "Linux filesystem fixture left residue in system temp");
  }
}

function withLinuxOutsideFixture(caseId, run) {
  const root = mkdtempSync(join(tmpdir(), `m2-v2-s0-fs-linux-${caseId}-`));
  let outside = null;
  try {
    assertSystemTempFixture(root);
    outside = mkdtempSync(join(tmpdir(), `m2-v2-s0-fs-linux-${caseId}-target-`));
    assertSystemTempFixture(outside);
    return run(root, outside);
  } finally {
    cleanupAllSystemTempFixtures([
      [root, "Linux filesystem fixture left root residue in system temp"],
      [outside, "Linux filesystem fixture left target residue in system temp"],
    ]);
  }
}

function cleanupAllSystemTempFixtures(fixtures) {
  const errors = [];
  for (const [root, failureMessage] of fixtures) {
    if (root === null) continue;
    try {
      cleanupSystemTempFixture(root, failureMessage);
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, "Multiple system-temp fixtures left residue");
}

function cleanupSystemTempFixture(root, failureMessage) {
  rmSync(root, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
  assert.equal(existsSync(root), false, failureMessage);
}

function inspectWindows(path, root, mode = "inspect") {
  const systemRoot = process.env.SystemRoot;
  assert.equal(typeof systemRoot, "string", "SystemRoot is required to locate Windows PowerShell 5.1");
  const executable = join(
    systemRoot,
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  assert.equal(existsSync(executable), true, "Windows PowerShell 5.1 executable is unavailable");
  const argv = [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-File",
    INSPECTOR,
    "-Path",
    path,
    "-Root",
    root,
    "-Mode",
    mode,
  ];
  const result = spawnSync(executable, argv, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, sanitizePowerShellFailure(result));
  assert.equal(result.stderr.trim(), "", sanitizePowerShellFailure(result));
  return JSON.parse(result.stdout);
}

function assertWindowsPowerShell51(result) {
  assert.equal(result.platform, "windows");
  assert.equal(result.powershell.edition, "Desktop");
  assert.match(result.powershell.version, /^5\.1\./u);
  assert.equal(result.powershell.compatibleWithWindowsPowerShell51, true);
}

function assertResolvedIdentity(record) {
  assert.equal(typeof record.resolvedIdentity.resolvedPath, "string");
  assert.notEqual(record.resolvedIdentity.resolvedPath, "");
  assert.match(record.resolvedIdentity.volumeSerialHex, /^0x[0-9A-F]{8}$/u);
  assert.match(record.resolvedIdentity.fileIndexHex, /^0x[0-9A-F]{16}$/u);
}

function findEnumerationRecord(result, expectedBasename) {
  const matches = result.noTraverseEnumeration.filter(
    (entry) => normalizedBasename(entry.path) === expectedBasename.toLowerCase(),
  );
  assert.equal(matches.length, 1);
  return matches[0];
}

function normalizedBasename(path) {
  return basename(path).toLowerCase();
}

function findPosixDirectoryEntry(entries, expectedName) {
  const matches = entries.filter((entry) => entry.name === expectedName);
  assert.equal(matches.length, 1);
  return matches[0];
}

function normalizeWindowsResolvedPath(value) {
  return value
    .replace(/^\\\\\?\\UNC\\/iu, "\\\\")
    .replace(/^\\\\\?\\/u, "")
    .replace(/[\\/]+$/u, "")
    .toLowerCase();
}

function sanitizePowerShellFailure(result) {
  return [result.error?.message, result.stderr, result.stdout]
    .filter(Boolean)
    .join("\n")
    .replaceAll(REPO_ROOT, "<repo>")
    .replaceAll(tmpdir(), "<system-temp>");
}

function physicalIdentity(result) {
  return recordPhysicalIdentity(result.finalObject);
}

function recordPhysicalIdentity(record) {
  return {
    volumeSerialHex: record.resolvedIdentity.volumeSerialHex,
    fileIndexHex: record.resolvedIdentity.fileIndexHex,
  };
}

function posixIdentity(path) {
  const stat = statSync(path);
  return { device: stat.dev, inode: stat.ino, resolvedPath: realpathSync(path) };
}

function assertSystemTempFixture(path) {
  const rel = relative(tmpdir(), path);
  assert.equal(rel.startsWith(".."), false);
  assert.equal(rel.includes(":"), false);
  assert.notEqual(rel, "");
}
