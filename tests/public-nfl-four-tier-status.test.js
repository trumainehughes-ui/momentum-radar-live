import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PUBLIC_NFL_TIERS} from '../lib/public-nfl-view.js';

test('public NFL endpoint derives status for all four payout tiers, including missing snapshot tiers',()=>{
 assert.deepEqual(PUBLIC_NFL_TIERS,['Small','Medium','Large','Nuke']);
 const source=readFileSync(new URL('../api/public-nfl-game.js',import.meta.url),'utf8');
 assert.match(source,/const modelTierStatus=PUBLIC_NFL_TIERS\.map\(risk=>/);
 assert.match(source,/tier\?'MODEL_RESEARCH_INCOMPLETE':'NO_VALID_MODEL_TIER'/);
 assert.doesNotMatch(source,/\['Small','Medium','Nuke'\]\.map/);
});

test('public NFL four-tier status explicitly marks unpriced research',()=>{
 const source=readFileSync(new URL('../api/public-nfl-game.js',import.meta.url),'utf8');
 assert.match(source,/researchOnly:true/);
 assert.match(source,/playable:false,bookmakerCombinedPriceVerified:false/);
});
