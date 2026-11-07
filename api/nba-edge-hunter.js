import {parseNbaScoreboard} from '../lib/nba-data-model.js';
import {nbaReadPregame} from './nba-health.js';
import {researchVerifiedNbaEdgeHunter} from '../lib/nba-edge-hunter-verified-adapter.js';
import {collectDirectSportsbookEvidence} from '../lib/direct-sportsbook-collector.js';
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
    total:null,spread:null,players:(snapshot?.playerProjections||[]).filter(p=>p.starterVerified===true&&p.playerId&&['points','rebounds','assists','threes'].includes(p.category)).map(p=>({playerId:String(p.playerId),name:p.name,team:p.team,category:p.category,prediction:Number(p.projection),last10:Array.isArray(p.historicalValues)?p.historicalValues.slice(0,10):[],starterVerified:true,injuryBlocked:/\b(OUT|INACTIVE|DOUBTFUL|SUSPENDED)\b/i.test(String(p.injuryStatus||p.availability||''))})),historicalProjections:snapshot?.playerProjections?.length||0,
    researchCandidates:(snapshot?.playerProjections||[]).filter(p=>['points','rebounds','assists','threes'].includes(p.category)&&Number.isFinite(Number(p.projection))&&Number(p.projection)>0).map(p=>({name:p.name||p.playerName,team:p.team,category:p.category,projection:Number(p.projection),sampleGames:p.sampleGames,starterVerified:p.starterVerified===true})).slice(0,60),
    bookTotalsVerified:false,bookPlayerMarketsVerified:false};
  }));
  // No structured official-book offers are collected yet. Keep this explicit;
  // the verified adapter is the sole eligibility boundary for future ingestion.
  const sourceCheck=await collectDirectSportsbookEvidence({sport:'nba',gameId:'SLATE'});
  const verifiedOffers=sourceCheck.offers;
  const selection=researchVerifiedNbaEdgeHunter({games,offers:verifiedOffers});
  // Always offer a clearly marked historical projection preview when available.
  // Do not label these as four verified picks: totals, spreads and prop lines are missing.
  // Keep a useful, clearly unverified four-player research preview visible:
  // two players per game, never represented as a qualifying Edge Hunter slip.
  const previewGames=games.map(g=>({...g,candidates:(g.researchCandidates||[])
   .filter(p=>Number(p.sampleGames)>=1&&p.starterVerified===true)
   .sort((a,b)=>b.projection-a.projection).slice(0,2)}))
   .filter(g=>g.candidates.length===2).slice(0,2);
  const researchPreview=previewGames.flatMap(g=>g.candidates.map(p=>({...p,
   gameId:g.gameId,game:g.away+' @ '+g.home,marketVerified:false,
   starterStatus:'VERIFIED',researchOnly:true})));
  const missingInputs=[
   ...(games.some(g=>!g.totalEvidence)?['verified_game_totals']:[]),
   ...(games.some(g=>!g.spreadEvidence)?['verified_point_spreads']:[]),
   ...(!verifiedOffers.length?['verified_player_prop_lines']:[]),
   'last_ten_market_results','confirmed_starters','book_native_combined_sgp_quote'];
  return res.status(200).json({ok:true,date,source:'ESPN NBA scoreboard and stored pregame research',
   status:selection.status,selection,researchPreview,slateGames:games.length,
   snapshotProjectionCount:games.reduce((n,g)=>n+g.historicalProjections,0),
   verifiedBookOfferCount:verifiedOffers.length,marketIngestionStatus:sourceCheck.status,
   sportsbookSourceChecks:sourceCheck.attempts,
   missingInputs,
   note:'Edge Hunter is not publishable until current book-sourced markets and game-specific player evidence are verified.'});
 }catch(e){
  console.warn('nba_edge_hunter_unavailable',{reason:String(e?.message||e).slice(0,100)});
  return res.status(503).json({ok:false,error:'nba_edge_hunter_source_unavailable',
   note:'No NBA Edge Hunter legs were invented when upstream evidence was unavailable.'});
 }
}
