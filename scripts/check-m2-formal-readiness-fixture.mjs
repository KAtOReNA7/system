import {
  evaluateFormalReadiness,
  summarizeFormalReadiness
} from "../src/domain/oldProductEvaluation/formalReadinessGate.js";
import { M2_FORMAL_READINESS_FIXTURE_ITEMS } from "../test/fixtures/m2FormalReadinessGate.fixture.js";

const results = M2_FORMAL_READINESS_FIXTURE_ITEMS.map((item) => ({
  caseId: item.caseId,
  ...evaluateFormalReadiness(item)
}));
const summary = summarizeFormalReadiness(results);

const output = {
  status: "pass",
  mode: "fixture",
  stage: "M2-FR-2",
  formalEvaluationExecuted: false,
  formalEvaluationAllowed: summary.formalEvaluationAllowed,
  databaseConnected: false,
  databaseWritten: false,
  migrationExecuted: false,
  dbMigrationsModified: false,
  mappingVersionActivated: false,
  switchMappingVersionCalled: false,
  runtimeApiImplemented: false,
  writeApiAdded: false,
  exportApiAdded: false,
  evaluationTaskApiAdded: false,
  realDataRead: false,
  dataDirectoryRead: false,
  summary,
  examples: results.slice(0, 5),
  results
};

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
