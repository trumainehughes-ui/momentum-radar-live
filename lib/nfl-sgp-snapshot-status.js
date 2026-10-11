// Read-only NFL SGP snapshot diagnostics: zero ESPN, sportsbook and AI
// requests. The snapshots already exist from /api/nfl-markets. Do NOT
// regenerate market data just to answer a readiness question.
import {list} from '@vercel/blob';

export const NFL_SGP_SNAPSHOT_PREFIX='momentum-nfl-markets/v2/';
export const NFL_SGP_SNAPSHOT_SCHEMA='v87-sgo-backup-only-nuke-roster-adaptive-1-game-identity-2-day-ahead-roles-v4-game-scope-qb1';
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
 const tiers=risks.map(risk=>{
  const s=cards.find(x=>x.risk===risk),legs=Array.isArray(s?.legs)?s.legs:[],
   ready=Boolean(s&&s.tierAssessment?.compositionOk!==false&&
      legs.length>0&&legs.length>=Number(s.requiredLegs||0));
  return{risk,status:!fresh?'STALE':ready?'MODEL_CANDIDATE':'NOT_READY',
   legCount:fresh&&ready?legs.length:0,
   reason:!fresh?'Snapshot is older than 15 minutes: request a new pregame refresh.':
     ready?'Model-only SGP candidate; no sportsbook-issued combined quote has been verified.':
     String(s?.reason||s?.tierAssessment?.reason||
        'No complete high-usage, diverse-yardage model candidate was built.').slice(0,230),
   sportsbookCombinedOddsVerified:false};
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
 return{
  status:!fresh?'STALE':tiers.some(x=>x.status==='MODEL_CANDIDATE')?'MODEL_ONLY':'NOT_READY',
  checkedAt:new Date(at).toISOString(),ageMinutes:Math.round(age/60000),
  matchup:{home:raw.home||null,away:raw.away||null}, // optional; no guessing
  roleEvidenceSource:String(raw.validation?.dayAheadRoleSource||'UNAVAILABLE').slice(0,100),
  roleSummary,playerModelRows:categories,
  injuryEligibilityChecked:raw.validation?.injuryEligibilityChecked===true,
  blockedPlayerCount:Math.max(0,Number(raw.validation?.blockedPlayerCount)||0),
  sportsbookCombinedOddsVerified:false,analyticsAvailable:raw.analyticsAvailable===true,
  tiers,note:'Read-only stored model evidence: MODEL_ONLY is not a placed or sportsbook-quoted parlay.'
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
