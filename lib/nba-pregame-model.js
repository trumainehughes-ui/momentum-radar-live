// NBA pregame projections — *conditional model candidates*, never sportsbook
// odds, confirmed starters, or official game-day inactives.
import {parseNbaGame,nbaNotReadyTiers,NBA_TIERS} from './nba-data-model.js';
import {nbaVerifiedPositionSamples} from './nba-position-collector.js';
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

export function nbaBuildPregameModels({gameId,home,away,tipoff,gameStatus='SCHEDULED',
 historical=[],roster=new Map(),injuries=[],sampleSource='CURRENT_SEASON',historicalSeason=null,
 offenseDefense=null,generatedAt=new Date().toISOString()}){
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
   const projection=baseProjection*(Number(matchup.factor)||1);
   if(projection<=0||category==='pra'&&projection<10)continue;
   candidates.push({name:p.name,team:p.team,playerId:String(p.playerId),gameId,category,
    baseProjection:round(baseProjection),matchupAdjustment:{
     factor:matchup.factor||1,status:matchup.status||'INSUFFICIENT_SAMPLES',
     opponent:matchup.opponent||null},
    sampleGames:sample.length,projection:round(projection),range:{low:Math.min(...sample),high:Math.max(...sample)},
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
  const choices=candidates.filter(x=>x.category!=='pra'||risk==='Nuke')
   .sort((a,b)=>b.sampleGames-a.sampleGames||
     favored.indexOf(a.category)-favored.indexOf(b.category)||
     b.projection-a.projection);
  for(const c of choices){
   if(used.has(c.playerId))continue;
   // Without a verified combined sportsbook quote, minimize additional
   // event exposure once the required market diversity is satisfied.
   if(picks.length>=cfg.min&&categories.size>=cfg.categories)break;
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
     starterVerified:false,starterStatus:'UNCONFIRMED',
    aboveProjection:risk==='Nuke',source:'MODEL_ONLY'});used.add(c.playerId);categories.add(c.category);
  }
  if(picks.length<cfg.min||categories.size<cfg.categories)
   return {...nbaNotReadyTiers('Insufficient verified historical player samples across distinct teams and prop categories; no picks invented.').find(x=>x.risk===risk),
    candidatesInspected:candidates.length};
  return {risk,status:'MODEL_CANDIDATE',legs:picks,requiredLegs:picks.length,
   combinedBookOdds:null,combinedBookOddsVerified:false,marketVerified:false,
   adaptiveLegCount:picks.length,selectionObjective:'SHORTEST_EVIDENCE_SUPPORTED_RESEARCH_CANDIDATE',
   publishable:false,starterVerificationStatus:'UNCONFIRMED',
   sportsbookVerificationStatus:'BOTH_BOOKS_NOT_VERIFIED',
   reason:'Pregame historical model candidate. Individual FanDuel/DraftKings props, current starting five and correlated SGP prices are unverified.',
   injuryCheckAt:generatedAt,aiReviewed:false,
   confidence:sampleSource==='PRIOR_SEASON'?'PRIOR_SEASON_BASELINE':'LIMITED_SAMPLE'};
 }
 return {status:candidates.length?'MODEL_ONLY':'NOT_READY',source:'ESPN team rosters + completed box scores',
   sampleSource,historicalSeason,
   generatedAt,gameId,tipoff,samplesUsed:sources.size,offenseDefense,
   playerProjections:candidates.slice(0,40),
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
 let ids=[...new Set(calls.flatMap(x=>nbaCompletedTeamGames(x.schedule,game.kickoff,8)))].slice(0,16);
 let sampleSource='CURRENT_SEASON',historicalSeason=seasonYear;
 let previous=[];
 // The 2026–27 NBA regular season begins October 20, 2026. There cannot be
 // current-season regular results before opening night, and early in the
 // season there may not be two completed games per team. We may look back to
 // the PREVIOUS regular season strictly as a clearly labeled baseline.
 // Preseason outcomes are never silently mixed with regular season averages.
 if(seasonType===2&&ids.length<4){
  previous=await Promise.all(teams.map(async team=>{
   try{
    return await fetchJson(nbaTeamSeasonScheduleUrl(team.id,{
     seasonYear:seasonYear-1,seasonType:2
    }));
   }catch{return null}
  }));
  if(previous.every(Boolean)){
   const previousIds=[...new Set(previous.flatMap(x=>nbaCompletedTeamGames(x,game.kickoff,8)))].slice(0,16);
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
   const event=[...calls.map(c=>c.schedule),...previous.filter(Boolean)].flatMap(s=>s?.events||[])
    .find(e=>String(e.id)===String(id));
   const date=event?.date||event?.competitions?.[0]?.date;
   return parsed.ok?{...parsed,date:date||null}:null;
  }catch{return null}
 }));
 const verified=historical.filter(Boolean);
 if(!verified.length)return {...notReady('No verified historical NBA game box scores returned for the selected season.'),
  sampleSource,historicalSeason};
 const positionEvidence=nbaVerifiedPositionSamples({
  historical:verified,roster,asOf:game.kickoff});
 const model=nbaBuildPregameModels({gameId:game.gameId,tipoff:game.kickoff,home:home.abbr,away:away.abbr,
  historical:verified,roster,injuries:game.injuries||[],sampleSource,historicalSeason,
  offenseDefense:nbaOffenseDefenseEvidence(verified,home.abbr,away.abbr)});
 return {...model,nbaPositionEvidence:positionEvidence,
  nbaPositionMatchups:(model.playerProjections||[])
   .filter(p=>p.category==='points').slice(0,12).map(p=>{
    const person=roster.get(String(p.playerId));
    const observed=verified.flatMap(g=>g.players||[]).find(x=>String(x.playerId)===String(p.playerId)&&x.position);
    const position=String(person?.position||observed?.position||'').toUpperCase();
    const opponent=p.team===home.abbr?away.abbr:home.abbr;
    return {player:{id:p.playerId,position,perGame:Object.fromEntries(
     (model.playerProjections||[]).filter(q=>q.playerId===p.playerId)
      .map(q=>[q.category,q.baseProjection]))},
     opponent:positionEvidence.teams[opponent]||{teamId:opponent,allowedByPosition:{}},
     asOf:positionEvidence.asOf,sampleSource,historicalSeason};
   })};
}
