import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NFL_RESPONSE_TTL_MS,NFL_SIGNED_COLLECTOR_TARGET_MS,
 signedNflCollectorLock,shouldServeCachedNflMarkets}
 from '../lib/nfl-market-response-cache.js';
const now=Date.parse('2026-10-11T16:00:00Z'),secret='signed-cron-test-only';
const req=(query={},authorization=null)=>({query,
 headers:{...(authorization?{authorization}:{})}});
const saved=minutes=>({at:now-minutes*60_000,body:{ok:true,gameId:'401872990'}});
const cached=(minutes,query={},auth=null)=>
 shouldServeCachedNflMarkets(saved(minutes),req(query,auth),
  {now,secret,ttl:NFL_RESPONSE_TTL_MS});
test('ordinary public game requests retain normal 15-minute cache and do not call sportsbook APIs',()=>{
 assert.equal(cached(0),true);
 assert.equal(cached(14.99),true);
 assert.equal(cached(15),false);
 assert.equal(cached(16),false);
 assert.equal(cached(14,{lockRun:'1'}),true);
 assert.equal(cached(14,{lockRun:'true'}),true);
 assert.equal(cached(14,{lockRun:'1'},'Bearer not-the-key'),true);
 assert.equal(cached(14,{verifiedChange:'1'}),true);
 assert.equal(cached(14,{verifiedChange:'1'},'Bearer wrong'),true);
 assert.equal(cached(-1),false,'future-dated cache cannot be used');
 assert.equal(shouldServeCachedNflMarkets(null,req(),{now,secret}),false);
});
test('signed collector refreshes before SGP health becomes stale across 15-minute cron jitter',()=>{
 const auth='Bearer '+secret,lock={lockRun:'1'};
 assert.equal(NFL_SIGNED_COLLECTOR_TARGET_MS,10*60_000);
 assert.equal(signedNflCollectorLock(req(lock,auth),secret),true);
 assert.equal(signedNflCollectorLock(req(lock),secret),false);
 assert.equal(cached(9.99,lock,auth),true,'recent injury-triggered rebuild can be reused');
 assert.equal(cached(10,lock,auth),false);
 assert.equal(cached(14.1,lock,auth),false,
  'cron cannot mark an old saved model fresh just before normal cache expiry');
 assert.equal(cached(14.1,{},auth),true,'signed non-cron reads still use normal cache');
});
test('verified status changes and T-minus-30 checks can explicitly force rebuild',()=>{
 assert.equal(cached(1,{verifiedChange:'1'},'Bearer '+secret),false);
 assert.equal(cached(1,{verifiedChange:'true'},'Bearer '+secret),false);
 assert.equal(cached(1,{finalCheck:'1'}),false);
 assert.equal(cached(1,{finalCheck:'true'}),false);
});
test('production collector signs per-game market refresh only inside protected cron',()=>{
 const health=readFileSync(new URL('../api/nfl-health.js',import.meta.url),'utf8');
 const markets=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 assert.ok(health.includes("url=base+'/api/nfl-markets?date='"));
 assert.ok(health.includes("'&lockRun=1&ts='+Date.now()"));
 assert.ok(health.includes("headers:{Authorization:'Bearer '+process.env.CRON_SECRET}"));
 assert.ok(markets.includes('shouldServeCachedNflMarkets(saved,req,{secret:process.env.CRON_SECRET,ttl:TTL})'));
 assert.ok(markets.includes('shouldServeCachedNflMarkets(saved,req,{secret:process.env.CRON_SECRET,ttl:TTL})'));
 assert.ok(markets.includes('const clientCachePolicy=gameId?EDGE_GAME:EDGE_GOOD'));
 assert.ok(markets.includes('const publishedAt=await writeResponseSnapshot(responseKey,publicResponse,date,gameId,requestStarted)'));
 assert.ok(health.includes('bookCheckpoint.marketResponse||await r.json()'));
 assert.ok(markets.includes("if(authorizedChange&&gameId&&!DIRECT_PUBLIC_ODDS_ONLY)"));
 assert.ok(health.includes("const injuryWatch=await checkNflScheduledInjuryChanges(g,{"));
});
