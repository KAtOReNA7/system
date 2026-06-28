import { hasUsableHeatSignal } from "./materialFieldExtractor.js";

export function generateResearchQuestions({
  parsedMaterial = {},
  readiness = {},
  externalEvidence = [],
  evidenceSummary = {}
} = {}) {
  const fields = parsedMaterial.normalizedFields ?? parsedMaterial ?? {};
  const questions = [];
  if (!hasUsableHeatSignal(fields)) {
    questions.push(question({
      code: "heat_signal",
      question: "Is there usable public heat evidence for this title?",
      purpose: "Fill or explain the missing external heat signal.",
      missingFieldOrRisk: "missing_heat_signal",
      suggestedSearchQuery: `${fields.title ?? "candidate title"} reads collections rating comments ranking search social heat`,
      priority: "high",
      evidenceTypesExpected: ["originalPlatformStats", "rankingSignal", "searchHeatSignal", "socialHeatSignal", "reviewReputationEvidence"],
      answerFormatHint: "Record source, metric name, metric value, collection time, confidence and manual confirmation."
    }));
  }
  if (!fields.sameNameAudioStatusCheckStatus || fields.sameNameAudioStatusCheckStatus !== "checked") {
    questions.push(question({
      code: "same_name_audio",
      question: "Does a same-name audiobook already exist?",
      purpose: "Confirm same-name audio risk before numeric forecast.",
      missingFieldOrRisk: "missing_same_name_audio_check_status",
      suggestedSearchQuery: `${fields.title ?? "candidate title"} audiobook same name`,
      priority: "high",
      evidenceTypesExpected: ["sameNameAudioEvidence"],
      answerFormatHint: "Answer has / none / unknown, cite source, then mark manualConfirmed when reviewed."
    }));
  }
  if (!Array.isArray(fields.adaptationSignals) || fields.adaptationSignals.length === 0) {
    questions.push(question({
      code: "adaptation_signal",
      question: "Are there film, animation, comic, manga or game adaptation signals?",
      purpose: "Improve candidate rating and risk explanation; this is not a hard blocker.",
      missingFieldOrRisk: "missing_adaptation_signals",
      suggestedSearchQuery: `${fields.title ?? "candidate title"} adaptation film animation comic game`,
      priority: "medium",
      evidenceTypesExpected: ["adaptationEvidence", "gptWebAssistedSummary"],
      answerFormatHint: "Record adaptation type, source summary, source URL or description, confidence and manual confirmation."
    }));
  }
  if (!Array.isArray(fields.operatorComparators) || fields.operatorComparators.length === 0) {
    questions.push(question({
      code: "operator_comparators",
      question: "Do operator-specified comparable works have public supporting evidence?",
      purpose: "Keep operator comparators parallel to system comparables with auditable source notes.",
      missingFieldOrRisk: "missing_operator_comparators",
      suggestedSearchQuery: `${fields.title ?? "candidate title"} comparable work public performance`,
      priority: "medium",
      evidenceTypesExpected: ["operatorResearchNote", "reviewReputationEvidence"],
      answerFormatHint: "Record comparator rationale and source summary; do not paste long webpage text."
    }));
  }
  if (!hasEvidenceType(externalEvidence, "publicationEvidence")) {
    questions.push(question({
      code: "publication_source",
      question: "Where was the work published or serialized?",
      purpose: "Support source and publication context with a structured evidence record.",
      missingFieldOrRisk: "source_or_publication_context_unconfirmed",
      suggestedSearchQuery: `${fields.title ?? "candidate title"} publication serialization platform`,
      priority: "low",
      evidenceTypesExpected: ["publicationEvidence"],
      answerFormatHint: "Record source name, URL or source description, freshness and confidence."
    }));
  }
  if ((readiness.warningCodes ?? []).includes("same_name_audio_unknown")) {
    questions.push(question({
      code: "same_name_audio_unknown_followup",
      question: "Can the unknown same-name audiobook status be clarified?",
      purpose: "Reduce same-name audio uncertainty in rating and risk explanation.",
      missingFieldOrRisk: "same_name_audio_unknown",
      suggestedSearchQuery: `${fields.title ?? "candidate title"} audio drama audiobook platform`,
      priority: "medium",
      evidenceTypesExpected: ["sameNameAudioEvidence"],
      answerFormatHint: "Record whether same-name audio exists; if unclear, keep confidence low or medium."
    }));
  }
  return questions.map((item, index) => ({
    questionId: `SYN-M3-RQ-${String(index + 1).padStart(3, "0")}-${item.code}`,
    ...item,
    nonFormal: true,
    fixtureOnly: true,
    notForFormalDecision: true
  }));
}

function question(value) {
  return value;
}

function hasEvidenceType(externalEvidence, evidenceType) {
  return externalEvidence.some((item) => item.evidenceType === evidenceType);
}
