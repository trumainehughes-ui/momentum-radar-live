import test from 'node:test';
import assert from 'node:assert/strict';
import {publicNbaProjectionProvenance} from '../lib/public-nba-starter-status.js';
test('public NBA model provenance labels previous-season research without claiming sportsbook offers',()=>{
 const result=publicNbaProjectionProvenance({sampleSource:'PRIOR_SEASON',playerProjections:[{name:'Sample Player'}]});
 assert.equal(result.sample,'PREVIOUS-SEASON BASELINE');
 assert.equal(result.modelReady,true);
 assert.match(result.label,/NOT A VERIFIED SPORTSBOOK LINE/);
});
test('public NBA model provenance leaves empty snapshots explicitly unready',()=>{
 const result=publicNbaProjectionProvenance({playerProjections:[]});
 assert.equal(result.modelReady,false);
 assert.equal(result.projectionCount,0);
});
