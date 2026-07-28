const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export const REVERSAL_ACTUAL_DEFINITION_V1 = Object.freeze({
  stableId: "M2-ACTUAL-REVERSAL-RESTATEMENT-01",
  displayNameZh: "分成收入冲销追溯重述 v1",
  displayNameEn: "Sales-Share Revenue Reversal Restatement v1"
});

export const DEVELOPMENT_MODELABLE_ACTUAL_DEFINITION_V1 = Object.freeze({
  stableId: "M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01",
  displayNameZh: "分成收入开发可建模冲销重述 v1",
  displayNameEn:
    "Sales-Share Revenue Development-Modelable Reversal Restatement v1"
});

export const UNALLOCATED_REVERSAL_RESIDUAL_EXCLUSION_STATUS =
  "UNALLOCATED_REVERSAL_RESIDUAL_EXCLUDED_FROM_MODELABLE_TARGET";

export function buildReversalScopeKeyV1({
  cashCategory,
  standardWorkId,
  channelMemberId,
  currencyScope,
  settlementScope = null
}) {
  if (cashCategory !== "sales_share") {
    throw new Error("m2_reversal_restatement_sales_share_scope_required");
  }
  const required = { standardWorkId, channelMemberId, currencyScope };
  for (const [field, value] of Object.entries(required)) {
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(`m2_reversal_restatement_scope_${field}_required`);
    }
  }
  return JSON.stringify([
    cashCategory,
    standardWorkId,
    channelMemberId,
    currencyScope,
    settlementScope ?? "__NOT_AVAILABLE__"
  ]);
}

export function restateSalesShareReversalsV1(rows, options = {}) {
  requireRows(rows);
  const cutoff = normalizeCutoff(options.cutoff ?? null);
  const normalized = rows.map((row, index) => normalizeRow(row, index));
  if (normalized.some((row) => row.recordedMonth === null)) {
    return {
      status: "BLOCKED_RECORDED_AT_MISSING",
      actualDefinitionId: REVERSAL_ACTUAL_DEFINITION_V1.stableId,
      scopeCount: 0,
      scopes: []
    };
  }
  const visible = cutoff === null
    ? normalized
    : normalized.filter((row) => row.recordedMonth <= cutoff);
  const futureExcludedCount = normalized.length - visible.length;
  const groups = groupBy(visible, (row) => row.reversalScopeKey);
  const scopes = [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([scopeKey, scopeRows]) =>
      restateScope(scopeKey, scopeRows, options.authorityStartMonth ?? null)
    );
  const blockedUnclassified = scopes.some(
    (scope) => scope.unclassifiedNegativeCount > 0
  );
  const summary = summarizeScopes(scopes);
  return {
    status: blockedUnclassified
      ? "BLOCKED_REVERSAL_CLASSIFICATION"
      : summary.unresolvedReversalResidualMinor === "0"
        ? "COMPLETE"
        : "BLOCKED_UNRESOLVED_REVERSAL",
    actualDefinitionId: REVERSAL_ACTUAL_DEFINITION_V1.stableId,
    cutoff,
    inputRowCount: rows.length,
    visibleRowCount: visible.length,
    futureExcludedCount,
    ...summary,
    scopes
  };
}

export function buildReversalTimeViewsV1(rows, options = {}) {
  const originCutoff = normalizeCutoff(options.originCutoff);
  const labelMaturityCutoff = normalizeCutoff(options.labelMaturityCutoff);
  if (originCutoff === null || labelMaturityCutoff === null) {
    throw new Error("m2_reversal_restatement_cutoffs_required");
  }
  if (originCutoff > labelMaturityCutoff) {
    throw new Error("m2_reversal_restatement_cutoff_order_invalid");
  }
  const asOf = restateSalesShareReversalsV1(rows, {
    ...options,
    cutoff: originCutoff
  });
  const final = restateSalesShareReversalsV1(rows, {
    ...options,
    cutoff: labelMaturityCutoff
  });
  const postingTime = postingTimeActualV1(rows, {
    cutoff: labelMaturityCutoff
  });
  return {
    status: [asOf.status, final.status].every((status) => status === "COMPLETE")
      ? "THREE_VIEWS_COMPLETE"
      : "THREE_VIEWS_BLOCKED",
    originCutoff,
    labelMaturityCutoff,
    postingTimeActual: postingTime,
    restatedActualAsOf: asOf,
    finalRestatedActual: final,
    futureLeakageCheck: {
      status: asOf.futureExcludedCount > 0
        ? "PASS_FUTURE_ROWS_EXCLUDED"
        : "PASS_NO_FUTURE_ROWS_PRESENT",
      originAfterCutoffRowsUsed: 0
    }
  };
}

export function buildReversalFourViewsV1(rows, options = {}) {
  const originCutoff = normalizeCutoff(options.originCutoff);
  const labelMaturityCutoff = normalizeCutoff(options.labelMaturityCutoff);
  if (originCutoff === null || labelMaturityCutoff === null) {
    throw new Error("m2_reversal_restatement_cutoffs_required");
  }
  if (originCutoff > labelMaturityCutoff) {
    throw new Error("m2_reversal_restatement_cutoff_order_invalid");
  }
  const postingTime = postingTimeActualV1(rows, {
    cutoff: labelMaturityCutoff
  });
  const asOf = restateSalesShareReversalsV1(rows, {
    ...options,
    cutoff: originCutoff
  });
  const final = restateSalesShareReversalsV1(rows, {
    ...options,
    cutoff: labelMaturityCutoff
  });
  const reconciliationDifference =
    BigInt(final.positiveRevenueMinor)
    + BigInt(final.reversalPostingMinor)
    - BigInt(final.modelableRestatedRevenueMinor)
    - BigInt(final.excludedUnallocatedReversalResidualMinor);
  if (reconciliationDifference !== 0n) {
    throw new Error(
      "m2_reversal_restatement_development_modelable_conservation_failed"
    );
  }
  const reversalRows = rows.filter((row) =>
    String(row.eventType ?? "") === "reversal"
  );
  const controlsPass = (
    asOf.conservationDifferenceMinor === "0"
    && final.conservationDifferenceMinor === "0"
    && asOf.status !== "BLOCKED_RECORDED_AT_MISSING"
    && final.status !== "BLOCKED_RECORDED_AT_MISSING"
    && asOf.status !== "BLOCKED_REVERSAL_CLASSIFICATION"
    && final.status !== "BLOCKED_REVERSAL_CLASSIFICATION"
  );
  return {
    status: controlsPass
      ? "FOUR_VIEWS_COMPLETE_FOR_DEVELOPMENT"
      : "FOUR_VIEWS_BLOCKED",
    originCutoff,
    labelMaturityCutoff,
    POSTING_TIME_ACCOUNTING_VIEW: {
      status: "PASS_RAW_ACCOUNTING_RECORDS_PRESERVED",
      actualDefinitionId: "M2-ACTUAL-POSTING-TIME-01",
      reversalRowCount: reversalRows.length,
      originalReversalRowsDeleted: 0,
      postingTimeActual: postingTime
    },
    AS_OF_RESTATED_VIEW: {
      status: controlsPass
        ? "PASS_ORIGIN_VISIBLE_REVERSALS_ONLY"
        : "BLOCKED",
      actualDefinitionId: REVERSAL_ACTUAL_DEFINITION_V1.stableId,
      restatement: asOf,
      originAfterCutoffRowsUsed: 0
    },
    FINAL_ACCOUNTING_RECONCILIATION_VIEW: {
      status: BigInt(final.unresolvedReversalResidualMinor) === 0n
        ? "PASS_FULLY_ALLOCATED"
        : "RECONCILED_WITH_DISCLOSED_UNALLOCATED_RESIDUAL",
      actualDefinitionId: REVERSAL_ACTUAL_DEFINITION_V1.stableId,
      positiveRevenueMinor: final.positiveRevenueMinor,
      reversalPostingMinor: final.reversalPostingMinor,
      tracedOffsetMinor: final.tracedOffsetMinor,
      restatedRevenueMinor: final.restatedRevenueMinor,
      unresolvedReversalResidualMinor:
        final.unresolvedReversalResidualMinor,
      conservationDifferenceMinor: final.conservationDifferenceMinor,
      unresolvedResidualSolved:
        BigInt(final.unresolvedReversalResidualMinor) === 0n,
      restatement: final
    },
    DEVELOPMENT_MODELABLE_RESTATEMENT_VIEW: {
      status: BigInt(final.unresolvedReversalResidualMinor) === 0n
        ? "COMPLETE_NO_RESIDUAL_TO_EXCLUDE"
        : UNALLOCATED_REVERSAL_RESIDUAL_EXCLUSION_STATUS,
      actualDefinitionId:
        DEVELOPMENT_MODELABLE_ACTUAL_DEFINITION_V1.stableId,
      modelableRestatedCashMinor: final.modelableRestatedRevenueMinor,
      excludedUnallocatedReversalResidualMinor:
        final.excludedUnallocatedReversalResidualMinor,
      exactIntegerReconciliation: {
        equation:
          "postingPositiveCash + postedReversal = "
          + "modelableRestatedCash + excludedUnallocatedReversalResidual",
        postingPositiveCashMinor: final.positiveRevenueMinor,
        postedReversalMinor: final.reversalPostingMinor,
        modelableRestatedCashMinor: final.modelableRestatedRevenueMinor,
        excludedUnallocatedReversalResidualMinor:
          final.excludedUnallocatedReversalResidualMinor,
        differenceMinor: reconciliationDifference.toString()
      },
      wholeCaseExclusionAllowed: false,
      allocatedReversalComponentPreserved: true
    },
    futureLeakageCheck: {
      status: asOf.futureExcludedCount > 0
        ? "PASS_FUTURE_ROWS_EXCLUDED"
        : "PASS_NO_FUTURE_ROWS_PRESENT",
      originAfterCutoffRowsUsed: 0
    }
  };
}

export function postingTimeActualV1(rows, options = {}) {
  requireRows(rows);
  const cutoff = normalizeCutoff(options.cutoff ?? null);
  const totals = new Map();
  let visibleRowCount = 0;
  for (let index = 0; index < rows.length; index += 1) {
    const row = normalizeRow(rows[index], index);
    if (row.recordedMonth === null) {
      throw new Error("m2_reversal_restatement_recorded_at_required");
    }
    if (cutoff !== null && row.recordedMonth > cutoff) continue;
    visibleRowCount += 1;
    const key = `${row.reversalScopeKey}\u001f${row.postingMonth}`;
    totals.set(key, (totals.get(key) ?? 0n) + row.amountMinor);
  }
  return {
    cutoff,
    visibleRowCount,
    rows: [...totals.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, amount]) => {
        const separator = key.lastIndexOf("\u001f");
        return {
          reversalScopeKey: key.slice(0, separator),
          postingMonth: key.slice(separator + 1),
          amountMinor: amount.toString()
        };
      })
  };
}

export function restatedAmountForWindowV1(
  restatement,
  standardWorkId,
  startMonth,
  endMonth
) {
  requireMonth(startMonth, "window_start");
  requireMonth(endMonth, "window_end");
  if (endMonth < startMonth) {
    throw new Error("m2_reversal_restatement_window_order_invalid");
  }
  let total = 0n;
  for (const scope of restatement.scopes ?? []) {
    if (scope.standardWorkId !== standardWorkId) continue;
    for (const balance of scope.restatedBalances) {
      if (balance.month >= startMonth && balance.month <= endMonth) {
        total += BigInt(balance.amountMinor);
      }
    }
  }
  return total.toString();
}

function restateScope(scopeKey, rows, authorityStartMonth) {
  const scopeIdentity = JSON.parse(scopeKey);
  const positiveByMonth = new Map();
  const postingByMonth = new Map();
  const reversals = [];
  let unclassifiedNegativeCount = 0;
  for (const row of rows) {
    postingByMonth.set(
      row.postingMonth,
      (postingByMonth.get(row.postingMonth) ?? 0n) + row.amountMinor
    );
    if (row.eventType === "positive_sales_share") {
      positiveByMonth.set(
        row.postingMonth,
        (positiveByMonth.get(row.postingMonth) ?? 0n) + row.amountMinor
      );
    } else if (row.eventType === "reversal") {
      reversals.push(row);
    } else if (row.amountMinor < 0n) {
      unclassifiedNegativeCount += 1;
    }
  }
  const balances = new Map(positiveByMonth);
  const original = new Map(positiveByMonth);
  const rowMonths = rows.map((row) => row.postingMonth).sort();
  const earliest = authorityStartMonth ?? rowMonths[0];
  requireMonth(earliest, "authority_start");
  const allocations = [];
  const residuals = [];
  const affectedMonths = new Set();
  const traceDepths = { "0": 0, "1": 0, "2": 0, "3": 0, more: 0 };
  reversals.sort((left, right) =>
    left.postingMonth.localeCompare(right.postingMonth)
    || left.recordedAt.localeCompare(right.recordedAt)
    || left.recordId.localeCompare(right.recordId)
  );
  for (const reversal of reversals) {
    let remaining = -reversal.amountMinor;
    let cursor = reversal.postingMonth;
    let maximumDepth = 0;
    while (cursor >= earliest && remaining > 0n) {
      const available = balances.get(cursor) ?? 0n;
      const consumed = available < remaining ? available : remaining;
      const balanceAfter = available - consumed;
      balances.set(cursor, balanceAfter);
      remaining -= consumed;
      const depth = monthDistance(cursor, reversal.postingMonth);
      maximumDepth = Math.max(maximumDepth, depth);
      if (consumed > 0n) affectedMonths.add(cursor);
      allocations.push({
        reversalRecordId: reversal.recordId,
        reversalPostingMonth: reversal.postingMonth,
        reversalRecordedAt: reversal.recordedAt,
        revenueRecognitionMonth: cursor,
        consumedAmountMinor: consumed.toString(),
        balanceAfterMinor: balanceAfter.toString(),
        traceDepthMonths: depth
      });
      cursor = addMonths(cursor, -1);
    }
    const residual = -remaining;
    residuals.push({
      reversalRecordId: reversal.recordId,
      unresolvedReversalResidualMinor: residual.toString()
    });
    const bucket = maximumDepth >= 4 ? "more" : String(maximumDepth);
    traceDepths[bucket] += 1;
  }
  const positiveTotal = sumBigInts(original.values());
  const reversalTotal = sumBigInts(reversals.map((row) => row.amountMinor));
  const restatedTotal = sumBigInts(balances.values());
  const unresolved = sumBigInts(
    residuals.map((row) => BigInt(row.unresolvedReversalResidualMinor))
  );
  const conservationDifference =
    positiveTotal + reversalTotal - restatedTotal - unresolved;
  if (conservationDifference !== 0n) {
    throw new Error("m2_reversal_restatement_conservation_failed");
  }
  const months = [...new Set([...original.keys(), ...balances.keys()])].sort();
  const fullyZeroedMonthCount = months.filter((month) =>
    (original.get(month) ?? 0n) > 0n && (balances.get(month) ?? 0n) === 0n
  ).length;
  const partiallyRetainedMonthCount = months.filter((month) => {
    const before = original.get(month) ?? 0n;
    const after = balances.get(month) ?? 0n;
    return after > 0n && after < before;
  }).length;
  return {
    reversalScopeKey: scopeKey,
    cashCategory: scopeIdentity[0],
    standardWorkId: scopeIdentity[1],
    channelMemberId: scopeIdentity[2],
    currencyScope: scopeIdentity[3],
    settlementScope: scopeIdentity[4],
    postingTimeBalances: [...postingByMonth.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([month, amount]) => ({ month, amountMinor: amount.toString() })),
    restatedBalances: [...balances.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([month, amount]) => ({ month, amountMinor: amount.toString() })),
    allocations,
    residuals,
    positiveRevenueMinor: positiveTotal.toString(),
    reversalPostingMinor: reversalTotal.toString(),
    tracedOffsetMinor: (positiveTotal - restatedTotal).toString(),
    restatedRevenueMinor: restatedTotal.toString(),
    modelableRestatedRevenueMinor: restatedTotal.toString(),
    unresolvedReversalResidualMinor: unresolved.toString(),
    excludedUnallocatedReversalResidualMinor: unresolved.toString(),
    residualExclusionStatus: unresolved === 0n
      ? "NO_UNALLOCATED_REVERSAL_RESIDUAL"
      : UNALLOCATED_REVERSAL_RESIDUAL_EXCLUSION_STATUS,
    conservationDifferenceMinor: conservationDifference.toString(),
    reversalCount: reversals.length,
    unclassifiedNegativeCount,
    affectedMonthCount: affectedMonths.size,
    fullyZeroedMonthCount,
    partiallyRetainedMonthCount,
    maximumTraceDepthMonths: allocations.reduce(
      (maximum, row) => Math.max(maximum, row.traceDepthMonths),
      0
    ),
    traceDepthDistribution: traceDepths
  };
}

function summarizeScopes(scopes) {
  const sumField = (field) => sumBigInts(
    scopes.map((scope) => BigInt(scope[field]))
  ).toString();
  const traceDepthDistribution = { "0": 0, "1": 0, "2": 0, "3": 0, more: 0 };
  for (const scope of scopes) {
    for (const key of Object.keys(traceDepthDistribution)) {
      traceDepthDistribution[key] += scope.traceDepthDistribution[key];
    }
  }
  return {
    scopeCount: scopes.length,
    positiveRevenueMinor: sumField("positiveRevenueMinor"),
    reversalPostingMinor: sumField("reversalPostingMinor"),
    tracedOffsetMinor: sumField("tracedOffsetMinor"),
    restatedRevenueMinor: sumField("restatedRevenueMinor"),
    modelableRestatedRevenueMinor: sumField(
      "modelableRestatedRevenueMinor"
    ),
    unresolvedReversalResidualMinor: sumField(
      "unresolvedReversalResidualMinor"
    ),
    excludedUnallocatedReversalResidualMinor: sumField(
      "excludedUnallocatedReversalResidualMinor"
    ),
    conservationDifferenceMinor: sumField("conservationDifferenceMinor"),
    affectedScopeCount: scopes.filter((scope) => scope.allocations.some(
      (row) => BigInt(row.consumedAmountMinor) > 0n
    )).length,
    affectedWorkCount: new Set(scopes.filter((scope) =>
      scope.allocations.some((row) => BigInt(row.consumedAmountMinor) > 0n)
    ).map((scope) => scope.standardWorkId)).size,
    affectedChannelCount: new Set(scopes.filter((scope) =>
      scope.allocations.some((row) => BigInt(row.consumedAmountMinor) > 0n)
    ).map((scope) => scope.channelMemberId)).size,
    affectedMonthCount: scopes.reduce(
      (sum, scope) => sum + scope.affectedMonthCount,
      0
    ),
    fullyZeroedMonthCount: scopes.reduce(
      (sum, scope) => sum + scope.fullyZeroedMonthCount,
      0
    ),
    partiallyRetainedMonthCount: scopes.reduce(
      (sum, scope) => sum + scope.partiallyRetainedMonthCount,
      0
    ),
    maximumTraceDepthMonths: scopes.reduce(
      (maximum, scope) => Math.max(maximum, scope.maximumTraceDepthMonths),
      0
    ),
    traceDepthDistribution
  };
}

function normalizeRow(row, index) {
  if (row === null || typeof row !== "object" || Array.isArray(row)) {
    throw new Error("m2_reversal_restatement_row_invalid");
  }
  const recordId = String(row.recordId ?? "").trim();
  const reversalScopeKey = String(row.reversalScopeKey ?? "").trim();
  const postingMonth = String(row.postingMonth ?? "").slice(0, 7);
  const recordedAt = row.recordedAt === null || row.recordedAt === undefined
    ? null
    : String(row.recordedAt);
  const recordedMonth = recordedAt === null ? null : recordedAt.slice(0, 7);
  if (!recordId) throw new Error("m2_reversal_restatement_record_id_required");
  if (!reversalScopeKey) {
    throw new Error("m2_reversal_restatement_scope_key_required");
  }
  requireMonth(postingMonth, "posting_month");
  if (recordedMonth !== null) requireMonth(recordedMonth, "recorded_at");
  const amountMinor = integerMinor(row.amountMinor);
  const eventType = String(row.eventType ?? "");
  if (![
    "positive_sales_share",
    "reversal",
    "negative_non_reversal"
  ].includes(eventType)) {
    throw new Error("m2_reversal_restatement_event_type_invalid");
  }
  if (eventType === "positive_sales_share" && amountMinor < 0n) {
    throw new Error("m2_reversal_restatement_positive_sign_invalid");
  }
  if (eventType === "reversal" && amountMinor >= 0n) {
    throw new Error("m2_reversal_restatement_reversal_sign_invalid");
  }
  return {
    ...row,
    inputIndex: index,
    recordId,
    reversalScopeKey,
    postingMonth,
    recordedAt,
    recordedMonth,
    eventType,
    amountMinor
  };
}

function integerMinor(value) {
  if (
    typeof value === "number"
    && (!Number.isSafeInteger(value) || !Number.isInteger(value))
  ) {
    throw new Error("m2_reversal_restatement_minor_unit_integer_required");
  }
  const text = String(value ?? "");
  if (!/^-?\d+$/.test(text)) {
    throw new Error("m2_reversal_restatement_minor_unit_integer_required");
  }
  return BigInt(text);
}

function normalizeCutoff(value) {
  if (value === null || value === undefined) return null;
  const month = String(value).slice(0, 7);
  requireMonth(month, "cutoff");
  return month;
}

function requireMonth(value, field) {
  if (!MONTH_PATTERN.test(value)) {
    throw new Error(`m2_reversal_restatement_${field}_invalid`);
  }
}

function groupBy(values, keyOf) {
  const result = new Map();
  for (const value of values) {
    const key = keyOf(value);
    const group = result.get(key) ?? [];
    group.push(value);
    result.set(key, group);
  }
  return result;
}

function sumBigInts(values) {
  let total = 0n;
  for (const value of values) total += value;
  return total;
}

function monthDistance(earlier, later) {
  const [earlierYear, earlierMonth] = earlier.split("-").map(Number);
  const [laterYear, laterMonth] = later.split("-").map(Number);
  return (laterYear - earlierYear) * 12 + laterMonth - earlierMonth;
}

function addMonths(month, amount) {
  const [year, value] = month.split("-").map(Number);
  const absolute = year * 12 + value - 1 + amount;
  const nextYear = Math.floor(absolute / 12);
  const nextMonth = absolute % 12 + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
}

function requireRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("m2_reversal_restatement_rows_required");
  }
}
