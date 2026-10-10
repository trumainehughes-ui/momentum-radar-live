import {timingSafeEqual} from 'node:crypto';
import {bdlRefreshDaily,bdlIsoDay} from '../lib/balldontlie-free.js';
function authorized(req,secret){
 if(!secret)return false;
 const expected='Bearer '+secret,actual=String(req.headers?.authorization||'');
 const a=Buffer.from(actual),b=Buffer.from(expected);
 return a.length===b.length&&timingSafeEqual(a,b);
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
 if(!process.env.CRON_SECRET)return res.status(503).json({ok:false,error:'daily_refresh_not_configured'});
 if(!authorized(req,process.env.CRON_SECRET))
  return res.status(401).json({ok:false,error:'cron_auth_required'});
 if(!process.env.BALLDONTLIE_API_KEY)
  return res.status(503).json({ok:false,error:'bdl_key_not_configured'});
 // DATE cannot be supplied by the requester. Only the current Eastern NBA/NFL
 // day is refreshed. The protected cron makes at most four upstream requests.
 const date=bdlIsoDay(new Date());
 try{
  const result=await bdlRefreshDaily(process.env.BALLDONTLIE_API_KEY,{date});
  const errors=result.reports.flatMap(x=>x.errors||[]);
  return res.status(errors.length?207:200).json({
   ok:errors.length===0,date,mode:'free-tier-daily-cache',
   upstreamRequests:result.upstreamRequests,leagues:result.reports,
   note:'ESPN remains primary. No player props, injury data, advanced stats, or sportsbook quotes are sourced from BALLDONTLIE Free.'
  });
 }catch(e){
  console.warn('bdl_daily_refresh_error',{reason:String(e?.message||'unavailable').slice(0,100)});
  return res.status(503).json({ok:false,error:'bdl_daily_refresh_unavailable'});
 }
}
