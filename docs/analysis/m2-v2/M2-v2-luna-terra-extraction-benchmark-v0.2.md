# M2 v2 Luna/Terra Extraction Benchmark v0.2

Status: `not_for_formal_decision`

This artifact is a sanitized, prospective pilot checkpoint. It contains no work title, author, query, URL, snippet, raw response body, private identifier, or credential.

```json
{
  "schema": "m2.v2.luna-terra-extraction-benchmark-public-report.v0.2",
  "status": "not_for_formal_decision",
  "canaryExecuted": false,
  "full160Authorized": false,
  "sourceBundleDigest": "d68896763b2a7b63afd3580c623e06cd72eaa9432b396dd3e9e62b6a50f643df",
  "sameSourceBundleVerified": true,
  "logicalDenominatorPerModel": 6,
  "models": {
    "gpt-5.6-luna": {
      "extractionMode": "blocked",
      "structuredMode": "local_json",
      "bindingStatus": "unreported",
      "logicalReceiptCount": 6,
      "physicalRequestCount": 0,
      "schemaPassCount": 0,
      "schemaPassRate": 0,
      "noTimeoutRate": 0,
      "resolvedWorkCount": 0,
      "acceptedClaimCount": 0,
      "pilotUsableClaimCount": 0,
      "rejectedClaimCount": 0,
      "rejectionReasons": {},
      "pilotUsableWorkCoverage": 0,
      "sourceIdIntegrityRate": 1,
      "capturedAtCompleteness": 0,
      "availableAtCompleteness": 0,
      "eventTimeCompleteness": 0,
      "repeatSchemaPassCount": 0,
      "repeatClaimAgreement": null,
      "p50QualityLatencyMs": null,
      "p90QualityLatencyMs": null,
      "totalQualityTokens": null,
      "safetyGate": {
        "items": [
          {
            "id": "private_leak_zero",
            "actual": 0,
            "threshold": 0,
            "passed": true
          },
          {
            "id": "fabricated_source_id_zero",
            "actual": 0,
            "threshold": 0,
            "passed": true
          },
          {
            "id": "model_generated_url_zero",
            "actual": 0,
            "threshold": 0,
            "passed": true
          },
          {
            "id": "source_id_integrity",
            "actual": 1,
            "threshold": 1,
            "passed": true
          },
          {
            "id": "unresolved_conflicted_accepted_zero",
            "actual": 0,
            "threshold": 0,
            "passed": true
          },
          {
            "id": "historical_backfill_zero",
            "actual": 0,
            "threshold": 0,
            "passed": true
          },
          {
            "id": "schema_pass_rate",
            "actual": 0,
            "threshold": 0.75,
            "passed": false
          },
          {
            "id": "source_time_pipeline_complete",
            "actual": false,
            "threshold": true,
            "passed": false
          },
          {
            "id": "no_timeout_rate",
            "actual": 0,
            "threshold": 0.75,
            "passed": false
          },
          {
            "id": "model_binding_not_mismatch",
            "actual": "unreported",
            "threshold": "not_mismatch",
            "passed": true
          }
        ],
        "passedCount": 7,
        "totalCount": 10,
        "allPassed": false
      },
      "qualityGate": {
        "items": [
          {
            "id": "resolved_work_count",
            "actual": 0,
            "threshold": 3,
            "passed": false
          },
          {
            "id": "pilot_usable_work_count",
            "actual": 0,
            "threshold": 2,
            "passed": false
          },
          {
            "id": "repeat_schema_pass_count",
            "actual": 0,
            "threshold": 1,
            "passed": false
          },
          {
            "id": "repeat_claim_agreement_evaluable",
            "actual": false,
            "threshold": true,
            "passed": false
          }
        ],
        "passedCount": 0,
        "totalCount": 4,
        "allPassed": false
      }
    },
    "gpt-5.6-terra": {
      "extractionMode": "full",
      "structuredMode": "server_strict",
      "bindingStatus": "verified",
      "logicalReceiptCount": 6,
      "physicalRequestCount": 6,
      "schemaPassCount": 6,
      "schemaPassRate": 1,
      "noTimeoutRate": 1,
      "resolvedWorkCount": 3,
      "acceptedClaimCount": 12,
      "pilotUsableClaimCount": 12,
      "rejectedClaimCount": 11,
      "rejectionReasons": {
        "claim_exceeds_snippet_support": 9,
        "claim_not_accepted": 11,
        "conflict_unresolved": 6
      },
      "pilotUsableWorkCoverage": 0.75,
      "sourceIdIntegrityRate": 1,
      "capturedAtCompleteness": 1,
      "availableAtCompleteness": 1,
      "eventTimeCompleteness": 0,
      "repeatSchemaPassCount": 2,
      "repeatClaimAgreement": 0.75,
      "p50QualityLatencyMs": 29778,
      "p90QualityLatencyMs": 62024,
      "totalQualityTokens": 46330,
      "safetyGate": {
        "items": [
          {
            "id": "private_leak_zero",
            "actual": 0,
            "threshold": 0,
            "passed": true
          },
          {
            "id": "fabricated_source_id_zero",
            "actual": 0,
            "threshold": 0,
            "passed": true
          },
          {
            "id": "model_generated_url_zero",
            "actual": 0,
            "threshold": 0,
            "passed": true
          },
          {
            "id": "source_id_integrity",
            "actual": 1,
            "threshold": 1,
            "passed": true
          },
          {
            "id": "unresolved_conflicted_accepted_zero",
            "actual": 0,
            "threshold": 0,
            "passed": true
          },
          {
            "id": "historical_backfill_zero",
            "actual": 0,
            "threshold": 0,
            "passed": true
          },
          {
            "id": "schema_pass_rate",
            "actual": 1,
            "threshold": 0.75,
            "passed": true
          },
          {
            "id": "source_time_pipeline_complete",
            "actual": true,
            "threshold": true,
            "passed": true
          },
          {
            "id": "no_timeout_rate",
            "actual": 1,
            "threshold": 0.75,
            "passed": true
          },
          {
            "id": "model_binding_not_mismatch",
            "actual": "verified",
            "threshold": "not_mismatch",
            "passed": true
          }
        ],
        "passedCount": 10,
        "totalCount": 10,
        "allPassed": true
      },
      "qualityGate": {
        "items": [
          {
            "id": "resolved_work_count",
            "actual": 3,
            "threshold": 3,
            "passed": true
          },
          {
            "id": "pilot_usable_work_count",
            "actual": 3,
            "threshold": 2,
            "passed": true
          },
          {
            "id": "repeat_schema_pass_count",
            "actual": 2,
            "threshold": 1,
            "passed": true
          },
          {
            "id": "repeat_claim_agreement_evaluable",
            "actual": true,
            "threshold": true,
            "passed": true
          }
        ],
        "passedCount": 4,
        "totalCount": 4,
        "allPassed": true
      }
    }
  },
  "benchmarkDecision": "BENCHMARK_PASS",
  "defaultExtractionModel": "gpt-5.6-terra",
  "escalationModel": "gpt-5.6-terra",
  "selectionReasons": [
    "terra_only_model_passing_all_gates"
  ],
  "newTavilyPhysicalRequestCount": 0
}
```
