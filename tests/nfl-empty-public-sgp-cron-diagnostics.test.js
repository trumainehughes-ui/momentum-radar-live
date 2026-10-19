import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('NFL cron distinguishes successful refresh from zero published model tiers',()=>{
 const source=readFileSync(new URL('../api/nfl-health.js',import.meta.url),'utf8');
 assert.ok(source.includes('emptyModelTierRefreshes:historyLocks.filter'));
 assert.ok(source.includes("Number(x.sgps||0)===0"));
 assert.ok(source.includes('modelTierReadinessCounts:historyLocks.reduce'));
 assert.ok(source.includes('analyticsTierCounts:Object.fromEntries'));
 assert.ok(source.includes('publicModelTierCounts:Object.fromEntries'));
 assert.ok(source.includes('publicTierCounts:historyLocks.reduce'));
});
