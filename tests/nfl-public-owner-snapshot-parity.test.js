import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import { NFL_SGP_SNAPSHOT_SCHEMA, nflSgpSnapshotKey,nflSgpSnapshotPath } from '../lib/nfl-sgp-snapshot-status.js';
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
test('source URL and provider identifiers remain private after server attestation',()=>{
 assert.match(view,/attested:true,available:true/);
 assert.match(view,/bookOffer:offer/);
 assert.match(page,/o\.attested!==true/);
 assert.doesNotMatch(view,/sourceUrl:url,available:true/);
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
 assert.ok(code.indexOf('await put(')<code.indexOf('RESPONSE_CACHE.set(key,{snapshot:snap'));
});

test('FanDuel and DraftKings source rows are resolved independently',()=>{
 assert.match(view,/function safeOffer\(x,now,requiredBook=null\)/);
 assert.match(view,/offers\.find\(o=>o\.book===requiredBook\)/);
 assert.match(view,/safeOffer\(source,now,q\.book\)/);
});

test('owner market writer and public reader use the exact same NFL Blob key',()=>{
 assert.ok(NFL_SGP_SNAPSHOT_SCHEMA.includes('strict-no-unlisted-sgp-props-20261017'));
 assert.match(writer,/nflSgpSnapshotKey\(date,gameId\)/);
 assert.match(writer,/const responseKey=gameId\?nflSgpSnapshotKey\(date,gameId\)/);
 assert.match(api,/const path=nflSgpSnapshotPath\(date,gameId\)/);
 const date='2026-10-18',gameId='401873004';
 const key=nflSgpSnapshotKey(date,gameId);
 assert.equal(nflSgpSnapshotPath(date,gameId),
  'momentum-nfl-markets/v2/'+encodeURIComponent(key)+'.json');
});
test('owner does not claim a new published update on Blob write failure',()=>{
 assert.match(writer,/if\(!publishedAt\)return res\.status\(503\)/);
 assert.match(writer,/X-Momentum-Snapshot-Version/);
 assert.match(writer,/requestStage='snapshot_publish'/);
});
test('public cannot use an alternate compact model-only SGP renderer',()=>{
 assert.doesNotMatch(page,/publicCompact\.renderPublicCompactNflSgpCards\(/);
 assert.match(page,/return intro\+staleNote\+slips\+verification\+research/);
});
