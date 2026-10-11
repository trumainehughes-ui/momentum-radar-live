import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {checkNflScheduledInjuryChanges} from '../lib/nfl-scheduled-injury-watch.js';
import {collectorAuditReport} from '../lib/pregame-collector-shards.js';
import {nflEasternDate} from '../lib/nfl-collector-readiness.js';

const game={gameId:'401872990'};
const opts={base:'https://momentum-radar-live.vercel.app',
 cronSecret:'test-only-signed-cron'};
const result=(status,changeCount=0,other={})=>({
 ok:true,gameId:game.gameId,status,
 invalidations:Array.from({length:changeCount},(_,i)=>({
  gameId:game.gameId,playerId:'secret-'+i,changeType:'player_injury'})),
 changeTokenIssued:changeCount>0,
 modelRefresh:{status:changeCount>0?'completed':'not_needed'},
 token:'a'.repeat(64),privateApiKey:'hidden',
 ...other
});
test('all NFL cron games can create a free injury baseline without triggering quotes',async()=>{
 let calls=0;
 const data=await checkNflScheduledInjuryChanges(game,{...opts,
  fetchChange:async (url,request)=>{
   calls++;
   assert.equal(url,opts.base+'/api/nfl-detect-changes');
   assert.equal(request.method,'POST');
   assert.equal(request.headers.Authorization,'Bearer '+opts.cronSecret);
   assert.deepEqual(JSON.parse(request.body),game);
   assert.equal(request.cache,'no-store');
   return{ok:true,status:200,json:async()=>result('baseline_created')};
  }});
 assert.equal(calls,1);
 assert.deepEqual(data,{status:'baseline_created',changesDetected:0,
  tokenIssued:false,modelRefreshStatus:null});
});
test('only confirmed player status changes create a short-lived signed quote authorization',async()=>{
 const data=await checkNflScheduledInjuryChanges(game,{...opts,
  fetchChange:async()=>({ok:true,status:200,json:async()=>result('compared',2)})});
 assert.equal(data.status,'compared');
 assert.equal(data.changesDetected,2);
 assert.equal(data.tokenIssued,true);
 assert.equal(data.modelRefreshStatus,'completed');
 assert.ok(!JSON.stringify(data).includes('secret-'));
 assert.ok(!JSON.stringify(data).includes('hidden'));
 assert.ok(!JSON.stringify(data).includes('aaaaaa'));
});
test('missing official ESPN injury data is not mistaken for a verified change',async()=>{
 const d=await checkNflScheduledInjuryChanges(game,{...opts,
  fetchChange:async()=>({ok:true,status:200,json:async()=>result(
   'insufficient_injury_evidence')})});
 assert.equal(d.status,'insufficient_injury_evidence');
 assert.equal(d.changesDetected,0);
 assert.equal(d.tokenIssued,false);
});
test('invalid origin, unknown game, or absent secret never makes a signed request',async()=>{
 let calls=0;
 const fetchChange=async()=>{calls++;return{ok:true,json:async()=>result('compared',1)}};
 for(const base of ['http://momentum-radar-live.vercel.app',
  'https://unrelated.vercel.app','https://evil.test',
  'https://momentum-radar-live.vercel.app.evil.test',
  'https://momentum-radar-live.vercel.app@evil.test',
  'https://momentum-radar-live.vercel.app/api/nfl-health',
  'https://momentum-radar-live.vercel.app?foo=bar']){
  const x=await checkNflScheduledInjuryChanges(game,{...opts,base,fetchChange});
  assert.equal(x.status,'UNTRUSTED_ORIGIN',base);
 }
 assert.equal((await checkNflScheduledInjuryChanges({gameId:'../../bad'},
  {...opts,fetchChange})).status,'NOT_CONFIGURED');
 assert.equal((await checkNflScheduledInjuryChanges(game,
  {...opts,cronSecret:'',fetchChange})).status,'NOT_CONFIGURED');
 assert.equal(calls,0);
});
test('down detector or misleading game response never falsely indicates material changes',async()=>{
 const bad=await checkNflScheduledInjuryChanges(game,{...opts,
  fetchChange:async()=>({ok:false,status:503})});
 assert.equal(bad.status,'DETECTOR_UNAVAILABLE');
 assert.equal(bad.tokenIssued,false);
 const network=await checkNflScheduledInjuryChanges(game,{...opts,
  fetchChange:async()=>{throw Error('secret-detailed-provider-failure')}});
 assert.equal(network.status,'DETECTOR_UNAVAILABLE');
 assert.ok(!JSON.stringify(network).includes('secret'));
 const other=await checkNflScheduledInjuryChanges(game,{...opts,
  fetchChange:async()=>({ok:true,json:async()=>result('compared',1,{
   gameId:'401872988'})})});
 assert.equal(other.status,'DETECTOR_RESPONSE_INVALID');
 assert.equal(other.changesDetected,0);
});
test('public collector audit retains only safe injury status and change counts',()=>{
 const out=collectorAuditReport('nfl',1,[{
  gameId:game.gameId,status:'updated',injuryWatch:{
   status:'compared',changesDetected:2,tokenIssued:true,
   modelRefreshStatus:'completed',playerId:'private-roster-name',
   token:'a'.repeat(64)}
 }],{due:1});
 assert.equal(out.successful,1);
 assert.deepEqual(out.results[0].injuryWatch,{
  status:'compared',changesDetected:2,tokenIssued:true,
  modelRefreshStatus:'completed'});
 assert.ok(!JSON.stringify(out).includes('private-roster-name'));
 assert.ok(!JSON.stringify(out).includes('aaaaaa'));
});
test('both cron shards check verified changes per game, not public pages or every live refresh',()=>{
 const health=readFileSync(new URL('../api/nfl-health.js',import.meta.url),'utf8');
 const detector=readFileSync(new URL('../api/nfl-detect-changes.js',import.meta.url),'utf8');
 assert.ok(health.includes('checkNflScheduledInjuryChanges(g,{'));
 assert.ok(health.includes('const injuryWatch=await checkNflScheduledInjuryChanges'));
 assert.ok(health.includes('if(cron&&assigned.length)historyLocks=await autoLock(base,assigned)'));
 assert.ok(health.includes('selectedShardGames(allDue,shard)'));
 assert.ok(!health.includes("req.headers?.host||'momentum-radar-live.vercel.app'"));
 assert.ok(detector.includes('if(prior){'));
 assert.ok(detector.includes('if(changes.length){'));
 assert.ok(detector.includes('allowOverwrite:false'));
 assert.ok(detector.includes('nflEasternDate(Number.isFinite(kickoff.getTime())?kickoff:new Date())'));
 assert.equal(nflEasternDate(new Date('2026-10-12T00:20:00Z')),'2026-10-11',
  'Sunday night must be saved and quoted against Sunday Eastern, not Monday UTC');
});
