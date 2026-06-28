# M3 research assist workflow v0.1

Generated: 2026-06-28

Status: M3-3.5 fixture/prototype design.

## Workflow

1. Parse material-first input into candidate fields.
2. Normalize fixture/manual external evidence.
3. Apply only manual-confirmed high or medium confidence evidence to derived fields.
4. Run readiness with derived evidence fields.
5. Generate research questions for missing or weak external evidence.
6. Feed structured evidence into forecast weighting and rating explanation.
7. Display questions and evidence in the read-only admin prototype.

## Research Questions

The generator can ask:

- whether same-name audiobook evidence exists;
- where the original work was published or serialized;
- whether there are reads, collections, ratings or comments;
- whether there are ranking signals;
- whether search or social heat exists;
- whether adaptation signals exist;
- whether author reference works exist;
- whether copyright or authorization risk exists;
- whether target channels have comparable public performance;
- whether operator-specified comparables have public support.

Each question includes purpose, suggested query, priority, expected evidence types and answer format hint.

## Current Collection Methods

Current implementation:

- `manualEvidenceEntry`
- `gptWebAssistedManualEntry`
- `fixtureEvidenceProvider`

Not implemented in this sprint:

- true search API;
- platform API;
- Chrome plugin;
- browser automation;
- ChatGPT web automation.

## Evidence Application Rules

- High or medium confidence and `manualConfirmed = true` can fill supported hard blockers.
- Low confidence evidence cannot fill hard blockers.
- Unconfirmed evidence cannot fill hard blockers.
- GPT-assisted evidence without a cited source is low confidence.
- GPT-assisted evidence with a cited source is at most medium confidence and still requires manual confirmation.
- Missing adaptation evidence is a warning/research question, not a hard blocker.

## Safety Boundary

The workflow stores only short summaries and structured fields. It does not save webpage full text, raw material, private files or formal results.
