// NBA pregame projections — *conditional model candidates*, never sportsbook
// odds, confirmed starters, or official game-day inactives.
import {parseNbaGame,nbaNotReadyTiers,NBA_TIERS} from './nba-data-model.js';
const STATS=['points','rebounds','assists','threes','pra'];
const INJURY_BLOCK=/\b(OUT|DOUBTFUL|QUESTIONABLE|INACTIVE|SUSPENDED|DAY.TO.DAY)\b/i;
const round=(x,n=1)=>Number(x.toFixed(n));
const num=x=>x==null||x===''?null:Number.isFinite(Number(x))?Number(x):null;
const norm=x=>String(x||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const status=x=>String(x?.status?.type?.state||x?.competitions?.[0]?.status?.type?.state||
 x?.status?.type?.name||x?.competitions?.[0]?.status?.type?.name||'').toLowerCase();
export function nbaTeamSeasonScheduleUrl(teamId,{seasonYear,seasonType}={}){
 if(!/^\d{1,4}$/.test(String(teamId||'')))throw Error('nba_invalid_team_id');
 if(!Number.isInteger(Number(seasonYear))||Number(seasonYear)<2020||Number(seasonYear)>2100)
  throw Error('nba_invalid_season_year');
 if(![1,2,3].includes(Number(seasonType)))throw Error('nba_invalid_season_type');
 return 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/'+
  encodeURIComponent(teamId)+'/schedule?season='+Number(seasonYear)+
  '&seasontype='+Number(seasonType)+'&limit=100';
}
const notReady=reason=>({status:'NOT_READY',source:'ESPN NBA team rosters + completed game box scores',
    samplesUsed:0,sgps:nbaNotReadyTiers(reason),playerProjections:[],
    sportsbookMarketsVerified:false,combinedSgpOddsVerified:false,aiReviewed:false,reason});
export function nbaCompletedTeamGames(schedule,tipoff,max=3){
 const cutoff=Date.parse(tipoff);
 if(!Number.isFinite(cutoff))return[];
 return (Array.isArray(schedule?.events)?schedule.events:[])
 .filter(e=>/^\d{7,12}$/.test(String(e.id||''))&&
  (status(e)==='post'||/final/i.test(String(e.status?.type?.description||
    e.competitions?.[0]?.status?.type?.description||'')))&&
  Number.isFinite(Date.parse(e.date||e.competitions?.[0]?.date))&&
  Date.parse(e.date||e.competitions?.[0]?.date)<cutoff)
 .sort((a,b)=>Date.parse(b.date||b.competitions?.[0]?.date)-
   Date.parse(a.date||a.competitions?.[0]?.date))
 .slice(0,max).map(e=>String(e.id));
}
export function nbaRosterEvidence(rosters,home,away){
 const all=new Map();
 for(const item of rosters){
  const team=item.team;
  if(![home,away].includes(team))continue;
  const groups=Array.isArray(item.data?.athletes)?item.data.athletes:[];
  const athletes=groups.flatMap(g=>g?.items||g?.athletes||[g]);
  for(const a of athletes){
   const id=String(a.id||a.athlete?.id||''),name=a.displayName||a.fullName||a.athlete?.displayName;
   if(!/^\d{2,14}$/.test(id)||!name)continue;
   const injury=(a.injuries||[]).map(x=>x.status||x.type?.description||x.details?.type||'').join(' | ');
   const rosterStatus=String(a.status?.name||a.status?.type||'').toLowerCase();
   const position=String(a.position?.abbreviation||a.position?.name||a.athlete?.position?.abbreviation||'').toUpperCase();
   all.set(id,{id,name,team,injury,position,active:rosterStatus==='active'||rosterStatus==='',
    statusSource:'ESPN team roster; not confirmed starting five'});
  }
 }
 return all;
}
// Bounded offense-vs-defense adjustment: use only observed FINAL ESPN box
// scores where both teams have enough player scoring rows. With insufficient
// paired evidence the factor remains exactly 1, never an invented advantage.
export function nbaOffenseDefenseEvidence(historical=[],home,away){
 const teams=[home,away],samples=new Map(teams.map(t=>[t,[]]));
 const seen=new Set(),baseline=[];
 for(const h of historical){
  if(h?.status!=='FINAL'||!h?.gameId||seen.has(String(h.gameId)))continue;
  seen.add(String(h.gameId));
  const a=h.matchup?.home?.abbr,b=h.matchup?.away?.abbr;
  if(!a||!b||a===b)continue;
  const score=t=>{
   const rows=(h.players||[]).filter(p=>p.team===t&&Number.isFinite(p.points));
   const total=rows.reduce((n,p)=>n+p.points,0);
   return rows.length>=5&&total>=55?total:null;
  };
  const sa=score(a),sb=score(b);
  if(sa===null||sb===null)continue;
  baseline.push(sa,sb);
  if(samples.has(a))samples.get(a).push({scored:sa,allowed:sb,gameId:h.gameId});
  if(samples.has(b))samples.get(b).push({scored:sb,allowed:sa,gameId:h.gameId});
 }
 const average=v=>v.reduce((a,b)=>a+b,0)/v.length;
 const reference=baseline.length>=4?average(baseline):null,byTeam={};
 const valid=Boolean(reference&&teams.every(t=>(samples.get(t)||[]).length>=2));
 for(const t of teams){
  const games=samples.get(t)||[],opponent=t===home?away:home,
   opponentGames=samples.get(opponent)||[];
  if(!valid){byTeam[t]={factor:1,status:'INSUFFICIENT_COMPLETE_BOX_SCORES',
   games:games.length,opponentDefenseGames:opponentGames.length};continue}
  const offense=average(games.map(g=>g.scored)),
   opponentAllowed=average(opponentGames.map(g=>g.allowed));
  const raw=Math.pow(offense/reference,0.15)*
   Math.pow(opponentAllowed/reference,0.30);
  const factor=Number(Math.min(1.06,Math.max(0.94,raw)).toFixed(3));
  byTeam[t]={factor,status:'HISTORICAL_MODEL_ONLY',games:games.length,
   opponentDefenseGames:opponentGames.length,offensePointsPerGame:Number(offense.toFixed(1)),
   opponentPointsAllowedPerGame:Number(opponentAllowed.toFixed(1)),
   referencePointsPerGame:Number(reference.toFixed(1)),
   opponent,source:'Observed ESPN final-game box scores (not live sportsbook lines)'};
 }
 return{source:'ESPN completed-game offense versus opponent defense',
  status:valid?'HISTORICAL_MODEL_ONLY':'INSUFFICIENT_SAMPLES',byTeam,
  disclaimer:'Capped +/-6% historical context; no live game defensive lineup verification.'};
}

// Derive position-specific opponent allowances only from observed final box scores.
export function nbaDefensePositionEvidence(historical=[],home,away){
 const stats=['points','rebounds','assists','threes'],positions=['PG','SG','SF','PF','C'];
 const byDefense={},leagueSamples={};
 for(const defense of [home,away]){
  const games=new Map();
  for(const h of historical){
   if(h?.status!=='FINAL'||!h?.gameId)continue;
   const teams=[h.matchup?.home?.abbr,h.matchup?.away?.abbr];
   if(!teams.includes(defense))continue;
   const opponent=teams.find(t=>t&&t!==defense);
   if(!opponent)continue;
   const totals={};
   for(const p of h.players||[]){
    if(p.team!==opponent)continue;
    const position=String(p.position||p.pos||'').toUpperCase();
    if(!positions.includes(position))continue;
    const row=totals[position]||(totals[position]={players:0});
    row.players++;
    for(const stat of stats)row[stat]=(row[stat]||0)+(Number(p[stat])||0);
   }
   games.set(String(h.gameId),totals);
  }
  const output={};
  for(const pos of positions){
   const samples=[...games.values()].map(g=>g[pos]).filter(Boolean);
   if(samples.length<2)continue;
   const row={games:samples.length};
   for(const stat of stats){
    row[stat]=round(samples.reduce((s,g)=>s+g[stat],0)/samples.length);
    (leagueSamples[pos+'|'+stat]||(leagueSamples[pos+'|'+stat]=[])).push(...samples.map(g=>g[stat]));
   }
   output[pos]=row;
  }
  byDefense[defense]={positions:output,sampleGames:games.size};
 }
 const leaguePositionAverage={};
 for(const [key,values] of Object.entries(leagueSamples)){
  if(values.length>=4)leaguePositionAverage[key]=round(values.reduce((s,n)=>s+n,0)/values.length);
 }
 return {source:'ESPN completed opponent box scores',status:'OBSERVED_POSITION_ALLOWANCES',byDefense,leaguePositionAverage};
}
export function nbaBuildPregameModels({gameId,home,away,tipoff,gameStatus='SCHEDULED',
 historical=[],roster=new Map(),injuries=[],sampleSource='CURRENT_SEASON',historicalSeason=null,
 offenseDefense=null,defenseVsPosition=null,generatedAt=new Date().toISOString()}){
 if(gameStatus!=='SCHEDULED')return notReady('Game is not scheduled for pregame selections.');
 if(!(roster instanceof Map)||!roster.size)return notReady('Current ESPN team roster is unavailable.');
 const grouped=new Map(),sources=new Set();
 for(const h of historical){
  if(!h||h.status!=='FINAL')continue;
  sources.add(h.gameId);
  for(const p of h.players||[]){
   const person=roster.get(String(p.playerId));
   if(!person||person.team!==p.team||!person.active)continue;
   if(![home,away].includes(p.team))continue;
   const group=grouped.get(p.playerId)||{playerId:p.playerId,name:person.name,team:p.team,games:new Map()};
   if(!group.games.has(h.gameId))group.games.set(h.gameId,p);
   grouped.set(p.playerId,group);
  }
 }
 const restricted=new Set();
 for(const x of injuries){
  if(INJURY_BLOCK.test(String(x.status||''))&&[home,away].includes(x.team))restricted.add(norm(x.name));
 }
 const candidates=[];
 for(const p of grouped.values()){
  const person=roster.get(String(p.playerId));
  if(!person||INJURY_BLOCK.test(person.injury)||restricted.has(norm(p.name)))continue;
  const games=[...p.games.values()];
  if(games.length<2)continue;
  for(const category of STATS){
   const sample=games.map(x=>num(x[category])).filter(Number.isFinite);
   if(sample.length<2)continue;
   const baseProjection=sample.reduce((a,b)=>a+b,0)/sample.length;
   // When the historical sample contains both teams' verified offense and
   // opponent-defense results, apply a small capped matchup adjustment.
   // Otherwise keep the observed player mean unchanged.
   const matchup=offenseDefense?.byTeam?.[p.team]||{factor:1,
    status:'INSUFFICIENT_SAMPLES'};
   // DVP is applied only with observed position and two or more opponent games.
   // Unknown positions or missing league baselines have a neutral multiplier.
   const opponent=p.team===home?away:home;
   const position=String(person.position||person.pos||games[0]?.position||games[0]?.pos||'').toUpperCase();
   const positionStats=defenseVsPosition?.byDefense?.[opponent]?.positions?.[position];
   const leagueAverage=Number(defenseVsPosition?.leaguePositionAverage?.[position+'|'+category]);
   const observedAllowed=Number(positionStats?.[category]);
   const dvpSupported=category!=='pra'&&Number(positionStats?.games)>=2&&
    Number.isFinite(leagueAverage)&&leagueAverage>0&&Number.isFinite(observedAllowed)&&observedAllowed>0;
   const dvpFactor=dvpSupported?Math.max(0.94,Math.min(1.06,Math.pow(observedAllowed/leagueAverage,0.25))):1;
   // Minutes trend is observational, not a guarantee of the next rotation.
   // Keep the adjustment neutral when the source lacks usable minute samples.
   const minuteRows=games.filter(g=>Number.isFinite(g.minutes)&&g.minutes>0);
   const meanMinutes=minuteRows.length>=2?minuteRows.reduce((s,g)=>s+g.minutes,0)/minuteRows.length:null;
   const recentMinutes=minuteRows.length>=3?minuteRows.slice(-3).reduce((s,g)=>s+g.minutes,0)/Math.min(3,minuteRows.length):null;
   const minutesSupported=meanMinutes!==null&&recentMinutes!==null&&meanMinutes>=8;
   const minutesFactor=minutesSupported?Math.max(0.90,Math.min(1.10,recentMinutes/meanMinutes)):1;
   const projection=baseProjection*(Number(matchup.factor)||1)*dvpFactor*minutesFactor;
   if(projection<=0||category==='pra'&&projection<10)continue;
   candidates.push({name:p.name,team:p.team,playerId:String(p.playerId),gameId,category,
    baseProjection:round(baseProjection),matchupAdjustment:{
     factor:matchup.factor||1,status:matchup.status||'INSUFFICIENT_SAMPLES',
     opponent:matchup.opponent||null},
    minutesModel:{average:meanMinutes===null?null:round(meanMinutes),recent:recentMinutes===null?null:round(recentMinutes),factor:round(minutesFactor,3),status:minutesSupported?'OBSERVED_MINUTES_TREND':'INSUFFICIENT_MINUTES'},
    position:position||null,defenseVsPosition:{opponent,position:position||null,observedAllowed:dvpSupported?observedAllowed:null,leagueAverage:dvpSupported?leagueAverage:null,sampleGames:positionStats?.games||0,factor:round(dvpFactor,3),status:dvpSupported?'OBSERVED_DVP_ADJUSTMENT':'INSUFFICIENT_POSITION_EVIDENCE'},
    sampleGames:sample.length,projection:round(projection),range:{low:Math.min(...sample),high:Math.max(...sample)},
    historicalValues:sample,
    basis:sampleSource==='PRIOR_SEASON'?
     'Previous-season ESPN completed-game mean, current team roster matched; not a current-season or sportsbook line':
     'Current-season ESPN completed game box-score mean; not an actual sportsbook line',
    sampleSource,historicalSeason,
    availability:'ROSTER_PRESENT_NOT_STARTER_CONFIRMED',
     starterVerified:false,starterStatus:'UNCONFIRMED',
     sportsbookChecks:{FanDuel:'NO_VERIFIED_GAME_PROP',
      DraftKings:'NO_VERIFIED_GAME_PROP'}});
  }
 }
 // Never allow the same player twice in a proposed SGP: one star's points and
 // PRA are highly correlated, and player duplication hides category gaps.
 function select(risk){
  const cfg=NBA_TIERS[risk],picks=[],used=new Set(),categories=new Set();
  const favored=risk==='Nuke'?['points','rebounds','assists','threes','pra']:
   risk==='Medium'?['points','rebounds','assists','threes','pra']:
   ['points','rebounds','assists','threes','pra'];
  const stepFor=c=>c.category==='points'||c.category==='pra'?5:c.category==='threes'?1:2;
  const thresholdFor=c=>{
   const step=stepFor(c);
   if(risk==='Nuke')return Math.max(step,Math.ceil(Math.max(c.projection*1.25,c.projection+step)/step)*step);
   if(risk==='Medium')return Math.max(step,Math.ceil(c.projection/step)*step);
   return Math.max(step,Math.floor(c.projection*0.8/step)*step);
  };
  const scored=c=>{
   const threshold=thresholdFor(c),values=c.historicalValues||[];
   const hits=values.filter(v=>v>=threshold).length;
   // Smoothed historical hit rate avoids claiming certainty from small samples.
   const hitRate=(hits+1)/(values.length+2);
   const cushion=(c.projection-threshold)/Math.max(1,c.projection);
   return {...c,threshold,historicalHits:hits,historicalAttempts:values.length,
    historicalHitRate:round(hitRate),projectionCushion:round(cushion)};
  };
  const choices=candidates.filter(x=>x.category!=='pra'||risk==='Nuke')
   .map(scored).filter(c=>c.historicalAttempts>=2&&
    (risk==='Small'?c.projection>=c.threshold&&c.historicalHitRate>=0.5:
     risk==='Medium'?c.historicalHitRate>=0.3:
     c.historicalHitRate>=0.15))
   .sort((a,b)=>b.historicalHitRate-a.historicalHitRate||
     b.projectionCushion-a.projectionCushion||
     b.sampleGames-a.sampleGames||
     favored.indexOf(a.category)-favored.indexOf(b.category));
  // Establish market diversity first, then fill the required leg count.
  const addPick=c=>{
   if(used.has(c.playerId)||picks.length>=cfg.max)return false;
   if(risk==='Nuke'&&c.threshold<=c.projection)return false;
   picks.push({...c,historicalValues:undefined,threshold:c.threshold,
    marketVerified:false,combinedPriceVerified:false,
    starterVerified:false,starterStatus:'UNCONFIRMED',
    aboveProjection:risk==='Nuke',source:'MODEL_ONLY'});
   used.add(c.playerId);categories.add(c.category);return true;
  };
  for(const c of choices){
   if(categories.size>=cfg.categories)break;
   if(!categories.has(c.category))addPick(c);
  }
  for(const c of choices){
   if(picks.length>=cfg.min&&categories.size>=cfg.categories)break;
   addPick(c);
  }
  if(picks.length<cfg.min||categories.size<cfg.categories)
   return {...nbaNotReadyTiers('Insufficient verified historical player samples across distinct teams and prop categories; no picks invented.').find(x=>x.risk===risk),
    candidatesInspected:candidates.length};
  return {risk,status:'MODEL_CANDIDATE',legs:picks,requiredLegs:picks.length,
   combinedBookOdds:null,combinedBookOddsVerified:false,marketVerified:false,
   adaptiveLegCount:picks.length,selectionObjective:'SHORTEST_EVIDENCE_SUPPORTED_RESEARCH_CANDIDATE',
   selectionRanking:'HISTORICAL_HIT_RATE_AND_PROJECTION_CUSHION_NO_POPULARITY',
   publishable:false,starterVerificationStatus:'UNCONFIRMED',
   sportsbookVerificationStatus:'BOTH_BOOKS_NOT_VERIFIED',
   reason:'Pregame historical model candidate. Individual FanDuel/DraftKings props, current starting five and correlated SGP prices are unverified.',
   injuryCheckAt:generatedAt,aiReviewed:false,
   confidence:sampleSource==='PRIOR_SEASON'?'PRIOR_SEASON_BASELINE':'LIMITED_SAMPLE'};
 }
 return {status:candidates.length?'MODEL_ONLY':'NOT_READY',source:'ESPN team rosters + completed box scores',
   sampleSource,historicalSeason,
   generatedAt,gameId,tipoff,samplesUsed:sources.size,offenseDefense,defenseVsPosition,
   playerProjections:candidates.slice(0,40).map(({historicalValues,...p})=>p),
   sgps:['Small','Medium','Nuke'].map(select),
   sportsbookMarketsVerified:false,combinedSgpOddsVerified:false,aiReviewed:false,
   injuryChecks:{reported:injuries.length,restricted:restricted.size,activeRosterChecked:roster.size,
    officialInactivesVerified:false},
   reason:sampleSource==='PRIOR_SEASON'?
    'Previous-season regular-season baseline ('+(historicalSeason-1)+'–'+historicalSeason+') for the new NBA season: roster changes and roles may invalidate averages. Model-only; not a current-season stat or sportsbook-quoted SGP.':
    'Model-only candidates based on observed current-season completed games; no free provider guarantees live NBA sportsbook props.'};
}
export async function nbaPrepareEvidence(game,{fetchJson}){
 const home=game.home,away=game.away;
 if(!home?.id||!away?.id)return notReady('ESPN matchup is missing team IDs; cannot cross-check rosters and history.');
 const seasonYear=Number(game.seasonYear)||new Date(game.kickoff).getUTCFullYear()+1;
 const seasonType=Number(game.seasonType)||(/preseason/i.test(String(game.stage||''))?1:2);
 if(!Number.isInteger(seasonYear)||seasonYear<2020||![1,2,3].includes(seasonType))
  return notReady('NBA season identity is unverified; refusing mismatched historical games.');
 const teams=[home,away];
 const calls=await Promise.all(teams.map(async t=>{
  const prefix='https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/'+encodeURIComponent(t.id);
  const [roster,schedule]=await Promise.all([
   fetchJson(prefix+'/roster').catch(()=>null),
   fetchJson(nbaTeamSeasonScheduleUrl(t.id,{seasonYear,seasonType})).catch(()=>null)]);
  return {team:t.abbr,roster,schedule};
 }));
 if(calls.some(x=>!x.roster||!x.schedule))return notReady('Current NBA team roster/schedule verification failed; holding unverified SGP legs.');
 const roster=nbaRosterEvidence(calls.map(x=>({team:x.team,data:x.roster})),home.abbr,away.abbr);
 if(!roster.size)return notReady('ESPN team rosters contain no matched player IDs.');
 let ids=[...new Set(calls.flatMap(x=>nbaCompletedTeamGames(x.schedule,game.kickoff,3)))].slice(0,6);
 let sampleSource='CURRENT_SEASON',historicalSeason=seasonYear;
 // The 2026–27 NBA regular season begins October 20, 2026. There cannot be
 // current-season regular results before opening night, and early in the
 // season there may not be two completed games per team. We may look back to
 // the PREVIOUS regular season strictly as a clearly labeled baseline.
 // Preseason outcomes are never silently mixed with regular season averages.
 if(seasonType===2&&ids.length<4){
  const previous=await Promise.all(teams.map(async team=>{
   try{
    return await fetchJson(nbaTeamSeasonScheduleUrl(team.id,{
     seasonYear:seasonYear-1,seasonType:2
    }));
   }catch{return null}
  }));
  if(previous.every(Boolean)){
   const previousIds=[...new Set(previous.flatMap(x=>nbaCompletedTeamGames(x,game.kickoff,12)))].slice(0,24);
   if(previousIds.length){
    ids=previousIds;
    sampleSource='PRIOR_SEASON';
    historicalSeason=seasonYear-1;
   }
  }
 }
 if(!ids.length){
  const reason=seasonType===1?
   'Preseason sample is insufficient; the regular season has not begun. No prior-season regular results are presented as preseason SGP evidence.':
   'No verified completed current-season games or previous-season baseline for this matchup.';
  return {...notReady(reason),sampleSource:'NO_COMPLETED_GAMES',historicalSeason:seasonYear,
   seasonStage:seasonType===1?'PRESEASON':'REGULAR_SEASON'};
 }
 const historical=await Promise.all(ids.map(async id=>{
  try{
   const d=await fetchJson('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event='+id);
   const parsed=parseNbaGame(d,id);
   return parsed.ok?parsed:null;
  }catch{return null}
 }));
 const verified=historical.filter(Boolean);
 if(!verified.length)return {...notReady('No verified historical NBA game box scores returned for the selected season.'),
  sampleSource,historicalSeason};
 return nbaBuildPregameModels({gameId:game.gameId,tipoff:game.kickoff,home:home.abbr,away:away.abbr,
  historical:verified,roster,injuries:game.injuries||[],sampleSource,historicalSeason,
  offenseDefense:nbaOffenseDefenseEvidence(verified,home.abbr,away.abbr),
  defenseVsPosition:nbaDefensePositionEvidence(verified,home.abbr,away.abbr)});
}
