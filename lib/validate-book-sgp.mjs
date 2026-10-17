// Strict, deterministic validation for book-specific SGP candidates.
// AI may rank verified offers, but cannot supply offer truth.
export function validateBookSgp(sgp, book, offers, now = Date.now(), maxAgeMs = 30 * 60_000) {
  const reasons = [];
  const legs = Array.isArray(sgp?.legs) ? sgp.legs : [];
  if (!['FanDuel', 'DraftKings'].includes(book)) reasons.push('UNSUPPORTED_BOOK');
  if (legs.length < 2) reasons.push('INSUFFICIENT_SGP_LEGS');
  if (legs.some(leg => !leg || typeof leg !== 'object')) reasons.push('INVALID_LEG_RECORD');
  if (!Array.isArray(offers)) reasons.push('NO_VERIFIED_OFFER_LADDER');
  const validated = legs.map((leg, index) => {
    const market = String(leg?.market ?? leg?.cat ?? '');
    const playerId = String(leg?.playerId ?? '');
    const gameId = String(leg?.gameId ?? '');
    const rawLine = leg?.threshold;
    const line = Number(rawLine);
    const validLine = rawLine !== null && rawLine !== undefined && rawLine !== '' &&
      Number.isFinite(line) && line >= 0;
    const matches = validLine && playerId && gameId && Array.isArray(offers)
      ? offers.filter(o => o?.verified === true && o.book === book &&
        String(o.playerId) === playerId && String(o.gameId) === gameId &&
        String(o.market) === market && Number(o.line) === line &&
        o.priceAmerican !== null && o.priceAmerican !== undefined && String(o.priceAmerican).trim() !== '' && Number.isFinite(Number(o.priceAmerican)) && Number(o.priceAmerican) !== 0 &&
        Number.isFinite(Date.parse(o.observedAt)) &&
        Date.parse(o.observedAt) <= now &&
        now - Date.parse(o.observedAt) <= maxAgeMs)
      : [];
    const reason = !playerId || !gameId ? 'MISSING_PLAYER_OR_GAME_ID' :
      !validLine ? 'INVALID_LINE' : matches.length === 0 ? 'EXACT_OFFER_NOT_VERIFIED' : null;
    if (reason) reasons.push('LEG_' + (index + 1) + '_' + reason);
    return { index, valid: !reason, reason, offer: matches[0] ?? null };
  });
  // All legs must belong to one game; an SGP cannot mix matchups.
  const gameIds = new Set(legs.map(leg => String(leg?.gameId ?? '')).filter(Boolean));
  if (gameIds.size > 1) reasons.push('MULTIPLE_GAMES_IN_SGP');
  const quote = sgp?.combinedQuote;
  const quoteVerified = quote?.verified === true && quote?.book === book &&
    quote.priceAmerican !== null && quote.priceAmerican !== undefined && String(quote.priceAmerican).trim() !== '' && Number.isFinite(Number(quote.priceAmerican)) && Number(quote.priceAmerican) !== 0 &&
    Number.isFinite(Date.parse(quote.observedAt)) &&
    Date.parse(quote.observedAt) <= now &&
    now - Date.parse(quote.observedAt) <= maxAgeMs &&
    quote?.allLegsAccepted === true;
  if (!quoteVerified) reasons.push('COMBINED_BOOK_QUOTE_NOT_VERIFIED');
  // A verified price for another selection set is not this parlay's price.
  const offerIds = validated.map(v => String(v.offer?.offerId ?? ''));
  const quotedIds = Array.isArray(quote?.legIds) ? quote.legIds.map(String) : [];
  const exactSelectionSet = offerIds.every(Boolean) &&
    new Set(offerIds).size === offerIds.length &&
    quotedIds.length === offerIds.length &&
    new Set(quotedIds).size === quotedIds.length &&
    offerIds.every(id => quotedIds.includes(id));
  if (!exactSelectionSet) reasons.push('COMBINED_QUOTE_SELECTIONS_MISMATCH');
  return { publishable: reasons.length === 0, book, verifiedLegCount: validated.filter(v => v.valid).length,
    totalLegCount: legs.length, legs: validated, reasons };
}
