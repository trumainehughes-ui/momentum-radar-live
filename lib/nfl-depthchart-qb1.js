// ESPN current team depth charts distinguish expected QB1 from a backup
// with old passing statistics. This is conditional model evidence ONLY.
// A depth-chart rank is not official game-day inactive confirmation.
import {nflCanonTeam} from './nfl-official-injury-feed.js';
const norm=x=>String(x||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
export function nflDepthChartQb1(raw,team){
 const singular=raw?.depthchart;
 const sections=Array.isArray(raw?.depthCharts)?raw.depthCharts:
  Array.isArray(raw?.depthcharts)?raw.depthcharts:
  Array.isArray(raw?.depthchart)?raw.depthchart:
  singular&&typeof singular==='object'?
   (singular.positions?[singular]:
    Object.values(singular).filter(x=>x?.positions)): 
  Array.isArray(raw?.items)?raw.items:[];
 const candidates=[];
 for(const section of sections){
  const positions=section?.positions||{};
  for(const [key,group] of Object.entries(positions)){
   const tag=String(group?.position?.abbreviation||group?.position?.name||key).toUpperCase();
   if(!['QB','QUARTERBACK'].includes(tag.replace(/[^A-Z]/g,'')))continue;
   for(const row of group?.athletes||[]){
    const rank=Number(row?.rank??row?.depth??row?.depthChartRank),
     athlete=row?.athlete||row,rawID=String(athlete?.id||row?.id||''),
     ref=String(athlete?.$ref||row?.$ref||''),
     id=/^\d{3,16}$/.test(rawID)?rawID:
      (ref.match(/\/athletes\/(\d+)(?:\?|$)/)?.[1]||'');
    if(rank!==1||!/^\d{3,16}$/.test(id))continue;
    candidates.push({playerId:id,team:nflCanonTeam(team),rank:1,
     name:athlete?.displayName||athlete?.fullName||'',
     source:'ESPN current team depth chart (expected QB1, NOT an official confirmed starter)'});
   }
  }
 }
 const unique=new Map(candidates.map(x=>[x.playerId,x]));
 // Multiple conflicting QB1s for a team are ambiguous; no candidate.
 return unique.size===1?[...unique.values()][0]:null;
}
export async function nflCurrentGameDepthChartQbs({home,away,teamIdsByAbbr,fetchJson,onDiagnostic}={}){
 if(typeof fetchJson!=='function')return [];
 const teams=[nflCanonTeam(home),nflCanonTeam(away)].filter(Boolean);
 if(teams.length!==2||teams[0]===teams[1])return [];
 const rows=await Promise.all(teams.map(async team=>{
  // ESPN's site v2 depthcharts endpoint documents NUMERIC ESPN team IDs,
  // which are supplied by the selected game's competition competitors.
  // Do not guess a team ID or rely on abbreviation aliases for this route.
  const teamID=String(teamIdsByAbbr?.get?.(team)||'');
  if(!/^\d{1,5}$/.test(teamID)){
   onDiagnostic?.({team,status:'MISSING_NUMERIC_TEAM_ID'});
   return null;
  }
  try{
   const url='https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/'+teamID+'/depthcharts';
   const result=await fetchJson(url);
   const qb=nflDepthChartQb1(result,team);
   const count=Array.isArray(result?.depthCharts)?result.depthCharts.length:
    Array.isArray(result?.depthcharts)?result.depthcharts.length:
    Array.isArray(result?.depthchart)?result.depthchart.length:
    result?.depthchart&&typeof result.depthchart==='object'?
     (result.depthchart.positions?1:Object.values(result.depthchart).filter(x=>x?.positions).length):
    Array.isArray(result?.items)?result.items.length:0;
   onDiagnostic?.({team,teamID,status:qb?'MATCHED_QB1':'NO_QB1_IN_RESPONSE',
    chartCount:count,responseKeys:Object.keys(result||{}).slice(0,8)});
   return qb;
  }catch(e){
   const msg=String(e?.message||'request_unavailable');
   onDiagnostic?.({team,teamID,status:'ESPN_DEPTHCHART_REQUEST_FAILED',
    errorCode:/upstream_\d{3}/.exec(msg)?.[0]||'fetch_failed'});
   return null;
  }
 }));
 return rows.filter(Boolean);
}
export function nflProjectedDepthChartQbEligible(role){
 return role?.recommendationEligible===true&&role?.gameModelOnly===true&&
  role?.starterVerified===false&&role?.qbDepthChartRank===1&&
  role?.qbRosterVerified===true&&
  norm(role?.position)==='QB'&&
  role?.verification?.role?.verified===false;
}
