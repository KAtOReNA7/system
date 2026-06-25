# M1 Dual-Source Auto-Apply Rule v2

- Status: `corrected_by_user_spotcheck_feedback`
- Allowed autoApply fields: `authorName, copyrightEndDate, copyrightStartDate, standardWorkName`
- Never autoApply fields: `classificationLevel1, classificationLevel2, classificationLevel3, requiredTags`

## Core Rules
- Dual-source conflict: never autoApply; user-confirmed staging only.
- Classification and tags: recommendation candidate only; no autoApply.
- Title/author: exact or mapping ID, single source, no conflict, empty current value, high confidence only.
- Copyright dates: exact or mapping ID, single source, parsed clear date, no relative term, no renewal, no multi-date conflict.
- User corrected values: do not generalize automatically.
