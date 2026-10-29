import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('public NFL adaptive research tiers cannot imply a playable or quoted ticket',()=>{
 const source=readFileSync(new URL('../api/public-nfl-game.js',import.meta.url),'utf8');
 assert.match(source,/modelTierStatus=PUBLIC_NFL_TIERS\.map/);
 assert.match(source,/playable:false,bookmakerCombinedPriceVerified:false/);
 assert.match(source,/MODEL_RESEARCH_INCOMPLETE/);
 assert.match(source,/NO_VALID_MODEL_TIER/);
});
