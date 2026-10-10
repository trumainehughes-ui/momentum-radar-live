// Convert a SportsGameOdds-style event market into evidence only when
// source timestamp, event identity and bookmaker quote are explicit.
// This adapter never fabricates a missing player ID, team or price.
export function normalizeSgoMarket({ row, eventId, gameId, team, market, book, capturedAt } = {}) {
  if (!row || !eventId || !gameId || !team || !market || !Number.isFinite(capturedAt)) return null;
  if (String(row.eventID) !== String(eventId) || !row.playerID || row.team !== team) return null;
  const q = Array.isArray(row.books) ? row.books.find(x => x.book === book && x.available === true) : null;
  if (!q || !["FanDuel","DraftKings"].includes(book)) return null;
  const line = q.line ?? row.line;
  if (!Number.isFinite(Number(line)) || line === null || line === "") return null;
  if (!Number.isFinite(Number(q.odds)) || Number(q.odds) === 0) return null;
  return {
    gameId:String(gameId), playerId:String(row.playerID), team,
    market, sportsbook:book, line:Number(line), americanOdds:Number(q.odds),
    available:true, source:"SportsGameOdds:"+book, timestamp:capturedAt,
    upstreamEventId:String(eventId), provenance:"upstream_market_snapshot"
  };
}
