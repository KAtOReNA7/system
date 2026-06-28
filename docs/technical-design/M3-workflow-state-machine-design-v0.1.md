# M3 workflow state machine design v0.1

Generated: 2026-06-28

Status: M3-4 fixture/prototype design. This document defines the non-formal workflow state machine for synthetic M3 material fixtures.

## Scope

The workflow state machine chains the existing M3 fixture modules into one auditable timeline:

- `materialFieldExtractor`
- `researchQuestionGenerator`
- `externalEvidence`
- `newProductReadiness`
- `comparableWorkSelector`
- `authorRanking`
- `channelForecast`
- `forecastWeighting`
- `newProductRating`
- `ratingExplanation`
- `newProductEvaluationEngine`
- `backtestAnchor`

It does not write a database, execute migration, create formal result, represent official approval, or open formal task/export/write APIs.

## States

The fixture state list is:

- `material_received`
- `material_parsed`
- `research_questions_generated`
- `evidence_pending`
- `evidence_attached`
- `readiness_blocked`
- `readiness_warning_only`
- `ready_for_fixture_evaluation`
- `comparables_selected`
- `author_ranking_evaluated`
- `forecast_generated`
- `rating_explained`
- `fixture_evaluation_completed`
- `backtest_anchor_candidate`
- `backtest_anchor_locked_fixture`

All states are fixture/prototype states only.

## Workflow Output

The evaluation result includes:

```json
{
  "workflow": {
    "currentState": "backtest_anchor_candidate",
    "completedSteps": [],
    "pendingSteps": [],
    "blockedReasons": [],
    "warnings": [],
    "transitionLog": [],
    "nonFormal": true,
    "fixtureOnly": true,
    "notForFormalDecision": true
  }
}
```

Each transition log item includes:

- `fromState`
- `toState`
- `reason`
- `triggeredBy`
- `timestampSynthetic`
- `nonFormal`

## Transition Rules

- Every workflow starts from `material_received`.
- Material parsing moves to `material_parsed`.
- Research-question generation moves to `research_questions_generated`.
- If no fixture/manual evidence is attached, the workflow moves to `evidence_pending` and later evaluation steps remain pending.
- If evidence is attached, the workflow moves to `evidence_attached`.
- Readiness hard blockers move to `readiness_blocked`.
- Warning-only readiness moves through `readiness_warning_only` and can continue to `ready_for_fixture_evaluation`.
- Ready fixtures can move through comparables, author ranking, point forecast and rating explanation.
- Completed fixture evaluation moves to `fixture_evaluation_completed`.
- A snapshot candidate moves to `backtest_anchor_candidate`.
- The POST fixture endpoint can produce `backtest_anchor_locked_fixture` in memory only.

## Boundaries

- No database connection.
- No database write.
- No migration.
- No real search.
- No ChatGPT web call.
- No Chrome plugin or browser automation.
- No raw material storage.
- No private file read.
- No forecast range.
- No direct development recommendation.
- No resource investment level.
- No formal execution.
