import { readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const DEFAULT_CATALOG_PATH = path.join(
  DEFAULT_REPO_ROOT,
  "config",
  "development-capability-catalog.v0.1.json",
);

function parseVersion(value) {
  const match = String(value ?? "").match(/(\d+)\.(\d+)(?:\.(\d+))?/u);
  if (!match) {
    return null;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3] ?? 0),
  };
}

function compareMajorMinor(left, right) {
  return left.major === right.major
    ? left.minor - right.minor
    : left.major - right.major;
}

export function resolveRepoPath(repoRoot, repositoryRelativePath) {
  if (typeof repositoryRelativePath !== "string" || repositoryRelativePath.length === 0) {
    throw new Error("Capability artifact path must be a non-empty repository-relative string");
  }
  if (path.isAbsolute(repositoryRelativePath)) {
    throw new Error(`Capability artifact path must be repository-relative: ${repositoryRelativePath}`);
  }
  const normalizedRoot = path.resolve(repoRoot);
  const resolved = path.resolve(normalizedRoot, repositoryRelativePath);
  const relative = path.relative(normalizedRoot, resolved);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Capability artifact path escapes repository root: ${repositoryRelativePath}`);
  }
  return resolved;
}

export function loadCapabilityCatalog(catalogPath = DEFAULT_CATALOG_PATH) {
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
  if (catalog.schemaVersion !== "development-capability-catalog.v0.1") {
    throw new Error(`Unsupported capability catalog schema: ${catalog.schemaVersion}`);
  }
  if (!Array.isArray(catalog.capabilities) || catalog.capabilities.length === 0) {
    throw new Error("Capability catalog must define at least one capability");
  }
  const ids = catalog.capabilities.map((capability) => capability.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Capability catalog contains duplicate capability ids");
  }
  const core = catalog.capabilities.find((capability) => capability.id === "core-dev");
  if (!core || core.requiredPrivateArtifacts?.length !== 0) {
    throw new Error("core-dev must exist and must not require private artifacts");
  }
  return catalog;
}

function defaultToolProbe(tool) {
  if (tool.runtime === "node") {
    return { present: true, versionText: process.version };
  }
  if (tool.id === "npm") {
    const npmExecPath = process.env.npm_execpath;
    if (!npmExecPath) {
      return {
        present: false,
        versionText: "",
        error: "npm_execpath is unavailable; run this doctor through npm",
      };
    }
    const result = spawnSync(process.execPath, [npmExecPath, ...(tool.versionArgs ?? ["--version"])], {
      encoding: "utf8",
      windowsHide: true,
    });
    return {
      present: result.status === 0,
      versionText: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim(),
      error: result.error?.message ?? null,
    };
  }
  const result = spawnSync(tool.command, tool.versionArgs ?? ["--version"], {
    encoding: "utf8",
    windowsHide: true,
  });
  return {
    present: result.status === 0,
    versionText: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim(),
    error: result.error?.message ?? null,
  };
}

function defaultArtifactProbe(absolutePath, artifact) {
  try {
    const stat = statSync(absolutePath);
    return artifact.kind === "directory" ? stat.isDirectory() : stat.isFile();
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
      return false;
    }
    throw error;
  }
}

function evaluateTool(tool, toolProbe) {
  const probed = toolProbe(tool);
  if (!probed.present) {
    return {
      id: tool.id,
      present: false,
      compatible: false,
      version: null,
      message: probed.error ?? "command unavailable",
    };
  }
  const version = parseVersion(probed.versionText);
  let compatible = true;
  if (tool.minimumMajor !== undefined) {
    compatible = version !== null && version.major >= tool.minimumMajor;
  }
  if (
    compatible
    && tool.minimumMinor !== undefined
    && version?.major === tool.minimumMajor
  ) {
    compatible = version.minor >= tool.minimumMinor;
  }
  if (compatible && tool.maximumMajor !== undefined) {
    compatible = version !== null && version.major <= tool.maximumMajor;
  }
  if (
    compatible
    && tool.maximumMinor !== undefined
    && version?.major === tool.maximumMajor
  ) {
    compatible = version.minor <= tool.maximumMinor;
  }
  if (
    compatible
    && tool.minimumMajor !== undefined
    && tool.minimumMinor !== undefined
    && version
  ) {
    compatible = compareMajorMinor(version, {
      major: tool.minimumMajor,
      minor: tool.minimumMinor,
    }) >= 0;
  }
  return {
    id: tool.id,
    present: true,
    compatible,
    version: version
      ? `${version.major}.${version.minor}.${version.patch}`
      : probed.versionText || "unknown",
    recommended: tool.recommended ?? tool.recommendedMajor ?? null,
  };
}

export function evaluateCapability(catalog, capabilityId, options = {}) {
  const capability = catalog.capabilities.find((candidate) => candidate.id === capabilityId);
  if (!capability) {
    throw new Error(
      `Unknown capability "${capabilityId}". Available: ${catalog.capabilities
        .map((candidate) => candidate.id)
        .join(", ")}`,
    );
  }
  const repoRoot = path.resolve(options.repoRoot ?? DEFAULT_REPO_ROOT);
  const artifactExists = options.artifactExists ?? defaultArtifactProbe;
  const toolProbe = options.toolProbe ?? defaultToolProbe;
  const artifacts = (capability.requiredPrivateArtifacts ?? []).map((artifact) => {
    const absolutePath = resolveRepoPath(repoRoot, artifact.path);
    return {
      role: artifact.role,
      kind: artifact.kind,
      path: artifact.path,
      present: Boolean(artifactExists(absolutePath, artifact)),
    };
  });
  const tools = (capability.requiredTools ?? []).map((tool) => evaluateTool(tool, toolProbe));
  const missingArtifacts = artifacts.filter((artifact) => !artifact.present);
  const unavailableTools = tools.filter((tool) => !tool.present || !tool.compatible);
  let status = capabilityId === "core-dev"
    ? "READY"
    : "AVAILABLE_FOR_CANONICAL_VALIDATION";
  if (unavailableTools.length > 0) {
    status = "BLOCKED_MISSING_OR_INCOMPATIBLE_TOOL";
  } else if (missingArtifacts.length > 0) {
    status = "BLOCKED_MISSING_PRIVATE_ARTIFACT";
  }
  return {
    schemaVersion: "development-capability-doctor-result.v0.1",
    capabilityId,
    description: capability.description,
    status,
    coreDevelopmentUnaffected: capabilityId === "core-dev"
      ? status === "READY"
      : true,
    authorization: capability.authorization,
    tools,
    privateArtifacts: artifacts,
    missingPrivateRoles: missingArtifacts.map((artifact) => artifact.role),
    unavailableTools: unavailableTools.map((tool) => tool.id),
    canonicalValidationCommands: capability.canonicalValidationCommands ?? [],
    recovery: capability.recovery ?? null,
    notes: capabilityId === "core-dev"
      ? ["core-dev intentionally does not inspect or require private artifacts"]
      : [
        "artifact presence is inventory only",
        "run the canonical verifier before treating the capability as usable",
        "availability does not grant execution authorization",
      ],
  };
}

export function formatCapabilityResult(result) {
  const lines = [
    `[${result.status}] ${result.capabilityId}`,
    result.description,
  ];
  if (result.tools.length > 0) {
    lines.push("Tools:");
    for (const tool of result.tools) {
      lines.push(
        `- ${tool.id}: ${tool.present && tool.compatible ? "OK" : "MISSING_OR_INCOMPATIBLE"}`
        + (tool.version ? ` (${tool.version})` : ""),
      );
    }
  }
  if (result.privateArtifacts.length > 0) {
    lines.push("Private capability roles (contents were not read):");
    for (const artifact of result.privateArtifacts) {
      lines.push(`- ${artifact.role}: ${artifact.present ? "PRESENT" : "MISSING"} — ${artifact.path}`);
    }
  }
  if (result.status === "BLOCKED_MISSING_PRIVATE_ARTIFACT") {
    lines.push("Core development remains available; only this capability is blocked.");
  }
  if (result.recovery) {
    lines.push(`Recovery: ${result.recovery}`);
  }
  if (result.canonicalValidationCommands.length > 0) {
    lines.push("Canonical next check:");
    for (const command of result.canonicalValidationCommands) {
      lines.push(`- ${command}`);
    }
  }
  lines.push(`Authorization: ${result.authorization}`);
  return lines.join("\n");
}

function parseCliArguments(argv) {
  let capabilityId = null;
  let json = false;
  for (const argument of argv) {
    if (argument === "--json") {
      json = true;
    } else if (argument.startsWith("--capability=")) {
      capabilityId = argument.slice("--capability=".length);
    } else if (!argument.startsWith("-") && capabilityId === null) {
      capabilityId = argument;
    } else {
      throw new Error(`Unsupported argument: ${argument}`);
    }
  }
  return { capabilityId: capabilityId ?? "core-dev", json };
}

function main() {
  try {
    const { capabilityId, json } = parseCliArguments(process.argv.slice(2));
    const catalog = loadCapabilityCatalog();
    const result = evaluateCapability(catalog, capabilityId);
    process.stdout.write(`${json ? JSON.stringify(result, null, 2) : formatCapabilityResult(result)}\n`);
    process.exitCode = result.status.startsWith("BLOCKED_") ? 1 : 0;
  } catch (error) {
    process.stderr.write(`[CAPABILITY_DOCTOR_ERROR] ${error.message}\n`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  main();
}
