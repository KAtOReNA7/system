const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function forecastM2CurrentManualChannelRule(input, policy) {
  const origin = requireMonth(input?.origin, "manual_channel_origin");
  const horizonMonths = positiveInteger(
    input?.horizonMonths,
    "manual_channel_horizon"
  );
  const requiredHorizon = positiveInteger(
    policy?.horizonMonths,
    "manual_channel_policy_horizon"
  );
  if (horizonMonths !== requiredHorizon) {
    throw new Error("m2_current_manual_channel_horizon_mismatch");
  }
  const recentMonths = positiveInteger(
    policy?.recentMonths,
    "manual_channel_recent_months"
  );
  const mainChannelMaximum = positiveInteger(
    policy?.mainChannelMaximum,
    "manual_channel_main_maximum"
  );
  const latestToAverageFloor = fraction(
    policy?.latestToAverageFloor,
    "manual_channel_latest_floor"
  );
  const edgeHistoricalShare = fraction(
    policy?.edgeHistoricalShare,
    "manual_channel_edge_share"
  );
  const annualLevelMultiplier = fractionInclusiveZero(
    policy?.annualLevelMultiplier,
    "manual_channel_annual_multiplier"
  );
  const rightsStartMonth = requireMonth(
    input?.rightsStartMonth,
    "manual_channel_rights_start"
  );
  if (rightsStartMonth > origin) {
    throw new Error("m2_current_manual_channel_rights_start_after_origin");
  }
  if (!Array.isArray(input?.channels) || input.channels.length === 0) {
    throw new Error("m2_current_manual_channel_history_required");
  }

  const channels = input.channels.map((channel) => normalizeChannel(
    channel,
    origin,
    recentMonths,
    rightsStartMonth
  )).sort((left, right) => (
    right.trailingAnnual - left.trailingAnnual
    || left.channelId.localeCompare(right.channelId)
  ));
  if (new Set(channels.map((channel) => channel.channelId)).size
    !== channels.length) {
    throw new Error("m2_current_manual_channel_duplicate_channel");
  }

  const mainChannelIds = new Set(
    channels.slice(0, mainChannelMaximum).map((channel) => channel.channelId)
  );
  const ageMonths = monthDistance(rightsStartMonth, origin) + 1;
  const lifecycleContributionShare = lifecycleShare(
    ageMonths,
    policy?.lifecycleContribution
  );
  let mainForecast = 0;
  let edgeForecast = 0;
  let stableMainChannelCount = 0;
  let decliningMainChannelCount = 0;
  const components = [];
  for (const channel of channels) {
    const main = mainChannelIds.has(channel.channelId);
    let pointEstimate;
    let branch;
    if (main) {
      const monthlyAverage = channel.trailingAnnual / recentMonths;
      if (channel.trailingAnnual <= 0) {
        pointEstimate = 0;
        branch = "main_no_positive_trailing_revenue";
      } else if (
        channel.latestMonth >= latestToAverageFloor * monthlyAverage
      ) {
        pointEstimate = (
          annualLevelMultiplier
          * channel.trailingAnnual
          / lifecycleContributionShare
        );
        stableMainChannelCount += 1;
        branch = "main_stable_trailing_annual";
      } else {
        pointEstimate = (
          annualLevelMultiplier
          * Math.max(0, channel.latestMonth)
          * recentMonths
          / lifecycleContributionShare
        );
        decliningMainChannelCount += 1;
        branch = "main_declining_latest_month_annualized";
      }
      mainForecast += pointEstimate;
    } else {
      pointEstimate = (
        edgeHistoricalShare * Math.max(0, channel.rightsTermNetRevenue)
      );
      edgeForecast += pointEstimate;
      branch = "edge_rights_term_half";
    }
    components.push({
      channelId: channel.channelId,
      role: main ? "main" : "edge",
      branch,
      trailingAnnual: channel.trailingAnnual,
      latestMonth: channel.latestMonth,
      rightsTermNetRevenue: channel.rightsTermNetRevenue,
      pointEstimate
    });
  }

  const trailingAnnual = channels.reduce(
    (sum, channel) => sum + channel.trailingAnnual,
    0
  );
  const positiveTrailing = channels
    .map((channel) => Math.max(0, channel.trailingAnnual))
    .sort((left, right) => right - left);
  const positiveTrailingTotal = positiveTrailing.reduce(
    (sum, value) => sum + value,
    0
  );
  const concentration = (count) => (
    positiveTrailingTotal > 0
      ? positiveTrailing.slice(0, count).reduce(
        (sum, value) => sum + value,
        0
      ) / positiveTrailingTotal
      : 0
  );

  return {
    pointEstimate: Math.max(0, mainForecast + edgeForecast),
    mainForecast,
    edgeForecast,
    trailingAnnual,
    mainChannelCount: mainChannelIds.size,
    edgeChannelCount: channels.length - mainChannelIds.size,
    stableMainChannelCount,
    decliningMainChannelCount,
    top1TrailingRevenueShare: concentration(1),
    top2TrailingRevenueShare: concentration(2),
    lifecycleAgeMonths: ageMonths,
    lifecycleContributionShare,
    components
  };
}

function normalizeChannel(channel, origin, recentMonths, rightsStartMonth) {
  const channelId = requireString(
    channel?.channelId,
    "manual_channel_id"
  );
  if (
    !Array.isArray(channel?.months)
    || !Array.isArray(channel?.values)
    || channel.months.length === 0
    || channel.months.length !== channel.values.length
  ) {
    throw new Error("m2_current_manual_channel_series_invalid");
  }
  const pairs = channel.months.map((month, index) => ({
    month: requireMonth(month, "manual_channel_history_month"),
    value: finite(channel.values[index], "manual_channel_history_value")
  })).sort((left, right) => left.month.localeCompare(right.month));
  if (
    new Set(pairs.map((pair) => pair.month)).size !== pairs.length
    || pairs.some((pair) => pair.month > origin)
  ) {
    throw new Error("m2_current_manual_channel_history_boundary_invalid");
  }
  const recent = pairs.slice(-recentMonths);
  const trailingAnnual = recent.reduce(
    (sum, pair) => sum + pair.value,
    0
  );
  const rightsTermNetRevenue = pairs
    .filter((pair) => pair.month >= rightsStartMonth)
    .reduce((sum, pair) => sum + pair.value, 0);
  return {
    channelId,
    trailingAnnual,
    latestMonth: pairs.at(-1).value,
    rightsTermNetRevenue
  };
}

function lifecycleShare(ageMonths, policy) {
  const year3Month = positiveInteger(
    policy?.year3Month,
    "manual_channel_year3_month"
  );
  const year5Month = positiveInteger(
    policy?.year5Month,
    "manual_channel_year5_month"
  );
  if (year5Month <= year3Month) {
    throw new Error("m2_current_manual_channel_lifecycle_months_invalid");
  }
  const year3Share = fraction(
    policy?.year3Share,
    "manual_channel_year3_share"
  );
  const year5Share = fraction(
    policy?.year5Share,
    "manual_channel_year5_share"
  );
  if (year5Share > year3Share) {
    throw new Error("m2_current_manual_channel_lifecycle_share_invalid");
  }
  if (ageMonths <= year3Month) {
    return year3Share;
  }
  if (ageMonths >= year5Month) {
    return year5Share;
  }
  const progress = (ageMonths - year3Month) / (year5Month - year3Month);
  return year3Share + progress * (year5Share - year3Share);
}

function monthDistance(from, to) {
  const [fromYear, fromMonth] = from.split("-").map(Number);
  const [toYear, toMonth] = to.split("-").map(Number);
  return (toYear - fromYear) * 12 + toMonth - fromMonth;
}

function positiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`m2_current_${name}_invalid`);
  }
  return number;
}

function fraction(value, name) {
  const number = finite(value, name);
  if (number <= 0 || number > 1) {
    throw new Error(`m2_current_${name}_invalid`);
  }
  return number;
}

function fractionInclusiveZero(value, name) {
  const number = finite(value, name);
  if (number < 0 || number > 1) {
    throw new Error(`m2_current_${name}_invalid`);
  }
  return number;
}

function finite(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`m2_current_${name}_invalid`);
  }
  return number;
}

function requireMonth(value, name) {
  const result = requireString(value, name);
  if (!MONTH_PATTERN.test(result)) {
    throw new Error(`m2_current_${name}_invalid`);
  }
  return result;
}

function requireString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`m2_current_${name}_invalid`);
  }
  return value.trim();
}
