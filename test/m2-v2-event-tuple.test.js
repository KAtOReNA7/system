import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import test from "node:test";
import {
  buildV2B8CanonicalEventTuple,
  buildV2B8CanonicalIdentity,
  buildV2B8EventDate,
  evaluateV2B8EventTupleConflict,
  extractV2B8EventTime,
  validateV2B8CanonicalEventTuple,
} from "../src/domain/m2V2EvidencePilot/v2b8Stability.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const registry = JSON.parse(readFileSync(
  join(root, "config/m2-v2-pr7-s1-case-registry.v0.1.json"),
  "utf8",
));
const B4_FINDINGS = new Set(["PR7-P1-009", "PR7-P2-013"]);
const registeredB4Cases = registry.cases.filter((entry) => B4_FINDINGS.has(entry.findingId));

const handlers = {
  "PR7-P1-009-published-award": () => {
    const result = eventTime(
      "award_event",
      "2020",
      "The work was published in 2020 and won the award in 2022.",
    );
    assert.equal(result.eventTime, null);
    assert.equal(result.extractionSucceeded, false);
    assert.equal(result.failureReason, "event_date_predicate_mismatch");
  },
  "PR7-P1-009-chinese-coordination": () => {
    const result = eventTime("award_event", "2020年", "该作品于2020年出版并于2022年获奖");
    assert.equal(result.eventTime, null);
    assert.equal(result.failureReason, "event_date_predicate_mismatch");
  },
  "PR7-P1-009-multi-punctuation": () => {
    for (const text of [
      "The work was published in 2020, and won the award in 2022.",
      "The work was published in 2020; and won the award in 2022.",
      "The work was published in 2020，and won the award in 2022。",
    ]) {
      const left = eventTime("award_event", "won award", text);
      const right = eventTime("award_event", "won award", text);
      assert.deepEqual(left, right);
      assert.equal(left.eventTime, "2022");
      const tupleOptions = {
        family: "AWARD",
        kind: "WIN",
        stage: "WON",
        predicate: "won the award",
        year: "2022",
        sourceDocument: text,
      };
      assert.deepEqual(tupleFixture(tupleOptions).tuple, tupleFixture(tupleOptions).tuple);
    }
  },
  "PR7-P1-009-nominee-winner": () => {
    const result = eventTime(
      "award_event",
      "award history",
      "Nominated for the award in 2020 and won the award in 2022.",
    );
    assert.equal(result.eventTime, null);
    assert.equal(result.failureReason, "event_predicate_ambiguous");
  },
  "PR7-P1-009-planned-actual": () => {
    const result = eventTime(
      "adaptation_event",
      "film history",
      "The film was planned for release in 2020 and released in 2022.",
    );
    assert.equal(result.eventTime, null);
    assert.equal(result.extractionSucceeded, false);
    assert.equal(result.failureReason, "event_status_ambiguous");
  },
  "PR7-P1-009-direct-unbound": () => {
    const result = extractV2B8EventTime({
      claimType: "award_event",
      structuredValue: structured("2022"),
    }, []);
    assert.equal(result.eventTime, null);
    assert.equal(result.failureReason, "event_source_binding_missing");
  },
  "PR7-P1-009-span-tamper": () => {
    const { tuple, sourceDocument } = tupleFixture({
      family: "AWARD",
      kind: "WIN",
      stage: "WON",
      status: "ASSERTED_ACTUAL",
      eventRole: "PRIMARY_ASSERTION",
      dateRole: "AWARD_DATE",
      predicate: "won",
      year: "2022",
    });
    assert.equal(validateV2B8CanonicalEventTuple(tuple, sourceDocument), true);
    assert.throws(
      () => validateV2B8CanonicalEventTuple({ ...tuple, parserProfileVersion: "tampered-profile" }, sourceDocument),
      /event_tuple_digest_invalid/u,
    );
    assert.throws(
      () => validateV2B8CanonicalEventTuple({
        ...tuple,
        predicateSpan: { ...tuple.predicateSpan, start: tuple.predicateSpan.start + 1 },
      }, sourceDocument),
      /event_tuple_digest_invalid/u,
    );
    assert.throws(
      () => validateV2B8CanonicalEventTuple(tuple, `${sourceDocument} tampered`),
      /event_source_digest_invalid/u,
    );
  },
  "PR7-P1-009-award-2022-pass": () => {
    const result = eventTime(
      "award_event",
      "won award in 2022",
      "The work was published in 2020 and won the award in 2022.",
    );
    assert.equal(result.eventTime, "2022");
    assert.equal(result.failureReason, null);
  },
  "PR7-P2-013-distinct-studios": () => {
    const left = tupleFixture({
      year: "2020",
      organization: "studio-alpha",
      production: "production-alpha",
    }).tuple;
    const right = tupleFixture({
      year: "2022",
      organization: "studio-beta",
      production: "production-beta",
    }).tuple;
    const evaluation = evaluateV2B8EventTupleConflict(left, right);
    assert.equal(evaluation.decision, "NO_CONFLICT");
    assert.equal(evaluation.reasonCode, "DIFFERENT_PRODUCTION_OR_EDITION");
    assert.equal(evaluation.conflict, false);
  },
  "PR7-P2-013-distinct-editions": () => {
    const left = tupleFixture({
      family: "PUBLICATION",
      kind: "PUBLISH",
      stage: "PUBLISHED",
      predicate: "published",
      year: "2020",
      organization: "publisher",
      production: null,
      edition: "first-edition",
    }).tuple;
    const right = tupleFixture({
      family: "PUBLICATION",
      kind: "PUBLISH",
      stage: "PUBLISHED",
      predicate: "published",
      year: "2022",
      organization: "publisher",
      production: null,
      edition: "second-edition",
    }).tuple;
    const evaluation = evaluateV2B8EventTupleConflict(left, right);
    assert.equal(evaluation.decision, "NO_CONFLICT");
    assert.equal(evaluation.reasonCode, "DIFFERENT_PRODUCTION_OR_EDITION");
  },
  "PR7-P2-013-missing-identity": () => {
    const left = tupleFixture({ year: "2020", organization: null, production: null }).tuple;
    const right = tupleFixture({ year: "2022", organization: null, production: null }).tuple;
    const evaluation = evaluateV2B8EventTupleConflict(left, right);
    assert.equal(evaluation.decision, "NOT_EVALUABLE");
    assert.equal(evaluation.reasonCode, "MISSING_OR_AMBIGUOUS_REQUIRED_IDENTITY");
  },
  "PR7-P2-013-same-identity-conflict": () => {
    const left = tupleFixture({ year: "2020" }).tuple;
    const right = tupleFixture({ year: "2022" }).tuple;
    const evaluation = evaluateV2B8EventTupleConflict(left, right);
    assert.equal(evaluation.decision, "UNRESOLVED_CONFLICT");
    assert.equal(evaluation.reasonCode, "SAME_STAGE_DISJOINT");
    assert.equal(evaluation.conflict, true);
    assert.equal(evaluation.requiredFamilyPass, false);
  },
  "PR7-P2-013-valid-progression": () => {
    const left = tupleFixture({
      kind: "PLAN",
      stage: "PLANNED",
      status: "ASSERTED_PLANNED",
      eventRole: "PLANNED_ASSERTION",
      dateRole: "PLANNED_DATE",
      predicate: "planned",
      year: "2020",
    }).tuple;
    const right = tupleFixture({ year: "2022" }).tuple;
    const evaluation = evaluateV2B8EventTupleConflict(left, right);
    assert.equal(evaluation.decision, "VALID_STAGE_PROGRESSION");
    assert.equal(evaluation.reasonCode, "VALID_STAGE_TIME_PROGRESSION");
    assert.equal(evaluation.conflict, false);
  },
  "PR7-P2-013-invalid-progression": () => {
    const left = tupleFixture({
      family: "RELEASE",
      kind: "RELEASE",
      stage: "RELEASED",
      predicate: "released",
      year: "2020",
    }).tuple;
    const right = tupleFixture({
      family: "RELEASE",
      kind: "PLAN",
      stage: "PLANNED",
      status: "ASSERTED_PLANNED",
      eventRole: "PLANNED_ASSERTION",
      dateRole: "PLANNED_DATE",
      predicate: "planned",
      year: "2022",
    }).tuple;
    const evaluation = evaluateV2B8EventTupleConflict(left, right);
    assert.equal(evaluation.decision, "UNRESOLVED_STAGE_CONFLICT");
    assert.equal(evaluation.reasonCode, "INVALID_STAGE_TIME_ORDER");
    assert.equal(evaluation.conflict, true);
  },
  "PR7-P2-013-neighbor-identity": () => {
    const left = tupleFixture({ year: "2020", production: null }).tuple;
    const right = tupleFixture({ year: "2022", production: null }).tuple;
    const evaluation = evaluateV2B8EventTupleConflict(left, right);
    assert.equal(evaluation.decision, "NOT_EVALUABLE");
    assert.equal(evaluation.reasonCode, "MISSING_OR_AMBIGUOUS_REQUIRED_IDENTITY");
  },
  "PR7-P2-013-different-subject": () => {
    const left = tupleFixture({ year: "2020", subject: "subject-alpha" }).tuple;
    const right = tupleFixture({ year: "2022", subject: "subject-beta" }).tuple;
    const evaluation = evaluateV2B8EventTupleConflict(left, right);
    assert.equal(evaluation.decision, "SEPARATE_SCOPE");
    assert.equal(evaluation.reasonCode, "DIFFERENT_SUBJECT");
    assert.equal(evaluation.conflict, false);
  },
};

test("B4 frozen registry maps exactly 16 cases to executable handlers", () => {
  assert.equal(registeredB4Cases.length, 16);
  assert.deepEqual(
    Object.keys(handlers).sort(),
    registeredB4Cases.map((entry) => entry.caseId).sort(),
  );
  assert.equal(registeredB4Cases.every((entry) => entry.mustEnterDefaultNpmTest === true), true);
  assert.equal(registeredB4Cases.every((entry) => entry.providerAllowed === false), true);
});

for (const entry of registeredB4Cases) {
  test(`${entry.caseId} satisfies ${entry.expectedResult}`, () => {
    handlers[entry.caseId]();
  });
}

function eventTime(claimType, value, snippet) {
  return extractV2B8EventTime({
    claimType,
    structuredValue: structured(value),
  }, [{
    sourceId: "src-b4-synthetic",
    title: "synthetic event history",
    snippet,
  }]);
}

function structured(textValue) {
  return {
    valueType: "text",
    textValue,
    dateValue: null,
    numberValue: null,
    booleanValue: null,
  };
}

function tupleFixture(options = {}) {
  const family = options.family ?? "PRODUCTION";
  const kind = options.kind ?? "PRODUCE";
  const stage = options.stage ?? "PRODUCED";
  const status = options.status ?? "ASSERTED_ACTUAL";
  const eventRole = options.eventRole ?? "PRIMARY_ASSERTION";
  const dateRole = options.dateRole
    ?? (family === "PUBLICATION" ? "PUBLICATION_DATE" : family === "RELEASE" ? "RELEASE_DATE" : "EVENT_OCCURRENCE");
  const predicate = options.predicate ?? "produced";
  const year = options.year ?? "2020";
  const sourceDocument = options.sourceDocument ?? `Synthetic subject ${predicate} the event in ${year}.`;
  const sentenceSpan = { start: 0, end: [...sourceDocument].length };
  const tuple = buildV2B8CanonicalEventTuple({
    parserProfileVersion: "b4-event-parser-v0.4",
    sourceDocumentIdSafe: `b4-${family.toLowerCase()}-${stage.toLowerCase()}-${year}`,
    sourceDocument,
    sentenceSpan,
    clauseSpan: sentenceSpan,
    predicateSpan: codePointSpan(sourceDocument, predicate),
    dateSpan: codePointSpan(sourceDocument, year),
    eventPredicate: { family, kind },
    eventRole,
    eventDate: buildV2B8EventDate(year),
    dateRole,
    organizationIdentity: identity(options.organization === undefined ? "organization-1" : options.organization),
    productionIdentity: identity(
      options.production === undefined
        ? (["PRODUCTION", "RELEASE"].includes(family) ? "production-1" : null)
        : options.production,
    ),
    editionIdentity: identity(
      options.edition === undefined ? (family === "PUBLICATION" ? "edition-1" : null) : options.edition,
    ),
    stage,
    status,
    subjectIdentity: identity(options.subject ?? "subject-1"),
    ambiguity: { status: "NONE", codes: [], evaluable: true },
    limitation: [],
  });
  return { tuple, sourceDocument };
}

function identity(value) {
  return value === null
    ? buildV2B8CanonicalIdentity(null, "MISSING")
    : buildV2B8CanonicalIdentity(value);
}

function codePointSpan(text, value) {
  const utf16Start = text.indexOf(value);
  assert.notEqual(utf16Start, -1);
  const start = [...text.slice(0, utf16Start)].length;
  return { start, end: start + [...value].length };
}
