// Source checks for downstream advisory analysis. Does not fetch or modify data.
export function verifyPlayerMarket({ player, market, now, maxAgeMs = 15 * 60 * 1000 } = {}) {
  const reasons = [];
  if (!player || !market || !player.id || !player.team || market.playerId !== player.id || market.team !== player.team)
    reasons.push("player_team_market_mismatch");
  if (!player || player.status !== "active" || player.starterConfirmed !== true)
    reasons.push("starter_or_active_status_unconfirmed");
  if (!market || !["DraftKings","FanDuel"].includes(market.sportsbook) || market.available !== true)
    reasons.push("market_not_available_at_supported_book");
  if (!market || !Number.isFinite(market.line) || !market.market)
    reasons.push("invalid_market_line");
  if (!market || !market.source || !Number.isFinite(market.timestamp) || !Number.isFinite(now) || !Number.isFinite(maxAgeMs) || maxAgeMs < 0 || market.timestamp > now || now - market.timestamp > maxAgeMs)
    reasons.push("stale_or_unattributed_market");
  return { verified: reasons.length === 0, reasons };
}
export function verifyCombinedQuote({ quote, sportsbook, now, maxAgeMs = 5 * 60 * 1000 } = {}) {
  const reasons=[];
  if (!quote || quote.sportsbook !== sportsbook || !["DraftKings","FanDuel"].includes(sportsbook) || quote.source !== "verified_book_quote") reasons.push("quote_provenance_missing");
  if (!quote || !Number.isFinite(quote.americanOdds) || quote.americanOdds === 0) reasons.push("invalid_combined_price");
  if (!quote || !Number.isFinite(quote.timestamp) || !Number.isFinite(now) || quote.timestamp > now || now-quote.timestamp > maxAgeMs) reasons.push("stale_combined_price");
  return { verified: reasons.length === 0, reasons };
}
