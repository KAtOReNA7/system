import { readFileSync } from "node:fs";

const taxonomy = JSON.parse(
  readFileSync(new URL("./classificationTaxonomy.v1.json", import.meta.url), "utf8")
);

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parentLevel1(level2) {
  for (const [level1, branches] of Object.entries(taxonomy.classificationTree)) {
    if (Object.hasOwn(branches, level2)) {
      return level1;
    }
  }
  return "";
}

export function normalizeClassificationPath(input = {}) {
  let level1 = clean(input.level1);
  const level2 = clean(input.level2);
  let level3 = clean(input.level3);
  const reasons = [];

  const alias = taxonomy.classificationAliases[level3];
  if (alias) {
    reasons.push(`三级分类“${level3}”归一为“${alias}”`);
    level3 = alias;
  }

  const expectedLevel1 = parentLevel1(level2);
  if (expectedLevel1 && level1 !== expectedLevel1) {
    reasons.push(`二级分类“${level2}”属于“${expectedLevel1}”，一级分类已按固定树归一`);
    level1 = expectedLevel1;
  }

  const validLevel1 = Object.hasOwn(taxonomy.classificationTree, level1);
  const validLevel2 = validLevel1 && Object.hasOwn(taxonomy.classificationTree[level1], level2);
  const validLevel3 = validLevel2 && taxonomy.classificationTree[level1][level2].includes(level3);

  return {
    level1,
    level2,
    level3,
    valid: Boolean(validLevel1 && validLevel2 && validLevel3),
    normalized: reasons.length > 0,
    normalizationReasons: reasons
  };
}

export function isAllowedAuxiliaryTag(tag) {
  const value = clean(tag);
  return Object.values(taxonomy.auxiliaryTagGroups).some((items) => items.includes(value));
}

export function getClassificationTaxonomy() {
  return structuredClone(taxonomy);
}

export const CLASSIFICATION_TAXONOMY_VERSION = taxonomy.version;
