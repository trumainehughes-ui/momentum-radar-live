import {parseNbaScoreboard} from '../lib/nba-data-model.js';
const ESPN='https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';
const iso=x=>/^\d{4}-\d{2}-\d{2}$/.test(String(x))?String(x):null;
function etDate(){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',
   year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
 return p.year+'-'+p.month+'-'+p.day;
}
function plusDay(date,n){
 const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);
}
async function scoreboard(date){
 const r=await fetch(ESPN+'?dates='+date.replaceAll('-','')+'&limit=100',
  {cache:'no-store',signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error('espn_nba_scoreboard_'+r.status);
 return parseNbaScoreboard(await r.json(),date);
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','public, s-maxage=60, must-revalidate');
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
 const date=req.query?.date?iso(req.query.date):etDate();
 if(!date)return res.status(400).json({ok:false,error:'invalid_date'});
 try{
  let data=await scoreboard(date);
  // Today with no games: show the next scheduled slate, but never silently
  // substitute a different date when the user explicitly selected one.
  if(!req.query?.date&&!data.games.length){
   for(let n=1;n<=2;n++){const d=await scoreboard(plusDay(date,n));if(d.games.length){data=d;break}}
  }
  return res.status(200).json(data);
 }catch(e){
  console.warn('nba_schedule_unavailable',{reason:String(e?.message||e).slice(0,100)});
  return res.status(503).json({ok:false,error:'nba_schedule_unavailable',
    note:'ESPN NBA schedule could not be verified. No games or props were invented.'});
 }
}
