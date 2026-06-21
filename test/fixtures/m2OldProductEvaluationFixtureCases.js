export const expectedM2OldProductCoverage = Object.freeze({
  standardWorkIds: [
    "SYN-WORK-0001",
    "SYN-WORK-0002",
    "SYN-WORK-0003",
    "SYN-WORK-0004",
    "SYN-WORK-0005",
    "SYN-WORK-0006",
    "SYN-WORK-0007"
  ],
  ratings: ["S+", "S", "A", "B", "C", "D", "E"],
  lifecycles: [
    "growth",
    "stable",
    "declining",
    "long_tail",
    "inactive",
    "rebound",
    "insufficient_history"
  ],
  readiness: ["ready", "blocked"],
  resultStatuses: ["current", "historical", "invalidated"],
  forecastScenarios: ["base", "optimistic", "pessimistic"],
  backtestOutcomes: ["covered", "missed", "over", "under"]
});

export const forbiddenM2OldProductOutputTokens = Object.freeze([
  "postgres://",
  "postgresql://",
  "SELECT ",
  "INSERT ",
  "UPDATE ",
  "DELETE ",
  "stack",
  "password=",
  "token=",
  "secret=",
  "mapping_import_stage-v0.1.json",
  "mapping_import_stage-v0.2.json",
  "data/real-bills",
  "data\\\\real-bills"
]);
