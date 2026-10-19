// Bounded NFL collector planning. Pure helpers can be regression tested without
// reaching ESPN, Vercel Blob, sportsbook providers or live betting accounts.
export const MAX_NFL_COLLECTOR_CONCURRENCY=4;
export const NFL_COLLECTOR_LOOKAHEAD_MS=30*60*60*1000;
export function nflEasternDate(d=new Date()){
 return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
}
export function nflAddDate(date,days){
 const d=new Date(date+'T12:00:00Z');
 if(!Number.isFinite(d.getTime()))throw Error('invalid_date');
 d.setUTCDate(d.getUTCDate()+days);
 return d.toISOString().slice(0,10);
}
export function nflCollectorDueGames(games,{now=Date.now(),lookahead=NFL_COLLECTOR_LOOKAHEAD_MS}={}){
 const seen=new Set();
 return (Array.isArray(games)?games:[]).filter(g=>{
  const id=String(g?.gameId||''),ms=Date.parse(String(g?.kickoff||''))-now;
  if(!/^\d{7,12}$/.test(id)||seen.has(id)||g.status!=='SCHEDULED'||!Number.isFinite(ms)||ms<=0||ms>lookahead)return false;
  seen.add(id);return true;
 }).sort((a,b)=>Date.parse(a.kickoff)-Date.parse(b.kickoff));
}
export function nflTierReadiness(m){
 const rows=Array.isArray(m?.sgps?.Analytics)?m.sgps.Analytics:[];
 const prior=[];
 return Object.fromEntries(['Small','Medium','Nuke'].map(risk=>{
  const c=rows.find(x=>x.risk===risk);
  const legs=Array.isArray(c?.legs)?c.legs:[];
  const required=Number(c?.requiredLegs);
  const min=risk==='Small'?4:5,max=risk==='Nuke'?7:min;
  const countOk=Number.isInteger(required)&&required>=min&&required<=max&&legs.length===required;
  const keys=new Set(),athletes=new Map(),categories=new Set(),yardage=new Set();
  let td=0,yardageCount=0,invalid=false;
  for(const leg of legs){
   const cat=String(leg?.cat||leg?.category||'').toLowerCase();
   const id=String(leg?.playerID||leg?.playerId||leg?.name||'').trim().toUpperCase();
   if(!id||!['passing','rushing','receiving','receptions','td'].includes(cat)){invalid=true;continue;}
   const key=id+'|'+cat;
   if(keys.has(key))invalid=true;
   keys.add(key);categories.add(cat);
   athletes.set(id,(athletes.get(id)||0)+1);
   if(cat==='td')td++;
   if(['passing','rushing','receiving'].includes(cat)){yardageCount++;yardage.add(cat);}
  }
  const overlap=prior.reduce((max,previous)=>Math.max(max,
   [...keys].filter(key=>previous.has(key)).length),0);
  const overlapMax=risk==='Medium'?2:risk==='Nuke'?3:Infinity;
  const complete=Boolean(c&&countOk&&c.tierAssessment?.compositionOk===true&&!invalid&&
   [...athletes.values()].every(n=>n<=2)&&td<=(risk==='Nuke'?2:1)&&
   categories.size>=3&&yardageCount>=(risk==='Small'?2:3)&&yardage.size>=2&&overlap<=overlapMax);
  if(legs.length)prior.push(keys);
  const reason=complete?'Individual sportsbook and correlated SGP odds still unverified.':
   overlap>overlapMax?'Tier repeats too many player markets from an earlier tier.':
   String(c?.reason||c?.tierAssessment?.reason||'Incomplete or overconcentrated model tier').slice(0,200);
  return[risk,{status:complete?'MODEL_CANDIDATE':'NOT_READY',legs:complete?legs.length:0,
   combinedBookOddsVerified:false,reason}];
 }));
}
export function nflCollectorSnapshotReady(snapshot){
 const picks=Array.isArray(snapshot?.picks)?snapshot.picks:[];
 const sgps=Array.isArray(snapshot?.sgps)?snapshot.sgps:[];
 return picks.length>0||sgps.some(s=>Array.isArray(s.legs)&&s.legs.length>0);
}
export async function nflRunCollectorBatch(games,work,{concurrency=MAX_NFL_COLLECTOR_CONCURRENCY}={}){
 if(typeof work!=='function')throw Error('collector_work_required');
 const due=Array.isArray(games)?games:[],out=new Array(due.length);
 let index=0;
 const workers=Math.min(due.length,Math.max(1,Math.min(4,Math.floor(concurrency)||1)));
 await Promise.all(Array.from({length:workers},async()=>{
  for(;;){
   const i=index++;if(i>=due.length)return;
   const g=due[i];
   try{out[i]=await work(g)}
   catch(e){out[i]={gameId:g?.gameId||null,status:'collector_error',
     error:String(e?.name==='TimeoutError'||e?.name==='AbortError'?'timeout':e?.message||'unknown').slice(0,110)}}
  }
 }));
 return out;
}

// Sanitize HTTP failures for the public collector audit: never publish raw
// upstream payloads, API keys, request headers, or provider error strings.
export function nflMarketFailureDetails(httpStatus,payload){
 const status=Number(httpStatus),http=Number.isInteger(status)&&status>=100&&status<=599?status:null;
 const message=String(payload?.error||'').slice(0,250);
 let failureCode='MARKET_RESPONSE_NOT_OK';
 if(/deadline|timed? ?out|abort/i.test(message))failureCode='MARKET_REQUEST_TIMEOUT';
 else if(/Cannot read properties|TypeError|ReferenceError|SyntaxError/i.test(message))
  failureCode='MARKET_RUNTIME_ERROR';
 else if(http===429||/rate.limit|out.of.usage.credits/i.test(message))
  failureCode='MARKET_RATE_LIMITED';
 else if(http===401||http===403)failureCode='MARKET_AUTH_REJECTED';
 else if(http!==null&&http>=500)failureCode='MARKET_SERVICE_UNAVAILABLE';
 return{httpStatus:http,failureCode};
}
