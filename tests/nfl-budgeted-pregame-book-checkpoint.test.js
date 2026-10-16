import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nflPricingCheckpointStage,validNflCheckpointToken,
 runNflScheduledBookCheckpoint,NFL_CHECKPOINT_DAILY_SLOTS,
 NFL_CHECKPOINT_MAX_QUOTES} from '../lib/nfl-scheduled-book-checkpoint.js';
import {chooseNflCheckpointQuotes} from '../lib/nfl-checkpoint-quote-selection.js';
const kickoff='2026-10-11T17:00:00Z',dayAhead=Date.parse('2026-10-10T18:00:00Z'),
 thirty=Date.parse('2026-10-11T16:30:00Z');
const game=(id='401872992')=>({gameId:id,kickoff,status:'SCHEDULED'});
const fakeStore=()=>{
 const keys=new Set(),puts=[];
 return{keys,puts,putBlob:async(path,value,options)=>{
  assert.equal(options.allowOverwrite,path.includes('/outcomes/'),
   'only observational outcome audits may be overwritten');
  if(keys.has(path)&&!options.allowOverwrite)throw Error('conflict');
  keys.add(path);puts.push({path,value:JSON.parse(value)});
 }};
};
const opts=(store,now=dayAhead)=>({now,base:'https://momentum-radar-live.vercel.app',
 secret:'example-only-secret',configured:true,putBlob:store.putBlob,
 createToken:()=>('a'.repeat(64)),
 fetchMarket:async(url,request)=>{
  assert.ok(url.includes('verifiedChange=1&changeType=scheduled_checkpoint'));
  assert.equal(request.headers.Authorization,'Bearer example-only-secret');
  assert.equal(request.headers['x-momentum-change-token'],'a'.repeat(64));
  return{ok:true,json:async()=>({ok:true,gameId:'401872992',sgps:{Analytics:[]}})};
 }});
test('only the previous NFL game-date and T-minus-30 qualify for a paid checkpoint',()=>{
 assert.equal(nflPricingCheckpointStage(game(),{now:dayAhead}),'DAY_AHEAD');
 assert.equal(nflPricingCheckpointStage(game(),{now:thirty}),'FINAL_T_MINUS_30');
 assert.equal(nflPricingCheckpointStage(game(),{now:thirty-1000}),null);
 assert.equal(nflPricingCheckpointStage(game(),{now:Date.parse('2026-10-11T13:00:00Z')}),null);
 assert.equal(nflPricingCheckpointStage(game(),{now:Date.parse('2026-10-11T17:01:00Z')}),null);
 assert.equal(nflPricingCheckpointStage({...game(),status:'LIVE'},{now:thirty}),null);
 assert.equal(nflPricingCheckpointStage({...game(),gameId:'bad'},{now:dayAhead}),null);
});
test('both authorized stages mint bounded one-use tokens and do not repeat charges',async()=>{
 const store=fakeStore(),first=await runNflScheduledBookCheckpoint(game(),opts(store));
 assert.equal(first.status,'MARKET_REFRESHED');
 assert.equal(first.stage,'DAY_AHEAD');
 assert.equal(first.marketResponse?.gameId,'401872992');
 const token=store.puts.find(p=>p.path.includes('momentum-nfl-change-tokens/v1/'));
 assert.ok(token);
 assert.equal(validNflCheckpointToken(token.value,'401872992',{now:dayAhead}),true);
 assert.equal(validNflCheckpointToken(token.value,'401872993',{now:dayAhead}),false);
 assert.equal(validNflCheckpointToken(token.value,'401872992',{now:dayAhead+16*60000}),false);
 const repeat=await runNflScheduledBookCheckpoint(game(),opts(store));
 assert.equal(repeat.status,'ALREADY_ATTEMPTED_OR_STORE_UNAVAILABLE');
 const finalStore=fakeStore(),final=await runNflScheduledBookCheckpoint(
  game(),opts(finalStore,thirty));
 assert.equal(final.status,'MARKET_REFRESHED');
 assert.equal(final.stage,'FINAL_T_MINUS_30');
});
test('unsigned and unconfigured checkpoint cannot generate provider calls',async()=>{
 const s=fakeStore();let invoked=0;
 const no=await runNflScheduledBookCheckpoint(game(),{
  ...opts(s),configured:false,fetchMarket:async()=>{invoked++}});
 assert.equal(no.status,'NOT_CONFIGURED');
 assert.equal(s.puts.length,0);
 const bad=await runNflScheduledBookCheckpoint(game(),{
  ...opts(s),base:'https://evil.vercel.app',
  fetchMarket:async()=>{invoked++}});
 assert.equal(bad.status,'UNTRUSTED_ORIGIN');
 assert.equal(s.puts.length,0);
 assert.equal(invoked,0);
});
test('shared create-only budget admits at most 15 checkpoints per UTC day across shards',async()=>{
 const store=fakeStore();let calls=0;
 for(let n=0;n<16;n++){
  const id=String(401872980+n),g=game(id);
  const r=await runNflScheduledBookCheckpoint(g,{
   ...opts(store),createToken:()=>String(n).padStart(64,'a').replace(/^a+/,'b'.repeat(64-String(n).length)),
   fetchMarket:async()=>{calls++;return{ok:true,json:async()=>({ok:true,gameId:id})}}
  });
  assert.equal(r.status,n<NFL_CHECKPOINT_DAILY_SLOTS?
   'MARKET_REFRESHED':'DAILY_CHECKPOINT_BUDGET_EXHAUSTED');
 }
 assert.equal(calls,NFL_CHECKPOINT_DAILY_SLOTS);
 assert.equal(store.puts.filter(x=>x.path.includes('/budget/')).length,NFL_CHECKPOINT_DAILY_SLOTS);
 assert.equal(NFL_CHECKPOINT_DAILY_SLOTS*(2+NFL_CHECKPOINT_MAX_QUOTES),75);
});
test('Sunday day-ahead and final checkpoints are budgeted on different UTC days',()=>{
 const kickoff='2026-10-18T17:00:00Z',g={gameId:'401872999',kickoff,status:'SCHEDULED'};
 const dayAhead=Date.parse('2026-10-17T18:00:00Z');
 const final=Date.parse('2026-10-18T16:45:00Z');
 assert.equal(nflPricingCheckpointStage(g,{now:dayAhead}),'DAY_AHEAD');
 assert.equal(nflPricingCheckpointStage(g,{now:final}),'FINAL_T_MINUS_30');
 assert.notEqual(new Date(dayAhead).toISOString().slice(0,10),
  new Date(final).toISOString().slice(0,10));
 // The Sunday-night game starts after midnight UTC on Monday, so the
 // twelve final checkpoints are spread across two UTC budget days.
 const sundayKickoffs=[
  '2026-10-18T13:30:00Z',
  ...Array(7).fill('2026-10-18T17:00:00Z'),
  '2026-10-18T20:05:00Z',
  ...Array(2).fill('2026-10-18T20:25:00Z'),
  '2026-10-19T00:20:00Z'
 ];
 assert.equal(sundayKickoffs.length,12);
 const byUtcDay=new Map();
 for(const kickoff of sundayKickoffs){
  const g={gameId:'401872999',kickoff,status:'SCHEDULED'};
  const at=Date.parse(kickoff)-15*60000;
  assert.equal(nflPricingCheckpointStage(g,{now:at}),'FINAL_T_MINUS_30');
  const day=new Date(at).toISOString().slice(0,10);
  byUtcDay.set(day,(byUtcDay.get(day)||0)+1);
 }
 assert.deepEqual(Object.fromEntries(byUtcDay),{
  '2026-10-18':11,'2026-10-19':1
 });
 assert.ok([...byUtcDay.values()].every(count=>count<=NFL_CHECKPOINT_DAILY_SLOTS));
});
test('checkpoint max three quotes spans both books and covers three tier names',()=>{
 const cards=['DraftKings','FanDuel'].flatMap(book=>
  ['Small','Medium','Nuke'].map(risk=>({book,risk})));
 const a=chooseNflCheckpointQuotes(cards,{gameId:'401872992',stage:'DAY_AHEAD'});
 assert.equal(a.length,3);
 assert.deepEqual(new Set(a.map(x=>x.risk)),new Set(['Small','Medium','Nuke']));
 assert.equal(new Set(a.map(x=>x.book)).size,2);
 const b=chooseNflCheckpointQuotes(cards,{gameId:'401872992',stage:'FINAL_T_MINUS_30'});
 assert.equal(b.length,3);
 assert.notDeepEqual(a.map(x=>x.book),b.map(x=>x.book));
 assert.equal(chooseNflCheckpointQuotes([],{gameId:'401872992'}).length,0);
});
test('production cron, provider, quote and market endpoints enforce stage and quota',()=>{
 const health=readFileSync(new URL('../api/nfl-health.js',import.meta.url),'utf8');
 const market=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 const provider=readFileSync(new URL('../api/prop-line-markets.js',import.meta.url),'utf8');
 const quote=readFileSync(new URL('../api/prop-line-sgp-quote.js',import.meta.url),'utf8');
 assert.ok(health.includes('runNflScheduledBookCheckpoint(g,{'));
 assert.ok(health.includes('bookCheckpoint.marketResponse||await r.json()'));
 assert.ok(health.includes("injuryWatch.modelRefreshStatus==='completed'"));
 assert.ok(market.includes("'scheduled_checkpoint'"));
 assert.ok(market.includes('chooseNflCheckpointQuotes(candidates,'));
 assert.ok(provider.includes('validNflCheckpointToken(tokenRecord,req.query.gameId)'));
 assert.ok(quote.includes('validNflCheckpointToken(record,gameId)'));
 assert.ok(quote.includes('slot<NFL_CHECKPOINT_MAX_QUOTES'));
 assert.ok(quote.includes('allowOverwrite:false'));
 assert.ok(!health.includes("req.headers?.host||'momentum-radar-live.vercel.app'"));
});
