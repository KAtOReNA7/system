export const SYNTHETIC_CAPTURED_AT = "2026-07-18T02:00:00.000Z";

export function responsesDirectAnnotationFixture() {
  return {
    id: "resp_synthetic_direct",
    model: "synthetic-search-model",
    status: "completed",
    output: [
      {
        type: "web_search_call",
        status: "completed",
        action: { type: "search", query: "synthetic query", sources: [] },
      },
      {
        type: "message",
        content: [{
          type: "output_text",
          text: "A synthetic reference supports discovery.",
          annotations: [{
            type: "url_citation",
            url: "https://research.example/article-one",
            title: "Synthetic Source One",
            start_index: 2,
            end_index: 21,
          }],
        }],
      },
    ],
  };
}

export function relayNestedAnnotationFixture() {
  return {
    relayRequestId: "relay_synthetic_outer",
    response: {
      id: "resp_synthetic_nested",
      model: "synthetic-relay-model",
      status: "completed",
      output: [
        {
          type: "web_search_call",
          status: "completed",
          action: { type: "search", query: "synthetic nested query", sources: [] },
        },
        {
          type: "message",
          content: [{
            type: "output_text",
            text: "Nested relay citation carrier.",
            annotations: [{
              type: "url_citation",
              citation: {
                url_citation: {
                  url: "https://nested.example/source-two",
                  title: "Synthetic Nested Source",
                  start_index: 0,
                  end_index: 13,
                },
              },
            }],
          }],
        },
      ],
    },
  };
}

export function extractionResponseFixture(sourceId, overrides = {}) {
  const evidence = {
    claim: "Synthetic publication event occurred.",
    claimType: "publication_event",
    structuredValue: {
      valueType: "date",
      textValue: null,
      dateValue: "2024-01-01",
      numberValue: null,
      booleanValue: null,
    },
    sourceIds: [sourceId],
    confidence: 0.8,
    eventTime: "2024-01-01T00:00:00.000Z",
    availableAt: "2024-01-02T00:00:00.000Z",
    entityResolution: {
      status: "high",
      matchedTitle: "Synthetic Work",
      matchedAuthor: "Synthetic Author",
    },
    contradictionStatus: "none",
    ...overrides,
  };
  return {
    id: "resp_synthetic_extraction",
    model: "synthetic-extraction-model",
    status: "completed",
    output: [{
      type: "message",
      content: [{ type: "output_text", text: JSON.stringify({ evidence: [evidence] }) }],
    }],
  };
}

export function syntheticSearchMeta() {
  return {
    capturedAt: SYNTHETIC_CAPTURED_AT,
    providerId: "synthetic_openai_compatible_relay",
    requestedModelId: "synthetic-search-model",
  };
}
