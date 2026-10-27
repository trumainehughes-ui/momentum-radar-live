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
 const complete=results.every(r=>r.ok);
 return {ok:complete,complete,
  categories:results.map(({stat,ok,reason,sourceUrl,fetchedAt,selections})=>({
   stat,ok,reason:reason??null,sourceUrl:sourceUrl??null,
   fetchedAt:fetchedAt??null,count:selections.length})),
  // Preserve per-category diagnostics, but never return actionable partial
  // sportsbook selections when any required category is unavailable.
  selections:complete?results.flatMap(r=>r.selections.map(s=>({...s,stat:r.stat}))):[],
  verifiedSGPQuote:false};
}

/** Strict handoff for a complete NFL book snapshot. Individual categories may
 * remain visible for diagnostics but cannot silently qualify a partial slate. */
export function eligibleDraftKingsNflPlayerProps(snapshot,{isActiveStarter,isCurrentGame,now=Date.now()}={}){
 const expectedStats=new Set(DK_NFL_PLAYER_PROP_CATEGORIES.map(c=>c.stat));
 if(snapshot?.ok!==true||snapshot?.complete!==true||
    !Array.isArray(snapshot.categories)||snapshot.categories.length!==expectedStats.size||
    snapshot.categories.some(c=>c?.ok!==true||!expectedStats.has(c.stat))||
    new Set(snapshot.categories.map(c=>c.stat)).size!==expectedStats.size||
    !Array.isArray(snapshot.selections)||
    snapshot.selections.some(s=>!s||!expectedStats.has(s.stat)))return [];
 return eligibleNashPlayerProps({ok:true,selections:snapshot.selections},
  {isActiveStarter,isCurrentGame,now});
}

/** Read-only match between verified DK event IDs and independently confirmed
 * game/player IDs. Names alone never establish a current-game match. */
export function eligibleDraftKingsWithEvidence(snapshot,{games=[],players=[],now=Date.now()}={}){
 if(!Array.isArray(games)||!Array.isArray(players))return [];
 const activeGames=new Set(games.filter(g=>g?.confirmed===true&&g?.scheduled===true&&
  g?.draftKingsEventId!=null&&Number.isFinite(Date.parse(g.kickoff))&&
  Date.parse(g.kickoff)>now).map(g=>String(g.draftKingsEventId)));
 const eligiblePlayers=new Set(players.filter(p=>p?.confirmed===true&&
  p?.active===true&&p?.starterOrHighSnap===true&&
  p?.draftKingsEventId!=null&&typeof p?.name==='string'&&p.name.trim())
  .map(p=>String(p.draftKingsEventId)+'|'+p.name.trim().toLowerCase()));
 return eligibleDraftKingsNflPlayerProps(snapshot,{
  now,isCurrentGame:({eventId})=>activeGames.has(String(eventId)),
  isActiveStarter:({eventId,player})=>eligiblePlayers.has(String(eventId)+'|'+String(player).trim().toLowerCase())
 });
}

/** Translate an independently verified ESPN schedule + explicit bookmaker
 * event crosswalk into evidence records. ESPN IDs are NEVER assumed equal
 * to DraftKings IDs. Unknown status and ambiguous mappings fail closed. */
export function draftKingsGamesFromEspnSchedule(espnEvents,{eventCrosswalk=[],now=Date.now()}={}){
 if(!Array.isArray(espnEvents)||!Array.isArray(eventCrosswalk)||!Number.isFinite(now))return [];
 const mappings=new Map(),ambiguous=new Set();
 for(const mapping of eventCrosswalk){
  if(mapping?.confirmed!==true||!/^\d+$/.test(String(mapping.espnEventId||''))||
     !/^\d+$/.test(String(mapping.draftKingsEventId||'')))continue;
  const id=String(mapping.espnEventId),dk=String(mapping.draftKingsEventId);
  if(mappings.has(id)&&mappings.get(id)!==dk)ambiguous.add(id);
  mappings.set(id,dk);
 }
 const seen=new Set();
 return espnEvents.flatMap(event=>{
  const id=String(event?.id||''),dk=mappings.get(id);
  const kickoff=Date.parse(String(event?.date||''));
  const competition=event?.competitions?.[0];
  const status=competition?.status?.type||event?.status?.type;
  const scheduled=status?.name==='STATUS_SCHEDULED'&&status?.completed===false;
  if(!dk||ambiguous.has(id)||seen.has(dk)||!scheduled||
     !Number.isFinite(kickoff)||kickoff<=now)return [];
  seen.add(dk);
  return [{confirmed:true,scheduled:true,draftKingsEventId:dk,
   espnEventId:id,kickoff:new Date(kickoff).toISOString()}];
 });
}

/** Public ESPN schedule fetch; no inferred bookmaker event IDs. */
export async function fetchEspnNflSchedule({date,fetchImpl=globalThis.fetch,now=Date.now()}={}){
 if(!/^20\d{6}$/.test(String(date||''))||typeof fetchImpl!=='function'||
    !Number.isFinite(now)||Math.abs(now-Date.now())>60_000)
  return {ok:false,reason:'INVALID_REQUEST',events:[]};
 const url='https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates='+date+'&limit=100';
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),8000);
 try{
  const response=await fetchImpl(url,{method:'GET',signal:controller.signal,redirect:'error',cache:'no-store',headers:{accept:'application/json'}});
  if(!response?.ok)return {ok:false,reason:'HTTP_UNAVAILABLE',events:[]};
  const type=response.headers?.get?.('content-type');
  if(type&&!/\bapplication\/json\b|\+json\b/i.test(type))return {ok:false,reason:'INVALID_CONTENT_TYPE',events:[]};
  const length=Number(response.headers?.get?.('content-length'));
  if(Number.isFinite(length)&&length>2_000_000)return {ok:false,reason:'RESPONSE_TOO_LARGE',events:[]};
  let payload;
  if(response.body?.getReader){
   const reader=response.body.getReader(),chunks=[];let total=0;
   try{while(true){const {done,value}=await reader.read();if(done)break;
    total+=value.byteLength;if(total>2_000_000){await reader.cancel();return {ok:false,reason:'RESPONSE_TOO_LARGE',events:[]};}
    chunks.push(value);}}finally{reader.releaseLock();}
   const bytes=new Uint8Array(total);let offset=0;
   for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
   payload=JSON.parse(new TextDecoder().decode(bytes));
  }else{
   payload=await response.json();
   if(new TextEncoder().encode(JSON.stringify(payload)).byteLength>2_000_000)return {ok:false,reason:'RESPONSE_TOO_LARGE',events:[]};
  }
  if(!Array.isArray(payload?.events))return {ok:false,reason:'INVALID_FEED',events:[]};
  return {ok:true,sourceUrl:url,fetchedAt:new Date().toISOString(),events:payload.events};
 }catch{return {ok:false,reason:'FETCH_FAILED',events:[]};}
 finally{clearTimeout(timer);}
}

/** Produce review-only DK/ESPN event matches. Team identity and kickoff must
 * agree; a candidate is NOT confirmation and cannot pass eligibility gates. */
export function draftKingsEspnEventCandidates(dkEvents,espnEvents,{maxKickoffDeltaMs=300000}={}){
 if(!Array.isArray(dkEvents)||!Array.isArray(espnEvents))return [];
 const teams=event=>{
  const competitors=event?.competitions?.[0]?.competitors;
  if(!Array.isArray(competitors)||competitors.length!==2)return null;
  const names=competitors.map(c=>String(c?.team?.displayName||'').trim().toLowerCase());
  return names.every(Boolean)?names.sort().join('|'):null;
 };
 const candidates=[];
 for(const dk of dkEvents){
  const dkId=String(dk?.id??dk?.eventId??'');
  const dkDate=Date.parse(String(dk?.startDate??dk?.startTime??''));
  const dkNames=Array.isArray(dk?.teamNames)?dk.teamNames.map(n=>String(n).trim().toLowerCase()).sort().join('|'):null;
  if(!/^\\d+$/.test(dkId)||!Number.isFinite(dkDate)||!dkNames)continue;
  for(const espn of espnEvents){
   const espnId=String(espn?.id||''),espnDate=Date.parse(String(espn?.date||''));
   if(!/^\\d+$/.test(espnId)||!Number.isFinite(espnDate)||
      Math.abs(dkDate-espnDate)>maxKickoffDeltaMs||teams(espn)!==dkNames)continue;
   candidates.push({draftKingsEventId:dkId,espnEventId:espnId,
    kickoffDeltaMs:Math.abs(dkDate-espnDate),confirmed:false});
  }
 }
 const dkCount=new Map(),espnCount=new Map();
 for(const c of candidates){
  dkCount.set(c.draftKingsEventId,(dkCount.get(c.draftKingsEventId)||0)+1);
  espnCount.set(c.espnEventId,(espnCount.get(c.espnEventId)||0)+1);
 }
 return candidates.filter(c=>dkCount.get(c.draftKingsEventId)===1&&espnCount.get(c.espnEventId)===1);
}
