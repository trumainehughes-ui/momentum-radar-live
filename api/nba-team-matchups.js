// League-wide NBA offense-vs-defense matchup research from completed ESPN box scores.
// Research data only: no sportsbook odds, probabilities, or fabricated NBA.com values.
const BASE='https://site.api.espn.com/apis/site/v2/sports/basketball/nba/';
const fetchJson=async path=>{const r=await fetch(BASE+path,{signal:AbortSignal.timeout(9000),cache:'no-store'});if(!r.ok)throw Error('ESPN_'+r.status);return r.json();};
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
 const days=Math.min(10,Math.max(2,Number(req.query?.days)||5));
 const end=req.query?.date?new Date(String(req.query.date)+'T12:00:00Z'):new Date();
 if(!Number.isFinite(end.getTime()))return res.status(400).json({ok:false,error:'INVALID_DATE'});
 const dates=Array.from({length:days},(_,i)=>{const d=new Date(end);d.setUTCDate(d.getUTCDate()-i-1);return dateKey(d);});
 try{
  const boards=await Promise.allSettled(dates.map(d=>fetchJson('scoreboard?dates='+d+'&limit=100')));
  const events=[...new Map(boards.filter(x=>x.status==='fulfilled').flatMap(x=>x.value.events||[])
   .filter(e=>e.status?.type?.completed===true).map(e=>[e.id,e])).values()].slice(0,70);
  const results=[];
  for(let i=0;i<events.length;i+=12){
   const batch=await Promise.allSettled(events.slice(i,i+12).map(async e=>record(await fetchJson('summary?event='+e.id),e)));
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
  const id=String(req.query?.teamId||'');
  const homeId=String(req.query?.homeId||''),awayId=String(req.query?.awayId||'');
  const home=teams.find(t=>t.teamId===homeId),away=teams.find(t=>t.teamId===awayId);
  const matchups=home&&away&&homeId!==awayId?{
   home:{team:home.team,offense:home.offense,opponentDefense:away.defenseAllowed,
    opponentPositionAllowances:away.allowedByPosition,offenseGames:home.games,defenseGames:away.games},
   away:{team:away.team,offense:away.offense,opponentDefense:home.defenseAllowed,
    opponentPositionAllowances:home.allowedByPosition,offenseGames:away.games,defenseGames:home.games},
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
  return res.status(200).json({ok:true,source:'ESPN completed NBA game box scores',nbaComCrossCheck:'NOT_VERIFIED',researchOnly:true,windowDays:days,completedGames:events.length,teamsCovered:teams.length,completeLeagueCoverage:teams.length===30,teams:id?teams.filter(t=>t.teamId===id):teams,matchups,notes:['Per-game averages, not per-100-possession ratings','Position allowances are aggregate production of all opposing players at that position per game','Small early-season samples must not be treated as confident predictions','NBA.com advanced ratings require a separate verified data feed']});
 }catch(e){return res.status(503).json({ok:false,error:'NBA_TEAM_MATCHUP_UNAVAILABLE',detail:String(e.message).slice(0,120)});}
}
