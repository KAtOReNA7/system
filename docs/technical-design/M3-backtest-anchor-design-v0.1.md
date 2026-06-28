# M3 backtest anchor design v0.1

Generated: 2026-06-28

Status: M3-4 fixture/prototype design. This document defines an in-memory fixture backtest anchor snapshot for later M3/M4 validation design.

## Purpose

The backtest anchor captures the point-in-time fixture evaluation context that a future backtest could compare against after real operational outcomes exist. M3-4 only creates the anchor shape and fixture snapshot behavior. It does not run a real backtest.

## Anchor Shape

```json
{
  "backtestAnchor": {
    "anchorId": "SYN-M3-ANCHOR-SYN-M3-MATERIAL-001",
    "topicId": "SYN-M3-TOPIC-001",
    "materialId": "SYN-M3-MATERIAL-001",
    "evaluationId": "SYN-M3-EVAL-SYN-M3-MATERIAL-001",
    "anchorType": "fixture_backtest_anchor_candidate",
    "anchorStatus": "candidate",
    "lockedAtSynthetic": null,
    "forecastSnapshot": {},
    "ratingSnapshot": {},
    "inputSnapshot": {},
    "evidenceSnapshot": {},
    "comparableSnapshot": {},
    "limitations": [],
    "futureBacktestWindows": {
      "year1": {},
      "year3": {},
      "year5": {}
    },
    "nonFormal": true,
    "fixtureOnly": true,
    "notForFormalDecision": true
  }
}
```

## Snapshots

- `forecastSnapshot` stores point-estimate status, total forecast, channel count, contribution codes and blocker codes.
- `ratingSnapshot` stores the candidate rating, rating type, basis and explanation factor counts.
- `inputSnapshot` stores parsed field keys, missing fields and manual-fill requirements, not raw material.
- `evidenceSnapshot` stores evidence IDs, evidence types and aggregate summary, not webpage full text.
- `comparableSnapshot` stores system comparable IDs, operator comparator IDs, same-author IDs and author ranking summary.

## Future Windows

The anchor always exposes future windows:

- `year1`
- `year3`
- `year5`

These are future fixture windows only. They do not read post-launch revenue and do not produce real backtest results.

## Boundary

- No real backtest.
- No post-launch revenue read.
- No database write.
- No formal anchor.
- No M4 entry.
- No formal execution.
- No private material or webpage full text storage.
