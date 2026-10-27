import {draftKingsNashCategoryUrl,normalizeDraftKingsSelections,eligibleDraftKingsProp} from './draftkings-explorer-adapter.js';

/** Fetch public Nash data without browser impersonation or invented odds.
 * A network failure, malformed feed or stale snapshot returns no usable props.
 * Callers must still validate starter status and exact offered lines. */
export async function fetchDraftKingsNashSelections({leagueId,categoryId,subcategoryId,fetchImpl=globalThis.fetch,now=Date.now(),timeoutMs=8000}={}){
 const url=draftKingsNashCategoryUrl({leagueId,categoryId,subcategoryId});
 if(!url||typeof fetchImpl!=='function'||!Number.isFinite(now))return {ok:false,reason:'INVALID_REQUEST',selections:[]};
 const controller=new AbortController();
 const timeout=Number.isFinite(timeoutMs)?Math.max(1000,Math.min(15000,timeoutMs)):8000;
 let timer;
 try{
  timer=setTimeout(()=>controller.abort(),timeout);
  const response=await fetchImpl(url,{method:'GET',headers:{accept:'application/json'},signal:controller.signal,redirect:'error',cache:'no-store'});
  if(!response?.ok)return {ok:false,reason:'HTTP_UNAVAILABLE',selections:[]};
  const contentType=response.headers?.get?.('content-type');
  if(contentType && !/\bapplication\/json\b|\+json\b/i.test(contentType))return {ok:false,reason:'INVALID_CONTENT_TYPE',selections:[]};
  const data=await response.json();
  if(!Array.isArray(data?.events)||!Array.isArray(data?.markets))return {ok:false,reason:'INVALID_FEED',selections:[]};
  const fetchedAt=new Date(now).toISOString();
  const selections=normalizeDraftKingsSelections(data,{fetchedAt,sourceUrl:url});
  if(!selections.length)return {ok:false,reason:'NO_USABLE_SELECTIONS',sourceUrl:url,fetchedAt,selections:[]};
  return {ok:true,sourceUrl:url,fetchedAt,selections,verifiedSGPQuote:false};
 }catch{return {ok:false,reason:'FETCH_FAILED',selections:[]};}
 finally{if(timer!==undefined)clearTimeout(timer);}
}

/** Research-only handoff: require independently confirmed starters and exact
 * offered thresholds. Never upgrades individual selections to SGP quotes. */
export function eligibleNashPlayerProps(feed,{isActiveStarter,now=Date.now()}={}){
 if(feed?.ok!==true||typeof isActiveStarter!=='function'||!Array.isArray(feed.selections))return [];
 const offeredByMarket=new Map();
 for(const prop of feed.selections){
  const key=[prop.eventId,prop.marketId,prop.player].join('|');
  if(!offeredByMarket.has(key))offeredByMarket.set(key,new Set());
  offeredByMarket.get(key).add(prop.line);
 }
 return feed.selections.filter(prop=>{
  const activeStarter=isActiveStarter({player:prop.player,eventId:prop.eventId,marketName:prop.marketName})===true;
  const offeredLines=[...(offeredByMarket.get([prop.eventId,prop.marketId,prop.player].join('|'))||[])];
  return eligibleDraftKingsProp(prop,{activeStarter,offeredLines,now}) && prop.verifiedSGPQuote===false;
 });
}
