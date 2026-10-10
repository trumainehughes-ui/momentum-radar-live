// Game-scoped evidence checks; fail closed when upstream omits identifiers.
import { assessNflGameSelections } from "./nfl-game-review.js";
export function reviewGameScopedPicks({ game, picks=[], markets=[], now }={}) {
  if (!game || !game.gameId || !Array.isArray(game.teams) || game.teams.length!==2 || !Number.isFinite(now))
    return {ready:false,reason:"missing_game_identity",reviewed:[],advisoryOnly:true};
  const teamSet=new Set(game.teams.map(t=>t.abbr));
  const scoped=picks.map(p=>{
    const reasons=[];
    if (!p || String(p.gameId)!==String(game.gameId)) reasons.push("pick_game_mismatch");
    if (!p || !teamSet.has(p.team)) reasons.push("pick_team_not_in_game");
    return reasons;
  });
  const eligibleMarkets=markets.filter(m=>m && String(m.gameId)===String(game.gameId) && teamSet.has(m.team));
  const result=assessNflGameSelections({game,picks,markets:eligibleMarkets,now});
  const reviewed=result.reviewed.map((r,i)=>({...r,verified:r.verified&&scoped[i].length===0,reasons:[...r.reasons,...scoped[i]]}));
  return {ready:reviewed.length>0&&reviewed.every(r=>r.verified),reviewed,advisoryOnly:true};
}
