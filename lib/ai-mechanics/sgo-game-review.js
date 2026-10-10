// Read-only bridge from normalized SportsGameOdds snapshots to game-scoped review.
// The caller must provide an explicit ESPN-game-to-SGO-event mapping.
import { normalizeSgoMarket } from "./sgo-adapter.js";
import { nflSgoCategory } from "./sgo-categories.js";
import { reviewGameScopedPicks } from "./game-scope.js";
export function reviewSgoGameSnapshot({game, event, eventMapping, picks=[], capturedAt, now}={}) {
  const gameId=String(game?.gameId||"");
  const eventId=String(event?.eventID||"");
  if (!gameId || !eventId || !eventMapping || String(eventMapping.gameId)!==gameId || String(eventMapping.eventId)!==eventId || !Array.isArray(event.markets) || !Number.isFinite(capturedAt) || !Number.isFinite(now))
    return {ready:false,reviewed:[],reason:"unverified_event_mapping_or_snapshot",advisoryOnly:true};
  const markets=[];
  for (const p of picks) {
    const rows=event.markets.filter(r=>r && String(r.playerID)===String(p?.playerId) && r.team===p.team && nflSgoCategory(r)===p.market);
    for (const row of rows) {
      const normalized=normalizeSgoMarket({row,eventId,gameId,team:p.team,market:p.market,book:p.sportsbook,capturedAt});
      if (normalized) markets.push(normalized);
    }
  }
  return reviewGameScopedPicks({game,picks,markets,now});
}
