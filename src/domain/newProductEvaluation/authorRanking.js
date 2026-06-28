import { M3_NEW_PRODUCT_COMPARABLE_WORK_FIXTURES } from "./fixtures/newProductComparableWorks.fixture.js";

const MIN_MEASURABLE_AUTHOR_WORKS = 3;

export function buildAuthorRanking(fields, options = {}) {
  const candidates = options.candidates ?? M3_NEW_PRODUCT_COMPARABLE_WORK_FIXTURES;
  const authorWorks = candidates.filter((candidate) => candidate.authorToken === fields.author);
  const measurableWorks = authorWorks
    .map((candidate) => ({
      ...candidate,
      monthlyEquivalent: monthlyEquivalentForAuthor(candidate)
    }))
    .filter((candidate) => isPositiveNumber(candidate.monthlyEquivalent));

  if (measurableWorks.length < MIN_MEASURABLE_AUTHOR_WORKS) {
    return {
      enabled: false,
      disabledReason: "insufficient_measurable_author_works",
      comparableAuthorWorkCount: authorWorks.length,
      measurableWorkCount: measurableWorks.length,
      medianMonthlyEquivalent: null,
      topWorkMonthlyEquivalent: null,
      authorTier: null,
      rankingExplanation: "Author ranking requires at least 3 measurable synthetic author works.",
      limitations: [
        "Synthetic fixture author works only.",
        "No real author detail or private material is read.",
        "Ranking is an explanation input for later M3 stages, not formal execution."
      ],
      nonFormal: true,
      fixtureOnly: true,
      notForFormalDecision: true
    };
  }

  const values = measurableWorks.map((candidate) => candidate.monthlyEquivalent).sort((a, b) => a - b);
  const medianMonthlyEquivalent = median(values);
  const topWorkMonthlyEquivalent = Math.max(...values);
  const authorTier = tierForMedian(medianMonthlyEquivalent);

  return {
    enabled: true,
    disabledReason: null,
    comparableAuthorWorkCount: authorWorks.length,
    measurableWorkCount: measurableWorks.length,
    medianMonthlyEquivalent,
    topWorkMonthlyEquivalent,
    authorTier,
    rankingExplanation: "Synthetic author ranking uses median and top monthly equivalent values from same-author fixture works.",
    limitations: [
      "Pure buyout author works use buyout monthly equivalent only as historical value reference.",
      "Buyout plus sales author works use sales component and report buyout separately in comparable output.",
      "No real author detail, private material or database read is used."
    ],
    nonFormal: true,
    fixtureOnly: true,
    notForFormalDecision: true
  };
}

function monthlyEquivalentForAuthor(candidate) {
  if (candidate.revenueModel === "pure_buyout") {
    return candidate.buyoutMonthlyEquivalent;
  }
  return candidate.salesMonthlyEquivalent;
}

function median(values) {
  const middle = Math.floor(values.length / 2);
  if (values.length % 2 === 1) {
    return round(values[middle]);
  }
  return round((values[middle - 1] + values[middle]) / 2);
}

function tierForMedian(value) {
  if (value >= 9000) return "author_tier_high";
  if (value >= 6000) return "author_tier_mid";
  if (value >= 3000) return "author_tier_watch";
  return "author_tier_limited";
}

function isPositiveNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function round(value) {
  return Math.round(value * 100) / 100;
}
