# M2 export release gate fixture API contract v0.1

Status: fixture-only export prototype.

This contract documents the M2-FR-6 export release gate prototype. It is not a formal export API, does not create formal export files, and does not persist release state.

## Scope

The fixture API validates the shape of a future export package and the release gate workflow:

- export eligibility;
- allowed output fields;
- forbidden field detection;
- approval, release, rollback and invalidation states;
- audit event shape;
- guard flags proving no formal execution or database write occurred.

## Fixture endpoints

```text
GET  /api/m2/fixture/exports
GET  /api/m2/fixture/exports/{exportId}
POST /api/m2/fixture/exports
POST /api/m2/fixture/exports/{exportId}/actions
```

All responses must include:

```json
{
  "mode": "fixture",
  "notForFormalDecision": true,
  "formalEvaluationExecuted": false,
  "databaseWritten": false,
  "mappingVersionActivated": false,
  "switchMappingVersionCalled": false,
  "formalExportCreated": false
}
```

## Export eligibility

The fixture gate blocks export when:

- readiness gate is blocked;
- blocking manual review is not approved or waived;
- downlist or suspend candidate has no manual confirmation;
- renewal review candidate has no manual confirmation;
- candidate version differs from `m2-c3-cleaned-bill-nonformal-v0.2/candidate-a`;
- formal-style release is requested while `formalEvaluationExecuted=false`;
- forbidden fields are present.

## Allowed output fields

Fixture package payload may contain only:

- `standardWorkId`;
- `rating`;
- `lifecycle`;
- `riskTags`;
- `suggestionCodes`;
- `reviewStatus`;
- `readinessStatus`;
- `candidateVersion`;
- `algorithmVersion`;
- `parameterVersion`;
- `cutoffMonth`;
- `generatedAt`;
- `exportEligibilityStatus`;
- `auditSummary`;
- `notForFormalDecision`;
- `formalEvaluationExecuted`;
- `mode`.

## Forbidden fields

The fixture field check rejects:

- raw bill rows;
- real book titles;
- author names;
- channel names;
- per-work revenue details;
- database connection information;
- `.env` contents;
- unsanitized operator confirmation body;
- field combinations that could re-identify real per-work revenue.

## Release gate statuses and actions

Statuses:

```text
draft
pending_approval
approved_for_export
rejected
released
rolled_back
invalidated
```

Actions:

```text
submit_for_approval
approve_export
reject_export
release
rollback
invalidate
```

Every transition returns an audit event:

```json
{
  "eventId": "SYN-FR-EXPORT-AUDIT-...",
  "releaseId": "SYN-FR-RELEASE-...",
  "exportId": "SYN-FR-EXPORT-...",
  "action": "release",
  "actor": "SYN-FIXTURE-OPERATOR",
  "reason": "Fixture-only export release gate simulation",
  "previousStatus": "approved_for_export",
  "nextStatus": "released",
  "fixtureOnly": true,
  "databaseWritten": false,
  "formalExportCreated": false
}
```

## Future formal integration boundary

A future formal export API must connect to formal readiness gate results, blocking review state, advisory confirmation state, task results and persistence state. That future API is not implemented here.

## Prohibited behavior

This contract does not authorize:

- formal evaluation;
- formal export creation;
- database writes;
- migration execution;
- mapping version activation;
- `switch_mapping_version`;
- real data import;
- reading original bills, ledgers or private confirmation workbooks.
