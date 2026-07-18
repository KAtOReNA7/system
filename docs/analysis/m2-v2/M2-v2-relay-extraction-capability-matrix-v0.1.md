# M2 v2 Relay Extraction Capability Matrix v0.1

Status: `not_for_formal_decision`

This artifact is a sanitized, prospective pilot checkpoint. It contains no work title, author, query, URL, snippet, raw response body, private identifier, or credential.

```json
{
  "schema": "m2.v2.relay-extraction-capability-matrix-public.v0.1",
  "status": "not_for_formal_decision",
  "canaryExecuted": false,
  "full160Authorized": false,
  "adapterVersion": "m2-v2-relay-extraction-adapter-v0.2",
  "timeoutMs": 120000,
  "syntheticPhysicalRequestCount": 13,
  "models": {
    "gpt-5.6-luna": {
      "extractionMode": "blocked",
      "structuredMode": "local_json",
      "modelBindingStatuses": [
        "exact"
      ],
      "tests": [
        {
          "testId": "E0",
          "probe": "probe",
          "structuredMode": "plain",
          "httpStatus": 200,
          "timedOut": false,
          "passed": false,
          "carrier": null,
          "modelBindingStatus": "exact"
        },
        {
          "testId": "E1",
          "probe": "probe",
          "structuredMode": "server_strict",
          "httpStatus": 200,
          "timedOut": false,
          "passed": false,
          "carrier": null,
          "modelBindingStatus": "exact"
        },
        {
          "testId": "E1",
          "probe": "probe",
          "structuredMode": "local_json",
          "httpStatus": 200,
          "timedOut": false,
          "passed": false,
          "carrier": null,
          "modelBindingStatus": "exact"
        },
        {
          "testId": "E2",
          "probe": "probe",
          "structuredMode": "local_json",
          "httpStatus": 200,
          "timedOut": false,
          "passed": false,
          "carrier": null,
          "modelBindingStatus": "exact"
        },
        {
          "testId": "E3",
          "probe": "probe",
          "structuredMode": "local_json",
          "httpStatus": 200,
          "timedOut": false,
          "passed": false,
          "carrier": null,
          "modelBindingStatus": "exact"
        },
        {
          "testId": "E4",
          "probe": "probe_1",
          "structuredMode": "local_json",
          "httpStatus": 200,
          "timedOut": false,
          "passed": false,
          "carrier": null,
          "modelBindingStatus": "exact"
        },
        {
          "testId": "E4",
          "probe": "probe_2",
          "structuredMode": "local_json",
          "httpStatus": 200,
          "timedOut": false,
          "passed": false,
          "carrier": null,
          "modelBindingStatus": "exact"
        }
      ]
    },
    "gpt-5.6-terra": {
      "extractionMode": "full",
      "structuredMode": "server_strict",
      "modelBindingStatuses": [
        "exact"
      ],
      "tests": [
        {
          "testId": "E0",
          "probe": "probe",
          "structuredMode": "plain",
          "httpStatus": 200,
          "timedOut": false,
          "passed": false,
          "carrier": null,
          "modelBindingStatus": "exact"
        },
        {
          "testId": "E1",
          "probe": "probe",
          "structuredMode": "server_strict",
          "httpStatus": 200,
          "timedOut": false,
          "passed": true,
          "carrier": "root[0].output[0].content[0].text",
          "modelBindingStatus": "exact"
        },
        {
          "testId": "E2",
          "probe": "probe",
          "structuredMode": "server_strict",
          "httpStatus": 200,
          "timedOut": false,
          "passed": true,
          "carrier": "root[0].output[1].content[0].text",
          "modelBindingStatus": "exact"
        },
        {
          "testId": "E3",
          "probe": "probe",
          "structuredMode": "server_strict",
          "httpStatus": 200,
          "timedOut": false,
          "passed": true,
          "carrier": "root[0].output[0].content[0].text",
          "modelBindingStatus": "exact"
        },
        {
          "testId": "E4",
          "probe": "probe_1",
          "structuredMode": "server_strict",
          "httpStatus": 200,
          "timedOut": false,
          "passed": true,
          "carrier": "root[0].output[0].content[0].text",
          "modelBindingStatus": "exact"
        },
        {
          "testId": "E4",
          "probe": "probe_2",
          "structuredMode": "server_strict",
          "httpStatus": 200,
          "timedOut": false,
          "passed": true,
          "carrier": "root[0].output[0].content[0].text",
          "modelBindingStatus": "exact"
        }
      ]
    }
  },
  "tavilyRequestUsed": false
}
```
