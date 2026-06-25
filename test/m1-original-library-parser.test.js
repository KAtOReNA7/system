import assert from "node:assert/strict";
import test from "node:test";

import { recognizeOriginalLibraryFields } from "../src/domain/oldProductEvaluation/dualSourceMasterDataBackfill.js";

test("original library parser recognizes core copyright and classification fields", () => {
  const result = recognizeOriginalLibraryFields([
    "作品ID",
    "书名初",
    "书名更",
    "作者笔名",
    "一级分类",
    "二级分类",
    "三级分类",
    "点击数",
    "网址链接",
    "授权时间",
    "结束时间"
  ]);

  assert.equal(result.fieldCount, 11);
  assert.deepEqual(result.roles.id, ["作品ID"]);
  assert.deepEqual(result.roles.author, ["作者笔名"]);
  assert.equal(result.roles.title.includes("书名初"), true);
  assert.equal(result.roles.title.includes("书名更"), true);
  assert.deepEqual(result.roles.startDate, ["授权时间"]);
  assert.deepEqual(result.roles.endDate, ["结束时间"]);
  assert.equal(result.roles.category.includes("一级分类"), true);
  assert.equal(result.roles.category.includes("二级分类"), true);
  assert.equal(result.roles.tags.includes("三级分类"), true);
});

test("original library parser exposes supported backfill fields", () => {
  const result = recognizeOriginalLibraryFields([
    "作品ID",
    "书名更",
    "作者笔名",
    "授权时间",
    "结束时间",
    "一级分类",
    "二级分类",
    "三级分类"
  ]);

  assert.equal(result.supportedBackfillFields.includes("standardWorkName"), true);
  assert.equal(result.supportedBackfillFields.includes("authorName"), true);
  assert.equal(result.supportedBackfillFields.includes("copyrightStartDate"), true);
  assert.equal(result.supportedBackfillFields.includes("copyrightEndDate"), true);
  assert.equal(result.supportedBackfillFields.includes("classificationLevel1"), true);
  assert.equal(result.supportedBackfillFields.includes("classificationLevel2"), true);
  assert.equal(result.supportedBackfillFields.includes("requiredTags"), true);
  assert.equal(result.supportedBackfillFields.includes("audioRightsStatus"), false);
});
