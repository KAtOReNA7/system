import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const M2_V2_ARTIFACT_REGISTRY_RELATIVE =
  "config/m2-v2-test-artifact-registry.v0.1.json";

const CLASSIFICATIONS = new Set([
  "TRACKED_REQUIRED",
  "TRACKED_REQUIRED_JSON_POINTER",
  "SYNTHETIC_STATE_FIXTURE",
  "OPTIONAL_PRIVATE_PROFILE",
]);
const GIT_ROLES = new Set(["TRACKED", "IGNORED_UNTRACKED", "SYNTHETIC"]);
const ABSENCE_BEHAVIORS = new Set([
  "FAIL",
  "BUILD_SYNTHETIC",
  "OPTIONAL_PRIVATE_ABSENT",
]);
const PROFILE_IDS = new Set(["default", "optional-private"]);
const REGISTRY_KEYS = [
  "schema",
  "version",
  "profiles",
  "artifacts",
  "failOpenSites",
  "optionalPrivateIdentities",
];
const PROFILE_KEYS = [
  "profileId",
  "description",
  "totalTestSkips",
  "unknownSkipIds",
  "requiredArtifactSkips",
];
const ARTIFACT_KEYS = [
  "artifactId",
  "classification",
  "path",
  "gitRole",
  "requiredJsonPointers",
  "profiles",
  "absenceBehavior",
  "skipAllowed",
  "reason",
  "ownerTestIds",
];
const SITE_KEYS = [
  "siteId",
  "testFile",
  "testName",
  "lineAtStartingHead",
  "classification",
  "artifactIds",
  "replacement",
];
const OPTIONAL_KEYS = [
  "optionalId",
  "testFile",
  "testName",
  "privateRole",
  "whyOptional",
  "defaultProfileScheduled",
  "optionalProfileBehavior",
  "absenceResult",
  "artifactIds",
];

const registryCache = new Map();
const gitRoleCache = new Map();

function exactKeys(value, expected, label) {
  assert.equal(value !== null && typeof value === "object" && !Array.isArray(value), true, `${label}:object_required`);
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${label}:keys`);
}

function nonEmptyString(value, label) {
  assert.equal(typeof value, "string", `${label}:string_required`);
  assert.equal(value.trim().length > 0, true, `${label}:nonempty_required`);
}

function nonEmptyStringArray(value, label) {
  assert.equal(Array.isArray(value), true, `${label}:array_required`);
  assert.equal(value.length > 0, true, `${label}:nonempty_required`);
  for (const [index, item] of value.entries()) nonEmptyString(item, `${label}[${index}]`);
}

export function normalizeRegistryPath(value) {
  nonEmptyString(value, "artifact.path");
  const normalized = value.replaceAll("\\", "/").normalize("NFC");
  assert.equal(path.posix.isAbsolute(normalized), false, `artifact.path:absolute:${value}`);
  assert.equal(/^[A-Za-z]:/u.test(normalized), false, `artifact.path:drive:${value}`);
  assert.equal(normalized.split("/").includes(".."), false, `artifact.path:traversal:${value}`);
  assert.equal(normalized, path.posix.normalize(normalized), `artifact.path:not_canonical:${value}`);
  assert.equal(normalized.startsWith("./"), false, `artifact.path:dot_prefix:${value}`);
  return normalized;
}

export function resolveJsonPointer(value, pointer) {
  assert.equal(typeof pointer, "string", "json_pointer:string_required");
  if (pointer === "") return value;
  assert.equal(pointer.startsWith("/"), true, `json_pointer:invalid:${pointer}`);
  let current = value;
  for (const token of pointer.slice(1).split("/")) {
    const key = token.replaceAll("~1", "/").replaceAll("~0", "~");
    assert.equal(current !== null && typeof current === "object", true, `json_pointer:missing:${pointer}`);
    assert.equal(Object.hasOwn(current, key), true, `json_pointer:missing:${pointer}`);
    current = current[key];
  }
  return current;
}

export function validateArtifactRegistry(registry) {
  exactKeys(registry, REGISTRY_KEYS, "registry");
  assert.equal(registry.schema, "m2.v2.test-artifact-registry.v0.1", "registry:schema");
  assert.equal(registry.version, "0.1", "registry:version");

  assert.equal(Array.isArray(registry.profiles), true, "registry.profiles:array_required");
  assert.deepEqual(
    registry.profiles.map((item) => item.profileId).sort(),
    ["default", "optional-private"],
    "registry.profiles:exact_ids",
  );
  for (const profile of registry.profiles) {
    exactKeys(profile, PROFILE_KEYS, `profile:${profile.profileId}`);
    assert.equal(PROFILE_IDS.has(profile.profileId), true, `profile:unknown:${profile.profileId}`);
    nonEmptyString(profile.description, `profile:${profile.profileId}.description`);
    for (const key of ["totalTestSkips", "unknownSkipIds", "requiredArtifactSkips"]) {
      assert.equal(profile[key], 0, `profile:${profile.profileId}.${key}:must_be_zero`);
    }
  }

  assert.equal(Array.isArray(registry.artifacts), true, "registry.artifacts:array_required");
  const artifactIds = new Set();
  const canonicalPaths = new Map();
  for (const artifact of registry.artifacts) {
    exactKeys(artifact, ARTIFACT_KEYS, `artifact:${artifact.artifactId}`);
    nonEmptyString(artifact.artifactId, "artifact.artifactId");
    assert.equal(artifactIds.has(artifact.artifactId), false, `artifact:duplicate_id:${artifact.artifactId}`);
    artifactIds.add(artifact.artifactId);
    assert.equal(CLASSIFICATIONS.has(artifact.classification), true, `artifact:classification:${artifact.artifactId}`);
    assert.equal(GIT_ROLES.has(artifact.gitRole), true, `artifact:git_role:${artifact.artifactId}`);
    assert.equal(ABSENCE_BEHAVIORS.has(artifact.absenceBehavior), true, `artifact:absence:${artifact.artifactId}`);
    assert.equal(artifact.skipAllowed, false, `artifact:skip_forbidden:${artifact.artifactId}`);
    nonEmptyString(artifact.reason, `artifact:${artifact.artifactId}.reason`);
    nonEmptyStringArray(artifact.ownerTestIds, `artifact:${artifact.artifactId}.ownerTestIds`);
    assert.equal(Array.isArray(artifact.requiredJsonPointers), true, `artifact:${artifact.artifactId}.requiredJsonPointers`);
    for (const pointer of artifact.requiredJsonPointers) {
      assert.equal(typeof pointer === "string" && (pointer === "" || pointer.startsWith("/")), true, `artifact:pointer:${artifact.artifactId}`);
    }
    if (artifact.classification === "TRACKED_REQUIRED_JSON_POINTER") {
      assert.equal(artifact.requiredJsonPointers.length > 0, true, `artifact:pointer_profile_empty:${artifact.artifactId}`);
    }
    nonEmptyStringArray(artifact.profiles, `artifact:${artifact.artifactId}.profiles`);
    for (const profile of artifact.profiles) assert.equal(PROFILE_IDS.has(profile), true, `artifact:profile:${artifact.artifactId}:${profile}`);

    const canonicalPath = normalizeRegistryPath(artifact.path);
    const aliasKey = canonicalPath.toLocaleLowerCase("en-US").normalize("NFC");
    const prior = canonicalPaths.get(aliasKey);
    if (prior) {
      assert.equal(
        prior.classification === artifact.classification && prior.path === canonicalPath,
        true,
        `artifact:path_alias_or_conflict:${prior.artifactId}:${artifact.artifactId}`,
      );
      assert.fail(`artifact:duplicate_path:${prior.artifactId}:${artifact.artifactId}`);
    }
    canonicalPaths.set(aliasKey, { artifactId: artifact.artifactId, classification: artifact.classification, path: canonicalPath });

    if (artifact.classification === "OPTIONAL_PRIVATE_PROFILE") {
      assert.equal(artifact.gitRole, "IGNORED_UNTRACKED", `artifact:optional_git_role:${artifact.artifactId}`);
      assert.equal(artifact.absenceBehavior, "OPTIONAL_PRIVATE_ABSENT", `artifact:optional_absence:${artifact.artifactId}`);
      assert.deepEqual(artifact.profiles, ["optional-private"], `artifact:optional_profile:${artifact.artifactId}`);
    } else if (artifact.classification.startsWith("TRACKED_REQUIRED")) {
      assert.equal(artifact.gitRole, "TRACKED", `artifact:required_git_role:${artifact.artifactId}`);
      assert.equal(artifact.absenceBehavior, "FAIL", `artifact:required_absence:${artifact.artifactId}`);
      assert.equal(artifact.profiles.includes("default"), true, `artifact:required_default_profile:${artifact.artifactId}`);
    }
  }

  assert.equal(Array.isArray(registry.failOpenSites), true, "registry.failOpenSites:array_required");
  const siteIds = new Set();
  const requiredSites = [];
  const optionalSites = [];
  for (const site of registry.failOpenSites) {
    exactKeys(site, SITE_KEYS, `site:${site.siteId}`);
    nonEmptyString(site.siteId, "site.siteId");
    assert.equal(siteIds.has(site.siteId), false, `site:duplicate_id:${site.siteId}`);
    siteIds.add(site.siteId);
    nonEmptyString(site.testFile, `site:${site.siteId}.testFile`);
    nonEmptyString(site.testName, `site:${site.siteId}.testName`);
    assert.equal(Number.isInteger(site.lineAtStartingHead) && site.lineAtStartingHead > 0, true, `site:line:${site.siteId}`);
    assert.equal(["REQUIRED", "OPTIONAL_PRIVATE"].includes(site.classification), true, `site:classification:${site.siteId}`);
    nonEmptyStringArray(site.artifactIds, `site:${site.siteId}.artifactIds`);
    for (const artifactId of site.artifactIds) {
      assert.equal(artifactIds.has(artifactId), true, `site:unknown_artifact:${site.siteId}:${artifactId}`);
      const artifact = registry.artifacts.find((item) => item.artifactId === artifactId);
      assert.equal(
        site.classification === "OPTIONAL_PRIVATE"
          ? artifact.classification === "OPTIONAL_PRIVATE_PROFILE"
          : artifact.classification !== "OPTIONAL_PRIVATE_PROFILE",
        true,
        `site:classification_mismatch:${site.siteId}:${artifactId}`,
      );
    }
    assert.equal(
      ["REGISTRY_HARD_ASSERTION", "OPTIONAL_PROFILE_DECLARATION"].includes(site.replacement),
      true,
      `site:replacement:${site.siteId}`,
    );
    (site.classification === "REQUIRED" ? requiredSites : optionalSites).push(site);
  }
  assert.equal(requiredSites.length, 34, "registry:required_site_count");
  assert.equal(optionalSites.length, 4, "registry:optional_site_count");

  assert.equal(Array.isArray(registry.optionalPrivateIdentities), true, "registry.optionalPrivateIdentities:array_required");
  assert.equal(registry.optionalPrivateIdentities.length, 4, "registry:optional_identity_count");
  const optionalIds = new Set();
  for (const optional of registry.optionalPrivateIdentities) {
    exactKeys(optional, OPTIONAL_KEYS, `optional:${optional.optionalId}`);
    nonEmptyString(optional.optionalId, "optional.optionalId");
    assert.equal(optionalIds.has(optional.optionalId), false, `optional:duplicate_id:${optional.optionalId}`);
    optionalIds.add(optional.optionalId);
    for (const key of ["testFile", "testName", "privateRole", "whyOptional", "optionalProfileBehavior"]) {
      nonEmptyString(optional[key], `optional:${optional.optionalId}.${key}`);
    }
    assert.equal(optional.defaultProfileScheduled, false, `optional:default_scheduled:${optional.optionalId}`);
    assert.equal(optional.absenceResult, "OPTIONAL_PRIVATE_ABSENT", `optional:absence_result:${optional.optionalId}`);
    nonEmptyStringArray(optional.artifactIds, `optional:${optional.optionalId}.artifactIds`);
    for (const artifactId of optional.artifactIds) {
      const artifact = registry.artifacts.find((item) => item.artifactId === artifactId);
      assert.equal(artifact?.classification, "OPTIONAL_PRIVATE_PROFILE", `optional:artifact_class:${optional.optionalId}:${artifactId}`);
    }
  }
  assert.deepEqual(
    optionalSites.map((site) => site.siteId.replace(/^S0-02-OPT-SITE-/u, "OPT-")).sort(),
    [...optionalIds].sort(),
    "registry:optional_site_identity_bijection",
  );

  return {
    artifactCount: registry.artifacts.length,
    requiredSiteCount: requiredSites.length,
    optionalSiteCount: optionalSites.length,
    optionalPrivateIdentities: [...optionalIds].sort(),
  };
}

export function loadArtifactRegistry(root = process.cwd(), registryPath = M2_V2_ARTIFACT_REGISTRY_RELATIVE) {
  const absolute = path.resolve(root, registryPath);
  const key = `${absolute}:${fs.statSync(absolute).mtimeMs}:${fs.statSync(absolute).size}`;
  if (registryCache.has(key)) return registryCache.get(key);
  const registry = JSON.parse(fs.readFileSync(absolute, "utf8"));
  validateArtifactRegistry(registry);
  registryCache.clear();
  registryCache.set(key, registry);
  return registry;
}

function gitRole(root, relativePath) {
  const key = `${path.resolve(root)}:${relativePath}`;
  if (gitRoleCache.has(key)) return gitRoleCache.get(key);
  const tracked = spawnSync("git", ["ls-files", "--error-unmatch", "--", relativePath], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
  const ignored = spawnSync("git", ["check-ignore", "--quiet", "--", relativePath], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
  const role = tracked.status === 0 ? "TRACKED" : ignored.status === 0 ? "IGNORED_UNTRACKED" : "UNTRACKED_NOT_IGNORED";
  gitRoleCache.set(key, role);
  return role;
}

export function requireRegisteredArtifact(root, artifactId, options = {}) {
  const registry = options.registry ?? loadArtifactRegistry(root);
  const artifact = registry.artifacts.find((item) => item.artifactId === artifactId);
  assert.ok(artifact, `artifact:unknown_id:${artifactId}`);
  assert.notEqual(artifact.classification, "OPTIONAL_PRIVATE_PROFILE", `artifact:optional_not_required:${artifactId}`);
  const absolute = path.resolve(root, ...artifact.path.split("/"));
  assert.equal(path.relative(path.resolve(root), absolute).startsWith(".."), false, `artifact:outside_root:${artifactId}`);
  assert.equal(fs.existsSync(absolute), true, `artifact:required_missing:${artifactId}:${artifact.path}`);
  const actualGitRole = options.gitRoleResolver
    ? options.gitRoleResolver(root, artifact.path)
    : gitRole(root, artifact.path);
  assert.equal(actualGitRole, artifact.gitRole, `artifact:git_role_mismatch:${artifactId}`);
  if (options.expectedPath) assert.equal(path.resolve(options.expectedPath), absolute, `artifact:path_mismatch:${artifactId}`);
  if (artifact.requiredJsonPointers.length > 0) {
    const payload = JSON.parse(fs.readFileSync(absolute, "utf8"));
    for (const pointer of artifact.requiredJsonPointers) resolveJsonPointer(payload, pointer);
  }
  return absolute;
}

export function requireRegisteredArtifacts(root, artifactIds) {
  return artifactIds.map((artifactId) => requireRegisteredArtifact(root, artifactId));
}

export function inspectOptionalPrivateIdentity(root, optionalId, options = {}) {
  const registry = options.registry ?? loadArtifactRegistry(root);
  const identity = registry.optionalPrivateIdentities.find((item) => item.optionalId === optionalId);
  assert.ok(identity, `optional:unknown_id:${optionalId}`);
  const rows = identity.artifactIds.map((artifactId) => registry.artifacts.find((item) => item.artifactId === artifactId));
  const statuses = rows.map((artifact) => {
    const absolute = path.resolve(root, ...artifact.path.split("/"));
    return {
      artifact,
      absolute,
      exists: fs.existsSync(absolute),
      gitRole: options.gitRoleResolver
        ? options.gitRoleResolver(root, artifact.path)
        : gitRole(root, artifact.path),
    };
  });
  for (const status of statuses) assert.equal(status.gitRole, "IGNORED_UNTRACKED", `optional:git_role:${optionalId}:${status.artifact.artifactId}`);
  const present = statuses.filter((item) => item.exists);
  if (present.length === 0) return { optionalId, status: "OPTIONAL_PRIVATE_ABSENT", artifactCount: statuses.length };
  assert.equal(present.length, statuses.length, `optional:partial_presence:${optionalId}`);
  for (const status of statuses) {
    if (status.artifact.requiredJsonPointers.length === 0) continue;
    const payload = JSON.parse(fs.readFileSync(status.absolute, "utf8"));
    for (const pointer of status.artifact.requiredJsonPointers) resolveJsonPointer(payload, pointer);
  }
  return { optionalId, status: "OPTIONAL_PRIVATE_PRESENT_AND_VALIDATED", artifactCount: statuses.length };
}

export function inspectAllOptionalPrivateIdentities(root = process.cwd()) {
  const registry = loadArtifactRegistry(root);
  return registry.optionalPrivateIdentities
    .map((item) => inspectOptionalPrivateIdentity(root, item.optionalId, { registry }))
    .sort((left, right) => left.optionalId.localeCompare(right.optionalId));
}

export function registryPathFromImportMeta(metaUrl) {
  return path.resolve(path.dirname(fileURLToPath(metaUrl)), "..", "..", M2_V2_ARTIFACT_REGISTRY_RELATIVE);
}
