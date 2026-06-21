# M2-B-5 fixture evaluation productization and calibration prep report v0.1

## 1. Scope

This round productizes the existing M2-B fixture old-product evaluation result for API and minimal admin display, and prepares the M2-C real cleaned-bill calibration input contract.

The round remains technical-line only. It does not read real bills, master-data bodies, operation confirmation workbooks, staging JSON bodies, environment files, or database connection strings. It does not connect to a database, run Docker, modify migrations, import real data, activate mappings, add write APIs, add export APIs, create evaluation tasks, or implement formal/local-dry-run mode.

## 2. API result productization

The fixture list response now exposes product-facing summary fields derived from the existing `oldProductEvaluationResult`:

- lifecycle confidence;
- rating score;
- forecast range;
- remaining copyright months;
- incomplete-month exclusion flag;
- warning count;
- `syntheticOnly`;
- `notForFormalDecision`.

Backtest summaries now expose the synthetic coverage-shape fields:

- `summary`;
- `syntheticOnly`;
- `covered`;
- `missed`;
- `over`;
- `under`.

Detail responses continue to expose the full `oldProductEvaluationResult` object, warnings, generated time, forecast, rating, lifecycle, risks, suggestions, input snapshot, and backtest summary.

## 3. Admin display productization

The `/admin` M2 fixture pages now make the evaluation result easier to inspect:

- list table shows lifecycle confidence, rating score, and fixture boundary;
- detail page shows lifecycle confidence, rating score, rating rationale, forecast range, incomplete-month exclusion, generated time, warnings, `oldProductEvaluationResult` presence, `syntheticOnly`, `notForFormalDecision`, and backtest summary;
- backtest page states that only a synthetic backtest shape is shown and no real backtest was executed.

No write, import, activation, cancellation, retry, export, migration, or formal-evaluation entry point was added.

## 4. Contract updates

Updated:

- `docs/api/M2-old-product-evaluation-api-contract-v0.1.md`

Added:

- `docs/technical-design/M2-C-real-bill-calibration-input-contract-v0.1.md`

The M2-C contract defines aggregate-only input expectations for future real cleaned-bill calibration and explicitly separates fixture proof from formal calibration.

## 5. Test coverage added or strengthened

Tests now cover:

- detail API exposes `oldProductEvaluationResult`;
- list API exposes lifecycle confidence, rating score, forecast range, incomplete-month exclusion, warning count, and non-formal flags;
- backtest list/detail expose synthetic shape fields;
- admin detail renders lifecycle, forecast, rating, risk, suggestion, warning, and non-formal boundary information;
- admin backtest page renders synthetic backtest shape and no-real-backtest boundary;
- existing safety tests continue to confirm no write/export/task endpoints and no forbidden capability exposure.

## 6. Safety boundary confirmation

Confirmed design boundary:

- no formal database connection;
- no real bill import;
- no master-data import;
- no operation confirmation result import;
- no formal mapping version application;
- no migration changes;
- no `data/` startup input;
- no new write API;
- no export API;
- no evaluation task API;
- no formal/local-dry-run implementation.

## 7. Remaining risks

- Fixture thresholds remain non-formal and must not become business rules.
- Real cleaned-bill calibration requires aggregate input authorization and versioned source manifests.
- Formal rating, risk, tag, channel, and backtest acceptance rules remain PENDING-DATA.
- Existing admin source contains historical mojibake text. This round avoids broad copy rewrites and only adds ASCII labels for new result fields.

## 8. Stage conclusion

M2-B-5 is suitable as a fixture-only productization step. It improves API/admin inspection quality and creates the input contract needed to plan M2-C calibration, but it does not authorize or implement real-data evaluation.
