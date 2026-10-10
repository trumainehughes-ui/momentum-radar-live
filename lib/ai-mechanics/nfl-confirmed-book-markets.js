// Strict NFL player-prop publishing boundary (advisory only).
// Even a correctly crosswalked ESPN <-> SGO book line is not a candidate
// for a starter-dependent sportsbook pick without CURRENT source-qualified
// player-role and availability evidence. Models may rank others separately.
import { currentBookOffer } from "./book-quote-freshness.js";

export function selectConfirmedNflBookMarkets({
  marketRows = [], rolePlayers = [], now = Date.now()
} = {}) {
  if (!Array.isArray(marketRows) || !Array.isArray(rolePlayers) ||
      !Number.isFinite(now)) return [];
  const players = new Map();
  const ambiguous = new Set();
  for (const p of rolePlayers) {
    if (!p || !p.playerId || !p.team) continue;
    const id=String(p.playerId);
    if (players.has(id)) ambiguous.add(id);
    else players.set(id,p);
  }
  return marketRows.filter(m=>{
    const id=String(m?.playerID||"");
    if (!id || ambiguous.has(id) ||
        m?.source!=="SportsGameOdds" ||
        m?.provenance!=="verified_espn_sgo_crosswalk" ||
        !m?.sourceEventID || !m?.eventID) return false;
    const p=players.get(id);
    if (!p || p.team!==m.team || p.name!==m.name ||
        p.availability!=="ACTIVE_ROTATION" ||
        p.starterVerified!==true ||
        p.recommendationEligible!==true ||
        p.starterStatus!=="CONFIRMED_STARTER" ||
        p.verification?.role?.verified!==true ||
        !["STRUCTURED","REPORTED_CURRENT_GAME"].includes(
          p.verification.role.kind)) return false;
    const checked=Date.parse(String(p.verification.role.checkedAt||""));
    if (!Number.isFinite(checked) || checked>now ||
        now-checked>48*60*60*1000) return false;
    // A market row is useful only while its original bookmaker price is fresh.
    return Boolean(currentBookOffer(m,"DraftKings",now) ||
      currentBookOffer(m,"FanDuel",now));
  });
}
