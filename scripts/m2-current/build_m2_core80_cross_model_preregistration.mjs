import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  statSync,
  writeFileSync
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertCmx01PublicSafe,
  buildCmx01OriginGrid,
  sha256Canonical,
  validateCmx01Preregistration
} from "../../src/domain/m2Current/core80CrossModelEvaluation.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CONTRACT_PATH = "config/m2-core80-cross-model-evaluation.v0.1.json";
const REGISTRY_PATH = "config/m2-model-registry.v1.json";
const BUSINESS_PATH = "config/m2-business-acceptance-contract.v1.json";
const CORE_POPULATION_PATH = "config/m2-current-core-legacy-population.v0.1.json";
const IMPLEMENTATION_PATH =
  "src/domain/m2Current/core80CrossModelEvaluation.js";
const OUTPUTS = Object.freeze({
  preregJson:
    "docs/analysis/m2-current/M2-core80-cross-model-pre-registration-v0.1.json",
  preregMd:
    "docs/analysis/m2-current/M2-core80-cross-model-pre-registration-v0.1.md",
  eligibilityJson:
    "docs/analysis/m2-current/M2-core80-cross-model-eligibility-audit-v0.1.json",
  eligibilityMd:
    "docs/analysis/m2-current/M2-core80-cross-model-eligibility-audit-v0.1.md"
});

const write = process.argv.includes("--write");
const verify = process.argv.includes("--verify");
if (write === verify) {
  throw new Error("m2_cmx01_choose_exactly_one_of_write_or_verify");
}

const contract = readJson(CONTRACT_PATH);
const registry = readJson(REGISTRY_PATH);
const validation = validateCmx01Preregistration({
  preregistration: contract,
  registry
});
const grid = buildCmx01OriginGrid(contract.evaluationWindow);
const eligibility = buildEligibilityAudit(contract, registry);
const preregistration = buildPreregistration(contract, grid, validation);
const artifacts = Object.freeze({
  [OUTPUTS.preregJson]: jsonText(preregistration),
  [OUTPUTS.preregMd]: renderPreregistration(preregistration),
  [OUTPUTS.eligibilityJson]: jsonText(eligibility),
  [OUTPUTS.eligibilityMd]: renderEligibility(eligibility)
});

for (const [path, content] of Object.entries(artifacts)) {
  assertCmx01PublicSafe(content);
  const absolute = resolve(ROOT, path);
  if (write) {
    writeFileSync(absolute, content, "utf8");
  } else {
    if (!existsSync(absolute)) {
      throw new Error(`m2_cmx01_public_artifact_missing:${path}`);
    }
    if (readFileSync(absolute, "utf8") !== content) {
      throw new Error(`m2_cmx01_public_artifact_stale:${path}`);
    }
  }
}

console.log(JSON.stringify({
  status: write
    ? "M2_CMX01_PRE_OUTCOME_CONTRACT_WRITTEN"
    : "M2_CMX01_PRE_OUTCOME_CONTRACT_VERIFIED",
  registryModelCount: eligibility.registryModelCount,
  formalEligibleModelCount: eligibility.summary.formalEligibleModelCount,
  retrospectiveDiagnosticModelCount:
    eligibility.summary.retrospectiveDiagnosticModelCount,
  originHorizonCellCount: grid.cells.length,
  outputs: Object.keys(artifacts)
}, null, 2));

function buildPreregistration(source, originGrid, contractValidation) {
  const artifactDigests = Object.freeze({
    preregistrationContractSha256: sha256File(CONTRACT_PATH),
    modelRegistrySha256: sha256File(REGISTRY_PATH),
    businessAcceptanceContractSha256: sha256File(BUSINESS_PATH),
    corePopulationContractSha256: sha256File(CORE_POPULATION_PATH),
    evaluationImplementationSha256: sha256File(IMPLEMENTATION_PATH)
  });
  return Object.freeze({
    ...source,
    schema: "m2.cmx01.public_preregistration.v0.1",
    status: "M2_CMX01_PREREGISTERED_BEFORE_NEW_OUTCOME_READ",
    publicArtifactType: "PRE_OUTCOME_CONTRACT",
    outcomeReadAtGeneration: false,
    validation: contractValidation,
    originGrid: {
      cellCount: originGrid.cells.length,
      countsByHorizon: originGrid.countsByHorizon,
      annualH12Origins: originGrid.annualH12Origins,
      firstCell: originGrid.cells[0],
      lastCell: originGrid.cells.at(-1)
    },
    artifactDigests,
    canonicalPayloadSha256: sha256Canonical({
      contract: source,
      originGrid: {
        countsByHorizon: originGrid.countsByHorizon,
        annualH12Origins: originGrid.annualH12Origins
      },
      artifactDigests
    })
  });
}

function buildEligibilityAudit(source, registry) {
  const decisions = new Map(source.eligibilityDecisions.map(
    (decision) => [decision.modelId, decision]
  ));
  const models = registry.models.map((model) => {
    const decision = decisions.get(model.stableModelId);
    if (!decision) {
      throw new Error(
        `m2_cmx01_registry_model_missing_decision:${model.stableModelId}`
      );
    }
    const codeArtifacts = (model.codeEntrypoints ?? []).map(inspectArtifact);
    const configArtifacts = (model.configEntrypoints ?? []).map(inspectArtifact);
    const commits = [...new Set(codeArtifacts
      .map((artifact) => artifact.firstAdditionCommit)
      .filter(Boolean))];
    return Object.freeze({
      modelId: model.stableModelId,
      modelVersion: inferVersion(model),
      displayNameZh: model.displayNameZh,
      displayNameEn: model.displayNameEn,
      objectType: model.entityType,
      target: model.target,
      predictionGrain: model.predictionGrain,
      originalGitCommits: commits,
      codeArtifacts,
      configArtifacts,
      artifactSetSha256: sha256Canonical({codeArtifacts, configArtifacts}),
      originalHorizonContract: model.horizonContract,
      originalInputSummary: model.inputSummaryEn,
      originalCurrentRole: model.currentRole,
      originalEvidenceStatus: model.evidenceStatus,
      originalOperationalStatus: model.operationalStatus,
      trainingOrFittingBoundary: decision.formalRankingEligible
        ? "ORIGINAL_ALGORITHM_INHERENT_ORIGIN_BOUNDED_FITTING_ONLY_NO_TUNING"
        : decision.diagnosticReplayPlanned
          ? "RETROSPECTIVE_DIAGNOSTIC_ONLY_NO_FORMAL_RANKING"
          : "NOT_EXECUTED",
      postOriginDataStatus:
        decision.status === "EXCLUDED_DATA_LEAKAGE_OR_ORIGIN_UNSAFE"
          ? "UNPROVEN_OR_POST_HOC_NOT_FORMAL_ORIGIN_SAFE"
          : decision.formalRankingEligible
            ? "REQUIRED_ORIGIN_VISIBLE_ONLY"
            : "NOT_APPLICABLE",
      deterministicReplayStatus: decision.formalRankingEligible
        ? "DETERMINISTIC_REPLAY_REQUIRED_AND_SYNTHETICALLY_TESTED"
        : decision.diagnosticReplayPlanned
          ? "DIAGNOSTIC_REPLAY_CONDITIONAL_ON_COMPLETE_INPUT_CONTRACT"
          : "NO_LEGAL_REPLAY_IN_THIS_CAMPAIGN",
      frozenPredictionReproductionDifference:
        "NOT_MEASURED_PRE_OUTCOME;_MUST_BE_REPORTED_IF_OVERLAP_EXISTS",
      ...decision
    });
  });
  const summary = {
    formalEligibleModelCount: models.filter(
      (model) => model.formalRankingEligible
    ).length,
    retrospectiveDiagnosticModelCount: models.filter(
      (model) => model.diagnosticReplayPlanned
        && !model.formalRankingEligible
    ).length,
    noReplayModelCount: models.filter(
      (model) => !model.diagnosticReplayPlanned
        && !model.formalRankingEligible
    ).length,
    countsByStatus: countBy(models, (model) => model.status)
  };
  const payload = {
    schema: "m2.cmx01.eligibility_audit.v0.1",
    asOf: source.asOf,
    campaignId: source.campaignId,
    status: "M2_CMX01_ELIGIBILITY_FROZEN_BEFORE_NEW_OUTCOME_READ",
    publicArtifactType: "PRE_OUTCOME_ELIGIBILITY_AUDIT",
    outcomeReadAtGeneration: false,
    registrySha256: sha256File(REGISTRY_PATH),
    registryModelCount: registry.models.length,
    registryEntryParity: true,
    summary,
    models,
    boundaries: {
      excludedModelDoesNotBlockOthers: true,
      portfolioModelsNeverAllocatedBackToWorks: true,
      missingPredictionNeverBecomesZero: true,
      rawCandidateNeverMaskedByFallback: true,
      psc02CandidateOutputExists: false,
      psc03ForensicOnlyNoRerun: true,
      hpsr02UniqueEvaluationPreservedNoRerun: true,
      finalHoldoutOpened: false,
      productionAuthorized: false,
      automationAuthorized: false,
      m3FormalAuthorized: false
    }
  };
  return Object.freeze({
    ...payload,
    canonicalPayloadSha256: sha256Canonical(payload)
  });
}

function inspectArtifact(path) {
  const normalized = String(path).replaceAll("\\", "/");
  const absolute = resolve(ROOT, normalized);
  const tracked = trackedFiles(normalized);
  const kind = existsSync(absolute) && statSync(absolute).isDirectory()
    ? "directory"
    : existsSync(absolute)
      ? "file"
      : tracked.length > 0
        ? "tracked_path_set"
        : "missing";
  return Object.freeze({
    path: normalized,
    kind,
    trackedFileCount: tracked.length,
    sha256: hashTrackedPath(normalized, tracked),
    firstAdditionCommit: firstAdditionCommit(normalized)
  });
}

function trackedFiles(path) {
  const result = runGit(["ls-files", "--", path]);
  return result.split(/\r?\n/u).filter(Boolean).sort();
}

function hashTrackedPath(path, tracked) {
  const absolute = resolve(ROOT, path);
  if (existsSync(absolute) && statSync(absolute).isFile()) {
    return createHash("sha256").update(readFileSync(absolute)).digest("hex");
  }
  if (tracked.length === 0) return null;
  const hash = createHash("sha256");
  for (const file of tracked) {
    hash.update(file, "utf8");
    hash.update("\0", "utf8");
    hash.update(readFileSync(resolve(ROOT, file)));
    hash.update("\0", "utf8");
  }
  return hash.digest("hex");
}

function firstAdditionCommit(path) {
  const result = runGit([
    "log",
    "--diff-filter=A",
    "--format=%H",
    "--reverse",
    "--",
    path
  ]);
  return result.split(/\r?\n/u).find(Boolean) ?? null;
}

function inferVersion(model) {
  const text = `${model.displayNameEn ?? ""} ${model.displayNameZh ?? ""}`;
  return text.match(/\bv\d+(?:\.\d+)*\b/iu)?.[0]
    ?? "REGISTRY_ENTRY_VERSION_UNSPECIFIED";
}

function renderPreregistration(value) {
  const decisions = value.eligibilityDecisions;
  const eligible = decisions.filter((row) => row.formalRankingEligible);
  return `# 2020–2025 Core80 全模型真实业务横评预注册 v0.1

> 英文原名：M2 Core80 Cross-Model Real-Business Evaluation v0.1；稳定活动 ID：\`M2-CMX01\`；机器状态码：\`${value.status}\`。

## 决策边界

这是结果打开前冻结的历史横评合同，不是模型开发、激活或生产授权。生成本文件时，新横评结果尚未读取（\`outcomeReadAtGeneration=false\`）。只允许模型原算法固有的逐起点拟合；禁止调参、新模型、按作品事后选模、未来实际 Core80、final holdout、production、automation、release 与 M3 formal。

## 权威与快照

- 模型名称、角色与可比人口唯一权威：\`${value.authority.modelRegistry}\`。
- 业务门槛唯一数值权威：\`${value.authority.businessAcceptanceContract}\`。
- actual：开发可建模冲销重述分成现金（\`${value.authority.actualDefinitionId}\`）。
- Registry 共 ${value.authority.modelRegistryEntryCount} 项，已逐项裁决；正式可排名登记项 ${eligible.length} 项。
- 私有源快照 ID：\`${value.sourceSnapshot.snapshotId}\`；只公开 SHA-256，不公开路径、身份或金额。
- 三条 2026-05 分成附加行保留，不删除；它们在 2020-01 至 2025-12 的评价 actual 窗口外。任何 target end 超过 2025-12 都必须失败关闭。

## 起点、周期与人口

- H3：${value.originGrid.countsByHorizon["3"]} 个完整月度起点；H6：${value.originGrid.countsByHorizon["6"]}；H12：${value.originGrid.countsByHorizon["12"]}；H36：${value.originGrid.countsByHorizon["36"]}；合计 ${value.originGrid.cellCount} 个起点×周期单元，不做季度抽样。
- 年度 H12 起点：${value.originGrid.annualH12Origins.map((origin) => `\`${origin}\``).join("、")}。
- 正式排名人口：起点可见动态 Core80（\`ORIGIN_VISIBLE_DYNAMIC_CORE80\`）。
- 补充诊断：年度实际 Core80（\`ANNUAL_ACTUAL_CORE80_HINDSIGHT_DIAGNOSTIC\`）与全部合格作品（\`ALL_ELIGIBLE_WORKS_DIAGNOSTIC\`），两者均不能单独选冠军。
- 每个起点按当时可见分成现金重算 Core80，保留阈值并列；作品及作品×渠道都至少有 3 个完整账单月。未来新作品、未来首次渠道和 Core 外尾部均弃权，不计作 0。

## 同案、渠道与缺失

同案必须同时匹配 origin、target start/end、horizon、work、population、actual、actual definition、canonical channel identity 与 feature cutoff。输出共同覆盖主榜、自身覆盖成绩和两两配对比较；缺失预测不补 0，也不允许不同覆盖率 WAPE 直接宣称冠军。

作品×渠道是强制交付。原生渠道、登记组合与公共分配器诊断分榜。公共分配器固定为当前范围复现实验的最近 12 月渠道份额分配臂（\`${value.channelIdentity.commonAllocator.allocatorId}\`）；所有作品模型使用同一分配器，必须精确回到作品总额，结果只标记组合诊断（\`COMPOSITE_DIAGNOSTIC\`）。

## 指标、门槛与统计

- 主要排序：WAPE；并列依次看绝对 signed bias、灾难窗数量、稳定变体 ID；不得临时加权成总分。
- 同时报告 predicted/actual、MAE、RMSE、sMAPE、非零 actual median APE、覆盖率、失败率、灾难数与误差集中度。
- 失败诊断：非零 actual 的 APE ≥100%；灾难诊断：APE ≥300%。两者不是新增淘汰门槛。
- 正式门槛只来自现行业务验收合同；H3/H6/H12/H36 的 WAPE 与绝对偏差上限不得事后修改。
- 配对 bootstrap：作品×forecast origin 联合分块，固定种子 ${value.bootstrap.seed}，${value.bootstrap.iterations} 次；必要时使用 Holm 多重比较修正。

## 公私边界与停止条件

Git 只保存满足隐私阈值（至少 ${value.privacy.publicMinimumCaseCount} 案、${value.privacy.publicMinimumWorkCount} 部）的匿名聚合。逐书、逐渠道、绝对金额、私有 ID、标题和本机路径只进入 Git ignored 能力目录。完成后只允许形成历史结论；即使识别出历史冠军，也必须同时标记 \`HISTORICAL_ONLY_NOT_ACTIVATED\`，不得修改 activeCandidate、approvedForAutomation、productionReady 或 finalHoldoutOpened。

## 内容绑定

- 预注册合同 SHA-256：\`${value.artifactDigests.preregistrationContractSha256}\`
- Model Registry SHA-256：\`${value.artifactDigests.modelRegistrySha256}\`
- 评价核心 SHA-256：\`${value.artifactDigests.evaluationImplementationSha256}\`
- canonical payload SHA-256：\`${value.canonicalPayloadSha256}\`
`;
}

function renderEligibility(value) {
  const rows = value.models.map((model) => (
    `| \`${model.modelId}\` | ${model.displayNameZh} | ${model.objectType} | ${model.predictionGrain} | \`${model.status}\` | ${model.formalRankingEligible ? "是" : "否"} | ${model.diagnosticReplayPlanned ? "是" : "否"} | \`${model.reasonCode}\` |`
  )).join("\n");
  return `# 2020–2025 Core80 全模型参赛资格审计 v0.1

> 英文活动：M2 Core80 Cross-Model Real-Business Evaluation v0.1；稳定活动 ID：\`M2-CMX01\`；机器状态码：\`${value.status}\`。

## 审计结论

结果打开前已逐项遍历 Model Registry 的 ${value.registryModelCount} 个登记项，登记项与裁决一一对应（\`registryEntryParity=true\`）。其中正式历史排名资格 ${value.summary.formalEligibleModelCount} 项；仅回溯诊断 ${value.summary.retrospectiveDiagnosticModelCount} 项；本活动不合法重放 ${value.summary.noReplayModelCount} 项。单个模型不合格不会阻断其他模型。

这里的“正式排名资格”只表示可以在本次历史同案横评中进入主榜，不表示 active candidate、automation、production、release 或 final holdout 授权。模型家族成员、实验臂与登记模型保持不同对象身份；例如经典基线族的成员必须带父模型 ID，核心老品分周期金额模型的局部臂不得裸写。

## 逐项裁决

| 稳定模型 ID | 中文名 | 对象类型 | 原始预测粒度 | 资格状态 | 正式排名 | 回溯诊断 | 结果前原因码 |
|---|---|---|---|---|---:|---:|---|
${rows}

## 重点冻结边界

- 出版行业渠道起点可见现金锚金额模型 v0.1（\`M2-CHAN-PSC02\`）：没有候选输出（\`EXCLUDED_NO_CANDIDATE_OUTPUT\`）。
- 出版行业渠道直接现金尺度条件金额模型 v0.1（\`M2-CHAN-PSC03\`）：冻结 raw 真实，但实现合同不一致，只进 forensic appendix（\`FORENSIC_ONLY_INVALID_CONTRACT\`），不得重跑。
- LG01 头部保护尾段修正模型 v0.2（\`M2-WORK-HPSR02\`）：唯一 2026-03 独立评价原样保留在近期共同窗口附录；现金-only 研究已结束，不重跑。
- 生命周期五状态模型（\`M2-WORK-LC01\`）、LG01 头部现金残差校准模型 v0.1（\`M2-WORK-HCRC01\`）和 LG01 头部保护分段路由模型 v0.1（\`M2-WORK-HPSR01\`）含事后选择或后来冻结边界，只能回溯诊断（\`EXCLUDED_DATA_LEAKAGE_OR_ORIGIN_UNSAFE\`），不得进入正式历史冠军裁决。
- 两个组合模型（\`M2-PORT-ETS01\`、\`M2-PORT-LRC01\`）粒度为 portfolio，禁止分配回作品并与作品模型混榜。
- 作品发生—金额校准模型 v0.3（\`M2-WORK-OA03\`）依赖没有独立生成入口的旧基础预测；冻结稀疏行仍保留，但无法合法扩展到本次完整月度网格。

## 可复现性账本

机器可读 JSON 对每项保存当前代码/config SHA-256、首次加入 Git 的提交、原始 horizon、拟合边界、origin 安全状态和冻结复现差异占位。所有差异在结果前均为 \`NOT_MEASURED_PRE_OUTCOME\`，不得预填或用旧结果冒充新横评。

- Model Registry SHA-256：\`${value.registrySha256}\`
- canonical payload SHA-256：\`${value.canonicalPayloadSha256}\`
`;
}

function countBy(values, keyFor) {
  const output = {};
  for (const value of values) {
    const key = keyFor(value);
    output[key] = (output[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(output).sort(
    ([left], [right]) => left.localeCompare(right)
  ));
}

function sha256File(path) {
  return createHash("sha256").update(
    readFileSync(resolve(ROOT, path))
  ).digest("hex");
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(ROOT, path), "utf8"));
}

function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function runGit(args) {
  return execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8"
  }).trim();
}

export const CMX01_PREREGISTRATION_OUTPUTS = OUTPUTS;
export const CMX01_REPOSITORY_ROOT = ROOT;
export function relativeToCmx01Root(path) {
  return relative(ROOT, resolve(path)).replaceAll("\\", "/");
}
