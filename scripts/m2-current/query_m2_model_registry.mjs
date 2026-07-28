import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  compareM2ModelRegistryEntries,
  explainM2Identifier,
  findM2ModelsByAlias,
  loadM2ModelRegistry,
  renderM2ModelCatalog,
  validateM2ModelRegistry
} from "../../src/domain/m2Current/modelRegistry.js";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);
const registry = loadM2ModelRegistry(
  path.join(root, "config", "m2-model-registry.v1.json")
);
const validation = validateM2ModelRegistry(registry, { repoRoot: root });
if (!validation.valid) {
  fail(`模型登记表校验失败（M2_MODEL_REGISTRY_INVALID）：\n${
    validation.errors.join("\n")
  }`);
}

const [command = "help", ...args] = process.argv.slice(2);

switch (command) {
  case "status":
    printStatus();
    break;
  case "list":
    printList();
    break;
  case "show":
    printModel(requireOneModel(args[0]));
    break;
  case "aliases":
    printAliases(requireOneModel(args[0]));
    break;
  case "experiment":
    printExperiment(args[0]);
    break;
  case "explain":
    printExplanation(args[0]);
    break;
  case "compare":
    printComparison(requireOneModel(args[0]), requireOneModel(args[1]));
    break;
  case "catalog":
    process.stdout.write(renderM2ModelCatalog(registry));
    break;
  case "help":
  case "--help":
  case "-h":
    printHelp();
    break;
  default:
    fail(`未知查询命令（M2_MODEL_QUERY_UNKNOWN_COMMAND）：${command}`);
}

function printStatus() {
  console.log("M2 当前模型角色（Model Registry current roles）");
  printRole("现行运行回退模型", "operationalWorkFallback");
  printRole("研究比较基线", "researchWorkBaseline");
  printRole("组合级参考", "portfolioReference");
  printRole("活动候选", "activeCandidate");
  printRole("自动化批准模型", "approvedForAutomation");
  console.log(
    `当前阻断实验：${registry.currentRoles.blockedExperiment}`
      + "（出版行业规模适配渠道核心的私有物化已启动，"
      + "但在候选拟合前因实现接线错误 fail-closed；"
      + "`M2_PUBLISHING_SCALE_IMPLEMENTATION_BLOCKED`）"
  );
  console.log(`当前状态索引：${registry.currentRoles.latestStateIndex}`);
  console.log("本次只读查询模型执行次数：0。");
  console.log(
    "出版行业规模适配渠道核心开发的 K7D 私有物化启动次数：1；"
      + "候选拟合启动次数、候选外层预测行和候选评价行均为 0；"
      + "一次性授权已消耗，未授权重试。"
  );
}

function printRole(label, key) {
  const id = registry.currentRoles[key];
  if (id === null) {
    console.log(`${label}：无（null）`);
    return;
  }
  const model = registry.models.find((item) => item.stableModelId === id);
  console.log(
    `${label}：${model.displayNameZh}（${model.displayNameEn}，${id}；`
      + `${roleZh(model.currentRole)}，${model.currentRole}）`
  );
}

function printList() {
  console.log(`M2 持久模型与模型族：${registry.models.length} 个`);
  for (const model of registry.models) {
    console.log(
      `- ${model.displayNameZh}（${model.displayNameEn}，`
        + `${model.stableModelId}；${roleZh(model.currentRole)}，`
        + `${model.currentRole}）`
    );
  }
}

function printModel(model) {
  console.log(`${model.displayNameZh}（${model.displayNameEn}）`);
  console.log(`稳定 ID：${model.stableModelId}`);
  console.log(
    `类型 / 能力：${entityTypeZh(model.entityType)}（${model.entityType}） / `
      + `${capabilityZh(model.capability)}（${model.capability}）`
  );
  console.log(
    `当前角色：${roleZh(model.currentRole)}（${model.currentRole}）`
  );
  console.log(
    `运行状态：${operationalStatusZh(model.operationalStatus)}（`
      + `${model.operationalStatus}）`
  );
  console.log(
    `目标 / 粒度：${targetZh(model.target)}（${model.target}） / `
      + `${grainZh(model.predictionGrain)}（${model.predictionGrain}）`
  );
  console.log(`horizon 合同：${model.horizonContract}`);
  console.log(`公式：${model.formulaSummaryZh}`);
  console.log(`输入：${model.inputSummaryZh}`);
  console.log("证据路径：");
  for (const evidenceRef of model.evidenceRefs) {
    console.log(`- ${evidenceRef}`);
  }
  console.log(
    `前序 / 后续：${model.predecessorIds.join(", ") || "无"} / `
      + `${model.successorIds.join(", ") || "无"}`
  );
  console.log(
    `自动化 / production / final holdout：`
      + `${model.automationAuthorized} / ${model.productionImported} / `
      + `${model.finalHoldoutOpened}`
  );
  console.log("成绩：");
  for (const evaluation of model.evaluations) {
    console.log(
      `- ${evaluation.evaluationId}（人口 ${evaluation.populationId}；`
        + `可比组 ${evaluation.comparableGroupId}；`
        + `WAPE ${formatMetric(evaluation.WAPE, evaluation.resultStatus)}；`
        + `signed bias ${formatMetric(
          evaluation.signedBias,
          evaluation.resultStatus
        )}；`
        + `状态 ${resultStatusZh(evaluation.resultStatus)}（`
        + `${evaluation.resultStatus}））`
    );
  }
}

function printAliases(model) {
  console.log(
    `${model.displayNameZh}（${model.displayNameEn}，${model.stableModelId}）`
  );
  console.log(`旧 ID：${model.legacyIds.join("；") || "无"}`);
  console.log(`旧别名：${model.legacyAliases.join("；") || "无"}`);
}

function printExperiment(identifier) {
  if (!identifier) {
    fail("缺少实验 ID（M2_MODEL_QUERY_ARGUMENT_REQUIRED）。");
  }
  const normalized = identifier.toLowerCase();
  const experiment = registry.experiments.find((item) => (
    item.experimentId.toLowerCase() === normalized
  ));
  if (!experiment) {
    fail(`未找到实验（M2_MODEL_QUERY_EXPERIMENT_NOT_FOUND）：${identifier}`);
  }
  console.log(
    `${experiment.displayNameZh}（${experiment.displayNameEn}，`
      + `${experiment.experimentId}）`
  );
  for (const arm of experiment.arms) {
    console.log(
      `- ${arm.displayNameZh} / ${arm.armId}`
        + `（${experiment.experimentId}/${arm.armId}；`
        + `${arm.executionStatus}；模型 ${arm.modelId ?? "无独立模型 ID"}）`
    );
  }
}

function printExplanation(identifier) {
  if (!identifier) {
    fail("缺少待解释编号（M2_MODEL_QUERY_ARGUMENT_REQUIRED）。");
  }
  const result = explainM2Identifier(registry, identifier);
  if (
    result.models.length === 0
    && result.nonModels.length === 0
    && result.arms.length === 0
  ) {
    fail(`未找到编号（M2_MODEL_QUERY_IDENTIFIER_NOT_FOUND）：${identifier}`);
  }
  console.log("编号查询的所有登记含义（含完整作用域）：");
  for (const model of result.models) {
    console.log(
      `- 模型：${model.displayNameZh}（${model.displayNameEn}，`
        + `${model.stableModelId}；${roleZh(model.currentRole)}，`
        + `${model.currentRole}）`
    );
  }
  for (const { experiment, arm } of result.arms) {
    console.log(
      `- 实验臂：${experiment.displayNameZh} / ${arm.armId}`
        + `（${experiment.experimentId}/${arm.armId}；`
        + `${arm.displayNameZh}；${arm.executionStatus}）`
    );
  }
  for (const item of result.nonModels) {
    console.log(
      `- 非模型：${item.displayNameZh}（namespace ${item.namespace}；`
        + `${item.type}）——${item.meaningZh}`
    );
  }
}

function printComparison(left, right) {
  const comparison = compareM2ModelRegistryEntries(
    registry,
    left.stableModelId,
    right.stableModelId
  );
  console.log(
    `${left.displayNameZh}（${left.stableModelId}） vs `
      + `${right.displayNameZh}（${right.stableModelId}）`
  );
  if (!comparison.comparable) {
    console.log("结论：不能直接排名（M2_MODEL_COMPARISON_REFUSED）。");
    for (const difference of comparison.differences) {
      console.log(
        `- ${difference.field} 不同：`
          + `${JSON.stringify(difference.left)} / `
          + `${JSON.stringify(difference.right)}`
      );
    }
    return;
  }
  console.log(
    "结论：只能在下列明确相同可比组内比较，不形成跨人口统一冠军"
      + "（M2_MODEL_COMPARISON_SCOPED）。"
  );
  for (const pair of comparison.pairs) {
    const winner = pair.left.WAPE === pair.right.WAPE
      ? "并列"
      : pair.left.WAPE < pair.right.WAPE
        ? left.stableModelId
        : right.stableModelId;
    console.log(
      `- ${pair.left.comparableGroupId}：`
        + `${left.stableModelId} WAPE ${formatMetric(pair.left.WAPE)}；`
        + `${right.stableModelId} WAPE ${formatMetric(pair.right.WAPE)}；`
        + `组内较低者 ${winner}`
    );
  }
}

function requireOneModel(identifier) {
  if (!identifier) {
    fail("缺少模型 ID 或别名（M2_MODEL_QUERY_ARGUMENT_REQUIRED）。");
  }
  const matches = findM2ModelsByAlias(registry, identifier);
  if (matches.length === 0) {
    fail(`未找到模型（M2_MODEL_QUERY_MODEL_NOT_FOUND）：${identifier}`);
  }
  if (matches.length > 1) {
    fail(`模型别名不唯一（M2_MODEL_QUERY_ALIAS_AMBIGUOUS）：${identifier}`);
  }
  return matches[0];
}

function printHelp() {
  console.log("M2 模型登记查询（只读）：");
  console.log("  status");
  console.log("  list");
  console.log("  show <stable-id-or-alias>");
  console.log("  aliases <stable-id-or-alias>");
  console.log("  experiment <experiment-id>");
  console.log("  explain <identifier>");
  console.log("  compare <left-model> <right-model>");
  console.log("  catalog");
}

function formatMetric(value, resultStatus = "") {
  if (value !== null) {
    return Number(value).toFixed(8);
  }
  return /NOT_EXECUTED/u.test(resultStatus)
    ? "未执行（null）"
    : "未登记（null）";
}

function entityTypeZh(value) {
  return {
    model: "模型",
    model_family: "模型族",
    model_pipeline: "选定管线"
  }[value] ?? "登记实体";
}

function capabilityZh(value) {
  return {
    WORK: "作品点预测",
    PORT: "组合预测",
    BASE: "研究基线族",
    CHAN: "渠道预测"
  }[value] ?? "其他能力";
}

function targetZh(value) {
  return {
    future_sales_share_cash: "未来分成收入现金",
    future_bill_cash: "历史未来账单现金",
    formal_cash: "历史正式现金",
    historical_target: "历史目标",
    legacy_buyout_target: "已废弃买断目标"
  }[value] ?? "登记目标";
}

function grainZh(value) {
  return {
    work_origin_horizon: "作品×预测起点×horizon",
    portfolio_origin_horizon: "组合×预测起点×horizon",
    work_origin_horizon_channel_month: "作品×起点×horizon×渠道×月份"
  }[value] ?? "登记粒度";
}

function roleZh(value) {
  return {
    operational_work_fallback: "现行运行回退",
    research_work_baseline: "研究比较基线",
    portfolio_reference: "组合级参考",
    comparator_only: "仅作比较",
    rejected_development_candidate: "已拒绝开发候选",
    failed_development_candidate: "已执行失败候选",
    failed_research_candidate: "已执行失败研究候选",
    rejected_pipeline_safe_fallback: "已拒绝且安全回退的管线",
    regression_baseline_family: "回归比较基线族",
    rejected_posthoc_diagnostic: "已拒绝后验诊断",
    rejected_comparator: "已拒绝比较模型",
    human_formula_comparator: "人工公式比较模型",
    rejected_nested_layer: "已拒绝嵌套层",
    failed_channel_development_model: "已执行失败渠道模型",
    blocked_model_family_no_candidate_outcome: "阻断且无候选结果",
    archive_only_failed_model: "仅历史审计且已失败"
  }[value] ?? "登记角色";
}

function operationalStatusZh(value) {
  if (/blocked/u.test(value)) {
    return "因前置条件不满足而阻断";
  }
  if (/failed|rejected/u.test(value)) {
    return "已执行但未通过";
  }
  if (/fallback/u.test(value)) {
    return "开发回退，尚未成熟";
  }
  return "登记运行状态";
}

function resultStatusZh(value) {
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

function fail(message) {
  console.error(message);
  process.exit(1);
}
