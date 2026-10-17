// Source-constrained, slate-relative featured game spotlight.
// A scoring total is the market's expected combined points, NOT a guarantee,
// popularity ranking, predicted betting profit or verified player-prop line.
export const NFL_SPOTLIGHT_MIN_TOTAL=47;
export const NFL_SPOTLIGHT_MAX_GAMES=4;
const validTotal=n=>typeof n==='number'&&Number.isFinite(n)&&n>=25&&n<=90;
const easternDow=iso=>{
 const ms=Date.parse(String(iso||''));
 return Number.isFinite(ms)?
  new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short'})
   .format(new Date(ms)):null;
};
export function nflScoringSpotlights(games,{observedAt=new Date().toISOString()}={}){
 const list=Array.isArray(games)?games:[];
 const candidates=list.filter(g=>g&&g.status==='SCHEDULED'&&
  easternDow(g.kickoff)==='Sun'&&validTotal(g.gameTotal)&&
  /^\d{7,12}$/.test(String(g.gameId||'')))
  .sort((a,b)=>b.gameTotal-a.gameTotal||String(a.gameId).localeCompare(String(b.gameId)));
 // No labels when there isn't enough independent slate evidence.
 if(candidates.length<2)return {};
 const winners=candidates.filter(g=>g.gameTotal>=NFL_SPOTLIGHT_MIN_TOTAL)
  .slice(0,NFL_SPOTLIGHT_MAX_GAMES);
 const max=winners[0]?.gameTotal;
 return Object.fromEntries(winners.map((g,index)=>[String(g.gameId),{
  kind:'HIGH_TOTAL',label:'High-scoring watch',
  rank:index+1,rankedGames:candidates.length,
  tiedForHighest:g.gameTotal===max,
  totalPoints:g.gameTotal,source:'ESPN_SCOREBOARD_MARKET_TOTAL',
  observedAt,
  explanation:g.gameTotal===max?'Tied for the highest listed Sunday game total':
   'Among the highest listed Sunday game totals',
  note:'Market combined-points O/U; not a guaranteed score, betting edge, popularity metric, or verified player prop'
 }]));
}
export function safeNflSpotlightForAi(spotlight,gameId){
 if(spotlight?.kind!=='HIGH_TOTAL'||spotlight.source!=='ESPN_SCOREBOARD_MARKET_TOTAL'||
  !validTotal(spotlight.totalPoints)||!Number.isInteger(spotlight.rank)||
  spotlight.rank<1||spotlight.rank>NFL_SPOTLIGHT_MAX_GAMES)return null;
 return {gameId:String(gameId),kind:'HIGH_TOTAL',
  listedCombinedPointsTotal:spotlight.totalPoints,
  sundaySlateRank:spotlight.rank,source:'ESPN_SCOREBOARD_MARKET_TOTAL',
  observedAt:spotlight.observedAt||null,
  interpretation:'Market combined-points expectation; use as game-script context only. It does not establish popularity, a player prop edge or sportsbook-verified parlay odds.'};
}
