import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docs = path.join(root, "docs", "analysis", "m2-current");
const paths = {
  lineage: path.join(
    docs,
    "M2-publishing-scale-threshold-and-assumption-lineage-v1.json",
  ),
  audit: path.join(
    docs,
    "M2-publishing-scale-population-and-authority-audit-v1.json",
  ),
  report: path.join(
    docs,
    "M2-publishing-scale-population-and-authority-audit-v1.md",
  ),
  script: path.join(
    root,
    "scripts",
    "m2-current",
    "audit_publishing_scale.py",
  ),
};

const [lineageText, auditText, reportText, scriptText] = await Promise.all(
  Object.values(paths).map((filePath) => readFile(filePath, "utf8")),
);
const lineage = JSON.parse(lineageText);
const audit = JSON.parse(auditText);

test("K7A threshold lineage is stable, complete, and outcome-blind", () => {
  assert.equal(
    lineage.schema,
    "m2.publishing_scale.threshold_assumption_lineage.v1",
  );
  assert.equal(lineage.scope.newCandidateOuterOutcomeRead, false);
  assert.equal(lineage.thresholds.length, 29);
  assert.equal(
    new Set(lineage.thresholds.map((item) => item.stableThresholdId)).size,
    29,
  );
  for (const stableThresholdId of [
    "M2-THR-GEN-MECH-TRAIN-WORKS-01",
    "M2-THR-GEN-PLATFORM-WORKS-01",
    "M2-THR-GEN-TAXONOMY-WORKS-01",
    "M2-THR-GEN-WAPE-MATERIALITY-01",
    "M2-THR-GEN-BOOTSTRAP-01",
  ]) {
    assert.ok(
      lineage.thresholds.some(
        (item) => item.stableThresholdId === stableThresholdId,
      ),
      stableThresholdId,
    );
  }
});

test("K7A public aggregate distinguishes business entities from model rows", () => {
  assert.equal(
    audit.schema,
    "m2.publishing_scale.population_authority_audit.v1",
  );
  assert.equal(audit.status, "K7A_COMPLETE_NO_MODEL_EXECUTION");
  assert.equal(audit.scope.newCandidateOuterOutcomeRead, false);
  assert.equal(audit.scope.modelTrainedOrSelected, false);
  assert.equal(audit.entityAuthority.standardWork.count, 3053);
  assert.equal(audit.entityAuthority.bookSku.count, null);
  assert.equal(audit.entityAuthority.editionOrVersion.count, null);
  assert.equal(
    audit.entityAuthority.predictionCase.sameAsSkuOrNewLaunch,
    false,
  );
  assert.equal(
    audit.entityAuthority.observedCashWorkChannelScope
      .verifiedAuthorizationRelation,
    false,
  );
});

test("classification and authorization gaps forbid strict origin use", () => {
  assert.equal(audit.classificationAuthority.coverage.level3, 1);
  assert.equal(audit.classificationAuthority.effectiveAtCoverage, 0);
  assert.equal(audit.classificationAuthority.availableAtCoverage, 0);
  assert.equal(
    audit.classificationAuthority.strictOriginUseStatus,
    "CURRENT_ONLY_REPORTING_NOT_STRICT_ORIGIN_FEATURE",
  );
  assert.equal(
    audit.authorizationAuthority.workPlatformAuthorityTablePresent,
    false,
  );
  assert.equal(
    audit.authorizationAuthority.strictOriginUseStatus,
    "PROHIBITED_CURRENT_OR_CASH_OBSERVED_ONLY",
  );
});

test("transactional 25-32 range is traced to nested support contraction", () => {
  const diagnosis = audit.transactionalSupportDiagnosis;
  assert.equal(diagnosis.fullWindowDistinctWorks, 71);
  assert.equal(diagnosis.primaryPackedDistinctWorks, 48);
  assert.equal(diagnosis.primaryOuterFold0TrainingDistinctWorks, 38);
  assert.deepEqual(
    diagnosis.executedV02DevelopmentModelableInnerDistinctWorkRange,
    { minimum: 25, maximum: 32 },
  );
  assert.match(diagnosis.diagnosis, /not the publisher's annual SKU count/u);
  assert.match(reportText, /不是出版社年度 SKU 数/u);
});

test("fixed 50 and 100 work gates erase most level-3 training nodes", () => {
  const support = audit.level3TrainingSupport;
  assert.equal(support.primaryNodeFoldCount, 320);
  assert.equal(support.primaryDistinctWorks.median, 5);
  assert.equal(support.primaryShareBelowFixedWorkCounts["50"], 0.934375);
  assert.equal(support.primaryShareBelowFixedWorkCounts["100"], 0.978125);
  assert.equal(support.strictNodeOriginCount, 704);
  assert.equal(
    support.strictShareBelowFixedWorkCounts["100"],
    0.9289772727,
  );
});

test("public K7A artifact contains no private identity, path, or digest", () => {
  assert.deepEqual(audit.publicPrivacy, {
    aggregateOnly: true,
    containsWorkIdentity: false,
    containsCategoryValues: false,
    containsPrivatePath: false,
    containsPrivateArtifactDigest: false,
  });
  assert.doesNotMatch(auditText, /data[\\/]+private-/u);
  assert.doesNotMatch(auditText, /standardWorkId|authorIdentityCell/u);
  assert.doesNotMatch(auditText, /\b[a-f0-9]{64}\b/u);
  assert.match(scriptText, /PRIVATE_OUTPUT_DIR/u);
  assert.match(scriptText, /containsPrivateArtifactDigest/u);
});
