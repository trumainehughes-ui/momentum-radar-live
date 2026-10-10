// BALLDONTLIE Free reference feed — read-only, cached and NEVER a props,
// injuries, player-statistics, sportsbook, depth-chart or projection provider.
// ESPN remains the canonical event and player identity source.
import {list,put} from '@vercel/blob';
const BASE='https://api.balldontlie.io';
const PREFIX='momentum-reference/v1/bdl-free/';
export const BDL_LEAGUES=Object.freeze(['nfl','nba']);
export const BDL_TEAMS_TTL=21*24*3600*1000;
export const BDL_GAMES_TTL=20*3600*1000;
const local=new Map(),LOCAL_TTL=45_000;
const abbr=x=>String(x||'').toUpperCase().replace(/[^A-Z]/g,'');
export const bdlTeamAbbr=x=>{
 const a=abbr(x);
 return ({JAC:'JAX',WSH:'WAS',LA:'LAR',KCC:'KC'})[a]||a;
};
export const bdlIsoDay=d=>{
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
  timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'
 }).formatToParts(d).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
 return [parts.year,parts.month,parts.day].join('-');
};
const path=(league,type,date)=>PREFIX+league+'-'+type+(type==='games'?'-'+date:'')+'.json';
const text=x=>String(x??'').slice(0,125);
export function bdlFreeEndpoint(league,type,date){
 if(!BDL_LEAGUES.includes(league)||!['teams','games'].includes(type))throw Error('invalid_bdl_endpoint');
 if(type==='games'&&!/^\d{4}-\d{2}-\d{2}$/.test(date||''))throw Error('invalid_bdl_date');
 const u=new URL(BASE+(league==='nfl'?'/nfl/v1/':'/v1/')+type);
 if(type==='games'){
  u.searchParams.append('dates[]',date);
  u.searchParams.set('per_page','100');
  // NBA free /v1/games defaults to non-preseason competitions. The first
  // October dataset is only a cross-check, not a full ESPN replacement.
  if(league==='nba'&&date.slice(5,7)==='10'&&Number(date.slice(8))<20)
   u.searchParams.set('season_type','preseason');
 }
 return u.href;
}
export function bdlSanitize(league,type,raw,{date,now=Date.now()}={}){
 if(!BDL_LEAGUES.includes(league)||!['teams','games'].includes(type)||!Array.isArray(raw?.data))
  throw Error('invalid_bdl_payload');
 const limit=type==='teams'?40:100;
 const entries=raw.data.slice(0,limit).map(x=>{
  if(type==='teams')return{id:Number(x.id)||null,abbr:bdlTeamAbbr(x.abbreviation),
   name:text(x.full_name||[x.location||x.city,x.name].filter(Boolean).join(' '))};
  const home=x.home_team||{},away=x.visitor_team||x.away_team||{};
  return{id:Number(x.id)||null,date:text(x.date),home:bdlTeamAbbr(home.abbreviation),
   away:bdlTeamAbbr(away.abbreviation),status:text(x.status_state||'unknown')};
 }).filter(x=>type==='teams'?x.abbr&&x.id:x.home&&x.away&&x.home!==x.away&&x.id);
 return{league,type,date:type==='games'?date:null,items:entries,
  fetchedAt:new Date(now).toISOString(),source:'BALLDONTLIE Free',
  access:'free-basic-only',complete:!raw.meta?.next_cursor&&raw.data.length<=limit,
  // Never claim a successfully requested date is "all games" when source
  // pagination or a preseason/regular-season distinction limits the result.
  limitations:type==='games'?'Schedule cross-check only; completeness is not guaranteed.':
   'Free-tier team reference; player stats, injury/props and sportsbook odds unavailable.'};
}
export async function bdlReadSnapshot(league,type,date,{now=Date.now()}={}){
 if(!BDL_LEAGUES.includes(league)||!['games','teams'].includes(type))return null;
 if(type==='games'&&!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return null;
 const file=path(league,type,date),hit=local.get(file);
 if(hit&&now-hit.at<LOCAL_TTL)return hit.value;
 try{
  const blobs=await list({prefix:file,limit:3}),exact=blobs.blobs?.find(x=>x.pathname===file);
  if(!exact){local.set(file,{at:now,value:null});return null}
  const res=await fetch(exact.url,{cache:'no-store',signal:AbortSignal.timeout(5000)});
  if(!res.ok)throw Error('bdl_cache_unavailable');
  const snapshot=await res.json();
  if(snapshot.league!==league||snapshot.type!==type||
    type==='games'&&snapshot.date!==date||!Array.isArray(snapshot.items))throw Error('invalid_bdl_cache');
  local.set(file,{at:now,value:snapshot});return snapshot;
 }catch{return null}
}
async function bdlWriteSnapshot(league,type,date,value){
 const file=path(league,type,date);
 await put(file,JSON.stringify(value),{access:'public',allowOverwrite:true,addRandomSuffix:false});
 local.set(file,{at:Date.now(),value});
}
export async function bdlFetchFree(league,type,date,key,{fetcher=fetch}={}){
 if(!key)throw Error('bdl_not_configured');
 const url=bdlFreeEndpoint(league,type,date);
 let response;
 try{response=await fetcher(url,{
  headers:{Authorization:key,Accept:'application/json'},cache:'no-store',
  signal:AbortSignal.timeout(9000)
 })}catch{throw Error('bdl_network_unavailable')}
 if(!response.ok){
  const code=response.status;
  throw Error(code===429?'bdl_rate_limited':code===401||code===403?'bdl_key_or_tier_denied':'bdl_http_'+code);
 }
 return bdlSanitize(league,type,await response.json(),{date});
}
// Only a *secret-authenticated daily server cron* may invoke this writer.
// No normal website page, slate GET, AI, or game refresh uses an upstream BDL call.
export async function bdlRefreshDaily(key,{date=bdlIsoDay(new Date()),now=Date.now(),
 read=bdlReadSnapshot,write=bdlWriteSnapshot,fetchFree=bdlFetchFree}={}){
 const reports=[];
 for(const league of BDL_LEAGUES){
  const report={league,attempted:0,updated:[],held:[],errors:[]};
  for(const type of ['teams','games']){
   const prior=await read(league,type,date,{now});
   const ttl=type==='teams'?BDL_TEAMS_TTL:BDL_GAMES_TTL;
   const age=prior?now-Date.parse(prior.fetchedAt):Infinity;
   if(prior&&Number.isFinite(age)&&age>=0&&age<ttl){
    report.held.push(type);continue;
   }
   // At most 4 free API requests per cron invocation; cache hits make
   // subsequent days normally only 2. Never retry a 429 in this invocation.
   report.attempted++;
   try{
    const snapshot=await fetchFree(league,type,date,key);
    await write(league,type,date,snapshot);
    report.updated.push(type);
   }catch(e){report.errors.push({type,reason:text(e?.message||'bdl_unavailable')})}
  }
  reports.push(report);
 }
 return {reports,upstreamRequests:reports.reduce((n,r)=>n+r.attempted,0)};
}
export function bdlCompareGames(primary,secondary){
 const rows=Array.isArray(primary)?primary:[],ref=secondary?.items||[];
 const keys=new Set(ref.map(x=>bdlTeamAbbr(x.away)+'@'+bdlTeamAbbr(x.home)));
 const found=rows.filter(g=>keys.has(bdlTeamAbbr(g.away?.abbr)+'@'+bdlTeamAbbr(g.home?.abbr)));
 return{matched:found.length,checked:rows.length,
  sourceGames:ref.length,complete:secondary?.complete===true,
  // Miss means unmatched in optional feed, not that the ESPN game is wrong.
  unmatched:rows.length-found.length};
}
export async function bdlFreeReport(league,date,primary,{read=bdlReadSnapshot,now=Date.now()}={}){
 try{
  const [teams,games]=await Promise.all([read(league,'teams',date,{now}),read(league,'games',date,{now})]);
  const age=games?now-Date.parse(games.fetchedAt):Infinity;
  const state=!teams&&!games?'PENDING':!games||!Number.isFinite(age)||age<0||age>BDL_GAMES_TTL?'STALE':'CACHED';
  return{source:'BALLDONTLIE Free',state,role:'supplemental reference only',
   teamsCached:teams?.items?.length||0,gameCrosscheck:games?bdlCompareGames(primary,games):null,
   fetchedAt:games?.fetchedAt||null,containsPlayerStats:false,
   containsInjuries:false,containsOdds:false,containsPlayerProps:false};
 }catch{return{source:'BALLDONTLIE Free',state:'UNAVAILABLE',role:'supplemental reference only'}}
}
