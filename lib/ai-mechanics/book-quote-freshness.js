// Source-specific bookmaker quote age gate.
// A cached response cannot refresh the original sportsbook price timestamp.
export const MAX_BOOK_QUOTE_AGE_MS = 15 * 60 * 1000;
export const PRIMARY_NFL_BOOKS = Object.freeze(["DraftKings", "FanDuel"]);

export function parseQuoteTime(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const at = Date.parse(value);
  return Number.isFinite(at) ? at : null;
}

export function validAmericanOdds(value) {
  if (value === null || value === undefined || value === "" ||
      typeof value === "boolean") return false;
  const n = Number(value);
  return Number.isFinite(n) && Number.isInteger(n) && (n <= -100 || n >= 100);
}

export function isCurrentBookOffer(offer, { now = Date.now(), maxAgeMs = MAX_BOOK_QUOTE_AGE_MS } = {}) {
  if (!offer || offer.available !== true ||
      !PRIMARY_NFL_BOOKS.includes(offer.book) ||
      !validAmericanOdds(offer.odds)) return false;
  const at = parseQuoteTime(offer.lastUpdatedAt);
  return at !== null && Number.isFinite(now) && at <= now &&
    now - at <= maxAgeMs;
}

export function currentBookOffer(market, sportsbook, now = Date.now()) {
  if (!market || !Array.isArray(market.books)) return null;
  return market.books.find(b => b?.book === sportsbook && isCurrentBookOffer(b, { now })) || null;
}
