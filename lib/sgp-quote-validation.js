/**
 * Validate a sportsbook-issued combined SGP quote, never multiply independent
 * leg prices to simulate a correlated same-game parlay.
 */
export const SGP_TIERS = Object.freeze({
  small: Object.freeze({min: 2000, max: 3000}),
  medium: Object.freeze({min: 3000, max: 8000}),
  nuke: Object.freeze({min: 10000, max: Infinity})
});
const hasText = v => typeof v === 'string' && v.trim().length > 0;
export function validateCombinedSGPQuote(quote, {tier, book, eventId, selectionIds, now = Date.now(), maxAgeMs = 120000} = {}) {
  const band = SGP_TIERS[tier];
  if (!band || !['DraftKings', 'FanDuel'].includes(book) || !hasText(eventId) ||
      !Array.isArray(selectionIds) || selectionIds.length < 2 ||
      !selectionIds.every(hasText) || new Set(selectionIds).size !== selectionIds.length ||
      !quote || quote.book !== book || quote.eventId !== eventId ||
      quote.status !== 'ACCEPTED' || !hasText(quote.quoteId) ||
      !Array.isArray(quote.selectionIds) || quote.selectionIds.length !== selectionIds.length ||
      !quote.selectionIds.every(hasText) ||
      new Set(quote.selectionIds).size !== quote.selectionIds.length ||
      !selectionIds.every(id => quote.selectionIds.includes(id)) ||
      !Number.isInteger(quote.combinedAmericanOdds) ||
      !hasText(quote.issuedAt) || !hasText(quote.sourceUrl)) {
    return {valid:false,reason:'missing_or_mismatched_bookmaker_quote'};
  }
  let url;
  try { url = new URL(quote.sourceUrl); } catch { return {valid:false,reason:'invalid_quote_source'}; }
  const allowedHost = book === 'DraftKings' ? 'draftkings.com' : 'fanduel.com';
  if (url.protocol !== 'https:' || !(url.hostname === allowedHost || url.hostname.endsWith('.' + allowedHost))) {
    return {valid:false,reason:'invalid_quote_source'};
  }
  const age = now - Date.parse(quote.issuedAt);
  if (!Number.isFinite(age) || age < 0 || age > maxAgeMs) return {valid:false,reason:'stale_quote'};
  const odds = quote.combinedAmericanOdds;
  if (odds < band.min || odds > band.max) return {valid:false,reason:'outside_tier'};
  return {valid:true,combinedAmericanOdds:odds,quoteId:quote.quoteId};
}
