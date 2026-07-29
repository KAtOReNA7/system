import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);
const configPath = path.join(
  root,
  "config",
  "m2-current-core-revenue-manual.v0.1.json"
);
const fixturePath = path.join(
  root,
  "test",
  "fixtures",
  "m2-core-revenue-manual.synthetic.v0.1.json"
);

const [config, fixture] = await Promise.all([
  readJson(configPath),
  readJson(fixturePath)
]);
validatePublicContract(config, fixture);

const verify = process.argv.includes("--verify");
const privateExecution = process.argv.includes("--private");
if (privateExecution) {
  throw new Error(
    "m2_core_revenue_manual_private_execution_not_implemented_public_contract_only"
  );
}

const result = {
  status: "M2_CORE_REVENUE_MANUAL_PUBLIC_CONTRACT_PREREGISTERED",
  modelId: config.model.stableModelId,
  experimentId: config.model.experimentId,
  evaluationContractVersion: config.evaluation.contractVersion,
  actualDefinitionId: config.target.actualDefinitionId,
  corePopulations: config.coreSelection.populations.map((item) => item.id),
  horizonsMonths: config.evaluation.horizonsMonths,
  bootstrapIterations: config.evaluation.bootstrap.iterations,
  syntheticScenarioCount:
    fixture.coreSelectionCases.length
    + fixture.forecastCases.length
    + fixture.kFallbackCases.length
    + 1,
  privateEvaluationExecuted: false,
  modelExecutionCount: 0,
  productionModified: false,
  activeCandidateChanged: false,
  approvedForAutomationChanged: false
};

if (!verify) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  process.stdout.write(
    "M2 core-revenue manual public contract verified.\n"
  );
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function validatePublicContract(value, synthetic) {
  if (
    value?.schema !== "m2.current.core_revenue_manual.v0.1"
    || value?.model?.stableModelId !== "M2-WORK-CRMR01"
    || value?.model?.experimentId
      !== "M2-EXP-CORE-REVENUE-MANUAL-01"
    || value?.target?.actualDefinitionId
      !== "M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01"
    || value?.target?.calendarField !== "billMonth"
    || value?.target?.predictionGrain
      !== "work_origin_horizon_channel"
    || value?.coreSelection?.populations?.length !== 2
    || value.coreSelection.populations[0].id !== "CORE80"
    || value.coreSelection.populations[1].id !== "CORE90"
    || value?.eligibility?.minimumCompleteMonths !== 3
    || value?.longTermMultiplier?.hardClampAllowed !== false
    || value?.longTermMultiplier?.fixedSupportThresholdAllowed !== false
    || value?.evaluation?.bootstrap?.iterations !== 2000
    || value?.authorization?.privateDevelopmentEvaluation !== true
    || value.authorization.formulaTuning !== false
    || value.authorization.modelSelection !== false
    || value.authorization.production !== false
    || value.authorization.pullRequestMerge !== false
    || synthetic?.schema
      !== "m2.current.core_revenue_manual.synthetic_fixture.v0.1"
    || synthetic.coreSelectionCases?.length < 2
    || synthetic.forecastCases?.length < 5
    || synthetic.kFallbackCases?.length < 3
    || !synthetic.tailConservationCase
  ) {
    throw new Error("m2_core_revenue_manual_public_contract_invalid");
  }
}
