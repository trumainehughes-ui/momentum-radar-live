import test from 'node:test';
import assert from 'node:assert/strict';
import {matchupSampleQuality} from '../lib/matchup-sample-quality.js';
const good={comparison:{ok:true},player:{games:4},defense:{games:5}};
test('complete independent samples are historical research, not projections',()=>{
 assert.equal(matchupSampleQuality(good),'historical_sample');
});
test('failed or omitted game summaries force limited quality',()=>{
 assert.equal(matchupSampleQuality({...good,upstreamFailures:1}),'limited');
 assert.equal(matchupSampleQuality({...good,eventsOmitted:2}),'limited');
});
test('missing comparisons or missing game counts never pass as valid evidence',()=>{
 assert.equal(matchupSampleQuality({...good,comparison:{ok:false}}),'insufficient');
 assert.equal(matchupSampleQuality({...good,defense:null}),'insufficient');
 assert.equal(matchupSampleQuality({...good,player:{games:2}}),'limited');
});
