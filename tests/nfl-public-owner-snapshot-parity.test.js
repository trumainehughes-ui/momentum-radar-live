import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const view=readFileSync(new URL('../lib/public-nfl-view.js',import.meta.url),'utf8');
const page=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
const api=readFileSync(new URL('../api/public-nfl-game.js',import.meta.url),'utf8');
const writer=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
test('public and owner use the same canonical sportsbook SGP source',()=>{
 assert.match(view,/const verifiedParlays=verifiedQuotes\.map/);
 assert.match(view,/parlays:stale\?\[\]:verifiedParlays/);
 assert.match(page,/const candidateModels=Array\.isArray\(d\.parlays\)\?d\.parlays:\[\]/);
 assert.doesNotMatch(page,/getJson\('\/api\/nfl-markets\?/);
});
test('verified offer provenance survives public serialization',()=>{
 assert.match(view,/sourceUrl:url,available:true/);
 assert.match(view,/bookOffer:offer/);
 assert.match(page,/o\.sourceUrl/);
});
test('public response cannot cache older active SGP versions',()=>{
 assert.match(api,/private, no-store, max-age=0/);
 assert.match(api,/X-Momentum-Snapshot-Version/);
 assert.match(page,/setInterval\(refreshReadOnlyPredictions,30\*1000\)/);
 assert.match(page,/incoming<shown/);
});
test('owner only caches a snapshot after successful shared publication',()=>{
 const start=writer.indexOf('async function writeResponseSnapshot(');
 const end=writer.indexOf('const RAW_SNAP_PREFIX',start);
 const code=writer.slice(start,end);
 assert.ok(code.indexOf('await put(')<code.indexOf('RESPONSE_CACHE.set(key,snap)'));
});
