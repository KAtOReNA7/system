import { buildM2CurrentCaseKey } from "./case.js";
import { scoreM2CurrentPointRows } from "./metrics.js";

export function compareM2CurrentCandidateToB4(candidateRows, comparatorRows) {
  const comparator = new Map(
    comparatorRows.map((row) => [buildM2CurrentCaseKey(row), row])
  );
  if (comparator.size !== comparatorRows.length) {
    throw new Error("m2_current_duplicate_comparator_case");
  }
  const candidateForScore = [];
  const comparatorForScore = [];
  for (const row of candidateRows) {
    const key = buildM2CurrentCaseKey(row);
    const baseline = comparator.get(key);
    if (!baseline) {
      throw new Error("m2_current_comparator_case_missing");
    }
    if (Number(row.actual) !== Number(baseline.actual)) {
      throw new Error("m2_current_comparator_actual_mismatch");
    }
    candidateForScore.push(row);
    comparatorForScore.push(baseline);
  }
  if (candidateRows.length !== comparatorRows.length) {
    throw new Error("m2_current_comparator_population_mismatch");
  }
  const candidate = scoreM2CurrentPointRows(candidateForScore);
  const b4 = scoreM2CurrentPointRows(comparatorForScore);
  return {
    caseKeyParity: true,
    actualParity: true,
    candidate,
    b4,
    relativeWape: candidate.wape / b4.wape - 1
  };
}
