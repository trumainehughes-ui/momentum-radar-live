// Read-only public-market research for one scheduled NFL game.
// Never fetch user-provided URLs, never place bets, never create a book quote.
import {
 DKN_NFL_PROPS_URL,FANDUEL_NFL_PUBLIC_URL,publicBookResearchReport
} from '../lib/nfl-public-sportsbook-observer.js';

const PUBLIC_SOURCE_TIMEOUT=6500;
const BASE='https://momentum-radar-live.vercel.app';
const read=async(url,timeout=PUBLIC_SOURCE_TIMEOUT)=>{
 const r=await fetch(url,{cache:'no-store',
  headers:{Accept:'text/html,application/xhtml+xml'},
  signal:AbortSignal.timeout(timeout)});
 if(!r.ok)return{status:'HTTP_'+r.status,html:null};
 const type=r.headers.get('content-type')||'';
 if(!/text\/html|application\/xhtml/i.test(type))
  return{status:'NON_HTML_RESPONSE',html:null};
 const text=await r.text();
 return{status:'FETCH_OK',html:text.slice(0,2_000_000)};
};
export default async function handler(req,res){
 res.setHeader('Cache-Control','public,s-maxage=300,stale-while-revalidate=60');
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
 const date=String(req.query?.date||''),gameId=String(req.query?.gameId||'');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z'))||
  !/^\d{7,12}$/.test(gameId))
  return res.status(400).json({ok:false,error:'date_and_game_required'});
 const dateTime=Date.parse(date+'T12:00:00Z'),now=Date.now();
 if(dateTime<now-86400_000||dateTime>now+14*86400_000)
  return res.status(400).json({ok:false,error:'outside_active_schedule'});
 try{
  const resp=await fetch(BASE+'/api/nfl-schedule?date='+encodeURIComponent(date),{
   cache:'no-store',signal:AbortSignal.timeout(8500)});
  if(!resp.ok)throw Error('schedule_http_'+resp.status);
  const slate=await resp.json();
  const game=slate?.games?.find(g=>String(g.gameId)===gameId);
  if(slate?.ok!==true||slate.date!==date||!game)
   return res.status(404).json({ok:false,error:'game_not_on_verified_slate'});
  const home=String(game.home?.abbr||''),away=String(game.away?.abbr||'');
  if(!/^[A-Z]{2,4}$/.test(home)||!/^[A-Z]{2,4}$/.test(away))
   return res.status(503).json({ok:false,error:'team_identity_missing'});
  const [dk,fd]=await Promise.all([
   read(DKN_NFL_PROPS_URL).catch(e=>({status:'FETCH_FAILED',html:null})),
   read(FANDUEL_NFL_PUBLIC_URL).catch(e=>({status:'FETCH_FAILED',html:null}))
  ]);
  // The FanDuel public website often renders odds through client-side
  // interfaces. Don't promote arbitrary page text to a current priced prop.
  const fdStatus=fd.status==='FETCH_OK'?'NO_MACHINE_READABLE_MARKETS':fd.status;
  const report=publicBookResearchReport({dkHtml:dk.html,dkStatus:dk.status,
   fdStatus,date,home,away,now:Date.now()});
  res.setHeader('X-Momentum-Public-Market-Source',report.status);
  return res.status(200).json({...report,gameId,checkedAt:new Date().toISOString()});
 }catch{
  res.setHeader('Cache-Control','private,no-store');
  return res.status(503).json({ok:false,error:'public_market_schedule_unavailable',
   note:'Saved matchup and sportsbook verification continue independently.'});
 }
}
