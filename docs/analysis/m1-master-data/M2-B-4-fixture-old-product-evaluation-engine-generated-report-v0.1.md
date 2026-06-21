# M2-B-4 fixture old-product evaluation engine generated report v0.1

## 1. Status

- status: pass
- mode: fixture
- stage: M2-B-4
- syntheticOnly: true
- notForFormalDecision: true
- result count: 7
- backtest batch count: 1

## 2. Dataset boundary

The generated results are based only on embedded fixture/synthetic inputs.

They are not formal business evidence and must not be used for formal old-product evaluation, financial decisions, or mapping activation.

## 3. Lifecycle coverage

Covered lifecycle labels:

- growth
- stable
- declining
- long_tail
- inactive
- rebound
- insufficient_history

## 4. Rating coverage

Covered rating labels:

- S+
- S
- A
- B
- C
- D
- E

The rating thresholds and fixture calibration are non-formal and exist only to validate object shape, API compatibility, and test coverage.

## 5. Forecast shape

Each generated result includes:

- base scenario;
- optimistic scenario;
- pessimistic scenario;
- annual breakdown;
- remaining month count;
- assumptions;
- confidence;
- lower/upper range;
- incomplete month exclusion marker.

## 6. Risk and suggestion shape

Each generated result includes:

- structured risks with code, severity, message, evidence, and mitigation hint;
- structured suggestions with action, priority, reason, expected impact, and `notForFormalDecision=true`.

## 7. Backtest shape

The synthetic backtest batch includes:

- batch id;
- algorithm version;
- covered count;
- missed count;
- over count;
- under count;
- summary;
- `syntheticOnly=true`.

No real backtest was executed.

## 8. Safety result

The engine and CLI did not:

- connect to a database;
- execute Docker;
- read `data/`;
- read stage JSON body;
- read operations confirmation body;
- read database connection strings;
- import real data;
- activate mapping;
- call `switch_mapping_version`;
- execute formal migration;
- add write/export/evaluation-task/formal/local_dry_run capability.
