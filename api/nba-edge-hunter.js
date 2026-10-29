import {parseNbaScoreboard} from '../lib/nba-data-model.js';
import {nbaReadPregame} from './nba-health.js';
import {selectNbaEdgeHunter} from '../lib/nba-edge-hunter.js';
const ESPN='https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';
const iso=x=>/^\d{4}-\d{2}-\d{2}$/.test(String(x))?String(x):null;
const etToday=()=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',
 {timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'})
 .formatToParts(new Date()).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
 return p.year+'-'+p.month+'-'+p.day};
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store, max-age=0');
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
 const date=req.query?.date?iso(req.query.date):etToday();
 if(!date)return res.status(400).json({ok:false,error:'invalid_date'});
 try{
  const response=await fetch(ESPN+'?dates='+date.replaceAll('-','')+'&limit=100',
   {cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('nba_scoreboard_'+response.status);
  const slate=parseNbaScoreboard(await response.json(),date);
  const games=await Promise.all(slate.games.filter(g=>g.status==='SCHEDULED').map(async game=>{
   const snapshot=await nbaReadPregame(game.gameId);
   // ESPN does not supply verified DraftKings/FanDuel totals, spreads or prop offers.
   // Do not relabel ESPN schedule data or model-only projections as bookmaker quotes.
   return {gameId:game.gameId,home:game.home.abbr,away:game.away.abbr,
    total:null,spread:null,players:[],historicalProjections:snapshot?.playerProjections?.length||0,
    bookTotalsVerified:false,bookPlayerMarketsVerified:false};
  }));
  const selection=selectNbaEdgeHunter(games);
  return res.status(200).json({ok:true,date,source:'ESPN NBA scoreboard and stored pregame research',
   status:selection.status,selection,slateGames:games.length,
   snapshotProjectionCount:games.reduce((n,g)=>n+g.historicalProjections,0),
   missingInputs:['verified_game_totals','verified_point_spreads','verified_player_prop_lines',
    'last_ten_market_results','confirmed_starters','book_native_combined_sgp_quote'],
   note:'Edge Hunter is not publishable until current book-sourced markets and game-specific player evidence are verified.'});
 }catch(e){
  console.warn('nba_edge_hunter_unavailable',{reason:String(e?.message||e).slice(0,100)});
  return res.status(503).json({ok:false,error:'nba_edge_hunter_source_unavailable',
   note:'No NBA Edge Hunter legs were invented when upstream evidence was unavailable.'});
 }
}
