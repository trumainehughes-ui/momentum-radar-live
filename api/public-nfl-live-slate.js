import nflLiveHandler from './nfl-live.js';
import {publicLiveTouchdowns} from './public-nfl-live.js';

const ESPN_SCOREBOARD='https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
export const config={maxDuration:45};
const MAX_GAMES=24,CONCURRENCY=4;
const isDate=x=>/^\d{4}-\d{2}-\d{2}$/.test(String(x||''))&&
 Number.isFinite(Date.parse(String(x)+'T12:00:00Z'));
const abbrev=x=>String(x||'').replace(/[^A-Za-z0-9 ]/g,'').slice(0,38);
const gameState=x=>{
 const state=String(x?.status?.type?.state||x?.competitions?.[0]?.status?.type?.state||'').toLowerCase();
 const desc=String(x?.status?.type?.description||x?.competitions?.[0]?.status?.type?.description||'');
 return state==='post'||/final|postponed/i.test(desc)?'FINAL':
  state==='in'||/in progress|halftime|end of/i.test(desc)?'LIVE':'SCHEDULED';
};
const resultScore=x=>{
 const n=Number(x);
 return x!==null&&x!==undefined&&String(x)!==''&&Number.isInteger(n)&&n>=0&&n<=250?n:null;
};
// Keep every NFL game from the selected calendar date (including finals).
export function nflLiveSlateGames(payload){
 const events=Array.isArray(payload?.events)?payload.events:[];
 return events.slice(0,MAX_GAMES).flatMap(ev=>{
  const gameId=String(ev?.id||''),c=ev?.competitions?.[0];
  if(!/^\d{7,12}$/.test(gameId)||!c)return[];
  const teams=c.competitors||[];
  const away=teams.find(x=>x.homeAway==='away');
  const home=teams.find(x=>x.homeAway==='home');
  if(!home?.team||!away?.team)return[];
  const toTeam=x=>({abbr:abbrev(x.team.abbreviation).slice(0,5),
   name:abbrev(x.team.displayName||x.team.shortDisplayName||x.team.abbreviation),
   score:resultScore(x.score)});
  return[{gameId,status:gameState(ev),
   statusDetail:abbrev(ev?.status?.type?.shortDetail||c?.status?.type?.shortDetail||'').slice(0,56),
   kickoff:String(ev?.date||'').slice(0,36),away:toTeam(away),home:toTeam(home)}];
 });
}
export async function readNflLiveGame(gameId,gameHandler=nflLiveHandler){
 let code=200,received=null;
 const res={setHeader(){return this},status(n){code=n;return this},
  json(payload){received=payload;return payload}};
 try{
  await gameHandler({method:'GET',query:{gameId}},res);
  if(code!==200||received?.ok!==true)return null;
  const safe=publicLiveTouchdowns(received,gameId);
  return safe.ok===true?safe:null;
 }catch{return null}
}
function dayEastern(now=Date.now()){
 return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',
  year:'numeric',month:'2-digit',day:'2-digit'}).format(now)
  .replace(/(\d{2})\/(\d{2})\/(\d{4})/,'$3-$1-$2');
}
export async function buildNflLiveSlate({date,fetcher=fetch,gameHandler=nflLiveHandler,now=Date.now()}={}){
 if(!isDate(date))throw Error('invalid_date');
 const response=await fetcher(ESPN_SCOREBOARD+'?dates='+date.replaceAll('-','')+'&limit=100',
  {cache:'no-store',signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('nfl_scoreboard_unavailable');
 const scoreboard=await response.json();
 const games=nflLiveSlateGames(scoreboard);
 const rows=new Array(games.length);
 let next=0;
 await Promise.all(Array.from({length:Math.min(CONCURRENCY,games.length)},async()=>{
  while(next<games.length){
   const idx=next++,g=games[idx];
   if(g.status==='SCHEDULED'){
    rows[idx]={...g,touchdowns:[],touchdownCount:0,sourceStatus:'NOT_STARTED'};
    continue;
   }
   const report=await readNflLiveGame(g.gameId,gameHandler);
   rows[idx]=report?{...g,touchdowns:report.touchdowns,
    touchdownCount:report.touchdowns.length,sourceStatus:'VERIFIED_SCORING_PLAYS',
    fetchedAt:report.fetchedAt}:{...g,touchdowns:[],
    touchdownCount:null,sourceStatus:'SCORING_FEED_UNAVAILABLE'};
  }
 }));
 const touchdowns=rows.reduce((n,x)=>n+(x.touchdownCount||0),0);
 const unavailable=rows.filter(x=>x.sourceStatus==='SCORING_FEED_UNAVAILABLE').length;
 return{ok:true,date,coverage:unavailable?'PARTIAL':'COMPLETE',
  fetchedAt:new Date(now).toISOString(),source:'ESPN_OFFICIAL_SCORING_PLAYS',
  totals:{games:rows.length,touchdowns,scoringGames:rows.filter(x=>x.touchdownCount>0).length,
   live:rows.filter(x=>x.status==='LIVE').length,final:rows.filter(x=>x.status==='FINAL').length,
   upcoming:rows.filter(x=>x.status==='SCHEDULED').length,unavailable},
  games:rows};
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','public, s-maxage=20, must-revalidate');
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
 const date=String(req.query?.date||dayEastern());
 if(!isDate(date))return res.status(400).json({ok:false,error:'invalid_date'});
 const requested=Date.parse(date+'T12:00:00Z'),current=Date.now();
 if(requested<current-90*86400000||requested>current+32*86400000)
  return res.status(400).json({ok:false,error:'date_outside_live_score_window'});
 try{return res.status(200).json(await buildNflLiveSlate({date}))}
 catch{return res.status(503).json({ok:false,error:'nfl_live_slate_temporarily_unavailable'})}
}
