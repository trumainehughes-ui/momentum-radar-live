// Shared, fail-closed sportsbook market evidence for NFL, NBA and future sports.
const BOOKS = new Set(['DraftKings', 'FanDuel']);
const ODDS = /^[+-](?:[1-9]\\d*)$/;
const normalize = x => String(x ?? '').trim();
export function validateBookOffer(offer, now = Date.now(), maxAgeMs = 15 * 60_000) {
  if (!offer || !BOOKS.has(offer.book)) return {ok:false, reason:'unsupported_book'};
  if (!normalize(offer.sport) || !normalize(offer.gameId) || !normalize(offer.playerId) || !normalize(offer.market)) return {ok:false,reason:'missing_identity'};
  if (!normalize(offer.line)) return {ok:false,reason:'missing_line'};
  const odds = normalize(offer.americanOdds);
  if (!ODDS.test(odds) || Number(odds) === 0) return {ok:false,reason:'missing_or_invalid_american_odds'};
  const at = Date.parse(offer.checkedAt);
  if (!Number.isFinite(at) || at > now + 60_000 || now - at > maxAgeMs) return {ok:false,reason:'stale_market'};
  if (!/^https:\\/\\//i.test(normalize(offer.sourceUrl))) return {ok:false,reason:'missing_source_url'};
  if (offer.available !== true) return {ok:false,reason:'market_unavailable'};
  return {ok:true,reason:'verified_individual_market'};
}
export function validateSgpQuote(quote, legs, now = Date.now()) {
  if (!Array.isArray(legs) || legs.length < 2) return {ok:false,reason:'insufficient_legs'};
  const book = legs[0]?.book;
  if (!legs.every(leg => leg.book === book && validateBookOffer(leg,now).ok)) return {ok:false,reason:'unverified_or_mixed_book_legs'};
  if (!quote || quote.book !== book || quote.gameId !== legs[0].gameId || !legs.every(leg => leg.gameId === quote.gameId)) return {ok:false,reason:'quote_game_mismatch'};
  const check = validateBookOffer({...quote,sport:legs[0].sport,playerId:'SGP',market:'SGP',line:'combined'},now);
  if (!check.ok) return check;
  if (!Array.isArray(quote.legIds) || quote.legIds.length !== legs.length || !legs.every(leg => quote.legIds.includes(leg.offerId))) return {ok:false,reason:'quote_legs_mismatch'};
  return {ok:true,reason:'verified_combined_sgp_quote'};
}
