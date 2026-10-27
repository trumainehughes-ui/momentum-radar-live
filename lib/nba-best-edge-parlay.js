import {evaluateUniversalPlayerMarketGate} from './sport-sgp-verification-gate.js';
import {assessSlipInjuryChanges} from './injury-change-guardian.js';
// Deterministic, auditable two-game NBA best-edge parlay research.
// Model targets are NEVER represented as available sportsbook wagers.
const STATS=new Set(['points','rebounds','assists','threes']);
const n=v=>v===null||v===undefined||v===''?NaN:Number(v);
const round=v=>Math.round(v*10000)/10000;
const fail=(reason,details={})=>({status:'NO_QUALIFYING_PARLAY',reason,legs:[],...details});
const conflicting=(a,b)=>
 // Never combine two props for the same athlete in this four-player slip.
 (Boolean(a.playerId)&&Boolean(b.playerId)&&String(a.playerId)===String(b.playerId))||
 (a.team===b.team&&(
  (a.category==='rebounds'&&b.category==='rebounds')||
  (a.category==='assists'&&b.category==='assists')));
// Each game needs a timestamped consensus total/spread and a valid pregame snapshot.
// Do not substitute a model total for a sportsbook total.
export function nbaBestEdgeParlay(games,{mode='VERIFIED_MARKET',now=Date.now()}={}){
 if(mode!=='VERIFIED_MARKET')return fail('VERIFIED_MARKET_REQUIRED');
 const eligible=(Array.isArray(games)?games:[]).filter(g=>
  g.status==='SCHEDULED'&&Date.parse(g.kickoff)>now&&
  Number.isFinite(n(g.total))&&n(g.total)>0&&
  Number.isFinite(n(g.spread))&&Math.abs(n(g.spread))<6&&
  Array.isArray(g.playerProjections)&&g.playerProjections.length>0)
  .sort((a,b)=>n(b.total)-n(a.total)||Math.abs(n(a.spread))-Math.abs(n(b.spread)));
 if(eligible.length<2)return fail('FEWER_THAN_TWO_COMPETITIVE_HIGH_TOTAL_GAMES',{
  qualifyingGames:eligible.map(g=>({gameId:g.gameId,total:n(g.total),spread:n(g.spread)}))});
 const selected=[],legs=[];
 const diagnostics={gamesScanned:eligible.length,playersInspected:0,starterRejected:0,historyRejected:0,marketRejected:0,projectionRejected:0,hitRateRejected:0,injuryRejected:0,conflictRejected:0};
 for(const game of eligible){
  const pool=[];
  for(const p of game.playerProjections){
   if(!STATS.has(p.category))continue;
   diagnostics.playersInspected++;
   if(p.starterVerified!==true||/\b(?:OUT|INACTIVE|IR|INJURED RESERVE|DOUBTFUL|QUESTIONABLE|SUSPENDED)\b/i.test([p.injuryStatus,p.availability].filter(Boolean).join(' '))){diagnostics.starterRejected++;continue;}
   const values=Array.isArray(p.historicalValues)?p.historicalValues.map(n).filter(Number.isFinite):[];
   if(values.length<10){diagnostics.historyRejected++;continue;}
   const role=p.roleEvidence||null;
   const gate=evaluateUniversalPlayerMarketGate({sport:'nba',gameId:game.gameId,
    leg:{playerId:p.playerId,gameId:game.gameId,team:p.team,category:p.category,
     injuryStatus:[p.injuryStatus,p.availability].filter(Boolean).join(' ')},role,offers:p.verifiedMarkets||[],now});
   if(!gate.ready){diagnostics.marketRejected++;continue;}
   const line=gate.consensusLine;
   // A cross-book consensus is research evidence, not proof that this exact
   // target is offered at either book. Require an actual matching offer.
   if(!gate.offers?.some(o=>Number(o.line)===Number(line))){diagnostics.marketRejected++;continue;}
   const projection=n(p.projection);
   if(!Number.isFinite(line)||line<=0||!Number.isFinite(projection)||projection<=line){diagnostics.projectionRejected++;continue;}
   const lastTen=values.slice(0,10),hits=lastTen.filter(v=>v>line).length;
   if(hits<7){diagnostics.hitRateRejected++;continue;}
   pool.push({gameId:game.gameId,playerId:p.playerId,name:p.name,team:p.team,
    category:p.category,target:line,starterVerified:p.starterVerified===true,projection,edgePct:round(100*(projection-line)/line),
    hitsLastTen:hits,attempts:10,source:'MULTI_BOOK_VERIFIED_CONSENSUS',
    sportsbooks:gate.offers.map(m=>({book:m.book,line:m.line,checkedAt:m.checkedAt})),
    marketCheckedAt:gate.offers.reduce((min,m)=>!min||m.checkedAt<min?m.checkedAt:min,null)});
  }
  pool.sort((a,b)=>b.edgePct-a.edgePct||b.hitsLastTen-a.hitsLastTen);
  let pair=null;
  for(let i=0;i<pool.length&&!pair;i++)for(let j=i+1;j<pool.length;j++){
   if(!conflicting(pool[i],pool[j])&&
    !legs.some(existing=>conflicting(existing,pool[i])||conflicting(existing,pool[j]))){
    pair=[pool[i],pool[j]];break}
  }
  if(!pair){diagnostics.conflictRejected++;continue;}
  const injury=assessSlipInjuryChanges({legs:pair,players:game.playerProjections,
   checkedAt:game.injuryCheckedAt,now,gameChanges:game.gameChanges||[]});
  if(injury.status!=='VALID'){diagnostics.injuryRejected++;continue;}
  selected.push(game);
  legs.push(...pair);
  if(selected.length===2)break;
 }
 if(selected.length<2)return fail(
  diagnostics.playersInspected>0&&diagnostics.starterRejected===diagnostics.playersInspected?
   'NO_CONFIRMED_GAME_STARTERS':
  diagnostics.marketRejected>0&&diagnostics.marketRejected===diagnostics.playersInspected-diagnostics.starterRejected-diagnostics.historyRejected?
   'VERIFIED_PLAYER_MARKETS_MISSING':'INSUFFICIENT_70_PERCENT_NON_CONFLICTING_PROPS',{
  eligibleGamesInspected:eligible.length,diagnostics,qualifyingGames:eligible.slice(0,2).map(g=>({gameId:g.gameId,total:n(g.total),spread:n(g.spread)}))});
 return {status:mode==='VERIFIED_MARKET'?'RESEARCH_CANDIDATE':'MODEL_ONLY_CANDIDATE',
  mode,legs,diagnostics,qualifyingGames:selected.map(g=>({gameId:g.gameId,total:n(g.total),spread:n(g.spread)})),
  combinedOddsVerified:false,notes:'No independence or parlay price inferred; same-game and cross-game correlation still require bookmaker validation.'};
}
