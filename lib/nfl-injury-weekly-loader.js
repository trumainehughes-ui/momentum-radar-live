import {nflOfficialWeeklyFromLeague} from './nfl-official-injury-feed.js';
import {nflPublishedWeeklyGameReport} from './nfl-weekly-source.js';
const ESPN='https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
const scoreboardCache=new Map(),SCOREBOARD_TTL=5*60*1000;
const norm=x=>String(x||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
function dayOfGame(comp,summary){
 const kickoff=String(comp?.date||summary?.header?.competitions?.[0]?.date||'');
 return /^\d{4}-\d\d-\d\d/.test(kickoff)?kickoff.slice(0,10):null;
}
function summaryWeek(summary){
 const values=[summary?.week?.number,summary?.header?.week?.number,
  summary?.header?.competitions?.[0]?.week?.number,summary?.header?.week,
  summary?.week];
 for(const val of values){
  const n=Number(val);
  if(Number.isInteger(n)&&n>=1&&n<=22)return n;
 }
 return null;
}
export async function nflResolveOfficialWeek({gameId,summary,fetcher=fetch}={}){
 const c=summary?.header?.competitions?.[0],kickoff=dayOfGame(c,summary);
 const season=Number(summary?.header?.season?.year||summary?.season?.year||kickoff?.slice(0,4));
 const stage=Number(summary?.header?.season?.type||summary?.season?.type||2)===3?'POST':'REG';
 if(!Number.isInteger(season)||season<2020||!kickoff)return null;
 const week=summaryWeek(summary);
 if(week)return{year:season,week,seasonType:stage,source:'ESPN game summary'};
 const day=kickoff.replaceAll('-','');
 const key=day,now=Date.now();
 let snap=scoreboardCache.get(key);
 if(!snap||now-snap.at>SCOREBOARD_TTL){
  try{
   const r=await fetcher(ESPN+'?dates='+day+'&limit=100',{signal:AbortSignal.timeout(12000),headers:{accept:'application/json'}});
   if(!r.ok)throw Error('ESPN_schedule_'+r.status);
   const data=await r.json();
   snap={at:now,data};scoreboardCache.set(key,snap);
  }catch{return null;}
 }
 const match=(snap.data.events||[]).find(e=>String(e.id)===String(gameId));
 const matchedWeek=Number(match?.week?.number||snap.data.week?.number);
 if(!Number.isInteger(matchedWeek)||matchedWeek<1||matchedWeek>22)return null;
 const type=Number(match?.season?.type||2)===3?'POST':'REG';
 return {year:Number(match?.season?.year||season),week:matchedWeek,seasonType:type,source:'ESPN scheduled game'};
}
function combineOfficialAndPinned(auto,pinned){
 if(!auto?.available)return pinned||null;
 if(!pinned)return auto;
 const byName=new Set(auto.entries.map(x=>norm(x.team)+'|'+norm(x.name)));
 for(const row of auto.entries)for(const alias of row.aliases||[])byName.add(norm(row.team)+'|'+norm(alias));
 const extra=pinned.entries.filter(x=>![x.name,...(x.aliases||[])].some(n=>byName.has(norm(x.team)+'|'+norm(n))));
 return {...auto,entries:[...auto.entries,...extra],hasGameDesignations:auto.entries.length+extra.length>0,
  supplementalCount:extra.length,source:extra.length?'NFL.com live weekly page + dated NFL Week 5 published supplement':auto.source,
  supplementarySource:extra.length?pinned.url:null,
  // Unknown publishedAt for live NFL tables; do not invent a timestamp.
  publishedAt:auto.publishedAt,checkedAt:auto.checkedAt,
  provenance:'live_nfl_week_page'};
}
export async function nflWeeklyForGame({gameId='',summary=null,competitors=[],fetcher=fetch}={}){
 const comp=summary?.header?.competitions?.[0],date=dayOfGame(comp,summary);
 const pinned=nflPublishedWeeklyGameReport({gameId,date,teams:competitors});
 const wk=await nflResolveOfficialWeek({gameId,summary,fetcher});
 if(!wk)return pinned;
 const league=await nflOfficialWeeklyFromLeague({...wk,teams:competitors,fetcher});
 return combineOfficialAndPinned(league,pinned);
}
