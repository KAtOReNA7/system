import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const FIXTURE_ROOT = join(process.cwd(), "test", "fixtures", "m2-v2");
const CORPUS_PATH = join(FIXTURE_ROOT, "event-conflict-golden-corpus.v0.1.json");
const SCHEMA_PATH = join(FIXTURE_ROOT, "event-conflict-golden-corpus.schema.v0.1.json");
const MANIFEST_PATH = join(FIXTURE_ROOT, "event-conflict-golden-corpus.manifest.v0.1.json");

const corpusBytes = readFileSync(CORPUS_PATH);
const schemaBytes = readFileSync(SCHEMA_PATH);
const manifestBytes = readFileSync(MANIFEST_PATH);
const corpus = JSON.parse(corpusBytes);
const schema = JSON.parse(schemaBytes);
const manifest = JSON.parse(manifestBytes);

test("S0-07 corpus passes its strict JSON schema with no unknown fields", () => {
  const errors = [];
  validateAgainstSchema(corpus, schema, schema, "$", errors);
  assert.deepEqual(errors, []);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.$defs.case.additionalProperties, false);
  assert.equal(schema.$defs.span.additionalProperties, false);
});

test("S0-07 corpus and schema bytes are deterministic and digest-bound by the manifest", () => {
  assert.equal(manifest.corpusSha256, digest(corpusBytes));
  assert.equal(manifest.schemaSha256, digest(schemaBytes));
  assert.equal(`${JSON.stringify(corpus, null, 2)}\n`, corpusBytes.toString("utf8"));
  assert.equal(`${JSON.stringify(schema, null, 2)}\n`, schemaBytes.toString("utf8"));
  assert.equal(`${JSON.stringify(manifest, null, 2)}\n`, manifestBytes.toString("utf8"));
  assert.equal(manifest.caseCount, corpus.cases.length);
  assert.deepEqual(manifest.caseIds, corpus.cases.map((entry) => entry.caseId));
  assert.deepEqual(manifest.caseIds, [...manifest.caseIds].sort());
  assert.equal(new Set(manifest.caseIds).size, manifest.caseIds.length);
});

test("S0-07 every sentence, clause, and date span is exact and in bounds", () => {
  for (const entry of corpus.cases) {
    for (const span of [...entry.sentenceSpans, ...entry.clauseSpans, ...entry.dateSpan]) {
      assert.equal(Number.isInteger(span.start), true, entry.caseId);
      assert.equal(Number.isInteger(span.end), true, entry.caseId);
      assert.equal(span.start >= 0 && span.end > span.start && span.end <= entry.sourceText.length, true, entry.caseId);
      assert.equal(entry.sourceText.slice(span.start, span.end), span.text, `${entry.caseId}:${span.text}`);
    }
    assert.equal(entry.eventRole.length, entry.eventPredicate.length, entry.caseId);
    assert.equal(entry.eventDate.length, entry.eventPredicate.length, entry.caseId);
    assert.equal(entry.organization.length, entry.eventPredicate.length, entry.caseId);
    assert.equal(entry.productionIdentity.length, entry.eventPredicate.length, entry.caseId);
    assert.equal(entry.editionIdentity.length, entry.eventPredicate.length, entry.caseId);
    assert.equal(entry.stage.length, entry.eventPredicate.length, entry.caseId);
    assert.equal(entry.dateSpan.length, entry.eventDate.filter((value) => value !== null).length, entry.caseId);
    assertAnchorsAppearInOrder(entry.sourceText, entry.eventPredicate, entry.caseId);
  }
});

test("S0-07 coverage includes every required language, temporal, identity, role, and relation case", () => {
  const observedCoverage = [...new Set(corpus.cases.flatMap((entry) => entry.covers))].sort();
  assert.deepEqual(observedCoverage, manifest.requiredCoverage);
  assert.deepEqual([...new Set(corpus.cases.map((entry) => entry.language))].sort(), ["en", "mixed", "zh"]);
  assert.deepEqual(
    [...new Set(corpus.cases.map((entry) => entry.expectedRelation))].sort(),
    ["AMBIGUOUS", "FALSE_CONFLICT", "NOT_EVALUABLE", "TRUE_CONFLICT"],
  );
  assert.deepEqual(
    [...new Set(corpus.cases.flatMap((entry) => entry.eventRole))].sort(),
    ["ADAPTATION", "PRODUCTION", "RELEASE", "SIGNING"],
  );
  assert.equal(corpus.cases.some((entry) => entry.reasonCode === "DIFFERENT_ORGANIZATION"), true);
  assert.equal(corpus.cases.some((entry) => entry.reasonCode === "DIFFERENT_PRODUCTION"), true);
  assert.equal(corpus.cases.some((entry) => entry.reasonCode === "DIFFERENT_EDITION"), true);
  assert.equal(corpus.cases.some((entry) => entry.reasonCode === "DIFFERENT_STAGE"), true);
  assert.equal(corpus.cases.some((entry) => entry.reasonCode === "SAME_IDENTITY_DIFFERENT_DATE"), true);
});

test("S0-07 finding map is explicit and corpus remains synthetic-only", () => {
  const allCaseIds = corpus.cases.map((entry) => entry.caseId);
  assert.deepEqual(Object.keys(corpus.findingMap).sort(), ["PR7-P1-009", "PR7-P2-013"]);
  assert.deepEqual(Object.keys(manifest.findingMap).sort(), ["PR7-P1-009", "PR7-P2-013"]);
  assert.deepEqual(manifest.findingMap["PR7-P1-009"], allCaseIds);
  assert.deepEqual(manifest.findingMap["PR7-P2-013"], allCaseIds);
  for (const entry of corpus.cases) {
    assert.deepEqual(entry.findingIds, ["PR7-P1-009", "PR7-P2-013"]);
    for (const identity of [...entry.organization, ...entry.productionIdentity, ...entry.editionIdentity]) {
      if (identity !== null) assert.match(identity, /^SYNTH_/u, entry.caseId);
    }
  }
  assert.equal(manifest.sourceTextPolicy, "SYNTHETIC_ONLY");
  assert.equal(manifest.privateBusinessText, false);
  assert.equal(manifest.parserImplementationIncluded, false);
  assert.equal(manifest.conflictProductLogicIncluded, false);
  const serialized = corpusBytes.toString("utf8");
  assert.doesNotMatch(serialized, /data[\\/]private-(?:input|output)/iu);
  assert.doesNotMatch(serialized, /(?:OPENAI_API_KEY|TAVILY_API_KEY|DATABASE_URL|PGPASSWORD)/u);
  assert.doesNotMatch(serialized, /\bsk-[A-Za-z0-9_-]{8,}\b/u);
});

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertAnchorsAppearInOrder(source, anchors, caseId) {
  let cursor = 0;
  for (const anchor of anchors) {
    const index = source.indexOf(anchor, cursor);
    assert.notEqual(index, -1, `${caseId}:missing_event_predicate:${anchor}`);
    cursor = index + anchor.length;
  }
}

function validateAgainstSchema(value, currentSchema, rootSchema, path, errors) {
  if (currentSchema.$ref) {
    const target = resolveRef(rootSchema, currentSchema.$ref);
    validateAgainstSchema(value, target, rootSchema, path, errors);
    return;
  }
  if (Object.hasOwn(currentSchema, "const") && !deepEqual(value, currentSchema.const)) {
    errors.push(`${path}:const`);
    return;
  }
  if (currentSchema.enum && !currentSchema.enum.some((candidate) => deepEqual(value, candidate))) {
    errors.push(`${path}:enum`);
    return;
  }
  if (currentSchema.type && !matchesType(value, currentSchema.type)) {
    errors.push(`${path}:type`);
    return;
  }
  if (typeof value === "string") {
    if (currentSchema.minLength !== undefined && value.length < currentSchema.minLength) errors.push(`${path}:minLength`);
    if (currentSchema.pattern && !new RegExp(currentSchema.pattern, "u").test(value)) errors.push(`${path}:pattern`);
  }
  if (typeof value === "number" && currentSchema.minimum !== undefined && value < currentSchema.minimum) {
    errors.push(`${path}:minimum`);
  }
  if (Array.isArray(value)) {
    if (currentSchema.minItems !== undefined && value.length < currentSchema.minItems) errors.push(`${path}:minItems`);
    if (currentSchema.uniqueItems) {
      const encoded = value.map((entry) => JSON.stringify(entry));
      if (new Set(encoded).size !== encoded.length) errors.push(`${path}:uniqueItems`);
    }
    if (currentSchema.items) {
      value.forEach((entry, index) => validateAgainstSchema(entry, currentSchema.items, rootSchema, `${path}[${index}]`, errors));
    }
  }
  if (isPlainObject(value)) {
    const properties = currentSchema.properties ?? {};
    for (const key of currentSchema.required ?? []) {
      if (!Object.hasOwn(value, key)) errors.push(`${path}.${key}:required`);
    }
    if (currentSchema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(properties, key)) errors.push(`${path}.${key}:additionalProperties`);
      }
    }
    for (const [key, childSchema] of Object.entries(properties)) {
      if (Object.hasOwn(value, key)) validateAgainstSchema(value[key], childSchema, rootSchema, `${path}.${key}`, errors);
    }
  }
}

function resolveRef(rootSchema, ref) {
  if (!ref.startsWith("#/")) throw new Error(`unsupported_schema_ref:${ref}`);
  return ref.slice(2).split("/").reduce((value, part) => value[part.replaceAll("~1", "/").replaceAll("~0", "~")], rootSchema);
}

function matchesType(value, expected) {
  const types = Array.isArray(expected) ? expected : [expected];
  return types.some((type) => {
    if (type === "null") return value === null;
    if (type === "array") return Array.isArray(value);
    if (type === "object") return isPlainObject(value);
    if (type === "integer") return Number.isInteger(value);
    return typeof value === type;
  });
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
