// ESPN /teams/{abbr}/roster currently has both position-grouped and
// flat layouts depending on endpoint/version. Preserve athlete identity
// rather than interpreting an empty items[] layout as an empty NFL roster.
export function nflCurrentRosterAthletes(payload){
 const roots=Array.isArray(payload?.athletes)?payload.athletes:
  Array.isArray(payload?.team?.athletes)?payload.team.athletes:
  Array.isArray(payload?.team?.roster?.athletes)?payload.team.roster.athletes:
  Array.isArray(payload?.roster?.athletes)?payload.roster.athletes:
  Array.isArray(payload?.items)?payload.items:[];
 const items=roots.flatMap(group=>{
  const category=String(group?.name||group?.displayName||group?.position?.name||
   group?.position?.displayName||group?.group||'');
  const attach=(items,label)=>items.map(item=>({item,rosterGroup:label}));
  if(Array.isArray(group?.items))return attach(group.items,category);
  if(Array.isArray(group?.athletes))return attach(group.athletes,category);
  if(Array.isArray(group?.positions))return group.positions.flatMap(p=>
   attach(p?.items||p?.athletes||[],String(p?.name||p?.displayName||category)));
  return(group?.id||group?.athlete?.id)?attach([group],category):[];
 });
 const byId=new Map();
 for(const wrapped of items){
  const item=wrapped.item,a=item?.athlete||item,id=String(a?.id||''),
   name=String(a?.displayName||a?.fullName||a?.name||'').trim(),
   position=a?.position?.abbreviation||item?.position?.abbreviation||null,
   rosterStatus=String(a?.status?.name||a?.status?.type||a?.status?.description||
     a?.status||item?.status?.name||item?.status||'').slice(0,90);
  if(!/^\d{3,16}$/.test(id)||!name)continue;
  byId.set(id,{id,name,position,rosterGroup:wrapped.rosterGroup,rosterStatus});
 }
 return [...byId.values()];
}

/** Fetch an official ESPN team roster without treating roster membership as
 * proof of availability, starting role, or injury clearance. */
export async function fetchEspnNflRoster(teamAbbreviation,{
 fetchImpl=globalThis.fetch,timeoutMs=8000
}={}){
 const team=String(teamAbbreviation||'').trim().toLowerCase();
 if(!/^[a-z]{2,4}$/.test(team)||typeof fetchImpl!=='function'||
    !Number.isFinite(timeoutMs)||timeoutMs<1||timeoutMs>15000)
  return {ok:false,reason:'INVALID_REQUEST',athletes:[]};
 const sourceUrl='https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/'+team+'/roster';
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const response=await fetchImpl(sourceUrl,{method:'GET',cache:'no-store',
   redirect:'error',signal:controller.signal,headers:{accept:'application/json'}});
  if(!response?.ok)return {ok:false,reason:'HTTP_UNAVAILABLE',athletes:[]};
  const size=Number(response.headers?.get?.('content-length'));
  if(Number.isFinite(size)&&size>2000000)return {ok:false,reason:'RESPONSE_TOO_LARGE',athletes:[]};
  const type=response.headers?.get?.('content-type');
  if(type&&!type.toLowerCase().includes('json'))return {ok:false,reason:'INVALID_CONTENT_TYPE',athletes:[]};
  let payload;
  if(response.body?.getReader){
   const reader=response.body.getReader(),chunks=[];let total=0;
   try{while(true){const {done,value}=await reader.read();if(done)break;
    total+=value.byteLength;
    if(total>2000000){await reader.cancel();return {ok:false,reason:'RESPONSE_TOO_LARGE',athletes:[]};}
    chunks.push(value);}}finally{reader.releaseLock();}
   const bytes=new Uint8Array(total);let offset=0;
   for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
   payload=JSON.parse(new TextDecoder().decode(bytes));
  }else{
   payload=await response.json();
   if(new TextEncoder().encode(JSON.stringify(payload)).byteLength>2000000)
    return {ok:false,reason:'RESPONSE_TOO_LARGE',athletes:[]};
  }
  if(!Array.isArray(payload?.athletes)&&!Array.isArray(payload?.team?.athletes)&&
     !Array.isArray(payload?.items))return {ok:false,reason:'INVALID_FEED',athletes:[]};
  return {ok:true,sourceUrl,fetchedAt:new Date().toISOString(),
   athletes:nflCurrentRosterAthletes(payload),verifiedActiveStarters:false};
 }catch{return {ok:false,reason:'FETCH_FAILED',athletes:[]};}
 finally{clearTimeout(timer);}
}
