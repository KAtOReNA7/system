#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildPr7S1B6AuthorityDocuments,
  preparePr7P1OfflineRemediation,
} from "../../src/domain/m2V2EvidencePilot/pr7P1OfflineRemediation.js";

const root = resolve(process.cwd());
const trackedCoreCommitment = JSON.parse(readFileSync(
  resolve(root, "docs/analysis/m2-v2/M2-v2-PR7-core-commitment-v0.1.json"),
  "utf8",
));
const { prepared } = preparePr7P1OfflineRemediation(root);
const remediationSummary = {
  schema: "m2.v2.pr7-p1-remediation-summary-public.v0.2",
  status: "CANDIDATE_CLOSED_PENDING_INDEPENDENT_REVIEW",
  classification: "public_sanitized_not_for_formal_decision",
  batchId: "B6",
  historicalDecision: "CANARY_CONDITIONAL",
  currentDecision: prepared.currentRestatedEvaluation.decision,
  currentEvaluationDigestSha256: prepared.predecessorRestatementBinding.recomputedEvaluationDigestSha256,
  predecessorEvaluationDigestSha256:
    prepared.predecessorRestatementBinding.predecessorEvaluationDigestSha256,
  providerRequestDelta: 0,
  databaseConnections: 0,
  actualExternalFetchCount: 0,
  canaryExecuted: false,
  full160Executed: false,
  modelTrainingPerformed: false,
  holdoutOpened: false,
  findingsRemainOpen: true,
  independentReviewPerformed: false,
  mergeAuthorized: false,
  releaseAuthorized: false,
  nextDevelopmentReadiness: "NOT_AUTHORIZED",
};
const mergeReadiness = {
  schema: "m2.v2.pr7-merge-readiness-public.v0.2",
  status: "NOT_READY_PENDING_INDEPENDENT_REVIEW",
  classification: "public_sanitized_not_for_formal_decision",
  batchId: "B6",
  candidateImplementationCompleteThrough: "B6",
  currentDecision: prepared.currentRestatedEvaluation.decision,
  requiredNextBatch: "B7",
  independentReviewRequired: true,
  independentReviewPerformed: false,
  findingsRemainOpen: true,
  markReadyAuthorized: false,
  mergeAuthorized: false,
  releaseAuthorized: false,
  providerRequestDelta: 0,
  full160Authorized: false,
  modelTrainingAuthorized: false,
  nextDevelopmentReadiness: "NOT_AUTHORIZED",
};
const documents = buildPr7S1B6AuthorityDocuments(prepared, {
  remediationSummary,
  mergeReadiness,
  trackedCoreCommitment,
});
const selector = process.argv.find((value) => value.startsWith("--document="))?.slice(11) ?? "summary";
const selected = {
  summary: documents.remediationSummary,
  readiness: documents.mergeReadiness,
  restatement: documents.integrityRestatement,
  index: documents.currentStateIndex,
  receipt: {
    schema: documents.schema,
    privateOnly: true,
    transactionContext: documents.transactionContext,
    graphDigestSha256: documents.graph.graphDigestSha256,
    evidenceDigestSha256: digestJson(documents.evidence),
    providerRequestDelta: 0,
  },
}[selector];
if (!selected) throw new Error("b6_authority_document_selector_invalid");
process.stdout.write(`${JSON.stringify(selected, null, 2)}\n`);

function digestJson(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
