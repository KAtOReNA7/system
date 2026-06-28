export const M3_FIELD_COMPLETION_FIXTURE_ROWS = Object.freeze([
  Object.freeze({
    anonymousMaterialId: "SYN-M3-MATERIAL-001",
    inputExtension: ".fixture",
    parseStatus: "synthetic_completion_required",
    readinessStatus: "blocked",
    hardBlockerCodes: Object.freeze([
      "missing_title",
      "missing_author",
      "missing_source",
      "missing_classification",
      "missing_volume_estimate",
      "missing_heat_signal",
      "missing_copyright_term",
      "missing_target_channels",
      "missing_same_name_audio_check_status"
    ]),
    missingCoreFields: Object.freeze([
      "title",
      "author",
      "source",
      "classification",
      "wordCountOrAudioVolumeEstimate",
      "heatSignal",
      "copyrightTermRange",
      "targetChannels",
      "sameNameAudioStatusCheckStatus"
    ]),
    completionPackRecommended: true,
    userFields: Object.freeze({
      title: "SYN-M3-COMPLETED-TITLE-001",
      author: "SYN-M3-AUTHOR-001",
      source: "publication",
      classification: "SYN-M3-L1-A, SYN-M3-L2-A, SYN-M3-L3-A",
      wordCount: "720000",
      audioVolumeEstimate: "",
      heatSignalType: "reads",
      heatSignalValue: "68000",
      copyrightTermRange: "5 years",
      targetChannels: "SYN-M3-CHANNEL-A, SYN-M3-CHANNEL-B",
      sameNameAudioStatusCheckStatus: "checked",
      sameNameAudioStatus: "none",
      completionStatus: "",
      notes: "synthetic completion fixture only"
    })
  }),
  Object.freeze({
    anonymousMaterialId: "SYN-M3-MATERIAL-002",
    inputExtension: ".fixture",
    parseStatus: "synthetic_completion_required",
    readinessStatus: "blocked",
    hardBlockerCodes: Object.freeze([
      "missing_title",
      "missing_author",
      "missing_source",
      "missing_classification",
      "missing_volume_estimate",
      "missing_completion_status_web_original",
      "missing_heat_signal",
      "missing_copyright_term",
      "missing_target_channels",
      "missing_same_name_audio_check_status"
    ]),
    missingCoreFields: Object.freeze([
      "title",
      "author",
      "source",
      "classification",
      "wordCountOrAudioVolumeEstimate",
      "completionStatus",
      "heatSignal",
      "copyrightTermRange",
      "targetChannels",
      "sameNameAudioStatusCheckStatus"
    ]),
    completionPackRecommended: true,
    userFields: Object.freeze({
      title: "SYN-M3-COMPLETED-TITLE-002",
      author: "SYN-M3-AUTHOR-002",
      source: "web_original",
      classification: "SYN-M3-L1-B, SYN-M3-L2-B, SYN-M3-L3-B",
      wordCount: "",
      audioVolumeEstimate: "80",
      heatSignalType: "platformHeat",
      heatSignalValue: "usable synthetic platform heat",
      copyrightTermRange: "3 years",
      targetChannels: "SYN-M3-CHANNEL-C",
      sameNameAudioStatusCheckStatus: "checked",
      sameNameAudioStatus: "unknown",
      completionStatus: "ongoing",
      notes: "synthetic web-original completion fixture only"
    })
  }),
  Object.freeze({
    anonymousMaterialId: "SYN-M3-MATERIAL-003",
    inputExtension: ".fixture",
    parseStatus: "synthetic_sparse_completion_required",
    readinessStatus: "blocked",
    hardBlockerCodes: Object.freeze([
      "missing_title",
      "missing_author",
      "missing_source",
      "missing_classification",
      "missing_volume_estimate",
      "missing_heat_signal",
      "missing_copyright_term",
      "missing_target_channels",
      "missing_same_name_audio_check_status"
    ]),
    missingCoreFields: Object.freeze([
      "title",
      "author",
      "source",
      "classification",
      "wordCountOrAudioVolumeEstimate",
      "heatSignal",
      "copyrightTermRange",
      "targetChannels",
      "sameNameAudioStatusCheckStatus"
    ]),
    completionPackRecommended: true,
    userFields: Object.freeze({
      title: "SYN-M3-COMPLETED-TITLE-003",
      author: "SYN-M3-AUTHOR-001",
      source: "publication",
      classification: "SYN-M3-L1-A, SYN-M3-L2-C, SYN-M3-L3-C",
      wordCount: "300000",
      audioVolumeEstimate: "",
      heatSignalType: "searchHeat",
      heatSignalValue: "limited but usable synthetic heat",
      copyrightTermRange: "2 years",
      targetChannels: "SYN-M3-CHANNEL-D",
      sameNameAudioStatusCheckStatus: "checked",
      sameNameAudioStatus: "none",
      completionStatus: "",
      notes: "synthetic sparse material completed by manual fields"
    })
  })
]);

export const M3_FIELD_COMPLETION_FIXTURE_BEFORE_RESULTS = Object.freeze(
  M3_FIELD_COMPLETION_FIXTURE_ROWS.map((row) => Object.freeze({
    anonymousMaterialId: row.anonymousMaterialId,
    inputExtension: row.inputExtension,
    parseStatus: row.parseStatus,
    readinessStatus: "blocked",
    hardBlockers: row.hardBlockerCodes,
    missingCoreFields: row.missingCoreFields,
    completionPackRecommended: true,
    forecastSummary: Object.freeze({ forecastStatus: "blocked", pointEstimateOnly: true, channelCount: 0 }),
    ratingStatus: "not_generated_due_to_readiness_blocked",
    candidateRatingGenerated: false,
    workflowState: Object.freeze({ currentState: "readiness_blocked", completedStepCount: 3, pendingStepCount: 10 }),
    backtestAnchorStatus: "not_eligible_readiness_blocked",
    rawMaterialStored: false,
    rawTextPersisted: false,
    notForFormalDecision: true
  }))
);
