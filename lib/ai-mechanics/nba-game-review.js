// NBA market-review counterpart to NFL game-scoped verification.
// Runs only on server-normalized provider evidence, never submits a bet.
// NFL and NBA reuse the SAME book quote freshness, market status, cache
// expiry, and estimated-vs-actual-SGP boundaries.
import { leaguePolicy, supportedLeagueMarket } from "./league-parity.js";
import { currentBookOffer } from "./book-quote-freshness.js";
import { summarizeMarketEvidence } from "./market-health.js";
import { marketCachePolicy } from "./market-cache-policy.js";
import { markBookSgpEstimate } from "./sgp-display-evidence.js";

const fail = reason => ({ready:false,advisoryOnly:true,publishingDisabled:true,
  reviewed:[],reason,combinedSgpQuoteVerified:false});

export function reviewNbaGameMarkets({
  game, picks=[], markets=[], now, oddsDebug={}, modelSgps=[]
}={}) {
  const policy=leaguePolicy("NBA");
  if (!game?.gameId || !Array.isArray(game.teams) || game.teams.length!==2 ||
      !Array.isArray(game.playerProjections) || !Array.isArray(picks) ||
      !Array.isArray(markets) || !Number.isFinite(now)) return fail("invalid_nba_game_context");
  const teams=new Set(game.teams.map(t=>String(t?.abbr||"")));
  if(teams.size!==2||teams.has(""))return fail("ambiguous_game_teams");
  const reviewed=picks.map(pick=>{
    const reasons=[];
    if(!pick || String(pick.gameId)!==String(game.gameId))reasons.push("pick_game_mismatch");
    if(!pick || !teams.has(pick.team))reasons.push("pick_team_not_in_game");
    if(!supportedLeagueMarket("NBA",pick?.market))reasons.push("unsupported_nba_market");
    if(!policy.books.includes(pick?.sportsbook))reasons.push("unsupported_sportsbook");
    if(!Number.isFinite(pick?.line)||pick.line<0)reasons.push("invalid_prop_line");
    const player=game.playerProjections.find(p=>
      String(p?.playerId)===String(pick?.playerId) && p?.team===pick?.team);
    if(!player)reasons.push("unmatched_player_identity");
    else if(player.availability!=="ACTIVE_ROTATION" ||
      player.starterStatus!=="CONFIRMED_STARTER" ||
      player.verification?.role?.verified!==true)reasons.push("starter_or_active_status_unconfirmed");
    const market=markets.find(m=>
      String(m?.gameId)===String(game.gameId) &&
      String(m?.playerId)===String(pick?.playerId) &&
      m?.team===pick?.team && m?.market===pick?.market &&
      m?.provenance==="verified_server_crosswalk" &&
      typeof m?.providerEventId==="string" && m.providerEventId.length>0 &&
      ["SportsGameOdds","The Odds API"].includes(m?.source) &&
      Array.isArray(m?.books) && m.books.some(b=>b?.book===pick?.sportsbook &&
        b?.line===pick?.line));
    if(!market)reasons.push("missing_server_verified_market_identity");
    // Alternate NBA lines must use the EXACT requested bookmaker threshold.
    // Never let a primary quote at 24.5 silently stand in for a 29.5 prop.
    const matchingBookLines=market?.books?.filter(b=>
      b?.book===pick?.sportsbook && b?.line===pick?.line) || [];
    const quote=currentBookOffer(
      market?{...market,books:matchingBookLines}:null,pick?.sportsbook,now);
    if(!quote || quote.line!==pick?.line)
      reasons.push("missing_or_stale_book_specific_quote");
    return {playerId:pick?.playerId||null,market:pick?.market||null,
      sportsbook:pick?.sportsbook||null,line:pick?.line??null,
      verified:reasons.length===0,reasons};
  });
  const activeRows=markets.filter(m=>m&&String(m.gameId)===String(game.gameId) &&
    m.provenance==="verified_server_crosswalk" && teams.has(m.team));
  const marketEvidence=summarizeMarketEvidence({rows:activeRows,oddsDebug,now});
  const cachePolicy=marketCachePolicy({rows:activeRows,now});
  const sgps=(Array.isArray(modelSgps)?modelSgps:[]).filter(s=>
    ["Small","Medium","Nuke"].includes(s?.risk))
    .map(s=>markBookSgpEstimate({...s,league:"NBA"}));
  return {ready:reviewed.length>0&&reviewed.every(r=>r.verified),reviewed,
    league:"NBA",advisoryOnly:true,publishingDisabled:true,
    combinedSgpQuoteVerified:false,marketEvidence,cachePolicy,
    sgps,refreshMinutes:policy.refreshMinutes,
    finalPregameCheckMinutes:policy.finalPregameCheckMinutes};
}
