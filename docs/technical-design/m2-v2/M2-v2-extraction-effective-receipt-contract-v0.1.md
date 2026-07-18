# M2 v2 Extraction Effective Receipt Contract v0.1

Status: `not_for_formal_decision`

This artifact is a sanitized, prospective pilot checkpoint. It contains no work title, author, query, URL, snippet, raw response body, private identifier, or credential.

```json
{
  "schema": "m2.v2.extraction-effective-receipt-contract-public.v0.1",
  "status": "not_for_formal_decision",
  "canaryExecuted": false,
  "full160Authorized": false,
  "logicalDenominator": {
    "primaryPerModel": 4,
    "repeatPerModel": 2,
    "totalPerModel": 6
  },
  "selectionPrecedence": [
    "successful_repair",
    "successful_primary",
    "latest_explicit_failure",
    "indeterminate",
    "missing"
  ],
  "cacheKeyFields": [
    "adapterVersion",
    "capabilityProfileDigest",
    "extractionMode",
    "structuredMode",
    "timeoutMs",
    "sourceBundleDigest",
    "model",
    "phase",
    "runKind",
    "attemptKind",
    "schemaVersion"
  ],
  "timeoutQualityRule": "timeout_attempts_are_not_included_in_model_quality_latency_or_schema_denominators_except_explicit_no-timeout_gate",
  "cumulativeLegacyAttemptPollutionAllowed": false,
  "rawResponsePersisted": false
}
```
