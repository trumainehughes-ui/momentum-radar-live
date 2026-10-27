import {normalizePlayerBoxscoreRecord} from '../lib/player-stat-normalizer.js';
import {rollingPlayerAverages} from '../lib/player-rolling-averages.js';
import {opponentDefensiveAllowances} from '../lib/opponent-defensive-allowances.js';
import {comparePlayerToDefense} from '../lib/player-defense-comparison.js';
const routes={NBA:'basketball/nba',NFL:'football/nfl',MLB:'baseball/mlb'};
const statMap={NBA:{points:'PTS',rebounds:'REB',assists:'AST'},NFL:{passingYards:'YDS',rushingYards:'YDS',receivingYards:'YDS'},MLB:{hits:'H',homeRuns:'HR'}};
const categoryMap={passingYards:'passing',rushingYards:'rushing',receivingYards:'receiving'};
async function json(url){const r=await fetch(url,{signal:AbortSignal.timeout(6500),headers:{accept:'application/json'}});if(!r.ok)throw Error('UPSTREAM_'+r.status);return r.json();}
function numericRows(box,league,gameId,gameDate){
 const rows=[];
 for(const team of box?.players||[]){
  for(const group of team.statistics||[]){
   for(const athlete of group.athletes||[]){
    rows.push(normalizePlayerBoxscoreRecord({
     league,gameId,gameDate,gameStatus:'STATUS_FINAL',
     teamId:String(team.team?.id||''),teamName:team.team?.displayName,
     playerId:String(athlete.athlete?.id||''),playerName:athlete.athlete?.displayName,
     position:athlete.athlete?.position?.abbreviation|| (league==='NFL'&&group.name==='passing'?'QB':null),
     category:group.name||group.displayName||null,
     statLabels:group.labels||[],stats:athlete.stats||[]
    }));
   }
  }
 }
 return rows;
}
export default async function handler(req,res){
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});}
 const league=String(req.query?.league||'').toUpperCase();
 const playerId=String(req.query?.playerId||''),opponentId=String(req.query?.opponentId||'');
 const stat=String(req.query?.stat||'');
 const dates=String(req.query?.dates||'').split(',').filter(Boolean);
 if(!routes[league]||!statMap[league]?.[stat])return res.status(400).json({ok:false,error:'INVALID_LEAGUE_OR_STAT'});
 if(!/^\d{1,12}$/.test(playerId)||!/^\d{1,12}$/.test(opponentId))
  return res.status(400).json({ok:false,error:'INVALID_PLAYER_OR_OPPONENT'});
 if(!dates.length||dates.length>4||dates.some(d=>!/^\d{8}$/.test(d)))
  return res.status(400).json({ok:false,error:'REQUIRE_1_TO_4_DATES_YYYYMMDD'});
 try{
  const scoreboards=await Promise.all(dates.map(date=>json('https://site.api.espn.com/apis/site/v2/sports/'+routes[league]+'/scoreboard?dates='+date)));
  const events=scoreboards.flatMap(s=>s.events||[]).filter(e=>e.status?.type?.completed===true);
  const unique=[...new Map(events.map(e=>[e.id,e])).values()].slice(0,16);
  const results=await Promise.allSettled(unique.map(async e=>{
   const box=await json('https://site.api.espn.com/apis/site/v2/sports/'+routes[league]+'/summary?event='+e.id);
   const competitors=e.competitions?.[0]?.competitors||[];
   return {event:e,competitors,rows:numericRows(box.boxscore,league,e.id,e.date)};
  }));
  const fulfilled=results.filter(r=>r.status==='fulfilled').map(r=>r.value);
  const failures=results.length-fulfilled.length;
  const key=statMap[league][stat],category=categoryMap[stat];
  const playerRows=fulfilled.flatMap(g=>g.rows.filter(r=>r.playerId===playerId&&(!category||r.category===category))
   .map(r=>({...r,category:stat, numericStats:{[stat]:r.numericStats[key]}}))
   .filter(r=>Number.isFinite(r.numericStats[stat])));
  const playerTeamIds=new Set(fulfilled.flatMap(g=>g.rows.filter(r=>r.playerId===playerId).map(r=>r.teamId)));
  if(playerTeamIds.has(opponentId))return res.status(400).json({ok:false,error:'OPPONENT_IS_PLAYER_TEAM'});
  const playerPosition=playerRows.find(r=>r.position)?.position||null;
  const allowanceRows=fulfilled.flatMap(g=>{
   const defenders=g.competitors.find(c=>String(c.team?.id)===opponentId);
   if(!defenders)return [];
   const offense=g.competitors.find(c=>String(c.team?.id)!==opponentId);
   if(!offense)return [];
   if(!playerPosition)return [];
   const opponentPlayers=g.rows.filter(r=>r.teamId===String(offense.team?.id)&&r.position===playerPosition&&(!category||r.category===category));
   const sum=opponentPlayers.reduce((n,r)=>n+(Number.isFinite(r.numericStats[key])?r.numericStats[key]:0),0);
   if(!opponentPlayers.some(r=>Number.isFinite(r.numericStats[key])))return [];
   return [{defenseTeamId:opponentId,gameId:g.event.id,gameDate:g.event.date,
    gameStatus:'STATUS_FINAL',allowedStats:{[stat]:sum}}];
  });
  const player=rollingPlayerAverages(playerRows)[0];
  const defense=opponentDefensiveAllowances(allowanceRows)[0];
  const comparison=comparePlayerToDefense(player,defense,stat);
  return res.status(200).json({ok:true,league,playerId,opponentId,stat,
   player:player||null,defense:defense||null,comparison,
   gamesExamined:fulfilled.length,upstreamFailures:failures,positionMatched:playerPosition,source:'espn',
   sportsbookVerified:false,warning:'Position-matched historical opponent allowance, not a projected stat, probability or sportsbook market'});
 }catch(e){return res.status(503).json({ok:false,error:'MATCHUP_RESEARCH_UNAVAILABLE',detail:String(e.message).slice(0,90)});}
}
