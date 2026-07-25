import { createHash } from "node:crypto";

import {
  buildM2CurrentAvailabilitySnapshot
} from "./availabilitySnapshot.js";
import {
  validateM2CurrentRevenueShareFacts
} from "./revenueShareFact.js";
import {
  buildM2CurrentSignalGapLedger,
  summarizeM2CurrentSignalGapLedger
} from "./signalGapLedger.js";

const SOURCE_MODES = new Set([
  "synthetic_fixture",
  "capability_scoped_private"
]);
const SNAPSHOT_STATUSES = new Set([
  "observed_as_of",
  "unknown_at_origin"
]);
const ISO_CURRENCY_PATTERN = /^[A-Z]{3}$/u;

export const M2_CURRENT_SIGNAL_INPUT_BUNDLE_SCHEMA =
  "m2.current.signal_input_bundle.v0.1";

export function buildM2CurrentSignalInputBundle(input) {
  if (
    input?.schema !== undefined
    && input.schema !== M2_CURRENT_SIGNAL_INPUT_BUNDLE_SCHEMA
  ) {
    throw new Error("m2_current_signal_input_bundle_schema_invalid");
  }
  const bundleId = requireString(input?.bundleId, "signal_input_bundle_id");
  const populationId = requireString(
    input?.populationId,
    "signal_input_population_id"
  );
  const currency = requireCurrency(input?.currency);
  if (input?.target !== "future_sales_share_cash") {
    throw new Error("m2_current_signal_input_target_invalid");
  }
  const sourceMode = String(input?.sourceMode ?? "");
  if (!SOURCE_MODES.has(sourceMode)) {
    throw new Error("m2_current_signal_input_source_mode_invalid");
  }
  if (input?.currentStateBackfillUsed !== false) {
    throw new Error(
      "m2_current_signal_input_current_state_backfill_declaration_required"
    );
  }

  const facts = validateM2CurrentRevenueShareFacts(input?.facts ?? []);
  if (facts.some((fact) => fact.currency !== currency)) {
    throw new Error("m2_current_signal_input_fact_currency_mismatch");
  }
  const factById = new Map(facts.map((fact) => [fact.factId, fact]));
  const snapshotDescriptors = requireArray(
    input?.snapshots,
    "signal_input_snapshots"
  );
  if (snapshotDescriptors.length === 0) {
    throw new Error("m2_current_signal_input_snapshots_empty");
  }

  const snapshotInputs = [];
  const snapshots = [];
  const snapshotKeys = new Set();
  const referencedFactIds = new Set();
  for (const descriptor of snapshotDescriptors) {
    if ("facts" in Object(descriptor)) {
      throw new Error(
        "m2_current_signal_input_embedded_snapshot_facts_forbidden"
      );
    }
    if (descriptor?.currentStateBackfillUsed !== false) {
      throw new Error(
        "m2_current_signal_input_snapshot_backfill_declaration_required"
      );
    }
    const status = String(descriptor?.status ?? "");
    if (!SNAPSHOT_STATUSES.has(status)) {
      throw new Error("m2_current_signal_input_snapshot_status_invalid");
    }
    const factIds = uniqueStrings(
      descriptor?.factIds ?? [],
      "signal_input_snapshot_fact_ids"
    );
    if (
      status === "unknown_at_origin"
      && (factIds.length !== 0 || descriptor?.authority != null)
    ) {
      throw new Error(
        "m2_current_signal_input_unknown_snapshot_observation_forbidden"
      );
    }
    const resolvedFacts = factIds.map((factId) => {
      const fact = factById.get(factId);
      if (!fact) {
        throw new Error("m2_current_signal_input_snapshot_fact_missing");
      }
      referencedFactIds.add(factId);
      return fact;
    });
    const snapshotInput = Object.freeze({
      ...descriptor,
      factIds: undefined,
      facts: Object.freeze(resolvedFacts),
      currentStateBackfillUsed: false
    });
    const snapshot = buildM2CurrentAvailabilitySnapshot(snapshotInput);
    if (snapshot.currency !== currency) {
      throw new Error("m2_current_signal_input_snapshot_currency_mismatch");
    }
    const snapshotKey = `${snapshot.standardWorkId}|${snapshot.origin}`;
    if (snapshotKeys.has(snapshotKey)) {
      throw new Error("m2_current_signal_input_snapshot_duplicate");
    }
    snapshotKeys.add(snapshotKey);
    snapshotInputs.push(snapshotInput);
    snapshots.push(snapshot);
  }

  const unreferencedFacts = facts.filter(
    (fact) => !referencedFactIds.has(fact.factId)
  );
  if (unreferencedFacts.length !== 0) {
    throw new Error("m2_current_signal_input_fact_unreferenced");
  }
  assertCompleteObservedHistories(facts, snapshots);

  return Object.freeze({
    schema: M2_CURRENT_SIGNAL_INPUT_BUNDLE_SCHEMA,
    bundleId,
    populationId,
    target: "future_sales_share_cash",
    currency,
    sourceMode,
    facts,
    snapshots: Object.freeze(snapshots),
    snapshotInputs: Object.freeze(snapshotInputs),
    invariants: Object.freeze({
      salesShareCashOnly: true,
      allBuyoutExcluded: true,
      currentStateBackfillUsed: false,
      unknownAtOriginPreserved: true,
      snapshotFactsCumulative: true,
      identifiersPublished: false
    })
  });
}

export function summarizeM2CurrentSignalInputBundle(bundle) {
  if (bundle?.schema !== M2_CURRENT_SIGNAL_INPUT_BUNDLE_SCHEMA) {
    throw new Error("m2_current_signal_input_bundle_invalid");
  }
  const eventTypeCounts = countValues(
    bundle.facts.map((fact) => fact.eventType)
  );
  const snapshotStatusCounts = countValues(
    bundle.snapshots.map((snapshot) => snapshot.status)
  );
  const origins = bundle.snapshots
    .map((snapshot) => snapshot.origin)
    .sort();
  return Object.freeze({
    schema: "m2.current.signal_input_bundle_summary.public.v0.1",
    target: bundle.target,
    currency: bundle.currency,
    sourceMode: bundle.sourceMode,
    factCount: bundle.facts.length,
    eventTypeCounts,
    snapshotCount: bundle.snapshots.length,
    snapshotStatusCounts,
    uniqueWorkCount: new Set(
      bundle.snapshots.map((snapshot) => snapshot.standardWorkId)
    ).size,
    originCount: new Set(origins).size,
    firstOrigin: origins.at(0) ?? null,
    lastOrigin: origins.at(-1) ?? null,
    distinctSourceSystemCount: new Set(
      bundle.facts.map((fact) => fact.source.system)
    ).size,
    distinctSourceDatasetCount: new Set(
      bundle.facts.map((fact) => (
        `${fact.source.system}|${fact.source.dataset}`
      ))
    ).size,
    invariants: bundle.invariants,
    aggregateOnly: true,
    rowIdentifiersIncluded: false,
    sourceNamesIncluded: false
  });
}

export function diagnoseM2CurrentSignalInputBundle(caseRows, input) {
  const populationFingerprint =
    fingerprintM2CurrentSignalCasePopulation(caseRows);
  if (
    String(input?.casePopulationSha256 ?? "").toLowerCase()
      !== populationFingerprint
  ) {
    throw new Error(
      "m2_current_signal_input_case_population_fingerprint_mismatch"
    );
  }
  const bundle = buildM2CurrentSignalInputBundle(input);
  const ledger = buildM2CurrentSignalGapLedger(
    caseRows,
    bundle.snapshotInputs
  );
  return Object.freeze({
    schema: "m2.current.signal_input_diagnostic.public.v0.1",
    decisionStatus: "not_for_formal_decision",
    target: bundle.target,
    bundle: summarizeM2CurrentSignalInputBundle(bundle),
    coverage: summarizeM2CurrentSignalGapLedger(ledger),
    readiness: Object.freeze({
      coverageMeasured: true,
      coverageComplete:
        ledger.readiness.status === "AS_OF_SIGNAL_COVERAGE_COMPLETE",
      newCandidateFamilyAuthorized: false,
      nextAction: (
        ledger.readiness.status === "AS_OF_SIGNAL_COVERAGE_COMPLETE"
          ? "request_separate_nested_challenger_authorization"
          : "acquire_versioned_historical_as_of_signal_authority"
      )
    }),
    sourceBoundary: Object.freeze({
      aggregateOnly: true,
      rowIdentifiersIncluded: false,
      privateRowsPublished: false,
      databaseConnected: false,
      providerCalled: false,
      finalHoldoutOpened: false
    })
  });
}

export function fingerprintM2CurrentSignalCasePopulation(caseRows) {
  if (!Array.isArray(caseRows) || caseRows.length === 0) {
    throw new Error("m2_current_signal_input_case_population_required");
  }
  const normalized = caseRows.map((row) => ({
    standardWorkId: requireString(
      row?.standardWorkId ?? row?.caseKey?.standardWorkId,
      "signal_input_case_standard_work_id"
    ),
    origin: requireString(
      row?.origin ?? row?.caseKey?.origin,
      "signal_input_case_origin"
    ),
    horizonMonths: requirePositiveInteger(
      row?.horizonMonths ?? row?.caseKey?.horizonMonths,
      "signal_input_case_horizon_months"
    ),
    route: requireString(
      row?.route ?? row?.caseKey?.route,
      "signal_input_case_route"
    ),
    segment: requireString(
      row?.segment,
      "signal_input_case_segment"
    )
  })).sort((left, right) => (
    left.origin.localeCompare(right.origin)
    || left.standardWorkId.localeCompare(right.standardWorkId)
    || left.horizonMonths - right.horizonMonths
    || left.route.localeCompare(right.route)
    || left.segment.localeCompare(right.segment)
  ));
  const keys = normalized.map((row) => [
    row.standardWorkId,
    row.origin,
    row.horizonMonths,
    row.route,
    row.segment
  ].join("|"));
  if (new Set(keys).size !== keys.length) {
    throw new Error(
      "m2_current_signal_input_case_population_duplicate"
    );
  }
  return createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex");
}

function assertCompleteObservedHistories(facts, snapshots) {
  const factsByWork = new Map();
  for (const fact of facts) {
    const workFacts = factsByWork.get(fact.standardWorkId) ?? [];
    workFacts.push(fact);
    factsByWork.set(fact.standardWorkId, workFacts);
  }
  const snapshotsByWork = new Map();
  for (const snapshot of snapshots) {
    const workSnapshots = snapshotsByWork.get(snapshot.standardWorkId) ?? [];
    workSnapshots.push(snapshot);
    snapshotsByWork.set(snapshot.standardWorkId, workSnapshots);
  }
  for (const [standardWorkId, workSnapshots] of snapshotsByWork) {
    const ordered = [...workSnapshots].sort((left, right) => (
      left.origin.localeCompare(right.origin)
    ));
    let previouslyObserved = false;
    for (const snapshot of ordered) {
      if (snapshot.status === "unknown_at_origin") {
        if (previouslyObserved) {
          throw new Error(
            "m2_current_signal_input_observed_history_became_unknown"
          );
        }
        continue;
      }
      previouslyObserved = true;
      const expectedFactIds = new Set(
        (factsByWork.get(standardWorkId) ?? [])
          .filter((fact) => fact.availableAt <= snapshot.originCutoffAt)
          .map((fact) => fact.factId)
      );
      const actualFactIds = new Set(snapshot.factIds);
      if (
        expectedFactIds.size !== actualFactIds.size
        || [...expectedFactIds].some((factId) => !actualFactIds.has(factId))
      ) {
        throw new Error(
          "m2_current_signal_input_observed_snapshot_not_complete"
        );
      }
    }
  }
}

function countValues(values) {
  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Object.freeze(Object.fromEntries(
    [...counts].sort(([left], [right]) => left.localeCompare(right))
  ));
}

function requireArray(value, name) {
  if (!Array.isArray(value)) {
    throw new Error(`m2_current_${name}_required`);
  }
  return value;
}

function uniqueStrings(values, name) {
  if (!Array.isArray(values)) {
    throw new Error(`m2_current_${name}_invalid`);
  }
  const normalized = values.map(
    (value) => requireString(value, name)
  );
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`m2_current_${name}_duplicate`);
  }
  return normalized;
}

function requireString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`m2_current_${name}_required`);
  }
  return value.trim();
}

function requirePositiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`m2_current_${name}_invalid`);
  }
  return number;
}

function requireCurrency(value) {
  const currency = String(value ?? "");
  if (!ISO_CURRENCY_PATTERN.test(currency)) {
    throw new Error("m2_current_signal_input_currency_invalid");
  }
  return currency;
}
