export const M3_NEW_PRODUCT_FIXTURE_DATASET = Object.freeze({
  mode: "fixture",
  source: "m3-material-first-synthetic-fixture",
  syntheticOnly: true,
  nonFormal: true,
  formalExecutionAllowed: false,
  rawMaterialStored: false,
  privateFileRead: false,
  notForFormalDecision: true,
  generatedAt: "2026-06-28T00:00:00Z"
});

export const M3_NEW_PRODUCT_MATERIAL_FIXTURES = Object.freeze([
  Object.freeze({
    materialId: "SYN-M3-MATERIAL-001",
    materialType: "word",
    inputMode: "material_first",
    materialMetadata: Object.freeze({
      title: "Synthetic material with channel forecast",
      rawMaterialStored: false,
      rawTextPersisted: false,
      privateFileRead: false
    }),
    fields: Object.freeze({
      title: "SYN-M3-TITLE-001",
      author: "SYN-M3-AUTHOR-001",
      source: "publication",
      classificationCandidate: Object.freeze(["SYN-M3-L1-A", "SYN-M3-L2-A", "SYN-M3-L3-A"]),
      synopsis: "Synthetic synopsis summary only.",
      wordCount: 720000,
      completionStatus: "completed",
      reads: 68000,
      collections: 9200,
      ratingScore: 8.8,
      commentCount: 1400,
      rankings: Object.freeze(["SYN-RANK-TOP-10"]),
      searchHeat: Object.freeze({ level: "strong" }),
      socialHeat: Object.freeze({ level: "usable" }),
      platformHeat: Object.freeze({ level: "strong" }),
      sameNameAudioStatus: "none",
      sameNameAudioStatusCheckStatus: "checked",
      adaptationSignals: Object.freeze(["screen", "comic"]),
      externalHeat: Object.freeze({ summary: "synthetic multi-signal heat" }),
      targetChannels: Object.freeze([
        Object.freeze({
          channelId: "SYN-M3-CHANNEL-A",
          channelName: "SYN-M3-CHANNEL-A",
          weight: 1.2,
          channelFit: 1.1,
          confidence: "strong"
        }),
        Object.freeze({
          channelId: "SYN-M3-CHANNEL-B",
          channelName: "SYN-M3-CHANNEL-B",
          weight: 0.8,
          channelFit: 0.95,
          confidence: "usable"
        })
      ]),
      copyrightTermRange: "5 years",
      operatorRecommendationReason: "Synthetic operator reason summary.",
      operatorComparators: Object.freeze(["SYN-M3-OP-COMPARATOR-001"]),
      materialSource: "synthetic fixture material",
      materialUpdatedAt: "2026-06-28",
      inputConfirmedBy: "synthetic operator"
    }),
    confidenceByField: Object.freeze({
      title: 0.96,
      author: 0.95,
      source: 0.92,
      classificationCandidate: 0.74,
      copyrightTermRange: 0.76
    })
  }),
  Object.freeze({
    materialId: "SYN-M3-MATERIAL-002",
    materialType: "ppt",
    inputMode: "material_first",
    materialMetadata: Object.freeze({
      title: "Synthetic variable-field material",
      rawMaterialStored: false,
      rawTextPersisted: false,
      privateFileRead: false
    }),
    fields: Object.freeze({
      title: "SYN-M3-TITLE-002",
      author: "SYN-M3-AUTHOR-002",
      source: "web_original",
      classificationCandidate: Object.freeze(["SYN-M3-L1-B", "SYN-M3-L2-B", "SYN-M3-L3-B"]),
      audioVolumeEstimate: 80,
      completionStatus: "ongoing",
      reads: 24000,
      platformHeat: Object.freeze({ level: "usable" }),
      sameNameAudioStatus: "unknown",
      sameNameAudioStatusCheckStatus: "checked",
      targetChannels: Object.freeze([
        Object.freeze({
          channelId: "SYN-M3-CHANNEL-C",
          channelName: "SYN-M3-CHANNEL-C",
          weight: 1,
          channelFit: 1,
          confidence: "usable"
        })
      ]),
      copyrightTermRange: "3 years",
      materialSource: "synthetic fixture slide"
    }),
    confidenceByField: Object.freeze({
      title: 0.9,
      author: 0.88,
      source: 0.91,
      classificationCandidate: 0.68,
      reads: 0.73
    })
  }),
  Object.freeze({
    materialId: "SYN-M3-MATERIAL-003",
    materialType: "manual_text",
    inputMode: "material_first",
    materialMetadata: Object.freeze({
      title: "Synthetic blocked material",
      rawMaterialStored: false,
      rawTextPersisted: false,
      privateFileRead: false
    }),
    fields: Object.freeze({
      title: "SYN-M3-TITLE-003",
      author: "SYN-M3-AUTHOR-003",
      source: "publication",
      classificationCandidate: Object.freeze(["SYN-M3-L1-C", "SYN-M3-L2-C", "SYN-M3-L3-C"]),
      wordCount: 300000,
      sameNameAudioStatus: "none",
      sameNameAudioStatusCheckStatus: "checked",
      targetChannels: Object.freeze([
        Object.freeze({
          channelId: "SYN-M3-CHANNEL-D",
          channelName: "SYN-M3-CHANNEL-D",
          weight: 1,
          channelFit: 1,
          confidence: "limited"
        })
      ]),
      copyrightTermRange: "2 years"
    }),
    confidenceByField: Object.freeze({
      title: 0.9,
      author: 0.9,
      source: 0.9,
      classificationCandidate: 0.66
    })
  })
]);
