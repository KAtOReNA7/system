import assert from "node:assert/strict";
import test from "node:test";
import { extractMaterialFields } from "../src/domain/newProductEvaluation/materialFieldExtractor.js";
import { evaluateNewProductReadiness } from "../src/domain/newProductEvaluation/newProductReadiness.js";
import { generateResearchQuestions } from "../src/domain/newProductEvaluation/researchQuestionGenerator.js";

function questionsFor(fields) {
  const parsedMaterial = extractMaterialFields({ materialId: "SYN-M3-RQ", fields });
  const readiness = evaluateNewProductReadiness(parsedMaterial);
  return generateResearchQuestions({ parsedMaterial, readiness, externalEvidence: [], evidenceSummary: {} });
}

test("missing external heat generates research question", () => {
  const questions = questionsFor({
    title: "SYN-M3-TITLE",
    author: "SYN-M3-AUTHOR",
    source: "publication",
    classificationCandidate: ["SYN-L1"],
    wordCount: 120000,
    targetChannels: ["SYN-CHANNEL"],
    copyrightTermRange: "3 years",
    sameNameAudioStatus: "none",
    sameNameAudioStatusCheckStatus: "checked"
  });

  assert.ok(questions.some((item) => item.missingFieldOrRisk === "missing_heat_signal"));
});

test("missing same-name audio check generates research question", () => {
  const questions = questionsFor({
    title: "SYN-M3-TITLE",
    author: "SYN-M3-AUTHOR",
    source: "publication",
    classificationCandidate: ["SYN-L1"],
    wordCount: 120000,
    reads: 1000,
    targetChannels: ["SYN-CHANNEL"],
    copyrightTermRange: "3 years"
  });

  assert.ok(questions.some((item) => item.missingFieldOrRisk === "missing_same_name_audio_check_status"));
});

test("missing adaptation generates research question but is not a hard blocker", () => {
  const fields = {
    title: "SYN-M3-TITLE",
    author: "SYN-M3-AUTHOR",
    source: "publication",
    classificationCandidate: ["SYN-L1"],
    wordCount: 120000,
    reads: 1000,
    targetChannels: ["SYN-CHANNEL"],
    copyrightTermRange: "3 years",
    sameNameAudioStatus: "none",
    sameNameAudioStatusCheckStatus: "checked"
  };
  const parsedMaterial = extractMaterialFields({ materialId: "SYN-M3-RQ", fields });
  const readiness = evaluateNewProductReadiness(parsedMaterial);
  const questions = generateResearchQuestions({ parsedMaterial, readiness, externalEvidence: [], evidenceSummary: {} });

  assert.equal(readiness.hardBlockerCodes.includes("missing_adaptation_signals"), false);
  assert.ok(readiness.warningCodes.includes("missing_adaptation_signals"));
  assert.ok(questions.some((item) => item.missingFieldOrRisk === "missing_adaptation_signals"));
});
