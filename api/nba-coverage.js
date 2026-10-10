import {parseNbaScoreboard} from '../lib/nba-data-model.js';
import {nbaBuildCoverage,NBA_COVERAGE_MAX_GAMES} from '../lib/nba-slate-coverage.js';
const ENDPOINT='https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';
const iso=x=>{
 const s=String(x||'');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return null;
 const d=new Date(s+'T12:00:00Z');
 return !Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==s?null:s;
};
const today=()=>{
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
  timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'
 }).formatToParts(new Date()).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
 return [p.year,p.month,p.day].join('-');
};
export default async function handler(req,res){
 res.setHeader('Cache-Control','public, s-maxage=30, must-revalidate');
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
 const date=iso(req.query?.date||today());
 if(!date)return res.status(400).json({ok:false,error:'invalid_date'});
 // A bounded public status endpoint; it must not turn arbitrary historical
 // date ranges into a broad ESPN/Blob crawler.
 const offset=(Date.parse(date+'T12:00:00Z')-Date.parse(today()+'T12:00:00Z'))/86400000;
 if(offset< -2||offset>30)return res.status(400).json({ok:false,error:'date_outside_readiness_window'});
 try{
  const response=await fetch(ENDPOINT+'?dates='+date.replaceAll('-','')+'&limit=100',{
   cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('nba_scoreboard_'+response.status);
  const slate=parseNbaScoreboard(await response.json(),date);
  const coverage=await nbaBuildCoverage(slate.games);
  return res.status(200).json({ok:true,date,source:'ESPN scoreboard + saved Vercel Blob pregame snapshots',
   mode:'READ_ONLY',gameLimit:NBA_COVERAGE_MAX_GAMES,summary:coverage.summary,
   games:coverage.games,checkedAt:new Date().toISOString(),
   note:'Model-only SGP readiness is not a verified book quote; injuries and starters remain source-dependent. No paid sports API calls or AI requests made.'});
 }catch(e){
  console.warn('nba_coverage_unavailable',{reason:String(e?.message||e).slice(0,100)});
  return res.status(503).json({ok:false,error:'nba_coverage_unavailable',
   note:'The ESPN schedule or readiness source could not be verified. No fabricated SGPs are shown.'});
 }
}
