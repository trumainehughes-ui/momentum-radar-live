import test from 'node:test';
import assert from 'node:assert/strict';
import {nbaCrossCheckProjections} from '../lib/nba-com-cross-check.js';

test('NBA.com projection blend requires matching team and player',()=>{
 const projections=[{name:'Sample Player',team:'PHX',category:'points',projection:20}];
 const wrong=[{name:'Sample Player',team:'CHA',samples:3,recent:[{points:21},{points:22}]}];
 const held=nbaCrossCheckProjections(projections,wrong)[0];
 assert.equal(held.projection,20);
 assert.equal(held.nbaComCrossCheck.status,'UNAVAILABLE');
 const right=[{...wrong[0],team:'PHX'}];
 const blended=nbaCrossCheckProjections(projections,right)[0];
 assert.equal(blended.nbaComCrossCheck.appliedToProjection,true);
 assert.ok(blended.projection>20);
});
