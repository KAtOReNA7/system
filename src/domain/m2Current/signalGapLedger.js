import {
  buildM2CurrentAvailabilitySnapshot
} from "./availabilitySnapshot.js";

const MONTH_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])$/u;
const SEGMENTS = Object.freeze(["dense", "intermittent", "dormant"]);
const SEGMENT_SET = new Set(SEGMENTS);

export function buildM2CurrentSignalGapLedger(caseRows, snapshotInputs) {
  if (!Array.isArray(caseRows) || caseRows.length === 0) {
    throw new Error("m2_current_signal_gap_cases_required");
  }
  if (!Array.isArray(snapshotInputs)) {
    throw new Error("m2_current_signal_gap_snapshots_required");
  }

  const grains = buildGrains(caseRows);
  const grainKeys = new Set(grains.map((grain) => grain.key));
  const snapshotByKey = new Map();
  for (const input of snapshotInputs) {
    const snapshot = buildM2CurrentAvailabilitySnapshot(input);
    const key = workOriginKey(snapshot.standardWorkId, snapshot.origin);
    if (snapshotByKey.has(key)) {
      throw new Error("m2_current_signal_gap_snapshot_duplicate");
    }
    if (!grainKeys.has(grainKey(
      snapshot.standardWorkId,
      snapshot.origin,
      snapshot.segment
    ))) {
      throw new Error("m2_current_signal_gap_snapshot_outside_population");
    }
    snapshotByKey.set(key, snapshot);
  }

  const rows = grains.map((grain) => {
    const snapshot = snapshotByKey.get(
      workOriginKey(grain.standardWorkId, grain.origin)
    );
    if (snapshot && snapshot.segment !== grain.segment) {
      throw new Error("m2_current_signal_gap_snapshot_segment_mismatch");
    }
    const status = snapshot?.status ?? "unknown_at_origin";
    const occurrence = snapshot?.signals.occurrence
      ?? Object.freeze({ status: "missing", value: null });
    const positiveAmount = snapshot?.signals.positiveAmount
      ?? Object.freeze({ status: "missing", value: null });
    const missingReason = status === "unknown_at_origin"
      ? snapshot?.missingReason ?? "availability_snapshot_missing"
      : null;
    return Object.freeze({
      standardWorkId: grain.standardWorkId,
      origin: grain.origin,
      segment: grain.segment,
      horizonCaseCount: grain.horizonCaseCount,
      availabilityStatus: status,
      occurrenceSignalStatus: occurrence.status,
      occurrenceValue: occurrence.value,
      positiveAmountSignalStatus: positiveAmount.status,
      positiveAmountValue: positiveAmount.value,
      missingReason,
      currentStateBackfillUsed: false
    });
  });

  const overall = summarizeRows(rows);
  const bySegment = Object.fromEntries(
    SEGMENTS.map((segment) => [
      segment,
      summarizeRows(rows.filter((row) => row.segment === segment))
    ])
  );
  const origins = [...new Set(rows.map((row) => row.origin))].sort();
  const byOrigin = Object.fromEntries(
    origins.map((origin) => [
      origin,
      summarizeRows(rows.filter((row) => row.origin === origin))
    ])
  );
  const missingReasons = countValues(
    rows
      .map((row) => row.missingReason)
      .filter((value) => value !== null)
  );

  return Object.freeze({
    schema: "m2.current.signal_gap_ledger.v0.1",
    grain: "work_origin_segment",
    target: "future_sales_share_cash",
    inputCaseCount: caseRows.length,
    workOriginSegmentCount: rows.length,
    uniqueWorkCount: new Set(rows.map((row) => row.standardWorkId)).size,
    originCount: origins.length,
    snapshotCount: snapshotByKey.size,
    rows: Object.freeze(rows),
    overall,
    bySegment: Object.freeze(bySegment),
    byOrigin: Object.freeze(byOrigin),
    missingReasons: Object.freeze(missingReasons),
    readiness: Object.freeze({
      coverageMeasured: true,
      occurrenceFullyAvailable: overall.occurrence.coverage === 1,
      positiveAmountPathFullyAvailable:
        overall.positiveAmount.twoPartReadinessCoverage === 1,
      status: (
        overall.occurrence.coverage === 1
        && overall.positiveAmount.twoPartReadinessCoverage === 1
      )
        ? "AS_OF_SIGNAL_COVERAGE_COMPLETE"
        : "AS_OF_SIGNAL_COVERAGE_GAPS_PRESENT",
      authorizesNewCandidateFamily: false
    }),
    invariants: Object.freeze({
      populationRowsDropped: false,
      nullImputedAsZero: false,
      currentStateBackfillUsed: false,
      portfolioForecastAllocatedToWorks: false
    })
  });
}

export function summarizeM2CurrentSignalGapLedger(ledger) {
  if (ledger?.schema !== "m2.current.signal_gap_ledger.v0.1") {
    throw new Error("m2_current_signal_gap_ledger_invalid");
  }
  return Object.freeze({
    schema: "m2.current.signal_gap_summary.public.v0.1",
    grain: ledger.grain,
    target: ledger.target,
    inputCaseCount: ledger.inputCaseCount,
    workOriginSegmentCount: ledger.workOriginSegmentCount,
    uniqueWorkCount: ledger.uniqueWorkCount,
    originCount: ledger.originCount,
    snapshotCount: ledger.snapshotCount,
    overall: ledger.overall,
    bySegment: ledger.bySegment,
    byOrigin: ledger.byOrigin,
    missingReasons: ledger.missingReasons,
    readiness: ledger.readiness,
    invariants: ledger.invariants,
    aggregateOnly: true,
    rowIdentifiersIncluded: false
  });
}

function buildGrains(caseRows) {
  const byKey = new Map();
  const segmentByWorkOrigin = new Map();
  for (const row of caseRows) {
    const standardWorkId = requireString(
      row?.standardWorkId ?? row?.caseKey?.standardWorkId,
      "signal_gap_standard_work_id"
    );
    const origin = requireMonth(
      row?.origin ?? row?.caseKey?.origin,
      "signal_gap_origin"
    );
    const segment = requireSegment(row?.segment);
    const key = grainKey(standardWorkId, origin, segment);
    const workOrigin = workOriginKey(standardWorkId, origin);
    const knownSegment = segmentByWorkOrigin.get(workOrigin);
    if (knownSegment !== undefined && knownSegment !== segment) {
      throw new Error("m2_current_signal_gap_segment_drift");
    }
    segmentByWorkOrigin.set(workOrigin, segment);
    const current = byKey.get(key);
    if (current) {
      current.horizonCaseCount += 1;
    } else {
      byKey.set(key, {
        key,
        workOrigin,
        standardWorkId,
        origin,
        segment,
        horizonCaseCount: 1
      });
    }
  }
  return [...byKey.values()].sort((left, right) => (
    left.origin.localeCompare(right.origin)
    || left.segment.localeCompare(right.segment)
    || left.standardWorkId.localeCompare(right.standardWorkId)
  ));
}

function summarizeRows(rows) {
  const count = rows.length;
  const occurrenceAvailable = rows.filter(
    (row) => row.occurrenceSignalStatus === "available"
  );
  const occurrencePositive = occurrenceAvailable.filter(
    (row) => row.occurrenceValue === true
  );
  const amountAvailable = rows.filter(
    (row) => row.positiveAmountSignalStatus === "available"
  ).length;
  const amountNotApplicable = rows.filter(
    (row) => row.positiveAmountSignalStatus === "not_applicable"
  ).length;
  const amountMissing = count - amountAvailable - amountNotApplicable;
  const twoPartReadyCount = amountAvailable + amountNotApplicable;
  return Object.freeze({
    workOriginSegmentCount: count,
    occurrence: Object.freeze({
      eligibleCount: count,
      availableCount: occurrenceAvailable.length,
      positiveCount: occurrencePositive.length,
      nonPositiveCount:
        occurrenceAvailable.length - occurrencePositive.length,
      missingCount: count - occurrenceAvailable.length,
      coverage: ratio(occurrenceAvailable.length, count)
    }),
    positiveAmount: Object.freeze({
      eligibleCount: count,
      availableCount: amountAvailable,
      notApplicableCount: amountNotApplicable,
      missingCount: amountMissing,
      twoPartReadyCount,
      twoPartReadinessCoverage: ratio(twoPartReadyCount, count),
      conditionalPositiveOccurrenceCount: occurrencePositive.length,
      conditionalPositiveAmountCoverage:
        ratio(amountAvailable, occurrencePositive.length)
    })
  });
}

function ratio(numerator, denominator) {
  return denominator === 0 ? null : numerator / denominator;
}

function countValues(values) {
  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Object.fromEntries([...counts].sort(([left], [right]) => (
    left.localeCompare(right)
  )));
}

function grainKey(standardWorkId, origin, segment) {
  return `${standardWorkId}|${origin}|${segment}`;
}

function workOriginKey(standardWorkId, origin) {
  return `${standardWorkId}|${origin}`;
}

function requireSegment(value) {
  const segment = String(value ?? "");
  if (!SEGMENT_SET.has(segment)) {
    throw new Error("m2_current_signal_gap_segment_invalid");
  }
  return segment;
}

function requireMonth(value, name) {
  const month = String(value ?? "");
  if (!MONTH_PATTERN.test(month)) {
    throw new Error(`m2_current_${name}_invalid`);
  }
  return month;
}

function requireString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`m2_current_${name}_required`);
  }
  return value.trim();
}
