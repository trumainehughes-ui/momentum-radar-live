// Read-only, event-scoped ESPN Core game roster starter evidence.
// Team roster memberships and pregame projections do NOT prove a starter.
// This source is NOT an official NFL/NBA inactive confirmation or a bookmaker.
const ROOT='https://sports.core.api.espn.com/v2/sports/';
const LEAGUES={nfl:'football',nba:'basketball'};
const ts=x=>Date.parse(String(x||''));
const str=x=>String(x??'').trim();
export function espnCorePlayerId(row){
 const inline=str(row?.playerId||row?.athleteId||row?.athlete?.id);
 if(/^\d{2,16}$/.test(inline))return inline;
 const ref=str(row?.athlete?.$ref||row?.athleteRef||'');
 // Accept only known ESPN Core athlete references; never follow player URLs.
 const m=ref.match(/^https?:\/\/sports\.core\.api\.espn\.com\/v2\/sports\/(?:football|basketball)\/leagues\/(?:nfl|nba)\/seasons\/\d{4}\/athletes\/(\d{2,16})(?:\?.*)?$/);
 return m?.[1]||null;
}
export function parseEspnEventStarters(raw,{league,gameId,teamId,team,checkedAt}={}){
 if(!LEAGUES[league]||!/^\d{7,12}$/.test(str(gameId))||
  !/^\d{1,6}$/.test(str(teamId))||!/^[A-Z]{2,4}$/.test(str(team))||
  !Number.isFinite(ts(checkedAt)))return[];
 const entries=Array.isArray(raw?.items)?raw.items:
  Array.isArray(raw?.entries)?raw.entries:[];
 const out=[],seen=new Set();
 for(const row of entries.slice(0,130)){
  const id=espnCorePlayerId(row);
  // A missing flag is NOT equivalent to true. Ignore invalid entries.
  if(!id||seen.has(id)||row?.starter!==true||
   row?.active!==true||row?.valid===false||row?.didNotPlay===true)continue;
  seen.add(id);
  out.push({playerId:id,team,teamId:str(teamId),gameId:str(gameId),
   starterStatus:'CONFIRMED_STARTER',starterVerified:true,
   checkedAt,source:'ESPN_CORE_GAME_ROSTER_STARTER_FLAG',
   confirmedBy:'ESPN_GAME_SCOPED_ROSTER',officialInactivesVerified:false});
 }
 return out;
}
export async function fetchEspnEventStarters({league,gameId,competitors,now=Date.now(),
 fetchJson=async(url)=>{
  const r=await fetch(url,{cache:'no-store',
   signal:AbortSignal.timeout(4500),headers:{accept:'application/json'}});
  if(!r.ok)throw Error('espn_core_http_'+r.status);
  return r.json();
 }}={}){
 if(!LEAGUES[league]||!/^\d{7,12}$/.test(str(gameId))||
   !Array.isArray(competitors))return{checked:false,source:'ESPN_CORE_GAME_ROSTER',
    starters:[],teamsChecked:0,reason:'INVALID_GAME_OR_TEAMS'};
 const teams=competitors.map(x=>({
  teamId:str(x?.team?.id||x?.teamId),
  team:str(x?.team?.abbreviation||x?.abbr).toUpperCase()
 })).filter(x=>/^\d{1,6}$/.test(x.teamId)&&/^[A-Z]{2,4}$/.test(x.team));
 if(teams.length!==2||new Set(teams.map(x=>x.teamId)).size!==2)
  return{checked:false,source:'ESPN_CORE_GAME_ROSTER',starters:[],
   teamsChecked:0,reason:'TWO_TEAM_IDENTITY_NOT_CONFIRMED'};
 const checkedAt=new Date(now).toISOString();
 const results=await Promise.all(teams.map(async t=>{
  const url=ROOT+LEAGUES[league]+'/leagues/'+league+
   '/events/'+gameId+'/competitions/'+gameId+
   '/competitors/'+t.teamId+'/roster?limit=120';
  try{
   const response=await fetchJson(url);
   const success=Array.isArray(response?.items)||Array.isArray(response?.entries);
   const entries=Array.isArray(response?.items)?response.items:Array.isArray(response?.entries)?response.entries:[];
   const explicitStarterRows=entries.filter(row=>row?.starter===true);
   const starterFieldPresent=entries.filter(row=>Object.prototype.hasOwnProperty.call(row||{},'starter')).length;
   const activeFieldPresent=entries.filter(row=>Object.prototype.hasOwnProperty.call(row||{},'active')).length;
   const explicitActiveStarterRows=explicitStarterRows.filter(row=>row?.active===true);
   const starters=parseEspnEventStarters(response,{league,gameId,teamId:t.teamId,team:t.team,checkedAt});
   const reason=!success?'UNRECOGNIZED_ROSTER_RESPONSE':
    entries.length===0?'EMPTY_EVENT_ROSTER':
    explicitStarterRows.length===0?'NO_EXPLICIT_STARTER_FLAGS':
    explicitActiveStarterRows.length===0?'STARTERS_LACK_ACTIVE_FLAGS':
    starters.length===0?'STARTER_IDS_OR_ELIGIBILITY_UNRESOLVED':'STARTER_FLAGS_READ';
   return{team:t.team,success,starters,reason,rows:entries.length,
    starterFieldPresent,activeFieldPresent,
    explicitStarterRows:explicitStarterRows.length,explicitActiveStarterRows:explicitActiveStarterRows.length};
  }catch{return{team:t.team,success:false,starters:[],reason:'EVENT_ROSTER_FETCH_FAILED'};}
 }));
 const complete=results.every(r=>r.success),starters=results.flatMap(r=>r.starters);
 const count=Object.fromEntries(results.map(r=>[r.team,r.starters.length]));
 return{checked:complete,source:'ESPN_CORE_GAME_ROSTER',
  checkedAt,starters,teamsChecked:results.filter(r=>r.success).length,
  starterCounts:count,
  teamReasons:Object.fromEntries(results.map(r=>[r.team,r.reason])),
  teamRowDiagnostics:Object.fromEntries(results.map(r=>[r.team,{rows:r.rows||0,
   starterFieldPresent:r.starterFieldPresent||0,activeFieldPresent:r.activeFieldPresent||0,
   explicitStarterRows:r.explicitStarterRows||0,explicitActiveStarterRows:r.explicitActiveStarterRows||0}])),
  startersConfirmed:complete&&results.every(r=>
   r.starters.length>=(league==='nba'?5:1)),
  officialInactivesVerified:false,
  reason:!complete?'EVENT_ROSTER_INCOMPLETE':starters.length===0?
   'NO_EXPLICIT_GAME_STARTER_FLAGS':'GAME_SCOPED_STARTER_FLAGS_READ'};
}

/**
 * Independent ESPN game-summary box-score evidence. Pregame lineups are only
 * confirmed when the event itself explicitly marks five starters per team.
 * Generic roster membership and predicted lineups never qualify.
 */
export function parseEspnSummaryStarters(summary,{gameId,checkedAt}={}){
 const competitors=summary?.header?.competitions?.[0]?.competitors||[];
 if(str(summary?.header?.id)!==str(gameId)||!Number.isFinite(ts(checkedAt)))
  return {checked:false,starters:[],startersConfirmed:false,reason:'SUMMARY_GAME_IDENTITY_UNVERIFIED',source:'ESPN_GAME_SUMMARY'};
 const teams=new Map(competitors.map(c=>[str(c?.team?.id),str(c?.team?.abbreviation).toUpperCase()]));
 const groups=summary?.boxscore?.players||[];
 const starters=[],seen=new Set();
 for(const group of groups){
  const teamId=str(group?.team?.id),team=teams.get(teamId);
  if(!team)continue;
  for(const stat of group?.statistics||[]){
   for(const row of stat?.athletes||[]){
    const id=espnCorePlayerId(row);
    if(row?.starter!==true||row?.active===false||!id||seen.has(id)||
       row?.didNotPlay===true)continue;
    seen.add(id);
    starters.push({playerId:id,team,teamId,gameId:str(gameId),
     starterStatus:'CONFIRMED_STARTER',starterVerified:true,
     checkedAt,source:'ESPN_GAME_SUMMARY_EXPLICIT_STARTER_FLAG',
     confirmedBy:'ESPN_GAME_SUMMARY',officialInactivesVerified:false});
   }
  }
 }
 const counts=Object.fromEntries([...teams.values()].map(t=>[t,starters.filter(s=>s.team===t).length]));
 return {checked:true,starters,starterCounts:counts,
  startersConfirmed:teams.size===2&&[...teams.values()].every(t=>counts[t]===5),
  reason:starters.length?'SUMMARY_EXPLICIT_STARTER_FLAGS':'SUMMARY_HAS_NO_EXPLICIT_STARTER_FLAGS',
  source:'ESPN_GAME_SUMMARY',checkedAt};
}
