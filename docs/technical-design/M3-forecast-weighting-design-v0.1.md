# M3 forecast weighting design v0.1

Generated: 2026-06-28

Status: M3-3 fixture/prototype design. This document defines non-formal forecast weighting for synthetic M3 material fixtures only.

## Scope

M3 forecast output remains channel-level point estimate only. It does not emit forecast range, high/base/low scenarios, optimistic or pessimistic scenarios, development recommendation, resource investment level, or formal execution result.

## Signals

The weighting layer uses explanation signals from M3-1 and M3-2:

- readiness quality
- heat signal strength
- comparable works strength
- same-author reference strength
- author ranking tier
- adaptation signal boost
- source type
- target channel suitability
- same-name audio risk
- material completeness warning
- buyout treatment limitation

## Output

Each evaluation forecast includes:

- `forecastShape = point_estimate_only`
- `channelForecasts[]`
- `totalForecast`
- `forecastWeighting`
- `forecastContributions[]`
- `confidenceNotes[]`
- `limitations[]`

Each channel also includes `channelContributionBreakdown[]`, scaled from the same forecast contribution list.

## Contribution Shape

Each contribution contains:

- `signalCode`
- `signalName`
- `direction`
- `weight`
- `contributionAmount`
- `explanation`
- `limitations`

## Aggregation Rule

Channel forecasts remain independently visible. `totalForecast` is the sum of all channel point forecasts:

- first-year total equals the sum of channel first-year forecasts
- each year in the year 1-5 breakdown equals the sum of the same year across channels
- five-year total equals the sum of channel five-year totals

## Safety Boundary

This design does not read private material, real works, real authors, raw bill rows, or databases. It does not write migrations and does not enter M3 formal execution.
