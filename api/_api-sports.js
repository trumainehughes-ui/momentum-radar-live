const BASE={nba:'https://v2.nba.api-sports.io',nfl:'https://v1.american-football.api-sports.io'};
const memory=new Map();
const inflight=new Map();
const DAY=86400000;
let budget={day:'',used:0};
function day(){return new Date().toISOString().slice(0,10)}
function resetBudget(){const d=day();if(budget.day!==d)budget={day:d,used:0}}
function ttlFor(kind){return {schedule:21600000,teams:43200000,players:43200000,standings:21600000,injuries:1800000,stats:3600000,live:120000}[kind]||3600000}
function safePath(x){return String(x||'').replace(/^\/+|\/+$/g,'')}
async function upstream(sport,path,query){
  resetBudget();
  if(budget.used>=80)throw new Error('api_sports_daily_reserve');
  const key=process.env.API_SPORTS_KEY;
  if(!key)throw new Error('missing_api_sports_key');
  const base=BASE[sport];
  if(!base)throw new Error('unsupported_sport');
  const u=new URL(base+'/'+safePath(path));
  for(const [k,v] of Object.entries(query||{}))if(v!==undefined&&v!==null&&v!=='')u.searchParams.set(k,String(v));
  budget.used++;
  const r=await fetch(u,{headers:{'x-apisports-key':key},cache:'no-store'});
  const remaining=r.headers.get('x-ratelimit-requests-remaining');
  if(!r.ok)throw new Error('api_sports_'+r.status);
  return {data:await r.json(),remaining:remaining==null?null:Number(remaining)};
}
export async function apiSports({sport,path,query={},kind='stats',force=false}){
  const key=sport+'|'+path+'|'+JSON.stringify(query);
  const now=Date.now(),ttl=ttlFor(kind),hit=memory.get(key);
  if(!force&&hit&&now-hit.at<ttl)return {...hit.value,cache:'HIT',ageSeconds:Math.floor((now-hit.at)/1000)};
  if(inflight.has(key))return inflight.get(key);
  const p=(async()=>{try{
    const value=await upstream(sport,path,query);
    const wrapped={...value,cache:'MISS',fetchedAt:new Date().toISOString(),budgetUsed:budget.used,budgetSoftLimit:80,budgetDailyLimit:100};
    memory.set(key,{at:Date.now(),value:wrapped});
    return wrapped;
  }catch(e){
    if(hit&&Date.now()-hit.at<DAY)return {...hit.value,cache:'STALE',stale:true,error:String(e.message||e),ageSeconds:Math.floor((Date.now()-hit.at)/1000)};
    throw e;
  }finally{inflight.delete(key)}})();
  inflight.set(key,p);return p;
}
export function apiSportsStatus(){resetBudget();return {configured:Boolean(process.env.API_SPORTS_KEY),budgetUsed:budget.used,budgetSoftLimit:80,budgetDailyLimit:100,day:budget.day}}
