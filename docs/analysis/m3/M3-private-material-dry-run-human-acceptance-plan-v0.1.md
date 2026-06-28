# M3 private material dry-run human acceptance plan v0.1

Generated: 2026-06-28

## Purpose

This plan defines what the user should review after a future local private-material dry-run. It is not a formal acceptance result and does not read private material in this sprint.

## User Review Checklist

1. Field extraction accuracy: title, author, source, classification candidate, volume, heat, copyright term and target channels.
2. Missing-field prompts: whether missing fields are reasonable and actionable.
3. Research questions: whether questions help a human collect missing heat, same-name audio, adaptation or publication evidence.
4. External evidence structure: whether GPT web-assisted or manual search results can be recorded as source, short summary, metric, confidence and manual confirmation.
5. Readiness strictness: whether blockers are limited to core fields and warnings do not over-block.
6. Comparables: whether system comparables are interpretable and operator comparables remain visible beside them.
7. Author ranking: whether the 3-measurable-work threshold enables or disables ranking reasonably.
8. Channel forecast: whether channel-level point forecasts match the business habit of summing all channel forecasts.
9. Rating explanation: whether support, limitation and warning factors are useful.
10. Workflow: whether current state, completed steps, pending steps and transition timeline are clear.
11. Backtest anchor: whether snapshots preserve enough context for future year 1, year 3 and year 5 review.
12. Forbidden output check: confirm no direct development recommendation is shown.
13. Forbidden output check: confirm no resource investment level is shown.

## Acceptance Labels

For each private material, user can mark:

- `pass`
- `minor_issue`
- `major_issue`
- `blocked`
- `needs_more_material`

## Minimum Pass Criteria

M3 private dry-run can be considered locally usable only when:

- at least 3 private materials run end-to-end;
- no raw material or private output is tracked by Git;
- core field extraction issues are reviewable by humans;
- readiness blockers are explainable;
- forecast output remains point-only and channel-based;
- rating output remains `new_product_candidate_rating`;
- workflow and backtest anchor are visible;
- no formal execution result is produced.

## Next Step After Human Review

If the first private dry-run passes, the next sprint can design a controlled M3 private dry-run script and sanitized aggregate report format. If it fails, the next sprint should fix the smallest failed area only.
