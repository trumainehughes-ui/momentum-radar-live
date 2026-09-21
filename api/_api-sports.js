const BASE={nba:'https://v2.nba.api-sports.io',nfl:'https://v1.american-football.api-sports.io'};
const memory=new Map(),inflight=new Map(),DAY=86400000;
let budget={day:'',used:0,remaining:null,minuteRemaining:null};
function day(){return new Date().toISOString().slice(0,10)}
function resetBudget(){const d=day();if(budget.day!==d)budget={day:d,used:0,remaining:null,minuteRemaining:null}}
function ttlFor(kind,phase='normal'){
  const base={schedule:21600000,teams:43200000,players:43200000,standings:21600000,injuries:1800000,stats:3600000,live:900000}[kind]||3600000;
  if(phase==='pregame')return kind==='injuries'?1800000:kind==='schedule'?5400000:base;
  if(phase==='final90')return kind==='injuries'?1200000:kind==='players'?3600000:Math.min(base,1800000);
  if(phase==='final30')return kind==='injuries'?900000:Math.min(base,1800000);
  if(phase==='live')return kind==='live'?900000:Math.max(base,3600000);
  return base
}
function safePath(x){return String(x||'').replace(/^\/+|\/+$/g,'')}
function quotaLow(){return budget.used>=80||(Number.isFinite(budget.remaining)&&budget.remaining<=20)}
async function upstream(sport,path,query,priority='normal'){
  resetBudget();
  if(quotaLow()&&priority!=='critical')throw new Error('api_sports_daily_reserve');
  if(budget.used>=95)throw new Error('api_sports_hard_reserve');
  const key=process.env.API_SPORTS_KEY;if(!key)throw new Error('missing_api_sports_key');
  const base=BASE[sport];if(!base)throw new Error('unsupported_sport');
  const u=new URL(base+'/'+safePath(path));
  for(const [k,v] of Object.entries(query||{}))if(v!==undefined&&v!==null&&v!=='')u.searchParams.set(k,String(v));
  budget.used++;
  const r=await fetch(u,{headers:{'x-apisports-key':key},cache:'no-store'});
  const remaining=Number(r.headers.get('x-ratelimit-requests-remaining'));
  const minuteRemaining=Number(r.headers.get('x-ratelimit-remaining'));
  if(Number.isFinite(remaining))budget.remaining=remaining;
  if(Number.isFinite(minuteRemaining))budget.minuteRemaining=minuteRemaining;
  if(r.status===429)throw new Error('api_sports_429');
  if(!r.ok)throw new Error('api_sports_'+r.status);
  return {data:await r.json(),remaining:budget.remaining,minuteRemaining:budget.minuteRemaining}
}
export async function apiSports({sport,path,query={},kind='stats',phase='normal',priority='normal',force=false}){
  const key=sport+'|'+path+'|'+JSON.stringify(query),now=Date.now(),ttl=ttlFor(kind,phase),hit=memory.get(key);
  if(!force&&hit&&now-hit.at<ttl)return {...hit.value,cache:'HIT',ageSeconds:Math.floor((now-hit.at)/1000),phase};
  if(inflight.has(key))return inflight.get(key);
  const p=(async()=>{try{
    const value=await upstream(sport,path,query,priority);
    const wrapped={...value,cache:'MISS',phase,fetchedAt:new Date().toISOString(),budgetUsed:budget.used,budgetSoftLimit:80,budgetHardLimit:95,budgetDailyLimit:100};
    memory.set(key,{at:Date.now(),value:wrapped});return wrapped;
  }catch(e){
    if(hit&&Date.now()-hit.at<DAY)return {...hit.value,cache:'STALE',stale:true,error:String(e.message||e),ageSeconds:Math.floor((Date.now()-hit.at)/1000),phase};
    throw e;
  }finally{inflight.delete(key)}})();
  inflight.set(key,p);return p
}
export function apiSportsStatus(){resetBudget();return {configured:Boolean(process.env.API_SPORTS_KEY),budgetUsed:budget.used,reportedRemaining:budget.remaining,minuteRemaining:budget.minuteRemaining,budgetSoftLimit:80,budgetHardLimit:95,budgetDailyLimit:100,day:budget.day}}
