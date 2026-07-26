#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  assessM2HumanAnchoredLaterOriginReadiness,
  buildM2HumanAnchoredLaterOriginPublicDiagnostic,
  buildM2HumanAnchoredLaterOriginPublicPreregistration,
  renderM2HumanAnchoredLaterOriginReadinessReport,
  validateM2HumanAnchoredLaterOriginPublicPreregistration
} from "../../src/domain/m2Current/laterOrigin.js";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);
const configPath = path.join(
  root,
  "config/m2-current-human-anchored-later-origin.v0.1.json"
);
const developmentConfigPath = path.join(
  root,
  "config/m2-current-human-anchored.v0.1.json"
);
const developmentEvidencePath = path.join(
  root,
  "docs/analysis/m2-current/"
    + "M2-current-human-anchored-development-v0.1.json"
);
const config = readJson(configPath);

if (process.argv.includes("--private-audit")) {
  runPrivateAudit();
} else if (process.argv.includes("--verify")) {
  verifyPublicArtifacts();
} else {
  throw new Error(
    "m2_later_origin_mode_required_use_private_audit_or_verify"
  );
}

function runPrivateAudit() {
  const status = runGit(["status", "--porcelain", "--untracked-files=all"]);
  if (status.trim() !== "") {
    throw new Error(
      "m2_later_origin_preregistration_requires_clean_worktree"
    );
  }
  verifyFrozenTrackedModel();
  const profile = runPrivateProfile();
  const privateEvidence = {
    ...profile,
    privateDigestManifestWritten: true
  };
  const assessment = assessM2HumanAnchoredLaterOriginReadiness({
    preregistrationConfig: config,
    developmentConfig: readJson(developmentConfigPath),
    developmentEvidence: readJson(developmentEvidencePath),
    privateEvidence
  });
  const codeEvidence = {
    auditImplementationCommit: runGit(["rev-parse", "HEAD"]).trim(),
    trackedCodeDigest: digestTrackedCode()
  };
  const publicPreregistration =
    buildM2HumanAnchoredLaterOriginPublicPreregistration({
      preregistrationConfig: config,
      assessment,
      codeEvidence,
      privateEvidence
    });
  const diagnostic =
    buildM2HumanAnchoredLaterOriginPublicDiagnostic(
      publicPreregistration
    );
  const report = renderM2HumanAnchoredLaterOriginReadinessReport(
    diagnostic
  );
  const privatePreregistration = {
    schema:
      "m2.current.human_anchored_later_origin_private_preregistration.v0.1",
    tracked: false,
    publicPreregistration,
    codeEvidence,
    sourceDigests: profile.sourceDigests,
    frozenStateDigest: profile.frozenStateDigest,
    metricAccess: {
      newLaterOriginMetricsRead: false,
      laterOriginConsumed: false
    }
  };
  writeJson(config.outputs.publicPreregistration, publicPreregistration);
  writeJson(config.outputs.publicDiagnostic, diagnostic);
  writeText(config.outputs.publicReport, report);
  writeJson(
    config.outputs.privatePreregistration,
    privatePreregistration
  );
  process.stdout.write(JSON.stringify({
    decision: diagnostic.decision,
    candidateBlockEligible: diagnostic.candidateBlock.eligible,
    metricsRead: diagnostic.validation.metricsRead,
    laterOriginConsumed: diagnostic.validation.laterOriginConsumed,
    earliestPossibleIndependentOrigin:
      diagnostic.nextCondition.earliestPossibleIndependentOrigin,
    requiredCompleteLedgerThrough:
      diagnostic.nextCondition.requiredCompleteLedgerThrough
  }) + "\n");
}

function verifyPublicArtifacts() {
  const preregistration = validateM2HumanAnchoredLaterOriginPublicPreregistration(
    readJson(path.join(root, config.outputs.publicPreregistration))
  );
  const diagnostic =
    buildM2HumanAnchoredLaterOriginPublicDiagnostic(preregistration);
  const report = renderM2HumanAnchoredLaterOriginReadinessReport(diagnostic);
  verifyText(
    config.outputs.publicDiagnostic,
    `${JSON.stringify(diagnostic, null, 2)}\n`
  );
  verifyText(config.outputs.publicReport, report);
  process.stdout.write(
    "M2 human-anchored later-origin public readiness verified.\n"
  );
}

function runPrivateProfile() {
  const result = spawnSync(
    process.execPath,
    [
      path.join(root, "scripts/run-codex-python.mjs"),
      path.join(
        root,
        "scripts/m2-current/audit_human_anchored_later_origin_data.py"
      )
    ],
    {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024
    }
  );
  if (result.status !== 0) {
    throw new Error(
      "m2_later_origin_private_profile_failed:"
      + String(result.stderr ?? "").trim()
    );
  }
  return JSON.parse(result.stdout);
}

function verifyFrozenTrackedModel() {
  const result = spawnSync(
    "git",
    [
      "diff",
      "--quiet",
      config.frozenDevelopment.developmentCommit,
      "--",
      ...config.frozenDevelopment.trackedModelFiles
    ],
    {
      cwd: root,
      encoding: "utf8",
      windowsHide: true
    }
  );
  if (result.status !== 0) {
    throw new Error("m2_later_origin_frozen_model_code_drift");
  }
  const statePath = path.join(
    root,
    config.frozenDevelopment.requiredFrozenStateArtifact
  );
  if (existsSync(statePath)) {
    const stat = spawnSync(
      process.execPath,
      ["-e", "process.exit(0)"],
      { windowsHide: true }
    );
    if (stat.status !== 0) {
      throw new Error("m2_later_origin_frozen_state_probe_failed");
    }
  }
}

function digestTrackedCode() {
  const files = [
    ...config.frozenDevelopment.trackedModelFiles,
    "config/m2-current-human-anchored-later-origin.v0.1.json",
    "src/domain/m2Current/laterOrigin.js",
    "scripts/m2-current/audit_human_anchored_later_origin_data.py",
    "scripts/m2-current/"
      + "run_m2_human_anchored_later_origin_readiness.mjs"
  ].sort();
  const digest = createHash("sha256");
  for (const file of files) {
    digest.update(file);
    digest.update("\0");
    digest.update(readFileSync(path.join(root, file)));
    digest.update("\0");
  }
  return digest.digest("hex");
}

function runGit(arguments_) {
  const result = spawnSync(
    "git",
    arguments_,
    {
      cwd: root,
      encoding: "utf8",
      windowsHide: true
    }
  );
  if (result.status !== 0) {
    throw new Error(
      `m2_later_origin_git_failed:${arguments_.join("_")}:`
      + String(result.stderr ?? "").trim()
    );
  }
  return result.stdout;
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function writeJson(repositoryRelativePath, value) {
  writeText(
    repositoryRelativePath,
    `${JSON.stringify(value, null, 2)}\n`
  );
}

function writeText(repositoryRelativePath, value) {
  const absolute = path.join(root, repositoryRelativePath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, value, "utf8");
}

function verifyText(repositoryRelativePath, expected) {
  const actual = readFileSync(
    path.join(root, repositoryRelativePath),
    "utf8"
  ).replaceAll("\r\n", "\n");
  if (actual !== expected) {
    throw new Error(
      `m2_later_origin_public_artifact_drift:${repositoryRelativePath}`
    );
  }
}
