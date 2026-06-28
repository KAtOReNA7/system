import { usableHeatSignals } from "./materialFieldExtractor.js";
import {
  buildForecastWeighting,
  scaleForecastContributions
} from "./forecastWeighting.js";

const YEAR_FACTORS = Object.freeze([1, 0.92, 0.84, 0.78, 0.72]);

export function buildChannelForecast(fields, readiness, context = {}) {
  if (readiness && readiness.numericForecastAllowed === false) {
    return {
      forecastStatus: "blocked",
      forecastShape: "point_estimate_only",
      pointEstimateOnly: true,
      forecastContributions: [],
      limitations: [
        "Numeric forecast is blocked by readiness hard blockers.",
        "No forecast range is emitted.",
        "No direct development recommendation is emitted.",
        "No resource investment level is emitted."
      ],
      confidenceNotes: [],
      nonFormal: true,
      fixtureOnly: true,
      notForFormalDecision: true,
      blockedBy: readiness.hardBlockerCodes ?? []
    };
  }

  const channels = normalizeChannels(fields.targetChannels);
  const heatScore = scoreHeat(fields);
  const adaptationLift = Array.isArray(fields.adaptationSignals)
    ? Math.min(0.3, fields.adaptationSignals.length * 0.08)
    : 0;
  const sourceFactor = fields.source === "publication" ? 1.05 : 1;
  const volumeFactor = volumeScore(fields);
  const unweightedFirstYear = Math.max(3000, Math.round((heatScore + volumeFactor) * sourceFactor * (1 + adaptationLift)));
  const weighting = buildForecastWeighting(
    fields,
    readiness,
    context.comparableWorks,
    context.authorRanking,
    {
      referenceAmount: unweightedFirstYear,
      externalEvidence: context.externalEvidence,
      evidenceSummary: context.evidenceSummary
    }
  );
  const weightedFirstYear = Math.max(0, Math.round(unweightedFirstYear * weighting.forecastMultiplier));
  const totalWeight = channels.reduce((total, channel) => total + channel.weight, 0);

  const rawChannelForecasts = channels.map((channel) => {
    const firstYearForecast = round(weightedFirstYear * (channel.weight / totalWeight) * channel.channelFit);
    const year1To5Breakdown = YEAR_FACTORS.map((factor, index) => ({
      year: index + 1,
      forecast: round(firstYearForecast * factor)
    }));
    const fiveYearTotal = round(sum(year1To5Breakdown.map((row) => row.forecast)));
    return {
      channelId: channel.channelId,
      channelName: channel.channelName,
      firstYearForecast,
      year1To5Breakdown,
      fiveYearTotal,
      confidence: channel.confidence ?? "usable",
      limitations: channel.limitations ?? ["fixture-only point estimate; not a formal forecast"]
    };
  });
  const totalForecast = aggregateChannelForecasts(rawChannelForecasts);
  const channelForecasts = rawChannelForecasts.map((channel) => ({
    ...channel,
    channelContributionBreakdown: scaleForecastContributions(
      weighting.forecastContributions,
      totalForecast.firstYearForecast > 0 ? channel.firstYearForecast / totalForecast.firstYearForecast : 0
    )
  }));

  return {
    forecastStatus: "generated",
    forecastShape: "point_estimate_only",
    pointEstimateOnly: true,
    channelForecasts,
    totalForecast,
    forecastWeighting: {
      weightingVersion: weighting.weightingVersion,
      forecastMultiplier: weighting.forecastMultiplier,
      appliedSignalCodes: weighting.forecastContributions.map((item) => item.signalCode),
      nonFormal: true,
      fixtureOnly: true,
      notForFormalDecision: true
    },
    forecastContributions: weighting.forecastContributions,
    confidence: summarizeForecastConfidence(fields, channelForecasts),
    limitations: unique([
      "Synthetic fixture forecast only.",
      "No forecast range is emitted.",
      "No direct development recommendation is emitted.",
      "No resource investment level is emitted.",
      ...weighting.limitations
    ]),
    confidenceNotes: weighting.confidenceNotes,
    nonFormal: true,
    fixtureOnly: true,
    notForFormalDecision: true
  };
}

export function aggregateChannelForecasts(channelForecasts) {
  const year1To5Breakdown = YEAR_FACTORS.map((_, index) => ({
    year: index + 1,
    forecast: round(sum(channelForecasts.map((channel) => channel.year1To5Breakdown[index]?.forecast ?? 0)))
  }));
  return {
    firstYearForecast: round(sum(channelForecasts.map((channel) => channel.firstYearForecast))),
    year1To5Breakdown,
    fiveYearTotal: round(sum(channelForecasts.map((channel) => channel.fiveYearTotal)))
  };
}

function normalizeChannels(value) {
  const values = Array.isArray(value) ? value : [];
  return values.map((channel, index) => {
    if (typeof channel === "string") {
      return {
        channelId: `SYN-M3-CHANNEL-${String(index + 1).padStart(2, "0")}`,
        channelName: channel,
        weight: 1,
        channelFit: 1,
        confidence: "usable"
      };
    }
    return {
      channelId: channel.channelId ?? `SYN-M3-CHANNEL-${String(index + 1).padStart(2, "0")}`,
      channelName: channel.channelName ?? channel.channelId ?? `Synthetic channel ${index + 1}`,
      weight: positiveNumber(channel.weight, 1),
      channelFit: positiveNumber(channel.channelFit, 1),
      confidence: channel.confidence ?? "usable",
      limitations: channel.limitations
    };
  });
}

function scoreHeat(fields) {
  const signals = usableHeatSignals(fields);
  if (signals.length === 0) return 0;
  const numeric = {
    reads: Math.min(80000, fields.reads ?? 0) * 0.08,
    collections: Math.min(15000, fields.collections ?? 0) * 0.5,
    ratingScore: Math.max(0, (fields.ratingScore ?? 0) - 6) * 1800,
    commentCount: Math.min(5000, fields.commentCount ?? 0) * 0.35
  };
  const externalSignalBonus = signals.filter((signal) =>
    ["rankings", "searchHeat", "socialHeat", "platformHeat", "externalHeat"].includes(signal.key)
  ).length * 1800;
  return Math.round(sum(Object.values(numeric)) + externalSignalBonus);
}

function volumeScore(fields) {
  if (typeof fields.audioVolumeEstimate === "number") {
    return Math.min(12000, fields.audioVolumeEstimate * 80);
  }
  if (typeof fields.wordCount === "number") {
    return Math.min(12000, fields.wordCount / 100);
  }
  return 3500;
}

function summarizeForecastConfidence(fields, channelForecasts) {
  if (channelForecasts.some((channel) => channel.confidence === "limited")) {
    return "limited";
  }
  if (usableHeatSignals(fields).length >= 3) {
    return "strong";
  }
  return "usable";
}

function positiveNumber(value, fallback) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : fallback;
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function unique(values) {
  return [...new Set(values)];
}

function round(value) {
  return Math.round(value * 100) / 100;
}
