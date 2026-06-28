import { buildAuthorRanking } from "./authorRanking.js";
import { buildChannelForecast } from "./channelForecast.js";
import { buildComparableWorks } from "./comparableWorkSelector.js";
import {
  applyExternalEvidenceToParsedMaterial,
  getFixtureExternalEvidenceForMaterial,
  normalizeExternalEvidence,
  summarizeExternalEvidence
} from "./externalEvidence.js";
import { extractMaterialFields } from "./materialFieldExtractor.js";
import { evaluateNewProductReadiness } from "./newProductReadiness.js";
import {
  buildNewProductCandidateRating,
  buildNewProductRisks
} from "./newProductRating.js";
import { generateResearchQuestions } from "./researchQuestionGenerator.js";

export const M3_NEW_PRODUCT_ALGORITHM_VERSION = "m3-material-first-fixture-v1";

export function parseNewProductMaterial(material) {
  return extractMaterialFields(material);
}

export function evaluateNewProductMaterial(material, options = {}) {
  const baseParsedMaterial = parseNewProductMaterial(material);
  const externalEvidence = normalizeExternalEvidence(
    options.externalEvidence ?? getFixtureExternalEvidenceForMaterial(material.materialId)
  );
  const evidenceSummary = summarizeExternalEvidence(externalEvidence);
  const parsedMaterial = applyExternalEvidenceToParsedMaterial(baseParsedMaterial, externalEvidence);
  const readiness = evaluateNewProductReadiness(parsedMaterial);
  const fields = parsedMaterial.normalizedFields;
  const researchQuestions = generateResearchQuestions({
    parsedMaterial,
    readiness,
    externalEvidence,
    evidenceSummary
  });
  const comparableWorks = buildComparableWorks(fields);
  const authorRanking = buildAuthorRanking(fields);
  const forecast = buildChannelForecast(fields, readiness, {
    comparableWorks,
    authorRanking,
    externalEvidence,
    evidenceSummary
  });
  const candidateRating = buildNewProductCandidateRating(fields, forecast, readiness, {
    comparableWorks,
    authorRanking,
    externalEvidence,
    evidenceSummary
  });
  const risks = buildNewProductRisks(fields, readiness, forecast);

  return {
    materialId: material.materialId,
    algorithmVersion: M3_NEW_PRODUCT_ALGORITHM_VERSION,
    inputMode: "material_first",
    structuredTopicTableRole: "fallback_only",
    source: fields.source ?? null,
    parsedMaterial,
    readiness,
    researchQuestions,
    externalEvidence,
    evidenceSummary,
    forecast,
    comparableWorks,
    authorRanking,
    candidateRating,
    risks,
    comparatorDisplay: {
      operatorComparators: fields.operatorComparators ?? [],
      systemComparators: comparableWorks.systemSelected,
      sameAuthorReferenceWorks: comparableWorks.sameAuthorReferenceWorks,
      displayTogether: true
    },
    guardrails: {
      nonFormal: true,
      notForFormalDecision: true,
      formalExecutionAllowed: false,
      databaseWritten: false,
      rawMaterialStored: false,
      privateFileRead: false,
      externalSearchCalled: false,
      chatGptWebCalled: false,
      browserAutomationCalled: false,
      forecastRangeEmitted: false,
      developDecisionEmitted: false,
      resourceLevelEmitted: false
    },
    nonFormal: true,
    syntheticOnly: true,
    notForFormalDecision: true
  };
}
