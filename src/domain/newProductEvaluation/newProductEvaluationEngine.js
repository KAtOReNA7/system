import { buildChannelForecast } from "./channelForecast.js";
import { extractMaterialFields } from "./materialFieldExtractor.js";
import { evaluateNewProductReadiness } from "./newProductReadiness.js";
import {
  buildNewProductCandidateRating,
  buildNewProductRisks
} from "./newProductRating.js";

export const M3_NEW_PRODUCT_ALGORITHM_VERSION = "m3-material-first-fixture-v1";

export function parseNewProductMaterial(material) {
  return extractMaterialFields(material);
}

export function evaluateNewProductMaterial(material) {
  const parsedMaterial = parseNewProductMaterial(material);
  const readiness = evaluateNewProductReadiness(parsedMaterial);
  const fields = parsedMaterial.normalizedFields;
  const forecast = buildChannelForecast(fields, readiness);
  const candidateRating = buildNewProductCandidateRating(fields, forecast, readiness);
  const risks = buildNewProductRisks(fields, readiness, forecast);

  return {
    materialId: material.materialId,
    algorithmVersion: M3_NEW_PRODUCT_ALGORITHM_VERSION,
    inputMode: "material_first",
    structuredTopicTableRole: "fallback_only",
    source: fields.source ?? null,
    parsedMaterial,
    readiness,
    forecast,
    candidateRating,
    risks,
    comparatorDisplay: {
      operatorComparators: fields.operatorComparators ?? [],
      systemComparators: buildSystemComparators(fields),
      displayTogether: true
    },
    guardrails: {
      nonFormal: true,
      notForFormalDecision: true,
      formalExecutionAllowed: false,
      databaseWritten: false,
      rawMaterialStored: false,
      privateFileRead: false,
      forecastRangeEmitted: false,
      developDecisionEmitted: false,
      resourceLevelEmitted: false
    },
    nonFormal: true,
    syntheticOnly: true,
    notForFormalDecision: true
  };
}

function buildSystemComparators(fields) {
  const classification = fields.confirmedClassification ?? fields.classificationCandidate ?? [];
  if (!classification.length) {
    return [];
  }
  return [
    {
      comparatorId: "SYN-M3-COMPARATOR-001",
      basis: "synthetic classification and heat similarity",
      classificationPath: classification,
      nonFormal: true
    }
  ];
}
