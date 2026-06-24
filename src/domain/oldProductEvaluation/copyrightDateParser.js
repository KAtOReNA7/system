const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
const DAY_MS = 24 * 60 * 60 * 1000;

export function normalizeDateString(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toDateString(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return toDateString(new Date(EXCEL_EPOCH_UTC + Math.round(value) * DAY_MS));
  }
  if (typeof value !== "string") {
    return null;
  }

  const text = value.trim();
  const direct =
    text.match(/(?<year>20\d{2}|19\d{2})[/-](?<month>\d{1,2})[/-](?<day>\d{1,2})/) ??
    text.match(/(?<year>20\d{2}|19\d{2})年(?<month>\d{1,2})月(?<day>\d{1,2})日?/);
  if (!direct?.groups) {
    return null;
  }

  return formatParts(direct.groups.year, direct.groups.month, direct.groups.day);
}

export function parseCopyrightDate(value, options = {}) {
  const text = value == null ? "" : String(value).trim();
  if (value instanceof Date || typeof value === "number") {
    const date = normalizeDateString(value);
    return date
      ? result("exact_date", "parsed", { normalizedDate: date, rawValue: value })
      : result("unparseable", "unparsed", { rawValue: value });
  }

  if (!text) {
    return result("missing", "missing", { rawValue: value });
  }
  if (/无限期|无期限|永久|长期有效/.test(text)) {
    return result("infinite", "parsed", { rawValue: value });
  }
  if (/自动续约|自动延续|顺延/.test(text)) {
    const date = preferAudioDate(text) ?? normalizeDateString(text);
    return result("auto_renewal", date ? "parsed_with_condition" : "manual_review", {
      normalizedDate: date,
      rawValue: value
    });
  }
  if (/授权书|附件|另行约定/.test(text) && !normalizeDateString(text)) {
    return result("external_reference_no_date", "manual_review", { rawValue: value });
  }

  const relative = parseRelativeTerm(text);
  if (relative) {
    return result("relative_term", "relative", { ...relative, rawValue: value });
  }

  const selectedDate = preferAudioDate(text) ?? normalizeDateString(text);
  if (selectedDate) {
    return result("exact_date", "parsed", {
      normalizedDate: selectedDate,
      extractedDates: extractDates(text),
      rawValue: value
    });
  }

  return result("unparseable", "unparsed", { rawValue: value });
}

export function remainingMonthsUntil(endDate, asOf = new Date()) {
  const normalized = normalizeDateString(endDate);
  if (!normalized) {
    return null;
  }
  const end = parseDateString(normalized);
  const current = parseDateString(normalizeDateString(asOf));
  const months = (end.getUTCFullYear() - current.getUTCFullYear()) * 12 + (end.getUTCMonth() - current.getUTCMonth());
  return end.getUTCDate() >= current.getUTCDate() ? months : months - 1;
}

function parseRelativeTerm(text) {
  const lastPublication = text.match(/最后一部出版之日(?:起)?(?<years>\d{1,2})年/);
  if (lastPublication?.groups) {
    return {
      anchor: "last_publication_date",
      years: Number(lastPublication.groups.years),
      endOfYear: /12月31日/.test(text)
    };
  }

  const publication = text.match(/出版之日(?:起)?(?<years>\d{1,2})年/);
  if (publication?.groups) {
    return {
      anchor: "publication_date",
      years: Number(publication.groups.years),
      endOfYear: /12月31日/.test(text)
    };
  }

  return null;
}

function preferAudioDate(text) {
  const audioMatch = text.match(/有声[^0-9]*(?<year>20\d{2}|19\d{2})[/-](?<month>\d{1,2})[/-](?<day>\d{1,2})/);
  if (audioMatch?.groups) {
    return formatParts(audioMatch.groups.year, audioMatch.groups.month, audioMatch.groups.day);
  }
  return null;
}

function extractDates(text) {
  const dates = [];
  const patterns = [
    /(?<year>20\d{2}|19\d{2})[/-](?<month>\d{1,2})[/-](?<day>\d{1,2})/g,
    /(?<year>20\d{2}|19\d{2})年(?<month>\d{1,2})月(?<day>\d{1,2})日?/g
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      if (match.groups) {
        dates.push(formatParts(match.groups.year, match.groups.month, match.groups.day));
      }
    }
  }
  return [...new Set(dates)];
}

function result(expiryType, parserStatus, extra = {}) {
  return {
    expiryType,
    parserStatus,
    normalizedDate: extra.normalizedDate ?? null,
    anchor: extra.anchor ?? null,
    years: extra.years ?? null,
    endOfYear: extra.endOfYear ?? false,
    extractedDates: extra.extractedDates ?? [],
    requiresManualReview: ["relative", "manual_review", "unparsed"].includes(parserStatus),
    rawValue: extra.rawValue ?? null
  };
}

function toDateString(date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function parseDateString(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatParts(year, month, day) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function pad(value) {
  return String(value).padStart(2, "0");
}
