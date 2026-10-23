// Deterministic, auditable two-game NBA best-edge parlay research.
// Model targets are NEVER represented as available sportsbook wagers.
const STATS=new Set(['points','rebounds','assists','threes']);
const n=v=>v===null||v===undefined||v===''?NaN:Number(v);
const round=v=>Math.round(v*10000)/10000;
const fail=(reason,details={})=>({status:'NO_QUALIFYING_PARLAY',reason,legs:[],...details});
const conflicting=(a,b)=>a.team===b.team&&(
 a.playerId===b.playerId||
 (a.category==='rebounds'&&b.category==='rebounds')||
 (a.category==='assists'&&b.category==='assists'));
// Each game needs a timestamped consensus total/spread and a valid pregame snapshot.
// Do not substitute a model total for a sportsbook total.
export function nbaBestEdgeParlay(games,{mode='MODEL_TARGET',now=Date.now()}={}){
 if(!['MODEL_TARGET','VERIFIED_MARKET'].includes(mode))return fail('INVALID_MODE');
 const eligible=(Array.isArray(games)?games:[]).filter(g=>
  g.status==='SCHEDULED'&&Date.parse(g.kickoff)>now&&
  Number.isFinite(n(g.total))&&n(g.total)>0&&
  Number.isFinite(n(g.spread))&&Math.abs(n(g.spread))<6&&
  Array.isArray(g.playerProjections)&&g.playerProjections.length>0)
  .sort((a,b)=>n(b.total)-n(a.total)||Math.abs(n(a.spread))-Math.abs(n(b.spread)));
 if(eligible.length<2)return fail('FEWER_THAN_TWO_COMPETITIVE_HIGH_TOTAL_GAMES',{
  qualifyingGames:eligible.map(g=>({gameId:g.gameId,total:n(g.total),spread:n(g.spread)}))});
 const selected=eligible.slice(0,2),legs=[];
 for(const game of selected){
  const pool=[];
  for(const p of game.playerProjections){
   if(!STATS.has(p.category)||p.starterVerified!==true||
    /OUT|INACTIVE|DOUBTFUL|SUSPENDED/i.test(String(p.injuryStatus||'')))continue;
   const values=Array.isArray(p.historicalValues)?p.historicalValues.map(n).filter(Number.isFinite):[];
   if(values.length<10)continue;
   const line=mode==='VERIFIED_MARKET'?n(p.verifiedSportsbookLine):n(p.modelTarget);
   const projection=n(p.projection);
   if(!Number.isFinite(line)||line<=0||!Number.isFinite(projection)||projection<=line)continue;
   if(mode==='VERIFIED_MARKET'&&(!p.sportsbook||!p.marketCheckedAt||
     Date.parse(p.marketCheckedAt)>now||now-Date.parse(p.marketCheckedAt)>30*60*1000))continue;
   const lastTen=values.slice(-10),hits=lastTen.filter(v=>v>line).length;
   if(hits<7)continue;
   pool.push({gameId:game.gameId,playerId:p.playerId,name:p.name,team:p.team,
    category:p.category,target:line,projection,edgePct:round(100*(projection-line)/line),
    hitsLastTen:hits,attempts:10,source:mode==='VERIFIED_MARKET'?'VERIFIED_SPORTSBOOK':'MODEL_TARGET_ONLY',
    sportsbook:mode==='VERIFIED_MARKET'?p.sportsbook:null,
    marketCheckedAt:mode==='VERIFIED_MARKET'?p.marketCheckedAt:null});
  }
  pool.sort((a,b)=>b.edgePct-a.edgePct||b.hitsLastTen-a.hitsLastTen);
  let pair=null;
  for(let i=0;i<pool.length&&!pair;i++)for(let j=i+1;j<pool.length;j++){
   if(!conflicting(pool[i],pool[j])){pair=[pool[i],pool[j]];break}
  }
  if(!pair)return fail('INSUFFICIENT_70_PERCENT_NON_CONFLICTING_PROPS',{
   failedGameId:game.gameId,eligiblePlayers:pool.length,
   qualifyingGames:selected.map(g=>({gameId:g.gameId,total:n(g.total),spread:n(g.spread)}))});
  legs.push(...pair);
 }
 return {status:mode==='VERIFIED_MARKET'?'RESEARCH_CANDIDATE':'MODEL_ONLY_CANDIDATE',
  mode,legs,qualifyingGames:selected.map(g=>({gameId:g.gameId,total:n(g.total),spread:n(g.spread)})),
  combinedOddsVerified:false,notes:'No independence or parlay price inferred; same-game and cross-game correlation still require bookmaker validation.'};
}
