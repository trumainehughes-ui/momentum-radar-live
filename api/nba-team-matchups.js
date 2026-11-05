// League-wide NBA offense-vs-defense matchup research from completed ESPN box scores.
// Research data only: no sportsbook odds, probabilities, or fabricated NBA.com values.
const BASE='https://site.api.espn.com/apis/site/v2/sports/basketball/nba/';
const fetchJson=async path=>{const r=await fetch(BASE+path,{signal:AbortSignal.timeout(9000),cache:'no-store'});if(!r.ok)throw Error('ESPN_'+r.status);return r.json();};
// Independent NBA.com official opponent-stat cross-check; ESPN remains available if blocked.
async function nbaOfficialOpponentStats(){
 const params=new URLSearchParams({Season:'2026-27',SeasonType:'Regular Season',MeasureType:'Opponent',PerMode:'PerGame',PlusMinus:'N',PaceAdjust:'N',Rank:'N',LeagueID:'00',LastNGames:'0',Month:'0',OpponentTeamID:'0',TeamID:'0'});
 try{
  const response=await fetch('https://stats.nba.com/stats/leaguedashteamstats?'+params,{cache:'no-store',signal:AbortSignal.timeout(5500),headers:{Accept:'application/json',Referer:'https://www.nba.com/',Origin:'https://www.nba.com','User-Agent':'Mozilla/5.0','x-nba-stats-origin':'stats','x-nba-stats-token':'true'}});
  if(!response.ok)throw Error('NBA_COM_HTTP_'+response.status);
  const body=await response.json(),sets=body.resultSets||body.resultSet||[];
  const table=Array.isArray(sets)?sets.find(x=>x.name==='LeagueDashTeamStats')||sets[0]:sets;
  const headers=table?.headers||[],rows=table?.rowSet||[];
  if(!headers.includes('TEAM_NAME')||!headers.includes('OPP_PTS'))throw Error('NBA_COM_SCHEMA_UNAVAILABLE');
  return {status:'VERIFIED',teams:rows.map(row=>Object.fromEntries(headers.map((h,i)=>[h,row[i]])))};
 }catch(error){return {status:'UNAVAILABLE',reason:String(error?.message||error).slice(0,90),teams:[]};}
}
const dateKey=d=>d.toISOString().slice(0,10).replaceAll('-','');
const safeNumber=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
const avg=(sum,n)=>n?Number((sum/n).toFixed(2)):null;
const teamsFrom=event=>event.competitions?.[0]?.competitors||[];
function record(box,event){
 const teams=teamsFrom(event);
 if(teams.length!==2)return [];
 const entries=teams.map(t=>({id:String(t.team?.id||''),name:t.team?.displayName,abbreviation:t.team?.abbreviation,score:safeNumber(t.score),players:[],total:{points:0,rebounds:0,assists:0,threes:0},positions:{}}));
 for(const side of box?.boxscore?.players||[]){
  const target=entries.find(t=>t.id===String(side.team?.id));
  if(!target)continue;
  for(const group of side.statistics||[]){
   const labels=(group.labels||[]).map(x=>String(x).toUpperCase());
   for(const athlete of group.athletes||[]){
    const stats=athlete.stats||[];
    const value=key=>{const i=labels.indexOf(key);return i>=0?safeNumber(stats[i]):0;};
    const threes=(()=>{const v=stats[labels.indexOf('3PT')];return typeof v==='string'?safeNumber(v.split('-')[0]):value('3PM');})();
    const p={position:String(athlete.athlete?.position?.abbreviation||'UNKNOWN').toUpperCase(),points:value('PTS'),rebounds:value('REB'),assists:value('AST'),threes};
    // ESPN NBA box scores can have multiple statistical groups; retain only traditional lines.
    if(!labels.includes('PTS')||!labels.includes('REB'))continue;
    target.players.push(p);
    for(const k of ['points','rebounds','assists','threes'])target.total[k]+=p[k];
    const position=target.positions[p.position]??={points:0,rebounds:0,assists:0,threes:0};
    for(const k of Object.keys(position))position[k]+=p[k];
   }
  }
 }
 return entries.map((team,i)=>({team,opponent:entries[1-i]}));
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','public, s-maxage=1800, stale-while-revalidate=3600');
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});
 const days=Math.min(45,Math.max(2,Number(req.query?.days)||30));
 const end=req.query?.date?new Date(String(req.query.date)+'T12:00:00Z'):new Date();
 if(!Number.isFinite(end.getTime()))return res.status(400).json({ok:false,error:'INVALID_DATE'});
 const dates=Array.from({length:days},(_,i)=>{const d=new Date(end);d.setUTCDate(d.getUTCDate()-i-1);return dateKey(d);});
 try{
  const boards=await Promise.allSettled(dates.map(d=>fetchJson('scoreboard?dates='+d+'&limit=100')));
  const events=[...new Map(boards.filter(x=>x.status==='fulfilled').flatMap(x=>x.value.events||[])
   .filter(e=>e.status?.type?.completed===true).map(e=>[e.id,e])).values()].slice(0,160);
  const results=[];
  for(let i=0;i<events.length;i+=24){
   const batch=await Promise.allSettled(events.slice(i,i+24).map(async e=>record(await fetchJson('summary?event='+e.id),e)));
   results.push(...batch.filter(x=>x.status==='fulfilled').flatMap(x=>x.value));
  }
  const profiles=new Map();
  for(const {team,opponent} of results){
   if(!team.id||!opponent.id)continue;
   const p=profiles.get(team.id)??{teamId:team.id,team:team.name,abbreviation:team.abbreviation,games:0,offense:{points:0,rebounds:0,assists:0,threes:0},defenseAllowed:{points:0,rebounds:0,assists:0,threes:0},allowedByPosition:{}};
   p.games++;
   for(const k of Object.keys(p.offense)){p.offense[k]+=team.total[k];p.defenseAllowed[k]+=opponent.total[k];}
   for(const [pos,values] of Object.entries(opponent.positions)){
    const dest=p.allowedByPosition[pos]??={points:0,rebounds:0,assists:0,threes:0,games:0};dest.games++;
    for(const k of Object.keys(values))dest[k]+=values[k];
   }
   profiles.set(team.id,p);
  }
  const teams=[...profiles.values()].map(p=>({...p,offense:Object.fromEntries(Object.entries(p.offense).map(([k,v])=>[k,avg(v,p.games)])),defenseAllowed:Object.fromEntries(Object.entries(p.defenseAllowed).map(([k,v])=>[k,avg(v,p.games)])),allowedByPosition:Object.fromEntries(Object.entries(p.allowedByPosition).map(([pos,v])=>[pos,{games:v.games,...Object.fromEntries(['points','rebounds','assists','threes'].map(k=>[k,avg(v[k],v.games)]))}]))})).sort((a,b)=>a.team.localeCompare(b.team));
  const nbaCom=await nbaOfficialOpponentStats();
  const normalizeName=name=>String(name||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const officialByName=new Map(nbaCom.teams.map(t=>[normalizeName(t.TEAM_NAME),t]));
  for(const team of teams){
   const official=officialByName.get(normalizeName(team.team));
   team.nbaComOpponentStats=official?{points:Number(official.OPP_PTS),rebounds:Number(official.OPP_REB),assists:Number(official.OPP_AST),threes:Number(official.OPP_FG3M),source:'NBA.com official opponent stats',verified:true}:null;
  }
  // League baseline and defensive ranks for each verified position and market.
  // Rank 1 = fewest allowed; rank 30 = most allowed (when all teams covered).
  const positions=['PG','SG','SF','PF','C'],markets=['points','rebounds','assists','threes'];
  const leaguePositionAverages=Object.fromEntries(positions.map(pos=>[pos,Object.fromEntries(markets.map(market=>{
   const available=teams.map(t=>t.allowedByPosition[pos]).filter(v=>v&&v.games>=1&&Number.isFinite(v[market]));
   return [market,available.length?avg(available.reduce((sum,v)=>sum+v[market],0),available.length):null];
  }))]));
  for(const team of teams){
   team.positionRanks=Object.fromEntries(positions.map(pos=>[pos,Object.fromEntries(markets.map(market=>{
    const current=team.allowedByPosition[pos]?.[market];
    const eligible=teams.filter(t=>Number.isFinite(t.allowedByPosition[pos]?.[market]));
    if(!Number.isFinite(current)||eligible.length<2)return [market,null];
    return [market,{rank:1+eligible.filter(t=>t.allowedByPosition[pos][market]<current).length,
     teamsCompared:eligible.length,highestAllowedRank:eligible.length}];
   }))]));
  }
  // Position-only defensive research signals. These are not player picks or hit rates.
  for(const team of teams){
   team.positionExploits=positions.flatMap(position=>markets.map(market=>{
    const sample=team.allowedByPosition[position],baseline=leaguePositionAverages[position]?.[market];
    const allowed=sample?.[market],games=sample?.games||0;
    if(games<5||!Number.isFinite(allowed)||!Number.isFinite(baseline)||baseline<=0)return null;
    const relativeEdge=Number(((allowed-baseline)/baseline).toFixed(3));
    const score=Math.round(Math.max(0,Math.min(100,50+relativeEdge*100)));
    return {position,market,allowed,leagueAverage:baseline,games,relativeEdge,score,
      rank:team.positionRanks[position]?.[market]||null,
      evidence:'DEFENSE_ONLY_NOT_PLAYER_PROJECTION'};
   }).filter(Boolean)).sort((a,b)=>b.relativeEdge-a.relativeEdge);
  }
  const id=String(req.query?.teamId||'');
  const homeId=String(req.query?.homeId||''),awayId=String(req.query?.awayId||'');
  const home=teams.find(t=>t.teamId===homeId),away=teams.find(t=>t.teamId===awayId);
  const matchups=home&&away&&homeId!==awayId?{
   home:{team:home.team,offense:home.offense,opponentDefense:away.defenseAllowed,opponentNbaComStats:away.nbaComOpponentStats,
    opponentPositionAllowances:away.allowedByPosition,opponentPositionRanks:away.positionRanks,opponentPositionExploits:away.positionExploits,offenseGames:home.games,defenseGames:away.games},
   away:{team:away.team,offense:away.offense,opponentDefense:home.defenseAllowed,opponentNbaComStats:home.nbaComOpponentStats,
    opponentPositionAllowances:home.allowedByPosition,opponentPositionRanks:home.positionRanks,opponentPositionExploits:home.positionExploits,offenseGames:away.games,defenseGames:home.games},
   sampleQuality:Math.min(home.games,away.games)>=5?'LIMITED_EARLY_SEASON':'INSUFFICIENT_FOR_STRONG_PREDICTION',
   sportsbookVerified:false
  }:null;
  // Bounded opponent-context factors. Never convert to probability or a bookmaker offer.
  const leagueMean=teams.length?teams.reduce((n,t)=>n+(t.offense.points||0),0)/teams.length:0;
  const factor=(off,allowed)=>leagueMean>0&&off>0&&allowed>0?
   Number(Math.max(0.94,Math.min(1.06,Math.pow(off/leagueMean,0.15)*Math.pow(allowed/leagueMean,0.30))).toFixed(3)):1;
  if(matchups){
   matchups.home.matchupFactor=factor(home.offense.points,away.defenseAllowed.points);
   matchups.away.matchupFactor=factor(away.offense.points,home.defenseAllowed.points);
   matchups.projectionAdjustmentStatus=Math.min(home.games,away.games)>=3?'LIMITED_HISTORICAL_CONTEXT':'NEUTRAL_UNTIL_MORE_GAMES';
   if(matchups.projectionAdjustmentStatus!=='LIMITED_HISTORICAL_CONTEXT'){
    matchups.home.matchupFactor=1;matchups.away.matchupFactor=1;
   }
  }
  return res.status(200).json({ok:true,source:'ESPN completed NBA game box scores',nbaComCrossCheck:nbaCom.status,nbaComFailureReason:nbaCom.status==='UNAVAILABLE'?nbaCom.reason:null,researchOnly:true,leaguePositionAverages,windowDays:days,completedGames:events.length,teamsCovered:teams.length,completeLeagueCoverage:teams.length===30,teams:id?teams.filter(t=>t.teamId===id):teams,matchups,notes:['Per-game averages, not per-100-possession ratings','Position allowances are aggregate production of all opposing players at that position per game','Small early-season samples must not be treated as confident predictions','NBA.com advanced ratings require a separate verified data feed']});
 }catch(e){return res.status(503).json({ok:false,error:'NBA_TEAM_MATCHUP_UNAVAILABLE',detail:String(e.message).slice(0,120)});}
}
