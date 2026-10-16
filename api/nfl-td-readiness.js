// On-demand read-only Sunday Anytime TD completeness and freshness audit.
// Calls existing schedule/ranking endpoints; NEVER calls player prop APIs or AI.
import {nflSundayTdReadiness} from '../lib/nfl-sunday-td-readiness.js';
const BASE='https://momentum-radar-live.vercel.app';
const fetchJson=async(path)=>{
 const r=await fetch(BASE+path,{cache:'no-store',signal:AbortSignal.timeout(14500)});
 if(!r.ok)throw Error('source_http_'+r.status);
 const body=await r.json();
 if(body?.ok!==true)throw Error('source_response_unverified');
 return body;
};
export default async function handler(req,res){
 res.setHeader('Cache-Control','public, s-maxage=60, stale-while-revalidate=30');
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
 const date=String(req.query?.date||'');
 const stamp=Date.parse(date+'T12:00:00Z');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(stamp)||
    new Date(stamp).toISOString().slice(0,10)!==date)
  return res.status(400).json({ok:false,error:'valid_date_required'});
 const now=Date.now();
 if(stamp<now-3*86400_000||stamp>now+20*86400_000)
  return res.status(400).json({ok:false,error:'date_outside_active_window'});
 try{
  const query='?date='+encodeURIComponent(date);
  const [schedule,rankings]=await Promise.all([
   fetchJson('/api/nfl-schedule'+query),
   fetchJson('/api/nfl-slate-rankings'+query)
  ]);
  if(schedule.date!==date||rankings.date!==date)
   return res.status(503).json({ok:false,error:'source_date_mismatch'});
  const report=nflSundayTdReadiness({date,games:schedule.games,rankings,now});
  return res.status(200).json({ok:true,...report,checkedAt:new Date(now).toISOString()});
 }catch(e){
  res.setHeader('Cache-Control','private, no-store');
  return res.status(503).json({ok:false,
   error:'readiness_sources_unavailable',
   note:'Do not assume missing or complete coverage while ESPN or saved snapshot sources cannot be read.'});
 }
}
