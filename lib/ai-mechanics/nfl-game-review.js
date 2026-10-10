// Normalizes read-only game evidence for the AI quality gate.
import { assessNflPropEvidence } from "./nfl-adapter.js";
export function assessNflGameSelections({ game, picks = [], markets = [], now } = {}) {
  if (!game || !Array.isArray(game.playerProjections) || !Array.isArray(picks) || !Array.isArray(markets) || !Number.isFinite(now)) return { ready:false, reviewed:[], reason:"invalid_game_payload" };
  const roster=game.playerProjections.map(p=>({
    id:String(p.playerId||""),
    team:p.team,
    status:p.availability==="ACTIVE_ROTATION"?"active":"unconfirmed",
    starterConfirmed:p.starterStatus==="CONFIRMED_STARTER" && p.verification?.role?.verified===true
  }));
  const reviewed=picks.map(pick=>({
    playerId:pick?.playerId||null,
    ...assessNflPropEvidence({pick,roster,markets,now})
  }));
  return { ready:reviewed.length>0 && reviewed.every(x=>x.verified), reviewed, advisoryOnly:true };
}
