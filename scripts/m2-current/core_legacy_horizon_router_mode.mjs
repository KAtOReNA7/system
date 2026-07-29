import {
  mkdir,
  readFile,
  writeFile
} from "node:fs/promises";
import path from "node:path";

import {
  buildM2CoreLegacyK0CapabilityReport
} from "../../src/domain/m2Current/coreLegacyHorizonRouter.js";

const CONFIG_PATH =
  "config/m2-current-core-legacy-horizon-router.v0.1.json";
const REGISTRY_PATH = "config/m2-model-registry.v1.json";
const PRIOR_RESCORE_PATH =
  "docs/analysis/m2-current/M2-core-legacy-frozen-rescore-v0.1.json";

export async function runM2CoreLegacyHorizonRouterK0({
  root,
  verify = false
}) {
  const [config, registry, priorRescore] = await Promise.all([
    readJson(path.join(root, CONFIG_PATH)),
    readJson(path.join(root, REGISTRY_PATH)),
    readJson(path.join(root, PRIOR_RESCORE_PATH))
  ]);
  assertAuthorityBindings({ config, registry, priorRescore });
  const report = buildM2CoreLegacyK0CapabilityReport(config);
  const outputs = new Map([
    [
      config.publicOutputs.capabilityMatrixJson,
      `${JSON.stringify(report, null, 2)}\n`
    ],
    [
      config.publicOutputs.capabilityMatrixReport,
      renderCapabilityMatrixReport(report)
    ],
    [
      config.publicOutputs.replayContractReport,
      renderFrozenReplayContractReport(report)
    ]
  ]);
  for (const [relativePath, content] of outputs) {
    const outputPath = path.join(root, relativePath);
    if (verify) {
      if (await readFile(outputPath, "utf8") !== content) {
        throw new Error(
          `m2_core_legacy_horizon_router_k0_drift:${relativePath}`
        );
      }
      continue;
    }
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, content, "utf8");
  }
  process.stdout.write(
    verify
      ? "M2 core legacy horizon-router K0 evidence verified.\n"
      : "M2 core legacy horizon-router K0 evidence written.\n"
  );
  return report;
}

function assertAuthorityBindings({ config, registry, priorRescore }) {
  if (
    registry?.currentRoles?.operationalWorkFallback
      !== config.roles.operationalWorkFallback
    || registry?.currentRoles?.researchWorkBaseline
      !== config.roles.researchWorkBaseline
    || registry?.currentRoles?.activeCandidate !== null
    || registry?.currentRoles?.approvedForAutomation !== null
  ) {
    throw new Error(
      "m2_core_legacy_horizon_router_registry_role_drift"
    );
  }
  if (
    priorRescore?.status
      !== "K1_FROZEN_MODEL_CORRECT_POPULATION_RESCORE_COMPLETE"
    || priorRescore?.rebuildAudit?.learnedGlobal
      ?.maximumAbsoluteReconstructionDifference !== 0
    || priorRescore?.boundaries?.modelTrainingPerformed !== false
  ) {
    throw new Error(
      "m2_core_legacy_horizon_router_prior_frozen_evidence_invalid"
    );
  }
  const registryModelIds = new Set(
    (registry?.models ?? []).map((model) => model.stableModelId)
  );
  for (const model of config.models) {
    if (!registryModelIds.has(model.modelId)) {
      throw new Error(
        `m2_core_legacy_horizon_router_model_unregistered:${model.modelId}`
      );
    }
  }
}

function renderCapabilityMatrixReport(value) {
  const rows = value.capabilityMatrix.map((cell) => (
    `| ${modelName(cell)} | ${familyName(cell.evaluationFamily)} `
      + `(\`${cell.evaluationFamily}\`) | ${cell.horizonMonths} | `
      + `${grainName(cell.grain)} (\`${cell.grain}\`) | `
      + `\`${cell.status}\` | \`${cell.reason}\` | `
      + `${cell.replayIfCacheMissing
        ? `\`${cell.replayIfCacheMissing}\``
        : "—"} |`
  )).join("\n");
  return `# M2 核心老品全周期模型能力矩阵 v0.1

## 结论

本检查点属于实验“${value.experiment.displayNameZh}”
（${value.experiment.displayNameEn}，\`${value.experiment.stableExperimentId}\`）的
能力合同阶段（\`${value.status}\`）。48 个
“模型 × 评价族 × horizon × 粒度”单元均已显式分类；缺失输出没有填零，
也没有执行模型训练、参数复制或 private evaluation。

- 作品发生—金额校准模型 v0.3
  （Occurrence-Amount Calibration v0.3，\`M2-WORK-OA03\`）只有
  Primary rolling 的 3/6/12 个月作品总额冻结行；Strict rolling 的原始 fold
  证据不足，36 个月及作品×渠道粒度不属于其模型合同。
- 人工锚定可学习全局模型
  （Human-Anchored Learned Global，\`M2-WORK-LG01\`）已有 Primary 36 个月
  与 Strict 3/6/12 个月冻结行。把 Primary 36 个月选出的参数用于
  Primary 3/6/12 个月会构成被禁止的跨 horizon 参数复制；Strict 36 个月没有
  冻结窗口内成熟的选择起点，因此均记为不可重建（\`NOT_RECONSTRUCTABLE\`）。
- 核心收入人工规则基线 v0.1
  （Core-Revenue Manual Rule Baseline v0.1，\`M2-WORK-CRMR01\`）已有
  Primary 全 horizon 与 Strict 3/6/12 个月两种粒度冻结行；Strict 36 个月
  缺少成熟评价起点。

## 完整矩阵

| 模型 | 评价族 | horizon（月） | 粒度 | 当前状态 | 原因 | 缓存丢失时 |
| --- | --- | ---: | --- | --- | --- | --- |
${rows}

## HEAD 身份

- 首次有效 private evaluation 的代码身份（\`evaluationHead\`）尚未赋值；
  它必须是本检查点提交并通过 Linux/Windows exact-head CI 后的远端 HEAD。
- 最终文档身份（\`finalDocumentationHead\`）尚未赋值；它必须是包含最终报告、
  Model Registry、中文目录和新状态索引的最终远端 HEAD。
- 两者不得互相冒充，也不得预先写死到长期合同。

## 边界

当前模型角色不变：现行运行回退仍为作品发生—金额校准模型 v0.3
（Occurrence-Amount Calibration v0.3，\`M2-WORK-OA03\`），研究比较基线仍为
人工锚定可学习全局模型（Human-Anchored Learned Global，
\`M2-WORK-LG01\`）；活动候选（\`activeCandidate\`）和自动化批准
（\`approvedForAutomation\`）均为空。
`;
}

function renderFrozenReplayContractReport(value) {
  const contract = value.deterministicReplayContract;
  const allowed = contract.allowed.map((item) => (
    `- ${replayRuleName(item)}（\`${item}\`）`
  )).join("\n");
  const forbidden = contract.forbidden.map((item) => (
    `- ${replayRuleName(item)}（\`${item}\`）`
  )).join("\n");
  return `# M2 核心老品冻结预测确定性重建合同 v0.1

## 合同身份

本合同的稳定 ID 为 \`${contract.contractId}\`，服务于实验
“${value.experiment.displayNameZh}”
（${value.experiment.displayNameEn}，\`${value.experiment.stableExperimentId}\`）。
它只允许恢复冻结预测缓存，不授予训练、调参、新模型或 production 权限。

## 允许

${allowed}

## 禁止

${forbidden}

## 完整性判定

重放身份由模型、评价族、origin、horizon、作品、渠道与 fold as-of 共同绑定；
冻结行与重放行的最大允许数值差为 \`${contract.maximumNumericDifference}\`。
Git ignored 派生缓存缺失不是阻断，历史 receipt 缺失也不是阻断；只有权威账单、
作品映射或 canonical 渠道主表缺失才可阻断所属能力。

缺少原 horizon 的 fold 参数、成熟选择起点或模型粒度支持时，必须分别报告
\`NOT_RECONSTRUCTABLE\` 或 \`UNSUPPORTED_BY_MODEL_CONTRACT\`，不得用 0、公开汇总
反推值或其他 horizon 参数代替。
`;
}

function modelName(cell) {
  return `${cell.displayNameZh}（${cell.displayNameEn}，`
    + `\`${cell.modelId}\`）`;
}

function familyName(value) {
  return value === "PRIMARY_ROLLING"
    ? "主滚动评价"
    : "严格滚动评价";
}

function grainName(value) {
  return value === "WORK_TOTAL" ? "作品总额" : "作品×渠道";
}

function replayRuleName(value) {
  return ({
    original_frozen_formula: "仅使用原冻结公式",
    original_parameter_grid: "仅使用原冻结参数网格",
    original_rolling_training_contract: "仅使用原滚动训练合同",
    training_rows_visible_at_each_original_fold_as_of:
      "每个 fold 只读取当时可见训练行",
    original_fold_refit_to_restore_missing_cache_rows:
      "只为恢复缓存执行原 fold 拟合",
    parameter_change: "修改参数",
    parameter_grid_expansion: "扩大参数网格",
    new_feature: "新增特征",
    fallback_change: "修改 fallback",
    post_result_parameter_selection: "根据本轮结果选择参数",
    cross_horizon_parameter_copy: "跨 horizon 复制参数",
    row_level_prediction_inference_from_public_aggregate:
      "从公开汇总反推行级预测"
  })[value] ?? value;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}
