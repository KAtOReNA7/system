import { WORKSPACE_FIXTURE_DATASET, WORKSPACE_FIXTURE_WORKS, fixtureMonthlyCash } from "../fixtures/workspaceFixture.js";
import { workspaceContext, workspaceList, workspaceOverview, workspacePredictions } from "./workspaceRepository.js";

export async function getWorkspaceContextFixture() {
  return workspaceContext(WORKSPACE_FIXTURE_DATASET);
}

export async function getWorkspaceOverviewFixture() {
  return workspaceOverview(WORKSPACE_FIXTURE_WORKS, WORKSPACE_FIXTURE_DATASET);
}

export async function listWorkspaceWorksFixture(_config, query) {
  return workspaceList(WORKSPACE_FIXTURE_WORKS, WORKSPACE_FIXTURE_DATASET, query);
}

export async function getWorkspaceWorkByIdFixture(_config, id) {
  const work = WORKSPACE_FIXTURE_WORKS.find((item) => item.id === id);
  if (!work) return null;
  return {
    ...workspaceContext(WORKSPACE_FIXTURE_DATASET),
    item: {
      ...work,
      monthlyCash: fixtureMonthlyCash(work),
      channels: Array.from({ length: work.channelCount }, (_, index) => ({ id: `DEMO-CHANNEL-${index + 1}`, name: `示例渠道 ${String.fromCharCode(65 + index)}` })),
      predictions: workspacePredictions(work),
      notices: [
        "作品、作者、渠道及现金均为合成示例，不来自真实账单。",
        ...(work.reviewReason ? [work.reviewReason] : []),
        ...(work.completeBillMonths < 3 ? ["历史不足 3 个完整账单月；未观察月份保持空值。"] : []),
        ...(work.cashType === "pure_buyout" ? ["纯买断位于 M2 分成现金预测范围之外，预测保持空值。"] : ["完整账单月数不等于动态 Core80 资格；本页未生成任何作品预测。"])
      ]
    }
  };
}
