import assert from "node:assert/strict";
import test from "node:test";

import { parseCopyrightDate, remainingMonthsUntil } from "../src/domain/oldProductEvaluation/copyrightDateParser.js";
import {
  normalizeAuthor,
  normalizeTitle,
  parseAudioRights,
  parseCategoryCandidates,
  parseLedgerRow
} from "../src/domain/oldProductEvaluation/copyrightLedgerParser.js";

test("parses Excel serial dates", () => {
  assert.equal(parseCopyrightDate(45292).normalizedDate, "2024-01-01");
});

test("parses infinite copyright terms", () => {
  const parsed = parseCopyrightDate("永久授权/无期限");
  assert.equal(parsed.expiryType, "infinite");
  assert.equal(parsed.parserStatus, "parsed");
});

test("parses relative terms from publication date", () => {
  const parsed = parseCopyrightDate("出版之日起5年的12月31日");
  assert.equal(parsed.expiryType, "relative_term");
  assert.equal(parsed.anchor, "publication_date");
  assert.equal(parsed.years, 5);
  assert.equal(parsed.endOfYear, true);
  assert.equal(parsed.requiresManualReview, true);
});

test("prefers audio date in multi-date text", () => {
  const parsed = parseCopyrightDate("电子2028/08/10，有声2024/12/21");
  assert.equal(parsed.normalizedDate, "2024-12-21");
  assert.deepEqual(parsed.extractedDates, ["2028-08-10", "2024-12-21"]);
});

test("marks auto renewal for manual review", () => {
  const parsed = parseCopyrightDate("2028-08-10 到期后自动续约一年");
  assert.equal(parsed.expiryType, "auto_renewal");
  assert.equal(parsed.parserStatus, "parsed_with_condition");
});

test("normalizes title weak edition differences", () => {
  const parsed = normalizeTitle("《 示例书名：修订版 》");
  assert.equal(parsed.normalized, "示例书名:");
  assert.deepEqual(parsed.weakDifferenceFlags, ["修订版"]);
});

test("normalizes and splits multiple authors", () => {
  const parsed = normalizeAuthor("张三、李四 and 王五");
  assert.deepEqual(parsed.normalizedTokens, ["张三", "李四", "王五"]);
  assert.equal(parsed.multiAuthor, true);
});

test("parses product line as classification candidate only", () => {
  const parsed = parseCategoryCandidates({ 产品线: "社科/历史", CIP: "历史类" });
  assert.equal(parsed.classificationConfidence, "medium");
  assert.equal(parsed.candidates[0].level1, "出版物");
  assert.equal(parsed.candidates[0].confidence, "medium");
});

test("parses audio rights fields", () => {
  const parsed = parseAudioRights({ 有声使用权: "有", 有声改编权: "无", 独家: "是" });
  assert.equal(parsed.audioRightsStatus, "granted");
  assert.equal(parsed.exclusive, true);
});

test("parses full ledger row without exposing external data", () => {
  const parsed = parseLedgerRow(
    {
      作品ID: "Y123",
      出版书名: "《测试作品》",
      作者署名: "甲、乙",
      签订日期: "2024/1/2",
      到期时间: "出版之日起3年",
      产品线: "出版物",
      有声使用权: "有"
    },
    2
  );
  assert.equal(parsed.workId, "Y123");
  assert.equal(parsed.publicationTitle.normalized, "测试作品");
  assert.equal(parsed.authors.display.normalizedTokens.length, 2);
  assert.equal(parsed.signedDate.normalizedDate, "2024-01-02");
  assert.equal(parsed.expiryDate.expiryType, "relative_term");
});

test("computes remaining months for exact date", () => {
  assert.equal(remainingMonthsUntil("2026-08-25", new Date(Date.UTC(2026, 5, 25))), 2);
});
