import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {collectorAuditReport} from '../lib/pregame-collector-shards.js';
test('NBA collector persists projection counts in the actual audit',()=>{
 const audit=collectorAuditReport('nba',0,[{gameId:'401000001',status:'MODEL_ONLY',projectionCount:22,sampleSource:'PRIOR_SEASON'}]);
 assert.equal(audit.results[0].projectionCount,22);
 assert.equal(audit.results[0].sampleSource,'PRIOR_SEASON');
 const nfl=collectorAuditReport('nfl',0,[{gameId:'401000001',status:'locked',projectionCount:22}]);
 assert.equal(nfl.results[0].projectionCount,null);
});
test('public NBA health route reads audits without exposing credentials',()=>{
 const src=readFileSync(new URL('../api/public-nba-collector-health.js',import.meta.url),'utf8');
 assert.match(src,/readCollectorAudits\('nba'\)/);
 assert.match(src,/publicNbaCollectorHealth\(shard\)/);
 assert.doesNotMatch(src,/CRON_SECRET|BLOB_READ_WRITE_TOKEN/);
});
