// Read-only presentation boundary for shareable NFL prediction pages.
// Never return provider IDs, upstream diagnostics, raw model snapshots, or API
// request instructions. Model forecasts and sportsbook quotes remain distinct.
import {nflSgpSnapshotReadiness,NFL_SGP_SNAPSHOT_TTL_MS}
 from './nfl-sgp-snapshot-status.js';
import {nflOfficialTransactionHolds,nflOfficialHoldMatches}
 from './nfl-official-transaction-holds.js';
import {nflInjuryRecommendationHold} from './nfl-injury-evidence.js';
import {estimateNflHitChance} from './nfl-model-hit-chance.js';

export const PUBLIC_NFL_CATEGORIES=['td','passing','rushing','receiving','receptions'];
export const PUBLIC_NFL_TIERS=['Small','Medium','Nuke'];
const blocked=/\b(?:OUT|INACTIVE|IR|INJURED RESERVE|DOUBTFUL|QUESTIONABLE|SUSPENDED|SUSPEND)\b/i;
const isInt=n=>Number.isSafeInteger(n);
const finite=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x));
const bounded=(n,lo,hi)=>finite(n)?Math.max(lo,Math.min(hi,Number(n))):null;
const short=(x,n=120)=>String(x??'').trim().slice(0,n);
const validGameId=v=>/^\d{7,12}$/.test(String(v||''));
const validTeam=v=>/^[A-Z]{2,4}$/.test(String(v||'').toUpperCase());
const round1=v=>Math.round(v*10)/10;
const numericId=v=>String(v||'').trim().length>0;
function allowed(x,cat,gameId,teams,holds=[]){
 return x&&String(x.eventID||x.gameId||'')===gameId&&
  teams.has(String(x.team||'').toUpperCase())&&
  numericId(x.playerID||x.playerId)&&short(x.name)&&
  !holds.some(h=>nflOfficialHoldMatches(x,h))&&
  !blocked.test([x.injuryStatus,x.availability,x.starterStatus].join(' '))&&
  PUBLIC_NFL_CATEGORIES.includes(cat);
}
const safeWords=(v,n=420)=>short(v,n).replace(new RegExp('https?:[^ ]+','gi'),'').replace(/[<>]/g,'');
const statusOk=new Set(['OUT','INACTIVE','IR','DOUBTFUL','QUESTIONABLE','SUSPENDED','ACTIVE','PROBABLE']);
const positions=new Set(['QB','RB','WR','TE']);
function safeInjuries(rows,teams){
 return (Array.isArray(rows)?rows:[]).filter(x=>teams.has(String(x?.team||'').toUpperCase())&&
  statusOk.has(String(x?.status||'').toUpperCase())&&x?.name)
 .slice(0,35).map(x=>({name:short(x.name,70),team:short(x.team,4),
  position:positions.has(x.position)?x.position:null,
  status:String(x.status).toUpperCase(),
  designation:String(x.section||'').toUpperCase()==='PRACTICE'?'PRACTICE':'REPORTED'}));
}
function safeMatchup(raw,teams){
 if(raw?.status!=='BILATERAL_EVIDENCE')return null;
 const sides=(Array.isArray(raw.sides)?raw.sides:[]).filter(x=>
  teams.has(String(x.offenseTeam||'').toUpperCase())&&
  teams.has(String(x.defenseTeam||'').toUpperCase())&&x.offenseTeam!==x.defenseTeam)
 .slice(0,2).map(x=>({
  offense:short(x.offenseTeam,4),defense:short(x.defenseTeam,4),
  offenseGames:bounded(x.offenseSampleGames,0,25),
  defenseGames:bounded(x.defenseSampleGames,0,25),
  positions:(Array.isArray(x.positions)?x.positions:[])
   .filter(p=>positions.has(p?.position)).slice(0,4).map(p=>({
    position:p.position,
    metrics:(Array.isArray(p.metrics)?p.metrics:[]).slice(0,10)
     .filter(m=>/^(passYards|rushYards|recYards|passTD|rushTD|recTD|receptions|targets)$/.test(String(m?.metric||'')))
     .map(m=>({metric:short(m.metric,18),
      offensePerGame:bounded(m.offenseProducedPerGame,0,1500),
      defenseAllowedPerGame:bounded(m.defenseAllowedPerGame,0,1500),
      offenseRank:bounded(m.offenseRankMost,1,32),
      defenseRank:bounded(m.defenseRankMost,1,32)}))
   }))
 }));
 if(sides.length!==2)return null;
 return{status:'MATCHUP_AVAILABLE',sides};
}
function safeScore(raw,teams){
 const a=String(raw?.teamA||''),b=String(raw?.teamB||'');
 if(!teams.has(a)||!teams.has(b)||a===b)return null;
 const score=raw.projectedFinalScore||{},odds=raw.winProbability||{};
 if(!finite(score[a])||!finite(score[b]))return null;
 return{away:a,home:b,
  scores:[{team:a,points:bounded(score[a],0,75)},
   {team:b,points:bounded(score[b],0,75)}],
  chances:[{team:a,percent:bounded(odds[a],0,100)},
   {team:b,percent:bounded(odds[b],0,100)}],
  note:'Model estimate, not a confirmed result'};
}
function safeOffer(x,now){
 const book=x?.bestBook||x?.bookOffer,checked=Date.parse(book?.checkedAt||'');
 const odds=Number(book?.odds);
 if(!['DraftKings','FanDuel'].includes(String(book?.book))||
   book?.available===false||!finite(book?.odds)||odds===0||
   !Number.isFinite(checked)||checked>now+60_000||
   now-checked>NFL_SGP_SNAPSHOT_TTL_MS)return null;
 return{book:book.book,odds,checkedAt:new Date(checked).toISOString(),
  ...(finite(book?.line)?{line:Number(book.line)}:{})};
}
function marketRow(x,cat,now){
 const sample=bounded(x.gamesPlayed??x.evidence?.games,0,30);
 const base={name:short(x.name,85),team:short(x.team,4),
  position:short(x.position,3),category:cat,
  modelOnly:true,gameSample:sample,
  avgPerGame:bounded(x.perGame,0,1000),
  range:finite(x.range?.floor)&&finite(x.range?.ceiling)?{
   floor:round1(Number(x.range.floor)),ceiling:round1(Number(x.range.ceiling))}:null,
  recentFive:(Array.isArray(x.recentForm?.last5)?x.recentForm.last5:[])
   .filter(finite).slice(-5).map(Number),
  projectionNote:safeWords(x.reason,310),
  bookOffer:safeOffer(x,now)};
 if(cat==='td'){
  // A TD pick is displayed as a probability ONLY when the matchup model
  // explicitly produced it with adequate historical samples.
  const pct=Number(x.modelTdPercent),e=x.evidence||{};
  if(x.tdModelStatus!=='ESPN_MATCHUP_MODEL'||x.modelOnly!==true||
    !Number.isFinite(pct)||pct<3||pct>73||
    !Number.isInteger(Number(e.games))||Number(e.games)<2||
    !finite(e.opportunitiesPerGame)||Number(e.opportunitiesPerGame)<2)return null;
  return{...base,label:'Anytime touchdown',modelChancePct:Math.round(pct),
   opportunitiesPerGame:round1(Number(e.opportunitiesPerGame)),
   historicalTouchdowns:bounded(e.touchdowns,0,100),
   opponentTdRank:bounded(e.defenseRank,1,32),
   offenseTdRank:bounded(e.offenseRank,1,32),
   recentTouchdowns:(Array.isArray(e.last5Touchdowns)?e.last5Touchdowns:[])
    .filter(finite).slice(-5).map(Number),
   hitProbabilityPct:estimateNflHitChance(x,cat)?.percent??null};
 }
 const projection=x.projection;
 if(!finite(projection)||Number(projection)<=0)return null;
 const yards=['passing','rushing','receiving'].includes(cat);
 const value=yards?Math.round(Number(projection)/5)*5:round1(Number(projection));
 if(value<=0)return null;
 return{...base,label:cat==='receptions'?'Receptions':cat[0].toUpperCase()+cat.slice(1)+' yards',
  projection:value,unit:cat==='receptions'?'receptions':'yards',
  hitProbabilityPct:estimateNflHitChance(x,cat)?.percent??null,
  hitTarget:estimateNflHitChance(x,cat)?.target??null,
  suggestedTarget:cat==='rushing'?bounded(x.rushingChance?.modelTargetYards,5,250):null,
  suggestedTargetChance:cat==='rushing'?bounded(x.rushingChance?.estimatedPercent,1,99):null,
  recentTrend:['UP','DOWN','STEADY','EARLY_SAMPLE'].includes(x.recentForm?.label)?x.recentForm.label:null};
}
function modelLeg(x,gameId,teams,holds=[]){
 const cat=String(x?.cat||x?.category||'');
 if(!allowed(x,cat,gameId,teams,holds))return null;
 const raw=x.analyticsThreshold??x.threshold;
 if(cat==='td')return{player:short(x.name,85),team:short(x.team,4),
  category:cat,target:'Anytime TD',
  hitProbabilityPct:estimateNflHitChance(x,cat)?.percent??null,
  projectionNote:safeWords(x.reason,160)};
 if(!finite(raw))return null;
 const n=Number(raw);
 if(['passing','rushing','receiving'].includes(cat)){
  if(!isInt(n)||n<5||n%5!==0)return null;
  return{player:short(x.name,85),team:short(x.team,4),category:cat,
   target:n+'+ yards',projection:bounded(x.projection,0,1500),
   hitProbabilityPct:estimateNflHitChance(x,cat,{target:n})?.percent??null,
   position:positions.has(x.position)?x.position:null,
   projectionNote:safeWords(x.reason,160)};
 }
 if(cat==='receptions'&&isInt(n)&&n>=1)
  return{player:short(x.name,85),team:short(x.team,4),category:cat,
   target:n+'+ receptions',projection:bounded(x.projection,0,30),
   hitProbabilityPct:estimateNflHitChance(x,cat,{target:n})?.percent??null,
   position:positions.has(x.position)?x.position:null,
   projectionNote:safeWords(x.reason,160)};
 return null;
}
function tierCard(card,risk,gameId,teams,holds=[]){
 const legs=Array.isArray(card?.legs)?card.legs:[];
 const required=risk==='Small'?4:risk==='Medium'?5:null;
 if(card?.risk!==risk||card?.tierAssessment?.compositionOk!==true||
    !legs.length||(required!==null&&legs.length!==required)||
    (risk==='Nuke'&&(legs.length<5||legs.length>7)))return null;
 const safe=legs.map(x=>modelLeg(x,gameId,teams,holds));
 if(safe.some(x=>!x))return null;
 return{risk,mode:'MODEL_ONLY',legs:safe,legCount:safe.length,
  combinedOddsVerified:false,
  explanation:safeWords(card?.explanation?.summary||card?.reason,250),
  matchupNotes:(Array.isArray(card?.explanation?.legs)?card.explanation.legs:[])
   .slice(0,7).map(x=>safeWords(x,200)),
  correlation:safeWords(card?.correlation?.label,60)};
}
export function publicNflGameView(snapshot,{date,gameId,now=Date.now(),includeLastSaved=false}={}){
 const dateOk=/^\d{4}-\d{2}-\d{2}$/.test(String(date||'')),
  id=String(gameId||''),at=Number(snapshot?.at),raw=snapshot?.body;
 if(!dateOk||!validGameId(id)||!raw||raw.ok!==true||
    raw.date!==date||String(raw.gameId)!==id||
    !Number.isFinite(at)||at<=0||at>now+60_000)
  return{ok:false,date,gameId:id,status:'UNAVAILABLE',
   message:'This game has no verified saved prediction data.'};
 const home=short(raw.home,4).toUpperCase(),away=short(raw.away,4).toUpperCase(),
  teams=new Set([home,away]),updatedAt=new Date(at).toISOString(),
  age=now-at;
 const base={ok:true,date,gameId:id,updatedAt,
  home:validTeam(home)?home:null,away:validTeam(away)?away:null,
  modelOnly:true,bookmakerTicketPlaced:false};
 const emptyCategories=Object.fromEntries(PUBLIC_NFL_CATEGORIES.map(c=>[c,[]]));
 const stale=age>NFL_SGP_SNAPSHOT_TTL_MS;
 // A read-only public website can show yesterday's SAVED MODEL evidence
 // with unmistakable stale labeling, but never stale betting lines or quotes.
 // The default behavior remains fail-closed for all existing callers/tests.
 if(stale&&(!includeLastSaved||age>36*60*60*1000))return{
  ...base,status:'STALE',
  message:'Predictions are waiting for a fresh scheduled update.',
  categories:emptyCategories,parlays:[],verifiedQuotes:[]};
 if(raw.validation?.injuryEligibilityChecked!==true||teams.size!==2||
  !validTeam(home)||!validTeam(away))return{...base,status:'REVIEW',
  message:'Player eligibility checks are incomplete for this matchup.',
  categories:emptyCategories,parlays:[],verifiedQuotes:[]};
 const officialHolds=nflOfficialTransactionHolds({gameId:id,date,home,away});
 const reportedHolds=(Array.isArray(raw.validation?.injuryEvidence)?
 raw.validation.injuryEvidence:[]).filter(x=>
 nflInjuryRecommendationHold(x)&&teams.has(
  String(x?.team||'').toUpperCase()));
 const holds=[...officialHolds,...reportedHolds];
 // Fail closed: public betting picks require an actual fresh book offer.
 // A statistical projection alone is never evidence of market availability.
 const bookEligible=(x,cat)=>{
  const offer=safeOffer(x,now);
  if(!offer||!Number.isFinite(Number(offer.line))&&cat!=='td')return false;
  const offeredCat=String(x?.bestBook?.category||x?.bookOffer?.category||cat);
  if(offeredCat!==cat)return false;
  if(cat==='td')return true;
  const threshold=Number(x?.analyticsThreshold??x?.threshold??x?.rushingChance?.modelTargetYards);
  if(!Number.isFinite(threshold))return false;
  return Number(offer.line)===threshold;
 };
 const categories=Object.fromEntries(PUBLIC_NFL_CATEGORIES.map(cat=>{
  const rows=(Array.isArray(raw.categories?.[cat])?raw.categories[cat]:[])
   .filter(x=>allowed(x,cat,id,teams,holds)&&bookEligible(x,cat)).map(x=>{const row=marketRow(x,cat,now);return stale&&row?{...row,bookOffer:null}:row})
   .filter(Boolean)
   .sort((a,b)=>cat==='td'?
    Number(b.modelChancePct)-Number(a.modelChancePct):
    Number(b.projection)-Number(a.projection)).slice(0,10);
  return[cat,rows];
 }));
 const cards=Array.isArray(raw.sgps?.Analytics)?raw.sgps.Analytics:[];
 const parlays=PUBLIC_NFL_TIERS.map(risk=>tierCard(
  cards.find(c=>c?.risk===risk),risk,id,teams,holds)).filter(Boolean)
  .filter(card=>card.legs.every(leg=>{
   const source=(Array.isArray(raw.categories?.[leg.category])?raw.categories[leg.category]:[])
    .find(x=>String(x.name)===leg.player&&String(x.team)===leg.team);
   return source&&bookEligible(source,leg.category);
  }));
 // Only previously authenticated, still-fresh correlated quotes pass this
 // existing strict verifier; model cards NEVER inherit their quoted odds.
 const readiness=nflSgpSnapshotReadiness(snapshot,{now,gameId:id});
 const verifiedQuotes=Array.isArray(readiness.bookQuotes)?
  readiness.bookQuotes.filter(q=>{
   const card=(raw.sgps?.[q.book]||[]).find(c=>c.risk===q.risk&&
    c.combinedBookQuoteVerified===true);
   return card?.legs?.length&&card.legs.every(x=>!holds.some(h=>
    nflOfficialHoldMatches(x,h)));
  }).map(q=>({book:q.book,risk:q.risk,
   americanOdds:q.americanOdds,quotedAt:q.quotedAt})).slice(0,6):[];
 return{...base,status:stale?'LAST_SAVED':'CURRENT',
  message:stale?
   'OLDER MODEL SNAPSHOT: projections are for historical reference only. Injury status and sportsbook prices must be rechecked before use.':
   'Pregame model estimates, not guaranteed outcomes.',
  categories,parlays:stale?parlays.map(x=>({...x,
   outdated:true,mode:'STALE_MODEL_ONLY'})):parlays,
  verifiedQuotes:stale?[]:verifiedQuotes,
  matchup:safeMatchup(raw.matchupEvidence,teams),
  projectedScore:safeScore(raw.outcomePrediction,teams),
  injuries:safeInjuries([...(raw.validation?.injuryEvidence||[]),
   ...officialHolds.map(h=>({name:h.name,team:h.team,status:'IR',
    source:h.source,playerId:h.playerId}))],teams),
  injuryCheckedAt:raw.validation?.injuryReportCheckedAt||null,
  inactivesVerified:!stale&&raw.validation?.officialInactivesVerified===true,
  pregameChecks:{
   injuryReport:stale?'RECHECK_REQUIRED':
    raw.pregameVerification?.injuryReportStatus||'RECHECK_REQUIRED',
   startingLineups:stale?'UNCONFIRMED':
    raw.pregameVerification?.starterStatus||'UNCONFIRMED',
   eventRosterStarterFlags:stale?null:
    raw.validation?.gameScopedStarterSource==='ESPN_CORE_GAME_ROSTER'?
    Object.fromEntries([home,away].map(team=>[team,
     Math.min(40,Math.max(0,Number(raw.validation?.gameScopedStarterCounts?.[team])||0))])):
    null,
   eventRosterSource:stale?'EXPIRED':
    raw.validation?.gameScopedStarterSource==='ESPN_CORE_GAME_ROSTER'?
    'ESPN_GAME_SCOPED_ROSTER':'NOT_AVAILABLE',
   officialInactivesVerified:!stale&&
    raw.pregameVerification?.officialInactivesVerified===true,
   DraftKings:stale?'EXPIRED':
    raw.pregameVerification?.books?.DraftKings?.status||'NO_VERIFIED_GAME_PROP',
   FanDuel:stale?'EXPIRED':
    raw.pregameVerification?.books?.FanDuel?.status||'NO_VERIFIED_GAME_PROP',
   status:'RESEARCH_ONLY',
   note:'A playable SGP requires confirmed lineups, current injury/inactive clearance, exact live prop offers from the chosen book, and a verified combined quote.'
  },
  updatedDataCurrent:!stale};
}
