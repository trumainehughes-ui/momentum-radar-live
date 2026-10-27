import {draftKingsNashCategoryUrl,normalizeDraftKingsSelections,eligibleDraftKingsProp} from './draftkings-explorer-adapter.js';

/** Fetch public Nash data without browser impersonation or invented odds.
 * A network failure, malformed feed or stale snapshot returns no usable props.
 * Callers must still validate starter status and exact offered lines. */
export async function fetchDraftKingsNashSelections({leagueId,categoryId,subcategoryId,fetchImpl=globalThis.fetch,now=Date.now(),timeoutMs=8000}={}){
 const url=draftKingsNashCategoryUrl({leagueId,categoryId,subcategoryId});
 if(!url||typeof fetchImpl!=='function'||!Number.isFinite(now)||Math.abs(now-Date.now())>60_000)return {ok:false,reason:'INVALID_REQUEST',selections:[]};
 const controller=new AbortController();
 const timeout=Number.isFinite(timeoutMs)?Math.max(1000,Math.min(15000,timeoutMs)):8000;
 let timer;
 try{
  timer=setTimeout(()=>controller.abort(),timeout);
  const response=await fetchImpl(url,{method:'GET',headers:{accept:'application/json'},signal:controller.signal,redirect:'error',cache:'no-store'});
  if(!response?.ok)return {ok:false,reason:'HTTP_UNAVAILABLE',selections:[]};
  const contentType=response.headers?.get?.('content-type');
  if(contentType && !/\bapplication\/json\b|\+json\b/i.test(contentType))return {ok:false,reason:'INVALID_CONTENT_TYPE',selections:[]};
  const contentLength=Number(response.headers?.get?.('content-length'));
  if(Number.isFinite(contentLength)&&contentLength>2_000_000)return {ok:false,reason:'RESPONSE_TOO_LARGE',selections:[]};
  let data;
  if(response.body?.getReader){
   const reader=response.body.getReader();
   const chunks=[];
   let total=0;
   try{
    while(true){
     const {done,value}=await reader.read();
     if(done)break;
     total+=value.byteLength;
     if(total>2_000_000){await reader.cancel();return {ok:false,reason:'RESPONSE_TOO_LARGE',selections:[]};}
     chunks.push(value);
    }
   }finally{reader.releaseLock();}
   const bytes=new Uint8Array(total);
   let offset=0;
   for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
   data=JSON.parse(new TextDecoder().decode(bytes));
  }else{
   data=await response.json();
   if(new TextEncoder().encode(JSON.stringify(data)).byteLength>2_000_000)return {ok:false,reason:'RESPONSE_TOO_LARGE',selections:[]};
  }
  if(!Array.isArray(data?.events)||!Array.isArray(data?.markets))return {ok:false,reason:'INVALID_FEED',selections:[]};
  const fetchedAt=new Date(Date.now()).toISOString();
  const selections=normalizeDraftKingsSelections(data,{fetchedAt,sourceUrl:url});
  if(!selections.length)return {ok:false,reason:'NO_USABLE_SELECTIONS',sourceUrl:url,fetchedAt,selections:[]};
  return {ok:true,sourceUrl:url,fetchedAt,selections,verifiedSGPQuote:false};
 }catch{return {ok:false,reason:'FETCH_FAILED',selections:[]};}
 finally{if(timer!==undefined)clearTimeout(timer);}
}

/** Research-only handoff: require independently confirmed starters and exact
 * offered thresholds. Never upgrades individual selections to SGP quotes. */
export function eligibleNashPlayerProps(feed,{isActiveStarter,isCurrentGame,now=Date.now()}={}){
 if(feed?.ok!==true||typeof isActiveStarter!=='function'||typeof isCurrentGame!=='function'||!Array.isArray(feed.selections))return [];
 const offeredByMarket=new Map();
 for(const prop of feed.selections){
  if(!prop || typeof prop!=='object')continue;
  const key=[prop.eventId,prop.marketId,prop.player].join('|');
  if(!offeredByMarket.has(key))offeredByMarket.set(key,new Set());
  offeredByMarket.get(key).add(prop.line);
 }
 return feed.selections.filter(prop=>{
  if(!prop || typeof prop!=='object')return false;
  let activeStarter=false;
  try {
   if(isCurrentGame({eventId:prop.eventId,eventName:prop.eventName})!==true)return false;
   activeStarter=isActiveStarter({player:prop.player,eventId:prop.eventId,marketName:prop.marketName})===true;
  }
  catch { return false; }
  const offeredLines=[...(offeredByMarket.get([prop.eventId,prop.marketId,prop.player].join('|'))||[])];
  return eligibleDraftKingsProp(prop,{activeStarter,offeredLines,now}) && prop.verifiedSGPQuote===false;
 });
}

/** Fetch only current first-party NFL player-prop categories confirmed in the
 * DraftKings Nash catalog on 2026-10-27. No SGP prices are inferred. */
export const DK_NFL_PLAYER_PROP_CATEGORIES=Object.freeze([
 Object.freeze({categoryId:'1000',subcategoryId:'9524',stat:'passing_yards'}),
 Object.freeze({categoryId:'1342',subcategoryId:'14114',stat:'receiving_yards'}),
 Object.freeze({categoryId:'1001',subcategoryId:'9514',stat:'rushing_yards'}),
 Object.freeze({categoryId:'1342',subcategoryId:'14115',stat:'receptions'})
]);
export async function fetchDraftKingsNflPlayerProps({fetchImpl=globalThis.fetch,now=Date.now()}={}){
 const results=await Promise.all(DK_NFL_PLAYER_PROP_CATEGORIES.map(({categoryId,subcategoryId,stat})=>
  fetchDraftKingsNashSelections({leagueId:'88808',categoryId,subcategoryId,fetchImpl,now})
   .then(result=>({stat,...result}))));
 // Never present partial category coverage as a complete sportsbook slate.
 return {ok:results.every(r=>r.ok),complete:results.every(r=>r.ok),
  categories:results.map(({stat,ok,reason,sourceUrl,fetchedAt,selections})=>({
   stat,ok,reason:reason??null,sourceUrl:sourceUrl??null,
   fetchedAt:fetchedAt??null,count:selections.length})),
  selections:results.flatMap(r=>r.selections.map(s=>({...s,stat:r.stat}))),
  verifiedSGPQuote:false};
}

/** Strict handoff for a complete NFL book snapshot. Individual categories may
 * remain visible for diagnostics but cannot silently qualify a partial slate. */
export function eligibleDraftKingsNflPlayerProps(snapshot,{isActiveStarter,isCurrentGame,now=Date.now()}={}){
 if(snapshot?.ok!==true||snapshot?.complete!==true||
    !Array.isArray(snapshot.categories)||snapshot.categories.length!==DK_NFL_PLAYER_PROP_CATEGORIES.length||
    snapshot.categories.some(c=>c?.ok!==true)||!Array.isArray(snapshot.selections))return [];
 return eligibleNashPlayerProps({ok:true,selections:snapshot.selections},
  {isActiveStarter,isCurrentGame,now});
}
