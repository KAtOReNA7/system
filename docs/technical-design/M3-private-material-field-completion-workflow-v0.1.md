# M3 private material field completion workflow v0.1

Generated: 2026-06-28

## Purpose

This design adds a local private field completion workflow for M3 private material dry-runs. It addresses the current gap where materials can be accepted and partially parsed, but still remain readiness-blocked because core business fields are missing.

This workflow does not improve OCR, does not continue legacy `.doc` extraction work, does not call search or browser tools, and does not enter M3 formal execution.

## Trigger Conditions

Generate a field completion pack when any of these conditions exist:

- parse status is metadata-only or converter unavailable;
- extracted fields are insufficient;
- readiness hard blockers exist;
- user or operations needs to fill core fields before continuing the dry-run.

## Core Fields To Complete

The completion pack focuses on hard-blocking fields:

- `title`;
- `author`;
- `source`;
- `classificationCandidate` or `confirmedClassification`;
- `wordCount` or `audioVolumeEstimate`;
- at least one heat signal;
- `copyrightTermRange`;
- `targetChannels`;
- `sameNameAudioStatusCheckStatus`;
- `completionStatus` for `web_original` materials.

## Warning-Only Fields

These fields may improve interpretation but should not block the whole workflow by themselves:

- `synopsis`;
- `commentCount`;
- `adaptationSignals`;
- `operatorRecommendationReason`;
- `operatorComparators`;
- `materialSource`;
- `materialUpdatedAt`;
- `inputConfirmedBy`.

## Workflow

1. Run the private material dry-run.
2. If readiness is blocked, the runner emits `missingCoreFields`, `canGenerateFieldCompletionPack` and `completionPackRecommended`.
3. Generate a private completion pack under `data/private-output/m3-dry-run/`.
4. User fills the private pack locally.
5. Apply the private completion pack.
6. The apply step merges manual fields with anonymous material ids and reruns readiness, research questions, comparables, channel point forecast, candidate rating, workflow and backtest anchor generation.

The apply step only produces private local output and does not create a formal result.

## Private Pack Shape

Each anonymous material row includes:

- `anonymousMaterialId`;
- `inputExtension`;
- `parseStatus`;
- `readinessStatus`;
- `hardBlockerCodes`;
- `missingCoreFields`;
- `warningCodes`;
- `extractedCandidateSummary`;
- `researchQuestions`;
- `userFields.title`;
- `userFields.author`;
- `userFields.source`;
- `userFields.classification`;
- `userFields.wordCount`;
- `userFields.audioVolumeEstimate`;
- `userFields.heatSignalType`;
- `userFields.heatSignalValue`;
- `userFields.copyrightTermRange`;
- `userFields.targetChannels`;
- `userFields.sameNameAudioStatusCheckStatus`;
- `userFields.sameNameAudioStatus`;
- `userFields.completionStatus`;
- `userFields.notes`.

## Supported Private Output Formats

The first implementation writes:

- private JSON;
- private Markdown table.

XLSX remains optional and is not required for CI.

## Safety Boundary

- The completion pack must stay under `data/private-output/m3-dry-run/`.
- Private input and output must not be committed.
- Original materials must not be committed.
- Public docs must contain only aggregate and sanitized workflow descriptions.
- Console output must be aggregate-only and must not print true titles, authors or material text.
- No database is connected.
- No migration is written.
- No OCR is called.
- No real search, ChatGPT web, Chrome plugin or browser automation is called.
- No direct development recommendation is emitted.
- No resource investment level is emitted.
- Forecast output remains point-only and does not restore ranges.
- M3 formal execution remains blocked.

## User Action

The user should fill only the missing core fields first. After the pack is filled, run the apply command to produce an after-completion private dry-run result. If hard blockers remain, repeat field completion or provide additional material.
