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

test(
  process.platform === "win32"
    ? "S0-05 exercises native Windows junction identity through Windows PowerShell 5.1"
    : "S0-05 records PENDING_CI_WINDOWS without simulating a junction",
  () => {
  if (process.platform !== "win32") {
    assert.equal("PENDING_CI_WINDOWS", "PENDING_CI_WINDOWS");
    return;
  }

  const root = mkdtempSync(join(tmpdir(), "m2-v2-s0-fs-win-"));
  assertSystemTempFixture(root);
  try {
    const normal = join(root, "normal");
    const junctionTarget = join(root, "junction-target");
    const junction = join(root, "junction");
    const ancestorTarget = join(root, "ancestor-target");
    const ancestorJunction = join(root, "ancestor-junction");
    const finalTarget = join(root, "final-target");
    const finalJunction = join(root, "final-junction");
    const sharedTarget = join(root, "shared-target");
    const aliasA = join(root, "alias-a");
    const aliasB = join(root, "alias-b");
    const replacementTarget = join(root, "replacement-target");
    const replaceable = join(root, "replaceable");

    for (const path of [
      normal,
      junctionTarget,
      ancestorTarget,
      finalTarget,
      sharedTarget,
      replacementTarget,
      replaceable,
    ]) {
      mkdirSync(path);
    }
    mkdirSync(join(ancestorTarget, "nested"));
    writeFileSync(join(ancestorTarget, "nested", "sentinel.txt"), "synthetic\n", "utf8");

    symlinkSync(junctionTarget, junction, "junction");
    symlinkSync(ancestorTarget, ancestorJunction, "junction");
    symlinkSync(finalTarget, finalJunction, "junction");
    symlinkSync(sharedTarget, aliasA, "junction");
    symlinkSync(sharedTarget, aliasB, "junction");

    const normalResult = inspectWindows(normal, root);
    assertWindowsPowerShell51(normalResult);
    assert.equal(normalResult.finalObject.isReparsePoint, false);

    const junctionResult = inspectWindows(junction, root);
    assert.equal(junctionResult.finalObject.isReparsePoint, true);
    assert.equal(junctionResult.finalObject.nativeReparseTagHex, "0xA0000003");
    assert.equal(junctionResult.finalObject.nativeReparseType, "MOUNT_POINT_OR_JUNCTION");

    const ancestorResult = inspectWindows(join(ancestorJunction, "nested"), root);
    assert.equal(
      ancestorResult.ancestorChain.some(
        (entry) => entry.path === ancestorJunction && entry.nativeReparseTagHex === "0xA0000003",
      ),
      true,
    );
    assert.equal(ancestorResult.finalObject.isReparsePoint, false);

    const finalResult = inspectWindows(finalJunction, root);
    assert.equal(finalResult.finalObject.isReparsePoint, true);
    assert.equal(finalResult.finalObject.nativeReparseTagHex, "0xA0000003");

    const aliasAResult = inspectWindows(aliasA, root);
    const aliasBResult = inspectWindows(aliasB, root);
    assert.deepEqual(physicalIdentity(aliasAResult), physicalIdentity(aliasBResult));
    assert.match(aliasAResult.finalObject.resolvedIdentity.resolvedPath, /shared-target$/iu);

    const beforeReplacement = inspectWindows(replaceable, root);
    rmSync(replaceable, { recursive: true });
    symlinkSync(replacementTarget, replaceable, "junction");
    const afterReplacement = inspectWindows(replaceable, root);
    assert.notDeepEqual(physicalIdentity(beforeReplacement), physicalIdentity(afterReplacement));
    assert.equal(afterReplacement.finalObject.isReparsePoint, true);

    const enumeration = inspectWindows(root, root, "enumerate");
    const enumeratedNames = enumeration.noTraverseEnumeration.map((entry) => basename(entry.path));
    assert.equal(enumeratedNames.includes("ancestor-junction"), true);
    assert.equal(enumeratedNames.includes("nested"), false);
    assert.equal(
      enumeration.noTraverseEnumeration.find((entry) => basename(entry.path) === "ancestor-junction")
        .isReparsePoint,
      true,
    );
    assert.equal(enumeration.localizedTextUsedForDecision, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
    assert.equal(existsSync(root), false, "Windows filesystem fixture left residue in system temp");
  }
  },
);

test(
  process.platform === "linux"
    ? "S0-05 exercises native Linux symlink identity without following enumeration"
    : "S0-05 records PENDING_CI_LINUX without simulating a symlink",
  () => {
  if (process.platform !== "linux") {
    assert.equal("PENDING_CI_LINUX", "PENDING_CI_LINUX");
    return;
  }

  const root = mkdtempSync(join(tmpdir(), "m2-v2-s0-fs-linux-"));
  const outside = mkdtempSync(join(tmpdir(), "m2-v2-s0-fs-linux-outside-"));
  assertSystemTempFixture(root);
  assertSystemTempFixture(outside);
  try {
    const insideTarget = join(root, "inside-target");
    const insideAlias = join(root, "inside-alias");
    const outsideTarget = join(outside, "outside-target");
    const outsideLink = join(root, "outside-link");
    const ancestorTarget = join(root, "ancestor-target");
    const ancestorLink = join(root, "ancestor-link");
    const finalTarget = join(root, "final-target");
    const finalLink = join(root, "final-link");
    const replacementTarget = join(root, "replacement-target");
    const replaceable = join(root, "replaceable");

    for (const path of [
      insideTarget,
      outsideTarget,
      ancestorTarget,
      finalTarget,
      replacementTarget,
      replaceable,
    ]) {
      mkdirSync(path, { recursive: true });
    }
    mkdirSync(join(ancestorTarget, "nested"));
    writeFileSync(join(ancestorTarget, "nested", "sentinel.txt"), "synthetic\n", "utf8");

    symlinkSync("inside-target", insideAlias, "dir");
    symlinkSync(outsideTarget, outsideLink, "dir");
    symlinkSync("ancestor-target", ancestorLink, "dir");
    symlinkSync("final-target", finalLink, "dir");

    assert.equal(lstatSync(outsideLink).isSymbolicLink(), true);
    assert.equal(realpathSync(outsideLink), realpathSync(outsideTarget));
    assert.equal(lstatSync(insideAlias).isSymbolicLink(), true);
    assert.deepEqual(posixIdentity(insideAlias), posixIdentity(insideTarget));
    assert.equal(lstatSync(ancestorLink).isSymbolicLink(), true);
    assert.equal(realpathSync(join(ancestorLink, "nested")), realpathSync(join(ancestorTarget, "nested")));
    assert.equal(lstatSync(finalLink).isSymbolicLink(), true);
    assert.deepEqual(posixIdentity(finalLink), posixIdentity(finalTarget));

    const beforeReplacement = posixIdentity(replaceable);
    rmSync(replaceable, { recursive: true });
    symlinkSync("replacement-target", replaceable, "dir");
    assert.equal(lstatSync(replaceable).isSymbolicLink(), true);
    assert.notDeepEqual(beforeReplacement, posixIdentity(replaceable));

    const entries = readdirSync(root, { withFileTypes: true });
    const ancestorEntry = entries.find((entry) => entry.name === "ancestor-link");
    assert.equal(ancestorEntry.isSymbolicLink(), true);
    assert.equal(entries.some((entry) => entry.name === "nested"), false);
    assert.equal(entries.every((entry) => !entry.name.includes("/")), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
    assert.equal(existsSync(root), false, "Linux filesystem fixture left root residue in system temp");
    assert.equal(existsSync(outside), false, "Linux filesystem fixture left target residue in system temp");
  }
  },
);

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

function sanitizePowerShellFailure(result) {
  return [result.error?.message, result.stderr, result.stdout]
    .filter(Boolean)
    .join("\n")
    .replaceAll(REPO_ROOT, "<repo>")
    .replaceAll(tmpdir(), "<system-temp>");
}

function physicalIdentity(result) {
  return {
    volumeSerialHex: result.finalObject.resolvedIdentity.volumeSerialHex,
    fileIndexHex: result.finalObject.resolvedIdentity.fileIndexHex,
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
