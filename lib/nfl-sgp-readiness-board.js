// Read-only NFL readiness presentation. The sportsbook-paid quote collector
// and all APIs are elsewhere: these helpers never build or price a bet.
export const NFL_READINESS_TIERS=Object.freeze(['Small','Medium','Nuke']);
const BOOKS=new Set(['DraftKings','FanDuel']);
const bands={Small:{min:2000,max:2999},Medium:{min:3000,max:8000},
 Nuke:{min:10000,max:Infinity}};
const expectedLegs={Small:[4,4],Medium:[5,5],Nuke:[5,7]};
function safe(v,max=96){return String(v??'').slice(0,max);}
function intOdds(v){return typeof v==='number'&&Number.isSafeInteger(v)?v:null}
export function nflReadinessRow(game,report,{now=Date.now()}={}){
 const id=safe(game?.gameId,12);
 const date=safe(report?.date,10);
 const at=Date.parse(report?.checkedAt||'');
 const fresh=report?.ok===true&&String(report.gameId)===id&&
  /^\d{4}-\d{2}-\d{2}$/.test(date)&&
  Number.isFinite(at)&&at<=now+60000&&now-at<=15*60000&&
  !['STALE','UNAVAILABLE','REVIEW','PENDING'].includes(report.status);
 const raw=Array.isArray(report?.tiers)?report.tiers:[];
 const quotes=fresh&&Array.isArray(report.bookQuotes)?report.bookQuotes:[];
 const tiers=NFL_READINESS_TIERS.map(risk=>{
  const status=raw.find(x=>x?.risk===risk);
  const count=Number(status?.legCount);
  const [min,max]=expectedLegs[risk];
  const ready=fresh&&status?.status==='MODEL_CANDIDATE'&&
   Number.isSafeInteger(count)&&count>=min&&count<=max;
  const offered=quotes.filter(q=>{
   const odds=intOdds(q?.americanOdds);
   return BOOKS.has(q?.book)&&q.risk===risk&&odds!==null&&
    odds>=bands[risk].min&&odds<=bands[risk].max;
  });
  return {risk,modelReady:!!ready,modelLegs:ready?count:0,
   quotedBooks:[...new Set(offered.map(x=>x.book))],bookmakerPriced:offered.length>0};
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
  modelPossible:items.length*3,
  pricedTiers:items.reduce((n,x)=>n+x.pricedTierCount,0),
  pricedGames:items.filter(x=>x.pricedTierCount>0).length,
  notCurrent:items.filter(x=>x.snapshotStatus!=='CURRENT').length};
}
