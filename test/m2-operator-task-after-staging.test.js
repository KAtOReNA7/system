import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

test("M2 after-staging operator task summary requires standard_work_id feedback key", () => {
  const summary = readJson("docs/analysis/m2-real-data/M2-operator-task-pack-after-dual-source-staging-v2-summary.json").payload;

  assert.equal(summary.taskRows, 30);
  assert.equal(summary.systemRows, 20);
  assert.equal(summary.userReservedRows, 5);
  assert.equal(summary.highRiskRows, 5);
  assert.equal(summary.hasStandardWorkIdColumn, true);
  assert.equal(summary.canRoundTripUserFeedbackByStandardWorkId, true);
  assert.equal(summary.matchedByOldAnonymousTaskCard, false);
  assert.equal(summary.publicReportSanitized, true);
  assert.equal(summary.gitignored, true);
});

test(
  "M2 after-staging private operator source contains standard_work_id and private columns",
  { skip: !existsSync("data/private-output/m2-business-review/m2-v1.1-30-work-operator-task-pack-cn-after-dual-source-staging-v2-source.json") },
  () => {
    const source = readJson("data/private-output/m2-business-review/m2-v1.1-30-work-operator-task-pack-cn-after-dual-source-staging-v2-source.json");
    const taskSheet = source.sheets.find((sheet) => sheet.name === "01_运营任务卡");
    assert.ok(taskSheet);
    assert.equal(taskSheet.rows.length, 30);
    const firstRealRow = taskSheet.rows.find((row) => row.样本来源 !== "用户指定作品");
    assert.ok(firstRealRow);
    assert.ok("standard_work_id" in firstRealRow);
    assert.ok("作品名" in firstRealRow);
    assert.ok("作者" in firstRealRow);
    assert.ok("来源分组" in firstRealRow);
    assert.ok("staging补全字段" in firstRealRow);
    assert.ok("预测输出类型" in firstRealRow);
    assert.ok("版权期内预测" in firstRealRow);
    assert.ok("运营窗口预测" in firstRealRow);
    assert.ok("预测置信度" in firstRealRow);
    assert.ok("回测摘要" in firstRealRow);
    assert.ok("风险" in firstRealRow);
    assert.ok("运营建议" in firstRealRow);
    assert.ok("辅助原始forecastOutputType" in firstRealRow);
  }
);

test("M2 after-staging random 20 summary separates copyright-term and operating-window forecasts", () => {
  const summary = readJson("docs/analysis/m2-real-data/M2-random-20-year-evaluation-after-dual-source-staging-v2-summary.json").payload;

  assert.equal(summary.rowCount, 20);
  assert.ok(summary.stagingAffectedRows > 0);
  assert.ok(summary.copyrightTermForecastRows > 0);
  assert.ok(summary.operatingWindowRows >= 0);
  assert.equal(summary.publicReportSanitized, true);
  assert.equal(summary.gitignored, true);
});
