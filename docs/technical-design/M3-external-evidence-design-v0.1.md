# M3 external evidence design v0.1

Generated: 2026-06-28

Status: M3-3.5 fixture/prototype design. This document defines a structured external evidence layer for M3 new-product evaluation.

## Purpose

M3 material-first evaluation cannot rely only on operator-provided topic material. The system should identify missing external evidence and make the evidence auditable, reusable and explicit.

Current implementation remains fixture-only. It does not call search engines, ChatGPT web, Chrome plugins or browser automation.

## Evidence Types

Supported evidence types:

- `originalPlatformStats`
- `rankingSignal`
- `searchHeatSignal`
- `socialHeatSignal`
- `sameNameAudioEvidence`
- `adaptationEvidence`
- `publicationEvidence`
- `reviewReputationEvidence`
- `operatorResearchNote`
- `gptWebAssistedSummary`

## Evidence Record Shape

Each evidence record must contain:

- `evidenceId`
- `topicId`
- `materialId`
- `evidenceType`
- `sourceName`
- `sourceUrl` or `sourceDescription`
- `queryUsed`
- `collectedAt`
- `collectedBy`
- `rawExcerptSummary`, short summary only
- `metricName`
- `metricValue`
- `metricUnit`
- `confidence`
- `sourceReliability`
- `freshness`
- `manualConfirmed`
- `mappedFields`
- `limitations`
- `nonFormal`
- `fixtureOnly`
- `notForFormalDecision`

## GPT Web-Assisted Boundary

GPT web-assisted summaries are allowed only as manually entered structured research notes.

- They are not automatic facts.
- They are not a CI or test dependency.
- The current system does not call ChatGPT web.
- The current system does not drive Chrome plugins or browsers.
- If no cited source is recorded, the summary is low confidence only.
- If cited sources are recorded, the summary can be at most medium confidence.
- It must be manually confirmed before it can affect forecast or rating.

## Evaluation Use

Structured evidence can:

- supplement heat signals;
- supplement same-name audio status and check status;
- supplement adaptation signals;
- support source and publication context;
- support review and reputation context;
- influence forecast contribution explanations;
- influence rating explanation;
- produce limitations and research questions when missing.

Evidence does not create formal execution and does not produce development recommendations or resource investment levels.

## Providers

Implemented now:

- `manualEvidenceEntry`
- `gptWebAssistedManualEntry`
- `fixtureEvidenceProvider`

Future placeholders only:

- `futureSearchApiProvider`
- `futurePlatformApiProvider`
- `futureBrowserResearchProvider`

Future providers require separate authorization, source logging, failure handling and audit design.

## Safety Boundary

The layer stores no private material, no webpage full text, no raw material, no real work detail and no database output. It writes no migration and remains non-formal.
