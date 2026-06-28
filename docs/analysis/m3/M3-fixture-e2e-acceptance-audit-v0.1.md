# M3 fixture e2e acceptance audit v0.1

Generated: 2026-06-28

## Scope

This audit checks whether the M3 fixture/prototype chain is complete enough to move to a separately authorized local private-material dry-run design. It does not read private material, does not run a real dry-run, does not connect to a database and does not enter M3 formal execution.

## Audit Conclusion

M3 fixture end-to-end chain is complete for the current non-formal prototype scope.

The implemented chain is:

`material parsing -> research questions -> external evidence -> readiness -> comparables -> author ranking -> channel forecast -> forecast weighting -> rating explanation -> workflow -> backtest anchor`

The chain remains fixture-only, non-formal and not for formal decision. It is ready for a controlled private dry-run design step, not for formal execution.

## Audit Matrix

| Item | Status | Evidence |
|---|---|---|
| Material-first is preserved across the chain | Passed | `src/domain/newProductEvaluation/newProductEvaluationEngine.js`, `test/m3-new-product-evaluation-engine.test.js` |
| Structured topic table remains fallback only | Passed | `docs/prd/30-new-product-evaluation/M3-restart-prd-v0.2.json`, engine output |
| Source only allows `publication` and `web_original` | Passed | `src/domain/newProductEvaluation/materialFieldExtractor.js`, `test/m3-material-field-extractor.test.js` |
| Readiness hard blockers match PRD v0.2 | Passed | `src/domain/newProductEvaluation/newProductReadiness.js`, `test/m3-new-product-readiness.test.js` |
| External evidence connects to readiness, forecast and rating | Passed | `src/domain/newProductEvaluation/externalEvidence.js`, `src/domain/newProductEvaluation/forecastWeighting.js`, `src/domain/newProductEvaluation/ratingExplanation.js` |
| Research questions can be generated | Passed | `src/domain/newProductEvaluation/researchQuestionGenerator.js`, `test/m3-research-question-generator.test.js` |
| System comparables are capped at 3 | Passed | `src/domain/newProductEvaluation/comparableWorkSelector.js`, `test/m3-comparable-work-selector.test.js` |
| Operator comparables display beside system comparables | Passed | `src/domain/newProductEvaluation/comparableWorkSelector.js`, admin prototype |
| Same-author references are separated | Passed | `src/domain/newProductEvaluation/comparableWorkSelector.js`, `test/m3-comparable-work-selector.test.js` |
| Author ranking observes the 3-measurable-work threshold | Passed | `src/domain/newProductEvaluation/authorRanking.js`, `test/m3-author-ranking.test.js` |
| Channel forecast is point-value per channel | Passed | `src/domain/newProductEvaluation/channelForecast.js`, `test/m3-channel-forecast.test.js` |
| `totalForecast` is the sum of channel forecasts | Passed | `src/domain/newProductEvaluation/channelForecast.js`, `test/m3-channel-forecast.test.js` |
| No forecast range is emitted | Passed | `test/m3-channel-forecast.test.js`, `test/m3-api-fixture.test.js` |
| Forecast weighting emits contribution explanation | Passed | `src/domain/newProductEvaluation/forecastWeighting.js`, `test/m3-forecast-weighting.test.js` |
| Rating is `new_product_candidate_rating` | Passed | `src/domain/newProductEvaluation/newProductRating.js`, `test/m3-new-product-rating.test.js` |
| Rating explanation includes support, limitation and warning | Passed | `src/domain/newProductEvaluation/ratingExplanation.js`, `test/m3-rating-explanation.test.js` |
| Workflow state machine covers the full chain | Passed | `src/domain/newProductEvaluation/workflowStateMachine.js`, `test/m3-workflow-state-machine.test.js` |
| Backtest anchor is snapshot-only | Passed | `src/domain/newProductEvaluation/backtestAnchor.js`, `test/m3-backtest-anchor.test.js` |
| No direct development recommendation is emitted | Passed | `test/m3-new-product-evaluation-engine.test.js`, `test/m3-admin-prototype.test.js` |
| No resource investment level is emitted | Passed | `test/m3-new-product-evaluation-engine.test.js`, `test/m3-admin-prototype.test.js` |
| No DB, migration, private material, real search or browser automation | Passed | `npm run check:no-real-data`, M3 guardrail tests |

## Remaining Boundary

The fixture chain does not prove real private-material extraction quality. That must be tested in a later local dry-run with user-provided private material that stays under ignored `data/` paths.

## Gate Recommendation

Proceed to private material dry-run preparation after the user selects 3-5 private topic materials. Do not enter formal execution.
