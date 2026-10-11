// Read-only aggregation of per-game ESPN-backed NFL market snapshots.
// Never synthesize sportsbook lines or treat a model projection as a book price.
export const NFL_RANK_CATEGORIES=['td','passing','rushing','receiving','receptions'];
export const NFL_MARKET_RESPONSE_SCHEMA='v92-strict-nuke-profit-20261011'+
 '-nuke-roster-adaptive-1-game-identity-2'+
 '-day-ahead-roles-v5-teamid-depthchart';
export const NFL_MARKET_SNAPSHOT_ROOT='momentum-nfl-markets/v2/';
const excluded=/\b(?:OUT|INACTIVE|INJURED RESERVE|IR|SUSPENDED|DOUBTFUL)\b/i;
const finite=n=>n!==null&&n!==undefined&&String(n).trim()!==''&&Number.isFinite(Number(n));
const validId=v=>/^\d{7,12}$/.test(String(v||''));
function verifiedSingleTouchdownOffer(row){
 const b=row?.bestBook;
 const odds=b?.odds;
 return Boolean(b&&['DraftKings','FanDuel'].includes(b.book)&&
   odds!==null&&odds!==undefined&&String(odds).trim()!==''&&
   Number.isFinite(Number(odds))&&Number(odds)!==0&&
   String(row?.verifiedAt||'').trim());
}

export function nflSlateSnapshotPrefix(date){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date||'')))return null;
 return NFL_MARKET_SNAPSHOT_ROOT+NFL_MARKET_RESPONSE_SCHEMA+'-'+date+'-';
}
export function nflSlateSnapshotPathValid(path,date){
 const prefix=nflSlateSnapshotPrefix(date);
 return Boolean(prefix&&typeof path==='string'&&path.startsWith(prefix)&&
  /^\d{7,12}\.json$/.test(path.slice(prefix.length)));
}
export function buildNflSlateRankings(snapshots,{date,now=Date.now(),limit=10}={}){
 const categories=Object.fromEntries(NFL_RANK_CATEGORIES.map(c=>[c,[]]));
 const games=new Set(),ages=[],screened=new Set();
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
      (cat==='td'?!verifiedSingleTouchdownOffer(x):
       !finite(x.projection)||Number(x.projection)<=0)||
      excluded.test([x.injuryStatus,x.availability,x.starterStatus].join(' ')))continue;
    // Include only players already qualified by the single-game backend.
    // The source may have no priced prop; rank model values independently.
    categories[cat].push({...x,gameId,modelAsOf:new Date(checkedAt).toISOString(),
     snapshotAgeMinutes:Math.max(0,Math.floor((now-checkedAt)/60000))});
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
   (cat==='td'?0:Number(b.projection)-Number(a.projection))||
   Number(b.confidence||0)-Number(a.confidence||0)||
   Number(b.gamesPlayed||0)-Number(a.gamesPlayed||0)||
   String(a.name).localeCompare(String(b.name)))
   .filter(x=>{
    const key=String(x.playerID)+'|'+cat;
    if(seen.has(key))return false;
    seen.add(key);return true;
   }).slice(0,cap).map((x,i)=>({...x,rank:i+1}));
 }
 return{categories,gamesWithProjections:games.size,
  injuryScreenedGames:screened.size,
  oldestSnapshotAt:ages.length?new Date(Math.min(...ages)).toISOString():null,
  newestSnapshotAt:ages.length?new Date(Math.max(...ages)).toISOString():null,
  modelOnly:true,source:'PREVIOUSLY_SAVED_GAME_ANALYTICS',
  note:'Top 10 passing/rushing/receiving/receptions are saved pregame ESPN model projections, not live results. Anytime TD lists only individually verified sportsbook market observations; combined SGP pricing is separate. Snapshot data is not live in-game production.',
  tdMarketVerificationRequired:true};
}
