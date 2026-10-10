// Advisory-only parlay checks: a real book quote must match the legs and be fresh.
// A target payout or a model estimate is never proof a same-game parlay can be placed.
import { validateCandidate } from "./guardrails.js";
import { verifyPlayerMarket, verifyCombinedQuote } from "./evidence.js";
import { reviewLegRelationships } from "./matchups.js";

export function reviewParlay({
  legs, tier, combinedAmericanOdds, priceSource, sportsbook, quote, now, context = {}
} = {}) {
  if (!Array.isArray(legs) || legs.length === 0)
    return { valid: false, reasons: ["missing_legs"], advisoryOnly: true };

  const reasons = [];
  const validBook = ["DraftKings", "FanDuel"].includes(sportsbook);
  if (!validBook || priceSource !== "verified_book_quote")
    reasons.push("verified_combined_price_required");

  const checkedQuote = verifyCombinedQuote({ quote, sportsbook, now });
  reasons.push(...checkedQuote.reasons.map(reason => "combined_quote:" + reason));
  if (!Number.isFinite(combinedAmericanOdds) || combinedAmericanOdds <= 0)
    reasons.push("invalid_combined_price");
  if (quote?.americanOdds !== combinedAmericanOdds)
    reasons.push("combined_price_mismatch");

  const activePlayers = Array.isArray(context?.activePlayers) ? context.activePlayers : [];
  const markets = Array.isArray(context?.markets) ? context.markets : [];
  const gameIds = legs.map(leg => String(leg?.gameId || ""));
  if (gameIds.some(id => !id)) reasons.push("missing_leg_game_identity");
  if (new Set(gameIds).size > 1) reasons.push("different_games_in_sgp");
  if (context?.gameId && gameIds.some(id => id !== String(context.gameId)))
    reasons.push("leg_game_context_mismatch");

  legs.forEach((leg, index) => {
    const prefix = "leg_" + (index + 1) + ":";
    if (!leg || leg.sportsbook !== sportsbook)
      reasons.push(prefix + "sportsbook_mismatch");

    const candidate = validateCandidate(leg, { ...context, activePlayers, markets });
    reasons.push(...candidate.reasons.map(reason => prefix + reason));

    // A market offered at the other sportsbook does NOT validate this leg.
    const player = activePlayers.find(p =>
      p && String(p.id) === String(leg?.playerId) && p.team === leg?.team);
    const market = markets.find(m =>
      m && String(m.playerId) === String(leg?.playerId) &&
      m.team === leg?.team && m.market === leg?.market &&
      m.line === leg?.line && m.sportsbook === sportsbook);
    const evidence = verifyPlayerMarket({ player, market, now });
    reasons.push(...evidence.reasons.map(reason => prefix + reason));
  });

  const relationships = reviewLegRelationships(legs);
  reasons.push(...relationships.reasons);

  const floor = tier === "small" ? 1900 : tier === "medium" ? 2900 : tier === "nuke" ? 10000 : null;
  if (floor === null) reasons.push("unknown_tier");
  else if (!Number.isFinite(combinedAmericanOdds) || combinedAmericanOdds < floor)
    reasons.push("tier_payout_below_target");

  return { valid: reasons.length === 0, reasons: [...new Set(reasons)], advisoryOnly: true };
}
