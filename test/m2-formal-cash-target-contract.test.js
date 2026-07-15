import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const specPath = path.join(
  root,
  "src/domain/oldProductEvaluation/calibrationSpec.c2r.v1.1.amendment.json",
);
const runner = "scripts/m2-real-data/run_m2_formal_cash_target_correction.py";
const python = "scripts/run-codex-python.mjs";
const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));

const preflightProcess = spawnSync(
  process.execPath,
  [python, runner, "--preflight"],
  { cwd: root, encoding: "utf8" },
);
assert.equal(preflightProcess.status, 0, preflightProcess.stderr);
const preflight = JSON.parse(preflightProcess.stdout.trim().split(/\r?\n/).at(-1));

function runPythonProbe(source) {
  const result = spawnSync(process.execPath, [python, "-c", source], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
}

const hardenedContractProbe = runPythonProbe(String.raw`
import copy
import json
import sys
from pathlib import Path

root = Path.cwd()
sys.path.insert(0, str(root / "scripts" / "m2-real-data"))
import m2_calibration_v1 as base
import m2_formal_cash_target_v1 as cash

WORK = "SYNTHETIC-FORMAL-CASH-WORK"
ORIGIN = "2019-12"


def commitment(**overrides):
    value = {
        "standard_work_id": WORK,
        "commitment_id": "COMMITMENT-1",
        "cash_type": "buyout_receivable",
        "status": "confirmed",
        "confirmed_amount": 1000.0,
        "outstanding_amount": 1000.0,
        "receivable_status": "outstanding",
        "expected_posting_month": "2020-01",
        "confirmed_as_of": ORIGIN,
        "available_as_of": ORIGIN,
        "evidence_ref": "synthetic-contract-evidence",
    }
    value.update(overrides)
    return value


def forecast(route, snapshots, sales=None, horizon=3, **overrides):
    arguments = {
        "standard_work_id": WORK,
        "route": route,
        "origin": ORIGIN,
        "horizon": horizon,
        "sales_monthly_prediction": sales,
        "cash_commitment_snapshots": snapshots,
        "statistically_scoreable": True,
        "business_serving_eligible": True,
    }
    arguments.update(overrides)
    return cash.compose_future_cash_forecast(**arguments)


def contract_error(callable_):
    try:
        callable_()
    except cash.FormalCashContractError:
        return True
    return False


other_cash_only = forecast(
    "pure_buyout",
    [commitment(cash_type="other_confirmed_cash")],
)
outside_horizon = forecast(
    "pure_buyout",
    [commitment(expected_posting_month="2020-12")],
)
valid_order = forecast("pure_buyout", [commitment()])
confirmation_after_availability = forecast(
    "pure_buyout",
    [commitment(confirmed_as_of="2019-12", available_as_of="2019-11")],
)
availability_after_origin = forecast(
    "pure_buyout",
    [commitment(confirmed_as_of="2020-01", available_as_of="2020-01")],
)
pure_sales_with_buyout = forecast(
    "pure_sales_share",
    [commitment()],
    {"2020-01": 100.0},
)

cross_work_rejected = contract_error(
    lambda: forecast(
        "pure_buyout",
        [commitment(standard_work_id="DIFFERENT-WORK")],
    )
)
non_native_boolean_rejected = contract_error(
    lambda: forecast(
        "pure_sales_share",
        [],
        {"2020-01": 100.0},
        statistically_scoreable="true",
    )
)
empty_case_key_rejected = contract_error(
    lambda: cash.formal_cash_case_key("", ORIGIN, 3, "pure_buyout")
)
conflicting = commitment()
conflicting_second = copy.deepcopy(conflicting)
conflicting_second["outstanding_amount"] = 900.0
same_month_conflict_rejected = contract_error(
    lambda: forecast("pure_buyout", [conflicting, conflicting_second])
)

resolved = cash.resolve_commitments_as_of(WORK, [commitment()], ORIGIN, 3)
components = {
    "cellActualByComponentMonth": {("component-a", "2020-01"): 100.0},
}
registry = [{
    "standard_work_id": WORK,
    "ledger_fact_key": "FACT-1",
    "channel_component_key": "component-a",
    "posting_month": "2020-01",
    "amount": 100.0,
    "cash_type": "buyout_receivable",
}]
link = {
    "standard_work_id": WORK,
    "commitment_id": "COMMITMENT-1",
    "ledger_fact_key": "FACT-1",
    "cash_type": "buyout_receivable",
    "channel_component_key": "component-a",
    "posting_month": "2020-01",
    "settlement_amount": 100.0,
    "truth_available_as_of": "2020-03",
}


def link_contract(work):
    return cash._linked_committed_actual_by_event(
        work,
        resolved,
        ORIGIN,
        3,
        "2020-03",
        components,
    )


phantom_link_rejected = contract_error(
    lambda: link_contract({
        "standard_work_id": WORK,
        "authority_ledger_fact_registry": registry,
        "cash_commitment_settlement_links": [
            {**link, "ledger_fact_key": "PHANTOM-FACT"}
        ],
    })
)
wrong_month_link_rejected = contract_error(
    lambda: link_contract({
        "standard_work_id": WORK,
        "authority_ledger_fact_registry": [
            {**registry[0], "posting_month": "2020-02"}
        ],
        "cash_commitment_settlement_links": [
            {**link, "posting_month": "2020-02"}
        ],
    })
)
per_fact_amount_mismatch_rejected = contract_error(
    lambda: link_contract({
        "standard_work_id": WORK,
        "authority_ledger_fact_registry": registry,
        "cash_commitment_settlement_links": [
            {**link, "settlement_amount": 99.0}
        ],
    })
)
cross_work_ledger_injection_rejected = contract_error(
    lambda: link_contract({
        "standard_work_id": WORK,
        "authority_ledger_fact_registry": [
            {**registry[0], "standard_work_id": "DIFFERENT-WORK"}
        ],
        "cash_commitment_settlement_links": [link],
    })
)
truth_before_posting_rejected = contract_error(
    lambda: link_contract({
        "standard_work_id": WORK,
        "authority_ledger_fact_registry": registry,
        "cash_commitment_settlement_links": [
            {**link, "truth_available_as_of": "2019-12"}
        ],
    })
)
phantom_extra_registry_cell_rejected = contract_error(
    lambda: link_contract({
        "standard_work_id": WORK,
        "authority_ledger_fact_registry": [
            *registry,
            {
                "standard_work_id": WORK,
                "ledger_fact_key": "PHANTOM-EXTRA-FACT",
                "channel_component_key": "component-extra",
                "posting_month": "2020-01",
                "amount": 1.0,
                "cash_type": "buyout_receivable",
            },
        ],
        "cash_commitment_settlement_links": [link],
    })
)
wrong_fact_cash_type_rejected = contract_error(
    lambda: link_contract({
        "standard_work_id": WORK,
        "authority_ledger_fact_registry": [
            {**registry[0], "cash_type": "sales_cash"}
        ],
        "cash_commitment_settlement_links": [link],
    })
)

# A cutoff-linked buyout receipt must not aggregate-offset an unrelated
# classifier-derived buyout on another component/month.
months = {month: 0.0 for month in base.month_range("2018-01", "2020-12")}
for month in ("2018-01", "2019-01", "2020-01"):
    months[month] = 1200.0
buyout_channel = {
    "channel_key": "synthetic-buyout-component",
    "business_form": "audio_copyright",
    "first_observed_month": "2018-01",
    "monthly": months,
    "batch_cluster_sizes": {"2018-01": 3, "2019-01": 3, "2020-01": 3},
}
second_buyout_months = {
    month: 0.0 for month in base.month_range("2018-01", "2020-12")
}
for month in ("2018-02", "2019-02", "2020-02"):
    second_buyout_months[month] = 1200.0
second_buyout_channel = {
    "channel_key": "synthetic-second-buyout-component",
    "business_form": "audio_copyright",
    "first_observed_month": "2018-01",
    "monthly": second_buyout_months,
    "batch_cluster_sizes": {"2018-02": 3, "2019-02": 3, "2020-02": 3},
}
unrelated_work = {
    "standard_work_id": WORK,
    "channels": [buyout_channel, second_buyout_channel],
    "cash_commitment_snapshots": [
        commitment(
            confirmed_amount=1200.0,
            outstanding_amount=1200.0,
            expected_posting_month="2020-02",
        )
    ],
}
buyout_component = base.channel_component_key(buyout_channel)
second_buyout_component = base.channel_component_key(second_buyout_channel)
facts = [{
    "standard_work_id": WORK,
    "ledger_fact_key": "BUYOUT-FACT",
    "channel_component_key": buyout_component,
    "posting_month": "2020-01",
    "amount": 1200.0,
    "cash_type": "buyout_receivable",
}, {
    "standard_work_id": WORK,
    "ledger_fact_key": "SECOND-BUYOUT-FACT",
    "channel_component_key": second_buyout_component,
    "posting_month": "2020-02",
    "amount": 1200.0,
    "cash_type": "buyout_receivable",
}]
unrelated_work["authority_ledger_fact_registry"] = facts
unrelated_work["cash_commitment_settlement_links"] = [{
    "standard_work_id": WORK,
    "commitment_id": "COMMITMENT-1",
    "ledger_fact_key": "SECOND-BUYOUT-FACT",
    "cash_type": "buyout_receivable",
    "channel_component_key": second_buyout_component,
    "posting_month": "2020-02",
    "settlement_amount": 1200.0,
    "truth_available_as_of": "2020-12",
}]
calibration_spec = base.load_spec()
route = base.route_work_as_of(unrelated_work, ORIGIN, calibration_spec)["route"]
unrelated_actuals = cash.build_formal_cash_actuals(
    unrelated_work,
    ORIGIN,
    12,
    route,
    calibration_spec,
    label_available_as_of="2020-12",
)

checks = {
    "pureBuyoutOtherCashOnlyStillAbstains": (
        other_cash_only["routeAbstained"] is True
        and other_cash_only["modelPredictionAvailable"] is False
        and other_cash_only["rawModelPrediction"] is None
        and other_cash_only["servedPrediction"] is None
    ),
    "pureBuyoutKnownOutsideHorizonIsNumericZero": (
        outside_horizon["routeAbstained"] is False
        and outside_horizon["modelPredictionAvailable"] is True
        and outside_horizon["rawModelPrediction"] == 0.0
        and outside_horizon["servedPrediction"] == 0.0
        and len(outside_horizon["cutoffKnownCashComponents"]) == 1
        and len(outside_horizon["confirmedCashComponents"]) == 0
    ),
    "confirmationAvailabilityOriginOrderingEnforced": (
        valid_order["rawModelPrediction"] == 1000.0
        and confirmation_after_availability["rawModelPrediction"] is None
        and availability_after_origin["rawModelPrediction"] is None
    ),
    "crossWorkCommitmentRejected": cross_work_rejected,
    "nonNativeBooleanRejected": non_native_boolean_rejected,
    "emptyCaseKeyRejected": empty_case_key_rejected,
    "sameMonthConflictingSnapshotRejected": same_month_conflict_rejected,
    "pureSalesIncludesCutoffBuyoutAndRequiresRouteReview": (
        pure_sales_with_buyout["rawModelPrediction"] == 1100.0
        and "cutoff_confirmed_buyout_requires_route_review"
        in pure_sales_with_buyout["limitation"]
    ),
    "phantomLedgerLinkRejected": phantom_link_rejected,
    "wrongMonthLedgerLinkRejected": wrong_month_link_rejected,
    "perLedgerFactAmountMismatchRejected": per_fact_amount_mismatch_rejected,
    "crossWorkLedgerInjectionRejected": cross_work_ledger_injection_rejected,
    "truthBeforePostingRejected": truth_before_posting_rejected,
    "phantomExtraRegistryCellRejected": phantom_extra_registry_cell_rejected,
    "wrongFactCashTypeRejected": wrong_fact_cash_type_rejected,
    "unrelatedLinkedEventCannotOffsetSurprise": (
        unrelated_actuals["classifierDerivedBuyoutActual"] == 2400.0
        and unrelated_actuals["cutoffCommittedBuyoutActual"] == 1200.0
        and unrelated_actuals["uncommittedBuyoutSurpriseActual"] == 1200.0
        and unrelated_actuals["forecastableCashActual"] == 1200.0
        and unrelated_actuals["totalLedgerCashActual"] == 2400.0
        and unrelated_actuals["amountConservationDifference"] == 0.0
    ),
}
print(json.dumps({"checks": checks, "passed": all(checks.values())}))
`);

test("formal-cash amendment is bound to both frozen parent contracts", () => {
  assert.equal(spec.version, "calibration-spec-c2r-v1.1-amendment");
  assert.equal(spec.amendmentKind, "formal_cash_target_correction");
  assert.equal(spec.decisionStatus, "not_for_formal_decision");
  for (const binding of Object.values(spec.parentBindings)) {
    assert.equal(fs.existsSync(path.join(root, binding.path)), true);
    assert.match(binding.canonicalDigestSha256, /^[a-f0-9]{64}$/);
  }
  // The Python preflight loads the amendment and recomputes both canonical
  // parent digests before it can return a passing result.
  assert.equal(preflight.status, "passed");
  assert.match(preflight.amendmentDigest, /^[a-f0-9]{64}$/);
});

test("commitment and truth-link contracts are exact-work, as-of, and per-ledger", () => {
  assert.equal(
    spec.asOfCommitmentEvidenceContract.visibilityPredicate,
    "confirmed_as_of<=available_as_of<=origin",
  );
  assert.equal(
    spec.asOfCommitmentEvidenceContract.commitmentExistenceIsResolvedBeforeHorizonAllocation,
    true,
  );
  assert.equal(
    spec.asOfCommitmentEvidenceContract.validCommitmentOutsideCurrentHorizonBehavior,
    "known_commitment_with_zero_cash_inside_this_horizon_not_uncommitted_abstention",
  );
  assert.equal(spec.truthSettlementLinkContract.truthJoinOccursAfterPredictionLock, true);
  assert.equal(spec.truthSettlementLinkContract.predictionAccessAllowed, false);
  assert.ok(
    spec.truthSettlementLinkContract.requiredRegistryFields.includes("cash_type"),
  );
  assert.ok(
    spec.truthSettlementLinkContract.constraints.includes(
      "registry_target_window_cells_exactly_reconcile_to_authority_cash_with_no_extra_nonzero_cells",
    ),
  );
  assert.ok(
    spec.truthSettlementLinkContract.constraints.includes(
      "no_aggregate_offset_between_distinct_events",
    ),
  );
});

test("formal point target excludes every uncommitted or non-cash buyout construct", () => {
  assert.equal(
    spec.formalCashTarget.pointFormula,
    "sales_cash_point_plus_cutoff_confirmed_future_receivables",
  );
  assert.equal(spec.formalCashTarget.mixedRouteOperator, "addition");
  assert.deepEqual(spec.formalCashTarget.excluded, [
    "uncommitted_future_buyout",
    "next_buyout_inferred_from_historical_cycle",
    "future_buyout_probability_times_expected_amount",
    "future_amortization_of_already_received_buyout_cash",
    "buyoutMonthlyEquivalent",
  ]);
  assert.equal(spec.formalCashTarget.uncommittedBuyoutMayBeRepresentedAsZeroPoint, false);
  assert.equal(
    spec.routeOverrides.pure_buyout.default36MonthCycleForecastAllowed,
    false,
  );
  assert.equal(
    spec.routeOverrides.pure_buyout.alreadyReceivedCashAmortizationAllowed,
    false,
  );
  assert.equal(
    spec.routeOverrides.buyout_plus_sales.futureBuyoutOccurrenceModelAllowed,
    false,
  );
});

test("pure-buyout no-commitment route is null and preserves the frozen case universe", () => {
  const route = spec.routeOverrides.pure_buyout.withoutAuditableCutoffCommitment;
  assert.equal(route.futureCashRevenueForecast, null);
  assert.equal(route.rawModelPrediction, null);
  assert.equal(route.modelPredictionAvailable, false);
  assert.equal(route.routeAbstained, true);
  assert.equal(route.servedPrediction, null);
  assert.equal(route.abstentionReason, "uncommitted_future_buyout_not_forecastable");
  assert.equal(spec.caseStateOverride.statisticallyScoreableDefinitionChanged, false);
  assert.equal(spec.caseStateOverride.businessServingEligibilityDefinitionChanged, false);
  assert.equal(spec.caseStateOverride.routeAbstentionMayRemoveCaseFromCaseUniverse, false);
  assert.equal(spec.caseStateOverride.nullRawPredictionMayBeCoercedToZero, false);
});

test("buyout monthly equivalent is explicitly rating-only history", () => {
  assert.deepEqual(
    {
      ratingContextOnly: spec.buyoutMonthlyEquivalentBoundary.ratingContextOnly,
      historicalValueOnly: spec.buyoutMonthlyEquivalentBoundary.historicalValueOnly,
      notCashForecast: spec.buyoutMonthlyEquivalentBoundary.notCashForecast,
      notIncludedInFutureCashRevenue:
        spec.buyoutMonthlyEquivalentBoundary.notIncludedInFutureCashRevenue,
    },
    {
      ratingContextOnly: true,
      historicalValueOnly: true,
      notCashForecast: true,
      notIncludedInFutureCashRevenue: true,
    },
  );
});

test("backtest target is a conserved three-way cash partition", () => {
  assert.equal(
    spec.backtestActualPartition.forecastableCashActual.primaryPointMetricTarget,
    true,
  );
  assert.equal(
    spec.backtestActualPartition.uncommittedBuyoutSurpriseActual
      .includedInPrimaryPointMetric,
    false,
  );
  assert.equal(
    spec.backtestActualPartition.totalLedgerCashActual.mayBeNamedModelWape,
    false,
  );
  assert.equal(spec.backtestActualPartition.postHocCommitmentRestorationAllowed, false);
  assert.equal(
    spec.backtestActualPartition.conservationFormula,
    "forecastableCashActual+uncommittedBuyoutSurpriseActual=totalLedgerCashActual",
  );
});

test("synthetic preflight proves as-of, null, addition, and conservation contracts", () => {
  assert.equal(preflight.status, "passed");
  assert.equal(preflight.privateDataRead, false);
  assert.equal(preflight.databaseRead, false);
  assert.equal(preflight.C2R1TrainingStarted, false);
  assert.ok(Object.values(preflight.checks).every(Boolean));
  assert.equal(preflight.checks.futurePerturbationInvariant, true);
  assert.equal(preflight.checks.pureBuyoutWithoutCommitmentIsNotZero, true);
  assert.equal(preflight.checks.mixedUsesAddition, true);
  assert.equal(preflight.checks.actualPartitionConserves, true);
});

test("synthetic hardening probe rejects route, snapshot, and settlement-link ambiguity", () => {
  assert.equal(hardenedContractProbe.passed, true);
  assert.deepEqual(
    Object.entries(hardenedContractProbe.checks).filter(([, passed]) => !passed),
    [],
  );
});

test("formal public output remains one point with no scenario or interval endpoints", () => {
  assert.deepEqual(spec.publicOutput.allowedFields, [
    "pointForecast",
    "annualBreakdown",
    "confidence",
    "limitation",
  ]);
  assert.equal(spec.publicOutput.predictionIntervalEndpointsAllowed, false);
  assert.equal(spec.publicOutput.scenarioFieldsAllowed, false);
  assert.equal(preflight.checks.publicFieldsExact, true);
  assert.equal(preflight.checks.publicHasNoIntervalOrScenarioEndpoints, true);
});

test("legacy writes, C2-R.1 training, and final holdout remain fail-closed", () => {
  for (const mode of ["--run-legacy-c2r", "--run-c2r1", "--run-final-holdout"]) {
    const result = spawnSync(process.execPath, [python, runner, mode], {
      cwd: root,
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /sealed|not been authorized|stopped/i);
    assert.match(`${result.stdout}\n${result.stderr}`, /dataLoadCalls=0/i);
  }
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.match(
    packageJson.scripts["replay:m2:c2r:development"],
    /run_m2_formal_cash_target_correction\.py --run-legacy-c2r/u,
  );
  assert.ok(Object.values(spec.seals).every((value) => value === false));
});
