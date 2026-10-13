// Read-only NFL SGP snapshot diagnostics: zero ESPN, sportsbook and AI
// requests. The snapshots already exist from /api/nfl-markets. Do NOT
// regenerate market data just to answer a readiness question.
import {list} from '@vercel/blob';
import {classifyNflSgpOdds} from './ai-mechanics/nfl-sgp-tiers.js';
import {nflSavedBookQuoteDiagnostics} from './nfl-book-quote-diagnostics.js';

export const NFL_SGP_SNAPSHOT_PREFIX='momentum-nfl-markets/v2/';
export const NFL_SGP_SNAPSHOT_SCHEMA='v92-strict-nuke-profit-20261011-nuke-roster-adaptive-1-game-identity-2-day-ahead-roles-v5-teamid-depthchart-public-quote-scrub-v1-official-reserve-holds-v1-model-hit-chance-v1';
export const NFL_SGP_SNAPSHOT_TTL_MS=15*60*1000;
export function nflSgpSnapshotPath(date,gameId){
 if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||
    !Number.isFinite(Date.parse(date+'T12:00:00Z'))||
    new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date||
    !/^\d{7,12}$/.test(String(gameId||'')))return null;
 const key=(NFL_SGP_SNAPSHOT_SCHEMA+'-'+date+'-'+String(gameId)).replace(/[^A-Za-z0-9_-]/g,'');
 return NFL_SGP_SNAPSHOT_PREFIX+encodeURIComponent(key)+'.json';
}
const risks=['Small','Medium','Nuke'];
export function nflSgpSnapshotReadiness(snapshot,{now=Date.now(),gameId}={}){
 const at=Number(snapshot?.at),raw=snapshot?.body;
 if(!raw||raw.ok!==true||String(raw.gameId)!==String(gameId)||!Number.isFinite(at)||
   at>now+60_000||at<=0)
  return{status:'UNVERIFIED_SNAPSHOT',reason:'Stored market snapshot is malformed or does not match this NFL game.'};
 const age=Math.max(0,now-at),fresh=age<=NFL_SGP_SNAPSHOT_TTL_MS;
 const cards=Array.isArray(raw.sgps?.Analytics)?raw.sgps.Analytics:[];
 // Read only already-verified quotes saved by the internal paid-provider route.
 // A public model, stale saved odds, or a quote for the wrong tier cannot pass.
 const bookQuotes=fresh?['DraftKings','FanDuel'].flatMap(book=>
  (Array.isArray(raw.sgps?.[book])?raw.sgps[book]:[]).flatMap(q=>{
   const risk=String(q?.risk||''),odds=q?.actualSgpOdds,
    legs=Array.isArray(q?.legs)?q.legs:[],quotedMs=Date.parse(q?.quotedAt||'');
   const expected=risk==='Small'?4:risk==='Medium'?5:
    risk==='Nuke'?(legs.length>=5&&legs.length<=7?legs.length:null):null;
   if(q?.book!==book||q?.combinedBookQuoteVerified!==true||
      q?.publishable!==true||q?.bookVerificationPending!==false||
      !Number.isSafeInteger(odds)||odds<=0||classifyNflSgpOdds(odds)!==risk||
      expected===null||legs.length!==expected||Number(q?.requiredLegs)!==expected||
      !Number.isFinite(quotedMs)||quotedMs>now||now-quotedMs>NFL_SGP_SNAPSHOT_TTL_MS||
      quotedMs>at+60_000)return [];
   return [{book,risk,americanOdds:odds,netProfitOnTen:Number((odds/10).toFixed(2)),
    quotedAt:new Date(quotedMs).toISOString()}];
  })
 ):[];

 const tiers=risks.map(risk=>{
  const s=cards.find(x=>x.risk===risk),legs=Array.isArray(s?.legs)?s.legs:[],
   ready=Boolean(s&&s.tierAssessment?.compositionOk!==false&&
      legs.length>0&&legs.length>=Number(s.requiredLegs||0));
  const safeNukeEvidence=risk==='Nuke'&&fresh&&s?.nukeEvidence?
   Object.fromEntries(['rosterCandidateRows','roleEligibleRows','supportedCeilingRows',
    'uniqueEligibleAthletes','supportedYardageRows','distinctYardageMarkets','distinctMarkets']
    .map(k=>[k,Math.max(0,Math.min(100,Math.floor(Number(s.nukeEvidence[k])||0)))])):null;
  if(safeNukeEvidence)
   safeNukeEvidence.blocker=String(s.nukeEvidence.blocker||'UNKNOWN').slice(0,70);
  return{risk,status:!fresh?'STALE':ready?'MODEL_CANDIDATE':'NOT_READY',
   ...(safeNukeEvidence?{nukeEvidence:safeNukeEvidence}:{}),
   legCount:fresh&&ready?legs.length:0,
   reason:!fresh?'Snapshot is older than 15 minutes: request a new pregame refresh.':
     ready?'Model-only SGP candidate; no sportsbook-issued combined quote has been verified.':
     String(s?.reason||s?.tierAssessment?.reason||
        'No complete high-usage, diverse-yardage model candidate was built.').slice(0,230),
   sportsbookCombinedOddsVerified:bookQuotes.some(q=>q.risk===risk)};
 });
 const role=raw.validation?.dayAheadRoleChecks||{};
 const roleKeys=['sampled','excludedOtherMatchups','eligibleByExistingRole',
  'projectedHighUsageRoles','projectedDepthChartQb1','roleRebuiltFromRoster',
  'missingSeasonUsage','missingRosterOrGameIdentity',
  'blockedInjuryOrQuestionable','unconfirmedQuarterback','missingCurrentGameRole'];
 const roleSummary=Object.fromEntries(roleKeys.map(key=>[
  key,Math.max(0,Math.min(10000,Number(role[key])||0))]));
 const categories=Object.fromEntries(['passing','rushing','receiving','receptions','td']
   .map(cat=>[cat,Array.isArray(raw.categories?.[cat])?
     raw.categories[cat].length:0]));
 const review=raw.matchupEvidence;
 const matchupAudit=fresh&&review?.status==='BILATERAL_EVIDENCE'?
  {status:'BILATERAL_EVIDENCE',
   sides:(Array.isArray(review.sides)?review.sides:[]).slice(0,2).map(x=>({
    offense:String(x.offenseTeam||'').slice(0,8),
    opponentDefense:String(x.defenseTeam||'').slice(0,8),
    offenseSampleGames:Math.max(0,Math.min(30,Number(x.offenseSampleGames)||0)),
    defenseSampleGames:Math.max(0,Math.min(30,Number(x.defenseSampleGames)||0)),
    evidenceQuality:['COMPLETED_GAME_SAMPLE','LIMITED','MISSING'].includes(x.evidenceQuality)?
     x.evidenceQuality:'MISSING'})),
   tiers:risks.map(risk=>{
    const x=(Array.isArray(review.risks)?review.risks:[]).find(r=>r.risk===risk);
    const allowed=new Set(['LIMITED_COMPLETED_GAME_SAMPLE','INJURY_ELIGIBILITY_UNVERIFIED',
     'OFFENSE_DEFENSE_EVIDENCE_MISSING','GAME_IDENTITY_UNVERIFIED',
     'INCOMPLETE_MODEL_COMPOSITION']);
    return {risk,status:x?.status==='MODEL_REVIEW_READY'?
     'MODEL_REVIEW_READY': 'REVIEW_OR_PASS',
     holdReasons:(Array.isArray(x?.holdReasons)?x.holdReasons:[])
      .filter(r=>allowed.has(r)).slice(0,5),
     bookmakerPriceVerified:bookQuotes.some(q=>q.risk===risk)};
   }),note:'Read-only model quality review, independent of verified combined bookmaker quotes.'}:
  {status:!fresh?'STALE':'MATCHUP_EVIDENCE_MISSING',
   sides:[],tiers:[],note:'No current two-direction model review saved.'};
 return{
  status:!fresh?'STALE':bookQuotes.length?'BOOK_QUOTED_PARTIAL':tiers.some(x=>x.status==='MODEL_CANDIDATE')?'MODEL_ONLY':'NOT_READY',
  checkedAt:new Date(at).toISOString(),ageMinutes:Math.round(age/60000),
  matchup:{home:raw.home||null,away:raw.away||null}, // optional; no guessing
  roleEvidenceSource:String(raw.validation?.dayAheadRoleSource||'UNAVAILABLE').slice(0,100),
  roleSummary,playerModelRows:categories,
  injuryEligibilityChecked:raw.validation?.injuryEligibilityChecked===true,
  blockedPlayerCount:Math.max(0,Number(raw.validation?.blockedPlayerCount)||0),
  sportsbookCombinedOddsVerified:bookQuotes.length>0,bookQuotes,
  bookPricing:nflSavedBookQuoteDiagnostics(raw,{fresh,verifiedQuotes:bookQuotes}),
  matchupAudit,
  injuryReportObservations:fresh&&raw.validation?.injuryEligibilityChecked===true?
   (Array.isArray(raw.validation.injuryEvidence)?raw.validation.injuryEvidence:[])
    .slice(0,100).reduce((a,x)=>{
     const status=String(x?.status||'UNKNOWN').toUpperCase();
     if(['OUT','QUESTIONABLE','DOUBTFUL','INACTIVE','IR','SUSPENDED'].includes(status))
      a[status]=(a[status]||0)+1;
     return a;
    },{}):{},
  analyticsAvailable:raw.analyticsAvailable===true,
  tiers,note:'Read-only saved evidence. A model candidate is not a sportsbook quote; a verified saved quote is not a placed bet and may change before placement.'
 };
}
export async function nflSgpReadinessFromBlob({date,gameId,listBlobs=list,fetchBlob=fetch,now=Date.now()}={}){
 const path=nflSgpSnapshotPath(date,gameId);
 if(!path)return{httpStatus:400,result:{ok:false,error:'invalid_date_or_game_id'}};
 try{
  const r=await listBlobs({prefix:path,limit:5});
  const blob=(r?.blobs||[]).find(x=>x.pathname===path);
  if(!blob)return{httpStatus:200,result:{ok:true,gameId,date,status:'PENDING_SNAPSHOT',
   reason:'No saved market model for this game/date and current model version. Build is not yet confirmed.',
   sportsbookCombinedOddsVerified:false,tiers:risks.map(risk=>({risk,status:'PENDING',legCount:0}))}};
  const response=await fetchBlob(blob.url,{cache:'no-store',signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw Error('snapshot_object_not_readable');
  const result=nflSgpSnapshotReadiness(await response.json(),{gameId,now});
  return{httpStatus:result.status==='UNVERIFIED_SNAPSHOT'?503:200,
    result:{ok:result.status!=='UNVERIFIED_SNAPSHOT',gameId,date,...result}};
 }catch{
  return{httpStatus:503,result:{ok:false,gameId,date,status:'SNAPSHOT_STORAGE_UNAVAILABLE',
   reason:'Existing Vercel Blob snapshot could not be retrieved. No model picks are verified.',
   sportsbookCombinedOddsVerified:false}};
 }
}
