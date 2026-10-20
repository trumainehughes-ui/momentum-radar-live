import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../lib/nba-pregame-model.js',import.meta.url),'utf8');
test('NBA parlay research ranks by historical hit rates and model cushions',()=>{
 assert.match(src,/historicalHitRate/);
 assert.match(src,/projectionCushion/);
 assert.match(src,/b\.historicalHitRate-a\.historicalHitRate/);
 assert.match(src,/risk==='Small'\?c\.projection>=c\.threshold/);
 assert.match(src,/HISTORICAL_HIT_RATE_AND_PROJECTION_CUSHION_NO_POPULARITY/);
});
test('raw historical samples are not exposed in public projections',()=>{
 assert.match(src,/playerProjections:candidates\.slice\(0,40\)\.map\(\(\{historicalValues,\.\.\.p\}\)=>p\)/);
});
