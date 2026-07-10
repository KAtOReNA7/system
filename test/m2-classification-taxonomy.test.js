import assert from "node:assert/strict";
import test from "node:test";

import {
  getClassificationTaxonomy,
  isAllowedAuxiliaryTag,
  normalizeClassificationPath
} from "../src/domain/oldProductEvaluation/classificationTaxonomy.js";

test("新版历史三级分类可通过固定树校验", () => {
  const result = normalizeClassificationPath({
    level1: "出版物",
    level2: "历史",
    level3: "汉"
  });

  assert.equal(result.valid, true);
  assert.equal(result.normalized, false);
});

test("世界史别名归一为世界历史", () => {
  const result = normalizeClassificationPath({
    level1: "出版物",
    level2: "历史",
    level3: "世界史"
  });

  assert.equal(result.valid, true);
  assert.equal(result.level3, "世界历史");
  assert.equal(result.normalized, true);
});

test("一级与二级冲突时按固定树归一一级", () => {
  const result = normalizeClassificationPath({
    level1: "网文",
    level2: "人文",
    level3: "人物传记"
  });

  assert.equal(result.valid, true);
  assert.equal(result.level1, "出版物");
  assert.equal(result.normalized, true);
});

test("三级分类必须属于对应二级分类", () => {
  const result = normalizeClassificationPath({
    level1: "出版物",
    level2: "小说",
    level3: "唐"
  });

  assert.equal(result.valid, false);
});

test("辅助标签包含国家组且普通分类不是辅助标签", () => {
  const taxonomy = getClassificationTaxonomy();

  assert.equal(taxonomy.auxiliaryTagGroups.国家.includes("日本"), true);
  assert.equal(taxonomy.countryTagPolicy.requiresManualReview, true);
  assert.equal(isAllowedAuxiliaryTag("日本"), true);
  assert.equal(isAllowedAuxiliaryTag("历史小说"), false);
});

test("用户最终基础大表新增分类和标签已纳入受控词表", () => {
  const taxonomy = getClassificationTaxonomy();

  for (const level3 of ["科普", "教辅", "诗歌"]) {
    const result = normalizeClassificationPath({
      level1: "出版物",
      level2: "人文",
      level3
    });
    assert.equal(result.valid, true);
  }

  for (const tag of [
    "女性主义",
    "戛纳电影节",
    "冰岛",
    "动画",
    "柏林电影节",
    "奥地利",
    "广播剧",
    "晋江",
    "银河奖",
    "南非",
    "希腊"
  ]) {
    assert.equal(isAllowedAuxiliaryTag(tag), true);
  }

  assert.equal(taxonomy.auxiliaryTagGroups.来源平台.includes("晋江"), true);
});
