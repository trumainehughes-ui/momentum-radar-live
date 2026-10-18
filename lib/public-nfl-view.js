// Read-only presentation boundary for shareable NFL prediction pages.
// Never return provider IDs, upstream diagnostics, raw model snapshots, or API
// request instructions. Model forecasts and sportsbook quotes remain distinct.
import {nflSgpSnapshotReadiness,NFL_SGP_SNAPSHOT_TTL_MS}
 from './nfl-sgp-snapshot-status.js';
import {nflOfficialTransactionHolds,nflOfficialHoldMatches}
 from './nfl-official-transaction-holds.js';
import {nflInjuryRecommendationHold} from './nfl-injury-evidence.js';
import {estimateNflHitChance} from './nfl-model-hit-chance.js';
import {NFL_SGP_TIERS,assessNflSgpTier,classifyNflSgpOdds} from './ai-mechanics/nfl-sgp-tiers.js';

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
// A published offer is tied to exactly one book, athlete, game and market.
// The page must not use the preferred DraftKings offer to validate FanDuel
// (or vice versa), and no independent projection is proof of a listed prop.
const offerCategory=(market)=>{
 const v=String(market||'').toLowerCase();
 if(PUBLIC_NFL_CATEGORIES.includes(v))return v;
 if(/anytime.?td|touchdown/.test(v))return 'td';
 if(/pass.*(?:yard|yds)/.test(v))return 'passing';
 if(/rush.*(?:yard|yds)/.test(v))return 'rushing';
 if(/receiv.*(?:yard|yds)|reception_yds/.test(v))return 'receiving';
 if(/receptions?/.test(v))return 'receptions';
 return '';
};
function safeOffer(x,now,requiredBook=null,requiredCategory=null){
 const options=[
  ...(Array.isArray(x?.books)?x.books:[]),
  x?.bookOffer,x?.bestBook
 ].filter(Boolean);
 const rowGame=String(x?.eventID||x?.gameId||'');
 const rowPlayer=String(x?.playerID||x?.playerId||'');
 const rowCategory=requiredCategory||offerCategory(x?.category||x?.cat||
  x?.marketName||x?.statID);
 if(!rowGame||!rowPlayer||!PUBLIC_NFL_CATEGORIES.includes(rowCategory))return null;
 for(const book of options){
  if(!['DraftKings','FanDuel'].includes(book?.book)||
    (requiredBook&&requiredBook!==book.book)||book.available!==true)continue;
  const checked=Date.parse(book.checkedAt||'');
  const odds=Number(book.odds);
  let url;
  try{url=new URL(String(book.sourceUrl||''))}catch{continue}
  const host=url.hostname.toLowerCase();
  const official=book.book==='DraftKings'?
   host==='sportsbook.draftkings.com':
   ['sportsbook.fanduel.com','co.sportsbook.fanduel.com'].includes(host);
  if(!official||url.protocol!=='https:'||
    String(book.gameId||'')!==rowGame||
    String(book.playerId||'')!==rowPlayer||
    offerCategory(book.category||book.market)!==rowCategory||
    !String(book.offerId||book.selectionId||'')||
    !finite(book.odds)||odds===0||
    !Number.isFinite(checked)||checked>now+60_000||
    now-checked>NFL_SGP_SNAPSHOT_TTL_MS)continue;
  const line=finite(book.line)?Number(book.line):null;
  if(rowCategory!=='td'&&(line===null||line<=0))continue;
  return{book:book.book,odds,checkedAt:new Date(checked).toISOString(),
   ...(line!==null?{line}:{}),available:true,attested:true};
 }
 return null;
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
 // Defense in depth: one ESPN event, exactly two matchup teams,
 // no duplicate athlete-market combinations, and no unverified identities.
 const identities=new Set();
 for(const leg of legs){
  const playerIdentity=String(leg?.playerID||leg?.playerId||leg?.name||'').trim();
  const marketIdentity=String(leg?.cat||leg?.category||'').toLowerCase();
  const identity=playerIdentity+'|'+marketIdentity;
  if(!playerIdentity||!PUBLIC_NFL_CATEGORIES.includes(marketIdentity)||
    identities.has(identity)||!teams.has(String(leg.team||'').toUpperCase())||
    String(leg.eventID||leg.gameId||'')!==String(gameId))return null;
  identities.add(identity);
 }
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
  const offer=safeOffer(x,now,null,cat);
  if(!offer)return false;
  if(cat==='td')return true;
  const threshold=Number(x?.analyticsThreshold??x?.threshold??
   x?.rushingChance?.modelTargetYards);
  return Number.isFinite(threshold)&&Number(offer.line)===threshold;
 };
 const categories=Object.fromEntries(PUBLIC_NFL_CATEGORIES.map(cat=>{
  const rows=(Array.isArray(raw.categories?.[cat])?raw.categories[cat]:[])
   .filter(x=>allowed(x,cat,id,teams,holds)).map(x=>{const row=marketRow(x,cat,now);return row?{...row,modelOnly:!bookEligible(x,cat),bookOffer:!stale&&bookEligible(x,cat)?row.bookOffer:null}:null})
   .filter(Boolean)
   .sort((a,b)=>cat==='td'?
    Number(b.modelChancePct)-Number(a.modelChancePct):
    Number(b.projection)-Number(a.projection)).slice(0,10);
  return[cat,rows];
 }));
 // Read-only customer research mirrors the exact player and market selected
 // by the owner's current Analytics tier. Numbers come from the same
 // sanitized matchup player forecast, NEVER an invented sportsbook line.
 const modelResearchTiers=PUBLIC_NFL_TIERS.map(risk=>{
  const card=(Array.isArray(raw.sgps?.Analytics)?raw.sgps.Analytics:[])
   .find(c=>c?.risk===risk);
  if(!card||!Array.isArray(card.legs))return null;
  const legs=card.legs.slice(0,10).map(l=>{
   const cat=String(l.cat||l.category||'').toLowerCase();
   if(!PUBLIC_NFL_CATEGORIES.includes(cat))return null;
   const team=String(l.team||'').toUpperCase();
   const name=short(l.player||l.name,85);
   const source=(Array.isArray(raw.categories?.[cat])?raw.categories[cat]:[])
    .find(row=>String(row.name||row.player||'').toLowerCase()===name.toLowerCase()&&
     String(row.team||'').toUpperCase()===team&&allowed(row,cat,id,teams,holds));
   if(!source)return null;
   const profile=marketRow(source,cat,now);
   if(!profile)return null;
   return {player:profile.name,team:profile.team,category:cat,
    projection:cat==='td'?null:profile.projection,
    modelChancePct:cat==='td'?profile.modelChancePct:null,
    projectionNote:profile.projectionNote};
  }).filter(Boolean);
  const tier=NFL_SGP_TIERS[risk];
  const requested=Number(card.requiredLegs);
  const required=Number.isSafeInteger(requested)&&requested>=tier.minLegs&&requested<=tier.maxLegs?
   requested:tier.minLegs;
  const researchAssessment=assessNflSgpTier({risk,requiredLegs:required,legs:legs.map(l=>({
   name:l.player,playerID:l.player+'|'+l.team,cat:l.category}))});
  return {risk,mode:'MODEL_RESEARCH',legs,legCount:legs.length,
   complete:legs.length===required&&researchAssessment.compositionOk===true&&card.tierAssessment?.compositionOk===true,
   requiredLegs:required,combinedOddsVerified:false};
 }).filter(Boolean);
 const cards=Array.isArray(raw.sgps?.Analytics)?raw.sgps.Analytics:[];
 // Model research cards are never sportsbook tickets. Keep them visible,
 // even when no current sportsbook market exists for a proposed leg.
 const parlays=PUBLIC_NFL_TIERS.map(risk=>tierCard(
  cards.find(c=>c?.risk===risk),risk,id,teams,holds)).filter(Boolean);
 // Only previously authenticated, still-fresh correlated quotes pass this
 // existing strict verifier; model cards NEVER inherit their quoted odds.
 const readiness=nflSgpSnapshotReadiness(snapshot,{now,gameId:id});
 // A correlated price and every underlying leg are verified AGAINST THE
 // QUOTED BOOK, using only this game/athlete/category/exact book line.
 // Preserve separate markets (receiving and TD) for the same athlete.
 const verifiedBookParlays=[];
 for(const q of Array.isArray(readiness.bookQuotes)?readiness.bookQuotes:[]){
  const card=(Array.isArray(raw.sgps?.[q.book])?raw.sgps[q.book]:[])
   .find(x=>x?.risk===q.risk&&x.combinedBookQuoteVerified===true&&
    x.publishable===true&&Number.isInteger(Number(x.actualSgpOdds))&&
    classifyNflSgpOdds(Number(x.actualSgpOdds))===q.risk&&
    Number(x.actualSgpOdds)===Number(q.americanOdds));
  if(!card||!Array.isArray(card.legs)||
    !assessNflSgpTier({risk:q.risk,legs:card.legs,
     requiredLegs:card.legs.length,
     combinedBookOdds:Number(q.americanOdds)}).compositionOk||
     Number(q.americanOdds)<NFL_SGP_TIERS[q.risk]?.minOdds||
     Number(q.americanOdds)>NFL_SGP_TIERS[q.risk]?.maxOdds)continue;
  const legs=[],seen=new Set();
  for(const x of card.legs){
   const cat=String(x?.cat||x?.category||'').toLowerCase();
   const athlete=String(x?.playerID||x?.playerId||'');
   const team=String(x?.team||'').toUpperCase();
   if(!PUBLIC_NFL_CATEGORIES.includes(cat)||!athlete||!teams.has(team)||
     String(x?.eventID||x?.gameId||'')!==id||
     holds.some(h=>nflOfficialHoldMatches(x,h))){legs.length=0;break}
   const source=(Array.isArray(raw.categories?.[cat])?raw.categories[cat]:[])
    .find(row=>String(row.playerID||row.playerId)===athlete&&
      String(row.team||'').toUpperCase()===team&&
      allowed(row,cat,id,teams,holds));
   const offer=source?safeOffer(source,now,q.book,cat):null;
   if(!offer){legs.length=0;break}
   const target=cat==='td'?'Anytime TD':
    Number(x.analyticsThreshold??x.threshold);
   if(cat!=='td'&&(!Number.isFinite(target)||
     Number(offer.line)!==target)){legs.length=0;break}
   const identity=athlete+'|'+cat+'|'+String(target);
   if(seen.has(identity)){legs.length=0;break}
   seen.add(identity);
   legs.push({player:short(source.name,85),team,category:cat,
    target,bookOffer:offer,projectionNote:safeWords(source.reason,160)});
  }
  if(legs.length!==card.legs.length)continue;
  verifiedBookParlays.push({book:q.book,risk:q.risk,
   mode:'VERIFIED_BOOK_SGP',combinedOddsVerified:true,
   americanOdds:q.americanOdds,quotedAt:q.quotedAt,legs});
 }
 const verifiedQuotes=verifiedBookParlays.map(({book,risk,americanOdds,quotedAt})=>
  ({book,risk,americanOdds,quotedAt}));
 // Report only already-sanitized, currently source-verified public book offers.
 // Never upgrade unquoted model research to an actual sportsbook selection.
 const verifiedIndividualCount=stale?0:Object.values(categories).flat()
  .filter(x=>x?.bookOffer&&x.modelOnly===false).length;
 const offerEvidence={
  status:stale?'EXPIRED':verifiedIndividualCount?
   'SOURCE_VERIFIED_INDIVIDUAL_OFFERS':'NO_SOURCE_VERIFIED_INDIVIDUAL_OFFERS',
  verifiedIndividualCount,
  verifiedCombinedCount:stale?0:verifiedQuotes.length
 };
 return{...base,status:stale?'LAST_SAVED':'CURRENT',
  // Both customer and owner research views consume this exact saved version.
  // AI/market collectors publish once; pages never run separate picks.
  researchSync:{basis:'PUBLISHED_NFL_GAME_SNAPSHOT',version:updatedAt,
   injuryScreened:true,gameId:id,date},
  message:stale?
   'OLDER MODEL SNAPSHOT: projections are for historical reference only. Injury status and sportsbook prices must be rechecked before use.':
   'Pregame model estimates, not guaranteed outcomes.',
  // Expired snapshots may retain statistical history, but never expose
  // obsolete multi-leg betting slips as current or refreshable picks.
  categories,parlays:stale?[]:parlays,
  modelResearchTiers:stale?[]:modelResearchTiers,
  verifiedQuotes:stale?[]:verifiedQuotes,
  verifiedBookParlays:stale?[]:verifiedBookParlays,
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
   offerEvidence,
   status:'RESEARCH_ONLY',
   note:'A playable SGP requires confirmed lineups, current injury/inactive clearance, exact live prop offers from the chosen book, and a verified combined quote.'
  },
  updatedDataCurrent:!stale};
}
