import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const api=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('game-specific market responses never use public stale CDN price caches',()=>{
 assert.ok(api.includes("const EDGE_GOOD='public, s-maxage=60, must-revalidate'"));
 assert.ok(api.includes("const EDGE_GAME='private, no-store'"));
 assert.ok(api.includes("const clientCachePolicy=gameId?EDGE_GAME:EDGE_GOOD"));
 assert.equal((api.match(/res\.setHeader\('Cache-Control',clientCachePolicy\)/g)||[]).length,2);
 assert.ok(api.includes("CACHE_SCHEMA='v81-no-stale-market-fallback'"));
 assert.ok(!api.includes('stale-while-revalidate=21600'));
});
test('NLF game screen never calls individual prop candidates verified SGP tickets',()=>{
 assert.ok(html.includes('MODEL PICKS • COMBINED ODDS UNVERIFIED'));
 assert.ok(html.includes('they are not separately confirmed sportsbook parlays'));
 assert.ok(html.includes('Individual prop candidate • Combined price unverified'));
 assert.ok(html.includes('a bookmaker-issued correlated combined SGP quote is required'));
 assert.ok(html.includes('nflEscape(x.name)'));
 assert.ok(!html.includes('Multi-source confirmed • Momentum ranked'));
});

test('degraded feed never revives old sportsbook price snapshots',()=>{
 assert.ok(api.includes('MARKET_SNAPSHOT_TTL=15*60*1000'));
 assert.ok(api.includes('await writeResponseSnapshot(responseKey,body);'));
 assert.ok(!api.includes("X-Momentum-Cache','PERSISTENT_STALE"));
 assert.ok(!api.includes('STALE=6*60*60*1000'));
 assert.ok(!api.includes('MARKET_SNAPSHOT_TTL=24*60*60*1000'));
 assert.ok(!api.includes('stale-while-revalidate=21600'));
});
