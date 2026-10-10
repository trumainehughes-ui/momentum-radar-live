import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NFL_MARKET_HOLDS,oddsMonthlyQuotaExhausted,sgoMonthlyQuotaExhausted,sgoRateLimitHoldMs,shouldUseSgoBackup} from '../lib/nfl-provider-rate-guard.js';

test('Odds API exhausted monthly credits trip a long-lived provider hold',()=>{
 assert.equal(oddsMonthlyQuotaExhausted({code:'OUT_OF_USAGE_CREDITS',status:401}),true);
 assert.equal(oddsMonthlyQuotaExhausted({remaining:'0',status:401}),true);
 assert.equal(oddsMonthlyQuotaExhausted({code:'INVALID_KEY',status:401}),false);
 assert.equal(oddsMonthlyQuotaExhausted({remaining:'0',status:429}),false);
 assert.equal(NFL_MARKET_HOLDS.oddsMonthlyRecheckMs,24*60*60*1000);
});
test('SportsGameOdds honors Retry-After without a retry storm',()=>{
 assert.equal(sgoRateLimitHoldMs({retryAfterSeconds:60}),15*60*1000);
 assert.equal(sgoRateLimitHoldMs({retryAfterSeconds:3600}),3600*1000);
 assert.equal(sgoRateLimitHoldMs({retryAfterSeconds:24*3600}),6*3600*1000);
});
test('SportsGameOdds exhausted monthly interval means a longer reserve hold',()=>{
 const exhausted={rateLimits:{'per-month':{maxEntitiesPerInterval:2500,currentIntervalEntities:2500}}};
 assert.equal(sgoMonthlyQuotaExhausted(exhausted),true);
 assert.equal(sgoRateLimitHoldMs({usage:exhausted}),12*3600*1000);
 assert.equal(sgoMonthlyQuotaExhausted({rateLimits:{'per-month':{maxEntitiesPerInterval:2500,currentIntervalEntities:2499}}}),false);
});
test('SGO never runs on slate, page load, ordinary refresh or day-before checks',()=>{
 const now=Date.parse('2026-10-11T16:00:00Z'),gameId='401872987';
 const kickoff=new Date(now+20*60*1000).toISOString();
 for(const cfg of [{},{gameId},{gameId,kickoff},{gameId,kickoff,finalCheck:true},
  {gameId,kickoff,lockRun:true},{gameId,kickoff,finalCheck:true,lockRun:true,primaryBooksReady:true},
  {gameId,kickoff:new Date(now+24*3600*1000).toISOString(),finalCheck:true,lockRun:true},
  {gameId,kickoff:new Date(now-60*1000).toISOString(),finalCheck:true,lockRun:true}]){
  assert.equal(shouldUseSgoBackup({...cfg,now}),false,JSON.stringify(cfg));
 }
 assert.equal(shouldUseSgoBackup({gameId,kickoff,now,finalCheck:true,lockRun:true,primaryBooksReady:false}),true);
});
test('production route guards expensive backup instead of using it as primary or on every request',()=>{
 const src=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 assert.ok(src.includes('shouldUseSgoBackup({'));
 assert.ok(src.includes('if(backupAllowed){'));
 assert.ok(src.includes('const alt=await oddsApiFallback(date,home,away)'));
 assert.ok(src.includes("readMarketHold('sgo-request-'+date)"));
 assert.ok(src.includes("writeMarketHold('sgo-request-'+date,MIN_UPSTREAM_GAP"));
 assert.ok(src.includes("while(cursor&&pages<1)"));
 assert.ok(src.includes("CACHE_SCHEMA='v87-sgo-backup-only'"));
 assert.ok(!src.includes('if(sgoEnabled){try{events=await allEvents(date)'));
 assert.ok(!src.includes('providerBackup'));
});
