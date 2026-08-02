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
  printRole("兼容性现行运行回退模型", "operationalWorkFallback");
  printRole("研究比较基线", "researchWorkBaseline");
  printRole("组合级参考", "portfolioReference");
  printRole("活动候选", "activeCandidate");
  printRole("自动化批准模型", "approvedForAutomation");
  const activeExperiment = registry.experiments.find(
    (item) => item.experimentId === registry.currentRoles.activeExperiment
  );
  console.log(
    activeExperiment === undefined
      ? "当前实验：无（null）。"
      : `当前实验：${activeExperiment.displayNameZh}（`
        + `${activeExperiment.displayNameEn}，`
        + `${activeExperiment.experimentId}；`
        + `${resultStatusZh(activeExperiment.resultStatus)}，`
        + `${activeExperiment.resultStatus}）。`
  );
  const blockedExperiment = registry.experiments.find(
    (item) => item.experimentId === registry.currentRoles.blockedExperiment
  );
  const blockedStatus = blockedExperiment?.hpsr02IndependentEvaluation
    ?.status ?? blockedExperiment?.resultStatus;
  console.log(
    blockedExperiment === undefined
      ? "当前阻断实验：无（null）。"
      : `当前阻断实验：${blockedExperiment.displayNameZh}（`
        + `${blockedExperiment.displayNameEn}，`
        + `${blockedExperiment.experimentId}；`
        + `${resultStatusZh(blockedStatus)}，${blockedStatus}）。`
  );
  const pendingExperiment = registry.experiments.find(
    (item) => item.experimentId === registry.currentRoles.pendingExperiment
  );
  console.log(
    pendingExperiment === undefined
      ? "当前待门禁实验：无（null）。"
      : `当前待门禁实验：${pendingExperiment.displayNameZh}（`
        + `${pendingExperiment.displayNameEn}，`
        + `${pendingExperiment.experimentId}；`
        + `${resultStatusZh(pendingExperiment.resultStatus)}，`
        + `${pendingExperiment.resultStatus}）。`
  );
  console.log(`当前状态索引：${registry.currentRoles.latestStateIndex}`);
  console.log("本次只读查询模型执行次数：0。");
  console.log(`当前角色解释：${registry.currentRoles.roleInterpretationZh}`);
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
    model_revision: "模型修订",
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
    future_sales_share_development_modelable_cash:
      "未来分成收入开发可建模现金",
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
    operational_work_fallback: "兼容性现行运行回退",
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
    blocked_development_model_no_candidate_outcome:
      "开发执行阻断且无候选结果",
    blocked_execution_incomplete_no_candidate_outcome:
      "真实执行不完整且无候选结果",
    development_model_recovery_ready_no_private_outcome:
      "恢复就绪且尚无真实私有结果",
    preregistered_exploratory_candidate_not_executed:
      "探索性候选已预注册但尚未执行",
    implemented_exploratory_candidate_not_executed:
      "探索性候选已实现并通过合成验证但尚未执行",
    inactive_development_candidate_not_evaluated:
      "开发候选核心已实现、尚未评价且未激活",
    implemented_awaiting_independent_evaluation:
      "已实现并等待独立评价",
    retrospective_development_unsupported_stop_before_independent_k2:
      "回溯开发评价不支持并在独立评价前停止",
    blocked_source_authority_decision_required_not_active:
      "冻结边界来源权威冲突，等待明确决策且未激活",
    first_independent_inconclusive_cash_only_research_ended_not_active:
      "首个独立起点证据不足，现金相邻研究结束且未激活",
    archive_only_failed_model: "仅历史审计且已失败"
  }[value] ?? "登记角色";
}

function operationalStatusZh(value) {
  if (value === "not_executed_not_promoted") {
    return "尚未执行且未晋升";
  }
  if (value === "implemented_not_executed_not_promoted") {
    return "已实现，尚未执行且未晋升";
  }
  if (
    value
      === "implemented_public_synthetic_verified_"
        + "not_independently_evaluated_not_selected_not_production"
  ) {
    return "已实现并通过公共合成验证，尚未独立评价、选择或进入生产";
  }
  if (
    value
      === "recovery_authorized_until_first_valid_complete_outcome_"
        + "no_private_result_yet"
  ) {
    return "恢复已授权，尚无真实私有结果";
  }
  if (
    value
      === "cash_only_adjacent_research_ended_"
        + "not_active_not_production"
  ) {
    return "现金相邻研究已结束，未激活且未进入生产";
  }
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
  if (value === "FROZEN_SAME_CASE_BASELINE_FIRST_INDEPENDENT") {
    return "首个独立起点冻结同案例基线";
  }
  if (value === "HISTORICAL_STRUCTURE_COMPARATOR_FIRST_INDEPENDENT") {
    return "首个独立起点冻结历史结构对照";
  }
  if (
    value
      === "M2_HPSR02_FROZEN_PARAMETER_AUTHORITY_DECIDED_"
        + "PENDING_PRIVATE_INTEGRITY_GATE"
  ) {
    return "不可变冻结参数权威已决定，等待私有完整性门禁";
  }
  if (
    value === "M2_HPSR02_FIRST_INDEPENDENT_SUPPORTED_FOR_SECOND_CONFIRMATION"
  ) {
    return "首个独立起点支持，仅可等待另行授权的第二次确认";
  }
  if (
    value
      === "M2_HPSR02_FIRST_INDEPENDENT_NOT_SUPPORTED_"
        + "CASH_ONLY_RESEARCH_ENDED"
  ) {
    return "首个独立起点不支持，现金邻接研究结束";
  }
  if (
    value
      === "M2_HPSR02_FIRST_INDEPENDENT_INCONCLUSIVE_"
        + "CASH_ONLY_RESEARCH_ENDED"
  ) {
    return "首个独立起点证据不足，现金邻接研究结束";
  }
  if (
    value
      === "M2_HPSR02_BLOCKED_ACTIONABLE_"
        + "SOURCE_AUTHORITY_DECISION_REQUIRED"
  ) {
    return "冻结边界来源权威冲突，等待一项明确决策";
  }
  if (
    value
      === "M2_CHAM01_PRIMARY_CORE90_NUMERIC_STABILITY_FAIL_"
        + "FINITE_EXTREME_EXTRAPOLATION"
  ) {
    return "有限极端外推导致数值稳定性失败";
  }
  if (value === "M2_LG01_HEAD_CASH_RESIDUAL_PREREGISTERED_NOT_EXECUTED") {
    return "已预注册且尚未执行";
  }
  if (
    value
      === "M2_LG01_HEAD_CASH_RESIDUAL_"
        + "IMPLEMENTED_SYNTHETIC_VERIFIED_OUTER_UNREAD"
  ) {
    return "已实现并通过合成验证且外层结果未读取";
  }
  if (value === "M2_LG01_HEAD_CASH_RESIDUAL_FAIL") {
    return "LG01 头部现金残差校准开发失败";
  }
  if (
    value
      === "M2_HEAD_PROTECTED_SEGMENTED_ROUTER_WAITING_FOR_NEW_BILLS"
  ) {
    return "头部保护分段路由等待新账单且尚未执行";
  }
  if (
    value
      === "M2_HEAD_PROTECTED_SEGMENTED_ROUTER_"
        + "IMPLEMENTED_AWAITING_LATER_ORIGIN_DATA"
  ) {
    return "头部保护分段路由已实现并等待独立 later-origin 数据";
  }
  if (
    value
      === "M2_HPSR01_RETROSPECTIVE_DEVELOPMENT_"
        + "UNSUPPORTED_STOP_BEFORE_K2"
  ) {
    return "头部保护分段路由回溯开发评价不支持并在独立评价前停止";
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

function fail(message) {
  console.error(message);
  process.exit(1);
}
