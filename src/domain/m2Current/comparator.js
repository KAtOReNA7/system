import { buildM2CurrentCaseKey } from "./case.js";
import { scoreM2CurrentPointRows } from "./metrics.js";

export function alignM2CurrentCandidateToB4(
  candidateRows,
  comparatorRows,
  contract
) {
  const candidate = indexRows(candidateRows, "candidate", contract);
  const comparator = indexRows(comparatorRows, "comparator", contract);
  if (candidate.size !== comparator.size) {
    throw new Error("m2_current_comparator_population_mismatch");
  }
  const pairs = [];
  for (const [key, candidateRow] of candidate) {
    const comparatorRow = comparator.get(key);
    if (!comparatorRow) {
      throw new Error("m2_current_comparator_case_set_mismatch");
    }
    if (Number(candidateRow.actual) !== Number(comparatorRow.actual)) {
      throw new Error("m2_current_comparator_actual_mismatch");
    }
    pairs.push({
      key,
      standardWorkId: candidateRow.standardWorkId,
      origin: candidateRow.origin,
      candidate: candidateRow,
      comparator: comparatorRow
    });
  }
  for (const key of comparator.keys()) {
    if (!candidate.has(key)) {
      throw new Error("m2_current_comparator_case_set_mismatch");
    }
  }
  pairs.sort((a, b) => a.key.localeCompare(b.key));
  return pairs;
}

export function compareM2CurrentCandidateToB4(
  candidateRows,
  comparatorRows,
  contract
) {
  const pairs = alignM2CurrentCandidateToB4(
    candidateRows,
    comparatorRows,
    contract
  );
  const candidate = scoreM2CurrentPointRows(
    pairs.map((pair) => pair.candidate)
  );
  const b4 = scoreM2CurrentPointRows(
    pairs.map((pair) => pair.comparator)
  );
  if (b4.wape === 0) {
    throw new Error("m2_current_comparator_wape_zero");
  }
  return {
    caseKeyParity: true,
    actualParity: true,
    candidate,
    b4,
    relativeWape: candidate.wape / b4.wape - 1
  };
}

function indexRows(rows, role, contract) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`m2_current_${role}_rows_required`);
  }
  const indexed = new Map();
  for (const row of rows) {
    const key = buildM2CurrentCaseKey(row, contract);
    if (indexed.has(key)) {
      throw new Error(`m2_current_duplicate_${role}_case`);
    }
    indexed.set(key, row);
  }
  return indexed;
}
