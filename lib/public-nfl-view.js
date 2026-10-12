// Read-only presentation boundary for shareable NFL prediction pages.
// Never return provider IDs, upstream diagnostics, raw model snapshots, or API
// request instructions. Model forecasts and sportsbook quotes remain distinct.
import {nflSgpSnapshotReadiness,NFL_SGP_SNAPSHOT_TTL_MS}
 from './nfl-sgp-snapshot-status.js';

export const PUBLIC_NFL_CATEGORIES=['td','passing','rushing','receiving','receptions'];
export const PUBLIC_NFL_TIERS=['Small','Medium','Nuke'];
const blocked=/\b(?:OUT|INACTIVE|IR|INJURED RESERVE|DOUBTFUL|QUESTIONABLE|SUSPENDED|SUSPEND)\b/i;
const isInt=n=>Number.isSafeInteger(n);
const finite=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x));
const bounded=(n,lo,hi)=>Number.isFinite(Number(n))?Math.max(lo,Math.min(hi,Number(n))):null;
const short=(x,n=120)=>String(x??'').trim().slice(0,n);
const validGameId=v=>/^\d{7,12}$/.test(String(v||''));
const validTeam=v=>/^[A-Z]{2,4}$/.test(String(v||'').toUpperCase());
const round1=v=>Math.round(v*10)/10;
const numericId=v=>String(v||'').trim().length>0;
function allowed(x,cat,gameId,teams){
 return x&&String(x.eventID||x.gameId||'')===gameId&&
  teams.has(String(x.team||'').toUpperCase())&&
  numericId(x.playerID||x.playerId)&&short(x.name)&&
  !blocked.test([x.injuryStatus,x.availability,x.starterStatus].join(' '))&&
  PUBLIC_NFL_CATEGORIES.includes(cat);
}
function marketRow(x,cat){
 const sample=bounded(x.gamesPlayed??x.evidence?.games,0,30);
 const base={name:short(x.name,85),team:short(x.team,4),
  position:short(x.position,3),category:cat,
  modelOnly:true,gameSample:sample,
  momentumRating:bounded(x.momentumScore,0,100)};
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
   opponentTdRank:bounded(e.defenseRank,1,32)};
 }
 const projection=x.projection;
 if(!finite(projection)||Number(projection)<=0)return null;
 const yards=['passing','rushing','receiving'].includes(cat);
 const value=yards?Math.round(Number(projection)/5)*5:round1(Number(projection));
 if(value<=0)return null;
 return{...base,label:cat==='receptions'?'Receptions':cat[0].toUpperCase()+cat.slice(1)+' yards',
  projection:value,unit:cat==='receptions'?'receptions':'yards'};
}
function modelLeg(x,gameId,teams){
 const cat=String(x?.cat||x?.category||'');
 if(!allowed(x,cat,gameId,teams))return null;
 const raw=x.analyticsThreshold??x.threshold;
 if(cat==='td')return{player:short(x.name,85),team:short(x.team,4),
  category:cat,target:'Anytime TD'};
 if(!finite(raw))return null;
 const n=Number(raw);
 if(['passing','rushing','receiving'].includes(cat)){
  if(!isInt(n)||n<5||n%5!==0)return null;
  return{player:short(x.name,85),team:short(x.team,4),category:cat,
   target:n+'+ yards'};
 }
 if(cat==='receptions'&&isInt(n)&&n>=1)
  return{player:short(x.name,85),team:short(x.team,4),category:cat,
   target:n+'+ receptions'};
 return null;
}
function tierCard(card,risk,gameId,teams){
 const legs=Array.isArray(card?.legs)?card.legs:[];
 const required=risk==='Small'?4:risk==='Medium'?5:null;
 if(card?.risk!==risk||card?.tierAssessment?.compositionOk!==true||
    !legs.length||(required!==null&&legs.length!==required)||
    (risk==='Nuke'&&(legs.length<5||legs.length>7)))return null;
 const safe=legs.map(x=>modelLeg(x,gameId,teams));
 if(safe.some(x=>!x))return null;
 return{risk,mode:'MODEL_ONLY',legs:safe,legCount:safe.length,
  combinedOddsVerified:false};
}
export function publicNflGameView(snapshot,{date,gameId,now=Date.now()}={}){
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
 if(age>NFL_SGP_SNAPSHOT_TTL_MS)return{...base,status:'STALE',
  message:'Predictions are waiting for a fresh scheduled update.',
  categories:emptyCategories,parlays:[],verifiedQuotes:[]};
 if(raw.validation?.injuryEligibilityChecked!==true||teams.size!==2||
  !validTeam(home)||!validTeam(away))return{...base,status:'REVIEW',
  message:'Player eligibility checks are incomplete for this matchup.',
  categories:emptyCategories,parlays:[],verifiedQuotes:[]};
 const categories=Object.fromEntries(PUBLIC_NFL_CATEGORIES.map(cat=>{
  const rows=(Array.isArray(raw.categories?.[cat])?raw.categories[cat]:[])
   .filter(x=>allowed(x,cat,id,teams)).map(x=>marketRow(x,cat))
   .filter(Boolean)
   .sort((a,b)=>cat==='td'?
    Number(b.modelChancePct)-Number(a.modelChancePct):
    Number(b.projection)-Number(a.projection)).slice(0,8);
  return[cat,rows];
 }));
 const cards=Array.isArray(raw.sgps?.Analytics)?raw.sgps.Analytics:[];
 const parlays=PUBLIC_NFL_TIERS.map(risk=>tierCard(
  cards.find(c=>c?.risk===risk),risk,id,teams)).filter(Boolean);
 // Only previously authenticated, still-fresh correlated quotes pass this
 // existing strict verifier; model cards NEVER inherit their quoted odds.
 const readiness=nflSgpSnapshotReadiness(snapshot,{now,gameId:id});
 const verifiedQuotes=Array.isArray(readiness.bookQuotes)?
  readiness.bookQuotes.map(q=>({book:q.book,risk:q.risk,
   americanOdds:q.americanOdds,quotedAt:q.quotedAt})).slice(0,6):[];
 return{...base,status:'CURRENT',message:'Pregame model estimates, not guaranteed outcomes.',
  categories,parlays,verifiedQuotes};
}
