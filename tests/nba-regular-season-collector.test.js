import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pregamePhase} from '../lib/pregame-revalidation.js';
test('NBA collector scans three dates and excludes preseason',()=>{
 const src=readFileSync(new URL('../api/nba-health.js',import.meta.url),'utf8');
 assert.match(src,/dates=\[date,addDay\(date,1\),addDay\(date,2\)\]/);
 assert.match(src,/g\.stage==='REGULAR SEASON'/);
});
test('regular-season opener is due during day-ahead window',()=>{
 const now=Date.parse('2026-10-19T15:00:00Z');
 const stage=pregamePhase({status:'SCHEDULED',kickoff:'2026-10-20T19:00:00Z'},{now});
 assert.equal(stage.due,true);
 assert.equal(stage.stage,'DAY_AHEAD_BUILD');
});
