// Stable two-way game sharding. Two Vercel crons every 15 minutes can
// handle ALL due games without a single serverless invocation serializing an
// entire NFL or NBA slate. Future leagues need verified provider adapters.
import {put,list} from '@vercel/blob';
export const COLLECTOR_SHARDS=2;
const PREFIX='momentum-ops/v1/pregame-collector-';
const LEAGUES=new Set(['nfl','nba']);
export function shardForGame(id){
 const s=String(id||'');
 if(!/^\d{7,12}$/.test(s))return null;
 return Number(BigInt(s)%BigInt(COLLECTOR_SHARDS));
}
export function selectedShardGames(games,shard){
 if(!Number.isInteger(shard)||shard<0||shard>=COLLECTOR_SHARDS)throw Error('invalid_collector_shard');
 const seen=new Set();
 return (Array.isArray(games)?games:[]).filter(g=>{
  const id=String(g?.gameId||'');
  if(seen.has(id)||shardForGame(id)!==shard)return false;
  seen.add(id);return true;
 }).sort((a,b)=>Date.parse(a.kickoff)-Date.parse(b.kickoff));
}
export function collectorAuditPath(league,shard){
 if(!LEAGUES.has(league)||!Number.isInteger(shard)||shard<0||shard>=COLLECTOR_SHARDS)
  throw Error('invalid_collector_identity');
 return PREFIX+league+'-shard-'+shard+'.json';
}
export const COLLECTOR_TIERS=Object.freeze(['Small','Medium','Nuke']);
export const COLLECTOR_BOOKS=Object.freeze(['DraftKings','FanDuel']);
const BOOK_QUOTE_TTL_MS=15*60*1000;
const freshBookQuote=(b,now)=>{
 const at=Date.parse(b?.quoteCheckedAt||'');
 return b?.combinedOddsVerified===true&&
  Number.isFinite(at)&&at<=now&&now-at<=BOOK_QUOTE_TTL_MS;
};
// A persisted collector audit reflects the time it was written, not the
// time it is READ. Recalculate every book tier using fresh original quote
// timestamps, and fail closed for older rollout schemas without quoteAt.
export function recheckCollectorSportsbooks(tiers,{now=Date.now(),shardCurrent=true}={}){
 return(Array.isArray(tiers)?tiers:[]).filter(t=>COLLECTOR_TIERS.includes(t?.risk))
  .map(t=>{
   const books=Object.fromEntries(COLLECTOR_BOOKS.map(book=>{
    const b=t.books?.[book],fresh=shardCurrent&&freshBookQuote(b,now),
     tierReady=fresh&&b?.tierVerified===true;
    const claimed=String(b?.status||'');
    const hadQuote=claimed==='TIER_COMBINED_QUOTE_VERIFIED'||
     claimed==='BOOK_COMBINED_PRICE_OUTSIDE_TIER'||
     b?.combinedOddsVerified===true||b?.tierVerified===true;
    const status=!shardCurrent?'STALE_COLLECTOR':
     fresh?(tierReady?'TIER_COMBINED_QUOTE_VERIFIED':
      'BOOK_COMBINED_PRICE_OUTSIDE_TIER'):
     hadQuote?'BOOK_QUOTE_STALE':claimed||'NO_VERIFIED_BOOK_MARKETS';
    return[book,{status,matchedLegs:Math.max(0,Number(b?.matchedLegs)||0),
     requiredLegs:Math.max(0,Number(b?.requiredLegs)||0),
     quoteCheckedAt:fresh?b.quoteCheckedAt:null,
     combinedOddsVerified:fresh,tierVerified:tierReady}];
   }));
   const priceReady=Object.values(books).some(b=>b.tierVerified);
   const anyPrice=Object.values(books).some(b=>b.combinedOddsVerified);
   const sportsbookStatus=!shardCurrent?'STALE_COLLECTOR':
    priceReady?'TIER_COMBINED_QUOTE_VERIFIED':
    anyPrice?'BOOK_COMBINED_PRICE_OUTSIDE_TIER':
    String(t.sportsbookStatus||'SPORTSBOOK_VERIFICATION_PENDING')==='TIER_COMBINED_QUOTE_VERIFIED'?
    'BOOK_QUOTE_STALE':t.sportsbookStatus||'SPORTSBOOK_VERIFICATION_PENDING';
   return{risk:t.risk,modelStatus:t.modelStatus,
    sportsbookStatus,books};
  });
}
const verifiedBookCount=tiers=>(tiers||[]).reduce((n,t)=>n+
  Object.values(t.books||{}).filter(b=>b.tierVerified===true).length,0);
export function collectorBookCoverage(shards){
 const out=Object.fromEntries(COLLECTOR_TIERS.map(risk=>[risk,
  Object.fromEntries(COLLECTOR_BOOKS.map(book=>[book,{
   dueGames:0,modelCandidates:0,exactLines:0,
   combinedPriceVerified:0,tierPriceVerified:0,outsideTarget:0,
   missingBookData:0
  }]))]));
 for(const shard of shards||[]){
  if(shard.status!=='COMPLETE')continue;
  for(const item of shard.results||[]){
   for(const t of item.sportsbookTierAudit||[]){
    if(!COLLECTOR_TIERS.includes(t.risk))continue;
    for(const book of COLLECTOR_BOOKS){
     const bucket=out[t.risk][book],b=t.books?.[book];
     bucket.dueGames++;
     if(t.modelStatus==='MODEL_CANDIDATE')bucket.modelCandidates++;
     if(b?.status==='EXACT_LEGS_LISTED_COMBINED_ODDS_UNVERIFIED'||
       b?.status==='BOOK_COMBINED_PRICE_OUTSIDE_TIER'||
       b?.status==='TIER_COMBINED_QUOTE_VERIFIED')bucket.exactLines++;
     if(b?.combinedOddsVerified)bucket.combinedPriceVerified++;
     if(b?.tierVerified)bucket.tierPriceVerified++;
     if(b?.status==='BOOK_COMBINED_PRICE_OUTSIDE_TIER')bucket.outsideTarget++;
     if(!b||['NO_VERIFIED_BOOK_MARKETS','BOOK_LEG_MISMATCH','BOOK_QUOTE_STALE',
       'MODEL_NOT_READY','SPORTSBOOK_VERIFICATION_PENDING'].includes(b.status))
       bucket.missingBookData++;
    }
   }
  }
 }
 return out;
}
// AI sportsbook guard at every due matchup. Saved snapshots cannot keep a
// 15-minute market claim alive for the entire 30-minute collector interval.
export function collectorAiScoutStatus(report,{now=Date.now(),shardCurrent=true}={}){
 const g=report?.sportsbookAiGuard||report?.aiSportsbookScout||null;
 const event=String(report?.gameId||''),checked=Date.parse(g?.sourceCheckedAt||'');
 const current=shardCurrent&&String(g?.gameId||'')===event&&
  Number.isFinite(checked)&&checked<=now&&now-checked<=15*60000;
 const pending=['INSUFFICIENT_EVIDENCE','PENDING_OR_STALE',
  'BOOK_MARKETS_PENDING'].includes(g?.status);
 const items=current&&!pending&&
  ['ADVISORY_READY','CURRENT_SOURCE_REVIEW'].includes(g?.status)?
  (Array.isArray(g.items)?g.items:Array.isArray(g.bookTierChecks)?g.bookTierChecks:[]).slice(0,6)
   .filter(x=>COLLECTOR_TIERS.includes(x.risk)&&COLLECTOR_BOOKS.includes(x.book))
   .map(x=>({risk:x.risk,book:x.book,marketStatus:x.marketStatus,
    exactLegs:Number.isInteger(x.exactLegs)?x.exactLegs:null,
    requiredLegs:Number.isInteger(x.requiredLegs)?x.requiredLegs:null,
    // Avoid leaking arbitrary source text or unbounded player identifiers
    // through the public collector-health diagnostics.
    missingSelections:Array.isArray(x.proposedOfferChecks)?
     x.proposedOfferChecks.length:
     Number.isInteger(x.missingSelections)?x.missingSelections:0})): [];
 return{gameId:event,sourceCheckedAt:current?g.sourceCheckedAt:null,
  status:!shardCurrent?'STALE_COLLECTOR':!current?'STALE_OR_MISSING':
   pending?'BOOK_MARKETS_PENDING':items.length?'CURRENT_SOURCE_REVIEW':'NO_MARKET_EVIDENCE',
  bookTierChecks:items,
  flags:current?(Array.isArray(g.flags)?g.flags:[]).slice(0,6).map(x=>({
   code:String(x.code||'UNKNOWN').slice(0,55)})):[],
  combinedOddsVerified:false,canSetOdds:false,canChangePicks:false,
  aiProviderCalled:false,additionalSportsbookRequests:0};
}
export function collectorAiScoutSummary(shards){
 const out={currentGameReviews:0,bookMarketsPending:0,staleOrMissing:0,
  bookTierChecks:0,missingSelectionChecks:0,combinedOddsVerified:0};
 for(const shard of shards||[]){
  for(const row of shard.results||[]){
   const s=row.aiSportsbookScout;
   if(shard.status!=='COMPLETE'||!s||s.status==='STALE_OR_MISSING'||s.status==='STALE_COLLECTOR'){
    out.staleOrMissing++;continue;
   }
   if(s.status==='BOOK_MARKETS_PENDING'){out.bookMarketsPending++;continue}
   if(s.status!=='CURRENT_SOURCE_REVIEW')continue;
   out.currentGameReviews++;
   out.bookTierChecks+=(s.bookTierChecks||[]).length;
   out.missingSelectionChecks+=(s.bookTierChecks||[]).reduce((n,x)=>
    n+(Number(x.missingSelections)||0),0);
  }
 }
 return out;
}
// Execution success means the source was refreshed; it NEVER proves that
// any sportsbook quote or even all three MODEL-ONLY SGP tiers are available.
export function collectorTierCoverage(report={}){
 const data=report?.modelTierReadiness;
 const byRisk=data&&typeof data==='object'&&!Array.isArray(data)?data:null;
 const listed=Array.isArray(report?.modelTiers)?report.modelTiers:null;
 const known=byRisk!==null||listed!==null||['NOT_READY','no_qualified_model_data'].includes(report?.status);
 if(!known)return{
  coverage:'UNVERIFIED',readyTiers:[],missingTiers:[],tierStatuses:null,
  modelCandidateCount:0,unverified:true
 };
 const tierStatuses=Object.fromEntries(COLLECTOR_TIERS.map(risk=>{
  const candidate=byRisk?byRisk[risk]?.status==='MODEL_CANDIDATE':
   listed?listed.includes(risk):false;
  return[risk,candidate?'MODEL_CANDIDATE':'NOT_READY'];
 }));
 const readyTiers=COLLECTOR_TIERS.filter(t=>tierStatuses[t]==='MODEL_CANDIDATE');
 const missingTiers=COLLECTOR_TIERS.filter(t=>tierStatuses[t]!=='MODEL_CANDIDATE');
 const reasons=Object.fromEntries(missingTiers.map(t=>[t,
  String(byRisk?.[t]?.reason||report?.reason||
   'Insufficient verified model evidence for this tier.').slice(0,190)]));
 return{coverage:readyTiers.length===3?'READY_3_OF_3':
  readyTiers.length?'PARTIAL_TIERS':'NO_QUALIFIED_TIERS',
  readyTiers,missingTiers,tierStatuses,tierReasons:reasons,
  modelCandidateCount:readyTiers.length,unverified:false};
}

export function collectorAuditReport(league,shard,reports,{now=Date.now(),state='COMPLETE',
 due=0,startedAt=null}={}){
 const completed=(Array.isArray(reports)?reports:[]).slice(0,40).map(x=>({
  gameId:String(x.gameId||''),status:String(x.status||'unknown').slice(0,60),
  stage:x.stage||null,
  ...collectorTierCoverage(x),
  // The same verification contract runs for every event, not a hand-picked
  // matchup. Bookmakers are tracked separately, per Small/Medium/Nuke tier.
  aiSportsbookScout:collectorAiScoutStatus(x,{now,shardCurrent:true}),
  sportsbookTierAudit:recheckCollectorSportsbooks(
   x.sgpVerification?.tiers||[],{now,shardCurrent:true}),
  bookmakerVerifiedCount:verifiedBookCount(
   recheckCollectorSportsbooks(x.sgpVerification?.tiers||[],{now,shardCurrent:true})),
  // Legacy stored count is explicitly RAW; NFL can save separate unquoted
  // DraftKings/FanDuel representations of the same three model tiers.
  rawSgpRecordCount:Number(x.sgps||0),rawPropRecordCount:Number(x.picks||0),
  changed:x.changed===true,
  changedFields:(Array.isArray(x.changedFields)?x.changedFields:[])
   .filter(k=>['PLAYER_PROPS','SGP_TIERS','INJURIES','MATCHUP','MODEL_INPUTS','FIRST_SNAPSHOT'].includes(k)),
  reason:String(x.reason||x.error||'').slice(0,190)
 }));
 const okStatus=new Set(['locked','updated','MODEL_ONLY','NOT_READY','no_qualified_model_data']);
 return {league,shard,state,startedAt,
  checkedAt:new Date(now).toISOString(),due,attempted:completed.length,
  successful:completed.filter(x=>okStatus.has(x.status)).length,
  failed:completed.filter(x=>!okStatus.has(x.status)).length,
  coverage:{
   full:completed.filter(x=>x.coverage==='READY_3_OF_3').length,
   partial:completed.filter(x=>x.coverage==='PARTIAL_TIERS').length,
   none:completed.filter(x=>x.coverage==='NO_QUALIFIED_TIERS').length,
   unverified:completed.filter(x=>x.coverage==='UNVERIFIED').length
  },
  results:completed,
  note:'Every due NFL/NBA game has a Small/Medium/Nuke sportsbook verification audit. The current live market adapters do not provide authenticated bookmaker-issued combined SGP quotes; MODEL_CANDIDATE and collector success are never verification.'};
}
export async function writeCollectorAudit(report,{putBlob=put}={}){
 try{
  const path=collectorAuditPath(report.league,report.shard);
  await putBlob(path,JSON.stringify(report),{access:'public',addRandomSuffix:false,allowOverwrite:true});
  return true;
 }catch(e){console.warn('pregame_audit_write_failed',report.league,report.shard);return false}
}
export async function readCollectorAudits(league,{listBlobs=list,fetchBlob=fetch,now=Date.now()}={}){
 if(!LEAGUES.has(league))return{ok:false,error:'invalid_league'};
 const entries=await Promise.all(Array.from({length:COLLECTOR_SHARDS},async(_,shard)=>{
  const path=collectorAuditPath(league,shard);
  try{
   const listing=await listBlobs({prefix:path,limit:3});
   const blob=listing.blobs?.find(x=>x.pathname===path);
   if(!blob)return{shard,status:'NO_COLLECTOR_AUDIT'};
   const res=await fetchBlob(blob.url,{cache:'no-store',signal:AbortSignal.timeout(7000)});
   if(!res.ok)throw Error('blob_read_failed');
   const report=await res.json();
   if(report.league!==league||report.shard!==shard)throw Error('identity_mismatch');
   const age=now-Date.parse(report.checkedAt||'');
   const fresh=Number.isFinite(age)&&age>=0&&age<=30*60000;
   const status=!fresh?'STALE':report.state==='RUNNING'&&age>10*60000?
    'RUNNING_LONG':report.state;
   // During rollout, yesterday's audit blobs may use an older schema and
   // contain no tier-readiness information. Count those as UNVERIFIED,
   // never as zero failures or evidence that every tier is ready.
   const results=(Array.isArray(report.results)?report.results:[]).map(item=>{
    const normalized=item?.coverage?item:{...item,...collectorTierCoverage(item)};
    const sportsbookTierAudit=recheckCollectorSportsbooks(
     normalized.sportsbookTierAudit||[],{now,shardCurrent:status==='COMPLETE'});
    const aiSportsbookScout=collectorAiScoutStatus({
     gameId:normalized.gameId,aiSportsbookScout:normalized.aiSportsbookScout
    },{now,shardCurrent:status==='COMPLETE'});
    return{...normalized,sportsbookTierAudit,aiSportsbookScout,
     bookmakerVerifiedCount:verifiedBookCount(sportsbookTierAudit)};
   });
   const coverage={full:results.filter(x=>x.coverage==='READY_3_OF_3').length,
    partial:results.filter(x=>x.coverage==='PARTIAL_TIERS').length,
    none:results.filter(x=>x.coverage==='NO_QUALIFIED_TIERS').length,
    unverified:results.filter(x=>x.coverage==='UNVERIFIED').length};
   return{...report,status,results,coverage};
  }catch{return{shard,status:'COLLECTOR_AUDIT_UNAVAILABLE'}}
 }));
 return{ok:true,league,shards:entries,
  summary:{shards:entries.length,
   sportsbookTierCoverage:collectorBookCoverage(entries),
   aiSportsbookScout:collectorAiScoutSummary(entries),
   reported:entries.filter(x=>x.status==='COMPLETE').length,
   due:entries.reduce((n,x)=>n+(x.due||0),0),
   successful:entries.reduce((n,x)=>n+(x.successful||0),0),
   failed:entries.reduce((n,x)=>n+(x.failed||0),0),
   coverage:{
    // A stale, missing or running collector cannot confirm CURRENT models.
    full:entries.filter(x=>x.status==='COMPLETE').reduce((n,x)=>n+(x.coverage?.full||0),0),
    partial:entries.filter(x=>x.status==='COMPLETE').reduce((n,x)=>n+(x.coverage?.partial||0),0),
    none:entries.filter(x=>x.status==='COMPLETE').reduce((n,x)=>n+(x.coverage?.none||0),0),
    unverified:entries.reduce((n,x)=>n+(x.status==='COMPLETE'?
     x.coverage?.unverified||0:x.due||x.results?.length||0),0)
   },
   staleShards:entries.filter(x=>x.status==='STALE').length,
   incompleteShards:entries.filter(x=>x.status!=='COMPLETE').length},
  note:'Collector execution success and SGP tier readiness are tracked separately. MODEL_ONLY is not a verified sportsbook quote; stale shard reports cannot confirm current coverage.'};
}
