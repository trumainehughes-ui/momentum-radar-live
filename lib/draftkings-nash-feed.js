import {draftKingsNashCategoryUrl,normalizeDraftKingsSelections} from './draftkings-explorer-adapter.js';

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
  const response=await fetchImpl(url,{method:'GET',headers:{accept:'application/json'},signal:controller.signal,redirect:'error'});
  if(!response?.ok)return {ok:false,reason:'HTTP_UNAVAILABLE',selections:[]};
  const data=await response.json();
  if(!Array.isArray(data?.events)||!Array.isArray(data?.markets))return {ok:false,reason:'INVALID_FEED',selections:[]};
  const fetchedAt=new Date(now).toISOString();
  const selections=normalizeDraftKingsSelections(data,{fetchedAt,sourceUrl:url});
  if(!selections.length)return {ok:false,reason:'NO_USABLE_SELECTIONS',sourceUrl:url,fetchedAt,selections:[]};
  return {ok:true,sourceUrl:url,fetchedAt,selections,verifiedSGPQuote:false};
 }catch{return {ok:false,reason:'FETCH_FAILED',selections:[]};}
 finally{if(timer!==undefined)clearTimeout(timer);}
}
