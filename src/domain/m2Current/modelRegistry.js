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
  const activeExperiment = registry?.currentRoles?.activeExperiment;
  if (
    activeExperiment !== null
    && activeExperiment !== undefined
    && !experimentIds.has(activeExperiment)
  ) {
    errors.push(`active_experiment_unknown:${activeExperiment}`);
  }
  const blockedExperiment = registry?.currentRoles?.blockedExperiment;
  if (
    blockedExperiment !== null
    && blockedExperiment !== undefined
    && !experimentIds.has(blockedExperiment)
  ) {
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
    const sharedComparableGroupIds = unique(
      pairs.map((pair) => pair.left.comparableGroupId)
    );
    return Object.freeze({
      comparable: true,
      pairs: Object.freeze(pairs),
      sharedComparableGroupIds: Object.freeze(sharedComparableGroupIds),
      winnerByWape: bestWapeModel(left, right, pairs),
      globalLeaderboardAllowed: false
    });
  }
  return Object.freeze({
    comparable: false,
    pairs: Object.freeze([]),
    sharedComparableGroupIds: Object.freeze([]),
    winnerByWape: null,
    globalLeaderboardAllowed: false,
    differences: Object.freeze(comparisonDifferences(registry, left, right))
  });
}

export function renderM2ModelCatalog(registry) {
  const lines = [
    "<!-- 由 config/m2-model-registry.v1.json 确定性生成；请勿手工改写成绩或角色。 -->",
    "# M2 模型目录与成绩总账 v1",
    "",
    "本目录是模型登记表（Model Registry）的中文阅读视图。唯一当前机器权威仍是",
    "`config/m2-model-registry.v1.json`；本文件不授予训练、自动化、生产或发布权限。",
    "",
    "## 当前角色",
    "",
    ...renderCurrentRoles(registry),
    "",
    "## 持久模型与模型族",
    "",
    "| 能力 | 类型 | 中文名称（英文原名、稳定 ID） | 旧 ID / 别名 | 当前角色（机器状态） | 谱系 |",
    "|---|---|---|---|---|---|",
    ...(registry.models ?? []).map((model) => {
      const outsideCurrentWorkScope = model.currentM2ScopeStatus
        === "OUT_OF_CURRENT_M2_SCOPE_PORTFOLIO_RESEARCH";
      const lineage = [
        model.predecessorIds.length > 0
          ? `前序 ${model.predecessorIds.map(code).join("、")}`
          : "无前序",
        model.successorIds.length > 0
          ? `后续 ${model.successorIds.map(code).join("、")}`
          : "无后续"
      ].join("；") + (outsideCurrentWorkScope
        ? "；不得参加作品模型排名"
        : "");
      const aliases = [...model.legacyIds, ...model.legacyAliases]
        .map(code)
        .join("、");
      const currentRole = outsideCurrentWorkScope
        ? `已执行失败、且属于当前 M2 范围外组合研究（${
          code(model.currentRole)
        }；${code(model.currentM2ScopeStatus)}）`
        : `${roleZh(model.currentRole)}（${code(model.currentRole)}）`;
      return `| ${capabilityZh(model.capability)}（${model.capability}）`
        + ` | ${entityTypeZh(model.entityType)}（${model.entityType}）`
        + ` | ${escapeTable(model.displayNameZh)}（${escapeTable(model.displayNameEn)}，`
        + `${code(model.stableModelId)}） | ${aliases || "无"}`
        + ` | ${currentRole}`
        + ` | ${lineage} |`;
    }),
    "",
    "## 实验、实验臂与检查点",
    "",
    "实验 ID 只组织评价活动；实验臂、消融和检查点不是新的模型身份。",
    "",
    "| 实验（英文原名、稳定 ID） | 已登记实验臂（完整作用域、机器状态） |",
    "|---|---|",
    ...(registry.experiments ?? []).map((experiment) => (
      `| ${experiment.displayNameZh}（${experiment.displayNameEn}，`
      + `${code(experiment.experimentId)}） | `
      + experiment.arms.map((arm) => (
        `${arm.displayNameZh} / ${arm.armId}（`
        + `${code(`${experiment.experimentId}/${arm.armId}`)}；`
        + `${code(arm.executionStatus)}）`
      )).join("；")
      + " |"
    )),
    "",
    "## 成绩人口与可比组",
    "",
    "成绩只在同一可比组内解释；不同目标、现金权威、人口、horizon、粒度、",
    "as-of/label maturity、实际值定义或评价族不得直接排名。",
    "",
    "| 可比组 | 可比等级（机器状态） | 目标 / 现金权威 | 人口 / 粒度 / horizon | as-of / actual / 评价族 |",
    "|---|---|---|---|---|",
    ...registry.comparabilityGroups.map((group) => (
      `| ${code(group.comparableGroupId)}`
      + ` | ${comparisonClassZh(group.comparisonClass)}（`
      + `${code(group.comparisonClass)}）`
      + ` | ${code(group.target)} / ${code(group.cashAuthority)}`
      + ` | ${code(group.populationId)} / ${code(group.grain)} / `
      + `${group.horizons.length === 0 ? "无" : group.horizons.join("、")}`
      + ` | ${code(group.asOfContract)} / ${code(group.actualDefinition)} / `
      + `${code(group.evaluationFamily)} |`
    )),
    "",
    "## 成绩总账",
    "",
    "| 可比组 | 模型（稳定 ID） | cases / works / origins | WAPE | signed bias | 结果（机器状态） |",
    "|---|---|---:|---:|---:|---|",
    ...renderScoreLedger(registry),
    "",
    "## 查询",
    "",
    "```bash",
    "npm run m2:model -- status",
    "npm run m2:model -- list",
    "npm run m2:model -- show M2-WORK-OA03",
    "npm run m2:model -- aliases exact-v0.3",
    "npm run m2:model -- experiment M2-EXP-CHANNEL-GENERATIVE-02",
    "npm run m2:model -- explain G1",
    "npm run m2:model -- compare M2-WORK-OA03 M2-WORK-LG01",
    "```",
    "",
    "查询命令只读取公开登记表，不执行模型、训练、私有评价或生产写入。"
  ];
  return `${lines.join("\n")}\n`;
}

function bestWapeModel(left, right, pairs) {
  const leftBest = Math.min(...pairs.map((pair) => pair.left.WAPE));
  const rightBest = Math.min(...pairs.map((pair) => pair.right.WAPE));
  if (leftBest === rightBest) {
    return null;
  }
  return leftBest < rightBest ? left.stableModelId : right.stableModelId;
}

function comparisonDifferences(registry, left, right) {
  const leftValues = evaluationDimensions(registry, left);
  const rightValues = evaluationDimensions(registry, right);
  return [
    "target",
    "cashAuthority",
    "populationId",
    "grain",
    "horizons",
    "asOfContract",
    "actualDefinition",
    "evaluationFamily"
  ]
    .filter((field) => JSON.stringify(leftValues[field]) !== JSON.stringify(
      rightValues[field]
    ))
    .map((field) => ({
      field,
      left: leftValues[field],
      right: rightValues[field]
    }));
}

function evaluationDimensions(registry, model) {
  const evaluations = model.evaluations.filter((item) => item.WAPE !== null);
  const groups = new Map((registry.comparabilityGroups ?? []).map(
    (group) => [group.comparableGroupId, group]
  ));
  const evaluationGroups = evaluations
    .map((evaluation) => groups.get(evaluation.comparableGroupId))
    .filter(Boolean);
  return {
    target: unique(evaluations.map((item) => item.target)),
    cashAuthority: unique(evaluations.map((item) => item.cashAuthority)),
    populationId: unique(evaluations.map((item) => item.populationId)),
    grain: unique(evaluations.map((item) => item.grain)),
    horizons: unique(evaluations.map((item) => item.horizons.join(","))),
    asOfContract: unique(evaluationGroups.map((item) => item.asOfContract)),
    actualDefinition: unique(evaluationGroups.map(
      (item) => item.actualDefinition
    )),
    evaluationFamily: unique(evaluationGroups.map(
      (item) => item.evaluationFamily
    ))
  };
}

function renderCurrentRoles(registry) {
  const definitions = [
    [
      "兼容性现行运行回退模型",
      "compatibility operational fallback",
      "operationalWorkFallback"
    ],
    ["研究比较基线", "research baseline", "researchWorkBaseline"],
    ["组合级参考", "portfolio reference", "portfolioReference"],
    ["活动候选", "active candidate", "activeCandidate"],
    ["自动化批准模型", "approved for automation", "approvedForAutomation"]
  ];
  const models = new Map(registry.models.map(
    (model) => [model.stableModelId, model]
  ));
  const rows = definitions.map(([zh, en, key]) => {
    const id = registry.currentRoles[key];
    if (id === null) {
      return `- ${zh}（${en}）：无（\`null\`）。`;
    }
    const model = models.get(id);
    return `- ${zh}（${en}）：${model.displayNameZh}（`
      + `${model.displayNameEn}，${code(id)}）。`;
  });
  if (
    registry.currentRoles.activeExperiment
      === "M2-EXP-PUBLISHING-SCALE-CHANNEL-01"
  ) {
    rows.push(
      "- 当前实验：出版行业规模适配渠道核心开发\n"
        + "  （Publishing-Scale Channel Core Development，"
        + "`M2-EXP-PUBLISHING-SCALE-CHANNEL-01`）；"
        + "第一份完整原始候选评价已执行并按冻结门失败\n"
        + "  （`M2_PUBLISHING_SCALE_CORE_FAIL`），结果已冻结。"
    );
  } else if (registry.currentRoles.activeExperiment !== null) {
    rows.push(
      `- 当前实验：${code(registry.currentRoles.activeExperiment)}。`
    );
  }
  rows.push(
    registry.currentRoles.blockedExperiment === null
      ? "- 当前阻断实验：无（`null`）。"
      : `- 当前阻断实验：${code(registry.currentRoles.blockedExperiment)}`
        + "；这是前置条件阻断，不是已执行失败。"
  );
  return rows;
}

function renderScoreLedger(registry) {
  return registry.comparabilityGroups.flatMap((group) => (
    registry.models.flatMap((model) => (
      model.evaluations
        .filter((evaluation) => (
          evaluation.comparableGroupId === group.comparableGroupId
        ))
        .map((evaluation) => (
          `| ${code(group.comparableGroupId)}`
          + ` | ${model.displayNameZh}（${code(model.stableModelId)}）`
          + ` | ${displayCount(evaluation.caseCount)} / `
          + `${displayCount(evaluation.workCount)} / `
          + `${displayCount(evaluation.originCount)}`
          + ` | ${displayMetric(evaluation.WAPE, evaluation.resultStatus)}`
          + ` | ${displayMetric(evaluation.signedBias, evaluation.resultStatus)}`
          + ` | ${resultStatusZh(evaluation.resultStatus)}（`
          + `${code(evaluation.resultStatus)}） |`
        ))
    ))
  ));
}

function capabilityZh(capability) {
  return {
    WORK: "作品点预测",
    PORT: "组合预测",
    BASE: "研究基线族",
    CHAN: "渠道预测"
  }[capability] ?? "其他能力";
}

function entityTypeZh(entityType) {
  return {
    model: "模型",
    model_revision: "模型修订",
    model_family: "模型族",
    model_pipeline: "选定管线"
  }[entityType] ?? "登记实体";
}

function roleZh(role) {
  return {
    operational_work_fallback: "兼容性现行运行回退",
    research_baseline: "研究比较基线",
    portfolio_reference: "组合级参考",
    baseline_family: "研究基线族",
    comparator_only: "仅作比较",
    rejected_development_candidate: "已拒绝开发候选",
    failed_development_candidate: "已执行失败候选",
    failed_research_candidate: "已执行失败研究候选",
    blocked_not_executed: "阻断且未执行",
    archive_only: "仅历史审计",
    selected_safe_fallback: "安全回退管线",
    rejected_pipeline_safe_fallback: "已拒绝且安全回退的管线",
    regression_baseline_family: "回归比较基线族",
    rejected_posthoc_diagnostic: "已拒绝后验诊断",
    rejected_comparator: "已拒绝比较模型",
    human_formula_comparator: "人工公式比较模型",
    research_work_baseline: "研究比较基线",
    rejected_nested_layer: "已拒绝嵌套层",
    failed_channel_development_model: "已执行失败渠道模型",
    blocked_model_family_no_candidate_outcome: "阻断且无候选结果",
    implementation_blocked_no_candidate_outcome:
      "实现阻断且无候选结果",
    blocked_development_model_no_candidate_outcome:
      "开发执行阻断且无候选结果",
    development_model_recovery_ready_no_private_outcome:
      "恢复就绪且尚无真实私有结果",
    archive_only_failed_model: "仅历史审计且已失败"
  }[role] ?? "登记角色";
}

function comparisonClassZh(value) {
  return {
    SAME_CASE_COMPARABLE: "同案例可比",
    SAME_INTERSECTION_COMPARABLE: "仅相同案例交集可比",
    REUSED_DEVELOPMENT_WINDOW: "复用开发窗口",
    DIFFERENT_GRAIN_NOT_COMPARABLE: "粒度不同，不可直接比较",
    DIFFERENT_TARGET_NOT_COMPARABLE: "目标不同，不可直接比较",
    STANDALONE_ONLY: "仅独立展示"
  }[value] ?? "登记比较等级";
}

function resultStatusZh(value) {
  if (value === "OA03_CURRENT_SCOPE_PERFORMANCE_NOT_EVALUABLE") {
    return "主要参考不可合法重建，当前性能不可评价";
  }
  if (value === "OA03_CURRENT_SCOPE_PERFORMANCE_NOT_SUPPORTED") {
    return "当前范围性能不支持";
  }
  if (value === "OA03_CURRENT_SCOPE_PERFORMANCE_MIXED") {
    return "当前范围性能证据混合";
  }
  if (value === "OA03_CURRENT_SCOPE_PERFORMANCE_SUPPORTED") {
    return "当前范围局部比较获得支持";
  }
  if (value === "OA03_TRAILING12_CHANNEL_ALLOCATION_NOT_SUPPORTED") {
    return "固定最近 12 月已有渠道分配不支持";
  }
  if (value === "OA03_TRAILING12_CHANNEL_ALLOCATION_MIXED") {
    return "固定最近 12 月已有渠道分配证据混合";
  }
  if (value === "M2_PUBLISHING_SCALE_IMPLEMENTATION_BLOCKED") {
    return "实现阻断且无候选结果";
  }
  if (value === "HORIZON_ROUTER_NOT_CONFIRMED") {
    return "按预测周期滚动模型路由未确认";
  }
  if (value === "SAME_CASE_NO_STABLE_WINNER") {
    return "同案例重评分未形成稳定优胜";
  }
  if (value === "SAME_CASE_WAPE_BIAS_TRADEOFF") {
    return "同案例 WAPE 与偏差存在权衡";
  }
  if (value === "SAME_CASE_CLEAR_WINNER") {
    return "同案例重评分形成明确优胜";
  }
  if (value === "SAME_CASE_CLEAR_WINNER_COMPARISON_LOSER") {
    return "同案例明确优胜比较中的落后模型";
  }
  if (value === "CHANNEL_ALLOCATION_MIXED") {
    return "已有渠道分配证据混合";
  }
  if (value === "CHANNEL_ALLOCATION_NOT_CONFIRMED") {
    return "已有渠道分配未确认";
  }
  if (value === "CONTROLLED_FULL_POPULATION_REFERENCE") {
    return "已执行的全量训练人口参照";
  }
  if (value === "CONTROLLED_CORE90_TRAINING_TAIL_INTERFERENCE_NOT_CONFIRMED") {
    return "动态核心 90% 训练已执行，尾部干扰未确认";
  }
  if (value === "CONTROLLED_CORE80_TRAINING_TAIL_INTERFERENCE_NOT_CONFIRMED") {
    return "动态核心 80% 训练已执行且退化，尾部干扰未确认";
  }
  if (value === "TAIL_INTERFERENCE_NOT_CONFIRMED") {
    return "尾部干扰未确认";
  }
  if (/NOT_EXECUTED/u.test(value)) {
    return "尚未执行";
  }
  if (/BLOCKED|BLOCKER/u.test(value)) {
    return "因前置条件不满足而阻断";
  }
  if (/FAIL|REJECT/u.test(value)) {
    return "已执行但未通过";
  }
  return "登记结果";
}

function displayMetric(value, resultStatus) {
  if (value !== null) {
    return Number(value).toFixed(8);
  }
  if (/BLOCKED|BLOCKER/u.test(resultStatus)) {
    return "未产生（null）";
  }
  return /NOT_EXECUTED/u.test(resultStatus)
    ? "未执行（null）"
    : "未登记（null）";
}

function displayCount(value) {
  return value === null ? "—" : String(value);
}

function code(value) {
  return `\`${escapeTable(value)}\``;
}

function escapeTable(value) {
  return String(value).replace(/\|/gu, "\\|");
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
