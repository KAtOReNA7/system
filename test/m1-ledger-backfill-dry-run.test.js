import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLedgerBackfillDryRun,
  buildLedgerBackfillDryRunV2,
  summarizeForecastOutputImpact
} from "../src/domain/oldProductEvaluation/ledgerBackfillVerification.js";

function candidate(overrides = {}) {
  return {
    standardWorkId: "1001",
    fieldName: "copyrightEndDate",
    proposedValue: "2030-12-31",
    proposedValueNormalized: "2030-12-31",
    sourceRawValue: "2030/12/31",
    parserStatus: "parsed",
    matchMethod: "exact_work_id",
    matchConfidence: "high",
    valueConfidence: "high",
    conflictStatus: "none",
    requiresManualReview: false,
    ...overrides
  };
}

test("dry-run reduces only strict auto eligible field gaps", () => {
  const dryRun = buildLedgerBackfillDryRun({
    beforeGaps: {
      missingAuthor: 2,
      missingCopyrightEnd: 3,
      missingClassification3: 4
    },
    candidates: [
      candidate({ standardWorkId: "1001", fieldName: "authorName", proposedValue: "Author A" }),
      candidate({ standardWorkId: "1002", fieldName: "copyrightEndDate", proposedValue: "2031-12-31" }),
      candidate({ standardWorkId: "1003", fieldName: "classificationLevel3", proposedValue: "细分类" })
    ]
  });

  assert.deepEqual(dryRun.fieldResults.missingAuthor, { before: 2, after: 1, reduction: 1 });
  assert.deepEqual(dryRun.fieldResults.missingCopyrightEnd, { before: 3, after: 2, reduction: 1 });
  assert.deepEqual(dryRun.fieldResults.missingClassification3, { before: 4, after: 4, reduction: 0 });
  assert.equal(dryRun.automaticCandidateRows, 2);
  assert.equal(dryRun.remainingManualCandidateRows, 1);
});

test("dry-run caps reductions at before gap count and deduplicates by work", () => {
  const dryRun = buildLedgerBackfillDryRun({
    beforeGaps: {
      missingCopyrightEnd: 1
    },
    candidates: [
      candidate({ standardWorkId: "1001", fieldName: "copyrightEndDate", proposedValue: "2030-12-31" }),
      candidate({ standardWorkId: "1001", fieldName: "copyrightEndDate", proposedValue: "2030-12-31" }),
      candidate({ standardWorkId: "1002", fieldName: "copyrightEndDate", proposedValue: "2031-12-31" })
    ]
  });

  assert.deepEqual(dryRun.fieldResults.missingCopyrightEnd, { before: 1, after: 0, reduction: 1 });
});

test("forecastOutputType impact reflects copyright expiry dry-run transition", () => {
  const dryRun = buildLedgerBackfillDryRun({
    beforeGaps: {
      missingCopyrightStart: 2,
      missingCopyrightEnd: 3
    },
    candidates: [
      candidate({ standardWorkId: "1001", fieldName: "copyrightEndDate" }),
      candidate({ standardWorkId: "1002", fieldName: "copyrightStartDate" })
    ]
  });
  const impact = summarizeForecastOutputImpact({
    before: {
      copyright_term_forecast: 10,
      operating_window_forecast_pending_expiry: 5,
      relative_expiry_pending_anchor: 2,
      copyright_conflict_manual_review: 6,
      no_numeric_forecast: 1
    },
    dryRun
  });

  assert.equal(impact.after.copyright_term_forecast, 11);
  assert.equal(impact.after.operating_window_forecast_pending_expiry, 4);
  assert.equal(impact.transitions.operatingWindowPendingExpiryToCopyrightTermForecast, 1);
  assert.equal(impact.transitions.renewalReviewBecameReviewable, 1);
  assert.equal(impact.transitions.ratingRemainingCopyrightAdjustmentEnabled, 1);
  assert.equal(impact.transitions.manualReviewReduced, 2);
});

test("dry-run v2 does not reduce gaps for non-empty current values or classification fields", () => {
  const dryRun = buildLedgerBackfillDryRunV2({
    beforeGaps: {
      missingCopyrightEnd: 3,
      missingClassification1: 2
    },
    candidates: [
      candidate({ standardWorkId: "1001", fieldName: "copyrightEndDate", currentValue: "" }),
      candidate({ standardWorkId: "1002", fieldName: "copyrightEndDate", currentValue: "2030-12-31" }),
      candidate({ standardWorkId: "1003", fieldName: "classificationLevel1", proposedValue: "出版物" })
    ]
  });

  assert.deepEqual(dryRun.fieldResults.missingCopyrightEnd, { before: 3, after: 2, reduction: 1 });
  assert.deepEqual(dryRun.fieldResults.missingClassification1, { before: 2, after: 2, reduction: 0 });
  assert.equal(dryRun.automaticCandidateRows, 1);
  assert.equal(dryRun.remainingManualCandidateRows, 2);
});
