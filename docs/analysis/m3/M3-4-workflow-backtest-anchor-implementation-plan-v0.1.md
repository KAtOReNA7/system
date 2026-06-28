# M3-4 workflow and backtest anchor implementation plan v0.1

Generated: 2026-06-28

## Goal

Implement the M3-4 fixture/prototype workflow chain and backtest anchor layer without entering formal execution.

## Implementation Scope

Planned implementation files:

- `src/domain/newProductEvaluation/workflowStateMachine.js`
- `src/domain/newProductEvaluation/backtestAnchor.js`
- `src/domain/newProductEvaluation/newProductEvaluationEngine.js`
- `src/repositories/newProductEvaluationFixtureRepository.js`
- `src/http/app.js`
- `public/admin/app.js`
- `test/m3-workflow-state-machine.test.js`
- `test/m3-backtest-anchor.test.js`
- `test/m3-new-product-evaluation-engine.test.js`
- `test/m3-api-fixture.test.js`
- `test/m3-admin-prototype.test.js`
- `package.json`

## API Plan

Add fixture-only endpoints:

- `GET /api/m3/new-product/material-fixtures/:id/workflow`
- `POST /api/m3/new-product/material-fixtures/:id/backtest-anchor`

Both endpoints must return `nonFormal`, `fixtureOnly` and `notForFormalDecision` markers and must not write database state.

## Admin Plan

Enhance the existing M3 material fixture admin page with:

- Workflow overview.
- Transition timeline.
- Full evaluation chain summary.
- Backtest anchor snapshot.
- Future backtest windows.
- Non-formal boundary copy.

## Testing Plan

Automated tests cover:

- Workflow starting from `material_received`.
- Research questions after parsing.
- `evidence_pending` when no evidence is attached.
- `readiness_blocked` with hard blockers.
- Warning-only readiness.
- Full ready chain through comparables, author ranking, forecast, rating and backtest anchor.
- Backtest anchor forecast/rating/input/evidence/comparable snapshots.
- Year 1, year 3 and year 5 future windows.
- API non-formal guard flags.
- Admin page display.
- No DB, no private files, no real search, no ChatGPT web, no Chrome plugin, no forecast range, no direct development recommendation and no resource investment level.

## Boundaries

This plan does not create user-filled manual test packages, does not run real backtests, does not write migration, does not read private materials and does not call real search or browser automation.
