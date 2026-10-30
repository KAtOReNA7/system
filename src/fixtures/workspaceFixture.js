// Explicit, deterministic UI examples. No source authority or real work records.
export const WORKSPACE_FIXTURE_DATASET = Object.freeze({
  mode: "fixture",
  source: "workspace-synthetic-128-v1",
  syntheticOnly: true,
  notForFormalDecision: true,
  cutoffMonth: "2026-09",
  cashPeriodStart: "2025-10",
  cashDefinitionLabelZh: "合成示例：最近 12 个日历月中已观察月份的分成现金；不是真实账单"
});

const CATEGORIES = ["文学小说", "历史文化", "人文社科", "生活成长"];
const selected = [
  [1, "海边来信", "林予", "文学小说", 18, 3, 286400],
  [2, "山河慢行", "周禾", "历史文化", 24, 4, 194800],
  [3, "一城灯火", "沈砚", "文学小说", 12, 3, 126500],
  [4, "风经过的地方", "江宁", "文学小说", 8, 2, 98300],
  [5, "漫长的晴天", "许安", "文学小说", 2, 1, 42600],
  [7, "星河以北", "苏青", "人文社科", 16, 1, null]
];

function example([number, workName, authorName, category, months, channelCount, cash]) {
  const id = `DEMO-W${String(number).padStart(3, "0")}`;
  const pureBuyout = cash === null;
  const needsReview = number === 4 || (number > 7 && number % 11 === 0);
  return Object.freeze({
    id,
    standardWorkId: id,
    workName,
    authorName,
    category,
    completeBillMonths: months,
    channelCount,
    salesShareCash12Months: cash,
    cashType: pureBuyout ? "pure_buyout" : "sales_share",
    dataStatus: needsReview ? "needs_review" : "complete",
    businessStatus: pureBuyout ? "outside_scope" : needsReview ? "needs_review" : months < 3 ? "insufficient_history" : "not_evaluated",
    completeness: Object.freeze({ missingBasicInfoRecord: false, missingCoreFields: false, missingClassification: false }),
    reviewReason: needsReview ? "示例渠道映射待核对" : null,
    syntheticOnly: true
  });
}

const used = new Set(selected.map((row) => row[0]));
const remaining = Array.from({ length: 128 }, (_, index) => index + 1)
  .filter((number) => !used.has(number))
  .map((number) => [
    number,
    `合成作品 ${String(number).padStart(3, "0")}`,
    `示例作者 ${String(number).padStart(3, "0")}`,
    CATEGORIES[number % CATEGORIES.length],
    (number % 30) + 1,
    (number % 4) + 1,
    number % 19 === 0 ? null : 12000 + ((number * 7919) % 180000)
  ]);

export const WORKSPACE_FIXTURE_WORKS = Object.freeze([...selected, ...remaining].map(example));

export function fixtureMonthlyCash(work) {
  if (work.id === "DEMO-W001") {
    const amounts = [24000, 25000, 26500, 27900, 28000, 30000, 14000, 18000, 17000, 22000, 25000, 29000];
    return amounts.map((amount, index) => {
      const monthIndex = 9 + index;
      return { month: `${2025 + Math.floor(monthIndex / 12)}-${String((monthIndex % 12) + 1).padStart(2, "0")}`, amount, observationStatus: "SYNTHETIC_OBSERVED" };
    });
  }
  const observedCount = Math.min(12, work.completeBillMonths);
  const weights = Array.from({ length: observedCount }, (_, index) => 7 + ((index * 3) % 8));
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  let allocated = 0;
  return Array.from({ length: 12 }, (_, index) => {
    const monthIndex = 9 + index;
    const month = `${2025 + Math.floor(monthIndex / 12)}-${String((monthIndex % 12) + 1).padStart(2, "0")}`;
    if (work.cashType === "pure_buyout") return { month, amount: null, observationStatus: "OUTSIDE_SCOPE" };
    if (index < 12 - observedCount) return { month, amount: null, observationStatus: "NOT_OBSERVED" };
    const observedIndex = index - (12 - observedCount);
    const amount = index === 11 ? work.salesShareCash12Months - allocated : Math.floor(work.salesShareCash12Months * weights[observedIndex] / weightTotal);
    allocated += amount;
    return { month, amount, observationStatus: "SYNTHETIC_OBSERVED" };
  });
}
