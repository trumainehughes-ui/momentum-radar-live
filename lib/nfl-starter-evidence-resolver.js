// Conservative, game-scoped NFL starter evidence. Depth charts are projections,
// never confirmation. ESPN is not represented as an independent NFL.com source.
import {nflPublishedWeeklyGameReport} from './nfl-weekly-source.js';
const positions=new Set(['QB','RB','WR','TE']);
const blocked=new Set(['OUT','INACTIVE','IR','INJURED RESERVE','DOUBTFUL','SUSPENDED','PUP','NFI']);
const norm=s=>String(s??'').toLowerCase().normalize('NFKD').replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g,'').replace(/[^a-z0-9]/g,'');
const team=s=>({JAC:'JAX',WSH:'WAS',LA:'LAR'}[String(s??'').toUpperCase()]||String(s??'').toUpperCase());
const status=s=>String(s??'').trim().toUpperCase();
export async function resolveVerifiedNflStarters({gameId,date,home,away,fetcher=fetch,now=Date.now()}={}){
 const id=String(gameId??'');
 if(!/^\d{7,12}$/.test(id)||!/^\d{4}-\d{2}-\d{2}$/.test(String(date??'')))throw Error('invalid_game_scope');
 const url='https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event='+encodeURIComponent(id);
 const response=await fetcher(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw Error('espn_summary_http_'+response.status);
 const data=await response.json();
 const comp=data?.header?.competitions?.[0];
 const competitors=Array.isArray(comp?.competitors)?comp.competitors:[];
 const found=competitors.map(c=>({abbr:team(c?.team?.abbreviation),id:String(c?.team?.id??''),side:c?.homeAway}));
 const h=found.find(x=>x.side==='home')?.abbr,a=found.find(x=>x.side==='away')?.abbr;
 if(String(data?.header?.id??id)!==id||!h||!a||h===a||
   (home&&team(home)!==h)||(away&&team(away)!==a))throw Error('espn_game_team_mismatch');
 const report=nflPublishedWeeklyGameReport({gameId:id,date,teams:[h,a]});
 const holds=[];
 for(const entry of report?.entries||[])holds.push({...entry,team:team(entry.team),source:report.source||'NFL_PUBLISHED_WEEKLY_REPORT'});
 for(const group of data?.injuries||[])for(const entry of group?.injuries||[])holds.push({
  playerId:String(entry?.athlete?.id??''),name:entry?.athlete?.displayName,
  team:team(group?.team?.abbreviation),status:entry?.status||entry?.type?.description,
  source:'ESPN_INJURY_REPORT'});
 const roster=[];
 for(const group of data?.rosters||[])for(const entry of group?.roster||[]){
  const athlete=entry?.athlete||{},name=athlete.displayName||athlete.fullName;
  const position=status(entry?.position?.abbreviation||athlete?.position?.abbreviation);
  if(!name||!positions.has(position))continue;
  const t=team(group?.team?.abbreviation);
  if(t!==h&&t!==a)continue;
  const p={playerId:String(athlete.id??''),name,team:t,position};
  const state=status(entry?.status?.type?.name||entry?.status?.abbreviation);
  if(entry?.active===false||blocked.has(state))holds.push({...p,status:entry?.active===false?'INACTIVE':state,source:'ESPN_GAME_ROSTER'});
  roster.push({...p,explicitStarter:entry?.starter===true});
 }
 const held=p=>holds.find(x=>team(x.team)===p.team&&
  ((x.playerId&&p.playerId&&String(x.playerId)===p.playerId)||
   (x.name&&norm(x.name)===norm(p.name))||
   (x.aliases||[]).some(alias=>norm(alias)===norm(p.name))));
 const startersByTeam=Object.fromEntries([a,h].map(t=>[t,[]]));
 for(const p of roster){
  const hold=held(p),designation=status(hold?.status);
  const eligible=!hold||(!blocked.has(designation)&&designation!=='QUESTIONABLE');
  const verified=p.explicitStarter&&eligible;
  startersByTeam[p.team].push({...p,starterVerified:verified,
   starterStatus:verified?'CONFIRMED_STARTER':p.explicitStarter?'INJURY_REVIEW_REQUIRED':'ROSTER_UNCONFIRMED',
   injuryStatus:designation||'NOT_REPORTED',recommendationEligible:verified,
   source:'ESPN_GAME_SCOPED_ROSTER'});
 }
 // Depth-chart candidates are useful research context, never verified starters.
 const projectedByTeam=Object.fromEntries([a,h].map(t=>[t,[]]));
 await Promise.all(found.map(async t=>{
  if(!t.id)return;
  try{
   const res=await fetcher('https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/'+encodeURIComponent(t.id)+'/depthcharts',
    {headers:{Accept:'application/json'},signal:AbortSignal.timeout(6500)});
   if(!res.ok)return;
   const json=await res.json();
   for(const block of json?.items||json?.depthchart||[])for(const [key,val] of Object.entries(block?.positions||{})){
    const pos=status(val?.position?.abbreviation||key);
    if(!positions.has(pos))continue;
    for(const [index,slot] of (val?.athletes||[]).entries()){
     const ath=slot?.athlete||slot,name=ath?.displayName||ath?.fullName;
     if(!name)continue;
     const p={playerId:String(ath?.id??''),name,team:t.abbr,position:pos,depthRank:Number(slot?.rank)||index+1};
     if(held(p)||startersByTeam[t.abbr].some(s=>s.playerId&&s.playerId===p.playerId))continue;
     projectedByTeam[t.abbr].push({...p,starterVerified:false,starterStatus:'EXPECTED_STARTER',
      recommendationEligible:false,source:'ESPN_DEPTH_CHART'});
    }
   }
  }catch{/* Optional research-only depth chart unavailable. */}
 }));
 const starters=Object.values(startersByTeam).flat().filter(p=>p.starterVerified);
 return{ok:true,gameId:id,date,home:h,away:a,checkedAt:new Date(now).toISOString(),
  startersConfirmed:starters.length>0&&[h,a].every(t=>startersByTeam[t].some(p=>p.starterVerified)),
  starterVerificationSource:'ESPN_GAME_SCOPED_STARTER_FLAGS',
  starters,startersByTeam,projectedByTeam,promotions:[],
  blockedPlayers:holds.filter(x=>blocked.has(status(x.status))).map(x=>({
   playerId:String(x.playerId??''),name:x.name,team:team(x.team),status:status(x.status),source:x.source}))};
}
