import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 BDL_LEAGUES,bdlFreeEndpoint,bdlSanitize,bdlTeamAbbr,
 bdlIsoDay,bdlRefreshDaily,bdlFreeReport,bdlCompareGames,bdlFetchFree
} from '../lib/balldontlie-free.js';
import cron from '../api/bdl-refresh.js';

const makeRes=()=>({code:200,headers:{},setHeader(k,v){this.headers[k]=v;return this},
 status(code){this.code=code;return this},json(v){this.body=v;return this}});
const date='2026-10-11',now=Date.parse('2026-10-11T13:00:00Z');
const mockGame=(league,type)=>{
 if(type==='teams')return {data:[
  {id:18,abbreviation:'PHI',full_name:'Philadelphia Eagles'},
  {id:22,abbreviation:league==='nfl'?'JAC':'BOS',full_name:league==='nfl'?'Jacksonville Jaguars':'Boston Celtics'}]};
 if(league==='nfl')return {data:[{id:100,home_team:{abbreviation:'JAC'},visitor_team:{abbreviation:'PHI'},
   date:'2026-10-11T17:00:00Z',status_state:'scheduled',
   odds:{price:999,apiKey:'must-not-leak'}}],meta:{next_cursor:null}};
 return {data:[{id:101,home_team:{abbreviation:'BOS'},visitor_team:{abbreviation:'PHI'},
   date:'2026-10-11',status_state:'scheduled'}],meta:{next_cursor:null}};
};
test('only free NFL and NBA teams/games URLs are ever generated',()=>{
 assert.deepEqual(BDL_LEAGUES,['nfl','nba']);
 assert.equal(bdlFreeEndpoint('nfl','teams'),'https://api.balldontlie.io/nfl/v1/teams');
 assert.equal(bdlFreeEndpoint('nba','teams'),'https://api.balldontlie.io/v1/teams');
 assert.match(bdlFreeEndpoint('nfl','games',date),/nfl\/v1\/games\?dates%5B%5D=2026-10-11/);
 assert.match(bdlFreeEndpoint('nba','games',date),/\/v1\/games\?dates%5B%5D=2026-10-11/);
 assert.match(bdlFreeEndpoint('nba','games','2026-10-10'),/season_type=preseason/);
 for(const endpoint of ['injuries','stats','odds','player_props','advanced_stats','roster'])
  assert.throws(()=>bdlFreeEndpoint('nfl',endpoint,date));
 assert.throws(()=>bdlFreeEndpoint('mlb','teams'));
 assert.throws(()=>bdlFreeEndpoint('nba','games','x'));
 assert.equal(bdlTeamAbbr('JAC'),'JAX');
 assert.equal(bdlIsoDay(new Date('2026-10-12T02:00:00Z')),'2026-10-11');
});
test('sanitize keeps only basic reference data and never exposes raw API props or tokens',()=>{
 const raw=mockGame('nfl','games');
 const v=bdlSanitize('nfl','games',raw,{date,now});
 assert.equal(v.items.length,1);
 assert.equal(v.items[0].home,'JAX');
 assert.equal(v.items[0].away,'PHI');
 assert.equal(v.complete,true);
 assert.ok(!JSON.stringify(v).includes('price'));
 assert.ok(!JSON.stringify(v).includes('must-not-leak'));
 const incomplete=bdlSanitize('nba','games',{...mockGame('nba','games'),meta:{next_cursor:10}},{date,now});
 assert.equal(incomplete.complete,false);
 assert.throws(()=>bdlSanitize('nfl','games',{data:null},{date,now}));
});
test('free endpoint sends the key in Authorization header, never in URL',async()=>{
 const seen=[];
 const output=await bdlFetchFree('nfl','teams',date,'test-secret',{fetcher:async(url,opts)=>{
  seen.push({url,headers:opts.headers});return{ok:true,json:async()=>mockGame('nfl','teams')}
 }});
 assert.equal(output.type,'teams');
 assert.equal(seen.length,1);
 assert.equal(seen[0].headers.Authorization,'test-secret');
 assert.ok(!seen[0].url.includes('test-secret'));
 assert.ok(!JSON.stringify(output).includes('test-secret'));
});
test('BDL 401 and 429 are explicit and never silently retried',async()=>{
 for(const [code,label] of [[401,'bdl_key_or_tier_denied'],[429,'bdl_rate_limited']]){
  let calls=0;
  await assert.rejects(()=>bdlFetchFree('nba','games',date,'key',{fetcher:async()=>{
   calls++;return{ok:false,status:code}
  }}),new RegExp(label));
  assert.equal(calls,1);
 }
});
test('daily refresh makes at most four requests across BOTH leagues and uses persistent cache',async()=>{
 const store=new Map(),calls=[],writes=[];
 const opts={date,now,
  read:async(l,t,d)=>store.get(l+'-'+t+(t==='games'?'-'+d:''))||null,
  write:async(l,t,d,snap)=>{writes.push([l,t]);store.set(l+'-'+t+(t==='games'?'-'+d:''),snap)},
  fetchFree:async(l,t,d,key)=>{calls.push([l,t]);return bdlSanitize(l,t,mockGame(l,t),{date:d,now})}
 };
 const first=await bdlRefreshDaily('key',opts);
 assert.equal(first.upstreamRequests,4);
 assert.deepEqual(calls,[['nfl','teams'],['nfl','games'],['nba','teams'],['nba','games']]);
 assert.equal(writes.length,4);
 const second=await bdlRefreshDaily('key',opts);
 assert.equal(second.upstreamRequests,0);
 assert.equal(calls.length,4);
 const nextDay=await bdlRefreshDaily('key',{...opts,date:'2026-10-12',now:now+86400000});
 assert.equal(nextDay.upstreamRequests,2,'teams should remain in 21-day cache');
 assert.equal(nextDay.reports[0].updated[0],'games');
});
test('one league failing does not suppress the other; no runaway fallback requests',async()=>{
 const store=new Map(),calls=[];
 const x=await bdlRefreshDaily('key',{date,now,
  read:async()=>null,write:async(l,t,d,value)=>store.set(l+t,value),
  fetchFree:async(l,t,d)=>{calls.push(l+'/'+t);if(l==='nfl'&&t==='games')throw Error('bdl_rate_limited');
   return bdlSanitize(l,t,mockGame(l,t),{date:d,now});}
 });
 assert.equal(x.upstreamRequests,4);
 assert.equal(x.reports[0].errors[0].reason,'bdl_rate_limited');
 assert.deepEqual(x.reports[1].updated,['teams','games']);
 assert.equal(calls.length,4);
});
test('ESP N canonical slate remains independent, cache crosschecks are observational only',async()=>{
 const games=[{home:{abbr:'JAX'},away:{abbr:'PHI'}},
  {home:{abbr:'BUF'},away:{abbr:'KC'}}];
 const reference=bdlSanitize('nfl','games',mockGame('nfl','games'),{date,now});
 assert.deepEqual(bdlCompareGames(games,reference),{matched:1,checked:2,sourceGames:1,complete:true,unmatched:1});
 const data=await bdlFreeReport('nfl',date,games,{
  now,read:async(l,t)=>t==='teams'?bdlSanitize(l,t,mockGame(l,t),{now}):reference
 });
 assert.equal(data.state,'CACHED');
 assert.equal(data.gameCrosscheck.matched,1);
 assert.equal(data.containsPlayerStats,false);
 assert.equal(data.containsPlayerProps,false);
 assert.equal(data.containsOdds,false);
 const noCache=await bdlFreeReport('nba',date,games,{now,read:async()=>null});
 assert.equal(noCache.state,'PENDING');
});
test('cron rejects public traffic without spending a single BDL request or disclosing keys',async()=>{
 const previous=process.env.CRON_SECRET,previousApi=process.env.BALLDONTLIE_API_KEY;
 process.env.CRON_SECRET='test-cron-secret';
 process.env.BALLDONTLIE_API_KEY='test-api-secret';
 const orig=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;throw Error('unexpected external request')};
 try{
  let res=makeRes();
  await cron({method:'GET',headers:{},query:{cron:'1'}},res);
  assert.equal(res.code,401);
  assert.equal(calls,0);
  assert.ok(!JSON.stringify(res.body).includes('test-cron-secret'));
  res=makeRes();
  await cron({method:'POST',headers:{authorization:'Bearer test-cron-secret'}},res);
  assert.equal(res.code,405);
  res=makeRes();
  await cron({method:'GET',headers:{authorization:'Bearer wrong-key'}},res);
  assert.equal(res.code,401);
  assert.equal(calls,0);
 }finally{
  globalThis.fetch=orig;
  if(previous===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=previous;
  if(previousApi===undefined)delete process.env.BALLDONTLIE_API_KEY;else process.env.BALLDONTLIE_API_KEY=previousApi;
 }
});
test('existing 15-min NFL collector remains untouched; BDL cron is daily and separate',()=>{
 const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.ok(config.crons.some(x=>x.path==='/api/nfl-health?cron=1'&&x.schedule==='*/15 * * * *'));
 assert.ok(config.crons.some(x=>x.path==='/api/bdl-refresh'&&x.schedule==='0 12 * * *'));
 const nfl=readFileSync(new URL('../api/nfl-schedule.js',import.meta.url),'utf8');
 const nba=readFileSync(new URL('../api/nba-slate.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../public-nba.js',import.meta.url),'utf8');
 assert.ok(nfl.includes("await bdlFreeReport('nfl',date,games)"));
 assert.ok(nba.includes("await bdlFreeReport('nba',data.date,data.games)"));
 assert.ok(html.includes("d.ballDontLieFree?.state"));
 assert.ok(ui.includes("data.ballDontLieFree?.state"));
 assert.ok(!nfl.includes('bdlRefreshDaily('));
 assert.ok(!nba.includes('bdlRefreshDaily('));
 assert.ok(!nfl.includes('BALLDONTLIE_API_KEY'));
 assert.ok(!nba.includes('BALLDONTLIE_API_KEY'));
});
