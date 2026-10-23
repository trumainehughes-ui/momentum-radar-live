import {nbaBestEdgeParlay} from '../lib/nba-best-edge-parlay.js';
import {nbaReadPregame} from './nba-health.js';
// The public endpoint does not accept client-supplied odds or player forecasts.
// ESPN consensus lines are optional; missing lines result in NO_QUALIFYING_PARLAY.
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
 const date=String(req.query?.date||new Date().toISOString().slice(0,10));
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return res.status(400).json({error:'INVALID_DATE'});
 try{
  const url='https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates='+date.replaceAll('-','');
  const response=await fetch(url,{signal:AbortSignal.timeout(9000),cache:'no-store'});
  if(!response.ok)throw Error('SCOREBOARD_UNAVAILABLE');
  const data=await response.json();
  const scheduled=(data.events||[]).filter(e=>String(e.status?.type?.state||'').toLowerCase()==='pre');
  const games=await Promise.all(scheduled.map(async e=>{
   const c=e.competitions?.[0]||{},odds=c.odds?.[0]||{};
   const snapshot=await nbaReadPregame(String(e.id)).catch(()=>null);
   const spread=odds.spread??odds.details?.match(/[-+]\d+(?:\.\d+)?/)?.[0];
   return {gameId:String(e.id),status:'SCHEDULED',kickoff:e.date,
    total:odds.overUnder??null,spread:spread??null,
    playerProjections:snapshot?.playerProjections||[],
    injuryCheckedAt:snapshot?.injuryCheckedAt||null,gameChanges:snapshot?.gameChanges||[]};
  }));
  const result=nbaBestEdgeParlay(games,{mode:'VERIFIED_MARKET'});
  // Model projections are useful research even without a verified bookmaker
  // offer. Never mix them into publishable sportsbook legs.
  const research=games.flatMap(g=>(g.playerProjections||[])
   .filter(p=>['points','rebounds','assists','threes','pra'].includes(p.category)&&
    Number.isFinite(Number(p.projection))&&Number(p.projection)>=0&&
    !/\\b(OUT|INACTIVE|DOUBTFUL|SUSPENDED)\\b/i.test(String(p.injuryStatus||'')))
   .map(p=>({gameId:g.gameId,playerId:p.playerId||null,
    name:p.name||p.playerName||null,team:p.team||null,category:p.category,
    projection:Number(p.projection),sampleGames:p.sampleGames||0,
    sampleSource:p.sampleSource||null,starterVerified:p.starterVerified===true,
    marketVerified:false,modelOnly:true,
    basis:p.basis||'Historical box-score projection, not a sportsbook line'})))
   .filter(p=>p.name).sort((a,b)=>b.sampleGames-a.sampleGames)
   .slice(0,40);
  return res.status(200).json({ok:true,...result,date,checkedAt:new Date().toISOString(),
   gamesInspected:games.length,research,disclaimer:'Only confirmed starters with two fresh, independently sourced active sportsbook lines qualify. No offers are invented; missing sportsbook data blocks selections.'});
 }catch(e){
  console.error('nba_edge_screening_failed',String(e?.message||e).slice(0,160));
  return res.status(200).json({ok:true,status:'NO_QUALIFYING_PARLAY',legs:[],
   qualifyingGames:[],gamesInspected:0,date,
   sourceStatus:'SOURCE_UNAVAILABLE',reason:'GAME_SCREENING_SOURCE_UNAVAILABLE',
   note:'The current NBA screening feed could not be verified; no sportsbook picks have been generated.'});
 }
}
