import { parseCopyrightDate } from "./copyrightDateParser.js";

const EDITION_WEAK_DIFFERENCE = /新版|修订版|珍藏版|套装|全集|增订版|纪念版|典藏版/g;
const AUTHOR_SPLIT = /[、，,;；/／&]|(?:\s+and\s+)|(?:\s+和\s+)|(?:\s+及\s+)/i;

export function normalizeTitle(value) {
  const original = value == null ? "" : String(value);
  const weakDifferenceFlags = [...new Set(original.match(EDITION_WEAK_DIFFERENCE) ?? [])];
  const normalized = toHalfWidth(original)
    .replace(/[《》“”"']/g, "")
    .replace(/[：:]/g, ":")
    .replace(/[（(].*?[）)]/g, "")
    .replace(EDITION_WEAK_DIFFERENCE, "")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();

  return {
    original,
    normalized,
    weakDifferenceFlags
  };
}

export function normalizeAuthor(value) {
  const original = value == null ? "" : String(value);
  const tokens = toHalfWidth(original)
    .replace(/[（）()［］\[\]]/g, " ")
    .split(AUTHOR_SPLIT)
    .map((item) => item.trim())
    .filter(Boolean);
  const normalizedTokens = [...new Set(tokens.map((item) => item.replace(/\s+/g, "").toLowerCase()))];

  return {
    original,
    normalized: normalizedTokens.join("|"),
    normalizedTokens,
    multiAuthor: normalizedTokens.length > 1
  };
}

export function parseAudioRights(row = {}) {
  const useRight = truthyRight(row["有声使用权"]);
  const adaptationRight = truthyRight(row["有声改编权"]);
  const sublicenseRight = truthyRight(row["有声转授权"]);
  const description = stringify(row["有声权利描述"]);
  const joined = [
    row["有声使用权"],
    row["有声改编权"],
    row["有声转授权"],
    row["有声权利描述"],
    row["广播剧"],
    row["课程"]
  ]
    .map(stringify)
    .join(" ");

  const hasAudioKeyword = /有声|听书|音频|广播剧|课程|朗读|转授权|改编/.test(joined);
  const denied = /无|否|不含|未授权|没有/.test(joined);
  const exclusive = /独家|排他/.test(joined) || truthyRight(row["独家"]) === true;
  const buyout = /买断|一次性/.test(joined);

  const explicitGrant = useRight === true || adaptationRight === true || sublicenseRight === true;
  const explicitDeny = useRight === false || adaptationRight === false || sublicenseRight === false;

  let audioRightsStatus = "unknown";
  if (explicitGrant || (hasAudioKeyword && !denied)) {
    audioRightsStatus = "granted";
  } else if (explicitDeny || (denied && !hasAudioKeyword)) {
    audioRightsStatus = "not_granted";
  } else if (denied) {
    audioRightsStatus = "limited_or_conflict";
  }

  return {
    audioRightsStatus,
    useRight,
    adaptationRight,
    sublicenseRight,
    exclusive,
    buyout,
    description,
    requiresManualReview: audioRightsStatus === "limited_or_conflict" || audioRightsStatus === "unknown" || (explicitGrant && explicitDeny)
  };
}

export function parseCategoryCandidates(row = {}) {
  const productLine = stringify(row["产品线"]);
  const cip = stringify(row["CIP"]);
  const publisher = stringify(row["出版社"]);
  const isForeign = /是|外版|引进|翻译/.test(stringify(row["是否外版"]) + " " + stringify(row["外文、少数民族、繁体"]));

  const candidates = [];
  if (productLine) {
    candidates.push({
      sourceField: "产品线",
      level1: "出版物",
      level2: productLine,
      level3: null,
      confidence: "medium",
      reason: "产品线只能作为分类候选，不能直接成为权威三级分类"
    });
  }
  if (cip) {
    candidates.push({
      sourceField: "CIP",
      level1: "出版物",
      level2: null,
      level3: null,
      confidence: "low",
      reason: "CIP 文本可辅助粗分类，需要人工确认"
    });
  }

  return {
    productLine,
    cipPresent: Boolean(cip),
    publisherPresent: Boolean(publisher),
    isForeign,
    candidates,
    classificationConfidence: candidates.some((item) => item.confidence === "medium") ? "medium" : candidates.length ? "low" : "missing"
  };
}

export function parseLedgerRow(row = {}, rowNumber = null) {
  const publicationTitle = normalizeTitle(row["出版书名"]);
  const contractTitle = normalizeTitle(row["合同书名"]);
  const displayAuthor = normalizeAuthor(row["作者署名"]);
  const originalAuthor = normalizeAuthor(row["作者原名"]);
  const signedDate = parseCopyrightDate(row["签订日期"]);
  const expiryDate = parseCopyrightDate(row["到期时间"]);
  const preRenewalExpiryDate = parseCopyrightDate(row["续约前到期日期"]);
  const audioRights = parseAudioRights(row);
  const category = parseCategoryCandidates(row);

  return {
    ledgerRowId: rowNumber == null ? null : `ledger-row-${String(rowNumber).padStart(6, "0")}`,
    workId: stringify(row["作品ID"]),
    publicationTitle,
    contractTitle,
    authors: {
      display: displayAuthor,
      original: originalAuthor
    },
    publisher: stringify(row["出版社"]),
    isbn: stringify(row["书号"]),
    cip: stringify(row["CIP"]),
    contractNo: stringify(row["合同编号"]),
    finalContractCode: stringify(row["合同最终码"]),
    signedDate,
    expiryDate,
    preRenewalExpiryDate,
    firstReleaseDate: parseCopyrightDate(row["首发时间"]),
    cipPublicationDate: parseCopyrightDate(row["CIP出版时间"]),
    audioRights,
    category,
    raw: row
  };
}

function truthyRight(value) {
  const text = stringify(value);
  if (!text) {
    return null;
  }
  if (/^(是|有|Y|YES|TRUE|1)$/i.test(text) || /授权|可|拥有|包含|有声/.test(text)) {
    return true;
  }
  if (/^(否|无|N|NO|FALSE|0)$/i.test(text) || /不含|未授权|没有/.test(text)) {
    return false;
  }
  return null;
}

function stringify(value) {
  return value == null ? "" : String(value).trim();
}

function toHalfWidth(value) {
  return String(value).replace(/[\uFF01-\uFF5E]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0)).replace(/\u3000/g, " ");
}
