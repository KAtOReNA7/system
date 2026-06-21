# M2 old-product evaluation API contract addendum v0.1

Status: M2-B-2.1 FIXTURE-ONLY ADDENDUM

This addendum supplements `M2-old-product-evaluation-api-contract-v0.1.md` for the M2-B-2.1 admin-page interaction pass. It does not authorize formal data mode, persistence, export, evaluation-task execution, or any write API.

## 1. Boundary

M2-B-2.1 remains fixture-only:

- all successful M2 old-product responses keep `dataset.mode="fixture"`;
- `formalDataAuthorized=false`;
- `formalEvaluationAllowed=false`;
- cutoff month remains `2026-04`;
- incomplete month `2026-05` remains excluded;
- formal old-product evaluation remains blocked until M1 formal data readiness is complete.

Still not implemented:

- formal mode;
- `local_dry_run` mode;
- export endpoints;
- evaluation task create, cancel, retry, or execution endpoints;
- write APIs;
- mapping activation;
- `switch_mapping_version`;
- persistence or database-backed M2 old-product repository.

## 2. Evaluation list interaction query parameters

The admin list page may call:

```text
GET /api/m2/old-products/evaluations
```

with these fixture-only query parameters:

| Parameter | Meaning | Valid values |
| --- | --- | --- |
| `query` | searches synthetic standard work id, work name, or author name | text |
| `rating` | rating filter | `S+`, `S`, `A`, `B`, `C`, `D`, `E` |
| `lifecycle` | lifecycle filter | `growth`, `stable`, `declining`, `long_tail`, `inactive`, `rebound`, `insufficient_history` |
| `risk` | highest risk severity filter | `high`, `medium`, `low` |
| `readiness` | readiness filter | `ready`, `blocked` |
| `resultStatus` | result status filter | `current`, `historical`, `invalidated` |
| `sort` | sort key | `forecastTotal.desc`, `forecastTotal.asc`, `last12MonthSales.desc`, `rating.asc`, `riskSeverity.desc`, `updatedAt.desc` |
| `page` | positive page number | positive integer |
| `pageSize` | positive page size | positive integer, max 100 |

Resetting the UI filters is equivalent to requesting the default fixture collection:

```text
GET /api/m2/old-products/evaluations?page=1&pageSize=20&sort=updatedAt.desc
```

The frontend must not filter a hidden full dataset to bypass the API. Interaction filters should result in a new API request.

## 3. Detail route and not_found behavior

Admin detail route:

```text
/admin#m2-detail:{standardWorkId}
```

API route:

```text
GET /api/m2/old-products/evaluations/{standardWorkId}
```

If the synthetic work id does not exist, the API returns `not_found` and the page displays a `not found` state. The error body must include `code` and `requestId`, and must not expose stack traces, SQL, connection strings, host details, private paths, or real business data.

The detail response can include a fixture result history summary through `history` and display `current`, `historical`, or `invalidated` result status. This remains read-only.

## 4. Readiness gap filters

The readiness gap page may call:

```text
GET /api/m2/old-products/readiness-gaps
```

with these additional fixture-only parameters:

| Parameter | Meaning | Valid values |
| --- | --- | --- |
| `gapCode` | gap code filter | values listed in v0.1 section 9 |
| `severity` | gap severity filter | `high`, `medium`, `low` |
| `readiness` | work readiness filter | `ready`, `blocked` |
| `page` | positive page number | positive integer |
| `pageSize` | positive page size | positive integer, max 100 |

Each gap row may include:

- `blocksFormalEvaluation`;
- `suggestedOwnerAction`.

These fields are display-only. They do not create remediation tasks and do not authorize import, activation, application, retry, or repair operations.

## 5. Backtest detail behavior

The backtest page may call:

```text
GET /api/m2/old-products/backtests
GET /api/m2/old-products/backtests/{backtestBatchId}
```

The UI can select a fixture backtest batch and reload the corresponding detail. The detail remains synthetic and fixture-only. Formal backtesting is still blocked by M1 formal data readiness.

Backtest examples may display:

- `covered`;
- `missed`;
- `over`;
- `under`.

## 6. State-response contract

| API outcome | Page state |
| --- | --- |
| successful response with rows | `success` |
| successful response with `items=[]` | `empty`; explain this is the current fixture filter result, not formal data absence |
| `formal_data_blocked` | `blocked`, not generic `error` |
| `bad_request` | `error` with safe code and request id |
| `not_found` | `not_found` |
| `database_not_configured` / `database_unavailable` | `degraded` when applicable |

Error rendering must keep:

- `error.code`;
- `error.requestId`.

Error rendering must not expose:

- stack traces;
- SQL;
- connection strings;
- host or port details;
- local private paths;
- real work names, authors, channels, revenues, bill fragments, or stage JSON body.

## 7. Explicitly out of scope

M2-B-2.1 does not change the M2-B-1 API safety boundary. The following remain unavailable:

- `POST /api/m2/old-products/evaluation-tasks`;
- task cancel/retry endpoints;
- export endpoints;
- formal mode endpoints;
- `local_dry_run` endpoints;
- any write API.

