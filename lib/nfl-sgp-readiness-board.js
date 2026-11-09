import {NFL_SGP_TIERS,classifyNflSgpOdds} from './ai-mechanics/nfl-sgp-tiers.js';
// Read-only NFL readiness presentation. The sportsbook-paid quote collector
// and all APIs are elsewhere: these helpers never build or price a bet.
export const NFL_READINESS_TIERS=Object.freeze(['Small','Medium','Large','Nuke']);
const BOOKS=new Set(['DraftKings','FanDuel']);
function safe(v,max=96){return String(v??'').slice(0,max);}
function intOdds(v){return typeof v==='number'&&Number.isSafeInteger(v)?v:null}
export function nflReadinessRow(game,report,{now=Date.now(),date=null}={}){
 const id=safe(game?.gameId,12);
 const reportDate=safe(report?.date,10);
 const at=Date.parse(report?.checkedAt||'');
 const fresh=report?.ok===true&&String(report.gameId)===id&&
  (!date||String(date)===reportDate)&&
  /^\d{4}-\d{2}-\d{2}$/.test(reportDate)&&
  Number.isFinite(at)&&at<=now+60000&&now-at<=15*60000&&
  !['STALE','UNAVAILABLE','REVIEW','PENDING'].includes(report.status);
 const raw=Array.isArray(report?.tiers)?report.tiers:[];
 const quotes=fresh&&report.sportsbookCombinedOddsVerified===true&&
  Array.isArray(report.bookQuotes)?report.bookQuotes:[];
 const tiers=NFL_READINESS_TIERS.map(risk=>{
  const status=raw.find(x=>x?.risk===risk);
  const count=Number(status?.legCount);
  const {minLegs:min,maxLegs:max}=NFL_SGP_TIERS[risk];
  const ready=fresh&&status?.status==='MODEL_CANDIDATE'&&
   Number.isSafeInteger(count)&&count>=min&&count<=max;
  const offered=quotes.filter(q=>{
   const odds=intOdds(q?.americanOdds);
   // A price for another event cannot verify this game's tier.
   return String(q?.gameId||'')===id&&q?.date===reportDate&&BOOKS.has(q?.book)&&q.risk===risk&&odds!==null&&
    classifyNflSgpOdds(odds)===risk&&NFL_SGP_TIERS[risk]!=null;
  });
  return {risk,modelReady:!!ready,modelLegs:ready?count:0,
   quotedBooks:ready?[...new Set(offered.map(x=>x.book))]:[],bookmakerPriced:!!ready&&offered.length>0};
 });
 return {gameId:id,matchup:safe(game?.away?.abbr,4)+' @ '+safe(game?.home?.abbr,4),
  kickoff:safe(game?.kickoff,35),gameStatus:safe(game?.status,24),
  snapshotStatus:fresh?'CURRENT':report?.ok?'STALE_OR_REVIEW':'NO_CURRENT_SNAPSHOT',
  checkedAt:fresh?new Date(at).toISOString():null,
  sourceStatus:fresh?safe(report?.bookPricing?.status||'SOURCE_UNVERIFIED',90):'RECHECK_REQUIRED',
  modelReadyCount:tiers.filter(x=>x.modelReady).length,
  pricedTierCount:tiers.filter(x=>x.bookmakerPriced).length,
  tiers};
}
export function nflReadinessTotals(rows){
 const items=Array.isArray(rows)?rows:[];
 return {games:items.length,checked:items.filter(x=>x.snapshotStatus==='CURRENT').length,
  modelReady:items.reduce((n,x)=>n+x.modelReadyCount,0),
  modelPossible:items.length*NFL_READINESS_TIERS.length,
  pricedTiers:items.reduce((n,x)=>n+x.pricedTierCount,0),
  pricedGames:items.filter(x=>x.pricedTierCount>0).length,
  notCurrent:items.filter(x=>x.snapshotStatus!=='CURRENT').length};
}
