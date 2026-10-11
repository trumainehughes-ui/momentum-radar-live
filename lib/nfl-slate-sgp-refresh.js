// An explicit, bounded, user-initiated full-slate pregame refresh.
// Uses the existing /api/nfl-markets per-game cache, 15m TTL, quota circuit
// breaker, injury/opponent models and same-book SGP guards. No privileged
// cron impersonation, no forced cache bypass and no combined price inference.
export const NFL_SLATE_REFRESH_MAX_GAMES=18;
export const NFL_SLATE_REFRESH_CONCURRENCY=2;
export const NFL_SLATE_REFRESH_HORIZON_MS=36*60*60*1000;
const RISKS=['Small','Medium','Nuke'];
const BOOKS=['DraftKings','FanDuel'];
const num=x=>Number.isFinite(Number(x))?Number(x):0;
export function eligibleNflSlateRefreshGames(games,{
 now=Date.now(),lookaheadMs=NFL_SLATE_REFRESH_HORIZON_MS
}={}){
 const seen=new Set(),out=[];
 for(const g of Array.isArray(games)?games:[]){
  const id=String(g?.gameId||''),ms=Date.parse(g?.kickoff||'')-now;
  if(!/^\d{7,12}$/.test(id)||seen.has(id)||g?.status!=='SCHEDULED'||
   !Number.isFinite(ms)||ms<=0||ms>lookaheadMs)continue;
  seen.add(id);out.push(g);
 }
 return out.sort((a,b)=>Date.parse(a.kickoff)-Date.parse(b.kickoff))
  .slice(0,NFL_SLATE_REFRESH_MAX_GAMES);
}
export function summarizeNflGameRefresh(game,result,{
 now=Date.now()
}={}){
 const fetched=Date.parse(result?.fetchedAt||''),fresh=Number.isFinite(fetched)&&
  fetched<=now&&now-fetched<=15*60*1000;
 const scoped=result?.ok===true&&String(result?.gameId||'')===String(game.gameId);
 const valid=scoped&&fresh&&result?.stale!==true&&result?.degraded!==true;
 const tiers=Object.fromEntries(RISKS.map(risk=>[risk,
  valid&&result?.sgps?.Analytics?.some(x=>x?.risk===risk&&
   x?.tierAssessment?.compositionOk===true&&
   Array.isArray(x.legs)&&x.legs.length>=
    (risk==='Small'?4:risk==='Medium'?5:5))?'MODEL_CANDIDATE':'NOT_READY']));
 const priced=BOOKS.map(book=>{
  const b=valid?result?.sportsbookCoverage?.books?.[book]:null;
  return[book,{pricedSelections:Math.max(0,num(b?.pricedSelections)),
   pricedAlternateSelections:Math.max(0,num(b?.pricedAlternateSelections)),
   missingCategories:Array.isArray(b?.missingCategories)?b.missingCategories:[],
   status:b?.pricedSelections>0?'INDIVIDUAL_PRICES_OBSERVED':'BOOK_MARKETS_PENDING'}];
 });
 const anyModel=Object.values(tiers).some(x=>x==='MODEL_CANDIDATE');
 const anyBook=priced.some(([,b])=>b.pricedSelections>0);
 return{gameId:String(game.gameId),home:game?.home?.abbr||'',
  away:game?.away?.abbr||'',fetchedAt:valid?result.fetchedAt:null,
  status:!valid?'SOURCE_PENDING':anyModel?
   (anyBook?'MODEL_AND_INDIVIDUAL_BOOK_LINES':'MODEL_ONLY'):
   'MODEL_NOT_READY',
  tiers,books:Object.fromEntries(priced),
  injuryEligibilityChecked:valid&&result?.validation?.injuryEligibilityChecked===true,
  actualCombinedSgpOddsVerified:false,
  reason:!valid?'Missing, mismatched, degraded, or older-than-15-minute game evidence.':
   !anyBook?'No recent per-player DraftKings or FanDuel individual prices verified.':
   !anyModel?'Source received but no rule-compliant tier is ready.':
   'Model candidates and individual offers observed; correlated bookmaker SGP quote remains unverified.'};
}
export async function runNflSlateSgpRefresh(games,loadGame,{
 now=Date.now(),onProgress=()=>{},concurrency=NFL_SLATE_REFRESH_CONCURRENCY
}={}){
 if(typeof loadGame!=='function')throw Error('loadGame_required');
 const due=eligibleNflSlateRefreshGames(games,{now}),out=new Array(due.length);
 const threads=Math.max(1,Math.min(2,Math.floor(concurrency)||1,due.length));
 let cursor=0,finished=0;
 await Promise.all(Array.from({length:threads},async()=>{
  for(;;){
   const i=cursor++;
   if(i>=due.length)break;
   try{
    const result=await loadGame(due[i].gameId);
    out[i]=summarizeNflGameRefresh(due[i],result,{now});
   }catch(e){
    out[i]={gameId:due[i].gameId,status:'REFRESH_FAILED',
     reason:String(e?.message||'provider_or_network_unavailable').slice(0,110),
     tiers:Object.fromEntries(RISKS.map(r=>[r,'NOT_READY'])),
     books:Object.fromEntries(BOOKS.map(b=>[b,{status:'BOOK_MARKETS_PENDING',
      pricedSelections:0}])),actualCombinedSgpOddsVerified:false};
   }
   finished++;onProgress({finished,total:due.length,row:out[i]});
  }
 }));
 const rows=out.filter(Boolean);
 return{status:due.length?'READ_ONLY_GUARDED_REFRESH_COMPLETED':'NO_UPCOMING_GAMES',
  attempted:due.length,complete:rows.length,
  sourcePending:rows.filter(x=>x.status==='SOURCE_PENDING'||x.status==='REFRESH_FAILED').length,
  modelCandidateGames:rows.filter(x=>x.status==='MODEL_ONLY'||
   x.status==='MODEL_AND_INDIVIDUAL_BOOK_LINES').length,
  bothBookPricedGames:rows.filter(x=>
   BOOKS.every(book=>x.books?.[book]?.pricedSelections>0)).length,
  combinedBookQuoteVerified:0,
  games:rows,
  note:'A complete refresh is not proof that all SGP tiers or actual correlated book payouts exist. Existing per-game cache/provider quotas are respected.'};
}
