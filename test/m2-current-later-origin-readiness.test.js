import assert from "node:assert/strict";
import test from "node:test";

import {
  addMonths,
  assessM2HumanAnchoredLaterOriginReadiness,
  buildM2HumanAnchoredLaterOriginPublicDiagnostic,
  buildM2HumanAnchoredLaterOriginPublicPreregistration,
  monthRange,
  validateM2HumanAnchoredLaterOriginPublicPreregistration
} from "../src/domain/m2Current/laterOrigin.js";

const config = {
  schema: "m2.current.human_anchored_later_origin_preregistration.v0.1",
  candidateId:
    "M2-current-human-anchored-hierarchical-probabilistic-v1.0",
  target: "future_sales_share_cash",
  authorization: {
    readinessAudit: true,
    qualifiedLaterOriginValidation: true,
    finalHoldout: false,
    provider: false,
    remoteOrSharedDatabase: false,
    canary: false,
    full160: false,
    release: false,
    m3Formal: false
  },
  frozenDevelopment: {
    developmentCommit: "frozen-commit",
    featureAndLabelWindow: {
      from: "2021-01",
      through: "2025-12"
    },
    primaryOrigins: {
      from: "2021-12",
      through: "2022-12",
      horizonMonths: 36
    },
    auxiliaryOrigins: {
      from: "2021-12",
      through: "2025-09",
      horizons: [3, 6, 12, 18, 24]
    },
    selectionEvidenceLabelThrough: "2025-12"
  },
  qualificationAudit: {
    horizonMonths: 36,
    latestCompleteMonth: "2026-04",
    incompleteMonths: ["2026-05"],
    focusOrigins: ["2023-01", "2023-02", "2023-03", "2023-04"]
  },
  metrics: {
    primary: ["wape", "signed_bias"],
    segments: ["active", "intermittent", "dormant"],
    bootstrap: {
      method: "resample_independent_works_with_all_repeated_cases"
    },
    timeBlockSensitivity: {
      method: "leave_contiguous_origin_subblock_out"
    }
  },
  gates: {
    maximumWape: 0.3
  }
};

const developmentConfig = {
  candidateId: config.candidateId,
  authorization: {
    independentLaterOrigin: false,
    finalHoldout: false
  },
  dataContract: {
    primaryOrigins: ["2021-12", "2022-12"],
    auxiliaryOrigins: ["2022-12", "2023-03", "2025-09"]
  }
};

const developmentEvidence = {
  candidateId: config.candidateId,
  decision: {
    developmentDecision: "HUMAN_ANCHORED_DEVELOPMENT_FAIL",
    maturityDecision: "M2_NOT_MATURE"
  },
  temporalMaturity: {
    independentLaterOriginOpened: false
  }
};

const privateEvidence = {
  authorityWorkCount: 3053,
  observedSalesShareWorkCount: 3052,
  salesShareFactRowCount: 190663,
  ledgerRowCounts: {
    totalLedger: 192370,
    salesShare: 190663,
    buyout: 1707
  },
  mappingCoverage: 1,
  rowConservationPassed: true,
  cashConservationPassed: true,
  buyoutIsolated: true,
  unmaturedLabelZeroImputationCount: 0,
  incomplete202605FactCount: 3,
  incomplete202605MarkedCalibrationValidCount: 3,
  incomplete202605Excluded: true,
  frozenModelStatePresent: false,
  privateDigestManifestWritten: true
};

test("36-month maturity does not imply independent later-origin eligibility", () => {
  const result = assessM2HumanAnchoredLaterOriginReadiness({
    preregistrationConfig: config,
    developmentConfig,
    developmentEvidence,
    privateEvidence
  });

  assert.equal(
    result.decision,
    "NO_QUALIFIED_INDEPENDENT_MATURE_LATER_ORIGIN"
  );
  assert.equal(result.candidateBlock.timeBlockCount, 1);
  assert.ok(result.candidateBlock.months.every((row) => row.mature));
  assert.equal(
    result.candidateBlock.months.find(
      ({ origin }) => origin === "2023-03"
    ).originPreviouslyUsed,
    true
  );
  assert.equal(
    result.temporalBoundary.earliestTimeIndependentOrigin,
    "2026-01"
  );
  assert.equal(
    result.temporalBoundary.earliestTimeIndependentLabelThrough,
    "2029-01"
  );
  assert.equal(result.temporalBoundary.missingCompleteMonthCount, 33);
  assert.equal(result.validation.metricsRead, false);
  assert.equal(result.validation.laterOriginConsumed, false);
});

test("public preregistration remains aggregate-only and non-tuning", () => {
  const assessment = assessM2HumanAnchoredLaterOriginReadiness({
    preregistrationConfig: config,
    developmentConfig,
    developmentEvidence,
    privateEvidence
  });
  const preregistration =
    buildM2HumanAnchoredLaterOriginPublicPreregistration({
      preregistrationConfig: config,
      assessment,
      codeEvidence: {
        auditImplementationCommit: "audit-commit",
        trackedCodeDigest: "tracked-code-digest"
      },
      privateEvidence
    });

  assert.doesNotThrow(() => (
    validateM2HumanAnchoredLaterOriginPublicPreregistration(
      preregistration
    )
  ));
  assert.equal(
    preregistration.dataEvidence.privateDigestValuesPublished,
    false
  );
  assert.equal(
    preregistration.dataEvidence.incomplete202605ExplicitlyExcluded,
    true
  );
  assert.equal(
    preregistration.nonReuse.validationResultsMayTuneV1,
    false
  );
  const diagnostic =
    buildM2HumanAnchoredLaterOriginPublicDiagnostic(preregistration);
  assert.equal(diagnostic.boundaries.currentDecision, "CANARY_FAIL");
  assert.equal(
    diagnostic.boundaries.automationDecision,
    "AUTOMATION_BLOCKED"
  );
});

test("month arithmetic keeps the registered boundary exact", () => {
  assert.equal(addMonths("2023-01", 36), "2026-01");
  assert.deepEqual(
    monthRange("2026-11", "2027-02"),
    ["2026-11", "2026-12", "2027-01", "2027-02"]
  );
});
