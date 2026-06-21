import { badRequest } from "../errors.js";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export function parsePagination(searchParams) {
  const page = parsePositiveInteger(searchParams.get("page"), "page", DEFAULT_PAGE);
  const pageSize = parsePositiveInteger(
    searchParams.get("pageSize"),
    "pageSize",
    DEFAULT_PAGE_SIZE
  );

  if (pageSize > MAX_PAGE_SIZE) {
    throw badRequest(`pageSize must be less than or equal to ${MAX_PAGE_SIZE}`);
  }

  return { page, pageSize };
}

export function parsePositiveInteger(value, name, defaultValue) {
  if (value === null || value === undefined || value === "") {
    return defaultValue;
  }

  if (!/^[0-9]+$/.test(value)) {
    throw badRequest(`${name} must be a positive integer`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw badRequest(`${name} must be a positive integer`);
  }

  return parsed;
}
