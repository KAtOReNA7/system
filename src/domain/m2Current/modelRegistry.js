import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const MODEL_FIELDS = [
  "stableModelId",
  "displayNameZh",
  "displayNameEn",
  "legacyIds",
  "legacyAliases",
  "entityType",
  "capability",
  "target",
  "targetHistory",
  "predictionGrain",
  "horizonContract",
  "formulaSummaryZh",
  "formulaSummaryEn",
  "inputSummaryZh",
  "codeEntrypoints",
  "configEntrypoints",
  "evidenceRefs",
  "predecessorIds",
  "successorIds",
  "currentRole",
  "evidenceStatus",
  "operationalStatus",
  "automationAuthorized",
  "productionImported",
  "finalHoldoutOpened",
  "developmentWindowReuse",
  "limitationsZh",
  "evaluations"
];

const EVALUATION_FIELDS = [
  "evaluationId",
  "datasetVersion",
  "cashAuthority",
  "populationId",
  "comparableGroupId",
  "caseCount",
  "workCount",
  "originCount",
  "horizons",
  "target",
  "grain",
  "WAPE",
  "signedBias",
  "baselineModelId",
  "relativeWape",
  "materiality",
  "independentEvidence",
  "reportRef",
  "resultStatus"
];

const COMPARABILITY_FIELDS = [
  "comparableGroupId",
  "comparisonClass",
  "target",
  "cashAuthority",
  "populationId",
  "horizons",
  "grain",
  "asOfContract",
  "actualDefinition",
  "evaluationFamily"
];

const ROLE_KEYS = [
  "operationalWorkFallback",
  "researchWorkBaseline",
  "portfolioReference",
  "approvedForAutomation",
  "activeCandidate"
];

export function loadM2ModelRegistry(
  registryPath = path.resolve("config", "m2-model-registry.v1.json")
) {
  return JSON.parse(readFileSync(registryPath, "utf8"));
}

export function validateM2ModelRegistry(registry, {
  repoRoot = process.cwd(),
  verifyDigests = true
} = {}) {
  const errors = [];
  const warnings = [];
  if (registry?.schema !== "m2.model_registry.v1") {
    errors.push("registry_schema_invalid");
  }
  for (const key of [
    "targetAuthority",
    "currentRoles",
    "models",
    "experiments",
    "nonModelIdentifiers",
    "comparabilityGroups",
    "glossary",
    "validationRules"
  ]) {
    if (registry?.[key] === undefined) {
      errors.push(`registry_missing_${key}`);
    }
  }
  const models = Array.isArray(registry?.models) ? registry.models : [];
  const modelIds = new Set();
  const aliases = new Map();
  const evaluationIds = new Set();
  const pattern = new RegExp(
    registry?.validationRules?.stableModelIdPattern
      ?? "^M2-(WORK|PORT|RANK|CHAN|RISK|BASE)-[A-Z0-9]+$",
    "u"
  );
  for (const model of models) {
    requireFields(model, MODEL_FIELDS, `model_${model?.stableModelId}`, errors);
    const id = model?.stableModelId;
    if (typeof id !== "string" || !pattern.test(id)) {
      errors.push(`stable_model_id_invalid:${id}`);
    }
    if (modelIds.has(id)) {
      errors.push(`stable_model_id_duplicate:${id}`);
    }
    modelIds.add(id);
    for (const alias of [id, ...(model?.legacyIds ?? []), ...(model?.legacyAliases ?? [])]) {
      const normalized = normalizeAlias(alias);
      const owner = aliases.get(normalized);
      if (owner && owner !== id) {
        errors.push(`legacy_alias_collision:${alias}:${owner}:${id}`);
      } else {
        aliases.set(normalized, id);
      }
    }
    for (const evidenceRef of [
      ...(model?.codeEntrypoints ?? []),
      ...(model?.configEntrypoints ?? []),
      ...(model?.evidenceRefs ?? [])
    ]) {
      requirePublicEvidencePath(evidenceRef, repoRoot, errors);
    }
    for (const evaluation of model?.evaluations ?? []) {
      requireFields(
        evaluation,
        EVALUATION_FIELDS,
        `evaluation_${evaluation?.evaluationId}`,
        errors
      );
      if (evaluationIds.has(evaluation?.evaluationId)) {
        errors.push(`evaluation_id_duplicate:${evaluation?.evaluationId}`);
      }
      evaluationIds.add(evaluation?.evaluationId);
      requirePublicEvidencePath(evaluation?.reportRef, repoRoot, errors);
    }
  }

  const experimentIds = new Set();
  for (const experiment of registry?.experiments ?? []) {
    const id = experiment?.experimentId;
    if (typeof id !== "string" || !id.startsWith("M2-EXP-")) {
      errors.push(`experiment_id_invalid:${id}`);
    }
    if (experimentIds.has(id)) {
      errors.push(`experiment_id_duplicate:${id}`);
    }
    experimentIds.add(id);
    for (const modelId of experiment?.modelIds ?? []) {
      if (!modelIds.has(modelId)) {
        errors.push(`experiment_model_unknown:${id}:${modelId}`);
      }
    }
    for (const arm of experiment?.arms ?? []) {
      if (arm?.modelId !== null && !modelIds.has(arm?.modelId)) {
        errors.push(`experiment_arm_model_unknown:${id}:${arm?.armId}`);
      }
    }
    for (const evidenceRef of experiment?.evidenceRefs ?? []) {
      requirePublicEvidencePath(evidenceRef, repoRoot, errors);
    }
  }

  for (const role of ROLE_KEYS) {
    const modelId = registry?.currentRoles?.[role];
    if (modelId !== null && modelId !== undefined && !modelIds.has(modelId)) {
      errors.push(`current_role_model_unknown:${role}:${modelId}`);
    }
  }
  const blockedExperiment = registry?.currentRoles?.blockedExperiment;
  if (!experimentIds.has(blockedExperiment)) {
    errors.push(`blocked_experiment_unknown:${blockedExperiment}`);
  }
  requirePublicEvidencePath(
    registry?.currentRoles?.latestStateIndex,
    repoRoot,
    errors
  );

  const groups = new Map();
  for (const group of registry?.comparabilityGroups ?? []) {
    requireFields(
      group,
      COMPARABILITY_FIELDS,
      `comparability_${group?.comparableGroupId}`,
      errors
    );
    if (groups.has(group?.comparableGroupId)) {
      errors.push(`comparability_group_duplicate:${group?.comparableGroupId}`);
    }
    groups.set(group?.comparableGroupId, group);
  }
  for (const model of models) {
    for (const evaluation of model?.evaluations ?? []) {
      const group = groups.get(evaluation?.comparableGroupId);
      if (!group) {
        errors.push(
          `evaluation_comparability_group_unknown:${evaluation?.evaluationId}`
        );
        continue;
      }
      for (const field of ["target", "cashAuthority", "populationId", "grain"]) {
        if (evaluation[field] !== group[field]) {
          errors.push(
            `evaluation_comparability_${field}_mismatch:`
              + `${evaluation.evaluationId}:${group.comparableGroupId}`
          );
        }
      }
      if (!sameNumbers(evaluation.horizons, group.horizons)) {
        errors.push(
          `evaluation_comparability_horizon_mismatch:`
            + `${evaluation.evaluationId}:${group.comparableGroupId}`
        );
      }
      if (
        evaluation.baselineModelId !== null
        && !modelIds.has(evaluation.baselineModelId)
      ) {
        errors.push(
          `evaluation_baseline_unknown:${evaluation.evaluationId}:`
            + `${evaluation.baselineModelId}`
        );
      }
    }
  }

  for (const item of registry?.nonModelIdentifiers ?? []) {
    requireFields(item, [
      "identifier",
      "namespace",
      "parentExperiment",
      "type",
      "displayNameZh",
      "meaningZh",
      "mayAppearAloneInUserReport",
      "evidenceRef"
    ], `non_model_${item?.namespace}_${item?.identifier}`, errors);
    if (item?.mayAppearAloneInUserReport !== false) {
      errors.push(
        `non_model_identifier_may_appear_alone:${item?.namespace}:${item?.identifier}`
      );
    }
    if (
      item?.parentExperiment !== null
      && !experimentIds.has(item?.parentExperiment)
    ) {
      errors.push(
        `non_model_parent_unknown:${item?.namespace}:${item?.identifier}`
      );
    }
    requirePublicEvidencePath(item?.evidenceRef, repoRoot, errors);
  }

  if (
    registry?.currentRoles?.approvedForAutomation !== null
    || registry?.currentRoles?.activeCandidate !== null
  ) {
    errors.push("unsupported_current_model_promotion");
  }
  const serialized = JSON.stringify(registry);
  if (/data[\\/]+private-(?:input|output)/iu.test(serialized)) {
    errors.push("registry_contains_private_path");
  }
  if (verifyDigests) {
    for (const entry of (
      registry?.validationRules?.historicalEvidenceDigests ?? []
    )) {
      const resolved = path.resolve(repoRoot, entry.path);
      if (!existsSync(resolved)) {
        errors.push(`historical_evidence_missing:${entry.path}`);
        continue;
      }
      const actual = canonicalEvidenceSha256(readFileSync(resolved));
      if (actual !== entry.sha256) {
        errors.push(`historical_evidence_digest_mismatch:${entry.path}`);
      }
    }
  }
  if (models.some((model) => model.productionImported === true)) {
    warnings.push("registry_contains_production_imported_model");
  }
  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(errors),
    warnings: Object.freeze(warnings),
    counts: Object.freeze({
      modelCount: models.length,
      experimentCount: registry?.experiments?.length ?? 0,
      nonModelIdentifierCount: registry?.nonModelIdentifiers?.length ?? 0,
      evaluationCount: evaluationIds.size,
      comparabilityGroupCount: groups.size
    })
  });
}

export function findM2ModelsByAlias(registry, alias) {
  const normalized = normalizeAlias(alias);
  return (registry?.models ?? []).filter((model) => (
    [model.stableModelId, ...(model.legacyIds ?? []), ...(model.legacyAliases ?? [])]
      .some((value) => normalizeAlias(value) === normalized)
  ));
}

export function explainM2Identifier(registry, identifier) {
  const normalized = normalizeAlias(identifier);
  const models = findM2ModelsByAlias(registry, identifier);
  const nonModels = (registry?.nonModelIdentifiers ?? []).filter((item) => (
    normalizeAlias(item.identifier) === normalized
  ));
  const arms = (registry?.experiments ?? []).flatMap((experiment) => (
    (experiment.arms ?? [])
      .filter((arm) => normalizeAlias(arm.armId) === normalized)
      .map((arm) => ({ experiment, arm }))
  ));
  return Object.freeze({ models, nonModels, arms });
}

export function compareM2ModelRegistryEntries(registry, leftId, rightId) {
  const left = (registry?.models ?? []).find(
    (model) => model.stableModelId === leftId
  );
  const right = (registry?.models ?? []).find(
    (model) => model.stableModelId === rightId
  );
  if (!left || !right) {
    throw new Error("m2_model_registry_compare_model_unknown");
  }
  const pairs = [];
  for (const leftEvaluation of left.evaluations) {
    for (const rightEvaluation of right.evaluations) {
      if (
        leftEvaluation.comparableGroupId === rightEvaluation.comparableGroupId
        && leftEvaluation.WAPE !== null
        && rightEvaluation.WAPE !== null
      ) {
        pairs.push({ left: leftEvaluation, right: rightEvaluation });
      }
    }
  }
  if (pairs.length > 0) {
    return Object.freeze({
      comparable: true,
      pairs: Object.freeze(pairs),
      winnerByWape: bestWapeModel(left, right, pairs)
    });
  }
  return Object.freeze({
    comparable: false,
    pairs: Object.freeze([]),
    winnerByWape: null,
    differences: Object.freeze(comparisonDifferences(left, right))
  });
}

function bestWapeModel(left, right, pairs) {
  const leftBest = Math.min(...pairs.map((pair) => pair.left.WAPE));
  const rightBest = Math.min(...pairs.map((pair) => pair.right.WAPE));
  if (leftBest === rightBest) {
    return null;
  }
  return leftBest < rightBest ? left.stableModelId : right.stableModelId;
}

function comparisonDifferences(left, right) {
  const leftValues = evaluationDimensions(left);
  const rightValues = evaluationDimensions(right);
  return ["target", "cashAuthority", "populationId", "grain", "horizons"]
    .filter((field) => JSON.stringify(leftValues[field]) !== JSON.stringify(
      rightValues[field]
    ))
    .map((field) => ({
      field,
      left: leftValues[field],
      right: rightValues[field]
    }));
}

function evaluationDimensions(model) {
  const evaluations = model.evaluations.filter((item) => item.WAPE !== null);
  return {
    target: unique(evaluations.map((item) => item.target)),
    cashAuthority: unique(evaluations.map((item) => item.cashAuthority)),
    populationId: unique(evaluations.map((item) => item.populationId)),
    grain: unique(evaluations.map((item) => item.grain)),
    horizons: unique(evaluations.map((item) => item.horizons.join(",")))
  };
}

function requireFields(value, fields, context, errors) {
  for (const field of fields) {
    if (!Object.hasOwn(value ?? {}, field)) {
      errors.push(`${context}_missing_${field}`);
    }
  }
}

function requirePublicEvidencePath(value, repoRoot, errors) {
  if (typeof value !== "string" || value.length === 0) {
    errors.push(`evidence_path_invalid:${value}`);
    return;
  }
  if (/data[\\/]+private-(?:input|output)/iu.test(value)) {
    errors.push(`evidence_path_private:${value}`);
    return;
  }
  if (!existsSync(path.resolve(repoRoot, value))) {
    errors.push(`evidence_path_missing:${value}`);
  }
}

function normalizeAlias(value) {
  return String(value)
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/gu, "-");
}

function sameNumbers(left, right) {
  return JSON.stringify([...(left ?? [])].sort((a, b) => a - b))
    === JSON.stringify([...(right ?? [])].sort((a, b) => a - b));
}

export function canonicalEvidenceSha256(value) {
  const canonicalText = Buffer.isBuffer(value)
    ? value.toString("utf8").replace(/\r\n/gu, "\n")
    : String(value).replace(/\r\n/gu, "\n");
  return createHash("sha256").update(canonicalText, "utf8").digest("hex");
}

function unique(values) {
  return [...new Set(values)].sort();
}
