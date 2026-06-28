# M3-3 forecast rating integration plan v0.1

Generated: 2026-06-28

## Goal

Integrate M3-1 readiness and channel forecast signals with M3-2 comparable works and author ranking signals. The output remains fixture-only, non-formal, and not for formal decision.

## Implementation Plan

1. Add `forecastWeighting.js` to produce contribution explanations for point forecasts.
2. Add `ratingExplanation.js` to produce candidate rating explanation factors.
3. Extend `channelForecast.js` so each channel includes contribution breakdown.
4. Extend `newProductRating.js` so ratings include support, limitation, warning, comparable, author, heat, adaptation, and same-name audio influences.
5. Extend the M3 evaluation engine so comparable works and author ranking are built before forecast and rating.
6. Extend the read-only admin prototype to display forecast weighting and rating explanation.
7. Add M3-3 tests and include them in `npm test`.

## Explicit Non-goals

- no formal execution
- no database connection
- no migration
- no private material read
- no manual review package
- no development recommendation
- no resource investment level
- no forecast range or scenario output

## Validation Policy

M3-3 uses automated tests only. User manual testing is deferred until the main M3 chain is complete.
