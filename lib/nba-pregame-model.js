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
   all.set(id,{id,name,team,injury,active:rosterStatus==='active'||rosterStatus==='',
    statusSource:'ESPN team roster; not confirmed starting five'});
  }
 }
 return all;
}
export function nbaBuildPregameModels({gameId,home,away,tipoff,gameStatus='SCHEDULED',
 historical=[],roster=new Map(),injuries=[],sampleSource='CURRENT_SEASON',historicalSeason=null,
 generatedAt=new Date().toISOString()}){
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
   const projection=sample.reduce((a,b)=>a+b,0)/sample.length;
   if(projection<=0||category==='pra'&&projection<10)continue;
   candidates.push({name:p.name,team:p.team,playerId:String(p.playerId),gameId,category,
    sampleGames:sample.length,projection:round(projection),range:{low:Math.min(...sample),high:Math.max(...sample)},
    basis:sampleSource==='PRIOR_SEASON'?
     'Previous-season ESPN completed-game mean, current team roster matched; not a current-season or sportsbook line':
     'Current-season ESPN completed game box-score mean; not an actual sportsbook line',
    sampleSource,historicalSeason,
    availability:'ROSTER_PRESENT_NOT_STARTER_CONFIRMED'});
  }
 }
 // Never allow the same player twice in a proposed SGP: one star's points and
 // PRA are highly correlated, and player duplication hides category gaps.
 function select(risk){
  const cfg=NBA_TIERS[risk],picks=[],used=new Set(),categories=new Set();
  const favored=risk==='Nuke'?['points','rebounds','assists','threes','pra']:
   risk==='Medium'?['points','rebounds','assists','threes','pra']:
   ['points','rebounds','assists','threes','pra'];
  const choices=candidates.filter(x=>x.category!=='pra'||risk==='Nuke')
   .sort((a,b)=>b.sampleGames-a.sampleGames||
     favored.indexOf(a.category)-favored.indexOf(b.category)||
     b.projection-a.projection);
  for(const c of choices){
   if(used.has(c.playerId))continue;
   if(picks.length>=cfg.max)break;
   const catNeeded=categories.size<cfg.categories&&!categories.has(c.category);
   // Prioritize category diversity in the first pass.
   if(!catNeeded&&picks.length<cfg.categories)continue;
   const step=c.category==='points'||c.category==='pra'?5:c.category==='threes'?1:2;
   let threshold;
   if(risk==='Nuke')threshold=Math.ceil(Math.max(c.projection*1.25,c.projection+step)/step)*step;
   else if(risk==='Medium')threshold=Math.ceil(c.projection/step)*step;
   else threshold=Math.floor(c.projection*0.8/step)*step;
   threshold=Math.max(step,threshold);
   if(risk==='Nuke'&&threshold<=c.projection)continue;
   picks.push({...c,threshold,marketVerified:false,combinedPriceVerified:false,
    aboveProjection:risk==='Nuke',source:'MODEL_ONLY'});used.add(c.playerId);categories.add(c.category);
  }
  if(picks.length<cfg.min||categories.size<cfg.categories)
   return {...nbaNotReadyTiers('Insufficient verified historical player samples across distinct teams and prop categories; no picks invented.').find(x=>x.risk===risk),
    candidatesInspected:candidates.length};
  return {risk,status:'MODEL_CANDIDATE',legs:picks,requiredLegs:picks.length,
   combinedBookOdds:null,combinedBookOddsVerified:false,marketVerified:false,
   publishable:false,reason:'Pregame historical model candidate. Individual prop markets, active starters and correlated SGP price not verified.',
   injuryCheckAt:generatedAt,aiReviewed:false,
   confidence:sampleSource==='PRIOR_SEASON'?'PRIOR_SEASON_BASELINE':'LIMITED_SAMPLE'};
 }
 return {status:candidates.length?'MODEL_ONLY':'NOT_READY',source:'ESPN team rosters + completed box scores',
   sampleSource,historicalSeason,
   generatedAt,gameId,tipoff,samplesUsed:sources.size,playerProjections:candidates.slice(0,40),
   sgps:['Small','Medium','Nuke'].map(select),
   sportsbookMarketsVerified:false,combinedSgpOddsVerified:false,aiReviewed:false,
   injuryChecks:{reported:injuries.length,restricted:restricted.size,activeRosterChecked:roster.size,
    officialInactivesVerified:false},
   reason:sampleSource==='PRIOR_SEASON'?
    'Historical 2025–26 regular-season baseline for 2026–27 opening games: roster changes and roles may invalidate averages. Model-only; not a current-season stat or sportsbook-quoted SGP.':
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
   const previousIds=[...new Set(previous.flatMap(x=>nbaCompletedTeamGames(x,game.kickoff,3)))].slice(0,6);
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
  historical:verified,roster,injuries:game.injuries||[],sampleSource,historicalSeason});
}
