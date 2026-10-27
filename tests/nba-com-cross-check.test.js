import test from 'node:test';
import assert from 'node:assert/strict';
import {nbaCrossCheckProjections} from '../lib/nba-com-cross-check.js';
test('NBA.com cross-check preserves model projection and flags major differences',()=>{
 const rows=nbaCrossCheckProjections([{name:'Test Player',category:'points',projection:30}],
 [{name:'Test Player',season:'2026-27',samples:3,recent:[{points:10},{points:11},{points:12}]}]);
 assert.equal(rows[0].projection,30);
 assert.equal(rows[0].nbaComCrossCheck.status,'REVIEW_REQUIRED');
 assert.equal(rows[0].nbaComCrossCheck.recentMean,11);
});
test('NBA.com missing samples cannot invent market verification',()=>{
 const rows=nbaCrossCheckProjections([{name:'Test Player',category:'rebounds',projection:8}],[]);
 assert.equal(rows[0].nbaComCrossCheck.status,'UNAVAILABLE');
 assert.equal(rows[0].marketVerified,undefined);
});
