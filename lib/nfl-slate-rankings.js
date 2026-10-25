// Read-only aggregation of per-game ESPN-backed NFL market snapshots.
// Never synthesize sportsbook lines or treat a model projection as a book price.
import {nflBookOfferEligible} from './nfl-book-offer-provenance.js';
import {NFL_SGP_SNAPSHOT_SCHEMA} from './nfl-sgp-snapshot-status.js';
import {nflInjuryRecommendationHold} from './nfl-injury-evidence.js';
import {nflOfficialTransactionHolds,nflOfficialHoldMatches} from './nfl-official-transaction-holds.js';
export const NFL_RANK_CATEGORIES=['td','passing','rushing','receiving','receptions'];
// Shared with the immutable NFL markets writer; prevents silent namespace drift.
export const NFL_MARKET_RESPONSE_SCHEMA=NFL_SGP_SNAPSHOT_SCHEMA;
export const NFL_MARKET_SNAPSHOT_ROOT='momentum-nfl-markets/v2/';
const excluded=/\b(?:OUT|INACTIVE|INJURED RESERVE|IR|SUSPENDED|DOUBTFUL)\b/i;
export const NFL_BOOK_OFFER_TTL_MS=15*60_000;
const finite=n=>n!==null&&n!==undefined&&String(n).trim()!==''&&Number.isFinite(Number(n));
const validId=v=>/^\d{7,12}$/.test(String(v||''));
function validBookAsOf(row,ageMillis,now){
 if(ageMillis<0||ageMillis>NFL_BOOK_OFFER_TTL_MS)return false;
 const stamp=Date.parse(String(row?.verifiedAt||''));
 return Number.isFinite(stamp)&&stamp<=now+60_000&&
   now-stamp>=0&&now-stamp<=NFL_BOOK_OFFER_TTL_MS;
}
function verifiedSingleTouchdownOffer(row,ageMillis,now){
 if(!validBookAsOf(row,ageMillis,now)||row?.modelOnly===true)return false;
 const b=row?.bestBook;
 return Boolean(b&&['DraftKings','FanDuel'].includes(b.book)&&
  nflBookOfferEligible(row,b,b.book,now));
}

function verifiedModelTd(row){
 const pct=Number(row?.modelTdPercent),e=row?.evidence||{};
 return row?.tdModelStatus==='ESPN_MATCHUP_MODEL'&&
  row?.modelOnly===true&&Number.isFinite(pct)&&pct>=3&&pct<=73&&
  Number.isInteger(Number(e.games))&&Number(e.games)>=2&&
  finite(e.opportunitiesPerGame)&&Number(e.opportunitiesPerGame)>=2;
}
// A Sunday Top 10 is a scoring-likelihood ranking, not an odds or popularity list.
// AI reviews may explain these numbers, but cannot inject new athletes or prices.
const norm=x=>String(x||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
function tdInjuryHold(row,body,date,gameId){
 const teams=[body.home,body.away].filter(Boolean).map(norm);
 if(teams.length===2&&!teams.includes(norm(row.team)))return true;
 const holds=nflOfficialTransactionHolds({gameId,date,home:body.home,away:body.away});
 if(holds.some(h=>nflOfficialHoldMatches(row,h)))return true;
 const records=Array.isArray(body.validation?.injuryEvidence)?body.validation.injuryEvidence:[];
 return records.some(r=>{
  if(norm(r.team)!==norm(row.team)||!nflInjuryRecommendationHold(r))return false;
  const id=String(row.playerID||row.playerId||''),rid=String(r.playerId||r.playerID||'');
  return Boolean(id&&rid&&id===rid)||norm(r.name)===norm(row.name)||
   (Array.isArray(r.aliases)&&r.aliases.some(a=>norm(a)===norm(row.name)));
 });
}
function tdRankScore(row){
 const pct=Number(row.modelTdPercent),sample=Number(row.evidence?.games)||0;
 // Discount the lowest-sample model estimates; do not pretend this is a
 // calibrated touchdown probability or independent positive-EV signal.
 return Number((pct-Math.max(0,6-Math.min(6,sample))*0.75).toFixed(2));
}
export function nflSlateSnapshotPrefix(date){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date||'')))return null;
 return NFL_MARKET_SNAPSHOT_ROOT+NFL_MARKET_RESPONSE_SCHEMA+'-'+date+'-';
}
export function nflSlateSnapshotGameId(path,date){
 const prefix=nflSlateSnapshotPrefix(date);
 if(!prefix||typeof path!=='string'||!path.startsWith(prefix))return null;
 const tail=path.slice(prefix.length);
 // Accept the immutable reverse-timestamp paths used by the active writer,
 // plus legacy flat snapshots while they remain in Blob storage.
 const match=tail.match(/^(\d{7,12})(?:\/(\d{13}(?:-[A-Za-z0-9_-]+)?)|)\.json$/);
 return match?match[1]:null;
}
export function nflSlateSnapshotPathValid(path,date){
 return nflSlateSnapshotGameId(path,date)!==null;
}
export function nflSlateNewestSnapshotBlobs(blobs,date){
 const newest=new Map(),prefix=nflSlateSnapshotPrefix(date);
 for(const blob of Array.isArray(blobs)?blobs:[]){
  const id=nflSlateSnapshotGameId(blob?.pathname,date);
  if(!id)continue;
  const tail=blob.pathname.slice(prefix.length);
  const versioned=tail.startsWith(id+'/');
  const old=newest.get(id);
  if(!old||versioned&&!old.versioned||
    versioned===old.versioned&&blob.pathname<old.blob.pathname)
   newest.set(id,{blob,versioned});
 }
 return [...newest.values()].map(x=>x.blob);
}
export function buildNflSlateRankings(snapshots,{date,now=Date.now(),limit=10}={}){
 const categories=Object.fromEntries(NFL_RANK_CATEGORIES.map(c=>[c,[]]));
 const games=new Set(),ages=[],screened=new Set();
 const categoryGames=Object.fromEntries(NFL_RANK_CATEGORIES.map(c=>[c,new Set()]));
 const tdGameSnapshots=new Map();
 for(const snapshot of Array.isArray(snapshots)?snapshots:[]){
  const body=snapshot?.body,gameId=String(body?.gameId||'');
  if(body?.ok!==true||body?.date!==date||!validId(gameId)||
    !snapshot?.at||!Number.isFinite(Number(snapshot.at))||
    Number(snapshot.at)>now+60_000||
    !body?.categories||typeof body.categories!=='object')continue;
  const checkedAt=Number(snapshot.at);
  let contributed=false;
  for(const cat of NFL_RANK_CATEGORIES){
   const list=body.categories[cat];
   if(!Array.isArray(list))continue;
   for(const x of list){
    if(!x||String(x.eventID||'')!==gameId||
      !String(x.name||'').trim()||!String(x.team||'').trim()||
      !String(x.playerID||'').trim()||
      body.validation?.injuryEligibilityChecked!==true||
      (cat==='td'?!verifiedModelTd(x)||
       tdInjuryHold(x,body,date,gameId):
       !finite(x.projection)||Number(x.projection)<=0)||
      excluded.test([x.injuryStatus,x.availability,x.starterStatus].join(' '))||
      (cat==='td'&&/\b(?:QUESTIONABLE|PUP|NFI|PROBABLE|INJURED RESERVE|SUSPENDED)\b/i.test(
       [x.injuryStatus,x.availability,x.starterStatus].join(' '))))continue;
    // Include only players already qualified by the single-game backend.
    // The source may have no priced prop; rank model values independently.
    const freshBook=validBookAsOf(x,now-checkedAt,now);
    // Keep independent model analysis, but never present an unproven
    // individual offer as current bookmaker data in the Top 10 UI.
    const verifiedIndividualOffer=freshBook&&
     (cat==='td'?verifiedSingleTouchdownOffer(x,now-checkedAt,now):
      Boolean(x.bestBook&&['DraftKings','FanDuel'].includes(x.bestBook.book)&&
       nflBookOfferEligible(x,x.bestBook,x.bestBook.book,now)));
    const safeRow={...x,gameId,verifiedIndividualOffer,
     ...(cat==='td'?{
      tdRankScore:tdRankScore(x),tdRankBasis:'Historical touchdowns, rushing/receiving opportunities, opposing defense and sample reliability',
      scorerPrediction:true
     }:{}),
     modelAsOf:new Date(checkedAt).toISOString(),
     snapshotAgeMinutes:Math.max(0,Math.floor((now-checkedAt)/60000))};
    if(!verifiedIndividualOffer){
     safeRow.bestBook=null;safeRow.bookOffer=null;
     safeRow.books=[];safeRow.sportsbooks={};
    }
    categories[cat].push(safeRow);
    categoryGames[cat].add(gameId);
    if(cat==='td')tdGameSnapshots.set(gameId,Math.max(tdGameSnapshots.get(gameId)||0,checkedAt));
    contributed=true;
   }
  }
  if(contributed){
   games.add(gameId);
   ages.push(checkedAt);
   if(body.validation?.injuryEligibilityChecked===true)screened.add(gameId);
  }
 }
 const cap=Math.max(1,Math.min(10,Math.floor(Number(limit)||10)));
 for(const cat of NFL_RANK_CATEGORIES){
  const seen=new Set();
  categories[cat]=categories[cat].sort((a,b)=>
   (cat==='td'?(Number(b.tdRankScore||0)-Number(a.tdRankScore||0)):Number(b.projection)-Number(a.projection))||
   Number(b.confidence||0)-Number(a.confidence||0)||
   Number(b.gamesPlayed||0)-Number(a.gamesPlayed||0)||
   String(a.name).localeCompare(String(b.name)))
   .filter(x=>{
    const key=String(x.playerID)+'|'+cat;
    if(seen.has(key))return false;
    seen.add(key);return true;
   }).slice(0,cap).map((x,i)=>({...x,rank:i+1}));
 }
 return{categories,categoryGameCounts:Object.fromEntries(NFL_RANK_CATEGORIES.map(cat=>[cat,categoryGames[cat].size])),
  tdGameSnapshots:[...tdGameSnapshots.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([gameId,at])=>({gameId,at:new Date(at).toISOString()})),
  verifiedTdOffers:categories.td.filter(x=>x.verifiedIndividualOffer===true).length,
  tdRankingMethod:'ESPN_HISTORICAL_TD_USAGE_OPPONENT_DVP_SAMPLE_ADJUSTED',
  tdRankedScorers:categories.td.length,
  gamesWithProjections:games.size,
  injuryScreenedGames:screened.size,
  oldestSnapshotAt:ages.length?new Date(Math.min(...ages)).toISOString():null,
  newestSnapshotAt:ages.length?new Date(Math.max(...ages)).toISOString():null,
  modelOnly:true,source:'PREVIOUSLY_SAVED_GAME_ANALYTICS',
  note:'Top 10 passing/rushing/receiving/receptions are saved pregame ESPN model projections, not live results. Anytime TD ranks ten eligible scoring candidates by risk-adjusted TD model evidence from all analyzed matchups, without requiring a sportsbook price. Player odds appear only when freshly source-verified. Combined SGP pricing is separate. Snapshot data is not live in-game production.',
  tdMarketVerificationRequired:true,tdModelCandidatesAllowed:true};
}
