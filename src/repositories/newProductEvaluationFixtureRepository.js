import { badRequest } from "../errors.js";
import {
  M3_NEW_PRODUCT_FIXTURE_DATASET,
  M3_NEW_PRODUCT_MATERIAL_FIXTURES
} from "../domain/newProductEvaluation/fixtures/newProductMaterials.fixture.js";
import {
  assertNoRawMaterialPayload,
  extractMaterialFields
} from "../domain/newProductEvaluation/materialFieldExtractor.js";
import {
  applyExternalEvidenceToParsedMaterial,
  getFixtureExternalEvidenceForMaterial,
  summarizeExternalEvidence
} from "../domain/newProductEvaluation/externalEvidence.js";
import { buildAuthorRanking } from "../domain/newProductEvaluation/authorRanking.js";
import { buildComparableWorks } from "../domain/newProductEvaluation/comparableWorkSelector.js";
import { evaluateNewProductMaterial } from "../domain/newProductEvaluation/newProductEvaluationEngine.js";
import { evaluateNewProductReadiness } from "../domain/newProductEvaluation/newProductReadiness.js";
import { generateResearchQuestions } from "../domain/newProductEvaluation/researchQuestionGenerator.js";

export async function listM3NewProductMaterialFixtures(_config, { pagination }) {
  const items = M3_NEW_PRODUCT_MATERIAL_FIXTURES.map(toMaterialSummary);
  return withDataset({
    items: paginate(items, pagination),
    pagination: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total: items.length
    }
  });
}

export async function getM3NewProductMaterialFixtureById(_config, materialId) {
  const item = findMaterial(materialId);
  if (!item) {
    return null;
  }
  return withDataset({
    item: toMaterialDetail(item)
  });
}

export async function parseM3NewProductMaterialFixture(_config, materialId, payload = {}) {
  rejectRawPayload(payload);
  const item = findMaterial(materialId);
  if (!item) {
    return null;
  }
  return withDataset({
    materialId,
    parseResult: extractMaterialFields(item),
    nonFormal: true,
    rawMaterialStored: false,
    privateFileRead: false
  });
}

export async function evaluateM3NewProductMaterialFixture(_config, materialId, payload = {}) {
  rejectRawPayload(payload);
  const item = findMaterial(materialId);
  if (!item) {
    return null;
  }
  return withDataset({
    materialId,
    evaluation: evaluateNewProductMaterial(item),
    nonFormal: true,
    rawMaterialStored: false,
    privateFileRead: false
  });
}

export async function getM3NewProductMaterialComparablesFixture(_config, materialId) {
  const item = findMaterial(materialId);
  if (!item) {
    return null;
  }
  const parsed = extractMaterialFields(item);
  return withDataset({
    materialId,
    comparableWorks: buildComparableWorks(parsed.normalizedFields),
    nonFormal: true,
    fixtureOnly: true,
    notForFormalDecision: true,
    rawMaterialStored: false,
    privateFileRead: false
  });
}

export async function getM3NewProductMaterialAuthorRankingFixture(_config, materialId) {
  const item = findMaterial(materialId);
  if (!item) {
    return null;
  }
  const parsed = extractMaterialFields(item);
  return withDataset({
    materialId,
    authorRanking: buildAuthorRanking(parsed.normalizedFields),
    nonFormal: true,
    fixtureOnly: true,
    notForFormalDecision: true,
    rawMaterialStored: false,
    privateFileRead: false
  });
}

export async function getM3NewProductMaterialExternalEvidenceFixture(_config, materialId) {
  const item = findMaterial(materialId);
  if (!item) {
    return null;
  }
  const externalEvidence = getFixtureExternalEvidenceForMaterial(materialId);
  return withDataset({
    materialId,
    externalEvidence,
    evidenceSummary: summarizeExternalEvidence(externalEvidence),
    noRealSearchCalled: true,
    noChatGptWebCalled: true,
    noBrowserAutomationCalled: true,
    nonFormal: true,
    fixtureOnly: true,
    notForFormalDecision: true,
    rawMaterialStored: false,
    privateFileRead: false
  });
}

export async function getM3NewProductMaterialResearchQuestionsFixture(_config, materialId) {
  const item = findMaterial(materialId);
  if (!item) {
    return null;
  }
  const externalEvidence = getFixtureExternalEvidenceForMaterial(materialId);
  const evidenceSummary = summarizeExternalEvidence(externalEvidence);
  const parsed = applyExternalEvidenceToParsedMaterial(extractMaterialFields(item), externalEvidence);
  const readiness = evaluateNewProductReadiness(parsed);
  return withDataset({
    materialId,
    researchQuestions: generateResearchQuestions({
      parsedMaterial: parsed,
      readiness,
      externalEvidence,
      evidenceSummary
    }),
    evidenceSummary,
    noRealSearchCalled: true,
    noChatGptWebCalled: true,
    noBrowserAutomationCalled: true,
    nonFormal: true,
    fixtureOnly: true,
    notForFormalDecision: true,
    rawMaterialStored: false,
    privateFileRead: false
  });
}

function withDataset(body) {
  return {
    dataset: clone(M3_NEW_PRODUCT_FIXTURE_DATASET),
    ...clone(body)
  };
}

function findMaterial(materialId) {
  return M3_NEW_PRODUCT_MATERIAL_FIXTURES.find((item) => item.materialId === materialId) ?? null;
}

function toMaterialSummary(item) {
  const parseResult = extractMaterialFields(item);
  return {
    materialId: item.materialId,
    materialType: item.materialType,
    inputMode: item.inputMode,
    title: item.fields.title,
    source: parseResult.normalizedFields.source ?? null,
    extractedFieldCount: parseResult.extractedFields.length,
    missingFieldCount: parseResult.missingFields.length,
    manualFillRequiredCount: parseResult.manualFillRequired.length,
    syntheticOnly: true,
    nonFormal: true,
    rawMaterialStored: false,
    privateFileRead: false
  };
}

function toMaterialDetail(item) {
  const parseResult = extractMaterialFields(item);
  const safeFields = { ...parseResult.normalizedFields };
  return {
    materialId: item.materialId,
    materialType: item.materialType,
    inputMode: item.inputMode,
    materialMetadata: clone(item.materialMetadata),
    safeFieldSummary: {
      source: safeFields.source ?? null,
      targetChannelCount: Array.isArray(safeFields.targetChannels) ? safeFields.targetChannels.length : 0,
      hasHeatSignal: parseResult.extractedFields.some((field) =>
        ["reads", "collections", "ratingScore", "commentCount", "rankings", "searchHeat", "socialHeat", "platformHeat", "externalHeat"].includes(field.key)
      ),
      hasAdaptationSignals: Array.isArray(safeFields.adaptationSignals) && safeFields.adaptationSignals.length > 0
    },
    parsePreview: {
      extractedFields: parseResult.extractedFields.map((field) => ({
        key: field.key,
        confidence: field.confidence,
        confirmationStatus: field.confirmationStatus,
        sourceSpanSummary: field.sourceSpanSummary
      })),
      missingFields: parseResult.missingFields,
      manualFillRequired: parseResult.manualFillRequired
    },
    syntheticOnly: true,
    nonFormal: true,
    rawMaterialStored: false,
    privateFileRead: false
  };
}

function rejectRawPayload(payload) {
  try {
    assertNoRawMaterialPayload(payload);
  } catch (error) {
    if (error.code === "raw_material_not_accepted") {
      throw badRequest(error.message);
    }
    throw error;
  }
}

function paginate(items, pagination) {
  const start = (pagination.page - 1) * pagination.pageSize;
  return items.slice(start, start + pagination.pageSize);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
