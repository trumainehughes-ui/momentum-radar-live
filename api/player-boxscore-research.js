import {getSportsDataConfig,validateSportsResearchEvidence} from '../lib/sports-data-registry.js';
// Historical game boxscore adapter; sourced from ESPN, not sportsbook offers.
const ROUTES={NBA:'basketball/nba',NFL:'football/nfl',MLB:'baseball/mlb'};
export default async function handler(req,res){
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});}
 const league=String(req.query?.league||'').toUpperCase();
 if(!ROUTES[league]||!getSportsDataConfig(league).enabled)return res.status(400).json({ok:false,error:'LEAGUE_NOT_ENABLED'});
 const gameId=String(req.query?.gameId||'').trim();
 if(!/^\d{5,12}$/.test(gameId))return res.status(400).json({ok:false,error:'INVALID_GAME_ID'});
 try{
  const url='https://site.api.espn.com/apis/site/v2/sports/'+ROUTES[league]+'/summary?event='+gameId;
  const response=await fetch(url,{signal:AbortSignal.timeout(7000),headers:{accept:'application/json'}});
  if(!response.ok)throw Error('UPSTREAM_'+response.status);
  const payload=await response.json();
  const box=payload.boxscore;
  if(!box?.players?.length)return res.status(404).json({ok:false,error:'BOXSCORE_NOT_AVAILABLE',league,gameId});
  const records=box.players.flatMap(team=>(team.statistics||[]).flatMap(group=>
   (group.athletes||[]).map(entry=>({
    teamId:team.team?.id,teamName:team.team?.displayName,
    playerId:entry.athlete?.id,playerName:entry.athlete?.displayName,
    category:group.name||group.displayName||null,
    statLabels:group.labels||[],stats:entry.stats||[]
   }))
  ));
  // ESPN NBA uses per-team statistics; NFL uses category groupings.
  // Normalize both without assuming a particular league's display shape.
  if(!records.length)return res.status(404).json({ok:false,error:'PLAYER_STATS_NOT_AVAILABLE',league,gameId});
  return res.status(200).json({ok:true,league,gameId,source:'espn',records,
   validation:validateSportsResearchEvidence(league,{source:'espn',
    observedAt:new Date().toISOString(),records}),sportsbookVerified:false});
 }catch(e){return res.status(503).json({ok:false,league,gameId,error:'BOXSCORE_SOURCE_UNAVAILABLE',
  detail:String(e?.message||'unknown').slice(0,80),sportsbookVerified:false});}
}
