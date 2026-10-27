import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const game=readFileSync(new URL('../api/nba-game.js',import.meta.url),'utf8');
const publicUi=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
test('NBA game endpoint exposes independent model projections while keeping SGP readiness separate',()=>{
 assert.match(game,/data\.playerProjections=data\.status==='SCHEDULED'&&/);
 assert.match(game,/historicalSnapshotStale:!current/);
 assert.match(game,/marketVerified:false,modelOnly:true/);
 assert.match(game,/data\.sgps=current\?snapshot\.sgps/);
});
test('public NBA page shows research estimates without inventing sportsbook lines',()=>{
 assert.match(publicUi,/function nbaResearchCandidates/);
 assert.match(publicUi,/function nbaResearchRow/);
 assert.match(publicUi,/if\(!legs\.length&&research\.length\)/);
 assert.match(publicUi,/Not a sportsbook offer or confirmed starter/);
});
