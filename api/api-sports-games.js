import {apiSports} from './_api-sports.js';
const dateOk=x=>/^\d{4}-\d{2}-\d{2}$/.test(String(x||''));
function phase(kickoff,status){
  if(String(status||'').toUpperCase()==='LIVE')return'live';
  const ms=new Date(kickoff||0).getTime()-Date.now();
  if(ms<=30*60000&&ms>-3*3600000)return'final30';
  if(ms<=90*60000&&ms>0)return'final90';
  if(ms<=6*3600000&&ms>0)return'pregame';
  return'normal';
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
  const sport=String(req.query.sport||'nfl').toLowerCase();
  const date=String(req.query.date||new Date().toISOString().slice(0,10));
  const kickoff=String(req.query.kickoff||'');
  const status=String(req.query.status||'');
  if(!['nfl','nba'].includes(sport)||!dateOk(date))return res.status(400).json({ok:false,error:'invalid_request'});
  const p=phase(kickoff,status),critical=['final90','final30'].includes(p);
  try{
    const games=await apiSports({sport,path:'games',query:{date},kind:'schedule',phase:p,priority:critical?'critical':'normal'});
    return res.status(200).json({ok:true,sport,date,phase:p,source:'API-Sports',cache:games.cache,stale:Boolean(games.stale),remaining:games.remaining,budgetUsed:games.budgetUsed,fetchedAt:games.fetchedAt,data:games.data});
  }catch(e){return res.status(503).json({ok:false,sport,date,phase:p,source:'API-Sports',error:String(e.message||e),fetchedAt:new Date().toISOString()})}
}
