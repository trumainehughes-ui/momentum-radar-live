import {nflGameInjuryEvidence} from '../lib/nfl-injury-evidence.js';
import {nflWeeklyForGame} from '../lib/nfl-injury-weekly-loader.js';
const ESPN='https://site.api.espn.com/apis/site/v2/sports/football/nfl';
async function load(url){
 const r=await fetch(url,{cache:'no-store',headers:{accept:'application/json'},signal:AbortSignal.timeout(12000)});
 if(!r.ok)throw new Error('espn_http_'+r.status);
 return r.json();
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store, max-age=0');
 res.setHeader('CDN-Cache-Control','private, no-store');
 res.setHeader('Vercel-CDN-Cache-Control','private, no-store');
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
 const gameId=String(req.query.gameId||'');
 if(!/^\d{7,12}$/.test(gameId))return res.status(400).json({ok:false,error:'valid_game_id_required'});
 const checkedAt=new Date().toISOString();
 let summary=null,league=null,errors=[];
 try{summary=await load(ESPN+'/summary?event='+encodeURIComponent(gameId));}
 catch(e){errors.push('summary:'+String(e?.message||e))}
 if(!summary?.header?.competitions?.[0]?.competitors?.length)
  return res.status(503).json({ok:false,gameId,checkedAt,status:'REPORT_UNAVAILABLE',error:'game_summary_unavailable',errors,officialInactivesVerified:false});
 try{league=await load(ESPN+'/injuries');}
 catch(e){errors.push('league:'+String(e?.message||e))}
 const comp=summary.header.competitions[0],competitors=comp.competitors||[];
 const weekly=await nflWeeklyForGame({gameId,summary,competitors});
 const report=nflGameInjuryEvidence({summary,league,weekly,competitors,checkedAt});
 const kickoff=comp.date||summary.header?.competitions?.[0]?.date||null;
 const mins=kickoff&&Number.isFinite(Date.parse(kickoff))?Math.round((Date.parse(kickoff)-Date.now())/60000):null;
 const pregame=mins!==null&&mins<=90&&mins>=-240;
 const refreshSeconds=mins!==null&&mins<=120&&mins>=-240?30:180;
 const refreshMinutes=refreshSeconds/60;
 const rosterSignals=[];
 const rosterGroups=Array.isArray(summary.rosters)?summary.rosters:[];
 const abbrs=new Set(competitors.map(c=>String(c.team?.abbreviation||'').toUpperCase()));
 for(const group of rosterGroups){
  const team=String(group.team?.abbreviation||'').toUpperCase();if(!abbrs.has(team))continue;
  for(const r of group.roster||group.athletes||[]){
   const a=r.athlete||r,id=String(a.id||''),name=a.displayName||a.fullName||'',pos=String(a.position?.abbreviation||'').toUpperCase();
   if(!id&&!name)continue;
   rosterSignals.push({playerId:id,name,team,position:pos,starterReported:r.starter===true||r.isStarter===true,source:'ESPN game roster'});
  }
 }
 rosterSignals.sort((a,b)=>a.team.localeCompare(b.team)||a.playerId.localeCompare(b.playerId));
 return res.status(report.reportAvailable?200:503).json({
  ok:report.reportAvailable,gameId,
  teams:competitors.map(x=>({id:String(x.team?.id||''),abbr:x.team?.abbreviation||'',homeAway:x.homeAway})),
  ...report,kickoff,minutesToKickoff:mins,refreshMinutes,refreshSeconds,
  rosterSignals,rosterSignalsAvailable:rosterGroups.length>0,
  defensiveInjurySignals:(report.injuries||[]).filter(x=>/^(CB|S|SS|FS|DB|LB|ILB|OLB|DE|DT|DL|NT|EDGE)$/.test(x.position||'')),
  teamStrategySignalsVerified:false,
  reportCompleteness:report.weeklyCoverage?'NFL_PUBLISHED_WEEKLY_CROSS_CHECK':'ESPN_ONLY_OFFICIAL_WEEKLY_UNVERIFIED',
  officialInactivesRequired:pregame,
  officialInactivesStatus:pregame?'AWAITING_INDEPENDENT_VERIFICATION':'NOT_YET_VERIFIED',
  sourceHealth:errors.length?errors.join(';'):'ESPN responses received',
  note:report.reportAvailable?'ESPN statuses checked at request time; source publication timestamp may be unknown.':'No verifiable ESPN injury report is available; do not treat zero entries as healthy.'
 });
}
