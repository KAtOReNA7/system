import { createApp } from "./app.js";
import {
  getM2OldProductEvaluationById,
  getM2OldProductEvaluationOverview,
  getM2OldProductBacktestById,
  listM2OldProductAlgorithmVersions,
  listM2OldProductBacktests,
  listM2OldProductEvaluations,
  listM2OldProductReadinessGaps
} from "../repositories/oldProductEvaluationFixtureRepository.js";
import {
  getM2AdvisoryReviewSummaryFixture,
  getM2BlockingReviewItemById,
  listM2BlockingReviewItems,
  simulateM2BlockingReviewAction
} from "../repositories/m2BlockingReviewFixtureRepository.js";
import {
  createM2EvaluationTaskFixture,
  getM2EvaluationTaskFixtureById,
  listM2EvaluationTaskFixtures,
  simulateM2EvaluationTaskAction
} from "../repositories/m2EvaluationTaskFixtureRepository.js";
import {
  createM2ExportFixture,
  getM2ExportFixtureById,
  listM2ExportFixtures,
  simulateM2ExportAction
} from "../repositories/m2ExportFixtureRepository.js";
import {
  createM3NewProductBacktestAnchorFixture,
  evaluateM3NewProductMaterialFixture,
  getM3NewProductMaterialAuthorRankingFixture,
  getM3NewProductMaterialComparablesFixture,
  getM3NewProductMaterialExternalEvidenceFixture,
  getM3NewProductMaterialFixtureById,
  getM3NewProductMaterialResearchQuestionsFixture,
  getM3NewProductMaterialWorkflowFixture,
  getM3NewProductDryRunReviewFixture,
  listM3NewProductMaterialFixtures,
  parseM3NewProductMaterialFixture
} from "../repositories/newProductEvaluationFixtureRepository.js";

const FIXTURE_REPOSITORIES = Object.freeze({
  getM2OldProductEvaluationById,
  getM2OldProductEvaluationOverview,
  getM2OldProductBacktestById,
  listM2OldProductAlgorithmVersions,
  listM2OldProductBacktests,
  listM2OldProductEvaluations,
  listM2OldProductReadinessGaps,
  getM2AdvisoryReviewSummaryFixture,
  getM2BlockingReviewItemById,
  listM2BlockingReviewItems,
  simulateM2BlockingReviewAction,
  createM2EvaluationTaskFixture,
  getM2EvaluationTaskFixtureById,
  listM2EvaluationTaskFixtures,
  simulateM2EvaluationTaskAction,
  createM2ExportFixture,
  getM2ExportFixtureById,
  listM2ExportFixtures,
  simulateM2ExportAction,
  createM3NewProductBacktestAnchorFixture,
  evaluateM3NewProductMaterialFixture,
  getM3NewProductMaterialAuthorRankingFixture,
  getM3NewProductMaterialComparablesFixture,
  getM3NewProductMaterialExternalEvidenceFixture,
  getM3NewProductMaterialFixtureById,
  getM3NewProductMaterialResearchQuestionsFixture,
  getM3NewProductMaterialWorkflowFixture,
  getM3NewProductDryRunReviewFixture,
  listM3NewProductMaterialFixtures,
  parseM3NewProductMaterialFixture
});

export function createFixtureApp(config, overrides = {}) {
  return createApp(config, {
    ...FIXTURE_REPOSITORIES,
    ...overrides
  });
}
