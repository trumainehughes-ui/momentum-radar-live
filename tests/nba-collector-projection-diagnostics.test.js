import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../api/nba-health.js',import.meta.url),'utf8');
test('NBA cron response reports model projection counts and empty game causes',()=>{
 assert.match(src,/projectionCount:Array\.isArray\(result\.playerProjections\)/);
 assert.match(src,/emptyProjectionGames:reports\.filter/);
 assert.match(src,/sampleSource:r\.sampleSource/);
 assert.match(src,/collectorErrors:reports\.filter/);
});
test('NBA collector remains cron-authenticated and stored evidence stays gated',()=>{
 assert.match(src,/authorized\(req,process\.env\.CRON_SECRET\)/);
 assert.match(src,/blobCredentialMode\(process\.env\)/);
 assert.match(src,/await write\(result\)/);
});
